-- Restore only this ready gate; retain schedule, active flag and Vault reference.
-- Requires explicit production SQL authorization, just like installation.
begin;
do $rollback$
declare
  v_job record;
  v_count integer;
  v_marker constant text := '/* flowmate-creative-ready-v1 */';
  v_gate constant text := E'\n/* flowmate-creative-ready-v1 */\nwhere exists (select 1 from private.creative_seatalk_outbox where status in (''pending'', ''retry'') and available_at <= now());';
begin
  perform pg_advisory_xact_lock(hashtext('flowmate-creative-ready-v1'));
  select count(*) into v_count from cron.job
  where jobname = 'creativebot-dispatch-every-minute';
  if v_count <> 1 then raise exception 'Expected exactly one CreativeBot dispatcher job'; end if;
  select jobid, command into strict v_job from cron.job
  where jobname = 'creativebot-dispatch-every-minute';
  if position(v_marker in v_job.command) = 0 then return; end if;
  if v_job.command <> split_part(v_job.command, v_marker, 1) || substring(v_gate from 2) then
    raise exception 'CreativeBot ready gate differs; review required';
  end if;
  perform cron.alter_job(job_id := v_job.jobid,
    command := regexp_replace(split_part(v_job.command, v_marker, 1), '\s+$', '') || ';');
end
$rollback$;
commit;
