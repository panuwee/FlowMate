# Marketing Plan Product Scope / PRD

Date: 2026-06-26
Project: FlowMate + Marketing Plan
Source reference: `[FCO] Internal Marketing Plan - June 2026.pdf`
Decision: Separate Marketing Plan from FlowMate

## Status

FlowMate MVP 1.3 planning work is technically useful, but it does not match the real monthly marketing planning workflow.

The PDF review shows that the team currently works from a Google Sheet-style monthly content plan. That plan is not a creative-request production tracker. It is a campaign and channel publishing calendar.

Therefore, Marketing Plan should become a separate product area after login:

```text
Login
  -> Choose product
      -> FlowMate
      -> Marketing Plan
```

## Product Boundary

### FlowMate

FlowMate owns production execution:

- Creative Request intake
- Quick Task intake
- GD/VE assignment
- 1st Draft due date
- Review, delivery, blocked, cancelled, archive
- Workload and capacity
- Notifications and collaboration

### Marketing Plan

Marketing Plan owns monthly publishing planning:

- Campaign list
- Content item list
- Channel-level publish schedule
- Publish date and publish time per channel
- Content owner / PIC
- Tier, format, status, brief/deck link
- Monthly timeline and channel calendar
- Campaign Gantt-style view

## Product Goal

Marketing Plan should help Marketing and Operations answer:

- What campaigns are active this month?
- What content items exist under each campaign?
- Which team owns each content item?
- Which channel will each content item publish to?
- What date and time will each channel placement go live?
- What is already posted, ready, briefed, assigned, or not started?
- Are there overloaded posting days?
- Are any channels missing content?
- Which content still needs creative production in FlowMate?

## PDF Workflow Understanding

The PDF is a Google Sheets export with:

- Month-level date grid.
- Left-side content metadata.
- Right-side timeline grid.
- Header channels: FB, TK, IG, IN, YT.
- Daily columns across late May, June, and early July.
- Rows grouped by campaign or content category.
- Content rows with team/PIC/status and placement markers.

Observed fields:

- Month / plan date
- TH ONLY / market-scope marker
- Team or owner group, such as MKT, Esports, Carnival
- Campaign or section name, such as Revenue, New Patch, 8th Anniversary, FC Pro Masters
- Start Date
- Publish Time
- Note
- Format, such as Banner, Album, Shorts/Reels, Video, Event, Other
- Details / content description
- Content Tier, such as S, A, B
- PIC
- Brief Link / Deck
- Status, such as POSTED, Not Started, Briefed, Ready to Post, Assigned
- Channel flags, such as FB, TK, IG, IN, YT
- Timeline markers on specific dates

## MVP Direction

Marketing Plan MVP should not start from Creative Request fields.

It should start from the monthly marketing sheet model:

```text
Campaign
  -> Content Item
      -> Channel Placement
          -> Channel
          -> Publish Date
          -> Publish Time
          -> Status
```

FlowMate can be linked later only when a content item needs production work.

## MVP 1.0 Scope For Marketing Plan

### 1. Product Switch After Login

After login, user can choose:

- FlowMate
- Marketing Plan

Expected behavior:

- Both products share authentication.
- Marketing Plan has its own navigation.
- Marketing Plan does not show FlowMate execution screens by default.
- FlowMate does not show Marketing Plan planning screens by default.

### 2. Monthly Plan Workspace

Marketing Plan opens to a month workspace.

Minimum controls:

- Month selector
- Team filter
- Campaign filter
- Channel filter
- Status filter
- Search

### 3. Campaign Gantt View

Primary view for MVP.

Layout:

```text
Main row = Campaign
Sub row = Content Item
Column = Date
Marker = Channel Placement
```

Expected card/marker data:

- Channel
- Publish time
- Status
- Format
- PIC
- Content tier

### 4. Content Table View

A table-style view should match the Google Sheet mental model.

Columns:

- Campaign
- Team
- Content title / details
- Format
- Tier
- PIC
- Brief link / deck
- Status
- Channels
- Publish date/time summary

### 5. Channel Calendar View

Managers need a channel-first view:

- Facebook
- TikTok
- Instagram
- In-game
- YouTube
- Other

This view answers: what is going live on each channel by date.

### 6. Content Item Detail

Each content item should show:

- Campaign
- Team
- Details
- Format
- Tier
- PIC
- Brief/deck links
- Status
- Channel placements
- Optional FlowMate request links
- Notes

### 7. Import Foundation

MVP should account for future Google Sheet import, but does not need full import automation in the first build.

Minimum requirement:

- Data model should match monthly sheet rows.
- It should be possible to seed or manually add rows from Google Sheet/PDF structure.
- Future import should not require redesigning the database.

## Out Of Scope For Marketing Plan MVP 1.0

- Auto-posting to social platforms
- Publishing API integration
- Media budget planning
- Paid media optimization
- Copy approval workflow
- Asset production assignment
- Replacing FlowMate workload logic
- Two-way sync with Google Sheets
- AI content generation
- Automatic OCR/PDF import from screenshots

## FlowMate Integration Rule

Marketing Plan can link to FlowMate, but should not depend on FlowMate.

Recommended relationship:

```text
Marketing Plan content item
  optionally links to
FlowMate creative request
```

Use this only when a content item needs GD/VE production.

Do not force every content row to become a FlowMate request.

## Key Product Decision

MVP 1.3 Planning should not be released as the main planning solution.

Recommended status:

```text
MVP 1.3 Planning RC
  Technical status: Passed
  Product status: Invalidated / Hold
  Reason: FlowMate execution data is not the same as monthly marketing plan data.
```

Handling rule:

- Do not release MVP 1.3 Planning RC as the final Marketing Plan.
- Do not destructively revert MVP 1.3 files during Marketing Plan build work.
- Leave it dormant or gated until the separate Marketing Plan shell is ready.

## Success Criteria

Marketing Plan MVP is successful when:

- A Marketing Manager can open a month and understand the full content plan.
- Campaigns are visible as grouped timelines.
- Content items appear under campaigns.
- Each channel placement can have its own date and time.
- Status is understandable without opening FlowMate.
- FlowMate remains clean as an execution tool.

## Risks

- If Marketing Plan reuses FlowMate work item tables too aggressively, it will become confusing again.
- If channel placements are stored as one text field, future filtering and calendar views will be weak.
- If Google Sheet import is ignored in the data model, migration will be expensive later.
- If Marketing Plan and FlowMate share too many screens, users will not understand which system they are using.

## Next Recommended Step

Build Marketing Plan as a separate product module inside the same authenticated app, starting with backend data model and a Campaign Gantt MVP.
