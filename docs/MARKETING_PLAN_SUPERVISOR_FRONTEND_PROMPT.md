# Marketing Plan Supervisor Frontend Prompt

Use this prompt in a new Codex chat for the Marketing Plan Supervisor frontend implementation.

## Role

You are a senior frontend engineer working inside the FlowMate / Marketing Plan codebase.

Your task is to implement the Marketing Plan Supervisor Zone frontend only. The backend SQL foundation has already been completed, run in Supabase, and verified.

## Project

- Workspace: `C:\Users\panuwee.w\Documents\New project 2`
- Production target: `https://panuwee.github.io/FlowMate/`
- Deployment workflow: manual GitHub web UI upload, not `git push`

## Source Of Truth

Read these files before editing:

1. `docs/MARKETING_PLAN_SUPERVISOR_SCOPE.md`
2. `docs/MARKETING_PLAN_SUPERVISOR_SQL_PROMPT.md`
3. `supabase/marketing_plan_supervisor.sql`
4. `github/app.jsx`
5. `src/lib/flowmate.uat.test.ts`

## Backend Status

The user already ran the SQL successfully in Supabase.

Available backend views:

- `public.marketing_plan_supervisor_monthly_v`
- `public.marketing_plan_supervisor_pic_v`
- `public.marketing_plan_supervisor_campaign_v`
- `public.marketing_plan_supervisor_channel_v`

Do not change SQL unless the frontend is blocked by a confirmed backend defect. If a SQL change is required, stop and report the exact reason first.

## Goal

Add an admin-only Supervisor section inside Marketing Plan so Marketing Managers can review monthly planning health:

- Which campaign rows are assigned or unassigned
- Whether assignment happened early enough before Launch Date
- Which PICs, campaigns, or channels carry planning risk
- Which rows are missing a FlowMate Brief Link

This is not a personal ranking board. Treat it as an operational planning health report.

## Navigation

Add a new Marketing Plan sidebar item:

- Label: `Supervisor`
- Location: Marketing Plan sidebar, below `Working Sheet`
- Route/hash: use the existing route pattern in `github/app.jsx`
- Visibility: admin only

Admin rule:

- Use the existing app user/session role source.
- Expected role source is `public.users.role = 'admin'`, already available in the frontend user object.
- If the existing code has an admin helper, reuse it.

Access guard:

- Non-admin users must not see the `Supervisor` nav item.
- If a non-admin manually opens the Supervisor route, show a simple access-denied state and do not query supervisor report views.

## Screen

Create a Marketing Plan Supervisor screen with the same visual scale and spacing as current FlowMate / Marketing Plan screens.

Do not create a landing page. This should be a compact operations dashboard.

Recommended layout:

1. Page title: `Supervisor`
2. Subtitle: `Monthly assignment health for Marketing Plan rows.`
3. Filters row:
   - Month
   - Campaign
   - Channel
   - PIC
   - Refresh
   - Export CSV
4. Summary cards
5. Tabs:
   - `Monthly Overview`
   - `PIC Performance`
   - `Campaign Risk`
   - `Channel Risk`
6. Table for the selected tab

## Data Contract

Use Supabase client reads against the existing views.

### Monthly View

View: `marketing_plan_supervisor_monthly_v`

Expected fields include:

- `plan_id`
- `month_key`
- `campaign_id`
- `campaign_name`
- `campaign_team`
- `content_item_id`
- `product_event`
- `content_team`
- `pic_user_id`
- `pic_name`
- `placement_id`
- `channel`
- `launch_date`
- `publish_date`
- `publish_time`
- `stored_status`
- `effective_status`
- `brief_link`
- `first_assigned_at`
- `assigned_by_user_id`
- `working_days_before_launch`
- `calendar_days_before_launch`
- `risk_bucket`
- `missing_brief_link`
- `created_at`
- `updated_at`

Monthly Overview table columns:

- Campaign
- Product / Event
- Channel
- Launch Date
- Time
- PIC
- Effective Status
- Assigned At
- Working Days Before Launch
- Risk Bucket
- Brief Link

### PIC View

View: `marketing_plan_supervisor_pic_v`

Table columns:

- PIC
- Total Rows
- Assigned
- Unassigned
- Avg Working Days Before Launch
- Median Working Days Before Launch
- Healthy
- Watch
- Risk
- Critical
- Missing Brief Link

### Campaign View

View: `marketing_plan_supervisor_campaign_v`

Table columns:

- Campaign
- Team
- Total Rows
- Assigned
- Unassigned
- Avg Working Days Before Launch
- Healthy
- Watch
- Risk
- Critical
- Missing Brief Link

### Channel View

View: `marketing_plan_supervisor_channel_v`

Table columns:

- Channel
- Total Rows
- Assigned
- Unassigned
- Avg Working Days Before Launch
- Healthy
- Watch
- Risk
- Critical
- Missing Brief Link

## Summary Cards

Use filtered Monthly Overview rows to calculate:

- Total Rows
- Assigned
- Unassigned
- Avg Working Days Before Launch
- Risk
- Critical

Risk card counts should use `risk_bucket`.

## Risk Display

Use clear badge styling:

- `healthy`: green
- `watch`: amber or neutral
- `risk`: orange
- `critical`: red

Do not use ranking language such as:

- rank
- score
- leaderboard
- worst PIC
- best PIC

## Filters

Filters must apply to all tabs where possible:

- Month filters by `month_key`
- Campaign filters by `campaign_id` or `campaign_name`
- Channel filters by `channel`
- PIC filters by `pic_user_id` or `pic_name`

Month dropdown should show only months present in supervisor data.

Default month:

- Prefer the current month if data exists.
- Otherwise use the latest month with data.

## Export

Add CSV export for the currently filtered Monthly Overview.

Filename format:

```text
marketing-plan-supervisor-jul-2026.csv
```

CSV fields:

- Month
- Campaign
- Product / Event
- Channel
- Launch Date
- Time
- PIC
- Effective Status
- Stored Status
- Assigned At
- Working Days Before Launch
- Risk Bucket
- Brief Link

Export only the currently filtered rows.

XLSX is out of scope for this frontend pass.

## Empty, Loading, And Error States

Add explicit states:

- Loading: `Loading supervisor report...`
- Empty: `No supervisor data for this filter.`
- Error: show a short error message and keep the page usable.
- Access denied: `Admin access required.`

Do not expose raw database internals to normal users.

## Implementation Guidance

Reuse existing Marketing Plan patterns in `github/app.jsx`:

- Supabase loader structure
- date formatting helpers
- status badge helpers
- CSV export helper pattern
- app route/hash pattern
- refresh/live update pattern if already present

Suggested helper names:

- `loadMarketingPlanSupervisorRows`
- `normalizeMarketingPlanSupervisorRow`
- `filterMarketingPlanSupervisorRows`
- `exportMarketingPlanSupervisorCsv`
- `MarketingPlanSupervisorScreen`

Keep changes scoped. Do not refactor unrelated FlowMate screens.

## Tests

Update `src/lib/flowmate.uat.test.ts`.

Add UAT coverage for:

1. Admin users can see Marketing Plan `Supervisor` nav.
2. Non-admin users cannot see Marketing Plan `Supervisor` nav.
3. Non-admin direct route does not query supervisor views.
4. Supervisor screen reads the four supervisor views.
5. Summary cards are present.
6. Tabs are present:
   - Monthly Overview
   - PIC Performance
   - Campaign Risk
   - Channel Risk
7. Month dropdown only uses months from supervisor data.
8. Filters apply to exported Monthly Overview rows.
9. CSV export includes supervisor fields.
10. Risk buckets render with expected labels/classes.
11. No ranking language appears in Supervisor UI text.

Run:

```powershell
npm.cmd test -- src/lib/flowmate.uat.test.ts
npm.cmd test
npm.cmd run build:github
```

## Expected Files To Modify

Likely modified files:

- `github/app.jsx`
- `github/app.js`
- `github/index.html`
- `src/lib/flowmate.uat.test.ts`

Optional only if needed:

- `github/app.css`

Do not modify SQL unless a confirmed frontend blocker requires it.

## Manual QA Checklist

After uploading the frontend bundle:

1. Login as admin.
2. Open Marketing Plan.
3. Confirm `Supervisor` appears in sidebar.
4. Open Supervisor.
5. Confirm cards and tabs load.
6. Filter by month, campaign, channel, and PIC.
7. Export CSV and verify rows match the active filters.
8. Login or view as non-admin.
9. Confirm `Supervisor` is hidden.
10. Manually open the Supervisor URL as non-admin and confirm access is denied.

## Final Response Format

When done, respond with:

```markdown
Completed:
- ...

SQL:
- No SQL changes required.

Tests:
- ...

Files to upload:
- ...

Manual checks:
- ...
```

Do not include git commands. The user uploads files manually through GitHub web UI.
