# Workgrid OT Request — Design Specification

**Date:** 2026-08-07

**Status:** Final-review corrections approved in principle; written-spec review required before implementation planning

**Product:** Workgrid / Garena FCO Thailand

**Module:** OT Request

## 1. Objective

Add OT Request as the fourth Workgrid module. The module must let employees request or consent to overtime, let an Event Lead or head approve planned OT and verify actual time, warn before the Thai 36-hour weekly OT limit is exceeded, and help managers understand recurring operational causes of OT.

The system is an approval and time-record source for HR. It does not calculate OT pay and does not integrate with payroll in this MVP.

## 2. Locked product decisions

- Use a hybrid workflow: approve planned OT first, then confirm actual time after work ends.
- Present this to employees as one `OT Request`, not as two separate requests. The pre-work fields are the requested schedule; the post-work confirmation adds the actual schedule to the same record.
- Support both individual requests and Event Lead-created group plans.
- Every employee in a group plan must consent individually for that occurrence.
- Event Lead or head verifies actual time before HR receives the record.
- Initial eligible approvers are:
  - Big — `nithidol.k@garena.com`
  - Mac — `weerayut@garena.com`
  - Pluem — `napol.a@garena.com`
- `panuwee.w@garena.com` is the initial `OT Owner`, the highest OT Request role with full visibility across all Functions, requests, event plans, compliance cases, audit history, and exports.
- OT Owner authority is scoped to the OT Request module and does not grant additional rights in FlowMate, Marketing Plan, or Product Book.
- Approver access is assignment-based. Being eligible does not grant visibility into every request automatically.
- Store hours and day type only. HR calculates money outside Workgrid.
- At request, consent, and manager-approval steps, block any action that would make the projected weekly total exceed 36 hours.
- Actual time must always be recordable truthfully. If actual time makes the week exceed 36 hours, save it under `Compliance review required`; do not allow it to become `HR ready` until HR reviews it.
- Do not provide an ordinary override that allows planned OT above 36 hours.
- Employees see their own OT data only. Managers see assigned teams or events. HR/Admin can see all records. Executives see aggregate information by default.
- OT is not an employee-performance score. Management analytics are labelled `OT Health & Root Cause`.

### Final-review corrections approved on 2026-08-10

- Do not remove the pre-work request. An employee must submit the requested schedule and receive the required consent and approval before starting OT, then confirm actual time after the work ends.
- Use one canonical weekly counted-minutes rule. For each occurrence, count submitted actual minutes when actual time exists; otherwise count requested minutes. Never add both values for the same occurrence.
- Accept actual confirmation only after the request is authorized, required employee consent is accepted, and both the requested and reported actual work periods have ended.
- Permit an employee to correct actual time only when the assigned approver explicitly returns the actual record for revision. Once actual time is approved, the ordinary form is immutable; later corrections require a separate audited amendment action.
- Enforce elevated identity allowlists inside every server authorization check. A legacy active role row alone must never grant Owner or HR/Admin visibility.
- The sole initial OT Owner remains `panuwee.w@garena.com`. For this MVP, HR/Admin activation is limited to the fixed approved identities Big, Mac, and Pluem listed above. Their ordinary manager visibility remains assignment-based unless an allowed HR/Admin role is explicitly active.

## 3. MVP boundary

### Included

- Fourth module card on the Workgrid product home.
- OT Request product shell matching existing Workgrid navigation and visual patterns.
- Employee dashboard and personal request list.
- Manager weekly dashboard, approval queue, and root-cause analytics.
- Individual OT request.
- Group Event OT plan with individual employee consent.
- Planned-time approval and actual-time verification.
- Weekly 36-hour validation and warnings.
- Structured OT reasons and optional explanatory detail.
- Audit history.
- HR-ready records and CSV export.
- Supabase persistence and row-level authorization.
- Light and dark appearance support consistent with Workgrid.

### Excluded

- Payroll integration or money calculation.
- Attendance-device integration.
- Continuous GPS tracking.
- Peer visibility into another employee's OT.
- Public employee rankings or OT-based performance scores.
- Time off in lieu calculation.
- Automatic workforce scheduling.

