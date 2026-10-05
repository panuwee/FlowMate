import {describe,it,expect,vi} from 'vitest';
import {verify,notificationMessage,handleRequest,dispatch,type Dependencies} from '../../../supabase/functions/workgrid-control-center/index';
const bot={kind:'bot',key:'creative',data:{app_id:'test-app',credential_ref:'WCC_BOT_SECRET_TEST'}};
const context={entity:{kind:'profile',key:'test-profile',version:1,data:{channel:'direct'}},bot,member:{active:true,email:'synthetic@example.test'}};
const ok=(data:any)=>Response.json({code:0,...data});
function deps(c:any=context){const rpc=vi.fn(async(name:string)=>name==='wcc_server_context'?structuredClone(c):null);
 const fetcher=vi.fn(async(url:any)=>{if(String(url).endsWith('/auth/app_access_token'))return ok({app_access_token:'synthetic-token',expire:Math.floor(Date.now()/1000)+7200});throw new Error('Unexpected mocked provider call');});
 return {env:(k:string)=>k==='WCC_WORKGRID_BASE_URL'?undefined:k==='WORKGRID_BASE_URL'?'https://workgrid.example.test':k==='WCC_DISPATCH_SECRET'?'test-dispatch-secret-32-characters-minimum':'synthetic-only',fetch:fetcher as typeof fetch,rpc,authorize:vi.fn(async()=>({admin:true,actor_id:'00000000-0000-0000-0000-000000000001'})),cache:new Map()} as Dependencies&{rpc:typeof rpc;fetch:typeof fetcher;authorize:ReturnType<typeof vi.fn>};}
