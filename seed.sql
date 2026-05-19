-- FlowMate MVP 1.0 seed data
-- Run this after supabase/schema.sql.

insert into public.users (id, email, display_name, requester_team, google_subject, is_active)
values
  ('00000000-0000-0000-0000-000000000001', 'pond@garena.com', 'Pond', 'GD/VE Internal', 'mock-pond', true),
  ('00000000-0000-0000-0000-000000000002', 'jo@garena.com', 'Jo', 'GD/VE Internal', 'mock-jo', true),
  ('00000000-0000-0000-0000-000000000003', 'tong@garena.com', 'Tong', 'GD/VE Internal', 'mock-tong', true),
  ('00000000-0000-0000-0000-000000000004', 'eye@garena.com', 'Eye', 'GD/VE Internal', 'mock-eye', true),
  ('00000000-0000-0000-0000-000000000005', 'vee@garena.com', 'Vee', 'GD/VE Internal', 'mock-vee', true),
  ('00000000-0000-0000-0000-000000000101', 'lin.chen@garena.com', 'Lin Chen', 'Marketing', 'mock-lin', true),
  ('00000000-0000-0000-0000-000000000102', 'mira.santos@garena.com', 'Mira Santos', 'Esport Ops', 'mock-mira', true),
  ('00000000-0000-0000-0000-000000000103', 'aisha.rahman@garena.com', 'Aisha Rahman', 'Sales', 'mock-aisha', true),
  ('00000000-0000-0000-0000-000000000104', 'jamal.wright@garena.com', 'Jamal Wright', 'Community', 'mock-jamal', true),
  ('00000000-0000-0000-0000-000000000105', 'soo.yeon@garena.com', 'Soo-yeon Park', 'Product', 'mock-sooyeon', true),
  ('00000000-0000-0000-0000-000000000106', 'hana.liu@garena.com', 'Hana Liu', 'Operations', 'mock-hana', true),
  ('00000000-0000-0000-0000-000000000107', 'daniel.park@garena.com', 'Daniel Park', 'Marketing', 'mock-daniel', true),
  ('00000000-0000-0000-0000-000000000108', 'tom.liu@garena.com', 'Tom Liu', 'GD/VE Internal', 'mock-tom', true),
  ('00000000-0000-0000-0000-000000001001', 'sasin.cha@garena.com', 'Gear', 'FCO', 'seed-gear', true),
  ('00000000-0000-0000-0000-000000001002', 'panuwee.w@garena.com', 'Panu', 'FCO', 'seed-panu', true),
  ('00000000-0000-0000-0000-000000001003', 'nithidol.k@garena.com', 'Big', 'FCO', 'seed-big', true),
  ('00000000-0000-0000-0000-000000001004', 'tanadech.s@garena.com', 'Mark', 'FCO', 'seed-mark', true),
  ('00000000-0000-0000-0000-000000001005', 'sakdarin@garena.com', 'Po', 'FCO', 'seed-po', true),
  ('00000000-0000-0000-0000-000000001006', 'fco.thanayoot@garena.com', 'Aof', 'FCO', 'seed-aof', true),
  ('00000000-0000-0000-0000-000000001007', 'fco.koravit@garena.com', 'Folk', 'FCO', 'seed-folk', true),
  ('00000000-0000-0000-0000-000000001008', 'weerayut@garena.com', 'Mac', 'FCO', 'seed-mac', true),
  ('00000000-0000-0000-0000-000000001009', 'chayodom.a@garena.com', 'No', 'FCO', 'seed-no', true),
  ('00000000-0000-0000-0000-000000001010', 'kwanchanok.s@garena.com', 'May', 'FCO', 'seed-may', true),
  ('00000000-0000-0000-0000-000000001011', 'fco.rittichai@garena.com', 'Boss', 'FCO', 'seed-boss', true),
  ('00000000-0000-0000-0000-000000001012', 'fco.thanatbhum@garena.com', 'Mag', 'FCO', 'seed-mag', true),
  ('00000000-0000-0000-0000-000000001013', 'fco.punyakon@garena.com', 'Real', 'FCO', 'seed-real', true),
  ('00000000-0000-0000-0000-000000001014', 'fco.run@garena.com', 'Pointer', 'FCO', 'seed-pointer', true),
  ('00000000-0000-0000-0000-000000001015', 'kasidet.y@garena.com', 'Pond', 'FCO', 'seed-pond-real', true),
  ('00000000-0000-0000-0000-000000001016', 'nattaporn.j@garena.com', 'Joe', 'FCO', 'seed-joe', true),
  ('00000000-0000-0000-0000-000000001017', 'fco.krittidech@garena.com', 'Tong', 'FCO', 'seed-tong-real', true),
  ('00000000-0000-0000-0000-000000001018', 'fco.janyarat@garena.com', 'Eye', 'FCO', 'seed-eye-real', true),
  ('00000000-0000-0000-0000-000000001019', 'fco.thanadon@garena.com', 'Vee', 'FCO', 'seed-vee-real', true),
  ('00000000-0000-0000-0000-000000001020', 'napol.a@garena.com', 'Pluem', 'FCO', 'seed-pluem', true),
  ('00000000-0000-0000-0000-000000001021', 'fco.piyapat@garena.com', 'Net', 'FCO', 'seed-net', true),
  ('00000000-0000-0000-0000-000000001022', 'fco.kittipoj@garena.com', 'Ben', 'FCO', 'seed-ben', true),
  ('00000000-0000-0000-0000-000000001023', 'fco.pheerati@garena.com', 'Peak', 'FCO', 'seed-peak', true)
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
  ('10000000-0000-0000-0000-000000000001', 'pond', '00000000-0000-0000-0000-000000001015', 'Pond', 'PD', '#2E546D', 'Graphic Designer + Video Editor', 'GD+VE', array['static-graphic','general-video','motion']::public.asset_type[], array['esport-video']::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000002', 'jo', '00000000-0000-0000-0000-000000001016', 'Joe', 'JO', '#C0504D', 'Graphic Designer', 'GD', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000003', 'tong', '00000000-0000-0000-0000-000000001017', 'Tong', 'TG', '#BF6B00', 'Graphic Designer', 'GD', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, 4, 3, 'partial', true),
  ('10000000-0000-0000-0000-000000000004', 'eye', '00000000-0000-0000-0000-000000001018', 'Eye', 'EY', '#2E546D', 'Graphic Designer', 'GD', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000005', 'vee', '00000000-0000-0000-0000-000000001019', 'Vee', 'VE', '#C0504D', 'Video Editor - eSport only', 'VE', array['esport-video']::public.asset_type[], '{}'::public.asset_type[], 8, null, 2, 'available', true),
  ('10000000-0000-0000-0000-000000000006', 'gear', '00000000-0000-0000-0000-000000001001', 'Gear', 'GE', '#2E546D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000007', 'panu', '00000000-0000-0000-0000-000000001002', 'Panu', 'PN', '#C0504D', 'FCO Admin', 'FCO', array['static-graphic','general-video','motion']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000008', 'big', '00000000-0000-0000-0000-000000001003', 'Big', 'BG', '#BF6B00', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000009', 'mark', '00000000-0000-0000-0000-000000001004', 'Mark', 'MK', '#2E546D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000010', 'po', '00000000-0000-0000-0000-000000001005', 'Po', 'PO', '#C0504D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000011', 'aof', '00000000-0000-0000-0000-000000001006', 'Aof', 'AO', '#BF6B00', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000012', 'folk', '00000000-0000-0000-0000-000000001007', 'Folk', 'FK', '#2E546D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000013', 'mac', '00000000-0000-0000-0000-000000001008', 'Mac', 'MC', '#C0504D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000014', 'no', '00000000-0000-0000-0000-000000001009', 'No', 'NO', '#BF6B00', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000015', 'may', '00000000-0000-0000-0000-000000001010', 'May', 'MY', '#2E546D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000016', 'boss', '00000000-0000-0000-0000-000000001011', 'Boss', 'BS', '#C0504D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000017', 'mag', '00000000-0000-0000-0000-000000001012', 'Mag', 'MG', '#BF6B00', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000018', 'real', '00000000-0000-0000-0000-000000001013', 'Real', 'RL', '#2E546D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000019', 'pointer', '00000000-0000-0000-0000-000000001014', 'Pointer', 'PT', '#C0504D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000020', 'pluem', '00000000-0000-0000-0000-000000001020', 'Pluem', 'PL', '#BF6B00', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000021', 'net', '00000000-0000-0000-0000-000000001021', 'Net', 'NT', '#2E546D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000022', 'ben', '00000000-0000-0000-0000-000000001022', 'Ben', 'BN', '#C0504D', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true),
  ('10000000-0000-0000-0000-000000000023', 'peak', '00000000-0000-0000-0000-000000001023', 'Peak', 'PK', '#BF6B00', 'FCO Team', 'FCO', array['static-graphic']::public.asset_type[], '{}'::public.asset_type[], 8, null, 3, 'available', true)
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

insert into public.work_items (
  id,
  display_id,
  work_type,
  title,
  description,
  project_name,
  campaign_name,
  requester_user_id,
  requester_team,
  assignee_user_id,
  final_owner_member_id,
  status,
  priority,
  urgent_reason,
  due_date,
  launch_date,
  effort_point,
  needs_split,
  assignment_reason,
  blocked_reason,
  delivery_link,
  review_round,
  wip_counted,
  delivered_at
)
values
  ('20000000-0000-0000-0000-000000001042', 'CR-1042', 'creative_request', 'Free Fire OB48 launch - IG carousel set (6 frames)', null, 'OB48 Launch', 'OB48 Launch', '00000000-0000-0000-0000-000000000101', 'Marketing', null, '10000000-0000-0000-0000-000000000002', 'in_progress', 'urgent', 'Launch asset due before campaign reveal.', '2026-05-13', '2026-05-15', 4, false, 'Auto: static graphic assigned to Jo by skill, WIP, and capacity.', null, null, 0, true, null),
  ('20000000-0000-0000-0000-000000001038', 'CR-1038', 'creative_request', 'AOV ranked season promo banner - YouTube end-card', null, 'AOV S24', 'AOV S24', '00000000-0000-0000-0000-000000000107', 'Marketing', null, '10000000-0000-0000-0000-000000000004', 'blocked', 'high', null, '2026-05-14', '2026-05-16', 2, false, 'Auto: static graphic assigned to Eye by skill, WIP, and capacity.', 'Waiting on legal copy review', null, 1, false, null),
  ('20000000-0000-0000-0000-000000001051', 'CR-1051', 'creative_request', 'CODM World Championship - TikTok teaser (15s)', null, 'CODM Worlds', 'CODM Worlds', '00000000-0000-0000-0000-000000000102', 'Esport Ops', null, '10000000-0000-0000-0000-000000000005', 'in_progress', 'urgent', 'World Championship launch content.', '2026-05-16', '2026-06-06', 7, false, 'Auto: esport video assigned to Vee first by skill and remaining capacity.', null, null, 0, true, null),
  ('20000000-0000-0000-0000-000000001047', 'CR-1047', 'creative_request', 'Q2 partner deck - chart visual refresh (8 slides)', null, 'Q2 Partner Review', 'Q2 Partner Review', '00000000-0000-0000-0000-000000000103', 'Sales', null, '10000000-0000-0000-0000-000000000001', 'review', 'normal', null, '2026-05-17', '2026-05-18', 4, false, 'Auto: static graphic assigned to Pond by skill and capacity.', null, 'https://drive.google.com/example-delivery-cr1047', 1, false, null),
  ('20000000-0000-0000-0000-000000001049', 'CR-1049', 'creative_request', 'AOV community spotlight - motion intro (6s loop)', null, 'Spotlight #14', 'Spotlight #14', '00000000-0000-0000-0000-000000000104', 'Community', null, '10000000-0000-0000-0000-000000000001', 'assigned', 'normal', null, '2026-05-19', '2026-05-21', 6, false, 'Auto: motion assigned to Pond as motion-capable owner.', null, null, 0, false, null),
  ('20000000-0000-0000-0000-000000001045', 'CR-1045', 'creative_request', 'Esport graphic pack - FF Pro League finals', null, 'FFPL Finals', 'FFPL Finals', '00000000-0000-0000-0000-000000000102', 'Esport Ops', null, '10000000-0000-0000-0000-000000000003', 'in_progress', 'high', null, '2026-05-20', '2026-05-22', 8, false, 'Auto: static graphic assigned to Tong by skill and partial capacity override.', null, null, 0, true, null),
  ('20000000-0000-0000-0000-000000001050', 'CR-1050', 'creative_request', 'Anti-cheat update - explainer thumbnail set', null, 'Anti-Cheat 2.3', 'Anti-Cheat 2.3', '00000000-0000-0000-0000-000000000105', 'Product', null, '10000000-0000-0000-0000-000000000004', 'assigned', 'normal', null, '2026-05-18', '2026-05-20', 2, false, 'Auto: static graphic assigned to Eye by skill and capacity.', null, null, 0, false, null),
  ('20000000-0000-0000-0000-000000001048', 'CR-1048', 'creative_request', 'FF skin reveal - short-form vertical (10s)', null, 'FF May Drop', 'FF May Drop', '00000000-0000-0000-0000-000000000101', 'Marketing', null, '10000000-0000-0000-0000-000000000005', 'review', 'high', null, '2026-05-18', '2026-05-19', 4, false, 'Auto: esport video assigned to Vee first by skill and capacity.', null, 'https://drive.google.com/example-delivery-cr1048', 2, false, null),
  ('20000000-0000-0000-0000-000000001053', 'CR-1053', 'creative_request', 'AOV launch - hybrid package (key art + 20s motion)', null, 'AOV S24 Launch', 'AOV S24 Launch', '00000000-0000-0000-0000-000000000107', 'Marketing', null, null, 'queued', 'high', null, '2026-05-22', '2026-05-24', 8, true, 'Queued: hybrid request must be split into separate static/video requests.', null, null, 0, false, null),
  ('20000000-0000-0000-0000-000000001054', 'CR-1054', 'creative_request', 'Free Fire MX - regional banner refresh (4 sizes)', null, 'FF MX June', 'FF MX June', '00000000-0000-0000-0000-000000000103', 'Marketing', null, null, 'queued', 'normal', null, '2026-05-18', '2026-05-20', 4, false, 'Queued: all static graphic designers are at capacity before due date.', null, null, 0, false, null),
  ('20000000-0000-0000-0000-000000001055', 'CR-1055', 'creative_request', 'Pro League finals - venue signage motion loop', null, 'FFPL Finals', 'FFPL Finals', '00000000-0000-0000-0000-000000000102', 'Esport Ops', null, null, 'queued', 'urgent', 'Venue loop is needed for finals run-through.', '2026-05-17', '2026-05-19', 7, false, 'Queued: motion-capable owner has no remaining capacity before due date.', null, null, 0, false, null),
  ('20000000-0000-0000-0000-000000001056', 'CR-1056', 'creative_request', 'Community AMA recap - graphics', null, 'Community AMA', 'Community AMA', '00000000-0000-0000-0000-000000000104', 'Community', null, null, 'need_brief', 'low', null, '2026-05-24', '2026-05-26', null, false, 'Need Brief: brief link and size/format are required.', null, null, 0, false, null),
  ('30000000-0000-0000-0000-000000000209', 'QT-0209', 'quick_task', 'Update shared brand-asset folder structure for Q2', 'Clean old folders and create Q2 naming structure.', 'Internal - GD/VE', null, '00000000-0000-0000-0000-000000000001', 'GD/VE Internal', '00000000-0000-0000-0000-000000000001', null, 'in_progress', 'normal', null, '2026-05-16', null, null, false, null, null, null, 0, false, null),
  ('30000000-0000-0000-0000-000000000211', 'QT-0211', 'quick_task', 'Pull retention chart numbers for tomorrow standup', null, 'Internal - GD/VE', null, '00000000-0000-0000-0000-000000000108', 'GD/VE Internal', '00000000-0000-0000-0000-000000000004', null, 'assigned', 'low', null, '2026-05-15', null, null, false, null, null, null, 0, false, null),
  ('30000000-0000-0000-0000-000000000213', 'QT-0213', 'quick_task', 'Review junior designer portfolio - first round', null, 'Internal - GD/VE', null, '00000000-0000-0000-0000-000000000001', 'GD/VE Internal', '00000000-0000-0000-0000-000000000001', null, 'assigned', 'normal', null, '2026-05-19', null, null, false, null, null, null, 0, false, null),
  ('20000000-0000-0000-0000-000000001031', 'CR-1031', 'creative_request', 'OB47 patch notes - chart visuals (12 charts)', null, 'OB47 Patch', 'OB47 Patch', '00000000-0000-0000-0000-000000000105', 'Product', null, '10000000-0000-0000-0000-000000000002', 'delivered', 'normal', null, '2026-05-10', '2026-05-11', 6, false, 'Auto: static graphic assigned to Jo by skill and capacity.', null, 'https://drive.google.com/example-delivery-cr1031', 1, false, '2026-05-10 12:00:00+00'),
  ('20000000-0000-0000-0000-000000001029', 'CR-1029', 'creative_request', 'May newsletter - header banner', null, 'May Newsletter', 'May Newsletter', '00000000-0000-0000-0000-000000000101', 'Marketing', null, '10000000-0000-0000-0000-000000000004', 'delivered', 'low', null, '2026-05-08', '2026-05-09', 2, false, 'Auto: static graphic assigned to Eye by skill and capacity.', null, 'https://drive.google.com/example-delivery-cr1029', 0, false, '2026-05-08 12:00:00+00')
on conflict (display_id) do update set
  title = excluded.title,
  description = excluded.description,
  project_name = excluded.project_name,
  campaign_name = excluded.campaign_name,
  requester_user_id = excluded.requester_user_id,
  requester_team = excluded.requester_team,
  assignee_user_id = excluded.assignee_user_id,
  final_owner_member_id = excluded.final_owner_member_id,
  status = excluded.status,
  priority = excluded.priority,
  urgent_reason = excluded.urgent_reason,
  due_date = excluded.due_date,
  launch_date = excluded.launch_date,
  effort_point = excluded.effort_point,
  needs_split = excluded.needs_split,
  assignment_reason = excluded.assignment_reason,
  blocked_reason = excluded.blocked_reason,
  delivery_link = excluded.delivery_link,
  review_round = excluded.review_round,
  wip_counted = excluded.wip_counted,
  delivered_at = excluded.delivered_at;

insert into public.creative_request_details (
  work_item_id,
  asset_type,
  asset_subtype,
  platforms,
  size_format,
  brief_link,
  reference_link,
  brief_completeness_status,
  brief_missing_reason
)
select wi.id, x.asset_type::public.asset_type, x.asset_subtype, x.platforms, x.size_format, x.brief_link, x.reference_link, x.brief_status::public.work_status, x.brief_missing_reason
from (
  values
    ('CR-1042', 'static-graphic', 'social carousel', array['Instagram'], '1080x1350', 'https://docs.google.com/example-cr1042', null, 'new', null),
    ('CR-1038', 'static-graphic', 'banner', array['YouTube'], '1920x1080', 'https://docs.google.com/example-cr1038', null, 'new', null),
    ('CR-1051', 'esport-video', 'short-form', array['TikTok'], '1080x1920', 'https://docs.google.com/example-cr1051', null, 'new', null),
    ('CR-1047', 'static-graphic', 'deck refresh', array['Web'], '1920x1080', 'https://docs.google.com/example-cr1047', null, 'new', null),
    ('CR-1049', 'motion', 'motion intro', array['Instagram','YouTube'], '1080x1080', 'https://docs.google.com/example-cr1049', null, 'new', null),
    ('CR-1045', 'static-graphic', 'esport pack - full set', array['Multi'], 'Multi', 'https://docs.google.com/example-cr1045', null, 'new', null),
    ('CR-1050', 'static-graphic', 'thumbnail set', array['Web','YouTube'], 'Multi', 'https://docs.google.com/example-cr1050', null, 'new', null),
    ('CR-1048', 'esport-video', 'short-form', array['TikTok','Reels'], '1080x1920', 'https://docs.google.com/example-cr1048', null, 'new', null),
    ('CR-1053', 'hybrid', 'key art + motion', array['Multi'], 'Multi', 'https://docs.google.com/example-cr1053', null, 'new', null),
    ('CR-1054', 'static-graphic', 'regional banner refresh', array['Web','App'], '4 sizes', 'https://docs.google.com/example-cr1054', null, 'new', null),
    ('CR-1055', 'motion', 'venue signage loop', array['Venue'], '3840x1080', 'https://docs.google.com/example-cr1055', null, 'new', null),
    ('CR-1056', 'static-graphic', 'recap graphics', array['Facebook'], 'Missing', 'https://docs.google.com/example-cr1056', null, 'need_brief', 'Brief link and size/format need confirmation.'),
    ('CR-1031', 'static-graphic', 'chart visuals', array['Web'], '12 charts', 'https://docs.google.com/example-cr1031', null, 'new', null),
    ('CR-1029', 'static-graphic', 'header banner', array['Email'], 'Email header', 'https://docs.google.com/example-cr1029', null, 'new', null)
) as x(display_id, asset_type, asset_subtype, platforms, size_format, brief_link, reference_link, brief_status, brief_missing_reason)
join public.work_items wi on wi.display_id = x.display_id
on conflict (work_item_id) do update set
  asset_type = excluded.asset_type,
  asset_subtype = excluded.asset_subtype,
  platforms = excluded.platforms,
  size_format = excluded.size_format,
  brief_link = excluded.brief_link,
  reference_link = excluded.reference_link,
  brief_completeness_status = excluded.brief_completeness_status,
  brief_missing_reason = excluded.brief_missing_reason;

insert into public.assignment_runs (
  work_item_id,
  triggered_by,
  suggested_owner_member_id,
  final_owner_member_id,
  result,
  reason,
  effort_point,
  raw_range_min,
  raw_range_max,
  was_capped,
  capacity_snapshot
)
select
  wi.id,
  'submit'::public.assignment_trigger,
  wi.final_owner_member_id,
  wi.final_owner_member_id,
  case when wi.status = 'need_brief' then 'need_brief' when wi.status = 'queued' then 'queued' else 'assigned' end::public.assignment_result,
  coalesce(wi.assignment_reason, 'Seed assignment history.'),
  coalesce(wi.effort_point, 1),
  coalesce(wi.effort_point, 1),
  coalesce(wi.effort_point, 1),
  false,
  '{}'::jsonb
from public.work_items wi
where wi.work_type = 'creative_request'
  and not exists (
    select 1 from public.assignment_runs ar
    where ar.work_item_id = wi.id
  );

insert into public.checklist_items (work_item_id, title, is_done, sort_order, created_by_user_id, completed_at)
select wi.id, x.title, x.is_done, x.sort_order, x.created_by_user_id::uuid, case when x.is_done then now() else null end
from (
  values
    ('CR-1051', 'Storyboard locked with esport ops', true, 1, '00000000-0000-0000-0000-000000000005'),
    ('CR-1051', 'Trophy reveal shot - color graded', true, 2, '00000000-0000-0000-0000-000000000005'),
    ('CR-1051', 'Team logo plates - animated', true, 3, '00000000-0000-0000-0000-000000000005'),
    ('CR-1051', 'Date plate + sponsor lockup', false, 4, '00000000-0000-0000-0000-000000000005'),
    ('CR-1051', 'Sound mix v1 - handoff to audio', false, 5, '00000000-0000-0000-0000-000000000005'),
    ('QT-0209', 'Create Q2 root folder', true, 1, '00000000-0000-0000-0000-000000000001'),
    ('QT-0209', 'Move old files to archive', true, 2, '00000000-0000-0000-0000-000000000001'),
    ('QT-0209', 'Share new link with team', false, 3, '00000000-0000-0000-0000-000000000001')
) as x(display_id, title, is_done, sort_order, created_by_user_id)
join public.work_items wi on wi.display_id = x.display_id
where not exists (
  select 1 from public.checklist_items ci
  where ci.work_item_id = wi.id
    and ci.title = x.title
);

insert into public.comments (work_item_id, author_user_id, body)
select wi.id, x.author_user_id::uuid, x.body
from (
  values
    ('CR-1051', '00000000-0000-0000-0000-000000000005', 'First cut ready. Holding on team logo plate longer than spec.'),
    ('CR-1051', '00000000-0000-0000-0000-000000000102', 'Sponsor plate needs +0.5s to read cleanly on TikTok preview.'),
    ('CR-1051', '00000000-0000-0000-0000-000000000005', 'Adjusting now. v2 by EOD.')
) as x(display_id, author_user_id, body)
join public.work_items wi on wi.display_id = x.display_id
where not exists (
  select 1 from public.comments c
  where c.work_item_id = wi.id
    and c.author_user_id = x.author_user_id::uuid
    and c.body = x.body
);

insert into public.work_item_events (work_item_id, actor_user_id, event_type, from_status, to_status, metadata)
select wi.id, wi.requester_user_id, 'created'::public.event_type, null, wi.status, jsonb_build_object('seed', true)
from public.work_items wi
where not exists (
  select 1 from public.work_item_events e
  where e.work_item_id = wi.id
    and e.event_type = 'created'
);
