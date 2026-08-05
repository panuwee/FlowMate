# FlowMate — Architecture & Deploy Guide

FlowMate is an internal creative-workflow tool for the Garena GD/VE team
(task & creative-request intake, fair auto-assignment, capacity/workload
visibility, board/list/queue, KPIs). This document is the orientation map for
maintainers: what's canonical, how it's deployed, and where everything lives.

---

## 1. Which app is canonical

There are **two** frontends in this repo. Only one ships:

| App | Path | Status | Tech |
|---|---|---|---|
| **Static app (CANONICAL)** | `github/` | **Deployed** to GitHub Pages (`panuwee/FlowMate` → `https://panuwee.github.io/FlowMate/`) | React 18 UMD; JSX precompiled to plain JS (`npm run build:github`) |
| Next.js prototype (legacy) | `src/` | **Not deployed.** Early single-screen prototype kept only for its unit tests. | Next.js 14 + TypeScript |

> **If you change product behavior, change `github/`.** `src/` is not wired to
> production. Do not assume the two are in sync — they are not.

The backend for both is **Supabase** (Postgres + Auth + Realtime), configured
entirely from SQL in `supabase/`.

---

## 2. Repository layout

The working tree currently spans **two git repositories**:

- `github/` is its own repo (remote `panuwee/FlowMate`, branch `main`) — this is
  what GitHub Pages serves.
- The **outer** repo (project root) tracks `supabase/`, `src/`, `docs/`, and
  config, and **ignores `github/`** (see root `.gitignore`) so the nested repo
  isn't added as a broken gitlink.

```
New project 2/
├─ ARCHITECTURE.md          ← you are here
├─ package.json             ← vitest + (legacy) Next deps; `npm test`
├─ github/                  ← CANONICAL static app (its own git repo → Pages)
│  ├─ index.html            ← script load order + cache-bust version (?v=...)
│  ├─ app.css
│  ├─ app.jsx               ← shell, routing, auth gate, Login screen, prompt modal, notifications
│  ├─ data.jsx              ← shared UI atoms, badges, CSV helpers, status maps
│  ├─ screens-a.jsx         ← My Work, Create (quick + creative), Detail
│  ├─ screens-b.jsx         ← List, Kanban Board (drag-drop), Central Queue, Admin Whitelist
│  ├─ screens-c.jsx         ← Workload, KPI, Gantt, Calendar/Leave, Team Settings
│  ├─ search-utils.js       ← search/filter/grouping/sort helpers (pure)
│  ├─ supabase-client.js    ← createClient with the public anon key
│  ├─ supabase-js-local.js  ← vendored supabase-js (CDN fallback in index.html)
│  ├─ supabase-list-data.js ← loadFlowMateListRows + realtime + live-refresh poller
│  ├─ supabase-workload-data.js
│  ├─ supabase-quick-task.js← all RPC wrappers + Google auth + error sanitizer
│  ├─ supabase-ai-tags.js   ← AI-tag RPC wrappers
│  ├─ supabase-smoke-test.js← debug-only connectivity probe (gated)
│  ├─ local-server.cjs      ← `node local-server.cjs` static server on :3000
│  └─ garena/               ← brand assets (logos, colors)
├─ supabase/                ← all backend SQL (see supabase/README.md)
├─ src/                     ← legacy Next.js prototype + the vitest suite
│  └─ lib/
│     ├─ flowmate.ts            ← pure helpers (tested by flowmate.test.ts)
│     └─ flowmate.uat.test.ts   ← reads/evaluates github/ source for UAT checks
└─ docs/                    ← PRD, data model, assignment rules, UAT, MVP scope
```

---

## 3. How it loads (precompiled — O-1)

The `.jsx` files are the **source**; they are precompiled to plain `.js` by a
build step so the browser does **not** run Babel-standalone on load. `github/index.html`
loads React UMD (production) and then the plain `.js` files directly.

- **Build step:** `npm run build:github` (runs `build-github.cjs`) transpiles
  `data.jsx`, `screens-a.jsx`, `screens-b.jsx`, `screens-c.jsx`, `app.jsx`
  → sibling `.js` (classic React runtime, against the global `React`). The
  generated `.js` carry an auto-generated banner — **never hand-edit them; edit
  the `.jsx` and re-run the build.**
