-- FlowMate MVP 1.1 admin role update
-- Promotes Gear and Mac to admin in both whitelist and active user profiles.

begin;

insert into public.user_whitelist (email, display_name, role, team_member_code)
values
  ('sasin.cha@garena.com', 'Gear', 'admin', 'gear'),
  ('weerayut@garena.com',  'Mac',  'admin', 'mac')
on conflict (email) do update set
  display_name      = excluded.display_name,
  role              = excluded.role,
  team_member_code  = excluded.team_member_code,
  is_active         = true;

update public.user_whitelist
set role = 'admin',
    is_active = true
where lower(email) in (
  'sasin.cha@garena.com',
  'weerayut@garena.com'
);

update public.users
set role = 'admin',
    is_active = true,
    updated_at = now()
where lower(email) in (
  'sasin.cha@garena.com',
  'weerayut@garena.com'
);

commit;

select email, display_name, role, is_active
from public.user_whitelist
where lower(email) in (
  'sasin.cha@garena.com',
  'weerayut@garena.com'
)
order by email;

select email, display_name, role, is_active
from public.users
where lower(email) in (
  'sasin.cha@garena.com',
  'weerayut@garena.com'
)
order by email;
