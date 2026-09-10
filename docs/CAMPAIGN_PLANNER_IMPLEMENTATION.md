# Campaign Planner — Implementation and handoff

Date: 2026-09-10

## Latest refinement — supersedes the original brief where different

- Admin-only campaign editing at both UI and database layers; no Marketing Lead access button. The prior leads table is retained for non-destructive reapplication, but its rows grant no management permission.
- Month columns subdivide into Monday–Sunday calendar weeks clipped at month boundaries. Week labels show the starting day; hover shows exact dates. 6/12-month views allow horizontal scroll to keep week labels legible.
- Expanded content uses Product / Event, Channel, Launch Date and Status from the same stored placement data as Working Sheet. Status normalization and primary placement ordering match Working Sheet, including mixed status. No FlowMate production-status override is used.
- Visible reference-month wording, subtitle and repetitive explanations removed. Manage/Refresh use labelled icon buttons. Required validation remains.
- Latest checks: 50 focused frontend assertions and 23 isolated PostgreSQL assertions passed; updated browser checks passed for weekly columns, Working Sheet values, Admin-only access, all zoom modes and mobile/dark rendering.
- SQL was installed and verified on `workgrid-test` on 2026-09-10. The matching frontend release targets GitHub `version2.1.1`. No Lead assignment step is needed; Admins manage campaigns directly.

## Design opening brief

Act as a senior product designer and frontend engineer extending FlowMate's existing Marketing Plan. Build Campaign Planner as an operational planning surface for Marketing Leads who need to define campaigns and understand activity start/end dates across months. Their central task is to identify what runs when, inspect overlapping campaigns, and open the underlying content items without losing the wider planning context. Use the existing Garena typography, light/dark tokens, icon set, control shapes and Marketing Plan navigation. Preserve the established system rather than introducing a new visual identity.

Use a fixed campaign identity column beside proportional calendar duration bars. Keep each campaign name, Function, progress and exact date range readable on the left. Show three months by default, with six-month and calendar-year choices. Place range controls above the timeline and search/Function/archive filters alongside them. Provide Today and previous/next range controls. Keep campaign rows collapsed initially; expand only the requested campaign's content items. Use Function colours for bars and descriptive text for progress. Show officially entered activity dates separately from the first and last publishing dates. Keep undated campaigns visible in a dedicated section so campaigns can be planned before content exists.

Place Manage Campaign and New Campaign actions on this surface only. The form includes name, optional Tagline, Function Colour Tag and paired calendar dates. Show a concrete naming example and inline validation. Preserve draft input on failed saves, prevent duplicate submission, and identify stale edits. Render an accessible native dialog with keyboard dismissal and contained focus. Only active Admins can manage campaigns; the Marketing Lead assignment UI is removed. Viewers can open details without seeing edit controls. Retain the existing Admin-only archive/restore rule and historical data. On mobile, let the timeline scroll within its own region and keep campaign names visible; surrounding controls must remain readable without page overflow. Provide loading, retry, empty, filtered, archived and unscheduled states. All screenshot fixtures must be labelled as synthetic and cannot be presented as live data.

## Implementation decisions

- Existing `marketing_campaign_tags.id` is the stable cross-month identity; no automatic historical name merge or date backfill.
- Add `marketing_campaign_planner_details` for tagline and activity dates.
- Retain the legacy `marketing_campaign_planner_leads` table only for non-destructive compatibility. Permission checks ignore its contents and require Admin.
- New RPC `marketing_campaign_planner_save` saves tag and details atomically with stale-edit detection.
- A tag trigger protects the existing management RPCs too. Existing unchanged legacy names remain usable, but the new Planner save requires the suffix.
- SQL views use caller permissions and calculate whole-campaign progress. Items with no placements stay incomplete; no unapproved manual completion rule is invented.
- Function colours and archive/restore move with Manage Campaign. Search and archived filters are available on Planner.
- 3-month windows align to calendar quarters; 6-month windows align to Jan–Jun / Jul–Dec; full year aligns to Jan–Dec.

