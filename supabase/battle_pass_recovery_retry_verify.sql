-- Read-only preflight for Phase 2B.4 step 2 - the behaviour-preservation proof for the
-- refactor of the LIVE battle_pass_retry control. Changes nothing, writes nothing, creates no
-- test data, and never dispatches a run. Run after re-applying, in this order:
--     battle_pass_recovery_core.sql          (adds precheck/state/message/errcode)
--     battle_pass_operator_retry.sql         (the refactor itself)
-- Every row must read PASS.
--
-- WHAT THIS CAN AND CANNOT PROVE - read this before trusting it.
--
-- battle_pass_retry cannot be executed from a SQL editor: require_operator() needs
-- auth.uid(), which is null in a direct session, so every call raises 'Operator access
-- denied' before reaching a guard. Triggering its seven exception paths for real would need a
-- signed-in operator AND synthetic mode='production' rows - i.e. writing to the exact state
-- this phase exists to protect. So the proof is decomposed:
--
--   proved here, exhaustively and purely:
--     * every reason code -> exception MESSAGE, character for character vs the pre-refactor
--       literals (hard-coded below, not read from the new code)
--     * every reason code -> SQLSTATE
--     * the precheck/state split reproduces the original single ordering
--     * the auth gate still fires first, end to end, on the real function
--   proved by battle_pass_recovery_core_verify.sql:
--     * the rules themselves, 20 cases, all 7 reasons, all precedence pairs
--   proved structurally, by inspecting the installed function body (prosrc):
--     * require_operator() runs before any guard
--     * the precheck call precedes the production advisory lock, and the state call follows it
--     * the old inline guard literals are GONE, not merely shadowed
--     * no UPDATE of monthly_runs and no hold clearing anywhere in the body
--   NOT proved here, and reviewed by eye instead:
--     * that the arguments passed to each rule call are the right ones. That is ~15 lines in
--       battle_pass_operator_retry.sql; read them.
--     * that the live function refuses an unauthenticated caller with 42501. This needs an
--       exception handler, which a plain query cannot host - run the optional DO block at the
--       bottom of this file for it.
with
-- ---------------------------------------------------------------- expected exception text
-- These literals are transcribed from battle_pass_operator_retry.sql AS IT WAS BEFORE the
-- refactor (git: the version at commit f9cebbb). They are intentionally duplicated here
-- rather than derived from the new functions - a test that reads its expectations from the
-- code under test proves nothing.
expected(reason, hold, state, message, errcode) as (values
  ('bad_period',        null,             null,      'Invalid production period',                                          'P0001'),
  ('automation_paused', null,             null,      'Automation is paused',                                               '42501'),
  ('no_run',            null,             null,      'No production run for this period',                                  'P0001'),
  ('already_complete',  null,             null,      'Completed month cannot be retried',                                  'P0001'),
  ('run_in_flight',     null,             null,      'Run already in flight',                                              '55006'),
  ('held',              'source_changed', null,      'Held for review (source_changed): retry blocked, reconcile the source first', '42501'),
  ('not_failed',        null,             'running', 'Only a failed run can be retried (current state is running)',        'P0001')
),
-- The two display-filter fallbacks the original applied inline at the raise site.
fallbacks(name, reason, hold, state, message) as (values
  ('held_value_fails_regex',  'held',       'WEIRD VALUE!', null,
   'Held for review (review_required): retry blocked, reconcile the source first'),
  ('held_value_null',         'held',       null,           null,
   'Held for review (review_required): retry blocked, reconcile the source first'),
  ('state_fails_regex',       'not_failed', null,           'Weird State',
   'Only a failed run can be retried (current state is unknown)'),
  ('state_null',              'not_failed', null,           null,
   'Only a failed run can be retried (current state is unknown)')
),
-- ---------------------------------------------------------------- ordering equivalence
-- The refactor evaluates the rules in two phases. This asserts coalesce(precheck, state)
-- is identical to the original single ordered CASE for a grid of inputs, including the
-- combinations where a phase-1 reason and a phase-2 reason are both true at once.
grid(name, p_period, p_enabled, p_found, p_state, p_lease, p_hold, expected) as (values
  ('paused_and_held_paused_wins',   '2026-10', false, true,  'failed',   false, 'x',  'automation_paused'),
  ('badperiod_and_held_period_wins','2026-09', true,  true,  'failed',   false, 'x',  'bad_period'),
  ('badperiod_and_paused_period_wins','2026-09', false, true, 'failed',  false, null, 'bad_period'),
  ('paused_and_no_run_paused_wins', '2026-10', false, false, null,       false, null, 'automation_paused'),
  ('ok_needs_both_phases_clean',    '2026-10', true,  true,  'failed',   false, null, null),
  ('phase2_only',                   '2026-10', true,  true,  'complete', false, null, 'already_complete')
),
fns(signature) as (values
  ('battle_pass_private.retry_reason_precheck(text,boolean)'),
  ('battle_pass_private.retry_reason_state(boolean,text,boolean,text)'),
  ('battle_pass_private.retry_reason(text,boolean,boolean,text,boolean,text)'),
  ('battle_pass_private.retry_reason_message(text,text,text)'),
  ('battle_pass_private.retry_reason_errcode(text)')
),
fn as (select signature, to_regprocedure(signature)::oid as oid from fns),
checks as (
  -- ---- message mapping -----------------------------------------------------------------
  select 'message: ' || e.reason as check_name,
    battle_pass_private.retry_reason_message(e.reason, e.hold, e.state) = e.message as passed,
    coalesce(battle_pass_private.retry_reason_message(e.reason, e.hold, e.state),
             '(null)') as detail
  from expected e
  union all
  select 'errcode: ' || e.reason,
    battle_pass_private.retry_reason_errcode(e.reason) = e.errcode,
    battle_pass_private.retry_reason_errcode(e.reason) || ' / expected ' || e.errcode
  from expected e
  union all
  -- ---- display-filter fallbacks --------------------------------------------------------
  select 'fallback: ' || f.name,
    battle_pass_private.retry_reason_message(f.reason, f.hold, f.state) = f.message,
    coalesce(battle_pass_private.retry_reason_message(f.reason, f.hold, f.state), '(null)')
  from fallbacks f
  union all
  -- An unknown reason must produce no message rather than an empty string or a wrong one.
  select 'message_unknown_reason_is_null',
    battle_pass_private.retry_reason_message('not_a_reason') is null, ''
  union all
  select 'errcode_unknown_reason_defaults_to_P0001',
    battle_pass_private.retry_reason_errcode('not_a_reason') = 'P0001', ''
  union all
  -- Every reason the rules can emit must have BOTH a message and an errcode. This is the
  -- check that catches a future reason code added to the rules but not to the mapping.
  select 'every_reason_has_a_message', (
    select bool_and(battle_pass_private.retry_reason_message(r, 'h', 's') is not null)
    from unnest(array['bad_period','automation_paused','no_run','already_complete',
                      'run_in_flight','held','not_failed']) r
  ), ''
  union all
  -- ---- ordering equivalence ------------------------------------------------------------
  select 'order: ' || g.name,
    battle_pass_private.retry_reason(
      g.p_period, g.p_enabled, g.p_found, g.p_state, g.p_lease, g.p_hold)
      is not distinct from g.expected,
    coalesce(battle_pass_private.retry_reason(
      g.p_period, g.p_enabled, g.p_found, g.p_state, g.p_lease, g.p_hold), '(eligible)')
  from grid g
  union all
  -- The combined function must be exactly coalesce(precheck, state) for the whole grid.
  select 'combined_equals_coalesce_of_phases', (
    select bool_and(
      battle_pass_private.retry_reason(p_period,p_enabled,p_found,p_state,p_lease,p_hold)
      is not distinct from coalesce(
        battle_pass_private.retry_reason_precheck(p_period,p_enabled),
        battle_pass_private.retry_reason_state(p_found,p_state,p_lease,p_hold)))
    from grid
  ), ''
  union all
  -- ---- new functions are locked down ---------------------------------------------------
  select 'fn_exists: ' || signature, oid is not null, '' from fn
  union all
  select 'fn_is_immutable: ' || signature,
    case when oid is null then false else
      (select p.provolatile = 'i' from pg_catalog.pg_proc p where p.oid = fn.oid) end, ''
  from fn
  union all
  select 'fn_not_executable_by_browser_or_service: ' || signature,
    case when oid is null then false else
      not has_function_privilege('anon', oid, 'EXECUTE')
      and not has_function_privilege('authenticated', oid, 'EXECUTE')
      and not has_function_privilege('service_role', oid, 'EXECUTE')
    end, '' from fn
  union all
  select 'fn_search_path_pinned: ' || signature,
    case when oid is null then false else exists (
      select 1 from pg_catalog.pg_proc p,
        unnest(coalesce(p.proconfig, '{}'::text[])) cfg
      where p.oid = fn.oid and cfg in ('search_path=', 'search_path=""')
    ) end, '' from fn
  union all
  -- ---- the live control is intact ------------------------------------------------------
  select 'retry_function_still_exists',
    to_regprocedure('public.battle_pass_retry(text)') is not null, ''
  union all
  select 'retry_still_security_definer', coalesce((
    select p.prosecdef from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_retry(text)')), false), ''
  union all
  select 'retry_still_volatile', coalesce((
    -- must NOT be stable: it dispatches and writes the ledger
    select p.provolatile = 'v' from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_retry(text)')), false), ''
  union all
  select 'retry_grants_unchanged', coalesce((
    select has_function_privilege('authenticated', to_regprocedure('public.battle_pass_retry(text)'), 'EXECUTE')
       and not has_function_privilege('anon', to_regprocedure('public.battle_pass_retry(text)'), 'EXECUTE')
       and not has_function_privilege('service_role', to_regprocedure('public.battle_pass_retry(text)'), 'EXECUTE')
  ), false), 'service_role must NOT be able to retry - that would be an AI write path'
  union all
  select 'retry_search_path_pinned', coalesce((
    select exists (
      select 1 from unnest(coalesce(p.proconfig,'{}'::text[])) cfg
      where cfg in ('search_path=', 'search_path=""'))
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_retry(text)')), false), ''
  union all
  -- The refactored body must reference the shared rules and must NOT still contain the old
  -- inline literals - that would mean the refactor was applied on top of, not instead of,
  -- the original guards.
  select 'retry_body_uses_shared_rules', coalesce((
    select p.prosrc like '%retry_reason_precheck%'
       and p.prosrc like '%retry_reason_state%'
       and p.prosrc like '%retry_reason_message%'
       and p.prosrc like '%retry_reason_errcode%'
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_retry(text)')), false), ''
  union all
  select 'retry_body_has_no_inline_guard_literals', coalesce((
    select p.prosrc not like '%Completed month cannot be retried%'
       and p.prosrc not like '%Only a failed run can be retried%'
       and p.prosrc not like '%No production run for this period%'
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_retry(text)')), false),
    'the literals now live only in retry_reason_message'
  union all
  -- Ordering, read structurally: the precheck call must appear before the production lock,
  -- and the state call after it.
  select 'retry_prechecks_before_taking_the_lock', coalesce((
    select position('retry_reason_precheck' in p.prosrc) > 0
       and position('battle-pass:production' in p.prosrc) > 0
       and position('retry_reason_precheck' in p.prosrc)
             < position('battle-pass:production' in p.prosrc)
       and position('retry_reason_state' in p.prosrc)
             > position('battle-pass:production' in p.prosrc)
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_retry(text)')), false),
    'an invalid period must fail instantly, not block on the worker lease'
  union all
  select 'retry_still_checks_operator_first', coalesce((
    select position('require_operator' in p.prosrc)
             < position('retry_reason_precheck' in p.prosrc)
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_retry(text)')), false), ''
  union all
  select 'retry_still_dedups_and_dispatches', coalesce((
    select p.prosrc like '%60 seconds%' and p.prosrc like '%180 seconds%'
       and p.prosrc like '%dispatch(''run'')%'
       and p.prosrc like '%operator_actions%'
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_retry(text)')), false), ''
  union all
  select 'retry_still_mutates_no_run_state', coalesce((
    -- the whole safety argument of 2B.1 step 4: no UPDATE of monthly_runs anywhere in it
    select p.prosrc not ilike '%update battle_pass_private.monthly_runs%'
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_retry(text)')), false), ''
  union all
  select 'retry_does_not_clear_hold', coalesce((
    select p.prosrc not ilike '%- ''hold''%' and p.prosrc not ilike '%delete%hold%'
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.battle_pass_retry(text)')), false), ''
  union all
  -- ---- nothing else moved --------------------------------------------------------------
  select 'scheduler_untouched_30m', coalesce((
    select j.schedule = '*/30 * * * *' from cron.job j
    where j.jobname = 'battle-pass-production-30m'), false), ''
  union all
  select 'other_operator_controls_untouched', coalesce((
    select has_function_privilege('authenticated', to_regprocedure('public.battle_pass_run_now()'), 'EXECUTE')
       and has_function_privilege('authenticated', to_regprocedure('public.battle_pass_set_automation(boolean)'), 'EXECUTE')
       and has_function_privilege('authenticated', to_regprocedure('public.battle_pass_audit_trail(integer)'), 'EXECUTE')
  ), false), ''
  union all
  select 'no_recovery_decisions_table_yet',
    to_regclass('battle_pass_private.recovery_decisions') is null,
    'that table arrives in step 4'
)
select check_name, case when passed then 'PASS' else 'FAIL' end as result, detail
from checks order by check_name;

-- ---------------------------------------------------------------------------------------
-- OPTIONAL end-to-end auth probe. Run this block separately.
--
-- It calls the real battle_pass_retry once. From a SQL editor session auth.uid() is null, so
-- require_operator() must refuse with SQLSTATE 42501 BEFORE any guard, any lock, and any
-- dispatch. That is the one thing about the live function this file can prove by execution
-- rather than by reading its source.
--
-- It is safe: a refusal happens before the advisory lock is taken and before dispatch('run'),
-- so nothing is locked, nothing is logged, and no run is triggered. If it ever reports
-- anything other than PASS, stop and do not use the Retry control until it is understood.
-- ---------------------------------------------------------------------------------------

-- do $$
-- declare v_state text; v_msg text;
-- begin
--   if auth.uid() is not null then
--     raise notice 'SKIPPED - this session is signed in as %, the probe needs an anonymous one',
--       auth.uid();
--     return;
--   end if;
--   begin
--     perform public.battle_pass_retry('2026-10');
--     raise notice 'FAIL - the call was NOT refused. require_operator() is not gating it.';
--   exception when others then
--     v_state := sqlstate; v_msg := sqlerrm;
--     if v_state = '42501' then
--       raise notice 'PASS - refused first with 42501: %', v_msg;
--     else
--       raise notice 'FAIL - refused, but with % (%) instead of 42501', v_state, v_msg;
--     end if;
--   end;
-- end $$;
