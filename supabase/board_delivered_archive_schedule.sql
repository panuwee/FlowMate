-- Enable the FlowMate Delivered retention job only after staging verification.
-- 19:30 UTC is 02:30 Asia/Bangkok on the following calendar day.

do $$
declare
  v_job_name constant text := 'flowmate-archive-expired-deliveries-daily';
  v_existing record;
  v_job_id bigint;
begin
  if to_regnamespace('cron') is null or to_regclass('cron.job') is null then
    raise exception 'pg_cron is not installed; scheduler was not enabled';
  end if;

  -- Exact-name replacement makes reruns idempotent and prevents duplicates.
  for v_existing in
    select jobid
    from cron.job
    where jobname = v_job_name
  loop
    perform cron.unschedule(v_existing.jobid);
  end loop;

  select cron.schedule(
    v_job_name,
    '30 19 * * *',
    $job$select public.flowmate_archive_expired_deliveries(false, now());$job$
  ) into v_job_id;

  if (select count(*) from cron.job where jobname = v_job_name and active) <> 1 then
    raise exception 'Expected exactly one active FlowMate archive job after enable';
  end if;

  raise notice 'Enabled job % (id=%) at 19:30 UTC / 02:30 Asia/Bangkok', v_job_name, v_job_id;
end;
$$;
