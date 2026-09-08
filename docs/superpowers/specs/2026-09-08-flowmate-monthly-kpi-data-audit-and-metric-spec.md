# FlowMate Monthly Creative KPI — Data Audit and Metric Specification

**Date:** 2026-09-08
**Status:** Proposed MVP specification; repository audit completed; no application or production database change
**Audience:** FlowMate Team Lead / Supervisor
**Scope:** Creative Request only; individual views for GD/VE and Requester

## 1. Outcome

FlowMate should answer three separate questions every month:

1. Where does work wait before production starts?
2. How long does Creative production take before the first formal Review submission?
3. Does the Requester provide enough lead time and respond to Review quickly enough for the Launch date?

The dashboard must separate queue, production, requester review, and launch readiness. It must not combine these periods into one personal performance score.

## 2. Approved product decisions

| Decision | Contract |
| --- | --- |
| Work scope | `work_type = 'creative_request'` only |
| Monthly cohort | Month of the first `In Progress -> Review` event in `Asia/Bangkok` |
| Review process | One formal Review stage; a later `Review -> In Progress` event is reported as a rework exception |
| Working calendar | Monday-Friday, excluding active company holidays from `flowmate_non_working_days` |
| Initial Review SLA | Requester first activity within 1 working day after Review submission |
| Individual views | Separate GD/VE and Requester views |
| Statistical display | Always show `n`, median/p50, p85, and average as secondary context |
| Intended use | Coaching, process improvement, capacity planning, and bottleneck removal—not leaderboard scoring |

### Working-time assumption for MVP

Until FlowMate has an approved office-hours calendar, durations are reported in **working-date equivalents**, not employee timesheets. Weekends and configured company holidays are removed. Hour-level SLA must not claim to represent actual productive hours.

## 3. Repository data audit

### 3.1 What exists and can be reused

| Data needed | Current evidence | Readiness |
| --- | --- | --- |
| Stable work-item identity | `work_items.id`, `display_id` | Ready |
| Creative-only filter | `work_items.work_type` | Ready |
| Requester identity | `work_items.requester_user_id` and `users.display_name` | Source ready; requester ID is not exposed by the KPI view |
| GD/VE identity | `final_owner_member_id`, linked `team_members.user_id` | Ready |
| Assignment time | First event with `to_status = 'assigned'` | Already exposed as `assigned_at` |
| Start time | Event with `to_status = 'in_progress'` | Logged; Team Schedule already derives it; KPI view does not expose it |
| Review submission | Event with `from_status = 'in_progress'` and `to_status = 'review'` | Logged; KPI view does not expose it |
| Review decision | `Review -> Delivered` is approval; `Review -> In Progress` is changes requested | Logged with actor; KPI view does not expose it |
| Delivery time | `work_items.delivered_at` and status event | Ready |
| Brief status | `need_brief`, `brief_checked`, `assignment_runs.result` and `ran_at` | Proxy available; no canonical `brief_ready_at` field |
| First-draft and launch milestones | `due_date`, `final_approved_due_date`, `launch_date` | Ready |
| Asset cohort | `creative_request_details.asset_type`, subtype, count, size/format | Source ready; KPI view exposes only platform and size/format |
| Comments / requester activity | `comments.author_user_id`, `created_at`; status-event actor | Source ready; must filter activity to the actual requester |
| Blocked periods | Status events into/out of `blocked` with timestamps | Derivable from event intervals |
| Company holidays | `flowmate_non_working_days(day, scope, active)` | Ready and already used by Team Schedule |
| Event lookup index | `(work_item_id, created_at desc)` | Ready for per-item history |

### 3.2 Current KPI correctness gaps

1. `loadFlowMateKpiRows()` filters the selected month by `due_date`, not Review submission month.
2. `flowmate_kpi_work_items_v` exposes only `assigned_at`; it does not expose start, Review submission, first requester activity, review decision, or blocked duration.
3. The current KPI loader does not enforce `work_type = 'creative_request'`; the UI explicitly labels throughput as Creative plus Quick Tasks.
4. `delivery_result` compares `delivered_at` with `due_date`. This mixes final delivery with the First Draft milestone and can label performance incorrectly.
5. “Avg days to delivered” combines production time with requester waiting time, so it cannot identify who owns the delay.
6. “Avg review rounds” uses all rows as the denominator, including rows that never reached Review.
7. Per-requester analysis lacks `requester_user_id`; display names are not safe stable grouping keys.
8. Asset type/subtype/count and urgent/normal cohort dimensions are incomplete in the KPI payload.
9. Archived Delivered work remains available, but archived Cancelled work can disappear from historical cancellation reporting.
10. The existing milestone helper deliberately counts Thai weekday holidays as working days. Reusing it for the newly approved KPI calendar would violate the KPI contract and could also alter T-7/T-5 scheduling behavior.

