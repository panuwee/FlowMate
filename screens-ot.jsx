const OT_REQUEST_VIEW_ROUTES = {
  overview: "ot-request",
  "my-requests": "ot-request/my-requests",
  manager: "ot-request/manager",
  "root-causes": "ot-request/root-causes",
  owner: "ot-request/owner",
  compliance: "ot-request/compliance",
  audit: "ot-request/audit",
  access: "ot-request/access",
  export: "ot-request/export",
};

function getOtRequestHashView() {
  const route = String(window.location.hash || "").replace(/^#/, "").split("/");
  if (route[0] !== "ot-request") return "overview";
  return OT_REQUEST_VIEW_ROUTES[route[1]] ? route[1] : "overview";
}

function canOpenOtRequestView(view, access) {
  if (view === "overview" || view === "my-requests") return true;
  if (!access) return false;
  if (view === "owner" || view === "access") return Boolean(access.isOwner);
  if (view === "compliance" || view === "audit" || view === "export") return Boolean(access.isOwner || access.isHrAdmin);
  return Boolean(access.isEligibleApprover || access.isOwner || access.isHrAdmin);
}

const OT_LIMIT_MINUTES = 36 * 60;
const OT_CONSENT_STATEMENT_VERSION = "2026-08-07";
const OT_DETAIL_REQUIRED_REASONS = new Set(["other", "live_incident", "rework", "scope_change"]);
// Display-only MVP metadata. Server access context and RPC authorization remain authoritative.
const OT_APPROVER_DISPLAY_DIRECTORY = Object.freeze([
  { email: "nithidol.k@garena.com", label: "Big" },
  { email: "weerayut@garena.com", label: "Mac" },
  { email: "napol.a@garena.com", label: "Pluem" },
]);

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

function getOtAnnouncementProps(kind) {
  return kind === "error" || kind === "critical"
    ? { role: "alert" }
    : { role: "status", "aria-live": "polite" };
}

function getOtDescribedActionProps(descriptionId, isDescribed) {
  return isDescribed ? { "aria-describedby": descriptionId } : {};
}

function OtWarning({ id, kind = "info", title, message, testId }) {
  if (!message) return null;
  const heading = title || (kind === "error" || kind === "critical" ? "Action needed" : "Update");
  return (
    <div id={id} className={`ot-warning ${kind === "error" || kind === "critical" ? "ot-warning--error" : ""}`} {...getOtAnnouncementProps(kind)} data-testid={testId}>
      <span aria-hidden="true">{kind === "error" || kind === "critical" ? "⚠" : "ⓘ"}</span>
      <span><strong>{heading}: </strong>{message}</span>
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
  const countedMinutes = Number(dashboard.countedMinutes || 0);
  const plannedMinutes = Number(dashboard.plannedMinutes || 0);
  const confirmedMinutes = Number(dashboard.actualMinutes || 0);
  const summary = {
    countedMinutes,
    plannedMinutes,
    confirmedMinutes,
    remainingMinutes: Math.max(0, OT_LIMIT_MINUTES - countedMinutes),
  };
  const consentRequests = requests.filter(request => getOtRequestStatus(request) === "awaiting_consent" && !otValue(request, "employeeConsent", "employee_consent"));
  const planRevisionRequests = requests.filter(request => window.FlowMateOtRequestDomain.getRevisionWorkflow(request) === "plan");
  const actualRequests = requests.filter(request => getOtRequestStatus(request) === "actual_confirmation_required"
    || window.FlowMateOtRequestDomain.getRevisionWorkflow(request) === "actual");

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
            <section className="ot-metric"><span>Actions</span><strong>{consentRequests.length + planRevisionRequests.length + actualRequests.length}</strong><small>{consentRequests.length} consent · {planRevisionRequests.length} plan · {actualRequests.length} actual</small></section>
          </section>

          <section className="ot-actions" aria-label="Your required OT actions">
            {consentRequests.map(request => (
              <button key={request.id} type="button" className="ot-action-card" data-testid="ot-consent-required" onClick={() => setAction({ type: "consent", request })}>
                <strong>Consent required</strong><span>{request.title}</span><small>Review the occurrence and weekly total</small>
              </button>
            ))}
            {planRevisionRequests.map(request => (
              <button key={request.id} type="button" className="ot-action-card" data-testid="ot-plan-revision-required" onClick={() => setAction({ type: "revision", request })}>
                <strong>Edit and resubmit request</strong><span>{request.title}</span><small>Correct the plan before it returns to the approval queue</small>
              </button>
            ))}
            {actualRequests.map(request => (
              <button key={request.id} type="button" className="ot-action-card" data-testid="ot-confirm-actual" onClick={() => setAction({ type: "actual", request })}>
                <strong>Confirm actual time</strong><span>{request.title}</span><small>Record the hours you actually worked</small>
              </button>
            ))}
            {!consentRequests.length && !planRevisionRequests.length && !actualRequests.length && <div className="ot-state ot-state--compact">No OT actions are waiting for you.</div>}
          </section>
        </>
      )}

      {action && (
        <section className="ot-workflow" aria-label="OT action">
          <div className="ot-workflow__head">
            <h2>{action.type === "new" ? "New OT request" : action.type === "revision" ? "Edit and resubmit request" : action.type === "consent" ? "Event consent" : "Confirm actual time"}</h2>
            <button type="button" className="btn btn--ghost" onClick={() => setAction(null)}>Close</button>
          </div>
          {action.type === "new" && <OtRequestForm weekStart={weekStart} onSuccess={refreshAfterAction} />}
          {action.type === "revision" && <OtRequestForm key={action.request.id} mode="revision" request={action.request} weekStart={weekStart} onSuccess={refreshAfterAction} />}
          {action.type === "consent" && <OtConsentPanel request={action.request} onSuccess={refreshAfterAction} />}
          {action.type === "actual" && <OtActualConfirmationForm request={action.request} onSuccess={refreshAfterAction} />}
        </section>
      )}

      <OtMyRequestsTable requests={requests} onAction={(type, request) => setAction({ type, request })} />
    </div>
  );
}

function getOtPlanRevisionBreakAllocation(request, segments) {
  if (!request || !Array.isArray(segments) || segments.length !== 2) {
    return { breakMinutesBeforeBoundary: "", breakMinutesAfterBoundary: "" };
  }
  const startAt = new Date(otValue(request, "plannedStartAt", "planned_start_at"));
  const endAt = new Date(otValue(request, "plannedEndAt", "planned_end_at"));
  const boundary = new Date(`${segments[1].weekStart}T00:00:00+07:00`);
  const firstGross = Math.floor((boundary.getTime() - startAt.getTime()) / 60000);
  const lastGross = Math.floor((endAt.getTime() - boundary.getTime()) / 60000);
  const firstBreak = firstGross - Number(segments[0].minutes || 0);
  const lastBreak = lastGross - Number(segments[1].minutes || 0);
  if (firstBreak < 0 || lastBreak < 0 || !Number.isFinite(firstBreak) || !Number.isFinite(lastBreak)) {
    return { breakMinutesBeforeBoundary: "", breakMinutesAfterBoundary: "" };
  }
  return {
    breakMinutesBeforeBoundary: String(firstBreak),
    breakMinutesAfterBoundary: String(lastBreak),
  };
}

function OtRequestForm({ mode = "create", request = null, weekStart: requestedWeekStart = getCurrentOtWeekStart(), onSuccess }) {
  const isRevision = mode === "revision";
  const plannedStart = getOtBangkokParts(otValue(request, "plannedStartAt", "planned_start_at"));
  const plannedEnd = getOtBangkokParts(otValue(request, "plannedEndAt", "planned_end_at"));
  const existingPlannedSegments = isRevision ? getOtWeekSegments(request, "planned") : [];
  const revisionBreaks = getOtPlanRevisionBreakAllocation(request, existingPlannedSegments);
  const weekStart = isRevision && plannedStart.date
    ? window.FlowMateOtRequestDomain.getWeekStartKey(plannedStart.date)
    : requestedWeekStart;
  const today = getBangkokDateKey();
  const initialWorkDate = isRevision && plannedStart.date
    ? plannedStart.date
    : window.FlowMateOtRequestDomain.getWeekStartKey(today) === weekStart ? today : weekStart;
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
    approverUserId: isRevision ? String(otValue(request, "approverUserId", "approver_user_id") || "") : "",
    consented: false,
  }));
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
      { excludedSegments: window.FlowMateOtRequestDomain.getCanonicalCountedSegments(request) },
    )
    : [];
  const overLimit = projections.some(row => row.overLimit);
  const plannedStartIsFuture = preview.valid && window.FlowMateOtRequestDomain.isBangkokPlannedStartFuture(form.workDate, form.startTime);
  const detailRequired = OT_DETAIL_REQUIRED_REASONS.has(form.reasonCode);
  const venueRequired = form.workLocationType === "venue";
  const approverUnavailable = approverState.status !== "ready" || approverState.rows.length === 0;
  const selectedApproverAvailable = approverState.rows.some(approver => approver.userId === form.approverUserId);
  const canSubmit = preview.valid
    && plannedStartIsFuture
    && !overLimit
    && form.functionCode
    && form.title.trim()
    && form.reasonCode
    && (!detailRequired || form.reasonDetail.trim())
    && (!venueRequired || form.venue.trim())
    && form.approverUserId
    && selectedApproverAvailable
    && form.consented
    && !approverUnavailable
    && weekSummaryState.status === "ready"
    && submitState.status !== "submitting";

  useEffectApp(() => {
    if (weekSummaryState.status === "error" && summaryErrorRef.current) summaryErrorRef.current.focus();
  }, [weekSummaryState.status]);

  async function submitRequest(event) {
    event.preventDefault();
    if (preview.valid && !window.FlowMateOtRequestDomain.isBangkokPlannedStartFuture(form.workDate, form.startTime)) {
      setSubmitState({ status: "error", message: "Request must be submitted before OT starts." });
      return;
    }
    if (!canSubmit) {
      setSubmitState({ status: "error", message: overLimit ? "This request would exceed the 36-hour weekly limit." : "Complete the required fields and consent before submitting." });
      return;
    }
    setIntent(current => ({ ...current, attempted: true }));
    setSubmitState({ status: "submitting", message: isRevision ? "Resubmitting your corrected request…" : "Submitting your request…" });
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
      if (isRevision) {
        await window.resubmitOtPlan(request.id, payload, OT_CONSENT_STATEMENT_VERSION, intent.key);
      } else {
        await window.createOtRequest(payload, intent.key);
      }
      setSubmitState({ status: "success", message: isRevision ? "Your corrected OT request was resubmitted for approval." : "Your OT request was submitted for approval." });
      setIntent({ key: crypto.randomUUID(), attempted: false });
      onSuccess();
    } catch (error) {
      setSubmitState({ status: "error", message: error.message || `${isRevision ? "Your corrected OT request could not be resubmitted" : "Your OT request could not be submitted"}. Retry uses the same request key.` });
    }
  }

  return (
    <form className="ot-form" onSubmit={submitRequest} noValidate>
      <fieldset className="ot-form__fieldset" disabled={window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)}>
        {isRevision && <><h3>Edit and resubmit request</h3><p className="muted">Correct the requested schedule and approver, then renew consent before resubmitting.</p></>}
        <div className="form-grid">
        <label className="field"><span className="field__label">Function *</span><select className="select" value={form.functionCode} onChange={event => update("functionCode", event.target.value)} required><option value="">Select Function</option><option value="gdve">GD/VE</option><option value="ops">Ops</option><option value="mkt">MKT</option><option value="esport">eSport</option></select></label>
        <label className="field"><span className="field__label">Assignment or event *</span><input className="input" value={form.title} onChange={event => update("title", event.target.value)} required /></label>
        <label className="field"><span className="field__label">Work date *</span><input className="input" type="date" min={isRevision ? undefined : weekStart} max={isRevision ? undefined : addOtDays(weekStart, 6)} value={form.workDate} onChange={event => update("workDate", event.target.value)} required /><span className="field__hint">{isRevision ? "Choose any Bangkok work date; weekly totals follow the corrected schedule." : "Choose a date in the selected Bangkok week."}</span></label>
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
        {preview.valid && !plannedStartIsFuture && <OtWarning kind="error" title="Start time needs attention" message="Request must be submitted before OT starts." />}
        {weekSummaryState.status === "ready" && overLimit && <OtWarning kind="critical" title="Request blocked" message={`At least one affected week would exceed the 36-hour limit: ${projections.filter(row => row.overLimit).map(row => formatOtDate(row.weekStart)).join(", ")}.`} />}

        <label className="ot-consent">
          <input type="checkbox" checked={form.consented} onChange={event => update("consented", event.target.checked)} />
          <span>I consent to this overtime occurrence and confirm the planned date and time shown above.</span>
        </label>
        <small className="muted">Consent statement version {OT_CONSENT_STATEMENT_VERSION}</small>
      </fieldset>
      {submitState.message && <div ref={errorRef} tabIndex={submitState.status === "error" ? "-1" : undefined}><OtWarning id="ot-request-submit-feedback" kind={submitState.status === "error" ? "error" : "info"} message={submitState.message} /></div>}
      <div className="ot-form__actions"><button type="submit" className="btn btn--primary" {...getOtDescribedActionProps("ot-request-submit-feedback", Boolean(submitState.message))} disabled={!canSubmit}>{submitState.status === "submitting" ? (isRevision ? "Resubmitting…" : "Submitting…") : (isRevision ? "Resubmit corrected request" : "Submit OT request")}</button></div>
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
      { excludedSegments: window.FlowMateOtRequestDomain.getCanonicalCountedSegments(request) },
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
      {submitState.message && <div ref={errorRef} tabIndex={submitState.status === "error" ? "-1" : undefined}><OtWarning id="ot-consent-submit-feedback" kind={submitState.status === "error" ? "error" : "info"} message={submitState.message} /></div>}
      <div className="ot-form__actions">
        <button type="button" className="btn btn--primary" {...getOtDescribedActionProps("ot-consent-submit-feedback", Boolean(submitState.message))} disabled={!accepted || overLimit || weekSummaryState.status !== "ready" || submitState.status === "submitting"} onClick={() => recordConsent(true)}>Accept occurrence</button>
        <button type="button" className="btn btn--secondary" {...getOtDescribedActionProps("ot-consent-submit-feedback", Boolean(submitState.message))} disabled={submitState.status === "submitting"} onClick={() => recordConsent(false)}>Decline occurrence</button>
      </div>
    </div>
  );
}

