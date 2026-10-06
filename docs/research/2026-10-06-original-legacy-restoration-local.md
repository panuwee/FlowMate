# Actual Legacy report restoration — local verification

2026-10-06 · Asia/Bangkok

## Corrected user intent

Restore the actual Legacy reports and their original data/formulas in place of the newer KPI screen. The earlier Legacy-style summary prototype is superseded and must not be included in this release. The user explicitly chose to hide the Task Assign KPI menu temporarily.

## Changes

- `#kpi`, `#kpi-creative` and `#kpi-legacy` render the original `CreativeKpiScreen` / `FlowMateCreativeReportScreen`.
- Sidebar KPI Overview is renamed KPI Report. Task Assign KPI is hidden from the sidebar; its data, permission rules and deep link remain intact.
- `#kpi-requester` renders the original monthly Requester view, also used by the original report's Requester button.
- Creative retains the previously verified bounded progression loader and original formulas, including first Review timing. The newer typed-link KPI formulas are not substituted into this restored report. Link evidence capture itself is unchanged.
- The original Requester aggregate view failed with `57014` in authenticated local browsing. The replacement requester-only loader reads the same security-invoker `flowmate_creative_kpi_facts_v` in batches of at most 40 permitted work-item IDs and calculates the original monthly rollup in JavaScript.
- Continuous percentiles, averages, non-null sample counts, SQL boolean eligibility, quality/rework/exception counts and team/person/month groupings follow `supabase/creative_monthly_kpi_data_foundation.sql`. No new business thresholds or alternative event clocks are introduced. Older months and archived/cancelled candidates retain original fact-view inclusion.
- Timeout batches split recursively. Permission/schema errors, missing fields, changed candidate counts, truncated/duplicate/unexpected facts and cancellation reject the load; no partial report is shown as complete. Refresh cancels prior Requester loads, and unmount aborts them.

## Local proof

- Build completed with `npm.cmd run build:github`.
- 38 tests passed across Creative loader, Requester loader, progression/model/UI, workbook and routing integration files.
- Requester tests cover SQL-style percentile interpolation, null denominators, person/team grouping, old months, 501 candidates, bounded reads, timeout splitting, permission failures, completeness and cancellation.
- Actual authenticated browser at `http://127.0.0.1:4200/.worktrees/campaign-planner-release/home/#kpi` shows the original Creative report: October Delivered **36**, AI Delivered **4**, First Review on time **0/25**, production median **<0.1 d**, time-to-start median **1.9 d**. These are the Legacy definitions, not the newer C01/C02 typed-link measures.
- Actual Requester view after the fix: October sample **26 jobs**, brief-to-launch median **2.0 d**, first-response median **0.1 d**, response SLA **77.8%**, brief first check **100%**. Boss person filter produces **11 jobs**, response SLA **70.0%**, and separate team comparisons.
- The sidebar contains KPI Report, Creative KPI and Requester KPI; Task Assign KPI button count is zero.
- No measurement/task data was written and no SQL was applied.

Screenshots:

- `C:/Users/panuwee.w/.codex/visualizations/2026/10/02/01a0fa98-b92f-7510-bb62-186b24f77a0f/kpi-original-legacy-restored-local.png`
- `C:/Users/panuwee.w/.codex/visualizations/2026/10/02/01a0fa98-b92f-7510-bb62-186b24f77a0f/kpi-original-requester-restored-local.png`

The requester SQL aggregate endpoint still times out; only this frontend path avoids it. Direct live reconciliation against that failed aggregate endpoint is not claimed. Formulas were mapped to its tracked SQL and checked with deterministic test cases. Bounded reads can still take time; no numeric speed guarantee is made.

## Release boundary

Local only, not committed/pushed/published. No production SQL is needed. Retain `C:/SeaTH/Projects/flowmate/.worktrees/campaign-planner-release` on `codex/legacy-report-timeout-20261006` pending review; preserve unrelated changes and superseded prototype files.

Current release files: `app.jsx`, `app.js`, `screens-c.jsx`, `screens-c.js`, `supabase-creative-kpi-report.js`, `src/lib/creative-kpi-requester-loader.test.cjs`, this document, and required release stamps only. Exclude the earlier summary-first workspace/prototype changes. Before publication, validate this scoped candidate against fresh GitHub `version2.1.1`, obtain the current scope's commit/push/Pages approval, and independently verify deployed asset hashes and both authenticated reports.
