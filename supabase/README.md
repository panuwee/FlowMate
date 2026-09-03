# FlowMate Supabase Setup

This folder contains the SQL needed to prepare the Supabase backend for FlowMate.

### OT Request MVP

For an existing Workgrid database, run only:

1. `supabase/ot_request.sql`
2. `supabase/ot_request_verify.sql` (read-only; run last)

Choose Run without RLS. The installer enables RLS, revokes direct writes, exposes authenticated RPCs, and seeds OT roles only for matching existing users. Production execution is a separate manual step and is not proven by local tests.

`ot_set_system_role` keeps the sole OT Owner fixed to `panuwee.w@garena.com` and permits `hr_admin` activation only for `nithidol.k@garena.com`, `weerayut@garena.com`, or `napol.a@garena.com`. An active legacy HR/Admin role outside that three-identity allowlist receives no OT HR/Admin access, even before cleanup. The Owner may deactivate an existing legacy `hr_admin` row through the same reason-required, audited remediation RPC even when its user is inactive or its email is no longer `@garena.com`; deactivation cannot create a new row or change an Owner role. The read-only verifier checks the fixed shared helper, the activation-only remediation guard, and reports active HR Admin rows outside the approved MVP identities.

The OT request installer stores the consent statement version on each occurrence. Employee-created requests require `consentStatementVersion` in `ot_create_request`; event consent uses `ot_record_consent(uuid, boolean, text, uuid)` and stores the version for either accept or decline. The installer removes the legacy three-argument consent signature so version capture cannot be bypassed.

The database accepts only consent statement version `2026-08-07` and the fixed OT reason codes `offline_event`, `campaign_launch`, `live_incident`, `capacity`, `external_schedule`, `rework`, `scope_change`, `travel_offsite`, and `other`. `other`, `live_incident`, `rework`, and `scope_change` require non-empty detail. Individual creation, event preview/creation, and plan resubmission require the planned `timestamptz` start to remain future at call time and again after all write-path locks; the write RPCs recheck immediately before insert/update so a start that becomes non-future while waiting cannot commit. These paths and Actual submission validate reason/consent evidence and reject overlapping half-open intervals only after ordered employee-week locks. Manager rejection/revision notes are mandatory, as is the assigned approver's note when approving a compliance-required Actual. After that approval is recorded, the assigned manager cannot decide the same Actual again even while it remains `compliance_review_required`; only `ot_request_actual_amendment` by the Owner or an approved active HR/Admin can reopen it for correction.

Every audit row stores an immutable normalized `actor_email_snapshot`. Installation adds the nullable column, backfills only missing snapshots from `public.users`, rejects an unresolved historical identity, sets the column `NOT NULL`, and installs a `BEFORE INSERT` trigger that derives the email from `actor_user_id` regardless of caller input.

Owner deactivation is intentionally two-step: the server reassignment RPC is atomic, but reassignment and deactivation are two separate browser calls. `ot_reassign_pending_approver` moves every non-final Requested/Actual workflow record to another active fixed approver under deterministic locks and audits each move plus the administration action. The Owner-only `ot_list_access_admin_identities()` RPC always returns the fixed Big, Mac, and Pluem directory with normalized email, nullable Workgrid user ID, Workgrid-active, approver-active, and HR/Admin-active state; it does not reuse or widen the active-only event participant directory. An inactive Workgrid source remains a fixed allowlisted identity for reassignment and deactivation only; the destination and every approver or HR/Admin activation must still have an existing active Workgrid identity, and reassignment destinations must also be active approvers. The browser refreshes after that RPC and then exposes a separate deactivation action; `ot_set_approver(..., false, ...)` rechecks and rejects if any new pending work arrived in the gap.

`ot_submit_actual` accepts `actualVarianceReason` (plus the snake-case and current `varianceReason` aliases). A non-empty reason is mandatory when absolute actual-versus-planned net minutes exceeds 30, and the normalized reason remains on the request and in its audit facts. These additions do not grant direct OT table writes or widen any existing read policy.

`ot_list_hr_ready(date)` remains restricted to OT Owner or HR/Admin and keeps the existing HR-ready, compliance, and Bangkok-week filters. It returns each authorized row as JSON containing every `ot_requests` field plus normalized snake-case `employee_email` and `approver_email` keys for privacy-safe CSV export. No direct table-write permission is added.

