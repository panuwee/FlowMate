import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

// Exercise the shipped policy without a browser, database, or network.
const api=new Function('window',readFileSync('activity-automation-monitor.js','utf8')+'; return window.ActivityAutomationMonitor;')({});
const operator={mode:'production',controls:true,now:Date.parse('2026-12-01T05:00:00Z')};
const keys=['battle_pass','membership','conqueror_crate','golden_spin','topup_promotion'];
const row=(key:string,delta:any={})=>({key,manualMode:true,projectCode:'261201_'+key,period:'2026-12',...delta});

it.each(keys)('uses the same guarded creation and human-review journey for %s',key=>{
 expect(api.workflow(row(key),operator)).toMatchObject({phase:'ready',action:'confirm',cta:'ตรวจและสร้างงาน'});
 expect(api.workflow(row(key),{...operator,controls:false}).action).toBe('details');
 expect(api.workflow(row(key),{...operator,mode:'test'}).action).toBe('details');
 expect(api.workflow(row(key,{manualJob:{status:'complete'},workflowOutput:{briefState:'pending',assignmentState:'unassigned'}}),operator))
  .toMatchObject({phase:'review',action:'review',cta:'ตรวจบรีฟ'});
 expect(api.workflow(row(key,{manualJob:{status:'complete'},workflowOutput:{briefState:'accepted',assignmentState:'unassigned'}}),operator))
  .toMatchObject({phase:'assignment',action:'review'});
});
it.each(keys)('keeps existing, held, uncertain, and expired work from starting another %s request',key=>{
 for(const status of ['existing','held','unexpected'])expect(api.workflow(row(key,{manualJob:{status}}),operator).action).toBe('details');
 expect(api.workflow(row(key,{manualJob:{status:'running',updatedAt:'2026-12-01T04:59:00Z'}}),operator)).toMatchObject({phase:'running',action:'refresh'});
 expect(api.workflow(row(key,{manualJob:{status:'running',updatedAt:'2026-12-01T04:40:00Z'}}),operator)).toMatchObject({phase:'uncertain',action:'refresh'});
 expect(api.workflow(row(key,{lastRun:{status:'review_required'}}),operator)).toMatchObject({phase:'held',action:'details'});
});
it('does not ask for another confirmation solely because SSoT passed',()=>{
 const a={key:'battle_pass',lastSourceCheck:{sourceReady:true,confirmed:true,workingSheetLinked:true,code:'source_ready'}};
 expect(api.workflow(a,operator)).toMatchObject({phase:'waiting_system',action:'refresh'});
 expect(api.workflow({...a,lastSourceCheck:{...a.lastSourceCheck,code:undefined}},operator)).toMatchObject({phase:'waiting_system',action:'refresh'});
 expect(api.workflow({...a,lastSourceCheck:{...a.lastSourceCheck,code:'confirmation_stale'}},operator))
  .toMatchObject({phase:'confirmation',action:'confirm'});
});
it('uses fresh source evidence ahead of an older run failure',()=>{
 const a={key:'membership',lastRun:{status:'failed',code:'source_identity_invalid',eventAt:'2026-11-01T00:00Z'},
  lastSourceCheck:{sourceReady:true,confirmed:true,checkedAt:'2026-11-01T01:00Z',code:'source_ready'}};
 expect(api.workflow(a,operator)).toMatchObject({phase:'waiting_system',action:'refresh'});
});
it('does not hide recorded validation errors behind a manual-ready state',()=>{
 expect(api.workflow(row('golden_spin',{lastSourceCheck:{code:'source_identity_invalid'}}),operator))
  .toMatchObject({phase:'blocked',action:'details',priority:0});
 expect(api.workflow(row('golden_spin',{lastSourceCheck:{code:'working_sheet_invalid'}}),operator))
  .toMatchObject({phase:'sheet',action:'confirm'});
 expect(api.workflow(row('golden_spin',{lastSourceCheck:{code:'new_validation_gate'}}),operator))
  .toMatchObject({phase:'blocked',action:'details'});
});
