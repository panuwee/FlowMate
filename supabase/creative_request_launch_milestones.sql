-- Creative Request Launch Milestones
-- Canonical self-run migration + verification bundle.
--
-- Scope:
--   * Asset First Draft Due = Launch Date minus 7 Monday-Friday working days.
--   * Asset Final/Approved Due = Launch Date minus 5 Monday-Friday working days.
--   * Thai public holidays that fall on weekdays remain working days by design.
--   * Capacity pressure may raise urgent/risk signals but never rebases milestones.
--
-- Provenance (canonical source definitions):
--   supabase/schema.sql
--   supabase/rpc_assignment.sql
--   supabase/team_schedule_weekly_capacity.sql
--   supabase/trello_asana_hybrid_backend.sql
--
-- Run the whole file as one script. It contains no psql-only meta commands.
-- This file does not connect to a project by itself and was not run remotely.

-- ============================================================================
-- 1. PREFLIGHT (read-only; aborts before migration when required objects differ)
-- ============================================================================

select
  current_database() as database_name,
  current_user as executing_role,
  now() as checked_at;

do $preflight$
declare
  v_missing text[];
begin
  select array_agg(required_object order by required_object)
  into v_missing
  from (
    values
      ('table public.work_items', to_regclass('public.work_items') is not null),
      ('view public.flowmate_delivered_history_v', to_regclass('public.flowmate_delivered_history_v') is not null),
      ('view public.flowmate_kpi_work_items_v', to_regclass('public.flowmate_kpi_work_items_v') is not null),
      ('view public.planning_work_items_v', to_regclass('public.planning_work_items_v') is not null),
      ('view public.flowmate_team_schedule_v', to_regclass('public.flowmate_team_schedule_v') is not null),
      (
        'function public.flowmate_subtract_working_days(date, integer)',
        to_regprocedure('public.flowmate_subtract_working_days(date,integer)') is not null
      ),
      (
        'function public.create_creative_request(uuid, text, text, text, public.asset_type, text, text[], text, text, text, text, public.priority_level, text, date, date, integer, date, time, public.asset_type, text, integer)',
        to_regprocedure('public.create_creative_request(uuid,text,text,text,public.asset_type,text,text[],text,text,text,text,public.priority_level,text,date,date,integer,date,time,public.asset_type,text,integer)') is not null
      ),
      (
        'function public.flowmate_run_assignment(uuid, public.assignment_trigger)',
        to_regprocedure('public.flowmate_run_assignment(uuid,public.assignment_trigger)') is not null
      ),
      (
        'function public.flowmate_change_creative_assignee(text, uuid, text)',
        to_regprocedure('public.flowmate_change_creative_assignee(text,uuid,text)') is not null
      )
  ) as requirements(required_object, is_present)
  where not is_present;

  if v_missing is not null then
    raise exception
      'Creative Request launch milestone preflight failed. Missing: %',
      array_to_string(v_missing, ', ');
  end if;
end;
$preflight$;

select
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name in (
    'work_items',
    'flowmate_delivered_history_v',
    'flowmate_kpi_work_items_v',
    'planning_work_items_v',
    'flowmate_team_schedule_v'
  )
  and c.column_name = 'final_approved_due_date'
order by c.table_name;

-- ============================================================================
-- 2. TRANSACTION MIGRATION
-- ============================================================================

begin;

-- Fail fast rather than holding an ACCESS EXCLUSIVE table lock indefinitely.
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.work_items
  add column if not exists final_approved_due_date date;

-- Monday-Friday helper. Public holidays on weekdays intentionally remain
-- working days for this Creative Request milestone contract.
create or replace function public.flowmate_subtract_working_days(
  p_date date,
  p_working_days integer
) returns date
language plpgsql
immutable
as $$
declare
  v_cursor date := p_date;
  v_remaining integer := greatest(0, coalesce(p_working_days, 0));
begin
  -- Monday-Friday are working days; Thai public holidays on weekdays count.
  if v_cursor is null then
    return null;
  end if;

  while v_remaining > 0 loop
    v_cursor := v_cursor - 1;
    if extract(isodow from v_cursor) between 1 and 5 then
      v_remaining := v_remaining - 1;
    end if;
  end loop;

  return public.flowmate_next_working_day(v_cursor);
end;
$$;

