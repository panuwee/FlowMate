-- PREPARED ONLY: requires explicit production SQL approval.
-- Additive endpoint; retains invoker RLS, original formulas and all report fields.
-- Source: production catalog captured 2026-10-27. Guard rejects later formula drift.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $preflight$
begin
  if to_regprocedure('public.flowmate_creative_kpi_report_period(integer,integer,uuid[])') is not null then
    raise exception 'Fast KPI endpoint already exists; inspect before replacing';
  end if;
  if md5(pg_catalog.pg_get_viewdef('public.flowmate_creative_kpi_facts_v'::regclass,true)) <> '5fe4341b45fe458f81c6bbee18752294'
    or md5(pg_catalog.pg_get_viewdef('public.flowmate_creative_kpi_report_v'::regclass,true)) <> '5e3ab8e028580d12b60e90e8a5191c09'
    or md5(pg_catalog.pg_get_viewdef('public.flowmate_creative_kpi_progression_v'::regclass,true)) <> '26eef05c6c65c0feea04a78f26e03188'
    or md5(pg_catalog.pg_get_functiondef('public.flowmate_kpi_owner_at(uuid,timestamptz)'::regprocedure)) <> 'a5123aaae666104940fa51736066eab1' then
    raise exception 'KPI source changed; rebuild and verify the candidate before installation';
  end if;
end $preflight$;

