# Marketing Plan Supervisor Zone Scope

Date: 2026-06-29
Project: FlowMate + Marketing Plan
Product area: Marketing Plan
Access: Admin only

## Purpose

Marketing Plan already shows what content will go live by campaign, channel, and launch date.

The Supervisor Zone should answer a different management question:

> Are campaign assets being assigned early enough for the team to execute without last-minute risk?

This is not a GD/VE workload report. It is a Marketing Plan operations report for Marketing Managers and Operation Managers.

## Product Boundary

### Marketing Plan Supervisor Zone Owns

- Monthly assignment timing report
- PIC responsiveness by month
- Campaign readiness and risk
- Channel readiness and risk
- Late assignment visibility
- Missing brief / missing Creative Request visibility
- Exportable management table

### FlowMate KPI Still Owns

- GD/VE workload
- Effort point capacity
- In-progress production status
- Review rounds
- Delivered creative output
- Creative request assignment engine performance

## Access Rule

Supervisor Zone is visible only to users with:

```text
public.users.role = 'admin'
```

Non-admin users should not see the navigation item or access the screen directly by URL hash.

Recommended route:

```text
Marketing Plan
  -> Supervisor
      -> Monthly Overview
      -> PIC Performance
      -> Campaign Risk
      -> Channel Risk
```

## Core Definitions

### Working Row

A Working Sheet row represents one planned content item / product event in Marketing Plan.

Example:

```text
Campaign: Revenue
Product / Event: Monthly Products (Jul)
Launch Date: 1 Jul 2026
Channel Tag: Facebook, TikTok, Instagram
Brief Link: https://panuwee.github.io/FlowMate/#detail/CR-1002
PIC: Panu
Status: Assigned
```

### Assignment Moment

The system should treat a row as assigned when the first assignment signal happens.

Priority order:

1. `first_assigned_at`
2. first time `brief_link` is added
3. first time placement status changes from `planned` to `assigned`

`first_assigned_at` should never be overwritten after it is set.

### Assignment Lead Time

Assignment Lead Time measures how early the row became assigned before launch.

```text
assignment_lead_time = launch_date - first_assigned_at
```

Display both:

- Calendar days
- Working days, Monday-Friday

Recommended default report should use working days.

### Assignment Risk Buckets

| Bucket | Rule | Meaning |
|---|---|---|
| Healthy | Assigned 5+ working days before Launch Date | enough planning time |
| Watch | Assigned 3-4 working days before Launch Date | acceptable but monitor |
| Risk | Assigned 1-2 working days before Launch Date | close to launch |
| Critical | Assigned on/after Launch Date, or still not assigned | late or missing |

## Recommended MVP Scope

### 1. Admin-Only Supervisor Navigation

Add a Marketing Plan navigation item visible only for admin users:

```text
Supervisor
```

This should sit inside Marketing Plan, not FlowMate.

### 2. Monthly Overview

Purpose: one-screen management summary for a selected month.

Controls:

- Month dropdown
- Campaign filter
- Channel filter
- PIC filter

Cards:

- Total Working Rows
- Assigned Rows
- Unassigned Rows
- Avg Working Days Before Launch
- Risk Rows
- Critical Rows

Table columns:

| Column | Description |
|---|---|
| Campaign | Campaign tag |
| Product / Event | Working row content |
| Launch Date | Marketing Plan launch date |
| Channel Tag | FB, TT, IG, Game, YT, Other |
| PIC | Row owner |
| Status | Planned, Assigned, Review, Ready to Post, Schedule, Posted |
| Assigned At | first assignment timestamp |
| Working Days Before Launch | calculated lead time |
| Risk Bucket | Healthy, Watch, Risk, Critical |
| Brief Link | linked CR/detail URL if available |

### 3. PIC Performance

Purpose: show which PICs are assigning work early or late.

This is not a personal ranking. It is a planning health report.

Metrics per PIC:

- Total rows
- Assigned rows
- Unassigned rows
- Avg working days before launch
- Median working days before launch
- Healthy count
- Watch count
- Risk count
- Critical count
- Missing brief link count

Recommended display:

```text
PIC | Rows | Assigned | Avg lead | Risk | Critical | Missing link
```

### 4. Campaign Risk

Purpose: show which campaigns are not ready before launch.

Metrics per campaign:

- Total content items
- Total channel placements
- Assigned content items
- Planned-only content items
- Missing brief links
- Launch within 3 working days but not assigned
- Posted / Ready / Review count
- Critical rows

Recommended display:

```text
Campaign | Assets | Assigned | Missing link | Launch <= 3WD | Critical
```

### 5. Channel Risk

Purpose: show risk by publishing channel.

Metrics per channel:

- Upcoming placements
- Assigned placements
- Planned-only placements
- Critical placements
- Posted placements
- Missing brief links

Recommended channels:

