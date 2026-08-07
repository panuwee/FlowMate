# Workgrid OT Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the fourth Workgrid module, OT Request, with private employee self-service, assigned-manager weekly operations, group-event consent, truthful actual-time confirmation, 36-hour controls, root-cause analytics, OT Owner visibility, and HR export.

**Architecture:** Keep the tracked static root as the source of truth. Add a pure browser-compatible domain module for calculations and status derivation, an RPC-only Supabase client, and a focused React screen module compiled by the existing classic-runtime build. Store OT data in isolated Supabase tables protected by RLS and security-definer RPCs that resolve identity through `auth.uid()`; client calculations provide immediate feedback but server calculations are authoritative.

**Tech Stack:** React 18 UMD with precompiled JSX, plain browser JavaScript, Supabase/PostgreSQL, Vitest, PowerShell, existing Workgrid CSS tokens and static entry pages.

## Global Constraints

- Work on branch `version2.1`.
- Preserve FlowMate, Marketing Plan, and Product Book behaviour and permissions.
- Add OT Request as Module 4 after Product Book.
- Do not add payroll calculation, attendance-device integration, continuous GPS, peer OT visibility, time-off-in-lieu calculation, workforce scheduling, or employee performance rankings.
- Use `Asia/Bangkok`; organization workweek defaults to Monday 00:00 through Sunday 23:59.
- Block request submission, consent, and plan approval when projected active OT exceeds 36 hours in an affected workweek.
- Always accept truthful actual time; route an over-limit result to `compliance_review_required` and prevent normal HR-ready/export flow until reviewed.
- Use structured reasons exactly as defined in the approved design.
- Seed `panuwee.w@garena.com` as the OT Owner with module-scoped full visibility.
- Seed Big, Mac, and Pluem as eligible approvers using the approved email addresses.
- Resolve roles and actors server-side; never trust a browser-supplied actor ID or frontend-only role flag.
- Use RPC-only writes and append-only audit history.
- Keep the existing visual system: theme tokens, spacing, type scale, borders, radius, top bar, product switcher, user control, and responsive patterns.
- Source `.jsx` files are canonical. Regenerate compiled `.js` with `npm.cmd run build:github`.
- Update cache-bust versions together in `index.html`, `home/index.html`, and `product-book/index.html` when an active runtime asset changes.
- Do not edit or stage the unrelated untracked campaign-dashboard documents already present in the worktree.

---

## File structure

| File | Responsibility |
|---|---|
| `ot-request-domain.js` | Pure duration, workweek, threshold, status, visibility, and insight helpers exposed as `window.FlowMateOtRequestDomain` |
| `supabase-ot-request.js` | RPC-only browser client exposed through named `window` functions |
| `screens-ot.jsx` | OT shell, employee views, manager views, forms, warnings, compliance review, and export UI |
| `screens-ot.js` | Generated output from `screens-ot.jsx`; never edit directly |
| `app.jsx` | Product key, hash-to-product routing, product switcher, home Module 4 card, and OT shell handoff |
| `app.js` | Generated output from `app.jsx`; never edit directly |
| `app.css` | OT-specific layout and responsive styles using existing tokens |
| `build-github.cjs` | Adds `screens-ot.jsx` to the canonical compile list before `app.jsx` |
| `index.html` | Loads domain, OT client, compiled OT screen, and cache-busted app/runtime assets |
| `home/index.html` | Same OT runtime contract with `../` base path |
| `product-book/index.html` | Same OT runtime contract with `../` base path |
| `supabase/ot_request.sql` | Idempotent OT tables, indexes, helpers, RPCs, RLS, grants, role seeds, and audit rules |
| `supabase/ot_request_verify.sql` | Read-only contract, seed, grant, RLS, and invariant verification |
| `supabase/README.md` | OT deployment order, expected objects, and manual verification |
| `src/lib/ot-request-domain.test.ts` | Executable tests for pure browser domain rules |
| `src/lib/ot-request-client.test.ts` | Executable VM tests for exact Supabase RPC contracts |
| `src/lib/ot-request.uat.test.ts` | Static integration, SQL authorization, UI privacy, copy, cache-bust, and build-contract tests |

---

### Task 1: OT domain rules

**Files:**
- Create: `ot-request-domain.js`
- Create: `src/lib/ot-request-domain.test.ts`

**Interfaces:**
- Consumes: ISO date keys (`YYYY-MM-DD`), local `HH:MM` values, minute counts, and normalized OT request records.
- Produces: `window.FlowMateOtRequestDomain` with `calculateDurationMinutes`, `getWeekStartKey`, `splitMinutesByWeek`, `getLimitState`, `deriveRequestStatus`, `canViewRequest`, `buildRootCauseInsights`, `REASON_OPTIONS`, `LIMIT_MINUTES`, and `TIMEZONE`.

- [ ] **Step 1: Write failing tests for duration, overnight work, workweek boundaries, thresholds, and status**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

function loadDomain() {
  const code = readFileSync(join(process.cwd(), "ot-request-domain.js"), "utf8");
  const sandbox = { window: {} as Record<string, unknown> };
  vm.runInNewContext(code, sandbox);
  return (sandbox.window as any).FlowMateOtRequestDomain;
}

