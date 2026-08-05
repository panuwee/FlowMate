# FlowMate MVP 1.2 UAT Checklist

Date: 2026-05-20
Project: FlowMate
Deploy target: https://panuwee.github.io/FlowMate/
Baseline: MVP 1.1 release passed on 2026-05-19

## Purpose

Use this checklist before, during, and after MVP 1.2 implementation.

MVP 1.2 focuses on:

- Realtime Live Updates.
- Team Calendar.
- Notification Center.
- Detail Collaboration after create.
- Watchers.
- Admin Operations.
- Panu View as Pond for test perspective.

These areas are the complete MVP 1.2 scope after the 2026-05-21 update.

MVP 1.2 explicitly excludes:

- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email or browser push notifications.
- Hard delete that permanently removes audit/history.
- True account impersonation where Panu's actions are written as Pond.
- Watcher edit/status-change rights.

Do not add placeholder UI, backend code, or hidden configuration for the excluded items during MVP 1.2.

## Test Roles And Setup

Use separate browser sessions or profiles:

- Admin user: active app user with admin role.
- Member A: active non-admin app user.
- Member B: active non-admin app user.
- Requester: active app user who creates Creative Requests.
- Signed-out visitor: incognito/private window with no authenticated session.
- Panu admin user: admin user allowed to use View as Pond for test perspective.
- Pond user/profile: target perspective for Panu's View as Pond test.

Recommended manual setup:

- Keep two signed-in sessions open side by side for realtime tests.
- Use one known Quick Task assigned to Member A.
- Use one known Creative Request requested by Requester and assigned to Member B.
- Keep browser devtools available to inspect console errors and local storage when needed.

## Regression Tests Before Implementation

Run these before changing MVP 1.2 code. If any fail, fix the baseline first.

| ID | Area | Test Needed | Why It Matters |
|---|---|---|---|
| REG-201 | Automated tests | Run `npm.cmd test` and confirm all tests pass | Confirms MVP 1.1 baseline is clean |
| REG-202 | MVP 1.1 smoke | Login, My Work, create detail, draft restore, Workload, Admin Whitelist | Confirms MVP 1.2 starts from a passed release |
| REG-203 | B-003 actor spoof | Try creating/updating with another user's actor ID | Confirms client payload cannot spoof the authenticated actor |
| REG-204 | B-006 RLS null bypass | Query protected work data while signed out | Confirms anonymous users cannot read real work rows |
| REG-205 | Create Quick Task | Submit a normal Quick Task and open created detail | Confirms create path before realtime/calendar work |
| REG-206 | Create Creative Request | Submit a normal Creative Request and open created detail | Confirms assignment path before realtime/calendar work |
| REG-207 | Admin role gate | Non-admin cannot access Admin Whitelist | Confirms route gating is still correct |
| REG-208 | Existing comments | Existing comments load in detail view | Confirms collaboration work does not break current detail data |
| REG-209 | Admin status guard | Admin currently may hit owner-only guard | Confirms MVP 1.2 must intentionally add admin override instead of bypassing identity |

## UAT Cases

### UAT-201 - Realtime Status Change Appears In Other Session

Priority: P0

Preconditions:

- Member A is logged in in Browser A.
- Member B or Admin is logged in in Browser B.
- Both sessions can see the same work item.

Steps:

1. In Browser A, open a work item detail or Board card.
2. Change status from Assigned to In Progress.
3. Do not refresh Browser B.
4. Watch Board, My Work, Queue, or detail view in Browser B.

Expected result:

- Browser B shows the updated status within a few seconds.
- No manual refresh is required.
- No duplicate card appears.
- Console has no repeated realtime errors.
- Update comes from authenticated data refresh, not from trusting the realtime payload as final data.

Failure signals:

- Browser B stays stale until manual refresh.
- Browser B shows duplicate cards.
- App white-screens or logs repeated subscription errors.

### UAT-202 - Realtime Create Appears In Shared Views

Priority: P0

Preconditions:

- Member A and Member B are logged in separately.
- Both sessions are on Board, My Work, Queue, or Calendar.

Steps:

1. In Browser A, create a Quick Task assigned to Member B.
2. Do not refresh Browser B.
3. Check whether Browser B receives the new item in relevant views.

Expected result:

- The created item appears in Browser B within a few seconds.
- Member B can open the created detail.
- The item appears only once.

Failure signals:

- Item never appears until manual refresh.
- Item appears twice.
- Detail opens the wrong item.

### UAT-203 - Realtime Review / Approve Flow Updates Correctly

Priority: P0

Preconditions:

- Creative Request exists and is visible to requester and assignee.
- Two browser sessions are open.

Steps:

1. Assignee submits the Creative Request for review.
2. Requester watches the request without refreshing.
3. Requester approves or requests changes.
4. Assignee watches the item without refreshing.

Expected result:

- Requester sees Review state.
- Assignee sees Approved/Delivered or returned In Progress state.
- Review round behavior remains consistent with MVP 1.1 rules.

Failure signals:

- Requester does not see review state.
- Assignee sees stale status.
- Review round increments incorrectly.

### UAT-204 - Realtime Fallback Does Not Break App

Priority: P0

Preconditions:

- Tester can simulate realtime failure by blocking websocket/realtime connection or forcing offline/online transition.

Steps:

1. Open the app while signed in.
2. Simulate realtime disconnect.
3. Continue navigating My Work, Board, Workload, and Calendar.
4. Wait for polling/focus refresh.

Expected result:

- App does not white-screen.
- User sees a small live/degraded status.
- Polling or focus refresh still updates data.
- User can still create and update work.

Failure signals:

- App becomes unusable when realtime fails.
- Errors loop continuously and slow the app.
- Polling fallback stops working.

### UAT-205 - Realtime Does Not Break Signed-Out State

Priority: P0

Preconditions:

- Incognito/private browser has no authenticated session.

Steps:

1. Open the deployed app signed out.
2. Watch console/network briefly.
3. Attempt direct protected read if test tooling is available.

Expected result:

- No protected work data is visible.
- No realtime subscription exposes protected rows.
- Login screen remains usable.
- Signed-out state does not use `or public.current_app_user_id() is null` or any equivalent RLS bypass.

Failure signals:

- Signed-out session receives work item data.
- Console shows protected payloads.
- Login screen crashes due to missing session.

### UAT-206 - Team Calendar Loads

Priority: P0

Preconditions:

- User is logged in as an active allowed user.
- At least one Quick Task and one Creative Request have due dates.

Steps:

1. Open Team Calendar.
2. Check month view.
3. Select a day with work items.
4. Check agenda/list view.

Expected result:

- Calendar loads without blank page.
- Quick Tasks and Creative Requests are visible.
- Selected day agenda/list shows matching items.
- My Work, Board, Queue, and Workload still load after visiting Calendar.

Failure signals:

- Calendar white-screens.
- Other screens break after Calendar loads.
- Due-date items do not appear.

### UAT-207 - Calendar Uses Due Date Correctly

Priority: P0

Preconditions:

- Test items exist with known due dates.

Steps:

1. Create or find a Quick Task due on a known date.
2. Create or find a Creative Request due on a known date.
3. Open Team Calendar month view.

Expected result:

- Both items appear on their due dates.
- Date display is not off by one day.
- Timezone handling matches the app's existing due-date behavior.

Failure signals:

- Item appears one day early or late.
- Calendar uses created date instead of due date.
- Date formatting differs from detail view in a confusing way.

### UAT-208 - Creative Request Launch Date Is Visible

Priority: P1

Preconditions:

- Creative Request exists with both due date and launch date.

Steps:

1. Open Team Calendar.
2. Find the Creative Request.
3. Open or inspect the calendar item/agenda entry.

Expected result:

- Due date remains the primary calendar placement.
- Launch date is visible as supporting information where relevant.
- Launch date does not create duplicate confusing calendar entries unless clearly labelled.

Failure signals:

- Launch date hides or replaces due date.
- Item appears twice without explanation.
- Launch date is missing from detail/agenda where expected.

### UAT-209 - Calendar Filters Work

Priority: P0

Preconditions:

- Calendar has multiple items with different assignees, statuses, types, and priorities.

Steps:

1. Filter by assignee.
2. Filter by status.
3. Filter by type.
4. Filter by priority.
5. Clear filters.

Expected result:

- Calendar updates to show matching items only.
- Filtered results match Board/My Work data.
- Clearing filters restores all visible calendar items.

Failure signals:

- Filter returns wrong items.
- Clearing filters leaves stale results.
- Filter controls resize or overlap on smaller screens.

### UAT-210 - Calendar Item Opens Correct Detail

Priority: P0

