-- FlowMate Creative monthly KPI data foundation
--
-- Scope:
-- - additive, read-only reporting objects only;
-- - Creative Request facts and monthly GD/VE + Requester aggregates;
-- - no transactional work-item mutation and no change to T-7/T-5 scheduling.
--
-- Apply only after separate approval. Run the paired read-only verifier last.

begin;

do $preflight$
begin
  if to_regclass('public.work_items') is null
     or to_regclass('public.work_item_events') is null
     or to_regclass('public.assignment_runs') is null
     or to_regclass('public.comments') is null
     or to_regclass('public.team_members') is null
     or to_regclass('public.users') is null
     or to_regclass('public.creative_request_details') is null
     or to_regclass('public.flowmate_non_working_days') is null
     or to_regprocedure('public.flowmate_current_user_has_all_team_access()') is null then
    raise exception
      'FlowMate Creative KPI prerequisites are missing; run the canonical workflow, team-workspace, and calendar SQL first';
  end if;
end;
$preflight$;

-- Central database gate for individual KPI data. Reuse the canonical
-- current-user authorization wrapper and keep this public helper invoker-only.
create or replace function public.flowmate_kpi_can_view()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.flowmate_current_user_has_all_team_access();
$$;

-- Working-date equivalents use 24-hour fractions on eligible Bangkok dates.
-- This intentionally does not represent employee timesheets or office hours.
create or replace function public.flowmate_kpi_working_duration_days(
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_calendar_scope text default 'all'
)
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_started_local timestamp;
  v_ended_local timestamp;
  v_days numeric;
begin
  if p_started_at is null or p_ended_at is null then
    return null;
  end if;

  if p_calendar_scope not in ('all', 'gdve', 'requester') then
    raise exception 'Unsupported KPI calendar scope: %', p_calendar_scope;
  end if;

  if p_ended_at < p_started_at then
    return null;
  end if;

  v_started_local := p_started_at at time zone 'Asia/Bangkok';
  v_ended_local := p_ended_at at time zone 'Asia/Bangkok';

  select coalesce(sum(
    extract(epoch from (
      least(v_ended_local, day_slice.day_start + interval '1 day')
      - greatest(v_started_local, day_slice.day_start)
    )) / 86400.0
  ), 0)::numeric
  into v_days
  from pg_catalog.generate_series(
    date_trunc('day', v_started_local),
    date_trunc('day', v_ended_local),
    interval '1 day'
  ) as day_slice(day_start)
  where extract(isodow from day_slice.day_start)::integer between 1 and 5
    and not exists (
      select 1
      from public.flowmate_non_working_days h
      where h.day = day_slice.day_start::date
        and h.active = true
        and (
          h.scope = 'all'
          or (p_calendar_scope = 'gdve' and h.scope = 'gdve')
        )
    );

  return round(v_days, 6);
end;
$$;

-- Signed working-date gap. Same-day Brief Ready and Launch is zero; a Brief
-- Ready date after Launch returns a negative value.
create or replace function public.flowmate_kpi_working_date_gap(
  p_started_on date,
  p_ended_on date,
  p_calendar_scope text default 'all'
)
returns integer
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_days integer;
begin
  if p_started_on is null or p_ended_on is null then
    return null;
  end if;

  if p_calendar_scope not in ('all', 'gdve', 'requester') then
    raise exception 'Unsupported KPI calendar scope: %', p_calendar_scope;
  end if;

  if p_started_on = p_ended_on then
    return 0;
  end if;

  if p_ended_on > p_started_on then
    select count(*)::integer
    into v_days
    from pg_catalog.generate_series(
      p_started_on + 1,
      p_ended_on,
      interval '1 day'
    ) as day_slice(day_start)
    where extract(isodow from day_slice.day_start)::integer between 1 and 5
      and not exists (
        select 1
        from public.flowmate_non_working_days h
        where h.day = day_slice.day_start::date
          and h.active = true
          and (
            h.scope = 'all'
            or (p_calendar_scope = 'gdve' and h.scope = 'gdve')
          )
      );
    return v_days;
  end if;

  select count(*)::integer
  into v_days
  from pg_catalog.generate_series(
    p_ended_on + 1,
    p_started_on,
    interval '1 day'
  ) as day_slice(day_start)
  where extract(isodow from day_slice.day_start)::integer between 1 and 5
    and not exists (
      select 1
      from public.flowmate_non_working_days h
      where h.day = day_slice.day_start::date
        and h.active = true
        and (
          h.scope = 'all'
          or (p_calendar_scope = 'gdve' and h.scope = 'gdve')
        )
    );

  return -v_days;
