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
    <div className="page__header"><div><h1 className="page__title">{api.labels[view]}</h1><p className="page__sub">Track performance and review evidence</p></div><div className="page__actions"><button className="btn btn--secondary" onClick={()=>setRefresh(n=>n+1)}>Refresh</button><button className="btn btn--secondary" onClick={()=>onNav('kpi-legacy')}>Legacy Report</button></div></div>
    <div className="kpi-workspace__toolbar"><label>Report Month<input className="input" type="month" min="2026-01" max={api.dateKey(new Date().toISOString()).slice(0,7)} value={month} onChange={e=>{setMonth(e.target.value);try{api.writeMonthPreference(window.sessionStorage,window.FLOWMATE_CURRENT_USER||undefined,e.target.value)}catch{}}} /></label></div>
    <nav className="kpi-workspace__views" aria-label="KPI Views">{(/** @type {KpiView[]} */(['overview','creative','requester','task'])).map(id=><button className="kpi-workspace__view" aria-current={view===id?'page':undefined} key={id} onClick={()=>onNav(api.routes[id])}>{api.labels[id]}</button>)}</nav>
    {domains.map(domain=><FlowMateKpiDomainPanel key={`${domain}:${month}:${scope}:${currentScope}:${refresh}`} domain={domain} month={month} scope={currentScope} overview={view==='overview'} onOpen={onOpen} onNav={onNav} />)}

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
    if(!user||api.scopeKey(user)!==scope){setState({status:'denied',message:'Sign in with KPI access'});return()=>controller.abort();}
    api.load(window.flowmateSupabase,user,domain,month,controller.signal).then(data=>{if(active&&api.scopeKey(window.FLOWMATE_CURRENT_USER||undefined)===scope){setSnapshot(data);setState({status:'ready',message:''});}}).catch(error=>{if(active)setState({status:error.kind==='denied'?'denied':'error',message:error.message||'Unable to load report. Please retry',errorCode:typeof error.code==='string'?error.code:undefined});});
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
    try{const data=api.csv(snapshot,attention?{...metric,cohort:evidence.map(r=>r.fact)}:metric);const url=URL.createObjectURL(new Blob(['\ufeff'+data],{type:'text/csv;charset=utf-8'}));const name=`flowmate-${metric.id}-${month}${attention?'-missing-brief-link':''}.csv`;setExportFile({url,name,rows:evidence.length,context:exportContext});const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();}catch{setState({status:'error',message:'Unable to prepare CSV. Please retry'});}
  }
  if(state.status==='loading')return <section className="kpi-workspace__state" role="status"><h2>{api.labels[domain]}</h2><p>Loading report…</p><div className="kpi-workspace__skeleton" /></section>;
  if(state.status==='error'||state.status==='denied')return <section className="kpi-workspace__state" role="alert" data-kpi-error-code={state.errorCode}><h2>{api.labels[domain]} · {state.status==='denied'?'Access denied':'Unable to load'}</h2><p>{state.message}</p><button className="btn btn--secondary" onClick={()=>setReload(n=>n+1)}>Retry</button></section>;
  if(!snapshot||!valid||!metric)return <section className="kpi-workspace__state" role="status">Checking access…</section>;
  if(overview){const primary=report.find(m=>m.id===(domain==='creative'?'C04':domain==='requester'?'R03':'T07'))||metric;return <section className="kpi-workspace__overview"><div><h2>{api.labels[domain]}</h2><p>{primary.label} · {primary.note}</p></div><strong>{api.format(primary.value,primary.unit)}</strong><button className="btn btn--secondary" onClick={()=>onNav(api.routes[domain])}>View Details</button><p className="kpi-workspace__asof">Updated {dateTimeKpi(snapshot.asOf)}{snapshot.partial?' · Some data could not be loaded':''}</p></section>;}
  const primary=report.filter(m=>domain!=='task'||['T01','T10','T02','T04'].includes(m.id)).sort((a,b)=>Number(b.value!==null)-Number(a.value!==null));
  const weekly=weeklyBinsKpi(snapshot,metric);
  const max=Math.max(1,...weekly.map(w=>w.n));
  return <section className="kpi-workspace__domain" aria-label={api.labels[domain]} data-load-duration-ms={snapshot.loadDurationMs}>
    {savedNotice.current&&<p role="status">{savedNotice.current}</p>}

    {snapshot.partial&&<div className="kpi-workspace__notice" role="alert"><strong>Some data could not be loaded</strong><p>Only verified metrics are shown. Export is unavailable until loading completes</p>{Object.entries(snapshot.resources).filter(([,r])=>r.status==='error').map(([name,r])=><p key={name}>{sourceLabelKpi(name)}: {r.message}</p>)}<button className="btn btn--secondary" onClick={()=>setReload(n=>n+1)}>Retry</button></div>}
    <div className="kpi-workspace__filters">{domain==='creative'?<label>Owner at Completion<select className="select" aria-label="Owner at Completion" value={person} onChange={e=>{setPerson(e.target.value);setPage(0);setOpenDetail('')}}><option value="">All People</option>{people.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}<option value="unknown">Unknown Owner</option></select></label>:<label>Requester Team<select className="select" aria-label="Requester Team" value={team} onChange={e=>{setTeam(e.target.value);setPage(0);setOpenDetail('')}}><option value="">All Accessible Teams</option>{teams.map(t=><option key={t}>{t}</option>)}</select></label>}</div>
    {domain==='task'&&<div className="kpi-workspace__support">{report.filter(m=>['T03','T07','T05','T06'].includes(m.id)).map(m=><button className="kpi-workspace__support-row" key={m.id} onClick={()=>selectMetric(m,true)} aria-pressed={selected===m.id}><span>{m.id} · {m.label}<small>{m.note}</small></span><strong>{api.format(m.value,m.unit)}</strong></button>)}</div>}
    <dl className="kpi-workspace__metrics">{primary.map(m=><div key={m.id} data-available={m.value!==null}><dt>{m.id} · {m.label}</dt><dd className="kpi-workspace__value">{api.format(m.value,m.unit)}{m.value===null&&<small>No Data</small>}</dd><dd className="kpi-workspace__metric-description"><p>{m.note}</p><button className="kpi-workspace__text-button" aria-label={`View Evidence ${m.id} · ${m.label}`} onClick={()=>selectMetric(m,true)} aria-pressed={selected===m.id}>View Evidence</button></dd></div>)}</dl>
    <div className="kpi-workspace__evidence-head"><div><h2 ref={evidenceHead} tabIndex={-1}>{metric.id} · {metric.label}</h2><p>{metric.note}</p></div><label>Metric<select className="select" aria-label="Metric" value={metric.id} onChange={e=>{const m=report.find(m=>m.id===e.target.value);if(m)selectMetric(m)}}>{report.map(m=><option value={m.id} key={m.id}>{m.id} · {m.label}</option>)}</select></label></div>
    <div className="kpi-workspace__coverage"><strong>{metric.available?`${metric.eligible.length}/${metric.cohort.length} tasks ${metric.id==='R03'?'with a Brief Link':'with evidence'}`:'Insufficient data'}</strong><span>{Object.entries(metric.reasons).filter(([,n])=>n>0).map(([r,n])=>`${r}: ${n} tasks`).join(' · ')}</span></div>
    {metric.available&&metric.event!=='snapshot'&&metric.event!=='surveyAt'&&metric.id!=='R03'?<><h3>Work by Day of Month {month}</h3><div className="kpi-workspace__chart" role="img" aria-label={weekly.map(w=>`${w.label} ${w.n} tasks`).join(', ')}>{weekly.map(w=><div key={w.label}><b>{w.n} tasks</b><span aria-hidden="true" style={{height:`${w.n/max*110}px`}} /><small>{w.label}</small></div>)}</div></>:<p className="kpi-workspace__notice">{metric.value===null?(metric.cohort.length?metric.note:'No measurable work · '+metric.note):metric.id==='T12'?'Average score for the selected quarter':metric.id==='R03'?'Requests with a Brief Link':'Current open work'} · Missing values are shown as —</p>}
    <div className="kpi-workspace__evidence-actions"><button className="btn btn--secondary" disabled={!metric.available||snapshot.partial} onClick={exportEvidence}>Export CSV</button>{metric.id==='R03'&&metric.available&&<button className="btn btn--secondary" aria-pressed={attention} onClick={()=>{setAttention(v=>!v);setPage(0);setOpenDetail('');requestAnimationFrame(()=>region.current?.focus())}}>{attention?'All Requests':'Missing Brief Link'}</button>}</div>
    {exportFile&&exportFile.context===exportContext&&<div className="kpi-workspace__download"><p role="status">CSV ready · {exportFile.rows} filtered rows</p><a href={exportFile.url} download={exportFile.name}>Download {exportFile.name}</a></div>}
    <section ref={region} tabIndex={-1} aria-label="KPI Evidence" className="kpi-workspace__evidence"><h3>Evidence {metric.id} · {evidence.length} tasks</h3><div className="kpi-workspace__table-wrap" tabIndex={0} role="region" aria-label="Evidence Table"><table><caption>Select a Task ID to open its details</caption><thead><tr><th scope="col">Task</th><th scope="col">Team / Owner at Completion</th><th scope="col">Event</th><th scope="col">Evidence</th></tr></thead><tbody>{pageRows.map(({fact:f,result})=><React.Fragment key={f.id}><tr><td><button className="kpi-workspace__text-button" onClick={()=>onOpen(f.displayId,domain)}>{f.displayId}</button><p>{f.title}</p></td><td>{domain==='creative'?f.ownerName:f.team||'Unknown team'}</td><td>{api.dateKey(metric.event==='snapshot'?snapshot.asOf:f[metric.event])||'—'}<small>{metric.event==='snapshot'?f.status:metric.event==='createdAt'?'Request Created':'First Event'}</small></td><td>{result}<br/><button className="kpi-workspace__text-button" aria-expanded={openDetail===f.id} onClick={()=>setOpenDetail(openDetail===f.id?'':f.id)}>Evidence Details</button></td></tr>{openDetail===f.id&&<tr><td colSpan={4}><dl className="kpi-workspace__detail">{domain==='creative'?<><dt>1st Draft Submitted</dt><dd>{dateTimeKpi(f.firstDraftAt)}</dd><dt>Asset First Draft Due</dt><dd>{f.assetFirstDraftDue||'—'}</dd><dt>Final Asset Submitted</dt><dd>{dateTimeKpi(f.finalAssetAt)}</dd><dt>Asset Final/Approved Due</dt><dd>{f.assetFinalDue||'—'}</dd><dt>Delivered</dt><dd>{dateTimeKpi(f.deliveredAt)}</dd></>:<><dt>Review Submitted / Accepted</dt><dd>{dateTimeKpi(f.submitAt)} / {dateTimeKpi(f.approveAt)}</dd><dt>Brief Link</dt><dd>{/^https?:\/\//i.test(f.briefLink)?<a href={f.briefLink} target="_blank" rel="noopener noreferrer">{f.briefLink}</a>:f.briefLink||'—'}</dd><dt>Brief Ready</dt><dd>{dateTimeKpi(f.readyAt)}</dd></>}<dt>Status</dt><dd>{f.status}</dd></dl>{domain!=='creative'&&<FlowMateKpiEvidenceCapture fact={f} domain={domain} onSaved={()=>{savedNotice.current="Evidence saved. Report refreshed";setReload(n=>n+1)}} />}</td></tr>}</React.Fragment>)}</tbody></table></div>{!evidence.length&&<p className="kpi-workspace__notice">No matching work{metric.available?' within your access':' Evidence unavailable'}</p>}<div className="kpi-workspace__pager"><span>{evidence.length?`${page*12+1}–${Math.min((page+1)*12,evidence.length)} of ${evidence.length}`:'0 rows'}</span><div><button className="btn btn--secondary" disabled={page===0} onClick={()=>{setPage(n=>n-1);setOpenDetail('')}}>Previous</button><button className="btn btn--secondary" disabled={(page+1)*12>=evidence.length} onClick={()=>{setPage(n=>n+1);setOpenDetail('')}}>Next</button></div></div></section>

  </section>;
}
/** @param {string|null} value */
function dateTimeKpi(value){return value?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Bangkok'}).format(new Date(value)):'No evidence';}
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
 async function open(){setOpened(true);setState({loading:true,saving:false,message:'',failed:false});try{const value=await api.evidenceContext(window.flowmateSupabase,fact.id);setContext(value);const first=/** @type {import('./kpi-workspace').EvidenceInput['p_kind']|undefined} */(['deadline','ready','sla','csat'].find(k=>value['can_'+k]===true));if(first)setKind(first);setState({loading:false,saving:false,message:first?'':'No evidence actions available for this account or task',failed:false});}catch(error){setState({loading:false,saving:false,message:error instanceof Error?error.message:'Unable to check permissions',failed:true});}}
 /** @param {import('react').FormEvent<HTMLFormElement>} event */
 async function save(event){event.preventDefault();if(!context||!possible.includes(kind)||state.saving)return;
  const payload=/** @type {Omit<import('./kpi-workspace').EvidenceInput,'p_request_key'>} */({p_work_item_id:fact.id,p_kind:kind,p_reason:reason.trim()});
  if(kind==='deadline'){payload.p_endpoint=endpoint;payload.p_due_date=due;}
  if(kind==='sla'){payload.p_required_on=requiredOn;payload.p_sla_workdays=Number(sla);}
  if(kind==='ready')payload.p_brief_fingerprint=String(context.fingerprint||'');
  if(kind==='csat')payload.p_score=Number(score);
  const signature=JSON.stringify(payload);if(request.current.signature!==signature)request.current={signature,key:crypto.randomUUID()};
  setState({loading:false,saving:true,message:'Saving evidence…',failed:false});
  try{await api.recordEvidence(window.flowmateSupabase,{...payload,p_request_key:request.current.key});setState({loading:false,saving:false,message:'Evidence saved. Refreshing report',failed:false});onSaved();}catch(error){setState({loading:false,saving:false,message:error instanceof Error?error.message:'Unable to save',failed:true});}
 }
 const labels=/** @type {Record<string,string>} */({deadline:'Confirm Deadline',ready:'Confirm Brief Readiness',sla:'Agree Lead Time / SLA',csat:'Internal CSAT'});
 return <section className="kpi-workspace__capture" aria-label={`Record Evidence ${fact.displayId}`}>
  {!opened?<button className="btn btn--secondary" onClick={open}>Add KPI Evidence</button>:<>
   <div><h4>Record Evidence {fact.displayId}</h4><p>Records the current actor and time</p></div>
   <p role={state.failed?'alert':'status'}>{state.loading?'Checking permissions…':state.message}</p>
   {!state.loading&&possible.length>0&&<form onSubmit={save}>
    <label>Evidence Type<select className="input" value={kind} disabled={state.saving} onChange={e=>setKind(/** @type {import('./kpi-workspace').EvidenceInput['p_kind']} */(e.target.value))}>{possible.map(k=><option key={k} value={k}>{labels[k]}</option>)}</select></label>
    {kind==='deadline'&&<><label>Delivery Stage<select className="input" value={endpoint} disabled={state.saving} onChange={e=>setEndpoint(e.target.value)}>{(domain==='task'?[['task_submit','Review Submission'],['task_approve','Final Acceptance']]:[['creative_draft','First Draft'],['creative_delivery','Final Acceptance']]).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><label>Agreed Due Date<input className="input" type="date" required value={due} disabled={state.saving} onChange={e=>setDue(e.target.value)} /></label><p>The first agreed deadline remains the baseline</p></>}
    {kind==='sla'&&<><label>Required Date<input className="input" type="date" required min="2026-01-01" max="2026-12-31" value={requiredOn} disabled={state.saving} onChange={e=>setRequiredOn(e.target.value)} /></label><label>Required Lead Time (Business Days)<input className="input" type="number" required min="0" max="365" step="1" value={sla} disabled={state.saving} onChange={e=>setSla(e.target.value)} /></label><p>Using {api.organizationCalendar.version}; Agree before brief readiness is confirmed</p></>}
    {kind==='ready'&&<p>Confirm you have reviewed the latest brief and references. Reopen this form if the brief changes</p>}
    {kind==='csat'&&<><label>Cross-Team Satisfaction<select className="input" required value={score} disabled={state.saving} onChange={e=>setScore(e.target.value)}><option value="">Select Score (1–5)</option>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} / 5</option>)}</select></label><p>Requester feedback after acceptance</p></>}
    <label>{kind==='csat'?'Comments (Optional)':'Reason or Supporting Evidence'}<textarea className="input" required={kind!=='csat'} maxLength={2000} value={reason} disabled={state.saving} onChange={e=>setReason(e.target.value)} /></label>
    <button className="btn btn--primary" type="submit" disabled={state.saving}>{state.saving?'Saving…':'Save Evidence'}</button>
   </form>}
   {!state.saving&&<button className="btn btn--secondary" onClick={()=>setOpened(false)}>Close</button>}
  </>}
 </section>;
}
/** @param {string} key */
function sourceLabelKpi(key){const labels=/** @type {Record<string,string>} */({work:'Work Items',history:'Event History',brief:'Brief Evidence',briefLinks:'Brief Link',eventCandidates:'Monthly Events',milestoneCandidates:'Monthly Milestones',milestones:'Milestones',requested:'Monthly Requests',open:'Current Open Work',taskCandidates:'Monthly Task Events',evidence:'KPI Evidence',surveys:'Internal Surveys'});return labels[key]||'Data Source';}
/** @param {KpiSnapshot} snapshot @param {KpiMetric} metric */
function weeklyBinsKpi(snapshot,metric){
  const api=window.FlowMateKpi;
  const asOfDate=api.dateKey(snapshot.asOf);
  const monthDays=new Date(Number(snapshot.month.slice(0,4)),Number(snapshot.month.slice(5)),0).getDate();
  const observedDays=asOfDate.slice(0,7)===snapshot.month?Number(asOfDate.slice(8,10)):monthDays;
  return Array.from({length:Math.ceil(observedDays/7)},(_,i)=>({label:`${i*7+1}–${Math.min((i+1)*7,observedDays)}`,n:metric.cohort.filter(f=>Math.floor((Number(api.dateKey(metric.event==='snapshot'?snapshot.asOf:f[metric.event]).slice(8,10))-1)/7)===i).length}));
}
