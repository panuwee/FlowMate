-- Phase 2B.4 steps 4+5 end-to-end guard/decide test.
--
-- WHY THIS EXISTS: PHASE_2B4_MVP_SPEC.md's acceptance for step 4 requires "each blocked reason
-- reproduces on a synthetic row", and step 5 requires proving approve/reject/already-decided/
-- checksum-mismatch behaviour. battle_pass_recovery_verify.sql deliberately does NOT do this -
-- it never calls battle_pass_recovery_decide() at all, because an approve that happened to pass
-- every guard would call the real public.battle_pass_retry() and dispatch a real production
-- check-in. This file exists specifically to exercise that behaviour safely.
--
-- HOW IT STAYS SAFE, UNLIKE A "REAL" TEST WOULD NEED TO BE:
--   * everything happens inside ONE transaction that ends in ROLLBACK. Unlike
--     battle_pass_diagnosis_e2e_test.sql (which commits, because it has to fire a real HTTP
--     dispatch and wait for an async webhook), this test needs no external round trip, so
--     nothing here needs a paired cleanup script - rollback IS the cleanup.
--   * all synthetic monthly_runs rows use period '2099-12' / '2099-11' / '2099-10' - valid per
--     the period CHECK constraint and past the '2026-10' floor (so they are never rejected as
--     bad_period), but never collide with any real production period.
--   * the one scenario that WOULD be genuinely approvable (guard-clean) is deliberately never
--     approved. This file confirms it via recovery_guards()/proposals() (read-only) and stops
--     there. A real end-to-end approve that reaches dispatch is Phase 2B.4's own step 9
--     acceptance criterion, gated on a genuine failure or an explicit, separate decision to let
--     one fire - never something a routine test file does on its own.
--
-- Run this whenever the guard evaluator or decide RPC changes. Every row must read PASS.
begin;
set local request.jwt.claims = '{"sub":"5abad25d-3e8c-4a0d-baa6-0a0615ba00fc","role":"authenticated"}';

create temporary table e2e_results (
  seq         serial,
  check_name  text,
  result      text,
  detail      text
) on commit drop;

do $$
declare
  -- Periods: three separate (mode,period) rows since monthly_runs' primary key is (mode,period)
  -- and guard 13 (retry_eligibility) is evaluated per period, not per run_id.
  v_period_clean  text := '2099-12';  -- failed, no hold, no lease: ELIGIBLE
  v_period_held   text := '2099-11';  -- failed, held
  v_period_notfld text := '2099-10';  -- running (not failed)

  -- One run_id per scenario so each gets its own production_ticks row (its PK is run_id).
  v_run_clean       uuid := 'eeee2000-0000-4000-8000-0000000000c1';
  v_run_reject      uuid := 'eeee2000-0000-4000-8000-0000000000c2';
  v_run_schema      uuid := 'eeee2000-0000-4000-8000-0000000000c3';
  v_run_lowconf     uuid := 'eeee2000-0000-4000-8000-0000000000c4';
  v_run_highrisk    uuid := 'eeee2000-0000-4000-8000-0000000000c5';
  v_run_nofp        uuid := 'eeee2000-0000-4000-8000-0000000000c6';
  v_run_statechg    uuid := 'eeee2000-0000-4000-8000-0000000000c7';
  v_run_stale       uuid := 'eeee2000-0000-4000-8000-0000000000c8';
  v_run_superseded  uuid := 'eeee2000-0000-4000-8000-0000000000c9';
  v_run_notsupport  uuid := 'eeee2000-0000-4000-8000-0000000000ca';
  v_run_advisory    uuid := 'eeee2000-0000-4000-8000-0000000000cb';
  v_run_decided     uuid := 'eeee2000-0000-4000-8000-0000000000cc';
  v_run_held        uuid := 'eeee2000-0000-4000-8000-0000000000cd';
  v_run_notfailed   uuid := 'eeee2000-0000-4000-8000-0000000000ce';
  v_run_repeat_a    uuid := 'eeee2000-0000-4000-8000-0000000000cf';
  v_run_repeat_b    uuid := 'eeee2000-0000-4000-8000-0000000000d0';
  v_run_repeat_c    uuid := 'eeee2000-0000-4000-8000-0000000000d1';

  v_note text := 'SYNTHETIC 2B.4 E2E TEST ROW - rolled back, never committed';
  v_diag_clean bigint; v_diag_reject bigint; v_diag_schema bigint; v_diag_lowconf bigint;
  v_diag_highrisk bigint; v_diag_nofp bigint; v_diag_statechg bigint; v_diag_stale bigint;
  v_diag_superseded bigint; v_diag_notsupport bigint; v_diag_advisory bigint;
  v_diag_decided bigint; v_diag_held bigint; v_diag_notfailed bigint;
  v_diag_repeat_a bigint; v_diag_repeat_b bigint; v_diag_repeat_c bigint;
  v_fp_clean text; v_fp_reject text;
  v_g jsonb; v_props jsonb; v_hist jsonb; v_decision_id bigint; v_before_count integer;

  -- Standard "everything passes" payload; scenarios override only what they're testing.
  v_payload jsonb := jsonb_build_object(
    'schemaVersion','1.0', 'diagnosis','Synthetic diagnosis text for the e2e test harness only.',
    'evidence','synthetic evidence','impact','synthetic impact',
    'recommendedAction', jsonb_build_object('code','retry_run','raw','retry_run'),
    'risk','low','confidence',95);
