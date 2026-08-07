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
  function refreshAfterAction() {
    setAction(null);
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
    onChange: event => selectWeek(event.target.value)
  })), React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    onClick: () => setAction({
      type: "new",
      request: null
    })
  }, "New OT request")), loadState.status === "error" && React.createElement("div", {
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
function OtRequestForm({
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
  const [intent, setIntent] = useStateApp(() => ({
    key: crypto.randomUUID(),
    attempted: false
  }));
  const errorRef = useRefApp(null);
  const approverErrorRef = useRefApp(null);
  const summaryErrorRef = useRefApp(null);
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
  useEffectApp(() => {
    if (approverState.status === "error" && approverErrorRef.current) approverErrorRef.current.focus();
  }, [approverState.status]);
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
    totalField: "plannedMinutes"
  }) : [];
  const overLimit = projections.some(row => row.overLimit);
  const detailRequired = OT_DETAIL_REQUIRED_REASONS.has(form.reasonCode);
  const venueRequired = form.workLocationType === "venue";
  const approverUnavailable = approverState.status !== "ready" || approverState.rows.length === 0;
  const canSubmit = preview.valid && !overLimit && form.functionCode && form.title.trim() && form.reasonCode && (!detailRequired || form.reasonDetail.trim()) && (!venueRequired || form.venue.trim()) && form.approverUserId && form.consented && !approverUnavailable && weekSummaryState.status === "ready" && submitState.status !== "submitting";
  useEffectApp(() => {
    if (weekSummaryState.status === "error" && summaryErrorRef.current) summaryErrorRef.current.focus();
  }, [weekSummaryState.status]);
  async function submitRequest(event) {
    event.preventDefault();
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
      await window.createOtRequest(payload, intent.key);
      setSubmitState({
        status: "success",
        message: "Your OT request was submitted for approval."
      });
      setIntent({
        key: crypto.randomUUID(),
        attempted: false
      });
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
  }, React.createElement("fieldset", {
    className: "ot-form__fieldset",
    disabled: window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)
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
    className: "field__error",
    role: "alert",
    tabIndex: "-1",
    ref: approverErrorRef
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
  const plannedMinutes = Number(otValue(request, "plannedMinutes", "planned_minutes") || 0);
  const plannedSegments = getOtWeekSegments(request, "planned");
  const weekSummaryState = useOtWeekSummaries(plannedSegments);
  const projections = weekSummaryState.status === "ready" ? window.FlowMateOtRequestDomain.buildWeekProjections(plannedSegments, weekSummaryState.summaries, {
    totalField: "plannedMinutes",
    excludedSegments: plannedSegments
  }) : [];
  const overLimit = projections.some(row => row.overLimit);
  const start = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
  const end = getOtBangkokParts(otValue(request, "plannedEndAt", "planned_end_at"));
  useEffectApp(() => {
    if (submitState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [submitState.status]);
  useEffectApp(() => {
    if (weekSummaryState.status === "error" && summaryErrorRef.current) summaryErrorRef.current.focus();
  }, [weekSummaryState.status]);
  async function recordConsent(choice) {
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
    disabled: !accepted || overLimit || weekSummaryState.status !== "ready" || submitState.status === "submitting",
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
  onSuccess
}) {
  const plannedStart = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
  const plannedEnd = getOtBangkokParts(otValue(request, "plannedEndAt", "planned_end_at"));
  const plannedMinutes = Number(otValue(request, "plannedMinutes", "planned_minutes") || 0);
  const existingActualSegments = getOtWeekSegments(request, "actual");
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
    totalField: "actualMinutes",
    excludedSegments: existingActualSegments
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
    title: "Compliance review expected",
    message: "Submit the truthful actual hours. They will be saved and routed for compliance review rather than blocked."
  })), submitState.message && React.createElement("div", {
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
const OT_MANAGER_METRIC_LABELS = ["Planned OT", "Confirmed", "Needs approval", "Near 36h limit"];
const OT_ROOT_CAUSE_LABELS = ["OT by function", "Why OT happens"];
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
  return rows.reduce((totals, request) => {
    if (["cancelled", "rejected"].includes(getOtRequestStatus(request))) return totals;
    const employeeId = getOtManagerEmployeeId(request);
    const key = byWeek ? `${employeeId}:${request.weekStart}` : employeeId;
    const current = totals[key] || {
      plannedMinutes: 0,
      actualMinutes: 0,
      countedMinutes: 0
    };
    const plannedMinutes = Number(otValue(request, "plannedMinutes", "planned_minutes") || 0);
    const actualMinutes = Number(otValue(request, "actualMinutes", "actual_minutes") || 0);
    current.plannedMinutes += plannedMinutes;
    current.actualMinutes += actualMinutes;
    current.countedMinutes += actualMinutes || plannedMinutes;
    totals[key] = current;
    return totals;
  }, {});
}
function isOtActualConfirmed(request) {
  return window.FlowMateOtRequestDomain.isConfirmedActual(request);
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
function OtManagerDashboard({
  access,
  rootCauseOnly = false
}) {
  const [weekStart, setWeekStart] = useStateApp(getCurrentOtWeekStart);
  const [functionFilter, setFunctionFilter] = useStateApp("");
  const [filters, setFilters] = useStateApp({
    eventPlanId: "",
    reasonCode: "",
    status: "",
    nearLimit: false
  });
  const [loadState, setLoadState] = useStateApp({
    status: "loading",
    rows: [],
    peopleById: {},
    message: ""
  });
  const [refreshKey, setRefreshKey] = useStateApp(0);
  const [showEventForm, setShowEventForm] = useStateApp(false);
  const [selectedRow, setSelectedRow] = useStateApp(null);
  const errorRef = useRefApp(null);
  useEffectApp(() => {
    let alive = true;
    const weeks = rootCauseOnly ? [0, -7, -14, -21, -28].map(offset => addOtDays(weekStart, offset)) : [weekStart];
    setLoadState(current => ({
      ...current,
      status: "loading",
      message: ""
    }));
    Promise.all([Promise.all(weeks.map(managerWeek => window.loadOtManagerDashboard(managerWeek, functionFilter || null))), window.loadOtPeopleForEvent()]).then(([dashboards, people]) => {
      if (!alive) return;
      const rows = dashboards.flatMap((dashboard, index) => {
        const managerWeek = weeks[index];
        return (Array.isArray(dashboard?.requests) ? dashboard.requests : []).map(request => normalizeOtManagerRow(request, managerWeek));
      });
      const referencedIds = new Set(rows.map(getOtManagerEmployeeId));
      const peopleById = (Array.isArray(people) ? people : []).reduce((lookup, person) => {
        if (referencedIds.has(person.userId)) lookup[person.userId] = person;
        return lookup;
      }, {});
      setLoadState({
        status: "ready",
        rows,
        peopleById,
        message: ""
      });
    }).catch(error => {
      if (alive) setLoadState(current => ({
        ...current,
        status: "error",
        message: error.message || "Assigned OT could not be loaded."
      }));
    });
    return () => {
      alive = false;
    };
  }, [weekStart, functionFilter, refreshKey, rootCauseOnly]);
  useEffectApp(() => {
    if (loadState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [loadState.status]);
  function updateFilter(field, value) {
    setFilters(current => ({
      ...current,
      [field]: value
    }));
    setSelectedRow(null);
  }
  const currentRows = loadState.rows.filter(request => request.weekStart === weekStart);
  const currentEmployeeTotals = getOtManagerTotals(currentRows);
  const historyEmployeeTotals = getOtManagerTotals(loadState.rows, true);
  const filteredCurrentRows = applyOtManagerFilters(currentRows, filters, currentEmployeeTotals);
  const filteredRows = applyOtManagerFilters(loadState.rows, filters, historyEmployeeTotals);
  const eventOptions = Array.from(new Map(currentRows.filter(request => otValue(request, "eventPlanId", "event_plan_id")).map(request => [otValue(request, "eventPlanId", "event_plan_id"), request.title])).entries());
  const statusOptions = Array.from(new Set(currentRows.map(getOtRequestStatus))).sort();
  const plannedMinutes = filteredCurrentRows.filter(request => !["cancelled", "rejected"].includes(getOtRequestStatus(request))).reduce((sum, request) => sum + Number(request.plannedMinutes || 0), 0);
  const confirmedMinutes = filteredCurrentRows.filter(isOtActualConfirmed).reduce((sum, request) => sum + Number(request.actualMinutes || 0), 0);
  const needsApproval = filteredCurrentRows.filter(request => !otValue(request, "actualSubmittedAt", "actual_submitted_at") && ["pending_approval", "revision_required"].includes(getOtRequestStatus(request))).length;
  const nearLimit = new Set(filteredCurrentRows.filter(request => (currentEmployeeTotals[getOtManagerEmployeeId(request)]?.countedMinutes || 0) >= 30 * 60).map(getOtManagerEmployeeId)).size;
  const metricValues = [formatOtHours(plannedMinutes), formatOtHours(confirmedMinutes), String(needsApproval), String(nearLimit)];
  if (loadState.status === "loading" && !loadState.rows.length) {
    return React.createElement("div", {
      className: "ot-state",
      role: "status"
    }, "Loading assigned OT operations…");
  }
  if (loadState.status === "error" && !loadState.rows.length) {
    return React.createElement("div", {
      className: "ot-state",
      role: "alert",
      tabIndex: "-1",
      ref: errorRef
    }, React.createElement("strong", null, "Assigned OT could not be loaded."), React.createElement("span", null, loadState.message), React.createElement("button", {
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
  }, React.createElement("strong", null, "Assigned teams/events only"), React.createElement("span", null, "Rows come from the server-authorized manager scope. Filters never widen access.")), React.createElement("section", {
    className: "ot-manager-filters",
    "aria-label": "OT filters"
  }, React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Week"), React.createElement("input", {
    className: "input",
    type: "date",
    value: weekStart,
    onChange: event => setWeekStart(window.FlowMateOtRequestDomain.getWeekStartKey(event.target.value))
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
  }, "All assigned Functions"), OT_FUNCTIONS.map(option => React.createElement("option", {
    key: option.value,
    value: option.value
  }, option.label)))), React.createElement("label", {
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
  }, title)))), React.createElement("label", {
    className: "field"
  }, React.createElement("span", {
    className: "field__label"
  }, "Reason"), React.createElement("select", {
    className: "select",
    value: filters.reasonCode,
    onChange: event => updateFilter("reasonCode", event.target.value)
  }, React.createElement("option", {
    value: ""
  }, "All reasons"), window.FlowMateOtRequestDomain.REASON_OPTIONS.map(reason => React.createElement("option", {
    key: reason.key,
    value: reason.key
  }, reason.label)))), React.createElement("label", {
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
  }, getOtStatusLabel(status))))), React.createElement("label", {
    className: "ot-filter-check"
  }, React.createElement("input", {
    type: "checkbox",
    checked: filters.nearLimit,
    onChange: event => updateFilter("nearLimit", event.target.checked)
  }), React.createElement("span", null, "Near limit only"))), loadState.status === "error" && React.createElement("div", {
    ref: errorRef,
    tabIndex: "-1"
  }, React.createElement(OtWarning, {
    kind: "error",
    title: "Refresh failed",
    message: `${loadState.message} Existing server-scoped rows remain visible.`
  }), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: () => setRefreshKey(value => value + 1)
  }, "Retry refresh")), rootCauseOnly ? React.createElement(OtRootCausePanel, {
    filteredRows: filteredRows,
    currentWeekStart: weekStart,
    peopleById: loadState.peopleById
  }) : React.createElement(React.Fragment, null, React.createElement("section", {
    className: "ot-metric-grid ot-metric-grid--manager",
    "aria-label": "Assigned weekly OT summary"
  }, OT_MANAGER_METRIC_LABELS.map((label, index) => React.createElement("section", {
    className: "ot-metric",
    key: label
  }, React.createElement("span", null, label), React.createElement("strong", null, metricValues[index])))), React.createElement("div", {
    className: "ot-manager-actions"
  }, access.isEligibleApprover && React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    onClick: () => setShowEventForm(value => !value)
  }, showEventForm ? "Close event plan" : "Create Event OT plan"), React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    onClick: () => setRefreshKey(value => value + 1)
  }, "Refresh assigned scope")), showEventForm && React.createElement("section", {
    className: "ot-workflow"
  }, React.createElement("div", {
    className: "ot-workflow__head"
  }, React.createElement("h2", null, "Shared Event OT plan")), React.createElement(OtEventPlanForm, {
    access: access,
    onSuccess: () => setRefreshKey(value => value + 1)
  })), React.createElement(OtApprovalQueue, {
    access: access,
    requests: filteredCurrentRows,
    allRequests: currentRows,
    weekStart: weekStart,
    peopleById: loadState.peopleById,
    onChanged: () => setRefreshKey(value => value + 1)
  }), React.createElement(OtTeamWeekTable, {
    requests: filteredCurrentRows,
    allRequests: currentRows,
    peopleById: loadState.peopleById,
    onOpenRequest: setSelectedRow
  }), selectedRow && React.createElement("section", {
    className: "ot-manager-detail",
    "aria-label": "Authorized OT details"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("h2", null, selectedRow.title), React.createElement("button", {
    type: "button",
    className: "btn btn--ghost",
    onClick: () => setSelectedRow(null)
  }, "Close")), React.createElement("div", {
    className: "ot-detail-grid"
  }, React.createElement("div", null, React.createElement("span", null, "Employee"), React.createElement("strong", null, getOtManagerEmployeeName(selectedRow, loadState.peopleById))), React.createElement("div", null, React.createElement("span", null, "Function"), React.createElement("strong", null, String(otValue(selectedRow, "functionCode", "function_code") || "—").toUpperCase())), React.createElement("div", null, React.createElement("span", null, "Reason"), React.createElement("strong", null, getOtStatusLabel(otValue(selectedRow, "reasonCode", "reason_code")))), React.createElement("div", null, React.createElement("span", null, "Status"), React.createElement("strong", null, getOtStatusLabel(getOtRequestStatus(selectedRow))))))));
}
function OtApprovalQueue({
  access,
  requests,
  allRequests,
  peopleById,
  onChanged
}) {
  const [selected, setSelected] = useStateApp(null);
  const [note, setNote] = useStateApp("");
  const [bulkReview, setBulkReview] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({
    status: "idle",
    message: ""
  });
  const employeeTotals = getOtManagerTotals(allRequests);
  const planRequests = requests.filter(request => otValue(request, "source", "source") === "employee_request" && !otValue(request, "actualSubmittedAt", "actual_submitted_at") && ["pending_approval", "revision_required"].includes(getOtRequestStatus(request)));
  const actualRequests = requests.filter(request => ["pending_actual_verification", "compliance_review_required"].includes(getOtRequestStatus(request)));
  function canAct(request) {
    return window.FlowMateOtRequestDomain.canActOnAssignedRequest(access, request);
  }
  function getActualChecks(request) {
    const weeklyTotal = employeeTotals[getOtManagerEmployeeId(request)]?.countedMinutes || 0;
    return window.FlowMateOtRequestDomain.getActualVerificationEligibility(request, weeklyTotal);
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
    if (checks.complianceRequired) reasons.push("Compliance review required; verify this occurrence individually.");
    if (checks.weeklyTotal > OT_LIMIT_MINUTES) reasons.push("Employee weekly total is above 36h.");
    if (!checks.actualSubmitted) reasons.push("Actual time has not been submitted with weekly segments.");
    return reasons.length ? reasons : ["This occurrence is not ready for bulk verification."];
  }
  function openDecision(kind, request) {
    if (!canAct(request)) return;
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
    if (!selected || !canAct(selected.request) || actionState.status === "submitting") return;
    if (decision !== "approved" && !note.trim()) {
      setActionState({
        status: "error",
        message: "A note is required when rejecting or returning OT."
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
    setActionState({
      status: "submitting",
      message: "Saving the audited decision…"
    });
    try {
      if (selected.kind === "plan") {
        await window.reviewOtPlan(getOtManagerRequestId(selected.request), decision, note.trim() || null, crypto.randomUUID());
      } else {
        await window.verifyOtActual(getOtManagerRequestId(selected.request), decision, note.trim() || null, crypto.randomUUID());
      }
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
    }
  }
  function openBulkReview() {
    if (actionState.status === "submitting") return;
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
    if (!requestsToVerify.length || actionState.status === "submitting") return;
    setActionState({
      status: "submitting",
      message: `Verifying ${requestsToVerify.length} eligible actual occurrence(s) individually…`
    });
    let completed = 0;
    try {
      for (const request of requestsToVerify) {
        await window.verifyOtActual(getOtManagerRequestId(request), "approved", "Bulk verified after individual checks.", crypto.randomUUID());
        completed += 1;
      }
      setActionState({
        status: "success",
        message: `${completed} actual occurrence(s) verified individually and audited.`
      });
      setBulkReview(null);
      onChanged();
    } catch (error) {
      setActionState({
        status: "error",
        message: `${completed} verified. Bulk action stopped at the first server error: ${error.message || "Verification failed."}`
      });
      onChanged();
    }
  }
  const selectedChecks = selected?.kind === "actual" ? getActualChecks(selected.request) : null;
  const selectedTotal = selected ? employeeTotals[getOtManagerEmployeeId(selected.request)]?.countedMinutes || 0 : 0;
  const selectedPlanned = selected ? getOccurrenceMinutes(selected.request, "plannedMinutes") : 0;
  const selectedActual = selected ? getOccurrenceMinutes(selected.request, "actualMinutes") : 0;
  const eligibleActualCount = actualRequests.filter(request => canAct(request) && getActualChecks(request).canBulkVerify).length;
  function renderQueueItem(kind, request, statusNode) {
    const content = React.createElement(React.Fragment, null, React.createElement("span", null, React.createElement("strong", null, request.title), React.createElement("small", null, getOtManagerEmployeeName(request, peopleById))), statusNode);
    return canAct(request) ? React.createElement("button", {
      key: request.id,
      type: "button",
      className: "ot-queue-item",
      onClick: () => openDecision(kind, request)
    }, content) : React.createElement("div", {
      key: request.id,
      className: "ot-queue-item ot-queue-item--readonly"
    }, content, React.createElement("small", null, "Read only — assigned approver action"));
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
    return renderQueueItem("actual", request, React.createElement("span", {
      className: `ot-status ${checks.canVerifyIndividually ? "" : "ot-status--revision_required"}`
    }, checks.canVerifyIndividually ? "Ready" : "Review"));
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
  }, "Decision note ", selected.kind === "plan" ? "(required for reject)" : "(required for return)"), React.createElement("textarea", {
    className: "textarea",
    value: note,
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
    disabled: selectedTotal > OT_LIMIT_MINUTES || actionState.status === "submitting",
    onClick: () => decide("approved")
  }, "Approve plan")) : React.createElement(React.Fragment, null, React.createElement("button", {
    type: "button",
    className: "btn btn--secondary",
    disabled: !note.trim() || actionState.status === "submitting",
    onClick: () => decide("revision_required")
  }, "Return actual"), React.createElement("button", {
    type: "button",
    className: "btn btn--primary",
    disabled: !selectedChecks?.canVerifyIndividually || actionState.status === "submitting",
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
  const baseComplete = schedule.valid && form.title.trim() && form.functionCode && form.reasonCode && (!detailRequired || form.reasonDetail.trim()) && (!venueRequired || form.venue.trim()) && form.approverUserId && form.employeeUserIds.length > 0 && directoryState.status === "ready";
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
  peopleById,
  onOpenRequest
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
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Employee"), React.createElement("th", null, "Function"), React.createElement("th", null, "Assignment / event"), React.createElement("th", null, "Planned"), React.createElement("th", null, "Actual"), React.createElement("th", null, "Weekly total"), React.createElement("th", null, "Remaining"), React.createElement("th", null, "Status"), React.createElement("th", null, "Details"))), React.createElement("tbody", null, groups.map(functionGroup => React.createElement(React.Fragment, {
    key: functionGroup.functionCode
  }, React.createElement("tr", {
    className: "ot-table-group"
  }, React.createElement("th", {
    colSpan: "9",
    scope: "rowgroup"
  }, OT_FUNCTIONS.find(option => option.value === functionGroup.functionCode)?.label || String(functionGroup.functionCode).toUpperCase())), functionGroup.employees.map(employeeGroup => employeeGroup.requests.map((request, index) => {
    const total = employeeTotals[employeeGroup.employeeId]?.countedMinutes || 0;
    const remaining = Math.max(0, OT_LIMIT_MINUTES - total);
    return React.createElement("tr", {
      key: request.id
    }, index === 0 && React.createElement("th", {
      rowSpan: employeeGroup.requests.length,
      scope: "row"
    }, React.createElement("strong", null, employeeGroup.name), React.createElement("small", null, employeeGroup.requests.length, " occurrence", employeeGroup.requests.length === 1 ? "" : "s")), React.createElement("td", null, String(functionGroup.functionCode).toUpperCase()), React.createElement("td", null, React.createElement("strong", null, request.title), React.createElement("small", null, otValue(request, "eventPlanId", "event_plan_id") ? "Shared event" : "Individual request")), React.createElement("td", null, formatOtHours(request.plannedMinutes)), React.createElement("td", null, request.actualMinutes ? formatOtHours(request.actualMinutes) : "—"), React.createElement("td", null, React.createElement("strong", null, formatOtHours(total)), React.createElement(OtLimitProgress, {
      totalMinutes: total
    })), React.createElement("td", null, formatOtHours(remaining)), React.createElement("td", null, React.createElement("span", {
      className: `ot-status ot-status--${getOtRequestStatus(request)}`
    }, getOtStatusLabel(getOtRequestStatus(request)))), React.createElement("td", null, React.createElement("button", {
      type: "button",
      className: "btn btn--sm btn--secondary",
      onClick: () => onOpenRequest(request)
    }, "Open")));
  }))))))));
}
function OtRootCausePanel({
  filteredRows,
  currentWeekStart,
  peopleById
}) {
  const [selectedInsight, setSelectedInsight] = useStateApp(null);
  const confirmedRows = filteredRows.filter(isOtActualConfirmed);
  const insights = window.FlowMateOtRequestDomain.buildRootCauseInsights(filteredRows, {
    currentWeekStart
  });
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
  const recurringWeeks = new Set(confirmedRows.map(request => request.weekStart)).size;
  const insightCopy = {
    function_confirmed_ot_change: "Function confirmed OT changed at least 25% against the prior four-week average.",
    recurring_employee_high_ot: "A named employee in the authorized scope crossed the advisory threshold for two consecutive weeks.",
    event_actual_exceeds_plan: "A shared event's actual OT exceeded its plan by at least 20%.",
    emergency_ot_share: "Emergency OT represents at least 30% of confirmed OT for a Function.",
    recurring_rework_or_scope_change: "Rework or scope change appeared at least three times within four weeks."
  };
  const selectedRows = selectedInsight ? filteredRows.filter(request => selectedInsight.recordIds.includes(request.id)) : [];
  return React.createElement("section", {
    className: "ot-root-cause",
    "aria-labelledby": "ot-root-cause-title"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("div", null, React.createElement("h2", {
    id: "ot-root-cause-title"
  }, "OT Health & Root Cause"), React.createElement("p", {
    className: "muted"
  }, "Operational patterns by reason, Function, event, and week. Current filters stay applied to every drill-down.")), React.createElement("span", null, confirmedRows.length, " confirmed rows")), !confirmedRows.length ? React.createElement("div", {
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
  }, React.createElement("h3", null, "Five approved operational checks"), React.createElement("span", null, insights.length, " signal", insights.length === 1 ? "" : "s")), !insights.length ? React.createElement("div", {
    className: "ot-state ot-state--compact"
  }, "No deterministic rule is triggered by the confirmed rows in this scope.") : insights.map((insight, index) => React.createElement("article", {
    className: "ot-insight",
    key: `${insight.key}:${index}`
  }, React.createElement("div", null, React.createElement("strong", null, insightCopy[insight.key] || insight.message), React.createElement("small", null, insight.message)), React.createElement("button", {
    type: "button",
    className: "btn btn--sm btn--secondary",
    onClick: () => setSelectedInsight(insight)
  }, "View authorized rows"))))), selectedInsight && React.createElement("section", {
    className: "ot-manager-detail",
    "aria-label": "Authorized root cause drill-down"
  }, React.createElement("div", {
    className: "ot-section-head"
  }, React.createElement("h3", null, "Authorized rows behind this signal"), React.createElement("button", {
    type: "button",
    className: "btn btn--ghost",
    onClick: () => setSelectedInsight(null)
  }, "Close")), React.createElement("p", {
    className: "muted"
  }, "Current filters stay applied. Only rows already returned by the assigned-scope manager RPC are shown."), selectedRows.map(request => React.createElement("article", {
    className: "ot-insight-row",
    key: request.id
  }, React.createElement("div", null, React.createElement("strong", null, getOtManagerEmployeeName(request, peopleById)), React.createElement("small", null, request.title, " · ", String(otValue(request, "functionCode", "function_code") || "").toUpperCase())), React.createElement("span", null, formatOtHours(request.actualMinutes))))));
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
  }, viewCopy.detail))), access.status === "ready" && (visibleView === "overview" || visibleView === "my-requests") && React.createElement(OtEmployeeDashboard, {
    access: access,
    listOnly: visibleView === "my-requests"
  }), access.status === "ready" && visibleView === "manager" && React.createElement(OtManagerDashboard, {
    access: access
  }), access.status === "ready" && visibleView === "root-causes" && React.createElement(OtManagerDashboard, {
    access: access,
    rootCauseOnly: true
  }))));
}
window.OtRequestShell = OtRequestShell;
