# Workgrid OT Request Final Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make OT Request safe for staging UAT by enforcing one requested-or-actual weekly total, a locked actual-confirmation state machine, fixed elevated-role allowlists, complete server invariants, and executable PostgreSQL regression coverage.

**Architecture:** Keep one `ot_requests` row per employee occurrence. Requested schedule data is recorded before work; submitted actual data replaces requested data for the same occurrence in one canonical Bangkok-week accounting helper. All writes remain authenticated RPCs guarded by row/advisory locks, RLS, server allowlists, idempotency, and append-only audit evidence.

**Tech Stack:** PostgreSQL 15 / Supabase SQL and RLS, Supabase CLI 2.111.0 with pgTAP, JavaScript, React 18, Next.js 14, Vitest, static GitHub build.

## Global Constraints

- Work only on branch `version2.1`; do not merge, push, deploy, or execute production SQL in this plan.
- Bangkok workweek is Monday 00:00 through Sunday 23:59 in `Asia/Bangkok`; the limit is exactly `2160` minutes.
- The employee submits one OT Request before work and confirms actual time after work; Actual replaces Requested for the same occurrence and is never added to it.
- Actual time above 36 hours remains truthfully recordable only after authorized work occurred; it must route to `compliance_review_required`.
- Sole OT Owner is `panuwee.w@garena.com`. Fixed approved elevated identities are `nithidol.k@garena.com`, `weerayut@garena.com`, and `napol.a@garena.com`.
- Employee visibility is own-only; manager visibility is assigned-only; Owner and allowed active HR/Admin roles have OT-only full visibility.
- Do not add payroll, salary, OT rate, GPS, time-clock integration, or employee performance scoring.
- Preserve RPC-only writes, `SECURITY DEFINER` with `set search_path = ''`, RLS, ordered employee-week locks, and idempotency keys.
- Do not modify or stage the five unrelated Campaign Dashboard and Supabase performance documents already present in the worktree.
- Every task must capture a failing test before production edits, run focused GREEN tests, run a scoped review, and commit only its named files.

## File Responsibility Map

- `supabase/ot_request.sql`: authoritative OT schema, calculations, state transitions, authorization, audit, RLS, and RPC grants.
- `supabase/ot_request_verify.sql`: read-only post-install verification; no DDL or DML.
- `supabase/tests/ot_request_test_bootstrap.sql`: disposable local database bootstrap containing only the minimum `public.users` contract and installer load.
- `supabase/tests/ot_request_policy.test.sql`: executable pgTAP behavior tests for accounting, workflow, authorization, locks, RLS, and export gates.
- `supabase/README.md`: local database test and manual staging SQL instructions.
- `supabase-ot-request.js`: browser RPC adapters and HR CSV helper.
- `ot-request-domain.js`: pure browser/domain calculations and analytics helpers.
- `screens-ot.jsx`: OT employee, manager, Owner, compliance, revision, and analytics UI.
- `screens-ot.js`: generated static browser build; never edit directly.
- `app.jsx` and `app.js`: ProductSwitch accessibility only; `app.js` is generated.
- `src/lib/ot-request.uat.test.ts`: static shell/source contract tests; not a substitute for pgTAP.
- `src/lib/ot-request-client.test.ts`: executable RPC adapter and CSV tests.
- `src/lib/ot-request-domain.test.ts`: executable pure-domain accounting and analytics tests.
- `package.json`: local pgTAP command only; no new package dependency.
- `docs/OT_REQUEST_RELEASE_HANDOFF.md`: verification evidence and explicit unverified staging/browser/deploy gates.

---

### Task 1: Disposable PostgreSQL Policy Test Harness

**Files:**
- Create: `supabase/tests/ot_request_test_bootstrap.sql`
- Create: `supabase/tests/ot_request_policy.test.sql`
- Modify: `package.json`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: local Supabase CLI `2.111.0`, Docker, `auth.uid()`, and `supabase/ot_request.sql`.
- Produces: `npm.cmd run test:ot-db` and reusable pgTAP fixtures with fixed UUIDs for employee, assigned approver, non-assigned approver, Owner, allowed HR, and unauthorized legacy HR.

