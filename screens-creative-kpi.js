/* AUTO-GENERATED from screens-creative-kpi.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
function FlowMateCreativeReportScreen({
  requesterView: RequesterView
}) {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const [role, setRole] = React.useState('');
  const [personId, setPersonId] = React.useState('');
  const [workType, setWorkType] = React.useState('');
  const [snapshot, setSnapshot] = React.useState(null);
  const [state, setState] = React.useState({
    status: 'loading',
    message: ''
  });
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [showRequester, setShowRequester] = React.useState(false);
  const [showTasks, setShowTasks] = React.useState(false);
  const [showAi, setShowAi] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    setSnapshot(null);
    setState({
      status: 'loading',
      message: ''
    });
    Promise.resolve().then(() => window.loadFlowMateCreativeReport({
      year,
      signal: controller.signal
    })).then(data => {
      if (!alive) return;
      setSnapshot({
        ...data,
        year
      });
      setState({
        status: 'live',
        message: ''
      });
    }).catch(error => {
      if (alive) setState({
        status: 'error',
        message: error.message || 'Report could not be loaded.'
      });
    });
    return () => {
      alive = false;
      controller.abort();
    };
  }, [year, refreshKey]);
  const model = window.FlowMateCreativeReport;
  const ready = state.status === 'live' && snapshot?.year === year;
  const report = ready ? model.buildReport(snapshot.rows, {
    year,
    role,
    personId,
    workType,
    asOf: snapshot.asOf,
    calendarActiveN: snapshot.calendarActiveN
  }) : null;
  const fmt = model.formatMetric;
  const s = report?.annual;
  function exportReport() {
    if (!report || !ready) return;
    if (!window.flowmateDownloadWorkbook) {
      setState({
        status: 'error',
        message: 'Workbook download is unavailable. Refresh the application.'
      });
      return;
    }
    window.flowmateDownloadWorkbook(`flowmate-creative-kpi-${year}-${model.dateKey(report.asOf)}.xlsx`, model.buildWorkbook(report));
  }
  const yearOptions = Array.from({
    length: Math.max(1, new Date().getFullYear() - 2026 + 1)
  }, (_, i) => 2026 + i);
  const personName = report?.availablePeople.find(p => p.id === personId)?.name;
  const cards = s ? [{
    label: 'Delivered tasks',
    value: fmt(s.deliveredN),
    note: 'Delivered date in this year; unique tasks.'
  }, {
    label: 'First drafts submitted',
    value: fmt(s.reviewedN),
    note: 'First Review date in this year; includes later cancellations.'
  }, {
    label: 'Time to start',
    value: fmt(s.start.p50, 'days'),
    note: `P85 ${fmt(s.start.p85, 'days')} · ${s.start.n} eligible / ${s.start.missingN} missing`
  }, {
    label: 'Production time',
    value: fmt(s.production.p50, 'days'),
    note: `P85 ${fmt(s.production.p85, 'days')} · ${s.production.n} eligible / ${s.production.missingN} missing`,
    warning: s.shortProductionN ? `${s.shortProductionN} short status intervals need review` : ''
  }, {
    label: 'First draft on time',
    value: fmt(s.onTime.pct, 'percent'),
    note: `${s.onTime.numerator}/${s.onTime.denominator} tasks · current due dates`,
    warning: s.assignedAfterDueN ? `${s.assignedAfterDueN} tasks received after due date` : ''
  }, {
    label: 'Recorded AI work',
    value: fmt(s.aiN),
    note: `${s.aiDeliveredN} delivered in this year · unique activity tasks`
  }] : [];
  if (showRequester) return React.createElement("div", {
    className: "creative-report"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setShowRequester(false)
  }, "Back to GD / VE year-end report"), React.createElement(RequesterView, {
    requesterOnly: true
  }));
  return React.createElement("div", {
    className: "page creative-report",
    "data-testid": "creative-year-end-report"
  }, React.createElement("div", {
    className: "page__header"
  }, React.createElement("div", null, React.createElement("h1", {
    className: "page__title"
  }, "Creative KPI"), React.createElement("p", {
    className: "page__sub"
  }, "Year-end evidence for GD and VE · delivery, quality and development")), React.createElement("div", {
    className: "page__actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setShowRequester(true)
  }, "Requester view"), React.createElement("button", {
    className: "btn btn--secondary",
    disabled: state.status === 'loading',
    onClick: () => setRefreshKey(k => k + 1)
  }, "Refresh"), React.createElement("button", {
    className: "btn btn--primary",
    disabled: !ready || !report?.rows.length,
    onClick: exportReport,
    "data-testid": "creative-report-export"
  }, "Export Excel"))), React.createElement("div", {
    className: "creative-report__filters"
  }, React.createElement("label", null, "Year", React.createElement("select", {
    className: "select",
    "aria-label": "Report year",
    value: year,
    onChange: e => {
      setYear(Number(e.target.value));
      setPersonId('');
    }
  }, yearOptions.map(y => React.createElement("option", {
    key: y,
    value: y
  }, y)))), React.createElement("label", null, "Role", React.createElement("select", {
    className: "select",
    "aria-label": "Report role",
    value: role,
    onChange: e => {
      setRole(e.target.value);
      setPersonId('');
    }
  }, React.createElement("option", {
    value: ""
  }, "All GD / VE"), React.createElement("option", null, "GD"), React.createElement("option", null, "VE"), React.createElement("option", {
    value: "Unmapped"
  }, "Unmapped"))), React.createElement("label", null, "Person", React.createElement("select", {
    className: "select",
    "aria-label": "Report person",
    value: personId,
    onChange: e => setPersonId(e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "All people"), (report?.availablePeople || []).map(p => React.createElement("option", {
    key: p.id,
    value: p.id
  }, p.name, " · ", p.role)))), React.createElement("label", null, "Work type", React.createElement("select", {
    className: "select",
    "aria-label": "Report work type",
    value: workType,
    onChange: e => setWorkType(e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "All types"), (report?.workTypes || []).map(type => React.createElement("option", {
    key: type
  }, type))))), state.status === 'loading' && React.createElement("div", {
    className: "creative-report__notice",
    role: "status"
  }, "Loading complete report history…"), state.status === 'error' && React.createElement("div", {
    className: "creative-report__notice is-warning",
    role: "alert"
  }, React.createElement("strong", null, "Report unavailable"), React.createElement("p", null, state.message), React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setRefreshKey(k => k + 1)
  }, "Retry")), report && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "creative-report__context"
  }, React.createElement("strong", null, personName || role || 'All Creative people', " · ", year), React.createElement("span", null, s.periodStatus, " · as of ", model.dateKey(report.asOf), " · Asia/Bangkok")), !report.rows.length ? React.createElement("div", {
    className: "creative-report__notice"
  }, "No permitted recorded tasks match these filters. No recorded data does not mean no work was done.") : React.createElement(React.Fragment, null, React.createElement("div", {
    className: "creative-report__cards"
  }, cards.map(card => React.createElement("section", {
    className: "creative-report__card",
    key: card.label
  }, React.createElement("h2", null, card.label), React.createElement("div", {
    className: "creative-report__value"
  }, card.value), React.createElement("p", null, card.note), card.warning && React.createElement("p", {
    className: "creative-report__warning"
  }, card.warning)))), React.createElement("section", {
    className: "creative-report__notice"
  }, React.createElement("strong", null, "Read with context"), React.createElement("p", null, "Time uses 24-hour fractions of eligible working dates, not actual work hours. P50 is the median; P85 shows slower cases. ", report.calendarActiveN === 0 ? 'No active holidays are recorded for this year.' : report.calendarActiveN == null ? 'Holiday coverage is not confirmed.' : `${report.calendarActiveN} active holiday records in the calendar.`), React.createElement("p", null, s.shortProductionN ? 'Short status intervals require confirmation before judging production speed. ' : '', s.periodStatus === 'Year to date' ? 'This year is still in progress; partial months are not compared with full months. ' : '', "Role mapping is confirmed for this report; historical role and due-date snapshots are not yet recorded.")), React.createElement("section", {
    className: "creative-report__details"
  }, React.createElement("h2", null, "Quality and evaluation context"), React.createElement("div", {
    className: "creative-report__context-grid"
  }, React.createElement("p", null, React.createElement("strong", null, "First-pass approval"), React.createElement("br", null), fmt(s.firstPass.pct, 'percent'), " · ", s.firstPass.numerator, "/", s.firstPass.denominator, " decided tasks", React.createElement("br", null), s.decisionMissingN, " pending or unverified decisions"), React.createElement("p", null, React.createElement("strong", null, "Rework / final delivery"), React.createElement("br", null), s.reworkN, " tasks returned for changes", React.createElement("br", null), "Final on time: ", fmt(s.finalOnTime.pct, 'percent'), " · ", s.finalOnTime.numerator, "/", s.finalOnTime.denominator), React.createElement("p", null, React.createElement("strong", null, "Contextual first-draft sample"), React.createElement("br", null), fmt(s.contextOnTime.pct, 'percent'), " · ", s.contextOnTime.numerator, "/", s.contextOnTime.denominator, React.createElement("br", null), "Received before due, with usable event context. ", s.contextOnTime.denominator < 5 ? 'Small sample; no evaluation conclusion.' : 'Review task evidence before drawing conclusions.')), React.createElement("p", null, "Use the Excel Lead evaluation sheet for quality, portfolio, collaboration and development evidence. These are human assessments, not automatically generated scores.")), React.createElement("div", {
    className: "creative-kpi__chart-grid"
  }, React.createElement(FlowMateCreativeReportTrendChart, {
    rows: report.monthly.map(m => ({
      reviewMonth: m.period,
      n: m.start.n,
      value: m.start.p50,
      tail: m.start.p85
    })),
    primaryField: "value",
    secondaryField: "tail",
    title: "Time to start by month",
    description: "Recorded working-date equivalents; check sample and queue context."
  }), React.createElement(FlowMateCreativeReportTrendChart, {
    rows: report.monthly.map(m => ({
      reviewMonth: m.period,
      n: m.production.n,
      value: m.production.p50,
      tail: m.production.p85
    })),
    primaryField: "value",
    secondaryField: "tail",
    title: "Production time by month",
    description: "Recorded status duration; short intervals require confirmation before evaluation."
  }))), React.createElement("section", {
    className: "creative-report__details"
  }, React.createElement("h2", null, "Monthly detail"), React.createElement("p", null, "Draft timing follows first Review. Delivered work follows delivery date. “—” means no usable sample or no recorded period."), React.createElement("div", {
    className: "creative-report__table-wrap"
  }, React.createElement("table", {
    className: "tbl"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Month"), React.createElement("th", null, "Coverage"), React.createElement("th", null, "Delivered"), React.createElement("th", null, "First drafts"), React.createElement("th", null, "Start P50 / P85"), React.createElement("th", null, "Production P50 / P85"), React.createElement("th", null, "On time"), React.createElement("th", null, "AI activity / delivered"))), React.createElement("tbody", null, report.monthly.map(m => {
    const unavailable = m.activityN === 0 || ['Future period', 'No recorded data'].includes(m.periodStatus);
    return React.createElement("tr", {
      key: m.period
    }, React.createElement("td", null, m.period), React.createElement("td", null, m.periodStatus), React.createElement("td", null, unavailable ? '—' : m.deliveredN), React.createElement("td", null, unavailable ? '—' : m.reviewedN), React.createElement("td", null, fmt(m.start.p50, 'days'), " / ", fmt(m.start.p85, 'days'), React.createElement("small", null, "n=", m.start.n)), React.createElement("td", null, fmt(m.production.p50, 'days'), " / ", fmt(m.production.p85, 'days'), React.createElement("small", null, "n=", m.production.n, m.shortProductionN ? ` · ${m.shortProductionN} to review` : '')), React.createElement("td", null, fmt(m.onTime.pct, 'percent'), React.createElement("small", null, m.onTime.numerator, "/", m.onTime.denominator)), React.createElement("td", null, unavailable ? '—' : `${m.aiN} / ${m.aiDeliveredN}`));
  }))))), React.createElement("div", {
    className: "creative-report__evidence-actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    "aria-expanded": showTasks,
    onClick: () => setShowTasks(v => !v)
  }, showTasks ? 'Hide' : 'Show', " task evidence (", report.rows.length, ")"), React.createElement("button", {
    className: "btn btn--secondary",
    "aria-expanded": showAi,
    onClick: () => setShowAi(v => !v)
  }, showAi ? 'Hide' : 'Show', " AI tasks (", report.aiTasks.length, ")")), showTasks && React.createElement(FlowMateCreativeEvidenceTable, {
    rows: report.rows,
    title: "Task evidence"
  }), showAi && React.createElement(FlowMateCreativeEvidenceTable, {
    rows: report.aiTasks,
    title: "Recorded AI tasks"
  }), React.createElement("p", {
    className: "creative-report__footnote"
  }, "Current recorded data · manual refresh · ", report.version, ". AI tags reflect recorded usage, not measured benefit. Unknown or historical changes remain visible in the exported evidence.")));
}
function FlowMateCreativeEvidenceTable({
  rows,
  title
}) {
  const key = window.FlowMateCreativeReport.dateKey;
  return React.createElement("section", {
    className: "creative-report__details"
  }, React.createElement("h2", null, title), React.createElement("div", {
    className: "creative-report__table-wrap"
  }, React.createElement("table", {
    className: "tbl"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Task ID"), React.createElement("th", null, "Task name"), React.createElement("th", null, "Owner / role"), React.createElement("th", null, "Status"), React.createElement("th", null, "First Review"), React.createElement("th", null, "Delivered"), React.createElement("th", null, "AI tags"), React.createElement("th", null, "Context flags"))), React.createElement("tbody", null, rows.map(r => React.createElement("tr", {
    key: r.id
  }, React.createElement("td", null, r.displayId), React.createElement("td", {
    className: "creative-report__task-title"
  }, r.title), React.createElement("td", null, r.personName, " · ", r.role), React.createElement("td", null, r.status), React.createElement("td", null, key(r.review_submitted_at) || '—'), React.createElement("td", null, key(r.delivered_at) || '—'), React.createElement("td", null, r.tags.join(', ') || 'No recorded tag'), React.createElement("td", null, window.FlowMateCreativeReport.formatFlags(r.flags) || '—')))))));
}
window.FlowMateCreativeReportScreen = FlowMateCreativeReportScreen;
function flowMateCreativeChartValue(value, unit = "") {
  return window.FlowMateCreativeReport.formatMetric(value, unit.trim() === "d" ? "days" : unit === "%" ? "percent" : "");
}
function FlowMateCreativeReportTrendChart({
  rows,
  primaryField,
  secondaryField,
  title,
  description,
  unit = " d"
}) {
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
    const x = rows.length > 1 ? left + index / (rows.length - 1) * plotWidth : left + plotWidth / 2;
    const raw = row[field];
    const y = raw == null ? null : top + plotHeight - Number(raw) / maxValue * plotHeight;
    return {
      x,
      y,
      value: raw
    };
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
    return React.createElement("section", {
      className: "creative-kpi__chart-card"
    }, React.createElement("div", {
      className: "creative-kpi__section-head"
    }, React.createElement("div", null, React.createElement("h2", null, title), React.createElement("p", null, description))), React.createElement("div", {
      className: "creative-kpi__empty"
    }, "No eligible monthly data for this metric."));
  }
  return React.createElement("section", {
    className: "creative-kpi__chart-card"
  }, React.createElement("div", {
    className: "creative-kpi__section-head"
  }, React.createElement("div", null, React.createElement("h2", null, title), React.createElement("p", null, description)), React.createElement("div", {
    className: "creative-kpi__legend",
    "aria-label": "Chart legend"
  }, React.createElement("span", null, React.createElement("i", {
    className: "creative-kpi__legend-line creative-kpi__legend-line--p50"
  }), "P50 typical"), React.createElement("span", null, React.createElement("i", {
    className: "creative-kpi__legend-line creative-kpi__legend-line--p85"
  }), "P85 slower cases"))), React.createElement("div", {
    className: "creative-kpi__chart"
  }, React.createElement("svg", {
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": `${title}, monthly P50 and P85 trend`
  }, [0, 1, 2, 3].map(index => {
    const y = top + index / 3 * plotHeight;
    const value = maxValue * (1 - index / 3);
    return React.createElement("g", {
      key: index
    }, React.createElement("line", {
      className: "creative-kpi__grid-line",
      x1: left,
      x2: width - right,
      y1: y,
      y2: y
    }), React.createElement("text", {
      className: "creative-kpi__axis-label",
      x: left - 8,
      y: y + 4,
      textAnchor: "end"
    }, flowMateCreativeChartValue(value)));
  }), React.createElement("path", {
    className: "creative-kpi__series creative-kpi__series--p85",
    d: pathFor(secondaryField)
  }), React.createElement("path", {
    className: "creative-kpi__series creative-kpi__series--p50",
    d: pathFor(primaryField)
  }), rows.map((row, index) => {
    const p50 = point(row, index, primaryField);
    const p85 = point(row, index, secondaryField);
    return React.createElement("g", {
      key: row.reviewMonth || index
    }, p85.y != null && React.createElement("circle", {
      className: "creative-kpi__point creative-kpi__point--p85",
      cx: p85.x,
      cy: p85.y,
      r: "4"
    }, React.createElement("title", null, `${flowMateKpiMonthShortC(row.reviewMonth)} P85 ${flowMateCreativeChartValue(p85.value, unit)} · n=${row.n || 0}`)), p50.y != null && React.createElement("circle", {
      className: "creative-kpi__point creative-kpi__point--p50",
      cx: p50.x,
      cy: p50.y,
      r: "4"
    }, React.createElement("title", null, `${flowMateKpiMonthShortC(row.reviewMonth)} P50 ${flowMateCreativeChartValue(p50.value, unit)} · n=${row.n || 0}`)), React.createElement("text", {
      className: "creative-kpi__month-label",
      x: p50.x,
      y: height - 22,
      textAnchor: "middle"
    }, flowMateKpiMonthShortC(row.reviewMonth)), React.createElement("text", {
      className: "creative-kpi__sample-label",
      x: p50.x,
      y: height - 7,
      textAnchor: "middle"
    }, "n=", row.n || 0));
  }))));
}
