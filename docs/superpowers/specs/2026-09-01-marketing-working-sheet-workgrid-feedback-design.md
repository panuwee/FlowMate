# Marketing Plan and Creative Request Workgrid Feedback Design

**Date:** 2026-09-01
**Status:** Approved by user on 2026-09-01
**Target:** FlowMate GitHub default branch `version2.1.1`
**Working tree:** `C:\SeaTH\Projects\flowmate\.worktrees\version2.1.1`

## 1. Objective

Reduce repetitive work and improve personal task tracking in Marketing Plan and Creative Request based on real Workgrid usage.

The release must:

1. Let a signed-in user focus Current Working Rows on tasks where they are PIC or Sub PIC.
2. Replace the existing Channel, Status, Team, and Owner filters with a Launch Date range.
3. Change Creative Request generated milestones to T-5 and T-1 Thai working days.
4. Make Publish Time optional, default it to N/A, and support every whole hour.
5. Make Tier and Marketing Status easier to scan without relying on colour alone.
6. Add a direct Duplicate action to Current Working Rows that creates a new Marketing Plan row before opening FlowMate Create Brief.
7. Prevent the Time control from being clipped or covered by adjacent UI.

## 2. Users and Success Criteria

### Primary users

- Marketing PICs who need to track only their own assigned work.
- Sub PICs who collaborate on another PIC's content.
- eSport operators who create repeated Fixture, Result, and campaign Briefs with small date changes.
- Admins who need access to all rows and can duplicate or manage eligible rows.

### User outcomes

- A user can reach their own tasks with one toggle instead of repeatedly filtering owners.
- A user can narrow work by Launch Date with two familiar date controls.
- Due dates consistently exclude weekends and configured Thai public holidays.
- Publish Time can be left unset without inventing a time.
- Repeated Brief creation starts from a copied Marketing Plan row and links the new FlowMate request back to the correct row.
- Time values remain fully visible at supported browser zoom levels.

## 3. Scope

### Included

- Marketing Plan > Working Sheet > Current Working Rows.
- Marketing Plan create and edit forms where Publish Time is used.
- Creative Request create flow and generated milestone contract.
- Existing views and messages that display First Draft, Final/Approved, Launch Date, or Publish Time.
- Supabase schema, functions, RPC validation, and RLS required for user preferences and Thai holiday data.
- Focused automated tests, SQL verification, responsive UI checks, generated static assets, and release handoff.

### Excluded

- Hiding other users' Marketing Plan data at the RLS/API level. My Tasks is a display preference, not an authorization boundary.
- Saved filter presets beyond the My Tasks account preference.
- A holiday administration UI. Holiday data is installed through reviewed SQL for this release.
- Historical backfill of existing Creative Request milestone dates.
- Bulk Content Series creation from multiple dates. This remains a recommended Phase 2 improvement.
- Production SQL execution, commit, push, tag, deployment, or release without separate explicit approval.

## 4. Current-State Findings

- Current Working Rows already expose `pic_user_id` and `sub_pic_user_id`; filtering can use stable user IDs instead of display names.
- The existing Working Sheet toolbar includes Channel, Status, Team, Owner, Search, Clear filters, Export CSV, and row count.
- Working Sheet rows are grouped client-side and display the grouped row's Launch Date through the existing `publishDate` field.
- Marketing Plan and Creative Request currently enumerate `11:00`, `14:00`, `18:00`, and `21:00` in frontend constants and Marketing Plan RPC validation.
- Creative Request creation and assignment guards currently use T-7/T-5 and a weekday-only helper that intentionally counts weekday Thai holidays as working days.
- Current Working Rows render Time in a 72px column. Cell padding and the native select arrow leave insufficient text space, causing `11:00` to be clipped.
- Existing Create Brief behavior carries the Marketing Plan content-item ID into FlowMate and links the created request back to that row. Duplicate must preserve this direction of data flow.

## 5. UX Design

### 5.1 Current Working Rows toolbar

Replace the current filter controls with this order while preserving the existing Month scope selector:

