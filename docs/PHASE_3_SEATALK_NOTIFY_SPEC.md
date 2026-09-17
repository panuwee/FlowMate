# FlowMate Phase 3 Spec — Battle Pass SeaTalk notifications (notify-only)

Status: **Revision 3 — implemented, deployed, live-tested, and activated.**
Date: 2026-09-17

This revision replaces revision 1's DM-only routing and `month_complete` success definition.
Implementation, production SQL, deployment, and controlled live tests were performed only after separate user authorization.

## 1. Approved behavior

| Setting | Approved value |
|---|---|
| SeaTalk App ID | `NTgyNzAzMjc5MjE4` |
| Bot SeaTalk ID | `9176915525` |
| Brief-ready recipient | Group `ODg5NDI1MDQwODI3` |
| Error recipient | SeaTalk DM to `panuwee.w@garena.com` |
| Operator SeaTalk ID | `1377500911` (identity reference; delivery resolves employee code from email) |
| Group button | Open the specific Creative Request in FlowMate |
| Error button | Open Battle Pass diagnostic/status details in FlowMate |

**“สร้างบรีฟสำเร็จ พร้อมตรวจ” requires all three committed facts:**

1. Battle Pass Brief exists in Working Sheet.
2. Its Creative Request exists in FlowMate, and the Working Sheet Creative Request Link points to that same request.
3. That Creative Request has status **Unassigned** (`unassigned`).

Only then send the group notification. Partial creation is not success. An actual error is sent
to the operator DM. Created/ready for review does not mean approved, assigned, or released to Creative.
The notification does not change assignment, review holds, or approval state.

Working Sheet here means FlowMate's Working Sheet; this spec adds no write-back to the source Google Sheet.
Operator routing is explicit and does not follow Google connection ownership or every user in `require_operator()`.

## 2. Scope and authorization boundary

- One-way outbound notifications. All review and operational decisions remain in FlowMate.
- No SeaTalk callback, approval/rejection, retry, pause/resume, or status mutation.
- Preserve existing OT and Creative notification behavior.
- Preserve Battle Pass suppression on `public.notifications` and, where present, `private.creative_seatalk_outbox`.
  The approved brief-ready group alert is an explicit separate delivery, not removal of those suppression rules.
- No Alpha/MCP capability is added.
- Implementation, production SQL, commit/push, deployment, and real-message tests retain their project authorization boundaries.

## 3. Events and evidence

Required first delivery: `brief_ready`, `run_failed`, and `run_held`.

| Event | Eligibility | Recipient |
|---|---|---|
| `brief_ready` | All three readiness facts in §1 pass after commit | Approved group |
| `run_failed` | Durable automation failure, including failures before a monthly run exists | Operator DM |
| `run_held` | Run blocked for source/manual review | Operator DM |
| `recovery_pending` (optional follow-up) | Diagnosis is approvable and undecided | Operator DM |
| `retry_outcome` (optional follow-up) | Approved retry has a terminal outcome | Operator DM |

### 3.1 Readiness verification

Do not use `monthly_runs.state = 'complete'` alone. Current local source in
`../supabase/battle_pass_production.sql` creates the request, Working Sheet row, and linkage in
`battle_pass_production_finalize`:

- `monthly_runs.task_id` identifies `marketing_content_items`, the Working Sheet row.
- `monthly_runs.brief_id` identifies `work_items`, the Creative Request.
- The Working Sheet row's `flowmate_work_item_id` must equal that request ID.
- Its `brief_link` must resolve to the same request; current creation code uses the request display ID in the URL.
- The request must have `work_type = 'creative_request'` and `status = 'unassigned'`.

Read committed data and record eligibility time. A transaction still in progress is not itself
an error. Missing or inconsistent output after finalization is an operator error, never group success.
Recheck immediately before sending: if the request has advanced beyond Unassigned, cancel the stale
ready-for-review alert with a reason. Do not reset its status to make it eligible.

### 3.2 Error coverage