-- Canonical Creative Request creation RPC. Existing rows are not backfilled;
-- every newly created request derives both milestones from Launch Date.
create or replace function public.create_creative_request(
  p_actor_user_id uuid,
  p_title text,
  p_requester_team text,
  p_campaign_name text,
  p_asset_type public.asset_type,
  p_asset_subtype text,
  p_platforms text[],
  p_size_format text,
  p_brief_link text,
  p_brief_note text default null,
  p_reference_link text default null,
  p_priority public.priority_level default 'normal',
  p_urgent_reason text default null,
  p_due_date date default null,
  p_launch_date date default null,
  p_asset_count integer default 1,
  p_publish_date date default null,
  p_publish_time time default null,
  p_asset_type_2 public.asset_type default null,
  p_asset_subtype_2 text default null,
  p_asset_count_2 integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor         public.users%rowtype;
  v_now_bkk       timestamp := timezone('Asia/Bangkok', now());
  v_today         date := timezone('Asia/Bangkok', now())::date;
  v_next_number   integer;
  v_display_id    text;
  v_work_item_id  uuid;
  v_assignment    jsonb;
  v_due_date      date;
  v_final_approved_due_date date;
  v_launch_date   date;
  v_earliest_feasible_due_date date;
  v_first_draft_at_risk boolean := false;
  v_requested_priority public.priority_level;
  v_urgent_reason text;
  v_time_pressure_effort integer;
  v_time_pressure_working_days integer;
  v_time_pressure_capacity integer;
  v_time_pressure_asset_count integer;
  v_time_pressure_asset_count_2 integer;
  v_asset_subtype_2 text;
  v_production_start date;
  v_production_start_half text := 'am';
  v_midday_cutoff time := time '12:00';
  v_production_cutoff time := time '15:00';
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;
  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Creative request title is required';
  end if;

  if greatest(1, coalesce(p_asset_count, 1)) <> coalesce(p_asset_count, 1) then
    raise exception 'Asset Count must be at least 1';
  end if;
  v_time_pressure_asset_count := greatest(1, coalesce(p_asset_count, 1));
  v_asset_subtype_2 := nullif(trim(coalesce(p_asset_subtype_2, '')), '');
  if v_asset_subtype_2 is not null then
    if p_asset_type_2 is null then
      raise exception 'Type / Skill 2 requires an asset type';
    end if;
    if p_asset_count_2 is null or p_asset_count_2 < 1 then
      raise exception 'Asset Count 2 must be at least 1 when Type / Skill 2 is selected';
    end if;
    if p_asset_count_2 > 999 then
      raise exception 'Asset Count 2 must be at most 999';
    end if;
    v_time_pressure_asset_count_2 := p_asset_count_2;
  elsif p_asset_type_2 is not null or p_asset_count_2 is not null then
    raise exception 'Type / Skill 2 is required when Asset Count 2 is provided';
  end if;

  v_launch_date := coalesce(p_launch_date, p_due_date, v_today + 7);
  if extract(isodow from v_today) not between 1 and 5 then
    v_production_start := public.flowmate_next_working_day(v_today);
    v_production_start_half := 'am';
  elsif v_now_bkk::time >= v_production_cutoff then
    v_production_start := public.flowmate_next_working_day(v_today + 1);
    v_production_start_half := 'am';
  elsif v_now_bkk::time >= v_midday_cutoff then
    v_production_start := public.flowmate_next_working_day(v_today);
    v_production_start_half := 'pm';
  else
    v_production_start := public.flowmate_next_working_day(v_today);
    v_production_start_half := 'am';
  end if;

  v_requested_priority := coalesce(p_priority, 'normal');
  v_urgent_reason := nullif(trim(coalesce(p_urgent_reason, '')), '');
  v_time_pressure_effort := public.flowmate_effort_for_subtype(p_asset_type, p_asset_subtype, v_time_pressure_asset_count);
  if v_asset_subtype_2 is not null then
    v_time_pressure_effort := v_time_pressure_effort + public.flowmate_effort_for_subtype(p_asset_type_2, v_asset_subtype_2, v_time_pressure_asset_count_2);
  end if;

  -- Creative Request milestones are fixed from Launch Date. Capacity pressure
  -- raises urgent/risk signals but never rebases either generated milestone.
  v_due_date := public.flowmate_subtract_working_days(v_launch_date, 7);
  v_final_approved_due_date := public.flowmate_subtract_working_days(v_launch_date, 5);
  v_earliest_feasible_due_date := public.flowmate_earliest_capacity_date(
    v_production_start,
    v_production_start_half,
    v_time_pressure_effort,
    4
  );
  v_first_draft_at_risk := v_earliest_feasible_due_date > v_due_date;

  if v_due_date < v_production_start then
    v_time_pressure_working_days := 0;
    v_time_pressure_capacity := 0;
  else
    v_time_pressure_working_days := public.flowmate_count_working_days(v_production_start, v_due_date);
    v_time_pressure_capacity := public.flowmate_count_capacity_buckets(v_production_start, v_production_start_half, v_due_date) * 4;
  end if;

  if v_requested_priority <> 'urgent'
     and (v_time_pressure_effort > v_time_pressure_capacity or v_first_draft_at_risk) then
    v_requested_priority := 'urgent';
    v_urgent_reason := coalesce(
      v_urgent_reason,
      case
        when v_time_pressure_effort > v_time_pressure_capacity then
          'Auto urgent: requested effort ' || v_time_pressure_effort::text || ' pt exceeds ' ||
          v_time_pressure_working_days::text || ' working day(s) / ' ||
          v_time_pressure_capacity::text || ' pt before 1st Draft.'
        else
          'Auto urgent: earliest feasible date ' || to_char(v_earliest_feasible_due_date, 'Mon DD, YYYY') ||
          ' misses Asset First Draft Due ' || to_char(v_due_date, 'Mon DD, YYYY') || '.'
      end
    );
  end if;

  perform pg_advisory_xact_lock(hashtext('flowmate_creative_request_display_id'));

  select coalesce(max((substring(display_id from 4))::integer), 1000) + 1
    into v_next_number
    from public.work_items
   where display_id ~ '^CR-[0-9]{4,}$';

  v_display_id := 'CR-' || lpad(v_next_number::text, 4, '0');

  insert into public.work_items (
    display_id, work_type, title, campaign_name,
    description,
    requester_user_id, requester_team,
    status, priority, urgent_reason,
    due_date, final_approved_due_date, launch_date, publish_date, publish_time,
    -- effort_point intentionally null; engine writes it.
    effort_point, final_owner_member_id, needs_split, review_round, wip_counted
  ) values (
    v_display_id, 'creative_request', trim(p_title), nullif(trim(coalesce(p_campaign_name,'')), ''),
    nullif(trim(coalesce(p_brief_note,'')), ''),
    v_actor_id, nullif(trim(coalesce(p_requester_team,'')), ''),
    'new', v_requested_priority, v_urgent_reason,
    v_due_date, v_final_approved_due_date, v_launch_date, p_publish_date, p_publish_time,
    null, null, false, 0, false
  ) returning id into v_work_item_id;

  insert into public.creative_request_details (
    work_item_id, asset_type, asset_subtype, asset_count, asset_type_2, asset_subtype_2, asset_count_2, platforms, size_format,
    brief_link, reference_link, brief_completeness_status
  ) values (
    v_work_item_id, p_asset_type, trim(coalesce(p_asset_subtype, '')), v_time_pressure_asset_count, p_asset_type_2, v_asset_subtype_2, v_time_pressure_asset_count_2,
    coalesce(p_platforms, '{}'::text[]), trim(coalesce(p_size_format, '')),
    trim(coalesce(p_brief_link, '')), nullif(trim(coalesce(p_reference_link, '')), ''),
    'new'
  );

  insert into public.work_item_events (
    work_item_id, actor_user_id, event_type, to_status, metadata
  ) values (
    v_work_item_id, v_actor_id, 'created', 'new',
    jsonb_build_object('source', 'rpc', 'work_type', 'creative_request')
  );

  v_assignment := public.flowmate_run_assignment(v_work_item_id, 'submit');

  return jsonb_build_object(
    'id',         v_work_item_id,
    'display_id', v_display_id,
    'assignment', v_assignment
  );
end;
$$;

-- Canonical assignment surfaces. Both emit the fixed T-7 warning only for
-- Creative Requests; Quick Task due-date behavior is unchanged.
create or replace function public.flowmate_run_assignment(
  p_work_item_id uuid,
  p_trigger public.assignment_trigger
) returns jsonb
language plpgsql
security definer
set search_path = public
as $assignment$
declare
  v_work public.work_items%rowtype;
  v_detail public.creative_request_details%rowtype;
  v_from_status public.work_status;
  v_brief_missing text;
  v_effort integer;
  v_required_skill text;
  v_required_skill_2 text;
  v_context text := 'ops_marketing';
  v_today date := timezone('Asia/Bangkok', now())::date;
  v_now_bkk timestamp := timezone('Asia/Bangkok', now());
  v_start date;
  v_start_half text := 'am';
  v_end date;
  v_owner_id uuid;
  v_owner_user_id uuid;
  v_owner_code text;
  v_owner_name text;
  v_availability text;
  v_skill_rank integer;
  v_window_capacity numeric;
  v_allocated_points numeric;
  v_projected_ratio numeric;
  v_wip_now integer;
  v_wip_limit integer;
  v_overdue_count integer;
  v_leave_fraction numeric;
  v_leave_bucket_count integer;
  v_full_leave_bucket_count integer;
  v_window_bucket_count integer;
  v_warnings jsonb := '[]'::jsonb;
  v_reason text;
  v_snapshot jsonb;
  v_needs_split boolean;
begin
  perform pg_advisory_xact_lock(hashtext('flowmate_assignment_engine'));

  select * into v_work
  from public.work_items
  where id = p_work_item_id
  for update;

  if v_work.id is null then
    raise exception 'Work item not found';
  end if;
  if v_work.work_type <> 'creative_request' then
    raise exception 'Assignment engine is for creative requests only';
  end if;

  select * into v_detail
  from public.creative_request_details
  where work_item_id = p_work_item_id;

  if v_detail.work_item_id is null then
    raise exception 'Creative request details missing for %', v_work.display_id;
  end if;

  v_from_status := v_work.status;
  v_brief_missing := public.flowmate_brief_missing_reason(p_work_item_id);

  if v_brief_missing is not null then
    delete from public.flowmate_capacity_allocations
    where work_item_id = p_work_item_id;

    update public.work_items
    set status = 'need_brief',
        assignment_reason = v_brief_missing,
        effort_point = null,
        final_owner_member_id = null,
        needs_split = false,
        wip_counted = false,
        updated_at = now()
    where id = p_work_item_id;

    update public.creative_request_details
    set brief_completeness_status = 'need_brief',
        brief_missing_reason = v_brief_missing,
        updated_at = now()
    where work_item_id = p_work_item_id;

    insert into public.assignment_runs (
      work_item_id, triggered_by, result, reason, effort_point,
      raw_range_min, raw_range_max, was_capped, capacity_snapshot
    ) values (
      p_work_item_id, p_trigger, 'need_brief', v_brief_missing, 1,
      1, 1, false, jsonb_build_object('warnings', '[]'::jsonb)
    );

    insert into public.work_item_events (
      work_item_id, event_type, from_status, to_status, metadata
    ) values (
      p_work_item_id, 'brief_checked', v_from_status, 'need_brief',
      jsonb_build_object(
        'result', 'need_brief',
        'trigger', p_trigger::text,
        'warnings', '[]'::jsonb
      )
    );

    return jsonb_build_object(
      'result', 'need_brief',
      'reason', v_brief_missing,
      'warnings', '[]'::jsonb
    );
  end if;

  v_effort := public.flowmate_effort_for_subtype(
    v_detail.asset_type,
    v_detail.asset_subtype,
    v_detail.asset_count
  );
  if nullif(trim(coalesce(v_detail.asset_subtype_2, '')), '') is not null then
    v_effort := v_effort + public.flowmate_effort_for_subtype(
      v_detail.asset_type_2,
      v_detail.asset_subtype_2,
      v_detail.asset_count_2
    );
  end if;

  v_required_skill := public.flowmate_normalize_creative_skill(
    v_detail.asset_type,
    v_detail.asset_subtype
  );
  v_required_skill_2 := case
    when nullif(trim(coalesce(v_detail.asset_subtype_2, '')), '') is null then null
    else public.flowmate_normalize_creative_skill(
      v_detail.asset_type_2,
      v_detail.asset_subtype_2
    )
  end;
  v_needs_split := coalesce(v_work.needs_split, false) or v_detail.asset_type = 'hybrid';

  select case
    when lower(coalesce(v_work.requester_team, '')) in ('esport', 'esports')
      or exists (
        select 1
        from public.team_members requester_tm
        where requester_tm.user_id = v_work.requester_user_id
          and (
            lower(requester_tm.member_code) = any (array['ben','net','peak','pluem'])
            or lower(coalesce(requester_tm.discipline, '')) in ('esport','esports')
            or lower(coalesce(requester_tm.discipline_short, '')) in ('esport','esports')
          )
      ) then 'esport'
    else 'ops_marketing'
  end into v_context;

  if extract(isodow from v_today) not between 1 and 5 then
    v_start := public.flowmate_next_working_day(v_today);
  elsif v_now_bkk::time >= time '15:00' then
    v_start := public.flowmate_next_working_day(v_today + 1);
  elsif v_now_bkk::time >= time '12:00' then
    v_start := public.flowmate_next_working_day(v_today);
    v_start_half := 'pm';
  else
    v_start := public.flowmate_next_working_day(v_today);
  end if;
  v_end := greatest(v_start, coalesce(v_work.due_date, v_start));

  with candidates as (
    select
      tm.id,
      tm.user_id,
      tm.member_code,
      tm.display_name,
      tm.availability::text as availability,
      tm.wip_limit,
      case
        when v_context = 'esport' and lower(tm.member_code) in ('ploy','vee') then 0
        when v_context = 'esport' then 1
        when lower(tm.member_code) in ('pond','jo','tong','eye') then 0
        else 1
      end as context_rank,
      case
        when v_required_skill_2 is null
          and v_required_skill = any(coalesce(tm.skills, '{}'::text[])) then 0
        when v_required_skill_2 is not null
          and v_required_skill = any(coalesce(tm.skills, '{}'::text[]))
          and v_required_skill_2 = any(coalesce(tm.skills, '{}'::text[])) then 0
        when v_required_skill_2 is not null
          and (
            v_required_skill = any(coalesce(tm.skills, '{}'::text[]))
            or v_required_skill_2 = any(coalesce(tm.skills, '{}'::text[]))
          ) then 1
        when v_required_skill = any(
          coalesce(tm.skills, '{}'::text[]) || coalesce(tm.backup_skills, '{}'::text[])
        ) and (
          v_required_skill_2 is null
          or v_required_skill_2 = any(
            coalesce(tm.skills, '{}'::text[]) || coalesce(tm.backup_skills, '{}'::text[])
          )
        ) then 2
        else 3
      end as skill_rank,
      case
        when tm.availability = 'leave'
          or (
            metrics.window_bucket_count > 0
            and metrics.full_leave_bucket_count = metrics.window_bucket_count
          ) then 2
        when tm.availability = 'partial'
          or metrics.leave_bucket_count > 0 then 1
        else 0
      end as availability_rank,
      metrics.window_capacity,
      metrics.allocated_points,
      case
        when metrics.window_capacity > 0
          then (metrics.allocated_points + v_effort) / metrics.window_capacity
        else 999999::numeric
      end as projected_ratio,
      metrics.wip_now,
      metrics.overdue_count,
      metrics.leave_fraction,
      metrics.leave_bucket_count,
      metrics.full_leave_bucket_count,
      metrics.window_bucket_count
    from public.team_members tm
    join public.users linked_user
      on linked_user.id = tm.user_id
     and linked_user.is_active = true
    cross join lateral (
      select
        coalesce(sum(
          greatest(
            0::numeric,
            (case
              when tm.availability = 'leave' then 0::numeric
              when tm.availability = 'partial' then coalesce(tm.capacity_override_per_day, 0)
              else tm.capacity_per_day
            end / 2) * (1 - public.flowmate_leave_fraction_for_bucket(
              tm.id, b.bucket_date, b.bucket_half
            ))
          )
        ), 0) as window_capacity,
        coalesce((
          select sum(a.capacity_point)
          from public.flowmate_capacity_allocations a
          join public.work_items allocated_wi on allocated_wi.id = a.work_item_id
          where a.team_member_id = tm.id
            and a.work_item_id <> p_work_item_id
            and a.bucket_date between v_start and v_end
            and allocated_wi.work_type = 'creative_request'
            and allocated_wi.status in ('assigned', 'in_progress', 'review', 'blocked')
        ), 0) as allocated_points,
        coalesce((
          select count(*)
          from public.work_items wip_wi
          where wip_wi.final_owner_member_id = tm.id
            and wip_wi.id <> p_work_item_id
            and wip_wi.status = 'in_progress'
            and wip_wi.wip_counted = true
        ), 0)::integer as wip_now,
        coalesce((
          select count(*)
          from public.work_items overdue_wi
          where overdue_wi.final_owner_member_id = tm.id
            and overdue_wi.id <> p_work_item_id
            and overdue_wi.status in ('assigned', 'in_progress', 'review', 'blocked')
            and overdue_wi.due_date < v_today
        ), 0)::integer as overdue_count,
        coalesce(max(public.flowmate_leave_fraction_for_bucket(
          tm.id, b.bucket_date, b.bucket_half
        )), 0) as leave_fraction,
        count(*) filter (
          where public.flowmate_leave_fraction_for_bucket(
            tm.id, b.bucket_date, b.bucket_half
          ) > 0
            and exists (
              select 1
              from public.leave_requests active_leave
              where active_leave.team_member_id = tm.id
                and active_leave.cancelled_at is null
                and active_leave.start_date <= b.bucket_date
                and active_leave.end_date >= b.bucket_date
            )
        )::integer as leave_bucket_count,
        count(*) filter (
          where public.flowmate_leave_fraction_for_bucket(
            tm.id, b.bucket_date, b.bucket_half
          ) >= 1
            and exists (
              select 1
              from public.leave_requests active_leave
              where active_leave.team_member_id = tm.id
                and active_leave.cancelled_at is null
                and active_leave.start_date <= b.bucket_date
                and active_leave.end_date >= b.bucket_date
            )
        )::integer as full_leave_bucket_count,
        count(*)::integer as window_bucket_count
      from (
        select g.d::date as bucket_date, halves.bucket_half
        from generate_series(v_start, v_end, interval '1 day') as g(d)
        cross join (values ('am'::text), ('pm'::text)) as halves(bucket_half)
        where extract(isodow from g.d) between 1 and 5
          and (g.d::date > v_start or v_start_half = 'am' or halves.bucket_half = 'pm')
      ) b
    ) metrics
    where tm.active = true
      and public.flowmate_is_gdve_member_code(tm.member_code)
  )
  select
    c.id,
    c.user_id,
    c.member_code,
    c.display_name,
    c.availability,
    c.skill_rank,
    c.window_capacity,
    c.allocated_points,
    c.projected_ratio,
    c.wip_now,
    c.wip_limit,
    c.overdue_count,
    c.leave_fraction,
    c.leave_bucket_count,
    c.full_leave_bucket_count,
    c.window_bucket_count
  into
    v_owner_id,
    v_owner_user_id,
    v_owner_code,
    v_owner_name,
    v_availability,
    v_skill_rank,
    v_window_capacity,
    v_allocated_points,
    v_projected_ratio,
    v_wip_now,
    v_wip_limit,
    v_overdue_count,
    v_leave_fraction,
    v_leave_bucket_count,
    v_full_leave_bucket_count,
    v_window_bucket_count
  from candidates c
  order by
    c.context_rank,
    c.skill_rank,
    c.availability_rank,
    c.projected_ratio,
    c.allocated_points,
    c.wip_now,
    c.overdue_count,
    lower(c.member_code)
  limit 1;

  if v_owner_id is null then
    v_reason := 'Unassigned: no active linked GD/VE candidate exists.';

    delete from public.flowmate_capacity_allocations
    where work_item_id = p_work_item_id;

    update public.work_items
    set status = 'unassigned',
        effort_point = v_effort,
        final_owner_member_id = null,
        assignment_reason = v_reason,
        needs_split = v_needs_split,
        wip_counted = false,
        updated_at = now()
    where id = p_work_item_id;

    v_snapshot := jsonb_build_object(
      'warnings', '[]'::jsonb,
      'hard_candidate_count', 0,
      'window_start', v_start,
      'window_end', v_end
    );

    insert into public.assignment_runs (
      work_item_id, triggered_by, result, reason, effort_point,
      raw_range_min, raw_range_max, was_capped, capacity_snapshot
    ) values (
      p_work_item_id, p_trigger, 'unassigned', v_reason, v_effort,
      v_effort, v_effort, false, v_snapshot
    );

    insert into public.work_item_events (
      work_item_id, event_type, from_status, to_status, metadata
    ) values (
      p_work_item_id, 'assignment_ran', v_from_status, 'unassigned',
      jsonb_build_object(
        'result', 'unassigned',
        'trigger', p_trigger::text,
        'effort', v_effort,
        'warnings', '[]'::jsonb
      )
    );

    return jsonb_build_object(
      'result', 'unassigned',
      'effort', v_effort,
      'reason', v_reason,
      'warnings', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(w.warning order by w.position), '[]'::jsonb)
  into v_warnings
  from (values
    (1, case when v_allocated_points + v_effort > v_window_capacity then
      jsonb_build_object(
        'code', 'over_capacity',
        'severity', 'critical',
        'message', 'Projected assigned points exceed nominal capacity through 1st Draft.'
      ) end),
    (2, case when v_wip_now >= v_wip_limit then
      jsonb_build_object(
        'code', 'wip_exceeded',
        'severity', 'warning',
        'message', 'Current WIP is at or above the member limit.'
      ) end),
    (3, case when v_skill_rank in (1, 3) then
      jsonb_build_object(
        'code', 'skill_mismatch',
        'severity', 'warning',
        'message', 'The selected member does not have every requested primary skill.'
      ) end),
    (4, case when v_skill_rank = 2 then
      jsonb_build_object(
        'code', 'backup_skill',
        'severity', 'info',
        'message', 'At least one requested skill is covered by backup skill configuration.'
      ) end),
    (5, case when v_availability = 'partial'
                  or (v_leave_bucket_count > 0 and v_full_leave_bucket_count = 0) then
      jsonb_build_object(
        'code', 'member_partial',
        'severity', 'warning',
        'message', 'The selected member has partial availability in the production window.'
      ) end),
    (6, case when v_availability = 'leave' or v_full_leave_bucket_count > 0 then
      jsonb_build_object(
        'code', 'member_on_leave',
        'severity', 'critical',
        'message', 'The selected member is on leave in the production window.'
      ) end),
    (7, case when v_work.due_date < v_start or v_effort > v_window_capacity then
      jsonb_build_object(
        'code', 'deadline_capacity_gap',
        'severity', 'critical',
        'message', 'Nominal production capacity cannot cover the effort by 1st Draft.'
      ) end),
    (8, case when v_work.work_type = 'creative_request'
                  and v_work.launch_date is not null
                  and v_work.due_date > public.flowmate_subtract_working_days(v_work.launch_date, 7) then
      jsonb_build_object(
        'code', 'review_buffer_risk',
        'severity', 'warning',
        'message', 'Asset First Draft Due violates the fixed T-7 deadline before Launch.'
      ) end),
    (9, case when v_needs_split then
      jsonb_build_object(
        'code', 'needs_split',
        'severity', 'warning',
        'message', 'This request still needs to be split for execution tracking.'
      ) end)
  ) as w(position, warning)
  where w.warning is not null;

  v_reason := 'Auto best-fit: ' || v_owner_name || ' (' || v_owner_code || ')'
    || '; warnings=' || v_warnings::text;
  v_snapshot := jsonb_build_object(
    'warnings', v_warnings,
    'owner_member_id', v_owner_id,
    'owner_code', v_owner_code,
    'required_skills', to_jsonb(array_remove(array[v_required_skill, v_required_skill_2], null)),
    'skill_rank', v_skill_rank,
    'availability', v_availability,
    'active_leave_bucket_count', v_leave_bucket_count,
    'full_leave_bucket_count', v_full_leave_bucket_count,
    'window_bucket_count', v_window_bucket_count,
    'window_start', v_start,
    'window_end', v_end,
    'window_capacity', v_window_capacity,
    'allocated_points_before', v_allocated_points,
    'projected_load_ratio', v_projected_ratio,
    'active_wip', v_wip_now,
    'wip_limit', v_wip_limit,
    'overdue_count', v_overdue_count
  );

  update public.work_items
  set status = 'assigned',
      effort_point = v_effort,
      final_owner_member_id = v_owner_id,
      assignment_reason = v_reason,
      needs_split = v_needs_split,
      wip_counted = false,
      updated_at = now()
  where id = p_work_item_id;

  perform public.flowmate_hybrid_rebuild_allocation(p_work_item_id, v_owner_id);

  insert into public.assignment_runs (
    work_item_id, triggered_by, suggested_owner_member_id,
    final_owner_member_id, result, reason, effort_point,
    raw_range_min, raw_range_max, was_capped, capacity_snapshot
  ) values (
    p_work_item_id, p_trigger, v_owner_id,
    v_owner_id, 'assigned', v_reason, v_effort,
    v_effort, v_effort, false, v_snapshot
  );

  insert into public.work_item_events (
    work_item_id, event_type, from_status, to_status, metadata
  ) values (
    p_work_item_id, 'assignment_ran', v_from_status, 'assigned',
    jsonb_build_object(
      'result', 'assigned',
      'owner_member_id', v_owner_id,
      'owner_user_id', v_owner_user_id,
      'owner_code', v_owner_code,
      'effort', v_effort,
      'trigger', p_trigger::text,
      'warnings', v_warnings
    )
  );

  return jsonb_build_object(
    'result', 'assigned',
    'owner_member_id', v_owner_id,
    'owner_user_id', v_owner_user_id,
    'owner_code', v_owner_code,
    'effort', v_effort,
    'reason', v_reason,
    'warnings', v_warnings
  );
end;
$assignment$;

revoke all on function public.flowmate_run_assignment(uuid, public.assignment_trigger)
  from public, anon, authenticated;

create or replace function public.flowmate_change_creative_assignee(
  p_display_id text,
  p_target_member_id uuid default null,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $change_assignee$
declare
  v_actor_id uuid := auth.uid();
  v_work public.work_items%rowtype;
  v_detail public.creative_request_details%rowtype;
  v_target public.team_members%rowtype;
  v_old_member_id uuid;
  v_next_status public.work_status;
  v_assignment_result public.assignment_result;
  v_is_admin boolean := false;
  v_is_requester boolean := false;
  v_is_self_gdve boolean := false;
  v_allocation_total numeric := 0;
  v_today date := timezone('Asia/Bangkok', now())::date;
  v_now_bkk timestamp := timezone('Asia/Bangkok', now());
  v_start date;
  v_start_half text := 'am';
  v_end date;
  v_required_skill text;
  v_required_skill_2 text;
  v_skill_rank integer;
  v_window_capacity numeric := 0;
  v_allocated_points numeric := 0;
  v_wip_now integer := 0;
  v_wip_limit integer := 0;
  v_availability text;
  v_leave_bucket_count integer := 0;
  v_full_leave_bucket_count integer := 0;
  v_window_bucket_count integer := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_assignment_reason text;
  v_needs_split boolean;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Assignment reason is required';
  end if;
  if not exists (
    select 1 from public.users u where u.id = v_actor_id and u.is_active = true
  ) then
    raise exception 'Actor user is inactive or not found' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('flowmate_assignment_engine'));

  select * into v_work
  from public.work_items
  where display_id = p_display_id
    and archived_at is null
  for update;

  if v_work.id is null then
    raise exception 'Creative request not found';
  end if;
  if v_work.work_type <> 'creative_request' then
    raise exception 'Assignee changes are only allowed for creative requests';
  end if;
  if v_work.status not in ('unassigned', 'assigned', 'in_progress', 'review', 'blocked') then
    raise exception 'Creative request status % cannot be reassigned', v_work.status;
  end if;

  select exists (
    select 1 from public.users u
    where u.id = v_actor_id and u.is_active = true and u.role = 'admin'
  ) into v_is_admin;
  v_is_requester := v_work.requester_user_id = v_actor_id;
  v_old_member_id := v_work.final_owner_member_id;
  v_needs_split := coalesce(v_work.needs_split, false);

  if v_work.effort_point is null or v_work.effort_point <= 0 then
    raise exception 'Creative request effort must be positive before changing assignee';
  end if;

  if extract(isodow from v_today) not between 1 and 5 then
    v_start := public.flowmate_next_working_day(v_today);
  elsif v_now_bkk::time >= time '15:00' then
    v_start := public.flowmate_next_working_day(v_today + 1);
  elsif v_now_bkk::time >= time '12:00' then
    v_start := public.flowmate_next_working_day(v_today);
    v_start_half := 'pm';
  else
    v_start := public.flowmate_next_working_day(v_today);
  end if;
  v_end := greatest(v_start, coalesce(v_work.due_date, v_start));

  if p_target_member_id is null then
    if not (v_is_admin or v_is_requester) then
      raise exception 'Only requester or admin may clear an assignee'
        using errcode = '42501';
    end if;

    v_next_status := 'unassigned';
    v_assignment_result := 'unassigned';
    v_warnings := case when v_needs_split then
      jsonb_build_array(jsonb_build_object(
        'code', 'needs_split',
        'severity', 'warning',
        'message', 'This request still needs to be split for execution tracking.'
      ))
      else '[]'::jsonb
    end;
  else
    select tm.* into v_target
    from public.team_members tm
    join public.users linked_user
      on linked_user.id = tm.user_id
     and linked_user.is_active = true
    where tm.id = p_target_member_id
      and tm.active = true
      and public.flowmate_is_gdve_member_code(tm.member_code);

    if v_target.id is null then
      raise exception 'Target must be an active linked GD/VE member';
    end if;
    if v_work.final_owner_member_id = v_target.id then
      raise exception 'Creative request is already assigned to this member';
    end if;

    v_is_self_gdve := v_target.user_id = v_actor_id
      and v_work.status = 'unassigned';
    if not (v_is_admin or v_is_requester or v_is_self_gdve) then
      raise exception 'Only requester/admin may reassign; active GD/VE may self-assign only Unassigned work'
        using errcode = '42501';
    end if;

    select * into v_detail
    from public.creative_request_details details
    where details.work_item_id = v_work.id;

    v_required_skill := public.flowmate_normalize_creative_skill(
      v_detail.asset_type,
      v_detail.asset_subtype
    );
    v_required_skill_2 := case
      when nullif(trim(coalesce(v_detail.asset_subtype_2, '')), '') is null then null
      else public.flowmate_normalize_creative_skill(
        v_detail.asset_type_2,
        v_detail.asset_subtype_2
      )
    end;
    v_skill_rank := case
      when v_required_skill_2 is null
        and v_required_skill = any(coalesce(v_target.skills, '{}'::text[])) then 0
      when v_required_skill_2 is not null
        and v_required_skill = any(coalesce(v_target.skills, '{}'::text[]))
        and v_required_skill_2 = any(coalesce(v_target.skills, '{}'::text[])) then 0
      when v_required_skill_2 is not null
        and (
          v_required_skill = any(coalesce(v_target.skills, '{}'::text[]))
          or v_required_skill_2 = any(coalesce(v_target.skills, '{}'::text[]))
        ) then 1
      when v_required_skill = any(
        coalesce(v_target.skills, '{}'::text[]) || coalesce(v_target.backup_skills, '{}'::text[])
      ) and (
        v_required_skill_2 is null
        or v_required_skill_2 = any(
          coalesce(v_target.skills, '{}'::text[]) || coalesce(v_target.backup_skills, '{}'::text[])
        )
      ) then 2
      else 3
    end;

    with buckets as (
      select g.d::date as bucket_date, halves.bucket_half
      from generate_series(v_start, v_end, interval '1 day') as g(d)
      cross join (values ('am'::text), ('pm'::text)) as halves(bucket_half)
      where extract(isodow from g.d) between 1 and 5
        and (g.d::date > v_start or v_start_half = 'am' or halves.bucket_half = 'pm')
    ), bucket_metrics as (
      select
        b.bucket_date,
        b.bucket_half,
        public.flowmate_leave_fraction_for_bucket(
          v_target.id, b.bucket_date, b.bucket_half
        ) as leave_fraction,
        exists (
          select 1
          from public.leave_requests active_leave
          where active_leave.team_member_id = v_target.id
            and active_leave.cancelled_at is null
            and active_leave.start_date <= b.bucket_date
            and active_leave.end_date >= b.bucket_date
        ) as has_active_leave_request
      from buckets b
    )
    select
      coalesce(sum(greatest(
        0::numeric,
        (case
          when v_target.availability = 'leave' then 0::numeric
          when v_target.availability = 'partial' then coalesce(v_target.capacity_override_per_day, 0)
          else v_target.capacity_per_day
        end / 2) * (1 - bm.leave_fraction)
      )), 0),
      coalesce((
        select sum(a.capacity_point)
        from public.flowmate_capacity_allocations a
        join public.work_items allocated_wi on allocated_wi.id = a.work_item_id
        where a.team_member_id = v_target.id
          and a.work_item_id <> v_work.id
          and a.bucket_date between v_start and v_end
          and allocated_wi.work_type = 'creative_request'
          and allocated_wi.status in ('assigned', 'in_progress', 'review', 'blocked')
      ), 0),
      coalesce((
        select count(*)
        from public.work_items wip_wi
        where wip_wi.final_owner_member_id = v_target.id
          and wip_wi.id <> v_work.id
          and wip_wi.status = 'in_progress'
          and wip_wi.wip_counted = true
      ), 0)::integer,
      count(*) filter (where bm.has_active_leave_request and bm.leave_fraction > 0)::integer,
      count(*) filter (where bm.has_active_leave_request and bm.leave_fraction >= 1)::integer,
      count(*)::integer
    into
      v_window_capacity,
      v_allocated_points,
      v_wip_now,
      v_leave_bucket_count,
      v_full_leave_bucket_count,
      v_window_bucket_count
    from bucket_metrics bm;

    v_wip_limit := v_target.wip_limit;
    v_availability := v_target.availability::text;

    select coalesce(jsonb_agg(w.warning order by w.position), '[]'::jsonb)
    into v_warnings
    from (values
      (1, case when v_skill_rank in (1, 3) then jsonb_build_object(
        'code', 'skill_mismatch', 'severity', 'warning',
        'message', 'The selected member does not have every requested primary skill.'
      ) end),
      (2, case when v_skill_rank = 2 then jsonb_build_object(
        'code', 'backup_skill', 'severity', 'info',
        'message', 'At least one requested skill uses backup skill configuration.'
      ) end),
      (3, case when v_availability = 'partial'
                    or (v_leave_bucket_count > 0 and v_full_leave_bucket_count = 0)
        then jsonb_build_object(
          'code', 'member_partial', 'severity', 'warning',
          'message', 'The selected member has partial availability in the production window.'
        ) end),
      (4, case when v_availability = 'leave' or v_full_leave_bucket_count > 0
        then jsonb_build_object(
          'code', 'member_on_leave', 'severity', 'critical',
          'message', 'The selected member has active leave overlapping the production window.'
        ) end),
      (5, case when v_wip_now >= v_wip_limit then jsonb_build_object(
        'code', 'wip_exceeded', 'severity', 'warning',
        'message', 'Current WIP is at or above the selected member limit.'
      ) end),
      (6, case when v_allocated_points + v_work.effort_point > v_window_capacity
        then jsonb_build_object(
          'code', 'over_capacity', 'severity', 'critical',
          'message', 'Projected points exceed nominal capacity through 1st Draft.'
        ) end),
      (7, case when v_work.due_date < v_start
                    or v_work.effort_point > v_window_capacity
        then jsonb_build_object(
          'code', 'deadline_capacity_gap', 'severity', 'critical',
          'message', 'Nominal capacity cannot cover effort by 1st Draft.'
        ) end),
      (8, case when v_work.work_type = 'creative_request'
                    and v_work.launch_date is not null
                    and v_work.due_date > public.flowmate_subtract_working_days(v_work.launch_date, 7)
        then jsonb_build_object(
          'code', 'review_buffer_risk', 'severity', 'warning',
          'message', 'Asset First Draft Due violates the fixed T-7 deadline before Launch.'
        ) end),
      (9, case when v_needs_split then jsonb_build_object(
        'code', 'needs_split', 'severity', 'warning',
        'message', 'This request still needs to be split for execution tracking.'
      ) end)
    ) as w(position, warning)
    where w.warning is not null;

    v_next_status := case when v_work.status = 'unassigned' then 'assigned' else v_work.status end;
    v_assignment_result := 'assigned';
  end if;

  v_assignment_reason := 'Manual assignment: ' || trim(p_reason)
    || '; warnings=' || v_warnings::text;

  update public.work_items
  set final_owner_member_id = p_target_member_id,
      status = v_next_status,
      assignment_reason = v_assignment_reason,
      wip_counted = case when v_next_status = 'in_progress' then wip_counted else false end,
      updated_at = now()
  where id = v_work.id;

  if p_target_member_id is not null
     and v_next_status in ('assigned', 'in_progress', 'review', 'blocked') then
    v_allocation_total := public.flowmate_hybrid_rebuild_allocation(v_work.id, v_target.id);
  else
    delete from public.flowmate_capacity_allocations
    where work_item_id = v_work.id;
  end if;

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
  ) values (
    v_work.id,
    'rerun',
    p_target_member_id,
    p_target_member_id,
    v_assignment_result,
    v_assignment_reason,
    v_work.effort_point,
    v_work.effort_point,
    v_work.effort_point,
    false,
    jsonb_build_object(
      'source', 'manual_assignment_rpc',
      'actor_user_id', v_actor_id,
      'old_member_id', v_old_member_id,
      'new_member_id', p_target_member_id,
      'warnings', v_warnings,
      'window_start', v_start,
      'window_end', v_end,
      'window_capacity', v_window_capacity,
      'allocated_points_before', v_allocated_points,
      'active_wip', v_wip_now,
      'wip_limit', v_wip_limit,
      'active_leave_bucket_count', v_leave_bucket_count,
      'full_leave_bucket_count', v_full_leave_bucket_count,
      'window_bucket_count', v_window_bucket_count
    )
  );

  insert into public.work_item_events (
    work_item_id, actor_user_id, event_type, from_status, to_status, metadata
  ) values (
    v_work.id, v_actor_id, 'updated', v_work.status, v_next_status,
    jsonb_build_object(
      'action', 'assignee_changed',
      'reason', trim(p_reason),
      'old_member_id', v_old_member_id,
      'new_member_id', p_target_member_id,
      'new_member_code', v_target.member_code,
      'allocation_total', v_allocation_total,
      'warnings', v_warnings,
      'assignment_run_result', v_assignment_result
    )
  );

  return jsonb_build_object(
    'display_id', v_work.display_id,
    'status', v_next_status,
    'owner_member_id', p_target_member_id,
    'owner_user_id', v_target.user_id,
    'owner_code', v_target.member_code,
    'allocation_total', v_allocation_total,
    'reason', trim(p_reason),
    'warnings', v_warnings
  );
