-- FlowMate Creative monthly KPI data foundation — read-only verification
-- Run after creative_monthly_kpi_data_foundation.sql in the approved environment.

begin read only;
set local statement_timeout = '60s';

select
  to_regprocedure('public.flowmate_kpi_can_view()') is not null as viewer_gate_ready,
  to_regprocedure(
    'public.flowmate_kpi_working_duration_days(timestamp with time zone,timestamp with time zone,text)'
  ) is not null as duration_helper_ready,
  to_regprocedure(
    'public.flowmate_kpi_working_date_gap(date,date,text)'
  ) is not null as date_gap_helper_ready,
  to_regclass('public.flowmate_creative_kpi_facts_v') is not null as facts_view_ready,
  to_regclass('public.flowmate_creative_kpi_gdve_monthly_v') is not null as gdve_monthly_ready,
  to_regclass('public.flowmate_creative_kpi_requester_monthly_v') is not null as requester_monthly_ready;

select
  c.relname as view_name,
  coalesce(c.reloptions, '{}'::text[]) @> array['security_invoker=true'] as security_invoker
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'flowmate_creative_kpi_facts_v',
    'flowmate_creative_kpi_gdve_monthly_v',
    'flowmate_creative_kpi_requester_monthly_v'
  )
order by c.relname;

select
  p.proname as function_name,
  p.prosecdef as security_definer,
  p.provolatile as volatility,
  p.proconfig as function_settings
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'flowmate_kpi_can_view',
    'flowmate_kpi_working_duration_days',
    'flowmate_kpi_working_date_gap'
  )
order by p.proname;

select
  grant_info.table_name,
  grant_info.grantee,
  grant_info.privilege_type
from information_schema.role_table_grants grant_info
where grant_info.table_schema = 'public'
  and grant_info.table_name in (
    'flowmate_creative_kpi_facts_v',
    'flowmate_creative_kpi_gdve_monthly_v',
    'flowmate_creative_kpi_requester_monthly_v'
  )
  and grant_info.grantee in ('anon', 'authenticated')
order by grant_info.table_name, grant_info.grantee, grant_info.privilege_type;

select
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.flowmate_creative_kpi_facts_v',
    'SELECT'
  ) as authenticated_can_read_facts,
  not pg_catalog.has_table_privilege(
    'anon',
    'public.flowmate_creative_kpi_facts_v',
    'SELECT'
  ) as anon_cannot_read_facts,
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.flowmate_creative_kpi_gdve_monthly_v',
    'SELECT'
  ) as authenticated_can_read_gdve_monthly,
  not pg_catalog.has_table_privilege(
    'anon',
    'public.flowmate_creative_kpi_gdve_monthly_v',
    'SELECT'
  ) as anon_cannot_read_gdve_monthly,
  pg_catalog.has_table_privilege(
    'authenticated',
    'public.flowmate_creative_kpi_requester_monthly_v',
    'SELECT'
  ) as authenticated_can_read_requester_monthly,
  not pg_catalog.has_table_privilege(
    'anon',
    'public.flowmate_creative_kpi_requester_monthly_v',
    'SELECT'
  ) as anon_cannot_read_requester_monthly;

select
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.flowmate_kpi_can_view()',
    'EXECUTE'
  ) as authenticated_can_execute_viewer_gate,
  not pg_catalog.has_function_privilege(
    'anon',
    'public.flowmate_kpi_can_view()',
    'EXECUTE'
  ) as anon_cannot_execute_viewer_gate,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.flowmate_kpi_working_duration_days(timestamp with time zone,timestamp with time zone,text)',
    'EXECUTE'
  ) as authenticated_can_execute_duration_helper,
  not pg_catalog.has_function_privilege(
    'anon',
    'public.flowmate_kpi_working_duration_days(timestamp with time zone,timestamp with time zone,text)',
    'EXECUTE'
  ) as anon_cannot_execute_duration_helper;

select
  public.flowmate_kpi_working_date_gap('2026-09-07', '2026-09-07', 'requester') = 0
    as same_day_gap_is_zero,
  public.flowmate_kpi_working_date_gap('2026-09-07', '2026-09-08', 'requester') = 1
    as next_weekday_gap_is_one,
  public.flowmate_kpi_working_date_gap('2026-09-08', '2026-09-07', 'requester') = -1
    as reversed_gap_is_negative,
  public.flowmate_kpi_working_duration_days(
    '2026-09-07 09:00:00+07'::timestamptz,
    '2026-09-07 21:00:00+07'::timestamptz,
    'gdve'
  ) = 0.5
    as twelve_hours_is_half_working_date;

do $privileged_user_preflight$
begin
  if not exists (
    select 1
    from public.users u
    where u.is_active = true
      and (u.role = 'admin' or u.can_access_all_teams = true)
  ) then
    raise exception 'KPI verifier requires one active Supervisor/Admin user';
  end if;
end;
$privileged_user_preflight$;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  (
    select u.id::text
    from public.users u
    where u.is_active = true
      and (u.role = 'admin' or u.can_access_all_teams = true)
    order by u.id
    limit 1
  ),
  true
);

select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub',
    pg_catalog.current_setting('request.jwt.claim.sub', true),
    'role',
    'authenticated'
  )::text,
  true
);

set local role authenticated;

select
  count(*) as creative_fact_rows,
  count(*) filter (where review_submitted_at is not null) as reviewed_rows,
  count(*) filter (where cardinality(data_quality_flags) > 0) as data_quality_flagged_rows,
  count(*) filter (where cardinality(exception_flags) > 0) as exception_rows,
  count(*) filter (where owner_member_id_at_start is null) as missing_owner_at_start_rows,
  count(*) filter (
    where review_submitted_at is not null and first_requester_activity_at is null
  ) as reviewed_without_requester_activity_rows
from public.flowmate_creative_kpi_facts_v;

select
  review_month,
  scope,
  person_id,
  person_name,
  n,
  time_to_start_n,
  production_n,
  exception_n,
  small_sample
from public.flowmate_creative_kpi_gdve_monthly_v
where review_month >= date_trunc('month', current_date)::date - interval '5 months'
order by review_month, scope, person_name;

select
  review_month,
  scope,
  person_id,
  person_name,
  n,
  brief_lead_n,
  review_response_n,
  review_sla_denominator,
  pending_review_over_sla_n,
  exception_n,
  small_sample
from public.flowmate_creative_kpi_requester_monthly_v
where review_month >= date_trunc('month', current_date)::date - interval '5 months'
order by review_month, scope, person_name;

explain (costs, verbose, format json)
select *
from public.flowmate_creative_kpi_gdve_monthly_v
where review_month >= date_trunc('month', current_date)::date - interval '5 months';

explain (costs, verbose, format json)
select *
from public.flowmate_creative_kpi_requester_monthly_v
where review_month >= date_trunc('month', current_date)::date - interval '5 months';

rollback;