Inspect durable worker/tick failures as well as monthly-run state. Source access, authentication,
validation, request creation, and linking errors must not depend on a monthly run already existing.
Use a stable incident identity when a period or run ID is unavailable. Verify the actual evidence
path for each stage during implementation; polling monthly-run state alone is insufficient.

Scheduler inactivity and notifier inactivity require separate health checks, with an agreed
threshold and monitoring owner before rollout. A missing monthly success message is not a health monitor.

### 3.3 Optional recovery events

Recovery events are follow-up scope and do not block the required brief-ready/error delivery.
`retry_outcome` requires verified availability of the 2B.5 outcome-log slice before implementation.
Use `recovery_guards()` for approvability and preserve the terminal outcome and attribution:
`ambiguous` must say the month completed but cannot be attributed to the approved retry;
`none` must not claim that the retry succeeded. Exact attribution alone is not a success verdict.

## 4. Delivery architecture and future reuse

Proposed server flow:

```text
Periodic detector -> committed output/error checks -> outbox per recipient
                 -> authenticated Edge Function -> SeaTalk -> record delivery result
```

Separate event detection, recipient routing, message rendering, and SeaTalk delivery. Start with
Battle Pass rules; future domains can reuse the delivery contract without adding their rules to
Battle Pass. No generic workflow engine or migration of OT is required.

Proposed Edge Function: `supabase/functions/battle-pass-seatalk/`.
Use the existing Battle Pass SQL dispatch pattern (`net.http_post` and a paused `pg_cron` job).
A 15-minute detection interval is a proposal, implying up to one interval plus delivery delay.
No network send occurs inside the business transaction. Notification failure must not roll back
or mutate production runs, requests, decisions, or outcomes.

### 4.1 Outbox contract

Proposed `battle_pass_private.seatalk_notifications` fields:

- Identity: `notification_id`, `domain`, `event_kind`, `subject_key`.
- Routing: `recipient_kind` (`group` or `user`), `recipient_key` (approved configuration reference).
- Message: `period`, allowlisted `payload`, `template_version`, `eligible_at`.
- Delivery: `status`, `attempt_count`, `next_attempt_at`, `dispatch_key`, `lease_expires_at`, `send_started_at`.
- Audit: `seatalk_message_id`, sanitized `last_error`, reason, `created_at`, `updated_at`.

Unique key: `(domain, event_kind, subject_key, recipient_kind, recipient_key)`.
Each recipient has independent delivery state; a successful recipient is not resent because another failed.

| Event | Subject identity |
|---|---|
| `brief_ready` | Period + Creative Request ID |
| `run_failed` | Stable incident identity + sanitized meaningful error fingerprint |
| `run_held` | Period + hold fingerprint |
| Optional `recovery_pending` | Diagnosis ID |
| Optional `retry_outcome` | Decision ID |

Repeated identical errors create one delivery per recipient. If reusing `diagnosis_fingerprint`,
verify its identifier contract: current source reads a production tick by `run_id`; do not blindly
supply a monthly-run UUID. Cover missing ticks and pre-run errors separately.

Enable RLS and revoke direct table access from browser roles and `service_role`. Define narrow
claim/finish RPCs with explicit service-role grants, authorized execution owner, and safe search path.
This adds notifier RPC access, not business mutation privileges. Health read access must use a
separate authorized, sanitized operator view/RPC rather than exposing raw outbox payloads.

### 4.2 Claims and delivery uncertainty

Atomically claim due rows using a unique dispatch key and bounded lease. Finish compares the active
key, so a stale worker cannot overwrite a later claim. Record send start before provider IO.

States: `pending`, `dispatching`, `sent`, `failed`, `delivery_unknown`, `cancelled`.
Expired leases without send start can be reclaimed. Ambiguous timeouts or expired leases after send
start become `delivery_unknown` for reconciliation instead of blind automatic resend.
A lease prevents simultaneous claims; it cannot guarantee exactly-once delivery across SeaTalk and
the database. Test provider acceptance followed by failed database finish explicitly.

## 5. SeaTalk sender and credentials

