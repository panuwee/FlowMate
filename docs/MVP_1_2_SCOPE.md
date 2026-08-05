# FlowMate MVP 1.2 Scope / PRD

Date: 2026-05-19
Project: FlowMate
Baseline: MVP 1.1 release passed on 2026-05-19
Theme: Live Collaboration Operations View

## Status

MVP 1.1 is closed and passed on GitHub Pages.

MVP 1.2 should improve daily operations without redesigning the product or weakening the MVP 1.0 / MVP 1.1 security baseline.

## Product Goal

FlowMate MVP 1.2 should make the system feel live and easier to operate day to day.

The MVP 1.2 product scope is limited to these goals:

- Reduce stale data across shared team views.
- Let the team see work on a calendar.
- Give users an in-app notification center for relevant workflow events.
- Let requester, assignee, and watchers collaborate after a task is created.
- Give admins safe operational override tools for testing and support.
- Keep the release medium-sized and testable.

Anything outside Realtime Live Updates, Team Calendar, Notification Center, Detail Collaboration, Admin Operations, and Admin Test View is a non-goal unless this PRD is updated.

## In Scope

### 1. Realtime Live Updates

FlowMate should update shared work views without requiring users to manually refresh.

Expected behavior:

- Board, My Work, Queue, Workload, and Calendar can refresh from live backend changes.
- Use Supabase Realtime where available.
- Keep existing polling and focus refresh as fallback.
- If realtime disconnects, show a small degraded/live status message without blocking work.
- After a user creates, edits, moves, cancels, blocks, resumes, or reviews a work item, their UI updates immediately.
- Other active users see changes within a few seconds.

### 2. Team Calendar

FlowMate should add a Team Calendar view for planning and scanning upcoming work.

Expected behavior:

- Calendar shows Quick Tasks and Creative Requests.
- Due date is the primary calendar date.
- Creative Requests show launch date as supporting information when the field exists, but due date remains the calendar placement date.
- Users can filter by:
  - assignee
  - status
  - type
  - priority
- Calendar item click opens the correct work item detail.
- Calendar supports at least:
  - month view
  - agenda/list view for selected day or week
- Overdue and due-soon items should be visually clear.
- Calendar must not replace Board, My Work, or Workload.

### 3. Notification Center

FlowMate should add an in-app Notification Center instead of SEA Enterprise Webhook integration for MVP 1.2.

Expected behavior:

- Enable the current Notifications button.
- Show unread count.
- Show notifications relevant to the signed-in user.
- Users can open a notification and navigate to the correct work item detail.
- Users can mark one notification as read.
- Users can mark all notifications as read.
- Notifications should be generated from important workflow events.
- Notification reads and mutations must use backend identity from `auth.uid()`.
- Frontend code must not send or choose the trusted notification recipient by actor/user ID.

Notification event types for MVP 1.2:

- New work assigned to the user.
- Work item status changed on a relevant item.
- Review requested for the requester.
- Work item approved or changes requested.
- Work item blocked.
- Work item resumed.
- Work item cancelled.
- Work item due soon.
- Work item overdue.
- Comment added on a relevant item.
- Link added on a relevant item.
- Watcher added to a relevant item.

### 4. Detail Collaboration After Create

Requester and assignee should be able to add useful working context after a task has already been created.

Expected behavior:

- Requester and assignee can add links to a work item after creation.
- Each link has:
  - URL
  - description
  - created by
  - created at
- Requester and assignee can add comments after creation.
- Existing comments remain visible in the detail view.
- Adding a link or comment creates an audit/work item event.
- Adding a link or comment can notify relevant users.
- Users who are not related to the work item should not be able to add links or comments.

### 5. Watchers

FlowMate should let requester and assignee add stakeholders as watchers.

Expected behavior:

- Watchers appear in the right-side detail panel under Assignee.
- Requester and assignee can add watchers.
- Requester and assignee can remove watchers they added if backend rules allow it.
- Watchers can view the work item and receive notifications.
- Watchers are read-only for MVP 1.2:
  - they can see relevant work item details,
  - they receive notifications,
  - they do not get edit/status-change rights from watcher status alone.
- Watchers receive notifications when:
  - status changes,
  - a comment is added,
  - a link is added.

