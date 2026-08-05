# Workflow Management MVP Handover

Release candidate: `v20260725-1`

Release status: **Local implementation complete; staging SQL/RLS verification required before production Go.**

## 1. MVP summary

The R1-R9 implementation is integrated across the GitHub Pages frontend and Supabase migrations. The release adds structured channel-specific creative formats, complete Working Rows with combined filters, persistent Light/Dark appearance, four team workspaces with server-side authorization, campaign function colours and archive lifecycle, campaign collapse/expand, and persistent Home/Product Book navigation.

The remaining external blocker is a live Supabase run. The workspace has no database connection or authenticated staging users, so the SQL migrations, August 2026 source count, and standard-user versus privileged-user RLS checks have not been executed against the real project.

## 2. Requirement-to-implementation mapping

| Requirement | Implementation | Local evidence |
|---|---|---|
| R1 | `creative_channels`, `creative_formats`, and `creative_channel_formats`; channel union dropdown; invalid-format clearing and submit guard | Helper tests cover all channels and Facebook + YouTube union; browser fixture showed Facebook formats; structured SQL trigger derives dimensions/aspect |
| R2 | Removed `visibleRows.slice(0, 12)`; exact matching count; filters and CSV use the same visible set | Browser fixture showed `16 requests`, Review showed `6 requests`, Clear restored `16 requests` |
| R3 | Global Light/Dark control, `flowmate:appearance:v1`, no-flash entry-page bootstrap, dark tokens and responsive CSS | Browser refresh retained Dark and computed page background `rgb(16, 19, 24)` |
| R4 | Month, channel, status, team, PIC/Sub PIC, search, active-filter summary, and clear controls | Browser status/clear checks passed; UAT hooks cover all controls |
| R5 | Four teams, multi-team membership, all-team flag, active workspace selector, server-filtered queries, team RLS and child-table policies; GD/VE can read every mapped Creative Request while cross-team Quick Tasks and writes remain restricted | Static SQL review found 4 teams and 19 policies; GD/VE follow-up contains 10 read-only policies and no write policy |
| R6 | Campaign function catalog, light/dark colours, editable Colour Tag action, labelled tags in manager and Timeline | Browser Timeline showed `MKT` and `Ops`; manager showed Colour Tag controls |
| R7 | Search, function filter, newest/oldest/recently-used sort, archive/restore, normalized duplicate prevention and usage count | Browser manager rendered all controls and usage counts; SQL exposes archive/restore RPCs and preserves linked records |
| R8 | Campaign group button, row count, function label, `aria-expanded`, session persistence and independent row visibility | Browser collapse changed `true` to `false` and hid Asset 1 while leaving the other campaign available |
| R9 | Home and Product Book remain in Marketing Plan topbar; all three direct entry pages load the same runtime | Browser found one Home and one Product Book action; `/`, `/home/`, and `/product-book/` returned 200 with no page errors |

## 3. Data model and API/interface changes

### Creative formats

- `creative_channels`
- `creative_formats`
- `creative_channel_formats`
- Structured columns on `creative_request_details`: `size_format_code`, width, height, aspect ratio, normalized channels, and legacy marker
- Existing `create_creative_request` signature remains compatible; a database trigger validates and derives structured values

### Team workspaces

- `teams`
- `user_team_memberships`
- `users.can_access_all_teams`
- `work_items.owning_team_code`
- Security-definer access helpers, write guards, team-scoped RLS, and child-table policies
- Known historical team values are mapped; unknown/FCO values remain in migration quarantine with `owning_team_code = NULL`

### Campaign tags

- `marketing_campaign_functions`
- `marketing_campaign_tags`
- `marketing_campaigns.campaign_tag_id`
- `marketing_campaign_tag_management_v`
- RPCs:
  - `marketing_upsert_campaign_tag`
  - `marketing_archive_campaign_tag`
  - `marketing_restore_campaign_tag`
  - `marketing_update_campaign_tag_function`
  - `marketing_ensure_campaign_instance`

The migration deliberately does not recreate or reorder `marketing_plan_timeline_v`, avoiding the previous PostgreSQL `42P16` view-column rename failure.

## 4. Files/components changed