### 3.3 Data-quality limitations

- Old work items may have incomplete events or `delivered_at` values without a matching Review event.
- Admin override transitions are logged and must be tagged, not silently mixed with normal workflow.
- A comment after Review is not automatically a Requester response; the author must equal `requester_user_id`.
- The current schema allows a Review item to return to In Progress and increment `review_round`; this must be shown as a rework exception even though the product uses one formal Review stage.
- `brief_completeness_status` does not provide a durable “complete” timestamp. Historical `brief_ready_at` is therefore a proxy unless a canonical event is added.

## 4. Canonical event facts

Create one read-only fact source with one row per Creative Request. The implementation name may be `flowmate_creative_kpi_facts_v`.

| Fact | Derivation |
| --- | --- |
| `brief_ready_at` | First `assignment_runs.ran_at` whose result is `assigned`, `unassigned`, or `queued`; label historical values as proxy |
| `assigned_at` | First event whose `to_status = 'assigned'` |
| `started_at` | First event after assignment whose `to_status = 'in_progress'` |
| `review_submitted_at` | First event whose `from_status = 'in_progress'` and `to_status = 'review'` |
| `first_requester_activity_at` | First requester-authored comment or requester status decision after `review_submitted_at` |
| `review_decided_at` | First requester event `Review -> Delivered`, `Review -> In Progress`, or `Review -> Cancelled` |
| `review_decision` | `approved`, `changes_requested`, or `cancelled` from the transition |
| `rework_at` | First `Review -> In Progress` event after initial Review |
| `blocked_working_duration` | Sum of valid `Blocked -> resumed/closed` intervals that overlap the measured phase |
| `review_open_age` | Working duration from Review submission to report cutoff when no requester activity exists |

Rules:

- Ignore event timestamps earlier than the preceding required phase and expose a `data_quality_flag` rather than repairing history silently.
- Keep both stable IDs and display names in the facts output.
- Use `Asia/Bangkok` before assigning events to a reporting date or month.
- Preserve raw timestamps; format dates only in the UI/export layer.
- Do not store computed KPI values back into transactional work-item rows.

## 5. Metric contract

Every distribution metric must return:

- `n`: eligible work-item count
- `p50`: median
- `p85`: 85th percentile
- `avg`: arithmetic mean, secondary only
- `missing_n`: rows excluded because required events are missing
- `exception_n`: urgent, admin override, rework, cancelled, or invalid-sequence rows

If `n < 5`, show the values with **Small sample** and suppress comparison arrows. If `n = 0`, show **No eligible data**, not zero.

### 5.1 GD/VE individual metrics

| Metric | Formula / denominator | Main interpretation |
| --- | --- | --- |
| Time to start | Working duration `assigned_at -> started_at` | Queue/WIP or delayed pickup |
| Production cycle | Working duration `started_at -> review_submitted_at`, excluding Blocked intervals | Time under Creative production control |
| First-draft on-time rate | `review_submitted_at` local date <= `due_date` / items submitted to Review | Reliability against First Draft |
| Throughput | Count of first Review submissions in selected month | Completed production output |
| Delivered effort | Sum of effort for the same eligible cohort; show alongside item count | Workload context, not a productivity score |
| Rework exception rate | Items with `Review -> In Progress` / reviewed items | Expectation, brief, or craft issue requiring diagnosis |
| Active WIP | Snapshot count currently In Progress | Capacity pressure |
| WIP age | Working duration since current In Progress entry, less Blocked intervals | Work at risk now |
| Blocked share | Items with a Blocked interval / eligible items | Dependency pressure |

GD/VE comparisons must be segmented at minimum by discipline, asset type/subtype, effort band, and normal/urgent. Never rank mixed cohorts.

### 5.2 Requester individual metrics

| Metric | Formula / denominator | Main interpretation |
| --- | --- | --- |
| Brief-to-launch lead time | Working days `brief_ready_at -> launch_date` | How early usable work was requested |
| Late-brief rate | Lead time below the agreed threshold for its asset cohort / eligible requests | Planning risk created at intake |
| Review first-response time | Working duration `review_submitted_at -> first_requester_activity_at` | Responsiveness after Creative submits work |
| Review decision time | Working duration `review_submitted_at -> review_decided_at` | Total approval delay |
| Review SLA rate | First requester activity within 1 working day / reviewed items | Review responsiveness reliability |
| Pending Review age | Working duration from Review submission to report cutoff | Current bottleneck needing action |
| Rework exception rate | Requests changed back to In Progress / decided reviews | Brief/expectation/craft diagnosis input |
| First-draft on-time rate | Same cohort as GD/VE, shown as context only | Separates production outcome from requester behavior |
| Launch-ready rate | Approved/Delivered by `final_approved_due_date`, with Launch-date variance shown separately | Campaign readiness |

