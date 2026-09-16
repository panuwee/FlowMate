-- Phase 2B.1 step 4: operator "Retry" for one period.
--
-- DESIGN NOTE (deliberate deviation from the first spec draft):
-- This function mutates NOTHING in monthly_runs. It does not clear checkpoint->'hold',
-- does not reset state, does not touch the lease. It only (a) verifies the period is
-- genuinely retryable, (b) records the attempt, (c) asks the existing dispatcher to run
-- now instead of waiting for the next 30-minute tick.
-- This is safe because battle_pass_production_claim already re-claims a `failed` run whose
-- source fingerprint still matches and which carries no hold. Clearing a hold from here
-- would risk producing output from a stale loot snapshot, which the runbook forbids.
--
-- ---------------------------------------------------------------------------------------
-- REFACTORED 2026-09-16 for Phase 2B.4 step 2. BEHAVIOUR-PRESERVING BY CONSTRUCTION.
--
-- What changed: the inline guard block is replaced by calls to the shared rule set in
-- battle_pass_recovery_core.sql, so that 2B.4's read-only preview and this control can never
-- disagree about whether a period is retryable. Previously the preview mirrored these guards,
-- i.e. two copies of one rule free to drift, with the preview able to show "approvable" while
-- this function raises.
--
-- What did NOT change, and is asserted by battle_pass_recovery_retry_verify.sql:
--   * evaluation ORDER of the guards
--   * the exception MESSAGE for each reason, character for character
--   * the SQLSTATE for each reason (42501 paused/held, 55006 in-flight, P0001 otherwise)
--   * require_operator() runs first, before anything is read
--   * the cheap guards (period, enabled) still run BEFORE the production advisory lock is
--     taken. This is why the rules are split into precheck/state phases rather than
--     evaluated in one call after loading the run: evaluating them after the lock would mean
--     an invalid-period call could BLOCK on the worker for up to a 10-minute lease instead of
--     failing instantly. Same exception, very different experience.
--   * the 60s/180s dedup window, the ledger insert, before_state, and the return shape
-- ---------------------------------------------------------------------------------------
begin;

create or replace function public.battle_pass_retry(p_period text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r battle_pass_private.monthly_runs%rowtype; a battle_pass_private.operator_actions%rowtype;
  rid bigint; stamp timestamptz; hold text; reason text; run_found boolean;
begin
  perform battle_pass_private.require_operator();

  -- Phase 1: cheap guards, deliberately before the production lock (see header).
  reason := battle_pass_private.retry_reason_precheck(
    p_period, (select enabled from battle_pass_private.monthly_settings where singleton));
  if reason is not null then
    raise exception '%', battle_pass_private.retry_reason_message(reason)
      using errcode = battle_pass_private.retry_reason_errcode(reason);
  end if;

  -- Same lock the worker takes, so a retry can never race a run in flight.
  perform pg_advisory_xact_lock(hashtext('battle-pass:production'));
  select * into r from battle_pass_private.monthly_runs
    where mode='production' and period=p_period for share;
  -- Captured immediately. FOUND survives a plain assignment per the plpgsql spec, but
  -- depending on that across intervening statements is too fragile for a live control:
  -- inserting any PERFORM, SELECT INTO or loop above the check would silently change the
  -- guard. The original checked `if not found` on the very next line; this keeps that
  -- guarantee explicit instead of positional.
  run_found := found;
  hold := r.checkpoint->>'hold';

  -- Phase 2: state guards. The RAW state is passed to the rules; the message function
  -- applies the display filters the original applied inline at the raise site.
  reason := battle_pass_private.retry_reason_state(
    run_found, r.state,
    r.lease_until is not null and r.lease_until > clock_timestamp(),
    hold);
  if reason is not null then
    raise exception '%', battle_pass_private.retry_reason_message(reason, hold, r.state)
      using errcode = battle_pass_private.retry_reason_errcode(reason);
  end if;

  perform pg_advisory_xact_lock(hashtext('battle-pass-operator-retry'));
  stamp := clock_timestamp();
  select * into a from battle_pass_private.operator_actions
    where action='retry' and target_period=p_period order by requested_at desc limit 1;
  if found and (a.requested_at > stamp-interval '60 seconds'
    or (a.result is null and a.requested_at > stamp-interval '180 seconds')) then
    return jsonb_build_object('actionId',a.action_id::text,'requestId',a.request_id::text,
      'requestedAt',a.requested_at,'period',p_period,'reused',true);
  end if;

  rid := battle_pass_private.dispatch('run');
  if rid is null then raise exception 'Retry dispatch unavailable'; end if;

  insert into battle_pass_private.operator_actions(
    action,requested_by,target_period,target_run_id,request_id,before_state)
  values('retry',auth.uid(),p_period,r.run_id,rid,jsonb_build_object(
    'state',r.state,
    'lastError',case when r.checkpoint->>'lastError' ~ '^[A-Za-z0-9_.:-]{1,100}$'
      then r.checkpoint->>'lastError' end,
    'checkpointKeys',(select coalesce(jsonb_agg(k),'[]'::jsonb)
      from jsonb_object_keys(r.checkpoint) k where k ~ '^[a-z_]{1,40}$'),
    'slidePresent',r.slide_id is not null))
  returning * into a;

  return jsonb_build_object('actionId',a.action_id::text,'requestId',rid::text,
    'requestedAt',a.requested_at,'period',p_period,'reused',false);
end $$;

revoke all on function public.battle_pass_retry(text) from public,anon;
grant execute on function public.battle_pass_retry(text) to authenticated;
notify pgrst,'reload schema';
commit;
