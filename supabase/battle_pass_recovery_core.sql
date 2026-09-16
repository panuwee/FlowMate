-- Phase 2B.4 step 1: the two shared primitives Controlled Recovery is built on.
--
-- Additive only. Creates nothing public, grants nothing to anyone, changes no existing
-- object, and is not reachable by anon, authenticated, or service_role. Applying this file
-- has no observable effect until step 2 (refactor) and step 4 (proposals RPC) use it.
--
-- WHY THIS FILE EXISTS - one rule set, one place:
--   battle_pass_retry() decides whether a period may be retried, and the 2B.4 preview must
--   answer the same question WITHOUT raising and WITHOUT locking. Revision 1 of the spec had
--   the preview mirror those guards, i.e. two copies of one rule free to drift, with the
--   preview able to say "approvable" while execution raises. Instead:
--
--     retry_reason(...)        IMMUTABLE  - the rules. Takes facts, returns a reason code.
--     retry_eligibility(period) STABLE    - reads current state, asks retry_reason, reports.
--     battle_pass_retry()      (step 2)   - keeps its own lock + FOR SHARE, asks retry_reason
--                                           with what it loaded, and raises per reason.
--
--   Both callers therefore share the RULES while keeping their own concurrency. See the
--   volatility note in section 2 for why this is three functions and not one.
begin;

-- ---------------------------------------------------------------- 1. the rules
-- The single source of truth for "may this period be retried". Pure: no reads, no clock,
-- no raise. Returns null when eligible, otherwise exactly one reason code.
--
-- Evaluation ORDER is load-bearing. It reproduces battle_pass_operator_retry.sql lines 19-45
-- exactly, so that for any given state the reason reported here is the same failure the live
-- retry control would report first. Do not reorder without re-running step 2's tests.
-- The rules come in two phases, because battle_pass_retry evaluates them in two places:
-- the cheap ones BEFORE taking the production advisory lock, the state-dependent ones after
-- loading the run under that lock. Splitting them here is what lets the refactored control
-- keep that ordering (step 2) while the preview still gets one ordered answer, with each
-- rule written exactly once.
--
-- PHASE 1 - knowable without reading the run.
create or replace function battle_pass_private.retry_reason_precheck(
  p_period  text,
  p_enabled boolean
) returns text language sql immutable set search_path='' as $$
  select case
    -- DELIBERATE NULL BEHAVIOUR, do not "fix":
    -- the live control writes `if p_period !~ '...' or p_period < '2026-10' then raise`.
    -- With a null period both comparisons are null, `null or null` is null, and the IF does
    -- NOT fire - so a null period falls through to the run lookup and surfaces as 'no_run',
    -- not 'bad_period'. Using coalesce() here would change 2B.1's behaviour.
    when (p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_period < '2026-10') then 'bad_period'
    when not coalesce(p_enabled, false) then 'automation_paused'
    else null
  end
$$;
revoke all on function battle_pass_private.retry_reason_precheck(text,boolean)
  from public, anon, authenticated;

-- PHASE 2 - needs the run row.
create or replace function battle_pass_private.retry_reason_state(
  p_found        boolean,
  p_state        text,
  p_lease_active boolean,
  p_hold         text
) returns text language sql immutable set search_path='' as $$
  select case
    when not coalesce(p_found, false)    then 'no_run'
    when p_state = 'complete'            then 'already_complete'
    when coalesce(p_lease_active, false) then 'run_in_flight'
    -- Unfiltered on purpose: battle_pass_retry blocks on the PRESENCE of a hold key, whatever
    -- its value. Contrast diagnosis_fingerprint() in section 3, which mirrors
    -- diagnosis_context()'s regex-filtered notion of `held`. See section 3's note.
    when p_hold is not null              then 'held'
    -- Second deliberate null behaviour: `null <> 'failed'` is null, so the live control's
    -- `if r.state<>'failed' then raise` does not fire for a null state and the retry
    -- proceeds. Reproduced, not corrected. The state passed in here must be the RAW column
    -- value - see the note in retry_eligibility.
    when p_state <> 'failed'             then 'not_failed'
    else null
  end
$$;
revoke all on function battle_pass_private.retry_reason_state(boolean,text,boolean,text)
  from public, anon, authenticated;

-- The combined view, for callers that evaluate everything at once (the preview). coalesce
-- preserves the original precedence exactly: phase 1's reasons outrank phase 2's.
create or replace function battle_pass_private.retry_reason(
  p_period       text,
  p_enabled      boolean,
  p_found        boolean,
  p_state        text,
  p_lease_active boolean,
  p_hold         text
) returns text language sql immutable set search_path='' as $$
  select coalesce(
    battle_pass_private.retry_reason_precheck(p_period, p_enabled),
    battle_pass_private.retry_reason_state(p_found, p_state, p_lease_active, p_hold))
$$;
revoke all on function battle_pass_private.retry_reason(text,boolean,boolean,text,boolean,text)
  from public, anon, authenticated;