`Month | My Tasks | Start Date | End Date | Search | Clear | Export CSV | Showing X rows`

Requirements:

- Keep Month because it defines the existing Working Sheet data window and was not one of the filters requested for removal.
- Remove the Channel, Status, Team, and Owner dropdowns from Current Working Rows.
- Keep Search because it supports direct lookup by Campaign, Product/Event, PIC, Sub PIC, Channel label, Asset Type, Tier, and Brief Link.
- Keep Export CSV and apply the same active My Tasks, date, and search filters to the export.
- Keep the row count in an `aria-live="polite"` region.
- On narrow screens, controls stack to one column before the table begins.

### 5.2 My Tasks toggle

- Render a visible button labelled `My Tasks`.
- Keep the label unchanged between on and off states.
- Expose state with `aria-pressed="true|false"`.
- The on state uses a clear pressed style, check icon, and text label. Colour must not be the only state indicator.
- A row matches when the current authenticated user's ID equals either the row's PIC user ID or Sub PIC user ID.
- Do not match by display name or email.
- New accounts default to off.
- Store the preference by account so it follows the user across supported devices.
- Apply the toggle immediately. If preference persistence fails, keep the current-session state and show `My Tasks is active, but the preference could not be saved.`
- Admins use the same behavior; enabling My Tasks does not mean show all admin-visible rows.

### 5.3 Launch Date range

- Start Date and End Date are optional native date inputs.
- Empty Start and End mean all Launch Dates.
- Start only means Launch Date greater than or equal to Start.
- End only means Launch Date less than or equal to End.
- Both bounds are inclusive.
- If End is earlier than Start, show an inline error and do not silently swap values.
- When an empty date input opens, the picker starts at the current date/month.
- When a value exists, the picker returns to the selected date rather than forcing today.
- Filtering uses the same date displayed in the Launch Date column and applies within the rows loaded for the selected Month window.
- Clear resets Start Date, End Date, and Search. It does not change Month or the account-level My Tasks preference.
- Empty-state copy must distinguish no personal tasks from no tasks in the selected date range.

### 5.4 Time control

- Display options in this order: `N/A`, then `00:00` through `23:00`.
- New Marketing Plan rows and Creative Requests default to N/A.
- N/A is stored as SQL `NULL` and represented as an empty value in the UI state.
- N/A must never be converted to `00:00` or `11:00`.
- Time values use 24-hour `HH:mm` labels.
- In calendar schedule views, rows with no time appear under `Time not set` after timed rows for the same date.
- CSV export writes `N/A` for a null Publish Time.

### 5.5 Tier and Marketing Status presentation

Render Tier as a compact text badge and apply a status-specific class to the editable Status control.

| Value | Light-theme foreground | Semantic treatment |
|---|---:|---|
| Tier S | `#B42318` | Highest priority / red tint |
| Tier A | `#B54708` | High priority / orange tint |
| Tier B | `#175CD3` | Standard priority / blue tint |
| Tier C | `#475467` | Lower priority / neutral tint |
| Planned | `#475467` | Neutral grey |
| Assigned | `#175CD3` | Active blue |
| Review | `#B54708` | Review amber |
| Ready to Post | `#0E7090` | Ready teal |
| Schedule | `#6941C6` | Scheduled purple |
| Posted | `#027A48` | Completed green |

Requirements:

- Retain the visible Tier or Status text at all times.
- Use a subtle tinted background or border in addition to foreground colour.
- Provide equivalent dark-theme tokens with readable contrast.
- Do not depend on styling native `<option>` elements because browser support is inconsistent; style the closed select according to its current value.
- Selected, focused, disabled, and error states remain visually distinguishable.

### 5.6 Duplicate action

- Label the action `Duplicate`.
- Place it directly in the Current Working Rows Actions column beside `Edit`.
- Do not place Duplicate inside the Edit modal or an overflow menu.
- Show Duplicate only when the source row requires a Brief and the current user is a PIC, Sub PIC, or Admin who can manage that row.
- Disable the button and change its label to `Duplicating...` while a duplicate request is in progress.
- The action must remain a separate click target from Edit, Create Brief, and Repair Link.

