-- Marketing Plan performance Phase 2
--
-- Purpose:
--   1. Backfill direct Marketing Plan -> FlowMate work item IDs from historical
--      #detail/CR-xxxx links.
--   2. Remove regex/OR joins from Timeline and Supervisor reporting views.
--   3. Add indexes for the three-month timeline/calendar access pattern.
--
-- Run after:
--   1. supabase/marketing_plan.sql
--   2. supabase/marketing_plan_status_update.sql
--   3. supabase/marketing_plan_supervisor.sql
--
-- This migration is idempotent. It does not delete rows, rename view columns,
-- change RLS policies, or overwrite an existing flowmate_work_item_id.

begin;

do $phase2_preflight$
begin
  if to_regclass('public.marketing_plans') is null
     or to_regclass('public.marketing_campaigns') is null
     or to_regclass('public.marketing_content_items') is null
     or to_regclass('public.marketing_channel_placements') is null
     or to_regclass('public.work_items') is null then
    raise exception
      'Phase 2 requires Marketing Plan and FlowMate tables; run marketing_plan.sql first';
  end if;

  if to_regclass('public.marketing_plan_timeline_v') is null then
    raise exception
      'Phase 2 requires marketing_plan_timeline_v; run marketing_plan.sql first';
  end if;

  if to_regclass('public.marketing_plan_supervisor_monthly_v') is null then
    raise exception
      'Phase 2 requires marketing_plan_supervisor_monthly_v; run marketing_plan_supervisor.sql first';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'marketing_content_items'
      and column_name = 'flowmate_work_item_id'
  ) then
    raise exception
      'Phase 2 requires marketing_content_items.flowmate_work_item_id';
  end if;
end;
$phase2_preflight$;

-- Historical rows may have a FlowMate detail URL but no direct UUID link.
-- Only fill null IDs. work_items.display_id is unique, so each match is
-- deterministic and an existing manual/direct assignment is never replaced.
do $phase2_backfill$
declare
  v_backfilled_count integer := 0;
begin
  update public.marketing_content_items mci
     set flowmate_work_item_id = wi.id,
         updated_at = now()
    from public.work_items wi
   where mci.flowmate_work_item_id is null
     and substring(coalesce(mci.brief_link, '') from '#detail/([^/?#]+)') is not null
     and upper(wi.display_id) = upper(
       substring(coalesce(mci.brief_link, '') from '#detail/([^/?#]+)')
     );

  get diagnostics v_backfilled_count = row_count;
  raise notice 'Marketing Plan Phase 2 backfilled % direct work-item link(s)',
    v_backfilled_count;
end;
$phase2_backfill$;

create index if not exists idx_marketing_plans_active_month
on public.marketing_plans(month_key, id)
where status <> 'archived';

create index if not exists idx_marketing_content_items_flowmate_work_item
on public.marketing_content_items(flowmate_work_item_id)
where flowmate_work_item_id is not null;

create index if not exists idx_marketing_channel_placements_publish_schedule
on public.marketing_channel_placements(publish_date, publish_time, content_item_id)
where placement_status <> 'cancelled';

-- Keep the exact existing column order. Only the work_items join changes, so
-- CREATE OR REPLACE VIEW does not trigger PostgreSQL error 42P16.
create or replace view public.marketing_plan_timeline_v
with (security_invoker = true) as
select
  mp.id as plan_id,
  mp.month_key,
  mp.title as plan_title,
  mp.market,
  mp.audience_scope,
  mp.plan_date,
  mp.status as plan_status,
  mc.id as campaign_id,
  mc.name as campaign_name,
  mc.team as campaign_team,
  mc.start_date as campaign_start_date,
  mc.end_date as campaign_end_date,
  mc.sort_order as campaign_sort_order,
  mci.id as content_item_id,
  mci.title as content_title,
  mci.details,
  mci.team as content_team,
  mci.format,
  mci.content_tier,
  mci.pic_user_id,
  mci.pic_name,
  mci.note as content_note,
  mci.brief_link,
  mci.source_start_date,
  mci.source_start_time,
  mci.flowmate_work_item_id,
  mci.status as content_status,
  mci.sort_order as content_sort_order,
  mcp.id as placement_id,
  mcp.channel,
  mcp.publish_date,
  mcp.publish_time,
  mcp.placement_status,
  mcp.posted_url,
  mcp.note as placement_note,
  wi.status as flowmate_status,
  wi.display_id as flowmate_display_id,
  mci.sub_pic_user_id,
  mci.sub_pic_name
from public.marketing_plans mp
join public.marketing_campaigns mc on mc.plan_id = mp.id
join public.marketing_content_items mci on mci.campaign_id = mc.id
join public.marketing_channel_placements mcp on mcp.content_item_id = mci.id
left join public.work_items wi on wi.id = mci.flowmate_work_item_id
where mp.status <> 'archived'
  and mcp.placement_status <> 'cancelled';