function OtActualConfirmationForm({ request, onSuccess }) {
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
      { excludedSegments: window.FlowMateOtRequestDomain.getCanonicalCountedSegments(request) },
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
      {submitState.message && <div ref={errorRef} tabIndex={submitState.status === "error" ? "-1" : undefined}><OtWarning id="ot-actual-submit-feedback" kind={submitState.status === "error" ? "error" : "info"} message={submitState.message} /></div>}
      <div className="ot-form__actions"><button type="submit" className="btn btn--primary" {...getOtDescribedActionProps("ot-actual-submit-feedback", Boolean(submitState.message))} disabled={!canSubmit}>{submitState.status === "submitting" ? "Saving…" : "Submit truthful actual time"}</button></div>
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
            const revisionWorkflow = window.FlowMateOtRequestDomain.getRevisionWorkflow(request);
            const canRevise = revisionWorkflow === "plan";
            const canConfirm = status === "actual_confirmation_required" || revisionWorkflow === "actual";
            return <tr key={request.id}><td>{formatOtDate(start.date)}</td><td><strong>{request.title}</strong><small>{String(otValue(request, "functionCode", "function_code") || "").toUpperCase()}</small></td><td>{formatOtHours(otValue(request, "plannedMinutes", "planned_minutes"))}</td><td>{otValue(request, "actualMinutes", "actual_minutes") ? formatOtHours(otValue(request, "actualMinutes", "actual_minutes")) : "—"}</td><td><span className={`ot-status ot-status--${status}`}>{getOtStatusLabel(status)}</span></td><td>{canConsent ? <button type="button" className="btn btn--sm btn--secondary" onClick={() => onAction("consent", request)}>Review consent</button> : canRevise ? <button type="button" className="btn btn--sm btn--secondary" onClick={() => onAction("revision", request)}>Edit and resubmit request</button> : canConfirm ? <button type="button" className="btn btn--sm btn--secondary" onClick={() => onAction("actual", request)}>Confirm actual</button> : <span className="muted">No action</span>}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

const OT_MANAGER_METRIC_LABELS = ["Planned OT", "Confirmed", "Needs approval", "Near 36h limit"];
const OT_ROOT_CAUSE_LABELS = ["OT by function", "Why OT happens"];
const OT_FUNCTIONS = [
  { value: "gdve", label: "GD/VE" },
  { value: "ops", label: "Ops" },
  { value: "mkt", label: "MKT" },
  { value: "esport", label: "eSport" },
];

function getOtManagerRequestId(request) {
  return otValue(request, "requestId", "request_id") || request.id;
}

function getOtManagerEmployeeId(request) {
  return otValue(request, "employeeUserId", "employee_user_id") || "unknown";
}

function getOtManagerWeekMinutes(request, prefix, weekStart) {
  const segments = getOtWeekSegments(request, prefix);
  return segments
    .filter(segment => segment.weekStart === weekStart)
    .reduce((sum, segment) => sum + Number(segment.minutes || 0), 0);
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
    actualMinutes: getOtManagerWeekMinutes(request, "actual", weekStart),
  };
}

function getOtManagerEmployeeName(request, peopleById) {
  const employeeId = getOtManagerEmployeeId(request);
  const person = peopleById[employeeId];
  return otValue(request, "employeeDisplayName", "employee_display_name")
    || (person && (person.displayName || person.email))
    || `Employee ${String(employeeId).slice(0, 8)}`;
}

function getOtManagerTotals(rows, byWeek = false) {
  return window.FlowMateOtRequestDomain.buildOtManagerTotals(rows, byWeek);
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
    const total = employeeTotals[`${employeeId}:${request.weekStart}`]?.countedMinutes
      ?? employeeTotals[employeeId]?.countedMinutes
      ?? 0;
    return (!filters.eventPlanId || eventPlanId === filters.eventPlanId)
      && (!filters.reasonCode || reasonCode === filters.reasonCode)
      && (!filters.status || status === filters.status)
      && (!filters.nearLimit || total >= 30 * 60);
  });
}

function getOtManagerClientFilterKey(filters) {
  return JSON.stringify([
    String(filters?.eventPlanId || ""),
    String(filters?.reasonCode || ""),
    String(filters?.status || ""),
    Boolean(filters?.nearLimit),
  ]);
}

