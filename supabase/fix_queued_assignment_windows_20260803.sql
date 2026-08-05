-- FlowMate targeted queue repair for CR-1048, CR-1049, and CR-1050.
-- Run AFTER the matching supabase/rpc_assignment.sql release.
--
-- What this fixes:
--   * CR-1048 and CR-1049 were created with the old Launch-minus-2-days
--     automatic 1st Draft rule, which did not account for effort or the
--     12:00 / 15:00 production cutoffs.
--   * CR-1050 is rerun first because it has the earliest deadline. Its 1st
--     Draft is never moved past Launch; it remains queued if no valid owner
--     actually has 2 pt available in the remaining production window.
--   * The updated assignment RPC reports WIP/unavailability separately from
--     zero or insufficient production capacity.
--
-- Safety:
--   * Only CR-1048, CR-1049, and CR-1050 are considered.
--   * Assigned/non-queued requests are left untouched.
--   * No team member skill, WIP limit, availability, leave, or capacity value
--     is changed.
--   * The assignment engine still selects the final owner.

begin;
set local statement_timeout = '30s';

do $repair_queued_assignment_windows$
declare
  v_display_id text;
  v_work public.work_items%rowtype;
  v_details public.creative_request_details%rowtype;
  v_now_bkk timestamp := timezone('Asia/Bangkok', now());
  v_today date := timezone('Asia/Bangkok', now())::date;
  v_start_date date;
  v_start_half text;
  v_effort integer;
  v_review_target date;
  v_earliest_due date;
  v_new_due date;
  v_result jsonb;
begin
  -- Earliest deadline first so a same-day request gets the first valid chance
  -- at the remaining capacity before later requests are rerun.
  foreach v_display_id in array array['CR-1050', 'CR-1048', 'CR-1049'] loop
    select *
      into v_work
      from public.work_items
     where display_id = v_display_id
     for update;

    if not found then
      raise notice '% was not found; skipped', v_display_id;
      continue;
    end if;

    if v_work.work_type <> 'creative_request' then
      raise notice '% is not a Creative Request; skipped', v_display_id;
      continue;
    end if;

    if v_work.status <> 'queued' then
      raise notice '% is already %; no repair was applied', v_display_id, v_work.status;
      continue;
    end if;

    select *
      into v_details
      from public.creative_request_details
     where work_item_id = v_work.id;

    if not found then
      raise exception 'Creative Request details are missing for %', v_display_id;
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

    v_start_half := 'am';
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

    if v_new_due > coalesce(v_work.due_date, date '-infinity') then
      update public.work_items
         set due_date = v_new_due,
             priority = 'urgent',
             urgent_reason = 'Auto urgent: earliest effort-aware 1st Draft is ' ||
               to_char(v_new_due, 'Mon DD, YYYY') ||
               ', leaving less than 2 working days before Launch ' ||
               to_char(coalesce(launch_date, v_new_due), 'Mon DD, YYYY') || '.',
             updated_at = now()
       where id = v_work.id;
    end if;

    v_result := public.flowmate_run_assignment(v_work.id, 'rerun');
    raise notice '% repair result: %', v_display_id, v_result;
  end loop;
end;
$repair_queued_assignment_windows$;

commit;

-- Verification result 1: final status, owner, and exact queue/assignment reason.
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
where wi.display_id = any (array['CR-1048', 'CR-1049', 'CR-1050'])
order by wi.due_date, wi.display_id;

-- Verification result 2: capacity buckets reserved for any repaired assignment.
select
  wi.display_id,
  tm.display_name as assignee,
  allocation.bucket_date,
  allocation.bucket_half,
  allocation.capacity_point
from public.flowmate_capacity_allocations allocation
join public.work_items wi on wi.id = allocation.work_item_id
join public.team_members tm on tm.id = allocation.team_member_id
where wi.display_id = any (array['CR-1048', 'CR-1049', 'CR-1050'])
order by wi.display_id, allocation.bucket_date,
  case allocation.bucket_half when 'am' then 1 else 2 end;

-- Verification result 3: latest engine decision and diagnostic snapshot.
select distinct on (wi.display_id)
  wi.display_id,
  run.result,
  run.reason,
  run.effort_point,
  run.capacity_snapshot,
  run.ran_at
from public.assignment_runs run
join public.work_items wi on wi.id = run.work_item_id
where wi.display_id = any (array['CR-1048', 'CR-1049', 'CR-1050'])
order by wi.display_id, run.ran_at desc;

