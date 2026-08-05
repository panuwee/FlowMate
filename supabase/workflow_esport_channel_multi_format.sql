-- FlowMate + Marketing Plan: FB eSport channel and multi-format creative requests
-- Run after:
--   1. supabase/marketing_plan.sql
--   2. supabase/workflow_mvp_catalogs.sql
-- Safe to run more than once. Existing historical rows are preserved.

begin;

create or replace function public.marketing_normalize_channel(
  p_channel text
) returns text
language sql
immutable
as $function$
  select case
    when length(trim(coalesce(p_channel, ''))) = 0 then 'other'
    when lower(regexp_replace(trim(p_channel), '[[:space:]_-]+', '', 'g')) in (
      'notag', 'none', 'untagged'
    ) then 'no_tag'
    when lower(regexp_replace(trim(p_channel), '[[:space:]_-]+', '', 'g')) in (
      'fbesport', 'fbesports', 'facebookesport', 'facebookesports', 'esportfacebook'
    ) then 'facebook_esport'
    when lower(trim(p_channel)) in ('facebook', 'fb', 'meta') then 'facebook'
    when lower(replace(trim(p_channel), ' ', '')) in ('tiktok', 'tik-tok', 'tk') then 'tiktok'
    when lower(trim(p_channel)) in ('instagram', 'ig', 'insta', 'reels') then 'instagram'
    when lower(replace(replace(trim(p_channel), '-', ''), ' ', '')) in ('ingame', 'in', 'game', 'inapp') then 'in_game'
    when lower(trim(p_channel)) in ('youtube', 'yt', 'shorts', 'youtube shorts') then 'youtube'
    else 'other'
  end;
$function$;

alter table public.marketing_channel_placements
  drop constraint if exists marketing_channel_placements_channel_check;

alter table public.marketing_channel_placements
  add constraint marketing_channel_placements_channel_check check (
    channel in ('facebook', 'facebook_esport', 'tiktok', 'instagram', 'in_game', 'youtube', 'other', 'no_tag')
  );

insert into public.creative_channels (code, label, active, sort_order)
values
  ('facebook_esport', 'FB eSport', true, 15),
  ('no_tag', 'No Tag', true, 90)
on conflict (code) do update
set label = excluded.label,
    active = excluded.active,
    sort_order = excluded.sort_order;

insert into public.creative_channel_formats (channel_code, format_code)
values
  ('facebook_esport', '1200x1200'),
  ('facebook_esport', '1200x1500'),
  ('no_tag', 'custom')
on conflict (channel_code, format_code) do nothing;