Weekly limit policy uses one canonical counted total: each included occurrence contributes submitted Actual segments when available, otherwise Requested segments, never both. Draft, rejected, cancelled, and pre-work `revision_required` occurrences are excluded; `revision_required` after Actual submission plus `hr_ready` and `exported` Actual history remain counted. Personal dashboards expose this authoritative value as `countedMinutes` while keeping `plannedMinutes` and `actualMinutes` as descriptive totals. The projected-total function and the unchecked counted helper are not executable by `authenticated`; weekly totals are available only through scoped dashboard and preview RPCs.

Local Vitest checks validate source and application contracts only. Before UAT or deployment, an approved staging operator must run `supabase/ot_request.sql` followed by the read-only `supabase/ot_request_verify.sql` and validate PostgreSQL compilation, audit backfill/trigger installation, RLS access, effective grants, reason/consent/note enforcement, deterministic reassignment locks and replay, safe deactivation, and concurrent overlap/weekly accounting behavior. With disposable rows and separate authenticated sessions, staging must additionally prove: a manager-approved compliance Actual rejects a different-key second approval/rejection/revision while same-key replay returns the original result; the amendment RPC remains reachable; individual create, plan resubmit, event preview, and event create reject equal/past starts; each write RPC also rejects a future start that passes the caller guard but becomes non-future while waiting on its approver/employee-week/request locks; and an inactive fixed-allowlisted source approver can be reassigned then deactivated while a non-allowlisted source still fails and the destination remains active and eligible. For both `ot_review_plan(..., 'approved', ...)` and `ot_record_consent(..., true, ...)`, create a disposable request with a near-future start, use Session A to `begin` and hold the request row lock until the planned start is equal or past, invoke the positive action with Session B before the boundary so it waits, then commit Session A; Session B must reject after its locked reread, write no decision/consent audit, and leave rejection/revision or decline available. Repeat with one request whose positive action committed before the boundary: the same committed idempotency key must replay the original result even after the planned start, while a different key must not create a second action. The operator must also race `ot_review_plan` and `ot_verify_actual` from the assigned approver against Owner reassignment followed by deactivation, using disposable decision-ready requests and separate authenticated sessions. The acceptable outcomes are: the valid decision commits before the administrative change, or the administrative change commits first and the stale decision is rejected after its locked reread; there must be no decision audit by a no-longer-assigned or inactive approver and no deadlock. This staging SQL and concurrency gate is mandatory because local source-contract tests are not database-runtime proof.

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Creates enums, tables, indexes, views, helper functions, triggers, grants, and RLS policies |
| `seed.sql` | Adds MVP mock users, GD/VE members, sample work items, creative details, assignment runs, checklist items, comments, and events |
| `rpc_quick_task.sql` | Quick-task / checklist / comment / status-transition / cancel RPCs |
| `rpc_assignment.sql` | Assignment engine: `create_creative_request`, `recheck_brief`, `rerun_assignment`, plus effort + brief-completeness helpers |
| `trello_asana_hybrid_prepare.sql` | Approved existing-database enum and capacity-constraint preparation; must commit before the backend delta |
| `trello_asana_hybrid_backend.sql` | Approved no-queue assignment, allocation, reassignment, and reschedule backend delta |
| `trello_asana_hybrid_migrate_queued.sql` | Data-changing, archive-first migration of active historical Queued Creative Requests |
| `trello_asana_hybrid_verify.sql` | Read-only contract, permission, and zero-active-Queued verification for this release |
| `whitelist_access.sql` | Restricts Google sign-in to a fixed list of `@garena.com` emails. Run AFTER the auth-sync triggers from the SSO setup step. |
| `security_hardening.sql` | Re-applies auth-based RLS helpers, policies, and final grants/revokes after RPC + whitelist setup |
| `notification_center.sql` | MVP 1.2 Notification Center table hardening, read-state RPCs, trusted event trigger creation, and due-date notification generator |
| `collaboration_admin.sql` | MVP 1.2 detail links, watchers, watcher notification recipients, admin status override, and admin soft archive |
| `ai_tags.sql` | MVP 1.2 task-level AI tags table and auth-scoped add/list/remove RPCs |
| `view_security_hardening.sql` | Locks public views to authenticated users and forces `security_invoker` so underlying RLS is respected |
| `team_settings_admin.sql` | MVP 1.2 Team settings admin-only GD/VE member capacity updates plus own leave request table/RPC |
| `marketing_plan.sql` | Marketing Plan tables, RLS, channel normalization helper, timeline/summary views, and June 2026 sample seed helper |
| `marketing_plan_status_update.sql` | One-time Marketing Plan patch for existing databases: allows Working Sheet status edits such as Assigned, Review, Ready to Post, and Schedule |
| `marketing_plan_supervisor.sql` | Admin-only Marketing Plan Supervisor assignment timestamping, event log, working-day helper, monthly risk view, and summary views |
| `flowmate_production_insights.sql` | Admin-only Supervisor Production Insights views for historical active production time, current operations context, and retired capacity-warning history |
| `flowmate_production_insights_verify.sql` | Rollback-only Production Insights verifier for anon denial, non-admin empty reads, active-hour metrics, and retired warning fixtures |
| `creative_request_date_led_preview.sql` | Read-only Creative Request T-5/T-1 to T-4/T-2 active-data preview with No Tag, skip, retained-history, and Thai calendar counts |
| `creative_request_date_led_apply.sql` | Separately approved recoverable active Creative Request date-led backfill with guarded current-value checks |
| `creative_request_date_led_verify.sql` | Post-apply invariant verifier plus a commented rollback block that requires separate rollback approval |
| `marketing_plan_performance_phase2.sql` | Idempotent direct-link backfill, indexed Timeline/Supervisor joins, and three-month schedule indexes |
| `marketing_plan_performance_phase2_verify.sql` | Read-only Phase 2 mismatch, security-invoker, index, row-count, and EXPLAIN verification |
| `workflow_mvp_catalogs.sql` | Workflow Management MVP creative channel/format catalogs plus campaign function colours and archive/restore lifecycle |
| `workflow_team_workspaces.sql` | Four team workspaces, memberships, owning-team backfill, server-side authorization, and team-scoped RLS |
| `marketing_plan_sub_pic_restore.sql` | Restores searchable Sub PIC assignment plus Marketing Plan and linked FlowMate participant/RPC permission parity |
| `workflow_esport_channel_multi_format.sql` | Adds the distinct FB eSport channel and structured multi-format creative request storage |
| `workflow_gdve_assignee_cross_workspace_start.sql` | Allows an assigned GD/VE member to use assignee-authorized status actions across team workspaces |
| `fix_pond_manual_skills.sql` | Restores Pond's manually selected skills/capacity/WIP and verifies the repaired row |
| `fix_cr1047_assignment_window.sql` | Repairs CR-1047's impossible auto-generated 1st Draft window and reruns the assignment engine without changing member settings |
| `fix_queued_assignment_windows_20260803.sql` | Repairs effort-unaware 1st Draft windows for CR-1048/1049, reruns CR-1050 first, and reports exact post-rerun assignment reasons without changing member settings |
| `gantt_capacity_allocation_read.sql` | Enables least-privilege, workspace-scoped read access for the Team Gantt AM/PM Capacity Allocation layer |
| `workflow_management_mvp_verify.sql` | Read-only assertions and rollback-only impersonation tests for team backfill, grants, triggers, and RLS |
| `phase1_security_fixes.sql` | Post-review **Phase 1** patch for an already-deployed DB: revoke direct table DML (writes go only through RPCs) + enforce the whitelist on `auth.users` email change |
| `phase2_stability_fixes.sql` | Post-review **Phase 2** patch: `work_items.final_owner_member_id` FK uses `on delete set null`; rename the comments read policy. (Also re-run `rpc_quick_task.sql` for the null-safe owner guards.) |
| `phase3_performance.sql` | Post-review **Phase 3** patch: `latest_assignment_run_v` view + composite/partial indexes for the hottest queries |
| `reset_tasks_for_production.sql` | Archive-first go-live reset for tasks/requests only; keeps users, whitelist, team settings, capacity, leave requests, and security/RLS |

