-- Phase 2B.4 step 5: the decide RPC (§6.2) and history RPC (§6.3).
--
-- This is the only file in the whole phase that can cause a production action: approving a
-- proposal calls the existing, human-gated public.battle_pass_retry() - the same function an
-- operator's manual Retry button calls, unchanged since step 2. Nothing here writes to
-- monthly_runs directly, dispatches anything itself, or bypasses battle_pass_retry()'s own
-- guards - it re-runs require_operator() and the full eligibility check again, under its own
-- production lock, regardless of what this RPC already checked.
--
-- DESIGN NOTE - stricter than the spec's literal step 7 wording, same intent.
-- §6.2 step 7 says "re-evaluate guard 13 -> raise with its reason if not ok" as if guard 13
-- were the only thing approve re-checks. Read literally that would let an approval through
-- with, say, low_confidence or risk_high still in blockedBy, which contradicts §0.1 and §7.2
-- ("Approve retry is disabled whenever approvable is false - never enabled-with-a-warning").
-- Since battle_pass_private.recovery_guards() already folds guard 13 into the same
-- 'approvable' flag as every other guard (there is only one evaluator, not thirteen separate
-- ones - see battle_pass_recovery.sql), approve here refuses on `not approvable`, which
-- subsumes "guard 13 failed" as one case among many rather than the only one. Reject is not
-- narrowed this way - §7.1 is explicit that a blocked proposal must still be rejectable.
begin;

-- ---------------------------------------------------------------- decide (§6.2)
create or replace function public.battle_pass_recovery_decide(
  p_diagnosis_id bigint, p_decision text, p_expected_action text,
  p_expected_fingerprint text, p_note text default null
) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  v_dr battle_pass_private.diagnosis_requests%rowtype;
  g jsonb; v_decision_id bigint; v_action jsonb; v_shown jsonb;
