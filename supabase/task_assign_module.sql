-- Task Assign module
-- Run in Supabase SQL Editor only after review, before deploying the frontend
-- that calls create_quick_task without p_requester_team.
--
-- This script intentionally reuses public.work_items.  It does not create a
-- duplicate quick-task table and it keeps Creative Request behavior intact.

begin;

create or replace function public.task_assign_function_for_user(p_user_id uuid default public.current_app_user_id())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case regexp_replace(lower(coalesce(u.requester_team, '')), '[^a-z]', '', 'g')
    when 'ops' then 'ops'
    when 'mkt' then 'mkt'
    when 'marketing' then 'mkt'
    when 'esport' then 'esport'
    when 'esports' then 'esport'
    else null
  end
  from public.users u
  where u.id = p_user_id
    and u.is_active = true;
$$;

-- The existing policy calls this helper for direct browser updates as well as
-- related-table policies.  For Quick Tasks, participation alone is not enough:
-- normal members must belong to the owning function.  Administrators retain
-- their existing cross-function management right.
create or replace function public.can_update_work_item(target_work_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_app_user()
    and exists (
      select 1
      from public.work_items wi
      left join public.team_members tm on tm.id = wi.final_owner_member_id
      where wi.id = target_work_item_id
        and (
          case
            when wi.work_type = 'quick_task' then
              public.is_admin_app_user()
              or (
                public.task_assign_function_for_user() is not null
                and wi.owning_team_code = public.task_assign_function_for_user()
              )
            else wi.requester_user_id = public.current_app_user_id()
              or wi.assignee_user_id = public.current_app_user_id()
              or tm.user_id = public.current_app_user_id()
          end
        )
    );
$$;

-- Remove the client-controlled requester-function signature before creating
-- the server-derived contract below.
drop function if exists public.create_quick_task(
  uuid, text, date, date, text, text, text, uuid, text, public.priority_level
);

create function public.create_quick_task(
  p_actor_user_id uuid,
  p_title text,
  p_due_date date,
  p_launch_date date,
  p_note text default null,
  p_project_name text default null,
  p_assignee_user_id uuid default null,
  p_assignee_other_name text default null,
  p_priority public.priority_level default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_function text;
  v_assignee_user_id uuid;
  v_assignee_other_name text;
  v_assignee_function text;
  v_next_number integer;
  v_display_id text;
  v_work_item_id uuid;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  v_function := public.task_assign_function_for_user(v_actor_id);

  if v_function is null then
    raise exception 'Your account does not have one eligible Task Assign function (Ops, MKT, or eSport). Ask an administrator to update your function.';
  end if;
  if length(trim(coalesce(p_title, ''))) = 0 then raise exception 'Quick task title is required'; end if;
  if p_due_date is null then raise exception 'Quick task 1st Review / Draft date is required'; end if;
  if p_launch_date is null then raise exception 'Quick task launch date is required'; end if;

  v_assignee_user_id := coalesce(p_assignee_user_id, v_actor_id);
  v_assignee_other_name := nullif(trim(coalesce(p_assignee_other_name, '')), '');
  if v_assignee_user_id is not null then
    v_assignee_function := public.task_assign_function_for_user(v_assignee_user_id);
    if v_assignee_function is null then raise exception 'Assignee user is inactive or has no eligible Task Assign function'; end if;
    if v_assignee_function <> v_function and not public.is_admin_app_user() then
      raise exception 'Quick Task assignee must belong to your function';
    end if;
    v_assignee_other_name := null;
  elsif v_assignee_other_name is null then
    raise exception 'Assignee is required';
  end if;

  perform pg_advisory_xact_lock(hashtext('flowmate_quick_task_display_id'));
  select coalesce(max((substring(display_id from 4))::integer), 2000) + 1
    into v_next_number
    from public.work_items
   where display_id ~ '^QT-[0-9]{4,}$';
  v_display_id := 'QT-' || lpad(v_next_number::text, 4, '0');

  insert into public.work_items (
    display_id, work_type, title, description, project_name,
    requester_user_id, requester_team, owning_team_code,
    assignee_user_id, assignee_other_name, status, priority, due_date, launch_date
  ) values (
    v_display_id, 'quick_task', trim(p_title), nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_project_name, '')), ''), v_actor_id, v_function, v_function,
    v_assignee_user_id, v_assignee_other_name, 'assigned', coalesce(p_priority, 'normal'),
    p_due_date, p_launch_date
  ) returning id into v_work_item_id;

  insert into public.work_item_events (work_item_id, actor_user_id, event_type, to_status, metadata)
  values (
    v_work_item_id, v_actor_id, 'created', 'assigned',
    jsonb_build_object('source', 'task_assign', 'work_type', 'quick_task', 'owning_team_code', v_function)
  );

  return jsonb_build_object('id', v_work_item_id, 'display_id', v_display_id, 'status', 'assigned', 'owning_team_code', v_function);
end;
$$;

revoke all on function public.create_quick_task(uuid, text, date, date, text, text, uuid, text, public.priority_level) from public;
grant execute on function public.create_quick_task(uuid, text, date, date, text, text, uuid, text, public.priority_level) to authenticated;

-- Audit first.  Only apply a backfill statement after an administrator has
-- reviewed the result; rows with no deterministic legacy function remain out
-- of Task Assign until corrected.
create or replace view public.task_assign_historical_function_review_v as
select wi.id, wi.display_id, wi.requester_team, wi.owning_team_code, wi.requester_user_id,
       public.task_assign_function_for_user(wi.requester_user_id) as inferred_function
from public.work_items wi
where wi.work_type = 'quick_task'
  and coalesce(wi.owning_team_code, '') not in ('ops', 'mkt', 'esport');

commit;