describe("OT request domain", () => {
  it("calculates same-day and overnight minutes after break", () => {
    const domain = loadDomain();
    expect(domain.calculateDurationMinutes({ startTime: "18:00", endTime: "22:30", breakMinutes: 30 })).toBe(240);
    expect(domain.calculateDurationMinutes({ startTime: "22:00", endTime: "02:00", breakMinutes: 30 })).toBe(210);
  });

  it("uses Monday as the Bangkok workweek start", () => {
    const domain = loadDomain();
    expect(domain.getWeekStartKey("2026-08-09")).toBe("2026-08-03");
    expect(domain.getWeekStartKey("2026-08-10")).toBe("2026-08-10");
  });

  it("returns neutral, advisory, high risk, limit, and blocked states", () => {
    const domain = loadDomain();
    expect(domain.getLimitState(23 * 60).key).toBe("neutral");
    expect(domain.getLimitState(24 * 60).key).toBe("advisory");
    expect(domain.getLimitState(30 * 60).key).toBe("high_risk");
    expect(domain.getLimitState(36 * 60).key).toBe("limit_reached");
    expect(domain.getLimitState(36 * 60 + 1).key).toBe("blocked");
  });

  it("keeps over-limit actual time in compliance review", () => {
    const domain = loadDomain();
    expect(domain.deriveRequestStatus({ actualSubmittedAt: "2026-08-09T10:00:00Z", complianceRequired: true })).toBe("compliance_review_required");
  });
});
```

- [ ] **Step 2: Run the domain test and confirm the missing module failure**

Run: `npm.cmd test -- src/lib/ot-request-domain.test.ts`

Expected: FAIL because `ot-request-domain.js` does not exist.

- [ ] **Step 3: Implement the browser-compatible domain contract**

```js
(function (root, factory) {
  const api = factory();
  if (root) root.FlowMateOtRequestDomain = api;
})(typeof window !== "undefined" ? window : null, function () {
  const TIMEZONE = "Asia/Bangkok";
  const LIMIT_MINUTES = 36 * 60;
  const ADVISORY_MINUTES = 24 * 60;
  const HIGH_RISK_MINUTES = 30 * 60;
  const REASON_OPTIONS = Object.freeze([
    { key: "offline_event", label: "Offline Event / Tournament Operation" },
    { key: "campaign_launch", label: "Campaign or Patch Launch" },
    { key: "live_incident", label: "Live Incident / Emergency" },
    { key: "capacity", label: "Workload Exceeds Capacity" },
    { key: "external_schedule", label: "Partner or External Schedule" },
    { key: "rework", label: "Rework / Quality Issue" },
    { key: "scope_change", label: "Scope Changed After Work Started" },
    { key: "travel_offsite", label: "Travel / Off-site Operation" },
    { key: "other", label: "Other" },
  ]);

  function calculateDurationMinutes(input) {
    const [startHour, startMinute] = String(input.startTime).split(":").map(Number);
    const [endHour, endMinute] = String(input.endTime).split(":").map(Number);
    let gross = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (gross <= 0) gross += 24 * 60;
    const net = gross - Number(input.breakMinutes || 0);
    if (!Number.isInteger(net) || net <= 0) throw new Error("OT duration must be greater than zero.");
    return net;
  }

  function getLimitState(totalMinutes) {
    const total = Number(totalMinutes || 0);
    const key = total > LIMIT_MINUTES ? "blocked"
      : total === LIMIT_MINUTES ? "limit_reached"
      : total >= HIGH_RISK_MINUTES ? "high_risk"
      : total >= ADVISORY_MINUTES ? "advisory"
      : "neutral";
    return { key, totalMinutes: total, remainingMinutes: Math.max(0, LIMIT_MINUTES - total) };
  }

  return Object.freeze({
    TIMEZONE,
    LIMIT_MINUTES,
    REASON_OPTIONS,
    calculateDurationMinutes,
    getWeekStartKey,
    splitMinutesByWeek,
    getLimitState,
    deriveRequestStatus,
    canViewRequest,
    buildRootCauseInsights,
  });
});
```

Implement `getWeekStartKey` with UTC-safe date-key arithmetic, not the machine's local timezone. `splitMinutesByWeek` must return `{ weekStart, minutes }[]`; when an occurrence crosses Monday 00:00, require the caller to supply `breakMinutesBeforeBoundary` and `breakMinutesAfterBoundary`, and reject totals that do not equal `breakMinutes`. `deriveRequestStatus` follows the exact status precedence in the approved design, with compliance review taking precedence over HR-ready. `canViewRequest` returns true only for owner, HR/Admin, the employee, or the explicitly assigned approver. `buildRootCauseInsights` implements the five deterministic rules from the design and returns no employee-value judgement.

- [ ] **Step 4: Expand tests for cross-week break allocation, visibility, and insights**

```ts
it("requires explicit break allocation across a workweek boundary", () => {
  const domain = loadDomain();
  expect(() => domain.splitMinutesByWeek({
    startDate: "2026-08-09", startTime: "22:00", endDate: "2026-08-10", endTime: "02:00", breakMinutes: 30,
  })).toThrow("Break allocation is required across a workweek boundary.");
});

it("does not expose peer records", () => {
  const domain = loadDomain();
  expect(domain.canViewRequest({ userId: "peer" }, { employeeUserId: "employee", approverUserId: "lead" })).toBe(false);
  expect(domain.canViewRequest({ userId: "employee" }, { employeeUserId: "employee", approverUserId: "lead" })).toBe(true);
});
```

- [ ] **Step 5: Run the domain suite**

Run: `npm.cmd test -- src/lib/ot-request-domain.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the domain unit**

```powershell
git add -- ot-request-domain.js src/lib/ot-request-domain.test.ts
git commit -m "feat: add OT request domain rules"
```

---

