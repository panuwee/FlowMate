-- FlowMate Board delivered/archive verification.
-- Run only in a test/staging Supabase project after board_delivered_archive.sql.

-- READ-ONLY CHECKS

-- Expected: one archive_exempt_until column with data_type = timestamp with time zone.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'work_items'
  and column_name = 'archive_exempt_until';

-- Expected: three rows, all index definitions include a WHERE predicate.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'idx_work_items_board_active',
    'idx_work_items_delivered_recent',
    'idx_work_items_delivered_archived'
  )
order by indexname;

-- Expected: archive/apply is unavailable to clients; restore is authenticated-only.
select
  has_function_privilege('anon', 'public.flowmate_archive_expired_deliveries(boolean,timestamp with time zone)', 'execute') as anon_can_archive,
  has_function_privilege('authenticated', 'public.flowmate_archive_expired_deliveries(boolean,timestamp with time zone)', 'execute') as authenticated_can_archive,
  has_function_privilege('anon', 'public.flowmate_admin_restore_work_item(text,text)', 'execute') as anon_can_restore,
  has_function_privilege('authenticated', 'public.flowmate_admin_restore_work_item(text,text)', 'execute') as authenticated_can_restore;

-- Expected: write functions have prosecdef=true and proconfig contains search_path=public;
-- read RPCs have prosecdef=false (security invoker) and the same fixed search path.
select
  p.proname,
  p.prosecdef,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'flowmate_list_delivered_history',
    'flowmate_search_archived_work_items',
    'flowmate_archive_expired_deliveries',
    'flowmate_admin_restore_work_item'
  )
order by p.proname;

-- Expected: archived_delivered_in_kpi equals archived_delivered_in_base.
select
  (select count(*) from public.flowmate_kpi_work_items_v where status = 'delivered' and archived_at is not null) as archived_delivered_in_kpi,
  (select count(*) from public.work_items where status = 'delivered' and archived_at is not null) as archived_delivered_in_base;

-- Expected: no non-Delivered archived row is visible to KPI; active planning/workload stays archive-free.
select
  count(*) filter (where archived_at is not null and status <> 'delivered') as archived_non_delivered_in_kpi
from public.flowmate_kpi_work_items_v;

-- Expected: no active scheduler job before board_delivered_archive_schedule.sql is run.
do $$
declare
  v_active_count bigint := 0;
begin
  if to_regnamespace('cron') is not null and to_regclass('cron.job') is not null then
    execute $check$
      select count(*)
      from cron.job
      where jobname = 'flowmate-archive-expired-deliveries-daily'
        and active
    $check$ into v_active_count;
  end if;

  if v_active_count <> 0 then
    raise exception 'Scheduler must remain disabled during core verification';
  end if;
end;
$$;

-- TRANSACTION FIXTURES
begin;

create temporary table flowmate_board_verify_fixture (
  work_item_id uuid primary key,
  display_id text not null,
  age_days integer not null,
  owning_team_code text not null
) on commit drop;

create temporary table flowmate_board_verify_results (
  check_name text primary key,
  passed boolean not null,
  detail jsonb not null default '{}'::jsonb
) on commit drop;

-- Material fixtures use an intentionally old as_of date so normal staging
-- data cannot collide with the 59/60/61-day boundary. All writes roll back.
do $$
declare
  v_admin_id uuid;
  v_team_code text;
  v_suffix text := floor(extract(epoch from clock_timestamp()) * 1000000)::bigint::text;
