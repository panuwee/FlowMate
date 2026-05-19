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
  added_by       uuid references public.users(id) on delete set null,
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
  ('sasin.cha@garena.com',        'Gear',    'member', 'gear'),
  ('nithidol.k@garena.com',       'Big',     'member', 'big'),
  ('tanadech.s@garena.com',       'Mark',    'member', 'mark'),
  ('sakdarin@garena.com',         'Po',      'member', 'po'),
  ('fco.thanayoot@garena.com',    'Aof',     'member', 'aof'),
  ('fco.koravit@garena.com',      'Folk',    'member', 'folk'),
  ('weerayut@garena.com',         'Mac',     'member', 'mac'),
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
  ('napol.a@garena.com',          'Pluem',   'member', 'pluem'),
  ('fco.piyapat@garena.com',      'Net',     'member', 'net'),
  ('fco.kittipoj@garena.com',     'Ben',     'member', 'ben'),
  ('fco.pheerati@garena.com',     'Peak',    'member', 'peak')
on conflict (email) do update set
  display_name     = excluded.display_name,
  role             = excluded.role,
  team_member_code = excluded.team_member_code;

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

grant select on public.user_whitelist to anon, authenticated;
grant insert, update, delete on public.user_whitelist to authenticated;

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
