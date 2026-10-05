-- LOCAL PREPARATION ONLY. Requires separate approval and fresh schema preflight before production apply.
-- Additive evidence storage; no historical work, deadline or survey backfill.
begin;
do $$ begin
 if to_regclass('public.work_items') is null
 or to_regclass('public.users') is null
 or to_regclass('public.team_members') is null
 or to_regclass('public.work_item_events') is null
 or to_regclass('public.creative_kpi_brief_evidence') is null
 or to_regprocedure('public.flowmate_current_user_can_read_work_item(uuid)') is null
 or to_regprocedure('public.flowmate_kpi_can_view()') is null
 or to_regprocedure('public.task_assign_can_execute(uuid,uuid)') is null
 or to_regtype('public.priority_level') is null
 or to_regprocedure('public.task_assign_create(text,text,text,text,date,uuid,date,text,uuid,public.priority_level,text,text[],boolean,uuid[],uuid)') is null
 then raise exception 'Install/verify the existing FlowMate and Task Assign permissions first'; end if;
end $$;
create schema if not exists flowmate_kpi_capture_private;
revoke all on schema flowmate_kpi_capture_private from public,anon,authenticated;

alter table public.work_items add column if not exists kpi_plan_at_intake text not null default 'unknown';
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.work_items'::regclass and conname='kpi_plan_at_intake_valid') then
  alter table public.work_items add constraint kpi_plan_at_intake_valid check(kpi_plan_at_intake in ('unknown','planned','unplanned'));
 end if;
end $$;

create table if not exists public.flowmate_kpi_calendars (
 version text primary key,
 coverage_start date not null,
 coverage_end date not null check(coverage_end>=coverage_start),
 weekdays integer[] not null check(weekdays<@array[0,1,2,3,4,5,6] and cardinality(weekdays)>0),
 holidays date[] not null,
 teams text[] not null,
 source_ref text not null,
 approval_basis text not null,
 recorded_at timestamptz not null default clock_timestamp()
);
alter table public.flowmate_kpi_calendars enable row level security;
revoke all on public.flowmate_kpi_calendars from public,anon,authenticated;
grant select on public.flowmate_kpi_calendars to authenticated;
drop policy if exists kpi_calendar_read on public.flowmate_kpi_calendars;
create policy kpi_calendar_read on public.flowmate_kpi_calendars for select to authenticated using((select public.flowmate_kpi_can_view()));
insert into public.flowmate_kpi_calendars(version,coverage_start,coverage_end,weekdays,holidays,teams,source_ref,approval_basis)
values('organization-2026-v1','2026-01-01','2026-12-31',array[1,2,3,4,5],
 array['2026-01-01','2026-01-02','2026-02-17','2026-03-03','2026-04-06','2026-04-13','2026-04-14','2026-04-15','2026-05-01','2026-05-04','2026-06-01','2026-06-03','2026-07-28','2026-07-29','2026-08-12','2026-10-13','2026-10-23','2026-12-07','2026-12-31']::date[],
 array['gdve','mkt','ops','esport'],'https://docs.google.com/spreadsheets/d/1fKVyUdSf2MZVmbSRhJ2mDdhXRwy5b5jKDITxW3priCA/edit#gid=1992742850; Holiday List!A21:D39','User confirmed all teams Mon-Fri and 19 holidays on 2026-10-05') on conflict do nothing;

