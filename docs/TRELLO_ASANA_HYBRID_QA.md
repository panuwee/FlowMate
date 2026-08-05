# FlowMate Trello + Asana Hybrid QA

Date: 3 Aug 2026

## Release status

Release candidate is ready for manual GitHub upload and ordered Supabase rollout.
Do not call the production rollout complete until the live database finishes
`supabase/trello_asana_hybrid_verify.sql` with every check passing.

## Locked workflow verified

- Creative Requests auto-assign immediately; the requester does not select GD/VE.
- Skill, leave, WIP, and production capacity affect ranking and warnings, but do
  not block assignment.
- No eligible active member produces `Unassigned`, not a new Queued row.
- Admin/requester can reassign or clear an owner. An active GD/VE member can
  self-assign only an Unassigned Creative Request.
- `Need Brief` is excluded from production capacity, WIP, and delivery KPI.
- Capacity is planned automatically. Detail has no AM/PM editor and Gantt
  combines internal allocation into one daily workload total.
- Central Queue is replaced by deduplicated `Attention Needed`; legacy `#queue`
  links redirect to `#attention`.
- Existing Sub PIC and GD/VE cross-workspace status permissions remain covered
  by the regression suite.

## Automated evidence

| Check | Result | Evidence |
| --- | --- | --- |
| Full Vitest suite | PASS | 7 files, 330/330 tests |
| Hybrid backend contract | PASS | 11/11 tests |
| Canonical SQL integration | PASS | 8/8 tests |
| Hybrid frontend contract | PASS | 16/16 tests |
| Existing FlowMate regression | PASS | 269/269 tests |
| Simplified Capacity UI | PASS | No manual editor copy; Gantt daily-total contract covered by frontend regression |
| Next.js production build | PASS | Compile, typecheck, static generation |
| GitHub runtime syntax | PASS | 8/8 JavaScript files passed `node --check` |
| GitHub bundle generation | PASS | `npm run build:github` completed |

Commands:

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run build:github
node --check github/app.js
```

## Rendered browser evidence

Target flow: local GitHub Pages build -> `#attention` -> meaningful first screen
without a blank page or console errors.

| Browser check | Result | Evidence |
| --- | --- | --- |
| Page identity | PASS | `FlowMate - GD/VE Workflow` at `http://127.0.0.1:4176/#attention` |
| Blank-page check | PASS | FlowMate Google sign-in screen rendered |
| Framework error overlay | PASS | None present |
| Console errors/warnings | PASS | No errors or warnings after reload |
| Desktop render | PASS | Sign-in screen rendered without clipping |
| Mobile 390x844 render | PASS | Sign-in screen remained readable and usable |
| Cache-busted assets | PASS | Modified CSS/JS loaded with `v=20260803-4` |
| Manual AM/PM editor absent | PASS | Source/runtime scan and unauthenticated DOM contain no editor |
| Authenticated feature interaction | NOT RUN | Local browser had no Garena Google session; no account/auth state was bypassed |

## SQL rollout gate

Run one file at a time in this exact order:

1. `supabase/trello_asana_hybrid_prepare.sql`
2. Wait for the transaction to commit.
3. `supabase/trello_asana_hybrid_backend.sql`
4. `supabase/trello_asana_hybrid_migrate_queued.sql`
5. `supabase/trello_asana_hybrid_verify.sql`

Back up Supabase first. In Supabase SQL Editor choose **Run without RLS**;
these controlled scripts manage their own RLS, policies, grants, and
security-definer functions. Stop if any migration command errors or any verify
row reports failure.

## Remaining production checks

- Live SQL compilation, data migration, and RLS/RPC permission probes were not
  executed from this workspace.
- After deployment, test one admin/requester and one GD/VE assignee using real
  Supabase data: create, automatic assignment, warning display, reassign/clear,
  GD/VE self-assign, simplified daily capacity, Start Work, and Submit Review.
- Confirm the live migration leaves zero active Creative Requests in Queued and
  preserves the archived pre-migration snapshot.
