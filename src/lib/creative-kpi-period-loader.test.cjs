const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const envelope=(month=10)=>({version:1,year:2026,month,scope:month===null?'year':'month',rowCount:1,
 rows:[{work_item_id:'a',created_at:'2026-10-01',review_submitted_at:null,delivery_at:null,acknowledge_at:null,status:'review'}],
 asOf:'2026-10-27T00:00:00Z',calendarActiveN:0});
function loader(response){
 const calls=[];const window={flowmateSupabase:{rpc(name,args){calls.push({name,args});
  const q={abortSignal(){return q;},then(resolve,reject){return Promise.resolve(typeof response==='function'?response():response).then(resolve,reject);}};return q;}}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../supabase-creative-kpi-report.js'),'utf8'),{window});
 return {calls,load:window.loadFlowMateCreativePeriod};
}
test('period loader explicitly requests and validates complete month or year coverage',async()=>{
 for(const month of [10,null]){const f=loader({data:envelope(month)});const r=await f.load({year:2026,month});
  assert.equal(r.scope,month===null?'year':'month');assert.equal(r.month,month);assert.equal(f.calls.length,1);
  assert.equal(f.calls[0].name,'flowmate_creative_kpi_report_period');assert.equal(f.calls[0].args.p_month,month);
 }
});
test('period loader rejects mismatched scope, missing evidence, truncation and invalid months',async()=>{
 for(const data of [{...envelope(),month:9},{...envelope(),scope:'year'},{...envelope(),rowCount:2},
  {...envelope(),rows:[{work_item_id:'a'}]},{...envelope(),asOf:'bad'},{...envelope(),calendarActiveN:null}]){
  await assert.rejects(loader({data}).load({year:2026,month:10}),/ข้อมูลรายงานไม่ครบ/);
 }
 for(const month of [0,13,1.5,'10']){const f=loader({data:envelope()});await assert.rejects(f.load({year:2026,month}),/Invalid/);assert.equal(f.calls.length,0);}
});
test('period errors never fall back; access failures are distinguished from retryable annual errors',async()=>{
 for(const [code,denied]of [['42501',true],['55000',true],['PGRST301',true],['57014',false],['PGRST202',false]]){
  const f=loader({error:{code}});await assert.rejects(f.load({year:2026,month:10}),e=>e.accessDenied===denied);assert.equal(f.calls.length,1);
 }
 const signal={aborted:true},f=loader({data:envelope()});await assert.rejects(f.load({year:2026,month:10,signal}),/cancelled/);assert.equal(f.calls.length,0);
 signal.aborted=false;const g=loader(()=>{signal.aborted=true;return {data:envelope()};});await assert.rejects(g.load({year:2026,month:10,signal}),/cancelled/);
});