end;
$$;

create or replace view public.flowmate_creative_kpi_facts_v
with (security_invoker = true) as
with history as (
  select
    wi.id as work_item_id,
    wi.display_id,
    wi.priority,
    wi.effort_point,
    wi.status,
    wi.requester_user_id,
    wi.requester_team,
    wi.final_owner_member_id as current_owner_member_id,
    wi.due_date,
    wi.final_approved_due_date,
    wi.launch_date,
    wi.delivered_at,
    wi.archived_at,
    crd.asset_type,
    crd.asset_subtype,
    crd.asset_count,
    assigned.created_at as assigned_at,
    started.created_at as started_at,
    review.created_at as review_submitted_at,
    brief_ready.ran_at as brief_ready_at,
    first_assignment.result as first_assignment_result,
    owner_assignment.final_owner_member_id as historical_owner_member_id,
    requester_comment.created_at as first_requester_comment_at,
    requester_decision.created_at as review_decided_at,
    requester_decision.to_status as review_decision_status,
    requester_decision.actor_user_id as review_decision_by_user_id,
    any_decision.created_at as first_any_review_decision_at,
    any_decision.actor_user_id as first_any_review_decision_by_user_id,
    rework.created_at as rework_at,
    admin_override.has_admin_override,
    coalesce(blocked.blocked_days, 0::numeric) as blocked_during_production_working_days
  from public.work_items wi
  left join public.creative_request_details crd
    on crd.work_item_id = wi.id
  left join lateral (
    select e.created_at
    from public.work_item_events e
    where e.work_item_id = wi.id
      and e.to_status = 'assigned'
    order by e.created_at, e.id
    limit 1
  ) assigned on true
  left join lateral (
    select e.created_at
    from public.work_item_events e
    where e.work_item_id = wi.id
      and e.to_status = 'in_progress'
      and (assigned.created_at is null or e.created_at >= assigned.created_at)
    order by e.created_at, e.id
    limit 1
  ) started on true
  left join lateral (
    select e.created_at
    from public.work_item_events e
    where e.work_item_id = wi.id
      and e.from_status = 'in_progress'
      and e.to_status = 'review'
      and (started.created_at is null or e.created_at >= started.created_at)
    order by e.created_at, e.id
    limit 1
  ) review on true
  left join lateral (
    select ar.ran_at
    from public.assignment_runs ar
    where ar.work_item_id = wi.id
      and ar.result::text in ('assigned', 'unassigned', 'queued')
    order by ar.ran_at, ar.id
    limit 1
  ) brief_ready on true
  left join lateral (
    select ar.result::text as result
    from public.assignment_runs ar
    where ar.work_item_id = wi.id
    order by ar.ran_at, ar.id
    limit 1
  ) first_assignment on true
  left join lateral (
    select ar.final_owner_member_id
    from public.assignment_runs ar
    where ar.work_item_id = wi.id
      and ar.final_owner_member_id is not null
      and (started.created_at is null or ar.ran_at <= started.created_at)
    order by ar.ran_at desc, ar.id desc
    limit 1
  ) owner_assignment on true
  left join lateral (
    select c.created_at
    from public.comments c
    where c.work_item_id = wi.id
      and c.author_user_id = wi.requester_user_id
      and c.deleted_at is null
      and review.created_at is not null
      and c.created_at >= review.created_at
    order by c.created_at, c.id
    limit 1
  ) requester_comment on true
  left join lateral (
    select e.created_at, e.to_status, e.actor_user_id
    from public.work_item_events e
    where e.work_item_id = wi.id
      and e.from_status = 'review'
      and e.to_status in ('delivered', 'in_progress', 'cancelled')
      and e.actor_user_id = wi.requester_user_id
      and review.created_at is not null
      and e.created_at >= review.created_at
    order by e.created_at, e.id
    limit 1
  ) requester_decision on true
  left join lateral (
    select e.created_at, e.actor_user_id
    from public.work_item_events e
    where e.work_item_id = wi.id
      and e.from_status = 'review'
      and e.to_status in ('delivered', 'in_progress', 'cancelled')
      and review.created_at is not null
      and e.created_at >= review.created_at
    order by e.created_at, e.id
    limit 1
  ) any_decision on true
  left join lateral (
    select e.created_at
    from public.work_item_events e
    where e.work_item_id = wi.id
      and e.from_status = 'review'
      and e.to_status = 'in_progress'
      and review.created_at is not null
      and e.created_at >= review.created_at
    order by e.created_at, e.id
    limit 1
  ) rework on true
  left join lateral (
    select exists (
      select 1
      from public.work_item_events e
      where e.work_item_id = wi.id
        and (
          lower(coalesce(e.metadata ->> 'admin_override', 'false')) = 'true'
          or e.metadata ->> 'source' = 'admin_override'
        )
    ) as has_admin_override
  ) admin_override on true
  left join lateral (
    select coalesce(sum(
      public.flowmate_kpi_working_duration_days(
        greatest(block_event.created_at, started.created_at),
        least(coalesce(resumed.created_at, review.created_at), review.created_at),
        'gdve'
      )
    ), 0::numeric) as blocked_days
    from public.work_item_events block_event
    left join lateral (
      select e.created_at
      from public.work_item_events e
      where e.work_item_id = block_event.work_item_id
        and e.created_at > block_event.created_at
        and e.from_status = 'blocked'
        and e.to_status is not null
      order by e.created_at, e.id
      limit 1
    ) resumed on true
    where block_event.work_item_id = wi.id
      and block_event.to_status = 'blocked'
      and started.created_at is not null
      and review.created_at is not null
      and block_event.created_at < review.created_at
  ) blocked on true
  where wi.work_type = 'creative_request'
    and public.flowmate_kpi_can_view()
), resolved as (
  select
    history.*,
    coalesce(
      history.historical_owner_member_id,
      history.current_owner_member_id
    ) as owner_member_id_at_start,
    case
      when history.first_requester_comment_at is null then history.review_decided_at
      when history.review_decided_at is null then history.first_requester_comment_at
      else least(history.first_requester_comment_at, history.review_decided_at)
    end as first_requester_activity_at,
    case history.review_decision_status
      when 'delivered' then 'approved'
      when 'in_progress' then 'changes_requested'
      when 'cancelled' then 'cancelled'
      else null
    end as review_decision
  from history
), named as (
  select
    resolved.*,
    owner.display_name as owner_name_at_start,
    coalesce(owner.discipline_short, owner.discipline) as owner_discipline,
    requester.display_name as requester_name
  from resolved
  left join public.team_members owner
    on owner.id = resolved.owner_member_id_at_start
  left join public.users requester
    on requester.id = resolved.requester_user_id
), measured as (
  select
    named.*,
    date_trunc(
      'month',
      named.review_submitted_at at time zone 'Asia/Bangkok'
    )::date as review_month,
    public.flowmate_kpi_working_duration_days(
      named.assigned_at,
      named.started_at,
      'gdve'
    ) as assigned_to_started_working_days,
    public.flowmate_kpi_working_duration_days(
      named.started_at,
      named.review_submitted_at,
      'gdve'
    ) as raw_production_working_days,
    case
      when named.started_at is null or named.review_submitted_at is null then null
      else greatest(
        public.flowmate_kpi_working_duration_days(
          named.started_at,
          named.review_submitted_at,
          'gdve'
        ) - named.blocked_during_production_working_days,
        0::numeric
      )
    end as production_working_days,
    public.flowmate_kpi_working_duration_days(
      named.review_submitted_at,
      named.first_requester_activity_at,
      'requester'
    ) as review_first_response_working_days,
    public.flowmate_kpi_working_duration_days(
      named.review_submitted_at,
      named.review_decided_at,
      'requester'
    ) as review_decision_working_days,
    public.flowmate_kpi_working_duration_days(
      named.review_submitted_at,
      now(),
      'requester'
    ) as review_open_age_working_days,
    public.flowmate_kpi_working_date_gap(
      (named.brief_ready_at at time zone 'Asia/Bangkok')::date,
      named.launch_date,
      'requester'
    ) as brief_to_launch_working_days
  from named
)
select
  measured.work_item_id,
  measured.display_id,
  measured.priority,
  measured.effort_point,
  measured.status,
  measured.asset_type,
  measured.asset_subtype,
  measured.asset_count,
  measured.requester_user_id,
  measured.requester_name,
  measured.requester_team,
  measured.owner_member_id_at_start,
  measured.owner_name_at_start,
  measured.owner_discipline,
  measured.current_owner_member_id,
  measured.due_date,
  measured.final_approved_due_date,
  measured.launch_date,
  measured.assigned_at,
  measured.started_at,
  measured.review_submitted_at,
  measured.review_month,
  measured.brief_ready_at,
  measured.brief_ready_at is not null as brief_ready_is_proxy,
  measured.first_assignment_result,
  measured.first_requester_activity_at,
  measured.review_decided_at,
  measured.review_decision,
  measured.review_decision_by_user_id,
  measured.rework_at,
  measured.delivered_at,
  measured.archived_at,
  measured.assigned_to_started_working_days,
  measured.raw_production_working_days,
  measured.blocked_during_production_working_days,
  measured.production_working_days,
  measured.review_first_response_working_days,
  measured.review_decision_working_days,
  measured.review_open_age_working_days,
  measured.brief_to_launch_working_days,
  case
    when measured.review_submitted_at is null then null
    else (measured.review_submitted_at at time zone 'Asia/Bangkok')::date <= measured.due_date
  end as first_draft_on_time,
  case
    when measured.first_requester_activity_at is null then false
    else public.flowmate_kpi_working_date_gap(
      (measured.review_submitted_at at time zone 'Asia/Bangkok')::date,
      (measured.first_requester_activity_at at time zone 'Asia/Bangkok')::date,
      'requester'
    ) <= 1
  end as review_sla_met,
  case
    when measured.review_submitted_at is null then false
    when measured.first_requester_activity_at is not null then true
    else public.flowmate_kpi_working_date_gap(
      (measured.review_submitted_at at time zone 'Asia/Bangkok')::date,
      (now() at time zone 'Asia/Bangkok')::date,
      'requester'
    ) > 1
  end as review_sla_eligible,
  measured.first_assignment_result is not null
    and measured.first_assignment_result <> 'need_brief' as brief_complete_first_pass,
  array_remove(array[
    case when measured.assigned_at is null then 'missing_assigned_event' end,
    case when measured.started_at is null then 'missing_started_event' end,
    case when measured.review_submitted_at is null then 'missing_review_event' end,
    case when measured.brief_ready_at is null then 'missing_brief_ready_proxy' end,
    case when measured.owner_member_id_at_start is null then 'missing_owner_at_start' end,
    case
      when measured.historical_owner_member_id is null
       and measured.current_owner_member_id is not null
       and measured.started_at is not null
      then 'owner_snapshot_fallback'
    end,
    case
      when measured.first_any_review_decision_at is not null
       and measured.review_decided_at is null
      then 'review_decision_actor_mismatch'
    end,
    case
      when measured.assigned_at is not null
       and measured.started_at is not null
       and measured.started_at < measured.assigned_at
      then 'invalid_assigned_started_sequence'
    end,
    case
      when measured.started_at is not null
       and measured.review_submitted_at is not null
       and measured.review_submitted_at < measured.started_at
      then 'invalid_started_review_sequence'
    end
  ], null)::text[] as data_quality_flags,
  array_remove(array[
    case when measured.priority = 'urgent' then 'urgent' end,
    case when measured.has_admin_override then 'admin_override' end,
    case when measured.rework_at is not null then 'rework' end,
    case when measured.review_decision = 'cancelled' then 'cancelled_after_review' end
  ], null)::text[] as exception_flags
