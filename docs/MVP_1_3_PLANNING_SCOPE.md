# FlowMate MVP 1.3 Planning Scope / PRD

Date: 2026-06-26
Project: FlowMate
Baseline: MVP 1.2 operations and collaboration work
Theme: Manager-Oriented Campaign and Channel Planning

## Status

FlowMate currently has strong execution visibility:

- My Work
- Board
- List
- Team Calendar
- Team Gantt Chart
- Workload
- KPI
- Notification Center
- Detail collaboration

The missing layer is manager planning visibility. Marketing Managers and Operation Managers need to understand how requested assets connect to campaigns, publishing channels, publishing dates, readiness, and delivery risk.

MVP 1.3 should add planning visibility without splitting FlowMate into a separate platform.

## Product Goal

FlowMate MVP 1.3 should help managers answer:

- Which campaign does each requested asset belong to?
- Which channel will each asset go to?
- When is each asset planned to publish or launch?
- Which assets are ready, delayed, blocked, or at risk?
- Which campaigns or channels are missing expected content?
- Where is the production or approval bottleneck?

The release should add a Planning section that uses the same FlowMate source data as execution views.

## Product Direction

Keep FlowMate as one system.

Add a new navigation section:

```text
PLANNING
- Channel View
- Campaign View
- Content Calendar
- Readiness
```

Do not create a separate `Login > Choose Platform > FlowMate / Campaign Plan` flow for MVP 1.3.

Reason:

- Campaign, channel, asset, date, status, requester, and assignee data should remain connected to the same work item.
- Splitting into a second platform too early would duplicate permissions, filtering, reporting, and sync logic.
- The current gap is missing manager views, not a separate product boundary.

## Users

### Marketing Manager

Needs:

- See content grouped by campaign.
- See planned assets by channel.
- Know what is going live this week or month.
- Identify missing campaign/channel coverage.
- Identify work at risk before publish or launch date.
- See what is waiting for review or approval.

### Operation Manager

Needs:

- See bottlenecks across request intake, production, review, and delivery.
- Understand urgent work volume and causes.
- See workload pressure by skill and owner.
- Track lead time, rework, and delivery risk.
- Identify campaigns creating high rework or late pressure.

### Requester

Needs:

- Create requests with enough campaign and channel context.
- See where their request sits in the campaign/content plan.
- Understand whether their asset is at risk.

### GD/VE Owner

Needs:

- Continue working from execution views.
- See campaign/channel context inside detail view without changing the production workflow.

## In Scope

### 1. Planning Navigation

FlowMate should add a Planning section to the left navigation.

Expected behavior:

- Planning section is visible to active signed-in users.
- Planning pages use existing auth/RLS protections.
- Planning pages do not replace existing execution pages.
- Clicking a planning card opens the existing work item detail.

### 2. Channel View

Channel View is the first MVP 1.3 planning page.

Expected behavior:

- Group visible creative assets by publishing channel.
- Show channels as columns or sections.
- Each card shows:
  - display ID
  - title
  - campaign
  - channel/platform
  - publish or launch date
  - 1st Draft date
  - status
  - priority
  - assignee/owner
  - Type/Skill
  - risk/readiness label
- Filters:
  - month
  - campaign
  - channel
  - status
  - requester team
  - priority
  - Type/Skill
- Search should still find planning items by ID, title, campaign, channel, requester, assignee, and Type/Skill.

### 3. Campaign View

Campaign View should help managers understand asset coverage by campaign.

Expected behavior:

- Group assets by campaign.
- Show campaign summary:
  - total assets
  - channels covered
  - ready/delivered assets
  - at-risk assets
  - blocked assets
  - urgent assets
- Asset rows/cards show channel, date, status, owner, and Type/Skill.
- Campaign groups can be filtered by month and status.

### 4. Content Calendar Improvements

Existing Team Calendar is execution-oriented. MVP 1.3 should add planning context.

Expected behavior:

- Planning Content Calendar uses publish/launch date as the primary date.
- Calendar items show campaign and channel.
- Clicking an item opens the work item detail.
- Calendar filters include campaign and channel.
- Team Calendar can remain due-date focused for execution.

### 5. Readiness And Risk

Planning views should surface a simple readiness/risk label.

Recommended readiness labels:

- `Planned`
- `In Production`
- `In Review`
- `Ready`
- `Published`
- `At Risk`
- `Blocked`
- `Need Brief`

MVP 1.3 can derive these from existing production status first. A separate planning status is a future enhancement unless required by UAT.

Risk signals:

- Publish/launch date is near and status is not ready/delivered.
- 1st Draft date is passed and status is not in review/delivered.
- Status is blocked.
- Status is need_brief.
- Priority is urgent.
- Review round is high.
- Owner is overloaded or unavailable.

### 6. Creative Request Field Updates

Creative Request should capture planning context at create time.

Expected behavior:

- Campaign remains required.
- Channel/platform is normalized and used by Planning views.
- Publish date should be explicit if it differs from launch date.
- 1st Draft remains the internal production due date.
- Type/Skill and Asset Count remain production inputs for effort/assignment.

Field naming recommendation:

- Use `Campaign` for manager-facing campaign grouping.
- Use `Channel` for publishing destination.
- Use `Publish Date` for when the asset/content goes live.
- Keep `1st Draft` for internal production due date.
- Keep `Launch Date` only when it is truly a campaign/product launch milestone.

### 7. Detail View Planning Context

Work item detail should show planning context clearly.

Expected behavior:

- Detail shows campaign, channel, publish date, launch date if present, and Type/Skill.
- Planning fields should appear near creative details, not hidden only in cards.
- Manager can open a planning card and confirm the campaign/channel/date without searching elsewhere.

### 8. List, Search, Filter, And Export Coverage

Planning fields should not be isolated to the new pages.

Expected behavior:

- List filters include campaign and channel where useful.
- Global search matches campaign and channel.
- KPI/export includes campaign, channel, publish date, launch date, and Type/Skill where relevant.
- Workload may show campaign/channel as context, but should not become a planning dashboard.

## Out Of Scope

These are not part of MVP 1.3:

- Separate Campaign Plan platform after login.
- Media budget planning.
- Campaign budget tracking.
- Content pillar strategy.
- Copywriting workflow per channel.
- Per-channel approval workflow.
- Auto-generated content strategy.
- Drag-to-reschedule planning calendar.
- Full dependency planning between assets.
- Publishing API integration.
- Social platform posting automation.
- Replacing execution Board/List/Calendar/Gantt.

## Data Model Direction

MVP 1.3 should be conservative with database changes.

Recommended first version:

- Keep the main production work item as the source of truth.
- Reuse existing `campaign_name`, `platforms`, `due_date`, `launch_date`, `asset_subtype`, and `asset_count` where possible.
- Add a dedicated `publish_date` only if product rules confirm that publish date is not always the same as launch date.
- Normalize channel/platform values so Channel View can group reliably.

Recommended future version:

- Add a separate campaign table if campaign metadata grows.
- Add a separate publishing plan table if one asset can have multiple channel-specific publish dates, copy, approval, or status.

## Field Impact Matrix

Every new planning field must be added across the full product surface where relevant.

