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
begin;

create or replace function public.battle_pass_retry(p_period text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r battle_pass_private.monthly_runs%rowtype; a battle_pass_private.operator_actions%rowtype;
  rid bigint; stamp timestamptz; hold text;
begin
  perform battle_pass_private.require_operator();
  if p_period !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' or p_period<'2026-10' then
    raise exception 'Invalid production period';
  end if;
  if not (select enabled from battle_pass_private.monthly_settings where singleton) then
    raise exception 'Automation is paused' using errcode='42501';
  end if;

  -- Same lock the worker takes, so a retry can never race a run in flight.
  perform pg_advisory_xact_lock(hashtext('battle-pass:production'));
  select * into r from battle_pass_private.monthly_runs
    where mode='production' and period=p_period for share;
  if not found then raise exception 'No production run for this period'; end if;
  if r.state='complete' then raise exception 'Completed month cannot be retried'; end if;
  if r.lease_until is not null and r.lease_until>clock_timestamp() then
    raise exception 'Run already in flight' using errcode='55006';
  end if;

  hold := r.checkpoint->>'hold';
  if hold is not null then
    raise exception 'Held for review (%): retry blocked, reconcile the source first',
      case when hold ~ '^[a-z0-9_]{1,50}$' then hold else 'review_required' end
      using errcode='42501';
  end if;
  if r.state<>'failed' then
    raise exception 'Only a failed run can be retried (current state is %)',
      case when r.state ~ '^[a-z_]{1,40}$' then r.state else 'unknown' end;
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
