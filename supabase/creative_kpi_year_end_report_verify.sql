-- Run only after separately approved apply; read-only verification.
begin read only;
set local statement_timeout = '45s';
select to_regclass('public.flowmate_creative_kpi_report_v') is not null as installed;
select c.reloptions @> array['security_invoker=true'] as security_invoker
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='flowmate_creative_kpi_report_v';
select has_table_privilege('authenticated','public.flowmate_creative_kpi_report_v','SELECT') as authenticated_select,
  not has_table_privilege('anon','public.flowmate_creative_kpi_report_v','SELECT') as anon_denied;
do $audit$
declare viewer text;
begin
  select id::text into viewer from public.users where is_active and (role='admin' or can_access_all_teams) order by id limit 1;
  if viewer is null then raise exception 'No eligible verifier'; end if;
  perform set_config('request.jwt.claim.sub',viewer,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated')::text,true);
end $audit$;
set local role authenticated;
select count(*) as tasks, count(distinct work_item_id)=count(*) as one_row_per_task,
  count(*) filter(where owner_member_code in ('jo','tong','eye','ploy')) as gd,
  count(*) filter(where owner_member_code in ('pond','vee')) as ve,
  count(*) filter(where cardinality(ai_tags)>0) as ai_tagged
from public.flowmate_creative_kpi_report_v;
reset role;
do $ordinary$
declare viewer text;
begin
  select id::text into viewer from public.users where is_active and role<>'admin' and not coalesce(can_access_all_teams,false) order by id limit 1;
  if viewer is null then raise exception 'Standard-user verification requires a standard account'; end if;
  perform set_config('request.jwt.claim.sub',viewer,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',viewer,'role','authenticated')::text,true);
end $ordinary$;
set local role authenticated;
select count(*)=0 as standard_account_denied from public.flowmate_creative_kpi_report_v;
rollback;
