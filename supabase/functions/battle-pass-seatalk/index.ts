// Phase 3: server-triggered, notify-only Battle Pass SeaTalk delivery.
type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>;
type Env = (name: string) => string | undefined;
type Fetcher = typeof fetch;

export interface Dependencies {
  env: Env;
  rpc: Rpc;
  fetch: Fetcher;
  now: () => number;
  tokenCache: AppTokenCache;
}

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

type AppTokenCache = { token: string; expiresAtMs: number; refresh?: Promise<string> };
type Claim = {
  notificationId: string;
  dispatchKey: string;
  eventKind: "brief_ready" | "run_failed" | "run_held";
  recipientKind: "group" | "user";
  recipientKey: string;
  period: string | null;
  payload: Record<string, unknown>;
  attemptCount: number;
};

class ProviderError extends Error {
  constructor(readonly safeCode: string, readonly deliveryUnknown = false) {
    super(safeCode);
    this.name = "ProviderError";
  }
}

const API_BASE = "https://openapi.seatalk.io";
const APPROVED_APP_ID = "NTgyNzAzMjc5MjE4";
const runtimeCache: AppTokenCache = { token: "", expiresAtMs: 0 };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: {
    "cache-control": "no-store", "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  } });
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result ? result : null;
}

function safeText(value: unknown, fallback = "-"): string {
  return (text(value) ?? fallback).replace(/[\r\n]+/g, " ").slice(0, 300);
}

function safeCode(value: unknown, fallback = "unknown_error"): string {
  const valueText = typeof value === "number" && Number.isInteger(value) ? String(value) : text(value);
  return valueText && /^[A-Za-z0-9_.:-]{1,100}$/.test(valueText) ? valueText : fallback;
}

function email(value: unknown): string | null {
  const result = text(value)?.toLowerCase() ?? null;
  return result && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result) ? result : null;
}

function parseUrl(value: unknown, allowedHost: string): string | null {
  try {
    const url = new URL(String(value));
    return url.protocol === "https:" && url.hostname === allowedHost ? url.toString() : null;
  } catch { return null; }
}

function parseClaims(value: unknown, allowedHost: string): Claim[] | null {
  const claims = object(value).claims;
  if (!Array.isArray(claims) || claims.length > 10) return null;
  const parsed: Claim[] = [];
  for (const raw of claims) {
    const row = object(raw); const payload = object(row.payload);
    const notificationId = text(row.notificationId); const dispatchKey = text(row.dispatchKey);
    const eventKind = text(row.eventKind); const recipientKind = text(row.recipientKind);
    const recipientKey = text(row.recipientKey); const period = text(row.period);
    if (!notificationId || !uuidPattern.test(notificationId) || !dispatchKey || !uuidPattern.test(dispatchKey)
      || !["brief_ready","run_failed","run_held"].includes(eventKind ?? "")
      || !["group","user"].includes(recipientKind ?? "") || !recipientKey
      || (period !== null && !/^20\d{2}-(0[1-9]|1[0-2])$/.test(period))
      || !parseUrl(payload.url, allowedHost)) return null;
    if (recipientKind === "user" && !email(recipientKey)) return null;
    parsed.push({ notificationId: notificationId.toLowerCase(), dispatchKey: dispatchKey.toLowerCase(),
      eventKind: eventKind as Claim["eventKind"], recipientKind: recipientKind as Claim["recipientKind"],
      recipientKey, period, payload, attemptCount: Number(row.attemptCount) || 1 });
  }
  return parsed;
}

async function responseJson(response: Response): Promise<Record<string, unknown> | null> {
  try { return object(await response.json()); } catch { return null; }
}

function invalidate(cache: AppTokenCache): void { cache.token = ""; cache.expiresAtMs = 0; }

