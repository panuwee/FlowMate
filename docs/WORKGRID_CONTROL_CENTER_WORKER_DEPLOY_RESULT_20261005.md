# Workgrid Control Center v0.6 — worker deployed, sending disabled

5 October 2026 · Project `jbavahimqjalvcfawgqw` · D1 approved by the user's explicit **อนุมัติ** response to the worker deployment/URL configuration request.

## Applied

- Set only `WCC_WORKGRID_BASE_URL=https://panuwee.github.io/FlowMate/home/` in approved server environment configuration. Supabase CLI reported count 1 / success. No existing shared URL or Bot secret values were read or changed.
- Deployed only new Edge Function `workgrid-control-center`, version **1**, status **ACTIVE**, ID `210e9b0b-d947-4656-ba13-a23638aab787`.
- Entrypoint `deploy.ts`, dependency `index.ts`, verify_jwt=false with the reviewed custom Auth/Admin and independent dispatch authentication.
- Source SHA-256 rechecked before upload:
  - index.ts: `da7251138932243ceabc7649e57c1c3d807caedd7c32056cab775d6ab894904f`
  - deploy.ts: `03595efa29bec6bd57ef31fa6f84e61cf199c75ca504f9e524a3636c03441de8`
- Supabase deployed bundle hash: `7e1aaa099bc988a581de78eb41a9457a10e1830ddc36bc8e0804d697cbfca606` (bundle hash differs from individual source file hashes).

Endpoint: `https://jbavahimqjalvcfawgqw.supabase.co/functions/v1/workgrid-control-center`.

## Live smoke checks

| Request | Actual result |
| --- | --- |
| OPTIONS | 204 |
| POST verify Bot without Authorization | 401 / UNAUTHORIZED |
| POST dispatch without dispatch secret | 401 / UNAUTHORIZED |

No SeaTalk authentication, contacts/group lookup, TEST or notification request was made. These calls test worker startup and rejection paths, not a real Admin JWT session or Bot credentials.

Post-deploy database verification: runtime_enabled false, enabled rules 0, ownership 0, deliveries 0; Creative and FlowMate remain draft. No recipient activation or ownership cutover occurred. WCC_DISPATCH_SECRET was not configured and no WCC scheduler was created.

## Remaining

- UI publication (D2) remains pending explicit commit/push/deployment approval and an isolated Git release path. Local UI and scoped overlay exist; current published UI has not been changed in this step.
- Real authenticated Admin UI/worker verification and read-only Bot/group connection checks remain pending.
- Folk pilot destination remains Creative / Review → GroupID `Njk2MTczMDEwNTg2`; no DM fallback. Pond Assign pilot remains separate.
- Actual TEST messages, dispatch secret/scheduler configuration, runtime activation and ownership cutover need their named scope approvals. No messages were sent.
- No commit/push, existing function deployment, branch switch, worktree creation or cleanup. Existing checkouts retained.

Earlier evidence: [SQL installation](WORKGRID_CONTROL_CENTER_SQL_INSTALL_RESULT_20261005.md), [Deployment review](WORKGRID_CONTROL_CENTER_DEPLOY_REVIEW_20261005.md). Latest local suite: 79 tests passed; worker/entrypoint TypeScript passed. Local/mocked checks do not establish provider delivery or published UI behavior.
