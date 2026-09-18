-- Reviewed release bundle: Operations brief acceptance and TEST isolation.
begin;

-- Source: supabase/activity_automation_brief_assignment.sql
-- Reviewable delta. Apply after activity_automation.sql and activity_automation_isolation.sql.
-- No task is accepted or assigned by installing this file.

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




-- Source: supabase/activity_automation_ops_brief_reviewers.sql
-- Operations members may review any Operations creative brief; retain existing owner/Lead rights elsewhere.

create or replace function public.flowmate_can_review_ops_brief(p_work uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users u where u.id=auth.uid() and u.is_active
 and (u.role='admin' or exists(select 1 from public.user_team_memberships m where m.user_id=u.id and m.team_code='ops')))
 and exists(select 1 from public.work_items w where w.id=p_work and w.work_type='creative_request' and w.owning_team_code='ops')
$$;
revoke all on function public.flowmate_can_review_ops_brief(uuid) from public,anon;
grant execute on function public.flowmate_can_review_ops_brief(uuid) to authenticated;

-- Only read permissions are widened. Mutation stays inside the validated brief RPC.
drop policy if exists operations_brief_reviewer_read on public.work_items;
create policy operations_brief_reviewer_read on public.work_items for select to authenticated using(public.flowmate_can_review_ops_brief(id));
drop policy if exists operations_brief_reviewer_read on public.creative_request_details;
create policy operations_brief_reviewer_read on public.creative_request_details for select to authenticated using(public.flowmate_can_review_ops_brief(work_item_id));
drop policy if exists operations_brief_reviewer_read on public.creative_kpi_brief_evidence;
create policy operations_brief_reviewer_read on public.creative_kpi_brief_evidence for select to authenticated using(public.flowmate_can_review_ops_brief(work_item_id));
drop policy if exists operations_brief_reviewer_read on public.work_item_events;
create policy operations_brief_reviewer_read on public.work_item_events for select to authenticated using(public.flowmate_can_review_ops_brief(work_item_id));

do $patch$ declare d text;a text;begin
 select pg_get_functiondef('public.flowmate_creative_brief(uuid,text,text,bigint)'::regprocedure) into d;
 if position('flowmate_can_review_ops_brief' in d)=0 then
 a:='v_lead or public.flowmate_can_read_work_item(p_work_item_id,v_actor)';
 if position(a in d)=0 then raise exception 'brief_read_permission_anchor_changed';end if;
 d:=replace(d,a,a||' or public.flowmate_can_review_ops_brief(p_work_item_id)');
 a:='coalesce(v_owner=v_actor,false) or v_lead';
 if position(a in d)=0 then raise exception 'brief_accept_permission_anchor_changed';end if;
 d:=replace(d,a,a||' or public.flowmate_can_review_ops_brief(p_work_item_id)');
 d:=replace(d,'Only the owner or Lead can accept this brief','Only the owner, Lead, Admin or an Operations reviewer for Operations work can accept this brief');
 execute d;
 end if;
end $patch$;




-- Source: supabase/activity_automation_battle_pass_brief_evidence.sql
-- Register existing/generated Battle Pass links for human review, never auto-accept them.
-- Apply after activity_automation_brief_assignment.sql.

create or replace function activity_automation_private.register_battle_pass_brief(p_work uuid) returns void
language plpgsql security definer set search_path='' as $$ declare w public.work_items;link text;eid bigint;begin
 select * into w from public.work_items where id=p_work for update;
 if not found or not activity_automation_private.is_ops_work(p_work) or w.archived_at is not null or w.status::text in ('cancelled','delivered') then return;end if;
 select brief_link into link from public.creative_request_details where work_item_id=p_work;
 if nullif(trim(link),'') is null or exists(select 1 from public.creative_kpi_brief_evidence where work_item_id=p_work and action='submitted') then return;end if;
 insert into public.creative_kpi_brief_evidence(work_item_id,action,actor_user_id,reason,brief_link)
 values(p_work,'submitted',w.requester_user_id,'Automation: existing generated Brief Link registered for human review; acceptance pending.',link) returning id into eid;
 insert into public.work_item_events(work_item_id,actor_user_id,event_type,metadata)
 values(p_work,w.requester_user_id,'updated',jsonb_build_object('action','brief_submitted','evidence_id',eid,'reason','Generated Brief Link registered; awaiting human review'));
end $$;
revoke all on function activity_automation_private.register_battle_pass_brief(uuid) from public,anon,authenticated;
create or replace function activity_automation_private.battle_pass_brief_registered() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if new.brief_id is not null then perform activity_automation_private.register_battle_pass_brief(new.brief_id);end if;return new;
end $$;
revoke all on function activity_automation_private.battle_pass_brief_registered() from public,anon,authenticated;
drop trigger if exists activity_register_bp_brief on battle_pass_private.monthly_runs;
create trigger activity_register_bp_brief after insert or update of brief_id on battle_pass_private.monthly_runs
for each row execute function activity_automation_private.battle_pass_brief_registered();
drop trigger if exists activity_register_bp_binding on battle_pass_private.brief_bindings;
create trigger activity_register_bp_binding after insert or update of brief_id on battle_pass_private.brief_bindings
for each row execute function activity_automation_private.battle_pass_brief_registered();
select activity_automation_private.register_battle_pass_brief(brief_id) from (
 select brief_id from battle_pass_private.monthly_runs where brief_id is not null
 union select brief_id from battle_pass_private.brief_bindings
) bound;



-- Source: supabase/activity_automation_battle_pass_acceptance.sql
-- Replace the legacy Aof release action with accepted-brief evidence.
-- Apply after activity_automation_brief_assignment.sql.

create or replace function public.battle_pass_release_review(p_work_item_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 raise exception 'Use Confirm Brief Complete (ยืนยันบรีฟครบ) to review and auto-assign this work';
end $$;
revoke all on function public.battle_pass_release_review(uuid) from public,anon;
grant execute on function public.battle_pass_release_review(uuid) to authenticated;
create or replace function public.battle_pass_review_status(p_work_item_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ declare result jsonb;begin
 if not exists(select 1 from public.users where id=auth.uid() and is_active)
 or not (public.flowmate_kpi_can_view() or public.flowmate_can_read_work_item(p_work_item_id,auth.uid()) or public.flowmate_can_review_ops_brief(p_work_item_id)) then raise exception 'Not authorized' using errcode='42501';end if;
 select jsonb_build_object('held',review_released_at is null,'can_release',false,'reviewer_name','Brief reviewer','review_mode','brief_acceptance',
 'state',case when checkpoint ? 'hold' then 'source_review' else state end,'period',period)
 into result from battle_pass_private.monthly_runs where mode='production' and brief_id=p_work_item_id;
 return result;
end $$;
revoke all on function public.battle_pass_review_status(uuid) from public,anon;
grant execute on function public.battle_pass_review_status(uuid) to authenticated;




commit;
notify pgrst,'reload schema';