Duplicate modal:

- Show source Campaign and Product/Event as context.
- Prefill Launch Date from the source and focus the Launch Date control for quick adjustment.
- Prefill Publish Time from the source, including N/A.
- Explain: `A new Working Sheet row will be created without the previous Brief Link.`
- If the user keeps the same Launch Date, require a confirmation before creating the duplicate.
- Cancel closes the modal without changing data.

Duplicate result:

- Create the new Marketing Plan content item and placements before navigating to FlowMate.
- Copy Campaign, Product/Event, Details, Team, Asset Type, Tier, Channels, Notes, and `requires_brief`.
- Set the current user as PIC.
- Copy the source Sub PIC only when the account is still active and is not the new PIC.
- Use a new content-item ID and new placement IDs.
- Set placement status to `planned`.
- Set `brief_link` and `flowmate_work_item_id` to `NULL` regardless of the source values.
- Do not copy Creative Request ID, assignment, review history, notifications, audit history, or timestamps.
- After the new row is returned, open the existing FlowMate Create Brief flow using the new content-item ID.
- The FlowMate draft must also start with an empty Brief Link.
- When FlowMate submission succeeds, link the new Creative Request back only to the new Marketing Plan row.
- If the user leaves FlowMate without submitting, keep the new row with an empty Brief Link and a normal Create Brief action.
- If navigation to FlowMate fails after duplication, report that the row was created and provide a way to open Create Brief from that row.

### 5.7 Table sizing and Time-column regression

- Increase the Time column from 72px to approximately 92px, subject to rendered verification.
- Give the Time select enough internal width for `23:00`, `N/A`, focus outline, and the browser's dropdown arrow.
- Use explicit `box-sizing`, width, and right padding for the Time select.
- Give the Working Sheet table a calculated minimum width instead of `min-width: 0`.
- Keep horizontal scrolling on the existing table wrapper when the viewport is narrower than the table.
- Expand Actions enough for Edit, Duplicate, and the conditional Create Brief or Repair Link action without shrinking Time.
- Do not wrap or clip any Time option at browser zoom 100%, 125%, or 150%.

## 6. Data and Backend Design

### 6.1 Account preference

Add a dedicated preference table rather than exposing preferences on the shared users row:

```sql
public.user_ui_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  marketing_working_my_tasks boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

Security contract:

- Enable RLS.
- An authenticated active user can select, insert, and update only the row where `user_id = auth.uid()`.
- The client cannot write preferences for another user.
- Preference failure does not block reading Marketing Plan rows.

### 6.2 Thai business calendar

Add reviewed calendar data with explicit year coverage:

```sql
public.flowmate_th_holidays (
  holiday_date date primary key,
  name_th text not null,
  name_en text,
  source_note text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)

