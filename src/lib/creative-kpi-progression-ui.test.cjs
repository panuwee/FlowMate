const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const preview=require('../../scripts/kpi-progression/preview.cjs');
test('rendered monthly screen switches cohorts and exports the selected summary with matching AI list',async()=>{
 const {Window}=await import('happy-dom'),w=new Window({url:'http://localhost'});
 try{
  w.document.body.innerHTML='<div id="root"></div>';
  for(const p of [preview.react,preview.reactDom,'creative-kpi-report.js','screens-creative-kpi.js'])w.eval(fs.readFileSync(p,'utf8'));
  w.eval(preview.boot);await new Promise(r=>setTimeout(r,100));
  const select=w.document.querySelector('[aria-label="Report month"]');select.value='9';select.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,30));
  let values=[...w.document.querySelectorAll('.creative-report__value')].map(e=>e.textContent);
  assert.equal(values[0],'20');assert.equal(values[1],'8');assert.equal(values.length,6);
  const buttons=[...w.document.querySelectorAll('.creative-report__month-controls button')];assert.equal(buttons.length,12);buttons[7].click();await new Promise(r=>setTimeout(r,30));
  values=[...w.document.querySelectorAll('.creative-report__value')].map(e=>e.textContent);assert.equal(values[0],'16');
  w.document.querySelector('[data-testid="creative-report-export"]').click();
  const sheets=w.previewExports[0].sheets,summary=sheets.find(s=>s.name==='Selected summary');assert.equal(summary.rows[1][4],16);assert.equal(sheets.find(s=>s.name==='AI tasks').rows.length,9);
  select.value='12';select.dispatchEvent(new w.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,30));assert.equal(w.document.querySelector('.creative-report__value').textContent,'—');
 }finally{await w.happyDOM.close();}
});
test('brief panel blocks acceptance without a confirmation note',async()=>{
 const {Window}=await import('happy-dom'),w=new Window();
 try{
  w.document.body.innerHTML='<div id="root"></div>';
  for(const p of [preview.react,preview.reactDom,'screens-creative-kpi.js'])w.eval(fs.readFileSync(p,'utf8'));
  w.calls=[];w.flowmateSupabase={rpc:async(name,args)=>{w.calls.push({name,args});return {data:{can_submit:false,can_accept:true,history:[{id:3,action:'submitted',reason:'v3'}]}};}};
  w.eval("ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(FlowMateCreativeBriefEvidence,{workItemId:'demo'}))");await new Promise(r=>setTimeout(r,80));
  const button=[...w.document.querySelectorAll('button')].find(b=>b.textContent.includes('ยืนยันบรีฟครบ'));button.click();await new Promise(r=>setTimeout(r,30));assert.equal(w.calls.length,1);assert.ok(w.document.querySelector('[role="alert"]'));
 }finally{await w.happyDOM.close();}
});