## 4. Home and navigation

The Workgrid home product section contains four cards in this order:

1. FlowMate — Execution
2. Marketing Plan — Planning
3. Product Book — Knowledge
4. OT Request — Workforce

The OT Request card uses the same card dimensions, border, spacing, badge, heading size, paragraph size, icon weight, hover behaviour, and responsive grid rules as the existing three cards.

Recommended card copy:

> Plan overtime, collect employee consent, confirm actual hours, and monitor weekly team workload.

Inside OT Request, the product switcher contains all four modules. The OT Request shell reuses the Workgrid top bar, logo, theme control, signed-in user, typography, spacing tokens, borders, and responsive behaviour.

## 5. Roles and visibility

| Role | Default visibility | Allowed actions |
|---|---|---|
| Employee | Own requests, assignments, weekly total, remaining hours, and action items | Create, edit draft, consent, withdraw before approval, confirm actual time, respond to revision |
| Event Lead / head | Requests explicitly assigned to the approver and employees in assigned event plans | Create group plan, approve/reject planned OT, verify actual time, request revision |
| HR / Admin | All OT records, compliance exceptions, audit history, and exports | Review exceptions, mark HR ready, export, administer eligible approvers |
| OT Owner | Full named and aggregate visibility across every Function, request, event plan, compliance case, audit record, and export | Manage OT roles and approvers, reassign pending work, perform compliance review, and export. Normal approvals still require assignment; administrative intervention requires a reason and audit record |
| Executive / Director | Aggregate function, reason, and trend data by default | View management insight; named drill-down only when explicitly authorized |
| Peer employee | No other employee's hours, reasons, or request history | View shared event information necessary to perform the work, without private OT detail |

An Event participant may see aggregate progress such as `Consent received 7/10`. They do not see which peers have or have not consented unless they are an assigned Event Lead.

The initial OT Owner is `panuwee.w@garena.com`. This identity must be configured server-side and protected by RLS; hiding or showing UI controls is not an authorization mechanism.

## 6. Information architecture

### Employee navigation

- Overview
- My requests
- Event assignments
- New OT request

### Manager navigation

- Weekly overview
- Approval queue
- Team OT
- Root causes
- Reports & export, visible only where authorized

The same user may have both employee and manager capabilities. The navigation adds manager destinations without replacing the personal view.

## 7. Employee dashboard

The employee dashboard answers three questions immediately:

1. How much OT do I have this week?
2. What do I need to do next?
3. What is the status of my requests?

### Required components

- Current weekly total displayed as `used / 36h`.
- Remaining hours and progress bar.
- Planned, approved, and confirmed actual hours shown separately.
- Warning states at 24 hours, 30 hours, and 36 hours.
- Action cards for:
  - Consent required.
  - Planned request returned for revision.
  - Actual-time confirmation required.
  - Actual time returned for revision.
  - Compliance review status.
- Primary action: `New OT request`.
- `My OT requests` list with date, assignment, planned/actual hours, status, and next action.
- Weekly history without other employees' information.

## 8. Manager dashboard

The manager dashboard is a Weekly Operations Hub, not a leaderboard.

### Summary cards

- Planned OT hours.
- Confirmed actual OT hours.
- Requests needing approval.
- Employees near the weekly limit.

### Weekly table

Group by Function by default. Supported functions follow existing Workgrid team terminology:

- GD/VE
- Ops
- MKT
- eSport

Columns:

- Employee.
- Function.
- Assignment or event.
- Planned hours.
- Actual hours.
- Weekly total.
- Remaining hours.
- Status or required action.

The manager may filter by week, Function, event, reason, status, and near-limit state. Named rows are only returned when the signed-in user is the assigned approver or has HR/Admin access.

## 9. OT Health & Root Cause

This area explains operational patterns. It must not present OT volume as a measure of employee value, commitment, or productivity.

### Required reason categories

