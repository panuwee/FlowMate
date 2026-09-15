const {test}=require('node:test'),assert=require('node:assert/strict');
const k=require('../../creative-kpi-report.js');
const owner=(id,code)=>({owner_member_id:id,owner_name:code,owner_code:code});
const base=(extra={})=>({work_item_id:'a',title:'Creative',created_at:'2026-07-01T00:00:00Z',assigned_at:'2026-07-02T00:00:00Z',started_at:'2026-07-03T00:00:00Z',acknowledge_at:'2026-07-03T00:00:00Z',review_submitted_at:'2026-08-05T00:00:00Z',delivery_at:'2026-09-01T00:00:00Z',delivered_at:'2026-10-01T00:00:00Z',status:'in_progress',due_date:'2026-08-06',evaluation_due:'2026-08-04',launch_date:'2026-08-10',launch_buffer_working_days:3,created_due:'2026-08-04',assigned_due:'2026-08-04',created_buffer_working_days:20,assigned_buffer_working_days:19,acknowledge_working_days:2,queue_working_days:1,assigned_acknowledge_working_days:1,production_working_days:23,delivered_ai_tags:['AI'],ai_tags:[],ai_evidence_source:'delivery_snapshot',deadline_source:'first_assignment_snapshot',start_snapshot:owner('p','ploy'),review_snapshot:owner('p','ploy'),delivery_snapshot:owner('v','vee'),...extra});
const build=(rows,options={})=>k.buildReport(rows,{year:2026,asOf:'2026-09-15T00:00:00Z',...options});
test('first delivery retains September volume after reopen; AI matches delivered snapshot and list',()=>{
 const r=build([base()],{month:9});assert.equal(r.selected.deliveredN,1);assert.equal(r.selected.aiDeliveredN,1);assert.equal(r.selected.aiAdoption.pct,100);assert.equal(r.aiTasks.length,1);assert.equal(r.monthly[9].deliveredN,0);
});
test('event owners get only their event metrics, with role filters respecting delivery versus review',()=>{
 const p=build([base()],{personId:'p'}),v=build([base()],{role:'VE'});
 assert.equal(p.annual.deliveredN,0);assert.equal(p.annual.reviewedN,1);assert.equal(p.annual.acknowledge.n,1);assert.equal(v.annual.deliveredN,1);assert.equal(v.annual.reviewedN,0);assert.equal(v.annual.acknowledge.n,0);
});
test('acknowledge grouped by Started, raw punctuality uses agreed baseline not changed due',()=>{
 const r=build([base()]);assert.equal(r.monthly[6].acknowledge.p50,2);assert.equal(r.monthly[7].acknowledge.n,0);assert.equal(r.monthly[7].onTime.numerator,0);assert.equal(r.monthly[7].onTime.denominator,1);
});
test('missing delivery event never inferred; missing snapshot owner does not use current owner',()=>{
 const r=build([base({delivery_at:null,delivery_snapshot:null,owner_member_id_at_start:'p',owner_member_code:'ploy'})]);assert.equal(r.annual.deliveredN,0);assert.equal(r.aiTasks.length,0);assert.equal(r.rows[0].owners.delivery.source,'missing');
});
test('negative launch buffer remains negative, task-level mixed production excluded only for individual duration',()=>{
 const r=build([base({launch_buffer_working_days:-2,reassigned_during_production:true})],{personId:'p'});
 assert.equal(r.annual.launch.p50,-2);assert.equal(r.annual.production.n,0);assert.equal(r.annual.mixedProductionN,1);assert.equal(build([base({reassigned_during_production:true})]).annual.production.n,1);
});
test('timing context handles overdue weekends even when working gap is zero, and missing data',()=>{
 assert.equal(k.timingGroup('2026-09-20','2026-09-19',0),'after_due');assert.equal(k.timingGroup('2026-09-17','2026-09-18',1),'short');assert.equal(k.timingGroup('2026-09-16','2026-09-18',2),'adequate');assert.equal(k.timingGroup(null,'2026-09-18',null),'unknown');
});
test('selected workbook summary and AI evidence reconcile with screen while annual progression remains',()=>{
 const r=build([base(),base({work_item_id:'b',delivery_at:'2026-08-01T00:00:00Z'})],{month:9});const sheets=k.buildWorkbook(r);
 assert.equal(r.annual.deliveredN,2);assert.equal(r.selected.deliveredN,1);assert.equal(sheets.find(s=>s.name==='AI tasks').rows.length,2);
 const summary=sheets.find(s=>s.name==='Selected summary');assert.equal(summary.rows[1][summary.rows[0].indexOf('Delivered tasks')],1);
});
test('year inclusion retains acknowledged task whose creation and draft are outside the year',()=>{
 const r=build([base({created_at:'2025-12-30T00:00:00Z',review_submitted_at:null,delivery_at:null,status:'cancelled'})]);assert.equal(r.rows.length,1);assert.equal(r.annual.acknowledge.n,1);
});
test('timing filter applies consistently to all KPI cohorts, progression and exported AI evidence',()=>{
 const rows=[base(),base({work_item_id:'short',assigned_buffer_working_days:1})];
 const r=build(rows,{month:9,timingSource:'assigned',timingGroup:'short'});assert.equal(r.selected.deliveredN,1);assert.equal(r.aiTasks.length,1);assert.equal(r.monthly[6].acknowledge.n,1);
 assert.equal(r.rows[0].id,'short');assert.ok(k.buildWorkbook(r)[0].rows.some(r=>r[0]==='Timing filter'&&r[1].includes('Less than 2')));
});
