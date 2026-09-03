-- FlowMate Production Insights rollback verifier
-- Run after supabase/flowmate_production_insights.sql. This script inserts
-- disposable fixtures, validates view security and metrics, then rolls back.
-- The active-hours fixture includes a non-status event that must not truncate
-- active production time.

begin;

do $verify_view_security$
declare
  v_view_name text;
  v_relation_name text;
  v_is_security_invoker boolean;
begin
  foreach v_view_name in array array[
    'flowmate_production_samples_v',
    'flowmate_production_operations_v',
    'flowmate_legacy_capacity_warning_v'
  ]
  loop
    v_relation_name := format('%I.%I', 'public', v_view_name);

    select 'security_invoker=true' = any(coalesce(c.reloptions, array[]::text[]))
    into v_is_security_invoker
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = v_view_name
      and c.relkind = 'v';

    if v_is_security_invoker is distinct from true then
      raise exception 'Production Insights view % must exist with security_invoker=true', v_relation_name;
    end if;
    if has_table_privilege('anon', v_relation_name, 'select') then
      raise exception 'anon must not read Production Insights view %', v_relation_name;
    end if;
    if not has_table_privilege('authenticated', v_relation_name, 'select') then
      raise exception 'authenticated must be able to read Production Insights view %', v_relation_name;
    end if;
  end loop;
end;
$verify_view_security$;

do $fixtures$
declare
  v_admin_id uuid := '99000000-0000-0000-0000-000000000001';
  v_non_admin_id uuid := '99000000-0000-0000-0000-000000000002';
  v_leave_owner_id uuid := '99000000-0000-0000-0000-000000000101';
  v_partial_owner_id uuid := '99000000-0000-0000-0000-000000000102';
  v_precedence_owner_id uuid := '99000000-0000-0000-0000-000000000103';
  v_active_work_id uuid := '99000000-0000-0000-0000-000000001001';
  v_blocked_gap_work_id uuid := '99000000-0000-0000-0000-000000001002';
  v_full_leave_work_id uuid := '99000000-0000-0000-0000-000000001003';
  v_partial_leave_work_id uuid := '99000000-0000-0000-0000-000000001004';
  v_precedence_work_id uuid := '99000000-0000-0000-0000-000000001005';
