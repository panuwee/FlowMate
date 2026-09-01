# Marketing Working Sheet Workgrid Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task by task with review checkpoints.

**Goal:** Deliver the approved Current Working Rows, nullable hourly Publish Time, Thai-business-day milestone, colour, Duplicate Brief, and Time-column UX changes without disturbing unrelated FlowMate work.

**Architecture:** Keep the existing Marketing Plan timeline loader and Month window, then apply account preference, inclusive Launch Date, and search filtering in one pure frontend pipeline. Add narrowly scoped Supabase tables/functions for account UI preferences, Thai holiday coverage, and transactional row duplication. Preserve existing FlowMate Create Brief/link-back behavior by opening it only after the duplicate RPC returns the new content-item ID.

**Tech Stack:** React JSX bundled by esbuild, CSS, Supabase/PostgreSQL/RLS, Vitest static-contract tests, PowerShell/npm on Windows.

**Approved Spec:** `docs/superpowers/specs/2026-09-01-marketing-working-sheet-workgrid-feedback-design.md`

## Global constraints

- Work only in `C:\SeaTH\Projects\flowmate\.worktrees\version2.1.1` on branch `version2.1.1`.
- Preserve the pre-existing changes in `data.js`, `src/lib/flowmate-board-sql.uat.test.ts`, `supabase/board_urgent_wip_override.sql`, CreativeBot/SeaTalk files, and `supabase/.temp/`.
- Do not hand-edit generated `app.js` or `screens-a.js`; regenerate them with `npm.cmd run build:github`.
- Do not modify or stage unrelated generated assets.
- Do not run Production SQL, commit, push, tag, stamp cache versions, or deploy without separate explicit user approval.
- At the start of every execution session, run:

```powershell
git branch --show-current
git status --short
git rev-parse HEAD
git worktree list
git ls-remote github refs/heads/version2.1.1
```

- Expected starting local commit: `f72cd72c4f7f37da60ed648ad5d8556bd8aab75c`. If local/remote ancestry or dirty-file boundaries differ, stop and re-plan before editing.

---

## Task 1: Lock the approved contracts in focused tests

**Files:**

- Modify: `src/lib/flowmate.uat.test.ts`
- Modify: `src/lib/flowmate-launch-milestones.uat.test.ts`

### Step 1: Add failing Working Sheet contract tests

Add assertions using these explicit test names:

- `keeps Month and replaces four Current Working dropdowns with My Tasks and Launch Date range`
- `matches My Tasks by PIC or Sub PIC user id and never by display name`
- `uses N/A plus every whole hour from 00:00 through 23:00`
- `renders Duplicate as a direct Current Working row action`
- `keeps Time and Actions columns wide enough to avoid clipping`
- `exports N/A when publish time is null`

The source assertions must require all of these literals/contracts:

```js
aria-pressed
marketing-working-start-date
marketing-working-end-date
marketing-working-my-tasks
marketing-working-duplicate
marketing-tier--s
marketing-status--ready-to-post
Time not set
```

Also assert that the Current Working toolbar block no longer renders controls named `working-channel`, `working-status`, `working-team`, or `working-owner`, while the Month control remains.

### Step 2: Replace milestone expectations with the approved contract

Update `src/lib/flowmate-launch-milestones.uat.test.ts` to require:

```js
flowmate_th_holidays
flowmate_th_calendar_years
flowmate_is_th_business_day
flowmate_subtract_th_business_days
flowmate_subtract_th_business_days(p_launch_date, 5)
flowmate_subtract_th_business_days(p_launch_date, 1)
```

Delete assertions that holidays intentionally count as working days or that Creative Request uses T-7/T-5.

Add mirror checks covering:

- `supabase/rpc_assignment.sql`
- `supabase/creative_request_launch_milestones.sql`
- `supabase/trello_asana_hybrid_backend.sql`
- visible copy in `screens-a.jsx`

### Step 3: Run the new tests and confirm RED

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Current Working|Publish Time|Duplicate|Time column"
npm.cmd test -- src/lib/flowmate-launch-milestones.uat.test.ts
```

Expected: failures point to missing My Tasks/date/Duplicate/hourly/time-width contracts and old T-7/T-5 SQL. If tests pass before implementation, strengthen the assertions before continuing.

### Step 4: Review scope

```powershell
git diff -- src/lib/flowmate.uat.test.ts src/lib/flowmate-launch-milestones.uat.test.ts
git status --short
```

Do not commit yet.

---

## Task 2: Add account-scoped My Tasks preference storage

**Files:**

- Create: `supabase/marketing_plan_workgrid_feedback.sql`
- Modify: `supabase/marketing_plan.sql`
- Modify: `src/lib/flowmate.uat.test.ts`

### Step 1: Extend the RED tests

Require the installer and canonical Marketing Plan SQL to contain the same preference table and RLS contract:

```sql
create table if not exists public.user_ui_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  marketing_working_my_tasks boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Require RLS policies for `select`, `insert`, and `update`, each restricted to `user_id = auth.uid()` and an active `public.users` row.

