# FlowMate Team Schedule — MVP Specification

## Outcome

Replace the combined Gantt/daily-capacity screen with one read-only planning page named **Team Schedule**. The page has two focused views: **Timeline** and **Workload**. It does not add queueing, drag-to-reschedule, or AM/PM planning.

## Timeline

- One selected calendar month; current month is the default.
- One row for every active GD/VE member, including members with no visible tasks.
- Production bar: Actual Start → 1st Draft. If no Start Work event exists, use the earliest capacity allocation as Suggested Start; otherwise calculate backwards from effort and daily capacity.
- Review buffer: 1st Draft → Launch, visually lighter than the production bar.
- Launch uses a diamond marker; Today uses a vertical line.
- Bar colour communicates status: Assigned, In Progress, Review, Blocked.
- Urgent is a red flag/border and does not replace the status colour.
- Clicking a task opens its existing Detail route. The schedule itself is read-only.

## Workload

- Weekly columns intersecting the selected month. Partial edge weeks are shown so no date is omitted.
- Available PT = `capacity pt/day × actual Monday-Friday working days − leave − configured holidays`.
- Used PT comes from `flowmate_capacity_allocations` and is grouped by assignee/week.
- Capacity-counted statuses: Assigned, In Progress, Review, Blocked.
- Excluded statuses: Need Brief, Unassigned, Delivered, Cancelled and historical Queued.
- Clicking a weekly cell shows every contributing task, individual PT, total used PT and available PT.
- Visual thresholds: Available, Healthy, Near Capacity (>=85%), Over Capacity (>100%). Colour is reinforced with labels and numbers.

## Filters and Summary

- Month, assignee, status, skill and Over Capacity Only.
- Clear restores all defaults.
- Summary: active tasks, visible assignees, over-capacity weeks, due in seven days.

## Data Contract

- `work_items`: status, effort, owner, first draft, launch.
- `work_item_events`: first Assigned and first In Progress timestamps.
- `flowmate_capacity_allocations`: suggested start and weekly used PT.
- `team_members`: active GD/VE membership and capacity per day.
- `leave_requests`: full/half-day capacity reduction.
- `flowmate_non_working_days`: configurable holidays; no dates are hard-coded in UI.
- `flowmate_team_schedule_v`: security-invoker read model for future optimized loading.

## Permissions and Safety

- Existing work-item RLS remains authoritative.
- New views use `security_invoker = true`.
- The holiday table grants authenticated read only; maintenance remains an admin/service operation.
- No historical task, status, assignment, allocation or event is modified by the migration.

## Acceptance and Regression Checks

1. Timeline and Workload tabs render and retain the selected tab during the browser session.
2. Current month remains selectable even with no tasks.
3. All active GD/VE members appear.
4. Actual/Suggested Start, 1st Draft, Review buffer and Launch are distinguishable.
5. Weekly totals include Review and exclude Delivered/Cancelled.
6. Leave and configured holidays reduce available capacity.
7. Workload drill-down totals equal the weekly cell total and task links open Detail.
8. Filters combine correctly and Clear restores the full view.
9. Desktop, mobile, Light and Dark remain readable.
10. Board, List, Detail, permissions and assignment workflows remain unchanged.
