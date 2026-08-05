# FlowMate Auto Draft Work Split Prompts

> Deprecated as of 2026-07-01. Do not send these prompts to implementation chats unless the user explicitly re-approves Auto Draft. Current approved flow: Working Sheet -> `Create Brief` -> FlowMate Creative Request -> submit.

Date: 2026-07-01
Project: FlowMate + Marketing Plan
Coordinator: Main Coordinator
Scope source:

- `docs/FLOWMATE_AUTO_DRAFT_SCOPE.md`
- `docs/FLOWMATE_STANDARD_BRIEF_TEMPLATE.md`
- `docs/FLOWMATE_SIZE_TEMPLATE_SCOPE.md`
- `docs/FLOWMATE_AUTO_DRAFT_UAT_CHECKLIST.md`

## Goal

Implement the Auto Draft journey:

```text
Marketing Plan Working Sheet
  -> Save row
      -> Auto-create FlowMate Creative Request draft
      -> Status: Need Brief
      -> No GD/VE workload impact
  -> PIC completes standardized brief
  -> Recheck brief
  -> Assignment engine runs
  -> Status: Assigned
```

Core rule:

```text
Need Brief is visible for planning and follow-up,
but excluded from GD/VE assignment effort, WIP, capacity, load, and delivery-speed KPI.
```

## Recommended Work Order

### Must be sequential

1. Chat A - Backend SQL / data model / RPC contract
2. Chat B - FlowMate frontend status and brief UI
3. Chat C - Marketing Plan frontend auto-draft integration
4. Chat D - Size Template UI and effort handoff
5. Chat E - QA / UAT / integration audit
6. Main Coordinator - final integration check and upload list

### Can be parallel after Chat A finishes

- Chat B and Chat C can run in parallel after Chat A publishes the RPC/data contract.
- Chat D can run in parallel with Chat B/C if Chat A has created the size-template table or agreed frontend fallback shape.
- Chat E should wait until B/C/D handoffs are uploaded or merged locally.

## Shared Rules For Every Chat

Use these rules in every downstream prompt.

```text
You are working in:
C:\Users\panuwee.w\Documents\New project 2

The user deploys manually through GitHub web UI.
Do not git push.
Finish with exact files to upload.

Preserve existing FlowMate + Marketing Plan behavior unless the prompt explicitly changes it.
Do not store passwords, API keys, tokens, or secrets.
Do not trust client-supplied actor IDs.
Use auth.uid() / existing current app user helpers for trusted identity.

Need Brief rule:
- Visible in Board, List, My Work for requester/PIC, Calendar, Gantt, Central Queue, Search, Detail.
- Not counted in GD/VE assigned effort, WIP, capacity, load, or average delivery time.
- KPI may show Need Brief count/aging/PIC risk separately.
- Notifications should target PIC/requester/watchers, not GD/VE assignee before assignment exists.

Brief rule:
- Structured FlowMate brief fields are the source of truth.
- Brief Link remains supporting reference.
- Incomplete required brief fields keep status = Need Brief.
- Complete brief allows assignment engine to run.

Marketing Plan rule:
- Working Sheet remains source of planning data.
- Marketing Plan views read Working Sheet / placement data.
- FlowMate is execution.
- Linked FlowMate status can influence Marketing Plan display status.

Verification:
- Add or update UAT coverage in src/lib/flowmate.uat.test.ts.
- Run targeted test first when possible:
  npm.cmd test -- src/lib/flowmate.uat.test.ts
- Run full test before handoff:
  npm.cmd test
- If frontend GitHub files are changed, run:
  npm.cmd run build:github
  and include generated github/*.js plus github/index.html if cache version changes.
```

## Chat A Prompt - Backend SQL / Data Model / RPC Contract

