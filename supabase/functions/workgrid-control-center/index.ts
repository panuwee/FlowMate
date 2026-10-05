// Provider credentials and privileged operations stay server-side.
declare const Deno:{env:{get(k:string):string|undefined};serve(h:(r:Request)=>Promise<Response>):void};
type Outcome='provider_accepted'|'retryable'|'failed'|'uncertain';
export type Dependencies={env:(k:string)=>string|undefined;fetch:typeof fetch;rpc:(name:string,args?:Record<string,unknown>)=>Promise<any>;
 authorize:(jwt:string)=>Promise<{admin:boolean;actor_id:string}>;cache?:Map<string,{token:string;expires:number}>;now?:()=>number};
class DeliveryError extends Error{constructor(public outcome:Outcome,public code:string){super(code);}}
const cache=new Map<string,{token:string;expires:number}>();
const workgridUrl=(d:Dependencies)=>d.env('WCC_WORKGRID_BASE_URL')??d.env('WORKGRID_BASE_URL')??'';
const headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,apikey,content-type,x-client-info',
 'access-control-allow-methods':'POST,OPTIONS','cache-control':'no-store'};
const reply=(data:any,status=200)=>Response.json(data,{status,headers});
async function call(d:Dependencies,path:string,body:any,tk?:string,sending=false){let r:Response;
 try{r=await d.fetch('https://openapi.seatalk.io'+path,{method:body===undefined?'GET':'POST',headers:{'content-type':'application/json',...(tk?{authorization:'Bearer '+tk}:{})},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000)});}catch{throw new DeliveryError(sending?'uncertain':'retryable','provider_network');}
 let json:any;try{json=await r.json();}catch{throw new DeliveryError(sending?'uncertain':'retryable','provider_response_invalid');}
 if(!r.ok||json.code!==0){const code=typeof json.code==='number'?json.code:r.status;
  throw new DeliveryError(r.status===429||code===101?'retryable':sending&&r.status>=500?'uncertain':'failed','provider_'+code);}
 return json;
}
async function token(d:Dependencies,b:any){const ref=b?.data?.credential_ref;
 if(typeof ref!=='string'||!/^WCC_BOT_SECRET_[A-Z0-9_]{1,64}$/.test(ref))throw new DeliveryError('failed','credential_reference_invalid');
 let secret=d.env(ref);
 if(!secret){
  // Reuse the two existing server-owned Bot credentials without copying values.
  // An alias is valid only for its exact configured App ID and known WCC reference.
  const aliases:Record<string,{app:string;id:string;secret:string}>={
   WCC_BOT_SECRET_CREATIVE:{app:'OTg1MjIwNzY0OTY3',id:'SEATALK_CREATIVE_APP_ID',secret:'SEATALK_CREATIVE_APP_SECRET'},
   WCC_BOT_SECRET_FLOWMATE:{app:'NTgyNzAzMjc5MjE4',id:'SEATALK_FlowMate_APP_ID',secret:'SEATALK_FlowMate_APP_Secret'}};
  const alias=aliases[ref];
  if(alias){if(b.data.app_id!==alias.app||d.env(alias.id)!==alias.app)throw new DeliveryError('failed','credential_app_mismatch');secret=d.env(alias.secret);}
 }
 if(!secret)throw new DeliveryError('failed','credential_missing');
 const tokens=d.cache??cache;const key=b.data.app_id+':'+secret;const now=d.now?.()??Date.now();const prior=tokens.get(key);
 if(prior&&prior.expires>now)return prior.token;
 const r=await call(d,'/auth/app_access_token',{app_id:b.data.app_id,app_secret:secret});const value=r.app_access_token??r.access_token;
 if(typeof value!=='string'||!value)throw new DeliveryError('failed','token_missing');
 const expiry=Number(r.expire);const until=Number.isFinite(expiry)&&expiry>now/1000?expiry*1000:now+Number(r.expires_in??7200)*1000;
 tokens.set(key,{token:value,expires:Math.min(until,now+7200000)-120000});return value;
}
async function group(d:Dependencies,tk:string,id:string){
 if(!/^[A-Za-z0-9_-]{8,100}$/.test(id)||id==='aaaaaabbbbbb')throw new DeliveryError('failed','group_id_invalid');
 let cursor='',name='',hidden=false;const members:string[]=[];const seen=new Set<string>();
 for(let n=0;n<100;n++){const r=await call(d,'/messaging/v2/group_chat/info?group_id='+encodeURIComponent(id)+'&page_size=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''),undefined,tk);
  if(!r.group)throw new DeliveryError('failed','group_info_missing');name=r.group.group_name??name;hidden=hidden||r.group.group_settings?.can_view_member_list===false;
  for(const m of r.group.group_user_list??[])if(typeof m.seatalk_id==='string')members.push(m.seatalk_id);
  cursor=r.next_cursor??'';if(!cursor)return {members,name,hidden};if(seen.has(cursor))throw new DeliveryError('failed','group_pagination_cycle');seen.add(cursor);
 }throw new DeliveryError('failed','group_pagination_incomplete');
}
export async function verify(d:Dependencies,kind:string,key:string){const c=await d.rpc('wcc_server_context',{p_kind:kind,p_key:key});let verified=false;let evidence:any;
 try{const tk=await token(d,c.bot);
  if(kind==='bot'){verified=true;evidence={code:'authentication_verified',scope:'authentication_only',permissions:'not_proven_by_token'};}
  else if(kind==='destination'||c.entity.data.channel==='group'){
   const info=await group(d,tk,c.destination.data.group_id);
   if(kind==='destination'){verified=true;evidence={code:'group_access_verified',group_name:info.name,members_visible:!info.hidden};}
   else{if(!c.member.active)throw new DeliveryError('failed','member_inactive');if(info.hidden)throw new DeliveryError('failed','member_list_hidden');
    if(typeof c.entity.data.seatalk_id!=='string'||!info.members.includes(c.entity.data.seatalk_id))throw new DeliveryError('failed','target_member_not_verified');
    verified=true;evidence={code:'group_member_verified',method:'group_info',group_id:c.destination.data.group_id};}
  }else if(kind==='profile'&&c.entity.data.channel==='direct'){
   if(!c.member.active||!c.member.email)throw new DeliveryError('failed','member_inactive');
   const r=await call(d,'/contacts/v2/get_employee_code_with_email',{emails:[c.member.email]},tk);
   const employee=Array.isArray(r.employees)&&r.employees.find((x:any)=>x.code===0&&x.employee_status===2&&typeof x.employee_code==='string'&&x.employee_code);
   if(!employee)throw new DeliveryError('failed','employee_code_missing');
   verified=true;evidence={code:'identity_resolved',employee_code:employee.employee_code,scope:'identity_only_not_delivery'};
  }else throw new DeliveryError('failed','channel_unavailable');
 }catch(e){evidence={code:e instanceof DeliveryError?e.code:'verification_failed'};}
 await d.rpc('wcc_record_check',{p_kind:kind,p_key:key,p_version:c.entity.version,p_verified:verified,p_evidence:evidence});return {verified,evidence};
}
function clean(v:unknown){return String(v??'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]!)).slice(0,1000);}
export function notificationMessage(e:any,base:string,test=false,freelance=false){
 if(freelance){return {tag:'text',text:{format:1,content:(test?'TEST · ':'')+(e.event_kind==='creative.review_requested'?'มี Task ให้รีวิว':'มี Task เข้ามา')}};}
 let u:URL;try{u=new URL(base);}catch{throw new DeliveryError('failed','base_url_invalid');}
 if(u.protocol!=='https:'||u.username||u.password)throw new DeliveryError('failed','base_url_invalid');
 const k=e.event_kind,p=e.payload??{};
 const heading=test?'TEST · Workgrid Control Center':k==='creative.review_requested'?'งานพร้อมตรวจ · Review':k==='creative.assigned'||k==='quick_task.assigned'?'ได้รับงานใหม่ · Assign':k==='activity.output_ready'?'Activity · สร้างงานพร้อมตรวจ':'Activity · ต้องตรวจสอบ';
 const lines=[heading,clean(p.display_id),clean(p.title)];const link=(id:string)=>base.replace(/\/$/,'')+'/#detail/'+encodeURIComponent(id);
 if(!test&&p.display_id&&['creative.assigned','creative.review_requested','quick_task.assigned'].includes(k)){
  const url=link(p.display_id);return {tag:'interactive_message',interactive_message:{elements:[
   {element_type:'title',title:{text:heading}},
   {element_type:'description',description:{format:1,text:'Task: '+clean(p.display_id)+'\nRequester: '+clean(p.requester_email)+'\nDue: '+clean(p.due_date)}},
   {element_type:'button',button:{button_type:'redirect',text:'เปิดใน Workgrid',mobile_link:{type:'web',path:url},desktop_link:{type:'web',path:url}}}]}};
 }
 if(p.display_id)lines.push(link(p.display_id));for(const item of p.outputs??[])if(item.display_id)lines.push(clean(item.display_id)+' '+link(item.display_id));
 if(p.source_payload?.code)lines.push('รหัส: '+clean(p.source_payload.code));return {tag:'text',text:{format:1,content:lines.filter(Boolean).join('\n')}};
}
async function send(d:Dependencies,c:any,tk:string,event:any,test=false){const freelance=c.entity?.data?.employment_type==='Freelance';
 if((freelance||c.entity?.data?.channel==='group')&&!c.destination?.data?.group_id)throw new DeliveryError('failed','group_destination_missing');
 const message=notificationMessage(event,workgridUrl(d),test,freelance);
 const record=async(step:string,r:any)=>{if(c.delivery&&!await d.rpc('wcc_record_step',{p_id:c.delivery.id,p_lease:c.delivery.lease_id,p_step:step,p_provider:r.message_id??null}))throw new DeliveryError('uncertain','step_persistence_unknown');};
 if(c.delivery?.steps?.message?.accepted)return {message_id:c.delivery.steps.message.provider_id};
 if(c.destination?.data?.group_id){
  // Freelance content policy permits only the generic notice, including in TEST.
  if(freelance&&c.entity?.data?.seatalk_id&&message.tag==='text')message.text!.content='<mention-tag target="seatalk://user?id='+c.entity.data.seatalk_id+'"/> '+message.text!.content;
  if(!freelance&&c.entity?.kind==='profile'&&c.entity.data.seatalk_id&&!test&&!c.delivery?.steps?.mention?.accepted){
   const r=await call(d,'/messaging/v2/group_chat',{group_id:c.destination.data.group_id,message:{tag:'text',text:{format:1,content:'<mention-tag target="seatalk://user?id='+c.entity.data.seatalk_id+'"/> '+(event.event_kind==='creative.review_requested'?'มี Task ให้รีวิว':'มี Task เข้ามา')}}},tk,true);
   try{await record('mention',r);}catch{throw new DeliveryError('uncertain','step_persistence_unknown');}
  }
  const r=await call(d,'/messaging/v2/group_chat',{group_id:c.destination.data.group_id,message},tk,true);
  try{await record('message',r);}catch{throw new DeliveryError('uncertain','step_persistence_unknown');}return r;
 }
 const employee=c.profile_check?.employee_code;if(typeof employee!=='string'||!employee)throw new DeliveryError('failed','verified_employee_missing');
 const r=await call(d,'/messaging/v2/single_chat',{employee_code:employee,usable_platform:'all',message},tk,true);
 try{await record('message',r);}catch{throw new DeliveryError('uncertain','step_persistence_unknown');}return r;
}
export async function dispatch(d:Dependencies){const due=await d.rpc('wcc_checks_due');for(const x of due??[]){try{await verify(d,x.kind,x.key);}catch{/*stale evidence cannot authorize a send*/}}
 const results=[];for(let i=0;i<25;i++){const c=await d.rpc('wcc_claim');if(!c)break;let status:Outcome='failed',provider:string|null=null,code:string|null=null;
  try{const tk=await token(d,c.bot);notificationMessage(c.event,workgridUrl(d),false,c.entity?.data?.employment_type==='Freelance');
   if(await d.rpc('wcc_mark_started',{p_id:c.delivery.id,p_lease:c.delivery.lease_id})!==true){results.push({id:c.delivery.id,status:'cancelled'});continue;}
   const r=await send(d,c,tk,c.event);status='provider_accepted';provider=typeof r.message_id==='string'?r.message_id:null;
  }catch(e){status=e instanceof DeliveryError?e.outcome:'failed';code=e instanceof DeliveryError?e.code:'dispatch_failed';}
  const ok=await d.rpc('wcc_finish',{p_id:c.delivery.id,p_lease:c.delivery.lease_id,p_outcome:status,p_provider:provider,p_code:code});
  results.push({id:c.delivery.id,status:ok?status:'persistence_unknown'});
 }return results;
}
export async function handleRequest(r:Request,d:Dependencies){if(r.method==='OPTIONS')return new Response(null,{status:204,headers});if(r.method!=='POST')return reply({code:'METHOD_NOT_ALLOWED'},405);
 let b:any;try{b=await r.json();}catch{return reply({code:'INVALID_JSON'},400);}
 if(!b||typeof b!=='object'||Array.isArray(b))return reply({code:'INVALID_JSON'},400);
 if(b.action==='dispatch'){const secret=d.env('WCC_DISPATCH_SECRET');if(!secret||secret.length<32||r.headers.get('x-wcc-dispatch-secret')!==secret)return reply({code:'UNAUTHORIZED'},401);
  try{return reply({results:await dispatch(d)});}catch{return reply({code:'DISPATCH_UNAVAILABLE'},503);}}
 const jwt=r.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!jwt)return reply({code:'UNAUTHORIZED'},401);
 let actor:{admin:boolean;actor_id:string};try{actor=await d.authorize(jwt);}catch{return reply({code:'UNAUTHORIZED'},401);}if(!actor.admin)return reply({code:'ADMIN_REQUIRED'},403);
 if(!['bot','destination','profile'].includes(b.kind)||typeof b.key!=='string'||!/^[A-Za-z0-9_.:-]{1,160}$/.test(b.key))return reply({code:'INVALID_TARGET'},400);
 try{if(b.action==='verify')return reply(await verify(d,b.kind,b.key));
  if(b.action==='test'){
   if(!['profile','destination'].includes(b.kind)||typeof b.request_id!=='string'||!/^[a-f0-9-]{36}$/i.test(b.request_id))return reply({code:'INVALID_TEST_REQUEST'},400);
   if(!await d.rpc('wcc_test_claim',{p_id:b.request_id,p_kind:b.kind,p_key:b.key,p_actor:actor.actor_id}))return reply({code:'TEST_ALREADY_STARTED_CHECK_HISTORY'},409);
   let result:any;
   try{const c=await d.rpc('wcc_server_context',{p_kind:b.kind,p_key:b.key});const tk=await token(d,c.bot);if(b.kind==='profile'){const v=await verify(d,b.kind,b.key);c.profile_check=v.evidence;if(!v.verified)throw new DeliveryError('failed','profile_not_verified');}
    const sent=await send(d,c,tk,{payload:{title:'ทดสอบช่องทางแจ้งเตือน ไม่มีการสร้างหรือเปลี่ยนงาน'}},true);result={status:'provider_accepted',provider_id:sent.message_id??null};
   }catch(e){result={status:e instanceof DeliveryError?e.outcome:'failed',code:e instanceof DeliveryError?e.code:'test_failed'};}
   await d.rpc('wcc_test_finish',{p_id:b.request_id,p_outcome:result});return reply(result);
  }return reply({code:'INVALID_ACTION'},400);
 }catch{return reply({code:'CONFIGURATION_NOT_READY'},409);}
}
export function defaults():Dependencies{const env=(k:string)=>Deno.env.get(k);const url=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY'),anon=env('SUPABASE_ANON_KEY');
 if(!url||!service||!anon)throw new Error('Server environment missing');
 async function rpcWith(n:string,a:any,jwt:string,key:string){const r=await fetch(url+'/rest/v1/rpc/'+n,{method:'POST',headers:{apikey:key,authorization:'Bearer '+jwt,'content-type':'application/json'},body:JSON.stringify(a??{}),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('RPC unavailable');return r.json();}
 return {env,fetch,rpc:(n,a)=>rpcWith(n,a,service,service),authorize:async(jwt)=>{const r=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,authorization:'Bearer '+jwt},signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error('Invalid session');const user=await r.json();const ws=await rpcWith('wcc_workspace',{},jwt,anon);if(ws.actor_id!==user.id)throw new Error('Actor mismatch');return {admin:ws.admin,actor_id:user.id};}};
}
if((import.meta as ImportMeta&{main?:boolean}).main)Deno.serve(r=>handleRequest(r,defaults()));
