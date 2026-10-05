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
  }, "อ่านผลของแต่ละขั้นตอน พร้อมตรวจหลักฐานที่ใช้คำนวณ")), React.createElement("div", {
    className: "page__actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setRefresh(n => n + 1)
  }, "รีเฟรชข้อมูล"), React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => onNav('kpi-legacy')
  }, "เปิดรายงานเดิม"))), React.createElement("div", {
    className: "kpi-workspace__toolbar"
  }, React.createElement("label", null, "เดือนรายงาน", React.createElement("input", {
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
  })), React.createElement("p", null, "Asia/Bangkok · ", month === api.dateKey(new Date().toISOString()).slice(0, 7) ? 'เดือนนี้ถึงเวลาอ่านข้อมูล (MTD)' : 'เดือนย้อนหลัง', React.createElement("br", null), "งานเปิดแสดง snapshot ปัจจุบันเสมอ")), React.createElement("nav", {
    className: "kpi-workspace__views",
    "aria-label": "มุมมอง KPI"
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
  })), React.createElement("p", {
    className: "kpi-workspace__foot"
  }, "ข้อมูลตามสิทธิ์ KPI เดิม · ไม่รวมเป็นคะแนนบุคคล · ตัด TEST ด้วย registry ของระบบและตัดงานที่สถานะปัจจุบันยกเลิก · งานจบที่ archive ยังคงอยู่เมื่อ source อนุญาต · ", api.version));
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
        message: 'กรุณาเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์ KPI เดิม'
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
        message: error.message || 'โหลดรายงานไม่สำเร็จ กรุณาลองใหม่',
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
        message: 'เตรียมไฟล์ CSV ไม่สำเร็จ กรุณาลองใหม่'
      });
    }
  }
  if (state.status === 'loading') return React.createElement("section", {
    className: "kpi-workspace__state",
    role: "status"
  }, React.createElement("h2", null, api.labels[domain]), React.createElement("p", null, "กำลังตรวจสิทธิ์และโหลดหลักฐานของเดือนที่เลือก…"), React.createElement("div", {
    className: "kpi-workspace__skeleton"
  }));
  if (state.status === 'error' || state.status === 'denied') return React.createElement("section", {
    className: "kpi-workspace__state",
    role: "alert",
    "data-kpi-error-code": state.errorCode
  }, React.createElement("h2", null, api.labels[domain], " · ", state.status === 'denied' ? 'ไม่มีสิทธิ์' : 'โหลดไม่สำเร็จ'), React.createElement("p", null, state.message), React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setReload(n => n + 1)
  }, "ลองโหลดอีกครั้ง"));
  if (!snapshot || !valid || !metric) return React.createElement("section", {
    className: "kpi-workspace__state",
    role: "status"
  }, "กำลังตรวจขอบเขตผู้ใช้ใหม่…");
  if (overview) {
    const primary = report.find(m => m.id === (domain === 'creative' ? 'C04' : domain === 'requester' ? 'R03' : 'T07')) || metric;
    return React.createElement("section", {
      className: "kpi-workspace__overview"
    }, React.createElement("div", null, React.createElement("h2", null, api.labels[domain]), React.createElement("p", null, primary.label, " · ", primary.note)), React.createElement("strong", null, api.format(primary.value, primary.unit)), React.createElement("button", {
      className: "btn btn--secondary",
      onClick: () => onNav(api.routes[domain])
    }, "เปิดรายละเอียด"), React.createElement("p", {
      className: "kpi-workspace__asof"
    }, "อ่านข้อมูล ", dateTimeKpi(snapshot.asOf), snapshot.partial ? ' · บางแหล่งโหลดไม่ครบ' : ''));
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
  }, savedNotice.current), React.createElement("div", {
    className: "kpi-workspace__context"
  }, React.createElement("span", null, "อ่านข้อมูล ", dateTimeKpi(snapshot.asOf)), React.createElement("span", null, domain === 'requester' ? 'ชุดคำขอที่สร้างในเดือนนี้' : 'เหตุการณ์ครั้งแรกตามเดือนที่เลือก', " · Asia/Bangkok")), snapshot.partial && React.createElement("div", {
    className: "kpi-workspace__notice",
    role: "alert"
  }, React.createElement("strong", null, "บางแหล่งโหลดไม่ครบ"), React.createElement("p", null, "แสดงเฉพาะค่าที่หลักฐานตรวจครบ และปิด Export รายงานนี้"), Object.entries(snapshot.resources).filter(([, r]) => r.status === 'error').map(([name, r]) => React.createElement("p", {
    key: name
  }, sourceLabelKpi(name), ": ", r.message)), React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setReload(n => n + 1)
  }, "ลองโหลดอีกครั้ง")), React.createElement("div", {
    className: "kpi-workspace__filters"
  }, domain === 'creative' ? React.createElement("label", null, "เจ้าของ ณ ส่งมอบ", React.createElement("select", {
    className: "select",
    "aria-label": "เจ้าของ ณ ส่งมอบ",
    value: person,
    onChange: e => {
      setPerson(e.target.value);
      setPage(0);
      setOpenDetail('');
    }
  }, React.createElement("option", {
    value: ""
  }, "ทุกคน"), people.map(p => React.createElement("option", {
    value: p.id,
    key: p.id
  }, p.name)), React.createElement("option", {
    value: "unknown"
  }, "ยังไม่มีหลักฐานเจ้าของ"))) : React.createElement("label", null, "ทีมผู้ขอ (ข้อมูลปัจจุบัน)", React.createElement("select", {
    className: "select",
    "aria-label": "ทีมผู้ขอ (ข้อมูลปัจจุบัน)",
    value: team,
    onChange: e => {
      setTeam(e.target.value);
      setPage(0);
      setOpenDetail('');
    }
  }, React.createElement("option", {
    value: ""
  }, "ทุกทีมตามสิทธิ์"), teams.map(t => React.createElement("option", {
    key: t
  }, t))))), domain === 'task' && React.createElement("div", {
    className: "kpi-workspace__support"
  }, report.filter(m => ['T03', 'T07', 'T05', 'T06'].includes(m.id)).map(m => React.createElement("button", {
    className: "kpi-workspace__support-row",
    key: m.id,
    onClick: () => selectMetric(m, true),
    "aria-pressed": selected === m.id
  }, React.createElement("span", null, m.id, " · ", m.label, React.createElement("small", null, m.note)), React.createElement("strong", null, api.format(m.value, m.unit)))), React.createElement("p", null, "ส่งตรวจไม่เท่ากับรับมอบ · Legacy Delivered ไม่เพิ่ม Throughput ที่ต้องมี explicit approve · งานตามแผนต้องมีประเภท ณ intake · Internal CSAT ต้องมีแบบประเมินระหว่างแผนก")), React.createElement("dl", {
    className: "kpi-workspace__metrics"
  }, primary.map(m => React.createElement("div", {
    key: m.id,
    "data-available": m.value !== null
  }, React.createElement("dt", null, m.id, " · ", m.label), React.createElement("dd", {
    className: "kpi-workspace__value"
  }, api.format(m.value, m.unit), m.value === null && React.createElement("small", null, "ยังไม่มีค่า")), React.createElement("dd", {
    className: "kpi-workspace__metric-description"
  }, React.createElement("p", null, m.note), React.createElement("button", {
    className: "kpi-workspace__text-button",
    "aria-label": `ตรวจหลักฐาน ${m.id} · ${m.label}`,
    onClick: () => selectMetric(m, true),
    "aria-pressed": selected === m.id
  }, "ตรวจหลักฐาน"))))), React.createElement("div", {
    className: "kpi-workspace__evidence-head"
  }, React.createElement("div", null, React.createElement("h2", {
    ref: evidenceHead,
    tabIndex: -1
  }, metric.id, " · ", metric.label), React.createElement("p", null, metric.note)), React.createElement("label", null, "ตัววัดที่ตรวจ", React.createElement("select", {
    className: "select",
    "aria-label": "ตัววัดที่ตรวจ",
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
  }, React.createElement("strong", null, metric.available ? `${metric.eligible.length}/${metric.cohort.length} งาน${metric.id === 'R03' ? 'มี Brief Link' : 'มีหลักฐานตามนิยาม'}` : 'ยังคำนวณ KPI นี้ไม่ได้'), React.createElement("span", null, Object.entries(metric.reasons).filter(([, n]) => n > 0).map(([r, n]) => `${r}: ${n} งาน`).join(' · '))), metric.available && metric.event !== 'snapshot' && metric.event !== 'surveyAt' && metric.id !== 'R03' ? React.createElement(React.Fragment, null, React.createElement("h3", null, "จำนวนงานในชุดที่ตรวจ · วันที่ของเดือน ", month), React.createElement("div", {
    className: "kpi-workspace__chart",
    role: "img",
    "aria-label": weekly.map(w => `${w.label} ${w.n} งาน`).join(', ')
  }, weekly.map(w => React.createElement("div", {
    key: w.label
  }, React.createElement("b", null, w.n, " งาน"), React.createElement("span", {
    "aria-hidden": "true",
    style: {
      height: `${w.n / max * 110}px`
    }
  }), React.createElement("small", null, w.label))))) : React.createElement("p", {
    className: "kpi-workspace__notice"
  }, metric.value === null ? metric.cohort.length ? metric.note : 'ยังไม่มีงานที่คำนวณได้ · ' + metric.note : metric.id === 'T12' ? 'คะแนนเฉลี่ยจากคำตอบภายในไตรมาสที่เลือก' : metric.id === 'R03' ? 'ตรวจว่ามีค่าในช่อง Brief Link ไม่ตรวจเนื้อหาบรีฟหรือการยืนยันของผู้รับ' : 'งานเปิด ณ เวลาอ่านข้อมูล ไม่ใช่ backlog ย้อนหลัง', " · ค่าที่หลักฐานยังไม่ครบจะแสดงเป็น —"), React.createElement("div", {
    className: "kpi-workspace__evidence-actions"
  }, React.createElement("button", {
    className: "btn btn--secondary",
    disabled: !metric.available || snapshot.partial,
    onClick: exportEvidence
  }, "Export CSV หลักฐาน"), metric.id === 'R03' && metric.available && React.createElement("button", {
    className: "btn btn--secondary",
    "aria-pressed": attention,
    onClick: () => {
      setAttention(v => !v);
      setPage(0);
      setOpenDetail('');
      requestAnimationFrame(() => region.current?.focus());
    }
  }, attention ? 'ดูคำขอทั้งหมด' : 'ดูคำขอที่ยังไม่มี Brief Link')), exportFile && exportFile.context === exportContext && React.createElement("div", {
    className: "kpi-workspace__download"
  }, React.createElement("p", {
    role: "status"
  }, "ไฟล์ CSV พร้อมดาวน์โหลด · ", exportFile.rows, " รายการตามตัวกรอง · ใช้ลิงก์ด้านล่างเพื่อดาวน์โหลดอีกครั้ง"), React.createElement("a", {
    href: exportFile.url,
    download: exportFile.name
  }, "ดาวน์โหลด ", exportFile.name)), React.createElement("section", {
    ref: region,
    tabIndex: -1,
    "aria-label": "หลักฐาน KPI",
    className: "kpi-workspace__evidence"
  }, React.createElement("h3", null, "หลักฐาน ", metric.id, " · ", evidence.length, " งาน"), React.createElement("div", {
    className: "kpi-workspace__table-wrap",
    tabIndex: 0,
    role: "region",
    "aria-label": "ตารางหลักฐาน เลื่อนแนวนอนได้"
  }, React.createElement("table", null, React.createElement("caption", null, "รายการตามตัวกรองและชุดงานของ KPI ที่เลือก · กด Task ID เปิดงานตามสิทธิ์เดิม"), React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", {
    scope: "col"
  }, "Task / งาน"), React.createElement("th", {
    scope: "col"
  }, "ทีม / เจ้าของ ณ ส่งมอบ"), React.createElement("th", {
    scope: "col"
  }, "เหตุการณ์"), React.createElement("th", {
    scope: "col"
  }, "หลักฐาน"))), React.createElement("tbody", null, pageRows.map(({
    fact: f,
    result
  }) => React.createElement(React.Fragment, {
    key: f.id
  }, React.createElement("tr", null, React.createElement("td", null, React.createElement("button", {
    className: "kpi-workspace__text-button",
    onClick: () => onOpen(f.displayId, domain)
  }, f.displayId), React.createElement("p", null, f.title)), React.createElement("td", null, domain === 'creative' ? f.ownerName : f.team || 'ยังไม่มีทีม'), React.createElement("td", null, api.dateKey(metric.event === 'snapshot' ? snapshot.asOf : f[metric.event]) || '—', React.createElement("small", null, metric.event === 'snapshot' ? f.status : metric.event === 'createdAt' ? 'สร้างคำขอ' : 'เหตุการณ์ครั้งแรก')), React.createElement("td", null, result, React.createElement("br", null), React.createElement("button", {
    className: "kpi-workspace__text-button",
    "aria-expanded": openDetail === f.id,
    onClick: () => setOpenDetail(openDetail === f.id ? '' : f.id)
  }, "รายละเอียดหลักฐาน"))), openDetail === f.id && React.createElement("tr", null, React.createElement("td", {
    colSpan: 4
  }, React.createElement("dl", {
    className: "kpi-workspace__detail"
  }, React.createElement("dt", null, "ส่งร่าง / ส่งมอบครั้งแรก"), React.createElement("dd", null, dateTimeKpi(f.reviewAt), " / ", dateTimeKpi(f.deliveredAt)), React.createElement("dt", null, "ส่งตรวจ / ผู้ขอรับมอบครั้งแรก"), React.createElement("dd", null, dateTimeKpi(f.submitAt), " / ", dateTimeKpi(f.approveAt)), domain === 'requester' && React.createElement(React.Fragment, null, React.createElement("dt", null, "Brief Link ณ เวลาอ่านข้อมูล"), React.createElement("dd", null, /^https?:\/\//i.test(f.briefLink) ? React.createElement("a", {
    href: f.briefLink,
    target: "_blank",
    rel: "noopener noreferrer"
  }, f.briefLink) : f.briefLink || 'ยังไม่มี Brief Link')), React.createElement("dt", null, "บรีฟพร้อมที่ผู้รับยืนยัน"), React.createElement("dd", null, snapshot.resources.brief?.status === 'ready' ? dateTimeKpi(f.readyAt) : 'ยังไม่มีหลักฐานบรีฟที่อ่านได้', " · ต้องผูกกับบรีฟรุ่นล่าสุด"), React.createElement("dt", null, "กำหนดส่งร่างเดิมที่รอตรวจ"), React.createElement("dd", null, f.draftBaselineCandidate || 'ยังไม่มีหลักฐานที่อ่านได้', " · ยังไม่ใช้ให้คะแนน"), React.createElement("dt", null, "ส่งตรวจ → รับมอบ (เวลารวม)"), React.createElement("dd", null, f.submitAt && f.approveAt && Date.parse(f.approveAt) >= Date.parse(f.submitAt) ? api.format((Date.parse(f.approveAt) - Date.parse(f.submitAt)) / 86400000, 'days') : '—', " · รวมช่วงรอ/แก้ไข ไม่ใช่ชั่วโมงลงแรง"), React.createElement("dt", null, "ขอบเขต"), React.createElement("dd", null, "ข้อมูลตามสิทธิ์ ณ เวลาอ่าน · สถานะปัจจุบัน ", f.status, " · ไม่ใช้เจ้าของปัจจุบันแทนเจ้าของตอนส่งมอบ")), React.createElement(FlowMateKpiEvidenceCapture, {
    fact: f,
    domain: domain,
    onSaved: () => {
      savedNotice.current = "บันทึกหลักฐานแล้ว · ค่าด้านล่างอ่านใหม่จากข้อมูลที่มี";
      setReload(n => n + 1);
    }
  })))))))), !evidence.length && React.createElement("p", {
    className: "kpi-workspace__notice"
  }, "ไม่มีรายการในชุดงานที่อ่านได้", metric.available ? ' ไม่ได้หมายความว่าไม่มีงานทั้งองค์กร' : ' หลักฐานของตัววัดนี้ยังไม่พร้อม'), React.createElement("div", {
    className: "kpi-workspace__pager"
  }, React.createElement("span", null, evidence.length ? `${page * 12 + 1}–${Math.min((page + 1) * 12, evidence.length)} จาก ${evidence.length}` : '0 รายการ'), React.createElement("div", null, React.createElement("button", {
    className: "btn btn--secondary",
    disabled: page === 0,
    onClick: () => {
      setPage(n => n - 1);
      setOpenDetail('');
    }
  }, "ก่อนหน้า"), React.createElement("button", {
    className: "btn btn--secondary",
    disabled: (page + 1) * 12 >= evidence.length,
    onClick: () => {
      setPage(n => n + 1);
      setOpenDetail('');
    }
  }, "ถัดไป")))), React.createElement("details", {
    className: "kpi-workspace__definition"
  }, React.createElement("summary", null, "นิยามและข้อจำกัดการอ่าน"), React.createElement("p", null, "เดือนใช้เวลา Bangkok แยก first Review, first Delivered, first submit และ first approve ไม่รวมเป็น funnel เดียวกัน วันทำงานทุกทีมใช้จันทร์–ศุกร์และวันหยุดองค์กร 19 วัน ปี 2026 แสดงเวลารวมแยกจากวันทำงาน SLA และกำหนดส่งแต่ละขั้นยังต้องมีหลักฐานยืนยันก่อนใช้"), React.createElement("p", null, "R03 วัดการมี Brief Link ปัจจุบันในคำขอที่สร้างในเดือนที่เลือก ไม่ใช่การรับรองเนื้อหาบรีฟครบ · Requester ระยะแรกใช้เดือนที่สร้างคำขอ เพราะยังไม่มี request-submitted timestamp แยก การรอผู้รับยืนยันอาจกระทบ lead time จึงไม่สรุปความล่าช้าว่าเป็นความผิดฝ่ายผู้ขอ"), React.createElement("p", null, "ตัดงานที่สถานะปัจจุบันยกเลิกตาม as-of; จำนวนเดือนเก่าอาจเปลี่ยนหลังยกเลิก งาน archived ที่จบยังอยู่เมื่อ source คืนให้ TEST ใช้ classifier เดิม ไม่เดาจากชื่อ · Task TEST ที่ตัด ", snapshot.testExcluded, " งาน")));
}
function dateTimeKpi(value) {
  return value ? new Intl.DateTimeFormat('th-TH', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Bangkok'
  }).format(new Date(value)) : 'ยังไม่มีหลักฐาน';
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
        message: first ? '' : 'ยังไม่มีรายการที่บัญชีนี้บันทึกได้ งานจบแล้วหรือไม่มีสิทธิ์ฝั่งผู้รับ',
        failed: false
      });
    } catch (error) {
      setState({
        loading: false,
        saving: false,
        message: error instanceof Error ? error.message : 'ตรวจสิทธิ์ไม่สำเร็จ',
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
      message: 'กำลังบันทึกหลักฐาน…',
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
        message: 'บันทึกหลักฐานแล้ว กำลังอ่าน KPI ใหม่',
        failed: false
      });
      onSaved();
    } catch (error) {
      setState({
        loading: false,
        saving: false,
        message: error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ',
        failed: true
      });
    }
  }
  const labels = {
    deadline: 'ยืนยันกำหนดส่ง',
    ready: 'ผู้รับยืนยันบรีฟครบ',
    sla: 'ตกลง Lead Time / SLA',
    csat: 'ประเมินความพึงพอใจภายใน'
  };
  return React.createElement("section", {
    className: "kpi-workspace__capture",
    "aria-label": `เก็บหลักฐาน ${fact.displayId}`
  }, !opened ? React.createElement("button", {
    className: "btn btn--secondary",
    onClick: open
  }, "เพิ่มหลักฐาน KPI") : React.createElement(React.Fragment, null, React.createElement("div", null, React.createElement("h4", null, "เก็บหลักฐาน ", fact.displayId), React.createElement("p", null, "บันทึกเวลาและผู้ยืนยันจากระบบ เก็บประวัติเดิมไว้ · ไม่สร้างคะแนนย้อนหลัง")), React.createElement("p", {
    role: state.failed ? 'alert' : 'status'
  }, state.loading ? 'กำลังตรวจสิทธิ์บันทึก…' : state.message), !state.loading && possible.length > 0 && React.createElement("form", {
    onSubmit: save
  }, React.createElement("label", null, "ประเภทหลักฐาน", React.createElement("select", {
    className: "input",
    value: kind,
    disabled: state.saving,
    onChange: e => setKind(e.target.value)
  }, possible.map(k => React.createElement("option", {
    key: k,
    value: k
  }, labels[k])))), kind === 'deadline' && React.createElement(React.Fragment, null, React.createElement("label", null, "ขั้นที่ตกลงส่ง", React.createElement("select", {
    className: "input",
    value: endpoint,
    disabled: state.saving,
    onChange: e => setEndpoint(e.target.value)
  }, (domain === 'task' ? [['task_submit', 'ส่งให้ตรวจ'], ['task_approve', 'ผู้ขอรับมอบจบ']] : [['creative_draft', 'ส่งร่าง'], ['creative_delivery', 'ส่งมอบจบ']]).map(([v, t]) => React.createElement("option", {
    key: v,
    value: v
  }, t)))), React.createElement("label", null, "วันกำหนดที่ตกลง", React.createElement("input", {
    className: "input",
    type: "date",
    required: true,
    value: due,
    disabled: state.saving,
    onChange: e => setDue(e.target.value)
  })), React.createElement("p", null, "กำหนดแรกใช้เป็น baseline; การบันทึกใหม่เก็บเป็นประวัติ ไม่แทนที่กำหนดเดิม")), kind === 'sla' && React.createElement(React.Fragment, null, React.createElement("label", null, "วันที่ต้องใช้ที่ตกลง", React.createElement("input", {
    className: "input",
    type: "date",
    required: true,
    min: "2026-01-01",
    max: "2026-12-31",
    value: requiredOn,
    disabled: state.saving,
    onChange: e => setRequiredOn(e.target.value)
  })), React.createElement("label", null, "ต้องบรีฟล่วงหน้ากี่วันทำงาน", React.createElement("input", {
    className: "input",
    type: "number",
    required: true,
    min: "0",
    max: "365",
    step: "1",
    value: sla,
    disabled: state.saving,
    onChange: e => setSla(e.target.value)
  })), React.createElement("p", null, "ใช้ ", api.organizationCalendar.version, "; ตกลงก่อนผู้รับยืนยันบรีฟครบ")), kind === 'ready' && React.createElement("p", null, "ยืนยันว่าได้ตรวจชื่อ ข้อกำหนด และลิงก์อ้างอิงในบรีฟล่าสุดแล้ว การรับคำขอกับการยืนยันบรีฟครบเป็นคนละขั้น หากบรีฟเปลี่ยนระบบจะให้เปิดตรวจใหม่"), kind === 'csat' && React.createElement(React.Fragment, null, React.createElement("label", null, "ความพึงพอใจในการทำงานร่วมกันระหว่างทีม", React.createElement("select", {
    className: "input",
    required: true,
    value: score,
    disabled: state.saving,
    onChange: e => setScore(e.target.value)
  }, React.createElement("option", {
    value: ""
  }, "เลือกคะแนน 1–5"), [1, 2, 3, 4, 5].map(n => React.createElement("option", {
    key: n,
    value: n
  }, n, " / 5")))), React.createElement("p", null, "สำหรับผู้ขอหลังรับมอบงาน · นับในไตรมาสที่ตอบแบบประเมิน · ไม่ใช่ NPS ของผู้เล่นเกม")), React.createElement("label", null, kind === 'csat' ? 'ความคิดเห็น (ไม่บังคับ)' : 'เหตุผลหรือหลักฐานที่ยืนยัน', React.createElement("textarea", {
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
  }, state.saving ? 'กำลังบันทึก…' : 'บันทึกหลักฐาน')), !state.saving && React.createElement("button", {
    className: "btn btn--secondary",
    onClick: () => setOpened(false)
  }, "ปิดส่วนเก็บหลักฐาน")));
}
function sourceLabelKpi(key) {
  const labels = {
    work: 'รายการงาน',
    history: 'ประวัติเหตุการณ์',
    brief: 'หลักฐานบรีฟ',
    briefLinks: 'Brief Link',
    eventCandidates: 'เหตุการณ์ของเดือน',
    milestoneCandidates: 'จุดส่งงานของเดือน',
    milestones: 'จุดส่งงานย้อนหลัง',
    requested: 'คำขอของเดือน',
    open: 'งานเปิดปัจจุบัน',
    taskCandidates: 'งานจากเหตุการณ์ของเดือน',
    evidence: 'หลักฐานยืนยัน KPI',
    surveys: 'แบบประเมินภายใน'
  };
  return labels[key] || 'แหล่งข้อมูล';
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
