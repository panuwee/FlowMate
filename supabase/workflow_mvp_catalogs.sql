-- Workflow Management MVP additive catalogs
-- Scope:
--   R1    Channel-based creative size / format foundation
--   R6/7 Campaign function colours and scalable campaign-tag lifecycle
--
-- This file is intentionally additive and idempotent. It does not replace or
-- reorder columns in marketing_plan_timeline_v, avoiding PostgreSQL 42P16
-- errors caused by CREATE OR REPLACE VIEW column renames/reordering.
--
-- Required run order:
--   1. supabase/schema.sql
--   2. supabase/whitelist_access.sql
--   3. supabase/marketing_plan.sql
--   4. this file
--
-- PRE-FLIGHT (run separately before applying this file on a live database):
--
-- select
--   to_regclass('public.users') as users,
--   to_regclass('public.creative_request_details') as creative_request_details,
--   to_regclass('public.marketing_plans') as marketing_plans,
--   to_regclass('public.marketing_campaigns') as marketing_campaigns;
--
-- select
--   to_regprocedure('public.is_active_app_user()') as active_user_helper,
--   to_regprocedure('public.is_admin_app_user()') as admin_helper;
--
-- select size_format, platforms, count(*) as row_count
-- from public.creative_request_details
-- group by size_format, platforms
-- order by row_count desc, size_format;
--
-- select lower(regexp_replace(trim(name), '\s+', ' ', 'g')) as normalized_name,
--        count(*) as campaign_instances,
--        array_agg(distinct team order by team) as teams
-- from public.marketing_campaigns
-- group by lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
-- order by normalized_name;

begin;

do $workflow_mvp_preflight$
begin
  if to_regclass('public.users') is null
     or to_regclass('public.creative_request_details') is null
     or to_regclass('public.marketing_plans') is null
     or to_regclass('public.marketing_campaigns') is null then
    raise exception
      'Workflow MVP catalogs require users, creative_request_details, marketing_plans, and marketing_campaigns';
  end if;

  if to_regprocedure('public.is_active_app_user()') is null
     or to_regprocedure('public.is_admin_app_user()') is null then
    raise exception
      'Workflow MVP catalogs require is_active_app_user() and is_admin_app_user(); run whitelist/security SQL first';
  end if;
end;
$workflow_mvp_preflight$;

-- ===========================================================================
-- Shared helpers
-- ===========================================================================

create or replace function public.workflow_mvp_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  new.updated_at := now();
  return new;
end;
$function$;

revoke all on function public.workflow_mvp_set_updated_at()
from public, anon, authenticated;

-- ===========================================================================
-- R1: Creative channel and format catalogs
-- ===========================================================================

create table if not exists public.creative_channels (
  code text primary key,
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_channels_code_check
    check (code ~ '^[a-z][a-z0-9_]*$'),
  constraint creative_channels_label_check
    check (length(trim(label)) > 0)
);

create table if not exists public.creative_formats (
  code text primary key,
  display_label text not null,
  width_px integer,
  height_px integer,
  aspect_ratio text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_formats_code_check
    check (code ~ '^[a-z0-9]+(?:x[a-z0-9]+)*$'),
  constraint creative_formats_label_check
    check (length(trim(display_label)) > 0),
  constraint creative_formats_dimensions_check
    check (
      (
        code = 'custom'
        and width_px is null
        and height_px is null
        and aspect_ratio is null
      )
      or (
        code <> 'custom'
        and width_px > 0
        and height_px > 0
        and length(trim(coalesce(aspect_ratio, ''))) > 0
      )
    )
);

create table if not exists public.creative_channel_formats (
  channel_code text not null
    references public.creative_channels(code) on update cascade on delete restrict,
  format_code text not null
    references public.creative_formats(code) on update cascade on delete restrict,
  created_at timestamptz not null default now(),
  primary key (channel_code, format_code)
);

create index if not exists idx_creative_channel_formats_format
on public.creative_channel_formats(format_code, channel_code);

drop trigger if exists creative_channels_set_updated_at
on public.creative_channels;
create trigger creative_channels_set_updated_at
before update on public.creative_channels
for each row execute function public.workflow_mvp_set_updated_at();

drop trigger if exists creative_formats_set_updated_at
on public.creative_formats;
create trigger creative_formats_set_updated_at
before update on public.creative_formats
for each row execute function public.workflow_mvp_set_updated_at();

insert into public.creative_channels (code, label, active, sort_order)
values
  ('facebook',  'Facebook',  true, 10),
  ('tiktok',    'TikTok',    true, 20),
  ('instagram', 'Instagram', true, 30),
  ('in_game',   'In-game',   true, 40),
  ('youtube',   'YouTube',   true, 50),
  ('other',     'Other',     true, 60),
  ('no_tag',    'No Tag',    true, 90)
on conflict (code) do update
set label = excluded.label,
    active = excluded.active,
    sort_order = excluded.sort_order;

insert into public.creative_formats (
  code,
  display_label,
  width_px,
  height_px,
  aspect_ratio,
  active,
  sort_order
)
values
  ('1200x1200', '1200x1200 (1:1)',  1200, 1200, '1:1',  true, 10),
  ('1200x1500', '1200x1500 (4:5)',  1200, 1500, '4:5',  true, 20),
  ('1080x1920', '1080x1920 (9:16)', 1080, 1920, '9:16', true, 30),
  ('1920x1080', '1920x1080 (16:9)', 1920, 1080, '16:9', true, 40),
  ('custom',    'Custom',            null, null, null,   true, 90)
