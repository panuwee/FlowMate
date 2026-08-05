-- Workflow Management MVP follow-up:
-- Team GD/VE can read every mapped Creative Request across team workspaces.
--
-- Scope:
-- - Read-only expansion for active GD/VE members.
-- - Quick Tasks remain team-scoped.
-- - Creative Requests in migration quarantine (owning_team_code IS NULL)
--   remain privileged-only.
-- - Existing write, update, delete, and RPC authorization is unchanged.
--
-- Run after:
--   workflow_team_workspaces.sql

begin;

create or replace function public.flowmate_user_is_team_member(
  p_user_id uuid,
  p_team_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    join public.user_team_memberships membership
      on membership.user_id = u.id
    join public.teams team
      on team.code = membership.team_code
     and team.is_active = true
    where u.id = p_user_id
      and u.is_active = true
      and membership.team_code = p_team_code
  );
$$;

create or replace function public.flowmate_user_can_read_work_item(
  p_user_id uuid,
  p_work_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_items wi
    where wi.id = p_work_item_id
      and (
        public.flowmate_user_can_access_team(
          p_user_id,
          wi.owning_team_code
        )
        or (
          wi.work_type = 'creative_request'
          and wi.owning_team_code is not null
          and public.flowmate_user_is_team_member(p_user_id, 'gdve')
        )
      )
  );
$$;

create or replace function public.flowmate_current_user_can_read_work_item(
  p_work_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.flowmate_user_can_read_work_item(
    (select auth.uid()),
    p_work_item_id
  );
$$;

revoke all on function public.flowmate_user_is_team_member(uuid, text)
from public, anon, authenticated;
revoke all on function public.flowmate_user_can_read_work_item(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.flowmate_current_user_can_read_work_item(uuid)
from public, anon, authenticated;

grant execute on function public.flowmate_current_user_can_read_work_item(uuid)
to authenticated;

drop policy if exists "team members can read work items"
on public.work_items;
create policy "team members can read work items"
on public.work_items for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(id))
);

drop policy if exists "team members can read creative details"
on public.creative_request_details;
create policy "team members can read creative details"
on public.creative_request_details for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read assignment runs"
on public.assignment_runs;
create policy "team members can read assignment runs"
on public.assignment_runs for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read events"
on public.work_item_events;
create policy "team members can read events"
on public.work_item_events for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read comments"
on public.comments;
create policy "team members can read comments"
on public.comments for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read checklist"
on public.checklist_items;
create policy "team members can read checklist"
on public.checklist_items for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read links"
on public.work_item_links;
create policy "team members can read links"
on public.work_item_links for select
to authenticated
using (
  deleted_at is null
  and (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read watchers"
on public.work_item_watchers;
create policy "team members can read watchers"
on public.work_item_watchers for select
to authenticated
using (
  removed_at is null
  and (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read ai tags"
on public.work_item_ai_tags;
create policy "team members can read ai tags"
on public.work_item_ai_tags for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read capacity allocations"
on public.flowmate_capacity_allocations;
create policy "team members can read capacity allocations"
on public.flowmate_capacity_allocations for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

commit;

select pg_notify('pgrst', 'reload schema');
