# Phase 2B — manual readiness check

## Approved implementation scope

The user selected “เพิ่มปุ่มตรวจความพร้อมตอนนี้ (แนะนำ)”. Add a button for the active Google connection owner and Aof to read the source now, show missing prerequisites, and correlate the result with its request. Production SQL application and publication for this new phase are pending separate approval under AGENTS.md.

## Implementation

- Existing production Worker receives the fixed action `readiness`; no Worker code/deployment change is required. The browser cannot select `run`, `google-write-check`, arbitrary URLs or headers.
- New private request ledger and two authorised RPCs: `battle_pass_request_readiness()` and `battle_pass_readiness_status(p_request_id)`.
- The same active owner/Aof identity rules as Phase 2A, enforced in the database before reading or dispatching.
- Advisory transaction lock serializes manual requests. Share an outstanding request for up to 180 seconds; reuse a recent result/request for at least 60 seconds across users/tabs.
- Match the exact pg_net response request ID and its returned Worker Run ID to a durable `production_ticks` record. Never borrow a newer unrelated run's result. Persist only a safe field projection, excluding Google/provider details, response headers and raw errors.
- After 180 seconds without a response, report an unconfirmed result. This does not claim the remote Worker was cancelled.
- Page load reads only the latest manual request and resumes waiting if needed. It never starts a readiness check automatically. A failed/uncertain start offers read-only recovery before another dispatch.
- Logout/access loss clears results and ignores late responses. Buttons prevent repeat clicks while busy.
- UI displays Google folder/template capabilities, O link, P confirmation, source/Loot validation and month plan/Revenue/identity readiness, with request ID, Run ID and time.
- Google capabilities are metadata checks, not a new write probe. Loot validation waits for P; the UI says so explicitly.

## Boundaries

The readiness check writes its own request/audit records and refreshes OAuth as required. It does not create or change CRs, Marketing tasks, Slides, source confirmation, assignments or the recurring schedule. It can inspect readiness while automation is paused. Output creation continues through the existing scheduler after valid confirmation.

October end-to-end output/content/review acceptance remains outstanding. This phase does not replace that acceptance.

## Validation

- 27/27 targeted local tests passed (14 readiness + 13 monitor). Isolated PostgreSQL fixtures exercise the exact installer, identity denials, request reuse, response correlation, safe projection/cache, provider/malformed/timeout failures and expiry. No live requests are dispatched by tests.
- Advisory lock behavior is tested through sequential reuse and actual SQL execution; this is not a multi-connection stress test.
- Production read-only inspection confirmed pg_net response columns before implementation. No Phase 2B production SQL has been applied yet.
- Browser preview at `http://127.0.0.1:4189/home/battle-pass-status.html` uses clearly labelled mock data.
- Browser verified click → disabled/pending → completed checks, including the explicit wait-for-P result. Desktop and mobile layout checked. Safe-file scan (secretlint) passed for the named change files.

## Files and repeatable checks

New: `supabase/battle_pass_readiness.sql`, `battle-pass-readiness.js`, `src/lib/battle-pass-readiness.test.ts`.

Modified: `home/battle-pass-status.html`, `battle-pass-monitor.js`, `battle-pass-monitor.css`.

```powershell
npx.cmd vitest run src/lib/battle-pass-readiness.test.ts src/lib/battle-pass-monitor.test.ts --exclude '.worktrees/**'
node --check battle-pass-readiness.js
node --check battle-pass-monitor.js
```

After approval, install the additive SQL, verify read access/denials and an actual readiness request, publish only the named files from an isolated GitHub `version2.1.1` checkout, and verify the button with the authenticated owner. No Edge Function deployment is needed.
