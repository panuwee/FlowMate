# OT Request Release Handoff

## Release status

- Verification base: branch `version2.1`, HEAD `9f7c7455889c6d12b232e81913af7030db93cd18`, checked on 10 Aug 2026.
- Local application tests, production build, isolated static generation, secret scan, and whitespace checks passed as recorded below.
- Rendered Browser QA is **BLOCKED BY AUTH**, not PASS. The local sign-in gate rendered, but no authenticated OT screen was reachable.
- Local Supabase/pgTAP was **SKIPPED by explicit user environment constraint**, not PASS. Docker/local Supabase was not started and no SQL was executed.
- Live Supabase, manual upload, staging/production UAT, push, and deployment were not executed. This handoff is not deployment approval.

## Business workflow being released

- An employee submits a Request before work. Each occurrence records its own consent statement version before approval, and the assigned approver reviews the plan.
- The canonical Bangkok-week count uses submitted Actual minutes when available and otherwise Requested minutes, never both. Draft, rejected, cancelled, and pre-work `revision_required` occurrences are excluded until resubmitted.
- Weekly-limit warnings are shown as the canonical total approaches 36 hours. Planned requests and consent are blocked when a projected affected week exceeds 36 hours. Truthful Actual time is not reduced or discarded; it is saved and routed through the compliance flow when required.
- After work, the employee records Actual time. Approved Actual is locked. A correction requires an elevated, reason-required amendment request before the employee can resubmit the truthful Actual.
- Manager handling keeps revision-required plans out of approval until employee resubmission, requires individual handling for compliance-sensitive Actuals, and exposes weekly totals plus Function and root-cause trends.
- Owner/HR access is intentionally fixed. The sole OT Owner is `panuwee.w@garena.com`; HR/Admin activation is restricted to `nithidol.k@garena.com`, `weerayut@garena.com`, and `napol.a@garena.com`. Pending work must be reassigned before a separate deactivation action.

## Fresh local evidence

| Check | Exact result | Boundary |
|---|---|---|
| `npm.cmd test` | exit 0; 18/18 test files and 559/559 tests passed | Includes the protected concurrent untracked file `src/lib/flowmate-rls-performance.uat.test.ts` and its 5 tests; that file is not part of this handoff commit. |
| `npm.cmd run build` | exit 0; Next.js 14.2.35 compiled, linted/type-checked, and generated static pages 4/4 | Route summary listed `/` and `/_not-found` as static routes. |
| Isolated static generator, first run | exit 0; `data.js`, `screens-ot.js`, and `app.js` unchanged; only out-of-scope `screens-a.js`, `screens-b.js`, and `screens-c.js` changed inside the temporary copy | The generator was not run against repository-root outputs and no temporary output was copied back. |
| Isolated static generator, second run | exit 0; `No output changed.` | Temporary copy was removed after hash comparison. |
| `npx.cmd secretlint "**/*"` | exit 0; no finding output | Local filesystem scan only. |
| `git diff --check` | exit 0; no whitespace errors | Rerun after the final documentation edit before commit. |
| `supabase/ot_request_verify.sql` inspection | 544 lines read; only `SELECT` statements and read-only CTE/catalog/data inspection were present; no DDL or DML | Source inspection only. The verifier was not executed and is not PostgreSQL runtime proof. |

### Isolated generator parity and hashes

All six copied JSX sources matched their root SHA-256 before generation. The allowed generated outputs below also matched the freshly generated temporary outputs after both runs:

| Bundle | Root/copy source SHA-256 | Root/fresh generated SHA-256 | Match |
|---|---|---|---|
| `data.jsx` -> `data.js` | `24d0daa96e7afe29c31acec8ec739f550504caaa556dd79d340448ff8d2a8a9d` | `50eed640210b68a80b13de93185aca8d13943495d29e7f954845e9a12544882f` | yes |
| `screens-ot.jsx` -> `screens-ot.js` | `c8f81f18db0c7ebd4813cbed8ad77c5589dc0f70573b7307e67a7b8857810f32` | `53e0292552f9c6b586baacdd42df32329e81128d3e084a6f5d79e25206ceb86f` | yes |
| `app.jsx` -> `app.js` | `f84945e754c8e4af1fb5c85818683d0cdd9e13bdadbd96da2b86858aa83cf5c2` | `dad80e9de2b339e4961e9176165a5923793a95946c281761a6104113f9ce2cf1` | yes |