begin
  insert into public.users (id, email, display_name, requester_team, is_active, role)
  values
    (v_admin_id, 'flowmate-production-insights-admin@example.com', 'Production Insights Admin', 'GD/VE', true, 'admin'),
    (v_non_admin_id, 'flowmate-production-insights-member@example.com', 'Production Insights Member', 'GD/VE', true, 'member')
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    requester_team = excluded.requester_team,
    is_active = excluded.is_active,
    role = excluded.role;

  insert into public.team_members (
    id, member_code, user_id, display_name, initials, discipline, discipline_short,
    skills, backup_skills, capacity_per_day, capacity_override_per_day, availability, active
  )
  values
    (v_leave_owner_id, 'PI-COMBINED-FULL', v_admin_id, 'PI Combined Full Owner', 'CF', 'GD', 'GD', array['Banner'], '{}', 8, null, 'available', true),
    (v_partial_owner_id, 'PI-PARTIAL', v_non_admin_id, 'PI Partial Owner', 'PP', 'GD', 'GD', array['Banner'], '{}', 8, null, 'available', true),
    (v_precedence_owner_id, 'PI-AVAILABILITY-LEAVE', null, 'PI Availability Leave Owner', 'AL', 'GD', 'GD', array['Banner'], '{}', 8, null, 'leave', true)
  on conflict (id) do update set
    member_code = excluded.member_code,
    user_id = excluded.user_id,
    display_name = excluded.display_name,
    skills = excluded.skills,
    capacity_override_per_day = excluded.capacity_override_per_day,
    availability = excluded.availability,
    active = excluded.active;

  insert into public.leave_requests (
    id, team_member_id, created_by_user_id, start_date, end_date,
    start_half, end_half, reason, cancelled_at
  )
  values
    (
      '99000000-0000-0000-0000-000000004001',
      v_leave_owner_id,
      v_admin_id,
      current_date,
      current_date,
      'am',
      'am',
      'Production Insights combined AM leave fixture',
      null
    ),
    (
      '99000000-0000-0000-0000-000000004002',
      v_partial_owner_id,
      v_admin_id,
      current_date,
      current_date,
      'pm',
      'pm',
      'Production Insights active partial-leave context fixture',
      null
    ),
    (
      '99000000-0000-0000-0000-000000004003',
      v_leave_owner_id,
      v_admin_id,
      current_date,
      current_date,
      'pm',
      'pm',
      'Production Insights combined PM leave fixture',
      null
    ),
    (
      '99000000-0000-0000-0000-000000004004',
      v_precedence_owner_id,
      v_admin_id,
      current_date,
      current_date,
      'pm',
      'pm',
      'Production Insights availability precedence partial request fixture',
      null
    )
  on conflict (id) do update set
    team_member_id = excluded.team_member_id,
    created_by_user_id = excluded.created_by_user_id,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    start_half = excluded.start_half,
    end_half = excluded.end_half,
    reason = excluded.reason,
    cancelled_at = excluded.cancelled_at;

  insert into public.work_items (
    id, display_id, work_type, title, requester_user_id, requester_team,
    assignee_user_id, final_owner_member_id, status, priority, due_date,
    effort_point, delivery_link, delivered_at, archived_at, wip_counted
  )
  values
    (
      v_active_work_id, 'CR-990001', 'creative_request', 'Production insights 10 active hours fixture',
      v_admin_id, 'GD/VE', v_admin_id, v_leave_owner_id, 'delivered', 'high', current_date - 3,
      4, 'https://example.com/production-insights-10h', timestamptz '2026-09-01 13:00:00+00',
      null, false
    ),
    (
      v_blocked_gap_work_id, 'CR-990002', 'creative_request', 'Production insights blocked gap fixture',
      v_admin_id, 'GD/VE', v_non_admin_id, v_partial_owner_id, 'delivered', 'normal', current_date - 1,
      6, 'https://example.com/production-insights-blocked-gap', timestamptz '2026-09-02 11:00:00+00',
      null, false
    ),
    (
      v_full_leave_work_id, 'CR-990003', 'creative_request', 'Production insights active full-leave fixture',
      v_admin_id, 'GD/VE', v_admin_id, v_leave_owner_id, 'in_progress', 'high', current_date + 2,
      4, null, null, null, true
    ),
    (
      v_partial_leave_work_id, 'CR-990004', 'creative_request', 'Production insights active partial-leave fixture',
      v_admin_id, 'GD/VE', v_non_admin_id, v_partial_owner_id, 'assigned', 'normal', current_date + 2,
      4, null, null, null, false
    ),
    (
      v_precedence_work_id, 'CR-990005', 'creative_request', 'Production insights availability precedence fixture',
      v_admin_id, 'GD/VE', v_admin_id, v_precedence_owner_id, 'assigned', 'high', current_date + 2,
      4, null, null, null, false
    )
  on conflict (id) do update set
    display_id = excluded.display_id,
    work_type = excluded.work_type,
    title = excluded.title,
    requester_user_id = excluded.requester_user_id,
    requester_team = excluded.requester_team,
    assignee_user_id = excluded.assignee_user_id,
    final_owner_member_id = excluded.final_owner_member_id,
    status = excluded.status,
    priority = excluded.priority,
    due_date = excluded.due_date,
    effort_point = excluded.effort_point,
    delivery_link = excluded.delivery_link,
    delivered_at = excluded.delivered_at,
    archived_at = excluded.archived_at,
    wip_counted = excluded.wip_counted;

  insert into public.creative_request_details (
    work_item_id, asset_type, asset_subtype, asset_count,
    platforms, size_format, brief_link, brief_completeness_status
  )
  values
    (v_active_work_id, 'static-graphic', 'Banner', 1, array['facebook'], '1200x1200', 'https://example.com/brief-990001', 'new'),
    (v_blocked_gap_work_id, 'static-graphic', 'Banner', 1, array['facebook'], '1200x1200', 'https://example.com/brief-990002', 'new'),
    (v_full_leave_work_id, 'static-graphic', 'PI-COMBINED-FULL', 1, array['facebook'], '1200x1200', 'https://example.com/brief-990003', 'new'),
    (v_partial_leave_work_id, 'static-graphic', 'PI-PARTIAL', 1, array['facebook'], '1200x1200', 'https://example.com/brief-990004', 'new'),
    (v_precedence_work_id, 'static-graphic', 'PI-AVAILABILITY-LEAVE', 1, array['facebook'], '1200x1200', 'https://example.com/brief-990005', 'new')
  on conflict (work_item_id) do update set
    asset_type = excluded.asset_type,
    asset_subtype = excluded.asset_subtype,
    asset_count = excluded.asset_count,
    platforms = excluded.platforms,
    size_format = excluded.size_format,
    brief_link = excluded.brief_link,
    brief_completeness_status = excluded.brief_completeness_status;

  insert into public.work_item_events (
    id, work_item_id, actor_user_id, event_type, from_status, to_status, created_at, metadata
  )
  values
    ('99000000-0000-0000-0000-000000002001', v_active_work_id, v_admin_id, 'status_changed', 'assigned', 'in_progress', timestamptz '2026-09-01 01:00:00+00', '{}'::jsonb),
    ('99000000-0000-0000-0000-000000002007', v_active_work_id, v_admin_id, 'commented', null, null, timestamptz '2026-09-01 03:00:00+00', jsonb_build_object('fixture', 'non-status event must not truncate active production time')),
    ('99000000-0000-0000-0000-000000002002', v_active_work_id, v_admin_id, 'status_changed', 'in_progress', 'review', timestamptz '2026-09-01 06:00:00+00', '{}'::jsonb),
    ('99000000-0000-0000-0000-000000002003', v_active_work_id, v_admin_id, 'status_changed', 'review', 'in_progress', timestamptz '2026-09-01 08:00:00+00', '{}'::jsonb),
    ('99000000-0000-0000-0000-000000002004', v_blocked_gap_work_id, v_admin_id, 'status_changed', 'assigned', 'in_progress', timestamptz '2026-09-02 01:00:00+00', jsonb_build_object('fixture', 'blocked gap')),
    ('99000000-0000-0000-0000-000000002005', v_blocked_gap_work_id, v_admin_id, 'blocked', 'in_progress', 'blocked', timestamptz '2026-09-02 03:00:00+00', jsonb_build_object('fixture', 'blocked gap')),
    ('99000000-0000-0000-0000-000000002006', v_blocked_gap_work_id, v_admin_id, 'status_changed', 'blocked', 'in_progress', timestamptz '2026-09-02 09:00:00+00', jsonb_build_object('fixture', 'blocked gap'))
  on conflict (id) do update set
    work_item_id = excluded.work_item_id,
    actor_user_id = excluded.actor_user_id,
    event_type = excluded.event_type,
    from_status = excluded.from_status,
    to_status = excluded.to_status,
    created_at = excluded.created_at,
    metadata = excluded.metadata;

  insert into public.assignment_runs (
    id, work_item_id, triggered_by, suggested_owner_member_id, final_owner_member_id,
    result, reason, effort_point, raw_range_min, raw_range_max, was_capped,
    capacity_snapshot, ran_at
  )
  values (
    '99000000-0000-0000-0000-000000003001',
    v_active_work_id,
    'submit',
    v_leave_owner_id,
    v_leave_owner_id,
    'assigned',
    'Production Insights legacy warning fixture',
    4,
    1,
    4,
    false,
    jsonb_build_object('warnings', jsonb_build_array(jsonb_build_object('code', 'deadline_capacity_gap'))),
    timestamptz '2026-09-01 00:00:00+00'
  )
  on conflict (id) do update set
    capacity_snapshot = excluded.capacity_snapshot,
    ran_at = excluded.ran_at;