async function appToken(deps: Dependencies): Promise<string> {
  const now = deps.now();
  if (deps.tokenCache.token && deps.tokenCache.expiresAtMs > now) return deps.tokenCache.token;
  if (deps.tokenCache.refresh) return await deps.tokenCache.refresh;
  const refresh = (async () => {
    const appId = text(deps.env("SEATALK_FlowMate_APP_ID")) ?? text(deps.env("SEATALK_APP_ID"));
    const secret = text(deps.env("SEATALK_FlowMate_APP_Secret")) ?? text(deps.env("SEATALK_APP_SECRET"));
    if (appId !== APPROVED_APP_ID || !secret) throw new ProviderError("provider_configuration_invalid");
    let response: Response;
    try {
      response = await deps.fetch(`${API_BASE}/auth/app_access_token`, { method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: secret }) });
    } catch (error) {
      const name=error instanceof Error?safeCode(error.name.toLowerCase(),"unknown"):"unknown";
      const cause=error instanceof Error?object((error as Error & {cause?:unknown}).cause):null;
      const causeCode=safeCode(cause?.code,null);
      throw new ProviderError(`token_network_${name}${causeCode?`_${causeCode}`:""}`);
    }
    const body = await responseJson(response); const token = text(body?.app_access_token);
    const expires = typeof body?.expire === "number" ? body.expire : 0;
    if (!response.ok || body?.code !== 0 || !token || !Number.isFinite(expires))
      throw new ProviderError(`token_${safeCode(body?.code,"request_failed")}`);
    const nowSeconds = Math.floor(deps.now()/1000);
    const ttlSeconds = expires > nowSeconds ? expires-nowSeconds : expires;
    if (ttlSeconds <= 60) throw new ProviderError("token_expiry_invalid");
    deps.tokenCache.token=token;
    deps.tokenCache.expiresAtMs=deps.now()+(Math.min(ttlSeconds,7200)-60)*1000;
    return token;
  })();
  deps.tokenCache.refresh=refresh;
  try { return await refresh; } finally {
    if (deps.tokenCache.refresh===refresh) deps.tokenCache.refresh=undefined;
  }
}

async function providerCall(deps: Dependencies, path: string, body: Record<string, unknown>,
  safeFailure: string, mayHaveDelivered = false): Promise<Record<string, unknown>> {
  for (let attempt=0; attempt<2; attempt+=1) {
    const token = await appToken(deps); let response: Response;
    try {
      response = await deps.fetch(`${API_BASE}${path}`, { method: "POST",
        headers: { authorization:`Bearer ${token}`, "content-type":"application/json" },
        body:JSON.stringify(body) });
    } catch { throw new ProviderError(`${safeFailure}_network`,mayHaveDelivered); }
    const payload=await responseJson(response);
    if (payload?.code===100 && attempt===0) { invalidate(deps.tokenCache); continue; }
    if (!response.ok || payload?.code!==0)
      throw new ProviderError(`${safeFailure}_${safeCode(payload?.code,`http_${response.status}`)}`);
    return payload;
  }
  throw new ProviderError(`${safeFailure}_token`);
}

async function employeeCode(recipientEmail: string,deps: Dependencies): Promise<string> {
  const result=await providerCall(deps,"/contacts/v2/get_employee_code_with_email",
    { emails:[recipientEmail] },"recipient_lookup");
  const employees=Array.isArray(result.employees)?result.employees:[];
  for (const item of employees) {
    const row=object(item);
    if (row.code===0 && row.employee_status===2 && email(row.email)===recipientEmail) {
      const code=text(row.employee_code); if (code) return code;
    }
  }
  throw new ProviderError("recipient_unavailable");
}

function thaiMonth(period: string | null): string {
  if (!period) return "ไม่ทราบงวด";
  const names=["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
    "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
  const [year,month]=period.split("-").map(Number);
  return month>=1 && month<=12 ? `${names[month-1]} ${year}` : period;
}

function bangkok(value: unknown): string {
  const raw=text(value); if (!raw) return "-"; const date=new Date(raw);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", { timeZone:"Asia/Bangkok", dateStyle:"medium",
    timeStyle:"short", hourCycle:"h23" }).format(date);
}

export function buildCard(claim: Claim, allowedHost: string): Record<string, unknown> {
  const url=parseUrl(claim.payload.url,allowedHost);
  if (!url) throw new ProviderError("invalid_flowmate_url");
  const ready=claim.eventKind==="brief_ready";
  const isTest=claim.payload.isTest===true;
  const titlePrefix=isTest ? "🧪 TEST — " : "";
  const title=titlePrefix+(ready ? "✅ Battle Pass Brief พร้อมตรวจสอบ" : "⚠️ Battle Pass: เกิดข้อผิดพลาด");
  const details=isTest ? [
    "ข้อความทดสอบระบบแจ้งเตือน Battle Pass",
    `ปลายทาง: ${claim.recipientKind==="group" ? "SeaTalk Group" : "Operator DM"}`,
    "ไม่ใช่เหตุการณ์จริง",
  ] : ready ? [
    `งวด: ${thaiMonth(claim.period)}`,
    "สร้างรายการใน Working Sheet และเชื่อม Creative Request เรียบร้อย",
    "สถานะ: Unassigned",
  ] : [
    `งวด: ${thaiMonth(claim.period)}`,
    `ขั้นตอน: ${safeText(claim.payload.stage,"unknown_stage")}`,
    `รหัสปัญหา: ${safeCode(claim.payload.code)}`,
    `เวลา: ${bangkok(claim.payload.occurredAt)}`,
  ];
  return { tag:"interactive_message", interactive_message:{ elements:[
    { element_type:"title",title:{text:title} },
    { element_type:"description",description:{format:2,text:details.join("\n").slice(0,1000)} },
    { element_type:"button",button:{button_type:"redirect",
      text:isTest?"เปิด FlowMate":ready?"ตรวจบรีฟใน FlowMate":"เปิดรายละเอียดใน FlowMate",
      mobile_link:{type:"web",path:url},desktop_link:{type:"web",path:url}}},
  ]}};
}

