const OT_REQUEST_VIEW_ROUTES = {
  overview: "ot-request",
  "my-requests": "ot-request/my-requests",
  manager: "ot-request/manager",
  "root-causes": "ot-request/root-causes",
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
    day: "2-digit",
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
    year: "numeric",
  }).format(new Date(`${dateKey}T00:00:00+07:00`));
}

function getOtBangkokParts(value) {
  if (!value) return { date: "", time: "" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { date: `${fields.year}-${fields.month}-${fields.day}`, time: `${fields.hour}:${fields.minute}` };
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
    return window.FlowMateOtRequestDomain.deriveRequestStatus(request, { now: new Date().toISOString() });
  } catch (error) {
    return "draft";
  }
}

function OtWarning({ kind = "info", title, message, testId }) {
  if (!message) return null;
  return (
    <div className={`ot-warning ${kind === "error" || kind === "critical" ? "ot-warning--error" : ""}`} role={kind === "error" || kind === "critical" ? "alert" : "status"} data-testid={testId}>
      <span aria-hidden="true">{kind === "error" || kind === "critical" ? "⚠" : "ⓘ"}</span>
      <span><strong>{title ? `${title}: ` : ""}</strong>{message}</span>
    </div>
  );
}

function OtLimitProgress({ totalMinutes }) {
  const state = window.FlowMateOtRequestDomain.getLimitState(Math.max(0, Number(totalMinutes || 0)));
  const percent = Math.min(100, Math.round((state.totalMinutes / OT_LIMIT_MINUTES) * 100));
  return (
    <div className={`ot-limit ot-limit--${state.key}`}>
      <div className="ot-limit__track" role="progressbar" aria-label="Weekly OT used" aria-valuemin="0" aria-valuemax="2160" aria-valuenow={Math.min(2160, state.totalMinutes)}>
        <span style={{ width: `${percent}%` }} />
      </div>
      {state.key !== "neutral" && <small>{state.key === "blocked" ? "Above the 36h limit" : state.key === "limit_reached" ? "36h limit reached" : state.key === "high_risk" ? "High risk — review remaining hours" : "Approaching weekly limit"}</small>}
    </div>
  );
}

function getOtWeekSegments(request, prefix) {
  const segments = otValue(request, `${prefix}WeekSegments`, `${prefix}_week_segments`);
  if (Array.isArray(segments) && segments.length) return segments;
  const startAt = otValue(request, `${prefix}StartAt`, `${prefix}_start_at`) || otValue(request, "plannedStartAt", "planned_start_at");
  const minutes = Number(otValue(request, `${prefix}Minutes`, `${prefix}_minutes`) || 0);
  const start = getOtBangkokParts(startAt);
  return start.date && minutes > 0
    ? [{ weekStart: window.FlowMateOtRequestDomain.getWeekStartKey(start.date), minutes }]
    : [];
}

function useOtWeekSummaries(segments) {
  const weekKey = Array.from(new Set((Array.isArray(segments) ? segments : []).map(segment => segment.weekStart).filter(Boolean))).sort().join("|");
  const [retryKey, setRetryKey] = useStateApp(0);
  const [state, setState] = useStateApp({ weekKey, status: weekKey ? "loading" : "ready", summaries: {}, message: "" });

  useEffectApp(() => {
    const weekStarts = weekKey ? weekKey.split("|") : [];
    if (!weekStarts.length) {
      setState({ weekKey, status: "ready", summaries: {}, message: "" });
      return undefined;
    }
    let alive = true;
    setState({ weekKey, status: "loading", summaries: {}, message: "" });
    Promise.all(weekStarts.map(weekStart => window.loadMyOtDashboard(weekStart))).then(dashboards => {
      if (!alive) return;
      const summaries = {};
      weekStarts.forEach((weekStart, index) => { summaries[weekStart] = dashboards[index] || {}; });
      setState({ weekKey, status: "ready", summaries, message: "" });
    }).catch(error => {
      if (alive) setState({ weekKey, status: "error", summaries: {}, message: error.message || "Weekly OT totals could not be loaded." });
    });
    return () => { alive = false; };
  }, [weekKey, retryKey]);

  const currentState = state.weekKey === weekKey
    ? state
    : { weekKey, status: weekKey ? "loading" : "ready", summaries: {}, message: "" };
  return { ...currentState, retry: () => setRetryKey(value => value + 1) };
}

function OtWeekProjection({ title, rows }) {
  if (!rows.length) return null;
  return (
    <section aria-label={title}>
      {rows.map(row => (
        <div key={row.weekStart}>
          <small className="muted">Week of {formatOtDate(row.weekStart)}</small>
          <section className="ot-preview">
            <div><span>Current</span><strong>{formatOtHours(row.currentMinutes)}</strong></div>
            <div><span>Added</span><strong>{formatOtHours(row.addedMinutes)}</strong></div>
            <div><span>Projected</span><strong>{formatOtHours(row.projectedMinutes)}</strong></div>
            <div><span>Remaining</span><strong>{formatOtHours(row.remainingMinutes)}</strong></div>
          </section>
          <OtLimitProgress totalMinutes={row.projectedMinutes} />
        </div>
      ))}
    </section>
  );
}

