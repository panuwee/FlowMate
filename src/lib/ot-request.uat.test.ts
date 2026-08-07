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
    expect(submit).toMatch(/actual_week_segments[\s\S]*v_segments[\s\S]*jsonb_agg/);
    expect(submit).toContain("public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments)");
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
    expect(employee).toContain('min={weekStart} max={addOtDays(weekStart, 6)}');
    expect(employee).toContain("startPersonalWeekLoad(nextWeekStart)");
    expect(employee).toContain("setAction(null)");
    expect(employee).toContain("buildWeekProjections(");
    expect(screen).toContain("state.weekKey === weekKey");
    expect(employee).toContain("resetIntentAfterEdit(");
    expect(employee).toContain("window.recordOtConsent(request.id, choice, OT_CONSENT_STATEMENT_VERSION, key)");
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

  it("loads OT runtime files before the application on every tracked entry", () => {
    for (const entry of [["index.html"], ["home", "index.html"], ["product-book", "index.html"]]) {
      const html = read(...entry);
      expect(html).toContain("ot-request-domain.js?v=20260807-01");
      expect(html).toContain("supabase-ot-request.js?v=20260807-01");
      expect(html).toContain("screens-ot.js?v=20260807-01");
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
