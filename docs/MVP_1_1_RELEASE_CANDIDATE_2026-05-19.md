# FlowMate MVP 1.1 Release Candidate

Date: 2026-05-19
Project: FlowMate
Deploy target: https://panuwee.github.io/FlowMate/
Cache version: `20260519-32`

## Result

MVP 1.1 is ready for final GitHub Pages upload and post-deploy smoke test.

## Scope Included

- Open created Quick Task / Creative Request detail after successful create.
- Create form draft autosave and restore.
- Admin whitelist UI with admin-only backend RPCs.
- Workload first-open stability fix.
- Workload tab split:
  - Workload = Non GD/VE.
  - Workload - GD/VE = Pond, Joe, Tong, Eye, Vee.
- MVP 1.0 security baseline remains closed.

## Verification

- Automated tests: `82/82 passed` on 2026-05-19.
- C1 manual check: passed.
- C2 manual check: passed.
- C3 manual check: passed.
- SQL role promote Gear/Mac: passed.
- Member role gate: passed.
- B-003 actor spoof: passed.
- B-006 RLS null bypass: passed.

## SQL Run Order

For the current Supabase environment, these have already been run during MVP 1.1 testing.

For a fresh environment, run:

1. `supabase/whitelist_access.sql`
2. `supabase/security_hardening.sql`
3. `supabase/update_requester_team_functions.sql`
4. `supabase/promote_admin_users.sql`

Do not rerun seed data on production unless you intentionally want to reset or add demo data.

## Files To Upload

Upload these files to GitHub web UI for MVP 1.1 RC.

### App

- `github/index.html`
- `github/app.jsx`
- `github/screens-a.jsx`
- `github/screens-b.jsx`
- `github/screens-c.jsx`
- `github/data.jsx`
- `github/search-utils.js`
- `github/supabase-list-data.js`
- `github/supabase-workload-data.js`
- `github/supabase-quick-task.js`

### Supabase

- `supabase/whitelist_access.sql`
- `supabase/security_hardening.sql`
- `supabase/update_requester_team_functions.sql`
- `supabase/promote_admin_users.sql`
- `supabase/README.md`

### Tests And Docs

- `src/lib/flowmate.uat.test.ts`
- `docs/MVP_1_1_SCOPE.md`
- `docs/MVP_1_1_UAT_CHECKLIST.md`
- `docs/MVP_1_1_RELEASE_CANDIDATE_2026-05-19.md`

## Post-Deploy Smoke Test

After upload, test on GitHub Pages:

1. Open `https://panuwee.github.io/FlowMate/?v=20260519-32`.
2. Sign in with Google.
3. Confirm My Work loads.
4. Create Quick Task and confirm it opens the created detail.
5. Create Creative Request and confirm assignment/detail works.
6. Refresh Create form with draft data and confirm draft restores.
7. Submit after draft restore and confirm the draft clears.
8. Open Workload and confirm both tabs work.
9. As admin, open Admin Whitelist and add/deactivate a test user.
10. As member, confirm Admin Whitelist is blocked.

## Release Blockers

Do not release MVP 1.1 if any of these happen:

- Signed-out users can read real work items.
- Actor spoof RPC creates or changes another user's item.
- Create succeeds but opens the wrong detail item.
- Draft saving stores auth/session/API key/token values.
- Member user can access or submit admin whitelist changes.
- Workload page white-screens on first open.