Requester metrics must group by `requester_user_id`, not display name. Team and function remain drill-down dimensions.

### 5.3 Team Lead monthly overview

The top-level KPI page should show:

1. Review throughput and effort, with month-over-month trend.
2. Time to start p50/p85 and production cycle p50/p85.
3. Review SLA rate and count of pending Reviews over SLA.
4. First-draft on-time and launch-ready rates as separate milestones.
5. Active WIP and the five oldest WIP items.
6. Late-brief rate and lead-time distribution by asset cohort.
7. Rework exceptions with reason categories and drill-down tasks.
8. Data-quality coverage: eligible, missing, and exception counts.

## 6. Monthly cohort and exclusions

### Flow cohort

Include work whose first `review_submitted_at` falls within the selected Bangkok calendar month. This makes throughput, time-to-start, production cycle, review response, and rework metrics use the same base population.

### Operational snapshot

Active WIP, WIP age, Pending Review, Blocked, and Unassigned are a separate snapshot taken at report time. They are never mixed into completed-flow averages.

### Exclusions and disclosures

| Condition | Treatment |
| --- | --- |
| `work_type != creative_request` | Exclude completely |
| Cancelled before first Review | Exclude from duration distributions; count in cancellation volume |
| Cancelled after Review | Include in review outcome as cancelled; exclude from approval rate denominator or show separately |
| Missing required event | Exclude from that metric; increment `missing_n` |
| Negative/out-of-order duration | Exclude; add `invalid_event_sequence` flag |
| Blocked interval | Remove from production-control duration; show raw elapsed time in drill-down |
| Urgent request | Keep as a separate cohort; do not mix into normal baseline |
| Admin override | Tag and separate from normal workflow baseline |
| Reassigned work | Attribute production to the owner active at `started_at`; disclose transfer count |
| Archived Delivered | Retain in historical month |

## 7. Business-calendar contract

The KPI calendar should use `flowmate_non_working_days` because Team Schedule already uses it.

- Time zone: `Asia/Bangkok`.
- Weekend: Saturday and Sunday.
- Exclude active rows where `scope IN ('all', 'gdve')` for GD/VE production metrics.
- For Requester response metrics, exclude `scope = 'all'`; a future requester-specific scope can be added only when required.
- One-working-day Review SLA means the next eligible working date, preserving the submission-time ordering where hour-level configuration is unavailable.
- Do not modify `flowmate_subtract_working_days()` in the KPI MVP. It is part of the existing T-7/T-5 milestone contract that intentionally counts Thai weekday holidays.

## 8. Security and access

- Individual KPI views are Supervisor/Admin surfaces; ordinary members may see their own metrics only if that scope is explicitly added later.
- The database contract must enforce access. Hiding the KPI navigation is not sufficient authorization.
- Any exposed facts view must use `security_invoker = true` and inherit the readable-work-item scope.
- Prefer a security-invoker query/RPC with an explicit Supervisor/Admin check for individual aggregation.
- Revoke default execution/access, then grant only the minimum required role.
- Never expose comment bodies, brief contents, or personal leave details in KPI output. Only derived timestamps/counts are required.
- Add allow/deny tests for requester, GD/VE, Supervisor, Admin, unrelated Function, and unauthenticated access.

Supabase notes that views otherwise use their creator's privileges by default; Postgres 15+ supports `security_invoker = true`. Grants and RLS are separate controls and both must be tested. See [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 9. Performance contract

- Keep the existing `(work_item_id, created_at desc)` event index.
- Before adding an event-month index, run the intended query with `EXPLAIN (ANALYZE, BUFFERS)` in a non-production environment.
- If the Review-month query scans the full event table, consider a partial/composite index for the exact `to_status = 'review'` and timestamp filter.
- Avoid fetching every event to the browser. Aggregate event facts in Postgres and return only the selected month plus snapshot rows.
- Paginate task drill-down lists; summary metrics must not require downloading unbounded raw history.

## 10. Proposed UI information architecture

### Tab A — Team Overview

- Summary cards: Throughput, Production cycle p50, Review SLA, First-draft on-time.
- Six-month trend: p50/p85 and item count.
- Bottleneck list: oldest WIP and Reviews over SLA.
- Data coverage indicator.

### Tab B — GD/VE

- Add a person dropdown with `All GD/VE` as the team-level default. Selecting one person updates every summary and monthly trend while retaining the team median as a benchmark.
- One row per person with `n`, time-to-start p50/p85, production p50/p85, on-time rate, active WIP, rework exceptions.
- Select a person to view cohort breakdown and contributing work items.
- Show at least six monthly points for production cycle, first-draft on-time rate, and throughput so the Team Lead can distinguish progression from a one-month fluctuation.
- No rank number or composite score.

### Tab C — Requester

