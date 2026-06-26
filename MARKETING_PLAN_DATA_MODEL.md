# Marketing Plan Data Model

Date: 2026-06-26
Project: FlowMate + Marketing Plan
Source reference: `[FCO] Internal Marketing Plan - June 2026.pdf`

## Data Model Goal

Marketing Plan needs a data model that matches the monthly Google Sheet workflow.

The core difference from FlowMate:

- FlowMate has work items.
- Marketing Plan has campaigns, content items, and channel placements.

One content item can publish to many channels, and each channel can have a different publish date and time.

## Conceptual Model

```text
marketing_plans
  -> marketing_campaigns
      -> marketing_content_items
          -> marketing_channel_placements
```

Optional integration:

```text
marketing_content_items
  -> optional FlowMate work_items
```

## Entities

### 1. marketing_plans

One monthly plan workspace.

Example:

- FCO Internal Marketing Plan - June 2026

Fields:

| Field | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| month_key | text | Month identity, e.g. `2026-06` |
| title | text | Plan title |
| market | text | TH, SEA, or future market |
| audience_scope | text | Sheet marker such as `TH ONLY` |
| plan_date | date | Header date from the source sheet, e.g. `2026-06-01` |
| status | text | draft, active, locked, archived |
| created_by_user_id | uuid | App user who created plan |
| created_at | timestamptz | Created timestamp |
| updated_at | timestamptz | Updated timestamp |

Rules:

- One active plan per month and market is recommended.
- Archived plans stay readable for history.

### 2. marketing_campaigns

Campaign or section grouping from the monthly plan.

Examples from PDF:

- Revenue
- New Patch update : 26.05
- 8th Anniversary
- CarnivalBKK 2026
- FC Pro Masters
- VBL IS 2026
- King of School
- Pro League Summer

Fields:

| Field | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| plan_id | uuid | Parent monthly plan |
| name | text | Campaign name |
| team | text | MKT, Esports, Revenue, Carnival, etc. |
| objective | text | Optional campaign objective |
| start_date | date | Optional campaign start |
| end_date | date | Optional campaign end |
| color | text | Optional UI color |
| sort_order | integer | Sheet-like display order |
| created_at | timestamptz | Created timestamp |
| updated_at | timestamptz | Updated timestamp |

Rules:

- Campaign is a planning group, not a FlowMate project.
- Campaign can contain rows from multiple teams if needed, but default should be one main team.

### 3. marketing_content_items

One planned content asset/post idea.

Examples:

- Monthly Products (Jun) + Product Tokens
- FC Pro Masters Announce
- Hero Post Teaser Banner
- Cantona Icon review
- Pro League Summer Pre-Heat Video

Fields:

| Field | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| campaign_id | uuid | Parent campaign |
| title | text | Short content title |
| details | text | Description / caption idea / content details |
| team | text | MKT, Esports, Carnival, etc. |
| format | text | Banner, Album, Shorts/Reels, Video, Event, Other |
| content_tier | text | S, A, B or blank |
| pic_user_id | uuid | Linked app user if available |
| pic_name | text | Free text PIC fallback |
| note | text | Planning note |
| source_start_date | date | Left-side sheet Start Date for import trace or fallback |
| source_start_time | time | Left-side sheet time for import trace or fallback |
| brief_link | text | Brief/deck URL |
| source_sheet_row | text | Optional original sheet row reference |
| flowmate_work_item_id | uuid | Optional linked FlowMate work item |
| status | text | not_started, assigned, briefed, ready_to_post, posted, completed, cancelled |
| sort_order | integer | Sheet-like display order |
| created_at | timestamptz | Created timestamp |
| updated_at | timestamptz | Updated timestamp |

Rules:

- A content item can exist without FlowMate.
- FlowMate link is optional and should be used only for creative production.
- Status should describe marketing plan progress, not only GD/VE production status.
- `source_start_date` and `source_start_time` are import/helper fields, not the scheduling source of truth.
- Channel publish scheduling must still come from `marketing_channel_placements`.

### 4. marketing_channel_placements

One publish placement for one content item on one channel.

This is the most important table.

Examples:

- Content item posts on Facebook on 2026-06-04 at 18:00
- Same content item posts on Instagram on 2026-06-05 at 14:00
- A TikTok-only reel posts on 2026-06-20

Fields:

| Field | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| content_item_id | uuid | Parent content item |
| channel | text | facebook, tiktok, instagram, in_game, youtube, other |
| publish_date | date | Date for this placement |
| publish_time | time | Optional posting time |
| placement_status | text | planned, ready, posted, delayed, cancelled |
| posted_url | text | URL after published |
| note | text | Channel-specific note |
| created_at | timestamptz | Created timestamp |
| updated_at | timestamptz | Updated timestamp |

Rules:

- Do not store multiple channels and dates in one row.
- If one content item goes to 3 channels, create 3 placement rows.
- Calendar and Gantt views should read from placements.

## PDF Field Mapping

This mapping keeps the database aligned with the June 2026 Google Sheet/PDF without turning Marketing Plan into FlowMate work items.

