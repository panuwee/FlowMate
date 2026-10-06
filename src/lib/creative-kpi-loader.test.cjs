const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function loader({ids=[], report, candidates, calendar={count:0,error:null}}={}) {
 const calls=[];
 const root={flowmateSupabase:{from(name){
  const query={}; const args={};
  ['select','or','order','range','abortSignal','eq','in','gte','lt'].forEach(method=>query[method]=(...values)=>{calls.push([name,method,...values]);args[method]=values;return query;});
  query.then=(resolve,reject)=>Promise.resolve().then(()=>{
   if(name==='flowmate_non_working_days')return calendar;
   if(name==='work_items')return candidates ? candidates(args) : {data:ids.slice(args.range[0],args.range[1]+1).map(id=>({id})),count:ids.length};
   return report ? report(args.in[1],args) : {data:args.in[1].map(work_item_id=>({work_item_id})),count:args.in[1].length};
  }).then(resolve,reject);return query;
 }}};
 vm.runInNewContext(fs.readFileSync('supabase-creative-kpi-report.js','utf8'),{window:root});return {load:root.loadFlowMateCreativeReport,calls};
}
test('paginates permitted IDs and bounds expensive history reads without changing year cohort',async()=>{
 const ids=Array.from({length:501},(_,i)=>String(i));const {load,calls}=loader({ids});
 const result=await load({year:2026});assert.equal(result.rows.length,501);
 assert.ok(calls.some(c=>c[0]==='work_items'&&c[1]==='range'&&c[2]===500));
 const batches=calls.filter(c=>c[0]==='flowmate_creative_kpi_progression_v'&&c[1]==='in');
 assert.equal(batches.length,13);assert.ok(batches.every(c=>c[3].length<=40));
 assert.ok(calls.some(c=>c[1]==='or'&&c[2].includes('first_delivery_year.eq.2026')));
 assert.ok(calls.some(c=>c[1]==='lt'&&c[3]==='2027-01-01T00:00:00+07:00'));
 assert.equal(calls.some(c=>c[1]==='eq'&&c[2]==='archived_at'),false);
});
test('retries timeouts with smaller batches, never returns a partial report',async()=>{
 const l=loader({ids:['a','b','c'],report:batch=>batch.length>1?{error:{code:'57014'}}:{data:batch.map(work_item_id=>({work_item_id})),count:1}});
 assert.equal((await l.load({year:2026})).rows.length,3);
 await assert.rejects(loader({ids:['a'],report:()=>({error:{code:'57014'}})}).load({year:2026}),/timed out/);
});
test('fails closed on schema, permission, truncation and unexpected IDs',async()=>{
 for(const [response,pattern] of [[{error:{code:'PGRST205'}},/not installed/],[{error:{code:'42501'}},/42501/],[{data:[],count:1},/incomplete/],[{data:[{work_item_id:'wrong'}],count:1},/incomplete/]]) {
  await assert.rejects(loader({ids:['a'],report:()=>response}).load({year:2026}),pattern);
 }
});
test('candidate truncation, duplicate IDs and changing counts fail closed',async()=>{
 await assert.rejects(loader({candidates:()=>({data:[{id:'a'}],count:2})}).load({year:2026}),/incomplete/);
 await assert.rejects(loader({ids:['a','a']}).load({year:2026}),/incomplete/);
 const l=loader({candidates:args=>args.range[0]===0?{data:Array.from({length:500},(_,i)=>({id:String(i)})),count:501}:{data:[],count:502}});
 await assert.rejects(l.load({year:2026}),/changed/);
});
test('year filter may exclude candidates and empty results are valid',async()=>{
 const result=await loader({ids:['older'],report:()=>({data:[],count:0})}).load({year:2026});assert.equal(result.rows.length,0);
 assert.equal((await loader().load({year:2026})).rows.length,0);
});
test('invalid year and pre-cancelled load perform no query',async()=>{
 const l=loader();await assert.rejects(l.load({year:'2026,or.any'}),/Invalid/);await assert.rejects(l.load({year:2026,signal:{aborted:true}}),/cancelled/);assert.equal(l.calls.length,0);
});
test('cancellation during timeout does not start retry',async()=>{
 const signal={aborted:false};const l=loader({ids:['a','b'],report:()=>{signal.aborted=true;return {error:{code:'57014'}};}});
 await assert.rejects(l.load({year:2026,signal}),/cancelled/);assert.equal(l.calls.filter(c=>c[0]==='flowmate_creative_kpi_progression_v'&&c[1]==='in').length,1);
});
test('calendar failure does not masquerade as zero holidays',async()=>{
 await assert.rejects(loader({calendar:{count:null,error:{message:'denied'}}}).load({year:2026}),/calendar/);
});
