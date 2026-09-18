-- Reviewable delta. Apply after activity_automation.sql and activity_automation_isolation.sql.
-- No task is accepted or assigned by installing this file.
begin;
create or replace function activity_automation_private.is_ops_work(p_work uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.work_items w where w.id=p_work and w.work_type='creative_request'
 and lower(w.requester_team) in ('operations','operation','ops') and w.owning_team_code='ops'
 and (exists(select 1 from activity_automation_private.output_bindings b join activity_automation_private.runs r on r.id=b.run_id
 where b.work_item_id=w.id and r.activity in ('membership','golden_spin','conqueror_crate','topup_promotion'))
 or exists(select 1 from battle_pass_private.monthly_runs r where r.brief_id=w.id)
 or exists(select 1 from battle_pass_private.brief_bindings b where b.brief_id=w.id)))
$$;
revoke all on function activity_automation_private.is_ops_work(uuid) from public,anon,authenticated;

-- Keep a durable TEST identity even after title edits, cancellation or archive.
create table if not exists activity_automation_private.test_work_registry(
 work_item_id uuid primary key references public.work_items(id), registered_at timestamptz not null default now()
);
alter table activity_automation_private.test_work_registry enable row level security;
revoke all on activity_automation_private.test_work_registry from public,anon,authenticated,service_role;
insert into activity_automation_private.test_work_registry(work_item_id)
select id from public.work_items where title ~* '^\[TEST\]'
on conflict do nothing;
create or replace function activity_automation_private.remember_test_work() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.title ~* '^\[TEST\]' then
 insert into activity_automation_private.test_work_registry(work_item_id) values(new.id) on conflict do nothing;
 end if;return new;
end $$;
revoke all on function activity_automation_private.remember_test_work() from public,anon,authenticated;
drop trigger if exists activity_remember_test on public.work_items;
create trigger activity_remember_test after insert or update of title on public.work_items
for each row execute function activity_automation_private.remember_test_work();
create or replace function public.activity_automation_is_test(p_work_item uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from activity_automation_private.test_work_registry where work_item_id=p_work_item)
 or exists(select 1 from activity_automation_private.output_bindings where work_item_id=p_work_item)
 or exists(select 1 from battle_pass_private.monthly_runs where brief_id=p_work_item and mode='test')
 or exists(select 1 from battle_pass_private.brief_bindings where brief_id=p_work_item and mode='test')
$$;
revoke all on function public.activity_automation_is_test(uuid) from public,anon;
grant execute on function public.activity_automation_is_test(uuid) to authenticated,service_role;

create or replace function activity_automation_private.has_accepted_brief(p_work uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.creative_kpi_brief_evidence a
 join public.creative_kpi_brief_evidence s on s.id=a.submission_id
 join public.creative_request_details d on d.work_item_id=s.work_item_id
 where a.work_item_id=p_work and a.action='accepted' and s.action='submitted'
 and s.id=(select max(id) from public.creative_kpi_brief_evidence where work_item_id=p_work and action='submitted')
 and s.brief_link=d.brief_link)
$$;
revoke all on function activity_automation_private.has_accepted_brief(uuid) from public,anon,authenticated;

-- Unlock TEST assignment only after accepted evidence. Cancellation/archive stay available.
create or replace function activity_automation_private.guard_test_work() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from activity_automation_private.output_bindings where work_item_id=old.id) then
  if new.title not like '[TEST][4D:%' then raise exception 'test_title_required'; end if;
  if new.status not in ('unassigned','need_brief','assigned','cancelled') then raise exception 'test_execution_not_enabled'; end if;
  if new.wip_counted then raise exception 'test_wip_not_allowed'; end if;
  if new.status='assigned' and not activity_automation_private.has_accepted_brief(new.id) then raise exception 'test_brief_acceptance_required'; end if;
 end if;
 return new;
end $$;

