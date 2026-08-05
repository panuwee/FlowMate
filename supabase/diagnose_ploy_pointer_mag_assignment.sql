-- FlowMate read-only diagnostic: Ploy assignments requested by Pointer or Mag.
-- Run in Supabase SQL Editor with an account that can read the referenced tables.
-- Every executable statement is a SELECT/CTE. This file does not change data or rules.
--
-- Ranked hypotheses to evaluate from the five result sets:
-- 1. Manual reassignment: Section 2 shows manual_assignment_rpc or assignee_changed
--    with an actor. This is the strongest direct evidence.
-- 2. Production engine drift: Section 5 fingerprint/body does not contain the
--    current context and active-linked-candidate signals.
-- 3. Request context drift: Section 4 resolves Pointer or Mag work to Esport,
--    or requester_team and owning_team_code disagree.
-- 4. Preferred candidate health: Section 3 is a current-only snapshot of
--    Pond/Jo/Tong/Eye. It can expose configuration drift now, but it cannot
--    prove past eligibility or capacity when the affected assignment occurred.
-- Root cause is not confirmed until these queries are run against Production and
-- the evidence for the affected work items is reviewed.

-- SECTION 1 - AFFECTED WORK AND LATEST ASSIGNMENT RUN
-- Interpretation: one row per work item currently owned by Ploy and requested by
-- Pointer or Mag. The assignment columns are the latest recorded engine/run result.
with target_people(person_name, email, member_code) as (
  values
    ('Ploy'::text, 'fco.thanyaporn@garena.com'::text, 'ploy'::text),
    ('Pointer'::text, 'fco.run@garena.com'::text, 'pointer'::text),
    ('Mag'::text, 'fco.thanatbhum@garena.com'::text, 'mag'::text)
),
affected_work as (
  select
    wi.id,
    wi.display_id,
    wi.title,
    wi.status,
    wi.created_at,
    wi.updated_at,
    wi.requester_team,
    wi.owning_team_code,
    wi.assignment_reason,
    requester.display_name as requester_name,
    requester.email as requester_email,
    owner.member_code as owner_member_code,
    owner.display_name as owner_name
  from public.work_items wi
  join public.users requester
    on requester.id = wi.requester_user_id
  left join public.team_members owner
    on owner.id = wi.final_owner_member_id
  where lower(requester.email) in (
      'fco.run@garena.com',
      'fco.thanatbhum@garena.com'
    )
    and (
      lower(owner.member_code) = 'ploy'
      or exists (
        select 1
        from public.assignment_runs historical_run
        left join public.team_members historical_final_owner
          on historical_final_owner.id = historical_run.final_owner_member_id
        left join public.team_members historical_suggested_owner
          on historical_suggested_owner.id = historical_run.suggested_owner_member_id
        where historical_run.work_item_id = wi.id
          and (
            lower(historical_final_owner.member_code) = 'ploy'
            or lower(historical_suggested_owner.member_code) = 'ploy'
          )
      )
      or exists (
        select 1
        from public.work_item_events historical_event
        where historical_event.work_item_id = wi.id
          and historical_event.metadata ->> 'new_member_code' = 'ploy'
      )
    )
),
ranked_runs as (
  select
    run.*,
    row_number() over (
      partition by run.work_item_id
      order by run.ran_at desc, run.id desc
    ) as recency_rank
  from public.assignment_runs run
  join affected_work aw
    on aw.id = run.work_item_id
)
select
  aw.display_id,
  aw.title,
  aw.status,
  aw.requester_name,
  aw.requester_email,
  aw.requester_team,
  aw.owning_team_code,
  aw.owner_name,
  aw.owner_member_code,
  aw.assignment_reason,
  aw.created_at as work_created_at,
  aw.updated_at as work_updated_at,
  latest.triggered_by as latest_trigger,
  latest.result as latest_result,
  latest.reason as latest_run_reason,
  latest.capacity_snapshot as latest_capacity_snapshot,
  latest.ran_at as latest_run_at
from affected_work aw
left join ranked_runs latest
  on latest.work_item_id = aw.id
 and latest.recency_rank = 1
order by aw.created_at desc, aw.display_id;

