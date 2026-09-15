const {test}=require('node:test');
const assert=require('node:assert/strict');
const kpi=require('../../creative-kpi-report.js');
const now='2026-09-11T09:00:00Z';
const row=(id,extra={})=>({work_item_id:id,display_id:id,title:id,owner_member_id_at_start:'person-1',owner_name_at_start:'Ploy',owner_member_code:'ploy',asset_type:'static-graphic',status:'delivered',created_at:'2026-08-01T00:00:00Z',assigned_at:'2026-08-03T02:00:00Z',started_at:'2026-08-04T02:00:00Z',review_submitted_at:'2026-08-05T02:00:00Z',delivered_at:'2026-08-06T02:00:00Z',due_date:'2026-08-05',final_approved_due_date:'2026-08-06',assigned_to_started_working_days:1,production_working_days:1,effort_point:2,ai_tags:[],data_quality_flags:[],exception_flags:[],...extra});
const build=rows=>kpi.buildReport(rows,{year:2026,asOf:now});
test('delivery uses delivery month and preserves cross-year drafts',()=>{
 const r=build([row('a',{review_submitted_at:'2025-12-30T02:00:00Z',delivered_at:'2026-01-02T02:00:00Z'}),row('b',{status:'review',delivered_at:null})]);
 assert.equal(r.annual.deliveredN,1);assert.equal(r.annual.reviewedN,1);assert.equal(r.monthly[0].deliveredN,1);assert.equal(r.monthly[7].deliveredN,0);
});
test('pool annual values rather than monthly medians/percentages',()=>{
 const r=build([row('a',{production_working_days:1}),row('b',{production_working_days:3}),row('c',{review_submitted_at:'2026-07-05T02:00:00Z',production_working_days:100})]);
 assert.equal(r.annual.production.p50,3);assert.equal(r.annual.onTime.denominator,3);assert.equal(r.annual.onTime.numerator,3);
});
test('same-day Bangkok deadline, null denominator and late assignment context',()=>{
 const r=build([row('a',{review_submitted_at:'2026-08-05T16:59:59Z',assigned_at:'2026-08-06T00:00:00Z'}),row('b',{due_date:null})]);
 assert.equal(r.annual.onTime.numerator,1);assert.equal(r.annual.onTime.denominator,1);assert.equal(r.annual.contextOnTime.denominator,0);assert.equal(r.annual.contextOnTime.pct,null);
});
test('AI counts distinct tasks, preserves titles and status, never tags as work count',()=>{
 const a=row('a',{title:'Same title',ai_tags:['AI','AI','Image']}), b=row('b',{title:'Same title',status:'review',delivered_at:null,ai_tags:['AI']});
 const r=build([a,b,a]);assert.equal(r.annual.aiN,2);assert.equal(r.annual.aiDeliveredN,1);assert.equal(r.aiTasks.length,1);
 assert.equal(r.aiTasks[0].title,'Same title');
});
test('partial, future and no-data months stay distinct',()=>{
 const r=build([row('a')]);assert.equal(r.monthly[8].periodStatus,'Partial month');assert.equal(r.monthly[9].periodStatus,'Future period');assert.equal(r.monthly[0].periodStatus,'No recorded data');
 assert.equal(r.monthly[0].production.p50,null);assert.equal(kpi.formatMetric(.00001,'days'),'<0.1 d');
});
test('role and person filters use approved codes and retain unmapped people',()=>{
 const rows=[row('a'),row('b',{owner_member_id_at_start:'person-2',owner_member_code:'pond',asset_type:'general-video'}),row('c',{owner_member_id_at_start:'person-3',owner_member_code:'new'})];
 assert.equal(kpi.buildReport(rows,{year:2026,asOf:now,role:'VE'}).annual.deliveredN,1);
 assert.equal(kpi.buildReport(rows,{year:2026,asOf:now,personId:'person-2'}).people.length,1);
 assert.equal(kpi.buildReport(rows,{year:2026,asOf:now,role:'Unmapped'}).annual.deliveredN,1);
});
test('short timestamps, missing values and cancellation are separate',()=>{
 const r=build([row('a',{started_at:'2026-08-05T01:59:58Z',production_working_days:.00002}),row('b',{production_working_days:null}),row('c',{status:'cancelled',delivered_at:null})]);
 assert.equal(r.annual.production.n,1);assert.equal(r.annual.production.missingN,1);assert.equal(r.annual.shortProductionN,1);assert.equal(r.annual.cancelledN,1);
});
test('workbook and screen share the exact report summary and task scope',()=>{
 const r=build([row('a',{ai_tags:['AI']})]);const sheets=kpi.buildWorkbook(r);
 assert.deepEqual(sheets.map(s=>s.name),['Read me','Annual summary','Monthly detail','Task evidence','AI tasks','Selected summary','Timing context','Quality & context','Lead evaluation']);
 assert.equal(sheets[1].rows[1][4],r.people[0].annual.deliveredN);
 assert.equal(sheets[4].rows.length,2);assert.equal(sheets[3].rows.length,2);
});
test('unrecorded current month is blank even while the period is partial',()=>{
 const sheets=kpi.buildWorkbook(build([row('a')]));
 const september=sheets[2].rows.find(r=>r[0]==='Ploy'&&r[2]==='2026-09');
 assert.equal(september[3],'Partial month');assert.equal(september[4],null);assert.equal(september[5],null);
 assert.equal(kpi.formatFlags(['assigned_after_due']),'Received after due date');
});