## Before Running

You already created `.env.local` with:

```env
NEXT_PUBLIC_SUPABASE_URL="..."
NEXT_PUBLIC_SUPABASE_ANON_KEY="..."
```

Do not put the Supabase `service_role` key in frontend code or commit it to git.

## Run Order

1. Open Supabase Dashboard.
2. Select the FlowMate project.
3. Go to SQL Editor.
4. Create a new query.
5. Run these files in this exact order, one SQL Editor query at a time:
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
   13. `supabase/marketing_plan_status_update.sql`
   14. `supabase/marketing_plan_supervisor.sql`
   15. `supabase/flowmate_production_insights.sql`
   16. `supabase/flowmate_production_insights_verify.sql` (rollback-only verifier; run last for this report slice)
   17. `supabase/marketing_plan_performance_phase2.sql`
   18. `supabase/marketing_plan_performance_phase2_verify.sql` (read-only)
   19. `supabase/workflow_mvp_catalogs.sql`
   20. `supabase/workflow_team_workspaces.sql`
   21. `supabase/workflow_gdve_creative_visibility.sql`
   22. `supabase/marketing_plan_sub_pic_restore.sql`
   23. `supabase/workflow_esport_channel_multi_format.sql`
   24. `supabase/workflow_management_mvp_verify.sql`

