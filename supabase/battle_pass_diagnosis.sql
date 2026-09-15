-- Phase 2B.2 step 6: diagnosis tables + routing gate + sanitized context + save/get.
--
-- Boundaries enforced here:
--   * route() is the ONLY thing that decides whether a paid AI call may happen.
--   * context() is a read-only allowlist BUILD (never a blacklist strip): it constructs a
--     fresh object field by field, so nothing can leak by being forgotten.
--   * save() re-validates whatever the Edge Function parsed; the DB never trusts it blindly.
--   * Nothing in this file can write production state. No monthly_runs/settings/cron writes.
--
-- Every local variable is v_-prefixed on purpose: `code`, `period`, `route`, `result` and
-- `status` are all real column names in the tables queried here, and plpgsql raises an
-- ambiguity error on an unqualified name that matches both a variable and a column.
begin;

-- ---------------------------------------------------------------- settings (cost control)
create table if not exists battle_pass_private.diagnosis_settings (
  singleton     boolean primary key default true check (singleton),
  ai_daily_cap  integer not null default 20 check (ai_daily_cap between 0 and 500),
  updated_at    timestamptz not null default clock_timestamp()
);
alter table battle_pass_private.diagnosis_settings enable row level security;
revoke all on battle_pass_private.diagnosis_settings from public, anon, authenticated;
insert into battle_pass_private.diagnosis_settings(singleton) values(true) on conflict do nothing;

-- ---------------------------------------------------------------- diagnosis ledger
create table if not exists battle_pass_private.diagnosis_requests (
  diagnosis_id     bigserial primary key,
  run_id           uuid not null,
  tick_code        text,
  tick_status      text not null,
  requested_at     timestamptz not null default clock_timestamp(),
  requested_by     uuid references public.users(id),
  route            text not null check (route in ('ai','runbook','none')),
  agent_version    text,
  alpha_request_id text,
  request_id       bigint,
  latency_ms       integer,
  raw_response     jsonb,
  result           jsonb,
  schema_valid     boolean,
  error_code       text
);
create index if not exists battle_pass_diagnosis_run_idx
  on battle_pass_private.diagnosis_requests (run_id, requested_at desc);
create index if not exists battle_pass_diagnosis_requested_at_idx
  on battle_pass_private.diagnosis_requests (requested_at desc, diagnosis_id desc);
-- One successful AI diagnosis per (run, code). Re-asking the same question costs nothing.
create unique index if not exists battle_pass_diagnosis_dedup_idx
  on battle_pass_private.diagnosis_requests (run_id, coalesce(tick_code,''))
  where route='ai' and schema_valid;
alter table battle_pass_private.diagnosis_requests enable row level security;
revoke all on battle_pass_private.diagnosis_requests from public, anon, authenticated;
revoke all on sequence battle_pass_private.diagnosis_requests_diagnosis_id_seq
  from public, anon, authenticated;

-- ---------------------------------------------------------------- helpers
-- Statuses that are normal outcomes, never failures (see bp-state-machine.md).
create or replace function battle_pass_private.diagnosis_is_non_failure(p_status text)
returns boolean language sql immutable set search_path='' as $$
  select p_status in ('running','disabled','google_write_checked','readiness_checked',
    'no_pending_month','waiting_confirmation','source_needs_data','loot_needs_data',
    'busy','in_progress','complete')
$$;
revoke all on function battle_pass_private.diagnosis_is_non_failure(text)
  from public, anon, authenticated;

-- Count failed ticks carrying the same code in the last 7 days (the "repeated" signal).
create or replace function battle_pass_private.diagnosis_repeat_count(p_code text)
returns integer language sql stable set search_path='' as $$
  select count(*)::integer from battle_pass_private.production_ticks x
  where p_code is not null
    and coalesce(x.detail->>'code', x.code) = p_code
    and x.status = 'failed'
    and x.checked_at > clock_timestamp() - interval '7 days'