- Offline Event / Tournament Operation
- Campaign or Patch Launch
- Live Incident / Emergency
- Workload Exceeds Capacity
- Partner or External Schedule
- Rework / Quality Issue
- Scope Changed After Work Started
- Travel / Off-site Operation
- Other, requiring explanatory detail

### Management views

- OT hours by Function.
- OT hours by structured reason.
- Planned versus emergency OT.
- Planned versus actual variance.
- Recurring OT by week.
- Event plans whose actual time repeatedly exceeds plan.
- Rework and scope-change share.
- Workload concentration across employees.

### Insight rules for the MVP

Insights are deterministic summaries, not AI judgements. Examples:

- A Function's confirmed OT changed by at least 25% versus the previous four-week average.
- The same person exceeded 24 hours for two consecutive weeks.
- An event's actual hours exceeded its plan by at least 20%.
- Emergency OT represents at least 30% of a Function's confirmed hours.
- Rework or scope change appears in at least three confirmed requests within four weeks.

Every insight links to the filtered records the authorized viewer is allowed to see. Executive aggregate views must not reveal employee names by default.

## 10. Individual request workflow

1. Employee opens `New OT request`.
2. Employee enters the minimum required information.
3. Workgrid calculates planned duration and projected weekly total.
4. Workgrid shows remaining weekly capacity and warning state.
5. Employee confirms the per-occurrence consent statement.
6. If projected total exceeds 36 hours, submission is blocked with an explanation.
7. Request is submitted to one eligible approver.
8. Approver approves, rejects, or returns it for revision.
9. A returned pre-work request leaves the approver queue until the employee edits and resubmits it; the schedule, consent, overlap, and weekly limit are revalidated.
10. After the requested end time, Workgrid asks the employee to confirm actual start, end, and break.
11. The server accepts the actual confirmation only when plan authorization and required consent are present, the work period has ended, and the actual record has not already been approved.
12. Workgrid calculates actual duration and the canonical counted weekly total, replacing requested minutes for this occurrence with submitted actual minutes.
13. Approver verifies or returns the actual record.
14. An actual record returned for revision may be corrected and resubmitted. An approved actual record is locked from ordinary editing.
15. A compliant verified record becomes `HR ready`.

## 11. Event group-plan workflow

1. Event Lead creates one event plan with common schedule, venue, Function, reason, and approver.
2. Event Lead selects participating employees.
3. Workgrid creates one individual assignment/request per employee linked to the event plan.
4. Each employee receives an individual consent action.
5. Workgrid evaluates the 36-hour limit separately for each employee before accepting consent.
6. Event-plan creation records the Event Lead's planned-time authorization. An employee who consents and passes the limit check moves to `Approved` without a duplicate plan-approval click.
7. Employees who do not consent remain `Awaiting consent` and must not be counted as confirmed event staffing.
8. After the event, every employee confirms actual time; the common schedule may be prefilled but remains editable to reflect reality.
9. Event Lead can review multiple records in one screen but each actual-time verification remains an individual audited action.

Bulk approval must not bypass missing consent, limit errors, actual-time exceptions, or required reasons.

## 12. Status model

| Status | Meaning |
|---|---|
| Draft | Saved but not submitted |
| Awaiting consent | Event assignment requires employee consent |
| Pending approval | Employee consent is present and manager decision is required |
| Approved | Planned OT is authorized |
| Rejected | Planned OT was rejected with a reason |
| Plan revision required | Employee must correct and resubmit the requested schedule; the request is not actionable by the approver until resubmitted |
| Actual confirmation required | Planned end time passed and actual time is missing |
| Actual revision required | Approver returned the submitted actual time; employee may correct and resubmit it |
| Pending actual verification | Employee submitted actual time; approver must verify |
| Compliance review required | Actual hours were truthfully recorded but the weekly total exceeds 36 hours |
| HR ready | Verified and compliant record is ready for HR export |
| Exported | Included in an HR export batch |
| Cancelled | Cancelled with reason; retained in audit history |

The database stores consent, plan approval, actual verification, compliance review, and export as separate facts. The UI status is derived from those facts to avoid losing audit meaning.

