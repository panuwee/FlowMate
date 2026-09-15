-- Phase 2B.2 step 6b: operator-triggered diagnosis dispatch.
--
-- This is the missing link between the operator UI and the ai-diagnosis Edge Function.
-- The scheduler secret never leaves the database: dispatch_diagnosis reads it from Vault
-- and posts it as the x-battle-pass-token header, exactly like battle_pass_private.dispatch
-- does for the production worker. No operator and no browser ever sees a credential.
--
-- Ledger shape, deliberately: request_diagnosis writes a PLACEHOLDER row
-- (error_code='in_flight', schema_valid=null) so a double click can be deduplicated, and
-- the Edge Function later writes its own result row via diagnosis_save. The rate counter
-- in diagnosis_route is patched below to ignore placeholders, so one click still costs one
-- unit of the daily cap, not two.
begin;

create or replace function battle_pass_private.dispatch_diagnosis(
  p_run_id uuid, p_manual boolean default false) returns bigint
language plpgsql security definer set search_path='' as $$
declare v_token text; v_request bigint;
begin
  select v.decrypted_secret into v_token
  from battle_pass_private.monthly_settings s
  join vault.decrypted_secrets v on v.id = s.scheduler_secret_id
  where s.singleton;
  if v_token is null or length(v_token) < 40 then
    raise exception 'Scheduler credential unavailable';
  end if;

  select net.http_post(
    url := 'https://jbavahimqjalvcfawgqw.supabase.co/functions/v1/ai-diagnosis',
    headers := jsonb_build_object(
      'Content-Type','application/json', 'x-battle-pass-token', v_token),
    body := jsonb_build_object('runId', p_run_id, 'manual', coalesce(p_manual,false)),
    timeout_milliseconds := 120000) into v_request;
  return v_request;
end $$;
revoke all on function battle_pass_private.dispatch_diagnosis(uuid,boolean)
  from public, anon, authenticated;

