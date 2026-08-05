-- Targeted production repair for CR-1047 after deploying rpc_assignment.sql.
--
-- Root cause:
--   The old Create flow generated 1st Draft as Launch minus two working days
--   without considering effort or the time-of-day capacity cutoff. CR-1047 is
--   a 9 pt CDN Design request created after noon, so the old Aug 3 deadline
--   exposed only one 4 pt bucket and forced the request into Queue.
--
-- Safety:
--   * Only CR-1047 is considered.
--   * Existing skills, WIP limits, availability, leave, and capacity are not
--     changed.
--   * A non-queued/already-assigned request is left untouched.
--   * A manually changed deadline is rejected unless the request still carries
--     the old auto-urgent marker.
--   * The assignment engine still makes the final owner decision.

begin;

do $repair_cr1047$
declare
  v_work public.work_items%rowtype;
  v_details public.creative_request_details%rowtype;
  v_now_bkk timestamp := timezone('Asia/Bangkok', now());
  v_today date := timezone('Asia/Bangkok', now())::date;
  v_start_date date;
  v_start_half text := 'am';
  v_effort integer;
  v_review_target date;
  v_earliest_due date;
  v_new_due date;
  v_result jsonb;
begin
  select *
    into v_work
    from public.work_items
   where display_id = 'CR-1047'
   for update;

  if v_work.id is null then
    raise exception 'CR-1047 was not found';
  end if;

  if v_work.work_type <> 'creative_request' then
    raise exception 'CR-1047 is not a Creative Request';
  end if;

  if v_work.status <> 'queued' then
    raise notice 'CR-1047 is already %, so no repair was applied', v_work.status;
    return;
  end if;

  select *
    into v_details
    from public.creative_request_details
   where work_item_id = v_work.id;

  if v_details.work_item_id is null then
    raise exception 'Creative Request details are missing for CR-1047';
  end if;

  v_effort := public.flowmate_effort_for_subtype(
    v_details.asset_type,
    v_details.asset_subtype,
    v_details.asset_count
  );
  if nullif(trim(coalesce(v_details.asset_subtype_2, '')), '') is not null then
    v_effort := v_effort + public.flowmate_effort_for_subtype(
      v_details.asset_type_2,
      v_details.asset_subtype_2,
      v_details.asset_count_2
    );
  end if;

  if extract(isodow from v_today) not between 1 and 5 then
    v_start_date := public.flowmate_next_working_day(v_today);
  elsif v_now_bkk::time >= time '15:00' then
    v_start_date := public.flowmate_next_working_day(v_today + 1);
  elsif v_now_bkk::time >= time '12:00' then
    v_start_date := public.flowmate_next_working_day(v_today);
    v_start_half := 'pm';
  else
    v_start_date := public.flowmate_next_working_day(v_today);
  end if;

  v_review_target := public.flowmate_subtract_working_days(
    coalesce(v_work.launch_date, v_work.due_date),
    2
  );
  v_earliest_due := public.flowmate_earliest_capacity_date(
    v_start_date,
    v_start_half,
    v_effort,
    4
  );
  v_new_due := least(
    coalesce(v_work.launch_date, v_earliest_due),
    greatest(coalesce(v_work.due_date, v_review_target), v_earliest_due)
  );

  if v_work.due_date <> v_review_target
     and coalesce(v_work.urgent_reason, '') not like 'Auto urgent:%' then
    raise exception 'CR-1047 deadline no longer matches the old generated date; review it manually before repair';
  end if;

  update public.work_items
     set due_date = v_new_due,
         priority = 'urgent',
         urgent_reason = case
           when coalesce(urgent_reason, '') like 'Auto urgent:%' then
             'Auto urgent: earliest feasible 1st Draft is ' || to_char(v_new_due, 'Mon DD, YYYY') ||
             ', leaving less than 2 working days before Launch ' ||
             to_char(coalesce(launch_date, v_new_due), 'Mon DD, YYYY') || '.'
           else urgent_reason
         end,
         updated_at = now()
   where id = v_work.id;

  v_result := public.flowmate_run_assignment(v_work.id, 'rerun');
  raise notice 'CR-1047 repair result: %', v_result;
end;
$repair_cr1047$;

commit;

-- Verification result 1: final status/owner/reason.
select
  wi.display_id,
  wi.status,
  wi.priority,
  wi.due_date as first_draft_date,
  wi.launch_date,
  wi.effort_point,
  coalesce(owner.display_name, 'Unassigned') as assignee,
  wi.assignment_reason,
  wi.urgent_reason
from public.work_items wi
left join public.team_members owner on owner.id = wi.final_owner_member_id
where wi.display_id = 'CR-1047';

-- Verification result 2: exact capacity buckets reserved by the engine.
select
  wi.display_id,
  tm.display_name as assignee,
  allocation.bucket_date,
  allocation.bucket_half,
  allocation.capacity_point
from public.flowmate_capacity_allocations allocation
join public.work_items wi on wi.id = allocation.work_item_id
join public.team_members tm on tm.id = allocation.team_member_id
where wi.display_id = 'CR-1047'
order by allocation.bucket_date, case allocation.bucket_half when 'am' then 1 else 2 end;

-- Verification result 3: latest engine decision.
select
  run.result,
  run.reason,
  run.effort_point,
  run.ran_at
from public.assignment_runs run
join public.work_items wi on wi.id = run.work_item_id
where wi.display_id = 'CR-1047'
order by run.ran_at desc
limit 1;