### Step 2: Run the preference test and confirm RED

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "My Tasks preference"
```

### Step 3: Implement schema, trigger, grants, and RLS

In both SQL files:

- Create the table idempotently.
- Reuse `public.set_updated_at()` for `updated_at`.
- Enable RLS.
- Grant `select, insert, update` to `authenticated`; grant nothing to `anon`.
- Use separate policies with these predicates:

```sql
user_id = auth.uid()
and exists (
  select 1
  from public.users u
  where u.id = auth.uid()
    and coalesce(u.is_active, true)
)
```

Use `using (...)` for select/update and `with check (...)` for insert/update. Do not add delete access because the default false row is sufficient.

### Step 4: Run focused tests and review SQL parity

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "My Tasks preference"
git diff --check
git diff -- supabase/marketing_plan_workgrid_feedback.sql supabase/marketing_plan.sql src/lib/flowmate.uat.test.ts
```

Expected: PASS and no whitespace errors.

---

## Task 3: Refactor Current Working filtering and toolbar

**Files:**

- Modify: `app.jsx`
- Modify: `app.css`
- Modify: `src/lib/flowmate.uat.test.ts`

### Step 1: Add pure-filter behavior tests

The tests must verify this exact pipeline and edge cases:

```js
Month-loaded rows
  -> My Tasks by currentUserId === picUserId || subPicUserId
  -> inclusive launchDate >= startDate and <= endDate
  -> text search
  -> one shared visibleRows array for render, count, and CSV
```

Cover empty bounds, start-only, end-only, both inclusive, invalid `end < start`, no user ID, and same display name with a different user ID.

Also cover preference default/read/save lifecycle: a missing row defaults off, a read failure defaults off with a non-blocking warning, a write failure preserves session state, and switching authenticated accounts reloads the second account's value instead of retaining the first account's state.

### Step 2: Run and confirm RED

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Current Working filters|My Tasks"
```

### Step 3: Implement preference client helpers

Add these functions near the existing Marketing Plan data helpers in `app.jsx`:

```js
async function loadMarketingWorkingMyTasksPreference(userId) {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("user_ui_preferences")
    .select("marketing_working_my_tasks")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.marketing_working_my_tasks);
}

async function saveMarketingWorkingMyTasksPreference(userId, enabled) {
  const { error } = await supabase.from("user_ui_preferences").upsert({
    user_id: userId,
    marketing_working_my_tasks: Boolean(enabled)
  }, { onConflict: "user_id" });
  if (error) throw error;
}
```

Adapt `supabase` to the repository's existing client identifier rather than creating another client.

### Step 4: Replace obsolete state and filtering

Remove component state and option-building used only by Channel, Status, Team, and Owner Current Working filters. Keep `selectedMonth` and search.

Add:

```js
const [myTasksOnly, setMyTasksOnly] = useState(false);
const [workingStartDate, setWorkingStartDate] = useState("");
const [workingEndDate, setWorkingEndDate] = useState("");
const [workingDateError, setWorkingDateError] = useState("");
```

Refactor the pure helper to accept one criteria object:

```js
filterMarketingPlanWorkingRows(rows, {
  currentUserId,
  myTasksOnly,
  startDate,
  endDate,
  search
})
```

Use stable IDs only. Use the row's normalized Launch Date, not creation date or month key. If `endDate < startDate`, preserve controls, set the inline error, and leave the last valid filtered result visible rather than silently swapping dates.

### Step 5: Render the approved toolbar

Render in this order:

```text
Month | My Tasks | Start Date | End Date | Search | Clear | Export CSV | Showing X rows
```

My Tasks must be a real button with:

```jsx
<button
  type="button"
  className={`btn marketing-working-my-tasks${myTasksOnly ? " is-active" : ""}`}
  aria-pressed={myTasksOnly}
>
  {myTasksOnly ? "✓ " : ""}My Tasks
