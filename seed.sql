-- FlowMate MVP 1.1 seed data
-- Run this after supabase/schema.sql.
-- Seeds the real roster only. No mock/sample work items are inserted.

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

insert into public.users (id, email, display_name, requester_team, google_subject, is_active)
values
  ('00000000-0000-0000-0000-000000001001', 'sasin.cha@garena.com', 'Gear', 'Operations', 'seed-gear', true),
  ('00000000-0000-0000-0000-000000001002', 'panuwee.w@garena.com', 'Panu', 'FCO', 'seed-panu', true),
  ('00000000-0000-0000-0000-000000001003', 'nithidol.k@garena.com', 'Big', 'Operations', 'seed-big', true),
  ('00000000-0000-0000-0000-000000001004', 'tanadech.s@garena.com', 'Mark', 'Operations', 'seed-mark', true),
  ('00000000-0000-0000-0000-000000001005', 'sakdarin@garena.com', 'Po', 'Operations', 'seed-po', true),
  ('00000000-0000-0000-0000-000000001006', 'fco.thanayoot@garena.com', 'Aof', 'Operations', 'seed-aof', true),
  ('00000000-0000-0000-0000-000000001007', 'fco.koravit@garena.com', 'Folk', 'Operations', 'seed-folk', true),
  ('00000000-0000-0000-0000-000000001008', 'weerayut@garena.com', 'Mac', 'Marketing', 'seed-mac', true),
  ('00000000-0000-0000-0000-000000001009', 'chayodom.a@garena.com', 'No', 'Marketing', 'seed-no', true),
  ('00000000-0000-0000-0000-000000001010', 'kwanchanok.s@garena.com', 'May', 'Marketing', 'seed-may', true),
  ('00000000-0000-0000-0000-000000001011', 'fco.rittichai@garena.com', 'Boss', 'Marketing', 'seed-boss', true),
  ('00000000-0000-0000-0000-000000001012', 'fco.thanatbhum@garena.com', 'Mag', 'Marketing', 'seed-mag', true),
  ('00000000-0000-0000-0000-000000001013', 'fco.punyakon@garena.com', 'Real', 'Marketing', 'seed-real', true),
  ('00000000-0000-0000-0000-000000001014', 'fco.run@garena.com', 'Pointer', 'Marketing', 'seed-pointer', true),
  ('00000000-0000-0000-0000-000000001015', 'kasidet.y@garena.com', 'Pond', 'GD/VE', 'seed-pond-real', true),
  ('00000000-0000-0000-0000-000000001016', 'nattaporn.j@garena.com', 'Joe', 'GD/VE', 'seed-joe', true),
  ('00000000-0000-0000-0000-000000001017', 'fco.krittidech@garena.com', 'Tong', 'GD/VE', 'seed-tong-real', true),
  ('00000000-0000-0000-0000-000000001018', 'fco.janyarat@garena.com', 'Eye', 'GD/VE', 'seed-eye-real', true),
  ('00000000-0000-0000-0000-000000001019', 'fco.thanadon@garena.com', 'Vee', 'GD/VE', 'seed-vee-real', true),
  ('00000000-0000-0000-0000-000000001020', 'napol.a@garena.com', 'Pluem', 'Esport', 'seed-pluem', true),
  ('00000000-0000-0000-0000-000000001021', 'fco.piyapat@garena.com', 'Net', 'Esport', 'seed-net', true),
  ('00000000-0000-0000-0000-000000001022', 'fco.kittipoj@garena.com', 'Ben', 'Esport', 'seed-ben', true),
  ('00000000-0000-0000-0000-000000001023', 'fco.pheerati@garena.com', 'Peak', 'Esport', 'seed-peak', true)
