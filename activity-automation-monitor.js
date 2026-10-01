(function(root){
  'use strict';
  const labels={battle_pass:'Battle Pass',membership:'Membership',conqueror_crate:'Conqueror Crate',golden_spin:'Golden Spin',topup_promotion:'Topup Promotion'};
  const views={overview:'ภาพรวมระบบอัตโนมัติกิจกรรม',activities:'กิจกรรม',runs:'ประวัติการทำงาน',notifications:'การแจ้งเตือน',tools:'เครื่องมือผู้ดูแล · Battle Pass'};
  const statuses={existing:'Done — สร้างแล้ว',done:'Done — สร้างแล้ว',existing_output_complete:'Done — สร้างแล้ว',complete:'สร้างสำเร็จ',succeeded:'สำเร็จ',assigned:'มอบหมายแล้ว',accepted:'ยืนยันแล้ว',pending:'รอดำเนินการ',submitted:'รอยืนยัน',pending_acceptance:'รอยืนยัน',failed:'ล้มเหลว',uncertain:'ยังยืนยันผลไม่ได้',cancelled:'ยกเลิก',processing:'กำลังดำเนินการ',retryable:'รอลองใหม่',delivered:'API รับข้อความแล้ว',blocked:'ติดเงื่อนไข',review_required:'ต้องตรวจสอบ',running:'กำลังทำงาน',disabled:'ปิดอยู่',enabled:'เปิดอยู่',unavailable:'อ่านสถานะไม่ได้',unknown:'ยังไม่มีข้อมูล',waiting_confirmation:'รอยืนยันต้นทาง',source_ready:'ผ่านการตรวจ SSoT',working_sheet_invalid:'Working Sheet ยังไม่พร้อม',source_dates_invalid:'วันกิจกรรมยังไม่พร้อม',project_code_missing:'ยังไม่มี Project Code',source_ambiguous:'พบข้อมูลต้นทางซ้ำ',item_name_missing:'ข้อมูลชื่อไอเทมใน Loot ไม่ครบ',loot_dates_mismatch:'วันที่ Loot ไม่ตรงกับ SSoT'};
  Object.assign(statuses,{not_submitted:'ยังไม่ส่งบรีฟ',ready_for_review:'สร้างบรีฟแล้ว',generating:'กำลังสร้างบรีฟ',discovered:'พบกิจกรรมแล้ว',dispatching:'กำลังส่งงาน',resolution_unknown:'ยังไม่ทราบว่าแก้ไขแล้วหรือยัง',pending_acceptance:'รอยืนยันบรีฟ',stale:'ข้อมูลรันเกินช่วงที่คาด',held:'พักไว้ให้คนตรวจ',readiness_checked:'ตรวจต้นทางแล้ว',no_pending_month:'ไม่มีรอบที่รอดำเนินการ'});
  Object.assign(statuses,{claimed:'รับงานแล้ว',source_validated:'ตรวจต้นทางผ่านแล้ว',generation_pending:'อยู่ในขั้นสร้าง Slides',unassigned:'ยังไม่มอบหมาย',ready:'ผ่าน ณ เวลาตรวจ',not_ready:'ไม่ผ่าน ณ เวลาตรวจ',ambiguous:'พบตารางเวลาซ้ำ'});
  Object.assign(statuses,{source_identity_invalid:'ชื่อกิจกรรมต้นทางไม่ตรงรูปแบบที่รองรับ',source_period_invalid:'เดือนต้นทางไม่ตรงกับกิจกรรม',waiting:'รอข้อมูลต้นทาง',rejected:'ต้นทางไม่ผ่านการตรวจ'});
  const recoveryLabels={in_progress:'ยังอยู่ในช่วงเวลารัน',lease_expired:'หมดช่วงเวลารันก่อนสร้าง Slides',generation_not_started:'ยังไม่มีหลักฐานเริ่มสร้าง Slides',copy_result_unknown:'ยังยืนยันผลคัดลอก Slides ไม่ได้',copied_pending_population:'มีสำเนา Slides แล้ว ยังไม่ยืนยันการเขียนเนื้อหา',populate_result_unknown:'ยังยืนยันผลเขียน Slides ไม่ได้',verified_pending_finalize:'ตรวจ Slides ผ่านแล้ว รอจบงานใน FlowMate',held:'พักงานไว้ให้ตรวจสอบ',complete:'จบงานแล้ว'};
  function month(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit'}).formatToParts(new Date());return parts.find(p=>p.type==='year').value+'-'+parts.find(p=>p.type==='month').value;}
  function filters(search){const p=new URLSearchParams(search);return {view:views[p.get('view')]?p.get('view'):'overview',mode:p.get('mode')==='test'?'test':'production',activity:labels[p.get('activity')]?p.get('activity'):'all',month:/^20\d{2}-(0[1-9]|1[0-2])$/.test(p.get('month')||'')?p.get('month'):month(),search:(p.get('search')||'').slice(0,120),status:/^[a-z_]{1,80}$/.test(p.get('status')||'')?p.get('status'):'',history:['significant','scans','creation','all'].includes(p.get('history'))?p.get('history'):'significant',run:p.get('run')||'',source:p.get('source')||'',entityType:p.get('entity')||'run'};}
  function time(value){const d=new Date(value);return value&&Number.isFinite(d.getTime())?new Intl.DateTimeFormat('th-TH',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}).format(d):'ไม่มีข้อมูล';}
  function safeUrl(value){try{const u=new URL(value,root.location?.href||'https://panuwee.github.io/FlowMate/');if(u.username||u.password)return null;if(u.protocol!=='https:'&&u.protocol!=='http:')return null;if(u.hostname==='docs.google.com'&&u.protocol==='https:'&&/^\/(presentation|spreadsheets|document)\/d\/[\w-]+(?:\/|$)/.test(u.pathname))return u.href;if((u.origin===(root.location?.origin||'https://panuwee.github.io')||u.origin==='https://panuwee.github.io')&&u.pathname.startsWith('/FlowMate/'))return u.href;return null;}catch{return null;}}
  root.ActivityAutomationMonitor={filters,time,safeUrl,labels,statuses};
  if(!root.document?.getElementById('am-shell'))return;
  const $=id=>root.document.getElementById(id),doc=root.document,client=root.flowmateSupabase;
  let state=filters(root.location.search),generation=0,detailGeneration=0,capabilities={},cursor=null,nextCursor=null,cursors=[],snapshot=false,opener=null,authUser=null,searchTimer,legacyAllowed=$('monitor')?.hidden===false,workspaceAvailable=false;
  const n=(tag,text,cls)=>{const el=doc.createElement(tag);if(text!=null)el.textContent=String(text);if(cls)el.className=cls;return el;};
  function status(value){return statuses[value]|| (value?'สถานะใหม่ที่ยังไม่รองรับ ('+String(value)+')':'ไม่มีข้อมูล');}
  function scheduleText(a){const names={not_configured:'ยังไม่ตั้งเวลา',unknown:'อ่านตารางเวลาไม่ได้',unavailable:'อ่านตารางเวลาไม่ได้',active:'เปิดอยู่',paused:'พักอยู่',ambiguous:'พบตารางเวลาซ้ำ ต้องตรวจสอบ'};return (a.availability==='unavailable'?'อ่านตารางเวลาไม่ได้':names[a.schedulerState]||'ยังไม่มีข้อมูล')+(a.schedule?' · '+a.schedule:'');}
  function badge(value){const b=n('span',status(value),'am-badge');b.dataset.tone=['done','existing_output_complete','complete','succeeded','accepted','assigned','delivered'].includes(value)?'good':['failed','blocked'].includes(value)?'bad':['waiting','waiting_confirmation','held','pending','submitted','pending_acceptance','uncertain','review_required'].includes(value)?'warn':'';return b;}
  function automationBadge(a){
    const b=n('span',null,'am-badge');
    if(a.runnerEnabled===true&&a.schedulerState==='active'&&a.schedulerEnabled!==false){b.textContent='Automation Activated';b.dataset.tone='good';}
    else if(a.runnerEnabled===false){b.textContent='Automation Disabled';b.dataset.tone='bad';}
    else if(a.schedulerState==='paused'||a.schedulerEnabled===false){b.textContent='Automation Paused';b.dataset.tone='warn';}
    else if(a.schedulerState==='not_configured'){b.textContent='Automation ยังไม่ตั้งเวลา';b.dataset.tone='warn';}
    else {b.textContent='Automation ยังยืนยันสถานะไม่ได้';}
    return b;
  }
  function periodLabel(value){
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value||''))return null;
    return new Intl.DateTimeFormat('en-US',{month:'short',year:'numeric',timeZone:'Asia/Bangkok'}).format(new Date(value+'-01T12:00:00Z'));
  }
  function battlePassProject(row){
    if(row.projectCode)return row.projectCode;
    const period=row.period||row.outputId?.match(/(?:^|:)(20\d{2}-\d{2})$/)?.[1]||row.campaignStart?.slice(0,7);
    const label=periodLabel(period);
    if(!label)return null;
    const name='Battle Pass ('+label+')';
    const start=row.campaignStart;
    return /^20\d{2}-\d{2}-\d{2}$/.test(start||'')?start.slice(2).replaceAll('-','')+'_'+name:name;
  }
  function currentStatus(a){
    if(a.completedOutput){const done=n('div');done.append(n('span','Current Status: '+battlePassProject(a.completedOutput)+' — Done — สร้างแล้ว'));return done;}
    if(a.projects?.length){const list=n('div');for(const project of a.projects)list.append(currentStatus({...a,projects:null,lastRun:project.lastRun,lastSourceCheck:project.lastSourceCheck}));return list;}
    if(a.lastSourceCheck?.code==='existing_output_complete'){const done=n('div');done.append(n('span','Current Status: '+(a.lastSourceCheck.projectCode||a.projectCode||a.label)+' — Done — สร้างแล้ว'));return done;}
    const wrap=n('div'),check=a.lastSourceCheck,run=a.lastRun?.status!=='complete'&&check&&new Date(check.checkedAt)>new Date(a.lastRun?.eventAt)?null:a.lastRun;
    if(run){
      const identity=run.projectCode||((a.label||labels[a.key||a.activity]||'กิจกรรม')+(periodLabel(run.period)?' ('+periodLabel(run.period)+')':''));
      wrap.append(n('span','Current Status: '+identity+' — '+(run.status==='complete'?'Done — ':'')+status(run.status)));
      if(run.eventAt)wrap.append(n('small',time(run.eventAt)));
    }else if(check){
      const identity=check.projectCode||((a.label||labels[a.key||a.activity]||'กิจกรรม')+(periodLabel(check.period)?' ('+periodLabel(check.period)+')':''));
      wrap.append(n('span','Current Status: '+identity+' — '+(check.code==='existing_output_complete'?'Done — สร้างแล้ว':status(check.code||check.status))));
    }
    else wrap.append(n('span','Current Status: รอผลตรวจต้นทางครั้งแรก'));
    return wrap;
  }
  function sourceStatus(a){
    if(a.projects?.length){const list=n('div');for(const project of a.projects){const item=n('div');item.append(n('strong',project.projectCode),sourceStatus({...a,projects:null,lastSourceCheck:project.lastSourceCheck}));list.append(item);}return list;}
    const source=n('div'),check=a.lastSourceCheck;
    if(a.completedOutput){
      const output=a.completedOutput;
      source.append(n('strong',battlePassProject(output)),n('span','Done — มี Working Sheet, CR และ Brief Link แล้ว'),n('small','ข้ามรายการนี้และตรวจรอบถัดไป'));
      source.append(link('เปิด '+output.displayId+' เพื่อตรวจบรีฟ',output.crUrl||output.workItemUrl));
      if(check?.period===(output.period||output.outputId?.match(/(?:^|:)(20\d{2}-\d{2})$/)?.[1])){
        source.append(n('small','ผลตรวจต้นทางที่บันทึกไว้: '+time(check.checkedAt)));
        if(Object.hasOwn(check,'workingSheetLinked'))source.append(n('small','SSoT Working Sheet: '+(check.workingSheetLinked===true?'Filled':check.workingSheetLinked===false?'Empty':'ยังไม่ยืนยัน')));
        if(Object.hasOwn(check,'confirmed'))source.append(n('small','Loot Confirmed? (ผลตรวจเดิม): '+(check.confirmed===true?'Yes':check.confirmed===false?'No':'ยังไม่ยืนยัน')));
      }
      return source;
    }
    if((a.key||a.activity)==='battle_pass'&&check){const identity=battlePassProject(check);if(identity)source.append(n('strong',identity));}
    if(check?.code==='existing_output_complete'){
      source.append(n('span','Done — มี Working Sheet, CR และ Brief Link แล้ว'),n('small','ข้ามรายการนี้และตรวจรอบถัดไป'),n('small',time(check.checkedAt)));
      return source;
    }
    source.append(n('span',check?.sourceReady===true?'ต้นทางพร้อม ณ เวลาตรวจ':check?.sourceReady===false?'ต้นทางยังไม่พร้อม':'ยังไม่มีผลตรวจต้นทาง'));
    if(check&&Object.hasOwn(check,'workingSheetLinked'))source.append(n('small','SSoT Working Sheet: '+(check.workingSheetLinked===true?'Filled':check.workingSheetLinked===false?'Empty':'ยังไม่ยืนยัน')));
    if(check&&Object.hasOwn(check,'confirmed'))source.append(n('small','Loot Confirmed?: '+(check.confirmed===true?'Yes':check.confirmed===false?'No':'ยังไม่ยืนยัน')));
    source.append(n('small',time(check?.checkedAt)));
    return source;
  }
  function note(text,error=false){$('am-message').textContent=text;$('am-message').dataset.error=String(error);}
  function link(text,url){const href=safeUrl(url);if(!href)return n('span',text+' — ไม่มีลิงก์ที่ตรวจสอบได้');const a=n('a',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;}
  function button(text,fn){const b=n('button',text);b.type='button';b.addEventListener('click',fn);return b;}
  function panel(title){const p=n('section',null,'am-panel');p.append(n('h2',title));return p;}
  function empty(parent,text='ยังไม่มีข้อมูลในช่วงที่เลือก'){parent.append(n('p',text,'am-empty'));}
  function table(parent,heads,rows,render){if(!rows?.length){empty(parent);return;}const wrap=n('div',null,'am-table-wrap'),t=n('table',null,'am-table'),thead=n('thead'),tr=n('tr');heads.forEach(h=>{const th=n('th',h);th.scope='col';tr.append(th);});thead.append(tr);t.append(thead);const body=n('tbody');for(const row of rows){const r=n('tr');render(row).forEach((value,i)=>{const td=n('td');td.dataset.label=heads[i];td.append(value?.nodeType?value:doc.createTextNode(String(value??'—')));r.append(td);});body.append(r);}t.append(body);wrap.append(t);parent.append(wrap);}
  function sync(){const options=state.view==='notifications'?['pending','dispatching','processing','retryable','delivered','failed','uncertain','cancelled']:['discovered','generating','ready_for_review','claimed','source_validated','generation_pending','held','complete','failed','blocked','review_required','waiting_confirmation'];$('am-status').replaceChildren(n('option','ทุกสถานะ'));$('am-status').firstChild.value='';if(state.status&&!options.includes(state.status))options.push(state.status);for(const value of options){const option=n('option',status(value));option.value=value;$('am-status').append(option);}for(const [key,id]of [['mode','am-mode'],['activity','am-activity'],['month','am-month'],['search','am-search'],['status','am-status']])$(id).value=state[key];$('am-title').textContent=views[state.view];doc.querySelectorAll('[data-am-view]').forEach(a=>{if(a.dataset.amView===state.view)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});$('am-test').hidden=state.mode!=='test';$('am-search-label').hidden=state.view!=='runs';$('am-status-label').hidden=!['runs','notifications'].includes(state.view);$('am-month-note').textContent=['runs','notifications'].includes(state.view)?'เดือนที่เกิดเหตุการณ์ · เวลาประเทศไทย (Asia/Bangkok)':'เดือนเริ่มกิจกรรม · ผลตรวจต้นทางเป็นผลที่บันทึกไว้ล่าสุด';$('am-legacy').hidden=!((capabilities.battlePassRead||legacyAllowed)&&state.mode==='production'&&state.view==='tools');$('am-history-label').hidden=state.view!=='runs';$('am-history').value=state.history;$('am-tools-link').hidden=!(capabilities.battlePassRead||legacyAllowed)||state.mode!=='production';}
  function url(replace=false){const p=new URLSearchParams();for(const key of ['view','mode','activity','month','history'])p.set(key,state[key]);if(state.search)p.set('search',state.search);if(state.status)p.set('status',state.status);if(state.run){p.set('run',state.run);p.set('source',state.source);p.set('entity',state.entityType);}root.history[replace?'replaceState':'pushState']({},'',root.location.pathname+'?'+p);}
  function normalize(data){for(const a of data.activities||[]){if(a.configurationScope==='shared_4_activities')a.configurationScope='shared';if(a.lastSourceCheck)a.lastSourceCheck.checkedAt=a.lastSourceCheck.sourceCheckedAt??a.lastSourceCheck.checkedAt??null;
    if(a.key==='battle_pass')a.completedOutput=(data.outputs||[]).find(o=>o.activity==='battle_pass'&&o.mode===state.mode&&o.complete===true&&o.generationState==='complete'&&(o.period||o.outputId?.match(/(?:^|:)(20\d{2}-\d{2})$/)?.[1])===state.month&&o.workItemId&&o.displayId&&o.briefUrl&&(o.crUrl||o.workItemUrl)&&safeUrl(o.briefUrl)&&safeUrl(o.crUrl||o.workItemUrl))||null;
  }for(const r of [...(data.rows||[]),...(data.attention||[])]){r.attempts=r.attemptCount;r.kind=r.eventKind||r.kind;if(r.entityType==='production_run'&&r.recoveryState)r.message=recoveryLabels[r.recoveryState]||r.code;}for(const t of data.timeline||[])t.label=t.step==='generation'?'การสร้าง (เวลาอัปเดตล่าสุด)':t.step;return data;}
  async function rpc(name,args){let timer;try{const result=await Promise.race([client.rpc(name,args),new Promise((_,reject)=>{timer=root.setTimeout(()=>reject({code:'TIMEOUT'}),15000);})]);if(result.error)throw result.error;if(result.data?.version!==1||!result.data?.data)throw {code:'CONTRACT'};result.data.data=normalize(result.data.data);return result.data;}finally{root.clearTimeout(timer);}}
  function clear(){++generation;++detailGeneration;capabilities={};legacyAllowed=false;snapshot=false;cursor=null;cursors=[];$('am-content').replaceChildren();$('am-detail').replaceChildren();$('am-observed').textContent='';$('am-pagination').hidden=true;$('am-account').textContent='ยังไม่ได้เข้าสู่ระบบ';$('am-legacy').hidden=true;if($('am-drawer').open)$('am-drawer').close();}
  function outputs(parent,rows){if(!rows?.length){empty(parent,'ยังไม่มีชุดงานในช่วงที่เลือก');return;}const list=n('ul',null,'am-list');for(const o of rows){const li=n('li');li.append(n('strong',o.projectCode||(o.activity==='battle_pass'?battlePassProject(o):null)||o.displayId||labels[o.activity]||'ชุดงาน'));li.append(n('p',(o.campaignStart||'ไม่ทราบวันเริ่ม')+' — '+(o.campaignEnd||'ไม่ทราบวันสิ้นสุด'),'am-muted'));const states=n('p');states.append('การสร้าง: ',badge(o.generationState),' · บรีฟ: ',badge(o.briefState==='pending'?'pending_acceptance':o.briefState),' · มอบหมาย: ',badge(o.assignmentState));li.append(states);if(o.marketingWorkingSheetLinked!=null)li.append(n('p','Working Sheet ใน Marketing Plan: '+(o.marketingWorkingSheetLinked?'เชื่อมกับ CR แล้ว':'ยังยืนยันการเชื่อมไม่ได้')));if(o.briefUrl)li.append(link('เปิด Brief',o.briefUrl));if(o.workingSheetUrl)li.append(link(o.mode==='production'&&o.source==='shared'?'ต้นทาง Working Sheet':'Working Sheet',o.workingSheetUrl));const cr=o.workItemUrl||o.crUrl;if(cr)li.append(link('เปิด '+(o.displayId||'CR')+' เพื่อตรวจบรีฟ',cr));list.append(li);}parent.append(list);}
  function projectRows(rows){return rows.flatMap(a=>a.projects?.length?a.projects.map(p=>({...a,...p,projects:null,label:a.label,key:a.key})):a.completedOutput?[{...a,projects:null,projectCode:battlePassProject(a.completedOutput)}]:[{...a,projects:null}]);}
  function isDone(a){return !!a.completedOutput||a.lastSourceCheck?.code==='existing_output_complete'||a.lastRun?.status==='complete';}
  function businessStatus(a){if(isDone(a))return badge('done');const c=a.lastSourceCheck,r=a.lastRun;
    return badge(r&&(!c||!c.checkedAt||new Date(r.eventAt)>=new Date(c.checkedAt))?r.status:c?.code||c?.status||'unknown');}
  function nextAction(a){if(isDone(a))return 'ชุดงานครบแล้ว';const c=a.lastSourceCheck;if(c?.workingSheetLinked===false)return 'ใส่ Working Sheet ใน SSoT';if(c?.confirmed===false)return 'ยืนยัน Loot ใน SSoT';if(a.lastRun?.status==='held')return 'ตรวจเหตุการณ์ที่พักไว้';return c?.sourceReady===true?'รอระบบสร้างงาน':'ตรวจข้อมูลต้นทาง';}
  function activities(parent,rows){
    table(parent,['กิจกรรม / โครงการ','สถานะงาน','ตรวจต้นทางล่าสุด','สิ่งที่ต้องทำ'],projectRows(rows),a=>{
      const name=n('div');name.append(n('strong',a.projectCode||a.label||labels[a.key]));if(a.projectCode)name.append(n('small',a.label||labels[a.key]));
      const action=n('div');action.append(n('small',nextAction(a)),button('ดูรายละเอียด',()=>activityDetail(a)));
      const evidence=n('details',null,'am-source-evidence');evidence.append(n('summary',time(a.lastSourceCheck?.checkedAt||a.lastSourceCheck?.sourceCheckedAt)),sourceStatus(a));
      return [name,businessStatus(a),evidence,action];
    });
  }
  function technical(parent,title='ข้อมูลเทคนิค'){const d=n('details',null,'am-technical');d.append(n('summary',title));const body=n('div');d.append(body);parent.append(d);return body;}
  function tools(){closeDrawer();state.view='tools';state.activity='battle_pass';url();sync();load();}
  function scanCoverage(parent,data){
    const box=panel('ระบบตรวจอัตโนมัติ');const scans=data.scanners||[];
    if(state.mode==='test')box.append(n('p','TEST · ไม่ใช้ผลนี้ยืนยันการตรวจ Production'));
    else if(!scans.length)box.append(n('p','ยังไม่มีหลักฐานรอบตรวจล่าสุด · การเปิดระบบไม่ยืนยันว่าตรวจครบแล้ว'));
    for(const source of ['shared','battle_pass']){
      const activities=(data.activities||[]).filter(a=>a.sourceSystem===source);if(!activities.length)continue;
      const scan=scans.find(t=>t.source===source),config=activities[0],row=n('div',null,'am-scan-row');
      row.append(n('strong',source==='shared'?'Membership · Golden Spin · Conqueror · Topup':'Battle Pass'));
      const enabled=config.runnerEnabled===true&&config.schedulerState==='active'&&config.schedulerEnabled!==false;
      row.append(n('span',!enabled?'ระบบตรวจยังไม่เปิดหรืออ่านสถานะไม่ได้':!scan?'ระบบตรวจอัตโนมัติเปิดอยู่ · รอหลักฐานการตรวจ':scan.fresh===true?'ตรวจทำงานปกติ':scan.status==='running'?'กำลังตรวจ':'ควรตรวจสถานะระบบ'));
      row.append(n('small','ตรวจล่าสุด: '+time(scan?.finishedAt||scan?.startedAt)));
      if(source==='battle_pass'&&config.lastRun?.period&&config.lastRun.period!==state.month)row.append(n('small','รอบที่ตัวตรวจกำลังติดตาม: '+(battlePassProject(config.lastRun)||periodLabel(config.lastRun.period))));
      if(source==='shared'&&scan)row.append(n('small','พบต้นทาง '+(scan.observedFamilies??'—')+' / 4 กลุ่มกิจกรรมในรอบนี้'));
      row.append(n('small',enabled?'ตามตาราง: ทุก 30 นาที':'ตารางเวลา: '+scheduleText(config)));box.append(row);
    }
    box.append(n('small','รอ Confirm Loot เป็นความพร้อมของต้นทาง ไม่ใช่ระบบตรวจขัดข้อง · เวลารอบตรวจครอบคลุมหลายเดือน','am-muted'));parent.append(box);
  }
  function dl(parent,items){const list=n('dl');for(const [label,value]of items){list.append(n('dt',label),n('dd',value??'ไม่มีข้อมูล'));}parent.append(list);}
  function openDrawer(title){++detailGeneration;opener=doc.activeElement;$('am-drawer-title').textContent=title;$('am-detail').replaceChildren();if(!$('am-drawer').open)$('am-drawer').showModal();$('am-close').focus();}
  function activityDetail(a){
    openDrawer(a.projectCode||a.label||labels[a.key||a.activity]||'กิจกรรม');
    const main=$('am-detail');main.append(currentStatus(a),n('p',nextAction(a)));
    main.append(sourceStatus(a));
    if(a.existingOutput){const out=a.existingOutput;main.append(link('เปิด CR '+(out.displayId||''),out.crUrl),link('เปิด Brief',out.briefUrl));}
    if(a.completedOutput)main.append(link('เปิด CR เพื่อตรวจบรีฟ',a.completedOutput.crUrl||a.completedOutput.workItemUrl));
    if(a.lastRun?.entityType==='production_run')main.append(button('ดูรัน production ล่าสุด',()=>detail(a.lastRun)));
    if(a.key==='battle_pass'&&capabilities.battlePassRead&&state.mode==='production')main.append(button('จัดการ Battle Pass',tools));
    const tech=technical(main);dl(tech,[['ระบบ',a.sourceSystem||a.source],['Runner',a.runnerEnabled==null?'อ่านสถานะไม่ได้':a.runnerEnabled?'เปิด':'ปิด'],['Scheduler',scheduleText(a)],['SeaTalk notifier',a.notifierEnabled==null?'อ่านสถานะไม่ได้':a.notifierEnabled?'เปิด':'ปิด'],['ขอบเขต',a.configurationScope==='shared'?'ใช้ร่วมกับ 4 กิจกรรม':'เฉพาะ Battle Pass']]);
    if(['membership','conqueror_crate','golden_spin','topup_promotion'].includes(a.key||a.activity))integrationPanel(a.key||a.activity,state.mode,detailGeneration,tech);
  }
  async function integrationPanel(activity,mode,token,target){
    const box=panel('หลักฐานการเชื่อมต่อที่บันทึกไว้');box.setAttribute('aria-live','polite');box.append(n('p','กำลังอ่านหลักฐาน…'));(target||$('am-detail')).append(box);
    const names={alpha:'Alpha',mcp:'MCP',seatalk:'SeaTalk'};
    const successes={alpha:'มีผลวิเคราะห์ Alpha ที่บันทึกแล้ว',mcp:'มีบันทึกการอ่าน MCP ที่ได้รับอนุญาต',seatalk:'SeaTalk API รับข้อความแล้ว'};
    const latestLabels={cached:'มีผลในแคช',allowed:'บันทึกการอ่านที่ได้รับอนุญาต',unverified:'ยังยืนยันหลักฐานไม่ได้',unauthorized:'ไม่ผ่านการยืนยันสิทธิ์',forbidden:'ไม่มีสิทธิ์',rate_limited:'เกินขีดจำกัด',not_found:'ไม่พบรายการ',invalid_args:'ข้อมูลคำขอไม่ถูกต้อง'};
    const timeLabels={request_created:'เวลาสร้างคำขอ',call_recorded:'เวลาบันทึกการเรียก',record_updated:'เวลาอัปเดตหลักฐาน'};
    function valid(d,expectedMode){return d?.activity===activity&&d.mode===expectedMode&&d.scope==='recorded_evidence'&&Array.isArray(d.components)&&Object.keys(names).every(key=>d.components.filter(c=>c.component===key).length===1);}
    function render(d){
      const section=n('section');section.dataset.integrationMode=d.mode;
      section.append(n('h3',d.mode==='test'?'หลักฐาน TEST เดิม':'หลักฐาน Production'));
      for(const key of Object.keys(names)){
        const c=d.components.find(item=>item.component===key),row=n('div',null,'am-integration');
        row.append(n('strong',names[key]));
        if(c.availability!=='available')row.append(n('p',c.availability==='not_instrumented'?'Monitor ยังไม่รองรับหลักฐานระบบนี้ในโหมดนี้':'อ่านแหล่งหลักฐานไม่ได้'));
        else{
          row.append(n('p',c.lastSuccessAt?successes[key]:'ยังไม่มีหลักฐานในโหมดนี้'));
          if(c.latestStatus)row.append(n('p','ล่าสุด: '+(latestLabels[c.latestStatus]||status(c.latestStatus))));
          if(c.latestAt)row.append(n('small',(timeLabels[c.timeMeaning]||'เวลาบันทึก')+': '+time(c.latestAt)));
          if(c.lastSuccessAt)row.append(n('p','หลักฐานสำเร็จล่าสุด ('+(timeLabels[c.timeMeaning]||'เวลาบันทึก')+'): '+time(c.lastSuccessAt)));
        }
        section.append(row);
      }
      box.append(section);
    }
    try{
      const result=await rpc('activity_automation_monitor_integrations',{p_activity:activity,p_mode:mode});
      if(token!==detailGeneration)return;
      const d=result.data;if(!valid(d,mode)||(mode==='production'&&!valid(d.testEvidence,'test')))throw {code:'CONTRACT'};
      box.replaceChildren(n('h2','หลักฐานการเชื่อมต่อที่บันทึกไว้'));
      box.append(n('p','ข้อมูลย้อนหลังทุกเดือน ไม่ใช่การตรวจการเชื่อมต่อสด และไม่ยืนยันว่า Production เปิดรันแล้ว','am-muted'));
      render(d);if(mode==='production')render(d.testEvidence);
      box.append(n('p','Alpha / MCP เป็นระบบวิเคราะห์แยกจากการสร้างบรีฟ · SeaTalk API รับแล้วไม่ได้หมายถึงผู้รับอ่านแล้ว','am-muted'),n('small','อ่านข้อมูล ณ '+time(result.observedAt)));
    }catch(e){
      if(token!==detailGeneration)return;
      box.replaceChildren(n('h2','หลักฐานการเชื่อมต่อที่บันทึกไว้'),n('p',e.code==='PGRST202'?'ยังไม่ได้ติดตั้ง API อ่านหลักฐาน · ไม่ได้หมายความว่าการทดสอบเดิมล้มเหลว':'Monitor ยังอ่านหลักฐานไม่ได้ · ยังสรุปผลการเชื่อมต่อไม่ได้'));
    }
  }
  function issueMessage(r){const messages={manual_output_requires_review:'ต้องตรวจว่า Working Sheet เชื่อม CR และ Brief ของโครงการนี้ถูกต้อง',validation_failed:'ข้อมูลต้นทางไม่ผ่านเงื่อนไข ต้องตรวจวันที่และรอบกิจกรรม',loot_not_confirmed:'Loot ยังไม่ยืนยัน',source_identity_invalid:'ชื่อหรือวันที่ต้นทางไม่ตรงกับโครงการ'};return messages[r.code]||r.message||status(r.status);}
  function renderSummary(data){
    const area=$('am-content');workspaceAvailable=data.issueReviewAvailable===true;scanCoverage(area,data);if(data.cards?.complete===false)area.append(n('p','ข้อมูลไม่ครบ · แสดงเฉพาะจำนวนและสถานะที่อ่านได้','am-muted'));
    if(state.view==='tools'){area.append(n('p','เครื่องมือด้านล่างมีผลเฉพาะ Battle Pass · เดือนที่ตัวตรวจพบอาจเป็นรอบถัดไป'));if($('am-legacy').hidden)empty(area,'ไม่มีสิทธิ์ใช้เครื่องมือ Battle Pass ในสภาพแวดล้อมนี้');return;}
    if(state.view==='overview'){
      const stats=n('p',null,'am-statline');stats.append(n('span','ชุดงานครบ: '+projectRows(data.activities||[]).filter(isDone).length),n('span','สร้างใหม่: '+(data.cards?.outputs??'—')),n('span','บรีฟรอยืนยัน: '+(data.cards?.pendingBriefs??'—')),n('span','เหตุการณ์รอตรวจ: '+(data.cards?.attention??'—')));area.append(stats);
      const queue=panel('งานที่ต้องทำตอนนี้');for(const o of data.outputs||[])if(o.briefState==='pending'){const row=n('div',null,'am-task-row');row.append(n('strong',o.projectCode||battlePassProject(o)||o.displayId),n('p','รอ Operation ตรวจบรีฟและยืนยันพร้อมคอมเมนต์'),link('เปิด '+o.displayId+' เพื่อตรวจบรีฟ',o.crUrl||o.workItemUrl));queue.append(row);}
      if(!queue.querySelector('.am-task-row'))empty(queue,'ไม่มีบรีฟที่รอยืนยันในชุดข้อมูลที่อ่านได้');area.append(queue);
      const attention=panel('เหตุการณ์ที่ยังไม่สรุปผล');for(const a of data.attention||[]){const item=n('div',null,'am-task-row');item.append(n('strong',a.projectCode||labels[a.activity]||a.activity||'ระบบ'),n('p',issueMessage(a)),n('small','เกิดเมื่อ '+time(a.eventAt)+' · '+(a.period||'ยังไม่ผูกเดือน')));
        if(a.review?.state==='acknowledged')item.append(n('small','รับทราบแล้ว · '+a.review.comment));
        if(a.id&&a.source)item.append(button('ดูหลักฐาน',()=>detail(a)));attention.append(item);}
      if(!attention.querySelector('.am-task-row'))empty(attention,'ไม่มีเหตุการณ์เปิดในข้อมูลที่อ่านได้');area.append(attention);
      if(data.reviewHistory?.length){const history=technical(area,'เหตุการณ์ที่ปิดแล้ว ('+data.reviewHistory.length+')');for(const r of data.reviewHistory)history.append(n('p',(r.projectCode||labels[r.activity])+' · '+(r.review.state==='resolved'?'ตรวจหลักฐานว่าแก้แล้ว':'เก็บเป็นประวัติ')+' · '+r.review.comment));}
    }
    const ap=panel('สถานะกิจกรรม · '+periodLabel(state.month));activities(ap,data.activities||[]);area.append(ap);
    const op=technical(area,'ชุดงานที่ Automation สร้างในเดือนนี้');outputs(op,data.outputs);
  }
  function renderRows(data){
    const area=$('am-content'),p=panel(views[state.view]);
    if(state.view==='runs'){
      const scans=state.history==='scans',groups=new Map(),rows=[];
      for(const r of data.rows||[]){if(scans){const key=JSON.stringify([r.source,r.activity,r.period,r.projectCode,r.status,r.code]);if(groups.has(key)){groups.get(key).events.push(r);continue;}const g={...r,events:[r]};groups.set(key,g);rows.push(g);}else rows.push(r);}
      p.append(n('p',scans?'รวมผลตรวจซ้ำเฉพาะรายการในหน้านี้ เปิดดูเวลาของแต่ละรอบได้':'ประวัตินี้ใช้เดือนที่เกิดเหตุการณ์ ไม่ใช่เดือนเริ่มกิจกรรม','am-muted'));
      table(p,['เวลาบันทึก','กิจกรรม / รอบ','ประเภท','ผล','รายละเอียด'],rows,r=>[time(r.eventAt),(labels[r.activity]||'ตัวตรวจ 4 กิจกรรม')+' · '+(r.projectCode||r.period||'ทุกเดือนในขอบเขต'),r.entityType==='scan'?'ตรวจต้นทาง':r.source==='battle_pass'&&['waiting_confirmation','readiness_checked','no_pending_month'].includes(r.status)?'ตรวจต้นทาง':'รันทำงาน',badge(r.status),button(r.events?.length>1?'ดู '+r.events.length+' รอบตรวจ':'ดูรายละเอียด',()=>{if(r.events?.length>1){openDrawer('รอบตรวจที่ผลเหมือนกัน');for(const event of r.events)$('am-detail').append(button(time(event.eventAt),()=>detail(event)));}else detail(r);})]);
    }else table(p,['เวลา','กิจกรรม / CR','ประเภท / ผู้รับ','สถานะ','ครั้ง / ครั้งถัดไป','รายละเอียด'],data.rows,r=>[time(r.eventAt),(labels[r.activity]||r.activity||'—')+' · '+(r.displayId||r.projectCode||'—'),(r.kind||r.notificationType||'—')+' / '+(r.recipientLabel||'ไม่แสดงข้อมูลผู้รับ'),badge(r.status),(r.attempts??'—')+' / '+time(r.nextAttemptAt),button('ดูรายละเอียด',()=>notificationDetail(r))]);
    area.append(p);nextCursor=data.nextCursor;$('am-pagination').hidden=false;$('am-prev').disabled=!cursors.length;$('am-next').disabled=!data.hasMore||!nextCursor;$('am-page').textContent='หน้า '+(cursors.length+1);
  }
  function notificationDetail(r){openDrawer('รายละเอียดการแจ้งเตือน');dl($('am-detail'),[['กิจกรรม',labels[r.activity]],['สถานะ',status(r.status)],['ผู้รับ',r.recipientLabel],['ประเภท',r.kind||r.eventKind],['จำนวนครั้ง',r.attempts??r.attemptCount],['ครั้งถัดไป',time(r.nextAttemptAt)],['หลักฐาน API รับ',r.providerAccepted===true?'มีหลักฐาน':r.providerAccepted===false?'ยังไม่มีหลักฐาน':'ไม่มีข้อมูล'],['Code',r.code]]);$('am-detail').append(n('p','API รับข้อความแล้วไม่ได้หมายถึงผู้รับอ่านแล้ว หากยังยืนยันผลไม่ได้ ต้องตรวจสอบก่อนส่งซ้ำ'));}
  async function diagnosisPanel(run,token){
    if(run.source!=='shared'||!['membership','conqueror_crate','golden_spin','topup_promotion'].includes(run.activity)||run.mode!=='test'||!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(run.id||''))return;
    const box=panel('วิเคราะห์สาเหตุ · Activity Diagnosis');box.setAttribute('aria-live','polite');$('am-detail').append(box);
    const args={p_activity:run.activity,p_mode:run.mode,p_run_id:run.id};let busy=false,sequence=0;
    async function read(request=false){
      if(busy||token!==detailGeneration)return;busy=true;const seq=++sequence;box.querySelectorAll('button').forEach(b=>b.disabled=true);let timer;
      try{
        const result=await Promise.race([client.rpc('activity_automation_diagnosis_'+(request?'request':'get'),args),new Promise((_,reject)=>{timer=root.setTimeout(()=>reject(new Error('timeout')),15000);})]);
        if(token!==detailGeneration||seq!==sequence)return;
        const d=result.data;if(result.error||!d||typeof d.available!=='boolean'||d.error)throw new Error('unavailable');
        box.replaceChildren(n('h2','วิเคราะห์สาเหตุ · Activity Diagnosis'));
        const states={unavailable:'ยังไม่เปิดใช้',deterministic:'คำแนะนำจากกฎที่ตรวจสอบแล้ว',pending:'รอวิเคราะห์',processing:'กำลังวิเคราะห์',cached:'ผลวิเคราะห์ที่บันทึกไว้',failed:'วิเคราะห์ไม่สำเร็จ',stale:'หลักฐานเปลี่ยนแล้ว',rate_limited:'ครบขีดจำกัดการวิเคราะห์'};
        box.append(n('p',states[d.status]||'ยังไม่มีผลวิเคราะห์'),n('small','ข้อมูล ณ '+time(d.asOf)));
        if(d.diagnosis){const v=d.diagnosis;dl(box,[['สาเหตุ',v.diagnosis],['หลักฐาน',v.evidence],['ผลกระทบ',v.impact],['คำแนะนำ',v.recommendedAction?.raw||v.recommendedAction?.code],['ความเสี่ยง',v.risk],['ความมั่นใจ',v.confidence==null?'ไม่มีข้อมูล':v.confidence+' / 100']]);}
        if(d.versions)box.append(n('small','Agent: '+(d.versions.agent||'—')+' · Knowledge: '+(d.versions.knowledge||'—')+' · Tools: '+(d.versions.tools||'—')));
        box.append(n('p','Agent ให้คำแนะนำเท่านั้น ไม่รันงาน แก้ไข หรือส่งข้อความแทนคุณ','am-muted'));
        if(d.available===true&&d.canRequest===true){box.append(n('p','การขอวิเคราะห์อาจมีค่าใช้จ่าย AI; การรีเฟรชจะอ่านผลเดิมเท่านั้น','am-muted'),button('ขอวิเคราะห์',()=>read(true)));}
        if(d.available===true)box.append(button('รีเฟรชผลวิเคราะห์',()=>read(false)));
      }catch{if(token===detailGeneration){box.replaceChildren(n('h2','วิเคราะห์สาเหตุ · Activity Diagnosis'),n('p',request?'ยังยืนยันผลคำขอไม่ได้ ให้รีเฟรชผลก่อนขอซ้ำ':'ยังอ่านระบบวิเคราะห์ไม่ได้ หรือยังไม่ได้เปิดใช้'));box.append(button('รีเฟรชผลวิเคราะห์',()=>read(false)));}}
      finally{root.clearTimeout(timer);busy=false;}
    }
    await read();
  }
  async function detail(row,push=true){
    if(row.entityType==='notification'){notificationDetail(row);reviewPanel(row,detailGeneration);return;}
    if(row.entityType==='scan'){openDrawer('รอบตรวจต้นทาง · 4 กิจกรรม');$('am-detail').append(badge(row.status),n('p','ตรวจต้นทางตามตาราง ไม่ใช่รันสร้างงาน'),n('p','เริ่ม '+time(row.eventAt)+' · จบ '+time(row.finishedAt)),n('small','ประวัติรอบเก่าไม่มี snapshot รายโครงการ จึงไม่ใช้สถานะปัจจุบันแทนผลย้อนหลัง'));return;}
    if(['incident','health'].includes(row.entityType)){
      openDrawer(row.entityType==='health'?'สถานะที่ต้องตรวจสอบ':'หลักฐานที่ต้องตรวจสอบ');
      dl($('am-detail'),[['กิจกรรม',labels[row.activity]],['สถานะ',status(row.status)],['Code',row.code],['ขั้นตอน',row.stage],['จำนวนครั้ง',row.occurrences],['ล่าสุด',time(row.eventAt)],['รอบกิจกรรม',row.campaignUnbound?'ยังผูกกับรอบกิจกรรมไม่ได้':row.projectCode]]);
      reviewPanel(row,detailGeneration);
      if(row.runId)$('am-detail').append(button('ดูรันที่เกี่ยวข้อง',()=>detail({id:row.runId,source:row.source,entityType:row.source==='battle_pass'?'tick':'run'})));
      return;
    }
    openDrawer('รายละเอียดรัน');const token=detailGeneration;state.run=row.id;state.source=row.source;state.entityType=row.entityType||'run';if(push)url();$('am-detail').append(n('p','กำลังอ่านหลักฐาน…'));
    try{
      const result=await rpc('activity_automation_monitor_run',{p_source:row.source,p_run_id:row.id,p_entity_type:row.entityType||'run'});if(token!==detailGeneration)return;
      const d=result.data,r=d.run||{};$('am-detail').replaceChildren();
      $('am-detail').append(n('h3',r.projectCode||labels[r.activity]||'กิจกรรม'),badge(r.status),n('p',issueMessage(r)),n('small','ผล ณ '+time(r.eventAt)));
      dl(technical($('am-detail')),[['Run ID',r.id],['ขั้นตอน',r.stage],['Project Code',r.projectCode],['Code',r.code]]);
      if(r.entityType==='production_run'){
        const recovery=technical($('am-detail'),'ข้อมูลการกู้คืนรันนี้');
        dl(recovery,[['การกู้คืน',recoveryLabels[r.recoveryState]||'ยังไม่มีหลักฐาน'],['ช่วงเวลารัน',r.leaseState==='active'?'ยังไม่หมด':r.leaseState==='expired'?'หมดแล้ว':'ไม่เกี่ยวข้อง'],['ต้นทางผ่านล่าสุด',time(r.sourceCheckedAt)],['Slides ผ่านล่าสุด',time(r.googleVerifiedAt)],['จบงานเมื่อ',time(r.completedAt)]]);
        if(r.needsAttention)recovery.append(n('p','ต้องตรวจหลักฐานก่อนดำเนินการต่อ ผล Google ที่ยังไม่แน่ชัดไม่ใช่หลักฐานว่าต้องสร้างไฟล์ใหม่'));
        recovery.append(n('small','ผลตรวจต้นทางเป็นหลักฐาน ณ เวลาที่บันทึก ไม่ใช่การตรวจ Confirmed Loot สด','am-muted'));
      }
      if(d.outputs?.length)outputs($('am-detail'),d.outputs);else $('am-detail').append(n('p','รันนี้ยังไม่มีชุดงานที่บันทึกไว้ · ดูหลักฐานปัจจุบันในส่วนติดตามเหตุการณ์','am-muted'));
      if(r.entityType==='production_run'&&d.latestNotification){const notification=panel('การแจ้งเตือนล่าสุด');notification.append(badge(d.latestNotification.status),n('p',d.latestNotification.providerAccepted?'SeaTalk API รับข้อความแล้ว ไม่ใช่หลักฐานว่าผู้รับอ่านแล้ว':'ยังไม่มีหลักฐานว่า SeaTalk API รับข้อความ'));$('am-detail').append(notification);}
      const timeline=technical($('am-detail'),'ประวัติและหลักฐานแต่ละขั้นตอน');for(const e of d.timeline||[])timeline.append(n('p',(e.label||e.stage||e.kind||'ขั้นตอน')+' · '+status(e.status)+' · '+time(e.at||e.eventAt||e.checkedAt)));if(!d.timeline?.length)empty(timeline,'ยังไม่มี timeline ที่บันทึกไว้');
      diagnosisPanel(r,token);reviewPanel({...row,...r,mode:r.mode||state.mode,entityType:r.entityType||row.entityType},token);
    }catch{if(token===detailGeneration)$('am-detail').replaceChildren(n('p','อ่านรายละเอียดไม่ได้ หรือไม่มีสิทธิ์เข้าถึงรายการนี้'));}
  }
  async function reviewPanel(row,token){
    if(state.mode!=='production'||row.entityType==='health'||!['held','failed','blocked','review_required','resolution_unknown','uncertain','generation_pending','source_blocked','validation_failed','needs_review'].includes(row.status))return;
    const box=panel('ติดตามเหตุการณ์');$('am-detail').append(box);box.append(n('p','กำลังอ่านสถานะเหตุการณ์…'));let busy=false,current;
    const args={p_source:row.source,p_mode:row.mode||state.mode,p_entity_type:row.entityType,p_id:row.id};
    async function read(){try{const response=await rpc('activity_automation_monitor_issue_get',args);if(token!==detailGeneration)return;current=response.data;render();}catch(e){if(token!==detailGeneration)return;box.replaceChildren(n('h2','ติดตามเหตุการณ์'),n('p',e.code==='PGRST202'?'ยังไม่ได้ติดตั้ง API รับทราบและปิดเหตุการณ์':'อ่านสถานะไม่ได้ กรุณาลองตรวจซ้ำ'),button('ตรวจซ้ำ',read));}}
    function render(){box.replaceChildren(n('h2','ติดตามเหตุการณ์'));const review=current.review;box.append(n('p',review?({acknowledged:'รับทราบแล้ว',resolved:'ตรวจหลักฐานว่าแก้แล้ว',archived:'เก็บเป็นประวัติ'}[review.state]||review.state):'ยังไม่มีผู้รับทราบ'));
      if(current.currentOutput){const o=current.currentOutput;box.append(n('p','หลักฐานปัจจุบัน: พบ Working Sheet, CR และ Brief ครบที่ตรงโครงการและรอบ'),link('เปิด '+(o.displayId||'CR'),o.crUrl||o.workItemUrl),link('เปิด Brief',o.briefUrl));}
      if(review)box.append(n('p',review.comment),n('small','ผู้รับผิดชอบ: '+(review.ownerLabel||'บัญชีผู้รับทราบ')+' · '+time(review.updatedAt)));
      box.append(n('p','รับทราบ = รับผิดชอบติดตาม · เก็บเป็นประวัติไม่ถือว่าแก้แล้ว · ทุกการเปลี่ยนแปลงมีบันทึก','am-muted'));
      if(current.canManage&&!['resolved','archived'].includes(review?.state)){
        const label=n('label','คอมเมนต์ (3–500 ตัวอักษร)'),input=n('textarea');input.maxLength=500;input.minLength=3;label.append(input);box.append(label);
        async function act(action){if(busy||input.value.trim().length<3){input.setCustomValidity('กรุณาใส่คอมเมนต์อย่างน้อย 3 ตัวอักษร');input.reportValidity();return;}input.setCustomValidity('');busy=true;box.querySelectorAll('button').forEach(b=>b.disabled=true);
          try{const result=await rpc('activity_automation_monitor_issue_action',{...args,p_issue_key:current.issueKey,p_action:action,p_comment:input.value.trim()});if(token!==detailGeneration)return;current=result.data;render();note('บันทึกแล้ว · รีเฟรชภาพรวมเพื่อดูรายการล่าสุด');snapshot=false;}
          catch(e){if(token!==detailGeneration)return;box.append(n('p',e.code==='23514'?'ยังไม่มีหลักฐานชุดงานครบที่ตรงโครงการและรอบ จึงปิดว่าแก้แล้วไม่ได้':e.code==='40001'?'หลักฐานเปลี่ยนแล้ว กรุณาตรวจซ้ำก่อนดำเนินการ':'ยังยืนยันการบันทึกไม่ได้ ให้ตรวจซ้ำก่อนกดอีกครั้ง'));}
          finally{busy=false;if(token===detailGeneration)box.querySelectorAll('button').forEach(b=>b.disabled=false);}}
        box.append(button('รับทราบ',()=>act('acknowledged')),button('ตรวจหลักฐานและปิดว่าแก้แล้ว',()=>act('resolved')),button('เก็บเป็นประวัติ',()=>{if(root.confirm('เก็บเหตุการณ์นี้เป็นประวัติ พร้อมเหตุผลที่กรอกไว้? การทำงานและการแจ้งเตือนยังใช้กติกาเดิม'))act('archived');}));
      }
      box.append(button('ตรวจซ้ำ',read));if(current.audit?.length){const history=technical(box,'ประวัติการติดตาม');for(const a of current.audit)history.append(n('p',time(a.at)+' · '+({acknowledged:'รับทราบ',resolved:'แก้แล้ว',archived:'เก็บเป็นประวัติ'}[a.action]||a.action)+' · '+a.comment));}
    }
    await read();
  }
  function closeDrawer(updateUrl=true){++detailGeneration;if($('am-drawer').open)$('am-drawer').close();if(state.run){state.run='';state.source='';if(updateUrl)url(true);}opener?.focus?.();}
  async function load(){
    const token=++generation;sync();$('am-pagination').hidden=true;$('am-content').setAttribute('aria-busy','true');if(!snapshot)$('am-content').replaceChildren(n('div',null,'am-skeleton'));note('กำลังอ่านข้อมูล…');
    try{
      if(!client)throw {code:'CLIENT'};
      const user=await client.auth.getUser();if(token!==generation)return;
      if(user.error||!user.data?.user){authUser=null;clear();note('กรุณาเข้าสู่ระบบ FlowMate ก่อนดูข้อมูล');const a=n('a','เข้าสู่ระบบ');a.href='./';$('am-content').append(a);return;}
      authUser=user.data.user.id;$('am-account').textContent='เข้าสู่ระบบแล้ว';
      const access=await rpc('activity_automation_monitor_access');if(token!==generation)return;
      capabilities=access.data.capabilities||access.data;sync();if(!capabilities.sharedRead&&!capabilities.battlePassRead)throw {code:'42501'};
      const args={p_mode:state.mode,p_month:state.month,p_activity:state.activity==='all'?null:state.activity};let name='activity_automation_monitor_workspace_summary';
      if(['runs','notifications'].includes(state.view)){name='activity_automation_monitor_'+state.view;args.p_status=state.status||null;args.p_cursor=cursor;args.p_limit=25;if(state.view==='runs'){args.p_search=state.search||null;args.p_history=state.history;name='activity_automation_monitor_history';}}
      let result;let fallback=false;try{result=await rpc(name,args);}catch(e){if(e.code!=='PGRST202')throw e;fallback=true;const oldArgs={...args};delete oldArgs.p_history;result=await rpc(state.view==='runs'?'activity_automation_monitor_runs':'activity_automation_monitor_summary',oldArgs);}if(token!==generation)return;
      $('am-content').replaceChildren();if(['overview','activities','tools'].includes(state.view))renderSummary(result.data);else renderRows(result.data);snapshot=true;
      $('am-observed').textContent='ข้อมูล ณ '+time(result.observedAt);const missing=(result.sources||[]).filter(s=>s.status!=='ok');
      note(fallback?'กำลังแสดงข้อมูลจาก Monitor รุ่นเดิม · ยังไม่มีข้อมูลรอบตรวจรวมและการปิดเหตุการณ์':missing.length?'ข้อมูลไม่ครบ: '+missing.map(s=>(s.source||'ระบบ')+' — '+(s.status==='forbidden'?'ไม่มีสิทธิ์':'อ่านไม่ได้')).join(' · '):'');
      if(state.run&&state.source)detail({id:state.run,source:state.source,entityType:state.entityType},false);
    }catch(e){
      if(token!==generation)return;
      if(e.code==='42501'){clear();$('am-account').textContent=authUser?'เข้าสู่ระบบแล้ว · ไม่มีสิทธิ์':'ยังไม่ได้เข้าสู่ระบบ';note('ไม่มีสิทธิ์อ่านข้อมูล Activity Automation',true);}
      else note(snapshot?'ข้อมูลเดิม — รีเฟรชไม่สำเร็จ กรุณาลองใหม่':e.code==='PGRST202'?'ยังไม่ได้ติดตั้ง Monitor API · ส่วน Battle Pass เดิมยังใช้สิทธิ์เดิม':'อ่านข้อมูลไม่สำเร็จ กรุณารีเฟรชอีกครั้ง',true);
      if(!snapshot)$('am-content').replaceChildren();
    }finally{if(token===generation)$('am-content').setAttribute('aria-busy','false');}
  }
  function change(){state.mode=$('am-mode').value;state.activity=$('am-activity').value;state.month=/^20\d{2}-(0[1-9]|1[0-2])$/.test($('am-month').value)?$('am-month').value:month();state.search=$('am-search').value.slice(0,120);state.status=$('am-status').value.slice(0,80);state.history=$('am-history').value;state.run='';cursor=null;cursors=[];snapshot=false;url();load();}
  doc.querySelectorAll('[data-am-view]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();state.view=a.dataset.amView;state.run='';cursor=null;cursors=[];snapshot=false;url();load();}));
  ['am-mode','am-activity','am-month','am-status','am-history'].forEach(id=>$(id).addEventListener('change',change));$('am-search').addEventListener('input',()=>{root.clearTimeout(searchTimer);searchTimer=root.setTimeout(change,300);});$('am-refresh').addEventListener('click',()=>load());$('am-next').addEventListener('click',()=>{cursors.push(cursor);cursor=nextCursor;load();});$('am-prev').addEventListener('click',()=>{cursor=cursors.pop()??null;load();});$('am-close').addEventListener('click',()=>closeDrawer());$('am-drawer').addEventListener('cancel',e=>{e.preventDefault();closeDrawer();});root.addEventListener('popstate',()=>{closeDrawer(false);state=filters(root.location.search);cursor=null;cursors=[];snapshot=false;load();});root.addEventListener('flowmate:bp-monitor-access',event=>{legacyAllowed=event.detail===true;sync();});
  client?.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_OUT'){authUser=null;clear();note('กรุณาเข้าสู่ระบบ FlowMate ก่อนดูข้อมูล');}else if(event==='SIGNED_IN'||event==='USER_UPDATED'){if(!session?.user?.id||session.user.id!==authUser){clear();load();}}});
  $('am-menu').addEventListener('click',()=>{const expanded=$('am-menu').getAttribute('aria-expanded')==='true';$('am-menu').setAttribute('aria-expanded',String(!expanded));$('am-nav').classList.toggle('am-nav-open',!expanded);});
  sync();load();
})(typeof window!=='undefined'?window:globalThis);