- [ ] **Step 1: Add the local database command**

Add this script to `package.json` without adding a dependency:

```json
"test:ot-db": "supabase test db --local supabase/tests/ot_request_policy.test.sql"
```

- [ ] **Step 2: Write the disposable bootstrap**

Create `supabase/tests/ot_request_test_bootstrap.sql` with `\set ON_ERROR_STOP on`, recreate only the disposable `public` schema, create the minimum users contract, seed deterministic identities, then load the installer:

```sql
create table public.users (
  id uuid primary key,
  email text not null unique,
  display_name text,
  requester_team text,
  is_active boolean not null default true
);

insert into public.users (id, email, display_name, requester_team) values
  ('00000000-0000-0000-0000-000000000001', 'employee@garena.com', 'Employee', 'esport'),
  ('00000000-0000-0000-0000-000000000002', 'nithidol.k@garena.com', 'Big', 'esport'),
  ('00000000-0000-0000-0000-000000000003', 'other.manager@garena.com', 'Other manager', 'ops'),
  ('00000000-0000-0000-0000-000000000004', 'panuwee.w@garena.com', 'Panu', 'mkt'),
  ('00000000-0000-0000-0000-000000000005', 'weerayut@garena.com', 'Mac', 'esport'),
  ('00000000-0000-0000-0000-000000000006', 'legacy.hr@garena.com', 'Legacy HR', 'ops');

\ir ../ot_request.sql
```

- [ ] **Step 3: Write the initial pgTAP smoke test**

Create `supabase/tests/ot_request_policy.test.sql`; load the bootstrap, enable pgTAP, and prove the installer compiled and direct authenticated DML remains denied:

```sql
\set ON_ERROR_STOP on
\ir ot_request_test_bootstrap.sql
create extension if not exists pgtap with schema extensions;
select extensions.no_plan();
select extensions.has_function('public', 'ot_submit_actual', array['uuid','jsonb','uuid']);
select extensions.has_function('public', 'ot_current_user_is_hr_admin', array[]::text[]);
select extensions.table_privs_are(
  'public', 'ot_requests', 'authenticated', array['SELECT'],
  'authenticated has no direct OT request mutation privilege'
);
select * from extensions.finish();
```

- [ ] **Step 4: Run the test and record the environment gate**

Run:

```powershell
npx.cmd supabase start
npm.cmd run test:ot-db
```

Expected: pgTAP PASS. If Docker or local Supabase is unavailable, stop; report the exact prerequisite failure and do not replace this test with regex assertions.

- [ ] **Step 5: Run existing tests and commit**

Run `npm.cmd test -- src/lib/ot-request.uat.test.ts`, then commit only the four Task 1 files with `test: add executable OT database policy harness`.

---

### Task 2: Canonical Requested-or-Actual Weekly Accounting

**Files:**
- Modify: `supabase/ot_request.sql`
- Modify: `supabase/ot_request_verify.sql`
- Modify: `supabase/tests/ot_request_policy.test.sql`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: Task 1 pgTAP fixtures and existing `ot_lock_employee_weeks(jsonb)` lock order.
- Produces: `public.ot_counted_week_minutes_unchecked(uuid,date,uuid) returns integer`; dashboards return `countedMinutes`; `ot_assert_planned_limit` and actual compliance use the same helper.

- [ ] **Step 1: Write failing mixed-week pgTAP cases**

Add executable cases proving:

```sql
select extensions.is(
  public.ot_counted_week_minutes_unchecked(employee_id, date '2026-08-03', null),
  2400,
  '20h submitted actual plus a different 20h active request counts as 40h'
);

select extensions.is(
  public.ot_counted_week_minutes_unchecked(employee_id, date '2026-08-03', replaced_request_id),
  expected_without_replaced_request,
  'exclude request removes exactly one occurrence'
);
```

