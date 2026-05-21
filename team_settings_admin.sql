-- FlowMate MVP 1.2 Chat H: admin-safe Team settings member updates.
-- Run after view_security_hardening.sql so auth helpers and view grants are in place.

revoke insert, update, delete on public.team_members from anon, authenticated;

create or replace function public.flowmate_admin_update_team_member(
  p_team_member_id uuid,
  p_availability public.availability_status,
  p_capacity_per_day numeric,
  p_capacity_override_per_day numeric default null,
  p_wip_limit integer default 3
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_member public.team_members%rowtype;
  v_capacity_override numeric;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not public.is_admin_app_user() then
    raise exception 'Only FlowMate admins can update team settings'
      using errcode = '42501';
  end if;

  if p_team_member_id is null then
    raise exception 'Team member ID is required'
      using errcode = '22023';
  end if;

  if p_availability is null then
    raise exception 'Availability is required'
      using errcode = '22023';
  end if;

  if p_capacity_per_day is null or p_capacity_per_day < 0 or p_capacity_per_day > 24 then
    raise exception 'capacity_per_day must be from 0 to 24'
      using errcode = '22023';
  end if;

  if p_capacity_override_per_day is not null
     and (p_capacity_override_per_day < 0 or p_capacity_override_per_day > 24) then
    raise exception 'capacity_override_per_day must be from 0 to 24'
      using errcode = '22023';
  end if;

  if p_wip_limit is null or p_wip_limit < 0 or p_wip_limit > 20 then
    raise exception 'wip_limit must be from 0 to 20'
      using errcode = '22023';
  end if;

  v_capacity_override := case
    when p_availability = 'leave' then null
    else p_capacity_override_per_day
  end;

  update public.team_members
     set availability = p_availability,
         capacity_per_day = p_capacity_per_day,
         capacity_override_per_day = v_capacity_override,
         wip_limit = p_wip_limit,
         updated_at = now()
   where id = p_team_member_id
   returning * into v_member;

  if v_member.id is null then
    raise exception 'Team member not found'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'id', v_member.id,
    'display_name', v_member.display_name,
    'availability', v_member.availability,
    'capacity_per_day', v_member.capacity_per_day,
    'capacity_override_per_day', v_member.capacity_override_per_day,
    'wip_limit', v_member.wip_limit,
    'updated_by_user_id', v_actor_id
  );
end;
$$;

revoke all on function public.flowmate_admin_update_team_member(
  uuid, public.availability_status, numeric, numeric, integer
) from public, anon, authenticated;
grant execute on function public.flowmate_admin_update_team_member(
  uuid, public.availability_status, numeric, numeric, integer
) to authenticated;
