-- Minimal runtime RPC repair. Apply only after explicit production SQL approval.
-- Replaces function body only; does not call it or change runtime, rules, scheduler or ACLs.
begin;
create or replace function public.wcc_set_runtime(p_enabled boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$ begin
 if public.is_admin_app_user() is not true then raise exception 'Admin required' using errcode='42501'; end if;
 if p_enabled is null or nullif(trim(p_reason),'') is null then raise exception 'State and reason required'; end if;
 update wcc_private.settings set runtime_enabled=p_enabled where singleton=true;
 if p_enabled then
  insert into wcc_private.ownership(event_kind,scope)
   select distinct 'creative.assigned',m.user_id::text from wcc_private.entities p join public.team_members m on m.id=(p.data->>'member_id')::uuid
   where p.kind='profile' and p.data->>'enabled'='true' and p.data->'events' ? 'creative.assigned' on conflict do nothing;
  insert into wcc_private.ownership(event_kind,scope) select data->>'event',team_code from wcc_private.entities
   where kind='rule' and data->>'enabled'='true' and data->>'event' like 'activity.%' on conflict do nothing;
 end if;
 if not p_enabled then update wcc_private.deliveries set status='cancelled',reason='runtime_paused' where status in ('pending','retryable'); end if;
 insert into wcc_private.audit(actor_id,action,after_value,reason) values(auth.uid(),'runtime',jsonb_build_object('enabled',p_enabled),left(p_reason,300));
end $$;
commit;