function OtManagerDashboard({ access, rootCauseOnly = false, refreshToken = 0 }) {
  const [weekStart, setWeekStart] = useStateApp(getCurrentOtWeekStart);
  const [functionFilter, setFunctionFilter] = useStateApp("");
  const [filters, setFilters] = useStateApp({ eventPlanId: "", reasonCode: "", status: "", nearLimit: false });
  const [loadState, setLoadState] = useStateApp({ status: "loading", queryKey: "", rows: [], peopleById: {}, message: "" });
  const [refreshKey, setRefreshKey] = useStateApp(0);
  const [showEventForm, setShowEventForm] = useStateApp(false);
  const [selectedRow, setSelectedRow] = useStateApp(null);
  const errorRef = useRefApp(null);
  const decisionIntentRef = useRefApp(null);
  const bulkIntentsRef = useRefApp({});
  const managerWeeks = rootCauseOnly ? [0, -7, -14, -21, -28].map(offset => addOtDays(weekStart, offset)) : [weekStart];
  const managerLoadKey = `${rootCauseOnly ? "root" : "manager"}:${weekStart}:${functionFilter}:${refreshKey}:${refreshToken}`;
  const clientFilterKey = getOtManagerClientFilterKey(filters);
  const activeLoadState = loadState.queryKey === managerLoadKey
    ? loadState
    : { status: "loading", queryKey: managerLoadKey, rows: [], peopleById: {}, message: "" };

  useEffectApp(() => {
    let alive = true;
    const weeks = managerWeeks;
    setLoadState({ status: "loading", queryKey: managerLoadKey, rows: [], peopleById: {}, message: "" });
    Promise.all([
      Promise.all(weeks.map(managerWeek => window.loadOtManagerDashboard(managerWeek, functionFilter || null))),
      rootCauseOnly ? Promise.resolve([]) : window.loadOtPeopleForEvent(),
    ]).then(([dashboards, people]) => {
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
      setLoadState({ status: "ready", queryKey: managerLoadKey, rows, peopleById, message: "" });
    }).catch(error => {
      if (alive) setLoadState({ status: "error", queryKey: managerLoadKey, rows: [], peopleById: {}, message: error.message || "Assigned OT could not be loaded." });
    });
    return () => { alive = false; };
  }, [weekStart, functionFilter, refreshKey, refreshToken, rootCauseOnly]);

  useEffectApp(() => {
    if (activeLoadState.status === "error" && errorRef.current) errorRef.current.focus();
  }, [activeLoadState.status]);

  function updateFilter(field, value) {
    setFilters(current => ({ ...current, [field]: value }));
    setSelectedRow(null);
  }

  const currentRows = activeLoadState.rows.filter(request => request.weekStart === weekStart);
  const currentEmployeeTotals = getOtManagerTotals(currentRows);
  const historyEmployeeTotals = getOtManagerTotals(activeLoadState.rows, true);
  const filteredCurrentRows = applyOtManagerFilters(currentRows, filters, currentEmployeeTotals);
  const filteredRows = applyOtManagerFilters(activeLoadState.rows, filters, historyEmployeeTotals);
  const eventOptions = Array.from(new Map(currentRows
    .filter(request => otValue(request, "eventPlanId", "event_plan_id"))
    .map(request => [otValue(request, "eventPlanId", "event_plan_id"), request.title])).entries());
  const statusOptions = Array.from(new Set(currentRows.map(getOtRequestStatus))).sort();
  const plannedMinutes = filteredCurrentRows
    .filter(request => !["cancelled", "rejected"].includes(getOtRequestStatus(request)))
    .reduce((sum, request) => sum + Number(request.plannedMinutes || 0), 0);
  const confirmedMinutes = filteredCurrentRows.filter(isOtActualConfirmed).reduce((sum, request) => sum + Number(request.actualMinutes || 0), 0);
  const needsApproval = filteredCurrentRows.filter(request => !otValue(request, "actualSubmittedAt", "actual_submitted_at") && getOtRequestStatus(request) === "pending_approval").length;
  const nearLimit = new Set(filteredCurrentRows
    .filter(request => (currentEmployeeTotals[getOtManagerEmployeeId(request)]?.countedMinutes || 0) >= 30 * 60)
    .map(getOtManagerEmployeeId)).size;
  const metricValues = [formatOtHours(plannedMinutes), formatOtHours(confirmedMinutes), String(needsApproval), String(nearLimit)];
  const hasFullScope = Boolean(access.isOwner || access.isHrAdmin);

  if (activeLoadState.status === "loading") {
    return <div className="ot-state" role="status">Loading assigned OT operations…</div>;
  }
  if (activeLoadState.status === "error") {
    return <div className="ot-state" role="alert" tabIndex="-1" ref={errorRef}><strong>Assigned OT could not be loaded.</strong><span>{activeLoadState.message}</span><button type="button" className="btn btn--secondary" onClick={() => setRefreshKey(value => value + 1)}>Retry</button></div>;
  }

  return (
    <div className="ot-manager">
      <section className="ot-manager-scope" aria-label="Manager data scope"><strong>{hasFullScope ? "All Functions — server-authorized OT scope" : "Assigned teams/events only"}</strong><span>{hasFullScope ? "Named rows are returned by the OT Owner or HR/Admin server scope." : "Rows come from the server-authorized manager scope."} Filters never widen access.</span></section>
      <section className="ot-manager-filters" aria-label="OT filters">
        <label className="field"><span className="field__label">Week</span><input className="input" type="date" value={weekStart} onChange={event => setWeekStart(window.FlowMateOtRequestDomain.getWeekStartKey(event.target.value))} /></label>
        <label className="field"><span className="field__label">Function</span><select className="select" value={functionFilter} onChange={event => setFunctionFilter(event.target.value)}><option value="">{hasFullScope ? "All Functions" : "All assigned Functions"}</option>{OT_FUNCTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label className="field"><span className="field__label">Event</span><select className="select" value={filters.eventPlanId} onChange={event => updateFilter("eventPlanId", event.target.value)}><option value="">All events / requests</option><option value="individual">Individual requests</option>{eventOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>
        <label className="field"><span className="field__label">Reason</span><select className="select" value={filters.reasonCode} onChange={event => updateFilter("reasonCode", event.target.value)}><option value="">All reasons</option>{window.FlowMateOtRequestDomain.REASON_OPTIONS.map(reason => <option key={reason.key} value={reason.key}>{reason.label}</option>)}</select></label>
        <label className="field"><span className="field__label">Status</span><select className="select" value={filters.status} onChange={event => updateFilter("status", event.target.value)}><option value="">All statuses</option>{statusOptions.map(status => <option key={status} value={status}>{getOtStatusLabel(status)}</option>)}</select></label>
        <label className="ot-filter-check"><input type="checkbox" checked={filters.nearLimit} onChange={event => updateFilter("nearLimit", event.target.checked)} /><span>Near limit only</span></label>
      </section>

      {rootCauseOnly ? (
        <OtRootCausePanel key={clientFilterKey} filteredRows={filteredRows} currentWeekStart={weekStart} weekStarts={managerWeeks} filterKey={clientFilterKey} />
      ) : (
        <>
          <section className="ot-metric-grid ot-metric-grid--manager" aria-label="Assigned weekly OT summary">{OT_MANAGER_METRIC_LABELS.map((label, index) => <section className="ot-metric" key={label}><span>{label}</span><strong>{metricValues[index]}</strong></section>)}</section>
          <div className="ot-manager-actions">
            {access.isEligibleApprover && <button type="button" className="btn btn--primary" onClick={() => setShowEventForm(value => !value)}>{showEventForm ? "Close event plan" : "Create Event OT plan"}</button>}
            <button type="button" className="btn btn--secondary" onClick={() => setRefreshKey(value => value + 1)}>Refresh {hasFullScope ? "OT scope" : "assigned scope"}</button>
          </div>
          {showEventForm && <section className="ot-workflow"><div className="ot-workflow__head"><h2>Shared Event OT plan</h2></div><OtEventPlanForm access={access} onSuccess={() => setRefreshKey(value => value + 1)} /></section>}
          <OtApprovalQueue access={access} requests={filteredCurrentRows} allRequests={currentRows} weekStart={weekStart} peopleById={activeLoadState.peopleById} decisionIntentRef={decisionIntentRef} bulkIntentsRef={bulkIntentsRef} onChanged={() => setRefreshKey(value => value + 1)} />
          <OtTeamWeekTable requests={filteredCurrentRows} allRequests={currentRows} peopleById={activeLoadState.peopleById} onOpenRequest={setSelectedRow} />
          {selectedRow && <section className="ot-manager-detail" aria-label="Authorized OT details">
            <div className="ot-section-head"><h2>{selectedRow.title}</h2><button type="button" className="btn btn--ghost" onClick={() => setSelectedRow(null)}>Close</button></div>
            <div className="ot-detail-grid"><div><span>Employee</span><strong>{getOtManagerEmployeeName(selectedRow, activeLoadState.peopleById)}</strong></div><div><span>Function</span><strong>{String(otValue(selectedRow, "functionCode", "function_code") || "—").toUpperCase()}</strong></div><div><span>Reason</span><strong>{getOtStatusLabel(otValue(selectedRow, "reasonCode", "reason_code"))}</strong></div><div><span>Status</span><strong>{getOtStatusLabel(getOtRequestStatus(selectedRow))}</strong></div></div>
            <OtActualAmendmentAction key={getOtManagerRequestId(selectedRow)} access={access} request={selectedRow} onChanged={() => { setSelectedRow(null); setRefreshKey(value => value + 1); }} />
          </section>}
        </>
      )}
    </div>
  );
}

function OtApprovalQueue({ access, requests, allRequests, peopleById, decisionIntentRef, bulkIntentsRef, onChanged }) {
  const [selected, setSelected] = useStateApp(null);
  const [note, setNote] = useStateApp("");
  const [bulkReview, setBulkReview] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({ status: "idle", message: "" });
  const decisionSubmissionRef = useRefApp(false);
  const employeeTotals = getOtManagerTotals(allRequests);
  const planRequests = requests.filter(request => otValue(request, "source", "source") === "employee_request"
    && !otValue(request, "actualSubmittedAt", "actual_submitted_at")
    && getOtRequestStatus(request) === "pending_approval");
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
    return value ? new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" }) : "Not recorded";
  }

  function getBulkExclusionReasons(request, checks) {
    const reasons = [];
    if (!canAct(request)) reasons.push("Not assigned to you as the eligible approver.");
    if (!checks.consentAccepted) reasons.push("Employee consent is missing.");
    if (checks.varianceNeedsReason && !checks.varianceHasReason) reasons.push("The signed variance needs an employee reason.");
    if (checks.awaitingHrCompliance) reasons.push("Already approved; awaiting HR compliance.");
    else if (checks.complianceRequired) reasons.push("Compliance review required; verify this occurrence individually.");
    if (checks.weeklyTotal > OT_LIMIT_MINUTES) reasons.push("Employee weekly total is above 36h.");
    if (!checks.actualSubmitted) reasons.push("Actual time has not been submitted with weekly segments.");
    return reasons.length ? reasons : ["This occurrence is not ready for bulk verification."];
  }

  function openDecision(kind, request) {
    if (!canTakeAction(kind, request)) return;
    if (decisionSubmissionRef.current || actionState.status === "submitting") return;
    setSelected({ kind, request });
    setBulkReview(null);
    setNote("");
    setActionState({ status: "idle", message: "" });
  }

  async function decide(decision) {
    if (!selected || !canTakeAction(selected.kind, selected.request) || decisionSubmissionRef.current || actionState.status === "submitting") return;
    if (decision !== "approved" && !note.trim()) {
      setActionState({ status: "error", message: "A note is required when rejecting or returning OT." });
      return;
    }
    if (selected.kind === "actual" && decision === "approved" && selectedChecks?.complianceRequired && !note.trim()) {
      setActionState({ status: "error", message: "A note is required for a compliance-required actual approval." });
      return;
    }
    if (selected.kind === "actual" && decision === "approved" && !getActualChecks(selected.request).canVerifyIndividually) {
      setActionState({ status: "error", message: "This actual record cannot be verified until consent, submitted actual time, and variance checks are complete." });
      return;
    }
    const requestId = getOtManagerRequestId(selected.request);
    const normalizedNote = note.trim() || null;
    const signature = window.FlowMateOtIntent.signature([requestId, selected.kind, decision, normalizedNote]);
    const currentIntent = window.FlowMateOtIntent.establish(decisionIntentRef.current, signature, () => crypto.randomUUID());
    decisionIntentRef.current = currentIntent;
    decisionSubmissionRef.current = true;
    setActionState({ status: "submitting", message: "Saving the audited decision…" });
    try {
      if (selected.kind === "plan") {
        await window.reviewOtPlan(requestId, decision, normalizedNote, currentIntent.key);
      } else {
        await window.verifyOtActual(requestId, decision, normalizedNote, currentIntent.key);
      }
      decisionIntentRef.current = window.FlowMateOtIntent.complete();
      setActionState({ status: "success", message: "Decision saved to the request audit." });
      setSelected(null);
      setNote("");
      onChanged();
    } catch (error) {
      setActionState({ status: "error", message: error.message || "The decision could not be saved." });
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
    setBulkReview({ requestsToVerify, excludedRequests });
    setActionState({ status: "idle", message: "" });
  }

  async function confirmBulkVerification() {
    const requestsToVerify = bulkReview?.requestsToVerify || [];
    if (!requestsToVerify.length || decisionSubmissionRef.current || actionState.status === "submitting") return;
    decisionSubmissionRef.current = true;
    setActionState({ status: "submitting", message: `Verifying ${requestsToVerify.length} eligible actual occurrence(s) individually…` });
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
      setActionState({ status: "success", message: `${completed} actual occurrence(s) verified individually and audited.` });
      setBulkReview(null);
      onChanged();
    } catch (error) {
      setBulkReview(current => current ? { ...current, requestsToVerify: requestsToVerify.slice(completed) } : current);
      setActionState({ status: "error", message: `${completed} verified. Bulk action stopped at the first server error: ${error.message || "Verification failed."}` });
      onChanged();
    } finally {
      decisionSubmissionRef.current = false;
    }
  }

  const selectedChecks = selected?.kind === "actual" ? getActualChecks(selected.request) : null;
  const selectedTotal = selected ? employeeTotals[getOtManagerEmployeeId(selected.request)]?.countedMinutes || 0 : 0;
  const selectedPlanned = selected ? getOccurrenceMinutes(selected.request, "plannedMinutes") : 0;
  const selectedActual = selected ? getOccurrenceMinutes(selected.request, "actualMinutes") : 0;
  const eligibleActualCount = actualRequests.filter(request => canAct(request) && getActualChecks(request).canBulkVerify).length;

  function renderQueueItem(kind, request, statusNode) {
    const content = <><span><strong>{request.title}</strong><small>{getOtManagerEmployeeName(request, peopleById)}</small></span>{statusNode}</>;
    const checks = kind === "actual" ? getActualChecks(request) : null;
    return canTakeAction(kind, request)
      ? <button key={request.id} type="button" className="ot-queue-item" disabled={actionState.status === "submitting"} onClick={() => openDecision(kind, request)}>{content}</button>
      : <div key={request.id} className="ot-queue-item ot-queue-item--readonly">{content}<small>{checks?.awaitingHrCompliance ? "Awaiting HR compliance" : "Read only — assigned approver action"}</small></div>;
  }

  return (
    <section className="ot-list" aria-label="Manager OT approval queues">
      <div className="ot-section-head"><h2>Approval & actual verification</h2><span>{planRequests.length} plan · {actualRequests.length} actual</span></div>
      {bulkReview && <section className="ot-decision ot-bulk-review" aria-label="Bulk verification review">
        <div className="ot-section-head"><div><h3>Bulk verification review</h3><p className="muted">Confirm only after reviewing each included occurrence. Writes run sequentially and stop at the first server error.</p></div><button type="button" className="btn btn--ghost" disabled={actionState.status === "submitting"} onClick={() => setBulkReview(null)}>Close</button></div>
        <div className="ot-bulk-list">{bulkReview.requestsToVerify.map(request => { const checks = getActualChecks(request); const planned = getOccurrenceMinutes(request, "plannedMinutes"); const actual = getOccurrenceMinutes(request, "actualMinutes"); return <article className="ot-bulk-row" key={request.id}><div className="ot-section-head"><div><strong>{request.title}</strong><small>{getOtManagerEmployeeName(request, peopleById)}</small></div><span className="ot-status">Included</span></div><div className="ot-detail-grid"><div><span>Consent timestamp</span><strong>{formatConsentTimestamp(request)}</strong></div><div><span>Signed variance</span><strong>{window.FlowMateOtRequestDomain.formatSignedHours(actual - planned)}</strong></div><div><span>Employee weekly total</span><strong>{formatOtHours(checks.weeklyTotal)} / 36h</strong></div></div><p className="muted">No blocking consent, variance, weekly-limit, or compliance warning.</p></article>; })}</div>
        {!!bulkReview.excludedRequests.length && <div className="ot-bulk-excluded"><h4>Excluded from bulk</h4>{bulkReview.excludedRequests.map(request => { const checks = getActualChecks(request); const planned = getOccurrenceMinutes(request, "plannedMinutes"); const actual = getOccurrenceMinutes(request, "actualMinutes"); return <article className="ot-bulk-row ot-bulk-row--excluded" key={request.id}><strong>{request.title}</strong><small>{getOtManagerEmployeeName(request, peopleById)}</small><div className="ot-detail-grid"><div><span>Consent timestamp</span><strong>{formatConsentTimestamp(request)}</strong></div><div><span>Signed variance</span><strong>{window.FlowMateOtRequestDomain.formatSignedHours(actual - planned)}</strong></div><div><span>Employee weekly total</span><strong>{formatOtHours(checks.weeklyTotal)} / 36h</strong></div></div><ul>{getBulkExclusionReasons(request, checks).map(reason => <li key={reason}>{reason}</li>)}</ul></article>; })}</div>}
        <div className="ot-form__actions"><button type="button" className="btn btn--secondary" disabled={actionState.status === "submitting"} onClick={() => setBulkReview(null)}>Cancel</button><button type="button" className="btn btn--primary" disabled={!bulkReview.requestsToVerify.length || actionState.status === "submitting"} onClick={confirmBulkVerification}>Confirm {bulkReview.requestsToVerify.length} verifications</button></div>
      </section>}
      <div className="ot-queue-grid">
        <section className="ot-queue"><h3>Planned requests</h3>{planRequests.map(request => renderQueueItem("plan", request, <span className={`ot-status ot-status--${getOtRequestStatus(request)}`}>{getOtStatusLabel(getOtRequestStatus(request))}</span>))}{!planRequests.length && <div className="ot-state ot-state--compact">No planned requests need a decision.</div>}</section>
        <section className="ot-queue"><div className="ot-queue__head"><h3>Actual verification</h3><button type="button" className="btn btn--sm btn--secondary" disabled={!eligibleActualCount || actionState.status === "submitting"} onClick={openBulkReview}>Review {eligibleActualCount} eligible</button></div>{actualRequests.map(request => { const checks = getActualChecks(request); const label = checks.awaitingHrCompliance ? "Awaiting HR compliance" : checks.canVerifyIndividually ? "Ready" : "Review"; return renderQueueItem("actual", request, <span className={`ot-status ${checks.canVerifyIndividually ? "" : "ot-status--revision_required"}`}>{label}</span>); })}{!actualRequests.length && <div className="ot-state ot-state--compact">No actual records need verification.</div>}</section>
      </div>

      {selected && <section className="ot-decision" aria-label="OT decision details"><div className="ot-section-head"><h3>Review before decision</h3><button type="button" className="btn btn--ghost" disabled={actionState.status === "submitting"} onClick={() => setSelected(null)}>Close</button></div><div className="ot-detail-grid"><div><span>Employee</span><strong>{getOtManagerEmployeeName(selected.request, peopleById)}</strong></div><div><span>Consent timestamp</span><strong>{otValue(selected.request, "employeeConsentedAt", "employee_consented_at") ? new Date(otValue(selected.request, "employeeConsentedAt", "employee_consented_at")).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" }) : "Not recorded"}</strong></div><div><span>Planned / actual variance</span><strong>{formatOtHours(selectedPlanned)} / {selectedActual ? formatOtHours(selectedActual) : "—"} ({selectedActual ? `${selectedActual - selectedPlanned}m` : "—"})</strong></div><div><span>Employee weekly total</span><strong>{formatOtHours(selectedTotal)} / 36h</strong></div></div>
        {selected?.kind === "actual" && <div className="ot-detail-grid"><div><span>Signed variance</span><strong>{otValue(selected.request, "actualSubmittedAt", "actual_submitted_at") ? window.FlowMateOtRequestDomain.formatSignedHours(selectedActual - selectedPlanned) : "—"}</strong></div></div>}
        {selectedTotal > OT_LIMIT_MINUTES && <OtWarning kind="critical" title="Weekly limit" message={selected.kind === "actual" ? "This employee/week is above 36h. The assigned approver may verify truthful actual time; the server keeps the compliance gate active." : "This employee/week is above 36h. Plan approval is blocked."} />}
        {selectedChecks && !selectedChecks.consentAccepted && <OtWarning kind="critical" title="Consent missing" message="Individual employee consent must be accepted before actual verification." />}
        {selectedChecks?.varianceNeedsReason && !selectedChecks.varianceHasReason && <OtWarning kind="critical" title="Variance reason missing" message="A change above 30 minutes needs an employee reason before verification." />}
        {selectedChecks?.complianceRequired && <OtWarning kind="critical" title="Compliance review required" message="The assigned approver may verify truthful actual time individually. The server retains the compliance gate after approval." />}
        <label className="field"><span className="field__label">Decision note {selected.kind === "plan" ? "(required for reject or revision)" : selectedChecks?.complianceRequired ? "(required for return or required for compliance approval)" : "(required for return)"}</span><textarea className="textarea" value={note} disabled={actionState.status === "submitting"} onChange={event => setNote(event.target.value)} placeholder="Add the operational decision context" /></label>
        <p className="muted">Every decision is saved through the assigned-request RPC and recorded in the audit trail.</p>
        <div className="ot-form__actions">{selected.kind === "plan" ? <><button type="button" className="btn btn--secondary" disabled={!note.trim() || actionState.status === "submitting"} onClick={() => decide("rejected")}>Reject plan</button><button type="button" className="btn btn--primary" disabled={selectedTotal > OT_LIMIT_MINUTES || actionState.status === "submitting"} onClick={() => decide("approved")}>Approve plan</button></> : <><button type="button" className="btn btn--secondary" disabled={!note.trim() || actionState.status === "submitting"} onClick={() => decide("revision_required")}>Return actual</button><button type="button" className="btn btn--primary" disabled={!selectedChecks?.canVerifyIndividually || (selectedChecks?.complianceRequired && !note.trim()) || actionState.status === "submitting"} onClick={() => decide("approved")}>Verify actual</button></>}</div>
      </section>}
      {actionState.message && <OtWarning kind={actionState.status === "error" ? "error" : "info"} message={actionState.message} />}
    </section>
  );
}

function OtEventPlanForm({ access, onSuccess }) {
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
    employeeUserIds: [],
  });
  const [directoryState, setDirectoryState] = useStateApp({ status: "loading", people: [], approvers: [], message: "" });
  const [previewState, setPreviewState] = useStateApp({ status: "idle", result: null, payload: null, message: "" });
  const [submitState, setSubmitState] = useStateApp({ status: "idle", message: "", result: null });
  const [intent, setIntent] = useStateApp(() => ({ key: crypto.randomUUID(), attempted: false }));

  useEffectApp(() => {
    let alive = true;
    Promise.all([window.loadOtPeopleForEvent(), window.loadOtEligibleApprovers()]).then(([people, approvers]) => {
      if (!alive) return;
      const activeApprovers = (Array.isArray(approvers) ? approvers : []).filter(approver => approver.userId === access.userId);
      setDirectoryState({ status: "ready", people: Array.isArray(people) ? people : [], approvers: activeApprovers, message: "" });
      if (activeApprovers.length === 1) setForm(current => ({ ...current, approverUserId: activeApprovers[0].userId }));
    }).catch(error => {
      if (alive) setDirectoryState({ status: "error", people: [], approvers: [], message: error.message || "Event participants and approvers could not be loaded." });
    });
    return () => { alive = false; };
  }, [access.userId]);

  function update(field, value) {
    if (submitState.status === "submitting") return;
    setForm(current => ({ ...current, [field]: value }));
    setPreviewState({ status: "idle", result: null, payload: null, message: "Plan changed. Preview again before creating it." });
    if (intent.attempted) setIntent({ key: crypto.randomUUID(), attempted: false });
  }

  function toggleEmployee(employeeUserId) {
    update("employeeUserIds", form.employeeUserIds.includes(employeeUserId)
      ? form.employeeUserIds.filter(id => id !== employeeUserId)
      : form.employeeUserIds.concat(employeeUserId));
  }

  let schedule = { valid: false, endDate: form.endDate, segments: [], crossesWeek: false, message: "Complete the shared event schedule." };
  try {
    const endDate = form.endDate === form.startDate && form.endTime <= form.startTime ? addOtDays(form.endDate, 1) : form.endDate;
    const lastWorkedDate = form.endTime === "00:00" ? addOtDays(endDate, -1) : endDate;
    const crossesWeek = window.FlowMateOtRequestDomain.getWeekStartKey(form.startDate) !== window.FlowMateOtRequestDomain.getWeekStartKey(lastWorkedDate);
    const splitInput = {
      startDate: form.startDate,
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
    schedule = { valid: true, endDate, segments, crossesWeek, message: "" };
  } catch (error) {
    schedule = { ...schedule, message: error.message };
  }

  const detailRequired = OT_DETAIL_REQUIRED_REASONS.has(form.reasonCode);
  const venueRequired = form.workLocationType === "venue";
  const plannedStartIsFuture = schedule.valid && window.FlowMateOtRequestDomain.isBangkokPlannedStartFuture(form.startDate, form.startTime);
  const baseComplete = schedule.valid && form.title.trim() && form.functionCode && form.reasonCode
    && plannedStartIsFuture
    && (!detailRequired || form.reasonDetail.trim()) && (!venueRequired || form.venue.trim())
    && form.approverUserId && form.employeeUserIds.length > 0 && directoryState.status === "ready";

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
      approverUserId: form.approverUserId,
    };
  }

  async function previewPlan() {
    if (schedule.valid && !window.FlowMateOtRequestDomain.isBangkokPlannedStartFuture(form.startDate, form.startTime)) {
      setPreviewState({ status: "error", result: null, payload: null, message: "Request must be submitted before OT starts." });
      return;
    }
    if (!baseComplete) {
      setPreviewState({ status: "error", result: null, payload: null, message: schedule.valid ? "Complete the required fields and select at least one participant." : schedule.message });
      return;
    }
    const payload = buildEventPayload();
    setPreviewState({ status: "loading", result: null, payload, message: "Checking every employee and affected week…" });
    try {
      const result = await window.previewOtEventPlan(payload, form.employeeUserIds);
      setPreviewState({ status: "ready", result: result || {}, payload, message: "" });
    } catch (error) {
      setPreviewState({ status: "error", result: null, payload: null, message: error.message || "The event plan could not be previewed." });
    }
  }

  const previewEmployees = Array.isArray(previewState.result?.employees) ? previewState.result.employees : [];
  const eligibleEmployeeIds = previewEmployees.filter(employee => employee.canCreate).map(employee => employee.employeeUserId);
  const blockedCount = previewEmployees.length - eligibleEmployeeIds.length;
  const canCreate = previewState.status === "ready" && eligibleEmployeeIds.length > 0 && submitState.status !== "submitting" && submitState.status !== "success";

  async function createPlan(event) {
    event.preventDefault();
    if (schedule.valid && !window.FlowMateOtRequestDomain.isBangkokPlannedStartFuture(form.startDate, form.startTime)) {
      setSubmitState({ status: "error", message: "Request must be submitted before OT starts.", result: null });
      return;
    }
    if (!canCreate || !previewState.payload) {
      setSubmitState({ status: "error", message: "Preview the current plan and keep at least one employee within 36h before creating it.", result: null });
      return;
    }
    setIntent(current => ({ ...current, attempted: true }));
    setSubmitState({ status: "submitting", message: "Creating individual Awaiting consent assignments…", result: null });
    const payload = previewState.payload;
    try {
      const result = await window.createOtEventPlan(payload, eligibleEmployeeIds, intent.key);
      const requestCount = Array.isArray(result?.requestIds) ? result.requestIds.length : eligibleEmployeeIds.length;
      setSubmitState({ status: "success", message: `Consent received 0/${requestCount}`, result });
      setIntent({ key: crypto.randomUUID(), attempted: false });
      onSuccess();
    } catch (error) {
      setSubmitState({ status: "error", message: error.message || "The event plan could not be created. No local limit check can override the server transaction.", result: null });
    }
  }

  if (submitState.status === "success") {
    return <div className="ot-state" role="status"><strong>Event plan created</strong><span>{submitState.message}</span><span className="ot-status ot-status--awaiting_consent">Awaiting consent</span><small>Each included employee has one individual occurrence and must consent separately.</small></div>;
  }

  return (
    <form className="ot-form" onSubmit={createPlan} noValidate>
      <fieldset className="ot-form__fieldset" disabled={submitState.status === "submitting"}>
        <div className="form-grid">
          <label className="field"><span className="field__label">Shared event title *</span><input className="input" value={form.title} onChange={event => update("title", event.target.value)} required /></label>
          <label className="field"><span className="field__label">Function *</span><select className="select" value={form.functionCode} onChange={event => update("functionCode", event.target.value)} required><option value="">Select Function</option>{OT_FUNCTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <label className="field"><span className="field__label">Start date *</span><input className="input" type="date" value={form.startDate} onChange={event => update("startDate", event.target.value)} required /></label>
          <label className="field"><span className="field__label">End date *</span><input className="input" type="date" min={form.startDate} value={form.endDate} onChange={event => update("endDate", event.target.value)} required /></label>
          <label className="field"><span className="field__label">Start time *</span><input className="input" type="time" value={form.startTime} onChange={event => update("startTime", event.target.value)} required /></label>
          <label className="field"><span className="field__label">End time *</span><input className="input" type="time" value={form.endTime} onChange={event => update("endTime", event.target.value)} required /></label>
          <label className="field"><span className="field__label">Break (minutes) *</span><input className="input" type="number" min="0" step="1" value={form.breakMinutes} onChange={event => update("breakMinutes", event.target.value)} required /></label>
          <label className="field"><span className="field__label">Day type *</span><select className="select" value={form.dayType} onChange={event => update("dayType", event.target.value)}><option value="working_day">Working day</option><option value="rest_day">Weekly holiday</option><option value="public_holiday">Public holiday</option></select></label>
          {schedule.crossesWeek && <><label className="field"><span className="field__label">Break before week boundary *</span><input className="input" type="number" min="0" step="1" value={form.breakMinutesBeforeBoundary} onChange={event => update("breakMinutesBeforeBoundary", event.target.value)} /></label><label className="field"><span className="field__label">Break after week boundary *</span><input className="input" type="number" min="0" step="1" value={form.breakMinutesAfterBoundary} onChange={event => update("breakMinutesAfterBoundary", event.target.value)} /></label></>}
          <label className="field"><span className="field__label">Location *</span><select className="select" value={form.workLocationType} onChange={event => update("workLocationType", event.target.value)}><option value="venue">Venue / off-site</option><option value="office">Office</option><option value="remote">Remote</option></select></label>
          {venueRequired && <label className="field"><span className="field__label">Venue *</span><input className="input" value={form.venue} onChange={event => update("venue", event.target.value)} placeholder="Tournament or event venue" required /></label>}
          <label className="field"><span className="field__label">Reason *</span><select className="select" value={form.reasonCode} onChange={event => update("reasonCode", event.target.value)}>{window.FlowMateOtRequestDomain.REASON_OPTIONS.map(reason => <option key={reason.key} value={reason.key}>{reason.label}</option>)}</select></label>
          <label className="field"><span className="field__label">Assigned approver *</span><select className="select" value={form.approverUserId} onChange={event => update("approverUserId", event.target.value)} disabled={directoryState.status !== "ready" || !directoryState.approvers.length}><option value="">Select approver</option>{directoryState.approvers.map(approver => <option key={approver.userId} value={approver.userId}>{approver.displayName || approver.email}</option>)}</select><span className="field__hint">The assigned approver must personally create and authorize the shared plan.</span></label>
          <label className="field field--full"><span className="field__label">Reason detail {detailRequired ? "*" : "(optional)"}</span><textarea className="textarea" value={form.reasonDetail} onChange={event => update("reasonDetail", event.target.value)} required={detailRequired} /></label>
        </div>

        <section className="ot-participants" aria-label="Event participants"><div className="ot-section-head"><h3>Participants *</h3><span>{form.employeeUserIds.length} selected</span></div>{directoryState.status === "loading" && <div className="ot-state ot-state--compact" role="status">Loading event participants…</div>}{directoryState.status === "error" && <OtWarning kind="error" message={directoryState.message} />}{directoryState.status === "ready" && <div className="ot-participant-grid">{directoryState.people.map(person => <label key={person.userId} className="ot-participant"><input type="checkbox" checked={form.employeeUserIds.includes(person.userId)} onChange={() => toggleEmployee(person.userId)} /><span><strong>{person.displayName || person.email}</strong><small>{person.requesterTeam || person.email}</small></span></label>)}</div>}</section>

        {!schedule.valid && <OtWarning kind="error" title="Schedule needs attention" message={schedule.message} />}
        {schedule.valid && !plannedStartIsFuture && <OtWarning kind="error" title="Start time needs attention" message="Request must be submitted before OT starts." />}
        <div className="ot-form__actions"><button type="button" className="btn btn--secondary" disabled={!baseComplete || previewState.status === "loading"} onClick={previewPlan}>{previewState.status === "loading" ? "Checking limits…" : "Preview employee limits"}</button></div>

        {previewState.status === "ready" && <section className="ot-event-preview" aria-label="Per employee event limit preview"><div className="ot-section-head"><h3>Per-employee projected totals</h3><span>{eligibleEmployeeIds.length} included · {blockedCount} excluded</span></div>{previewEmployees.map(employee => { const person = directoryState.people.find(row => row.userId === employee.employeeUserId); return <article key={employee.employeeUserId} className={`ot-event-preview__row ${employee.canCreate ? "" : "is-blocked"}`}><div><strong>{person?.displayName || person?.email || `Employee ${String(employee.employeeUserId).slice(0, 8)}`}</strong><small>{employee.canCreate ? "Included in plan" : "This employee is excluded because at least one affected week would exceed 36h."}</small></div><div>{(employee.weekChecks || []).map(check => <span key={check.weekStart}><b>{formatOtDate(check.weekStart)}</b> {formatOtHours(check.projectedMinutes)} / 36h</span>)}</div></article>; })}</section>}
        {blockedCount > 0 && <OtWarning kind="critical" title="Employees excluded" message="Blocked employee/weeks will not be sent to createOtEventPlan. The server recalculates every included employee inside the creation transaction." />}
      </fieldset>
      {previewState.status === "error" && <OtWarning kind="error" message={previewState.message} />}
      {submitState.message && <OtWarning kind={submitState.status === "error" ? "error" : "info"} message={submitState.message} />}
      <div className="ot-form__actions"><button type="submit" className="btn btn--primary" disabled={!canCreate}>{submitState.status === "submitting" ? "Creating assignments…" : `Create plan for ${eligibleEmployeeIds.length} included employee(s)`}</button></div>
    </form>
  );
}

