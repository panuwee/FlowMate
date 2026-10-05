-- Optional integration installer. Apply only after reviewing installed legacy contracts.
-- All legacy ownership changes are gated by runtime_enabled and explicit cutover records.
begin;
-- Immutable expected fields captured at native output binding, in the same
-- transaction as finalization. No historical backfill/replay is implicit.
create table if not exists wcc_private.activity_manifests(
 run_id uuid primary key, work_item_id uuid not null, content_item_id uuid not null,
 slide_id text not null, slide_revision text not null, creative jsonb not null,
 captured_at timestamptz not null default now());
alter table wcc_private.activity_manifests enable row level security;
revoke all on table wcc_private.activity_manifests from public,anon,authenticated,service_role;
create or replace function wcc_private.capture_activity_manifest() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 insert into wcc_private.activity_manifests(run_id,work_item_id,content_item_id,slide_id,slide_revision,creative)
 select new.run_id,new.work_item_id,new.content_item_id,new.slide_id,new.slide_revision,
 jsonb_build_object('count',d.asset_count,'count2',d.asset_count_2,'subtype',d.asset_subtype,
 'subtype2',d.asset_subtype_2,'channels',to_jsonb(d.channel_codes))
 from public.creative_request_details d join activity_automation_private.production_runs r on r.id=new.run_id
 where d.work_item_id=new.work_item_id and cardinality(d.channel_codes)>0
 and d.asset_count::text=r.source_model#>>'{creative,count}'
 and d.asset_count_2::text is not distinct from r.source_model#>>'{creative,count2}'
 on conflict(run_id) do nothing;
 return new;
