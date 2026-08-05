# FlowMate MVP 1.3 Planning UAT Checklist

Date: 2026-06-26
Project: FlowMate
Deploy target: https://panuwee.github.io/FlowMate/
Baseline: MVP 1.2 operations and collaboration work

## Purpose

Use this checklist before, during, and after MVP 1.3 implementation.

MVP 1.3 focuses on manager-oriented planning visibility:

- Planning navigation section.
- View by Channel.
- View by Campaign.
- Planning Content Calendar context.
- Readiness and risk labels.
- Planning field coverage across Create, Detail, Search, Filter, Calendar, KPI, and Export.

MVP 1.3 explicitly excludes:

- Separate Campaign Plan platform after login.
- Media budget planning.
- Content pillar strategy.
- Per-channel copywriting workflow.
- Per-channel approval workflow.
- Publishing API integration.
- Social platform auto-posting.
- Drag-to-reschedule planning calendar.

Do not add placeholder UI, backend code, or hidden configuration for excluded items during MVP 1.3.

## Test Roles And Setup

Use separate browser sessions or profiles:

- Admin user: active app user with admin role.
- Marketing Manager: active user who needs planning visibility.
- Operation Manager: active user who needs production and risk visibility.
- Requester: active user who creates Creative Requests.
- GD/VE owner: active team member assigned to Creative Requests.
- Signed-out visitor: incognito/private window with no authenticated session.

Recommended manual setup:

- At least 5 Creative Requests across 2 campaigns.
- At least 4 channels represented, including one multi-channel request.
- At least one request in each important status: assigned, in_progress, review, blocked, delivered, need_brief or queued if available.
- At least one urgent request.
- At least one request with a launch/publish date in the next 7 days.
- At least one archived task that should not appear in active planning views.

## Regression Tests Before Implementation

Run these before changing MVP 1.3 code. If any fail, fix the baseline first.

| ID | Area | Test Needed | Why It Matters |
|---|---|---|---|
| REG-301 | Automated tests | Run `npm.cmd test` and confirm all tests pass | Confirms MVP 1.2 baseline is clean |
| REG-302 | Login | Google login works for active whitelisted user | Planning views depend on existing auth |
| REG-303 | Create Creative Request | Submit a normal Creative Request and open detail | Confirms create/assignment path before adding planning fields |
| REG-304 | Assignment engine | Creative Request still assigns by Type/Skill and capacity | Planning fields must not break production assignment |
| REG-305 | Detail | Existing creative details load correctly | New planning context must not break detail |
| REG-306 | List/Search | Search by ID/title/campaign/requester/assignee/status/type still works | Planning search extends this behavior |
| REG-307 | Team Calendar | Existing Team Calendar still loads and uses due/1st Draft date | Planning calendar must not break execution calendar |
| REG-308 | Gantt/Workload | Gantt and Workload still load GD/VE data | Planning views must not replace execution views |
| REG-309 | Notification Center | Notifications load for signed-in user only | Planning additions must not weaken notification/RLS rules |
| REG-310 | B-003 actor spoof | Direct payload cannot spoof another actor | Planning field updates must not reintroduce spoofing |
| REG-311 | B-006 RLS null bypass | Signed-out user cannot read protected work data | Planning views must not expose real rows signed out |

## UAT Cases

### UAT-301 - Planning Section Appears In Navigation

Priority: P0

Preconditions:

- User is logged in as an active app user.

Steps:

1. Open FlowMate.
2. Inspect left navigation.
3. Open Planning section entries.

Expected result:

- Planning section appears.
- Channel View is available.
- Campaign View and Content Calendar appear only if included in the implemented scope.
- Existing Team/Supervisor/Admin navigation still works.
- Planning navigation does not create a separate post-login platform selector.

Failure signals:

- User must choose between FlowMate and Campaign Plan after login.
- Existing execution navigation is removed or confusingly renamed.
- Planning route opens a blank page.

### UAT-302 - Channel View Loads Active Creative Requests

Priority: P0

Preconditions:

- Creative Requests exist with campaign and channel/platform values.
- At least one archived work item exists.

Steps:

1. Open Planning > Channel View.
2. Review visible cards.
3. Compare with List/Board active Creative Requests.

Expected result:

- Active Creative Requests appear in Channel View.
- Archived tasks do not appear in normal planning view.
- Quick Tasks do not appear unless explicitly scoped later.
- Cards use live Supabase data, not static fallback rows.

Failure signals:

