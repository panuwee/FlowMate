-- PREPARED ONLY: requires separate approval before apply.
-- Additive reporting view; no work-item updates and no broadening of the KPI gate.
begin;
create or replace view public.flowmate_creative_kpi_report_v
with (security_invoker = true) as
select f.*, wi.title, wi.created_at, tm.member_code as owner_member_code,
  public.flowmate_kpi_ai_tags(f.work_item_id) as ai_tags,
  crd.asset_type_2, crd.asset_subtype_2, crd.asset_count_2,
  extract(year from wi.created_at at time zone 'Asia/Bangkok')::integer as created_year,
  extract(year from f.review_submitted_at at time zone 'Asia/Bangkok')::integer as review_year,
  extract(year from f.delivered_at at time zone 'Asia/Bangkok')::integer as delivery_year,
  f.status not in ('delivered', 'cancelled') as is_open
from public.flowmate_creative_kpi_facts_v f
join public.work_items wi on wi.id = f.work_item_id
left join public.team_members tm on tm.id = f.owner_member_id_at_start
left join public.creative_request_details crd on crd.work_item_id = f.work_item_id
where public.flowmate_kpi_can_view();
revoke all on public.flowmate_creative_kpi_report_v from public, anon, authenticated;
grant select on public.flowmate_creative_kpi_report_v to authenticated;
comment on view public.flowmate_creative_kpi_report_v is
  'Creative year-end evidence. Security invoker and existing Supervisor gate. Current metadata, not a historical frozen evaluation.';
commit;