- **Workflow:** after any `.jsx` change → run `npm run build:github` → upload the
  regenerated `.js` (+ `index.html`). The deployed page contains no Babel and no
  in-browser transpile, so load is near-instant and the React-rendered login
  animations start immediately.
- Every script is a global (`window.*`); load **order matters** (see `index.html`).
- Each script gets a `?v=YYYYMMDD-NN` cache-bust query. **Bump it on every change**
  (and the matching `FLOWMATE_APP_VERSION` constant in `app.jsx`) so browsers
  fetch fresh files. The version also shows next to the brand for support.

Local preview: `node github/local-server.cjs` → `http://localhost:3000/`
(port 3000 matches the Supabase Auth redirect allow-list).

---

## 4. Deploy workflow

**Frontend** (manual, via the GitHub web UI — not `git push`):

1. Edit files under `github/`.
2. Bump the cache-bust version: `?v=...` in `github/index.html` **and**
   `FLOWMATE_APP_VERSION` in `github/app.jsx`.
3. Upload the changed `github/` files to the `panuwee/FlowMate` repo via the
   GitHub web interface. Pages redeploys automatically.

**Backend** (Supabase SQL Editor): run the SQL files in the order documented in
[`supabase/README.md`](supabase/README.md). For an already-deployed DB, apply the
post-review patches `phase1_security_fixes.sql` → `phase2_stability_fixes.sql` →
`phase3_performance.sql` (re-running `rpc_assignment.sql` / `rpc_quick_task.sql`
where noted).

---

## 5. Auth & security model (summary)

- **Google Workspace SSO** via Supabase Auth. Sign-in is gated to `@garena.com`
  **and** an explicit allow-list (`user_whitelist`), enforced by triggers on
  `auth.users` (INSERT and email-change). See `supabase/whitelist_access.sql`.
- The browser uses the **public anon key** (`supabase-client.js`). This is safe
  **only because RLS is enforced** — never rely on the key being secret, and
  never add a `service_role` key to `github/`.
- **All writes go through `SECURITY DEFINER` RPCs** that resolve the actor from
  `auth.uid()` (not client-supplied IDs). Direct table `INSERT/UPDATE/DELETE`
  grants are revoked (Phase 1) so the RPC guards can't be bypassed via PostgREST.
- **Read model is deliberately shared:** every active whitelisted member can read
  all work items/comments/board data (it's a team board). There is no per-item
  confidentiality by design — see the H-3 note in `schema.sql`.

---

## 6. Testing

```bash
npm test          # vitest run
```

- `src/lib/flowmate.test.ts` — unit tests for the pure `flowmate.ts` helpers
  (the legacy module).
- `src/lib/flowmate.uat.test.ts` — the main suite: it `readFileSync`s and (for
  some helpers) `vm`-evaluates the **deployed `github/` source** to assert UAT
  behavior and guard against regressions.

**Caveat:** many assertions are source-string checks ("the code contains X"),
which catch removed behavior but not all runtime regressions. There is no build,
so the React screens can't be executed headlessly here — verify UI changes in a
browser against a real Supabase project. (A future phase could add jsdom
component tests + CI; intentionally out of current scope.)

---

## 7. Production-readiness review status

A full QA/security/performance review was completed and fixed in phases:

- **Phase 1 (security ship-blockers):** revoke direct DML; DetailScreen hooks
  crash; List orphan-assignee crash; assignment-engine advisory lock; whitelist
  on email change; link URL validation; error sanitization; gated smoke test.
- **Phase 2 (stability):** owner-FK on-delete + null-safe transition guards;
  robust badges; detail re-fetch after mutation; modal prompts (no
  `window.prompt`); unified transition RPC; auth-init race; session-expiry
  handling; CSV-injection guard; documented read model.
- **Phase 3 (performance):** visibility-paused/backoff poller; removed full-page
  reloads; server-side archived filter + deduped assignment-run view; debounced
  search; O(n²) grouping fix; DB indexes.
- **Phase 4 (this doc + CSV-helper dedup):** maintainability/confidence.

- **O-1 (build step):** done — JSX is precompiled to plain JS (`npm run build:github`),
  removing the in-browser Babel transpile that was freezing first load.

Deferred by choice: shared data-load hook / `flowmateRpc` refactor (Q-1/Q-3 —
regression risk without a runnable build), CI, and retiring `src/`.
