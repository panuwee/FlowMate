# FlowMate MVP 1.1 UAT Checklist

Date: 2026-05-19
Project: FlowMate
Deploy target: https://panuwee.github.io/FlowMate/

## Purpose

Use this checklist before and during MVP 1.1 implementation to keep the release small, testable, and compatible with the MVP 1.0 security baseline.

MVP 1.1 starts with three areas:

- Open created item detail after create.
- Draft saving for the Create form.
- Admin whitelist UI.

## Test Roles And Setup

Use separate browser sessions or profiles for these roles:

- Admin user: active app user with admin permission.
- Normal allowed user: active app user without admin permission.
- Inactive user: app user exists but is inactive.
- Signed-out visitor: no authenticated session, preferably incognito/private window.

Keep one known Quick Task and one known Creative Request available for read-only smoke checks.

## Regression Tests Needed Before Implementation

Run these before changing MVP 1.1 code. If any fail, fix the baseline first.

| ID | Area | Test Needed | Why It Matters |
|---|---|---|---|
| REG-101 | Automated tests | Run `npm test` and confirm all existing tests pass | Confirms MVP 1.0 behavior is still clean before MVP 1.1 starts |
| REG-102 | B-003 actor spoof | Try creating/updating with another user's actor ID | Confirms client payload cannot spoof the authenticated actor |
| REG-103 | B-006 RLS null bypass | Query protected work data while signed out | Confirms anonymous users cannot read real work rows |
| REG-104 | Create Quick Task | Submit a normal Quick Task | Confirms existing create path works before adding detail navigation |
| REG-105 | Create Creative Request | Submit a normal Creative Request | Confirms assignment/create path works before adding detail navigation |
| REG-106 | Existing search/workload | Verify My Work list, search, overdue, queued, and workload counts | Confirms dashboard behavior is not broken by MVP 1.1 changes |
| REG-107 | Non-admin permission | Normal allowed user cannot access admin-only functions | Confirms whitelist UI work does not widen permissions |

## UAT Cases

### UAT-101 - Quick Task Opens Created Detail

Priority: P0

Preconditions:

- User is logged in as an active allowed user.
- Quick Task creation is available.
- Browser has network access.

Steps:

1. Open the Create form.
2. Select Quick Task.
3. Fill required fields with a unique title.
4. Submit once.

Expected result:

- The app opens the newly created Quick Task detail view.
- The detail view shows the same unique title.
- The detail URL or selected detail state uses the real created item ID.
- Only one Quick Task is created.

Failure signals:

- User stays on the Create form after success.
- Detail opens for the wrong item.
- Duplicate Quick Tasks are created.
- A generic or unclear error appears after successful create.

### UAT-102 - Creative Request Opens Created Detail

Priority: P0

Preconditions:

- User is logged in as an active allowed user.
- Creative Request creation is available.
- Test data is valid enough to submit.

Steps:

1. Open the Create form.
2. Select Creative Request.
3. Fill required fields with a unique title/campaign.
4. Submit once.

Expected result:

- The app opens the newly created Creative Request detail view.
- The detail view shows the same unique title/campaign.
- Assignment/status data shown in detail belongs to the created request.
- Only one Creative Request is created.

Failure signals:

- Detail opens with stale data from a previous request.
- Detail opens without a real item ID.
- Duplicate requests are created.
- Assignment or status data is missing when it should be available.

### UAT-103 - Create Succeeds But Detail Open Fails Safely

Priority: P0

Preconditions:

- User is logged in as an active allowed user.
- Tester can simulate a detail-load failure, for example by temporarily blocking the detail query or disconnecting network after submission.

Steps:

1. Submit a valid Quick Task or Creative Request.
2. Force the detail load/navigation to fail after create succeeds.

Expected result:

- The created item still exists exactly once.
- The app shows a clear error explaining that opening detail failed.
- User remains in a safe state where they can retry opening the item or return to the list.

Failure signals:

