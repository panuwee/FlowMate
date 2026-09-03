-- FlowMate Production Insights for Marketing Plan Supervisor
-- Run after the FlowMate schema, Creative Request details, Team Settings,
-- workflow workspace visibility, and Marketing Plan Supervisor reporting SQL.
--
-- These views are read-time reporting surfaces only. They preserve historical
-- Effort as cohort context and do not change assignment, deadline, WIP,
-- urgency, warning, or normal operational UI logic.

begin;

create or replace view public.flowmate_production_samples_v
with (security_invoker = true) as
with ordered_events as (
  select
    e.work_item_id,
    e.to_status,
    e.created_at,
    lead(e.created_at, 1, wi.delivered_at) over (
      partition by e.work_item_id order by e.created_at, e.id
    ) as next_at
  from public.work_item_events e
  join public.work_items wi on wi.id = e.work_item_id
  where wi.work_type = 'creative_request'
    and wi.status = 'delivered'
    and wi.delivered_at is not null
    and e.to_status is not null
),
active_time as (
  select
    work_item_id,
    sum(extract(epoch from (next_at - created_at)) / 3600.0)
      filter (where to_status = 'in_progress' and next_at > created_at)
      as active_production_hours
  from ordered_events
  group by work_item_id
)
select
  wi.id as work_item_id,
  wi.display_id,
  wi.requester_team as team,
  crd.asset_type::text as asset_type,
  crd.asset_subtype,
  wi.priority::text as priority,
  wi.status::text as status,
  wi.effort_point,
  wi.delivered_at,
  (wi.delivered_at at time zone 'Asia/Bangkok')::date as delivered_date,
  at.active_production_hours
from public.work_items wi
join public.creative_request_details crd on crd.work_item_id = wi.id
join active_time at on at.work_item_id = wi.id
where wi.status = 'delivered'
  and at.active_production_hours > 0
  and public.is_admin_app_user();

create or replace view public.flowmate_production_operations_v
with (security_invoker = true) as
with operation_rows as (
  select
    coalesce(wi.requester_team, 'Unspecified') as team,
    crd.asset_subtype,
    wi.priority::text as priority,
    wi.status::text as status,
    wi.due_date,
    wi.status in ('assigned', 'in_progress', 'review', 'blocked')
      and (
        tm.availability = 'leave'
        or coalesce(actual_leave.has_full_leave, false)
      ) as owner_on_leave,
    wi.status in ('assigned', 'in_progress', 'review', 'blocked')
      and not (
        tm.availability = 'leave'
        or coalesce(actual_leave.has_full_leave, false)
      )
      and (
        coalesce(actual_leave.has_any_leave, false)
        or tm.availability = 'partial'
      ) as owner_partial
  from public.work_items wi
  join public.creative_request_details crd on crd.work_item_id = wi.id
  left join public.team_members tm on tm.id = wi.final_owner_member_id
  left join lateral (
    with overlapping_requests as materialized (
      select
        greatest(lr.start_date, current_date) as overlap_start,
        least(
          lr.end_date,
          greatest(current_date, coalesce(wi.due_date, current_date))
        ) as overlap_end
      from public.leave_requests lr
      where lr.team_member_id = wi.final_owner_member_id
        and lr.cancelled_at is null
        and lr.start_date <= greatest(current_date, coalesce(wi.due_date, current_date))
        and lr.end_date >= current_date
    ),
    leave_days as (
      select distinct days.bucket_date::date as bucket_date
      from overlapping_requests overlap
      cross join lateral generate_series(
        overlap.overlap_start,
        overlap.overlap_end,
        interval '1 day'
      ) as days(bucket_date)
    ),
    day_coverage as (
      select
        days.bucket_date,
        count(*) filter (
          where public.flowmate_leave_fraction_for_bucket(
            wi.final_owner_member_id,
            days.bucket_date,
            halves.bucket_half
          ) > 0
        )::integer as covered_half_count
      from leave_days days
      cross join (values ('am'), ('pm')) as halves(bucket_half)
      group by days.bucket_date
    )
    select
      exists (select 1 from overlapping_requests) as has_any_leave,
      coalesce(bool_or(day_coverage.covered_half_count = 2), false) as has_full_leave
    from day_coverage
  ) actual_leave
    on wi.status in ('assigned', 'in_progress', 'review', 'blocked')
  where wi.work_type = 'creative_request'
    and wi.archived_at is null
    and public.is_admin_app_user()
)
select
  team,
  asset_subtype,
  priority,
  status,
  count(*) as task_count,
  count(*) filter (where due_date < current_date) as overdue_count,
  count(*) filter (
    where due_date between current_date and current_date + 2
  ) as due_soon_count,
  count(*) filter (where owner_on_leave) as owner_on_leave_count,
  count(*) filter (where owner_partial) as owner_partial_count
from operation_rows
group by
  team,
  asset_subtype,
  priority,
  status;

create or replace view public.flowmate_legacy_capacity_warning_v
with (security_invoker = true) as
select
  date_trunc('month', ar.ran_at at time zone 'Asia/Bangkok')::date as month_start,
  coalesce(wi.requester_team, 'Unspecified') as team,
  warning.value ->> 'code' as warning_code,
  count(*) as warning_count
from public.assignment_runs ar
join public.work_items wi on wi.id = ar.work_item_id
cross join lateral jsonb_array_elements(
  coalesce(ar.capacity_snapshot -> 'warnings', '[]'::jsonb)
) as warning(value)
where warning.value ->> 'code' in ('over_capacity', 'deadline_capacity_gap')
  and public.is_admin_app_user()
group by
  date_trunc('month', ar.ran_at at time zone 'Asia/Bangkok')::date,
  coalesce(wi.requester_team, 'Unspecified'),
  warning.value ->> 'code';

revoke all privileges on public.flowmate_production_samples_v from public, anon, authenticated;
grant select on public.flowmate_production_samples_v to authenticated;

revoke all privileges on public.flowmate_production_operations_v from public, anon, authenticated;
grant select on public.flowmate_production_operations_v to authenticated;

revoke all privileges on public.flowmate_legacy_capacity_warning_v from public, anon, authenticated;
grant select on public.flowmate_legacy_capacity_warning_v to authenticated;

commit;
