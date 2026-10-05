-- READ ONLY: inspect before requesting production apply. No writes or sensitive payloads.
begin transaction read only;
select current_database() as database_name, now() as checked_at;
select name, case
 when name like '%public.priority_level%' and to_regtype('public.priority_level') is null then false
 else to_regprocedure(name) is not null end as installed
from unnest(array[
 'public.flowmate_can_read_work_item(uuid,uuid)',
 'public.flowmate_current_user_can_read_work_item(uuid)',
 'public.flowmate_kpi_can_view()',
 'public.task_assign_can_execute(uuid,uuid)',
 'public.task_assign_create(text,text,text,text,date,uuid,date,text,uuid,public.priority_level,text,text[],boolean,uuid[],uuid)',
 'public.flowmate_kpi_evidence_context(uuid)',
 'public.flowmate_kpi_record_evidence(uuid,text,uuid,text,text,date,date,integer,text,integer)'
]) as name;
select table_name,column_name,data_type from information_schema.columns
where table_schema='public' and table_name in ('work_items','users','team_members','work_item_events','creative_kpi_brief_evidence','flowmate_kpi_measurement_evidence','flowmate_kpi_calendars')
order by table_name,ordinal_position;
select t.typname,e.enumlabel,e.enumsortorder from pg_type t
join pg_namespace n on n.oid=t.typnamespace join pg_enum e on e.enumtypid=t.oid
where n.nspname='public' and t.typname='priority_level' order by e.enumsortorder;
select tablename,policyname,roles,cmd,qual,with_check from pg_policies
where schemaname='public' and tablename in ('work_items','flowmate_kpi_measurement_evidence','flowmate_kpi_calendars');
select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('work_items','flowmate_kpi_measurement_evidence','flowmate_kpi_calendars');
select p.oid::regprocedure as function_signature,p.prosecdef,p.proconfig,p.proacl,
 pg_get_userbyid(p.proowner) as function_owner,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
 pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('flowmate_can_read_work_item','flowmate_current_user_can_read_work_item','flowmate_user_can_read_work_item','flowmate_kpi_can_view','flowmate_current_user_has_all_team_access','task_assign_can_execute','task_assign_can_read','task_assign_create','task_assign_create_with_kpi','flowmate_kpi_can_record','flowmate_kpi_evidence_context','flowmate_kpi_record_evidence')) or n.nspname='flowmate_kpi_capture_private';
select n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where not t.tgisinternal and n.nspname='public'
and c.relname in ('work_items','flowmate_kpi_measurement_evidence');
select n.nspname,c.relname,pg_get_userbyid(c.relowner) as table_owner,c.relacl,
 pg_size_pretty(pg_total_relation_size(c.oid)) as total_size
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('work_items','flowmate_kpi_measurement_evidence','flowmate_kpi_calendars');
rollback;
