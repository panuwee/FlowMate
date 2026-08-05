# FlowMate MVP 1.2 Work Split + Chat Prompts

Date: 2026-05-21
Project: `C:\Users\panuwee.w\Documents\New project 2`
Deploy target: https://panuwee.github.io/FlowMate/
Baseline: MVP 1.1 release passed on 2026-05-19

## MVP 1.2 Theme

Live Operations View.

MVP 1.2 focuses on:

- Realtime Live Updates.
- Team Calendar.
- Notification Center.
- Detail Collaboration after create.
- Watchers.
- Admin Operations.
- Panu View as Pond for test perspective.

MVP 1.2 excludes:

- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email notifications.
- Browser push notifications.
- Calendar drag-to-reschedule.
- Hard delete that permanently removes audit/history.
- True account impersonation where Panu's actions are written as Pond.
- Watcher edit/status-change rights.

## Main Coordinator Rules

Use the current chat as Main Coordinator.

Main Coordinator owns:

- Scope decisions.
- File conflict review.
- SQL run order.
- Final automated test run.
- Final upload list for GitHub web UI.
- Release candidate / release passed docs.

Worker chats should each own one bounded workstream.

## 2026-05-21 Scope Update

New decisions:

- Admin delete must be soft delete/archive, not hard delete.
- Watchers are read-only in MVP 1.2: they can view and receive notifications, but cannot change status only because they are watchers.
- Panu View as Pond is read/test perspective only. Real actions still use Panu's authenticated identity and must audit as Panu.
- Chat E from the original plan is paused. Use Chat E2 instead.

## Recommended Chat Split

| Chat | Purpose | Can Edit | Must Not Edit |
|---|---|---|---|
| Chat A - Scope/UAT Review | Review MVP 1.2 PRD and UAT, adjust docs only | `docs/MVP_1_2_SCOPE.md`, `docs/MVP_1_2_UAT_CHECKLIST.md` | `github/`, `supabase/`, `src/` unless adding doc-only test notes |
| Chat B - Realtime | Supabase Realtime subscriptions, fallback, live/degraded status | `github/app.jsx`, `github/supabase-list-data.js`, `github/supabase-workload-data.js`, `github/screens-a.jsx`, `github/screens-b.jsx`, `github/screens-c.jsx`, `src/lib/flowmate.uat.test.ts` | `supabase/` |
| Chat C - Team Calendar | Calendar route, month view, agenda/list, filters, open detail | `github/app.jsx`, `github/screens-c.jsx`, `github/data.jsx`, `github/search-utils.js`, `github/index.html`, `src/lib/flowmate.uat.test.ts` | `supabase/` |
| Chat D - Notification Backend | Notification table/RLS/RPC/event creation SQL | `supabase/*.sql`, `supabase/README.md`, `src/lib/flowmate.uat.test.ts` | `github/` |
| Chat E - Notification Frontend | Notification Center UI, unread count, open detail, mark read | `github/app.jsx`, `github/screens-c.jsx`, `github/supabase-quick-task.js`, `github/index.html`, `src/lib/flowmate.uat.test.ts` | `supabase/` except consuming Chat D RPC names |
| Chat F - QA/Release | Final UAT, security regression, release docs | `docs/MVP_1_2_RELEASE_CANDIDATE_*.md`, `docs/MVP_1_2_RELEASE_PASSED_*.md`, `src/lib/flowmate.uat.test.ts` | Feature implementation files unless fixing test/docs only |
| Chat A2 - Scope/UAT Update | Update docs for new collaboration/admin requirements | `docs/MVP_1_2_SCOPE.md`, `docs/MVP_1_2_UAT_CHECKLIST.md`, `docs/MVP_1_2_WORK_SPLIT_PROMPTS.md` | `github/`, `supabase/`, `src/` |
| Chat D2 - Backend Collaboration + Admin Override | Links, watchers, notifications, admin override/archive SQL/RPC | `supabase/*.sql`, `supabase/README.md`, `src/lib/flowmate.uat.test.ts` | `github/` |
| Chat E2 - Frontend Detail Collaboration + Notification Center | Link/comment/watcher UI and notification UI using D2 contract | `github/app.jsx`, `github/screens-a.jsx`, `github/screens-c.jsx`, `github/supabase-list-data.js`, `github/supabase-quick-task.js`, `github/index.html`, `src/lib/flowmate.uat.test.ts` | `supabase/` |
| Chat G - Admin Tools + Test View | Admin override/archive UI and Panu View as Pond | `github/app.jsx`, `github/screens-a.jsx`, `github/screens-b.jsx`, `github/screens-c.jsx`, `github/supabase-quick-task.js`, `src/lib/flowmate.uat.test.ts` | `supabase/` unless consuming D2 RPC names |

