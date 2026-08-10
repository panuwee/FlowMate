import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadDomain() {
  const code = readFileSync(join(process.cwd(), "ot-request-domain.js"), "utf8");
  const sandbox = { window: {} as Record<string, unknown> };
  vm.runInNewContext(code, sandbox);
  return (sandbox.window as any).FlowMateOtRequestDomain;
}

describe("OT request domain", () => {
  it("starts a selected personal week without retaining prior-week data", () => {
    const domain = loadDomain();
    expect(domain.startPersonalWeekLoad("2026-08-10")).toEqual({
      status: "loading",
      weekStart: "2026-08-10",
      dashboard: null,
      requests: [],
      message: "",
    });
  });

  it("projects every affected week independently and excludes the replaced occurrence", () => {
    const domain = loadDomain();
    const rows = domain.buildWeekProjections(
      [
        { weekStart: "2026-08-03", minutes: 30 },
        { weekStart: "2026-08-10", minutes: 20 },
      ],
      {
        "2026-08-03": { plannedMinutes: 2130, actualMinutes: 2110 },
        "2026-08-10": { plannedMinutes: 2160, actualMinutes: 2155 },
      },
      { totalField: "plannedMinutes", excludedSegments: [{ weekStart: "2026-08-03", minutes: 30 }, { weekStart: "2026-08-10", minutes: 10 }] },
    );
    expect(rows).toEqual([
      { weekStart: "2026-08-03", currentMinutes: 2100, addedMinutes: 30, projectedMinutes: 2130, remainingMinutes: 30, overLimit: false },
      { weekStart: "2026-08-10", currentMinutes: 2150, addedMinutes: 20, projectedMinutes: 2170, remainingMinutes: 0, overLimit: true },
    ]);
  });

  it("blocks a same-week plan revision when its summary already excludes the pre-work revision", () => {
    const domain = loadDomain();
    const rows = domain.buildWeekProjections(
      [{ weekStart: "2026-08-10", minutes: 100 }],
      { "2026-08-10": { plannedMinutes: 2100 } },
      { totalField: "plannedMinutes" },
    );

    expect(rows).toEqual([{
      weekStart: "2026-08-10",
      currentMinutes: 2100,
      addedMinutes: 100,
      projectedMinutes: 2200,
      remainingMinutes: 0,
      overLimit: true,
    }]);
  });

  it("rotates an idempotency intent only after an attempted payload is edited", () => {
    const domain = loadDomain();
    const unattempted = { key: "intent-one", attempted: false };
    expect(domain.resetIntentAfterEdit(unattempted, () => "intent-two")).toBe(unattempted);
    expect(domain.resetIntentAfterEdit({ key: "intent-one", attempted: true }, () => "intent-two")).toEqual({ key: "intent-two", attempted: false });
  });

  it("locks payload editing only while a submission is in flight", () => {
    const domain = loadDomain();
    expect(domain.isSubmissionLocked("submitting")).toBe(true);
    expect(domain.isSubmissionLocked("idle")).toBe(false);
    expect(domain.isSubmissionLocked("error")).toBe(false);
    expect(domain.isSubmissionLocked("success")).toBe(false);
  });

  it("calculates same-day and overnight minutes after break", () => {
    const domain = loadDomain();
    expect(domain.calculateDurationMinutes({ startTime: "18:00", endTime: "22:30", breakMinutes: 30 })).toBe(240);
    expect(domain.calculateDurationMinutes({ startTime: "22:00", endTime: "02:00", breakMinutes: 30 })).toBe(210);
  });

  it("uses Monday as the Bangkok workweek start", () => {
    const domain = loadDomain();
    expect(domain.getWeekStartKey("2026-08-09")).toBe("2026-08-03");
    expect(domain.getWeekStartKey("2026-08-10")).toBe("2026-08-10");
  });

  it("returns neutral, advisory, high risk, limit, and blocked states", () => {
    const domain = loadDomain();
    expect(domain.getLimitState(23 * 60).key).toBe("neutral");
    expect(domain.getLimitState(24 * 60).key).toBe("advisory");
    expect(domain.getLimitState(30 * 60).key).toBe("high_risk");
    expect(domain.getLimitState(36 * 60).key).toBe("limit_reached");
    expect(domain.getLimitState(36 * 60 + 1).key).toBe("blocked");
  });

  it("keeps over-limit actual time in compliance review before HR-ready", () => {
    const domain = loadDomain();
    expect(domain.deriveRequestStatus({
      actualSubmittedAt: "2026-08-09T10:00:00Z",
      complianceRequired: true,
      hrReadyAt: "2026-08-10T10:00:00Z",
    })).toBe("compliance_review_required");
  });

  it("requires explicit break allocation across a workweek boundary", () => {
    const domain = loadDomain();
    expect(() => domain.splitMinutesByWeek({
      startDate: "2026-08-09", startTime: "22:00", endDate: "2026-08-10", endTime: "02:00", breakMinutes: 30,
    })).toThrow("Break allocation is required across a workweek boundary.");
  });

  it("allocates an overnight Sunday occurrence between affected workweeks", () => {
    const domain = loadDomain();
    expect(domain.splitMinutesByWeek({
      startDate: "2026-08-09", startTime: "22:00", endDate: "2026-08-10", endTime: "02:00", breakMinutes: 30,
      breakMinutesBeforeBoundary: 10, breakMinutesAfterBoundary: 20,
    })).toEqual([
      { weekStart: "2026-08-03", minutes: 110 },
      { weekStart: "2026-08-10", minutes: 100 },
    ]);
  });

  it("rejects cross-week break allocations that do not equal the total break", () => {
    const domain = loadDomain();
    expect(() => domain.splitMinutesByWeek({
      startDate: "2026-08-09", startTime: "22:00", endDate: "2026-08-10", endTime: "02:00", breakMinutes: 30,
      breakMinutesBeforeBoundary: 10, breakMinutesAfterBoundary: 10,
    })).toThrow("Break allocation must equal breakMinutes.");
  });

  it("rejects a week segment whose break leaves no worked OT time", () => {
    const domain = loadDomain();
    expect(() => domain.splitMinutesByWeek({
      startDate: "2026-08-10", startTime: "18:00", endTime: "18:30", breakMinutes: 30,
    })).toThrow("OT duration must be greater than zero.");
  });

  it("does not expose peer records", () => {
    const domain = loadDomain();
    expect(domain.canViewRequest({ userId: "peer" }, { employeeUserId: "employee", approverUserId: "lead" })).toBe(false);
    expect(domain.canViewRequest({ userId: "employee" }, { employeeUserId: "employee", approverUserId: "lead" })).toBe(true);
  });

  it("allows only OT owner, HR/Admin, employee, or assigned approver to view a request", () => {
    const domain = loadDomain();
    const request = { employeeUserId: "employee", approverUserId: "lead" };
    expect(domain.canViewRequest({ userId: "owner", roleCode: "owner" }, request)).toBe(true);
    expect(domain.canViewRequest({ userId: "hr", roleCode: "hr_admin" }, request)).toBe(true);
    expect(domain.canViewRequest({ userId: "lead" }, request)).toBe(true);
  });

  it("derives the consent, planned, actual, and export workflow facts in order", () => {
    const domain = loadDomain();
    expect(domain.deriveRequestStatus({ requestType: "consented", isEventAssignment: true })).toBe("awaiting_consent");
    expect(domain.deriveRequestStatus({ requestType: "planned", submittedAt: "2026-08-01T10:00:00Z" })).toBe("pending_approval");
    expect(domain.deriveRequestStatus({ requestType: "planned", approvedAt: "2026-08-01T10:00:00Z" })).toBe("approved");
    expect(domain.deriveRequestStatus({ requestType: "actual", actualSubmittedAt: "2026-08-01T22:00:00Z" })).toBe("pending_actual_verification");
    expect(domain.deriveRequestStatus({ requestType: "actual", exportedAt: "2026-08-02T10:00:00Z" })).toBe("exported");
  });

  it("rejects a missing request type before an over-limit record can become HR-ready", () => {
    const domain = loadDomain();
    expect(() => domain.deriveRequestStatus({
      actualWeeklyMinutes: 36 * 60 + 1,
      actualSubmittedAt: "2026-08-01T22:00:00Z",
      hrReadyAt: "2026-08-02T10:00:00Z",
    })).toThrow("Request type must be planned, consented, or actual.");
  });

  it("rejects an invalid request type before it can bypass the weekly limit", () => {
    const domain = loadDomain();
    expect(() => domain.deriveRequestStatus({
      requestType: "preview",
      actualWeeklyMinutes: 36 * 60 + 1,
      hrReadyAt: "2026-08-02T10:00:00Z",
    })).toThrow("Request type must be planned, consented, or actual.");
  });

  it("hard-blocks a planned weekly total above 36 hours", () => {
    const domain = loadDomain();
    expect(domain.deriveRequestStatus({
      requestType: "planned",
      plannedWeeklyMinutes: 36 * 60 + 1,
      submittedAt: "2026-08-01T10:00:00Z",
    })).toBe("blocked");
  });

  it("hard-blocks a consented weekly total above 36 hours", () => {
    const domain = loadDomain();
    expect(domain.deriveRequestStatus({
      requestType: "consented",
      consentedWeeklyMinutes: 36 * 60 + 1,
      consentAt: "2026-08-01T10:00:00Z",
    })).toBe("blocked");
  });

  it("routes over-limit actual time to compliance review even when HR-ready is present", () => {
    const domain = loadDomain();
    expect(domain.deriveRequestStatus({
      requestType: "actual",
      actualWeeklyMinutes: 36 * 60 + 1,
      actualSubmittedAt: "2026-08-01T22:00:00Z",
      hrReadyAt: "2026-08-02T10:00:00Z",
    })).toBe("compliance_review_required");
  });

  it("uses only a caller-supplied reference time for actual confirmation", () => {
    const domain = loadDomain();
    const approvedRequest = {
      requestType: "planned",
      approvedAt: "2026-08-01T10:00:00Z",
      plannedEndAt: "2026-08-01T22:00:00Z",
    };
    expect(domain.deriveRequestStatus(approvedRequest, { now: "2026-08-01T21:59:00Z" })).toBe("approved");
    expect(domain.deriveRequestStatus(approvedRequest, { now: "2026-08-01T22:00:00Z" })).toBe("actual_confirmation_required");
    expect(domain.deriveRequestStatus(approvedRequest)).toBe("approved");
  });

  it("allows individual compliance verification while keeping compliance rows out of bulk", () => {
    const domain = loadDomain();
    const compliance = domain.getActualVerificationEligibility({
      source: "event_plan",
      employeeConsent: "accepted",
      employeeConsentedAt: "2026-08-03T10:00:00Z",
      actualSubmittedAt: "2026-08-03T22:00:00Z",
      actualWeekSegments: [{ weekStart: "2026-08-03", minutes: 180 }],
      plannedMinutes: 120,
      actualMinutes: 180,
      actualVarianceReason: "Venue close was delayed.",
      complianceRequired: true,
      status: "compliance_review_required",
    }, 2200);

    expect(compliance.canVerifyIndividually).toBe(true);
    expect(compliance.canBulkVerify).toBe(false);
    expect(compliance.complianceRequired).toBe(true);
  });

  it("makes an already-approved compliance row await HR without another approver write", () => {
    const domain = loadDomain();
    const approvedCompliance = domain.getActualVerificationEligibility({
      source: "event_plan",
      employeeConsent: "accepted",
      employeeConsentedAt: "2026-08-03T10:00:00Z",
      actualSubmittedAt: "2026-08-03T22:00:00Z",
      actualWeekSegments: [{ weekStart: "2026-08-03", minutes: 180 }],
      plannedMinutes: 180,
      actualMinutes: 180,
      actualDecision: "approved",
      complianceRequired: true,
      status: "compliance_review_required",
    }, 2200);

    expect(approvedCompliance.awaitingHrCompliance).toBe(true);
    expect(approvedCompliance.canVerifyIndividually).toBe(false);
    expect(approvedCompliance.canBulkVerify).toBe(false);
  });

  it("counts only accepted actual outcomes as confirmed", () => {
    const domain = loadDomain();
    expect(domain.isConfirmedActual({ actualVerifiedAt: "2026-08-03T22:00:00Z", status: "pending_actual_verification" })).toBe(false);
    expect(domain.isConfirmedActual({ actualVerifiedAt: "2026-08-03T22:00:00Z", actualDecision: "rejected", status: "rejected" })).toBe(false);
    expect(domain.isConfirmedActual({ actualVerifiedAt: "2026-08-03T22:00:00Z", actualDecision: "revision_required", status: "revision_required" })).toBe(false);
    expect(domain.isConfirmedActual({ actualVerifiedAt: "2026-08-03T22:00:00Z", actualDecision: "approved", status: "cancelled" })).toBe(false);
    expect(domain.isConfirmedActual({ actualVerifiedAt: "2026-08-03T22:00:00Z", actualDecision: "approved", status: "compliance_review_required" })).toBe(true);
    expect(domain.isConfirmedActual({ status: "hr_ready" })).toBe(true);
  });

  it("allows actions only for the explicitly assigned eligible approver", () => {
    const domain = loadDomain();
    const request = { approverUserId: "assigned-lead" };
    expect(domain.canActOnAssignedRequest({ userId: "assigned-lead", isEligibleApprover: true }, request)).toBe(true);
    expect(domain.canActOnAssignedRequest({ userId: "other-lead", isEligibleApprover: true }, request)).toBe(false);
    expect(domain.canActOnAssignedRequest({ userId: "assigned-lead", isOwner: true, isEligibleApprover: false }, request)).toBe(false);
    expect(domain.canActOnAssignedRequest({ userId: "assigned-lead", isHrAdmin: true, isEligibleApprover: false }, request)).toBe(false);
  });

  it("distinguishes an employee plan revision from an employee actual correction", () => {
    const domain = loadDomain();

    expect(domain.getRevisionWorkflow({
      status: "revision_required",
      planDecision: "revision_required",
      actualSubmittedAt: null,
      actualDecision: null,
    })).toBe("plan");
    expect(domain.getRevisionWorkflow({
      status: "revision_required",
      planDecision: "approved",
      actualSubmittedAt: "2026-08-08T15:00:00Z",
      actualDecision: "revision_required",
    })).toBe("actual");
    expect(domain.getRevisionWorkflow({
      status: "revision_required",
      planDecision: "revision_required",
      actualSubmittedAt: "2026-08-08T15:00:00Z",
      actualDecision: null,
    })).toBeNull();
  });

  it("offers actual amendment only to elevated actors for approved non-exported actuals", () => {
    const domain = loadDomain();
    const approvedActual = {
      status: "hr_ready",
      actualSubmittedAt: "2026-08-08T15:00:00Z",
      actualDecision: "approved",
      actualVerifiedByUserId: "assigned-lead",
      actualVerifiedAt: "2026-08-08T15:30:00Z",
    };

    expect(domain.canRequestActualAmendment({ isOwner: true }, approvedActual)).toBe(true);
    expect(domain.canRequestActualAmendment({ isHrAdmin: true, isEligibleApprover: true }, { ...approvedActual, status: "compliance_review_required" })).toBe(true);
    expect(domain.canRequestActualAmendment({ isHrAdmin: true, isEligibleApprover: false }, approvedActual)).toBe(false);
    expect(domain.canRequestActualAmendment({ isEligibleApprover: true }, approvedActual)).toBe(false);
    expect(domain.canRequestActualAmendment({ isOwner: true }, { ...approvedActual, status: "exported", exportedAt: "2026-08-09T10:00:00Z" })).toBe(false);
    expect(domain.canRequestActualAmendment({ isOwner: true }, { ...approvedActual, actualVerifiedByUserId: null })).toBe(false);
    expect(domain.canRequestActualAmendment({ isOwner: true }, { ...approvedActual, actualDecision: "revision_required" })).toBe(false);
  });

  it("formats positive, negative, and zero OT variance with an explicit sign", () => {
    const domain = loadDomain();
    expect(domain.formatSignedHours(90)).toBe("+1h 30m");
    expect(domain.formatSignedHours(-90)).toBe("-1h 30m");
    expect(domain.formatSignedHours(0)).toBe("0h");
  });

  it("flags material confirmed-OT changes against the prior four-week average", () => {
    const domain = loadDomain();
    const insights = domain.buildRootCauseInsights([
      { id: "previous-1", functionCode: "ops", workDate: "2026-07-06", actualMinutes: 100, actualDecision: "approved", actualVerifiedAt: "2026-07-06T20:00:00Z" },
      { id: "previous-2", functionCode: "ops", workDate: "2026-07-13", actualMinutes: 100, actualDecision: "approved", actualVerifiedAt: "2026-07-13T20:00:00Z" },
      { id: "previous-3", functionCode: "ops", workDate: "2026-07-20", actualMinutes: 100, actualDecision: "approved", actualVerifiedAt: "2026-07-20T20:00:00Z" },
      { id: "previous-4", functionCode: "ops", workDate: "2026-07-27", actualMinutes: 100, actualDecision: "approved", actualVerifiedAt: "2026-07-27T20:00:00Z" },
      { id: "current", functionCode: "ops", workDate: "2026-08-03", actualMinutes: 150, actualDecision: "approved", actualVerifiedAt: "2026-08-03T20:00:00Z" },
    ], { currentWeekStart: "2026-08-03" });
    expect(insights).toContainEqual(expect.objectContaining({ key: "function_confirmed_ot_change", functionCode: "ops", weekStart: "2026-08-03" }));
  });

  it("suppresses employee-derived recurring OT signals, record IDs, and messages", () => {
    const domain = loadDomain();
    const insights = domain.buildRootCauseInsights([
      { id: "week-one", employeeUserId: "employee", workDate: "2026-07-27", actualMinutes: 1500, actualDecision: "approved", actualVerifiedAt: "2026-07-27T20:00:00Z" },
      { id: "week-two", employeeUserId: "employee", workDate: "2026-08-03", actualMinutes: 1500, actualDecision: "approved", actualVerifiedAt: "2026-08-03T20:00:00Z" },
    ], { currentWeekStart: "2026-08-03" });
    const serialized = JSON.stringify(insights);

    expect(insights.map((insight: { key: string }) => insight.key)).not.toContain("recurring_employee_high_ot");
    expect(serialized).not.toMatch(/team member|employee|two consecutive weeks/i);
  });

  it("finds event variance, emergency share, and recurring rework or scope change", () => {
    const domain = loadDomain();
    const insights = domain.buildRootCauseInsights([
      { id: "event-plan", eventPlanId: "event", functionCode: "ops", workDate: "2026-08-03", plannedMinutes: 100, actualMinutes: 130, actualDecision: "approved", actualVerifiedAt: "2026-08-03T20:00:00Z" },
      { id: "incident", functionCode: "ops", workDate: "2026-08-03", actualMinutes: 70, actualDecision: "approved", actualVerifiedAt: "2026-08-03T20:00:00Z", reasonCode: "live_incident" },
      { id: "rework", functionCode: "ops", workDate: "2026-08-03", actualMinutes: 10, actualDecision: "approved", actualVerifiedAt: "2026-08-03T20:00:00Z", reasonCode: "rework" },
      { id: "scope-one", functionCode: "ops", workDate: "2026-08-03", actualMinutes: 10, actualDecision: "approved", actualVerifiedAt: "2026-08-03T20:00:00Z", reasonCode: "scope_change" },
      { id: "scope-two", functionCode: "ops", workDate: "2026-08-03", actualMinutes: 10, actualDecision: "approved", actualVerifiedAt: "2026-08-03T20:00:00Z", reasonCode: "scope_change" },
    ], { currentWeekStart: "2026-08-03" });
    expect(insights.map((insight: { key: string }) => insight.key)).toEqual(expect.arrayContaining([
      "event_actual_exceeds_plan",
      "emergency_ot_share",
      "recurring_rework_or_scope_change",
    ]));
  });

  it("does not count a fifth-old week toward the four-week rework insight", () => {
    const domain = loadDomain();
    const insights = domain.buildRootCauseInsights([
      { id: "excluded", functionCode: "ops", workDate: "2026-07-06", actualMinutes: 10, actualDecision: "approved", actualVerifiedAt: "2026-07-06T20:00:00Z", reasonCode: "rework" },
      { id: "included-one", functionCode: "ops", workDate: "2026-07-20", actualMinutes: 10, actualDecision: "approved", actualVerifiedAt: "2026-07-20T20:00:00Z", reasonCode: "rework" },
      { id: "included-two", functionCode: "ops", workDate: "2026-08-03", actualMinutes: 10, actualDecision: "approved", actualVerifiedAt: "2026-08-03T20:00:00Z", reasonCode: "scope_change" },
    ], { currentWeekStart: "2026-08-03" });
    expect(insights.map((insight: { key: string }) => insight.key)).not.toContain("recurring_rework_or_scope_change");
  });

  it("does not turn unverified operational records into root-cause signals", () => {
    const domain = loadDomain();
    const insights = domain.buildRootCauseInsights([
      { id: "unverified-event", eventPlanId: "event", functionCode: "esport", workDate: "2026-08-03", plannedMinutes: 60, actualMinutes: 600, reasonCode: "live_incident" },
      { id: "unverified-rework-one", functionCode: "esport", workDate: "2026-08-03", actualMinutes: 1200, reasonCode: "rework" },
      { id: "unverified-rework-two", functionCode: "esport", workDate: "2026-07-27", actualMinutes: 1200, reasonCode: "scope_change" },
    ], { currentWeekStart: "2026-08-03" });

    expect(insights).toEqual([]);
  });

  it("flags a Function that drops to zero and includes the historical comparison rows", () => {
    const domain = loadDomain();
    const insights = domain.buildRootCauseInsights([
      { id: "mkt-1", functionCode: "mkt", workDate: "2026-07-06", actualMinutes: 120, actualDecision: "approved" },
      { id: "mkt-2", functionCode: "mkt", workDate: "2026-07-13", actualMinutes: 120, actualDecision: "approved" },
      { id: "mkt-3", functionCode: "mkt", workDate: "2026-07-20", actualMinutes: 120, actualDecision: "approved" },
      { id: "mkt-4", functionCode: "mkt", workDate: "2026-07-27", actualMinutes: 120, actualDecision: "approved" },
    ], { currentWeekStart: "2026-08-03" });

    expect(insights).toContainEqual(expect.objectContaining({
      key: "function_confirmed_ot_change",
      functionCode: "mkt",
      recordIds: ["mkt-1", "mkt-2", "mkt-3", "mkt-4"],
    }));
  });

  it("does not turn two cross-week rework requests into four request-count signals", () => {
    const domain = loadDomain();
    const rows = [
      { id: "request-a:2026-07-27", requestId: "request-a", functionCode: "ops", weekStart: "2026-07-27", actualMinutes: 60, actualDecision: "approved", reasonCode: "rework" },
      { id: "request-a:2026-08-03", requestId: "request-a", functionCode: "ops", weekStart: "2026-08-03", actualMinutes: 60, actualDecision: "approved", reasonCode: "rework" },
      { id: "request-b:2026-07-27", requestId: "request-b", functionCode: "ops", weekStart: "2026-07-27", actualMinutes: 60, actualDecision: "approved", reasonCode: "scope_change" },
      { id: "request-b:2026-08-03", requestId: "request-b", functionCode: "ops", weekStart: "2026-08-03", actualMinutes: 60, actualDecision: "approved", reasonCode: "scope_change" },
    ];

    expect(domain.buildRootCauseInsights(rows, { currentWeekStart: "2026-08-03" }).map((insight: { key: string }) => insight.key)).not.toContain("recurring_rework_or_scope_change");

    const withThirdRequest = rows.concat({ id: "request-c:2026-08-03", requestId: "request-c", functionCode: "ops", weekStart: "2026-08-03", actualMinutes: 30, actualDecision: "approved", reasonCode: "rework" });
    const recurring = domain.buildRootCauseInsights(withThirdRequest, { currentWeekStart: "2026-08-03" }).find((insight: { key: string }) => insight.key === "recurring_rework_or_scope_change");
    expect(recurring?.recordIds).toEqual(["request-a", "request-b", "request-c"]);
  });

  it("counts only weeks with positive actual minutes", () => {
    const domain = loadDomain();
    expect(domain.countWeeksWithActualMinutes([
      { requestId: "planned-only", weekStart: "2026-07-27", plannedMinutes: 120, actualMinutes: 0 },
      { requestId: "worked-a", weekStart: "2026-08-03", plannedMinutes: 60, actualMinutes: 30 },
      { requestId: "worked-b", weekStart: "2026-08-03", plannedMinutes: 60, actualMinutes: 30 },
    ])).toBe(1);
  });

  it("builds five oldest-to-newest Bangkok week buckets and assigns cross-week Actual minutes to the right week", () => {
    const domain = loadDomain();
    const weeklyTrend = domain.buildOtWeeklyTrend([
      { requestId: "cross-week", weekStart: "2026-07-27", actualMinutes: 90, actualDecision: "approved" },
      { requestId: "cross-week", weekStart: "2026-08-03", actualMinutes: 120, actualDecision: "approved" },
      { requestId: "ready", weekStart: "2026-08-10", actualMinutes: 60, status: "hr_ready" },
      { requestId: "planned-only", weekStart: "2026-07-13", plannedMinutes: 300, actualMinutes: 0 },
      { requestId: "rejected", weekStart: "2026-07-20", actualMinutes: 480, actualDecision: "rejected", status: "rejected" },
      { requestId: "revision", weekStart: "2026-07-20", actualMinutes: 480, actualDecision: "revision_required", status: "revision_required" },
      { requestId: "cancelled", weekStart: "2026-07-20", actualMinutes: 480, actualDecision: "approved", status: "cancelled" },
      { requestId: "invalid-export", weekStart: "2026-07-20", actualMinutes: 480, actualDecision: "rejected", status: "exported" },
    ], ["2026-08-10", "2026-07-13", "2026-08-03", "2026-07-20", "2026-07-27"]);

    expect(weeklyTrend).toEqual([
      { weekStart: "2026-07-13", actualMinutes: 0 },
      { weekStart: "2026-07-20", actualMinutes: 0 },
      { weekStart: "2026-07-27", actualMinutes: 90 },
      { weekStart: "2026-08-03", actualMinutes: 120 },
      { weekStart: "2026-08-10", actualMinutes: 60 },
    ]);
  });

  it("aggregates approved Actual workload by Function and operational assignment without employee output", () => {
    const domain = loadDomain();
    const rows = [
      { requestId: "cross-week", employeeUserId: "employee-a", employeeDisplayName: "Alice", functionCode: "ops", title: "Launch support", weekStart: "2026-07-27", actualMinutes: 60, actualDecision: "approved" },
      { requestId: "cross-week", employeeUserId: "employee-a", employeeDisplayName: "Alice", functionCode: "ops", title: "Launch support", weekStart: "2026-08-03", actualMinutes: 60, actualDecision: "approved" },
      { requestId: "event-one", employeeUserId: "employee-b", employeeDisplayName: "Bob", functionCode: "ops", eventPlanId: "event-1", title: "Championship final", weekStart: "2026-08-03", actualMinutes: 60, actualDecision: "approved" },
      { requestId: "event-two", employeeUserId: "employee-c", employeeDisplayName: "Carol", functionCode: "ops", eventPlanId: "event-1", title: "Championship final", weekStart: "2026-08-03", actualMinutes: 60, status: "hr_ready" },
      { requestId: "localization", employeeUserId: "employee-d", employeeDisplayName: "Dana", functionCode: "mkt", title: "Localization", weekStart: "2026-08-10", actualMinutes: 60, status: "exported" },
      { requestId: "excluded", employeeUserId: "employee-e", employeeDisplayName: "Eve", functionCode: "mkt", title: "Rejected launch", weekStart: "2026-08-10", actualMinutes: 900, actualDecision: "rejected", status: "exported" },
    ];

    const concentration = domain.buildOtWorkloadConcentration(rows);

    expect(concentration).toEqual({
      byFunction: [
        { key: "ops", actualMinutes: 240, share: 0.8 },
        { key: "mkt", actualMinutes: 60, share: 0.2 },
      ],
      byAssignment: [
        { key: "assignment:launch support", label: "Launch support", actualMinutes: 120, share: 0.4 },
        { key: "event:event-1", label: "Championship final", actualMinutes: 120, share: 0.4 },
        { key: "assignment:localization", label: "Localization", actualMinutes: 60, share: 0.2 },
      ],
    });
    expect(JSON.stringify(concentration)).not.toMatch(/employee-[a-e]|"(?:Alice|Bob|Carol|Dana|Eve)"/i);
  });

  it("sorts concentration deterministically and returns empty zero-total shares", () => {
    const domain = loadDomain();
    const rows = [
      { requestId: "zeta", functionCode: "ops", title: "Zeta", actualMinutes: 60, actualDecision: "approved" },
      { requestId: "alpha", functionCode: "mkt", title: "Alpha", actualMinutes: 60, actualDecision: "approved" },
    ];

    const expected = {
      byFunction: [
        { key: "mkt", actualMinutes: 60, share: 0.5 },
        { key: "ops", actualMinutes: 60, share: 0.5 },
      ],
      byAssignment: [
        { key: "assignment:alpha", label: "Alpha", actualMinutes: 60, share: 0.5 },
        { key: "assignment:zeta", label: "Zeta", actualMinutes: 60, share: 0.5 },
      ],
    };

    expect(domain.buildOtWorkloadConcentration(rows)).toEqual(expected);
    expect(domain.buildOtWorkloadConcentration(rows.slice().reverse())).toEqual(expected);
    expect(domain.buildOtWorkloadConcentration([
      { requestId: "zero", functionCode: "ops", title: "Zero", actualMinutes: 0, actualDecision: "approved" },
      { requestId: "unverified", functionCode: "mkt", title: "Unverified", actualMinutes: 300 },
    ])).toEqual({ byFunction: [], byAssignment: [] });
  });
});