from measured;

create or replace view public.flowmate_creative_kpi_gdve_monthly_v
with (security_invoker = true) as
with base as (
  select *
  from public.flowmate_creative_kpi_facts_v
  where review_submitted_at is not null
), rollup as (
  select
    'team'::text as scope,
    review_month,
    null::uuid as person_id,
    'All GD/VE'::text as person_name,
    'GD/VE'::text as person_group,
    count(*) as n,
    count(assigned_to_started_working_days) as time_to_start_n,
    percentile_cont(0.5) within group (order by assigned_to_started_working_days) as time_to_start_p50,
    percentile_cont(0.85) within group (order by assigned_to_started_working_days) as time_to_start_p85,
    avg(assigned_to_started_working_days) as time_to_start_avg,
    count(*) filter (where assigned_to_started_working_days is null) as time_to_start_missing_n,
    count(production_working_days) as production_n,
    percentile_cont(0.5) within group (order by production_working_days) as production_p50,
    percentile_cont(0.85) within group (order by production_working_days) as production_p85,
    avg(production_working_days) as production_avg,
    count(*) filter (where production_working_days is null) as production_missing_n,
    count(*) filter (where first_draft_on_time is not null) as first_draft_on_time_denominator,
    count(*) filter (where first_draft_on_time) as first_draft_on_time_n,
    100.0 * count(*) filter (where first_draft_on_time)
      / nullif(count(*) filter (where first_draft_on_time is not null), 0) as first_draft_on_time_pct,
    count(*) filter (where review_decision in ('approved', 'changes_requested')) as first_pass_denominator,
    count(*) filter (where review_decision = 'approved' and rework_at is null) as first_pass_approval_n,
    100.0 * count(*) filter (where review_decision = 'approved' and rework_at is null)
      / nullif(count(*) filter (where review_decision in ('approved', 'changes_requested')), 0) as first_pass_approval_pct,
    count(*) as throughput_n,
    coalesce(sum(effort_point), 0) as delivered_effort,
    count(*) filter (where rework_at is not null) as rework_exception_n,
    100.0 * count(*) filter (where rework_at is not null) / nullif(count(*), 0) as rework_exception_pct,
    count(*) filter (
      where cardinality(exception_flags) > 0 or cardinality(data_quality_flags) > 0
    ) as exception_n
  from base
  group by review_month

  union all

  select
    'person'::text as scope,
    review_month,
    owner_member_id_at_start as person_id,
    coalesce(owner_name_at_start, 'Unknown owner') as person_name,
    coalesce(owner_discipline, 'N/A') as person_group,
    count(*) as n,
    count(assigned_to_started_working_days) as time_to_start_n,
    percentile_cont(0.5) within group (order by assigned_to_started_working_days) as time_to_start_p50,
    percentile_cont(0.85) within group (order by assigned_to_started_working_days) as time_to_start_p85,
    avg(assigned_to_started_working_days) as time_to_start_avg,
    count(*) filter (where assigned_to_started_working_days is null) as time_to_start_missing_n,
    count(production_working_days) as production_n,
    percentile_cont(0.5) within group (order by production_working_days) as production_p50,
    percentile_cont(0.85) within group (order by production_working_days) as production_p85,
    avg(production_working_days) as production_avg,
    count(*) filter (where production_working_days is null) as production_missing_n,
    count(*) filter (where first_draft_on_time is not null) as first_draft_on_time_denominator,
    count(*) filter (where first_draft_on_time) as first_draft_on_time_n,
    100.0 * count(*) filter (where first_draft_on_time)
      / nullif(count(*) filter (where first_draft_on_time is not null), 0) as first_draft_on_time_pct,
    count(*) filter (where review_decision in ('approved', 'changes_requested')) as first_pass_denominator,
    count(*) filter (where review_decision = 'approved' and rework_at is null) as first_pass_approval_n,
    100.0 * count(*) filter (where review_decision = 'approved' and rework_at is null)
      / nullif(count(*) filter (where review_decision in ('approved', 'changes_requested')), 0) as first_pass_approval_pct,
    count(*) as throughput_n,
    coalesce(sum(effort_point), 0) as delivered_effort,
    count(*) filter (where rework_at is not null) as rework_exception_n,
    100.0 * count(*) filter (where rework_at is not null) / nullif(count(*), 0) as rework_exception_pct,
    count(*) filter (
      where cardinality(exception_flags) > 0 or cardinality(data_quality_flags) > 0
    ) as exception_n
  from base
  group by review_month, owner_member_id_at_start, owner_name_at_start, owner_discipline
)
select rollup.*, rollup.n < 5 as small_sample
from rollup;

