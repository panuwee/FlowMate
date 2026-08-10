(function (root, factory) {
  const api = factory();
  if (root) root.FlowMateOtRequestDomain = api;
})(typeof window !== "undefined" ? window : null, function () {
  const TIMEZONE = "Asia/Bangkok";
  const LIMIT_MINUTES = 36 * 60;
  const ADVISORY_MINUTES = 24 * 60;
  const HIGH_RISK_MINUTES = 30 * 60;
  const REASON_OPTIONS = Object.freeze([
    { key: "offline_event", label: "Offline Event / Tournament Operation" },
    { key: "campaign_launch", label: "Campaign or Patch Launch" },
    { key: "live_incident", label: "Live Incident / Emergency" },
    { key: "capacity", label: "Workload Exceeds Capacity" },
    { key: "external_schedule", label: "Partner or External Schedule" },
    { key: "rework", label: "Rework / Quality Issue" },
    { key: "scope_change", label: "Scope Changed After Work Started" },
    { key: "travel_offsite", label: "Travel / Off-site Operation" },
    { key: "other", label: "Other" },
  ]);
  const MINUTE = 60 * 1000;
  const DAY = 24 * 60 * MINUTE;

  function valueOf(record, camel, snake) {
    return record && (record[camel] !== undefined ? record[camel] : record[snake]);
  }

  function asMinutes(value) {
    const minutes = Number(value || 0);
    if (!Number.isInteger(minutes) || minutes < 0) throw new Error("Minutes must be a non-negative whole number.");
    return minutes;
  }

  function parseTime(time) {
    const parts = String(time).split(":");
    const hours = Number(parts[0]);
    const minutes = Number(parts[1]);
    if (parts.length !== 2 || !Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      throw new Error("Time must use HH:MM.");
    }
    return hours * 60 + minutes;
  }

  function parseDateKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
    if (!match) throw new Error("Date must use YYYY-MM-DD.");
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
      throw new Error("Date must use YYYY-MM-DD.");
    }
    return date;
  }

  function formatDateKey(date) {
    return date.toISOString().slice(0, 10);
  }

  function getWeekStartKey(dateKey) {
    const date = parseDateKey(dateKey);
    const mondayOffset = date.getUTCDay() === 0 ? -6 : 1 - date.getUTCDay();
    date.setUTCDate(date.getUTCDate() + mondayOffset);
    return formatDateKey(date);
  }

  function calculateDurationMinutes(input) {
    const start = parseTime(input.startTime);
    const end = parseTime(input.endTime);
    let gross = end - start;
    if (gross <= 0) gross += 24 * 60;
    const net = gross - asMinutes(input.breakMinutes);
    if (net <= 0) throw new Error("OT duration must be greater than zero.");
    return net;
  }

  function getLimitState(totalMinutes) {
    const total = asMinutes(totalMinutes);
    const key = total > LIMIT_MINUTES ? "blocked"
      : total === LIMIT_MINUTES ? "limit_reached"
      : total >= HIGH_RISK_MINUTES ? "high_risk"
      : total >= ADVISORY_MINUTES ? "advisory"
      : "neutral";
    return { key, totalMinutes: total, remainingMinutes: Math.max(0, LIMIT_MINUTES - total) };
  }

  function startPersonalWeekLoad(weekStart) {
    return {
      status: "loading",
      weekStart,
      dashboard: null,
      requests: [],
      message: "",
    };
  }

  function collectSegmentMinutes(segments) {
    return (Array.isArray(segments) ? segments : []).reduce((totals, segment) => {
      const weekStart = segment && segment.weekStart;
      if (!weekStart) return totals;
      totals[weekStart] = (totals[weekStart] || 0) + asMinutes(segment.minutes);
      return totals;
    }, {});
  }

  function buildWeekProjections(segments, summariesByWeek, options) {
    const config = options || {};
    const totalField = config.totalField || "plannedMinutes";
    const addedByWeek = collectSegmentMinutes(segments);
    const excludedByWeek = collectSegmentMinutes(config.excludedSegments);
    const summaries = summariesByWeek || {};

    return Object.keys(addedByWeek).sort().map(weekStart => {
      const summary = summaries[weekStart] || {};
      const currentMinutes = Math.max(0, asMinutes(summary[totalField]) - (excludedByWeek[weekStart] || 0));
      const addedMinutes = addedByWeek[weekStart];
      const projectedMinutes = currentMinutes + addedMinutes;
      return {
        weekStart,
        currentMinutes,
        addedMinutes,
        projectedMinutes,
        remainingMinutes: Math.max(0, LIMIT_MINUTES - projectedMinutes),
        overLimit: projectedMinutes > LIMIT_MINUTES,
      };
    });
  }

  function resetIntentAfterEdit(intent, createKey) {
    if (!intent || !intent.attempted) return intent;
    return { key: createKey(), attempted: false };
  }

  function isSubmissionLocked(status) {
    return status === "submitting";
  }

  function dateTimeMs(dateKey, time) {
    const date = parseDateKey(dateKey);
    return date.getTime() + parseTime(time) * MINUTE;
  }

  function splitMinutesByWeek(input) {
    const startDate = input.startDate;
    const endDate = input.endDate || startDate;
    const start = dateTimeMs(startDate, input.startTime);
    let end = dateTimeMs(endDate, input.endTime);
    if (end <= start && endDate === startDate) end += DAY;
    if (end <= start) throw new Error("End date and time must follow start date and time.");

    const breakMinutes = asMinutes(input.breakMinutes);
    const startWeek = getWeekStartKey(startDate);
    const endWeek = getWeekStartKey(formatDateKey(new Date(end - 1)));
    if (startWeek === endWeek) {
      const minutes = (end - start) / MINUTE - breakMinutes;
      if (minutes <= 0) throw new Error("OT duration must be greater than zero.");
      return [{ weekStart: startWeek, minutes }];
    }

    const startWeekDate = parseDateKey(startWeek);
    const boundary = startWeekDate.getTime() + 7 * DAY;
    if (end <= boundary || end > boundary + 7 * DAY) throw new Error("OT occurrence may cross only one workweek boundary.");
    if (input.breakMinutesBeforeBoundary === undefined || input.breakMinutesAfterBoundary === undefined) {
      throw new Error("Break allocation is required across a workweek boundary.");
    }
    const beforeBreak = asMinutes(input.breakMinutesBeforeBoundary);
    const afterBreak = asMinutes(input.breakMinutesAfterBoundary);
    if (beforeBreak + afterBreak !== breakMinutes) throw new Error("Break allocation must equal breakMinutes.");

    const beforeMinutes = (boundary - start) / MINUTE - beforeBreak;
    const afterMinutes = (end - boundary) / MINUTE - afterBreak;
    if (beforeMinutes <= 0 || afterMinutes <= 0) throw new Error("OT duration must be greater than zero.");
    return [
      { weekStart: startWeek, minutes: beforeMinutes },
      { weekStart: endWeek, minutes: afterMinutes },
    ];
  }

  function getRequestLimitState(request, requestType) {
    const prefix = requestType;
    const snakePrefix = requestType;
    const candidates = [
      ["weeklyTotalMinutes", "weekly_total_minutes"],
      [`${prefix}WeeklyMinutes`, `${snakePrefix}_weekly_minutes`],
      [`${prefix}WeekTotalMinutes`, `${snakePrefix}_week_total_minutes`],
      [`${prefix}Minutes`, `${snakePrefix}_minutes`],
    ];
    for (let index = 0; index < candidates.length; index += 1) {
      const minutes = valueOf(request, candidates[index][0], candidates[index][1]);
      if (minutes !== undefined && minutes !== null) return getLimitState(minutes);
    }
    return null;
  }

  function getReferenceTimestamp(reference) {
    const now = reference && typeof reference === "object" ? reference.now : reference;
    if (now === undefined || now === null) return null;
    const timestamp = new Date(now).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  function hasLimitPolicyFacts(request) {
    return [
      ["weeklyTotalMinutes", "weekly_total_minutes"],
      ["plannedWeeklyMinutes", "planned_weekly_minutes"],
      ["consentedWeeklyMinutes", "consented_weekly_minutes"],
      ["actualWeeklyMinutes", "actual_weekly_minutes"],
      ["plannedWeekTotalMinutes", "planned_week_total_minutes"],
      ["consentedWeekTotalMinutes", "consented_week_total_minutes"],
      ["actualWeekTotalMinutes", "actual_week_total_minutes"],
      ["plannedMinutes", "planned_minutes"],
      ["consentedMinutes", "consented_minutes"],
      ["actualMinutes", "actual_minutes"],
    ].some(fields => {
      const minutes = valueOf(request, fields[0], fields[1]);
      return minutes !== undefined && minutes !== null;
    });
  }

  function deriveRequestStatus(request, reference) {
    const has = (camel, snake) => Boolean(valueOf(request, camel, snake));
    const decision = valueOf(request, "planDecision", "plan_decision");
    const requestType = valueOf(request, "requestType", "request_type");
    const validRequestType = ["planned", "consented", "actual"].includes(requestType);
    if (!validRequestType && hasLimitPolicyFacts(request)) throw new Error("Request type must be planned, consented, or actual.");
    const limitState = validRequestType ? getRequestLimitState(request, requestType) : null;
    const complianceReviewed = has("complianceReviewedAt", "compliance_reviewed_at") || has("complianceOutcome", "compliance_outcome");
    if (has("cancelledAt", "cancelled_at")) return "cancelled";
    if (requestType === "actual" && limitState && limitState.key === "blocked" && !complianceReviewed) return "compliance_review_required";
    if (["planned", "consented"].includes(requestType) && limitState && limitState.key === "blocked") return "blocked";
    if (has("complianceRequired", "compliance_required") && !complianceReviewed) return "compliance_review_required";
    if (has("exportedAt", "exported_at")) return "exported";
    if (has("hrReadyAt", "hr_ready_at")) return "hr_ready";
    if (has("actualSubmittedAt", "actual_submitted_at")) return "pending_actual_verification";
    if (has("rejectedAt", "rejected_at") || decision === "rejected") return "rejected";
    if (has("revisionRequiredAt", "revision_required_at") || decision === "revision_required") return "revision_required";
    if (has("approvedAt", "approved_at") || decision === "approved") {
      const plannedEndAt = valueOf(request, "plannedEndAt", "planned_end_at");
      const plannedEndTimestamp = plannedEndAt ? new Date(plannedEndAt).getTime() : null;
      const referenceTimestamp = getReferenceTimestamp(reference);
      if (Number.isFinite(plannedEndTimestamp) && referenceTimestamp !== null && plannedEndTimestamp <= referenceTimestamp) return "actual_confirmation_required";
      return "approved";
    }
    if (valueOf(request, "isEventAssignment", "is_event_assignment") && !has("consentAt", "consent_at")) return "awaiting_consent";
    if (has("submittedAt", "submitted_at") || has("consentAt", "consent_at")) return "pending_approval";
    return "draft";
  }

  function canViewRequest(actor, request) {
    if (!actor || !request) return false;
    const role = valueOf(actor, "roleCode", "role_code");
    if (actor.isOwner || actor.isHrAdmin || ["owner", "hr", "admin", "hr_admin"].includes(role)) return true;
    const userId = valueOf(actor, "userId", "user_id") || actor.id;
    return userId === valueOf(request, "employeeUserId", "employee_user_id") || userId === valueOf(request, "approverUserId", "approver_user_id");
  }

  function canActOnAssignedRequest(actor, request) {
    if (!actor || !request || !actor.isEligibleApprover) return false;
    const actorId = valueOf(actor, "userId", "user_id") || actor.id;
    return Boolean(actorId) && actorId === valueOf(request, "approverUserId", "approver_user_id");
  }

  function getRevisionWorkflow(request) {
    if (!request || valueOf(request, "status", "status") !== "revision_required") return null;
    const actualSubmittedAt = valueOf(request, "actualSubmittedAt", "actual_submitted_at");
    const actualDecision = valueOf(request, "actualDecision", "actual_decision");
    const planDecision = valueOf(request, "planDecision", "plan_decision");
    if (actualSubmittedAt && actualDecision === "revision_required") return "actual";
    if (!actualSubmittedAt && planDecision === "revision_required") return "plan";
    return null;
  }

  function canRequestActualAmendment(actor, request) {
    if (!actor || !request || (!actor.isOwner && !(actor.isHrAdmin && actor.isEligibleApprover))) return false;
    if (valueOf(request, "status", "status") === "exported"
      || valueOf(request, "exportedAt", "exported_at")
      || valueOf(request, "exportBatchId", "export_batch_id")) return false;
    return Boolean(valueOf(request, "actualSubmittedAt", "actual_submitted_at"))
      && valueOf(request, "actualDecision", "actual_decision") === "approved"
      && Boolean(valueOf(request, "actualVerifiedByUserId", "actual_verified_by_user_id"))
      && Boolean(valueOf(request, "actualVerifiedAt", "actual_verified_at"));
  }

  function isConfirmedActual(record) {
    const status = valueOf(record, "status", "status");
    const decision = valueOf(record, "actualDecision", "actual_decision");
    if (["rejected", "revision_required", "cancelled"].includes(status)) return false;
    if (["rejected", "revision_required"].includes(decision)) return false;
    return decision === "approved" || ["hr_ready", "exported"].includes(status);
  }

  function getActualVerificationEligibility(request, weeklyTotalMinutes) {
    const source = valueOf(request, "source", "source");
    const consentAccepted = source !== "event_plan" || (
      valueOf(request, "employeeConsent", "employee_consent") === "accepted"
      && Boolean(valueOf(request, "employeeConsentedAt", "employee_consented_at"))
    );
    const planned = Number(valueOf(request, "occurrencePlannedMinutes", "planned_minutes") ?? valueOf(request, "plannedMinutes", "planned_minutes") ?? 0);
    const actual = Number(valueOf(request, "occurrenceActualMinutes", "actual_minutes") ?? valueOf(request, "actualMinutes", "actual_minutes") ?? 0);
    const varianceNeedsReason = Math.abs(actual - planned) > 30;
    const varianceHasReason = Boolean(String(valueOf(request, "actualVarianceReason", "actual_variance_reason") || "").trim());
    const status = valueOf(request, "status", "status");
    const actualDecision = valueOf(request, "actualDecision", "actual_decision");
    const complianceRequired = Boolean(valueOf(request, "complianceRequired", "compliance_required")) || status === "compliance_review_required";
    const awaitingHrCompliance = complianceRequired && actualDecision === "approved";
    const actualSubmitted = Boolean(valueOf(request, "actualSubmittedAt", "actual_submitted_at"))
      && Array.isArray(valueOf(request, "actualWeekSegments", "actual_week_segments"));
    const weeklyTotal = Number(weeklyTotalMinutes || 0);
    const canVerifyIndividually = actualSubmitted
      && consentAccepted
      && (!varianceNeedsReason || varianceHasReason)
      && !awaitingHrCompliance
      && ["pending_actual_verification", "compliance_review_required"].includes(status);
    return {
      consentAccepted,
      varianceNeedsReason,
      varianceHasReason,
      complianceRequired,
      awaitingHrCompliance,
      actualSubmitted,
      weeklyTotal,
      canVerifyIndividually,
      canBulkVerify: canVerifyIndividually && !complianceRequired && weeklyTotal <= LIMIT_MINUTES && status === "pending_actual_verification",
    };
  }

  function formatSignedHours(minutes) {
    const total = Math.round(Number(minutes || 0));
    if (!Number.isFinite(total)) throw new Error("Minutes must be numeric.");
    if (total === 0) return "0h";
    const absolute = Math.abs(total);
    const hours = Math.floor(absolute / 60);
    const remainder = absolute % 60;
    return `${total > 0 ? "+" : "-"}${hours}h${remainder ? ` ${remainder}m` : ""}`;
  }

  function recordWeek(record) {
    return valueOf(record, "weekStart", "week_start") || getWeekStartKey(valueOf(record, "workDate", "work_date") || valueOf(record, "startDate", "start_date"));
  }

  function recordMinutes(record, camel, snake) {
    return asMinutes(valueOf(record, camel, snake));
  }

  function addDays(dateKey, days) {
    const date = parseDateKey(dateKey);
    date.setUTCDate(date.getUTCDate() + days);
    return formatDateKey(date);
  }

  function collectIds(records) {
    return Array.from(new Set(records.map(record => valueOf(record, "requestId", "request_id") || valueOf(record, "id", "id")).filter(Boolean)));
  }

  function countWeeksWithActualMinutes(records) {
    return new Set((Array.isArray(records) ? records : [])
      .filter(record => recordMinutes(record, "actualMinutes", "actual_minutes") > 0)
      .map(recordWeek)).size;
  }

  function buildRootCauseInsights(records, options) {
    const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmedActual);
    if (!confirmed.length) return [];
    const requestedWeek = options && options.currentWeekStart;
    const currentWeekStart = requestedWeek || confirmed.map(recordWeek).sort().slice(-1)[0];
    const previousWeeks = [1, 2, 3, 4].map(weeks => addDays(currentWeekStart, -7 * weeks));
    const fourWeekStart = previousWeeks[3];
    const current = confirmed.filter(record => recordWeek(record) === currentWeekStart);
    const inLastFiveWeeks = confirmed.filter(record => recordWeek(record) >= fourWeekStart && recordWeek(record) <= currentWeekStart);
    const withinFourWeeks = confirmed.filter(record => recordWeek(record) >= previousWeeks[2] && recordWeek(record) <= currentWeekStart);
    const insights = [];

    const functions = Array.from(new Set(inLastFiveWeeks.map(record => valueOf(record, "functionCode", "function_code") || "unassigned")));
    functions.forEach(functionCode => {
      const functionCurrent = current.filter(record => (valueOf(record, "functionCode", "function_code") || "unassigned") === functionCode);
      const currentMinutes = functionCurrent.reduce((total, record) => total + recordMinutes(record, "actualMinutes", "actual_minutes"), 0);
      const comparisonRecords = inLastFiveWeeks
        .filter(record => (recordWeek(record) === currentWeekStart || previousWeeks.includes(recordWeek(record))) && (valueOf(record, "functionCode", "function_code") || "unassigned") === functionCode);
      const priorMinutes = comparisonRecords
        .filter(record => previousWeeks.includes(recordWeek(record)))
        .reduce((total, record) => total + recordMinutes(record, "actualMinutes", "actual_minutes"), 0);
      const priorAverage = priorMinutes / 4;
      if (priorAverage > 0 && Math.abs(currentMinutes - priorAverage) / priorAverage >= 0.25) {
        insights.push({ key: "function_confirmed_ot_change", functionCode, weekStart: currentWeekStart, recordIds: collectIds(comparisonRecords), message: "Confirmed OT changed materially from the prior four-week average." });
      }
    });

    const employeeWeeks = {};
    inLastFiveWeeks.forEach(record => {
      const employee = valueOf(record, "employeeUserId", "employee_user_id");
      if (!employee) return;
      const key = `${employee}:${recordWeek(record)}`;
      if (!employeeWeeks[key]) employeeWeeks[key] = [];
      employeeWeeks[key].push(record);
    });
    Object.keys(employeeWeeks).forEach(key => {
      const separator = key.lastIndexOf(":");
      const employee = key.slice(0, separator);
      const weekStart = key.slice(separator + 1);
      const previousWeek = addDays(weekStart, -7);
      const thisWeek = employeeWeeks[key];
      const priorWeek = employeeWeeks[`${employee}:${previousWeek}`];
      const thisMinutes = thisWeek.reduce((total, record) => total + recordMinutes(record, "actualMinutes", "actual_minutes"), 0);
      const priorMinutes = priorWeek ? priorWeek.reduce((total, record) => total + recordMinutes(record, "actualMinutes", "actual_minutes"), 0) : 0;
      if (thisMinutes > ADVISORY_MINUTES && priorMinutes > ADVISORY_MINUTES) {
        insights.push({ key: "recurring_employee_high_ot", weekStart, recordIds: collectIds((priorWeek || []).concat(thisWeek)), message: "A team member exceeded the advisory OT threshold for two consecutive weeks." });
      }
    });

    const eventRecords = {};
    inLastFiveWeeks.forEach(record => {
      const eventPlanId = valueOf(record, "eventPlanId", "event_plan_id");
      if (!eventPlanId) return;
      if (!eventRecords[eventPlanId]) eventRecords[eventPlanId] = [];
      eventRecords[eventPlanId].push(record);
    });
    Object.keys(eventRecords).forEach(eventPlanId => {
      const event = eventRecords[eventPlanId];
      const planned = event.reduce((total, record) => total + recordMinutes(record, "plannedMinutes", "planned_minutes"), 0);
      const actual = event.reduce((total, record) => total + recordMinutes(record, "actualMinutes", "actual_minutes"), 0);
      if (planned > 0 && actual >= planned * 1.2) {
        insights.push({ key: "event_actual_exceeds_plan", eventPlanId, recordIds: collectIds(event), message: "Event actual OT exceeded planned OT by at least 20%." });
      }
    });

    functions.forEach(functionCode => {
      const functionCurrent = current.filter(record => (valueOf(record, "functionCode", "function_code") || "unassigned") === functionCode);
      const total = functionCurrent.reduce((sum, record) => sum + recordMinutes(record, "actualMinutes", "actual_minutes"), 0);
      const emergency = functionCurrent.filter(record => valueOf(record, "reasonCode", "reason_code") === "live_incident");
      const emergencyMinutes = emergency.reduce((sum, record) => sum + recordMinutes(record, "actualMinutes", "actual_minutes"), 0);
      if (total > 0 && emergencyMinutes / total >= 0.3) {
        insights.push({ key: "emergency_ot_share", functionCode, weekStart: currentWeekStart, recordIds: collectIds(emergency), message: "Emergency OT represents at least 30% of confirmed OT." });
      }
    });

    functions.forEach(functionCode => {
      const recurringRows = withinFourWeeks.filter(record => (valueOf(record, "functionCode", "function_code") || "unassigned") === functionCode && ["rework", "scope_change"].includes(valueOf(record, "reasonCode", "reason_code")));
      const recurringRequestIds = collectIds(recurringRows);
      if (recurringRequestIds.length >= 3) {
        insights.push({ key: "recurring_rework_or_scope_change", functionCode, weekStart: currentWeekStart, recordIds: recurringRequestIds, message: "Rework or scope change appeared in at least three confirmed requests within four weeks." });
      }
    });

    return insights;
  }

  return Object.freeze({
    TIMEZONE,
    LIMIT_MINUTES,
    REASON_OPTIONS,
    calculateDurationMinutes,
    getWeekStartKey,
    splitMinutesByWeek,
    getLimitState,
    startPersonalWeekLoad,
    buildWeekProjections,
    resetIntentAfterEdit,
    isSubmissionLocked,
    deriveRequestStatus,
    canViewRequest,
    canActOnAssignedRequest,
    getRevisionWorkflow,
    canRequestActualAmendment,
    isConfirmedActual,
    getActualVerificationEligibility,
    formatSignedHours,
    countWeeksWithActualMinutes,
    buildRootCauseInsights,
  });
});
