# Creative KPI timing diagnostic — prepared locally

## Reason and scope

Release 20261027-01 is live through PR #19. The reliable second signed-in browser observation saw complete selected-month KPI/evidence at 5.287 seconds and annual/export readiness at 8.993 seconds. The first load's external polling ended before readiness, leaving an observation gap. These observations do not identify the remaining dominant stage.

This follow-up adds an **opt-in timing diagnostic**, not a proven speed improvement. It preserves the same report calls, formulas, permissions, caches and visible controls. No SQL changes, extra report requests, persistent cache, telemetry service or external logging.

## How it works

- Enabled only with `?kpiTiming=1` in the page URL. Ordinary visits do not create a recorder or schedule diagnostic frames.
- Uses the page's monotonic `performance.now()` clock, relative to navigation. The screen module records its availability; the existing app auth initialization records start and resolution without changing its flow.
- For each load generation, records screen effect, monthly/annual request start, validated response, report calculation duration, React commit and a two-animation-frame paint opportunity.
- The local `data-kpi-timing` DOM attribute contains only fixed labels, numeric timings and cache flags. It contains no URLs, user identities, task payloads, tokens or raw errors. It is not uploaded or persisted by the app.
- Monthly marks remain available after the annual result, so delayed inspection does not lose the monthly timestamp. Aborted generations cancel pending frame callbacks and cannot overwrite the current result. Cache reuse is explicitly marked and excluded from cold-read acceptance.
- A paint opportunity is not proof of physical screen pixels. Hidden tabs do not record it; a missing paint mark cannot count as success. A screenshot/visible-state check remains necessary.

## Reading the result

Save the exact diagnostic object from the report element as local JSON, then run:

```
node scripts/check-creative-kpi-timing.cjs <local-timing.json>
```

Exit 0 means every supplied fresh monthly sample is within the 3,000 ms paint-opportunity budget. Exit 1 means over budget, incomplete, failed or cached/ineligible. Exit 2 means malformed input. Monthly request timing includes client/session work, transport, server work, response parsing and validation; it **does not** isolate SQL execution or network time. Response-to-commit includes calculation, scheduling and render work. Do not subtract an older SQL probe to infer network latency.

The local React harness deterministically exercises both sides of the acceptance gate: a monthly paint opportunity at 2,532 ms passes; 3,832 ms fails; a hidden-tab commit at 2,000 ms without a paint opportunity is incomplete; cached annual reuse is ineligible. Tests also verify unchanged request counts, monthly-before-annual rendering and cancelled-request isolation. These synthetic times are not production performance claims.

## Proposed production check, not yet authorized

1. Review/commit only the scoped diagnostic sources, generated JS, checker, test, this document and the three entry-page stamps (proposed 20261027-02). Integrate fresh GitHub version2.1.1 without overwriting concurrent changes; push a dedicated follow-up branch and open/merge a PR to publish Pages.
2. Verify published asset hashes and version before any report load.
3. Perform exactly **two signed-in page loads** at `/FlowMate/home/?kpiTiming=1#kpi`, each with a maximum 30-second observation window. One navigation and one reload. Each normal load requests the selected month then the year; do not press Refresh, retry, change month, call SQL separately or download Excel. Retain the user's existing sign-in.
4. Capture only the diagnostic object, complete monthly/annual UI state and a screenshot. Stop on access errors, wrong report scope or unexpected behavior; do not repeat beyond two loads. Report incomplete/hidden-tab results honestly.
5. Choose the next fix based on the measured dominant stage. Any new SQL, publication or additional live reads needs its own scope. Remove the temporary diagnostic in a later approved release after the cause is established; do not leave it permanently enabled.

Publication changes the deployed assets for all visitors, although timing collection requires opt-in. The user's approval for release 20261027-01 and its two loads is already used; this next production boundary requires a new approval under the project working agreement. Local preparation and isolated tests are authorized by the continuing performance-fix request.

Worktree retained: `C:/SeaTH/Projects/flowmate/.worktrees/campaign-planner-release`. No commit, push, merge, production SQL or live report load for this follow-up has been performed. Preserve unrelated untracked files and canonical checkout work. No cleanup, tag or GitLab release is included.