## Trello + Asana Hybrid Release Order (3 Aug 2026)

Back up the Supabase database before starting. The queued migration changes
production data, although it first archives every active Queued row for audit.

For an existing database, run base prerequisites only if they have not already
been deployed. Do not rerun unrelated base installers just for this release.
The required release order is exactly:

1. Existing base prerequisites, only when missing
2. `supabase/trello_asana_hybrid_prepare.sql`
3. Wait for `prepare` to commit; PostgreSQL must commit the new enum values
   before later SQL can use them
4. `supabase/trello_asana_hybrid_backend.sql`
5. `supabase/trello_asana_hybrid_migrate_queued.sql` (data-changing)
6. `supabase/trello_asana_hybrid_verify.sql` (run last)

When Supabase shows its RLS warning, choose **Run without RLS**. These scripts
manage their own RLS, policies, grants, and security-definer functions. This
release does not create client-readable tables without the intended security.

### Team Schedule / Weekly Capacity update (3 Aug 2026)

For a database that already completed the Trello + Asana Hybrid release above,
run only these files in this exact order:

1. `supabase/team_schedule_weekly_capacity.sql`
2. `supabase/trello_asana_hybrid_backend.sql`
3. `supabase/trello_asana_hybrid_verify.sql` (verification only; run last)

Choose **Run without RLS** for both. The first script explicitly enables RLS on
the holiday catalog and creates security-invoker read models; the second updates
the assignment/allocation functions so Review remains capacity-counted; the last
reports pass/fail evidence. These scripts do not migrate or delete historical task
data. Do not rerun the Queued migration.

For an existing MVP 1.2 database that already ran the earlier SQL, apply the leave update in this order:

1. `supabase/team_settings_admin.sql`
2. `supabase/rpc_assignment.sql`

For the Central Queue auto-rerun update after capacity is released, apply:

1. `supabase/rpc_assignment.sql`
2. `supabase/rpc_quick_task.sql`
3. `supabase/collaboration_admin.sql`

For the Calendar, Team settings skill editing, and per-due-date capacity update, apply:

1. `supabase/team_settings_admin.sql`
2. `supabase/rpc_assignment.sql`

For the 1st Draft auto-date and AI Tag update on an existing MVP 1.2 database, apply:

1. `supabase/rpc_assignment.sql`
2. `supabase/ai_tags.sql`

For the Asset Count, multi-day assignment capacity, and leave watcher notification update, apply:

1. `supabase/rpc_assignment.sql`
2. `supabase/team_settings_admin.sql`

For the effort-aware automatic 1st Draft fix and the existing CR-1047 repair, apply in this order:

1. `supabase/rpc_assignment.sql`
2. `supabase/fix_cr1047_assignment_window.sql`

Use **Run without RLS** in the Supabase SQL Editor. These are trusted schema/RPC and targeted repair scripts; do not ask the SQL Editor to automatically enable RLS on objects it detects.

