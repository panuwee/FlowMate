-- Read-only verification for marketing_plan_performance_phase2.sql
-- Run after the Phase 2 migration. This file does not modify data.

-- 1. Every historical FlowMate detail link that resolves to a work item should
--    now have the same direct UUID link. Expected mismatched_links = 0.
select count(*) as mismatched_links
from public.marketing_content_items mci
join public.work_items wi
  on upper(wi.display_id) = upper(
    substring(coalesce(mci.brief_link, '') from '#detail/([^/?#]+)')
  )
where mci.flowmate_work_item_id is distinct from wi.id;

-- 2. Both views must remain security-invoker and must not contain the old
--    regex/OR work_items join. Expected values: true, false, false.
select
  coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true'] as timeline_security_invoker,
  pg_get_viewdef('public.marketing_plan_timeline_v'::regclass, true)
    ~* 'substring.*brief_link' as timeline_has_regex_join,
  pg_get_viewdef('public.marketing_plan_supervisor_monthly_v'::regclass, true)
    ~* 'substring.*brief_link' as supervisor_has_regex_join
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'marketing_plan_timeline_v';

-- 3. Expected three index rows.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_marketing_plans_active_month',
    'idx_marketing_content_items_flowmate_work_item',
    'idx_marketing_channel_placements_publish_schedule'
  )
order by indexname;

-- 4. Timeline counts for the current three-month window. Compare working_rows
--    with Current Working Rows after all UI filters are cleared; placement_rows
--    can be higher when one asset has multiple Channel Tags.
select
  month_key,
  count(*) as placement_rows,
  count(distinct content_item_id) as working_rows
from public.marketing_plan_timeline_v
where month_key in (
  to_char(current_date, 'YYYY-MM'),
  to_char(current_date + interval '1 month', 'YYYY-MM'),
  to_char(current_date + interval '2 months', 'YYYY-MM')
)
group by month_key
order by month_key;

-- 5. Inspect the real execution plan. On very small tables PostgreSQL may
--    correctly choose a sequential scan; focus on execution time, loops, and
--    whether the old OR/regex join is absent.
explain (analyze, buffers, format text)
select
  month_key,
  content_item_id,
  channel,
  publish_date,
  publish_time,
  flowmate_status
from public.marketing_plan_timeline_v
where month_key in (
  to_char(current_date, 'YYYY-MM'),
  to_char(current_date + interval '1 month', 'YYYY-MM'),
  to_char(current_date + interval '2 months', 'YYYY-MM')
)
order by month_key, publish_date, publish_time,
  campaign_sort_order, content_sort_order;
