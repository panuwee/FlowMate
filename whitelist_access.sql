-- ===========================================================================
-- FlowMate access whitelist
-- ---------------------------------------------------------------------------
-- Only emails listed in public.user_whitelist may sign in. Run this AFTER
-- schema.sql + seed.sql + the auth-sync triggers from step 3 of the SSO
-- setup (handle_new_auth_user + enforce_garena_domain).
--
-- Idempotent — safe to re-run when adding or removing users.
-- ===========================================================================

-- 1. Whitelist table -------------------------------------------------------
create table if not exists public.user_whitelist (
  email          text primary key,
  display_name   text not null,
  role           text not null default 'member' check (role in ('admin', 'member')),
  team_member_code text,           -- optional FK-ish link to public.team_members.member_code
  added_at       timestamptz not null default now(),
  added_by       uuid references public.users(id) on update cascade on delete set null,
  constraint user_whitelist_email_shape check (email ~* '^[^@\s]+@garena\.com$')
);

create index if not exists idx_user_whitelist_role on public.user_whitelist(role);

-- 2. Add `role` column to public.users (mirrors whitelist; used for UI/RPC checks)
alter table public.users
  add column if not exists role text not null default 'member';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'users_role_values'
  ) then
    alter table public.users
      add constraint users_role_values check (role in ('admin', 'member'));
  end if;
end $$;

-- 3. Seed the whitelist ----------------------------------------------------
-- team_member_code matches public.team_members.member_code so that when
-- the real Google account signs in, handle_new_auth_user can re-link the
-- existing seeded team_member row to the real user.id.
insert into public.user_whitelist (email, display_name, role, team_member_code) values
  ('panuwee.w@garena.com',        'Panu',    'admin',  'panu'),
  ('sasin.cha@garena.com',        'Gear',    'admin',  'gear'),
  ('nithidol.k@garena.com',       'Big',     'member', 'big'),
  ('tanadech.s@garena.com',       'Mark',    'member', 'mark'),
  ('sakdarin@garena.com',         'Po',      'member', 'po'),
  ('fco.thanayoot@garena.com',    'Aof',     'member', 'aof'),
  ('fco.koravit@garena.com',      'Folk',    'member', 'folk'),
  ('weerayut@garena.com',         'Mac',     'admin',  'mac'),
  ('chayodom.a@garena.com',       'No',      'member', 'no'),
  ('kwanchanok.s@garena.com',     'May',     'member', 'may'),
  ('fco.rittichai@garena.com',    'Boss',    'member', 'boss'),
  ('fco.thanatbhum@garena.com',   'Mag',     'member', 'mag'),
  ('fco.punyakon@garena.com',     'Real',    'member', 'real'),
  ('fco.run@garena.com',          'Pointer', 'member', 'pointer'),
  ('kasidet.y@garena.com',        'Pond',    'member', 'pond'),
  ('nattaporn.j@garena.com',      'Joe',     'member', 'jo'),
  ('fco.krittidech@garena.com',   'Tong',    'member', 'tong'),
  ('fco.janyarat@garena.com',     'Eye',     'member', 'eye'),
  ('fco.thanadon@garena.com',     'Vee',     'member', 'vee'),
  ('fco.thanyaporn@garena.com',   'Ploy',    'member', 'ploy'),
  ('napol.a@garena.com',          'Pluem',   'member', 'pluem'),
  ('fco.piyapat@garena.com',      'Net',     'member', 'net'),
  ('fco.kittipoj@garena.com',     'Ben',     'member', 'ben'),
  ('fco.pheerati@garena.com',     'Peak',    'member', 'peak')
on conflict (email) do update set
  display_name     = excluded.display_name,
  role             = excluded.role,
  team_member_code = excluded.team_member_code;

