# GD/VE TeamFlow - UAT Cases

Date: 2026-05-15  
Purpose: Test product behavior before pilot

## 1. UAT Roles

Use test users:

- Requester from Operation.
- Requester from Marketing.
- Requester from eSport.
- Static graphic designer.
- Video editor.
- eSport video editor.
- Supervisor/coordinator.
- Active user who is not GD/VE.

## 2. Priority Definition

| Priority | Meaning |
|---|---|
| P0 | Must pass before pilot |
| P1 | Should pass before wider rollout |
| P2 | Nice to verify |

## 3. Test Cases

| ID | Priority | Scenario | Steps | Expected Result |
|---|---|---|---|---|
| UAT-001 | P0 | Login with company account | Login with Google Workspace account | User enters app and profile loads |
| UAT-002 | P0 | Inactive user blocked | Set user inactive, try login/use app | User cannot mutate data |
| UAT-003 | P0 | Create Quick Task | Create task with title, due date, note | Task appears in My Work |
| UAT-004 | P0 | Quick Task checklist | Add 3 checklist items and tick 1 done | Checklist saves and progress updates |
| UAT-005 | P0 | Quick Task does not affect creative capacity | Create many quick tasks | Workload creative effort does not change |
| UAT-006 | P0 | Create complete static Creative Request | Submit all required fields | Backend calculates effort and assigns eligible static designer |
| UAT-007 | P0 | Missing brief fields | Submit request without brief link or size | Status becomes Need Brief |
| UAT-008 | P0 | Requester cannot choose owner | Inspect form and submit payload with preferred owner | Field is absent or backend rejects it |
| UAT-009 | P0 | Requester cannot set effort | Submit payload with effort_point | Backend ignores or rejects protected field |
| UAT-010 | P0 | eSport video routing | Submit esport video request | Assigns eSport video member if available |
| UAT-011 | P0 | eSport video fallback | Make eSport video member full/unavailable and submit urgent request | Assigns approved backup only if urgent and capacity allows |
| UAT-012 | P0 | Hybrid request queue | Submit hybrid request | Status Queued, needs_split true, reason explains split |
| UAT-013 | P0 | Capacity full queue | Fill all eligible members capacity then submit request | Request stays Queued with capacity reason |
| UAT-014 | P0 | Partial capacity without override | Set member Partial without capacity override | Member excluded from assignment |
| UAT-015 | P0 | Capacity override reruns assignment | Add capacity override to matching member | Queued eligible request is rechecked |
| UAT-016 | P0 | Owner starts work | Assigned owner moves Assigned to In Progress | Status changes and WIP counted true |
| UAT-017 | P0 | Non-owner cannot move production work | Different user tries to move assigned item | Backend rejects |
| UAT-018 | P0 | Submit review requires delivery link | Owner moves In Progress to Review without link | Backend rejects |
| UAT-019 | P0 | Submit review with delivery link | Owner adds link and moves to Review | Status Review and requester is notified |
| UAT-020 | P0 | Requester approves delivery | Requester moves Review to Delivered | Delivered timestamp is set |
| UAT-021 | P0 | Requester requests changes | Requester moves Review to In Progress | review_round increments by 1 |
| UAT-022 | P0 | Review round not incremented on block | Move Review to Blocked | review_round does not change |
| UAT-023 | P0 | Blocked requires reason | Owner blocks work without reason | Backend rejects |
| UAT-024 | P0 | Overdue banner | Login with overdue assigned work | Banner shows overdue count and filter action |
| UAT-025 | P0 | Search finds task | Search by title, ID, campaign, assignee | Correct work items appear |
| UAT-026 | P0 | Workload view effort accuracy | Compare member assigned effort with open creative items | Numbers match |
| UAT-027 | P0 | Central Queue reason | Open queued request | Queue reason and latest assignment run are visible |
| UAT-028 | P1 | Comments | Add/edit/delete own comment | Comment actions work and event updates |
| UAT-029 | P1 | Near real-time update | User A changes status while User B views board | User B sees update without manual full reload |
| UAT-030 | P1 | Due soon section | Create work due within next 3 days | Appears in My Work due soon |
| UAT-031 | P1 | KPI on-time | Deliver one on-time and one late request | On-time rate calculates correctly |
| UAT-032 | P1 | KPI rework | Request changes twice | Average review round updates correctly |
| UAT-033 | P1 | Cancel requires reason | Cancel active work without reason | Backend rejects |
| UAT-034 | P1 | Audit event history | Open work item events | Created, assignment, status, review events appear |
| UAT-035 | P2 | Mobile layout | Open My Work on mobile viewport | Core actions remain usable |

## 4. Pilot Stop Criteria

Pause pilot if any happen:

- Work item data is corrupted.
- Assignment assigns clearly wrong owner more than 3 times.
- Status changes can bypass backend validation.
- Review round increments incorrectly.
- Capacity dashboard does not match live data.
- Users cannot create or update work reliably.
- Audit log misses critical assignment/status events.

## 5. UAT Notes for Webdev

- Test backend validation directly, not only UI behavior.
- Try hidden field injection for protected fields.
- Verify race condition when two users update same work item.
- Verify due date timezone behavior.
- Verify permission behavior with inactive users.

