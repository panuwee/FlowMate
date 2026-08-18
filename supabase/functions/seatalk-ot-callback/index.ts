type RpcResult = { data: unknown; error: { message?: string } | null };
type Rpc = (name: string, args: Record<string, unknown>) => Promise<RpcResult>;
type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type EnvGetter = (name: string) => string | undefined;
type UserValidator = (accessToken: string) => Promise<{ id: string } | null>;

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

type AppTokenCache = {
  token: string;
  expiresAtMs: number;
  refresh?: Promise<string>;
};

type Dependencies = {
  env?: EnvGetter;
  fetch?: Fetcher;
  now?: () => number;
  tokenCache?: AppTokenCache;
  validateUser?: UserValidator;
  rpc?: Rpc;
};

type Runtime = {
  env: EnvGetter;
  fetch: Fetcher;
  now: () => number;
  tokenCache: AppTokenCache;
  validateUser: UserValidator;
  rpc: Rpc;
};

type DispatchClaim = {
  claimed: true;
  notificationId: string;
  dispatchKey: string;
  recipientEmail: string;
  recipientDisplayName: string;
  requestId: string;
  employeeDisplayName: string;
  functionCode: string;
  title: string;
  dayType: string;
  workLocationType: string;
  venue: string;
  reasonCode: string;
  reasonDetail: string;
  plannedStartAt: string;
  plannedEndAt: string;
  plannedBreakMinutes: number | null;
  plannedMinutes: number | null;
};

type NoDispatchClaim = {
  claimed: false;
  status: string | null;
  leaseExpiresAt: string | null;
};

class ProviderError extends Error {
  constructor(readonly safeDetail: string) {
    super(safeDetail);
    this.name = "ProviderError";
  }
}

class AuthServiceError extends Error {
  constructor() {
    super("Supabase authentication is unavailable");
    this.name = "AuthServiceError";
  }
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const seaTalkApiBase = "https://openapi.seatalk.io";
const flowMateOtApprovalUrl = "https://workgrid.uat.seathailand.com/home#ot-request/manager";
const maxTokenTtlSeconds = 7200;
const tokenRefreshSafetySeconds = 60;
const runtimeTokenCache: AppTokenCache = { token: "", expiresAtMs: 0 };
const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 ? text : null;
}

function normalizedEmail(value: unknown): string | null {
  const email = asTrimmedString(value)?.toLowerCase() ?? null;
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function envValue(env: EnvGetter, name: string): string | null {
  const value = env(name);
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return asRecord(await response.json());
  } catch {
    return null;
  }
}

function parseBearer(request: Request): string | null {
  const value = request.headers.get("authorization");
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match ? asTrimmedString(match[1]) : null;
}

function senderIdentity(payload: Record<string, unknown>): { email: string | null; employeeCode: string | null } {
  const event = asRecord(payload.event);
  const sender = asRecord(payload.sender);
  const eventSender = asRecord(event.sender);
  const senderUser = asRecord(sender.user);
  const eventSenderUser = asRecord(eventSender.user);
  const eventUser = asRecord(event.user);
  const eventEmployee = asRecord(event.employee);
  const actor = asRecord(event.actor);
  const emailCandidates = [
    sender.email,
    eventSender.email,
    senderUser.email,
    eventSenderUser.email,
    eventUser.email,
    eventEmployee.email,
    actor.email,
  ];
  for (const candidate of emailCandidates) {
    const email = normalizedEmail(candidate);
    if (email) return { email, employeeCode: null };
  }

  const employeeCodeCandidates = [
    event.employee_code,
    event.employeeCode,
    payload.employee_code,
    payload.employeeCode,
    sender.employee_code,
    sender.employeeCode,
    eventSender.employee_code,
    eventSender.employeeCode,
    eventSenderUser.employee_code,
    eventUser.employee_code,
    eventEmployee.employee_code,
    actor.employee_code,
  ];
  for (const candidate of employeeCodeCandidates) {
    const code = asTrimmedString(candidate);
    if (!code) continue;
    const email = normalizedEmail(code);
    return { email, employeeCode: email ? null : code };
  }
  return { email: null, employeeCode: null };
}

