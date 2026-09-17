import { describe,expect,it } from "vitest";
import { buildCard,handleBattlePassSeatalk,type Dependencies } from "./index";

const TOKEN="x".repeat(64), ID="11111111-1111-4111-8111-111111111111";
const KEY="22222222-2222-4222-8222-222222222222", NOW=Date.parse("2026-09-17T07:30:00Z");
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});

function claim(overrides:Record<string,unknown>={}) { return {
  notificationId:ID,dispatchKey:KEY,eventKind:"brief_ready",recipientKind:"group",
  recipientKey:"ODg5NDI1MDQwODI3",period:"2026-10",attemptCount:1,
  payload:{url:"https://panuwee.github.io/FlowMate/home/#detail/CR-1200",
    occurredAt:"2026-09-17T07:00:00Z",status:"unassigned",displayId:"CR-1200"},...overrides}; }

function harness(rows:Record<string,unknown>[],provider?:Dependencies["fetch"]) {
  const rpcCalls:{name:string,args:Record<string,unknown>}[]=[],fetchCalls:{url:string,body:any}[]=[];
  const envValues:Record<string,string>={SEATALK_FlowMate_APP_ID:"NTgyNzAzMjc5MjE4",SEATALK_FlowMate_APP_Secret:"secret",
    FLOWMATE_ALLOWED_HOST:"panuwee.github.io"};
  const fetcher:Dependencies["fetch"]=(async(input,init)=>{
    fetchCalls.push({url:String(input),body:init?.body?JSON.parse(String(init.body)):null});
    if(provider)return provider(input,init);
    if(String(input).endsWith("/auth/app_access_token"))return response({code:0,app_access_token:"app-token",expire:Math.floor(NOW/1000)+7200});
    if(String(input).endsWith("/contacts/v2/get_employee_code_with_email"))return response({code:0,
      employees:[{code:0,employee_status:2,email:"panuwee.w@garena.com",employee_code:"e_operator"}]});
    return response({code:0,message_id:"message-1"});
  }) as Dependencies["fetch"];
  const deps:Dependencies={env:key=>envValues[key],fetch:fetcher,now:()=>NOW,tokenCache:{token:"",expiresAtMs:0},
    rpc:async(name,args)=>{rpcCalls.push({name,args});
      if(name==="battle_pass_production_context")return {ownerId:"owner"};
      if(name==="battle_pass_seatalk_claim")return {claims:rows};
      if(name==="battle_pass_seatalk_mark_send_started")return true;
      if(name==="battle_pass_seatalk_finish")return {finalized:true,status:args.p_outcome};
      throw new Error(`unexpected:${name}`);}};
  return {deps,rpcCalls,fetchCalls};
}
function request(body:unknown={limit:10},token=TOKEN,origin?:string){const headers:Record<string,string>={
  "content-type":"application/json","x-battle-pass-token":token};if(origin)headers.origin=origin;
  return new Request("https://edge/functions/v1/battle-pass-seatalk",{method:"POST",headers,body:JSON.stringify(body)});}

describe("authentication",()=>{
  it("rejects browser, missing-token and bad-limit calls before claiming",async()=>{
    for(const req of [request({},TOKEN,"https://example.com"),request({},"short"),request({limit:11})]){
      const h=harness([]),result=await handleBattlePassSeatalk(req,h.deps);
      expect(result.status).toBeGreaterThanOrEqual(400);expect(h.rpcCalls.map(x=>x.name)).not.toContain("battle_pass_seatalk_claim");}
  });
  it("validates the scheduler token through production context",async()=>{const h=harness([]);
    await handleBattlePassSeatalk(request(),h.deps);expect(h.rpcCalls[0]).toEqual({name:"battle_pass_production_context",args:{p_token:TOKEN}});});
});

