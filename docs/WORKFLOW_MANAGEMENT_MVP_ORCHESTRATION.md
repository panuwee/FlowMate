# Workflow Management MVP — Project Control Plane

## Charter

- Objective: deliver R1–R9 without changing unrelated workflows or historical records.
- Runtime: GitHub Pages files under `github/`, backed by Supabase SQL in `supabase/`.
- Deployment: manual GitHub web upload; SQL is run manually in Supabase SQL Editor.
- Non-goals: new roles, permanent campaign-tag deletion, unrelated page redesign.

## Task Matrix

| ID | Requirement | Owner | Dependencies | Deliverable | Status |
|---|---|---|---|---|---|
| A1 | R1 format model | Agent A | Discovery | channel/format contract and migration | In progress |
| A2 | R5 team/access model | Agent A | Discovery | team membership and access contract | In progress |
| A3 | R6–R7 campaign-tag model | Agent A | Discovery | canonical tag/archive contract | In progress |
| B1 | R1 UI | Agent B | A1 | channel-driven format selector | In progress |
| B2 | R3 theme | Agent B | Shared tokens | persistent light/dark appearance | Planned |
| B3 | R2/R4 working rows UI | Agent B | C1 | full rows and combined filters | Planned |
| B4 | R5 workspace UI | Agent B | A2/C2 | team workspace selector/context | Planned |
| B5 | R6–R8 campaign UI | Agent B | A3/C3 | colour, management, collapse/expand | Planned |
| B6 | R9 navigation | Agent B | None | persistent Home/Product Book navigation | Planned |
| C1 | R2 retrieval/count | Agent C | Discovery | complete row retrieval and count | In progress |
| C2 | R5 authorization | Agent C | A2 | RLS and team-scoped data access | Planned |
| C3 | R6–R7 persistence | Agent C | A3 | campaign lifecycle and migration | Planned |
| D1 | R1–R9 QA | Agent D | Integrated build | test matrix, evidence, defects | Planned |

## Interface Contracts

- Creative format keys: `1200x1200`, `1200x1500`, `1080x1920`, `1920x1080`, `custom`.
- Team keys: `gdve`, `ops`, `mkt`, `esport`.
- Campaign function keys: `mkt`, `ops`, `esport`.
- Theme keys: `light`, `dark`; default is `light`.
- Frontend source of truth is `github/*.jsx`; generated `github/*.js` must be rebuilt.
- New SQL changes must be idempotent and isolated in a new migration file.

## Quality Gates

- `npm.cmd test`
- `npm.cmd run build:github`
- `node --check` for generated/runtime JavaScript
- SQL static safety and RLS policy review
- Browser smoke test: desktop and mobile, console health, target interactions
- Manual Supabase-dependent checks documented separately when credentials/live data are unavailable

