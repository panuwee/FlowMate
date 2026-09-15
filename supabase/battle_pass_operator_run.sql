-- Phase 2B.1 step 3: operator "Run Now" + shared action status reader.
-- Reuses the existing dispatcher and the existing worker unchanged. Writes no run state:
-- the worker itself decides whether anything is claimable. Deduplicated exactly like
-- readiness so a double click (or two tabs) cannot produce two dispatches.
begin;

create or replace function public.battle_pass_run_now() returns jsonb
language plpgsql security definer set search_path='' as $$
declare a battle_pass_private.operator_actions%rowtype; rid bigint; stamp timestamptz;
begin
  perform battle_pass_private.require_operator();
  if not (select enabled from battle_pass_private.monthly_settings where singleton) then
    raise exception 'Automation is paused' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('battle-pass-operator-run'));
  stamp := clock_timestamp();
  select * into a from battle_pass_private.operator_actions
    where action='run_now' order by requested_at desc limit 1;

  -- Share one in-flight dispatch across users/tabs; reuse a recent completed one for 60s.
  if found and (a.requested_at > stamp-interval '60 seconds'
    or (a.result is null and a.requested_at > stamp-interval '180 seconds')) then
    return jsonb_build_object('actionId',a.action_id::text,'requestId',a.request_id::text,
      'requestedAt',a.requested_at,'reused',true);
  end if;

  rid := battle_pass_private.dispatch('run');
  if rid is null then raise exception 'Run dispatch unavailable'; end if;

  insert into battle_pass_private.operator_actions(action,requested_by,request_id,before_state)
  values('run_now',auth.uid(),rid,jsonb_build_object('enabled',true))
  returning * into a;

  return jsonb_build_object('actionId',a.action_id::text,'requestId',rid::text,
    'requestedAt',a.requested_at,'reused',false);
end $$;

-- Status reader shared by Run Now and Retry. Correlates only the exact returned run ID to
-- a durable worker tick, never "the latest tick". Emits regex-validated fields only.
create or replace function public.battle_pass_action_status(p_action_id bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a battle_pass_private.operator_actions%rowtype; h record; body jsonb; d jsonb;
  tick battle_pass_private.production_ticks%rowtype; safe_result jsonb;
begin
  perform battle_pass_private.require_operator();
  if p_action_id is null then
    select * into a from battle_pass_private.operator_actions order by requested_at desc limit 1;
  else select * into a from battle_pass_private.operator_actions where action_id=p_action_id; end if;
  if a.action_id is null then return jsonb_build_object('state','empty'); end if;

  -- pause/resume are synchronous: their result was written at insert time.
  if a.request_id is null then
    return jsonb_build_object('actionId',a.action_id::text,'action',a.action,
      'requestedAt',a.requested_at,'state','complete') || coalesce(a.result,'{}'::jsonb);
  end if;

  if a.result is null then
    select status_code,timed_out,error_msg,content into h from net._http_response where id=a.request_id;
    if found then
      if h.timed_out or h.error_msg is not null or h.status_code is distinct from 200 then
        safe_result := jsonb_build_object('state','failed','code','action_request_failed');
      else
        begin body := h.content::jsonb;
        exception when invalid_text_representation then body := null; end;
        select * into tick from battle_pass_private.production_ticks t
          where t.run_id::text=body->>'runId' and t.checked_at>=a.requested_at;
        if not found then
          safe_result := jsonb_build_object('state','failed','code','action_response_invalid');
        else
          d := tick.detail;
          safe_result := jsonb_build_object(
            'state','complete',
            'runId',tick.run_id,
            'checkedAt',tick.checked_at,
            'workerState',case when tick.status ~ '^[a-z_]{1,40}$' then tick.status end,
            'code',case when coalesce(d->>'code',tick.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
              then coalesce(d->>'code',tick.code) end,
            'period',case when coalesce(d->>'period',d#>>'{plan,next,period}') ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
              then coalesce(d->>'period',d#>>'{plan,next,period}') end,
            'stage',case when d->>'stage' ~ '^[a-z_]{1,40}$' then d->>'stage' end);
        end if;
      end if;
    elsif clock_timestamp()-a.requested_at>interval '180 seconds' then
      safe_result := jsonb_build_object('state','failed','code','action_result_unavailable');
    end if;
    if safe_result is not null then
      update battle_pass_private.operator_actions
        set result=coalesce(operator_actions.result,safe_result)
        where action_id=a.action_id returning operator_actions.result into safe_result;
    end if;
  else safe_result := a.result; end if;

  return jsonb_build_object('actionId',a.action_id::text,'action',a.action,
    'requestedAt',a.requested_at,'period',a.target_period)
    || coalesce(safe_result,jsonb_build_object('state','pending'));
end $$;

revoke all on function public.battle_pass_run_now(),public.battle_pass_action_status(bigint) from public,anon;
grant execute on function public.battle_pass_run_now(),public.battle_pass_action_status(bigint) to authenticated;
notify pgrst,'reload schema';
commit;