| PDF / Sheet Field | Data Model Destination | Notes |
|---|---|---|
| Month header | `marketing_plans.month_key` | Example: `2026-06` |
| Header date | `marketing_plans.plan_date` | Example shown as `2026/06/01` |
| TH ONLY marker | `marketing_plans.audience_scope` and `market` | `market = TH`, `audience_scope = TH ONLY` |
| Campaign / section band | `marketing_campaigns.name` | Examples: Revenue, CarnivalBKK 2026, FC Pro Masters |
| Team / owner group | `marketing_campaigns.team` and `marketing_content_items.team` | Keep row-level team if it differs from campaign default |
| Start Date / row time | `marketing_channel_placements.publish_date` and `publish_time` when it identifies a placement | If no placement exists yet, keep as `source_start_date` / `source_start_time` only |
| Note | `marketing_content_items.note` or placement `note` | Use placement note when it is channel/date-specific |
| Format | `marketing_content_items.format` | Examples: Banner, Album, Shorts/Reels, Video, Event, Other |
| Details | `marketing_content_items.details` | Long content description/caption idea |
| Content Tier | `marketing_content_items.content_tier` | Examples: S, A, B |
| PIC | `marketing_content_items.pic_name` or `pic_user_id` | Free text is allowed first |
| Brief Link / Deck | `marketing_content_items.brief_link` | Store URL only, no credentials |
| Status | `marketing_content_items.status` or `marketing_channel_placements.placement_status` | Use placement status when status differs by channel/date |
| FB / TK / IG / IN / YT flags | `marketing_channel_placements.channel` | One checked channel/date marker becomes one placement row |
| Daily date grid marker | `marketing_channel_placements.publish_date` | The marker date is the publish date for that placement |

### 5. marketing_plan_comments

Optional but useful for collaboration.

Fields:

| Field | Type | Purpose |
|---|---|---|
| id | uuid | Primary key |
| plan_id | uuid | Optional monthly plan |
| campaign_id | uuid | Optional campaign |
| content_item_id | uuid | Optional content item |
| actor_user_id | uuid | App user |
| comment | text | Comment body |
| created_at | timestamptz | Created timestamp |

MVP can defer this unless collaboration is required.

## Status Vocabulary

### Content Item Status

Recommended values:

- `not_started`
- `assigned`
- `briefed`
- `ready_to_post`
- `posted`
- `completed`
- `cancelled`

Map from PDF examples:

| PDF Status | System Status |
|---|---|
| Not Started / Not start | not_started |
| Assigned | assigned |
| Briefed | briefed |
| Ready to Post | ready_to_post |
| POSTED | posted |
| Completed | completed |

### Placement Status

Recommended values:

- `planned`
- `ready`
- `posted`
- `delayed`
- `cancelled`

## Channel Vocabulary

Recommended normalized channel keys:

| Label | Key |
|---|---|
| FB | facebook |
| TK | tiktok |
| IG | instagram |
| IN | in_game |
| YT | youtube |
| Other | other |

Support aliases:

- Facebook, FB, Meta -> facebook
- TikTok, TK -> tiktok
- Instagram, IG, Reels -> instagram
- In-game, IN, Game -> in_game
- YouTube, YT, Shorts -> youtube

## Views / Query Contracts

### marketing_plan_timeline_v

Purpose: feed Campaign Gantt and monthly calendar.

Fields:

- plan_id
- month_key
- campaign_id
- campaign_name
- campaign_team
- content_item_id
- content_title
- details
- format
- content_tier
- pic_name
- content_status
- flowmate_work_item_id
- placement_id
- channel
- publish_date
- publish_time
- placement_status
- posted_url

Filter:

- Exclude archived/cancelled plans by default.
- Include cancelled placements only if filter explicitly asks for them.

### marketing_campaign_summary_v

Purpose: campaign summary cards.

Metrics:

- total_content_items
- total_placements
- channels_covered
- posted_count
- ready_count
- delayed_count
- not_started_count
- next_publish_date

## Relationship To FlowMate

FlowMate should not be the source of truth for Marketing Plan dates.

Allowed integration:

| Marketing Plan | FlowMate |
|---|---|
| Content item needs creative production | Create/link Creative Request |
| FlowMate delivery complete | Marketing Plan item can become ready_to_post |
| Marketing Plan publish timing changes | Does not automatically change FlowMate 1st Draft |

Do not force:

- One content item = one Creative Request
- One channel placement = one Creative Request
- FlowMate due date = publish date

## Migration From Current MVP 1.3 Planning Fields

Existing MVP 1.3 fields can be treated as temporary:

- `work_items.campaign_name`
- `work_items.publish_date`
- `creative_request_details.platforms`
- `planning_work_items_v`

These are useful for FlowMate context, but not enough for Marketing Plan.

Marketing Plan MVP should add separate tables instead of expanding FlowMate work_items further.

## MVP Backend Deliverables

Minimum SQL deliverables:

- Create Marketing Plan tables.
- Add RLS for signed-in active users.
- Add admin/editor permissions later if needed.
- Add normalized channel helper.
- Add timeline view.
- Add summary view.
- Add seed/sample data from the June 2026 PDF shape.

## Security Rules

- Use `auth.uid()` for actor identity.
- Do not trust client-supplied actor IDs.
- Do not allow signed-out reads.
- Do not add null-user RLS bypass.
- Do not expose archived plans in normal views.
- Do not store passwords, tokens, API keys, or secrets.

## Open Decisions

- Should every whitelisted FlowMate user read Marketing Plan, or only Marketing/Operations?
- Should PIC be tied to `public.users`, `team_members`, or free text first?
- Should Google Sheet import be MVP 1.0 or MVP 1.1?
- Should posted URL be required before marking placement as posted?

## Next Recommended Step

Implement the backend tables and `marketing_plan_timeline_v` before building the Campaign Gantt UI.