on conflict (code) do update
set display_label = excluded.display_label,
    width_px = excluded.width_px,
    height_px = excluded.height_px,
    aspect_ratio = excluded.aspect_ratio,
    active = excluded.active,
    sort_order = excluded.sort_order;

insert into public.creative_channel_formats (channel_code, format_code)
values
  ('facebook',  '1200x1200'),
  ('facebook',  '1200x1500'),
  ('tiktok',    '1080x1920'),
  ('tiktok',    '1200x1500'),
  ('instagram', '1200x1200'),
  ('instagram', '1200x1500'),
  ('youtube',   '1920x1080'),
  ('in_game',   'custom'),
  ('other',     'custom'),
  ('no_tag',    'custom')
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
    )
      then 'no_tag'
    when lower(trim(p_channel)) in ('facebook', 'fb', 'meta', 'meta facebook')
      then 'facebook'
    when lower(replace(trim(p_channel), ' ', '')) in ('tiktok', 'tik-tok', 'tk')
      then 'tiktok'
    when lower(trim(p_channel)) in (
      'instagram', 'ig', 'insta', 'reels', 'instagram reels'
    )
      then 'instagram'
    when lower(replace(replace(trim(p_channel), '-', ''), ' ', '')) in (
      'ingame', 'game', 'inapp'
    )
      then 'in_game'
    when lower(trim(p_channel)) in (
      'youtube', 'yt', 'youtube shorts', 'shorts'
    )
      then 'youtube'
    when lower(trim(p_channel)) in ('other', 'others')
      then 'other'
    else null
  end;
$function$;

create or replace function public.workflow_normalize_creative_channels(
  p_channels text[],
  p_allow_unknown_as_other boolean default false
)
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_channel text;
  v_code text;
  v_result text[] := '{}'::text[];
begin
  foreach v_channel in array coalesce(p_channels, '{}'::text[])
  loop
    if length(trim(coalesce(v_channel, ''))) = 0 then
      continue;
    end if;

    v_code := public.workflow_normalize_creative_channel(v_channel);

    if v_code is null then
      if p_allow_unknown_as_other then
        v_code := 'other';
      else
        raise exception 'Unsupported creative channel: %', v_channel;
      end if;
    end if;

    if not (v_code = any(v_result)) then
      v_result := array_append(v_result, v_code);
    end if;
  end loop;

  if coalesce(array_length(v_result, 1), 0) = 0 then
    if p_allow_unknown_as_other then
      return array['other']::text[];
    end if;
    raise exception 'At least one supported creative channel is required';
  end if;

  if 'no_tag' = any(v_result) and cardinality(v_result) > 1 then
    raise exception 'No Tag cannot be combined with another Channel Tag';
  end if;

  return v_result;
end;
$function$;

create or replace function public.workflow_creative_format_code_from_text(
  p_value text
)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_value text;
begin
  v_value := lower(replace(coalesce(p_value, ''), '×', 'x'));
  v_value := regexp_replace(v_value, '\s+', '', 'g');

  if v_value ~ '(^|[^0-9])1200x1200([^0-9]|$)' then
    return '1200x1200';
  elsif v_value ~ '(^|[^0-9])1200x1500([^0-9]|$)' then
    return '1200x1500';
  elsif v_value ~ '(^|[^0-9])1080x1920([^0-9]|$)' then
    return '1080x1920';
  elsif v_value ~ '(^|[^0-9])1920x1080([^0-9]|$)' then
    return '1920x1080';
  elsif v_value = 'custom' then
    return 'custom';
  end if;

  return null;
end;
$function$;

create or replace function public.workflow_greatest_common_divisor(
  p_left integer,
  p_right integer
)
returns integer
language plpgsql
immutable
strict
set search_path = public, pg_temp
as $function$
declare
  v_left integer := abs(p_left);
  v_right integer := abs(p_right);
  v_remainder integer;
begin
  while v_right <> 0
  loop
    v_remainder := v_left % v_right;
    v_left := v_right;
    v_right := v_remainder;
  end loop;
  return nullif(v_left, 0);
end;
$function$;

create or replace function public.workflow_extract_creative_dimensions(
  p_value text
)
returns table (
  width_px integer,
  height_px integer,
  aspect_ratio text
)
language plpgsql
immutable
set search_path = public, pg_temp
as $function$
declare
  v_value text;
  v_match text[];
  v_width integer;
  v_height integer;
  v_gcd integer;
begin
  v_value := lower(replace(coalesce(p_value, ''), '×', 'x'));
  v_value := regexp_replace(v_value, '\s+', '', 'g');
  v_match := regexp_match(v_value, '([0-9]{2,5})x([0-9]{2,5})');

  if v_match is null then
    return;
  end if;

  v_width := v_match[1]::integer;
  v_height := v_match[2]::integer;

  if v_width <= 0 or v_height <= 0 then
    return;
  end if;

  v_gcd := public.workflow_greatest_common_divisor(v_width, v_height);

  width_px := v_width;
  height_px := v_height;
  aspect_ratio := case
    when v_gcd is null then null
    else (v_width / v_gcd)::text || ':' || (v_height / v_gcd)::text
  end;
  return next;
