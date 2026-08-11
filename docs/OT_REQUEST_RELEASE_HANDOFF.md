# OT Request Release Handoff

## Release status

- Verification base: branch `version2.1`, required base HEAD `7c4f7f0aa827d5ce17b04d657b7dd24a4c1d9084`, checked on 10 Aug 2026.
- Final Remediation D was implemented from required base `eeecb8c30f1019c469859e687b8826c0f0510a58`. The reviewed product-code HEAD is `608acb444c9431d16b15f1893677614a707b6cb9` (`fix: enforce OT pre-work authorization transitions`); its first documentation-only traceability commit is `dcd7be21509ce816807aa9570c38fb98d2e332cb`.
- The focused suite, full suite, Next build, source/bundle parity, whitespace check, secret scan, and security/lock self-review were run against the exact product tree committed at `608acb444c9431d16b15f1893677614a707b6cb9`. Final Remediation D Fix R1 commit `cc8273856c858aaae8e511ec1143585e5e4967cd` changes only `supabase/ot_request_verify.sql` and `src/lib/ot-request.uat.test.ts`; it adds fail-closed verification evidence and does not change the tested runtime/product implementation. This later documentation-only finalization also changes no runtime/product code.
- Local application tests, production build, scoped source/bundle parity, secret scan, and whitespace checks passed as recorded below.
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
| Focused OT test run | exit 0; 3/3 test files and 147/147 tests passed | `src/lib/ot-request-client.test.ts`, `src/lib/ot-request-domain.test.ts`, and `src/lib/ot-request.uat.test.ts`. |
| Final Remediation D Fix R1 focused UAT | exit 0; 1/1 test file and 88/88 tests passed | Run on commit tree `cc8273856c858aaae8e511ec1143585e5e4967cd` after an expected strict RED of 1 failed / 87 passed. The full suite was not rerun because Fix R1 changes only the read-only verifier and its source-contract test. |
| `npm.cmd test` | exit 0; 18/18 test files and 575/575 tests passed | Includes the protected concurrent untracked file `src/lib/flowmate-rls-performance.uat.test.ts` and its 5 tests; that file is not part of this handoff commit. |
| `npm.cmd run build` | exit 0; Next.js 14.2.35 compiled, linted/type-checked, and generated static pages 4/4 | Route summary listed `/` and `/_not-found` as static routes. |
| Final Remediation D scoped generator | exit 0; isolated single-file Babel transform was idempotent and matched root `screens-ot.js` byte-for-byte | Temporary build directory was removed after parity was verified; no broad root generator was run. |
| Final Remediation C static generator | **NOT RERUN**; an interrupted temporary-copy attempt produced no accepted evidence | Final Remediation C changes only entry HTML, mechanical token assertions, and this handoff. No root generator was run and no generated output was copied back. |
| `npx.cmd secretlint "**/*"` | exit 0; no finding output | Local filesystem scan only. |
| `git diff --check` | exit 0; no whitespace errors | Rerun after the final documentation edit before commit. |
| `supabase/ot_request_verify.sql` inspection | 771 lines and 44 statements inspected: 39 `SELECT`, 5 `WITH`, 0 non-read starters, 0 dollar-quote markers, and 0 write/DDL tokens after comments and string literals were excluded | Fresh source inspection only. The verifier was not executed and is not PostgreSQL runtime proof. |

### Current source/bundle scope parity

Final Remediation D regenerated only `screens-ot.js` from `screens-ot.jsx` with the isolated single-file Babel transform. The current root bundle matched the fresh transform byte-for-byte and the transform was idempotent. `app.jsx` and `app.js` were not changed. These are current-file hashes:

| Pair | Current source SHA-256 | Current bundle SHA-256 | Changed by Final Remediation D |
|---|---|---|---|
| `screens-ot.jsx` -> `screens-ot.js` | `1c25cb67fae7f4dc76a4f50bbd900893062c8e1528a8e77455bb033913394046` | `549992ce6d251f024526e3057ba09ef831394da2d11fc967539313456ee56448` | yes |
| `app.jsx` -> `app.js` | `f84945e754c8e4af1fb5c85818683d0cdd9e13bdadbd96da2b86858aa83cf5c2` | `dad80e9de2b339e4961e9176165a5923793a95946c281761a6104113f9ce2cf1` | no |

### Worktree boundary