end;
$change_assignee$;

revoke all on function public.flowmate_change_creative_assignee(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.flowmate_change_creative_assignee(text, uuid, text)
  to authenticated;

-- PostgreSQL cannot insert a new CREATE OR REPLACE VIEW column in the middle of
-- an existing view. Add the field at the end for existing deployments. If a
-- canonical rebuild already placed it elsewhere, the column check makes this
-- migration idempotent and leaves that definition untouched.

do $view_update$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'flowmate_delivered_history_v'
      and column_name = 'final_approved_due_date'
  ) then
    execute $view_sql$
create or replace view public.flowmate_delivered_history_v
with (security_invoker = true) as
select
  wi.id,
  wi.display_id,
  wi.title,
  wi.campaign_name,
  coalesce(wi.final_owner_member_id, wi.assignee_user_id) as owner_member_id,
  coalesce(
    tm.display_name,
    assignee.display_name,
    nullif(trim(wi.assignee_other_name), ''),
    'Unassigned'
  ) as owner_name,
  wi.work_type,
  wi.effort_point,
  wi.due_date,
  wi.launch_date,
  wi.delivered_at,
  wi.archived_at,
  wi.archive_reason,
  case
    when wi.delivered_at is null then 'unknown'
    when (wi.delivered_at at time zone 'Asia/Bangkok')::date <= wi.due_date then 'on_time'
    else 'late'
  end as delivery_result,
  (wi.delivered_at is null) as legacy_missing_delivered_at,
  wi.final_approved_due_date
