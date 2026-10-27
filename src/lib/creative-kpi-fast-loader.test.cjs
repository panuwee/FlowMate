const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const valid=()=>({version:1,year:2026,rows:[{work_item_id:'one'}],rowCount:1,asOf:'2026-10-27T00:00:00Z',calendarActiveN:0});
function fixture(response){
 const calls=[];
 const root={flowmateSupabase:{rpc(name,args){
  calls.push(['rpc',name,args]);const q={abortSignal(signal){calls.push(['signal',signal]);return q;},then(resolve,reject){return Promise.resolve().then(()=>typeof response==='function'?response():response).then(resolve,reject);}};return q;
 },from(name){
  calls.push(['from',name]);const q={};for(const m of ['select','eq','lt','gte','in','or','order','range','abortSignal'])q[m]=()=>q;
  q.then=(resolve,reject)=>Promise.resolve({data:[],count:0}).then(resolve,reject);return q;
 }}};
 vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,'../../supabase-creative-kpi-report.js'),'utf8'),{window:root});
 return {calls,load:root.loadFlowMateCreativeReport};
}
test('one RPC returns the complete report and calendar without per-batch requests',async()=>{
 const f=fixture({data:valid()});const r=await f.load({year:2026});
 assert.equal(r.rows.length,1);assert.equal(r.calendarActiveN,0);assert.equal(r.asOf,valid().asOf);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][1],'flowmate_creative_kpi_report_fast');
 assert.equal(f.calls[0][2].p_year,2026);
});
test('only an absent RPC falls back to the legacy loader for staged install and rollback',async()=>{
 const f=fixture({error:{code:'PGRST202'}});assert.equal((await f.load({year:2026})).rows.length,0);
 assert.deepEqual(f.calls.map(c=>c[0]),['rpc','from','from']);
 for(const code of ['42501','57014','55000','PGRST301']){
  const denied=fixture({error:{code}});await assert.rejects(denied.load({year:2026}));
  assert.equal(denied.calls.length,1);
 }
});
test('truncation, duplicate rows, missing calendar, wrong year and invalid snapshots fail closed',async()=>{
 for(const bad of [null,{...valid(),rowCount:2},{...valid(),rows:[null]},
  {...valid(),rows:[{work_item_id:'one'},{work_item_id:'one'}],rowCount:2},
  {...valid(),year:2027},{...valid(),version:2},{...valid(),asOf:'invalid'},
  {...valid(),calendarActiveN:null},{...valid(),calendarActiveN:-1}]){
  const f=fixture({data:bad});await assert.rejects(f.load({year:2026}),/incomplete/);
  assert.equal(f.calls.length,1);
 }
});
test('cancellation before and during RPC never produces a snapshot or starts fallback',async()=>{
 const signal={aborted:true},a=fixture({data:valid()});await assert.rejects(a.load({year:2026,signal}),/cancelled/);assert.equal(a.calls.length,0);
 signal.aborted=false;const b=fixture(()=>{signal.aborted=true;return {data:valid()};});
 await assert.rejects(b.load({year:2026,signal}),/cancelled/);
 assert.deepEqual(b.calls.map(c=>c[0]),['rpc','signal']);
});
