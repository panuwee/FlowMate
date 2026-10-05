-- LOCAL REVIEW ONLY. Not approved for production application.
-- Additive classification. No status transition or historical evidence backfill.
begin;
do $$ begin
 if to_regclass('public.work_item_links') is null
 or to_regclass('public.work_item_events') is null
 or to_regprocedure('public.add_work_item_link(text,text,text)') is null
 or to_regprocedure('public.flowmate_current_user_can_read_work_item(uuid)') is null
 or to_regprocedure('public.flowmate_can_collaborate_on_work_item(uuid,uuid)') is null
 or to_regprocedure('public.flowmate_kpi_can_view()') is null
 then raise exception 'Inspect existing collaboration and KPI permissions first'; end if;
end $$;
alter table public.work_item_links add column if not exists link_kind text not null default 'general';
alter table public.work_item_links add column if not exists link_request_key uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conrelid='public.work_item_links'::regclass and conname='work_item_link_kind_valid') then
  alter table public.work_item_links add constraint work_item_link_kind_valid check(link_kind in ('general','first_draft','final_asset'));
 end if;
end $$;
create unique index if not exists work_item_link_request_once on public.work_item_links(created_by_user_id,link_request_key) where link_request_key is not null;

create schema if not exists flowmate_link_capture_private;
revoke all on schema flowmate_link_capture_private from public,anon,authenticated;
create or replace function flowmate_link_capture_private.add_asset_link(p_display_id text,p_url text,p_description text,p_link_kind text,p_request_key uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_actor uuid:=auth.uid(); v_work public.work_items; v_link public.work_item_links;
 v_result jsonb; v_eligible boolean; v_event uuid;
begin
 if v_actor is null or not exists(select 1 from public.users u where u.id=v_actor and u.is_active and u.role::text<>'viewer') then
  raise exception 'Not authorized' using errcode='42501';
 end if;
 if p_link_kind is null or p_link_kind not in ('first_draft','final_asset') or p_request_key is null then raise exception 'Choose a valid asset type and request key'; end if;
 if p_url is null or trim(p_url)!~* '^https?://[^[:space:]]+$' then raise exception 'Enter a valid http(s) link'; end if;
 select * into v_work from public.work_items w where w.display_id=p_display_id for update;
 if not found or not coalesce(public.flowmate_current_user_can_read_work_item(v_work.id),false)
 or not coalesce(public.flowmate_can_collaborate_on_work_item(v_work.id,v_actor),false) then
  raise exception 'Not authorized' using errcode='42501';
 end if;
 select * into v_link from public.work_item_links where created_by_user_id=v_actor and link_request_key=p_request_key;
 if found then
  if v_link.work_item_id is distinct from v_work.id or v_link.url is distinct from trim(p_url)
  or v_link.description is distinct from nullif(trim(coalesce(p_description,'')),'') or v_link.link_kind is distinct from p_link_kind
  then raise exception 'Request key was reused for another payload'; end if;
  select e.id,coalesce((e.metadata->>'kpi_eligible')::boolean,false) into v_event,v_eligible
  from public.work_item_events e where e.work_item_id=v_work.id and e.actor_user_id=v_actor
   and e.metadata->>'link_id'=v_link.id::text and e.metadata->>'kpi_evidence_source'='link_zone_v1'
  order by e.created_at,e.id limit 1;
  return to_jsonb(v_link)||jsonb_build_object('event_id',v_event,'kpi_eligible',coalesce(v_eligible,false));
 end if;
 if v_work.work_type::text<>'creative_request' or v_work.archived_at is not null or v_work.status::text in ('delivered','cancelled') then
  raise exception 'Asset evidence is available only on open Creative work; no historical backfill';
 end if;
 if not (coalesce(v_work.assignee_user_id=v_actor,false)
  or exists(select 1 from public.team_members m where m.id=v_work.final_owner_member_id and m.user_id=v_actor)
  or coalesce(public.flowmate_kpi_can_view(),false)) then
  raise exception 'Only the receiver or an authorized supervisor can submit asset evidence' using errcode='42501';
 end if;
 -- Capture the real submission time now, independently of earlier Review events.
 -- The KPI uses typed link submission, not the legacy status milestone.
 v_eligible:=true;
 v_result:=public.add_work_item_link(p_display_id,trim(p_url),p_description);
 update public.work_item_links set link_kind=p_link_kind,link_request_key=p_request_key where id=(v_result->>'id')::uuid returning * into v_link;
 v_event:=(v_result->>'event_id')::uuid;
 if v_link.id is null or v_event is null then raise exception 'Existing add-link RPC did not return an evidence event'; end if;
 update public.work_item_events set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
  'link_kind',p_link_kind,'kpi_evidence_source','link_zone_v1','kpi_eligible',v_eligible)
 where id=v_event and work_item_id=v_work.id and actor_user_id=v_actor;
 if not found then raise exception 'Submission event was not bound to the current actor'; end if;
 return to_jsonb(v_link)||jsonb_build_object('event_id',v_event,'kpi_eligible',v_eligible);
end $$;
revoke all on function flowmate_link_capture_private.add_asset_link(text,text,text,text,uuid) from public,anon,authenticated;
grant usage on schema flowmate_link_capture_private to authenticated;
grant execute on function flowmate_link_capture_private.add_asset_link(text,text,text,text,uuid) to authenticated;
create or replace function public.add_work_item_link_with_kind(p_display_id text,p_url text,p_description text,p_link_kind text,p_request_key uuid)
returns jsonb language sql security invoker set search_path='' as $$
 select flowmate_link_capture_private.add_asset_link(p_display_id,p_url,p_description,p_link_kind,p_request_key);
$$;
revoke all on function public.add_work_item_link_with_kind(text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.add_work_item_link_with_kind(text,text,text,text,uuid) to authenticated;
commit;