from public.work_items wi
left join public.team_members tm on tm.id = wi.final_owner_member_id
left join public.users assignee on assignee.id = wi.assignee_user_id
where wi.status = 'delivered';
$view_sql$;
  end if;
end;
$view_update$;

do $view_update$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'flowmate_kpi_work_items_v'
      and column_name = 'final_approved_due_date'
  ) then
    execute $view_sql$
create or replace view public.flowmate_kpi_work_items_v
with (security_invoker = true) as
select
  wi.id,
  wi.display_id,
  wi.title,
  wi.work_type,
  wi.status,
  wi.priority,
  wi.effort_point,
  wi.due_date,
  wi.launch_date,
  wi.created_at,
  event_times.assigned_at,
  wi.delivered_at,
  wi.archived_at,
  wi.final_owner_member_id,
  wi.final_owner_member_id as owner_member_id,
  owner.display_name as owner_name,
  owner.display_name as final_owner_name,
  wi.assignee_other_name,
  requester.display_name as requester_name,
  wi.requester_team,
  wi.review_round,
  wi.campaign_name,
  wi.project_name,
  array_to_string(crd.platforms, ', ') as platform,
  crd.size_format,
  public.flowmate_kpi_ai_tags(wi.id) as ai_tags,
  case
    when wi.delivered_at is null then 'unknown'
    when (wi.delivered_at at time zone 'Asia/Bangkok')::date <= wi.due_date then 'on_time'
    else 'late'
  end as delivery_result,
  wi.final_approved_due_date
