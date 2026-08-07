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

  function deriveRequestStatus(request, reference) {
    const has = (camel, snake) => Boolean(valueOf(request, camel, snake));
    const decision = valueOf(request, "planDecision", "plan_decision");
    const requestType = valueOf(request, "requestType", "request_type");
    if (!["planned", "consented", "actual"].includes(requestType)) throw new Error("Request type must be planned, consented, or actual.");
    const limitState = getRequestLimitState(request, requestType);
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

  function isConfirmed(record) {
    const status = valueOf(record, "status", "status");
    return Boolean(valueOf(record, "actualVerifiedAt", "actual_verified_at") || valueOf(record, "actualVerified", "actual_verified") || ["hr_ready", "exported"].includes(status));
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
    return records.map(record => valueOf(record, "id", "id")).filter(Boolean);
  }

  function buildRootCauseInsights(records, options) {
    const confirmed = (Array.isArray(records) ? records : []).filter(isConfirmed);
    if (!confirmed.length) return [];
    const requestedWeek = options && options.currentWeekStart;
    const currentWeekStart = requestedWeek || confirmed.map(recordWeek).sort().slice(-1)[0];
    const previousWeeks = [1, 2, 3, 4].map(weeks => addDays(currentWeekStart, -7 * weeks));
    const fourWeekStart = previousWeeks[3];
    const current = confirmed.filter(record => recordWeek(record) === currentWeekStart);
    const inLastFiveWeeks = confirmed.filter(record => recordWeek(record) >= fourWeekStart && recordWeek(record) <= currentWeekStart);
    const withinFourWeeks = confirmed.filter(record => recordWeek(record) >= previousWeeks[2] && recordWeek(record) <= currentWeekStart);
    const insights = [];

    const functions = Array.from(new Set(current.map(record => valueOf(record, "functionCode", "function_code") || "unassigned")));
    functions.forEach(functionCode => {
      const functionCurrent = current.filter(record => (valueOf(record, "functionCode", "function_code") || "unassigned") === functionCode);
      const currentMinutes = functionCurrent.reduce((total, record) => total + recordMinutes(record, "actualMinutes", "actual_minutes"), 0);
      const priorMinutes = inLastFiveWeeks
        .filter(record => previousWeeks.includes(recordWeek(record)) && (valueOf(record, "functionCode", "function_code") || "unassigned") === functionCode)
        .reduce((total, record) => total + recordMinutes(record, "actualMinutes", "actual_minutes"), 0);
      const priorAverage = priorMinutes / 4;
      if (priorAverage > 0 && Math.abs(currentMinutes - priorAverage) / priorAverage >= 0.25) {
        insights.push({ key: "function_confirmed_ot_change", functionCode, weekStart: currentWeekStart, recordIds: collectIds(functionCurrent), message: "Confirmed OT changed materially from the prior four-week average." });
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
      const recurring = withinFourWeeks.filter(record => (valueOf(record, "functionCode", "function_code") || "unassigned") === functionCode && ["rework", "scope_change"].includes(valueOf(record, "reasonCode", "reason_code")));
      if (recurring.length >= 3) {
        insights.push({ key: "recurring_rework_or_scope_change", functionCode, weekStart: currentWeekStart, recordIds: collectIds(recurring), message: "Rework or scope change appeared in at least three confirmed requests within four weeks." });
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
    deriveRequestStatus,
    canViewRequest,
    buildRootCauseInsights,
  });
});
