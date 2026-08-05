-- FlowMate hotfix v3: allow a Team GD/VE assignee to use every workflow action
-- already authorized to the assignee by the backend RPC, even when the item
-- belongs to another team workspace.
--
-- Scope is intentionally narrow:
-- - actor must be an active Team GD/VE production member linked through
--   team_members.user_id;
-- - actor must match work_items.assignee_user_id or the user linked to
--   work_items.final_owner_member_id;
-- - the work item's owning_team_code must remain unchanged;
-- - requesters and unassigned GD/VE users do not receive cross-workspace write
--   access;
-- - status-transition roles remain enforced by transition_creative_work_status:
--   assignees can Start Work, Submit Review, Block, Resume, and Cancel while
--   requester-only Approve Delivery / Request Changes remain requester-only;
-- - direct cross-workspace mutation remains denied by RLS;
-- - team reassignment remains protected by requiring owning_team_code to stay
--   unchanged.
--
-- Safe for an existing database that already ran workflow_team_workspaces.sql.
-- The existing triggers automatically use these replaced function bodies.

begin;

-- Repair missing workspace memberships for every active, login-linked GD/VE
-- production member. This does not replace another existing primary team.
insert into public.user_team_memberships (
  user_id,
  team_code,
  is_primary,
  created_by_user_id
)
select
  tm.user_id,
  'gdve',
  not exists (
    select 1
    from public.user_team_memberships existing_primary
    where existing_primary.user_id = tm.user_id
      and existing_primary.is_primary
  ),
  null
from public.team_members tm
join public.users u
  on u.id = tm.user_id
 and u.is_active = true
where tm.active = true
  and tm.user_id is not null
  and public.flowmate_normalize_team_code(tm.discipline) = 'gdve'
on conflict (user_id, team_code) do nothing;

-- A GD/VE membership that existed as non-primary becomes primary only when the
-- user has no other primary membership.
update public.user_team_memberships membership
set is_primary = true
where membership.team_code = 'gdve'
  and membership.is_primary = false
  and exists (
    select 1
    from public.team_members tm
    join public.users u
      on u.id = tm.user_id
     and u.is_active = true
    where tm.user_id = membership.user_id
      and tm.active = true
      and public.flowmate_normalize_team_code(tm.discipline) = 'gdve'
  )
  and not exists (
    select 1
    from public.user_team_memberships existing_primary
    where existing_primary.user_id = membership.user_id
      and existing_primary.is_primary
  );

create or replace function public.flowmate_user_is_gdve_work_item_assignee(
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
      and wi.owning_team_code is not null
      and exists (
        select 1
        from public.users actor_user
        where actor_user.id = p_user_id
          and actor_user.is_active = true
      )
      and (
        (
          wi.assignee_user_id = p_user_id
          and exists (
            select 1
            from public.team_members actor_member
            where actor_member.user_id = p_user_id
              and actor_member.active = true
              and public.flowmate_normalize_team_code(
                actor_member.discipline
              ) = 'gdve'
          )
        )
        or (
          owner_member.user_id = p_user_id
          and owner_member.active = true
          and public.flowmate_normalize_team_code(
            owner_member.discipline
          ) = 'gdve'
        )
      )
  );
$$;

revoke all on function public.flowmate_user_is_gdve_work_item_assignee(uuid, uuid)
from public, anon, authenticated;

create or replace function public.flowmate_guard_work_item_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_normalized_team text;
  v_gdve_assignee_same_workspace boolean := false;
begin
  if tg_op = 'DELETE' then
    if public.flowmate_is_trusted_database_context() then
      return old;
    end if;

    if v_actor_id is null then
      raise exception 'Authentication required';
    end if;

    if not public.flowmate_user_can_access_team(
      v_actor_id,
      old.owning_team_code
    ) then
      raise exception 'You do not have access to this team workspace';
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.owning_team_code is null then
      new.owning_team_code :=
        public.flowmate_normalize_team_code(new.requester_team);
    end if;

    if new.owning_team_code is null then
      raise exception using
        message = 'A valid owning team is required',
        detail = 'Legacy requester_team must resolve to GD/VE, Ops, MKT, or eSport.',
        hint = 'Send a supported team value. Historical unmapped rows are quarantined only during migration.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.requester_team is distinct from old.requester_team
       and new.owning_team_code is not distinct from old.owning_team_code then
      v_normalized_team :=
        public.flowmate_normalize_team_code(new.requester_team);

      if v_normalized_team is null then
        raise exception using
          message = 'The updated requester team cannot be mapped safely',
          detail = 'A valid owning team is required for team changes.',
          hint = 'Use GD/VE, Ops, MKT, or eSport.';
      end if;

      new.owning_team_code := v_normalized_team;
    end if;

    if old.owning_team_code is not null
       and new.owning_team_code is null then
      raise exception 'A mapped work item cannot be moved into migration quarantine';
    end if;
  end if;

  if new.owning_team_code is not null
     and not exists (
       select 1
       from public.teams team
       where team.code = new.owning_team_code
         and team.is_active = true
     ) then
    raise exception 'Owning team % is missing or inactive', new.owning_team_code;
  end if;

  if public.flowmate_is_trusted_database_context() then
    return new;
  end if;

  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if tg_op = 'UPDATE' then
    v_gdve_assignee_same_workspace :=
      new.owning_team_code is not distinct from old.owning_team_code
      and public.flowmate_user_is_gdve_work_item_assignee(
        v_actor_id,
        old.id
      );
  end if;

  if tg_op = 'UPDATE'
     and not public.flowmate_user_can_access_team(
       v_actor_id,
       old.owning_team_code
     )
     and not v_gdve_assignee_same_workspace then
    raise exception 'You do not have access to the current team workspace';
  end if;

  if not public.flowmate_user_can_access_team(
    v_actor_id,
    new.owning_team_code
  )
  and not v_gdve_assignee_same_workspace then
    raise exception 'You cannot assign or modify work in team workspace %',
      coalesce(new.owning_team_code, '<migration quarantine>');
  end if;

  return new;
