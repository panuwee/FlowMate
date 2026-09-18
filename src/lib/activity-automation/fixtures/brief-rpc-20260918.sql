CREATE OR REPLACE FUNCTION public.flowmate_creative_brief(p_work_item_id uuid, p_action text DEFAULT 'read'::text, p_reason text DEFAULT ''::text, p_submission_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid(); v_task public.work_items; v_owner uuid; v_lead boolean;
  v_submit boolean; v_accept boolean; v_latest public.creative_kpi_brief_evidence; v_id bigint; v_link text;
begin
  if v_actor is null or not exists(select 1 from public.users where id=v_actor and is_active) then raise exception 'Not authorized' using errcode='42501'; end if;
  v_lead := coalesce(public.flowmate_kpi_can_view(),false);
  if not (v_lead or public.flowmate_can_read_work_item(p_work_item_id,v_actor)) then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into v_task from public.work_items where id=p_work_item_id for update;
  if not found or v_task.work_type::text <> 'creative_request' then raise exception 'Creative task not found'; end if;
  select user_id into v_owner from public.team_members where id=v_task.final_owner_member_id;
  select brief_link into v_link from public.creative_request_details where work_item_id=p_work_item_id;
  v_submit := v_task.requester_user_id=v_actor and v_task.archived_at is null and v_task.status::text not in ('delivered','cancelled');
  v_accept := (coalesce(v_owner=v_actor,false) or v_lead) and v_task.archived_at is null and v_task.status::text not in ('delivered','cancelled');
  select * into v_latest from public.creative_kpi_brief_evidence where work_item_id=p_work_item_id and action='submitted' order by id desc limit 1;
  if p_action='submitted' then
    if not coalesce(v_submit,false) then raise exception 'Only the requester can submit this brief' using errcode='42501'; end if;
    if coalesce(trim(v_link),'')='' then raise exception 'Add the brief link before submitting'; end if;
    if coalesce(trim(p_reason),'')='' then raise exception 'Describe this brief version or what changed'; end if;
    insert into public.creative_kpi_brief_evidence(work_item_id,action,actor_user_id,reason,brief_link)
    values(p_work_item_id,'submitted',v_actor,trim(p_reason),v_link) returning id into v_id;
  elsif p_action='accepted' then
    if not coalesce(v_accept,false) then raise exception 'Only the owner or Lead can accept this brief' using errcode='42501'; end if;
    if v_latest.id is null or p_submission_id is distinct from v_latest.id then raise exception 'The brief changed. Refresh before accepting'; end if;
    if exists(select 1 from public.creative_kpi_brief_evidence where submission_id=v_latest.id) then raise exception 'This brief version is already accepted'; end if;
    if coalesce(trim(p_reason),'')='' then raise exception 'Record confirmation or the reason for accepting on behalf of the owner'; end if;
    insert into public.creative_kpi_brief_evidence(work_item_id,action,submission_id,actor_user_id,reason,brief_link)
    values(p_work_item_id,'accepted',v_latest.id,v_actor,trim(p_reason),v_latest.brief_link) returning id into v_id;
  elsif p_action <> 'read' then raise exception 'Unknown brief action'; end if;
  if v_id is not null then
    insert into public.work_item_events(work_item_id,actor_user_id,event_type,metadata)
    values(p_work_item_id,v_actor,'updated',jsonb_build_object('action','brief_'||p_action,'evidence_id',v_id,'submission_id',p_submission_id,'reason',trim(p_reason),'on_behalf',p_action='accepted' and v_owner is distinct from v_actor));
  end if;
  return jsonb_build_object('can_submit',coalesce(v_submit,false),'can_accept',coalesce(v_accept,false),
    'history',coalesce((select jsonb_agg(to_jsonb(e) order by e.id desc) from public.creative_kpi_brief_evidence e where e.work_item_id=p_work_item_id),'[]'::jsonb));
end $function$
