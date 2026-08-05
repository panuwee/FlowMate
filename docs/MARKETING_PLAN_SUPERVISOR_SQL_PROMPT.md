# Marketing Plan Supervisor SQL Prompt

Use this prompt in a new Codex chat for the backend SQL/data-model work.

## Role

Act as a senior PostgreSQL/Supabase engineer for FlowMate + Marketing Plan.

Your task is to implement the backend foundation for the Marketing Plan Supervisor Zone.

Do not build the frontend UI in this chat.

## Project Context

Workspace:

```text
C:\Users\panuwee.w\Documents\New project 2
```

Relevant docs:

```text
docs/MARKETING_PLAN_PRODUCT_SCOPE.md
docs/MARKETING_PLAN_DATA_MODEL.md
docs/MARKETING_PLAN_SUPERVISOR_SCOPE.md
```

Existing Marketing Plan concept:

```text
marketing_plans
  -> marketing_campaigns
      -> marketing_content_items
          -> marketing_channel_placements
```

Marketing Plan is separate from FlowMate execution. Do not turn Marketing Plan rows into FlowMate work items.

## Goal

Create SQL support for an Admin-only Marketing Plan Supervisor report that measures:

- How quickly Working Sheet rows become assigned.
- Which PICs assign early/late.
- Which campaigns are at risk.
- Which channels have late or missing assignments.

The report should be monthly and should use Launch Date / `source_start_date` as the primary timing reference.

## Required Deliverables

### 1. New SQL file

Create:

```text
supabase/marketing_plan_supervisor.sql
```

The SQL must be safe to rerun.

Use idempotent statements where possible:

- `create table if not exists`
- `alter table ... add column if not exists`
- `create or replace function`
- `create or replace view`
- `drop policy if exists` before creating policies when needed

### 2. Update README run order

Update:

```text
supabase/README.md
```

Add the new SQL file to the Marketing Plan SQL run order.

### 3. Add automated UAT coverage

Update:

```text
src/lib/flowmate.uat.test.ts
```

Add tests that verify the SQL file contains the required schema, functions, RLS/security, and report views.

## Backend Design Requirements

### A. Add assignment timestamp fields

Add these columns to `public.marketing_content_items`:

| Column | Type | Rule |
|---|---|---|
| first_assigned_at | timestamptz | first assignment signal, never overwritten once set |
| first_assigned_by_user_id | uuid | references `public.users(id)` if possible |
| brief_link_added_at | timestamptz | first time `brief_link` becomes non-empty |
| brief_link_added_by_user_id | uuid | actor who added first brief link |
| last_status_changed_at | timestamptz | latest related status change |
| last_status_changed_by_user_id | uuid | actor of latest status change |

Add these columns to `public.marketing_channel_placements`:

| Column | Type | Rule |
|---|---|---|
| first_assigned_at | timestamptz | first placement assignment signal, optional but useful |
| status_changed_at | timestamptz | latest placement status change |
| status_changed_by_user_id | uuid | actor who changed placement status |

If `public.users(id)` reference is not compatible with the existing schema, keep uuid columns without a foreign key and explain why in SQL comments.

### B. Add event log table

Create:

```text
public.marketing_plan_events
```

Recommended columns:

| Column | Type |
|---|---|
| id | uuid primary key default gen_random_uuid() |
| plan_id | uuid |
| campaign_id | uuid |
| content_item_id | uuid |
| placement_id | uuid |
| actor_user_id | uuid |
| event_type | text |
| from_value | text |
| to_value | text |
| metadata | jsonb default '{}'::jsonb |
| created_at | timestamptz default now() |

Event types to support:

```text
created
brief_link_added
assigned
status_changed
deleted
```

Use check constraints where practical.

### C. Trusted actor identity

Do not trust client-supplied actor user IDs.

Use:

```sql
auth.uid()
```

and map it to `public.users.id` if the existing app uses a separate app-user table.

If the existing project already has a trusted helper, use it. Search for:

```text
current_app_user_id
is_active_app_user
is_admin
auth.uid()
```

### D. Trigger or RPC behavior

Implement trusted timestamp capture for assignment signals.

Minimum expected behavior:

1. When `marketing_content_items.brief_link` changes from empty/null to non-empty:
   - set `brief_link_added_at` if null
   - set `brief_link_added_by_user_id` if null
   - set `first_assigned_at` if null
   - set `first_assigned_by_user_id` if null
   - write `brief_link_added` event

2. When any related `marketing_channel_placements.placement_status` changes from `planned` to `assigned`:
   - set placement `first_assigned_at` if null
   - set placement `status_changed_at`
   - set placement `status_changed_by_user_id`
   - set parent content item `first_assigned_at` if null
   - set parent content item `first_assigned_by_user_id` if null
   - set parent content item `last_status_changed_at`
   - write `assigned` or `status_changed` event

3. When status changes to `review`, `ready_to_post`, `scheduled`, or `posted`:
   - update last status changed timestamps
   - write `status_changed` event
   - do not overwrite `first_assigned_at`

### E. Effective status rule

Supervisor reporting must follow the current UI display rule:

```text
if placement_status = planned and brief_link is not empty:
  effective_status = assigned
else:
  effective_status = placement_status
```

Preserve both:

- stored status
- effective status