function OtEmployeeDashboard({ access, listOnly = false }) {
  const [weekStart, setWeekStart] = useStateApp(getCurrentOtWeekStart);
  const [loadState, setLoadState] = useStateApp(() => window.FlowMateOtRequestDomain.startPersonalWeekLoad(getCurrentOtWeekStart()));
  const [refreshKey, setRefreshKey] = useStateApp(0);
  const [action, setAction] = useStateApp(null);
  const loadErrorRef = useRefApp(null);

  useEffectApp(() => {
    let alive = true;
    setLoadState(current => current.weekStart === weekStart && current.dashboard
      ? { ...current, status: "loading", message: "" }
      : window.FlowMateOtRequestDomain.startPersonalWeekLoad(weekStart));
    Promise.all([
      window.loadMyOtDashboard(weekStart),
      window.loadMyOtRequests(weekStart),
    ]).then(([dashboard, requests]) => {
      if (!alive) return;
      setLoadState({
        status: "ready",
        weekStart,
        dashboard: dashboard || {},
        requests: Array.isArray(requests) ? requests : [],
        message: "",
      });
    }).catch(error => {
      if (alive) setLoadState(current => ({ ...current, status: "error", message: error.message || "Your OT could not be loaded." }));
    });
    return () => { alive = false; };
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
    return <div className="ot-state" role="status">Loading your OT week…</div>;
  }
  if (loadState.status === "error" && !loadState.dashboard) {
    return (
      <div className="ot-state" role="alert" tabIndex="-1" ref={loadErrorRef}>
        <strong>Your OT could not be loaded.</strong>
        <span>{loadState.message}</span>
        <button type="button" className="btn btn--secondary" onClick={() => setRefreshKey(value => value + 1)}>Retry</button>
      </div>
    );
  }

  const dashboard = loadState.dashboard || {};
  const requests = loadState.requests;
  const plannedMinutes = Number(dashboard.plannedMinutes || 0);
  const confirmedMinutes = Number(dashboard.actualMinutes || 0);
  const summary = {
    countedMinutes: plannedMinutes,
    plannedMinutes,
    confirmedMinutes,
    remainingMinutes: Math.max(0, OT_LIMIT_MINUTES - plannedMinutes),
  };
  const consentRequests = requests.filter(request => getOtRequestStatus(request) === "awaiting_consent" && !otValue(request, "employeeConsent", "employee_consent"));
  const actualRequests = requests.filter(request => getOtRequestStatus(request) === "actual_confirmation_required" || otValue(request, "actualDecision", "actual_decision") === "revision_required");

  return (
    <div className="ot-employee">
      <div className="ot-toolbar">
        <label className="field">
          <span className="field__label">Week starting</span>
          <input className="input" type="date" value={weekStart} onChange={event => selectWeek(event.target.value)} />
        </label>
        <button type="button" className="btn btn--primary" onClick={() => setAction({ type: "new", request: null })}>New OT request</button>
      </div>

      {loadState.status === "error" && (
        <div ref={loadErrorRef} tabIndex="-1">
          <OtWarning kind="error" title="Refresh failed" message={`${loadState.message} Your current form is preserved; retry when ready.`} />
          <button type="button" className="btn btn--secondary" onClick={() => setRefreshKey(value => value + 1)}>Retry refresh</button>
        </div>
      )}

      {!listOnly && (
        <>
          <section className="ot-metric-grid ot-metric-grid--employee" aria-label="Your weekly overtime">
            <section className="ot-metric" data-testid="ot-week-total">
              <span>Week total</span>
              <strong>{formatOtHours(summary.countedMinutes)} / 36h</strong>
              <OtLimitProgress totalMinutes={summary.countedMinutes} />
            </section>
            <section className="ot-metric"><span>Planned</span><strong>{formatOtHours(summary.plannedMinutes)}</strong></section>
            <section className="ot-metric"><span>Confirmed actual</span><strong>{formatOtHours(summary.confirmedMinutes)}</strong></section>
            <section className="ot-metric"><span>Remaining</span><strong>{formatOtHours(summary.remainingMinutes)}</strong></section>
            <section className="ot-metric"><span>Actions</span><strong>{consentRequests.length + actualRequests.length}</strong><small>{consentRequests.length} consent · {actualRequests.length} actual</small></section>
          </section>

          <section className="ot-actions" aria-label="Your required OT actions">
            {consentRequests.map(request => (
              <button key={request.id} type="button" className="ot-action-card" data-testid="ot-consent-required" onClick={() => setAction({ type: "consent", request })}>
                <strong>Consent required</strong><span>{request.title}</span><small>Review the occurrence and weekly total</small>
              </button>
            ))}
            {actualRequests.map(request => (
              <button key={request.id} type="button" className="ot-action-card" data-testid="ot-confirm-actual" onClick={() => setAction({ type: "actual", request })}>
                <strong>Confirm actual time</strong><span>{request.title}</span><small>Record the hours you actually worked</small>
              </button>
            ))}
            {!consentRequests.length && !actualRequests.length && <div className="ot-state ot-state--compact">No OT actions are waiting for you.</div>}
          </section>
        </>
      )}

      {action && (
        <section className="ot-workflow" aria-label="OT action">
          <div className="ot-workflow__head">
            <h2>{action.type === "new" ? "New OT request" : action.type === "consent" ? "Event consent" : "Confirm actual time"}</h2>
            <button type="button" className="btn btn--ghost" onClick={() => setAction(null)}>Close</button>
          </div>
          {action.type === "new" && <OtRequestForm weekStart={weekStart} onSuccess={refreshAfterAction} />}
          {action.type === "consent" && <OtConsentPanel request={action.request} onSuccess={refreshAfterAction} />}
          {action.type === "actual" && <OtActualConfirmationForm request={action.request} onSuccess={refreshAfterAction} />}
        </section>
      )}

      <OtMyRequestsTable requests={requests} onAction={(type, request) => setAction({ type, request })} />
    </div>
  );
}

function OtRequestForm({ weekStart, onSuccess }) {
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
    consented: false,
  });
  const [approverState, setApproverState] = useStateApp({ status: "loading", rows: [] });
  const [approverRetry, setApproverRetry] = useStateApp(0);
  const [submitState, setSubmitState] = useStateApp({ status: "idle", message: "" });
  const [intent, setIntent] = useStateApp(() => ({ key: crypto.randomUUID(), attempted: false }));
  const errorRef = useRefApp(null);
  const approverErrorRef = useRefApp(null);
  const summaryErrorRef = useRefApp(null);

  useEffectApp(() => {
    let alive = true;
    setApproverState(current => ({ ...current, status: "loading", message: "" }));
    window.loadOtEligibleApprovers().then(rows => {
      if (!alive) return;
      setApproverState({ status: "ready", rows: Array.isArray(rows) ? rows : [] });
    }).catch(error => {
      if (alive) setApproverState({ status: "error", rows: [], message: error.message || "Approvers could not be loaded." });
    });
    return () => { alive = false; };
  }, [approverRetry]);

  useEffectApp(() => {
    if (submitState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [submitState.status]);

  useEffectApp(() => {
    if (approverState.status === "error" && approverErrorRef.current) approverErrorRef.current.focus();
  }, [approverState.status]);

  function update(field, value) {
    if (window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)) return;
    setForm(current => ({ ...current, [field]: value }));
    if (intent.attempted) {
      setIntent(current => window.FlowMateOtRequestDomain.resetIntentAfterEdit(current, () => crypto.randomUUID()));
      setSubmitState({ status: "idle", message: "" });
    }
  }

  let crossesWeek = false;
  let previewEndDate = form.workDate;
  let preview = { valid: false, minutes: 0, segments: [], endDate: form.workDate, crossesWeek: false, message: "Enter a valid schedule to preview hours." };
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
      breakMinutes: Number(form.breakMinutes || 0),
    };
    if (crossesWeek) {
      splitInput.breakMinutesBeforeBoundary = form.breakMinutesBeforeBoundary === "" ? undefined : Number(form.breakMinutesBeforeBoundary);
      splitInput.breakMinutesAfterBoundary = form.breakMinutesAfterBoundary === "" ? undefined : Number(form.breakMinutesAfterBoundary);
    }
    const segments = window.FlowMateOtRequestDomain.splitMinutesByWeek(splitInput);
    preview = { valid: true, minutes: segments.reduce((sum, segment) => sum + segment.minutes, 0), segments, endDate, crossesWeek, message: "" };
  } catch (error) {
    preview = { ...preview, endDate: previewEndDate, crossesWeek, message: error.message };
  }

  const weekSummaryState = useOtWeekSummaries(preview.valid ? preview.segments : []);
  const projections = weekSummaryState.status === "ready"
    ? window.FlowMateOtRequestDomain.buildWeekProjections(
      preview.valid ? preview.segments : [],
      weekSummaryState.summaries,
      { totalField: "plannedMinutes" },
    )
    : [];
  const overLimit = projections.some(row => row.overLimit);
  const detailRequired = OT_DETAIL_REQUIRED_REASONS.has(form.reasonCode);
  const venueRequired = form.workLocationType === "venue";
  const approverUnavailable = approverState.status !== "ready" || approverState.rows.length === 0;
  const canSubmit = preview.valid
    && !overLimit
    && form.functionCode
    && form.title.trim()
    && form.reasonCode
    && (!detailRequired || form.reasonDetail.trim())
    && (!venueRequired || form.venue.trim())
    && form.approverUserId
    && form.consented
    && !approverUnavailable
    && weekSummaryState.status === "ready"
    && submitState.status !== "submitting";

  useEffectApp(() => {
    if (weekSummaryState.status === "error" && summaryErrorRef.current) summaryErrorRef.current.focus();
  }, [weekSummaryState.status]);

  async function submitRequest(event) {
    event.preventDefault();
    if (!canSubmit) {
      setSubmitState({ status: "error", message: overLimit ? "This request would exceed the 36-hour weekly limit." : "Complete the required fields and consent before submitting." });
      return;
    }
    setIntent(current => ({ ...current, attempted: true }));
    setSubmitState({ status: "submitting", message: "Submitting your request…" });
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
      consentStatementVersion: OT_CONSENT_STATEMENT_VERSION,
    };
    try {
      await window.createOtRequest(payload, intent.key);
      setSubmitState({ status: "success", message: "Your OT request was submitted for approval." });
      setIntent({ key: crypto.randomUUID(), attempted: false });
      onSuccess();
    } catch (error) {
      setSubmitState({ status: "error", message: error.message || "Your OT request could not be submitted. Retry uses the same request key." });
    }
  }

  return (
    <form className="ot-form" onSubmit={submitRequest} noValidate>
      <fieldset className="ot-form__fieldset" disabled={window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)}>
        <div className="form-grid">
        <label className="field"><span className="field__label">Function *</span><select className="select" value={form.functionCode} onChange={event => update("functionCode", event.target.value)} required><option value="">Select Function</option><option value="gdve">GD/VE</option><option value="ops">Ops</option><option value="mkt">MKT</option><option value="esport">eSport</option></select></label>
        <label className="field"><span className="field__label">Assignment or event *</span><input className="input" value={form.title} onChange={event => update("title", event.target.value)} required /></label>
        <label className="field"><span className="field__label">Work date *</span><input className="input" type="date" min={weekStart} max={addOtDays(weekStart, 6)} value={form.workDate} onChange={event => update("workDate", event.target.value)} required /><span className="field__hint">Choose a date in the selected Bangkok week.</span></label>
        <label className="field"><span className="field__label">Day type *</span><select className="select" value={form.dayType} onChange={event => update("dayType", event.target.value)}><option value="working_day">Working day</option><option value="rest_day">Weekly holiday</option><option value="public_holiday">Public holiday</option></select></label>
        <label className="field"><span className="field__label">Planned start *</span><input className="input" type="time" value={form.startTime} onChange={event => update("startTime", event.target.value)} required /></label>
        <label className="field"><span className="field__label">Planned end *</span><input className="input" type="time" value={form.endTime} onChange={event => update("endTime", event.target.value)} required /><span className="field__hint">An end at or before start is treated as overnight.</span></label>
        <label className="field"><span className="field__label">Break (minutes) *</span><input className="input" type="number" min="0" step="1" value={form.breakMinutes} onChange={event => update("breakMinutes", event.target.value)} required /></label>
        <label className="field"><span className="field__label">Location *</span><select className="select" value={form.workLocationType} onChange={event => update("workLocationType", event.target.value)}><option value="office">Office</option><option value="remote">Remote</option><option value="venue">Venue / off-site</option></select></label>
        {preview.crossesWeek && <><label className="field"><span className="field__label">Break in week of {formatOtDate(preview.segments[0]?.weekStart || weekStart)} *</span><input className="input" type="number" min="0" step="1" value={form.breakMinutesBeforeBoundary} onChange={event => update("breakMinutesBeforeBoundary", event.target.value)} /></label><label className="field"><span className="field__label">Break in week of {formatOtDate(preview.segments[1]?.weekStart || addOtDays(weekStart, 7))} *</span><input className="input" type="number" min="0" step="1" value={form.breakMinutesAfterBoundary} onChange={event => update("breakMinutesAfterBoundary", event.target.value)} /></label></>}
        {venueRequired && <label className="field field--full"><span className="field__label">Venue *</span><input className="input" value={form.venue} onChange={event => update("venue", event.target.value)} placeholder="Event or tournament venue" required /></label>}
        <label className="field"><span className="field__label">Reason *</span><select className="select" value={form.reasonCode} onChange={event => update("reasonCode", event.target.value)} required><option value="">Select reason</option>{window.FlowMateOtRequestDomain.REASON_OPTIONS.map(reason => <option key={reason.key} value={reason.key}>{reason.label}</option>)}</select></label>
        <label className="field"><span className="field__label">Assigned approver *</span><select className="select" aria-label="Assigned approver" value={form.approverUserId} onChange={event => update("approverUserId", event.target.value)} disabled={approverState.status !== "ready" || !approverState.rows.length} required><option value="">{approverState.status === "loading" ? "Loading approvers…" : approverState.rows.length ? "Select approver" : "No approver available"}</option>{approverState.rows.map(approver => <option key={approver.userId} value={approver.userId}>{approver.displayName || approver.email}{approver.displayName ? ` — ${approver.email}` : ""}</option>)}</select>{approverState.status === "error" && <span className="field__error" role="alert" tabIndex="-1" ref={approverErrorRef}>{approverState.message} <button type="button" className="ot-link-button" onClick={() => setApproverRetry(value => value + 1)}>Retry</button></span>}{approverState.status === "ready" && !approverState.rows.length && <span className="field__error">No active OT approver is available. Contact the OT Owner.</span>}</label>
        <label className="field field--full"><span className="field__label">Reason detail {detailRequired ? "*" : "(optional)"}</span><textarea className="textarea" value={form.reasonDetail} onChange={event => update("reasonDetail", event.target.value)} required={detailRequired} placeholder={detailRequired ? "Explain what happened and why OT is required" : "Add only information needed for approval"} /></label>
        </div>

        {weekSummaryState.status === "loading" && preview.valid && <div className="ot-state ot-state--compact" role="status">Loading every affected week's OT total…</div>}
        {weekSummaryState.status === "error" && <div ref={summaryErrorRef} tabIndex="-1"><OtWarning kind="error" title="Weekly totals unavailable" message={`${weekSummaryState.message} Submission remains blocked until the totals are refreshed.`} /><button type="button" className="btn btn--secondary" onClick={weekSummaryState.retry}>Retry totals</button></div>}
        {weekSummaryState.status === "ready" && <OtWeekProjection title="Planned totals by affected week" rows={projections} />}
        {!preview.valid && <OtWarning kind="error" title="Schedule needs attention" message={preview.message} />}
        {weekSummaryState.status === "ready" && overLimit && <OtWarning kind="critical" title="Request blocked" message={`At least one affected week would exceed the 36-hour limit: ${projections.filter(row => row.overLimit).map(row => formatOtDate(row.weekStart)).join(", ")}.`} />}

        <label className="ot-consent">
          <input type="checkbox" checked={form.consented} onChange={event => update("consented", event.target.checked)} />
          <span>I consent to this overtime occurrence and confirm the planned date and time shown above.</span>
        </label>
        <small className="muted">Consent statement version {OT_CONSENT_STATEMENT_VERSION}</small>
      </fieldset>
      {submitState.message && <div ref={errorRef} tabIndex={submitState.status === "error" ? "-1" : undefined}><OtWarning kind={submitState.status === "error" ? "error" : "info"} message={submitState.message} /></div>}
      <div className="ot-form__actions"><button type="submit" className="btn btn--primary" disabled={!canSubmit}>{submitState.status === "submitting" ? "Submitting…" : "Submit OT request"}</button></div>
    </form>
  );
}