describe("routing and cards",()=>{
  it("sends ready briefs to the exact group with one redirect",async()=>{const h=harness([claim()]);
    expect(await (await handleBattlePassSeatalk(request(),h.deps)).json()).toEqual({claimed:1,sent:1,failed:0,deliveryUnknown:0});
    const sent=h.fetchCalls.find(x=>x.url.endsWith("/messaging/v2/group_chat"))!;
    expect(sent.body.group_id).toBe("ODg5NDI1MDQwODI3");
    expect(sent.body.message.interactive_message.elements.filter((x:any)=>x.element_type==="button")).toHaveLength(1);
    expect(JSON.stringify(sent.body)).toContain("#detail/CR-1200");expect(JSON.stringify(sent.body)).toContain("Unassigned");
    expect(JSON.stringify(sent.body)).not.toContain("panuwee.w@garena.com");});
  it("resolves error DM by email and never sends it to the group",async()=>{const row=claim({eventKind:"run_failed",
    recipientKind:"user",recipientKey:"panuwee.w@garena.com",payload:{url:"https://panuwee.github.io/FlowMate/home/battle-pass-status.html",
      stage:"finalize",code:"database_write_failed",occurredAt:"2026-09-17T07:00:00Z"}}),h=harness([row]);
    await handleBattlePassSeatalk(request(),h.deps);
    expect(h.fetchCalls.some(x=>x.url.endsWith("/contacts/v2/get_employee_code_with_email"))).toBe(true);
    expect(h.fetchCalls.find(x=>x.url.endsWith("/messaging/v2/single_chat"))!.body.employee_code).toBe("e_operator");
    expect(h.fetchCalls.some(x=>x.url.endsWith("/messaging/v2/group_chat"))).toBe(false);});
  it("rejects links outside the allowed host before provider calls",async()=>{const h=harness([claim({payload:{url:"https://evil.example/#detail/CR-1"}})]);
    expect((await handleBattlePassSeatalk(request(),h.deps)).status).toBe(502);expect(h.fetchCalls).toHaveLength(0);});
  it("sanitizes unsafe error codes",()=>{const card=buildCard(claim({eventKind:"run_held",recipientKind:"user",
    recipientKey:"panuwee.w@garena.com",payload:{url:"https://panuwee.github.io/FlowMate/home/battle-pass-status.html",
      stage:"bad\nline",code:"unsafe code with spaces",occurredAt:"2026-09-17T07:00:00Z"}}) as any,"panuwee.github.io");
    expect(JSON.stringify(card)).toContain("unknown_error");});
  it("labels controlled delivery checks as test messages",()=>{const card=buildCard(claim({
    payload:{url:"https://panuwee.github.io/FlowMate/home/battle-pass-status.html",isTest:true}}) as any,"panuwee.github.io");
    expect(JSON.stringify(card)).toContain("TEST");expect(JSON.stringify(card)).toContain("ไม่ใช่เหตุการณ์จริง");});
});

describe("delivery state",()=>{
  it("marks send-start before provider delivery and finishes sent",async()=>{const h=harness([claim()]);await handleBattlePassSeatalk(request(),h.deps);
    expect(h.rpcCalls.map(x=>x.name)).toEqual(["battle_pass_production_context","battle_pass_seatalk_claim",
      "battle_pass_seatalk_mark_send_started","battle_pass_seatalk_finish"]);
    expect(h.rpcCalls.at(-1)?.args).toMatchObject({p_outcome:"sent",p_seatalk_message_id:"message-1"});});
  it("records a provider rejection as failed",async()=>{const h=harness([claim()],(async(input)=>String(input).endsWith("/auth/app_access_token")
    ?response({code:0,app_access_token:"app-token",expire:Math.floor(NOW/1000)+7200}):response({code:101},429)) as Dependencies["fetch"]);
    expect(await (await handleBattlePassSeatalk(request(),h.deps)).json()).toMatchObject({failed:1});
    expect(h.rpcCalls.at(-1)?.args).toMatchObject({p_outcome:"failed",p_error_code:"message_send_101"});});
  it("records a network failure after send-start as delivery_unknown",async()=>{const h=harness([claim()],(async(input)=>{
    if(String(input).endsWith("/auth/app_access_token"))return response({code:0,app_access_token:"app-token",expire:Math.floor(NOW/1000)+7200});
    throw new Error("network secret detail");}) as Dependencies["fetch"]);
    const body=await (await handleBattlePassSeatalk(request(),h.deps)).json();expect(body).toMatchObject({deliveryUnknown:1});
    expect(h.rpcCalls.at(-1)?.args).toMatchObject({p_outcome:"delivery_unknown",p_error_code:"message_send_network"});
    expect(JSON.stringify(body)).not.toContain("secret detail");});
  it("caches one app token for a multi-message drain",async()=>{const h=harness([claim(),claim({
    notificationId:"33333333-3333-4333-8333-333333333333",dispatchKey:"44444444-4444-4444-8444-444444444444"})]);
    await handleBattlePassSeatalk(request(),h.deps);
    expect(h.fetchCalls.filter(x=>x.url.endsWith("/auth/app_access_token"))).toHaveLength(1);
    expect(h.fetchCalls.filter(x=>x.url.endsWith("/messaging/v2/group_chat"))).toHaveLength(2);});
});
