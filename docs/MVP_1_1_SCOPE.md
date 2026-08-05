# FlowMate MVP 1.1 Scope

## Status

MVP 1.0 is closed and security-passed as of 2026-05-19.

MVP 1.1 should stay small. The goal is to improve the main create-and-manage workflow without changing the MVP 1.0 security baseline.

## Goals

- Make newly created work easier to continue immediately.
- Reduce accidental data loss while filling the Create form.
- Give admins a simple way to manage allowed users.
- Keep all changes small, testable, and low risk.

## In Scope

### 1. Open created item detail after create

After a user creates a Quick Task or Creative Request, FlowMate should open the new item detail view immediately.

Expected behavior:

- Quick Task creation opens the created task detail.
- Creative Request creation opens the created request detail.
- If create succeeds but opening detail fails, show a clear error and keep the user in a safe state.

### 2. Draft saving for Create form

The Create form should save a local draft while the user is filling it out.

Expected behavior:

- Draft data is saved locally on the same device/browser.
- Draft is restored if the user refreshes or leaves and comes back.
- Draft is cleared after successful submission.
- Draft does not store passwords, API keys, or secrets.

### 3. Admin whitelist UI

Admins should be able to manage allowed users from the app UI.

Expected behavior:

- Admin can add an allowed user.
- Admin can deactivate an allowed user.
- Admin can see current active and inactive allowed users.
- Non-admin users cannot access or use whitelist management.

## Out of Scope

- No changes to MVP 1.0 authentication model unless required for the whitelist UI.
- No role system redesign.
- No bulk import or export for allowed users.
- No email invitation flow.
- No notification system.
- No mobile app-specific work.
- No analytics dashboard.
- No changes to unrelated task, request, or project workflows.

## Acceptance Criteria

### Open created item detail

- Creating a Quick Task successfully opens that task's detail view.
- Creating a Creative Request successfully opens that request's detail view.
- The opened detail view uses the real created item ID.
- Failed create still shows the existing create error behavior.
- Successful create does not create duplicate items.

### Draft saving

- Create form input survives a page refresh.
- Draft restores only for the same form type.
- Draft is removed after a successful create.
- User can manually clear the draft if needed.
- Draft saving works without network access.
- No secret values are written into local storage.

### Admin whitelist UI

- Admin can add a user to the whitelist.
- Admin can deactivate a whitelisted user.
- Deactivated users are not treated as allowed.
- Non-admin users cannot load or submit whitelist changes.
- UI handles duplicate users with a clear message.
- UI handles network or database errors with a clear message.

### Testing

- Existing MVP 1.0 security tests still pass.
- Existing automated tests still pass.
- New tests cover successful create navigation, draft restore/clear, and admin-only whitelist actions.

## Risks And Edge Cases

- Create succeeds but navigation to detail fails.
- User double-clicks submit and creates duplicate items.
- Browser local storage is disabled or full.
- User has multiple tabs with different drafts.
- User starts a Quick Task draft, then switches to Creative Request.
- Admin tries to add an already allowed user.
- Admin deactivates a user who is already inactive.
- Non-admin user manually opens an admin whitelist route.
- Whitelist UI and database rules disagree about who is admin.
- Existing RLS protections must continue to block unauthorized access.

## Non-Goals For MVP 1.1

MVP 1.1 is not a redesign. It should not change the product structure, security model, or database behavior beyond what is required for the three scoped features.

## Release Requirement

MVP 1.1 can be considered ready only when the scoped features pass acceptance criteria and the MVP 1.0 security baseline remains passing.
