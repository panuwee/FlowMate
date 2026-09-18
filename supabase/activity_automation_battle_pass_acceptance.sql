-- Replace the legacy Aof release action with accepted-brief evidence.
-- Apply after activity_automation_brief_assignment.sql.
begin;
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
