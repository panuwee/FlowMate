# GD/VE TeamFlow - MVP Scope

Date: 2026-05-15  
Goal: Ship the smallest useful internal app that solves assignment, capacity, visibility, and task tracking pain points.

## 1. MVP Philosophy

Build a focused workflow tool, not a full project management platform.

The MVP must prove:

- creative requests can be assigned fairly
- effort and capacity are visible
- team members can see own work
- supervisors can see workload
- quick tasks can replace notebook-style tracking

## 2. MVP Feature List

### 2.1 Login + User Database

Included:

- Google Workspace login.
- Create or load user profile.
- Active/inactive user state.
- Link user to GD/VE team member when relevant.

Excluded:

- Password registration.
- Public signup.
- Complex role management.

### 2.2 Quick Task

Included:

- Create quick task.
- Assign to self or another user.
- Add due date.
- Add project/campaign.
- Add note.
- Add checklist.
- Add comments.
- Mark done.

Excluded:

- Effort calculation.
- Auto assignment.
- Separate subtask owner.
- Separate subtask status.

### 2.3 Creative Request

Included:

- Structured request form.
- Brief completeness validation.
- Auto effort point.
- Auto assignment or central queue.
- Review and delivered flow.
- Delivery link.
- Request changes.
- Blocked state.

Excluded:

- Preferred owner.
- Manual effort input.
- Complexity field.
- File upload.
- Auto hybrid split.

### 2.4 My Work

Included:

- My overdue work.
- My due soon work.
- My assigned work.
- My in-progress work.
- My review work.
- My blocked work.
- My quick tasks.

Excluded:

- Personal analytics.
- Personal productivity ranking.

### 2.5 Workload View

Included:

- Per-member assigned creative effort.
- Available capacity.
- WIP count.
- Due soon count.
- Overdue count.
- Blocked count.
- Review count.
- Open quick task count shown separately.

Excluded:

- Gantt planning.
- Drag-to-reassign.
- Manual workload balancing.

### 2.6 Central Queue

Included:

- Queued creative requests.
- Queue reason.
- Effort point.
- Due date.
- Asset type.
- Needs split flag.
- Rerun assignment button.

Excluded:

- Manual owner selection.
- Queue priority algorithm beyond current rules.

### 2.7 Search + Filters

Included:

- Global search bar.
- Search by title, ID, campaign, requester, assignee, status, asset type.
- Basic filters.

Excluded:

- Advanced query builder.
- Saved filters.

### 2.8 Kanban + List

Included:

- List view for scanning.
- Kanban view for status.
- Drag/drop or status action buttons.
- Status changes must call backend.

Excluded:

- Custom columns.
- Custom workflow by project.

### 2.9 Checklist

Included:

- Add checklist item.
- Edit checklist item.
- Mark done.
- Delete checklist item.

Excluded:

- Checklist item owner.
- Checklist item due date.
- Checklist item effort.

### 2.10 Comments

Included:

- Add comment.
- Edit own comment.
- Delete own comment.

Excluded:

- @mention.
- Threaded comments.
- Attachments.

### 2.11 Overdue Banner

Included:

- Banner shown on app load when user/team has overdue work.
- Count overdue items.
- Button to filter overdue.

Excluded:

- Email notification.
- Push notification.

### 2.12 Near Real-Time Sync

Included:

- UI updates after user actions.
- Other users receive updates through SSE, WebSocket, or polling.
- Refresh on browser tab focus.

Excluded:

- Google Sheet sync as live source.

## 3. MVP Pages

1. Login
2. Home / My Work
3. Create Quick Task
4. Create Creative Request
5. Work Item Detail
6. List View
7. Kanban View
8. Central Queue
9. Workload View
10. KPI View
11. Team Member Settings

## 4. MVP Statuses

Use:

```text
New
Need Brief
Queued
Assigned
In Progress
Review
Delivered
Blocked
Cancelled
```

Avoid:

```text
Delayed
Approved
Rejected
Waiting Slot
Waiting Info
On Leave as task status
```

## 5. MVP Build Order

### Phase 1: Foundation

- Auth.
- Users.
- Team members.
- Database schema.
- Basic work item CRUD.

Verification:

- User can login.
- User profile loads.
- Team members load.

### Phase 2: Creative Vertical Slice

- Create Creative Request.
- Brief check.
- Effort calculation.
- Assignment.
- Central Queue.
- Status transitions.
- Review and delivered.

Verification:

- Complete request gets assigned or queued.
- Owner can move to In Progress.
- Owner can submit Review.
- Requester can approve Delivered.

### Phase 3: Daily Work UX

- My Work.
- Quick Task.
- Checklist.
- Comments.
- Search.
- List/Kanban.
- Overdue banner.

Verification:

- Team member can manage daily tasks without Sheet/Trello.

### Phase 4: Visibility

- Workload View.
- KPI View.
- Assignment history.
- Audit events.

Verification:

- Supervisor can understand who holds what and why.

### Phase 5: Pilot Fixes

- Fix UAT issues.
- Improve labels.
- Improve empty states.
- Add export if needed.

## 6. Deferred Features

Move to v1.1:

- Calendar view.
- @mention.
- Notification center.
- Saved filters.
- CSV export if not needed in MVP.
- Better real-time transport if MVP used polling.

Move to later:

- Timeline/Gantt.
- Full subtasks.
- AI assignment.
- Historical productivity prediction.
- Leave calendar.
- Google Sheet import/export.

## 7. MVP Acceptance Criteria

MVP is ready for pilot when:

- Login works with company account.
- Creative request cannot be submitted with hidden manual effort or preferred owner.
- Complete brief triggers effort and assignment.
- Queued request shows clear reason.
- Hybrid request stays queued and requires split.
- Workload view reflects assigned effort correctly.
- My Work shows overdue and due-soon items.
- Checklist does not affect capacity.
- Review round increments only when requester asks for changes.
- Audit history records key events.

