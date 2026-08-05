# GD/VE TeamFlow - Product Requirements / PRD

Date: 2026-05-15  
Audience: Product owner, web developer, UI designer, Claude Design  
Product type: Internal server-backed web application

## 1. Product Summary

GD/VE TeamFlow is an internal workflow application for creative production work. It combines two ideas:

- The GD/VE Workflow rules for smart assignment, effort, capacity, review, and KPI.
- The TeamFlow experience for simple task entry, quick visibility, comments, list/kanban views, and lightweight team coordination.

The final product should not depend on Supabase or Google Sheet. Those can be used as prototype references, import/export sources, or migration helpers only.

## 2. Main Problem

Trello and generic task boards do not solve the team's operational pain points:

- Work is assigned manually and often goes to the same people.
- Requesters can choose familiar owners instead of the best-fit owner.
- Capacity is not calculated as effort per day.
- Productivity is measured by task count instead of effort, rework, and on-time delivery.
- Static, video, esport video, motion, and hybrid work need different routing.
- Team members need a simple notebook-like way to add their own tasks.
- Team members need to see overdue, current, and upcoming work.
- Supervisors need visibility into what each person is holding.

## 3. Product Goals

1. Distribute creative work by skill, capacity, WIP, and fairness.
2. Make work visible without asking in chat.
3. Let team members quickly capture tasks and check what is pending.
4. Reduce manual assignment decisions.
5. Measure productivity with effort, rework, and on-time delivery.
6. Keep MVP simple enough to ship and test with the team quickly.

## 4. Non-Goals

These are intentionally not part of the first MVP:

- Full Trello clone.
- Custom status builder.
- AI assignment.
- Full project management suite.
- Timeline dependency planning.
- Automatic hybrid splitting.
- File upload/storage.
- Password-based registration.
- Google Sheet two-way sync as source of truth.
- Productivity ranking for performance judgment.

## 5. Target Users

### Requester

Creates creative requests for campaigns, events, sales, esport, marketing, or operation work.

Needs:

- Submit complete brief.
- See request status.
- Review delivered work.
- Request changes.

### GD/VE Team Member

Receives assigned creative work and can also create personal/team quick tasks.

Needs:

- See own assigned work.
- See overdue and upcoming work.
- Move work through production statuses.
- Submit delivery link.
- Update availability or capacity override.
- Add checklist items to break work into smaller steps.

### Supervisor / Coordinator

Needs visibility and exception handling.

Needs:

- See workload per person.
- See queued, blocked, overdue, and due-soon work.
- Understand why a task was assigned or queued.
- Export or report when needed.

## 6. Key Product Concepts

### Quick Task

A lightweight notebook-style task. Used for small internal tasks, follow-ups, reminders, or work that does not need auto-assignment.

Quick Task should be simple:

- title
- note/description
- due date
- project/campaign
- optional assignee
- checklist
- comments

Quick Task does not enter the creative assignment engine by default.

### Creative Request

A structured request that enters the GD/VE production workflow.

Creative Request includes:

- title
- requester team
- campaign name
- asset type
- asset subtype
- platform
- size/format
- brief link
- reference link
- priority
- urgent reason if urgent
- due date
- launch date

Creative Request must not allow requester to pick preferred owner or manually input effort.

### Work Item

The common object shown in list, search, kanban, my work, and workload views.

Work item can be:

- `quick_task`
- `creative_request`

## 7. MVP User Flows

### Flow A: Create Creative Request

1. User logs in with Google Workspace.
2. User creates Creative Request.
3. Backend validates brief completeness.
4. If brief is incomplete, status becomes `Need Brief`.
5. If brief is complete, backend calculates effort point.
6. Backend runs assignment.
7. Request becomes `Assigned` or `Queued`.

### Flow B: Assigned Owner Production

1. Owner opens My Work.
2. Owner starts assigned work.
3. Owner moves status to `In Progress`.
4. Owner adds checklist items if needed.
5. Owner submits delivery link and moves to `Review`.

