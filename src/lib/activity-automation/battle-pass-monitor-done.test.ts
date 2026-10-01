import {afterEach,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {Window} from 'happy-dom';
const script=readFileSync('activity-automation-monitor.js','utf8');
const html=readFileSync('home/Activity-Automation.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
const windows:any[]=[];
afterEach(async()=>{await Promise.all(windows.splice(0).map(w=>w.happyDOM.close()));});
const output={activity:'battle_pass',mode:'production',outputId:'production:2026-10',complete:true,generationState:'complete',workItemId:'bp-oct',displayId:'CR-1326',campaignStart:'2026-10-12',briefState:'pending',assignmentState:'unassigned',briefUrl:'https://docs.google.com/presentation/d/oct_deck/edit',crUrl:'https://panuwee.github.io/FlowMate/home/#detail/CR-1326'};
async function page(outputs:any[],month='2026-10'){
 const w:any=new Window({url:'https://panuwee.github.io/FlowMate/home/Activity-Automation.html?view=activities&mode=production&month='+month});windows.push(w);w.document.write(html);
 const calls:string[]=[];
 w.flowmateSupabase={auth:{getUser:async()=>({data:{user:{id:'ops'}}}),onAuthStateChange:()=>{}},rpc:async(name:string)=>{
  calls.push(name);
  return {data:{version:1,observedAt:'2026-10-01T08:00Z',sources:[],data:name.endsWith('_access')?{sharedRead:true,battlePassRead:true}:name.endsWith('_summary')?{
   cards:{},activities:[{key:'battle_pass',label:'Battle Pass',lastRun:{period:'2026-11',status:'waiting_confirmation'},lastSourceCheck:{period:'2026-10',sourceReady:false,confirmed:false,workingSheetLinked:true,sourceCheckedAt:'2026-09-15T07:48Z'}}],outputs,
  }:{rows:[]}}};
 }};
 w.eval(script);await new Promise(r=>setTimeout(r,35));
 return {text:w.document.getElementById('am-content').textContent,calls};
}
it('shows completed October output Done despite old No readiness and latest November tick',async()=>{
 const p=await page([output]);
 expect(p.text).toContain('Current Status: 261012_Battle Pass (Oct 2026) — Done');
 expect(p.text).toContain('Done — มี Working Sheet, CR และ Brief Link แล้ว');
 expect(p.text).toContain('Loot Confirmed? (ผลตรวจเดิม): No');
 expect(p.text).not.toContain('ต้นทางยังไม่พร้อม');
 expect(p.text).toContain('รอยืนยันบรีฟ');
 expect(p.calls.every(name=>name.startsWith('activity_automation_monitor_'))).toBe(true);
});
it.each([{complete:false},{generationState:'held'},{briefUrl:null},{workItemId:null},{crUrl:null},{mode:'test'},{outputId:'production:2026-11'}])('does not infer Done from incomplete or wrong-scope evidence: %j',async delta=>{
 const p=await page([{...output,...delta}]);
 expect(p.text).not.toContain('Done — มี Working Sheet, CR และ Brief Link แล้ว');
 expect(p.text).toContain('ต้นทางยังไม่พร้อม');
});
it('does not mark November Done because October has completed',async()=>{
 const p=await page([output],'2026-11');
 expect(p.text).not.toContain('Done — มี Working Sheet, CR และ Brief Link แล้ว');
});
