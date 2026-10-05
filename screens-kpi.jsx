// @ts-check
/** @typedef {import('./kpi-workspace').Snapshot} KpiSnapshot */
/** @typedef {import('./kpi-workspace').Metric} KpiMetric */
/** @typedef {import('./kpi-workspace').Domain} KpiDomain */
/** @typedef {import('./kpi-workspace').KpiView} KpiView */

/** @param {{view:KpiView,onOpen:(id:string,domain:KpiDomain)=>void,onNav:(route:string)=>void}} props */
function FlowMateKpiWorkspaceScreen({view,onOpen,onNav}) {
  const api=window.FlowMateKpi;
  const [month,setMonth]=React.useState(()=>{try{return api.readMonthPreference(window.sessionStorage,window.FLOWMATE_CURRENT_USER||undefined)}catch{return api.dateKey(new Date().toISOString()).slice(0,7)}});
  const [refresh,setRefresh]=React.useState(0);
  const [scope,setScope]=React.useState(api.scopeKey(window.FLOWMATE_CURRENT_USER||undefined));
  React.useEffect(()=>{const changed=()=>{setScope(api.scopeKey(window.FLOWMATE_CURRENT_USER||undefined));setRefresh(n=>n+1)};window.addEventListener('flowmate:auth-changed',changed);window.addEventListener('flowmate:team-workspace-changed',changed);return()=>{window.removeEventListener('flowmate:auth-changed',changed);window.removeEventListener('flowmate:team-workspace-changed',changed)}},[api]);
  const currentScope=api.scopeKey(window.FLOWMATE_CURRENT_USER||undefined);
  const domains=view==='overview'?/** @type {KpiDomain[]} */(['creative','requester','task']):[view];
  return <div className="page kpi-workspace" data-testid="kpi-workspace">
    <div className="page__header"><div><h1 className="page__title">{api.labels[view]}</h1><p className="page__sub">อ่านผลของแต่ละขั้นตอน พร้อมตรวจหลักฐานที่ใช้คำนวณ</p></div><div className="page__actions"><button className="btn btn--secondary" onClick={()=>setRefresh(n=>n+1)}>รีเฟรชข้อมูล</button><button className="btn btn--secondary" onClick={()=>onNav('kpi-legacy')}>เปิดรายงานเดิม</button></div></div>
    <div className="kpi-workspace__toolbar"><label>เดือนรายงาน<input className="input" type="month" min="2026-01" max={api.dateKey(new Date().toISOString()).slice(0,7)} value={month} onChange={e=>{setMonth(e.target.value);try{api.writeMonthPreference(window.sessionStorage,window.FLOWMATE_CURRENT_USER||undefined,e.target.value)}catch{}}} /></label><p>Asia/Bangkok · {month===api.dateKey(new Date().toISOString()).slice(0,7)?'เดือนนี้ถึงเวลาอ่านข้อมูล (MTD)':'เดือนย้อนหลัง'}<br/>งานเปิดแสดง snapshot ปัจจุบันเสมอ</p></div>
    <nav className="kpi-workspace__views" aria-label="มุมมอง KPI">{(/** @type {KpiView[]} */(['overview','creative','requester','task'])).map(id=><button className="kpi-workspace__view" aria-current={view===id?'page':undefined} key={id} onClick={()=>onNav(api.routes[id])}>{api.labels[id]}</button>)}</nav>
    {domains.map(domain=><FlowMateKpiDomainPanel key={`${domain}:${month}:${scope}:${currentScope}:${refresh}`} domain={domain} month={month} scope={currentScope} overview={view==='overview'} onOpen={onOpen} onNav={onNav} />)}
    <p className="kpi-workspace__foot">ข้อมูลตามสิทธิ์ KPI เดิม · ไม่รวมเป็นคะแนนบุคคล · ตัด TEST ด้วย registry ของระบบและตัดงานที่สถานะปัจจุบันยกเลิก · งานจบที่ archive ยังคงอยู่เมื่อ source อนุญาต · {api.version}</p>
  </div>;
}
/** @param {{domain:KpiDomain,month:string,scope:string,overview:boolean,onOpen:(id:string,domain:KpiDomain)=>void,onNav:(route:string)=>void}} props */
function FlowMateKpiDomainPanel({domain,month,scope,overview,onOpen,onNav}) {
  const api=window.FlowMateKpi;
  const [snapshot,setSnapshot]=React.useState(/** @type {KpiSnapshot|null} */(null));
  const [state,setState]=React.useState(/** @type {{status:string,message:string,errorCode?:string}} */({status:'loading',message:''}));
  const [reload,setReload]=React.useState(0);
  const [person,setPerson]=React.useState('');
  const [team,setTeam]=React.useState('');
  const [selected,setSelected]=React.useState(domain==='creative'?'C04':domain==='requester'?'R03':'T03');
  const [page,setPage]=React.useState(0);
  const [attention,setAttention]=React.useState(false);
  const [openDetail,setOpenDetail]=React.useState('');
  const [exportFile,setExportFile]=React.useState(/** @type {{url:string,name:string,rows:number,context:string}|null} */(null));
  const region=React.useRef(/** @type {HTMLElement|null} */(null));
  const savedNotice=React.useRef('');
  const evidenceHead=React.useRef(/** @type {HTMLHeadingElement|null} */(null));
  React.useEffect(()=>{
    const controller=new AbortController();let active=true;setSnapshot(null);setState({status:'loading',message:''});
    const user=window.FLOWMATE_CURRENT_USER;
    if(!user||api.scopeKey(user)!==scope){setState({status:'denied',message:'กรุณาเข้าสู่ระบบด้วยบัญชีที่มีสิทธิ์ KPI เดิม'});return()=>controller.abort();}
    api.load(window.flowmateSupabase,user,domain,month,controller.signal).then(data=>{if(active&&api.scopeKey(window.FLOWMATE_CURRENT_USER||undefined)===scope){setSnapshot(data);setState({status:'ready',message:''});}}).catch(error=>{if(active)setState({status:error.kind==='denied'?'denied':'error',message:error.message||'โหลดรายงานไม่สำเร็จ กรุณาลองใหม่',errorCode:typeof error.code==='string'?error.code:undefined});});
    return()=>{active=false;controller.abort();};
  },[api,domain,month,scope,reload]);
  const valid=snapshot?.month===month&&snapshot.scope===scope&&scope===api.scopeKey(window.FLOWMATE_CURRENT_USER||undefined);
  const report=valid&&snapshot?api.metrics(snapshot,{person,team}):[];
  const metric=report.find(m=>m.id===selected)||report[0];
  const allFacts=valid&&snapshot?api.facts(snapshot):[];
  const people=[...new Map(allFacts.filter(f=>f.ownerId).map(f=>[f.ownerId,{id:f.ownerId,name:f.ownerName}])).values()];
  const teams=[...new Set(allFacts.map(f=>f.team).filter(Boolean))].sort();
  const evidence=metric?api.metricRows(metric).filter(row=>!attention||metric.id!=='R03'||!row.fact.briefLink):[];
  const pageRows=evidence.slice(page*12,(page+1)*12);
  const exportContext=JSON.stringify([scope,month,snapshot?.asOf,metric?.id,person,team,attention]);
  React.useEffect(()=>{setExportFile(null);},[exportContext]);
  React.useEffect(()=>()=>{if(exportFile)URL.revokeObjectURL(exportFile.url);},[exportFile]);
  /** @param {KpiMetric} target @param {boolean} [moveFocus] */
  function selectMetric(target,moveFocus=false){setSelected(target.id);setPage(0);setAttention(false);setOpenDetail('');if(moveFocus)requestAnimationFrame(()=>evidenceHead.current?.focus());}
  function exportEvidence(){
    if(!snapshot||!metric||snapshot.partial||!metric.available)return;
    try{const data=api.csv(snapshot,attention?{...metric,cohort:evidence.map(r=>r.fact)}:metric);const url=URL.createObjectURL(new Blob(['\ufeff'+data],{type:'text/csv;charset=utf-8'}));const name=`flowmate-${metric.id}-${month}${attention?'-missing-brief-link':''}.csv`;setExportFile({url,name,rows:evidence.length,context:exportContext});const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();}catch{setState({status:'error',message:'เตรียมไฟล์ CSV ไม่สำเร็จ กรุณาลองใหม่'});}
  }
  if(state.status==='loading')return <section className="kpi-workspace__state" role="status"><h2>{api.labels[domain]}</h2><p>กำลังตรวจสิทธิ์และโหลดหลักฐานของเดือนที่เลือก…</p><div className="kpi-workspace__skeleton" /></section>;
  if(state.status==='error'||state.status==='denied')return <section className="kpi-workspace__state" role="alert" data-kpi-error-code={state.errorCode}><h2>{api.labels[domain]} · {state.status==='denied'?'ไม่มีสิทธิ์':'โหลดไม่สำเร็จ'}</h2><p>{state.message}</p><button className="btn btn--secondary" onClick={()=>setReload(n=>n+1)}>ลองโหลดอีกครั้ง</button></section>;
  if(!snapshot||!valid||!metric)return <section className="kpi-workspace__state" role="status">กำลังตรวจขอบเขตผู้ใช้ใหม่…</section>;
  if(overview){const primary=report.find(m=>m.id===(domain==='creative'?'C04':domain==='requester'?'R03':'T07'))||metric;return <section className="kpi-workspace__overview"><div><h2>{api.labels[domain]}</h2><p>{primary.label} · {primary.note}</p></div><strong>{api.format(primary.value,primary.unit)}</strong><button className="btn btn--secondary" onClick={()=>onNav(api.routes[domain])}>เปิดรายละเอียด</button><p className="kpi-workspace__asof">อ่านข้อมูล {dateTimeKpi(snapshot.asOf)}{snapshot.partial?' · บางแหล่งโหลดไม่ครบ':''}</p></section>;}
  const primary=report.filter(m=>domain!=='task'||['T01','T10','T02','T04'].includes(m.id)).sort((a,b)=>Number(b.value!==null)-Number(a.value!==null));
  const weekly=weeklyBinsKpi(snapshot,metric);
  const max=Math.max(1,...weekly.map(w=>w.n));
  return <section className="kpi-workspace__domain" aria-label={api.labels[domain]} data-load-duration-ms={snapshot.loadDurationMs}>
    {savedNotice.current&&<p role="status">{savedNotice.current}</p>}
    <div className="kpi-workspace__context"><span>อ่านข้อมูล {dateTimeKpi(snapshot.asOf)}</span><span>{domain==='requester'?'ชุดคำขอที่สร้างในเดือนนี้':'เหตุการณ์ครั้งแรกตามเดือนที่เลือก'} · Asia/Bangkok</span></div>
    {snapshot.partial&&<div className="kpi-workspace__notice" role="alert"><strong>บางแหล่งโหลดไม่ครบ</strong><p>แสดงเฉพาะค่าที่หลักฐานตรวจครบ และปิด Export รายงานนี้</p>{Object.entries(snapshot.resources).filter(([,r])=>r.status==='error').map(([name,r])=><p key={name}>{sourceLabelKpi(name)}: {r.message}</p>)}<button className="btn btn--secondary" onClick={()=>setReload(n=>n+1)}>ลองโหลดอีกครั้ง</button></div>}
    <div className="kpi-workspace__filters">{domain==='creative'?<label>เจ้าของ ณ ส่งมอบ<select className="select" aria-label="เจ้าของ ณ ส่งมอบ" value={person} onChange={e=>{setPerson(e.target.value);setPage(0);setOpenDetail('')}}><option value="">ทุกคน</option>{people.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}<option value="unknown">ยังไม่มีหลักฐานเจ้าของ</option></select></label>:<label>ทีมผู้ขอ (ข้อมูลปัจจุบัน)<select className="select" aria-label="ทีมผู้ขอ (ข้อมูลปัจจุบัน)" value={team} onChange={e=>{setTeam(e.target.value);setPage(0);setOpenDetail('')}}><option value="">ทุกทีมตามสิทธิ์</option>{teams.map(t=><option key={t}>{t}</option>)}</select></label>}</div>
    {domain==='task'&&<div className="kpi-workspace__support">{report.filter(m=>['T03','T07','T05','T06'].includes(m.id)).map(m=><button className="kpi-workspace__support-row" key={m.id} onClick={()=>selectMetric(m,true)} aria-pressed={selected===m.id}><span>{m.id} · {m.label}<small>{m.note}</small></span><strong>{api.format(m.value,m.unit)}</strong></button>)}<p>ส่งตรวจไม่เท่ากับรับมอบ · Legacy Delivered ไม่เพิ่ม Throughput ที่ต้องมี explicit approve · งานตามแผนต้องมีประเภท ณ intake · Internal CSAT ต้องมีแบบประเมินระหว่างแผนก</p></div>}
    <dl className="kpi-workspace__metrics">{primary.map(m=><div key={m.id} data-available={m.value!==null}><dt>{m.id} · {m.label}</dt><dd className="kpi-workspace__value">{api.format(m.value,m.unit)}{m.value===null&&<small>ยังไม่มีค่า</small>}</dd><dd className="kpi-workspace__metric-description"><p>{m.note}</p><button className="kpi-workspace__text-button" aria-label={`ตรวจหลักฐาน ${m.id} · ${m.label}`} onClick={()=>selectMetric(m,true)} aria-pressed={selected===m.id}>ตรวจหลักฐาน</button></dd></div>)}</dl>
    <div className="kpi-workspace__evidence-head"><div><h2 ref={evidenceHead} tabIndex={-1}>{metric.id} · {metric.label}</h2><p>{metric.note}</p></div><label>ตัววัดที่ตรวจ<select className="select" aria-label="ตัววัดที่ตรวจ" value={metric.id} onChange={e=>{const m=report.find(m=>m.id===e.target.value);if(m)selectMetric(m)}}>{report.map(m=><option value={m.id} key={m.id}>{m.id} · {m.label}</option>)}</select></label></div>
    <div className="kpi-workspace__coverage"><strong>{metric.available?`${metric.eligible.length}/${metric.cohort.length} งาน${metric.id==='R03'?'มี Brief Link':'มีหลักฐานตามนิยาม'}`:'ยังคำนวณ KPI นี้ไม่ได้'}</strong><span>{Object.entries(metric.reasons).filter(([,n])=>n>0).map(([r,n])=>`${r}: ${n} งาน`).join(' · ')}</span></div>
    {metric.available&&metric.event!=='snapshot'&&metric.event!=='surveyAt'&&metric.id!=='R03'?<><h3>จำนวนงานในชุดที่ตรวจ · วันที่ของเดือน {month}</h3><div className="kpi-workspace__chart" role="img" aria-label={weekly.map(w=>`${w.label} ${w.n} งาน`).join(', ')}>{weekly.map(w=><div key={w.label}><b>{w.n} งาน</b><span aria-hidden="true" style={{height:`${w.n/max*110}px`}} /><small>{w.label}</small></div>)}</div></>:<p className="kpi-workspace__notice">{metric.value===null?(metric.cohort.length?metric.note:'ยังไม่มีงานที่คำนวณได้ · '+metric.note):metric.id==='T12'?'คะแนนเฉลี่ยจากคำตอบภายในไตรมาสที่เลือก':metric.id==='R03'?'ตรวจว่ามีค่าในช่อง Brief Link ไม่ตรวจเนื้อหาบรีฟหรือการยืนยันของผู้รับ':'งานเปิด ณ เวลาอ่านข้อมูล ไม่ใช่ backlog ย้อนหลัง'} · ค่าที่หลักฐานยังไม่ครบจะแสดงเป็น —</p>}
    <div className="kpi-workspace__evidence-actions"><button className="btn btn--secondary" disabled={!metric.available||snapshot.partial} onClick={exportEvidence}>Export CSV หลักฐาน</button>{metric.id==='R03'&&metric.available&&<button className="btn btn--secondary" aria-pressed={attention} onClick={()=>{setAttention(v=>!v);setPage(0);setOpenDetail('');requestAnimationFrame(()=>region.current?.focus())}}>{attention?'ดูคำขอทั้งหมด':'ดูคำขอที่ยังไม่มี Brief Link'}</button>}</div>
    {exportFile&&exportFile.context===exportContext&&<div className="kpi-workspace__download"><p role="status">ไฟล์ CSV พร้อมดาวน์โหลด · {exportFile.rows} รายการตามตัวกรอง · ใช้ลิงก์ด้านล่างเพื่อดาวน์โหลดอีกครั้ง</p><a href={exportFile.url} download={exportFile.name}>ดาวน์โหลด {exportFile.name}</a></div>}
    <section ref={region} tabIndex={-1} aria-label="หลักฐาน KPI" className="kpi-workspace__evidence"><h3>หลักฐาน {metric.id} · {evidence.length} งาน</h3><div className="kpi-workspace__table-wrap" tabIndex={0} role="region" aria-label="ตารางหลักฐาน เลื่อนแนวนอนได้"><table><caption>รายการตามตัวกรองและชุดงานของ KPI ที่เลือก · กด Task ID เปิดงานตามสิทธิ์เดิม</caption><thead><tr><th scope="col">Task / งาน</th><th scope="col">ทีม / เจ้าของ ณ ส่งมอบ</th><th scope="col">เหตุการณ์</th><th scope="col">หลักฐาน</th></tr></thead><tbody>{pageRows.map(({fact:f,result})=><React.Fragment key={f.id}><tr><td><button className="kpi-workspace__text-button" onClick={()=>onOpen(f.displayId,domain)}>{f.displayId}</button><p>{f.title}</p></td><td>{domain==='creative'?f.ownerName:f.team||'ยังไม่มีทีม'}</td><td>{api.dateKey(metric.event==='snapshot'?snapshot.asOf:f[metric.event])||'—'}<small>{metric.event==='snapshot'?f.status:metric.event==='createdAt'?'สร้างคำขอ':'เหตุการณ์ครั้งแรก'}</small></td><td>{result}<br/><button className="kpi-workspace__text-button" aria-expanded={openDetail===f.id} onClick={()=>setOpenDetail(openDetail===f.id?'':f.id)}>รายละเอียดหลักฐาน</button></td></tr>{openDetail===f.id&&<tr><td colSpan={4}><dl className="kpi-workspace__detail"><dt>ส่งร่าง / ส่งมอบครั้งแรก</dt><dd>{dateTimeKpi(f.reviewAt)} / {dateTimeKpi(f.deliveredAt)}</dd><dt>ส่งตรวจ / ผู้ขอรับมอบครั้งแรก</dt><dd>{dateTimeKpi(f.submitAt)} / {dateTimeKpi(f.approveAt)}</dd>{domain==='requester'&&<><dt>Brief Link ณ เวลาอ่านข้อมูล</dt><dd>{/^https?:\/\//i.test(f.briefLink)?<a href={f.briefLink} target="_blank" rel="noopener noreferrer">{f.briefLink}</a>:f.briefLink||'ยังไม่มี Brief Link'}</dd></>}<dt>บรีฟพร้อมที่ผู้รับยืนยัน</dt><dd>{snapshot.resources.brief?.status==='ready'?dateTimeKpi(f.readyAt):'ยังไม่มีหลักฐานบรีฟที่อ่านได้'} · ต้องผูกกับบรีฟรุ่นล่าสุด</dd><dt>กำหนดส่งร่างเดิมที่รอตรวจ</dt><dd>{f.draftBaselineCandidate||'ยังไม่มีหลักฐานที่อ่านได้'} · ยังไม่ใช้ให้คะแนน</dd><dt>ส่งตรวจ → รับมอบ (เวลารวม)</dt><dd>{f.submitAt&&f.approveAt&&Date.parse(f.approveAt)>=Date.parse(f.submitAt)?api.format((Date.parse(f.approveAt)-Date.parse(f.submitAt))/86400000,'days'):'—'} · รวมช่วงรอ/แก้ไข ไม่ใช่ชั่วโมงลงแรง</dd><dt>ขอบเขต</dt><dd>ข้อมูลตามสิทธิ์ ณ เวลาอ่าน · สถานะปัจจุบัน {f.status} · ไม่ใช้เจ้าของปัจจุบันแทนเจ้าของตอนส่งมอบ</dd></dl><FlowMateKpiEvidenceCapture fact={f} domain={domain} onSaved={()=>{savedNotice.current="บันทึกหลักฐานแล้ว · ค่าด้านล่างอ่านใหม่จากข้อมูลที่มี";setReload(n=>n+1)}} /></td></tr>}</React.Fragment>)}</tbody></table></div>{!evidence.length&&<p className="kpi-workspace__notice">ไม่มีรายการในชุดงานที่อ่านได้{metric.available?' ไม่ได้หมายความว่าไม่มีงานทั้งองค์กร':' หลักฐานของตัววัดนี้ยังไม่พร้อม'}</p>}<div className="kpi-workspace__pager"><span>{evidence.length?`${page*12+1}–${Math.min((page+1)*12,evidence.length)} จาก ${evidence.length}`:'0 รายการ'}</span><div><button className="btn btn--secondary" disabled={page===0} onClick={()=>{setPage(n=>n-1);setOpenDetail('')}}>ก่อนหน้า</button><button className="btn btn--secondary" disabled={(page+1)*12>=evidence.length} onClick={()=>{setPage(n=>n+1);setOpenDetail('')}}>ถัดไป</button></div></div></section>
    <details className="kpi-workspace__definition"><summary>นิยามและข้อจำกัดการอ่าน</summary><p>เดือนใช้เวลา Bangkok แยก first Review, first Delivered, first submit และ first approve ไม่รวมเป็น funnel เดียวกัน วันทำงานทุกทีมใช้จันทร์–ศุกร์และวันหยุดองค์กร 19 วัน ปี 2026 แสดงเวลารวมแยกจากวันทำงาน SLA และกำหนดส่งแต่ละขั้นยังต้องมีหลักฐานยืนยันก่อนใช้</p><p>R03 วัดการมี Brief Link ปัจจุบันในคำขอที่สร้างในเดือนที่เลือก ไม่ใช่การรับรองเนื้อหาบรีฟครบ · Requester ระยะแรกใช้เดือนที่สร้างคำขอ เพราะยังไม่มี request-submitted timestamp แยก การรอผู้รับยืนยันอาจกระทบ lead time จึงไม่สรุปความล่าช้าว่าเป็นความผิดฝ่ายผู้ขอ</p><p>ตัดงานที่สถานะปัจจุบันยกเลิกตาม as-of; จำนวนเดือนเก่าอาจเปลี่ยนหลังยกเลิก งาน archived ที่จบยังอยู่เมื่อ source คืนให้ TEST ใช้ classifier เดิม ไม่เดาจากชื่อ · Task TEST ที่ตัด {snapshot.testExcluded} งาน</p></details>
  </section>;
}
/** @param {string|null} value */
function dateTimeKpi(value){return value?new Intl.DateTimeFormat('th-TH',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(value)):'ยังไม่มีหลักฐาน';}
window.FlowMateKpiWorkspaceScreen=FlowMateKpiWorkspaceScreen;
/** @param {{fact:import('./kpi-workspace').Fact,domain:KpiDomain,onSaved:()=>void}} props */
function FlowMateKpiEvidenceCapture({fact,domain,onSaved}){
 const api=window.FlowMateKpi;
 const [opened,setOpened]=React.useState(false);
 const [context,setContext]=React.useState(/** @type {import('./kpi-workspace').Raw|null} */(null));
 const [state,setState]=React.useState({loading:false,saving:false,message:'',failed:false});
 const [kind,setKind]=React.useState(/** @type {import('./kpi-workspace').EvidenceInput['p_kind']} */('deadline'));
 const [endpoint,setEndpoint]=React.useState(domain==='task'?'task_submit':'creative_draft');
 const [due,setDue]=React.useState(''),[requiredOn,setRequiredOn]=React.useState(''),[sla,setSla]=React.useState(''),[score,setScore]=React.useState(''),[reason,setReason]=React.useState('');
 const request=React.useRef({signature:'',key:''});
 const possible=context?(['deadline','ready','sla','csat']).filter(k=>context['can_'+k]===true):[];
 async function open(){setOpened(true);setState({loading:true,saving:false,message:'',failed:false});try{const value=await api.evidenceContext(window.flowmateSupabase,fact.id);setContext(value);const first=/** @type {import('./kpi-workspace').EvidenceInput['p_kind']|undefined} */(['deadline','ready','sla','csat'].find(k=>value['can_'+k]===true));if(first)setKind(first);setState({loading:false,saving:false,message:first?'':'ยังไม่มีรายการที่บัญชีนี้บันทึกได้ งานจบแล้วหรือไม่มีสิทธิ์ฝั่งผู้รับ',failed:false});}catch(error){setState({loading:false,saving:false,message:error instanceof Error?error.message:'ตรวจสิทธิ์ไม่สำเร็จ',failed:true});}}
 /** @param {import('react').FormEvent<HTMLFormElement>} event */
 async function save(event){event.preventDefault();if(!context||!possible.includes(kind)||state.saving)return;
  const payload=/** @type {Omit<import('./kpi-workspace').EvidenceInput,'p_request_key'>} */({p_work_item_id:fact.id,p_kind:kind,p_reason:reason.trim()});
  if(kind==='deadline'){payload.p_endpoint=endpoint;payload.p_due_date=due;}
  if(kind==='sla'){payload.p_required_on=requiredOn;payload.p_sla_workdays=Number(sla);}
  if(kind==='ready')payload.p_brief_fingerprint=String(context.fingerprint||'');
  if(kind==='csat')payload.p_score=Number(score);
  const signature=JSON.stringify(payload);if(request.current.signature!==signature)request.current={signature,key:crypto.randomUUID()};
  setState({loading:false,saving:true,message:'กำลังบันทึกหลักฐาน…',failed:false});
  try{await api.recordEvidence(window.flowmateSupabase,{...payload,p_request_key:request.current.key});setState({loading:false,saving:false,message:'บันทึกหลักฐานแล้ว กำลังอ่าน KPI ใหม่',failed:false});onSaved();}catch(error){setState({loading:false,saving:false,message:error instanceof Error?error.message:'บันทึกไม่สำเร็จ',failed:true});}
 }
 const labels=/** @type {Record<string,string>} */({deadline:'ยืนยันกำหนดส่ง',ready:'ผู้รับยืนยันบรีฟครบ',sla:'ตกลง Lead Time / SLA',csat:'ประเมินความพึงพอใจภายใน'});
 return <section className="kpi-workspace__capture" aria-label={`เก็บหลักฐาน ${fact.displayId}`}>
  {!opened?<button className="btn btn--secondary" onClick={open}>เพิ่มหลักฐาน KPI</button>:<>
   <div><h4>เก็บหลักฐาน {fact.displayId}</h4><p>บันทึกเวลาและผู้ยืนยันจากระบบ เก็บประวัติเดิมไว้ · ไม่สร้างคะแนนย้อนหลัง</p></div>
   <p role={state.failed?'alert':'status'}>{state.loading?'กำลังตรวจสิทธิ์บันทึก…':state.message}</p>
   {!state.loading&&possible.length>0&&<form onSubmit={save}>
    <label>ประเภทหลักฐาน<select className="input" value={kind} disabled={state.saving} onChange={e=>setKind(/** @type {import('./kpi-workspace').EvidenceInput['p_kind']} */(e.target.value))}>{possible.map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
    {kind==='deadline'&&<><label>ขั้นที่ตกลงส่ง<select className="input" value={endpoint} disabled={state.saving} onChange={e=>setEndpoint(e.target.value)}>{(domain==='task'?[['task_submit','ส่งให้ตรวจ'],['task_approve','ผู้ขอรับมอบจบ']]:[['creative_draft','ส่งร่าง'],['creative_delivery','ส่งมอบจบ']]).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><label>วันกำหนดที่ตกลง<input className="input" type="date" required value={due} disabled={state.saving} onChange={e=>setDue(e.target.value)} /></label><p>กำหนดแรกใช้เป็น baseline; การบันทึกใหม่เก็บเป็นประวัติ ไม่แทนที่กำหนดเดิม</p></>}
    {kind==='sla'&&<><label>วันที่ต้องใช้ที่ตกลง<input className="input" type="date" required min="2026-01-01" max="2026-12-31" value={requiredOn} disabled={state.saving} onChange={e=>setRequiredOn(e.target.value)} /></label><label>ต้องบรีฟล่วงหน้ากี่วันทำงาน<input className="input" type="number" required min="0" max="365" step="1" value={sla} disabled={state.saving} onChange={e=>setSla(e.target.value)} /></label><p>ใช้ {api.organizationCalendar.version}; ตกลงก่อนผู้รับยืนยันบรีฟครบ</p></>}
    {kind==='ready'&&<p>ยืนยันว่าได้ตรวจชื่อ ข้อกำหนด และลิงก์อ้างอิงในบรีฟล่าสุดแล้ว การรับคำขอกับการยืนยันบรีฟครบเป็นคนละขั้น หากบรีฟเปลี่ยนระบบจะให้เปิดตรวจใหม่</p>}
    {kind==='csat'&&<><label>ความพึงพอใจในการทำงานร่วมกันระหว่างทีม<select className="input" required value={score} disabled={state.saving} onChange={e=>setScore(e.target.value)}><option value="">เลือกคะแนน 1–5</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} / 5</option>)}</select></label><p>สำหรับผู้ขอหลังรับมอบงาน · นับในไตรมาสที่ตอบแบบประเมิน · ไม่ใช่ NPS ของผู้เล่นเกม</p></>}
    <label>{kind==='csat'?'ความคิดเห็น (ไม่บังคับ)':'เหตุผลหรือหลักฐานที่ยืนยัน'}<textarea className="input" required={kind!=='csat'} maxLength={2000} value={reason} disabled={state.saving} onChange={e=>setReason(e.target.value)} /></label>
    <button className="btn btn--primary" type="submit" disabled={state.saving}>{state.saving?'กำลังบันทึก…':'บันทึกหลักฐาน'}</button>
   </form>}
   {!state.saving&&<button className="btn btn--secondary" onClick={()=>setOpened(false)}>ปิดส่วนเก็บหลักฐาน</button>}
  </>}
 </section>;
}
/** @param {string} key */
function sourceLabelKpi(key){const labels=/** @type {Record<string,string>} */({work:'รายการงาน',history:'ประวัติเหตุการณ์',brief:'หลักฐานบรีฟ',briefLinks:'Brief Link',eventCandidates:'เหตุการณ์ของเดือน',milestoneCandidates:'จุดส่งงานของเดือน',milestones:'จุดส่งงานย้อนหลัง',requested:'คำขอของเดือน',open:'งานเปิดปัจจุบัน',taskCandidates:'งานจากเหตุการณ์ของเดือน',evidence:'หลักฐานยืนยัน KPI',surveys:'แบบประเมินภายใน'});return labels[key]||'แหล่งข้อมูล';}
/** @param {KpiSnapshot} snapshot @param {KpiMetric} metric */
function weeklyBinsKpi(snapshot,metric){
  const api=window.FlowMateKpi;
  const asOfDate=api.dateKey(snapshot.asOf);
  const monthDays=new Date(Number(snapshot.month.slice(0,4)),Number(snapshot.month.slice(5)),0).getDate();
  const observedDays=asOfDate.slice(0,7)===snapshot.month?Number(asOfDate.slice(8,10)):monthDays;
  return Array.from({length:Math.ceil(observedDays/7)},(_,i)=>({label:`${i*7+1}–${Math.min((i+1)*7,observedDays)}`,n:metric.cohort.filter(f=>Math.floor((Number(api.dateKey(metric.event==='snapshot'?snapshot.asOf:f[metric.event]).slice(8,10))-1)/7)===i).length}));
}