create or replace function public.battle_pass_request_diagnosis(p_run_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_route jsonb; v_prev battle_pass_private.diagnosis_requests%rowtype;
  v_tick battle_pass_private.production_ticks%rowtype;
  v_request bigint; v_id bigint; v_code text; v_reason text;
begin
  perform battle_pass_private.require_operator();

  -- The gate decides, not the operator. A manual click may only override a route that
  -- already has a deterministic answer; it can never override not_a_failure,
  -- unknown_run, rate_limited or an existing cached diagnosis.
  v_route := public.battle_pass_diagnosis_route(p_run_id);
  v_reason := v_route->>'reason';
  if not (v_route->>'route' = 'ai'
    or v_reason in ('known_code','deterministic_state','no_action_needed')) then
    return v_route || jsonb_build_object('requested', false, 'blockedBy', v_reason);
  end if;

  select * into v_tick from battle_pass_private.production_ticks t where t.run_id = p_run_id;
  if not found then raise exception 'Unknown run'; end if;
  v_code := case when coalesce(v_tick.detail->>'code', v_tick.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
    then coalesce(v_tick.detail->>'code', v_tick.code) end;

  perform pg_advisory_xact_lock(hashtext('battle-pass-diagnosis-request'));

  -- Share one in-flight request across users/tabs for 180s.
  select * into v_prev from battle_pass_private.diagnosis_requests dr
    where dr.run_id = p_run_id
      and dr.requested_at > clock_timestamp() - interval '180 seconds'
    order by dr.requested_at desc limit 1;
  if found then
    return v_route || jsonb_build_object('requested', false, 'reused', true,
      'diagnosisId', v_prev.diagnosis_id::text, 'requestedAt', v_prev.requested_at);
  end if;

  insert into battle_pass_private.diagnosis_requests(
    run_id, tick_code, tick_status, requested_by, route, request_id, error_code)
  values (p_run_id, v_code, v_tick.status, auth.uid(), 'ai', null, 'in_flight')
  returning diagnosis_id into v_id;

  v_request := battle_pass_private.dispatch_diagnosis(p_run_id, true);
  if v_request is null then raise exception 'Diagnosis dispatch unavailable'; end if;
  update battle_pass_private.diagnosis_requests
    set request_id = v_request where diagnosis_id = v_id;

  return v_route || jsonb_build_object('requested', true, 'reused', false,
    'diagnosisId', v_id::text, 'requestId', v_request::text);
end $$;

-- ---------------------------------------------------------------- rate counter patch
-- Placeholder rows must not consume the daily cap twice. Only rows that actually reached
-- Alpha (schema_valid set by diagnosis_save) or failed for a recorded reason are counted.
create or replace function public.battle_pass_diagnosis_route(p_run_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_tick battle_pass_private.production_ticks%rowtype;
  v_cat  battle_pass_private.error_catalog%rowtype;
  v_code text; v_period text; v_stage text;
  v_repeats integer; v_used integer; v_cap integer; v_cached boolean;
  v_base jsonb; v_candidate boolean;
begin
  if auth.uid() is not null then perform battle_pass_private.require_operator();
  elsif coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'Diagnosis access denied' using errcode='42501';
  end if;

  select * into v_tick from battle_pass_private.production_ticks t where t.run_id = p_run_id;
  if not found then
    return jsonb_build_object('route','none','reason','unknown_run');
  end if;

  v_code := case when coalesce(v_tick.detail->>'code', v_tick.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
    then coalesce(v_tick.detail->>'code', v_tick.code) end;
  v_stage := case when v_tick.detail->>'stage' ~ '^[a-z_]{1,40}$'
    then v_tick.detail->>'stage' end;
  v_period := case when coalesce(v_tick.detail->>'period', v_tick.detail#>>'{plan,next,period}')
    ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    then coalesce(v_tick.detail->>'period', v_tick.detail#>>'{plan,next,period}') end;

  select * into v_cat from battle_pass_private.error_catalog c where c.code = v_code;
  select s.ai_daily_cap into v_cap
    from battle_pass_private.diagnosis_settings s where s.singleton;
  -- Patched: ignore in-flight placeholders so one click costs one unit.
  select count(*)::integer into v_used from battle_pass_private.diagnosis_requests dr
    where dr.route = 'ai'
      and dr.requested_at > clock_timestamp() - interval '24 hours'
      and (dr.schema_valid is not null or coalesce(dr.error_code,'') <> 'in_flight');
  v_repeats := battle_pass_private.diagnosis_repeat_count(v_code);

  v_base := jsonb_build_object(
    'runId', v_tick.run_id,
    'status', case when v_tick.status ~ '^[a-z_]{1,40}$' then v_tick.status end,
    'code', v_code,
    'stage', v_stage,
    'period', v_period,
    'gateCounters', jsonb_build_object(
      'aiCallsLast24h', v_used, 'aiDailyCap', v_cap,
      'recentSameCode', jsonb_build_object('count', v_repeats, 'windowDays', 7)));

  if battle_pass_private.diagnosis_is_non_failure(v_tick.status) then
    return v_base || jsonb_build_object('route','none','reason','not_a_failure');
  end if;

  if v_tick.status in ('source_blocked','review_required') then
    return v_base || jsonb_build_object('route','runbook','reason','deterministic_state',
      'runbookRef', v_cat.runbook_ref, 'recoveryHint', v_cat.recovery_hint);
  end if;

  select true into v_cached from battle_pass_private.diagnosis_requests dr
    where dr.run_id = p_run_id and coalesce(dr.tick_code,'') = coalesce(v_code,'')
      and dr.route = 'ai' and dr.schema_valid limit 1;
  if v_cached then
    return v_base || jsonb_build_object('route','none','reason','cached_diagnosis_exists');
  end if;

  v_candidate := v_tick.status = 'failed' and (
    v_code is null or v_cat.code is null or v_cat.ai_eligible or v_repeats >= 2);

  if v_candidate then
    if v_used >= v_cap then
      return v_base || jsonb_build_object('route','none','reason','rate_limited');
    end if;
    return v_base || jsonb_build_object('route','ai','reason',
      case when v_code is null then 'ambiguous_no_code'
           when v_cat.code is null then 'unknown_code'
           when v_repeats >= 2 then 'repeated_failure'
           else 'ai_eligible_code' end);
  end if;

  if v_cat.code is not null then
    return v_base || jsonb_build_object('route','runbook','reason','known_code',
      'runbookRef', v_cat.runbook_ref, 'recoveryHint', v_cat.recovery_hint);
  end if;

  return v_base || jsonb_build_object('route','none','reason','no_action_needed');
end $$;

revoke all on function public.battle_pass_request_diagnosis(uuid) from public, anon;
grant execute on function public.battle_pass_request_diagnosis(uuid) to authenticated;
revoke all on function public.battle_pass_diagnosis_route(uuid) from public, anon, authenticated;
grant execute on function public.battle_pass_diagnosis_route(uuid) to authenticated, service_role;
notify pgrst,'reload schema';
commit;
