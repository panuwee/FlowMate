-- Phase 2B.4 deploy probe — IS EACH SQL STEP ALREADY ON THIS DATABASE?
--
-- READ ONLY. This file creates nothing, drops nothing, grants nothing and writes no row.
-- It is safe to run on production at any time, including while the worker is running.
-- Run it in the Supabase SQL Editor ("Run without RLS" is fine, it reads catalogs only).
--
-- HOW TO READ THE RESULT
--   status = APPLIED  -> that piece is already installed; do NOT re-run its file
--   status = MISSING  -> run the file named in the `run_this_file` column
-- Apply files in `step` order, top to bottom. Within one step, if ANY row says MISSING,
-- run that step's whole file (all of them are CREATE OR REPLACE / IF NOT EXISTS, so a
-- re-run is harmless), then re-run this probe to confirm the step flipped to APPLIED.
--
-- Step map (matches docs/PHASE_2B4_MVP_SPEC.md §9):
--   1  battle_pass_recovery_core.sql          shared retry rules + fingerprint helper
--   2a battle_pass_operator_retry.sql         battle_pass_retry refactored onto those rules
--   2b battle_pass_retry_grant_patch.sql      service_role revoked from battle_pass_retry
--   3  battle_pass_diagnosis_fingerprint.sql  context_fingerprint column + context/save
--   4  battle_pass_recovery.sql               recovery_decisions + guards + proposals RPC
--   5  battle_pass_recovery_decide.sql        decide RPC + history RPC
--
-- NOTE ON STEP 2a: it is detected by inspecting the installed body of battle_pass_retry for
-- a call to the shared rules. An APPLIED here means the live function is the refactored one;
-- a MISSING means the pre-2B.4 inline-guard version is still installed (which still works —
-- it just can disagree with the new read-only preview, which is the whole point of step 2).