Preconditions:

- Calendar shows at least one Quick Task and one Creative Request.

Steps:

1. Click Quick Task calendar item.
2. Confirm detail opens.
3. Return to Calendar.
4. Click Creative Request calendar item.

Expected result:

- Each click opens the correct detail item.
- Detail title/display ID matches the clicked calendar item.
- Back/navigation behavior remains understandable.

Failure signals:

- Detail opens wrong item.
- Detail opens stale hardcoded item.
- Calendar loses state in a confusing way after returning.

### UAT-211 - Calendar Shows Overdue And Due Soon Clearly

Priority: P1

Preconditions:

- Calendar has overdue, due-today, due-soon, and future items.

Steps:

1. Open Team Calendar.
2. Inspect month view and agenda/list view.

Expected result:

- Overdue items are visually distinct.
- Due-today/due-soon items are easy to identify.
- Visual treatment is readable and does not rely only on tiny text.

Failure signals:

- Overdue and normal items look identical.
- Labels overlap item titles.
- Color choices make text hard to read.

### UAT-212 - Notification Center Opens And Counts Unread

Priority: P0

Preconditions:

- User is logged in.
- User has at least one unread notification.

Steps:

1. Open the app top bar.
2. Check Notifications button.
3. Open Notification Center.

Expected result:

- Notifications button is enabled.
- Unread count is visible.
- Notification Center opens without white-screen.
- Notifications are ordered newest first.

Failure signals:

- Button remains disabled.
- Count is missing or wrong.
- Notification Center crashes.

### UAT-213 - Assigned Work Creates Notification

Priority: P0

Preconditions:

- Member A and Member B are logged in separately.

Steps:

1. Member A or Admin creates/assigns a work item to Member B.
2. Member B opens Notification Center.

Expected result:

- Member B receives an assigned-work notification.
- Notification links to the correct detail item.
- Unrelated users do not receive the notification.

Failure signals:

- Assigned user receives no notification.
- All users receive the notification.
- Notification opens wrong item.

### UAT-214 - Review Requested Creates Notification For Requester

Priority: P0

Preconditions:

- Creative Request exists with requester and assignee.

Steps:

1. Assignee submits the request for review.
2. Requester opens Notification Center.

Expected result:

- Requester sees review-requested notification.
- Notification opens the correct request detail.
- Notification message is understandable without raw status codes.

Failure signals:

- Requester receives no notification.
- Wrong user receives notification.
- Notification uses unclear technical wording.

### UAT-215 - Comment Creates Relevant Notification

Priority: P1

Preconditions:

- Work item has requester and assignee.
- Comments are available.

Steps:

1. User A comments on a work item relevant to User B.
2. User B opens Notification Center.

Expected result:

- User B receives comment notification.
- Comment author does not receive a redundant notification for their own comment.
- Notification opens the work item detail.

Failure signals:

- Comment author receives self-notification only.
- Relevant user receives no notification.
- Notification exposes comments to unrelated user.

### UAT-216 - Mark One Notification As Read

Priority: P0

Preconditions:

- User has at least two unread notifications.

Steps:

1. Open Notification Center.
2. Mark one notification as read.
3. Check unread count.
4. Refresh page.

Expected result:

- Only selected notification becomes read.
- Unread count decreases by one.
- Read state persists after refresh.

Failure signals:

- All notifications become read.
- Count does not update.
- Read state is lost after refresh.

### UAT-217 - Mark All Notifications As Read

Priority: P1

Preconditions:

- User has multiple unread notifications.

Steps:

1. Open Notification Center.
2. Click Mark all as read.
3. Refresh page.

Expected result:

- All current unread notifications become read.
- Unread count becomes zero.
- No unrelated user's notifications are changed.

Failure signals:

- Count remains nonzero.
- Other user's notifications are modified.
- Mark all action fails silently.

### UAT-218 - Notification RLS Blocks Other Users

Priority: P0

Preconditions:

- User A and User B both have notifications.
- Tester can query notifications directly or use browser sessions.

Steps:

1. Log in as User A.
2. Try to view User B's notifications by direct query or route manipulation.
3. Try to mark User B's notification as read.

Expected result:

- User A cannot read User B's notifications.
- User A cannot mark User B's notifications as read.
- Backend rejects unauthorized mutation.
- Read and mark-read logic uses `auth.uid()` on the backend.
- Frontend-supplied actor IDs or recipient IDs are not trusted for authorization.