</button>
```

Persist after updating session state. On write failure, keep the session state and show exactly:

```text
My Tasks is active, but the preference could not be saved.
```

Reload the preference whenever the authenticated user ID changes. If the read fails, default the new account to off and show a non-blocking warning; never reuse the previous account's value.

Use native date inputs with visible labels. Empty native date controls naturally open at today's month; do not prefill them because empty means unbounded. Associate the invalid-range message with both controls using `aria-describedby`.

Clear only resets Start Date, End Date, error, and Search. It must not reset Month or My Tasks.

### Step 6: Ensure result parity and empty states

Render, count, and export the same `visibleWorkingRows`. Use distinct empty messages:

```text
No tasks are assigned to you in this month.
No tasks match the selected Launch Date range.
```

### Step 7: Run focused tests

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Current Working filters|My Tasks|Launch Date"
git diff --check
```

Expected: PASS.

---

## Task 4: Make Publish Time nullable and hourly end to end

**Files:**

- Modify: `app.jsx`
- Modify: `screens-a.jsx`
- Modify: `supabase/marketing_plan.sql`
- Modify: `supabase/marketing_plan_schedule_operator.sql`
- Modify: `supabase/marketing_plan_workgrid_feedback.sql`
- Modify: `src/lib/flowmate.uat.test.ts`

### Step 1: Add failing frontend and SQL contract tests

Require the options to be generated as:

```js
const MARKETING_PLAN_PUBLISH_TIME_OPTIONS = [
  { value: "", label: "N/A" },
  ...Array.from({ length: 24 }, (_, hour) => {
    const value = `${String(hour).padStart(2, "0")}:00`;
    return { value, label: value };
  })
];
```

Require Creative Request to use the same value set and default `""`. Require SQL to accept `NULL` or `date_part('minute', value) = 0 and date_part('second', value) = 0`; reject the old four-value enumeration.

### Step 2: Run and confirm RED

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Publish Time|schedule operator"
```

### Step 3: Implement frontend normalization and defaults

Use one exact normalizer in `app.jsx` and the equivalent shared-local helper in `screens-a.jsx`:

```js
function normalizeWholeHourTime(value) {
  const text = String(value || "").trim().slice(0, 5);
  return /^(?:[01]\d|2[0-3]):00$/.test(text) ? text : "";
}
```

Remove every fallback from null/empty to `11:00`. New forms reset to `""`. Every select renders N/A first. Existing non-hour legacy values remain readable as a temporary disabled option until the user chooses N/A or a whole hour.

When Working Sheet Time is cleared, write `publish_time: null`; when linked FlowMate schedule sync is authorized, send null rather than `00:00`.

### Step 4: Relax backend validation safely

In all Marketing Plan creation/update/schedule RPCs changed by this feature, allow null and validate non-null values with:

```sql
p_publish_time is null
or (
  extract(minute from p_publish_time) = 0
  and extract(second from p_publish_time) = 0
)
```

Do not change the column type from nullable `time`.

### Step 5: Align display, sorting, and export

- Working Sheet and forms display `N/A` for null.
- CSV writes `N/A` for null.
- Calendar groups null times under `Time not set`, after timed rows for that date.
- Do not sort null as midnight.

### Step 6: Run focused tests

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Publish Time|Time not set|schedule operator|CSV"
git diff --check
```

Expected: PASS.

---

## Task 5: Add accessible Tier/Status styling and fix table clipping

**Files:**

- Modify: `app.jsx`
- Modify: `app.css`
- Modify: `src/lib/flowmate.uat.test.ts`

### Step 1: Add failing class and sizing tests

Require stable class mappers for Tier S/A/B/C and Planned/Assigned/Review/Ready to Post/Schedule/Posted. Require:

```css
.marketing-working-table { min-width: 1420px; }
.marketing-working-table .col-time { width: 92px; }
.marketing-working-table .col-actions { width: 220px; }
```

The exact table minimum may increase after rendered verification, but it may not return to `min-width: 0`.

### Step 2: Run and confirm RED

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Tier|Status colour|Time column"
```

### Step 3: Implement semantic class mapping

Add pure mappers, retaining visible text:

```js
getMarketingTierClass("S") === "marketing-tier--s"
getMarketingStatusClass("ready_to_post") === "marketing-status--ready-to-post"
```

Style the closed status select, not native option elements. Use the approved foreground colours and subtle borders/backgrounds. Add dark-theme equivalents under the repository's existing dark-theme selector. Preserve focus, disabled, selected, and error outlines.

### Step 4: Fix the root cause of Time clipping

Set the Time cell/select contract:

```css
.marketing-working-time-text {
  box-sizing: border-box;
  width: 100%;
  min-width: 72px;
  padding-right: 24px;
  white-space: nowrap;
}
```

Keep horizontal overflow on the existing table wrapper and expand Actions for separate Edit, Duplicate, Create Brief/Repair controls. Do not hide overflow on Time cells or focus rings.

### Step 5: Run focused tests

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Tier|Status colour|Time column"
git diff --check
```