comment on function battle_pass_private.retry_reason(text,boolean,boolean,text,boolean,text) is
  'Phase 2B.4: single source of truth for retry eligibility rules. Pure and order-sensitive; '
  'used by battle_pass_retry (execution, in two phases) and retry_eligibility (preview).';

-- ---------------------------------------------------------------- 1b. reason -> exception
-- The message and SQLSTATE each reason must raise with. Extracted so that step 2's
-- behaviour-preservation claim is TESTABLE: battle_pass_retry cannot be executed from a SQL
-- editor (require_operator needs auth.uid(), which is null there), so the mapping is proved
-- by asserting these two pure functions instead of by triggering seven exceptions.
--
-- Both reproduce battle_pass_operator_retry.sql's original literals exactly. Changing a
-- string here changes what an operator sees; treat it as a UI change.
create or replace function battle_pass_private.retry_reason_message(
  p_reason text, p_hold text default null, p_state text default null
) returns text language sql immutable set search_path='' as $$
  select case p_reason
    when 'bad_period'        then 'Invalid production period'
    when 'automation_paused' then 'Automation is paused'
    when 'no_run'            then 'No production run for this period'
    when 'already_complete'  then 'Completed month cannot be retried'
    when 'run_in_flight'     then 'Run already in flight'
    when 'held'              then format(
      'Held for review (%s): retry blocked, reconcile the source first',
      case when p_hold ~ '^[a-z0-9_]{1,50}$' then p_hold else 'review_required' end)
    when 'not_failed'        then format(
      'Only a failed run can be retried (current state is %s)',
      case when p_state ~ '^[a-z_]{1,40}$' then p_state else 'unknown' end)
  end
$$;
revoke all on function battle_pass_private.retry_reason_message(text,text,text)
  from public, anon, authenticated;

create or replace function battle_pass_private.retry_reason_errcode(p_reason text)
returns text language sql immutable set search_path='' as $$
  -- 'P0001' is what a bare `raise exception` produces, so passing it explicitly is identical
  -- to the original's no-errcode raises.
  select case p_reason
    when 'automation_paused' then '42501'
    when 'held'              then '42501'
    when 'run_in_flight'     then '55006'
    else 'P0001'
  end
$$;
revoke all on function battle_pass_private.retry_reason_errcode(text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. the preview
-- Reads current state and reports eligibility without raising and without taking any lock,
-- so a preview can never block on the worker or on another operator.
--
-- VOLATILITY NOTE (a deliberate deviation from the spec sketch):
-- the spec had one function with a p_for_share flag. SELECT ... FOR SHARE takes a row lock,
-- which does not belong in a STABLE function, and the 2B.4 proposals RPC needs to be STABLE
-- so Postgres itself refuses any write inside it. Splitting the rules out (section 1) lets
-- this one stay STABLE and lock-free while battle_pass_retry keeps its own FOR SHARE. The
-- rules are still shared, which was the actual requirement.
create or replace function battle_pass_private.retry_eligibility(p_period text)
returns jsonb language plpgsql stable set search_path='' as $$
declare
  v_enabled boolean;
  v_run     battle_pass_private.monthly_runs%rowtype;
  v_found   boolean := false;
  v_hold    text;
  v_lease   boolean := false;
  v_reason  text;
begin
  select s.enabled into v_enabled
    from battle_pass_private.monthly_settings s where s.singleton;

  -- No FOR SHARE: this is a read-only preview. Execution's serialisation stays in
  -- battle_pass_retry, which holds pg_advisory_xact_lock('battle-pass:production').
  select * into v_run from battle_pass_private.monthly_runs m
    where m.mode = 'production' and m.period = p_period;
  v_found := found;

  if v_found then
    v_hold  := v_run.checkpoint->>'hold';
    v_lease := v_run.lease_until is not null and v_run.lease_until > clock_timestamp();
  end if;

  -- The RAW state goes into the rules, never a regex-filtered copy.
  -- Step 1 originally passed `case when state ~ '^[a-z_]{1,40}$' then state end` here, which
  -- silently changed the decision: a state failing that regex became null, and a null state
  -- is eligible, where the live control would have raised 'not_failed' on the raw value.
  -- Unreachable today (every write sets 'running'/'failed'/'complete') but it made the
  -- single-source-of-truth claim false, so it is fixed. Filtering belongs on OUTPUT only.
  v_reason := battle_pass_private.retry_reason(
    p_period, v_enabled, v_found, v_run.state, v_lease, v_hold);

  return jsonb_build_object(
    'ok', v_reason is null,
    'reason', v_reason,
    'runId', v_run.run_id,
    'period', case when p_period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then p_period end,
    'state', case when v_run.state ~ '^[a-z_]{1,40}$' then v_run.state end,
    'held', v_hold is not null,
    -- Regex-filtered for output only. The eligibility decision above used the raw presence.
    'holdReason', case when v_hold ~ '^[a-z0-9_]{1,50}$' then v_hold end,
    'leaseActive', v_lease,
    'automationEnabled', coalesce(v_enabled, false));
end $$;
revoke all on function battle_pass_private.retry_eligibility(text)
  from public, anon, authenticated;

comment on function battle_pass_private.retry_eligibility(text) is
  'Phase 2B.4: read-only retry eligibility preview. Never raises, never locks. '
  'Authority for execution remains battle_pass_retry.';

-- ---------------------------------------------------------------- 3. the fingerprint
-- Canonicalises the run state a diagnosis was based on, so an approval can detect that the
-- state moved even when no new tick was written (a hold added or removed directly, a
-- checkpoint key appearing, state edited during an incident). That no-tick case is the gap a
-- timestamp-and-tick freshness check leaves open, and it is exactly the class of change that
-- makes a retry unsafe.
--
-- FIELD SET: identical to what battle_pass_diagnosis_context() sends to the agent, with the
-- same regex filters, so the fingerprint describes what the agent actually saw.
--
-- TWO NOTES on faithfulness to the existing code:
--  a) `held` here is `regex-filtered hold is not null`, matching diagnosis_context() - NOT
--     the unfiltered presence test retry_reason() uses. The two notions of "held" in the
--     shipped code disagree for a hold value that fails '^[a-z0-9_]{1,50}$': the agent would
--     be told held=false while battle_pass_retry refuses with 'held'. Every hold the worker
--     writes today is a lowercase word, so they agree in practice. Mirrored faithfully rather
--     than silently reconciled; reconciling it is a change to 2B.2's agent contract and
--     belongs in its own change.
--  b) issues are SORTED here, while diagnosis_context() emits them unsorted. A reordering of
--     the same issue set is not a state change, and sorting keeps the fingerprint stable
--     across one. The fingerprint is a semantic change detector, not a byte-for-byte replay
--     of the agent's input.
--
-- md5 is a change detector here, not a security primitive, so core md5() is enough and
-- pgcrypto is not required.
create or replace function battle_pass_private.diagnosis_fingerprint(p_run_id uuid)
returns text language plpgsql stable set search_path='' as $$
declare
  v_tick   battle_pass_private.production_ticks%rowtype;
  v_run    battle_pass_private.monthly_runs%rowtype;
  v_code   text; v_period text; v_hold text;
  v_keys   text; v_issues text;
