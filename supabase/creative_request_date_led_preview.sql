-- FlowMate Creative Request date-led preview
-- Run this first. It is made of select statements only.
-- If preview_gate is BLOCKED_CALENDAR_INCOMPLETE, stop before the apply file.

with source_rows as (
  select
    wi.id,
    wi.launch_date
  from public.work_items wi
  where wi.work_type = 'creative_request'
    and wi.status not in ('delivered', 'cancelled')
    and wi.launch_date is not null
),
required_years as (
  select distinct extract(year from days.calendar_day)::integer as calendar_year
  from source_rows source
  cross join lateral generate_series(
    source.launch_date - interval '30 days',
    source.launch_date,
    interval '1 day'
  ) as days(calendar_day)
),
calendar_counts as (
  select
    count(*)::integer as required_year_count,
    count(*) filter (where years.calendar_year is not null and years.is_complete)::integer as complete_year_count,
    count(*) filter (where years.calendar_year is null or not years.is_complete)::integer as missing_year_count,
    array_remove(
      array_agg(required.calendar_year order by required.calendar_year)
        filter (where years.calendar_year is null or not years.is_complete),
      null
    ) as missing_years
  from required_years required
  left join public.flowmate_th_calendar_years years
    on years.calendar_year = required.calendar_year
)
select
  'calendar_gate' as result_set,
  case
    when missing_year_count = 0 then 'READY'
    else 'BLOCKED_CALENDAR_INCOMPLETE'
  end as preview_gate,
  required_year_count,
  complete_year_count,
  missing_year_count,
  coalesce(missing_years, '{}'::integer[]) as missing_years,
  case
    when missing_year_count = 0 then 'Apply file may be considered after review.'
    else 'Apply file must not run.'
  end as operator_note
from calendar_counts;

with active_no_tag_stale as (
  select
    wi.id,
    wi.display_id,
    wi.status::text as status,
    wi.launch_date,
    wi.publish_time,
    wi.final_approved_due_date
  from public.work_items wi
  join public.creative_request_details crd
    on crd.work_item_id = wi.id
  where wi.work_type = 'creative_request'
    and wi.status not in ('delivered', 'cancelled')
    and wi.archived_at is null
    and public.workflow_normalize_creative_channels(
      crd.platforms,
      false
    ) = array['no_tag']::text[]
    and (
      wi.publish_time is not null
      or wi.final_approved_due_date is not null
    )
)
select
  'active_no_tag_stale_publishing_summary' as check_name,
  count(*)::integer as stale_row_count,
  count(*) filter (where publish_time is not null)::integer as stale_publish_time_count,
  count(*) filter (where final_approved_due_date is not null)::integer as stale_final_approved_count
from active_no_tag_stale;

with active_no_tag_stale as (
  select
    wi.id,
    wi.display_id,
    wi.status::text as status,
    wi.launch_date,
    wi.publish_time as stale_publish_time,
    wi.final_approved_due_date as stale_final_approved_due_date
  from public.work_items wi
  join public.creative_request_details crd
    on crd.work_item_id = wi.id
  where wi.work_type = 'creative_request'
    and wi.status not in ('delivered', 'cancelled')
    and wi.archived_at is null
    and public.workflow_normalize_creative_channels(
      crd.platforms,
      false
    ) = array['no_tag']::text[]
    and (
      wi.publish_time is not null
      or wi.final_approved_due_date is not null
    )
)
select
  'active_no_tag_stale_publishing_detail' as check_name,
  display_id,
  status,
  launch_date,
  stale_publish_time,
  stale_final_approved_due_date
from active_no_tag_stale
order by launch_date nulls first, display_id;