from public.work_items wi
left join public.team_members owner on owner.id = wi.final_owner_member_id
left join public.users requester on requester.id = wi.requester_user_id
left join public.creative_request_details crd on crd.work_item_id = wi.id
left join lateral (
  select min(e.created_at) filter (where e.to_status = 'assigned') as assigned_at
  from public.work_item_events e
  where e.work_item_id = wi.id
) event_times on true
where wi.archived_at is null or wi.status = 'delivered';
$view_sql$;
  end if;
end;
$view_update$;

do $view_update$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'planning_work_items_v'
      and column_name = 'final_approved_due_date'
  ) then
    execute $view_sql$
create or replace view public.planning_work_items_v
with (security_invoker = true) as
select
  wi.id,
  wi.display_id,
  wi.title,
  wi.campaign_name,
  wi.requester_user_id,
  wi.requester_team,
  wi.assignee_user_id,
  wi.assignee_other_name,
  wi.final_owner_member_id,
  tm.display_name as final_owner_name,
  wi.status,
  wi.priority,
  wi.due_date as first_draft_date,
  wi.launch_date,
  wi.publish_date,
  coalesce(wi.publish_date, wi.launch_date) as planning_date,
  crd.asset_type,
  crd.asset_subtype,
  crd.asset_count,
  crd.platforms as raw_platforms,
  public.flowmate_normalized_planning_channels(crd.platforms) as normalized_channels,
  case
    when wi.status = 'blocked' then 'Blocked'
    when wi.status = 'need_brief' then 'Need Brief'
    when wi.status = 'cancelled' then 'Cancelled'
    when wi.status = 'delivered' and coalesce(wi.publish_date, wi.launch_date) <= current_date then 'Published'
    when wi.status = 'delivered' then 'Ready'
    when coalesce(wi.publish_date, wi.launch_date) is not null
      and coalesce(wi.publish_date, wi.launch_date) <= current_date + interval '7 days'
      and wi.status not in ('delivered', 'cancelled') then 'At Risk'
    when wi.status = 'review' then 'In Review'
    when wi.status in ('assigned', 'in_progress') then 'In Production'
    else 'Planned'
  end as planning_readiness,
  wi.final_approved_due_date as final_approved_due_date
