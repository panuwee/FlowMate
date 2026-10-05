# Workgrid Control Center v0.6 — Production preflight / release review

5 October 2026 · Read-only tenant discovery + local release artifact. No production installation or outbound messages.

**Latest status:** subsequent user-approved SQL installation completed with runtime disabled. This document retains preflight evidence; see [SQL installation result](WORKGRID_CONTROL_CENTER_SQL_INSTALL_RESULT_20261005.md) for current installed state. UI/worker deployment and actual messages remain pending.

## Verified baseline

- Current tenant: `workgrid-test`, project `jbavahimqjalvcfawgqw`, ACTIVE_HEALTHY, Postgres 17.6. This is the tenant used by the current app; its name is not evidence that it is safe to modify without approval.
- Fresh GitHub `version2.1.1`: `4663e6f66b8dd72f7cf4e3b6cfe641b67d172459` via read-only `git ls-remote`. Release advanced from `5b75e06` during preparation; the package was refreshed to the new baseline before handoff.
- Root remains `version2.1` / `77136ab`, with unrelated changes. Five checkouts remain registered; no switch/new worktree/cleanup.
- `wcc_access` and `wcc_private` were absent from the inspected installed function/table inventory; `workgrid-control-center` is absent from deployed Edge Functions.
- Prerequisite helper signatures exist: `is_admin_app_user()`, `flowmate_member_access_allowed(uuid)`, `flowmate_user_can_read_work_item(uuid,uuid)`. Their SECURITY DEFINER and ACL metadata were inspected. This does not replace real authenticated permission UAT after installation.
- Installer/adapters' referenced work/member/team/output/channel columns exist. Native notification readiness signatures and outbox status constraints match the local adapter references.
- Native Activity finalizer is **public.activity_automation_production_finalize(uuid,uuid,text,text,boolean)**. Its current body writes one CR + Working Sheet + channel placements + Slides binding + submitted brief evidence, then marks the run complete and inserts `brief_ready`, transactionally. It retains Loot/readiness/lease checks.
- Finalizer derives effective creative fields through `production_working_sheet_draft`. Rehearsal found source_model alone can differ from a valid inherited Working Sheet. The local adapter now captures an immutable manifest at the native output binding INSERT, within its transaction: expected work/content/Slides identities, count/subtype and effective CR channel_codes. Counts must match the source; expected subtype/channels freeze the finalizer's effective draft. No widening of the native readiness gate.
- Manifest capture observes new outputs even while WCC sending is disabled; it does not enqueue or send. Existing outputs are not backfilled automatically. Without a manifest, WCC success remains suppressed. Do not cut over an existing in-flight run without a separately reviewed plan.

## Existing operation: preserve and recheck before cutover

| Item | Observed state |
| --- | --- |
| Creative dispatcher | Deployed ACTIVE version 36; cron `creativebot-dispatch-every-minute`, every minute, active |
| Activity notifier | Deployed ACTIVE version 17; runner ACTIVE version 26 |
| Activity scheduler | `activity-production-30m`, every 30 minutes, active |
| Activity settings | enabled / notifier_enabled / scheduler_enabled = true; trigger and notifier secret references present |
| Creative queue | sent 124, failed 95, cancelled 74; no pending/retry/sending rows in this snapshot |
| Activity production queue | delivered group brief_ready 1, source_issue 4, scheduler_issue 1; delivered operator run_held DM 1; cancelled group run_held 1; no pending/retryable/dispatching in snapshot |
| Existing explicit personal route | Tong → group `MDI1MjA4MDEwMzE3`, SeaTalk ID `9269051929` |

Queue snapshots can change immediately. Recheck immediately before ownership changes. Historical failures are not permission to resend. Preserve native operator DMs and existing TEST/Battle Pass guards. Do not alter cron commands or read decrypted Vault secrets for this review.

## Pilot mapping (configuration draft, not activation)

| Person | Canonical member / user | Team | Planned binding |
| --- | --- | --- | --- |
| Folk | member `10000000-0000-0000-0000-000000000012`; user `f2e3ef39-8c71-4bb4-94a2-bc901e7f90c7`; active, email matches user input | ops | Freelance; Creative / Review; **destination = group `Njk2MTczMDEwNTg2`**; SeaTalk ID `1353300313` is only member identity / mention, never a DM destination |
| Pond | member `10000000-0000-0000-0000-000000000001`; user `2131ddea-5299-46a5-939f-6ebd4a78b572`; active, email matches | gdve | Fulltime; Creative / Assign; user-supplied SeaTalk ID `1209781227`; native cached employee_code `40319` |
| Panu | member `10000000-0000-0000-0000-000000000007`; user `6e274581-5905-4146-a3eb-871f9c847bc6`; active, role admin, all-team access | global Admin | Configuration owner; user-supplied SeaTalk ID `1377500911`; no notification subscription inferred |
| Tong | member `10000000-0000-0000-0000-000000000003`; user `84712aa2-81ea-45d2-b010-603ebe87dd60`; active | gdve | Preserve current Creative Assign route under legacy ownership until individually reviewed |

SeaTalk user ID and internal employee_code are different identifiers. Do not substitute one for the other. No provider verification was run. Folk's identity is now supplied by the user; its Bot membership and correct mention rendering still require authorized verification/TEST. Review resolves actual Requester: enabling Folk does not route every team's Review to Folk. New Assign resolves actual Assignee. CRs without an assignee do not produce a personal Assign notice.