Also assert an 18-hour actual replaces, rather than adds to, its own 20-hour requested schedule; plan revision with no actual is excluded; actual revision remains counted; HR-ready/exported actual remains in historical totals.

- [ ] **Step 2: Run RED**

Run `npm.cmd run test:ot-db`.

Expected: FAIL because `ot_counted_week_minutes_unchecked` does not exist and the mixed 20h + 20h case is not 2400.

- [ ] **Step 3: Implement one canonical helper**

Replace planned-only accounting with one lateral segment choice:

```sql
cross join lateral pg_catalog.jsonb_array_elements(
  case
    when r.actual_submitted_at is not null and r.actual_week_segments is not null
      then r.actual_week_segments
    else r.planned_week_segments
  end
) segment
```

Count active workflow statuses plus `revision_required` only when actual was already submitted. Exclude `draft`, `rejected`, `cancelled`, and pre-work `revision_required`. Keep `ot_actual_week_minutes` only as an actual-only reporting metric.

- [ ] **Step 4: Route every policy decision through the helper**

Use `ot_counted_week_minutes_unchecked` in `ot_assert_planned_limit`, request preview, event preview/create, consent, plan approval, `ot_submit_actual`, personal dashboard, manager dashboard rows, compliance views, and export evidence. During actual submission calculate `counted excluding current request + new actual segments` while holding the union of old requested, old actual, and new actual week locks.

- [ ] **Step 5: Remove the public history leak**

Revoke authenticated execution of `ot_projected_week_minutes(uuid,date,uuid)` and do not grant the new unchecked helper. Access totals only through scoped dashboard/preview RPCs.

- [ ] **Step 6: Update verification and run GREEN**

Make `supabase/ot_request_verify.sql` assert the canonical helper, `countedMinutes` dashboard key, and absence of an authenticated projected-total grant. Run:

```powershell
npm.cmd run test:ot-db
npm.cmd test -- src/lib/ot-request.uat.test.ts
```

Expected: both PASS, including mixed requested-plus-actual behavior.

- [ ] **Step 7: Commit**

Commit only the four Task 2 files with `fix: use canonical OT weekly accounting`.

---

### Task 3: Actual Confirmation State Machine and Audited Amendment

**Files:**
- Modify: `supabase/ot_request.sql`
- Modify: `supabase/ot_request_verify.sql`
- Modify: `supabase/tests/ot_request_policy.test.sql`
- Modify: `supabase-ot-request.js`
- Modify: `src/lib/ot-request-client.test.ts`

**Interfaces:**
- Consumes: Task 2 canonical counted helper.
- Produces: hardened `ot_submit_actual(uuid,jsonb,uuid)` and `ot_request_actual_amendment(uuid,text,uuid) returns jsonb`; browser wrapper `requestOtActualAmendment(requestId, reason, key)`.

- [ ] **Step 1: Write failing state-transition tests**

Add pgTAP `throws_ok` cases for actual submission when the employee request is unapproved, event consent is missing, requested end is in the future, supplied actual end is in the future, and an actual decision is already `approved`. Add passing cases for first submission from an authorized completed occurrence and resubmission only after `actual_decision='revision_required'`.

- [ ] **Step 2: Run RED**

Run `npm.cmd run test:ot-db`.

Expected: the five forbidden submissions currently succeed or reach the wrong guard.

- [ ] **Step 3: Add the locked server guard**

After advisory lock, employee-week locks, and `FOR UPDATE`, require this exact predicate before changing actual fields:

```sql
(
  (source = 'employee_request' and plan_decision = 'approved')
  or
  (source = 'event_plan' and employee_consent = 'accepted')
)
and planned_end_at <= now()
and v_end_at <= now()
and (
  (status in ('approved', 'actual_confirmation_required') and actual_submitted_at is null and actual_decision is null)
  or
  (status = 'revision_required' and actual_decision = 'revision_required')
)
```