with source_rows as (
  select
    wi.id,
    wi.display_id,
    wi.work_type,
    wi.status,
    wi.launch_date,
    wi.due_date,
    wi.final_approved_due_date,
    wi.publish_time,
    public.workflow_normalize_creative_channels(
      crd.platforms,
      false
    ) = array['no_tag']::text[] as is_no_tag
  from public.work_items wi
  join public.creative_request_details crd
    on crd.work_item_id = wi.id
),
required_years as (
  select distinct extract(year from days.calendar_day)::integer as calendar_year
  from source_rows source
  cross join lateral generate_series(
    source.launch_date - interval '30 days',
    source.launch_date,
    interval '1 day'
  ) as days(calendar_day)
  where source.work_type = 'creative_request'
    and source.status not in ('delivered', 'cancelled')
    and source.launch_date is not null
),
calendar_counts as (
  select
    count(*)::integer as required_year_count,
    count(*) filter (where years.calendar_year is not null and years.is_complete)::integer as complete_year_count,
    count(*) filter (where years.calendar_year is null or not years.is_complete)::integer as missing_year_count
  from required_years required
  left join public.flowmate_th_calendar_years years
    on years.calendar_year = required.calendar_year
),
calendar_gate as materialized (
  select *
  from calendar_counts
  where missing_year_count = 0
),
candidate as (
  select candidate_rows.*
  from calendar_gate gate
  cross join lateral (
    select
      wi.id,
      wi.display_id,
      wi.status,
      wi.launch_date,
      wi.due_date as old_due_date,
      wi.final_approved_due_date as old_final_approved_due_date,
      wi.publish_time as old_publish_time,
      public.flowmate_subtract_th_business_days(wi.launch_date, 4) as new_due_date,
      case
        when wi.is_no_tag then null
        else public.flowmate_subtract_th_business_days(wi.launch_date, 2)
      end as new_final_approved_due_date,
      case
        when wi.is_no_tag then null
        else wi.publish_time
      end as new_publish_time,
      wi.is_no_tag
    from source_rows wi
    where wi.work_type = 'creative_request'
      and wi.status not in ('delivered', 'cancelled')
      and wi.launch_date is not null
      and gate.missing_year_count = 0
      and wi.due_date = public.flowmate_subtract_th_business_days(wi.launch_date, 5)
      and (
        is_no_tag
        or wi.final_approved_due_date =
             public.flowmate_subtract_th_business_days(wi.launch_date, 1)
      )
  ) candidate_rows
)
select
  'candidate_summary' as result_set,
  count(*)::integer as total_candidate_count,
  count(*) filter (where not is_no_tag)::integer as publishing_to_t4_t2_count,
  count(*) filter (where is_no_tag)::integer as no_tag_to_t4_null_null_count,
  min(launch_date) as earliest_launch_date,
  max(launch_date) as latest_launch_date
from candidate;

with source_rows as (
  select
    wi.id,
    wi.display_id,
    wi.work_type,
    wi.status,
    wi.launch_date,
    wi.due_date,
    wi.final_approved_due_date,
    wi.publish_time,
    public.workflow_normalize_creative_channels(
      crd.platforms,
      false
    ) = array['no_tag']::text[] as is_no_tag
  from public.work_items wi
  join public.creative_request_details crd
    on crd.work_item_id = wi.id
),
required_years as (
  select distinct extract(year from days.calendar_day)::integer as calendar_year
  from source_rows source
  cross join lateral generate_series(
    source.launch_date - interval '30 days',
    source.launch_date,
    interval '1 day'
  ) as days(calendar_day)
  where source.work_type = 'creative_request'
    and source.status not in ('delivered', 'cancelled')
    and source.launch_date is not null
),
calendar_counts as (
  select
    count(*)::integer as required_year_count,
    count(*) filter (where years.calendar_year is not null and years.is_complete)::integer as complete_year_count,
    count(*) filter (where years.calendar_year is null or not years.is_complete)::integer as missing_year_count
  from required_years required
  left join public.flowmate_th_calendar_years years
    on years.calendar_year = required.calendar_year
),
calendar_gate as materialized (
  select *
  from calendar_counts
  where missing_year_count = 0
),
candidate as (
  select candidate_rows.*
  from calendar_gate gate
  cross join lateral (
    select
      wi.id,
      wi.display_id,
      wi.status,
      wi.launch_date,
      wi.due_date as old_due_date,
      wi.final_approved_due_date as old_final_approved_due_date,
      wi.publish_time as old_publish_time,
      public.flowmate_subtract_th_business_days(wi.launch_date, 4) as new_due_date,
      case
        when wi.is_no_tag then null
        else public.flowmate_subtract_th_business_days(wi.launch_date, 2)
      end as new_final_approved_due_date,
      case
        when wi.is_no_tag then null
        else wi.publish_time
      end as new_publish_time,
      wi.is_no_tag
    from source_rows wi
    where wi.work_type = 'creative_request'
      and wi.status not in ('delivered', 'cancelled')
      and wi.launch_date is not null
      and gate.missing_year_count = 0
      and wi.due_date = public.flowmate_subtract_th_business_days(wi.launch_date, 5)
      and (
        is_no_tag
        or wi.final_approved_due_date =
             public.flowmate_subtract_th_business_days(wi.launch_date, 1)
      )
  ) candidate_rows
)
select
  'candidate_detail' as result_set,
  display_id,
  status,
  launch_date,
  old_due_date,
  new_due_date,
  old_final_approved_due_date,
  new_final_approved_due_date,
  old_publish_time,
  new_publish_time,
  case
    when is_no_tag then 'No Tag to T-4/null/null'
    else 'Publishing to T-4/T-2'
  end as candidate_path
from candidate
order by launch_date, display_id;