Use App ID `NTgyNzAzMjc5MjE4` and approved secret storage for its App Secret. Never store credentials in
source, ordinary documents, payloads, or logs. Keep the scheduler secret and provider credentials distinct.
The existing Vault dispatch pattern can authenticate SQL-to-Edge requests; finalize provider-secret
retrieval during implementation without granting broad secret access.

If `verify_jwt = false` is used, validate `x-battle-pass-token` before claiming or sending anything.
The HTTP endpoint remains publicly reachable but rejects unauthorized requests; it is not a private
network endpoint. No browser user-auth path or SeaTalk callback handler is introduced.

- Group: configured `group_id` -> `/messaging/v2/group_chat`.
- DM: configured email -> `employee_code` lookup -> `/messaging/v2/single_chat`.
- Cache app tokens until expiry; handle documented invalid-token responses with bounded refresh.
- Use compatible OT provider helpers without modifying the working OT path. Group routing is new code,
  not a verbatim copy of its DM sender. Record copied origin/commit and review intentional divergence.
- Provider-mock tests must run offline through the local test runner.

Before rollout verify bot capability, Online status, membership in the approved group, group-send and
DM-send permissions and scopes, and successful lookup of the operator. App ID alone proves none of these.
Do not silently substitute another recipient if resolution fails.

## 6. Message copy, deep links, and sanitization

Group card:

```text
✅ Battle Pass Brief พร้อมตรวจสอบ
งวด: ตุลาคม 2026
สร้างรายการใน Working Sheet และเชื่อม Creative Request เรียบร้อย
สถานะ: Unassigned
[ตรวจบรีฟใน FlowMate]
```

Operator card:

```text
⚠️ Battle Pass: เกิดข้อผิดพลาด
งวด: ตุลาคม 2026 (or ไม่ทราบงวด)
ขั้นตอน: <safe stage>
รหัสปัญหา: <safe code>
เวลา: <Asia/Bangkok timestamp>
[เปิดรายละเอียดใน FlowMate]
```

Use one redirect button, with no callback/state-changing action. Store the approved FlowMate base
URL once in server-side configuration. Success opens `<base>/home/#detail/<request-route-id>`.
Validate the route identifier against the linked Creative Request and allowlist the host; do not
forward arbitrary stored URLs or assume existing hard-coded hosts are the approved environment.
Errors open the Battle Pass status page. Optional recovery anchors/period filters must actually be
supported before adding them to URLs. Verify login preserves the destination and review users have
normal read permissions. A message link grants no additional FlowMate access.

Build payloads field by field. Cards exclude email, user names/IDs, Google IDs, raw checkpoint values,
source snapshots, secrets, raw provider response bodies, and raw AI diagnosis text. Permit the request
route ID in the validated FlowMate link. Recipient email may be used server-side for employee lookup;
it is not card content. Credentials travel only through the authenticated provider path.
Group cards contain readiness information only; operational error details stay in the operator DM.

## 7. Failure handling and operational visibility

| Condition | Required behavior |
|---|---|
| Rate cap reached | Keep pending until next window; prioritize errors |
| Sending disabled | Detection may continue; retain pending rows with reasons |
| Retryable provider failure | Bounded backoff using `next_attempt_at`; exhaustion remains visible as failed |
| Invalid configuration / unresolved recipient | Visible actionable failure; correct configuration before retry |
| Uncertain send result | `delivery_unknown`; reconciliation before resend |
| Readiness became stale | Cancel with reason; do not send obsolete Unassigned claim |
| Group-specific send failure | Notify operator if DM remains available; deduplicate the incident |
| Failure of the error notification itself | Record it; never create recursive error notifications |
| Total SeaTalk outage | Expose failure in operational health; cannot guarantee alert through the broken channel |

Record last detector execution, last successful send, oldest pending age, and terminal/unknown
failures. The current rollout keeps these records in the private outbox and routes automation errors
to the approved operator. A proactive external inactivity alarm and secondary provider remain follow-up work.

Install with sending disabled and cron paused. Define an activation cutoff: dry-run/historical success
messages are not bulk-sent. Review and deliberately cancel pre-cutoff history before activation;
revalidate pending readiness on resume. Rate limiting and disablement are never permanent cancellation.

