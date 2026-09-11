/* Creative year-end evidence report. Requester monthly workflow remains separate. */
function FlowMateCreativeReportScreen({ requesterView: RequesterView }) {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [role, setRole] = React.useState('');
  const [personId, setPersonId] = React.useState('');
  const [workType, setWorkType] = React.useState('');
  const [snapshot, setSnapshot] = React.useState(null);
  const [state, setState] = React.useState({ status: 'loading', message: '' });
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [showRequester, setShowRequester] = React.useState(false);
  const [showTasks, setShowTasks] = React.useState(false);
  const [showAi, setShowAi] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setSnapshot(null);
    setState({ status: 'loading', message: '' });
    Promise.resolve().then(() => window.loadFlowMateCreativeReport({ year, signal: controller.signal })).then(data => {
      if (!alive) return;
      setSnapshot({ ...data, year });
      setState({ status: 'live', message: '' });
    }).catch(error => {
      if (alive) setState({ status: 'error', message: error.message || 'Report could not be loaded.' });
    });
    return () => { alive = false; controller.abort(); };
  }, [year, refreshKey]);
  const model = window.FlowMateCreativeReport;
  const ready = state.status === 'live' && snapshot?.year === year;
  const report = ready ? model.buildReport(snapshot.rows, { year, role, personId, workType, asOf: snapshot.asOf, calendarActiveN: snapshot.calendarActiveN }) : null;
  const fmt = model.formatMetric;
  const s = report?.annual;
  function exportReport() {
    if (!report || !ready) return;
    if (!window.flowmateDownloadWorkbook) {
      setState({ status: 'error', message: 'Workbook download is unavailable. Refresh the application.' });
      return;
    }
    window.flowmateDownloadWorkbook(`flowmate-creative-kpi-${year}-${model.dateKey(report.asOf)}.xlsx`, model.buildWorkbook(report));
  }
  const yearOptions = Array.from({ length: Math.max(1, new Date().getFullYear() - 2026 + 1) }, (_, i) => 2026 + i);
  const personName = report?.availablePeople.find(p => p.id === personId)?.name;
  const cards = s ? [
    { label: 'Delivered tasks', value: fmt(s.deliveredN), note: 'Delivered date in this year; unique tasks.' },
    { label: 'First drafts submitted', value: fmt(s.reviewedN), note: 'First Review date in this year; includes later cancellations.' },
    { label: 'Time to start', value: fmt(s.start.p50, 'days'), note: `P85 ${fmt(s.start.p85, 'days')} · ${s.start.n} eligible / ${s.start.missingN} missing` },
    { label: 'Production time', value: fmt(s.production.p50, 'days'), note: `P85 ${fmt(s.production.p85, 'days')} · ${s.production.n} eligible / ${s.production.missingN} missing`, warning: s.shortProductionN ? `${s.shortProductionN} short status intervals need review` : '' },
    { label: 'First draft on time', value: fmt(s.onTime.pct, 'percent'), note: `${s.onTime.numerator}/${s.onTime.denominator} tasks · current due dates`, warning: s.assignedAfterDueN ? `${s.assignedAfterDueN} tasks received after due date` : '' },
    { label: 'Recorded AI work', value: fmt(s.aiN), note: `${s.aiDeliveredN} delivered in this year · unique activity tasks` },
  ] : [];
  if (showRequester) return <div className="creative-report"><button className="btn btn--secondary" onClick={() => setShowRequester(false)}>Back to GD / VE year-end report</button><RequesterView requesterOnly /></div>;
  return <div className="page creative-report" data-testid="creative-year-end-report">
    <div className="page__header">
      <div><h1 className="page__title">Creative KPI</h1><p className="page__sub">Year-end evidence for GD and VE · delivery, quality and development</p></div>
      <div className="page__actions"><button className="btn btn--secondary" onClick={() => setShowRequester(true)}>Requester view</button><button className="btn btn--secondary" disabled={state.status === 'loading'} onClick={() => setRefreshKey(k => k + 1)}>Refresh</button><button className="btn btn--primary" disabled={!ready || !report?.rows.length} onClick={exportReport} data-testid="creative-report-export">Export Excel</button></div>
    </div>
    <div className="creative-report__filters">
      <label>Year<select className="select" aria-label="Report year" value={year} onChange={e => { setYear(Number(e.target.value)); setPersonId(''); }}>{yearOptions.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
      <label>Role<select className="select" aria-label="Report role" value={role} onChange={e => { setRole(e.target.value); setPersonId(''); }}><option value="">All GD / VE</option><option>GD</option><option>VE</option><option value="Unmapped">Unmapped</option></select></label>
      <label>Person<select className="select" aria-label="Report person" value={personId} onChange={e => setPersonId(e.target.value)}><option value="">All people</option>{(report?.availablePeople || []).map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label>
      <label>Work type<select className="select" aria-label="Report work type" value={workType} onChange={e => setWorkType(e.target.value)}><option value="">All types</option>{(report?.workTypes || []).map(type => <option key={type}>{type}</option>)}</select></label>
    </div>
    {state.status === 'loading' && <div className="creative-report__notice" role="status">Loading complete report history…</div>}
    {state.status === 'error' && <div className="creative-report__notice is-warning" role="alert"><strong>Report unavailable</strong><p>{state.message}</p><button className="btn btn--secondary" onClick={() => setRefreshKey(k => k + 1)}>Retry</button></div>}
    {report && <>
      <div className="creative-report__context"><strong>{personName || role || 'All Creative people'} · {year}</strong><span>{s.periodStatus} · as of {model.dateKey(report.asOf)} · Asia/Bangkok</span></div>
      {!report.rows.length ? <div className="creative-report__notice">No permitted recorded tasks match these filters. No recorded data does not mean no work was done.</div> : <>
        <div className="creative-report__cards">{cards.map(card => <section className="creative-report__card" key={card.label}><h2>{card.label}</h2><div className="creative-report__value">{card.value}</div><p>{card.note}</p>{card.warning && <p className="creative-report__warning">{card.warning}</p>}</section>)}</div>
        <section className="creative-report__notice"><strong>Read with context</strong><p>Time uses 24-hour fractions of eligible working dates, not actual work hours. P50 is the median; P85 shows slower cases. {report.calendarActiveN === 0 ? 'No active holidays are recorded for this year.' : report.calendarActiveN == null ? 'Holiday coverage is not confirmed.' : `${report.calendarActiveN} active holiday records in the calendar.`}</p><p>{s.shortProductionN ? 'Short status intervals require confirmation before judging production speed. ' : ''}{s.periodStatus === 'Year to date' ? 'This year is still in progress; partial months are not compared with full months. ' : ''}Role mapping is confirmed for this report; historical role and due-date snapshots are not yet recorded.</p></section>
        <section className="creative-report__details"><h2>Quality and evaluation context</h2><div className="creative-report__context-grid"><p><strong>First-pass approval</strong><br />{fmt(s.firstPass.pct, 'percent')} · {s.firstPass.numerator}/{s.firstPass.denominator} decided tasks<br />{s.decisionMissingN} pending or unverified decisions</p><p><strong>Rework / final delivery</strong><br />{s.reworkN} tasks returned for changes<br />Final on time: {fmt(s.finalOnTime.pct, 'percent')} · {s.finalOnTime.numerator}/{s.finalOnTime.denominator}</p><p><strong>Contextual first-draft sample</strong><br />{fmt(s.contextOnTime.pct, 'percent')} · {s.contextOnTime.numerator}/{s.contextOnTime.denominator}<br />Received before due, with usable event context. {s.contextOnTime.denominator < 5 ? 'Small sample; no evaluation conclusion.' : 'Review task evidence before drawing conclusions.'}</p></div><p>Use the Excel Lead evaluation sheet for quality, portfolio, collaboration and development evidence. These are human assessments, not automatically generated scores.</p></section>
        <div className="creative-kpi__chart-grid">
          <FlowMateCreativeReportTrendChart rows={report.monthly.map(m => ({ reviewMonth: m.period, n: m.start.n, value: m.start.p50, tail: m.start.p85 }))} primaryField="value" secondaryField="tail" title="Time to start by month" description="Recorded working-date equivalents; check sample and queue context." />
          <FlowMateCreativeReportTrendChart rows={report.monthly.map(m => ({ reviewMonth: m.period, n: m.production.n, value: m.production.p50, tail: m.production.p85 }))} primaryField="value" secondaryField="tail" title="Production time by month" description="Recorded status duration; short intervals require confirmation before evaluation." />
        </div>
      </>}
      <section className="creative-report__details"><h2>Monthly detail</h2><p>Draft timing follows first Review. Delivered work follows delivery date. “—” means no usable sample or no recorded period.</p><div className="creative-report__table-wrap"><table className="tbl"><thead><tr><th>Month</th><th>Coverage</th><th>Delivered</th><th>First drafts</th><th>Start P50 / P85</th><th>Production P50 / P85</th><th>On time</th><th>AI activity / delivered</th></tr></thead><tbody>{report.monthly.map(m => { const unavailable = m.activityN === 0 || ['Future period', 'No recorded data'].includes(m.periodStatus); return <tr key={m.period}><td>{m.period}</td><td>{m.periodStatus}</td><td>{unavailable ? '—' : m.deliveredN}</td><td>{unavailable ? '—' : m.reviewedN}</td><td>{fmt(m.start.p50, 'days')} / {fmt(m.start.p85, 'days')}<small>n={m.start.n}</small></td><td>{fmt(m.production.p50, 'days')} / {fmt(m.production.p85, 'days')}<small>n={m.production.n}{m.shortProductionN ? ` · ${m.shortProductionN} to review` : ''}</small></td><td>{fmt(m.onTime.pct, 'percent')}<small>{m.onTime.numerator}/{m.onTime.denominator}</small></td><td>{unavailable ? '—' : `${m.aiN} / ${m.aiDeliveredN}`}</td></tr>; })}</tbody></table></div></section>
      <div className="creative-report__evidence-actions"><button className="btn btn--secondary" aria-expanded={showTasks} onClick={() => setShowTasks(v => !v)}>{showTasks ? 'Hide' : 'Show'} task evidence ({report.rows.length})</button><button className="btn btn--secondary" aria-expanded={showAi} onClick={() => setShowAi(v => !v)}>{showAi ? 'Hide' : 'Show'} AI tasks ({report.aiTasks.length})</button></div>
      {showTasks && <FlowMateCreativeEvidenceTable rows={report.rows} title="Task evidence" />}
      {showAi && <FlowMateCreativeEvidenceTable rows={report.aiTasks} title="Recorded AI tasks" />}
      <p className="creative-report__footnote">Current recorded data · manual refresh · {report.version}. AI tags reflect recorded usage, not measured benefit. Unknown or historical changes remain visible in the exported evidence.</p>
    </>}
  </div>;
}
function FlowMateCreativeEvidenceTable({ rows, title }) {
  const key = window.FlowMateCreativeReport.dateKey;
  return <section className="creative-report__details"><h2>{title}</h2><div className="creative-report__table-wrap"><table className="tbl"><thead><tr><th>Task ID</th><th>Task name</th><th>Owner / role</th><th>Status</th><th>First Review</th><th>Delivered</th><th>AI tags</th><th>Context flags</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td>{r.displayId}</td><td className="creative-report__task-title">{r.title}</td><td>{r.personName} · {r.role}</td><td>{r.status}</td><td>{key(r.review_submitted_at) || '—'}</td><td>{key(r.delivered_at) || '—'}</td><td>{r.tags.join(', ') || 'No recorded tag'}</td><td>{window.FlowMateCreativeReport.formatFlags(r.flags) || '—'}</td></tr>)}</tbody></table></div></section>;
}
window.FlowMateCreativeReportScreen = FlowMateCreativeReportScreen;