function OtConsentPanel({ request, onSuccess }) {
  const [accepted, setAccepted] = useStateApp(false);
  const [submitState, setSubmitState] = useStateApp({ status: "idle", message: "" });
  const [intent, setIntent] = useStateApp(() => ({ choice: null, key: crypto.randomUUID() }));
  const errorRef = useRefApp(null);
  const summaryErrorRef = useRefApp(null);
  const plannedMinutes = Number(otValue(request, "plannedMinutes", "planned_minutes") || 0);
  const plannedSegments = getOtWeekSegments(request, "planned");
  const weekSummaryState = useOtWeekSummaries(plannedSegments);
  const projections = weekSummaryState.status === "ready"
    ? window.FlowMateOtRequestDomain.buildWeekProjections(
      plannedSegments,
      weekSummaryState.summaries,
      { totalField: "plannedMinutes", excludedSegments: plannedSegments },
    )
    : [];
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
      setSubmitState({ status: "error", message: overLimit ? "Consent is blocked because an affected week exceeds 36 hours." : weekSummaryState.status !== "ready" ? "Weekly OT totals must load before accepting this occurrence." : "Check the consent box before accepting this occurrence." });
      return;
    }
    const key = intent.choice === choice ? intent.key : crypto.randomUUID();
    setIntent({ choice, key });
    setSubmitState({ status: "submitting", message: choice ? "Recording your consent…" : "Recording your choice…" });
    try {
      await window.recordOtConsent(request.id, choice, OT_CONSENT_STATEMENT_VERSION, key);
      setSubmitState({ status: "success", message: choice ? "Consent recorded for this occurrence." : "You declined this occurrence. The assignment remains in the audit history." });
      setIntent({ choice: null, key: crypto.randomUUID() });
      onSuccess();
    } catch (error) {
      setSubmitState({ status: "error", message: error.message || "Consent could not be recorded. Retry will use the same action key." });
    }
  }

  return (
    <div className="ot-form" data-testid="ot-consent-required">
      <div className="ot-detail-grid">
        <div><span>Assigned event</span><strong>{request.title || "—"}</strong></div>
        <div><span>Function</span><strong>{String(otValue(request, "functionCode", "function_code") || "—").toUpperCase()}</strong></div>
        <div><span>Venue</span><strong>{otValue(request, "venue", "venue") || getOtStatusLabel(otValue(request, "workLocationType", "work_location_type"))}</strong></div>
        <div><span>Planned schedule</span><strong>{formatOtDate(start.date)} {start.time} – {start.date === end.date ? "" : `${formatOtDate(end.date)} `}{end.time}</strong></div>
        <div><span>Break</span><strong>{otValue(request, "plannedBreakMinutes", "planned_break_minutes") || 0} min</strong></div>
        <div><span>Planned hours</span><strong>{formatOtHours(plannedMinutes)}</strong></div>
      </div>
      {weekSummaryState.status === "loading" && <div className="ot-state ot-state--compact" role="status">Loading every affected week's OT total…</div>}
      {weekSummaryState.status === "error" && <div ref={summaryErrorRef} tabIndex="-1"><OtWarning kind="error" title="Weekly totals unavailable" message={`${weekSummaryState.message} Accepting is blocked until the totals are refreshed; declining remains available.`} /><button type="button" className="btn btn--secondary" onClick={weekSummaryState.retry}>Retry totals</button></div>}
      {weekSummaryState.status === "ready" && <OtWeekProjection title="Consent totals by affected week" rows={projections} />}
      {weekSummaryState.status === "ready" && overLimit && <OtWarning kind="critical" title="Consent blocked" message={`At least one affected week would exceed 36 hours: ${projections.filter(row => row.overLimit).map(row => formatOtDate(row.weekStart)).join(", ")}. Contact the Event Lead because the server will not accept this planned occurrence.`} />}
      <label className="ot-consent">
        <input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} />
        <span>I consent to this overtime occurrence and confirm the planned date and time shown above.</span>
      </label>
      <small className="muted">Consent statement version {OT_CONSENT_STATEMENT_VERSION}</small>
      {submitState.message && <div ref={errorRef} tabIndex={submitState.status === "error" ? "-1" : undefined}><OtWarning kind={submitState.status === "error" ? "error" : "info"} message={submitState.message} /></div>}
      <div className="ot-form__actions">
        <button type="button" className="btn btn--primary" disabled={!accepted || overLimit || weekSummaryState.status !== "ready" || submitState.status === "submitting"} onClick={() => recordConsent(true)}>Accept occurrence</button>
        <button type="button" className="btn btn--secondary" disabled={submitState.status === "submitting"} onClick={() => recordConsent(false)}>Decline occurrence</button>
      </div>
    </div>
  );
}