end;
$$;

create or replace function public.flowmate_guard_child_work_item_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if public.flowmate_is_trusted_database_context() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and not public.flowmate_user_can_access_work_item(
       v_actor_id,
       old.work_item_id
     )
     and not public.flowmate_user_is_gdve_work_item_assignee(
       v_actor_id,
       old.work_item_id
     ) then
    raise exception 'You do not have access to the current team workspace';
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and not public.flowmate_user_can_access_work_item(
       v_actor_id,
       new.work_item_id
     )
     and not public.flowmate_user_is_gdve_work_item_assignee(
       v_actor_id,
       new.work_item_id
     ) then
    raise exception 'You cannot write data for another team workspace';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.flowmate_guard_work_item_team()
from public, anon, authenticated;
revoke all on function public.flowmate_guard_child_work_item_team()
from public, anon, authenticated;

do $verify$
begin
  if to_regprocedure(
    'public.flowmate_user_is_gdve_work_item_assignee(uuid,uuid)'
  ) is null then
    raise exception 'GD/VE assignee helper was not installed';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'flowmate_work_items_team_guard'
      and not tgisinternal
  ) then
    raise exception 'Work-item team guard trigger is missing';
  end if;

  if not exists (
    select 1
    from pg_trigger
    where tgname = 'flowmate_work_item_events_team_guard'
      and not tgisinternal
  ) then
    raise exception 'Work-item event team guard trigger is missing';
  end if;

  if exists (
    select 1
    from public.team_members tm
    join public.users u
      on u.id = tm.user_id
     and u.is_active = true
    where tm.active = true
      and public.flowmate_normalize_team_code(tm.discipline) = 'gdve'
      and not exists (
        select 1
        from public.user_team_memberships membership
        where membership.user_id = tm.user_id
          and membership.team_code = 'gdve'
      )
  ) then
    raise exception 'An active login-linked GD/VE member is missing the GD/VE workspace membership';
  end if;
end;
$verify$;

commit;

-- Verification result:
-- - Ploy should show is_cr_1022_assignee = true and readiness = READY.
-- - blocked_by_assignee_helper must be 0 for every active GD/VE member.
-- - LOGIN NOT LINKED means team_members.user_id must be repaired for that
--   member before the account can act as an assignee.
select
  tm.member_code,
  tm.display_name,
  u.email,
  case
    when tm.user_id is null then 'LOGIN NOT LINKED'
    when u.id is null then 'LOGIN USER MISSING'
    when u.is_active = false then 'LOGIN INACTIVE'
    else 'LOGIN ACTIVE'
  end as login_status,
  exists (
    select 1
    from public.user_team_memberships membership
    where membership.user_id = tm.user_id
      and membership.team_code = 'gdve'
  ) as has_gdve_membership,
  count(distinct wi.id) as assigned_task_count,
  count(distinct wi.id) filter (
    where not public.flowmate_user_is_gdve_work_item_assignee(
      tm.user_id,
      wi.id
    )
  ) as blocked_by_assignee_helper,
  string_agg(distinct wi.display_id, ', ' order by wi.display_id) filter (
    where not public.flowmate_user_is_gdve_work_item_assignee(
      tm.user_id,
      wi.id
    )
  ) as blocked_task_ids,
  coalesce(bool_or(wi.display_id = 'CR-1022'), false) as is_cr_1022_assignee,
  case
    when tm.user_id is null then 'FIX team_members.user_id'
    when u.id is null or u.is_active = false then 'FIX active login'
    when count(distinct wi.id) filter (
      where not public.flowmate_user_is_gdve_work_item_assignee(
        tm.user_id,
        wi.id
      )
    ) > 0 then 'BLOCKED - CHECK RESULT'
    else 'READY'
  end as readiness
from public.team_members tm
left join public.users u
  on u.id = tm.user_id
left join public.work_items wi
  on (
    wi.final_owner_member_id = tm.id
    or (
      tm.user_id is not null
      and wi.assignee_user_id = tm.user_id
    )
  )
 and wi.owning_team_code is not null
where tm.active = true
  and public.flowmate_normalize_team_code(tm.discipline) = 'gdve'
group by
  tm.member_code,
  tm.display_name,
  tm.user_id,
  u.id,
  u.email,
  u.is_active
order by tm.display_name;
