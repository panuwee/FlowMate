-- Restore Marketing Plan Sub PIC assignment and FlowMate permission parity.
-- Run after:
--   1) supabase/marketing_plan.sql
--   2) supabase/rpc_quick_task.sql
--   3) supabase/collaboration_admin.sql
--   4) supabase/workflow_team_workspaces.sql
--   5) supabase/workflow_gdve_creative_visibility.sql (when used)
--
-- This migration is additive/idempotent and does not rename view columns.

begin;

create or replace function public.flowmate_is_marketing_sub_pic(
  p_work_item_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    p_work_item_id is not null
    and p_user_id is not null
    and exists (
      select 1
      from public.marketing_content_items mci
      join public.work_items wi
        on wi.id = p_work_item_id
      where mci.sub_pic_user_id = p_user_id
        and (
          mci.flowmate_work_item_id = wi.id
          or upper(substring(coalesce(mci.brief_link, '') from '#detail/([^/?#]+)')) = upper(wi.display_id)
        )
    );
$$;

revoke all on function public.flowmate_is_marketing_sub_pic(uuid, uuid) from public, anon;
grant execute on function public.flowmate_is_marketing_sub_pic(uuid, uuid) to authenticated;

create or replace function public.marketing_plan_guard_sub_pic_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
begin
  if new.sub_pic_user_id is not distinct from old.sub_pic_user_id
     and new.sub_pic_name is not distinct from old.sub_pic_name then
    return new;
  end if;

  v_actor_id := auth.uid();

  if v_actor_id is null then
    return new;
  end if;

  if not (
    public.is_admin_app_user(v_actor_id)
    or old.pic_user_id = v_actor_id
  ) then
    raise exception 'Only PIC or Admin can assign Sub PIC'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists marketing_plan_guard_sub_pic_assignment
  on public.marketing_content_items;
create trigger marketing_plan_guard_sub_pic_assignment
before update of sub_pic_user_id, sub_pic_name
on public.marketing_content_items
for each row
execute function public.marketing_plan_guard_sub_pic_assignment();

create or replace function public.marketing_plan_assign_sub_pic(
  p_content_item_id uuid,
  p_sub_pic_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_content public.marketing_content_items%rowtype;
  v_sub_pic public.users%rowtype;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not public.is_active_app_user() then
    raise exception 'Active FlowMate user is required'
      using errcode = '42501';
  end if;

  select *
    into v_content
    from public.marketing_content_items
   where id = p_content_item_id
   for update;

  if v_content.id is null then
    raise exception 'Marketing Plan content item not found';
  end if;

  if not (
    public.is_admin_app_user(v_actor_id)
    or v_content.pic_user_id = v_actor_id
  ) then
    raise exception 'Only PIC or Admin can assign Sub PIC'
      using errcode = '42501';
  end if;

  if p_sub_pic_user_id is not null then
    select *
      into v_sub_pic
      from public.users
     where id = p_sub_pic_user_id
       and is_active = true;

    if v_sub_pic.id is null then
      raise exception 'Sub PIC user is inactive or not found';
    end if;
  end if;

  update public.marketing_content_items
     set sub_pic_user_id = v_sub_pic.id,
         sub_pic_name = case
           when v_sub_pic.id is null then null
           else coalesce(nullif(trim(v_sub_pic.display_name), ''), v_sub_pic.email)
         end,
         updated_at = now()
   where id = v_content.id;

  return jsonb_build_object(
    'content_item_id', v_content.id,
    'sub_pic_user_id', v_sub_pic.id,
    'sub_pic_name', case
      when v_sub_pic.id is null then null
      else coalesce(nullif(trim(v_sub_pic.display_name), ''), v_sub_pic.email)
    end
  );
end;
$$;

revoke all on function public.marketing_plan_assign_sub_pic(uuid, uuid) from public, anon;
grant execute on function public.marketing_plan_assign_sub_pic(uuid, uuid) to authenticated;

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
        or public.flowmate_is_marketing_sub_pic(wi.id, public.current_app_user_id())
      )
  );
$$;

create or replace function public.flowmate_user_is_work_item_participant(
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
    left join public.team_members owner_member
      on owner_member.id = wi.final_owner_member_id
    where wi.id = p_work_item_id
      and (
        wi.requester_user_id = p_user_id
        or wi.assignee_user_id = p_user_id
        or owner_member.user_id = p_user_id
        or public.flowmate_is_marketing_sub_pic(wi.id, p_user_id)
      )
  );
$$;

create or replace function public.flowmate_user_can_access_work_item(
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
        public.flowmate_user_can_access_team(p_user_id, wi.owning_team_code)
        or public.flowmate_user_is_work_item_participant(p_user_id, wi.id)
      )
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
        public.flowmate_user_can_access_team(p_user_id, wi.owning_team_code)
        or public.flowmate_user_is_work_item_participant(p_user_id, wi.id)
        or (
          wi.work_type = 'creative_request'
          and wi.owning_team_code is not null
          and public.flowmate_user_is_team_member(p_user_id, 'gdve')
        )
      )
  );
$$;

create or replace function public.flowmate_can_read_work_item(
  p_work_item_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
  )
  and exists (
    select 1
    from public.work_items wi
    left join public.team_members tm on tm.id = wi.final_owner_member_id
    where wi.id = p_work_item_id
      and wi.archived_at is null
      and (
        wi.requester_user_id = p_user_id
        or wi.assignee_user_id = p_user_id
        or tm.user_id = p_user_id
        or public.is_admin_app_user(p_user_id)
        or public.flowmate_is_marketing_sub_pic(wi.id, p_user_id)
        or exists (
          select 1
          from public.work_item_watchers wiw
          where wiw.work_item_id = wi.id
            and wiw.watcher_user_id = p_user_id
            and wiw.removed_at is null
        )
      )
  );
$$;

create or replace function public.flowmate_can_collaborate_on_work_item(
  p_work_item_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
  )
  and exists (
    select 1
    from public.work_items wi
    left join public.team_members tm on tm.id = wi.final_owner_member_id
    where wi.id = p_work_item_id
      and wi.archived_at is null
      and (
        wi.requester_user_id = p_user_id
        or wi.assignee_user_id = p_user_id
        or tm.user_id = p_user_id
        or public.is_admin_app_user(p_user_id)
        or public.flowmate_is_marketing_sub_pic(wi.id, p_user_id)
      )
  );
$$;

create or replace function public.flowmate_can_status_transition_work_item(
  p_work_item_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.flowmate_can_collaborate_on_work_item(p_work_item_id, p_user_id);
$$;

revoke all on function public.flowmate_can_read_work_item(uuid, uuid) from public, anon;
revoke all on function public.flowmate_can_collaborate_on_work_item(uuid, uuid) from public, anon;
revoke all on function public.flowmate_can_status_transition_work_item(uuid, uuid) from public, anon;
grant execute on function public.flowmate_can_read_work_item(uuid, uuid) to authenticated;
grant execute on function public.flowmate_can_collaborate_on_work_item(uuid, uuid) to authenticated;
grant execute on function public.flowmate_can_status_transition_work_item(uuid, uuid) to authenticated;

commit;

