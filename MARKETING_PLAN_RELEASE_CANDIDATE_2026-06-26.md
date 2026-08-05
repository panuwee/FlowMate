# Marketing Plan MVP Release Candidate

Date: 2026-06-26
Status: Passed with caveats
Product path: Login -> Choose workspace -> Marketing Plan

## Scope Delivered

- Separated FlowMate execution from Marketing Plan planning.
- Added post-login product choice: FlowMate or Marketing Plan.
- Added topbar product switch so users can move between products without signing out.
- Added Marketing Plan data model independent from FlowMate tasks:
  - Campaign
  - Content item / asset
  - Channel placement
- Added placement-owned schedule fields:
  - publish date
  - publish time
  - channel
  - placement status
- Added Marketing Plan screens:
  - Campaign Timeline: campaign row, asset sub-row, date columns, channel placement markers.
  - Channel Plan: grouped by channel first.
  - Calendar: publish-date calendar using placement date/time.
  - Import / Export: CSV export for visible Marketing Plan placement rows.
- Kept FlowMate Planning MVP 1.3 screens dormant and out of the default FlowMate navigation.

## Files Changed / Upload List

Upload these files for this Marketing Plan release candidate:

- `docs/MARKETING_PLAN_PRODUCT_SCOPE.md`
- `docs/MARKETING_PLAN_DATA_MODEL.md`
- `docs/MARKETING_PLAN_UAT_CHECKLIST.md`
- `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md`
- `docs/MARKETING_PLAN_RELEASE_CANDIDATE_2026-06-26.md`
- `supabase/marketing_plan.sql`
- `supabase/README.md`
- `src/lib/flowmate.uat.test.ts`
- `github/app.jsx`
- `github/app.js`
- `github/index.html`

## SQL Run Order

For an existing FlowMate database, run:

1. `supabase/marketing_plan.sql`

Optional sample data:

```sql
select public.marketing_plan_june_2026_sample();
```

For a fresh database, run:

1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/rpc_quick_task.sql`
4. `supabase/rpc_assignment.sql`
5. `supabase/whitelist_access.sql`
6. `supabase/security_hardening.sql`
7. `supabase/notification_center.sql`
8. `supabase/collaboration_admin.sql`
9. `supabase/ai_tags.sql`
10. `supabase/view_security_hardening.sql`
11. `supabase/team_settings_admin.sql`
12. `supabase/marketing_plan.sql`

## Automated Verification Evidence

Static QA passed:

- Required docs exist.
- `supabase/marketing_plan.sql` exists.
- Core tables exist:
  - `marketing_plans`
  - `marketing_campaigns`
  - `marketing_content_items`
  - `marketing_channel_placements`
- `marketing_plan_timeline_v` exists.
- RLS is enabled on Marketing Plan tables.
- No `current_app_user_id() is null` or `auth.uid() is null` bypass pattern found in Marketing Plan SQL.
- Post-login product switch exists.
- FlowMate sidebar has no Planning group.
- Marketing Plan shell exists.
- Campaign Timeline, Channel Plan, Calendar, and Import / Export screens exist.
- Marketing Plan screens load from `marketing_plan_timeline_v` / shared Marketing Plan timeline loader.
- No custom cursor regression found.
- No `pointermove` / `mousemove` orb tracking found.
- SMIL `animateTransform` remains in the landing sigil.

Command verification:

- `npm.cmd test` passed: 221/221 tests.
- `npm.cmd run build:github` passed.
- Build result: `github/app.js` unchanged; no output changed.
- `github/index.html` points to `app.js?v=20260626-6`.

## Manual QA Checklist

1. Login with a whitelisted account.
2. Confirm the product choice screen appears.
3. Click `FlowMate`.
4. Confirm FlowMate works as before and the sidebar has no Planning group.
5. Use the topbar switch to open `Marketing Plan`.
6. Confirm Marketing Plan default screen is `Campaign Timeline`.
7. Confirm Campaign Timeline shows campaign rows, asset sub-rows, date columns, and placement markers.
8. Open `Channel Plan`.
9. Confirm placements are grouped by channel and filters work.
10. Open `Calendar`.
11. Confirm calendar uses publish date / publish time, not FlowMate due date or launch date.
12. Open `Import / Export`.
13. Click `Export CSV` and confirm visible placement rows download.
14. Switch back to FlowMate without signing out.

## Known Limitations

- Import Mapping is not implemented yet. Import UI is prepared, but there is no real Google Sheet/PDF-style upload and preview flow.
- Marketing Plan write UI is not yet built. Current MVP focuses on data model, read views, and CSV export.
- Optional June 2026 sample data must be inserted manually if the production database has no Marketing Plan rows.
- CSV export is currently the practical format for placement rows. XLSX can be added later if management needs multi-tab reporting.
- FlowMate task execution and Marketing Plan planning are intentionally separate. Linking Marketing Plan items to FlowMate work items is supported by the data model, but full linking workflow is a later pass.

## Next Recommended Step

Build Import Mapping for the monthly Google Sheet/PDF-style plan:

- Upload or paste monthly plan data.
- Preview parsed rows before writing.
- Map source rows to Campaign -> Content Item -> Channel Placement.
- Validate required fields, channel names, publish dates, and duplicate placements.
- Only write to Marketing Plan tables after preview approval.