## Recommended Order

1. Chat A reviews and finalizes PRD/UAT.
2. Chat D implements Notification Backend because Chat E depends on RPC/table contract.
3. Chat B implements Realtime.
4. Chat C implements Team Calendar.
5. Chat E implements Notification Frontend.
6. Main Coordinator integrates, resolves conflicts, and runs tests.
7. Chat F performs final QA/release checklist if needed.

If Chat B and Chat C run in parallel, Main Coordinator must review `github/app.jsx` conflicts carefully.

## Revised Recommended Order - 2026-05-21

Use this order after the collaboration/admin scope update:

1. Chat A2 updates PRD/UAT/prompts.
2. Chat D2 implements backend collaboration + admin override/archive.
3. Chat E2 replaces the old Chat E and implements frontend detail collaboration + notification center.
4. Chat G implements admin tools + Panu View as Pond.
5. Chat B updates realtime to refresh links, comments, watchers, notifications, and archived state.
6. Chat C verifies Team Calendar hides archived items from normal active views and still opens correct details.
7. Main Coordinator integrates, checks conflicts, runs tests, and confirms SQL run order.
8. Chat F performs final QA/release review.

## Shared Rules For Every Chat

Paste this block at the top of every worker chat.

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.1 release passed on 2026-05-19.
- MVP 1.0 security baseline remains passed.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Latest known automated tests are 82/82 passing.

MVP 1.2 scope:
- Realtime Live Updates.
- Team Calendar.
- Notification Center.
- Detail Collaboration after create.
- Watchers.
- Admin Operations.
- Panu View as Pond for test perspective.

Out of scope:
- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email notifications.
- Browser push notifications.
- Calendar drag-to-reschedule.
- Major visual redesign.
- Hard delete that permanently removes audit/history.
- True account impersonation where Panu's actions are written as Pond.
- Watcher edit/status-change rights.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, service-role keys, tokens, sessions, or secrets in files.
- Do not add secrets to frontend JS or browser localStorage/sessionStorage.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Security:
- Use `auth.uid()` for backend identity.
- Do not trust client-supplied actor IDs.
- Do not add `or public.current_app_user_id() is null` to RLS policies.
- Signed-out users must not read protected work rows.
- Users must not read or mutate other users' notifications.
- Watchers must not gain status-change rights only from watcher status.
- Admin override/archive must audit the real admin actor.
- Panu View as Pond must not alter backend actor identity.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
- Include manual checks needed.
```

## Chat A Prompt - MVP 1.2 Scope/UAT Review

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.1 release passed on 2026-05-19.
- MVP 1.0 security baseline remains passed.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Latest known automated tests are 82/82 passing.

MVP 1.2 scope:
- Realtime Live Updates.
- Team Calendar.
- Notification Center.

Out of scope:
- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email notifications.
- Browser push notifications.
- Calendar drag-to-reschedule.
- Major visual redesign.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, service-role keys, tokens, sessions, or secrets in files.
- Do not add secrets to frontend JS or browser localStorage/sessionStorage.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Security:
- Use `auth.uid()` for backend identity.
- Do not trust client-supplied actor IDs.
- Do not add `or public.current_app_user_id() is null` to RLS policies.
- Signed-out users must not read protected work rows.
- Users must not read or mutate other users' notifications.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
- Include manual checks needed.

Role: Product + QA + senior software engineer.

Task:
Review and tighten the MVP 1.2 PRD/UAT documents.

Files allowed to edit:
- `docs/MVP_1_2_SCOPE.md`
- `docs/MVP_1_2_UAT_CHECKLIST.md`

Files not allowed to edit:
- `github/`
- `supabase/`
- `src/`

Required checks:
- Confirm MVP 1.2 scope is Realtime + Team Calendar + Notification Center.
- Confirm Webhook, Saved Filters, and CSV export are out of scope.
- Confirm UAT covers realtime, fallback, calendar, notification center, B-003, B-006, and secrets.
- Remove vague wording or contradictions.

Final answer must include:
- What changed.
- Exact files to upload.
- Whether implementation can start.
```