For the CR-1048, CR-1049, and CR-1050 Central Queue repair shown on Aug 3, 2026, apply in this order:

1. `supabase/rpc_assignment.sql`
2. `supabase/fix_queued_assignment_windows_20260803.sql`

The repair runs the earliest deadline first, never moves 1st Draft past Launch, and never changes team skills, WIP limits, availability, leave, or capacity settings. A row can legitimately remain queued when the final verification result shows no eligible member has enough remaining production capacity.

For the Team Gantt Capacity Allocation layer, run after the team-workspace access functions are already installed:

1. `supabase/gantt_capacity_allocation_read.sql`

Use **Run without RLS**. The script explicitly enables RLS, recreates the workspace-scoped SELECT policy, and keeps all direct frontend writes revoked.

For the MVP 1.3 Planning backend update, apply:

1. `supabase/schema.sql`
2. `supabase/rpc_assignment.sql`
3. `supabase/security_hardening.sql`
4. `supabase/view_security_hardening.sql`

For the separate Marketing Plan backend update on an existing FlowMate database, apply:

1. `supabase/marketing_plan_performance_phase2.sql`
2. `supabase/marketing_plan_performance_phase2_verify.sql` (read-only)

Do not re-run the full Marketing Plan installer for this performance update.
The Phase 2 migration preserves existing rows, permissions, and view columns.

For the Workflow Management MVP on an existing FlowMate + Marketing Plan database, upload the matching frontend release first or run these SQL files in the same release window:

1. `supabase/workflow_mvp_catalogs.sql`
2. `supabase/workflow_team_workspaces.sql`
3. `supabase/workflow_gdve_creative_visibility.sql`
4. `supabase/marketing_plan_sub_pic_restore.sql`
5. `supabase/workflow_esport_channel_multi_format.sql`
6. `supabase/workflow_no_tag_channel.sql`
7. Run the migration-quarantine report query near the top of `workflow_management_mvp_verify.sql`. If any existing work item has `owning_team_code = NULL`, assign its real team with the commented template in that file; do not guess a team.
8. `supabase/workflow_management_mvp_verify.sql`

If `workflow_team_workspaces.sql` was already deployed before release
`v20260724-4`, run only `workflow_gdve_creative_visibility.sql` and then the
complete verification file. The follow-up expands read visibility for mapped
Creative Requests to active Team GD/VE members; it does not expand cross-team
write access or expose cross-team Quick Tasks.

For the GD/VE cross-workspace assignee-action hotfix on an existing database
that already ran `workflow_team_workspaces.sql`, run only:

1. `supabase/workflow_gdve_assignee_cross_workspace_start.sql`

Re-run the same file if its earlier Start-Work-only or v2 version was already
applied. Version 3 repairs missing GD/VE workspace membership rows and derives
assignee permission directly from the active GD/VE `team_members` login link,
so a missing membership cannot incorrectly block the real final owner. It
allows the actions already granted to an assignee by the workflow RPC: Start
Work, Submit Review, Block, Resume, and Cancel. Approve Delivery and Request
Changes remain requester-only. An unassigned GD/VE user still cannot mutate the
item, and the exception cannot change `owning_team_code`. Direct table writes
remain restricted by the existing RLS and RPC-only grants. The final result
grid audits every active GD/VE member; `blocked_by_assignee_helper` must be `0`,
and Ploy must show `is_cr_1022_assignee = true` with `readiness = READY`.

If the Workflow Management MVP files were already deployed, the Sub PIC
regression fix requires only `supabase/marketing_plan_sub_pic_restore.sql`.
Do not re-run `rpc_assignment.sql` for this fix. The delta must run after
`marketing_plan.sql`, `rpc_quick_task.sql`, `collaboration_admin.sql`,
`workflow_team_workspaces.sql`, and the optional GD/VE visibility delta.

For the FB eSport channel and multi-select Size / format update on a database
that already has the Workflow Management MVP, run only:

1. `supabase/workflow_esport_channel_multi_format.sql`

Do not re-run `rpc_assignment.sql`. The existing `create_creative_request` RPC
continues accepting `p_size_format text`; this delta parses the comma-separated
format codes and persists them in `creative_request_details.size_format_codes`.

