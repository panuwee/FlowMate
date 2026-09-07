with active_rows_base as (
  select
    wi.id as work_item_id,
    wi.display_id,
    wi.status::text as status,
    wi.priority::text as priority,
    wi.due_date as first_draft_date,
    wi.final_approved_due_date,
    wi.launch_date,
    wi.final_owner_member_id as owner_member_id,
    tm.display_name as owner_name,
    tm.active as owner_active,
    public.flowmate_normalize_team_code(tm.discipline) as owner_team_code,
    coalesce(nullif(trim(crd.asset_subtype::text), ''), nullif(trim(crd.asset_type::text), ''), '-') as skill_label
  from public.work_items wi
  left join public.team_members tm
    on tm.id = wi.final_owner_member_id
  left join public.creative_request_details crd
    on crd.work_item_id = wi.id
  where wi.archived_at is null
    and wi.work_type = 'creative_request'
    and wi.status in ('assigned', 'in_progress', 'review', 'blocked')
),
schedule_rows as (
  select *
  from active_rows_base
  where owner_member_id is not null
    and owner_active = true
    and owner_team_code = 'gdve'
),
status_counts as (
  select coalesce(
    jsonb_object_agg(status, row_count order by status),
    '{}'::jsonb
  ) as data
  from (
    select status, count(*)::int as row_count
    from schedule_rows
    group by status
  ) counts
),
assignee_counts as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'owner_name', owner_name,
        'active_task_count', active_task_count,
        'status_counts', status_counts
      )
      order by active_task_count desc, owner_name asc
    ),
    '[]'::jsonb
  ) as data
  from (
    select
      owner_name,
      count(*)::int as active_task_count,
      jsonb_object_agg(status, status_count order by status) as status_counts
    from (
      select owner_name, status, count(*)::int as status_count
      from schedule_rows
      group by owner_name, status
    ) per_status
    group by owner_name
  ) assignees
),
sample_items as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'display_id', display_id,
        'status', status,
        'priority', priority,
        'owner_name', owner_name,
        'skill', skill_label,
        'first_draft_date', first_draft_date,
        'final_approved_due_date', final_approved_due_date,
        'launch_date', launch_date
      )
      order by first_draft_date asc nulls last, display_id asc
    ),
    '[]'::jsonb
  ) as data
  from (
    select *
    from schedule_rows
    order by first_draft_date asc nulls last, display_id asc
    limit 15
  ) preview_rows
),
upcoming_leave_days as (
  select
    tm.display_name as owner_name,
    leave_day::date as leave_date
  from public.leave_requests lr
  join public.team_members tm
    on tm.id = lr.team_member_id
  cross join lateral generate_series(lr.start_date, lr.end_date, interval '1 day') as leave_day
  where lr.cancelled_at is null
    and tm.active = true
    and public.flowmate_normalize_team_code(tm.discipline) = 'gdve'
    and leave_day::date >= current_date
    and leave_day::date <= current_date + 30
),
leave_preview as (
  select jsonb_build_object(
    'upcoming_leave_day_count', count(*)::int,
    'members_with_leave', count(distinct owner_name)::int,
    'sample', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'owner_name', owner_name,
          'leave_date', leave_date
        )
        order by leave_date asc, owner_name asc
      ) filter (where row_number <= 10),
      '[]'::jsonb
    )
  ) as data
  from (
    select
      owner_name,
      leave_date,
      row_number() over (order by leave_date asc, owner_name asc) as row_number
    from upcoming_leave_days
  ) numbered_leave_days
),
function_state as (
  select to_regprocedure('public.flowmate_list_team_schedule()') is not null as function_exists
)
select jsonb_build_object(
  'function_exists', (select function_exists from function_state),
  'active_task_count', (select count(*)::int from schedule_rows),
  'active_assignee_count', (select count(distinct owner_member_id)::int from schedule_rows),
  'status_counts', (select data from status_counts),
  'excluded_null_owner_count', (
    select count(*)::int
    from active_rows_base
    where owner_member_id is null
  ),
  'excluded_inactive_owner_count', (
    select count(*)::int
    from active_rows_base
    where owner_member_id is not null
      and coalesce(owner_active, false) = false
  ),
  'excluded_non_gdve_owner_count', (
    select count(*)::int
    from active_rows_base
    where owner_member_id is not null
      and coalesce(owner_active, false) = true
      and coalesce(owner_team_code, '') <> 'gdve'
  ),
  'assignees', (select data from assignee_counts),
  'sample_items', (select data from sample_items),
  'leave_preview_30_days', (select data from leave_preview)
) as preview;