with source_rows as (
  select
    wi.id,
    wi.display_id,
    wi.work_type,
    wi.status,
    wi.launch_date,
    wi.due_date,
    wi.final_approved_due_date,
    wi.publish_time,
    public.workflow_normalize_creative_channels(
      crd.platforms,
      false
    ) = array['no_tag']::text[] as is_no_tag
  from public.work_items wi
  join public.creative_request_details crd
    on crd.work_item_id = wi.id
),
required_years as (
  select distinct extract(year from days.calendar_day)::integer as calendar_year
  from source_rows source
  cross join lateral generate_series(
    source.launch_date - interval '30 days',
    source.launch_date,
    interval '1 day'
  ) as days(calendar_day)
  where source.work_type = 'creative_request'
    and source.status not in ('delivered', 'cancelled')
    and source.launch_date is not null
),
calendar_counts as (
  select
    count(*)::integer as required_year_count,
    count(*) filter (where years.calendar_year is not null and years.is_complete)::integer as complete_year_count,
    count(*) filter (where years.calendar_year is null or not years.is_complete)::integer as missing_year_count
  from required_years required
  left join public.flowmate_th_calendar_years years
    on years.calendar_year = required.calendar_year
),
calendar_gate as materialized (
  select *
  from calendar_counts
  where missing_year_count = 0
),
skipped as (
  select skipped_rows.*
  from calendar_gate gate
  cross join lateral (
    select
      display_id,
      status,
      launch_date,
      due_date,
      final_approved_due_date,
      publish_time,
      case
        when due_date is null then 'First Draft missing'
        when is_no_tag
          and due_date is distinct from public.flowmate_subtract_th_business_days(launch_date, 5)
          then 'No Tag First Draft differs from T-5'
        when not is_no_tag and final_approved_due_date is null then 'Publishing final missing'
        when not is_no_tag
          and due_date is distinct from public.flowmate_subtract_th_business_days(launch_date, 5)
          then 'Publishing First Draft differs from T-5'
        when not is_no_tag
          and final_approved_due_date is distinct from public.flowmate_subtract_th_business_days(launch_date, 1)
          then 'Publishing final differs from T-1'
        else 'Other active skip'
      end as skip_reason
    from source_rows wi
    where wi.work_type = 'creative_request'
      and wi.status not in ('delivered', 'cancelled')
      and wi.launch_date is not null
      and gate.missing_year_count = 0
      and (
        due_date = public.flowmate_subtract_th_business_days(launch_date, 5)
        and (
          is_no_tag
          or final_approved_due_date =
               public.flowmate_subtract_th_business_days(launch_date, 1)
        )
      ) is not true
  ) skipped_rows
)
select
  'active_skip_summary' as result_set,
  skip_reason,
  count(*)::integer as skipped_count
from skipped
group by skip_reason
order by skip_reason;

select
  'retained_status_history' as result_set,
  wi.status::text as status,
  count(*)::integer as retained_count,
  md5(coalesce(string_agg(
    concat_ws(
      '|',
      wi.id::text,
      wi.due_date::text,
      wi.final_approved_due_date::text,
      wi.publish_time::text
    ),
    ',' order by wi.id::text
  ), '')) as schedule_checksum
from public.work_items wi
where wi.work_type = 'creative_request'
  and wi.status in ('delivered', 'cancelled')
group by wi.status
order by wi.status;

select
  'retained_effort' as result_set,
  count(*) filter (where effort_point is not null)::integer as effort_row_count,
  coalesce(sum(effort_point), 0)::integer as effort_point_sum,
  md5(coalesce(string_agg(
    concat_ws('|', id::text, effort_point::text),
    ',' order by id::text
  ) filter (where effort_point is not null), '')) as effort_checksum
from public.work_items
where work_type = 'creative_request';

with warning_rows as (
  select
    warnings.value ->> 'code' as warning_code,
    ar.id as assignment_run_id,
    ar.work_item_id
  from public.assignment_runs ar
  cross join lateral jsonb_array_elements(
    coalesce(ar.capacity_snapshot -> 'warnings', '[]'::jsonb)
  ) as warnings(value)
  where warnings.value ->> 'code' in ('over_capacity', 'deadline_capacity_gap')
)
select
  'retained_legacy_warnings' as result_set,
  count(*) filter (where warning_code = 'over_capacity')::integer as over_capacity_count,
  count(*) filter (where warning_code = 'deadline_capacity_gap')::integer as deadline_capacity_gap_count,
  md5(coalesce(string_agg(
    concat_ws('|', assignment_run_id::text, work_item_id::text, warning_code),
    ',' order by assignment_run_id::text, warning_code
  ), '')) as warning_checksum
from warning_rows;