## 13. Weekly-limit behaviour

The week boundary uses the organization's configured workweek and Bangkok time. For the MVP, the default is Monday 00:00 through Sunday 23:59 in `Asia/Bangkok`.

Every request, consent, approval, actual-compliance check, preview, and dashboard uses the same canonical weekly counted-minutes calculation under the employee-week lock:

1. Split each occurrence across Bangkok Monday-Sunday workweeks.
2. If actual time has been submitted for an occurrence, count its actual segment minutes even while manager verification or compliance review is pending.
3. Otherwise count its requested segment minutes.
4. Never add requested and actual minutes for the same occurrence.
5. Draft, rejected, and cancelled requests do not consume the projected total. Completed, HR-ready, and exported occurrences remain in historical weekly totals using actual minutes.

This replacement happens when truthful actual time is submitted, rather than waiting for manager verification, so a pending actual cannot temporarily hide a weekly overage. For example, a submitted 20-hour actual plus another active 20-hour request counts as 40 hours and enters the compliance path.

### Request, consent, and approval

- Below 24 hours: neutral progress display.
- At 24 hours: advisory warning.
- At 30 hours: high-risk warning displaying remaining hours.
- At 36 hours: limit reached.
- Above 36 hours: block submission, consent, and plan approval.

The error states exactly which week is affected, the current counted hours, requested additional hours, and allowed remaining hours.

### Actual-time confirmation

After authorized OT has occurred, truthful actual time is always recordable even when it exceeds the requested schedule or weekly limit. If it makes the weekly total exceed 36 hours:

- Save the truthful actual time.
- Display a critical alert to the employee and approver.
- Require the employee to explain the variance from plan.
- Require the Event Lead/head to verify the actual record and add a management note.
- Set `Compliance review required`.
- Prevent `HR ready` and normal export until HR records its review outcome.
- Retain the original actual time; do not permit silent reduction to make the record fit the limit.

HR review records the outcome and note. It does not rewrite the historic worked time.

Truthful recording does not mean actual time may bypass authorization. The server rejects an ordinary actual submission unless all of these conditions are true:

- The pre-work request was authorized by the assigned approver, or by the Event Lead's event-plan authorization.
- Required per-occurrence employee consent is accepted.
- The requested end time and supplied actual end time have passed in Bangkok time.
- No actual approval is already recorded.
- The request is awaiting its first actual confirmation, or the assigned approver explicitly returned the actual for revision.

An approved actual is immutable through the normal employee RPC. A separate authorized amendment records the old value, new value, actor, immutable actor-email snapshot, reason, and timestamp; it must re-run weekly compliance and downstream HR/export checks rather than erase the prior decision.

## 14. Minimum data collected

### Planned request

- Request ID.
- Employee user/profile ID.
- Function.
- Request source: self or event assignment.
- Optional event plan ID.
- Assignment or event title.
- Work date.
- Planned start and end.
- Planned break duration.
- Planned OT duration, calculated server-side.
- Day type: workday, weekly holiday, or public holiday.
- Work location type: office, remote, or venue.
- Venue text when relevant.
- Structured reason.
- Required explanatory detail for `Other`, `Emergency`, `Rework`, or `Scope Changed`.
- Optional related Workgrid task, campaign, Product Book item, or external reference.
- Assigned approver.
- Employee consent statement version and consent timestamp.

### Actual confirmation

- Actual start and end.
- Actual break duration.
- Actual OT duration, calculated server-side.
- Variance reason when actual differs from plan by more than 30 minutes.
- Employee confirmation timestamp.
- Approver decision, note, and timestamp.
- Compliance-review outcome and timestamp where applicable.
- HR-ready and export batch metadata.

### Audit

- Actor user ID and email snapshot.
- Action.
- Previous and new status.
- Changed fields.
- Reason or note.
- Timestamp.

No password, payroll rate, salary, bank information, or continuous location history is stored.

## 15. Data architecture

Use isolated OT tables and service functions so the module can evolve without coupling OT approval to FlowMate work-item status.

### Core tables

