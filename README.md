# FlowMate Supabase Setup

This folder contains the SQL needed to prepare the Supabase backend for FlowMate.

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Creates enums, tables, indexes, views, helper functions, triggers, grants, and RLS policies |
| `seed.sql` | Adds MVP mock users, GD/VE members, sample work items, creative details, assignment runs, checklist items, comments, and events |
| `rpc_quick_task.sql` | Quick-task / checklist / comment / status-transition / cancel RPCs |
| `rpc_assignment.sql` | Assignment engine: `create_creative_request`, `recheck_brief`, `rerun_assignment`, plus effort + brief-completeness helpers |
| `whitelist_access.sql` | Restricts Google sign-in to a fixed list of `@garena.com` emails. Run AFTER the auth-sync triggers from the SSO setup step. |
| `security_hardening.sql` | Re-applies auth-based RLS helpers, policies, and final grants/revokes after RPC + whitelist setup |
| `notification_center.sql` | MVP 1.2 Notification Center table hardening, read-state RPCs, trusted event trigger creation, and due-date notification generator |
| `collaboration_admin.sql` | MVP 1.2 detail links, watchers, watcher notification recipients, admin status override, and admin soft archive |
| `view_security_hardening.sql` | Locks public views to authenticated users and forces `security_invoker` so underlying RLS is respected |
| `team_settings_admin.sql` | MVP 1.2 Team settings admin-only GD/VE member capacity updates plus own leave request table/RPC |

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
   9. `supabase/view_security_hardening.sql`
   10. `supabase/team_settings_admin.sql`

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

For production go-live reset after all validation is complete, run manually:

1. `supabase/reset_tasks_for_production.sql`

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
- `leave_requests`
- `capacity_overrides`
- `user_whitelist`

## Expected Views

- `member_workload_v`
- `work_item_flags_v`

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

## Public View Security Checks

After running `view_security_hardening.sql`, confirm:

1. `member_workload_v` and `work_item_flags_v` are no longer readable by `anon`.
2. `authenticated` can still read both views after login.
3. Both views use `security_invoker = true`, so underlying table RLS is evaluated as the signed-in caller.

## Next Step

After schema and seed run successfully, connect the frontend to Supabase:

1. Install `@supabase/supabase-js`.
2. Read from `work_items`, `creative_request_details`, `member_workload_v`, and `work_item_flags_v`.
3. Replace static `WORK` and `MEMBERS` mock data gradually.
4. Add RPC/Edge Functions for assignment, status transitions, review flow, comments, and checklist writes.
