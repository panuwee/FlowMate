# FlowMate Real Schedule Permission, Product Book Navigation, and Assignment Diagnosis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Real narrowly scoped cross-team Time/Status authority, remove Product Book patch-button borders, and provide an evidence-based Ploy assignment diagnostic without changing assignment behavior.

**Architecture:** A dedicated user capability is exposed by auth bootstrap and enforced by two narrow security-definer RPCs; existing broad table RLS and full-row actions remain unchanged. Product Book receives a component-scoped CSS reset. Assignment investigation is delivered as read-only SQL so no assignment rule or production data is changed before evidence exists.

**Tech Stack:** React UMD source in `github/app.jsx`, Supabase/PostgreSQL SQL, Vitest source-contract UAT, generated GitHub Pages runtime.

## Global Constraints

- `N/A Time` is cancelled and must not be implemented.
- Real remains a member; do not set `role = 'admin'`.
- Schedule authority covers only Time and Marketing placement Status across teams.
- Do not broaden direct table UPDATE/DELETE RLS for schedule operators.
- Do not transition linked FlowMate status from a Marketing placement-status change.
- Do not run live SQL, deploy, commit, push, or tag.
- Preserve unrelated dirty-worktree changes.
- Manual deployment workflow requires exact SQL and GitHub upload lists.

---

## File Structure

- Create `supabase/marketing_plan_schedule_operator.sql`: additive production installer and grants for the dedicated capability/RPCs.
- Create `supabase/diagnose_ploy_pointer_mag_assignment.sql`: read-only diagnostic queries.
- Modify `supabase/schema.sql`: canonical user capability.
- Modify `supabase/marketing_plan.sql`: canonical schedule RPCs.
- Modify `supabase/workflow_team_workspaces.sql`: canonical all-team access for Real.
- Modify `supabase/whitelist_access.sql`: preserve Real's member role and schedule capability on canonical reruns.
- Modify `github/supabase-quick-task.js`: bootstrap capability with backward-compatible fallback.
- Modify `github/app.jsx`: split full-row/schedule permission and add the schedule-only Time action/RPC calls.
- Modify `github/app.css`: Product Book-scoped patch-button reset.
- Modify `github/index.html`, `github/home/index.html`, `github/product-book/index.html`: matching cache tokens.
- Modify `docs/ACCESS_MATRIX.md`: document Real's bounded authority.
- Modify `src/lib/flowmate.uat.test.ts`: frontend, SQL, diagnosis, styling, and cache contracts.
- Regenerate `github/app.js` from `github/app.jsx`.

### Task 1: Backend schedule-operator contract

**Files:**
- Create: `supabase/marketing_plan_schedule_operator.sql`
- Modify: `supabase/schema.sql`
- Modify: `supabase/marketing_plan.sql`
- Modify: `supabase/workflow_team_workspaces.sql`
- Modify: `supabase/whitelist_access.sql`
- Test: `src/lib/flowmate.uat.test.ts`

**Interfaces:**
- Produces: `users.can_manage_marketing_schedule boolean`
- Produces: `marketing_plan_update_working_row_time(p_content_item_id uuid, p_publish_time time) returns jsonb`
- Produces: `marketing_plan_update_working_row_status(p_content_item_id uuid, p_placement_status text) returns jsonb`
- Consumes: authenticated `auth.uid()`, existing PIC/Sub PIC/Admin relationships, linked `work_items`

- [ ] **Step 1: Add failing SQL contract tests**

Add assertions requiring the new column, normalized Real-email backfill, `can_access_all_teams`, fixed empty search path, authenticated-only grants, status allowlist, content/placement/link time updates, and the absence of any broadened schedule-operator table RLS.

```ts
expect(operatorSql).toContain("can_manage_marketing_schedule boolean not null default false");
expect(operatorSql).toContain("lower(email) = 'fco.punyakon@garena.com'");
expect(operatorSql).toContain("can_access_all_teams = true");
expect(operatorSql).toContain("set search_path = ''");
expect(operatorSql).toContain("marketing_plan_update_working_row_time");
expect(operatorSql).toContain("marketing_plan_update_working_row_status");
expect(operatorSql).not.toMatch(/create policy[\s\S]*can_manage_marketing_schedule/i);
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npm.cmd test -- src/lib/flowmate.uat.test.ts --reporter=dot`  
Expected: FAIL because the operator installer/capability/RPC contracts do not exist.