function OtActualConfirmationForm({ request, onSuccess }) {
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
    varianceReason: "",
  });
  const [submitState, setSubmitState] = useStateApp({ status: "idle", message: "", result: null });
  const [intent, setIntent] = useStateApp(() => ({ key: crypto.randomUUID(), attempted: false }));
  const errorRef = useRefApp(null);
  const summaryErrorRef = useRefApp(null);

  useEffectApp(() => {
    if (submitState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [submitState.status]);

  function update(field, value) {
    if (window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)) return;
    setForm(current => ({ ...current, [field]: value }));
    if (intent.attempted) {
      setIntent(current => window.FlowMateOtRequestDomain.resetIntentAfterEdit(current, () => crypto.randomUUID()));
      setSubmitState({ status: "idle", message: "", result: null });
    }
  }

  let crossesWeek = false;
  let preview = { valid: false, minutes: 0, segments: [], crossesWeek: false, message: "Enter the actual schedule." };
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
      breakMinutes: Number(form.breakMinutes || 0),
    };
    if (crossesWeek) {
      splitInput.breakMinutesBeforeBoundary = form.breakMinutesBeforeBoundary === "" ? undefined : Number(form.breakMinutesBeforeBoundary);
      splitInput.breakMinutesAfterBoundary = form.breakMinutesAfterBoundary === "" ? undefined : Number(form.breakMinutesAfterBoundary);
    }
    const segments = window.FlowMateOtRequestDomain.splitMinutesByWeek(splitInput);
    preview = { valid: true, minutes: segments.reduce((sum, segment) => sum + segment.minutes, 0), segments, crossesWeek, message: "" };
  } catch (error) {
    preview = { ...preview, crossesWeek, message: error.message };
  }

  const actualMinutes = preview.minutes;
  const varianceRequired = preview.valid && Math.abs(actualMinutes - plannedMinutes) > 30;
  const weekSummaryState = useOtWeekSummaries(preview.valid ? preview.segments : []);
  const projections = weekSummaryState.status === "ready"
    ? window.FlowMateOtRequestDomain.buildWeekProjections(
      preview.valid ? preview.segments : [],
      weekSummaryState.summaries,
      { totalField: "actualMinutes", excludedSegments: existingActualSegments },
    )
    : [];
  const complianceLikely = projections.some(row => row.overLimit);
  const canSubmit = preview.valid && (!varianceRequired || form.varianceReason.trim()) && submitState.status !== "submitting" && submitState.status !== "success";

  useEffectApp(() => {
    if (weekSummaryState.status === "error" && summaryErrorRef.current) summaryErrorRef.current.focus();
  }, [weekSummaryState.status]);

  async function submitActual(event) {
    event.preventDefault();
    if (!canSubmit) {
      setSubmitState({ status: "error", message: varianceRequired ? "Explain the difference from the plan before submitting." : preview.message, result: null });
      return;
    }
    setIntent(current => ({ ...current, attempted: true }));
    setSubmitState({ status: "submitting", message: "Saving the hours you actually worked…", result: null });
    const payload = {
      actualStartAt: toOtBangkokIso(form.startDate, form.startTime),
      actualEndAt: toOtBangkokIso(form.endDate, form.endTime),
      actualBreakMinutes: Number(form.breakMinutes || 0),
      actualWeekSegments: preview.segments,
      varianceReason: form.varianceReason.trim() || null,
    };
    try {
      const result = await window.submitOtActual(request.id, payload, intent.key);
      const status = otValue(result, "status", "status");
      setIntent({ key: crypto.randomUUID(), attempted: false });
      if (status === "compliance_review_required") {
        setSubmitState({ status: "success", message: "Actual hours saved truthfully. Compliance review is required before this record can become HR ready.", result });
      } else {
        setSubmitState({ status: "success", message: "Actual hours saved and sent to your approver for verification.", result });
      }
    } catch (error) {
      setSubmitState({ status: "error", message: error.message || "Actual hours could not be saved. Retry uses the same action key.", result: null });
    }
  }

  if (submitState.status === "success") {
    const savedStatus = otValue(submitState.result, "status", "status");
    return (
      <div className="ot-form" data-testid="ot-confirm-actual">
        <OtWarning kind={savedStatus === "compliance_review_required" ? "critical" : "info"} title="Actual time saved" message={submitState.message} />
        <p><strong>Saved status:</strong> {getOtStatusLabel(savedStatus)}</p>
        <button type="button" className="btn btn--primary" onClick={onSuccess}>Back to dashboard</button>
      </div>
    );
  }

  return (
    <form className="ot-form" data-testid="ot-confirm-actual" onSubmit={submitActual} noValidate>
      <fieldset className="ot-form__fieldset" disabled={window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)}>
        <p className="muted">The planned schedule is prefilled. Change it to the time actually worked. Offline and eSport venue work does not require GPS or clock data.</p>
        <div className="form-grid">
        <label className="field"><span className="field__label">Actual start date *</span><input className="input" type="date" value={form.startDate} onChange={event => update("startDate", event.target.value)} required /></label>
        <label className="field"><span className="field__label">Actual start time *</span><input className="input" type="time" value={form.startTime} onChange={event => update("startTime", event.target.value)} required /></label>
        <label className="field"><span className="field__label">Actual end date *</span><input className="input" type="date" value={form.endDate} onChange={event => update("endDate", event.target.value)} required /></label>
        <label className="field"><span className="field__label">Actual end time *</span><input className="input" type="time" value={form.endTime} onChange={event => update("endTime", event.target.value)} required /></label>
        <label className="field"><span className="field__label">Actual total break (minutes) *</span><input className="input" type="number" min="0" step="1" value={form.breakMinutes} onChange={event => update("breakMinutes", event.target.value)} required /></label>
        {preview.crossesWeek && <><label className="field"><span className="field__label">Break in week of {formatOtDate(preview.segments[0]?.weekStart || window.FlowMateOtRequestDomain.getWeekStartKey(form.startDate))} *</span><input className="input" type="number" min="0" step="1" value={form.breakMinutesBeforeBoundary} onChange={event => update("breakMinutesBeforeBoundary", event.target.value)} required /></label><label className="field"><span className="field__label">Break in week of {formatOtDate(preview.segments[1]?.weekStart || window.FlowMateOtRequestDomain.getWeekStartKey(form.endDate))} *</span><input className="input" type="number" min="0" step="1" value={form.breakMinutesAfterBoundary} onChange={event => update("breakMinutesAfterBoundary", event.target.value)} required /></label></>}
        {varianceRequired && <label className="field field--full"><span className="field__label">Why actual time differs from plan *</span><textarea className="textarea" value={form.varianceReason} onChange={event => update("varianceReason", event.target.value)} placeholder="Explain the variance of more than 30 minutes" required /></label>}
        </div>
        <section className="ot-preview" aria-label="Actual occurrence total"><div><span>Planned</span><strong>{formatOtHours(plannedMinutes)}</strong></div><div><span>Truthful actual</span><strong>{preview.valid ? formatOtHours(actualMinutes) : "—"}</strong></div></section>
        {weekSummaryState.status === "loading" && preview.valid && <div className="ot-state ot-state--compact" role="status">Compliance preview is loading. You can still submit now; the server will validate and save the truthful time.</div>}
        {weekSummaryState.status === "error" && <div ref={summaryErrorRef} tabIndex="-1"><OtWarning kind="error" title="Compliance preview unavailable" message={`${weekSummaryState.message} You can still submit the truthful actual time; the server will validate and save the truthful time.`} /><button type="button" className="btn btn--secondary" onClick={weekSummaryState.retry}>Retry preview</button></div>}
        {weekSummaryState.status === "ready" && <OtWeekProjection title="Actual totals by affected week" rows={projections} />}
        {!preview.valid && <OtWarning kind="error" title="Actual schedule needs attention" message={preview.message} />}
        {weekSummaryState.status === "ready" && complianceLikely && <OtWarning kind="critical" title="Compliance review expected" message="Submit the truthful actual hours. They will be saved and routed for compliance review rather than blocked." />}
      </fieldset>
      {submitState.message && <div ref={errorRef} tabIndex={submitState.status === "error" ? "-1" : undefined}><OtWarning kind={submitState.status === "error" ? "error" : "info"} message={submitState.message} /></div>}
      <div className="ot-form__actions"><button type="submit" className="btn btn--primary" disabled={!canSubmit}>{submitState.status === "submitting" ? "Saving…" : "Submit truthful actual time"}</button></div>
    </form>
  );
}

