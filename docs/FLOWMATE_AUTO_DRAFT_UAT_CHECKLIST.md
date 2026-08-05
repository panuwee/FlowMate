# FlowMate Auto Draft UAT Checklist

> Deprecated as of 2026-07-01. Do not use this checklist for the current approved flow unless Auto Draft is explicitly re-approved. Current flow: Working Sheet -> `Create Brief` -> FlowMate Creative Request -> submit.

Date: 2026-07-01
Project: FlowMate + Marketing Plan
Scope: Auto Draft, Need Brief, Standard Brief Template, and Size Template

## Purpose

This checklist validates the journey from Marketing Plan Working Sheet to FlowMate execution.

The key requirement is:

```text
Marketing Plan row can create a FlowMate task automatically,
but incomplete briefs stay in Need Brief and do not consume GD/VE workload.
```

## Test Roles

- Admin
- Marketing PIC
- Operation PIC
- Esports PIC
- GD/VE assignee
- Viewer / watcher

## Test Data

Prepare at least:

- 1 Marketing Plan campaign
- 5 Working Sheet rows
- 2 static rows
- 2 VDO / Motion rows
- 1 In-game banner row
- 1 row with complete brief
- 1 row with missing brief
- 1 row with multiple channel tags
- 1 row with custom size

## Need Brief Visibility Matrix

This matrix defines what the UAT must prove.

| Surface | Must show Need Brief? | Must count as GD/VE workload? |
|---|---:|---:|
| Board | Yes | No |
| List | Yes | No |
| My Work | Yes, for requester/PIC | No |
| Calendar | Yes | No |
| Gantt Chart | Yes | No |
| Central Queue | Yes | No |
| Workload | Optional count only | No |
| KPI | Separate risk metric only | No |
| Notifications | Yes, when reminders/events apply | No |
| Search | Yes | No |
| Detail | Yes | No |

Pass rule:

```text
Need Brief is visible for planning and follow-up,
but excluded from GD/VE assignment effort, WIP, capacity, load, and delivery-speed KPI.
```

## UAT Cases

### UAT-AD-001 - Save Working Sheet row creates FlowMate draft

Priority: P0

Steps:

1. Open Marketing Plan Working Sheet.
2. Create a new row with Campaign, Product / Event, Channel Tag, Type, Launch Date, and Time.
3. Save the row.
4. Open FlowMate Board.

Expected result:

- A FlowMate Creative Request task is created.
- Task has a display ID.
- Task is linked back to the Marketing Plan row.
- Task status is `Need Brief` when brief fields are incomplete.

### UAT-AD-002 - No duplicate FlowMate task on repeated save

Priority: P0

Steps:

1. Save the same Working Sheet row again.
2. Refresh Marketing Plan.
3. Refresh FlowMate Board.

Expected result:

- No duplicate FlowMate task is created.
- The existing linked FlowMate task is updated or preserved.

### UAT-AD-003 - Need Brief does not count as GD/VE workload

Priority: P0

Steps:

1. Create a Working Sheet row with incomplete brief.
2. Confirm FlowMate task is in `Need Brief`.
3. Open Workload.
4. Check GD/VE member assigned effort and WIP.

Expected result:

- `Need Brief` task is visible.
- No GD/VE assignee is assigned.
- Assigned effort does not increase.
- WIP count does not increase.

### UAT-AD-004 - Complete Static Brief triggers assignment

Priority: P0

Steps:

1. Open a `Need Brief` static task.
2. Complete required common fields.
3. Complete Static Brief required fields.
4. Save and run Recheck Brief.

Expected result:

- Missing brief reason clears.
- Assignment engine runs.
- Task moves from `Need Brief` to `Assigned` if a matching GD/VE owner has skill/capacity.
- Marketing Plan displays `Assigned`.

### UAT-AD-005 - Incomplete Static Brief remains Need Brief

Priority: P0

Steps:

