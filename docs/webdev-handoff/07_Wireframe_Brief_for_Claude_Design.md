# GD/VE TeamFlow - Wireframe Brief for Claude Design

Date: 2026-05-15  
Purpose: Use this file as the design brief for Claude Design or any UI designer.

## 1. Can This Be Sent to Claude Design?

Yes. This file is written to be sent directly to Claude Design.

Recommended prompt:

```text
Please design a production-grade internal web app UI from this wireframe brief. Keep it minimal, operational, high-density, and easy for non-technical team members. Do not create a marketing landing page. Focus on the app screens.
```

## 2. Product Context

Design an internal creative workflow web app for a GD/VE team.

The app helps:

- requesters submit creative requests
- GD/VE members manage assigned work
- team members add quick notebook-like tasks
- supervisors see workload and overdue work
- backend assigns creative work by skill, capacity, WIP, and fairness

The design should feel like a practical operations tool, not a sales website.

## 3. Design Direction

Style:

- clean internal dashboard
- high information density
- calm and readable
- professional but not corporate-heavy
- simple layout
- minimal shadows
- clear table/list hierarchy
- useful status colors

Avoid:

- marketing hero page
- oversized decorative cards
- decorative gradients
- too many illustrations
- playful gamified UI
- custom complex navigation

Suggested visual tone:

- warm light background
- white panels
- dark readable text
- indigo or blue primary action
- amber for due soon
- red for overdue/block
- green for delivered/done
- neutral gray for queued/cancelled

## 4. Navigation

Use left sidebar or top navigation.

Main nav items:

1. My Work
2. Create
3. Board
4. List
5. Central Queue
6. Workload
7. KPI
8. Team Settings

Global top bar:

- search bar
- create button
- notification icon
- current user menu

## 5. Screen 1 - My Work

Purpose:

Let each team member quickly see what they must do now, what is late, and what is coming.

Layout:

- Top overdue banner if overdue exists.
- Summary strip:
  - Overdue
  - Due Soon
  - In Progress
  - Review
  - Blocked
- Main content split into sections:
  - Overdue
  - Today / Due Soon
  - In Progress
  - Assigned
  - Review
  - Quick Tasks

Each work item row/card should show:

- ID
- title
- type: Quick Task or Creative Request
- status
- due date
- priority
- effort point if creative
- requester/team
- owner/assignee
- checklist progress

Primary actions:

- Start Work
- Submit Review
- Mark Done for Quick Task
- Open Detail

## 6. Screen 2 - Create

Purpose:

Let users choose between quick notebook task and structured creative request.

Layout:

- Two clear options:
  - Quick Task
  - Creative Request

Quick Task form:

- title
- note
- project/campaign
- due date
- assignee
- priority

Creative Request form:

- title
- requester team
- campaign name
- asset type
- asset subtype
- platform
- size/format
- brief link
- reference link
- priority
- urgent reason if urgent
- due date
- launch date

Important UI rule:

- Do not show preferred owner.
- Do not show manual effort input.
- Do not show complexity input.

After submit:

- show result:
  - Assigned to owner
  - Queued with reason
  - Need Brief with missing fields

## 7. Screen 3 - Work Item Detail

Purpose:

One place to understand and act on a task/request.

Layout:

- Header:
  - title
  - ID
  - status
  - priority
  - due date
  - owner/assignee
- Main left panel:
  - description/brief
  - creative details
  - links
  - delivery link
  - checklist
  - comments
- Right side panel:
  - assignment reason
  - effort point
  - review round
  - queue reason
  - timeline/audit events

Action buttons depend on user/state:

- Start Work
- Submit Review
- Approve Delivered
- Request Changes
- Block
- Cancel
- Rerun Assignment for queued request

## 8. Screen 4 - Board / Kanban

Purpose:

Give a familiar status board without becoming a Trello clone.

Columns:

- Assigned
- In Progress
- Review
- Blocked
- Delivered

Optional filters:

- My items
- team member
- asset type
- requester team
- due soon
- overdue

Card content:

- title
- due date
- owner
- effort
- priority
- status badge
- checklist progress

Drag/drop is allowed only if backend validates transition.

## 9. Screen 5 - List View

Purpose:

Fast scanning and searching.

Table columns:

- ID
- title
- type
- status
- owner/assignee
- requester/team
- asset type
- effort
- due date
- priority
- flags

Filters:

- status
- owner
- team
- type
- asset type
- overdue
- due soon
- blocked

Search should be prominent.

## 10. Screen 6 - Central Queue

Purpose:

Show creative requests that cannot be assigned automatically.

Table columns:

- ID
- title
- requester team
- asset type
- effort
- due date
- queue reason
- needs split
- latest assignment run

Actions:

- open detail
- rerun assignment
- create split request for hybrid, if supported

Design should make queue reason very easy to understand.

## 11. Screen 7 - Workload View

Purpose:

Supervisor visibility.

Layout:

- Team summary:
  - total capacity
  - assigned effort
  - available capacity
  - queued effort
  - overdue count
- Member workload table:
  - member
  - skill
  - availability
  - capacity/day
  - assigned effort
  - available capacity
  - WIP
  - due soon
  - overdue
  - blocked
  - review
  - quick task count

Member row expansion:

- list of active work
- due dates
- effort
- status

Use warning badges for:

- over capacity
- WIP full
- partial capacity missing override
- overdue

## 12. Screen 8 - KPI View

Purpose:

Measure operational health, not judge people unfairly.

Metrics:

- delivered effort
- throughput
- on-time rate
- average review round
- blocked count
- queued count
- queued effort
- per-member assigned effort
- per-team request volume

Visuals:

- simple metric cards
- table by member
- small trend chart if easy

Avoid:

- personal ranking leaderboard
- productivity score as main hero

## 13. Screen 9 - Team Settings

Purpose:

Manage member skills and capacity.

Fields:

- member name
- linked user
- discipline
- skills
- capacity per day
- WIP limit
- availability
- capacity override

Keep this screen simple and admin-like.

## 14. Component Requirements

Use these reusable components:

- Global search
- Status badge
- Priority badge
- Due date badge
- Overdue banner
- Work item card
- Work item table row
- Checklist
- Comment thread
- Capacity meter
- Workload member row
- Assignment reason box
- Audit timeline

## 15. Empty States

Write short, practical empty states:

- "No overdue work"
- "No queued requests"
- "No work assigned"
- "No checklist items"
- "No comments yet"

Do not use long instructional copy.

## 16. Mobile Behavior

Mobile should support:

- My Work
- Search
- Work item detail
- status actions
- comments
- checklist

Workload and KPI can be optimized for desktop first.

## 17. Design Output Needed

Please produce:

- App shell layout.
- My Work screen.
- Create Quick Task form.
- Create Creative Request form.
- Work Item Detail screen.
- Board/Kanban screen.
- List View screen.
- Central Queue screen.
- Workload View screen.
- KPI View screen.

The output should be detailed enough for a web developer to implement.