For the No Tag Channel Tag update on a database that already has the Workflow
Management MVP and FB eSport update, run only:

1. `supabase/workflow_no_tag_channel.sql`

No Tag is stored as `no_tag`, cannot be combined with another Channel Tag, and
uses the Custom Size / format for Creative Requests. It remains visible in
Working Sheet and exports, while the frontend excludes it from Campaign
Timeline, FB eSport Timeline, Channel Plan, and Calendar. Do not re-run
`rpc_assignment.sql` for this update.

For the Creative Request date-led active-data backfill dated 2 Sep 2026, keep
preview and apply as separate approval gates. Do not re-run
`supabase/creative_request_milestone_backfill_t5_t1.sql`; it belongs to the
earlier T-7/T-5 to T-5/T-1 migration.

Preview approval:

1. Run only `supabase/creative_request_date_led_preview.sql`.
2. Record the `calendar_gate`, publishing candidate, No Tag candidate, active
   skip, Delivered/Cancelled retained-history checksum, Effort, legacy
   `over_capacity`, legacy `deadline_capacity_gap`, and Thai calendar counts.
3. If `preview_gate` is `BLOCKED_CALENDAR_INCOMPLETE`, stop and complete the
   Thai calendar data before any apply approval.

Post-backfill canonical backend installation (separate approval):

The date-led active-data Apply was completed on 3 Sep 2026 and its guarded
backup, applied-row, retained-history, and mismatch checks passed. Do not rerun
`supabase/creative_request_date_led_apply.sql`; a second execution could include
new legacy rows that were not part of the reviewed 53-row snapshot.

Before any mutation, run a mandatory read-only prerequisite preflight against
the exact linked project and stop unless all checks pass:

- `work_status.unassigned`, `assignment_result.unassigned`, and
  `event_type.capacity_changed` exist from the committed Trello/Asana prepare
  step.
- `flowmate_capacity_allocations.capacity_point` has the prepared positive-only
  constraint.
- Marketing Plan, workflow catalogs, FB eSport channel/format support, Thai
  calendar coverage, assignment helpers, and required reporting dependencies
  exist.
- The date-led backup still reports 53 backup rows, 53 applied rows, zero
  concurrent skips, and zero rollback-marked rows.

After that preflight, run only these installers in order and stop immediately
if any file reports an error:

1. `supabase/workflow_no_tag_channel.sql`
2. `supabase/rpc_assignment.sql`
3. `supabase/creative_request_launch_milestones.sql`
4. `supabase/trello_asana_hybrid_backend.sql`
5. `supabase/marketing_plan.sql`
6. `supabase/flowmate_production_insights.sql`
7. `supabase/flowmate_production_insights_verify.sql`

Finally, run the exact `supabase/creative_request_date_led_verify.sql` main
verification plus the read-only post-backfill audit. Confirm zero legacy T-5,
publishing, No Tag, stale-publishing, concurrent-skip, and rollback mismatches;
also confirm retained Delivered/Cancelled, Effort, and legacy-warning checksums
are unchanged. Stop on any mismatch, incomplete calendar, permission error, or
failed Production Insights security/fixture check. The commented rollback block
remains outside this order and still requires separate rollback approval.

For the Pond manual-skill assignment hotfix on an existing database, run only:

1. `supabase/rpc_assignment.sql`
2. `supabase/fix_pond_manual_skills.sql`

The updated assignment installer no longer seeds, expands, or adds skills to
team members. The hotfix changes only Pond's Team settings and does not
reassign existing work items.

For the approved GD/VE Team settings update dated 27 Jul 2026, run only:

1. `supabase/fix_gdve_team_settings_20260727.sql`

This replaces Ploy's skills with Banner, Logo, Resize, and Graphic Pack; adds
Hero Album (`hero-album`, the Hero Post skill key) to Joe and Tong without
removing their other skills; and sets every active GD/VE member's WIP limit to
4. Do not re-run `rpc_assignment.sql` or `seed.sql` for this update. Assignment
already reads live Team settings and must never seed or overwrite them.

When Supabase warns that these scripts create tables without automatically enabling RLS, choose **Run without RLS**. Both migration scripts explicitly enable RLS and install the required custom policies themselves. The verification file must run last.

