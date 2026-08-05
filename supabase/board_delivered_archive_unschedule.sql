-- Disable the exact FlowMate Delivered retention job before rollback.

do $$
declare
  v_job_name constant text := 'flowmate-archive-expired-deliveries-daily';
  v_existing record;
begin
  if to_regnamespace('cron') is null or to_regclass('cron.job') is null then
    raise exception 'pg_cron is not installed; no scheduler catalog can be checked';
  end if;

  for v_existing in
    select jobid
    from cron.job
    where jobname = v_job_name
  loop
    perform cron.unschedule(v_existing.jobid);
  end loop;

  if (select count(*) from cron.job where jobname = v_job_name and active) <> 0 then
    raise exception 'FlowMate archive job is still active after unschedule';
  end if;

  raise notice 'Disabled job %; active jobs remaining: 0', v_job_name;
end;
$$;
