import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

function functionSql(sql: string, name: string) {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$function\\$;`));
  if (!match) throw new Error(`Missing SQL function: ${name}`);
  return match[0];
}

describe("OT Request backend contract", () => {
  const sql = read("supabase", "ot_request.sql");
  const verify = read("supabase", "ot_request_verify.sql");

  it("creates isolated OT tables and append-only audit", () => {
    for (const table of ["ot_system_roles", "ot_approvers", "ot_event_plans", "ot_requests", "ot_request_audit", "ot_export_batches"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("revoke insert, update, delete on public.ot_request_audit from authenticated");
  });

  it("resolves the actor from auth.uid and seeds approved identities", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("panuwee.w@garena.com");
    expect(sql).toContain("nithidol.k@garena.com");
    expect(sql).toContain("weerayut@garena.com");
    expect(sql).toContain("napol.a@garena.com");
    expect(sql).not.toMatch(/p_actor(_user)?_id/i);
  });

  it("ships read-only verification", () => {
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("Expected OT Owner seed count = 1");
    expect(verify).toContain("Expected active approver seed count = 3");
    expect(verify).toContain("OT HR Admin assignment allowlist guard (Expected = true)");
    expect(verify).toContain("p_role_code = ''hr_admin''");
    expect(verify).toContain("p_active = true");
    expect(verify).toContain("not public[.]ot_user_is_approved_approver_identity[(]p_user_id[)]");
    expect(verify).toContain("HR Admin must be one of the three approved MVP identities");
    expect(verify).toContain("as guard_matches_contract");
    expect(verify).toContain("Unauthorized active HR Admin assignments (Expected = 0)");
  });

  it("centralizes fixed HR Admin authorization across every full-scope path", () => {
    const hrAdmin = functionSql(sql, "ot_current_user_is_hr_admin");
    const canReadRequest = functionSql(sql, "ot_current_user_can_read_request");
    const audit = functionSql(sql, "ot_list_request_audit");
    const fullScopePolicy = sql.slice(
      sql.indexOf('create policy "OT Owner and HR Admin can read all OT requests"'),
      sql.indexOf("revoke all on table public.ot_system_roles"),
    );

    for (const contract of [
      "u.id = (select auth.uid())",
      "u.is_active = true",
      "public.ot_user_is_approved_approver_identity(u.id)",
      "r.role_code = 'hr_admin'",
      "r.active = true",
    ]) {
      expect(hrAdmin).toContain(contract);
    }
    expect(hrAdmin).not.toContain("like '%@garena.com'");
    for (const name of [
      "ot_get_access_context",
      "ot_get_manager_dashboard",
      "ot_list_people_for_event",
      "ot_list_compliance_queue",
      "ot_review_compliance",
      "ot_list_hr_ready",
      "ot_mark_exported",
    ]) {
      expect(functionSql(sql, name)).toContain("public.ot_current_user_is_hr_admin()");
    }
    expect(canReadRequest).toContain("public.ot_current_user_is_hr_admin()");
    expect(fullScopePolicy).toContain("public.ot_current_user_is_hr_admin()");
    expect(audit).toContain("public.ot_current_user_can_read_request(p_request_id)");
  });

  it("preserves audited approver deactivation when the installer is rerun", () => {
    const ownerSeed = sql.slice(
      sql.indexOf("insert into public.ot_system_roles"),
      sql.indexOf("insert into public.ot_approvers"),
    );
    const approverSeed = sql.slice(
      sql.indexOf("insert into public.ot_approvers"),
      sql.indexOf("create or replace function public.ot_require_current_user"),
    );
    const setRole = functionSql(sql, "ot_set_system_role");

    expect(ownerSeed).toMatch(/on conflict \(user_id\) do update[\s\S]*active = excluded\.active/);
    expect(approverSeed).toMatch(/on conflict \(user_id\) do nothing/);
    expect(approverSeed).not.toMatch(/on conflict \(user_id\) do update/);
    expect(setRole).toMatch(/p_role_code = 'hr_admin'[\s\S]*p_active = true[\s\S]*ot_user_is_approved_approver_identity\(p_user_id\)/);
    expect(setRole).toMatch(/A non-empty reason is required[\s\S]*insert into public\.ot_system_roles[\s\S]*'set_system_role'/);
  });

  it("verifies the fixed HR helper and legacy-role remediation without mutations", () => {
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("OT HR Admin fixed helper contract (Expected = true)");
    expect(verify).toContain("public.ot_user_is_approved_approver_identity(u.id)");
    expect(verify).toContain("as helper_matches_contract");
    expect(verify).toContain("Legacy active HR Admin role does not satisfy fixed helper (Expected = true)");
    expect(verify).toContain("as legacy_role_cannot_grant_hr_access");
    expect(verify).toContain("OT HR Admin deactivation remediation contract (Expected = true)");
    expect(verify).toContain("p_active = false");
  });

  it("persists the consent statement version for individual and event occurrences", () => {
    const createRequest = functionSql(sql, "ot_create_request");
    const recordConsent = functionSql(sql, "ot_record_consent");

    expect(sql).toContain("consent_statement_version text");
    expect(sql).toContain("add column if not exists consent_statement_version text");
    expect(createRequest).toMatch(/consentStatementVersion[\s\S]*consent_statement_version[\s\S]*Consent statement version is required/);
    expect(createRequest).toMatch(/employee_consent,[\s\S]*consent_statement_version,[\s\S]*employee_consented_at[\s\S]*'accepted', v_consent_statement_version,[\s\S]*now\(\)/);
    expect(recordConsent).toContain("p_consent_statement_version text");
    expect(recordConsent).toMatch(/nullif\(pg_catalog\.btrim\(p_consent_statement_version\), ''\)[\s\S]*Consent statement version is required/);
    expect(recordConsent).toMatch(/employee_consent = 'accepted'[\s\S]*consent_statement_version = v_consent_statement_version/);
    expect(recordConsent).toMatch(/employee_consent = 'declined'[\s\S]*consent_statement_version = v_consent_statement_version/);
    expect(recordConsent).toMatch(/changed_fields[\s\S]*consentStatementVersion[\s\S]*v_consent_statement_version/);
    expect(sql).toContain("drop function if exists public.ot_record_consent(uuid, boolean, uuid)");
    expect(sql).toContain("grant execute on function public.ot_record_consent(uuid, boolean, text, uuid) to authenticated");
  });

  it("requires and persists a reason when actual net minutes vary by more than 30", () => {
    const submit = functionSql(sql, "ot_submit_actual");

    expect(sql).toContain("actual_variance_reason text");
    expect(sql).toContain("add column if not exists actual_variance_reason text");
    expect(submit).toMatch(/actualVarianceReason[\s\S]*actual_variance_reason[\s\S]*varianceReason/);
    expect(submit).toContain("pg_catalog.abs(v_minutes - v_request.planned_minutes)");
    expect(submit).toMatch(/v_variance_minutes > 30[\s\S]*v_variance_reason is null[\s\S]*Actual variance reason is required/);
    expect(submit).toMatch(/actual_variance_reason = v_variance_reason/);
    expect(submit).toMatch(/actualVarianceMinutes[\s\S]*v_variance_minutes[\s\S]*actualVarianceReason[\s\S]*v_variance_reason/);
  });

  it("verifies the new audit fields without widening direct writes", () => {
    expect(verify).toContain("OT request consent and variance fields (Expected = 2)");
    expect(verify).toContain("consent_statement_version");
    expect(verify).toContain("actual_variance_reason");
    expect(verify).toContain("Legacy 3-argument consent RPC (Expected = 0)");
    expect(verify).toContain("Versioned 4-argument consent RPC (Expected = 1)");
    expect(sql).toContain("revoke all on table public.ot_system_roles, public.ot_approvers");
    expect(sql).toContain("grant select on public.ot_requests to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+public\.ot_requests\s+to\s+authenticated/i);
  });

  it("returns privacy-scoped HR-ready export rows with normalized identity emails", () => {
    const hrReady = functionSql(sql, "ot_list_hr_ready");

    expect(sql).toContain("drop function if exists public.ot_list_hr_ready(date)");
    expect(hrReady).toContain("returns setof jsonb");
    expect(hrReady).toContain("security definer");
    expect(hrReady).toContain("set search_path = ''");
    expect(hrReady).toMatch(/ot_current_user_is_owner\(\)[\s\S]*ot_current_user_is_hr_admin\(\)[\s\S]*raise exception/);
    expect(hrReady).toMatch(/to_jsonb\(r\)[\s\S]*jsonb_build_object\([\s\S]*'employee_email'[\s\S]*lower\(pg_catalog\.btrim\(employee\.email\)\)[\s\S]*'approver_email'[\s\S]*lower\(pg_catalog\.btrim\(approver\.email\)\)/);
    expect(hrReady).toMatch(/join public\.users employee on employee\.id = r\.employee_user_id[\s\S]*join public\.users approver on approver\.id = r\.approver_user_id/);
    expect(hrReady).toMatch(/r\.status = 'hr_ready'[\s\S]*r\.hr_ready_at is not null[\s\S]*compliance_reviewed_at is not null/);
    expect(hrReady).toMatch(/p_week_start is null[\s\S]*actual_week_segments[\s\S]*weekStart/);
    expect(hrReady).toContain("order by r.actual_start_at, r.id");
    expect(sql).toContain("grant execute on function public.ot_list_hr_ready(date) to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+public\.ot_requests\s+to\s+authenticated/i);
    expect(verify).toContain("HR-ready export RPC contract (Expected = SETOF jsonb with normalized emails)");
    expect(verify).toContain("has_employee_email");
    expect(verify).toContain("has_approver_email");
  });

  it("keeps event actuals behind per-occurrence employee consent", () => {
    const submit = functionSql(sql, "ot_submit_actual");
    const consent = functionSql(sql, "ot_record_consent");
    const verifyActual = functionSql(sql, "ot_verify_actual");

    expect(submit).toMatch(/status = case[\s\S]*v_over_limit[\s\S]*compliance_review_required[\s\S]*pending_actual_verification/);
    expect(consent).toContain("status not in ('awaiting_consent', 'pending_actual_verification', 'compliance_review_required')");
    expect(consent).toMatch(/actual_submitted_at is not null[\s\S]*compliance_required[\s\S]*pending_actual_verification/);
    expect(verifyActual).toMatch(/source = 'event_plan'[\s\S]*employee_consent is distinct from 'accepted'[\s\S]*raise exception/);
  });

  it("preserves mandatory compliance review when late consent is declined", () => {
    const consent = functionSql(sql, "ot_record_consent");

    expect(consent).toMatch(
      /else[\s\S]*employee_consent = 'declined'[\s\S]*status = case[\s\S]*actual_submitted_at is not null and compliance_required[\s\S]*compliance_review_required[\s\S]*else 'rejected'/,
    );
  });

  it("keeps finalized actuals immutable and rechecks state after locking", () => {
    const submit = functionSql(sql, "ot_submit_actual");
    const verifyActual = functionSql(sql, "ot_verify_actual");
    const stateGuard = "status not in ('pending_actual_verification', 'compliance_review_required')";

    expect(submit).toContain("status in ('cancelled', 'exported', 'hr_ready')");
    expect(verifyActual.split(stateGuard)).toHaveLength(3);
    expect(verifyActual.lastIndexOf(stateGuard)).toBeGreaterThan(verifyActual.indexOf("for update"));
  });

  it("authorizes actual submission only through the locked request state machine", () => {
    const submit = functionSql(sql, "ot_submit_actual");
    const employeeWeekLock = "public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments)";
    const rowLock = "select * into v_request from public.ot_requests r where r.id = p_request_id for update";
    const update = "update public.ot_requests";
    const rowLockIndex = submit.indexOf(rowLock);
    const lockedState = submit.slice(rowLockIndex, submit.indexOf(update, rowLockIndex));

    expect(submit.indexOf(employeeWeekLock)).toBeLessThan(rowLockIndex);
    expect(lockedState).toMatch(
      /\(v_request\.source = 'employee_request' and v_request\.plan_decision = 'approved'\)\s+or\s+\(v_request\.source = 'event_plan' and v_request\.employee_consent = 'accepted'\)/,
    );
    expect(lockedState).toContain("v_request.planned_end_at <= now()");
    expect(lockedState).toContain("v_end_at <= now()");
    expect(lockedState).toMatch(
      /v_request\.status in \('approved', 'actual_confirmation_required'\)\s+and v_request\.actual_submitted_at is null\s+and v_request\.actual_decision is null/,
    );
    expect(lockedState).toMatch(
      /v_request\.status = 'revision_required'\s+and v_request\.actual_decision = 'revision_required'/,
    );
    for (const finalizedFact of [
      "actual_decision = 'approved'",
      "compliance_reviewed_at is not null",
      "hr_ready_at is not null",
      "status = 'exported'",
    ]) {
      expect(lockedState).not.toContain(finalizedFact);
    }
  });

  it("adds an authorized and idempotent actual-amendment state transition", () => {
    const amendment = functionSql(sql, "ot_request_actual_amendment");
    const requestLock = "pg_catalog.hashtextextended('ot-request:' || p_request_id::text, 2)";
    const employeeWeekLock = "public.ot_lock_employee_weeks(v_request.employee_user_id, v_request.actual_week_segments)";
    const rowLock = "select * into v_request from public.ot_requests r where r.id = p_request_id for update";
    const updateStart = amendment.indexOf("update public.ot_requests");
    const updateEnd = amendment.indexOf("where id = p_request_id", updateStart);
    const updateClause = amendment.slice(updateStart, updateEnd);

    expect(amendment).toContain("returns jsonb");
    expect(amendment).toContain("security definer");
    expect(amendment).toContain("set search_path = ''");
    expect(amendment).toMatch(
      /ot_current_user_is_owner\(\)[\s\S]*ot_current_user_is_hr_admin\(\)[\s\S]*ot_user_is_approved_approver_identity\(v_actor_id\)[\s\S]*raise exception/,
    );
    expect(amendment).toMatch(/nullif\(pg_catalog\.btrim\(p_reason\), ''\)[\s\S]*reason is required/i);
    expect(amendment).toContain("public.ot_lock_idempotency('request_actual_amendment', p_idempotency_key)");
    expect(amendment.indexOf(requestLock)).toBeLessThan(amendment.indexOf(employeeWeekLock));
    expect(amendment.indexOf(employeeWeekLock)).toBeLessThan(amendment.indexOf(rowLock));
    expect(amendment).toMatch(/status = 'exported'[\s\S]*raise exception/);
    expect(amendment).toMatch(/status = 'revision_required'[\s\S]*actual_decision = 'revision_required'[\s\S]*raise exception/);
    expect(amendment).toMatch(
      /actual_submitted_at is null[\s\S]*actual_decision is distinct from 'approved'[\s\S]*actual_verified_by_user_id is null[\s\S]*actual_verified_at is null[\s\S]*raise exception/,
    );
    expect(updateClause).toContain("actual_decision = 'revision_required'");
    expect(updateClause).toContain("actual_decision_note = v_reason");
    expect(updateClause).toContain("actual_verified_by_user_id = null");
    expect(updateClause).toContain("actual_verified_at = null");
    expect(updateClause).toContain("compliance_outcome = null");
    expect(updateClause).toContain("compliance_reviewed_at = null");
    expect(updateClause).toContain("hr_ready_at = null");
    expect(updateClause).toContain("status = 'revision_required'");
    for (const preservedFact of [
      "actual_start_at =",
      "actual_end_at =",
      "actual_break_minutes =",
      "actual_minutes =",
      "actual_week_segments =",
      "actual_submitted_at =",
      "compliance_required =",
      "exported_at =",
      "export_batch_id =",
    ]) {
      expect(updateClause).not.toContain(preservedFact);
    }
    expect(amendment).toMatch(/action = 'request_actual_amendment'[\s\S]*idempotency_key = p_idempotency_key[\s\S]*return v_replay_result/);
    expect(amendment).toMatch(/'request_actual_amendment'[\s\S]*'previousActualDecision'[\s\S]*'previousComplianceOutcome'[\s\S]*'previousHrReadyAt'[\s\S]*'requesterUserId'[\s\S]*'reason'[\s\S]*'result'/);
  });

  it("exposes only the authenticated amendment RPC and verifies it read-only", () => {
    const signature = "public.ot_request_actual_amendment(uuid, text, uuid)";

    expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
    expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+public\.ot_requests\s+to\s+authenticated/i);
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("Actual amendment RPC contract (Expected = valid)");
    expect(verify).toContain("ot_request_actual_amendment");
    expect(verify).toContain("uuid, text, uuid");
    expect(verify).toContain("security_definer");
    expect(verify).toContain("fixed_search_path");
    expect(verify).toContain("approved_elevated_identity_guard");
    expect(verify).toContain("request_actual_amendment");
    expect(verify).toContain("Actual amendment RPC execute grants (Expected authenticated only)");
  });

  it("enforces the fixed MVP owner and approver identity allowlists", () => {
    const owner = functionSql(sql, "ot_current_user_is_owner");
    const eligibleApprover = functionSql(sql, "ot_current_user_is_eligible_approver");
    const canReadRequest = functionSql(sql, "ot_current_user_can_read_request");
    const setApprover = functionSql(sql, "ot_set_approver");
    const setRole = functionSql(sql, "ot_set_system_role");

    expect(owner).toContain("pg_catalog.lower(pg_catalog.btrim(u.email)) = 'panuwee.w@garena.com'");
    for (const email of ["nithidol.k@garena.com", "weerayut@garena.com", "napol.a@garena.com"]) {
      expect(eligibleApprover).toContain(email);
    }
    expect(canReadRequest).toMatch(/approver_user_id = \(select auth\.uid\(\)\)[\s\S]*ot_current_user_is_eligible_approver/);
    expect(setApprover).toContain("public.ot_user_is_approved_approver_identity(p_user_id)");
    expect(setRole).toMatch(/p_role_code = 'owner'[\s\S]*panuwee\.w@garena\.com[\s\S]*raise exception/);
    expect(setRole).toMatch(/if not exists \([\s\S]*join public\.users owner_user[\s\S]*panuwee\.w@garena\.com[\s\S]*At least one active approved OT Owner/);
  });

  it("rejects unauthorized HR admin activation at the server boundary", () => {
    const setRole = functionSql(sql, "ot_set_system_role");

    expect(setRole).toMatch(
      /if p_role_code = 'hr_admin'\s+and p_active = true\s+and not public\.ot_user_is_approved_approver_identity\(p_user_id\) then\s+raise exception 'HR Admin must be one of the three approved MVP identities'/,
    );
    expect(setRole.indexOf("p_role_code = 'hr_admin'")).toBeLessThan(
      setRole.indexOf("public.ot_lock_idempotency('set_system_role', p_idempotency_key)"),
    );
  });

  it("permits unauthorized HR admin deactivation through the audited role path", () => {
    const setRole = functionSql(sql, "ot_set_system_role");

    expect(setRole).toMatch(/if p_role_code = 'hr_admin'\s+and p_active = true\s+and not public\.ot_user_is_approved_approver_identity/);
    expect(setRole).toMatch(/insert into public\.ot_system_roles[\s\S]*values \(p_user_id, p_role_code, p_active\)[\s\S]*v_actor_id, 'set_system_role', v_result, pg_catalog\.btrim\(p_reason\), p_idempotency_key/);
  });

  it("keeps legacy HR Admin deactivation reachable when the target is inactive or no longer Garena", () => {
    const setRole = functionSql(sql, "ot_set_system_role");
    const activationStart = setRole.indexOf("if p_active then");
    const activationEnd = setRole.indexOf("perform public.ot_lock_idempotency('set_system_role', p_idempotency_key)", activationStart);
    const deactivationStart = setRole.indexOf("if not p_active then");
    const deactivationEnd = setRole.indexOf("insert into public.ot_system_roles", deactivationStart);
    const activationGuard = setRole.slice(activationStart, activationEnd);
    const deactivationGuard = setRole.slice(deactivationStart, deactivationEnd);

    expect(activationStart).toBeGreaterThan(-1);
    expect(activationGuard).toMatch(/where u\.id = p_user_id and u\.is_active = true[\s\S]*not like '%@garena\.com'/);
    expect(activationGuard).toMatch(/p_role_code = 'hr_admin'[\s\S]*p_active = true[\s\S]*ot_user_is_approved_approver_identity\(p_user_id\)/);
    expect(deactivationStart).toBeGreaterThan(activationEnd);
    expect(deactivationGuard).toMatch(/p_role_code <> 'hr_admin'[\s\S]*existing HR Admin role can be deactivated/);
    expect(deactivationGuard).toMatch(/v_previous->>'role_code' <> 'hr_admin'/);
    expect(deactivationGuard).toMatch(/from public\.ot_system_roles r[\s\S]*for update/);
    expect(setRole).toContain("A non-empty reason is required");
    expect(setRole).toContain("public.ot_lock_idempotency('set_system_role', p_idempotency_key)");
  });

  it("keeps approved HR admin activation and deactivation on the audited role path", () => {
    const setRole = functionSql(sql, "ot_set_system_role");

    expect(setRole).toMatch(/p_active = true\s+and not public\.ot_user_is_approved_approver_identity\(p_user_id\)/);
    expect(setRole).toContain("'active', p_active");
    expect(setRole).toContain("v_actor_id, 'set_system_role', v_result, pg_catalog.btrim(p_reason), p_idempotency_key");
  });

  it("acquires export employee-week locks in one global order before row locks", () => {
    const lockKeys = functionSql(sql, "ot_lock_employee_week_keys");
    const markExported = functionSql(sql, "ot_mark_exported");

    expect(lockKeys).toMatch(/order by[\s\S]*employeeUserId[\s\S]*weekStart/);
    expect(markExported).toContain("v_lock_keys");
    expect(markExported).toContain("public.ot_lock_employee_week_keys(v_lock_keys)");
    expect(markExported.indexOf("public.ot_lock_employee_week_keys(v_lock_keys)")).toBeLessThan(markExported.indexOf("for update"));
  });

  it("locks the sorted union of old and new weeks before actual replacement", () => {
    const submit = functionSql(sql, "ot_submit_actual");

    expect(submit).toContain("v_lock_segments");
    expect(submit).toMatch(/planned_week_segments[\s\S]*actual_week_segments[\s\S]*v_segments[\s\S]*jsonb_agg/);
    expect(submit).toContain("public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments)");
  });

  it("counts submitted actual segments or requested segments exactly once", () => {
    const counted = functionSql(sql, "ot_counted_week_minutes_unchecked");

    expect(counted).toContain("returns integer");
    expect(counted).toMatch(
      /jsonb_array_elements\(\s*case\s+when r\.actual_submitted_at is not null and r\.actual_week_segments is not null\s+then r\.actual_week_segments\s+else r\.planned_week_segments\s+end\s*\) segment/,
    );
    expect(counted).toMatch(
      /r\.status in \([\s\S]*'pending_approval'[\s\S]*'hr_ready'[\s\S]*'exported'[\s\S]*\)\s+or \(r\.status = 'revision_required' and r\.actual_submitted_at is not null\)/,
    );
    for (const excluded of ["draft", "rejected", "cancelled"]) {
      expect(counted).not.toContain(`'${excluded}'`);
    }
  });

  it("routes every weekly policy decision through canonical counted minutes", () => {
    const assertLimit = functionSql(sql, "ot_assert_planned_limit");
    const previewEvent = functionSql(sql, "ot_preview_event_plan");
    const submitActual = functionSql(sql, "ot_submit_actual");

    expect(assertLimit).toContain("public.ot_counted_week_minutes_unchecked(");
    expect(assertLimit).not.toContain("public.ot_projected_week_minutes_unchecked(");
    expect(previewEvent).toContain("public.ot_counted_week_minutes_unchecked(");
    expect(previewEvent).not.toContain("public.ot_projected_week_minutes_unchecked(");
    expect(submitActual).toContain("public.ot_counted_week_minutes_unchecked(");
    expect(submitActual).not.toContain("public.ot_actual_week_minutes(");
    for (const caller of ["ot_create_request", "ot_create_event_plan", "ot_record_consent", "ot_review_plan"]) {
      expect(functionSql(sql, caller)).toContain("public.ot_assert_planned_limit(");
    }
  });

  it("uses submitted actual segments for late consent and planned segments before actual submission", () => {
    const consent = functionSql(sql, "ot_record_consent");

    expect(consent).toContain("v_counted_segments jsonb");
    expect(consent).toMatch(
      /v_counted_segments := case\s+when v_request\.actual_submitted_at is not null and v_request\.actual_week_segments is not null\s+then v_request\.actual_week_segments\s+else v_request\.planned_week_segments\s+end/,
    );
    expect(consent).toContain("public.ot_lock_employee_weeks(v_request.employee_user_id, v_counted_segments)");
    expect(consent).toContain(
      "public.ot_assert_planned_limit(v_request.employee_user_id, v_counted_segments, v_request.id)",
    );
  });

  it("serializes consent with actual submission before selecting counted segments", () => {
    const consent = functionSql(sql, "ot_record_consent");
    const submitActual = functionSql(sql, "ot_submit_actual");
    const requestLock = "pg_catalog.hashtextextended('ot-request:' || p_request_id::text, 2)";
    const requestLockIndex = consent.indexOf(requestLock);
    const firstRequestSelectIndex = consent.indexOf(
      "select * into v_request from public.ot_requests r where r.id = p_request_id",
    );
    const segmentChoiceIndex = consent.indexOf("v_counted_segments := case");
    const employeeWeekLockIndex = consent.indexOf(
      "public.ot_lock_employee_weeks(v_request.employee_user_id, v_counted_segments)",
    );
    const rowLockIndex = consent.indexOf(
      "select * into v_request from public.ot_requests r where r.id = p_request_id for update",
    );

    expect(submitActual).toContain(requestLock);
    expect(requestLockIndex).toBeGreaterThan(-1);
    expect(consent.indexOf("public.ot_lock_idempotency('record_consent', p_idempotency_key)")).toBeLessThan(requestLockIndex);
    expect(requestLockIndex).toBeLessThan(firstRequestSelectIndex);
    expect(firstRequestSelectIndex).toBeLessThan(segmentChoiceIndex);
    expect(segmentChoiceIndex).toBeLessThan(employeeWeekLockIndex);
    expect(employeeWeekLockIndex).toBeLessThan(rowLockIndex);
  });

  it("checks a replacement actual against canonical history while all affected weeks are locked", () => {
    const submit = functionSql(sql, "ot_submit_actual");

    expect(submit).toMatch(
      /planned_week_segments[\s\S]*actual_week_segments[\s\S]*jsonb_array_elements\(v_segments\)[\s\S]*jsonb_agg/,
    );
    expect(submit.indexOf("public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments)")).toBeLessThan(
      submit.indexOf("public.ot_counted_week_minutes_unchecked("),
    );
    expect(submit).toMatch(
      /public\.ot_counted_week_minutes_unchecked\(v_request\.employee_user_id, v_week, v_request\.id\)\s*\+ \(v_segment->>'minutes'\)::integer/,
    );
  });

  it("returns canonical counted minutes beside descriptive dashboard totals", () => {
    const dashboard = functionSql(sql, "ot_get_my_dashboard");

    expect(dashboard).toContain("public.ot_projected_week_minutes(v_actor_id, p_week_start, null)");
    expect(dashboard).toContain("public.ot_actual_week_minutes(v_actor_id, p_week_start, null)");
    expect(dashboard).toContain("public.ot_counted_week_minutes_unchecked(v_actor_id, p_week_start, null)");
    expect(dashboard).toMatch(/'plannedMinutes', v_planned[\s\S]*'actualMinutes', v_actual[\s\S]*'countedMinutes', v_counted/);
    expect(dashboard).toContain("'remainingPlannedMinutes', pg_catalog.greatest(0, 2160 - v_counted)");
  });

  it("keeps weekly accounting helpers private", () => {
    expect(sql).toContain(
      "revoke all on function public.ot_projected_week_minutes(uuid, date, uuid) from public, anon, authenticated",
    );
    expect(sql).not.toContain(
      "grant execute on function public.ot_projected_week_minutes(uuid, date, uuid) to authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.ot_counted_week_minutes_unchecked(uuid, date, uuid) from public, anon, authenticated",
    );
    expect(sql).not.toContain(
      "grant execute on function public.ot_counted_week_minutes_unchecked(uuid, date, uuid) to authenticated",
    );
  });

  it("verifies canonical accounting metadata without database writes", () => {
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("Canonical OT counted-week helper (Expected = 1)");
    expect(verify).toContain("public.ot_counted_week_minutes_unchecked(uuid, date, uuid)");
    expect(verify).toContain("Personal OT dashboard countedMinutes key (Expected = true)");
    expect(verify).toContain("Authenticated projected-total execute access (Expected = false)");
    expect(verify).toContain("has_function_privilege(");
  });

  it("keeps pre-work revisions out of the server plan-review transition", () => {
    const reviewPlan = functionSql(sql, "ot_review_plan");
    const firstGuard = reviewPlan.slice(0, reviewPlan.indexOf("public.ot_lock_employee_weeks"));
    const lockedGuard = reviewPlan.slice(reviewPlan.indexOf("for update"), reviewPlan.indexOf("update public.ot_requests"));

    expect(firstGuard).toContain("v_request.status <> 'pending_approval'");
    expect(lockedGuard).toContain("v_request.status <> 'pending_approval'");
    expect(reviewPlan).not.toMatch(/status not in \('pending_approval', 'revision_required'\)/);
  });

  it("resubmits only an employee-owned individual pre-work revision under ordered locks", () => {
    const resubmit = functionSql(sql, "ot_resubmit_plan");
    const requestLock = "pg_catalog.hashtextextended('ot-request:' || p_request_id::text, 2)";
    const unionLock = "public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments)";
    const rowLock = "select * into v_request from public.ot_requests r where r.id = p_request_id for update";
    const updateStart = resubmit.indexOf("update public.ot_requests");
    const updateEnd = resubmit.indexOf("where id = p_request_id", updateStart);
    const updateClause = resubmit.slice(updateStart, updateEnd);

    expect(resubmit).toContain("returns jsonb");
    expect(resubmit).toContain("security definer");
    expect(resubmit).toContain("set search_path = ''");
    expect(resubmit).toContain("public.ot_lock_idempotency('resubmit_plan', p_idempotency_key)");
    expect(resubmit.indexOf(requestLock)).toBeLessThan(resubmit.indexOf(unionLock));
    expect(resubmit.indexOf(unionLock)).toBeLessThan(resubmit.indexOf(rowLock));
    expect(resubmit).toContain("v_request.planned_week_segments || v_segments");
    expect(resubmit).toContain("select distinct pg_catalog.coalesce(item->>'weekStart', item->>'week_start')::date as week_start");
    expect(resubmit).toContain("order by week_start");
    expect(resubmit).toMatch(/employee_user_id <> v_actor_id[\s\S]*source <> 'employee_request'[\s\S]*raise exception/);
    expect(resubmit).toMatch(/status <> 'revision_required'[\s\S]*actual_submitted_at is not null[\s\S]*plan_decision is distinct from 'revision_required'[\s\S]*raise exception/);
    expect(resubmit).toContain("public.ot_assert_planned_limit(v_actor_id, v_segments, p_request_id)");
    expect(resubmit).toContain("public.ot_assert_no_employee_overlap(v_actor_id, v_start_at, v_end_at, p_request_id)");
    for (const reset of [
      "status = 'pending_approval'",
      "plan_decision = null",
      "plan_decision_note = null",
      "plan_reviewed_by_user_id = null",
      "plan_reviewed_at = null",
      "employee_consent = 'accepted'",
      "consent_statement_version = v_consent_statement_version",
      "employee_consented_at = now()",
    ]) expect(updateClause).toContain(reset);
    expect(resubmit).toMatch(/action = 'resubmit_plan'[\s\S]*idempotency_key = p_idempotency_key[\s\S]*return v_replay_result/);
    expect(resubmit).toMatch(/'oldPlan'[\s\S]*'newPlan'[\s\S]*'oldApproverUserId'[\s\S]*'newApproverUserId'[\s\S]*'consentStatementVersion'[\s\S]*'result'/);
  });

  it("rejects overlap against another counted actual-or-requested occurrence", () => {
    const overlap = functionSql(sql, "ot_assert_no_employee_overlap");

    expect(overlap).toMatch(/actual_submitted_at is not null[\s\S]*actual_start_at[\s\S]*else r\.planned_start_at/);
    expect(overlap).toMatch(/actual_submitted_at is not null[\s\S]*actual_end_at[\s\S]*else r\.planned_end_at/);
    expect(overlap).toContain("p_exclude_request_id is null or r.id <> p_exclude_request_id");
    expect(overlap).toMatch(/status in \([\s\S]*'pending_approval'[\s\S]*'exported'[\s\S]*\)[\s\S]*or \(r\.status = 'revision_required' and r\.actual_submitted_at is not null\)/);
    for (const excluded of ["draft", "rejected", "cancelled"]) expect(overlap).not.toContain(`'${excluded}'`);
    expect(overlap).toContain("raise exception 'OT occurrence overlaps another counted request'");
  });

  it("exposes and verifies only the authenticated plan-resubmission RPC", () => {
    const signature = "public.ot_resubmit_plan(uuid, jsonb, text, uuid)";

    expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
    expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    expect(sql).toContain("revoke all on function public.ot_assert_no_employee_overlap(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated");
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("Plan resubmission RPC contract (Expected = valid)");
    for (const fact of ["ot_resubmit_plan", "uuid, jsonb, text, uuid", "security_definer", "fixed_search_path", "employee_state_guard", "request_lock", "week_union_lock", "resubmit_plan", "ot_assert_no_employee_overlap"]) expect(verify).toContain(fact);
    expect(verify).toContain("Plan resubmission RPC execute grants (Expected authenticated only)");
  });
});

describe("OT Request static module integration", () => {
  it("keeps employee OT private and makes personal actions explicit", () => {
    const screen = read("screens-ot.jsx");
    for (const component of ["OtEmployeeDashboard", "OtRequestForm", "OtConsentPanel", "OtActualConfirmationForm", "OtMyRequestsTable"]) {
      expect(screen).toContain(`function ${component}(`);
    }
    expect(screen).toContain('data-testid="ot-week-total"');
    expect(screen).toContain('data-testid="ot-consent-required"');
    expect(screen).toContain('data-testid="ot-confirm-actual"');
    expect(screen).toContain('"My OT requests"');
    expect(screen).not.toContain('"Employee leaderboard"');
  });

  it("uses only personal OT RPCs for employee actions and preserves truthful over-limit actuals", () => {
    const screen = read("screens-ot.jsx");
    const employee = screen.slice(screen.indexOf("function OtEmployeeDashboard("), screen.indexOf("function OtManagerDashboard("));

    for (const api of ["loadMyOtDashboard", "loadMyOtRequests", "loadOtEligibleApprovers", "createOtRequest", "recordOtConsent", "submitOtActual"]) {
      expect(employee).toContain(`window.${api}`);
    }
    expect(employee).not.toContain("loadOtManagerDashboard");
    expect(employee).toContain("const overLimit = projections.some(row => row.overLimit)");
    const request = employee.slice(employee.indexOf("function OtRequestForm("), employee.indexOf("function OtConsentPanel("));
    expect(request).toContain('<fieldset className="ot-form__fieldset" disabled={window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)}>');
    const actual = employee.slice(employee.indexOf("function OtActualConfirmationForm("), employee.indexOf("function OtMyRequestsTable("));
    expect(actual).toContain('<fieldset className="ot-form__fieldset" disabled={window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)}>');
    expect(actual).toContain("const complianceLikely = projections.some(row => row.overLimit)");
    expect(actual).not.toContain("&& !complianceLikely");
    expect(employee.match(/weekSummaryState.status === "ready"\s*\? window\.FlowMateOtRequestDomain\.buildWeekProjections/g)).toHaveLength(3);
    expect(actual).toContain("server will validate and save the truthful time");
    expect(employee).toContain("Math.abs(actualMinutes - plannedMinutes) > 30");
    expect(employee).toContain('status === "compliance_review_required"');
    expect(employee).toContain("crypto.randomUUID()");
    expect(employee).toContain('aria-label="Assigned approver"');
    expect(employee).toContain("approver.displayName || approver.email");
    expect(screen).toContain('storedStatus === "approved"');
    expect(employee).toContain('min={isRevision ? undefined : weekStart} max={isRevision ? undefined : addOtDays(weekStart, 6)}');
    expect(employee).toContain("startPersonalWeekLoad(nextWeekStart)");
    expect(employee).toContain("setAction(null)");
    expect(employee).toContain("buildWeekProjections(");
    expect(screen).toContain("state.weekKey === weekKey");
    expect(employee).toContain("resetIntentAfterEdit(");
    expect(employee).toContain("window.recordOtConsent(request.id, choice, OT_CONSENT_STATEMENT_VERSION, key)");
  });

  it("renders employee plan revision separately from actual correction", () => {
    const screen = read("screens-ot.jsx");
    const employee = screen.slice(screen.indexOf("function OtEmployeeDashboard("), screen.indexOf("const OT_MANAGER_METRIC_LABELS"));
    const requestForm = employee.slice(employee.indexOf("function OtRequestForm("), employee.indexOf("function OtConsentPanel("));

    expect(requestForm).toContain('function OtRequestForm({ mode = "create", request = null');
    expect(requestForm).toContain('const isRevision = mode === "revision"');
    for (const field of ["functionCode", "title", "workDate", "startTime", "endTime", "dayType", "workLocationType", "venue", "reasonCode", "reasonDetail", "approverUserId"]) expect(requestForm).toContain(field);
    expect(requestForm).toContain('{ totalField: "plannedMinutes" }');
    expect(requestForm).not.toContain("excludedSegments");
    expect(requestForm).toContain("window.resubmitOtPlan(request.id, payload, OT_CONSENT_STATEMENT_VERSION, intent.key)");
    expect(requestForm).toContain("Edit and resubmit request");
    expect(requestForm).toContain("Resubmit corrected request");
    expect(requestForm).toContain("resetIntentAfterEdit(");
    expect(employee).toContain('window.FlowMateOtRequestDomain.getRevisionWorkflow(request) === "plan"');
    expect(employee).toContain('window.FlowMateOtRequestDomain.getRevisionWorkflow(request) === "actual"');
    expect(employee).toContain('setAction({ type: "revision", request })');
    expect(employee).toContain('<OtRequestForm key={action.request.id} mode="revision" request={action.request}');
  });

  it("lets a plan revision move to another Bangkok week and summarizes the edited segments", () => {
    const screen = read("screens-ot.jsx");
    const requestForm = screen.slice(screen.indexOf("function OtRequestForm("), screen.indexOf("function OtConsentPanel("));

    expect(requestForm).toContain('type="date" min={isRevision ? undefined : weekStart} max={isRevision ? undefined : addOtDays(weekStart, 6)}');
    expect(requestForm).toContain("useOtWeekSummaries(preview.valid ? preview.segments : [])");
    expect(requestForm).toContain("plannedWeekSegments: preview.segments");
  });

  it("implements the manager weekly operations hub without an OT leaderboard", () => {
    const screen = read("screens-ot.jsx");
    for (const component of ["OtManagerDashboard", "OtApprovalQueue", "OtEventPlanForm", "OtTeamWeekTable", "OtRootCausePanel"]) {
      expect(screen).toContain(`function ${component}(`);
    }
    for (const label of ["Planned OT", "Confirmed", "Needs approval", "Near 36h limit", "OT by function", "Why OT happens"]) {
      expect(screen).toContain(`"${label}"`);
    }
    expect(screen).toContain("Assigned teams/events only");
    expect(screen).not.toMatch(/rank|top performer|commitment score/i);
  });

  it("keeps manager rows server-scoped and performs every bulk verification individually", () => {
    const screen = read("screens-ot.jsx");
    const manager = screen.slice(screen.indexOf("function OtManagerDashboard("), screen.indexOf("function OtRequestShell("));

    for (const api of ["loadOtManagerDashboard", "loadOtPeopleForEvent", "loadOtEligibleApprovers", "reviewOtPlan", "verifyOtActual"]) {
      expect(manager).toContain(`window.${api}`);
    }
    expect(manager).not.toMatch(/\.from\(["'`]ot_/);
    expect(manager).toContain("for (const request of requestsToVerify)");
    expect(manager).toContain("await window.verifyOtActual(");
    expect(manager).toContain("crypto.randomUUID()");
    expect(manager).toContain('decision !== "approved" && !note.trim()');
    expect(manager).toContain('&& !otValue(request, "actualSubmittedAt", "actual_submitted_at")');
    expect(manager).toContain("const historyEmployeeTotals = getOtManagerTotals(loadState.rows, true)");
    expect(manager).toContain('["cancelled", "rejected"].includes(getOtRequestStatus(request))');
  });

  it("requires an assigned-approver bulk review surface before any actual verification writes", () => {
    const screen = read("screens-ot.jsx");
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));

    expect(approval).toContain("function openBulkReview()");
    expect(approval).toContain("function confirmBulkVerification()");
    expect(approval.indexOf("function openBulkReview()")).toBeLessThan(approval.indexOf("function confirmBulkVerification()"));
    expect(approval).toContain("Bulk verification review");
    expect(approval).toContain("Consent timestamp");
    expect(approval).toContain("Signed variance");
    expect(approval).toContain("Employee weekly total");
    expect(approval).toContain("Excluded from bulk");
    expect(approval).toContain("onClick={confirmBulkVerification}");
    expect(approval).toContain("checks.canVerifyIndividually");
    expect(approval).toContain("checks.canBulkVerify");
    expect(approval).toContain("window.FlowMateOtRequestDomain.canActOnAssignedRequest(access, request)");
    expect(approval).toContain("Read only — assigned approver action");
    expect(approval).toContain("window.FlowMateOtRequestDomain.formatSignedHours(");
  });

  it("renders approved compliance rows as non-actionable while awaiting HR", () => {
    const screen = read("screens-ot.jsx");
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));

    expect(approval).toContain("function canTakeAction(kind, request)");
    expect(approval).toContain("checks.awaitingHrCompliance");
    expect(approval).toContain("Awaiting HR compliance");
    expect(approval).toContain("if (!canTakeAction(kind, request)) return;");
  });

  it("keeps plan revisions out of the manager queue and shares audited amendment action", () => {
    const screen = read("screens-ot.jsx");
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));
    const amendment = screen.slice(screen.indexOf("function OtActualAmendmentAction("), screen.indexOf("function OtAuditTimeline("));

    expect(screen).toContain('const needsApproval = filteredCurrentRows.filter(request => !otValue(request, "actualSubmittedAt", "actual_submitted_at") && getOtRequestStatus(request) === "pending_approval").length;');
    expect(approval).toContain('getOtRequestStatus(request) === "pending_approval"');
    expect(approval).not.toContain('["pending_approval", "revision_required"]');
    expect(amendment).toContain("window.FlowMateOtRequestDomain.canRequestActualAmendment(access, request)");
    expect(amendment).toContain("if (!reason.trim())");
    expect(amendment).toContain("window.FlowMateOtIntent.establish(");
    expect(amendment).toContain("window.requestOtActualAmendment(requestId, normalizedReason, currentIntent.key)");
    expect(amendment).toContain("The existing actual time remains in audit until the employee submits a correction.");
    expect(amendment).toContain('disabled={actionState.status === "submitting"}');
    expect(screen.match(/<OtActualAmendmentAction/g)).toHaveLength(2);
  });

  it("remounts the shared actual amendment action for each loaded request", () => {
    const screen = read("screens-ot.jsx");

    expect(screen).toContain('<OtActualAmendmentAction key={getOtManagerRequestId(selectedRow)} access={access} request={selectedRow}');
    expect(screen).toContain('<OtActualAmendmentAction key={getOtManagerRequestId(selected)} access={access} request={selected}');
  });

  it("previews event plans per employee and excludes every over-limit occurrence", () => {
    const screen = read("screens-ot.jsx");
    const eventForm = screen.slice(screen.indexOf("function OtEventPlanForm("), screen.indexOf("function OtRootCausePanel("));

    expect(eventForm).toContain("window.previewOtEventPlan(payload, form.employeeUserIds)");
    expect(eventForm).toContain("employee.canCreate");
    expect(eventForm).toContain("const eligibleEmployeeIds");
    expect(eventForm).toContain("window.createOtEventPlan(payload, eligibleEmployeeIds, intent.key)");
    expect(eventForm).toContain("This employee is excluded because at least one affected week would exceed 36h.");
    expect(eventForm).toContain("Consent received");
    expect(eventForm).toContain("Awaiting consent");
  });

  it("uses the approved deterministic root-cause rules only on authorized manager rows", () => {
    const screen = read("screens-ot.jsx");
    const rootCause = screen.slice(screen.indexOf("function OtRootCausePanel("), screen.indexOf("function OtRequestShell("));

    expect(rootCause).toContain("OT Health & Root Cause");
    expect(rootCause).toContain("window.FlowMateOtRequestDomain.buildRootCauseInsights(filteredRows");
    expect(rootCause).toContain("View authorized rows");
    expect(rootCause).toContain("Current filters stay applied");
    expect(rootCause).not.toMatch(/performance|productivity|commitment|value score/i);
  });

  it("deduplicates root-cause drill-down requests and ignores planned-only recurring weeks", () => {
    const screen = read("screens-ot.jsx");
    const rootCause = screen.slice(screen.indexOf("function buildOtInsightRows("), screen.indexOf("function OtRootCausePanel("));
    const panel = screen.slice(screen.indexOf("function OtRootCausePanel("), screen.indexOf("function OtRequestShell("));

    expect(rootCause).toContain("getOtManagerRequestId(request)");
    expect(rootCause).toContain("plannedMinutes: current.plannedMinutes + Number(request.plannedMinutes || 0)");
    expect(rootCause).toContain("actualMinutes: current.actualMinutes + Number(request.actualMinutes || 0)");
    expect(panel).toContain("window.FlowMateOtRequestDomain.countWeeksWithActualMinutes(confirmedRows)");
    expect(panel).toContain("buildOtInsightRows(filteredRows, selectedInsight.recordIds)");
  });

  it("renders owner, compliance, audit, access, and HR export only from server access capabilities", () => {
    const sql = read("supabase", "ot_request.sql");
    const screen = read("screens-ot.jsx");

    expect(sql).toContain("panuwee.w@garena.com");
    expect(sql).toContain("ot_current_user_is_owner");
    for (const component of ["OtOwnerDashboard", "OtComplianceQueue", "OtAuditTimeline", "OtAccessAdminPanel", "OtHrExportPanel"]) {
      expect(screen).toContain(`function ${component}(`);
    }
    expect(screen).toContain('owner: "ot-request/owner"');
    expect(screen).toContain('compliance: "ot-request/compliance"');
    expect(screen).toContain('audit: "ot-request/audit"');
    expect(screen).toContain('access: "ot-request/access"');
    expect(screen).toContain('export: "ot-request/export"');
    expect(screen).toContain('access.status === "ready" && access.isOwner');
    expect(screen).toContain('access.status === "ready" && (access.isOwner || access.isHrAdmin)');
    expect(screen).not.toMatch(/currentUserEmail\s*(?:===|==|\.includes|\.endsWith)/);
    expect(sql).not.toMatch(/create policy[^;]+on public\.(work_items|marketing_plans|product_book)/is);
  });

  it("keeps owner visibility read-only for normal approvals and shows truthful compliance evidence", () => {
    const screen = read("screens-ot.jsx");
    const manager = screen.slice(screen.indexOf("function OtManagerDashboard("), screen.indexOf("function OtApprovalQueue("));
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));
    const compliance = screen.slice(screen.indexOf("function OtComplianceQueue("), screen.indexOf("function OtHrExportPanel("));

    expect(manager).toContain("All Functions");
    expect(manager).toContain("access.isOwner || access.isHrAdmin");
    expect(approval).toContain("window.FlowMateOtRequestDomain.canActOnAssignedRequest(access, request)");
    expect(approval).toContain("Read only");
    for (const evidence of ["actualStartAt", "plannedStartAt", "actualWeekSegments", "actualVarianceReason", "actualDecisionNote", "weeklyTotals"]) {
      expect(compliance).toContain(evidence);
    }
    expect(compliance).toContain("actualMinutes: loadState.weeklyTotals");
    expect(compliance).toContain("projectedMinutes: loadState.weeklyTotals");
    expect(compliance).toContain("Projected / counted:");
    expect(compliance).toContain("window.reviewOtCompliance(");
    expect(compliance).toContain("<OtAuditTimeline");
    expect(compliance).toContain("if (!outcome || !note.trim())");
    expect(compliance).toContain("window.FlowMateOtIntent.establish(");
    expect(compliance).toContain("reviewSubmissionRef.current");
    expect(compliance).toContain("disabled={actionState.status === \"submitting\"}");
    expect(compliance).not.toContain("window.submitOtActual");
    expect(compliance).not.toMatch(/reviewOtCompliance\([^;]+crypto\.randomUUID\(\)/);
    expect(compliance).not.toMatch(/type="(?:datetime-local|time)"/);
  });

  it("exports only explicit HR-ready selections after a local CSV download succeeds", () => {
    const screen = read("screens-ot.jsx");
    const panel = screen.slice(screen.indexOf("function OtHrExportPanel("), screen.indexOf("function OtAccessAdminPanel("));
    const exactColumns = "request_id,employee_email,function,assignment,event_id,work_date,day_type,planned_start,planned_end,planned_break_minutes,planned_minutes,actual_start,actual_end,actual_break_minutes,actual_minutes,reason_code,reason_detail,approver_email,employee_confirmed_at,verified_at,compliance_outcome,hr_ready_at";

    expect(panel).toContain("window.loadOtHrReady(");
    expect(panel).toContain("window.FlowMateOtHrExport.createLocalFile(selectedRows, batchName.trim(), downloadOtHrCsv)");
    expect(panel).toContain("window.markOtExported(includedIds, batchName.trim(), intentKey)");
    expect(panel.indexOf("window.FlowMateOtHrExport.createLocalFile(")).toBeLessThan(panel.indexOf("window.markOtExported("));
    expect(panel).toContain("local CSV exists, but server export status remains unchanged");
    expect(panel).toContain("The local file was not created, and the server was not marked exported.");
    expect(panel).toContain("window.FlowMateOtHrExport.createLocalFile(");
    expect(read("supabase-ot-request.js")).toContain(exactColumns);
    expect(panel).not.toMatch(/salary|pay rate|bank|password|gps/i);
  });

  it("keeps audit read-only and access administration restricted to audited server RPCs", () => {
    const screen = read("screens-ot.jsx");
    const audit = screen.slice(screen.indexOf("function OtAuditTimeline("), screen.indexOf("function OtComplianceQueue("));
    const admin = screen.slice(screen.indexOf("function OtAccessAdminPanel("), screen.indexOf("function OtOwnerDashboard("));

    for (const field of ["actorUserId", "action", "oldStatus", "newStatus", "changedFields", "note", "createdAt"]) {
      expect(audit).toContain(field);
    }
    expect(audit).toContain("window.loadOtRequestAudit(");
    expect(audit).toContain("row.createdAt, JSON.stringify(row.changedFields)");
    expect(audit).not.toContain("flowmateSupabase");
    expect(admin).toContain("window.setOtApprover(");
    expect(admin).toContain("window.setOtSystemRole(");
    expect(admin).toContain("if (!reason.trim())");
    expect(admin).toContain("window.FlowMateOtIntent.establish(");
    expect(admin).toContain("OT_APPROVED_APPROVER_EMAILS");
    expect(admin).not.toMatch(/setOt(?:Approver|SystemRole)\([^;]+crypto\.randomUUID\(\)/);
    expect(admin).not.toMatch(/\.from\s*\(/);
    expect(admin).not.toContain("currentUserEmail");
  });

  it("adds OT Request as the fourth product without changing the first three", () => {
    const app = read("app.jsx");

    expect(app).toContain('const OT_REQUEST_PRODUCT_KEY = "ot-request"');
    expect(app).toContain("function chooseOtRequestProduct()");
    const productChoice = app.slice(app.indexOf("function ProductChoiceScreen"), app.indexOf("function normalizeProductBookArrayInput"));
    expect(productChoice.indexOf('"FlowMate"')).toBeLessThan(productChoice.indexOf('"Marketing Plan"'));
    expect(productChoice.indexOf('"Marketing Plan"')).toBeLessThan(productChoice.indexOf('"Product Book"'));
    expect(productChoice.indexOf('"Product Book"')).toBeLessThan(productChoice.indexOf('"OT Request"'));

    const screen = read("screens-ot.jsx");
    expect(screen).toContain("function OtRequestShell(");
    expect(screen).toContain("window.OtRequestShell = OtRequestShell");
    expect(screen).toContain('"ot-request/manager"');
    expect(screen).toContain('"ot-request/root-causes"');
    expect(screen).toContain("access.isEligibleApprover");
    expect(screen).toContain('if (access.status === "loading") return;');
    expect(screen).toContain('const visibleView = canOpenOtRequestView(activeView, access) ? activeView : "overview";');
  });

  it("keeps active entry pages on one OT release version", () => {
    const entries = [["index.html"], ["home", "index.html"], ["product-book", "index.html"]].map(parts => read(...parts));

    for (const html of entries) {
      expect(html).toContain("ot-request-domain.js?v=20260807-02");
      expect(html).toContain("supabase-ot-request.js?v=20260807-02");
      expect(html).toContain("screens-ot.js?v=20260807-02");
      expect(html).toContain("app.js?v=20260807-02");
      expect(html).toContain("app.css?v=20260807-02");
    }
  });

  it("uses labelled warnings and accessible OT navigation state", () => {
    const screen = read("screens-ot.jsx");
    const warning = screen.slice(screen.indexOf("function getOtAnnouncementProps("), screen.indexOf("function OtLimitProgress("));
    const navigation = screen.slice(screen.indexOf('<nav className="ot-sidebar"'), screen.indexOf("</nav>", screen.indexOf('<nav className="ot-sidebar"')));

    expect(warning).toContain('? { role: "alert" }');
    expect(warning).toContain('{ role: "status", "aria-live": "polite" }');
    expect(navigation).toContain('aria-label="OT Request navigation"');
    expect(navigation.match(/aria-current=\{visibleView ===/g)).toHaveLength(9);
    for (const view of ["overview", "my-requests", "manager", "root-causes", "compliance", "audit", "export", "owner", "access"]) {
      expect(navigation).toContain(`aria-current={visibleView === "${view}" ? "page" : undefined}`);
    }
    expect(screen).not.toContain("function getOtCurrentPageProps(");
  });

  it("connects every personal OT action to its rendered submission feedback", () => {
    const screen = read("screens-ot.jsx");
    const describedProps = screen.slice(screen.indexOf("function getOtDescribedActionProps("), screen.indexOf("function OtWarning("));
    const requestForm = screen.slice(screen.indexOf("function OtRequestForm("), screen.indexOf("function OtConsentPanel("));
    const consentPanel = screen.slice(screen.indexOf("function OtConsentPanel("), screen.indexOf("function OtActualConfirmationForm("));
    const actualForm = screen.slice(screen.indexOf("function OtActualConfirmationForm("), screen.indexOf("function OtMyRequestsTable("));

    expect(describedProps).toContain('return isDescribed ? { "aria-describedby": descriptionId } : {};');
    expect(requestForm.match(/getOtDescribedActionProps\(/g)).toHaveLength(1);
    expect(requestForm).toContain('{...getOtDescribedActionProps("ot-request-submit-feedback", Boolean(submitState.message))}');
    expect(consentPanel.match(/getOtDescribedActionProps\(/g)).toHaveLength(2);
    expect(consentPanel).toContain('{...getOtDescribedActionProps("ot-consent-submit-feedback", Boolean(submitState.message))}');
    expect(actualForm.match(/getOtDescribedActionProps\(/g)).toHaveLength(1);
    expect(actualForm).toContain('{...getOtDescribedActionProps("ot-actual-submit-feedback", Boolean(submitState.message))}');
  });

  it("exposes ProductSwitch as a labelled control group", () => {
    const app = read("app.jsx");
    const productSwitch = app.slice(app.indexOf("function ProductSwitch("), app.indexOf("function HomeButton("));

    expect(productSwitch).toContain('role: "group"');
    expect(productSwitch).toContain('"aria-label": "Product switch"');
  });

  it("keeps OT tables contained and keyboard focus visible across themes and viewports", () => {
    const css = read("app.css");
    const otStyles = css.slice(css.indexOf("/* ---------- OT Request shell ---------- */"));
    const mobile = otStyles.slice(otStyles.indexOf("@media (max-width: 760px)"));
    const warningRule = otStyles.slice(otStyles.indexOf(".ot-warning {"), otStyles.indexOf(".ot-warning--error"));
    const darkTheme = css.slice(css.indexOf('html[data-theme="dark"] {'), css.indexOf("}", css.indexOf('html[data-theme="dark"] {')) + 1);

    expect(otStyles).toContain(".ot-table-wrap { overflow-x: auto; }");
    expect(otStyles).toContain(".ot-sidebar .nav-item:focus-visible");
    expect(otStyles).toContain(".ot-link-button:focus-visible");
    expect(warningRule).toContain("background: var(--garena-white);");
    expect(warningRule).toContain("color: var(--garena-iron);");
    expect(darkTheme).toContain("--garena-white: #171A1F;");
    expect(darkTheme).toContain("--garena-iron: #D7DCE2;");
    expect(mobile).toContain(".ot-shell {");
    expect(mobile).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(mobile).toContain(".ot-sidebar {");
    expect(mobile).toContain("overflow-x: auto;");
    expect(mobile).toContain(".ot-metric-grid--employee,");
    expect(mobile).toContain(".ot-form__actions .btn { width: 100%; }");
  });

  it("loads OT runtime files before the application on every tracked entry", () => {
    for (const entry of [["index.html"], ["home", "index.html"], ["product-book", "index.html"]]) {
      const html = read(...entry);
      expect(html.indexOf("ot-request-domain.js")).toBeLessThan(html.indexOf("screens-ot.js"));
      expect(html.indexOf("supabase-ot-request.js")).toBeLessThan(html.indexOf("screens-ot.js"));
      expect(html.indexOf("screens-ot.js")).toBeLessThan(html.indexOf("app.js"));
    }
  });

  it("compiles the OT screen before the application bundle", () => {
    const build = read("build-github.cjs");
    expect(build).toContain('"screens-c.jsx", "screens-ot.jsx", "app.jsx"');
  });
});
