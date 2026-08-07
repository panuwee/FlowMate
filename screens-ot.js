/* AUTO-GENERATED from screens-ot.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
const OT_REQUEST_VIEW_ROUTES = {
  overview: "ot-request",
  "my-requests": "ot-request/my-requests",
  manager: "ot-request/manager",
  "root-causes": "ot-request/root-causes"
};
function getOtRequestHashView() {
  const route = String(window.location.hash || "").replace(/^#/, "").split("/");
  if (route[0] !== "ot-request") return "overview";
  return OT_REQUEST_VIEW_ROUTES[route[1]] ? route[1] : "overview";
}
function canOpenOtRequestView(view, access) {
  if (view === "overview" || view === "my-requests") return true;
  return Boolean(access && (access.isEligibleApprover || access.isOwner || access.isHrAdmin));
}
const OT_LIMIT_MINUTES = 36 * 60;
const OT_CONSENT_STATEMENT_VERSION = "2026-08-07";
const OT_DETAIL_REQUIRED_REASONS = new Set(["other", "live_incident", "rework", "scope_change"]);
function otValue(record, camel, snake) {
  return record && (record[camel] !== undefined ? record[camel] : record[snake]);
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
function OtWarning({
  kind = "info",
  title,
  message,
  testId
}) {
  if (!message) return null;
  return React.createElement("div", {
    className: `ot-warning ${kind === "error" || kind === "critical" ? "ot-warning--error" : ""}`,
    role: kind === "error" || kind === "critical" ? "alert" : "status",
    "data-testid": testId
  }, React.createElement("span", {
    "aria-hidden": "true"
  }, kind === "error" || kind === "critical" ? "⚠" : "ⓘ"), React.createElement("span", null, React.createElement("strong", null, title ? `${title}: ` : ""), message));
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
function OtEmployeeDashboard({
  access,
  listOnly = false
}) {
  const [weekStart, setWeekStart] = useStateApp(getCurrentOtWeekStart);
  const [loadState, setLoadState] = useStateApp({
    status: "loading",
    dashboard: null,
    requests: []
  });
  const [refreshKey, setRefreshKey] = useStateApp(0);
  const [action, setAction] = useStateApp(null);
  const loadErrorRef = useRefApp(null);
  useEffectApp(() => {
    let alive = true;
    setLoadState(current => ({
      ...current,
      status: "loading",
      message: ""
    }));
    Promise.all([window.loadMyOtDashboard(weekStart), window.loadMyOtRequests(weekStart)]).then(([dashboard, requests]) => {
      if (!alive) return;
      setLoadState({
        status: "ready",
        dashboard: dashboard || {},
        requests: Array.isArray(requests) ? requests : []
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
  function refreshAfterAction() {
    setAction(null);
    setRefreshKey(value => value + 1);
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
  const plannedMinutes = Number(dashboard.plannedMinutes || 0);
  const confirmedMinutes = Number(dashboard.actualMinutes || 0);
  const summary = {
    countedMinutes: plannedMinutes,
    plannedMinutes,
    confirmedMinutes,
    remainingMinutes: Math.max(0, OT_LIMIT_MINUTES - plannedMinutes)
  };
  const consentRequests = requests.filter(request => getOtRequestStatus(request) === "awaiting_consent" && !otValue(request, "employeeConsent", "employee_consent"));
  const actualRequests = requests.filter(request => getOtRequestStatus(request) === "actual_confirmation_required" || otValue(request, "actualDecision", "actual_decision") === "revision_required");
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
    onChange: event => setWeekStart(window.FlowMateOtRequestDomain.getWeekStartKey(event.target.value))
  })), React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    onClick: () => setAction({
      type: "new",
      request: null
    })
  }, "New OT request")), loadState.status === "error" && React.createElement(OtWarning, {
    kind: "error",
    title: "Refresh failed",
    message: `${loadState.message} Your current form is preserved; retry when ready.`
  }), !listOnly && React.createElement(React.Fragment, null, React.createElement("section", {
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
  }, React.createElement("span", null, "Actions"), React.createElement("strong", null, consentRequests.length + actualRequests.length), React.createElement("small", null, consentRequests.length, " consent · ", actualRequests.length, " actual"))), React.createElement("section", {
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
  }, React.createElement("strong", null, "Consent required"), React.createElement("span", null, request.title), React.createElement("small", null, "Review the occurrence and weekly total"))), actualRequests.map(request => React.createElement("button", {
    key: request.id,
    type: "button",
    className: "ot-action-card",
    "data-testid": "ot-confirm-actual",
    onClick: () => setAction({
      type: "actual",
      request
    })
  }, React.createElement("strong", null, "Confirm actual time"), React.createElement("span", null, request.title), React.createElement("small", null, "Record the hours you actually worked"))), !consentRequests.length && !actualRequests.length && React.createElement("div", {
    className: "ot-state ot-state--compact"
  }, "No OT actions are waiting for you."))), action && React.createElement("section", {
    className: "ot-workflow",
    "aria-label": "OT action"
  }, React.createElement("div", {
    className: "ot-workflow__head"
  }, React.createElement("h2", null, action.type === "new" ? "New OT request" : action.type === "consent" ? "Event consent" : "Confirm actual time"), React.createElement("button", {
    type: "button",
    className: "btn btn--ghost",
    onClick: () => setAction(null)
  }, "Close")), action.type === "new" && React.createElement(OtRequestForm, {
    currentWeekMinutes: summary.countedMinutes,
    weekStart: weekStart,
    onSuccess: refreshAfterAction
  }), action.type === "consent" && React.createElement(OtConsentPanel, {
    request: action.request,
    currentWeekMinutes: summary.countedMinutes,
    onSuccess: refreshAfterAction
  }), action.type === "actual" && React.createElement(OtActualConfirmationForm, {
    request: action.request,
    currentActualWeekMinutes: summary.confirmedMinutes,
    onSuccess: refreshAfterAction
  })), React.createElement(OtMyRequestsTable, {
    requests: requests,
    onAction: (type, request) => setAction({
      type,
      request
    })
  }));
}
function OtRequestForm({
  currentWeekMinutes,
  weekStart,
  onSuccess
}) {
  const today = getBangkokDateKey();
  const initialWorkDate = window.FlowMateOtRequestDomain.getWeekStartKey(today) === weekStart ? today : weekStart;
  const [form, setForm] = useStateApp({
    functionCode: "",
    title: "",
    workDate: initialWorkDate,
    startTime: "18:00",
    endTime: "20:00",
    breakMinutes: "0",
    breakMinutesBeforeBoundary: "",
    breakMinutesAfterBoundary: "",
    dayType: "working_day",
    workLocationType: "office",
    venue: "",
    reasonCode: "",
    reasonDetail: "",
    approverUserId: "",
    consented: false
  });
  const [approverState, setApproverState] = useStateApp({
    status: "loading",
    rows: []
  });
  const [approverRetry, setApproverRetry] = useStateApp(0);
  const [submitState, setSubmitState] = useStateApp({
    status: "idle",
    message: ""
  });
  const [idempotencyKey, setIdempotencyKey] = useStateApp(() => crypto.randomUUID());
  const errorRef = useRefApp(null);
  useEffectApp(() => {
    let alive = true;
    setApproverState(current => ({
      ...current,
      status: "loading",
      message: ""
    }));
    window.loadOtEligibleApprovers().then(rows => {
      if (!alive) return;
      setApproverState({
        status: "ready",
        rows: Array.isArray(rows) ? rows : []
      });
    }).catch(error => {
      if (alive) setApproverState({
        status: "error",
        rows: [],
        message: error.message || "Approvers could not be loaded."
      });
    });
    return () => {
      alive = false;
    };
  }, [approverRetry]);
  useEffectApp(() => {
    if (submitState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [submitState.status]);
  function update(field, value) {
    setForm(current => ({
      ...current,
      [field]: value
    }));
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
  const addedMinutes = preview.segments.find(segment => segment.weekStart === weekStart)?.minutes || preview.minutes;
  const projectedMinutes = Number(currentWeekMinutes || 0) + Number(addedMinutes || 0);
  const overLimit = projectedMinutes > OT_LIMIT_MINUTES;
  const detailRequired = OT_DETAIL_REQUIRED_REASONS.has(form.reasonCode);
  const venueRequired = form.workLocationType === "venue";
  const approverUnavailable = approverState.status !== "ready" || approverState.rows.length === 0;
  const canSubmit = preview.valid && !overLimit && form.functionCode && form.title.trim() && form.reasonCode && (!detailRequired || form.reasonDetail.trim()) && (!venueRequired || form.venue.trim()) && form.approverUserId && form.consented && !approverUnavailable && submitState.status !== "submitting";
  async function submitRequest(event) {
    event.preventDefault();
    if (!canSubmit) {
      setSubmitState({
        status: "error",
        message: overLimit ? "This request would exceed the 36-hour weekly limit." : "Complete the required fields and consent before submitting."
      });
      return;
    }
    setSubmitState({
      status: "submitting",
      message: "Submitting your request…"
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
      approverUserId: form.approverUserId,
      consentStatementVersion: OT_CONSENT_STATEMENT_VERSION
    };
    try {
      await window.createOtRequest(payload, idempotencyKey);
      setSubmitState({
        status: "success",
        message: "Your OT request was submitted for approval."
      });
      setIdempotencyKey(crypto.randomUUID());
      onSuccess();
    } catch (error) {
      setSubmitState({
        status: "error",
        message: error.message || "Your OT request could not be submitted. Retry uses the same request key."
      });
    }
  }
  return React.createElement("form", {
    className: "ot-form",
    onSubmit: submitRequest,
    noValidate: true
  }, React.createElement("div", {
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
    min: weekStart,
    max: addOtDays(weekStart, 6),
    value: form.workDate,
    onChange: event => update("workDate", event.target.value),
    required: true
  }), React.createElement("span", {
    className: "field__hint"
  }, "Choose a date in the selected Bangkok week.")), React.createElement("label", {
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
  }, reason.label)))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Assigned approver *"), React.createElement("select", {
    className: "select",
    "aria-label": "Assigned approver",
    value: form.approverUserId,
    onChange: event => update("approverUserId", event.target.value),
    disabled: approverState.status !== "ready" || !approverState.rows.length,
    required: true
  }, React.createElement("option", {
    value: ""
  }, approverState.status === "loading" ? "Loading approvers…" : approverState.rows.length ? "Select approver" : "No approver available"), approverState.rows.map(approver => React.createElement("option", {
    key: approver.userId,
    value: approver.userId
  }, approver.displayName || approver.email, approver.displayName ? ` — ${approver.email}` : ""))), approverState.status === "error" && React.createElement("span", {
    className: "field__error"
  }, approverState.message, " ", React.createElement("button", {
    type: "button",
    className: "ot-link-button",
    onClick: () => setApproverRetry(value => value + 1)
  }, "Retry")), approverState.status === "ready" && !approverState.rows.length && React.createElement("span", {
    className: "field__error"
  }, "No active OT approver is available. Contact the OT Owner.")), React.createElement("label", {
    className: "field field--full"
  }, React.createElement("span", {
    className: "field__label"
  }, "Reason detail ", detailRequired ? "*" : "(optional)"), React.createElement("textarea", {
    className: "textarea",
    value: form.reasonDetail,
    onChange: event => update("reasonDetail", event.target.value),
    required: detailRequired,
    placeholder: detailRequired ? "Explain what happened and why OT is required" : "Add only information needed for approval"
  }))), React.createElement("section", {
    className: "ot-preview",
    "aria-label": "Planned weekly total"
  }, React.createElement("div", null, React.createElement("span", null, "Current"), React.createElement("strong", null, formatOtHours(currentWeekMinutes))), React.createElement("div", null, React.createElement("span", null, "Added"), React.createElement("strong", null, preview.valid ? formatOtHours(addedMinutes) : "—")), React.createElement("div", null, React.createElement("span", null, "Projected"), React.createElement("strong", null, preview.valid ? formatOtHours(projectedMinutes) : "—")), React.createElement("div", null, React.createElement("span", null, "Remaining"), React.createElement("strong", null, preview.valid ? formatOtHours(Math.max(0, OT_LIMIT_MINUTES - projectedMinutes)) : "—"))), preview.valid && React.createElement(OtLimitProgress, {
    totalMinutes: projectedMinutes
  }), !preview.valid && React.createElement(OtWarning, {
    kind: "error",
    title: "Schedule needs attention",
    message: preview.message
  }), overLimit && React.createElement(OtWarning, {
    kind: "critical",
    title: "Request blocked",
    message: `Week of ${formatOtDate(weekStart)} has ${formatOtHours(currentWeekMinutes)} counted. This adds ${formatOtHours(addedMinutes)}, above the 36h limit.`
  }), React.createElement("label", {
    className: "ot-consent"
  }, React.createElement("input", {
    type: "checkbox",
    checked: form.consented,
    onChange: event => update("consented", event.target.checked)
  }), React.createElement("span", null, "I consent to this overtime occurrence and confirm the planned date and time shown above.")), React.createElement("small", {
    className: "muted"
  }, "Consent statement version ", OT_CONSENT_STATEMENT_VERSION), submitState.message && React.createElement("div", {
    ref: errorRef,
    tabIndex: submitState.status === "error" ? "-1" : undefined
  }, React.createElement(OtWarning, {
    kind: submitState.status === "error" ? "error" : "info",
    message: submitState.message
  })), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn--primary",
    disabled: !canSubmit
  }, submitState.status === "submitting" ? "Submitting…" : "Submit OT request")));
}
function OtConsentPanel({
  request,
  currentWeekMinutes,
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
  const plannedMinutes = Number(otValue(request, "plannedMinutes", "planned_minutes") || 0);
  const projectedMinutes = Number(currentWeekMinutes || 0);
  const overLimit = projectedMinutes > OT_LIMIT_MINUTES;
  const start = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
  const end = getOtBangkokParts(otValue(request, "plannedEndAt", "planned_end_at"));
  useEffectApp(() => {
    if (submitState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [submitState.status]);
  async function recordConsent(choice) {
    if (choice && (!accepted || overLimit)) {
      setSubmitState({
        status: "error",
        message: overLimit ? "Consent is blocked because the projected week exceeds 36 hours." : "Check the consent box before accepting this occurrence."
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
      await window.recordOtConsent(request.id, choice, key);
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
  }, React.createElement("div", null, React.createElement("span", null, "Assigned event"), React.createElement("strong", null, request.title || "—")), React.createElement("div", null, React.createElement("span", null, "Function"), React.createElement("strong", null, String(otValue(request, "functionCode", "function_code") || "—").toUpperCase())), React.createElement("div", null, React.createElement("span", null, "Venue"), React.createElement("strong", null, otValue(request, "venue", "venue") || getOtStatusLabel(otValue(request, "workLocationType", "work_location_type")))), React.createElement("div", null, React.createElement("span", null, "Planned schedule"), React.createElement("strong", null, formatOtDate(start.date), " ", start.time, " – ", start.date === end.date ? "" : `${formatOtDate(end.date)} `, end.time)), React.createElement("div", null, React.createElement("span", null, "Break"), React.createElement("strong", null, otValue(request, "plannedBreakMinutes", "planned_break_minutes") || 0, " min")), React.createElement("div", null, React.createElement("span", null, "Planned hours"), React.createElement("strong", null, formatOtHours(plannedMinutes))), React.createElement("div", null, React.createElement("span", null, "Week total after consent"), React.createElement("strong", null, formatOtHours(projectedMinutes), " / 36h")), React.createElement("div", null, React.createElement("span", null, "Remaining after consent"), React.createElement("strong", null, formatOtHours(Math.max(0, OT_LIMIT_MINUTES - projectedMinutes))))), React.createElement(OtLimitProgress, {
    totalMinutes: projectedMinutes
  }), overLimit && React.createElement(OtWarning, {
    kind: "critical",
    title: "Consent blocked",
    message: "The projected weekly total is above 36 hours. Reload the week or contact the Event Lead because the server will not accept this planned occurrence."
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
    kind: submitState.status === "error" ? "error" : "info",
    message: submitState.message
  })), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    disabled: !accepted || overLimit || submitState.status === "submitting",
    onClick: () => recordConsent(true)
  }, "Accept occurrence"), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    disabled: submitState.status === "submitting",
    onClick: () => recordConsent(false)
  }, "Decline occurrence")));
}
function OtActualConfirmationForm({
  request,
  currentActualWeekMinutes,
  onSuccess
}) {
  const plannedStart = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
  const plannedEnd = getOtBangkokParts(otValue(request, "plannedEndAt", "planned_end_at"));
  const plannedMinutes = Number(otValue(request, "plannedMinutes", "planned_minutes") || 0);
  const existingActualMinutes = Number(otValue(request, "actualMinutes", "actual_minutes") || 0);
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
  const [idempotencyKey, setIdempotencyKey] = useStateApp(() => crypto.randomUUID());
  const errorRef = useRefApp(null);
  useEffectApp(() => {
    if (submitState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [submitState.status]);
  function update(field, value) {
    setForm(current => ({
      ...current,
      [field]: value
    }));
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
  const projectedActualMinutes = Math.max(0, Number(currentActualWeekMinutes || 0) - existingActualMinutes) + actualMinutes;
  const complianceLikely = preview.valid && projectedActualMinutes > OT_LIMIT_MINUTES;
  const canSubmit = preview.valid && (!varianceRequired || form.varianceReason.trim()) && submitState.status !== "submitting" && submitState.status !== "success";
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
      const result = await window.submitOtActual(request.id, payload, idempotencyKey);
      const status = otValue(result, "status", "status");
      setIdempotencyKey(crypto.randomUUID());
      if (status === "compliance_review_required") {
        setSubmitState({
          status: "success",
          message: "Actual hours saved truthfully. Compliance review is required before this record can become HR ready.",
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
    "aria-label": "Actual weekly total"
  }, React.createElement("div", null, React.createElement("span", null, "Planned"), React.createElement("strong", null, formatOtHours(plannedMinutes))), React.createElement("div", null, React.createElement("span", null, "Actual"), React.createElement("strong", null, preview.valid ? formatOtHours(actualMinutes) : "—")), React.createElement("div", null, React.createElement("span", null, "Week actual after save"), React.createElement("strong", null, preview.valid ? formatOtHours(projectedActualMinutes) : "—")), React.createElement("div", null, React.createElement("span", null, "Remaining"), React.createElement("strong", null, preview.valid ? formatOtHours(Math.max(0, OT_LIMIT_MINUTES - projectedActualMinutes)) : "—"))), preview.valid && React.createElement(OtLimitProgress, {
    totalMinutes: projectedActualMinutes
  }), !preview.valid && React.createElement(OtWarning, {
    kind: "error",
    title: "Actual schedule needs attention",
    message: preview.message
  }), complianceLikely && React.createElement(OtWarning, {
    kind: "critical",
    title: "Compliance review expected",
    message: "Submit the truthful actual hours. They will be saved and routed for compliance review rather than blocked."
  }), submitState.message && React.createElement("div", {
    ref: errorRef,
    tabIndex: submitState.status === "error" ? "-1" : undefined
  }, React.createElement(OtWarning, {
    kind: submitState.status === "error" ? "error" : "info",
    message: submitState.message
  })), React.createElement("div", {
    className: "ot-form__actions"
  }, React.createElement("button", {
    type: "submit",
    className: "btn btn--primary",
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
    const canConfirm = status === "actual_confirmation_required" || otValue(request, "actualDecision", "actual_decision") === "revision_required";
    return React.createElement("tr", {
      key: request.id
    }, React.createElement("td", null, formatOtDate(start.date)), React.createElement("td", null, React.createElement("strong", null, request.title), React.createElement("small", null, String(otValue(request, "functionCode", "function_code") || "").toUpperCase())), React.createElement("td", null, formatOtHours(otValue(request, "plannedMinutes", "planned_minutes"))), React.createElement("td", null, otValue(request, "actualMinutes", "actual_minutes") ? formatOtHours(otValue(request, "actualMinutes", "actual_minutes")) : "—"), React.createElement("td", null, React.createElement("span", {
      className: `ot-status ot-status--${status}`
    }, getOtStatusLabel(status))), React.createElement("td", null, canConsent ? React.createElement("button", {
      type: "button",
      className: "btn btn--sm btn--secondary",
      onClick: () => onAction("consent", request)
    }, "Review consent") : canConfirm ? React.createElement("button", {
      type: "button",
      className: "btn btn--sm btn--secondary",
      onClick: () => onAction("actual", request)
    }, "Confirm actual") : React.createElement("span", {
      className: "muted"
    }, "No action")));
  })))));
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
  useEffectApp(() => {
    let alive = true;
    const loadAccess = window.loadOtAccessContext ? window.loadOtAccessContext() : Promise.reject(new Error("OT Request data service is not ready."));
    loadAccess.then(data => {
      if (!alive) return;
      const serverAccess = data || {};
      setAccess({
        status: "ready",
        ...serverAccess,
        canManage: Boolean(serverAccess.isEligibleApprover || serverAccess.isOwner || serverAccess.isHrAdmin),
        canExport: Boolean(serverAccess.isOwner || serverAccess.isHrAdmin)
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
    if (access.status === "loading") return;
    if (canOpenOtRequestView(activeView, access)) return;
    setActiveView("overview");
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#ot-request`);
  }, [access, activeView]);
  function openView(view) {
    if (!canOpenOtRequestView(view, access)) return;
    setActiveView(view);
    window.location.hash = OT_REQUEST_VIEW_ROUTES[view] || OT_REQUEST_VIEW_ROUTES.overview;
  }
  const visibleView = canOpenOtRequestView(activeView, access) ? activeView : "overview";
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
    manager: {
      eyebrow: "Manage",
      title: "Team OT overview",
      detail: "Authorized approvers can monitor assigned overtime workflows here."
    },
    "root-causes": {
      eyebrow: "Understand",
      title: "Root causes",
      detail: "Authorized managers can review structured overtime drivers here."
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
  }, React.createElement("div", {
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
  }), " My requests"), access.status === "ready" && access.canManage && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "nav-section"
  }, "Manage"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "manager" ? "is-active" : ""}`,
    "aria-current": visibleView === "manager" ? "page" : undefined,
    onClick: () => openView("manager")
  }, React.createElement(Icon, {
    name: "users",
    size: 16
  }), " Team OT"), React.createElement("button", {
    type: "button",
    className: `nav-item ${visibleView === "root-causes" ? "is-active" : ""}`,
    "aria-current": visibleView === "root-causes" ? "page" : undefined,
    onClick: () => openView("root-causes")
  }, React.createElement(Icon, {
    name: "chart",
    size: 16
  }), " Root causes"))), React.createElement("main", {
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
  }, viewCopy.detail))), access.status === "ready" && (visibleView === "overview" || visibleView === "my-requests") ? React.createElement(OtEmployeeDashboard, {
    access: access,
    listOnly: visibleView === "my-requests"
  }) : access.status === "ready" && React.createElement("section", {
    className: "ot-metric-grid",
    "aria-label": "OT workspace status"
  }, React.createElement("div", {
    className: "stat"
  }, React.createElement("span", null, "Weekly limit"), React.createElement("strong", null, access.weeklyLimitMinutes ? `${access.weeklyLimitMinutes / 60}h` : "—")), React.createElement("div", {
    className: "stat"
  }, React.createElement("span", null, "Timezone"), React.createElement("strong", null, access.timezone || "Asia/Bangkok")), React.createElement("div", {
    className: "stat"
  }, React.createElement("span", null, "Workweek"), React.createElement("strong", null, access.weekStartsOn === "monday" ? "Mon–Sun" : "—"))))));
}
window.OtRequestShell = OtRequestShell;
