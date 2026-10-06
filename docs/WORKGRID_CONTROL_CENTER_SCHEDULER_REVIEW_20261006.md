# Workgrid Control Center scheduler — implementation and release review

6 October 2026 · Local implementation complete; production activation pending approval.

## Incident evidence

Read-only tenant checks in `jbavahimqjalvcfawgqw` confirmed CR-1307 is in Review with Folk as requester. Event `8b29c7f3-035e-4e57-bd2f-c95a986e948d` was created at 14:53:45 (Asia/Bangkok), current instance true. One delivery to `folk-creative-review` is pending, attempt 0, no send started/provider ID. The 14:26 event is stale and has no delivery.

Runtime, Creative Bot, Folk profile/destination and the Operations Review rule are enabled. All 14 installed rules are enabled. Five existing cron jobs are active, but none references the Control Center endpoint. Edge secret name `WCC_DISPATCH_SECRET` is absent; Vault name `wcc_dispatch_secret` has zero entries. No secret values were read. pg_net, pg_cron and Vault are available.

## Implementation

`supabase/workgrid_control_center_scheduler.sql` installs `wcc_private.request_dispatch()` and a named minute cron job. The function uses SECURITY INVOKER and an empty search_path; direct execution is revoked from PUBLIC, anon, authenticated and service_role. The cron owner invokes it with existing database privileges.

- No HTTP on empty queues, future retry-only queues or unexpired sending leases.
- Dispatch only when runtime is enabled and pending/retryable work is due, or when a sending lease has expired.
- Expired leases still trigger existing worker recovery while ordinary sending is paused. Existing worker readiness checks prevent paused sends; started deliveries become uncertain rather than automatically resending.
- Credentials are looked up from one Vault entry; missing/short credentials fail closed. The matching Edge environment secret must be provisioned separately through approved secret storage. Values must not enter source, ordinary files, output or logs.
- Cron command contains only the function call. Secret headers are constructed inside the function for the required HTTPS request, not embedded in cron statements.
- Existing worker claim/recheck/dedupe/finish, bounded batch of 25, partial-step evidence and audit remain unchanged. No legacy cron jobs, runtime/rules, message templates or log configuration are changed.

## Log rules

Applied `docs/SUPABASE_LOG_RULES_AND_OPTIMIZATION_20261006.md`, especially rules 7–10. The gate avoids up to 1,440 idle HTTP dispatches per day compared with unconditional minute dispatch; this is a design comparison, not measured ingestion or billing savings. The minute database cron and its ordinary execution history still exist. No change to global cron logging or evidence retention is proposed.

No new payload/debug logging, recurring raw-log scans, frontend polling, client permission cache or broad data refresh is added. Business delivery status and bounded incident checks remain the monitoring basis. pg_net delivery requests are asynchronous; cron success is not SeaTalk acceptance or human receipt.

## Validation

39 offline database/scheduler tests passed: 31 existing database tests plus 8 scheduler tests covering pause/empty/due/future retry, secret failure, expired and live leases, and forbidden roles. net.http_post is mocked; these checks do not contact production or SeaTalk. Secretlint passed on scheduler SQL and tests.

## Proposed production scope

After explicit approval: generate a dedicated random credential in memory, provision matching Edge secret and Vault entry, install the scheduler SQL, verify function ACL/cron metadata, then activate the named job. It may process the existing pending CR-1307 Review to Folk, plus future eligible events under the currently enabled 14 rules. No historical event backfill, manual task status changes or TEST messages. Revalidate the queue and configuration immediately before activation; unexpected expansion must be reviewed.

Verification: scheduler request result and business delivery status, then requester confirmation of receipt. Do not use cron success as delivery evidence. Rollback: disable only `workgrid-control-center-dispatch-every-minute`; optionally pause runtime via existing Admin controls after appropriate authorization. Pausing cannot recall messages already accepted by SeaTalk.

This scheduler does not create SeaTalk groups or invite users. UI onboarding links canonical members to an existing group; SeaTalk group membership remains a separate platform operation.

All existing worktrees retained. No production secrets/SQL/scheduler/message changes or commit/push/merge performed during this preparation.
