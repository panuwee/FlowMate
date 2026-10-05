# Link Zone asset evidence — local release review

Status: local implementation. No production SQL, commit, push or deployment performed.
Base: `8c1f62984a8f78ebd6afcce77766891e4f70bb5e`.
Worktree retained: `.worktrees/campaign-planner-release`, branch `codex/kpi-production-release`.

## Behavior

- Creative Add Link offers General / Reference, 1st Draft and Final Asset.
- Typed links retain their label after reload. Legacy links remain General; no stage inferred from URL or description.
- Only open Creative work accepts typed submissions. Receiver or KPI-authorized supervisor must also pass existing collaboration and canonical read checks on the server.
- Server stores actor, time, link type and URL in the existing add-link event. Soft removal of a link retains the event.
- Stable request keys prevent duplicate links/events on retry with the same payload. Reusing a key for different content fails.
- Missing typed RPC produces an explicit error; it does not silently save a General link. Reads fall back to legacy columns only when link_kind is absent.
- Workflow completion is unchanged. KPI definitions and English copy are updated as described in docs/KPI_ASSET_SUBMISSION_LOCAL_REVIEW.md.

## Verification on 2026-10-05

- Node SQL simulation (PGlite) + client VM: **12/12 passed**, no production writes.
- Affected collaboration frontend UAT: **17/17 passed**.
- Full legacy UAT: **341/343 passed**. Two failures expect obsolete navigation strings (`getVisibleNavGroups(user.role)` and `function getVisibleNavGroups(role)`). These failures were observed before the KPI Overview label translation; navigation logic and the old UAT expectations were not changed.
- `npm.cmd run build:github`: passed; generated only `screens-a.js`.
- `git diff --check`: passed.
- Browser local detail CR-1269: old-schema read succeeded, Link type displayed, closed Delivered task disabled typed choices. No real Add Link submission.
- Browser local detail CR-1341: open Assigned task displayed all three options; selected 1st Draft successfully. Did not submit to production. Screenshot: `C:/Users/panuwee.w/.codex/visualizations/2026/10/02/01a0fa98-b92f-7510-bb62-186b24f77a0f/link-zone-first-draft-local.png`.

## Files in proposed release

Frontend: `screens-a.jsx`, generated `screens-a.js`, `supabase-quick-task.js`, `supabase-list-data.js`, `kpi-workspace.ts` / `.js`, `screens-kpi.jsx` / `.js`, and `app.jsx` / `.js` (KPI Overview label only).
Database draft: `supabase/creative_link_asset_evidence.sql`.
Tests: `src/lib/creative-link-asset-sql.test.cjs`, `src/lib/creative-link-asset-client.test.cjs`.
Design/review: this file and `docs/LINK_ZONE_ASSET_EVIDENCE_LOCAL.md`.
Exclude existing unrelated `output/campaign-planner/`.

## Pending before release

1. Confirmed: Final Asset means submission for acceptance only. Adding the link does not complete work; Approved Delivered or a status transition to Delivered remains the completion event. The selector has no helper text underneath. KPI integration must distinguish asset submission from accepted completion.
2. Updated: C01/C02 use typed submission times and the current Asset Due fields. C03 is removed. No historical untyped links are inferred as submissions.
3. Review the SQL against fresh production schema and authorization, rehearse its transaction, then obtain explicit authorization for production SQL and frontend publication.
4. After installation in an approved test environment, verify a real authorized submission, denied submission, retry, reload, link soft removal and event retention. PGlite stubs do not prove production triggers/RLS behavior.
5. Prepare a fresh release stamp and scoped commit, publish after authorization, then verify live assets and rendered UI separately.

Rollback approach: revert frontend assets first while retaining additive database columns/events. Existing General RPC remains available. Preserve collected evidence; destructive SQL rollback is not part of this package.
