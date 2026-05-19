-- FlowMate MVP 1.1 requester team/function sync
-- Run after supabase/whitelist_access.sql and supabase/seed.sql when updating
-- an existing live database. This does not change users.role/admin access.

begin;

with role_map(name, email, role_label, member_code) as (
  values
    ('Gear',    'sasin.cha@garena.com',      'PM',        'gear'),
    ('Big',     'nithidol.k@garena.com',     'Operation', 'big'),
    ('Mark',    'tanadech.s@garena.com',     'Operation', 'mark'),
    ('Po',      'sakdarin@garena.com',       'Operation', 'po'),
    ('Aof',     'fco.thanayoot@garena.com',  'Operation', 'aof'),
    ('Folk',    'fco.koravit@garena.com',    'Operation', 'folk'),
    ('Mac',     'weerayut@garena.com',       'Marketing', 'mac'),
    ('No',      'chayodom.a@garena.com',     'Marketing', 'no'),
    ('May',     'kwanchanok.s@garena.com',   'Marketing', 'may'),
    ('Boss',    'fco.rittichai@garena.com',  'Marketing', 'boss'),
    ('Mag',     'fco.thanatbhum@garena.com', 'Marketing', 'mag'),
    ('Real',    'fco.punyakon@garena.com',   'Marketing', 'real'),
    ('Pointer', 'fco.run@garena.com',        'Marketing', 'pointer'),
    ('Pond',    'kasidet.y@garena.com',      'GD/VE',     'pond'),
    ('Joe',     'nattaporn.j@garena.com',    'GD/VE',     'jo'),
    ('Tong',    'fco.krittidech@garena.com', 'GD/VE',     'tong'),
    ('Eye',     'fco.janyarat@garena.com',   'GD/VE',     'eye'),
    ('Vee',     'fco.thanadon@garena.com',   'GD/VE',     'vee'),
    ('Pluem',   'napol.a@garena.com',        'Esport',    'pluem'),
    ('Net',     'fco.piyapat@garena.com',    'Esport',    'net'),
    ('Ben',     'fco.kittipoj@garena.com',   'Esport',    'ben'),
    ('Peak',    'fco.pheerati@garena.com',   'Esport',    'peak')
)
update public.users u
set requester_team = rm.role_label,
    updated_at = now()
from role_map rm
where lower(u.email) = lower(rm.email);

with role_map(name, email, role_label, member_code) as (
  values
    ('Gear',    'sasin.cha@garena.com',      'PM',        'gear'),
    ('Big',     'nithidol.k@garena.com',     'Operation', 'big'),
    ('Mark',    'tanadech.s@garena.com',     'Operation', 'mark'),
    ('Po',      'sakdarin@garena.com',       'Operation', 'po'),
    ('Aof',     'fco.thanayoot@garena.com',  'Operation', 'aof'),
    ('Folk',    'fco.koravit@garena.com',    'Operation', 'folk'),
    ('Mac',     'weerayut@garena.com',       'Marketing', 'mac'),
    ('No',      'chayodom.a@garena.com',     'Marketing', 'no'),
    ('May',     'kwanchanok.s@garena.com',   'Marketing', 'may'),
    ('Boss',    'fco.rittichai@garena.com',  'Marketing', 'boss'),
    ('Mag',     'fco.thanatbhum@garena.com', 'Marketing', 'mag'),
    ('Real',    'fco.punyakon@garena.com',   'Marketing', 'real'),
    ('Pointer', 'fco.run@garena.com',        'Marketing', 'pointer'),
    ('Pond',    'kasidet.y@garena.com',      'GD/VE',     'pond'),
    ('Joe',     'nattaporn.j@garena.com',    'GD/VE',     'jo'),
    ('Tong',    'fco.krittidech@garena.com', 'GD/VE',     'tong'),
    ('Eye',     'fco.janyarat@garena.com',   'GD/VE',     'eye'),
    ('Vee',     'fco.thanadon@garena.com',   'GD/VE',     'vee'),
    ('Pluem',   'napol.a@garena.com',        'Esport',    'pluem'),
    ('Net',     'fco.piyapat@garena.com',    'Esport',    'net'),
    ('Ben',     'fco.kittipoj@garena.com',   'Esport',    'ben'),
    ('Peak',    'fco.pheerati@garena.com',   'Esport',    'peak')
)
update public.team_members tm
set discipline = rm.role_label,
    discipline_short = rm.role_label,
    updated_at = now()
from role_map rm
where tm.member_code = rm.member_code;

with role_map(name, email, role_label, member_code) as (
  values
    ('Gear',    'sasin.cha@garena.com',      'PM',        'gear'),
    ('Big',     'nithidol.k@garena.com',     'Operation', 'big'),
    ('Mark',    'tanadech.s@garena.com',     'Operation', 'mark'),
    ('Po',      'sakdarin@garena.com',       'Operation', 'po'),
    ('Aof',     'fco.thanayoot@garena.com',  'Operation', 'aof'),
    ('Folk',    'fco.koravit@garena.com',    'Operation', 'folk'),
    ('Mac',     'weerayut@garena.com',       'Marketing', 'mac'),
    ('No',      'chayodom.a@garena.com',     'Marketing', 'no'),
    ('May',     'kwanchanok.s@garena.com',   'Marketing', 'may'),
    ('Boss',    'fco.rittichai@garena.com',  'Marketing', 'boss'),
    ('Mag',     'fco.thanatbhum@garena.com', 'Marketing', 'mag'),
    ('Real',    'fco.punyakon@garena.com',   'Marketing', 'real'),
    ('Pointer', 'fco.run@garena.com',        'Marketing', 'pointer'),
    ('Pond',    'kasidet.y@garena.com',      'GD/VE',     'pond'),
    ('Joe',     'nattaporn.j@garena.com',    'GD/VE',     'jo'),
    ('Tong',    'fco.krittidech@garena.com', 'GD/VE',     'tong'),
    ('Eye',     'fco.janyarat@garena.com',   'GD/VE',     'eye'),
    ('Vee',     'fco.thanadon@garena.com',   'GD/VE',     'vee'),
    ('Pluem',   'napol.a@garena.com',        'Esport',    'pluem'),
    ('Net',     'fco.piyapat@garena.com',    'Esport',    'net'),
    ('Ben',     'fco.kittipoj@garena.com',   'Esport',    'ben'),
    ('Peak',    'fco.pheerati@garena.com',   'Esport',    'peak')
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
