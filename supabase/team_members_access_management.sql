-- Apply after whitelist_access.sql, team_settings_admin.sql and team_members_lifecycle.sql.
-- Local-reviewed installer; does not enroll any real person or widen existing read policies.
begin;
create table if not exists flowmate_members_private.allowed_domains (
 domain text primary key, enabled boolean not null default true,
 updated_at timestamptz not null default now(), updated_by uuid,
 check(domain=lower(trim(domain)) and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$')
);
alter table flowmate_members_private.allowed_domains enable row level security;
revoke all on flowmate_members_private.allowed_domains from public,anon,authenticated;
insert into flowmate_members_private.allowed_domains(domain) values('garena.com'),('sea.com') on conflict do nothing;

alter table public.users drop constraint if exists users_role_values;
alter table public.users add constraint users_role_values check(role in ('admin','member','viewer'));
alter table public.user_whitelist drop constraint if exists user_whitelist_role_check;
alter table public.user_whitelist add constraint user_whitelist_role_check check(role in ('admin','member','viewer'));
alter table public.user_whitelist drop constraint if exists user_whitelist_email_shape;
alter table public.user_whitelist add constraint user_whitelist_email_shape check(email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email=lower(trim(email)));
alter table public.user_whitelist add column if not exists viewer_teams text[] not null default '{}';

-- Persist teams before first login; materialize memberships when the auth profile is created.
create or replace function flowmate_members_private.sync_viewer_teams() returns trigger
language plpgsql security definer set search_path='' as $$
declare teams text[]; begin
 if new.role='viewer' then
 select w.viewer_teams into teams from public.user_whitelist w where w.email=lower(new.email);
 if coalesce(cardinality(teams),0)=0 then raise exception 'Select at least one team for Viewer'; end if;
 delete from public.user_team_memberships where user_id=new.id;
 insert into public.user_team_memberships(user_id,team_code,is_primary)
 select new.id,t,false from unnest(teams) t;
 end if; return new;
end $$;
drop trigger if exists flowmate_sync_viewer_teams on public.users;
create trigger flowmate_sync_viewer_teams after insert or update of role,display_name on public.users
 for each row execute function flowmate_members_private.sync_viewer_teams();
alter table public.users add column if not exists can_access_all_teams boolean not null default false;
alter table public.users add column if not exists can_manage_marketing_schedule boolean not null default false;
create or replace function flowmate_members_private.viewer_capabilities() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.role='viewer' then new.can_access_all_teams:=false; new.can_manage_marketing_schedule:=false; new.requester_team:=null; end if;
 return new;
end $$;
drop trigger if exists flowmate_viewer_capabilities on public.users;
create trigger flowmate_viewer_capabilities before insert or update on public.users for each row
 execute function flowmate_members_private.viewer_capabilities();

create or replace function flowmate_members_private.email_allowed(e text) returns boolean
language sql stable security definer set search_path='' as $$
 select e ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and exists(
 select 1 from flowmate_members_private.allowed_domains where domain=split_part(e,'@',2) and enabled)
$$;
create or replace function public.enforce_garena_domain() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' and new.email is not distinct from old.email then return new; end if;
 if not coalesce(flowmate_members_private.email_allowed(lower(trim(new.email))),false) then
 raise exception 'Email domain is not enabled in FlowMate'; end if;
 if not exists(select 1 from public.user_whitelist where email=lower(trim(new.email))) then
 raise exception 'Email is not on the FlowMate access whitelist'; end if;
 if exists(select 1 from flowmate_members_private.lifecycle where email=lower(trim(new.email))
 and (disabled or deactivate_at<=statement_timestamp())) then raise exception 'FlowMate access is inactive'; end if;
 return new;
end $$;

create or replace function public.flowmate_member_access_allowed(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u join public.user_whitelist w on w.email=lower(u.email)
 left join flowmate_members_private.lifecycle l on l.email=lower(u.email)
 where u.id=p_user and u.is_active and flowmate_members_private.email_allowed(lower(u.email))
 and not coalesce(l.disabled,false) and (l.deactivate_at is null or statement_timestamp()<l.deactivate_at))
$$;

create or replace function public.flowmate_admin_domains() returns jsonb
language plpgsql stable security definer set search_path='' as $$ begin
 if not public.is_admin_app_user() then raise exception 'Admin access required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('domain',d.domain,'enabled',d.enabled,
 'member_count',(select count(*) from public.user_whitelist w where split_part(w.email,'@',2)=d.domain)) order by d.domain),'[]'::jsonb)
 from flowmate_members_private.allowed_domains d);
