import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

const clientPath = join(process.cwd(), "supabase-ot-request.js");
const requestId = "11111111-1111-4111-8111-111111111111";
const employeeId = "22222222-2222-4222-8222-222222222222";
const idempotencyKey = "33333333-3333-4333-8333-333333333333";
const consentStatementVersion = "ot-consent-v1";

function loadClient(rpc: (name: string, params: unknown) => Promise<{ data: unknown; error: unknown }>, options: { userError?: (error: unknown, fallback: string) => string } = {}) {
  const sandbox: { window: Record<string, unknown> } = {
    window: {
      flowmateSupabase: { rpc },
      ...(options.userError ? { flowmateUserError: options.userError } : {}),
    },
  };
  vm.runInNewContext(readFileSync(clientPath, "utf8"), sandbox);
  return sandbox.window as Record<string, (...args: unknown[]) => Promise<unknown>>;
}

describe("OT request browser client", () => {
  it("maps every OT client wrapper to its exact RPC payload and returns server data", async () => {
    const calls: Array<{ name: string; params: unknown }> = [];
    const data = { ok: true, requestId };
    const client = loadClient(async (name, params) => {
      calls.push({ name, params });
      return { data, error: null };
    });
    const payload = { title: "Patch launch" };
    const actualPayload = { actualStartAt: "2026-08-07T18:00:00Z" };
    const cases: Array<{ wrapper: string; args: unknown[]; name: string; params: unknown }> = [
      { wrapper: "loadOtAccessContext", args: [], name: "ot_get_access_context", params: {} },
      { wrapper: "loadMyOtDashboard", args: ["2026-08-03"], name: "ot_get_my_dashboard", params: { p_week_start: "2026-08-03" } },
      { wrapper: "loadMyOtRequests", args: [], name: "ot_list_my_requests", params: { p_week_start: null } },
      { wrapper: "loadOtManagerDashboard", args: ["2026-08-03", "MKT"], name: "ot_get_manager_dashboard", params: { p_week_start: "2026-08-03", p_function_code: "MKT" } },
      { wrapper: "loadOtEligibleApprovers", args: [], name: "ot_list_eligible_approvers", params: {} },
      { wrapper: "loadOtPeopleForEvent", args: [], name: "ot_list_people_for_event", params: {} },
      { wrapper: "createOtRequest", args: [payload, idempotencyKey], name: "ot_create_request", params: { p_payload: payload, p_idempotency_key: idempotencyKey } },
      { wrapper: "previewOtEventPlan", args: [payload, [employeeId]], name: "ot_preview_event_plan", params: { p_payload: payload, p_employee_user_ids: [employeeId] } },
      { wrapper: "createOtEventPlan", args: [payload, [employeeId], idempotencyKey], name: "ot_create_event_plan", params: { p_payload: payload, p_employee_user_ids: [employeeId], p_idempotency_key: idempotencyKey } },
      { wrapper: "recordOtConsent", args: [requestId, true, consentStatementVersion, idempotencyKey], name: "ot_record_consent", params: { p_request_id: requestId, p_accept: true, p_consent_statement_version: consentStatementVersion, p_idempotency_key: idempotencyKey } },
      { wrapper: "reviewOtPlan", args: [requestId, "approved", "Looks good", idempotencyKey], name: "ot_review_plan", params: { p_request_id: requestId, p_decision: "approved", p_note: "Looks good", p_idempotency_key: idempotencyKey } },
      { wrapper: "submitOtActual", args: [requestId, actualPayload, idempotencyKey], name: "ot_submit_actual", params: { p_request_id: requestId, p_payload: actualPayload, p_idempotency_key: idempotencyKey } },
      { wrapper: "verifyOtActual", args: [requestId, "verified", "Confirmed", idempotencyKey], name: "ot_verify_actual", params: { p_request_id: requestId, p_decision: "verified", p_note: "Confirmed", p_idempotency_key: idempotencyKey } },
      { wrapper: "loadOtComplianceQueue", args: [], name: "ot_list_compliance_queue", params: { p_week_start: null } },
      { wrapper: "reviewOtCompliance", args: [requestId, "approved", "Resolved", idempotencyKey], name: "ot_review_compliance", params: { p_request_id: requestId, p_outcome: "approved", p_note: "Resolved", p_idempotency_key: idempotencyKey } },
      { wrapper: "loadOtRequestAudit", args: [requestId], name: "ot_list_request_audit", params: { p_request_id: requestId } },
      { wrapper: "loadOtHrReady", args: [], name: "ot_list_hr_ready", params: { p_week_start: null } },
      { wrapper: "markOtExported", args: [[requestId], "August payroll", idempotencyKey], name: "ot_mark_exported", params: { p_request_ids: [requestId], p_batch_name: "August payroll", p_idempotency_key: idempotencyKey } },
      { wrapper: "setOtApprover", args: [employeeId, true, "Coverage update", idempotencyKey], name: "ot_set_approver", params: { p_user_id: employeeId, p_active: true, p_reason: "Coverage update", p_idempotency_key: idempotencyKey } },
      { wrapper: "setOtSystemRole", args: [employeeId, "owner", true, "Ownership transfer", idempotencyKey], name: "ot_set_system_role", params: { p_user_id: employeeId, p_role_code: "owner", p_active: true, p_reason: "Ownership transfer", p_idempotency_key: idempotencyKey } },
    ];

    for (const testCase of cases) {
      await expect(client[testCase.wrapper](...testCase.args)).resolves.toEqual(data);
    }

    expect(calls).toEqual(cases.map(({ name, params }) => ({ name, params })));
  });

  it("sends the accepted decision and consent statement version to the consent RPC", async () => {
    const calls: Array<{ name: string; params: unknown }> = [];
    const client = loadClient(async (name, params) => {
      calls.push({ name, params });
      return { data: { ok: true }, error: null };
    });

    await client.recordOtConsent(requestId, false, consentStatementVersion, idempotencyKey);

    expect(calls).toEqual([{
      name: "ot_record_consent",
      params: {
        p_request_id: requestId,
        p_accept: false,
        p_consent_statement_version: consentStatementVersion,
        p_idempotency_key: idempotencyKey,
      },
    }]);
  });

  it("surfaces a safe OT-specific server error", async () => {
    const client = loadClient(
      async () => ({ data: null, error: { message: "raw database detail" } }),
      { userError: (_error, fallback) => `Safe: ${fallback}` },
    );

    await expect(client.createOtRequest({ title: "Patch launch" }, idempotencyKey))
      .rejects.toThrow("Safe: OT request could not be submitted.");
  });

  it("uses the server message when no shared error mapper is loaded", async () => {
    const client = loadClient(async () => ({ data: null, error: { message: "This OT request is over the weekly limit." } }));

    await expect(client.loadMyOtDashboard("2026-08-03"))
      .rejects.toThrow("This OT request is over the weekly limit.");
  });

  it("fails clearly when the Supabase client is unavailable", async () => {
    const sandbox = { window: {} as Record<string, unknown> };
    vm.runInNewContext(readFileSync(clientPath, "utf8"), sandbox);

    await expect((sandbox.window as Record<string, (...args: unknown[]) => Promise<unknown>>).loadOtAccessContext())
      .rejects.toThrow("OT Request data service is not ready.");
  });

  it("does not expose a direct table client for OT mutations", () => {
    const source = readFileSync(clientPath, "utf8");
    expect(source).not.toMatch(/\.from\s*\(/);
  });

  it("builds the exact HR-ready CSV contract and escapes spreadsheet control characters", () => {
    const client = loadClient(async () => ({ data: null, error: null }));
    const csvTools = (client as unknown as {
      FlowMateOtHrCsv: { build: (rows: Array<Record<string, unknown>>) => string };
    }).FlowMateOtHrCsv;
    const csv = csvTools.build([{
      id: requestId,
      employee_email: "employee@garena.com",
      function_code: "mkt",
      title: "Patch, \"launch\"\nnight",
      event_plan_id: null,
      actual_start_at: "2026-08-07T18:30:00Z",
      day_type: "working_day",
      planned_start_at: "2026-08-07T18:00:00+07:00",
      planned_end_at: "2026-08-07T20:00:00+07:00",
      planned_break_minutes: 0,
      planned_minutes: 120,
      actual_end_at: "2026-08-07T21:00:00+07:00",
      actual_break_minutes: 15,
      actual_minutes: 135,
      reason_code: "scope_change",
      reason_detail: "Line one\nLine two",
      approver_email: "approver@garena.com",
      actual_submitted_at: "2026-08-07T21:05:00+07:00",
      actual_verified_at: "2026-08-07T21:15:00+07:00",
      compliance_outcome: "approved",
      hr_ready_at: "2026-08-07T21:20:00+07:00",
    }]);

    expect(csv.split("\r\n", 1)[0]).toBe("request_id,employee_email,function,assignment,event_id,work_date,day_type,planned_start,planned_end,planned_break_minutes,planned_minutes,actual_start,actual_end,actual_break_minutes,actual_minutes,reason_code,reason_detail,approver_email,employee_confirmed_at,verified_at,compliance_outcome,hr_ready_at");
    expect(csv).toContain('"Patch, ""launch""\nnight"');
    expect(csv).toContain('"Line one\nLine two"');
    expect(csv).toContain(",2026-08-08,working_day,");
    expect(csv).not.toMatch(/salary|pay_rate|bank|password|gps/i);
  });
});