Other roster entries can be added through UI later. Joe/Tong subscriptions in the supplied roster are context, not permission to seize their native routes. Boss GroupID `aaaaaabbbbbb` remains a placeholder. Missing Bot/event cells mean no subscription requested.

## Concrete release package

Run `node scripts/workgrid-control-center-package.cjs` to produce `output/control-center-release-20261005/`.

- New WCC files + SQL + worker copied explicitly; SHA-256 file manifest.
- `app.jsx`, `screens-b.jsx`, `build-github.cjs` composed on the verified release SHA using only WCC additions. Generated app/screens siblings compiled from these release sources.
- Review diffs compare the three edited source files against the release baseline. Release Task Assign build entry is preserved.
- `review/function-config.toml` is the single new entry to merge. Root `supabase/config.toml` is intentionally not copied wholesale.
- This directory is an overlay for the named release, **not a complete deployable site or a Git worktree**. Shared static dependencies remain supplied by that release. Hashes are integrity evidence, not publication evidence.
- Package does not import routes, activate sending, create a scheduler, deploy, commit or push. The baseline must be refreshed if GitHub advances before publication.

## Installation and acceptance sequence

1. Focused offline rehearsal completed: installer and adapters with live-read native readiness, accepted-brief and Working Sheet inheritance function definitions, synthetic records and dependency tables. All 72 tests pass. The full finalizer, all tenant triggers/RLS and deployed Deno runtime were not executed as a complete stack; verify installed ACLs/trigger contracts after the approved disabled installation, before cutover.
2. Obtain explicit authorization for the concrete tenant SQL scope: installer followed by adapters, runtime false, all rules disabled, no routing ownership. Apply transactionally and verify schema/ACLs as anon/member/designated lead/Admin/service.
3. Panu configures approved server secret storage: WCC_BOT_SECRET_CREATIVE, WCC_BOT_SECRET_FLOWMATE, WCC_DISPATCH_SECRET (>=32 chars), WORKGRID_BASE_URL. Existing Activity Vault references do not prove WCC Edge credentials are configured. Credential values were not inspected or copied.
4. Obtain authorization for deploying only the new Edge Function and scoped UI release. Deploy with dispatch disabled; verify actual authenticated screens. Existing callbacks remain unchanged.
5. In UI stage Folk/Review and Pond/Assign only, disabled. Compare legacy routes, recipient team access and actual requester/assignee using preview. Keep Tong and others on native routes; no wholesale import required for a bounded pilot. Compare existing routes before expanding ownership.
6. Obtain separate authorization for TEST to Folk group and Pond DM, specifying each Bot/recipient. Verify provider acceptance and recipient visibility separately. Hidden group membership requires exact-destination TEST and explicit human confirmation.
7. After authorized drain/ownership review, enable only pilot rules/profiles and create the approved test CR transitions. Do not replay past work. Quick Task uses FlowMate; Activity adoption is a separate cutover after whole-bundle rehearsal.
8. Set up the approved server dispatch schedule and verify bounded processing. Observe cancelled/stale/uncertain behavior, then review expansion to Marketing/eSports and additional members.

Pausing runtime preserves ownership and does not silently return notifications to legacy. Rollback that restores legacy requires a reviewed explicit ownership/route/in-flight plan; do not drop schema or clear ownership indiscriminately.

## Remaining decisions / evidence

- Need real group/Bot connection verification and approved server credential configuration; do not send secrets in chat.
- Confirm canonical HTTPS Workgrid URL for card deep links before deploying worker.
- No leads assigned yet; Admin Panu is sufficient for pilot. Designate leads later through reviewer settings.
- Retention/purge policy remains a later operational decision; no destructive purge installed in this package.
- Focused native-contract rehearsal is complete; live permissions, installation, route configuration, scheduler, authorized TEST and live event UAT remain pending. No claim of production readiness or delivered notifications.

## Rehearsal evidence and concrete next approval

- `vitest run --config src/lib/control-center/vitest.config.mjs`: 72 passed / 4 files (30 DB, 18 native/legacy adapter, 18 mocked provider, 6 UI).
- Native snapshots: `src/lib/control-center/native-contracts.sql`, read from the current tenant on 5 October 2026. Offline fixture includes only required dependency columns, not a full tenant export. Snapshot is a test reference, not a production installer.
- Real readiness tested for recent confirmed Loot, incomplete evidence, accepted brief, archive and assignment; frozen expected channels survive later edits; Working Sheet inherited subtype/channels produce success only when complete; reinstall preserves manifest/runtime state.
- Worker rejects missing Freelance/group destinations before messaging; no direct-chat fallback. Provider calls remain mocked. Worker TypeScript check passed. Existing local browser proof is unchanged; no new live UI claim.
- Next requested production approval is **SQL only**, in tenant `jbavahimqjalvcfawgqw`: `supabase/workgrid_control_center.sql` followed by `supabase/workgrid_control_center_adapters.sql`, from this release manifest, then read-only installation/ACL checks. Runtime false, Bot draft, rules disabled, ownership empty; native routes and existing schedulers remain active. Capture/guard triggers are installed as described above.
- That approval does not include commit/push, UI/function deployment, credentials changes, cron creation, recipient activation, ownership cutover or TEST messages. Those are later named actions under the repository agreement.

See [Local handoff](WORKGRID_CONTROL_CENTER_LOCAL_HANDOFF_20261005.md) and [Spec v0.6](WORKGRID_CONTROL_CENTER_SPEC_20261005.md).