- Add a person dropdown with `All Requesters` as the team-level default. Selecting one person updates every summary and monthly trend while retaining the team median as a benchmark.
- One row per person with `n`, brief-to-launch lead time, late-brief rate, review-response p50/p85, Review SLA, pending Review, and rework exceptions.
- Select a requester to view lead-time distribution and affected work items.
- Show at least six monthly points for brief-to-launch lead time, Review response, and Review SLA so improvement or deterioration is visible over time.
- No rank number or composite score.

### Export

Export tabs should use the same facts and filters as the visible dashboard:

1. Summary
2. GD-VE individual
3. Requester individual
4. Flow detail
5. Review detail
6. Data-quality exceptions

## 11. Implementation workstreams and gates

| ID | Workstream | Deliverable | Verification | Gate |
| --- | --- | --- | --- | --- |
| KPI-1 | Data facts | Creative KPI facts view/query and working-calendar helper | SQL fixtures for timestamps, holidays, blocked intervals, RLS | Approval before SQL implementation/apply |
| KPI-2 | Loader | Month/query contract and normalization with stable IDs | Frontend contract tests | After KPI-1 contract passes |
| KPI-3 | Statistics | p50, p85, average, rate denominators, sample flags | Deterministic unit fixtures | After KPI-2 |
| KPI-4 | UI | Team, GD/VE, Requester tabs and drill-down | Desktop/mobile rendered UAT | After KPI-3 |
| KPI-5 | Export | Workbook sheets matching visible metrics | Export fixture comparison | After KPI-3 |
| KPI-6 | Baseline | 8-12 week read-only preview and proposed SLE values | Team Lead review | Separate approval for live read |
| KPI-7 | Release | Build, regression test, deploy-stamp verification | Existing FlowMate release checklist | Separate commit/push/tag/deploy approvals |

## 12. Acceptance criteria for implementation

- [ ] KPI queries return Creative Requests only.
- [ ] Selected month is based on first Review submission in Bangkok time.
- [ ] Time to start, production, and requester review durations are separate.
- [ ] Company holidays affect KPI duration without changing existing T-7/T-5 milestone dates.
- [ ] Review SLA defaults to 1 working day and exposes its denominator.
- [ ] Every distribution shows `n`, p50, p85, average, missing count, and exceptions.
- [ ] First Draft and Final/Launch reliability are separate metrics.
- [ ] Requester aggregation uses stable user ID; GD/VE aggregation uses stable member ID.
- [ ] Small samples and missing data are visible and are not rendered as zero.
- [ ] Individual KPI data is protected by database authorization, not UI visibility alone.
- [ ] Existing Board, List, Calendar, Gantt, Workload, Search, Detail, Notifications, RLS, and exports remain unchanged unless explicitly included.
- [ ] SQL, frontend, export, RLS, desktop, and mobile tests pass before release handoff.

## 13. Baseline and target-setting rule

Do not hard-code a “good” production duration before examining FlowMate data. After the facts contract is verified, preview 8-12 weeks of history by cohort and propose an SLE such as:

> 85% of normal static-graphic requests at effort band M reach first Review within X working days after work starts.

The initial Review response target is already approved as 1 working day. Production and lead-time targets remain evidence-derived from FlowMate history.

## 14. Verification status

| Check | Evidence | Result |
| --- | --- | --- |
| Repository event audit | Status transitions, actors, timestamps, comments and indexes inspected | Pass |
| Current KPI audit | View, loader, month filter, calculations and export inspected | Pass |
| Holiday compatibility | Existing holiday table and T-7/T-5 helper behavior compared | Pass with required separation |
| Supabase security review | Existing `security_invoker`, grants and RLS patterns inspected against current Supabase guidance | Pass for specification |
| Live data completeness | No query was run against `workgrid-test` or Production | Not verified; separate approval required |
| App implementation | No SQL, loader, UI, test, build, commit, push or deploy performed | Not started |

## 15. Sources

- [FlowMate KPI best-practice research](../../research/2026-09-08-creative-request-monthly-kpi-best-practices.md)
- [The Kanban Guide](https://kanbanguides.org/the-kanban-guide/)
- [Microsoft Azure DevOps flow metrics guidance](https://learn.microsoft.com/en-us/azure/devops/report/dashboards/cumulative-flow-cycle-lead-time-guidance?view=azure-devops)
- [Adobe Workfront proof reports](https://experienceleague.adobe.com/en/docs/workfront/using/workfront-proof/work-with-proofs-in-wf-proof/manage-your-work/run-reports)
- [Adobe Workfront proof approval report](https://experienceleague.adobe.com/en/docs/workfront/using/review-and-approve-work/proofing/manage-proofs-in-workfront/manage-proofs/proof-approval-report)
- [Asana creative production](https://help.asana.com/s/article/creative-production)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase changelog](https://supabase.com/changelog)