from public.work_items wi
join public.creative_request_details crd on crd.work_item_id = wi.id
left join public.team_members tm on tm.id = wi.final_owner_member_id
where wi.work_type = 'creative_request'
  and wi.archived_at is null;
$view_sql$;
  end if;
end;
$view_update$;

do $view_update$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'flowmate_team_schedule_v'
      and column_name = 'final_approved_due_date'
  ) then
    execute $view_sql$
create or replace view public.flowmate_team_schedule_v
with (security_invoker = true) as
with event_times as (
  select
    work_item_id,
    min(created_at) filter (where to_status = 'assigned' or event_type::text = 'assigned') as first_assigned_at,
    min(created_at) filter (where to_status = 'in_progress') as actual_started_at
  from public.work_item_events
  group by work_item_id
), allocation_times as (
  select work_item_id, min(bucket_date) as suggested_start_date
  from public.flowmate_capacity_allocations
  group by work_item_id
)
select
  wi.id as work_item_id,
  wi.display_id,
  wi.title,
  wi.status,
  wi.priority,
  wi.effort_point,
  wi.final_owner_member_id as owner_member_id,
  wi.due_date as first_draft_date,
  wi.launch_date,
  et.first_assigned_at,
  et.actual_started_at,
  at.suggested_start_date,
  crd.asset_type,
  crd.asset_subtype,
  wi.final_approved_due_date
