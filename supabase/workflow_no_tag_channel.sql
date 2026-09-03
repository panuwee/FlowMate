-- FlowMate + Marketing Plan: No Tag channel
-- Run after:
--   1. supabase/marketing_plan.sql
--   2. supabase/workflow_mvp_catalogs.sql
--   3. supabase/workflow_esport_channel_multi_format.sql
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

create or replace function public.marketing_validate_channel_exclusivity_row()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.channel = 'no_tag' then
    new.publish_time := null;
  end if;

  if new.channel = 'no_tag' and exists (
    select 1
    from public.marketing_channel_placements sibling
    where sibling.content_item_id = new.content_item_id
      and sibling.id is distinct from new.id
  ) then
    raise exception 'No Tag cannot be combined with another Channel Tag';
  end if;

  if new.channel <> 'no_tag' and exists (
    select 1
    from public.marketing_channel_placements sibling
    where sibling.content_item_id = new.content_item_id
      and sibling.channel = 'no_tag'
      and sibling.id is distinct from new.id
  ) then
    raise exception 'No Tag cannot be combined with another Channel Tag';
  end if;

  return new;
end;
$function$;

revoke all on function public.marketing_validate_channel_exclusivity_row()
from public, anon, authenticated;

drop trigger if exists marketing_channel_placements_validate_channel_exclusivity
on public.marketing_channel_placements;

create trigger marketing_channel_placements_validate_channel_exclusivity
before insert or update of content_item_id, channel, publish_time
on public.marketing_channel_placements
for each row execute function public.marketing_validate_channel_exclusivity_row();

insert into public.creative_channels (code, label, active, sort_order)
values ('no_tag', 'No Tag', true, 90)
on conflict (code) do update
set label = excluded.label,
    active = excluded.active,
    sort_order = excluded.sort_order;

insert into public.creative_channel_formats (channel_code, format_code)
values ('no_tag', 'custom')
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

revoke all on function public.workflow_normalize_creative_channel(text)
from public, anon, authenticated;
revoke all on function public.workflow_normalize_creative_channels(text[], boolean)
from public, anon, authenticated;

select pg_notify('pgrst', 'reload schema');

commit;

-- Verification:
-- select public.marketing_normalize_channel('No Tag');
-- select public.workflow_normalize_creative_channel('No Tag');
-- select public.workflow_normalize_creative_channels(array['No Tag'], false);
-- Expected error:
-- select public.workflow_normalize_creative_channels(array['No Tag', 'Facebook'], false);
-- select code, label, active from public.creative_channels where code = 'no_tag';
-- select channel_code, format_code from public.creative_channel_formats where channel_code = 'no_tag';
