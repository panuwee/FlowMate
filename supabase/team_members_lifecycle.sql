-- Apply LAST, after existing assignment/automation installers. No member dates are seeded.
begin;
create schema if not exists flowmate_members_private;
revoke all on schema flowmate_members_private from public, anon, authenticated;
create table if not exists flowmate_members_private.lifecycle (
 email text primary key,
 stop_assign_at timestamptz,
 last_working_day date,
 deactivate_at timestamptz,
 disabled boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by uuid,
 check(email=lower(trim(email))),
 check(stop_assign_at is null or deactivate_at is null or stop_assign_at<=deactivate_at)
);
create table if not exists flowmate_members_private.audit (
 id bigint generated always as identity primary key,
 email text not null, actor_id uuid, created_at timestamptz not null default now(),
 action text not null, before_value jsonb, after_value jsonb
);
alter table flowmate_members_private.lifecycle enable row level security;
alter table flowmate_members_private.audit enable row level security;
revoke all on all tables in schema flowmate_members_private from public,anon,authenticated;

create or replace function public.flowmate_member_access_allowed(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u
 left join flowmate_members_private.lifecycle l on l.email=lower(u.email)
 where u.id=p_user and u.is_active and not coalesce(l.disabled,false)
 and (l.deactivate_at is null or statement_timestamp()<l.deactivate_at))
$$;
revoke all on function public.flowmate_member_access_allowed(uuid) from public,anon;
grant execute on function public.flowmate_member_access_allowed(uuid) to authenticated;

create or replace function public.is_active_app_user() returns boolean
language sql stable security definer set search_path='' as $$
 select public.flowmate_member_access_allowed(auth.uid())
$$;
create or replace function public.is_admin_app_user() returns boolean
language sql stable security definer set search_path='' as $$
 select public.flowmate_member_access_allowed(auth.uid()) and exists(
 select 1 from public.users where id=auth.uid() and role='admin')
$$;

create or replace function public.flowmate_member_can_assign(p_member uuid,p_end date) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.team_members tm join public.users u on u.id=tm.user_id
 left join flowmate_members_private.lifecycle l on l.email=lower(u.email)
 where tm.id=p_member and tm.active and public.flowmate_member_access_allowed(u.id)
 and (l.stop_assign_at is null or statement_timestamp()<l.stop_assign_at)
 and (l.last_working_day is null or (p_end is not null and p_end<=l.last_working_day))
 and (l.deactivate_at is null or (p_end is not null and
 ((p_end+1)::timestamp at time zone 'Asia/Bangkok')<=l.deactivate_at)))
$$;
revoke all on function public.flowmate_member_can_assign(uuid,date) from public,anon;
grant execute on function public.flowmate_member_can_assign(uuid,date) to authenticated;

-- Preserve the current engine, including requester pools and automation guards.
do $$ declare d text; begin
 select pg_get_functiondef('public.flowmate_run_assignment(uuid,public.assignment_trigger)'::regprocedure) into d;
 if position('flowmate_member_can_assign(tm.id' in d)=0 then
   if position('where tm.active = true' in d)=0 or position('v_end' in d)=0 then
     raise exception 'Unsupported assignment engine: lifecycle patch requires review';
   end if;
   d:=replace(d,'where tm.active = true',
    'where tm.active = true and public.flowmate_member_can_assign(tm.id, case when v_work.due_date is null then null else v_end end)');
   execute d;
 end if;
end $$;

-- Also enforce manual assignment and direct writes; retain existing work for handover.
create or replace function flowmate_members_private.guard_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
declare changed boolean; begin
 if tg_op='INSERT' then changed:=true;
 else changed:=new.final_owner_member_id is distinct from old.final_owner_member_id
 or new.assignee_user_id is distinct from old.assignee_user_id; end if;
 if changed then
   if new.final_owner_member_id is not null and not public.flowmate_member_can_assign(
      new.final_owner_member_id, new.due_date) then
     raise exception 'This member is not accepting new work in this date range' using errcode='23514';
   end if;
   if new.assignee_user_id is not null and exists(select 1 from public.team_members tm where tm.user_id=new.assignee_user_id and not public.flowmate_member_can_assign(tm.id,new.due_date)) then
     raise exception 'This member is not accepting new work in this date range' using errcode='23514';
   end if;
   if new.assignee_user_id is not null and not public.flowmate_member_access_allowed(new.assignee_user_id) then
     raise exception 'Assignee access is inactive' using errcode='23514';
   end if;
 end if;
 return new;
end $$;
drop trigger if exists flowmate_member_assignment_guard on public.work_items;
create trigger flowmate_member_assignment_guard before insert or update of final_owner_member_id,assignee_user_id
 on public.work_items for each row execute function flowmate_members_private.guard_assignment();

create or replace function public.flowmate_check_member_access() returns void
language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is not null and not public.flowmate_member_access_allowed(auth.uid()) then
 raise exception 'FlowMate access is inactive. Contact your administrator.' using errcode='42501'; end if;
end $$;
revoke all on function public.flowmate_check_member_access() from public;
grant execute on function public.flowmate_check_member_access() to anon,authenticated,service_role;