-- SECTION 2 - MANUAL VERSUS AUTOMATIC ASSIGNMENT EVIDENCE
-- Interpretation: manual_rpc/manual_event is direct manual evidence. An
-- automatic_event or engine_run only proves the engine ran; compare timestamps
-- because a later manual action can replace an earlier automatic owner.
with affected_work as (
  select wi.id, wi.display_id
  from public.work_items wi
  join public.users requester
    on requester.id = wi.requester_user_id
  left join public.team_members owner
    on owner.id = wi.final_owner_member_id
  where lower(requester.email) in (
      'fco.run@garena.com',
      'fco.thanatbhum@garena.com'
    )
    and (
      lower(owner.member_code) = 'ploy'
      or exists (
        select 1
        from public.assignment_runs historical_run
        left join public.team_members historical_final_owner
          on historical_final_owner.id = historical_run.final_owner_member_id
        left join public.team_members historical_suggested_owner
          on historical_suggested_owner.id = historical_run.suggested_owner_member_id
        where historical_run.work_item_id = wi.id
          and (
            lower(historical_final_owner.member_code) = 'ploy'
            or lower(historical_suggested_owner.member_code) = 'ploy'
          )
      )
      or exists (
        select 1
        from public.work_item_events historical_event
        where historical_event.work_item_id = wi.id
          and historical_event.metadata ->> 'new_member_code' = 'ploy'
      )
    )
),
event_evidence as (
  select
    aw.display_id,
    event.created_at as evidence_at,
    case
      when event.metadata ->> 'action' = 'assignee_changed' then 'manual_event'
      when event.event_type::text = 'assignment_ran' then 'automatic_event'
      else 'other_event'
    end as evidence_class,
    event.event_type::text as evidence_type,
    actor.display_name as actor_name,
    actor.email as actor_email,
    event.metadata as evidence_detail
  from affected_work aw
  join public.work_item_events event
    on event.work_item_id = aw.id
  left join public.users actor
    on actor.id = event.actor_user_id
  where event.event_type::text = 'assignment_ran'
     or event.metadata ->> 'action' = 'assignee_changed'
),
run_evidence as (
  select
    aw.display_id,
    run.ran_at as evidence_at,
    case
      when run.capacity_snapshot ->> 'source' = 'manual_assignment_rpc'
        then 'manual_rpc'
      else 'engine_run'
    end as evidence_class,
    run.triggered_by::text as evidence_type,
    actor.display_name as actor_name,
    actor.email as actor_email,
    jsonb_build_object(
      'result', run.result,
      'reason', run.reason,
      'suggested_owner_member_id', run.suggested_owner_member_id,
      'final_owner_member_id', run.final_owner_member_id,
      'capacity_snapshot', run.capacity_snapshot
    ) as evidence_detail
  from affected_work aw
  join public.assignment_runs run
    on run.work_item_id = aw.id
  left join public.users actor
    on actor.id::text = (run.capacity_snapshot ->> 'actor_user_id')
)
select *
from event_evidence
union all
select *
from run_evidence
order by display_id, evidence_at desc, evidence_class;