Never clear an approved actual decision, compliance review, or HR-ready fact through `ot_submit_actual`.

- [ ] **Step 4: Add an audited correction request**

Implement `ot_request_actual_amendment` as Owner/allowed-HR only, require a non-empty reason, reject `exported`, lock the request, preserve the current actual values, set `actual_decision='revision_required'`, clear only downstream readiness fields, and append an audit event containing the previous approval and immutable reason. The employee then uses the existing actual form to submit corrected truth; the resubmission audit captures old and new values.

- [ ] **Step 5: Add adapter tests and grants**

Add:

```js
window.requestOtActualAmendment = (requestId, reason, key) =>
  callOtRequestRpc("ot_request_actual_amendment", {
    p_request_id: requestId,
    p_reason: reason,
    p_idempotency_key: key,
  }, "OT actual amendment could not be requested.");
```

Test the exact RPC name/keys, revoke public/anon access, grant authenticated execution, and verify idempotent replay returns the original result.

- [ ] **Step 6: Run GREEN and commit**

Run `npm.cmd run test:ot-db` and `npm.cmd test -- src/lib/ot-request-client.test.ts src/lib/ot-request.uat.test.ts`. Commit the five files with `fix: enforce OT actual state transitions`.

---

### Task 4: Fixed Owner and HR Authorization Boundary

**Files:**
- Modify: `supabase/ot_request.sql`
- Modify: `supabase/ot_request_verify.sql`
- Modify: `supabase/tests/ot_request_policy.test.sql`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: fixed three-email helper `ot_user_is_approved_approver_identity(uuid)` and Owner remediation RPC.
- Produces: `ot_current_user_is_hr_admin()` that requires active user, active HR role, and fixed identity membership.

- [ ] **Step 1: Write failing legacy-role authorization tests**

Seed `legacy.hr@garena.com` with an active `hr_admin` row and assert `ot_current_user_is_hr_admin()` is false, full-scope reads are denied, and RLS exposes no other employee rows. Assert an allowed active HR identity is true and the Owner can deactivate the unauthorized legacy row with a reason.

- [ ] **Step 2: Run RED**

Run `npm.cmd run test:ot-db`.

Expected: legacy HR currently resolves true.

- [ ] **Step 3: Harden the helper at the authorization source**

Change `ot_current_user_is_hr_admin()` to require:

```sql
and public.ot_user_is_approved_approver_identity(u.id)
and r.role_code = 'hr_admin'
and r.active = true
```

Do not duplicate allowlist logic in UI or individual read RPCs; all elevated access must flow through this helper.

- [ ] **Step 4: Preserve remediation and deactivation state**

Keep `ot_set_system_role(..., p_active=false, ...)` available to the Owner for unauthorized legacy cleanup. Change installer seeds for `ot_approvers` and non-owner roles to `ON CONFLICT DO NOTHING` so rerunning SQL does not silently reactivate an audited deactivation. Preserve the sole Owner seed intentionally.

- [ ] **Step 5: Verify every propagation point**

Update read-only verification for access context, compliance, audit, export, event people, manager full scope, and RLS. Run pgTAP and focused UAT, then commit the four files with `fix: enforce fixed OT elevated identities`.

---

### Task 5: Employee Plan Revision and Actual Amendment UI

**Files:**
- Modify: `supabase/ot_request.sql`
- Modify: `supabase/ot_request_verify.sql`
- Modify: `supabase/tests/ot_request_policy.test.sql`
- Modify: `supabase-ot-request.js`
- Modify: `ot-request-domain.js`
- Modify: `screens-ot.jsx`
- Modify: `screens-ot.js`
- Modify: `src/lib/ot-request-client.test.ts`
- Modify: `src/lib/ot-request-domain.test.ts`
- Modify: `src/lib/ot-request.uat.test.ts`