begin
  select u.id into v_admin_id
  from public.users u
  where u.is_active = true and u.role = 'admin'
  order by u.created_at, u.id
  limit 1;

  if v_admin_id is null then
    raise exception 'Verification requires one active admin user';
  end if;

  select t.code into v_team_code
  from public.teams t
  where t.is_active = true
    and public.flowmate_user_can_access_team(v_admin_id, t.code)
  order by t.code
  limit 1;

  if v_team_code is null then
    raise exception 'Verification requires one active team accessible to the admin user';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);

  insert into public.work_items (
    display_id, work_type, title, requester_user_id,
    requester_team, owning_team_code, status,
    priority, due_date, delivered_at, wip_counted
  )
  select
    'QT-' || v_suffix || age_days::text,
    'quick_task'::public.work_type,
    'Board archive boundary fixture ' || age_days::text,
    v_admin_id,
    v_team_code,
    v_team_code,
    'delivered'::public.work_status,
    'normal'::public.priority_level,
    date '1999-12-31',
    timestamptz '2000-01-01 00:00:00+00' - make_interval(days => age_days),
    false
  from unnest(array[59, 60, 61]) as age_days;

  insert into flowmate_board_verify_fixture (
    work_item_id, display_id, age_days, owning_team_code
  )
  select wi.id, wi.display_id, right(wi.display_id, 2)::integer, wi.owning_team_code
  from public.work_items wi
  where wi.display_id in (
    'QT-' || v_suffix || '59',
    'QT-' || v_suffix || '60',
    'QT-' || v_suffix || '61'
  );

  insert into public.work_item_links (work_item_id, url, description, created_by_user_id)
  select work_item_id, 'https://example.com/archive-fixture', 'rollback fixture', v_admin_id
  from flowmate_board_verify_fixture where age_days = 61;

  insert into public.work_item_watchers (work_item_id, watcher_user_id, added_by_user_id)
  select work_item_id, v_admin_id, v_admin_id
  from flowmate_board_verify_fixture where age_days = 61;

  insert into public.work_item_ai_tags (work_item_id, tag, created_by_user_id)
  select work_item_id, 'archive-fixture', v_admin_id
  from flowmate_board_verify_fixture where age_days = 61;
end;
$$;

-- Expected: 59 days = false, 60 days = true, 61 days = true.
with dry_run as (
  select public.flowmate_archive_expired_deliveries(
    true, timestamptz '2000-01-01 00:00:00+00'
  ) as result
)
insert into flowmate_board_verify_results (check_name, passed, detail)
select
  'dry_run_boundary',
  bool_and(
    (f.age_days = 59 and not exists (
      select 1 from jsonb_array_elements_text(d.result -> 'candidate_ids') c(id)
      where c.id::uuid = f.work_item_id
    ))
    or
    (f.age_days in (60, 61) and exists (
      select 1 from jsonb_array_elements_text(d.result -> 'candidate_ids') c(id)
      where c.id::uuid = f.work_item_id
    ))
  ),
  jsonb_build_object('result', d.result)
from dry_run d
cross join flowmate_board_verify_fixture f
group by d.result;

-- Apply twice. Unrelated ancient backlog may remain, but the second run must
-- never select either fixture already archived by the first run.
create temporary table flowmate_board_verify_live_runs on commit drop as
with first_run as materialized (
  select public.flowmate_archive_expired_deliveries(false, timestamptz '2000-01-01 00:00:00+00') as result
), second_run as materialized (
  select public.flowmate_archive_expired_deliveries(false, timestamptz '2000-01-01 00:00:00+00') as result
  from first_run
)
select first_run.result as first_result, second_run.result as second_result
from first_run cross join second_run;

insert into flowmate_board_verify_results (check_name, passed, detail)
select
  'live_run_idempotent',
  not exists (
    select 1
    from flowmate_board_verify_fixture f
    cross join lateral jsonb_array_elements_text(r.second_result -> 'candidate_ids') c(id)
    where c.id::uuid = f.work_item_id
  ),
  jsonb_build_object('first_result', r.first_result, 'second_result', r.second_result)
from flowmate_board_verify_live_runs r;

insert into flowmate_board_verify_results (check_name, passed, detail)
select
  'live_boundary',
  bool_and(
    (f.age_days = 59 and wi.archived_at is null)
    or (f.age_days in (60, 61) and wi.archived_at = timestamptz '2000-01-01 00:00:00+00')
  ),
  jsonb_object_agg(f.age_days::text, to_jsonb(wi.archived_at))
from flowmate_board_verify_fixture f
join public.work_items wi on wi.id = f.work_item_id;

