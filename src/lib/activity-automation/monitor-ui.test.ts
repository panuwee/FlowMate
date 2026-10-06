import {afterEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';

const script=readFileSync('activity-automation-monitor.js','utf8');
const html=readFileSync('home/Activity-Automation.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
const windows:any[]=[];
const tick=()=>new Promise(r=>setTimeout(r,25));
const envelope=(data:any,sources:any[]=[{source:'shared',status:'ok'}])=>({data:{version:1,observedAt:'2026-09-18T06:00:00Z',sources,data}});
const activity={key:'conqueror_crate',label:'Conqueror Crate',sourceSystem:'shared',configurationScope:'shared_4_activities',runnerEnabled:true,notifierEnabled:false,schedulerState:'not_configured',schedule:null,lastRun:{status:'ready_for_review'},lastSourceCheck:{status:'complete',sourceCheckedAt:'2026-09-18T04:00:00Z'}};
const output={activity:'conqueror_crate',displayId:'CR-1265',projectCode:'Conqueror TEST',campaignStart:'2026-09-18',campaignEnd:'2026-09-25',generationState:'ready_for_review',briefState:'pending',assignmentState:'assigned',briefUrl:'https://docs.google.com/presentation/d/deck_123/edit',crUrl:'https://panuwee.github.io/FlowMate/home/?cr=CR-1265'};
const summary=()=>({cards:{supportedActivities:4,outputs:1,pendingBriefs:1,attention:0,complete:true},activities:[{...activity}],attention:[],outputs:[{...output}]});
async function page(options:any={}){
 const w:any=new Window({url:'http://localhost/FlowMate/home/Activity-Automation.html'+(options.query||'')});windows.push(w);w.document.write(html);
 const dialog=w.document.getElementById('am-drawer');dialog.showModal=()=>{dialog.open=true;};dialog.close=()=>{dialog.open=false;};
 const calls:any[]=[];let callback:any;
 w.flowmateSupabase={auth:{getUser:async()=>({data:{user:options.signedOut?null:{id:'ops'}}}),onAuthStateChange:(cb:any)=>{callback=cb;}},rpc:async(name:string,args:any)=>{calls.push({name,args});if(options.rpc){const custom=await options.rpc(name,args);if(custom!==undefined)return custom;}if(name.endsWith('_access'))return envelope({sharedRead:true,battlePassRead:false,battlePassControls:false});if(name.endsWith('_summary'))return envelope(summary());if(name.endsWith('_run'))return envelope({run:{source:'shared',id:args.p_run_id,activity:'conqueror_crate',status:'ready_for_review'},outputs:[output],timeline:[{step:'generation',status:'ready_for_review',at:'2026-09-18T04:00:00Z'}]});return envelope({rows:[],hasMore:false,nextCursor:null});}};
 w.eval(script);await tick();return {w,calls,auth:(event:string,session:any)=>callback(event,session),$: (id:string)=>w.document.getElementById(id)};
}
afterEach(async()=>{await Promise.all(windows.splice(0).map(w=>w.happyDOM.close()));});
it('labels Battle Pass source evidence and outputs while retaining the CR link',async()=>{
 const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities:[{...activity,key:'battle_pass',label:'Battle Pass',lastSourceCheck:{period:'2026-11',sourceReady:false,confirmed:false}}],outputs:[{...output,activity:'battle_pass',source:'battle_pass',projectCode:null,outputId:'production:2026-10',displayId:'CR-1326',campaignStart:'2026-10-12',campaignEnd:'2026-11-10'}]}):undefined});
 const text=p.$('am-content').textContent;
 expect(text).toContain('Battle Pass (Nov 2026)');
 expect(text).toContain('261012_Battle Pass (Oct 2026)');
 expect(text).toContain('เปิด CR-1326 เพื่อตรวจบรีฟ');
});
it('preserves supplied Battle Pass project codes over derived names',async()=>{
 const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),outputs:[{...output,activity:'battle_pass',projectCode:'261012_Battle Pass (Oct 2026)',campaignStart:'2026-11-01'}]}):undefined});
 expect(p.$('am-content').textContent).toContain('261012_Battle Pass (Oct 2026)');
 expect(p.$('am-content').textContent).not.toContain('261101_Battle Pass');
});
it('uses the Battle Pass output period even when its start date is in another month',async()=>{
 const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),outputs:[{...output,activity:'battle_pass',projectCode:null,outputId:'production:2026-10',campaignStart:'2026-09-28'}]}):undefined});
 expect(p.$('am-content').textContent).toContain('260928_Battle Pass (Oct 2026)');
 expect(p.$('am-content').textContent).not.toContain('Battle Pass (Sep 2026)');
});
it('shows completed and waiting Golden Spin projects separately',async()=>{
 const projects=[{projectCode:'261005_Golden Spin (No.7)',lastRun:{projectCode:'261005_Golden Spin (No.7)',status:'complete',eventAt:'2026-10-01T05:00Z'},lastSourceCheck:{projectCode:'261005_Golden Spin (No.7)',code:'source_ready',checkedAt:'2026-10-01T04:00Z'}},{projectCode:'261019_Golden Spin (LE)',lastRun:null,lastSourceCheck:{projectCode:'261019_Golden Spin (LE)',code:'waiting_confirmation',confirmed:false}}];
 const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities:[{...activity,key:'golden_spin',projects}]}):undefined});
 const text=p.$('am-content').textContent;expect(text).toContain('261005_Golden Spin (No.7)');expect(text).toContain('Done — สร้างแล้ว');expect(text).toContain('261019_Golden Spin (LE)');expect(text).toContain('รอยืนยันต้นทาง');
});
const diagnosisRun='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
it.each([false,true])('merges repeated source checks by project and hides checks for Done (reverse=%s)',async reverse=>{
 const older='2026-10-05T09:30:00Z',latest='2026-10-06T04:00:00Z';
 const codes=['261015_Conqueror Crate (Oct 2026)','261005_Golden Spin (No.7)','261019_Golden Spin (LE)'];
 const activities=codes.map((projectCode,index)=>{
  const projects=[older,latest].map(checkedAt=>({projectCode,lastRun:null,lastSourceCheck:{code:index<2&&checkedAt===older?'existing_output_complete':'waiting_confirmation',confirmed:false,checkedAt}}));
  return {...activity,key:index===0?'conqueror_crate':'golden_spin',projects:reverse?projects.reverse():projects};
 });
 const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities}):undefined});
 const table=[...p.$('am-content').querySelectorAll('table')].find((t:any)=>t.textContent.includes('ตรวจต้นทางล่าสุด')) as any;
 const rows=[...table.querySelectorAll('tbody tr')];expect(rows).toHaveLength(3);
 rows.forEach((row:any,index)=>{
  expect(row.textContent).toContain(codes[index]);
  if(index<2){expect(row.textContent).toContain('Done — สร้างแล้ว');expect(row.querySelector('.am-source-evidence')).toBeNull();expect(row.children[2].textContent).toBe('—');}
  else{expect(row.textContent).toContain('รอยืนยันต้นทาง');expect(row.querySelectorAll('.am-source-evidence')).toHaveLength(1);expect(row.children[2].textContent).toContain('11:00');expect(row.children[2].textContent).not.toContain('16:30');}
 });
});
it('shows a linked existing activity Done without stale source readiness warnings',async()=>{
 const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities:[{...activity,key:'membership',projects:[{projectCode:'261001_Membership (Oct 2026)',lastRun:null,lastSourceCheck:{projectCode:'261001_Membership (Oct 2026)',code:'existing_output_complete',sourceReady:false,checkedAt:'2026-10-01T05:00Z'}}]}]}):undefined});
 const text=p.$('am-content').textContent;expect(text).toContain('Done — สร้างแล้ว');expect(text).toContain('ชุดงานครบแล้ว');
 expect(text).not.toContain('ต้นทางยังไม่พร้อม');
});
const integrationEvidence=(mode='test')=>({
 activity:'conqueror_crate',mode,scope:'recorded_evidence',
 components:[
  {component:'alpha',availability:'available',latestStatus:'cached',latestAt:'2026-09-21T04:00:00Z',timeMeaning:'request_created',lastSuccessAt:'2026-09-21T04:00:00Z'},
  {component:'mcp',availability:'available',latestStatus:'allowed',latestAt:'2026-09-21T04:00:00Z',timeMeaning:'call_recorded',lastSuccessAt:'2026-09-21T04:00:00Z'},
  {component:'seatalk',availability:'available',latestStatus:'delivered',latestAt:'2026-09-18T04:00:00Z',timeMeaning:'record_updated',lastSuccessAt:'2026-09-18T04:00:00Z'},
 ],
});
async function openActivity(p:any){[...p.$('am-content').querySelectorAll('button')].find((b:any)=>b.textContent==='ดูรายละเอียด').click();await tick();}
describe('Production monitor drawer',()=>{
 const prodId='a0000000-0000-4000-8000-000000000002';
 const prodRun={source:'shared',entityType:'production_run',mode:'production',id:prodId,activity:'golden_spin',
  projectCode:'GOLD-OCT',status:'generation_pending',stage:'generation_pending',eventAt:'2026-09-22T01:00Z',
  sourceCheckedAt:'2026-09-22T00:50Z',recoveryState:'copy_result_unknown',needsAttention:true,leaseState:'expired'};
 it('opens the explicit production identity and shows uncertainty without calling diagnosis or writes',async()=>{
  const p=await page({query:`?view=runs&mode=production&source=shared&entity=production_run&run=${prodId}`,
   rpc:(name:string)=>name.endsWith('_run')?envelope({run:prodRun,outputs:[],timeline:[]}):undefined});
  await tick();
  expect(p.calls.find(c=>c.name.endsWith('_run')).args).toEqual({p_source:'shared',p_run_id:prodId,p_entity_type:'production_run'});
  expect(p.$('am-detail').textContent).toContain('ยังยืนยันผลคัดลอก Slides ไม่ได้');
  expect(p.$('am-detail').textContent).toContain('ไม่ใช่การตรวจ Confirmed Loot สด');
  expect(p.$('am-detail').textContent).toContain('ไม่ใช่หลักฐานว่าต้องสร้างไฟล์ใหม่');
  expect(p.calls.every(c=>c.name.startsWith('activity_automation_monitor_'))).toBe(true);
  expect(p.$('am-detail').textContent).toContain('ติดตามเหตุการณ์');
  expect(p.calls.some(c=>c.name.endsWith('_issue_action'))).toBe(false);
 });
 it('offers production stage filters and retains the production identity from attention',async()=>{
  const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),attention:[prodRun]}):undefined});
  p.$('am-content').querySelector('button').click();await tick();
  expect(p.calls.find(c=>c.name.endsWith('_run')).args.p_entity_type).toBe('production_run');
  const values=[...p.$('am-status').options].map((o:any)=>o.value);
  for(const stage of ['claimed','source_validated','generation_pending','held'])expect(values).toContain(stage);
 });
 it('distinguishes Marketing Plan linkage from the external source sheet and pending notifications',async()=>{
  const p=await page({query:`?view=runs&source=shared&entity=production_run&run=${prodId}`,
   rpc:(name:string)=>name.endsWith('_run')?envelope({run:{...prodRun,status:'complete',recoveryState:'complete',needsAttention:false,leaseState:'not_applicable'},
    outputs:[{...output,mode:'production',source:'shared',marketingWorkingSheetLinked:true,workingSheetUrl:'https://docs.google.com/spreadsheets/d/source_oct/edit',assignmentState:'unassigned'}],
    latestNotification:{status:'pending',providerAccepted:false},timeline:[]}):undefined});
  await tick();
  expect(p.$('am-detail').textContent).toContain('Working Sheet ใน Marketing Plan: เชื่อมกับ CR แล้ว');
  expect(p.$('am-detail').textContent).toContain('ต้นทาง Working Sheet');
  expect(p.$('am-detail').textContent).toContain('ยังไม่มอบหมาย');
  expect(p.$('am-detail').textContent).toContain('ยังไม่มีหลักฐานว่า SeaTalk API รับข้อความ');
  expect(p.$('am-detail').textContent).not.toContain('ต้องตรวจหลักฐานก่อนดำเนินการต่อ');
 });
 it('navigates to the latest production run from an activity drawer',async()=>{
  const p=await page({query:'?view=activities',rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities:[{...activity,lastRun:prodRun}]}):undefined});
  await openActivity(p);
  [...p.$('am-detail').querySelectorAll('button')].find((b:any)=>b.textContent==='ดูรัน production ล่าสุด').click();await tick();
  expect(p.calls.find(c=>c.name.endsWith('_run')).args.p_entity_type).toBe('production_run');
 });
  it('keeps paused scheduler status visible even when a cron expression exists',async()=>{
    const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities:[{...activity,schedulerState:'paused',schedule:'*/30 * * * *'}]}):undefined});
    expect(p.$('am-content').textContent).toContain('พักอยู่ · */30 * * * *');
    await openActivity(p);expect(p.$('am-detail').textContent).toContain('พักอยู่ · */30 * * * *');
  });
  it('shows an activated automation and the latest SSoT evidence without claiming a new scan',async()=>{
    const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities:[{
      ...activity,key:'battle_pass',label:'Battle Pass',sourceSystem:'battle_pass',configurationScope:'battle_pass',
      schedulerState:'active',schedule:'*/30 * * * *',notifierEnabled:true,
      lastRun:{status:'waiting_confirmation',projectCode:'Battle Pass (Oct 2026)',period:'2026-10',eventAt:'2026-09-22T11:30:00Z'},
      lastSourceCheck:{sourceReady:false,workingSheetLinked:true,confirmed:false,sourceCheckedAt:'2026-09-22T11:30:00Z'},
    }]}):undefined});
    const text=p.$('am-content').textContent;
    expect(text).toContain('ระบบตรวจอัตโนมัติเปิดอยู่');
    await openActivity(p);expect(p.$('am-detail').textContent).toContain('SeaTalk notifier');
    expect(text).toContain('รอยืนยันต้นทาง');
    expect(text).toContain('SSoT Working Sheet: Filled');
    expect(text).toContain('Loot Confirmed?: No');
  });
  it('uses a scheduler observation when source gates block a new production run',async()=>{
    const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities:[{
      ...activity,lastRun:null,schedulerState:'active',notifierEnabled:true,
      lastSourceCheck:{sourceReady:false,workingSheetLinked:true,confirmed:false,projectCode:'Membership (Oct 2026)',period:'2026-10',code:'waiting_confirmation',checkedAt:'2026-09-22T11:30:00Z'},
    }]}):undefined});
    const text=p.$('am-content').textContent;
    expect(text).toContain('รอยืนยันต้นทาง');
    expect(text).toContain('SSoT Working Sheet: Filled');
    expect(text).toContain('Loot Confirmed?: No');
  });
 it('renders unknown recovery data as text without evaluating HTML',async()=>{
  const p=await page({query:`?view=runs&source=shared&entity=production_run&run=${prodId}`,
   rpc:(name:string)=>name.endsWith('_run')?envelope({run:{...prodRun,recoveryState:'<img src=x onerror=bad()>',code:'<script>bad()</script>'},outputs:[],timeline:[]}):undefined});
  await tick();expect(p.$('am-detail').querySelector('img,script')).toBeNull();
  expect(p.$('am-detail').textContent).toContain('ยังไม่มีหลักฐาน');
 });
});
describe('Recorded integration evidence',()=>{
 it('reads evidence on demand instead of displaying an unconditional missing-evidence warning',async()=>{
  const p=await page({query:'?view=activities&mode=test',rpc:(name:string)=>name.endsWith('_integrations')?envelope(integrationEvidence()):undefined});
  expect(p.calls.some(x=>x.name.endsWith('_integrations'))).toBe(false);
  await openActivity(p);
  expect(p.calls.filter(x=>x.name.endsWith('_integrations'))).toEqual([{name:'activity_automation_monitor_integrations',args:{p_activity:'conqueror_crate',p_mode:'test'}}]);
  expect(p.$('am-detail').textContent).not.toContain('ยังไม่มีหลักฐานตรวจการเชื่อมต่อครบเส้นทาง');
  expect(p.$('am-detail').textContent).toContain('มีผลวิเคราะห์ Alpha ที่บันทึกแล้ว');
  expect(p.$('am-detail').textContent).toContain('มีบันทึกการอ่าน MCP ที่ได้รับอนุญาต');
  expect(p.$('am-detail').textContent).toContain('SeaTalk API รับข้อความแล้ว');
  expect(p.calls.some(x=>x.name.endsWith('diagnosis_request'))).toBe(false);
 });
 it('shows historical TEST success separately and never promotes it into production success',async()=>{
  const current={...integrationEvidence('production'),components:integrationEvidence().components.map(c=>({...c,latestStatus:null,latestAt:null,lastSuccessAt:null}))};
  const p=await page({query:'?view=activities&month=2026-10',rpc:(name:string)=>name.endsWith('_integrations')?envelope({...current,testEvidence:integrationEvidence()}):undefined});
  await openActivity(p);
  const sections=p.$('am-detail').querySelectorAll('[data-integration-mode]');
  expect(sections.length).toBe(2);
  expect(sections[0].dataset.integrationMode).toBe('production');
  expect(sections[0].textContent).toContain('ยังไม่มีหลักฐานในโหมดนี้');
  expect(sections[0].textContent).not.toContain('SeaTalk API รับข้อความแล้ว');
  expect(sections[1].dataset.integrationMode).toBe('test');
  expect(sections[1].textContent).toContain('SeaTalk API รับข้อความแล้ว');
  expect(p.$('am-detail').textContent).toContain('ไม่ใช่การตรวจการเชื่อมต่อสด');
 });
 it('distinguishes a missing evidence API from a failed integration and hides raw errors',async()=>{
  const p=await page({rpc:(name:string)=>name.endsWith('_integrations')?{error:{code:'PGRST202',message:'PRIVATE_ERROR'}}:undefined});
  await openActivity(p);
  expect(p.$('am-detail').textContent).toContain('ยังไม่ได้ติดตั้ง API อ่านหลักฐาน');
  expect(p.$('am-detail').textContent).not.toContain('PRIVATE_ERROR');
  expect(p.$('am-detail').textContent).not.toContain('ยังไม่มีหลักฐานตรวจการเชื่อมต่อครบเส้นทาง');
 });
 it('retains previous success without hiding a later failed attempt',async()=>{
  const data=integrationEvidence();data.components[0].latestStatus='failed';
  const p=await page({query:'?mode=test',rpc:(name:string)=>name.endsWith('_integrations')?envelope(data):undefined});
  await openActivity(p);expect(p.$('am-detail').textContent).toContain('ล่าสุด: ล้มเหลว');
  expect(p.$('am-detail').textContent).toContain('หลักฐานสำเร็จล่าสุด');
 });
 it('discards late integration results after signout or a different drawer is opened',async()=>{
  let finish:any;const p=await page({rpc:(name:string)=>name.endsWith('_integrations')?new Promise(r=>{finish=r;}):undefined});
  await openActivity(p);p.auth('SIGNED_OUT',null);finish(envelope(integrationEvidence()));await tick();
  expect(p.$('am-detail').textContent).toBe('');
 });
 it('does not call the shared evidence endpoint for Battle Pass',async()=>{
  const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities:[{...activity,key:'battle_pass',sourceSystem:'battle_pass'}]}):undefined});
  await openActivity(p);expect(p.calls.some(x=>x.name.endsWith('_integrations'))).toBe(false);
 });
});
async function diagnosisPage(response:any,extra:any={}){
 return page({query:'?view=runs&mode=test&source=shared&run='+diagnosisRun,rpc:(name:string,args:any)=>{
  if(name==='activity_automation_monitor_run')return envelope({run:{source:'shared',id:diagnosisRun,activity:'membership',mode:'test',status:'failed'},timeline:[],outputs:[]});
  if(name.startsWith('activity_automation_diagnosis_'))return typeof response==='function'?response(name,args):{data:response};
 },...extra});
}
describe('Activity diagnosis drawer',()=>{
 it('only reads on opening and refreshing; explicitly requests once with pinned identity',async()=>{
  const p=await diagnosisPage({available:true,canRequest:true,status:'stale',asOf:'2026-09-18T06:00:00Z'});await tick();
  const buttons=()=>[...p.$('am-detail').querySelectorAll('button')] as any[];
  expect(p.calls.filter(x=>x.name.endsWith('diagnosis_request'))).toHaveLength(0);
  buttons().find(b=>b.textContent==='รีเฟรชผลวิเคราะห์').click();await tick();
  expect(p.calls.filter(x=>x.name.endsWith('diagnosis_request'))).toHaveLength(0);
  const request=buttons().find(b=>b.textContent==='ขอวิเคราะห์');request.click();request.click();await tick();
  expect(p.calls.filter(x=>x.name.endsWith('diagnosis_request'))).toEqual([{name:'activity_automation_diagnosis_request',args:{p_activity:'membership',p_mode:'test',p_run_id:diagnosisRun}}]);
 });
 it('disabled backend never exposes request; cached output renders as text',async()=>{
  const p=await diagnosisPage({available:true,canRequest:false,status:'cached',diagnosis:{diagnosis:'<img src=x onerror=bad()>',evidence:'safe',impact:'review',recommendedAction:{code:'manual_review'},risk:'medium',confidence:25}});await tick();
  expect(p.$('am-detail').textContent).toContain('<img');expect(p.$('am-detail').querySelector('img')).toBeNull();
  expect(p.$('am-detail').textContent).not.toContain('ขอวิเคราะห์');
 });
 it('does not expose provider errors or let late diagnosis survive signout',async()=>{
  let finish:any;const p=await diagnosisPage(()=>new Promise(r=>{finish=r;}));await tick();p.auth('SIGNED_OUT',null);
  finish({data:{available:true,canRequest:true,status:'cached',diagnosis:{diagnosis:'STALE PRIVATE RESULT'}}});await tick();
  expect(p.$('am-detail').textContent).toBe('');
  const q=await diagnosisPage(()=>({error:{message:'SECRET_PROVIDER_ERROR'}}));await tick();expect(q.$('am-detail').textContent).not.toContain('SECRET_PROVIDER_ERROR');expect(q.$('am-detail').textContent).not.toContain('ขอวิเคราะห์');
 });
 it('never invokes shared diagnosis for Battle Pass runs',async()=>{
  const p=await page({query:'?view=runs&source=battle_pass&run='+diagnosisRun,rpc:(name:string)=>name==='activity_automation_monitor_run'?envelope({run:{source:'battle_pass',id:diagnosisRun,activity:'battle_pass',mode:'production'},outputs:[],timeline:[]}):undefined});await tick();
  expect(p.calls.some(x=>x.name.startsWith('activity_automation_diagnosis_'))).toBe(false);
 });
});
describe('Workspace incident actions',()=>{
 const issue={source:'shared',entityType:'production_run',id:diagnosisRun,activity:'golden_spin',mode:'production',status:'held',stage:'held',projectCode:'261005_Golden Spin (No.7)',period:'2026-10',code:'manual_output_requires_review'};
 const review=()=>({issueKey:'stable-key',issue,review:null,audit:[],canManage:true});
 async function issuePage(extra:any={}){return page({rpc:(name:string,args:any)=>{
   if(extra.rpc){const r=extra.rpc(name,args);if(r!==undefined)return r;}
   if(name.endsWith('_summary'))return envelope({...summary(),attention:[issue],issueReviewAvailable:true});
   if(name.endsWith('_run'))return envelope({run:issue,outputs:[],timeline:[]});
   if(name.endsWith('_issue_get'))return envelope(review());
   if(name.endsWith('_issue_action'))return envelope({...review(),review:{state:args.p_action,ownerLabel:'Operations',comment:args.p_comment,updatedAt:'2026-10-01T06:00Z'}});
  }});}
 it('requires a comment and sends only a reference/key before acknowledgment',async()=>{
  const p=await issuePage();p.$('am-content').querySelector('button').click();await tick();
  const ack=[...p.$('am-detail').querySelectorAll('button')].find((b:any)=>b.textContent==='รับทราบ');ack.click();await tick();expect(p.calls.some(c=>c.name.endsWith('_issue_action'))).toBe(false);
  p.$('am-detail').querySelector('textarea').value='ตรวจข้อมูลแล้ว กำลังติดตาม';ack.click();await tick();
  const call=p.calls.find(c=>c.name.endsWith('_issue_action'));expect(call.args).toMatchObject({p_source:'shared',p_mode:'production',p_entity_type:'production_run',p_id:diagnosisRun,p_issue_key:'stable-key',p_action:'acknowledged'});
  expect(p.$('am-detail').textContent).toContain('รับทราบแล้ว');expect(p.calls.some(c=>/retry|notify|assign|accept/.test(c.name))).toBe(false);
 });
 it('keeps an issue open when matching evidence is absent',async()=>{
  const p=await issuePage({rpc:(name:string)=>name.endsWith('_issue_action')?{error:{code:'23514'}}:undefined});p.$('am-content').querySelector('button').click();await tick();
  p.$('am-detail').querySelector('textarea').value='ตรวจ CR แล้ว';[...p.$('am-detail').querySelectorAll('button')].find((b:any)=>b.textContent==='ตรวจหลักฐานและปิดว่าแก้แล้ว').click();await tick();
  expect(p.$('am-detail').textContent).toContain('จึงปิดว่าแก้แล้วไม่ได้');expect(p.$('am-detail').textContent).not.toContain('ตรวจหลักฐานว่าแก้แล้ว');
 });
 it('falls back to the original summary without inventing scan coverage',async()=>{
  const p=await page({rpc:(name:string)=>name==='activity_automation_monitor_workspace_summary'?{error:{code:'PGRST202'}}:undefined});
  expect(p.calls.some(c=>c.name==='activity_automation_monitor_summary')).toBe(true);expect(p.$('am-message').textContent).toContain('Monitor รุ่นเดิม');expect(p.$('am-content').textContent).not.toContain('ตรวจทำงานปกติ');
 });
 it('gives verified Done precedence over a historical held run',async()=>{
  const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities:[{...activity,key:'golden_spin',projects:[{projectCode:issue.projectCode,lastRun:issue,lastSourceCheck:{projectCode:issue.projectCode,code:'existing_output_complete',checkedAt:'2026-10-01T06:00Z'}}]}]}):undefined});
  const row=p.$('am-content').querySelector('tbody tr');expect(row.textContent).toContain('Done');expect(row.textContent).not.toContain('พักไว้ให้คนตรวจ');
 });
});
describe('Monitor browser contract',()=>{
 it('preserves one instance of every legacy ID and never grants BP access from shared permission',async()=>{
  const p=await page({query:'?view=activities'});const ids=[...p.w.document.querySelectorAll('[id]')].map((x:any)=>x.id);expect(new Set(ids).size).toBe(ids.length);expect(p.$('monitor').hidden).toBe(true);expect(p.$('am-legacy').hidden).toBe(true);expect(p.$('am-content').textContent).toContain('Membership · Golden Spin · Conqueror · Topup');expect(p.$('am-content').textContent).toContain('สร้างบรีฟแล้ว');expect(p.$('am-content').textContent).toContain('รอยืนยันบรีฟ');expect(p.$('am-content').textContent).toContain('มอบหมายแล้ว');expect(p.calls.map(x=>x.name)).toEqual(['activity_automation_monitor_access','activity_automation_monitor_workspace_summary']);
 });
 it('defaults to production and rejects invalid URLs and filters',async()=>{const p=await page({query:'?mode=bad&view=bad&month=1999-13'});const api=p.w.ActivityAutomationMonitor;expect(p.$('am-mode').value).toBe('production');expect(p.$('am-month').value).toMatch(/^20\d{2}-\d{2}$/);for(const url of ['javascript:alert(1)','https://docs.google.com.evil/presentation/d/abc','https://name:pass@docs.google.com/presentation/d/abc','https://evil.test/','https://docs.google.com/presentation/d/a.b'])expect(api.safeUrl(url)).toBeNull();expect(api.safeUrl(output.briefUrl)).toBe(output.briefUrl);expect(p.$('am-status').tagName).toBe('SELECT');});
 it('never calls a read API signed out',async()=>{const p=await page({signedOut:true});expect(p.calls).toEqual([]);expect(p.$('am-content').textContent).toContain('เข้าสู่ระบบ');});
 it('distinguishes authenticated denied account from signed out',async()=>{const p=await page({rpc:()=>({error:{code:'42501'}})});expect(p.$('am-account').textContent).toBe('เข้าสู่ระบบแล้ว · ไม่มีสิทธิ์');expect(p.$('am-content').textContent).toBe('');});
 it('rejects late summary after signout and clears prior data',async()=>{let finish:any;const p=await page({rpc:(name:string)=>name.endsWith('_summary')?new Promise(r=>{finish=r;}):undefined});p.auth('SIGNED_OUT',null);finish(envelope(summary()));await tick();expect(p.$('am-content').textContent).toBe('');expect(p.$('am-observed').textContent).toBe('');expect(p.$('am-legacy').hidden).toBe(true);});
 it('retains timestamp and marks stale data when refresh fails',async()=>{let fail=false;const p=await page({rpc:(name:string)=>name.endsWith('_summary')&&fail?{error:{code:'NETWORK',message:'SECRET_DO_NOT_EXPOSE'}}:undefined});fail=true;p.$('am-refresh').click();await tick();expect(p.$('am-message').textContent).toContain('ข้อมูลเดิม');expect(p.$('am-observed').textContent).toContain('ข้อมูล ณ');expect(p.$('am-content').textContent).toContain('Conqueror');expect(p.w.document.body.textContent).not.toContain('SECRET_DO_NOT_EXPOSE');});
 it('latest filter wins race and TEST is explicit',async()=>{let finish:any,first=true;const p=await page({rpc:(name:string,args:any)=>{if(name.endsWith('_summary')&&first){first=false;return new Promise(r=>{finish=r;});}if(name.endsWith('_summary'))return envelope({...summary(),outputs:[{...output,projectCode:'new TEST'}]});}});p.$('am-mode').value='test';p.$('am-mode').dispatchEvent(new p.w.Event('change'));await tick();finish(envelope({...summary(),outputs:[{...output,projectCode:'OLD PRODUCTION'}]}));await tick();expect(p.$('am-content').textContent).toContain('new TEST');expect(p.$('am-content').textContent).not.toContain('OLD PRODUCTION');expect(p.$('am-test').hidden).toBe(false);});
 it('partial source uses incomplete count label and safe text',async()=>{const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),cards:{...summary().cards,complete:false},attention:[{activity:'conqueror_crate',message:'<img src=x onerror=bad()>',status:'failed'}]},[{source:'battle_pass',status:'unavailable'}]):undefined});expect(p.$('am-content').textContent).toContain('ข้อมูลไม่ครบ');expect(p.$('am-content').querySelector('img')).toBeNull();expect(p.$('am-message').textContent).toContain('battle_pass');});
 it('restores BP tools only from verified legacy event when new RPC absent',async()=>{const p=await page({query:'?view=tools',rpc:()=>({error:{code:'PGRST202'}})});expect(p.$('am-legacy').hidden).toBe(true);p.w.dispatchEvent(new p.w.CustomEvent('flowmate:bp-monitor-access',{detail:true}));expect(p.$('am-legacy').hidden).toBe(false);expect(p.$('monitor').hidden).toBe(true);p.w.dispatchEvent(new p.w.CustomEvent('flowmate:bp-monitor-access',{detail:false}));expect(p.$('am-legacy').hidden).toBe(true);});
 it('renders exact notification DTO without inventing read receipt or message ID',async()=>{const p=await page({query:'?view=notifications',rpc:(name:string)=>name.endsWith('_notifications')?envelope({rows:[{source:'shared',entityType:'notification',id:'n1',activity:'conqueror_crate',eventAt:'2026-09-18T06:00:00Z',status:'delivered',eventKind:'success',attemptCount:3,recipientLabel:'Operator',providerAccepted:true}],hasMore:false}):undefined});expect(p.$('am-content').textContent).toContain('success / Operator');expect(p.$('am-content').textContent).toContain('3 /');p.$('am-content').querySelector('button').click();expect(p.$('am-detail').textContent).toContain('API รับข้อความแล้ว');expect(p.$('am-detail').textContent).toContain('มีหลักฐาน');expect(p.$('am-detail').textContent).not.toContain('Message ID');});
 it('incident detail does not call run RPC with incident ID',async()=>{const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),attention:[{source:'shared',entityType:'incident',id:'i1',activity:'conqueror_crate',status:'resolution_unknown',campaignUnbound:true,code:'source_invalid'}]}):undefined});p.$('am-content').querySelector('button').click();expect(p.$('am-detail').textContent).toContain('ยังผูกกับรอบกิจกรรมไม่ได้');expect(p.calls.some(x=>x.name.endsWith('_run'))).toBe(false);});
 it('back navigation preserves incoming URL when closing a run deep link',async()=>{const p=await page({query:'?view=runs&mode=test&run=r1&source=shared&entity=run'});await tick();expect(p.$('am-detail').textContent).toContain('การสร้าง (เวลาอัปเดตล่าสุด)');p.w.history.replaceState({},'','?view=activities&mode=production&month=2026-10');p.w.dispatchEvent(new p.w.PopStateEvent('popstate'));await tick();expect(p.w.location.search).toContain('view=activities');expect(p.$('am-mode').value).toBe('production');expect(p.$('am-month').value).toBe('2026-10');expect(p.$('am-drawer').open).toBe(false);});
 it('pagination uses opaque cursor and resets when scope changes',async()=>{const p=await page({query:'?view=runs',rpc:(name:string)=>name.endsWith('_history')?envelope({rows:[],hasMore:true,nextCursor:'opaque-v1'}):undefined});p.$('am-next').click();await tick();expect(p.calls.filter(x=>x.name.endsWith('_history')).at(-1).args.p_cursor).toBe('opaque-v1');p.$('am-mode').value='test';p.$('am-mode').dispatchEvent(new p.w.Event('change'));await tick();expect(p.calls.filter(x=>x.name.endsWith('_history')).at(-1).args.p_cursor).toBeNull();expect(p.$('am-prev').disabled).toBe(true);});
 it('mobile nav toggles aria-expanded',async()=>{const p=await page();p.$('am-menu').click();expect(p.$('am-menu').getAttribute('aria-expanded')).toBe('true');p.$('am-menu').click();expect(p.$('am-menu').getAttribute('aria-expanded')).toBe('false');});
 it('never shows production BP controls under TEST even with verified BP permission',async()=>{const p=await page({query:'?view=tools&mode=test',rpc:(name:string)=>name.endsWith('_access')?envelope({sharedRead:true,battlePassRead:true,battlePassControls:true}):undefined});p.w.dispatchEvent(new p.w.CustomEvent('flowmate:bp-monitor-access',{detail:true}));expect(p.$('am-legacy').hidden).toBe(true);p.$('am-mode').value='production';p.$('am-mode').dispatchEvent(new p.w.Event('change'));await tick();expect(p.$('am-legacy').hidden).toBe(false);});
 it('health evidence stays local and actual readiness booleans distinguish checked from ready',async()=>{const p=await page({rpc:(name:string)=>name.endsWith('_summary')?envelope({...summary(),activities:[{...activity,lastSourceCheck:{status:'readiness_checked',sourceReady:false,googleReady:true,databaseReady:true,sourceCheckedAt:'2026-09-18T04:00:00Z',issues:['source_waiting']}}],attention:[{source:'battle_pass',entityType:'health',id:'health-bp',activity:'battle_pass',status:'stale',eventAt:'2026-09-18T04:00:00Z'}]}):undefined});expect(p.$('am-content').textContent).toContain('ต้นทางยังไม่พร้อม');p.$('am-content').querySelector('button').click();expect(p.$('am-drawer-title').textContent).toContain('สถานะที่ต้องตรวจสอบ');expect(p.calls.some(x=>x.name.endsWith('_run'))).toBe(false);});
 it('late run detail cannot overwrite a newly opened local evidence drawer',async()=>{let finish:any;const p=await page({query:'?view=overview&run=r1&source=shared',rpc:(name:string)=>name.endsWith('_run')?new Promise(r=>{finish=r;}):name.endsWith('_summary')?envelope({...summary(),attention:[{source:'shared',entityType:'notification',id:'n1',activity:'membership',status:'uncertain'}]}):undefined});p.$('am-content').querySelector('button').click();finish(envelope({run:{id:'OLD RUN'},outputs:[],timeline:[]}));await tick();expect(p.$('am-drawer-title').textContent).toBe('รายละเอียดการแจ้งเตือน');expect(p.$('am-detail').textContent).not.toContain('OLD RUN');});
});
