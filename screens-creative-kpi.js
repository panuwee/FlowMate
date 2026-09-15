/* AUTO-GENERATED from screens-creative-kpi.jsx by build-github.cjs. Do not edit; edit the .jsx and re-run `npm run build:github`. */
function FlowMateCreativeReportScreen({
  requesterView: RequesterView
}) {
  const now = new Date(),
    model = window.FlowMateCreativeReport,
    fmt = model.formatMetric;
  const [year, setYear] = React.useState(now.getFullYear()),
    [month, setMonth] = React.useState(now.getMonth() + 1);
  const [role, setRole] = React.useState(''),
    [personId, setPersonId] = React.useState(''),
    [workType, setWorkType] = React.useState('');
  const [snapshot, setSnapshot] = React.useState(null),
    [error, setError] = React.useState(''),
    [refresh, setRefresh] = React.useState(0);
  const [requester, setRequester] = React.useState(false),
    [metric, setMetric] = React.useState('volume'),
    [context, setContext] = React.useState('assigned'),
    [timingGroup, setTimingGroup] = React.useState('');
  React.useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setSnapshot(null);
    setError('');
    window.loadFlowMateCreativeReport({
      year,
      signal: controller.signal
    }).then(data => {
      if (active) setSnapshot({
        ...data,
        year
      });
    }).catch(e => {
      if (active) setError(e.message || 'Report unavailable');
    });
    return () => {
      active = false;
      controller.abort();
    };
  }, [year, refresh]);
  const fullReport = React.useMemo(() => snapshot?.year === year ? model.buildReport(snapshot.rows, {
    year,
    month,
    role,
    personId,
    workType,
    asOf: snapshot.asOf,
    calendarActiveN: snapshot.calendarActiveN
  }) : null, [snapshot, year, month, role, personId, workType]);
  const report = React.useMemo(() => fullReport && timingGroup ? model.buildReport(snapshot.rows, {
    ...fullReport.filters,
    timingSource: context,
    timingGroup,
    asOf: snapshot.asOf,
    calendarActiveN: snapshot.calendarActiveN
  }) : fullReport, [fullReport, timingGroup, context, snapshot]);
  const s = report?.selected,
    previous = month > 1 ? report?.monthly[month - 2] : null;
  const volume = v => !s?.activityN || s.periodStatus === 'Future period' ? '—' : fmt(v);
  const note = (d, base) => `${base} · ${d.n} งานที่วัดได้ · ขาด ${d.missingN}`;
  const cards = s ? [['Delivered', volume(s.deliveredN), 'เดือนส่งมอบครั้งแรก · Task ละ 1 ครั้ง'], ['Delivered ที่ใช้ AI', volume(s.aiDeliveredN), `${fmt(s.aiAdoption.pct, 'percent')} ของ Delivered · เดือนส่งมอบ`], ['First Draft ตรงเวลา', fmt(s.onTime.pct, 'percent'), `${s.onTime.numerator}/${s.onTime.denominator} งาน · เดือนส่ง First Review`], ['ส่งก่อน Launch', fmt(s.launch.p50, 'days'), `${note(s.launch, 'เดือนส่ง First Review')} · ค่าลบ = ส่งหลัง`], ['ระยะเวลาผลิต', fmt(s.production.p50, 'days'), note(s.production, 'เดือนส่ง First Review')], ['ระยะเวลาจนเริ่มงาน', fmt(s.acknowledge.p50, 'days'), note(s.acknowledge, 'Created → Started · เดือนเริ่มงาน')]] : [];
  function download() {
    if (!report) return;
    if (!window.flowmateDownloadWorkbook) {
      setError('Workbook unavailable. Please refresh.');
      return;
    }
    window.flowmateDownloadWorkbook(`flowmate-creative-kpi-${year}-${month || 'year'}-${model.dateKey(report.asOf)}.xlsx`, model.buildWorkbook(report));
  }
  if (requester) return React.createElement("div", {
    className: "creative-report"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setRequester(false)
  }, "กลับ GD / VE"), React.createElement(RequesterView, {
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
  }, "ผลงานรายเดือนและพัฒนาการของ GD / VE")), React.createElement("div", {
    className: "page__actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setRequester(true)
  }, "Requester"), React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setRefresh(v => v + 1)
  }, "Refresh"), React.createElement("button", {
    className: "btn btn--primary",
    "data-testid": "creative-report-export",
    disabled: !report,
    onClick: download
  }, "Export Excel"))), React.createElement("div", {
    className: "creative-report__filters"
  }, React.createElement("label", null, "ปี", React.createElement("select", {
    className: "select",
    "aria-label": "Report year",
    value: year,
    onChange: e => setYear(Number(e.target.value))
  }, Array.from({
    length: Math.max(1, now.getFullYear() - 2025)
  }, (_, i) => React.createElement("option", {
    key: i
  }, 2026 + i)))), React.createElement("label", null, "บทบาท", React.createElement("select", {
    className: "select",
    "aria-label": "Report role",
    value: role,
    onChange: e => {
      setRole(e.target.value);
      setPersonId('');
    }
  }, React.createElement("option", {
    value: ""
  }, "GD และ VE"), React.createElement("option", null, "GD"), React.createElement("option", null, "VE"), React.createElement("option", {
    value: "Unmapped"
  }, "ยังไม่ทราบบทบาท"))), React.createElement("label", null, "บุคคล", React.createElement("select", {
    className: "select",
    "aria-label": "Report person",
    value: personId,
    onChange: e => setPersonId(e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "ทุกคน"), report?.availablePeople.map(p => React.createElement("option", {
    key: p.id,
    value: p.id
  }, p.name, " · ", p.role)))), React.createElement("label", null, "เดือน", React.createElement("select", {
    className: "select",
    "aria-label": "Report month",
    value: month || '',
    onChange: e => setMonth(Number(e.target.value) || null)
  }, React.createElement("option", {
    value: ""
  }, "ทั้งปี"), Array.from({
    length: 12
  }, (_, i) => React.createElement("option", {
    key: i,
    value: i + 1
  }, flowMateProgressMonth(i))))), React.createElement("label", null, "ประเภทงาน", React.createElement("select", {
    className: "select",
    "aria-label": "Report work type",
    value: workType,
    onChange: e => setWorkType(e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "ทุกประเภท"), report?.workTypes.map(t => React.createElement("option", {
    key: t
  }, t))))), error && React.createElement("div", {
    className: "creative-report__notice is-warning",
    role: "alert"
  }, error, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setRefresh(v => v + 1)
  }, "Retry")), !report && !error && React.createElement("div", {
    className: "creative-report__notice",
    role: "status"
  }, "กำลังโหลดข้อมูลรายงาน…"), report && React.createElement(React.Fragment, null, React.createElement("div", {
    className: "creative-report__context"
  }, React.createElement("strong", null, report.availablePeople.find(p => p.id === personId)?.name || role || 'Creative team', " · ", month ? flowMateProgressMonth(month - 1) : 'ทั้งปี', " ", year), React.createElement("span", null, flowMateProgressStatus(s.periodStatus), " · ณ ", model.dateKey(report.asOf), " (Bangkok)")), timingGroup && React.createElement("div", {
    className: "creative-report__notice"
  }, "กำลังดูเฉพาะ: ", context === 'created' ? 'ตอนสร้าง Task' : 'ตอน Assign', " · ", flowMateTimingLabel(timingGroup), " ", React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setTimingGroup('')
  }, "กลับไปดูทุกงาน")), React.createElement("div", {
    className: "creative-report__cards"
  }, cards.map(([label, value, note]) => React.createElement("section", {
    className: "creative-report__card",
    key: label
  }, React.createElement("h2", null, label), React.createElement("div", {
    className: "creative-report__value"
  }, value), React.createElement("p", null, note)))), React.createElement("section", {
    className: "creative-report__details"
  }, React.createElement("h2", null, "Progression รายเดือน"), React.createElement("div", {
    className: "creative-report__tabs",
    "aria-label": "Trend metric"
  }, [['volume', 'จำนวนงาน'], ['onTime', 'ส่งตรงเวลา'], ['launch', 'ก่อน Launch'], ['production', 'ระยะเวลาผลิต'], ['acknowledge', 'จนเริ่มงาน']].map(([key, label]) => React.createElement("button", {
    className: "btn btn--secondary",
    key: key,
    "aria-pressed": metric === key,
    onClick: () => setMetric(key)
  }, label))), React.createElement(FlowMateProgressChart, {
    months: report.monthly,
    metric: metric,
    selected: month,
    onSelect: setMonth
  }), React.createElement("p", null, previous && s.periodStatus === 'Recorded data' && previous.periodStatus === 'Recorded data' ? `Delivered ${s.deliveredN} งาน เทียบกับ ${previous.deliveredN} งานเดือนก่อน · First Draft ตรงเวลา ${s.onTime.numerator}/${s.onTime.denominator} เทียบกับ ${previous.onTime.numerator}/${previous.onTime.denominator} งาน` : 'เลือกเดือนบนกราฟเพื่อดูรายละเอียด · เดือนที่ยังไม่ครบไม่เปรียบเทียบจำนวนงานกับเดือนเต็ม')), React.createElement("details", {
    className: "creative-report__details"
  }, React.createElement("summary", null, "เวลาที่ได้รับก่อน First Draft Due"), React.createElement("p", null, "จำนวนด้านล่างคืองานที่ส่ง First Review ในช่วงที่เลือก เลือกกลุ่มเพื่อกรอง KPI กราฟ และ Export ทุกส่วน · Created และ Assigned ยังไม่ใช่หลักฐานว่าบรีฟครบ"), React.createElement("div", {
    className: "creative-report__tabs"
  }, [['created', 'ตอนสร้าง Task'], ['assigned', 'ตอน Assign']].map(([key, label]) => React.createElement("button", {
    className: "btn btn--secondary",
    key: key,
    "aria-pressed": context === key,
    onClick: () => {
      setContext(key);
      setTimingGroup('');
    }
  }, label))), React.createElement("div", {
    className: "creative-report__timing"
  }, Object.keys(model.groupLabels).map(key => React.createElement("button", {
    className: "btn btn--secondary",
    key: key,
    "aria-pressed": timingGroup === key,
    onClick: () => setTimingGroup(timingGroup === key ? '' : key)
  }, React.createElement("strong", null, fullReport.selected.timing[context][key].n, " งาน"), React.createElement("span", null, flowMateTimingLabel(key)), React.createElement("small", null, "ตรงเวลา ", fullReport.selected.timing[context][key].onTime.numerator, "/", fullReport.selected.timing[context][key].onTime.denominator))))), React.createElement("details", {
    className: "creative-report__details"
  }, React.createElement("summary", null, "วิธีวัดและคุณภาพข้อมูล"), React.createElement("p", null, "ระยะเวลาแสดงค่ากลาง P50 ตามสูตรวันทำงานเดิม ไม่ใช่ชั่วโมงทำงานจริง · P85 และหลักฐานอยู่ใน Excel"), React.createElement("p", null, "Created → Assigned: ", fmt(s.queue.p50, 'days'), " · Assigned → Started: ", fmt(s.start.p50, 'days'), " · Created → Started: ", fmt(s.acknowledge.p50, 'days')), React.createElement("p", null, "Start → Review ภายใน 60 วินาที: ", s.shortProductionN, " งาน · ย้ายผู้รับผิดชอบระหว่างผลิต: ", s.mixedProductionN, " งาน (ไม่รวมเวลาทั้งงานในการวัดระยะเวลาผลิตรายบุคคล)"), React.createElement("p", null, "ข้อมูลเก่าอาจใช้วันกำหนดและ AI ปัจจุบัน ให้ตรวจข้อจำกัดราย Task · ข้อมูลไม่พอแสดง — · งานที่ไม่มี First Delivered event ไม่ถูกเดาเป็นยอดส่งมอบ"), React.createElement("p", null, report.calendarActiveN === 0 ? 'ยังไม่มีวันหยุดที่บันทึกไว้ในปีนี้' : `วันหยุดที่บันทึกไว้ในปีนี้: ${report.calendarActiveN ?? 'ไม่ทราบ'}`, " · เกณฑ์ 2 วันใช้เป็นบริบทเวลา")), React.createElement("details", {
    className: "creative-report__details"
  }, React.createElement("summary", null, "ตารางรายเดือนทั้งปี"), React.createElement("div", {
    className: "creative-report__table-wrap"
  }, React.createElement("table", {
    className: "tbl"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "เดือน"), React.createElement("th", null, "ช่วงข้อมูล"), React.createElement("th", null, "Delivered"), React.createElement("th", null, "AI Delivered"), React.createElement("th", null, "First Draft ตรงเวลา"), React.createElement("th", null, "ก่อน Launch"), React.createElement("th", null, "ผลิต P50"), React.createElement("th", null, "จนเริ่ม P50"))), React.createElement("tbody", null, report.monthly.map((m, i) => React.createElement("tr", {
    key: m.period
  }, React.createElement("td", null, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setMonth(i + 1)
  }, flowMateProgressMonth(i))), React.createElement("td", null, flowMateProgressStatus(m.periodStatus)), React.createElement("td", null, m.activityN ? m.deliveredN : '—'), React.createElement("td", null, m.activityN ? `${m.aiDeliveredN} (${fmt(m.aiAdoption.pct, 'percent')})` : '—'), React.createElement("td", null, fmt(m.onTime.pct, 'percent'), " (", m.onTime.numerator, "/", m.onTime.denominator, ")"), React.createElement("td", null, fmt(m.launch.p50, 'days')), React.createElement("td", null, fmt(m.production.p50, 'days')), React.createElement("td", null, fmt(m.acknowledge.p50, 'days')))))))), React.createElement("details", {
    className: "creative-report__details"
  }, React.createElement("summary", null, "งานในช่วงที่เลือก (", report.selectedRows.length, ")"), React.createElement(FlowMateCreativeEvidenceTable, {
    rows: report.selectedRows,
    title: "หลักฐานราย Task"
  })), React.createElement("details", {
    className: "creative-report__details"
  }, React.createElement("summary", null, "AI Delivered ในช่วงที่เลือก (", report.aiTasks.length, ")"), React.createElement(FlowMateCreativeEvidenceTable, {
    rows: report.aiTasks,
    title: "รายชื่อ AI Delivered"
  }))));
}
function flowMateProgressMonth(i) {
  return ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][i];
}
function flowMateProgressStatus(s) {
  return {
    'Future period': 'ยังไม่ถึงช่วงเวลา',
    'Partial month': 'ยังไม่ครบเดือน',
    'Year to date': 'ยอดถึงปัจจุบัน',
    'No recorded data': 'ไม่มีข้อมูลบันทึก',
    'Recorded data': 'ข้อมูลที่บันทึก'
  }[s] || s;
}
function flowMateTimingLabel(s) {
  return {
    adequate: 'เผื่อเวลา ≥2 วันทำงาน',
    short: 'เผื่อเวลาน้อยกว่า 2 วัน',
    after_due: 'เลย Due แล้ว',
    unknown: 'ข้อมูลไม่ครบ'
  }[s];
}
function FlowMateProgressChart({
  months,
  metric,
  selected,
  onSelect
}) {
  const fmt = window.FlowMateCreativeReport.formatMetric;
  const values = months.map(m => metric === 'volume' ? m.activityN ? m.deliveredN : null : metric === 'onTime' ? m.onTime.pct : m[metric].p50);
  const min = Math.min(0, ...values.filter(v => v != null)),
    max = metric === 'onTime' ? 100 : Math.max(1, ...values.filter(v => v != null));
  const y = v => 28 + (max - v) / (max - min) * 160,
    zero = y(0),
    unit = metric === 'onTime' ? 'percent' : metric === 'volume' ? '' : 'days';
  return React.createElement("div", {
    className: "creative-report__progress"
  }, React.createElement("p", {
    className: "creative-report__footnote"
  }, metric === 'volume' ? 'ยอดแท่งรวม = Delivered · สีเข้ม = AI' : metric === 'onTime' ? '% ตรงเวลา · เดือนส่ง First Review' : metric === 'acknowledge' ? 'วันทำงาน P50 · เดือนเริ่มงาน' : 'วันทำงาน P50 · เดือนส่ง First Review'), React.createElement("svg", {
    viewBox: "0 0 780 220",
    role: "img",
    "aria-label": "Monthly progression; exact values and month controls below"
  }, [min, (max + min) / 2, max].map((v, i) => React.createElement("g", {
    key: i
  }, React.createElement("line", {
    x1: "40",
    x2: "770",
    y1: y(v),
    y2: y(v),
    stroke: "var(--report-border)"
  }), React.createElement("text", {
    x: "35",
    y: y(v) + 4,
    textAnchor: "end",
    fontSize: "11",
    fill: "currentColor"
  }, fmt(v)))), values.map((v, i) => v == null ? null : React.createElement("g", {
    key: i,
    onClick: () => onSelect(i + 1),
    style: {
      cursor: 'pointer'
    }
  }, React.createElement("title", null, flowMateProgressMonth(i), ": ", fmt(v, unit), "; ", flowMateProgressStatus(months[i].periodStatus)), React.createElement("rect", {
    x: 40 + (i + .5) * (730 / 12) - 17,
    y: Math.min(zero, y(v)),
    width: "34",
    height: Math.max(2, Math.abs(zero - y(v))),
    rx: "3",
    fill: metric === 'volume' ? '#b9cbd7' : '#355e78',
    opacity: selected === i + 1 ? 1 : .8
  }), metric === 'volume' && months[i].aiDeliveredN > 0 && React.createElement("rect", {
    x: 40 + (i + .5) * (730 / 12) - 17,
    y: y(months[i].aiDeliveredN),
    width: "34",
    height: zero - y(months[i].aiDeliveredN),
    rx: "3",
    fill: "#355e78"
  })))), React.createElement("div", {
    className: "creative-report__month-controls"
  }, values.map((v, i) => React.createElement("button", {
    key: i,
    "aria-pressed": selected === i + 1,
    "aria-label": `${flowMateProgressMonth(i)} ${fmt(v, unit)} ${flowMateProgressStatus(months[i].periodStatus)}`,
    onClick: () => onSelect(i + 1)
  }, React.createElement("span", null, flowMateProgressMonth(i)), React.createElement("strong", null, fmt(v, unit))))));
}
function FlowMateCreativeEvidenceTable({
  rows,
  title
}) {
  const model = window.FlowMateCreativeReport;
  return React.createElement("section", null, React.createElement("h3", null, title), !rows.length ? React.createElement("p", null, "ไม่มีงานในกลุ่มนี้") : React.createElement("div", {
    className: "creative-report__table-wrap"
  }, React.createElement("table", {
    className: "tbl"
  }, React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "Task"), React.createElement("th", null, "ผู้ส่ง First Draft"), React.createElement("th", null, "ผู้ส่ง Delivered"), React.createElement("th", null, "First Review"), React.createElement("th", null, "First Delivered"), React.createElement("th", null, "AI"), React.createElement("th", null, "หลักฐาน"))), React.createElement("tbody", null, rows.map(r => React.createElement("tr", {
    key: r.id
  }, React.createElement("td", {
    className: "creative-report__task-title"
  }, r.displayId, " · ", r.title), React.createElement("td", null, r.owners.review.name, " · ", r.owners.review.role), React.createElement("td", null, r.owners.delivery.name, " · ", r.owners.delivery.role), React.createElement("td", null, model.dateKey(r.review_submitted_at) || '—'), React.createElement("td", null, model.dateKey(r.deliveryAt) || '—'), React.createElement("td", null, r.deliveredTags.join(', ') || 'ไม่มี tag บันทึก', React.createElement("small", null, r.ai_evidence_source === 'delivery_snapshot' ? 'บันทึก ณ Delivered' : 'ข้อมูลปัจจุบัน')), React.createElement("td", null, React.createElement("details", null, React.createElement("summary", null, "ดูเวลาและข้อจำกัด"), React.createElement("p", null, "Created: ", r.created_at || '—', React.createElement("br", null), "Assigned: ", r.assigned_at || '—', React.createElement("br", null), "Started: ", r.acknowledgeAt || '—', React.createElement("br", null), "Due ที่ใช้วัด: ", r.evaluationDue || '—', React.createElement("br", null), "Due ปัจจุบัน: ", r.due_date || '—', React.createElement("br", null), "Launch ที่ใช้วัด: ", r.evaluationLaunch || '—'), React.createElement("p", null, flowMateTimingLabel(r.createdGroup), " (Created) · ", flowMateTimingLabel(r.assignedGroup), " (Assigned)"), React.createElement("p", null, model.formatFlags(r.flags) || '—'), React.createElement("p", null, "Brief: ", (r.brief_evidence || []).map(b => `${b.action} ${b.occurred_at}`).join('; ') || 'ยังไม่มีหลักฐาน')))))))));
}
window.FlowMateCreativeReportScreen = FlowMateCreativeReportScreen;
function FlowMateCreativeBriefEvidence({
  workItemId,
  onChanged
}) {
  const [state, setState] = React.useState(null),
    [error, setError] = React.useState(''),
    [reason, setReason] = React.useState(''),
    [busy, setBusy] = React.useState(false),
    [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    let active = true;
    setState(null);
    setError('');
    window.flowmateSupabase.rpc('flowmate_creative_brief', {
      p_work_item_id: workItemId
    }).then(({
      data,
      error: e
    }) => {
      if (active) {
        if (e) setError('ยังโหลดหลักฐานบรีฟไม่ได้ กรุณาลองใหม่หรือติดต่อผู้ดูแล');else setState(data);
      }
    }).catch(() => {
      if (active) setError('โหลดหลักฐานบรีฟไม่สำเร็จ');
    });
    return () => {
      active = false;
    };
  }, [workItemId, retry]);
  const latest = state?.history?.find(e => e.action === 'submitted'),
    accepted = latest && state.history.some(e => e.submission_id === latest.id);
  async function act(action) {
    if (!reason.trim()) {
      setError('กรุณาระบุรายละเอียดบรีฟหรือเหตุผลยืนยัน');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const {
        data,
        error: e
      } = await window.flowmateSupabase.rpc('flowmate_creative_brief', {
        p_work_item_id: workItemId,
        p_action: action,
        p_reason: reason.trim(),
        p_submission_id: latest?.id || null
      });
      if (e) throw new Error(e.message);
      setState(data);
      setReason('');
      await onChanged?.();
    } catch (e) {
      setError(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }
  return React.createElement("div", {
    className: "card"
  }, React.createElement("div", {
    className: "card__head"
  }, React.createElement("span", {
    className: "card__title"
  }, "หลักฐานความพร้อมของบรีฟ")), React.createElement("div", {
    className: "card__body"
  }, React.createElement("p", null, accepted ? 'ยืนยันบรีฟครบแล้ว' : latest ? 'ส่งบรีฟแล้ว รอยืนยันความครบ' : 'ยังไม่มีหลักฐานการส่งบรีฟ'), error && React.createElement("p", {
    role: "alert"
  }, error, " ", React.createElement("button", {
    className: "btn btn--secondary",
    disabled: busy,
    onClick: () => setRetry(v => v + 1)
  }, "ลองใหม่")), state && (state.can_submit || state.can_accept && latest && !accepted) && React.createElement(React.Fragment, null, React.createElement("label", null, "รายละเอียดเวอร์ชัน / เหตุผลยืนยัน", React.createElement("textarea", {
    className: "textarea",
    value: reason,
    disabled: busy,
    onChange: e => setReason(e.target.value)
  })), React.createElement("p", null, "ยืนยันแทนเจ้าของงาน: ระบุเหตุผลในช่องด้านบน"), React.createElement("div", {
    className: "page__actions"
  }, state.can_submit && React.createElement("button", {
    className: "btn btn--secondary",
    disabled: busy,
    onClick: () => act('submitted')
  }, "ส่งบรีฟเวอร์ชันนี้"), state.can_accept && latest && !accepted && React.createElement("button", {
    className: "btn btn--primary",
    disabled: busy,
    onClick: () => act('accepted')
  }, "ยืนยันบรีฟครบ"))), !!state?.history?.length && React.createElement("details", null, React.createElement("summary", null, "ประวัติบรีฟ (", state.history.length, ")"), state.history.map(e => React.createElement("p", {
    key: e.id
  }, e.action === 'submitted' ? 'ส่งบรีฟ' : 'ยืนยันครบ', " · ", e.occurred_at, " · ", e.reason)))));
}
window.FlowMateCreativeBriefEvidence = FlowMateCreativeBriefEvidence;