-- SECTION 3 - MARKETING GD/VE CANDIDATE HEALTH
-- Interpretation: Marketing/Operations context prefers Pond, Jo, Tong, and Eye
-- ahead of Vee/Ploy. This result uses current_date and is deliberately a
-- current-only configuration/capacity snapshot. It cannot prove past eligibility
-- at the time of an affected request; use historical logs/snapshots from Sections
-- 1 and 2 for evidence about the original assignment.
with preferred_candidates(member_code, marketing_preference_rank) as (
  values
    ('pond'::text, 1),
    ('jo'::text, 1),
    ('tong'::text, 1),
    ('eye'::text, 1),
    ('vee'::text, 2),
    ('ploy'::text, 2)
),
candidate_health as (
  select
    preferred.marketing_preference_rank,
    preferred.member_code as expected_member_code,
    member.id as team_member_id,
    member.display_name,
    member.active as member_active,
    member.availability::text as availability,
    member.skills,
    member.backup_skills,
    member.capacity_per_day,
    member.capacity_override_per_day,
    member.wip_limit,
    linked_user.id as linked_user_id,
    linked_user.email as linked_user_email,
    linked_user.is_active as linked_user_active,
    coalesce(active_work.active_work_count, 0) as active_work_count,
    coalesce(active_work.wip_count, 0) as wip_count,
    coalesce(active_work.overdue_count, 0) as overdue_count,
    coalesce(future_capacity.allocated_points, 0) as allocated_points_from_today,
    current_override.capacity_per_day as current_capacity_override,
    current_leave.leave_periods
  from preferred_candidates preferred
  left join public.team_members member
    on lower(member.member_code) = preferred.member_code
  left join public.users linked_user
    on linked_user.id = member.user_id
  left join lateral (
    select
      count(*) filter (
        where work.status in ('assigned', 'in_progress', 'review', 'blocked')
      )::integer as active_work_count,
      count(*) filter (
        where work.status = 'in_progress' and work.wip_counted = true
      )::integer as wip_count,
      count(*) filter (
        where work.status in ('assigned', 'in_progress', 'review', 'blocked')
          and work.due_date < current_date
      )::integer as overdue_count
    from public.work_items work
    where work.final_owner_member_id = member.id
  ) active_work on true
  left join lateral (
    select sum(allocation.capacity_point) as allocated_points
    from public.flowmate_capacity_allocations allocation
    join public.work_items allocated_work
      on allocated_work.id = allocation.work_item_id
    where allocation.team_member_id = member.id
      and allocation.bucket_date >= current_date
      and allocated_work.status in ('assigned', 'in_progress', 'review', 'blocked')
  ) future_capacity on true
  left join lateral (
    select override_row.capacity_per_day
    from public.capacity_overrides override_row
    where override_row.team_member_id = member.id
      and current_date between override_row.start_date and override_row.end_date
    order by override_row.created_at desc, override_row.id desc
    limit 1
  ) current_override on true
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'start_date', leave_row.start_date,
        'start_half', leave_row.start_half,
        'end_date', leave_row.end_date,
        'end_half', leave_row.end_half,
        'reason', leave_row.reason
      ) order by leave_row.start_date, leave_row.start_half
    ) as leave_periods
    from public.leave_requests leave_row
    where leave_row.team_member_id = member.id
      and leave_row.cancelled_at is null
      and leave_row.end_date >= current_date
  ) current_leave on true
)
select
  *,
  case
    when team_member_id is null then 'candidate row missing'
    when member_active is not true then 'candidate inactive'
    when linked_user_id is null then 'user link missing'
    when linked_user_active is not true then 'linked user inactive'
    when availability = 'leave' then 'candidate marked on leave'
    when wip_count >= wip_limit then 'candidate at WIP limit'
    else 'current snapshot looks healthy. This does not prove past eligibility'
  end as health_interpretation
from candidate_health
order by marketing_preference_rank, expected_member_code;