```text
You are Chat A for FlowMate Auto Draft backend.

Read these source docs first:
- docs/FLOWMATE_AUTO_DRAFT_SCOPE.md
- docs/FLOWMATE_STANDARD_BRIEF_TEMPLATE.md
- docs/FLOWMATE_SIZE_TEMPLATE_SCOPE.md
- docs/FLOWMATE_AUTO_DRAFT_UAT_CHECKLIST.md
- supabase/schema.sql
- supabase/rpc_assignment.sql
- supabase/rpc_quick_task.sql
- supabase/marketing_plan.sql
- supabase/marketing_plan_status_update.sql
- supabase/marketing_plan_supervisor.sql
- supabase/README.md

Goal:
Create the backend foundation for Marketing Plan Working Sheet rows to auto-create linked FlowMate Creative Request draft tasks with status Need Brief.

Scope:
1. Add/support FlowMate status `need_brief`.
2. Ensure Need Brief status transitions are valid:
   - need_brief -> assigned when brief complete and assignment succeeds
   - need_brief -> cancelled
   - need_brief -> blocked only if the existing workflow needs it, otherwise keep blocked after execution only
3. Add or confirm Marketing Plan to FlowMate link:
   - `marketing_content_items.flowmate_work_item_id` references `work_items.id`
   - idempotent behavior prevents duplicate FlowMate tasks for the same content item
4. Add RPC or extend existing Marketing Plan save RPC to create/update linked FlowMate task:
   - use auth.uid()
   - no client-supplied trusted actor ID
   - if link exists, update/link existing task
   - if link missing, create FlowMate task as Need Brief when brief incomplete
5. Add structured brief storage:
   - common brief fields
   - static brief fields
   - vdo/motion brief fields
   - keep implementation pragmatic: JSONB is acceptable for MVP if schema/table split is too heavy
6. Add brief completeness helper:
   - returns missing reason
   - static and vdo/motion rules differ
   - missing size keeps Need Brief
7. Ensure assignment engine does not assign incomplete brief.
8. Ensure Workload/KPI active production queries exclude Need Brief from assigned effort/WIP/capacity.
9. Add configurable size template seed/table if feasible:
   - Facebook, TikTok, Instagram, YouTube, In-game, Other
   - include approved In-game sizes from scope doc
10. Update supabase/README.md SQL run order.
11. Add UAT/source-contract tests in src/lib/flowmate.uat.test.ts.

Out of scope:
- Frontend UI implementation.
- Visual redesign.
- Git push.

Acceptance criteria:
- SQL is idempotent.
- Need Brief can exist as a valid work item status.
- Marketing Plan row can link to one FlowMate task.
- Incomplete brief creates/keeps Need Brief.
- Complete brief can run assignment.
- Need Brief does not count as GD/VE workload.
- No actor spoofing.
- UAT tests pass.

Verification:
- npm.cmd test -- src/lib/flowmate.uat.test.ts
- npm.cmd test

Handoff:
Return:
- Files changed
- SQL run order
- Whether Supabase SQL must be run
- Key RPC names and expected frontend call contract
- Any frontend assumptions for Chat B/C/D
- Exact files to upload
```

## Chat B Prompt - FlowMate Frontend Status, Board, Detail, List, Calendar, Gantt, Workload, KPI

```text
You are Chat B for FlowMate Auto Draft frontend.

Wait for Chat A backend handoff before implementation.

Read:
- docs/FLOWMATE_AUTO_DRAFT_SCOPE.md
- docs/FLOWMATE_STANDARD_BRIEF_TEMPLATE.md
- docs/FLOWMATE_AUTO_DRAFT_UAT_CHECKLIST.md
- Chat A backend handoff
- github/app.jsx
- github/screens-a.jsx
- github/screens-b.jsx
- github/screens-c.jsx
- github/supabase-list-data.js
- github/supabase-quick-task.js
- github/search-utils.js
- src/lib/flowmate.uat.test.ts

Goal:
Make FlowMate correctly display and handle Need Brief tasks and structured brief completion.

Scope:
1. Add Need Brief to FlowMate status display and routing.
2. Board:
   - add Need Brief column before Assigned
   - show missing brief reason
   - do not show Need Brief under Assigned
3. Detail:
   - show structured brief fields
   - support Static and VDO/Motion fields
   - show missing required fields
   - add Recheck Brief action
   - preserve Link zone, Comment zone, Watchers, AI Tag, Activity log
4. List/Search:
   - Need Brief searchable/filterable/exportable
   - search by status, campaign, product/event, requester/PIC
5. My Work:
   - show Need Brief to requester/PIC
   - do not show as GD/VE assigned work
6. Calendar:
   - show Need Brief by Launch Date / Publish Time
7. Gantt:
   - show Need Brief as Need Brief / Unassigned / PIC planning risk
   - do not place under GD/VE assignee rows
8. Workload:
   - exclude Need Brief from assigned effort, WIP, capacity, load
   - optional separate Need Brief count is allowed if visually separate
9. KPI:
   - exclude Need Brief from delivered/active production/avg completion days
   - optional separate Need Brief risk metric is allowed
10. Notifications:
   - if touched, ensure Need Brief reminders target PIC/requester/watchers, not GD/VE before assignment
11. Add/adjust UAT coverage.

Out of scope:
- Marketing Plan Working Sheet save integration.
- SQL schema changes unless Chat A missed a tiny frontend blocker.
- Git push.

Acceptance criteria:
- Need Brief is visible where planning needs it.
- Need Brief is not counted as GD/VE workload.
- Completing brief can trigger backend recheck/assignment.
- Existing direct Creative Request creation still works.
- Existing assigned/in-progress/review/delivered statuses still work.

Verification:
- npm.cmd run build:github
- npm.cmd test -- src/lib/flowmate.uat.test.ts
- npm.cmd test

Handoff:
Return:
- Files changed
- Screens affected
- Manual checks performed or recommended
- Any backend mismatch found
- Exact files to upload
```