Expected: PASS.

---

## Task 6: Implement transactional Duplicate data operation

**Files:**

- Modify: `supabase/marketing_plan_workgrid_feedback.sql`
- Modify: `supabase/marketing_plan.sql`
- Modify: `src/lib/flowmate.uat.test.ts`

### Step 1: Add failing SQL contract tests

Require this authenticated RPC signature in both SQL sources:

```sql
public.marketing_plan_duplicate_working_row(
  p_source_content_item_id uuid,
  p_launch_date date,
  p_publish_time time default null
) returns jsonb
```

Tests must require:

- actor resolved from `auth.uid()` and active-user check;
- source `marketing_content_items` locked `for update`;
- authorization for Admin, source PIC, or source Sub PIC only;
- source `requires_brief = true`;
- new `marketing_content_items.id` and new placement IDs;
- `pic_user_id = auth.uid()` and actor's current display name;
- active source Sub PIC copied only when different from actor;
- `brief_link`, `flowmate_work_item_id`, and source integration identifiers reset to null;
- placements copied for every source channel with new Launch Date, nullable Publish Time, and `placement_status = 'planned'`;
- one transaction and a JSON result containing `content_item_id`.

### Step 2: Run and confirm RED

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "duplicate working row RPC"
```

### Step 3: Implement the RPC

Use `security definer set search_path = public, pg_temp`, revoke public/anon execution, and grant execute to authenticated. Resolve Admin using the repository's canonical role normalization instead of inventing a second role model.

Return:

```sql
jsonb_build_object(
  'content_item_id', v_new_content_item_id,
  'launch_date', p_launch_date,
  'publish_time', p_publish_time
)
```

The RPC is atomic. MVP retry protection is the UI in-progress lock; do not add an idempotency table or hidden dedupe rule in this release. A network retry after an unknown response must refresh the Working Sheet before offering another Duplicate attempt.

### Step 4: Add SQL verification block

Include a rollback-safe manual verification section in comments that checks:

- unauthorized actor inserts zero rows;
- simulated placement failure rolls back the content item;
- duplicate has different IDs and null links;
- all source channels are copied exactly once;
- same-date duplication is allowed by SQL because confirmation is a UI concern.

### Step 5: Run tests

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "duplicate working row RPC"
git diff --check
```

Expected: PASS.

---

## Task 7: Add direct Duplicate action and modal flow

**Files:**

- Modify: `app.jsx`
- Modify: `app.css`
- Modify: `src/lib/flowmate.uat.test.ts`

### Step 1: Add failing UI flow tests

Cover visibility and behavior:

- direct Actions-column button beside Edit;
- visible only for `requiresBrief` rows manageable by Admin/PIC/Sub PIC;
- no match by names;
- modal prefills source Launch Date and nullable Publish Time;
- same Launch Date requires an explicit confirmation checkbox;
- button says `Duplicating...` and is disabled in flight;
- returned new content-item ID is used for Create Brief;
- old Brief Link/work-item ID never enter the new draft;
- duplicate remains available as a normal unlinked row if navigation fails or FlowMate is abandoned.

### Step 2: Run and confirm RED

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Duplicate Brief|Duplicate action"
```

### Step 3: Add component state and permission helper

Add:

```js
const [duplicateSourceRow, setDuplicateSourceRow] = useState(null);
const [duplicateLaunchDate, setDuplicateLaunchDate] = useState("");
const [duplicatePublishTime, setDuplicatePublishTime] = useState("");
const [duplicateSameDateConfirmed, setDuplicateSameDateConfirmed] = useState(false);
const [duplicatingContentItemId, setDuplicatingContentItemId] = useState("");
```

Use a pure `canDuplicateMarketingWorkingRow(row, currentUser)` helper with stable IDs and canonical Admin role.

### Step 4: Render the direct action and modal

Button contract:

```jsx
<button
  type="button"
  className="btn secondary marketing-working-duplicate"
  disabled={duplicatingContentItemId === row.contentItemId}
>
  {duplicatingContentItemId === row.contentItemId ? "Duplicating..." : "Duplicate"}