Fresh generation did not match the tracked root outputs for the protected, out-of-scope bundles below. They were not rewritten or staged:

| Bundle | Root SHA-256 | Fresh temporary SHA-256 |
|---|---|---|
| `screens-a.js` | `73321f3e8ff5b862438cd4ae4883b0d5c7b15420ad40e22d2e74fd6bc7a5c3c9` | `df2c8e3c36a4581b586b9ea628c87363400efdd9e9873b3259e21f82e6cee776` |
| `screens-b.js` | `44170de87ac4c04c3050c48ec238d5145e0a85077a630f62fa46423ac2392717` | `ef869614ced75cbe164937eb01247b6ed142d420fc06d018f0fe5e097a708176` |
| `screens-c.js` | `9d138a09cee9dce2399fdeb1e2db8bc780bbe91fea253ee8a6d99ebd1039703a` | `f3b649c7e74e93451963a7e93daf023f1ad3283d91bf36f7265adfe13518382a` |

### Worktree boundary

- `screens-a.js`, `screens-b.js`, and `screens-c.js` reported `M` from stat noise before verification, but each worktree Git blob hash equalled HEAD and `git diff` was empty.
- Protected/concurrent untracked files were preserved: `docs/CAMPAIGN_DASHBOARD_DEVELOPER_BRIEF.md`, `docs/CAMPAIGN_DASHBOARD_OWNER_MERGE_GUIDE.md`, `docs/supabase-performance-analysis-2026-08-07.md`, `docs/superpowers/plans/2026-08-06-flowmate-board-operational-performance-implementation.md`, `docs/superpowers/specs/2026-08-06-flowmate-board-operational-visibility-performance-design.md`, `src/lib/flowmate-rls-performance.uat.test.ts`, `supabase/phase4_rls_read_performance.sql`, and `supabase/phase4_rls_read_performance_archived_board_patch.sql`.
- Only this handoff is intended for the Task 8 commit. `supabase/README.md` already states the mandatory staging/runtime boundary and did not need correction.

## Rendered Browser QA

Browser status: **BLOCKED BY AUTH**.

- Preview: `local-server.cjs` served `http://127.0.0.1:4194/` and `/home/index.html` with HTTP 200.
- Browser: Codex in-app Browser, desktop viewport 1440x1000.
- The first combined inspection reached the page but its screenshot call used an unavailable helper and was stopped at the bounded limit. One permitted recovery used the documented tab screenshot API.
- Recovery evidence: URL `http://127.0.0.1:4194/`, title `FlowMate - GD/VE Workflow`, meaningful sign-in DOM, no framework overlay, and 0 console warning/error entries.
- The rendered page stopped at `Sign in with Google` / `Garena Workspace only`. No sign-in, identity fabrication, alternate browser, or fallback automation was attempted.
- Screenshot: ignored artifact `.superpowers/sdd/2026-08-10-workgrid-ot-request-final-review-remediation/task-8-browser-auth-gate-desktop.png` (48,580 bytes).
- Because authentication blocked the product, no target-flow interaction proof was possible. Mobile 390px, ProductSwitch labels and `aria-pressed`, OT navigation and `aria-current`, keyboard focus, dark mode, responsive tables, and all employee/manager/Owner/HR data-backed workflows remain visually unverified.
- Specifically unverified in a rendered browser: request-before-work, 36-hour warning/block, occurrence consent, personal list, Actual lock/correction copy, revision resubmission, individual compliance approval, five-week zero/confirmed trend, Function/assignment concentration, root-cause trend, reassignment-before-deactivation copy, compliance review, audit, and export.