## Chat C Prompt - Marketing Plan Frontend Auto Draft Integration

```text
You are Chat C for Marketing Plan Auto Draft integration.

Wait for Chat A backend handoff before implementation.

Read:
- docs/FLOWMATE_AUTO_DRAFT_SCOPE.md
- docs/FLOWMATE_AUTO_DRAFT_UAT_CHECKLIST.md
- docs/MARKETING_PLAN_PRODUCT_SCOPE.md
- docs/MARKETING_PLAN_DATA_MODEL.md
- Chat A backend handoff
- github/app.jsx
- github/screens-a.jsx
- github/screens-b.jsx
- github/screens-c.jsx
- github/supabase-quick-task.js
- github/supabase-list-data.js
- src/lib/flowmate.uat.test.ts

Goal:
Update Marketing Plan Working Sheet so saving a row auto-creates or links a FlowMate Need Brief task through the backend contract from Chat A.

Scope:
1. Working Sheet save:
   - call the new/updated backend RPC
   - auto-create linked FlowMate task idempotently
   - keep the Marketing Plan row if FlowMate draft creation fails and show retry state
2. Current working rows:
   - show linked FlowMate ID or Open Task / Open Brief action
   - hide Create Brief when linked FlowMate task exists
   - keep Edit available
3. Status display:
   - Need Brief can display as Planned in Marketing Plan if MVP chooses not to add a new Marketing Plan status
   - Assigned/Review/Ready to Post sync rules must remain intact
4. Brief Link behavior:
   - linked FlowMate detail link opens correct route
   - no duplicate task creation on repeated save
5. Marketing Plan views:
   - Campaign Timeline, Channel Plan, Calendar continue reading Working Sheet/placement data
   - linked FlowMate status can affect display status only through agreed helper/contract
6. Add/adjust UAT coverage.

Out of scope:
- FlowMate Board/Detail UI.
- Backend SQL unless Chat A missed a small frontend blocker.
- Git push.

Acceptance criteria:
- Save Working Sheet row creates/links one FlowMate task.
- Re-saving the same row does not duplicate.
- Create Brief is hidden once a linked task exists.
- Open Task goes to correct FlowMate detail.
- Existing Marketing Plan Timeline/Channel/Calendar views still work.

Verification:
- npm.cmd run build:github
- npm.cmd test -- src/lib/flowmate.uat.test.ts
- npm.cmd test

Handoff:
Return:
- Files changed
- RPCs called by frontend
- Manual checks performed or recommended
- Exact files to upload
```

## Chat D Prompt - Size Template UI and Effort Handoff

```text
You are Chat D for FlowMate Size Template UI.

Wait for Chat A backend handoff if SQL table/RPC shape is included.
If Chat A does not implement backend size templates, use a conservative frontend config fallback and clearly mark it as temporary.

Read:
- docs/FLOWMATE_SIZE_TEMPLATE_SCOPE.md
- docs/FLOWMATE_STANDARD_BRIEF_TEMPLATE.md
- docs/FLOWMATE_AUTO_DRAFT_UAT_CHECKLIST.md
- Chat A backend handoff
- github/screens-a.jsx
- github/screens-b.jsx
- github/screens-c.jsx
- github/supabase-quick-task.js
- src/lib/flowmate.uat.test.ts

Goal:
Replace free-text-only Size / Format behavior with size suggestions based on Channel Tag and Type / Skill.

Scope:
1. Creative Request:
   - show size suggestions after Type / Skill and Channel Tag are selected
   - support multi-channel grouped sizes
   - support In-game placement picker
   - support custom size fallback
2. In-game approved sizes:
   - 730x504 Full Size Splash
   - 730x166 1/3 Splash
   - 240x76 PNG Free Roam + In-web
   - 240x160 Scroll Banner
   - 362x202 News Icon
   - 668x157 Mission Hub Web Event
   - 240x93 In-game Free Roam
   - 1359x144 In-game Tab Shop
3. Detail/List/export:
   - selected sizes are visible in detail
   - selected sizes are included in relevant exports/reports
4. Brief gate:
   - missing required size keeps task in Need Brief
   - missing size does not consume workload
5. Effort handoff:
   - expose selected size/output count clearly for assignment effort logic
   - do not blindly multiply all channel sizes unless assignment logic explicitly supports it
6. Add/adjust UAT coverage.

Out of scope:
- Full admin UI to manage size templates unless Chat A already provides it and scope remains small.
- Changing GD/VE skill rules outside the required size output handoff.
- Git push.

Acceptance criteria:
- Channel + Type produces relevant size suggestions.
- In-game placement mapping works.
- Custom size works.
- Missing required size blocks assignment as Need Brief.
- Existing Creative Request creation still works.

Verification:
- npm.cmd run build:github
- npm.cmd test -- src/lib/flowmate.uat.test.ts
- npm.cmd test

Handoff:
Return:
- Files changed
- Whether size data is frontend config or backend table
- Effort-counting assumptions
- Exact files to upload
```

