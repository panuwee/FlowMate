# Workgrid Control Center v0.6 — deployment review

5 October 2026 · SQL installed with sending disabled. This document prepares deployment; it does not authorize it.

Latest status: D1 was subsequently approved and completed. Worker version 1 is ACTIVE, dedicated URL configuration applied, live unauthenticated smoke checks passed; sending remains disabled. See [Worker deployment result](WORKGRID_CONTROL_CENTER_WORKER_DEPLOY_RESULT_20261005.md). D2 UI publication remains pending.

Latest status: D1 was subsequently approved and completed. Worker version 1 is ACTIVE, dedicated URL configuration applied, live unauthenticated smoke checks passed; sending remains disabled. See [Worker deployment result](WORKGRID_CONTROL_CENTER_WORKER_DEPLOY_RESULT_20261005.md). D2 UI publication remains pending.

## Current evidence

- GitHub release baseline rechecked: `4663e6f66b8dd72f7cf4e3b6cfe641b67d172459`.
- SQL installation/tenant role checks completed; see [SQL result](WORKGRID_CONTROL_CENTER_SQL_INSTALL_RESULT_20261005.md).
- Supabase CLI metadata-only listing confirms server names `SEATALK_CREATIVE_APP_ID`, `SEATALK_CREATIVE_APP_SECRET`, `SEATALK_FlowMate_APP_ID`, `SEATALK_FlowMate_APP_Secret` and `WORKGRID_BASE_URL` exist. Values were not read, copied, printed or changed. Name presence does not prove valid credentials or the intended URL.
- Dedicated `WCC_BOT_SECRET_CREATIVE`, `WCC_BOT_SECRET_FLOWMATE` and `WCC_DISPATCH_SECRET` were absent from that metadata snapshot.
- Worker now reuses existing credentials through fixed aliases, only if the stored Bot App ID and the associated server App ID match the exact known App ID. An explicit WCC secret overrides the alias. Custom refs cannot borrow these credentials. No database configuration or server secrets changed.
- Explicit `deploy.ts` entrypoint imports the tested handler and registers `Deno.serve`; tests can still import index.ts without starting a server.
- Final full isolated suite: 79 passed / 4 files (30 DB, 18 adapter, 25 mocked provider, 6 UI). Entrypoint/worker TypeScript check passed. Added credential alias matching/precedence, explicit Edge startup/unauthenticated rejection and the confirmed task-button URL tests. Calls remain mocked.

## D1 — concrete next deployment approval

Deploy **only** new Edge Function `workgrid-control-center` to project `jbavahimqjalvcfawgqw`:

- Entrypoint: `supabase/functions/workgrid-control-center/deploy.ts`.
- Dependency: `supabase/functions/workgrid-control-center/index.ts`.
- `verify_jwt=false`: custom handler validates Admin requests with Auth getUser and the installed workspace RPC; dispatch requires a separate >=32-character secret. Anonymous requests must return 401. Browser-facing RPC permissions remain enforced in SQL.
- Set only dedicated non-secret server configuration `WCC_WORKGRID_BASE_URL=https://panuwee.github.io/FlowMate/home/`, explicitly confirmed by the user. Worker prefers this value; existing shared WORKGRID_BASE_URL is not overwritten.
- Keep WCC runtime false, both Bot connections draft, rules disabled, ownership empty. No Bot secret writes, server schedule, provider authentication/group lookup, TEST, canary or route changes in D1.
- Post-deploy check: deployment metadata and endpoint OPTIONS/unauthenticated POST only; those requests must not contact SeaTalk. Recheck runtime/rule/ownership settings afterward.
- WCC_DISPATCH_SECRET remains absent; dispatch is unauthorized until a separately authorized secure configuration step. Do not borrow an existing Creative/Activity dispatch secret.
- No Git commit/push or UI publication is included in D1.

Expected worker endpoint: `https://jbavahimqjalvcfawgqw.supabase.co/functions/v1/workgrid-control-center`.

## D2 — UI publication preparation

Scoped UI overlay and diffs remain under `output/control-center-release-20261005/`. They preserve released Task Assign sources and exclude unrelated dirty root edits. UI adds app navigation, Team Members link and Control Center assets; server configuration never enters browser files.

UI publication needs explicit commit/push/deployment authorization under AGENTS.md. Root is dirty and behind the release. Existing five registered checkouts remain retained; no new worktree or branch operation has been performed. Resolve a suitable isolated Git release path within the project worktree agreement before any commit; do not stage or publish entire root files.

Before publication, refresh GitHub baseline if it advances; build/test the composed release sources, inspect generated files and verify the published UI separately. Local demo proof is not authenticated live UI proof.

## Decisions pending before notifications

- Canonical URL confirmed by the user: `https://panuwee.github.io/FlowMate/home/`. Dedicated WCC URL configuration is included in the D1 approval request; it has not been applied yet. Existing shared URL value has not been inspected or changed.
- After authorized UI/worker deployment, Admin verifies both Bot connections and stages Folk Creative/Review → GroupID `Njk2MTczMDEwNTg2`, and Pond Creative/Assign → DM, while sending remains off.
- Provider verification is read-only (auth/contacts/group info) and distinct from TEST. Actual TEST messages, runtime activation, scheduler provisioning and ownership cutover each need explicit scope approval.
- Marketing/eSports groups and other recipients can be added in UI later. No subscriptions are inferred from empty roster cells.

## Rollback and boundaries

If the new worker fails smoke checks, retain sending disabled and diagnose the new function. Existing senders/cron/routes continue owning their current work. Do not delete SQL schema, clear ownership, change existing credentials or redeploy existing callbacks as an automatic rollback. Any removal/redeployment must have its exact approved scope.
