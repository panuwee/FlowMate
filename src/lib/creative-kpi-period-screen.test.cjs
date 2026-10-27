const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),{act}=React;
const model=require('../../creative-kpi-report.js');
const {summarizeTiming}=require('../../scripts/check-creative-kpi-timing.cjs');
const row=(month=10)=>({work_item_id:'task-'+month,display_id:'CR-'+month,title:'Synthetic task '+month,status:'delivered',
 created_at:`2026-${String(month).padStart(2,'0')}-01T00:00:00+07:00`,
 delivery_at:`2026-${String(month).padStart(2,'0')}-03T00:00:00+07:00`,
 review_submitted_at:`2026-${String(month).padStart(2,'0')}-02T00:00:00+07:00`,
 acknowledge_at:null,delivered_ai_tags:[],owner_member_id_at_start:'designer',owner_name_at_start:'Designer',owner_member_code:'ploy',
 delivered_owner_member_id:'designer',delivered_owner_name:'Designer',delivered_owner_code:'ploy',
 ai_tags:[],data_quality_flags:[],exception_flags:[]});
const snapshot=(month=10,rows=[row(month||10)],asOf='2026-10-27T00:00:00Z')=>({year:2026,month,scope:month===null?'year':'month',rows,asOf,calendarActiveN:0});
async function harness({timing=false}={}){
 const {Window}=await import('happy-dom');const window=new Window({url:'http://localhost/'+(timing?'?kpiTiming=1':'')});
 let elapsed=0,frameId=0;const frames=new Map();
 if(timing){
  Object.defineProperty(window,'performance',{value:{now:()=>elapsed},configurable:true});
  window.requestAnimationFrame=callback=>{frames.set(++frameId,callback);return frameId;};
  window.cancelAnimationFrame=id=>frames.delete(id);
 }
 const saved={window:global.window,document:global.document,act:global.IS_REACT_ACT_ENVIRONMENT};
 global.window=window;global.document=window.document;global.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=require('react-dom/client');
 const calls=[];
 window.FlowMateCreativeReport=model;
 window.loadFlowMateCreativePeriod=args=>new Promise((resolve,reject)=>calls.push({args,resolve,reject}));
 window.flowmateDownloadWorkbook=()=>{throw Error('Unexpected export');};
 class FixedDate extends Date{constructor(...args){super(...(args.length?args:['2026-10-27T00:00:00Z']));}}
 const context=vm.createContext({React,window,Date:FixedDate,AbortController});
 vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../screens-creative-kpi.js'),'utf8'),context);
 if(timing){elapsed=20;window.FlowMateCreativeKpiTiming.markBoot('authStartMs');elapsed=1000;window.FlowMateCreativeKpiTiming.markBoot('authResolvedMs');elapsed=1600;}
 const container=window.document.createElement('div');window.document.body.append(container);const root=createRoot(container);
 await act(async()=>root.render(React.createElement(context.FlowMateCreativeReportScreen,{requesterView:()=>null})));
 return {window,container,calls,
  tick:value=>{elapsed=value;},
  frame:()=>{const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback(elapsed));},
  timing:()=>JSON.parse(container.querySelector('[data-kpi-timing]')?.getAttribute('data-kpi-timing')||'null'),
  settle:async(index,data,error)=>act(async()=>{if(error)calls[index].reject(error);else calls[index].resolve(data);}),
  change:async(label,value)=>act(async()=>{const el=container.querySelector(`[aria-label="${label}"]`);el.value=String(value);el.dispatchEvent(new window.Event('change',{bubbles:true}));}),
  click:async(text)=>act(async()=>{const el=[...container.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(el,text);el.click();}),
  close:async()=>{await act(async()=>root.unmount());await window.happyDOM.close();global.window=saved.window;global.document=saved.document;global.IS_REACT_ACT_ENVIRONMENT=saved.act;}
 };
}
test('monthly cards and task evidence appear before annual chart and export, then replace together',async()=>{
 const h=await harness();try{
  assert.equal(h.calls[0].args.month,10);assert.equal(h.calls.length,1);
  assert.equal(h.window.FlowMateCreativeKpiTiming,null);assert.equal(h.timing(),null);
  await h.settle(0,snapshot());
  assert.equal(h.container.querySelectorAll('[data-testid="creative-selected-kpis"] section').length,6);
  assert.match(h.container.textContent,/Synthetic task 10/);
  assert.equal(h.container.querySelector('[data-testid="creative-report-export"]').disabled,true);
  assert.equal(h.container.querySelector('[aria-label="Report person"]').disabled,true);
  assert.equal(h.container.querySelector('svg'),null);assert.doesNotMatch(h.container.textContent,/ตารางรายเดือนทั้งปี/);
  assert.equal(h.calls.length,2);assert.equal(h.calls[1].args.month,null);
  await h.settle(1,snapshot(null,[row(9),row(10)],'2026-10-27T00:01:00Z'));
  assert.equal(h.container.querySelector('[data-coverage]').dataset.coverage,'year');
  assert.equal(h.container.querySelector('[data-testid="creative-report-export"]').disabled,false);
  assert.ok(h.container.querySelector('svg'));assert.match(h.container.textContent,/07:01/);
  await h.change('Report month',9);assert.equal(h.calls.length,2);assert.match(h.container.textContent,/Synthetic task 9/);
 }finally{await h.close();}
});
test('opt-in timings distinguish auth, monthly response, committed evidence and annual readiness without another request',async()=>{
 const h=await harness({timing:true});try{
  assert.equal(h.calls.length,1);
  assert.equal(h.timing().marks.authStartMs,20);assert.equal(h.timing().marks.authResolvedMs,1000);
  assert.equal(h.timing().marks.screenEffectMs,1600);assert.equal(h.timing().marks.monthRequestStartMs,1600);
  h.tick(3800);await h.settle(0,snapshot());
  assert.equal(h.timing().marks.monthResponseValidatedMs,3800);assert.equal(h.timing().marks.monthCommitMs,3800);
  assert.equal(h.timing().marks.monthPaintOpportunityMs,undefined);assert.equal(h.calls.length,2);
  h.tick(3816);h.frame();assert.equal(h.timing().marks.monthPaintOpportunityMs,undefined);
  h.tick(3832);h.frame();assert.equal(h.timing().marks.monthPaintOpportunityMs,3832);
  const result=summarizeTiming(h.timing());
  assert.equal(result.verdict,'over-target');assert.equal(result.authMs,980);
  assert.equal(result.monthlyRequestAndValidationMs,2200);
  assert.equal(h.container.querySelector('[data-testid="creative-report-export"]').disabled,true);
  h.tick(7500);await h.settle(1,snapshot(null));
  assert.equal(h.timing().marks.yearResponseValidatedMs,7500);assert.equal(h.timing().marks.yearCommitMs,7500);
  assert.equal(h.container.querySelector('[data-testid="creative-report-export"]').disabled,false);
  h.tick(7516);h.frame();h.tick(7532);h.frame();assert.equal(h.timing().marks.yearPaintOpportunityMs,7532);
  assert.equal(h.calls.length,2);
  assert.doesNotMatch(JSON.stringify(h.timing()),/Synthetic|designer|CR-|task-|token|http|2026/);
 }finally{await h.close();}
});
test('a fast committed render without a visible paint opportunity cannot pass the timing acceptance gate',async()=>{
 const h=await harness({timing:true});try{
  Object.defineProperty(h.window.document,'hidden',{value:true,configurable:true});
  h.tick(2000);await h.settle(0,snapshot());h.frame();h.frame();
  assert.equal(h.timing().marks.monthCommitMs,2000);
  assert.equal(summarizeTiming(h.timing()).verdict,'incomplete');
  h.tick(2200);await h.settle(1,snapshot(null));
  await h.change('Report month',9);
  assert.equal(summarizeTiming(h.timing()).verdict,'ineligible-cached');
  assert.equal(h.calls.length,2);
 }finally{await h.close();}
});
test('a visible complete monthly report inside the budget passes without waiting for annual export',async()=>{
 const h=await harness({timing:true});try{
  h.tick(2500);await h.settle(0,snapshot());
  h.tick(2516);h.frame();h.tick(2532);h.frame();
  assert.equal(summarizeTiming(h.timing()).verdict,'within-target');
  assert.equal(h.container.querySelector('[data-testid="creative-report-export"]').disabled,true);
  assert.equal(h.calls.length,2);
 }finally{await h.close();}
});
test('diagnostic observations cannot be overwritten by a cancelled request or pending paint callback',async()=>{
 const h=await harness({timing:true});try{
  h.tick(3800);await h.settle(0,snapshot());
  h.tick(4000);await h.change('Report month',9);
  assert.equal(h.timing().marks.monthCommitMs,undefined);
  h.frame();h.frame();assert.equal(h.timing().marks.monthPaintOpportunityMs,undefined);
  h.tick(4500);await h.settle(1,snapshot(null));
  assert.equal(h.timing().marks.yearResponseValidatedMs,undefined);
  h.tick(6000);await h.settle(2,snapshot(9));
  assert.equal(h.timing().marks.monthResponseValidatedMs,6000);assert.equal(h.timing().marks.monthCommitMs,6000);
  assert.equal(h.calls.length,4);
 }finally{await h.close();}
});
test('month switches abort old requests and late annual replies cannot overwrite the selected month',async()=>{
 const h=await harness();try{
  await h.settle(0,snapshot());await h.change('Report month',9);
  assert.equal(h.calls[1].args.signal.aborted,true);assert.equal(h.calls[2].args.month,9);
  assert.equal(h.container.querySelector('[data-testid="creative-selected-kpis"]'),null);
  await h.settle(1,snapshot(null));assert.equal(h.container.querySelector('[data-testid="creative-selected-kpis"]'),null);
  await h.settle(2,snapshot(9));assert.match(h.container.textContent,/Synthetic task 9/);assert.doesNotMatch(h.container.textContent,/Synthetic task 10/);
  assert.equal(h.calls[3].args.month,null);
 }finally{await h.close();}
});
test('annual failure retains monthly evidence; retry only loads annual data; access loss clears it',async()=>{
 const h=await harness();try{
  await h.settle(0,snapshot());await h.settle(1,null,new Error('Annual timed out'));
  assert.ok(h.container.querySelector('[data-testid="creative-selected-kpis"]'));
  assert.match(h.container.textContent,/Annual timed out/);assert.equal(h.container.querySelector('[data-testid="creative-report-export"]').disabled,true);
  await h.click('ลองโหลดทั้งปีอีกครั้ง');assert.equal(h.calls.length,3);assert.equal(h.calls[2].args.month,null);
  await h.settle(2,null,Object.assign(new Error('Access changed'),{accessDenied:true}));
  assert.equal(h.container.querySelector('[data-testid="creative-selected-kpis"]'),null);
  assert.doesNotMatch(h.container.textContent,/Synthetic task 10/);
  await h.click('Refresh');assert.equal(h.calls[3].args.month,10);
 }finally{await h.close();}
});
test('monthly errors stop the sequence and choosing whole year never renders a partial annual report',async()=>{
 const h=await harness();try{
  await h.settle(0,null,new Error('Month failed'));assert.equal(h.calls.length,1);assert.match(h.container.textContent,/Month failed/);
  await h.change('Report month','');assert.equal(h.calls.length,2);assert.equal(h.calls[1].args.month,null);
  assert.equal(h.container.querySelector('[data-testid="creative-selected-kpis"]'),null);
  await h.settle(1,snapshot(null));assert.equal(h.container.querySelector('[data-testid="creative-report-export"]').disabled,false);
 }finally{await h.close();}
});
