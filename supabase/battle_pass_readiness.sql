-- Phase 2B: authorised, deduplicated manual READINESS only. No creation action.
begin;
create table if not exists battle_pass_private.readiness_requests (
  request_id bigint primary key,
  requested_at timestamptz not null default clock_timestamp(),
  requested_by uuid not null references public.users(id),
  result jsonb
);
create index if not exists battle_pass_readiness_requested_at_idx
  on battle_pass_private.readiness_requests(requested_at desc);
alter table battle_pass_private.readiness_requests enable row level security;
revoke all on battle_pass_private.readiness_requests from public, anon, authenticated;

create or replace function battle_pass_private.require_readiness_user() returns void
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or not exists (
    select 1 from public.users u where u.id=auth.uid() and u.is_active
    and (u.id='5abad25d-3e8c-4a0d-baa6-0a0615ba00fc'::uuid or exists (
      select 1 from battle_pass_private.google_connection c where c.singleton and c.user_id=u.id))
  ) then raise exception 'Readiness access denied' using errcode='42501'; end if;
end $$;
revoke all on function battle_pass_private.require_readiness_user() from public, anon, authenticated;

create or replace function public.battle_pass_request_readiness() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r battle_pass_private.readiness_requests%rowtype; rid bigint; stamp timestamptz;
begin
  perform battle_pass_private.require_readiness_user();
  perform pg_advisory_xact_lock(hashtext('battle-pass-manual-readiness'));
  stamp := clock_timestamp();
  select * into r from battle_pass_private.readiness_requests order by requested_at desc limit 1;
  -- Share one in-flight request across users/tabs; reuse a recent completed check for 60s.
  if found and (r.requested_at > stamp-interval '60 seconds'
    or (r.result is null and r.requested_at > stamp-interval '180 seconds')) then
    return jsonb_build_object('requestId',r.request_id::text,'requestedAt',r.requested_at,'reused',true);
  end if;
  rid := battle_pass_private.dispatch('readiness');
  if rid is null then raise exception 'Readiness dispatch unavailable'; end if;
  insert into battle_pass_private.readiness_requests(request_id,requested_by)
    values(rid,auth.uid()) returning * into r;
  return jsonb_build_object('requestId',rid::text,'requestedAt',r.requested_at,'reused',false);
end $$;

create or replace function public.battle_pass_readiness_status(p_request_id bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r battle_pass_private.readiness_requests%rowtype; h record; body jsonb; d jsonb;
  tick battle_pass_private.production_ticks%rowtype; safe_result jsonb; issue_list jsonb;
begin
  perform battle_pass_private.require_readiness_user();
  if p_request_id is null then
    select * into r from battle_pass_private.readiness_requests order by requested_at desc limit 1;
  else select * into r from battle_pass_private.readiness_requests where request_id=p_request_id; end if;
  if r.request_id is null then return jsonb_build_object('state','empty'); end if;
  if r.result is null then
    -- Only inspect responses for IDs registered by our fixed readiness dispatcher.
    select status_code,timed_out,error_msg,content into h from net._http_response where id=r.request_id;
    if found then
      if h.timed_out or h.error_msg is not null or h.status_code is distinct from 200 then
        safe_result := jsonb_build_object('state','failed','code','readiness_request_failed');
      else
        begin body := h.content::jsonb;
        exception when invalid_text_representation then body := null; end;
        -- Correlate the exact returned run ID to the durable Worker record, never the latest tick.
        select * into tick from battle_pass_private.production_ticks t
          where t.run_id::text=body->>'runId' and t.checked_at>=r.requested_at;
        if not found or tick.status not in ('readiness_checked','failed') then
          safe_result := jsonb_build_object('state','failed','code','readiness_response_invalid');
        else
          d := tick.detail;
          select coalesce(jsonb_agg(value),'[]'::jsonb) into issue_list from (
            select value from jsonb_array_elements_text(
              case when jsonb_typeof(d#>'{plan,issues}')='array' then d#>'{plan,issues}' else '[]'::jsonb end
              || case when jsonb_typeof(d#>'{plan,next,issues}')='array' then d#>'{plan,next,issues}' else '[]'::jsonb end
            ) where value ~ '^[a-z0-9_]{1,100}$' limit 20
          ) issues;
          safe_result := jsonb_build_object('state',case when tick.status='readiness_checked' then 'complete' else 'failed' end,
            'runId',tick.run_id,'checkedAt',tick.checked_at,
            'code',case when d->>'code' ~ '^[a-z0-9_]{1,100}$' then d->>'code' end,
            'period',d#>>'{plan,next,period}','nextState',d#>>'{plan,next,state}','planState',d#>>'{plan,state}',
            'confirmed',d#>'{sourceStatus,confirmed}','workingSheetLinked',d#>'{sourceStatus,workingSheetLinked}',
            'sourceReady',d->'sourceReady','googleReady',d#>'{google,capabilitiesVerified}',
            'databaseReady',d#>'{database,ready}',
            'databaseCode',case when d#>>'{database,code}' ~ '^[a-z0-9_]{1,100}$' then d#>>'{database,code}' end,
            'issues',issue_list);
        end if;
      end if;
    elsif clock_timestamp()-r.requested_at>interval '180 seconds' then
      safe_result := jsonb_build_object('state','failed','code','readiness_result_unavailable');
    end if;
    if safe_result is not null then
      update battle_pass_private.readiness_requests set result=coalesce(readiness_requests.result,safe_result)
        where request_id=r.request_id returning readiness_requests.result into safe_result;
    end if;
  else safe_result := r.result; end if;
  return jsonb_build_object('requestId',r.request_id::text,'requestedAt',r.requested_at)
    || coalesce(safe_result,jsonb_build_object('state','pending'));
end $$;
revoke all on function public.battle_pass_request_readiness(),public.battle_pass_readiness_status(bigint) from public,anon;
grant execute on function public.battle_pass_request_readiness(),public.battle_pass_readiness_status(bigint) to authenticated;
notify pgrst,'reload schema';
commit;
