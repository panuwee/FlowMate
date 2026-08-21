-- FlowMate Marketing Plan: Brief requirement option
-- Run once in Supabase SQL Editor after the existing Marketing Plan SQL is installed.
-- Existing rows intentionally remain `requires_brief = true`.

begin;

alter table public.marketing_content_items
  add column if not exists requires_brief boolean not null default true;

-- Keep the existing timeline contract and append the new field so PostgREST
-- can return it to Working Sheet without changing existing column positions.
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
  mci.sub_pic_name,
  mci.requires_brief
from public.marketing_plans mp
join public.marketing_campaigns mc on mc.plan_id = mp.id
join public.marketing_content_items mci on mci.campaign_id = mc.id
join public.marketing_channel_placements mcp on mcp.content_item_id = mci.id
left join public.work_items wi on wi.id = mci.flowmate_work_item_id
where mp.status <> 'archived'
  and mcp.placement_status <> 'cancelled';

-- Retain the existing Supervisor output fields, but exclude explicitly
-- no-brief rows from the Missing Brief calculation and summaries.
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
    mci.requires_brief,
    coalesce(mci.first_assigned_at, mcp.first_assigned_at, mci.brief_link_added_at) as first_assigned_at,
    coalesce(mci.first_assigned_by_user_id, mci.brief_link_added_by_user_id) as assigned_by_user_id,
    mci.created_at,
    mci.updated_at,
    mci.requires_brief and not public.marketing_plan_is_non_empty_text(mci.brief_link) as missing_brief_link
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
      when base.stored_status = 'planned' and base.requires_brief and base.missing_brief_link = false then 'assigned'
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

commit;

select pg_notify('pgrst', 'reload schema');

-- Verification: must return one row with requires_brief = true.
select column_name, column_default, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'marketing_content_items'
  and column_name = 'requires_brief';
