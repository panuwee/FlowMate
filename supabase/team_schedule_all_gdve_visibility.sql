-- FlowMate Team Schedule: all-team GD/VE visibility
-- Run after team_schedule_weekly_capacity.sql.
-- Read-only and idempotent. This does not change work_items RLS, so Board,
-- List, and Detail keep their existing team-scoped visibility.

create or replace function public.flowmate_list_team_schedule()
returns table (
  work_item_id uuid,
  display_id text,
  title text,
  status text,
  priority text,
  owner_member_id uuid,
  first_draft_date date,
  final_approved_due_date date,
  launch_date date,
  first_assigned_at timestamptz,
  actual_started_at timestamptz,
  suggested_start_date date,
  asset_type text,
  asset_subtype text
)
language sql
stable
security definer
set search_path = ''
as $$
  with event_times as (
    select
      wie.work_item_id,
      min(wie.created_at) filter (
        where wie.to_status = 'assigned'
           or wie.event_type::text = 'assigned'
      ) as first_assigned_at,
      min(wie.created_at) filter (
        where wie.to_status = 'in_progress'
      ) as actual_started_at
    from public.work_item_events wie
    group by wie.work_item_id
  ), allocation_times as (
    select
      fca.work_item_id,
      min(fca.bucket_date) as suggested_start_date
    from public.flowmate_capacity_allocations fca
    group by fca.work_item_id
  )
  select
    wi.id as work_item_id,
    wi.display_id,
    wi.title,
    wi.status::text,
    wi.priority::text,
    wi.final_owner_member_id as owner_member_id,
    wi.due_date as first_draft_date,
    wi.final_approved_due_date,
    wi.launch_date,
    et.first_assigned_at,
    et.actual_started_at,
    at.suggested_start_date,
    crd.asset_type::text,
    crd.asset_subtype::text
  from public.work_items wi
  join public.team_members tm
    on tm.id = wi.final_owner_member_id
  left join public.creative_request_details crd
    on crd.work_item_id = wi.id
  left join event_times et
    on et.work_item_id = wi.id
  left join allocation_times at
    on at.work_item_id = wi.id
  where (select public.is_active_app_user())
    and wi.archived_at is null
    and wi.work_type = 'creative_request'
    and wi.status in ('assigned', 'in_progress', 'review', 'blocked')
    and tm.active = true
    and public.flowmate_normalize_team_code(
      tm.discipline
    ) = 'gdve'
  order by wi.due_date asc nulls last, wi.display_id asc;
$$;

revoke all on function public.flowmate_list_team_schedule() from public, anon, authenticated;
grant execute on function public.flowmate_list_team_schedule() to authenticated;

comment on function public.flowmate_list_team_schedule() is
  'Read-only all-team Team Schedule projection for active GD/VE Creative Requests. Does not broaden work_items RLS.';

select
  'team_schedule_all_gdve_visibility_ready' as check_name,
  to_regprocedure('public.flowmate_list_team_schedule()') is not null as rpc_ready;