function OtMyRequestsTable({ requests, onAction }) {
  if (!requests.length) {
    return <section className="ot-list"><div className="ot-section-head"><h2>My OT requests</h2></div><div className="ot-state">No OT requests in this week.</div></section>;
  }
  return (
    <section className="ot-list">
      <div className="ot-section-head"><h2>My OT requests</h2><span>{requests.length} occurrence{requests.length === 1 ? "" : "s"}</span></div>
      <div className="ot-table-wrap">
        <table className="tbl ot-table">
          <thead><tr><th>Date</th><th>Assignment / event</th><th>Planned</th><th>Actual</th><th>Status</th><th>Next action</th></tr></thead>
          <tbody>{requests.map(request => {
            const status = getOtRequestStatus(request);
            const start = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
            const canConsent = status === "awaiting_consent" && !otValue(request, "employeeConsent", "employee_consent");
            const canConfirm = status === "actual_confirmation_required" || otValue(request, "actualDecision", "actual_decision") === "revision_required";
            return <tr key={request.id}><td>{formatOtDate(start.date)}</td><td><strong>{request.title}</strong><small>{String(otValue(request, "functionCode", "function_code") || "").toUpperCase()}</small></td><td>{formatOtHours(otValue(request, "plannedMinutes", "planned_minutes"))}</td><td>{otValue(request, "actualMinutes", "actual_minutes") ? formatOtHours(otValue(request, "actualMinutes", "actual_minutes")) : "—"}</td><td><span className={`ot-status ot-status--${status}`}>{getOtStatusLabel(status)}</span></td><td>{canConsent ? <button type="button" className="btn btn--sm btn--secondary" onClick={() => onAction("consent", request)}>Review consent</button> : canConfirm ? <button type="button" className="btn btn--sm btn--secondary" onClick={() => onAction("actual", request)}>Confirm actual</button> : <span className="muted">No action</span>}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
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
  onSignOut,
}) {
  const [access, setAccess] = useStateApp({ status: "loading", canManage: false, canExport: false, isOwner: false });
  const [activeView, setActiveView] = useStateApp(getOtRequestHashView);

  useEffectApp(() => {
    let alive = true;
    const loadAccess = window.loadOtAccessContext
      ? window.loadOtAccessContext()
      : Promise.reject(new Error("OT Request data service is not ready."));

    loadAccess
      .then(data => {
        if (!alive) return;
        const serverAccess = data || {};
        setAccess({
          status: "ready",
          ...serverAccess,
          canManage: Boolean(serverAccess.isEligibleApprover || serverAccess.isOwner || serverAccess.isHrAdmin),
          canExport: Boolean(serverAccess.isOwner || serverAccess.isHrAdmin),
        });
      })
      .catch(error => {
        if (alive) setAccess({ status: "error", canManage: false, canExport: false, isOwner: false, message: error.message });
      });

    return () => { alive = false; };
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
      detail: "Review your overtime status and continue personal actions from one place.",
    },
    "my-requests": {
      eyebrow: "Personal",
      title: "My OT requests",
      detail: "Your request history and employee actions will appear here.",
    },
    manager: {
      eyebrow: "Manage",
      title: "Team OT overview",
      detail: "Authorized approvers can monitor assigned overtime workflows here.",
    },
    "root-causes": {
      eyebrow: "Understand",
      title: "Root causes",
      detail: "Authorized managers can review structured overtime drivers here.",
    },
  }[visibleView] || null;

  return (
    <div className="ot-shell">
      <FlowMatePromptHost />
      <div className="app__brand">
        <img src="garena/logo_graphic.png" alt="Garena" />
        <span className="app__brand-name">OT Request</span>
        <span className="app__brand-version">{FLOWMATE_APP_VERSION}</span>
      </div>
      <div className="app__topbar">
        <HomeButton onHome={onHome} />
        <ProductSwitch
          activeProduct="ot-request"
          onSwitchFlowMate={onSwitchFlowMate}
          onSwitchMarketingPlan={onSwitchMarketingPlan}
          onSwitchProductBook={onSwitchProductBook}
          onSwitchOtRequest={onSwitchOtRequest}
        />
        <span className="topbar__spacer" />
        <ThemeToggle />
        <div className="topbar__user" title={`Signed in as ${currentUserEmail}`}>
          <Avatar memberId={avatarMemberId} size="" />
          <span className="topbar__user-name">{currentUserName}</span>
        </div>
        <button type="button" className="topbar__btn" onClick={onSignOut}>Sign out</button>
      </div>
      <nav className="ot-sidebar" aria-label="OT Request navigation">
        <div className="nav-section">Personal</div>
        <button type="button" className={`nav-item ${visibleView === "overview" ? "is-active" : ""}`} aria-current={visibleView === "overview" ? "page" : undefined} onClick={() => openView("overview")}>
          <Icon name="calendar" size={16} /> Overview
        </button>
        <button type="button" className={`nav-item ${visibleView === "my-requests" ? "is-active" : ""}`} aria-current={visibleView === "my-requests" ? "page" : undefined} onClick={() => openView("my-requests")}>
          <Icon name="list" size={16} /> My requests
        </button>
        {access.status === "ready" && access.canManage && (
          <>
            <div className="nav-section">Manage</div>
            <button type="button" className={`nav-item ${visibleView === "manager" ? "is-active" : ""}`} aria-current={visibleView === "manager" ? "page" : undefined} onClick={() => openView("manager")}>
              <Icon name="users" size={16} /> Team OT
            </button>
            <button type="button" className={`nav-item ${visibleView === "root-causes" ? "is-active" : ""}`} aria-current={visibleView === "root-causes" ? "page" : undefined} onClick={() => openView("root-causes")}>
              <Icon name="chart" size={16} /> Root causes
            </button>
          </>
        )}
      </nav>
      <main className="ot-main ot-shell__main" aria-labelledby="ot-view-title">
        {access.status === "loading" && <div className="ot-warning" role="status"><span aria-hidden="true">ⓘ</span><span>Loading OT access…</span></div>}
        {access.status === "error" && <div className="ot-warning ot-warning--error" role="alert"><span aria-hidden="true">⚠</span><span>{access.message || "OT access could not be loaded."}</span></div>}
        {viewCopy && (
          <div>
            <div className="page-head">
              <div>
                <div className="eyebrow">{viewCopy.eyebrow}</div>
                <h1 id="ot-view-title">{viewCopy.title}</h1>
                <p className="muted">{viewCopy.detail}</p>
              </div>
            </div>
            {access.status === "ready" && (visibleView === "overview" || visibleView === "my-requests")
              ? <OtEmployeeDashboard access={access} listOnly={visibleView === "my-requests"} />
              : access.status === "ready" && <section className="ot-metric-grid" aria-label="OT workspace status">
                <div className="stat"><span>Weekly limit</span><strong>{access.weeklyLimitMinutes ? `${access.weeklyLimitMinutes / 60}h` : "—"}</strong></div>
                <div className="stat"><span>Timezone</span><strong>{access.timezone || "Asia/Bangkok"}</strong></div>
                <div className="stat"><span>Workweek</span><strong>{access.weekStartsOn === "monday" ? "Mon–Sun" : "—"}</strong></div>
              </section>}
          </div>
        )}
      </main>
    </div>
  );
}

window.OtRequestShell = OtRequestShell;
