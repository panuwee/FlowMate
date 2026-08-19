/* AUTO-GENERATED from screens-ot.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
const OT_REQUEST_VIEW_ROUTES = {
  overview: "ot-request",
  "my-requests": "ot-request/my-requests",
  "action-queue": "ot-request/action-queue",
  "team-schedule": "ot-request/team-schedule",
  "monthly-report": "ot-request/monthly-report",
  "root-causes": "ot-request/root-causes",
  insights: "ot-request/insights",
  compliance: "ot-request/compliance",
  audit: "ot-request/audit",
  access: "ot-request/access",
  export: "ot-request/export"
};
function getOtRequestHashView() {
  const route = String(window.location.hash || "").replace(/^#/, "").split("/");
  if (route[0] !== "ot-request" || !route[1]) return null;
  if (route[1] === "manager") return "action-queue";
  if (route[1] === "root-causes" || route[1] === "owner") return "insights";
  return OT_REQUEST_VIEW_ROUTES[route[1]] ? route[1] : null;
}
function canOpenOtRequestView(view, access) {
  if (!access) return false;
  if (view === "overview" || view === "my-requests") return Boolean(access.canRequestOt);
  if (view === "access" || view === "insights" || view === "export") return Boolean(access.isOwner);
  if (view === "compliance" || view === "audit") return false;
  return Boolean(access.canManage);
}
function getOtRequestFallbackView(access) {
  if (!access) return null;
  if (access.isOwner) return "insights";
  if (access.canRequestOt) return "overview";
  if (access.canManage) return "action-queue";
  return null;
}
const OT_LIMIT_MINUTES = 36 * 60;
const OT_CONSENT_STATEMENT_VERSION = "2026-08-07";
const OT_DETAIL_REQUIRED_REASONS = new Set(["other", "live_incident", "rework", "scope_change"]);
const OT_FUNCTION_APPROVER_EMAILS = Object.freeze({
  ops: "nithidol.k@garena.com",
  mkt: "weerayut@garena.com",
  gdve: "weerayut@garena.com",
  esport: "napol.a@garena.com"
});
function otValue(record, camel, snake) {
  return record && (record[camel] !== undefined ? record[camel] : record[snake]);
}
function useOtCurrentTimestamp() {
  const [timestamp, setTimestamp] = useStateApp(() => Date.now());
  useEffectApp(() => {
    if (typeof window.setInterval !== "function") return undefined;
    const interval = window.setInterval(() => setTimestamp(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  return timestamp;
}
function getBangkokDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function addOtDays(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function getCurrentOtWeekStart() {
  return window.FlowMateOtRequestDomain.getWeekStartKey(getBangkokDateKey());
}
function getCurrentOtMonthKey() {
  return getBangkokDateKey().slice(0, 7);
}
function getOtMonthWeekStarts(monthKey) {
  const [year, month] = String(monthKey || "").split("-").map(Number);
  if (!year || !month) return [];
  const firstDay = `${monthKey}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const firstWeek = window.FlowMateOtRequestDomain.getWeekStartKey(firstDay);
  const lastWeek = window.FlowMateOtRequestDomain.getWeekStartKey(lastDay);
  const weeks = [];
  for (let week = firstWeek; week <= lastWeek; week = addOtDays(week, 7)) weeks.push(week);
  return weeks;
}
function formatOtHours(minutes) {
  const safeMinutes = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(safeMinutes / 60);
  const remainder = safeMinutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
function formatOtDate(dateKey) {
  if (!dateKey) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${dateKey}T00:00:00+07:00`));
}
function getOtBangkokParts(value) {
  if (!value) return {
    date: "",
    time: ""
  };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    date: `${fields.year}-${fields.month}-${fields.day}`,
    time: `${fields.hour}:${fields.minute}`
  };
}
function toOtBangkokIso(dateKey, time) {
  return `${dateKey}T${time}:00+07:00`;
}
function getOtStatusLabel(status) {
  return String(status || "draft").split("_").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
function getOtRequestStatus(request) {
  const storedStatus = otValue(request, "status", "status");
  if (storedStatus) {
    if (storedStatus === "approved" && !otValue(request, "actualSubmittedAt", "actual_submitted_at")) {
      const plannedEndAt = otValue(request, "plannedEndAt", "planned_end_at");
      if (plannedEndAt && new Date(plannedEndAt).getTime() <= Date.now()) return "actual_confirmation_required";
    }
    return storedStatus;
  }
  try {
    return window.FlowMateOtRequestDomain.deriveRequestStatus(request, {
      now: new Date().toISOString()
    });
  } catch (error) {
    return "draft";
  }
}
function getOtAnnouncementProps(kind) {
  return kind === "error" || kind === "critical" ? {
    role: "alert"
  } : {
    role: "status",
    "aria-live": "polite"
  };
}
function getOtDescribedActionProps(descriptionId, isDescribed) {
  return isDescribed ? {
    "aria-describedby": descriptionId
  } : {};
}
function OtWarning({
  id,
  kind = "info",
  title,
  message,
  testId
}) {
  if (!message) return null;
  const heading = title || (kind === "error" || kind === "critical" ? "Action needed" : "Update");
  return React.createElement("div", {
    id: id,
    className: `ot-warning ${kind === "error" || kind === "critical" ? "ot-warning--error" : ""}`,
    ...getOtAnnouncementProps(kind),
    "data-testid": testId
  }, React.createElement("span", {
    "aria-hidden": "true"
  }, kind === "error" || kind === "critical" ? "⚠" : "ⓘ"), React.createElement("span", null, React.createElement("strong", null, heading, ": "), message));
}
function OtLimitProgress({
  totalMinutes
}) {
  const state = window.FlowMateOtRequestDomain.getLimitState(Math.max(0, Number(totalMinutes || 0)));
  const percent = Math.min(100, Math.round(state.totalMinutes / OT_LIMIT_MINUTES * 100));
  return React.createElement("div", {
    className: `ot-limit ot-limit--${state.key}`
  }, React.createElement("div", {
    className: "ot-limit__track",
    role: "progressbar",
    "aria-label": "Weekly OT used",
    "aria-valuemin": "0",
    "aria-valuemax": "2160",
    "aria-valuenow": Math.min(2160, state.totalMinutes)
  }, React.createElement("span", {
    style: {
      width: `${percent}%`
    }
  })), state.key !== "neutral" && React.createElement("small", null, state.key === "blocked" ? "Above the 36h limit" : state.key === "limit_reached" ? "36h limit reached" : state.key === "high_risk" ? "High risk — review remaining hours" : "Approaching weekly limit"));
}
function getOtWeekSegments(request, prefix) {
  const segments = otValue(request, `${prefix}WeekSegments`, `${prefix}_week_segments`);
  if (Array.isArray(segments) && segments.length) return segments;
  const startAt = otValue(request, `${prefix}StartAt`, `${prefix}_start_at`) || otValue(request, "plannedStartAt", "planned_start_at");
  const minutes = Number(otValue(request, `${prefix}Minutes`, `${prefix}_minutes`) || 0);
  const start = getOtBangkokParts(startAt);
  return start.date && minutes > 0 ? [{
    weekStart: window.FlowMateOtRequestDomain.getWeekStartKey(start.date),
    minutes
  }] : [];
}
function useOtWeekSummaries(segments) {
  const weekKey = Array.from(new Set((Array.isArray(segments) ? segments : []).map(segment => segment.weekStart).filter(Boolean))).sort().join("|");
  const [retryKey, setRetryKey] = useStateApp(0);
  const [state, setState] = useStateApp({
    weekKey,
    status: weekKey ? "loading" : "ready",
    summaries: {},
    message: ""
  });
  useEffectApp(() => {
    const weekStarts = weekKey ? weekKey.split("|") : [];
    if (!weekStarts.length) {
      setState({
        weekKey,
        status: "ready",
        summaries: {},
        message: ""
      });
      return undefined;
    }
    let alive = true;
    setState({
      weekKey,
      status: "loading",
      summaries: {},
      message: ""
    });
    Promise.all(weekStarts.map(weekStart => window.loadMyOtDashboard(weekStart))).then(dashboards => {
      if (!alive) return;
      const summaries = {};
      weekStarts.forEach((weekStart, index) => {
        summaries[weekStart] = dashboards[index] || {};
      });
      setState({
        weekKey,
        status: "ready",
        summaries,
        message: ""
      });
    }).catch(error => {
      if (alive) setState({
        weekKey,
        status: "error",
        summaries: {},
        message: error.message || "Weekly OT totals could not be loaded."
      });
    });
    return () => {
      alive = false;
    };
  }, [weekKey, retryKey]);
  const currentState = state.weekKey === weekKey ? state : {
    weekKey,
    status: weekKey ? "loading" : "ready",
    summaries: {},
    message: ""
  };
  return {
    ...currentState,
    retry: () => setRetryKey(value => value + 1)
  };
}
function OtWeekProjection({
  title,
  rows
}) {
  if (!rows.length) return null;
  return React.createElement("section", {
    "aria-label": title
  }, rows.map(row => React.createElement("div", {
    key: row.weekStart
  }, React.createElement("small", {
    className: "muted"
  }, "Week of ", formatOtDate(row.weekStart)), React.createElement("section", {
    className: "ot-preview"
  }, React.createElement("div", null, React.createElement("span", null, "Current"), React.createElement("strong", null, formatOtHours(row.currentMinutes))), React.createElement("div", null, React.createElement("span", null, "Added"), React.createElement("strong", null, formatOtHours(row.addedMinutes))), React.createElement("div", null, React.createElement("span", null, "Projected"), React.createElement("strong", null, formatOtHours(row.projectedMinutes))), React.createElement("div", null, React.createElement("span", null, "Remaining"), React.createElement("strong", null, formatOtHours(row.remainingMinutes)))), React.createElement(OtLimitProgress, {
    totalMinutes: row.projectedMinutes
  }))));
}
function OtEmployeeDashboard({
  access,
  listOnly = false
}) {
  const [weekStart, setWeekStart] = useStateApp(getCurrentOtWeekStart);
  const [loadState, setLoadState] = useStateApp(() => window.FlowMateOtRequestDomain.startPersonalWeekLoad(getCurrentOtWeekStart()));
  const [refreshKey, setRefreshKey] = useStateApp(0);
  const [action, setAction] = useStateApp(null);
  const [actionFeedback, setActionFeedback] = useStateApp(null);
  const loadErrorRef = useRefApp(null);
  useEffectApp(() => {
    let alive = true;
    setLoadState(current => current.weekStart === weekStart && current.dashboard ? {
      ...current,
      status: "loading",
      message: ""
    } : window.FlowMateOtRequestDomain.startPersonalWeekLoad(weekStart));
    Promise.all([window.loadMyOtDashboard(weekStart), window.loadMyOtRequests(weekStart)]).then(([dashboard, requests]) => {
      if (!alive) return;
      setLoadState({
        status: "ready",
        weekStart,
        dashboard: dashboard || {},
        requests: Array.isArray(requests) ? requests : [],
        message: ""
      });
    }).catch(error => {
      if (alive) setLoadState(current => ({
        ...current,
        status: "error",
        message: error.message || "Your OT could not be loaded."
      }));
    });
    return () => {
      alive = false;
    };
  }, [weekStart, refreshKey]);
  useEffectApp(() => {
    if (loadState.status === "error" && loadErrorRef.current) loadErrorRef.current.focus();
  }, [loadState.status]);
  function refreshAfterAction(feedback = null) {
    setAction(null);
    setActionFeedback(feedback);
    setRefreshKey(value => value + 1);
  }
  function selectWeek(value) {
    const nextWeekStart = window.FlowMateOtRequestDomain.getWeekStartKey(value);
    if (nextWeekStart === weekStart) return;
    setAction(null);
    setLoadState(window.FlowMateOtRequestDomain.startPersonalWeekLoad(nextWeekStart));
    setWeekStart(nextWeekStart);
  }
  if (loadState.status === "loading" && !loadState.dashboard) {
    return React.createElement("div", {
      className: "ot-state",
      role: "status"
    }, "Loading your OT week…");
  }
  if (loadState.status === "error" && !loadState.dashboard) {
    return React.createElement("div", {
      className: "ot-state",
      role: "alert",
      tabIndex: "-1",
      ref: loadErrorRef
    }, React.createElement("strong", null, "Your OT could not be loaded."), React.createElement("span", null, loadState.message), React.createElement("button", {
      type: "button",
      className: "btn btn--secondary",
      onClick: () => setRefreshKey(value => value + 1)
    }, "Retry"));
  }
  const dashboard = loadState.dashboard || {};
  const requests = loadState.requests;
  const countedMinutes = Number(dashboard.countedMinutes || 0);
  const plannedMinutes = Number(dashboard.plannedMinutes || 0);
  const confirmedMinutes = Number(dashboard.actualMinutes || 0);
  const summary = {
    countedMinutes,
    plannedMinutes,
    confirmedMinutes,
    remainingMinutes: Math.max(0, OT_LIMIT_MINUTES - countedMinutes)
  };
  const consentRequests = requests.filter(request => getOtRequestStatus(request) === "awaiting_consent" && !otValue(request, "employeeConsent", "employee_consent"));
  const planRevisionRequests = requests.filter(request => window.FlowMateOtRequestDomain.getRevisionWorkflow(request) === "plan");
  const actualRequests = requests.filter(request => getOtRequestStatus(request) === "actual_confirmation_required" || window.FlowMateOtRequestDomain.getRevisionWorkflow(request) === "actual");
  return React.createElement("div", {
    className: "ot-employee"
  }, React.createElement("div", {
    className: "ot-toolbar"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Week starting"), React.createElement("input", {
    className: "input",
    type: "date",
    value: weekStart,
    onChange: event => selectWeek(event.target.value)
  })), React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    onClick: () => setAction({
      type: "new",
      request: null
    })
  }, "New OT request")), actionFeedback?.submissionMessage && React.createElement(OtWarning, {
    kind: "info",
    message: actionFeedback.submissionMessage
  }), actionFeedback?.deliveryMessage && React.createElement(OtWarning, {
    kind: "info",
    message: actionFeedback.deliveryMessage
  }), loadState.status === "error" && React.createElement("div", {
    ref: loadErrorRef,
    tabIndex: "-1"
  }, React.createElement(OtWarning, {
    kind: "error",
    title: "Refresh failed",
    message: `${loadState.message} Your current form is preserved; retry when ready.`
  }), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: () => setRefreshKey(value => value + 1)
  }, "Retry refresh")), !listOnly && React.createElement(React.Fragment, null, React.createElement("section", {
    className: "ot-metric-grid ot-metric-grid--employee",
    "aria-label": "Your weekly overtime"
  }, React.createElement("section", {
    className: "ot-metric",
    "data-testid": "ot-week-total"
  }, React.createElement("span", null, "Week total"), React.createElement("strong", null, formatOtHours(summary.countedMinutes), " / 36h"), React.createElement(OtLimitProgress, {
    totalMinutes: summary.countedMinutes
  })), React.createElement("section", {
    className: "ot-metric"
  }, React.createElement("span", null, "Planned"), React.createElement("strong", null, formatOtHours(summary.plannedMinutes))), React.createElement("section", {
    className: "ot-metric"
  }, React.createElement("span", null, "Confirmed actual"), React.createElement("strong", null, formatOtHours(summary.confirmedMinutes))), React.createElement("section", {
    className: "ot-metric"
  }, React.createElement("span", null, "Remaining"), React.createElement("strong", null, formatOtHours(summary.remainingMinutes))), React.createElement("section", {
    className: "ot-metric"
  }, React.createElement("span", null, "Actions"), React.createElement("strong", null, consentRequests.length + planRevisionRequests.length + actualRequests.length), React.createElement("small", null, consentRequests.length, " consent · ", planRevisionRequests.length, " plan · ", actualRequests.length, " actual"))), React.createElement("section", {
    className: "ot-actions",
    "aria-label": "Your required OT actions"
  }, consentRequests.map(request => React.createElement("button", {
    key: request.id,
    type: "button",
    className: "ot-action-card",
    "data-testid": "ot-consent-required",
    onClick: () => setAction({
      type: "consent",
      request
    })
  }, React.createElement("strong", null, "Consent required"), React.createElement("span", null, request.title), React.createElement("small", null, "Review the occurrence and weekly total"))), planRevisionRequests.map(request => React.createElement("button", {
    key: request.id,
    type: "button",
    className: "ot-action-card",
    "data-testid": "ot-plan-revision-required",
    onClick: () => setAction({
      type: "revision",
      request
    })
  }, React.createElement("strong", null, "Edit and resubmit request"), React.createElement("span", null, request.title), React.createElement("small", null, "Correct the plan before it returns to the approval queue"))), actualRequests.map(request => React.createElement("button", {
    key: request.id,
    type: "button",
    className: "ot-action-card",
    "data-testid": "ot-confirm-actual",
    onClick: () => setAction({
      type: "actual",
      request
    })
  }, React.createElement("strong", null, "Confirm actual time"), React.createElement("span", null, request.title), React.createElement("small", null, "Record the hours you actually worked"))), !consentRequests.length && !planRevisionRequests.length && !actualRequests.length && React.createElement("div", {
    className: "ot-state ot-state--compact"
  }, "No OT actions are waiting for you."))), action && React.createElement("section", {
    className: "ot-workflow",
    "aria-label": "OT action"
  }, React.createElement("div", {
    className: "ot-workflow__head"
  }, React.createElement("h2", null, action.type === "new" ? "New OT request" : action.type === "revision" ? "Edit and resubmit request" : action.type === "consent" ? "Event consent" : "Confirm actual time"), React.createElement("button", {
    type: "button",
    className: "btn btn--ghost",
    onClick: () => setAction(null)
  }, "Close")), action.type === "new" && React.createElement(OtRequestForm, {
    weekStart: weekStart,
    onSuccess: refreshAfterAction
  }), action.type === "revision" && React.createElement(OtRequestForm, {
    key: action.request.id,
    mode: "revision",
    request: action.request,
    weekStart: weekStart,
    onSuccess: refreshAfterAction
  }), action.type === "consent" && React.createElement(OtConsentPanel, {
    request: action.request,
    onSuccess: refreshAfterAction
  }), action.type === "actual" && React.createElement(OtActualConfirmationForm, {
    request: action.request,
    onSuccess: refreshAfterAction
  })), React.createElement(OtMyRequestsTable, {
    requests: requests,
    onAction: (type, request) => setAction({
      type,
      request
    })
  }));
}
function getOtPlanRevisionBreakAllocation(request, segments) {
  if (!request || !Array.isArray(segments) || segments.length !== 2) {
    return {
      breakMinutesBeforeBoundary: "",
      breakMinutesAfterBoundary: ""
    };
  }
  const startAt = new Date(otValue(request, "plannedStartAt", "planned_start_at"));
  const endAt = new Date(otValue(request, "plannedEndAt", "planned_end_at"));
  const boundary = new Date(`${segments[1].weekStart}T00:00:00+07:00`);
  const firstGross = Math.floor((boundary.getTime() - startAt.getTime()) / 60000);
  const lastGross = Math.floor((endAt.getTime() - boundary.getTime()) / 60000);
  const firstBreak = firstGross - Number(segments[0].minutes || 0);
  const lastBreak = lastGross - Number(segments[1].minutes || 0);
  if (firstBreak < 0 || lastBreak < 0 || !Number.isFinite(firstBreak) || !Number.isFinite(lastBreak)) {
    return {
      breakMinutesBeforeBoundary: "",
      breakMinutesAfterBoundary: ""
    };
  }
  return {
    breakMinutesBeforeBoundary: String(firstBreak),
    breakMinutesAfterBoundary: String(lastBreak)
  };
}
function OtRequestForm({
  mode = "create",
  request = null,
  weekStart: requestedWeekStart = getCurrentOtWeekStart(),
  onSuccess
}) {
  const isRevision = mode === "revision";
  const plannedStart = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
  const plannedEnd = getOtBangkokParts(otValue(request, "plannedEndAt", "planned_end_at"));
  const existingPlannedSegments = isRevision ? getOtWeekSegments(request, "planned") : [];
  const revisionBreaks = getOtPlanRevisionBreakAllocation(request, existingPlannedSegments);
  const weekStart = isRevision && plannedStart.date ? window.FlowMateOtRequestDomain.getWeekStartKey(plannedStart.date) : requestedWeekStart;
  const today = getBangkokDateKey();
  const initialWorkDate = isRevision && plannedStart.date ? plannedStart.date : window.FlowMateOtRequestDomain.getWeekStartKey(today) === weekStart ? today : weekStart;
  const [form, setForm] = useStateApp(() => ({
    functionCode: isRevision ? String(otValue(request, "functionCode", "function_code") || "") : "",
    title: isRevision ? String(otValue(request, "title", "title") || "") : "",
    workDate: initialWorkDate,
    startTime: isRevision ? plannedStart.time : "18:00",
    endTime: isRevision ? plannedEnd.time : "20:00",
    breakMinutes: String(isRevision ? otValue(request, "plannedBreakMinutes", "planned_break_minutes") || 0 : 0),
    breakMinutesBeforeBoundary: isRevision ? revisionBreaks.breakMinutesBeforeBoundary : "",
    breakMinutesAfterBoundary: isRevision ? revisionBreaks.breakMinutesAfterBoundary : "",
    dayType: isRevision ? String(otValue(request, "dayType", "day_type") || "working_day") : "working_day",
    workLocationType: isRevision ? String(otValue(request, "workLocationType", "work_location_type") || "office") : "office",
    venue: isRevision ? String(otValue(request, "venue", "venue") || "") : "",
    reasonCode: isRevision ? String(otValue(request, "reasonCode", "reason_code") || "") : "",
    reasonDetail: isRevision ? String(otValue(request, "reasonDetail", "reason_detail") || "") : "",
    consented: false
  }));
  const [submitState, setSubmitState] = useStateApp({
    status: "idle",
    message: ""
  });
  const [intent, setIntent] = useStateApp(() => ({
    key: crypto.randomUUID(),
    attempted: false
  }));
  const errorRef = useRefApp(null);
  const summaryErrorRef = useRefApp(null);
  useEffectApp(() => {
    if (submitState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [submitState.status]);
  function update(field, value) {
    if (window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)) return;
    setForm(current => ({
      ...current,
      [field]: value
    }));
    if (intent.attempted) {
      setIntent(current => window.FlowMateOtRequestDomain.resetIntentAfterEdit(current, () => crypto.randomUUID()));
      setSubmitState({
        status: "idle",
        message: ""
      });
    }
  }
  let crossesWeek = false;
  let previewEndDate = form.workDate;
  let preview = {
    valid: false,
    minutes: 0,
    segments: [],
    endDate: form.workDate,
    crossesWeek: false,
    message: "Enter a valid schedule to preview hours."
  };
  try {
    const endDate = form.endTime <= form.startTime ? addOtDays(form.workDate, 1) : form.workDate;
    const startWeek = window.FlowMateOtRequestDomain.getWeekStartKey(form.workDate);
    const lastWorkedDate = form.endTime === "00:00" ? addOtDays(endDate, -1) : endDate;
    const endWeek = window.FlowMateOtRequestDomain.getWeekStartKey(lastWorkedDate);
    crossesWeek = startWeek !== endWeek;
    previewEndDate = endDate;
    const splitInput = {
      startDate: form.workDate,
      endDate,
      startTime: form.startTime,
      endTime: form.endTime,
      breakMinutes: Number(form.breakMinutes || 0)
    };
    if (crossesWeek) {
      splitInput.breakMinutesBeforeBoundary = form.breakMinutesBeforeBoundary === "" ? undefined : Number(form.breakMinutesBeforeBoundary);
      splitInput.breakMinutesAfterBoundary = form.breakMinutesAfterBoundary === "" ? undefined : Number(form.breakMinutesAfterBoundary);
    }
    const segments = window.FlowMateOtRequestDomain.splitMinutesByWeek(splitInput);
    preview = {
      valid: true,
      minutes: segments.reduce((sum, segment) => sum + segment.minutes, 0),
      segments,
      endDate,
      crossesWeek,
      message: ""
    };
  } catch (error) {
    preview = {
      ...preview,
      endDate: previewEndDate,
      crossesWeek,
      message: error.message
    };
  }
  const weekSummaryState = useOtWeekSummaries(preview.valid ? preview.segments : []);
  const projections = weekSummaryState.status === "ready" ? window.FlowMateOtRequestDomain.buildWeekProjections(preview.valid ? preview.segments : [], weekSummaryState.summaries, {
    excludedSegments: window.FlowMateOtRequestDomain.getCanonicalCountedSegments(request)
  }) : [];
  const overLimit = projections.some(row => row.overLimit);
  const plannedStartIsFuture = preview.valid && window.FlowMateOtRequestDomain.isBangkokPlannedStartFuture(form.workDate, form.startTime);
  const detailRequired = OT_DETAIL_REQUIRED_REASONS.has(form.reasonCode);
  const venueRequired = form.workLocationType === "venue";
  const routedApproverEmail = OT_FUNCTION_APPROVER_EMAILS[form.functionCode] || "";
  const canSubmit = preview.valid && plannedStartIsFuture && !overLimit && form.functionCode && form.title.trim() && form.reasonCode && (!detailRequired || form.reasonDetail.trim()) && (!venueRequired || form.venue.trim()) && form.consented && weekSummaryState.status === "ready" && submitState.status !== "submitting";
  useEffectApp(() => {
    if (weekSummaryState.status === "error" && summaryErrorRef.current) summaryErrorRef.current.focus();
  }, [weekSummaryState.status]);
  async function submitRequest(event) {
    event.preventDefault();
    if (preview.valid && !window.FlowMateOtRequestDomain.isBangkokPlannedStartFuture(form.workDate, form.startTime)) {
      setSubmitState({
        status: "error",
        message: "Request must be submitted before OT starts."
      });
      return;
    }
    if (!canSubmit) {
      setSubmitState({
        status: "error",
        message: overLimit ? "This request would exceed the 36-hour weekly limit." : "Complete the required fields and consent before submitting."
      });
      return;
    }
    setIntent(current => ({
      ...current,
      attempted: true
    }));
    setSubmitState({
      status: "submitting",
      message: isRevision ? "Resubmitting your corrected request…" : "Submitting your request…"
    });
    const payload = {
      functionCode: form.functionCode,
      title: form.title.trim(),
      dayType: form.dayType,
      workLocationType: form.workLocationType,
      venue: venueRequired ? form.venue.trim() : null,
      reasonCode: form.reasonCode,
      reasonDetail: form.reasonDetail.trim() || null,
      plannedStartAt: toOtBangkokIso(form.workDate, form.startTime),
      plannedEndAt: toOtBangkokIso(preview.endDate, form.endTime),
      plannedBreakMinutes: Number(form.breakMinutes || 0),
      plannedWeekSegments: preview.segments,
      consentStatementVersion: OT_CONSENT_STATEMENT_VERSION
    };
    try {
      const {
        result,
        deliveryError
      } = await window.runOtIndividualSubmission(() => isRevision ? window.resubmitOtPlan(request.id, payload, OT_CONSENT_STATEMENT_VERSION, intent.key) : window.createOtRequest(payload, intent.key));
      const submissionMessage = isRevision ? "Your corrected OT request was resubmitted for approval." : "Your OT request was submitted for approval.";
      setSubmitState({
        status: "success",
        message: submissionMessage,
        deliveryMessage: deliveryError ? "SeaTalk delivery is still pending. Your OT request was submitted successfully." : ""
      });
      setIntent({
        key: crypto.randomUUID(),
        attempted: false
      });
      const deliveryMessage = deliveryError ? "SeaTalk delivery is still pending. Your OT request was submitted successfully." : "";
      onSuccess({
        submissionMessage,
        deliveryMessage
      });
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error.message || `${isRevision ? "Your corrected OT request could not be resubmitted" : "Your OT request could not be submitted"}. Retry uses the same request key.`
      });
    }
  }
  return React.createElement("form", {
    className: "ot-form",
    onSubmit: submitRequest,
    noValidate: true
  }, React.createElement("fieldset", {
    className: "ot-form__fieldset",
    disabled: window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)
  }, isRevision && React.createElement(React.Fragment, null, React.createElement("h3", null, "Edit and resubmit request"), React.createElement("p", {
    className: "muted"
  }, "Correct the requested schedule, then renew consent before resubmitting.")), React.createElement("div", {
    className: "form-grid"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Function *"), React.createElement("select", {
    className: "select",
    value: form.functionCode,
    onChange: event => update("functionCode", event.target.value),
    required: true
  }, React.createElement("option", {
    value: ""
  }, "Select Function"), React.createElement("option", {
    value: "gdve"
  }, "GD/VE"), React.createElement("option", {
    value: "ops"
  }, "Ops"), React.createElement("option", {
    value: "mkt"
  }, "MKT"), React.createElement("option", {
    value: "esport"
  }, "eSport"))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Assignment or event *"), React.createElement("input", {
    className: "input",
    value: form.title,
    onChange: event => update("title", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Work date *"), React.createElement("input", {
    className: "input",
    type: "date",
    min: isRevision ? undefined : weekStart,
    max: isRevision ? undefined : addOtDays(weekStart, 6),
    value: form.workDate,
    onChange: event => update("workDate", event.target.value),
    required: true
  }), React.createElement("span", {
    className: "field__hint"
  }, isRevision ? "Choose any Bangkok work date; weekly totals follow the corrected schedule." : "Choose a date in the selected Bangkok week.")), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Day type *"), React.createElement("select", {
    className: "select",
    value: form.dayType,
    onChange: event => update("dayType", event.target.value)
  }, React.createElement("option", {
    value: "working_day"
  }, "Working day"), React.createElement("option", {
    value: "rest_day"
  }, "Weekly holiday"), React.createElement("option", {
    value: "public_holiday"
  }, "Public holiday"))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Planned start *"), React.createElement("input", {
    className: "input",
    type: "time",
    value: form.startTime,
    onChange: event => update("startTime", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Planned end *"), React.createElement("input", {
    className: "input",
    type: "time",
    value: form.endTime,
    onChange: event => update("endTime", event.target.value),
    required: true
  }), React.createElement("span", {
    className: "field__hint"
  }, "An end at or before start is treated as overnight.")), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Break (minutes) *"), React.createElement("input", {
    className: "input",
    type: "number",
    min: "0",
    step: "1",
    value: form.breakMinutes,
    onChange: event => update("breakMinutes", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Location *"), React.createElement("select", {
    className: "select",
    value: form.workLocationType,
    onChange: event => update("workLocationType", event.target.value)
  }, React.createElement("option", {
    value: "office"
  }, "Office"), React.createElement("option", {
    value: "remote"
  }, "Remote"), React.createElement("option", {
    value: "venue"
  }, "Venue / off-site"))), preview.crossesWeek && React.createElement(React.Fragment, null, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Break in week of ", formatOtDate(preview.segments[0]?.weekStart || weekStart), " *"), React.createElement("input", {
    className: "input",
    type: "number",
    min: "0",
    step: "1",
    value: form.breakMinutesBeforeBoundary,
    onChange: event => update("breakMinutesBeforeBoundary", event.target.value)
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Break in week of ", formatOtDate(preview.segments[1]?.weekStart || addOtDays(weekStart, 7)), " *"), React.createElement("input", {
    className: "input",
    type: "number",
    min: "0",
    step: "1",
    value: form.breakMinutesAfterBoundary,
    onChange: event => update("breakMinutesAfterBoundary", event.target.value)
  }))), venueRequired && React.createElement("label", {
    className: "field field--full"
  }, React.createElement("span", {
    className: "field__label"
  }, "Venue *"), React.createElement("input", {
    className: "input",
    value: form.venue,
    onChange: event => update("venue", event.target.value),
    placeholder: "Event or tournament venue",
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Reason *"), React.createElement("select", {
    className: "select",
    value: form.reasonCode,
    onChange: event => update("reasonCode", event.target.value),
    required: true
  }, React.createElement("option", {
    value: ""
  }, "Select reason"), window.FlowMateOtRequestDomain.REASON_OPTIONS.map(reason => React.createElement("option", {
    key: reason.key,
    value: reason.key
  }, reason.label)))), routedApproverEmail && React.createElement("div", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Routed Team Lead"), React.createElement("strong", null, routedApproverEmail), React.createElement("span", {
    className: "field__hint"
  }, "This is assigned automatically from your Function.")), React.createElement("label", {
    className: "field field--full"
  }, React.createElement("span", {
    className: "field__label"
  }, "Reason detail ", detailRequired ? "*" : "(optional)"), React.createElement("textarea", {
    className: "textarea",
    value: form.reasonDetail,
    onChange: event => update("reasonDetail", event.target.value),
    required: detailRequired,
    placeholder: detailRequired ? "Explain what happened and why OT is required" : "Add only information needed for approval"
  }))), weekSummaryState.status === "loading" && preview.valid && React.createElement("div", {
    className: "ot-state ot-state--compact",
    role: "status"
  }, "Loading every affected week's OT total…"), weekSummaryState.status === "error" && React.createElement("div", {
    ref: summaryErrorRef,
    tabIndex: "-1"
  }, React.createElement(OtWarning, {
    kind: "error",
    title: "Weekly totals unavailable",
    message: `${weekSummaryState.message} Submission remains blocked until the totals are refreshed.`
  }), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: weekSummaryState.retry
  }, "Retry totals")), weekSummaryState.status === "ready" && React.createElement(OtWeekProjection, {
    title: "Planned totals by affected week",
    rows: projections
  }), !preview.valid && React.createElement(OtWarning, {
    kind: "error",
    title: "Schedule needs attention",
    message: preview.message
  }), preview.valid && !plannedStartIsFuture && React.createElement(OtWarning, {
    kind: "error",
    title: "Start time needs attention",
    message: "Request must be submitted before OT starts."
  }), weekSummaryState.status === "ready" && overLimit && React.createElement(OtWarning, {
    kind: "critical",
    title: "Request blocked",
    message: `At least one affected week would exceed the 36-hour limit: ${projections.filter(row => row.overLimit).map(row => formatOtDate(row.weekStart)).join(", ")}.`
  }), React.createElement("label", {
    className: "ot-consent"
  }, React.createElement("input", {
    type: "checkbox",
    checked: form.consented,
    onChange: event => update("consented", event.target.checked)
  }), React.createElement("span", null, "I consent to this overtime occurrence and confirm the planned date and time shown above.")), React.createElement("small", {
    className: "muted"
  }, "Consent statement version ", OT_CONSENT_STATEMENT_VERSION)), submitState.message && React.createElement("div", {
    ref: errorRef,
    tabIndex: submitState.status === "error" ? "-1" : undefined
  }, React.createElement(OtWarning, {
    id: "ot-request-submit-feedback",
    kind: submitState.status === "error" ? "error" : "info",
    message: submitState.message
  })), submitState.deliveryMessage && React.createElement(OtWarning, {
    id: "ot-request-delivery-feedback",
    kind: "info",
    message: submitState.deliveryMessage
  }), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn--primary",
    ...getOtDescribedActionProps("ot-request-submit-feedback", Boolean(submitState.message)),
    disabled: !canSubmit
  }, submitState.status === "submitting" ? isRevision ? "Resubmitting…" : "Submitting…" : isRevision ? "Resubmit corrected request" : "Submit OT request")));
}
function OtConsentPanel({
  request,
  onSuccess
}) {
  const [accepted, setAccepted] = useStateApp(false);
  const [submitState, setSubmitState] = useStateApp({
    status: "idle",
    message: ""
  });
  const [intent, setIntent] = useStateApp(() => ({
    choice: null,
    key: crypto.randomUUID()
  }));
  const errorRef = useRefApp(null);
  const summaryErrorRef = useRefApp(null);
  const currentTimestamp = useOtCurrentTimestamp();
  const plannedMinutes = Number(otValue(request, "plannedMinutes", "planned_minutes") || 0);
  const plannedSegments = getOtWeekSegments(request, "planned");
  const weekSummaryState = useOtWeekSummaries(plannedSegments);
  const projections = weekSummaryState.status === "ready" ? window.FlowMateOtRequestDomain.buildWeekProjections(plannedSegments, weekSummaryState.summaries, {
    excludedSegments: window.FlowMateOtRequestDomain.getCanonicalCountedSegments(request)
  }) : [];
  const overLimit = projections.some(row => row.overLimit);
  const start = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
  const end = getOtBangkokParts(otValue(request, "plannedEndAt", "planned_end_at"));
  const plannedStartIsFuture = window.FlowMateOtRequestDomain.isPlannedStartFuture(otValue(request, "plannedStartAt", "planned_start_at"), currentTimestamp);
  useEffectApp(() => {
    if (submitState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [submitState.status]);
  useEffectApp(() => {
    if (weekSummaryState.status === "error" && summaryErrorRef.current) summaryErrorRef.current.focus();
  }, [weekSummaryState.status]);
  async function recordConsent(choice) {
    if (choice && !window.FlowMateOtRequestDomain.isPlannedStartFuture(otValue(request, "plannedStartAt", "planned_start_at"), Date.now())) {
      setSubmitState({
        status: "error",
        message: "Accepting is no longer available because the planned start is not strictly future in Bangkok time. Declining remains available."
      });
      return;
    }
    if (choice && (!accepted || overLimit || weekSummaryState.status !== "ready")) {
      setSubmitState({
        status: "error",
        message: overLimit ? "Consent is blocked because an affected week exceeds 36 hours." : weekSummaryState.status !== "ready" ? "Weekly OT totals must load before accepting this occurrence." : "Check the consent box before accepting this occurrence."
      });
      return;
    }
    const key = intent.choice === choice ? intent.key : crypto.randomUUID();
    setIntent({
      choice,
      key
    });
    setSubmitState({
      status: "submitting",
      message: choice ? "Recording your consent…" : "Recording your choice…"
    });
    try {
      await window.recordOtConsent(request.id, choice, OT_CONSENT_STATEMENT_VERSION, key);
      setSubmitState({
        status: "success",
        message: choice ? "Consent recorded for this occurrence." : "You declined this occurrence. The assignment remains in the audit history."
      });
      setIntent({
        choice: null,
        key: crypto.randomUUID()
      });
      onSuccess();
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error.message || "Consent could not be recorded. Retry will use the same action key."
      });
    }
  }
  return React.createElement("div", {
    className: "ot-form",
    "data-testid": "ot-consent-required"
  }, React.createElement("div", {
    className: "ot-detail-grid"
  }, React.createElement("div", null, React.createElement("span", null, "Assigned event"), React.createElement("strong", null, request.title || "—")), React.createElement("div", null, React.createElement("span", null, "Function"), React.createElement("strong", null, String(otValue(request, "functionCode", "function_code") || "—").toUpperCase())), React.createElement("div", null, React.createElement("span", null, "Venue"), React.createElement("strong", null, otValue(request, "venue", "venue") || getOtStatusLabel(otValue(request, "workLocationType", "work_location_type")))), React.createElement("div", null, React.createElement("span", null, "Planned schedule"), React.createElement("strong", null, formatOtDate(start.date), " ", start.time, " – ", start.date === end.date ? "" : `${formatOtDate(end.date)} `, end.time)), React.createElement("div", null, React.createElement("span", null, "Break"), React.createElement("strong", null, otValue(request, "plannedBreakMinutes", "planned_break_minutes") || 0, " min")), React.createElement("div", null, React.createElement("span", null, "Planned hours"), React.createElement("strong", null, formatOtHours(plannedMinutes)))), weekSummaryState.status === "loading" && React.createElement("div", {
    className: "ot-state ot-state--compact",
    role: "status"
  }, "Loading every affected week's OT total…"), weekSummaryState.status === "error" && React.createElement("div", {
    ref: summaryErrorRef,
    tabIndex: "-1"
  }, React.createElement(OtWarning, {
    kind: "error",
    title: "Weekly totals unavailable",
    message: `${weekSummaryState.message} Accepting is blocked until the totals are refreshed; declining remains available.`
  }), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: weekSummaryState.retry
  }, "Retry totals")), weekSummaryState.status === "ready" && React.createElement(OtWeekProjection, {
    title: "Consent totals by affected week",
    rows: projections
  }), weekSummaryState.status === "ready" && overLimit && React.createElement(OtWarning, {
    kind: "critical",
    title: "Consent blocked",
    message: `At least one affected week would exceed 36 hours: ${projections.filter(row => row.overLimit).map(row => formatOtDate(row.weekStart)).join(", ")}. Contact the Event Lead because the server will not accept this planned occurrence.`
  }), !plannedStartIsFuture && React.createElement(OtWarning, {
    kind: "critical",
    title: "Consent window closed",
    message: "Accepting is no longer available because the planned start is not strictly future in Bangkok time. Declining remains available."
  }), React.createElement("label", {
    className: "ot-consent"
  }, React.createElement("input", {
    type: "checkbox",
    checked: accepted,
    onChange: event => setAccepted(event.target.checked)
  }), React.createElement("span", null, "I consent to this overtime occurrence and confirm the planned date and time shown above.")), React.createElement("small", {
    className: "muted"
  }, "Consent statement version ", OT_CONSENT_STATEMENT_VERSION), submitState.message && React.createElement("div", {
    ref: errorRef,
    tabIndex: submitState.status === "error" ? "-1" : undefined
  }, React.createElement(OtWarning, {
    id: "ot-consent-submit-feedback",
    kind: submitState.status === "error" ? "error" : "info",
    message: submitState.message
  })), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    ...getOtDescribedActionProps("ot-consent-submit-feedback", Boolean(submitState.message)),
    disabled: !accepted || overLimit || weekSummaryState.status !== "ready" || !plannedStartIsFuture || submitState.status === "submitting",
    onClick: () => recordConsent(true)
  }, "Accept occurrence"), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    ...getOtDescribedActionProps("ot-consent-submit-feedback", Boolean(submitState.message)),
    disabled: submitState.status === "submitting",
    onClick: () => recordConsent(false)
  }, "Decline occurrence")));
}
function OtActualConfirmationForm({
  request,
  onSuccess
}) {
  const plannedStart = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
  const plannedEnd = getOtBangkokParts(otValue(request, "plannedEndAt", "planned_end_at"));
  const plannedMinutes = Number(otValue(request, "plannedMinutes", "planned_minutes") || 0);
  const [form, setForm] = useStateApp({
    startDate: plannedStart.date,
    startTime: plannedStart.time,
    endDate: plannedEnd.date,
    endTime: plannedEnd.time,
    breakMinutes: String(otValue(request, "plannedBreakMinutes", "planned_break_minutes") || 0),
    breakMinutesBeforeBoundary: "",
    breakMinutesAfterBoundary: "",
    varianceReason: ""
  });
  const [submitState, setSubmitState] = useStateApp({
    status: "idle",
    message: "",
    result: null
  });
  const [intent, setIntent] = useStateApp(() => ({
    key: crypto.randomUUID(),
    attempted: false
  }));
  const errorRef = useRefApp(null);
  const summaryErrorRef = useRefApp(null);
  useEffectApp(() => {
    if (submitState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [submitState.status]);
  function update(field, value) {
    if (window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)) return;
    setForm(current => ({
      ...current,
      [field]: value
    }));
    if (intent.attempted) {
      setIntent(current => window.FlowMateOtRequestDomain.resetIntentAfterEdit(current, () => crypto.randomUUID()));
      setSubmitState({
        status: "idle",
        message: "",
        result: null
      });
    }
  }
  let crossesWeek = false;
  let preview = {
    valid: false,
    minutes: 0,
    segments: [],
    crossesWeek: false,
    message: "Enter the actual schedule."
  };
  try {
    const startWeek = window.FlowMateOtRequestDomain.getWeekStartKey(form.startDate);
    const lastWorkedDate = form.endTime === "00:00" ? addOtDays(form.endDate, -1) : form.endDate;
    const endWeek = window.FlowMateOtRequestDomain.getWeekStartKey(lastWorkedDate);
    crossesWeek = startWeek !== endWeek;
    const splitInput = {
      startDate: form.startDate,
      endDate: form.endDate,
      startTime: form.startTime,
      endTime: form.endTime,
      breakMinutes: Number(form.breakMinutes || 0)
    };
    if (crossesWeek) {
      splitInput.breakMinutesBeforeBoundary = form.breakMinutesBeforeBoundary === "" ? undefined : Number(form.breakMinutesBeforeBoundary);
      splitInput.breakMinutesAfterBoundary = form.breakMinutesAfterBoundary === "" ? undefined : Number(form.breakMinutesAfterBoundary);
    }
    const segments = window.FlowMateOtRequestDomain.splitMinutesByWeek(splitInput);
    preview = {
      valid: true,
      minutes: segments.reduce((sum, segment) => sum + segment.minutes, 0),
      segments,
      crossesWeek,
      message: ""
    };
  } catch (error) {
    preview = {
      ...preview,
      crossesWeek,
      message: error.message
    };
  }
  const actualMinutes = preview.minutes;
  const varianceRequired = preview.valid && Math.abs(actualMinutes - plannedMinutes) > 30;
  const weekSummaryState = useOtWeekSummaries(preview.valid ? preview.segments : []);
  const projections = weekSummaryState.status === "ready" ? window.FlowMateOtRequestDomain.buildWeekProjections(preview.valid ? preview.segments : [], weekSummaryState.summaries, {
    excludedSegments: window.FlowMateOtRequestDomain.getCanonicalCountedSegments(request)
  }) : [];
  const complianceLikely = projections.some(row => row.overLimit);
  const canSubmit = preview.valid && (!varianceRequired || form.varianceReason.trim()) && submitState.status !== "submitting" && submitState.status !== "success";
  useEffectApp(() => {
    if (weekSummaryState.status === "error" && summaryErrorRef.current) summaryErrorRef.current.focus();
  }, [weekSummaryState.status]);
  async function submitActual(event) {
    event.preventDefault();
    if (!canSubmit) {
      setSubmitState({
        status: "error",
        message: varianceRequired ? "Explain the difference from the plan before submitting." : preview.message,
        result: null
      });
      return;
    }
    setIntent(current => ({
      ...current,
      attempted: true
    }));
    setSubmitState({
      status: "submitting",
      message: "Saving the hours you actually worked…",
      result: null
    });
    const payload = {
      actualStartAt: toOtBangkokIso(form.startDate, form.startTime),
      actualEndAt: toOtBangkokIso(form.endDate, form.endTime),
      actualBreakMinutes: Number(form.breakMinutes || 0),
      actualWeekSegments: preview.segments,
      varianceReason: form.varianceReason.trim() || null
    };
    try {
      const result = await window.submitOtActual(request.id, payload, intent.key);
      const status = otValue(result, "status", "status");
      setIntent({
        key: crypto.randomUUID(),
        attempted: false
      });
      if (status === "compliance_review_required") {
        setSubmitState({
          status: "success",
          message: "Actual hours saved truthfully. Your Team Lead will verify this record before it is ready for export.",
          result
        });
      } else {
        setSubmitState({
          status: "success",
          message: "Actual hours saved and sent to your approver for verification.",
          result
        });
      }
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error.message || "Actual hours could not be saved. Retry uses the same action key.",
        result: null
      });
    }
  }
  if (submitState.status === "success") {
    const savedStatus = otValue(submitState.result, "status", "status");
    return React.createElement("div", {
      className: "ot-form",
      "data-testid": "ot-confirm-actual"
    }, React.createElement(OtWarning, {
      kind: savedStatus === "compliance_review_required" ? "critical" : "info",
      title: "Actual time saved",
      message: submitState.message
    }), React.createElement("p", null, React.createElement("strong", null, "Saved status:"), " ", getOtStatusLabel(savedStatus)), React.createElement("button", {
      type: "button",
      className: "btn btn--primary",
      onClick: onSuccess
    }, "Back to dashboard"));
  }
  return React.createElement("form", {
    className: "ot-form",
    "data-testid": "ot-confirm-actual",
    onSubmit: submitActual,
    noValidate: true
  }, React.createElement("fieldset", {
    className: "ot-form__fieldset",
    disabled: window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)
  }, React.createElement("p", {
    className: "muted"
  }, "The planned schedule is prefilled. Change it to the time actually worked. Offline and eSport venue work does not require GPS or clock data."), React.createElement("div", {
    className: "form-grid"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Actual start date *"), React.createElement("input", {
    className: "input",
    type: "date",
    value: form.startDate,
    onChange: event => update("startDate", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Actual start time *"), React.createElement("input", {
    className: "input",
    type: "time",
    value: form.startTime,
    onChange: event => update("startTime", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Actual end date *"), React.createElement("input", {
    className: "input",
    type: "date",
    value: form.endDate,
    onChange: event => update("endDate", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Actual end time *"), React.createElement("input", {
    className: "input",
    type: "time",
    value: form.endTime,
    onChange: event => update("endTime", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Actual total break (minutes) *"), React.createElement("input", {
    className: "input",
    type: "number",
    min: "0",
    step: "1",
    value: form.breakMinutes,
    onChange: event => update("breakMinutes", event.target.value),
    required: true
  })), preview.crossesWeek && React.createElement(React.Fragment, null, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Break in week of ", formatOtDate(preview.segments[0]?.weekStart || window.FlowMateOtRequestDomain.getWeekStartKey(form.startDate)), " *"), React.createElement("input", {
    className: "input",
    type: "number",
    min: "0",
    step: "1",
    value: form.breakMinutesBeforeBoundary,
    onChange: event => update("breakMinutesBeforeBoundary", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Break in week of ", formatOtDate(preview.segments[1]?.weekStart || window.FlowMateOtRequestDomain.getWeekStartKey(form.endDate)), " *"), React.createElement("input", {
    className: "input",
    type: "number",
    min: "0",
    step: "1",
    value: form.breakMinutesAfterBoundary,
    onChange: event => update("breakMinutesAfterBoundary", event.target.value),
    required: true
  }))), varianceRequired && React.createElement("label", {
    className: "field field--full"
  }, React.createElement("span", {
    className: "field__label"
  }, "Why actual time differs from plan *"), React.createElement("textarea", {
    className: "textarea",
    value: form.varianceReason,
    onChange: event => update("varianceReason", event.target.value),
    placeholder: "Explain the variance of more than 30 minutes",
    required: true
  }))), React.createElement("section", {
    className: "ot-preview",
    "aria-label": "Actual occurrence total"
  }, React.createElement("div", null, React.createElement("span", null, "Planned"), React.createElement("strong", null, formatOtHours(plannedMinutes))), React.createElement("div", null, React.createElement("span", null, "Truthful actual"), React.createElement("strong", null, preview.valid ? formatOtHours(actualMinutes) : "—"))), weekSummaryState.status === "loading" && preview.valid && React.createElement("div", {
    className: "ot-state ot-state--compact",
    role: "status"
  }, "Compliance preview is loading. You can still submit now; the server will validate and save the truthful time."), weekSummaryState.status === "error" && React.createElement("div", {
    ref: summaryErrorRef,
    tabIndex: "-1"
  }, React.createElement(OtWarning, {
    kind: "error",
    title: "Compliance preview unavailable",
    message: `${weekSummaryState.message} You can still submit the truthful actual time; the server will validate and save the truthful time.`
  }), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: weekSummaryState.retry
  }, "Retry preview")), weekSummaryState.status === "ready" && React.createElement(OtWeekProjection, {
    title: "Actual totals by affected week",
    rows: projections
  }), !preview.valid && React.createElement(OtWarning, {
    kind: "error",
    title: "Actual schedule needs attention",
    message: preview.message
  }), weekSummaryState.status === "ready" && complianceLikely && React.createElement(OtWarning, {
    kind: "critical",
    title: "Weekly limit note required",
    message: "Submit the truthful actual hours. Your Team Lead must add a note when verifying an over-limit record."
  })), submitState.message && React.createElement("div", {
    ref: errorRef,
    tabIndex: submitState.status === "error" ? "-1" : undefined
  }, React.createElement(OtWarning, {
    id: "ot-actual-submit-feedback",
    kind: submitState.status === "error" ? "error" : "info",
    message: submitState.message
  })), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn--primary",
    ...getOtDescribedActionProps("ot-actual-submit-feedback", Boolean(submitState.message)),
    disabled: !canSubmit
  }, submitState.status === "submitting" ? "Saving…" : "Submit truthful actual time")));
}
function OtMyRequestsTable({
  requests,
  onAction
}) {
  if (!requests.length) {
    return React.createElement("section", {
      className: "ot-list"
    }, React.createElement("div", {
      className: "ot-section-head"
    }, React.createElement("h2", null, "My OT requests")), React.createElement("div", {
      className: "ot-state"
    }, "No OT requests in this week."));
  }
  return React.createElement("section", {
    className: "ot-list"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("h2", null, "My OT requests"), React.createElement("span", null, requests.length, " occurrence", requests.length === 1 ? "" : "s")), React.createElement("div", {
    className: "ot-table-wrap"
  }, React.createElement("table", {
    className: "tbl ot-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Date"), React.createElement("th", null, "Assignment / event"), React.createElement("th", null, "Planned"), React.createElement("th", null, "Actual"), React.createElement("th", null, "Status"), React.createElement("th", null, "Next action"))), React.createElement("tbody", null, requests.map(request => {
    const status = getOtRequestStatus(request);
    const start = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
    const canConsent = status === "awaiting_consent" && !otValue(request, "employeeConsent", "employee_consent");
    const revisionWorkflow = window.FlowMateOtRequestDomain.getRevisionWorkflow(request);
    const canRevise = revisionWorkflow === "plan";
    const canConfirm = status === "actual_confirmation_required" || revisionWorkflow === "actual";
    return React.createElement("tr", {
      key: request.id
    }, React.createElement("td", null, formatOtDate(start.date)), React.createElement("td", null, React.createElement("strong", null, request.title), React.createElement("small", null, String(otValue(request, "functionCode", "function_code") || "").toUpperCase())), React.createElement("td", null, formatOtHours(otValue(request, "plannedMinutes", "planned_minutes"))), React.createElement("td", null, otValue(request, "actualMinutes", "actual_minutes") ? formatOtHours(otValue(request, "actualMinutes", "actual_minutes")) : "—"), React.createElement("td", null, React.createElement("span", {
      className: `ot-status ot-status--${status}`
    }, getOtStatusLabel(status))), React.createElement("td", null, canConsent ? React.createElement("button", {
      type: "button",
      className: "btn btn--sm btn--secondary",
      onClick: () => onAction("consent", request)
    }, "Review consent") : canRevise ? React.createElement("button", {
      type: "button",
      className: "btn btn--sm btn--secondary",
      onClick: () => onAction("revision", request)
    }, "Edit and resubmit request") : canConfirm ? React.createElement("button", {
      type: "button",
      className: "btn btn--sm btn--secondary",
      onClick: () => onAction("actual", request)
    }, "Confirm actual") : React.createElement("span", {
      className: "muted"
    }, "No action")));
  })))));
}
const OT_MANAGER_METRIC_LABELS = ["Planned OT", "Confirmed", "Needs approval", "Near 36h limit"];
const OT_ROOT_CAUSE_LABELS = ["OT by function", "Why OT happens"];
const OT_DISPLAY_YEAR = 2026;
const OT_DISPLAY_YEAR_START = "2026-01-01";
const OT_DISPLAY_YEAR_END = "2026-12-31";
const OT_DISPLAY_MONTH_START = "2026-01";
const OT_DISPLAY_MONTH_END = "2026-12";
const OT_FUNCTIONS = [{
  value: "gdve",
  label: "GD/VE"
}, {
  value: "ops",
  label: "Ops"
}, {
  value: "mkt",
  label: "MKT"
}, {
  value: "esport",
  label: "eSport"
}];
function getOtManagerRequestId(request) {
  return otValue(request, "requestId", "request_id") || request.id;
}
function getOtManagerEmployeeId(request) {
  return otValue(request, "employeeUserId", "employee_user_id") || "unknown";
}
function getOtManagerWeekMinutes(request, prefix, weekStart) {
  const segments = getOtWeekSegments(request, prefix);
  return segments.filter(segment => segment.weekStart === weekStart).reduce((sum, segment) => sum + Number(segment.minutes || 0), 0);
}
function normalizeOtManagerRow(request, weekStart) {
  return {
    ...request,
    id: `${request.id}:${weekStart}`,
    requestId: request.id,
    weekStart,
    occurrencePlannedMinutes: Number(otValue(request, "plannedMinutes", "planned_minutes") || 0),
    occurrenceActualMinutes: Number(otValue(request, "actualMinutes", "actual_minutes") || 0),
    plannedMinutes: getOtManagerWeekMinutes(request, "planned", weekStart),
    actualMinutes: getOtManagerWeekMinutes(request, "actual", weekStart)
  };
}
function getOtManagerEmployeeName(request, peopleById) {
  const employeeId = getOtManagerEmployeeId(request);
  const person = peopleById[employeeId];
  return otValue(request, "employeeDisplayName", "employee_display_name") || person && (person.displayName || person.email) || `Employee ${String(employeeId).slice(0, 8)}`;
}
function getOtManagerTotals(rows, byWeek = false) {
  return window.FlowMateOtRequestDomain.buildOtManagerTotals(rows, byWeek);
}
function isOtActualConfirmed(request) {
  return window.FlowMateOtRequestDomain.isConfirmedActual(request);
}
function getOtReasonLabel(request) {
  const reasonCode = otValue(request, "reasonCode", "reason_code");
  return window.FlowMateOtRequestDomain.REASON_OPTIONS.find(reason => reason.key === reasonCode)?.label || getOtStatusLabel(reasonCode);
}
function applyOtManagerFilters(rows, filters, employeeTotals) {
  return rows.filter(request => {
    const status = getOtRequestStatus(request);
    const eventPlanId = otValue(request, "eventPlanId", "event_plan_id") || "individual";
    const reasonCode = otValue(request, "reasonCode", "reason_code") || "";
    const employeeId = getOtManagerEmployeeId(request);
    const total = employeeTotals[`${employeeId}:${request.weekStart}`]?.countedMinutes ?? employeeTotals[employeeId]?.countedMinutes ?? 0;
    return (!filters.eventPlanId || eventPlanId === filters.eventPlanId) && (!filters.reasonCode || reasonCode === filters.reasonCode) && (!filters.status || status === filters.status) && (!filters.nearLimit || total >= 30 * 60);
  });
}
function OtMonthlyTeamReport({
  rows,
  monthKey
}) {
  const reportRows = window.FlowMateOtRequestDomain.buildOtMonthlyFunctionReport(rows, monthKey);
  return React.createElement("section", {
    className: "ot-list",
    "aria-label": "Monthly report by Function"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, "Monthly report"), React.createElement("p", {
    className: "muted"
  }, "Daily OT requests are grouped by Function for this month. Actual hours replace planned hours after confirmation.")), React.createElement("span", null, monthKey)), !reportRows.length ? React.createElement("div", {
    className: "ot-state ot-state--compact"
  }, "No daily OT requests are recorded for this month.") : React.createElement("div", {
    className: "ot-table-wrap"
  }, React.createElement("table", {
    className: "tbl ot-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Function"), React.createElement("th", null, "Requests"), React.createElement("th", null, "Planned"), React.createElement("th", null, "Actual"), React.createElement("th", null, "Verified"))), React.createElement("tbody", null, reportRows.map(row => React.createElement("tr", {
    key: row.functionCode
  }, React.createElement("td", null, React.createElement("strong", null, row.functionCode.toUpperCase())), React.createElement("td", null, row.requestCount), React.createElement("td", null, formatOtHours(row.plannedMinutes)), React.createElement("td", null, formatOtHours(row.actualMinutes)), React.createElement("td", null, formatOtHours(row.verifiedMinutes))))))));
}
function getOtManagerClientFilterKey(filters) {
  return JSON.stringify([String(filters?.eventPlanId || ""), String(filters?.reasonCode || ""), String(filters?.status || ""), Boolean(filters?.nearLimit)]);
}
function OtManagerDashboard({
  access,
  surface = "action-queue",
  rootCauseOnly = false,
  refreshToken = 0
}) {
  const [weekStart, setWeekStart] = useStateApp(getCurrentOtWeekStart);
  const [reportMonth, setReportMonth] = useStateApp(() => {
    const currentMonth = getCurrentOtMonthKey();
    return currentMonth >= OT_DISPLAY_MONTH_START && currentMonth <= OT_DISPLAY_MONTH_END ? currentMonth : OT_DISPLAY_MONTH_START;
  });
  const [functionFilter, setFunctionFilter] = useStateApp("");
  const [filters, setFilters] = useStateApp({
    eventPlanId: "",
    reasonCode: "",
    status: "",
    nearLimit: false
  });
  const [loadState, setLoadState] = useStateApp({
    status: "loading",
    queryKey: "",
    rows: [],
    peopleById: {},
    message: ""
  });
  const [refreshKey, setRefreshKey] = useStateApp(0);
  const errorRef = useRefApp(null);
  const decisionIntentRef = useRefApp(null);
  const bulkIntentsRef = useRefApp({});
  const isMonthlyReport = surface === "monthly-report";
  const isTeamSchedule = surface === "team-schedule";
  const managerWeeks = rootCauseOnly ? [0, -7, -14, -21, -28].map(offset => addOtDays(weekStart, offset)) : isMonthlyReport ? getOtMonthWeekStarts(reportMonth) : [weekStart];
  const managerLoadKey = `${rootCauseOnly ? "root" : surface}:${weekStart}:${reportMonth}:${functionFilter}:${refreshKey}:${refreshToken}`;
  const clientFilterKey = getOtManagerClientFilterKey(filters);
  const activeLoadState = loadState.queryKey === managerLoadKey ? loadState : {
    status: "loading",
    queryKey: managerLoadKey,
    rows: [],
    peopleById: {},
    message: ""
  };
  useEffectApp(() => {
    let alive = true;
    const weeks = managerWeeks;
    setLoadState({
      status: "loading",
      queryKey: managerLoadKey,
      rows: [],
      peopleById: {},
      message: ""
    });
    Promise.all([Promise.all(weeks.map(managerWeek => window.loadOtManagerDashboard(managerWeek, functionFilter || null))), rootCauseOnly ? Promise.resolve([]) : window.loadOtPeopleForEvent()]).then(([dashboards, people]) => {
      if (!alive) return;
      const rows = dashboards.flatMap((dashboard, index) => {
        const managerWeek = weeks[index];
        return (Array.isArray(dashboard?.requests) ? dashboard.requests : []).map(request => normalizeOtManagerRow(request, managerWeek));
      }).filter(isOtRequestInDisplayYear);
      const referencedIds = new Set(rows.map(getOtManagerEmployeeId));
      const peopleById = (Array.isArray(people) ? people : []).reduce((lookup, person) => {
        if (referencedIds.has(person.userId)) lookup[person.userId] = person;
        return lookup;
      }, {});
      setLoadState({
        status: "ready",
        queryKey: managerLoadKey,
        rows,
        peopleById,
        message: ""
      });
    }).catch(error => {
      if (alive) setLoadState({
        status: "error",
        queryKey: managerLoadKey,
        rows: [],
        peopleById: {},
        message: error.message || "Assigned OT could not be loaded."
      });
    });
    return () => {
      alive = false;
    };
  }, [weekStart, reportMonth, functionFilter, refreshKey, refreshToken, rootCauseOnly, surface]);
  useEffectApp(() => {
    if (activeLoadState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [activeLoadState.status]);
  function updateFilter(field, value) {
    setFilters(current => ({
      ...current,
      [field]: value
    }));
    setSelectedRow(null);
  }
  const currentRows = activeLoadState.rows.filter(request => request.weekStart === weekStart);
  const filterOptionRows = isMonthlyReport ? activeLoadState.rows : currentRows;
  const currentEmployeeTotals = getOtManagerTotals(currentRows);
  const historyEmployeeTotals = getOtManagerTotals(activeLoadState.rows, true);
  const filteredCurrentRows = applyOtManagerFilters(currentRows, filters, currentEmployeeTotals);
  const filteredRows = applyOtManagerFilters(activeLoadState.rows, filters, historyEmployeeTotals);
  const eventOptions = Array.from(new Map(filterOptionRows.filter(request => otValue(request, "eventPlanId", "event_plan_id")).map(request => [otValue(request, "eventPlanId", "event_plan_id"), request.title])).entries());
  const statusOptions = Array.from(new Set(filterOptionRows.map(getOtRequestStatus))).sort();
  const surfaceRows = isMonthlyReport ? filteredRows : filteredCurrentRows;
  const surfaceEmployeeTotals = isMonthlyReport ? historyEmployeeTotals : currentEmployeeTotals;
  const plannedMinutes = surfaceRows.filter(request => !["cancelled", "rejected"].includes(getOtRequestStatus(request))).reduce((sum, request) => sum + Number(request.plannedMinutes || 0), 0);
  const confirmedMinutes = surfaceRows.filter(isOtActualConfirmed).reduce((sum, request) => sum + Number(request.actualMinutes || 0), 0);
  const needsApproval = filteredCurrentRows.filter(request => !otValue(request, "actualSubmittedAt", "actual_submitted_at") && getOtRequestStatus(request) === "pending_approval").length;
  const monthlyNeedsApproval = isMonthlyReport ? surfaceRows.filter(request => !otValue(request, "actualSubmittedAt", "actual_submitted_at") && getOtRequestStatus(request) === "pending_approval").length : needsApproval;
  const nearLimit = new Set(surfaceRows.filter(request => (surfaceEmployeeTotals[getOtManagerEmployeeId(request)]?.countedMinutes || 0) >= 30 * 60).map(getOtManagerEmployeeId)).size;
  const metricValues = [formatOtHours(plannedMinutes), formatOtHours(confirmedMinutes), String(monthlyNeedsApproval), String(nearLimit)];
  const hasFullScope = Boolean(access.isOwner || access.isHrAdmin);
  if (activeLoadState.status === "loading") {
    return React.createElement("div", {
      className: "ot-state",
      role: "status"
    }, "Loading assigned OT operations…");
  }
  if (activeLoadState.status === "error") {
    return React.createElement("div", {
      className: "ot-state",
      role: "alert",
      tabIndex: "-1",
      ref: errorRef
    }, React.createElement("strong", null, "Assigned OT could not be loaded."), React.createElement("span", null, activeLoadState.message), React.createElement("button", {
      type: "button",
      className: "btn btn--secondary",
      onClick: () => setRefreshKey(value => value + 1)
    }, "Retry"));
  }
  return React.createElement("div", {
    className: "ot-manager"
  }, React.createElement("section", {
    className: "ot-manager-scope",
    "aria-label": "Manager data scope"
  }, React.createElement("strong", null, hasFullScope ? "All Functions — server-authorized OT scope" : "Assigned teams/events only"), React.createElement("span", null, hasFullScope ? "Named rows are returned by the OT Owner server scope." : "Rows come from the server-authorized Team Lead scope.", " Filters never widen access.")), React.createElement("section", {
    className: "ot-manager-filters",
    "aria-label": "OT filters"
  }, !isMonthlyReport && React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Week"), React.createElement("input", {
    className: "input",
    type: "date",
    min: OT_DISPLAY_YEAR_START,
    max: OT_DISPLAY_YEAR_END,
    value: weekStart,
    onChange: event => setWeekStart(window.FlowMateOtRequestDomain.getWeekStartKey(event.target.value))
  })), isMonthlyReport && React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Report month"), React.createElement("input", {
    className: "input",
    type: "month",
    min: "2026-01",
    max: "2026-12",
    value: reportMonth,
    onChange: event => setReportMonth(event.target.value || OT_DISPLAY_MONTH_START)
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Function"), React.createElement("select", {
    className: "select",
    value: functionFilter,
    onChange: event => setFunctionFilter(event.target.value)
  }, React.createElement("option", {
    value: ""
  }, hasFullScope ? "All Functions" : "All assigned Functions"), OT_FUNCTIONS.map(option => React.createElement("option", {
    key: option.value,
    value: option.value
  }, option.label)))), (isTeamSchedule || isMonthlyReport || rootCauseOnly) && React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Event"), React.createElement("select", {
    className: "select",
    value: filters.eventPlanId,
    onChange: event => updateFilter("eventPlanId", event.target.value)
  }, React.createElement("option", {
    value: ""
  }, "All events / requests"), React.createElement("option", {
    value: "individual"
  }, "Individual requests"), eventOptions.map(([id, title]) => React.createElement("option", {
    key: id,
    value: id
  }, title)))), (isTeamSchedule || isMonthlyReport || rootCauseOnly) && React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Status"), React.createElement("select", {
    className: "select",
    value: filters.status,
    onChange: event => updateFilter("status", event.target.value)
  }, React.createElement("option", {
    value: ""
  }, "All statuses"), statusOptions.map(status => React.createElement("option", {
    key: status,
    value: status
  }, getOtStatusLabel(status))))), (isTeamSchedule || isMonthlyReport || rootCauseOnly) && React.createElement("label", {
    className: "ot-filter-check"
  }, React.createElement("input", {
    type: "checkbox",
    checked: filters.nearLimit,
    onChange: event => updateFilter("nearLimit", event.target.checked)
  }), React.createElement("span", null, "Near limit only"))), rootCauseOnly ? React.createElement(OtRootCausePanel, {
    key: clientFilterKey,
    filteredRows: filteredRows,
    currentWeekStart: weekStart,
    weekStarts: managerWeeks,
    filterKey: clientFilterKey
  }) : React.createElement(React.Fragment, null, isMonthlyReport && React.createElement(React.Fragment, null, React.createElement("section", {
    className: "ot-metric-grid ot-metric-grid--manager",
    "aria-label": "Monthly OT summary"
  }, OT_MANAGER_METRIC_LABELS.map((label, index) => React.createElement("section", {
    className: "ot-metric",
    key: label
  }, React.createElement("span", null, label), React.createElement("strong", null, metricValues[index])))), React.createElement(OtMonthlyTeamReport, {
    rows: filteredRows,
    monthKey: reportMonth
  }), React.createElement(OtMonthlyTeamDetails, {
    requests: filteredRows,
    peopleById: activeLoadState.peopleById
  })), surface === "action-queue" && React.createElement(OtApprovalQueue, {
    access: access,
    requests: filteredCurrentRows,
    allRequests: currentRows,
    weekStart: weekStart,
    peopleById: activeLoadState.peopleById,
    decisionIntentRef: decisionIntentRef,
    bulkIntentsRef: bulkIntentsRef,
    onChanged: () => setRefreshKey(value => value + 1)
  }), isTeamSchedule && React.createElement(OtTeamWeekTable, {
    requests: filteredCurrentRows,
    allRequests: currentRows,
    peopleById: activeLoadState.peopleById
  }), React.createElement("div", {
    className: "ot-manager-actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: () => setRefreshKey(value => value + 1)
  }, "Refresh ", hasFullScope ? "OT scope" : "assigned scope"))));
}
function OtApprovalQueue({
  access,
  requests,
  allRequests,
  peopleById,
  decisionIntentRef,
  bulkIntentsRef,
  onChanged
}) {
  const [selected, setSelected] = useStateApp(null);
  const [note, setNote] = useStateApp("");
  const [bulkReview, setBulkReview] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({
    status: "idle",
    message: ""
  });
  const currentTimestamp = useOtCurrentTimestamp();
  const decisionSubmissionRef = useRefApp(false);
  const employeeTotals = getOtManagerTotals(allRequests);
  const planRequests = requests.filter(request => otValue(request, "source", "source") === "employee_request" && !otValue(request, "actualSubmittedAt", "actual_submitted_at") && getOtRequestStatus(request) === "pending_approval");
  const actualRequests = requests.filter(request => ["pending_actual_verification", "compliance_review_required"].includes(getOtRequestStatus(request)));
  function canAct(request) {
    return window.FlowMateOtRequestDomain.canActOnAssignedRequest(access, request);
  }
  function getActualChecks(request) {
    const weeklyTotal = employeeTotals[getOtManagerEmployeeId(request)]?.countedMinutes || 0;
    return window.FlowMateOtRequestDomain.getActualVerificationEligibility(request, weeklyTotal);
  }
  function canTakeAction(kind, request) {
    if (!canAct(request)) return false;
    if (kind !== "actual") return true;
    const checks = getActualChecks(request);
    return !checks.awaitingHrCompliance;
  }
  function getOccurrenceMinutes(request, field) {
    const occurrenceField = field === "plannedMinutes" ? "occurrencePlannedMinutes" : "occurrenceActualMinutes";
    return Number(request[occurrenceField] ?? otValue(request, field, field === "plannedMinutes" ? "planned_minutes" : "actual_minutes") ?? 0);
  }
  function formatConsentTimestamp(request) {
    const value = otValue(request, "employeeConsentedAt", "employee_consented_at");
    return value ? new Date(value).toLocaleString("en-GB", {
      timeZone: "Asia/Bangkok"
    }) : "Not recorded";
  }
  function getBulkExclusionReasons(request, checks) {
    const reasons = [];
    if (!canAct(request)) reasons.push("Not assigned to you as the eligible approver.");
    if (!checks.consentAccepted) reasons.push("Employee consent is missing.");
    if (checks.varianceNeedsReason && !checks.varianceHasReason) reasons.push("The signed variance needs an employee reason.");
    if (checks.awaitingHrCompliance) reasons.push("Already approved; awaiting HR compliance.");else if (checks.complianceRequired) reasons.push("Compliance review required; verify this occurrence individually.");
    if (checks.weeklyTotal > OT_LIMIT_MINUTES) reasons.push("Employee weekly total is above 36h.");
    if (!checks.actualSubmitted) reasons.push("Actual time has not been submitted with weekly segments.");
    return reasons.length ? reasons : ["This occurrence is not ready for bulk verification."];
  }
  function openDecision(kind, request) {
    if (!canTakeAction(kind, request)) return;
    if (decisionSubmissionRef.current || actionState.status === "submitting") return;
    setSelected({
      kind,
      request
    });
    setBulkReview(null);
    setNote("");
    setActionState({
      status: "idle",
      message: ""
    });
  }
  async function decide(decision) {
    if (!selected || !canTakeAction(selected.kind, selected.request) || decisionSubmissionRef.current || actionState.status === "submitting") return;
    if (decision !== "approved" && !note.trim()) {
      setActionState({
        status: "error",
        message: "A note is required when rejecting or returning OT."
      });
      return;
    }
    if (selected.kind === "actual" && decision === "approved" && selectedChecks?.complianceRequired && !note.trim()) {
      setActionState({
        status: "error",
        message: "A note is required for a compliance-required actual approval."
      });
      return;
    }
    if (selected.kind === "actual" && decision === "approved" && !getActualChecks(selected.request).canVerifyIndividually) {
      setActionState({
        status: "error",
        message: "This actual record cannot be verified until consent, submitted actual time, and variance checks are complete."
      });
      return;
    }
    if (selected.kind === "plan" && decision === "approved" && !window.FlowMateOtRequestDomain.isPlannedStartFuture(otValue(selected.request, "plannedStartAt", "planned_start_at"), Date.now())) {
      setActionState({
        status: "error",
        message: "Approval is no longer available because the planned start is not strictly future in Bangkok time. Reject or return remains available."
      });
      return;
    }
    const requestId = getOtManagerRequestId(selected.request);
    const normalizedNote = note.trim() || null;
    const signature = window.FlowMateOtIntent.signature([requestId, selected.kind, decision, normalizedNote]);
    const currentIntent = window.FlowMateOtIntent.establish(decisionIntentRef.current, signature, () => crypto.randomUUID());
    decisionIntentRef.current = currentIntent;
    decisionSubmissionRef.current = true;
    setActionState({
      status: "submitting",
      message: "Saving the audited decision…"
    });
    try {
      if (selected.kind === "plan") {
        await window.reviewOtPlan(requestId, decision, normalizedNote, currentIntent.key);
      } else {
        await window.verifyOtActual(requestId, decision, normalizedNote, currentIntent.key);
      }
      decisionIntentRef.current = window.FlowMateOtIntent.complete();
      setActionState({
        status: "success",
        message: "Decision saved to the request audit."
      });
      setSelected(null);
      setNote("");
      onChanged();
    } catch (error) {
      setActionState({
        status: "error",
        message: error.message || "The decision could not be saved."
      });
    } finally {
      decisionSubmissionRef.current = false;
    }
  }
  function openBulkReview() {
    if (decisionSubmissionRef.current || actionState.status === "submitting") return;
    const requestsToVerify = actualRequests.filter(request => {
      const checks = getActualChecks(request);
      return canAct(request) && checks.canBulkVerify;
    });
    const excludedRequests = actualRequests.filter(request => {
      const checks = getActualChecks(request);
      return !canAct(request) || !checks.canBulkVerify;
    });
    setSelected(null);
    setBulkReview({
      requestsToVerify,
      excludedRequests
    });
    setActionState({
      status: "idle",
      message: ""
    });
  }
  async function confirmBulkVerification() {
    const requestsToVerify = bulkReview?.requestsToVerify || [];
    if (!requestsToVerify.length || decisionSubmissionRef.current || actionState.status === "submitting") return;
    decisionSubmissionRef.current = true;
    setActionState({
      status: "submitting",
      message: `Verifying ${requestsToVerify.length} eligible actual occurrence(s) individually…`
    });
    let completed = 0;
    const nextBulkIntents = bulkIntentsRef.current;
    const bulkNote = "Bulk verified after individual checks.";
    try {
      for (const request of requestsToVerify) {
        const requestId = getOtManagerRequestId(request);
        const signature = window.FlowMateOtIntent.signature([requestId, "actual", "approved", bulkNote]);
        const currentIntent = window.FlowMateOtIntent.establish(nextBulkIntents[requestId], signature, () => crypto.randomUUID());
        nextBulkIntents[requestId] = currentIntent;
        await window.verifyOtActual(requestId, "approved", bulkNote, currentIntent.key);
        delete nextBulkIntents[requestId];
        completed += 1;
      }
      bulkIntentsRef.current = {};
      setActionState({
        status: "success",
        message: `${completed} actual occurrence(s) verified individually and audited.`
      });
      setBulkReview(null);
      onChanged();
    } catch (error) {
      setBulkReview(current => current ? {
        ...current,
        requestsToVerify: requestsToVerify.slice(completed)
      } : current);
      setActionState({
        status: "error",
        message: `${completed} verified. Bulk action stopped at the first server error: ${error.message || "Verification failed."}`
      });
      onChanged();
    } finally {
      decisionSubmissionRef.current = false;
    }
  }
  const selectedChecks = selected?.kind === "actual" ? getActualChecks(selected.request) : null;
  const selectedPlanStartIsFuture = selected?.kind !== "plan" || window.FlowMateOtRequestDomain.isPlannedStartFuture(otValue(selected.request, "plannedStartAt", "planned_start_at"), currentTimestamp);
  const selectedTotal = selected ? employeeTotals[getOtManagerEmployeeId(selected.request)]?.countedMinutes || 0 : 0;
  const selectedPlanned = selected ? getOccurrenceMinutes(selected.request, "plannedMinutes") : 0;
  const selectedActual = selected ? getOccurrenceMinutes(selected.request, "actualMinutes") : 0;
  const eligibleActualCount = actualRequests.filter(request => canAct(request) && getActualChecks(request).canBulkVerify).length;
  function renderQueueItem(kind, request, statusNode) {
    const content = React.createElement(React.Fragment, null, React.createElement("span", null, React.createElement("strong", null, request.title), React.createElement("small", null, getOtManagerEmployeeName(request, peopleById))), statusNode);
    const checks = kind === "actual" ? getActualChecks(request) : null;
    return canTakeAction(kind, request) ? React.createElement("button", {
      key: request.id,
      type: "button",
      className: "ot-queue-item",
      disabled: actionState.status === "submitting",
      onClick: () => openDecision(kind, request)
    }, content) : React.createElement("div", {
      key: request.id,
      className: "ot-queue-item ot-queue-item--readonly"
    }, content, React.createElement("small", null, checks?.awaitingHrCompliance ? "Awaiting HR compliance" : "Read only — assigned approver action"));
  }
  return React.createElement("section", {
    className: "ot-list",
    "aria-label": "Manager OT approval queues"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("h2", null, "Approval & actual verification"), React.createElement("span", null, planRequests.length, " plan · ", actualRequests.length, " actual")), bulkReview && React.createElement("section", {
    className: "ot-decision ot-bulk-review",
    "aria-label": "Bulk verification review"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h3", null, "Bulk verification review"), React.createElement("p", {
    className: "muted"
  }, "Confirm only after reviewing each included occurrence. Writes run sequentially and stop at the first server error.")), React.createElement("button", {
    type: "button",
    className: "btn btn--ghost",
    disabled: actionState.status === "submitting",
    onClick: () => setBulkReview(null)
  }, "Close")), React.createElement("div", {
    className: "ot-bulk-list"
  }, bulkReview.requestsToVerify.map(request => {
    const checks = getActualChecks(request);
    const planned = getOccurrenceMinutes(request, "plannedMinutes");
    const actual = getOccurrenceMinutes(request, "actualMinutes");
    return React.createElement("article", {
      className: "ot-bulk-row",
      key: request.id
    }, React.createElement("div", {
      className: "ot-section-head"
    }, React.createElement("div", null, React.createElement("strong", null, request.title), React.createElement("small", null, getOtManagerEmployeeName(request, peopleById))), React.createElement("span", {
      className: "ot-status"
    }, "Included")), React.createElement("div", {
      className: "ot-detail-grid"
    }, React.createElement("div", null, React.createElement("span", null, "Consent timestamp"), React.createElement("strong", null, formatConsentTimestamp(request))), React.createElement("div", null, React.createElement("span", null, "Signed variance"), React.createElement("strong", null, window.FlowMateOtRequestDomain.formatSignedHours(actual - planned))), React.createElement("div", null, React.createElement("span", null, "Employee weekly total"), React.createElement("strong", null, formatOtHours(checks.weeklyTotal), " / 36h"))), React.createElement("p", {
      className: "muted"
    }, "No blocking consent, variance, weekly-limit, or compliance warning."));
  })), !!bulkReview.excludedRequests.length && React.createElement("div", {
    className: "ot-bulk-excluded"
  }, React.createElement("h4", null, "Excluded from bulk"), bulkReview.excludedRequests.map(request => {
    const checks = getActualChecks(request);
    const planned = getOccurrenceMinutes(request, "plannedMinutes");
    const actual = getOccurrenceMinutes(request, "actualMinutes");
    return React.createElement("article", {
      className: "ot-bulk-row ot-bulk-row--excluded",
      key: request.id
    }, React.createElement("strong", null, request.title), React.createElement("small", null, getOtManagerEmployeeName(request, peopleById)), React.createElement("div", {
      className: "ot-detail-grid"
    }, React.createElement("div", null, React.createElement("span", null, "Consent timestamp"), React.createElement("strong", null, formatConsentTimestamp(request))), React.createElement("div", null, React.createElement("span", null, "Signed variance"), React.createElement("strong", null, window.FlowMateOtRequestDomain.formatSignedHours(actual - planned))), React.createElement("div", null, React.createElement("span", null, "Employee weekly total"), React.createElement("strong", null, formatOtHours(checks.weeklyTotal), " / 36h"))), React.createElement("ul", null, getBulkExclusionReasons(request, checks).map(reason => React.createElement("li", {
      key: reason
    }, reason))));
  })), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    disabled: actionState.status === "submitting",
    onClick: () => setBulkReview(null)
  }, "Cancel"), React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    disabled: !bulkReview.requestsToVerify.length || actionState.status === "submitting",
    onClick: confirmBulkVerification
  }, "Confirm ", bulkReview.requestsToVerify.length, " verifications"))), React.createElement("div", {
    className: "ot-queue-grid"
  }, React.createElement("section", {
    className: "ot-queue"
  }, React.createElement("h3", null, "Planned requests"), planRequests.map(request => renderQueueItem("plan", request, React.createElement("span", {
    className: `ot-status ot-status--${getOtRequestStatus(request)}`
  }, getOtStatusLabel(getOtRequestStatus(request))))), !planRequests.length && React.createElement("div", {
    className: "ot-state ot-state--compact"
  }, "No planned requests need a decision.")), React.createElement("section", {
    className: "ot-queue"
  }, React.createElement("div", {
    className: "ot-queue__head"
  }, React.createElement("h3", null, "Actual verification"), React.createElement("button", {
    type: "button",
    className: "btn btn--sm btn--secondary",
    disabled: !eligibleActualCount || actionState.status === "submitting",
    onClick: openBulkReview
  }, "Review ", eligibleActualCount, " eligible")), actualRequests.map(request => {
    const checks = getActualChecks(request);
    const label = checks.awaitingHrCompliance ? "Awaiting HR compliance" : checks.canVerifyIndividually ? "Ready" : "Review";
    return renderQueueItem("actual", request, React.createElement("span", {
      className: `ot-status ${checks.canVerifyIndividually ? "" : "ot-status--revision_required"}`
    }, label));
  }), !actualRequests.length && React.createElement("div", {
    className: "ot-state ot-state--compact"
  }, "No actual records need verification."))), selected && React.createElement("section", {
    className: "ot-decision",
    "aria-label": "OT decision details"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("h3", null, "Review before decision"), React.createElement("button", {
    type: "button",
    className: "btn btn--ghost",
    disabled: actionState.status === "submitting",
    onClick: () => setSelected(null)
  }, "Close")), React.createElement("div", {
    className: "ot-detail-grid"
  }, React.createElement("div", null, React.createElement("span", null, "Employee"), React.createElement("strong", null, getOtManagerEmployeeName(selected.request, peopleById))), React.createElement("div", null, React.createElement("span", null, "Consent timestamp"), React.createElement("strong", null, otValue(selected.request, "employeeConsentedAt", "employee_consented_at") ? new Date(otValue(selected.request, "employeeConsentedAt", "employee_consented_at")).toLocaleString("en-GB", {
    timeZone: "Asia/Bangkok"
  }) : "Not recorded")), React.createElement("div", null, React.createElement("span", null, "Planned / actual variance"), React.createElement("strong", null, formatOtHours(selectedPlanned), " / ", selectedActual ? formatOtHours(selectedActual) : "—", " (", selectedActual ? `${selectedActual - selectedPlanned}m` : "—", ")")), React.createElement("div", null, React.createElement("span", null, "Employee weekly total"), React.createElement("strong", null, formatOtHours(selectedTotal), " / 36h"))), selected?.kind === "actual" && React.createElement("div", {
    className: "ot-detail-grid"
  }, React.createElement("div", null, React.createElement("span", null, "Signed variance"), React.createElement("strong", null, otValue(selected.request, "actualSubmittedAt", "actual_submitted_at") ? window.FlowMateOtRequestDomain.formatSignedHours(selectedActual - selectedPlanned) : "—"))), selectedTotal > OT_LIMIT_MINUTES && React.createElement(OtWarning, {
    kind: "critical",
    title: "Weekly limit",
    message: selected.kind === "actual" ? "This employee/week is above 36h. The assigned approver may verify truthful actual time; the server keeps the compliance gate active." : "This employee/week is above 36h. Plan approval is blocked."
  }), selected.kind === "plan" && !selectedPlanStartIsFuture && React.createElement(OtWarning, {
    kind: "critical",
    title: "Approval window closed",
    message: "Approval is no longer available because the planned start is not strictly future in Bangkok time. Reject or return remains available."
  }), selectedChecks && !selectedChecks.consentAccepted && React.createElement(OtWarning, {
    kind: "critical",
    title: "Consent missing",
    message: "Individual employee consent must be accepted before actual verification."
  }), selectedChecks?.varianceNeedsReason && !selectedChecks.varianceHasReason && React.createElement(OtWarning, {
    kind: "critical",
    title: "Variance reason missing",
    message: "A change above 30 minutes needs an employee reason before verification."
  }), selectedChecks?.complianceRequired && React.createElement(OtWarning, {
    kind: "critical",
    title: "Compliance review required",
    message: "The assigned approver may verify truthful actual time individually. The server retains the compliance gate after approval."
  }), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Decision note ", selected.kind === "plan" ? "(required for reject or revision)" : selectedChecks?.complianceRequired ? "(required for return or required for compliance approval)" : "(required for return)"), React.createElement("textarea", {
    className: "textarea",
    value: note,
    disabled: actionState.status === "submitting",
    onChange: event => setNote(event.target.value),
    placeholder: "Add the operational decision context"
  })), React.createElement("p", {
    className: "muted"
  }, "Every decision is saved through the assigned-request RPC and recorded in the audit trail."), React.createElement("div", {
    className: "ot-form__actions"
  }, selected.kind === "plan" ? React.createElement(React.Fragment, null, React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    disabled: !note.trim() || actionState.status === "submitting",
    onClick: () => decide("rejected")
  }, "Reject plan"), React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    disabled: selectedTotal > OT_LIMIT_MINUTES || !selectedPlanStartIsFuture || actionState.status === "submitting",
    onClick: () => decide("approved")
  }, "Approve plan")) : React.createElement(React.Fragment, null, React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    disabled: !note.trim() || actionState.status === "submitting",
    onClick: () => decide("revision_required")
  }, "Return actual"), React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    disabled: !selectedChecks?.canVerifyIndividually || selectedChecks?.complianceRequired && !note.trim() || actionState.status === "submitting",
    onClick: () => decide("approved")
  }, "Verify actual")))), actionState.message && React.createElement(OtWarning, {
    kind: actionState.status === "error" ? "error" : "info",
    message: actionState.message
  }));
}
function OtEventPlanForm({
  access,
  onSuccess
}) {
  const today = getBangkokDateKey();
  const [form, setForm] = useStateApp({
    title: "",
    functionCode: "",
    startDate: today,
    endDate: today,
    startTime: "18:00",
    endTime: "20:00",
    breakMinutes: "0",
    breakMinutesBeforeBoundary: "",
    breakMinutesAfterBoundary: "",
    dayType: "working_day",
    workLocationType: "venue",
    venue: "",
    reasonCode: "offline_event",
    reasonDetail: "",
    approverUserId: access.userId || "",
    employeeUserIds: []
  });
  const [directoryState, setDirectoryState] = useStateApp({
    status: "loading",
    people: [],
    approvers: [],
    message: ""
  });
  const [previewState, setPreviewState] = useStateApp({
    status: "idle",
    result: null,
    payload: null,
    message: ""
  });
  const [submitState, setSubmitState] = useStateApp({
    status: "idle",
    message: "",
    result: null
  });
  const [intent, setIntent] = useStateApp(() => ({
    key: crypto.randomUUID(),
    attempted: false
  }));
  useEffectApp(() => {
    let alive = true;
    Promise.all([window.loadOtPeopleForEvent(), window.loadOtEligibleApprovers()]).then(([people, approvers]) => {
      if (!alive) return;
      const activeApprovers = (Array.isArray(approvers) ? approvers : []).filter(approver => approver.userId === access.userId);
      setDirectoryState({
        status: "ready",
        people: Array.isArray(people) ? people : [],
        approvers: activeApprovers,
        message: ""
      });
      if (activeApprovers.length === 1) setForm(current => ({
        ...current,
        approverUserId: activeApprovers[0].userId
      }));
    }).catch(error => {
      if (alive) setDirectoryState({
        status: "error",
        people: [],
        approvers: [],
        message: error.message || "Event participants and approvers could not be loaded."
      });
    });
    return () => {
      alive = false;
    };
  }, [access.userId]);
  function update(field, value) {
    if (submitState.status === "submitting") return;
    setForm(current => ({
      ...current,
      [field]: value
    }));
    setPreviewState({
      status: "idle",
      result: null,
      payload: null,
      message: "Plan changed. Preview again before creating it."
    });
    if (intent.attempted) setIntent({
      key: crypto.randomUUID(),
      attempted: false
    });
  }
  function toggleEmployee(employeeUserId) {
    update("employeeUserIds", form.employeeUserIds.includes(employeeUserId) ? form.employeeUserIds.filter(id => id !== employeeUserId) : form.employeeUserIds.concat(employeeUserId));
  }
  let schedule = {
    valid: false,
    endDate: form.endDate,
    segments: [],
    crossesWeek: false,
    message: "Complete the shared event schedule."
  };
  try {
    const endDate = form.endDate === form.startDate && form.endTime <= form.startTime ? addOtDays(form.endDate, 1) : form.endDate;
    const lastWorkedDate = form.endTime === "00:00" ? addOtDays(endDate, -1) : endDate;
    const crossesWeek = window.FlowMateOtRequestDomain.getWeekStartKey(form.startDate) !== window.FlowMateOtRequestDomain.getWeekStartKey(lastWorkedDate);
    const splitInput = {
      startDate: form.startDate,
      endDate,
      startTime: form.startTime,
      endTime: form.endTime,
      breakMinutes: Number(form.breakMinutes || 0)
    };
    if (crossesWeek) {
      splitInput.breakMinutesBeforeBoundary = form.breakMinutesBeforeBoundary === "" ? undefined : Number(form.breakMinutesBeforeBoundary);
      splitInput.breakMinutesAfterBoundary = form.breakMinutesAfterBoundary === "" ? undefined : Number(form.breakMinutesAfterBoundary);
    }
    const segments = window.FlowMateOtRequestDomain.splitMinutesByWeek(splitInput);
    schedule = {
      valid: true,
      endDate,
      segments,
      crossesWeek,
      message: ""
    };
  } catch (error) {
    schedule = {
      ...schedule,
      message: error.message
    };
  }
  const detailRequired = OT_DETAIL_REQUIRED_REASONS.has(form.reasonCode);
  const venueRequired = form.workLocationType === "venue";
  const plannedStartIsFuture = schedule.valid && window.FlowMateOtRequestDomain.isBangkokPlannedStartFuture(form.startDate, form.startTime);
  const baseComplete = schedule.valid && form.title.trim() && form.functionCode && form.reasonCode && plannedStartIsFuture && (!detailRequired || form.reasonDetail.trim()) && (!venueRequired || form.venue.trim()) && form.approverUserId && form.employeeUserIds.length > 0 && directoryState.status === "ready";
  function buildEventPayload() {
    return {
      title: form.title.trim(),
      functionCode: form.functionCode,
      dayType: form.dayType,
      workLocationType: form.workLocationType,
      venue: venueRequired ? form.venue.trim() : null,
      reasonCode: form.reasonCode,
      reasonDetail: form.reasonDetail.trim() || null,
      plannedStartAt: toOtBangkokIso(form.startDate, form.startTime),
      plannedEndAt: toOtBangkokIso(schedule.endDate, form.endTime),
      plannedBreakMinutes: Number(form.breakMinutes || 0),
      plannedWeekSegments: schedule.segments,
      approverUserId: form.approverUserId
    };
  }
  async function previewPlan() {
    if (schedule.valid && !window.FlowMateOtRequestDomain.isBangkokPlannedStartFuture(form.startDate, form.startTime)) {
      setPreviewState({
        status: "error",
        result: null,
        payload: null,
        message: "Request must be submitted before OT starts."
      });
      return;
    }
    if (!baseComplete) {
      setPreviewState({
        status: "error",
        result: null,
        payload: null,
        message: schedule.valid ? "Complete the required fields and select at least one participant." : schedule.message
      });
      return;
    }
    const payload = buildEventPayload();
    setPreviewState({
      status: "loading",
      result: null,
      payload,
      message: "Checking every employee and affected week…"
    });
    try {
      const result = await window.previewOtEventPlan(payload, form.employeeUserIds);
      setPreviewState({
        status: "ready",
        result: result || {},
        payload,
        message: ""
      });
    } catch (error) {
      setPreviewState({
        status: "error",
        result: null,
        payload: null,
        message: error.message || "The event plan could not be previewed."
      });
    }
  }
  const previewEmployees = Array.isArray(previewState.result?.employees) ? previewState.result.employees : [];
  const eligibleEmployeeIds = previewEmployees.filter(employee => employee.canCreate).map(employee => employee.employeeUserId);
  const blockedCount = previewEmployees.length - eligibleEmployeeIds.length;
  const canCreate = previewState.status === "ready" && eligibleEmployeeIds.length > 0 && submitState.status !== "submitting" && submitState.status !== "success";
  async function createPlan(event) {
    event.preventDefault();
    if (schedule.valid && !window.FlowMateOtRequestDomain.isBangkokPlannedStartFuture(form.startDate, form.startTime)) {
      setSubmitState({
        status: "error",
        message: "Request must be submitted before OT starts.",
        result: null
      });
      return;
    }
    if (!canCreate || !previewState.payload) {
      setSubmitState({
        status: "error",
        message: "Preview the current plan and keep at least one employee within 36h before creating it.",
        result: null
      });
      return;
    }
    setIntent(current => ({
      ...current,
      attempted: true
    }));
    setSubmitState({
      status: "submitting",
      message: "Creating individual Awaiting consent assignments…",
      result: null
    });
    const payload = previewState.payload;
    try {
      const result = await window.createOtEventPlan(payload, eligibleEmployeeIds, intent.key);
      const requestCount = Array.isArray(result?.requestIds) ? result.requestIds.length : eligibleEmployeeIds.length;
      setSubmitState({
        status: "success",
        message: `Consent received 0/${requestCount}`,
        result
      });
      setIntent({
        key: crypto.randomUUID(),
        attempted: false
      });
      onSuccess();
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error.message || "The event plan could not be created. No local limit check can override the server transaction.",
        result: null
      });
    }
  }
  if (submitState.status === "success") {
    return React.createElement("div", {
      className: "ot-state",
      role: "status"
    }, React.createElement("strong", null, "Event plan created"), React.createElement("span", null, submitState.message), React.createElement("span", {
      className: "ot-status ot-status--awaiting_consent"
    }, "Awaiting consent"), React.createElement("small", null, "Each included employee has one individual occurrence and must consent separately."));
  }
  return React.createElement("form", {
    className: "ot-form",
    onSubmit: createPlan,
    noValidate: true
  }, React.createElement("fieldset", {
    className: "ot-form__fieldset",
    disabled: submitState.status === "submitting"
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Shared event title *"), React.createElement("input", {
    className: "input",
    value: form.title,
    onChange: event => update("title", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Function *"), React.createElement("select", {
    className: "select",
    value: form.functionCode,
    onChange: event => update("functionCode", event.target.value),
    required: true
  }, React.createElement("option", {
    value: ""
  }, "Select Function"), OT_FUNCTIONS.map(option => React.createElement("option", {
    key: option.value,
    value: option.value
  }, option.label)))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Start date *"), React.createElement("input", {
    className: "input",
    type: "date",
    value: form.startDate,
    onChange: event => update("startDate", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "End date *"), React.createElement("input", {
    className: "input",
    type: "date",
    min: form.startDate,
    value: form.endDate,
    onChange: event => update("endDate", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Start time *"), React.createElement("input", {
    className: "input",
    type: "time",
    value: form.startTime,
    onChange: event => update("startTime", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "End time *"), React.createElement("input", {
    className: "input",
    type: "time",
    value: form.endTime,
    onChange: event => update("endTime", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Break (minutes) *"), React.createElement("input", {
    className: "input",
    type: "number",
    min: "0",
    step: "1",
    value: form.breakMinutes,
    onChange: event => update("breakMinutes", event.target.value),
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Day type *"), React.createElement("select", {
    className: "select",
    value: form.dayType,
    onChange: event => update("dayType", event.target.value)
  }, React.createElement("option", {
    value: "working_day"
  }, "Working day"), React.createElement("option", {
    value: "rest_day"
  }, "Weekly holiday"), React.createElement("option", {
    value: "public_holiday"
  }, "Public holiday"))), schedule.crossesWeek && React.createElement(React.Fragment, null, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Break before week boundary *"), React.createElement("input", {
    className: "input",
    type: "number",
    min: "0",
    step: "1",
    value: form.breakMinutesBeforeBoundary,
    onChange: event => update("breakMinutesBeforeBoundary", event.target.value)
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Break after week boundary *"), React.createElement("input", {
    className: "input",
    type: "number",
    min: "0",
    step: "1",
    value: form.breakMinutesAfterBoundary,
    onChange: event => update("breakMinutesAfterBoundary", event.target.value)
  }))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Location *"), React.createElement("select", {
    className: "select",
    value: form.workLocationType,
    onChange: event => update("workLocationType", event.target.value)
  }, React.createElement("option", {
    value: "venue"
  }, "Venue / off-site"), React.createElement("option", {
    value: "office"
  }, "Office"), React.createElement("option", {
    value: "remote"
  }, "Remote"))), venueRequired && React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Venue *"), React.createElement("input", {
    className: "input",
    value: form.venue,
    onChange: event => update("venue", event.target.value),
    placeholder: "Tournament or event venue",
    required: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Reason *"), React.createElement("select", {
    className: "select",
    value: form.reasonCode,
    onChange: event => update("reasonCode", event.target.value)
  }, window.FlowMateOtRequestDomain.REASON_OPTIONS.map(reason => React.createElement("option", {
    key: reason.key,
    value: reason.key
  }, reason.label)))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Assigned approver *"), React.createElement("select", {
    className: "select",
    value: form.approverUserId,
    onChange: event => update("approverUserId", event.target.value),
    disabled: directoryState.status !== "ready" || !directoryState.approvers.length
  }, React.createElement("option", {
    value: ""
  }, "Select approver"), directoryState.approvers.map(approver => React.createElement("option", {
    key: approver.userId,
    value: approver.userId
  }, approver.displayName || approver.email))), React.createElement("span", {
    className: "field__hint"
  }, "The assigned approver must personally create and authorize the shared plan.")), React.createElement("label", {
    className: "field field--full"
  }, React.createElement("span", {
    className: "field__label"
  }, "Reason detail ", detailRequired ? "*" : "(optional)"), React.createElement("textarea", {
    className: "textarea",
    value: form.reasonDetail,
    onChange: event => update("reasonDetail", event.target.value),
    required: detailRequired
  }))), React.createElement("section", {
    className: "ot-participants",
    "aria-label": "Event participants"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("h3", null, "Participants *"), React.createElement("span", null, form.employeeUserIds.length, " selected")), directoryState.status === "loading" && React.createElement("div", {
    className: "ot-state ot-state--compact",
    role: "status"
  }, "Loading event participants…"), directoryState.status === "error" && React.createElement(OtWarning, {
    kind: "error",
    message: directoryState.message
  }), directoryState.status === "ready" && React.createElement("div", {
    className: "ot-participant-grid"
  }, directoryState.people.map(person => React.createElement("label", {
    key: person.userId,
    className: "ot-participant"
  }, React.createElement("input", {
    type: "checkbox",
    checked: form.employeeUserIds.includes(person.userId),
    onChange: () => toggleEmployee(person.userId)
  }), React.createElement("span", null, React.createElement("strong", null, person.displayName || person.email), React.createElement("small", null, person.requesterTeam || person.email)))))), !schedule.valid && React.createElement(OtWarning, {
    kind: "error",
    title: "Schedule needs attention",
    message: schedule.message
  }), schedule.valid && !plannedStartIsFuture && React.createElement(OtWarning, {
    kind: "error",
    title: "Start time needs attention",
    message: "Request must be submitted before OT starts."
  }), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    disabled: !baseComplete || previewState.status === "loading",
    onClick: previewPlan
  }, previewState.status === "loading" ? "Checking limits…" : "Preview employee limits")), previewState.status === "ready" && React.createElement("section", {
    className: "ot-event-preview",
    "aria-label": "Per employee event limit preview"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("h3", null, "Per-employee projected totals"), React.createElement("span", null, eligibleEmployeeIds.length, " included · ", blockedCount, " excluded")), previewEmployees.map(employee => {
    const person = directoryState.people.find(row => row.userId === employee.employeeUserId);
    return React.createElement("article", {
      key: employee.employeeUserId,
      className: `ot-event-preview__row ${employee.canCreate ? "" : "is-blocked"}`
    }, React.createElement("div", null, React.createElement("strong", null, person?.displayName || person?.email || `Employee ${String(employee.employeeUserId).slice(0, 8)}`), React.createElement("small", null, employee.canCreate ? "Included in plan" : "This employee is excluded because at least one affected week would exceed 36h.")), React.createElement("div", null, (employee.weekChecks || []).map(check => React.createElement("span", {
      key: check.weekStart
    }, React.createElement("b", null, formatOtDate(check.weekStart)), " ", formatOtHours(check.projectedMinutes), " / 36h"))));
  })), blockedCount > 0 && React.createElement(OtWarning, {
    kind: "critical",
    title: "Employees excluded",
    message: "Blocked employee/weeks will not be sent to createOtEventPlan. The server recalculates every included employee inside the creation transaction."
  })), previewState.status === "error" && React.createElement(OtWarning, {
    kind: "error",
    message: previewState.message
  }), submitState.message && React.createElement(OtWarning, {
    kind: submitState.status === "error" ? "error" : "info",
    message: submitState.message
  }), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn--primary",
    disabled: !canCreate
  }, submitState.status === "submitting" ? "Creating assignments…" : `Create plan for ${eligibleEmployeeIds.length} included employee(s)`)));
}
function OtTeamWeekTable({
  requests,
  allRequests,
  peopleById
}) {
  const employeeTotals = getOtManagerTotals(allRequests);
  const sorted = requests.slice().sort((left, right) => {
    const leftFunction = String(otValue(left, "functionCode", "function_code") || "");
    const rightFunction = String(otValue(right, "functionCode", "function_code") || "");
    const functionOrder = OT_FUNCTIONS.findIndex(option => option.value === leftFunction) - OT_FUNCTIONS.findIndex(option => option.value === rightFunction);
    if (functionOrder) return functionOrder;
    return getOtManagerEmployeeName(left, peopleById).localeCompare(getOtManagerEmployeeName(right, peopleById)) || String(left.title || "").localeCompare(String(right.title || ""));
  });
  const groups = [];
  sorted.forEach(request => {
    const functionCode = otValue(request, "functionCode", "function_code") || "unassigned";
    const employeeId = getOtManagerEmployeeId(request);
    let functionGroup = groups.find(group => group.functionCode === functionCode);
    if (!functionGroup) {
      functionGroup = {
        functionCode,
        employees: []
      };
      groups.push(functionGroup);
    }
    let employeeGroup = functionGroup.employees.find(group => group.employeeId === employeeId);
    if (!employeeGroup) {
      employeeGroup = {
        employeeId,
        name: getOtManagerEmployeeName(request, peopleById),
        requests: []
      };
      functionGroup.employees.push(employeeGroup);
    }
    employeeGroup.requests.push(request);
  });
  return React.createElement("section", {
    className: "ot-list",
    "aria-label": "Assigned team weekly OT table"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("h2", null, "Team week by Function"), React.createElement("span", null, requests.length, " authorized occurrence", requests.length === 1 ? "" : "s")), !requests.length ? React.createElement("div", {
    className: "ot-state"
  }, "No assigned OT rows match the current filters.") : React.createElement("div", {
    className: "ot-table-wrap"
  }, React.createElement("table", {
    className: "tbl ot-table ot-team-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Employee"), React.createElement("th", null, "Function"), React.createElement("th", null, "Assignment / event"), React.createElement("th", null, "Schedule"), React.createElement("th", null, "Planned"), React.createElement("th", null, "Actual"), React.createElement("th", null, "Weekly total"), React.createElement("th", null, "Remaining"), React.createElement("th", null, "Status"), React.createElement("th", null, "Reason"))), React.createElement("tbody", null, groups.map(functionGroup => React.createElement(React.Fragment, {
    key: functionGroup.functionCode
  }, React.createElement("tr", {
    className: "ot-table-group"
  }, React.createElement("th", {
    colSpan: "10",
    scope: "rowgroup"
  }, OT_FUNCTIONS.find(option => option.value === functionGroup.functionCode)?.label || String(functionGroup.functionCode).toUpperCase())), functionGroup.employees.map(employeeGroup => employeeGroup.requests.map((request, index) => {
    const total = employeeTotals[employeeGroup.employeeId]?.countedMinutes || 0;
    const remaining = Math.max(0, OT_LIMIT_MINUTES - total);
    return React.createElement("tr", {
      key: request.id
    }, index === 0 && React.createElement("th", {
      rowSpan: employeeGroup.requests.length,
      scope: "row"
    }, React.createElement("strong", null, employeeGroup.name), React.createElement("small", null, employeeGroup.requests.length, " occurrence", employeeGroup.requests.length === 1 ? "" : "s")), React.createElement("td", null, String(functionGroup.functionCode).toUpperCase()), React.createElement("td", null, React.createElement("strong", null, request.title), React.createElement("small", null, otValue(request, "eventPlanId", "event_plan_id") ? "Shared event" : "Individual request")), React.createElement("td", null, formatOtManagerSchedule(request)), React.createElement("td", null, formatOtHours(request.plannedMinutes)), React.createElement("td", null, request.actualMinutes ? formatOtHours(request.actualMinutes) : "—"), React.createElement("td", null, React.createElement("strong", null, formatOtHours(total)), React.createElement(OtLimitProgress, {
      totalMinutes: total
    })), React.createElement("td", null, formatOtHours(remaining)), React.createElement("td", null, React.createElement("span", {
      className: `ot-status ot-status--${getOtRequestStatus(request)}`
    }, getOtStatusLabel(getOtRequestStatus(request)))), React.createElement("td", null, getOtReasonLabel(request)));
  }))))))));
}
function OtMonthlyTeamDetails({
  requests,
  peopleById
}) {
  const rows = requests.slice().sort((left, right) => String(otValue(left, "plannedStartAt", "planned_start_at") || "").localeCompare(String(otValue(right, "plannedStartAt", "planned_start_at") || "")) || getOtManagerEmployeeName(left, peopleById).localeCompare(getOtManagerEmployeeName(right, peopleById)));
  return React.createElement("section", {
    className: "ot-list",
    "aria-label": "Monthly OT details"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, "Monthly OT details"), React.createElement("p", {
    className: "muted"
  }, "Individual records for checking and export. Actual hours appear only after confirmation.")), React.createElement("span", null, rows.length, " occurrence", rows.length === 1 ? "" : "s")), !rows.length ? React.createElement("div", {
    className: "ot-state"
  }, "No OT records match this month.") : React.createElement("div", {
    className: "ot-table-wrap"
  }, React.createElement("table", {
    className: "tbl ot-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Employee"), React.createElement("th", null, "Function"), React.createElement("th", null, "Schedule"), React.createElement("th", null, "Assignment / event"), React.createElement("th", null, "Reason"), React.createElement("th", null, "Planned"), React.createElement("th", null, "Actual"), React.createElement("th", null, "Status"))), React.createElement("tbody", null, rows.map(request => React.createElement("tr", {
    key: request.id
  }, React.createElement("td", null, getOtManagerEmployeeName(request, peopleById)), React.createElement("td", null, String(otValue(request, "functionCode", "function_code") || "").toUpperCase()), React.createElement("td", null, formatOtManagerSchedule(request)), React.createElement("td", null, request.title), React.createElement("td", null, getOtReasonLabel(request)), React.createElement("td", null, formatOtHours(request.plannedMinutes)), React.createElement("td", null, request.actualMinutes ? formatOtHours(request.actualMinutes) : "—"), React.createElement("td", null, React.createElement("span", {
    className: `ot-status ot-status--${getOtRequestStatus(request)}`
  }, getOtStatusLabel(getOtRequestStatus(request))))))))));
}
function buildOtInsightRows(rows, recordIds) {
  const allowedIds = new Set(Array.isArray(recordIds) ? recordIds : []);
  const rowsByRequestId = new Map();
  rows.forEach(request => {
    const requestId = getOtManagerRequestId(request);
    if (!allowedIds.has(requestId)) return;
    const current = rowsByRequestId.get(requestId) || {
      id: requestId,
      requestId,
      title: String(request.title || "Untitled assignment"),
      functionCode: otValue(request, "functionCode", "function_code") || "unassigned",
      reasonCode: otValue(request, "reasonCode", "reason_code") || "other",
      plannedMinutes: 0,
      actualMinutes: 0,
      weekStarts: []
    };
    rowsByRequestId.set(requestId, {
      ...current,
      plannedMinutes: current.plannedMinutes + Number(request.plannedMinutes || 0),
      actualMinutes: current.actualMinutes + Number(request.actualMinutes || 0),
      weekStarts: Array.from(new Set(current.weekStarts.concat(request.weekStart).filter(Boolean))).sort()
    });
  });
  return Array.from(rowsByRequestId.values()).sort((left, right) => left.requestId.localeCompare(right.requestId));
}
function OtRootCausePanel({
  filteredRows,
  currentWeekStart,
  weekStarts,
  filterKey
}) {
  const [selectedInsightState, setSelectedInsightState] = useStateApp(null);
  const selectedInsight = selectedInsightState?.filterKey === filterKey ? selectedInsightState.insight : null;
  const confirmedRows = filteredRows.filter(isOtActualConfirmed);
  const insights = window.FlowMateOtRequestDomain.buildRootCauseInsights(filteredRows, {
    currentWeekStart
  });
  const weeklyTrend = window.FlowMateOtRequestDomain.buildOtWeeklyTrend(filteredRows, weekStarts);
  const concentration = window.FlowMateOtRequestDomain.buildOtWorkloadConcentration(filteredRows);
  const analytics = {
    weeklyTrend,
    ...concentration
  };
  const functionTotals = confirmedRows.reduce((totals, request) => {
    const key = otValue(request, "functionCode", "function_code") || "unassigned";
    totals[key] = (totals[key] || 0) + Number(request.actualMinutes || 0);
    return totals;
  }, {});
  const reasonTotals = confirmedRows.reduce((totals, request) => {
    const key = otValue(request, "reasonCode", "reason_code") || "other";
    totals[key] = (totals[key] || 0) + Number(request.actualMinutes || 0);
    return totals;
  }, {});
  const totalActual = confirmedRows.reduce((sum, request) => sum + Number(request.actualMinutes || 0), 0);
  const totalPlanned = confirmedRows.reduce((sum, request) => sum + Number(request.plannedMinutes || 0), 0);
  const emergencyMinutes = confirmedRows.filter(request => otValue(request, "reasonCode", "reason_code") === "live_incident").reduce((sum, request) => sum + Number(request.actualMinutes || 0), 0);
  const plannedMinutes = Math.max(0, totalActual - emergencyMinutes);
  const recurringWeeks = window.FlowMateOtRequestDomain.countWeeksWithActualMinutes(confirmedRows);
  const insightCopy = {
    function_confirmed_ot_change: "Function confirmed OT changed at least 25% against the prior four-week average.",
    event_actual_exceeds_plan: "A shared event's actual OT exceeded its plan by at least 20%.",
    emergency_ot_share: "Emergency OT represents at least 30% of confirmed OT for a Function.",
    recurring_rework_or_scope_change: "Rework or scope change appeared at least three times within four weeks."
  };
  const selectedRows = selectedInsight ? buildOtInsightRows(filteredRows, selectedInsight.recordIds) : [];
  return React.createElement("section", {
    className: "ot-root-cause",
    "aria-labelledby": "ot-root-cause-title"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", {
    id: "ot-root-cause-title"
  }, "OT Health & Root Cause"), React.createElement("p", {
    className: "muted"
  }, "Operational patterns by reason, Function, event, and week. Current filters stay applied to every drill-down.")), React.createElement("span", null, confirmedRows.length, " confirmed rows")), React.createElement("section", {
    className: "ot-analytics-grid",
    "aria-label": "Confirmed OT operational analytics"
  }, React.createElement("article", {
    className: "ot-analytics-card",
    "aria-labelledby": "ot-weekly-trend-title"
  }, React.createElement("h3", {
    id: "ot-weekly-trend-title"
  }, "Confirmed OT trend — latest 5 Bangkok weeks"), React.createElement("p", {
    className: "muted"
  }, "Approved Actual time only. Zero-minute weeks remain visible for an honest five-week comparison."), React.createElement("div", {
    className: "ot-table-wrap"
  }, React.createElement("table", {
    className: "ot-analytics-table"
  }, React.createElement("caption", null, "Approved Actual hours by Bangkok week"), React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    scope: "col"
  }, "Bangkok week"), React.createElement("th", {
    scope: "col"
  }, "Confirmed Actual"))), React.createElement("tbody", null, analytics.weeklyTrend.map(row => React.createElement("tr", {
    key: row.weekStart
  }, React.createElement("th", {
    scope: "row"
  }, formatOtDate(row.weekStart)), React.createElement("td", null, formatOtHours(row.actualMinutes)))))))), React.createElement("article", {
    className: "ot-analytics-card",
    "aria-labelledby": "ot-workload-concentration-title"
  }, React.createElement("h3", {
    id: "ot-workload-concentration-title"
  }, "Workload concentration by Function / assignment"), React.createElement("p", {
    className: "muted"
  }, "Operational workload only—this view never evaluates or compares people."), React.createElement("div", {
    className: "ot-concentration-grid"
  }, React.createElement("section", {
    "aria-labelledby": "ot-function-concentration-title"
  }, React.createElement("h4", {
    id: "ot-function-concentration-title"
  }, "By Function"), React.createElement("div", {
    className: "ot-table-wrap"
  }, React.createElement("table", {
    className: "ot-analytics-table"
  }, React.createElement("caption", null, "Approved Actual workload share by Function"), React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    scope: "col"
  }, "Function"), React.createElement("th", {
    scope: "col"
  }, "Hours"), React.createElement("th", {
    scope: "col"
  }, "Share"))), React.createElement("tbody", null, analytics.byFunction.length ? analytics.byFunction.map(row => React.createElement("tr", {
    key: row.key
  }, React.createElement("th", {
    scope: "row"
  }, OT_FUNCTIONS.find(option => option.value === row.key)?.label || row.key.toUpperCase()), React.createElement("td", null, formatOtHours(row.actualMinutes)), React.createElement("td", null, Math.round(row.share * 100), "%"))) : React.createElement("tr", null, React.createElement("td", {
    colSpan: "3"
  }, "No approved Actual workload.")))))), React.createElement("section", {
    "aria-labelledby": "ot-assignment-concentration-title"
  }, React.createElement("h4", {
    id: "ot-assignment-concentration-title"
  }, "By assignment / event"), React.createElement("div", {
    className: "ot-table-wrap"
  }, React.createElement("table", {
    className: "ot-analytics-table"
  }, React.createElement("caption", null, "Approved Actual workload share by operational assignment or event"), React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    scope: "col"
  }, "Assignment / event"), React.createElement("th", {
    scope: "col"
  }, "Hours"), React.createElement("th", {
    scope: "col"
  }, "Share"))), React.createElement("tbody", null, analytics.byAssignment.length ? analytics.byAssignment.map(row => React.createElement("tr", {
    key: row.key
  }, React.createElement("th", {
    scope: "row"
  }, row.label), React.createElement("td", null, formatOtHours(row.actualMinutes)), React.createElement("td", null, Math.round(row.share * 100), "%"))) : React.createElement("tr", null, React.createElement("td", {
    colSpan: "3"
  }, "No approved Actual workload."))))))))), !confirmedRows.length ? React.createElement("div", {
    className: "ot-state"
  }, "No confirmed OT rows match the current authorized filters.") : React.createElement(React.Fragment, null, React.createElement("section", {
    className: "ot-root-summary",
    "aria-label": "Root cause summary"
  }, React.createElement("div", null, React.createElement("span", null, "Planned share"), React.createElement("strong", null, totalActual ? `${Math.round(plannedMinutes / totalActual * 100)}%` : "0%")), React.createElement("div", null, React.createElement("span", null, "Emergency share"), React.createElement("strong", null, totalActual ? `${Math.round(emergencyMinutes / totalActual * 100)}%` : "0%")), React.createElement("div", null, React.createElement("span", null, "Plan / actual variance"), React.createElement("strong", null, window.FlowMateOtRequestDomain.formatSignedHours(totalActual - totalPlanned))), React.createElement("div", null, React.createElement("span", null, "Recurring weeks"), React.createElement("strong", null, recurringWeeks))), React.createElement("section", {
    className: "ot-root-grid"
  }, React.createElement("article", {
    className: "ot-root-card"
  }, React.createElement("h3", null, OT_ROOT_CAUSE_LABELS[0]), Object.entries(functionTotals).sort((left, right) => left[0].localeCompare(right[0])).map(([functionCode, minutes]) => React.createElement("div", {
    className: "ot-root-bar",
    key: functionCode
  }, React.createElement("span", null, OT_FUNCTIONS.find(option => option.value === functionCode)?.label || functionCode.toUpperCase()), React.createElement("div", null, React.createElement("i", {
    style: {
      width: `${totalActual ? Math.max(4, Math.round(minutes / totalActual * 100)) : 0}%`
    }
  })), React.createElement("strong", null, formatOtHours(minutes))))), React.createElement("article", {
    className: "ot-root-card"
  }, React.createElement("h3", null, OT_ROOT_CAUSE_LABELS[1]), Object.entries(reasonTotals).sort((left, right) => right[1] - left[1]).map(([reasonCode, minutes]) => React.createElement("div", {
    className: "ot-root-bar",
    key: reasonCode
  }, React.createElement("span", null, window.FlowMateOtRequestDomain.REASON_OPTIONS.find(reason => reason.key === reasonCode)?.label || getOtStatusLabel(reasonCode)), React.createElement("div", null, React.createElement("i", {
    style: {
      width: `${totalActual ? Math.max(4, Math.round(minutes / totalActual * 100)) : 0}%`
    }
  })), React.createElement("strong", null, formatOtHours(minutes)))))), React.createElement("section", {
    className: "ot-insights",
    "aria-label": "Deterministic OT insights"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("h3", null, "Approved operational checks"), React.createElement("span", null, insights.length, " signal", insights.length === 1 ? "" : "s")), !insights.length ? React.createElement("div", {
    className: "ot-state ot-state--compact"
  }, "No deterministic rule is triggered by the confirmed rows in this scope.") : insights.map((insight, index) => React.createElement("article", {
    className: "ot-insight",
    key: `${insight.key}:${index}`
  }, React.createElement("div", null, React.createElement("strong", null, insightCopy[insight.key] || insight.message), React.createElement("small", null, insight.message)), React.createElement("button", {
    type: "button",
    className: "btn btn--sm btn--secondary",
    onClick: () => setSelectedInsightState({
      filterKey,
      insight
    })
  }, "View authorized rows"))))), selectedInsight && React.createElement("section", {
    className: "ot-manager-detail",
    "aria-label": "Authorized root cause drill-down"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("h3", null, "Authorized operational rows behind this signal"), React.createElement("button", {
    type: "button",
    className: "btn btn--ghost",
    onClick: () => setSelectedInsightState(null)
  }, "Close")), React.createElement("p", {
    className: "muted"
  }, "Current filters stay applied. Only operational facts already returned by the assigned-scope manager RPC are shown; employee identities are omitted."), selectedRows.map(request => React.createElement("article", {
    className: "ot-insight-row",
    key: request.id
  }, React.createElement("div", null, React.createElement("strong", null, request.title), React.createElement("small", null, String(request.functionCode || "unassigned").toUpperCase(), " · ", getOtStatusLabel(request.reasonCode), " · ", request.weekStarts.map(formatOtDate).join(", "))), React.createElement("span", null, formatOtHours(request.actualMinutes))))));
}
function formatOtDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
function OtActualAmendmentAction({
  access,
  request,
  onChanged
}) {
  const [reason, setReason] = useStateApp("");
  const [intent, setIntent] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({
    status: "idle",
    message: ""
  });
  const submissionRef = useRefApp(false);
  const canAmend = window.FlowMateOtRequestDomain.canRequestActualAmendment(access, request);
  const requestId = request ? getOtManagerRequestId(request) : "";
  function updateReason(value) {
    if (submissionRef.current || actionState.status === "submitting") return;
    setReason(value);
    if (actionState.status !== "idle") setActionState({
      status: "idle",
      message: ""
    });
  }
  async function requestCorrection(event) {
    event.preventDefault();
    if (!canAmend || submissionRef.current || actionState.status === "submitting") return;
    if (!reason.trim()) {
      setActionState({
        status: "error",
        message: "A correction reason is required."
      });
      return;
    }
    const normalizedReason = reason.trim();
    const signature = window.FlowMateOtIntent.signature([requestId, normalizedReason]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    submissionRef.current = true;
    setActionState({
      status: "submitting",
      message: "Requesting an audited actual correction…"
    });
    try {
      await window.requestOtActualAmendment(requestId, normalizedReason, currentIntent.key);
      setIntent(window.FlowMateOtIntent.complete());
      setReason("");
      setActionState({
        status: "success",
        message: "Actual correction requested. The employee can now submit corrected actual time."
      });
      if (onChanged) onChanged();
    } catch (error) {
      setActionState({
        status: "error",
        message: error.message || "Actual correction could not be requested. Retry uses the same action key."
      });
    } finally {
      submissionRef.current = false;
    }
  }
  if (!canAmend) return null;
  return React.createElement("form", {
    className: "ot-workflow",
    "aria-label": "Request actual correction",
    onSubmit: requestCorrection
  }, React.createElement("fieldset", {
    className: "ot-form__fieldset",
    disabled: actionState.status === "submitting"
  }, React.createElement("h3", null, "Request correction of approved actual"), React.createElement("p", {
    className: "muted"
  }, "The existing actual time remains in audit until the employee submits a correction."), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Correction reason *"), React.createElement("textarea", {
    className: "textarea",
    value: reason,
    onChange: event => updateReason(event.target.value),
    required: true,
    placeholder: "Explain why the approved actual needs correction."
  })), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn--secondary",
    disabled: !reason.trim() || actionState.status === "submitting"
  }, actionState.status === "submitting" ? "Requesting correction…" : "Request actual correction"))), actionState.message && React.createElement(OtWarning, {
    kind: actionState.status === "error" ? "error" : "info",
    message: actionState.message
  }));
}
function OtAuditTimeline({
  requestId: providedRequestId = "",
  refreshKey = 0
}) {
  const [requestIdInput, setRequestIdInput] = useStateApp("");
  const [submittedRequestId, setSubmittedRequestId] = useStateApp("");
  const [filters, setFilters] = useStateApp({
    query: "",
    action: ""
  });
  const [loadState, setLoadState] = useStateApp({
    status: "idle",
    rows: [],
    message: ""
  });
  const requestId = providedRequestId || submittedRequestId;
  useEffectApp(() => {
    if (!requestId) {
      setLoadState({
        status: "idle",
        rows: [],
        message: ""
      });
      return undefined;
    }
    let alive = true;
    setLoadState(current => ({
      ...current,
      status: "loading",
      message: ""
    }));
    window.loadOtRequestAudit(requestId).then(rows => {
      if (alive) setLoadState({
        status: "ready",
        rows: Array.isArray(rows) ? rows : [],
        message: ""
      });
    }).catch(error => {
      if (alive) setLoadState({
        status: "error",
        rows: [],
        message: error.message || "OT audit could not be loaded."
      });
    });
    return () => {
      alive = false;
    };
  }, [requestId, refreshKey]);
  const normalizedRows = loadState.rows.map(row => ({
    ...row,
    actorUserId: otValue(row, "actorUserId", "actor_user_id") || "Unknown actor",
    action: otValue(row, "action", "action") || "unknown_action",
    oldStatus: otValue(row, "oldStatus", "old_status") || "—",
    newStatus: otValue(row, "newStatus", "new_status") || "—",
    changedFields: otValue(row, "changedFields", "changed_fields") || {},
    note: otValue(row, "note", "note") || "—",
    createdAt: otValue(row, "createdAt", "created_at")
  }));
  const actionOptions = Array.from(new Set(normalizedRows.map(row => row.action))).sort();
  const query = filters.query.trim().toLowerCase();
  const visibleRows = normalizedRows.filter(row => {
    const haystack = [row.actorUserId, row.action, row.oldStatus, row.newStatus, row.note, row.createdAt, JSON.stringify(row.changedFields)].join(" ").toLowerCase();
    return (!filters.action || row.action === filters.action) && (!query || haystack.includes(query));
  });
  function submitRequestId(event) {
    event.preventDefault();
    setSubmittedRequestId(requestIdInput.trim());
  }
  return React.createElement("section", {
    className: "ot-audit ot-list",
    "aria-label": "Read-only OT request audit"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, "Immutable audit trail"), React.createElement("p", {
    className: "muted"
  }, "Read-only actor, action, status, field, reason, and timestamp history returned by the authorized audit RPC.")), requestId && React.createElement("span", null, requestId)), !providedRequestId && React.createElement("form", {
    className: "ot-audit__lookup",
    onSubmit: submitRequestId
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Request ID"), React.createElement("input", {
    className: "input",
    value: requestIdInput,
    onChange: event => setRequestIdInput(event.target.value),
    placeholder: "Paste an authorized OT request ID",
    required: true
  })), React.createElement("button", {
    type: "submit",
    className: "btn btn--secondary"
  }, "Load audit")), requestId && React.createElement("section", {
    className: "ot-audit__filters",
    "aria-label": "Audit filters"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Search actor, reason, or changed field"), React.createElement("input", {
    className: "input",
    type: "search",
    value: filters.query,
    onChange: event => setFilters(current => ({
      ...current,
      query: event.target.value
    }))
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Action"), React.createElement("select", {
    className: "select",
    value: filters.action,
    onChange: event => setFilters(current => ({
      ...current,
      action: event.target.value
    }))
  }, React.createElement("option", {
    value: ""
  }, "All actions"), actionOptions.map(action => React.createElement("option", {
    key: action,
    value: action
  }, getOtStatusLabel(action)))))), loadState.status === "loading" && React.createElement("div", {
    className: "ot-state ot-state--compact",
    role: "status"
  }, "Loading immutable audit entries…"), loadState.status === "error" && React.createElement(OtWarning, {
    kind: "error",
    message: loadState.message
  }), loadState.status === "idle" && React.createElement("div", {
    className: "ot-state ot-state--compact"
  }, "Choose a request from compliance review, or enter an authorized request ID."), loadState.status === "ready" && !visibleRows.length && React.createElement("div", {
    className: "ot-state ot-state--compact"
  }, "No audit entries match the current filters."), loadState.status === "ready" && !!visibleRows.length && React.createElement("ol", {
    className: "ot-audit__timeline"
  }, visibleRows.map(row => React.createElement("li", {
    key: row.id
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("strong", null, getOtStatusLabel(row.action)), React.createElement("small", null, "Actor ", row.actorUserId)), React.createElement("time", {
    dateTime: row.createdAt
  }, formatOtDateTime(row.createdAt))), React.createElement("div", {
    className: "ot-audit__status"
  }, React.createElement("span", null, getOtStatusLabel(row.oldStatus)), React.createElement("b", {
    "aria-hidden": "true"
  }, "→"), React.createElement("span", null, getOtStatusLabel(row.newStatus))), React.createElement("dl", null, React.createElement("div", null, React.createElement("dt", null, "Changed fields"), React.createElement("dd", null, Object.keys(row.changedFields).length ? JSON.stringify(row.changedFields) : "No field payload")), React.createElement("div", null, React.createElement("dt", null, "Reason / note"), React.createElement("dd", null, row.note)))))));
}
function OtComplianceQueue({
  access,
  refreshKey = 0,
  onChanged
}) {
  const [weekStart, setWeekStart] = useStateApp("");
  const [localRefreshKey, setLocalRefreshKey] = useStateApp(0);
  const [loadState, setLoadState] = useStateApp({
    status: "loading",
    rows: [],
    peopleById: {},
    weeklyTotals: {},
    message: ""
  });
  const [selected, setSelected] = useStateApp(null);
  const [outcome, setOutcome] = useStateApp("");
  const [note, setNote] = useStateApp("");
  const [intent, setIntent] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({
    status: "idle",
    message: ""
  });
  const reviewSubmissionRef = useRefApp(false);
  useEffectApp(() => {
    let alive = true;
    setLoadState(current => ({
      ...current,
      status: "loading",
      message: ""
    }));
    Promise.all([window.loadOtComplianceQueue(weekStart || null), window.loadOtPeopleForEvent()]).then(async ([queue, people]) => {
      const rows = Array.isArray(queue) ? queue : [];
      const weeks = Array.from(new Set(rows.flatMap(row => getOtWeekSegments(row, "actual").map(segment => segment.weekStart)).filter(Boolean))).sort();
      const dashboards = await Promise.all(weeks.map(affectedWeek => window.loadOtManagerDashboard(affectedWeek, null)));
      if (!alive) return;
      const normalized = dashboards.flatMap((dashboard, index) => (Array.isArray(dashboard?.requests) ? dashboard.requests : []).map(row => normalizeOtManagerRow(row, weeks[index])));
      const peopleById = (Array.isArray(people) ? people : []).reduce((lookup, person) => ({
        ...lookup,
        [person.userId]: person
      }), {});
      const weeklyTotals = getOtManagerTotals(normalized, true);
      setLoadState({
        status: "ready",
        rows,
        peopleById,
        weeklyTotals,
        message: ""
      });
      setSelected(current => rows.find(row => row.id === current?.id) || null);
    }).catch(error => {
      if (alive) setLoadState(current => ({
        ...current,
        status: "error",
        message: error.message || "Compliance queue could not be loaded."
      }));
    });
    return () => {
      alive = false;
    };
  }, [weekStart, localRefreshKey, refreshKey]);
  function openReview(request) {
    if (reviewSubmissionRef.current || actionState.status === "submitting") return;
    setSelected(request);
    setOutcome("");
    setNote("");
    setIntent(window.FlowMateOtIntent.complete());
    setActionState({
      status: "idle",
      message: ""
    });
  }
  function closeReview() {
    if (reviewSubmissionRef.current || actionState.status === "submitting") return;
    setSelected(null);
    setIntent(window.FlowMateOtIntent.complete());
  }
  async function submitReview() {
    if (!selected || reviewSubmissionRef.current || actionState.status === "submitting") return;
    if (!outcome || !note.trim()) {
      setActionState({
        status: "error",
        message: "Outcome and review note are required."
      });
      return;
    }
    const requestId = selected.id;
    const normalizedNote = note.trim();
    const signature = window.FlowMateOtIntent.signature([requestId, outcome, normalizedNote]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    reviewSubmissionRef.current = true;
    setActionState({
      status: "submitting",
      message: "Saving the compliance outcome and immutable audit entry…"
    });
    try {
      await window.reviewOtCompliance(requestId, outcome, normalizedNote, currentIntent.key);
      setIntent(window.FlowMateOtIntent.complete());
      setActionState({
        status: "success",
        message: "Compliance review saved. Dashboard, audit, and HR-ready data are refreshing."
      });
      setLocalRefreshKey(value => value + 1);
      if (onChanged) onChanged();
    } catch (error) {
      setActionState({
        status: "error",
        message: error.message || "Compliance review could not be saved."
      });
    } finally {
      reviewSubmissionRef.current = false;
    }
  }
  const actualStartAt = selected && otValue(selected, "actualStartAt", "actual_start_at");
  const actualEndAt = selected && otValue(selected, "actualEndAt", "actual_end_at");
  const plannedStartAt = selected && otValue(selected, "plannedStartAt", "planned_start_at");
  const plannedEndAt = selected && otValue(selected, "plannedEndAt", "planned_end_at");
  const actualMinutes = Number(selected && otValue(selected, "actualMinutes", "actual_minutes") || 0);
  const plannedMinutes = Number(selected && otValue(selected, "plannedMinutes", "planned_minutes") || 0);
  const actualWeekSegments = selected ? getOtWeekSegments(selected, "actual") : [];
  const actualVarianceReason = selected && otValue(selected, "actualVarianceReason", "actual_variance_reason");
  const actualDecision = selected && otValue(selected, "actualDecision", "actual_decision");
  const actualDecisionNote = selected && otValue(selected, "actualDecisionNote", "actual_decision_note");
  const selectedEmployeeId = selected && getOtManagerEmployeeId(selected);
  const weeklyTotals = actualWeekSegments.map(segment => ({
    weekStart: segment.weekStart,
    occurrenceMinutes: Number(segment.minutes || 0),
    actualMinutes: loadState.weeklyTotals[`${selectedEmployeeId}:${segment.weekStart}`]?.actualMinutes || 0,
    projectedMinutes: loadState.weeklyTotals[`${selectedEmployeeId}:${segment.weekStart}`]?.countedMinutes || 0
  }));
  return React.createElement("div", {
    className: "ot-compliance"
  }, React.createElement("section", {
    className: "ot-toolbar"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Affected week (optional)"), React.createElement("input", {
    className: "input",
    type: "date",
    value: weekStart,
    disabled: actionState.status === "submitting",
    onChange: event => setWeekStart(event.target.value ? window.FlowMateOtRequestDomain.getWeekStartKey(event.target.value) : "")
  })), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    disabled: actionState.status === "submitting",
    onClick: () => setLocalRefreshKey(value => value + 1)
  }, "Refresh compliance")), React.createElement("section", {
    className: "ot-list",
    "aria-label": "Compliance review queue"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, "Compliance review"), React.createElement("p", {
    className: "muted"
  }, "Truthful actual time is read-only. Review records an outcome and note; it never rewrites worked hours.")), React.createElement("span", null, loadState.rows.length, " case", loadState.rows.length === 1 ? "" : "s")), loadState.status === "loading" && React.createElement("div", {
    className: "ot-state",
    role: "status"
  }, "Loading compliance cases…"), loadState.status === "error" && React.createElement(OtWarning, {
    kind: "error",
    message: loadState.message
  }), loadState.status === "ready" && !loadState.rows.length && React.createElement("div", {
    className: "ot-state"
  }, "No records currently require compliance review."), loadState.status === "ready" && !!loadState.rows.length && React.createElement("div", {
    className: "ot-queue-list"
  }, loadState.rows.map(request => React.createElement("button", {
    key: request.id,
    type: "button",
    className: `ot-queue-item ${selected?.id === request.id ? "is-selected" : ""}`,
    disabled: actionState.status === "submitting",
    onClick: () => openReview(request)
  }, React.createElement("span", null, React.createElement("strong", null, request.title), React.createElement("small", null, getOtManagerEmployeeName(request, loadState.peopleById), " · ", String(otValue(request, "functionCode", "function_code") || "").toUpperCase())), React.createElement("span", {
    className: "ot-status ot-status--compliance_review_required"
  }, "Review"))))), selected && React.createElement("section", {
    className: "ot-compliance__review ot-workflow",
    "aria-label": "Compliance evidence and decision"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, selected.title), React.createElement("p", {
    className: "muted"
  }, "Request ", selected.id)), React.createElement("button", {
    type: "button",
    className: "btn btn--ghost",
    disabled: actionState.status === "submitting",
    onClick: closeReview
  }, "Close")), React.createElement("div", {
    className: "ot-detail-grid"
  }, React.createElement("div", null, React.createElement("span", null, "Employee"), React.createElement("strong", null, getOtManagerEmployeeName(selected, loadState.peopleById))), React.createElement("div", null, React.createElement("span", null, "Plan"), React.createElement("strong", null, formatOtDateTime(plannedStartAt), " → ", formatOtDateTime(plannedEndAt)), React.createElement("small", null, formatOtHours(plannedMinutes))), React.createElement("div", null, React.createElement("span", null, "Truthful actual"), React.createElement("strong", null, formatOtDateTime(actualStartAt), " → ", formatOtDateTime(actualEndAt)), React.createElement("small", null, formatOtHours(actualMinutes))), React.createElement("div", null, React.createElement("span", null, "Signed variance"), React.createElement("strong", null, window.FlowMateOtRequestDomain.formatSignedHours(actualMinutes - plannedMinutes))), React.createElement("div", null, React.createElement("span", null, "Employee explanation"), React.createElement("strong", null, actualVarianceReason || "Not provided")), React.createElement("div", null, React.createElement("span", null, "Manager decision / note"), React.createElement("strong", null, getOtStatusLabel(actualDecision || "pending"), " · ", actualDecisionNote || "Not provided"))), React.createElement("section", {
    className: "ot-compliance__weeks",
    "aria-label": "Affected week totals"
  }, React.createElement("h3", null, "Affected week totals"), weeklyTotals.map(row => React.createElement("article", {
    key: row.weekStart
  }, React.createElement("div", null, React.createElement("strong", null, "Week of ", formatOtDate(row.weekStart)), React.createElement("small", null, "This occurrence: ", formatOtHours(row.occurrenceMinutes))), React.createElement("div", null, React.createElement("strong", null, "Actual ", formatOtHours(row.actualMinutes), " / 36h"), React.createElement("small", null, "Projected / counted: ", formatOtHours(row.projectedMinutes)), React.createElement(OtLimitProgress, {
    totalMinutes: row.actualMinutes
  }))))), React.createElement(OtWarning, {
    kind: "critical",
    title: "Actual hours are immutable",
    message: "Record the compliance outcome against the truthful worked time. Do not ask the employee to reduce actual hours to fit the weekly limit."
  }), React.createElement("fieldset", {
    className: "ot-form__fieldset",
    disabled: actionState.status === "submitting"
  }, React.createElement("div", {
    className: "form-grid"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Outcome *"), React.createElement("select", {
    className: "select",
    value: outcome,
    onChange: event => setOutcome(event.target.value),
    required: true
  }, React.createElement("option", {
    value: ""
  }, "Select outcome"), React.createElement("option", {
    value: "approved"
  }, "Approved"), React.createElement("option", {
    value: "cleared"
  }, "Cleared"), React.createElement("option", {
    value: "action_required"
  }, "Action required"), React.createElement("option", {
    value: "rejected"
  }, "Rejected"))), React.createElement("label", {
    className: "field field--full"
  }, React.createElement("span", {
    className: "field__label"
  }, "Compliance review note *"), React.createElement("textarea", {
    className: "textarea",
    value: note,
    onChange: event => setNote(event.target.value),
    required: true,
    placeholder: "Record the evidence, decision, and follow-up."
  })))), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    disabled: !outcome || !note.trim() || actionState.status === "submitting",
    onClick: submitReview
  }, actionState.status === "submitting" ? "Saving review…" : "Save compliance review")), actionState.message && React.createElement(OtWarning, {
    kind: actionState.status === "error" ? "error" : "info",
    message: actionState.message
  }), React.createElement(OtAuditTimeline, {
    requestId: selected.id,
    refreshKey: localRefreshKey + refreshKey
  })), selected && React.createElement(OtActualAmendmentAction, {
    key: getOtManagerRequestId(selected),
    access: access,
    request: selected,
    onChanged: () => {
      setSelected(null);
      setLocalRefreshKey(value => value + 1);
      if (onChanged) onChanged();
    }
  }));
}
function downloadOtHrCsv(csv, batchName) {
  const safeName = String(batchName || "ot-hr-export").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "ot-hr-export";
  const blob = new Blob(["\ufeff", csv], {
    type: "text/csv;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = `${safeName}.csv`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    return true;
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}
function buildOtInsightPreviewRows(reportMonth) {
  const weeks = getOtMonthWeekStarts(reportMonth);
  const samples = [["Aof", "ops", "Match operations", "live_incident", 180], ["Folk", "ops", "Player support", "other", 120], ["May", "mkt", "Campaign launch", "scope_change", 240], ["Pim", "gdve", "Creative delivery", "rework", 150], ["Nok", "esport", "Tournament support", "live_incident", 210], ["Aof", "ops", "Post-event review", "other", 90]];
  return samples.map(([employeeDisplayName, functionCode, title, reasonCode, actualMinutes], index) => ({
    id: `preview-${reportMonth}-${index}`,
    requestId: `preview-${reportMonth}-${index}`,
    weekStart: weeks[index % Math.max(1, weeks.length)] || `${reportMonth}-01`,
    employeeUserId: `preview-user-${index}`,
    employeeDisplayName,
    functionCode,
    title,
    reasonCode,
    actualMinutes,
    actualDecision: "approved",
    status: "hr_ready"
  }));
}
function OtOwnerInsightsPanel({
  refreshKey = 0
}) {
  const [reportMonth, setReportMonth] = useStateApp(() => {
    const currentMonth = getCurrentOtMonthKey();
    return currentMonth >= OT_DISPLAY_MONTH_START && currentMonth <= OT_DISPLAY_MONTH_END ? currentMonth : OT_DISPLAY_MONTH_START;
  });
  const [localRefreshKey, setLocalRefreshKey] = useStateApp(0);
  const [loadState, setLoadState] = useStateApp({
    status: "loading",
    rows: [],
    peopleById: {},
    message: ""
  });
  const [previewMode, setPreviewMode] = useStateApp(false);
  useEffectApp(() => {
    let alive = true;
    const weeks = getOtMonthWeekStarts(reportMonth);
    setLoadState({
      status: "loading",
      rows: [],
      peopleById: {},
      message: ""
    });
    Promise.all([Promise.all(weeks.map(weekStart => window.loadOtManagerDashboard(weekStart, null))), window.loadOtPeopleForEvent()]).then(([dashboards, people]) => {
      if (!alive) return;
      const rows = dashboards.flatMap((dashboard, index) => (Array.isArray(dashboard?.requests) ? dashboard.requests : []).map(request => normalizeOtManagerRow(request, weeks[index]))).filter(isOtRequestInDisplayYear);
      const peopleById = (Array.isArray(people) ? people : []).reduce((lookup, person) => {
        lookup[person.userId] = person;
        return lookup;
      }, {});
      setLoadState({
        status: "ready",
        rows,
        peopleById,
        message: ""
      });
    }).catch(error => {
      if (alive) setLoadState({
        status: "error",
        rows: [],
        peopleById: {},
        message: error.message || "OT insights could not be loaded."
      });
    });
    return () => {
      alive = false;
    };
  }, [reportMonth, localRefreshKey, refreshKey]);
  if (loadState.status === "loading") return React.createElement("div", {
    className: "ot-state",
    role: "status"
  }, "Loading OT insights…");
  if (loadState.status === "error") return React.createElement("div", {
    className: "ot-state",
    role: "alert"
  }, React.createElement("strong", null, "OT insights could not be loaded."), React.createElement("span", null, loadState.message), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: () => setLocalRefreshKey(value => value + 1)
  }, "Retry"));
  const insightRows = previewMode ? buildOtInsightPreviewRows(reportMonth) : loadState.rows;
  const confirmedRows = insightRows.filter(isOtActualConfirmed);
  const weekStarts = getOtMonthWeekStarts(reportMonth);
  const weeklyTrend = weekStarts.map(weekStart => ({
    weekStart,
    actualMinutes: confirmedRows.filter(row => row.weekStart === weekStart).reduce((sum, row) => sum + Number(row.actualMinutes || 0), 0)
  }));
  const maxTrendMinutes = Math.max(1, ...weeklyTrend.map(row => row.actualMinutes));
  const functionRows = OT_FUNCTIONS.map(option => ({
    ...option,
    actualMinutes: confirmedRows.filter(row => String(otValue(row, "functionCode", "function_code") || "").toLowerCase() === option.value).reduce((sum, row) => sum + Number(row.actualMinutes || 0), 0)
  })).filter(row => row.actualMinutes > 0);
  const maxFunctionMinutes = Math.max(1, ...functionRows.map(row => row.actualMinutes));
  const peopleRows = Array.from(confirmedRows.reduce((lookup, row) => {
    const employeeId = getOtManagerEmployeeId(row);
    const current = lookup.get(employeeId) || {
      employeeId,
      employee: getOtManagerEmployeeName(row, loadState.peopleById),
      functions: new Set(),
      actualMinutes: 0,
      requests: new Set()
    };
    current.functions.add(String(otValue(row, "functionCode", "function_code") || "").toUpperCase());
    current.actualMinutes += Number(row.actualMinutes || 0);
    current.requests.add(getOtManagerRequestId(row));
    lookup.set(employeeId, current);
    return lookup;
  }, new Map()).values()).map(row => ({
    ...row,
    functions: Array.from(row.functions).filter(Boolean).join(", "),
    requestCount: row.requests.size
  })).sort((left, right) => right.actualMinutes - left.actualMinutes || left.employee.localeCompare(right.employee));
  return React.createElement("div", {
    className: "ot-manager"
  }, React.createElement("section", {
    className: "ot-manager-scope",
    "aria-label": "Owner OT insight scope"
  }, React.createElement("strong", null, "2026 Owner-only OT insight"), React.createElement("span", null, "Charts use only named OT records returned by the Owner server scope. Values are labelled directly; no hover is required.")), React.createElement("section", {
    className: "ot-manager-filters",
    "aria-label": "OT insight filters"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Report month"), React.createElement("input", {
    className: "input",
    type: "month",
    min: "2026-01",
    max: "2026-12",
    value: reportMonth,
    onChange: event => setReportMonth(event.target.value || OT_DISPLAY_MONTH_START)
  })), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: () => setLocalRefreshKey(value => value + 1)
  }, "Refresh insights"), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    "aria-pressed": previewMode,
    onClick: () => setPreviewMode(value => !value)
  }, previewMode ? "Show live data" : "Preview sample data")), previewMode && React.createElement(OtWarning, {
    kind: "info",
    title: "Preview data",
    message: "Preview data — sample only; exports and live data remain unchanged."
  }), React.createElement("section", {
    className: "ot-analytics-card",
    "aria-label": "Confirmed OT trend chart"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, "Confirmed OT trend"), React.createElement("p", {
    className: "muted"
  }, "Actual hours confirmed in each Bangkok week of the selected month."))), React.createElement("div", {
    className: "ot-root-grid"
  }, weeklyTrend.map(row => React.createElement("div", {
    className: "ot-root-bar",
    key: row.weekStart
  }, React.createElement("div", null, React.createElement("strong", null, formatOtDate(row.weekStart)), React.createElement("span", null, formatOtHours(row.actualMinutes))), React.createElement("div", {
    className: "ot-root-bar__track"
  }, React.createElement("span", {
    style: {
      width: `${Math.round(row.actualMinutes / maxTrendMinutes * 100)}%`
    }
  })))))), React.createElement("section", {
    className: "ot-analytics-card",
    "aria-label": "Confirmed OT by Function chart"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, "Confirmed OT by Function"), React.createElement("p", {
    className: "muted"
  }, "Compare the confirmed actual-hours share for this month."))), functionRows.length ? React.createElement("div", {
    className: "ot-root-grid"
  }, functionRows.map(row => React.createElement("div", {
    className: "ot-root-bar",
    key: row.value
  }, React.createElement("div", null, React.createElement("strong", null, row.label), React.createElement("span", null, formatOtHours(row.actualMinutes))), React.createElement("div", {
    className: "ot-root-bar__track"
  }, React.createElement("span", {
    style: {
      width: `${Math.round(row.actualMinutes / maxFunctionMinutes * 100)}%`
    }
  }))))) : React.createElement("div", {
    className: "ot-state"
  }, "No confirmed OT is available for this month.")), React.createElement("section", {
    className: "ot-list"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, "Individual OT detail"), React.createElement("p", {
    className: "muted"
  }, "Confirmed OT only, sorted by highest actual hours.")), React.createElement("span", null, peopleRows.length, " people")), peopleRows.length ? React.createElement("div", {
    className: "ot-table-wrap"
  }, React.createElement("table", {
    className: "tbl ot-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Employee"), React.createElement("th", null, "Function"), React.createElement("th", null, "Confirmed OT"), React.createElement("th", null, "Requests"))), React.createElement("tbody", null, peopleRows.map(row => React.createElement("tr", {
    key: row.employeeId
  }, React.createElement("td", null, row.employee), React.createElement("td", null, row.functions || "—"), React.createElement("td", null, formatOtHours(row.actualMinutes)), React.createElement("td", null, row.requestCount)))))) : React.createElement("div", {
    className: "ot-state"
  }, "No confirmed OT is available for this month.")));
}
function OtHrExportPanel({
  refreshKey = 0,
  onChanged
}) {
  const [reportMonth, setReportMonth] = useStateApp(() => {
    const currentMonth = getCurrentOtMonthKey();
    return currentMonth >= OT_DISPLAY_MONTH_START && currentMonth <= OT_DISPLAY_MONTH_END ? currentMonth : OT_DISPLAY_MONTH_START;
  });
  const [localRefreshKey, setLocalRefreshKey] = useStateApp(0);
  const [loadState, setLoadState] = useStateApp({
    status: "loading",
    rows: [],
    message: ""
  });
  const [intent, setIntent] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({
    status: "idle",
    message: ""
  });
  const exportSubmissionRef = useRefApp(false);
  useEffectApp(() => {
    let alive = true;
    setLoadState(current => ({
      ...current,
      status: "loading",
      message: ""
    }));
    Promise.all(getOtMonthWeekStarts(reportMonth).map(weekStart => window.loadOtHrReady(weekStart))).then(resultSets => {
      if (!alive) return;
      const readyRows = Array.from(new Map(resultSets.flatMap(rows => Array.isArray(rows) ? rows : []).map(row => [row.id, row])).values()).filter(isOtRequestInDisplayYear);
      setLoadState({
        status: "ready",
        rows: readyRows,
        message: ""
      });
    }).catch(error => {
      if (alive) setLoadState({
        status: "error",
        rows: [],
        message: error.message || "HR-ready OT could not be loaded."
      });
    });
    return () => {
      alive = false;
    };
  }, [reportMonth, localRefreshKey, refreshKey]);
  function resetExportState() {
    if (exportSubmissionRef.current || actionState.status === "submitting") return;
    setIntent(window.FlowMateOtIntent.complete());
    setActionState({
      status: "idle",
      message: ""
    });
  }
  const exportRows = loadState.rows;
  const batchName = `${reportMonth} verified OT`;
  const selectionSignature = `${reportMonth}|${exportRows.map(row => row.id).sort().join("|")}`;
  async function exportMonthly() {
    if (!exportRows.length || exportSubmissionRef.current || actionState.status === "submitting") return;
    let currentIntent = window.FlowMateOtHrExport.establish(intent, selectionSignature, () => crypto.randomUUID());
    const intentKey = currentIntent.key;
    const includedIds = exportRows.map(row => row.id);
    setIntent(currentIntent);
    exportSubmissionRef.current = true;
    setActionState({
      status: "submitting",
      message: currentIntent.downloaded ? "Retrying the idempotent server export mark…" : "Creating the monthly CSV…"
    });
    if (window.FlowMateOtHrExport.phase(currentIntent) === "download") {
      const localResult = window.FlowMateOtHrExport.createLocalFile(exportRows, batchName, downloadOtHrCsv);
      if (!localResult.ok) {
        setActionState({
          status: "error",
          message: `The local file was not created, and the server was not marked exported. ${localResult.error?.message || "CSV creation or download initiation failed."}`
        });
        exportSubmissionRef.current = false;
        return;
      }
      currentIntent = window.FlowMateOtHrExport.markDownloaded(currentIntent);
      setIntent(currentIntent);
    }
    try {
      await window.markOtExported(includedIds, batchName, intentKey);
      setActionState({
        status: "success",
        message: `${includedIds.length} verified record(s) were downloaded and marked exported.`
      });
      setIntent(window.FlowMateOtIntent.complete());
      setLocalRefreshKey(value => value + 1);
      if (onChanged) onChanged();
    } catch (error) {
      setActionState({
        status: "error",
        message: `The local CSV exists, but server export status remains unchanged. Retry the server mark with the same month: ${error.message || "Export mark failed."}`
      });
    } finally {
      exportSubmissionRef.current = false;
    }
  }
  return React.createElement("div", {
    className: "ot-export"
  }, React.createElement("section", {
    className: "ot-toolbar"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Report month"), React.createElement("input", {
    className: "input",
    type: "month",
    min: "2026-01",
    max: "2026-12",
    value: reportMonth,
    disabled: actionState.status === "submitting",
    onChange: event => {
      setReportMonth(event.target.value || OT_DISPLAY_MONTH_START);
      resetExportState();
    }
  })), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    disabled: actionState.status === "submitting",
    onClick: () => setLocalRefreshKey(value => value + 1)
  }, "Refresh verified OT")), React.createElement("section", {
    className: "ot-list"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, "Monthly OT export"), React.createElement("p", {
    className: "muted"
  }, "Export every Team Lead-verified daily OT record for the selected month.")), React.createElement("span", null, exportRows.length, " ready")), loadState.status === "loading" && React.createElement("div", {
    className: "ot-state",
    role: "status"
  }, "Loading verified OT records…"), loadState.status === "error" && React.createElement(OtWarning, {
    kind: "error",
    message: loadState.message
  }), loadState.status === "ready" && !exportRows.length && React.createElement("div", {
    className: "ot-state"
  }, "No verified OT records are ready for export."), loadState.status === "ready" && !!exportRows.length && React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    disabled: actionState.status === "submitting",
    onClick: exportMonthly
  }, intent?.downloaded ? "Retry export status update" : "Export monthly CSV")), actionState.message && React.createElement(OtWarning, {
    kind: actionState.status === "error" ? "error" : "info",
    message: actionState.message
  })));
}
function OtRequesterAccessPanel({
  access
}) {
  const emptyForm = {
    id: "",
    firstName: "",
    lastName: "",
    email: "",
    functionCode: "ops",
    note: ""
  };
  const [listState, setListState] = useStateApp({
    status: "loading",
    rows: [],
    message: ""
  });
  const [form, setForm] = useStateApp(emptyForm);
  const [isFormOpen, setIsFormOpen] = useStateApp(false);
  const [search, setSearch] = useStateApp("");
  const [functionFilter, setFunctionFilter] = useStateApp("");
  const [statusFilter, setStatusFilter] = useStateApp("");
  const [intent, setIntent] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({
    status: "idle",
    message: ""
  });
  const submissionRef = useRefApp(false);
  async function loadRequesters() {
    const rows = await window.loadOtRequesterAccess();
    return {
      status: "ready",
      rows: Array.isArray(rows) ? rows : [],
      message: ""
    };
  }
  useEffectApp(() => {
    if (!access.isOwner) return undefined;
    let alive = true;
    setListState(current => ({
      ...current,
      status: "loading",
      message: ""
    }));
    loadRequesters().then(next => {
      if (alive) setListState(next);
    }).catch(error => {
      if (alive) setListState({
        status: "error",
        rows: [],
        message: error.message || "OT requester access could not be loaded."
      });
    });
    return () => {
      alive = false;
    };
  }, [access.isOwner]);
  function openAdd() {
    if (submissionRef.current || actionState.status === "submitting") return;
    setForm(emptyForm);
    setIntent(window.FlowMateOtIntent.complete());
    setIsFormOpen(true);
    setActionState({
      status: "idle",
      message: ""
    });
  }
  function openEdit(row) {
    if (submissionRef.current || actionState.status === "submitting") return;
    setForm({
      id: row.id || "",
      firstName: row.firstName || row.first_name || "",
      lastName: row.lastName || row.last_name || "",
      email: row.email || "",
      functionCode: row.functionCode || row.function_code || "ops",
      note: row.note || ""
    });
    setIntent(window.FlowMateOtIntent.complete());
    setIsFormOpen(true);
    setActionState({
      status: "idle",
      message: ""
    });
  }
  function updateForm(field, value) {
    setForm(current => ({
      ...current,
      [field]: value
    }));
    setIntent(window.FlowMateOtIntent.complete());
  }
  async function saveRequester() {
    if (submissionRef.current || actionState.status === "submitting") return;
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const email = form.email.trim().toLowerCase();
    if (!firstName || !lastName || !email || !form.functionCode) {
      setActionState({
        status: "error",
        message: "First name, last name, @garena.com email, and Function are required."
      });
      return;
    }
    if (!/^[^@\s]+@garena\.com$/i.test(email)) {
      setActionState({
        status: "error",
        message: "Email must use the exact @garena.com domain."
      });
      return;
    }
    const payload = {
      ...(form.id ? {
        id: form.id
      } : {}),
      firstName,
      lastName,
      email,
      functionCode: form.functionCode,
      note: form.note.trim() || null
    };
    const signature = window.FlowMateOtIntent.signature(["upsert_requester_access", payload]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    submissionRef.current = true;
    setActionState({
      status: "submitting",
      message: "Saving the audited OT requester access…"
    });
    try {
      await window.upsertOtRequesterAccess(payload, currentIntent.key);
      const refreshed = await loadRequesters();
      setListState(refreshed);
      setForm(emptyForm);
      setIsFormOpen(false);
      setIntent(window.FlowMateOtIntent.complete());
      setActionState({
        status: "success",
        message: "OT requester access saved and audited."
      });
    } catch (error) {
      setActionState({
        status: "error",
        message: error.message || "OT requester access could not be saved."
      });
    } finally {
      submissionRef.current = false;
    }
  }
  async function setRequesterActive(row, active) {
    if (submissionRef.current || actionState.status === "submitting") return;
    const signature = window.FlowMateOtIntent.signature([row.id, "set_requester_access", active]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    submissionRef.current = true;
    setActionState({
      status: "submitting",
      message: active ? "Activating OT requester access…" : "Checking for unresolved OT before deactivation…"
    });
    try {
      await window.setOtRequesterAccess(row.id, active, currentIntent.key);
      const refreshed = await loadRequesters();
      setListState(refreshed);
      setIntent(window.FlowMateOtIntent.complete());
      setActionState({
        status: "success",
        message: active ? "OT requester access activated." : "OT requester access deactivated."
      });
    } catch (error) {
      setActionState({
        status: "error",
        message: error.message || "OT requester access could not be updated."
      });
    } finally {
      submissionRef.current = false;
    }
  }
  if (!access.isOwner) return null;
  const filteredRows = listState.rows.filter(row => {
    const text = `${row.displayName || row.display_name || ""} ${row.email || ""}`.toLowerCase();
    const functionCode = row.functionCode || row.function_code || "";
    const status = row.status || "";
    return (!search.trim() || text.includes(search.trim().toLowerCase())) && (!functionFilter || functionCode === functionFilter) && (!statusFilter || status === statusFilter);
  });
  const displayName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
  return React.createElement("section", {
    className: "ot-access ot-list",
    "aria-label": "OT requester access"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, "Requesters"), React.createElement("p", {
    className: "muted"
  }, "Manage who can submit OT requests. Function is configured here and locked for the employee.")), React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    disabled: actionState.status === "submitting",
    onClick: openAdd
  }, "Add OT requester")), React.createElement("div", {
    className: "form-grid"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Search"), React.createElement("input", {
    className: "input",
    value: search,
    onChange: event => setSearch(event.target.value),
    placeholder: "Name or @garena.com email"
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Function"), React.createElement("select", {
    className: "select",
    value: functionFilter,
    onChange: event => setFunctionFilter(event.target.value)
  }, React.createElement("option", {
    value: ""
  }, "All Functions"), Object.keys(OT_FUNCTION_APPROVER_EMAILS).map(code => React.createElement("option", {
    key: code,
    value: code
  }, code.toUpperCase())))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Status"), React.createElement("select", {
    className: "select",
    value: statusFilter,
    onChange: event => setStatusFilter(event.target.value)
  }, React.createElement("option", {
    value: ""
  }, "All statuses"), React.createElement("option", {
    value: "active"
  }, "Active"), React.createElement("option", {
    value: "pending_sync"
  }, "Pending sync"), React.createElement("option", {
    value: "deactivated"
  }, "Deactivated")))), isFormOpen && React.createElement("fieldset", {
    className: "ot-form__fieldset",
    disabled: actionState.status === "submitting"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h3", null, form.id ? "Edit OT requester" : "Add OT requester"), React.createElement("p", {
    className: "muted"
  }, "Only @garena.com email addresses are accepted. Display name is derived from first and last name.")), React.createElement("button", {
    type: "button",
    className: "btn btn--ghost",
    onClick: () => {
      setIsFormOpen(false);
      setForm(emptyForm);
      setIntent(window.FlowMateOtIntent.complete());
    }
  }, "Close")), React.createElement("div", {
    className: "form-grid"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "First name *"), React.createElement("input", {
    className: "input",
    value: form.firstName,
    onChange: event => updateForm("firstName", event.target.value)
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Last name *"), React.createElement("input", {
    className: "input",
    value: form.lastName,
    onChange: event => updateForm("lastName", event.target.value)
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Display name"), React.createElement("input", {
    className: "input",
    value: displayName,
    readOnly: true
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Email *"), React.createElement("input", {
    className: "input",
    type: "email",
    value: form.email,
    onChange: event => updateForm("email", event.target.value),
    placeholder: "name@garena.com"
  })), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Function *"), React.createElement("select", {
    className: "select",
    value: form.functionCode,
    onChange: event => updateForm("functionCode", event.target.value)
  }, Object.keys(OT_FUNCTION_APPROVER_EMAILS).map(code => React.createElement("option", {
    key: code,
    value: code
  }, code.toUpperCase())))), React.createElement("label", {
    className: "field field--full"
  }, React.createElement("span", {
    className: "field__label"
  }, "Note"), React.createElement("textarea", {
    className: "textarea",
    value: form.note,
    onChange: event => updateForm("note", event.target.value),
    placeholder: "Optional internal note"
  }))), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: () => {
      setIsFormOpen(false);
      setForm(emptyForm);
      setIntent(window.FlowMateOtIntent.complete());
    }
  }, "Cancel"), React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    onClick: saveRequester
  }, form.id ? "Save requester" : "Add requester"))), listState.status === "loading" && React.createElement("div", {
    className: "ot-state",
    role: "status"
  }, "Loading OT requesters…"), listState.status === "error" && React.createElement(OtWarning, {
    kind: "error",
    message: listState.message
  }), listState.status === "ready" && !filteredRows.length && React.createElement("div", {
    className: "ot-state"
  }, "No OT requesters match these filters."), listState.status === "ready" && !!filteredRows.length && React.createElement("div", {
    className: "ot-table-wrap"
  }, React.createElement("table", {
    className: "tbl ot-table"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Person"), React.createElement("th", null, "Email"), React.createElement("th", null, "Function"), React.createElement("th", null, "Status"), React.createElement("th", null, "Last change"), React.createElement("th", null, "Actions"))), React.createElement("tbody", null, filteredRows.map(row => {
    const status = row.status || "pending_sync";
    return React.createElement("tr", {
      key: row.id
    }, React.createElement("td", null, React.createElement("strong", null, row.displayName || row.display_name)), React.createElement("td", null, row.email), React.createElement("td", null, String(row.functionCode || row.function_code || "").toUpperCase()), React.createElement("td", null, React.createElement("span", {
      className: "ot-status"
    }, status.replace("_", " "))), React.createElement("td", null, row.updatedAt || row.updated_at || "—"), React.createElement("td", null, React.createElement("div", {
      className: "ot-access__actions"
    }, React.createElement("button", {
      type: "button",
      className: "btn btn--sm btn--secondary",
      disabled: actionState.status === "submitting",
      onClick: () => openEdit(row)
    }, "Edit"), React.createElement("button", {
      type: "button",
      className: "btn btn--sm btn--secondary",
      disabled: actionState.status === "submitting",
      onClick: () => setRequesterActive(row, status !== "active")
    }, status === "active" ? "Deactivate" : "Activate"))));
  })))), actionState.message && React.createElement(OtWarning, {
    kind: actionState.status === "error" ? "error" : "info",
    message: actionState.message
  }));
}
function isOtRequestInDisplayYear(request) {
  const date = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at")).date;
  return date >= OT_DISPLAY_YEAR_START && date <= OT_DISPLAY_YEAR_END;
}
function formatOtManagerSchedule(request) {
  const start = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
  const end = getOtBangkokParts(otValue(request, "plannedEndAt", "planned_end_at"));
  if (!start.date || !start.time) return "—";
  return `${formatOtDate(start.date)} · ${start.time}${end.time ? `–${end.time}` : ""}`;
}
function OtAccessAdminPanel({
  access
}) {
  const [directoryState, setDirectoryState] = useStateApp({
    status: "loading",
    people: [],
    message: ""
  });
  const [reason, setReason] = useStateApp("");
  const [intent, setIntent] = useStateApp(null);
  const [deactivationPlan, setDeactivationPlan] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({
    status: "idle",
    message: ""
  });
  const accessSubmissionRef = useRefApp(false);
  async function loadOtAccessDirectory() {
    const identities = await window.loadOtAccessAdminIdentities();
    return {
      status: "ready",
      people: Array.isArray(identities) ? identities : [],
      message: ""
    };
  }
  function getAccessAdminIdentityEligibility(person) {
    return window.FlowMateOtRequestDomain.getAccessAdminIdentityEligibility(person);
  }
  useEffectApp(() => {
    if (!access.isOwner) return undefined;
    let alive = true;
    setDirectoryState(current => ({
      ...current,
      status: "loading",
      message: ""
    }));
    loadOtAccessDirectory().then(nextDirectory => {
      if (alive) setDirectoryState(nextDirectory);
    }).catch(error => {
      if (alive) setDirectoryState({
        status: "error",
        people: [],
        message: error.message || "OT access directory could not be loaded."
      });
    });
    return () => {
      alive = false;
    };
  }, [access.isOwner]);
  function beginApproverDeactivation(person) {
    if (accessSubmissionRef.current || actionState.status === "submitting") return;
    if (!getAccessAdminIdentityEligibility(person).canReassignFrom) {
      setActionState({
        status: "error",
        message: "Only an existing active approver state can be used as a reassignment source and deactivation target."
      });
      return;
    }
    setDeactivationPlan({
      sourceUserId: person.userId,
      destinationUserId: "",
      ready: false,
      movedCount: null
    });
    setActionState({
      status: "idle",
      message: ""
    });
    setIntent(window.FlowMateOtIntent.complete());
  }
  async function reassignPendingApproverWork() {
    if (accessSubmissionRef.current || actionState.status === "submitting") return;
    if (!reason.trim()) {
      setActionState({
        status: "error",
        message: "A written reason is required before pending work can be reassigned."
      });
      return;
    }
    if (!deactivationPlan?.sourceUserId || !deactivationPlan.destinationUserId) {
      setActionState({
        status: "error",
        message: "Choose an active reassignment destination before continuing."
      });
      return;
    }
    const sourcePerson = directoryState.people.find(person => person.userId === deactivationPlan.sourceUserId);
    const destinationPerson = directoryState.people.find(person => person.userId === deactivationPlan.destinationUserId);
    if (!sourcePerson || !getAccessAdminIdentityEligibility(sourcePerson).canReassignFrom) {
      setActionState({
        status: "error",
        message: "The reassignment source is no longer eligible. Refresh the Owner directory and try again."
      });
      return;
    }
    if (!destinationPerson || !getAccessAdminIdentityEligibility(destinationPerson).canReassignTo) {
      setActionState({
        status: "error",
        message: "The destination must have an existing active Workgrid identity and active approver access."
      });
      return;
    }
    const normalizedReason = reason.trim();
    const signature = window.FlowMateOtIntent.signature([deactivationPlan.sourceUserId, deactivationPlan.destinationUserId, "reassign_pending_approver", normalizedReason]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    accessSubmissionRef.current = true;
    setActionState({
      status: "submitting",
      message: "Atomically reassigning pending OT work…"
    });
    try {
      const result = await window.reassignPendingOtApprover(deactivationPlan.sourceUserId, deactivationPlan.destinationUserId, normalizedReason, currentIntent.key);
      let refreshedDirectory;
      try {
        refreshedDirectory = await loadOtAccessDirectory();
      } catch (refreshError) {
        throw new Error(`The server reassignment completed atomically, but the access refresh failed. Retry the unchanged reassignment to replay it safely. ${refreshError.message || ""}`.trim());
      }
      setDirectoryState(refreshedDirectory);
      setIntent(window.FlowMateOtIntent.complete());
      setDeactivationPlan(current => ({
        ...current,
        ready: true,
        movedCount: Number(result?.movedCount ?? result?.moved_count ?? 0)
      }));
      setActionState({
        status: "success",
        message: "The server reassignment is atomic. The approver remains active because the reassignment and deactivation browser calls are not atomic together. Review the refreshed list, then run the separate deactivation call."
      });
    } catch (error) {
      setActionState({
        status: "error",
        message: error.message || "Pending OT work could not be reassigned."
      });
    } finally {
      accessSubmissionRef.current = false;
    }
  }
  async function deactivateApprover(person) {
    if (accessSubmissionRef.current || actionState.status === "submitting") return;
    if (!deactivationPlan?.ready || deactivationPlan.sourceUserId !== person.userId) return;
    if (!getAccessAdminIdentityEligibility(person).canDeactivateApprover) {
      setActionState({
        status: "error",
        message: "This identity no longer has active approver state to deactivate."
      });
      return;
    }
    if (!reason.trim()) {
      setActionState({
        status: "error",
        message: "A written reason is required for approver deactivation."
      });
      return;
    }
    const normalizedReason = reason.trim();
    const signature = window.FlowMateOtIntent.signature([person.userId, "set_approver:false", normalizedReason]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    accessSubmissionRef.current = true;
    setActionState({
      status: "submitting",
      message: "Running the separate audited deactivation call…"
    });
    try {
      await window.setOtApprover(person.userId, false, normalizedReason, currentIntent.key);
      let refreshedDirectory;
      try {
        refreshedDirectory = await loadOtAccessDirectory();
      } catch (refreshError) {
        throw new Error(`Approver deactivation completed, but the Owner directory refresh failed. Reload before another change. ${refreshError.message || ""}`.trim());
      }
      setDirectoryState(refreshedDirectory);
      setIntent(window.FlowMateOtIntent.complete());
      setDeactivationPlan(null);
      setReason("");
      setActionState({
        status: "success",
        message: "Approver deactivated after the refreshed pending-work check."
      });
    } catch (error) {
      setActionState({
        status: "error",
        message: error.message || "Approver deactivation could not be completed. New pending work may require another reassignment."
      });
    } finally {
      accessSubmissionRef.current = false;
    }
  }
  async function enableApprover(person) {
    if (accessSubmissionRef.current || actionState.status === "submitting") return;
    if (!getAccessAdminIdentityEligibility(person).canActivateApprover) {
      setActionState({
        status: "error",
        message: "Approver activation requires an existing active Workgrid identity without active approver access."
      });
      return;
    }
    if (!reason.trim()) {
      setActionState({
        status: "error",
        message: "A written reason is required for every approver change."
      });
      return;
    }
    const normalizedReason = reason.trim();
    const signature = window.FlowMateOtIntent.signature([person.userId, "set_approver:true", normalizedReason]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    accessSubmissionRef.current = true;
    setActionState({
      status: "submitting",
      message: "Saving the audited approver activation…"
    });
    try {
      await window.setOtApprover(person.userId, true, normalizedReason, currentIntent.key);
      let refreshedDirectory;
      try {
        refreshedDirectory = await loadOtAccessDirectory();
      } catch (refreshError) {
        throw new Error(`Approver activation completed, but the Owner directory refresh failed. Reload before another change. ${refreshError.message || ""}`.trim());
      }
      setDirectoryState(refreshedDirectory);
      setIntent(window.FlowMateOtIntent.complete());
      setActionState({
        status: "success",
        message: "Approver access activated and audited."
      });
      setReason("");
    } catch (error) {
      setActionState({
        status: "error",
        message: error.message || "Approver access could not be activated."
      });
    } finally {
      accessSubmissionRef.current = false;
    }
  }
  async function applyHrRole(person, active) {
    if (accessSubmissionRef.current || actionState.status === "submitting") return;
    const eligibility = getAccessAdminIdentityEligibility(person);
    if (active ? !eligibility.canActivateHrAdmin : !eligibility.canDeactivateHrAdmin) {
      setActionState({
        status: "error",
        message: active ? "HR/Admin activation requires an existing active Workgrid identity without active HR/Admin access." : "This identity does not have active HR/Admin access to remove."
      });
      return;
    }
    if (!reason.trim()) {
      setActionState({
        status: "error",
        message: "A written reason is required for every HR/Admin role change."
      });
      return;
    }
    const normalizedReason = reason.trim();
    const signature = window.FlowMateOtIntent.signature([person.userId, `set_system_role:hr_admin:${active}`, normalizedReason]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    accessSubmissionRef.current = true;
    setActionState({
      status: "submitting",
      message: "Saving the audited OT role change…"
    });
    try {
      await window.setOtSystemRole(person.userId, "hr_admin", active, normalizedReason, currentIntent.key);
      let refreshedDirectory;
      try {
        refreshedDirectory = await loadOtAccessDirectory();
      } catch (refreshError) {
        throw new Error(`The HR/Admin change completed, but the Owner directory refresh failed. Reload before another change. ${refreshError.message || ""}`.trim());
      }
      setDirectoryState(refreshedDirectory);
      setIntent(window.FlowMateOtIntent.complete());
      setActionState({
        status: "success",
        message: "HR/Admin role instruction saved and audited. Refresh access context for the affected user."
      });
      setReason("");
    } catch (error) {
      setActionState({
        status: "error",
        message: error.message || "OT role could not be changed."
      });
    } finally {
      accessSubmissionRef.current = false;
    }
  }
  if (!access.isOwner) return null;
  const deactivationPerson = directoryState.people.find(person => person.userId === deactivationPlan?.sourceUserId) || null;
  const destinationPeople = directoryState.people.filter(person => person.userId !== deactivationPlan?.sourceUserId && getAccessAdminIdentityEligibility(person).canReassignTo);
  return React.createElement("section", {
    className: "ot-access ot-list",
    "aria-label": "OT access administration"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", null, "Approvers / HR access"), React.createElement("p", {
    className: "muted"
  }, "This fixed server directory shows only Big, Mac, and Pluem. The server validates every access change and remains the authorization authority."), React.createElement("p", {
    className: "muted"
  }, "Inactive Workgrid identities are source/deactivation only. Destinations and activations require an existing active Workgrid identity; reassignment destinations also require active approver access.")), React.createElement("span", null, "Owner only")), React.createElement("article", {
    className: "ot-access__owner"
  }, React.createElement("div", null, React.createElement("strong", null, "Sole OT Owner"), React.createElement("small", null, "Identity resolved by the server access context · User ", access.userId)), React.createElement("span", {
    className: "ot-status"
  }, "Protected active")), React.createElement("fieldset", {
    className: "ot-form__fieldset",
    disabled: actionState.status === "submitting"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Required reason for the next change *"), React.createElement("textarea", {
    className: "textarea",
    value: reason,
    onChange: event => setReason(event.target.value),
    placeholder: "Explain the operational or compliance reason."
  })), deactivationPerson && React.createElement("section", {
    className: "ot-workflow",
    "aria-label": "Approver reassignment before deactivation"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h3", null, "Prepare deactivation"), React.createElement("p", {
    className: "muted"
  }, "Reassign all non-final requested and Actual workflow records from ", deactivationPerson.displayName || deactivationPerson.email, " before disabling access.")), React.createElement("button", {
    type: "button",
    className: "btn btn--ghost",
    disabled: actionState.status === "submitting",
    onClick: () => {
      setDeactivationPlan(null);
      setIntent(window.FlowMateOtIntent.complete());
      setActionState({
        status: "idle",
        message: ""
      });
    }
  }, "Cancel")), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Reassignment destination *"), React.createElement("select", {
    className: "select",
    value: deactivationPlan.destinationUserId,
    disabled: actionState.status === "submitting",
    onChange: event => setDeactivationPlan(current => ({
      ...current,
      destinationUserId: event.target.value,
      ready: false,
      movedCount: null
    }))
  }, React.createElement("option", {
    value: ""
  }, "Select an active approver"), destinationPeople.map(person => React.createElement("option", {
    key: person.userId,
    value: person.userId
  }, person.displayName || person.email)))), React.createElement("p", {
    className: "muted"
  }, "The server reassignment is atomic. However, the reassignment and deactivation browser calls are not atomic together, so the server rechecks pending work during the separate deactivation call."), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    disabled: !reason.trim() || !deactivationPlan.destinationUserId || actionState.status === "submitting",
    onClick: reassignPendingApproverWork
  }, "Reassign pending work"), deactivationPlan.ready && React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    disabled: !reason.trim() || actionState.status === "submitting",
    onClick: () => deactivateApprover(deactivationPerson)
  }, "Deactivate approver")), deactivationPlan.ready && React.createElement("p", {
    className: "muted"
  }, "Refreshed after moving ", deactivationPlan.movedCount, " non-final request", deactivationPlan.movedCount === 1 ? "" : "s", ". Deactivation remains a separate server call."))), directoryState.status === "loading" && React.createElement("div", {
    className: "ot-state",
    role: "status"
  }, "Loading the fixed OT access list…"), directoryState.status === "error" && React.createElement(OtWarning, {
    kind: "error",
    message: directoryState.message
  }), directoryState.status === "ready" && React.createElement("div", {
    className: "ot-access__list"
  }, directoryState.people.map(person => {
    const eligibility = getAccessAdminIdentityEligibility(person);
    const isApprover = Boolean(otValue(person, "isApproverActive", "is_approver_active"));
    const isWorkgridActive = Boolean(otValue(person, "isWorkgridActive", "is_workgrid_active"));
    return React.createElement("article", {
      key: person.userId || person.email,
      className: "ot-access__row"
    }, React.createElement("div", null, React.createElement("strong", null, person.displayLabel || person.email), React.createElement("small", null, person.email, " · Workgrid ", isWorkgridActive ? "active" : "inactive", " · Team Lead ", isApprover ? "active" : "inactive")), React.createElement("div", {
      className: "ot-access__actions"
    }, React.createElement("button", {
      type: "button",
      className: "btn btn--sm btn--secondary",
      disabled: actionState.status === "submitting" || (isApprover ? !eligibility.canDeactivateApprover : !eligibility.canActivateApprover),
      onClick: () => isApprover ? beginApproverDeactivation(person) : enableApprover(person)
    }, isApprover ? "Prepare deactivation" : "Enable Team Lead")));
  })), actionState.message && React.createElement(OtWarning, {
    kind: actionState.status === "error" ? "error" : "info",
    message: actionState.message
  }), React.createElement("p", {
    className: "muted"
  }, "Normal plan and actual decisions remain assigned-approver only. This panel never impersonates an assigned approver."));
}
function OtRequestShell({
  user,
  currentUserName,
  currentUserEmail,
  avatarMemberId,
  onHome,
  onSwitchFlowMate,
  onSwitchMarketingPlan,
  onSwitchProductBook,
  onSwitchOtRequest,
  onSignOut
}) {
  const [access, setAccess] = useStateApp({
    status: "loading",
    canManage: false,
    canExport: false,
    isOwner: false
  });
  const [activeView, setActiveView] = useStateApp(getOtRequestHashView);
  const [operationsRefreshKey, setOperationsRefreshKey] = useStateApp(0);
  useEffectApp(() => {
    let alive = true;
    const loadAccess = window.loadOtAccessContext ? window.loadOtAccessContext() : Promise.reject(new Error("OT Request data service is not ready."));
    loadAccess.then(data => {
      if (!alive) return;
      const serverAccess = data || {};
      setAccess({
        status: "ready",
        ...serverAccess,
        canManage: Boolean(serverAccess.isEligibleApprover || serverAccess.isOwner),
        canExport: Boolean(serverAccess.isEligibleApprover || serverAccess.isOwner)
      });
    }).catch(error => {
      if (alive) setAccess({
        status: "error",
        canManage: false,
        canExport: false,
        isOwner: false,
        message: error.message
      });
    });
    return () => {
      alive = false;
    };
  }, [user && user.id]);
  useEffectApp(() => {
    function onHashChange() {
      setActiveView(getOtRequestHashView());
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  useEffectApp(() => {
    if (access.status !== "ready") return;
    if (canOpenOtRequestView(activeView, access)) return;
    const fallbackView = getOtRequestFallbackView(access);
    if (!fallbackView) {
      onHome();
      return;
    }
    setActiveView(fallbackView);
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${OT_REQUEST_VIEW_ROUTES[fallbackView]}`);
  }, [access, activeView, onHome]);
  function openView(view) {
    if (!canOpenOtRequestView(view, access)) return;
    setActiveView(view);
    window.location.hash = OT_REQUEST_VIEW_ROUTES[view] || OT_REQUEST_VIEW_ROUTES.overview;
  }
  const visibleView = canOpenOtRequestView(activeView, access) ? activeView : getOtRequestFallbackView(access);
  const viewCopy = {
    overview: {
      eyebrow: "OT Request",
      title: "Weekly overtime overview",
      detail: "Review your overtime status and continue personal actions from one place."
    },
    "my-requests": {
      eyebrow: "Personal",
      title: "My OT requests",
      detail: "Your request history and employee actions will appear here."
    },
    "action-queue": {
      eyebrow: "Manage",
      title: "Action queue",
      detail: "Approve planned OT and verify submitted Actual time that needs your decision."
    },
    "team-schedule": {
      eyebrow: "Manage",
      title: "Team schedule",
      detail: "Review each authorized OT occurrence by Bangkok date and time."
    },
    "monthly-report": {
      eyebrow: "Manage",
      title: "Monthly report",
      detail: "Review 2026 OT totals and individual records for the selected month."
    },
    insights: {
      eyebrow: "Owner",
      title: "OT insights",
      detail: "Review 2026 confirmed-OT trends, Function comparison, and individual detail."
    },
    compliance: {
      eyebrow: "Compliance",
      title: "Actual-hours compliance review",
      detail: "Review truthful actual time and affected weekly totals without changing worked hours."
    },
    audit: {
      eyebrow: "Governance",
      title: "OT request audit",
      detail: "Filter immutable request history by actor, action, status, changed field, reason, and time."
    },
    access: {
      eyebrow: "Administration",
      title: "OT access controls",
      detail: "Manage the fixed OT access list through audited server actions."
    },
    export: {
      eyebrow: "Owner",
      title: "Monthly export",
      detail: "Download verified 2026 daily OT records and send the report to HR outside this system."
    }
  }[visibleView] || null;
  return React.createElement("div", {
    className: "ot-shell"
  }, React.createElement(FlowMatePromptHost, null), React.createElement("div", {
    className: "app__brand"
  }, React.createElement("img", {
    src: "garena/logo_graphic.png",
    alt: "Garena"
  }), React.createElement("span", {
    className: "app__brand-name"
  }, "OT Request"), React.createElement("span", {
    className: "app__brand-version"
  }, FLOWMATE_APP_VERSION)), React.createElement("div", {
    className: "app__topbar"
  }, React.createElement(HomeButton, {
    onHome: onHome
  }), React.createElement(ProductSwitch, {
    activeProduct: "ot-request",
    onSwitchFlowMate: onSwitchFlowMate,
    onSwitchMarketingPlan: onSwitchMarketingPlan,
    onSwitchProductBook: onSwitchProductBook,
    onSwitchOtRequest: onSwitchOtRequest
  }), React.createElement("span", {
    className: "topbar__spacer"
  }), React.createElement(ThemeToggle, null), React.createElement("div", {
    className: "topbar__user",
    title: `Signed in as ${currentUserEmail}`
  }, React.createElement(Avatar, {
    memberId: avatarMemberId,
    size: ""
  }), React.createElement("span", {
    className: "topbar__user-name"
  }, currentUserName)), React.createElement("button", {
    type: "button",
    className: "topbar__btn",
    onClick: onSignOut
  }, "Sign out")), React.createElement("nav", {
    className: "ot-sidebar",
    "aria-label": "OT Request navigation"
  }, access.status === "ready" && access.canRequestOt && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "nav-section"
  }, "Personal"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "overview" ? "is-active" : ""}`,
    "aria-current": visibleView === "overview" ? "page" : undefined,
    onClick: () => openView("overview")
  }, React.createElement(Icon, {
    name: "calendar",
    size: 16
  }), " Overview"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "my-requests" ? "is-active" : ""}`,
    "aria-current": visibleView === "my-requests" ? "page" : undefined,
    onClick: () => openView("my-requests")
  }, React.createElement(Icon, {
    name: "list",
    size: 16
  }), " My requests")), access.status === "ready" && access.canManage && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "nav-section"
  }, "Manage"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "action-queue" ? "is-active" : ""}`,
    "aria-current": visibleView === "action-queue" ? "page" : undefined,
    onClick: () => openView("action-queue")
  }, React.createElement(Icon, {
    name: "users",
    size: 16
  }), " Action queue"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "team-schedule" ? "is-active" : ""}`,
    "aria-current": visibleView === "team-schedule" ? "page" : undefined,
    onClick: () => openView("team-schedule")
  }, React.createElement(Icon, {
    name: "calendar",
    size: 16
  }), " Team schedule"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "monthly-report" ? "is-active" : ""}`,
    "aria-current": visibleView === "monthly-report" ? "page" : undefined,
    onClick: () => openView("monthly-report")
  }, React.createElement(Icon, {
    name: "chart",
    size: 16
  }), " Monthly report")), access.status === "ready" && access.isOwner && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "nav-section"
  }, "Owner"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "insights" ? "is-active" : ""}`,
    "aria-current": visibleView === "insights" ? "page" : undefined,
    onClick: () => openView("insights")
  }, React.createElement(Icon, {
    name: "chart",
    size: 16
  }), " OT insights"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "export" ? "is-active" : ""}`,
    "aria-current": visibleView === "export" ? "page" : undefined,
    onClick: () => openView("export")
  }, React.createElement(Icon, {
    name: "download",
    size: 16
  }), " Monthly export"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "access" ? "is-active" : ""}`,
    "aria-current": visibleView === "access" ? "page" : undefined,
    onClick: () => openView("access")
  }, React.createElement(Icon, {
    name: "users",
    size: 16
  }), " Access"))), React.createElement("main", {
    className: "ot-main ot-shell__main",
    "aria-labelledby": "ot-view-title"
  }, access.status === "loading" && React.createElement("div", {
    className: "ot-warning",
    role: "status"
  }, React.createElement("span", {
    "aria-hidden": "true"
  }, "ⓘ"), React.createElement("span", null, "Loading OT access…")), access.status === "error" && React.createElement("div", {
    className: "ot-warning ot-warning--error",
    role: "alert"
  }, React.createElement("span", {
    "aria-hidden": "true"
  }, "⚠"), React.createElement("span", null, access.message || "OT access could not be loaded.")), viewCopy && React.createElement("div", null, React.createElement("div", {
    className: "page-head"
  }, React.createElement("div", null, React.createElement("div", {
    className: "eyebrow"
  }, viewCopy.eyebrow), React.createElement("h1", {
    id: "ot-view-title"
  }, viewCopy.title), React.createElement("p", {
    className: "muted"
  }, viewCopy.detail))), access.status === "ready" && access.canRequestOt && (visibleView === "overview" || visibleView === "my-requests") && React.createElement(OtEmployeeDashboard, {
    access: access,
    listOnly: visibleView === "my-requests"
  }), access.status === "ready" && visibleView === "action-queue" && React.createElement(OtManagerDashboard, {
    access: access,
    surface: "action-queue",
    refreshToken: operationsRefreshKey
  }), access.status === "ready" && visibleView === "team-schedule" && React.createElement(OtManagerDashboard, {
    access: access,
    surface: "team-schedule",
    refreshToken: operationsRefreshKey
  }), access.status === "ready" && visibleView === "monthly-report" && React.createElement(OtManagerDashboard, {
    access: access,
    surface: "monthly-report",
    refreshToken: operationsRefreshKey
  }), access.status === "ready" && access.isOwner && visibleView === "insights" && React.createElement(OtOwnerInsightsPanel, {
    refreshKey: operationsRefreshKey
  }), access.status === "ready" && access.isOwner && visibleView === "export" && React.createElement(OtHrExportPanel, {
    refreshKey: operationsRefreshKey,
    onChanged: () => setOperationsRefreshKey(value => value + 1)
  }), access.status === "ready" && access.isOwner && visibleView === "access" && React.createElement(React.Fragment, null, React.createElement(OtRequesterAccessPanel, {
    access: access
  }), React.createElement(OtAccessAdminPanel, {
    access: access
  })))));
}
window.OtRequestShell = OtRequestShell;