- User sees a blank page.
- The app retries create and creates duplicates.
- The error hides whether create succeeded.
- User loses the created item context completely.

### UAT-104 - Double Submit Does Not Create Duplicates

Priority: P0

Preconditions:

- User is logged in as an active allowed user.
- Create form is open with valid data.

Steps:

1. Submit the form.
2. Immediately click submit again or press Enter again.
3. Open the list/search for the unique title.

Expected result:

- Only one work item exists for the submitted unique title.
- Submit control is disabled or second submission is ignored while the first request is pending.
- User lands on the created item's detail view.

Failure signals:

- Two or more work items are created.
- UI shows mixed success/error state.
- User lands on one duplicate while another duplicate remains hidden.

### UAT-105 - Draft Saves And Restores Same Form Type

Priority: P0

Preconditions:

- User is logged in as an active allowed user.
- Browser local storage is available.

Steps:

1. Open Create form.
2. Select Quick Task.
3. Enter title, due date, and notes but do not submit.
4. Refresh the page.
5. Open Create form again and select Quick Task.

Expected result:

- The Quick Task draft restores on the same device/browser.
- Restored fields match what the user typed.
- User can continue editing and submit normally.

Failure signals:

- Draft disappears after refresh.
- Draft restores into the wrong fields.
- Draft changes the form type unexpectedly.
- Submit fails because restored values are malformed.

### UAT-106 - Draft Is Isolated By Form Type

Priority: P0

Preconditions:

- User is logged in as an active allowed user.
- Browser local storage is available.

Steps:

1. Start a Quick Task draft.
2. Switch to Creative Request.
3. Start a Creative Request draft with different data.
4. Switch back to Quick Task.

Expected result:

- Quick Task draft restores only in Quick Task mode.
- Creative Request draft restores only in Creative Request mode.
- Switching form type does not mix fields between forms.

Failure signals:

- Quick Task data appears in Creative Request fields.
- Creative Request data overwrites Quick Task draft.
- Hidden fields from one type are submitted with the other type.

### UAT-107 - Draft Clears After Successful Submit

Priority: P0

Preconditions:

- User is logged in as an active allowed user.
- Browser local storage is available.

Steps:

1. Create a draft.
2. Submit the form successfully.
3. Open Create form again with the same form type.
4. Refresh and open Create again.

Expected result:

- The previous submitted draft is cleared.
- New Create form starts empty or with normal defaults.
- Created item still opens in detail after submit.

Failure signals:

- Old submitted values reappear.
- User can accidentally resubmit stale data.
- Draft clears before submit succeeds and data is lost on failure.

### UAT-108 - Manual Clear Draft Works

Priority: P1

Preconditions:

- User is logged in as an active allowed user.
- A draft exists.

Steps:

1. Open Create form.
2. Confirm draft values are present.
3. Use the clear draft action.
4. Refresh and reopen Create form.

Expected result:

- Draft values are removed.
- User sees empty/default form state.
- No work item is created by clearing the draft.

Failure signals:

- Draft returns after refresh.
- Clear action submits or mutates work data.
- User cannot tell whether the draft was cleared.

### UAT-109 - Draft Does Not Store Secrets

Priority: P0

Preconditions:

- User is logged in as an active allowed user.
- Browser devtools are available.

Steps:

1. Type normal draft values into Create form.
2. Inspect browser local storage/session storage.
3. Search stored draft values.
4. Confirm no passwords, API keys, auth tokens, Supabase keys, or session values are stored by draft logic.

Expected result:

- Draft storage contains only non-secret form data required to restore the draft.
- Auth/session values are not copied into draft storage.
- Sensitive-looking fields are excluded from draft storage.

Failure signals:

- Any password, API key, token, or session value appears in draft storage.
- Draft stores full user/session objects.
- Draft stores backend response payloads that include protected data.

### UAT-110 - Draft Storage Failure Is Safe

Priority: P1

Preconditions:

- User is logged in as an active allowed user.
- Tester can simulate unavailable/full local storage.