- [ ] **Step 3: Implement the additive installer**

Implement an idempotent column/backfill and two security-definer RPCs. Each RPC must lock the content item, resolve the actor from `auth.uid()`, require an active user and one of Admin/PIC/Sub PIC/operator, and update only its named schedule field.

```sql
alter table public.users
  add column if not exists can_manage_marketing_schedule boolean not null default false;

update public.users
set can_access_all_teams = true,
    can_manage_marketing_schedule = true,
    updated_at = now()
where lower(email) = 'fco.punyakon@garena.com'
  and is_active = true;
```

Validate status against:

```sql
('planned','assigned','review','ready','ready_to_post','scheduled','posted','delayed','cancelled')
```

Revoke from `public, anon`; grant execute only to `authenticated`.

- [ ] **Step 4: Mirror the contract into canonical SQL**

Add the column to canonical schema, add Real to the all-team capability backfill without changing the member role, and add the exact RPC definitions to `marketing_plan.sql`.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run: `npm.cmd test -- src/lib/flowmate.uat.test.ts --reporter=dot`  
Expected: PASS for the new SQL contract tests and existing Marketing Plan tests.

### Task 2: Frontend schedule-only authority for Real

**Files:**
- Modify: `github/supabase-quick-task.js`
- Modify: `github/app.jsx`
- Modify: `docs/ACCESS_MATRIX.md`
- Test: `src/lib/flowmate.uat.test.ts`

**Interfaces:**
- Consumes: `FLOWMATE_CURRENT_USER.can_manage_marketing_schedule`
- Consumes: the two Task 1 RPCs
- Produces: `canManageMarketingPlanSchedule(row)` and schedule-only UI controls

- [ ] **Step 1: Add failing frontend tests**

Require bootstrap selection/fallback of the capability, a distinct schedule guard, RPC calls, Time-only schedule action, status-select schedule permission, and retention of full-row denial.

```ts
expect(authSource).toContain("can_manage_marketing_schedule");
expect(workingSheetSource).toContain("function canManageMarketingPlanSchedule(row)");
expect(workingSheetSource).toContain("marketing_plan_update_working_row_time");
expect(workingSheetSource).toContain("marketing_plan_update_working_row_status");
expect(workingSheetSource).toContain("canManageMarketingPlanWorkingRow(row)");
```

Assert that Real's capability is not used to enable Delete, full Edit, Repair Link, Create Brief, or Sub PIC mutation.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test -- src/lib/flowmate.uat.test.ts --reporter=dot`  
Expected: FAIL on the missing capability/guard/RPC/UI contracts.

- [ ] **Step 3: Extend auth bootstrap safely**

Select `can_manage_marketing_schedule`; if the column is absent, retry the legacy profile selection and expose `false`. Add the boolean to `FLOWMATE_CURRENT_USER`.

- [ ] **Step 4: Split permissions and add schedule controls**

Keep `canManageMarketingPlanWorkingRow(row)` unchanged. Add:

```js
function canManageMarketingPlanSchedule(row) {
  const currentUser = window.FLOWMATE_CURRENT_USER || {};
  return canManageMarketingPlanWorkingRow(row)
    || Boolean(currentUser.id && currentUser.can_manage_marketing_schedule);
}
```

Use the schedule guard for Status. Add a Time-only action/modal that submits only a valid value from `MARKETING_PLAN_PUBLISH_TIME_OPTIONS` to the time RPC. Full Edit/Delete/Create Brief/Repair Link continue using the full-row guard.

- [ ] **Step 5: Add linked-status explanation and access documentation**

When effective Review/Delivered comes from linked FlowMate status, explain that Marketing status does not transition FlowMate. Update the access matrix with the exact allowed/denied scope.

- [ ] **Step 6: Run focused tests and confirm GREEN**

Run: `npm.cmd test -- src/lib/flowmate.uat.test.ts --reporter=dot`  
Expected: PASS.

### Task 3: Product Book patch-navigation border reset

**Files:**
- Modify: `github/app.jsx`
- Modify: `github/app.css`
- Test: `src/lib/product-book-cms.uat.test.ts`

**Interfaces:**
- Produces: Product Book-only class `product-book-patch-nav`
- Preserves: shared `.nav-item` contract

- [ ] **Step 1: Add failing style-contract test**