1. Open a static task.
2. Leave Visual direction or Size / Format empty.
3. Run Recheck Brief.

Expected result:

- Task remains `Need Brief`.
- Missing reason explains the missing field.
- No GD/VE assignee is assigned.

### UAT-AD-006 - Complete VDO / Motion Brief triggers assignment

Priority: P0

Steps:

1. Open a VDO / Motion task.
2. Complete Duration, Aspect Ratio, Hook, Script / Storyboard, and required source fields.
3. Save and run Recheck Brief.

Expected result:

- Task is assigned only after required VDO / Motion fields are complete.
- Assignment uses VDO / Motion skill matching.

### UAT-AD-007 - Incomplete VDO / Motion Brief remains Need Brief

Priority: P0

Steps:

1. Open a VDO / Motion task.
2. Leave Duration or Script / Storyboard empty.
3. Run Recheck Brief.

Expected result:

- Task remains `Need Brief`.
- Missing reason is shown.
- Workload remains unchanged.

### UAT-AD-008 - Size template auto-suggests by channel and type

Priority: P0

Steps:

1. Create a Creative Request.
2. Select Type / Skill = Banner.
3. Select Channel Tag = Facebook and Instagram.

Expected result:

- Size suggestions appear for Facebook and Instagram.
- Suggested sizes are grouped or labeled by channel.
- PIC can remove or add sizes.

### UAT-AD-009 - In-game placement size mapping works

Priority: P0

Steps:

1. Select Channel Tag = In-game.
2. Select placement `Full Size Splash`.
3. Select placement `Mission Hub Web Event`.

Expected result:

- `730x504 Full Size Splash` appears.
- `668x157 Mission Hub Web Event` appears.
- Selected sizes are saved to the request.

### UAT-AD-010 - Custom size fallback works

Priority: P1

Steps:

1. Select Channel Tag = Other.
2. Add a custom size.
3. Save the request.

Expected result:

- Custom size is saved.
- No invalid default size is guessed.

### UAT-AD-011 - Marketing Plan status syncs from FlowMate

Priority: P0

Steps:

1. Create a linked Marketing Plan row and FlowMate task.
2. Complete brief and assign the task.
3. Move FlowMate task to Review.
4. Move FlowMate task to Delivered.
5. Refresh Marketing Plan.

Expected result:

- Assigned FlowMate task displays as `Assigned` in Marketing Plan.
- Review FlowMate task displays as `Review`.
- Delivered FlowMate task displays as `Ready to Post`.

### UAT-AD-012 - Open linked task from Marketing Plan

Priority: P0

Steps:

1. Open Marketing Plan Working Sheet.
2. Find a row with a linked FlowMate task.
3. Click Open / Brief Link.

Expected result:

- User lands on the correct FlowMate detail route.
- Detail loads the task even if the task is not already in the current FlowMate view.

### UAT-AD-013 - Permission boundaries

Priority: P0

Steps:

1. Sign in as a normal PIC.
2. Create or edit own Working Sheet row.
3. Sign in as another non-admin user.
4. Attempt to edit restricted fields if not owner.
5. Sign in as admin.

Expected result:

- PIC can create and complete brief for permitted rows.
- Unauthorized users cannot overwrite another user's task without permission.
- Admin can override with audit log.
- Backend uses `auth.uid()`, not client-provided actor ID.

### UAT-AD-014 - Activity log records key actions

Priority: P1

Steps:

1. Auto-create task from Working Sheet.
2. Add Brief Link.
3. Add Reference Link.
4. Complete brief.
5. Run assignment.

Expected result:

- Activity log records who created the draft.
- Activity log records who added links.
- Activity log records status movement from Need Brief to Assigned.

### UAT-AD-015 - Existing FlowMate creation still works

Priority: P0 regression

Steps:

1. Open FlowMate Create.
2. Create a Creative Request directly without Marketing Plan.
3. Complete required fields.
4. Submit.

Expected result:

- Direct FlowMate creation still works.
- Brief completeness and size template logic still applies.
- No Marketing Plan row is required.

### UAT-AD-016 - Need Brief appears on Board before Assigned

Priority: P0

Steps:

1. Create a Marketing Plan row with missing required brief fields.
2. Open FlowMate Board.

Expected result:

- Board has a `Need Brief` column before `Assigned`.
- The new task appears in `Need Brief`.
- The task does not appear in `Assigned`.

### UAT-AD-017 - Need Brief appears in List, Search, and Detail

Priority: P0

Steps:

1. Create a `Need Brief` task.
2. Open FlowMate List.
3. Filter or search by status, ID, campaign, and Product / Event.
4. Open the task detail.

Expected result:

- The task is visible in List.
- Search can find the task.
- Detail loads directly.
- Detail shows missing brief reason and fields needed to complete the brief.

### UAT-AD-018 - Need Brief appears in Calendar and Gantt without GD/VE ownership

Priority: P0

Steps:

1. Create a `Need Brief` task with Launch Date and Publish Time.
2. Open Calendar.
3. Open Gantt Chart.

Expected result:

- Calendar shows the task on the launch date.
- Gantt shows the task as planning risk.
- Gantt does not place the task under a GD/VE assignee row.
- The task is not counted as assigned production work.

### UAT-AD-019 - Need Brief is excluded from Workload production metrics

Priority: P0

Steps:

1. Record GD/VE assigned effort, WIP, capacity, and load.
2. Create a `Need Brief` task.
3. Refresh Workload.

Expected result:

- Assigned effort does not increase.
- WIP does not increase.
- Capacity/load does not decrease.
- If a Need Brief count is shown, it is clearly separate from production workload.

### UAT-AD-020 - Need Brief is excluded from delivery KPI but tracked as risk

Priority: P1

Steps:

1. Create at least two `Need Brief` tasks.
2. Open KPI.
3. Export KPI if the report includes Need Brief fields.

Expected result:

- Delivered effort does not include Need Brief.
- Active production and average delivery speed do not include Need Brief.
- Need Brief count, aging, or PIC risk can be shown separately.

### UAT-AD-021 - Need Brief notifications target PIC/requester/watchers

Priority: P1

Steps:

1. Create a `Need Brief` task near launch date.
2. Add a watcher.
3. Trigger missing-brief reminder logic if available.

Expected result:

- PIC/requester receives a useful notification.
- Watcher receives notification when relevant.
- GD/VE assignees do not receive assignment notifications before assignment exists.

## Regression Checklist

- FlowMate Board loads.
- FlowMate Board shows `Need Brief` before `Assigned`.
- FlowMate List can filter/search `Need Brief`.
- FlowMate Calendar shows `Need Brief` by Launch Date / Publish Time.
- FlowMate Gantt shows `Need Brief` without putting it under GD/VE workload.
- FlowMate Workload excludes `Need Brief` from assigned effort.
- FlowMate KPI excludes `Need Brief` from delivered metrics.
- FlowMate KPI can show Need Brief risk separately when implemented.
- Marketing Plan Working Sheet loads.
- Marketing Plan Campaign Timeline still reads Working Sheet rows.
- Marketing Plan Channel Plan still reads Working Sheet rows.
- Marketing Plan Calendar still reads Working Sheet rows.
- Existing linked Brief Links still open correct FlowMate details.

## Pass Criteria

The feature is ready when:

- All P0 cases pass.
- No duplicate task creation is observed.
- `Need Brief` never consumes GD/VE workload.
- `Need Brief` is visible across Board, List, Calendar, Gantt, Queue, Search, and Detail.
- Completed briefs reliably move to assignment.
- Status sync works from FlowMate back to Marketing Plan.

## Next Step

After this checklist is approved, split implementation into SQL/data model, FlowMate frontend, Marketing Plan frontend, and QA/UAT workstreams.
