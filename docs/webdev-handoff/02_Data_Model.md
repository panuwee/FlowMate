# GD/VE TeamFlow - Data Model

Date: 2026-05-15  
Database recommendation: PostgreSQL or MySQL  
Architecture note: This is a server-backed app data model. It does not require Supabase or Google Sheet.

## 1. Design Principle

Use one common `work_items` model for both Quick Tasks and Creative Requests.

Reason:

- Search, list, kanban, comments, checklist, overdue banner, and My Work can use one object.
- Creative-specific fields can live in a detail table.
- Quick Tasks stay simple and do not pollute assignment logic.

## 2. Entity Overview

Core tables:

- `users`
- `team_members`
- `work_items`
- `creative_request_details`
- `assignment_runs`
- `work_item_events`
- `comments`
- `checklist_items`
- `notifications`
- `capacity_overrides`

Optional later tables:

- `saved_filters`
- `calendar_events`
- `mention_notifications`
- `sheet_import_jobs`

## 3. users

Stores login identity and basic profile.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | Primary key |
| `email` | string | yes | Unique, from Google Workspace |
| `display_name` | string | yes | User display name |
| `requester_team` | string | no | Operation, Marketing, eSport, etc. |
| `google_subject` | string | yes | Google OAuth subject |
| `is_active` | boolean | yes | Inactive users cannot mutate |
| `created_at` | timestamp | yes |  |
| `updated_at` | timestamp | yes |  |

MVP login rule:

- User logs in with Google Workspace.
- First login can create a user row automatically.
- Access should be limited to approved company domain or allowlist.
- Do not build password registration in MVP.

## 4. team_members

Stores GD/VE production members and their skills/capacity.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | Primary key |
| `member_code` | string | yes | Human stable code, e.g. `pond` |
| `user_id` | uuid | no | FK to `users.id` |
| `display_name` | string | yes |  |
| `discipline` | string | yes | Graphic Designer, Video Editor, etc. |
| `discipline_short` | string | yes | GD, VE, GD+VE |
| `skills` | array/json | yes | Asset skills |
| `capacity_per_day` | decimal | yes | Default daily effort capacity |
| `capacity_per_week` | decimal | no | Optional derived or fallback |
| `wip_limit` | integer | yes | In-progress limit |
| `availability` | enum | yes | Available, Partial, On Leave |
| `active` | boolean | yes | Active in assignment |
| `created_at` | timestamp | yes |  |
| `updated_at` | timestamp | yes |  |

Recommended MVP skills:

```text
static-graphic
general-video
esport-video
motion
hybrid
```

## 5. work_items

Common object for Quick Task and Creative Request.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | Primary key |
| `display_id` | string | yes | Example: `REQ-2026-001`, `TASK-2026-001` |
| `work_type` | enum | yes | `quick_task`, `creative_request` |
| `title` | string | yes |  |
| `description` | text | no | General note/details |
| `project_name` | string | no | Project or campaign group |
| `campaign_name` | string | no | Optional for creative work |
| `requester_user_id` | uuid | yes | FK to users |
| `requester_team` | string | no | Snapshot for reporting |
| `assignee_user_id` | uuid | no | For quick task manual assignee |
| `final_owner_member_id` | uuid | no | For creative assignment |
| `status` | enum | yes | See status section |
| `priority` | enum | yes | Low, Normal, High, Urgent |
| `urgent_reason` | text | no | Required when urgent |
| `due_date` | date | yes |  |
| `launch_date` | date | no | Optional |
| `effort_point` | integer | no | Creative requests only, 1-8 |
| `needs_split` | boolean | yes | True for hybrid work that must be split |
| `assignment_reason` | text | no | Why assigned or queued |
| `blocked_reason` | text | no | Required when blocked |
| `blocked_from` | string | no | Previous status |
| `cancel_reason` | text | no | Required when cancelled |
| `delivery_link` | string | no | Required for Review/Delivered creative work |
| `review_round` | integer | yes | Starts at 0 |
| `wip_counted` | boolean | yes | True only when status is In Progress |
| `created_at` | timestamp | yes |  |
| `updated_at` | timestamp | yes |  |
| `delivered_at` | timestamp | no |  |

## 6. creative_request_details

Only exists when `work_items.work_type = creative_request`.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | Primary key |
| `work_item_id` | uuid | yes | FK to work_items |
| `asset_type` | enum | yes | static/video/motion/hybrid |
| `asset_subtype` | string | yes | Banner, Reels, esport pack, etc. |
| `platforms` | array/json | yes | Facebook, Instagram, TikTok, YouTube, X, In-game, Web |
| `size_format` | string | yes | e.g. 1080x1080, 16:9, vertical video |
| `brief_link` | string | yes | URL |
| `reference_link` | string | no | URL |
| `brief_completeness_status` | enum | yes | Complete, Need Brief |
| `brief_missing_reason` | text | no |  |