create table if not exists public.flowmate_kpi_measurement_evidence (
 id bigint generated always as identity primary key,
 work_item_id uuid not null references public.work_items(id) on delete restrict,
 kind text not null check(kind in ('intake','deadline','ready','sla','csat')),
 work_domain text not null check(work_domain in ('creative_request','quick_task')),
 endpoint text check(endpoint in ('creative_draft','creative_delivery','task_submit','task_approve')),
 due_date date,
 required_on date,
 sla_workdays integer check(sla_workdays between 0 and 365),
 calendar_version text references public.flowmate_kpi_calendars(version),
 priority_at_intake text,
 plan_at_intake text check(plan_at_intake in ('unknown','planned','unplanned')),
 brief_fingerprint text,
 score integer check(score between 1 and 5),
 survey_period text,
 survey_definition text,
 owning_team_at_record text,
 actor_user_id uuid,
 recorded_at timestamptz not null default clock_timestamp(),
 reason text not null default '',
 request_key uuid,
 constraint kpi_evidence_shape check(
  (kind='intake' and priority_at_intake is not null and plan_at_intake is not null and endpoint is null)
  or (kind='deadline' and endpoint is not null and due_date is not null and actor_user_id is not null and length(trim(reason))>0)
  or (kind='ready' and brief_fingerprint is not null and actor_user_id is not null and length(trim(reason))>0)
  or (kind='sla' and required_on is not null and sla_workdays is not null and calendar_version is not null and actor_user_id is not null and length(trim(reason))>0)
  or (kind='csat' and score is not null and survey_period ~ '^20[0-9]{2}-Q[1-4]$' and survey_definition='internal-csat-1to5-v1' and actor_user_id is not null)
 ),
 unique(actor_user_id,request_key)
);
create index if not exists kpi_evidence_item_kind_idx on public.flowmate_kpi_measurement_evidence(work_item_id,kind,recorded_at,id);
create unique index if not exists kpi_evidence_intake_once on public.flowmate_kpi_measurement_evidence(work_item_id) where kind='intake';
create unique index if not exists kpi_evidence_csat_once on public.flowmate_kpi_measurement_evidence(work_item_id,survey_period) where kind='csat';
alter table public.flowmate_kpi_measurement_evidence enable row level security;
revoke all on public.flowmate_kpi_measurement_evidence from public,anon,authenticated;
revoke all on sequence public.flowmate_kpi_measurement_evidence_id_seq from public,anon,authenticated;
grant select,insert on public.flowmate_kpi_measurement_evidence to authenticated;
grant usage on sequence public.flowmate_kpi_measurement_evidence_id_seq to authenticated;

-- The internal executor helper is deliberately not callable by authenticated.
-- Bind its privileged lookup to the current actor and the canonical read scope.
create or replace function flowmate_kpi_capture_private.current_user_can_execute(p_item uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null
 and public.flowmate_current_user_can_read_work_item(p_item)
 and exists(select 1 from public.users u where u.id=auth.uid() and u.is_active and u.role::text<>'viewer')
 and public.task_assign_can_execute(auth.uid(),p_item);
$$;
revoke all on function flowmate_kpi_capture_private.current_user_can_execute(uuid) from public,anon,authenticated;
grant usage on schema flowmate_kpi_capture_private to authenticated;
grant execute on function flowmate_kpi_capture_private.current_user_can_execute(uuid) to authenticated;

create or replace function public.flowmate_kpi_can_record(p_item uuid,p_kind text)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.work_items w where w.id=p_item
 and auth.uid() is not null and public.flowmate_current_user_can_read_work_item(w.id)
 and exists(select 1 from public.users u where u.id=auth.uid() and u.is_active and u.role::text<>'viewer')
 and w.archived_at is null and (
  (p_kind='csat' and w.status::text='delivered' and w.requester_user_id=auth.uid())
  or (p_kind in ('deadline','sla','ready') and w.status::text not in ('delivered','cancelled') and (
    (w.work_type::text='quick_task' and flowmate_kpi_capture_private.current_user_can_execute(w.id))
    or (w.work_type::text='creative_request' and p_kind<>'ready' and (public.flowmate_kpi_can_view()
      or exists(select 1 from public.team_members m where m.id=w.final_owner_member_id and m.user_id=auth.uid())))
  ))
 ));
$$;
revoke all on function public.flowmate_kpi_can_record(uuid,text) from public,anon,authenticated;
grant execute on function public.flowmate_kpi_can_record(uuid,text) to authenticated;
drop policy if exists kpi_evidence_read on public.flowmate_kpi_measurement_evidence;
create policy kpi_evidence_read on public.flowmate_kpi_measurement_evidence for select to authenticated
 using(public.flowmate_current_user_can_read_work_item(work_item_id));
drop policy if exists kpi_evidence_insert on public.flowmate_kpi_measurement_evidence;
create policy kpi_evidence_insert on public.flowmate_kpi_measurement_evidence for insert to authenticated
 with check(actor_user_id=(select auth.uid()) and kind<>'intake' and public.flowmate_kpi_can_record(work_item_id,kind));

create or replace function flowmate_kpi_capture_private.fingerprint(p_item uuid)
returns text language sql stable security definer set search_path='' as $$
 select md5(jsonb_build_object('title',w.title,'description',to_jsonb(w)->'description','reference_links',to_jsonb(w)->'task_reference_links','requested_deadline',to_jsonb(w)->'task_requested_deadline')::text) from public.work_items w where w.id=p_item;
$$;
revoke all on function flowmate_kpi_capture_private.fingerprint(uuid) from public,anon,authenticated;

