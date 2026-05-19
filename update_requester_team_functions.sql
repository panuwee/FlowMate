-- FlowMate MVP 1.1 requester team/function sync
-- Run after supabase/whitelist_access.sql and supabase/seed.sql when updating
-- an existing live database. This does not change users.role/admin access.

begin;

create temporary table if not exists flowmate_mock_users_to_delete (
  id uuid primary key
) on commit drop;

truncate flowmate_mock_users_to_delete;

insert into flowmate_mock_users_to_delete (id)
select id
from public.users
where google_subject like 'mock-%';

create temporary table if not exists flowmate_mock_team_members_to_delete (
  id uuid primary key
) on commit drop;

truncate flowmate_mock_team_members_to_delete;

insert into flowmate_mock_team_members_to_delete (id)
select tm.id
from public.team_members tm
where tm.user_id in (select id from flowmate_mock_users_to_delete);

create temporary table if not exists flowmate_mock_work_items_to_delete (
  id uuid primary key
) on commit drop;

truncate flowmate_mock_work_items_to_delete;

insert into flowmate_mock_work_items_to_delete (id)
select wi.id
from public.work_items wi
where wi.requester_user_id in (select id from flowmate_mock_users_to_delete)
   or wi.assignee_user_id in (select id from flowmate_mock_users_to_delete)
   or wi.final_owner_member_id in (select id from flowmate_mock_team_members_to_delete)
   or wi.id::text like '20000000-0000-0000-0000-0000000010%'
   or wi.id::text like '30000000-0000-0000-0000-0000000002%';

delete from public.comments
where work_item_id in (select id from flowmate_mock_work_items_to_delete)
   or author_user_id in (select id from flowmate_mock_users_to_delete);

delete from public.checklist_items
where work_item_id in (select id from flowmate_mock_work_items_to_delete)
   or created_by_user_id in (select id from flowmate_mock_users_to_delete);

delete from public.capacity_overrides
where created_by_user_id in (select id from flowmate_mock_users_to_delete);

update public.work_item_events
set actor_user_id = null
where actor_user_id in (select id from flowmate_mock_users_to_delete);

delete from public.work_items
where id in (select id from flowmate_mock_work_items_to_delete);

delete from public.team_members
where id in (select id from flowmate_mock_team_members_to_delete);

delete from public.users
where id in (select id from flowmate_mock_users_to_delete);

update public.users
set requester_team = case trim(requester_team)
    when 'Operation' then 'Operations'
    when 'GD/VE Internal' then 'GD/VE'
    when 'Esport Ops' then 'Esport'
    when 'PM' then 'Operations'
    else requester_team
  end,
  updated_at = now()
where trim(requester_team) in ('Operation', 'GD/VE Internal', 'Esport Ops', 'PM');

update public.team_members
set discipline = case trim(discipline)
    when 'Operation' then 'Operations'
    when 'GD/VE Internal' then 'GD/VE'
    when 'Esport Ops' then 'Esport'
    when 'PM' then 'Operations'
    else discipline
  end,
  discipline_short = case trim(discipline_short)
    when 'Operation' then 'Operations'
    when 'GD/VE Internal' then 'GD/VE'
    when 'Esport Ops' then 'Esport'
    when 'PM' then 'Operations'
    else discipline_short
  end,
  updated_at = now()
where trim(discipline) in ('Operation', 'GD/VE Internal', 'Esport Ops', 'PM')
   or trim(discipline_short) in ('Operation', 'GD/VE Internal', 'Esport Ops', 'PM');

update public.work_items
set requester_team = case trim(requester_team)
    when 'Operation' then 'Operations'
    when 'GD/VE Internal' then 'GD/VE'
    when 'Esport Ops' then 'Esport'
    when 'PM' then 'Operations'
    else requester_team
  end,
  updated_at = now()
where trim(requester_team) in ('Operation', 'GD/VE Internal', 'Esport Ops', 'PM');

with role_map(name, email, role_label, member_code) as (
  values
    ('Gear',    'sasin.cha@garena.com',      'Operations', 'gear'),
    ('Big',     'nithidol.k@garena.com',     'Operations', 'big'),
    ('Mark',    'tanadech.s@garena.com',     'Operations', 'mark'),
    ('Po',      'sakdarin@garena.com',       'Operations', 'po'),
    ('Aof',     'fco.thanayoot@garena.com',  'Operations', 'aof'),
    ('Folk',    'fco.koravit@garena.com',    'Operations', 'folk'),
    ('Mac',     'weerayut@garena.com',       'Marketing',  'mac'),
    ('No',      'chayodom.a@garena.com',     'Marketing',  'no'),
    ('May',     'kwanchanok.s@garena.com',   'Marketing',  'may'),
    ('Boss',    'fco.rittichai@garena.com',  'Marketing',  'boss'),
    ('Mag',     'fco.thanatbhum@garena.com', 'Marketing',  'mag'),
    ('Real',    'fco.punyakon@garena.com',   'Marketing',  'real'),
    ('Pointer', 'fco.run@garena.com',        'Marketing',  'pointer'),
    ('Pond',    'kasidet.y@garena.com',      'GD/VE',      'pond'),
    ('Joe',     'nattaporn.j@garena.com',    'GD/VE',      'jo'),
    ('Tong',    'fco.krittidech@garena.com', 'GD/VE',      'tong'),
    ('Eye',     'fco.janyarat@garena.com',   'GD/VE',      'eye'),
    ('Vee',     'fco.thanadon@garena.com',   'GD/VE',      'vee'),
    ('Pluem',   'napol.a@garena.com',        'Esport',     'pluem'),
    ('Net',     'fco.piyapat@garena.com',    'Esport',     'net'),
    ('Ben',     'fco.kittipoj@garena.com',   'Esport',     'ben'),
    ('Peak',    'fco.pheerati@garena.com',   'Esport',     'peak')
)
update public.users u
set requester_team = rm.role_label,
    updated_at = now()