MVP should not store requester-entered complexity.

## 7. assignment_runs

Stores every assignment attempt.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | Primary key |
| `work_item_id` | uuid | yes | FK to work_items |
| `triggered_by` | enum | yes | submit, recheck, rerun, capacity_change |
| `suggested_owner_member_id` | uuid | no |  |
| `final_owner_member_id` | uuid | no |  |
| `result` | enum | yes | assigned, queued, need_brief |
| `reason` | text | yes | Human-readable reason |
| `effort_point` | integer | yes | 1-8 |
| `raw_range_min` | integer | no | Estimate metadata |
| `raw_range_max` | integer | no | Estimate metadata |
| `was_capped` | boolean | yes | True if raw estimate capped at 8 |
| `capacity_snapshot` | json | no | Member load at decision time |
| `ran_at` | timestamp | yes |  |

## 8. work_item_events

Audit trail for debugging and reporting.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | Primary key |
| `work_item_id` | uuid | yes | FK |
| `actor_user_id` | uuid | no | Nullable for system |
| `event_type` | enum | yes | created, updated, assignment_ran, status_changed, blocked, reviewed, capacity_changed |
| `from_status` | string | no |  |
| `to_status` | string | no |  |
| `metadata` | json | no | Extra details |
| `created_at` | timestamp | yes |  |

## 9. comments

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | Primary key |
| `work_item_id` | uuid | yes | FK |
| `author_user_id` | uuid | yes | FK |
| `body` | text | yes |  |
| `created_at` | timestamp | yes |  |
| `updated_at` | timestamp | no |  |
| `deleted_at` | timestamp | no | Soft delete |

MVP comments do not need @mention.

## 10. checklist_items

Checklist is intentionally lightweight. It is not a full subtask system in MVP.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | Primary key |
| `work_item_id` | uuid | yes | FK |
| `title` | string | yes |  |
| `is_done` | boolean | yes |  |
| `sort_order` | integer | yes |  |
| `created_by_user_id` | uuid | yes | FK |
| `created_at` | timestamp | yes |  |
| `completed_at` | timestamp | no |  |

Checklist items:

- do not have owner
- do not have separate status
- do not have effort point
- do not affect assignment or capacity

## 11. notifications

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | Primary key |
| `user_id` | uuid | yes | Recipient |
| `work_item_id` | uuid | no | Optional FK |
| `type` | enum | yes | assigned, review_requested, blocked, overdue, capacity_changed |
| `title` | string | yes |  |
| `body` | text | no |  |
| `read_at` | timestamp | no |  |
| `created_at` | timestamp | yes |  |

MVP can start with in-app notifications only.

## 12. capacity_overrides

Stores member temporary capacity by date range.

| Field | Type | Required | Notes |
|---|---:|---:|---|
| `id` | uuid | yes | Primary key |
| `team_member_id` | uuid | yes | FK |
| `start_date` | date | yes |  |
| `end_date` | date | yes |  |
| `capacity_per_day` | decimal | yes |  |
| `reason` | text | no |  |
| `created_by_user_id` | uuid | yes | FK |
| `created_at` | timestamp | yes |  |

MVP can simplify by storing only "this week override" if webdev wants a faster build.

## 13. Status Values

Use these internal statuses:

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

UI label note:

- For Quick Task, show `Delivered` as `Done`.
- For Creative Request, show `Delivered` as `Delivered`.

Avoid adding these statuses in MVP:

- Delayed
- Waiting Slot
- Waiting Info
- On Leave
- Approved
- Rejected

Use flags and fields instead.

## 14. Derived Views

Recommended backend views or query helpers:

### member_workload_view

Fields:

- `team_member_id`
- `display_name`
- `effective_capacity`
- `assigned_effort`
- `available_capacity`
- `current_wip`
- `overdue_count`
- `due_soon_count`
- `blocked_count`
- `review_count`

### work_item_flags_view

Fields:

- `is_overdue`
- `is_due_soon`
- `is_brief_incomplete`
- `is_high_rework`
- `is_queued`
- `is_blocked`

## 15. Data Rules

- Backend generates `display_id`.
- Backend calculates `effort_point`.
- Backend writes `assignment_reason`.
- Backend validates status transitions.
- Backend increments `review_round`.
- Backend creates audit events.
- Frontend must not directly mutate assignment, effort, or review count.