create or replace function flowmate_kpi_capture_private.guard_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
declare w public.work_items; v_target text;
begin
 if tg_op<>'INSERT' then raise exception 'KPI evidence is append-only'; end if;
 select * into w from public.work_items where id=new.work_item_id for update;
 if not found then raise exception 'Work item not found'; end if;
 new.recorded_at:=clock_timestamp();new.owning_team_at_record:=to_jsonb(w)->>'owning_team_code';new.work_domain:=w.work_type::text;
 if new.kind='intake' then
  if pg_trigger_depth()<2 then raise exception 'Intake evidence is only captured at creation'; end if;
  new.actor_user_id:=auth.uid();return new;
 end if;
 new.actor_user_id:=auth.uid();
 if not coalesce(public.flowmate_kpi_can_record(w.id,new.kind),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 new.priority_at_intake:=null;new.plan_at_intake:=null;
 if new.kind='deadline' then
  if (w.work_type::text='creative_request' and new.endpoint not in ('creative_draft','creative_delivery'))
  or (w.work_type::text='quick_task' and new.endpoint not in ('task_submit','task_approve')) then raise exception 'Deadline endpoint does not match work domain'; end if;
  v_target:=case when new.endpoint in ('creative_draft','task_submit') then 'review' else 'delivered' end;
  if exists(select 1 from public.work_item_events e where e.work_item_id=w.id and e.to_status::text=v_target)
  then raise exception 'This endpoint already happened; do not backfill a KPI deadline'; end if;
 elsif new.kind='ready' then
  if new.brief_fingerprint is distinct from flowmate_kpi_capture_private.fingerprint(w.id) then raise exception 'Brief changed; refresh and confirm again' using errcode='40001'; end if;
 elsif new.kind='sla' then
  if not exists(select 1 from public.flowmate_kpi_calendars c where c.version=new.calendar_version and (new.required_on between c.coverage_start and c.coverage_end)) then raise exception 'SLA date is outside the approved calendar'; end if;
  if exists(select 1 from public.creative_kpi_brief_evidence b where b.work_item_id=w.id and b.action='accepted')
  or exists(select 1 from public.flowmate_kpi_measurement_evidence b where b.work_item_id=w.id and b.kind='ready') then raise exception 'Agree SLA before accepting the brief; no retroactive SLA score'; end if;
 elsif new.kind='csat' then
  new.survey_definition:='internal-csat-1to5-v1';
  new.survey_period:=to_char(new.recorded_at at time zone 'Asia/Bangkok','YYYY')||'-Q'||extract(quarter from new.recorded_at at time zone 'Asia/Bangkok')::integer;
 end if;
 return new;
end $$;
revoke all on function flowmate_kpi_capture_private.guard_evidence() from public,anon,authenticated;
drop trigger if exists kpi_measurement_evidence_guard on public.flowmate_kpi_measurement_evidence;
create trigger kpi_measurement_evidence_guard before insert or update or delete on public.flowmate_kpi_measurement_evidence for each row execute function flowmate_kpi_capture_private.guard_evidence();

create or replace function flowmate_kpi_capture_private.capture_intake()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.work_type::text in ('creative_request','quick_task') then
  insert into public.flowmate_kpi_measurement_evidence(work_item_id,kind,priority_at_intake,plan_at_intake)
  values(new.id,'intake',coalesce(to_jsonb(new)->>'priority','unknown'),coalesce(nullif(current_setting('flowmate.kpi_plan',true),''),new.kpi_plan_at_intake));
 end if;
 return new;
end $$;
revoke all on function flowmate_kpi_capture_private.capture_intake() from public,anon,authenticated;
drop trigger if exists kpi_capture_intake on public.work_items;
create trigger kpi_capture_intake after insert on public.work_items for each row execute function flowmate_kpi_capture_private.capture_intake();

create or replace function public.flowmate_kpi_evidence_context(p_work_item_id uuid)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_fingerprint text;
begin
 if not coalesce(public.flowmate_current_user_can_read_work_item(p_work_item_id),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 select md5(jsonb_build_object('title',w.title,'description',to_jsonb(w)->'description','reference_links',to_jsonb(w)->'task_reference_links','requested_deadline',to_jsonb(w)->'task_requested_deadline')::text) into v_fingerprint from public.work_items w where id=p_work_item_id;
 return jsonb_build_object('fingerprint',v_fingerprint,'can_deadline',public.flowmate_kpi_can_record(p_work_item_id,'deadline'),'can_ready',public.flowmate_kpi_can_record(p_work_item_id,'ready'),'can_sla',public.flowmate_kpi_can_record(p_work_item_id,'sla'),'can_csat',public.flowmate_kpi_can_record(p_work_item_id,'csat'));
end $$;
revoke all on function public.flowmate_kpi_evidence_context(uuid) from public,anon,authenticated;
grant execute on function public.flowmate_kpi_evidence_context(uuid) to authenticated;

create or replace function public.flowmate_kpi_record_evidence(
 p_work_item_id uuid,p_kind text,p_request_key uuid,p_reason text default '',p_endpoint text default null,p_due_date date default null,p_required_on date default null,p_sla_workdays integer default null,p_brief_fingerprint text default null,p_score integer default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row public.flowmate_kpi_measurement_evidence;
begin
 if auth.uid() is null or p_request_key is null or p_kind not in ('deadline','ready','sla','csat') then raise exception 'Invalid evidence request'; end if;
 if not coalesce(public.flowmate_current_user_can_read_work_item(p_work_item_id),false) then raise exception 'Not authorized' using errcode='42501'; end if;
 select * into v_row from public.flowmate_kpi_measurement_evidence where actor_user_id=auth.uid() and request_key=p_request_key;
 if found then
  if v_row.work_item_id is distinct from p_work_item_id or v_row.kind is distinct from p_kind or v_row.endpoint is distinct from p_endpoint or v_row.due_date is distinct from p_due_date or v_row.required_on is distinct from p_required_on or v_row.sla_workdays is distinct from p_sla_workdays or v_row.brief_fingerprint is distinct from p_brief_fingerprint or v_row.score is distinct from p_score or v_row.reason is distinct from trim(p_reason) then raise exception 'Request key was reused for another payload'; end if;
  return to_jsonb(v_row);
 end if;
 insert into public.flowmate_kpi_measurement_evidence(work_item_id,kind,actor_user_id,request_key,reason,endpoint,due_date,required_on,sla_workdays,calendar_version,brief_fingerprint,score,survey_definition,survey_period)
 values(p_work_item_id,p_kind,auth.uid(),p_request_key,trim(p_reason),p_endpoint,p_due_date,p_required_on,p_sla_workdays,case when p_kind='sla' then 'organization-2026-v1' end,p_brief_fingerprint,p_score,case when p_kind='csat' then 'internal-csat-1to5-v1' end,null)
 returning * into v_row;
 return to_jsonb(v_row);
end $$;
revoke all on function public.flowmate_kpi_record_evidence(uuid,text,uuid,text,text,date,date,integer,text,integer) from public,anon,authenticated;
grant execute on function public.flowmate_kpi_record_evidence(uuid,text,uuid,text,text,date,date,integer,text,integer) to authenticated;

-- Delegate creation to the original Task Assign authority; never duplicate assignment or dispatcher rules.
create or replace function public.task_assign_create_with_kpi(p_source_team text,p_responsible_team text,p_title text,p_note text,p_deadline date,
 p_request_key uuid,p_review_date date default null,p_project text default null,p_assignee uuid default null,
 p_priority public.priority_level default 'normal',p_urgent_reason text default null,p_references text[] default '{}',
 p_confidential boolean default false,p_collaborators uuid[] default '{}',p_parent uuid default null,p_plan_at_intake text default 'unknown')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_result jsonb;v_previous text:=current_setting('flowmate.kpi_plan',true);v_plan text;
begin
 if p_plan_at_intake is null or p_plan_at_intake not in ('unknown','planned','unplanned') then raise exception 'Choose planned, unplanned or unknown'; end if;
 perform set_config('flowmate.kpi_plan',p_plan_at_intake,true);
 v_result:=public.task_assign_create(p_source_team,p_responsible_team,p_title,p_note,p_deadline,p_request_key,p_review_date,p_project,p_assignee,p_priority,p_urgent_reason,p_references,p_confidential,p_collaborators,p_parent);
 perform set_config('flowmate.kpi_plan',coalesce(v_previous,''),true);
 select plan_at_intake into v_plan from public.flowmate_kpi_measurement_evidence where work_item_id=(v_result->>'id')::uuid and kind='intake';
 if v_plan is distinct from p_plan_at_intake then raise exception 'Existing request has a different or missing intake snapshot; do not overwrite it'; end if;
 return v_result;
end $$;
revoke all on function public.task_assign_create_with_kpi(text,text,text,text,date,uuid,date,text,uuid,public.priority_level,text,text[],boolean,uuid[],uuid,text) from public,anon,authenticated;
grant execute on function public.task_assign_create_with_kpi(text,text,text,text,date,uuid,date,text,uuid,public.priority_level,text,text[],boolean,uuid[],uuid,text) to authenticated;
commit;