end;
$function$;

revoke all on function public.workflow_normalize_creative_channel(text)
from public, anon, authenticated;
revoke all on function public.workflow_normalize_creative_channels(text[], boolean)
from public, anon, authenticated;
revoke all on function public.workflow_creative_format_code_from_text(text)
from public, anon, authenticated;
revoke all on function public.workflow_greatest_common_divisor(integer, integer)
from public, anon, authenticated;
revoke all on function public.workflow_extract_creative_dimensions(text)
from public, anon, authenticated;

alter table public.creative_request_details
  add column if not exists channel_codes text[],
  add column if not exists size_format_code text,
  add column if not exists size_width_px integer,
  add column if not exists size_height_px integer,
  add column if not exists size_aspect_ratio text,
  add column if not exists size_format_is_legacy boolean not null default false;

with prepared as (
  select
    crd.id,
    public.workflow_normalize_creative_channels(crd.platforms, true) as channel_codes,
    coalesce(
      nullif(trim(crd.size_format_code), ''),
      public.workflow_creative_format_code_from_text(crd.size_format),
      'custom'
    ) as format_code,
    case
      when nullif(trim(crd.size_format_code), '') is not null
        then crd.size_format_is_legacy
      else public.workflow_creative_format_code_from_text(crd.size_format) is null
    end as is_legacy,
    cf.width_px as catalog_width_px,
    cf.height_px as catalog_height_px,
    cf.aspect_ratio as catalog_aspect_ratio,
    dims.width_px as parsed_width_px,
    dims.height_px as parsed_height_px,
    dims.aspect_ratio as parsed_aspect_ratio
  from public.creative_request_details crd
  left join public.creative_formats cf
    on cf.code = coalesce(
      nullif(trim(crd.size_format_code), ''),
      public.workflow_creative_format_code_from_text(crd.size_format),
      'custom'
    )
  left join lateral public.workflow_extract_creative_dimensions(crd.size_format) dims
    on true
)
update public.creative_request_details crd
set channel_codes = prepared.channel_codes,
    size_format_code = prepared.format_code,
    size_width_px = coalesce(prepared.catalog_width_px, prepared.parsed_width_px),
    size_height_px = coalesce(prepared.catalog_height_px, prepared.parsed_height_px),
    size_aspect_ratio = coalesce(
      prepared.catalog_aspect_ratio,
      prepared.parsed_aspect_ratio
    ),
    size_format_is_legacy = prepared.is_legacy
from prepared
where crd.id = prepared.id
  and (
    crd.channel_codes is distinct from prepared.channel_codes
    or crd.size_format_code is distinct from prepared.format_code
    or crd.size_width_px is distinct from coalesce(
      prepared.catalog_width_px,
      prepared.parsed_width_px
    )
    or crd.size_height_px is distinct from coalesce(
      prepared.catalog_height_px,
      prepared.parsed_height_px
    )
    or crd.size_aspect_ratio is distinct from coalesce(
      prepared.catalog_aspect_ratio,
      prepared.parsed_aspect_ratio
    )
    or crd.size_format_is_legacy is distinct from prepared.is_legacy
  );

do $creative_format_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.creative_request_details'::regclass
      and conname = 'creative_request_details_size_format_code_fkey'
  ) then
    alter table public.creative_request_details
      add constraint creative_request_details_size_format_code_fkey
      foreign key (size_format_code)
      references public.creative_formats(code)
      on update cascade
      on delete restrict;
  end if;
end;
$creative_format_fk$;

alter table public.creative_request_details
  alter column channel_codes set not null,
  alter column size_format_code set not null;

create index if not exists idx_creative_details_size_format_code
on public.creative_request_details(size_format_code);

create index if not exists idx_creative_details_channel_codes
on public.creative_request_details using gin(channel_codes);

create or replace function public.workflow_prepare_creative_request_format()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_channel_code text;
  v_format_code text;
  v_format public.creative_formats%rowtype;
  v_dimensions record;
  v_revalidate boolean := true;
