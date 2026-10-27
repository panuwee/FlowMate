-- PREPARED ONLY: separate production approval required. Frontend falls back if RPC is absent.
begin;
set local lock_timeout='2s';
do $rollback$
begin
 if to_regprocedure('public.flowmate_creative_kpi_report_fast(integer,uuid[])') is null then return; end if;
 if md5((select prosrc from pg_proc where oid='public.flowmate_creative_kpi_report_fast(integer,uuid[])'::regprocedure))<>'3ca563c345abb6afb12fab6055e1aab3' then
  raise exception 'Unexpected endpoint; inspect before removal';
 end if;
end $rollback$;
drop function if exists public.flowmate_creative_kpi_report_fast(integer,uuid[]);
commit;