function flowMateCreativeChartValue(value, unit = "") {
  return window.FlowMateCreativeReport.formatMetric(value, unit.trim() === "d" ? "days" : unit === "%" ? "percent" : "");
}
function FlowMateCreativeReportTrendChart({ rows, primaryField, secondaryField, title, description, unit = " d" }) {
  const width = 720;
  const height = 240;
  const left = 46;
  const right = 20;
  const top = 18;
  const bottom = 48;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const values = rows.flatMap(row => [row[primaryField], row[secondaryField]]).filter(value => value != null && !Number.isNaN(Number(value))).map(Number);
  const maxValue = Math.max(1, ...values) * 1.12;
  const point = (row, index, field) => {
    const x = rows.length > 1 ? left + (index / (rows.length - 1)) * plotWidth : left + plotWidth / 2;
    const raw = row[field];
    const y = raw == null ? null : top + plotHeight - (Number(raw) / maxValue) * plotHeight;
    return { x, y, value: raw };
  };
  const pathFor = field => {
    let drawing = false;
    return rows.map((row, index) => {
      const current = point(row, index, field);
      if (current.y == null) {
        drawing = false;
        return "";
      }
      const command = drawing ? "L" : "M";
      drawing = true;
      return `${command}${current.x.toFixed(1)},${current.y.toFixed(1)}`;
    }).join(" ");
  };
  if (!values.length) {
    return (
      <section className="creative-kpi__chart-card">
        <div className="creative-kpi__section-head"><div><h2>{title}</h2><p>{description}</p></div></div>
        <div className="creative-kpi__empty">No eligible monthly data for this metric.</div>
      </section>
    );
  }
  return (
    <section className="creative-kpi__chart-card">
      <div className="creative-kpi__section-head">
        <div><h2>{title}</h2><p>{description}</p></div>
        <div className="creative-kpi__legend" aria-label="Chart legend">
          <span><i className="creative-kpi__legend-line creative-kpi__legend-line--p50"></i>P50 typical</span>
          <span><i className="creative-kpi__legend-line creative-kpi__legend-line--p85"></i>P85 slower cases</span>
        </div>
      </div>
      <div className="creative-kpi__chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title}, monthly P50 and P85 trend`}>
          {[0, 1, 2, 3].map(index => {
            const y = top + (index / 3) * plotHeight;
            const value = maxValue * (1 - index / 3);
            return <g key={index}><line className="creative-kpi__grid-line" x1={left} x2={width - right} y1={y} y2={y} /><text className="creative-kpi__axis-label" x={left - 8} y={y + 4} textAnchor="end">{flowMateCreativeChartValue(value)}</text></g>;
          })}
          <path className="creative-kpi__series creative-kpi__series--p85" d={pathFor(secondaryField)} />
          <path className="creative-kpi__series creative-kpi__series--p50" d={pathFor(primaryField)} />
          {rows.map((row, index) => {
            const p50 = point(row, index, primaryField);
            const p85 = point(row, index, secondaryField);
            return <g key={row.reviewMonth || index}>
              {p85.y != null && <circle className="creative-kpi__point creative-kpi__point--p85" cx={p85.x} cy={p85.y} r="4"><title>{`${flowMateKpiMonthShortC(row.reviewMonth)} P85 ${flowMateCreativeChartValue(p85.value, unit)} · n=${row.n || 0}`}</title></circle>}
              {p50.y != null && <circle className="creative-kpi__point creative-kpi__point--p50" cx={p50.x} cy={p50.y} r="4"><title>{`${flowMateKpiMonthShortC(row.reviewMonth)} P50 ${flowMateCreativeChartValue(p50.value, unit)} · n=${row.n || 0}`}</title></circle>}
              <text className="creative-kpi__month-label" x={p50.x} y={height - 22} textAnchor="middle">{flowMateKpiMonthShortC(row.reviewMonth)}</text>
              <text className="creative-kpi__sample-label" x={p50.x} y={height - 7} textAnchor="middle">n={row.n || 0}</text>
            </g>;
          })}
        </svg>
      </div>
    </section>
  );
}