function OtTeamWeekTable({ requests, allRequests, peopleById, onOpenRequest }) {
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
      functionGroup = { functionCode, employees: [] };
      groups.push(functionGroup);
    }
    let employeeGroup = functionGroup.employees.find(group => group.employeeId === employeeId);
    if (!employeeGroup) {
      employeeGroup = { employeeId, name: getOtManagerEmployeeName(request, peopleById), requests: [] };
      functionGroup.employees.push(employeeGroup);
    }
    employeeGroup.requests.push(request);
  });

  return (
    <section className="ot-list" aria-label="Assigned team weekly OT table">
      <div className="ot-section-head"><h2>Team week by Function</h2><span>{requests.length} authorized occurrence{requests.length === 1 ? "" : "s"}</span></div>
      {!requests.length ? <div className="ot-state">No assigned OT rows match the current filters.</div> : <div className="ot-table-wrap"><table className="tbl ot-table ot-team-table"><thead><tr><th>Employee</th><th>Function</th><th>Assignment / event</th><th>Planned</th><th>Actual</th><th>Weekly total</th><th>Remaining</th><th>Status</th><th>Details</th></tr></thead><tbody>{groups.map(functionGroup => <React.Fragment key={functionGroup.functionCode}><tr className="ot-table-group"><th colSpan="9" scope="rowgroup">{OT_FUNCTIONS.find(option => option.value === functionGroup.functionCode)?.label || String(functionGroup.functionCode).toUpperCase()}</th></tr>{functionGroup.employees.map(employeeGroup => employeeGroup.requests.map((request, index) => { const total = employeeTotals[employeeGroup.employeeId]?.countedMinutes || 0; const remaining = Math.max(0, OT_LIMIT_MINUTES - total); return <tr key={request.id}>{index === 0 && <th rowSpan={employeeGroup.requests.length} scope="row"><strong>{employeeGroup.name}</strong><small>{employeeGroup.requests.length} occurrence{employeeGroup.requests.length === 1 ? "" : "s"}</small></th>}<td>{String(functionGroup.functionCode).toUpperCase()}</td><td><strong>{request.title}</strong><small>{otValue(request, "eventPlanId", "event_plan_id") ? "Shared event" : "Individual request"}</small></td><td>{formatOtHours(request.plannedMinutes)}</td><td>{request.actualMinutes ? formatOtHours(request.actualMinutes) : "—"}</td><td><strong>{formatOtHours(total)}</strong><OtLimitProgress totalMinutes={total} /></td><td>{formatOtHours(remaining)}</td><td><span className={`ot-status ot-status--${getOtRequestStatus(request)}`}>{getOtStatusLabel(getOtRequestStatus(request))}</span></td><td><button type="button" className="btn btn--sm btn--secondary" onClick={() => onOpenRequest(request)}>Open</button></td></tr>; }))}</React.Fragment>)}</tbody></table></div>}
    </section>
  );
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
      weekStarts: [],
    };
    rowsByRequestId.set(requestId, {
      ...current,
      plannedMinutes: current.plannedMinutes + Number(request.plannedMinutes || 0),
      actualMinutes: current.actualMinutes + Number(request.actualMinutes || 0),
      weekStarts: Array.from(new Set(current.weekStarts.concat(request.weekStart).filter(Boolean))).sort(),
    });
  });
  return Array.from(rowsByRequestId.values()).sort((left, right) => left.requestId.localeCompare(right.requestId));
}