async function send(claim: Claim, deps: Dependencies, allowedHost: string): Promise<string> {
  const message=buildCard(claim,allowedHost);
  const request=claim.recipientKind==="group"
    ? { path:"/messaging/v2/group_chat", body:{group_id:claim.recipientKey,message} }
    : { path:"/messaging/v2/single_chat", body:{employee_code:await employeeCode(claim.recipientKey,deps),
      message,usable_platform:"all"} };
  const marked=await deps.rpc("battle_pass_seatalk_mark_send_started",{p_dispatch_key:claim.dispatchKey});
  if (marked!==true) throw new ProviderError("stale_dispatch");
  const result=await providerCall(deps,request.path,request.body,"message_send",true);
  const messageId=text(result.message_id);
  if (!messageId) throw new ProviderError("message_response_invalid",true);
  return messageId;
}

export async function handleBattlePassSeatalk(req: Request,deps: Dependencies): Promise<Response> {
  if (req.method!=="POST" || req.headers.has("origin"))
    return json(403,{error:"server_trigger_required"});
  const token=text(req.headers.get("x-battle-pass-token"));
  if (!token || token.length<40 || token.length>256)
    return json(403,{error:"server_trigger_required"});
  try {
    const context=object(await deps.rpc("battle_pass_production_context",{p_token:token}));
    if (!context.ownerId) return json(403,{error:"server_trigger_required"});
  } catch { return json(403,{error:"server_trigger_required"}); }

  let limit=10;
  try { const body=object(await req.json()); if (body.limit!==undefined) limit=Number(body.limit); }
  catch { return json(400,{error:"invalid_request"}); }
  if (!Number.isInteger(limit) || limit<1 || limit>10) return json(400,{error:"invalid_limit"});

  const allowedHost=text(deps.env("FLOWMATE_ALLOWED_HOST")) ?? "panuwee.github.io";
  let claims: Claim[];
  try {
    const parsed=parseClaims(await deps.rpc("battle_pass_seatalk_claim",{p_limit:limit}),allowedHost);
    if (!parsed) throw new Error("invalid"); claims=parsed;
  } catch { return json(502,{error:"claim_failed"}); }

  let sent=0,failed=0,unknown=0;
  for (const claim of claims) {
    try {
      const messageId=await send(claim,deps,allowedHost);
      const result=object(await deps.rpc("battle_pass_seatalk_finish",{
        p_dispatch_key:claim.dispatchKey,p_outcome:"sent",p_seatalk_message_id:messageId,p_error_code:null}));
      if (result.finalized!==true) throw new Error("finish_failed");
      sent+=1;
    } catch (error) {
      const provider=error instanceof ProviderError?error:new ProviderError("delivery_internal");
      const outcome=provider.deliveryUnknown?"delivery_unknown":"failed";
      try { await deps.rpc("battle_pass_seatalk_finish",{p_dispatch_key:claim.dispatchKey,
        p_outcome:outcome,p_seatalk_message_id:null,p_error_code:safeCode(provider.safeCode)}); } catch { /* health audit catches stale dispatch */ }
      if (outcome==="delivery_unknown") unknown+=1; else failed+=1;
    }
  }
  return json(200,{claimed:claims.length,sent,failed,deliveryUnknown:unknown});
}

function serviceRpc(env: Env,fetcher: Fetcher): Rpc {
  const base=text(env("SUPABASE_URL"))?.replace(/\/$/,"") ?? "";
  const key=text(env("SUPABASE_SERVICE_ROLE_KEY")) ?? "";
  return async (name,args) => {
    if (!base || !key) throw new Error("rpc_configuration");
    const response=await fetcher(`${base}/rest/v1/rpc/${name}`,{method:"POST",
      headers:{apikey:key,authorization:`Bearer ${key}`,"content-type":"application/json"},
      body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error("rpc_failed");
    const body=await response.text(); return body.trim()?JSON.parse(body):null;
  };
}

export function runtime(env: Env,fetcher: Fetcher=fetch): Dependencies {
  return {env,fetch:fetcher,now:Date.now,tokenCache:runtimeCache,rpc:serviceRpc(env,fetcher)};
}

if (typeof Deno!=="undefined") Deno.serve(req=>handleBattlePassSeatalk(req,runtime(key=>Deno.env.get(key))));