function actionValue(payload: Record<string, unknown>): string | null {
  const action = asRecord(payload.action);
  const event = asRecord(payload.event);
  const eventAction = asRecord(event.action);
  const eventButton = asRecord(event.button);
  return asTrimmedString(action.value ?? eventAction.value ?? eventButton.value ?? event.value);
}

function parseAction(value: string | null): { notificationId: string; decision: "approved" | "rejected" } | null {
  if (!value) return null;
  const match = /^(approve|reject):([0-9a-f-]+)$/i.exec(value);
  if (!match || !uuidPattern.test(match[2])) return null;
  return {
    notificationId: match[2].toLowerCase(),
    decision: match[1].toLowerCase() === "approve" ? "approved" : "rejected",
  };
}

function eventId(payload: Record<string, unknown>): string | null {
  return asTrimmedString(payload.event_id);
}

function rejectionReason(payload: Record<string, unknown>): string | null {
  const event = asRecord(payload.event);
  const message = asRecord(event.message ?? payload.message);
  const tag = asTrimmedString(message.tag);
  if (tag && tag !== "text") return null;
  const text = asRecord(message.text ?? event.text ?? payload.text);
  return asTrimmedString(text.content);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeHexEqual(expected: string, actual: string): boolean {
  const expectedBytes = encoder.encode(expected);
  const actualBytes = encoder.encode(actual.trim().toLowerCase());
  let difference = expectedBytes.length ^ actualBytes.length;
  for (let index = 0; index < expectedBytes.length; index += 1) {
    difference |= expectedBytes[index] ^ (actualBytes[index] ?? 0);
  }
  return difference === 0;
}

async function signatureIsValid(rawBody: Uint8Array, suppliedSignature: string | null, secret: string): Promise<boolean> {
  if (!suppliedSignature || !secret) return false;
  const secretBytes = encoder.encode(secret);
  const signedBytes = new Uint8Array(rawBody.length + secretBytes.length);
  signedBytes.set(rawBody);
  signedBytes.set(secretBytes, rawBody.length);
  return constantTimeHexEqual(await sha256Hex(signedBytes), suppliedSignature);
}

async function idempotencyKey(id: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`seatalk-ot:${id}`)));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes.slice(0, 16), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function validateSupabaseUser(accessToken: string, env: EnvGetter, fetcher: Fetcher): Promise<{ id: string } | null> {
  const url = envValue(env, "SUPABASE_URL");
  const apiKey = envValue(env, "SUPABASE_PUBLISHABLE_KEY") ?? envValue(env, "SUPABASE_ANON_KEY");
  if (!url || !apiKey) throw new AuthServiceError();
  let response: Response;
  try {
    response = await fetcher(`${url.replace(/\/$/, "")}/auth/v1/user`, {
      method: "GET",
      headers: {
        "apikey": apiKey,
        "authorization": `Bearer ${accessToken}`,
      },
    });
  } catch {
    throw new AuthServiceError();
  }
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) throw new AuthServiceError();
  const body = await readJson(response);
  const id = asTrimmedString(body?.id);
  return id && uuidPattern.test(id) ? { id: id.toLowerCase() } : null;
}

async function serviceRoleRpc(name: string, args: Record<string, unknown>, env: EnvGetter, fetcher: Fetcher): Promise<RpcResult> {
  const url = envValue(env, "SUPABASE_URL");
  const serviceRoleKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) return { data: null, error: { message: "Server configuration is incomplete" } };
  try {
    const response = await fetcher(`${url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        "apikey": serviceRoleKey,
        "authorization": `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      const errorBody = await readJson(response);
      return {
        data: null,
        error: { message: `${name}:${asTrimmedString(errorBody?.message) ?? `HTTP_${response.status}`}` },
      };
    }
    return { data: await response.json(), error: null };
  } catch {
    return { data: null, error: { message: "RPC unavailable" } };
  }
}

