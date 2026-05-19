-- FlowMate MVP 1.0 security hardening
-- Run this AFTER rpc_quick_task.sql, rpc_assignment.sql, and whitelist_access.sql.
--
-- Covers:
-- - B-006: signed-out anon reads must not pass RLS through null app-user context.
-- - Shared auth helpers used by RLS policies.

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_active_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = public.current_app_user_id()
      and u.is_active = true
  );
$$;

create or replace function public.is_work_item_participant(target_work_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_items wi
    left join public.team_members tm on tm.id = wi.final_owner_member_id
    where wi.id = target_work_item_id
      and (
        wi.requester_user_id = public.current_app_user_id()
        or wi.assignee_user_id = public.current_app_user_id()
        or tm.user_id = public.current_app_user_id()
      )
  );
$$;

create or replace function public.can_update_work_item(target_work_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_app_user()
    and public.is_work_item_participant(target_work_item_id);
$$;

create or replace function public.is_admin_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = public.current_app_user_id()
      and u.is_active = true
      and u.role = 'admin'
  );
$$;

alter table public.users enable row level security;
alter table public.team_members enable row level security;
alter table public.work_items enable row level security;
alter table public.creative_request_details enable row level security;
alter table public.assignment_runs enable row level security;
alter table public.work_item_events enable row level security;
alter table public.comments enable row level security;
alter table public.checklist_items enable row level security;
alter table public.notifications enable row level security;
alter table public.capacity_overrides enable row level security;
alter table public.user_whitelist enable row level security;

drop policy if exists "active users can read users" on public.users;
create policy "active users can read users"
on public.users for select
using (public.is_active_app_user());

drop policy if exists "active users can read team members" on public.team_members;
create policy "active users can read team members"
on public.team_members for select
using (public.is_active_app_user());

drop policy if exists "active users can read work items" on public.work_items;
create policy "active users can read work items"
on public.work_items for select
using (public.is_active_app_user());

drop policy if exists "participants can update work items" on public.work_items;
create policy "participants can update work items"
on public.work_items for update
using (public.can_update_work_item(id))
with check (public.can_update_work_item(id));

drop policy if exists "active users can insert work items" on public.work_items;
create policy "active users can insert work items"
on public.work_items for insert
with check (
  public.is_active_app_user()
  and requester_user_id = public.current_app_user_id()
);

drop policy if exists "active users can read creative details" on public.creative_request_details;
create policy "active users can read creative details"
on public.creative_request_details for select
using (public.is_active_app_user());

drop policy if exists "participants can mutate creative details" on public.creative_request_details;
create policy "participants can mutate creative details"
on public.creative_request_details for all
using (public.can_update_work_item(work_item_id))
with check (public.can_update_work_item(work_item_id));

drop policy if exists "active users can read assignment runs" on public.assignment_runs;
create policy "active users can read assignment runs"
on public.assignment_runs for select
using (public.is_active_app_user());

drop policy if exists "active users can read events" on public.work_item_events;
create policy "active users can read events"
on public.work_item_events for select
using (public.is_active_app_user());

drop policy if exists "participants can read comments" on public.comments;
create policy "participants can read comments"
on public.comments for select
using (public.is_active_app_user());

drop policy if exists "active users can insert own comments" on public.comments;
create policy "active users can insert own comments"
on public.comments for insert
with check (
  public.is_active_app_user()
  and author_user_id = public.current_app_user_id()
);

drop policy if exists "authors can update comments" on public.comments;
create policy "authors can update comments"
on public.comments for update
using (author_user_id = public.current_app_user_id())
with check (author_user_id = public.current_app_user_id());

drop policy if exists "active users can read checklist" on public.checklist_items;
create policy "active users can read checklist"
on public.checklist_items for select
using (public.is_active_app_user());

drop policy if exists "participants can mutate checklist" on public.checklist_items;
create policy "participants can mutate checklist"
on public.checklist_items for all
using (public.can_update_work_item(work_item_id))
with check (public.can_update_work_item(work_item_id));

drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications"
on public.notifications for select
using (user_id = public.current_app_user_id());

drop policy if exists "users can update own notifications" on public.notifications;
create policy "users can update own notifications"
on public.notifications for update
using (user_id = public.current_app_user_id())
with check (user_id = public.current_app_user_id());

drop policy if exists "active users can read capacity overrides" on public.capacity_overrides;
create policy "active users can read capacity overrides"
on public.capacity_overrides for select
using (public.is_active_app_user());

drop policy if exists "linked members can insert capacity overrides" on public.capacity_overrides;
create policy "linked members can insert capacity overrides"
on public.capacity_overrides for insert
with check (
  public.is_active_app_user()
  and exists (
    select 1 from public.team_members tm
    where tm.id = team_member_id
      and tm.user_id = public.current_app_user_id()
  )
);

drop policy if exists "active users can read whitelist" on public.user_whitelist;
create policy "active users can read whitelist"
on public.user_whitelist for select
using (public.is_active_app_user());

drop policy if exists "admins can write whitelist" on public.user_whitelist;
create policy "admins can write whitelist"
on public.user_whitelist for all
using (public.is_admin_app_user())
with check (public.is_admin_app_user());

grant select on public.user_whitelist to anon, authenticated;
revoke insert, update, delete on public.user_whitelist from anon, authenticated;