create or replace view public.marketing_plan_supervisor_monthly_v
with (security_invoker = true) as
with base as (
  select
    mp.id as plan_id,
    mp.month_key,
    mc.id as campaign_id,
    mc.name as campaign_name,
    mc.team as campaign_team,
    mci.id as content_item_id,
    mci.title as product_event,
    mci.team as content_team,
    mci.pic_user_id,
    coalesce(nullif(trim(mci.pic_name), ''), pic_user.display_name) as pic_name,
    mcp.id as placement_id,
    mcp.channel,
    coalesce(mci.source_start_date, mcp.publish_date, mc.start_date, mp.plan_date) as launch_date,
    mcp.publish_date,
    mcp.publish_time,
    coalesce(mcp.placement_status, mci.status) as stored_status,
    wi.status as flowmate_status,
    mci.brief_link,
    coalesce(mci.first_assigned_at, mcp.first_assigned_at, mci.brief_link_added_at) as first_assigned_at,
    coalesce(mci.first_assigned_by_user_id, mci.brief_link_added_by_user_id) as assigned_by_user_id,
    mci.created_at,
    mci.updated_at,
    not public.marketing_plan_is_non_empty_text(mci.brief_link) as missing_brief_link
  from public.marketing_plans mp
  join public.marketing_campaigns mc on mc.plan_id = mp.id
  join public.marketing_content_items mci on mci.campaign_id = mc.id
  left join public.marketing_channel_placements mcp on mcp.content_item_id = mci.id
  left join public.work_items wi on wi.id = mci.flowmate_work_item_id
  left join public.users pic_user on pic_user.id = mci.pic_user_id
  where mp.status <> 'archived'
    and coalesce(mcp.placement_status, '') <> 'cancelled'
    and public.is_admin_app_user()
),
enriched as (
  select
    base.*,
    case
      when base.flowmate_status = 'review' then 'review'
      when base.flowmate_status = 'delivered' then 'ready_to_post'
      when base.stored_status = 'planned' and base.missing_brief_link = false then 'assigned'
      else base.stored_status
    end as effective_status,
    case
      when base.first_assigned_at is null or base.launch_date is null then null
      else public.marketing_plan_count_working_days(base.launch_date, base.first_assigned_at::date)
    end as working_days_before_launch,
    case
      when base.first_assigned_at is null or base.launch_date is null then null
      else base.launch_date - base.first_assigned_at::date
    end as calendar_days_before_launch,
    case
      when base.launch_date is null then null
      else public.marketing_plan_count_working_days(base.launch_date, current_date)
    end as working_days_remaining
  from base
)
select
  plan_id,
  month_key,
  campaign_id,
  campaign_name,
  campaign_team,
  content_item_id,
  product_event,
  content_team,
  pic_user_id,
  pic_name,
  placement_id,
  channel,
  launch_date,
  publish_date,
  publish_time,
  stored_status,
  effective_status,
  brief_link,
  first_assigned_at,
  assigned_by_user_id,
  working_days_before_launch,
  calendar_days_before_launch,
  case
    when launch_date is null then 'Watch'
    when first_assigned_at is null and launch_date <= current_date then 'Critical'
    when first_assigned_at is not null and first_assigned_at::date >= launch_date then 'Critical'
    when first_assigned_at is null and launch_date > current_date and missing_brief_link and working_days_remaining <= 1 then 'Critical'
    when first_assigned_at is not null and working_days_before_launch between 1 and 2 then 'Risk'
    when first_assigned_at is not null and working_days_before_launch between 3 and 4 then 'Watch'
    when first_assigned_at is not null and working_days_before_launch >= 5 then 'Healthy'
    when first_assigned_at is null and working_days_remaining <= 2 then 'Risk'
    when first_assigned_at is null then 'Watch'
    else 'Risk'
  end as risk_bucket,
  missing_brief_link,
  created_at,
  updated_at
from enriched;

revoke all privileges on public.marketing_plan_timeline_v
from public, anon, authenticated;
grant select on public.marketing_plan_timeline_v to authenticated;

revoke all privileges on public.marketing_plan_supervisor_monthly_v
from public, anon, authenticated;
grant select on public.marketing_plan_supervisor_monthly_v to authenticated;

comment on view public.marketing_plan_timeline_v is
  'Marketing Plan timeline using direct indexed FlowMate work-item links.';
comment on view public.marketing_plan_supervisor_monthly_v is
  'Admin Marketing Plan reporting using direct indexed FlowMate work-item links.';

commit;

select pg_notify('pgrst', 'reload schema');