create or replace view public.flowmate_creative_kpi_requester_monthly_v
with (security_invoker = true) as
with base as (
  select *
  from public.flowmate_creative_kpi_facts_v
  where review_submitted_at is not null
), rollup as (
  select
    'team'::text as scope,
    review_month,
    null::uuid as person_id,
    'All Requesters'::text as person_name,
    'All teams'::text as person_group,
    count(*) as n,
    count(brief_to_launch_working_days) as brief_lead_n,
    percentile_cont(0.15) within group (order by brief_to_launch_working_days) as brief_lead_p15,
    percentile_cont(0.5) within group (order by brief_to_launch_working_days) as brief_lead_p50,
    percentile_cont(0.85) within group (order by brief_to_launch_working_days) as brief_lead_p85,
    avg(brief_to_launch_working_days) as brief_lead_avg,
    count(*) filter (where brief_to_launch_working_days is null) as brief_lead_missing_n,
    count(*) filter (where brief_to_launch_working_days <= 0) as brief_late_or_same_day_n,
    count(review_first_response_working_days) as review_response_n,
    percentile_cont(0.5) within group (order by review_first_response_working_days) as review_response_p50,
    percentile_cont(0.85) within group (order by review_first_response_working_days) as review_response_p85,
    avg(review_first_response_working_days) as review_response_avg,
    count(*) filter (where review_first_response_working_days is null) as review_response_missing_n,
    count(review_decision_working_days) as review_decision_n,
    percentile_cont(0.5) within group (order by review_decision_working_days) as review_decision_p50,
    percentile_cont(0.85) within group (order by review_decision_working_days) as review_decision_p85,
    avg(review_decision_working_days) as review_decision_avg,
    count(*) filter (where review_decision_working_days is null) as review_decision_missing_n,
    count(*) filter (where review_sla_eligible) as review_sla_denominator,
    count(*) filter (where review_sla_eligible and review_sla_met) as review_sla_n,
    100.0 * count(*) filter (where review_sla_eligible and review_sla_met)
      / nullif(count(*) filter (where review_sla_eligible), 0) as review_sla_pct,
    count(*) filter (
      where review_sla_eligible and not review_sla_met and first_requester_activity_at is null
    ) as pending_review_over_sla_n,
    count(*) filter (where first_assignment_result is not null) as brief_quality_denominator,
    count(*) filter (where brief_complete_first_pass) as brief_complete_first_pass_n,
    100.0 * count(*) filter (where brief_complete_first_pass)
      / nullif(count(*) filter (where first_assignment_result is not null), 0) as brief_complete_first_pass_pct,
    count(*) filter (where rework_at is not null) as rework_exception_n,
    100.0 * count(*) filter (where rework_at is not null) / nullif(count(*), 0) as rework_exception_pct,
    count(*) filter (
      where cardinality(exception_flags) > 0 or cardinality(data_quality_flags) > 0
    ) as exception_n
  from base
  group by review_month

  union all

  select
    'person'::text as scope,
    review_month,
    requester_user_id as person_id,
    coalesce(requester_name, 'Unknown requester') as person_name,
    coalesce(requester_team, 'N/A') as person_group,
    count(*) as n,
    count(brief_to_launch_working_days) as brief_lead_n,
    percentile_cont(0.15) within group (order by brief_to_launch_working_days) as brief_lead_p15,
    percentile_cont(0.5) within group (order by brief_to_launch_working_days) as brief_lead_p50,
    percentile_cont(0.85) within group (order by brief_to_launch_working_days) as brief_lead_p85,
    avg(brief_to_launch_working_days) as brief_lead_avg,
    count(*) filter (where brief_to_launch_working_days is null) as brief_lead_missing_n,
    count(*) filter (where brief_to_launch_working_days <= 0) as brief_late_or_same_day_n,
    count(review_first_response_working_days) as review_response_n,
    percentile_cont(0.5) within group (order by review_first_response_working_days) as review_response_p50,
    percentile_cont(0.85) within group (order by review_first_response_working_days) as review_response_p85,
    avg(review_first_response_working_days) as review_response_avg,
    count(*) filter (where review_first_response_working_days is null) as review_response_missing_n,
    count(review_decision_working_days) as review_decision_n,
    percentile_cont(0.5) within group (order by review_decision_working_days) as review_decision_p50,
    percentile_cont(0.85) within group (order by review_decision_working_days) as review_decision_p85,
    avg(review_decision_working_days) as review_decision_avg,
    count(*) filter (where review_decision_working_days is null) as review_decision_missing_n,
    count(*) filter (where review_sla_eligible) as review_sla_denominator,
    count(*) filter (where review_sla_eligible and review_sla_met) as review_sla_n,
    100.0 * count(*) filter (where review_sla_eligible and review_sla_met)
      / nullif(count(*) filter (where review_sla_eligible), 0) as review_sla_pct,
    count(*) filter (
      where review_sla_eligible and not review_sla_met and first_requester_activity_at is null
    ) as pending_review_over_sla_n,
    count(*) filter (where first_assignment_result is not null) as brief_quality_denominator,
    count(*) filter (where brief_complete_first_pass) as brief_complete_first_pass_n,
    100.0 * count(*) filter (where brief_complete_first_pass)
      / nullif(count(*) filter (where first_assignment_result is not null), 0) as brief_complete_first_pass_pct,
    count(*) filter (where rework_at is not null) as rework_exception_n,
    100.0 * count(*) filter (where rework_at is not null) / nullif(count(*), 0) as rework_exception_pct,
    count(*) filter (
      where cardinality(exception_flags) > 0 or cardinality(data_quality_flags) > 0
    ) as exception_n
  from base
  group by review_month, requester_user_id, requester_name, requester_team
)
select rollup.*, rollup.n < 5 as small_sample
from rollup;

