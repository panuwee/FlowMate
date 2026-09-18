-- Register existing/generated Battle Pass links for human review, never auto-accept them.
-- Apply after activity_automation_brief_assignment.sql.
begin;
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
commit;
