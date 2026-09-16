-- Read-only preflight for Phase 2B.4 step 3. Run after applying
-- battle_pass_diagnosis_fingerprint.sql. Every row must read PASS.
--
-- Calls nothing that costs money: it never dispatches to Alpha and never calls
-- battle_pass_diagnosis_save() (that would write a real ledger row - the dedicated,
-- clearly-marked harness for that is battle_pass_diagnosis_e2e_test.sql /
-- _e2e_cleanup.sql, same pattern 2B.2 already established, deliberately not reused here).
--
-- battle_pass_diagnosis_context() IS called, inside a rolled-back transaction impersonating
-- service_role the same way battle_pass_diagnosis_verify.sql already does - it is STABLE and
-- read-only, so there is nothing to roll back in practice; the transaction wrapper is
-- belt-and-braces, not a safety requirement.
begin;
set local request.jwt.claims = '{"role":"service_role"}';

with
fns(signature) as (values
  ('public.battle_pass_diagnosis_context(uuid)'),
  ('public.battle_pass_diagnosis_save(uuid,jsonb,jsonb)'),
  ('battle_pass_private.diagnosis_fingerprint(uuid)')
),
fn as (select signature, to_regprocedure(signature)::oid as oid from fns),
-- Every real tick that already exists (there may be none - see spec §10 assumption 1).
-- context() is called once per tick and its result reused by both checks below.
live as (
  select t.run_id, public.battle_pass_diagnosis_context(t.run_id) as ctx
  from battle_pass_private.production_ticks t
),
checks as (
  -- ---- the column ------------------------------------------------------------------------
  select 'column_exists_and_nullable' as check_name, coalesce((
    select c.is_nullable = 'YES'
    from information_schema.columns c
    where c.table_schema = 'battle_pass_private' and c.table_name = 'diagnosis_requests'
      and c.column_name = 'context_fingerprint'
  ), false) as passed
  union all
  -- ---- functions exist, dependency on step 1 is real ---------------------------------------
  select 'fn_exists: ' || signature, oid is not null from fn
  union all
  -- ---- nothing about grants moved: same tiers as 2B.2 shipped -----------------------------
  select 'context_still_not_reachable_by_browser', coalesce((
    select not has_function_privilege('anon', to_regprocedure('public.battle_pass_diagnosis_context(uuid)'), 'EXECUTE')
       and not has_function_privilege('authenticated', to_regprocedure('public.battle_pass_diagnosis_context(uuid)'), 'EXECUTE')
       and has_function_privilege('service_role', to_regprocedure('public.battle_pass_diagnosis_context(uuid)'), 'EXECUTE')
  ), false)
  union all
  select 'save_still_not_reachable_by_browser', coalesce((
    select not has_function_privilege('anon', to_regprocedure('public.battle_pass_diagnosis_save(uuid,jsonb,jsonb)'), 'EXECUTE')
       and not has_function_privilege('authenticated', to_regprocedure('public.battle_pass_diagnosis_save(uuid,jsonb,jsonb)'), 'EXECUTE')
       and has_function_privilege('service_role', to_regprocedure('public.battle_pass_diagnosis_save(uuid,jsonb,jsonb)'), 'EXECUTE')
  ), false)
  union all
  select 'context_and_save_still_security_definer_with_pinned_path', coalesce((
    select bool_and(p.prosecdef and p.proconfig::text like '%search_path=%')
    from pg_catalog.pg_proc p
    where p.oid in (
      to_regprocedure('public.battle_pass_diagnosis_context(uuid)'),
      to_regprocedure('public.battle_pass_diagnosis_save(uuid,jsonb,jsonb)'))
  ), false)
  union all
  -- ---- the migration actually landed, not just the column ---------------------------------
  select 'context_body_reports_fingerprint', coalesce((
    select p.prosrc like '%contextFingerprint%' and p.prosrc like '%diagnosis_fingerprint%'
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.battle_pass_diagnosis_context(uuid)')
  ), false)
  union all
  select 'save_body_validates_and_stores_fingerprint', coalesce((
    select p.prosrc like '%contextFingerprint%'
       and p.prosrc like '%context_fingerprint%'
       and p.prosrc like '%[0-9a-f]{32}%'
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.battle_pass_diagnosis_save(uuid,jsonb,jsonb)')
  ), false)
  union all
  -- ---- behavioural, against whatever real ticks already exist (PASS vacuously if none) ----
  select 'context_fingerprint_is_wellformed_or_null', coalesce((
    select bool_and(ctx->>'contextFingerprint' is null or ctx->>'contextFingerprint' ~ '^[0-9a-f]{32}$')
    from live
  ), true)
  union all
  -- The whole point of step 3: context() must report EXACTLY what the shared helper computes -
  -- one source of truth, not two numbers that happen to agree today.
  select 'context_fingerprint_matches_the_shared_helper', coalesce((
    select bool_and(
      (ctx->>'contextFingerprint') is not distinct from battle_pass_private.diagnosis_fingerprint(run_id))
    from live
  ), true)
  union all
  select 'context_still_returns_every_2b2_field', coalesce((
    select bool_and(
      ctx ? 'schemaVersion' and ctx ? 'run' and ctx ? 'issues' and ctx ? 'lastSuccess'
      and ctx ? 'recentSameCode' and ctx ? 'catalog')
    from live
  ), true)
  union all
  -- ---- legacy rows are untouched, and existing rows (if any) predate this migration -------
  select 'existing_rows_have_no_backfilled_fingerprint', coalesce((
    select count(*) = 0 from battle_pass_private.diagnosis_requests
    where context_fingerprint is not null
  ), true)
  union all
  -- ---- nothing else in 2B.2/2B.3/2B.4 moved ------------------------------------------------
  select 'route_and_get_untouched', coalesce((
    select has_function_privilege('authenticated', to_regprocedure('public.battle_pass_diagnosis_route(uuid)'), 'EXECUTE')
       and has_function_privilege('service_role', to_regprocedure('public.battle_pass_diagnosis_route(uuid)'), 'EXECUTE')
       and has_function_privilege('authenticated', to_regprocedure('public.battle_pass_diagnosis_get(uuid)'), 'EXECUTE')
  ), false)
  union all
  select 'recovery_core_untouched', coalesce((
    select not has_function_privilege('service_role', to_regprocedure('battle_pass_private.retry_eligibility(text)'), 'EXECUTE')
  ), false)
  union all
  select 'retry_control_still_locked_down', coalesce((
    select has_function_privilege('authenticated', to_regprocedure('public.battle_pass_retry(text)'), 'EXECUTE')
       and not has_function_privilege('service_role', to_regprocedure('public.battle_pass_retry(text)'), 'EXECUTE')
  ), false)
  union all
  select 'scheduler_untouched_30m', coalesce((
    select j.schedule = '*/30 * * * *' from cron.job j
    where j.jobname = 'battle-pass-production-30m'
  ), false)
  union all
  select 'no_recovery_decisions_table_yet',
    to_regclass('battle_pass_private.recovery_decisions') is null
)
select check_name, case when passed then 'PASS' else 'FAIL' end as result
from checks order by check_name;

rollback;
