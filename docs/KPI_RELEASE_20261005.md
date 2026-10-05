# KPI workspace release — 5 October 2026

Splits the KPI sidebar into overview, Creative, Requester and Task Assign. Lead/Supervisor access retains the existing server KPI gate and per-work-item scope. The previous Creative report remains accessible from the new pages.

Draft/submit punctuality and final acceptance punctuality use separate endpoint agreements. R03 counts the current nonblank Brief Link. Missing evidence displays as unavailable with coverage; it does not become a zero score. Durations use the approved 2026 Mon–Fri calendar with 19 holidays and show elapsed duration too.

Adds evidence collection forms and intake planning classification for Task Assign. Evidence timestamps/actors and append-only enforcement are server controlled. No historical evidence backfill or real test-task creation is part of this release.

## Database prerequisite

`supabase/kpi_measurement_evidence.sql` was applied to project `jbavahimqjalvcfawgqw` as migration `20261005044507` / `flowmate_kpi_measurement_evidence_20261005`, then verified read-only. SHA-256: `034ad885d9cb9773a6b6f2d2942704254716fec1c94d6964be16207068223a44`. Original `task_assign_create` definition MD5 remains `93c39fb6efd5393a8fd05c33e64f93a5`. Do not apply the SQL again as part of frontend publication.

## Validation

- Node KPI SQL/model/client/navigation tests: 58 passed.
- Vitest KPI/menu checks: 8 passed.
- Vitest Task Assign module/workspaces/form/detail checks: 36 passed, with cache disabled to avoid local cache permission errors.
- Strict TypeScript and `npm.cmd run build:github`: passed; repeated generation produces no changes.
- Local release build reads real October data: R03 19/19, R01/R02 unavailable for missing historical evidence.
- Fixture moved into `src/lib/fixtures` so tests run without the local preview directory. The preview harness is not published.
- Synchronized frontend stamp: `20261005-d8a2f5`.

Base release commit: `b26a4e3df7aedfadbc6de84bdd00bd8734e367ba`, refreshed from GitHub `version2.1.1` before staging. Publication and live browser verification are recorded separately in the local release-result document.

## Limits

No real evidence-write E2E was performed. Calendar coverage ends December 2026. Supabase advisors noted an unindexed calendar-version FK and an unused new index; these are performance INFOs retained for follow-up. No security findings identified the new objects in the post-install check; this is not a claim that the whole project has no warnings.

Preserve unrelated canonical checkout changes and existing worktree evidence. This release does not authorize task/evidence mutations merely for testing.
