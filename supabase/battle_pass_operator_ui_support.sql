-- Phase 2B step 9 support: two read-only RPCs the operator UI needs.
--   * battle_pass_failed_runs  - the picker for "which failed run do I want explained?"
--   * battle_pass_audit_trail  - replaced so it also reports the current automation flag,
--     which the Pause/Resume button needs to know what it is about to do. Reading it from
--     the monitor card's text would couple the UI to a rendered Thai string.
-- Both are read-only. Nothing here dispatches, mutates, or touches cron.
begin;

create or replace function public.battle_pass_failed_runs(p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n integer; result jsonb;
begin
  perform battle_pass_private.require_operator();
  n := least(greatest(coalesce(p_limit,10),1),50);
  select coalesce(jsonb_agg(jsonb_build_object(
      'runId', t.run_id,
      'checkedAt', t.checked_at,
      'status', case when t.status ~ '^[a-z_]{1,40}$' then t.status end,
      'code', case when coalesce(t.detail->>'code', t.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
        then coalesce(t.detail->>'code', t.code) end,
      'stage', case when t.detail->>'stage' ~ '^[a-z_]{1,40}$' then t.detail->>'stage' end,
      'period', case when coalesce(t.detail->>'period', t.detail#>>'{plan,next,period}')
        ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
        then coalesce(t.detail->>'period', t.detail#>>'{plan,next,period}') end
    ) order by t.checked_at desc, t.run_id desc), '[]'::jsonb)
  into result
  from (
    select run_id, status, code, detail, checked_at
    from battle_pass_private.production_ticks
    where status in ('failed','source_blocked','review_required')
    order by checked_at desc, run_id desc
    limit n
  ) t;
  return jsonb_build_object('observedAt', current_timestamp, 'runs', result);
end $$;

create or replace function public.battle_pass_audit_trail(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n integer; result jsonb;
begin
  perform battle_pass_private.require_operator();
  n := least(greatest(coalesce(p_limit,50),1),200);
  select coalesce(jsonb_agg(jsonb_build_object(
      'actionId', a.action_id::text,
      'action', a.action,
      'requestedAt', a.requested_at,
      'requestedBy', coalesce(u.display_name,'unknown'),
      'period', case when a.target_period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then a.target_period end,
      'runId', a.target_run_id,
      'requestId', a.request_id::text,
      'beforeState', a.before_state,
      'result', a.result
    ) order by a.requested_at desc, a.action_id desc), '[]'::jsonb)
  into result
  from (
    select action_id, action, requested_at, requested_by, target_period, target_run_id,
           request_id, before_state, result
    from battle_pass_private.operator_actions
    order by requested_at desc, action_id desc
    limit n
  ) a
  left join public.users u on u.id = a.requested_by;
  return jsonb_build_object(
    'observedAt', current_timestamp,
    'automationEnabled', (select s.enabled from battle_pass_private.monthly_settings s
                          where s.singleton),
    'actions', result);
end $$;

revoke all on function public.battle_pass_failed_runs(integer) from public, anon;
grant execute on function public.battle_pass_failed_runs(integer) to authenticated;
revoke all on function public.battle_pass_audit_trail(integer) from public, anon;
grant execute on function public.battle_pass_audit_trail(integer) to authenticated;
notify pgrst,'reload schema';
commit;
