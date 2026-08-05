# FlowMate Manager-Oriented Planning View

Date: 2026-06-26
Status: Recommendation draft

## Goal

FlowMate currently gives strong execution visibility: task status, assignee workload, GD/VE Gantt, and production queue.

The next gap is manager planning visibility. Marketing Managers and Operation Managers need to see the big picture of requested assets by campaign, channel, timing, risk, and readiness.

Recommended direction:

- Keep this inside FlowMate for now.
- Add a new `Planning` section instead of creating a separate platform.
- Start with `View by Channel`, then add Campaign and Content Calendar views.

## Product Recommendation

Do not split into a separate platform yet.

Use one platform with two clear modes:

- `Execution`: My Work, Board, List, Calendar, Gantt, Workload, KPI, Team Settings
- `Planning`: Channel View, Campaign View, Content Calendar, Readiness/Risk

Reason:

- The same asset/request data is already the source of truth.
- Splitting too early creates duplicate login, permissions, filters, sync, and reporting logic.
- Managers and execution teams still need to trace the same asset from request to delivery.
- The current problem is missing planning views, not a need for a separate product.

Create a separate platform only later if planning grows into a different operating model with campaign budgets, media plans, content pillars, approval layers, or non-production planning objects.

## Primary Manager Views

### 1. View by Channel

Purpose:

Help Marketing Managers manage content by publishing channel.

Recommended layout:

- Columns or sections by channel: Facebook, Instagram, TikTok, YouTube, Website, In-game, Other
- Each card represents one planned asset/post
- Cards show campaign, asset title, post/launch date, status, assignee, priority, and readiness
- Filters by month, campaign, status, requester team, and asset type

Questions it should answer:

- What content is planned for each channel?
- Which channel is overloaded or empty?
- What is going live this week?
- Which assets are not ready before the publish date?
- Which campaign has missing channel coverage?

### 2. View by Campaign

Purpose:

Help managers see whether a campaign has a complete asset set.

Recommended layout:

- Group by campaign
- Under each campaign, group assets by channel or asset type
- Show completion/readiness status for each asset
- Highlight missing expected assets where useful

Questions it should answer:

- What assets belong to this campaign?
- Is the campaign ready for launch?
- Which assets are still in production, review, or blocked?
- Which channel has no planned asset yet?

### 3. Content Calendar

Purpose:

Show the marketing publishing plan by actual post/launch date.

Recommended layout:

- Month and week views
- Each date shows planned assets by channel
- Cards use channel labels and campaign names
- Clicking a card opens the existing FlowMate task/detail

Questions it should answer:

- What will be posted on each date?
- Are there too many assets launching on the same day?
- What is at risk in the next 7 or 14 days?

### 4. Readiness and Risk Dashboard

Purpose:

Give managers a fast answer on what needs attention.

Recommended sections:

- Ready for launch
- In production
- Waiting review
- Blocked
- At risk
- Missing brief
- Urgent

Risk signals:

- Post/launch date is near but status is not ready
- Asset is still in assigned/in progress close to deadline
- Review round is high
- Brief is incomplete
- Assignee is unavailable or overloaded
- Campaign has missing channel coverage

## Marketing Manager Perspective

Marketing Managers mainly need plan visibility and content readiness.

They need to know:

- Which campaign is launching when
- Which channel each asset will go to
- Whether each campaign has complete channel coverage
- What content is planned this week/month
- Which assets are at risk before publishing
- What is waiting for review or approval

Recommended KPIs:

- Campaign readiness percentage
- Assets by channel
- Assets launching in next 7/14 days
- At-risk assets
- Missing brief count
- Waiting review count
- Urgent requests by requester/team

## Operation Manager Perspective

Operation Managers mainly need process visibility and bottleneck visibility.

They need to know:

- Where work is stuck
- Which skill is overloaded
- Whether urgent work is caused by late requests, brief gaps, or capacity shortage
- How long work takes from request to delivery
- Which campaigns create the most rework
- Whether the team can meet launch volume

Recommended KPIs:

- Intake volume by week/month
- Urgent rate
- Brief incomplete rate
- Queued count
- Blocked count
- Average lead time
- Average review rounds
- On-time first draft rate
- On-time launch delivery rate
- Workload by skill
- Capacity by GD/VE owner

## Data Model Implications

FlowMate already has many of the needed fields, but planning views need stricter meaning.

Required fields:

- `campaign_name`: source of truth for campaign grouping
- `platforms` or channel field: source of truth for where content will be published
- `launch_date`: date the asset is expected to go live
- `due_date`: internal 1st draft date
- `status`: execution status
- `priority`: normal/high/urgent signal
- `asset_subtype` or Type/Skill: production type
- `asset_count`: quantity
- `final_owner_member_id`: production owner
- `requester_user_id` and requester team: business owner

Recommended future field:

- `post_date` or `publish_date`

Reason:

`launch_date` may mean campaign launch or content publish date depending on request context. For manager planning, the exact publish date should be explicit.

Recommended rule:

- Use `1st Draft` for internal production deadline.
- Use `Publish Date` for channel/content calendar.
- Use `Campaign Launch Date` only when the full campaign launch differs from individual asset publish dates.

## Channel Handling

The system needs a normalized channel list.

Recommended initial list:

- Facebook
- Instagram
- TikTok
- YouTube
- Website
- In-game
- LINE
- Other

Open decision:

If one asset is posted to multiple channels, choose one of these models:

- Model A: one asset with multiple channels
- Model B: one production asset with multiple publishing rows

Recommended for MVP:

Use Model A first. It is simpler and fits the current request flow.

Recommended later:

Move to Model B if managers need per-channel publish date, copy, status, or approval.

## Suggested Navigation

Add a new section in the left navigation:

```text
PLANNING
- Channel View
- Campaign View
- Content Calendar
- Readiness
```

Keep existing execution views where they are:

```text
TEAM
- Board
- List
- Calendar
- Gantt Chart
- Central Queue

SUPERVISOR
- Workload
- KPI
- Team settings
```

## MVP Recommendation

Recommended build order:

1. Channel View
2. Campaign View
3. Content Calendar improvement for publish/channel context
4. Readiness/Risk dashboard
5. Operation SLA and lead-time dashboard

Start with Channel View because it directly answers the new need:

What content is planned by channel, for which campaign, and when will it go live?

## Non-Goals for the First Version

Do not build these first:

- Separate platform selection after login
- Full media planning system
- Budget planning
- Campaign approval workflow
- Per-channel copywriting workflow
- Auto-generated content strategy

These can come later if FlowMate expands beyond production execution and content planning.

## Recommended Success Criteria

Marketing Manager can answer:

- What is going live this week?
- Which campaign does each asset belong to?
- Which channel will each asset go to?
- Which campaign/channel is missing content?
- Which assets are at risk?

Operation Manager can answer:

- Which requests are urgent and why?
- Which skill or owner is overloaded?
- Which work is blocked or waiting review?
- Which campaigns create high rework?
- Are we likely to meet the upcoming launch volume?

## Final Recommendation

Keep FlowMate as one system.

Add a manager-oriented `Planning` section with `Channel View` as the first page. This gives Marketing Managers the big picture without splitting the product too early, while keeping execution data connected to production work, workload, and KPI.
