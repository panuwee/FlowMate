-- FlowMate one-time Creative Request date-led backfill
-- Target gate: run only after creative_request_date_led_preview.sql is reviewed.
-- This file stores recoverable backup rows before changing active work_items.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

select pg_advisory_xact_lock(hashtext('flowmate_creative_date_led_backfill_20260902'));

create schema if not exists private;

do $preflight$
declare
  v_missing_years text;
begin
  if to_regclass('public.work_items') is null then
    raise exception 'Required table public.work_items is missing';
  end if;
  if to_regclass('public.creative_request_details') is null then
    raise exception 'Required table public.creative_request_details is missing';
  end if;
  if to_regclass('public.assignment_runs') is null then
    raise exception 'Required table public.assignment_runs is missing';
  end if;
  if to_regclass('public.flowmate_th_calendar_years') is null then
    raise exception 'Required table public.flowmate_th_calendar_years is missing';
  end if;
  if to_regprocedure('public.workflow_normalize_creative_channels(text[],boolean)') is null then
    raise exception 'No Tag normalization helper is missing';
  end if;
  if to_regprocedure('public.flowmate_subtract_th_business_days(date,integer)') is null then
    raise exception 'Thai business-day helper is missing';
  end if;

  with source_rows as (
    select wi.launch_date
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
  )
  select string_agg(required.calendar_year::text, ', ' order by required.calendar_year)
  into v_missing_years
  from required_years required
  left join public.flowmate_th_calendar_years years
    on years.calendar_year = required.calendar_year
  where years.calendar_year is null
     or not years.is_complete;

  if v_missing_years is not null then
    raise exception 'Date-led backfill blocked; incomplete Thai calendar years: %', v_missing_years;
  end if;
end;
$preflight$;

create table if not exists private.flowmate_creative_date_led_backfill_20260902 (
  work_item_id uuid primary key,
  display_id text not null,
  status_at_backup public.work_status not null,
  launch_date date not null,
  is_no_tag boolean not null,
  old_due_date date,
  old_final_approved_due_date date,
  old_publish_time time,
  new_due_date date not null,
  new_final_approved_due_date date,
  new_publish_time time,
  source_work_item_updated_at timestamptz not null,
  backed_up_at timestamptz not null default clock_timestamp(),
  applied_at timestamptz,
  applied_work_item_updated_at timestamptz,
  apply_status text not null default 'backed_up',
  apply_status_reason text,
  rollback_status text,
  rolled_back_at timestamptz,
  constraint flowmate_creative_date_led_backfill_apply_status_check
    check (apply_status in ('backed_up', 'applied', 'concurrent_skip')),
  constraint flowmate_creative_date_led_backfill_rollback_status_check
    check (rollback_status is null or rollback_status in ('Rolled back', 'Changed after backfill; rollback skipped'))
);

comment on table private.flowmate_creative_date_led_backfill_20260902 is
  'One-time backup for the 2026-09-02 active Creative Request T-5/T-1 to date-led T-4/T-2 backfill.';

revoke all on table private.flowmate_creative_date_led_backfill_20260902
  from public, anon, authenticated;

create table if not exists private.flowmate_creative_date_led_backfill_20260902_metrics (
  metric_name text primary key,
  metric_count bigint not null,
  metric_checksum text not null,
  captured_at timestamptz not null default clock_timestamp()
);

comment on table private.flowmate_creative_date_led_backfill_20260902_metrics is
  'Baseline metrics for the 2026-09-02 Creative Request date-led backfill verifier.';

revoke all on table private.flowmate_creative_date_led_backfill_20260902_metrics
  from public, anon, authenticated;

insert into private.flowmate_creative_date_led_backfill_20260902_metrics (
  metric_name,
  metric_count,
  metric_checksum
)
select
  'delivered_cancelled_schedule',
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
from public.work_items wi
where wi.work_type = 'creative_request'
  and wi.status in ('delivered', 'cancelled')
on conflict (metric_name) do nothing;

insert into private.flowmate_creative_date_led_backfill_20260902_metrics (
  metric_name,
  metric_count,
  metric_checksum
)
select
  'historical_effort',
  count(*) filter (where wi.effort_point is not null)::bigint,
  md5(coalesce(string_agg(
    concat_ws('|', wi.id::text, wi.effort_point::text),
    ',' order by wi.id::text
  ) filter (where wi.effort_point is not null), ''))
from public.work_items wi
where wi.work_type = 'creative_request'
on conflict (metric_name) do nothing;