end $$;
create or replace function public.flowmate_admin_save_domain(p_domain text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare d text:=lower(trim(p_domain)); old_value jsonb; begin
 if not public.is_admin_app_user() then raise exception 'Admin access required' using errcode='42501'; end if;
 if d is null or length(d)>253 or d !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' or p_enabled is null then
 raise exception 'Enter an exact domain, such as sea.com, without @ or a URL'; end if;
 perform pg_advisory_xact_lock(hashtext('flowmate:domain-management'));
 if not p_enabled and exists(select 1 from public.users where id=auth.uid() and split_part(lower(email),'@',2)=d) then
 raise exception 'You cannot disable your own login domain'; end if;
 select to_jsonb(x) into old_value from flowmate_members_private.allowed_domains x where domain=d;
 insert into flowmate_members_private.allowed_domains(domain,enabled,updated_by) values(d,p_enabled,auth.uid())
 on conflict(domain) do update set enabled=excluded.enabled,updated_at=now(),updated_by=auth.uid();
 insert into flowmate_members_private.audit(email,actor_id,action,before_value,after_value)
 values('@'||d,auth.uid(),'domain',old_value,jsonb_build_object('domain',d,'enabled',p_enabled));
end $$;

-- New profiles start paused and without skills; admins configure capacity before work is assigned.
alter table public.team_members add column if not exists managed_profile boolean not null default false;
alter table public.team_members drop constraint if exists team_members_skills_not_empty;
alter table public.team_members add constraint team_members_skills_not_empty check(not active or array_length(skills,1) is not null);
create or replace function flowmate_members_private.create_profile(p_name text) returns text
language plpgsql security definer set search_path='' as $$
declare n text:=trim(p_name); code text; begin
 if not public.is_admin_app_user() then raise exception 'Admin access required' using errcode='42501'; end if;
 if n is null or length(n) not between 1 and 80 then raise exception 'Team Profile name must be 1 to 80 characters'; end if;
 perform pg_advisory_xact_lock(hashtext('flowmate:profile:'||lower(n)));
 if exists(select 1 from public.team_members where lower(trim(display_name))=lower(n) or lower(member_code)=lower(n)) then
 raise exception 'Team Profile name already exists. Select the existing profile'; end if;
 code:='profile-'||gen_random_uuid()::text;
 insert into public.team_members(id,member_code,display_name,initials,discipline,discipline_short,skills,capacity_per_day,wip_limit,active,managed_profile)
 values(gen_random_uuid(),code,n,upper(left(n,2)),'Creative','GD/VE','{}',0,0,false,true);
 return code;
end $$;
-- Preserve the deployed member lifecycle implementation while adding narrowly scoped behavior.
do $patch$ declare d text; begin
 select pg_get_functiondef('public.flowmate_admin_save_member(jsonb)'::regprocedure) into d;
 if position('create_profile' in d)=0 then
  if position('A @garena.com email is required' in d)=0 then raise exception 'Unsupported member installer: review before applying'; end if;
  d:=replace(d, $$if e is null or e !~ '^[^@\s]+@garena\.com$' then raise exception 'A @garena.com email is required'; end if;$$,
  $$if not coalesce(flowmate_members_private.email_allowed(e),false) and action<>'deactivate' then raise exception 'Email domain is not enabled in Team Members'; end if;$$);
  d:=replace(d, $$not in ('member','admin')$$, $$not in ('member','admin','viewer')$$);
  d:=replace(d, 'if code is not null then', $$if nullif(trim(p_input->>'new_profile_name'),'') is not null then
   if code is not null then raise exception 'Select an existing profile or create a new profile'; end if;
   code:=flowmate_members_private.create_profile(p_input->>'new_profile_name');
  end if;
  if code is not null then$$);
  d:=replace(d, 'perform pg_advisory_xact_lock(hashtext(e));', $$if p_input->>'role'='viewer' then
   if jsonb_typeof(p_input->'viewer_teams') is distinct from 'array' then raise exception 'Select at least one team for Viewer'; end if;
   if jsonb_array_length(p_input->'viewer_teams')=0 or exists(select 1 from jsonb_array_elements_text(p_input->'viewer_teams') t where t not in ('gdve','ops','mkt','esport')) then
   raise exception 'Select valid teams for Viewer'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext(e));$$);
  d:=replace(d, 'update public.users set display_name', $$update public.user_whitelist set viewer_teams=case when p_input->>'role'='viewer' then
   array(select distinct jsonb_array_elements_text(p_input->'viewer_teams')) else '{}'::text[] end where email=e;
  update public.users set display_name$$);
  if strpos(d,'A @garena.com email is required')>0 or strpos(d,'viewer_teams=case')=0 then
   raise exception 'Member installer does not match the reviewed access-management contract'; end if;
  execute d;
 end if;