from public.work_items wi
left join public.creative_request_details crd on crd.work_item_id = wi.id
left join event_times et on et.work_item_id = wi.id
left join allocation_times at on at.work_item_id = wi.id
where wi.archived_at is null
  and wi.work_type = 'creative_request';
$view_sql$;
  end if;
end;
$view_update$;

-- Re-assert the existing least-privilege view contract.
revoke all privileges on public.planning_work_items_v from public, anon, authenticated;
revoke all privileges on public.flowmate_delivered_history_v from public, anon, authenticated;
revoke all privileges on public.flowmate_kpi_work_items_v from public, anon, authenticated;
revoke all privileges on public.flowmate_team_schedule_v from public, anon, authenticated;

grant select on public.planning_work_items_v to authenticated;
grant select on public.flowmate_delivered_history_v to authenticated;
grant select on public.flowmate_kpi_work_items_v to authenticated;
grant select on public.flowmate_team_schedule_v to authenticated;

-- Preserve the existing public RPC contract.
grant execute on function public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, text[], text,
  text, text, text, public.priority_level, text, date, date, integer, date, time, public.asset_type, text, integer
) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');

-- ============================================================================
-- 3. VERIFICATION (inside the transaction; any failure rolls back everything)
-- ============================================================================

do $verify$
declare
  v_definition text;
  v_view_count integer;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'work_items'
      and column_name = 'final_approved_due_date'
      and data_type = 'date'
      and is_nullable = 'YES'
  ) then
    raise exception 'Verification failed: work_items.final_approved_due_date must be nullable date';
  end if;

  if public.flowmate_subtract_working_days(date '2026-08-17', 7) <> date '2026-08-06'
     or public.flowmate_subtract_working_days(date '2026-08-17', 5) <> date '2026-08-10' then
    raise exception 'Verification failed: Monday Launch Date did not map to T-7/T-5 milestones';
  end if;

  v_definition := pg_get_functiondef(
    'public.flowmate_subtract_working_days(date,integer)'::regprocedure
  );
  if position('extract(isodow from v_cursor) between 1 and 5' in v_definition) = 0
     or position('public_holidays' in v_definition) > 0 then
    raise exception 'Verification failed: working-day helper contract differs';
  end if;

  v_definition := pg_get_functiondef(
    'public.create_creative_request(uuid,text,text,text,public.asset_type,text,text[],text,text,text,text,public.priority_level,text,date,date,integer,date,time,public.asset_type,text,integer)'::regprocedure
  );
  if position('public.flowmate_subtract_working_days(v_launch_date, 7)' in v_definition) = 0
     or position('public.flowmate_subtract_working_days(v_launch_date, 5)' in v_definition) = 0
     or position('due_date, final_approved_due_date, launch_date' in v_definition) = 0
     or position('v_due_date, v_final_approved_due_date, v_launch_date' in v_definition) = 0 then
    raise exception 'Verification failed: create_creative_request milestone contract differs';
  end if;

  v_definition := pg_get_functiondef(
    'public.flowmate_run_assignment(uuid,public.assignment_trigger)'::regprocedure
  );
  if position('v_work.work_type = ''creative_request''' in v_definition) = 0
     or position('public.flowmate_subtract_working_days(v_work.launch_date, 7)' in v_definition) = 0 then
    raise exception 'Verification failed: automatic assignment T-7 guard differs';
  end if;

  v_definition := pg_get_functiondef(
    'public.flowmate_change_creative_assignee(text,uuid,text)'::regprocedure
  );
  if position('v_work.work_type = ''creative_request''' in v_definition) = 0
     or position('public.flowmate_subtract_working_days(v_work.launch_date, 7)' in v_definition) = 0 then
    raise exception 'Verification failed: manual assignment T-7 guard differs';
  end if;

  select count(distinct table_name)
  into v_view_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name in (
      'flowmate_delivered_history_v',
      'flowmate_kpi_work_items_v',
      'planning_work_items_v',
      'flowmate_team_schedule_v'
    )
    and column_name = 'final_approved_due_date';

  if v_view_count <> 4 then
    raise exception
      'Verification failed: final_approved_due_date is exposed by % of 4 required views',
      v_view_count;
  end if;
