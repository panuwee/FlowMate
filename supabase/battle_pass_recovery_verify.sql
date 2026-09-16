-- Read-only preflight for Phase 2B.4 steps 4 AND 5 (this is the file spec §9 calls
-- battle_pass_recovery_verify.sql at step 6 - step 5's checks are appended below rather than
-- started in a new file, as planned in this file's original header).
-- Every row must read PASS.
--
-- Calls nothing that costs money and writes nothing. battle_pass_recovery_proposals() is
-- STABLE and safe to call for real; battle_pass_recovery_decide() is NOT called anywhere in
-- this file, even with a doomed-to-fail diagnosis id, because an approve path that happened to
-- pass every guard would call the real public.battle_pass_retry() - a routine verify script
-- must never risk that. decide()'s structure (grants, volatility, security definer) is
-- checked; its behaviour is not, for the same reason 2B.2 never called
-- battle_pass_diagnosis_save() from its own verify script either.
--
-- Reproducing every one of guard 2/5-13's individual blockedBy codes, and decide()'s
-- approve/reject/already-decided/checksum-mismatch behaviour, needs synthetic rows
-- (diagnosis_requests, a fake production_ticks row, and - to exercise guard 13's 'held' and
-- 'not_failed' cases - a synthetic monthly_runs row under a period that can never collide with
-- a real one). That is a separate, clearly-marked e2e harness in the same spirit as
-- battle_pass_diagnosis_e2e_test.sql / _e2e_cleanup.sql, not folded into this routine check -
-- still open, tracked in PHASE_2B4_MVP_SPEC.md's build order.
-- battle_pass_recovery_proposals() gates on require_operator(), not require_worker() - unlike
-- battle_pass_diagnosis_route()'s dual-mode gate, it accepts an operator only. Impersonating
-- service_role here (as the diagnosis/core verify scripts do) would make auth.uid() null and
-- every call below would raise 'Operator access denied' instead of returning a result, so this
-- one instead impersonates the same real owner uuid battle_pass_diagnosis_e2e_test.sql uses,
-- for one rolled-back transaction only.
begin;
set local request.jwt.claims = '{"sub":"5abad25d-3e8c-4a0d-baa6-0a0615ba00fc","role":"authenticated"}';

with
fns(signature) as (values
  ('public.battle_pass_recovery_proposals(integer)'),
  ('battle_pass_private.recovery_guards(bigint)'),
  ('public.battle_pass_recovery_decide(bigint,text,text,text,text)'),
  ('public.battle_pass_recovery_history(integer)')
),
fn as (select signature, to_regprocedure(signature)::oid as oid from fns),
-- The proposals RPC run for real, against whatever exists today.
live as (
  select public.battle_pass_recovery_proposals(50) as result
),
-- Every diagnosis recovery_guards() itself calls "candidate" (independent of proposals()'s
-- own SQL), so the count comparison below isn't just proposals() checking its own homework.
candidates as (
  select dr.diagnosis_id,
    (battle_pass_private.recovery_guards(dr.diagnosis_id)->>'candidate')::boolean as is_candidate
  from battle_pass_private.diagnosis_requests dr
  where dr.route = 'ai' and dr.schema_valid
    and not exists (
      select 1 from battle_pass_private.recovery_decisions rd
      where rd.diagnosis_id = dr.diagnosis_id)
),
checks as (
  -- ---- the table --------------------------------------------------------------------------
  select 'table_exists_with_rls' as check_name, coalesce((
    select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = to_regclass('battle_pass_private.recovery_decisions')
  ), false) as passed
  union all
  select 'table_not_readable_by_browser', coalesce((
    select not has_table_privilege('authenticated','battle_pass_private.recovery_decisions','SELECT')
       and not has_table_privilege('anon','battle_pass_private.recovery_decisions','SELECT')
  ), false)
  union all
  select 'one_decision_per_diagnosis_unique_index', exists (
    select 1 from pg_catalog.pg_indexes
    where schemaname='battle_pass_private' and indexname='battle_pass_recovery_one_decision_idx'
  )
  union all
  select 'period_and_decided_at_lookup_indexes_present', (
    select count(*) = 2 from pg_catalog.pg_indexes
    where schemaname='battle_pass_private'
      and indexname in ('battle_pass_recovery_period_idx','battle_pass_recovery_decided_at_idx')
  )
  union all
  select 'decided_by_is_not_null', coalesce((
    select c.is_nullable = 'NO' from information_schema.columns c
    where c.table_schema='battle_pass_private' and c.table_name='recovery_decisions'
      and c.column_name='decided_by'
  ), false)
  union all
  -- bool_or rather than a bare scalar subquery: Postgres may represent more than one
  -- constraint-like row per column (e.g. a NOT NULL entry alongside the CHECK in newer
  -- versions), and a bare subquery raises "more than one row" the moment that happens.
  select 'proposed_action_constraint_allows_the_amended_pair', coalesce((
    select bool_or(pg_get_constraintdef(con.oid) like '%retry%'
                and pg_get_constraintdef(con.oid) like '%resume_from_create_cr%')
    from pg_catalog.pg_constraint con
    where con.conrelid = to_regclass('battle_pass_private.recovery_decisions')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%proposed_action%'
  ), false)
  union all
  select 'decision_constraint_is_approved_or_rejected', coalesce((
    select bool_or(pg_get_constraintdef(con.oid) like '%approved%'
                and pg_get_constraintdef(con.oid) like '%rejected%')
    from pg_catalog.pg_constraint con
    where con.conrelid = to_regclass('battle_pass_private.recovery_decisions')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%decision%'
      and pg_get_constraintdef(con.oid) not like '%proposed_action%'
  ), false)
  union all
  -- ---- functions exist and are locked down correctly ---------------------------------------
  select 'fn_exists: ' || signature, oid is not null from fn
  union all
  select 'proposals_is_stable_definer_pinned', coalesce((
    select p.provolatile = 's' and p.prosecdef and p.proconfig::text like '%search_path=%'
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.battle_pass_recovery_proposals(integer)')
  ), false)
  union all
  select 'guards_is_stable_non_definer_pinned', coalesce((
    select p.provolatile = 's' and not p.prosecdef and p.proconfig::text like '%search_path=%'
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('battle_pass_private.recovery_guards(bigint)')
  ), false)
  union all
  -- ---- grants: proposals is operator-only; guards is reachable by nobody -------------------
  select 'proposals_reachable_only_by_authenticated', case when oid is null then false else (
    select not has_function_privilege('anon', to_regprocedure('public.battle_pass_recovery_proposals(integer)'), 'EXECUTE')
       and has_function_privilege('authenticated', to_regprocedure('public.battle_pass_recovery_proposals(integer)'), 'EXECUTE')
       and not has_function_privilege('service_role', to_regprocedure('public.battle_pass_recovery_proposals(integer)'), 'EXECUTE')
  ) end from fn where signature = 'public.battle_pass_recovery_proposals(integer)'
  union all
  select 'guards_reachable_by_nobody', case when oid is null then false else (
    select not has_function_privilege('anon', to_regprocedure('battle_pass_private.recovery_guards(bigint)'), 'EXECUTE')
       and not has_function_privilege('authenticated', to_regprocedure('battle_pass_private.recovery_guards(bigint)'), 'EXECUTE')
       and not has_function_privilege('service_role', to_regprocedure('battle_pass_private.recovery_guards(bigint)'), 'EXECUTE')
  ) end from fn where signature = 'battle_pass_private.recovery_guards(bigint)'
  union all
  -- ---- step 5: decide/history exist, correctly typed, correctly locked down ----------------
  select 'decide_is_volatile_definer_pinned', coalesce((
    -- must NOT be stable: it writes recovery_decisions and can call battle_pass_retry
    select p.provolatile = 'v' and p.prosecdef and p.proconfig::text like '%search_path=%'
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)')
  ), false)
  union all
  select 'history_is_stable_definer_pinned', coalesce((
    select p.provolatile = 's' and p.prosecdef and p.proconfig::text like '%search_path=%'
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.battle_pass_recovery_history(integer)')
  ), false)
  union all
  select 'decide_reachable_only_by_authenticated', case when oid is null then false else (
    select not has_function_privilege('anon', to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)'), 'EXECUTE')
       and has_function_privilege('authenticated', to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)'), 'EXECUTE')
       and not has_function_privilege('service_role', to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)'), 'EXECUTE')
  ) end from fn where signature = 'public.battle_pass_recovery_decide(bigint,text,text,text,text)'
  union all
  select 'history_reachable_only_by_authenticated', case when oid is null then false else (
    select not has_function_privilege('anon', to_regprocedure('public.battle_pass_recovery_history(integer)'), 'EXECUTE')
       and has_function_privilege('authenticated', to_regprocedure('public.battle_pass_recovery_history(integer)'), 'EXECUTE')
       and not has_function_privilege('service_role', to_regprocedure('public.battle_pass_recovery_history(integer)'), 'EXECUTE')
  ) end from fn where signature = 'public.battle_pass_recovery_history(integer)'
  union all
  -- The critical negative from §8.2, stated as its own row so it can never be missed in a
  -- scroll of PASS rows: this is the one function in the phase that can execute a production
  -- action, and service_role - what bp-mcp and ai-diagnosis hold - must never reach it.
  select 'decide_rpc_is_not_the_ai_write_path', coalesce((
    select not has_function_privilege('service_role',
      to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)'), 'EXECUTE')
  ), false)
  union all
  select 'decide_body_records_before_acting', coalesce((
    select position('insert into battle_pass_private.recovery_decisions' in lower(p.prosrc))
             < position('battle_pass_retry' in lower(p.prosrc))
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)')
  ), false)
  union all
  select 'decide_body_checks_already_decided_before_inserting', coalesce((
    select position('already been decided' in p.prosrc)
             < position('insert into battle_pass_private.recovery_decisions' in lower(p.prosrc))
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)')
  ), false)
  union all
  select 'history_never_selects_a_raw_uuid_or_email_for_decided_by', coalesce((
    select p.prosrc like '%display_name%' and p.prosrc not like '%u.id%decidedBy%'
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('public.battle_pass_recovery_history(integer)')
  ), false)
  union all
  -- ---- behavioural, against whatever real diagnoses already exist (PASS vacuously if none) -
  select 'proposals_runs_without_raising', (select result is not null from live)
  union all
  select 'proposals_shape_has_observedat_and_array', (
    select jsonb_typeof(result->'observedAt') is not null and jsonb_typeof(result->'proposals') = 'array'
    from live)
  union all
  -- The RPC's own filtering must agree with the guard evaluator run independently here -
  -- proposals() is not just checking its own SQL against itself.
  select 'proposals_count_matches_independent_candidate_count', coalesce((
    select jsonb_array_length((select result->'proposals' from live))
         = (select count(*) from candidates where is_candidate)
  ), true)
  union all
  select 'no_proposal_carries_a_person_identifier', coalesce((
    select not ((select result from live)::text ~* '(email|display_name|"users")')
  ), true)
  union all
  select 'every_listed_proposal_has_a_diagnosisid_and_runid', coalesce((
    select bool_and(p ? 'diagnosisId' and p ? 'runId')
    from live, jsonb_array_elements(result->'proposals') p
  ), true)
  union all
  -- ---- nothing else already shipped moved ---------------------------------------------------
  select 'no_decisions_recorded_yet', coalesce((
    select count(*) = 0 from battle_pass_private.recovery_decisions
  ), true)
  union all
  select 'retry_control_still_locked_down', coalesce((
    select has_function_privilege('authenticated', to_regprocedure('public.battle_pass_retry(text)'), 'EXECUTE')
       and not has_function_privilege('service_role', to_regprocedure('public.battle_pass_retry(text)'), 'EXECUTE')
  ), false)
  union all
  select 'diagnosis_route_get_context_save_untouched', coalesce((
    select has_function_privilege('authenticated', to_regprocedure('public.battle_pass_diagnosis_route(uuid)'), 'EXECUTE')
       and has_function_privilege('service_role', to_regprocedure('public.battle_pass_diagnosis_route(uuid)'), 'EXECUTE')
       and has_function_privilege('authenticated', to_regprocedure('public.battle_pass_diagnosis_get(uuid)'), 'EXECUTE')
       and has_function_privilege('service_role', to_regprocedure('public.battle_pass_diagnosis_context(uuid)'), 'EXECUTE')
       and has_function_privilege('service_role', to_regprocedure('public.battle_pass_diagnosis_save(uuid,jsonb,jsonb)'), 'EXECUTE')
  ), false)
  union all
  select 'scheduler_untouched_30m', coalesce((
    select j.schedule = '*/30 * * * *' from cron.job j
    where j.jobname = 'battle-pass-production-30m'
  ), false)
)
select check_name, case when passed then 'PASS' else 'FAIL' end as result
from checks order by check_name;

rollback;