on conflict (email) do update set
  display_name = excluded.display_name,
  requester_team = excluded.requester_team,
  google_subject = excluded.google_subject,
  is_active = excluded.is_active;

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
values
  ('10000000-0000-0000-0000-000000000001', 'pond', (select id from public.users where lower(email) = lower('kasidet.y@garena.com')), 'Pond', 'PD', '#2E546D', 'GD/VE', 'GD/VE', array['static-graphic','general-video','motion']::public.asset_type[], array['esport-video']::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000002', 'jo', (select id from public.users where lower(email) = lower('nattaporn.j@garena.com')), 'Joe', 'JO', '#C0504D', 'GD/VE', 'GD/VE', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000003', 'tong', (select id from public.users where lower(email) = lower('fco.krittidech@garena.com')), 'Tong', 'TG', '#BF6B00', 'GD/VE', 'GD/VE', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000004', 'eye', (select id from public.users where lower(email) = lower('fco.janyarat@garena.com')), 'Eye', 'EY', '#2E546D', 'GD/VE', 'GD/VE', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000005', 'vee', (select id from public.users where lower(email) = lower('fco.thanadon@garena.com')), 'Vee', 'VE', '#C0504D', 'GD/VE', 'GD/VE', array['esport-video']::public.asset_type[], '{}'::public.asset_type[], 8, null, 2, 'available', true),
  ('10000000-0000-0000-0000-000000000006', 'gear', (select id from public.users where lower(email) = lower('sasin.cha@garena.com')), 'Gear', 'GE', '#2E546D', 'Operations', 'Operations', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000007', 'panu', (select id from public.users where lower(email) = lower('panuwee.w@garena.com')), 'Panu', 'PN', '#C0504D', 'FCO Admin', 'FCO', array['static-graphic','general-video','motion']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000008', 'big', (select id from public.users where lower(email) = lower('nithidol.k@garena.com')), 'Big', 'BG', '#BF6B00', 'Operations', 'Operations', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000009', 'mark', (select id from public.users where lower(email) = lower('tanadech.s@garena.com')), 'Mark', 'MK', '#2E546D', 'Operations', 'Operations', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000010', 'po', (select id from public.users where lower(email) = lower('sakdarin@garena.com')), 'Po', 'PO', '#C0504D', 'Operations', 'Operations', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000011', 'aof', (select id from public.users where lower(email) = lower('fco.thanayoot@garena.com')), 'Aof', 'AO', '#BF6B00', 'Operations', 'Operations', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000012', 'folk', (select id from public.users where lower(email) = lower('fco.koravit@garena.com')), 'Folk', 'FK', '#2E546D', 'Operations', 'Operations', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000013', 'mac', (select id from public.users where lower(email) = lower('weerayut@garena.com')), 'Mac', 'MC', '#C0504D', 'Marketing', 'Marketing', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000014', 'no', (select id from public.users where lower(email) = lower('chayodom.a@garena.com')), 'No', 'NO', '#BF6B00', 'Marketing', 'Marketing', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000015', 'may', (select id from public.users where lower(email) = lower('kwanchanok.s@garena.com')), 'May', 'MY', '#2E546D', 'Marketing', 'Marketing', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000016', 'boss', (select id from public.users where lower(email) = lower('fco.rittichai@garena.com')), 'Boss', 'BS', '#C0504D', 'Marketing', 'Marketing', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000017', 'mag', (select id from public.users where lower(email) = lower('fco.thanatbhum@garena.com')), 'Mag', 'MG', '#BF6B00', 'Marketing', 'Marketing', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000018', 'real', (select id from public.users where lower(email) = lower('fco.punyakon@garena.com')), 'Real', 'RL', '#2E546D', 'Marketing', 'Marketing', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000019', 'pointer', (select id from public.users where lower(email) = lower('fco.run@garena.com')), 'Pointer', 'PT', '#C0504D', 'Marketing', 'Marketing', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000020', 'pluem', (select id from public.users where lower(email) = lower('napol.a@garena.com')), 'Pluem', 'PL', '#BF6B00', 'Esport', 'Esport', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000021', 'net', (select id from public.users where lower(email) = lower('fco.piyapat@garena.com')), 'Net', 'NT', '#2E546D', 'Esport', 'Esport', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000022', 'ben', (select id from public.users where lower(email) = lower('fco.kittipoj@garena.com')), 'Ben', 'BN', '#C0504D', 'Esport', 'Esport', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000023', 'peak', (select id from public.users where lower(email) = lower('fco.pheerati@garena.com')), 'Peak', 'PK', '#BF6B00', 'Esport', 'Esport', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true)
on conflict (member_code) do update set
  user_id = excluded.user_id,
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
  active = excluded.active;