## Chat B Prompt - Realtime Live Updates

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.1 release passed on 2026-05-19.
- MVP 1.0 security baseline remains passed.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Latest known automated tests are 82/82 passing.

MVP 1.2 scope:
- Realtime Live Updates.
- Team Calendar.
- Notification Center.

Out of scope:
- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email notifications.
- Browser push notifications.
- Calendar drag-to-reschedule.
- Major visual redesign.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, service-role keys, tokens, sessions, or secrets in files.
- Do not add secrets to frontend JS or browser localStorage/sessionStorage.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Security:
- Use `auth.uid()` for backend identity.
- Do not trust client-supplied actor IDs.
- Do not add `or public.current_app_user_id() is null` to RLS policies.
- Signed-out users must not read protected work rows.
- Users must not read or mutate other users' notifications.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
- Include manual checks needed.

Role: Frontend realtime engineer.

Task:
Implement MVP 1.2 Realtime Live Updates with fallback.

Files allowed to edit:
- `github/app.jsx`
- `github/supabase-list-data.js`
- `github/supabase-workload-data.js`
- `github/screens-a.jsx`
- `github/screens-b.jsx`
- `github/screens-c.jsx`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.uat.test.ts` for focused regression tests

Files not allowed to edit:
- `supabase/`
- `docs/`

Required behavior:
- Use Supabase Realtime where available.
- Keep polling and focus refresh as fallback.
- Debounce refresh triggered by realtime events.
- Show connected/degraded/live status without blocking work.
- Do not white-screen when realtime fails.
- Do not expose protected data to signed-out users.

Manual checks required:
- Two browser/session status change updates without manual refresh.
- Realtime blocked/degraded fallback still works.
- Signed-out session sees no work data.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Manual checks still needed.
```

## Chat C Prompt - Team Calendar

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.1 release passed on 2026-05-19.
- MVP 1.0 security baseline remains passed.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Latest known automated tests are 82/82 passing.

MVP 1.2 scope:
- Realtime Live Updates.
- Team Calendar.
- Notification Center.

Out of scope:
- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email notifications.
- Browser push notifications.
- Calendar drag-to-reschedule.
- Major visual redesign.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, service-role keys, tokens, sessions, or secrets in files.
- Do not add secrets to frontend JS or browser localStorage/sessionStorage.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Security:
- Use `auth.uid()` for backend identity.
- Do not trust client-supplied actor IDs.
- Do not add `or public.current_app_user_id() is null` to RLS policies.
- Signed-out users must not read protected work rows.
- Users must not read or mutate other users' notifications.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
- Include manual checks needed.

Role: Frontend product engineer.

Task:
Implement MVP 1.2 Team Calendar.

Files allowed to edit:
- `github/app.jsx`
- `github/screens-c.jsx`
- `github/data.jsx`
- `github/search-utils.js`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.uat.test.ts` for focused regression tests

Files not allowed to edit:
- `supabase/`
- `docs/`

Required behavior:
- Add Calendar route/view to navigation.
- Show Quick Tasks and Creative Requests.
- Use due date as primary calendar placement.
- Show Creative Request launch date as supporting info where useful.
- Provide month view and agenda/list for selected day or week.
- Filter by assignee, status, type, and priority.
- Click calendar item to open correct detail.
- Show overdue and due-soon clearly.
- No drag-to-reschedule in MVP 1.2.

Manual checks required:
- Calendar loads and other screens still work.
- Due date is not off by one day.
- Filters work.
- Calendar item opens correct detail.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Manual checks still needed.
```

## Chat D Prompt - Notification Backend

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.1 release passed on 2026-05-19.
- MVP 1.0 security baseline remains passed.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Latest known automated tests are 82/82 passing.

MVP 1.2 scope:
- Realtime Live Updates.
- Team Calendar.
- Notification Center.