end $patch$;
-- Extend existing profile detection and capacity editor without changing existing members.
create or replace function public.flowmate_is_gdve_member_code(p_member_code text) returns boolean
language sql stable security definer set search_path='' as $$
 select lower(coalesce(p_member_code,''))=any(array['pond','jo','tong','eye','vee','ploy'])
 or exists(select 1 from public.team_members where member_code=p_member_code and managed_profile)
$$;
do $patch$ declare d text; begin
 if to_regprocedure('public.flowmate_admin_update_team_member(uuid,numeric,integer,text[],text[])') is not null then
 select pg_get_functiondef('public.flowmate_admin_update_team_member(uuid,numeric,integer,text[],text[])'::regprocedure) into d;
 d:=replace(d, $$lower(member_code) = any (array['pond','jo','tong','eye','vee','ploy'])$$, 'public.flowmate_is_gdve_member_code(member_code)');
 execute d;
 end if;
end $patch$;
-- Activate configured new profiles only for members who can receive work.
create or replace function flowmate_members_private.configure_profile() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.managed_profile then
 new.active:=new.capacity_per_day>0 and new.wip_limit>0 and coalesce(array_length(new.skills,1),0)>0;
 end if; return new;
end $$;
drop trigger if exists flowmate_configure_profile on public.team_members;
create trigger flowmate_configure_profile before update of skills,capacity_per_day,wip_limit on public.team_members
 for each row execute function flowmate_members_private.configure_profile();
do $patch$ declare d text; begin
 select pg_get_functiondef('public.flowmate_member_can_assign(uuid,date)'::regprocedure) into d;
 if position($$u.role<>'viewer'$$ in d)=0 then execute replace(d,'where tm.id=p_member', $$where u.role<>'viewer' and tm.id=p_member$$); end if;
 select pg_get_functiondef('public.flowmate_admin_members()'::regprocedure) into d;
 if position('team_profile_name' in d)=0 then
 d:=replace(d, $$'member_id',tm.id$$, $$'member_id',tm.id,'team_profile_name',tm.display_name,'viewer_teams',w.viewer_teams$$);
 d:=replace(d, $$'access_active',w.email is not null$$, $$'access_active',flowmate_members_private.email_allowed(coalesce(w.email,lower(u.email))) and w.email is not null$$);
 execute d; end if;
end $patch$;

-- Viewer writes are rejected even when a legacy SECURITY DEFINER RPC bypasses RLS.
create or replace function flowmate_members_private.viewer_work_item_access(p_user_id uuid,p_work_item_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.work_items wi join public.user_team_memberships m
 on m.team_code=wi.owning_team_code and m.user_id=p_user_id
 join public.teams t on t.code=m.team_code and t.is_active
 where wi.id=p_work_item_id and public.flowmate_member_access_allowed(p_user_id)
 and (wi.work_type::text<>'quick_task' or public.task_assign_can_read(p_user_id,wi.id)))