## Installation order — not yet executed against a live database

1. Confirm target environment and branch integration before applying or deploying. Work was performed in the authorized root checkout, currently `version2.1`, with unrelated dirty changes preserved. The requested remote target remains GitHub `version2.1.1`.
2. Confirm `marketing_plan.sql` and `workflow_mvp_catalogs.sql` have already established the current schema. Do not rerun historical seed scripts indiscriminately.
3. Apply `supabase/marketing_campaign_planner.sql` as one transaction in the approved environment. It adds Planner metadata and restricts campaign management to active Admins. Existing Lead grants no longer confer editing rights.
4. Run `supabase/marketing_campaign_planner_verify.sql` and authenticated UAT for Admin, Lead and Member.
5. Publish the matching root `app.js` and `app.css` through the normal release process, with cache-version updates for each active entry page. The existing build compiles `app.jsx`; no new runtime package is required.
6. Admin opens Campaign Planner to set dates/taglines and review legacy names as campaigns are edited. The Marketing Lead assignment button is removed by the latest refinement.

## Local verification

- Latest results: 50 focused frontend/domain assertions passed (252 unrelated assertions skipped); 23 isolated PostgreSQL assertions passed; browser fixture checks passed. Build regenerated only `app.js`; other generated bundles stayed unchanged.
- Week-label geometry is verified in the browser for all three views: no label collision or truncation at axis boundaries.
- Independent visual review: dark secondary-button contrast, first-invalid-field focus/error associations, and the mobile header were corrected and scored resolved. This verdict is limited to source and fixture recaptures.
- Focused frontend/domain tests: `npx vitest run src/lib/campaign-planner.test.ts src/lib/flowmate.uat.test.ts --exclude '**/.worktrees/**' -t 'Campaign Planner|Marketing Plan product split shell'`.
- PostgreSQL integration: `node scripts/test-campaign-planner-db.mjs`. Uses isolated PGlite plus the real existing catalog RPC definitions; never contacts a live Supabase project.
- Browser fixture: `node scripts/test-campaign-planner-ui.mjs`. Compiles the actual component with mocked data and uses Edge to exercise controls and capture desktop/mobile/light/dark screenshots.
- Test-only tools are installed in `output/campaign-planner-tools` with pinned `@electric-sql/pglite@0.5.8` and `playwright@1.58.2`; application dependencies are unchanged.
- Screenshots and reports are in `output/campaign-planner/`; these are explicitly labelled synthetic data.

## Remaining verification and known limitations

- Live schema/permissions, actual campaign contents and rendered UAT inside the authenticated full app have not been verified.
- Wider local regression run has 13 failures outside the modified Planner feature: legacy launch/draft contracts, older Planning View VM extraction, List/Calendar and cancellation linkage assertions. See `output/campaign-planner-regression-tests.json`. The initial discovery also included another worktree; subsequent runs exclude it.
- No automatic campaign-success KPI, weighted progress, drag-to-reschedule, or bulk rename of historical campaigns is included.
- Large catalogs are paginated; expanded details are fetched on demand. Performance still needs verification with production-scale data.
- The database installation completed on `workgrid-test`; authenticated browser UAT remains the final verification after the frontend release.

## Documentation sources

- Supabase caller-permission views and RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Existing schema: `supabase/workflow_mvp_catalogs.sql`, `supabase/marketing_plan.sql`.


### Equal weekly columns (latest revision)
All weekly columns have equal width and span Monday–Sunday without splitting at month boundaries. Month headers group weeks by their Monday; the first visible month also includes the preceding Monday when needed to retain its opening days. The final week extends through Sunday. Bars and Today use the same padded seven-day axis, while campaign inclusion and clipping retain the selected calendar period. This supersedes proportional partial-week columns.