insert into public.team_members (
  id,
  member_code,
  user_id,
  display_name,
  initials,
  color,
  discipline,
  discipline_short,
  skills,
  backup_skills,
  capacity_per_day,
  capacity_override_per_day,
  wip_limit,
  availability,
  active
)
values (
  '10000000-0000-0000-0000-000000000024',
  'ploy',
  (select id from public.users where lower(email) = lower('fco.thanyaporn@garena.com')),
  'Ploy',
  'PL',
  '#BF6B00',
  'GD/VE',
  'GD/VE',
  array['banner','logo','resize','graphic-pack','kv-design','jersey-design','jersey-in-game','merchandise-design']::text[],
  '{}'::text[],
  8,
  null,
  3,
  'available',
  true
)
on conflict (member_code) do update set
  user_id = coalesce(excluded.user_id, public.team_members.user_id),
  display_name = excluded.display_name,
  initials = excluded.initials,
  color = excluded.color,
  discipline = excluded.discipline,
  discipline_short = excluded.discipline_short,
  skills = excluded.skills,
  backup_skills = excluded.backup_skills,
  capacity_per_day = excluded.capacity_per_day,
  capacity_override_per_day = excluded.capacity_override_per_day,
  wip_limit = excluded.wip_limit,
  availability = excluded.availability,
  active = excluded.active,
  updated_at = now();

-- 3b. Make seeded public.users rows safe to relink to real auth.users IDs ----
-- Seeded users start with stable UUIDs so tasks can exist before Google login.
-- When the real Google account signs in, auth.users.id is different. These FK
-- constraints must cascade on user-id update, otherwise existing seeded rows
-- block the auth-sync trigger and the user lands back on the login screen.
create or replace function public.flowmate_recreate_user_fk(
  p_table_name text,
  p_constraint_name text,
  p_column_name text,
  p_on_delete_clause text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass(format('public.%I', p_table_name)) is null then
    return;
  end if;

  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = p_table_name
       and column_name = p_column_name
  ) then
    return;
  end if;

  execute format('alter table public.%I drop constraint if exists %I', p_table_name, p_constraint_name);
  execute format(
    'alter table public.%I add constraint %I foreign key (%I) references public.users(id) on update cascade %s',
    p_table_name,
    p_constraint_name,
    p_column_name,
    p_on_delete_clause
  );
end;
$$;

select public.flowmate_recreate_user_fk('team_members', 'team_members_user_id_fkey', 'user_id', 'on delete set null');
select public.flowmate_recreate_user_fk('work_items', 'work_items_requester_user_id_fkey', 'requester_user_id', '');
select public.flowmate_recreate_user_fk('work_items', 'work_items_assignee_user_id_fkey', 'assignee_user_id', '');
select public.flowmate_recreate_user_fk('work_item_events', 'work_item_events_actor_user_id_fkey', 'actor_user_id', '');
select public.flowmate_recreate_user_fk('comments', 'comments_author_user_id_fkey', 'author_user_id', '');
select public.flowmate_recreate_user_fk('checklist_items', 'checklist_items_created_by_user_id_fkey', 'created_by_user_id', '');
select public.flowmate_recreate_user_fk('notifications', 'notifications_user_id_fkey', 'user_id', 'on delete cascade');
select public.flowmate_recreate_user_fk('notifications', 'notifications_actor_user_id_fkey', 'actor_user_id', 'on delete set null');
select public.flowmate_recreate_user_fk('capacity_overrides', 'capacity_overrides_created_by_user_id_fkey', 'created_by_user_id', '');
select public.flowmate_recreate_user_fk('user_whitelist', 'user_whitelist_added_by_fkey', 'added_by', 'on delete set null');
select public.flowmate_recreate_user_fk('leave_requests', 'leave_requests_created_by_user_id_fkey', 'created_by_user_id', 'on delete restrict');
select public.flowmate_recreate_user_fk('work_item_links', 'work_item_links_created_by_user_id_fkey', 'created_by_user_id', '');
select public.flowmate_recreate_user_fk('work_item_links', 'work_item_links_deleted_by_user_id_fkey', 'deleted_by_user_id', 'on delete set null');
select public.flowmate_recreate_user_fk('work_item_watchers', 'work_item_watchers_watcher_user_id_fkey', 'watcher_user_id', '');
select public.flowmate_recreate_user_fk('work_item_watchers', 'work_item_watchers_added_by_user_id_fkey', 'added_by_user_id', '');
select public.flowmate_recreate_user_fk('work_item_watchers', 'work_item_watchers_removed_by_user_id_fkey', 'removed_by_user_id', 'on delete set null');
select public.flowmate_recreate_user_fk('creative_request_templates', 'creative_request_templates_created_by_user_id_fkey', 'created_by_user_id', 'on delete set null');

drop function if exists public.flowmate_recreate_user_fk(text, text, text, text);