</button>
```

The modal shows source Campaign and Product/Event, focuses Launch Date, offers N/A plus 24 hours, and includes exactly:

```text
A new Working Sheet row will be created without the previous Brief Link.
```

When date equals the source date, require a visible checkbox before enabling Create Duplicate.

### Step 5: Call RPC, reload, then open Create Brief

Call `marketing_plan_duplicate_working_row`, refresh the existing timeline window, locate the returned `content_item_id`, and pass that normalized new row to `openFlowMateCreativeBriefFromMarketingRow`.

Before opening, force these draft fields empty even if stale client state exists:

```js
briefLink: "",
flowmateWorkItemId: ""
```

If navigation fails after RPC success, close the modal, refresh rows, show that the row was created, and direct the user to its `Create Brief` action. Never delete the successfully created row as compensating behavior.

### Step 6: Run focused tests

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Duplicate Brief|Duplicate action|Create Brief"
git diff --check
```

Expected: PASS.

---

## Task 8: Implement Thai holiday coverage and T-5/T-1 milestones

**Files:**

- Create: `supabase/creative_request_thai_business_days.sql`
- Modify: `supabase/rpc_assignment.sql`
- Modify: `supabase/creative_request_launch_milestones.sql`
- Modify: `supabase/trello_asana_hybrid_backend.sql`
- Modify: `screens-a.jsx`
- Modify: `src/lib/flowmate-launch-milestones.uat.test.ts`
- Modify: `src/lib/flowmate.uat.test.ts`

### Step 1: Add failing calendar-coverage tests

Tests must require both tables, active-holiday exclusion, complete-year validation, and the same helper calls in every SQL mirror. Also assert that old T-7/T-5 user-facing milestone text is absent from the changed Creative Request flow.

### Step 2: Run and confirm RED

```powershell
npm.cmd test -- src/lib/flowmate-launch-milestones.uat.test.ts
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Creative Request milestone"
```

### Step 3: Add calendar schema and reviewed data

Create the approved tables:

```sql
public.flowmate_th_holidays
public.flowmate_th_calendar_years
```

Install reviewed 2025, 2026, and 2027 Thai public/substitute holidays, because calculations in the current planning horizon can cross year boundaries. Record an official source and review note on every batch. Mark a year `is_complete = true` only after the date list has been reviewed. Authenticated users may read; no client role may insert/update/delete.

The operational source for the initial batch is the official Bank of Thailand financial-institution holiday publication, including announced special and substitute holidays. Before Production SQL, a human owner must confirm that Workgrid uses this same holiday calendar; otherwise revise the data batch without changing helper behavior.

### Step 4: Implement coverage-aware helpers

`flowmate_is_th_business_day(p_date date)` returns true only when:

```sql
extract(isodow from p_date) between 1 and 5
and not exists (
  select 1
  from public.flowmate_th_holidays h
  where h.holiday_date = p_date
    and h.is_active
)
```

`flowmate_subtract_th_business_days(p_date date, p_days integer)` must:

- reject null dates and negative day counts;
- verify every crossed year is marked complete;
- start from the day before Launch Date;
- decrement only on Thai business days;
- raise an exception naming the first incomplete year.

Do not change generic weekday helpers used by other work types.

### Step 5: Replace every Creative Request T-7/T-5 call

Use exactly:

```sql
v_due_date := public.flowmate_subtract_th_business_days(v_launch_date, 5);
v_final_due_date := public.flowmate_subtract_th_business_days(v_launch_date, 1);
```

Apply this to creation, assignment guards, manual reassignment guards, hybrid backend mirrors, and verification SQL. Capacity/urgency logic may report risk but may not rebase these values. Do not backfill existing requests.

Update visible copy to `First Draft: T-5 Thai working days` and `Final/Approved: T-1 Thai working day`.

### Step 6: Add deterministic SQL examples

The verification block must prove:

```text
Launch Date 2026-04-16
Final/Approved Due = 2026-04-10
First Draft Due = 2026-04-03
```

This example crosses Songkran and Chakri Memorial Day. Add a separate cross-year case and an incomplete-year case that must fail with the missing year in the error.

### Step 7: Run focused tests

```powershell
npm.cmd test -- src/lib/flowmate-launch-milestones.uat.test.ts
npm.cmd test -- src/lib/flowmate.uat.test.ts -t "Creative Request milestone|T-5|T-1"
git diff --check
```

Expected: PASS.

---

## Task 9: Review all affected surfaces and remove stale assumptions

**Files:**