Failure signals:

- Notification rows from other users are visible.
- Direct mutation succeeds.
- Frontend-only route guard is the only protection.

### UAT-219 - Notification Deduplication Is Controlled

Priority: P1

Preconditions:

- Realtime and polling are both active.

Steps:

1. Trigger one workflow event such as assigned or review requested.
2. Open Notification Center.
3. Refresh the app.

Expected result:

- One workflow event creates no more than one unread notification per intended recipient and event target.
- Refreshing the app does not create additional notifications for the same event.

Failure signals:

- One action creates repeated notifications.
- Notification list becomes noisy after polling/realtime refresh.

### UAT-220 - Notification Center Empty State

Priority: P2

Preconditions:

- User has no notifications or all notifications are read.

Steps:

1. Open Notification Center.
2. Toggle or view read/all state if available.

Expected result:

- Empty state is clear.
- UI does not imply an error.
- User can close the panel and continue work.

Failure signals:

- Blank panel with no explanation.
- Error state appears for normal empty data.

### UAT-221 - No Secrets In Frontend Or Storage

Priority: P0

Preconditions:

- MVP 1.2 files are ready.
- Browser devtools and file search are available.

Steps:

1. Search frontend files for password, token, secret, service role, webhook, API key values.
2. Use app and inspect localStorage/sessionStorage.
3. Check Notification Center and realtime logic.

Expected result:

- No service-role key or secret exists in `github/` or browser storage.
- Notification and realtime logic use normal authenticated Supabase session only.
- No webhook secret exists because webhook is out of scope.

Failure signals:

- Secret/token is hardcoded in frontend.
- Full session/user object is stored by new feature logic.
- Debug payloads leak private data.

### UAT-222 - Requester Can Add Link After Create

Priority: P0

Preconditions:

- User is logged in as requester for a work item.
- Work item already exists.

Steps:

1. Open the work item detail.
2. Add a link with URL and description.
3. Refresh the page.

Expected result:

- Link appears in the detail view.
- Description appears with the link.
- Link shows creator and timestamp if UI supports it.
- Link addition creates a work item event.

Failure signals:

- Link disappears after refresh.
- Description is not saved.
- Link is saved without audit/event trail.
- Unclear or raw database error appears.

### UAT-223 - Assignee Can Add Link After Create

Priority: P0

Preconditions:

- User is logged in as assignee for a work item.
- Work item already exists.

Steps:

1. Open the work item detail.
2. Add a link with URL and description.
3. Refresh the page.

Expected result:

- Assignee can add link successfully.
- Link persists after refresh.
- Requester and watchers can see the link if they can view the item.

Failure signals:

- Owner/assignee is blocked from adding link.
- Link is visible only to the creator when it should be item context.

### UAT-224 - Unrelated User Cannot Add Link Or Comment

Priority: P0

Preconditions:

- User is logged in but is not requester, assignee, watcher, or admin for the target item.

Steps:

1. Try to open or mutate the target item through direct URL/API if available.
2. Try to add link.
3. Try to add comment.

Expected result:

- User cannot add link.
- User cannot add comment.
- Backend rejects unauthorized mutation.
- Frontend-only hiding is not the only protection.

Failure signals:

- Direct RPC/API mutation succeeds.
- Link/comment appears on unrelated item.

### UAT-225 - Comment Zone Works After Create

Priority: P0

Preconditions:

- Requester or assignee is logged in.
- Work item already exists.

Steps:

1. Open work item detail.
2. Add a comment.
3. Refresh the page.
4. Add another comment from the other related user if possible.

Expected result:

- Comment appears after submit.
- Comment persists after refresh.
- Comment author and time are clear.
- Relevant users can see the comment.

Failure signals:

- Comment disappears after refresh.
- Comment author is wrong.
- Comment creates duplicate rows.

### UAT-226 - Requester Or Assignee Can Add Watcher

Priority: P0

Preconditions:

- Requester or assignee is logged in.
- Target watcher is an active app user.

Steps:

1. Open work item detail.
2. Add watcher.
3. Refresh the page.

Expected result:

- Watcher appears under Assignee in the right-side detail panel.
- Watcher persists after refresh.
- Watcher can view the work item.
- Add watcher creates event/audit trail.

Failure signals:

- Watcher is not saved.
- Watcher appears in wrong location.
- Inactive or unknown user can be added without clear validation.