begin
  select * into v_tick from battle_pass_private.production_ticks t where t.run_id = p_run_id;
  if not found then return null; end if;

  v_code := case when coalesce(v_tick.detail->>'code', v_tick.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
    then coalesce(v_tick.detail->>'code', v_tick.code) end;
  v_period := case when coalesce(v_tick.detail->>'period', v_tick.detail#>>'{plan,next,period}')
    ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    then coalesce(v_tick.detail->>'period', v_tick.detail#>>'{plan,next,period}') end;

  if v_period is not null then
    select * into v_run from battle_pass_private.monthly_runs m
      where m.mode = 'production' and m.period = v_period;
  end if;

  v_hold := case when v_run.checkpoint->>'hold' ~ '^[a-z0-9_]{1,50}$'
    then v_run.checkpoint->>'hold' end;

  select coalesce(string_agg(k, ',' order by k), '') into v_keys
  from jsonb_object_keys(coalesce(v_run.checkpoint, '{}'::jsonb)) k
  where k ~ '^[a-z_]{1,40}$';

  select coalesce(string_agg(i.value, ',' order by i.value), '') into v_issues from (
    select value from jsonb_array_elements_text(
      case when jsonb_typeof(v_tick.detail#>'{plan,issues}') = 'array'
        then v_tick.detail#>'{plan,issues}' else '[]'::jsonb end
      || case when jsonb_typeof(v_tick.detail#>'{plan,next,issues}') = 'array'
        then v_tick.detail#>'{plan,next,issues}' else '[]'::jsonb end)
    where value ~ '^[a-z0-9_]{1,100}$' limit 20
  ) i;

  -- Fixed field order. Appending a field changes every fingerprint, which fails closed
  -- (every open diagnosis becomes 'state_changed') rather than silently matching - so if a
  -- field is ever added, ship it with the 2B.4 UI able to explain that.
  return md5(
    coalesce(case when v_tick.status ~ '^[a-z_]{1,40}$' then v_tick.status end, '') || '|' ||
    coalesce(v_code, '')                                                            || '|' ||
    coalesce(case when v_tick.detail->>'stage' ~ '^[a-z_]{1,40}$'
      then v_tick.detail->>'stage' end, '')                                         || '|' ||
    coalesce(case when v_run.state ~ '^[a-z_]{1,40}$' then v_run.state end, '')     || '|' ||
    coalesce(v_hold, '')                                                            || '|' ||
    (v_hold is not null)::text                                                      || '|' ||
    v_keys                                                                          || '|' ||
    v_issues                                                                        || '|' ||
    coalesce(v_period, ''));
end $$;
revoke all on function battle_pass_private.diagnosis_fingerprint(uuid)
  from public, anon, authenticated;

comment on function battle_pass_private.diagnosis_fingerprint(uuid) is
  'Phase 2B.4: md5 of the run state a diagnosis was based on, over the same fields and regex '
  'filters as battle_pass_diagnosis_context. Detects state change that produced no tick.';

commit;