## Mandatory approved-staging gate

Local source-contract tests cannot replace these database-runtime checks. Before manual UAT or any deployment decision, an approved staging operator must:

- Back up staging, run `supabase/ot_request.sql`, then run the read-only `supabase/ot_request_verify.sql`; capture every result and investigate any unexpected count or invariant.
- Prove PostgreSQL compilation and installation of tables, functions, views, policies, triggers, and indexes.
- Validate migration/backfill safety, including complete immutable `actor_email_snapshot` backfill and the deriving trigger.
- Validate RLS with employee, assigned approver, unrelated approver, fixed OT Owner, approved HR/Admin, unauthorized legacy HR/Admin, `anon`, and direct-table access cases.
- Validate effective grants: authenticated RPC access where intended, no `anon`/`PUBLIC` execution, no direct OT table DML, and private weekly/overlap helpers not executable by clients.
- Exercise reason, consent-version, mandatory-note, immutable Actual/amendment, fixed-identity, and reassignment-before-deactivation enforcement.
- Verify idempotency/replay behavior, deterministic lock ordering, no deadlock, and no duplicate audit/action results.
- Test overlapping half-open intervals and concurrent create/resubmit/Actual operations against the same employee/week.
- Verify canonical weekly accounting: Actual-or-Requested but never both; excluded revision states; cross-week splits; warning/block behavior; truthful over-limit Actual routed to compliance.
- Use two authenticated sessions to race `ot_review_plan` and `ot_verify_actual` against Owner reassignment followed by deactivation. A valid decision may commit first, or the administrative change may commit first and reject the stale decision; there must be no decision audit by an inactive/no-longer-assigned approver and no deadlock.
- Run staging UAT for employee, assigned approver, OT Owner, and HR/Admin across desktop 1440px and mobile 390px, light/dark themes, keyboard focus, loading/error/empty states, and every workflow listed in the Browser boundary above.

## Safe release order and exact manifest

1. Back up the approved staging database.
2. Install `supabase/ot_request.sql` using **Run without RLS**.
3. Run `supabase/ot_request_verify.sql` read-only and complete every staging gate above.
4. Upload these non-entry runtime/source files to the approved staging/static host: `ot-request-domain.js`, `supabase-ot-request.js`, `screens-ot.jsx`, `screens-ot.js`, `app.jsx`, `app.js`, `app.css`, and `build-github.cjs`.
5. Upload `index.html`, `home/index.html`, and `product-book/index.html` last. All three request release token `20260807-02` for `app.css`, `ot-request-domain.js`, `supabase-ot-request.js`, `screens-ot.js`, and `app.js`.
6. Hard-refresh, prove the new token is served, and complete the staging Browser/UAT matrix.
7. Review recorded staging evidence and make a separate production go/no-go decision. Repeat backup, SQL, verification, upload, and UAT controls in the approved production window only after approval.

Tests and this handoff are repository evidence, not deployed runtime files. No manual upload, push, production SQL, release, or deployment was performed in Task 8.

## Rollback boundary

- Frontend rollback: restore the previous eight non-entry runtime/source files and all three entry pages as one versioned set. Restore entry pages last so they always reference available runtime assets.
- Database rollback: do not drop, truncate, overwrite, or delete OT history. Disable the OT module and revoke OT RPC execution while a reviewed, evidence-backed rollback migration is prepared.

## Remaining release gates

- **Staging database gate:** all PostgreSQL/RLS/grant/trigger/backfill/idempotency/concurrency checks above must pass with retained evidence.
- **Staging Browser gate:** authenticated 1440px and 390px, light/dark, keyboard and role-based workflow UAT must pass with screenshots and console evidence.
- **Manual-upload gate:** the exact 11-file static manifest must be uploaded in runtime-first/entry-last order and cache token `20260807-02` must be observed.
- **Production decision gate:** designated owners must review staging evidence, backup readiness, rollback ownership, and UAT results before authorizing production SQL or deployment.
