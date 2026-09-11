const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function loader(pages,calendar={count:0,error:null}){
 const calls=[];let page=0;
 const root={flowmateSupabase:{from(name){const query={};['select','or','order','range','abortSignal','eq','in','gte','lt'].forEach(method=>query[method]=(...args)=>{calls.push([name,method,...args]);return query;});query.then=(resolve,reject)=>Promise.resolve(name==='flowmate_non_working_days'?calendar:pages[page++]).then(resolve,reject);return query;}}};
 vm.runInNewContext(fs.readFileSync('supabase-creative-kpi-report.js','utf8'),{window:root});return {load:root.loadFlowMateCreativeReport,calls};
}
test('fetches every page beyond the API row limit with stable ordering',async()=>{
 const {load,calls}=loader([{data:Array.from({length:500},(_,i)=>({work_item_id:String(i)})),count:501},{data:[{work_item_id:'last'}],count:501}]);
 const r=await load({year:2026});assert.equal(r.rows.length,501);assert.equal(r.calendarActiveN,0);assert.ok(calls.some(c=>c[1]==='range'&&c[2]===500));
});
test('blocks export source on a partial failure, changing count or hidden truncation',async()=>{
 await assert.rejects(loader([{data:[],error:{code:'PGRST205'}}]).load({year:2026}),/not installed/);
 await assert.rejects(loader([{data:[{work_item_id:'a'}],count:2}]).load({year:2026}),/incomplete/);
 await assert.rejects(loader([{data:Array.from({length:500},(_,i)=>({work_item_id:String(i)})),count:501},{data:[],count:502}]).load({year:2026}),/changed/);
});
test('invalid year and cancelled request perform no query',async()=>{
 const l=loader([]);await assert.rejects(l.load({year:'2026,or.any'}),/Invalid/);await assert.rejects(l.load({year:2026,signal:{aborted:true}}),/cancelled/);assert.equal(l.calls.length,0);
});
test('calendar failure does not masquerade as zero holidays',async()=>{
 await assert.rejects(loader([{data:[],count:0}],{count:null,error:{message:'denied'}}).load({year:2026}),/calendar/);
});