$$;
create or replace function public.flowmate_viewer_can_read_work_item(p_work_item_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from public.users where id=auth.uid() and role='viewer')
 or flowmate_members_private.viewer_work_item_access(auth.uid(),p_work_item_id)
$$;
revoke all on function public.flowmate_viewer_can_read_work_item(uuid) from public,anon;
grant execute on function public.flowmate_viewer_can_read_work_item(uuid) to authenticated;
alter table public.work_items enable row level security;
drop policy if exists flowmate_viewer_team_scope on public.work_items;
create policy flowmate_viewer_team_scope on public.work_items as restrictive for select to authenticated
 using(public.flowmate_viewer_can_read_work_item(id));
-- Apply the same narrowing to attached comments, checklists, events and creative details.
do $$ declare t record; begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 join pg_attribute a on a.attrelid=c.oid and a.attname='work_item_id' and not a.attisdropped
 where c.relkind in ('r','p') and n.nspname='public' and c.relrowsecurity and a.atttypid='uuid'::regtype loop
 execute format('drop policy if exists flowmate_viewer_team_scope on %I.%I',t.nspname,t.relname);
 execute format('create policy flowmate_viewer_team_scope on %I.%I as restrictive for select to authenticated using(public.flowmate_viewer_can_read_work_item(work_item_id))',t.nspname,t.relname);
 end loop;
end $$;
do $taskpatch$ declare d text; begin
 if to_regprocedure('public.task_assign_list(text,text,text)') is not null then
  select pg_get_functiondef('public.task_assign_list(text,text,text)'::regprocedure) into d;
  d:=replace(d, $$'can_dispatch',public.task_assign_can_dispatch(actor,w.owning_team_code)$$, $$'can_dispatch',not exists(select 1 from public.users where id=actor and role='viewer') and public.task_assign_can_dispatch(actor,w.owning_team_code)$$);
  d:=replace(d, $$'can_execute',public.task_assign_can_execute(actor,w.id)$$, $$'can_execute',not exists(select 1 from public.users where id=actor and role='viewer') and public.task_assign_can_execute(actor,w.id)$$);
  d:=replace(d,'and public.task_assign_can_read(actor,w.id) and case p_view','and public.task_assign_can_read(actor,w.id) and public.flowmate_viewer_can_read_work_item(w.id) and case p_view');
  execute d;
 end if;
 if to_regprocedure('public.task_assign_members(text)') is not null then
  select pg_get_functiondef('public.task_assign_members(text)'::regprocedure) into d;
  if strpos(d,'Viewer team directory')=0 then
   d:=regexp_replace(d,'\mbegin\M', $$begin
   if exists(select 1 from public.users where id=actor and role='viewer') and not public.flowmate_user_can_access_team(actor,p_team) then
    raise exception 'Viewer team directory is unavailable' using errcode='42501'; end if;$$,'i');
   execute d;
  end if;
 end if;