## Chat E Prompt - QA / UAT / Cross-Surface Integration Audit

```text
You are Chat E for FlowMate Auto Draft QA and integration.

Wait until Chat A, B, C, and D handoffs are available.

Read:
- docs/FLOWMATE_AUTO_DRAFT_SCOPE.md
- docs/FLOWMATE_STANDARD_BRIEF_TEMPLATE.md
- docs/FLOWMATE_SIZE_TEMPLATE_SCOPE.md
- docs/FLOWMATE_AUTO_DRAFT_UAT_CHECKLIST.md
- Handoffs from Chat A/B/C/D
- src/lib/flowmate.uat.test.ts
- relevant github and supabase files changed by prior chats

Goal:
Audit the integrated implementation against UAT-AD-001 through UAT-AD-021 and the Need Brief visibility matrix.

Scope:
1. Verify backend contract:
   - no client-trusted actor ID
   - idempotent Marketing Plan to FlowMate link
   - Need Brief valid status
   - brief completeness helper exists
   - assignment blocked until brief complete
2. Verify FlowMate surfaces:
   - Board
   - List/Search
   - My Work
   - Calendar
   - Gantt
   - Central Queue
   - Detail
   - Workload
   - KPI
   - Notifications if implemented
3. Verify Marketing Plan surfaces:
   - Working Sheet
   - Campaign Timeline
   - Channel Plan
   - Calendar
   - linked task route
4. Verify Size Template:
   - Channel + Type suggestions
   - In-game placement mapping
   - custom size fallback
5. Verify tests:
   - targeted UAT
   - full test
   - build if frontend changed
6. Identify blockers and exact fixes if any fail.

Out of scope:
- Large redesign.
- Implementing new features beyond failing acceptance criteria.
- Git push.

Acceptance criteria:
- All P0 UAT cases pass or are clearly blocked with root cause.
- Need Brief is visible everywhere required.
- Need Brief is excluded from workload and delivery KPI metrics.
- No duplicate task creation.
- Status sync works Marketing Plan <-> FlowMate.

Verification:
- npm.cmd run build:github
- npm.cmd test -- src/lib/flowmate.uat.test.ts
- npm.cmd test
- Manual browser checks if local app is available.

Handoff:
Return:
- Pass/fail by UAT case
- Bugs found with file references
- Required fixes
- Final upload list
- SQL run order still required, if any
```

## Main Coordinator Final Integration Prompt

```text
You are Main Coordinator for FlowMate Auto Draft.

Inputs:
- Chat A backend handoff
- Chat B FlowMate frontend handoff
- Chat C Marketing Plan frontend handoff
- Chat D Size Template handoff
- Chat E QA/UAT handoff

Goal:
Decide whether the Auto Draft implementation is ready for user upload and Supabase SQL execution.

Checklist:
1. Confirm all required files are present.
2. Confirm SQL run order is clear.
3. Confirm frontend bundle was rebuilt if needed.
4. Confirm cache version was bumped if github/app.js changed.
5. Confirm targeted and full tests passed.
6. Confirm Need Brief visibility matrix is satisfied.
7. Confirm Need Brief does not affect GD/VE workload/WIP/capacity.
8. Confirm duplicate task creation is prevented.
9. Confirm no actor spoofing was introduced.
10. Produce exact upload list for manual GitHub web UI.

Final response format:
- Status
- What changed
- SQL to run, if any
- Files to upload
- Tests passed
- Manual checks still needed
- Next recommended step
```

## Dependency Summary

| Chat | Can start now? | Depends on | Output |
|---|---:|---|---|
| A Backend SQL | Yes | Scope docs | SQL/RPC/data contract |
| B FlowMate frontend | After A | Chat A contract | FlowMate Need Brief UI |
| C Marketing Plan frontend | After A | Chat A contract | Working Sheet auto draft |
| D Size Template UI | After A, or parallel with fallback | Chat A size contract preferred | Size suggestions and custom sizes |
| E QA/UAT | After B/C/D | All handoffs | Integrated QA report |
| Main Coordinator | After E | All handoffs | Final upload/run handoff |

## Recommended Next Action

Start with Chat A.

Do not start Chat B/C/D implementation until Chat A confirms the backend RPC/data contract, otherwise frontend chats may build against the wrong API shape.