begin
  -- =========================================================== seed monthly_runs (3 periods)
  insert into battle_pass_private.monthly_runs(mode,period,state,checkpoint)
  values
    ('production', v_period_clean,  'failed', '{}'::jsonb),
    ('production', v_period_held,   'failed', jsonb_build_object('hold','source_changed')),
    ('production', v_period_notfld, 'running','{}'::jsonb)
  on conflict (mode,period) do update set state=excluded.state, checkpoint=excluded.checkpoint;

  -- =========================================================== seed production_ticks
  insert into battle_pass_private.production_ticks(run_id,status,code,detail,checked_at)
  values
    (v_run_clean,'failed','e2e_clean', jsonb_build_object('period',v_period_clean,'code','e2e_clean','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_reject,'failed','e2e_reject', jsonb_build_object('period',v_period_clean,'code','e2e_reject','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_schema,'failed','e2e_schema', jsonb_build_object('period',v_period_clean,'code','e2e_schema','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_lowconf,'failed','e2e_lowconf', jsonb_build_object('period',v_period_clean,'code','e2e_lowconf','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_highrisk,'failed','e2e_highrisk', jsonb_build_object('period',v_period_clean,'code','e2e_highrisk','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_nofp,'failed','e2e_nofp', jsonb_build_object('period',v_period_clean,'code','e2e_nofp','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_statechg,'failed','e2e_statechg', jsonb_build_object('period',v_period_clean,'code','e2e_statechg','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_stale,'failed','e2e_stale', jsonb_build_object('period',v_period_clean,'code','e2e_stale','stage','finalize','note',v_note), clock_timestamp() - interval '90 minutes'),
    (v_run_superseded,'failed','e2e_superseded', jsonb_build_object('period',v_period_clean,'code','e2e_superseded','stage','finalize','note',v_note), clock_timestamp() - interval '20 minutes'),
    (v_run_notsupport,'failed','e2e_notsupport', jsonb_build_object('period',v_period_clean,'code','e2e_notsupport','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_advisory,'failed','e2e_advisory', jsonb_build_object('period',v_period_clean,'code','e2e_advisory','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_decided,'failed','e2e_decided', jsonb_build_object('period',v_period_clean,'code','e2e_decided','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_held,'failed','e2e_held', jsonb_build_object('period',v_period_held,'code','e2e_held','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_notfailed,'running','e2e_notfailed', jsonb_build_object('period',v_period_notfld,'code','e2e_notfailed','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_repeat_a,'failed','e2e_repeat', jsonb_build_object('period',v_period_clean,'code','e2e_repeat','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_repeat_b,'failed','e2e_repeat', jsonb_build_object('period',v_period_clean,'code','e2e_repeat','stage','finalize','note',v_note), clock_timestamp()),
    (v_run_repeat_c,'failed','e2e_repeat', jsonb_build_object('period',v_period_clean,'code','e2e_repeat','stage','finalize','note',v_note), clock_timestamp())
  on conflict (run_id) do update set status=excluded.status, detail=excluded.detail, checked_at=excluded.checked_at;

  -- Compute the CORRECT current fingerprint for the two scenarios that must NOT trip guard 8.
  v_fp_clean  := battle_pass_private.diagnosis_fingerprint(v_run_clean);
  v_fp_reject := battle_pass_private.diagnosis_fingerprint(v_run_reject);

  -- =========================================================== seed diagnosis_requests
  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_clean, 'e2e_clean', 'failed', 'ai', 'e2e', v_payload, true, clock_timestamp(), v_fp_clean)
  returning diagnosis_id into v_diag_clean;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_reject, 'e2e_reject', 'failed', 'ai', 'e2e', v_payload, true, clock_timestamp(), v_fp_reject)
  returning diagnosis_id into v_diag_reject;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_schema, 'e2e_schema', 'failed', 'ai', 'e2e',
     v_payload || jsonb_build_object('schemaVersion','0.9'), true, clock_timestamp(),
     battle_pass_private.diagnosis_fingerprint(v_run_schema))
  returning diagnosis_id into v_diag_schema;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_lowconf, 'e2e_lowconf', 'failed', 'ai', 'e2e',
     v_payload || jsonb_build_object('confidence',10), true, clock_timestamp(),
     battle_pass_private.diagnosis_fingerprint(v_run_lowconf))
  returning diagnosis_id into v_diag_lowconf;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_highrisk, 'e2e_highrisk', 'failed', 'ai', 'e2e',
     v_payload || jsonb_build_object('risk','high'), true, clock_timestamp(),
     battle_pass_private.diagnosis_fingerprint(v_run_highrisk))
  returning diagnosis_id into v_diag_highrisk;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_nofp, 'e2e_nofp', 'failed', 'ai', 'e2e', v_payload, true, clock_timestamp(), null)
  returning diagnosis_id into v_diag_nofp;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_statechg, 'e2e_statechg', 'failed', 'ai', 'e2e', v_payload, true, clock_timestamp(),
     '00000000000000000000000000000000')  -- well-formed, deliberately wrong
  returning diagnosis_id into v_diag_statechg;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_stale, 'e2e_stale', 'failed', 'ai', 'e2e', v_payload, true,
     clock_timestamp() - interval '90 minutes', battle_pass_private.diagnosis_fingerprint(v_run_stale))
  returning diagnosis_id into v_diag_stale;

  -- Superseded: diagnosis requested BEFORE the tick's checked_at (set 20 min ago above), so
  -- the tick looks like it reported again after the diagnosis was made.
  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_superseded, 'e2e_superseded', 'failed', 'ai', 'e2e', v_payload, true,
     clock_timestamp() - interval '30 minutes', battle_pass_private.diagnosis_fingerprint(v_run_superseded))
  returning diagnosis_id into v_diag_superseded;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_notsupport, 'e2e_notsupport', 'failed', 'ai', 'e2e',
     v_payload || jsonb_build_object('recommendedAction',
       jsonb_build_object('code','resume_from_create_cr','raw','resume_from_create_cr')),
     true, clock_timestamp(), battle_pass_private.diagnosis_fingerprint(v_run_notsupport))
  returning diagnosis_id into v_diag_notsupport;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_advisory, 'e2e_advisory', 'failed', 'ai', 'e2e',
     v_payload || jsonb_build_object('recommendedAction',
       jsonb_build_object('code','manual_review','raw','manual_review')),
     true, clock_timestamp(), battle_pass_private.diagnosis_fingerprint(v_run_advisory))
  returning diagnosis_id into v_diag_advisory;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_decided, 'e2e_decided', 'failed', 'ai', 'e2e', v_payload, true, clock_timestamp(),
     battle_pass_private.diagnosis_fingerprint(v_run_decided))
  returning diagnosis_id into v_diag_decided;
  -- Already decided BEFORE the test even calls decide() on it - inserted directly (decide()
  -- always stamps "now", and a plain direct insert is simpler here than backdating via the RPC).
  insert into battle_pass_private.recovery_decisions
    (diagnosis_id, run_id, target_period, proposed_action, decision, decided_by, shown)
  values (v_diag_decided, v_run_decided, v_period_clean, 'retry', 'rejected',
    '5abad25d-3e8c-4a0d-baa6-0a0615ba00fc'::uuid, jsonb_build_object('snapshotVersion','1.0','note',v_note));

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_held, 'e2e_held', 'failed', 'ai', 'e2e', v_payload, true, clock_timestamp(),
     battle_pass_private.diagnosis_fingerprint(v_run_held))
  returning diagnosis_id into v_diag_held;

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_notfailed, 'e2e_notfailed', 'running', 'ai', 'e2e', v_payload, true, clock_timestamp(),
     battle_pass_private.diagnosis_fingerprint(v_run_notfailed))
  returning diagnosis_id into v_diag_notfailed;

  -- Two PRIOR approved retries of the same (period, tick_code) within 7 days, backdated
  -- directly (decide() cannot backdate decided_at) - then a third candidate with the same
  -- tick_code must be blocked by guard 12.
  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_repeat_a, 'e2e_repeat', 'failed', 'ai', 'e2e', v_payload, true,
     clock_timestamp() - interval '2 days', battle_pass_private.diagnosis_fingerprint(v_run_repeat_a))
  returning diagnosis_id into v_diag_repeat_a;
  insert into battle_pass_private.recovery_decisions
    (diagnosis_id, run_id, target_period, proposed_action, decision, decided_by, decided_at, shown)
  values (v_diag_repeat_a, v_run_repeat_a, v_period_clean, 'retry', 'approved',
    '5abad25d-3e8c-4a0d-baa6-0a0615ba00fc'::uuid, clock_timestamp() - interval '2 days',
    jsonb_build_object('snapshotVersion','1.0','note',v_note));

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_repeat_b, 'e2e_repeat', 'failed', 'ai', 'e2e', v_payload, true,
     clock_timestamp() - interval '1 days', battle_pass_private.diagnosis_fingerprint(v_run_repeat_b))
  returning diagnosis_id into v_diag_repeat_b;
  insert into battle_pass_private.recovery_decisions
    (diagnosis_id, run_id, target_period, proposed_action, decision, decided_by, decided_at, shown)
  values (v_diag_repeat_b, v_run_repeat_b, v_period_clean, 'retry', 'approved',
    '5abad25d-3e8c-4a0d-baa6-0a0615ba00fc'::uuid, clock_timestamp() - interval '1 days',
    jsonb_build_object('snapshotVersion','1.0','note',v_note));

  insert into battle_pass_private.diagnosis_requests
    (run_id, tick_code, tick_status, route, agent_version, result, schema_valid, requested_at, context_fingerprint)
  values
    (v_run_repeat_c, 'e2e_repeat', 'failed', 'ai', 'e2e', v_payload, true, clock_timestamp(),
     battle_pass_private.diagnosis_fingerprint(v_run_repeat_c))
  returning diagnosis_id into v_diag_repeat_c;

  -- =========================================================== environment note, not a check
  -- If automation is currently paused (monthly_settings.enabled = false), retry_eligibility()
  -- returns 'automation_paused' for EVERY period, which would mask 'held'/'not_failed'/eligible
  -- below with a misleading FAIL. Reported here so that shows up immediately instead of as a
  -- confusing failure three rows down.
  insert into e2e_results values (default,'environment: automation_enabled', 'INFO', coalesce((
    select 'enabled=' || s.enabled::text ||
      case when not s.enabled then
        ' -- WARNING: automation is paused; every guard-13 check below will read automation_paused'
      else '' end
    from battle_pass_private.monthly_settings s where s.singleton
  ), 'monthly_settings row not found'));

  -- =========================================================== assertions: guards, one per row
  v_g := battle_pass_private.recovery_guards(v_diag_clean);
  insert into e2e_results values (default,'guard_clean_is_approvable',
    case when coalesce((v_g->>'approvable')::boolean,false) then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_schema);
  insert into e2e_results values (default,'guard_schema_version_unknown',
    case when v_g->'blockedBy' ? 'schema_version_unknown' then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_lowconf);
  insert into e2e_results values (default,'guard_low_confidence',
    case when v_g->'blockedBy' ? 'low_confidence' then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_highrisk);
  insert into e2e_results values (default,'guard_risk_high',
    case when v_g->'blockedBy' ? 'risk_high' then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_nofp);
  insert into e2e_results values (default,'guard_no_fingerprint',
    case when v_g->'blockedBy' ? 'no_fingerprint' then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_statechg);
  insert into e2e_results values (default,'guard_state_changed',
    case when v_g->'blockedBy' ? 'state_changed' then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_stale);
  insert into e2e_results values (default,'guard_stale',
    case when v_g->'blockedBy' ? 'stale' then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_superseded);
  insert into e2e_results values (default,'guard_superseded',
    case when v_g->'blockedBy' ? 'superseded' then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_notsupport);
  insert into e2e_results values (default,'guard_action_not_supported',
    case when v_g->'blockedBy' ? 'action_not_supported'
      and (v_g->>'proposedAction') is null then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_advisory);
  insert into e2e_results values (default,'advisory_code_is_not_a_candidate_at_all',
    case when coalesce((v_g->>'candidate')::boolean,true) = false then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_held);
  insert into e2e_results values (default,'guard_held_via_live_eligibility',
    case when v_g->'blockedBy' ? 'held' then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_notfailed);
  insert into e2e_results values (default,'guard_not_failed_via_live_eligibility',
    case when v_g->'blockedBy' ? 'not_failed' then 'PASS' else 'FAIL' end, v_g::text);

  v_g := battle_pass_private.recovery_guards(v_diag_repeat_c);
  insert into e2e_results values (default,'guard_repeated_failure_after_two_prior_approvals',
    case when v_g->'blockedBy' ? 'repeated_failure' then 'PASS' else 'FAIL' end, v_g::text);

  -- =========================================================== proposals(): list membership
  v_props := public.battle_pass_recovery_proposals(50);

  insert into e2e_results values (default,'proposals_lists_the_clean_candidate',
    case when exists (select 1 from jsonb_array_elements(v_props->'proposals') p
                       where p->>'diagnosisId' = v_diag_clean::text)
      then 'PASS' else 'FAIL' end, null);

  insert into e2e_results values (default,'proposals_omits_the_advisory_only_code',
    case when not exists (select 1 from jsonb_array_elements(v_props->'proposals') p
                           where p->>'diagnosisId' = v_diag_advisory::text)
      then 'PASS' else 'FAIL' end, null);

  insert into e2e_results values (default,'proposals_omits_the_already_decided_diagnosis',
    case when not exists (select 1 from jsonb_array_elements(v_props->'proposals') p
                           where p->>'diagnosisId' = v_diag_decided::text)
      then 'PASS' else 'FAIL' end, null);

  -- =========================================================== decide(): reject, real call
  -- v_diag_reject uses the same "everything passes" payload as v_diag_clean (retry_run), so
  -- its proposedAction is 'retry', not null - null is only correct for the unsupported
  -- resume_from_create_cr case. Passing the wrong expected value here would trip the very
  -- checksum this call is not supposed to be testing.
  v_before_count := (select count(*) from battle_pass_private.recovery_decisions);
  v_decision_id := (public.battle_pass_recovery_decide(
    v_diag_reject, 'reject', (battle_pass_private.recovery_guards(v_diag_reject)->>'proposedAction'),
    v_fp_reject, 'e2e reject test')->>'decisionId')::bigint;
  insert into e2e_results values (default,'reject_inserts_exactly_one_row_with_null_action_id',
    case when (select count(*) from battle_pass_private.recovery_decisions) = v_before_count + 1
      and (select action_id is null from battle_pass_private.recovery_decisions
           where decision_id = v_decision_id)
      then 'PASS' else 'FAIL' end, 'decisionId=' || v_decision_id::text);

  insert into e2e_results values (default,'rejected_diagnosis_now_disappears_from_proposals',
    case when not exists (select 1 from jsonb_array_elements(
                             (public.battle_pass_recovery_proposals(50))->'proposals') p
                           where p->>'diagnosisId' = v_diag_reject::text)
      then 'PASS' else 'FAIL' end, null);

  -- =========================================================== decide(): approve refused when blocked
  begin
    perform public.battle_pass_recovery_decide(v_diag_highrisk, 'approve',
      (battle_pass_private.recovery_guards(v_diag_highrisk)->>'proposedAction'),
      (battle_pass_private.recovery_guards(v_diag_highrisk)->>'currentFingerprint'), null);
    insert into e2e_results values (default,'approve_refused_when_not_approvable','FAIL',
      'no exception was raised for a risk_high candidate');
  exception when others then
    insert into e2e_results values (default,'approve_refused_when_not_approvable',
      case when sqlerrm like 'Not approvable%' then 'PASS' else 'FAIL' end, sqlerrm);
  end;

  -- =========================================================== decide(): checksum mismatches
  begin
    perform public.battle_pass_recovery_decide(v_diag_clean, 'reject', 'wrong_action', v_fp_clean, null);
    insert into e2e_results values (default,'wrong_expected_action_raises','FAIL','no exception raised');
  exception when others then
    insert into e2e_results values (default,'wrong_expected_action_raises',
      case when sqlerrm like '%suggested action changed%' then 'PASS' else 'FAIL' end, sqlerrm);
  end;

  begin
    -- Correct action, deliberately wrong fingerprint - isolates the fingerprint checksum from
    -- the action checksum, unlike passing null/null would (both error messages share the
    -- substring "changed since this page loaded", so a sloppy assertion could pass either way).
    perform public.battle_pass_recovery_decide(v_diag_clean, 'reject',
      (battle_pass_private.recovery_guards(v_diag_clean)->>'proposedAction'),
      '11111111111111111111111111111111', null);
    insert into e2e_results values (default,'wrong_expected_fingerprint_raises','FAIL','no exception raised');
  exception when others then
    insert into e2e_results values (default,'wrong_expected_fingerprint_raises',
      case when sqlerrm like '%run state changed%' then 'PASS' else 'FAIL' end, sqlerrm);
  end;

  insert into e2e_results values (default,'checksum_mismatches_wrote_no_decision_row',
    case when not exists (select 1 from battle_pass_private.recovery_decisions
                           where diagnosis_id = v_diag_clean) then 'PASS' else 'FAIL' end, null);

  -- =========================================================== decide(): already_decided
  begin
    perform public.battle_pass_recovery_decide(v_diag_decided, 'reject', null,
      (battle_pass_private.recovery_guards(v_diag_decided)->>'currentFingerprint'), null);
    insert into e2e_results values (default,'second_decision_on_same_diagnosis_raises','FAIL',
      'no exception raised');
  exception when others then
    insert into e2e_results values (default,'second_decision_on_same_diagnosis_raises',
      case when sqlerrm like '%already been decided%' then 'PASS' else 'FAIL' end, sqlerrm);
  end;

  -- =========================================================== history(): reflects the reject
  v_hist := public.battle_pass_recovery_history(50);
  insert into e2e_results values (default,'history_lists_the_rejected_decision',
    case when exists (select 1 from jsonb_array_elements(v_hist->'decisions') d
                       where d->>'decisionId' = v_decision_id::text and d->>'decision' = 'rejected')
      then 'PASS' else 'FAIL' end, null);
  insert into e2e_results values (default,'history_carries_a_display_name_not_a_uuid',
    case when not (v_hist::text ~* '5abad25d-3e8c-4a0d-baa6-0a0615ba00fc') then 'PASS' else 'FAIL' end,
    null);

  -- =========================================================== the untouched approve path
  -- Deliberately never called: see this file's header. Confirmed approvable=true above
  -- (guard_clean_is_approvable) and left there.
  insert into e2e_results values (default,'clean_candidate_never_actually_approved_by_this_file',
    'PASS', 'by design - see header. Approving it for real is 2B.4 step 9''s own acceptance step.');
end $$;

select check_name, result, detail from e2e_results order by seq;

-- Nothing above is meant to persist. Every insert, including the "reject" decision actually
-- recorded through the real RPC, is undone here.
rollback;