end $$;
-- The current native finalizer creates one bundle per run: CR + content item +
-- verified Slides + evidence + every channel placement from source_model.
-- This is an explicit v1 contract, not a generic "at least one CR" count.
create or replace function wcc_private.activity_bundle_complete(p_run uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$ declare result boolean; begin
 if to_regclass('public.marketing_channel_placements') is null or to_regclass('public.creative_request_details') is null
  or to_regclass('activity_automation_private.production_output_bindings') is null then return false; end if;
 execute $q$select exists(select 1 from activity_automation_private.production_runs r
 join activity_automation_private.production_output_bindings b on b.run_id=r.id
 join public.work_items w on w.id=b.work_item_id and w.archived_at is null
 join public.creative_request_details d on d.work_item_id=w.id
 join public.marketing_content_items m on m.id=b.content_item_id and m.flowmate_work_item_id=w.id
 join wcc_private.activity_manifests expected on expected.run_id=r.id and expected.work_item_id=w.id
 and expected.content_item_id=m.id and expected.slide_id=b.slide_id and expected.slide_revision=b.slide_revision
 where r.id=$1 and r.stage='complete' and r.source_model is not null
 and r.slide_id=b.slide_id and r.slide_revision=b.slide_revision and r.google_verified_at is not null
 and jsonb_typeof(expected.creative->'channels')='array'
 and jsonb_array_length(expected.creative->'channels')>0
 and (select count(*) from activity_automation_private.production_output_bindings x where x.run_id=r.id)=1
 and d.asset_count::text=expected.creative->>'count' and d.asset_count_2::text is not distinct from expected.creative->>'count2'
 and d.asset_subtype is not distinct from expected.creative->>'subtype' and d.asset_subtype_2 is not distinct from expected.creative->>'subtype2'
 and to_jsonb(d.channel_codes)=expected.creative->'channels'
 and m.brief_link like '%/#detail/'||w.display_id
 and not exists(select 1 from jsonb_array_elements_text(expected.creative->'channels') c(channel)
 where not exists(select 1 from public.marketing_channel_placements cp where cp.content_item_id=m.id and cp.channel::text=c.channel)))$q$
 into result using p_run;
 return coalesce(result,false);
end $$;
create or replace function wcc_private.activity_ready(p_payload jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$ declare result boolean; kind text:=p_payload->>'source_event'; begin
 if kind='source_issue' and to_regprocedure('activity_automation_private.production_source_issue_ready(jsonb)') is not null then
  execute 'select activity_automation_private.production_source_issue_ready($1)' into result using p_payload->'source_payload';
 elsif kind='scheduler_issue' and to_regprocedure('activity_automation_private.production_scheduler_issue_ready(jsonb)') is not null then
  execute 'select activity_automation_private.production_scheduler_issue_ready($1)' into result using p_payload->'source_payload';
 elsif kind in ('brief_ready','run_held') and to_regprocedure('activity_automation_private.production_notification_ready(uuid,text)') is not null then
  execute 'select activity_automation_private.production_notification_ready($1,$2)' into result using (p_payload->>'source_run')::uuid,kind;
 end if;
 if kind='brief_ready' then return coalesce(result,false) and wcc_private.activity_bundle_complete((p_payload->>'source_run')::uuid); end if;
 return coalesce(result,false);
end $$;
create or replace function wcc_private.legacy_assign_guard() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if exists(select 1 from wcc_private.ownership
  where event_kind='creative.assigned' and scope=new.recipient_user_id::text) then return null; end if;return new;
end $$;
create or replace function wcc_private.activity_bridge() returns trigger language plpgsql security definer set search_path='' as $$
declare v_kind text;v_event uuid;row_data jsonb:=to_jsonb(new); src text:=row_data->>'event_kind'; natural_key text; output_data jsonb; begin
 v_kind:=case src when 'brief_ready' then 'activity.output_ready' when 'run_held' then 'activity.held'
 when 'source_issue' then 'activity.source_issue' when 'scheduler_issue' then 'activity.scheduler_issue' end;
 -- Only group alerts are owned here; preserve legacy operator DMs.
 if v_kind is null or row_data->>'recipient_kind'<>'group'
  or not exists(select 1 from wcc_private.ownership where event_kind=v_kind and scope='ops') then return new; end if;
 natural_key:=v_kind||':'||coalesce(row_data->>'issue_key',row_data->>'run_id');
 if natural_key is null then raise exception 'Activity source has no stable run/issue identity'; end if;
 if not (select runtime_enabled from wcc_private.settings where singleton) then return null; end if;
 if not wcc_private.activity_ready(jsonb_build_object('source_event',src,'source_run',row_data->>'run_id','source_payload',row_data->'payload')) then return null; end if;
 if src='brief_ready' and to_regclass('activity_automation_private.production_output_bindings') is not null then
  execute 'select jsonb_agg(jsonb_build_object(''display_id'',w.display_id,''title'',w.title)) from activity_automation_private.production_output_bindings b join public.work_items w on w.id=b.work_item_id where b.run_id=$1'
  into output_data using (row_data->>'run_id')::uuid;
 end if;
 insert into wcc_private.events(event_kind,team_code,source_key,payload)
 values(v_kind,'ops',natural_key,jsonb_build_object('source_event',src,'source_run',row_data->>'run_id','source_payload',row_data->'payload','outputs',output_data,
  'source_id',row_data->>'id','title',coalesce(row_data->'payload'->>'projectCode','Activity Automation')))
 on conflict(source_key) where source_key is not null do nothing returning id into v_event;
 if v_event is null then return null;end if;
 if wcc_private.activity_ready((select payload from wcc_private.events where id=v_event)) then perform wcc_private.enqueue(v_event);
 else update wcc_private.events set current_instance=false where id=v_event; end if;
 return null; -- Explicit ownership suppresses the legacy send path, including paused rules.
end $$;
create or replace function wcc_private.cancel_legacy_pending() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if to_regclass('private.creative_seatalk_outbox') is not null then
  execute $q$update private.creative_seatalk_outbox set status='cancelled',last_error='WCC cutover: do not replay',updated_at=now()
   where status in ('pending','retry') and exists(select 1 from wcc_private.ownership o where o.event_kind='creative.assigned' and o.scope=recipient_user_id::text)$q$;
 end if;
 if to_regclass('activity_automation_private.production_notification_outbox') is not null then
  execute $q$update activity_automation_private.production_notification_outbox set status='cancelled',error_code='wcc_cutover',updated_at=now()
  where status in ('pending','retryable') and recipient_kind='group' and exists(select 1 from wcc_private.ownership o where o.scope='ops' and o.event_kind=
   case event_kind when 'brief_ready' then 'activity.output_ready' when 'run_held' then 'activity.held' when 'source_issue' then 'activity.source_issue' when 'scheduler_issue' then 'activity.scheduler_issue' end)$q$;
 end if;return new;
end $$;
do $$ begin
 if to_regclass('activity_automation_private.production_output_bindings') is not null then
  execute 'drop trigger if exists wcc_capture_manifest on activity_automation_private.production_output_bindings';
  execute 'create trigger wcc_capture_manifest after insert on activity_automation_private.production_output_bindings for each row execute function wcc_private.capture_activity_manifest()';
 end if;
 if to_regclass('private.creative_seatalk_outbox') is not null then
  execute 'drop trigger if exists wcc_legacy_assign_guard on private.creative_seatalk_outbox';
  execute 'create trigger wcc_legacy_assign_guard before insert on private.creative_seatalk_outbox for each row execute function wcc_private.legacy_assign_guard()';
 end if;
 if to_regclass('activity_automation_private.production_notification_outbox') is not null then
  execute 'drop trigger if exists wcc_activity_bridge on activity_automation_private.production_notification_outbox';
  execute 'create trigger wcc_activity_bridge before insert on activity_automation_private.production_notification_outbox for each row execute function wcc_private.activity_bridge()';
 end if;
end $$;
drop trigger if exists wcc_cutover on wcc_private.settings;
create trigger wcc_cutover after update of runtime_enabled on wcc_private.settings for each row execute function wcc_private.cancel_legacy_pending();
drop trigger if exists wcc_cutover_owner on wcc_private.ownership;
create trigger wcc_cutover_owner after insert on wcc_private.ownership for each row execute function wcc_private.cancel_legacy_pending();
revoke all on function wcc_private.activity_ready(jsonb),wcc_private.legacy_assign_guard(),wcc_private.activity_bridge(),wcc_private.cancel_legacy_pending()
 from public,anon,authenticated,service_role;
revoke all on function wcc_private.activity_bundle_complete(uuid) from public,anon,authenticated,service_role;
revoke all on function wcc_private.capture_activity_manifest() from public,anon,authenticated,service_role;
commit;