create function public.flowmate_creative_kpi_report_period(p_year integer, p_month integer default null, p_work_item_ids uuid[] default null)
returns jsonb language plpgsql stable security invoker
set search_path=pg_catalog,public
as $fast_report$
declare v_result jsonb; v_month_start timestamptz; v_month_end timestamptz;
begin
  if p_year is null or p_year < 2026 or p_year > 2100 then
    raise exception 'Invalid Creative report year' using errcode='22023';
  end if;
  if p_month is not null and (p_month < 1 or p_month > 12) then
    raise exception 'Invalid Creative report month' using errcode='22023';
  end if;
  if (select provolatile <> 's' from pg_proc where oid='public.flowmate_kpi_can_view()'::regprocedure) then
    raise exception 'Report gate is no longer stable' using errcode='55000';
  end if;
  if p_month is not null then
    v_month_start := make_date(p_year,p_month,1)::timestamp at time zone 'Asia/Bangkok';
    v_month_end := (make_date(p_year,p_month,1)::timestamp + interval '1 month') at time zone 'Asia/Bangkok';
  end if;
  if p_work_item_ids is not null and cardinality(p_work_item_ids)>40 then
    raise exception 'Diagnostic batch exceeds 40 tasks' using errcode='22023';
  end if;
  if auth.uid() is null or not coalesce(public.flowmate_kpi_can_view(),false) then
    raise exception 'KPI access denied' using errcode='42501';
  end if;
  if md5(pg_catalog.pg_get_viewdef('public.flowmate_creative_kpi_facts_v'::regclass,true)) <> '5fe4341b45fe458f81c6bbee18752294'
    or md5(pg_catalog.pg_get_viewdef('public.flowmate_creative_kpi_report_v'::regclass,true)) <> '5e3ab8e028580d12b60e90e8a5191c09'
    or md5(pg_catalog.pg_get_viewdef('public.flowmate_creative_kpi_progression_v'::regclass,true)) <> '26eef05c6c65c0feea04a78f26e03188'
    or md5(pg_catalog.pg_get_functiondef('public.flowmate_kpi_owner_at(uuid,timestamptz)'::regprocedure)) <> 'a5123aaae666104940fa51736066eab1' then
    raise exception 'KPI source changed; report endpoint needs review' using errcode='55000';
  end if;
  with kpi_access as materialized (select public.flowmate_kpi_can_view() allowed), kpi_scope as materialized (
    select * from public.work_items scope_item
    where work_type='creative_request'
      and created_at < (make_date(p_year+1,1,1)::timestamp at time zone 'Asia/Bangkok')
      and (p_work_item_ids is null or id=any(p_work_item_ids))
      -- A superset of every selected-month cohort. Creation month alone loses
      -- cross-year deliveries, first reviews, starts and existing open work.
      and (p_month is null
        or (created_at >= v_month_start and created_at < v_month_end)
        or (created_at < v_month_end and status not in ('delivered','cancelled'))
        or exists (select 1 from public.work_item_events period_event
          where period_event.work_item_id=scope_item.id
            and period_event.created_at >= v_month_start and period_event.created_at < v_month_end))
  ), kpi_details as materialized (
    select d.* from public.creative_request_details d
    where d.work_item_id in (select id from kpi_scope)
  ), kpi_members as materialized (
    select * from public.team_members
  ), kpi_users as materialized (
    select u.* from public.users u
    where u.id in (select requester_user_id from kpi_scope)
  ), kpi_all_progression as (
    select task_report.* from kpi_scope task_scope
    cross join lateral (
      with kpi_work_items as materialized (select task_scope.*), kpi_events as materialized (
    select e.* from public.work_item_events e
    where e.work_item_id in (select id from kpi_work_items)
  ), kpi_assignments as materialized (
    select a.* from public.assignment_runs a
    where a.work_item_id in (select id from kpi_work_items)
  ), kpi_facts as (SELECT work_item_id,
    display_id,
    priority,
    effort_point,
    status,
    asset_type,
    asset_subtype,
    asset_count,
    requester_user_id,
    requester_name,
    requester_team,
    owner_member_id_at_start,
    owner_name_at_start,
    owner_discipline,
    current_owner_member_id,
    due_date,
    final_approved_due_date,
    launch_date,
    assigned_at,
    started_at,
    review_submitted_at,
    review_month,
    brief_ready_at,
    brief_ready_is_proxy,
    first_assignment_result,
    first_requester_activity_at,
    review_decided_at,
    review_decision,
    review_decision_by_user_id,
    rework_at,
    delivered_at,
    archived_at,
    assigned_to_started_working_days,
    raw_production_working_days,
    blocked_during_production_working_days,
    production_working_days,
    review_first_response_working_days,
    review_decision_working_days,
    review_open_age_working_days,
    brief_to_launch_working_days,
    first_draft_on_time,
    review_sla_met,
    review_sla_eligible,
    brief_complete_first_pass,
    data_quality_flags,
    exception_flags
   FROM ( WITH history AS (
                 SELECT wi.id AS work_item_id,
                    wi.display_id,
                    wi.priority,
                    wi.effort_point,
                    wi.status,
                    wi.requester_user_id,
                    wi.requester_team,
                    wi.final_owner_member_id AS current_owner_member_id,
                    wi.due_date,
                    wi.final_approved_due_date,
                    wi.launch_date,
                    wi.delivered_at,
                    wi.archived_at,
                    crd.asset_type,
                    crd.asset_subtype,
                    crd.asset_count,
                    assigned.created_at AS assigned_at,
                    started.created_at AS started_at,
                    review.created_at AS review_submitted_at,
                    brief_ready.ran_at AS brief_ready_at,
                    first_assignment.result AS first_assignment_result,
                    owner_assignment.final_owner_member_id AS historical_owner_member_id,
                    requester_comment.created_at AS first_requester_comment_at,
                    requester_decision.created_at AS review_decided_at,
                    requester_decision.to_status AS review_decision_status,
                    requester_decision.actor_user_id AS review_decision_by_user_id,
                    any_decision.created_at AS first_any_review_decision_at,
                    any_decision.actor_user_id AS first_any_review_decision_by_user_id,
                    rework.created_at AS rework_at,
                    admin_override.has_admin_override,
                    COALESCE(blocked.blocked_days, 0::numeric) AS blocked_during_production_working_days
                   FROM kpi_work_items wi
                     LEFT JOIN kpi_details crd ON crd.work_item_id = wi.id
                     LEFT JOIN LATERAL ( SELECT e.created_at
                           FROM kpi_events e
                          WHERE e.work_item_id = wi.id AND e.to_status = 'assigned'::work_status
                          ORDER BY e.created_at, e.id
                         LIMIT 1) assigned ON true
                     LEFT JOIN LATERAL ( SELECT e.created_at
                           FROM kpi_events e
                          WHERE e.work_item_id = wi.id AND e.to_status = 'in_progress'::work_status AND (assigned.created_at IS NULL OR e.created_at >= assigned.created_at)
                          ORDER BY e.created_at, e.id
                         LIMIT 1) started ON true
                     LEFT JOIN LATERAL ( SELECT e.created_at
                           FROM kpi_events e
                          WHERE e.work_item_id = wi.id AND e.from_status = 'in_progress'::work_status AND e.to_status = 'review'::work_status AND (started.created_at IS NULL OR e.created_at >= started.created_at)
                          ORDER BY e.created_at, e.id
                         LIMIT 1) review ON true
                     LEFT JOIN LATERAL ( SELECT ar.ran_at
                           FROM kpi_assignments ar
                          WHERE ar.work_item_id = wi.id AND (ar.result::text = ANY (ARRAY['assigned'::text, 'unassigned'::text, 'queued'::text]))
                          ORDER BY ar.ran_at, ar.id
                         LIMIT 1) brief_ready ON true
                     LEFT JOIN LATERAL ( SELECT ar.result::text AS result
                           FROM kpi_assignments ar
                          WHERE ar.work_item_id = wi.id
                          ORDER BY ar.ran_at, ar.id
                         LIMIT 1) first_assignment ON true
                     LEFT JOIN LATERAL ( SELECT ar.final_owner_member_id
                           FROM kpi_assignments ar
                          WHERE ar.work_item_id = wi.id AND ar.final_owner_member_id IS NOT NULL AND (started.created_at IS NULL OR ar.ran_at <= started.created_at)
                          ORDER BY ar.ran_at DESC, ar.id DESC
                         LIMIT 1) owner_assignment ON true
                     LEFT JOIN LATERAL ( SELECT c.created_at
                           FROM comments c
                          WHERE c.work_item_id = wi.id AND c.author_user_id = wi.requester_user_id AND c.deleted_at IS NULL AND review.created_at IS NOT NULL AND c.created_at >= review.created_at
                          ORDER BY c.created_at, c.id
                         LIMIT 1) requester_comment ON true
                     LEFT JOIN LATERAL ( SELECT e.created_at,
                            e.to_status,
                            e.actor_user_id
                           FROM kpi_events e
                          WHERE e.work_item_id = wi.id AND e.from_status = 'review'::work_status AND (e.to_status = ANY (ARRAY['delivered'::work_status, 'in_progress'::work_status, 'cancelled'::work_status])) AND e.actor_user_id = wi.requester_user_id AND review.created_at IS NOT NULL AND e.created_at >= review.created_at
                          ORDER BY e.created_at, e.id
                         LIMIT 1) requester_decision ON true
                     LEFT JOIN LATERAL ( SELECT e.created_at,
                            e.actor_user_id
                           FROM kpi_events e
                          WHERE e.work_item_id = wi.id AND e.from_status = 'review'::work_status AND (e.to_status = ANY (ARRAY['delivered'::work_status, 'in_progress'::work_status, 'cancelled'::work_status])) AND review.created_at IS NOT NULL AND e.created_at >= review.created_at
                          ORDER BY e.created_at, e.id
                         LIMIT 1) any_decision ON true
                     LEFT JOIN LATERAL ( SELECT e.created_at
                           FROM kpi_events e
                          WHERE e.work_item_id = wi.id AND e.from_status = 'review'::work_status AND e.to_status = 'in_progress'::work_status AND review.created_at IS NOT NULL AND e.created_at >= review.created_at
                          ORDER BY e.created_at, e.id
                         LIMIT 1) rework ON true
                     LEFT JOIN LATERAL ( SELECT (EXISTS ( SELECT 1
                                   FROM kpi_events e
                                  WHERE e.work_item_id = wi.id AND (lower(COALESCE(e.metadata ->> 'admin_override'::text, 'false'::text)) = 'true'::text OR (e.metadata ->> 'source'::text) = 'admin_override'::text))) AS has_admin_override) admin_override ON true
                     LEFT JOIN LATERAL ( SELECT COALESCE(sum(flowmate_kpi_working_duration_days(GREATEST(block_event.created_at, started.created_at), LEAST(COALESCE(resumed.created_at, review.created_at), review.created_at), 'gdve'::text)), 0::numeric) AS blocked_days
                           FROM kpi_events block_event
                             LEFT JOIN LATERAL ( SELECT e.created_at
                                   FROM kpi_events e
                                  WHERE e.work_item_id = block_event.work_item_id AND e.created_at > block_event.created_at AND e.from_status = 'blocked'::work_status AND e.to_status IS NOT NULL
                                  ORDER BY e.created_at, e.id
                                 LIMIT 1) resumed ON true
                          WHERE block_event.work_item_id = wi.id AND block_event.to_status = 'blocked'::work_status AND started.created_at IS NOT NULL AND review.created_at IS NOT NULL AND block_event.created_at < review.created_at) blocked ON true
                  WHERE wi.work_type = 'creative_request'::work_type AND (select allowed from kpi_access)
                ), resolved AS (
                 SELECT history.work_item_id,
                    history.display_id,
                    history.priority,
                    history.effort_point,
                    history.status,
                    history.requester_user_id,
                    history.requester_team,
                    history.current_owner_member_id,
                    history.due_date,
                    history.final_approved_due_date,
                    history.launch_date,
                    history.delivered_at,
                    history.archived_at,
                    history.asset_type,
                    history.asset_subtype,
                    history.asset_count,
                    history.assigned_at,
                    history.started_at,
                    history.review_submitted_at,
                    history.brief_ready_at,
                    history.first_assignment_result,
                    history.historical_owner_member_id,
                    history.first_requester_comment_at,
                    history.review_decided_at,
                    history.review_decision_status,
                    history.review_decision_by_user_id,
                    history.first_any_review_decision_at,
                    history.first_any_review_decision_by_user_id,
                    history.rework_at,
                    history.has_admin_override,
                    history.blocked_during_production_working_days,
                    COALESCE(history.historical_owner_member_id, history.current_owner_member_id) AS owner_member_id_at_start,
                        CASE
                            WHEN history.first_requester_comment_at IS NULL THEN history.review_decided_at
                            WHEN history.review_decided_at IS NULL THEN history.first_requester_comment_at
                            ELSE LEAST(history.first_requester_comment_at, history.review_decided_at)
                        END AS first_requester_activity_at,
                        CASE history.review_decision_status
                            WHEN 'delivered'::work_status THEN 'approved'::text
                            WHEN 'in_progress'::work_status THEN 'changes_requested'::text
                            WHEN 'cancelled'::work_status THEN 'cancelled'::text
                            ELSE NULL::text
                        END AS review_decision
                   FROM history
                ), named AS (
                 SELECT resolved.work_item_id,
                    resolved.display_id,
                    resolved.priority,
                    resolved.effort_point,
                    resolved.status,
                    resolved.requester_user_id,
                    resolved.requester_team,
                    resolved.current_owner_member_id,
                    resolved.due_date,
                    resolved.final_approved_due_date,
                    resolved.launch_date,
                    resolved.delivered_at,
                    resolved.archived_at,
                    resolved.asset_type,
                    resolved.asset_subtype,
                    resolved.asset_count,
                    resolved.assigned_at,
                    resolved.started_at,
                    resolved.review_submitted_at,
                    resolved.brief_ready_at,
                    resolved.first_assignment_result,
                    resolved.historical_owner_member_id,
                    resolved.first_requester_comment_at,
                    resolved.review_decided_at,
                    resolved.review_decision_status,
                    resolved.review_decision_by_user_id,
                    resolved.first_any_review_decision_at,
                    resolved.first_any_review_decision_by_user_id,
                    resolved.rework_at,
                    resolved.has_admin_override,
                    resolved.blocked_during_production_working_days,
                    resolved.owner_member_id_at_start,
                    resolved.first_requester_activity_at,
                    resolved.review_decision,
                    owner.display_name AS owner_name_at_start,
                    COALESCE(owner.discipline_short, owner.discipline) AS owner_discipline,
                    requester.display_name AS requester_name
                   FROM resolved
                     LEFT JOIN kpi_members owner ON owner.id = resolved.owner_member_id_at_start
                     LEFT JOIN kpi_users requester ON requester.id = resolved.requester_user_id
                ), measured AS (
                 SELECT named.work_item_id,
                    named.display_id,
                    named.priority,
                    named.effort_point,
                    named.status,
                    named.requester_user_id,
                    named.requester_team,
                    named.current_owner_member_id,
                    named.due_date,
                    named.final_approved_due_date,
                    named.launch_date,
                    named.delivered_at,
                    named.archived_at,
                    named.asset_type,
                    named.asset_subtype,
                    named.asset_count,
                    named.assigned_at,
                    named.started_at,
                    named.review_submitted_at,
                    named.brief_ready_at,
                    named.first_assignment_result,
                    named.historical_owner_member_id,
                    named.first_requester_comment_at,
                    named.review_decided_at,
                    named.review_decision_status,
                    named.review_decision_by_user_id,
                    named.first_any_review_decision_at,
                    named.first_any_review_decision_by_user_id,
                    named.rework_at,
                    named.has_admin_override,
                    named.blocked_during_production_working_days,
                    named.owner_member_id_at_start,
                    named.first_requester_activity_at,
                    named.review_decision,
                    named.owner_name_at_start,
                    named.owner_discipline,
                    named.requester_name,
                    date_trunc('month'::text, (named.review_submitted_at AT TIME ZONE 'Asia/Bangkok'::text))::date AS review_month,
                    flowmate_kpi_working_duration_days(named.assigned_at, named.started_at, 'gdve'::text) AS assigned_to_started_working_days,
                    flowmate_kpi_working_duration_days(named.started_at, named.review_submitted_at, 'gdve'::text) AS raw_production_working_days,
                        CASE
                            WHEN named.started_at IS NULL OR named.review_submitted_at IS NULL THEN NULL::numeric
                            ELSE GREATEST(flowmate_kpi_working_duration_days(named.started_at, named.review_submitted_at, 'gdve'::text) - named.blocked_during_production_working_days, 0::numeric)
                        END AS production_working_days,
                    flowmate_kpi_working_duration_days(named.review_submitted_at, named.first_requester_activity_at, 'requester'::text) AS review_first_response_working_days,
                    flowmate_kpi_working_duration_days(named.review_submitted_at, named.review_decided_at, 'requester'::text) AS review_decision_working_days,
                    flowmate_kpi_working_duration_days(named.review_submitted_at, now(), 'requester'::text) AS review_open_age_working_days,
                    flowmate_kpi_working_date_gap((named.brief_ready_at AT TIME ZONE 'Asia/Bangkok'::text)::date, named.launch_date, 'requester'::text) AS brief_to_launch_working_days
                   FROM named
                )
         SELECT measured.work_item_id,
            measured.display_id,
            measured.priority,
            measured.effort_point,
            measured.status,
            measured.asset_type,
            measured.asset_subtype,
            measured.asset_count,
            measured.requester_user_id,
            measured.requester_name,
            measured.requester_team,
            measured.owner_member_id_at_start,
            measured.owner_name_at_start,
            measured.owner_discipline,
            measured.current_owner_member_id,
            measured.due_date,
            measured.final_approved_due_date,
            measured.launch_date,
            measured.assigned_at,
            measured.started_at,
            measured.review_submitted_at,
            measured.review_month,
            measured.brief_ready_at,
            measured.brief_ready_at IS NOT NULL AS brief_ready_is_proxy,
            measured.first_assignment_result,
            measured.first_requester_activity_at,
            measured.review_decided_at,
            measured.review_decision,
            measured.review_decision_by_user_id,
            measured.rework_at,
            measured.delivered_at,
            measured.archived_at,
            measured.assigned_to_started_working_days,
            measured.raw_production_working_days,
            measured.blocked_during_production_working_days,
            measured.production_working_days,
            measured.review_first_response_working_days,
            measured.review_decision_working_days,
            measured.review_open_age_working_days,
            measured.brief_to_launch_working_days,
                CASE
                    WHEN measured.review_submitted_at IS NULL THEN NULL::boolean
                    ELSE (measured.review_submitted_at AT TIME ZONE 'Asia/Bangkok'::text)::date <= measured.due_date
                END AS first_draft_on_time,
                CASE
                    WHEN measured.first_requester_activity_at IS NULL THEN false
                    ELSE flowmate_kpi_working_date_gap((measured.review_submitted_at AT TIME ZONE 'Asia/Bangkok'::text)::date, (measured.first_requester_activity_at AT TIME ZONE 'Asia/Bangkok'::text)::date, 'requester'::text) <= 1
                END AS review_sla_met,
                CASE
                    WHEN measured.review_submitted_at IS NULL THEN false
                    WHEN measured.first_requester_activity_at IS NOT NULL THEN true
                    ELSE flowmate_kpi_working_date_gap((measured.review_submitted_at AT TIME ZONE 'Asia/Bangkok'::text)::date, (now() AT TIME ZONE 'Asia/Bangkok'::text)::date, 'requester'::text) > 1
                END AS review_sla_eligible,
            measured.first_assignment_result IS NOT NULL AND measured.first_assignment_result <> 'need_brief'::text AS brief_complete_first_pass,
            array_remove(ARRAY[
                CASE
                    WHEN measured.assigned_at IS NULL THEN 'missing_assigned_event'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.started_at IS NULL THEN 'missing_started_event'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.review_submitted_at IS NULL THEN 'missing_review_event'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.brief_ready_at IS NULL THEN 'missing_brief_ready_proxy'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.owner_member_id_at_start IS NULL THEN 'missing_owner_at_start'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.historical_owner_member_id IS NULL AND measured.current_owner_member_id IS NOT NULL AND measured.started_at IS NOT NULL THEN 'owner_snapshot_fallback'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.first_any_review_decision_at IS NOT NULL AND measured.review_decided_at IS NULL THEN 'review_decision_actor_mismatch'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.assigned_at IS NOT NULL AND measured.started_at IS NOT NULL AND measured.started_at < measured.assigned_at THEN 'invalid_assigned_started_sequence'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.started_at IS NOT NULL AND measured.review_submitted_at IS NOT NULL AND measured.review_submitted_at < measured.started_at THEN 'invalid_started_review_sequence'::text
                    ELSE NULL::text
                END], NULL::text) AS data_quality_flags,
            array_remove(ARRAY[
                CASE
                    WHEN measured.priority = 'urgent'::priority_level THEN 'urgent'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.has_admin_override THEN 'admin_override'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.rework_at IS NOT NULL THEN 'rework'::text
                    ELSE NULL::text
                END,
                CASE
                    WHEN measured.review_decision = 'cancelled'::text THEN 'cancelled_after_review'::text
                    ELSE NULL::text
                END], NULL::text) AS exception_flags
           FROM measured) report
  WHERE NOT activity_automation_is_test(work_item_id)), kpi_report as (SELECT f.work_item_id,
    f.display_id,
    f.priority,
    f.effort_point,
    f.status,
    f.asset_type,
    f.asset_subtype,
    f.asset_count,
    f.requester_user_id,
    f.requester_name,
    f.requester_team,
    f.owner_member_id_at_start,
    f.owner_name_at_start,
    f.owner_discipline,
    f.current_owner_member_id,
    f.due_date,
    f.final_approved_due_date,
    f.launch_date,
    f.assigned_at,
    f.started_at,
    f.review_submitted_at,
    f.review_month,
    f.brief_ready_at,
    f.brief_ready_is_proxy,
    f.first_assignment_result,
    f.first_requester_activity_at,
    f.review_decided_at,
    f.review_decision,
    f.review_decision_by_user_id,
    f.rework_at,
    f.delivered_at,
    f.archived_at,
    f.assigned_to_started_working_days,
    f.raw_production_working_days,
    f.blocked_during_production_working_days,
    f.production_working_days,
    f.review_first_response_working_days,
    f.review_decision_working_days,
    f.review_open_age_working_days,
    f.brief_to_launch_working_days,
    f.first_draft_on_time,
    f.review_sla_met,
    f.review_sla_eligible,
    f.brief_complete_first_pass,
    f.data_quality_flags,
    f.exception_flags,
    wi.title,
    wi.created_at,
    tm.member_code AS owner_member_code,
    flowmate_kpi_ai_tags(f.work_item_id) AS ai_tags,
    crd.asset_type_2,
    crd.asset_subtype_2,
    crd.asset_count_2,
    EXTRACT(year FROM (wi.created_at AT TIME ZONE 'Asia/Bangkok'::text))::integer AS created_year,
    EXTRACT(year FROM (f.review_submitted_at AT TIME ZONE 'Asia/Bangkok'::text))::integer AS review_year,
    EXTRACT(year FROM (f.delivered_at AT TIME ZONE 'Asia/Bangkok'::text))::integer AS delivery_year,
    f.status <> ALL (ARRAY['delivered'::work_status, 'cancelled'::work_status]) AS is_open
   FROM kpi_facts f
     JOIN kpi_work_items wi ON wi.id = f.work_item_id
     LEFT JOIN kpi_members tm ON tm.id = f.owner_member_id_at_start
     LEFT JOIN kpi_details crd ON crd.work_item_id = f.work_item_id
  WHERE (select allowed from kpi_access)),
  kpi_progression as (WITH base AS (
         SELECT r.work_item_id,
            r.display_id,
            r.priority,
            r.effort_point,
            r.status,
            r.asset_type,
            r.asset_subtype,
            r.asset_count,
            r.requester_user_id,
            r.requester_name,
            r.requester_team,
            r.owner_member_id_at_start,
            r.owner_name_at_start,
            r.owner_discipline,
            r.current_owner_member_id,
            r.due_date,
            r.final_approved_due_date,
            r.launch_date,
            r.assigned_at,
            r.started_at,
            r.review_submitted_at,
            r.review_month,
            r.brief_ready_at,
            r.brief_ready_is_proxy,
            r.first_assignment_result,
            r.first_requester_activity_at,
            r.review_decided_at,
            r.review_decision,
            r.review_decision_by_user_id,
            r.rework_at,
            r.delivered_at,
            r.archived_at,
            r.assigned_to_started_working_days,
            r.raw_production_working_days,
            r.blocked_during_production_working_days,
            r.production_working_days,
            r.review_first_response_working_days,
            r.review_decision_working_days,
            r.review_open_age_working_days,
            r.brief_to_launch_working_days,
            r.first_draft_on_time,
            r.review_sla_met,
            r.review_sla_eligible,
            r.brief_complete_first_pass,
            r.data_quality_flags,
            r.exception_flags,
            r.title,
            r.created_at,
            r.owner_member_code,
            r.ai_tags,
            r.asset_type_2,
            r.asset_subtype_2,
            r.asset_count_2,
            r.created_year,
            r.review_year,
            r.delivery_year,
            r.is_open,
            d.at AS first_delivered_at,
            a.at AS acknowledged_at,
            COALESCE(ds.occurred_at, d.at) AS delivery_at,
            COALESCE(ast.occurred_at, a.at) AS acknowledge_at,
                CASE
                    WHEN cs.work_item_id IS NULL THEN r.due_date
                    ELSE cs.due_date
                END AS created_due,
                CASE
                    WHEN ass.work_item_id IS NULL THEN r.due_date
                    ELSE ass.due_date
                END AS assigned_due,
                CASE
                    WHEN ass.work_item_id IS NULL THEN r.due_date
                    ELSE ass.due_date
                END AS evaluation_due,
                CASE
                    WHEN ass.work_item_id IS NULL THEN r.launch_date
                    ELSE ass.launch_date
                END AS evaluation_launch,
                CASE
                    WHEN ass.work_item_id IS NULL THEN 'current_dates'::text
                    ELSE 'first_assignment_snapshot'::text
                END AS deadline_source,
                CASE
                    WHEN ds.work_item_id IS NULL THEN r.ai_tags
                    ELSE ds.ai_tags
                END AS delivered_ai_tags,
                CASE
                    WHEN ds.work_item_id IS NULL THEN 'current_tags'::text
                    ELSE 'delivery_snapshot'::text
                END AS ai_evidence_source,
                CASE
                    WHEN ds.work_item_id IS NOT NULL THEN to_jsonb(ds.*)
                    ELSE NULL::jsonb
                END AS delivery_snapshot,
                CASE
                    WHEN rs.work_item_id IS NOT NULL THEN to_jsonb(rs.*)
                    ELSE NULL::jsonb
                END AS review_snapshot,
                CASE
                    WHEN ast.work_item_id IS NOT NULL THEN to_jsonb(ast.*)
                    ELSE NULL::jsonb
                END AS start_snapshot,
            (with changes as (
    select ar.final_owner_member_id as member_id, ar.ran_at as at, ar.id::text as tie, 0 as priority
    from kpi_assignments ar where ar.work_item_id=r.work_item_id and ar.ran_at<=d.at and ar.final_owner_member_id is not null
    union all
    select case when e.metadata->>'new_member_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e.metadata->>'new_member_id')::uuid end,
      e.created_at,e.id::text,1
    from kpi_events e where e.work_item_id=r.work_item_id and e.created_at<=d.at
      and e.metadata->>'action'='assignee_changed' and e.metadata ? 'new_member_id'
  ), latest as (select * from changes order by at desc,priority desc,tie desc limit 1)
  select jsonb_build_object('owner_member_id',l.member_id,'owner_name',tm.display_name,'owner_code',tm.member_code)
  from latest l left join kpi_members tm on tm.id=l.member_id where (select allowed from kpi_access)) AS delivery_history_owner,
            (with changes as (
    select ar.final_owner_member_id as member_id, ar.ran_at as at, ar.id::text as tie, 0 as priority
    from kpi_assignments ar where ar.work_item_id=r.work_item_id and ar.ran_at<=r.review_submitted_at and ar.final_owner_member_id is not null
    union all
    select case when e.metadata->>'new_member_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e.metadata->>'new_member_id')::uuid end,
      e.created_at,e.id::text,1
    from kpi_events e where e.work_item_id=r.work_item_id and e.created_at<=r.review_submitted_at
      and e.metadata->>'action'='assignee_changed' and e.metadata ? 'new_member_id'
  ), latest as (select * from changes order by at desc,priority desc,tie desc limit 1)
  select jsonb_build_object('owner_member_id',l.member_id,'owner_name',tm.display_name,'owner_code',tm.member_code)
  from latest l left join kpi_members tm on tm.id=l.member_id where (select allowed from kpi_access)) AS review_history_owner,
            (with changes as (
    select ar.final_owner_member_id as member_id, ar.ran_at as at, ar.id::text as tie, 0 as priority
    from kpi_assignments ar where ar.work_item_id=r.work_item_id and ar.ran_at<=a.at and ar.final_owner_member_id is not null
    union all
    select case when e.metadata->>'new_member_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (e.metadata->>'new_member_id')::uuid end,
      e.created_at,e.id::text,1
    from kpi_events e where e.work_item_id=r.work_item_id and e.created_at<=a.at
      and e.metadata->>'action'='assignee_changed' and e.metadata ? 'new_member_id'
  ), latest as (select * from changes order by at desc,priority desc,tie desc limit 1)
  select jsonb_build_object('owner_member_id',l.member_id,'owner_name',tm.display_name,'owner_code',tm.member_code)
  from latest l left join kpi_members tm on tm.id=l.member_id where (select allowed from kpi_access)) AS start_history_owner,
            (EXISTS ( SELECT 1
                   FROM kpi_events e
                  WHERE e.work_item_id = r.work_item_id AND (e.metadata ->> 'action'::text) = 'assignee_changed'::text AND e.created_at >= r.started_at AND e.created_at <= r.review_submitted_at)) AS reassigned_during_production,
            ( SELECT count(*)::integer AS count
                   FROM kpi_events e
                  WHERE e.work_item_id = r.work_item_id AND e.to_status::text = 'delivered'::text) AS delivered_event_n,
            ( SELECT COALESCE(jsonb_agg(to_jsonb(b.*) ORDER BY b.id), '[]'::jsonb) AS "coalesce"
                   FROM creative_kpi_brief_evidence b
                  WHERE b.work_item_id = r.work_item_id) AS brief_evidence,
            ( SELECT COALESCE(jsonb_agg(jsonb_build_object('at', e.created_at, 'actor', e.actor_user_id, 'change', e.metadata) ORDER BY e.created_at), '[]'::jsonb) AS "coalesce"
                   FROM kpi_events e
                  WHERE e.work_item_id = r.work_item_id AND (e.metadata ->> 'action'::text) = 'kpi_dates_changed'::text) AS deadline_history
           FROM kpi_report r
             LEFT JOIN LATERAL ( SELECT min(e.created_at) AS at
                   FROM kpi_events e
                  WHERE e.work_item_id = r.work_item_id AND e.to_status::text = 'delivered'::text) d ON true
             LEFT JOIN LATERAL ( SELECT min(e.created_at) AS at
                   FROM kpi_events e
                  WHERE e.work_item_id = r.work_item_id AND e.from_status::text = 'assigned'::text AND e.to_status::text = 'in_progress'::text) a ON true
             LEFT JOIN creative_kpi_milestones cs ON cs.work_item_id = r.work_item_id AND cs.milestone = 'created'::text
             LEFT JOIN creative_kpi_milestones ass ON ass.work_item_id = r.work_item_id AND ass.milestone = 'assigned'::text
             LEFT JOIN creative_kpi_milestones ast ON ast.work_item_id = r.work_item_id AND ast.milestone = 'started'::text
             LEFT JOIN creative_kpi_milestones rs ON rs.work_item_id = r.work_item_id AND rs.milestone = 'review'::text
             LEFT JOIN creative_kpi_milestones ds ON ds.work_item_id = r.work_item_id AND ds.milestone = 'delivered'::text
          WHERE (select allowed from kpi_access)
        )
 SELECT work_item_id,
    display_id,
    priority,
    effort_point,
    status,
    asset_type,
    asset_subtype,
    asset_count,
    requester_user_id,
    requester_name,
    requester_team,
    owner_member_id_at_start,
    owner_name_at_start,
    owner_discipline,
    current_owner_member_id,
    due_date,
    final_approved_due_date,
    launch_date,
    assigned_at,
    started_at,
    review_submitted_at,
    review_month,
    brief_ready_at,
    brief_ready_is_proxy,
    first_assignment_result,
    first_requester_activity_at,
    review_decided_at,
    review_decision,
    review_decision_by_user_id,
    rework_at,
    delivered_at,
    archived_at,
    assigned_to_started_working_days,
    raw_production_working_days,
    blocked_during_production_working_days,
    production_working_days,
    review_first_response_working_days,
    review_decision_working_days,
    review_open_age_working_days,
    brief_to_launch_working_days,
    first_draft_on_time,
    review_sla_met,
    review_sla_eligible,
    brief_complete_first_pass,
    data_quality_flags,
    exception_flags,
    title,
    created_at,
    owner_member_code,
    ai_tags,
    asset_type_2,
    asset_subtype_2,
    asset_count_2,
    created_year,
    review_year,
    delivery_year,
    is_open,
    first_delivered_at,
    acknowledged_at,
    delivery_at,
    acknowledge_at,
    created_due,
    assigned_due,
    evaluation_due,
    evaluation_launch,
    deadline_source,
    delivered_ai_tags,
    ai_evidence_source,
    delivery_snapshot,
    review_snapshot,
    start_snapshot,
    delivery_history_owner,
    review_history_owner,
    start_history_owner,
    reassigned_during_production,
    delivered_event_n,
    brief_evidence,
    deadline_history,
    EXTRACT(year FROM (delivery_at AT TIME ZONE 'Asia/Bangkok'::text))::integer AS first_delivery_year,
    EXTRACT(year FROM (acknowledge_at AT TIME ZONE 'Asia/Bangkok'::text))::integer AS started_year,
    flowmate_kpi_working_duration_days(created_at, acknowledge_at, 'gdve'::text) AS acknowledge_working_days,
    flowmate_kpi_working_duration_days(created_at, assigned_at, 'gdve'::text) AS queue_working_days,
    flowmate_kpi_working_duration_days(assigned_at, acknowledge_at, 'gdve'::text) AS assigned_acknowledge_working_days,
    flowmate_kpi_working_date_gap((review_submitted_at AT TIME ZONE 'Asia/Bangkok'::text)::date, evaluation_launch, 'gdve'::text) AS launch_buffer_working_days,
    flowmate_kpi_working_date_gap((created_at AT TIME ZONE 'Asia/Bangkok'::text)::date, created_due, 'gdve'::text) AS created_buffer_working_days,
    flowmate_kpi_working_date_gap((assigned_at AT TIME ZONE 'Asia/Bangkok'::text)::date, assigned_due, 'gdve'::text) AS assigned_buffer_working_days
   FROM base)
      select * from kpi_progression
    ) task_report
  ),
  result_rows as materialized (
    select * from kpi_all_progression
    where (created_year=p_year or review_year=p_year or first_delivery_year=p_year
      or started_year=p_year or (is_open=true and created_year<=p_year))
      and (p_month is null
        or (created_at >= v_month_start and created_at < v_month_end)
        or (review_submitted_at >= v_month_start and review_submitted_at < v_month_end)
        or (delivery_at >= v_month_start and delivery_at < v_month_end)
        or (acknowledge_at >= v_month_start and acknowledge_at < v_month_end)
        or (is_open=true and created_at < v_month_end))
  )
  select jsonb_build_object(
    'version',1,'year',p_year,'month',p_month,'scope',case when p_month is null then 'year' else 'month' end,
    'rows',coalesce(jsonb_agg(to_jsonb(r) order by r.work_item_id),'[]'::jsonb),
    'rowCount',count(*),'asOf',statement_timestamp(),
    'calendarActiveN',(select count(*) from public.flowmate_non_working_days
      where active=true and scope in ('all','gdve')
        and day>=make_date(p_year,1,1) and day<make_date(p_year+1,1,1))
  ) into v_result from result_rows r;
  return v_result;
end $fast_report$;
revoke all on function public.flowmate_creative_kpi_report_period(integer,integer,uuid[]) from public,anon,authenticated;
grant execute on function public.flowmate_creative_kpi_report_period(integer,integer,uuid[]) to authenticated;
comment on function public.flowmate_creative_kpi_report_period(integer,integer,uuid[]) is
 'Creative KPI period v1. Complete monthly or annual scope; invoker RLS; original formulas; statement-local reuse only.';
commit;