- Facebook
- TikTok
- Instagram
- In-game
- YouTube
- Other

### 6. Export

MVP export should be CSV first.

Export should include:

- Month
- Campaign
- Product / Event
- Channel
- Launch Date
- Time
- PIC
- Status
- Assigned At
- Working Days Before Launch
- Risk Bucket
- Brief Link
- Created By
- Created At
- Last Updated At

XLSX can be added later if management needs multi-tab export.

## Data Requirements

Current Marketing Plan data is close, but Supervisor Zone needs historical timestamps.

Recommended fields to add or derive:

### marketing_content_items

| Field | Purpose |
|---|---|
| first_assigned_at | First time the row became assigned |
| first_assigned_by_user_id | Who caused the first assignment signal |
| brief_link_added_at | First time a brief / CR link was added |
| brief_link_added_by_user_id | Who added the first brief link |
| last_status_changed_at | Last placement/content status update |
| last_status_changed_by_user_id | User who last changed status |

### marketing_channel_placements

| Field | Purpose |
|---|---|
| first_assigned_at | Optional placement-level assigned timestamp if each channel needs separate tracking |
| status_changed_at | Last placement status update |
| status_changed_by_user_id | User who changed placement status |

### Event Log Option

Recommended for stronger audit:

```text
marketing_plan_events
```

Suggested fields:

| Field | Purpose |
|---|---|
| id | Primary key |
| plan_id | Monthly plan |
| campaign_id | Optional campaign |
| content_item_id | Optional content item |
| placement_id | Optional channel placement |
| actor_user_id | User who made the change |
| event_type | created, brief_link_added, assigned, status_changed, deleted |
| from_value | Previous value |
| to_value | New value |
| created_at | Event timestamp |

If time is limited, MVP can start with timestamp columns first and add event log later.

## Status Rule

Marketing Plan views already treat a Planned row with a Brief Link as Assigned for display.

Supervisor reporting should follow the same rule:

```text
if placement_status = planned and brief_link is not empty:
  effective_status = assigned
else:
  effective_status = placement_status
```

But reporting should also preserve the real stored status so admins can identify rows that have a link but were not manually moved to Assigned.

## Report Rules

### Rows Included

Default monthly report includes rows where:

- Launch Date is in selected month, or
- Publish placement date is in selected month

Recommended default for Supervisor Zone:

```text
Use Launch Date / source_start_date as the main month filter.
```

Reason: assignment speed should be measured against launch timing, not only publish marker timing.

### Rows Excluded

Exclude by default:

- Deleted rows
- Archived plans
- Cancelled rows

Show cancelled only when filter asks for it.

### Missing Link Definition

Missing link means:

```text
brief_link is empty
```

This includes rows that may have status changed manually but do not have a CR/detail link yet.

### Critical Definition

A row is Critical when:

- Launch Date is today or in the past and row is not assigned, or
- assignment happened on/after Launch Date, or
- Launch Date is within 1 working day and there is no Brief Link.

## UI Recommendation

Use a quiet operations dashboard style, matching current FlowMate/Marketing Plan UI.

Do not use a decorative landing page.

Recommended layout:

```text
Marketing Plan
  Supervisor
    Month dropdown | Campaign | Channel | PIC | Export

    Summary cards
    Risk alerts

    Tabs:
      Monthly Overview
      PIC Performance
      Campaign Risk
      Channel Risk
```

The first screen should be useful immediately without scrolling too much.

## Out Of Scope For MVP

- Automatic performance scoring
- Individual ranking leaderboard
- AI recommendations
- Slack/Google Chat alerts
- Auto-reminders to PIC
- XLSX multi-tab export
- Trend charts across many months
- Predictive delay model

These can be added after the basic report is trusted.

## Success Criteria

Supervisor Zone is successful when an admin can answer:

- Which rows are still Planned but should already be Assigned?
- Which PICs are consistently assigning too close to Launch Date?
- Which campaigns are at risk this month?
- Which channels have the most late or missing assignments?
- Which rows need follow-up today?

## Risks

- If `first_assigned_at` can be overwritten, the report will not be trustworthy.
- If assignment is inferred only from current status, historical timing will be inaccurate.
- If all users can view this report, it may feel like a personal performance ranking.
- If the report mixes FlowMate workload metrics, Marketing Managers may confuse planning health with production capacity.

## Recommended Build Order

1. Add timestamp/audit fields or event log.
2. Add SQL view for monthly Supervisor report.
3. Add admin-only Marketing Plan Supervisor navigation.
4. Build Monthly Overview tab first.
5. Add PIC Performance, Campaign Risk, and Channel Risk tabs.
6. Add CSV export.

## Next Recommended Step

Create a backend data model / SQL prompt for:

```text
marketing_plan_supervisor.sql
```

The SQL should add trusted assignment timestamps, optional event logging, and one monthly report view that the UI can read.