with chk(step, item, ok, run_this_file) as (

  -- ---------------------------------------------------------------- step 1
  select '1', 'fn battle_pass_private.retry_reason_precheck(text,boolean)',
         to_regprocedure('battle_pass_private.retry_reason_precheck(text,boolean)') is not null,
         'battle_pass_recovery_core.sql'
  union all
  select '1', 'fn battle_pass_private.retry_reason_state(boolean,text,boolean,text)',
         to_regprocedure('battle_pass_private.retry_reason_state(boolean,text,boolean,text)') is not null,
         'battle_pass_recovery_core.sql'
  union all
  select '1', 'fn battle_pass_private.retry_reason(text,boolean,boolean,text,boolean,text)',
         to_regprocedure('battle_pass_private.retry_reason(text,boolean,boolean,text,boolean,text)') is not null,
         'battle_pass_recovery_core.sql'
  union all
  select '1', 'fn battle_pass_private.retry_reason_message(text,text,text)',
         to_regprocedure('battle_pass_private.retry_reason_message(text,text,text)') is not null,
         'battle_pass_recovery_core.sql'
  union all
  select '1', 'fn battle_pass_private.retry_reason_errcode(text)',
         to_regprocedure('battle_pass_private.retry_reason_errcode(text)') is not null,
         'battle_pass_recovery_core.sql'
  union all
  select '1', 'fn battle_pass_private.retry_eligibility(text)',
         to_regprocedure('battle_pass_private.retry_eligibility(text)') is not null,
         'battle_pass_recovery_core.sql'
  union all
  select '1', 'fn battle_pass_private.diagnosis_fingerprint(uuid)',
         to_regprocedure('battle_pass_private.diagnosis_fingerprint(uuid)') is not null,
         'battle_pass_recovery_core.sql'

  -- ---------------------------------------------------------------- step 2a
  union all
  select '2a', 'battle_pass_retry body calls the shared rules (refactored)',
         (select p.prosrc like '%retry_reason_precheck%' and p.prosrc like '%retry_reason_state%'
            from pg_proc p where p.oid = to_regprocedure('public.battle_pass_retry(text)')),
         'battle_pass_operator_retry.sql'

  -- ---------------------------------------------------------------- step 2b
  union all
  select '2b', 'service_role CANNOT execute public.battle_pass_retry(text)',
         (select not has_function_privilege('service_role', p.oid, 'execute')
            from pg_proc p where p.oid = to_regprocedure('public.battle_pass_retry(text)')),
         'battle_pass_retry_grant_patch.sql'

  -- ---------------------------------------------------------------- step 3
  union all
  select '3', 'column battle_pass_private.diagnosis_requests.context_fingerprint',
         exists (select 1 from pg_attribute a
                  where a.attrelid = to_regclass('battle_pass_private.diagnosis_requests')
                    and a.attname = 'context_fingerprint' and not a.attisdropped),
         'battle_pass_diagnosis_fingerprint.sql'
  union all
  select '3', 'battle_pass_diagnosis_context() reports contextFingerprint',
         (select p.prosrc like '%contextFingerprint%'
            from pg_proc p where p.oid = to_regprocedure('public.battle_pass_diagnosis_context(uuid)')),
         'battle_pass_diagnosis_fingerprint.sql'
  union all
  select '3', 'battle_pass_diagnosis_save() stores context_fingerprint',
         (select p.prosrc like '%context_fingerprint%'
            from pg_proc p where p.oid = to_regprocedure('public.battle_pass_diagnosis_save(uuid,jsonb,jsonb)')),
         'battle_pass_diagnosis_fingerprint.sql'

  -- ---------------------------------------------------------------- step 4
  union all
  select '4', 'table battle_pass_private.recovery_decisions',
         to_regclass('battle_pass_private.recovery_decisions') is not null,
         'battle_pass_recovery.sql'
  union all
  select '4', 'RLS enabled on recovery_decisions',
         (select c.relrowsecurity from pg_class c
            where c.oid = to_regclass('battle_pass_private.recovery_decisions')),
         'battle_pass_recovery.sql'
  union all
  select '4', 'unique index battle_pass_recovery_one_decision_idx (one decision per diagnosis)',
         (select i.indisunique from pg_index i
            where i.indexrelid = to_regclass('battle_pass_private.battle_pass_recovery_one_decision_idx')),
         'battle_pass_recovery.sql'
  union all
  select '4', 'index battle_pass_recovery_period_idx (guard 12 loop breaker)',
         to_regclass('battle_pass_private.battle_pass_recovery_period_idx') is not null,
         'battle_pass_recovery.sql'
  union all
  select '4', 'index battle_pass_recovery_decided_at_idx',
         to_regclass('battle_pass_private.battle_pass_recovery_decided_at_idx') is not null,
         'battle_pass_recovery.sql'
  union all
  select '4', 'fn battle_pass_private.recovery_guards(bigint)',
         to_regprocedure('battle_pass_private.recovery_guards(bigint)') is not null,
         'battle_pass_recovery.sql'
  union all
  select '4', 'fn public.battle_pass_recovery_proposals(integer)',
         to_regprocedure('public.battle_pass_recovery_proposals(integer)') is not null,
         'battle_pass_recovery.sql'
  union all
  select '4', 'authenticated CAN execute battle_pass_recovery_proposals(integer)',
         (select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
            where p.oid = to_regprocedure('public.battle_pass_recovery_proposals(integer)')),
         'battle_pass_recovery.sql'
  union all
  select '4', 'service_role CANNOT execute battle_pass_recovery_proposals(integer)',
         (select not has_function_privilege('service_role', p.oid, 'execute') from pg_proc p
            where p.oid = to_regprocedure('public.battle_pass_recovery_proposals(integer)')),
         'battle_pass_recovery.sql'

  -- ---------------------------------------------------------------- step 5
  union all
  select '5', 'fn public.battle_pass_recovery_decide(bigint,text,text,text,text)',
         to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)') is not null,
         'battle_pass_recovery_decide.sql'
  union all
  select '5', 'decide RPC is security definer with pinned search_path',
         (select p.prosecdef and exists (
                   select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                    where cfg in ('search_path=', 'search_path=""'))
            from pg_proc p
            where p.oid = to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)')),
         'battle_pass_recovery_decide.sql'
  union all
  select '5', 'authenticated CAN execute the decide RPC',
         (select has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
            where p.oid = to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)')),
         'battle_pass_recovery_decide.sql'
  union all
  select '5', 'service_role CANNOT execute the decide RPC',
         (select not has_function_privilege('service_role', p.oid, 'execute') from pg_proc p
            where p.oid = to_regprocedure('public.battle_pass_recovery_decide(bigint,text,text,text,text)')),
         'battle_pass_recovery_decide.sql'
  union all
  select '5', 'fn public.battle_pass_recovery_history(integer)',
         to_regprocedure('public.battle_pass_recovery_history(integer)') is not null,
         'battle_pass_recovery_decide.sql'
  union all
  select '5', 'service_role CANNOT execute the history RPC',
         (select not has_function_privilege('service_role', p.oid, 'execute') from pg_proc p
            where p.oid = to_regprocedure('public.battle_pass_recovery_history(integer)')),
         'battle_pass_recovery_decide.sql'
)
select
  step,
  case when coalesce(ok, false) then 'APPLIED' else 'MISSING' end as status,
  item,
  case when coalesce(ok, false) then '' else run_this_file end as run_this_file
from chk
order by step, status desc, item;