If the database has not run the auth/role helpers yet, run these first:

1. `supabase/whitelist_access.sql`
2. `supabase/security_hardening.sql`
3. `supabase/marketing_plan.sql`
4. `supabase/marketing_plan_status_update.sql`
5. `supabase/marketing_plan_supervisor.sql`

For production go-live reset after all validation is complete, run manually. This creates `flowmate_archive` audit tables, archives FlowMate task/request rows and Marketing Plan Working Sheet rows, clears the active pilot/demo data, keeps users/team settings/skills/capacity/leave/security config, and lets new FlowMate display IDs start again at `CR-1001` / `QT-2001`:

1. `supabase/reset_tasks_for_production.sql`

### Post-review hardening patches (already-deployed DB)

These are idempotent one-time patches from the production-readiness review.
Run each once, in order:

1. `supabase/phase1_security_fixes.sql`, then re-run `supabase/rpc_assignment.sql` (assignment-engine advisory lock).
2. `supabase/phase2_stability_fixes.sql`, then re-run `supabase/rpc_quick_task.sql` (null-safe owner guards).
3. `supabase/phase3_performance.sql` (view + indexes).

For a brand-new database the canonical `schema.sql` / `rpc_*` / `whitelist_access.sql` already include the Phase 1-2 fixes, so only `phase3_performance.sql` (view + indexes) needs to be added.

## Expected Tables

After the full run order, these tables should exist:

- `users`
- `team_members`
- `work_items`
- `creative_request_details`
- `assignment_runs`
- `work_item_events`
- `comments`
- `checklist_items`
- `notifications`
- `work_item_links`
- `work_item_watchers`
- `work_item_ai_tags`
- `leave_requests`
- `capacity_overrides`
- `user_whitelist`
- `marketing_plans`
- `marketing_campaigns`
- `marketing_content_items`
- `marketing_channel_placements`
- `creative_channels`
- `creative_formats`
- `creative_channel_formats`
- `teams`
- `user_team_memberships`
- `marketing_campaign_functions`
- `marketing_campaign_tags`

## Expected Views

- `member_workload_v`
- `work_item_flags_v`
- `planning_work_items_v`
- `marketing_plan_timeline_v`
- `marketing_campaign_summary_v`
- `marketing_plan_supervisor_monthly_v`
- `marketing_plan_supervisor_pic_v`
- `marketing_plan_supervisor_campaign_v`
- `marketing_plan_supervisor_channel_v`
- `marketing_campaign_tag_management_v`

## MVP Security Note

This schema uses Supabase Auth identity through `auth.uid()`.

Signed-out users must not read protected FlowMate rows. Write actions that need identity-sensitive behavior should go through controlled SQL RPCs that resolve the actor from `auth.uid()` instead of trusting client-supplied actor IDs.

## Mock User IDs

The seed file uses stable mock IDs:

| User | ID |
|---|---|
| Pond | `00000000-0000-0000-0000-000000000001` |
| Jo | `00000000-0000-0000-0000-000000000002` |
| Tong | `00000000-0000-0000-0000-000000000003` |
| Eye | `00000000-0000-0000-0000-000000000004` |
| Vee | `00000000-0000-0000-0000-000000000005` |

## Quick Verification Queries

Run these in Supabase SQL Editor after seeding:

```sql
select count(*) from public.users;
select count(*) from public.team_members;
select count(*) from public.work_items;
select * from public.member_workload_v order by member_code;
select display_id, is_overdue, is_due_soon, is_queued from public.work_item_flags_v order by display_id;
select display_id, campaign_name, normalized_channels, planning_date, planning_readiness from public.planning_work_items_v order by planning_date nulls last, display_id;
select count(*) from public.notifications;
select proname from pg_proc where proname in ('mark_notification_read', 'mark_all_notifications_read', 'flowmate_generate_due_notifications') order by proname;
select tgname from pg_trigger where tgname = 'flowmate_notifications_after_event';
select count(*) from public.work_item_links;
select count(*) from public.work_item_watchers;
select proname from pg_proc where proname in ('add_work_item_link', 'add_work_item_watcher', 'flowmate_admin_transition_work_status', 'flowmate_admin_archive_work_item') order by proname;
select tgname from pg_trigger where tgname = 'flowmate_collaboration_notifications_after_event';
select proname from pg_proc where proname = 'flowmate_admin_update_team_member';
select proname from pg_proc where proname = 'create_leave_request';
select count(*) from public.leave_requests;
select count(*) from public.marketing_plans;
select * from public.marketing_campaign_summary_v order by month_key, campaign_sort_order;
select * from public.marketing_plan_timeline_v order by publish_date, publish_time nulls last;
select * from public.marketing_plan_supervisor_monthly_v order by launch_date, publish_time nulls last;
select * from public.marketing_plan_supervisor_pic_v order by month_key, critical_count desc, risk_count desc;
select * from public.flowmate_production_samples_v order by delivered_date desc, display_id;
select * from public.flowmate_production_operations_v order by team, asset_subtype, priority, status;
select * from public.flowmate_legacy_capacity_warning_v order by month_start desc, team, warning_code;
```

