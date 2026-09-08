# FlowMate Creative KPI Release Handoff

Prepared: 8 September 2026
Target branch: `version2.1.1`
Base commit at preparation: `22c655cad37cb4397efb11947ddde743cb97f695`

## Release outcome

This release adds a monthly Creative KPI workspace under **Supervisor > Creative KPI**. It supports team overview, GD/VE performance, and Requester planning behaviour with a person filter and 6-month, 12-month, or all-history progression views.

The dashboard shows median (P50), P85, sample size, small-sample warnings, missing milestone data, SLA exceptions, and team benchmarks. The previous KPI export remains available behind the **Export** action.

## Database state

The KPI data foundation has already been applied and verified on `workgrid-test` before this release preparation. Do not re-run the installer merely to publish the frontend.

For a new environment, run in this order:

1. `supabase/creative_monthly_kpi_data_foundation.sql`
2. `supabase/creative_monthly_kpi_data_foundation_verify.sql` as the read-only post-apply check

Database apply, rollback, and production execution remain separate approval gates.

## Release candidate files

Application and generated assets:

- `app.css`
- `app.jsx`
- `app.js`
- `screens-c.jsx`
- `screens-c.js`
- `supabase-list-data.js`
- `index.html`
- `home/index.html`
- `product-book/index.html`

Release tooling and verification:

- `scripts/release-stamp.cjs`
- `src/lib/flowmate-board-integration.uat.test.ts`
- `src/lib/flowmate-board-sql.uat.test.ts`
- `src/lib/flowmate-monthly-kpi-data-foundation.uat.test.ts`
- `src/lib/flowmate-monthly-kpi-ui.uat.test.ts`

Data and documentation:

- `supabase/creative_monthly_kpi_data_foundation.sql`
- `supabase/creative_monthly_kpi_data_foundation_verify.sql`
- `supabase/README.md`
- `docs/superpowers/specs/2026-09-08-flowmate-monthly-kpi-data-audit-and-metric-spec.md`
- `docs/FLOWMATE_CREATIVE_KPI_RELEASE_HANDOFF_2026-09-08.md`

## Publish order after separate approval

1. Commit only the release candidate files listed above.
2. Push the `version2.1.1` branch to the `github` remote and verify the exact remote SHA.
3. Upload changed static assets first: `app.css`, `supabase-list-data.js`, `screens-c.js`, and `app.js`.
4. Upload `index.html`, `home/index.html`, and `product-book/index.html` last so all three entry points switch to the same cache stamp together.
5. Perform rendered UAT with a Supervisor account and verify that a non-Supervisor cannot access the KPI dataset.

## Acceptance checks

- Sidebar shows **Creative KPI** under Supervisor.
- Team Overview, GD/VE, and Requester tabs render monthly progression.
- Person and time-range filters update all cards, charts, and monthly tables consistently.
- P50 and P85 are distinguishable and sample size is visible.
- Months with fewer than five samples are marked as small samples rather than hidden.
- Missing milestone data and SLA exceptions are visible.
- Manual refresh reloads KPI data.
- Legacy KPI export is still reachable.
- All three deployed entry pages share the same cache token for changed assets.

## Verification evidence

- `npm.cmd run build:github`: passed; generated assets are synchronized with source.
- KPI, cache, and hidden-effort regression checks: 20/20 passed.
- Full Vitest suite: 762/762 passed.
- The Board SQL contract now validates both supported installer shapes: the committed direct public function and the documented Shared Status Engine with an authenticated public wrapper. Both paths retain urgent-WIP rules, audit metadata, Marketing Plan synchronization, and private-function permission checks. No Board, CreativeBot, or SeaTalk SQL is included in this KPI release candidate.

## Rollback boundary

Frontend rollback is performed by restoring the previous static assets and entry pages together. Database rollback is not bundled with frontend rollback and requires a separately reviewed SQL plan because the data foundation is shared reporting infrastructure.

## Current gate

This handoff prepares a release candidate only. Commit, push, tag, deployment, and production database actions are not authorized by this document.
