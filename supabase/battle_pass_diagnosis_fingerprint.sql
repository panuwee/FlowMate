-- Phase 2B.4 step 3: context_fingerprint on diagnosis_requests.
--
-- Purpose: 2B.4's freshness guard 8 (PHASE_2B4_MVP_SPEC.md §5.3) needs to know what state the
-- AI reasoned about, so it can be compared against a freshly recomputed fingerprint of the
-- run's CURRENT state at decide time. A timestamp alone cannot catch a change that produces no
-- new tick (a hold added/removed directly, a checkpoint key edited during an incident).
--
-- DESIGN NOTE - simpler than the spec's original §2.2 wording, same intent.
-- The spec drafted this as "ai-diagnosis/index.ts computes it from the context it received",
-- which would mean porting the canonical md5 string-builder into TypeScript: a second
-- implementation of the same rule, exactly the duplication problem this project has
-- deliberately avoided everywhere else (see §3's single-source-of-truth refactor in step 1/2,
-- and the spec's own "Suggestions" section flagging this as a known future risk).
--
-- It turns out no second implementation is needed. Step 1 already built
-- battle_pass_private.diagnosis_fingerprint(p_run_id uuid), and its formula was written to
-- mirror battle_pass_diagnosis_context()'s own sanitized fields exactly (tick status/code/
-- stage, run state/hold/held, sorted checkpoint keys, sorted issues, period) - because it was
-- designed for this exact use from the start. So context() can just include the fingerprint of
-- what it is about to hand the AI, computed by the one function that already owns that formula,
-- and the Edge Function only has to carry the value through unchanged, never compute anything.
-- This is a stricter reading of "single source of truth" than the original draft, not a
-- deviation from it.
--
-- What this file does NOT change: battle_pass_diagnosis_route(), the routing gate, the
-- allowlist shape of context() (every existing field stays), or any grant. Function signatures
-- are unchanged, so CREATE OR REPLACE preserves existing ACLs.
begin;

-- ---------------------------------------------------------------- new column, nullable
-- Legacy rows (diagnoses saved before this migration) get NULL here and stay that way - 2B.4
-- guard 7 (`no_fingerprint`) treats a null fingerprint as not-approvable, by design (§2.2).
alter table battle_pass_private.diagnosis_requests
  add column if not exists context_fingerprint text;

-- ---------------------------------------------------------------- context(): now reports it
-- Same function as battle_pass_diagnosis.sql, with exactly one addition: a top-level
-- contextFingerprint field, computed by the same helper 2B.4's decide-time guard will use to
-- recompute it later. Everything else in this body is byte-for-byte what 2B.2 shipped.
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
    -- Fingerprint of the run state this object itself describes. Computed by the same
    -- function 2B.4's decide-time guard 8 recomputes against - see
    -- battle_pass_recovery_core.sql. Threaded through unchanged by the Edge Function into
    -- battle_pass_diagnosis_save's p_meta; nothing recomputes or re-derives it in between.
    'contextFingerprint', battle_pass_private.diagnosis_fingerprint(p_run_id),
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

-- ---------------------------------------------------------------- save(): stores it
-- Same function as battle_pass_diagnosis.sql, with two additions: a v_fp variable, format-
-- validated the same way every other p_meta string field already is in this function (regex
-- match or null - never trust the Edge Function's shape), and one new column in the insert.
create or replace function public.battle_pass_diagnosis_save(
  p_run_id uuid, p_payload jsonb, p_meta jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_tick battle_pass_private.production_ticks%rowtype;
  v_code text; v_valid boolean; v_conf integer; v_id bigint; v_act text; v_risk text; v_fp text;
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

  -- A malformed value (not exactly 32 lowercase hex chars, e.g. md5's own output shape) stores
  -- as null rather than being trusted as-is. A legacy caller that omits it also gets null,
  -- which is the fail-closed default §2.2 requires - guard 7 blocks an approval on it.
  v_fp := case when p_meta->>'contextFingerprint' ~ '^[0-9a-f]{32}$'
    then p_meta->>'contextFingerprint' end;

  v_valid := coalesce((p_meta->>'schemaValid')::boolean, false)
    and v_act in ('retry_run','resume_from_create_cr','revalidate_source',
                  'wait_for_confirmation','manual_review','no_action')
    and v_risk in ('low','medium','high')
    and v_conf between 0 and 100
    and length(coalesce(p_payload->>'diagnosis','')) between 20 and 4000
    and p_payload::text !~ '[<>`]';

  insert into battle_pass_private.diagnosis_requests(
    run_id, tick_code, tick_status, route, agent_version, alpha_request_id,
    latency_ms, raw_response, result, schema_valid, error_code, context_fingerprint)
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
    case when p_meta->>'errorCode' ~ '^[a-z0-9_]{1,50}$' then p_meta->>'errorCode' end,
    v_fp)
  returning diagnosis_id into v_id;

  return jsonb_build_object('diagnosisId', v_id::text, 'schemaValid', v_valid);
end $$;

notify pgrst,'reload schema';
commit;
