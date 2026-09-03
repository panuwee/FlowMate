-- FlowMate Creative Request date-led backfill verification
-- Run after creative_request_date_led_apply.sql, before any rollback approval.

with backup_summary as (
  select
    count(*)::integer as backup_count,
    count(*) filter (where apply_status = 'applied')::integer as applied_count,
    count(*) filter (where apply_status = 'concurrent_skip')::integer as concurrent_skip_count,
    count(*) filter (where rollback_status = 'Rolled back')::integer as rolled_back_count,
    count(*) filter (where rollback_status = 'Changed after backfill; rollback skipped')::integer as rollback_skipped_count
  from private.flowmate_creative_date_led_backfill_20260902
),
legacy as (
  select count(*)::integer as legacy_candidate_count
  from public.work_items wi
  where wi.work_type = 'creative_request'
    and wi.status not in ('delivered', 'cancelled')
    and wi.launch_date is not null
    and wi.due_date = public.flowmate_subtract_th_business_days(wi.launch_date, 5)
)
select
  backup_count,
  applied_count,
  concurrent_skip_count,
  rolled_back_count,
  rollback_skipped_count,
  legacy_candidate_count,
  legacy_candidate_count = 0 as legacy_candidate_count_is_zero,
  concurrent_skip_count = 0 as concurrent_skip_count_is_zero,
  backup_count = applied_count + concurrent_skip_count as backup_count_is_reconciled
from backup_summary
cross join legacy;

select
  b.display_id,
  b.status_at_backup,
  b.is_no_tag,
  b.launch_date,
  b.old_due_date,
  b.new_due_date,
  wi.due_date as current_due_date,
  b.old_final_approved_due_date,
  b.new_final_approved_due_date,
  wi.final_approved_due_date as current_final_approved_due_date,
  b.old_publish_time,
  b.new_publish_time,
  wi.publish_time as current_publish_time,
  b.apply_status,
  b.apply_status_reason,
  b.applied_at,
  b.rollback_status
from private.flowmate_creative_date_led_backfill_20260902 b
left join public.work_items wi on wi.id = b.work_item_id
order by b.launch_date, b.display_id;

do $verify$
declare
  legacy_candidate_count integer;
  v_backup_count integer;
  v_applied_count integer;
  v_concurrent_skip_count integer;
  v_metric_count bigint;
  v_metric_checksum text;
  v_current_count bigint;
  v_current_checksum text;
