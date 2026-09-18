CREATE OR REPLACE FUNCTION public.flowmate_run_assignment(p_work_item_id uuid, p_trigger assignment_trigger)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_in_progress_count integer := 0;
  v_assigned_count integer := 0;
  v_assignment_load numeric := 0;
  v_availability_fraction numeric := 0;
  v_adjusted_load numeric := 0;
  v_projected_ratio numeric := 0;
  v_wip_now integer := 0;
  v_wip_limit integer;
  v_overdue_count integer;
  v_last_auto_assigned_at timestamptz;
  v_candidate_state_version text;
  v_candidate_count integer := 0;
  v_skill_blocked_count integer := 0;
  v_leave_blocked_count integer := 0;
  v_wip_blocked_count integer := 0;
  v_selected_eligible boolean := false;
  v_leave_fraction numeric;
  v_leave_bucket_count integer;
  v_full_leave_bucket_count integer;
  v_window_bucket_count integer := 0;
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

  with candidate_rows as (
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
        when v_required_skill_2 is null
          and v_required_skill = any(
            coalesce(tm.skills, '{}'::text[]) || coalesce(tm.backup_skills, '{}'::text[])
          )
          and not (v_required_skill = any(coalesce(tm.skills, '{}'::text[]))) then 2
        when v_required_skill_2 is not null
          and v_required_skill = any(
            coalesce(tm.skills, '{}'::text[]) || coalesce(tm.backup_skills, '{}'::text[])
          )
          and v_required_skill_2 = any(
            coalesce(tm.skills, '{}'::text[]) || coalesce(tm.backup_skills, '{}'::text[])
          )
          and not (
            v_required_skill = any(coalesce(tm.skills, '{}'::text[]))
            and v_required_skill_2 = any(coalesce(tm.skills, '{}'::text[]))
          ) then 2
        when v_required_skill_2 is not null
          and (
            v_required_skill = any(coalesce(tm.skills, '{}'::text[]))
            or v_required_skill_2 = any(coalesce(tm.skills, '{}'::text[]))
          ) then 1
        else 3
      end as skill_rank,
      metrics.in_progress_count,
      metrics.assigned_count,
      metrics.overdue_count,
      metrics.availability_fraction,
      metrics.leave_fraction,
      metrics.leave_bucket_count,
      metrics.full_leave_bucket_count,
      metrics.window_bucket_count,
      coalesce((
        select max(previous_run.ran_at)
        from public.assignment_runs previous_run
        where previous_run.final_owner_member_id = tm.id
          and previous_run.result = 'assigned'
      ), '-infinity'::timestamptz) as last_auto_assigned_at,
      metrics.in_progress_count * 1.0 + metrics.assigned_count * 0.5 as assignment_load,
      ((metrics.in_progress_count * 1.0 + metrics.assigned_count * 0.5)
        / nullif(metrics.availability_fraction, 0)) as adjusted_load
    from public.team_members tm
    join public.users linked_user
      on linked_user.id = tm.user_id
     and linked_user.is_active = true
    cross join lateral (
      select
        count(*) filter (where active_wi.status = 'in_progress')::integer as in_progress_count,
        count(*) filter (where active_wi.status = 'assigned')::integer as assigned_count,
        count(*) filter (
          where active_wi.status in ('assigned', 'in_progress', 'review', 'blocked')
            and active_wi.due_date < v_today
        )::integer as overdue_count
      from public.work_items active_wi
      where active_wi.final_owner_member_id = tm.id
        and active_wi.id <> p_work_item_id
        and active_wi.work_type = 'creative_request'
        and active_wi.status in ('assigned', 'in_progress', 'review', 'blocked')
    ) workload
    cross join lateral (
      with bucket_days as (
        select
          g.d::date as bucket_date,
          halves.bucket_half
        from generate_series(v_start, v_end, interval '1 day') as g(d)
        cross join (values ('am'::text), ('pm'::text)) as halves(bucket_half)
      ), working_buckets as (
        select bucket_date, bucket_half
        from bucket_days
        where public.flowmate_is_th_business_day(bucket_date)
          and (bucket_date > v_start or v_start_half = 'am' or bucket_half = 'pm')
      ), bucket_metrics as (
        select
          wb.bucket_date,
          wb.bucket_half,
          public.flowmate_leave_fraction_for_bucket(
            tm.id, wb.bucket_date, wb.bucket_half
          ) as leave_fraction,
          (
            case
              when tm.availability = 'leave' then 0::numeric
              when tm.availability = 'partial' then coalesce(
                least(
                  1::numeric,
                  coalesce(tm.capacity_override_per_day, 0)
                    / nullif(tm.capacity_per_day, 0)
                ),
                0::numeric
              )
              else 1::numeric
            end
          ) * (
            1 - public.flowmate_leave_fraction_for_bucket(
              tm.id, wb.bucket_date, wb.bucket_half
            )
          ) as bucket_fraction
        from working_buckets wb
      )
      select
        coalesce(avg(bucket_fraction), 0::numeric) as availability_fraction,
        coalesce(max(leave_fraction), 0::numeric) as leave_fraction,
        count(*) filter (where leave_fraction > 0)::integer as leave_bucket_count,
        count(*) filter (where leave_fraction >= 1)::integer as full_leave_bucket_count,
        count(*)::integer as window_bucket_count
      from bucket_metrics
    ) availability_metrics
    cross join lateral (
      select
        workload.in_progress_count,
        workload.assigned_count,
        workload.overdue_count,
        availability_metrics.availability_fraction,
        availability_metrics.leave_fraction,
        availability_metrics.leave_bucket_count,
        availability_metrics.full_leave_bucket_count,
        availability_metrics.window_bucket_count
    ) metrics
    where tm.active = true
      and public.flowmate_is_gdve_member_code(tm.member_code)
      and (
        (v_context = 'esport' and lower(tm.member_code) in ('ploy','vee'))
        or (v_context = 'ops_marketing' and lower(tm.member_code) in ('pond','jo','tong','eye'))
      )
  ), candidate_state as (
    select
      c.*,
      md5(string_agg(
        concat_ws(
          ':',
          c.id::text,
          c.in_progress_count::text,
          c.assigned_count::text,
          round(c.availability_fraction, 6)::text,
          c.last_auto_assigned_at::text
        ),
        '|'
      ) over (
        order by c.id
        rows between unbounded preceding and unbounded following
      )) as candidate_state_version,
      count(*) over () as candidate_count,
      count(*) filter (where c.skill_rank <> 0) over () as skill_blocked_count,
      count(*) filter (where c.availability_fraction <= 0) over () as leave_blocked_count,
      count(*) filter (
        where c.skill_rank = 0
          and c.availability_fraction > 0
          and c.in_progress_count >= c.wip_limit
      ) over () as wip_blocked_count
    from candidate_rows c
  ), eligible_candidates as (
    select c.*
    from candidate_state c
    where c.availability_fraction > 0
      and (
        c.skill_rank = 0
        or (v_work.priority = 'urgent' and c.skill_rank = 2)
      )
      and (
        v_work.priority = 'urgent'
        or c.in_progress_count < c.wip_limit
      )
  ), eligible_state as (
    select
      c.*,
      true as eligible_for_assignment
    from eligible_candidates c
    union all
    select
      c.*,
      false as eligible_for_assignment
    from candidate_state c
    where not exists (select 1 from eligible_candidates)
  ), ranked_candidates as (
    select
      c.*,
      row_number() over (
        order by
          c.skill_rank asc,
          c.adjusted_load asc,
          c.in_progress_count asc,
          c.assigned_count asc,
          c.overdue_count asc,
          c.last_auto_assigned_at asc,
          c.context_rank asc,
          lower(c.member_code) asc
      ) as winner_rank
    from eligible_state c
  )
  select
    c.id,
    c.user_id,
    c.member_code,
    c.display_name,
    c.availability,
    c.skill_rank,
    c.in_progress_count,
    c.assigned_count,
    c.assignment_load,
    c.availability_fraction,
    c.adjusted_load,
    c.wip_limit,
    c.overdue_count,
    c.last_auto_assigned_at,
    c.leave_fraction,
    c.leave_bucket_count,
    c.full_leave_bucket_count,
    c.window_bucket_count,
    c.candidate_state_version,
    c.candidate_count,
    c.skill_blocked_count,
    c.leave_blocked_count,
    c.wip_blocked_count,
    c.eligible_for_assignment
  into
    v_owner_id,
    v_owner_user_id,
    v_owner_code,
    v_owner_name,
    v_availability,
    v_skill_rank,
    v_in_progress_count,
    v_assigned_count,
    v_assignment_load,
    v_availability_fraction,
    v_adjusted_load,
    v_wip_limit,
    v_overdue_count,
    v_last_auto_assigned_at,
    v_leave_fraction,
    v_leave_bucket_count,
    v_full_leave_bucket_count,
    v_window_bucket_count,
    v_candidate_state_version,
    v_candidate_count,
    v_skill_blocked_count,
    v_leave_blocked_count,
    v_wip_blocked_count,
    v_selected_eligible
  from ranked_candidates c
  where c.winner_rank = 1;

  v_wip_now := v_in_progress_count;
  v_projected_ratio := v_adjusted_load;

  -- Effort is historical metadata. Calculate it only after the winner/state
  -- snapshot has been selected so it cannot influence candidate routing.
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

  if v_owner_id is null or not coalesce(v_selected_eligible, false) then
    if coalesce(v_candidate_count, 0) = 0 then
      v_reason := 'Unassigned: no active linked GD/VE candidate exists.';
    else
      v_reason := format(
        'Unassigned: no eligible GD/VE candidate (skill=%s, leave=%s, wip_limit=%s).',
        v_skill_blocked_count,
        v_leave_blocked_count,
        v_wip_blocked_count
      );
    end if;

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
      'routing_model', 'state_count_v1',
      'in_progress_count', coalesce(v_in_progress_count, 0),
      'assigned_count', coalesce(v_assigned_count, 0),
      'assignment_load', coalesce(v_assignment_load, 0),
      'availability_fraction', coalesce(v_availability_fraction, 0),
      'adjusted_load', coalesce(v_adjusted_load, 0),
      'overdue_count', coalesce(v_overdue_count, 0),
      'last_auto_assigned_at', v_last_auto_assigned_at,
      'candidate_state_version', v_candidate_state_version,
      'warnings', '[]'::jsonb
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
    (1, case when v_work.priority = 'urgent'
                  and v_in_progress_count >= v_wip_limit
                  and length(trim(coalesce(v_work.urgent_reason, ''))) > 0 then
      jsonb_build_object(
        'code', 'wip_override',
        'severity', 'warning',
        'message', 'Urgent work uses the audited WIP override.'
      ) end),
    (2, case when v_skill_rank = 2 then
      jsonb_build_object(
        'code', 'backup_skill',
        'severity', 'info',
        'message', 'At least one requested skill is covered by backup skill configuration.'
      ) end),
    (3, case when v_availability = 'partial'
                  or (v_leave_bucket_count > 0 and v_full_leave_bucket_count = 0)
                  or (v_availability_fraction > 0 and v_availability_fraction < 1) then
      jsonb_build_object(
        'code', 'member_partial',
        'severity', 'warning',
        'message', 'The selected member has partial availability in the production window.'
      ) end),
    (4, case when v_needs_split then
      jsonb_build_object(
        'code', 'needs_split',
        'severity', 'warning',
        'message', 'This request still needs to be split for execution tracking.'
      ) end),
    (5, case when v_work.work_type = 'creative_request'
                  and v_work.launch_date is not null
                  and v_work.due_date > public.flowmate_subtract_th_business_days(v_work.launch_date, 4) then
      jsonb_build_object(
        'code', 'review_buffer_risk',
        'severity', 'warning',
        'message', 'Asset First Draft Due exceeds Launch Date minus 4 Thai business days.'
      ) end),
    (6, case when v_work.work_type = 'creative_request'
                  and v_work.launch_date is not null
                  and v_work.final_approved_due_date is not null
                  and v_work.final_approved_due_date > public.flowmate_subtract_th_business_days(v_work.launch_date, 2) then
      jsonb_build_object(
        'code', 'final_approved_buffer_risk',
        'severity', 'warning',
        'message', 'Asset Final/Approved Due exceeds Launch Date minus 2 Thai business days.'
      ) end)
  ) as w(position, warning)
  where w.warning is not null;

  v_reason := 'Auto best-fit: ' || v_owner_name || ' (' || v_owner_code || ')'
    || '; warnings=' || v_warnings::text;
  v_snapshot := jsonb_build_object(
    'routing_model', 'state_count_v1',
    'in_progress_count', v_in_progress_count,
    'assigned_count', v_assigned_count,
    'assignment_load', v_assignment_load,
    'availability_fraction', v_availability_fraction,
    'adjusted_load', v_adjusted_load,
    'overdue_count', v_overdue_count,
    'last_auto_assigned_at', v_last_auto_assigned_at,
    'candidate_state_version', v_candidate_state_version,
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
    'wip_limit', v_wip_limit
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
$function$
