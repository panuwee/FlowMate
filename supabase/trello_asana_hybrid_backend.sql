-- FlowMate Trello + Asana hybrid: existing-database backend delta.
-- Prerequisite: trello_asana_hybrid_prepare.sql committed successfully.
-- This file intentionally replaces only assignment/allocation RPC behavior.

begin;

-- Internal allocation helper. It first consumes nominal free capacity in
-- chronological AM/PM order, then spreads unavoidable overload over the same
-- production buckets. The final bucket receives the rounding remainder, so
-- the persisted total is always exactly the work item's effort.
create or replace function public.flowmate_hybrid_rebuild_allocation(
  p_work_item_id uuid,
  p_team_member_id uuid
) returns numeric
language plpgsql
security definer
set search_path = public
as $allocation$
declare
  v_effort numeric;
  v_today date := timezone('Asia/Bangkok', now())::date;
  v_now_bkk timestamp := timezone('Asia/Bangkok', now());
  v_start date;
  v_start_half text := 'am';
  v_end date;
  v_total numeric;
begin
  select wi.effort_point::numeric,
         greatest(timezone('Asia/Bangkok', now())::date, wi.due_date)
    into v_effort, v_end
  from public.work_items wi
  where wi.id = p_work_item_id
    and wi.work_type = 'creative_request'
  for update;

  if v_effort is null or v_effort <= 0 then
    raise exception 'Creative request effort must be positive before allocation';
  end if;

  if not exists (
    select 1
    from public.team_members tm
    join public.users u on u.id = tm.user_id and u.is_active = true
    where tm.id = p_team_member_id
      and tm.active = true
      and public.flowmate_is_gdve_member_code(tm.member_code)
  ) then
    raise exception 'Allocation owner must be an active linked GD/VE member';
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

  v_end := greatest(v_start, coalesce(v_end, v_start));

  delete from public.flowmate_capacity_allocations
  where work_item_id = p_work_item_id;

  insert into public.flowmate_capacity_allocations (
    work_item_id,
    team_member_id,
    bucket_date,
    bucket_half,
    capacity_point
  )
  with buckets as (
    select
      g.d::date as bucket_date,
      halves.bucket_half,
      halves.half_order,
      greatest(
        0::numeric,
        (
          case
            when tm.availability = 'leave' then 0::numeric
            when tm.availability = 'partial' then coalesce(tm.capacity_override_per_day, 0)
            else tm.capacity_per_day
          end / 2
        ) * (1 - public.flowmate_leave_fraction_for_bucket(
          tm.id,
          g.d::date,
          halves.bucket_half
        ))
      ) as nominal_capacity
    from public.team_members tm
    cross join generate_series(v_start, v_end, interval '1 day') as g(d)
    cross join (values ('am'::text, 1), ('pm'::text, 2)) as halves(bucket_half, half_order)
    where tm.id = p_team_member_id
      and extract(isodow from g.d) between 1 and 5
      and (g.d::date > v_start or v_start_half = 'am' or halves.bucket_half = 'pm')
  ), free_buckets as (
    select
      b.*,
      greatest(
        0::numeric,
        b.nominal_capacity - coalesce((
          select sum(a.capacity_point)
          from public.flowmate_capacity_allocations a
          join public.work_items other_wi on other_wi.id = a.work_item_id
          where a.team_member_id = p_team_member_id
            and a.work_item_id <> p_work_item_id
            and a.bucket_date = b.bucket_date
            and a.bucket_half = b.bucket_half
            and other_wi.work_type = 'creative_request'
            and other_wi.status in ('assigned', 'in_progress', 'review', 'blocked')
        ), 0)
      ) as free_capacity
    from buckets b
  ), normal_fill as (
    select
      f.*,
      least(
        f.free_capacity,
        greatest(
          0::numeric,
          v_effort - coalesce(sum(f.free_capacity) over (
            order by f.bucket_date, f.half_order
            rows between unbounded preceding and 1 preceding
          ), 0)
        )
      ) as normal_point
    from free_buckets f
  ), numbered as (
    select
      n.*,
      row_number() over (order by n.bucket_date, n.half_order) as bucket_number,
      count(*) over () as bucket_count,
      sum(n.normal_point) over () as normal_total
    from normal_fill n
  ), distributed as (
    select
      n.*,
      trunc(greatest(v_effort - n.normal_total, 0) / n.bucket_count, 6) as overload_share
    from numbered n
  )
  select
    p_work_item_id,
    p_team_member_id,
    d.bucket_date,
    d.bucket_half,
    d.normal_point + case
      when d.bucket_number < d.bucket_count then d.overload_share
      else greatest(v_effort - d.normal_total, 0)
           - d.overload_share * (d.bucket_count - 1)
    end
  from distributed d
  where d.normal_point + case
    when d.bucket_number < d.bucket_count then d.overload_share
    else greatest(v_effort - d.normal_total, 0)
         - d.overload_share * (d.bucket_count - 1)
  end > 0
  order by d.bucket_date, d.half_order;

  select coalesce(sum(a.capacity_point), 0)
    into v_total
  from public.flowmate_capacity_allocations a
  where a.work_item_id = p_work_item_id;

  if v_total <> v_effort then
    raise exception 'Allocation total % must equal effort %', v_total, v_effort;
  end if;

  return v_total;