begin
  if to_regclass('private.flowmate_creative_date_led_backfill_20260902') is null then
    raise exception 'Backfill table private.flowmate_creative_date_led_backfill_20260902 is missing';
  end if;
  if to_regclass('private.flowmate_creative_date_led_backfill_20260902_metrics') is null then
    raise exception 'Backfill metric table private.flowmate_creative_date_led_backfill_20260902_metrics is missing';
  end if;

  select count(*),
         count(*) filter (where apply_status = 'applied'),
         count(*) filter (where apply_status = 'concurrent_skip')
  into v_backup_count, v_applied_count, v_concurrent_skip_count
  from private.flowmate_creative_date_led_backfill_20260902;

  if v_backup_count <> v_applied_count + v_concurrent_skip_count then
    raise exception 'Backfill count mismatch: backup %, applied %, concurrent skips %',
      v_backup_count,
      v_applied_count,
      v_concurrent_skip_count;
  end if;

  if v_concurrent_skip_count > 0 then
    raise exception 'Concurrent skip requires reviewed preview evidence: %', v_concurrent_skip_count;
  end if;

  if exists (
    select 1
    from private.flowmate_creative_date_led_backfill_20260902 b
    join public.work_items wi on wi.id = b.work_item_id
    where b.apply_status = 'applied'
      and not b.is_no_tag
      and (
        wi.due_date is distinct from public.flowmate_subtract_th_business_days(b.launch_date, 4)
        or wi.final_approved_due_date is distinct from public.flowmate_subtract_th_business_days(b.launch_date, 2)
        or wi.publish_time is distinct from b.old_publish_time
      )
  ) then
    raise exception 'Publishing rows must be T-4/T-2 with original Publish Time';
  end if;

  if exists (
    select 1
    from private.flowmate_creative_date_led_backfill_20260902 b
    join public.work_items wi on wi.id = b.work_item_id
    where b.apply_status = 'applied'
      and b.is_no_tag
      and (
        wi.due_date is distinct from public.flowmate_subtract_th_business_days(b.launch_date, 4)
        or wi.final_approved_due_date is not null
        or wi.publish_time is not null
      )
  ) then
    raise exception 'No Tag rows must be T-4/null/null';
  end if;

  select metric_count, metric_checksum
  into v_metric_count, v_metric_checksum
  from private.flowmate_creative_date_led_backfill_20260902_metrics
  where metric_name = 'delivered_cancelled_schedule';

  if v_metric_count is null then
    raise exception 'Delivered/Cancelled baseline metric is missing';
  end if;

  select
    count(*)::bigint,
    md5(coalesce(string_agg(
      concat_ws(
        '|',
        wi.id::text,
        wi.status::text,
        wi.due_date::text,
        wi.final_approved_due_date::text,
        wi.publish_time::text
      ),
      ',' order by wi.id::text
    ), ''))
  into v_current_count, v_current_checksum
  from public.work_items wi
  where wi.work_type = 'creative_request'
    and wi.status in ('delivered', 'cancelled');

  if v_current_count <> v_metric_count or v_current_checksum is distinct from v_metric_checksum then
    raise exception 'Delivered/Cancelled schedule checksum changed';
  end if;

  select metric_count, metric_checksum
  into v_metric_count, v_metric_checksum
  from private.flowmate_creative_date_led_backfill_20260902_metrics
  where metric_name = 'historical_effort';

  if v_metric_count is null then
    raise exception 'Historical Effort baseline metric is missing';
  end if;

  select
    count(*) filter (where wi.effort_point is not null)::bigint,
    md5(coalesce(string_agg(
      concat_ws('|', wi.id::text, wi.effort_point::text),
      ',' order by wi.id::text
    ) filter (where wi.effort_point is not null), ''))
  into v_current_count, v_current_checksum
  from public.work_items wi
  where wi.work_type = 'creative_request';

  if v_current_count <> v_metric_count or v_current_checksum is distinct from v_metric_checksum then
    raise exception 'Historical Effort checksum changed';
  end if;

  select metric_count, metric_checksum
  into v_metric_count, v_metric_checksum
  from private.flowmate_creative_date_led_backfill_20260902_metrics
  where metric_name = 'legacy_warning_over_capacity';

  if v_metric_count is null then
    raise exception 'Legacy over_capacity warning baseline metric is missing';
  end if;

  with warning_rows as (
    select
      warnings.value ->> 'code' as warning_code,
      ar.id as assignment_run_id,
      ar.work_item_id
    from public.assignment_runs ar
    cross join lateral jsonb_array_elements(
      coalesce(ar.capacity_snapshot -> 'warnings', '[]'::jsonb)
    ) as warnings(value)
    where warnings.value ->> 'code' = 'over_capacity'
  )
  select
    count(*)::bigint,
    md5(coalesce(string_agg(
      concat_ws('|', assignment_run_id::text, work_item_id::text, warning_code),
      ',' order by assignment_run_id::text, work_item_id::text, warning_code
    ), ''))
  into v_current_count, v_current_checksum
  from warning_rows;

  if v_current_count <> v_metric_count or v_current_checksum is distinct from v_metric_checksum then
    raise exception 'Legacy over_capacity warning count changed';
  end if;

  select metric_count, metric_checksum
  into v_metric_count, v_metric_checksum
  from private.flowmate_creative_date_led_backfill_20260902_metrics
  where metric_name = 'legacy_warning_deadline_capacity_gap';

  if v_metric_count is null then
    raise exception 'Legacy deadline_capacity_gap warning baseline metric is missing';
  end if;

  with warning_rows as (
    select
      warnings.value ->> 'code' as warning_code,
      ar.id as assignment_run_id,
      ar.work_item_id
    from public.assignment_runs ar
    cross join lateral jsonb_array_elements(
      coalesce(ar.capacity_snapshot -> 'warnings', '[]'::jsonb)
    ) as warnings(value)
    where warnings.value ->> 'code' = 'deadline_capacity_gap'
  )
  select
    count(*)::bigint,
    md5(coalesce(string_agg(
      concat_ws('|', assignment_run_id::text, work_item_id::text, warning_code),
      ',' order by assignment_run_id::text, work_item_id::text, warning_code
    ), ''))
  into v_current_count, v_current_checksum
  from warning_rows;

  if v_current_count <> v_metric_count or v_current_checksum is distinct from v_metric_checksum then
    raise exception 'Legacy deadline_capacity_gap warning count changed';
  end if;

  select count(*)
  into legacy_candidate_count
  from public.work_items wi
  where wi.work_type = 'creative_request'
    and wi.status not in ('delivered', 'cancelled')
    and wi.launch_date is not null
    and wi.due_date = public.flowmate_subtract_th_business_days(wi.launch_date, 5);

  if legacy_candidate_count <> 0 then
    raise exception 'Remaining guarded T-5 candidates: %', legacy_candidate_count;
  end if;
end;
$verify$;

/*
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtext('flowmate_creative_date_led_backfill_20260902_rollback'));

with rolled_back as (
  update public.work_items wi
  set due_date = b.old_due_date,
      final_approved_due_date = b.old_final_approved_due_date,
      publish_time = b.old_publish_time,
      updated_at = now()
  from private.flowmate_creative_date_led_backfill_20260902 b
  where wi.id = b.work_item_id
    and b.apply_status = 'applied'
    and b.rollback_status is null
    and wi.due_date is not distinct from b.new_due_date
    and wi.final_approved_due_date is not distinct from b.new_final_approved_due_date
    and wi.publish_time is not distinct from b.new_publish_time
  returning wi.id as work_item_id
)
update private.flowmate_creative_date_led_backfill_20260902 b
set rollback_status = 'Rolled back',
    rolled_back_at = clock_timestamp()
from rolled_back
where b.work_item_id = rolled_back.work_item_id;

update private.flowmate_creative_date_led_backfill_20260902 b
set rollback_status = 'Changed after backfill; rollback skipped'
where b.apply_status = 'applied'
  and b.rollback_status is null;

select
  rollback_status,
  count(*)::integer as row_count
from private.flowmate_creative_date_led_backfill_20260902
group by rollback_status
order by rollback_status;

commit;
*/