end;
$verify$;

commit;

-- Read-only evidence rows after successful commit.
select
  public.flowmate_subtract_working_days(date '2026-08-17', 7) as monday_launch_t_minus_7,
  public.flowmate_subtract_working_days(date '2026-08-17', 5) as monday_launch_t_minus_5,
  (
    public.flowmate_subtract_working_days(date '2026-08-17', 7) = date '2026-08-06'
    and public.flowmate_subtract_working_days(date '2026-08-17', 5) = date '2026-08-10'
  ) as milestone_math_ok;

select
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'work_items',
    'flowmate_delivered_history_v',
    'flowmate_kpi_work_items_v',
    'planning_work_items_v',
    'flowmate_team_schedule_v'
  )
  and column_name = 'final_approved_due_date'
order by table_name;

-- ============================================================================
-- 4. ROLLBACK GUIDANCE (COMMENTED; NOTHING BELOW EXECUTES AUTOMATICALLY)
-- ============================================================================
--
-- Rollback is intentionally manual because dropping the new column destroys
-- any Final/Approved milestone data written after deployment.
--
-- Before rollback:
--   1. Stop writes that create or update Creative Requests.
--   2. Export rows where final_approved_due_date is not null.
--   3. Restore the previous definitions of create_creative_request,
--      flowmate_subtract_working_days, flowmate_run_assignment,
--      flowmate_change_creative_assignee, and the four views from version
--      control. Restore views before removing the column.
--   4. Run the impact query below and review the result.
--
-- select count(*) as populated_rows
-- from public.work_items
-- where final_approved_due_date is not null;
--
-- begin;
-- set local lock_timeout = '5s';
-- set local statement_timeout = '120s';
--
-- -- Paste the previous canonical function and view definitions here first.
--
-- alter table public.work_items
--   drop column if exists final_approved_due_date;
--
-- select pg_notify('pgrst', 'reload schema');
-- commit;
--
-- If any statement fails before COMMIT, run:
-- rollback;