- Modify if evidence requires: `app.jsx`
- Modify if evidence requires: `screens-a.jsx`
- Modify if evidence requires: `screens-b.jsx`
- Modify if evidence requires: `screens-c.jsx`
- Modify if evidence requires: `data.jsx`
- Modify: `src/lib/flowmate.uat.test.ts`

### Step 1: Search for stale contracts

```powershell
rg -n '11:00|14:00|18:00|21:00|T-7|T-5|publish.?time|first.?draft|final.?approved' app.jsx screens-a.jsx screens-b.jsx screens-c.jsx data.jsx supabase src/lib
```

Classify every hit against Board, List, Detail, Calendar, Gantt, Team Schedule, Workload, KPI/Supervisor, Notifications/SeaTalk, Search, and CSV. Do not modify a surface merely because it contains a time literal used as sample data.

### Step 2: Add a failing regression assertion for each real stale dependency

For each hard-coded behavioral assumption found, add a named test before changing code. Stored milestone consumers that already read database dates should receive a no-change evidence note in the implementation log rather than an unnecessary edit.

### Step 3: Make minimal required changes

- Replace old generated milestone wording and calculations.
- Make null Publish Time display as N/A or `Time not set`, never midnight.
- Confirm duplicated Search/Detail links resolve from the new work-item link only.
- Confirm KPI/reporting continues to use stored due dates.

### Step 4: Run all focused contracts

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts
npm.cmd test -- src/lib/flowmate-launch-milestones.uat.test.ts
git diff --check
```

Expected: PASS. If a pre-existing dirty Board SQL test fails, stop, preserve it, and report the failure separately; do not repair unrelated work inside this feature.

---

## Task 10: Build, rendered QA, and release-ready handoff

**Files:**

- Generate: `app.js`
- Generate if source changed: `screens-a.js`
- Generate if source changed: `screens-b.js`
- Generate if source changed: `screens-c.js`
- Review only until release approval: `index.html`
- Review only until release approval: `home/index.html`
- Review only until release approval: `product-book/index.html`

### Step 1: Run the full automated suite

```powershell
npm.cmd test
```

Expected: PASS. Record any demonstrably pre-existing failure with its unchanged dirty file and run the two focused suites again; do not claim full-suite success when it is not true.

### Step 2: Build generated GitHub assets

```powershell
npm.cmd run build:github
```

Then verify generated/source parity:

```powershell
git diff --check
git status --short
git diff -- app.jsx app.css screens-a.jsx app.js screens-a.js
```

### Step 3: Run rendered desktop/responsive QA

Serve the repository's existing static entry point and verify at minimum:

- desktop 1440px and mobile 390px;
- light and dark theme;
- browser zoom 100%, 125%, and 150%;
- Time values N/A, 00:00, 11:00, and 23:00 are fully visible;
- Actions remain separate and keyboard focus is not clipped;
- toolbar stacks without hiding Month/My Tasks/date controls;
- My Tasks keyboard activation and `aria-pressed` state;
- invalid Start/End range association;
- Duplicate same-date confirmation and in-flight lock.

Save screenshots under a temporary/artifact path, not as tracked repository files unless the user requests them.

### Step 4: Perform SQL review without Production execution

Review installer order:

1. `supabase/marketing_plan.sql`
2. `supabase/marketing_plan_workgrid_feedback.sql`
3. `supabase/creative_request_thai_business_days.sql`
4. updated Creative Request assignment/milestone installer(s)

Confirm RLS, grants, security-definer search paths, rollback behavior, calendar completeness, and mirror parity. Do not run these against Production in this task without explicit approval.

### Step 5: Prepare an exact-file handoff

Report:

- files changed and generated;
- focused/full test results;
- rendered QA matrix;
- SQL files awaiting execution and required order;
- holiday source and completeness review;
- known pre-existing dirty files left untouched;
- remaining risks, especially unknown-response Duplicate retry behavior.

### Step 6: Stop for approval before integration

Ask separately for approval to:

1. stage and commit exact files;
2. push branch `version2.1.1` to GitHub remote `github`;
3. execute reviewed Production SQL;
4. update the cache stamp with `npm.cmd run release:stamp` and deploy.

Only after approval, stage explicit paths—never `git add .`—and re-run tests/build after any release stamp changes.

## Completion definition

Implementation is complete only when all approved Acceptance Criteria pass, generated assets match sources, rendered QA confirms the Time-column fix, SQL is ready for review, unrelated dirty files remain preserved, and no integration/deployment action has been taken without approval.
