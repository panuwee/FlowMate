# GD/VE TeamFlow - API Contract

Date: 2026-05-15  
Style: REST API  
Auth: Google Workspace SSO session or bearer token  
Source of truth: Backend

## 1. API Principles

- Frontend must not calculate assignment.
- Frontend must not write effort point directly.
- Frontend must not increment review round.
- Frontend must not bypass status transition rules.
- Backend validates current user, ownership, status, and required fields.

## 2. Auth

### GET `/api/auth/me`

Returns current user and linked team member profile.

Response:

```json
{
  "user": {
    "id": "uuid",
    "email": "panuwee.w@garena.com",
    "display_name": "Panu",
    "requester_team": "Operation",
    "is_active": true
  },
  "team_member": {
    "id": "uuid",
    "display_name": "Pond",
    "skills": ["static-graphic", "general-video"]
  }
}
```

### POST `/api/auth/logout`

Logs out current session.

## 3. Users

### GET `/api/users`

List active users for assignee picker, comments, and future mentions.

Query:

- `q`
- `active`

### PATCH `/api/users/:user_id`

Update display name, requester team, or active flag.

Admin/config permission only.

## 4. Team Members

### GET `/api/team-members`

Returns GD/VE members and workload summary.

### PATCH `/api/team-members/:member_id/availability`

Body:

```json
{
  "availability": "Partial",
  "reason": "Half day support"
}
```

### PATCH `/api/team-members/:member_id/capacity`

Body:

```json
{
  "capacity_per_day": 4,
  "start_date": "2026-05-15",
  "end_date": "2026-05-22",
  "reason": "Event support"
}
```

Behavior:

- write capacity event
- rerun assignment for eligible queued requests
- create assignment run records

## 5. Work Items

### GET `/api/work-items`

List work items.

Query:

- `q`
- `work_type`
- `status`
- `owner_member_id`
- `assignee_user_id`
- `requester_user_id`
- `requester_team`
- `asset_type`
- `project_name`
- `due_from`
- `due_to`
- `overdue`
- `due_soon`
- `blocked`

### GET `/api/work-items/:id`

Returns full detail:

- work item
- creative details if any
- checklist
- comments
- events
- latest assignment run

### POST `/api/work-items/quick-task`

Create Quick Task.

Body:

```json
{
  "title": "Confirm web banner copy",
  "description": "Check final wording with campaign owner.",
  "project_name": "May Campaign",
  "assignee_user_id": "uuid",
  "priority": "Normal",
  "due_date": "2026-05-20"
}
```

### POST `/api/work-items/creative-request`

Create Creative Request.

Body:

```json
{
  "title": "8th Anniversary launch banner",
  "requester_team": "Operation",
  "campaign_name": "8th Anniversary",
  "asset_type": "static-graphic",
  "asset_subtype": "standard-banner",
  "platforms": ["Facebook", "Instagram"],
  "size_format": "1080x1080",
  "brief_link": "https://docs.google.com/...",
  "reference_link": "https://...",
  "priority": "High",
  "due_date": "2026-05-22",
  "launch_date": "2026-05-24"
}
```

Behavior:

1. create work item
2. validate brief completeness
3. calculate effort if complete
4. run assignment if complete
5. return item with status `Assigned`, `Queued`, or `Need Brief`

### PATCH `/api/work-items/:id`

Edit allowed fields.

Rules:

- Creator can edit brief fields only while `New` or `Need Brief`.
- Assigned owner can update delivery link in production flow.
- Backend rejects protected fields such as effort, final owner, and review round.

## 6. Status

### POST `/api/work-items/:id/status`

Body examples:

Start work:

```json
{
  "target_status": "In Progress"
}
```

Submit review:

```json
{
  "target_status": "Review",
  "delivery_link": "https://drive.google.com/..."
}
```

Block work:

```json
{
  "target_status": "Blocked",
  "blocked_reason": "Waiting for final copy"
}
```

Approve delivery:

```json
{
  "target_status": "Delivered"
}
```

Request changes:

```json
{
  "target_status": "In Progress",
  "review_decision": "changes_requested",
  "comment": "Please adjust CTA wording."
}
```

Backend validates:

- active user
- ownership
- current status
- target status
- delivery link
- blocked reason
- WIP limit
- review round rule

## 7. Assignment

### POST `/api/work-items/:id/recheck-brief`

Rechecks brief completeness.

If complete, calculate effort and run assignment.

### POST `/api/work-items/:id/rerun-assignment`

Reruns assignment for queued creative request.

Does not manually pick owner.

### GET `/api/work-items/:id/assignment-runs`

Returns assignment history.

## 8. Checklist

### GET `/api/work-items/:id/checklist`

Returns checklist items.

### POST `/api/work-items/:id/checklist`

Body:

```json
{
  "title": "Export 1080x1080 version"
}
```

### PATCH `/api/checklist-items/:item_id`

Body:

```json
{
  "title": "Export 1080x1080 and 1080x1920",
  "is_done": true,
  "sort_order": 2
}
```

### DELETE `/api/checklist-items/:item_id`

Soft delete or hard delete based on backend policy.

## 9. Comments

### GET `/api/work-items/:id/comments`

Returns comments.

### POST `/api/work-items/:id/comments`

Body:

```json
{
  "body": "Waiting for final copy from campaign owner."
}
```

### PATCH `/api/comments/:comment_id`

Author can edit own comment.

### DELETE `/api/comments/:comment_id`

Author can delete own comment.

MVP does not need @mention parsing.

## 10. Dashboards

### GET `/api/dashboard/my-work`

Returns current user's:

- overdue
- due soon
- assigned
- in progress
- review
- blocked
- quick tasks

### GET `/api/dashboard/workload`

Returns per-member workload.

### GET `/api/dashboard/kpi`

Query:

- `from`
- `to`
- `requester_team`
- `member_id`

Returns:

- delivered effort
- on-time rate
- average review round
- blocked count
- queued effort
- per-member output
- per-team request volume

## 11. Notifications

### GET `/api/notifications`

Returns unread/read notifications.

### PATCH `/api/notifications/:id/read`

Marks notification as read.

MVP notification types:

- assigned
- review_requested
- blocked
- overdue
- capacity_changed

## 12. Events

### GET `/api/work-items/:id/events`

Returns audit history.

## 13. Search

### GET `/api/search`

Query:

- `q`
- `limit`

Response groups:

- work items
- users
- team members

MVP can also implement search inside `GET /api/work-items`.

## 14. Real-Time Updates

Recommended:

### GET `/api/realtime/stream`

Server-Sent Events stream for:

- work item created
- work item updated
- status changed
- comment added
- checklist changed
- notification created

Fallback:

- polling `GET /api/work-items?updated_after=timestamp`

## 15. Export

### GET `/api/export/work-items.csv`

Exports filtered work items.

### GET `/api/export/kpi.csv`

Exports KPI report.

Export can be delayed until v1.1 if MVP needs to stay smaller.