function createRuntime(dependencies: Dependencies): Runtime {
  const env = dependencies.env ?? ((name: string) => Deno.env.get(name));
  const fetcher = dependencies.fetch ?? fetch;
  const now = dependencies.now ?? Date.now;
  const tokenCache = dependencies.tokenCache ?? runtimeTokenCache;
  return {
    env,
    fetch: fetcher,
    now,
    tokenCache,
    validateUser: dependencies.validateUser ?? ((token) => validateSupabaseUser(token, env, fetcher)),
    rpc: dependencies.rpc ?? ((name, args) => serviceRoleRpc(name, args, env, fetcher)),
  };
}

function invalidateAppToken(cache: AppTokenCache): void {
  cache.token = "";
  cache.expiresAtMs = 0;
}

async function appAccessToken(runtime: Runtime): Promise<string> {
  const now = runtime.now();
  if (runtime.tokenCache.token && runtime.tokenCache.expiresAtMs > now) return runtime.tokenCache.token;
  if (runtime.tokenCache.refresh) return await runtime.tokenCache.refresh;

  const refresh = (async () => {
    const appId = envValue(runtime.env, "SEATALK_APP_ID");
    const appSecret = envValue(runtime.env, "SEATALK_APP_SECRET");
    if (!appId || !appSecret) throw new ProviderError("SeaTalk provider configuration is incomplete");
    let response: Response;
    try {
      response = await runtime.fetch(`${seaTalkApiBase}/auth/app_access_token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      });
    } catch {
      throw new ProviderError("SeaTalk app access token request failed");
    }
    const body = await readJson(response);
    const token = asTrimmedString(body?.app_access_token);
    const expiresIn = typeof body?.expire === "number" && Number.isFinite(body.expire) ? Math.floor(body.expire) : 0;
    if (!response.ok || body?.code !== 0 || !token || expiresIn <= tokenRefreshSafetySeconds) {
      throw new ProviderError("SeaTalk app access token request failed");
    }
    const boundedTtl = Math.min(expiresIn, maxTokenTtlSeconds);
    runtime.tokenCache.token = token;
    runtime.tokenCache.expiresAtMs = runtime.now() + (boundedTtl - tokenRefreshSafetySeconds) * 1000;
    return token;
  })();

  runtime.tokenCache.refresh = refresh;
  try {
    return await refresh;
  } finally {
    if (runtime.tokenCache.refresh === refresh) runtime.tokenCache.refresh = undefined;
  }
}

async function providerResponse(
  runtime: Runtime,
  url: string,
  init: RequestInit,
  safeFailure: string,
): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await runtime.fetch(url, init);
  } catch {
    throw new ProviderError(safeFailure);
  }
  const body = await readJson(response);
  if (body?.code === 100) invalidateAppToken(runtime.tokenCache);
  if (!response.ok || body?.code !== 0) throw new ProviderError(safeFailure);
  return body;
}

async function employeeCodeForEmail(email: string, runtime: Runtime): Promise<string> {
  const token = await appAccessToken(runtime);
  const body = await providerResponse(runtime, `${seaTalkApiBase}/contacts/v2/get_employee_code_with_email`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ emails: [email] }),
  }, "SeaTalk recipient lookup failed");
  const employees = Array.isArray(body.employees) ? body.employees : [];
  for (const employeeValue of employees) {
    const employee = asRecord(employeeValue);
    if (employee.code !== 0 || employee.employee_status !== 2) continue;
    if (normalizedEmail(employee.email) !== email) continue;
    const employeeCode = asTrimmedString(employee.employee_code);
    if (employeeCode) return employeeCode;
  }
  throw new ProviderError("SeaTalk recipient is unavailable");
}

async function emailForEmployeeCode(employeeCode: string, runtime: Runtime): Promise<string | null> {
  const token = await appAccessToken(runtime);
  const query = new URLSearchParams({ employee_code: employeeCode });
  const body = await providerResponse(runtime, `${seaTalkApiBase}/contacts/v2/profile?${query}`, {
    method: "GET",
    headers: { "authorization": `Bearer ${token}` },
  }, "SeaTalk sender lookup failed");
  const employees = Array.isArray(body.employees) ? body.employees : [];
  for (const employeeValue of employees) {
    const employee = asRecord(employeeValue);
    if (asTrimmedString(employee.employee_code) !== employeeCode) continue;
    const email = normalizedEmail(employee.email);
    if (email) return email;
  }
  return null;
}

async function callbackSenderEmail(payload: Record<string, unknown>, runtime: Runtime): Promise<string | null> {
  const identity = senderIdentity(payload);
  if (identity.email) return identity.email;
  return identity.employeeCode ? await emailForEmployeeCode(identity.employeeCode, runtime) : null;
}

function displayText(value: unknown, fallback = "-"): string {
  const text = asTrimmedString(value);
  return text ? text.replace(/[\r\n]+/g, " ") : fallback;
}

function bangkokDateTime(value: unknown): { date: string; time: string } | null {
  const raw = asTrimmedString(value);
  if (!raw) return null;
  const instant = new Date(raw);
  if (Number.isNaN(instant.getTime())) return null;
  const fields = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant).reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  if (!fields.year || !fields.month || !fields.day || !fields.hour || !fields.minute) return null;
  return { date: `${fields.year}-${fields.month}-${fields.day}`, time: `${fields.hour}:${fields.minute}` };
}

function bangkokSchedule(start: unknown, end: unknown): string {
  const startTime = bangkokDateTime(start);
  const endTime = bangkokDateTime(end);
  if (!startTime || !endTime) return `${displayText(start)} - ${displayText(end)}`;
  if (startTime.date === endTime.date) return `${startTime.date} ${startTime.time} - ${endTime.time} (GMT+7)`;
  return `${startTime.date} ${startTime.time} - ${endTime.date} ${endTime.time} (GMT+7)`;
}

function buildCard(claim: DispatchClaim): Record<string, unknown> {
  const details = [
    `Employee: ${displayText(claim.employeeDisplayName)} · ${displayText(claim.functionCode).toUpperCase()}`,
    `Assignment / event: ${displayText(claim.title)}`,
    `Schedule: ${bangkokSchedule(claim.plannedStartAt, claim.plannedEndAt)}`,
    `Reason: ${displayText(claim.reasonCode)}`,
  ].join("\n").slice(0, 1000);
  return {
    tag: "interactive_message",
    interactive_message: {
      elements: [
        { element_type: "title", title: { text: "OT approval request" } },
        { element_type: "description", description: { text: details, format: 2 } },
        {
          element_type: "button",
          button: {
            button_type: "redirect",
            text: "Open in FlowMate",
            mobile_link: { type: "web", path: flowMateOtApprovalUrl },
            desktop_link: { type: "web", path: flowMateOtApprovalUrl },
          },
        },
      ],
    },
  };
}

async function sendInteractiveCard(employeeCode: string, claim: DispatchClaim, runtime: Runtime): Promise<string> {
  const token = await appAccessToken(runtime);
  const body = await providerResponse(runtime, `${seaTalkApiBase}/messaging/v2/single_chat`, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      employee_code: employeeCode,
      message: buildCard(claim),
      usable_platform: "all",
    }),
  }, "SeaTalk interactive message request failed");
  const messageId = asTrimmedString(body.message_id);
  if (!messageId) throw new ProviderError("SeaTalk message response was invalid");
  return messageId;
}

function parseDispatchClaim(value: unknown): DispatchClaim | NoDispatchClaim | null {
  const data = asRecord(value);
  if (data.claimed === false) {
    return {
      claimed: false,
      status: asTrimmedString(data.status),
      leaseExpiresAt: asTrimmedString(data.leaseExpiresAt),
    };
  }
  const notificationId = asTrimmedString(data.notificationId);
  const dispatchKey = asTrimmedString(data.dispatchKey);
  const recipientEmail = normalizedEmail(data.recipientEmail);
  const claimedRequestId = asTrimmedString(data.requestId);
  if (
    data.claimed !== true || !notificationId || !uuidPattern.test(notificationId) ||
    !dispatchKey || !uuidPattern.test(dispatchKey) || !recipientEmail ||
    !claimedRequestId || !uuidPattern.test(claimedRequestId)
  ) return null;
  return {
    claimed: true,
    notificationId: notificationId.toLowerCase(),
    dispatchKey: dispatchKey.toLowerCase(),
    recipientEmail,
    recipientDisplayName: displayText(data.recipientDisplayName),
    requestId: claimedRequestId.toLowerCase(),
    employeeDisplayName: displayText(data.employeeDisplayName),
    functionCode: displayText(data.functionCode),
    title: displayText(data.title),
    dayType: displayText(data.dayType),
    workLocationType: displayText(data.workLocationType),
    venue: displayText(data.venue),
    reasonCode: displayText(data.reasonCode),
    reasonDetail: displayText(data.reasonDetail),
    plannedStartAt: displayText(data.plannedStartAt),
    plannedEndAt: displayText(data.plannedEndAt),
    plannedBreakMinutes: typeof data.plannedBreakMinutes === "number" ? data.plannedBreakMinutes : null,
    plannedMinutes: typeof data.plannedMinutes === "number" ? data.plannedMinutes : null,
  };
}

async function finishDispatch(
  runtime: Runtime,
  dispatchKey: string,
  succeeded: boolean,
  messageId: string | null,
  error: string | null,
): Promise<RpcResult> {
  return await runtime.rpc("ot_seatalk_finish_dispatch", {
    p_dispatch_key: dispatchKey,
    p_succeeded: succeeded,
    p_seatalk_message_id: messageId,
    p_error: error,
  });
}

async function handleDispatch(request: Request, payload: Record<string, unknown>, runtime: Runtime): Promise<Response> {
  const requestedId = asTrimmedString(payload.requestId);
  if (!requestedId || !uuidPattern.test(requestedId)) return json({ code: "INVALID_REQUEST_ID" }, 400);
  const accessToken = parseBearer(request);
  if (!accessToken) return json({ code: "AUTH_REQUIRED" }, 401);

  let user: { id: string } | null;
  try {
    user = await runtime.validateUser(accessToken);
  } catch {
    return json({ code: "AUTH_UNAVAILABLE" }, 503);
  }
  if (!user || !uuidPattern.test(user.id)) return json({ code: "INVALID_AUTH" }, 401);

  const claimResult = await runtime.rpc("ot_seatalk_claim_dispatch", {
    p_request_id: requestedId.toLowerCase(),
    p_actor_id: user.id.toLowerCase(),
  });
  if (claimResult.error) {
    console.warn("seatalk_dispatch_claim_rejected", claimResult.error.message ?? "unknown");
    return json({ code: "DISPATCH_REJECTED" }, 403);
  }
  const dispatchClaim = parseDispatchClaim(claimResult.data);
  if (!dispatchClaim) return json({ code: "INVALID_DISPATCH_CLAIM" }, 502);
  if (dispatchClaim.claimed === false) {
    return json({
      dispatched: false,
      claimed: false,
      status: dispatchClaim.status,
      leaseExpiresAt: dispatchClaim.leaseExpiresAt,
    });
  }
  if (dispatchClaim.requestId !== requestedId.toLowerCase()) {
    const finish = await finishDispatch(runtime, dispatchClaim.dispatchKey, false, null, "SeaTalk dispatch claim was invalid");
    return finish.error
      ? json({ code: "DISPATCH_FINALIZATION_FAILED" }, 503)
      : json({ code: "INVALID_DISPATCH_CLAIM" }, 502);
  }

  try {
    const employeeCode = await employeeCodeForEmail(dispatchClaim.recipientEmail, runtime);
    const messageId = await sendInteractiveCard(employeeCode, dispatchClaim, runtime);
    const finish = await finishDispatch(runtime, dispatchClaim.dispatchKey, true, messageId, null);
    const finishData = asRecord(finish.data);
    if (finish.error || finishData.finalized !== true) {
      return json({ code: "DISPATCH_FINALIZATION_FAILED" }, 503);
    }
    return json({ dispatched: true, status: asTrimmedString(finishData.status) ?? "sent" });
  } catch (error) {
    const detail = error instanceof ProviderError ? error.safeDetail : "SeaTalk delivery failed";
    const finish = await finishDispatch(runtime, dispatchClaim.dispatchKey, false, null, detail);
    if (finish.error) return json({ code: "DISPATCH_FINALIZATION_FAILED" }, 503);
    return json({ code: "SEATALK_DELIVERY_FAILED" }, 502);
  }
}

async function handleInteractiveClick(payload: Record<string, unknown>, runtime: Runtime): Promise<Response> {
  const id = eventId(payload);
  if (!id) return json({ code: "INVALID_EVENT_ID" }, 400);
  const action = parseAction(actionValue(payload));
  if (!action) return json({ code: "INVALID_ACTION" }, 400);
  let email: string | null;
  try {
    email = await callbackSenderEmail(payload, runtime);
  } catch {
    return json({ code: "SENDER_LOOKUP_FAILED" }, 502);
  }
  if (!email) return json({ code: "INVALID_SENDER" }, 400);
  const key = await idempotencyKey(id);
  if (action.decision === "approved") {
    const result = await runtime.rpc("ot_seatalk_apply_review", {
      p_notification_id: action.notificationId,
      p_decision: "approved",
      p_note: "",
      p_sender_email: email,
      p_idempotency_key: key,
    });
    if (result.error) return json({ code: "REVIEW_REJECTED" }, 403);
    return json({ status: "applied", result: result.data });
  }

  const result = await runtime.rpc("ot_seatalk_begin_rejection", {
    p_notification_id: action.notificationId,
    p_sender_email: email,
    p_event_idempotency_key: key,
  });
  if (result.error) return json({ code: "REVIEW_REJECTED" }, 403);
  const data = asRecord(result.data);
  if (data.status === "applied") return json({ status: "applied", result: data.result });
  return json({ status: "reason_required" });
}

async function handleRejectionReason(payload: Record<string, unknown>, runtime: Runtime): Promise<Response> {
  const id = eventId(payload);
  if (!id) return json({ code: "INVALID_EVENT_ID" }, 400);
  const reason = rejectionReason(payload);
  if (!reason) return json({ code: "REJECTION_REASON_REQUIRED" }, 400);
  let email: string | null;
  try {
    email = await callbackSenderEmail(payload, runtime);
  } catch {
    return json({ code: "SENDER_LOOKUP_FAILED" }, 502);
  }
  if (!email) return json({ code: "INVALID_SENDER" }, 400);
  const result = await runtime.rpc("ot_seatalk_apply_rejection_reason", {
    p_sender_email: email,
    p_reason: reason,
    p_event_idempotency_key: await idempotencyKey(id),
  });
  if (result.error) return json({ code: "REVIEW_REJECTED" }, 403);
  return json({ status: "applied", result: result.data });
}

export async function handleRequest(request: Request, dependencies: Dependencies = {}): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== "POST") return json({ code: "METHOD_NOT_ALLOWED" }, 405);

  let rawBody: Uint8Array;
  let payload: Record<string, unknown>;
  try {
    rawBody = new Uint8Array(await request.arrayBuffer());
    const parsed = JSON.parse(decoder.decode(rawBody));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ code: "INVALID_PAYLOAD" }, 400);
    payload = parsed as Record<string, unknown>;
  } catch {
    return json({ code: "INVALID_PAYLOAD" }, 400);
  }

  const runtime = createRuntime(dependencies);
  if (payload.action === "dispatch") return await handleDispatch(request, payload, runtime);
  if (payload.event_type === "event_verification") {
    const challenge = payload.seatalk_challenge ?? asRecord(payload.event).seatalk_challenge;
    if (typeof challenge === "string" && challenge.length > 0) return json({ seatalk_challenge: challenge });
  }

  const signingSecret = envValue(runtime.env, "SEATALK_SIGNING_SECRET");
  if (!signingSecret) return json({ code: "SERVER_CONFIGURATION_ERROR" }, 500);
  if (!await signatureIsValid(rawBody, request.headers.get("Signature"), signingSecret)) {
    return json({ code: "INVALID_SIGNATURE" }, 401);
  }
  if (payload.event_type === "interactive_message_click") return await handleInteractiveClick(payload, runtime);
  if (payload.event_type === "message_from_bot_subscriber" || payload.event_type === "message") {
    return await handleRejectionReason(payload, runtime);
  }
  return json({ code: "UNSUPPORTED_EVENT" }, 400);
}

if ((import.meta as ImportMeta & { main?: boolean }).main) Deno.serve((request) => handleRequest(request));