end;
$allocation$;

revoke all on function public.flowmate_hybrid_rebuild_allocation(uuid, uuid)
  from public, anon, authenticated;

-- Deterministic best-fit assignment. Skill, WIP, capacity, and leave are soft
-- ranking/warning signals; only active linked members in the GD/VE pool are a
-- hard filter.
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
    (8, case when v_work.launch_date is not null
                  and v_work.due_date > public.flowmate_subtract_working_days(v_work.launch_date, 2) then
      jsonb_build_object(
        'code', 'review_buffer_risk',
        'severity', 'warning',
        'message', 'The 1st Draft leaves fewer than two working days for review.'
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

-- Deprecated compatibility surface. Existing status-transition RPCs may still
-- invoke this as the function owner, but it never scans or mutates queued work.
create or replace function public.flowmate_rerun_queued_creative_requests(
  p_limit integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = public
as $queue_compat$
begin
  return jsonb_build_object(
    'deprecated', true,
    'no_op', true,
    'checked', 0,
    'assigned', 0,
    'requested_limit', p_limit
  );
end;
$queue_compat$;

revoke all on function public.flowmate_rerun_queued_creative_requests(integer)
  from public, anon, authenticated;

drop function if exists public.flowmate_change_creative_assignee(uuid, text, uuid, text);

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
      (8, case when v_work.launch_date is not null
                    and v_work.due_date > public.flowmate_subtract_working_days(v_work.launch_date, 2)
        then jsonb_build_object(
          'code', 'review_buffer_risk', 'severity', 'warning',
          'message', 'The 1st Draft leaves fewer than two working days for review.'
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

drop function if exists public.flowmate_reschedule_capacity_allocation(uuid, text, jsonb, text);

create or replace function public.flowmate_reschedule_capacity_allocation(
  p_display_id text,
  p_allocations jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $reschedule$
declare
  v_actor_id uuid := auth.uid();
  v_work public.work_items%rowtype;
  v_owner_user_id uuid;
  v_is_admin boolean := false;
  v_today date := timezone('Asia/Bangkok', now())::date;
  v_now_bkk timestamp := timezone('Asia/Bangkok', now());
  v_snapshot_window_start text;
  v_window_start date;
  v_window_end date;
  v_total numeric;
  v_count integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.users u where u.id = v_actor_id and u.is_active = true
  ) then
    raise exception 'Actor user is inactive or not found' using errcode = '42501';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Allocations must be a non-empty JSON array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_allocations) item
    where jsonb_typeof(item) <> 'object'
      or not (item ? 'bucket_date' and item ? 'bucket_half' and item ? 'capacity_point')
      or jsonb_typeof(item -> 'bucket_date') <> 'string'
      or jsonb_typeof(item -> 'bucket_half') <> 'string'
      or jsonb_typeof(item -> 'capacity_point') <> 'number'
  ) then
    raise exception 'Each allocation requires bucket_date, bucket_half, and numeric capacity_point';
  end if;

  select * into v_work
  from public.work_items
  where display_id = p_display_id
    and archived_at is null
  for update;

  if v_work.id is null or v_work.work_type <> 'creative_request' then
    raise exception 'Creative request not found';
  end if;
  if v_work.status not in ('assigned', 'in_progress', 'review', 'blocked')
     or v_work.final_owner_member_id is null then
    raise exception 'Only capacity-counted assigned work can be rescheduled';
  end if;

  select tm.user_id into v_owner_user_id
  from public.team_members tm
  where tm.id = v_work.final_owner_member_id;
  select exists (
    select 1 from public.users u
    where u.id = v_actor_id and u.is_active = true and u.role = 'admin'
  ) into v_is_admin;

  if not (
    v_actor_id = v_owner_user_id
    or v_actor_id = v_work.requester_user_id
    or v_is_admin
  ) then
    raise exception 'Only owner, requester, or admin may reschedule capacity'
      using errcode = '42501';
  end if;

  select assignment.capacity_snapshot ->> 'window_start'
    into v_snapshot_window_start
  from public.assignment_runs assignment
  where assignment.work_item_id = v_work.id
  order by assignment.ran_at desc, assignment.id desc
  limit 1;

  if v_snapshot_window_start ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    begin
      v_window_start := v_snapshot_window_start::date;
      if to_char(v_window_start, 'YYYY-MM-DD') <> v_snapshot_window_start then
        v_window_start := null;
      end if;
    exception when others then
      v_window_start := null;
    end;
  end if;

  if v_window_start is null then
    if extract(isodow from v_today) not between 1 and 5 then
      v_window_start := public.flowmate_next_working_day(v_today);
    elsif v_now_bkk::time >= time '15:00' then
      v_window_start := public.flowmate_next_working_day(v_today + 1);
    else
      v_window_start := public.flowmate_next_working_day(v_today);
    end if;
  end if;

  v_window_end := greatest(
    v_window_start,
    coalesce(v_work.due_date, v_window_start)
  );

  begin
    with parsed_allocations as (
      select
        x.bucket_date,
        lower(x.bucket_half) as bucket_half,
        x.capacity_point
      from jsonb_to_recordset(p_allocations) as x(
        bucket_date date,
        bucket_half text,
        capacity_point numeric
      )
    )
    select count(*), coalesce(sum(parsed.capacity_point), 0)
      into v_count, v_total
    from parsed_allocations parsed;
  exception when others then
    raise exception 'Allocation JSON contains an invalid date or number';
  end;

  if v_count <> jsonb_array_length(p_allocations) then
    raise exception 'Allocation JSON could not be parsed completely';
  end if;
  if exists (
    with parsed_allocations as (
      select lower(x.bucket_half) as bucket_half, x.capacity_point
      from jsonb_to_recordset(p_allocations) as x(
        bucket_date date,
        bucket_half text,
        capacity_point numeric
      )
    )
    select 1 from parsed_allocations parsed
    where parsed.bucket_half not in ('am', 'pm') or parsed.capacity_point <= 0
  ) then
    raise exception 'Allocation half must be am/pm and capacity_point must be greater than zero';
  end if;
  if exists (
    with parsed_allocations as (
      select x.bucket_date, lower(x.bucket_half) as bucket_half
      from jsonb_to_recordset(p_allocations) as x(
        bucket_date date,
        bucket_half text,
        capacity_point numeric
      )
    )
    select parsed.bucket_date, parsed.bucket_half
    from parsed_allocations parsed
    group by parsed.bucket_date, parsed.bucket_half
    having count(*) > 1
  ) then
    raise exception 'Allocation bucket_date/bucket_half pairs must be unique';
  end if;
  if exists (
    with parsed_allocations as (
      select x.bucket_date
      from jsonb_to_recordset(p_allocations) as x(
        bucket_date date,
        bucket_half text,
        capacity_point numeric
      )
    )
    select 1 from parsed_allocations parsed
    where extract(isodow from parsed.bucket_date) not between 1 and 5
  ) then
    raise exception 'Allocation dates must be working days (Monday-Friday)';
  end if;
  if exists (
    with parsed_allocations as (
      select x.bucket_date
      from jsonb_to_recordset(p_allocations) as x(
        bucket_date date,
        bucket_half text,
        capacity_point numeric
      )
    )
    select 1 from parsed_allocations parsed
    where parsed.bucket_date < v_window_start or parsed.bucket_date > v_window_end
  ) then
    raise exception 'Allocation dates must stay inside the production window';
  end if;
  if v_total <> v_work.effort_point::numeric then
    raise exception 'Allocation total % must equal effort %', v_total, v_work.effort_point;
  end if;

  delete from public.flowmate_capacity_allocations
  where work_item_id = v_work.id;

  insert into public.flowmate_capacity_allocations (
    work_item_id, team_member_id, bucket_date, bucket_half, capacity_point
  )
  with parsed_allocations as (
    select
      x.bucket_date,
      lower(x.bucket_half) as bucket_half,
      x.capacity_point
    from jsonb_to_recordset(p_allocations) as x(
      bucket_date date,
      bucket_half text,
      capacity_point numeric
    )
  )
  select
    v_work.id,
    v_work.final_owner_member_id,
    parsed.bucket_date,
    parsed.bucket_half,
    parsed.capacity_point
  from parsed_allocations parsed;

  insert into public.work_item_events (
    work_item_id, actor_user_id, event_type, from_status, to_status, metadata
  ) values (
    v_work.id, v_actor_id, 'capacity_changed', v_work.status, v_work.status,
    jsonb_build_object(
      'action', 'capacity_changed',
      'reason', 'Manual capacity reschedule',
      'allocation_total', v_total,
      'allocation_count', v_count,
      'window_start', v_window_start,
      'window_end', v_window_end
    )
  );

  return jsonb_build_object(
    'display_id', v_work.display_id,
    'allocation_total', v_total,
    'allocation_count', v_count,
    'effort', v_work.effort_point,
    'status', v_work.status
  );
end;
$reschedule$;

revoke all on function public.flowmate_reschedule_capacity_allocation(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.flowmate_reschedule_capacity_allocation(text, jsonb)
  to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