-- 4. Update domain-enforcement trigger to also check whitelist -------------
-- This fires BEFORE INSERT on auth.users. If the email is missing from the
-- whitelist, Google sign-in is rejected before any session is created.
create or replace function public.enforce_garena_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or new.email !~* '@garena\.com$' then
    raise exception 'Only @garena.com accounts are allowed';
  end if;

  if not exists (
    select 1 from public.user_whitelist
    where lower(email) = lower(new.email)
  ) then
    raise exception 'Email % is not on the FlowMate access whitelist. Please contact panuwee.w@garena.com to request access.', new.email;
  end if;

  return new;
end;
$$;

-- Make sure the trigger is attached (idempotent).
drop trigger if exists enforce_garena_domain_trg on auth.users;
create trigger enforce_garena_domain_trg
  before insert on auth.users
  for each row execute function public.enforce_garena_domain();

-- 5. Update auth-sync trigger to pull display_name + role + team link ------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wl public.user_whitelist%rowtype;
begin
  select * into v_wl
    from public.user_whitelist
   where lower(email) = lower(new.email);

  -- Defence in depth — if enforce_garena_domain didn't run for any reason,
  -- still refuse to materialise a profile for non-whitelisted emails.
  if v_wl.email is null then
    raise exception 'Email % is not on the FlowMate access whitelist.', new.email;
  end if;

  insert into public.users (
    id, email, display_name, google_subject, is_active, role, requester_team
  )
  values (
    new.id,
    new.email,
    coalesce(
      v_wl.display_name,
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data->>'sub',
    true,
    coalesce(v_wl.role, 'member'),
    null
  )
  on conflict (email) do update set
    id             = excluded.id,
    google_subject = excluded.google_subject,
    display_name   = coalesce(public.users.display_name, excluded.display_name),
    role           = excluded.role,
    is_active      = true;

  -- Re-link the seeded team_member row to the real auth user when the
  -- whitelist row pins a team_member_code.
  if v_wl.team_member_code is not null then
    update public.team_members
       set user_id = new.id, updated_at = now()
     where member_code = v_wl.team_member_code;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Repair users who already completed Google OAuth before this auth-id sync fix
-- was installed. This is what allows existing Mac/Gear/Panu auth sessions to
-- map to the seeded profile rows instead of looping back to Login.
update public.users u
   set id             = au.id,
       google_subject = coalesce(au.raw_user_meta_data->>'sub', u.google_subject),
       display_name   = coalesce(u.display_name, wl.display_name, au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', split_part(au.email, '@', 1)),
       role           = coalesce(wl.role, u.role, 'member'),
       is_active      = true,
       updated_at     = now()
  from auth.users au
  join public.user_whitelist wl
    on lower(wl.email) = lower(au.email)
 where lower(u.email) = lower(au.email)
   and u.id <> au.id;

update public.team_members tm
   set user_id = au.id,
       updated_at = now()
  from auth.users au
  join public.user_whitelist wl
    on lower(wl.email) = lower(au.email)
 where wl.team_member_code is not null
   and tm.member_code = wl.team_member_code
   and tm.user_id is distinct from au.id;

-- 6. Deactivate any existing public.users that are NOT on the whitelist ----
-- The mock dev users (pond@garena.com, jo@garena.com, …) get deactivated by
-- this because they aren't on the real whitelist. They stay in the table so
-- seeded foreign keys (work_items.requester_user_id, team_members.user_id)
-- keep working until the real users sign in for the first time.
update public.users
   set is_active = false,
       updated_at = now()
 where lower(email) not in (select lower(email) from public.user_whitelist)
   and is_active = true;

-- 7. RLS on the whitelist table itself -------------------------------------
alter table public.user_whitelist enable row level security;

drop policy if exists "active users can read whitelist" on public.user_whitelist;
create policy "active users can read whitelist"
  on public.user_whitelist for select
  using (public.is_active_app_user());

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

drop policy if exists "admins can write whitelist" on public.user_whitelist;
create policy "admins can write whitelist"
  on public.user_whitelist for all
  using (public.is_admin_app_user())
  with check (public.is_admin_app_user());

-- 8. Admin RPCs for whitelist UI -------------------------------------------
-- The browser should not write public.user_whitelist directly. These functions
-- resolve the actor from auth.uid() and then require that actor to be an active
-- FlowMate admin.
create or replace function public.flowmate_admin_upsert_whitelist_user(
  p_email text,
  p_display_name text,
  p_role text default 'member',
  p_team_member_code text default null
)
returns public.user_whitelist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_email text;
  v_display_name text;
  v_team_member_code text;
  v_row public.user_whitelist%rowtype;
begin
  v_actor_id := auth.uid();

  if not public.is_admin_app_user() then
    raise exception 'Only FlowMate admins can manage the whitelist'
      using errcode = '42501';
  end if;

  v_email := lower(trim(p_email));
  v_display_name := nullif(trim(coalesce(p_display_name, '')), '');
  v_team_member_code := nullif(trim(coalesce(p_team_member_code, '')), '');

  if v_email is null or v_email !~* '^[^@\s]+@garena\.com$' then
    raise exception 'Whitelist email must be a @garena.com address'
      using errcode = '22023';
  end if;

  if v_display_name is null then
    raise exception 'Display name is required'
      using errcode = '22023';
  end if;

  if p_role is null or p_role not in ('admin', 'member') then
    raise exception 'Whitelist role must be admin or member'
      using errcode = '22023';
  end if;

  if v_team_member_code is not null and not exists (
    select 1 from public.team_members tm
    where tm.member_code = v_team_member_code
  ) then
    raise exception 'Unknown team_member_code: %', v_team_member_code
      using errcode = '23503';
  end if;

  insert into public.user_whitelist (
    email,
    display_name,
    role,
    team_member_code,
    added_by
  )
  values (
    v_email,
    v_display_name,
    p_role,
    v_team_member_code,
    v_actor_id
  )
  on conflict (email) do update set
    display_name = excluded.display_name,
    role = excluded.role,
    team_member_code = excluded.team_member_code,
    added_by = v_actor_id
  returning * into v_row;

  update public.users
     set display_name = v_display_name,
         role = p_role,
         is_active = true,
         updated_at = now()
   where lower(email) = v_email;

  if v_team_member_code is not null then
    update public.team_members
       set user_id = (
             select u.id
               from public.users u
              where lower(u.email) = v_email
              limit 1
           ),
           updated_at = now()
     where member_code = v_team_member_code
       and exists (
         select 1 from public.users u
         where lower(u.email) = v_email
       );
  end if;

  return v_row;
end;
$$;

create or replace function public.flowmate_admin_delete_whitelist_user(
  p_email text
)
returns public.user_whitelist
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_email text;
  v_row public.user_whitelist%rowtype;
begin
  v_actor_id := auth.uid();

  if not public.is_admin_app_user() then
    raise exception 'Only FlowMate admins can manage the whitelist'
      using errcode = '42501';
  end if;

  v_email := lower(trim(p_email));

  if v_email is null or v_email !~* '^[^@\s]+@garena\.com$' then
    raise exception 'Whitelist email must be a @garena.com address'
      using errcode = '22023';
  end if;

  delete from public.user_whitelist
   where email = v_email
   returning * into v_row;

  update public.users
     set is_active = false,
         updated_at = now()
   where lower(email) = v_email;

  return v_row;
end;
$$;

grant select on public.user_whitelist to anon, authenticated;
revoke insert, update, delete on public.user_whitelist from anon, authenticated;
grant execute on function public.flowmate_admin_upsert_whitelist_user(
  text,
  text,
  text,
  text
) to authenticated;
grant execute on function public.flowmate_admin_delete_whitelist_user(text)
to authenticated;

-- ===========================================================================
-- Maintenance examples
-- ===========================================================================
--
-- Add a new user (requires admin role for the RPC layer, or service_role in
-- the SQL Editor):
--
--   insert into public.user_whitelist (email, display_name, role)
--   values ('new.person@garena.com', 'Newbie', 'member');
--
-- Promote / demote an admin:
--
--   update public.user_whitelist set role = 'admin'
--    where lower(email) = 'panuwee.w@garena.com';
--
--   update public.users         set role = 'admin'
--    where lower(email) = 'panuwee.w@garena.com';
--
-- Revoke access (preferred — keeps history):
--
--   delete from public.user_whitelist where lower(email) = 'someone@garena.com';
--   update public.users set is_active = false
--    where lower(email) = 'someone@garena.com';
--
-- Link a whitelisted user to a team_member row after the fact:
--
--   update public.team_members
--      set user_id = (select id from public.users where lower(email) = 'kasidet.y@garena.com')
--    where member_code = 'pond';
