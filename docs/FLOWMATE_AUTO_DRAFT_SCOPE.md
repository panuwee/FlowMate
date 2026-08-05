# FlowMate Auto Draft Scope / PRD

> Deprecated as of 2026-07-01. Do not implement this Auto Draft journey unless the user explicitly re-approves it. The current approved flow is Marketing Plan Working Sheet -> click `Create Brief` -> review/edit FlowMate Creative Request -> submit.

Date: 2026-07-01
Project: FlowMate + Marketing Plan
Theme: Marketing Plan to FlowMate execution bridge

## Status

Marketing Plan now owns monthly planning data. FlowMate owns creative production execution.

The current journey requires a PIC to:

1. Create a Working Sheet row in Marketing Plan.
2. Click `Create Brief`.
3. Land on FlowMate Creative Request.
4. Complete the remaining fields.
5. Submit the request.
6. Receive a FlowMate detail link back in Marketing Plan.

This is workable, but it creates duplicate entry and makes it easy for planned work to stay outside FlowMate until someone remembers to create the brief.

## Product Goal

When a Marketing Plan Working Sheet row is created, FlowMate should automatically create a visible creative task shell so planned creative work enters the production pipeline early.

The task should not consume GD/VE workload or become assigned until the brief is complete.

## Recommended Journey

```text
Marketing Plan Working Sheet
  -> Save row
      -> Auto-create FlowMate Creative Request draft
          -> Status: Need Brief
          -> No GD/VE assignee yet
          -> Not counted as assigned workload
      -> PIC completes structured brief fields
      -> Brief completeness check passes
      -> Assignment engine runs
      -> Status: Assigned
```

## Board Status Model

The FlowMate board should include `Need Brief` before `Assigned`.

```text
Need Brief
  -> Assigned
  -> In Progress
  -> Review
  -> Delivered
```

Blocked can occur after work has entered execution:

```text
Assigned / In Progress / Review
  -> Blocked
  -> Assigned or In Progress
```

Cancelled and Admin archive remain available as operational exits.

## Need Brief Visibility Matrix

Principle:

```text
Need Brief should be visible everywhere it helps planning,
but it should not behave like assigned production workload.
```

| Surface | Show Need Brief? | Count as GD/VE workload? | Expected behavior |
|---|---:|---:|---|
| Board | Yes | No | Show as its own column before Assigned |
| List | Yes | No | Search, filter, and export as a normal work item status |
| My Work | Yes, for requester/PIC | No | PIC sees rows that still need brief completion |
| Calendar | Yes | No | Show launch-date risk before publish date arrives |
| Gantt Chart | Yes | No | Show under Need Brief / Unassigned / PIC grouping, not under GD/VE workload |
| Central Queue | Yes | No | Supervisor can see brief-gated work that cannot enter assignment |
| Workload | Limited | No | Show only as an operational count if needed; exclude from assigned effort, WIP, capacity, and load |
| KPI | Yes, as separate metric | No | Count Need Brief volume/aging/PIC risk; exclude from delivered, active production, and completion speed metrics |
| Notifications | Yes | No | Notify PIC/requester/watchers when brief is missing, near launch, or completed |
| Search | Yes | No | Search by ID, title, campaign, product/event, requester, and status |
| Detail | Yes | No | Show missing reason and structured brief fields to complete |

Required implementation rule:

- Do not hide Need Brief tasks from operational views.
- Do not assign a GD/VE owner while brief is incomplete.
- Do not include Need Brief in GD/VE effort, WIP, workload capacity, or average delivery time.
- Do include Need Brief in planning risk, aging, and PIC follow-up reporting.

## In Scope

### 1. Auto-create FlowMate task from Marketing Plan Working Sheet

When a Working Sheet row is saved, the system should create or link one FlowMate Creative Request draft.

Minimum mapped fields:

- Campaign
- Product / Event
- Channel Tag
- Asset Type / Skill
- Tier
- Launch Date
- Publish Time
- PIC / requester
- Brief Link when available
- Reference Link when available
- Size / Format when auto-generated or manually selected

### 2. Idempotent linking

The same Working Sheet row must not create duplicate FlowMate tasks.

Expected rule:

- If `marketing_content_items.flowmate_work_item_id` exists, update/link the existing task.
- If it does not exist, create a new FlowMate task.
- If creation fails, keep the Marketing Plan row and show a clear error.

### 3. Need Brief gate

New auto-created tasks should start as `Need Brief` when required brief fields are incomplete.

Need Brief tasks:

- Are visible in FlowMate Board, List, Calendar, and detail.
- Are visible to requester/PIC/admin.
- Do not count against GD/VE assigned effort.
- Do not count against GD/VE WIP.
- Do not show as assigned work for GD/VE.
- Can receive comments, links, watchers, and AI tags.

### 4. Brief completion and assignment