begin
  if tg_op = 'UPDATE'
     and new.platforms is not distinct from old.platforms
     and new.size_format is not distinct from old.size_format
     and new.size_format_code is not distinct from old.size_format_code
     and new.channel_codes is not distinct from old.channel_codes
     and new.size_format_is_legacy is not distinct from old.size_format_is_legacy then
    return new;
  end if;

  new.channel_codes :=
    public.workflow_normalize_creative_channels(new.platforms, false);

  if tg_op = 'UPDATE'
     and new.size_format is distinct from old.size_format
     and new.size_format_code is not distinct from old.size_format_code then
    v_format_code :=
      public.workflow_creative_format_code_from_text(new.size_format);
  else
    v_format_code := lower(trim(coalesce(new.size_format_code, '')));
    if length(v_format_code) = 0 then
      v_format_code :=
        public.workflow_creative_format_code_from_text(new.size_format);
    end if;
  end if;

  if v_format_code is null then
    v_format_code := 'custom';
  end if;

  select *
  into v_format
  from public.creative_formats cf
  where cf.code = v_format_code
    and cf.active = true;

  if v_format.code is null then
    raise exception 'Unsupported or inactive creative format: %', v_format_code;
  end if;

  if tg_op = 'UPDATE'
     and old.size_format_is_legacy = true
     and new.platforms is not distinct from old.platforms
     and new.size_format is not distinct from old.size_format
     and new.size_format_code is not distinct from old.size_format_code then
    v_revalidate := false;
    new.size_format_is_legacy := true;
  else
    new.size_format_is_legacy := false;
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

  if v_revalidate and not exists (
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

  new.size_format_code := v_format_code;
  new.size_width_px := v_format.width_px;
  new.size_height_px := v_format.height_px;
  new.size_aspect_ratio := v_format.aspect_ratio;

  if v_format_code = 'custom' then
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
  size_format_is_legacy
on public.creative_request_details
for each row execute function public.workflow_prepare_creative_request_format();

alter table public.creative_channels enable row level security;
alter table public.creative_formats enable row level security;
alter table public.creative_channel_formats enable row level security;

drop policy if exists "active users can read creative channels"
on public.creative_channels;
create policy "active users can read creative channels"
on public.creative_channels
for select
to authenticated
using (public.is_active_app_user());

drop policy if exists "admins can manage creative channels"
on public.creative_channels;
create policy "admins can manage creative channels"
on public.creative_channels
for all
to authenticated
using (public.is_admin_app_user())
with check (public.is_admin_app_user());

drop policy if exists "active users can read creative formats"
on public.creative_formats;
create policy "active users can read creative formats"
on public.creative_formats
for select
to authenticated
using (public.is_active_app_user());

drop policy if exists "admins can manage creative formats"
on public.creative_formats;
create policy "admins can manage creative formats"
on public.creative_formats
for all
to authenticated
using (public.is_admin_app_user())
with check (public.is_admin_app_user());

drop policy if exists "active users can read creative channel formats"
on public.creative_channel_formats;
create policy "active users can read creative channel formats"
on public.creative_channel_formats
for select
to authenticated
using (public.is_active_app_user());

drop policy if exists "admins can manage creative channel formats"
on public.creative_channel_formats;
create policy "admins can manage creative channel formats"
on public.creative_channel_formats
for all
to authenticated
using (public.is_admin_app_user())
with check (public.is_admin_app_user());

revoke all privileges on public.creative_channels
from public, anon, authenticated;
revoke all privileges on public.creative_formats
from public, anon, authenticated;
revoke all privileges on public.creative_channel_formats
from public, anon, authenticated;

grant select, insert, update, delete on public.creative_channels
to authenticated;
grant select, insert, update, delete on public.creative_formats
to authenticated;
grant select, insert, update, delete on public.creative_channel_formats
to authenticated;

-- ===========================================================================
-- R6/R7: Campaign function and campaign-tag catalogs
-- ===========================================================================

create table if not exists public.marketing_campaign_functions (
  code text primary key,
  label text not null,
  light_background text not null,
  light_foreground text not null,
  dark_background text not null,
  dark_foreground text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaign_functions_code_check
    check (code in ('mkt', 'ops', 'esport')),
  constraint marketing_campaign_functions_label_check
    check (length(trim(label)) > 0),
  constraint marketing_campaign_functions_light_bg_check
    check (light_background ~ '^#[0-9A-Fa-f]{6}$'),
  constraint marketing_campaign_functions_light_fg_check
    check (light_foreground ~ '^#[0-9A-Fa-f]{6}$'),
  constraint marketing_campaign_functions_dark_bg_check
    check (dark_background ~ '^#[0-9A-Fa-f]{6}$'),
  constraint marketing_campaign_functions_dark_fg_check
    check (dark_foreground ~ '^#[0-9A-Fa-f]{6}$')
);

drop trigger if exists marketing_campaign_functions_set_updated_at
on public.marketing_campaign_functions;
create trigger marketing_campaign_functions_set_updated_at
before update on public.marketing_campaign_functions
for each row execute function public.workflow_mvp_set_updated_at();

insert into public.marketing_campaign_functions (
  code,
  label,
  light_background,
  light_foreground,
  dark_background,
  dark_foreground,
  active,
  sort_order
)
values
  ('mkt',    'MKT',    '#FEF3C7', '#92400E', '#713F12', '#FEF3C7', true, 10),
  ('ops',    'Ops',    '#FEE2E2', '#991B1B', '#7F1D1D', '#FEE2E2', true, 20),
  ('esport', 'eSport', '#DBEAFE', '#1E40AF', '#1E3A8A', '#DBEAFE', true, 30)
on conflict (code) do update
set label = excluded.label,
    light_background = excluded.light_background,
    light_foreground = excluded.light_foreground,
    dark_background = excluded.dark_background,
    dark_foreground = excluded.dark_foreground,
    active = excluded.active,
    sort_order = excluded.sort_order;

create or replace function public.marketing_normalize_campaign_tag_name(
  p_name text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select lower(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'));
$function$;

create or replace function public.workflow_campaign_function_from_text(
  p_value text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $function$
  select case
    when lower(trim(coalesce(p_value, ''))) in (
      'mkt', 'marketing'
    ) then 'mkt'
    when lower(trim(coalesce(p_value, ''))) in (
      'ops', 'operation', 'operations', 'pm'
    ) then 'ops'
    when lower(replace(trim(coalesce(p_value, '')), ' ', '')) in (
      'esport', 'esports', 'esportops'
    ) then 'esport'
    else null
  end;
$function$;

revoke all on function public.marketing_normalize_campaign_tag_name(text)
from public, anon, authenticated;
revoke all on function public.workflow_campaign_function_from_text(text)
from public, anon, authenticated;

create table if not exists public.marketing_campaign_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  normalized_name text generated always as (
    public.marketing_normalize_campaign_tag_name(name)
  ) stored,
  function_code text
    references public.marketing_campaign_functions(code)
    on update cascade
    on delete restrict,
  created_by_user_id uuid
    references public.users(id) on update cascade on delete set null,
  updated_by_user_id uuid
    references public.users(id) on update cascade on delete set null,
  archived_at timestamptz,
  archived_by_user_id uuid
    references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaign_tags_name_check
    check (length(trim(name)) > 0),
  constraint marketing_campaign_tags_normalized_name_unique
    unique (normalized_name),
  constraint marketing_campaign_tags_archive_actor_check
    check (
      (archived_at is null and archived_by_user_id is null)
      or archived_at is not null
    )
);

create index if not exists idx_marketing_campaign_tags_function
on public.marketing_campaign_tags(function_code);

create index if not exists idx_marketing_campaign_tags_created_by
on public.marketing_campaign_tags(created_by_user_id);

create index if not exists idx_marketing_campaign_tags_updated_by
on public.marketing_campaign_tags(updated_by_user_id);

create index if not exists idx_marketing_campaign_tags_archived_by
on public.marketing_campaign_tags(archived_by_user_id);

create index if not exists idx_marketing_campaign_tags_active_function_name
on public.marketing_campaign_tags(function_code, normalized_name)
where archived_at is null;

drop trigger if exists marketing_campaign_tags_set_updated_at
on public.marketing_campaign_tags;
create trigger marketing_campaign_tags_set_updated_at
before update on public.marketing_campaign_tags
for each row execute function public.workflow_mvp_set_updated_at();

with campaign_groups as (
  select
    public.marketing_normalize_campaign_tag_name(mc.name) as normalized_name,
    (array_agg(mc.name order by mc.created_at, mc.id))[1] as canonical_name,
    case
      when count(distinct public.workflow_campaign_function_from_text(mc.team))
        filter (
          where public.workflow_campaign_function_from_text(mc.team) is not null
        ) = 1
      then min(public.workflow_campaign_function_from_text(mc.team))
        filter (
          where public.workflow_campaign_function_from_text(mc.team) is not null
        )
      else null
    end as function_code
  from public.marketing_campaigns mc
  where length(public.marketing_normalize_campaign_tag_name(mc.name)) > 0
  group by public.marketing_normalize_campaign_tag_name(mc.name)
)
insert into public.marketing_campaign_tags (
  name,
  function_code,
  created_by_user_id,
  updated_by_user_id
)
select
  campaign_groups.canonical_name,
  campaign_groups.function_code,
  null,
  null
from campaign_groups
on conflict (normalized_name) do nothing;

alter table public.marketing_campaigns
  add column if not exists campaign_tag_id uuid;

update public.marketing_campaigns mc
set campaign_tag_id = mct.id
from public.marketing_campaign_tags mct
where mc.campaign_tag_id is null
  and mct.normalized_name =
    public.marketing_normalize_campaign_tag_name(mc.name);

do $marketing_campaign_tag_fk$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.marketing_campaigns'::regclass
      and conname = 'marketing_campaigns_campaign_tag_id_fkey'
  ) then
    alter table public.marketing_campaigns
      add constraint marketing_campaigns_campaign_tag_id_fkey
      foreign key (campaign_tag_id)
      references public.marketing_campaign_tags(id)
      on update cascade
      on delete restrict;
  end if;
end;
$marketing_campaign_tag_fk$;

create index if not exists idx_marketing_campaigns_campaign_tag
on public.marketing_campaigns(campaign_tag_id);

create index if not exists idx_marketing_campaigns_plan_campaign_tag
on public.marketing_campaigns(plan_id, campaign_tag_id);

create or replace function public.workflow_marketing_campaign_attach_tag()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_tag public.marketing_campaign_tags%rowtype;
  v_normalized_name text;
  v_function_code text;
begin
  if new.campaign_tag_id is not null then
    select *
    into v_tag
    from public.marketing_campaign_tags mct
    where mct.id = new.campaign_tag_id;

    if v_tag.id is null then
      raise exception 'Campaign tag not found';
    end if;

    if v_tag.archived_at is not null then
      if tg_op = 'INSERT' then
        raise exception 'Archived campaign tag cannot be used for a new campaign';
      elsif new.campaign_tag_id is distinct from old.campaign_tag_id then
        raise exception 'Archived campaign tag cannot be used for a new campaign';
      end if;
    end if;

    new.name := v_tag.name;
    return new;
  end if;

  v_normalized_name :=
    public.marketing_normalize_campaign_tag_name(new.name);

  if length(v_normalized_name) = 0 then
    raise exception 'Campaign tag name is required';
  end if;

  select *
  into v_tag
  from public.marketing_campaign_tags mct
  where mct.normalized_name = v_normalized_name;

  if v_tag.id is null then
    v_function_code := public.workflow_campaign_function_from_text(new.team);

    insert into public.marketing_campaign_tags (
      name,
      function_code,
      created_by_user_id,
      updated_by_user_id
    )
    values (
      trim(new.name),
      v_function_code,
      v_actor_id,
      v_actor_id
    )
    returning * into v_tag;
  end if;

  if v_tag.archived_at is not null then
    if tg_op = 'INSERT' then
      raise exception 'Archived campaign tag cannot be used for a new campaign';
    elsif v_tag.id is distinct from old.campaign_tag_id then
      raise exception 'Archived campaign tag cannot be used for a new campaign';
    end if;
  end if;

  new.campaign_tag_id := v_tag.id;
  new.name := v_tag.name;
  return new;
exception
  when unique_violation then
    select *
    into v_tag
    from public.marketing_campaign_tags mct
    where mct.normalized_name = v_normalized_name;

    if v_tag.id is null then
      raise;
    end if;
    if v_tag.archived_at is not null then
      if tg_op = 'INSERT' then
        raise exception 'Archived campaign tag cannot be used for a new campaign';
      elsif v_tag.id is distinct from old.campaign_tag_id then
        raise exception 'Archived campaign tag cannot be used for a new campaign';
      end if;
    end if;

    new.campaign_tag_id := v_tag.id;
    new.name := v_tag.name;
    return new;
end;
$function$;

revoke all on function public.workflow_marketing_campaign_attach_tag()
from public, anon, authenticated;

drop trigger if exists marketing_campaigns_attach_campaign_tag
on public.marketing_campaigns;
create trigger marketing_campaigns_attach_campaign_tag
before insert or update of name, team, campaign_tag_id
on public.marketing_campaigns
for each row execute function public.workflow_marketing_campaign_attach_tag();

alter table public.marketing_campaign_functions enable row level security;
alter table public.marketing_campaign_tags enable row level security;

drop policy if exists "active users can read marketing campaign functions"
on public.marketing_campaign_functions;
create policy "active users can read marketing campaign functions"
on public.marketing_campaign_functions
for select
to authenticated
using (public.is_active_app_user());

drop policy if exists "admins can manage marketing campaign functions"
on public.marketing_campaign_functions;
create policy "admins can manage marketing campaign functions"
on public.marketing_campaign_functions
for all
to authenticated
using (public.is_admin_app_user())
with check (public.is_admin_app_user());

drop policy if exists "active users can read marketing campaign tags"
on public.marketing_campaign_tags;
create policy "active users can read marketing campaign tags"
on public.marketing_campaign_tags
for select
to authenticated
using (public.is_active_app_user());

revoke all privileges on public.marketing_campaign_functions
from public, anon, authenticated;
revoke all privileges on public.marketing_campaign_tags
from public, anon, authenticated;

grant select, insert, update, delete on public.marketing_campaign_functions
to authenticated;
grant select on public.marketing_campaign_tags
to authenticated;

-- This is a new view. Existing Marketing Plan views are deliberately untouched.
create or replace view public.marketing_campaign_tag_management_v
with (security_invoker = true) as
select
  mct.id as campaign_tag_id,
  mct.name,
  mct.normalized_name,
  mct.function_code,
  mcf.label as function_label,
  mcf.light_background,
  mcf.light_foreground,
  mcf.dark_background,
  mcf.dark_foreground,
  (mct.archived_at is not null) as is_archived,
  mct.archived_at,
  mct.archived_by_user_id,
  mct.created_by_user_id,
  mct.updated_by_user_id,
  mct.created_at,
  mct.updated_at,
  count(distinct mci.id)::bigint as usage_count,
  max(
    greatest(
      mc.created_at,
      mc.updated_at,
      mci.created_at,
      mci.updated_at
    )
  ) as last_used_at
from public.marketing_campaign_tags mct
left join public.marketing_campaign_functions mcf
  on mcf.code = mct.function_code
left join public.marketing_campaigns mc
  on mc.campaign_tag_id = mct.id
left join public.marketing_content_items mci
  on mci.campaign_id = mc.id
group by
  mct.id,
  mct.name,
  mct.normalized_name,
  mct.function_code,
  mcf.label,
  mcf.light_background,
  mcf.light_foreground,
  mcf.dark_background,
  mcf.dark_foreground,
  mct.archived_at,
  mct.archived_by_user_id,
  mct.created_by_user_id,
  mct.updated_by_user_id,
  mct.created_at,
  mct.updated_at;

revoke all privileges on public.marketing_campaign_tag_management_v
from public, anon, authenticated;
grant select on public.marketing_campaign_tag_management_v
to authenticated;

-- ===========================================================================
-- Campaign-tag management RPCs
-- ===========================================================================

create or replace function public.marketing_upsert_campaign_tag(
  p_campaign_tag_id uuid default null,
  p_name text default null,
  p_function_code text default null
)
returns public.marketing_campaign_tags
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_name text := trim(coalesce(p_name, ''));
  v_function_code text := lower(trim(coalesce(p_function_code, '')));
  v_existing public.marketing_campaign_tags%rowtype;
  v_result public.marketing_campaign_tags%rowtype;
begin
  if v_actor_id is null
     or not exists (
       select 1
       from public.users u
       where u.id = v_actor_id
         and u.is_active = true
     ) then
    raise exception 'Active sign-in is required';
  end if;

  if p_campaign_tag_id is null then
    if length(v_name) = 0 then
      raise exception 'Campaign tag name is required';
    end if;
    if length(v_function_code) = 0 then
      raise exception 'Campaign function is required for a new campaign tag';
    end if;
  else
    select *
    into v_existing
    from public.marketing_campaign_tags mct
    where mct.id = p_campaign_tag_id
    for update;

    if v_existing.id is null then
      raise exception 'Campaign tag not found';
    end if;
    if v_existing.archived_at is not null then
      raise exception 'Restore the archived campaign tag before editing it';
    end if;

    if length(v_name) = 0 then
      v_name := v_existing.name;
    end if;
    if length(v_function_code) = 0 then
      v_function_code := coalesce(v_existing.function_code, '');
    end if;
  end if;

  if length(v_function_code) > 0
     and not exists (
       select 1
       from public.marketing_campaign_functions mcf
       where mcf.code = v_function_code
         and mcf.active = true
     ) then
    raise exception 'Unsupported or inactive campaign function: %',
      v_function_code;
  end if;

  if p_campaign_tag_id is null then
    if exists (
      select 1
      from public.marketing_campaign_tags mct
      where mct.normalized_name =
        public.marketing_normalize_campaign_tag_name(v_name)
    ) then
      raise exception 'Campaign tag already exists; restore it if archived';
    end if;

    insert into public.marketing_campaign_tags (
      name,
      function_code,
      created_by_user_id,
      updated_by_user_id
    )
    values (
      v_name,
      nullif(v_function_code, ''),
      v_actor_id,
      v_actor_id
    )
    returning * into v_result;
  else
    update public.marketing_campaign_tags
    set name = v_name,
        function_code = nullif(v_function_code, ''),
        updated_by_user_id = v_actor_id
    where id = p_campaign_tag_id
    returning * into v_result;

    update public.marketing_campaigns
    set name = v_result.name
    where campaign_tag_id = v_result.id
      and name is distinct from v_result.name;
  end if;

  return v_result;
exception
  when unique_violation then
    raise exception 'Campaign tag already exists; restore it if archived';
end;
$function$;

create or replace function public.marketing_archive_campaign_tag(
  p_campaign_tag_id uuid
)
returns public.marketing_campaign_tags
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_result public.marketing_campaign_tags%rowtype;
begin
  if v_actor_id is null or not public.is_admin_app_user() then
    raise exception 'Only FlowMate admins can archive campaign tags';
  end if;

  update public.marketing_campaign_tags
  set archived_at = coalesce(archived_at, now()),
      archived_by_user_id = coalesce(archived_by_user_id, v_actor_id),
      updated_by_user_id = v_actor_id
  where id = p_campaign_tag_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Campaign tag not found';
  end if;

  return v_result;
end;
$function$;

create or replace function public.marketing_restore_campaign_tag(
  p_campaign_tag_id uuid
)
returns public.marketing_campaign_tags
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_result public.marketing_campaign_tags%rowtype;
begin
  if v_actor_id is null or not public.is_admin_app_user() then
    raise exception 'Only FlowMate admins can restore campaign tags';
  end if;

  update public.marketing_campaign_tags
  set archived_at = null,
      archived_by_user_id = null,
      updated_by_user_id = v_actor_id
  where id = p_campaign_tag_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Campaign tag not found';
  end if;

  return v_result;
end;
$function$;

create or replace function public.marketing_update_campaign_tag_function(
  p_campaign_tag_id uuid,
  p_function_code text
)
returns public.marketing_campaign_tags
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_function_code text := lower(trim(coalesce(p_function_code, '')));
  v_result public.marketing_campaign_tags%rowtype;
begin
  if v_actor_id is null
     or not exists (
       select 1
       from public.users u
       where u.id = v_actor_id
         and u.is_active = true
     ) then
    raise exception 'Active sign-in is required';
  end if;

  if not exists (
    select 1
    from public.marketing_campaign_functions mcf
    where mcf.code = v_function_code
      and mcf.active = true
  ) then
    raise exception 'Unsupported or inactive campaign function: %',
      v_function_code;
  end if;

  update public.marketing_campaign_tags
  set function_code = v_function_code,
      updated_by_user_id = v_actor_id
  where id = p_campaign_tag_id
  returning * into v_result;

  if v_result.id is null then
    raise exception 'Campaign tag not found';
  end if;

  return v_result;
end;
$function$;

create or replace function public.marketing_ensure_campaign_instance(
  p_month_key text,
  p_campaign_tag_id uuid,
  p_team text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_tag public.marketing_campaign_tags%rowtype;
  v_plan_id uuid;
  v_campaign_id uuid;
begin
  if v_actor_id is null
     or not exists (
       select 1
       from public.users u
       where u.id = v_actor_id
         and u.is_active = true
     ) then
    raise exception 'Active sign-in is required';
  end if;

  if p_month_key is null
     or p_month_key !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Month key must use YYYY-MM';
  end if;

  select *
  into v_tag
  from public.marketing_campaign_tags mct
  where mct.id = p_campaign_tag_id;

  if v_tag.id is null then
    raise exception 'Campaign tag not found';
  end if;
  if v_tag.archived_at is not null then
    raise exception 'Archived campaign tag cannot be used for a new campaign';
  end if;
  if v_tag.function_code is null then
    raise exception 'Campaign function must be assigned before using this tag';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('workflow_marketing_plan:' || p_month_key, 0)
  );

  select mp.id
  into v_plan_id
  from public.marketing_plans mp
  where mp.month_key = p_month_key
    and mp.status <> 'archived'
  order by mp.created_at, mp.id
  limit 1
  for update;

  if v_plan_id is null then
    insert into public.marketing_plans (
      month_key,
      title,
      market,
      audience_scope,
      plan_date,
      status,
      created_by_user_id
    )
    values (
      p_month_key,
      'Marketing Plan - ' || p_month_key,
      'TH',
      'TH ONLY',
      (p_month_key || '-01')::date,
      'active',
      v_actor_id
    )
    returning id into v_plan_id;
  end if;

  select mc.id
  into v_campaign_id
  from public.marketing_campaigns mc
  where mc.plan_id = v_plan_id
    and mc.campaign_tag_id = v_tag.id
  order by mc.created_at, mc.id
  limit 1
  for update;

  if v_campaign_id is null then
    insert into public.marketing_campaigns (
      plan_id,
      campaign_tag_id,
      name,
      team,
      start_date,
      end_date,
      sort_order
    )
    values (
      v_plan_id,
      v_tag.id,
      v_tag.name,
      nullif(trim(coalesce(p_team, '')), ''),
      null,
      null,
      100
    )
    returning id into v_campaign_id;
  end if;

  return jsonb_build_object(
    'plan_id', v_plan_id,
    'campaign_id', v_campaign_id,
    'campaign_tag_id', v_tag.id,
    'campaign_name', v_tag.name,
    'function_code', v_tag.function_code,
    'month_key', p_month_key
  );
end;
$function$;

revoke all on function public.marketing_upsert_campaign_tag(uuid, text, text)
from public, anon, authenticated;
revoke all on function public.marketing_archive_campaign_tag(uuid)
from public, anon, authenticated;
revoke all on function public.marketing_restore_campaign_tag(uuid)
from public, anon, authenticated;
revoke all on function public.marketing_update_campaign_tag_function(uuid, text)
from public, anon, authenticated;
revoke all on function public.marketing_ensure_campaign_instance(text, uuid, text)
from public, anon, authenticated;

grant execute on function public.marketing_upsert_campaign_tag(uuid, text, text)
to authenticated;
grant execute on function public.marketing_archive_campaign_tag(uuid)
to authenticated;
grant execute on function public.marketing_restore_campaign_tag(uuid)
to authenticated;
grant execute on function public.marketing_update_campaign_tag_function(uuid, text)
to authenticated;
grant execute on function public.marketing_ensure_campaign_instance(text, uuid, text)
to authenticated;

commit;

-- ===========================================================================
-- VERIFICATION (run after COMMIT)
-- ===========================================================================
--
-- 1. Seeded channel-to-format mapping:
-- select
--   cc.code as channel_code,
--   cc.label as channel_label,
--   array_agg(cf.code order by cf.sort_order) as format_codes
-- from public.creative_channels cc
-- join public.creative_channel_formats ccf on ccf.channel_code = cc.code
-- join public.creative_formats cf on cf.code = ccf.format_code
-- group by cc.code, cc.label, cc.sort_order
-- order by cc.sort_order;
--
-- 2. Every existing creative row has structured values:
-- select count(*) as missing_structured_rows
-- from public.creative_request_details
-- where channel_codes is null
--    or cardinality(channel_codes) = 0
--    or size_format_code is null;
-- -- Expected: 0
--
-- 3. Review unresolved historical formats preserved as custom:
-- select size_format, channel_codes, size_width_px, size_height_px,
--        size_aspect_ratio, count(*) as row_count
-- from public.creative_request_details
-- where size_format_code = 'custom'
--   and size_format_is_legacy = true
-- group by size_format, channel_codes, size_width_px, size_height_px,
--          size_aspect_ratio
-- order by row_count desc, size_format;
--
-- 4. No campaign instance is missing a canonical tag after backfill:
-- select count(*) as campaigns_without_tag
-- from public.marketing_campaigns
-- where campaign_tag_id is null;
-- -- Expected: 0
--
-- 5. Campaign-tag management data, including archive and usage fields:
-- select *
-- from public.marketing_campaign_tag_management_v
-- order by is_archived, normalized_name;
--
-- 6. Legacy campaign tags that still need an explicit function:
-- select campaign_tag_id, name, usage_count
-- from public.marketing_campaign_tag_management_v
-- where function_code is null
-- order by usage_count desc, name;
--
-- 7. Verify security-invoker on the new view:
-- select c.relname, c.reloptions
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relname = 'marketing_campaign_tag_management_v';
--
-- 8. Verify indexed foreign keys introduced by this migration:
-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public'
--   and indexname in (
--     'idx_creative_details_size_format_code',
--     'idx_creative_channel_formats_format',
--     'idx_marketing_campaigns_campaign_tag'
--   )
-- order by indexname;
--
-- 9. Confirm the existing Timeline view was not recreated or reordered:
-- select ordinal_position, column_name
-- from information_schema.columns
-- where table_schema = 'public'
--   and table_name = 'marketing_plan_timeline_v'
-- order by ordinal_position;