Steps:

1. Disable or fill browser local storage.
2. Open Create form.
3. Fill and submit a valid item.

Expected result:

- Create flow still works without draft saving.
- User sees no blocking crash.
- If shown, draft warning is clear and non-scary.

Failure signals:

- Create form becomes unusable.
- Submit is blocked only because draft saving failed.
- Browser console shows repeated storage errors that slow the app.

### UAT-111 - Admin Can Add Allowed User

Priority: P0

Preconditions:

- User is logged in as an admin.
- Target email/user is not currently active in the whitelist.

Steps:

1. Open Admin Whitelist UI.
2. Add a valid user/email.
3. Save/submit.
4. Refresh the whitelist list.

Expected result:

- New user appears in the allowed user list.
- User is active unless the UI clearly allows choosing inactive state.
- A clear success state is shown.
- Audit/history behavior remains consistent with MVP 1.0 if available.

Failure signals:

- User does not appear after refresh.
- Duplicate or malformed rows are created.
- UI says success but database state did not change.
- Admin action exposes secrets or raw error details.

### UAT-112 - Admin Can Deactivate Allowed User

Priority: P0

Preconditions:

- User is logged in as an admin.
- Target user exists and is active.
- Do not use the currently logged-in admin as the target unless self-deactivation is intentionally supported.

Steps:

1. Open Admin Whitelist UI.
2. Find an active allowed user.
3. Deactivate the user.
4. Refresh the list.
5. Try using the app as the deactivated user.

Expected result:

- Target user appears inactive after refresh.
- Deactivated user is not treated as allowed.
- Deactivated user cannot mutate protected data.

Failure signals:

- User remains active after refresh.
- Deactivated user can still create or update work.
- Deactivation removes the row when the expected behavior is inactive history.
- Admin accidentally deactivates the wrong user.

### UAT-113 - Admin Sees Active And Inactive Users

Priority: P1

Preconditions:

- User is logged in as an admin.
- Whitelist has at least one active and one inactive user.

Steps:

1. Open Admin Whitelist UI.
2. Review active users.
3. Review inactive users.
4. Refresh the page.

Expected result:

- Active and inactive users are visible or filterable.
- Status is clear for each row.
- Refresh keeps the same accurate state.

Failure signals:

- Inactive users are hidden when admins need to manage them.
- Active/inactive labels are reversed or unclear.
- List changes after refresh without any action.

### UAT-114 - Duplicate Whitelist User Shows Clear Message

Priority: P1

Preconditions:

- User is logged in as an admin.
- Target user/email already exists in whitelist.

Steps:

1. Open Admin Whitelist UI.
2. Add the same user/email again.
3. Submit.

Expected result:

- App shows a clear duplicate-user message.
- No duplicate active rows are created.
- Existing user's state is not changed unless the UI explicitly says it will reactivate.

Failure signals:

- Duplicate rows are created.
- Error message is generic or raw database text only.
- Existing inactive user is silently reactivated without confirmation.

### UAT-115 - Non-Admin Cannot Access Whitelist UI

Priority: P0

Preconditions:

- User is logged in as an active non-admin allowed user.
- Admin route or entry point is known.

Steps:

1. Try to open Admin Whitelist UI from normal navigation.
2. Try to open the admin URL directly.
3. Try to submit whitelist changes if any form is visible.

Expected result:

- Non-admin user cannot load or use whitelist management.
- Admin navigation is hidden or disabled for non-admin users.
- Direct URL access is blocked safely.
- Backend rejects any attempted whitelist mutation.

Failure signals:

- Non-admin sees the whitelist list.
- Non-admin can add/deactivate users.
- Direct URL exposes admin data before redirect/block.
- UI-only blocking works but backend mutation still succeeds.

### UAT-116 - Whitelist Network Or Database Error Is Clear

Priority: P1

Preconditions:

- User is logged in as an admin.
- Tester can simulate network/database failure.

Steps:

