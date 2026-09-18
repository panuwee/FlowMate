-- Read-only post-apply verification. Do not replace auth.uid() or assume a user identity here.
select n.nspname,p.proname,p.prosecdef,p.provolatile,p.proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname like 'activity_automation_monitor_%')
or (n.nspname='activity_automation_private' and p.proname like 'monitor_%')
order by n.nspname,p.proname;
select test_enabled,production_enabled,notifier_enabled from activity_automation_private.settings where singleton;
select enabled,seatalk_enabled from battle_pass_private.monthly_settings where singleton;
-- Authenticated smoke (run through approved test account separately): access, production/test summary,
-- scoped pagination and guessed foreign-source detail denial; observe no worker/outbox writes.
