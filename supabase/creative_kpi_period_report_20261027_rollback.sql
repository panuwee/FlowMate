-- Separate approval required. Revert the period frontend before removing this endpoint.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $rollback$
begin
 if to_regprocedure('public.flowmate_creative_kpi_report_period(integer,integer,uuid[])') is null then return; end if;
 if (select md5(prosrc) from pg_proc where oid='public.flowmate_creative_kpi_report_period(integer,integer,uuid[])'::regprocedure)<>'f4fcfd9aa212ac309fd08bf03980a6cf' then
  raise exception 'Unexpected period endpoint; inspect before removal';
 end if;
end $rollback$;
drop function if exists public.flowmate_creative_kpi_report_period(integer,integer,uuid[]);
commit;
