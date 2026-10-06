const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {buildRequesterMonthly}=require('../../supabase-creative-kpi-report.js');
const plain=value=>JSON.parse(JSON.stringify(value));
function fact(id,changes={}) {return {work_item_id:id,review_submitted_at:'2026-09-01T00:00:00Z',review_month:'2026-09-01',requester_user_id:'requester',requester_name:'Requester',requester_team:'Marketing',brief_to_launch_working_days:null,review_first_response_working_days:null,review_decision_working_days:null,review_sla_eligible:false,review_sla_met:false,first_requester_activity_at:null,first_assignment_result:null,brief_complete_first_pass:false,rework_at:null,exception_flags:[],data_quality_flags:[],...changes};}
function mock({ids=[],response,scope}={}) {
 const calls=[],root={flowmateSupabase:{from(table){let args={};const q={};for(const method of ['select','eq','order','range','abortSignal','in','not'])q[method]=(...values)=>{args[method]=values;return q;};q.then=(yes,no)=>Promise.resolve().then(()=>{calls.push({table,args});if(table==='work_items')return scope?scope(args):{data:ids.slice(args.range[0],args.range[1]+1).map(id=>({id})),count:ids.length};return response?response(args.in[1],args):{data:args.in[1].map(id=>fact(id)),count:args.in[1].length};}).then(yes,no);return q;}}};
 vm.runInNewContext(fs.readFileSync('supabase-creative-kpi-report.js','utf8'),{window:root});return {load:root.loadFlowMateRequesterKpiMonthly,calls};
}
test('requester rollup retains SQL continuous percentiles, null samples, SLA and quality denominators',()=>{
 const rows=[fact('a',{brief_to_launch_working_days:-2,review_first_response_working_days:0,review_sla_eligible:true,review_sla_met:true,first_requester_activity_at:'2026-09-01',first_assignment_result:'assigned',brief_complete_first_pass:true}),fact('b',{brief_to_launch_working_days:4,review_first_response_working_days:2,review_sla_eligible:true,first_assignment_result:'need_brief',rework_at:'2026-09-03',exception_flags:['rework']}),fact('c',{review_first_response_working_days:10,data_quality_flags:['missing']})];
 const r=buildRequesterMonthly(rows).find(r=>r.scope==='team');assert.equal(r.n,3);assert.equal(r.brief_lead_p50,1);assert.ok(Math.abs(r.brief_lead_p15-(-1.1))<1e-10);assert.ok(Math.abs(r.brief_lead_p85-3.1)<1e-10);assert.equal(r.brief_lead_missing_n,1);assert.equal(r.brief_late_or_same_day_n,1);assert.equal(r.review_response_p50,2);assert.equal(r.review_response_avg,4);assert.equal(r.review_decision_p50,null);assert.equal(r.review_sla_denominator,2);assert.equal(r.review_sla_pct,50);assert.equal(r.pending_review_over_sla_n,1);assert.equal(r.brief_complete_first_pass_pct,50);assert.equal(r.exception_n,2);assert.equal(r.small_sample,true);
});
test('requester person groups, old months, missing names and zero denominators match Legacy scope',()=>{
 const r=buildRequesterMonthly([fact('a'),fact('b',{requester_user_id:null,requester_name:null,requester_team:null}),fact('c',{review_month:'2025-12-01'}),fact('not-reviewed',{review_submitted_at:null})]);assert.equal(r.length,5);assert.equal(r.find(r=>r.person_name==='Unknown requester').person_group,'N/A');assert.equal(r.find(r=>r.scope==='team'&&r.review_month==='2026-09-01').review_sla_pct,null);assert.equal(r.some(r=>r.review_month==='2025-12-01'),true);
});
test('bounded facts preserve every permitted requester task and monthly aggregation without either heavy monthly view',async()=>{
 const m=mock({ids:Array.from({length:501},(_,i)=>'id-'+i)}),rows=await m.load();assert.equal(rows.find(r=>r.scope==='team').n,501);assert.ok(m.calls.every(c=>['work_items','flowmate_creative_kpi_facts_v'].includes(c.table)));assert.ok(m.calls.filter(c=>c.table.includes('facts')).every(c=>c.args.in[1].length<=40));assert.equal(m.calls.filter(c=>c.table==='work_items').length,2);assert.equal(m.calls.some(c=>c.args.eq?.[0]==='archived_at'),false);
});
test('timeouts split only failing batches; permissions, missing columns and incomplete rows reject',async()=>{
 const m=mock({ids:['a','b'],response:ids=>ids.length>1?{error:{code:'57014'}}:{data:ids.map(id=>fact(id)),count:1}});assert.equal((await m.load()).find(r=>r.scope==='team').n,2);
 for(const response of [{error:{code:'42501'}},{error:{code:'57014'}},{data:[],count:1},{data:[fact('outside')],count:1},{data:[{work_item_id:'a'}],count:1},{data:[fact('a',{review_first_response_working_days:'bad'})],count:1}])await assert.rejects(mock({ids:['a'],response:()=>response}).load());
});
test('incomplete candidates, duplicates and cancellation never produce partial KPI results',async()=>{
 await assert.rejects(mock({ids:['a','a']}).load());await assert.rejects(mock({scope:()=>({data:[{id:'a'}],count:2})}).load());await assert.rejects(mock({ids:['a','b'],response:()=>({data:[fact('a'),fact('a')],count:2})}).load());
 const signal={aborted:false},m=mock({ids:['a','b'],response:()=>{signal.aborted=true;return {error:{code:'57014'}};}});await assert.rejects(m.load({signal}),/cancelled/);assert.equal(m.calls.filter(c=>c.table.includes('facts')).length,1);assert.deepEqual(plain(await mock().load()),[]);
});
