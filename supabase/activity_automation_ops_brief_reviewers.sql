-- Operations members may review any Operations creative brief; retain existing owner/Lead rights elsewhere.
begin;
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
commit;
notify pgrst,'reload schema';
