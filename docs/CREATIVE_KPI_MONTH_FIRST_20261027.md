# Creative KPI: complete month first

Status: period endpoint installed and both approved verification reads passed; frontend publication remains pending separate approval.

The user selected complete selected-month KPI and evidence first, followed by annual progression and Excel. This replaces the previous readiness criterion of waiting for annual/export readiness before displaying any KPI.

## Interaction brief

Improve the existing FlowMate Creative KPI screen for GD/VE report readers who need usable monthly evidence quickly. Preserve the existing typography, card grid, color tokens, responsive layout, report definitions, routes and Requester workflow. Add only loading/error states needed to make completeness explicit. Keep all six KPI cards and selected-period evidence consistent with one snapshot. Do not display unrequested months as zeros while they are still loading.

The selected-month request completes first. The screen then starts one annual request. Annual progression, annual tables, complete-year person/type filter inventories and Excel remain unavailable until the annual response is complete. Role/month controls and complete monthly evidence remain usable. Annual success replaces every dependent value and the displayed Bangkok snapshot time together. An annual timeout retains the monthly result and provides an annual-only retry. Authorization/source-drift failures clear displayed results. Month/year changes abort old requests and ignore late responses. Refresh invalidates component-local reuse; no persistent browser or database cache is introduced.

## Implementation

- `supabase/creative_kpi_period_report_20261027.sql`: new additive SECURITY INVOKER RPC `flowmate_creative_kpi_report_period(integer,integer,uuid[])`. Null month requests the complete year. Guards preserve captured view/owner formulas, require a STABLE report gate, validate year/month/diagnostic size, and keep the existing KPI authorization gate. Existing table RLS remains active. Only authenticated receives EXECUTE. The existing installed fast-v1 endpoint is untouched.
- Month candidate selection includes tasks created in the period, older open work and tasks with permitted events in the period. It is a superset followed by exact derived-period filtering. It preserves archived/cross-year work, first-delivery/review/start semantics, Bangkok boundaries, historical owners, holiday counts and all original report fields. It does not filter only by creation month.
- `scripts/build-creative-kpi-period.cjs` deterministically generates the installer and rollback from the guarded original source plus the locally/previously measured query-shape optimization. No network access. Rollback removes only the new function if its body matches; restore the old frontend before invoking it.
- `supabase-creative-kpi-report.js`: separate period loader validates year, month, scope, unique rows, count, evidence fields, calendar and snapshot time. It has no fallback that could label annual/partial data as a complete month. Existing Requester and legacy loaders are retained.
- `creative-kpi-report.js`: explicit monthly coverage uses unchanged summary formulas, omits annual aggregates/people rollups and rejects workbook generation. Complete-year behavior and workbook definitions remain unchanged.
- `screens-creative-kpi.jsx` and regenerated `.js`: two-stage loading, stale-response cancellation, atomic snapshot replacement and error/retry states. Reuse is limited to this mounted screen and refresh generation.

## Verification

93 focused tests passed: period/legacy/RPC loaders, actual React screen state transitions in Happy DOM, existing formulas/exports/Requester behavior, and isolated PGlite SQL integration. Monthly SQL parity includes every column and JavaScript selected summary, task evidence, AI evidence and timing under multiple filters. Fixtures exercise older open work, cross-year/archived tasks, reopened delivery, hidden events, Bangkok month boundaries, anomalous creation dates, permission denial and invalid months. Full-year output matches the original fixture report. Both prepared read-only probe wrappers were rehearsed locally.

`npm.cmd run build:github` changed only `screens-creative-kpi.js`. Node syntax checks, scoped Secretlint and `git diff --check` passed. An IAB preview with synthetic data and blocked API connections visibly verified monthly-ready/export-disabled, annual-failure/retry, then annual-chart/export-enabled states. The temporary tab and server were closed afterward. Screenshot: `C:/SeaTH/Projects/flowmate/output/kpi-performance-20261027/month-first-preview.png`.

The approved monthly production comparison subsequently passed: 131 monthly-scope rows matched every column of the expected month/open-work selection from 408 annual rows, with zero missing/extra rows and matching calendars. Monthly SQL execution took **1,227.757 ms**, plus 30.095 ms planning, in one EXPLAIN run. This includes necessary older open-work context; it is not a Delivered count or the evidence-list count. Real signed-in page timing still needs authentication, assets, transport and rendering. The three-second page target is not yet verified.

## Prepared production boundary

Evidence folder: `C:/SeaTH/Projects/flowmate/output/kpi-performance-20261027`.

1. `period-1-full-month-parity.sql`: compare all October 2026 candidate rows/columns with October/open-work selection from the complete annual shared-gate query, plus calendar parity, in one statement snapshot. Returns only counts/booleans. The annual reference is the previously measured optimized query using the guarded source formulas, not a claim that the slow original annual view was run separately.
2. `period-2-month-plan.sql`: execute and explain the complete monthly JSON query.

Both read-only, authenticated, guarded measurements were explicitly approved and executed once, with eight-second statement timeouts. Exact approved hashes are in `period-probes-manifest.json`; results are in the corresponding `-result.json` files. This two-read authorization is exhausted.

The user approved installation plus two verification reads. The unchanged installer succeeded. `verify-period-installed-parity.sql` returned 132 monthly-scope rows matching the month/open-work selection from 409 annual rows, zero missing/extra rows and matching calendar. `verify-period-installed-timing.sql` returned **1,332 ms**, month scope 2026-10, row count and returned rows both 132, Delivered **76**, AI Delivered **4**, calendar 0, authenticated role, `security_definer=false`, and `anon_can_execute=false`. Snapshot: `2026-10-27T05:31:19.35223+00:00` (12:31 Bangkok). These are later live snapshots than the preceding 131/408-row probes; no claim is made about which user/data change caused the counts to increase. All approved installation verification reads are now used. No frontend publication is included; rollback remains a separate approval.

Prepared installer SHA-256: `8CA5EC743C8E68C51158363EB56D1A73C95B11F3ED80ADDF1964AC7A665E3127`.

Prepared rollback SHA-256: `8444CCA6588BC6F7E021E3FAB0492919FB7CBFC2E7214C0CD442F2C7805FE823`.

Reused worktree `.worktrees/campaign-planner-release` is retained on the dedicated release branch `codex/kpi-month-first-20261027`; the previous `codex/restore-original-legacy-kpi-20261006` branch is preserved. The user approved the scoped commit, integration on the latest release base, push, PR merge, GitHub Pages publication and two signed-in browser measurements. No new worktree or cleanup is included. Unrelated files and canonical dirty work remain intact.

Fresh GitHub `version2.1.1` is `cd19654d10d25716eb4f775436fbc4947782257c`. Its four KPI source/generated files and release-stamp helper match the worktree's original baseline exactly. The old worktree HEAD is an ancestor of that release commit. The three entry pages differ only in existing asset-version stamps. The prepared local release updates all three entry pages to `20261027-01`; integrate the scoped changes on top of the fresh release before the approved push. GitHub Pages read-only metadata confirms legacy branch deployment from `version2.1.1` at `/`. Thus merging the frontend into that branch is also the approved publication boundary. The installed database time alone is not a three-second page guarantee; report the two browser measurements separately after publication.