| Field | Source of Truth | Create Form | Detail | List/Search/Filter | Planning Views | Calendar | Workload/KPI | Export | Notification | Backfill |
|---|---|---|---|---|---|---|---|---|---|---|
| `Campaign` | `work_items.campaign_name` for Creative Request | Required | Show in creative details/header | Search and filter | Group in Campaign View; card label in Channel View | Show on planning calendar items | KPI by campaign/requester team | Include in KPI/planning export | Include when useful in review/risk notification | Existing campaign_name; fallback to project/campaign text |
| `Channel` | `creative_request_details.platforms` or future normalized channel field | Required | Show under creative details | Search and filter | Primary grouping in Channel View | Show on content calendar item | KPI by channel | Include in export | Include when useful for publish/risk notification | Map existing platforms to normalized channel list |
| `Publish Date` | New `publish_date` if needed; otherwise use `launch_date` | Required if planning needs exact publish date | Show below 1st Draft/Launch Date | Filter by month/range | Primary date in planning views | Primary date in Content Calendar | On-time publish/risk metrics | Include in export | Due/risk notifications can reference it | Default from launch_date for old rows |
| `Launch Date` | `work_items.launch_date` | Existing | Show as campaign/product launch date | Search/filter by month if needed | Supporting date | Supporting marker | Launch risk metrics | Include in export | Use for launch risk where publish date absent | Existing value |
| `1st Draft` | `work_items.due_date` | Auto from date rules | Show as internal due date | Existing due filters | Supporting date | Execution Team Calendar date | Draft timeliness metric | Include in export | Due soon/overdue notifications | Existing due_date |
| `Type/Skill` | `creative_request_details.asset_subtype` | Required | Show in creative details | Search/filter | Planning card label | Optional label | Workload by skill | Include in export | Not needed by default | Existing subtype |
| `Asset Count` | `creative_request_details.asset_count` | Required | Show in creative details | Optional filter | Optional card count | Not primary | Effort/capacity KPI | Include in export | Not needed by default | Existing/default 1 |
| `Readiness` | Derived first from status/risk rules | Not manually set in MVP | Show as label | Filter if useful | Primary label | Calendar label/color | Risk KPI | Include in planning export | Use for risk notifications later | Derived |

## Channel Normalization

MVP 1.3 should avoid free-text channel drift.

Recommended initial channel list:

- Facebook
- Instagram
- TikTok
- YouTube
- Website
- In-game
- LINE
- Other

Rules:

- Existing platform strings should be mapped into this list.
- Unknown values should display as `Other` or the original value with a warning in admin/debug context.
- Channel filters should use normalized values.

## One Asset, Multiple Channels

MVP 1.3 should support a simple first model.

Recommended MVP model:

- One creative request can have multiple channels.
- One publish date applies to the asset/request.
- Channel View shows the same asset under each selected channel.

Known limitation:

If Facebook, Instagram, and TikTok need different publish dates, copy, approval status, or owners, the MVP model is not enough.

Future model:

- Add `content_publication_items` or similar.
- One production asset can have multiple publication rows.
- Each publication row has channel, publish date, copy/status, and approval.

Do not build the future model until the team confirms per-channel planning is required.

## Acceptance Criteria

### Channel View

- Channel View appears under the Planning section.
- Channel View groups Creative Requests by channel.
- Multi-channel assets appear under each relevant channel.
- Cards show campaign, channel, publish/launch date, status, owner, priority, and Type/Skill.
- Clicking a card opens the correct detail page.
- Filters work for month, campaign, channel, status, requester team, priority, and Type/Skill.
- Empty channels show a clear empty state.

### Campaign View

- Campaign View groups Creative Requests by campaign.
- Campaign summary shows total assets, channels covered, ready/delivered count, at-risk count, blocked count, and urgent count.
- Asset rows/cards show channel, date, status, owner, priority, and Type/Skill.
- Clicking an asset opens the correct detail page.

### Content Calendar

- Planning calendar uses publish date when available.
- If publish date is not available, it falls back to launch date.
- Calendar item shows campaign and channel.
- Calendar item click opens the correct detail page.
- Campaign and channel filters work.

### Field Coverage

- Campaign is visible in create, detail, list/search, planning views, calendar, KPI/export.
- Channel is visible in create, detail, list/search, planning views, calendar, KPI/export.
- Publish date, if added, is visible in create, detail, planning views, calendar, and export.
- Existing execution views do not lose 1st Draft/due-date behavior.
- Search can find by campaign and channel.

### Security And Regression