### 6. Admin Operations

Admins need full operational access for support and pilot testing without weakening the normal member rules.

Expected behavior:

- Admin can perform status transitions even when not the owner.
- Admin can archive/delete any task using soft delete/archive behavior.
- Admin archive must preserve audit trail and related history.
- Admin archive should hide archived items from normal active views unless explicitly included by admin tooling.
- Admin actions must be audited as the real admin actor.
- Normal requester/assignee/owner rules still apply to non-admin users.

### 7. Panu Test View

Panu needs a safe way to verify Pond's perspective for testing.

Expected behavior:

- Panu can use "View as Pond" for test visibility.
- View as Pond changes visible filters/perspective only.
- View as Pond must not impersonate Pond for mutations.
- Any real action still uses Panu's authenticated identity.
- If Panu performs an admin override while viewing as Pond, audit actor remains Panu.

## Out Of Scope

These are explicitly not part of MVP 1.2 and should not be implemented in this release:

- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email notifications.
- Browser push notifications.
- Notification preferences per user.
- Cross-device saved filters.
- Drag-to-reschedule calendar items.
- Full scheduling or dependency planning.
- Complex realtime conflict resolution.
- Full redesign of navigation or visual system.
- Hard delete that permanently removes audit/history.
- True account impersonation where Panu's actions are written as Pond.
- Giving watchers edit/status-change rights in MVP 1.2.

If any out-of-scope item is needed later, plan it as a separate post-MVP 1.2 release.

## Users

### Member

Needs:

- See own assigned work update live.
- Know when work changes or needs action.
- Use calendar to see current and upcoming load.

### Requester

Needs:

- Know when a request needs review.
- Open the correct request detail from notification or calendar.
- See request timing clearly.

### Admin / Supervisor

Needs:

- See shared team calendar.
- See workload and board changes without asking people to refresh.
- Confirm important workflow changes are visible to the right users.

## Acceptance Criteria

### Realtime

- User A changes a work item status and User B sees the update without manual refresh.
- Realtime failure does not white-screen the app.
- App falls back to polling and focus refresh if realtime is unavailable.
- Live status is accurate enough for users to know whether the app is connected or degraded.
- Existing create, assignment, status transition, and cancel flows still work.

### Team Calendar

- Calendar loads without breaking My Work, Board, Queue, or Workload.
- Calendar shows both Quick Tasks and Creative Requests.
- Calendar uses due date consistently.
- Creative Request launch date is visible where relevant.
- Calendar filters work for assignee, status, type, and priority.
- Clicking a calendar item opens the correct detail item.
- Overdue and due-soon items are easy to distinguish.

### Notification Center

- Notifications button is enabled.
- Unread count is shown.
- Relevant workflow events create notifications for the correct users.
- User can open a notification and land on the correct detail item.
- Mark as read works for one notification.
- Mark all as read works.
- Read notifications do not count as unread.
- Non-relevant users do not receive private or unrelated notifications.

### Security And Regression

- MVP 1.1 smoke test still passes.
- B-003 actor spoof regression still fails safely.
- B-006 signed-out RLS regression still hides real work items.
- Notification queries respect RLS and user identity.
- No password, API key, token, session, or webhook secret is stored in frontend code or localStorage.

### Detail Collaboration

- Requester and assignee can add a link with URL and description after create.
- Added links appear in the work item detail view after refresh.
- Requester and assignee can add comments after create.
- Adding a link or comment creates a relevant event and notification.
- Unrelated users cannot add links or comments.

### Watchers

- Requester and assignee can add a watcher.
- Watcher appears under Assignee in the right-side detail panel.
- Watcher receives notifications for status changes, comments, and link additions.
- Watcher can view the work item.
- Watcher cannot change status only because they are a watcher.

### Admin Operations

- Admin can start / transition a Creative Request even if not the owner.
- Admin can archive any work item using soft delete/archive.
- Archived work items are hidden from normal active views.
- Admin archive preserves audit/history and does not hard-delete related records.
- Admin override actions are audited as the admin user.

### Panu Test View

- Panu can switch to View as Pond for read/test perspective.
- View as Pond does not mutate `auth.uid()` or backend actor identity.
- Any real action performed by Panu is audited as Panu.