### Production frontend

- `github/index.html`
- `github/home/index.html`
- `github/product-book/index.html`
- `github/app.css`
- `github/app.jsx`
- `github/app.js`
- `github/screens-a.jsx`
- `github/screens-a.js`
- `github/workflow-mvp.js`
- `github/supabase-quick-task.js`
- `github/supabase-list-data.js`

### Supabase

- `supabase/workflow_mvp_catalogs.sql`
- `supabase/workflow_team_workspaces.sql`
- `supabase/workflow_gdve_creative_visibility.sql`
- `supabase/marketing_plan_sub_pic_restore.sql`
- `supabase/workflow_management_mvp_verify.sql`
- `supabase/README.md`

### Tests and documentation

- `src/lib/workflow-mvp.test.ts`
- `src/lib/workflow-mvp.uat.test.ts`
- `src/lib/flowmate.uat.test.ts`
- `docs/WORKFLOW_MANAGEMENT_MVP_ORCHESTRATION.md`
- `docs/WORKFLOW_MANAGEMENT_MVP_HANDOVER.md`

## 5. QA test report

### Passed locally

- `npm.cmd run build:github`
- `npx.cmd tsc --noEmit`
- `node --check` for generated/runtime JS
- Full Vitest suite: 283/283 passed across 4 test files
- Workflow MVP tests: 17/17 passed
- Browser signed-out smoke: `/`, `/home/`, `/product-book/` returned 200; no page exceptions; mobile width had no horizontal overflow
- Browser signed-in fixture:
  - Working Rows 16 -> Review 6 -> Clear 16
  - Dark theme persisted
  - Home and Product Book controls present
  - MKT/Ops labels rendered
  - Campaign collapse changed state and hid only the selected campaign rows
  - Privileged team selector showed GD/VE, Ops, MKT, eSport
- SQL static checks:
  - Both migrations have transaction boundaries
  - 4 team seeds
  - 19 team RLS policies
  - 5 campaign lifecycle RPCs
  - 2 rollback-only impersonation test blocks
  - `marketing_plan_timeline_v` is preserved
  - GD/VE visibility delta has 10 read policies and 0 write policies

### Required staging checks

- Run all SQL against the linked Supabase project
- Confirm underlying August 2026 count is 16 and rendered count is 16
- Execute the verification script with one standard user and one Gear/Mac/Panu/admin user
- Confirm unauthorized team access is rejected through direct URL/API attempts
- Confirm archive/restore and duplicate prevention with real historical campaign data
- Visual contrast review on authenticated desktop/mobile screens with real data

## 6. Migration steps

For an existing database that already has FlowMate, whitelist/security helpers, and Marketing Plan:

1. Upload the matching `v20260725-1` frontend release or schedule it in the same release window.
2. Run `supabase/workflow_mvp_catalogs.sql`.
3. Run `supabase/workflow_team_workspaces.sql`.
4. Run `supabase/workflow_gdve_creative_visibility.sql`.
5. Run `supabase/marketing_plan_sub_pic_restore.sql`.
6. Run the migration-quarantine report query near the top of `supabase/workflow_management_mvp_verify.sql`.
7. For every `owning_team_code = NULL`, assign the verified real team with the commented template. Do not guess.
8. Run the complete `supabase/workflow_management_mvp_verify.sql`.

If Supabase shows the automatic RLS warning, choose **Run without RLS**. The migrations explicitly enable RLS and install their own policies. Do not rerun `rpc_assignment.sql` for this release.

## 7. Known limitations and deferred Phase 2 items

- Live database/RLS verification is external to this workspace and remains the release blocker.
- Timeline collapse state is session-scoped by design; it does not sync across devices.
- Campaign permanent deletion is intentionally excluded.
- Legacy campaigns whose function cannot be inferred must receive a Colour Tag before they can be used for a new campaign instance.
- Browser multi-channel click automation timed out after the signed-in fixture checks; the format union is covered by deterministic helper tests.

## 8. Recommended next priority

Run the migrations in staging, resolve any quarantine rows, execute the verification script, then perform a short authenticated acceptance pass as a standard user and Panu. Production Go should follow only after those checks pass.