**Interfaces:**
- Consumes: Task 2 counted helper and Task 3 amendment RPC.
- Produces: `ot_resubmit_plan(uuid,jsonb,text,uuid) returns jsonb`, `resubmitOtPlan(requestId,payload,consentVersion,key)`, employee plan-revision form, and Owner/HR audited actual-correction action.

- [ ] **Step 1: Write failing backend and UI tests**

Prove a pre-work `revision_required` request cannot be approved again, can be resubmitted only by its employee, locks the union of old/new weeks, recalculates duration, overlap and 36-hour capacity, records current consent version, clears the old plan decision, and returns to `pending_approval`. Add UAT assertions that the manager queue excludes it until resubmission and the employee sees `Edit and resubmit request`.

- [ ] **Step 2: Run RED**

Run pgTAP plus `npm.cmd test -- src/lib/ot-request-client.test.ts src/lib/ot-request-domain.test.ts src/lib/ot-request.uat.test.ts`.

- [ ] **Step 3: Implement `ot_resubmit_plan`**

Allow only `source='employee_request'`, `status='revision_required'`, `actual_submitted_at is null`, and `plan_decision='revision_required'`. Accept the same normalized schedule fields as creation plus `p_consent_statement_version`; validate them server-side, lock old and new employee weeks, exclude the current request during overlap/limit checks, then set:

```sql
status = 'pending_approval',
plan_decision = null,
plan_decision_note = null,
plan_reviewed_by_user_id = null,
plan_reviewed_at = null,
employee_consent = 'accepted',
employee_consented_at = now()
```

Append one `resubmit_plan` audit containing old/new schedule segments and consent version.

Restrict `ot_review_plan` itself to `status='pending_approval'`; the UI queue filter is not an authorization control.

- [ ] **Step 4: Add the employee revision form**

Refactor `OtRequestForm` to accept `mode`, `request`, and `onSuccess`. In revision mode prefill the existing request, use `resubmitOtPlan`, rotate idempotency only after a settled error followed by an edit, disable the full fieldset while submitting, and label the action `Resubmit corrected request`.

- [ ] **Step 5: Fix manager and amendment actions**

Filter plan approvals to `status='pending_approval'` only. In Owner/HR request detail add `Request actual correction`, require a reason, show that the old actual remains in audit, and call `requestOtActualAmendment`; never expose the action after export.

- [ ] **Step 6: Build and verify**

Run focused pgTAP/Vitest, `npm.cmd run build:github`, rerun it expecting `No output changed.`, then `npm.cmd run build`. Commit the ten Task 5 files with `feat: complete OT revision workflows`.

---

### Task 6: Server Input Invariants, Decision Evidence, Audit Identity, and Approver Reassignment

**Files:**
- Modify: `supabase/ot_request.sql`
- Modify: `supabase/ot_request_verify.sql`
- Modify: `supabase/tests/ot_request_policy.test.sql`
- Modify: `supabase-ot-request.js`
- Modify: `screens-ot.jsx`
- Modify: `screens-ot.js`
- Modify: `src/lib/ot-request-client.test.ts`
- Modify: `src/lib/ot-request.uat.test.ts`
- Modify: `supabase/README.md`

**Interfaces:**
- Consumes: Task 2 locks/accounting and Task 5 resubmission.
- Produces: authoritative reason/consent/overlap helpers, immutable audit email snapshots, `ot_reassign_pending_approver(uuid,uuid,text,uuid)`, and safe approver deactivation UI.

- [ ] **Step 1: Write failing invariant tests**

Use pgTAP to reject reason codes outside:

```text
offline_event, campaign_launch, live_incident, capacity,
external_schedule, rework, scope_change, travel_offsite, other
```

Require non-empty detail for `other`, `live_incident`, `rework`, and `scope_change`; accept only consent statement version `2026-08-07`; reject overlapping canonical intervals during individual create, event create, plan resubmit, and actual submit under employee-week locks.