## Data Model Direction

MVP 1.2 needs a backend notification table or an equivalent backend-owned store for Notification Center.

Recommended table concept:

- `notifications`
  - `id`
  - `recipient_user_id`
  - `work_item_id`
  - `event_type`
  - `title`
  - `body`
  - `read_at`
  - `created_at`
  - `metadata`

Backend rules:

- A user can read only their own notifications.
- A user can mark only their own notifications as read.
- Notifications should be created by trusted backend SQL/RPC logic, not by arbitrary frontend insert.
- Policies and RPCs must use `auth.uid()` for the signed-in user.
- Policies must not include `or public.current_app_user_id() is null`.
- Signed-out users must not read notification rows.

MVP 1.2 also needs backend-owned collaboration tables or equivalent storage.

Recommended table concepts:

- `work_item_links`
  - `id`
  - `work_item_id`
  - `url`
  - `description`
  - `created_by_user_id`
  - `created_at`
  - `deleted_at`
- `work_item_watchers`
  - `id`
  - `work_item_id`
  - `user_id`
  - `added_by_user_id`
  - `created_at`
  - `removed_at`

Backend rules:

- Requester, assignee, and admin can add links.
- Requester, assignee, and admin can add watchers.
- Watchers can read related work item data and receive notifications.
- Watchers do not gain edit/status rights from watcher status alone.
- Admin archive/delete should be implemented as soft archive, not permanent hard delete.
- Admin override and archive RPCs must use `auth.uid()` and audit the real admin actor.
- Panu View as Pond is frontend/test perspective only and must not alter backend identity.

## Realtime Direction

Recommended implementation:

- Subscribe to relevant Supabase Realtime channels for work item changes.
- Refresh affected view data after receiving a realtime event.
- Deduplicate realtime refreshes with a short debounce.
- Keep polling as fallback.
- Keep window focus refresh.

Avoid:

- Directly trusting frontend-supplied event payloads as final data.
- Removing polling fallback before realtime is proven stable.
- Rewriting the whole data loading layer in MVP 1.2.

## Calendar Direction

Recommended implementation:

- Add Calendar route/view to existing navigation.
- Reuse existing loaded work item fields where possible.
- Add small helper functions to group work items by date.
- Keep calendar interaction simple:
  - click item opens detail
  - filters narrow visible items
  - no drag/drop scheduling in MVP 1.2

## Risks And Edge Cases

- Supabase Realtime disconnects or auth session expires.
- Realtime plus polling causes duplicate refreshes.
- Multiple users edit the same item close together.
- Notification event is created twice.
- Notification points to an item the user can no longer access.
- Calendar timezone mismatch around due dates.
- Calendar becomes visually crowded on busy days.
- Workload refresh becomes too expensive if realtime triggers too often.
- Member manually opens an admin-only route after realtime refresh.

## Recommended Work Split

The work split below is planning guidance only. It does not expand MVP 1.2 scope.

### Revised Work Split - 2026-05-21

Use this revised split for the new collaboration/admin requirements.

### Chat A2 - Scope / UAT Update

Owns:

- Update MVP 1.2 PRD/UAT for collaboration, watchers, admin override, admin archive, and Panu View as Pond.

Files:

- `docs/MVP_1_2_SCOPE.md`
- `docs/MVP_1_2_UAT_CHECKLIST.md`
- `docs/MVP_1_2_WORK_SPLIT_PROMPTS.md`

### Chat D2 - Backend Collaboration + Admin Override

Owns:

- Link/comment/watcher backend contract.
- Notification recipients including requester, assignee, and watchers.
- Admin full access for status transition.
- Admin soft archive/delete.
- Panu View as Pond backend safety rule: no impersonated mutation.

Likely files:

- `supabase/*.sql`
- `supabase/README.md`
- `src/lib/flowmate.uat.test.ts`

### Chat E2 - Frontend Detail Collaboration + Notification Center

Owns:

- Detail UI for links, comments, watchers.
- Notification Center updates for watcher/link/comment events.
- Uses Chat D2 backend contract.

Likely files:

- `github/app.jsx`
- `github/screens-a.jsx`
- `github/screens-c.jsx`
- `github/supabase-list-data.js`
- `github/supabase-quick-task.js`
- `github/index.html`
- `src/lib/flowmate.uat.test.ts`

### Chat G - Admin Tools + Test View

Owns:

- Admin UI permissions for full access actions.
- Admin archive/delete action.
- Panu View as Pond read/test perspective.
- Audit expectations in UI/manual tests.

Likely files:

- `github/app.jsx`
- `github/screens-a.jsx`
- `github/screens-b.jsx`
- `github/screens-c.jsx`
- `github/supabase-quick-task.js`
- `src/lib/flowmate.uat.test.ts`

Recommended revised order:

1. Chat A2 updates scope/UAT/prompts.
2. Chat D2 implements backend collaboration/admin contract.
3. Chat E2 replaces the pending Chat E and implements frontend detail collaboration + notification center.
4. Chat G implements admin tools + Panu View as Pond.
5. Chat B updates realtime to refresh links, comments, watchers, and notifications.
6. Chat C verifies Calendar still works with archived items hidden from normal views.
7. Main Coordinator integrates and runs tests.
8. Chat F performs final QA/release.

Pause the old Chat E prompt. Use Chat E2 instead.

### Chat A - MVP 1.2 Scope / UAT

Owns:

- Final PRD.
- UAT checklist.
- Release gate.

Files:

- `docs/MVP_1_2_SCOPE.md`
- `docs/MVP_1_2_UAT_CHECKLIST.md`

### Chat B - Realtime

Owns:

- Realtime architecture.
- Frontend subscriptions.
- Polling fallback.
- Live/degraded status.

Likely files:

- `github/app.jsx`
- `github/supabase-list-data.js`
- `github/supabase-workload-data.js`
- `github/screens-a.jsx`
- `github/screens-b.jsx`
- `github/screens-c.jsx`
- `src/lib/flowmate.uat.test.ts`

### Chat C - Team Calendar

Owns:

- Calendar route.
- Month/agenda view.
- Calendar filters.
- Open detail from calendar item.

Likely files:

- `github/app.jsx`
- `github/screens-c.jsx`
- `github/data.jsx`
- `github/search-utils.js`
- `src/lib/flowmate.uat.test.ts`

### Chat D - Notification Backend

Owns:

- Notification SQL table/RLS/RPC.
- Event creation rules.
- Mark read / mark all read RPCs.

Likely files:

- `supabase/*.sql`
- `supabase/README.md`
- `src/lib/flowmate.uat.test.ts`

### Chat E - Notification Frontend

Owns:

- Notification Center UI.
- Unread count.
- Open detail.
- Mark read actions.

Likely files:

- `github/app.jsx`
- `github/screens-c.jsx`
- `github/supabase-quick-task.js`
- `src/lib/flowmate.uat.test.ts`

### Chat F - QA / Release

Owns:

- Full UAT pass.
- MVP 1.1 regression.
- B-003/B-006 security regression.
- Release candidate checklist.

Files:

- `docs/MVP_1_2_RELEASE_CANDIDATE_2026-05-20.md`
- `src/lib/flowmate.uat.test.ts`

## Release Gate

MVP 1.2 is ready only when:

- Automated tests pass.
- Realtime manual test passes with two browser sessions or two signed-in users.
- Realtime fallback test passes.
- Team Calendar manual test passes.
- Notification Center manual test passes.
- Detail links/comments/watchers manual test passes.
- Admin override and admin archive manual test passes.
- Panu View as Pond manual test passes.
- MVP 1.1 smoke test still passes.
- B-003 actor spoof regression still passes.
- B-006 RLS null bypass regression still passes.
- No secrets are added to frontend files.
- Users cannot read or mutate another user's notifications.
- Watchers cannot mutate status only because they are watchers.
- Admin archive preserves audit/history.
- Panu View as Pond does not impersonate Pond for mutations.
- Out-of-scope items remain absent from the release.

## Non-Goals For MVP 1.2

MVP 1.2 is not a reporting release, not an export release, and not a scheduling engine release.

The release should focus on live shared operations:

- live data,
- calendar visibility,
- relevant in-app notifications.
