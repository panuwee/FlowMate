-- OT API suspension. Preserve service_role grants for maintenance and recovery.
begin;
CREATE OR REPLACE FUNCTION public.flowmate_check_member_access()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare path text:=current_setting('request.path',true); method text:=current_setting('request.method',true); begin
 if path ~ '^/(rpc/)?ot_' then
 raise exception 'OT Request is temporarily suspended.' using errcode='42501'; end if;
 if auth.uid() is not null and not public.flowmate_member_access_allowed(auth.uid()) then
 raise exception 'FlowMate access is inactive. Contact your administrator.' using errcode='42501'; end if;
 if exists(select 1 from public.users where id=auth.uid() and role='viewer') then
 if path like '/rpc/%' then
 if substring(path from 6) <> all(array[
 'flowmate_board_summary','flowmate_list_delivered_history','flowmate_creative_brief',
 'battle_pass_review_status','product_book_list_patches','product_book_list_revisions',
 'marketing_campaign_planner_can_manage','flowmate_board_summary_by_function','task_assign_list','task_assign_members','ot_get_access_context','ot_get_my_dashboard',
 'ot_list_my_requests','ot_get_manager_dashboard','ot_list_eligible_approvers','ot_list_people_for_event'])
 or coalesce(method,'') not in ('GET','HEAD','POST') then
 raise exception 'Viewer access is read-only' using errcode='42501'; end if;
 elsif coalesce(method,'') not in ('GET','HEAD') then
 raise exception 'Viewer access is read-only' using errcode='42501'; end if;
 end if;
end $function$
;
revoke execute on function public.ot_list_request_audit(uuid) from public, anon, authenticated;
revoke execute on function public.ot_current_user_is_hr_admin() from public, anon, authenticated;
revoke execute on function public.ot_list_people_for_event() from public, anon, authenticated;
revoke execute on function public.ot_calculate_occurrence_minutes(timestamp with time zone,timestamp with time zone,integer) from public, anon, authenticated;
revoke execute on function public.ot_get_access_context() from public, anon, authenticated;
revoke execute on function public.ot_reassign_pending_approver(uuid,uuid,text,uuid) from public, anon, authenticated;
revoke execute on function public.ot_list_compliance_queue(date) from public, anon, authenticated;
revoke execute on function public.ot_current_user_is_owner() from public, anon, authenticated;
revoke execute on function public.ot_current_user_is_eligible_approver() from public, anon, authenticated;
revoke execute on function public.ot_submit_actual(uuid,jsonb,uuid) from public, anon, authenticated;
revoke execute on function public.ot_current_user_can_read_request(uuid) from public, anon, authenticated;
revoke execute on function public.ot_list_requester_access() from public, anon, authenticated;
revoke execute on function public.ot_create_event_plan(jsonb,uuid[],uuid) from public, anon, authenticated;
revoke execute on function public.ot_record_consent(uuid,boolean,text,uuid) from public, anon, authenticated;
revoke execute on function public.ot_review_plan(uuid,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.ot_mark_exported(uuid[],text,uuid) from public, anon, authenticated;
revoke execute on function public.ot_resolve_current_requester_access() from public, anon, authenticated;
revoke execute on function public.ot_get_my_dashboard(date) from public, anon, authenticated;
revoke execute on function public.ot_list_my_requests(date) from public, anon, authenticated;
revoke execute on function public.ot_resubmit_plan(uuid,jsonb,text,uuid) from public, anon, authenticated;
revoke execute on function public.ot_get_manager_dashboard(date,text) from public, anon, authenticated;
revoke execute on function public.ot_upsert_requester_access(jsonb,uuid) from public, anon, authenticated;
revoke execute on function public.ot_set_requester_access(uuid,boolean,uuid) from public, anon, authenticated;
revoke execute on function public.ot_review_compliance(uuid,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.ot_create_request(jsonb,uuid) from public, anon, authenticated;
revoke execute on function public.ot_preview_event_plan(jsonb,uuid[]) from public, anon, authenticated;
revoke execute on function public.ot_request_actual_amendment(uuid,text,uuid) from public, anon, authenticated;
revoke execute on function public.ot_verify_actual(uuid,text,text,uuid) from public, anon, authenticated;
revoke execute on function public.ot_list_hr_ready(date) from public, anon, authenticated;
revoke execute on function public.ot_set_approver(uuid,boolean,text,uuid) from public, anon, authenticated;
revoke execute on function public.ot_set_system_role(uuid,text,boolean,text,uuid) from public, anon, authenticated;
revoke execute on function public.ot_list_eligible_approvers() from public, anon, authenticated;
revoke execute on function public.ot_list_access_admin_identities() from public, anon, authenticated;
revoke select on table public.ot_requests from public, anon, authenticated;
notify pgrst, 'reload schema';
commit;