When brief fields pass validation:

- Recheck brief.
- Run assignment engine.
- Move task to `Assigned` when an owner is found.
- Keep task in `Need Brief` when required fields remain missing.
- Move task to queue when brief is complete but no candidate has skill/capacity.

### 5. Marketing Plan status sync

Marketing Plan should display status based on linked FlowMate execution state.

Recommended mapping:

| FlowMate status | Marketing Plan display status |
|---|---|
| Need Brief | Planned or Need Brief |
| Assigned | Assigned |
| In Progress | Assigned |
| Review | Review |
| Delivered | Ready to Post |
| Blocked | Blocked |
| Cancelled | Cancelled |

For MVP, `Need Brief` can display as `Planned` in Marketing Plan if adding a new Marketing Plan status is too disruptive. FlowMate should still use the explicit `Need Brief` status.

## Out of Scope

- Auto-assigning incomplete briefs.
- Replacing Marketing Plan Working Sheet with FlowMate Creative Request.
- Replacing Google Slide export in this phase.
- Auto-generating final creative copy or design assets.
- Multi-task splitting for one content row unless explicitly requested later.
- Changing Quick Task behavior.

## Backend Requirements

### Tables / fields

Recommended additions:

- `work_items.status` supports `need_brief`.
- `marketing_content_items.flowmate_work_item_id` links to `work_items.id`.
- `marketing_content_items.brief_link` or equivalent remains the planning-side visible link.
- Structured brief tables or JSON fields are added under FlowMate, not Marketing Plan.

### RPC behavior

Recommended RPCs:

- `marketing_plan_create_or_update_working_row(...)`
  - creates/updates Marketing Plan row
  - creates FlowMate draft when appropriate
  - uses `auth.uid()` for actor identity

- `flowmate_recheck_brief_and_assign(p_work_item_id uuid)`
  - checks required brief fields
  - runs assignment engine only when complete

### Security

- Do not accept trusted actor IDs from the client.
- Use `auth.uid()` and current app user helpers.
- Requester/PIC/admin can edit Need Brief content.
- GD/VE assignee should not be set until assignment passes.
- Admin can override but must be audited.

## Frontend Requirements

### Marketing Plan Working Sheet

After save:

- Show linked FlowMate ID when task is created.
- Hide `Create Brief` when a linked FlowMate task exists.
- Show `Open Brief` or `Open Task`.
- If draft creation fails, show a clear retry state.

### FlowMate Board

Add `Need Brief` column before `Assigned`.

The column should show:

- Work item ID
- Campaign
- Product / Event
- Missing brief reason
- Launch Date + Publish Time
- PIC/requester

### FlowMate Detail

Need Brief task detail should allow:

- Completing brief template fields.
- Adding / editing Brief Link.
- Adding Reference Link.
- Adding comments and working links.
- Adding watchers.
- Rechecking brief.

## Acceptance Criteria

- Saving a new Marketing Plan Working Sheet row creates one FlowMate task.
- The FlowMate task starts as `Need Brief` when brief fields are incomplete.
- `Need Brief` tasks do not count toward GD/VE workload or WIP.
- `Need Brief` is visible on Board, List, Calendar, Gantt, Queue, Search, and Detail.
- Workload and KPI exclude `Need Brief` from production load metrics but can show separate risk counts.
- Completing required brief fields runs assignment and moves the task to `Assigned`.
- The Marketing Plan row links to the correct FlowMate detail page.
- Re-saving the same Working Sheet row does not create duplicate FlowMate tasks.
- Status changes in FlowMate are reflected in Marketing Plan views.

## Risks

### Duplicate task creation

Mitigation: enforce a unique link from Marketing Plan content item to FlowMate work item.

### Workload inflation

Mitigation: exclude `Need Brief`, `cancelled`, `delivered`, and archived tasks from active GD/VE effort calculations.

### Too much friction in brief form

Mitigation: keep Creative Request short, and place structured brief fields in a collapsible or progressive section.

### Brief Link dependence

Mitigation: structured fields are source of truth; Brief Link is supporting reference.

## Implementation Phases

### Phase 1 - Draft creation

- Add `Need Brief`.
- Auto-create FlowMate task from Working Sheet save.
- Link Marketing Plan row to FlowMate task.
- Hide duplicate Create Brief button.

### Phase 2 - Structured brief

- Add Static and VDO/Motion brief fields.
- Add brief completeness rules.
- Recheck brief before assignment.

### Phase 3 - Size automation

- Add size template config.
- Auto-suggest Size / Format by Type / Skill and Channel Tag.
- Feed output count into effort calculation.

### Phase 4 - Reporting

- Add Need Brief aging.
- Add PIC response time.
- Add incomplete brief risk report.

## Next Step

Implement Phase 1 only after the brief template and size template rules are accepted, because the Need Brief gate depends on those required fields.