### Flow C: Requester Review

1. Requester sees request in `Review`.
2. Requester approves, request becomes `Delivered`.
3. Or requester requests changes, request returns to `In Progress`.
4. Backend increments `review_round` only when request changes are accepted.

### Flow D: Quick Task Capture

1. User adds quick task from global add button.
2. Task appears in My Work or team list.
3. User can add checklist, due date, comments, and mark done.

### Flow E: Supervisor Visibility

1. Supervisor opens Workload View.
2. System shows each member's assigned effort, WIP, due soon, overdue, blocked, and available capacity.
3. Supervisor can open details but should not manually override assignment in MVP unless explicitly allowed later.

## 8. Feature Requirements

### Must Have in MVP

- Google Workspace login.
- Users database.
- Quick Task creation.
- Creative Request creation.
- Search bar.
- List view.
- Kanban view.
- My Work view.
- Workload view.
- Central Queue.
- Auto effort calculation.
- Auto assignment.
- Checklist inside work item.
- Comments without mention.
- Overdue banner on load.
- Near real-time sync or auto refresh.
- Audit events for important changes.

### Should Have in v1.1

- Calendar view.
- True real-time updates by SSE or WebSocket.
- @mention in comments.
- Notification center.
- Saved filters.
- CSV export.

### Later

- Timeline/Gantt.
- Full subtask system with separate owner/status/effort.
- AI assignment recommendation.
- Historical speed model.
- Leave calendar.
- Google Sheet import/export.

## 9. Real-Time Sync Requirement

The product should feel live when multiple people update the board.

MVP acceptable options:

- Server-Sent Events.
- WebSocket.
- Polling every 15-30 seconds plus refresh on tab focus.

Minimum behavior:

- After user changes a work item, their UI updates immediately.
- Other users see updates without manual browser refresh.
- If a conflict is detected, show "This item was updated. Reload latest data."

Do not use Google Sheet sync as the real-time source of truth.

## 10. Search Requirement

Search must be available in MVP because team work will become hard to find.

Search fields:

- work item ID
- title
- campaign/project
- requester
- assignee
- status
- asset type
- due date
- platform

MVP can use simple database search. Advanced search syntax is not needed.

## 11. Workload Requirement

Workload View is high impact and should be in MVP.

Show per member:

- assigned creative effort
- available capacity
- current WIP count
- due soon count
- overdue count
- blocked count
- review count
- queued work matching their skill

Quick Tasks should be shown separately from creative effort so they do not distort creative capacity.

## 12. Productivity Requirement

Productivity should be measured carefully. Do not use raw task count as the main score.

MVP metrics:

- delivered effort
- on-time rate
- average review round
- blocked count
- queued effort
- assigned effort by member

Suggested productivity index for reporting only:

```text
productivity_index =
delivered_effort_point * on_time_factor * rework_factor
```

Where:

```text
on_time_factor = 1.0 if delivered on or before due date, otherwise 0.7
rework_factor = 1 / (1 + review_round * 0.25)
```

Do not show this as a personal ranking in MVP.

## 13. Success Metrics

The pilot is successful if:

- Requests are assigned without requester choosing owner.
- Team members can see own current and upcoming work.
- Supervisor can see who is overloaded.
- Queued work has clear reasons.
- Overdue work is visible immediately.
- Capacity dashboard matches live work data.
- Review rounds are tracked correctly.
- Team can use the system without falling back to Trello/Sheet for daily tracking.

## 14. Recommended Technical Direction

Recommended architecture:

- Frontend: React or Next.js.
- Backend: Node.js, NestJS, or Next.js API.
- Database: PostgreSQL or MySQL.
- Auth: Google Workspace SSO.
- Hosting: company server, VPS, Vercel, Render, Railway, or internal cloud.
- File handling: links only in MVP.

Backend must be the source of truth for:

- assignment
- effort point
- capacity
- status transitions
- ownership rules
- audit events
- productivity metrics

