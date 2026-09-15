-- Read-only verifier. Execute separately as Lead, ordinary user and anon.
-- Expected: Lead sees authorized KPI rows; ordinary user sees none; anon denied.
begin read only;
select current_user as database_role, auth.uid() as actor, public.flowmate_kpi_can_view() as kpi_access;
select relname,reloptions from pg_class where oid='public.flowmate_creative_kpi_progression_v'::regclass;
select count(*) as rows, count(distinct work_item_id) as unique_tasks,
 count(*) filter(where delivery_at is not null) as first_delivery_evidence,
 count(*) filter(where delivered_at is not null and delivery_at is null) as missing_first_delivery_event,
 count(*) filter(where ai_evidence_source='delivery_snapshot') as frozen_ai,
 count(*) filter(where deadline_source='first_assignment_snapshot') as frozen_baseline,
 count(*) filter(where acknowledge_at is not null) as acknowledge_evidence
from public.flowmate_creative_kpi_progression_v;
select to_char(delivery_at at time zone 'Asia/Bangkok','YYYY-MM') as month,
 count(*) as delivered, count(*) filter(where cardinality(delivered_ai_tags)>0) as ai_delivered
from public.flowmate_creative_kpi_progression_v
where delivery_at >= '2026-01-01 00:00+07' and delivery_at < '2027-01-01 00:00+07'
group by 1 order by 1;
select has_table_privilege('authenticated','public.creative_kpi_milestones','INSERT') as client_must_not_insert,
 has_table_privilege('authenticated','public.creative_kpi_brief_evidence','UPDATE') as client_must_not_update,
 has_function_privilege('anon','public.flowmate_creative_brief(uuid,text,text,bigint)','EXECUTE') as anon_must_not_execute;
rollback;