public.flowmate_th_calendar_years (
  calendar_year integer primary key,
  is_complete boolean not null default false,
  source_note text not null,
  updated_at timestamptz not null default now()
)
```

Requirements:

- Include official Thai public holidays and substitute holidays for every completed year.
- Install the previous, current, and next planning year before enabling the new milestone contract, then maintain at least the full active planning horizon.
- Do not call an external holiday API during request creation.
- Calculation must verify coverage for every calendar year crossed by the subtraction.
- If coverage is incomplete, reject Creative Request creation with a clear user-facing message naming the missing year.
- Calendar data is readable to authenticated users and writable only through reviewed administrative SQL in this release.

Add Creative Request-specific helpers:

- `flowmate_is_th_business_day(date)`
- `flowmate_subtract_th_business_days(date, integer)`

The helpers treat Monday-Friday as candidates and exclude active rows in `flowmate_th_holidays`. They must not modify the generic weekday helpers used by unrelated FlowMate work types in this release.

### 6.3 Creative Request milestone contract

For newly created Creative Requests:

```text
Asset First Draft Due   = Launch Date minus 5 Thai business days
Asset Final/Approved Due = Launch Date minus 1 Thai business day
```

Requirements:

- The subtraction does not count Launch Date itself.
- Weekend and configured public-holiday dates are skipped.
- The same helper is used by create, automatic assignment guards, manual reassignment guards, and verification SQL.
- Capacity or urgency signals may not silently rebase either milestone.
- Existing Creative Requests retain their stored milestone dates.
- Update every visible T-7/T-5 explanation, risk message, test, and export to T-5/T-1.

### 6.4 Publish Time contract

- `publish_time` remains nullable SQL `time`.
- Valid values are `NULL` or a whole-hour value where minutes and seconds are zero.
- Marketing Plan create, edit, time-update RPCs, schedule-operator installers, and Creative Request creation must accept `NULL`.
- Remove hard-coded four-time enumeration from backend validation.
- Frontend normalizers accept only empty/null or `HH:00` from `00:00` through `23:00`.
- Existing non-hour legacy values remain readable but must be changed to N/A or a whole hour when edited.
- Clearing Working Sheet Time to N/A syncs `NULL` to a linked FlowMate work item when the user has schedule authority.

### 6.5 Duplicate data operation

Prefer a dedicated authenticated RPC for the duplicate operation so content and placement copies happen in one transaction.

The RPC must:

- Resolve the actor from `auth.uid()` and reject an inactive user.
- Load and lock the source content item and its placements.
- Authorize only Admin, source PIC, or source Sub PIC.
- Accept Launch Date and nullable Publish Time overrides.
- Clone eligible business fields and all source channels.
- Reset Brief Link, FlowMate work-item ID, placement status, IDs, and timestamps.
- Return the normalized new row required by `openFlowMateCreativeBriefFromMarketingRow`.
- Roll back all inserts when any placement copy fails.

The UI-level in-progress lock prevents rapid double-clicks. The implementation plan must assess whether a client request key is needed for retry idempotency after inspecting existing RPC conventions.

## 7. Data Flow

### My Tasks

1. Load authenticated FlowMate user.
2. Load the user's UI preference row; missing row means false.
3. Load and group Working Sheet rows using the existing data source.
4. Apply My Tasks by PIC/Sub PIC user ID.
5. Apply inclusive Launch Date range.
6. Apply text search.
7. Render, count, and export the same result set.

### Duplicate

1. User selects Duplicate in Current Working Rows.
2. UI opens the duplicate modal with source context and editable date/time.
3. UI validates Launch Date and duplicate-date confirmation.
4. Duplicate RPC creates a new Marketing Plan row with empty link fields.
5. UI refreshes Current Working Rows and receives the new row ID.
6. UI opens FlowMate Create Brief with a draft bound to the new content-item ID and an empty Brief Link.
7. Existing FlowMate submit creates the Creative Request.
8. Existing link-back behavior updates only the new Marketing Plan row.

## 8. Error and Recovery Behavior

| Failure | Required behavior |
|---|---|
| My Tasks preference read fails | Default off and show a non-blocking warning |
| My Tasks preference write fails | Keep session state and say it was not saved |
| End Date is before Start Date | Inline validation; preserve entered values |
| Thai calendar year is incomplete | Block new Creative Request and identify the missing year |
| Duplicate authorization fails | No new row; show permission error |
| Duplicate placement insert fails | Transaction rollback; no partial row |
| Duplicate succeeds but FlowMate navigation fails | Keep new row and direct user to its Create Brief action |
| FlowMate submission fails | Keep the duplicated Marketing Plan row unlinked for retry |
| Link-back fails after Creative Request creation | Preserve the created request and show Repair Link guidance |
| Publish Time sync fails | Keep local row state aligned with confirmed backend result and show retry guidance |

## 9. Surface Impact Matrix

| Surface | Required review or change |
|---|---|
| Marketing Plan Working Sheet | My Tasks, date range, colours, N/A time, Duplicate, table sizing |
| Marketing Plan create/edit | N/A default and whole-hour options |
| Timeline / Channel Plan | N/A display and sorting where time appears |
| Marketing Calendar | Time not set group; no false midnight placement |
| Creative Request create | N/A default, T-5/T-1 copy, duplicate draft link contract |
| Board | Updated First Draft and Final/Approved dates |
| List | Updated dates and N/A time display |
| Detail | Updated milestone labels and nullable Publish Time |
| Gantt / Team Schedule / Workload | New stored milestones; no stale T-7/T-5 labels |
| KPI / Supervisor reporting | Confirm calculations use stored dates and do not hard-code T-7/T-5 |
| Notifications / SeaTalk | Update milestone wording and dates where generated |
| Search | Duplicated request links resolve to the new work item only |
| CSV/export | Filter parity, T-5/T-1 labels, `N/A` time |
| Supabase / RLS | Preference table, holiday tables/helpers, duplicate RPC, time validation |
| Generated static assets | Regenerate; do not hand-edit generated JS |
| Active entry pages | Keep cache/version stamp aligned after build |

## 10. Accessibility and Responsive Requirements

- My Tasks works with keyboard Enter and Space and exposes pressed state.
- Every date control has a visible label and accessible name.
- Error messages are associated with their fields.
- Duplicate and Edit are separate focusable controls with unambiguous labels.
- Disabled Duplicate exposes why the action is unavailable through visible or accessible text.
- Tier and Status remain understandable without colour.
- Focus rings are not clipped by table cells or scrolling wrappers.
- Horizontal table scrolling remains keyboard- and touch-usable.
- Time text is fully visible in light and dark themes at supported zoom levels.

Reference: W3C WAI-ARIA Authoring Practices, Button Pattern for toggle-button semantics.

## 11. Acceptance Criteria

### My Tasks and filters

- [ ] New users see My Tasks off.
- [ ] Turning My Tasks on shows rows where the current user is PIC or Sub PIC and excludes all other rows.
- [ ] Two users on the same device receive their own account preferences.
- [ ] The preference follows the same account on another supported device.
- [ ] Channel, Status, Team, and Owner dropdowns no longer appear in Current Working Rows.
- [ ] Start and End filters are inclusive and use Launch Date.
- [ ] Search, date range, My Tasks, row count, and CSV export operate on the same row set.
- [ ] Clear resets date/search without changing My Tasks.
- [ ] Month remains available and continues to define the loaded Working Sheet window.

### Milestones and holidays

- [ ] A Launch Date produces First Draft at T-5 and Final/Approved at T-1.
- [ ] Weekend dates are skipped.
- [ ] Configured Thai public holidays and substitute holidays are skipped.
- [ ] A subtraction that crosses New Year verifies both calendar years.
- [ ] Missing year coverage blocks creation with a useful message.
- [ ] Existing requests are not changed.
- [ ] No active UI, SQL guard, test, export, or notification still describes the contract as T-7/T-5.

### Publish Time

- [ ] New Marketing Plan and Creative Request forms default to N/A.
- [ ] Users can choose N/A or any whole hour from 00:00 through 23:00.
- [ ] N/A persists as `NULL` and remains N/A after reload.
- [ ] Linked FlowMate schedule sync accepts both whole hours and NULL.
- [ ] Calendar does not treat N/A as midnight.
- [ ] CSV exports N/A for null time.

### Tier and Status

- [ ] S, A, B, and C are visually distinct in light and dark themes.
- [ ] Planned, Assigned, Review, Ready to Post, Schedule, and Posted are visually distinct in light and dark themes.
- [ ] Visible text remains present and readable without colour perception.

### Duplicate

- [ ] Duplicate is visible directly in the Actions column and not inside Edit.
- [ ] Rapid repeated clicks create no more than one duplicate during an active request.
- [ ] The duplicate has new content and placement IDs and status Planned.
- [ ] The old Brief Link and FlowMate work-item ID are never copied.
- [ ] The FlowMate draft starts with an empty Brief Link and the new Marketing Plan content-item ID.
- [ ] Successful FlowMate submission links back only to the duplicate row.
- [ ] Abandoning FlowMate leaves a usable unlinked row with Create Brief available.
- [ ] Unauthorized users cannot duplicate a row through UI or RPC.

### Time-column layout

- [ ] N/A, 00:00, 11:00, and 23:00 display fully without clipping.
- [ ] The native select arrow does not cover the selected value.
- [ ] Time remains readable at 100%, 125%, and 150% browser zoom.
- [ ] Adding Duplicate to Actions does not reduce Time below its minimum width.
- [ ] Narrow viewports scroll the table horizontally instead of compressing Time or Actions.

## 12. Verification Strategy

### Automated frontend tests

- My Tasks PIC/Sub PIC ID matching, including same-name users.
- Account preference load, default, save failure, and account switch.
- Inclusive Start/End boundaries and invalid range behavior.
- Whole-hour option generation and nullable normalization.
- Status/Tier class mapping.
- Duplicate draft reset contract and source-link exclusion.
- Calendar grouping of null-time items.
- Export parity and N/A output.

### SQL verification

- Preference RLS prevents cross-account read/write.
- Holiday data uniqueness and completed-year coverage.
- Weekend, holiday, substitute-holiday, and year-boundary calculations.
- Creative creation stores T-5/T-1.
- Automatic and manual assignment guards use the same holiday-aware helper.
- Publish Time accepts NULL and whole hours and rejects non-hour values.
- Duplicate RPC authorization, transactional rollback, copied fields, and reset fields.

### Rendered UI checks

- Desktop and narrow viewport Current Working Rows.
- Light and dark theme Tier/Status contrast.
- Time select at 100%, 125%, and 150% zoom.
- Actions containing Edit, Duplicate, and conditional Brief actions.
- Empty states for My Tasks and date range.

### Project verification

- Run focused Marketing Plan, Creative Request milestone, and linked-brief UAT suites.
- Run the broader project suite while preserving unrelated known exclusions only when independently evidenced.
- Run `npm.cmd run build:github`.
- Verify generated `app.js` and any generated screen assets.
- Verify the cache/version stamp matches in `index.html`, `home/index.html`, and `product-book/index.html`.
- Treat local tests as local evidence only; production Supabase and live-site verification remain separate gates.

## 13. Likely File Boundaries

The implementation plan must revalidate exact ownership before editing. Expected files include:

- `app.jsx`
- `app.css`
- `screens-a.jsx`
- `src/lib/flowmate.uat.test.ts`
- `src/lib/flowmate-launch-milestones.uat.test.ts`
- `supabase/marketing_plan.sql`
- `supabase/marketing_plan_schedule_operator.sql`
- `supabase/rpc_assignment.sql`
- `supabase/creative_request_launch_milestones.sql`
- Any canonical installer that duplicates Creative Request assignment guards
- A new scoped SQL migration/verification bundle for preferences, Thai holidays, nullable whole-hour Time, and Duplicate RPC
- Generated `app.js` and generated screen assets through the build command only

Existing unrelated dirty files in the worktree must not be edited, staged, overwritten, or included in a release unless separately authorized.

## 14. Rollout and Handoff Gates

1. Implement and verify locally in the `version2.1.1` worktree.
2. Review intended diffs against pre-existing dirty files.
3. Generate static assets and verify cache stamps.
4. Obtain explicit approval before commit.
5. Obtain explicit approval before Production SQL.
6. Obtain explicit approval before push or deployment.
7. After deployment, verify remote HTML, live assets, authenticated preference persistence, one T-5/T-1 request, N/A time, and Duplicate link-back.

## 15. Recommended Phase 2

Add `Create Content Series` for repetitive eSport Fixture and Result work:

- Select a saved content template.
- Enter multiple Launch Dates.
- Preview generated Working Sheet rows and Creative Request drafts.
- Create the series with per-row status and error reporting.

This is intentionally excluded from the current MVP so Duplicate can be validated with real users first.
