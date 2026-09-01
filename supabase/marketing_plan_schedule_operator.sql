-- FlowMate Marketing Plan schedule-operator installer.
-- Run after schema.sql, whitelist_access.sql, workflow_team_workspaces.sql,
-- and marketing_plan.sql. It grants only Working Sheet Time and Marketing
-- placement Status authority through authenticated RPCs.

alter table public.users
  add column if not exists can_manage_marketing_schedule boolean not null default false;

-- Real remains a member; this is not an admin promotion.
update public.users
set can_access_all_teams = true,
    can_manage_marketing_schedule = true,
    updated_at = now()
where lower(email) = 'fco.punyakon@garena.com'
  and is_active = true;

create or replace function public.marketing_plan_update_working_row_time(
  p_content_item_id uuid,
  p_publish_time time
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_content public.marketing_content_items%rowtype;
  v_placement_count integer := 0;
  v_work_item_count integer := 0;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_actor
  from public.users u
  where u.id = v_actor_id
    and u.is_active = true;

  if v_actor.id is null then
    raise exception 'An active FlowMate user is required' using errcode = '42501';
  end if;

  if not (
    p_publish_time is null
    or (
      extract(minute from p_publish_time) = 0
      and extract(second from p_publish_time) = 0
    )
  ) then
    raise exception 'Publish Time must be N/A or a whole hour.'
      using errcode = '22023';
  end if;

  select * into v_content
  from public.marketing_content_items mci
  where mci.id = p_content_item_id
  for update;

  if v_content.id is null then
    raise exception 'Marketing Plan content item not found';
  end if;

  if not (
    v_actor.role = 'admin'
    or v_content.pic_user_id = v_actor_id
    or v_content.sub_pic_user_id = v_actor_id
    or v_actor.can_manage_marketing_schedule = true
  ) then
    raise exception 'Only an Admin, PIC, Sub PIC, or schedule operator can update Working Sheet time'
      using errcode = '42501';
  end if;

  update public.marketing_content_items
  set source_start_time = p_publish_time
  where id = v_content.id;

  update public.marketing_channel_placements
  set publish_time = p_publish_time
  where content_item_id = v_content.id;
  get diagnostics v_placement_count = row_count;

  update public.work_items
  set publish_time = p_publish_time
  where id = v_content.flowmate_work_item_id;
  get diagnostics v_work_item_count = row_count;

  return jsonb_build_object(
    'content_item_id', v_content.id,
    'publish_time', p_publish_time,
    'placement_count', v_placement_count,
    'linked_work_item_updated', v_work_item_count = 1
  );
end;
$$;

revoke all on function public.marketing_plan_update_working_row_time(uuid, time) from public, anon, authenticated;
grant execute on function public.marketing_plan_update_working_row_time(uuid, time) to authenticated;

create or replace function public.marketing_plan_update_working_row_status(
  p_content_item_id uuid,
  p_placement_status text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_content public.marketing_content_items%rowtype;
  v_placement_count integer := 0;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_actor
  from public.users u
  where u.id = v_actor_id
    and u.is_active = true;

  if v_actor.id is null then
    raise exception 'An active FlowMate user is required' using errcode = '42501';
  end if;

  select * into v_content
  from public.marketing_content_items mci
  where mci.id = p_content_item_id
  for update;

  if v_content.id is null then
    raise exception 'Marketing Plan content item not found';
  end if;

  if not (
    v_actor.role = 'admin'
    or v_content.pic_user_id = v_actor_id
    or v_content.sub_pic_user_id = v_actor_id
    or v_actor.can_manage_marketing_schedule = true
  ) then
    raise exception 'Only an Admin, PIC, Sub PIC, or schedule operator can update Marketing placement status'
      using errcode = '42501';
  end if;

  if p_placement_status is null or p_placement_status not in ('planned', 'assigned', 'review', 'ready', 'ready_to_post', 'scheduled', 'posted', 'delayed', 'cancelled') then
    raise exception 'Invalid Marketing placement status' using errcode = '22023';
  end if;

  update public.marketing_channel_placements
  set placement_status = p_placement_status
  where content_item_id = v_content.id;
  get diagnostics v_placement_count = row_count;

  return jsonb_build_object(
    'content_item_id', v_content.id,
    'placement_status', p_placement_status,
    'placement_count', v_placement_count
  );
end;
$$;

revoke all on function public.marketing_plan_update_working_row_status(uuid, text) from public, anon, authenticated;
grant execute on function public.marketing_plan_update_working_row_status(uuid, text) to authenticated;