- Existing MVP 1.2 security tests still pass.
- Planning views respect signed-in RLS rules.
- Signed-out users cannot load planning data.
- Planning views do not expose archived tasks in normal mode.
- No password, API key, token, session, or webhook secret is stored in frontend code or localStorage.

## Risks And Edge Cases

- `Campaign` is inconsistently typed by requesters.
- `Channel` has duplicate spelling or old platform values.
- One asset belongs to multiple channels and appears duplicated in counts.
- Publish date and launch date are confused.
- Calendar becomes crowded if each multi-channel asset appears multiple times.
- Manager expects campaign-level status while system only has asset-level status.
- KPI counts differ depending on whether multi-channel assets are counted once or once per channel.
- Old rows have missing campaign/channel/date values.
- Archived/reset historical rows should not appear in active planning views.

## Counting Rules

MVP 1.3 must define count semantics clearly.

Recommended rules:

- Asset count: count each Creative Request once.
- Channel placement count: count each Creative Request once per channel.
- Campaign asset count: count each Creative Request once under its campaign.
- Readiness count: count each Creative Request once.
- Channel View visible card count: can count duplicated channel placements, but label should make this clear.

## Recommended Work Split

### Chat A - Scope / UAT

Owns:

- Finalize MVP 1.3 scope.
- Create UAT checklist.
- Confirm data model decisions.

Files:

- `docs/MVP_1_3_PLANNING_SCOPE.md`
- `docs/MVP_1_3_PLANNING_UAT_CHECKLIST.md`
- `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md`

### Chat B - Backend / Data Model

Owns:

- Channel normalization.
- Publish date field if approved.
- Query/view support for planning pages.
- Migration/backfill rules.

Likely files:

- `supabase/*.sql`
- `supabase/README.md`
- `src/lib/flowmate.uat.test.ts`

### Chat C - Create / Detail / Search Field Coverage

Owns:

- Creative Request field updates.
- Detail display.
- List/search/filter coverage.
- Export field inclusion where relevant.

Likely files:

- `github/screens-a.jsx`
- `github/screens-b.jsx`
- `github/search-utils.js`
- `github/supabase-list-data.js`
- `src/lib/flowmate.uat.test.ts`

### Chat D - Planning Channel View Frontend

Owns:

- Planning nav section.
- Channel View page.
- Filters, grouping, cards, empty states.
- Open detail from planning card.

Likely files:

- `github/app.jsx`
- `github/screens-c.jsx`
- `github/app.css`
- `src/lib/flowmate.uat.test.ts`

### Chat E - Campaign View / Content Calendar

Owns:

- Campaign View.
- Content Calendar planning context.
- Campaign/channel filters.

Likely files:

- `github/screens-c.jsx`
- `github/search-utils.js`
- `github/app.css`
- `src/lib/flowmate.uat.test.ts`

### Chat F - QA / Integration

Owns:

- Full UAT.
- Regression across execution views.
- Security/RLS check.
- Manager-view manual checks.

Files:

- `docs/MVP_1_3_RELEASE_CANDIDATE_2026-06-26.md`
- `src/lib/flowmate.uat.test.ts`

## Release Gate

MVP 1.3 is ready only when:

- Automated tests pass.
- Channel View manual test passes.
- Campaign View manual test passes if included in build.
- Content Calendar planning context test passes if included in build.
- Create form still creates valid Creative Requests.
- Assignment engine still assigns by Type/Skill and capacity.
- Detail view shows campaign/channel/date context.
- Search and filters find campaign/channel values.
- KPI/export includes planning fields where scoped.
- Existing Board/List/My Work/Calendar/Gantt/Workload still work.
- Signed-out and unauthorized access remains blocked.
- No secrets are added.

## Non-Goals For MVP 1.3

MVP 1.3 is not a separate campaign planning platform.

It should not become a full media planning, budget, publishing, or copy approval system. The release should focus on showing the big picture of production assets by campaign, channel, and publish timing while preserving the existing FlowMate execution model.
