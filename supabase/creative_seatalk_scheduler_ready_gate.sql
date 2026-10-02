-- Reviewed local change. Apply to production only with explicit authorization.
-- Keep the existing minute schedule, Vault reference, HTTP request and claimant.
-- A WHERE filter prevents net.http_post from running when no outbox row is due.
begin;
do $install$
declare
  v_job record;
  v_count integer;
  v_structure text;
  v_marker constant text := '/* flowmate-creative-ready-v1 */';
  v_gate constant text := E'\n/* flowmate-creative-ready-v1 */\nwhere exists (select 1 from private.creative_seatalk_outbox where status in (''pending'', ''retry'') and available_at <= now());';
begin
  perform pg_advisory_xact_lock(hashtext('flowmate-creative-ready-v1'));
  select count(*) into v_count from cron.job
  where jobname = 'creativebot-dispatch-every-minute';
  if v_count <> 1 then raise exception 'Expected exactly one CreativeBot dispatcher job'; end if;
  select jobid, schedule, command into strict v_job from cron.job
  where jobname = 'creativebot-dispatch-every-minute';
  if v_job.schedule <> '* * * * *' then raise exception 'CreativeBot schedule changed; review required'; end if;
  if position(v_marker in v_job.command) > 0 then
    if v_job.command <> split_part(v_job.command, v_marker, 1) || substring(v_gate from 2) then
      raise exception 'CreativeBot ready gate differs; review required';
    end if;
    return;
  end if;
  -- Only wrap the known single SELECT, never an unfamiliar/multi-statement job.
  v_structure := lower(regexp_replace(regexp_replace(
    regexp_replace(v_job.command, ';\s*$', ''), $quoted$'(?:[^']|'')*'$quoted$, '?', 'g'), '\s+', '', 'g'));
  if v_structure <> 'selectnet.http_post(url:=?,headers:=jsonb_build_object(?,?,?,(selectdecrypted_secretfromvault.decrypted_secretswherename=?)),body:=?::jsonb)'
     or position('/functions/v1/seatalk-creative-dispatch' in v_job.command) = 0 then
    raise exception 'CreativeBot dispatcher command differs; review required';
  end if;
  perform cron.alter_job(job_id := v_job.jobid,
    command := regexp_replace(v_job.command, ';\s*$', '') || v_gate);
end
$install$;
commit;