## 8. Active rollout settings and follow-ups

The app, bot identity, group, operator, and three-part readiness definition are settled.

- FlowMate base URL: `https://panuwee.github.io/FlowMate` with validated request detail routes.
- Detection and dispatch cadence: every 15 minutes, with no quiet-hour suppression.
- Claim batch: at most 10 messages per run. Retry limit: 5 attempts with exponential backoff.
- Activation cutoff: the production activation timestamp stored in `monthly_settings`; earlier detected rows are cancelled as `pre_activation`.
- Controlled live tests verified both group delivery and operator email lookup/DM delivery.
- Follow-ups: external scheduler-inactivity alerting, a documented `delivery_unknown` reconciliation owner,
  an explicit provider-rate-cap policy, and optional recovery events after their prerequisites are verified.

## 9. Rollout and rollback

1. Implement local outbox/rules/claim/finish and Edge Function after implementation authorization.
2. Run isolated local rule, SQL integration, and provider-mock tests; no synthetic production rows.
3. Resolve §8 settings and tenant prerequisites. Production SQL and deployment require separate authorization.
4. Dry-run detection with sending disabled; inspect linked output, routing, event keys, and historical rows.
5. Run authorized end-to-end group-success and operator-error tests, including actual link/login checks.
6. Enable the agreed schedule after authorization and observe controlled failure cases as well as normal delivery.

Rollback disables sending; detection/history may continue if its cron remains active. Pausing the cron
also stops detection. Preserve delivery audit records; destructive removal requires separate approval.
A quiet week is not proof of no missed events.

## 10. Acceptance criteria

- Success requires Working Sheet row, correct linked Creative Request, and Unassigned status after commit.
- Missing row, wrong link/request, partial creation, and non-Unassigned status never produce group success.
- Stale readiness before sending is explicitly cancelled; notification never changes request status.
- Group is exactly `ODg5NDI1MDQwODI3`; the button opens that same Creative Request after login.
- Errors at every required stage, including pre-run failures, reach only the configured operator route.
- Google connection ownership changes do not change recipients.
- Repeated identical failures do not enqueue duplicate deliveries; different recipients have independent outcomes.
- Rate limits, disabled sending, exhausted retries, and unknown delivery remain visible and recoverable.
- Overlapping claims, stale finish, expired leases, timeout, and provider-success/finish-failure are covered.
- Initial activation does not flood the group with historical successes.
- Unauthorized Edge requests perform no claim/send; credentials and raw sensitive content never enter logs/cards.
- SeaTalk failures do not mutate or roll back business records; existing suppression and OT behavior remain intact.
- Optional recovery messages enforce approvability and truthful terminal outcome/attribution wording.
- Local tests/builds, database application, deployed function, and live delivery are reported separately.

## 11. Sources and evidence limits

Local source reviewed for this contract:

- `../supabase/battle_pass_production.sql`
- `../supabase/battle_pass_production_hold_silence.sql`
- `../supabase/battle_pass_recovery_core.sql`
- `../supabase/battle_pass_recovery.sql`
- `../supabase/functions/seatalk-ot-callback/index.ts`
- `../app.jsx`

SeaTalk documentation snapshot (not proof of current tenant configuration):

- [Group sending](seatalk-open-platform/source/send_message_to_group_chat.md)
- [DM sending](seatalk-open-platform/source/send_message_to_a_bot_user.md)
- [App token](seatalk-open-platform/source/get_app_access_token.md)
- [Interactive cards](seatalk-open-platform/source/interactive_message_overview.md)

Earlier phase context: `PHASE_2B_MVP_SPEC.md`, `PHASE_2B4_MVP_SPEC.md`, and
`PHASE_2B5_OUTCOME_LOG_SLICE.md`. Their historical deployment statements must be reverified before rollout.
Do not infer the current live Creative outbox schema, tenant permissions, or deployed outcome-log slice
from this document. Existing OT retry/CI debt is separate work, not automatically added to this phase.