end;
$fixtures$;

do $verify_non_admin$
declare
  v_non_admin_id uuid := '99000000-0000-0000-0000-000000000002';
  v_visible_count integer;
begin
  perform set_config('request.jwt.claim.sub', v_non_admin_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_non_admin_id)::text, true);
  execute 'set local role authenticated';

  select count(*)
  into v_visible_count
  from public.flowmate_production_samples_v
  where display_id in ('CR-990001', 'CR-990002');

  execute 'reset role';

  if v_visible_count <> 0 then
    raise exception 'Expected non-admin Production Insights read to return zero rows, got %', v_visible_count;
  end if;
end;
$verify_non_admin$;

do $verify$
declare
  v_admin_id uuid := '99000000-0000-0000-0000-000000000001';
  v_active_hours numeric;
  v_blocked_gap_hours numeric;
  v_full_leave_task_count integer;
  v_full_leave_count integer;
  v_full_leave_partial_count integer;
  v_partial_leave_task_count integer;
  v_partial_on_leave_count integer;
  v_partial_leave_count integer;
  v_precedence_task_count integer;
  v_precedence_leave_count integer;
  v_precedence_partial_count integer;
begin
  if has_table_privilege('anon', 'public.flowmate_production_samples_v', 'select') then
    raise exception 'anon must not read Production Insights';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', v_admin_id)::text, true);
  execute 'set local role authenticated';

  select active_production_hours
  into v_active_hours
  from public.flowmate_production_samples_v
  where display_id = 'CR-990001';

  if v_active_hours is distinct from 10::numeric then
    raise exception 'Expected 10 active hours, got %', v_active_hours;
  end if;

  select active_production_hours
  into v_blocked_gap_hours
  from public.flowmate_production_samples_v
  where display_id = 'CR-990002';

  if v_blocked_gap_hours is distinct from 4::numeric then
    raise exception 'Expected blocked gap fixture to exclude blocked idle time, got %', v_blocked_gap_hours;
  end if;

  select task_count, owner_on_leave_count, owner_partial_count
  into v_full_leave_task_count, v_full_leave_count, v_full_leave_partial_count
  from public.flowmate_production_operations_v
  where team = 'GD/VE'
    and asset_subtype = 'PI-COMBINED-FULL'
    and priority = 'high'
    and status = 'in_progress';

  if v_full_leave_task_count is distinct from 1
     or v_full_leave_count is distinct from 1
     or v_full_leave_partial_count is distinct from 0 then
    raise exception 'Expected active full-leave request context: Expected separate AM and PM requests to produce full-leave context';
  end if;

  select task_count, owner_on_leave_count, owner_partial_count
  into v_partial_leave_task_count, v_partial_on_leave_count, v_partial_leave_count
  from public.flowmate_production_operations_v
  where team = 'GD/VE'
    and asset_subtype = 'PI-PARTIAL'
    and priority = 'normal'
    and status = 'assigned';

  if v_partial_leave_task_count is distinct from 1
     or v_partial_on_leave_count is distinct from 0
     or v_partial_leave_count is distinct from 1 then
    raise exception 'Expected active partial-leave request context';
  end if;

  select task_count, owner_on_leave_count, owner_partial_count
  into v_precedence_task_count, v_precedence_leave_count, v_precedence_partial_count
  from public.flowmate_production_operations_v
  where team = 'GD/VE'
    and asset_subtype = 'PI-AVAILABILITY-LEAVE'
    and priority = 'high'
    and status = 'assigned';

  if v_precedence_task_count is distinct from 1
     or v_precedence_leave_count is distinct from 1
     or v_precedence_partial_count is distinct from 0 then
    raise exception 'Expected availability leave to override partial request context';
  end if;

  if not exists (
    select 1
    from public.flowmate_legacy_capacity_warning_v
    where team = 'GD/VE'
      and warning_code = 'deadline_capacity_gap'
      and warning_count >= 1
  ) then
    raise exception 'Expected deadline_capacity_gap legacy warning fixture';
  end if;

  if exists (
    select 1
    from public.flowmate_production_samples_v
    where active_production_hours <= 0
  ) then
    raise exception 'Non-positive samples must be excluded';
  end if;

  execute 'reset role';
end;
$verify$;

rollback;
