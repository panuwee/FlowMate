# FlowMate Creative Date, AI Tag, and Gantt Lite Design

Date: 2026-06-09
Project: FlowMate MVP 1.2 continuation

## Goal

Tighten three user-facing FlowMate areas without expanding backend risk:

1. Creative Request `1st Draft` is generated automatically from `Launch Date`.
2. AI Tag can be added in one click and removed clearly.
3. Team Gantt Chart feels closer to Trello TeamGantt Power-Up Lite while staying read-only.

## Scope

### 1st Draft Auto-Lock

Creative Request will treat `Launch Date` as the source of truth.

- `1st Draft = Launch Date - 5 working days`.
- Working days are Monday through Friday.
- The `1st Draft` input is disabled/read-only in the Creative Request form.
- Users cannot manually select or override `1st Draft`.
- If `Launch Date` is empty, `1st Draft` stays empty.
- The frontend still sends the computed date when available.
- The backend keeps the existing fallback: if `p_due_date` is null and `p_launch_date` exists, SQL computes the same 5-working-day offset.

Quick Task behavior is unchanged.

### AI Tag One-Click Add/Remove

The `+ Add AI Tag` action will no longer open a prompt.

- Clicking `+ Add AI Tag` immediately adds the default tag `AI`.
- If `AI` already exists on the task, the UI should not add a duplicate.
- Removing an AI Tag is available directly on the tag chip.
- The remove button must be visible and accessible enough to understand as delete/remove.
- Existing RPCs stay in use:
  - `add_work_item_ai_tag`
  - `remove_work_item_ai_tag`
  - `list_work_item_ai_tags`

No password, key, token, or secret is stored.

### Team Gantt Chart Power-Up Lite

The selected direction is option A: Trello Power-Up Lite.

This round is a read-only planning view:

- Keep the Team navigation route below Calendar.
- Keep month selector.
- Group rows by team and assignee.
- Show task bars across the date grid.
- Show `1st Draft` / due date as the main planning date.
- Show launch date as a marker when available.
- Show a today line.
- Visually distinguish overdue/urgent/high-priority work.
- Clicking a task bar opens the existing task detail.

Out of scope for this round:

- Dragging bars to change dates.
- Resizing bars.
- Dependencies, critical path, milestones, and baseline tracking.
- New SQL for Gantt.

## Expected Files

Likely frontend files:

- `github/screens-a.jsx`
- `github/screens-c.jsx`
- `github/app.css`
- `github/index.html`
- `src/lib/flowmate.uat.test.ts`

Likely backend files:

- No new SQL expected.
- `supabase/rpc_assignment.sql` should remain compatible with the frontend date behavior.

## Testing

Automated checks:

- `npm.cmd test`
- `npm.cmd run build`

Manual checks:

1. Create Creative Request, choose Launch Date, confirm `1st Draft` auto-fills to 5 working days earlier and cannot be edited.
2. Save Creative Request and confirm created work item uses the generated `1st Draft`.
3. Open task detail, click `+ Add AI Tag`, confirm tag appears without typing.
4. Click remove on the AI Tag, confirm it disappears.
5. Open Team Gantt Chart, confirm it shows month timeline, today line, task bars, launch marker, priority/overdue signal, and click-to-open detail.

## Risk Controls

- Keep Quick Task due date behavior unchanged.
- Do not introduce Gantt date editing in this round.
- Reuse existing AI Tag RPCs and RLS.
- Keep changes scoped to UI/date behavior and tests.