- [ ] **Step 2: Write failing evidence and lifecycle tests**

Reject empty manager notes for plan rejection/revision, actual rejection/revision, and approval of a compliance-required actual. Prove audit rows store normalized `actor_email_snapshot`. Prove approver deactivation fails while pending requests exist, while atomic reassignment moves every non-final request, writes one audit per request plus one administration audit, and then permits deactivation.

- [ ] **Step 3: Run RED**

Run `npm.cmd run test:ot-db`; record each invariant that currently passes incorrectly.

- [ ] **Step 4: Implement shared validation helpers**

Add server helpers `ot_assert_reason(text,text)`, `ot_assert_consent_version(text)`, and `ot_assert_no_employee_overlap(uuid,timestamptz,timestamptz,uuid)`. The overlap helper selects actual interval when actual was submitted, otherwise requested interval; it excludes draft/rejected/cancelled and the current request, and runs only after ordered week locks.

- [ ] **Step 5: Enforce decision evidence**

Normalize `p_note` once inside review RPCs. Raise before mutation when the decision is rejection/revision and the note is empty, or when approving `compliance_required=true` with an empty note.

- [ ] **Step 6: Add immutable actor email evidence**

Add nullable `actor_email_snapshot`, backfill from `public.users`, set it `NOT NULL`, and create a `BEFORE INSERT` trigger that derives normalized email from `actor_user_id`. Reject audit insertion if no active historical user identity can be resolved; callers must not supply or override the snapshot.

- [ ] **Step 7: Add atomic reassignment**

Implement Owner-only `ot_reassign_pending_approver(p_from_user_id,p_to_user_id,p_reason,p_idempotency_key)`. Validate the destination is an active approved approver, lock affected request IDs in order, update only non-final requested/actual workflow states, and audit old/new approver IDs. Make `ot_set_approver(...,false,...)` reject while such rows remain.

- [ ] **Step 8: Add Owner UI and adapters**

When disabling an approver with pending work, show a required destination selector and reason, call reassignment first, refresh, then allow deactivation as a separate idempotent action. Disable controls during each RPC and do not claim atomic completion across two browser calls; the server reassignment itself is atomic.

- [ ] **Step 9: Run GREEN and commit**

Run pgTAP, focused client/UAT, static build twice, and Next build. Commit the nine Task 6 files with `fix: enforce OT evidence and reassignment rules`.

---

### Task 7: Authorized Root-Cause Trend and Workload Concentration

**Files:**
- Modify: `ot-request-domain.js`
- Modify: `screens-ot.jsx`
- Modify: `screens-ot.js`
- Modify: `app.jsx`
- Modify: `app.js`
- Modify: `app.css`
- Modify: `src/lib/ot-request-domain.test.ts`
- Modify: `src/lib/ot-request.uat.test.ts`

**Interfaces:**
- Consumes: five weeks of rows already returned by the server-scoped manager dashboard RPC.
- Produces: `buildOtWeeklyTrend(rows,weekStarts)` and `buildOtWorkloadConcentration(rows)`; accessible current-module state.

- [ ] **Step 1: Write failing behavior tests**

Test five ordered week buckets including zero weeks; count only approved actual minutes; aggregate concentration by Function and operational assignment/event, never by employee; collapse cross-week segments to one request for request-count insights while retaining segment minutes for hour totals.

- [ ] **Step 2: Run RED**

Run `npm.cmd test -- src/lib/ot-request-domain.test.ts src/lib/ot-request.uat.test.ts`.

- [ ] **Step 3: Implement pure analytics**

Return this stable shape:

```js
{
  weeklyTrend: [{ weekStart, actualMinutes }],
  byFunction: [{ key, actualMinutes, share }],
  byAssignment: [{ key, label, actualMinutes, share }]
}
```

Do not emit employee names, rankings, productivity labels, or inferred performance conclusions.

