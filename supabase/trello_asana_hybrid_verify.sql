-- FlowMate Trello + Asana hybrid verification.
-- Section 1 is strictly read-only. Section 2 runs optional permission probes
-- inside a transaction that always ends with ROLLBACK.

begin transaction read only;

select
  'enum_values' as check_name,
  exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'work_status'
      and e.enumlabel = 'unassigned'
  ) and exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'assignment_result'
      and e.enumlabel = 'unassigned'
  ) as passed;

select
  'capacity_constraint_positive_without_four_point_cap' as check_name,
  bool_or(pg_get_constraintdef(c.oid) ilike '%capacity_point > 0%')
    and not bool_or(pg_get_constraintdef(c.oid) ~ '<=?[[:space:]]*4([.][0-9]+)?') as passed,
  array_agg(pg_get_constraintdef(c.oid)) as observed_constraints
from pg_constraint c
where c.conrelid = 'public.flowmate_capacity_allocations'::regclass
  and c.contype = 'c'
  and pg_get_constraintdef(c.oid) ilike '%capacity_point%';

select
  'zero_active_queued_creative_requests' as check_name,
  count(*) = 0 as passed,
  count(*) as observed_count
from public.work_items wi
where wi.work_type = 'creative_request'
  and wi.status = 'queued'
  and wi.archived_at is null;

select
  'active_allocation_totals_equal_effort' as check_name,
  count(*) filter (where coalesce(a.allocated_total, 0) <> wi.effort_point::numeric) = 0 as passed,
  count(*) filter (where coalesce(a.allocated_total, 0) <> wi.effort_point::numeric) as mismatch_count
from public.work_items wi
left join lateral (
  select sum(allocation.capacity_point) as allocated_total
  from public.flowmate_capacity_allocations allocation
  where allocation.work_item_id = wi.id
) a on true
where wi.work_type = 'creative_request'
  and wi.status in ('assigned', 'in_progress', 'review', 'blocked')
  and wi.archived_at is null;

select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig @> array['search_path=public'] as fixed_search_path,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.oid in (
    'public.flowmate_run_assignment(uuid,public.assignment_trigger)'::regprocedure,
    'public.flowmate_rerun_queued_creative_requests(integer)'::regprocedure,
    'public.flowmate_change_creative_assignee(text,uuid,text)'::regprocedure,
    'public.flowmate_reschedule_capacity_allocation(text,jsonb)'::regprocedure
  )
order by p.proname;

with engine as (
  select pg_get_functiondef(
    'public.flowmate_run_assignment(uuid,public.assignment_trigger)'::regprocedure
  ) as definition
), warning_codes(code) as (
  values
    ('over_capacity'),
    ('wip_exceeded'),
    ('skill_mismatch'),
    ('backup_skill'),
    ('member_partial'),
    ('member_on_leave'),
    ('deadline_capacity_gap'),
    ('review_buffer_risk'),
    ('needs_split')
)
select
  'assignment_warning_codes' as check_name,
  bool_and(engine.definition like '%' || warning_codes.code || '%') as passed,
  array_agg(warning_codes.code) filter (
    where engine.definition not like '%' || warning_codes.code || '%'
  ) as missing_codes
from engine cross join warning_codes;

select
  'migration_archive_present' as check_name,
  to_regclass('public.flowmate_queued_migration_archive') is not null as passed;

commit;

-- Permission probes are deliberately data-dependent. A missing fixture is a
-- SKIP, never a false pass. Any successful mutation remains inside this outer
-- transaction and is discarded by the final ROLLBACK.
begin;

create temporary table flowmate_permission_probe_results (
  probe text primary key,
  result text not null,
  detail text
) on commit drop;

do $permission_probes$
declare
  v_actor uuid;
  v_work record;
  v_target_member uuid;
  v_error text;
begin
  select
    wi.id,
    wi.display_id,
    wi.requester_user_id,
    owner_tm.user_id as owner_user_id
  into v_work
  from public.work_items wi
  left join public.team_members owner_tm on owner_tm.id = wi.final_owner_member_id
  where wi.work_type = 'creative_request'
    and wi.status in ('assigned', 'in_progress', 'review', 'blocked')
    and wi.archived_at is null
  order by wi.created_at
  limit 1;

  select tm.id into v_target_member
  from public.team_members tm
  join public.users linked_user on linked_user.id = tm.user_id and linked_user.is_active = true
  where tm.active = true
    and public.flowmate_is_gdve_member_code(tm.member_code)
    and tm.id <> (select wi.final_owner_member_id from public.work_items wi where wi.id = v_work.id)
  order by tm.member_code
  limit 1;

  select u.id into v_actor
  from public.users u
  where u.is_active = true
    and coalesce(u.role, '') <> 'admin'
    and u.id <> v_work.requester_user_id
    and u.id <> v_work.owner_user_id
  order by u.id
  limit 1;

  if v_work.id is null or v_target_member is null or v_actor is null then
    insert into flowmate_permission_probe_results
    values ('unrelated_user_reassignment_rejected', 'SKIP', 'No safe existing fixture combination');
    insert into flowmate_permission_probe_results
    values ('unrelated_user_reschedule_rejected', 'SKIP', 'No safe existing fixture combination');
  else
    perform set_config('request.jwt.claim.sub', v_actor::text, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_actor)::text, true);

    begin
      perform public.flowmate_change_creative_assignee(
        v_work.display_id,
        v_target_member,
        'rollback-only permission probe'
      );
      insert into flowmate_permission_probe_results
      values ('unrelated_user_reassignment_rejected', 'FAIL', 'Unrelated user changed assignee');
    exception when sqlstate '42501' then
      insert into flowmate_permission_probe_results
      values ('unrelated_user_reassignment_rejected', 'PASS', 'Requester/admin/self rule enforced');
    when others then
      get stacked diagnostics v_error = message_text;
      insert into flowmate_permission_probe_results
      values ('unrelated_user_reassignment_rejected', 'FAIL', v_error);
    end;

    begin
      perform public.flowmate_reschedule_capacity_allocation(
        v_work.display_id,
        jsonb_build_array(jsonb_build_object(
          'bucket_date', v_work.id::text,
          'bucket_half', 'am',
          'capacity_point', 1
        ))
      );
      insert into flowmate_permission_probe_results
      values ('unrelated_user_reschedule_rejected', 'FAIL', 'Unrelated user rescheduled capacity');
    exception when sqlstate '42501' then
      insert into flowmate_permission_probe_results
      values ('unrelated_user_reschedule_rejected', 'PASS', 'Owner/requester/admin rule enforced');
    when others then
      get stacked diagnostics v_error = message_text;
      insert into flowmate_permission_probe_results
      values ('unrelated_user_reschedule_rejected', 'FAIL', v_error);
    end;
  end if;
end;
$permission_probes$;

select probe, result, detail
from flowmate_permission_probe_results
order by probe;

rollback;