describe('mocked SeaTalk integration — zero real calls',()=>{
 it('resolves employee with emails array and active employee status',async()=>{const d=deps();d.fetch.mockImplementation(async(url,init)=>{if(String(url).includes('/auth/'))return ok({app_access_token:'synthetic'});expect(JSON.parse(String(init?.body))).toEqual({emails:['synthetic@example.test']});return ok({employees:[{code:0,employee_status:2,employee_code:'test-code'}]});});const result=await verify(d,'profile','test-profile');expect(result.verified).toBe(true);expect(result.evidence.employee_code).toBe('test-code');});
 it('inactive or unresolved employee never verifies',async()=>{const d=deps();d.fetch.mockImplementation(async url=>String(url).includes('/auth/')?ok({app_access_token:'synthetic'}):ok({employees:[{code:0,employee_status:1,employee_code:'inactive'}]}));expect((await verify(d,'profile','test-profile')).verified).toBe(false);});
 it('checks all group pages and target SeaTalk ID',async()=>{const c={...context,entity:{...context.entity,data:{channel:'group',seatalk_id:'123'}},destination:{data:{group_id:'real-group-id'}}};const d=deps(c);d.fetch.mockImplementation(async url=>{if(String(url).includes('/auth/'))return ok({app_access_token:'synthetic'});return ok({group:{group_settings:{can_view_member_list:true},group_user_list:String(url).includes('cursor=next')?[{seatalk_id:'123'}]:[]},next_cursor:String(url).includes('cursor=next')?'':'next'});});expect((await verify(d,'profile','test-profile')).verified).toBe(true);expect(d.fetch.mock.calls.some(([url])=>String(url).includes('cursor=next'))).toBe(true);});
 it('hidden membership fails closed instead of claiming verified members',async()=>{const d=deps({...context,entity:{...context.entity,data:{channel:'group',seatalk_id:'123'}},destination:{data:{group_id:'real-group-id'}}});d.fetch.mockImplementation(async url=>String(url).includes('/auth/')?ok({app_access_token:'synthetic'}):ok({group:{group_settings:{can_view_member_list:false}},next_cursor:''}));expect((await verify(d,'profile','test-profile')).evidence.code).toBe('member_list_hidden');});
 it('rejects cyclic pagination',async()=>{const d=deps({...context,entity:{...context.entity,data:{channel:'group',seatalk_id:'123'}},destination:{data:{group_id:'real-group-id'}}});d.fetch.mockImplementation(async url=>String(url).includes('/auth/')?ok({app_access_token:'synthetic'}):ok({group:{group_user_list:[]},next_cursor:'same'}));expect((await verify(d,'profile','test-profile')).verified).toBe(false);});
 it('reuses cached token per app credential',async()=>{const d=deps(bot===null?null:{...context,entity:bot,bot});await verify(d,'bot','creative');await verify(d,'bot','creative');expect(d.fetch).toHaveBeenCalledTimes(1);});
 it('Freelance notice contains no title, identity, attachments or link',()=>{const e={event_kind:'creative.review_requested',payload:{display_id:'CR-sensitive',title:'internal title',requester_email:'private@example.test',outputs:[{display_id:'CR-secret'}]}};expect(notificationMessage(e,'',false,true)).toEqual({tag:'text',text:{format:1,content:'มี Task ให้รีวิว'}});expect(notificationMessage({...e,event_kind:'creative.assigned'},'',false,true).text?.content).toBe('มี Task เข้ามา');});
 it('internal assignment preserves the interactive card and detail redirect',()=>{const m=notificationMessage({event_kind:'creative.assigned',payload:{display_id:'CR-TEST'}},'https://workgrid.example.test');expect(m.tag).toBe('interactive_message');expect(JSON.stringify(m)).toContain('/#detail/CR-TEST');});
 it('stale claim cannot start provider sending',async()=>{const d=deps();d.rpc.mockImplementation(async n=>n==='wcc_checks_due'?[]:n==='wcc_claim'?claim():n==='wcc_mark_started'?false:null);let count=0;d.rpc.mockImplementation(async n=>n==='wcc_checks_due'?[]:n==='wcc_claim'?(count++===0?claim():null):n==='wcc_mark_started'?false:null);expect((await dispatch(d))[0].status).toBe('cancelled');expect(d.fetch.mock.calls.every(([url])=>!String(url).includes('/messaging/'))).toBe(true);});
 it('timeout after sending becomes uncertain',async()=>{const d=deps();let count=0;d.rpc.mockImplementation(async n=>n==='wcc_checks_due'?[]:n==='wcc_claim'?(count++===0?claim():null):n==='wcc_mark_started'||n==='wcc_finish'?true:null);d.fetch.mockImplementation(async url=>{if(String(url).includes('/auth/'))return ok({app_access_token:'synthetic'});throw new Error('timeout');});expect((await dispatch(d))[0].status).toBe('uncertain');});
 it('provider accepted but step write lost becomes uncertain',async()=>{const d=deps();let count=0;d.rpc.mockImplementation(async n=>n==='wcc_checks_due'?[]:n==='wcc_claim'?(count++===0?claim():null):n==='wcc_mark_started'||n==='wcc_finish'?true:false);d.fetch.mockImplementation(async url=>String(url).includes('/auth/')?ok({app_access_token:'synthetic'}):ok({message_id:'synthetic-id'}));expect((await dispatch(d))[0].status).toBe('uncertain');});
 it('already accepted step skips provider message on resumed delivery',async()=>{const d=deps();let count=0;const c=claim();c.delivery.steps={message:{accepted:true,provider_id:'already-sent'}};d.rpc.mockImplementation(async n=>n==='wcc_checks_due'?[]:n==='wcc_claim'?(count++===0?c:null):true);expect((await dispatch(d))[0].status).toBe('provider_accepted');expect(d.fetch.mock.calls.every(([url])=>!String(url).includes('/messaging/'))).toBe(true);});
 it('team lead cannot verify or send TEST',async()=>{const d=deps();d.authorize.mockResolvedValue({admin:false,actor_id:'lead'});const r=await handleRequest(request({action:'test',kind:'profile',key:'test'}),d);expect(r.status).toBe(403);expect(d.fetch).not.toHaveBeenCalled();});
 it('duplicate explicit test request never sends twice',async()=>{const d=deps();d.rpc.mockResolvedValue(false);const r=await handleRequest(request({action:'test',kind:'profile',key:'test',request_id:'00000000-0000-0000-0000-000000000001'}),d);expect(r.status).toBe(409);expect(d.fetch).not.toHaveBeenCalled();});
 it('dispatch requires separate secret and malformed input is rejected',async()=>{const d=deps();expect((await handleRequest(request({action:'dispatch'}),d)).status).toBe(401);expect((await handleRequest(request(null),d)).status).toBe(400);expect(d.rpc).not.toHaveBeenCalled();});
 it('Freelance sends one genuine mention with generic notice and no sensitive card',async()=>{const d=deps();let count=0;const c=claim();c.entity.data={channel:'group',employment_type:'Freelance',seatalk_id:'123'};c.destination={data:{group_id:'test-group'}};c.event={event_kind:'creative.review_requested',payload:{display_id:'SECRET-CR',title:'SECRET-TITLE'}};d.rpc.mockImplementation(async n=>n==='wcc_checks_due'?[]:n==='wcc_claim'?(count++===0?c:null):true);d.fetch.mockImplementation(async(url,init)=>{if(String(url).includes('/auth/'))return ok({app_access_token:'synthetic'});const body=String(init?.body);expect(body).toContain('mention-tag');expect(body).toContain('มี Task ให้รีวิว');expect(body).not.toContain('SECRET');return ok({message_id:'synthetic-id'});});expect((await dispatch(d))[0].status).toBe('provider_accepted');expect(d.fetch.mock.calls.filter(([url])=>String(url).includes('/messaging/'))).toHaveLength(1);});
 it('already accepted internal group mention is not resent when card retries',async()=>{const d=deps();let count=0;const c=claim();c.entity.data={channel:'group',employment_type:'Fulltime',seatalk_id:'123'};c.destination={data:{group_id:'test-group'}};c.delivery.steps={mention:{accepted:true,provider_id:'already-mentioned'}};d.rpc.mockImplementation(async n=>n==='wcc_checks_due'?[]:n==='wcc_claim'?(count++===0?c:null):true);d.fetch.mockImplementation(async(url,init)=>{if(String(url).includes('/auth/'))return ok({app_access_token:'synthetic'});expect(JSON.parse(String(init?.body)).message.tag).toBe('interactive_message');return ok({message_id:'synthetic-id'});});await dispatch(d);expect(d.fetch.mock.calls.filter(([url])=>String(url).includes('/messaging/'))).toHaveLength(1);});
});
function request(body:any){return new Request('https://functions.example.test',{method:'POST',headers:{authorization:'Bearer synthetic-jwt','content-type':'application/json'},body:JSON.stringify(body)});}
it('uses the dedicated Control Center URL for task buttons',async()=>{
 const d=deps();let count=0;const c=claim();
 const originalEnv=d.env;d.env=k=>k==='WCC_WORKGRID_BASE_URL'?'https://panuwee.github.io/FlowMate/home/':originalEnv(k);
 d.rpc.mockImplementation(async n=>n==='wcc_checks_due'?[]:n==='wcc_claim'?(count++===0?c:null):true);
 d.fetch.mockImplementation(async(url,init)=>{if(String(url).includes('/auth/'))return ok({app_access_token:'synthetic'});
  expect(String(init?.body)).toContain('https://panuwee.github.io/FlowMate/home/#detail/CR-TEST');
  expect(String(init?.body)).not.toContain('workgrid.example.test');return ok({message_id:'synthetic-id'});});
 expect((await dispatch(d))[0].status).toBe('provider_accepted');
});
it.each([
 ['WCC_BOT_SECRET_CREATIVE','OTg1MjIwNzY0OTY3','SEATALK_CREATIVE_APP_ID','SEATALK_CREATIVE_APP_SECRET'],
 ['WCC_BOT_SECRET_FLOWMATE','NTgyNzAzMjc5MjE4','SEATALK_FlowMate_APP_ID','SEATALK_FlowMate_APP_Secret']
])('reuses the matching existing server credential for %s without exposing its value',async(ref,app,idName,secretName)=>{
 const c={...context,entity:bot,bot:{...bot,data:{app_id:app,credential_ref:ref}}};const d=deps(c);
 const values:Record<string,string>={[idName]:app,[secretName]:'synthetic-existing-secret'};d.env=k=>values[k];
 d.fetch.mockImplementation(async(_url,init)=>{expect(JSON.parse(String(init?.body))).toEqual({app_id:app,app_secret:'synthetic-existing-secret'});return ok({app_access_token:'synthetic-token'});});
 const result=await verify(d,'bot','test');expect(result.verified).toBe(true);expect(JSON.stringify(result)).not.toContain('synthetic-existing-secret');
});
it('rejects an existing credential alias whose server App ID does not match',async()=>{
 const d=deps({...context,entity:bot,bot:{...bot,data:{app_id:'OTg1MjIwNzY0OTY3',credential_ref:'WCC_BOT_SECRET_CREATIVE'}}});
 d.env=k=>k==='SEATALK_CREATIVE_APP_ID'?'different-app':k==='SEATALK_CREATIVE_APP_SECRET'?'synthetic-existing-secret':undefined;
 expect((await verify(d,'bot','test')).verified).toBe(false);expect(d.fetch).not.toHaveBeenCalled();
});
it('explicit WCC credential takes precedence over an existing alias',async()=>{
 const d=deps({...context,entity:bot,bot:{...bot,data:{app_id:'OTg1MjIwNzY0OTY3',credential_ref:'WCC_BOT_SECRET_CREATIVE'}}});
 d.env=k=>k==='WCC_BOT_SECRET_CREATIVE'?'synthetic-dedicated-secret':undefined;
 d.fetch.mockImplementation(async(_url,init)=>{expect(JSON.parse(String(init?.body)).app_secret).toBe('synthetic-dedicated-secret');return ok({app_access_token:'synthetic-token'});});
 expect((await verify(d,'bot','test')).verified).toBe(true);
});
it('custom Bot references cannot borrow either built-in credential',async()=>{
 const d=deps({...context,entity:bot,bot:{...bot,data:{app_id:'OTg1MjIwNzY0OTY3',credential_ref:'WCC_BOT_SECRET_CUSTOM'}}});
 d.env=k=>k==='SEATALK_CREATIVE_APP_SECRET'?'synthetic-existing-secret':undefined;
 expect((await verify(d,'bot','test')).verified).toBe(false);expect(d.fetch).not.toHaveBeenCalled();
});
it('deployment entrypoint registers one handler and rejects unauthenticated calls without IO',async()=>{
 const serve=vi.fn();const network=vi.fn(()=>{throw new Error('Unexpected network call');});
 const env:Record<string,string>={SUPABASE_URL:'https://tenant.example.test',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'};
 vi.stubGlobal('Deno',{serve,env:{get:(k:string)=>env[k]}});vi.stubGlobal('fetch',network);
 try{
  await import('../../../supabase/functions/workgrid-control-center/deploy');expect(serve).toHaveBeenCalledTimes(1);
  const handler=serve.mock.calls[0][0];
  expect((await handler(new Request('https://functions.example.test',{method:'OPTIONS'}))).status).toBe(204);
  const r=await handler(new Request('https://functions.example.test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'verify',kind:'bot',key:'creative'})}));
  expect(r.status).toBe(401);expect(network).not.toHaveBeenCalled();
 }finally{vi.unstubAllGlobals();}
});
it('Freelance group route never falls back to direct chat when destination is missing',async()=>{
 const d=deps();let count=0;const c=claim();c.entity.data={channel:'group',employment_type:'Freelance',seatalk_id:'123'};
 d.rpc.mockImplementation(async n=>n==='wcc_checks_due'?[]:n==='wcc_claim'?(count++===0?c:null):true);
 d.fetch.mockImplementation(async url=>String(url).includes('/auth/')?ok({app_access_token:'synthetic'}):ok({message_id:'should-not-send'}));
 expect((await dispatch(d))[0].status).toBe('failed');
 expect(d.fetch.mock.calls.every(([url])=>!String(url).includes('/messaging/'))).toBe(true);
 expect(d.rpc.mock.calls.find(([name])=>name==='wcc_finish')?.[1].p_code).toBe('group_destination_missing');
});
function claim():any{return {...structuredClone(context),delivery:{id:'test-delivery',lease_id:'test-lease',steps:{}},event:{event_kind:'creative.assigned',payload:{display_id:'CR-TEST'}},profile_check:{employee_code:'synthetic-employee'}};}