- [ ] **Step 4: Render accessible views**

Add `Confirmed OT trend — latest 5 Bangkok weeks` and `Workload concentration by Function / assignment` using semantic tables or labelled bars, explicit dates and hours, and source-scoped drill-down. Add `aria-pressed` to every ProductSwitch button based on the current module.

- [ ] **Step 5: Build, verify, and commit**

Run focused tests, `npm.cmd run build:github` twice, and `npm.cmd run build`. Commit the eight Task 7 files with `feat: complete OT operational trend views`.

---

### Task 8: Whole-Module Verification and Release Handoff

**Files:**
- Modify: `docs/OT_REQUEST_RELEASE_HANDOFF.md`
- Modify: `supabase/README.md`
- Modify: `.superpowers/sdd/2026-08-07-workgrid-ot-request-implementation/progress.md` only if it is already tracked; otherwise leave the ignored SDD ledger uncommitted.

**Interfaces:**
- Consumes: Tasks 1-7 and all existing OT tests.
- Produces: evidence-backed staging handoff; no production deployment.

- [ ] **Step 1: Run database policy tests from a clean local database**

Run:

```powershell
npx.cmd supabase start
npm.cmd run test:ot-db
```

Expected: migration compilation and every pgTAP accounting/state/auth/RLS/idempotency/export assertion PASS. Record Supabase CLI version and exact count.

- [ ] **Step 2: Run application verification**

Run in this order:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run build:github
npm.cmd run build:github
npx.cmd secretlint "**/*"
git diff --check
```

Expected: all tests PASS, Next builds four static pages, both source/generated bundles match, second static build reports `No output changed.`, secretlint and diff check pass.

- [ ] **Step 3: Run read-only SQL verification against local staging-equivalent data**

Execute `supabase/ot_request_verify.sql` only against the disposable local database. Confirm fixed allowlists, RPC signatures/grants, RLS, canonical counted helper, audit snapshot, no direct authenticated writes, and no legacy projected-total grant.

- [ ] **Step 4: Perform rendered browser QA when Browser is available**

Verify employee request/actual lock states, manager queue revision exclusion, Owner legacy-role denial, reassignment, compliance, five-week trend, dark mode, and 390px/1440px layouts. Capture screenshots and console results. If Browser remains unavailable, state that rendered QA is blocked; do not substitute source assertions as visual proof.

- [ ] **Step 5: Update handoff truthfully**

Record exact command counts and separate these gates: local automated PASS, local Supabase pgTAP PASS, live Supabase not executed, rendered Browser PASS or blocked, manual upload not executed, production UAT not executed. Preserve backup, SQL install, verify, asset upload order, rollback, and cache token instructions.

- [ ] **Step 6: Request final independent review**

Review the complete diff from `fb37560` through the final implementation HEAD for design compliance, authorization, concurrency, workflow reachability, privacy, generated-file parity, and handoff accuracy. Fix every Critical/Important finding with its own RED/GREEN cycle.

- [ ] **Step 7: Commit the handoff only after evidence is final**

Commit only tracked handoff/readme changes with `docs: finalize OT remediation handoff`. Do not push, tag, deploy, upload assets, or execute live SQL without separate user approval.

## Plan Self-Review Result

- Spec coverage: canonical weekly replacement, pre-work authorization, consent, work-end gate, actual immutability/amendment, fixed allowlists, plan revision, server invariants, manager evidence, scoped totals, reassignment, audit email, executable SQL tests, root-cause trend, and ProductSwitch accessibility are each assigned to a task.
- Placeholder scan: passed; every task names concrete files, interfaces, commands, and expected outcomes.
- Type consistency: SQL RPC names and browser wrapper signatures are defined once and reused by later tasks; `countedMinutes` is the single dashboard policy total.
- Scope: no payroll/time-clock/location tracking, unrelated refactor, production mutation, or Campaign Dashboard file is included.
