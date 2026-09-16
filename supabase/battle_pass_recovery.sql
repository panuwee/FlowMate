-- Phase 2B.4 step 4: recovery_decisions (a decision log, not a proposal queue - see
-- PHASE_2B4_MVP_SPEC.md §2.1) plus the read-only proposals RPC (§6.1) and the private guard
-- evaluator both it and step 5's decide RPC will share (§5, all 13 guards).
--
-- What this file does NOT do: it grants nothing to service_role (§8.2's load-bearing rule -
-- and per the step-2 lesson, this is stated explicitly below rather than left to Supabase's
-- default-privilege grant to catch later), and it never writes anything. Proposals are
-- DERIVED at read time from diagnoses that already exist; nothing here is filled in by the AI
-- path.
begin;

-- ---------------------------------------------------------------- recovery_decisions (§2.1)
-- Amended per §4's resolution: an unsupported proposal (resume_from_create_cr) can only ever
-- be rejected, and a rejection must record what was actually rejected, so the constraint
-- allows both values even though only 'retry' ever reaches execution (guard in §6.2 step 7).
create table if not exists battle_pass_private.recovery_decisions (
  decision_id     bigserial primary key,
  diagnosis_id    bigint not null,
  run_id          uuid not null,
  target_period   text not null check (target_period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  proposed_action text not null check (proposed_action in ('retry','resume_from_create_cr')),
  decision        text not null check (decision in ('approved','rejected')),
  decided_at      timestamptz not null default clock_timestamp(),
  decided_by      uuid not null references public.users(id),
  note            text,
  action_id       bigint,                              -- operator_actions row; null when rejected
  shown           jsonb not null default '{}'::jsonb    -- versioned snapshot, see §8.3 (step 5)
);
-- One AI diagnosis buys one decision, ever. The race-proof backstop for guard 11.
create unique index if not exists battle_pass_recovery_one_decision_idx
  on battle_pass_private.recovery_decisions (diagnosis_id);
-- For the loop breaker (guard 12): recent approved retries of the same period.
create index if not exists battle_pass_recovery_period_idx
  on battle_pass_private.recovery_decisions (target_period, decided_at desc);
create index if not exists battle_pass_recovery_decided_at_idx
  on battle_pass_private.recovery_decisions (decided_at desc, decision_id desc);
alter table battle_pass_private.recovery_decisions enable row level security;
revoke all on battle_pass_private.recovery_decisions from public, anon, authenticated;
revoke all on sequence battle_pass_private.recovery_decisions_decision_id_seq
  from public, anon, authenticated;

-- ---------------------------------------------------------------- guard evaluator (§5)
-- Private, non-definer per §8.1: only ever called from inside a definer RPC (proposals() here;
-- the decide RPC in step 5), which already supplies the privilege to read battle_pass_private.
-- Called directly, it can do nothing - revoked from everyone below, and it takes no lock,
-- writes nothing, and dispatches nothing.
--
-- One function evaluates every guard so proposals() and step 5's decide RPC can never
-- disagree about what is blocked - the same single-source-of-truth reason §3 split
-- retry_reason out of battle_pass_retry. Guard 11 (already_decided) is deliberately NOT
-- evaluated here: a decided diagnosis must vanish from the pending list entirely (it belongs
-- in battle_pass_recovery_history instead, §6.3), not appear with blockedBy: ['already_decided'].
-- The caller filters it out; the decide RPC in step 5 re-checks it separately as a race guard,
-- backed by the unique index above.
create or replace function battle_pass_private.recovery_guards(p_diagnosis_id bigint)
returns jsonb
language plpgsql stable set search_path='' as $$
declare
  v_dr battle_pass_private.diagnosis_requests%rowtype;
  v_tick battle_pass_private.production_ticks%rowtype;
  v_run battle_pass_private.monthly_runs%rowtype;
  v_period text; v_action_code text; v_mapped text; v_supported boolean;
  v_confidence integer; v_risk text; v_hold text; v_tick_code text;
  v_blocked text[] := '{}'::text[];
  v_current_fp text; v_superseded boolean; v_prior_retries integer;
  v_eligibility jsonb;
begin
  select * into v_dr from battle_pass_private.diagnosis_requests dr
    where dr.diagnosis_id = p_diagnosis_id;
  if not found then return jsonb_build_object('candidate', false); end if;

  -- guard 1: must be a schema-valid AI diagnosis at all
  if v_dr.route <> 'ai' or not coalesce(v_dr.schema_valid, false) then
    return jsonb_build_object('candidate', false);
  end if;

  -- Period is derived the same way battle_pass_diagnosis_route()/_context() already do -
  -- mirrored here rather than shared, on purpose: refactoring those functions' bodies is out
  -- of scope for this phase (same reasoning as the "held" duplication documented in spec §11).
  select * into v_tick from battle_pass_private.production_ticks t where t.run_id = v_dr.run_id;
  v_period := case when coalesce(v_tick.detail->>'period', v_tick.detail#>>'{plan,next,period}')
    ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
    then coalesce(v_tick.detail->>'period', v_tick.detail#>>'{plan,next,period}') end;
  v_tick_code := case when coalesce(v_tick.detail->>'code', v_tick.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
    then coalesce(v_tick.detail->>'code', v_tick.code) end;

  -- guard 3/4: the action map (§4). Advisory codes are not a proposal at all - not listed.
  v_action_code := lower(coalesce(v_dr.result#>>'{recommendedAction,code}', ''));
  v_mapped := case v_action_code
    when 'retry_run' then 'retry'
    when 'resume_from_create_cr' then 'resume_from_create_cr'
    else null end;
  if v_mapped is null then
    return jsonb_build_object('candidate', false);
  end if;

  -- Revised while building step 5: recovery_decisions.target_period is NOT NULL, so a
  -- diagnosis whose period cannot be resolved must never be a candidate at all - not even a
  -- rejectable one - or the decide RPC would have nothing valid to insert. In practice this
  -- should not happen (the worker always writes a period for a real failure), but the DB
  -- constraint has to hold regardless of what the guard evaluation below would otherwise say.
  if v_period is null then
    return jsonb_build_object('candidate', false);
  end if;

  v_supported := v_mapped = 'retry';
  -- Every literal appended to v_blocked below is cast to ::text explicitly. Without it,
  -- Postgres resolves `text[] || 'literal'` against the anyarray||anyarray overload (the
  -- literal is untyped `unknown` until then) and tries to parse the string AS an array
  -- literal, raising "malformed array literal" instead of appending an element. An
  -- already-typed text expression (a column, a ->> result) does not need the cast - only
  -- these bare string constants do.
  if not v_supported then v_blocked := v_blocked || 'action_not_supported'::text; end if;

  -- guard 2: an unrecognised result shape blocks rather than guesses
  if coalesce(v_dr.result->>'schemaVersion', '') <> '1.0' then
    v_blocked := v_blocked || 'schema_version_unknown'::text;
  end if;

  -- guard 5/6: quality gates
  begin v_confidence := (v_dr.result->>'confidence')::integer;
  exception when others then v_confidence := null; end;
  v_risk := lower(coalesce(v_dr.result->>'risk', ''));
  if coalesce(v_confidence, 0) < 60 then v_blocked := v_blocked || 'low_confidence'::text; end if;
  if v_risk = 'high' then v_blocked := v_blocked || 'risk_high'::text; end if;

  -- guard 7/8: fingerprint freshness. The current fingerprint is recomputed here by the same
  -- helper battle_pass_diagnosis_context() calls at save time (step 3) - one implementation.
  v_current_fp := battle_pass_private.diagnosis_fingerprint(v_dr.run_id);
  if v_dr.context_fingerprint is null then
    v_blocked := v_blocked || 'no_fingerprint'::text;
  elsif v_current_fp is distinct from v_dr.context_fingerprint then
    v_blocked := v_blocked || 'state_changed'::text;
  end if;

  -- guard 9: age
  if v_dr.requested_at < clock_timestamp() - interval '60 minutes' then
    v_blocked := v_blocked || 'stale'::text;
  end if;

  -- guard 10: a newer tick exists. production_ticks.run_id is a primary key upserted in
  -- place, so "checked_at newer than requested_at" on THIS SAME row already means the worker
  -- has reported again since the diagnosis was requested.
  v_superseded := v_tick.run_id is not null and v_tick.checked_at > v_dr.requested_at;
  if v_superseded then v_blocked := v_blocked || 'superseded'::text; end if;

  -- guard 12: loop breaker - fewer than 2 prior APPROVED retries of the same
  -- (target_period, tick_code) within 7 days.
  select count(*) into v_prior_retries
  from battle_pass_private.recovery_decisions rd
  join battle_pass_private.diagnosis_requests dr2 on dr2.diagnosis_id = rd.diagnosis_id
  where rd.decision = 'approved'
    and rd.target_period is not distinct from v_period
    and coalesce(dr2.tick_code, '') = coalesce(v_tick_code, '')
    and rd.decided_at > clock_timestamp() - interval '7 days';
  if v_prior_retries >= 2 then v_blocked := v_blocked || 'repeated_failure'::text; end if;

  -- guard 13: live eligibility. Only meaningful for the one executable action. v_period is
  -- never null here - the early return above already excludes that case entirely.
  -- (v_eligibility->>'reason' is already typed text, so it does not need the ::text cast the
  -- bare literals above do.)
  if v_supported then
    v_eligibility := battle_pass_private.retry_eligibility(v_period);
    if not coalesce((v_eligibility->>'ok')::boolean, false) then
      v_blocked := v_blocked || (v_eligibility->>'reason');
    end if;
  end if;

  if v_period is not null then
    select * into v_run from battle_pass_private.monthly_runs m
      where m.mode = 'production' and m.period = v_period;
  end if;
  v_hold := case when v_run.checkpoint->>'hold' ~ '^[a-z0-9_]{1,50}$'
    then v_run.checkpoint->>'hold' end;

  return jsonb_build_object(
    'candidate', true,
    'period', v_period,
    'proposedAction', case when v_supported then v_mapped end,
    'approvable', v_supported and coalesce(array_length(v_blocked, 1), 0) = 0,
    'blockedBy', to_jsonb(v_blocked),
    'priorApprovedRetries', v_prior_retries,
    'currentFingerprint', v_current_fp,
    'tick', jsonb_build_object(
      'status', case when v_tick.status ~ '^[a-z_]{1,40}$' then v_tick.status end,
      'code', v_tick_code, 'checkedAt', v_tick.checked_at),
    'run', jsonb_build_object(
      'state', case when v_run.state ~ '^[a-z_]{1,40}$' then v_run.state end,
      'held', v_hold is not null, 'holdReason', v_hold));
end $$;

-- ---------------------------------------------------------------- proposals RPC (§6.1)
create or replace function public.battle_pass_recovery_proposals(p_limit integer default 10)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 10), 50));
  v_result jsonb;
begin
  perform battle_pass_private.require_operator();

  select jsonb_build_object(
      'observedAt', clock_timestamp(),
      'proposals', coalesce(jsonb_agg(p), '[]'::jsonb))
    into v_result
  from (
    select jsonb_build_object(
        'diagnosisId', dr.diagnosis_id::text,
        'runId', dr.run_id,
        'period', g->>'period',
        'proposedAction', g->>'proposedAction',
        'requestedAt', dr.requested_at,
        'agentVersion', dr.agent_version,
        'risk', dr.result->>'risk',
        'confidence', nullif(dr.result->>'confidence', '')::integer,
        'evidence', dr.result->>'evidence',
        'impact', dr.result->>'impact',
        'diagnosis', dr.result->>'diagnosis',
        'recommendedActionRaw', dr.result#>>'{recommendedAction,raw}',
        'approvable', (g->>'approvable')::boolean,
        'blockedBy', coalesce(g->'blockedBy', '[]'::jsonb),
        'fingerprint', g->>'currentFingerprint',
        'runState', jsonb_build_object(
          'state', g#>>'{run,state}',
          'held', (g#>>'{run,held}')::boolean,
          'holdReason', g#>>'{run,holdReason}',
          'lastTickAt', g#>>'{tick,checkedAt}',
          'lastTickStatus', g#>>'{tick,status}',
          'lastTickCode', g#>>'{tick,code}'),
        'priorApprovedRetries', (g->>'priorApprovedRetries')::integer
      ) as p,
      dr.requested_at as sort_key
    from battle_pass_private.diagnosis_requests dr
    cross join lateral (select battle_pass_private.recovery_guards(dr.diagnosis_id) as g) x
    where dr.route = 'ai' and dr.schema_valid
      and (g->>'candidate')::boolean
      and not exists (
        select 1 from battle_pass_private.recovery_decisions rd
        where rd.diagnosis_id = dr.diagnosis_id)
    order by dr.requested_at desc
    limit v_limit
  ) s;

  return v_result;
end $$;

-- ---------------------------------------------------------------- grants (§8.2)
-- Explicit and complete on purpose: the step-2 lesson was that a function granted nothing
-- explicitly still gets EXECUTE via Supabase's default privileges on service_role. Both new
-- functions are revoked from it here, proactively, rather than caught later by a verify script.
revoke all on function
  public.battle_pass_recovery_proposals(integer),
  battle_pass_private.recovery_guards(bigint)
  from public, anon, authenticated, service_role;
grant execute on function public.battle_pass_recovery_proposals(integer) to authenticated;
-- battle_pass_private.recovery_guards stays reachable by nobody directly - only nested calls
-- from within a definer RPC (which run as the RPC owner) can reach it. See §8.1.

notify pgrst, 'reload schema';
commit;