$$;
revoke all on function battle_pass_private.diagnosis_repeat_count(text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------- routing gate
create or replace function public.battle_pass_diagnosis_route(p_run_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_tick battle_pass_private.production_ticks%rowtype;
  v_cat  battle_pass_private.error_catalog%rowtype;
  v_code text; v_period text; v_stage text;
  v_repeats integer; v_used integer; v_cap integer; v_cached boolean;
  v_base jsonb; v_candidate boolean;
begin
  -- Readable by operators (UI) and by the server worker (Edge Function).
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
  select count(*)::integer into v_used from battle_pass_private.diagnosis_requests dr
    where dr.route = 'ai' and dr.requested_at > clock_timestamp() - interval '24 hours';
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

  -- 1. Normal, non-failure outcome. Never spend anything on these.
  if battle_pass_private.diagnosis_is_non_failure(v_tick.status) then
    return v_base || jsonb_build_object('route','none','reason','not_a_failure');
  end if;

  -- 2. Deterministic states with a known recovery path.
  if v_tick.status in ('source_blocked','review_required') then
    return v_base || jsonb_build_object('route','runbook','reason','deterministic_state',
      'runbookRef', v_cat.runbook_ref, 'recoveryHint', v_cat.recovery_hint);
  end if;

  -- 3. A valid AI diagnosis already exists for this exact (run, code): reuse it.
  select true into v_cached from battle_pass_private.diagnosis_requests dr
    where dr.run_id = p_run_id and coalesce(dr.tick_code,'') = coalesce(v_code,'')
      and dr.route = 'ai' and dr.schema_valid limit 1;
  if v_cached then
    return v_base || jsonb_build_object('route','none','reason','cached_diagnosis_exists');
  end if;

  -- 4. Genuine AI candidate? Unknown, ambiguous, explicitly AI-eligible, or repeated.
  v_candidate := v_tick.status = 'failed' and (
    v_code is null            -- ambiguous: no code at all
    or v_cat.code is null     -- unknown: not in the catalog
    or v_cat.ai_eligible      -- catalogued as worth reasoning about
    or v_repeats >= 2         -- repeated within 7 days: escalate even if known
  );

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

  -- 5. Known, deterministic failure: answer from the catalog, not from a model.
  if v_cat.code is not null then
    return v_base || jsonb_build_object('route','runbook','reason','known_code',
      'runbookRef', v_cat.runbook_ref, 'recoveryHint', v_cat.recovery_hint);
  end if;

  return v_base || jsonb_build_object('route','none','reason','no_action_needed');
end $$;

-- ---------------------------------------------------------------- sanitized AI context
-- Server-worker only. Builds an allowlisted object; never selects a raw row into output.
-- NEVER included: emails, display names, user ids, Google file/folder/slide ids,
-- source_snapshot (loot + pricing), source_fingerprint, tokens, checkpoint VALUES.
create or replace function public.battle_pass_diagnosis_context(p_run_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_tick battle_pass_private.production_ticks%rowtype;
  v_run  battle_pass_private.monthly_runs%rowtype;
  v_cat  battle_pass_private.error_catalog%rowtype;
  v_code text; v_period text; v_hold text; v_repeats integer;
  v_issues jsonb; v_keys jsonb; v_last jsonb;
begin
  perform battle_pass_private.require_worker();

  select * into v_tick from battle_pass_private.production_ticks t where t.run_id = p_run_id;
  if not found then raise exception 'Unknown run'; end if;

  v_code := case when coalesce(v_tick.detail->>'code', v_tick.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
    then coalesce(v_tick.detail->>'code', v_tick.code) end;
  v_period := case when coalesce(v_tick.detail->>'period', v_tick.detail#>>'{plan,next,period}')
    ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    then coalesce(v_tick.detail->>'period', v_tick.detail#>>'{plan,next,period}') end;

  select * into v_cat from battle_pass_private.error_catalog c where c.code = v_code;
  if v_period is not null then
    select * into v_run from battle_pass_private.monthly_runs m
      where m.mode = 'production' and m.period = v_period;
  end if;

  -- Checkpoint KEYS only, regex filtered. Values may hold Google ids and loot data.
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_keys
  from jsonb_object_keys(coalesce(v_run.checkpoint, '{}'::jsonb)) k
  where k ~ '^[a-z_]{1,40}$';

  v_hold := case when v_run.checkpoint->>'hold' ~ '^[a-z0-9_]{1,50}$'
    then v_run.checkpoint->>'hold' end;

  select coalesce(jsonb_agg(i.value), '[]'::jsonb) into v_issues from (
    select value from jsonb_array_elements_text(
      case when jsonb_typeof(v_tick.detail#>'{plan,issues}') = 'array'
        then v_tick.detail#>'{plan,issues}' else '[]'::jsonb end
      || case when jsonb_typeof(v_tick.detail#>'{plan,next,issues}') = 'array'
        then v_tick.detail#>'{plan,next,issues}' else '[]'::jsonb end)
    where value ~ '^[a-z0-9_]{1,100}$' limit 20
  ) i;

  v_repeats := battle_pass_private.diagnosis_repeat_count(v_code);

  select jsonb_build_object(
      'period', s.period,
      'stage', 'complete',
      'checkpointKeys', (select coalesce(jsonb_agg(k2 order by k2), '[]'::jsonb)
        from jsonb_object_keys(coalesce(s.checkpoint, '{}'::jsonb)) k2
        where k2 ~ '^[a-z_]{1,40}$'))
    into v_last
  from battle_pass_private.monthly_runs s
  where s.mode = 'production' and s.state = 'complete'
  order by s.period desc limit 1;

  return jsonb_build_object(
    'schemaVersion', '1.0',
    'run', jsonb_build_object(
      'runId', v_tick.run_id,
      'period', v_period,
      'status', case when v_tick.status ~ '^[a-z_]{1,40}$' then v_tick.status end,
      'code', v_code,
      'stage', case when v_tick.detail->>'stage' ~ '^[a-z_]{1,40}$'
        then v_tick.detail->>'stage' end,
      'checkedAt', v_tick.checked_at,
      'state', case when v_run.state ~ '^[a-z_]{1,40}$' then v_run.state end,
      'checkpointKeys', v_keys,
      'held', v_hold is not null,
      'holdReason', v_hold),
    'issues', v_issues,
    'lastSuccess', coalesce(v_last, 'null'::jsonb),
    'recentSameCode', jsonb_build_object('count', v_repeats, 'windowDays', 7),
    'catalog', jsonb_build_object(
      'known', v_cat.code is not null,
      'runbookRef', v_cat.runbook_ref));
end $$;

-- ---------------------------------------------------------------- save (server only)
create or replace function public.battle_pass_diagnosis_save(
  p_run_id uuid, p_payload jsonb, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_tick battle_pass_private.production_ticks%rowtype;
  v_code text; v_valid boolean; v_conf integer; v_id bigint; v_act text; v_risk text;
begin
  perform battle_pass_private.require_worker();
  select * into v_tick from battle_pass_private.production_ticks t where t.run_id = p_run_id;
  if not found then raise exception 'Unknown run'; end if;
  if jsonb_typeof(coalesce(p_payload,'null'::jsonb)) <> 'object' then
    raise exception 'Diagnosis payload must be an object';
  end if;
  if octet_length(p_payload::text) > 32000 then raise exception 'Diagnosis payload too large'; end if;

  v_code := case when coalesce(v_tick.detail->>'code', v_tick.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
    then coalesce(v_tick.detail->>'code', v_tick.code) end;

  -- Defence in depth: the DB re-validates what the Edge Function parsed.
  v_act  := lower(coalesce(p_payload#>>'{recommendedAction,code}', ''));
  v_risk := lower(coalesce(p_payload->>'risk', ''));
  begin v_conf := (p_payload->>'confidence')::integer;
  exception when others then v_conf := null; end;

  v_valid := coalesce((p_meta->>'schemaValid')::boolean, false)
    and v_act in ('retry_run','resume_from_create_cr','revalidate_source',
                  'wait_for_confirmation','manual_review','no_action')
    and v_risk in ('low','medium','high')
    and v_conf between 0 and 100
    and length(coalesce(p_payload->>'diagnosis','')) between 20 and 4000
    and p_payload::text !~ '[<>`]';

  insert into battle_pass_private.diagnosis_requests(
    run_id, tick_code, tick_status, route, agent_version, alpha_request_id,
    latency_ms, raw_response, result, schema_valid, error_code)
  values (
    p_run_id, v_code, v_tick.status, 'ai',
    case when p_meta->>'agentVersion' ~ '^[A-Za-z0-9_.:-]{1,50}$'
      then p_meta->>'agentVersion' end,
    case when p_meta->>'alphaRequestId' ~ '^[A-Za-z0-9_.:-]{1,100}$'
      then p_meta->>'alphaRequestId' end,
    case when (p_meta->>'latencyMs') ~ '^[0-9]{1,9}$'
      then (p_meta->>'latencyMs')::integer end,
    case when not v_valid then p_payload end,
    case when v_valid then p_payload end,
    v_valid,
    case when p_meta->>'errorCode' ~ '^[a-z0-9_]{1,50}$' then p_meta->>'errorCode' end)
  returning diagnosis_id into v_id;

  return jsonb_build_object('diagnosisId', v_id::text, 'schemaValid', v_valid);
end $$;

-- ---------------------------------------------------------------- read (operator UI)
create or replace function public.battle_pass_diagnosis_get(p_run_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_row battle_pass_private.diagnosis_requests%rowtype; v_route jsonb;
begin
  perform battle_pass_private.require_operator();
  v_route := public.battle_pass_diagnosis_route(p_run_id);

  select * into v_row from battle_pass_private.diagnosis_requests dr
    where dr.run_id = p_run_id and dr.route = 'ai'
    order by dr.schema_valid desc nulls last, dr.requested_at desc limit 1;

  if v_row.diagnosis_id is null then
    return v_route || jsonb_build_object('diagnosis', 'null'::jsonb);
  end if;

  return v_route || jsonb_build_object(
    'diagnosisId', v_row.diagnosis_id::text,
    'requestedAt', v_row.requested_at,
    'agentVersion', v_row.agent_version,
    'schemaValid', v_row.schema_valid,
    'errorCode', v_row.error_code,
    'latencyMs', v_row.latency_ms,
    -- Only ever the validated payload. A rejected response stays in raw_response,
    -- reachable by nobody through this RPC.
    'diagnosis', coalesce(v_row.result, 'null'::jsonb));
end $$;

revoke all on function
  public.battle_pass_diagnosis_route(uuid),
  public.battle_pass_diagnosis_context(uuid),
  public.battle_pass_diagnosis_save(uuid,jsonb,jsonb),
  public.battle_pass_diagnosis_get(uuid)
  from public, anon, authenticated;
grant execute on function public.battle_pass_diagnosis_route(uuid) to authenticated, service_role;
grant execute on function public.battle_pass_diagnosis_get(uuid) to authenticated;
grant execute on function
  public.battle_pass_diagnosis_context(uuid),
  public.battle_pass_diagnosis_save(uuid,jsonb,jsonb)
  to service_role;
notify pgrst,'reload schema';
commit;