-- SECTION 4 - REQUEST CONTEXT AND TEAM LINKAGE DRIFT
-- Interpretation: Pointer and Mag should normally resolve to ops_marketing.
-- An Esport result, non-MKT owning workspace, or mismatched membership points to
-- request-context drift that can move Ploy ahead in the preference order.
with affected_work as (
  select
    wi.id,
    wi.display_id,
    wi.title,
    wi.requester_team,
    wi.owning_team_code,
    requester.id as requester_user_id,
    requester.display_name as requester_name,
    requester.email as requester_email,
    requester.requester_team as requester_profile_team,
    requester_member.member_code as requester_member_code,
    requester_member.discipline as requester_discipline,
    requester_member.discipline_short as requester_discipline_short
  from public.work_items wi
  join public.users requester
    on requester.id = wi.requester_user_id
  left join public.team_members requester_member
    on requester_member.user_id = requester.id
  left join public.team_members owner
    on owner.id = wi.final_owner_member_id
  where lower(requester.email) in (
      'fco.run@garena.com',
      'fco.thanatbhum@garena.com'
    )
    and (
      lower(owner.member_code) = 'ploy'
      or exists (
        select 1
        from public.assignment_runs historical_run
        left join public.team_members historical_final_owner
          on historical_final_owner.id = historical_run.final_owner_member_id
        left join public.team_members historical_suggested_owner
          on historical_suggested_owner.id = historical_run.suggested_owner_member_id
        where historical_run.work_item_id = wi.id
          and (
            lower(historical_final_owner.member_code) = 'ploy'
            or lower(historical_suggested_owner.member_code) = 'ploy'
          )
      )
      or exists (
        select 1
        from public.work_item_events historical_event
        where historical_event.work_item_id = wi.id
          and historical_event.metadata ->> 'new_member_code' = 'ploy'
      )
    )
),
context_evidence as (
  select
    aw.*,
    memberships.team_codes,
    case lower(trim(coalesce(aw.requester_team, '')))
      when 'marketing' then 'mkt'
      when 'mkt' then 'mkt'
      when 'team mkt' then 'mkt'
      when 'esport' then 'esport'
      when 'esports' then 'esport'
      when 'e-sport' then 'esport'
      when 'team esport' then 'esport'
      when 'esport ops' then 'esport'
      when 'operations' then 'ops'
      when 'operation' then 'ops'
      when 'ops' then 'ops'
      when 'team ops' then 'ops'
      when 'pm' then 'ops'
      when 'gd/ve' then 'gdve'
      when 'gdve' then 'gdve'
      when 'gd ve' then 'gdve'
      else null
    end as requester_team_normalized,
    case
      when lower(coalesce(aw.requester_team, '')) in ('esport', 'esports')
        or lower(coalesce(aw.requester_member_code, '')) in ('ben', 'net', 'peak', 'pluem')
        or lower(coalesce(aw.requester_discipline, '')) in ('esport', 'esports')
        or lower(coalesce(aw.requester_discipline_short, '')) in ('esport', 'esports')
        then 'esport'
      else 'ops_marketing'
    end as engine_request_context
  from affected_work aw
  left join lateral (
    select array_agg(
      membership.team_code order by membership.is_primary desc, membership.team_code
    ) as team_codes
    from public.user_team_memberships membership
    where membership.user_id = aw.requester_user_id
  ) memberships on true
)
select
  *,
  case
    when engine_request_context = 'esport'
      then 'requester signals resolve to Esport preference'
    when owning_team_code is distinct from 'mkt'
      then 'owning workspace is not Marketing'
    when requester_team_normalized is distinct from owning_team_code
      then 'requester_team and owning workspace disagree'
    when not ('mkt' = any(coalesce(team_codes, '{}'::text[])))
      then 'requester lacks Marketing membership'
    else 'context is consistent with Marketing - inspect manual evidence and candidate health'
  end as drift_interpretation
from context_evidence
order by display_id;

-- SECTION 5 - DEPLOYED ASSIGNMENT FUNCTION FINGERPRINT
-- Interpretation: compare definition_md5 between environments. The signal
-- columns should all be true for the current engine. A different fingerprint or
-- missing signal supports the older-production-engine hypothesis.
select
  namespace.nspname as function_schema,
  proc.proname as function_name,
  pg_get_function_identity_arguments(proc.oid) as identity_arguments,
  pg_get_function_result(proc.oid) as result_type,
  md5(pg_get_functiondef(proc.oid)) as definition_md5,
  pg_get_functiondef(proc.oid) ilike '%pond%jo%tong%eye%' as has_marketing_preference_pool,
  pg_get_functiondef(proc.oid) ilike '%ploy%vee%' as has_esport_preference_pool,
  pg_get_functiondef(proc.oid) ilike '%linked_user.is_active = true%' as requires_active_linked_user,
  pg_get_functiondef(proc.oid) ilike '%flowmate_capacity_allocations%' as checks_capacity_allocations,
  pg_get_functiondef(proc.oid) ilike '%flowmate_leave_fraction_for_bucket%' as checks_bucket_leave,
  pg_get_functiondef(proc.oid) as deployed_function_body
from pg_catalog.pg_proc proc
join pg_catalog.pg_namespace namespace
  on namespace.oid = proc.pronamespace
where namespace.nspname = 'public'
  and proc.proname = 'flowmate_run_assignment'
order by identity_arguments;