-- Match exact known sections; abort on drift instead of overwriting the live engine.
-- Ranking, skill eligibility, leave checks and tie-break rules remain the deployed implementation.
do $patch$ declare d text;a text;b text;begin
 select pg_get_functiondef('public.flowmate_run_assignment(uuid,public.assignment_trigger)'::regprocedure) into d;
 if position('-- automation acceptance gate' in d)=0 then
 a:='  v_from_status := v_work.status;';
 b:=$insert$  -- automation acceptance gate
  if activity_automation_private.is_ops_work(p_work_item_id) then
    if v_work.archived_at is not null or v_work.status::text in ('cancelled','delivered') then
      return jsonb_build_object('result','skipped','reason','closed automation work');
    end if;
    if v_work.final_owner_member_id is not null or v_work.assignee_user_id is not null then
      return jsonb_build_object('result','skipped','reason','already assigned');
    end if;
    if not activity_automation_private.has_accepted_brief(p_work_item_id) then
      return jsonb_build_object('result','unassigned','reason','Awaiting brief acceptance');
    end if;
  end if;
  v_from_status := v_work.status;$insert$;
 if position(a in d)=0 then raise exception 'assignment_gate_anchor_changed';end if;d:=replace(d,a,b);
 a:='and active_wi.id <> p_work_item_id';
 if position(a in d)=0 then raise exception 'assignment_workload_anchor_changed';end if;
 d:=replace(d,a,a||E'\n        and not public.activity_automation_is_test(active_wi.id)');
 a:='and previous_run.result = ''assigned''';
 if position(a in d)=0 then raise exception 'assignment_rotation_anchor_changed';end if;
 d:=replace(d,a,a||E'\n          and not public.activity_automation_is_test(previous_run.work_item_id)');
 execute d;
 end if;
 select pg_get_functiondef('public.flowmate_hybrid_rebuild_allocation(uuid,uuid)'::regprocedure) into d;
 if position('-- test allocation isolation' in d)=0 then
 a:='begin';
 b:=$insert$begin
  -- test allocation isolation
  if public.activity_automation_is_test(p_work_item_id) then
    delete from public.flowmate_capacity_allocations where work_item_id=p_work_item_id;
    return 0;
  end if;$insert$;
 if position(a in d)=0 then raise exception 'allocation_anchor_changed';end if;
 d:=overlay(d placing b from position(a in d) for length(a));execute d;
 end if;
end $patch$;

-- Match the engine lock order before the authorized brief RPC locks the task.
do $lock_order$ declare d text;a text;begin
 select pg_get_functiondef('public.flowmate_creative_brief(uuid,text,text,bigint)'::regprocedure) into d;
 if position('-- automation acceptance lock order' in d)=0 then
 a:='select * into v_task from public.work_items where id=p_work_item_id for update;';
 if position(a in d)=0 then raise exception 'brief_rpc_lock_anchor_changed';end if;
 d:=replace(d,a,E'-- automation acceptance lock order\n  if p_action=''accepted'' and activity_automation_private.is_ops_work(p_work_item_id) then\n    perform pg_advisory_xact_lock(hashtext(''flowmate_assignment_engine''));\n  end if;\n  '||a);
 execute d;
 end if;
end $lock_order$;
-- Evidence is written through the existing authorized RPC; assignment is atomic with acceptance.
create or replace function activity_automation_private.assign_accepted_brief() returns trigger
language plpgsql security definer set search_path='' as $$ declare result jsonb;begin
 if new.action='accepted' and activity_automation_private.is_ops_work(new.work_item_id) then
  if exists(select 1 from battle_pass_private.monthly_runs where brief_id=new.work_item_id and mode='production'
   and (state<>'complete' or checkpoint ? 'hold')) then raise exception 'Battle Pass source review required';end if;
  update battle_pass_private.monthly_runs set review_released_at=coalesce(review_released_at,clock_timestamp()),
   review_released_by=coalesce(review_released_by,new.actor_user_id)
   where brief_id=new.work_item_id and mode='production';
  result:=public.flowmate_run_assignment(new.work_item_id,'recheck');
  insert into public.work_item_events(work_item_id,actor_user_id,event_type,metadata)
  values(new.work_item_id,new.actor_user_id,'updated',jsonb_build_object('action','automation_brief_assignment','evidence_id',new.id,'assignment',result));
 end if;return new;
end $$;
revoke all on function activity_automation_private.assign_accepted_brief() from public,anon,authenticated;
drop trigger if exists activity_assign_accepted_brief on public.creative_kpi_brief_evidence;
create trigger activity_assign_accepted_brief after insert on public.creative_kpi_brief_evidence
for each row execute function activity_automation_private.assign_accepted_brief();

-- Backend exclusion is independent of Board visibility and assigned/cancelled/archive status.
do $$ declare d text;begin
 select pg_get_viewdef('public.flowmate_team_schedule_v'::regclass,true) into d;
 if position('activity_automation_is_test' in d)=0 then
 execute format('create or replace view public.flowmate_team_schedule_v with (security_invoker=true) as select schedule.* from (%s) schedule where not public.activity_automation_is_test(schedule.work_item_id)',rtrim(trim(d),';'));
 end if;
end $$;
commit;
notify pgrst,'reload schema';