revoke all on function public.flowmate_kpi_can_view() from public, anon, authenticated;
revoke all on function public.flowmate_kpi_working_duration_days(timestamptz, timestamptz, text)
from public, anon, authenticated;
revoke all on function public.flowmate_kpi_working_date_gap(date, date, text)
from public, anon, authenticated;

grant execute on function public.flowmate_kpi_can_view() to authenticated;
grant execute on function public.flowmate_kpi_working_duration_days(timestamptz, timestamptz, text)
to authenticated;
grant execute on function public.flowmate_kpi_working_date_gap(date, date, text)
to authenticated;

revoke all privileges on public.flowmate_creative_kpi_facts_v from public, anon, authenticated;
revoke all privileges on public.flowmate_creative_kpi_gdve_monthly_v from public, anon, authenticated;
revoke all privileges on public.flowmate_creative_kpi_requester_monthly_v from public, anon, authenticated;

grant select on public.flowmate_creative_kpi_facts_v to authenticated;
grant select on public.flowmate_creative_kpi_gdve_monthly_v to authenticated;
grant select on public.flowmate_creative_kpi_requester_monthly_v to authenticated;

commit;

-- Verification queries: run creative_monthly_kpi_data_foundation_verify.sql.
--
-- Rollback guidance (manual, separate approval):
-- drop view if exists public.flowmate_creative_kpi_requester_monthly_v;
-- drop view if exists public.flowmate_creative_kpi_gdve_monthly_v;
-- drop view if exists public.flowmate_creative_kpi_facts_v;
-- drop function if exists public.flowmate_kpi_working_date_gap(date, date, text);
-- drop function if exists public.flowmate_kpi_working_duration_days(timestamptz, timestamptz, text);
-- drop function if exists public.flowmate_kpi_can_view();
