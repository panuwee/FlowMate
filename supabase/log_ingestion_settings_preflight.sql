-- Read-only diagnostic. Does not alter logging, cron, history, claims or Vault.
select name, setting, context, pending_restart
from pg_settings
where name in ('cron.log_statement', 'cron.log_min_messages', 'cron.log_run')
order by name;

select extname, extversion from pg_extension where extname = 'pg_cron';

select jobid, jobname, schedule, active from cron.job order by jobid;

-- DB execution timing excludes asynchronous HTTP worker duration.
select j.jobname, count(d.runid) as runs,
  count(d.runid) filter (where d.status = 'failed') as failed,
  round(avg(extract(epoch from (d.end_time - d.start_time)) * 1000)::numeric, 2) as mean_db_ms
from cron.job j
left join cron.job_run_details d
  on d.jobid = j.jobid and d.start_time >= now() - interval '24 hours'
group by j.jobid, j.jobname order by j.jobid;
