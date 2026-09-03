-- FlowMate Team Schedule + Simplified Weekly Capacity
-- Run in Supabase SQL Editor before trello_asana_hybrid_backend.sql.
-- Idempotent. Existing work items, allocations, permissions, and history are preserved.

create table if not exists public.flowmate_non_working_days (
  day date primary key,
  name text not null check (length(trim(name)) > 0),
  scope text not null default 'all' check (scope in ('all', 'gdve')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.flowmate_non_working_days enable row level security;
drop policy if exists flowmate_non_working_days_authenticated_read on public.flowmate_non_working_days;
create policy flowmate_non_working_days_authenticated_read
on public.flowmate_non_working_days
for select
to authenticated
using (active = true);

revoke all privileges on public.flowmate_non_working_days from public, anon, authenticated;
grant select on public.flowmate_non_working_days to authenticated;

create index if not exists idx_flowmate_capacity_allocations_bucket_member
on public.flowmate_capacity_allocations(bucket_date, team_member_id, bucket_half);

create or replace view public.latest_assignment_run_v
with (security_invoker = true) as
select distinct on (work_item_id)
  work_item_id,
  ran_at,
  result,
  reason,
  final_owner_member_id,
  capacity_snapshot
from public.assignment_runs
order by work_item_id, ran_at desc;

revoke all privileges on public.latest_assignment_run_v from public, anon, authenticated;
grant select on public.latest_assignment_run_v to authenticated;

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
  wi.final_approved_due_date,
  wi.launch_date,
  et.first_assigned_at,
  et.actual_started_at,
  at.suggested_start_date,
  crd.asset_type,
  crd.asset_subtype
from public.work_items wi
left join public.creative_request_details crd on crd.work_item_id = wi.id
left join event_times et on et.work_item_id = wi.id
left join allocation_times at on at.work_item_id = wi.id
where wi.archived_at is null
  and wi.work_type = 'creative_request';

revoke all privileges on public.flowmate_team_schedule_v from public, anon, authenticated;
grant select on public.flowmate_team_schedule_v to authenticated;

create or replace view public.member_workload_v
with (security_invoker = true) as
select
  tm.id as team_member_id,
  tm.member_code,
  tm.display_name,
  tm.discipline_short,
  tm.skills,
  tm.backup_skills,
  tm.availability,
  tm.capacity_per_day,
  tm.capacity_override_per_day,
  case
    when tm.active = false then 0::numeric
    when tm.availability = 'leave' then 0::numeric
    when tm.availability = 'partial' then tm.capacity_override_per_day
    else tm.capacity_per_day
  end as effective_capacity_per_day,
  coalesce(sum(wi.effort_point) filter (
    where wi.work_type = 'creative_request'
      and wi.status in ('assigned', 'in_progress', 'review', 'blocked')
  ), 0) as assigned_effort,
  count(wi.id) filter (
    where wi.work_type = 'creative_request'
      and wi.status = 'assigned'
  ) as assigned_count,
  count(wi.id) filter (
    where wi.work_type = 'creative_request'
      and wi.status = 'in_progress'
  ) as in_progress_count,
  count(wi.id) filter (
    where wi.work_type = 'creative_request'
      and wi.status = 'review'
  ) as review_count,
  count(wi.id) filter (
    where wi.work_type = 'creative_request'
      and wi.status = 'blocked'
  ) as blocked_count,
  count(wi.id) filter (
    where wi.work_type = 'creative_request'
      and wi.status = 'in_progress'
      and wi.wip_counted = true
  ) as current_wip,
  count(wi.id) filter (
    where wi.status in ('assigned', 'in_progress', 'review', 'blocked')
      and wi.due_date < current_date
  ) as overdue_count,
  count(wi.id) filter (
    where wi.status in ('assigned', 'in_progress', 'review')
      and wi.due_date >= current_date
      and wi.due_date <= current_date + interval '2 days'
  ) as due_soon_count,
  count(wi.id) filter (where wi.work_type = 'quick_task' and wi.status not in ('delivered', 'cancelled')) as quick_task_count
from public.team_members tm
left join public.work_items wi on wi.final_owner_member_id = tm.id
  and wi.archived_at is null
group by tm.id;

revoke all privileges on public.member_workload_v from public, anon, authenticated;
grant select on public.member_workload_v to authenticated;

-- Verification (must return review in the capacity contract):
select 'team_schedule_ready' as check_name,
       to_regclass('public.flowmate_non_working_days') is not null as holiday_table_ready,
       to_regclass('public.flowmate_team_schedule_v') is not null as schedule_view_ready;