- Archived tasks appear.
- Static sample rows appear.
- Quick Tasks appear as campaign content without clear scope decision.

### UAT-303 - Channel View Groups By Normalized Channel

Priority: P0

Preconditions:

- Requests exist for Facebook, Instagram, TikTok, YouTube, Website, In-game, LINE, or Other.

Steps:

1. Open Channel View.
2. Inspect channel columns or sections.
3. Confirm each request appears under the correct channel.

Expected result:

- Channel names are normalized.
- Same channel does not split into duplicate spellings such as `IG`, `Instagram`, and `instagram`.
- Unknown values are handled as Other or original value with a clear fallback.

Failure signals:

- Channels fragment due to spelling/case.
- Request appears under wrong channel.
- Empty channel handling looks like an error.

### UAT-304 - Multi-Channel Asset Appears Under Each Channel

Priority: P0

Preconditions:

- One Creative Request has multiple channels/platforms.

Steps:

1. Open Channel View.
2. Find the multi-channel Creative Request.
3. Check each selected channel.

Expected result:

- The same Creative Request appears under each relevant channel.
- Display ID remains the same.
- Counts make clear whether they represent assets or channel placements.

Failure signals:

- Multi-channel asset appears under only one channel.
- Duplicate cards look like separate tasks.
- Counts are misleading without label/context.

### UAT-305 - Channel Card Shows Required Planning Context

Priority: P0

Preconditions:

- Channel View has at least one Creative Request card.

Steps:

1. Inspect a card in Channel View.
2. Compare the card with detail view.

Expected result:

- Card shows display ID.
- Card shows title.
- Card shows campaign.
- Card shows channel/platform.
- Card shows publish or launch date.
- Card shows 1st Draft date.
- Card shows status.
- Card shows priority.
- Card shows owner/assignee.
- Card shows Type/Skill.
- Card shows readiness or risk label.

Failure signals:

- Manager cannot tell campaign/channel/date from the card.
- Card uses only production status without any readiness/risk context.
- Card text overflows or overlaps.

### UAT-306 - Channel View Filters Work

Priority: P0

Preconditions:

- Channel View has multiple campaigns, channels, statuses, priorities, requester teams, and Type/Skill values.

Steps:

1. Filter by month.
2. Filter by campaign.
3. Filter by channel.
4. Filter by status.
5. Filter by requester team.
6. Filter by priority.
7. Filter by Type/Skill.
8. Clear filters.

Expected result:

- Each filter narrows visible cards correctly.
- Combining filters produces expected intersections.
- Clearing filters restores active planning rows.
- Filter controls remain readable on desktop and mobile widths.

Failure signals:

- Filter returns stale or unrelated results.
- Multi-channel cards disappear from channels that should still match.
- Clearing filters does not restore cards.

### UAT-307 - Channel Card Opens Correct Detail

Priority: P0

Preconditions:

- Channel View has at least one visible card.

Steps:

1. Click a Channel View card.
2. Confirm detail opens.
3. Check display ID and title.
4. Navigate back.

Expected result:

- Detail opens the exact clicked Creative Request.
- Detail displays same campaign/channel/date context.
- Back/navigation returns to a usable planning state.

Failure signals:

- Detail opens wrong item.
- Detail opens stale hardcoded row.
- Planning filters are lost in a confusing way.

### UAT-308 - Campaign View Groups Assets By Campaign

Priority: P0 if Campaign View is included

Preconditions:

- At least two campaigns exist with multiple Creative Requests.

Steps:

1. Open Planning > Campaign View.
2. Inspect campaign groups.
3. Compare with List/Search campaign values.

Expected result:

- Assets are grouped under the correct campaign.
- Empty/missing campaign values are handled clearly.
- Campaign names match Create/Detail/List values.

Failure signals:

- Same campaign splits due to spelling/case when normalization is expected.
- Requests appear under wrong campaign.
- Missing campaign rows are silently hidden.

### UAT-309 - Campaign Summary Numbers Are Clear

Priority: P1

Preconditions:

- Campaign View has at least one campaign with multiple asset statuses.

Steps:

1. Open Campaign View.
2. Inspect summary numbers for a campaign.

Expected result:

- Summary shows total assets.
- Summary shows channels covered.
- Summary shows ready/delivered count.
- Summary shows at-risk count.
- Summary shows blocked count.
- Summary shows urgent count.
- Counts follow the MVP 1.3 counting rules.

Failure signals:

- Multi-channel asset is counted inconsistently.
- Delivered/ready count includes cancelled or archived items.
- Summary cannot be reconciled with visible rows.

### UAT-310 - Planning Content Calendar Uses Publish Or Launch Date

Priority: P0 if Content Calendar planning scope is included

Preconditions:

- Creative Requests exist with publish date or launch date.

Steps:

1. Open Planning Content Calendar.
2. Find known Creative Requests.
3. Compare calendar placement with publish/launch date.

Expected result:

- Publish date is used when available.
- If publish date is absent, launch date is used.
- Team Calendar can still use 1st Draft/due date for execution.
- Date is not off by one day.

Failure signals:

- Planning calendar uses created date.
- Planning calendar accidentally changes Team Calendar due-date behavior.
- Date appears one day early or late.

### UAT-311 - Planning Calendar Shows Campaign And Channel

Priority: P1

Preconditions:

- Planning calendar has visible Creative Requests.

Steps:

1. Open Planning Content Calendar.
2. Inspect month/week/agenda item display.

Expected result:

- Calendar item shows campaign.
- Calendar item shows channel or channel count.
- Clicking item opens correct detail.
- Crowded days remain readable.

Failure signals:

- Manager cannot identify campaign/channel from calendar.
- Multi-channel items create confusing duplicates.
- Text overlaps within calendar cells.

### UAT-312 - Readiness Labels Are Correctly Derived

Priority: P0

Preconditions:

- Test data includes assigned, in_progress, review, delivered, blocked, need_brief, and urgent items where possible.

Steps:

1. Open Channel View or Campaign View.
2. Inspect readiness/risk labels.
3. Compare labels with detail status and dates.

Expected result:

- Assigned/new work shows Planned or In Production according to agreed mapping.
- In Progress shows In Production.
- Review shows In Review.
- Delivered shows Ready or Published according to final label rule.
- Blocked shows Blocked.
- Need Brief shows Need Brief.
- Near-date unfinished items can show At Risk.

Failure signals:

- Delivered work appears At Risk.
- Blocked work appears Ready.
- Urgent status hides more important blocked/need-brief signal.
- Label rules differ between Channel View and Campaign View.

### UAT-313 - Risk Signal For Near Publish Date

Priority: P0

Preconditions:

- One request has publish/launch date within 7 days and is not ready/delivered.

Steps:

1. Open Channel View.
2. Find the request.
3. Inspect risk label.

Expected result:

- Request is marked At Risk or visually flagged.
- Risk reason is understandable enough for manager action.

Failure signals:

- Near-date unfinished request looks normal.
- Risk label appears on unrelated future request.

### UAT-314 - Campaign Field Is Covered Across Product Surface

Priority: P0

Preconditions:

- A Creative Request exists with a unique campaign name.

Steps:

1. Create or find Creative Request with unique campaign.
2. Open detail.
3. Search global search by campaign.
4. Filter List or Planning views by campaign.
5. Check KPI/export if scoped.

Expected result:

- Campaign appears in Create flow.
- Campaign appears in detail.
- Search finds the request by campaign.
- Filters can narrow by campaign where scoped.
- Export includes campaign where scoped.

Failure signals:

- Campaign only exists in Channel View and is missing elsewhere.
- Search cannot find campaign.
- Export/report loses campaign context.

### UAT-315 - Channel Field Is Covered Across Product Surface

Priority: P0

Preconditions:

- A Creative Request exists with a unique channel/platform value.

Steps:

1. Create or find Creative Request with known channel.
2. Open detail.
3. Search global search by channel.
4. Filter Channel View by channel.
5. Check Planning Calendar and export if scoped.

Expected result:

- Channel appears in Create flow.
- Channel appears in detail.
- Search finds the request by channel.
- Channel View groups it correctly.
- Export includes channel where scoped.

Failure signals:

- Channel is visible only during create but not saved.
- Channel is saved but not searchable/filterable.
- Export drops channel context.

### UAT-316 - Publish Date Field Is Covered If Added

Priority: P0 if publish date is added

Preconditions:

- Publish Date exists in MVP 1.3 implementation.

Steps:

1. Create Creative Request with publish date.
2. Open detail.
3. Open Channel View.
4. Open Planning Calendar.
5. Check export if scoped.

Expected result:

- Publish date saves correctly.
- Detail shows publish date.
- Channel View uses publish date.
- Planning Calendar places item on publish date.
- Execution 1st Draft/due date remains unchanged.

Failure signals:

- Publish date overwrites 1st Draft.
- Publish date overwrites launch date unexpectedly.
- Planning views use wrong date.

### UAT-317 - Create Form Still Calculates 1st Draft Correctly

Priority: P0

Preconditions:

- Creative Request create form is available.

Steps:

1. Choose launch/publish date according to the implemented form.
2. Inspect 1st Draft.
3. Submit the request.
4. Open detail.

Expected result:

- 1st Draft remains internal production due date.
- Existing rule for 1st Draft calculation still works.
- Assignment engine still receives valid due date.

Failure signals:

- 1st Draft becomes editable if it should be locked.
- 1st Draft equals publish date incorrectly.
- Assignment engine fails because planning fields changed create payload shape.

### UAT-318 - Assignment Engine Still Works

Priority: P0

Preconditions:

- Creative Request can be submitted.
- GD/VE skills/capacity are configured.

Steps:

1. Create a normal Creative Request with campaign/channel planning fields.
2. Submit.
3. Open detail and assignment reason.

Expected result:

- Request is assigned or queued according to existing assignment rules.
- Type/Skill and Asset Count still drive effort and owner selection.
- Campaign/channel fields do not affect owner assignment unless explicitly scoped later.

Failure signals:

- Assignment fails after adding planning fields.
- Campaign/channel accidentally changes skill matching.
- Effort point calculation breaks.

### UAT-319 - Global Search Finds Planning Fields

Priority: P0

Preconditions:

- Requests exist with unique campaign and channel values.

Steps:

1. Type campaign name in global search.
2. Select result.
3. Type channel name in global search.
4. Select result.

Expected result:

- Search dropdown returns matching Creative Requests.
- Selecting result opens correct detail.
- Search results close on outside click without clearing typed text, preserving existing behavior.

Failure signals:

- Search only works in List.
- Campaign/channel query returns no results.
- Outside-click behavior regresses.

### UAT-320 - KPI And Export Include Planning Fields Where Scoped

Priority: P1

Preconditions:

- KPI/export feature is available.
- Requests exist with campaign/channel values.

Steps:

1. Open KPI.
2. Export selected month.
3. Inspect exported file.

Expected result:

- Export includes campaign where scoped.
- Export includes channel where scoped.
- Export includes publish date if added.
- Existing KPI export format remains usable.

Failure signals:

- Export succeeds but loses campaign/channel.
- Export file extension or format regresses.
- Export includes archived rows in active report.

### UAT-321 - Planning Views Respect RLS

Priority: P0

Preconditions:

- Signed-out/private browser session is available.
- Protected work rows exist.

Steps:

1. Open deployed app signed out.
2. Try to access Planning route directly.
3. Attempt direct protected read if tooling is available.

Expected result:

- Signed-out user cannot load planning data.
- Protected rows are not visible.
- Login screen remains usable.

Failure signals:

- Signed-out user sees planning cards.
- Planning API returns real rows.
- RLS policy adds null-user bypass.

### UAT-322 - Unauthorized User Cannot Mutate Planning Fields

Priority: P0

Preconditions:

- User is active but unrelated to target work item.
- Tester can attempt direct API/RPC mutation if available.

Steps:

1. Try to edit campaign/channel/publish date on unrelated work item.
2. Try direct mutation if tooling is available.

Expected result:

- Unauthorized user cannot mutate planning fields.
- Backend rejects unauthorized mutation.
- UI-only hiding is not the only protection.

Failure signals:

- Direct mutation succeeds.
- Planning fields can be changed by unrelated viewer.

### UAT-323 - Archived Rows Do Not Appear In Active Planning Views

Priority: P0

Preconditions:

- At least one archived work item exists with campaign/channel fields.

Steps:

1. Open Channel View.
2. Open Campaign View if included.
3. Open Planning Calendar if included.
4. Search for archived display ID.

Expected result:

- Archived rows do not appear in normal active planning views.
- Search does not surface archived rows unless admin/archive mode is explicitly added.

Failure signals:

- Archived rows appear as active content.
- Reset/archive historical rows pollute planning counts.

### UAT-324 - Existing Execution Views Still Work

Priority: P0

Preconditions:

- MVP 1.3 implementation is deployed.

Steps:

1. Open My Work.
2. Open Board.
3. Open List.
4. Open Team Calendar.
5. Open Gantt Chart.
6. Open Workload.
7. Open KPI.

Expected result:

- Existing views load.
- Execution Team Calendar still uses 1st Draft/due date behavior.
- Gantt remains GD/VE execution timeline.
- Workload remains capacity/execution view.