```ts
expect(app).toContain("nav-item product-book-patch-nav");
expect(css).toContain(".product-book-patch-nav");
expect(css).toMatch(/\.product-book-patch-nav\s*\{[^}]*border-top:\s*0;/s);
expect(css).toMatch(/\.product-book-patch-nav\s*\{[^}]*border-right:\s*0;/s);
expect(css).toMatch(/\.product-book-patch-nav\s*\{[^}]*border-bottom:\s*0;/s);
```

Also assert `.nav-item.is-active` still contains its red left-border behavior.

- [ ] **Step 2: Run test and confirm RED**

Run: `npm.cmd test -- src/lib/product-book-cms.uat.test.ts --reporter=dot`  
Expected: FAIL because the scoped patch class/reset is absent.

- [ ] **Step 3: Implement the scoped reset**

Add the class only to Product Book patch buttons and CSS equivalent to:

```css
.product-book-patch-nav {
  width: 100%;
  border-top: 0;
  border-right: 0;
  border-bottom: 0;
  background: transparent;
  font: inherit;
  text-align: left;
}
```

Do not set `border-left: 0`; the shared active state owns the red left indicator.

- [ ] **Step 4: Run test and confirm GREEN**

Run: `npm.cmd test -- src/lib/product-book-cms.uat.test.ts --reporter=dot`  
Expected: PASS.

### Task 4: Ploy assignment diagnostic

**Files:**
- Create: `supabase/diagnose_ploy_pointer_mag_assignment.sql`
- Test: `src/lib/flowmate.uat.test.ts`

**Interfaces:**
- Produces: read-only result sets; no writes/functions/policies
- Consumes: `work_items`, `users`, `team_members`, `assignment_runs`, `work_item_events`, deployed `flowmate_run_assignment`

- [ ] **Step 1: Add a failing read-only diagnostic contract test**

Require both requester emails, Ploy owner filter, `capacity_snapshot` decision source/actor, event actor, candidate health, requester/owning team context, and deployed function body/fingerprint. Reject all mutation keywords at statement starts.

- [ ] **Step 2: Run focused tests and confirm RED**

Run: `npm.cmd test -- src/lib/flowmate.uat.test.ts --reporter=dot`  
Expected: FAIL because the diagnostic file is absent.

- [ ] **Step 3: Add the read-only SQL**

Include five labelled SELECT blocks for affected items, assignment events, candidate health, requester-context drift, and deployed function fingerprint. Include interpretation comments for `manual_assignment_rpc`, old-engine mismatch, context drift, and candidate-link drift.

- [ ] **Step 4: Run focused tests and confirm GREEN**

Run: `npm.cmd test -- src/lib/flowmate.uat.test.ts --reporter=dot`  
Expected: PASS.

### Task 5: Integration, runtime, cache, and visual QA

**Files:**
- Regenerate: `github/app.js`
- Modify: `github/index.html`
- Modify: `github/home/index.html`
- Modify: `github/product-book/index.html`
- Test: all Vitest suites

**Interfaces:**
- Consumes: verified Tasks 1-4
- Produces: deployable runtime and exact manual handoff

- [ ] **Step 1: Run targeted integration tests**

Run: `npm.cmd test -- src/lib/flowmate.uat.test.ts src/lib/product-book-cms.uat.test.ts --reporter=dot`  
Expected: PASS.

- [ ] **Step 2: Regenerate GitHub runtime twice**

Run: `npm.cmd run build:github`  
Run again: `npm.cmd run build:github`  
Expected second run: `No output changed.`

- [ ] **Step 3: Update matching cache tokens**

Set `app.js?v=20260804-06` and `app.css?v=20260804-02` in all three entry pages. Update cache assertions that intentionally pin these assets.

- [ ] **Step 4: Run full verification**

Run: `npm.cmd test -- --reporter=dot`  
Run: `npm.cmd run build`  
Run: `git diff --check`  
Expected: zero failures and zero diff-check errors.

- [ ] **Step 5: Render and inspect UI**

Verify desktop/mobile Working Sheet as Admin, ordinary member, and schedule-operator mock states. Verify Product Book patch buttons have no black rectangle while active background/red left indicator remain.

- [ ] **Step 6: Independent review and handoff**

Review backend authorization separately from frontend visibility. Report diagnostic SQL as not yet run against live Supabase. Provide installer run order and exact runtime/source upload list; do not deploy.
