# Marketing Plan UAT Checklist

Date: 2026-06-26
Project: FlowMate + Marketing Plan
Source reference: `[FCO] Internal Marketing Plan - June 2026.pdf`

## Purpose

This checklist validates the new Marketing Plan product area.

The goal is not to test FlowMate execution. The goal is to confirm that Marketing Plan can replace the monthly Google Sheet workflow for campaign and channel publishing planning.

## Test Roles

- Admin
- Marketing Manager
- Operation Manager
- Marketing PIC
- Esports PIC
- Viewer / stakeholder
- Signed-out visitor

## Test Data Setup

Use at least one monthly plan:

- Month: June 2026
- Market: TH

Create campaigns similar to the PDF:

- Revenue
- New Patch update : 26.05
- 8th Anniversary
- CarnivalBKK 2026
- FC Pro Masters
- VBL IS 2026
- King of School
- Pro League Summer

Create at least:

- 20 content items
- 5 channels
- 3 content formats
- 5 statuses
- 5 PIC names/users
- 1 plan with TH market / TH ONLY audience marker
- 1 content item with multiple channel placements on different dates
- 1 content item linked to FlowMate Creative Request
- 1 content item not linked to FlowMate

## Regression Position

MVP 1.3 FlowMate Planning should remain on hold unless explicitly revived.

Marketing Plan UAT should verify:

- FlowMate still opens as FlowMate.
- Marketing Plan opens as a separate product after login.
- Marketing Plan does not depend on FlowMate work item data.

## UAT Cases

### UAT-MP-001 - Product Choice After Login

Priority: P0

Steps:

1. Sign in as an active user.
2. Observe post-login product choice.
3. Select FlowMate.
4. Return or sign in again and select Marketing Plan.

Expected result:

- User can choose FlowMate or Marketing Plan.
- FlowMate opens existing execution app.
- Marketing Plan opens planning app.
- User is not forced into one combined planning/execution interface.

Failure signals:

- Marketing Plan appears as mixed FlowMate execution nav.
- User cannot tell which product they are using.

### UAT-MP-002 - Monthly Plan Opens

Priority: P0

Steps:

1. Open Marketing Plan.
2. Select June 2026.
3. Confirm plan title and month.

Expected result:

- Monthly workspace loads.
- Campaigns and content items appear.
- Empty state appears if no plan exists.

### UAT-MP-003 - Campaign Gantt Uses Campaign Main Rows

Priority: P0

Steps:

1. Open Campaign Gantt.
2. Inspect row hierarchy.

Expected result:

- Main row is Campaign.
- Sub row is Content Item.
- Timeline columns are dates.
- Channel placements appear as markers on dates.

Failure signals:

- Main row is GD/VE assignee.
- Main row is FlowMate task owner.
- The view looks like production workload instead of campaign plan.

### UAT-MP-004 - Same Content Can Publish To Multiple Channels

Priority: P0

Precondition:

- Create one content item with Facebook, TikTok, and Instagram placements.
- Use different publish dates or times.

Steps:

1. Open content detail.
2. Open Campaign Gantt.
3. Open Channel Calendar.

Expected result:

- One content item has multiple placement rows.
- Each placement has its own channel.
- Each placement has its own publish date/time.
- Gantt/calendar shows each placement separately.

Failure signals:

- Channels collapse into one text field.
- Only one publish date exists.
- Changing one channel date changes all channels.

### UAT-MP-005 - Channel Calendar Shows Posting Plan

Priority: P0

Steps:

1. Open Channel Calendar.
2. Filter to TikTok.
3. Filter to Facebook.
4. Inspect daily content.

Expected result:

- Calendar uses placement publish date/time.
- Channel filter changes visible placements.
- Cards show campaign, content title, format, PIC, and status.

### UAT-MP-006 - Content Table Matches Sheet Mental Model

Priority: P0

Steps:

1. Open Content Table.
2. Compare columns to the PDF/Google Sheet workflow.

Expected result:

Table includes:

- Campaign
- Team
- Content title/details
- Format
- Tier
- PIC
- Brief link/deck
- Status
- Channels
- Publish date/time summary

### UAT-MP-007 - Status Values Match Monthly Workflow

Priority: P0

Steps:

1. Create content items with statuses:
   - Not Started
   - Assigned
   - Briefed
   - Ready to Post
   - POSTED
2. Inspect Campaign Gantt and Content Table.

Expected result:

- Status is visible and consistently colored.
- Status vocabulary is marketing-plan status, not only FlowMate work status.