insert into private.flowmate_creative_date_led_backfill_20260902_metrics (
  metric_name,
  metric_count,
  metric_checksum
)
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
  'legacy_warning_over_capacity',
  count(*)::bigint,
  md5(coalesce(string_agg(
    concat_ws('|', assignment_run_id::text, work_item_id::text, warning_code),
    ',' order by assignment_run_id::text, work_item_id::text, warning_code
  ), ''))
from warning_rows
on conflict (metric_name) do nothing;

insert into private.flowmate_creative_date_led_backfill_20260902_metrics (
  metric_name,
  metric_count,
  metric_checksum
)
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
  'legacy_warning_deadline_capacity_gap',
  count(*)::bigint,
  md5(coalesce(string_agg(
    concat_ws('|', assignment_run_id::text, work_item_id::text, warning_code),
    ',' order by assignment_run_id::text, work_item_id::text, warning_code
  ), ''))
from warning_rows
on conflict (metric_name) do nothing;

with candidate as (
  select
    wi.id,
    wi.display_id,
    wi.status,
    wi.launch_date,
    wi.due_date,
    wi.final_approved_due_date,
    wi.publish_time,
    wi.updated_at,
    wi.is_no_tag
  from (
    select
      wi.id,
      wi.display_id,
      wi.work_type,
      wi.status,
      wi.launch_date,
      wi.due_date,
      wi.final_approved_due_date,
      wi.publish_time,
      wi.updated_at,
      public.workflow_normalize_creative_channels(
        crd.platforms,
        false
      ) = array['no_tag']::text[] as is_no_tag
    from public.work_items wi
    join public.creative_request_details crd
      on crd.work_item_id = wi.id
  ) wi
  where wi.work_type = 'creative_request'
    and wi.status not in ('delivered', 'cancelled')
    and wi.launch_date is not null
    and wi.due_date = public.flowmate_subtract_th_business_days(wi.launch_date, 5)
    and (
      is_no_tag
      or wi.final_approved_due_date =
           public.flowmate_subtract_th_business_days(wi.launch_date, 1)
    )
)
insert into private.flowmate_creative_date_led_backfill_20260902 (
  work_item_id,
  display_id,
  status_at_backup,
  launch_date,
  is_no_tag,
  old_due_date,
  old_final_approved_due_date,
  old_publish_time,
  new_due_date,
  new_final_approved_due_date,
  new_publish_time,
  source_work_item_updated_at
)
select
  candidate.id,
  candidate.display_id,
  candidate.status,
  candidate.launch_date,
  candidate.is_no_tag,
  candidate.due_date,
  candidate.final_approved_due_date,
  candidate.publish_time,
  public.flowmate_subtract_th_business_days(candidate.launch_date, 4),
  case
    when candidate.is_no_tag then null
    else public.flowmate_subtract_th_business_days(candidate.launch_date, 2)
  end,
  case
    when candidate.is_no_tag then null
    else candidate.publish_time
  end,
  candidate.updated_at
from candidate
on conflict (work_item_id) do nothing;

with applied as (
  update public.work_items wi
  set due_date = b.new_due_date,
      final_approved_due_date = b.new_final_approved_due_date,
      publish_time = b.new_publish_time,
      updated_at = now()
  from private.flowmate_creative_date_led_backfill_20260902 b
  where wi.id = b.work_item_id
    and b.apply_status = 'backed_up'
    and wi.status not in ('delivered', 'cancelled')
    and wi.launch_date = b.launch_date
    and wi.due_date is not distinct from b.old_due_date
    and wi.final_approved_due_date is not distinct from b.old_final_approved_due_date
    and wi.publish_time is not distinct from b.old_publish_time
  returning wi.id as work_item_id, wi.updated_at as applied_work_item_updated_at
)
update private.flowmate_creative_date_led_backfill_20260902 b
set apply_status = 'applied',
    apply_status_reason = 'Applied guarded date-led values',
    applied_at = clock_timestamp(),
    applied_work_item_updated_at = applied.applied_work_item_updated_at
from applied
where b.work_item_id = applied.work_item_id;

update private.flowmate_creative_date_led_backfill_20260902 b
set apply_status = 'concurrent_skip',
    apply_status_reason = case
      when not exists (
        select 1
        from public.work_items wi
        where wi.id = b.work_item_id
      ) then 'Work item missing; apply skipped'
      else 'Current values changed; apply skipped'
    end
where b.apply_status = 'backed_up';

select
  apply_status,
  apply_status_reason,
  count(*)::integer as row_count
from private.flowmate_creative_date_led_backfill_20260902
group by apply_status, apply_status_reason
order by apply_status, apply_status_reason;

commit;
