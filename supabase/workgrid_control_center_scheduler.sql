-- Apply only after approval for secrets, production SQL, scheduler activation and actual sends.
-- Provision the matching Edge secret WCC_DISPATCH_SECRET and Vault wcc_dispatch_secret securely first.
begin;
create or replace function wcc_private.request_dispatch() returns bigint
language plpgsql security invoker set search_path='' as $$
declare dispatch_secret text; request_id bigint;
begin
 -- Expired leases must still be reconciled even when ordinary sending is paused.
 if not exists(select 1 from wcc_private.deliveries where status='sending' and lease_until<now())
 and (not coalesce((select runtime_enabled from wcc_private.settings where singleton=true),false)
 or not exists(select 1 from wcc_private.deliveries where status in ('pending','retryable') and available_at<=now())) then return null; end if;
 if (select count(*) from vault.decrypted_secrets where name='wcc_dispatch_secret')<>1 then
  raise exception 'WCC dispatch secret unavailable';
 end if;
 select decrypted_secret into dispatch_secret from vault.decrypted_secrets where name='wcc_dispatch_secret';
 if dispatch_secret is null or length(dispatch_secret)<32 then raise exception 'WCC dispatch secret unavailable'; end if;
 select net.http_post(
  url:='https://jbavahimqjalvcfawgqw.supabase.co/functions/v1/workgrid-control-center',
  body:='{"action":"dispatch"}'::jsonb,
  headers:=jsonb_build_object('Content-Type','application/json','x-wcc-dispatch-secret',dispatch_secret),
  timeout_milliseconds:=10000
 ) into request_id;
 return request_id;
end $$;
revoke all on function wcc_private.request_dispatch() from public,anon,authenticated,service_role;
create index if not exists wcc_delivery_expired_lease on wcc_private.deliveries(lease_until) where status='sending';
do $$ begin
 if (select count(*) from vault.decrypted_secrets where name='wcc_dispatch_secret')<>1 then
  raise exception 'Provision WCC dispatch secret before scheduler activation';
 end if;
end $$;
select cron.schedule('workgrid-control-center-dispatch-every-minute','* * * * *',
 'select wcc_private.request_dispatch();');
commit;
