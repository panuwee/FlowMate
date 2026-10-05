-- Synthetic database only. No remote connections or provider calls.
create role anon; create role authenticated; create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.role() returns text language sql as $$ select current_setting('request.jwt.claim.role',true) $$;
grant usage on schema auth to anon,authenticated,service_role;
create table public.users(id uuid primary key,email text,role text,is_active boolean default true);
create table public.teams(code text primary key,is_active boolean default true);
create table public.user_team_memberships(user_id uuid references public.users(id),team_code text references public.teams(code));
create table public.team_members(id uuid primary key,user_id uuid references public.users(id),member_code text,display_name text,active boolean default true);
create table public.work_items(id uuid primary key,display_id text,title text,work_type text,status text,owning_team_code text,
 requester_user_id uuid,assignee_user_id uuid,final_owner_member_id uuid,archived_at timestamptz);
create function public.flowmate_member_access_allowed(uuid) returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.users where id=$1 and is_active) $$;
create function public.is_admin_app_user() returns boolean language sql security definer set search_path='' as $$ select exists(select 1 from public.users where id=auth.uid() and role='admin' and is_active) $$;
create function public.flowmate_user_can_read_work_item(uuid,uuid) returns boolean language sql security definer set search_path='' as $$
 select exists(select 1 from public.work_items w where w.id=$2 and ($1=w.requester_user_id or $1=w.assignee_user_id)) $$;
insert into public.teams(code) values('gdve'),('ops'),('mkt'),('esport');
insert into public.users(id,email,role) values
 ('00000000-0000-0000-0000-000000000001','admin@example.test','admin'),
 ('00000000-0000-0000-0000-000000000002','requester@example.test','member'),
 ('00000000-0000-0000-0000-000000000003','assignee@example.test','member'),
 ('00000000-0000-0000-0000-000000000004','other@example.test','member');
insert into public.team_members(id,user_id,member_code,display_name) values
 ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','requester','Test Requester'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','assignee','Test Assignee'),
 ('10000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000004','other','Other Team');
insert into public.user_team_memberships values
 ('00000000-0000-0000-0000-000000000002','gdve'),('00000000-0000-0000-0000-000000000003','gdve'),
 ('00000000-0000-0000-0000-000000000004','mkt');