-- Expected: exception_ids contains only Delivered rows with no Delivered transition evidence.
select public.flowmate_preview_delivered_at_backfill();

-- Expected: each archived Delivered item is visible in KPI and absent from active workload joins.
select
  wi.display_id,
  exists (select 1 from public.flowmate_kpi_work_items_v k where k.id = wi.id) as included_in_kpi,
  exists (
    select 1
    from public.member_workload_v mw
    where mw.team_member_id = wi.final_owner_member_id
      and wi.archived_at is null
  ) as included_in_active_workload
from public.work_items wi
where wi.status = 'delivered'
  and wi.archived_at is not null
order by wi.display_id
limit 20;

-- Expected: the target is visible to an authenticated admin but hidden from
-- an authenticated user who belongs to another workspace. This uses the same
-- role and JWT claim shape as Supabase requests instead of a privileged read.
do $$
declare
  v_admin_id uuid;
  v_denied_user_id uuid;
  v_work_item_id uuid;
  v_allowed_visible boolean := false;
  v_denied_visible boolean := false;
begin
  select u.id into v_admin_id
  from public.users u
  where u.is_active = true and u.role = 'admin'
  order by u.created_at, u.id
  limit 1;

  select f.work_item_id into v_work_item_id
  from flowmate_board_verify_fixture f
  where f.age_days = 61;

  select u.id into v_denied_user_id
  from public.users u
  where u.is_active = true
    and u.role <> 'admin'
    and exists (
      select 1
      from public.user_team_memberships membership
      where membership.user_id = u.id
    )
    and not public.flowmate_user_can_read_work_item(u.id, v_work_item_id)
  order by u.created_at, u.id
  limit 1;

  if v_admin_id is null or v_work_item_id is null then
    raise exception 'Verification requires an active admin and the 61-day fixture';
  end if;

  if v_denied_user_id is null then
    raise exception 'Verification requires an active non-admin user in another workspace';
  end if;

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  execute 'set local role authenticated';
  select exists (
    select 1
    from public.flowmate_delivered_history_v history
    where history.id = v_work_item_id
  ) into v_allowed_visible;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_denied_user_id::text, true);
  execute 'set local role authenticated';
  select exists (
    select 1
    from public.flowmate_delivered_history_v history
    where history.id = v_work_item_id
  ) into v_denied_visible;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  insert into flowmate_board_verify_results (check_name, passed, detail)
  values (
    'workspace_isolation',
    v_allowed_visible and not v_denied_visible,
    jsonb_build_object(
      'admin_visible', v_allowed_visible,
      'other_workspace_user_visible', v_denied_visible
    )
  );
end;
$$;

-- Restore the 61-day fixture and verify workflow history, WIP, grace, audit,
-- idempotency, and child records. Every mutation is rolled back below.
do $$
declare
  v_admin_id uuid;
  v_non_admin_id uuid;
  v_work_item_id uuid;
  v_display_id text;
  v_before_status public.work_status;
  v_before_delivered_at timestamptz;
  v_previous_wip_counted boolean;
  v_after_wip_counted boolean;
  v_archive_exempt_until timestamptz;
  v_restore_metadata jsonb;
  v_before_child_counts jsonb;
  v_after_child_counts jsonb;
  v_result jsonb;
  v_denied boolean;
  v_error text;
