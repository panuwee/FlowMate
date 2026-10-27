const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const React=require('react'),{act}=React;
const model=require('../../creative-kpi-report.js');
const row=(month=10)=>({work_item_id:'task-'+month,display_id:'CR-'+month,title:'Synthetic task '+month,status:'delivered',
 created_at:`2026-${String(month).padStart(2,'0')}-01T00:00:00+07:00`,
 delivery_at:`2026-${String(month).padStart(2,'0')}-03T00:00:00+07:00`,
 review_submitted_at:`2026-${String(month).padStart(2,'0')}-02T00:00:00+07:00`,
 acknowledge_at:null,delivered_ai_tags:[],owner_member_id_at_start:'designer',owner_name_at_start:'Designer',owner_member_code:'ploy',
 delivered_owner_member_id:'designer',delivered_owner_name:'Designer',delivered_owner_code:'ploy',
 ai_tags:[],data_quality_flags:[],exception_flags:[]});
const snapshot=(month=10,rows=[row(month||10)],asOf='2026-10-27T00:00:00Z')=>({year:2026,month,scope:month===null?'year':'month',rows,asOf,calendarActiveN:0});
async function harness(){
 const {Window}=await import('happy-dom');const window=new Window({url:'http://localhost/'});
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
 const container=window.document.createElement('div');window.document.body.append(container);const root=createRoot(container);
 await act(async()=>root.render(React.createElement(context.FlowMateCreativeReportScreen,{requesterView:()=>null})));
 return {window,container,calls,
  settle:async(index,data,error)=>act(async()=>{if(error)calls[index].reject(error);else calls[index].resolve(data);}),
  change:async(label,value)=>act(async()=>{const el=container.querySelector(`[aria-label="${label}"]`);el.value=String(value);el.dispatchEvent(new window.Event('change',{bubbles:true}));}),
  click:async(text)=>act(async()=>{const el=[...container.querySelectorAll('button')].find(b=>b.textContent===text);assert.ok(el,text);el.click();}),
  close:async()=>{await act(async()=>root.unmount());await window.happyDOM.close();global.window=saved.window;global.document=saved.document;global.IS_REACT_ACT_ENVIRONMENT=saved.act;}
 };
}
test('monthly cards and task evidence appear before annual chart and export, then replace together',async()=>{
 const h=await harness();try{
  assert.equal(h.calls[0].args.month,10);assert.equal(h.calls.length,1);
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
