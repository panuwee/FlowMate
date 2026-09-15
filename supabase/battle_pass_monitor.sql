-- Phase 2A: read-only monitor. Does not enable, dispatch, or change worker jobs.
begin;

create index if not exists battle_pass_ticks_checked_at_idx
  on battle_pass_private.production_ticks (checked_at desc, run_id desc);

create or replace function public.battle_pass_monitor()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.users u where u.id = auth.uid() and u.is_active
      and (u.id = '5abad25d-3e8c-4a0d-baa6-0a0615ba00fc'::uuid
        or exists (select 1 from battle_pass_private.google_connection c
          where c.singleton and c.user_id = u.id))
  ) then
    raise exception 'Monitor access denied' using errcode = '42501';
  end if;

  with ticks as (
    select t.* from battle_pass_private.production_ticks t
    order by t.checked_at desc, t.run_id desc limit 50
  ), job as (
    select j.jobid, j.active, j.schedule from cron.job j
    where j.jobname = 'battle-pass-production-30m'
  )
  select jsonb_build_object(
    'observedAt', current_timestamp,
    'enabled', (select s.enabled from battle_pass_private.monthly_settings s where s.singleton),
    'scheduler', (select jsonb_build_object('jobId', j.jobid, 'active', j.active, 'schedule', j.schedule,
      'lastRun', (select jsonb_build_object('runId', d.runid, 'status', d.status,
        'startedAt', d.start_time, 'finishedAt', d.end_time)
        from cron.job_run_details d where d.jobid = j.jobid order by d.runid desc limit 1)) from job j),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
      'runId', t.run_id, 'checkedAt', t.checked_at, 'status', t.status,
      'kind', case when t.status = 'readiness_checked' or t.detail->>'action' = 'readiness' then 'readiness'
        when t.status = 'google_write_checked' or t.detail->>'action' = 'google-write-check' then 'probe'
        when t.detail->>'action' = 'run' or t.status in ('waiting_confirmation', 'needs_data',
          'source_blocked', 'no_pending_month', 'complete', 'review_required', 'disabled', 'in_progress', 'busy') then 'production'
        else 'unknown' end,
      'period', coalesce(t.detail->>'period', t.detail#>>'{plan,next,period}'),
      'stage', t.detail->>'stage',
      'code', case when coalesce(t.detail->>'code', t.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
        then coalesce(t.detail->>'code', t.code) else null end
    ) order by t.checked_at desc, t.run_id desc) from ticks t), '[]'::jsonb),
    'outputs', coalesce((select jsonb_agg(o.value order by o.period desc) from (
      select r.period, jsonb_build_object('period', r.period, 'state', r.state,
        'updatedAt', r.updated_at, 'displayId', w.display_id,
        'slideId', r.slide_id, 'reviewReleasedAt', r.review_released_at,
        'held', r.checkpoint ? 'hold') as value
      from battle_pass_private.monthly_runs r
      left join public.work_items w on w.id = r.brief_id
      where r.mode = 'production' order by r.period desc limit 24
    ) o), '[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.battle_pass_monitor() from public, anon;
grant execute on function public.battle_pass_monitor() to authenticated;
notify pgrst, 'reload schema';
commit;
