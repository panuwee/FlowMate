# KPI asset submission update — local review

Confirmed by the user on 2026-10-05. Local changes only; no production SQL, commit, push or deployment.

| Metric | Submission evidence | Due field | Rule |
| --- | --- | --- | --- |
| C01 · First Draft Submitted On Time | First server-created `add_link` event with `link_kind=first_draft` and `kpi_evidence_source=link_zone_v1` | `work_items.due_date` (Asset First Draft Due) | Submission date ≤ due date |
| C02 · Final Asset Submitted On Time | First equivalent `final_asset` event | `work_items.final_approved_due_date` (Asset Final/Approved Due) | Submission date ≤ due date |
| C04 · Completed Work | First Delivered event or existing delivery milestone | Not applicable | Existing completion count |

C03 is removed from metrics, selector and exports. Final Asset is a submission for acceptance, never an automatic completion.

The month is based on the first typed submission for each stage. Dates compare in Asia/Bangkok, inclusive through the end of the due day. Multiple links for one stage do not replace its first time. Soft-deleting a visible link does not delete submission history. Untyped historical links and Review/Delivered status changes cannot substitute for typed submission evidence. No fabricated historical scores.

Due values come directly from the current Asset Due fields, as requested. They are not the previous separate KPI agreement records; editing those Asset Due fields can change the result on refresh. Missing due dates are excluded from the measured denominator and remain visible as missing evidence. Source failures suppress affected metrics instead of showing 0%.

Creative candidate scans use separate bounded status/milestone and typed-link-event reads. Typed-only open work is included even before Review or Delivered. Creative no longer loads unused brief-readiness or separate KPI measurement evidence. Existing access gates, RLS, cancellation exclusions and C04 completion attribution remain intact. The Owner at Completion filter still requires historical completion-owner evidence; open work without it remains under Unknown Owner.

## UI

All new KPI workspace interface copy, controls, metric names, errors, dates, evidence capture and CSV results use English. User-entered task titles and other source content remain as entered. KPI Overview navigation is English. Removed the month/timezone paragraph, snapshot paragraph, definitions disclosure and technical/version footer. Retained concise data/loading/error states and evidence coverage.

## Verification

- Build passed; strict TypeScript check passed.
- Node tests: **74/74 passed**, including SQL simulation, typed submissions, first-event/month boundaries, due dates, idempotency, schema fallback, failures, authorization and CSV.
- Vitest: **12/12 passed** for existing monthly KPI UI/data foundation and Task Assign detail.
- Separate fixture `kpi-asset-local-preview.html` uses synthetic data and no Supabase connection. With 2 of 3 on-time samples per stage, C01 and C02 each display 66.7%. Keep this fixture out of production release assets.
- Production evidence-write E2E remains unverified. The proposed typed-link SQL has not been applied.
- Browser verification: the real local Creative page displays the English controls, C01/C02 new names and no C03 or removed explanatory blocks. C04 reads 30 completed tasks in the October snapshot; C01/C02 show No Data because no typed submission events exist yet. The separate offline fixture verifies both 66.7% rates and expands the submission timestamps and matching due fields.
- `git diff --check` passed. Existing broad legacy UAT navigation-string failures from the preceding local review were not repaired as part of this KPI update.

## Release package

Include the Link Zone package plus `kpi-workspace.ts` / generated `.js`, `screens-kpi.jsx` / generated `.js`, and `app.jsx` / generated `.js` (KPI Overview label). Include revised tests and this document. Exclude unrelated `output/campaign-planner/` and the standalone synthetic preview from published assets.

Apply the reviewed typed-link SQL only after explicit production authorization, before publishing the frontend. Until installed and real typed links are submitted, C01/C02 correctly show No Data; the local fixture percentages are not production performance. Prepare a new asset stamp for any authorized release and verify live assets separately.

Worktree retained at `.worktrees/campaign-planner-release` on `codex/kpi-production-release` for review. No cleanup performed.