- `screens-a.js`, `screens-b.js`, and `screens-c.js` reported `M` from stat noise before verification, but each worktree Git blob hash equalled HEAD and `git diff` was empty.
- Protected/concurrent untracked files were preserved: `docs/CAMPAIGN_DASHBOARD_DEVELOPER_BRIEF.md`, `docs/CAMPAIGN_DASHBOARD_OWNER_MERGE_GUIDE.md`, `docs/supabase-performance-analysis-2026-08-07.md`, `docs/superpowers/plans/2026-08-06-flowmate-board-operational-performance-implementation.md`, `docs/superpowers/specs/2026-08-06-flowmate-board-operational-visibility-performance-design.md`, `src/lib/flowmate-rls-performance.uat.test.ts`, `supabase/phase4_rls_read_performance.sql`, and `supabase/phase4_rls_read_performance_archived_board_patch.sql`.
- Final Remediation C commit `f054400` contains exactly three entry pages (`index.html`, `home/index.html`, and `product-book/index.html`), four mechanical token assertion files (`src/lib/ot-request.uat.test.ts`, `src/lib/flowmate-board-integration.uat.test.ts`, `src/lib/workflow-mvp.uat.test.ts`, and `src/lib/product-book-cms.uat.test.ts`), and this handoff. `screens-a.js`, `screens-b.js`, `screens-c.js`, all concurrent untracked files, `supabase/README.md`, and every other unrelated file were excluded.

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
- Execute the exact Final Remediation D two-session start-boundary cases documented in the [Supabase OT Request MVP staging contract](../supabase/README.md#ot-request-mvp): Session A holds the request row lock until the planned start is equal/past while Session B's positive approval or acceptance waits; after Session A commits, Session B must reject without a decision/consent audit, and rejection/revision or decline must remain available. Then prove a positive action committed before the boundary replays with the same idempotency key after the start while a different key cannot create a second action.
- Execute the fixed-directory cases from the same [Supabase OT Request MVP staging contract](../supabase/README.md#ot-request-mvp): Owner receives exactly Big, Mac, and Pluem with nullable user ID and truthful Workgrid/approver/HR state even when a fixed identity is inactive; a non-Owner is denied; inactive identities are limited to reassignment source/deactivation; destination and activation require an existing active Workgrid identity, reassignment destination also requires active approver state, and the event participant directory remains active-only.
- Use two authenticated sessions to race `ot_review_plan` and `ot_verify_actual` against Owner reassignment followed by deactivation. A valid decision may commit first, or the administrative change may commit first and reject the stale decision; there must be no decision audit by an inactive/no-longer-assigned approver and no deadlock.
- Run staging UAT for employee, assigned approver, OT Owner, and HR/Admin across desktop 1440px and mobile 390px, light/dark themes, keyboard focus, loading/error/empty states, and every workflow listed in the Browser boundary above.

## Safe release order and exact manifest

### Combined frontend payload approval

The current root `app.jsx` and `app.js` include both OT Request work and the separately committed FlowMate performance work from commit `3a94c353` (`perf: optimize FlowMate board data loading and transitions`). Uploading the current root payload is therefore a **combined release**, not an OT-only upload. Before upload, the operator must either obtain explicit approval for that combined payload or build and review a separate deployment package with an exact manifest; do not describe the current root payload as OT-only.

1. Back up the approved staging database.
2. Install `supabase/ot_request.sql` using **Run without RLS**.
3. Run `supabase/ot_request_verify.sql` read-only and complete every staging gate above.
4. Upload these non-entry runtime/source files to the approved staging/static host: `ot-request-domain.js`, `supabase-ot-request.js`, `screens-ot.jsx`, `screens-ot.js`, `app.jsx`, `app.js`, `app.css`, and `build-github.cjs`.
5. Upload `index.html`, `home/index.html`, and `product-book/index.html` last. All three request release token `20260810-01` for `app.css`, `ot-request-domain.js`, `supabase-ot-request.js`, `screens-ot.js`, and `app.js`.
6. Hard-refresh and prove release token `20260810-01` is served for every locked asset on all three entry pages.
7. Complete authenticated staging Browser/UAT for the required roles, viewports, themes, keyboard states, and workflows.
8. Review recorded staging evidence and make a separate production go/no-go decision. Repeat backup, SQL, verification, upload, and UAT controls in the approved production window only after approval.

Tests and this handoff are repository evidence, not deployed runtime files. No manual upload, push, production SQL, release, or deployment was performed through Final Remediation D, including Fix R1.

## Rollback boundary

- Frontend rollback: restore the previous eight non-entry runtime/source files and all three entry pages as one versioned set. Restore entry pages last so they always reference available runtime assets.
- Database rollback: do not drop, truncate, overwrite, or delete OT history. Disable the OT module and revoke OT RPC execution while a reviewed, evidence-backed rollback migration is prepared.

## Remaining release gates

- **Staging database gate:** all PostgreSQL/RLS/grant/trigger/backfill/idempotency/concurrency checks above must pass with retained evidence.
- **Staging Browser gate:** authenticated 1440px and 390px, light/dark, keyboard and role-based workflow UAT must pass with screenshots and console evidence.
- **Manual-upload gate:** after combined-payload approval, the exact 11-file static manifest must be uploaded in runtime-first/entry-last order and cache token `20260810-01` must be observed across all three entry pages.
- **Production decision gate:** designated owners must review staging evidence, backup readiness, rollback ownership, and UAT results before authorizing production SQL or deployment.
