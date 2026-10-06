import {Window} from 'happy-dom';
import {readFileSync} from 'node:fs';
import {it,expect,vi} from 'vitest';
const source=readFileSync('workgrid-control-center.jsx','utf8');
async function setup(lead=false){const w=new Window({url:'http://localhost/home/control-center.html'});w.document.body.innerHTML='<div id="test-root"></div>';w.eval(source);const client={rpc:vi.fn(),functions:{invoke:vi.fn()}};const api=await (w as any).WorkgridControlCenter.createApp(w.document.getElementById('test-root'),client,{demo:true,lead});return {w,api,client,root:w.document.getElementById('test-root')!};}
const settle=()=>new Promise(r=>setTimeout(r,15));
it('formats verification, history and audit in Bangkok time without changing stored timestamps',async()=>{
 const w=new Window({url:'http://localhost/home/control-center.html'});w.document.body.innerHTML='<div id="test-root"></div>';w.eval(source);
 const timestamp='2026-10-06T05:06:41.16508+00:00';const rollover='2026-10-06T17:30:00+00:00';
 const workspace=(w as any).WorkgridControlCenter.demoWorkspace(false);
 workspace.entities.filter((e:any)=>e.kind==='destination').forEach((e:any)=>{e.verification={current:true,checked_at:timestamp};});
 workspace.deliveries=[{event_kind:'creative.assigned',created_at:rollover,status:'failed',payload:{}}];
 workspace.audit=[{created_at:timestamp,action:'synthetic',key:'test'}];
 const client={auth:{getUser:vi.fn(async()=>({data:{user:{id:'synthetic'}},error:null}))},rpc:vi.fn(async()=>({data:workspace,error:null}))};
 const root=w.document.getElementById('test-root')!;await (w as any).WorkgridControlCenter.createApp(root,client);
 click(root,'[data-action=tab][data-key=destination]');expect(root.textContent).toContain('2026-10-06 12:06 (GMT+7)');expect(root.textContent).not.toContain(timestamp);
 click(root,'[data-action=tab][data-key=history]');expect(root.textContent).toContain('2026-10-07 00:30 (GMT+7)');
 click(root,'[data-action=tab][data-key=proposals]');expect(root.textContent).toContain('2026-10-06 12:06 (GMT+7)');
 expect(workspace.audit[0].created_at).toBe(timestamp);expect(workspace.deliveries[0].created_at).toBe(rollover);await w.happyDOM.close();
});
function click(root:any,selector:string){const el=root.querySelector(selector);expect(el).toBeTruthy();el.click();}
it.each(['recorded','unknown','stale','refresh-failed'])('TEST response handling distinguishes accepted and unknown without resending: %s',async(mode)=>{
 const w=new Window({url:'http://localhost/home/control-center.html'});w.document.body.innerHTML='<div id="test-root"></div>';w.eval(source);
 const workspace=(w as any).WorkgridControlCenter.demoWorkspace(false);workspace.tests=[];
 workspace.entities.filter((e:any)=>e.kind==='destination').forEach((e:any)=>{e.verification={current:true};});
 let reads=0;const client={auth:{getUser:vi.fn(async()=>({data:{user:{id:'synthetic'}},error:null}))},
  rpc:vi.fn(async()=>{reads++;return mode==='refresh-failed'&&reads>1?{data:null,error:{message:'Synthetic refresh failure'}}:{data:workspace,error:null};}),
  functions:{invoke:vi.fn(async(_name:any,{body}:any)=>{
   if(mode==='recorded'||mode==='stale')workspace.tests=[{id:mode==='stale'?'unrelated-test':body.request_id,kind:body.kind,key:body.key,status:'finished',outcome:{status:'provider_accepted'}}];
   return mode==='refresh-failed'?{data:{status:'provider_accepted'},error:null}:{data:null,error:{message:'Synthetic response failure'}};
  })}};
 const root=w.document.getElementById('test-root')!;await (w as any).WorkgridControlCenter.createApp(root,client);
 click(root,'[data-action=tab][data-key=destination]');click(root,'[data-action=test][data-key=folk-demo]');await settle();
 const form=root.querySelector('#wcc-confirm')!;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();
 const status=root.querySelector('#wcc-status')!.textContent;
 expect(status).toContain(mode==='recorded'||mode==='refresh-failed'?'SeaTalk รับข้อความแล้ว':'ยังยืนยันผล TEST ไม่ได้');
 if(mode==='refresh-failed')expect(status).toContain('รีเฟรชประวัติไม่ได้');
 expect(status).not.toContain('ตรวจหรือ TEST ไม่สำเร็จ');expect(client.functions.invoke).toHaveBeenCalledTimes(1);
 form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();expect(client.functions.invoke).toHaveBeenCalledTimes(1);await w.happyDOM.close();
});
it('offline demo includes pilot configuration and never initializes live client calls',async()=>{const {root,client,api,w}=await setup();expect(root.textContent).toContain('โหมดจำลอง');click(root,'[data-action=tab][data-key=destination]');expect(root.textContent).toContain('Njk2MTczMDEwNTg2');expect(api.getWorkspace().runtime).toBe(false);expect(client.rpc).not.toHaveBeenCalled();expect(client.functions.invoke).not.toHaveBeenCalled();await w.happyDOM.close();});
it('Apply uses explicit before/after review and reason',async()=>{const {root,api,w}=await setup();click(root,'[data-action=tab][data-key=bot]');click(root,'[data-action=edit][data-key=creative]');const input=root.querySelector('[name=label]') as any;input.value='Creative renamed';const form=root.querySelector('#wcc-edit')!;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();expect(root.querySelector('dialog')?.textContent).toContain('Review');expect(api.getWorkspace().entities.find((e:any)=>e.key==='creative').data.label).toBe('Creative Bot');(root.querySelector('[name=reason]') as any).value='rename in demo';root.querySelector('#wcc-confirm')!.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await settle();expect(api.getWorkspace().entities.find((e:any)=>e.key==='creative').data.label).toBe('Creative renamed');await w.happyDOM.close();});
it('team lead cannot activate Bots, TEST or runtime and sees only own team',async()=>{const {root,api,client,w}=await setup(true);expect(root.querySelector('[data-action=runtime]')).toBeNull();click(root,'[data-action=tab][data-key=profile]');expect(root.querySelector('[data-action=test]')).toBeNull();expect(root.textContent).not.toContain('Pond');expect(root.querySelector('[data-action=edit]')?.textContent).toBe('เสนอแก้ไข');expect(api.getWorkspace().entities.every((e:any)=>!e.team_code||e.team_code==='mkt')).toBe(true);click(root,'[data-action=tab][data-key=bot]');expect(root.querySelector('[data-action=edit]')).toBeNull();expect(root.querySelector('[data-action=add]')).toBeNull();expect(client.rpc).not.toHaveBeenCalled();await w.happyDOM.close();});
it('profile editor supports multiple situations and separate employment/channel fields',async()=>{const {root,w}=await setup();click(root,'[data-action=tab][data-key=profile]');click(root,'[data-action=edit][data-key=folk-demo]');expect(root.querySelectorAll('[name=events]:checked').length).toBe(2);expect((root.querySelector('[name=employment_type]') as any).value).toBe('Freelance');expect((root.querySelector('[name=channel]') as any).value).toBe('group');expect(root.querySelector('[name=seatalk_id]')).toBeTruthy();await w.happyDOM.close();});
it('unverified target cannot TEST even in offline UI',async()=>{const {root,w,client}=await setup();click(root,'[data-action=tab][data-key=destination]');click(root,'[data-action=test][data-key=folk-demo]');await settle();expect(root.querySelector('#wcc-status')?.textContent).toContain('ตรวจการเชื่อมต่อก่อน TEST');expect(client.functions.invoke).not.toHaveBeenCalled();await w.happyDOM.close();});
it('real mode validates session before reading workspace',async()=>{const w=new Window({url:'http://localhost/'});w.document.body.innerHTML='<div id="test-root"></div>';w.eval(source);const client={rpc:vi.fn(),auth:{getUser:vi.fn(async()=>({data:{user:null},error:null}))}};await (w as any).WorkgridControlCenter.createApp(w.document.getElementById('test-root'),client);expect(w.document.body.textContent).toContain('เข้าสู่ระบบ');expect(client.rpc).not.toHaveBeenCalled();await w.happyDOM.close();});