begin
  perform battle_pass_private.require_operator();

  if p_decision not in ('approve','reject') then
    raise exception 'Invalid decision' using errcode='22023';
  end if;
  if length(coalesce(p_note,'')) > 2000 then
    raise exception 'Note too long' using errcode='22023';
  end if;

  -- Serializes every decision on this one diagnosis. Held for the whole transaction, so a
  -- second concurrent decide() on the same diagnosis_id blocks here rather than racing the
  -- unique-index check below.
  perform pg_advisory_xact_lock(hashtext('battle-pass-recovery:' || p_diagnosis_id::text));

  select * into v_dr from battle_pass_private.diagnosis_requests dr
    where dr.diagnosis_id = p_diagnosis_id;
  if not found then raise exception 'Unknown diagnosis' using errcode='P0001'; end if;

  g := battle_pass_private.recovery_guards(p_diagnosis_id);
  if not coalesce((g->>'candidate')::boolean, false) then
    raise exception 'This diagnosis is not an executable proposal' using errcode='P0001';
  end if;

  -- guard 11, as a clear message. The unique index is the actual race-proof backstop - this
  -- check and the advisory lock above only make the common case (a stale double-click, or two
  -- tabs open on the same card) fail with a readable error instead of a raw constraint
  -- violation.
  if exists (
    select 1 from battle_pass_private.recovery_decisions rd
    where rd.diagnosis_id = p_diagnosis_id
  ) then
    raise exception 'This suggestion has already been decided' using errcode='P0001';
  end if;

  -- The two intent checksums (§6.2). Both apply to a rejection too, not just an approval: a
  -- reject must also reflect what the operator was actually looking at, not a page that loaded
  -- before the run's state moved on. Compared with IS DISTINCT FROM so a legitimately-null
  -- proposedAction (the resume_from_create_cr, reject-only case) matches a null expectation.
  if p_expected_action is distinct from (g->>'proposedAction') then
    raise exception 'The suggested action changed since this page loaded - refresh and retry'
      using errcode='P0001';
  end if;
  if p_expected_fingerprint is distinct from (g->>'currentFingerprint') then
    raise exception 'The run state changed since this page loaded - refresh and retry'
      using errcode='P0001';
  end if;

  -- The versioned audit snapshot (§8.3). diagnosisSha keeps the row small while still proving
  -- which text was shown, without duplicating the (already sanitized, already stored)
  -- diagnosis text a second time.
  v_shown := jsonb_build_object(
    'snapshotVersion', '1.0',
    'risk', v_dr.result->>'risk',
    'confidence', nullif(v_dr.result->>'confidence','')::integer,
    'actionCode', lower(coalesce(v_dr.result#>>'{recommendedAction,code}','')),
    'proposedAction', g->>'proposedAction',
    'contextFingerprint', v_dr.context_fingerprint,
    'fingerprintAtDecision', g->>'currentFingerprint',
    'diagnosisSha', md5(coalesce(v_dr.result->>'diagnosis','')),
    'runState', g->'run',
    'guards', jsonb_build_object(
      'evaluated', jsonb_build_array('schema_version','confidence','risk','fingerprint','age',
        'superseded','single_use','loop_breaker','eligibility'),
      'blockedBy', coalesce(g->'blockedBy','[]'::jsonb)),
    'priorApprovedRetries', g->>'priorApprovedRetries');

  if p_decision = 'reject' then
    insert into battle_pass_private.recovery_decisions(
      diagnosis_id, run_id, target_period, proposed_action, decision, decided_by, note, shown)
    values (
      p_diagnosis_id, v_dr.run_id, g->>'period',
      -- proposed_action is NOT NULL: an unsupported suggestion is recorded as what it actually
      -- was (resume_from_create_cr), never as the null display value.
      coalesce(g->>'proposedAction', 'resume_from_create_cr'),
      'rejected', auth.uid(), p_note, v_shown)
    returning decision_id into v_decision_id;

    return jsonb_build_object('decisionId', v_decision_id::text, 'decision', 'rejected');
  end if;

  -- approve: refuse on ANY unmet guard, not only guard 13 - see the header note above.
  if coalesce(g->>'proposedAction','') <> 'retry'
     or not coalesce((g->>'approvable')::boolean, false) then
    raise exception 'Not approvable: blocked by %', coalesce(g->'blockedBy','[]'::jsonb)
      using errcode='P0001';
  end if;

  -- Record the decision BEFORE acting (§6.2). If battle_pass_retry then raises, this whole
  -- transaction - including the insert below - rolls back, so no decision is ever left on
  -- record for a retry that never actually happened. Acting first would risk the opposite:
  -- a real retry with no decision behind it.
  insert into battle_pass_private.recovery_decisions(
    diagnosis_id, run_id, target_period, proposed_action, decision, decided_by, note, shown)
  values (
    p_diagnosis_id, v_dr.run_id, g->>'period', 'retry', 'approved', auth.uid(), p_note, v_shown)
  returning decision_id into v_decision_id;

  -- The actual boundary is inside battle_pass_retry() itself: it re-runs require_operator()
  -- and the full eligibility check again under its own production lock, unchanged since step
  -- 2. Everything checked above is an early, friendly refusal - not the security guarantee.
  v_action := public.battle_pass_retry(g->>'period');

  update battle_pass_private.recovery_decisions
    set action_id = nullif(v_action->>'actionId','')::bigint
    where decision_id = v_decision_id;

  return jsonb_build_object(
    'decisionId', v_decision_id::text, 'decision', 'approved',
    'actionId', v_action->>'actionId', 'requestId', v_action->>'requestId',
    'reused', coalesce((v_action->>'reused')::boolean, false));
end $$;

-- ---------------------------------------------------------------- history (§6.3)
-- Same treatment battle_pass_audit_trail() already gives: a name, never a uuid or email.
create or replace function public.battle_pass_recovery_history(p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200)); v_result jsonb;
begin
  perform battle_pass_private.require_operator();

  select jsonb_build_object(
      'observedAt', clock_timestamp(),
      'decisions', coalesce(jsonb_agg(d order by d->>'decidedAt' desc), '[]'::jsonb))
    into v_result
  from (
    select jsonb_build_object(
        'decisionId', rd.decision_id::text,
        'diagnosisId', rd.diagnosis_id::text,
        'runId', rd.run_id,
        'period', rd.target_period,
        'proposedAction', rd.proposed_action,
        'decision', rd.decision,
        'decidedAt', rd.decided_at,
        'decidedBy', u.display_name,
        'note', rd.note,
        'actionId', rd.action_id::text,
        'shown', rd.shown) as d
    from battle_pass_private.recovery_decisions rd
    left join public.users u on u.id = rd.decided_by
    order by rd.decided_at desc, rd.decision_id desc
    limit v_limit
  ) s;

  return v_result;
end $$;

-- ---------------------------------------------------------------- grants (§8.2)
-- Explicit and complete, including service_role, from the start - not left for a verify
-- script to discover the default-privilege gap the way step 2 did.
revoke all on function
  public.battle_pass_recovery_decide(bigint,text,text,text,text),
  public.battle_pass_recovery_history(integer)
  from public, anon, authenticated, service_role;
grant execute on function
  public.battle_pass_recovery_decide(bigint,text,text,text,text),
  public.battle_pass_recovery_history(integer)
  to authenticated;

notify pgrst, 'reload schema';
commit;