### UAT-227 - Watcher Receives Status Change Notification

Priority: P0

Preconditions:

- Watcher is added to a work item.
- Assignee/requester/admin can change status.

Steps:

1. Change the work item status.
2. Log in as watcher.
3. Open Notification Center.

Expected result:

- Watcher receives status-change notification.
- Notification opens the correct detail.
- Requester and assignee still receive their expected notifications.

Failure signals:

- Watcher receives no notification.
- Notification opens wrong item.
- Unrelated users receive the notification.

### UAT-228 - Watcher Receives Comment And Link Notifications

Priority: P0

Preconditions:

- Watcher is added to a work item.

Steps:

1. Requester or assignee adds a comment.
2. Requester or assignee adds a link.
3. Log in as watcher.
4. Open Notification Center.

Expected result:

- Watcher receives comment notification.
- Watcher receives link-added notification.
- Both notifications open the correct detail.

Failure signals:

- Watcher receives no notifications.
- One action creates many duplicates.
- Notification exposes unrelated private content.

### UAT-229 - Watcher Is Read-Only For Status

Priority: P0

Preconditions:

- User is a watcher but not requester, assignee, owner, or admin.

Steps:

1. Open the watched item.
2. Try to change status through UI if visible.
3. Try direct RPC/API status mutation if available.

Expected result:

- Watcher can view relevant detail.
- Watcher cannot change status only because they are watcher.
- Backend rejects unauthorized mutation.

Failure signals:

- Watcher can start/review/approve/cancel work only from watcher status.

### UAT-230 - Admin Can Start Creative Work Without Being Owner

Priority: P0

Preconditions:

- Admin is logged in.
- Creative Request is assigned to another owner.

Steps:

1. Admin opens Creative Request detail.
2. Admin moves status to In Progress.

Expected result:

- Status transition succeeds.
- Admin is not blocked by "Only owner can start this work."
- Event/audit actor is the admin user.

Failure signals:

- Admin still sees owner-only error.
- Backend records the owner as actor instead of admin.
- Non-admin owner checks are removed for everyone.

### UAT-231 - Admin Can Soft Archive Any Task

Priority: P0

Preconditions:

- Admin is logged in.
- Test Quick Task or Creative Request exists.

Steps:

1. Admin opens item detail.
2. Admin chooses archive/delete action.
3. Confirm action if confirmation exists.
4. Check normal active views.
5. Check audit/history if available.

Expected result:

- Item is archived/soft deleted.
- Item is hidden from normal active views.
- Related audit/comments/links/notifications are preserved.
- Action is audited as admin.

Failure signals:

- Item is permanently hard deleted.
- Audit/history disappears.
- Non-admin can perform archive.

### UAT-232 - Admin Archive Does Not Break References

Priority: P1

Preconditions:

- Item has comments, links, watchers, and notifications.
- Admin archives the item.

Steps:

1. Archive the item as admin.
2. Open Notification Center with existing notifications.
3. Try to open archived item from old notification.

Expected result:

- App handles archived item gracefully.
- Notification does not crash the app.
- Admin can still inspect archived item if archive viewer exists; otherwise user sees clear archived/unavailable state.

Failure signals:

- Notification click white-screens.
- Archived item references break data loading.

### UAT-233 - Panu Can View As Pond

Priority: P0

Preconditions:

- Panu is logged in as admin.
- Pond exists as active app user/team member.

Steps:

1. Panu enables View as Pond.
2. Open My Work, Board, Calendar, or Workload perspective.
3. Disable View as Pond.

Expected result:

- UI clearly indicates Panu is viewing as Pond.
- Visible perspective matches Pond-oriented filters where implemented.
- Disabling returns to Panu/admin perspective.
- No backend auth identity changes.

Failure signals:

- UI hides that test view is active.
- View as Pond changes persisted role/user identity.

### UAT-234 - Panu Actions Are Audited As Panu

Priority: P0

Preconditions:

- Panu is in View as Pond mode.
- Panu has admin override permission.

Steps:

1. While viewing as Pond, perform an admin action such as status override on a test item.
2. Check activity/audit event.

Expected result:

- Mutation succeeds only through admin override rules.
- Audit actor is Panu.
- Audit metadata may mention test view if supported.
- Actor is not recorded as Pond.

Failure signals:

- Mutation actor is Pond.
- Backend trusts a frontend "view as" user as actor.
- B-003 spoof protection is weakened.

## Upload And Deploy Smoke Checklist

Run after manual GitHub web UI upload and GitHub Pages deployment.

| ID | Check | Expected Result |
|---|---|---|
| SMOKE-201 | Open deployed URL with cache buster | App loads without blank page |
| SMOKE-202 | Google Login | Active allowed user enters app |
| SMOKE-203 | My Work | Existing work loads correctly |
| SMOKE-204 | Board | Board loads and status columns are correct |
| SMOKE-205 | Realtime two-session test | Status change appears without manual refresh |
| SMOKE-206 | Realtime fallback | App still works when realtime is blocked/degraded |
| SMOKE-207 | Calendar | Team Calendar loads month and agenda/list |
| SMOKE-208 | Calendar filters | Assignee/status/type/priority filters work |
| SMOKE-209 | Calendar detail open | Calendar item opens correct detail |
| SMOKE-210 | Notifications | Notification Center opens and unread count appears |
| SMOKE-211 | Notification read action | Mark read / mark all read works |
| SMOKE-212 | MVP 1.1 create flow | Quick Task and Creative Request still open created detail |
| SMOKE-213 | MVP 1.1 draft flow | Draft restore and clear still work |
| SMOKE-214 | Admin gate | Admin Whitelist still admin-only |
| SMOKE-215 | Signed-out read | Signed-out user cannot see protected work data |
| SMOKE-216 | Link after create | Requester/assignee can add link and description |
| SMOKE-217 | Watcher | Watcher appears under Assignee and receives notification |
| SMOKE-218 | Admin override | Admin can move non-owned Creative Request to In Progress |
| SMOKE-219 | Admin archive | Admin can soft archive a test task |
| SMOKE-220 | View as Pond | Panu can view as Pond, but actions audit as Panu |

## Release Stop Criteria

Do not release MVP 1.2 if any of these happen:

- B-003 actor spoof regression fails.
- B-006 RLS null bypass regression fails.
- Signed-out user receives realtime work data.
- Notification RLS exposes another user's notifications.
- Notification mutation can mark another user's notification as read.
- Notification backend trusts frontend-supplied actor ID or recipient ID for authorization.
- Any RLS policy adds `or public.current_app_user_id() is null` or an equivalent signed-out bypass.
- Realtime failure white-screens or blocks normal app usage.
- Calendar opens the wrong detail item.
- Calendar due dates are off by one day.
- Watcher can change status only because they are watcher.
- Admin archive hard-deletes records or removes audit/history.
- Admin override records actor as the original owner instead of admin.
- Panu View as Pond records mutations as Pond.
- Secrets are added to frontend files or browser storage.
- SEA Enterprise Webhook integration, Saved Filters Lite, or Full CSV export is added to MVP 1.2.
- Automated tests fail and the reason is not understood.

## Automated Test Candidates

Add tests where code has a pure function or low-risk boundary.

- Realtime channel setup source includes fallback/polling status handling.
- Calendar date grouping uses due date and avoids off-by-one parsing.
- Calendar filter helper filters by assignee, status, type, and priority.
- Calendar detail target uses the real work item display ID.
- Notification SQL creates RLS policies for recipient-only reads.
- Notification SQL exposes mark-read RPCs that use `auth.uid()`.
- Notification frontend does not keep Notifications button disabled.
- Notification read/unread count logic excludes read notifications.
- No new code contains webhook integration after scope changed to Notification Center.
- Link/comment/watchers SQL uses `auth.uid()` and scoped policies.
- Watcher notification coverage includes status, comment, and link events.
- Admin override RPCs check `public.is_admin_app_user()`.
- Admin archive uses soft archive fields/status rather than hard delete.
- Panu View as Pond helper is frontend perspective only and not used as backend actor.

Avoid brittle automated tests that depend on live Supabase data or GitHub Pages deployment state. Test live behavior manually with the UAT cases above.

## SQL Run Order

MVP 1.2 is expected to include SQL for Notification Center.

If SQL files are added during implementation, the final release notes must list the exact SQL filenames in the order they must be run.

Expected direction:

1. Existing MVP 1.1 SQL baseline remains applied.
2. Run new MVP 1.2 notification/collaboration/admin SQL after existing security hardening scripts.
3. Rerun B-003 and B-006 security checks after all SQL is applied.