create or replace function public.workflow_normalize_creative_channel(
  p_channel text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when length(trim(coalesce(p_channel, ''))) = 0 then null
    when lower(regexp_replace(trim(p_channel), '[[:space:]_-]+', '', 'g')) in (
      'notag', 'none', 'untagged'
    ) then 'no_tag'
    when lower(regexp_replace(trim(p_channel), '[[:space:]_-]+', '', 'g')) in (
      'fbesport', 'fbesports', 'facebookesport', 'facebookesports', 'esportfacebook'
    ) then 'facebook_esport'
    when lower(trim(p_channel)) in ('facebook', 'fb', 'meta', 'meta facebook') then 'facebook'
    when lower(replace(trim(p_channel), ' ', '')) in ('tiktok', 'tik-tok', 'tk') then 'tiktok'
    when lower(trim(p_channel)) in ('instagram', 'ig', 'insta', 'reels', 'instagram reels') then 'instagram'
    when lower(replace(replace(trim(p_channel), '-', ''), ' ', '')) in ('ingame', 'game', 'inapp') then 'in_game'
    when lower(trim(p_channel)) in ('youtube', 'yt', 'youtube shorts', 'shorts') then 'youtube'
    when lower(trim(p_channel)) in ('other', 'others') then 'other'
    else null
  end;
$function$;

create or replace function public.workflow_creative_format_codes_from_text(
  p_value text
)
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_part text;
  v_code text;
  v_result text[] := '{}'::text[];
begin
  foreach v_part in array regexp_split_to_array(coalesce(p_value, ''), '[[:space:]]*,[[:space:]]*')
  loop
    v_code := public.workflow_creative_format_code_from_text(v_part);
    if v_code is not null and not (v_code = any(v_result)) then
      v_result := array_append(v_result, v_code);
    end if;
  end loop;
  return v_result;
end;
$function$;

revoke all on function public.workflow_creative_format_codes_from_text(text)
from public, anon, authenticated;

alter table public.creative_request_details
  add column if not exists size_format_codes text[];

update public.creative_request_details
set size_format_codes = array[
  coalesce(
    nullif(trim(size_format_code), ''),
    public.workflow_creative_format_code_from_text(size_format),
    'custom'
  )
]
where coalesce(cardinality(size_format_codes), 0) = 0;

alter table public.creative_request_details
  alter column size_format_codes set not null;

alter table public.creative_request_details
  drop constraint if exists creative_request_details_size_format_codes_check;

alter table public.creative_request_details
  add constraint creative_request_details_size_format_codes_check
  check (cardinality(size_format_codes) > 0) not valid;

alter table public.creative_request_details
  validate constraint creative_request_details_size_format_codes_check;

create index if not exists idx_creative_details_size_format_codes
on public.creative_request_details using gin(size_format_codes);

create or replace function public.workflow_prepare_creative_request_format()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_channel_code text;
  v_format_code text;
  v_format_codes text[] := '{}'::text[];
  v_format public.creative_formats%rowtype;
  v_primary_format public.creative_formats%rowtype;
  v_dimensions record;
begin
  if tg_op = 'UPDATE'
     and new.platforms is not distinct from old.platforms
     and new.size_format is not distinct from old.size_format
     and new.size_format_code is not distinct from old.size_format_code
     and new.size_format_codes is not distinct from old.size_format_codes
     and new.channel_codes is not distinct from old.channel_codes
     and new.size_format_is_legacy is not distinct from old.size_format_is_legacy then
    return new;
  end if;

  new.channel_codes :=
    public.workflow_normalize_creative_channels(new.platforms, false);

  if tg_op = 'UPDATE'
     and new.size_format is distinct from old.size_format
     and new.size_format_codes is not distinct from old.size_format_codes then
    v_format_codes := public.workflow_creative_format_codes_from_text(new.size_format);
  elsif coalesce(cardinality(new.size_format_codes), 0) > 0 then
    foreach v_format_code in array new.size_format_codes
    loop
      v_format_code := lower(trim(coalesce(v_format_code, '')));
      if length(v_format_code) > 0 and not (v_format_code = any(v_format_codes)) then
        v_format_codes := array_append(v_format_codes, v_format_code);
      end if;
    end loop;
  else
    v_format_codes := public.workflow_creative_format_codes_from_text(new.size_format);
  end if;

  if coalesce(cardinality(v_format_codes), 0) = 0
     and length(trim(coalesce(new.size_format_code, ''))) > 0 then
    v_format_codes := array[lower(trim(new.size_format_code))];
  end if;

  if coalesce(cardinality(v_format_codes), 0) = 0 then
    raise exception 'At least one supported Size / format is required';
  end if;

  foreach v_channel_code in array new.channel_codes
  loop
    if not exists (
      select 1
      from public.creative_channels cc
      where cc.code = v_channel_code
        and cc.active = true
    ) then
      raise exception 'Unsupported or inactive creative channel: %', v_channel_code;
    end if;
  end loop;

  foreach v_format_code in array v_format_codes
  loop
    select *
    into v_format
    from public.creative_formats cf
    where cf.code = v_format_code
      and cf.active = true;

    if v_format.code is null then
      raise exception 'Unsupported or inactive creative format: %', v_format_code;
    end if;

    if not exists (
      select 1
      from public.creative_channel_formats ccf
      where ccf.channel_code = any(new.channel_codes)
        and ccf.format_code = v_format_code
    ) then
      raise exception
        'Format % is not valid for the selected Channel Tag(s): %',
        v_format_code,
        array_to_string(new.channel_codes, ', ');
    end if;
  end loop;

  select *
  into v_primary_format
  from public.creative_formats cf
  where cf.code = v_format_codes[1];

  new.size_format_codes := v_format_codes;
  new.size_format_code := v_format_codes[1];
  new.size_width_px := v_primary_format.width_px;
  new.size_height_px := v_primary_format.height_px;
  new.size_aspect_ratio := v_primary_format.aspect_ratio;
  new.size_format_is_legacy := false;
  new.size_format := array_to_string(v_format_codes, ',');

  if v_format_codes[1] = 'custom' then
    select *
    into v_dimensions
    from public.workflow_extract_creative_dimensions(new.size_format);
    if found then
      new.size_width_px := v_dimensions.width_px;
      new.size_height_px := v_dimensions.height_px;
      new.size_aspect_ratio := v_dimensions.aspect_ratio;
    end if;
  end if;

  return new;
end;
$function$;

revoke all on function public.workflow_prepare_creative_request_format()
from public, anon, authenticated;

drop trigger if exists creative_request_details_prepare_format
on public.creative_request_details;

create trigger creative_request_details_prepare_format
before insert or update of
  platforms,
  size_format,
  channel_codes,
  size_format_code,
  size_format_codes,
  size_format_is_legacy
on public.creative_request_details
for each row execute function public.workflow_prepare_creative_request_format();

select pg_notify('pgrst', 'reload schema');

commit;

-- Verification:
-- select public.marketing_normalize_channel('FB eSport');
-- select public.workflow_normalize_creative_channel('FB Esports');
-- select public.workflow_creative_format_codes_from_text('1200x1200,1200x1500,1080x1920');
-- select code, label from public.creative_channels where code = 'facebook_esport';