Failure signals:

- Planning fields break any execution view.
- Team Calendar changes to publish-date behavior unintentionally.
- Gantt/Workload counts become inconsistent.

### UAT-325 - No Secrets In Frontend Or Storage

Priority: P0

Preconditions:

- MVP 1.3 files are ready.
- Browser devtools and file search are available.

Steps:

1. Search frontend files for password, token, secret, service role, webhook, API key values.
2. Use planning views and inspect localStorage/sessionStorage.

Expected result:

- No service-role key or secret exists in `github/` or browser storage.
- Planning views use normal authenticated Supabase session only.
- No full session/user object is copied into planning feature storage.

Failure signals:

- Secret/token is hardcoded in frontend.
- Planning feature stores full auth/session payload.

## Upload And Deploy Smoke Checklist

Run after manual GitHub web UI upload and GitHub Pages deployment.

| ID | Check | Expected Result |
|---|---|---|
| SMOKE-301 | Open deployed URL with cache buster | App loads without blank page |
| SMOKE-302 | Google Login | Active allowed user enters app |
| SMOKE-303 | Planning navigation | Planning section appears |
| SMOKE-304 | Channel View | Channel View loads live rows |
| SMOKE-305 | Channel grouping | Requests group under correct channels |
| SMOKE-306 | Channel filters | Month/campaign/channel/status filters work |
| SMOKE-307 | Planning card open | Card opens correct detail |
| SMOKE-308 | Campaign field | Campaign appears in create, detail, search, planning |
| SMOKE-309 | Channel field | Channel appears in create, detail, search, planning |
| SMOKE-310 | Publish date if scoped | Publish date appears and drives planning date |
| SMOKE-311 | Team Calendar | Existing Team Calendar still uses 1st Draft/due date |
| SMOKE-312 | Assignment | New Creative Request still assigns or queues correctly |
| SMOKE-313 | Workload/Gantt | Existing execution views still load |
| SMOKE-314 | Signed-out read | Signed-out user cannot see planning data |
| SMOKE-315 | Export if scoped | Export includes planning fields where expected |

## Release Stop Criteria

Do not release MVP 1.3 if any of these happen:

- B-003 actor spoof regression fails.
- B-006 RLS null bypass regression fails.
- Signed-out user can see planning data.
- Planning route exposes archived rows in normal active views.
- Planning fields break Creative Request assignment.
- 1st Draft/due-date behavior regresses.
- Team Calendar accidentally changes from execution date to publish date.
- Channel values fragment because normalization is missing.
- Campaign or channel appears in Planning but is missing from Detail/Search.
- Global search cannot find campaign or channel.
- Planning counts cannot be reconciled with visible rows.
- Existing Board/List/My Work/Calendar/Gantt/Workload breaks.
- Secrets are added to frontend files or browser storage.
- Separate Campaign Plan platform is added before explicit product approval.
- Media budget, copy approval, publishing API, or auto-posting is added to MVP 1.3.
- Automated tests fail and the reason is not understood.

## Automated Test Candidates

Add tests where code has a pure function or low-risk boundary.

- Channel normalization maps common channel/platform values consistently.
- Channel grouping places multi-channel assets under each relevant channel.
- Planning card builder includes campaign, channel, date, status, priority, owner, and Type/Skill.
- Planning date helper uses publish date when available and launch date fallback.
- Readiness helper maps production status/date/risk into expected labels.
- Campaign grouping summarizes total assets, channels covered, at-risk, blocked, urgent, and ready/delivered.
- Search helper includes campaign and channel fields.
- Export helper includes campaign/channel/publish date fields where scoped.
- Archived rows are filtered from active planning rows.
- Team Calendar source still uses 1st Draft/due date, not publish date.
- Create payload preserves Type/Skill, Asset Count, due date, and assignment inputs.
- No new code contains separate platform selector after login.

Avoid brittle automated tests that depend on live Supabase data or GitHub Pages deployment state. Test live behavior manually through the UAT cases above.

## SQL Run Order

MVP 1.3 may need SQL only if the implementation adds fields or backend views.

Expected direction:

1. Existing MVP 1.2 SQL baseline remains applied.
2. If `publish_date` or normalized channel storage is added, document the exact SQL file and run order.
3. Rerun B-003 and B-006 security checks after all SQL is applied.
4. Rerun Creative Request create/assignment smoke test after all SQL is applied.

Final release notes must list exact files to upload and exact SQL files to run.