Out of scope:
- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email notifications.
- Browser push notifications.
- Calendar drag-to-reschedule.
- Major visual redesign.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, service-role keys, tokens, sessions, or secrets in files.
- Do not add secrets to frontend JS or browser localStorage/sessionStorage.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Security:
- Use `auth.uid()` for backend identity.
- Do not trust client-supplied actor IDs.
- Do not add `or public.current_app_user_id() is null` to RLS policies.
- Signed-out users must not read protected work rows.
- Users must not read or mutate other users' notifications.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
- Include manual checks needed.

Role: Supabase backend engineer.

Task:
Implement MVP 1.2 Notification Center backend.

Files allowed to edit:
- `supabase/*.sql`
- `supabase/README.md`
- `src/lib/flowmate.uat.test.ts` for SQL text regression tests

Files not allowed to edit:
- `github/`
- `docs/`

Required behavior:
- Add notification table or equivalent backend model.
- Users can read only their own notifications.
- Users can mark only their own notifications as read.
- Add RPCs for mark one read and mark all read.
- Create notifications from trusted backend SQL/RPC logic, not arbitrary frontend insert.
- Cover event types: assigned, status changed, review requested, approved/changes requested, blocked, resumed, cancelled, due soon/overdue if feasible, comment created.
- Keep SQL idempotent where practical.
- Do not add webhook integration.

Required security checks:
- Use `auth.uid()`.
- No null-bypass RLS.
- No broad insert/update/delete grants that let users write other users' notifications.

Final answer must include:
- What changed.
- SQL run order.
- Tests run and result.
- Exact files to upload.
- Manual Supabase checks needed.
```

## Chat E Prompt - Notification Frontend

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.1 release passed on 2026-05-19.
- MVP 1.0 security baseline remains passed.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Latest known automated tests are 82/82 passing.

MVP 1.2 scope:
- Realtime Live Updates.
- Team Calendar.
- Notification Center.

Out of scope:
- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email notifications.
- Browser push notifications.
- Calendar drag-to-reschedule.
- Major visual redesign.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, service-role keys, tokens, sessions, or secrets in files.
- Do not add secrets to frontend JS or browser localStorage/sessionStorage.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Security:
- Use `auth.uid()` for backend identity.
- Do not trust client-supplied actor IDs.
- Do not add `or public.current_app_user_id() is null` to RLS policies.
- Signed-out users must not read protected work rows.
- Users must not read or mutate other users' notifications.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
- Include manual checks needed.

Role: Frontend implementation engineer.

Task:
Implement MVP 1.2 Notification Center frontend using Chat D backend contract.

Files allowed to edit:
- `github/app.jsx`
- `github/screens-c.jsx`
- `github/supabase-quick-task.js`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.uat.test.ts` for focused regression tests

Files not allowed to edit:
- `supabase/`
- `docs/`

Required behavior:
- Enable the current Notifications button.
- Show unread count.
- Open Notification Center panel/view.
- Show relevant notifications for signed-in user.
- Click notification to open correct detail.
- Mark one notification as read.
- Mark all notifications as read.
- Read notifications do not count as unread.
- Empty state is clear.
- Do not store notification secrets or auth data in localStorage.

Manual checks required:
- Assigned work notification appears for the correct user.
- Review requested notification appears for requester.
- Mark one/read all works.
- User cannot see another user's notifications.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Manual checks still needed.
```

## Chat F Prompt - QA / Release

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.1 release passed on 2026-05-19.
- MVP 1.0 security baseline remains passed.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Latest known automated tests are 82/82 passing.

MVP 1.2 scope:
- Realtime Live Updates.
- Team Calendar.
- Notification Center.

Out of scope:
- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email notifications.
- Browser push notifications.
- Calendar drag-to-reschedule.
- Major visual redesign.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, service-role keys, tokens, sessions, or secrets in files.
- Do not add secrets to frontend JS or browser localStorage/sessionStorage.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Security:
- Use `auth.uid()` for backend identity.
- Do not trust client-supplied actor IDs.
- Do not add `or public.current_app_user_id() is null` to RLS policies.
- Signed-out users must not read protected work rows.
- Users must not read or mutate other users' notifications.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
- Include manual checks needed.

Role: QA engineer + release coordinator.

Task:
Run MVP 1.2 QA/release review after implementation chats are complete.

Files allowed to edit:
- `docs/MVP_1_2_RELEASE_CANDIDATE_2026-05-20.md`
- `docs/MVP_1_2_RELEASE_PASSED_2026-05-20.md` only after user confirms deployed smoke test passed
- `src/lib/flowmate.uat.test.ts` only for focused test coverage

Files not allowed to edit:
- Feature implementation files unless Main Coordinator explicitly asks.

Required checks:
- Run automated tests.
- Check final SQL run order.
- Verify Realtime UAT.
- Verify Calendar UAT.
- Verify Notification Center UAT.
- Rerun MVP 1.1 smoke.
- Rerun B-003 and B-006.
- Check no secrets in frontend files.

Final answer must include:
- Pass/fail status.
- Test results.
- SQL run order.
- Exact files to upload.
- Any release blockers.
```

