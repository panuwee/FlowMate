# FlowMate MVP 1.3 Release Candidate - 2026-06-26

## Status Summary

Status: Passed for release candidate.

QA found no release-blocking issues in automated tests, GitHub build output, SQL contract, planning UAT coverage, security regressions, frontend secret scan, existing-view preservation, or landing animation guard.

This is not the release-passed document. Create `docs/MVP_1_3_RELEASE_PASSED_2026-06-26.md` only after the deployed GitHub Pages smoke test passes.

## Scope Delivered

- Backend/data model:
  - Added `work_items.publish_date`.
  - Backfilled `publish_date` from `launch_date` for existing Creative Requests.
  - Added `planning_work_items_v` with normalized channel arrays, planning date, first draft date, readiness, and active Creative Request filtering.
  - Kept `planning_work_items_v` as `security_invoker` and authenticated-only.
  - Wired `create_creative_request` with `p_publish_date`.
- Create/detail/search/list/export:
  - Captures and surfaces Campaign, Channel, and Publish Date.
  - Keeps due date as 1st Draft.
  - Adds planning fields to list filters and CSV export.
- Planning frontend:
  - Adds Planning nav entries: Channel View, Campaign View, Content Calendar.
  - Channel View groups normalized channels and duplicates multi-channel rows into each channel group.
  - Campaign View groups by campaign and summarizes counts.
  - Content Calendar uses Publish Date first and Launch Date as fallback.
  - Execution Team Calendar remains due/1st Draft oriented.
- Non-goals preserved:
  - No separate Campaign Plan platform was added.
  - Existing Board, List, My Work, Team Calendar, Gantt, and Workload remain present.

## Tests and Build Evidence

Automated tests:

```text
npm.cmd test
2 test files passed
209 tests passed
```

GitHub build:

```text
npm.cmd run build:github
unchanged data.js
unchanged screens-a.js
unchanged screens-b.js
unchanged screens-c.js
unchanged app.js
No output changed.
```

## QA Checklist Evidence

- Channel View UAT coverage exists in `src/lib/flowmate.uat.test.ts`.
- Campaign View UAT coverage exists in `src/lib/flowmate.uat.test.ts`.
- Planning Content Calendar UAT coverage exists in `src/lib/flowmate.uat.test.ts`.
- Create/detail/search/list/export planning field coverage exists in `src/lib/flowmate.uat.test.ts`.
- KPI/export coverage remains in scope for existing KPI and Workload export behavior.
- Existing Board/List/My Work/Team Calendar/Gantt/Workload are still routed/rendered.
- B-003 actor spoof regression remains covered: RPCs resolve actors from `auth.uid()`.
- B-006 signed-out/RLS null bypass regression remains covered: policies use signed-in app-user checks and `auth.uid()`.
- Signed-out users cannot read `planning_work_items_v` by SQL contract:
  - view uses `security_invoker = true`;
  - privileges are revoked from `public`, `anon`, and `authenticated`;
  - `select` is granted back only to `authenticated`;
  - underlying `work_items` RLS still requires active app-user identity.
- Archived rows do not appear in active planning views by SQL and frontend contract:
  - SQL filters `wi.archived_at is null`;
  - fallback planning loader filters `!row.archivedAt`;
  - planning grouping helpers ignore archived rows.
- Frontend secret scan found no service-role key, password, client secret, stored session, or hardcoded bearer token. `github/supabase-client.js` contains the public Supabase anon key required by the static frontend; this is not a service-role secret.
- Landing animation guard passed:
  - no custom cursor implementation found;
  - no mouse/pointer-following orb logic found;
  - orbs self-rise with `orb.animate(...)`;
  - sigil rotation uses SVG SMIL `<animateTransform>` with explicit `250 250` rotation center, not CSS rotation animation.

## SQL Run Order

MVP 1.3 Planning backend update for an existing MVP 1.2 database:

1. `supabase/schema.sql`
2. `supabase/rpc_assignment.sql`
3. `supabase/security_hardening.sql`
4. `supabase/view_security_hardening.sql`

Changed SQL files currently present in the workspace:

- `supabase/schema.sql`
- `supabase/rpc_assignment.sql`
- `supabase/rpc_quick_task.sql`
- `supabase/security_hardening.sql`
- `supabase/view_security_hardening.sql`
- `supabase/reset_tasks_for_production.sql`
- `supabase/seed.sql`
- `supabase/phase2_stability_fixes.sql`
- `supabase/phase3_performance.sql`

Do not run `supabase/reset_tasks_for_production.sql` as part of the MVP 1.3 planning update. It is a manual production go-live reset only.

`supabase/phase2_stability_fixes.sql` and `supabase/phase3_performance.sql` are post-review hardening/performance patches. Run them only if that patch sequence has not already been applied, following `supabase/README.md`.

## Exact Upload List

Repository/tooling files:

- `package.json`
- `package-lock.json`
- `build-github.cjs`

SQL/backend files:

- `supabase/README.md`
- `supabase/schema.sql`
- `supabase/rpc_assignment.sql`
- `supabase/rpc_quick_task.sql`
- `supabase/security_hardening.sql`
- `supabase/view_security_hardening.sql`
- `supabase/reset_tasks_for_production.sql`
- `supabase/seed.sql`
- `supabase/phase2_stability_fixes.sql`
- `supabase/phase3_performance.sql`

Frontend source files:

- `github/app.jsx`
- `github/data.jsx`
- `github/screens-a.jsx`
- `github/screens-b.jsx`
- `github/screens-c.jsx`
- `github/app.css`
- `github/index.html`
- `github/search-utils.js`
- `github/supabase-list-data.js`
- `github/supabase-quick-task.js`
- `github/supabase-workload-data.js`

Generated GitHub Pages deploy files:

- `github/app.js`
- `github/data.js`
- `github/screens-a.js`
- `github/screens-b.js`
- `github/screens-c.js`

Tests and docs:

- `src/lib/flowmate.uat.test.ts`
- `docs/MANAGER_ORIENTED_PLANNING_VIEW.md`
- `docs/MVP_1_3_PLANNING_SCOPE.md`
- `docs/MVP_1_3_PLANNING_UAT_CHECKLIST.md`
- `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md`
- `docs/MVP_1_3_RELEASE_CANDIDATE_2026-06-26.md`

Do not upload these as release artifacts unless intentionally preserving local animation references:

- `github/orb/`
- `github/scoll+orb_float/`

## Manual Deployed Smoke Checklist

After uploading to GitHub and waiting for Pages to refresh at `https://panuwee.github.io/FlowMate/`:

- Open the site in a fresh browser session.
- Confirm login screen animation:
  - orbs rise by themselves;
  - cursor remains normal;
  - sigil rotates continuously.
- Sign in with an allowed account.
- Create a Creative Request with Campaign, Channel, Publish Date, 1st Draft, and Launch Date.
- Confirm the detail page shows Campaign, Channel, Publish Date, 1st Draft, and Launch Date in the expected order.
- Confirm List filters by Campaign and Channel.
- Export List CSV and confirm Campaign, Channel, Publish Date, Launch Date, 1st Draft, Type / Skill, and Asset Count are present.
- Open Planning > Channel View and confirm multi-channel items appear under each channel.
- Open Planning > Campaign View and confirm campaign grouping and summary counts.
- Open Planning > Content Calendar and confirm Publish Date is used before Launch Date fallback.
- Open Execution Team Calendar and confirm it still follows 1st Draft/due-date behavior.
- Open Board, My Work, Gantt, Workload, and KPI to confirm they still load.
- Sign out and confirm protected app data is not readable.

## Known Risks and Limitations

- This QA pass did not deploy to GitHub Pages and did not run a live browser smoke test against production.
- Supabase SQL was statically verified by contract and tests, not applied live in this QA pass.
- The static frontend includes the public Supabase anon key in `github/supabase-client.js`; RLS and authenticated-only grants remain the protection boundary.
- `github/orb/` and `github/scoll+orb_float/` appear as local untracked reference folders and are excluded from the upload list unless intentionally needed.
- Existing `github/index.html` still depends on external React CDN with local Supabase library fallback plus CDN fallback.

## Release Blocker Status

No release blockers found.

Do not create the release-passed document until the deployed smoke checklist passes.
