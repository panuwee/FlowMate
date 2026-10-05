/* Monthly KPI workspace. Optional evidence capture uses explicit, permission-checked RPCs. */
export type KpiView = 'overview'|'creative'|'requester'|'task';
export type Domain = Exclude<KpiView,'overview'>;
export type Raw = Record<string,unknown>;
export interface Viewer {id:string;role?:string;is_active?:boolean;can_access_all_teams?:boolean;canAccessAllTeams?:boolean;accessible_teams?:string[]}
interface QueryResult {data:Raw[]|null;count:number|null;error:{code?:string;message?:string}|null}
export interface Query extends PromiseLike<QueryResult> {
 select(fields:string,options:{count:'exact'}):Query;eq(field:string,value:string):Query;in(field:string,values:string[]):Query;
 gte(field:string,value:string):Query;lt(field:string,value:string):Query;lte(field:string,value:string):Query;
 is(field:string,value:null):Query;not(field:string,operator:string,value:string):Query;
 contains(field:string,value:Raw):Query;order(field:string,options:{ascending:boolean}):Query;range(start:number,end:number):Query;abortSignal(signal:AbortSignal):Query;
}
export interface Client {from(relation:string):Query;rpc(name:string,args?:Raw):PromiseLike<{data:unknown;error:{code?:string;message?:string}|null}>}
export interface Resource {status:'ready'|'error'|'unavailable';rows:Raw[];message:string;errorCode?:string}
export interface Snapshot {domain:Domain;month:string;asOf:string;scope:string;resources:Record<string,Resource>;partial:boolean;testExcluded:number;loadDurationMs:number}
export interface Fact {id:string;displayId:string;title:string;status:string;team:string;createdAt:string|null;requestSubmittedAt:string|null;ownerId:string;ownerName:string;reviewAt:string|null;deliveredAt:string|null;submitAt:string|null;approveAt:string|null;startedAt:string|null;surveyAt:string|null;readyAt:string|null;briefLink:string;firstDraftAt:string|null;finalAssetAt:string|null;assetFirstDraftDue:string|null;assetFinalDue:string|null;draftBaselineCandidate:string|null;events:Raw[];milestones:Raw[];brief:Raw[]}
export interface Metric {id:string;label:string;value:number|null;unit:'count'|'percent'|'days'|'score';note:string;cohort:Fact[];eligible:Fact[];reasons:Record<string,number>;event:'firstDraftAt'|'finalAssetAt'|'reviewAt'|'deliveredAt'|'submitAt'|'approveAt'|'createdAt'|'requestSubmittedAt'|'surveyAt'|'snapshot';available:boolean;results?:Record<string,string>}
export class KpiError extends Error {constructor(public kind:'denied'|'load',message:string,public code?:string){super(message);this.name='KpiError';}}
const str=(value:unknown):string=>typeof value==='string'?value:'';
const sid=(value:unknown):string=>typeof value==='string'||typeof value==='number'?String(value):'';
const obj=(value:unknown):Raw=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Raw:{};
const timestamp=(value:unknown):string|null=>str(value)&&Number.isFinite(Date.parse(str(value)))?str(value):null;
const DAY=86400000;
export const version='kpi-local-20261005-asset-links-v4';
// User-confirmed organization calendar, all teams Mon-Fri; never extrapolate to another year.
export const organizationCalendar={version:'organization-2026-v1',start:'2026-01-01',end:'2026-12-31',source:'Holiday List!A21:D39',holidays:['2026-01-01','2026-01-02','2026-02-17','2026-03-03','2026-04-06','2026-04-13','2026-04-14','2026-04-15','2026-05-01','2026-05-04','2026-06-01','2026-06-03','2026-07-28','2026-07-29','2026-08-12','2026-10-13','2026-10-23','2026-12-07','2026-12-31']};
export function workingDays(start:string|null,end:string|null):number|null {
 if(!start||!end||!timestamp(start)||!timestamp(end)||Date.parse(end)<Date.parse(start))return null;
 if(dateKey(start)<organizationCalendar.start||dateKey(end)>organizationCalendar.end)return null;
 let total=0,at=Date.parse(start),finish=Date.parse(end);
 while(at<finish){const local=new Date(at+7*3600000),midnight=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate())-7*3600000,next=Math.min(midnight+DAY,finish),weekday=local.getUTCDay();if(weekday!==0&&weekday!==6&&!organizationCalendar.holidays.includes(dateKey(new Date(at).toISOString())))total+=(next-at)/DAY;at=next;}
 return total;
}
export const labels:Record<KpiView,string>={overview:'KPI Overview',creative:'Creative KPI',requester:'Requester KPI',task:'Task Assign KPI'};
export const routes:Record<KpiView,string>={overview:'kpi',creative:'kpi-creative',requester:'kpi-requester',task:'kpi-task'};
export function dateKey(value:string|null):string {return value&&Number.isFinite(Date.parse(value))?new Date(Date.parse(value)+7*3600000).toISOString().slice(0,10):'';}
export function period(month:string):{start:string;end:string}{
 if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month))throw new KpiError('load','Invalid report month');
 const [y,m]=month.split('-').map(Number);const next=new Date(Date.UTC(y,m,1)).toISOString().slice(0,7);
 return {start:`${month}-01T00:00:00+07:00`,end:`${next}-01T00:00:00+07:00`};
}
export function readMonthPreference(storage:Pick<Storage,'getItem'>,viewer:Viewer|undefined,now=new Date().toISOString()):string {
 const current=dateKey(now).slice(0,7);
 try{const saved=viewer?.id?storage.getItem(`flowmate:kpi-month:v1:${viewer.id}`):null;if(saved&&saved>='2026-01'&&saved<=current){period(saved);return saved;}}catch{}
 return current;
}
export function writeMonthPreference(storage:Pick<Storage,'setItem'>,viewer:Viewer|undefined,month:string,now=new Date().toISOString()):void {
 try{period(month);if(viewer?.id&&month>='2026-01'&&month<=dateKey(now).slice(0,7))storage.setItem(`flowmate:kpi-month:v1:${viewer.id}`,month);}catch{}
}
export function scopeKey(user:Viewer|undefined):string {return user?JSON.stringify([user.id,user.role,user.is_active,user.can_access_all_teams,user.canAccessAllTeams,[...(user.accessible_teams??[])].sort()]):'';}
export function menuAllowed(user:Viewer|undefined):boolean{return !!user?.id&&user.is_active!==false&&user.role!=='viewer'&&(user.role==='admin'||user.can_access_all_teams===true||user.canAccessAllTeams===true);}
export const format=(value:number|null,unit:Metric['unit']='count'):string=>value===null?'—':`${new Intl.NumberFormat('en-GB',{maximumFractionDigits:1}).format(value)}${unit==='percent'?'%':unit==='days'?' days':unit==='score'?' / 5':' tasks'}`;
const before=(value:string|null,asOf:string)=>!!value&&Date.parse(value)<=Date.parse(asOf);
const inMonth=(value:string|null,month:string,asOf:string)=>before(value,asOf)&&dateKey(value).slice(0,7)===month;
const earliest=(values:(string|null)[],asOf:string):string|null=>values.filter((v):v is string=>before(v,asOf)).sort((a,b)=>Date.parse(a)-Date.parse(b))[0]??null;
const eventAction=(e:Raw)=>str(obj(e.metadata).action);
const taskEvent=(e:Raw,action:string)=>str(obj(e.metadata).source)==='task_assign_workspace'&&eventAction(e)===action;
const resourceRows=(s:Snapshot,key:string)=>s.resources[key]?.status==='ready'?s.resources[key].rows:[];
const ready=(s:Snapshot,...keys:string[])=>keys.every(k=>s.resources[k]?.status==='ready');
export function validReady(brief:Raw[],asOf:string):string|null {
 const submissions=brief.filter(b=>b.action==='submitted'&&before(timestamp(b.occurred_at),asOf)).sort((a,b)=>Date.parse(str(b.occurred_at))-Date.parse(str(a.occurred_at))||Number(b.id)-Number(a.id));
 const latest=submissions[0];if(!latest)return null;
 const accepts=brief.filter(b=>b.action==='accepted'&&sid(b.submission_id)===sid(latest.id)&&sid(b.work_item_id)===sid(latest.work_item_id)&&before(timestamp(b.occurred_at),asOf)&&Date.parse(str(b.occurred_at))>=Date.parse(str(latest.occurred_at))&&str(b.actor_user_id).trim()&&str(b.reason).trim()&&str(b.brief_link).trim()&&b.brief_link===latest.brief_link);
 return accepts.length===1?timestamp(accepts[0].occurred_at):null;
}
export function facts(snapshot:Snapshot):Fact[]{
 const events=resourceRows(snapshot,'history'),milestones=resourceRows(snapshot,'milestones'),brief=resourceRows(snapshot,'brief');
 return resourceRows(snapshot,'work').map(w=>{
  const id=sid(w.work_item_id??w.id);const history=events.filter(e=>sid(e.work_item_id)===id),ms=milestones.filter(m=>sid(m.work_item_id)===id),br=brief.filter(b=>sid(b.work_item_id)===id);
  const reviewAt=earliest([...history.filter(e=>e.from_status==='in_progress'&&e.to_status==='review').map(e=>timestamp(e.created_at)),...ms.filter(m=>m.milestone==='review').map(m=>timestamp(m.occurred_at))],snapshot.asOf);
  const deliveredAt=earliest([...history.filter(e=>e.to_status==='delivered').map(e=>timestamp(e.created_at)),...ms.filter(m=>m.milestone==='delivered').map(m=>timestamp(m.occurred_at))],snapshot.asOf);
  const attribution=ms.find(m=>m.milestone==='delivered'&&timestamp(m.occurred_at)===deliveredAt);
  const assignment=ms.find(m=>m.milestone==='assigned'&&before(timestamp(m.occurred_at),snapshot.asOf)&&reviewAt&&Date.parse(str(m.occurred_at))<=Date.parse(reviewAt));
  const briefLink=str(resourceRows(snapshot,'briefLinks').find(b=>sid(b.work_item_id)===id)?.brief_link).trim();
  const assetDate=resourceRows(snapshot,'assetDates').find(d=>sid(d.id)===id);
  const assetAt=(kind:string)=>earliest(history.filter(e=>eventAction(e)==='add_link'&&obj(e.metadata).kpi_evidence_source==='link_zone_v1'&&obj(e.metadata).link_kind===kind&&str(e.actor_user_id)&&str(obj(e.metadata).link_id)&&/^https?:\/\//i.test(str(obj(e.metadata).url))).map(e=>timestamp(e.created_at)),snapshot.asOf);
  const fact:Fact = {firstDraftAt:null,finalAssetAt:null,assetFirstDraftDue:null,assetFinalDue:null,id,displayId:str(w.display_id),title:str(w.title),status:str(w.status),team:str(w.requester_team),createdAt:timestamp(w.created_at),requestSubmittedAt:earliest(history.filter(e=>e.event_type==='created'&&str(obj(e.metadata).source)==='task_assign_workspace').map(e=>timestamp(e.created_at)),snapshot.asOf),ownerId:str(attribution?.owner_member_id),ownerName:str(attribution?.owner_name)||'Unknown completion owner',reviewAt,deliveredAt,submitAt:earliest(history.filter(e=>taskEvent(e,'submit')&&e.to_status==='review').map(e=>timestamp(e.created_at)),snapshot.asOf),approveAt:earliest(history.filter(e=>taskEvent(e,'approve')&&e.to_status==='delivered').map(e=>timestamp(e.created_at)),snapshot.asOf),startedAt:earliest(history.filter(e=>taskEvent(e,'start')&&e.to_status==='in_progress').map(e=>timestamp(e.created_at)),snapshot.asOf),surveyAt:earliest(resourceRows(snapshot,'surveys').filter(r=>sid(r.work_item_id)===id).map(r=>timestamp(r.recorded_at)),snapshot.asOf),readyAt:validReady(br,snapshot.asOf),briefLink,draftBaselineCandidate:assignment?str(assignment.due_date)||null:null,events:history,milestones:ms,brief:br};
  fact.firstDraftAt=assetAt('first_draft');fact.finalAssetAt=assetAt('final_asset');
  fact.assetFirstDraftDue=str(assetDate?.due_date)||null;fact.assetFinalDue=str(assetDate?.final_approved_due_date)||null;
  fact.readyAt=confirmedReady(snapshot,fact,snapshot.asOf);return fact;
 });
}
function missing(id:string,label:string,cohort:Fact[],event:Metric['event'],reason:string):Metric{return {id,label,value:null,unit:'percent',note:reason,cohort,eligible:[],reasons:{[reason]:cohort.length},event,available:false};}
function count(id:string,label:string,cohort:Fact[],event:Metric['event'],available:boolean):Metric{return {id,label,value:available?cohort.length:null,unit:'count',note:available?'Unique tasks in the selected month':'Evidence incomplete. Please retry',cohort,eligible:available?cohort:[],reasons:available?{}:{'Evidence incomplete':cohort.length},event,available};}
function evidenceFor(s:Snapshot,f:Fact,kind:string,at=s.asOf):Raw[]{
 const reset=Math.max(0,...f.events.filter(e=>taskEvent(e,'forward')&&before(timestamp(e.created_at),at)).map(e=>Date.parse(str(e.created_at))));
 return resourceRows(s,'evidence').filter(e=>sid(e.work_item_id)===f.id&&e.kind===kind&&(kind==='intake'||str(e.actor_user_id).trim())&&before(timestamp(e.recorded_at),at)&&(kind==='intake'||Date.parse(str(e.recorded_at))>=reset)).sort((a,b)=>Date.parse(str(a.recorded_at))-Date.parse(str(b.recorded_at))||Number(a.id)-Number(b.id));
}
export function confirmedDeadline(s:Snapshot,f:Fact,endpoint:string,at=s.asOf):string|null {
 const record=evidenceFor(s,f,'deadline',at).find(e=>e.endpoint===endpoint);
 return record&&/^20\d\d-\d\d-\d\d$/.test(str(record.due_date))?str(record.due_date):null;
}
function confirmedReady(s:Snapshot,f:Fact,at:string|null):string|null {
 if(!at)return null;
 if(s.domain!=='task')return validReady(f.brief,at);
 const resets=f.events.filter(e=>['forward','edit','edit_brief','need_information'].some(a=>taskEvent(e,a))&&before(timestamp(e.created_at),at));
 const latestReset= Math.max(0,...resets.map(e=>Date.parse(str(e.created_at))));
 return timestamp(evidenceFor(s,f,'ready',at).find(e=>str(e.brief_fingerprint).trim()&&Date.parse(str(e.recorded_at))>=latestReset)?.recorded_at);
}
export interface EvidenceInput {p_work_item_id:string;p_kind:'deadline'|'ready'|'sla'|'csat';p_request_key:string;p_reason:string;p_endpoint?:string;p_due_date?:string;p_required_on?:string;p_sla_workdays?:number;p_brief_fingerprint?:string;p_score?:number}
export async function evidenceContext(client:Client,id:string):Promise<Raw>{
 const result=await client.rpc('flowmate_kpi_evidence_context',{p_work_item_id:id});
 if(result.error)throw new KpiError('load','KPI evidence capture is unavailable. Check installation and permissions',result.error.code);
 if(!result.data||typeof result.data!=='object')throw new KpiError('load','KPI evidence storage is not installed');return obj(result.data);
}
export async function recordEvidence(client:Client,input:EvidenceInput):Promise<void>{
 const result=await client.rpc('flowmate_kpi_record_evidence',{...input});
 if(result.error)throw new KpiError('load',result.error.code==='40001'?'Brief changed. Reopen evidence before confirming':result.error.code==='42501'?'You cannot record evidence for this task':'Unable to save. Check the data and retry',result.error.code);
 if(!obj(result.data).id)throw new KpiError('load','Save confirmation unavailable. Please retry');
}
function measured(id:string,label:string,cohort:Fact[],event:Metric['event'],available:boolean,measure:(f:Fact)=>number|null,unit:Metric['unit']='percent',reason='Missing required evidence',elapsed?:(f:Fact)=>number|null):Metric {
 const samples=available?cohort.map(f=>({f,n:measure(f)})).filter((v):v is {f:Fact;n:number}=>v.n!==null&&Number.isFinite(v.n)):[];
 const value=samples.length?samples.reduce((sum,v)=>sum+v.n,0)/samples.length:null;
 const totalSamples=elapsed?samples.map(v=>elapsed(v.f)).filter((v):v is number=>v!==null):[];
 return {id,label,event,unit,value,available:available&&samples.length>0,cohort,eligible:samples.map(v=>v.f),results:Object.fromEntries(cohort.map(f=>{const sample=samples.find(v=>v.f.id===f.id);return [f.id,sample?unit==='days'||unit==='score'?format(sample.n,unit):sample.n===100?'Met':'Missed':reason];})),reasons:{[reason]:cohort.length-samples.length},note:`Measured ${samples.length}/${cohort.length} tasks${samples.length<cohort.length?' · '+reason:''}${totalSamples.length?' · Average elapsed time '+format(totalSamples.reduce((a,b)=>a+b,0)/totalSamples.length,'days'):''}${unit==='days'?' · Business days using '+organizationCalendar.version+' (includes waiting)':''}`};
}
function punctual(s:Snapshot,id:string,label:string,rows:Fact[],event:Exclude<Metric['event'],'snapshot'>,endpoint:string):Metric {
 return measured(id,label,rows,event,ready(s,'evidence','history','work','eventCandidates',...(s.domain==='creative'?['milestoneCandidates','milestones']:['taskCandidates'])),f=>{const due=confirmedDeadline(s,f,endpoint,f[event]||s.asOf);return due&&f[event]?dateKey(f[event])<=due?100:0:null;},'percent','Missing agreed deadline before event');
}
function duration(s:Snapshot,id:string,label:string,rows:Fact[],event:Exclude<Metric['event'],'snapshot'>,start:(f:Fact)=>string|null,available:boolean):Metric {
 return measured(id,label,rows,event,available,f=>workingDays(start(f),f[event]),'days','Missing timestamps or outside the 2026 calendar',f=>{const a=start(f),b=f[event];return a&&b&&Date.parse(b)>=Date.parse(a)?(Date.parse(b)-Date.parse(a))/DAY:null;});
}
export function metrics(snapshot:Snapshot,filters:{person?:string;team?:string}={}):Metric[]{
 const all=facts(snapshot).filter(f=>f.status!=='cancelled'&&(!filters.person||(filters.person==='unknown'?!f.ownerId:f.ownerId===filters.person))&&(!filters.team||f.team===filters.team));
 const cohort=(event:Exclude<Metric['event'],'snapshot'>)=>all.filter(f=>inMonth(f[event],snapshot.month,snapshot.asOf));
 if(snapshot.domain==='creative'){
  const delivery=cohort('deliveredAt');
  const assetMetric=(id:string,label:string,event:'firstDraftAt'|'finalAssetAt',due:'assetFirstDraftDue'|'assetFinalDue'):Metric=>{
   const rows=cohort(event),complete=ready(snapshot,'work','history','assetCandidates','assetDates');
   const metric=measured(id,label,rows,event,complete,f=>f[event]&&f[due]&&/^20\d\d-\d\d-\d\d$/.test(f[due])?dateKey(f[event])<=f[due]?100:0:null,'percent','Missing asset due date');
   if(!complete)metric.note='Submission evidence could not be loaded';
   else if(!rows.length)metric.note=`No ${event==='firstDraftAt'?'1st Draft':'Final Asset'} submissions this month`;
   return metric;
  };
  return [assetMetric('C01','First Draft Submitted On Time','firstDraftAt','assetFirstDraftDue'),assetMetric('C02','Final Asset Submitted On Time','finalAssetAt','assetFinalDue'),count('C04','Completed Work',delivery,'deliveredAt',ready(snapshot,'work','eventCandidates','milestoneCandidates','history','milestones'))];
 }
 if(snapshot.domain==='requester'){
  const requests=cohort('createdAt'),eligible=requests.filter(f=>f.briefLink);const available=ready(snapshot,'work','briefLinks');
  const sla=measured('R01','Brief Lead Time Compliance',requests,'createdAt',ready(snapshot,'brief','evidence'),f=>{const readyAt=confirmedReady(snapshot,f,snapshot.asOf),rule=evidenceFor(snapshot,f,'sla')[0];if(!readyAt||!rule||Date.parse(String(rule.recorded_at))>Date.parse(readyAt)||rule.calendar_version!==organizationCalendar.version||!Number.isInteger(rule.sla_workdays)||Number(rule.sla_workdays)<0)return null;const end=str(rule.required_on)+'T00:00:00+07:00',gap=workingDays(readyAt,end);if(Date.parse(readyAt)>Date.parse(end))return workingDays(end,readyAt)===null?null:0;return gap===null?null:gap>=Number(rule.sla_workdays)?100:0;},'percent','Missing brief confirmation, required date or SLA');
  const urgent=measured('R02','Urgent Request Ratio',requests,'createdAt',ready(snapshot,'evidence'),f=>{const intake=evidenceFor(snapshot,f,'intake')[0];return intake&&['low','normal','high','urgent'].includes(str(intake.priority_at_intake))?intake.priority_at_intake==='urgent'?100:0:null;},'percent','Missing intake priority');
  return [sla,urgent,{id:'R03',label:'Brief Link Coverage',value:available&&requests.length?eligible.length/requests.length*100:null,unit:'percent',note:available?`${eligible.length}/${requests.length} requests with a Brief Link`:'Brief Links incomplete. Please retry',cohort:requests,eligible:available?eligible:[],reasons:available?{'Missing Brief Link':requests.length-eligible.length}:{'Brief Links incomplete':requests.length},event:'createdAt',available}];
 }
 const submissions=cohort('submitAt'),approvals=cohort('approveAt'),requests=cohort('requestSubmittedAt');
 const open=all.filter(f=>before(f.createdAt,snapshot.asOf)&&!['delivered','cancelled'].includes(f.status));
 const complete=ready(snapshot,'work','eventCandidates','taskCandidates','history');
 const bounce=requests.filter(f=>f.events.some(e=>taskEvent(e,'need_information'))),rework=submissions.filter(f=>f.events.some(e=>taskEvent(e,'request_changes')&&f.submitAt&&Date.parse(str(e.created_at))>=Date.parse(f.submitAt)));
 const rate=(id:string,label:string,rows:Fact[],hits:Fact[],event:Metric['event'],available:boolean):Metric=>({id,label,value:available&&rows.length?hits.length/rows.length*100:null,unit:'percent',note:available?`${hits.length}/${rows.length} tasks`:'History incomplete. Please retry',cohort:rows,eligible:available?rows:[],reasons:available?{}:{'History incomplete':rows.length},event,available});
 const overdue=(id:string,label:string,endpoint:string,event:'submitAt'|'approveAt')=>measured(id,label,open.filter(f=>!f[event]),'snapshot',ready(snapshot,'open','history','evidence'),f=>{const due=confirmedDeadline(snapshot,f,endpoint);return due?dateKey(snapshot.asOf)>due?100:0:null;},'percent','Missing agreed stage deadline');
 const planned=measured('T11','Planned Work Ratio',requests,'requestSubmittedAt',ready(snapshot,'requested','history','evidence'),f=>{const intake=evidenceFor(snapshot,f,'intake')[0];return intake&&['planned','unplanned'].includes(str(intake.plan_at_intake))?intake.plan_at_intake==='planned'?100:0:null;},'percent','Missing planning classification at intake');
 const surveyTasks=all.filter(f=>resourceRows(snapshot,'surveys').some(r=>sid(r.work_item_id)===f.id));
 const csat=measured('T12','Internal CSAT (Selected Quarter)',surveyTasks,'surveyAt',ready(snapshot,'surveys','work'),f=>{const responses=resourceRows(snapshot,'surveys').filter(r=>sid(r.work_item_id)===f.id&&r.survey_definition==='internal-csat-1to5-v1'&&Number.isInteger(r.score)&&Number(r.score)>=1&&Number(r.score)<=5);return responses.length?responses.reduce((n,r)=>n+Number(r.score),0)/responses.length:null;},'score','No valid CSAT responses');
 csat.note+=' · '+snapshot.month.slice(0,4)+'-Q'+Math.ceil(Number(snapshot.month.slice(5))/3)+' · Response quarter/NPS';
 const age=measured('T09','Age of Started Open Work',open.filter(f=>f.startedAt),'snapshot',ready(snapshot,'work','open','history'),f=>workingDays(f.startedAt,snapshot.asOf),'days','Missing start time or outside the 2026 calendar',f=>f.startedAt?(Date.parse(snapshot.asOf)-Date.parse(f.startedAt))/DAY:null);
 return [punctual(snapshot,'T01','Review Submitted On Time',submissions,'submitAt','task_submit'),punctual(snapshot,'T10','Final Acceptance On Time',approvals,'approveAt','task_approve'),duration(snapshot,'T02','Time to Review Submission',submissions,'submitAt',f=>f.startedAt,complete),duration(snapshot,'T04','Brief to Completion Cycle Time',approvals,'approveAt',f=>confirmedReady(snapshot,f,f.approveAt),complete&&ready(snapshot,'evidence')),count('T03','Throughput Accepted Work',approvals,'approveAt',complete),{...count('T07','Current Open Work',open,'snapshot',ready(snapshot,'work','open')),note:'snapshot Current open work'},rate('T05','Incomplete Brief Return Rate',requests,bounce,'requestSubmittedAt',ready(snapshot,'work','requested','history')),rate('T06','Revision Request Rate',submissions,rework,'submitAt',complete),overdue('T08S','Overdue Review Submission Rate','task_submit','submitAt'),overdue('T08F','Overdue Final Acceptance Rate','task_approve','approveAt'),age,planned,csat];
}
export function metricRows(metric:Metric):{fact:Fact;result:string}[]{return metric.cohort.map(f=>({fact:f,result:metric.results?.[f.id]??(!metric.available?metric.note:metric.id==='R03'?(f.briefLink?'Brief Link Coverage':'Missing Brief Link'):metric.id==='T05'?(f.events.some(e=>taskEvent(e,'need_information'))?'Brief returned':'Brief not returned'):metric.id==='T06'?(f.events.some(e=>taskEvent(e,'request_changes')&&f.submitAt&&Date.parse(str(e.created_at))>=Date.parse(f.submitAt))?'Revision requested':'No revision requested'):'Unique task count')}));}
export function csv(snapshot:Snapshot,metric:Metric):string {
 if(snapshot.partial||!metric.available)throw new KpiError('load','Export unavailable for incomplete metrics');
 const rows=metricRows(metric);const quote=(value:string)=>`"${(/^\s*[=+@\-]|^[\t\r\n]/.test(value)?"'":'')+value.replace(/"/g,'""')}"`;
 return [['definition_version','metric','month','as_of','scope','task_id','title','requester_team','first_event','confirmed_ready','brief_link','asset_due_date','result'],...rows.map(({fact:f,result})=>[version,metric.id,snapshot.month,snapshot.asOf,snapshot.scope,f.displayId,f.title,f.team,metric.event==='snapshot'?snapshot.asOf:f[metric.event]??'',(metric.id==='T04'?confirmedReady(snapshot,f,metric.event==='snapshot'?snapshot.asOf:f[metric.event]??snapshot.asOf):f.readyAt)??'',f.briefLink,metric.id==='C01'?f.assetFirstDraftDue??'':metric.id==='C02'?f.assetFinalDue??'':'',result])].map(r=>r.map(quote).join(',')).join('\r\n');
}
async function read(query:()=>Query,key:(r:Raw)=>string,signal:AbortSignal):Promise<Resource>{
 let failureCode='UNEXPECTED_CLIENT';
 try{
  const rows:Raw[]=[],seen=new Set<string>();let expected:number|null=null;
  for(let offset=0;offset<=5000;offset+=200){
   if(signal.aborted)throw new Error('cancelled');
   const response=await abortable(query().range(offset,offset+199).abortSignal(signal),signal);
   if(response.error){failureCode=response.error.code?.replace(/[^A-Z0-9_]/g,'')||'API_ERROR';throw new Error('api');}
   if(!Array.isArray(response.data)||!Number.isInteger(response.count)||response.count===null){failureCode='INCOMPLETE_RESPONSE';throw new Error('incomplete');}
   if(expected!==null&&response.count!==expected){failureCode='COUNT_CHANGED';throw new Error('changed');}expected=response.count;
   for(const row of response.data){const id=key(row);if(!id||seen.has(id)){failureCode=!id?'INVALID_ROW_ID':'DUPLICATE_ROW';throw new Error('duplicate');}seen.add(id);rows.push(row);}
   if(rows.length>5000)throw new Error('too large');
   if(response.data.length<200){if(rows.length!==expected){failureCode='TRUNCATED_ROWS';throw new Error('incomplete');}return {status:'ready',rows,message:''};}
  }
  throw new Error('too large');
 }catch{return {status:'error',rows:[],errorCode:signal.aborted?'ABORTED':failureCode,message:signal.aborted?'Loading cancelled or timed out':'Evidence incomplete. Please retry'};}
}
const byId=(r:Raw)=>sid(r.id);
const byWork=(r:Raw)=>sid(r.work_item_id);
const byMilestone=(r:Raw)=>sid(r.work_item_id)&&str(r.milestone)?`${sid(r.work_item_id)}:${str(r.milestone)}`:'';
const WORK_FIELDS='work_item_id,display_id,title,status,created_at,requester_team,archived_at';
const TASK_FIELDS='id,display_id,title,status,created_at,requester_team,archived_at';
const EVENT_FIELDS='id,work_item_id,event_type,created_at,from_status,to_status,metadata';
const MILESTONE_FIELDS='work_item_id,milestone,occurred_at,owner_member_id,owner_name,due_date';
async function chunks(ids:string[],build:(chunk:string[])=>Query,key:(r:Raw)=>string,signal:AbortSignal):Promise<Resource>{
 const rows:Raw[]=[];
 for(let i=0;i<ids.length;i+=50){const part=await read(()=>build(ids.slice(i,i+50)),key,signal);if(part.status==='error')return part;rows.push(...part.rows);}
 return {status:'ready',rows,message:''};
}
function abortable<T>(operation:PromiseLike<T>,signal:AbortSignal):Promise<T>{return new Promise((resolve,reject)=>{
 const cancel=()=>reject(new KpiError('load','Loading cancelled or timed out'));
 if(signal.aborted){cancel();return;}signal.addEventListener('abort',cancel,{once:true});
 Promise.resolve(operation).then(resolve,reject).finally(()=>signal.removeEventListener('abort',cancel));
});}
export async function load(client:Client,viewer:Viewer,domain:Domain,month:string,externalSignal?:AbortSignal):Promise<Snapshot>{
 if(!client||typeof client.from!=='function'||typeof client.rpc!=='function')throw new KpiError('load','Data connection unavailable. Please refresh');
 const range=period(month);if(!menuAllowed(viewer))throw new KpiError('denied','Lead / Supervisor access required');
 const control=new AbortController(),cancel=()=>control.abort();externalSignal?.addEventListener('abort',cancel,{once:true});if(externalSignal?.aborted)control.abort();
 const timer=setTimeout(cancel,20000),signal=control.signal,asOf=new Date().toISOString(),resources:Record<string,Resource>={};let testExcluded=0;
 try{
  if(signal.aborted)throw new KpiError('load','Loading cancelled');
  const access=await abortable(client.rpc('flowmate_kpi_can_view'),signal);if(access.error)throw new KpiError('load','Unable to check KPI access. Please retry');if(access.data!==true)throw new KpiError('denied','KPI access denied');
  const bounded=(q:Query,field:string)=>q.gte(field,range.start).lt(field,range.end).lte(field,asOf);
  if(domain==='requester'){
   // Bound the cheap base-table scan before evaluating the lifetime reporting view.
   resources.requested=await read(()=>bounded(client.from('work_items').select('id',{count:'exact'}).eq('work_type','creative_request'),'created_at').order('id',{ascending:true}),byId,signal);
   if(resources.requested.status==='error')throw new KpiError('load',resources.requested.message,resources.requested.errorCode);
   resources.work=await chunks(resources.requested.rows.map(byId),ids=>bounded(client.from('flowmate_creative_kpi_report_v').select(WORK_FIELDS,{count:'exact'}).in('work_item_id',ids),'created_at').order('work_item_id',{ascending:true}),byWork,signal);
   const ids=resources.work.rows.map(byWork);
   resources.briefLinks=await chunks(ids,ids=>client.from('creative_request_details').select('work_item_id,brief_link',{count:'exact'}).in('work_item_id',ids).order('work_item_id',{ascending:true}),byWork,signal);
  }else{
   const queries:Promise<Resource>[]=[read(()=>{let q=client.from('work_item_events').select(EVENT_FIELDS,{count:'exact'}).in('to_status',['review','delivered']);if(domain==='task')q=q.contains('metadata',{source:'task_assign_workspace'});return bounded(q,'created_at').order('id',{ascending:true});},byId,signal)];
   if(domain==='creative')queries.push(read(()=>bounded(client.from('creative_kpi_milestones').select(MILESTONE_FIELDS,{count:'exact'}).in('milestone',['review','delivered']),'occurred_at').order('work_item_id',{ascending:true}).order('milestone',{ascending:true}),byMilestone,signal));
   if(domain==='creative')queries.push(read(()=>bounded(client.from('work_item_events').select(EVENT_FIELDS,{count:'exact'}).contains('metadata',{action:'add_link',kpi_evidence_source:'link_zone_v1'}),'created_at').order('id',{ascending:true}),byId,signal));
   const candidates=await Promise.all(queries);resources.eventCandidates=candidates[0];if(domain==='creative'){resources.milestoneCandidates=candidates[1];resources.assetCandidates=candidates[2];}
   const ids=[...new Set(candidates.flatMap(r=>r.rows.map(byWork)).filter(Boolean))];
   if(domain==='task'){
    const quarterStart=Math.floor((Number(month.slice(5))-1)/3)*3+1,quarterMonth=month.slice(0,4)+'-'+String(quarterStart).padStart(2,'0'),quarterEnd=new Date(Date.UTC(Number(month.slice(0,4)),quarterStart+2,1)).toISOString().slice(0,10)+'T00:00:00+07:00';
    const surveys=await read(()=>client.from('flowmate_kpi_measurement_evidence').select('id,work_item_id,kind,score,survey_definition,survey_period,recorded_at',{count:'exact'}).eq('kind','csat').eq('work_domain','quick_task').gte('recorded_at',period(quarterMonth).start).lt('recorded_at',quarterEnd).lte('recorded_at',asOf).order('id',{ascending:true}),byId,signal);
    resources.surveys=surveys.status==='error'&&['42P01','PGRST205'].includes(surveys.errorCode||'')?{status:'unavailable',rows:[],message:'KPI evidence storage is not installed'}:surveys;
    const [requested,open]=await Promise.all([
     read(()=>bounded(client.from('work_items').select(TASK_FIELDS,{count:'exact'}).eq('work_type','quick_task'),'created_at').order('id',{ascending:true}),byId,signal),
     read(()=>client.from('work_items').select(TASK_FIELDS,{count:'exact'}).eq('work_type','quick_task').not('status','in','(delivered,cancelled)').is('archived_at',null).lte('created_at',asOf).order('id',{ascending:true}),byId,signal)
    ]);
    // Candidate IDs can include Creative events; explicitly constrain the task query.
    const taskWork=await chunks([...new Set([...ids,...resources.surveys.rows.map(byWork)])],ids=>client.from('work_items').select(TASK_FIELDS,{count:'exact'}).eq('work_type','quick_task').in('id',ids).order('id',{ascending:true}),byId,signal);
    resources.requested=requested;resources.open=open;resources.taskCandidates=taskWork;
    const union=[...new Map([...taskWork.rows,...requested.rows,...open.rows].map(w=>[byId(w),w])).values()];
    const classified:Raw[]=[];let failed=false;
    for(let i=0;i<union.length;i+=4){if(signal.aborted)throw new KpiError('load','Loading cancelled');await Promise.all(union.slice(i,i+4).map(async w=>{const r=await abortable(client.rpc('activity_automation_is_test',{p_work_item:byId(w)}),signal);if(r.error||typeof r.data!=='boolean'){failed=true;return;}if(r.data)testExcluded++;else classified.push(w);}));}
    resources.work=failed?{status:'error',rows:[],message:'Test registry check incomplete. Please retry'}:{status:'ready',rows:classified,message:''};
   }else resources.work=await chunks(ids,ids=>client.from('flowmate_creative_kpi_report_v').select(WORK_FIELDS,{count:'exact'}).in('work_item_id',ids).order('work_item_id',{ascending:true}),byWork,signal);
   const selected=resources.work.rows.map(w=>sid(w.work_item_id??w.id));
   if(domain==='creative')resources.assetDates=await chunks(selected,ids=>client.from('work_items').select('id,due_date,final_approved_due_date',{count:'exact'}).in('id',ids).eq('work_type','creative_request').order('id',{ascending:true}),byId,signal);
   const [history,milestones]=await Promise.all([
    chunks(selected,ids=>client.from('work_item_events').select(EVENT_FIELDS,{count:'exact'}).in('work_item_id',ids).lte('created_at',asOf).order('id',{ascending:true}),byId,signal),
    domain==='creative'?chunks(selected,ids=>client.from('creative_kpi_milestones').select(MILESTONE_FIELDS,{count:'exact'}).in('work_item_id',ids).lte('occurred_at',asOf).order('work_item_id',{ascending:true}).order('milestone',{ascending:true}),byMilestone,signal):Promise.resolve({status:'ready' as const,rows:[],message:''})
   ]);resources.history=history;resources.milestones=milestones;
  }
  const selectedIds=resources.work.rows.map(w=>sid(w.work_item_id??w.id));
  const [brief,evidence]=await Promise.all([
   domain!=='requester'?Promise.resolve({status:'ready' as const,rows:[],message:''}):chunks(selectedIds,ids=>client.from('creative_kpi_brief_evidence').select('id,work_item_id,action,submission_id,actor_user_id,occurred_at,reason,brief_link',{count:'exact'}).in('work_item_id',ids).lte('occurred_at',asOf).order('id',{ascending:true}),byId,signal),
   domain==='creative'?Promise.resolve({status:'ready' as const,rows:[],message:''}):chunks(selectedIds,ids=>client.from('flowmate_kpi_measurement_evidence').select('id,work_item_id,kind,endpoint,due_date,required_on,sla_workdays,calendar_version,priority_at_intake,plan_at_intake,brief_fingerprint,recorded_at,actor_user_id,score,survey_definition,survey_period',{count:'exact'}).in('work_item_id',ids).lte('recorded_at',asOf).order('id',{ascending:true}),byId,signal)
  ]);
  resources.brief=brief.status==='error'&&['42P01','PGRST205'].includes(brief.errorCode||'')?{status:'unavailable',rows:[],message:'Brief evidence unavailable'}:brief;
  resources.evidence=evidence.status==='error'&&['42P01','PGRST205','PGRST202'].includes(evidence.errorCode||'')?{status:'unavailable',rows:[],message:'KPI evidence storage is not installed'}:evidence;
  if(signal.aborted)throw new KpiError('load','Loading timed out. Please retry');
  if(resources.work.status==='error')throw new KpiError('load',resources.work.message,resources.work.errorCode);
  return {domain,month,asOf,scope:scopeKey(viewer),resources,partial:Object.values(resources).some(r=>r.status==='error'),testExcluded,loadDurationMs:Math.max(0,Date.now()-Date.parse(asOf))};
 }finally{clearTimeout(timer);externalSignal?.removeEventListener('abort',cancel);}
}
const api={version,labels,routes,period,scopeKey,menuAllowed,readMonthPreference,writeMonthPreference,format,dateKey,facts,metrics,metricRows,csv,load,validReady,workingDays,organizationCalendar,confirmedDeadline,evidenceContext,recordEvidence};
export type KpiApi=typeof api;
declare global {interface Window {FlowMateKpi:KpiApi;flowmateSupabase:Client;FLOWMATE_CURRENT_USER:Viewer|null}}
(globalThis as typeof globalThis&{FlowMateKpi:KpiApi}).FlowMateKpi=api;
