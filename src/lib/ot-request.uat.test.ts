import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { transformSync } from "@babel/core";
import presetReact from "@babel/preset-react";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

function functionSql(sql: string, name: string) {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\b[\\s\\S]*?\\$function\\$;`));
  if (!match) throw new Error(`Missing SQL function: ${name}`);
  return match[0];
}

function renderProductSwitch(activeProduct: string) {
  const app = read("app.jsx");
  const source = app.slice(app.indexOf("function ProductSwitch("), app.indexOf("function HomeButton("));
  const sandbox: any = {
    React: {
      createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
        return { type, props: props || {}, children };
      },
    },
    props: {
      activeProduct,
      onSwitchTaskAssign() {},
      onSwitchFlowMate() {},
      onSwitchMarketingPlan() {},
      onSwitchProductBook() {},
      onSwitchOtRequest() {},
    },
  };
  runInNewContext(`
    const TASK_ASSIGN_PRODUCT_KEY = "task-assign";
    const PRODUCT_BOOK_PRODUCT_KEY = "product-book";
    const OT_REQUEST_PRODUCT_KEY = "ot-request";
    ${source}
    globalThis.result = ProductSwitch(globalThis.props);
  `, sandbox);
  return sandbox.result;
}

type RenderedElement = {
  type: unknown;
  props: Record<string, unknown>;
  children: unknown[];
};

function loadOtRequestDomain() {
  const sandbox = { window: {} as Record<string, unknown> };
  runInNewContext(read("ot-request-domain.js"), sandbox);
  return (sandbox.window as any).FlowMateOtRequestDomain;
}

function createOtRequestFormHarness(overrides: Record<string, (...args: unknown[]) => Promise<unknown>>) {
  const stateSlots: unknown[] = [];
  let stateIndex = 0;
  const elements = (node: any, results: any[] = []): any[] => {
    if (!node || typeof node !== "object") return results;
    if (node.type) results.push(node);
    for (const child of node.children || []) elements(child, results);
    return results;
  };
  const formSource = read("screens-ot.jsx").slice(
    read("screens-ot.jsx").indexOf("function OtRequestForm("),
    read("screens-ot.jsx").indexOf("function OtConsentPanel("),
  );
  const compiled = transformSync(formSource, { presets: [[presetReact, { runtime: "classic" }]] })?.code;
  if (!compiled) throw new Error("OT request form could not be compiled for behavior testing.");
  const sandbox: any = {
    React: { createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => ({ type, props: props || {}, children }) },
    useStateApp(initialValue: unknown) {
      const index = stateIndex++;
      if (!(index in stateSlots)) stateSlots[index] = typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue;
      return [stateSlots[index], (next: unknown) => { stateSlots[index] = typeof next === "function" ? (next as (value: unknown) => unknown)(stateSlots[index]) : next; }];
    },
    useEffectApp() {},
    useRefApp: (value: unknown) => ({ current: value }),
    crypto: { randomUUID: () => "test-intent" },
    OT_CONSENT_STATEMENT_VERSION: "2026-08-07",
    OT_DETAIL_REQUIRED_REASONS: new Set(["other"]),
    OT_FUNCTION_APPROVER_EMAILS: { ops: "nithidol.k@garena.com" },
    getCurrentOtWeekStart: () => "2099-01-05",
    getBangkokDateKey: () => "2099-01-05",
    getOtBangkokParts: () => ({ date: "", time: "" }),
    getOtWeekSegments: () => [],
    getOtPlanRevisionBreakAllocation: () => ({ breakMinutesBeforeBoundary: "", breakMinutesAfterBoundary: "" }),
    getOtDescribedActionProps: () => ({}),
    addOtDays: (date: string, days: number) => new Date(`${date}T00:00:00Z`).setUTCDate(new Date(`${date}T00:00:00Z`).getUTCDate() + days) && new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10),
    toOtBangkokIso: (date: string, time: string) => `${date}T${time}:00+07:00`,
    useOtWeekSummaries: () => ({ status: "ready", summaries: [], retry() {} }),
    OtWeekProjection: () => null,
    OtWarning: () => null,
    otValue: () => undefined,
    formatOtDate: (value: string) => value,
    Set,
    Number,
    window: {
      FlowMateOtRequestDomain: {
        splitMinutesByWeek: () => [{ weekStart: "2099-01-05", minutes: 120 }],
        getWeekStartKey: () => "2099-01-05",
        buildWeekProjections: () => [],
        getCanonicalCountedSegments: () => [],
        isBangkokPlannedStartFuture: () => true,
        isSubmissionLocked: (status: string) => status === "submitting",
        REASON_OPTIONS: [{ key: "other", label: "Other" }],
      },
      ...overrides,
    },
  };
  runInNewContext(`${compiled}; globalThis.__OtRequestForm = OtRequestForm;`, sandbox);
  return {
    elements,
    render(mode = "create", request: Record<string, unknown> | null = null, onSuccess = () => {}) {
      stateIndex = 0;
      return sandbox.__OtRequestForm({ mode, request, weekStart: "2099-01-05", onSuccess }) as RenderedElement;
    },
  };
}

function createOtRootCauseHarness() {
  let initialized = false;
  let state: unknown;
  const domain = loadOtRequestDomain();
  const sandbox: any = {
    React: {
      Fragment: Symbol("Fragment"),
      createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
        return { type, props: props || {}, children };
      },
    },
    useStateApp(initialValue: unknown) {
      if (!initialized) {
        state = typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue;
        initialized = true;
      }
      return [state, (nextValue: unknown) => {
        state = typeof nextValue === "function" ? (nextValue as (current: unknown) => unknown)(state) : nextValue;
      }];
    },
    useEffectApp() {},
    useRefApp(initialValue: unknown) { return { current: initialValue }; },
    useMemoApp(factory: () => unknown) { return factory(); },
    window: { FlowMateOtRequestDomain: domain, location: { hash: "" } },
  };
  runInNewContext(`${read("screens-ot.js")}
    globalThis.__OtRootCausePanel = OtRootCausePanel;
    globalThis.__getOtManagerClientFilterKey = typeof getOtManagerClientFilterKey === "function" ? getOtManagerClientFilterKey : null;
  `, sandbox);

  return {
    getClientFilterKey: sandbox.__getOtManagerClientFilterKey,
    render(props: Record<string, unknown>) {
      return sandbox.__OtRootCausePanel(props) as RenderedElement;
    },
  };
}

function createOtApprovalQueueHarness() {
  const stateSlots: unknown[] = [];
  const refSlots: Array<{ current: unknown }> = [];
  const decisionIntentRef = { current: null };
  const bulkIntentsRef = { current: {} };
  let stateIndex = 0;
  let refIndex = 0;
  let keySequence = 0;
  const sandbox: any = {
    React: {
      Fragment: Symbol("Fragment"),
      createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
        return { type, props: props || {}, children };
      },
    },
    useStateApp(initialValue: unknown) {
      const index = stateIndex;
      stateIndex += 1;
      if (!(index in stateSlots)) stateSlots[index] = typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue;
      return [stateSlots[index], (nextValue: unknown) => {
        stateSlots[index] = typeof nextValue === "function" ? (nextValue as (current: unknown) => unknown)(stateSlots[index]) : nextValue;
      }];
    },
    useEffectApp() {},
    useRefApp(initialValue: unknown) {
      const index = refIndex;
      refIndex += 1;
      if (!(index in refSlots)) refSlots[index] = { current: initialValue };
      return refSlots[index];
    },
    useMemoApp(factory: () => unknown) { return factory(); },
    crypto: { randomUUID: () => `intent-${++keySequence}` },
    window: { location: { hash: "" } },
  };
  runInNewContext(read("supabase-ot-request.js"), sandbox);
  sandbox.window.FlowMateOtRequestDomain = loadOtRequestDomain();
  runInNewContext(`${read("screens-ot.js")}
    globalThis.__OtApprovalQueue = OtApprovalQueue;
  `, sandbox);

  return {
    window: sandbox.window,
    render(props: Record<string, unknown>) {
      stateIndex = 0;
      refIndex = 0;
      return sandbox.__OtApprovalQueue({ ...props, decisionIntentRef, bulkIntentsRef }) as RenderedElement;
    },
  };
}

function createOtManagerApprovalHarness() {
  type EffectSlot = {
    callback: () => unknown;
    cleanup?: () => void;
    deps?: unknown[];
    pending: boolean;
  };
  type HookScope = {
    states: unknown[];
    refs: Array<{ current: unknown }>;
    effects: EffectSlot[];
    stateIndex: number;
    refIndex: number;
    effectIndex: number;
  };
  const createScope = (): HookScope => ({ states: [], refs: [], effects: [], stateIndex: 0, refIndex: 0, effectIndex: 0 });
  let parentScope = createScope();
  let childScope = createScope();
  let currentScope: HookScope | null = null;
  let keySequence = 0;
  let dashboardRows: Array<Record<string, unknown>> = [];
  let lastQueueProps: Record<string, unknown> | null = null;

  const sandbox: any = {
    React: {
      Fragment: Symbol("Fragment"),
      createElement(type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) {
        return { type, props: props || {}, children };
      },
    },
    useStateApp(initialValue: unknown) {
      if (!currentScope) throw new Error("useStateApp called outside a harness render");
      const scope = currentScope;
      const index = scope.stateIndex;
      scope.stateIndex += 1;
      if (!(index in scope.states)) scope.states[index] = typeof initialValue === "function" ? (initialValue as () => unknown)() : initialValue;
      return [scope.states[index], (nextValue: unknown) => {
        scope.states[index] = typeof nextValue === "function" ? (nextValue as (current: unknown) => unknown)(scope.states[index]) : nextValue;
      }];
    },
    useEffectApp(callback: () => unknown, deps?: unknown[]) {
      if (!currentScope) throw new Error("useEffectApp called outside a harness render");
      const scope = currentScope;
      const index = scope.effectIndex;
      scope.effectIndex += 1;
      const previous = scope.effects[index];
      const changed = !previous || !deps || !previous.deps || deps.length !== previous.deps.length
        || deps.some((value, depIndex) => !Object.is(value, previous.deps?.[depIndex]));
      scope.effects[index] = changed
        ? { callback, cleanup: previous?.cleanup, deps: deps ? [...deps] : undefined, pending: true }
        : previous;
    },
    useRefApp(initialValue: unknown) {
      if (!currentScope) throw new Error("useRefApp called outside a harness render");
      const scope = currentScope;
      const index = scope.refIndex;
      scope.refIndex += 1;
      if (!(index in scope.refs)) scope.refs[index] = { current: initialValue };
      return scope.refs[index];
    },
    useMemoApp(factory: () => unknown) { return factory(); },
    crypto: { randomUUID: () => `intent-${++keySequence}` },
    window: { location: { hash: "" } },
  };
  runInNewContext(read("supabase-ot-request.js"), sandbox);
  sandbox.window.FlowMateOtRequestDomain = loadOtRequestDomain();
  sandbox.window.loadOtManagerDashboard = async () => ({ requests: dashboardRows });
  sandbox.window.loadOtPeopleForEvent = async () => [];
  runInNewContext(`${read("screens-ot.js")}
    globalThis.__OtManagerDashboard = OtManagerDashboard;
    globalThis.__OtApprovalQueue = OtApprovalQueue;
    globalThis.__getCurrentOtWeekStart = getCurrentOtWeekStart;
  `, sandbox);

  function renderWith(scope: HookScope, component: (props: Record<string, unknown>) => RenderedElement, props: Record<string, unknown>) {
    scope.stateIndex = 0;
    scope.refIndex = 0;
    scope.effectIndex = 0;
    currentScope = scope;
    try {
      return component(props) as RenderedElement;
    } finally {
      currentScope = null;
    }
  }

  async function flushEffects(scope: HookScope) {
    for (const effect of scope.effects) {
      if (!effect?.pending) continue;
      effect.pending = false;
      if (effect.cleanup) effect.cleanup();
      const cleanup = effect.callback();
      effect.cleanup = typeof cleanup === "function" ? cleanup as () => void : undefined;
    }
    for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  }

  function renderManager() {
    const tree = renderWith(parentScope, sandbox.__OtManagerDashboard, {
      access: { isEligibleApprover: true, userId: "approver-1" },
      rootCauseOnly: false,
      refreshToken: 0,
    });
    const queueElement = findRenderedElements(tree, element => element.type === sandbox.__OtApprovalQueue)[0];
    if (!queueElement) {
      childScope = createScope();
      lastQueueProps = null;
      return { tree, queue: null };
    }
    lastQueueProps = queueElement.props;
    return { tree, queue: renderWith(childScope, sandbox.__OtApprovalQueue, queueElement.props) };
  }

  return {
    window: sandbox.window,
    weekStart: sandbox.__getCurrentOtWeekStart(),
    setRows(rows: Array<Record<string, unknown>>) { dashboardRows = rows; },
    renderQueue() {
      if (!lastQueueProps) throw new Error("Approval queue is not mounted");
      return renderWith(childScope, sandbox.__OtApprovalQueue, lastQueueProps);
    },
    async mountQueue() {
      renderManager();
      await flushEffects(parentScope);
      const ready = renderManager();
      if (!ready.queue) throw new Error("Approval queue did not mount after manager load");
      return ready.queue;
    },
    async refreshQueue() {
      const loading = renderManager();
      if (loading.queue) throw new Error("Approval queue stayed mounted during manager refresh");
      await flushEffects(parentScope);
      const ready = renderManager();
      if (!ready.queue) throw new Error("Approval queue did not remount after manager refresh");
      return { loadingText: renderedText(loading.tree), queue: ready.queue };
    },
  };
}

function findRenderedElements(node: unknown, predicate: (element: RenderedElement) => boolean): RenderedElement[] {
  if (Array.isArray(node)) return node.flatMap(child => findRenderedElements(child, predicate));
  if (!node || typeof node !== "object" || !("children" in node)) return [];
  const element = node as RenderedElement;
  return (predicate(element) ? [element] : []).concat(findRenderedElements(element.children, predicate));
}

function renderedText(node: unknown): string {
  if (Array.isArray(node)) return node.map(renderedText).join(" ");
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (typeof node === "object" && "children" in node) return renderedText((node as RenderedElement).children);
  return "";
}

function renderedButton(node: unknown, label: string, exact = true) {
  const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
  const button = findRenderedElements(node, element => (
    element.type === "button"
    && (exact ? normalize(renderedText(element)) === normalize(label) : normalize(renderedText(element)).includes(normalize(label)))
  ))[0];
  if (!button) {
    const labels = findRenderedElements(node, element => element.type === "button").map(element => normalize(renderedText(element)));
    throw new Error(`Missing rendered button: ${label}. Rendered buttons: ${labels.join(" | ")}`);
  }
  return button;
}

describe("OT Request backend contract", () => {
  it("defines an OT-only requester registry with an unmapped-user preflight", () => {
    const sql = read("supabase", "ot_request.sql");
    const verify = read("supabase", "ot_request_verify.sql");

    expect(sql).toContain("create table if not exists public.ot_requester_access");
    expect(sql).toContain("create table if not exists public.ot_requester_access_audit");
    expect(sql).toContain("email text not null unique");
    expect(sql).toContain("email = pg_catalog.lower(pg_catalog.btrim(email))");
    expect(sql).toContain("email like '%@garena.com'");
    expect(sql).toContain("function_code text not null check (function_code in ('gdve', 'ops', 'mkt', 'esport'))");
    expect(sql).toContain("alter table public.ot_requester_access enable row level security");
    expect(sql).toMatch(/revoke all on table public\.ot_requester_access from public, anon, authenticated/);
    expect(sql).toMatch(/revoke all on table public\.ot_requester_access_audit from public, anon, authenticated/);
    expect(verify).toContain("OT requester access preflight");
  });

  it("defines Owner-only requester maintenance and pending identity sync RPCs", () => {
    const requesterList = functionSql(sql, "ot_list_requester_access");
    const requesterUpsert = functionSql(sql, "ot_upsert_requester_access");
    const requesterState = functionSql(sql, "ot_set_requester_access");
    const requesterResolve = functionSql(sql, "ot_resolve_current_requester_access");

    for (const source of [requesterList, requesterUpsert, requesterState]) {
      expect(source).toContain("public.ot_current_user_is_owner()");
    }
    expect(requesterUpsert).toContain("@garena.com");
    expect(requesterUpsert).toContain("for update");
    expect(requesterUpsert).toContain("public.ot_requester_access_audit");
    expect(requesterUpsert).toContain("'pending_sync'");
    expect(requesterState).toContain("public.ot_requester_access_audit");
    expect(requesterState).toContain("for update");
    expect(requesterResolve).toContain("public.ot_requester_access_audit");
    expect(requesterResolve).toContain("pending_sync");
    for (const signature of [
      "public.ot_list_requester_access()",
      "public.ot_upsert_requester_access(jsonb, uuid)",
      "public.ot_set_requester_access(uuid, boolean, uuid)",
      "public.ot_resolve_current_requester_access()",
    ]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    }
    expect(verify).toContain("OT requester access RPC contract");
  });

  it("enforces active requester access and locks personal OT Function server-side", () => {
    const requesterGate = functionSql(sql, "ot_require_current_requester_access");
    const accessContext = functionSql(sql, "ot_get_access_context");

    expect(requesterGate).toContain("public.ot_resolve_current_requester_access()");
    expect(requesterGate).toContain("OT requester access is not active");
    for (const name of [
      "ot_get_my_dashboard",
      "ot_list_my_requests",
      "ot_create_request",
      "ot_resubmit_plan",
      "ot_record_consent",
      "ot_submit_actual",
    ]) {
      expect(functionSql(sql, name)).toContain("public.ot_require_current_requester_access()");
    }
    for (const name of ["ot_create_request", "ot_resubmit_plan"]) {
      expect(functionSql(sql, name)).toContain("v_requester_access.function_code");
    }
    expect(accessContext).toContain("'canRequestOt'");
    expect(accessContext).toContain("'requesterFunctionCode'");
    expect(accessContext).toContain("'requesterAccessStatus'");
    expect(verify).toContain("OT requester enforcement contract");
  });

  it("ships a one-time requester backfill from active primary FlowMate teams without reactivating Owner-deactivated people", () => {
    const backfillPath = join(process.cwd(), "supabase", "ot_requester_access_backfill.sql");
    const verifyPath = join(process.cwd(), "supabase", "ot_requester_access_backfill_verify.sql");

    expect(existsSync(backfillPath)).toBe(true);
    expect(existsSync(verifyPath)).toBe(true);

    const backfill = readFileSync(backfillPath, "utf8");
    const verify = readFileSync(verifyPath, "utf8");
    expect(backfill).toContain("public.user_team_memberships");
    expect(backfill).toContain("membership.is_primary");
    expect(backfill).toContain("membership.team_code in ('gdve', 'ops', 'mkt', 'esport')");
    expect(backfill).toContain("u.is_active = true");
    expect(backfill).toContain("on conflict (email) do nothing");
    expect(backfill).toContain("baseline_sync_requester_access");
    expect(verify).toContain("OT requester backfill coverage");
    expect(verify).toContain("Active users missing an OT requester access row");
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
  });

  it("keeps Owner requester maintenance separate from Approvers and HR access", () => {
    const clientSource = read("supabase-ot-request.js");
    const screen = read("screens-ot.jsx");

    expect(clientSource).toContain('window.loadOtRequesterAccess = () => callOtRequestRpc("ot_list_requester_access"');
    expect(clientSource).toContain("window.upsertOtRequesterAccess = (payload, key)");
    expect(clientSource).toContain("window.setOtRequesterAccess = (requesterAccessId, active, key)");
    expect(screen).toContain("function OtRequesterAccessPanel(");
    expect(screen).toContain("Add OT requester");
    expect(screen).toContain("@garena.com");
    expect(screen).toContain("Approvers / HR access");
    expect(screen).toContain("window.loadOtRequesterAccess()");
    expect(screen).toContain("window.upsertOtRequesterAccess(");
    expect(screen).toContain("window.setOtRequesterAccess(");
  });

  it("uses unqualified SQL conditional expressions so installer and verifier compile", () => {
    for (const script of [
      read("supabase", "ot_request.sql"),
      read("supabase", "ot_request_verify.sql"),
    ]) {
      expect(script).not.toContain("pg_catalog.coalesce(");
      expect(script).not.toContain("pg_catalog.nullif(");
      expect(script).not.toContain("pg_catalog.greatest(");
      expect(script).not.toContain("pg_catalog.least(");
      expect(script).not.toContain("pg_catalog.position(");
      expect(script).not.toContain("pg_catalog.substring(");
      expect(script).not.toContain("email[)])");
    }
    expect(read("supabase", "ot_request_verify.sql")).toContain("email[)][)]");
  });

  const sql = read("supabase", "ot_request.sql");
  const verify = read("supabase", "ot_request_verify.sql");

  it("creates isolated OT tables and append-only audit", () => {
    for (const table of ["ot_system_roles", "ot_approvers", "ot_event_plans", "ot_requests", "ot_request_audit", "ot_export_batches"]) {
      expect(sql).toContain(`create table if not exists public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
    expect(sql).toContain("revoke insert, update, delete on public.ot_request_audit from authenticated");
  });

  it("resolves the actor from auth.uid and seeds approved identities", () => {
    expect(sql).toContain("auth.uid()");
    expect(sql).toContain("panuwee.w@garena.com");
    expect(sql).toContain("nithidol.k@garena.com");
    expect(sql).toContain("weerayut@garena.com");
    expect(sql).toContain("napol.a@garena.com");
    expect(functionSql(sql, "ot_review_plan")).not.toMatch(/p_actor(_user)?_id/i);
    expect(sql).toContain("revoke all on function public.ot_apply_plan_review(uuid, text, text, uuid, uuid) from public, anon, authenticated");
  });

  it("ships read-only verification", () => {
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("Expected OT Owner seed count = 1");
    expect(verify).toContain("Expected active approver seed count = 3");
    expect(verify).toContain("OT HR Admin assignment allowlist guard (Expected = true)");
    expect(verify).toContain("p_role_code = ''hr_admin''");
    expect(verify).toContain("p_active = true");
    expect(verify).toContain("not public[.]ot_user_is_approved_approver_identity[(]p_user_id[)]");
    expect(verify).toContain("HR Admin must be one of the three approved MVP identities");
    expect(verify).toContain("as guard_matches_contract");
    expect(verify).toContain("Unauthorized active HR Admin assignments (Expected = 0)");
  });

  it("centralizes fixed HR Admin authorization across every full-scope path", () => {
    const hrAdmin = functionSql(sql, "ot_current_user_is_hr_admin");
    const canReadRequest = functionSql(sql, "ot_current_user_can_read_request");
    const audit = functionSql(sql, "ot_list_request_audit");
    const fullScopePolicy = sql.slice(
      sql.indexOf('create policy "OT Owner and HR Admin can read all OT requests"'),
      sql.indexOf("revoke all on table public.ot_system_roles"),
    );

    for (const contract of [
      "u.id = (select auth.uid())",
      "u.is_active = true",
      "public.ot_user_is_approved_approver_identity(u.id)",
      "r.role_code = 'hr_admin'",
      "r.active = true",
    ]) {
      expect(hrAdmin).toContain(contract);
    }
    expect(hrAdmin).not.toContain("like '%@garena.com'");
    for (const name of ["ot_get_access_context", "ot_get_manager_dashboard", "ot_list_people_for_event"]) {
      expect(functionSql(sql, name)).toContain("public.ot_current_user_is_hr_admin()");
    }
    for (const name of ["ot_list_hr_ready", "ot_mark_exported"]) {
      expect(functionSql(sql, name)).toContain("public.ot_current_user_is_eligible_approver()");
    }
    expect(canReadRequest).toContain("public.ot_current_user_is_hr_admin()");
    expect(fullScopePolicy).toContain("public.ot_current_user_is_hr_admin()");
    expect(audit).toContain("public.ot_current_user_can_read_request(p_request_id)");
  });

  it("preserves audited approver deactivation when the installer is rerun", () => {
    const ownerSeed = sql.slice(
      sql.indexOf("insert into public.ot_system_roles"),
      sql.indexOf("insert into public.ot_approvers"),
    );
    const approverSeed = sql.slice(
      sql.indexOf("insert into public.ot_approvers"),
      sql.indexOf("create or replace function public.ot_require_current_user"),
    );
    const setRole = functionSql(sql, "ot_set_system_role");

    expect(ownerSeed).toMatch(/on conflict \(user_id\) do update[\s\S]*active = excluded\.active/);
    expect(approverSeed).toMatch(/on conflict \(user_id\) do nothing/);
    expect(approverSeed).not.toMatch(/on conflict \(user_id\) do update/);
    expect(setRole).toMatch(/p_role_code = 'hr_admin'[\s\S]*p_active = true[\s\S]*ot_user_is_approved_approver_identity\(p_user_id\)/);
    expect(setRole).toMatch(/A non-empty reason is required[\s\S]*insert into public\.ot_system_roles[\s\S]*'set_system_role'/);
  });

  it("verifies the fixed HR helper and legacy-role remediation without mutations", () => {
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("OT HR Admin fixed helper contract (Expected = true)");
    expect(verify).toContain("public.ot_user_is_approved_approver_identity(u.id)");
    expect(verify).toContain("as helper_matches_contract");
    expect(verify).toContain("Legacy active HR Admin role does not satisfy fixed helper (Expected = true)");
    expect(verify).toContain("as legacy_role_cannot_grant_hr_access");
    expect(verify).toContain("OT HR Admin deactivation remediation contract (Expected = true)");
    expect(verify).toContain("p_active = false");
  });

  it("persists the consent statement version for individual and event occurrences", () => {
    const createRequest = functionSql(sql, "ot_create_request");
    const recordConsent = functionSql(sql, "ot_record_consent");

    expect(sql).toContain("consent_statement_version text");
    expect(sql).toContain("add column if not exists consent_statement_version text");
    expect(createRequest).toMatch(/consentStatementVersion[\s\S]*consent_statement_version[\s\S]*Consent statement version is required/);
    expect(createRequest).toMatch(/employee_consent,[\s\S]*consent_statement_version,[\s\S]*employee_consented_at[\s\S]*'accepted', v_consent_statement_version,[\s\S]*now\(\)/);
    expect(recordConsent).toContain("p_consent_statement_version text");
    expect(recordConsent).toMatch(/nullif\(pg_catalog\.btrim\(p_consent_statement_version\), ''\)[\s\S]*Consent statement version is required/);
    expect(recordConsent).toMatch(/employee_consent = 'accepted'[\s\S]*consent_statement_version = v_consent_statement_version/);
    expect(recordConsent).toMatch(/employee_consent = 'declined'[\s\S]*consent_statement_version = v_consent_statement_version/);
    expect(recordConsent).toMatch(/changed_fields[\s\S]*consentStatementVersion[\s\S]*v_consent_statement_version/);
    expect(sql).toContain("drop function if exists public.ot_record_consent(uuid, boolean, uuid)");
    expect(sql).toContain("grant execute on function public.ot_record_consent(uuid, boolean, text, uuid) to authenticated");
  });

  it("enforces the fixed reason vocabulary, required detail, and exact consent statement version at every write boundary", () => {
    const assertReason = functionSql(sql, "ot_assert_reason");
    const assertConsent = functionSql(sql, "ot_assert_consent_version");
    const createRequest = functionSql(sql, "ot_create_request");
    const resubmitPlan = functionSql(sql, "ot_resubmit_plan");
    const createEvent = functionSql(sql, "ot_create_event_plan");
    const recordConsent = functionSql(sql, "ot_record_consent");
    const submitActual = functionSql(sql, "ot_submit_actual");

    for (const reasonCode of [
      "offline_event", "campaign_launch", "live_incident", "capacity",
      "external_schedule", "rework", "scope_change", "travel_offsite", "other",
    ]) expect(assertReason).toContain(`'${reasonCode}'`);
    for (const detailRequired of ["other", "live_incident", "rework", "scope_change"]) {
      expect(assertReason).toContain(`'${detailRequired}'`);
    }
    expect(assertReason).toMatch(/reason code[^']*invalid|invalid[^']*reason code/i);
    expect(assertReason).toMatch(/reason detail[^']*required|required[^']*reason detail/i);
    expect(assertConsent).toContain("'2026-08-07'");
    expect(assertConsent).toMatch(/consent statement version[^']*2026-08-07/i);
    for (const caller of [createRequest, resubmitPlan, createEvent, submitActual]) {
      expect(caller).toContain("public.ot_assert_reason(");
    }
    for (const caller of [createRequest, resubmitPlan, recordConsent, submitActual]) {
      expect(caller).toContain("public.ot_assert_consent_version(");
    }
  });

  it("requires and persists a reason when actual net minutes vary by more than 30", () => {
    const submit = functionSql(sql, "ot_submit_actual");

    expect(sql).toContain("actual_variance_reason text");
    expect(sql).toContain("add column if not exists actual_variance_reason text");
    expect(submit).toMatch(/actualVarianceReason[\s\S]*actual_variance_reason[\s\S]*varianceReason/);
    expect(submit).toContain("pg_catalog.abs(v_minutes - v_request.planned_minutes)");
    expect(submit).toMatch(/v_variance_minutes > 30[\s\S]*v_variance_reason is null[\s\S]*Actual variance reason is required/);
    expect(submit).toMatch(/actual_variance_reason = v_variance_reason/);
    expect(submit).toMatch(/actualVarianceMinutes[\s\S]*v_variance_minutes[\s\S]*actualVarianceReason[\s\S]*v_variance_reason/);
  });

  it("verifies the new audit fields without widening direct writes", () => {
    expect(verify).toContain("OT request consent and variance fields (Expected = 2)");
    expect(verify).toContain("consent_statement_version");
    expect(verify).toContain("actual_variance_reason");
    expect(verify).toContain("Legacy 3-argument consent RPC (Expected = 0)");
    expect(verify).toContain("Versioned 4-argument consent RPC (Expected = 1)");
    expect(sql).toContain("revoke all on table public.ot_system_roles, public.ot_approvers");
    expect(sql).toContain("grant select on public.ot_requests to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+public\.ot_requests\s+to\s+authenticated/i);
  });

  it("returns Team Lead-scoped export rows with normalized identity emails", () => {
    const hrReady = functionSql(sql, "ot_list_hr_ready");

    expect(sql).toContain("drop function if exists public.ot_list_hr_ready(date)");
    expect(hrReady).toContain("returns setof jsonb");
    expect(hrReady).toContain("security definer");
    expect(hrReady).toContain("set search_path = ''");
    expect(hrReady).toMatch(/ot_current_user_is_owner\(\)[\s\S]*ot_current_user_is_eligible_approver\(\)[\s\S]*raise exception/);
    expect(hrReady).toMatch(/to_jsonb\(r\)[\s\S]*jsonb_build_object\([\s\S]*'employee_email'[\s\S]*lower\(pg_catalog\.btrim\(employee\.email\)\)[\s\S]*'approver_email'[\s\S]*lower\(pg_catalog\.btrim\(approver\.email\)\)/);
    expect(hrReady).toMatch(/join public\.users employee on employee\.id = r\.employee_user_id[\s\S]*join public\.users approver on approver\.id = r\.approver_user_id/);
    expect(hrReady).toMatch(/r\.status = 'hr_ready'[\s\S]*r\.hr_ready_at is not null[\s\S]*r\.approver_user_id = v_actor_id/);
    expect(hrReady).toMatch(/p_week_start is null[\s\S]*actual_week_segments[\s\S]*weekStart/);
    expect(hrReady).toContain("order by r.actual_start_at, r.id");
    expect(sql).toContain("grant execute on function public.ot_list_hr_ready(date) to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+public\.ot_requests\s+to\s+authenticated/i);
    expect(verify).toContain("Team Lead export RPC contract (Expected = SETOF jsonb with normalized emails and assigned scope)");
    expect(verify).toContain("has_employee_email");
    expect(verify).toContain("has_approver_email");
  });

  it("keeps event actuals behind per-occurrence employee consent", () => {
    const submit = functionSql(sql, "ot_submit_actual");
    const consent = functionSql(sql, "ot_record_consent");
    const verifyActual = functionSql(sql, "ot_verify_actual");

    expect(submit).toMatch(/status = case[\s\S]*v_over_limit[\s\S]*compliance_review_required[\s\S]*pending_actual_verification/);
    expect(consent).toContain("status not in ('awaiting_consent', 'pending_actual_verification', 'compliance_review_required')");
    expect(consent).toMatch(/actual_submitted_at is not null[\s\S]*compliance_required[\s\S]*pending_actual_verification/);
    expect(verifyActual).toMatch(/source = 'event_plan'[\s\S]*employee_consent is distinct from 'accepted'[\s\S]*raise exception/);
  });

  it("preserves mandatory compliance review when late consent is declined", () => {
    const consent = functionSql(sql, "ot_record_consent");

    expect(consent).toMatch(
      /else[\s\S]*employee_consent = 'declined'[\s\S]*status = case[\s\S]*actual_submitted_at is not null and compliance_required[\s\S]*compliance_review_required[\s\S]*else 'rejected'/,
    );
  });

  it("keeps finalized actuals immutable and rechecks state after locking", () => {
    const submit = functionSql(sql, "ot_submit_actual");
    const verifyActual = functionSql(sql, "ot_verify_actual");
    const stateGuard = "status not in ('pending_actual_verification', 'compliance_review_required')";
    const decisionGuard = "v_request.actual_decision is not null";
    const replayReturn = verifyActual.indexOf("return pg_catalog.to_jsonb(v_request);");
    const authorityLock = verifyActual.indexOf("for key share of a");
    const requestLock = verifyActual.indexOf("select * into v_request from public.ot_requests r where r.id = p_request_id for update;");
    const actualWrite = verifyActual.indexOf("update public.ot_requests", requestLock);
    const firstDecisionGuard = verifyActual.indexOf(decisionGuard);
    const secondDecisionGuard = verifyActual.indexOf(decisionGuard, firstDecisionGuard + decisionGuard.length);

    expect(submit).toContain("status in ('cancelled', 'exported', 'hr_ready')");
    expect(verifyActual.split(stateGuard)).toHaveLength(3);
    expect(verifyActual.lastIndexOf(stateGuard)).toBeGreaterThan(verifyActual.indexOf("for update"));
    expect(verifyActual.split(decisionGuard)).toHaveLength(3);
    expect(firstDecisionGuard).toBeGreaterThan(replayReturn);
    expect(firstDecisionGuard).toBeLessThan(authorityLock);
    expect(secondDecisionGuard).toBeGreaterThan(requestLock);
    expect(secondDecisionGuard).toBeLessThan(actualWrite);
    expect(verify).toContain("OT approved Actual immutability contract (Expected = valid)");
  });

  it("rejects non-future planned starts at every server caller and rechecks after write-path locks", () => {
    const createRequest = functionSql(sql, "ot_create_request");
    const resubmitPlan = functionSql(sql, "ot_resubmit_plan");
    const previewEvent = functionSql(sql, "ot_preview_event_plan");
    const createEvent = functionSql(sql, "ot_create_event_plan");
    const futureGuard = "v_start_at <= pg_catalog.clock_timestamp()";

    for (const caller of [createRequest, resubmitPlan, previewEvent, createEvent]) {
      expect(caller).toContain("v_start_at timestamptz");
      expect(caller).toContain(futureGuard);
      expect(caller).not.toMatch(/v_start_at[\s\S]{0,80}(at time zone|::text)/i);
    }
    expect(previewEvent.split(futureGuard)).toHaveLength(2);
    for (const writer of [createRequest, resubmitPlan, createEvent]) {
      expect(writer.split(futureGuard)).toHaveLength(3);
    }

    const createRequestWrite = createRequest.indexOf("insert into public.ot_requests");
    expect(createRequest.lastIndexOf(futureGuard)).toBeGreaterThan(createRequest.lastIndexOf("public.ot_assert_no_employee_overlap", createRequestWrite));
    expect(createRequest.lastIndexOf(futureGuard)).toBeLessThan(createRequestWrite);

    const resubmitWrite = resubmitPlan.indexOf("update public.ot_requests");
    expect(resubmitPlan.lastIndexOf(futureGuard)).toBeGreaterThan(resubmitPlan.lastIndexOf("public.ot_assert_no_employee_overlap", resubmitWrite));
    expect(resubmitPlan.lastIndexOf(futureGuard)).toBeLessThan(resubmitWrite);

    const createEventWrite = createEvent.indexOf("insert into public.ot_event_plans");
    expect(createEvent.lastIndexOf(futureGuard)).toBeGreaterThan(createEvent.lastIndexOf("public.ot_assert_no_employee_overlap", createEventWrite));
    expect(createEvent.lastIndexOf(futureGuard)).toBeLessThan(createEventWrite);

    expect(verify).toContain("OT future planned-start enforcement contract (Expected = valid)");
    expect(read("supabase", "README.md")).toContain("future at call time and again after all write-path locks");
  });

  it("authorizes actual submission only through the locked request state machine", () => {
    const submit = functionSql(sql, "ot_submit_actual");
    const employeeWeekLock = "public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments)";
    const rowLock = "select * into v_request from public.ot_requests r where r.id = p_request_id for update";
    const update = "update public.ot_requests";
    const rowLockIndex = submit.indexOf(rowLock);
    const lockedState = submit.slice(rowLockIndex, submit.indexOf(update, rowLockIndex));

    expect(submit.indexOf(employeeWeekLock)).toBeLessThan(rowLockIndex);
    expect(lockedState).toMatch(
      /\(v_request\.source = 'employee_request' and v_request\.plan_decision = 'approved'\)\s+or\s+\(v_request\.source = 'event_plan' and v_request\.employee_consent = 'accepted'\)/,
    );
    expect(lockedState).toContain("v_request.planned_end_at <= now()");
    expect(lockedState).toContain("v_end_at <= now()");
    expect(lockedState).toMatch(
      /v_request\.status in \('approved', 'actual_confirmation_required'\)\s+and v_request\.actual_submitted_at is null\s+and v_request\.actual_decision is null/,
    );
    expect(lockedState).toMatch(
      /v_request\.status = 'revision_required'\s+and v_request\.actual_decision = 'revision_required'/,
    );
    for (const finalizedFact of [
      "actual_decision = 'approved'",
      "compliance_reviewed_at is not null",
      "hr_ready_at is not null",
      "status = 'exported'",
    ]) {
      expect(lockedState).not.toContain(finalizedFact);
    }
  });

  it("adds an authorized and idempotent actual-amendment state transition", () => {
    const amendment = functionSql(sql, "ot_request_actual_amendment");
    const requestLock = "pg_catalog.hashtextextended('ot-request:' || p_request_id::text, 2)";
    const employeeWeekLock = "public.ot_lock_employee_weeks(v_request.employee_user_id, v_request.actual_week_segments)";
    const rowLock = "select * into v_request from public.ot_requests r where r.id = p_request_id for update";
    const updateStart = amendment.indexOf("update public.ot_requests");
    const updateEnd = amendment.indexOf("where id = p_request_id", updateStart);
    const updateClause = amendment.slice(updateStart, updateEnd);

    expect(amendment).toContain("returns jsonb");
    expect(amendment).toContain("security definer");
    expect(amendment).toContain("set search_path = ''");
    expect(amendment).toMatch(
      /ot_current_user_is_owner\(\)[\s\S]*ot_current_user_is_hr_admin\(\)[\s\S]*ot_user_is_approved_approver_identity\(v_actor_id\)[\s\S]*raise exception/,
    );
    expect(amendment).toMatch(/nullif\(pg_catalog\.btrim\(p_reason\), ''\)[\s\S]*reason is required/i);
    expect(amendment).toContain("public.ot_lock_idempotency('request_actual_amendment', p_idempotency_key)");
    expect(amendment.indexOf(requestLock)).toBeLessThan(amendment.indexOf(employeeWeekLock));
    expect(amendment.indexOf(employeeWeekLock)).toBeLessThan(amendment.indexOf(rowLock));
    expect(amendment).toMatch(/status = 'exported'[\s\S]*raise exception/);
    expect(amendment).toMatch(/status = 'revision_required'[\s\S]*actual_decision = 'revision_required'[\s\S]*raise exception/);
    expect(amendment).toMatch(
      /actual_submitted_at is null[\s\S]*actual_decision is distinct from 'approved'[\s\S]*actual_verified_by_user_id is null[\s\S]*actual_verified_at is null[\s\S]*raise exception/,
    );
    expect(updateClause).toContain("actual_decision = 'revision_required'");
    expect(updateClause).toContain("actual_decision_note = v_reason");
    expect(updateClause).toContain("actual_verified_by_user_id = null");
    expect(updateClause).toContain("actual_verified_at = null");
    expect(updateClause).toContain("compliance_outcome = null");
    expect(updateClause).toContain("compliance_reviewed_at = null");
    expect(updateClause).toContain("hr_ready_at = null");
    expect(updateClause).toContain("status = 'revision_required'");
    for (const preservedFact of [
      "actual_start_at =",
      "actual_end_at =",
      "actual_break_minutes =",
      "actual_minutes =",
      "actual_week_segments =",
      "actual_submitted_at =",
      "compliance_required =",
      "exported_at =",
      "export_batch_id =",
    ]) {
      expect(updateClause).not.toContain(preservedFact);
    }
    expect(amendment).toMatch(/action = 'request_actual_amendment'[\s\S]*idempotency_key = p_idempotency_key[\s\S]*return v_replay_result/);
    expect(amendment).toMatch(/'request_actual_amendment'[\s\S]*'previousActualDecision'[\s\S]*'previousComplianceOutcome'[\s\S]*'previousHrReadyAt'[\s\S]*'requesterUserId'[\s\S]*'reason'[\s\S]*'result'/);
  });

  it("exposes only the authenticated amendment RPC and verifies it read-only", () => {
    const signature = "public.ot_request_actual_amendment(uuid, text, uuid)";

    expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
    expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+public\.ot_requests\s+to\s+authenticated/i);
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("Actual amendment RPC contract (Expected = valid)");
    expect(verify).toContain("ot_request_actual_amendment");
    expect(verify).toContain("uuid, text, uuid");
    expect(verify).toContain("security_definer");
    expect(verify).toContain("fixed_search_path");
    expect(verify).toContain("approved_elevated_identity_guard");
    expect(verify).toContain("request_actual_amendment");
    expect(verify).toContain("Actual amendment RPC execute grants (Expected authenticated only)");
  });

  it("enforces the fixed MVP owner and approver identity allowlists", () => {
    const owner = functionSql(sql, "ot_current_user_is_owner");
    const fixedApproverIdentity = functionSql(sql, "ot_user_is_approved_approver_identity");
    const eligibleApprover = functionSql(sql, "ot_current_user_is_eligible_approver");
    const canReadRequest = functionSql(sql, "ot_current_user_can_read_request");
    const setApprover = functionSql(sql, "ot_set_approver");
    const setRole = functionSql(sql, "ot_set_system_role");

    expect(owner).toContain("pg_catalog.lower(pg_catalog.btrim(u.email)) = 'panuwee.w@garena.com'");
    for (const email of ["nithidol.k@garena.com", "weerayut@garena.com", "napol.a@garena.com"]) {
      expect(fixedApproverIdentity).toContain(email);
    }
    expect(eligibleApprover).toContain("public.ot_user_is_approved_approver_identity(u.id)");
    expect(canReadRequest).toMatch(/approver_user_id = \(select auth\.uid\(\)\)[\s\S]*ot_current_user_is_eligible_approver/);
    expect(setApprover).toContain("public.ot_user_is_approved_approver_identity(p_user_id)");
    expect(setRole).toMatch(/p_role_code = 'owner'[\s\S]*panuwee\.w@garena\.com[\s\S]*raise exception/);
    expect(setRole).toMatch(/if not exists \([\s\S]*join public\.users owner_user[\s\S]*panuwee\.w@garena\.com[\s\S]*At least one active approved OT Owner/);
  });

  it("routes individual OT approvals in the database and protects the SeaTalk outbox review boundary", () => {
    const routing = functionSql(sql, "ot_function_approver_id");
    const createRequest = functionSql(sql, "ot_create_request");
    const resubmitPlan = functionSql(sql, "ot_resubmit_plan");
    const applySeaTalkReview = functionSql(sql, "ot_seatalk_apply_review");
    const reviewSignature = "public.ot_seatalk_apply_review(uuid, text, text, text, uuid)";

    for (const [functionCode, email] of Object.entries({
      ops: "nithidol.k@garena.com",
      mkt: "weerayut@garena.com",
      gdve: "weerayut@garena.com",
      esport: "napol.a@garena.com",
    })) {
      expect(routing).toContain(`when '${functionCode}' then '${email}'`);
    }
    expect(routing).toContain("Production SeaTalk routing");
    expect(routing).toContain("join public.ot_approvers a on a.user_id = u.id and a.active = true");
    expect(routing).toContain("u.is_active = true");
    for (const caller of [createRequest, resubmitPlan]) {
      expect(caller).toContain("public.ot_function_approver_id(v_function_code)");
      expect(caller).not.toContain("p_payload->>'approverUserId'");
      expect(caller.indexOf("insert into public.ot_request_audit")).toBeLessThan(
        caller.indexOf("public.ot_enqueue_seatalk_notification(v_request.id, 'plan_approval')"),
      );
    }
    expect(sql).toContain("create table if not exists public.ot_seatalk_notifications");
    expect(sql).toContain("seatalk_message_id text");
    expect(sql).toContain("unique (request_id, notification_kind)");
    expect(sql).toContain("alter table public.ot_seatalk_notifications enable row level security");
    expect(sql).toMatch(/revoke all on table[\s\S]*ot_seatalk_notifications,[\s\S]*from public, anon, authenticated/);
    expect(applySeaTalkReview).not.toContain("public.ot_is_service_role_context()");
    expect(applySeaTalkReview).toContain("v_notification.status not in ('pending', 'dispatching', 'sent', 'failed')");
    expect(applySeaTalkReview).toContain("p_sender_email");
    expect(applySeaTalkReview).toContain("public.ot_apply_plan_review(");
    expect(sql).toContain(`revoke all on function ${reviewSignature} from public, anon, authenticated`);
    expect(sql).toContain(`grant execute on function ${reviewSignature} to service_role`);
    expect(sql).not.toContain(`grant execute on function ${reviewSignature} to authenticated`);
    expect(verify).toContain("SeaTalk OT review RPC contract (Expected service_role only)");
  });

  it("queues a compact Workgrid notification for Team Lead actual verification", () => {
    const submitActual = functionSql(sql, "ot_submit_actual");
    const claimDispatch = functionSql(sql, "ot_seatalk_claim_dispatch");
    const callback = read("supabase", "functions", "seatalk-ot-callback", "index.ts");

    expect(sql).toContain("notification_kind text not null check (notification_kind in ('plan_approval', 'actual_verification'))");
    expect(submitActual).toContain("public.ot_enqueue_seatalk_notification(v_request.id, 'actual_verification')");
    expect(claimDispatch).toContain("n.notification_kind = 'actual_verification'");
    expect(claimDispatch).toContain("'notificationKind', v_notification.notification_kind");
    expect(claimDispatch).toContain("'actualStartAt', v_request.actual_start_at");
    expect(claimDispatch).toContain("'actualEndAt', v_request.actual_end_at");
    expect(callback).toContain('notificationKind: "plan_approval" | "actual_verification"');
    expect(callback).toContain('"น้องๆคอนเฟิร์มเวลา OT แล้ว"');
    expect(callback).toContain("`Request: ${displayText(claim.title)} - ${displayText(claim.reasonCode)}`");
    expect(callback).toContain("Schedule: ${bangkokSchedule(scheduleStart, scheduleEnd)}");
    expect(callback).toContain('text: "Open in Workgrid"');
    expect(verify).toContain("SeaTalk OT actual verification notification contract (Expected queued only after actual submission)");
  });

  it("replays an applied SeaTalk review safely and closes pending SeaTalk actions after direct review", () => {
    const directReview = functionSql(sql, "ot_review_plan");
    const sharedPlanReview = functionSql(sql, "ot_apply_plan_review");
    const applySeaTalkReview = functionSql(sql, "ot_seatalk_apply_review");
    const notificationLock = "from public.ot_seatalk_notifications n";
    const sharedReview = "v_result := public.ot_apply_plan_review(";
    const senderCheck = "SeaTalk sender is not the assigned OT approver";
    const appliedReplay = "if v_notification.status = 'applied' then";
    const pendingGuard = "if v_notification.status not in ('pending', 'dispatching', 'sent', 'failed') then";

    expect(directReview).toContain("for update;");
    expect(directReview.indexOf(notificationLock)).toBeLessThan(directReview.indexOf(sharedReview));
    expect(directReview.indexOf(sharedReview)).toBeLessThan(directReview.indexOf("set status = 'cancelled'"));
    expect(directReview).toContain("where n.request_id = p_request_id");
    expect(directReview).toContain("and n.notification_kind = 'plan_approval'");
    expect(directReview).toContain("and n.status in ('pending', 'dispatching', 'sent', 'failed')");
    expect(directReview).toContain("update public.ot_seatalk_pending_rejections");
    expect(applySeaTalkReview.indexOf(senderCheck)).toBeLessThan(applySeaTalkReview.indexOf(appliedReplay));
    expect(applySeaTalkReview.indexOf(appliedReplay)).toBeLessThan(applySeaTalkReview.indexOf(pendingGuard));
    expect(applySeaTalkReview).toContain("a.actor_user_id = v_approver_user_id");
    expect(applySeaTalkReview).toContain("a.idempotency_key = p_idempotency_key");
    expect(applySeaTalkReview).toContain("return v_result;");
    expect(sharedPlanReview).toMatch(/'decision', p_decision,\s*'result', pg_catalog\.to_jsonb\(v_request\)/);
    expect(sql).toContain("'cancelled'");
    expect(sql).toContain("alter table public.ot_seatalk_notifications drop constraint if exists ot_seatalk_notifications_status_check");
    expect(sql).toMatch(/add constraint ot_seatalk_notifications_status_check\s+check \(status in \('pending', 'dispatching', 'sent', 'failed', 'applied', 'cancelled'\)\)/);
  });

  it("claims and finalizes SeaTalk dispatches through a leased service-role-only contract", () => {
    const claimDispatch = functionSql(sql, "ot_seatalk_claim_dispatch");
    const finishDispatch = functionSql(sql, "ot_seatalk_finish_dispatch");
    const directReview = functionSql(sql, "ot_review_plan");
    const claimSignature = "public.ot_seatalk_claim_dispatch(uuid, uuid)";
    const finishSignature = "public.ot_seatalk_finish_dispatch(uuid, boolean, text, text)";

    expect(sql).toContain("lease_expires_at timestamptz");
    expect(sql).toContain("last_error text");
    expect(sql).toContain("ot_seatalk_notifications_dispatch_key_uidx");
    expect(claimDispatch).not.toContain("public.ot_is_service_role_context()");
    expect(claimDispatch).toMatch(/v_request\.created_by_user_id <> p_actor_id\s+and v_request\.approver_user_id <> p_actor_id/);
    expect(claimDispatch).toContain("for update of n;");
    expect(claimDispatch).toMatch(/v_notification\.status in \('pending', 'failed'\)[\s\S]*v_notification\.status = 'dispatching'[\s\S]*lease_expires_at <= pg_catalog\.clock_timestamp\(\)/);
    expect(claimDispatch).toContain("interval '5 minutes'");
    expect(claimDispatch).toContain("attempt_count = attempt_count + 1");
    for (const safeField of [
      "notificationId", "dispatchKey", "leaseExpiresAt", "notificationKind", "recipientEmail", "recipientDisplayName",
      "requestId", "employeeEmail", "employeeDisplayName", "functionCode", "title", "dayType",
      "workLocationType", "venue", "reasonCode", "reasonDetail", "plannedStartAt", "plannedEndAt",
      "plannedBreakMinutes", "plannedMinutes", "actualStartAt", "actualEndAt",
    ]) {
      expect(claimDispatch).toContain(`'${safeField}'`);
    }
    expect(claimDispatch).not.toMatch(/pg_catalog\.to_jsonb\(v_request\)|employee_consent|compliance_outcome/);
    expect(finishDispatch).not.toContain("public.ot_is_service_role_context()");
    expect(finishDispatch).toMatch(/where dispatch_key = p_dispatch_key\s+and status = 'dispatching'/);
    expect(finishDispatch).toContain("if found then");
    expect(finishDispatch).toMatch(/status in \('sent', 'failed'\)[\s\S]*dispatch_key = p_dispatch_key/);
    expect(directReview).toContain("status in ('pending', 'dispatching', 'sent', 'failed')");
    for (const signature of [claimSignature, finishSignature]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function ${signature} to service_role`);
      expect(sql).not.toContain(`grant execute on function ${signature} to authenticated`);
    }
    expect(verify).toContain("SeaTalk OT dispatch RPC contract (Expected leased grant-gated service role and compare-and-set finish)");
  });

  it("persists sender-bound expiring SeaTalk rejections and applies one locked decision", () => {
    const beginRejection = functionSql(sql, "ot_seatalk_begin_rejection");
    const applyReason = functionSql(sql, "ot_seatalk_apply_rejection_reason");
    const beginSignature = "public.ot_seatalk_begin_rejection(uuid, text, uuid)";
    const applySignature = "public.ot_seatalk_apply_rejection_reason(text, text, uuid)";

    expect(sql).toContain("create table if not exists public.ot_seatalk_pending_rejections");
    expect(sql).toContain("sender_email text not null");
    expect(sql).toContain("expires_at timestamptz not null");
    expect(sql).toContain("apply_event_idempotency_key uuid");
    expect(sql).toContain("ot_seatalk_pending_rejections_sender_pending_uidx");
    expect(sql).toContain("alter table public.ot_seatalk_pending_rejections enable row level security");
    expect(sql).toMatch(/revoke all on table[\s\S]*ot_seatalk_pending_rejections from public, anon, authenticated/);
    expect(beginRejection).not.toContain("public.ot_is_service_role_context()");
    expect(beginRejection).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(beginRejection).toContain("SeaTalk sender is not the assigned OT approver");
    expect(beginRejection).toContain("interval '10 minutes'");
    expect(beginRejection).toMatch(/status = 'pending'[\s\S]*expires_at > pg_catalog\.clock_timestamp\(\)/);
    expect(beginRejection).toMatch(/v_action\.begin_event_idempotency_key = p_event_idempotency_key[\s\S]*SeaTalk OT rejection begin event is no longer active/);
    expect(applyReason).not.toContain("public.ot_is_service_role_context()");
    expect(applyReason).toContain("nullif(pg_catalog.btrim(coalesce(p_reason, '')), '')");
    expect(applyReason).toContain("a.sender_email = v_sender_email");
    expect(applyReason).toContain("a.apply_event_idempotency_key = p_event_idempotency_key");
    expect(applyReason).toMatch(/public\.ot_apply_plan_review\(\s*v_notification\.request_id,\s*'rejected',\s*v_reason,\s*p_event_idempotency_key,/);
    expect(applyReason).toMatch(/set status = 'applied',[\s\S]*apply_event_idempotency_key = p_event_idempotency_key[\s\S]*consumed_at = now\(\)/);
    for (const signature of [beginSignature, applySignature]) {
      expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
      expect(sql).toContain(`grant execute on function ${signature} to service_role`);
      expect(sql).not.toContain(`grant execute on function ${signature} to authenticated`);
    }
    expect(verify).toContain("SeaTalk OT pending rejection contract (Expected expiring sender binding and service_role only)");
    expect(sql).not.toMatch(/sk_(?:live|test)_[a-z0-9]+|sb_secret_[a-z0-9]+|ghp_[a-z0-9]+|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|authorization\s*[:=]\s*['\"]bearer/i);
  });

  it("keeps direct SeaTalk review approval-only so rejection must use the reason gate", () => {
    const applySeaTalkReview = functionSql(sql, "ot_seatalk_apply_review");
    const decisionGuard = "if p_decision is distinct from 'approved' then";
    const notificationLock = "select * into v_notification";

    expect(applySeaTalkReview).toContain(decisionGuard);
    expect(applySeaTalkReview).toContain("SeaTalk direct review supports approval only; use the rejection reason workflow");
    expect(applySeaTalkReview.indexOf(decisionGuard)).toBeLessThan(applySeaTalkReview.indexOf(notificationLock));
    expect(applySeaTalkReview).toMatch(/public\.ot_apply_plan_review\(\s*v_notification\.request_id,\s*'approved',/);
    expect(verify).toContain("SeaTalk direct review decision gate (Expected approval only)");
  });

  it("requeues a leased or sent notification and invalidates the old sender during reassignment", () => {
    const reassign = functionSql(sql, "ot_reassign_pending_approver");
    const notificationLock = "for update of n;";
    const approverLock = "for update of a;";
    const requestLock = "for update of r";
    const cancelPending = "update public.ot_seatalk_pending_rejections";
    const resetNotification = "update public.ot_seatalk_notifications";
    const beginRejection = functionSql(sql, "ot_seatalk_begin_rejection");

    expect(reassign).toMatch(/from public\.ot_seatalk_notifications n\s+join public\.ot_requests r[\s\S]*r\.approver_user_id = p_from_user_id[\s\S]*for update of n;/);
    expect(reassign.indexOf(notificationLock)).toBeLessThan(reassign.indexOf(approverLock));
    expect(reassign.indexOf(approverLock)).toBeLessThan(reassign.indexOf(requestLock));
    expect(reassign.indexOf(cancelPending)).toBeLessThan(reassign.indexOf(resetNotification));
    expect(reassign).toMatch(/set status = 'cancelled'[\s\S]*where notification_id = v_notification_id[\s\S]*and status = 'pending'/);
    expect(reassign).toMatch(/set status = case\s+when v_request\.status = 'pending_approval' then 'pending'\s+else 'cancelled'\s+end/);
    for (const reset of ["seatalk_message_id = null", "dispatch_key = null", "lease_expires_at = null", "last_error = null"]) {
      expect(reassign).toContain(reset);
    }
    expect(beginRejection).toMatch(/v_action\.sender_email is distinct from v_sender_email[\s\S]*set status = 'cancelled'[\s\S]*where id = v_action\.id/);
    expect(verify).toContain("OT approver reassignment SeaTalk reset (Expected notification-first lock and requeue)");
  });

  it("returns an exact applied rejection replay before considering a newer pending action", () => {
    const applyReason = functionSql(sql, "ot_seatalk_apply_rejection_reason");
    const exactReplay = "a.apply_event_idempotency_key = p_event_idempotency_key";
    const replayReturn = "return v_result;";
    const pendingLookup = "a.status = 'pending'";

    expect(applyReason).toMatch(/select a\.result into v_result[\s\S]*a\.sender_email = v_sender_email[\s\S]*a\.status = 'applied'[\s\S]*a\.apply_event_idempotency_key = p_event_idempotency_key/);
    expect(applyReason.indexOf(exactReplay)).toBeLessThan(applyReason.indexOf(replayReturn));
    expect(applyReason.indexOf(replayReturn)).toBeLessThan(applyReason.indexOf(pendingLookup));
    expect(applyReason).not.toContain("order by case when a.status = 'pending' then 0 else 1 end");
    expect(verify).toContain("SeaTalk rejection replay precedence (Expected applied event before active pending)");
  });

  it("accepts only a matching terminal dispatch replay payload", () => {
    const finishDispatch = functionSql(sql, "ot_seatalk_finish_dispatch");

    expect(finishDispatch).toMatch(/select n\.status, n\.seatalk_message_id, n\.last_error[\s\S]*into v_status, v_stored_message_id, v_stored_error/);
    expect(finishDispatch).toContain("v_stored_message_id is distinct from v_message_id");
    expect(finishDispatch).toContain("v_status <> (case when p_succeeded then 'sent' else 'failed' end) then");
    expect(finishDispatch).toContain("SeaTalk OT dispatch result conflicts with the stored message identifier");
    expect(finishDispatch).toContain("v_stored_error is distinct from v_expected_error");
    expect(finishDispatch).toContain("SeaTalk OT dispatch result conflicts with the stored failure detail");
    expect(verify).toContain("SeaTalk terminal dispatch replay identity (Expected matching status, message ID, and failure detail)");
  });

  it("rejects unauthorized HR admin activation at the server boundary", () => {
    const setRole = functionSql(sql, "ot_set_system_role");

    expect(setRole).toMatch(
      /if p_role_code = 'hr_admin'\s+and p_active = true\s+and not public\.ot_user_is_approved_approver_identity\(p_user_id\) then\s+raise exception 'HR Admin must be one of the three approved MVP identities'/,
    );
    expect(setRole.indexOf("p_role_code = 'hr_admin'")).toBeLessThan(
      setRole.indexOf("public.ot_lock_idempotency('set_system_role', p_idempotency_key)"),
    );
  });

  it("permits unauthorized HR admin deactivation through the audited role path", () => {
    const setRole = functionSql(sql, "ot_set_system_role");

    expect(setRole).toMatch(/if p_role_code = 'hr_admin'\s+and p_active = true\s+and not public\.ot_user_is_approved_approver_identity/);
    expect(setRole).toMatch(/insert into public\.ot_system_roles[\s\S]*values \(p_user_id, p_role_code, p_active\)[\s\S]*v_actor_id, 'set_system_role', v_result, pg_catalog\.btrim\(p_reason\), p_idempotency_key/);
  });

  it("keeps legacy HR Admin deactivation reachable when the target is inactive or no longer Garena", () => {
    const setRole = functionSql(sql, "ot_set_system_role");
    const activationStart = setRole.indexOf("if p_active then");
    const activationEnd = setRole.indexOf("perform public.ot_lock_idempotency('set_system_role', p_idempotency_key)", activationStart);
    const deactivationStart = setRole.indexOf("if not p_active then");
    const deactivationEnd = setRole.indexOf("insert into public.ot_system_roles", deactivationStart);
    const activationGuard = setRole.slice(activationStart, activationEnd);
    const deactivationGuard = setRole.slice(deactivationStart, deactivationEnd);

    expect(activationStart).toBeGreaterThan(-1);
    expect(activationGuard).toMatch(/where u\.id = p_user_id and u\.is_active = true[\s\S]*not like '%@garena\.com'/);
    expect(activationGuard).toMatch(/p_role_code = 'hr_admin'[\s\S]*p_active = true[\s\S]*ot_user_is_approved_approver_identity\(p_user_id\)/);
    expect(deactivationStart).toBeGreaterThan(activationEnd);
    expect(deactivationGuard).toMatch(/p_role_code <> 'hr_admin'[\s\S]*existing HR Admin role can be deactivated/);
    expect(deactivationGuard).toMatch(/v_previous->>'role_code' <> 'hr_admin'/);
    expect(deactivationGuard).toMatch(/from public\.ot_system_roles r[\s\S]*for update/);
    expect(setRole).toContain("A non-empty reason is required");
    expect(setRole).toContain("public.ot_lock_idempotency('set_system_role', p_idempotency_key)");
  });

  it("keeps approved HR admin activation and deactivation on the audited role path", () => {
    const setRole = functionSql(sql, "ot_set_system_role");

    expect(setRole).toMatch(/p_active = true\s+and not public\.ot_user_is_approved_approver_identity\(p_user_id\)/);
    expect(setRole).toContain("'active', p_active");
    expect(setRole).toContain("v_actor_id, 'set_system_role', v_result, pg_catalog.btrim(p_reason), p_idempotency_key");
  });

  it("acquires export employee-week locks in one global order before row locks", () => {
    const lockKeys = functionSql(sql, "ot_lock_employee_week_keys");
    const markExported = functionSql(sql, "ot_mark_exported");

    expect(lockKeys).toMatch(/order by[\s\S]*employeeUserId[\s\S]*weekStart/);
    expect(markExported).toContain("v_lock_keys");
    expect(markExported).toContain("public.ot_lock_employee_week_keys(v_lock_keys)");
    expect(markExported.indexOf("public.ot_lock_employee_week_keys(v_lock_keys)")).toBeLessThan(markExported.indexOf("for update"));
  });

  it("locks the sorted union of old and new weeks before actual replacement", () => {
    const submit = functionSql(sql, "ot_submit_actual");

    expect(submit).toContain("v_lock_segments");
    expect(submit).toMatch(/planned_week_segments[\s\S]*actual_week_segments[\s\S]*v_segments[\s\S]*jsonb_agg/);
    expect(submit).toContain("public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments)");
  });

  it("counts submitted actual segments or requested segments exactly once", () => {
    const counted = functionSql(sql, "ot_counted_week_minutes_unchecked");

    expect(counted).toContain("returns integer");
    expect(counted).toMatch(
      /jsonb_array_elements\(\s*case\s+when r\.actual_submitted_at is not null and r\.actual_week_segments is not null\s+then r\.actual_week_segments\s+else r\.planned_week_segments\s+end\s*\) segment/,
    );
    expect(counted).toMatch(
      /r\.status in \([\s\S]*'pending_approval'[\s\S]*'hr_ready'[\s\S]*'exported'[\s\S]*\)\s+or \(r\.status = 'revision_required' and r\.actual_submitted_at is not null\)/,
    );
    for (const excluded of ["draft", "rejected", "cancelled"]) {
      expect(counted).not.toContain(`'${excluded}'`);
    }
  });

  it("routes every weekly policy decision through canonical counted minutes", () => {
    const assertLimit = functionSql(sql, "ot_assert_planned_limit");
    const previewEvent = functionSql(sql, "ot_preview_event_plan");
    const submitActual = functionSql(sql, "ot_submit_actual");

    expect(assertLimit).toContain("public.ot_counted_week_minutes_unchecked(");
    expect(assertLimit).not.toContain("public.ot_projected_week_minutes_unchecked(");
    expect(previewEvent).toContain("public.ot_counted_week_minutes_unchecked(");
    expect(previewEvent).not.toContain("public.ot_projected_week_minutes_unchecked(");
    expect(submitActual).toContain("public.ot_counted_week_minutes_unchecked(");
    expect(submitActual).not.toContain("public.ot_actual_week_minutes(");
    for (const caller of ["ot_create_request", "ot_create_event_plan", "ot_record_consent", "ot_apply_plan_review"]) {
      expect(functionSql(sql, caller)).toContain("public.ot_assert_planned_limit(");
    }
  });

  it("uses submitted actual segments for late consent and planned segments before actual submission", () => {
    const consent = functionSql(sql, "ot_record_consent");

    expect(consent).toContain("v_counted_segments jsonb");
    expect(consent).toMatch(
      /v_counted_segments := case\s+when v_request\.actual_submitted_at is not null and v_request\.actual_week_segments is not null\s+then v_request\.actual_week_segments\s+else v_request\.planned_week_segments\s+end/,
    );
    expect(consent).toContain("public.ot_lock_employee_weeks(v_request.employee_user_id, v_counted_segments)");
    expect(consent).toContain(
      "public.ot_assert_planned_limit(v_request.employee_user_id, v_counted_segments, v_request.id)",
    );
  });

  it("serializes consent with actual submission before selecting counted segments", () => {
    const consent = functionSql(sql, "ot_record_consent");
    const submitActual = functionSql(sql, "ot_submit_actual");
    const requestLock = "pg_catalog.hashtextextended('ot-request:' || p_request_id::text, 2)";
    const requestLockIndex = consent.indexOf(requestLock);
    const firstRequestSelectIndex = consent.indexOf(
      "select * into v_request from public.ot_requests r where r.id = p_request_id",
    );
    const segmentChoiceIndex = consent.indexOf("v_counted_segments := case");
    const employeeWeekLockIndex = consent.indexOf(
      "public.ot_lock_employee_weeks(v_request.employee_user_id, v_counted_segments)",
    );
    const rowLockIndex = consent.indexOf(
      "select * into v_request from public.ot_requests r where r.id = p_request_id for update",
    );

    expect(submitActual).toContain(requestLock);
    expect(requestLockIndex).toBeGreaterThan(-1);
    expect(consent.indexOf("public.ot_lock_idempotency('record_consent', p_idempotency_key)")).toBeLessThan(requestLockIndex);
    expect(requestLockIndex).toBeLessThan(firstRequestSelectIndex);
    expect(firstRequestSelectIndex).toBeLessThan(segmentChoiceIndex);
    expect(segmentChoiceIndex).toBeLessThan(employeeWeekLockIndex);
    expect(employeeWeekLockIndex).toBeLessThan(rowLockIndex);
  });

  it("checks a replacement actual against canonical history while all affected weeks are locked", () => {
    const submit = functionSql(sql, "ot_submit_actual");

    expect(submit).toMatch(
      /planned_week_segments[\s\S]*actual_week_segments[\s\S]*jsonb_array_elements\(v_segments\)[\s\S]*jsonb_agg/,
    );
    expect(submit.indexOf("public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments)")).toBeLessThan(
      submit.indexOf("public.ot_counted_week_minutes_unchecked("),
    );
    expect(submit).toMatch(
      /public\.ot_counted_week_minutes_unchecked\(v_request\.employee_user_id, v_week, v_request\.id\)\s*\+ \(v_segment->>'minutes'\)::integer/,
    );
  });

  it("returns canonical counted minutes beside descriptive dashboard totals", () => {
    const dashboard = functionSql(sql, "ot_get_my_dashboard");

    expect(dashboard).toContain("public.ot_projected_week_minutes(v_actor_id, p_week_start, null)");
    expect(dashboard).toContain("public.ot_actual_week_minutes(v_actor_id, p_week_start, null)");
    expect(dashboard).toContain("public.ot_counted_week_minutes_unchecked(v_actor_id, p_week_start, null)");
    expect(dashboard).toMatch(/'plannedMinutes', v_planned[\s\S]*'actualMinutes', v_actual[\s\S]*'countedMinutes', v_counted/);
    expect(dashboard).toContain("'remainingPlannedMinutes', greatest(0, 2160 - v_counted)");
  });

  it("keeps weekly accounting helpers private", () => {
    expect(sql).toContain(
      "revoke all on function public.ot_projected_week_minutes(uuid, date, uuid) from public, anon, authenticated",
    );
    expect(sql).not.toContain(
      "grant execute on function public.ot_projected_week_minutes(uuid, date, uuid) to authenticated",
    );
    expect(sql).toContain(
      "revoke all on function public.ot_counted_week_minutes_unchecked(uuid, date, uuid) from public, anon, authenticated",
    );
    expect(sql).not.toContain(
      "grant execute on function public.ot_counted_week_minutes_unchecked(uuid, date, uuid) to authenticated",
    );
  });

  it("verifies canonical accounting metadata without database writes", () => {
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("Canonical OT counted-week helper (Expected = 1)");
    expect(verify).toContain("public.ot_counted_week_minutes_unchecked(uuid, date, uuid)");
    expect(verify).toContain("Personal OT dashboard countedMinutes key (Expected = true)");
    expect(verify).toContain("Authenticated projected-total execute access (Expected = false)");
    expect(verify).toContain("has_function_privilege(");
  });

  it("keeps pre-work revisions out of the server plan-review transition", () => {
    const reviewPlan = functionSql(sql, "ot_apply_plan_review");
    const firstGuard = reviewPlan.slice(0, reviewPlan.indexOf("public.ot_lock_employee_weeks"));
    const lockedGuard = reviewPlan.slice(reviewPlan.indexOf("for update"), reviewPlan.indexOf("update public.ot_requests"));

    expect(firstGuard).toContain("v_request.status <> 'pending_approval'");
    expect(lockedGuard).toContain("v_request.status <> 'pending_approval'");
    expect(reviewPlan).not.toMatch(/status not in \('pending_approval', 'revision_required'\)/);
  });

  it("rejects approval and consent that become non-future after their ordered locks while preserving replay", () => {
    const reviewPlan = functionSql(sql, "ot_apply_plan_review");
    const recordConsent = functionSql(sql, "ot_record_consent");
    const reviewRequestLock = "select * into v_request from public.ot_requests r where r.id = p_request_id for update;";
    const consentRequestLock = "select * into v_request from public.ot_requests r where r.id = p_request_id for update;";
    const reviewFutureGuard = "if p_decision = 'approved' and v_request.planned_start_at <= pg_catalog.clock_timestamp() then";
    const consentFutureGuard = "if p_accept and v_request.planned_start_at <= pg_catalog.clock_timestamp() then";

    const markerIndex = (source: string, marker: string) => {
      const index = source.indexOf(marker);
      expect(index, `missing transition marker: ${marker}`).toBeGreaterThan(-1);
      return index;
    };
    const reviewReplayIndex = markerIndex(reviewPlan, "a.action = 'review_plan' and a.idempotency_key = p_idempotency_key");
    const consentReplayIndex = markerIndex(recordConsent, "a.action = 'record_consent' and a.idempotency_key = p_idempotency_key");
    const reviewRequestLockIndex = markerIndex(reviewPlan, reviewRequestLock);
    const consentRequestLockIndex = markerIndex(recordConsent, consentRequestLock);
    const reviewFutureGuardIndex = markerIndex(reviewPlan, reviewFutureGuard);
    const consentFutureGuardIndex = markerIndex(recordConsent, consentFutureGuard);
    const reviewUpdateIndex = markerIndex(reviewPlan, "update public.ot_requests");
    const consentUpdateIndex = markerIndex(recordConsent, "update public.ot_requests");

    expect(reviewReplayIndex).toBeLessThan(reviewFutureGuardIndex);
    expect(consentReplayIndex).toBeLessThan(consentFutureGuardIndex);
    expect(reviewRequestLockIndex).toBeLessThan(reviewFutureGuardIndex);
    expect(consentRequestLockIndex).toBeLessThan(consentFutureGuardIndex);
    expect(reviewFutureGuardIndex).toBeLessThan(reviewUpdateIndex);
    expect(consentFutureGuardIndex).toBeLessThan(consentUpdateIndex);
    expect(reviewPlan.slice(reviewFutureGuardIndex, reviewUpdateIndex))
      .toContain("Planned OT start must remain in the future for approval");
    expect(recordConsent.slice(consentFutureGuardIndex, consentUpdateIndex))
      .toContain("Planned OT start must remain in the future for consent acceptance");
    expect(reviewPlan).not.toMatch(/p_decision in \('approved', 'rejected', 'revision_required'\)[\s\S]*planned_start_at <= pg_catalog\.clock_timestamp\(\)[\s\S]*raise exception/);
    expect(recordConsent).not.toMatch(/p_accept is not null[\s\S]*planned_start_at <= pg_catalog\.clock_timestamp\(\)[\s\S]*raise exception/);
    expect(verify).toContain("OT pre-work post-lock transition guard contract (Expected = valid)");
    expect(read("supabase", "README.md")).toContain("hold the request row lock until the planned start is equal or past");
    expect(read("supabase", "README.md")).toContain("the same committed idempotency key must replay the original result even after the planned start");
  });

  it("makes the read-only transition verifier fail closed when a target function or ordering marker is absent", () => {
    const contractStart = verify.indexOf("with expected_transition_functions(function_name, argument_types, replay_marker, future_guard_marker)");
    const contractEnd = verify.indexOf("OT access admin identity directory contract (Expected = valid)");
    expect(contractStart).toBeGreaterThan(-1);
    expect(contractEnd).toBeGreaterThan(contractStart);
    const contract = verify.slice(contractStart, contractEnd);

    expect(contract).toContain("OT pre-work post-lock transition guard contract (Expected = valid)");
    expect(Array.from(
      contract.matchAll(/^\s*\(\s*'(ot_(?:apply_plan_review|record_consent))'/gm),
      match => match[1],
    )).toEqual(["ot_apply_plan_review", "ot_record_consent"]);
    expect(contract).toContain("left join pg_catalog.pg_proc p");
    expect(contract).toContain("pg_catalog.count(*) over () = 2 as exact_target_check_rows");
    expect(contract).toContain("function_oid is not null as function_present");
    for (const marker of ["replay_position", "request_lock_position", "future_guard_position", "update_position"]) {
      expect(contract).toContain(`${marker} > 0`);
    }
    expect(contract).toMatch(/m\.replay_position > 0[\s\S]*m\.future_guard_position > 0[\s\S]*m\.replay_position < m\.future_guard_position/);
    expect(contract).toMatch(/m\.request_lock_position > 0[\s\S]*m\.future_guard_position > 0[\s\S]*m\.request_lock_position < m\.future_guard_position/);
    expect(contract).toMatch(/m\.future_guard_position > 0[\s\S]*m\.update_position > 0[\s\S]*m\.future_guard_position < m\.update_position/);
  });

  it("defines an Owner-only fixed access directory without widening event participants", () => {
    const directory = functionSql(sql, "ot_list_access_admin_identities");
    const eventPeople = functionSql(sql, "ot_list_people_for_event");
    const signature = "public.ot_list_access_admin_identities()";

    expect(directory).toContain("if not public.ot_current_user_is_owner() then");
    expect(directory).toContain("Only the OT Owner can list access administration identities");
    expect(directory).toContain("from (values");
    for (const [label, email] of [["Big", "nithidol.k@garena.com"], ["Mac", "weerayut@garena.com"], ["Pluem", "napol.a@garena.com"]]) {
      expect(directory).toContain(`'${label}', '${email}'`);
    }
    for (const field of ["'displayLabel'", "'email'", "'userId'", "'isWorkgridActive'", "'isApproverActive'", "'isHrAdminActive'"]) {
      expect(directory).toContain(field);
    }
    expect(directory).toContain("left join public.users u");
    expect(directory).toContain("left join public.ot_approvers a");
    expect(directory).toContain("left join public.ot_system_roles r");
    expect(eventPeople).toContain("where u.is_active = true");
    expect(eventPeople).not.toContain("ot_list_access_admin_identities");
    expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
    expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    expect(verify).toContain("OT access admin identity directory contract (Expected = valid)");
    expect(verify).toContain("OT access admin identity directory execute grants (Expected authenticated only)");
  });

  it("resubmits only an employee-owned individual pre-work revision under ordered locks", () => {
    const resubmit = functionSql(sql, "ot_resubmit_plan");
    const requestLock = "pg_catalog.hashtextextended('ot-request:' || p_request_id::text, 2)";
    const unionLock = "public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments)";
    const rowLock = "select * into v_request from public.ot_requests r where r.id = p_request_id for update";
    const updateStart = resubmit.indexOf("update public.ot_requests");
    const updateEnd = resubmit.indexOf("where id = p_request_id", updateStart);
    const updateClause = resubmit.slice(updateStart, updateEnd);

    expect(resubmit).toContain("returns jsonb");
    expect(resubmit).toContain("security definer");
    expect(resubmit).toContain("set search_path = ''");
    expect(resubmit).toContain("public.ot_lock_idempotency('resubmit_plan', p_idempotency_key)");
    expect(resubmit.indexOf(requestLock)).toBeLessThan(resubmit.indexOf(unionLock));
    expect(resubmit.indexOf(unionLock)).toBeLessThan(resubmit.indexOf(rowLock));
    expect(resubmit).toContain("v_request.planned_week_segments || v_segments");
    expect(resubmit).toContain("select distinct coalesce(item->>'weekStart', item->>'week_start')::date as week_start");
    expect(resubmit).toContain("order by week_start");
    expect(resubmit).toMatch(/employee_user_id <> v_actor_id[\s\S]*source <> 'employee_request'[\s\S]*raise exception/);
    expect(resubmit).toMatch(/status <> 'revision_required'[\s\S]*actual_submitted_at is not null[\s\S]*plan_decision is distinct from 'revision_required'[\s\S]*raise exception/);
    expect(resubmit).toContain("public.ot_assert_planned_limit(v_actor_id, v_segments, p_request_id)");
    expect(resubmit).toContain("public.ot_assert_no_employee_overlap(v_actor_id, v_start_at, v_end_at, p_request_id)");
    for (const reset of [
      "status = 'pending_approval'",
      "plan_decision = null",
      "plan_decision_note = null",
      "plan_reviewed_by_user_id = null",
      "plan_reviewed_at = null",
      "employee_consent = 'accepted'",
      "consent_statement_version = v_consent_statement_version",
      "employee_consented_at = now()",
    ]) expect(updateClause).toContain(reset);
    expect(resubmit).toMatch(/action = 'resubmit_plan'[\s\S]*idempotency_key = p_idempotency_key[\s\S]*return v_replay_result/);
    expect(resubmit).toMatch(/'oldPlan'[\s\S]*'newPlan'[\s\S]*'oldApproverUserId'[\s\S]*'newApproverUserId'[\s\S]*'consentStatementVersion'[\s\S]*'result'/);
  });

  it("rejects overlap against another counted actual-or-requested occurrence", () => {
    const overlap = functionSql(sql, "ot_assert_no_employee_overlap");

    expect(overlap).toMatch(/actual_submitted_at is not null[\s\S]*actual_start_at[\s\S]*else r\.planned_start_at/);
    expect(overlap).toMatch(/actual_submitted_at is not null[\s\S]*actual_end_at[\s\S]*else r\.planned_end_at/);
    expect(overlap).toContain("p_exclude_request_id is null or r.id <> p_exclude_request_id");
    expect(overlap).toMatch(/status in \([\s\S]*'pending_approval'[\s\S]*'exported'[\s\S]*\)[\s\S]*or \(r\.status = 'revision_required' and r\.actual_submitted_at is not null\)/);
    for (const excluded of ["draft", "rejected", "cancelled"]) expect(overlap).not.toContain(`'${excluded}'`);
    expect(overlap).toContain("raise exception 'OT occurrence overlaps another counted request'");
  });

  it("exposes and verifies only the authenticated plan-resubmission RPC", () => {
    const signature = "public.ot_resubmit_plan(uuid, jsonb, text, uuid)";

    expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
    expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    expect(sql).toContain("revoke all on function public.ot_assert_no_employee_overlap(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated");
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("Plan resubmission RPC contract (Expected = valid)");
    for (const fact of ["ot_resubmit_plan", "uuid, jsonb, text, uuid", "security_definer", "fixed_search_path", "employee_state_guard", "request_lock", "week_union_lock", "resubmit_plan", "ot_assert_no_employee_overlap"]) expect(verify).toContain(fact);
    expect(verify).toContain("Plan resubmission RPC execute grants (Expected authenticated only)");
  });

  it("checks individual, event, revised, and actual intervals for overlap only after ordered employee-week locks", () => {
    const createRequest = functionSql(sql, "ot_create_request");
    const createEvent = functionSql(sql, "ot_create_event_plan");
    const resubmitPlan = functionSql(sql, "ot_resubmit_plan");
    const submitActual = functionSql(sql, "ot_submit_actual");
    const overlapCall = "public.ot_assert_no_employee_overlap(";

    for (const caller of [createRequest, createEvent, resubmitPlan, submitActual]) {
      expect(caller).toContain(overlapCall);
      const lockIndex = Math.max(
        caller.lastIndexOf("public.ot_lock_employee_weeks(", caller.indexOf(overlapCall)),
        caller.lastIndexOf("public.ot_assert_planned_limit(", caller.indexOf(overlapCall)),
      );
      expect(lockIndex).toBeGreaterThan(-1);
      expect(lockIndex).toBeLessThan(caller.indexOf(overlapCall));
    }
    expect(submitActual).toContain("public.ot_assert_no_employee_overlap(v_request.employee_user_id, v_start_at, v_end_at, p_request_id)");
  });

  it("normalizes manager decision notes once and requires evidence for negative and compliance approvals", () => {
    const reviewPlan = functionSql(sql, "ot_apply_plan_review");
    const verifyActual = functionSql(sql, "ot_verify_actual");

    for (const decision of [reviewPlan, verifyActual]) {
      expect(decision).toMatch(/v_note text := nullif\(pg_catalog\.btrim\(coalesce\(p_note, ''\)\), ''\)/);
      expect(decision).toMatch(/note, idempotency_key[\s\S]*v_note, p_idempotency_key/);
      expect(decision).not.toMatch(/note, idempotency_key[\s\S]*p_note, p_idempotency_key/);
    }
    expect(reviewPlan).toMatch(/p_decision in \('rejected', 'revision_required'\)[\s\S]*v_note is null[\s\S]*note is required/i);
    expect(verifyActual).toMatch(/p_decision in \('rejected', 'revision_required'\)[\s\S]*v_note is null[\s\S]*note is required/i);
    expect(verifyActual).toMatch(/p_decision = 'approved'[\s\S]*v_request\.compliance_required[\s\S]*v_note is null[\s\S]*note is required/i);
  });

  it("serializes approver authority before week locks and rechecks it after the request row lock", () => {
    for (const name of ["ot_apply_plan_review", "ot_verify_actual"]) {
      const decision = functionSql(sql, name);
      const authorityLock = "for key share of a";
      const weekLock = "perform public.ot_lock_employee_weeks(";
      const requestLock = "select * into v_request from public.ot_requests r where r.id = p_request_id for update;";

      expect(decision).toContain(authorityLock);
      expect(decision.indexOf(authorityLock)).toBeLessThan(decision.indexOf(weekLock));
      expect(decision.indexOf(weekLock)).toBeLessThan(decision.indexOf(requestLock));

      const afterRequestLock = decision.slice(decision.indexOf(requestLock) + requestLock.length);
      if (name === "ot_apply_plan_review") {
        expect(afterRequestLock).toMatch(/v_request\.approver_user_id <> p_actor_id/);
        expect(afterRequestLock).toContain("not exists (");
      } else {
        expect(afterRequestLock).toMatch(/v_request\.approver_user_id <> v_actor_id/);
        expect(afterRequestLock).toMatch(/not public\.ot_current_user_is_eligible_approver\(\)/);
      }
    }

    expect(verify).toContain("OT decision authority serialization contract (Expected = valid)");
    expect(verify).toContain("refreshed_assignment_guard");
    expect(verify).toContain("refreshed_eligibility_guard");
    expect(read("supabase", "README.md")).toContain("there must be no decision audit by a no-longer-assigned or inactive approver and no deadlock");
  });

  it("backfills immutable normalized audit actor email and derives every inserted snapshot in a trigger", () => {
    const snapshotTrigger = functionSql(sql, "ot_set_audit_actor_email_snapshot");

    expect(sql).toContain("actor_email_snapshot text");
    expect(sql).toContain("add column if not exists actor_email_snapshot text");
    expect(sql).toMatch(/update public\.ot_request_audit a[\s\S]*actor_email_snapshot = nullif\(pg_catalog\.lower\(pg_catalog\.btrim\(u\.email\)\), ''\)[\s\S]*from public\.users u[\s\S]*u\.id = a\.actor_user_id[\s\S]*a\.actor_email_snapshot is null/);
    expect(sql).toMatch(/alter table public\.ot_request_audit[\s\S]*alter column actor_email_snapshot set not null/);
    expect(snapshotTrigger).toMatch(/select nullif\(pg_catalog\.lower\(pg_catalog\.btrim\(u\.email\)\), ''\)[\s\S]*into v_actor_email[\s\S]*u\.id = new\.actor_user_id/);
    expect(snapshotTrigger).toMatch(/if v_actor_email is null[\s\S]*raise exception[\s\S]*new\.actor_email_snapshot := v_actor_email/);
    expect(sql).toMatch(/create trigger ot_request_audit_actor_email_snapshot[\s\S]*before insert on public\.ot_request_audit/);
    expect(sql).toContain("revoke all on function public.ot_set_audit_actor_email_snapshot() from public, anon, authenticated");
    expect(verify).toContain("OT audit actor email snapshot column (Expected = NOT NULL)");
    expect(verify).toContain("OT audit actor email snapshot trigger (Expected = enabled)");
    expect(verify).toContain("Invalid OT audit actor email snapshots (Expected = 0)");
  });

  it("reassigns every non-final approver workflow atomically and blocks unsafe deactivation", () => {
    const reassign = functionSql(sql, "ot_reassign_pending_approver");
    const setApprover = functionSql(sql, "ot_set_approver");
    const pendingStatuses = [
      "pending_approval", "awaiting_consent", "approved", "revision_required",
      "actual_confirmation_required", "pending_actual_verification", "compliance_review_required",
    ];

    expect(reassign).toContain("public.ot_current_user_is_owner()");
    expect(reassign).toContain("public.ot_user_is_approved_approver_identity(p_to_user_id)");
    expect(reassign).toMatch(/p_from_user_id = p_to_user_id[\s\S]*raise exception/);
    expect(reassign).toMatch(/from public\.ot_approvers a[\s\S]*a\.user_id in \(p_from_user_id, p_to_user_id\)[\s\S]*order by a\.user_id[\s\S]*for update/);
    expect(reassign).toMatch(/p_to_user_id[\s\S]*a\.active = true[\s\S]*u\.is_active = true/);
    for (const status of pendingStatuses) {
      expect(reassign).toContain(`'${status}'`);
      expect(setApprover).toContain(`'${status}'`);
    }
    const updateStart = reassign.indexOf("for v_request in");
    const updateEnd = reassign.indexOf("order by r.id", updateStart);
    for (const finalStatus of ["draft", "rejected", "hr_ready", "exported", "cancelled"]) {
      expect(reassign.slice(updateStart, updateEnd)).not.toContain(`'${finalStatus}'`);
    }
    expect(reassign).toMatch(/order by r\.id[\s\S]*for update of r/);
    expect(reassign).toMatch(/update public\.ot_requests[\s\S]*approver_user_id = p_to_user_id/);
    expect(reassign).toContain("'reassign_pending_approver'");
    expect(reassign).toContain("'reassign_pending_approver_admin'");
    expect(reassign).toMatch(/changed_fields->'result'[\s\S]*return v_replay_result/);
    expect(setApprover).toMatch(/if not p_active[\s\S]*exists \([\s\S]*from public\.ot_requests r[\s\S]*pending approver work/i);
  });

  it("keeps fixed source identity separate from active destination eligibility", () => {
    const fixedIdentity = functionSql(sql, "ot_user_is_approved_approver_identity");
    const eligibleApprover = functionSql(sql, "ot_current_user_is_eligible_approver");
    const reassign = functionSql(sql, "ot_reassign_pending_approver");
    const setApprover = functionSql(sql, "ot_set_approver");

    expect(fixedIdentity).toContain("from public.users u");
    expect(fixedIdentity).toContain("where u.id = p_user_id");
    expect(fixedIdentity).not.toContain("u.is_active");
    expect(eligibleApprover).toContain("public.ot_user_is_approved_approver_identity(u.id)");
    expect(eligibleApprover).toContain("u.is_active = true");
    expect(eligibleApprover).toContain("a.active = true");

    expect(reassign).toContain("public.ot_user_is_approved_approver_identity(p_from_user_id)");
    expect(reassign).toMatch(/p_to_user_id[\s\S]*a\.active = true[\s\S]*u\.is_active = true/);
    expect(setApprover).toMatch(/if p_active[\s\S]*from public\.users u[\s\S]*u\.id = p_user_id[\s\S]*u\.is_active = true[\s\S]*raise exception/);
    expect(setApprover.indexOf("if p_active")).toBeLessThan(setApprover.indexOf("perform public.ot_lock_idempotency"));

    expect(verify).toContain("OT inactive fixed approver remediation contract (Expected = valid)");
    expect(read("supabase", "README.md")).toContain("inactive Workgrid source remains a fixed allowlisted identity for reassignment and deactivation only");
  });

  it("keeps reassignment least-privilege and exposes read-only staging checks", () => {
    const signature = "public.ot_reassign_pending_approver(uuid, uuid, text, uuid)";

    expect(sql).toContain(`revoke all on function ${signature} from public, anon, authenticated`);
    expect(sql).toContain(`grant execute on function ${signature} to authenticated`);
    expect(verify).not.toMatch(/^\s*(insert|update|delete|alter|create|drop|truncate)\b/im);
    expect(verify).toContain("OT pending approver reassignment RPC contract (Expected = valid)");
    expect(verify).toContain("OT pending approver reassignment execute grants (Expected authenticated only)");
    expect(verify).toContain("OT unsafe approver deactivation guard (Expected = true)");
    expect(read("supabase", "README.md")).toContain("the server reassignment RPC is atomic, but reassignment and deactivation are two separate browser calls");
  });
});

describe("OT Request static module integration", () => {
  it.each(["create", "revision"])("renders individual %s OT success and pending SeaTalk delivery feedback after dispatch failure", async mode => {
    const calls: string[] = [];
    const feedback: Array<Record<string, string>> = [];
    const harness = createOtRequestFormHarness({
      createOtRequest: async () => { calls.push("create"); return { id: "created-request" }; },
      resubmitOtPlan: async () => { calls.push("resubmit"); return { id: "resubmitted-request" }; },
      runOtIndividualSubmission: async submit => {
        const result = await submit();
        calls.push(`dispatch:${result.id}`);
        return { result, deliveryError: new Error("SeaTalk unavailable") };
      },
    });
    const request = mode === "revision" ? {
      id: "revision-request",
      functionCode: "ops",
      title: "Existing OT",
      plannedStartAt: "2099-01-05T18:00:00+07:00",
      plannedEndAt: "2099-01-05T20:00:00+07:00",
      reasonCode: "other",
      reasonDetail: "Existing detail",
    } : null;
    const success = (value: Record<string, string>) => feedback.push(value);
    let rendered = harness.render(mode, request, success);
    let controls = harness.elements(rendered);
    controls.filter(element => element.type === "select")[0].props.onChange({ target: { value: "ops" } });
    rendered = harness.render(mode, request, success);
    controls = harness.elements(rendered);
    controls.find(element => element.type === "input" && !element.props.type)?.props.onChange({ target: { value: "Patch launch" } });
    controls.filter(element => element.type === "select")[3].props.onChange({ target: { value: "other" } });
    controls.find(element => element.type === "textarea")?.props.onChange({ target: { value: "Required detail" } });
    controls.find(element => element.type === "input" && element.props.type === "checkbox")?.props.onChange({ target: { checked: true } });
    rendered = harness.render(mode, request, success);
    controls = harness.elements(rendered);
    await controls.find(element => element.type === "form")?.props.onSubmit({ preventDefault() {} });
    rendered = harness.render(mode, request, success);

    expect(calls).toEqual(mode === "create" ? ["create", "dispatch:created-request"] : ["resubmit", "dispatch:resubmitted-request"]);
    expect(harness.elements(rendered).map(element => element.props.message)).toContain(mode === "create" ? "Your OT request was submitted for approval." : "Your corrected OT request was resubmitted for approval.");
    expect(harness.elements(rendered).map(element => element.props.message)).toContain("SeaTalk delivery is still pending. Your OT request was submitted successfully.");
    expect(feedback).toEqual([{
      submissionMessage: mode === "create" ? "Your OT request was submitted for approval." : "Your corrected OT request was resubmitted for approval.",
      deliveryMessage: "SeaTalk delivery is still pending. Your OT request was submitted successfully.",
    }]);
  });

  it("keeps employee OT private and makes personal actions explicit", () => {
    const screen = read("screens-ot.jsx");
    for (const component of ["OtEmployeeDashboard", "OtRequestForm", "OtConsentPanel", "OtActualConfirmationForm", "OtMyRequestsTable"]) {
      expect(screen).toContain(`function ${component}(`);
    }
    expect(screen).toContain('data-testid="ot-week-total"');
    expect(screen).toContain('data-testid="ot-consent-required"');
    expect(screen).toContain('data-testid="ot-confirm-actual"');
    expect(screen).toContain('"My OT requests"');
    expect(screen).not.toContain('"Employee leaderboard"');
  });

  it("uses only personal OT RPCs for employee actions and preserves truthful over-limit actuals", () => {
    const screen = read("screens-ot.jsx");
    const employee = screen.slice(screen.indexOf("function OtEmployeeDashboard("), screen.indexOf("function OtManagerDashboard("));

    for (const api of ["loadMyOtDashboard", "loadMyOtRequests", "createOtRequest", "recordOtConsent", "submitOtActual"]) {
      expect(employee).toContain(`window.${api}`);
    }
    expect(employee).not.toContain("loadOtManagerDashboard");
    expect(employee).toContain("const overLimit = projections.some(row => row.overLimit)");
    const request = employee.slice(employee.indexOf("function OtRequestForm("), employee.indexOf("function OtConsentPanel("));
    expect(request).toContain('<fieldset className="ot-form__fieldset" disabled={window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)}>');
    const actual = employee.slice(employee.indexOf("function OtActualConfirmationForm("), employee.indexOf("function OtMyRequestsTable("));
    expect(actual).toContain('<fieldset className="ot-form__fieldset" disabled={window.FlowMateOtRequestDomain.isSubmissionLocked(submitState.status)}>');
    expect(actual).toContain("const complianceLikely = projections.some(row => row.overLimit)");
    expect(actual).not.toContain("&& !complianceLikely");
    expect(employee.match(/weekSummaryState.status === "ready"\s*\? window\.FlowMateOtRequestDomain\.buildWeekProjections/g)).toHaveLength(3);
    expect(actual).toContain("server will validate and save the truthful time");
    expect(employee).toContain("Math.abs(actualMinutes - plannedMinutes) > 30");
    expect(employee).toContain('status === "compliance_review_required"');
    expect(employee).toContain("crypto.randomUUID()");
    expect(employee).toContain("Routed Team Lead");
    expect(employee).toContain("This is assigned automatically from your Function.");
    expect(screen).toContain('storedStatus === "approved"');
    expect(employee).toContain('min={isRevision ? undefined : weekStart} max={isRevision ? undefined : addOtDays(weekStart, 6)}');
    expect(employee).toContain("startPersonalWeekLoad(nextWeekStart)");
    expect(employee).toContain("setAction(null)");
    expect(employee).toContain("buildWeekProjections(");
    expect(screen).toContain("state.weekKey === weekKey");
    expect(employee).toContain("resetIntentAfterEdit(");
    expect(employee).toContain("window.recordOtConsent(request.id, choice, OT_CONSENT_STATEMENT_VERSION, key)");
  });

  it("renders employee plan revision separately from actual correction", () => {
    const screen = read("screens-ot.jsx");
    const employee = screen.slice(screen.indexOf("function OtEmployeeDashboard("), screen.indexOf("const OT_MANAGER_METRIC_LABELS"));
    const requestForm = employee.slice(employee.indexOf("function OtRequestForm("), employee.indexOf("function OtConsentPanel("));

    expect(requestForm).toContain('function OtRequestForm({ mode = "create", request = null');
    expect(requestForm).toContain('const isRevision = mode === "revision"');
    for (const field of ["functionCode", "title", "workDate", "startTime", "endTime", "dayType", "workLocationType", "venue", "reasonCode", "reasonDetail"]) expect(requestForm).toContain(field);
    expect(requestForm).not.toContain("approverUserId");
    expect(requestForm).not.toContain("loadOtEligibleApprovers");
    expect(requestForm).toContain("OT_FUNCTION_APPROVER_EMAILS");
    for (const email of ["nithidol.k@garena.com", "weerayut@garena.com", "napol.a@garena.com"]) {
      expect(screen).toContain(email);
    }
    expect(screen).toContain("Production SeaTalk routing");
    expect(requestForm).toContain("getCanonicalCountedSegments(request)");
    expect(requestForm).toContain("excludedSegments");
    expect(requestForm).toContain("window.resubmitOtPlan(request.id, payload, OT_CONSENT_STATEMENT_VERSION, intent.key)");
    expect(requestForm).toContain("window.runOtIndividualSubmission");
    expect(requestForm).toContain("SeaTalk delivery is still pending");
    expect(requestForm).toContain("Edit and resubmit request");
    expect(requestForm).toContain("Resubmit corrected request");
    expect(requestForm).toContain("resetIntentAfterEdit(");
    expect(employee).toContain('window.FlowMateOtRequestDomain.getRevisionWorkflow(request) === "plan"');
    expect(employee).toContain('window.FlowMateOtRequestDomain.getRevisionWorkflow(request) === "actual"');
    expect(employee).toContain('setAction({ type: "revision", request })');
    expect(employee).toContain('<OtRequestForm key={action.request.id} mode="revision" request={action.request}');
  });

  it("lets a plan revision move to another Bangkok week and summarizes the edited segments", () => {
    const screen = read("screens-ot.jsx");
    const requestForm = screen.slice(screen.indexOf("function OtRequestForm("), screen.indexOf("function OtConsentPanel("));

    expect(requestForm).toContain('type="date" min={isRevision ? undefined : weekStart} max={isRevision ? undefined : addOtDays(weekStart, 6)}');
    expect(requestForm).toContain("useOtWeekSummaries(preview.valid ? preview.segments : [])");
    expect(requestForm).toContain("plannedWeekSegments: preview.segments");
  });

  it("wires canonical counted totals and current-occurrence replacement through every policy-facing UI", () => {
    const screen = read("screens-ot.jsx");
    const employee = screen.slice(screen.indexOf("function OtEmployeeDashboard("), screen.indexOf("const OT_MANAGER_METRIC_LABELS"));
    const managerHelpers = screen.slice(screen.indexOf("function getOtManagerRequestId("), screen.indexOf("function OtManagerDashboard("));

    expect(employee).toContain("const countedMinutes = Number(dashboard.countedMinutes || 0)");
    expect(employee).toContain("remainingMinutes: Math.max(0, OT_LIMIT_MINUTES - countedMinutes)");
    expect(employee.match(/getCanonicalCountedSegments\(request\)/g)).toHaveLength(3);
    expect(employee).not.toMatch(/totalField:\s*"(?:plannedMinutes|actualMinutes)"/);
    expect(managerHelpers).toContain("window.FlowMateOtRequestDomain.buildOtManagerTotals(rows, byWeek)");
    expect(managerHelpers).not.toContain("actualMinutes || plannedMinutes");
  });

  it("rechecks Bangkok-local future starts before individual submission, event preview, and event creation", () => {
    const screen = read("screens-ot.jsx");
    const requestForm = screen.slice(screen.indexOf("function OtRequestForm("), screen.indexOf("function OtConsentPanel("));
    const eventForm = screen.slice(screen.indexOf("function OtEventPlanForm("), screen.indexOf("function OtTeamWeekTable("));
    const message = "Request must be submitted before OT starts.";

    expect(requestForm.match(/isBangkokPlannedStartFuture\(form\.workDate, form\.startTime\)/g)).toHaveLength(2);
    expect(eventForm.match(/isBangkokPlannedStartFuture\(form\.startDate, form\.startTime\)/g)).toHaveLength(3);
    expect(requestForm).toContain(message);
    expect(eventForm).toContain(message);
  });

  it("implements the manager weekly operations hub without an OT leaderboard", () => {
    const screen = read("screens-ot.jsx");
    for (const component of ["OtManagerDashboard", "OtApprovalQueue", "OtEventPlanForm", "OtTeamWeekTable", "OtRootCausePanel"]) {
      expect(screen).toContain(`function ${component}(`);
    }
    for (const label of ["Planned OT", "Confirmed", "Needs approval", "Near 36h limit", "OT by function", "Why OT happens"]) {
      expect(screen).toContain(`"${label}"`);
    }
    expect(screen).toContain("Assigned teams/events only");
    expect(screen).not.toMatch(/rank|top performer|commitment score/i);
  });

  it("keeps manager rows server-scoped and performs every bulk verification individually", () => {
    const screen = read("screens-ot.jsx");
    const manager = screen.slice(screen.indexOf("function OtManagerDashboard("), screen.indexOf("function OtRequestShell("));

    for (const api of ["loadOtManagerDashboard", "loadOtPeopleForEvent", "loadOtEligibleApprovers", "reviewOtPlan", "verifyOtActual"]) {
      expect(manager).toContain(`window.${api}`);
    }
    expect(manager).not.toMatch(/\.from\(["'`]ot_/);
    expect(manager).toContain("for (const request of requestsToVerify)");
    expect(manager).toContain("await window.verifyOtActual(");
    expect(manager).toContain("window.FlowMateOtIntent.establish(");
    expect(manager).toContain('decision !== "approved" && !note.trim()');
    expect(manager).toContain('&& !otValue(request, "actualSubmittedAt", "actual_submitted_at")');
    expect(manager).toContain("const historyEmployeeTotals = getOtManagerTotals(activeLoadState.rows, true)");
    expect(manager).toContain('["cancelled", "rejected"].includes(getOtRequestStatus(request))');
  });

  it("requires an assigned-approver bulk review surface before any actual verification writes", () => {
    const screen = read("screens-ot.jsx");
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));

    expect(approval).toContain("function openBulkReview()");
    expect(approval).toContain("function confirmBulkVerification()");
    expect(approval.indexOf("function openBulkReview()")).toBeLessThan(approval.indexOf("function confirmBulkVerification()"));
    expect(approval).toContain("Bulk verification review");
    expect(approval).toContain("Consent timestamp");
    expect(approval).toContain("Signed variance");
    expect(approval).toContain("Employee weekly total");
    expect(approval).toContain("Excluded from bulk");
    expect(approval).toContain("onClick={confirmBulkVerification}");
    expect(approval).toContain("checks.canVerifyIndividually");
    expect(approval).toContain("checks.canBulkVerify");
    expect(approval).toContain("window.FlowMateOtRequestDomain.canActOnAssignedRequest(access, request)");
    expect(approval).toContain("Read only — assigned approver action");
    expect(approval).toContain("window.FlowMateOtRequestDomain.formatSignedHours(");
  });

  it("keeps manager decision intent keys stable for unchanged Plan, Actual, and bulk retry payloads", () => {
    const screen = read("screens-ot.jsx");
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));

    expect(approval).toContain("decisionSubmissionRef.current");
    expect(approval).toContain("window.FlowMateOtIntent.signature([requestId, selected.kind, decision, normalizedNote])");
    expect(approval).toContain("window.FlowMateOtIntent.establish(decisionIntentRef.current, signature, () => crypto.randomUUID())");
    expect(approval).toContain("currentIntent.key");
    expect(approval).toContain("bulkIntentsRef.current");
    expect(approval).not.toMatch(/(?:reviewOtPlan|verifyOtActual)\([^;]+crypto\.randomUUID\(\)/);
    expect(approval).toContain('disabled={actionState.status === "submitting"}');
  });

  it("retains a failed single-decision key after close and reopen while rotating for a different request", async () => {
    const harness = createOtApprovalQueueHarness();
    const keys: string[] = [];
    harness.window.reviewOtPlan = async (_requestId: string, _decision: string, _note: string | null, key: string) => {
      keys.push(key);
      throw new Error("Ambiguous network failure");
    };
    const access = { isEligibleApprover: true, userId: "approver-1" };
    const request = (id: string, title: string) => ({
      id,
      title,
      source: "employee_request",
      status: "pending_approval",
      approverUserId: "approver-1",
      employeeUserId: "employee-1",
      plannedStartAt: "2099-08-10T12:00:00Z",
      plannedMinutes: 60,
      actualMinutes: 0,
    });
    const requestA = request("request-a", "Request A");
    const requestB = request("request-b", "Request B");
    const propsFor = (row: Record<string, unknown>) => ({
      access,
      requests: [row],
      allRequests: [row],
      peopleById: new Map(),
      onChanged() {},
    });
    let props = propsFor(requestA);
    let rendered = harness.render(props);

    renderedButton(rendered, "Request A", false).props.onClick();
    rendered = harness.render(props);
    const note = findRenderedElements(rendered, element => element.type === "textarea")[0];
    note.props.onChange({ target: { value: "same note" } });
    rendered = harness.render(props);
    await renderedButton(rendered, "Approve plan").props.onClick();
    rendered = harness.render(props);
    renderedButton(rendered, "Close").props.onClick();
    rendered = harness.render(props);
    renderedButton(rendered, "Request A", false).props.onClick();
    rendered = harness.render(props);
    findRenderedElements(rendered, element => element.type === "textarea")[0].props.onChange({ target: { value: "same note" } });
    rendered = harness.render(props);
    await renderedButton(rendered, "Approve plan").props.onClick();

    rendered = harness.render(props);
    renderedButton(rendered, "Close").props.onClick();
    props = propsFor(requestB);
    rendered = harness.render(props);
    renderedButton(rendered, "Request B", false).props.onClick();
    rendered = harness.render(props);
    findRenderedElements(rendered, element => element.type === "textarea")[0].props.onChange({ target: { value: "same note" } });
    rendered = harness.render(props);
    await renderedButton(rendered, "Approve plan").props.onClick();

    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("retains each failed bulk key after close and reopen while rotating for a different included request", async () => {
    const harness = createOtApprovalQueueHarness();
    const keys: string[] = [];
    harness.window.verifyOtActual = async (_requestId: string, _decision: string, _note: string | null, key: string) => {
      keys.push(key);
      throw new Error("Ambiguous network failure");
    };
    const access = { isEligibleApprover: true, userId: "approver-1" };
    const request = (id: string, title: string) => ({
      id,
      title,
      source: "employee_request",
      status: "pending_actual_verification",
      approverUserId: "approver-1",
      employeeUserId: "employee-1",
      plannedStartAt: `${harness.weekStart}T19:00:00+07:00`,
      plannedMinutes: 60,
      actualMinutes: 60,
      actualSubmittedAt: "2026-08-10T12:00:00Z",
      actualWeekSegments: [{ weekStart: "2026-08-10", minutes: 60 }],
    });
    const requestA = request("actual-a", "Actual A");
    const requestB = request("actual-b", "Actual B");
    const propsFor = (row: Record<string, unknown>) => ({
      access,
      requests: [row],
      allRequests: [row],
      peopleById: new Map(),
      onChanged() {},
    });
    let props = propsFor(requestA);
    let rendered = harness.render(props);

    renderedButton(rendered, "Review 1 eligible").props.onClick();
    rendered = harness.render(props);
    await renderedButton(rendered, "Confirm 1 verifications").props.onClick();
    rendered = harness.render(props);
    renderedButton(rendered, "Close").props.onClick();
    rendered = harness.render(props);
    renderedButton(rendered, "Review 1 eligible").props.onClick();
    rendered = harness.render(props);
    await renderedButton(rendered, "Confirm 1 verifications").props.onClick();

    rendered = harness.render(props);
    renderedButton(rendered, "Close").props.onClick();
    props = propsFor(requestB);
    rendered = harness.render(props);
    renderedButton(rendered, "Review 1 eligible").props.onClick();
    rendered = harness.render(props);
    await renderedButton(rendered, "Confirm 1 verifications").props.onClick();

    expect(keys).toHaveLength(3);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it("persists bulk retry keys across the real manager refresh lifecycle and clears them only after success", async () => {
    const harness = createOtManagerApprovalHarness();
    const keys: string[] = [];
    const outcomes = ["fail", "fail", "fail", "success", "fail"];
    harness.window.verifyOtActual = async (_requestId: string, _decision: string, _note: string | null, key: string) => {
      keys.push(key);
      if (outcomes.shift() === "fail") throw new Error("Ambiguous network failure");
    };
    const request = (id: string, title: string) => ({
      id,
      title,
      source: "employee_request",
      status: "pending_actual_verification",
      approverUserId: "approver-1",
      employeeUserId: "employee-1",
      plannedStartAt: `${harness.weekStart}T19:00:00+07:00`,
      plannedMinutes: 60,
      actualMinutes: 60,
      plannedWeekSegments: [{ weekStart: harness.weekStart, minutes: 60 }],
      actualSubmittedAt: "2026-08-10T12:00:00Z",
      actualWeekSegments: [{ weekStart: harness.weekStart, minutes: 60 }],
    });
    const requestA = request("actual-a", "Actual A");
    const requestB = request("actual-b", "Actual B");
    harness.setRows([requestA]);
    let rendered = await harness.mountQueue();

    async function verifyVisibleBulk() {
      renderedButton(rendered, "Review 1 eligible").props.onClick();
      rendered = harness.renderQueue();
      await renderedButton(rendered, "Confirm 1 verifications").props.onClick();
    }

    await verifyVisibleBulk();
    harness.setRows([requestA]);
    let refreshed = await harness.refreshQueue();
    expect(refreshed.loadingText).toContain("Loading assigned OT operations");
    rendered = refreshed.queue;

    await verifyVisibleBulk();
    harness.setRows([requestB]);
    refreshed = await harness.refreshQueue();
    expect(refreshed.loadingText).toContain("Loading assigned OT operations");
    rendered = refreshed.queue;

    await verifyVisibleBulk();
    harness.setRows([requestB]);
    refreshed = await harness.refreshQueue();
    rendered = refreshed.queue;

    await verifyVisibleBulk();
    harness.setRows([requestB]);
    refreshed = await harness.refreshQueue();
    rendered = refreshed.queue;

    await verifyVisibleBulk();

    expect(keys).toHaveLength(5);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
    expect(keys[3]).toBe(keys[2]);
    expect(keys[4]).not.toBe(keys[3]);
  });

  it("renders approved compliance rows as non-actionable while awaiting HR", () => {
    const screen = read("screens-ot.jsx");
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));

    expect(approval).toContain("function canTakeAction(kind, request)");
    expect(approval).toContain("checks.awaitingHrCompliance");
    expect(approval).toContain("Awaiting HR compliance");
    expect(approval).toContain("if (!canTakeAction(kind, request)) return;");
  });

  it("keeps plan revisions out of the manager queue and shares the audited amendment action", () => {
    const screen = read("screens-ot.jsx");
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));
    const amendment = screen.slice(screen.indexOf("function OtActualAmendmentAction("), screen.indexOf("function OtAuditTimeline("));

    expect(screen).toContain('const needsApproval = filteredCurrentRows.filter(request => !otValue(request, "actualSubmittedAt", "actual_submitted_at") && getOtRequestStatus(request) === "pending_approval").length;');
    expect(approval).toContain('getOtRequestStatus(request) === "pending_approval"');
    expect(approval).not.toContain('["pending_approval", "revision_required"]');
    expect(amendment).toContain("window.FlowMateOtRequestDomain.canRequestActualAmendment(access, request)");
    expect(amendment).toContain("if (!reason.trim())");
    expect(amendment).toContain("window.FlowMateOtIntent.establish(");
    expect(amendment).toContain("window.requestOtActualAmendment(requestId, normalizedReason, currentIntent.key)");
    expect(amendment).toContain("The existing actual time remains in audit until the employee submits a correction.");
    expect(amendment).toContain('disabled={actionState.status === "submitting"}');
    expect(screen.match(/<OtActualAmendmentAction/g)).toHaveLength(1);
  });

  it("remounts the shared actual amendment action for each selected approval", () => {
    const screen = read("screens-ot.jsx");

    expect(screen).toContain('<OtActualAmendmentAction key={getOtManagerRequestId(selected)} access={access} request={selected}');
  });

  it("previews event plans per employee and excludes every over-limit occurrence", () => {
    const screen = read("screens-ot.jsx");
    const eventForm = screen.slice(screen.indexOf("function OtEventPlanForm("), screen.indexOf("function OtRootCausePanel("));

    expect(eventForm).toContain("window.previewOtEventPlan(payload, form.employeeUserIds)");
    expect(eventForm).toContain("employee.canCreate");
    expect(eventForm).toContain("const eligibleEmployeeIds");
    expect(eventForm).toContain("window.createOtEventPlan(payload, eligibleEmployeeIds, intent.key)");
    expect(eventForm).toContain("This employee is excluded because at least one affected week would exceed 36h.");
    expect(eventForm).toContain("Consent received");
    expect(eventForm).toContain("Awaiting consent");
  });

  it("uses the approved deterministic root-cause rules only on authorized manager rows", () => {
    const screen = read("screens-ot.jsx");
    const rootCause = screen.slice(screen.indexOf("function OtRootCausePanel("), screen.indexOf("function OtRequestShell("));

    expect(rootCause).toContain("OT Health & Root Cause");
    expect(rootCause).toContain("window.FlowMateOtRequestDomain.buildRootCauseInsights(filteredRows");
    expect(rootCause).toContain("View authorized rows");
    expect(rootCause).toContain("Current filters stay applied");
    expect(rootCause).not.toMatch(/performance|productivity|commitment|value score/i);
  });

  it("deduplicates root-cause drill-down requests and ignores planned-only recurring weeks", () => {
    const screen = read("screens-ot.jsx");
    const rootCause = screen.slice(screen.indexOf("function buildOtInsightRows("), screen.indexOf("function OtRootCausePanel("));
    const panel = screen.slice(screen.indexOf("function OtRootCausePanel("), screen.indexOf("function OtRequestShell("));

    expect(rootCause).toContain("getOtManagerRequestId(request)");
    expect(rootCause).toContain("plannedMinutes: current.plannedMinutes + Number(request.plannedMinutes || 0)");
    expect(rootCause).toContain("actualMinutes: current.actualMinutes + Number(request.actualMinutes || 0)");
    expect(panel).toContain("window.FlowMateOtRequestDomain.countWeeksWithActualMinutes(confirmedRows)");
    expect(panel).toContain("buildOtInsightRows(filteredRows, selectedInsight.recordIds)");
  });

  it("builds operational trend and concentration views only from the five server-scoped manager responses", () => {
    const screen = read("screens-ot.jsx");
    const manager = screen.slice(screen.indexOf("function OtManagerDashboard("), screen.indexOf("function OtApprovalQueue("));
    const panel = screen.slice(screen.indexOf("function OtRootCausePanel("), screen.indexOf("function OtRequestShell("));

    expect(manager).toContain("[0, -7, -14, -21, -28]");
    expect(manager).toContain("weeks.map(managerWeek => window.loadOtManagerDashboard(managerWeek, functionFilter || null))");
    expect(manager).toContain("<OtRootCausePanel key={clientFilterKey} filteredRows={filteredRows} currentWeekStart={weekStart} weekStarts={managerWeeks} filterKey={clientFilterKey}");
    expect(panel).toContain("window.FlowMateOtRequestDomain.buildOtWeeklyTrend(filteredRows, weekStarts)");
    expect(panel).toContain("window.FlowMateOtRequestDomain.buildOtWorkloadConcentration(filteredRows)");
    expect(manager).not.toMatch(/\.from\(["'`]ot_/);
  });

  it("renders explicit accessible OT trend and operational concentration tables without person output", () => {
    const screen = read("screens-ot.jsx");
    const panel = screen.slice(screen.indexOf("function OtRootCausePanel("), screen.indexOf("function formatOtDateTime("));

    expect(panel).toContain("Confirmed OT trend — latest 5 Bangkok weeks");
    expect(panel).toContain("Workload concentration by Function / assignment");
    expect(panel.match(/<table className="ot-analytics-table">/g)).toHaveLength(3);
    expect(panel).toContain('<th scope="col">Bangkok week</th>');
    expect(panel).toContain('<th scope="row">{formatOtDate(row.weekStart)}</th>');
    expect(panel).toContain("formatOtHours(row.actualMinutes)");
    expect(panel).not.toContain("getOtManagerEmployeeName");
    expect(panel).not.toMatch(/performance|productivity|rank|top performer|value score/i);
  });

  it("renders all five dated zero-hour trend rows when no confirmed Actual rows exist", () => {
    const harness = createOtRootCauseHarness();
    const rendered = harness.render({
      filteredRows: [],
      currentWeekStart: "2026-08-03",
      weekStarts: ["2026-08-03", "2026-07-27", "2026-07-20", "2026-07-13", "2026-07-06"],
      filterKey: "|||0",
    });
    const trendTable = findRenderedElements(rendered, element => (
      element.type === "table" && renderedText(element).includes("Approved Actual hours by Bangkok week")
    ))[0];
    const body = findRenderedElements(trendTable, element => element.type === "tbody")[0];
    const rows = findRenderedElements(body, element => element.type === "tr");

    expect(rows).toHaveLength(5);
    expect(rows.map(renderedText)).toEqual([
      expect.stringMatching(/Mon, 06 Jul 2026.*0h/),
      expect.stringMatching(/Mon, 13 Jul 2026.*0h/),
      expect.stringMatching(/Mon, 20 Jul 2026.*0h/),
      expect.stringMatching(/Mon, 27 Jul 2026.*0h/),
      expect.stringMatching(/Mon, 03 Aug 2026.*0h/),
    ]);
  });

  it("never renders or opens an employee-derived recurring OT signal", () => {
    const harness = createOtRootCauseHarness();
    const rendered = harness.render({
      filteredRows: [
        { id: "week-one", employeeUserId: "employee", functionCode: "ops", workDate: "2026-07-06", actualMinutes: 1500, actualDecision: "approved", actualVerifiedAt: "2026-07-06T20:00:00Z" },
        { id: "week-two", employeeUserId: "employee", functionCode: "ops", workDate: "2026-07-13", actualMinutes: 1500, actualDecision: "approved", actualVerifiedAt: "2026-07-13T20:00:00Z" },
        { id: "week-three", employeeUserId: "employee", functionCode: "ops", workDate: "2026-07-20", actualMinutes: 1500, actualDecision: "approved", actualVerifiedAt: "2026-07-20T20:00:00Z" },
        { id: "week-four", employeeUserId: "employee", functionCode: "ops", workDate: "2026-07-27", actualMinutes: 1500, actualDecision: "approved", actualVerifiedAt: "2026-07-27T20:00:00Z" },
        { id: "week-five", employeeUserId: "employee", functionCode: "ops", workDate: "2026-08-03", actualMinutes: 1500, actualDecision: "approved", actualVerifiedAt: "2026-08-03T20:00:00Z" },
      ],
      currentWeekStart: "2026-08-03",
      weekStarts: ["2026-08-03", "2026-07-27", "2026-07-20", "2026-07-13", "2026-07-06"],
      filterKey: "|||0",
    });
    const text = renderedText(rendered);
    const drilldownButtons = findRenderedElements(rendered, element => (
      element.type === "button" && renderedText(element).includes("View authorized rows")
    ));

    expect(text).not.toMatch(/workload safety pattern|team member exceeded|recurring employee/i);
    expect(drilldownButtons).toHaveLength(0);
  });

  it("closes an open drill-down when any complete client-filter identity field changes", () => {
    const harness = createOtRootCauseHarness();
    const baseFilters = { eventPlanId: "event-a", reasonCode: "capacity", status: "hr_ready", nearLimit: false };

    expect(harness.getClientFilterKey).toEqual(expect.any(Function));
    const baseKey = harness.getClientFilterKey(baseFilters);
    for (const changedFilters of [
      { ...baseFilters, eventPlanId: "event-b" },
      { ...baseFilters, reasonCode: "live_incident" },
      { ...baseFilters, status: "exported" },
      { ...baseFilters, nearLimit: true },
    ]) {
      expect(harness.getClientFilterKey(changedFilters)).not.toBe(baseKey);
    }

    const props = {
      filteredRows: [{ id: "event-row", eventPlanId: "event-a", functionCode: "ops", workDate: "2026-08-03", plannedMinutes: 100, actualMinutes: 130, actualDecision: "approved", actualVerifiedAt: "2026-08-03T20:00:00Z" }],
      currentWeekStart: "2026-08-03",
      weekStarts: ["2026-08-03", "2026-07-27", "2026-07-20", "2026-07-13", "2026-07-06"],
      filterKey: baseKey,
    };
    let rendered = harness.render(props);
    const openButton = findRenderedElements(rendered, element => (
      element.type === "button" && renderedText(element).includes("View authorized rows")
    ))[0];
    expect(openButton).toBeDefined();
    (openButton.props.onClick as () => void)();
    rendered = harness.render(props);
    expect(renderedText(rendered)).toContain("Authorized operational rows behind this signal");

    rendered = harness.render({ ...props, filterKey: harness.getClientFilterKey({ ...baseFilters, nearLimit: true }) });
    expect(renderedText(rendered)).not.toContain("Authorized operational rows behind this signal");
  });

  it("invalidates prior manager analytics immediately across loading, error, and retry query identities", () => {
    const screen = read("screens-ot.jsx");
    const manager = screen.slice(screen.indexOf("function OtManagerDashboard("), screen.indexOf("function OtApprovalQueue("));

    expect(manager).toContain("managerLoadKey");
    expect(manager).toContain("loadState.queryKey === managerLoadKey");
    expect(manager).toContain('setLoadState({ status: "loading", queryKey: managerLoadKey, rows: [], peopleById: {}, message: "" })');
    expect(manager).toContain('setLoadState({ status: "error", queryKey: managerLoadKey, rows: [], peopleById: {}, message: error.message || "Assigned OT could not be loaded." })');
  });

  it("renders Owner controls and Team Lead export only from server access capabilities", () => {
    const sql = read("supabase", "ot_request.sql");
    const screen = read("screens-ot.jsx");

    expect(sql).toContain("panuwee.w@garena.com");
    expect(sql).toContain("ot_current_user_is_owner");
    for (const component of ["OtAccessAdminPanel", "OtHrExportPanel", "OtOwnerInsightsPanel"]) {
      expect(screen).toContain(`function ${component}(`);
    }
    expect(screen).not.toContain('owner: "ot-request/owner"');
    expect(screen).toContain('access: "ot-request/access"');
    expect(screen).toContain('export: "ot-request/export"');
    expect(screen).toContain('insights: "ot-request/insights"');
    expect(screen).toContain('access.status === "ready" && access.isOwner');
    expect(screen).toContain('if (view === "access" || view === "insights" || view === "export") return Boolean(access.isOwner);');
    expect(screen).not.toContain("Compliance & HR");
    expect(screen).not.toMatch(/currentUserEmail\s*(?:===|==|\.includes|\.endsWith)/);
    expect(sql).not.toMatch(/create policy[^;]+on public\.(work_items|marketing_plans|product_book)/is);
  });

  it("keeps owner visibility read-only for normal approvals and shows truthful compliance evidence", () => {
    const screen = read("screens-ot.jsx");
    const manager = screen.slice(screen.indexOf("function OtManagerDashboard("), screen.indexOf("function OtApprovalQueue("));
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));
    const compliance = screen.slice(screen.indexOf("function OtComplianceQueue("), screen.indexOf("function OtHrExportPanel("));

    expect(manager).toContain("All Functions");
    expect(manager).toContain("access.isOwner || access.isHrAdmin");
    expect(approval).toContain("window.FlowMateOtRequestDomain.canActOnAssignedRequest(access, request)");
    expect(approval).toContain("Read only");
    for (const evidence of ["actualStartAt", "plannedStartAt", "actualWeekSegments", "actualVarianceReason", "actualDecisionNote", "weeklyTotals"]) {
      expect(compliance).toContain(evidence);
    }
    expect(compliance).toContain("actualMinutes: loadState.weeklyTotals");
    expect(compliance).toContain("projectedMinutes: loadState.weeklyTotals");
    expect(compliance).toContain("Projected / counted:");
    expect(compliance).toContain("window.reviewOtCompliance(");
    expect(compliance).toContain("<OtAuditTimeline");
    expect(compliance).toContain("if (!outcome || !note.trim())");
    expect(compliance).toContain("window.FlowMateOtIntent.establish(");
    expect(compliance).toContain("reviewSubmissionRef.current");
    expect(compliance).toContain("disabled={actionState.status === \"submitting\"}");
    expect(compliance).not.toContain("window.submitOtActual");
    expect(compliance).not.toMatch(/reviewOtCompliance\([^;]+crypto\.randomUUID\(\)/);
    expect(compliance).not.toMatch(/type="(?:datetime-local|time)"/);
  });

  it("exports all HR-ready records for the selected month after a local CSV download succeeds", () => {
    const screen = read("screens-ot.jsx");
    const panel = screen.slice(screen.indexOf("function OtHrExportPanel("), screen.indexOf("function OtAccessAdminPanel("));
    const exactColumns = "request_id,employee_email,function,assignment,event_id,work_date,day_type,planned_start,planned_end,planned_break_minutes,planned_minutes,actual_start,actual_end,actual_break_minutes,actual_minutes,reason_code,reason_detail,approver_email,employee_confirmed_at,verified_at,compliance_outcome,hr_ready_at";

    expect(panel).toContain("window.loadOtHrReady(");
    expect(panel).toContain("const exportRows = loadState.rows;");
    expect(panel).toContain("const batchName = `${reportMonth} verified OT`;");
    expect(panel).toContain("window.FlowMateOtHrExport.createLocalFile(exportRows, batchName, downloadOtHrCsv)");
    expect(panel).toContain("window.markOtExported(includedIds, batchName, intentKey)");
    expect(panel.indexOf("window.FlowMateOtHrExport.createLocalFile(")).toBeLessThan(panel.indexOf("window.markOtExported("));
    expect(panel).toContain("local CSV exists, but server export status remains unchanged");
    expect(panel).toContain("The local file was not created, and the server was not marked exported.");
    expect(panel).toContain("window.FlowMateOtHrExport.createLocalFile(");
    expect(panel).toContain("Export monthly CSV");
    expect(panel).not.toContain("Review export selection");
    expect(panel).not.toContain("selectedIds");
    expect(read("supabase-ot-request.js")).toContain(exactColumns);
    expect(panel).not.toMatch(/salary|pay rate|bank|password|gps/i);
  });

  it("keeps audit read-only and access administration restricted to audited server RPCs", () => {
    const screen = read("screens-ot.jsx");
    const audit = screen.slice(screen.indexOf("function OtAuditTimeline("), screen.indexOf("function OtComplianceQueue("));
    const admin = screen.slice(screen.indexOf("function OtAccessAdminPanel("), screen.indexOf("function OtRequestShell("));

    for (const field of ["actorUserId", "action", "oldStatus", "newStatus", "changedFields", "note", "createdAt"]) {
      expect(audit).toContain(field);
    }
    expect(audit).toContain("window.loadOtRequestAudit(");
    expect(audit).toContain("row.createdAt, JSON.stringify(row.changedFields)");
    expect(audit).not.toContain("flowmateSupabase");
    expect(admin).toContain("window.setOtApprover(");
    expect(admin).toContain("window.setOtSystemRole(");
    expect(admin).toContain("if (!reason.trim())");
    expect(admin).toContain("window.FlowMateOtIntent.establish(");
    expect(admin).toContain("window.loadOtAccessAdminIdentities()");
    expect(admin).not.toContain("window.loadOtPeopleForEvent()");
    expect(admin).not.toContain("window.loadOtEligibleApprovers()");
    expect(admin).toContain("getAccessAdminIdentityEligibility");
    expect(admin).toContain("Inactive Workgrid identities are source/deactivation only");
    expect(admin).toContain("server validates");
    expect(screen).not.toContain("OT_APPROVER_DISPLAY_DIRECTORY");
    expect(screen).not.toContain("OT_APPROVED_APPROVER_EMAILS");
    expect(admin).not.toMatch(/setOt(?:Approver|SystemRole)\([^;]+crypto\.randomUUID\(\)/);
    expect(admin).not.toMatch(/\.from\s*\(/);
    expect(admin).not.toContain("currentUserEmail");
  });

  it("requires compliance approval evidence in the manager decision UI", () => {
    const screen = read("screens-ot.jsx");
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));

    expect(approval).toMatch(/decision !== "approved"[\s\S]*selectedChecks\?\.complianceRequired[\s\S]*!note\.trim\(\)/);
    expect(approval).toContain("A note is required for a compliance-required actual approval.");
    expect(approval).toMatch(/selectedChecks\?\.complianceRequired && !note\.trim\(\)[\s\S]*actionState\.status === "submitting"/);
    expect(approval).toContain("required for compliance approval");
  });

  it("reassigns through an explicit refreshed Owner step before a separate deactivation call", () => {
    const screen = read("screens-ot.jsx");
    const admin = screen.slice(screen.indexOf("function OtAccessAdminPanel("), screen.indexOf("function OtRequestShell("));

    expect(admin).toContain("Prepare deactivation");
    expect(admin).toContain("Reassignment destination *");
    expect(admin).toContain("window.reassignPendingOtApprover(");
    expect(admin).toContain("await loadOtAccessDirectory()");
    expect(admin.indexOf("window.reassignPendingOtApprover(")).toBeLessThan(admin.indexOf("window.setOtApprover("));
    expect(admin).toContain("Deactivate approver");
    expect(admin).toContain("The server reassignment is atomic");
    expect(admin).toContain("the reassignment and deactivation browser calls are not atomic together");
    expect(admin).toContain("window.FlowMateOtIntent.establish(");
    expect(admin).toContain("actionState.status === \"submitting\"");
    expect(admin).toMatch(/disabled=\{[^}]*actionState\.status === "submitting"[^}]*\}/);
    expect(admin).not.toMatch(/reassignPendingOtApprover\([^;]+crypto\.randomUUID\(\)/);
    expect(admin).not.toMatch(/setOtApprover\([^;]+crypto\.randomUUID\(\)/);
    expect(admin).not.toMatch(/\.from\s*\(/);
  });

  it("blocks only late positive pre-work actions and explains the Bangkok-time boundary", () => {
    const screen = read("screens-ot.jsx");
    const consent = screen.slice(screen.indexOf("function OtConsentPanel("), screen.indexOf("function OtActualConfirmationForm("));
    const approval = screen.slice(screen.indexOf("function OtApprovalQueue("), screen.indexOf("function OtEventPlanForm("));

    expect(consent).toContain("window.FlowMateOtRequestDomain.isPlannedStartFuture(");
    expect(consent).toContain("Accepting is no longer available because the planned start is not strictly future in Bangkok time. Declining remains available.");
    expect(consent).toMatch(/Accept occurrence<\/button>[\s\S]*Decline occurrence<\/button>/);
    expect(consent).toMatch(/disabled=\{[^}]*!plannedStartIsFuture[^}]*\}[\s\S]*Accept occurrence/);
    expect(consent).not.toMatch(/Decline occurrence<\/button>[\s\S]*!plannedStartIsFuture/);
    expect(approval).toContain("window.FlowMateOtRequestDomain.isPlannedStartFuture(");
    expect(approval).toContain("Approval is no longer available because the planned start is not strictly future in Bangkok time. Reject or return remains available.");
    expect(approval).toMatch(/Reject plan<\/button>[\s\S]*disabled=\{[^}]*!selectedPlanStartIsFuture[^}]*\}[\s\S]*Approve plan/);
    expect(approval).not.toMatch(/Reject plan<\/button>[^<]*!selectedPlanStartIsFuture/);
  });

  it("adds OT Request as the fourth product without changing the first three", () => {
    const app = read("app.jsx");

    expect(app).toContain('const OT_REQUEST_PRODUCT_KEY = "ot-request"');
    expect(app).toContain("function chooseOtRequestProduct()");
    const productChoice = app.slice(app.indexOf("function ProductChoiceScreen"), app.indexOf("function normalizeProductBookArrayInput"));
    expect(productChoice.indexOf('"FlowMate"')).toBeLessThan(productChoice.indexOf('"Marketing Plan"'));
    expect(productChoice.indexOf('"Marketing Plan"')).toBeLessThan(productChoice.indexOf('"Product Book"'));
    expect(productChoice.indexOf('"Product Book"')).toBeLessThan(productChoice.indexOf('"OT Request"'));

    const screen = read("screens-ot.jsx");
    expect(screen).toContain("function OtRequestShell(");
    expect(screen).toContain("window.OtRequestShell = OtRequestShell");
    expect(screen).toContain('"ot-request/action-queue"');
    expect(screen).toContain('"ot-request/root-causes"');
    expect(screen).toContain("access.canManage");
    expect(screen).toContain('if (access.status !== "ready") return;');
    expect(screen).toContain("if (view === \"overview\" || view === \"my-requests\") return Boolean(access.canRequestOt);");
    expect(screen).toContain('access.status === "ready" && access.canRequestOt');
    expect(screen).toContain("function getOtRequestFallbackView(access)");
    expect(screen).toContain('const visibleView = canOpenOtRequestView(activeView, access) ? activeView : getOtRequestFallbackView(access);');
    expect(screen).toContain('visibleView === "overview" || visibleView === "my-requests"');
  });

  it("separates Team OT into action, schedule, and monthly views for 2026 only", () => {
    const screen = read("screens-ot.jsx");

    expect(screen).toContain('"action-queue": "ot-request/action-queue"');
    expect(screen).toContain('"team-schedule": "ot-request/team-schedule"');
    expect(screen).toContain('"monthly-report": "ot-request/monthly-report"');
    expect(screen).toContain('const OT_DISPLAY_YEAR = 2026;');
    expect(screen).toContain('min="2026-01" max="2026-12"');
    expect(screen).toContain('Action queue');
    expect(screen).toContain('Team schedule');
    expect(screen).toContain('Monthly report');
    expect(screen).toContain('function OtMonthlyTeamDetails(');
    expect(screen).toContain('<th>Schedule</th>');
  });

  it("keeps charts, preview data, and monthly export in the Owner-only navigation", () => {
    const screen = read("screens-ot.jsx");
    const css = read("app.css");
    const ownerInsights = screen.slice(screen.indexOf("function OtOwnerInsightsPanel("), screen.indexOf("function OtHrExportPanel("));

    expect(screen).toContain('insights: "ot-request/insights"');
    expect(screen).toContain('if (view === "access" || view === "insights" || view === "export") return Boolean(access.isOwner);');
    expect(screen).toContain('OT insights');
    expect(screen).toContain('Monthly export');
    expect(screen).toContain('function OtOwnerInsightsPanel(');
    expect(screen).toContain('aria-label="Confirmed OT trend chart"');
    expect(screen).toContain("Preview sample data");
    expect(screen).toContain("Preview data — sample only; exports and live data remain unchanged.");
    expect(screen).toContain('min="2026-01" max="2026-12"');
    expect(ownerInsights).toContain('className="ot-insight-chart"');
    expect(ownerInsights).not.toContain('className="ot-root-grid">{weeklyTrend');
    expect(css).toContain(".ot-insight-chart__row");
  });

  it("keeps active entry pages on one OT release version", () => {
    const entries = [["index.html"], ["home", "index.html"], ["product-book", "index.html"]].map(parts => read(...parts));
    const otAssets = ["ot-request-domain.js", "supabase-ot-request.js", "screens-ot.js", "app.css"];

    for (const html of entries) {
      const stamps = otAssets.map(asset => {
        const escapedAsset = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const match = html.match(new RegExp(`${escapedAsset}\\?v=([0-9]{8}-[a-f0-9]{6})`));
        expect(match).not.toBeNull();
        return match?.[1];
      });
      expect(new Set(stamps).size).toBe(1);
      expect(html).toMatch(/app\.js\?v=[0-9]{8}-[0-9]{2}/);
    }
  });

  it("explains when an approved occurrence becomes available for actual confirmation", () => {
    const screen = read("screens-ot.jsx");

    expect(screen).toContain('>Confirm actual</button>');
    expect(screen).toContain("disabled={Boolean(actualAvailableAt)}");
    expect(screen).toContain("Available after");
    expect(screen).toContain("formatOtDateTime(");
  });

  it("formats OT requester access changes in Bangkok time without raw ISO timestamps", () => {
    const screen = read("screens-ot.jsx");

    expect(screen).toContain("function formatOtAccessTimestamp(value)");
    expect(screen).toContain("(GMT+7)");
    expect(screen).toContain("formatOtAccessTimestamp(row.updatedAt || row.updated_at)");
  });

  it("automates one Bangkok release stamp across active entry pages before every commit", () => {
    const releaseStamp = read("scripts", "release-stamp.cjs");
    const preCommit = read(".husky", "pre-commit");

    expect(releaseStamp).toContain('timeZone: "Asia/Bangkok"');
    expect(releaseStamp).toContain("ENTRY_PAGES");
    expect(releaseStamp).toContain("screens-ot.js");
    expect(releaseStamp).toContain("app.js");
    expect(preCommit).toContain("npm run release:stamp");
    expect(preCommit).toContain("git add --");
  });

  it("uses labelled warnings and accessible OT navigation state", () => {
    const screen = read("screens-ot.jsx");
    const warning = screen.slice(screen.indexOf("function getOtAnnouncementProps("), screen.indexOf("function OtLimitProgress("));
    const navigation = screen.slice(screen.indexOf('<nav className="ot-sidebar"'), screen.indexOf("</nav>", screen.indexOf('<nav className="ot-sidebar"')));

    expect(warning).toContain('? { role: "alert" }');
    expect(warning).toContain('{ role: "status", "aria-live": "polite" }');
    expect(navigation).toContain('aria-label="OT Request navigation"');
    expect(navigation.match(/aria-current=\{visibleView ===/g)).toHaveLength(8);
    for (const view of ["overview", "my-requests", "action-queue", "team-schedule", "monthly-report", "insights", "export", "access"]) {
      expect(navigation).toContain(`aria-current={visibleView === "${view}" ? "page" : undefined}`);
    }
    expect(screen).not.toContain("function getOtCurrentPageProps(");
  });

  it("shows reason names in manager schedules and removes the expandable schedule detail", () => {
    const screen = read("screens-ot.jsx");
    const schedule = screen.slice(screen.indexOf("function OtTeamWeekTable("), screen.indexOf("function OtMonthlyTeamDetails("));
    const monthlyDetails = screen.slice(screen.indexOf("function OtMonthlyTeamDetails("), screen.indexOf("function buildOtInsightRows("));
    const manager = screen.slice(screen.indexOf("function OtManagerDashboard("), screen.indexOf("function OtApprovalQueue("));

    expect(schedule).toContain("<th>Reason</th>");
    expect(schedule).not.toContain("<th>Details</th>");
    expect(schedule).not.toContain("onOpenRequest");
    expect(monthlyDetails).toContain("<th>Reason</th>");
    expect(monthlyDetails).toContain("getOtReasonLabel(request)");
    expect(manager).not.toContain("selectedRow");
  });

  it("connects every personal OT action to its rendered submission feedback", () => {
    const screen = read("screens-ot.jsx");
    const describedProps = screen.slice(screen.indexOf("function getOtDescribedActionProps("), screen.indexOf("function OtWarning("));
    const requestForm = screen.slice(screen.indexOf("function OtRequestForm("), screen.indexOf("function OtConsentPanel("));
    const consentPanel = screen.slice(screen.indexOf("function OtConsentPanel("), screen.indexOf("function OtActualConfirmationForm("));
    const actualForm = screen.slice(screen.indexOf("function OtActualConfirmationForm("), screen.indexOf("function OtMyRequestsTable("));

    expect(describedProps).toContain('return isDescribed ? { "aria-describedby": descriptionId } : {};');
    expect(requestForm.match(/getOtDescribedActionProps\(/g)).toHaveLength(1);
    expect(requestForm).toContain('{...getOtDescribedActionProps("ot-request-submit-feedback", Boolean(submitState.message))}');
    expect(consentPanel.match(/getOtDescribedActionProps\(/g)).toHaveLength(2);
    expect(consentPanel).toContain('{...getOtDescribedActionProps("ot-consent-submit-feedback", Boolean(submitState.message))}');
    expect(actualForm.match(/getOtDescribedActionProps\(/g)).toHaveLength(1);
    expect(actualForm).toContain('{...getOtDescribedActionProps("ot-actual-submit-feedback", Boolean(submitState.message))}');
  });

  it("exposes ProductSwitch as a labelled control group", () => {
    const app = read("app.jsx");
    const productSwitch = app.slice(app.indexOf("function ProductSwitch("), app.indexOf("function HomeButton("));

    expect(productSwitch).toContain('role: "group"');
    expect(productSwitch).toContain('"aria-label": "Product switch"');
  });

  it("exposes the current module as aria-pressed on every ProductSwitch button", () => {
    const productKeys = ["task-assign", "flowmate", "marketing-plan", "product-book", "ot-request"];

    for (const activeProduct of productKeys) {
      const rendered = renderProductSwitch(activeProduct);
      const buttons = rendered.children;
      expect(buttons).toHaveLength(5);
      expect(buttons.map((button: any) => button.props["aria-pressed"])).toEqual(
        productKeys.map(productKey => productKey === activeProduct),
      );
    }
  });

  it("keeps OT tables contained and keyboard focus visible across themes and viewports", () => {
    const css = read("app.css");
    const otStyles = css.slice(css.indexOf("/* ---------- OT Request shell ---------- */"));
    const mobile = otStyles.slice(otStyles.indexOf("@media (max-width: 760px)"));
    const warningRule = otStyles.slice(otStyles.indexOf(".ot-warning {"), otStyles.indexOf(".ot-warning--error"));
    const darkTheme = css.slice(css.indexOf('html[data-theme="dark"] {'), css.indexOf("}", css.indexOf('html[data-theme="dark"] {')) + 1);

    expect(otStyles).toContain(".ot-table-wrap { overflow-x: auto; }");
    expect(otStyles).toContain(".ot-sidebar .nav-item:focus-visible");
    expect(otStyles).toContain(".ot-link-button:focus-visible");
    expect(warningRule).toContain("background: var(--garena-white);");
    expect(warningRule).toContain("color: var(--garena-iron);");
    expect(darkTheme).toContain("--garena-white: #171A1F;");
    expect(darkTheme).toContain("--garena-iron: #D7DCE2;");
    expect(mobile).toContain(".ot-shell {");
    expect(mobile).toContain("grid-template-columns: minmax(0, 1fr);");
    expect(mobile).toContain(".ot-sidebar {");
    expect(mobile).toContain("overflow-x: auto;");
    expect(mobile).toContain(".ot-metric-grid--employee,");
    expect(mobile).toContain(".ot-form__actions .btn { width: 100%; }");
  });

  it("loads OT runtime files before the application on every tracked entry", () => {
    for (const entry of [["index.html"], ["home", "index.html"], ["product-book", "index.html"]]) {
      const html = read(...entry);
      expect(html.indexOf("ot-request-domain.js")).toBeLessThan(html.indexOf("screens-ot.js"));
      expect(html.indexOf("supabase-ot-request.js")).toBeLessThan(html.indexOf("screens-ot.js"));
      expect(html.indexOf("screens-ot.js")).toBeLessThan(html.indexOf("app.js"));
    }
  });

  it("compiles the OT screen before the application bundle", () => {
    const build = read("build-github.cjs");
    expect(build).toContain('"screens-c.jsx", "screens-ot.jsx", "app.jsx"');
  });

  it("keeps daily OT operations while giving Team Leads a monthly Function report and export flow", () => {
    const screen = read("screens-ot.jsx");
    const client = read("supabase-ot-request.js");
    const sql = read("supabase", "ot_request.sql");

    expect(screen).toContain("function OtMonthlyTeamReport(");
    expect(screen).toContain('type="month"');
    expect(screen).toContain("buildOtMonthlyFunctionReport");
    expect(screen).toContain("Monthly report");
    expect(screen).toContain("Export monthly CSV");
    expect(screen).not.toContain("Compliance & HR");
    expect(screen).not.toContain("HR export");
    expect(client).toContain("window.loadOtHrReady");
    expect(sql).toContain("not public.ot_current_user_is_owner() and not public.ot_current_user_is_eligible_approver()");
    expect(sql).toContain("r.approver_user_id = v_actor_id");
    expect(sql).toContain("v_new_status := 'hr_ready';");
  });
});
