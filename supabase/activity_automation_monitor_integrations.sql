-- Read-only evidence extension. Apply after activity_automation_monitor.sql.
-- No provider calls, credentials, automation enablement or scheduler changes.
begin;

create or replace function activity_automation_private.monitor_integration_evidence(p_activity text,p_mode text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare components jsonb:='[]'; component text; availability text; latest_status text;
 latest_at timestamptz; success_at timestamptz; time_meaning text;
begin
 foreach component in array array['alpha','mcp','seatalk'] loop
  availability:='available';latest_status:=null;latest_at:=null;success_at:=null;
  time_meaning:=case component when 'alpha' then 'request_created' when 'mcp' then 'call_recorded' else 'record_updated' end;
  begin
   if component='alpha' then
    select case when r.status='cached' and r.diagnosis->>'source' is distinct from 'alpha' then 'unverified' else r.status end,r.created_at
    into latest_status,latest_at from activity_automation_private.diagnosis_requests r
    where r.activity=p_activity and r.mode=p_mode order by r.created_at desc,r.id desc limit 1;
    select max(r.created_at) into success_at from activity_automation_private.diagnosis_requests r
    where r.activity=p_activity and r.mode=p_mode and r.status='cached' and r.diagnosis->>'source'='alpha';
   elsif component='mcp' then
    -- "allowed" proves an authorized recorded read, not an external Alpha tool call.
    select c.outcome,c.called_at into latest_status,latest_at from activity_automation_private.mcp_calls c
    where c.activity=p_activity and c.mode=p_mode order by c.called_at desc,c.id desc limit 1;
    select max(c.called_at) into success_at from activity_automation_private.mcp_calls c
    where c.activity=p_activity and c.mode=p_mode and c.outcome='allowed';
   elsif p_mode='test' then
    select case when n.status='delivered' and nullif(btrim(n.provider_id),'') is null then 'unverified' else n.status end,n.updated_at
    into latest_status,latest_at from activity_automation_private.notification_outbox n
    left join activity_automation_private.runs r on r.id=n.run_id
    where coalesce(r.activity,n.payload->>'activity')=p_activity and (r.id is null or r.mode='test')
    order by n.updated_at desc,n.id desc limit 1;
    select max(n.updated_at) into success_at from activity_automation_private.notification_outbox n
    left join activity_automation_private.runs r on r.id=n.run_id
    where coalesce(r.activity,n.payload->>'activity')=p_activity and (r.id is null or r.mode='test')
    and n.status='delivered' and nullif(btrim(n.provider_id),'') is not null;
   else
    -- Only the production outbox is evidence for production provider acceptance.
    select case when n.status='delivered' and nullif(btrim(n.provider_id),'') is null then 'unverified' else n.status end,n.updated_at
    into latest_status,latest_at from activity_automation_private.production_notification_outbox n
    join activity_automation_private.production_runs r on r.id=n.run_id
    where r.activity=p_activity order by n.updated_at desc,n.id desc limit 1;
    select max(n.updated_at) into success_at from activity_automation_private.production_notification_outbox n
    join activity_automation_private.production_runs r on r.id=n.run_id
    where r.activity=p_activity and n.status='delivered' and nullif(btrim(n.provider_id),'') is not null;
   end if;
  exception when undefined_table or undefined_column or invalid_schema_name then
   availability:='unavailable';latest_status:=null;latest_at:=null;success_at:=null;
  end;
  components:=components||jsonb_build_array(jsonb_build_object(
   'component',component,'availability',availability,
   'latestStatus',activity_automation_private.monitor_code(latest_status),
   'latestAt',latest_at,'timeMeaning',time_meaning,'lastSuccessAt',success_at));
 end loop;
 return jsonb_build_object('activity',p_activity,'mode',p_mode,'scope','recorded_evidence','components',components);
end $$;

create or replace function public.activity_automation_monitor_integrations(p_activity text,p_mode text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caps jsonb; evidence jsonb;
begin
 caps:=activity_automation_private.monitor_access();
 if not coalesce((caps->>'sharedRead')::boolean,false) then
  raise exception 'Monitor access denied' using errcode='42501';
 end if;
 if p_activity is null or p_activity not in ('membership','conqueror_crate','golden_spin','topup_promotion')
 or p_mode is null or p_mode not in ('test','production') then
  raise exception 'Invalid integration scope' using errcode='22023';
 end if;
 evidence:=activity_automation_private.monitor_integration_evidence(p_activity,p_mode);
 if p_mode='production' then
  evidence:=evidence||jsonb_build_object('testEvidence',activity_automation_private.monitor_integration_evidence(p_activity,'test'));
 end if;
 return jsonb_build_object('version',1,'observedAt',current_timestamp,'sources','[]'::jsonb,'data',evidence);
end $$;

revoke all on function activity_automation_private.monitor_integration_evidence(text,text) from public,anon,authenticated;
revoke all on function public.activity_automation_monitor_integrations(text,text) from public,anon,authenticated;
grant execute on function public.activity_automation_monitor_integrations(text,text) to authenticated;
notify pgrst,'reload schema';
commit;
