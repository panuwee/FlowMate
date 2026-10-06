# Control Center scheduler — production result

6 October 2026 · Tenant `jbavahimqjalvcfawgqw` · Asia/Bangkok.

User approved dedicated Edge/Vault credential provisioning, scheduler SQL installation/activation and sending the pending CR-1307 Review under currently enabled rules. No commit/push/merge approval for this scheduler source was inferred.

## Installed and verified

- Matching dedicated `WCC_DISPATCH_SECRET` Edge secret and `wcc_dispatch_secret` Vault entry provisioned. Values were generated in process memory and never printed or stored in ordinary files. Edge digest and Vault equality checked without returning the values.
- Installed `supabase/workgrid_control_center_scheduler.sql`.
- Cron job **9**, `workgrid-control-center-dispatch-every-minute`, active, cadence `* * * * *`.
- Downloaded database function source matches reviewed SQL. SECURITY INVOKER, empty search_path; PUBLIC/anon/authenticated/service_role execution denied.
- Runtime remains true as set by the user. Configuration/ownership digests unchanged. All five existing job metadata records unchanged.
- Local validation: 39 isolated database/scheduler tests passed; secretlint passed. No worker source deployment or template changes required.

## Real dispatch

The natural 15:04 cron tick succeeded. CR-1307 Review event created at 14:53:45 was processed once:

- Delivery `21fac580-5f5b-4d74-ba10-19e6e2d95a88`: `provider_accepted`, attempt 1, reason null.
- Send started 15:04:02.159911; final persistence 15:04:02.452529.
- Mention and message/card steps both accepted.
- Requester Folk and group `folk-creative-review` were resolved through existing configuration.
- Worker HTTP response 200, no timeout. Work status remained Review.

User subsequently confirmed that Folk saw both the mention and Review card in the group. Creative Review → Folk real-event UAT therefore has both provider acceptance and human receipt confirmation for CR-1307. This does not establish UAT for other recipients/events or a platform read receipt. No TEST or task status changes were made. The stale 14:26 event was not backfilled/replayed.

## Idle/log validation

The 15:05 natural cron tick succeeded. Read-only observations showed due queue 0, CR-1307 still attempt 1 and provider_accepted, and zero new pg_net HTTP responses after 15:04:10 through the observation. This demonstrates idle suppression for that observed tick, not a quantified billing saving.

An attempted extra direct idle function invocation was rejected by automatic approval review because it could transmit HTTP/process another queue. It did not execute. Verification used the natural scheduled tick and read-only metadata instead.

No raw provider payloads, credential headers, raw logs or global logging configuration were added/modified. Job history, error/audit evidence, due retries and stale-lease recovery are retained. Pause disables new sends through existing worker readiness controls; stopping the named cron job is the scheduler rollback action and cannot recall accepted messages.

## Source and worktrees

Source/tests/review/result documents remain local and uncommitted. All existing worktrees retained; no checkout changes or cleanup. Machine snapshots: `output/wcc-scheduler-install-20261006/before.json`, `after.json`. Review: `docs/WORKGRID_CONTROL_CENTER_SCHEDULER_REVIEW_20261006.md`.
