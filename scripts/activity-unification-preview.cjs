// Isolated UI preview. All reads/writes are in-memory; external connections are blocked.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
function mock(){
  const params=new URLSearchParams(location.search),scenario=params.get('scenario')||'mixed',jobs={};
  const families={battle_pass:'Battle Pass',membership:'Membership',conqueror_crate:'Conqueror Crate',golden_spin:'Golden Spin',topup_promotion:'Topup Promotion'};
  const envelope=data=>({data:{version:1,observedAt:new Date().toISOString(),sources:[{source:'shared',status:scenario==='partial'?'unavailable':'ok'},{source:'battle_pass',status:'ok'}],data}});
  function summary(period){
    const prefix=period.slice(2).replace('-','')+'01_',manual=period>='2026-12';
    const activities=Object.entries(families).map(([key,label])=>({key,label,sourceSystem:key==='battle_pass'?'battle_pass':'shared',availability:scenario==='partial'&&key!=='battle_pass'?'unavailable':'ok',manualMode:manual,projects:[{projectCode:prefix+label+' (ตัวอย่าง)',period,manualMode:manual,manualJob:jobs[prefix+label+' (ตัวอย่าง)']||null,lastRun:null,lastSourceCheck:{projectCode:prefix+label+' (ตัวอย่าง)',period,sourceReady:!manual,confirmed:true,workingSheetLinked:true,code:manual?'manual_ready':'source_ready',checkedAt:new Date().toISOString()}}]}));
    const outputs=[];
    if(scenario==='mixed'){
      activities[1].projects[0].lastSourceCheck={...activities[1].projects[0].lastSourceCheck,workingSheetLinked:false,code:'working_sheet_invalid'};
      activities[2].projects[0].manualJob={status:'running',updatedAt:new Date().toISOString()};
      activities[3].projects[0].lastSourceCheck.code='source_identity_changed';
      activities[4].projects[0].manualJob={status:'complete'};
      outputs.push({activity:'topup_promotion',mode:'production',projectCode:activities[4].projects[0].projectCode,period,generationState:'complete',briefState:'pending',assignmentState:'unassigned',displayId:'CR-DEMO',briefUrl:'https://docs.google.com/presentation/d/local-preview/edit',crUrl:location.origin+'/FlowMate/home/#detail/CR-DEMO'});
    }
    return {cards:{complete:scenario!=='partial',outputs:outputs.length,pendingBriefs:outputs.length,attention:0},manualMode:manual,activities,outputs,attention:[]};
  }
  window.flowmateSupabase={auth:{getUser:async()=>({data:{user:{id:'local-preview'}}}),onAuthStateChange:()=>{}},rpc:async(name,args)=>{
    if(scenario==='error'&&!name.endsWith('_access'))return {error:{code:'LOCAL_UNAVAILABLE'}};
    if(name.endsWith('_access'))return envelope({sharedRead:true,battlePassRead:true,battlePassControls:scenario!=='viewer'});
    if(name.endsWith('_summary'))return envelope(summary(args.p_month));
    return envelope({rows:[],hasMore:false});
  },functions:{invoke:async(_name,{body})=>{
    if(body.action==='catalog')return {data:{status:'catalog_updated',count:5}};
    if(body.action==='preview')return {data:{status:'preview',hash:'a'.repeat(64),projectCode:body.projectCode,period:body.period,workingSheetUrl:'https://docs.google.com/spreadsheets/d/local-preview/edit'}};
    if(body.action==='create'){jobs[body.projectCode]={status:'queued',updatedAt:new Date().toISOString()};return {data:{status:'accepted'}};}
    return {data:{status:'confirmed'}};
  }}};
}
const allowed=new Set(['activity-automation-monitor.js','activity-automation-monitor.css','battle-pass-monitor.css','operations-workspace.css','garena/colors_and_type.css','garena/logo_graphic.png']);
const server=http.createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Security-Policy',"default-src 'self'; connect-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:");
  if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end();}
  const name=new URL(req.url,'http://127.0.0.1:8881').pathname.slice(1);
  if(name===''||name==='home/Activity-Automation.html'){
    const html=fs.readFileSync(path.join(root,'home/Activity-Automation.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')
      .replace('<body>','<body><p role="status" style="margin:0;padding:8px 20px;background:#fff3d7;color:#79540c">LOCAL PREVIEW · ข้อมูลจำลอง · ไม่เชื่อม Production</p>')
      .replace('</body>',`<script>(${mock.toString()})();</script><script src="/activity-automation-monitor.js"></script></body>`);
    res.setHeader('content-type','text/html; charset=utf-8');return res.end(html);
  }
  if(!allowed.has(name)){res.statusCode=404;return res.end();}
  res.setHeader('content-type',name.endsWith('.css')?'text/css':name.endsWith('.png')?'image/png':'text/javascript');res.end(fs.readFileSync(path.join(root,name)));
});
server.listen(8881,'127.0.0.1',()=>console.log('Isolated preview: http://127.0.0.1:8881/home/Activity-Automation.html?month=2026-12&scenario=mixed'));
process.on('SIGINT',()=>server.close(()=>process.exit(0)));
