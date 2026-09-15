/* Screen and export share event-based monthly cohorts. */
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
  const report = React.useMemo(() => fullReport && timingGroup ? model.buildReport(snapshot.rows, {...fullReport.filters, timingSource:context, timingGroup, asOf:snapshot.asOf, calendarActiveN:snapshot.calendarActiveN}) : fullReport,[fullReport,timingGroup,context,snapshot]);
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
  if (requester) return <div className="creative-report"><button className="btn btn--secondary" onClick={() => setRequester(false)}>กลับ GD / VE</button><RequesterView requesterOnly /></div>;
  return <div className="page creative-report" data-testid="creative-year-end-report">
    <div className="page__header"><div><h1 className="page__title">Creative KPI</h1><p className="page__sub">ผลงานรายเดือนและพัฒนาการของ GD / VE</p></div><div className="page__actions"><button className="btn btn--secondary" onClick={() => setRequester(true)}>Requester</button><button className="btn btn--secondary" onClick={() => setRefresh(v => v + 1)}>Refresh</button><button className="btn btn--primary" data-testid="creative-report-export" disabled={!report} onClick={download}>Export Excel</button></div></div>
    <div className="creative-report__filters">
      <label>ปี<select className="select" aria-label="Report year" value={year} onChange={e => setYear(Number(e.target.value))}>{Array.from({
            length: Math.max(1, now.getFullYear() - 2025)
          }, (_, i) => <option key={i}>{2026 + i}</option>)}</select></label>
      <label>บทบาท<select className="select" aria-label="Report role" value={role} onChange={e => {
          setRole(e.target.value);
          setPersonId('');
        }}><option value="">GD และ VE</option><option>GD</option><option>VE</option><option value="Unmapped">ยังไม่ทราบบทบาท</option></select></label>
      <label>บุคคล<select className="select" aria-label="Report person" value={personId} onChange={e => setPersonId(e.target.value)}><option value="">ทุกคน</option>{report?.availablePeople.map(p => <option key={p.id} value={p.id}>{p.name} · {p.role}</option>)}</select></label>
      <label>เดือน<select className="select" aria-label="Report month" value={month || ''} onChange={e => setMonth(Number(e.target.value) || null)}><option value="">ทั้งปี</option>{Array.from({
            length: 12
          }, (_, i) => <option key={i} value={i + 1}>{flowMateProgressMonth(i)}</option>)}</select></label>
      <label>ประเภทงาน<select className="select" aria-label="Report work type" value={workType} onChange={e => setWorkType(e.target.value)}><option value="">ทุกประเภท</option>{report?.workTypes.map(t => <option key={t}>{t}</option>)}</select></label>
    </div>
    {error && <div className="creative-report__notice is-warning" role="alert">{error}<button className="btn btn--secondary" onClick={() => setRefresh(v => v + 1)}>Retry</button></div>}
    {!report && !error && <div className="creative-report__notice" role="status">กำลังโหลดข้อมูลรายงาน…</div>}
    {report && <>
      <div className="creative-report__context"><strong>{report.availablePeople.find(p => p.id === personId)?.name || role || 'Creative team'} · {month ? flowMateProgressMonth(month - 1) : 'ทั้งปี'} {year}</strong><span>{flowMateProgressStatus(s.periodStatus)} · ณ {model.dateKey(report.asOf)} (Bangkok)</span></div>
      {timingGroup && <div className="creative-report__notice">กำลังดูเฉพาะ: {context==='created'?'ตอนสร้าง Task':'ตอน Assign'} · {flowMateTimingLabel(timingGroup)} <button className="btn btn--secondary" onClick={()=>setTimingGroup('')}>กลับไปดูทุกงาน</button></div>}
      <div className="creative-report__cards">{cards.map(([label, value, note]) => <section className="creative-report__card" key={label}><h2>{label}</h2><div className="creative-report__value">{value}</div><p>{note}</p></section>)}</div>
      <section className="creative-report__details"><h2>Progression รายเดือน</h2><div className="creative-report__tabs" aria-label="Trend metric">{[['volume', 'จำนวนงาน'], ['onTime', 'ส่งตรงเวลา'], ['launch', 'ก่อน Launch'], ['production', 'ระยะเวลาผลิต'], ['acknowledge', 'จนเริ่มงาน']].map(([key, label]) => <button className="btn btn--secondary" key={key} aria-pressed={metric === key} onClick={() => setMetric(key)}>{label}</button>)}</div>
        <FlowMateProgressChart months={report.monthly} metric={metric} selected={month} onSelect={setMonth} />
        <p>{previous && s.periodStatus === 'Recorded data' && previous.periodStatus === 'Recorded data' ? `Delivered ${s.deliveredN} งาน เทียบกับ ${previous.deliveredN} งานเดือนก่อน · First Draft ตรงเวลา ${s.onTime.numerator}/${s.onTime.denominator} เทียบกับ ${previous.onTime.numerator}/${previous.onTime.denominator} งาน` : 'เลือกเดือนบนกราฟเพื่อดูรายละเอียด · เดือนที่ยังไม่ครบไม่เปรียบเทียบจำนวนงานกับเดือนเต็ม'}</p>
      </section>
      <details className="creative-report__details"><summary>เวลาที่ได้รับก่อน First Draft Due</summary><p>จำนวนด้านล่างคืองานที่ส่ง First Review ในช่วงที่เลือก เลือกกลุ่มเพื่อกรอง KPI กราฟ และ Export ทุกส่วน · Created และ Assigned ยังไม่ใช่หลักฐานว่าบรีฟครบ</p><div className="creative-report__tabs">{[['created', 'ตอนสร้าง Task'], ['assigned', 'ตอน Assign']].map(([key, label]) => <button className="btn btn--secondary" key={key} aria-pressed={context === key} onClick={() => {setContext(key);setTimingGroup('');}}>{label}</button>)}</div><div className="creative-report__timing">{Object.keys(model.groupLabels).map(key => <button className="btn btn--secondary" key={key} aria-pressed={timingGroup===key} onClick={()=>setTimingGroup(timingGroup===key?'':key)}><strong>{fullReport.selected.timing[context][key].n} งาน</strong><span>{flowMateTimingLabel(key)}</span><small>ตรงเวลา {fullReport.selected.timing[context][key].onTime.numerator}/{fullReport.selected.timing[context][key].onTime.denominator}</small></button>)}</div></details>
      <details className="creative-report__details"><summary>วิธีวัดและคุณภาพข้อมูล</summary><p>ระยะเวลาแสดงค่ากลาง P50 ตามสูตรวันทำงานเดิม ไม่ใช่ชั่วโมงทำงานจริง · P85 และหลักฐานอยู่ใน Excel</p><p>Created → Assigned: {fmt(s.queue.p50, 'days')} · Assigned → Started: {fmt(s.start.p50, 'days')} · Created → Started: {fmt(s.acknowledge.p50, 'days')}</p><p>Start → Review ภายใน 60 วินาที: {s.shortProductionN} งาน · ย้ายผู้รับผิดชอบระหว่างผลิต: {s.mixedProductionN} งาน (ไม่รวมเวลาทั้งงานในการวัดระยะเวลาผลิตรายบุคคล)</p><p>ข้อมูลเก่าอาจใช้วันกำหนดและ AI ปัจจุบัน ให้ตรวจข้อจำกัดราย Task · ข้อมูลไม่พอแสดง — · งานที่ไม่มี First Delivered event ไม่ถูกเดาเป็นยอดส่งมอบ</p><p>{report.calendarActiveN === 0 ? 'ยังไม่มีวันหยุดที่บันทึกไว้ในปีนี้' : `วันหยุดที่บันทึกไว้ในปีนี้: ${report.calendarActiveN ?? 'ไม่ทราบ'}`} · เกณฑ์ 2 วันใช้เป็นบริบทเวลา</p></details>
      <details className="creative-report__details"><summary>ตารางรายเดือนทั้งปี</summary><div className="creative-report__table-wrap"><table className="tbl"><thead><tr><th>เดือน</th><th>ช่วงข้อมูล</th><th>Delivered</th><th>AI Delivered</th><th>First Draft ตรงเวลา</th><th>ก่อน Launch</th><th>ผลิต P50</th><th>จนเริ่ม P50</th></tr></thead><tbody>{report.monthly.map((m, i) => <tr key={m.period}><td><button className="btn btn--secondary" onClick={() => setMonth(i + 1)}>{flowMateProgressMonth(i)}</button></td><td>{flowMateProgressStatus(m.periodStatus)}</td><td>{m.activityN ? m.deliveredN : '—'}</td><td>{m.activityN ? `${m.aiDeliveredN} (${fmt(m.aiAdoption.pct, 'percent')})` : '—'}</td><td>{fmt(m.onTime.pct, 'percent')} ({m.onTime.numerator}/{m.onTime.denominator})</td><td>{fmt(m.launch.p50, 'days')}</td><td>{fmt(m.production.p50, 'days')}</td><td>{fmt(m.acknowledge.p50, 'days')}</td></tr>)}</tbody></table></div></details>
      <details className="creative-report__details"><summary>งานในช่วงที่เลือก ({report.selectedRows.length})</summary><FlowMateCreativeEvidenceTable rows={report.selectedRows} title="หลักฐานราย Task" /></details>
      <details className="creative-report__details"><summary>AI Delivered ในช่วงที่เลือก ({report.aiTasks.length})</summary><FlowMateCreativeEvidenceTable rows={report.aiTasks} title="รายชื่อ AI Delivered" /></details>
    </>}
  </div>;
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
  return <div className="creative-report__progress"><p className="creative-report__footnote">{metric === 'volume' ? 'ยอดแท่งรวม = Delivered · สีเข้ม = AI' : metric === 'onTime' ? '% ตรงเวลา · เดือนส่ง First Review' : metric === 'acknowledge' ? 'วันทำงาน P50 · เดือนเริ่มงาน' : 'วันทำงาน P50 · เดือนส่ง First Review'}</p><svg viewBox="0 0 780 220" role="img" aria-label="Monthly progression; exact values and month controls below">{[min, (max + min) / 2, max].map((v, i) => <g key={i}><line x1="40" x2="770" y1={y(v)} y2={y(v)} stroke="var(--report-border)" /><text x="35" y={y(v) + 4} textAnchor="end" fontSize="11" fill="currentColor">{fmt(v)}</text></g>)}{values.map((v, i) => v == null ? null : <g key={i} onClick={() => onSelect(i + 1)} style={{
        cursor: 'pointer'
      }}><title>{flowMateProgressMonth(i)}: {fmt(v, unit)}; {flowMateProgressStatus(months[i].periodStatus)}</title><rect x={40 + (i + .5) * (730 / 12) - 17} y={Math.min(zero, y(v))} width="34" height={Math.max(2, Math.abs(zero - y(v)))} rx="3" fill={metric === 'volume' ? '#b9cbd7' : '#355e78'} opacity={selected === i + 1 ? 1 : .8} />{metric === 'volume' && months[i].aiDeliveredN > 0 && <rect x={40 + (i + .5) * (730 / 12) - 17} y={y(months[i].aiDeliveredN)} width="34" height={zero - y(months[i].aiDeliveredN)} rx="3" fill="#355e78" />}</g>)}</svg><div className="creative-report__month-controls">{values.map((v, i) => <button key={i} aria-pressed={selected === i + 1} aria-label={`${flowMateProgressMonth(i)} ${fmt(v, unit)} ${flowMateProgressStatus(months[i].periodStatus)}`} onClick={() => onSelect(i + 1)}><span>{flowMateProgressMonth(i)}</span><strong>{fmt(v, unit)}</strong></button>)}</div></div>;
}
function FlowMateCreativeEvidenceTable({
  rows,
  title
}) {
  const model = window.FlowMateCreativeReport;
  return <section><h3>{title}</h3>{!rows.length ? <p>ไม่มีงานในกลุ่มนี้</p> : <div className="creative-report__table-wrap"><table className="tbl"><thead><tr><th>Task</th><th>ผู้ส่ง First Draft</th><th>ผู้ส่ง Delivered</th><th>First Review</th><th>First Delivered</th><th>AI</th><th>หลักฐาน</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td className="creative-report__task-title">{r.displayId} · {r.title}</td><td>{r.owners.review.name} · {r.owners.review.role}</td><td>{r.owners.delivery.name} · {r.owners.delivery.role}</td><td>{model.dateKey(r.review_submitted_at) || '—'}</td><td>{model.dateKey(r.deliveryAt) || '—'}</td><td>{r.deliveredTags.join(', ') || 'ไม่มี tag บันทึก'}<small>{r.ai_evidence_source === 'delivery_snapshot' ? 'บันทึก ณ Delivered' : 'ข้อมูลปัจจุบัน'}</small></td><td><details><summary>ดูเวลาและข้อจำกัด</summary><p>Created: {r.created_at || '—'}<br />Assigned: {r.assigned_at || '—'}<br />Started: {r.acknowledgeAt || '—'}<br />Due ที่ใช้วัด: {r.evaluationDue || '—'}<br />Due ปัจจุบัน: {r.due_date || '—'}<br />Launch ที่ใช้วัด: {r.evaluationLaunch || '—'}</p><p>{flowMateTimingLabel(r.createdGroup)} (Created) · {flowMateTimingLabel(r.assignedGroup)} (Assigned)</p><p>{model.formatFlags(r.flags) || '—'}</p><p>Brief: {(r.brief_evidence || []).map(b => `${b.action} ${b.occurred_at}`).join('; ') || 'ยังไม่มีหลักฐาน'}</p></details></td></tr>)}</tbody></table></div>}</section>;
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
  return <div className="card"><div className="card__head"><span className="card__title">หลักฐานความพร้อมของบรีฟ</span></div><div className="card__body"><p>{accepted ? 'ยืนยันบรีฟครบแล้ว' : latest ? 'ส่งบรีฟแล้ว รอยืนยันความครบ' : 'ยังไม่มีหลักฐานการส่งบรีฟ'}</p>{error && <p role="alert">{error} <button className="btn btn--secondary" disabled={busy} onClick={() => setRetry(v => v + 1)}>ลองใหม่</button></p>}{state && (state.can_submit || state.can_accept && latest && !accepted) && <><label>รายละเอียดเวอร์ชัน / เหตุผลยืนยัน<textarea className="textarea" value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label><p>ยืนยันแทนเจ้าของงาน: ระบุเหตุผลในช่องด้านบน</p><div className="page__actions">{state.can_submit && <button className="btn btn--secondary" disabled={busy} onClick={() => act('submitted')}>ส่งบรีฟเวอร์ชันนี้</button>}{state.can_accept && latest && !accepted && <button className="btn btn--primary" disabled={busy} onClick={() => act('accepted')}>ยืนยันบรีฟครบ</button>}</div></>}{!!state?.history?.length && <details><summary>ประวัติบรีฟ ({state.history.length})</summary>{state.history.map(e => <p key={e.id}>{e.action === 'submitted' ? 'ส่งบรีฟ' : 'ยืนยันครบ'} · {e.occurred_at} · {e.reason}</p>)}</details>}</div></div>;
}
window.FlowMateCreativeBriefEvidence = FlowMateCreativeBriefEvidence;
