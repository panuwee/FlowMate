# Campaign Timeline visibility handoff

Base: `fbb17c67` on `version2.1`.

## Delivered behavior

- Archiving a Campaign Tag in **Manage Campaign** hides that Campaign and all of its tasks from Campaign Timeline, FB eSport Timeline, Channel Plan, and Calendar.
- Restoring the tag makes its existing data visible again.
- Working Sheet data and historical records are retained; no SQL or RLS changes are required.
- Campaign Timeline opens centered near today's column when today is in the visible three-month window.
- Campaigns with at least one placement today appear before the remaining campaigns; each group otherwise keeps its current ordering.

## Verification

- Feature regression test: passed.
- Static build verification: passed.
- `npm.cmd run build:github`: passed; generated static JavaScript is included.
- Full suite remains blocked by the pre-existing 33 unrelated failures on this baseline.
- Browser reached the local sign-in page, but data-bound visual validation requires an authenticated FlowMate session.

## Handoff scope

Changed source: `app.jsx`, `src/lib/flowmate.uat.test.ts`.

Generated output changed for this feature: `app.js`. The build also checked the other static JavaScript outputs and found no content changes.

No commit, push, SQL execution, or deployment was performed.