- `ot_event_plans`: shared event information and creator/approver assignment.
- `ot_requests`: one employee and one OT occurrence per row, optionally linked to an event plan.
- `ot_system_roles`: OT-specific owner and administrative role assignments.
- `ot_approvers`: eligible approver email and active state.
- `ot_request_audit`: append-only workflow and field-change history.
- `ot_export_batches`: HR export metadata and included request IDs.

Calculated durations and limit validation are enforced by Supabase functions, not trusted from browser input. RLS enforces the visibility matrix. The UI may predict totals for immediate feedback, but the server result is authoritative.

Initial approvers are seeded in `ot_approvers`. A request or event plan explicitly selects an eligible approver; eligibility alone does not provide global read access.

`panuwee.w@garena.com` is seeded as the active `owner` in `ot_system_roles`. OT Owner checks happen in Supabase authorization functions and RLS policies. The frontend must not hardcode a global-visibility bypass.

Every Owner and HR/Admin authorization function validates the normalized signed-in email against the fixed server allowlist in addition to checking the active role row and active user account. This check applies to RPC access, RLS, compliance, audit, and export reads. The Owner may deactivate an unauthorized legacy role through an audited remediation path, but that legacy role receives no elevated access while remediation is pending.

## 16. Errors and edge cases

- Overnight OT: allow end time on the next date and allocate the occurrence to the date on which OT started; show both dates clearly.
- Multiple requests on the same day: count all active durations and warn about overlaps.
- Overlapping planned or actual times: block submission until corrected.
- Missing consent: never approve or bulk approve.
- Approver creates a group plan: creation records plan authorization, but individual consent is still mandatory.
- Approver becomes inactive: HR/Admin reassigns pending records; history retains the original approver.
- OT Owner administrative intervention: require a reason, retain the originally assigned approver, and append an audit event; never silently impersonate the assigned approver.
- Employee withdraws before approval: mark cancelled and release projected hours.
- Approved plan changes materially: invalidate prior consent when date, planned time, employee, or assignment changes; request new consent.
- Actual time differs from plan: require a variance reason when difference exceeds 30 minutes.
- Actual submitted before plan authorization, before required consent, or before work ends: reject server-side and keep the record unchanged.
- Actual already approved: reject ordinary resubmission; use the audited amendment workflow instead.
- Legacy Owner or HR/Admin role outside the fixed email allowlist: deny elevated authorization even when an old active role row exists; permit only the Owner's audited deactivation remediation.
- Request crosses a week boundary: split calculated duration across the affected organization workweeks for limit checking and reporting.
- Network failure: preserve the form locally in memory during the session and show a retry state; never claim submission succeeded without a server response.
- Duplicate submission: use an idempotency key for create, consent, approval, actual confirmation, and export actions.
- Past edits: create an audited amendment; do not overwrite an exported record silently.
- Dark mode and mobile: warnings, status colours, labels, and actions remain readable without relying on colour alone.

## 17. Visual system

The module extends the existing Workgrid design rather than introducing a new visual language.

- White or existing theme canvas.
- Existing Garena red as the primary action and critical-warning accent.
- Existing Workgrid font family, weights, and type scale.
- Existing top bar, product switcher, user control, borders, radius, and spacing rhythm.
- Restrained cards with flat borders; no decorative gradients, oversized KPI typography, or unrelated illustration.
- Warning hierarchy uses icon, label, copy, and colour together.
- Desktop prioritizes weekly overview and tables. Mobile stacks KPI cards, keeps the main action visible, and turns wide tables into compact request cards.
- Employee pages never expose team analytics through responsive or hidden DOM content.

## 18. Acceptance criteria

### Home and shell

- Home displays FlowMate, Marketing Plan, Product Book, and OT Request as four visually consistent modules.
- OT Request opens its own shell and appears in the product switcher.
- Light, dark, desktop, and mobile layouts match existing Workgrid patterns.

### Employee