## Chat A2 Prompt - Scope/UAT Update

```md
Use the Shared Rules For Every Chat block from `docs/MVP_1_2_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Product + QA + senior software engineer.

Task:
Update MVP 1.2 planning docs for the 2026-05-21 collaboration/admin scope change.

Files allowed to edit:
- `docs/MVP_1_2_SCOPE.md`
- `docs/MVP_1_2_UAT_CHECKLIST.md`
- `docs/MVP_1_2_WORK_SPLIT_PROMPTS.md`

Files not allowed to edit:
- `github/`
- `supabase/`
- `src/`

Required decisions already locked:
- Admin delete must be soft delete/archive, not hard delete.
- Watchers are read-only: view + receive notifications only.
- Panu View as Pond is read/test perspective only.
- Any real action by Panu must audit as Panu.
- Old Chat E is paused; use Chat E2.

Required output:
- Scope includes Detail Collaboration after create.
- Scope includes Watchers under Assignee.
- Scope includes Admin full access for status transitions.
- Scope includes Admin soft archive/delete.
- Scope includes Panu View as Pond for test perspective.
- UAT covers links, comments, watchers, watcher notifications, admin override, admin archive, and Panu View as Pond.
- Work split prompts include A2, D2, E2, and G.

Final answer must include:
- What changed.
- Exact files to upload.
- Whether Chat D2 can start.
```

## Chat D2 Prompt - Backend Collaboration + Admin Override

```md
Use the Shared Rules For Every Chat block from `docs/MVP_1_2_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Supabase backend engineer.

Task:
Implement MVP 1.2 backend support for Detail Collaboration, Watchers, Admin Operations, and notification recipients.

Files allowed to edit:
- `supabase/*.sql`
- `supabase/README.md`
- `src/lib/flowmate.uat.test.ts` for SQL text regression tests

Files not allowed to edit:
- `github/`
- `docs/` unless only updating SQL run order in README if assigned

Required backend behavior:
- Add backend model/RPCs for work item links:
  - URL
  - description
  - created_by_user_id from `auth.uid()`
  - created_at
  - soft delete/remove if needed
- Add backend model/RPCs for work item watchers:
  - watcher user ID
  - added_by_user_id from `auth.uid()`
  - created_at
  - removed_at if needed
- Requester, assignee, and admin can add links.
- Requester, assignee, and admin can add watchers.
- Watchers can read watched work item details and receive notifications.
- Watchers must not gain status-change rights only from watcher status.
- Add notifications for:
  - status changed to requester, assignee, and watchers as relevant
  - comment added to relevant users/watchers
  - link added to relevant users/watchers
  - watcher added to the watcher and relevant users if appropriate
- Add admin status override:
  - admin can transition work even when not owner
  - non-admin owner/requester rules remain unchanged
  - audit actor is the real admin from `auth.uid()`
- Add admin archive/delete as soft archive:
  - no hard delete
  - preserve audit/history/comments/links/watchers/notifications
  - archived items hidden from normal active views if backend supports filtering
- Panu View as Pond is frontend perspective only:
  - do not add backend impersonation
  - do not trust frontend "view as" as actor identity

Security requirements:
- Use `auth.uid()` for all trusted actor identity.
- Do not trust client-supplied actor IDs, recipient IDs, or view-as IDs for authorization.
- Do not add `or public.current_app_user_id() is null`.
- No broad insert/update/delete grants that let users write unrelated links/watchers/notifications.
- Keep SQL idempotent where practical.

Final answer must include:
- What changed.
- Exact SQL run order.
- Tests run and result.
- Exact files to upload.
- Manual Supabase checks needed.
```

## Chat E2 Prompt - Frontend Detail Collaboration + Notification Center

```md
Use the Shared Rules For Every Chat block from `docs/MVP_1_2_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Frontend implementation engineer.

Task:
Replace old Chat E. Implement MVP 1.2 frontend for Detail Collaboration and Notification Center using Chat D2 backend contract.

Files allowed to edit:
- `github/app.jsx`
- `github/screens-a.jsx`
- `github/screens-c.jsx`
- `github/supabase-list-data.js`
- `github/supabase-quick-task.js`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.uat.test.ts` for focused regression tests

Files not allowed to edit:
- `supabase/`
- `docs/`

Required behavior:
- Existing Notification Center remains enabled and functional.
- Notification Center supports link/comment/watcher-related notifications from backend data.
- Work item detail shows Link zone after creation:
  - input URL
  - input description
  - submit action
  - list existing links
- Work item detail shows Comment zone after creation.
- Work item detail shows Watchers under Assignee in the right-side panel.
- Requester and assignee can add watcher.
- Watcher is displayed as read-only stakeholder.
- Watcher does not see status controls only because they are watcher.
- Link/comment/watcher actions show clear errors and do not white-screen.
- Do not store notification/auth/secret data in localStorage.

Manual checks required:
- Requester can add link + description.
- Assignee can add link + description.
- Comment persists after refresh.
- Watcher appears under Assignee.
- Watcher receives status/comment/link notifications after Chat D2 SQL is run.
- Unrelated user cannot add link/comment.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Manual checks still needed.
```

## Chat G Prompt - Admin Tools + Panu View As Pond

```md
Use the Shared Rules For Every Chat block from `docs/MVP_1_2_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Frontend implementation engineer with security awareness.

Task:
Implement MVP 1.2 admin operational tools and Panu View as Pond test perspective using Chat D2 backend contract.

Files allowed to edit:
- `github/app.jsx`
- `github/screens-a.jsx`
- `github/screens-b.jsx`
- `github/screens-c.jsx`
- `github/supabase-quick-task.js`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.uat.test.ts` for focused regression tests

Files not allowed to edit:
- `supabase/` unless Main Coordinator explicitly asks after D2
- `docs/`

Required behavior:
- Admin can use status controls on work items even when not owner, through backend admin override RPC/contract.
- Admin can soft archive/delete any Quick Task or Creative Request.
- Archive action must show clear confirmation.
- Archive action must not look like permanent hard delete.
- Archived items should be removed from normal active views after refresh if backend/list loader supports it.
- Non-admin users do not see admin archive/override controls.
- Panu can enable View as Pond for test perspective.
- View as Pond must be visually obvious while active.
- View as Pond affects filters/perspective only.
- View as Pond must not change backend actor identity.
- Any real action still audits as Panu through normal authenticated session/admin override.

Manual checks required:
- Admin can move non-owned Creative Request to In Progress.
- Non-admin still gets owner-only restriction when appropriate.
- Admin can soft archive a test item.
- Archived item no longer appears in normal active views.
- Panu View as Pond changes perspective, then can be turned off.
- Action made while View as Pond is active audits as Panu, not Pond.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Manual checks still needed.
```

## Main Coordinator Integration Checklist

Before opening worker chats:

- [ ] Confirm `docs/MVP_1_2_SCOPE.md` is accepted.
- [ ] Confirm `docs/MVP_1_2_UAT_CHECKLIST.md` is accepted.
- [ ] Tell each worker their assigned files.
- [ ] Do not run multiple workers on the same file unless conflict risk is understood.

After each worker chat returns:

- [ ] Read the changed files.
- [ ] Check for file ownership violations.
- [ ] Run `npm.cmd test`.
- [ ] If SQL changed, verify SQL run order.
- [ ] Update cumulative upload list.
- [ ] Tell the user exactly what to upload or run.

Before MVP 1.2 release:

- [ ] All worker outputs integrated.
- [ ] Automated tests pass.
- [ ] SQL run order confirmed and applied.
- [ ] GitHub files uploaded through web UI.
- [ ] Deployed smoke test passes.
- [ ] B-003 regression passes.
- [ ] B-006 regression passes.
- [ ] Release candidate doc created.
- [ ] Release passed doc created only after user confirms deployed smoke test.