begin
  select u.id into v_admin_id
  from public.users u
  where u.is_active = true and u.role = 'admin'
  order by u.created_at
  limit 1;

  select u.id into v_non_admin_id
  from public.users u
  where u.is_active = true
    and u.role <> 'admin'
  order by u.created_at, u.id
  limit 1;

  if v_non_admin_id is null then
    raise exception 'Verification requires one active non-admin user';
  end if;

  select wi.id, wi.display_id, wi.status, wi.delivered_at, wi.wip_counted
  into v_work_item_id, v_display_id, v_before_status, v_before_delivered_at, v_previous_wip_counted
  from flowmate_board_verify_fixture f
  join public.work_items wi on wi.id = f.work_item_id
  where f.age_days = 61;

  select jsonb_build_object(
    'links', (select count(*) from public.work_item_links where work_item_id = v_work_item_id),
    'watchers', (select count(*) from public.work_item_watchers where work_item_id = v_work_item_id),
    'ai_tags', (select count(*) from public.work_item_ai_tags where work_item_id = v_work_item_id)
  ) into v_before_child_counts;

  if v_admin_id is not null and v_display_id is not null then
    v_denied := false;
    v_error := null;
    perform set_config('request.jwt.claim.sub', v_non_admin_id::text, true);
    begin
      perform public.flowmate_admin_restore_work_item(v_display_id, 'non-admin restore must fail');
    exception when others then
      v_denied := true;
      v_error := sqlerrm;
    end;

    insert into flowmate_board_verify_results (check_name, passed, detail)
    values (
      'non_admin_restore_denied',
      v_denied,
      jsonb_build_object('error', v_error)
    );

    perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
    v_denied := false;
    v_error := null;
    begin
      perform public.flowmate_admin_restore_work_item(v_display_id, '   ');
    exception when others then
      v_denied := true;
      v_error := sqlerrm;
    end;

    insert into flowmate_board_verify_results (check_name, passed, detail)
    values (
      'empty_restore_reason_denied',
      v_denied,
      jsonb_build_object('error', v_error)
    );

    select public.flowmate_admin_restore_work_item(v_display_id, 'staging rollback fixture') into v_result;

    select wi.wip_counted, wi.archive_exempt_until
    into v_after_wip_counted, v_archive_exempt_until
    from public.work_items wi
    where wi.id = v_work_item_id;

    select e.metadata into v_restore_metadata
    from public.work_item_events e
    where e.work_item_id = v_work_item_id
      and e.metadata ->> 'admin_restore' = 'true'
    order by e.created_at desc, e.id desc
    limit 1;

    select jsonb_build_object(
      'links', (select count(*) from public.work_item_links where work_item_id = v_work_item_id),
      'watchers', (select count(*) from public.work_item_watchers where work_item_id = v_work_item_id),
      'ai_tags', (select count(*) from public.work_item_ai_tags where work_item_id = v_work_item_id)
    ) into v_after_child_counts;

    insert into flowmate_board_verify_results (check_name, passed, detail)
    values (
      'restore_preserves_invariants',
      (v_result ->> 'status')::public.work_status is not distinct from v_before_status
        and (v_result ->> 'delivered_at')::timestamptz is not distinct from v_before_delivered_at
        and v_after_wip_counted = (v_before_status = 'in_progress')
        and v_archive_exempt_until between clock_timestamp() + interval '6 days 23 hours'
                                       and clock_timestamp() + interval '7 days 1 hour'
        and v_restore_metadata ? 'previous_wip_counted'
        and v_restore_metadata -> 'previous_wip_counted' = to_jsonb(v_previous_wip_counted),
      jsonb_build_object(
        'previous_wip_counted', v_previous_wip_counted,
        'restored_wip_counted', v_after_wip_counted,
        'archive_exempt_until', v_archive_exempt_until,
        'restore_metadata', v_restore_metadata
      )
    );

    insert into flowmate_board_verify_results (check_name, passed, detail)
    values (
      'child_rows_unchanged',
      v_before_child_counts = v_after_child_counts,
      jsonb_build_object('before', v_before_child_counts, 'after', v_after_child_counts)
    );

    begin
      perform public.flowmate_admin_restore_work_item(v_display_id, 'double restore must fail');
      raise exception 'Double restore unexpectedly succeeded';
    exception when others then
      if sqlerrm <> 'Work item is not archived' then
        raise;
      end if;
    end;

    if exists (select 1 from flowmate_board_verify_results where passed = false) then
      raise exception 'One or more board verification checks failed';
    end if;
  end if;
end;
$$;

select check_name, passed, detail
from flowmate_board_verify_results
order by check_name;

-- Expected: no fixture change, archive event, restore event, or job-run row remains.
rollback;