function OtRootCausePanel({ filteredRows, currentWeekStart, weekStarts, filterKey }) {
  const [selectedInsightState, setSelectedInsightState] = useStateApp(null);
  const selectedInsight = selectedInsightState?.filterKey === filterKey ? selectedInsightState.insight : null;
  const confirmedRows = filteredRows.filter(isOtActualConfirmed);
  const insights = window.FlowMateOtRequestDomain.buildRootCauseInsights(filteredRows, { currentWeekStart });
  const weeklyTrend = window.FlowMateOtRequestDomain.buildOtWeeklyTrend(filteredRows, weekStarts);
  const concentration = window.FlowMateOtRequestDomain.buildOtWorkloadConcentration(filteredRows);
  const analytics = { weeklyTrend, ...concentration };
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
    recurring_rework_or_scope_change: "Rework or scope change appeared at least three times within four weeks.",
  };
  const selectedRows = selectedInsight ? buildOtInsightRows(filteredRows, selectedInsight.recordIds) : [];

  return (
    <section className="ot-root-cause" aria-labelledby="ot-root-cause-title">
      <div className="ot-section-head"><div><h2 id="ot-root-cause-title">OT Health & Root Cause</h2><p className="muted">Operational patterns by reason, Function, event, and week. Current filters stay applied to every drill-down.</p></div><span>{confirmedRows.length} confirmed rows</span></div>
      <section className="ot-analytics-grid" aria-label="Confirmed OT operational analytics">
        <article className="ot-analytics-card" aria-labelledby="ot-weekly-trend-title">
          <h3 id="ot-weekly-trend-title">Confirmed OT trend — latest 5 Bangkok weeks</h3>
          <p className="muted">Approved Actual time only. Zero-minute weeks remain visible for an honest five-week comparison.</p>
          <div className="ot-table-wrap"><table className="ot-analytics-table"><caption>Approved Actual hours by Bangkok week</caption><thead><tr><th scope="col">Bangkok week</th><th scope="col">Confirmed Actual</th></tr></thead><tbody>{analytics.weeklyTrend.map(row => <tr key={row.weekStart}><th scope="row">{formatOtDate(row.weekStart)}</th><td>{formatOtHours(row.actualMinutes)}</td></tr>)}</tbody></table></div>
        </article>
        <article className="ot-analytics-card" aria-labelledby="ot-workload-concentration-title">
          <h3 id="ot-workload-concentration-title">Workload concentration by Function / assignment</h3>
          <p className="muted">Operational workload only—this view never evaluates or compares people.</p>
          <div className="ot-concentration-grid">
            <section aria-labelledby="ot-function-concentration-title"><h4 id="ot-function-concentration-title">By Function</h4><div className="ot-table-wrap"><table className="ot-analytics-table"><caption>Approved Actual workload share by Function</caption><thead><tr><th scope="col">Function</th><th scope="col">Hours</th><th scope="col">Share</th></tr></thead><tbody>{analytics.byFunction.length ? analytics.byFunction.map(row => <tr key={row.key}><th scope="row">{OT_FUNCTIONS.find(option => option.value === row.key)?.label || row.key.toUpperCase()}</th><td>{formatOtHours(row.actualMinutes)}</td><td>{Math.round(row.share * 100)}%</td></tr>) : <tr><td colSpan="3">No approved Actual workload.</td></tr>}</tbody></table></div></section>
            <section aria-labelledby="ot-assignment-concentration-title"><h4 id="ot-assignment-concentration-title">By assignment / event</h4><div className="ot-table-wrap"><table className="ot-analytics-table"><caption>Approved Actual workload share by operational assignment or event</caption><thead><tr><th scope="col">Assignment / event</th><th scope="col">Hours</th><th scope="col">Share</th></tr></thead><tbody>{analytics.byAssignment.length ? analytics.byAssignment.map(row => <tr key={row.key}><th scope="row">{row.label}</th><td>{formatOtHours(row.actualMinutes)}</td><td>{Math.round(row.share * 100)}%</td></tr>) : <tr><td colSpan="3">No approved Actual workload.</td></tr>}</tbody></table></div></section>
          </div>
        </article>
      </section>
      {!confirmedRows.length ? <div className="ot-state">No confirmed OT rows match the current authorized filters.</div> : <>
        <section className="ot-root-summary" aria-label="Root cause summary"><div><span>Planned share</span><strong>{totalActual ? `${Math.round((plannedMinutes / totalActual) * 100)}%` : "0%"}</strong></div><div><span>Emergency share</span><strong>{totalActual ? `${Math.round((emergencyMinutes / totalActual) * 100)}%` : "0%"}</strong></div><div><span>Plan / actual variance</span><strong>{window.FlowMateOtRequestDomain.formatSignedHours(totalActual - totalPlanned)}</strong></div><div><span>Recurring weeks</span><strong>{recurringWeeks}</strong></div></section>
        <section className="ot-root-grid"><article className="ot-root-card"><h3>{OT_ROOT_CAUSE_LABELS[0]}</h3>{Object.entries(functionTotals).sort((left, right) => left[0].localeCompare(right[0])).map(([functionCode, minutes]) => <div className="ot-root-bar" key={functionCode}><span>{OT_FUNCTIONS.find(option => option.value === functionCode)?.label || functionCode.toUpperCase()}</span><div><i style={{ width: `${totalActual ? Math.max(4, Math.round((minutes / totalActual) * 100)) : 0}%` }} /></div><strong>{formatOtHours(minutes)}</strong></div>)}</article><article className="ot-root-card"><h3>{OT_ROOT_CAUSE_LABELS[1]}</h3>{Object.entries(reasonTotals).sort((left, right) => right[1] - left[1]).map(([reasonCode, minutes]) => <div className="ot-root-bar" key={reasonCode}><span>{window.FlowMateOtRequestDomain.REASON_OPTIONS.find(reason => reason.key === reasonCode)?.label || getOtStatusLabel(reasonCode)}</span><div><i style={{ width: `${totalActual ? Math.max(4, Math.round((minutes / totalActual) * 100)) : 0}%` }} /></div><strong>{formatOtHours(minutes)}</strong></div>)}</article></section>
        <section className="ot-insights" aria-label="Deterministic OT insights"><div className="ot-section-head"><h3>Approved operational checks</h3><span>{insights.length} signal{insights.length === 1 ? "" : "s"}</span></div>{!insights.length ? <div className="ot-state ot-state--compact">No deterministic rule is triggered by the confirmed rows in this scope.</div> : insights.map((insight, index) => <article className="ot-insight" key={`${insight.key}:${index}`}><div><strong>{insightCopy[insight.key] || insight.message}</strong><small>{insight.message}</small></div><button type="button" className="btn btn--sm btn--secondary" onClick={() => setSelectedInsightState({ filterKey, insight })}>View authorized rows</button></article>)}</section>
      </>}
      {selectedInsight && <section className="ot-manager-detail" aria-label="Authorized root cause drill-down"><div className="ot-section-head"><h3>Authorized operational rows behind this signal</h3><button type="button" className="btn btn--ghost" onClick={() => setSelectedInsightState(null)}>Close</button></div><p className="muted">Current filters stay applied. Only operational facts already returned by the assigned-scope manager RPC are shown; employee identities are omitted.</p>{selectedRows.map(request => <article className="ot-insight-row" key={request.id}><div><strong>{request.title}</strong><small>{String(request.functionCode || "unassigned").toUpperCase()} · {getOtStatusLabel(request.reasonCode)} · {request.weekStarts.map(formatOtDate).join(", ")}</small></div><span>{formatOtHours(request.actualMinutes)}</span></article>)}</section>}
    </section>
  );
}

function formatOtDateTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function OtActualAmendmentAction({ access, request, onChanged }) {
  const [reason, setReason] = useStateApp("");
  const [intent, setIntent] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({ status: "idle", message: "" });
  const submissionRef = useRefApp(false);
  const canAmend = window.FlowMateOtRequestDomain.canRequestActualAmendment(access, request);
  const requestId = request ? getOtManagerRequestId(request) : "";

  function updateReason(value) {
    if (submissionRef.current || actionState.status === "submitting") return;
    setReason(value);
    if (actionState.status !== "idle") setActionState({ status: "idle", message: "" });
  }

  async function requestCorrection(event) {
    event.preventDefault();
    if (!canAmend || submissionRef.current || actionState.status === "submitting") return;
    if (!reason.trim()) {
      setActionState({ status: "error", message: "A correction reason is required." });
      return;
    }
    const normalizedReason = reason.trim();
    const signature = window.FlowMateOtIntent.signature([requestId, normalizedReason]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    submissionRef.current = true;
    setActionState({ status: "submitting", message: "Requesting an audited actual correction…" });
    try {
      await window.requestOtActualAmendment(requestId, normalizedReason, currentIntent.key);
      setIntent(window.FlowMateOtIntent.complete());
      setReason("");
      setActionState({ status: "success", message: "Actual correction requested. The employee can now submit corrected actual time." });
      if (onChanged) onChanged();
    } catch (error) {
      setActionState({ status: "error", message: error.message || "Actual correction could not be requested. Retry uses the same action key." });
    } finally {
      submissionRef.current = false;
    }
  }

  if (!canAmend) return null;
  return (
    <form className="ot-workflow" aria-label="Request actual correction" onSubmit={requestCorrection}>
      <fieldset className="ot-form__fieldset" disabled={actionState.status === "submitting"}>
        <h3>Request correction of approved actual</h3>
        <p className="muted">The existing actual time remains in audit until the employee submits a correction.</p>
        <label className="field"><span className="field__label">Correction reason *</span><textarea className="textarea" value={reason} onChange={event => updateReason(event.target.value)} required placeholder="Explain why the approved actual needs correction." /></label>
        <div className="ot-form__actions"><button type="submit" className="btn btn--secondary" disabled={!reason.trim() || actionState.status === "submitting"}>{actionState.status === "submitting" ? "Requesting correction…" : "Request actual correction"}</button></div>
      </fieldset>
      {actionState.message && <OtWarning kind={actionState.status === "error" ? "error" : "info"} message={actionState.message} />}
    </form>
  );
}

function OtAuditTimeline({ requestId: providedRequestId = "", refreshKey = 0 }) {
  const [requestIdInput, setRequestIdInput] = useStateApp("");
  const [submittedRequestId, setSubmittedRequestId] = useStateApp("");
  const [filters, setFilters] = useStateApp({ query: "", action: "" });
  const [loadState, setLoadState] = useStateApp({ status: "idle", rows: [], message: "" });
  const requestId = providedRequestId || submittedRequestId;

  useEffectApp(() => {
    if (!requestId) {
      setLoadState({ status: "idle", rows: [], message: "" });
      return undefined;
    }
    let alive = true;
    setLoadState(current => ({ ...current, status: "loading", message: "" }));
    window.loadOtRequestAudit(requestId).then(rows => {
      if (alive) setLoadState({ status: "ready", rows: Array.isArray(rows) ? rows : [], message: "" });
    }).catch(error => {
      if (alive) setLoadState({ status: "error", rows: [], message: error.message || "OT audit could not be loaded." });
    });
    return () => { alive = false; };
  }, [requestId, refreshKey]);

  const normalizedRows = loadState.rows.map(row => ({
    ...row,
    actorUserId: otValue(row, "actorUserId", "actor_user_id") || "Unknown actor",
    action: otValue(row, "action", "action") || "unknown_action",
    oldStatus: otValue(row, "oldStatus", "old_status") || "—",
    newStatus: otValue(row, "newStatus", "new_status") || "—",
    changedFields: otValue(row, "changedFields", "changed_fields") || {},
    note: otValue(row, "note", "note") || "—",
    createdAt: otValue(row, "createdAt", "created_at"),
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

  return (
    <section className="ot-audit ot-list" aria-label="Read-only OT request audit">
      <div className="ot-section-head"><div><h2>Immutable audit trail</h2><p className="muted">Read-only actor, action, status, field, reason, and timestamp history returned by the authorized audit RPC.</p></div>{requestId && <span>{requestId}</span>}</div>
      {!providedRequestId && <form className="ot-audit__lookup" onSubmit={submitRequestId}><label className="field"><span className="field__label">Request ID</span><input className="input" value={requestIdInput} onChange={event => setRequestIdInput(event.target.value)} placeholder="Paste an authorized OT request ID" required /></label><button type="submit" className="btn btn--secondary">Load audit</button></form>}
      {requestId && <section className="ot-audit__filters" aria-label="Audit filters"><label className="field"><span className="field__label">Search actor, reason, or changed field</span><input className="input" type="search" value={filters.query} onChange={event => setFilters(current => ({ ...current, query: event.target.value }))} /></label><label className="field"><span className="field__label">Action</span><select className="select" value={filters.action} onChange={event => setFilters(current => ({ ...current, action: event.target.value }))}><option value="">All actions</option>{actionOptions.map(action => <option key={action} value={action}>{getOtStatusLabel(action)}</option>)}</select></label></section>}
      {loadState.status === "loading" && <div className="ot-state ot-state--compact" role="status">Loading immutable audit entries…</div>}
      {loadState.status === "error" && <OtWarning kind="error" message={loadState.message} />}
      {loadState.status === "idle" && <div className="ot-state ot-state--compact">Choose a request from compliance review, or enter an authorized request ID.</div>}
      {loadState.status === "ready" && !visibleRows.length && <div className="ot-state ot-state--compact">No audit entries match the current filters.</div>}
      {loadState.status === "ready" && !!visibleRows.length && <ol className="ot-audit__timeline">{visibleRows.map(row => <li key={row.id}><div className="ot-section-head"><div><strong>{getOtStatusLabel(row.action)}</strong><small>Actor {row.actorUserId}</small></div><time dateTime={row.createdAt}>{formatOtDateTime(row.createdAt)}</time></div><div className="ot-audit__status"><span>{getOtStatusLabel(row.oldStatus)}</span><b aria-hidden="true">→</b><span>{getOtStatusLabel(row.newStatus)}</span></div><dl><div><dt>Changed fields</dt><dd>{Object.keys(row.changedFields).length ? JSON.stringify(row.changedFields) : "No field payload"}</dd></div><div><dt>Reason / note</dt><dd>{row.note}</dd></div></dl></li>)}</ol>}
    </section>
  );
}

function OtComplianceQueue({ access, refreshKey = 0, onChanged }) {
  const [weekStart, setWeekStart] = useStateApp("");
  const [localRefreshKey, setLocalRefreshKey] = useStateApp(0);
  const [loadState, setLoadState] = useStateApp({ status: "loading", rows: [], peopleById: {}, weeklyTotals: {}, message: "" });
  const [selected, setSelected] = useStateApp(null);
  const [outcome, setOutcome] = useStateApp("");
  const [note, setNote] = useStateApp("");
  const [intent, setIntent] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({ status: "idle", message: "" });
  const reviewSubmissionRef = useRefApp(false);

  useEffectApp(() => {
    let alive = true;
    setLoadState(current => ({ ...current, status: "loading", message: "" }));
    Promise.all([window.loadOtComplianceQueue(weekStart || null), window.loadOtPeopleForEvent()]).then(async ([queue, people]) => {
      const rows = Array.isArray(queue) ? queue : [];
      const weeks = Array.from(new Set(rows.flatMap(row => getOtWeekSegments(row, "actual").map(segment => segment.weekStart)).filter(Boolean))).sort();
      const dashboards = await Promise.all(weeks.map(affectedWeek => window.loadOtManagerDashboard(affectedWeek, null)));
      if (!alive) return;
      const normalized = dashboards.flatMap((dashboard, index) => (Array.isArray(dashboard?.requests) ? dashboard.requests : []).map(row => normalizeOtManagerRow(row, weeks[index])));
      const peopleById = (Array.isArray(people) ? people : []).reduce((lookup, person) => ({ ...lookup, [person.userId]: person }), {});
      const weeklyTotals = getOtManagerTotals(normalized, true);
      setLoadState({ status: "ready", rows, peopleById, weeklyTotals, message: "" });
      setSelected(current => rows.find(row => row.id === current?.id) || null);
    }).catch(error => {
      if (alive) setLoadState(current => ({ ...current, status: "error", message: error.message || "Compliance queue could not be loaded." }));
    });
    return () => { alive = false; };
  }, [weekStart, localRefreshKey, refreshKey]);

  function openReview(request) {
    if (reviewSubmissionRef.current || actionState.status === "submitting") return;
    setSelected(request);
    setOutcome("");
    setNote("");
    setIntent(window.FlowMateOtIntent.complete());
    setActionState({ status: "idle", message: "" });
  }

  function closeReview() {
    if (reviewSubmissionRef.current || actionState.status === "submitting") return;
    setSelected(null);
    setIntent(window.FlowMateOtIntent.complete());
  }

  async function submitReview() {
    if (!selected || reviewSubmissionRef.current || actionState.status === "submitting") return;
    if (!outcome || !note.trim()) {
      setActionState({ status: "error", message: "Outcome and review note are required." });
      return;
    }
    const requestId = selected.id;
    const normalizedNote = note.trim();
    const signature = window.FlowMateOtIntent.signature([requestId, outcome, normalizedNote]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    reviewSubmissionRef.current = true;
    setActionState({ status: "submitting", message: "Saving the compliance outcome and immutable audit entry…" });
    try {
      await window.reviewOtCompliance(requestId, outcome, normalizedNote, currentIntent.key);
      setIntent(window.FlowMateOtIntent.complete());
      setActionState({ status: "success", message: "Compliance review saved. Dashboard, audit, and HR-ready data are refreshing." });
      setLocalRefreshKey(value => value + 1);
      if (onChanged) onChanged();
    } catch (error) {
      setActionState({ status: "error", message: error.message || "Compliance review could not be saved." });
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
    projectedMinutes: loadState.weeklyTotals[`${selectedEmployeeId}:${segment.weekStart}`]?.countedMinutes || 0,
  }));

  return (
    <div className="ot-compliance">
      <section className="ot-toolbar"><label className="field"><span className="field__label">Affected week (optional)</span><input className="input" type="date" value={weekStart} disabled={actionState.status === "submitting"} onChange={event => setWeekStart(event.target.value ? window.FlowMateOtRequestDomain.getWeekStartKey(event.target.value) : "")} /></label><button type="button" className="btn btn--secondary" disabled={actionState.status === "submitting"} onClick={() => setLocalRefreshKey(value => value + 1)}>Refresh compliance</button></section>
      <section className="ot-list" aria-label="Compliance review queue"><div className="ot-section-head"><div><h2>Compliance review</h2><p className="muted">Truthful actual time is read-only. Review records an outcome and note; it never rewrites worked hours.</p></div><span>{loadState.rows.length} case{loadState.rows.length === 1 ? "" : "s"}</span></div>{loadState.status === "loading" && <div className="ot-state" role="status">Loading compliance cases…</div>}{loadState.status === "error" && <OtWarning kind="error" message={loadState.message} />}{loadState.status === "ready" && !loadState.rows.length && <div className="ot-state">No records currently require compliance review.</div>}{loadState.status === "ready" && !!loadState.rows.length && <div className="ot-queue-list">{loadState.rows.map(request => <button key={request.id} type="button" className={`ot-queue-item ${selected?.id === request.id ? "is-selected" : ""}`} disabled={actionState.status === "submitting"} onClick={() => openReview(request)}><span><strong>{request.title}</strong><small>{getOtManagerEmployeeName(request, loadState.peopleById)} · {String(otValue(request, "functionCode", "function_code") || "").toUpperCase()}</small></span><span className="ot-status ot-status--compliance_review_required">Review</span></button>)}</div>}</section>
      {selected && <section className="ot-compliance__review ot-workflow" aria-label="Compliance evidence and decision"><div className="ot-section-head"><div><h2>{selected.title}</h2><p className="muted">Request {selected.id}</p></div><button type="button" className="btn btn--ghost" disabled={actionState.status === "submitting"} onClick={closeReview}>Close</button></div><div className="ot-detail-grid"><div><span>Employee</span><strong>{getOtManagerEmployeeName(selected, loadState.peopleById)}</strong></div><div><span>Plan</span><strong>{formatOtDateTime(plannedStartAt)} → {formatOtDateTime(plannedEndAt)}</strong><small>{formatOtHours(plannedMinutes)}</small></div><div><span>Truthful actual</span><strong>{formatOtDateTime(actualStartAt)} → {formatOtDateTime(actualEndAt)}</strong><small>{formatOtHours(actualMinutes)}</small></div><div><span>Signed variance</span><strong>{window.FlowMateOtRequestDomain.formatSignedHours(actualMinutes - plannedMinutes)}</strong></div><div><span>Employee explanation</span><strong>{actualVarianceReason || "Not provided"}</strong></div><div><span>Manager decision / note</span><strong>{getOtStatusLabel(actualDecision || "pending")} · {actualDecisionNote || "Not provided"}</strong></div></div><section className="ot-compliance__weeks" aria-label="Affected week totals"><h3>Affected week totals</h3>{weeklyTotals.map(row => <article key={row.weekStart}><div><strong>Week of {formatOtDate(row.weekStart)}</strong><small>This occurrence: {formatOtHours(row.occurrenceMinutes)}</small></div><div><strong>Actual {formatOtHours(row.actualMinutes)} / 36h</strong><small>Projected / counted: {formatOtHours(row.projectedMinutes)}</small><OtLimitProgress totalMinutes={row.actualMinutes} /></div></article>)}</section><OtWarning kind="critical" title="Actual hours are immutable" message="Record the compliance outcome against the truthful worked time. Do not ask the employee to reduce actual hours to fit the weekly limit." /><fieldset className="ot-form__fieldset" disabled={actionState.status === "submitting"}><div className="form-grid"><label className="field"><span className="field__label">Outcome *</span><select className="select" value={outcome} onChange={event => setOutcome(event.target.value)} required><option value="">Select outcome</option><option value="approved">Approved</option><option value="cleared">Cleared</option><option value="action_required">Action required</option><option value="rejected">Rejected</option></select></label><label className="field field--full"><span className="field__label">Compliance review note *</span><textarea className="textarea" value={note} onChange={event => setNote(event.target.value)} required placeholder="Record the evidence, decision, and follow-up." /></label></div></fieldset><div className="ot-form__actions"><button type="button" className="btn btn--primary" disabled={!outcome || !note.trim() || actionState.status === "submitting"} onClick={submitReview}>{actionState.status === "submitting" ? "Saving review…" : "Save compliance review"}</button></div>{actionState.message && <OtWarning kind={actionState.status === "error" ? "error" : "info"} message={actionState.message} />}<OtAuditTimeline requestId={selected.id} refreshKey={localRefreshKey + refreshKey} /></section>}
      {selected && <OtActualAmendmentAction key={getOtManagerRequestId(selected)} access={access} request={selected} onChanged={() => { setSelected(null); setLocalRefreshKey(value => value + 1); if (onChanged) onChanged(); }} />}
    </div>
  );
}

function downloadOtHrCsv(csv, batchName) {
  const safeName = String(batchName || "ot-hr-export").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "ot-hr-export";
  const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
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

function OtHrExportPanel({ refreshKey = 0, onChanged }) {
  const [weekStart, setWeekStart] = useStateApp("");
  const [localRefreshKey, setLocalRefreshKey] = useStateApp(0);
  const [loadState, setLoadState] = useStateApp({ status: "loading", rows: [], message: "" });
  const [selectedIds, setSelectedIds] = useStateApp([]);
  const [batchName, setBatchName] = useStateApp("");
  const [reviewing, setReviewing] = useStateApp(false);
  const [confirmed, setConfirmed] = useStateApp(false);
  const [intent, setIntent] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({ status: "idle", message: "" });
  const exportSubmissionRef = useRefApp(false);

  useEffectApp(() => {
    let alive = true;
    setLoadState(current => ({ ...current, status: "loading", message: "" }));
    window.loadOtHrReady(weekStart || null).then(rows => {
      if (!alive) return;
      const readyRows = Array.isArray(rows) ? rows : [];
      const availableIds = new Set(readyRows.map(row => row.id));
      setSelectedIds(current => current.filter(id => availableIds.has(id)));
      setLoadState({ status: "ready", rows: readyRows, message: "" });
    }).catch(error => {
      if (alive) setLoadState({ status: "error", rows: [], message: error.message || "HR-ready OT could not be loaded." });
    });
    return () => { alive = false; };
  }, [weekStart, localRefreshKey, refreshKey]);

  function resetReview() {
    if (exportSubmissionRef.current || actionState.status === "submitting") return;
    setReviewing(false);
    setConfirmed(false);
    setIntent(window.FlowMateOtIntent.complete());
    setActionState({ status: "idle", message: "" });
  }

  function toggleRequest(requestId) {
    if (exportSubmissionRef.current || actionState.status === "submitting") return;
    setSelectedIds(current => current.includes(requestId) ? current.filter(id => id !== requestId) : [...current, requestId]);
    resetReview();
  }

  function changeBatchName(value) {
    if (exportSubmissionRef.current || actionState.status === "submitting") return;
    setBatchName(value);
    resetReview();
  }

  const selectedRows = loadState.rows.filter(row => selectedIds.includes(row.id));
  const selectionSignature = `${batchName.trim()}|${selectedIds.slice().sort().join("|")}`;

  async function exportSelected() {
    if (!confirmed || !batchName.trim() || !selectedRows.length || exportSubmissionRef.current || actionState.status === "submitting") return;
    let currentIntent = window.FlowMateOtHrExport.establish(intent, selectionSignature, () => crypto.randomUUID());
    const intentKey = currentIntent.key;
    const includedIds = selectedRows.map(row => row.id);
    setIntent(currentIntent);
    exportSubmissionRef.current = true;
    setActionState({ status: "submitting", message: currentIntent.downloaded ? "Retrying the idempotent server export mark…" : "Creating the reviewed CSV…" });
    if (window.FlowMateOtHrExport.phase(currentIntent) === "download") {
      const localResult = window.FlowMateOtHrExport.createLocalFile(selectedRows, batchName.trim(), downloadOtHrCsv);
      if (!localResult.ok) {
        setActionState({ status: "error", message: `The local file was not created, and the server was not marked exported. ${localResult.error?.message || "CSV creation or download initiation failed."}` });
        exportSubmissionRef.current = false;
        return;
      }
      currentIntent = window.FlowMateOtHrExport.markDownloaded(currentIntent);
      setIntent(currentIntent);
    }
    try {
      await window.markOtExported(includedIds, batchName.trim(), intentKey);
      setActionState({ status: "success", message: `${includedIds.length} reviewed HR-ready record(s) were downloaded and marked exported.` });
      setSelectedIds([]);
      setBatchName("");
      setReviewing(false);
      setConfirmed(false);
      setIntent(window.FlowMateOtIntent.complete());
      setLocalRefreshKey(value => value + 1);
      if (onChanged) onChanged();
    } catch (error) {
      setActionState({ status: "error", message: `The local CSV exists, but server export status remains unchanged. Retry the server mark with the same selection: ${error.message || "Export mark failed."}` });
    } finally {
      exportSubmissionRef.current = false;
    }
  }

  return (
    <div className="ot-export">
      <section className="ot-toolbar"><label className="field"><span className="field__label">Affected week (optional)</span><input className="input" type="date" value={weekStart} disabled={actionState.status === "submitting"} onChange={event => { setWeekStart(event.target.value ? window.FlowMateOtRequestDomain.getWeekStartKey(event.target.value) : ""); resetReview(); }} /></label><button type="button" className="btn btn--secondary" disabled={actionState.status === "submitting"} onClick={() => setLocalRefreshKey(value => value + 1)}>Refresh HR-ready</button></section>
      <section className="ot-list"><div className="ot-section-head"><div><h2>HR-ready export</h2><p className="muted">Select reviewed records explicitly. This export contains approved time facts only—no payroll calculation or rates.</p></div><span>{loadState.rows.length} ready</span></div>{loadState.status === "loading" && <div className="ot-state" role="status">Loading HR-ready records…</div>}{loadState.status === "error" && <OtWarning kind="error" message={loadState.message} />}{loadState.status === "ready" && !loadState.rows.length && <div className="ot-state">No records are currently HR-ready.</div>}{loadState.status === "ready" && !!loadState.rows.length && <div className="ot-table-wrap"><table className="tbl ot-table ot-export__table"><thead><tr><th scope="col">Select</th><th>Employee</th><th>Function</th><th>Assignment</th><th>Work date</th><th>Actual</th><th>Compliance</th></tr></thead><tbody>{loadState.rows.map(row => <tr key={row.id}><td><input type="checkbox" aria-label={`Select ${row.title}`} checked={selectedIds.includes(row.id)} disabled={actionState.status === "submitting"} onChange={() => toggleRequest(row.id)} /></td><td>{otValue(row, "employeeEmail", "employee_email")}</td><td>{String(otValue(row, "functionCode", "function_code") || "").toUpperCase()}</td><td><strong>{row.title}</strong><small>{row.id}</small></td><td>{formatOtDate(getOtBangkokParts(otValue(row, "actualStartAt", "actual_start_at")).date)}</td><td>{formatOtHours(otValue(row, "actualMinutes", "actual_minutes"))}</td><td>{getOtStatusLabel(otValue(row, "complianceOutcome", "compliance_outcome") || "not_required")}</td></tr>)}</tbody></table></div>}</section>
      <section className="ot-workflow" aria-label="HR export review"><div className="form-grid"><label className="field field--full"><span className="field__label">Export batch name *</span><input className="input" value={batchName} disabled={actionState.status === "submitting"} onChange={event => changeBatchName(event.target.value)} placeholder="Example: 2026-08 week 32 reviewed OT" /></label></div><p className="muted">{selectedIds.length} HR-ready record{selectedIds.length === 1 ? "" : "s"} selected.</p>{!reviewing ? <div className="ot-form__actions"><button type="button" className="btn btn--primary" disabled={!batchName.trim() || !selectedRows.length || actionState.status === "submitting"} onClick={() => setReviewing(true)}>Review export selection</button></div> : <section className="ot-export__review"><h3>Confirm reviewed selection</h3><ul>{selectedRows.map(row => <li key={row.id}>{otValue(row, "employeeEmail", "employee_email")} · {row.title} · {formatOtHours(otValue(row, "actualMinutes", "actual_minutes"))}</li>)}</ul><label className="ot-consent"><input type="checkbox" checked={confirmed} disabled={actionState.status === "submitting"} onChange={event => setConfirmed(event.target.checked)} /><span>I reviewed the exact records and understand they become immutable after the server marks this idempotent batch exported.</span></label><div className="ot-form__actions"><button type="button" className="btn btn--secondary" disabled={actionState.status === "submitting"} onClick={() => { setReviewing(false); setConfirmed(false); }}>Back</button><button type="button" className="btn btn--primary" disabled={!confirmed || actionState.status === "submitting"} onClick={exportSelected}>{intent?.downloaded ? "Retry server export mark" : "Download CSV and mark exported"}</button></div></section>}{actionState.message && <OtWarning kind={actionState.status === "error" ? "error" : "info"} message={actionState.message} />}</section>
    </div>
  );
}

function OtAccessAdminPanel({ access }) {
  const [refreshKey, setRefreshKey] = useStateApp(0);
  const [directoryState, setDirectoryState] = useStateApp({ status: "loading", people: [], activeApproverIds: new Set(), message: "" });
  const [reason, setReason] = useStateApp("");
  const [intent, setIntent] = useStateApp(null);
  const [deactivationPlan, setDeactivationPlan] = useStateApp(null);
  const [actionState, setActionState] = useStateApp({ status: "idle", message: "" });
  const accessSubmissionRef = useRefApp(false);

  async function loadOtAccessDirectory() {
    const [people, approvers] = await Promise.all([window.loadOtPeopleForEvent(), window.loadOtEligibleApprovers()]);
    const displayByEmail = new Map(OT_APPROVER_DISPLAY_DIRECTORY.map(entry => [entry.email, entry]));
    const displayPeople = (Array.isArray(people) ? people : []).flatMap(person => {
      const displayEntry = displayByEmail.get(String(person.email || "").trim().toLowerCase());
      return displayEntry ? [{ ...person, displayLabel: displayEntry.label }] : [];
    });
    return {
      status: "ready",
      people: displayPeople,
      activeApproverIds: new Set((Array.isArray(approvers) ? approvers : []).map(person => person.userId)),
      message: "",
    };
  }

  useEffectApp(() => {
    if (!access.isOwner) return undefined;
    let alive = true;
    setDirectoryState(current => ({ ...current, status: "loading", message: "" }));
    loadOtAccessDirectory().then(nextDirectory => {
      if (alive) setDirectoryState(nextDirectory);
    }).catch(error => {
      if (alive) setDirectoryState({ status: "error", people: [], activeApproverIds: new Set(), message: error.message || "OT access directory could not be loaded." });
    });
    return () => { alive = false; };
  }, [access.isOwner, refreshKey]);

  function beginApproverDeactivation(person) {
    if (accessSubmissionRef.current || actionState.status === "submitting") return;
    setDeactivationPlan({ sourceUserId: person.userId, destinationUserId: "", ready: false, movedCount: null });
    setActionState({ status: "idle", message: "" });
    setIntent(window.FlowMateOtIntent.complete());
  }

  async function reassignPendingApproverWork() {
    if (accessSubmissionRef.current || actionState.status === "submitting") return;
    if (!reason.trim()) {
      setActionState({ status: "error", message: "A written reason is required before pending work can be reassigned." });
      return;
    }
    if (!deactivationPlan?.sourceUserId || !deactivationPlan.destinationUserId) {
      setActionState({ status: "error", message: "Choose an active reassignment destination before continuing." });
      return;
    }
    const normalizedReason = reason.trim();
    const signature = window.FlowMateOtIntent.signature([
      deactivationPlan.sourceUserId,
      deactivationPlan.destinationUserId,
      "reassign_pending_approver",
      normalizedReason,
    ]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    accessSubmissionRef.current = true;
    setActionState({ status: "submitting", message: "Atomically reassigning pending OT work…" });
    try {
      const result = await window.reassignPendingOtApprover(
        deactivationPlan.sourceUserId,
        deactivationPlan.destinationUserId,
        normalizedReason,
        currentIntent.key,
      );
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
        movedCount: Number(result?.movedCount ?? result?.moved_count ?? 0),
      }));
      setActionState({
        status: "success",
        message: "The server reassignment is atomic. The approver remains active because the reassignment and deactivation browser calls are not atomic together. Review the refreshed list, then run the separate deactivation call.",
      });
    } catch (error) {
      setActionState({ status: "error", message: error.message || "Pending OT work could not be reassigned." });
    } finally {
      accessSubmissionRef.current = false;
    }
  }

  async function deactivateApprover(person) {
    if (accessSubmissionRef.current || actionState.status === "submitting") return;
    if (!deactivationPlan?.ready || deactivationPlan.sourceUserId !== person.userId) return;
    if (!reason.trim()) {
      setActionState({ status: "error", message: "A written reason is required for approver deactivation." });
      return;
    }
    const normalizedReason = reason.trim();
    const signature = window.FlowMateOtIntent.signature([person.userId, "set_approver:false", normalizedReason]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    accessSubmissionRef.current = true;
    setActionState({ status: "submitting", message: "Running the separate audited deactivation call…" });
    try {
      await window.setOtApprover(person.userId, false, normalizedReason, currentIntent.key);
      const refreshedDirectory = await loadOtAccessDirectory();
      setDirectoryState(refreshedDirectory);
      setIntent(window.FlowMateOtIntent.complete());
      setDeactivationPlan(null);
      setReason("");
      setActionState({ status: "success", message: "Approver deactivated after the refreshed pending-work check." });
    } catch (error) {
      setActionState({ status: "error", message: error.message || "Approver deactivation could not be completed. New pending work may require another reassignment." });
    } finally {
      accessSubmissionRef.current = false;
    }
  }

  async function enableApprover(person) {
    if (accessSubmissionRef.current || actionState.status === "submitting") return;
    if (!reason.trim()) {
      setActionState({ status: "error", message: "A written reason is required for every approver change." });
      return;
    }
    const normalizedReason = reason.trim();
    const signature = window.FlowMateOtIntent.signature([person.userId, "set_approver:true", normalizedReason]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    accessSubmissionRef.current = true;
    setActionState({ status: "submitting", message: "Saving the audited approver activation…" });
    try {
      await window.setOtApprover(person.userId, true, normalizedReason, currentIntent.key);
      setIntent(window.FlowMateOtIntent.complete());
      setActionState({ status: "success", message: "Approver access activated and audited." });
      setReason("");
      setRefreshKey(value => value + 1);
    } catch (error) {
      setActionState({ status: "error", message: error.message || "Approver access could not be activated." });
    } finally {
      accessSubmissionRef.current = false;
    }
  }

  async function applyHrRole(person, active) {
    if (accessSubmissionRef.current || actionState.status === "submitting") return;
    if (!reason.trim()) {
      setActionState({ status: "error", message: "A written reason is required for every HR/Admin role change." });
      return;
    }
    const normalizedReason = reason.trim();
    const signature = window.FlowMateOtIntent.signature([person.userId, `set_system_role:hr_admin:${active}`, normalizedReason]);
    const currentIntent = window.FlowMateOtIntent.establish(intent, signature, () => crypto.randomUUID());
    setIntent(currentIntent);
    accessSubmissionRef.current = true;
    setActionState({ status: "submitting", message: "Saving the audited OT role change…" });
    try {
      await window.setOtSystemRole(person.userId, "hr_admin", active, normalizedReason, currentIntent.key);
      setIntent(window.FlowMateOtIntent.complete());
      setActionState({ status: "success", message: "HR/Admin role instruction saved and audited. Refresh access context for the affected user." });
      setReason("");
    } catch (error) {
      setActionState({ status: "error", message: error.message || "OT role could not be changed." });
    } finally {
      accessSubmissionRef.current = false;
    }
  }

  if (!access.isOwner) return null;
  const deactivationPerson = directoryState.people.find(person => person.userId === deactivationPlan?.sourceUserId) || null;
  const destinationPeople = directoryState.people.filter(person => (
    person.userId !== deactivationPlan?.sourceUserId
    && directoryState.activeApproverIds.has(person.userId)
  ));
  return (
    <section className="ot-access ot-list" aria-label="OT access administration">
      <div className="ot-section-head"><div><h2>OT access administration</h2><p className="muted">This display-only MVP directory labels candidate identities; the server validates every access change and remains the authorization authority.</p></div><span>Owner only</span></div>
      <article className="ot-access__owner"><div><strong>Sole OT Owner</strong><small>Identity resolved by the server access context · User {access.userId}</small></div><span className="ot-status">Protected active</span></article>
      <fieldset className="ot-form__fieldset" disabled={actionState.status === "submitting"}>
        <label className="field"><span className="field__label">Required reason for the next change *</span><textarea className="textarea" value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain the operational or compliance reason." /></label>
        {deactivationPerson && <section className="ot-workflow" aria-label="Approver reassignment before deactivation">
          <div className="ot-section-head"><div><h3>Prepare deactivation</h3><p className="muted">Reassign all non-final requested and Actual workflow records from {deactivationPerson.displayName || deactivationPerson.email} before disabling access.</p></div><button type="button" className="btn btn--ghost" disabled={actionState.status === "submitting"} onClick={() => { setDeactivationPlan(null); setIntent(window.FlowMateOtIntent.complete()); setActionState({ status: "idle", message: "" }); }}>Cancel</button></div>
          <label className="field"><span className="field__label">Reassignment destination *</span><select className="select" value={deactivationPlan.destinationUserId} disabled={actionState.status === "submitting"} onChange={event => setDeactivationPlan(current => ({ ...current, destinationUserId: event.target.value, ready: false, movedCount: null }))}><option value="">Select an active approver</option>{destinationPeople.map(person => <option key={person.userId} value={person.userId}>{person.displayName || person.email}</option>)}</select></label>
          <p className="muted">The server reassignment is atomic. However, the reassignment and deactivation browser calls are not atomic together, so the server rechecks pending work during the separate deactivation call.</p>
          <div className="ot-form__actions"><button type="button" className="btn btn--secondary" disabled={!reason.trim() || !deactivationPlan.destinationUserId || actionState.status === "submitting"} onClick={reassignPendingApproverWork}>Reassign pending work</button>{deactivationPlan.ready && <button type="button" className="btn btn--primary" disabled={!reason.trim() || actionState.status === "submitting"} onClick={() => deactivateApprover(deactivationPerson)}>Deactivate approver</button>}</div>
          {deactivationPlan.ready && <p className="muted">Refreshed after moving {deactivationPlan.movedCount} non-final request{deactivationPlan.movedCount === 1 ? "" : "s"}. Deactivation remains a separate server call.</p>}
        </section>}
      </fieldset>
      {directoryState.status === "loading" && <div className="ot-state" role="status">Loading the fixed OT access list…</div>}
      {directoryState.status === "error" && <OtWarning kind="error" message={directoryState.message} />}
      {directoryState.status === "ready" && <div className="ot-access__list">{directoryState.people.map(person => { const isApprover = directoryState.activeApproverIds.has(person.userId); return <article key={person.userId} className="ot-access__row"><div><strong>{person.displayLabel || person.displayName || person.email}</strong><small>{person.email} · Display candidate; server-authorized state: {isApprover ? "active" : "inactive"}</small></div><div className="ot-access__actions"><button type="button" className="btn btn--sm btn--secondary" disabled={actionState.status === "submitting"} onClick={() => isApprover ? beginApproverDeactivation(person) : enableApprover(person)}>{isApprover ? "Prepare deactivation" : "Enable approver"}</button><button type="button" className="btn btn--sm btn--secondary" disabled={actionState.status === "submitting"} onClick={() => applyHrRole(person, true)}>Grant HR/Admin</button><button type="button" className="btn btn--sm btn--ghost" disabled={actionState.status === "submitting"} onClick={() => applyHrRole(person, false)}>Remove HR/Admin</button></div></article>; })}</div>}
      {actionState.message && <OtWarning kind={actionState.status === "error" ? "error" : "info"} message={actionState.message} />}
      <p className="muted">Normal plan and actual decisions remain assigned-approver only. This panel never impersonates an assigned approver.</p>
    </section>
  );
}

function OtOwnerDashboard({ access, onOpenView, refreshKey = 0 }) {
  if (!access.isOwner) return null;
  const destinations = [
    { view: "compliance", label: "Compliance review", detail: "Review truthful over-limit actuals with an outcome and note." },
    { view: "audit", label: "Audit search", detail: "Inspect immutable actor, change, reason, and status history." },
    { view: "export", label: "HR-ready export", detail: "Review and export eligible non-payroll records." },
    { view: "access", label: "Access administration", detail: "Manage only fixed OT identities with an audited reason." },
  ];
  return <div className="ot-owner"><section className="ot-manager-scope" aria-label="OT Owner data scope"><strong>OT Owner · All Functions and named OT records</strong><span>This full visibility comes from the server OT access context and does not widen any other Workgrid module.</span></section><section className="ot-owner__destinations" aria-label="OT Owner operations">{destinations.map(item => <button type="button" className="ot-action-card" key={item.view} onClick={() => onOpenView(item.view)}><strong>{item.label}</strong><small>{item.detail}</small></button>)}</section><OtManagerDashboard access={access} refreshToken={refreshKey} /></div>;
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
  const [operationsRefreshKey, setOperationsRefreshKey] = useStateApp(0);

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
    owner: {
      eyebrow: "OT Owner",
      title: "Owner operations",
      detail: "Full named OT visibility across every Function, resolved and enforced by the OT server scope.",
    },
    compliance: {
      eyebrow: "Compliance",
      title: "Actual-hours compliance review",
      detail: "Review truthful actual time and affected weekly totals without changing worked hours.",
    },
    audit: {
      eyebrow: "Governance",
      title: "OT request audit",
      detail: "Filter immutable request history by actor, action, status, changed field, reason, and time.",
    },
    access: {
      eyebrow: "Administration",
      title: "OT access controls",
      detail: "Manage the fixed OT access list through audited server actions.",
    },
    export: {
      eyebrow: "HR operations",
      title: "HR-ready OT export",
      detail: "Review eligible records, download the exact CSV, and mark one idempotent batch exported.",
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
        {access.status === "ready" && (access.isOwner || access.isHrAdmin) && (
          <>
            <div className="nav-section">Compliance & HR</div>
            <button type="button" className={`nav-item ${visibleView === "compliance" ? "is-active" : ""}`} aria-current={visibleView === "compliance" ? "page" : undefined} onClick={() => openView("compliance")}>
              <Icon name="shield" size={16} /> Compliance
            </button>
            <button type="button" className={`nav-item ${visibleView === "audit" ? "is-active" : ""}`} aria-current={visibleView === "audit" ? "page" : undefined} onClick={() => openView("audit")}>
              <Icon name="list" size={16} /> Audit
            </button>
            <button type="button" className={`nav-item ${visibleView === "export" ? "is-active" : ""}`} aria-current={visibleView === "export" ? "page" : undefined} onClick={() => openView("export")}>
              <Icon name="download" size={16} /> HR export
            </button>
          </>
        )}
        {access.status === "ready" && access.isOwner && (
          <>
            <div className="nav-section">Owner</div>
            <button type="button" className={`nav-item ${visibleView === "owner" ? "is-active" : ""}`} aria-current={visibleView === "owner" ? "page" : undefined} onClick={() => openView("owner")}>
              <Icon name="grid" size={16} /> Owner overview
            </button>
            <button type="button" className={`nav-item ${visibleView === "access" ? "is-active" : ""}`} aria-current={visibleView === "access" ? "page" : undefined} onClick={() => openView("access")}>
              <Icon name="users" size={16} /> Access
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
            {access.status === "ready" && (visibleView === "overview" || visibleView === "my-requests") && <OtEmployeeDashboard access={access} listOnly={visibleView === "my-requests"} />}
            {access.status === "ready" && visibleView === "manager" && <OtManagerDashboard access={access} refreshToken={operationsRefreshKey} />}
            {access.status === "ready" && visibleView === "root-causes" && <OtManagerDashboard access={access} rootCauseOnly refreshToken={operationsRefreshKey} />}
            {access.status === "ready" && access.isOwner && visibleView === "owner" && <OtOwnerDashboard access={access} onOpenView={openView} refreshKey={operationsRefreshKey} />}
            {access.status === "ready" && (access.isOwner || access.isHrAdmin) && visibleView === "compliance" && <OtComplianceQueue access={access} refreshKey={operationsRefreshKey} onChanged={() => setOperationsRefreshKey(value => value + 1)} />}
            {access.status === "ready" && (access.isOwner || access.isHrAdmin) && visibleView === "audit" && <OtAuditTimeline refreshKey={operationsRefreshKey} />}
            {access.status === "ready" && (access.isOwner || access.isHrAdmin) && visibleView === "export" && <OtHrExportPanel refreshKey={operationsRefreshKey} onChanged={() => setOperationsRefreshKey(value => value + 1)} />}
            {access.status === "ready" && access.isOwner && visibleView === "access" && <OtAccessAdminPanel access={access} />}
          </div>
        )}
      </main>
    </div>
  );
}

window.OtRequestShell = OtRequestShell;