from role_map rm
where lower(u.email) = lower(rm.email);

with role_map(name, email, role_label, member_code) as (
  values
    ('Gear',    'sasin.cha@garena.com',      'Operations', 'gear'),
    ('Big',     'nithidol.k@garena.com',     'Operations', 'big'),
    ('Mark',    'tanadech.s@garena.com',     'Operations', 'mark'),
    ('Po',      'sakdarin@garena.com',       'Operations', 'po'),
    ('Aof',     'fco.thanayoot@garena.com',  'Operations', 'aof'),
    ('Folk',    'fco.koravit@garena.com',    'Operations', 'folk'),
    ('Mac',     'weerayut@garena.com',       'Marketing',  'mac'),
    ('No',      'chayodom.a@garena.com',     'Marketing',  'no'),
    ('May',     'kwanchanok.s@garena.com',   'Marketing',  'may'),
    ('Boss',    'fco.rittichai@garena.com',  'Marketing',  'boss'),
    ('Mag',     'fco.thanatbhum@garena.com', 'Marketing',  'mag'),
    ('Real',    'fco.punyakon@garena.com',   'Marketing',  'real'),
    ('Pointer', 'fco.run@garena.com',        'Marketing',  'pointer'),
    ('Pond',    'kasidet.y@garena.com',      'GD/VE',      'pond'),
    ('Joe',     'nattaporn.j@garena.com',    'GD/VE',      'jo'),
    ('Tong',    'fco.krittidech@garena.com', 'GD/VE',      'tong'),
    ('Eye',     'fco.janyarat@garena.com',   'GD/VE',      'eye'),
    ('Vee',     'fco.thanadon@garena.com',   'GD/VE',      'vee'),
    ('Pluem',   'napol.a@garena.com',        'Esport',     'pluem'),
    ('Net',     'fco.piyapat@garena.com',    'Esport',     'net'),
    ('Ben',     'fco.kittipoj@garena.com',   'Esport',     'ben'),
    ('Peak',    'fco.pheerati@garena.com',   'Esport',     'peak')
)
update public.team_members tm
set discipline = rm.role_label,
    discipline_short = rm.role_label,
    updated_at = now()
from role_map rm
where tm.member_code = rm.member_code;

with role_map(name, email, role_label, member_code) as (
  values
    ('Gear',    'sasin.cha@garena.com',      'Operations', 'gear'),
    ('Big',     'nithidol.k@garena.com',     'Operations', 'big'),
    ('Mark',    'tanadech.s@garena.com',     'Operations', 'mark'),
    ('Po',      'sakdarin@garena.com',       'Operations', 'po'),
    ('Aof',     'fco.thanayoot@garena.com',  'Operations', 'aof'),
    ('Folk',    'fco.koravit@garena.com',    'Operations', 'folk'),
    ('Mac',     'weerayut@garena.com',       'Marketing',  'mac'),
    ('No',      'chayodom.a@garena.com',     'Marketing',  'no'),
    ('May',     'kwanchanok.s@garena.com',   'Marketing',  'may'),
    ('Boss',    'fco.rittichai@garena.com',  'Marketing',  'boss'),
    ('Mag',     'fco.thanatbhum@garena.com', 'Marketing',  'mag'),
    ('Real',    'fco.punyakon@garena.com',   'Marketing',  'real'),
    ('Pointer', 'fco.run@garena.com',        'Marketing',  'pointer'),
    ('Pond',    'kasidet.y@garena.com',      'GD/VE',      'pond'),
    ('Joe',     'nattaporn.j@garena.com',    'GD/VE',      'jo'),
    ('Tong',    'fco.krittidech@garena.com', 'GD/VE',      'tong'),
    ('Eye',     'fco.janyarat@garena.com',   'GD/VE',      'eye'),
    ('Vee',     'fco.thanadon@garena.com',   'GD/VE',      'vee'),
    ('Pluem',   'napol.a@garena.com',        'Esport',     'pluem'),
    ('Net',     'fco.piyapat@garena.com',    'Esport',     'net'),
    ('Ben',     'fco.kittipoj@garena.com',   'Esport',     'ben'),
    ('Peak',    'fco.pheerati@garena.com',   'Esport',     'peak')
)
update public.work_items wi
set requester_team = rm.role_label,
    updated_at = now()
from role_map rm
join public.users u on lower(u.email) = lower(rm.email)
where wi.requester_user_id = u.id;

commit;

select
  u.display_name,
  u.email,
  u.requester_team,
  tm.member_code,
  tm.discipline,
  tm.discipline_short
from public.users u
left join public.team_members tm on tm.user_id = u.id
where lower(u.email) in (
  'sasin.cha@garena.com',
  'nithidol.k@garena.com',
  'tanadech.s@garena.com',
  'sakdarin@garena.com',
  'fco.thanayoot@garena.com',
  'fco.koravit@garena.com',
  'weerayut@garena.com',
  'chayodom.a@garena.com',
  'kwanchanok.s@garena.com',
  'fco.rittichai@garena.com',
  'fco.thanatbhum@garena.com',
  'fco.punyakon@garena.com',
  'fco.run@garena.com',
  'kasidet.y@garena.com',
  'nattaporn.j@garena.com',
  'fco.krittidech@garena.com',
  'fco.janyarat@garena.com',
  'fco.thanadon@garena.com',
  'napol.a@garena.com',
  'fco.piyapat@garena.com',
  'fco.kittipoj@garena.com',
  'fco.pheerati@garena.com'
)
order by tm.member_code;