create or replace function public.flowmate_admin_members() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_admin_app_user() then raise exception 'Admin access required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(x order by x->>'display_name'),'[]'::jsonb) from (
 select jsonb_build_object('email',coalesce(w.email,lower(u.email)),
 'display_name',coalesce(w.display_name,u.display_name), 'role',coalesce(w.role,u.role),
 'team_member_code',coalesce(tm.member_code,w.team_member_code),'member_id',tm.id,
 'creative',public.flowmate_is_gdve_member_code(tm.member_code),'skills',tm.skills,'backup_skills',tm.backup_skills,
 'capacity_per_day',tm.capacity_per_day,'wip_limit',tm.wip_limit,
 'access_active',w.email is not null and coalesce(u.is_active,true) and not coalesce(l.disabled,false)
    and (l.deactivate_at is null or statement_timestamp()<l.deactivate_at),
 'assignment_active',public.flowmate_member_can_assign(tm.id,(statement_timestamp() at time zone 'Asia/Bangkok')::date),
 'stop_assign_at',l.stop_assign_at,'last_working_day',l.last_working_day,'deactivate_at',l.deactivate_at,
 'disabled',coalesce(l.disabled,false),'open_work',coalesce(j.jobs,'[]'::jsonb)) x
 from public.user_whitelist w full join public.users u on lower(u.email)=w.email
 left join public.team_members tm on tm.member_code=w.team_member_code or (w.team_member_code is null and tm.user_id=u.id)
 left join flowmate_members_private.lifecycle l on l.email=coalesce(w.email,lower(u.email))
 left join lateral (select jsonb_agg(jsonb_build_object('id',wi.display_id,'title',wi.title,'due_date',wi.due_date)) jobs
   from public.work_items wi where (wi.final_owner_member_id=tm.id or wi.assignee_user_id=u.id)
   and wi.status::text in ('assigned','in_progress','review','blocked') and wi.archived_at is null) j on true
 ) r);
end $$;
revoke all on function public.flowmate_admin_members() from public,anon;
grant execute on function public.flowmate_admin_members() to authenticated;

create or replace function public.flowmate_admin_save_member(p_input jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare e text:=lower(trim(p_input->>'email')); old_l jsonb; new_l jsonb;
 code text:=nullif(p_input->>'team_member_code',''); action text:=coalesce(p_input->>'action','save');
 active_before boolean; target_id uuid; begin
 if not public.is_admin_app_user() then raise exception 'Admin access required' using errcode='42501'; end if;
 if e is null or e !~ '^[^@\s]+@garena\.com$' then raise exception 'A @garena.com email is required'; end if;
 if nullif(trim(p_input->>'display_name'),'') is null then raise exception 'Name is required'; end if;
 if coalesce(p_input->>'role','') not in ('member','admin') then raise exception 'Invalid role'; end if;
 if action not in ('save','deactivate','reactivate') then raise exception 'Invalid action'; end if;
 perform pg_advisory_xact_lock(hashtext(e));
 select id,is_active into target_id,active_before from public.users where lower(email)=e for update;
 if target_id=auth.uid() and (p_input->>'role'<>'admin' or action='deactivate'
   or nullif(p_input->>'deactivate_at','') is not null) then
 raise exception 'You cannot remove your own admin access'; end if;
 if code is not null then
   perform 1 from public.team_members where member_code=code for update;
   if not found then raise exception 'Unknown creative profile'; end if;
   if exists(select 1 from public.team_members where member_code=code and user_id is not null and user_id is distinct from target_id)
   or exists(select 1 from public.user_whitelist where team_member_code=code and email<>e) then
     raise exception 'Creative profile is already linked to another member'; end if;
 end if;
 select to_jsonb(l) into old_l from flowmate_members_private.lifecycle l where email=e;
 insert into flowmate_members_private.lifecycle(email,stop_assign_at,last_working_day,deactivate_at,disabled,updated_by)
 values(e,nullif(p_input->>'stop_assign_at','')::timestamptz,nullif(p_input->>'last_working_day','')::date,
 nullif(p_input->>'deactivate_at','')::timestamptz,
 case when action='deactivate' then true when action='reactivate' then false else (coalesce((old_l->>'disabled')::boolean,false) or not coalesce(active_before,true) or coalesce((old_l->>'deactivate_at')::timestamptz<=statement_timestamp(),false)) end,auth.uid())
 on conflict(email) do update set stop_assign_at=excluded.stop_assign_at,last_working_day=excluded.last_working_day,
 deactivate_at=excluded.deactivate_at,disabled=excluded.disabled,updated_by=auth.uid(),updated_at=now();
 if action='reactivate' and (nullif(p_input->>'deactivate_at','')::timestamptz<=statement_timestamp()) then
 raise exception 'Choose a future access end time or clear it before reactivating'; end if;
 insert into public.user_whitelist(email,display_name,role,team_member_code,added_by)
 values(e,trim(p_input->>'display_name'),p_input->>'role',code,auth.uid()) on conflict(email) do update set
 display_name=excluded.display_name,role=excluded.role,team_member_code=excluded.team_member_code;
 update public.users set display_name=trim(p_input->>'display_name'),role=p_input->>'role',
 is_active=case when action='deactivate' then false when action='reactivate' then true else is_active end,updated_at=now()
 where id=target_id;
 update public.team_members set user_id=null where user_id=target_id and member_code is distinct from code;
 update public.team_members set user_id=target_id where member_code=code and target_id is not null;
 select to_jsonb(l) into new_l from flowmate_members_private.lifecycle l where email=e;
 insert into flowmate_members_private.audit(email,actor_id,action,before_value,after_value)
 values(e,auth.uid(),action,old_l,new_l || jsonb_build_object('display_name',p_input->>'display_name','role',p_input->>'role','team_member_code',code));
end $$;
revoke all on function public.flowmate_admin_save_member(jsonb) from public,anon;
grant execute on function public.flowmate_admin_save_member(jsonb) to authenticated;
revoke all on all functions in schema flowmate_members_private from public,anon,authenticated;
select pg_notify('pgrst','reload schema');
commit;
