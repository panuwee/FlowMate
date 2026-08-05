-- FlowMate Marketing Plan status update
-- Run after supabase/marketing_plan.sql on databases that already have Marketing Plan tables.

begin;

alter table public.marketing_channel_placements
  drop constraint if exists marketing_channel_placements_status_check;

alter table public.marketing_channel_placements
  add constraint marketing_channel_placements_status_check check (
    placement_status in (
      'planned',
      'assigned',
      'review',
      'ready',
      'ready_to_post',
      'scheduled',
      'posted',
      'delayed',
      'cancelled'
    )
  );

create or replace view public.marketing_campaign_summary_v
with (security_invoker = true) as
select
  mp.id as plan_id,
  mp.month_key,
  mp.market,
  mc.id as campaign_id,
  mc.name as campaign_name,
  mc.team as campaign_team,
  mc.start_date,
  mc.end_date,
  mc.sort_order,
  count(distinct mci.id) as total_content_items,
  count(mcp.id) as total_placements,
  coalesce(
    array_agg(distinct mcp.channel order by mcp.channel)
      filter (where mcp.channel is not null),
    '{}'::text[]
  ) as channels_covered,
  count(mcp.id) filter (where mcp.placement_status = 'posted') as posted_count,
  count(mcp.id) filter (where mcp.placement_status in ('ready', 'ready_to_post')) as ready_count,
  count(mcp.id) filter (where mcp.placement_status = 'delayed') as delayed_count,
  count(distinct mci.id) filter (where mci.status = 'not_started') as not_started_count,
  min(mcp.publish_date) filter (
    where mcp.placement_status <> 'cancelled'
      and mcp.publish_date >= current_date
  ) as next_publish_date
from public.marketing_plans mp
join public.marketing_campaigns mc on mc.plan_id = mp.id
left join public.marketing_content_items mci on mci.campaign_id = mc.id
left join public.marketing_channel_placements mcp
  on mcp.content_item_id = mci.id
 and mcp.placement_status <> 'cancelled'
where mp.status <> 'archived'
group by mp.id, mp.month_key, mp.market, mc.id, mc.name, mc.team, mc.start_date, mc.end_date, mc.sort_order;

revoke all privileges on public.marketing_campaign_summary_v from public, anon, authenticated;
grant select on public.marketing_campaign_summary_v to authenticated;

commit;