To load the optional June 2026 Marketing Plan sample after `marketing_plan.sql`, run this manually from Supabase SQL Editor:

```sql
select public.marketing_plan_june_2026_sample();
```

## Notification Center Manual Checks

After running `notification_center.sql`, confirm:

1. `authenticated` can `select` from `public.notifications`, but direct `insert`, `update`, and `delete` are revoked.
2. `mark_notification_read(notification_id)` only updates a notification where `notifications.user_id = auth.uid()`.
3. `mark_all_notifications_read()` only updates unread notifications for `auth.uid()`.
4. Creating work-item events through existing RPCs creates notifications for the intended recipient and not for unrelated users.
5. `flowmate_generate_due_notifications(2)` can be run from trusted SQL/backend context to create `due_soon` and `overdue` notifications; do not expose this RPC directly to frontend users.

## Collaboration/Admin Manual Checks

After running `collaboration_admin.sql`, confirm:

1. `authenticated` can `select` from `public.work_item_links` and `public.work_item_watchers`, but direct `insert`, `update`, and `delete` are revoked.
2. `add_work_item_link(display_id, url, description)` uses the signed-in `auth.uid()` as `created_by_user_id`; do not pass actor IDs from the browser.
3. `add_work_item_watcher(display_id, watcher_user_id)` works for requester, assignee/current owner, and admin, but not for unrelated users.
4. A watcher can read active links/watchers for watched work and receives status/comment/link/watcher notifications.
5. A watcher cannot transition status only because they are a watcher.
6. `flowmate_admin_transition_work_status(...)` works only for admin users and writes `work_item_events.actor_user_id` as the real admin from `auth.uid()`.
7. `flowmate_admin_archive_work_item(...)` sets `archived_at`, `archived_by_user_id`, and `archive_reason`; it must not delete work rows, comments, links, watchers, events, or notifications.
8. `member_workload_v` and `work_item_flags_v` exclude archived rows.

## AI Tag Manual Checks

After running `ai_tags.sql`, confirm:

1. `authenticated` can `select` from `public.work_item_ai_tags`, but direct `insert`, `update`, and `delete` are revoked.
2. `add_work_item_ai_tag(tag, display_id)` uses `auth.uid()` and works for requester, assignee/current owner, and admin.
3. Adding the same tag text twice on one task returns the existing tag instead of creating a duplicate.
4. `remove_work_item_ai_tag(ai_tag_id)` removes only through the RPC and writes a collaboration event.

## Public View Security Checks

After running `view_security_hardening.sql`, confirm:

1. `member_workload_v` and `work_item_flags_v` are no longer readable by `anon`.
2. `authenticated` can still read both views after login.
3. Both views use `security_invoker = true`, so underlying table RLS is evaluated as the signed-in caller.

## Next Step

After schema and seed run successfully, connect the frontend to Supabase:

1. Install `@supabase/supabase-js`.
2. Read from `work_items`, `creative_request_details`, `member_workload_v`, and `work_item_flags_v`.
   For MVP 1.3 planning screens, prefer `planning_work_items_v` for active Creative Request rows with normalized channels and publish/launch planning dates.
3. Replace static `WORK` and `MEMBERS` mock data gradually.
4. Add RPC/Edge Functions for assignment, status transitions, review flow, comments, and checklist writes.
