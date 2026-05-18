# FlowMate Supabase Setup

This folder contains the SQL needed to prepare the Supabase backend for FlowMate MVP 1.0.

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Creates enums, tables, indexes, views, helper functions, triggers, grants, and RLS policies |
| `seed.sql` | Adds MVP mock users, GD/VE members, sample work items, creative details, assignment runs, checklist items, comments, and events |
| `rpc_quick_task.sql` | Quick-task / checklist / comment / status-transition / cancel RPCs |
| `rpc_assignment.sql` | Assignment engine: `create_creative_request`, `recheck_brief`, `rerun_assignment`, plus effort + brief-completeness helpers |
| `whitelist_access.sql` | Restricts Google sign-in to a fixed list of `@garena.com` emails. Run AFTER the auth-sync triggers from the SSO setup step. |

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
5. Paste all contents of `supabase/schema.sql`.
6. Run it.
7. Create another new query.
8. Paste all contents of `supabase/seed.sql`.
9. Run it.

## Expected Tables

After `schema.sql`, these tables should exist:

- `users`
- `team_members`
- `work_items`
- `creative_request_details`
- `assignment_runs`
- `work_item_events`
- `comments`
- `checklist_items`
- `notifications`
- `capacity_overrides`

## Expected Views

- `member_workload_v`
- `work_item_flags_v`

## MVP Security Note

This schema includes RLS and helper functions designed for mock-login development.

The policy model expects the app/server layer to set:

```sql
select set_config('app.current_user_id', '<user uuid>', true);
```

For the first frontend wiring pass, direct read policies are permissive enough to inspect seeded data with the anon key. Before real pilot, write actions should go through controlled RPC/Edge Functions so `app.current_user_id` is set server-side.

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
```

## Next Step

After schema and seed run successfully, connect the frontend to Supabase:

1. Install `@supabase/supabase-js`.
2. Read from `work_items`, `creative_request_details`, `member_workload_v`, and `work_item_flags_v`.
3. Replace static `WORK` and `MEMBERS` mock data gradually.
4. Add RPC/Edge Functions for assignment, status transitions, review flow, comments, and checklist writes.