### UAT-MP-008 - Campaign Summary Counts Are Correct

Priority: P0

Steps:

1. Open Campaign summary.
2. Count items manually for one campaign.

Expected result:

Summary shows:

- Total content items
- Total placements
- Channels covered
- Posted count
- Ready count
- Not started count
- Next publish date

### UAT-MP-009 - FlowMate Link Is Optional

Priority: P0

Steps:

1. Create content item without FlowMate link.
2. Create content item with linked FlowMate Creative Request.
3. Open both details.

Expected result:

- Both items are valid.
- Linked item can open FlowMate detail.
- Unlinked item does not show error.

Failure signals:

- Every content item requires a Creative Request.
- Marketing Plan cannot create planned content before production request exists.

### UAT-MP-010 - FlowMate Execution Dates Do Not Override Marketing Publish Dates

Priority: P0

Steps:

1. Link one content item to a FlowMate Creative Request.
2. Change Marketing Plan placement publish date.
3. Check FlowMate 1st Draft due date.

Expected result:

- Marketing placement date changes only Marketing Plan.
- FlowMate 1st Draft stays production due date.

### UAT-MP-011 - Filters Work

Priority: P1

Filters:

- Month
- Campaign
- Team
- Channel
- Status
- Format
- PIC

Expected result:

- Filters affect Gantt, Calendar, and Table consistently.

### UAT-MP-012 - Search Works

Priority: P1

Search by:

- Campaign name
- Content title
- Details text
- PIC
- Channel
- Format
- Status

Expected result:

- Results show matching content items and placements.

### UAT-MP-013 - Signed-Out Access Is Blocked

Priority: P0

Steps:

1. Open Marketing Plan in incognito/private browser without signing in.
2. Try direct route URL.

Expected result:

- No plan data is readable.
- User sees login gate.

### UAT-MP-014 - Basic RLS Permissions

Priority: P0

Checks:

- Active signed-in users can read allowed plans.
- Signed-out users cannot read.
- Inactive users cannot read.
- Non-admin users cannot change protected settings.

### UAT-MP-015 - No Secrets In Frontend

Priority: P0

Expected result:

- No service-role key.
- No API secret.
- No password.
- No stored auth token in app-created localStorage data.

### UAT-MP-016 - Import Readiness

Priority: P1

Steps:

1. Take a sample row from the June PDF.
2. Map it into system fields.

Expected result:

- Every important sheet field has a destination field.
- Channel/date markers map to placement rows.

### UAT-MP-017 - Visual Density Is Manager-Friendly

Priority: P1

Expected result:

- Gantt/table can display many rows without oversized cards.
- Text does not overlap.
- Date columns are scrollable.
- Campaign row grouping is clear.

### UAT-MP-018 - MVP Exclusions Are Not Accidentally Built Into Core Flow

Priority: P0

Steps:

1. Open Marketing Plan as an active user.
2. Inspect Campaign Gantt, Channel Calendar, Content Table, and Content Detail.
3. Confirm whether any posting, API publishing, budget, or copy approval workflow is required to save normal planning data.

Expected result:

- User can plan campaigns, content items, and channel placements without connecting a publishing API.
- User can save placement data without auto-posting to any channel.
- Budget fields are not required for MVP planning.
- Copy approval workflow is not required for MVP planning.

Failure signals:

- Content cannot be saved unless a publishing platform is connected.
- Marketing Plan attempts to auto-post.
- Budget becomes mandatory for campaign/content rows.
- Copy approval blocks basic monthly planning.

## Smoke Checklist

After deployment:

- Login works.
- Product choice appears.
- FlowMate opens normally.
- Marketing Plan opens normally.
- June 2026 plan loads.
- Campaign Gantt shows campaign main rows.
- Multi-channel content shows multiple placements.
- Channel Calendar filters by channel.
- Content Table shows sheet-like metadata.
- Signed-out route cannot read data.

## Release Blockers

Do not release Marketing Plan MVP if:

- Content item cannot have multiple channel placements.
- A placement cannot have its own date/time.
- Campaign Gantt uses FlowMate assignee rows instead of campaign rows.
- Signed-out users can read plan data.
- Inactive users can read plan data.
- FlowMate 1st Draft date is treated as Marketing publish date.
- Marketing Plan requires every row to be a FlowMate request.
- Auto-posting, publishing API, budget, or copy approval is required for basic MVP planning.

## Next Recommended Step

Run Chat A scope review before backend implementation.
