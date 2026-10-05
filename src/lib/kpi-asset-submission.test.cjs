const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {createClient,makeTables}=require('./fixtures/kpi-fixture.cjs');
const box={exports:{},AbortController,Date,Intl,setTimeout,clearTimeout};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('kpi-workspace.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,box);
const api=box.FlowMateKpi,user={id:'lead',role:'admin'},metric=(s,id)=>api.metrics(s).find(m=>m.id===id);
function event(id,kind,at,extra={}){return {id,work_item_id:'new-open',actor_user_id:'receiver',created_at:at,metadata:{action:'add_link',kpi_evidence_source:'link_zone_v1',link_kind:kind,link_id:'link-'+id,url:'https://example.test/asset'},...extra};}
function tables(){const t=makeTables();const w={id:'new-open',work_item_id:'new-open',display_id:'CR-OPEN',title:'Open Creative',status:'in_progress',work_type:'creative_request',created_at:'2026-08-01T00:00:00Z',due_date:'2026-09-02',final_approved_due_date:'2026-09-04'};t.work_items.push(w);t.flowmate_creative_kpi_report_v.push(w);return t;}
test('typed-only open work enters the cohort; first draft and final asset have separate clocks and dues',async()=>{
 const t=tables();t.work_item_events.push(event(1001,'first_draft','2026-09-02T16:59:59Z'),event(1002,'final_asset','2026-09-04T17:00:00Z'));
 const s=await api.load(createClient(t),user,'creative','2026-09');
 assert.equal(metric(s,'C01').value,100);assert.equal(metric(s,'C02').value,0);
 assert.equal(metric(s,'C01').event,'firstDraftAt');assert.equal(metric(s,'C02').event,'finalAssetAt');
 assert.equal(metric(s,'C04').value,18);assert.equal(api.facts(s).find(f=>f.id==='new-open').deliveredAt,null);
 const csv=api.csv(s,metric(s,'C02'));assert.ok(csv.includes('asset_due_date'));assert.ok(csv.includes('2026-09-04'));assert.ok(csv.includes('Missed'));
});
test('subsequent links do not replace first submission, even after visible links are removed',async()=>{
 const t=tables();t.work_item_events.push(event(1001,'first_draft','2026-09-01T01:00:00Z'),event(1002,'first_draft','2026-09-10T01:00:00Z'));
 const s=await api.load(createClient(t),user,'creative','2026-09');assert.equal(metric(s,'C01').value,100);assert.equal(metric(s,'C01').cohort.length,1);assert.equal(api.facts(s).find(f=>f.id==='new-open').firstDraftAt,'2026-09-01T01:00:00Z');
});
test('legacy links, review status and incomplete event proof cannot become typed submission evidence',async()=>{
 const t=tables();t.work_item_events.push(event(1001,'general','2026-09-01T01:00:00Z'),event(1002,'first_draft','2026-09-02T01:00:00Z',{actor_user_id:null}),event(1003,'first_draft','2026-09-03T01:00:00Z',{metadata:{action:'add_link',link_kind:'first_draft'}}));
 const s=await api.load(createClient(t),user,'creative','2026-09');assert.equal(metric(s,'C01').value,null);assert.equal(metric(s,'C02').value,null);
});
test('month uses first lifetime typed event; later revisions and future evidence are excluded',async()=>{
 const t=tables();t.work_item_events.push(event(1001,'first_draft','2026-08-31T16:59:59Z'),event(1002,'first_draft','2026-09-10T01:00:00Z'),event(1003,'final_asset','2099-01-01T00:00:00Z'));
 const s=await api.load(createClient(t),user,'creative','2026-09');assert.equal(metric(s,'C01').cohort.length,0);assert.equal(metric(s,'C02').cohort.length,0);
});
test('missing due dates and failed date/event sources produce unavailable metrics, not zero',async()=>{
 const t=tables();t.work_items.find(w=>w.id==='new-open').due_date=null;t.work_item_events.push(event(1001,'first_draft','2026-09-01T01:00:00Z'));
 let s=await api.load(createClient(t),user,'creative','2026-09');assert.equal(metric(s,'C01').cohort.length,1);assert.equal(metric(s,'C01').value,null);
 s=await api.load(createClient(t,{fail:q=>q.name==='work_items'}),user,'creative','2026-09');assert.equal(s.partial,true);assert.equal(metric(s,'C01').value,null);
 s=await api.load(createClient(t),user,'creative','2026-09');s.resources.assetCandidates.status='error';assert.equal(metric(s,'C01').value,null);
});
test('KPI UI copy is English and removed explanatory blocks and C03 do not appear',()=>{
 const ui=fs.readFileSync('screens-kpi.jsx','utf8'),data=fs.readFileSync('kpi-workspace.ts','utf8');
 assert.ok(!/[\u0E00-\u0E7F]/.test(ui));assert.ok(!/[\u0E00-\u0E7F]/.test(data));assert.ok(!ui.includes('kpi-workspace__definition'));assert.ok(!ui.includes('Asia/Bangkok ·'));assert.ok(!ui.includes('api.version'));
});