This lets admins see rows that have a CR/detail link but were not manually moved to Assigned.

### F. Working day helper

Add a SQL helper for Monday-Friday working days.

Suggested function:

```sql
public.marketing_plan_count_working_days(p_start_date date, p_end_date date)
```

Rules:

- Count Monday-Friday only.
- If assignment date is before launch date, return positive working days before launch.
- If assignment date is launch date or later, report should allow zero or negative values.

Use clear comments for the calculation direction.

### G. Supervisor report view

Create:

```text
public.marketing_plan_supervisor_monthly_v
```

The view should provide one row per content item + channel placement where possible.

Required fields:

| Field | Purpose |
|---|---|
| plan_id | monthly plan id |
| month_key | month key |
| campaign_id | campaign id |
| campaign_name | campaign name |
| campaign_team | campaign team |
| content_item_id | content item id |
| product_event | content item title |
| content_team | content item team |
| pic_user_id | linked PIC if available |
| pic_name | PIC name |
| placement_id | channel placement id |
| channel | channel key |
| launch_date | source launch date / source_start_date |
| publish_date | placement publish date |
| publish_time | placement publish time |
| stored_status | raw placement status |
| effective_status | display/report status |
| brief_link | content item brief link |
| first_assigned_at | assignment timestamp |
| assigned_by_user_id | assignment actor |
| working_days_before_launch | calculated lead time |
| calendar_days_before_launch | simple date delta |
| risk_bucket | Healthy, Watch, Risk, Critical |
| missing_brief_link | boolean |
| created_at | content item created timestamp |
| updated_at | content item updated timestamp |

### Risk bucket rules

Use these labels exactly:

```text
Healthy
Watch
Risk
Critical
```

Rules:

- `Critical` if missing assignment and launch date is today/past.
- `Critical` if assigned on/after launch date.
- `Critical` if launch date is within 1 working day and brief link is missing.
- `Risk` if assigned 1-2 working days before launch.
- `Watch` if assigned 3-4 working days before launch.
- `Healthy` if assigned 5+ working days before launch.
- If future row is not assigned yet but not critical, use `Risk` or `Watch` based on remaining working days.

Be explicit and deterministic in SQL comments.

### H. Summary views

Create these if practical:

```text
public.marketing_plan_supervisor_pic_v
public.marketing_plan_supervisor_campaign_v
public.marketing_plan_supervisor_channel_v
```

If time is limited, prioritize the monthly base view first and document that UI can aggregate from it.

Recommended aggregated metrics:

- total_rows
- assigned_rows
- unassigned_rows
- avg_working_days_before_launch
- median_working_days_before_launch if easy
- healthy_count
- watch_count
- risk_count
- critical_count
- missing_brief_link_count

## Security / RLS Requirements

### Table RLS

Enable RLS on:

```text
public.marketing_plan_events
```

Rules:

- Admin can read.
- Admin can insert only through trusted triggers/RPC if possible.
- Non-admin should not read Supervisor event history by default.

Do not add null-user bypass policies.

### Views

Supabase views may appear unrestricted in the UI.

Use one of these approaches:

1. `security_invoker = true` if available and compatible.
2. Admin-only RPC wrapper for report reads.
3. Clear RLS comments and grants that avoid exposing Supervisor report to non-admin users.

Preferred:

```sql
revoke all on public.marketing_plan_supervisor_monthly_v from anon, authenticated;
grant select on public.marketing_plan_supervisor_monthly_v to authenticated;
```

Only do this if underlying RLS/helper blocks non-admin. If not, use admin-only RPC.

### Admin helper

Use an existing admin helper if present.

If not present, create or reuse:

```sql
public.is_admin_app_user()
```

It should use trusted identity, not client input.

## Non-Goals

Do not implement:

- Frontend Supervisor screen
- CSV export UI
- Personal ranking leaderboard
- Slack/Google Chat alerting
- AI recommendation logic
- Changes to FlowMate assignment engine
- Changes to GD/VE workload or KPI logic

## Testing Requirements

Add UAT tests in:

```text
src/lib/flowmate.uat.test.ts
```

Tests should verify:

- `supabase/marketing_plan_supervisor.sql` exists.
- Timestamp columns are added idempotently.
- `marketing_plan_events` exists.
- Event types are constrained.
- `auth.uid()` or trusted helper is used.
- `p_actor_user_id` is not introduced.
- `first_assigned_at` is not overwritten when already set.
- Effective status rule exists.
- Working day helper exists.
- Monthly supervisor view exists.
- Risk buckets use exact labels.
- RLS/grants do not expose reports to anon.
- `supabase/README.md` includes the new SQL run order.

Run:

```text
npm.cmd test -- src/lib/flowmate.uat.test.ts
npm.cmd test
```

## Acceptance Criteria

The work is complete when:

- New SQL file exists and is safe to rerun.
- SQL can be pasted into Supabase SQL Editor without syntax errors.
- README run order is updated.
- UAT tests cover the new backend contract.
- All automated tests pass.
- No frontend UI changes are required for this SQL chat.

## Final Response Format

When finished, respond with:

- Summary of SQL/data model changes.
- Whether SQL must be run in Supabase.
- Exact SQL run order.
- Automated test result.
- Exact files to upload to GitHub.

Do not suggest git push. The user uploads files manually through GitHub web UI.
