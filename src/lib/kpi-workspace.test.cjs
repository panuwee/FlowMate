const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {createClient,makeTables}=require('./fixtures/kpi-fixture.cjs');
const box={exports:{},AbortController,Date,Intl,setTimeout,clearTimeout};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('kpi-workspace.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,box);
const api=box.FlowMateKpi,user={id:'lead',role:'member',can_access_all_teams:true};
const metric=(s,id)=>api.metrics(s).find(m=>m.id===id);
test('Bangkok month is half-open and invalid months are rejected',()=>{
 assert.equal(api.period('2026-12').end,'2027-01-01T00:00:00+07:00');
 assert.equal(api.dateKey('2026-08-31T17:00:00Z'),'2026-09-01');assert.throws(()=>api.period('2026-13'));
});
test('MTD chart ends at the Bangkok as-of day while historical bins retain the full month',()=>{
 const screenBox={window:{FlowMateKpi:api}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('screens-kpi.jsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2020}}).outputText,screenBox);
 const chartMetric={event:'deliveredAt',cohort:[{deliveredAt:'2026-10-01T00:00:00Z'},{deliveredAt:'2026-10-01T17:00:00Z'}]};
 const mtd=screenBox.weeklyBinsKpi({month:'2026-10',asOf:'2026-10-01T17:00:00Z'},chartMetric);assert.equal(mtd.length,1);assert.equal(mtd[0].label,'1–2');assert.equal(mtd[0].n,2);
 const past=screenBox.weeklyBinsKpi({month:'2026-09',asOf:'2026-10-01T17:00:00Z'},{event:'deliveredAt',cohort:[{deliveredAt:'2026-09-30T00:00:00Z'}]});assert.equal(past.length,5);assert.equal(past[4].label,'29–30');assert.equal(past[4].n,1);
});
test('load duration records the loader round without altering metric counts',async()=>{
 const s=await api.load(createClient(makeTables()),user,'creative','2026-09');assert.ok(Number.isFinite(s.loadDurationMs)&&s.loadDurationMs>=0);assert.equal(metric(s,'C04').value,18);
});
test('month preference survives screen remounts, is per-account and is only a preference',()=>{
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},now='2026-10-02T10:00:00Z';
 api.writeMonthPreference(storage,user,'2026-09',now);assert.equal(api.readMonthPreference(storage,user,now),'2026-09');assert.equal(api.readMonthPreference(storage,{...user,id:'other'},now),'2026-10');
 api.writeMonthPreference(storage,user,'2027-01',now);assert.equal(api.readMonthPreference(storage,user,now),'2026-09');
 assert.equal(api.readMonthPreference({getItem:()=>{throw Error('blocked')}},user,now),'2026-10');
 assert.equal(api.menuAllowed({id:'other',role:'member'}),false);
});
test('legacy creation dates cannot become a measured zero bounce rate',async()=>{
 const t=makeTables();t.work_item_events=t.work_item_events.filter(e=>e.event_type!=='created');const s=await api.load(createClient(t),user,'task','2026-09');assert.equal(metric(s,'T05').value,null);assert.equal(metric(s,'T05').cohort.length,0);assert.equal(metric(s,'T07').value,3);
});
test('work-source failure exposes a safe code for local diagnosis',async()=>{
 await assert.rejects(api.load(createClient(makeTables(),{response:r=>({...r,count:null})}),user,'requester','2026-09'),e=>e.code==='INCOMPLETE_RESPONSE');
});
test('denied server gate makes no table reads and a truthy string does not grant access',async()=>{
 for(const gate of [false,'true']){const c=createClient({}, {gate});await assert.rejects(api.load(c,user,'creative','2026-09'),e=>e.kind==='denied');assert.equal(c.calls.filter(q=>q.name).length,0);}
 assert.equal(api.menuAllowed({...user,role:'viewer'}),false);assert.equal(api.menuAllowed({...user,is_active:false}),false);
});
test('creative counts first lifetime delivery once, preserves archived work and unknown historical owner',async()=>{
 const t=makeTables();t.work_item_events.push({id:999,work_item_id:'creative-1',created_at:'2026-08-15T10:00:00Z',to_status:'delivered'});t.flowmate_creative_kpi_report_v[3].status='cancelled';
 const s=await api.load(createClient(t),user,'creative','2026-09');assert.equal(metric(s,'C04').value,16);assert.equal(api.metrics(s,{person:'unknown'}).find(m=>m.id==='C04').value,1);
 for(const id of ['C01','C02'])assert.equal(metric(s,id).value,null);
 assert.ok(metric(s,'C03').value>0);assert.ok(metric(s,'C03').eligible.length<metric(s,'C03').cohort.length);
 assert.ok(metric(s,'C04').cohort.some(f=>f.id==='creative-2'));assert.ok(!metric(s,'C04').cohort.some(f=>f.id==='creative-1'));
});
test('missing count, duplicate rows and truncated pages fail completeness',async()=>{
 for(const response of [r=>({...r,count:null}),r=>({...r,data:[...r.data,r.data[0]]}),r=>({...r,count:r.count+1}),r=>({...r,data:r.data.slice(0,-1)})]){
  const s=await api.load(createClient(makeTables(),{response:(r,q)=>q.name==='work_item_events'?response(r):r}),user,'creative','2026-09');assert.equal(s.partial,true);assert.equal(metric(s,'C04').value,null);assert.throws(()=>api.csv(s,metric(s,'C04')));
 }
});
test('latest submitted version must have exactly one matching receiver confirmation',()=>{
 const b=makeTables().creative_kpi_brief_evidence.filter(b=>b.work_item_id==='creative-1'),asOf='2026-10-02T10:00:00Z';assert.ok(api.validReady(b,asOf));
 assert.equal(api.validReady([...b,{...b[0],id:999,occurred_at:'2026-09-03T10:00:00Z'}],asOf),null);assert.equal(api.validReady([...b,{...b[1],id:999}],asOf),null);
 for(const patch of [{actor_user_id:''},{brief_link:'different'},{reason:''},{occurred_at:'2026-08-01T00:00:00Z'}])assert.equal(api.validReady([b[0],{...b[1],...patch}],asOf),null);
});
test('requester Brief Link coverage is independent of confirmation and never current priority for urgency',async()=>{
 const t=makeTables();t.flowmate_creative_kpi_report_v.forEach(w=>w.priority='urgent');const s=await api.load(createClient(t),user,'requester','2026-09');assert.equal(metric(s,'R03').value,14/18*100);assert.equal(metric(s,'R02').value,null);assert.equal(metric(s,'R01').value,null);assert.equal(api.metrics(s,{team:'Marketing'}).find(m=>m.id==='R03').cohort.length,9);
});
test('R03 counts the current Brief Link without receiver acceptance and ignores blank values',async()=>{
 const t=makeTables();t.creative_kpi_brief_evidence=[];
 t.creative_request_details[0].brief_link='  https://example.com/latest  ';
 t.creative_request_details[1].brief_link=' \t\n ';
 t.creative_request_details[2].brief_link=null;
 t.creative_request_details=t.creative_request_details.filter(r=>r.work_item_id!=='creative-5');
 const c=createClient(t),s=await api.load(c,user,'requester','2026-09'),m=metric(s,'R03');
 assert.equal(m.value,11/18*100);assert.equal(m.available,true);
 assert.equal(m.eligible.find(f=>f.id==='creative-1').briefLink,'https://example.com/latest');
 assert.equal(m.eligible.find(f=>f.id==='creative-1').readyAt,null);
 assert.equal(api.metricRows(m).find(r=>r.fact.id==='creative-2').result,'ยังไม่มี Brief Link');
 assert.ok(c.calls.some(q=>q.name==='creative_request_details'));
 assert.ok(c.calls.some(q=>q.name==='creative_kpi_brief_evidence')); // R01 reads confirmation; R03 still uses only Brief Link.
});
test('R03 never turns a failed or incomplete Brief Link read into a measured zero',async()=>{
 for(const options of [{fail:q=>q.name==='creative_request_details'},{response:(r,q)=>q.name==='creative_request_details'?{...r,count:null}:r}]){
  const s=await api.load(createClient(makeTables(),options),user,'requester','2026-09'),m=metric(s,'R03');
  assert.equal(s.partial,true);assert.equal(m.value,null);assert.equal(m.available,false);assert.throws(()=>api.csv(s,m));
 }
});
test('accepted brief history alone cannot satisfy R03 when the current Brief Link is empty',async()=>{
 const t=makeTables();t.creative_request_details.forEach(r=>r.brief_link='');
 const s=await api.load(createClient(t),user,'requester','2026-09');assert.equal(metric(s,'R03').value,0);
 assert.equal(metric(s,'R03').cohort.length,18);assert.equal(metric(s,'R01').value,null);
 assert.ok(api.validReady(t.creative_kpi_brief_evidence.filter(r=>r.work_item_id==='creative-1'),s.asOf));
});
test('requester bounds report reads to monthly base IDs and fails closed on candidate errors',async()=>{
 const c=createClient(makeTables());await api.load(c,user,'requester','2026-09');const reports=c.calls.filter(q=>q.name==='flowmate_creative_kpi_report_v');assert.ok(reports.length>0);assert.ok(reports.every(q=>q.filters.length>=4));
 await assert.rejects(api.load(createClient(makeTables(),{fail:q=>q.name==='work_items'}),user,'requester','2026-09'),e=>e.kind==='load');
});
test('task throughput requires explicit first approve and excludes canonical TEST',async()=>{
 const t=makeTables();t.work_item_events.push({id:999,work_item_id:'task-1',created_at:'2026-08-20T00:00:00Z',to_status:'delivered',metadata:{source:'task_assign_workspace',action:'approve'}});
 const s=await api.load(createClient(t,{tests:['task-2']}),user,'task','2026-09');assert.equal(metric(s,'T03').value,11);assert.equal(s.testExcluded,1);assert.equal(metric(s,'T07').value,3);assert.equal(metric(s,'T06').value,4/16*100);
 for(const id of ['T01','T10'])assert.equal(metric(s,id).value,null);assert.equal(api.metricRows(metric(s,'T06')).filter(r=>r.result==='มีการขอแก้หลังส่งตรวจ').length,4);
});
test('registry failure is closed, independent backlog survives failed history',async()=>{
 await assert.rejects(api.load(createClient(makeTables(),{classifierError:true}),user,'task','2026-09'));const s=await api.load(createClient(makeTables(),{fail:q=>q.name==='work_item_events'}),user,'task','2026-09');assert.equal(s.partial,true);assert.equal(metric(s,'T03').value,null);assert.equal(metric(s,'T07').value,3);
});
test('requested source failure does not erase complete throughput',async()=>{
 const s=await api.load(createClient(makeTables(),{fail:q=>q.name==='work_items'&&q.upperMonth}),user,'task','2026-09');assert.equal(s.resources.requested.status,'error');assert.equal(metric(s,'T05').value,null);assert.equal(metric(s,'T03').value,13);assert.equal(metric(s,'T07').value,3);
});
test('current backlog stays current for historical month; zero eligible rate is null',async()=>{
 const s=await api.load(createClient(makeTables()),user,'task','2026-07');assert.equal(metric(s,'T07').value,3);assert.equal(metric(s,'T03').value,0);assert.equal(metric(s,'T05').value,null);
});
test('abort interrupts hanging RPC and hanging queries',async()=>{
 for(const options of [{hangRpc:true},{hangQuery:true}]){const controller=new AbortController();const pending=api.load(createClient({},options),user,'creative','2026-09',controller.signal);setTimeout(()=>controller.abort(),10);await assert.rejects(pending);}
});
test('pagination reads every page and detects a changing count',async()=>{
 const t=makeTables();for(let i=1000;i<1210;i++)t.work_item_events.push({id:i,work_item_id:'creative-1',created_at:'2026-09-10T00:00:00Z',to_status:'review',metadata:{}});
 const c=createClient(t);const s=await api.load(c,user,'creative','2026-09');assert.equal(s.partial,false);assert.ok(c.calls.some(q=>q.start===200));const broken=await api.load(createClient(t,{response:(r,q)=>q.name==='work_item_events'&&q.start===200?{...r,count:r.count+1}:r}),user,'creative','2026-09');assert.equal(metric(broken,'C04').value,null);
});
test('CSV uses filtered evidence and escapes formulas; scope keys isolate viewers',async()=>{
 const t=makeTables();t.flowmate_creative_kpi_report_v[0].title='=HYPERLINK("bad")';const s=await api.load(createClient(t),user,'creative','2026-09');const m=api.metrics(s,{person:'designer-a'}).find(m=>m.id==='C04'),csv=api.csv(s,m);assert.equal(csv.split('\r\n').length,m.cohort.length+1);assert.ok(csv.includes("'=HYPERLINK"));assert.notEqual(api.scopeKey(user),api.scopeKey({...user,id:'other'}));assert.notEqual(api.scopeKey(user),api.scopeKey({...user,can_access_all_teams:false}));
});
test('changes before first submit do not inflate post-submit rework',async()=>{
 const t=makeTables();t.work_item_events.push({id:999,work_item_id:'task-1',created_at:'2026-09-02T00:00:00Z',metadata:{source:'task_assign_workspace',action:'request_changes'}});
 const s=await api.load(createClient(t),user,'task','2026-09');assert.equal(metric(s,'T06').value,4/17*100);
});
test('CSV guards formula text preceded by whitespace or a line break',async()=>{
 for(const title of ['  =FORMULA()','\n=FORMULA()','\ttext']){const t=makeTables();t.flowmate_creative_kpi_report_v[0].title=title;const s=await api.load(createClient(t),user,'creative','2026-09');assert.ok(api.csv(s,metric(s,'C04')).includes('"\''+title+'"'));}
});
test('Requester CSV round-trips quoted Thai content and matches team and missing-brief cohorts',async()=>{
 const parse=text=>{
  const rows=[];let row=[],field='',quoted=false;
  for(let i=0;i<text.length;i++){
   const ch=text[i];
   if(ch==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
   else if(ch===','&&!quoted){row.push(field);field='';}
   else if(ch==='\r'&&text[i+1]==='\n'&&!quoted){row.push(field);rows.push(row);row=[];field='';i++;}
   else field+=ch;
  }
  assert.equal(quoted,false);row.push(field);rows.push(row);return rows;
 };
 const t=makeTables();t.flowmate_creative_kpi_report_v[0].title='บรีฟ "รุ่นใหม่", สองบรรทัด\r\nรายละเอียดงาน';
 const s=await api.load(createClient(t),user,'requester','2026-09');
 for(const filters of [{},{team:'Marketing'}]){
  const m=api.metrics(s,filters).find(m=>m.id==='R03');
  for(const missing of [false,true]){
   const expected=api.metricRows(m).filter(r=>!missing||!r.fact.briefLink);
   const selected={...m,cohort:expected.map(r=>r.fact)},[headers,...rows]=parse(api.csv(s,selected));
   assert.equal(headers.length,12);assert.ok(rows.every(r=>r.length===headers.length));assert.equal(rows.length,expected.length);
   assert.equal(new Set(rows.map(r=>r[5])).size,rows.length);
   assert.deepEqual(rows.map(r=>r[5]).sort(),Array.from(expected,r=>r.fact.displayId).sort());
   for(const row of rows){const fact=expected.find(r=>r.fact.displayId===row[5]).fact;assert.equal(row[6],fact.title);assert.equal(row[7],fact.team);assert.equal(row[9],fact.readyAt??'');assert.equal(row[10],fact.briefLink);assert.equal(row[11],fact.briefLink?'มี Brief Link':'ยังไม่มี Brief Link');}
   if(filters.team)assert.ok(rows.every(r=>r[7]===filters.team));if(missing)assert.ok(rows.every(r=>r[10]===''));
  }
 }
});
test('entry pages load model and screen before app with one synchronized release stamp',()=>{
 let stamp;
 for(const file of ['index.html','home/index.html','product-book/index.html']){const text=fs.readFileSync(file,'utf8');assert.ok(text.indexOf('kpi-workspace.js')<text.indexOf('screens-kpi.js'));assert.ok(text.indexOf('screens-kpi.js')<text.indexOf('src="app.js'));const current=text.match(/kpi-workspace\.js\?v=([^"']+)/)?.[1];assert.ok(current);stamp??=current;assert.equal(current,stamp);for(const asset of ['kpi-workspace.css','kpi-workspace.js','screens-kpi.js','app.js'])assert.ok(text.includes(`${asset}?v=${stamp}`));}
});
test('KPI navigation keeps viewer and ordinary member restrictions',()=>{
 const source=fs.readFileSync('app.jsx','utf8'),sandbox={window:{FlowMateKpi:api}};const fn=name=>source.slice(source.indexOf(`function ${name}(`),source.indexOf('\n}',source.indexOf(`function ${name}(`))+2);
 vm.runInNewContext(source.slice(source.indexOf('const NAV = ['),source.indexOf('const MARKETING_PLAN_HASH_KEYS'))+'\n'+fn('getVisibleNavGroups')+'\n'+fn('isFlowMateRouteAllowedForRole'),sandbox);
 assert.ok(sandbox.getVisibleNavGroups('member',user).flatMap(g=>g.items).some(i=>i.key==='kpi-task'));assert.equal(sandbox.isFlowMateRouteAllowedForRole('member','kpi-task',user),true);assert.equal(sandbox.isFlowMateRouteAllowedForRole('member','kpi-task',{id:'ordinary',role:'member'}),false);assert.equal(sandbox.isFlowMateRouteAllowedForRole('viewer','kpi-task',{...user,role:'viewer'}),false);
});
