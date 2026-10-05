/* AUTO-GENERATED from screens-kpi.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
function FlowMateKpiWorkspaceScreen({
  view,
  onOpen,
  onNav
}) {
  const api = window.FlowMateKpi;
  const [month, setMonth] = React.useState(() => {
    try {
      return api.readMonthPreference(window.sessionStorage, window.FLOWMATE_CURRENT_USER || undefined);
    } catch {
      return api.dateKey(new Date().toISOString()).slice(0, 7);
    }
  });
  const [refresh, setRefresh] = React.useState(0);
  const [scope, setScope] = React.useState(api.scopeKey(window.FLOWMATE_CURRENT_USER || undefined));
  React.useEffect(() => {
    const changed = () => {
      setScope(api.scopeKey(window.FLOWMATE_CURRENT_USER || undefined));
      setRefresh(n => n + 1);
    };
    window.addEventListener('flowmate:auth-changed', changed);
    window.addEventListener('flowmate:team-workspace-changed', changed);
    return () => {
      window.removeEventListener('flowmate:auth-changed', changed);
      window.removeEventListener('flowmate:team-workspace-changed', changed);
    };
  }, [api]);
  const currentScope = api.scopeKey(window.FLOWMATE_CURRENT_USER || undefined);
  const domains = view === 'overview' ? (['creative', 'requester', 'task']) : [view];
  return React.createElement("div", {
    className: "page kpi-workspace",
    "data-testid": "kpi-workspace"
  }, React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, api.labels[view]), React.createElement("p", {
    className: "page__sub"
  }, "Track performance and review evidence")), React.createElement("div", {
    className: "page__actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setRefresh(n => n + 1)
  }, "Refresh"), React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => onNav('kpi-legacy')
  }, "Legacy Report"))), React.createElement("div", {
    className: "kpi-workspace__toolbar"
  }, React.createElement("label", null, "Report Month", React.createElement("input", {
    className: "input",
    type: "month",
    min: "2026-01",
    max: api.dateKey(new Date().toISOString()).slice(0, 7),
    value: month,
    onChange: e => {
      setMonth(e.target.value);
      try {
        api.writeMonthPreference(window.sessionStorage, window.FLOWMATE_CURRENT_USER || undefined, e.target.value);
      } catch {}
    }
  }))), React.createElement("nav", {
    className: "kpi-workspace__views",
    "aria-label": "KPI Views"
  }, (['overview', 'creative', 'requester', 'task']).map(id => React.createElement("button", {
    className: "kpi-workspace__view",
    "aria-current": view === id ? 'page' : undefined,
    key: id,
    onClick: () => onNav(api.routes[id])
  }, api.labels[id]))), domains.map(domain => React.createElement(FlowMateKpiDomainPanel, {
    key: `${domain}:${month}:${scope}:${currentScope}:${refresh}`,
    domain: domain,
    month: month,
    scope: currentScope,
    overview: view === 'overview',
    onOpen: onOpen,
    onNav: onNav
  })));
}
function FlowMateKpiDomainPanel({
  domain,
  month,
  scope,
  overview,
  onOpen,
  onNav
}) {
  const api = window.FlowMateKpi;
  const [snapshot, setSnapshot] = React.useState(null);
  const [state, setState] = React.useState({
    status: 'loading',
    message: ''
  });
  const [reload, setReload] = React.useState(0);
  const [person, setPerson] = React.useState('');
  const [team, setTeam] = React.useState('');
  const [selected, setSelected] = React.useState(domain === 'creative' ? 'C04' : domain === 'requester' ? 'R03' : 'T03');
  const [page, setPage] = React.useState(0);
  const [attention, setAttention] = React.useState(false);
  const [openDetail, setOpenDetail] = React.useState('');
  const [exportFile, setExportFile] = React.useState(null);
  const region = React.useRef(null);
  const savedNotice = React.useRef('');
  const evidenceHead = React.useRef(null);
  React.useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setSnapshot(null);
    setState({
      status: 'loading',
      message: ''
    });
    const user = window.FLOWMATE_CURRENT_USER;
    if (!user || api.scopeKey(user) !== scope) {
      setState({
        status: 'denied',
        message: 'Sign in with KPI access'
      });
      return () => controller.abort();
    }
    api.load(window.flowmateSupabase, user, domain, month, controller.signal).then(data => {
      if (active && api.scopeKey(window.FLOWMATE_CURRENT_USER || undefined) === scope) {
        setSnapshot(data);
        setState({
          status: 'ready',
          message: ''
        });
      }
    }).catch(error => {
      if (active) setState({
        status: error.kind === 'denied' ? 'denied' : 'error',
        message: error.message || 'Unable to load report. Please retry',
        errorCode: typeof error.code === 'string' ? error.code : undefined
      });
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [api, domain, month, scope, reload]);
  const valid = snapshot?.month === month && snapshot.scope === scope && scope === api.scopeKey(window.FLOWMATE_CURRENT_USER || undefined);
  const report = valid && snapshot ? api.metrics(snapshot, {
    person,
    team
  }) : [];
  const metric = report.find(m => m.id === selected) || report[0];
  const allFacts = valid && snapshot ? api.facts(snapshot) : [];
  const people = [...new Map(allFacts.filter(f => f.ownerId).map(f => [f.ownerId, {
    id: f.ownerId,
    name: f.ownerName
  }])).values()];
  const teams = [...new Set(allFacts.map(f => f.team).filter(Boolean))].sort();
  const evidence = metric ? api.metricRows(metric).filter(row => !attention || metric.id !== 'R03' || !row.fact.briefLink) : [];
  const pageRows = evidence.slice(page * 12, (page + 1) * 12);
  const exportContext = JSON.stringify([scope, month, snapshot?.asOf, metric?.id, person, team, attention]);
  React.useEffect(() => {
    setExportFile(null);
  }, [exportContext]);
  React.useEffect(() => () => {
    if (exportFile) URL.revokeObjectURL(exportFile.url);
  }, [exportFile]);
  function selectMetric(target, moveFocus = false) {
    setSelected(target.id);
    setPage(0);
    setAttention(false);
    setOpenDetail('');
    if (moveFocus) requestAnimationFrame(() => evidenceHead.current?.focus());
  }
  function exportEvidence() {
    if (!snapshot || !metric || snapshot.partial || !metric.available) return;
    try {
      const data = api.csv(snapshot, attention ? {
        ...metric,
        cohort: evidence.map(r => r.fact)
      } : metric);
      const url = URL.createObjectURL(new Blob(['\ufeff' + data], {
        type: 'text/csv;charset=utf-8'
      }));
      const name = `flowmate-${metric.id}-${month}${attention ? '-missing-brief-link' : ''}.csv`;
      setExportFile({
        url,
        name,
        rows: evidence.length,
        context: exportContext
      });
      const link = document.createElement('a');
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      setState({
        status: 'error',
        message: 'Unable to prepare CSV. Please retry'
      });
    }
  }
  if (state.status === 'loading') return React.createElement("section", {
    className: "kpi-workspace__state",
    role: "status"
  }, React.createElement("h2", null, api.labels[domain]), React.createElement("p", null, "Loading report…"), React.createElement("div", {
    className: "kpi-workspace__skeleton"
  }));
  if (state.status === 'error' || state.status === 'denied') return React.createElement("section", {
    className: "kpi-workspace__state",
    role: "alert",
    "data-kpi-error-code": state.errorCode
  }, React.createElement("h2", null, api.labels[domain], " · ", state.status === 'denied' ? 'Access denied' : 'Unable to load'), React.createElement("p", null, state.message), React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setReload(n => n + 1)
  }, "Retry"));
  if (!snapshot || !valid || !metric) return React.createElement("section", {
    className: "kpi-workspace__state",
    role: "status"
  }, "Checking access…");
  if (overview) {
    const primary = report.find(m => m.id === (domain === 'creative' ? 'C04' : domain === 'requester' ? 'R03' : 'T07')) || metric;
    return React.createElement("section", {
      className: "kpi-workspace__overview"
    }, React.createElement("div", null, React.createElement("h2", null, api.labels[domain]), React.createElement("p", null, primary.label, " · ", primary.note)), React.createElement("strong", null, api.format(primary.value, primary.unit)), React.createElement("button", {
      className: "btn btn--secondary",
      onClick: () => onNav(api.routes[domain])
    }, "View Details"), React.createElement("p", {
      className: "kpi-workspace__asof"
    }, "Updated ", dateTimeKpi(snapshot.asOf), snapshot.partial ? ' · Some data could not be loaded' : ''));
  }
  const primary = report.filter(m => domain !== 'task' || ['T01', 'T10', 'T02', 'T04'].includes(m.id)).sort((a, b) => Number(b.value !== null) - Number(a.value !== null));
  const weekly = weeklyBinsKpi(snapshot, metric);
  const max = Math.max(1, ...weekly.map(w => w.n));
  return React.createElement("section", {
    className: "kpi-workspace__domain",
    "aria-label": api.labels[domain],
    "data-load-duration-ms": snapshot.loadDurationMs
  }, savedNotice.current && React.createElement("p", {
    role: "status"
  }, savedNotice.current), snapshot.partial && React.createElement("div", {
    className: "kpi-workspace__notice",
    role: "alert"
  }, React.createElement("strong", null, "Some data could not be loaded"), React.createElement("p", null, "Only verified metrics are shown. Export is unavailable until loading completes"), Object.entries(snapshot.resources).filter(([, r]) => r.status === 'error').map(([name, r]) => React.createElement("p", {
    key: name
  }, sourceLabelKpi(name), ": ", r.message)), React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setReload(n => n + 1)
  }, "Retry")), React.createElement("div", {
    className: "kpi-workspace__filters"
  }, domain === 'creative' ? React.createElement("label", null, "Owner at Completion", React.createElement("select", {
    className: "select",
    "aria-label": "Owner at Completion",
    value: person,
    onChange: e => {
      setPerson(e.target.value);
      setPage(0);
      setOpenDetail('');
    }
  }, React.createElement("option", {
    value: ""
  }, "All People"), people.map(p => React.createElement("option", {
    value: p.id,
    key: p.id
  }, p.name)), React.createElement("option", {
    value: "unknown"
  }, "Unknown Owner"))) : React.createElement("label", null, "Requester Team", React.createElement("select", {
    className: "select",
    "aria-label": "Requester Team",
    value: team,
    onChange: e => {
      setTeam(e.target.value);
      setPage(0);
      setOpenDetail('');
    }
  }, React.createElement("option", {
    value: ""
  }, "All Accessible Teams"), teams.map(t => React.createElement("option", {
    key: t
  }, t))))), domain === 'task' && React.createElement("div", {
    className: "kpi-workspace__support"
  }, report.filter(m => ['T03', 'T07', 'T05', 'T06'].includes(m.id)).map(m => React.createElement("button", {
    className: "kpi-workspace__support-row",
    key: m.id,
    onClick: () => selectMetric(m, true),
    "aria-pressed": selected === m.id
  }, React.createElement("span", null, m.id, " · ", m.label, React.createElement("small", null, m.note)), React.createElement("strong", null, api.format(m.value, m.unit))))), React.createElement("dl", {
    className: "kpi-workspace__metrics"
  }, primary.map(m => React.createElement("div", {
    key: m.id,
    "data-available": m.value !== null
  }, React.createElement("dt", null, m.id, " · ", m.label), React.createElement("dd", {
    className: "kpi-workspace__value"
  }, api.format(m.value, m.unit), m.value === null && React.createElement("small", null, "No Data")), React.createElement("dd", {
    className: "kpi-workspace__metric-description"
  }, React.createElement("p", null, m.note), React.createElement("button", {
    className: "kpi-workspace__text-button",
    "aria-label": `View Evidence ${m.id} · ${m.label}`,
    onClick: () => selectMetric(m, true),
    "aria-pressed": selected === m.id
  }, "View Evidence"))))), React.createElement("div", {
    className: "kpi-workspace__evidence-head"
  }, React.createElement("div", null, React.createElement("h2", {
    ref: evidenceHead,
    tabIndex: -1
  }, metric.id, " · ", metric.label), React.createElement("p", null, metric.note)), React.createElement("label", null, "Metric", React.createElement("select", {
    className: "select",
    "aria-label": "Metric",
    value: metric.id,
    onChange: e => {
      const m = report.find(m => m.id === e.target.value);
      if (m) selectMetric(m);
    }
  }, report.map(m => React.createElement("option", {
    value: m.id,
    key: m.id
  }, m.id, " · ", m.label))))), React.createElement("div", {
    className: "kpi-workspace__coverage"
  }, React.createElement("strong", null, metric.available ? `${metric.eligible.length}/${metric.cohort.length} tasks ${metric.id === 'R03' ? 'with a Brief Link' : 'with evidence'}` : 'Insufficient data'), React.createElement("span", null, Object.entries(metric.reasons).filter(([, n]) => n > 0).map(([r, n]) => `${r}: ${n} tasks`).join(' · '))), metric.available && metric.event !== 'snapshot' && metric.event !== 'surveyAt' && metric.id !== 'R03' ? React.createElement(React.Fragment, null, React.createElement("h3", null, "Work by Day of Month ", month), React.createElement("div", {
    className: "kpi-workspace__chart",
    role: "img",
    "aria-label": weekly.map(w => `${w.label} ${w.n} tasks`).join(', ')
  }, weekly.map(w => React.createElement("div", {
    key: w.label
  }, React.createElement("b", null, w.n, " tasks"), React.createElement("span", {
    "aria-hidden": "true",
    style: {
      height: `${w.n / max * 110}px`
    }
  }), React.createElement("small", null, w.label))))) : React.createElement("p", {
    className: "kpi-workspace__notice"
  }, metric.value === null ? metric.cohort.length ? metric.note : 'No measurable work · ' + metric.note : metric.id === 'T12' ? 'Average score for the selected quarter' : metric.id === 'R03' ? 'Requests with a Brief Link' : 'Current open work', " · Missing values are shown as —"), React.createElement("div", {
    className: "kpi-workspace__evidence-actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    disabled: !metric.available || snapshot.partial,
    onClick: exportEvidence
  }, "Export CSV"), metric.id === 'R03' && metric.available && React.createElement("button", {
    className: "btn btn--secondary",
    "aria-pressed": attention,
    onClick: () => {
      setAttention(v => !v);
      setPage(0);
      setOpenDetail('');
      requestAnimationFrame(() => region.current?.focus());
    }
  }, attention ? 'All Requests' : 'Missing Brief Link')), exportFile && exportFile.context === exportContext && React.createElement("div", {
    className: "kpi-workspace__download"
  }, React.createElement("p", {
    role: "status"
  }, "CSV ready · ", exportFile.rows, " filtered rows"), React.createElement("a", {
    href: exportFile.url,
    download: exportFile.name
  }, "Download ", exportFile.name)), React.createElement("section", {
    ref: region,
    tabIndex: -1,
    "aria-label": "KPI Evidence",
    className: "kpi-workspace__evidence"
  }, React.createElement("h3", null, "Evidence ", metric.id, " · ", evidence.length, " tasks"), React.createElement("div", {
    className: "kpi-workspace__table-wrap",
    tabIndex: 0,
    role: "region",
    "aria-label": "Evidence Table"
  }, React.createElement("table", null, React.createElement("caption", null, "Select a Task ID to open its details"), React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    scope: "col"
  }, "Task"), React.createElement("th", {
    scope: "col"
  }, "Team / Owner at Completion"), React.createElement("th", {
    scope: "col"
  }, "Event"), React.createElement("th", {
    scope: "col"
  }, "Evidence"))), React.createElement("tbody", null, pageRows.map(({
    fact: f,
    result
  }) => React.createElement(React.Fragment, {
    key: f.id
  }, React.createElement("tr", null, React.createElement("td", null, React.createElement("button", {
    className: "kpi-workspace__text-button",
    onClick: () => onOpen(f.displayId, domain)
  }, f.displayId), React.createElement("p", null, f.title)), React.createElement("td", null, domain === 'creative' ? f.ownerName : f.team || 'Unknown team'), React.createElement("td", null, api.dateKey(metric.event === 'snapshot' ? snapshot.asOf : f[metric.event]) || '—', React.createElement("small", null, metric.event === 'snapshot' ? f.status : metric.event === 'createdAt' ? 'Request Created' : 'First Event')), React.createElement("td", null, result, React.createElement("br", null), React.createElement("button", {
    className: "kpi-workspace__text-button",
    "aria-expanded": openDetail === f.id,
    onClick: () => setOpenDetail(openDetail === f.id ? '' : f.id)
  }, "Evidence Details"))), openDetail === f.id && React.createElement("tr", null, React.createElement("td", {
    colSpan: 4
  }, React.createElement("dl", {
    className: "kpi-workspace__detail"
  }, domain === 'creative' ? React.createElement(React.Fragment, null, React.createElement("dt", null, "1st Draft Submitted"), React.createElement("dd", null, dateTimeKpi(f.firstDraftAt)), React.createElement("dt", null, "Asset First Draft Due"), React.createElement("dd", null, f.assetFirstDraftDue || '—'), React.createElement("dt", null, "Final Asset Submitted"), React.createElement("dd", null, dateTimeKpi(f.finalAssetAt)), React.createElement("dt", null, "Asset Final/Approved Due"), React.createElement("dd", null, f.assetFinalDue || '—'), React.createElement("dt", null, "Delivered"), React.createElement("dd", null, dateTimeKpi(f.deliveredAt))) : React.createElement(React.Fragment, null, React.createElement("dt", null, "Review Submitted / Accepted"), React.createElement("dd", null, dateTimeKpi(f.submitAt), " / ", dateTimeKpi(f.approveAt)), React.createElement("dt", null, "Brief Link"), React.createElement("dd", null, /^https?:\/\//i.test(f.briefLink) ? React.createElement("a", {
    href: f.briefLink,
    target: "_blank",
    rel: "noopener noreferrer"
  }, f.briefLink) : f.briefLink || '—'), React.createElement("dt", null, "Brief Ready"), React.createElement("dd", null, dateTimeKpi(f.readyAt))), React.createElement("dt", null, "Status"), React.createElement("dd", null, f.status)), domain !== 'creative' && React.createElement(FlowMateKpiEvidenceCapture, {
    fact: f,
    domain: domain,
    onSaved: () => {
      savedNotice.current = "Evidence saved. Report refreshed";
      setReload(n => n + 1);
    }
  })))))))), !evidence.length && React.createElement("p", {
    className: "kpi-workspace__notice"
  }, "No matching work", metric.available ? ' within your access' : ' Evidence unavailable'), React.createElement("div", {
    className: "kpi-workspace__pager"
  }, React.createElement("span", null, evidence.length ? `${page * 12 + 1}–${Math.min((page + 1) * 12, evidence.length)} of ${evidence.length}` : '0 rows'), React.createElement("div", null, React.createElement("button", {
    className: "btn btn--secondary",
    disabled: page === 0,
    onClick: () => {
      setPage(n => n - 1);
      setOpenDetail('');
    }
  }, "Previous"), React.createElement("button", {
    className: "btn btn--secondary",
    disabled: (page + 1) * 12 >= evidence.length,
    onClick: () => {
      setPage(n => n + 1);
      setOpenDetail('');
    }
  }, "Next")))));
}
function dateTimeKpi(value) {
  return value ? new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok'
  }).format(new Date(value)) : 'No evidence';
}
window.FlowMateKpiWorkspaceScreen = FlowMateKpiWorkspaceScreen;
function FlowMateKpiEvidenceCapture({
  fact,
  domain,
  onSaved
}) {
  const api = window.FlowMateKpi;
  const [opened, setOpened] = React.useState(false);
  const [context, setContext] = React.useState(null);
  const [state, setState] = React.useState({
    loading: false,
    saving: false,
    message: '',
    failed: false
  });
  const [kind, setKind] = React.useState('deadline');
  const [endpoint, setEndpoint] = React.useState(domain === 'task' ? 'task_submit' : 'creative_draft');
  const [due, setDue] = React.useState(''),
    [requiredOn, setRequiredOn] = React.useState(''),
    [sla, setSla] = React.useState(''),
    [score, setScore] = React.useState(''),
    [reason, setReason] = React.useState('');
  const request = React.useRef({
    signature: '',
    key: ''
  });
  const possible = context ? ['deadline', 'ready', 'sla', 'csat'].filter(k => context['can_' + k] === true) : [];
  async function open() {
    setOpened(true);
    setState({
      loading: true,
      saving: false,
      message: '',
      failed: false
    });
    try {
      const value = await api.evidenceContext(window.flowmateSupabase, fact.id);
      setContext(value);
      const first = ['deadline', 'ready', 'sla', 'csat'].find(k => value['can_' + k] === true);
      if (first) setKind(first);
      setState({
        loading: false,
        saving: false,
        message: first ? '' : 'No evidence actions available for this account or task',
        failed: false
      });
    } catch (error) {
      setState({
        loading: false,
        saving: false,
        message: error instanceof Error ? error.message : 'Unable to check permissions',
        failed: true
      });
    }
  }
  async function save(event) {
    event.preventDefault();
    if (!context || !possible.includes(kind) || state.saving) return;
    const payload = {
      p_work_item_id: fact.id,
      p_kind: kind,
      p_reason: reason.trim()
    };
    if (kind === 'deadline') {
      payload.p_endpoint = endpoint;
      payload.p_due_date = due;
    }
    if (kind === 'sla') {
      payload.p_required_on = requiredOn;
      payload.p_sla_workdays = Number(sla);
    }
    if (kind === 'ready') payload.p_brief_fingerprint = String(context.fingerprint || '');
    if (kind === 'csat') payload.p_score = Number(score);
    const signature = JSON.stringify(payload);
    if (request.current.signature !== signature) request.current = {
      signature,
      key: crypto.randomUUID()
    };
    setState({
      loading: false,
      saving: true,
      message: 'Saving evidence…',
      failed: false
    });
    try {
      await api.recordEvidence(window.flowmateSupabase, {
        ...payload,
        p_request_key: request.current.key
      });
      setState({
        loading: false,
        saving: false,
        message: 'Evidence saved. Refreshing report',
        failed: false
      });
      onSaved();
    } catch (error) {
      setState({
        loading: false,
        saving: false,
        message: error instanceof Error ? error.message : 'Unable to save',
        failed: true
      });
    }
  }
  const labels = {
    deadline: 'Confirm Deadline',
    ready: 'Confirm Brief Readiness',
    sla: 'Agree Lead Time / SLA',
    csat: 'Internal CSAT'
  };
  return React.createElement("section", {
    className: "kpi-workspace__capture",
    "aria-label": `Record Evidence ${fact.displayId}`
  }, !opened ? React.createElement("button", {
    className: "btn btn--secondary",
    onClick: open
  }, "Add KPI Evidence") : React.createElement(React.Fragment, null, React.createElement("div", null, React.createElement("h4", null, "Record Evidence ", fact.displayId), React.createElement("p", null, "Records the current actor and time")), React.createElement("p", {
    role: state.failed ? 'alert' : 'status'
  }, state.loading ? 'Checking permissions…' : state.message), !state.loading && possible.length > 0 && React.createElement("form", {
    onSubmit: save
  }, React.createElement("label", null, "Evidence Type", React.createElement("select", {
    className: "input",
    value: kind,
    disabled: state.saving,
    onChange: e => setKind(e.target.value)
  }, possible.map(k => React.createElement("option", {
    key: k,
    value: k
  }, labels[k])))), kind === 'deadline' && React.createElement(React.Fragment, null, React.createElement("label", null, "Delivery Stage", React.createElement("select", {
    className: "input",
    value: endpoint,
    disabled: state.saving,
    onChange: e => setEndpoint(e.target.value)
  }, (domain === 'task' ? [['task_submit', 'Review Submission'], ['task_approve', 'Final Acceptance']] : [['creative_draft', 'First Draft'], ['creative_delivery', 'Final Acceptance']]).map(([v, t]) => React.createElement("option", {
    key: v,
    value: v
  }, t)))), React.createElement("label", null, "Agreed Due Date", React.createElement("input", {
    className: "input",
    type: "date",
    required: true,
    value: due,
    disabled: state.saving,
    onChange: e => setDue(e.target.value)
  })), React.createElement("p", null, "The first agreed deadline remains the baseline")), kind === 'sla' && React.createElement(React.Fragment, null, React.createElement("label", null, "Required Date", React.createElement("input", {
    className: "input",
    type: "date",
    required: true,
    min: "2026-01-01",
    max: "2026-12-31",
    value: requiredOn,
    disabled: state.saving,
    onChange: e => setRequiredOn(e.target.value)
  })), React.createElement("label", null, "Required Lead Time (Business Days)", React.createElement("input", {
    className: "input",
    type: "number",
    required: true,
    min: "0",
    max: "365",
    step: "1",
    value: sla,
    disabled: state.saving,
    onChange: e => setSla(e.target.value)
  })), React.createElement("p", null, "Using ", api.organizationCalendar.version, "; Agree before brief readiness is confirmed")), kind === 'ready' && React.createElement("p", null, "Confirm you have reviewed the latest brief and references. Reopen this form if the brief changes"), kind === 'csat' && React.createElement(React.Fragment, null, React.createElement("label", null, "Cross-Team Satisfaction", React.createElement("select", {
    className: "input",
    required: true,
    value: score,
    disabled: state.saving,
    onChange: e => setScore(e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "Select Score (1–5)"), [1, 2, 3, 4, 5].map(n => React.createElement("option", {
    key: n,
    value: n
  }, n, " / 5")))), React.createElement("p", null, "Requester feedback after acceptance")), React.createElement("label", null, kind === 'csat' ? 'Comments (Optional)' : 'Reason or Supporting Evidence', React.createElement("textarea", {
    className: "input",
    required: kind !== 'csat',
    maxLength: 2000,
    value: reason,
    disabled: state.saving,
    onChange: e => setReason(e.target.value)
  })), React.createElement("button", {
    className: "btn btn--primary",
    type: "submit",
    disabled: state.saving
  }, state.saving ? 'Saving…' : 'Save Evidence')), !state.saving && React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setOpened(false)
  }, "Close")));
}
function sourceLabelKpi(key) {
  const labels = {
    work: 'Work Items',
    history: 'Event History',
    brief: 'Brief Evidence',
    briefLinks: 'Brief Link',
    eventCandidates: 'Monthly Events',
    milestoneCandidates: 'Monthly Milestones',
    milestones: 'Milestones',
    requested: 'Monthly Requests',
    open: 'Current Open Work',
    taskCandidates: 'Monthly Task Events',
    evidence: 'KPI Evidence',
    surveys: 'Internal Surveys'
  };
  return labels[key] || 'Data Source';
}
function weeklyBinsKpi(snapshot, metric) {
  const api = window.FlowMateKpi;
  const asOfDate = api.dateKey(snapshot.asOf);
  const monthDays = new Date(Number(snapshot.month.slice(0, 4)), Number(snapshot.month.slice(5)), 0).getDate();
  const observedDays = asOfDate.slice(0, 7) === snapshot.month ? Number(asOfDate.slice(8, 10)) : monthDays;
  return Array.from({
    length: Math.ceil(observedDays / 7)
  }, (_, i) => ({
    label: `${i * 7 + 1}–${Math.min((i + 1) * 7, observedDays)}`,
    n: metric.cohort.filter(f => Math.floor((Number(api.dateKey(metric.event === 'snapshot' ? snapshot.asOf : f[metric.event]).slice(8, 10)) - 1) / 7) === i).length
  }));
}