### Task 2: Supabase OT schema, authorization, and workflow RPCs

**Files:**
- Create: `supabase/ot_request.sql`
- Create: `supabase/ot_request_verify.sql`
- Create: `src/lib/ot-request.uat.test.ts`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: existing `public.users`, `auth.uid()`, authenticated Garena users, email identities, and JSON payloads from the OT client.
- Produces: six OT tables, authorization helpers, list/read RPCs, mutation RPCs, audit rows, weekly limit enforcement, and read-only verification output.

- [ ] **Step 1: Write failing SQL contract tests**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

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
  });
});
```

- [ ] **Step 2: Run the backend contract test and confirm missing-file failure**

Run: `npm.cmd test -- src/lib/ot-request.uat.test.ts`

Expected: FAIL because the OT SQL files do not exist.

- [ ] **Step 3: Implement the idempotent installer and role seeds**

Begin the installer with a transaction and create these exact tables:

```sql
begin;

create table if not exists public.ot_system_roles (
  user_id uuid primary key references public.users(id) on delete cascade,
  role_code text not null check (role_code in ('owner', 'hr_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ot_approvers (
  user_id uuid primary key references public.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ot_event_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  function_code text not null check (function_code in ('gdve', 'ops', 'mkt', 'esport')),
  work_location_type text not null check (work_location_type in ('office', 'remote', 'venue')),
  venue text,
  reason_code text not null,
  reason_detail text,
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  planned_break_minutes integer not null default 0 check (planned_break_minutes >= 0),
  approver_user_id uuid not null references public.users(id),
  created_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now()
);
```

`ot_requests` stores one employee and one occurrence with optional `event_plan_id`, source, Function, title, day type, location, reason, planned and actual timestamps/breaks/minutes, week segment JSON, employee/approver/HR facts, compliance flag/outcome, idempotency key, and timestamps. Use text check constraints for the approved states to avoid enum migration coupling. `ot_request_audit` is append-only and records actor, action, old/new status, changed fields JSON, note, and timestamp. `ot_export_batches` stores batch name, creator, included request IDs, and creation timestamp.

Seed roles by joining `public.users` on normalized email; do not insert synthetic users. If an approved identity is not yet in `public.users`, the verification query reports it as missing without weakening authorization.

- [ ] **Step 4: Implement server-authoritative helpers and RPC signatures**

Create the following functions with `security definer`, a fixed `search_path`, explicit grants, and actor resolution through `auth.uid()`:

```sql
public.ot_current_user_is_owner() returns boolean
public.ot_current_user_is_hr_admin() returns boolean
public.ot_current_user_is_eligible_approver() returns boolean
public.ot_current_user_can_read_request(p_request_id uuid) returns boolean
public.ot_calculate_occurrence_minutes(p_start_at timestamptz, p_end_at timestamptz, p_break_minutes integer) returns integer
public.ot_projected_week_minutes(p_employee_user_id uuid, p_week_start date, p_exclude_request_id uuid default null) returns integer
public.ot_get_access_context() returns jsonb
public.ot_get_my_dashboard(p_week_start date) returns jsonb
public.ot_list_my_requests(p_week_start date default null) returns setof public.ot_requests
public.ot_get_manager_dashboard(p_week_start date, p_function_code text default null) returns jsonb
public.ot_list_eligible_approvers() returns jsonb
public.ot_list_people_for_event() returns jsonb
public.ot_create_request(p_payload jsonb, p_idempotency_key uuid) returns jsonb
public.ot_preview_event_plan(p_payload jsonb, p_employee_user_ids uuid[]) returns jsonb
public.ot_create_event_plan(p_payload jsonb, p_employee_user_ids uuid[], p_idempotency_key uuid) returns jsonb
public.ot_record_consent(p_request_id uuid, p_accept boolean, p_idempotency_key uuid) returns jsonb
public.ot_review_plan(p_request_id uuid, p_decision text, p_note text, p_idempotency_key uuid) returns jsonb
public.ot_submit_actual(p_request_id uuid, p_payload jsonb, p_idempotency_key uuid) returns jsonb
public.ot_verify_actual(p_request_id uuid, p_decision text, p_note text, p_idempotency_key uuid) returns jsonb
public.ot_list_compliance_queue(p_week_start date default null) returns jsonb
public.ot_review_compliance(p_request_id uuid, p_outcome text, p_note text, p_idempotency_key uuid) returns jsonb
public.ot_list_request_audit(p_request_id uuid) returns jsonb
public.ot_list_hr_ready(p_week_start date default null) returns setof public.ot_requests
public.ot_mark_exported(p_request_ids uuid[], p_batch_name text, p_idempotency_key uuid) returns jsonb
public.ot_set_approver(p_user_id uuid, p_active boolean, p_reason text, p_idempotency_key uuid) returns jsonb
public.ot_set_system_role(p_user_id uuid, p_role_code text, p_active boolean, p_reason text, p_idempotency_key uuid) returns jsonb
```

Every mutation locks the employee's active week rows before recomputing totals. Request, consent, and plan approval raise an exception containing current, added, remaining, and affected week when the result exceeds 2160 minutes. `ot_submit_actual` always persists valid truthful actual time; when any affected week exceeds 2160 minutes it sets `compliance_required = true`, appends audit, and does not set HR-ready. `ot_review_compliance` never rewrites actual timestamps or minutes. `ot_preview_event_plan` performs the same per-employee limit calculations as creation but never inserts or updates rows. Event creation records the assigned approver's planned authorization; employee consent moves that individual request to approved only after a server limit check. Role/approver changes are owner-only and require a non-empty reason plus append-only audit.

- [ ] **Step 5: Add RLS, grants, audit protection, and read-only verification**

```sql
revoke all on table public.ot_event_plans, public.ot_requests, public.ot_request_audit, public.ot_export_batches from public, anon, authenticated;
grant select on public.ot_requests to authenticated;
grant execute on function public.ot_get_access_context() to authenticated;
grant execute on function public.ot_get_my_dashboard(date) to authenticated;
grant execute on function public.ot_create_request(jsonb, uuid) to authenticated;
grant execute on function public.ot_submit_actual(uuid, jsonb, uuid) to authenticated;
```

Add matching grants for every approved RPC. Direct table mutation remains revoked. Employee select policy covers own rows; assigned approver covers explicitly assigned rows; HR/Admin and OT Owner cover all OT rows. No OT helper may be referenced by RLS policies on non-OT Workgrid tables. The verification script reports tables, functions, grants, RLS state, policy names, role seed counts, append-only audit grants, and the absence of OT policies on FlowMate/Marketing Plan/Product Book tables.

- [ ] **Step 6: Update Supabase deployment documentation**

Add a dedicated `OT Request MVP` section to `supabase/README.md`:

```markdown
### OT Request MVP

For an existing Workgrid database, run only:

1. `supabase/ot_request.sql`
2. `supabase/ot_request_verify.sql` (read-only; run last)

Choose Run without RLS. The installer enables RLS, revokes direct writes, exposes authenticated RPCs, and seeds OT roles only for matching existing users. Production execution is a separate manual step and is not proven by local tests.
```

- [ ] **Step 7: Run focused and full tests**

Run: `npm.cmd test -- src/lib/ot-request.uat.test.ts`

Expected: PASS.

Run: `npm.cmd test`

Expected: all existing and OT tests PASS.

- [ ] **Step 8: Commit the database unit**

```powershell
git add -- supabase/ot_request.sql supabase/ot_request_verify.sql supabase/README.md src/lib/ot-request.uat.test.ts
git commit -m "feat: add OT request backend"
```

---

### Task 3: RPC-only OT browser client

**Files:**
- Create: `supabase-ot-request.js`
- Create: `src/lib/ot-request-client.test.ts`

**Interfaces:**
- Consumes: `window.flowmateSupabase`, JSON form models, request IDs, week keys, and UUID idempotency keys.
- Produces: exact `window` functions consumed by `screens-ot.jsx`.

- [ ] **Step 1: Write failing VM tests for the client contract**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { expect, it } from "vitest";

it("maps OT client calls to exact RPC names and parameters", async () => {
  const calls: Array<{ name: string; params: unknown }> = [];
  const sandbox = { window: { flowmateSupabase: { rpc: async (name: string, params: unknown) => {
    calls.push({ name, params });
    return { data: { ok: true }, error: null };
  } } } };
  vm.runInNewContext(readFileSync(join(process.cwd(), "supabase-ot-request.js"), "utf8"), sandbox);
  await (sandbox.window as any).createOtRequest({ title: "Patch launch" }, "11111111-1111-4111-8111-111111111111");
  expect(calls[0]).toEqual({
    name: "ot_create_request",
    params: { p_payload: { title: "Patch launch" }, p_idempotency_key: "11111111-1111-4111-8111-111111111111" },
  });
});
```

- [ ] **Step 2: Run the client test and confirm missing-file failure**

Run: `npm.cmd test -- src/lib/ot-request-client.test.ts`

Expected: FAIL because `supabase-ot-request.js` does not exist.

- [ ] **Step 3: Implement the exact client surface**

```js
async function callOtRequestRpc(name, params, fallbackMessage) {
  if (!window.flowmateSupabase) throw new Error("OT Request data service is not ready.");
  const { data, error } = await window.flowmateSupabase.rpc(name, params || {});
  if (error) throw new Error(window.flowmateUserError ? window.flowmateUserError(error, fallbackMessage) : error.message || fallbackMessage);
  return data;
}

window.loadOtAccessContext = () => callOtRequestRpc("ot_get_access_context", {}, "OT access could not be loaded.");
window.loadMyOtDashboard = weekStart => callOtRequestRpc("ot_get_my_dashboard", { p_week_start: weekStart }, "Your OT dashboard could not be loaded.");
window.loadMyOtRequests = weekStart => callOtRequestRpc("ot_list_my_requests", { p_week_start: weekStart || null }, "Your OT requests could not be loaded.");
window.loadOtManagerDashboard = (weekStart, functionCode) => callOtRequestRpc("ot_get_manager_dashboard", { p_week_start: weekStart, p_function_code: functionCode || null }, "Team OT could not be loaded.");
window.loadOtEligibleApprovers = () => callOtRequestRpc("ot_list_eligible_approvers", {}, "OT approvers could not be loaded.");
window.loadOtPeopleForEvent = () => callOtRequestRpc("ot_list_people_for_event", {}, "Event participants could not be loaded.");
window.createOtRequest = (payload, key) => callOtRequestRpc("ot_create_request", { p_payload: payload, p_idempotency_key: key }, "OT request could not be submitted.");
```

Add wrappers named `previewOtEventPlan`, `createOtEventPlan`, `recordOtConsent`, `reviewOtPlan`, `submitOtActual`, `verifyOtActual`, `loadOtComplianceQueue`, `reviewOtCompliance`, `loadOtRequestAudit`, `loadOtHrReady`, `markOtExported`, `setOtApprover`, and `setOtSystemRole`. Parameters must match Task 2 exactly. Do not expose direct `.from(...).insert/update/delete` OT writes.

- [ ] **Step 4: Test success, server error, and missing-client paths**

Assert each wrapper's RPC name, parameter names, returned data, and readable error. Assert the source contains no direct OT table mutation.

- [ ] **Step 5: Run the client suite**

Run: `npm.cmd test -- src/lib/ot-request-client.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the client unit**

```powershell
git add -- supabase-ot-request.js src/lib/ot-request-client.test.ts
git commit -m "feat: add OT request client"
```

---

### Task 4: Module 4 home card, product routing, and OT shell

**Files:**
- Create: `screens-ot.jsx`
- Modify: `app.jsx:22`
- Modify: `app.jsx:162-174`
- Modify: `app.jsx:547-575`
- Modify: `app.jsx:778-818`
- Modify: `app.jsx:1016-1050`
- Modify: `app.jsx:1110-1280`
- Modify: `build-github.cjs:16`
- Modify: `index.html`
- Modify: `home/index.html`
- Modify: `product-book/index.html`
- Modify: `app.css`
- Modify: `src/lib/ot-request.uat.test.ts`

**Interfaces:**
- Consumes: `window.loadOtAccessContext`, authenticated user props, existing `HomeButton`, `ProductSwitch`, `ThemeToggle`, `Avatar`, and `Icon` globals.
- Produces: `OT_REQUEST_PRODUCT_KEY`, `chooseOtRequestProduct`, `OtRequestShell`, four product cards, and hash route `#ot-request`.

- [ ] **Step 1: Add failing static integration tests**

```ts
it("adds OT Request as the fourth product without changing the first three", () => {
  const app = read("app.jsx");
  expect(app).toContain('const OT_REQUEST_PRODUCT_KEY = "ot-request"');
  expect(app).toContain("function chooseOtRequestProduct()");
  expect(app).toContain("function OtRequestShell(");
  const productChoice = app.slice(app.indexOf("function ProductChoiceScreen"), app.indexOf("function normalizeProductBookArrayInput"));
  expect(productChoice.indexOf('"FlowMate"')).toBeLessThan(productChoice.indexOf('"Marketing Plan"'));
  expect(productChoice.indexOf('"Marketing Plan"')).toBeLessThan(productChoice.indexOf('"Product Book"'));
  expect(productChoice.indexOf('"Product Book"')).toBeLessThan(productChoice.indexOf('"OT Request"'));
});

it("loads OT runtime files before the application on every tracked entry", () => {
  for (const entry of [["index.html"], ["home", "index.html"], ["product-book", "index.html"]]) {
    const html = read(...entry);
    expect(html).toContain("ot-request-domain.js?v=20260807-01");
    expect(html).toContain("supabase-ot-request.js?v=20260807-01");
    expect(html).toContain("screens-ot.js?v=20260807-01");
    expect(html.indexOf("ot-request-domain.js")).toBeLessThan(html.indexOf("screens-ot.js"));
    expect(html.indexOf("supabase-ot-request.js")).toBeLessThan(html.indexOf("screens-ot.js"));
    expect(html.indexOf("screens-ot.js")).toBeLessThan(html.indexOf("app.js"));
  }
});
```

- [ ] **Step 2: Run focused UAT and confirm failures**

Run: `npm.cmd test -- src/lib/ot-request.uat.test.ts`

Expected: FAIL because the fourth module and OT screen are absent.

- [ ] **Step 3: Add the focused OT JSX compilation unit**

Update the compile list:

```js
const FILES = ["data.jsx", "screens-a.jsx", "screens-b.jsx", "screens-c.jsx", "screens-ot.jsx", "app.jsx"];
```

Create `screens-ot.jsx` with these initial exported globals:

```jsx
function OtRequestShell({ user, currentUserName, currentUserEmail, avatarMemberId, onHome, onSwitchFlowMate, onSwitchMarketingPlan, onSwitchProductBook, onSwitchOtRequest, onSignOut }) {
  const [access, setAccess] = useStateApp({ status: "loading", canManage: false, canExport: false, isOwner: false });
  const [activeView, setActiveView] = useStateApp("overview");
  useEffectApp(() => {
    let alive = true;
    window.loadOtAccessContext().then(data => alive && setAccess({ status: "ready", ...data })).catch(error => alive && setAccess({ status: "error", message: error.message }));
    return () => { alive = false; };
  }, [user && user.id]);
  return React.createElement("div", { className: "ot-shell" },
    React.createElement("main", { className: "ot-shell__main" }, "OT Request")
  );
}

window.OtRequestShell = OtRequestShell;
```

- [ ] **Step 4: Wire product state and navigation in `app.jsx`**

Add `OT_REQUEST_PRODUCT_KEY`, include it in valid products and hash detection, add `chooseOtRequestProduct`, pass `onChooseOtRequest` to `ProductChoiceScreen`, render `OtRequestShell` for the active OT product, and add OT Request to every `ProductSwitch`. The Home card copy is exactly:

```text
Plan overtime, collect employee consent, confirm actual hours, and monitor weekly team workload.
```

Use the badge `Workforce` and an existing clock/calendar-compatible icon. Do not reorder the first three products.

OT deep links use the existing slash-aware hash parser: `#ot-request`, `#ot-request/my-requests`, `#ot-request/manager`, and `#ot-request/root-causes`. `OtRequestShell` reads the segment after `ot-request/` and rejects views the server access context does not authorize.

- [ ] **Step 5: Load runtime assets and add shell styles**

Add the three OT scripts to all tracked entry pages. Add `.ot-shell`, `.ot-sidebar`, `.ot-main`, `.ot-metric-grid`, `.ot-warning`, and responsive rules to `app.css` using existing CSS variables. Do not add a new font, gradient, shadow system, or colour-only warning.

- [ ] **Step 6: Compile and run focused tests**

Run: `npm.cmd run build:github`

Expected: `UPDATED screens-ot.js` and `UPDATED app.js`.

Run: `npm.cmd test -- src/lib/ot-request.uat.test.ts src/lib/flowmate-static-build.uat.test.ts`

Expected: PASS.

- [ ] **Step 7: Re-run the build for idempotency**

Run: `npm.cmd run build:github`

Expected: `No output changed.`

- [ ] **Step 8: Commit the module shell**

```powershell
git add -- screens-ot.jsx screens-ot.js app.jsx app.js app.css build-github.cjs index.html home/index.html product-book/index.html src/lib/ot-request.uat.test.ts
git commit -m "feat: add OT Request module shell"
```

---

### Task 5: Employee dashboard, request, consent, and actual confirmation

**Files:**
- Modify: `screens-ot.jsx`
- Modify: `app.css`
- Modify: `src/lib/ot-request.uat.test.ts`
- Modify: `src/lib/ot-request-domain.test.ts`

**Interfaces:**
- Consumes: `loadMyOtDashboard`, `loadMyOtRequests`, `createOtRequest`, `recordOtConsent`, `submitOtActual`, `FlowMateOtRequestDomain`, and access context.
- Produces: `OtEmployeeDashboard`, `OtRequestForm`, `OtConsentPanel`, `OtActualConfirmationForm`, `OtMyRequestsTable`, and shared warning/status components.

- [ ] **Step 1: Write failing employee-journey tests**

```ts
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
```

- [ ] **Step 2: Run focused UAT and confirm missing-component failure**

Run: `npm.cmd test -- src/lib/ot-request.uat.test.ts`

Expected: FAIL on employee components and test IDs.

- [ ] **Step 3: Implement dashboard loading and action routing**

`OtEmployeeDashboard` loads the selected Bangkok week and renders:

```jsx
React.createElement("section", { className: "ot-metric", "data-testid": "ot-week-total" },
  React.createElement("span", null, "Week total"),
  React.createElement("strong", null, formatOtHours(summary.countedMinutes), " / 36h"),
  React.createElement(OtLimitProgress, { totalMinutes: summary.countedMinutes })
)
```

Show planned, confirmed, action count, remaining hours, consent-required actions, actual-confirmation actions, and the own-request table. Never load the manager RPC for an employee-only access context.

- [ ] **Step 4: Implement the individual request form**

Collect exactly the approved minimum planned fields. Use structured reason keys from `REASON_OPTIONS`; require detail for `other`, `live_incident`, `rework`, and `scope_change`. Calculate preview duration and projected total in the browser, display current/added/remaining hours, require an unchecked-by-default consent checkbox with the current consent statement version, and disable submit above 2160 projected minutes. Submit the same data to the server and display the server error if totals changed concurrently.

```jsx
React.createElement("label", { className: "ot-consent" },
  React.createElement("input", { type: "checkbox", checked: form.consented, onChange: event => setForm({ ...form, consented: event.target.checked }) }),
  React.createElement("span", null, "I consent to this overtime occurrence and confirm the planned date and time shown above.")
)
```

- [ ] **Step 5: Implement event consent and actual confirmation**

Consent displays the assigned event, Function, venue, planned schedule, break, planned hours, week total, and remaining hours before the action. Actual confirmation prefills the plan but allows truthful start/end/break changes. Require a variance reason when net actual differs by more than 30 minutes. If the server returns compliance review, show the critical message and saved status; never tell the employee the save failed.

For an occurrence crossing Monday 00:00, show two break inputs labelled by affected week and require their sum to match total break before submitting.

- [ ] **Step 6: Implement employee loading, empty, error, and retry states**

Use visible text and focus movement for errors. Preserve in-progress form state in React state during retry. Generate one UUID idempotency key per user intent and reuse it for retry; generate a new key only after success or an explicit new action.

- [ ] **Step 7: Compile and test**

Run: `npm.cmd run build:github`

Run: `npm.cmd test -- src/lib/ot-request-domain.test.ts src/lib/ot-request-client.test.ts src/lib/ot-request.uat.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the employee journey**

```powershell
git add -- screens-ot.jsx screens-ot.js app.css src/lib/ot-request.uat.test.ts src/lib/ot-request-domain.test.ts
git commit -m "feat: add employee OT workflow"
```

---

### Task 6: Manager weekly operations, group event plans, and root-cause insights

**Files:**
- Modify: `screens-ot.jsx`
- Modify: `app.css`
- Modify: `src/lib/ot-request.uat.test.ts`
- Modify: `src/lib/ot-request-domain.test.ts`

**Interfaces:**
- Consumes: `loadOtManagerDashboard`, `loadOtEligibleApprovers`, `loadOtPeopleForEvent`, `previewOtEventPlan`, `createOtEventPlan`, `reviewOtPlan`, `verifyOtActual`, domain insight helpers, and access context.
- Produces: `OtManagerDashboard`, `OtApprovalQueue`, `OtEventPlanForm`, `OtTeamWeekTable`, and `OtRootCausePanel`.

- [ ] **Step 1: Write failing manager and privacy tests**

```ts
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
```

- [ ] **Step 2: Run focused UAT and confirm missing-manager failure**

Run: `npm.cmd test -- src/lib/ot-request.uat.test.ts`

Expected: FAIL on manager components and labels.

- [ ] **Step 3: Implement manager summary, filters, and assigned-scope table**

Render planned, confirmed, pending approval, and near-limit metrics. Default grouping is Function, then employee. Columns are employee, Function, assignment/event, planned, actual, weekly total, remaining, and status. Filters are week, Function, event, reason, status, and near-limit. The client only renders rows returned by the assigned-scope manager RPC; it does not fetch all rows and filter them in the browser.

- [ ] **Step 4: Implement approval and actual verification queues**

Each action opens details before decision, shows consent timestamp, planned/actual variance, weekly total, and warnings. Reject/return requires a note. Bulk actual verification calls individual RPCs with individual idempotency keys and stops on the first error; it never bypasses missing consent, limit errors, variance reason, or compliance review.

- [ ] **Step 5: Implement group Event OT creation**

The form collects shared title, Function, schedule, break, location/venue, reason/detail, assigned approver, and participants. Before submit it calls `previewOtEventPlan` and presents the returned per-employee projected totals; rows that exceed the limit are excluded with a clear reason. `createOtEventPlan` recalculates the same limits inside its transaction before producing individual assignments in `Awaiting consent`. The result displays aggregate `Consent received N/M` without exposing names to non-leads.

- [ ] **Step 6: Implement deterministic root-cause panels**

Show OT hours by Function, reasons, planned/emergency share, plan/actual variance, recurring weeks, and the approved five insight rules. Label the section `OT Health & Root Cause`. Every manager insight action retains current filters and only opens server-authorized rows.

- [ ] **Step 7: Compile and test**

Run: `npm.cmd run build:github`

Run: `npm.cmd test -- src/lib/ot-request-domain.test.ts src/lib/ot-request.uat.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the manager journey**

```powershell
git add -- screens-ot.jsx screens-ot.js app.css src/lib/ot-request.uat.test.ts src/lib/ot-request-domain.test.ts
git commit -m "feat: add manager OT operations"
```

---

### Task 7: OT Owner, compliance review, audit, and HR export

**Files:**
- Modify: `screens-ot.jsx`
- Modify: `supabase-ot-request.js`
- Modify: `app.css`
- Modify: `src/lib/ot-request-client.test.ts`
- Modify: `src/lib/ot-request.uat.test.ts`

**Interfaces:**
- Consumes: access context, `loadOtComplianceQueue`, `reviewOtCompliance`, `loadOtRequestAudit`, `loadOtHrReady`, `markOtExported`, `setOtApprover`, `setOtSystemRole`, manager dashboard filters, and audit data returned by approved RPCs.
- Produces: `OtOwnerDashboard`, `OtComplianceQueue`, `OtAuditTimeline`, `OtAccessAdminPanel`, `OtHrExportPanel`, and a CSV download containing approved non-payroll columns.

- [ ] **Step 1: Write failing owner-scope and export tests**

```ts
it("grants the configured OT Owner full OT visibility without widening other modules", () => {
  const sql = read("supabase", "ot_request.sql");
  const screen = read("screens-ot.jsx");
  expect(sql).toContain("panuwee.w@garena.com");
  expect(sql).toContain("ot_current_user_is_owner");
  expect(screen).toContain("function OtOwnerDashboard(");
  expect(screen).toContain("function OtComplianceQueue(");
  expect(screen).toContain("function OtAccessAdminPanel(");
  expect(screen).toContain("function OtHrExportPanel(");
  expect(sql).not.toMatch(/create policy[^;]+on public\.(work_items|marketing_plans|product_book)/is);
});
```

- [ ] **Step 2: Run focused UAT and confirm missing owner UI failure**

Run: `npm.cmd test -- src/lib/ot-request.uat.test.ts`

Expected: FAIL on owner/compliance/export components.

- [ ] **Step 3: Implement owner-only full-visibility navigation**

When `access.isOwner` is true, show all Functions, named drill-down, compliance queue, audit, role/approver management entry, and export. `OtAccessAdminPanel` uses only `setOtApprover` and `setOtSystemRole`; every change requires a written reason. Do not infer owner from `currentUserEmail` in JSX; render only from the server access context. Owner intervention outside normal assignment requires a note and uses the server's real actor identity.

- [ ] **Step 4: Implement compliance review**

Show actual time, plan, weekly segments, projected versus actual variance, employee explanation, manager verification note, affected week totals, and immutable audit entries. Outcome and note are mandatory. The UI must not offer an edit that reduces actual hours. After success, refresh dashboard, audit, and HR-ready list.

- [ ] **Step 5: Implement privacy-safe CSV export**

CSV columns are:

```text
request_id,employee_email,function,assignment,event_id,work_date,day_type,planned_start,planned_end,planned_break_minutes,planned_minutes,actual_start,actual_end,actual_break_minutes,actual_minutes,reason_code,reason_detail,approver_email,employee_confirmed_at,verified_at,compliance_outcome,hr_ready_at
```

Do not include salary, pay rate, bank data, password, GPS trail, or other Workgrid-module data. Escape commas, quotes, and newlines. Create the local download only from `ot_list_hr_ready` results; after the browser successfully creates the file, call `ot_mark_exported` with the exact included IDs and batch name. If marking fails, tell the user the local file exists but server export status remains unchanged.

- [ ] **Step 6: Expand client and authorization tests**

Assert exact compliance and export RPC parameters, source absence of direct writes, owner server-context usage, employee absence of manager/owner navigation, and no owner email check in JSX.

- [ ] **Step 7: Compile and test**

Run: `npm.cmd run build:github`

Run: `npm.cmd test -- src/lib/ot-request-client.test.ts src/lib/ot-request.uat.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit owner and HR operations**

```powershell
git add -- screens-ot.jsx screens-ot.js supabase-ot-request.js app.css src/lib/ot-request-client.test.ts src/lib/ot-request.uat.test.ts
git commit -m "feat: add OT owner and HR controls"
```

---

### Task 8: End-to-end integration, accessibility, static release, and handoff

**Files:**
- Modify: `index.html`
- Modify: `home/index.html`
- Modify: `product-book/index.html`
- Modify: `app.css`
- Modify: `src/lib/ot-request.uat.test.ts`
- Create: `docs/OT_REQUEST_RELEASE_HANDOFF.md`

**Interfaces:**
- Consumes: all verified OT frontend, domain, client, and SQL units.
- Produces: synchronized static assets, final automated evidence, rendered QA evidence, SQL/upload order, and a release handoff that separates local verification from production actions.

- [ ] **Step 1: Add final static and accessibility assertions**

```ts
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

it("uses labelled warnings and accessible actions", () => {
  const screen = read("screens-ot.jsx");
  expect(screen).toContain('role: "alert"');
  expect(screen).toContain('"aria-live": "polite"');
  expect(screen).toContain('"aria-describedby"');
  expect(screen).toContain('"aria-current": "page"');
});
```

- [ ] **Step 2: Finalize responsive and state styling**

Verify desktop at 1440×1000 and mobile at 390×844. Tables become readable compact cards or horizontally contained regions; primary actions remain visible; warnings use icon, heading, message, and colour; focus indicators remain visible; dark-mode contrast is readable; hidden role sections are not rendered into the DOM.

- [ ] **Step 3: Bump active entry-page asset versions together**

Set `20260807-02` for `app.css`, `ot-request-domain.js`, `supabase-ot-request.js`, `screens-ot.js`, and `app.js` in all three tracked entry pages. Do not change unrelated asset versions.

- [ ] **Step 4: Run complete automated verification**

Run: `npm.cmd test`

Expected: all tests PASS.

Run: `npm.cmd run build`

Expected: Next production build completes successfully.

Run: `npm.cmd run build:github`

Expected: `No output changed.` after the already-generated artifacts are current.

Run: `npx.cmd secretlint "**/*"`

Expected: PASS with no committed secret finding.

- [ ] **Step 5: Run local rendered QA**

Start the existing local static server from the repository root and inspect:

```text
/home
/#ot-request
/#ot-request/my-requests
/#ot-request/manager
/#ot-request/root-causes
```

Use a signed-in test context permitted by the existing local harness. Capture desktop and mobile screenshots. Verify four home cards, product switching, employee privacy, request warning states, consent, actual confirmation, manager Function grouping, root-cause copy, OT Owner navigation, compliance review, export state, empty/error/loading states, keyboard navigation, light theme, and dark theme. If local auth or database data cannot exercise a role, report that role's rendered QA as unverified rather than fabricating a pass.

- [ ] **Step 6: Write the release handoff**

`docs/OT_REQUEST_RELEASE_HANDOFF.md` contains:

```markdown
# OT Request Release Handoff

## Local verification
- Automated test result and count
- Next production build result
- Static build idempotency result
- Secret scan result
- Browser QA routes, viewport sizes, and evidence paths

## Production steps not performed locally
1. Back up Supabase.
2. Run `supabase/ot_request.sql` using Run without RLS.
3. Run `supabase/ot_request_verify.sql` and confirm every expected count/invariant.
4. Upload the changed tracked runtime/source files through the approved manual GitHub web UI workflow.
5. Upload `index.html`, `home/index.html`, and `product-book/index.html` last.
6. Hard-refresh and run production smoke tests with employee, assigned approver, OT Owner, and HR/Admin accounts.

## Rollback boundary
- Frontend rollback: restore the previous runtime files and three entry pages together.
- Database rollback: do not drop or delete OT history; deactivate the OT module and revoke RPC execution pending a reviewed rollback migration.
```

- [ ] **Step 7: Re-run checks after handoff creation**

Run: `npm.cmd test`

Run: `git diff --check`

Expected: all tests PASS and no whitespace errors.

- [ ] **Step 8: Commit final integration and handoff**

```powershell
git add -- index.html home/index.html product-book/index.html app.css src/lib/ot-request.uat.test.ts docs/OT_REQUEST_RELEASE_HANDOFF.md
git commit -m "test: verify OT Request MVP"
```

---

## Final verification gate

- [ ] Confirm `git branch --show-current` returns `version2.1`.
- [ ] Confirm `git status --short` contains only the pre-existing unrelated untracked campaign-dashboard documents.
- [ ] Confirm `npm.cmd test` passes.
- [ ] Confirm `npm.cmd run build` passes.
- [ ] Confirm `npm.cmd run build:github` reports no output changed.
- [ ] Confirm `npx.cmd secretlint "**/*"` passes.
- [ ] Confirm rendered desktop/mobile QA or record the exact environment limitation.
- [ ] Confirm no production SQL, deployment, payroll integration, or live role verification is claimed without direct evidence.
- [ ] Confirm the handoff lists SQL before frontend upload and all three entry pages last.
