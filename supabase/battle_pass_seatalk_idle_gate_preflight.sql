-- Read-only. Do not invoke dispatcher/claim/detect as a verification query:
-- those functions enqueue HTTP, claim rows or modify notification state.
select now() as observed_at,jobid,jobname,schedule,active,
  command='select battle_pass_private.seatalk_detect();'
    ||E'\n           select battle_pass_private.seatalk_dispatch();' as expected_command
from cron.job where jobname='battle-pass-seatalk-15m';

select n.nspname,p.proname,md5(p.prosrc) as body_hash,
 pg_get_userbyid(p.proowner) as owner,p.proacl::text,p.prosecdef,p.proconfig
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where p.oid in ('battle_pass_private.seatalk_dispatch()'::regprocedure,
 'battle_pass_private.seatalk_detect()'::regprocedure,
 'public.battle_pass_seatalk_claim(integer)'::regprocedure);

select seatalk_enabled,seatalk_activation_cutoff is not null as has_activation_cutoff
from battle_pass_private.monthly_settings where singleton;

select status,count(*) as rows,
 count(*) filter(where status in ('pending','failed') and attempt_count<5
   and coalesce(next_attempt_at,eligible_at)<=statement_timestamp()) as due,
 count(*) filter(where status='dispatching' and lease_expires_at<=statement_timestamp()
   and (send_started_at is not null or attempt_count<5)) as actionable_expired,
 count(*) filter(where status='dispatching' and lease_expires_at<=statement_timestamp()
   and send_started_at is null and attempt_count>=5) as exhausted_unstarted_expired
from battle_pass_private.seatalk_notifications group by status;

select status,count(*),min(start_time),max(start_time)
from cron.job_run_details where jobid in
 (select jobid from cron.job where jobname='battle-pass-seatalk-15m')
 and start_time>now()-interval '24 hours' group by status;