1. Open Admin Whitelist UI.
2. Start add or deactivate action.
3. Simulate failure before response completes.

Expected result:

- App shows a clear error.
- No false success state appears.
- UI allows retry or safe recovery.
- Existing whitelist data is not corrupted.

Failure signals:

- UI says success when action failed.
- List shows temporary wrong state after refresh.
- Raw SQL/security details are exposed to the user.
- Admin must reload the whole app to recover.

### UAT-117 - B-003 Actor Spoof Regression

Priority: P0

Preconditions:

- Tester has two active users: User A and User B.
- Tester can send a direct RPC/API call or inspect request payload.

Steps:

1. Log in as User A.
2. Attempt to create or mutate work while sending User B's actor/user ID in the payload.
3. Check created/updated rows.

Expected result:

- Request is rejected with an actor-mismatch style error.
- No row is created or changed as User B.
- Expected security behavior from MVP 1.0 remains true.

Failure signals:

- Payload actor ID is trusted.
- Work item requester/actor becomes User B.
- Mutation succeeds when it should fail.
- Error message reveals sensitive internals.

### UAT-118 - B-006 RLS Null Bypass Regression

Priority: P0

Preconditions:

- Browser incognito/private session has no authenticated user.
- Protected work rows exist in the database.

Steps:

1. Open the deployed app while signed out.
2. Attempt direct protected read if test tooling is available.
3. Check whether any real work rows are visible.

Expected result:

- Signed-out user sees no protected work data.
- Direct protected reads return empty data or an authorization failure.
- No RLS policy allows null app-user bypass.

Failure signals:

- Signed-out user can see work item rows.
- Protected API returns real project/task/request data.
- Policy behavior depends on `current_app_user_id()` being null.

## Upload And Deploy Smoke Checklist

Run after manual GitHub web UI upload and GitHub Pages deployment.

| ID | Check | Expected Result |
|---|---|---|
| SMOKE-101 | Open `https://panuwee.github.io/FlowMate/` | App loads without blank page |
| SMOKE-102 | Hard refresh deployed URL | Static assets load correctly |
| SMOKE-103 | Log in as active allowed user | User enters app and profile/work data loads |
| SMOKE-104 | Create Quick Task | Created detail opens and no duplicate item is created |
| SMOKE-105 | Create Creative Request | Created detail opens and assignment/status remains valid |
| SMOKE-106 | Refresh with Create draft | Draft restores only for the correct form type |
| SMOKE-107 | Submit after draft restore | Draft clears after successful submit |
| SMOKE-108 | Log in as admin | Admin can open whitelist UI |
| SMOKE-109 | Log in as non-admin | Non-admin cannot open whitelist UI |
| SMOKE-110 | Signed-out/incognito protected read | No protected work data is visible |

## Release Stop Criteria

Do not release MVP 1.1 if any of these happen:

- B-003 actor spoof regression fails.
- B-006 RLS null bypass regression fails.
- Create action can create duplicate items from one user submit.
- Successful create cannot reliably identify the created item ID.
- Draft saving stores secrets, auth tokens, API keys, or session data.
- Non-admin users can view or mutate whitelist data.
- Automated tests fail and the failure is not understood.

## Automated Test Candidates After Implementation

Add tests only where the code has a pure function or low-risk boundary that can be tested without browser or database setup.

- Detail navigation target builder: given created item type and ID, returns the expected detail target.
- Draft storage sanitizer: excludes secret-like keys and keeps only allowed form fields.
- Draft key builder: separates Quick Task and Creative Request drafts.
- Draft clear behavior: removes only the submitted form type draft.
- Admin permission helper: non-admin role/state returns false for whitelist access.

Do not add brittle tests that depend on live Supabase data or GitHub Pages deployment state. Test live behavior manually through the UAT cases above.

## SQL Run Order

No SQL changes are planned by this checklist.

If MVP 1.1 implementation later changes SQL, document the exact SQL run order before release and rerun B-003/B-006 security checks after the SQL is applied.