- Employee sees only their own OT data.
- Employee can create, consent to, track, and confirm an OT occurrence.
- Employee sees requested, approved, actual, canonical counted weekly total, and remaining hours without payroll amounts.
- Employee sees actionable warnings during request and actual confirmation.
- Employee cannot submit actual time before authorization, consent, or the end of work, and cannot overwrite an approved actual through the ordinary form.

### Manager

- Assigned approver sees only explicitly assigned requests and events.
- Weekly dashboard groups employees by Function and shows requested, actual, canonical counted total, remaining, and status without double-counting an occurrence.
- Approver can approve/reject planned OT and verify/return actual time with an audit note.
- Group-plan actions never bypass individual consent or validation.

### Compliance and HR

- Server blocks request, consent, and plan approval when projected OT exceeds 36 hours for the affected week.
- Server accepts truthful actual time above the limit and routes it to `Compliance review required`.
- A submitted actual replaces requested minutes for the same occurrence in every weekly calculation, including while actual verification or compliance review is pending.
- Mixed weeks count submitted actual minutes for completed occurrences plus requested minutes for occurrences without actual time; a 20-hour actual plus a 20-hour active request is treated as 40 hours.
- Over-limit actual records cannot become `HR ready` or enter a normal export before HR review.
- HR can export HR-ready records with day type and hours but without payroll calculations.
- Every material action has an append-only audit record.
- `panuwee.w@garena.com` has OT Owner visibility across all named and aggregate OT data after server-side role resolution.
- OT Owner access remains restricted to OT Request and does not widen permissions in other Workgrid modules.
- An OT Owner approval or verification outside the normal assignment path requires an intervention reason and audit record.
- Owner and HR/Admin access requires both an active role and a normalized email in the fixed server allowlist; unauthorized legacy role rows receive no elevated data access.

### Insight

- Root-cause dashboard reports Function, structured reason, plan-versus-actual variance, recurring OT, and emergency share.
- No employee leaderboard or OT-based performance score exists.
- Executive views are aggregate by default.

## 19. Verification strategy

- Unit tests for duration, break, overnight, workweek split, projected total, actual replacement, mixed requested-plus-actual weeks, thresholds, and status derivation.
- SQL/RLS tests for employee, assigned approver, non-assigned approver, HR/Admin, OT Owner, and executive aggregate access.
- Executable disposable-Postgres tests for migration compilation, mixed requested-plus-actual accounting, actual state transitions and immutability, fixed role allowlists, locks, idempotency, and export gates. Source-text assertions alone are not sufficient evidence for these backend rules.
- Negative authorization tests proving the OT Owner role does not grant additional access to FlowMate, Marketing Plan, or Product Book data.
- Workflow tests for self request, group event plan, rejection, revision, withdrawal, actual verification, compliance review, and export.
- Idempotency tests for every workflow mutation.
- Static-build tests confirming source and GitHub output stay synchronized.
- Browser QA for home card, employee dashboard, manager dashboard, request flow, warnings, dark mode, mobile, keyboard navigation, and no unauthorized data in the page or network responses.
- Production SQL execution, deployment, live authentication, and payroll handling remain separately verified release activities.

## 20. References

- Thailand Ministry of Labour: overtime must be controlled within the applicable weekly limit — <https://www.mol.go.th/en/news/employees-do-ot-and-work-over-36-hours-week-illegally-2>
- Thailand Labour Protection Act English reference — <https://natlex.ilo.org/dyn/natlex2/natlex2/files/download/49727/THA81031%20Eng%202014.pdf>
- SAP SuccessFactors employee time-sheet patterns — <https://help.sap.com/docs/successfactors-employee-central/using-time-management-in-sap-successfactors/features-and-functions-of-employee-central-time-sheet-for-employees>
- SAP SuccessFactors manager approval-center patterns — <https://help.sap.com/docs/successfactors-employee-central/using-time-management-in-sap-successfactors/using-time-sheet-approval-center?locale=en-US>
- SAP threshold error and submission-blocking pattern — <https://help.sap.com/docs/successfactors-release-information/8e0d540f96474717bbf18df51e54e522/fb6a5ff34b0b46e48265aa472c61f9c9.html?locale=en-US>