end $taskpatch$;
do $patch$ declare d text; body text; helper text; fn oid; begin
 -- Preserve both legacy and Task Assign SQL read helpers for Member/Admin.
 foreach helper in array array['flowmate_user_can_read_work_item','flowmate_can_read_work_item'] loop
  fn:=to_regprocedure('public.'||helper||'(uuid,uuid)');
  if fn is not null then
   select pg_get_functiondef(p.oid),p.prosrc into d,body from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=fn and l.lanname='sql';
   if d is null or strpos(d,'p_user_id')=0 or strpos(d,'p_work_item_id')=0 then raise exception 'Unsupported read helper: %',helper; end if;
   if strpos(body,'viewer_work_item_access')=0 then
    body:=regexp_replace(body,'^\s+|\s+$','','g');
    body:=regexp_replace(body,';\s*$','');
    if body !~* '^select\s' then raise exception 'Unsupported SQL read helper: %',helper; end if;
    d:=split_part(d,'AS $function$',1)||'AS $viewer$ select case when exists(select 1 from public.users where id=p_user_id and role=''viewer'') then flowmate_members_private.viewer_work_item_access(p_user_id,p_work_item_id) else ('||body||') end $viewer$;';
    execute d;
   end if;
  end if;
 end loop;
 if to_regprocedure('public.flowmate_creative_brief(uuid,text,text,bigint)') is not null then
  select pg_get_functiondef('public.flowmate_creative_brief(uuid,text,text,bigint)'::regprocedure) into d;
  if position('Viewer access is read-only' in d)=0 then
   if position('p_action' in d)=0 then raise exception 'Review creative brief action contract before applying'; end if;
   d:=regexp_replace(d,'\mbegin\M', $$begin
   if not public.flowmate_viewer_can_read_work_item(p_work_item_id) then raise exception 'This team is not available to Viewer' using errcode='42501'; end if;
   if coalesce(p_action,'read')<>'read' and exists(select 1 from public.users where id=auth.uid() and role='viewer') then
    raise exception 'Viewer access is read-only' using errcode='42501'; end if;$$,'i');
   execute d;
  end if;
 end if;
 -- SeaTalk dispatch authenticates an actor then calls SQL with service_role.
 if to_regprocedure('public.ot_seatalk_claim_dispatch(uuid,uuid)') is not null then
  select pg_get_functiondef('public.ot_seatalk_claim_dispatch(uuid,uuid)'::regprocedure) into d;
  if position('Viewer access is read-only' in d)=0 then
   if position('p_actor_id' in d)=0 then raise exception 'Review OT actor contract before applying'; end if;
   d:=regexp_replace(d,'\mbegin\M', $$begin
   if exists(select 1 from public.users where id=p_actor_id and role='viewer') then
    raise exception 'Viewer access is read-only' using errcode='42501'; end if;$$,'i');
   execute d;
  end if;
 end if;
end $patch$;
create or replace function flowmate_members_private.guard_viewer_write() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from public.users where id=auth.uid() and role='viewer') then
 raise exception 'Viewer access is read-only' using errcode='42501'; end if;
 return null;
end $$;
do $$ declare t record; begin
 for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where c.relkind in ('r','p') and (n.nspname='public' or n.nspname='flowmate_members_private'
 or n.nspname like '%\_private' escape '\' or (n.nspname='storage' and c.relname='objects')) loop
 execute format('drop trigger if exists flowmate_viewer_write_guard on %I.%I',t.nspname,t.relname);
 execute format('create trigger flowmate_viewer_write_guard before insert or update or delete or truncate on %I.%I for each statement execute function flowmate_members_private.guard_viewer_write()',t.nspname,t.relname);
 end loop;
end $$;
revoke all on all functions in schema flowmate_members_private from public,anon,authenticated;
-- Keep lifecycle enforcement and reject unreviewed RPCs before they can cause side effects.
create or replace function public.flowmate_check_member_access() returns void
language plpgsql security definer set search_path='' as $$
declare path text:=current_setting('request.path',true); method text:=current_setting('request.method',true); begin
 if auth.uid() is not null and not public.flowmate_member_access_allowed(auth.uid()) then
 raise exception 'FlowMate access is inactive. Contact your administrator.' using errcode='42501'; end if;
 if exists(select 1 from public.users where id=auth.uid() and role='viewer') then
 if path like '/rpc/%' then
 if substring(path from 6) <> all(array[
 'flowmate_board_summary','flowmate_list_delivered_history','flowmate_creative_brief',
 'battle_pass_review_status','product_book_list_patches','product_book_list_revisions',
 'marketing_campaign_planner_can_manage','flowmate_board_summary_by_function','task_assign_list','task_assign_members','ot_get_access_context','ot_get_my_dashboard',
 'ot_list_my_requests','ot_get_manager_dashboard','ot_list_eligible_approvers','ot_list_people_for_event'])
 or coalesce(method,'') not in ('GET','HEAD','POST') then
 raise exception 'Viewer access is read-only' using errcode='42501'; end if;
 elsif coalesce(method,'') not in ('GET','HEAD') then
 raise exception 'Viewer access is read-only' using errcode='42501'; end if;
 end if;
end $$;
revoke all on function public.flowmate_admin_domains(), public.flowmate_admin_save_domain(text,boolean) from public,anon;
grant execute on function public.flowmate_admin_domains(), public.flowmate_admin_save_domain(text,boolean) to authenticated;
notify pgrst,'reload schema';
commit;
