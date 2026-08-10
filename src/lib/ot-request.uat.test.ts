import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
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
      onSwitchFlowMate() {},
      onSwitchMarketingPlan() {},
      onSwitchProductBook() {},
      onSwitchOtRequest() {},
    },
  };
  runInNewContext(`
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
    expect(sql).not.toMatch(/p_actor(_user)?_id/i);
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
    for (const name of [
      "ot_get_access_context",
      "ot_get_manager_dashboard",
      "ot_list_people_for_event",
      "ot_list_compliance_queue",
      "ot_review_compliance",
      "ot_list_hr_ready",
      "ot_mark_exported",
    ]) {
      expect(functionSql(sql, name)).toContain("public.ot_current_user_is_hr_admin()");
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

  it("returns privacy-scoped HR-ready export rows with normalized identity emails", () => {
    const hrReady = functionSql(sql, "ot_list_hr_ready");

    expect(sql).toContain("drop function if exists public.ot_list_hr_ready(date)");
    expect(hrReady).toContain("returns setof jsonb");
    expect(hrReady).toContain("security definer");
    expect(hrReady).toContain("set search_path = ''");
    expect(hrReady).toMatch(/ot_current_user_is_owner\(\)[\s\S]*ot_current_user_is_hr_admin\(\)[\s\S]*raise exception/);
    expect(hrReady).toMatch(/to_jsonb\(r\)[\s\S]*jsonb_build_object\([\s\S]*'employee_email'[\s\S]*lower\(pg_catalog\.btrim\(employee\.email\)\)[\s\S]*'approver_email'[\s\S]*lower\(pg_catalog\.btrim\(approver\.email\)\)/);
    expect(hrReady).toMatch(/join public\.users employee on employee\.id = r\.employee_user_id[\s\S]*join public\.users approver on approver\.id = r\.approver_user_id/);
    expect(hrReady).toMatch(/r\.status = 'hr_ready'[\s\S]*r\.hr_ready_at is not null[\s\S]*compliance_reviewed_at is not null/);
    expect(hrReady).toMatch(/p_week_start is null[\s\S]*actual_week_segments[\s\S]*weekStart/);
    expect(hrReady).toContain("order by r.actual_start_at, r.id");
    expect(sql).toContain("grant execute on function public.ot_list_hr_ready(date) to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)\s+on\s+public\.ot_requests\s+to\s+authenticated/i);
    expect(verify).toContain("HR-ready export RPC contract (Expected = SETOF jsonb with normalized emails)");
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
    for (const caller of ["ot_create_request", "ot_create_event_plan", "ot_record_consent", "ot_review_plan"]) {
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
    expect(dashboard).toContain("'remainingPlannedMinutes', pg_catalog.greatest(0, 2160 - v_counted)");
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
    const reviewPlan = functionSql(sql, "ot_review_plan");
    const firstGuard = reviewPlan.slice(0, reviewPlan.indexOf("public.ot_lock_employee_weeks"));
    const lockedGuard = reviewPlan.slice(reviewPlan.indexOf("for update"), reviewPlan.indexOf("update public.ot_requests"));

    expect(firstGuard).toContain("v_request.status <> 'pending_approval'");
    expect(lockedGuard).toContain("v_request.status <> 'pending_approval'");
    expect(reviewPlan).not.toMatch(/status not in \('pending_approval', 'revision_required'\)/);
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
    expect(resubmit).toContain("select distinct pg_catalog.coalesce(item->>'weekStart', item->>'week_start')::date as week_start");
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
    const reviewPlan = functionSql(sql, "ot_review_plan");
    const verifyActual = functionSql(sql, "ot_verify_actual");

    for (const decision of [reviewPlan, verifyActual]) {
      expect(decision).toMatch(/v_note text := pg_catalog\.nullif\(pg_catalog\.btrim\(pg_catalog\.coalesce\(p_note, ''\)\), ''\)/);
      expect(decision).toMatch(/note, idempotency_key[\s\S]*v_note, p_idempotency_key/);
      expect(decision).not.toMatch(/note, idempotency_key[\s\S]*p_note, p_idempotency_key/);
    }
    expect(reviewPlan).toMatch(/p_decision in \('rejected', 'revision_required'\)[\s\S]*v_note is null[\s\S]*note is required/i);
    expect(verifyActual).toMatch(/p_decision in \('rejected', 'revision_required'\)[\s\S]*v_note is null[\s\S]*note is required/i);
    expect(verifyActual).toMatch(/p_decision = 'approved'[\s\S]*v_request\.compliance_required[\s\S]*v_note is null[\s\S]*note is required/i);
  });

  it("serializes approver authority before week locks and rechecks it after the request row lock", () => {
    for (const name of ["ot_review_plan", "ot_verify_actual"]) {
      const decision = functionSql(sql, name);
      const authorityLock = "for key share of a";
      const weekLock = "perform public.ot_lock_employee_weeks(";
      const requestLock = "select * into v_request from public.ot_requests r where r.id = p_request_id for update;";

      expect(decision).toContain(authorityLock);
      expect(decision.indexOf(authorityLock)).toBeLessThan(decision.indexOf(weekLock));
      expect(decision.indexOf(weekLock)).toBeLessThan(decision.indexOf(requestLock));

      const afterRequestLock = decision.slice(decision.indexOf(requestLock) + requestLock.length);
      expect(afterRequestLock).toMatch(/v_request\.approver_user_id <> v_actor_id/);
      expect(afterRequestLock).toMatch(/not public\.ot_current_user_is_eligible_approver\(\)/);
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
    expect(sql).toMatch(/update public\.ot_request_audit a[\s\S]*actor_email_snapshot = pg_catalog\.nullif\(pg_catalog\.lower\(pg_catalog\.btrim\(u\.email\)\), ''\)[\s\S]*from public\.users u[\s\S]*u\.id = a\.actor_user_id[\s\S]*a\.actor_email_snapshot is null/);
    expect(sql).toMatch(/alter table public\.ot_request_audit[\s\S]*alter column actor_email_snapshot set not null/);
    expect(snapshotTrigger).toMatch(/select pg_catalog\.nullif\(pg_catalog\.lower\(pg_catalog\.btrim\(u\.email\)\), ''\)[\s\S]*into v_actor_email[\s\S]*u\.id = new\.actor_user_id/);
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
    const updateEnd = reassign.indexOf("end loop", updateStart);
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

    for (const api of ["loadMyOtDashboard", "loadMyOtRequests", "loadOtEligibleApprovers", "createOtRequest", "recordOtConsent", "submitOtActual"]) {
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
    expect(employee).toContain('aria-label="Assigned approver"');
    expect(employee).toContain("approver.displayName || approver.email");
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
    for (const field of ["functionCode", "title", "workDate", "startTime", "endTime", "dayType", "workLocationType", "venue", "reasonCode", "reasonDetail", "approverUserId"]) expect(requestForm).toContain(field);
    expect(requestForm).toContain("getCanonicalCountedSegments(request)");
    expect(requestForm).toContain("excludedSegments");
    expect(requestForm).toContain("window.resubmitOtPlan(request.id, payload, OT_CONSENT_STATEMENT_VERSION, intent.key)");
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

  it("keeps plan revisions out of the manager queue and shares audited amendment action", () => {
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
    expect(screen.match(/<OtActualAmendmentAction/g)).toHaveLength(2);
  });

  it("remounts the shared actual amendment action for each loaded request", () => {
    const screen = read("screens-ot.jsx");

    expect(screen).toContain('<OtActualAmendmentAction key={getOtManagerRequestId(selectedRow)} access={access} request={selectedRow}');
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

  it("renders owner, compliance, audit, access, and HR export only from server access capabilities", () => {
    const sql = read("supabase", "ot_request.sql");
    const screen = read("screens-ot.jsx");

    expect(sql).toContain("panuwee.w@garena.com");
    expect(sql).toContain("ot_current_user_is_owner");
    for (const component of ["OtOwnerDashboard", "OtComplianceQueue", "OtAuditTimeline", "OtAccessAdminPanel", "OtHrExportPanel"]) {
      expect(screen).toContain(`function ${component}(`);
    }
    expect(screen).toContain('owner: "ot-request/owner"');
    expect(screen).toContain('compliance: "ot-request/compliance"');
    expect(screen).toContain('audit: "ot-request/audit"');
    expect(screen).toContain('access: "ot-request/access"');
    expect(screen).toContain('export: "ot-request/export"');
    expect(screen).toContain('access.status === "ready" && access.isOwner');
    expect(screen).toContain('access.status === "ready" && (access.isOwner || access.isHrAdmin)');
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

  it("exports only explicit HR-ready selections after a local CSV download succeeds", () => {
    const screen = read("screens-ot.jsx");
    const panel = screen.slice(screen.indexOf("function OtHrExportPanel("), screen.indexOf("function OtAccessAdminPanel("));
    const exactColumns = "request_id,employee_email,function,assignment,event_id,work_date,day_type,planned_start,planned_end,planned_break_minutes,planned_minutes,actual_start,actual_end,actual_break_minutes,actual_minutes,reason_code,reason_detail,approver_email,employee_confirmed_at,verified_at,compliance_outcome,hr_ready_at";

    expect(panel).toContain("window.loadOtHrReady(");
    expect(panel).toContain("window.FlowMateOtHrExport.createLocalFile(selectedRows, batchName.trim(), downloadOtHrCsv)");
    expect(panel).toContain("window.markOtExported(includedIds, batchName.trim(), intentKey)");
    expect(panel.indexOf("window.FlowMateOtHrExport.createLocalFile(")).toBeLessThan(panel.indexOf("window.markOtExported("));
    expect(panel).toContain("local CSV exists, but server export status remains unchanged");
    expect(panel).toContain("The local file was not created, and the server was not marked exported.");
    expect(panel).toContain("window.FlowMateOtHrExport.createLocalFile(");
    expect(read("supabase-ot-request.js")).toContain(exactColumns);
    expect(panel).not.toMatch(/salary|pay rate|bank|password|gps/i);
  });

  it("keeps audit read-only and access administration restricted to audited server RPCs", () => {
    const screen = read("screens-ot.jsx");
    const audit = screen.slice(screen.indexOf("function OtAuditTimeline("), screen.indexOf("function OtComplianceQueue("));
    const admin = screen.slice(screen.indexOf("function OtAccessAdminPanel("), screen.indexOf("function OtOwnerDashboard("));

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
    expect(admin).toContain("OT_APPROVER_DISPLAY_DIRECTORY");
    expect(admin).toContain("display-only");
    expect(admin).toContain("server validates");
    expect(screen).not.toContain("OT_APPROVED_APPROVER_EMAILS");
    for (const email of ["nithidol.k@garena.com", "weerayut@garena.com", "napol.a@garena.com"]) {
      expect(screen.match(new RegExp(email.replaceAll(".", "\\."), "g"))).toHaveLength(1);
    }
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
    const admin = screen.slice(screen.indexOf("function OtAccessAdminPanel("), screen.indexOf("function OtOwnerDashboard("));

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
    expect(screen).toContain('"ot-request/manager"');
    expect(screen).toContain('"ot-request/root-causes"');
    expect(screen).toContain("access.isEligibleApprover");
    expect(screen).toContain('if (access.status === "loading") return;');
    expect(screen).toContain('const visibleView = canOpenOtRequestView(activeView, access) ? activeView : "overview";');
  });

  it("keeps active entry pages on one OT release version", () => {
    const entries = [["index.html"], ["home", "index.html"], ["product-book", "index.html"]].map(parts => read(...parts));

    for (const html of entries) {
      expect(html).toContain("ot-request-domain.js?v=20260807-02");
      expect(html).toContain("supabase-ot-request.js?v=20260807-02");
      expect(html).toContain("screens-ot.js?v=20260807-02");
      expect(html).toContain("app.js?v=20260807-02");
      expect(html).toContain("app.css?v=20260807-02");
    }
  });

  it("uses labelled warnings and accessible OT navigation state", () => {
    const screen = read("screens-ot.jsx");
    const warning = screen.slice(screen.indexOf("function getOtAnnouncementProps("), screen.indexOf("function OtLimitProgress("));
    const navigation = screen.slice(screen.indexOf('<nav className="ot-sidebar"'), screen.indexOf("</nav>", screen.indexOf('<nav className="ot-sidebar"')));

    expect(warning).toContain('? { role: "alert" }');
    expect(warning).toContain('{ role: "status", "aria-live": "polite" }');
    expect(navigation).toContain('aria-label="OT Request navigation"');
    expect(navigation.match(/aria-current=\{visibleView ===/g)).toHaveLength(9);
    for (const view of ["overview", "my-requests", "manager", "root-causes", "compliance", "audit", "export", "owner", "access"]) {
      expect(navigation).toContain(`aria-current={visibleView === "${view}" ? "page" : undefined}`);
    }
    expect(screen).not.toContain("function getOtCurrentPageProps(");
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
    const productKeys = ["flowmate", "marketing-plan", "product-book", "ot-request"];

    for (const activeProduct of productKeys) {
      const rendered = renderProductSwitch(activeProduct);
      const buttons = rendered.children;
      expect(buttons).toHaveLength(4);
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
});
