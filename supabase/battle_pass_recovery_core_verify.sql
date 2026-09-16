-- Read-only preflight for Phase 2B.4 step 1. Changes nothing, writes nothing, locks nothing,
-- and creates no test data. Run after applying battle_pass_recovery_core.sql.
-- Every row must read PASS.
--
-- The rule tests below need NO synthetic rows: retry_reason is a pure function, so every
-- reason code and every ordering precedence is provable by calling it with literal arguments.
-- That is deliberate - fabricating mode='production' rows to test retry eligibility would
-- mean writing to the exact state this phase exists to protect.
with
-- ---------------------------------------------------------------- the rules, exhaustively
-- Columns: case name, period, enabled, found, state, lease_active, hold, expected reason.
rule_cases(name, p_period, p_enabled, p_found, p_state, p_lease, p_hold, expected) as (values
  -- eligible
  ('ok_failed_run',          '2026-10', true,  true,  'failed',   false, null,            null),
  -- bad_period
  ('period_before_2026_10',  '2026-09', true,  true,  'failed',   false, null,            'bad_period'),
  ('period_malformed',       'nonsense', true,  true,  'failed',   false, null,            'bad_period'),
  ('period_month_13',        '2026-13', true,  true,  'failed',   false, null,            'bad_period'),
  -- null period must NOT be bad_period: it falls through exactly as the live control does
  ('period_null_is_no_run',  null,      true,  false, null,       false, null,            'no_run'),
  -- automation_paused, and it outranks a missing run
  ('paused',                 '2026-10', false, true,  'failed',   false, null,            'automation_paused'),
  ('paused_beats_no_run',    '2026-10', false, false, null,       false, null,            'automation_paused'),
  ('enabled_null_is_paused', '2026-10', null,  true,  'failed',   false, null,            'automation_paused'),
  -- no_run
  ('no_run',                 '2026-10', true,  false, null,       false, null,            'no_run'),
  -- already_complete, and it outranks a live lease
  ('complete',               '2026-10', true,  true,  'complete', false, null,            'already_complete'),
  ('complete_beats_lease',   '2026-10', true,  true,  'complete', true,  null,            'already_complete'),
  ('complete_beats_hold',    '2026-10', true,  true,  'complete', false, 'source_changed','already_complete'),
  -- run_in_flight, and it outranks a hold
  ('in_flight',              '2026-10', true,  true,  'failed',   true,  null,            'run_in_flight'),
  ('in_flight_beats_hold',   '2026-10', true,  true,  'failed',   true,  'source_changed','run_in_flight'),
  -- held, and it outranks not_failed
  ('held',                   '2026-10', true,  true,  'failed',   false, 'source_changed','held'),
  ('held_beats_not_failed',  '2026-10', true,  true,  'running',  false, 'source_changed','held'),
  -- a hold whose value fails the display regex still blocks: retry_reason tests PRESENCE
  ('held_weird_value',       '2026-10', true,  true,  'failed',   false, 'WEIRD VALUE!',  'held'),
  ('held_empty_string',      '2026-10', true,  true,  'failed',   false, '',              'held'),
  -- not_failed
  ('not_failed_running',     '2026-10', true,  true,  'running',  false, null,            'not_failed'),
  -- A NULL state is ELIGIBLE, not 'not_failed'. Same null-propagation quirk as the period
  -- check: the live control writes `if r.state<>'failed' then raise`, and `null <> 'failed'`
  -- is null, so the IF does not fire and the retry proceeds. Mirrored faithfully. Whether
  -- this is reachable at all depends on the column's nullability - see the
  -- monthly_runs_state_nullable check below, which reports it rather than assuming.
  ('null_state_is_eligible', '2026-10', true,  true,  null,       false, null,            null)
),
rule_results as (
  select c.name,
    battle_pass_private.retry_reason(
      c.p_period, c.p_enabled, c.p_found, c.p_state, c.p_lease, c.p_hold) as actual,
    c.expected
  from rule_cases c
),
-- ---------------------------------------------------------------- live reads, no writes
-- retry_eligibility against the real current state. Whatever it returns is fine; what is
-- being proved is that it runs, never raises, and reports a coherent shape.
live as (
  select battle_pass_private.retry_eligibility('2026-10') as oct,
         battle_pass_private.retry_eligibility('2026-09') as sep,
         battle_pass_private.retry_eligibility(null)      as nul
),
-- diagnosis_fingerprint on a real tick, twice, to prove stability. Null when no ticks exist,
-- which is not a failure - it just means there is nothing to fingerprint yet.
fp as (
  select t.run_id,
    battle_pass_private.diagnosis_fingerprint(t.run_id) as a,
    battle_pass_private.diagnosis_fingerprint(t.run_id) as b
  from battle_pass_private.production_ticks t
  order by t.checked_at desc limit 1
),
fns(signature) as (values
  ('battle_pass_private.retry_reason(text,boolean,boolean,text,boolean,text)'),
  ('battle_pass_private.retry_eligibility(text)'),
  ('battle_pass_private.diagnosis_fingerprint(uuid)')
),
fn as (select signature, to_regprocedure(signature)::oid as oid from fns),
checks as (
  -- ---- rules ---------------------------------------------------------------------------
  select 'rule: ' || name as check_name, actual is not distinct from expected as passed,
    coalesce(actual,'(eligible)') || ' / expected ' || coalesce(expected,'(eligible)') as detail
  from rule_results
  union all
  select 'rules_all_cases_covered',
    (select count(*) from rule_cases) >= 20,
    (select count(*)::text || ' cases' from rule_cases)
  union all
  -- Informational, and the reason the null-state case above expects "eligible": if state is
  -- NOT NULL then that quirk is unreachable and harmless. If it is nullable, a null-state
  -- production run would be silently retryable in 2B.1 today - a latent gap to fix in its
  -- own change, deliberately NOT patched inside 2B.4.
  select 'monthly_runs_state_nullable', true, coalesce((
    select 'is_nullable=' || c.is_nullable
      || case when c.is_nullable = 'YES'
           then '  -> null state IS reachable: latent 2B.1 gap, log it'
           else '  -> null state is unreachable, quirk is harmless' end
    from information_schema.columns c
    where c.table_schema = 'battle_pass_private' and c.table_name = 'monthly_runs'
      and c.column_name = 'state'
  ), 'column not found')
  union all
  -- How many production runs actually carry a null state right now. Must be 0.
  select 'no_production_run_has_null_state', coalesce((
    select count(*) = 0 from battle_pass_private.monthly_runs
    where mode = 'production' and state is null
  ), true), coalesce((
    select count(*)::text || ' production rows with null state'
    from battle_pass_private.monthly_runs where mode = 'production' and state is null
  ), '0')
  union all
  -- Every reason code the function can emit must be exercised by at least one case.
  select 'rules_every_reason_code_exercised', (
    select count(distinct expected) = 7 from rule_cases where expected is not null
  ), (select string_agg(distinct expected, ',') from rule_cases where expected is not null)
  union all
  -- ---- existence and volatility --------------------------------------------------------
  select 'fn_exists: ' || signature, oid is not null, '' from fn
  union all
  select 'retry_reason_is_immutable', coalesce((
    select p.provolatile = 'i' from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('battle_pass_private.retry_reason(text,boolean,boolean,text,boolean,text)')
  ), false), 'must be IMMUTABLE: it is the pure rule set'
  union all
  select 'reads_are_stable', coalesce((
    select bool_and(p.provolatile = 's') from pg_catalog.pg_proc p
    where p.oid in (
      to_regprocedure('battle_pass_private.retry_eligibility(text)'),
      to_regprocedure('battle_pass_private.diagnosis_fingerprint(uuid)'))
  ), false), 'STABLE means Postgres itself refuses a write inside them'
  union all
  -- Private helpers are deliberately NOT security definer: they are only ever called from a
  -- definer RPC, which already supplies the privilege. See spec section 8.1.
  select 'helpers_are_not_security_definer', coalesce((
    select bool_and(not p.prosecdef) from pg_catalog.pg_proc p
    where p.oid in (select oid from fn)
  ), false), 'an accidental grant must not confer owner privileges'
  union all
  select 'helpers_search_path_pinned', coalesce((
    select bool_and(exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
      where cfg in ('search_path=', 'search_path=""')
    )) from pg_catalog.pg_proc p where p.oid in (select oid from fn)
  ), false), 'both spellings accepted: search_path is a GUC_LIST_QUOTE variable'
  union all
  -- ---- grants: reachable by nobody -----------------------------------------------------
  select 'helper_not_executable_by_browser: ' || signature,
    case when oid is null then false else
      not has_function_privilege('anon', oid, 'EXECUTE')
      and not has_function_privilege('authenticated', oid, 'EXECUTE')
    end, '' from fn
  union all
  -- service_role is what bp-mcp and ai-diagnosis hold. Nothing in 2B.4 may be reachable by
  -- it, or the phase would have created the AI write path it claims not to create.
  select 'helper_not_executable_by_service_role: ' || signature,
    case when oid is null then false else
      not has_function_privilege('service_role', oid, 'EXECUTE')
    end, '' from fn
  union all
  -- ---- live behaviour ------------------------------------------------------------------
  select 'eligibility_runs_without_raising',
    (select oct is not null and sep is not null and nul is not null from live), ''
  union all
  select 'eligibility_reports_a_boolean_ok',
    (select jsonb_typeof(oct->'ok') = 'boolean' from live), ''
  union all
  select 'eligibility_agrees_with_its_own_reason',
    (select (oct->>'ok')::boolean = (oct->>'reason' is null) from live), ''
  union all
  select 'eligibility_rejects_old_period',
    (select sep->>'reason' = 'bad_period' from live), ''
  union all
  -- The null-period case, proved end to end and not only in the pure rules.
  select 'eligibility_null_period_is_no_run',
    (select nul->>'reason' = 'no_run' from live), ''
  union all
  select 'eligibility_leaks_no_person_or_asset_id',
    (select not (oct::text ~* '(email|display_name|slide|folder|fingerprint|snapshot)') from live), ''
  union all
  select 'october_current_reason', true,
    (select 'reason=' || coalesce(oct->>'reason','(eligible)')
       || ' state=' || coalesce(oct->>'state','null')
       || ' held='  || coalesce(oct->>'held','null') from live)
  union all
  -- ---- fingerprint ---------------------------------------------------------------------
  select 'fingerprint_is_stable_across_calls',
    coalesce((select a is not distinct from b from fp), true),
    coalesce((select 'run=' || run_id::text || ' fp=' || coalesce(a,'(null)') from fp),
             'no ticks exist yet - nothing to fingerprint')
  union all
  select 'fingerprint_is_md5_shaped_or_null',
    coalesce((select a is null or a ~ '^[0-9a-f]{32}$' from fp), true), ''
  union all
  -- ---- nothing existing was disturbed --------------------------------------------------
  select 'retry_control_untouched_by_this_step', coalesce((
    -- step 1 is additive only; battle_pass_retry must still be granted exactly as 2B.1 left it
    select has_function_privilege('authenticated', to_regprocedure('public.battle_pass_retry(text)'), 'EXECUTE')
       and not has_function_privilege('anon', to_regprocedure('public.battle_pass_retry(text)'), 'EXECUTE')
  ), false), 'step 2 is what refactors it; step 1 must not have changed its grants'
  union all
  select 'scheduler_untouched_30m', coalesce((
    select j.schedule = '*/30 * * * *' from cron.job j
    where j.jobname = 'battle-pass-production-30m'
  ), false), ''
  union all
  select 'no_recovery_decisions_table_yet',
    to_regclass('battle_pass_private.recovery_decisions') is null,
    'that table arrives in step 4 - step 1 must not have created it'
)
select check_name, case when passed then 'PASS' else 'FAIL' end as result, detail
from checks order by check_name;
