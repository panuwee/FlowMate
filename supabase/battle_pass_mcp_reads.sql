-- Phase 2B.3 step 2: the five read projections behind the MCP tools.
--
-- Every function here is STABLE, security definer, gated by require_worker() (service_role,
-- no end user), revoked from anon/authenticated, and granted only to service_role. None of
-- them writes anything. The sixth tool, bp_get_run_context, deliberately reuses the existing
-- battle_pass_diagnosis_context() unchanged rather than forking its sanitization.
--
-- Sanitization contract (docs/PHASE_2B_MVP_SPEC.md §6) — these must NEVER be emitted:
--   email · display_name · any user uuid · Google file/folder/slide id · work_items.display_id
--   source_snapshot · source_fingerprint · checkpoint VALUES (keys only) · any secret
-- That is why battle_pass_monitor() is not proxied: it returns slideId and displayId.
begin;

-- ---------------------------------------------------------------- 1. status
-- Shape mirrors battle_pass_monitor() minus slideId/displayId, and swaps its auth.uid()
-- gate for require_worker(). Reads cron.* but never alters a job.
create or replace function public.battle_pass_mcp_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_tick battle_pass_private.production_ticks%rowtype;
        v_run battle_pass_private.monthly_runs%rowtype;
        v_hold text; v_sched jsonb;
begin
  perform battle_pass_private.require_worker();

  select * into v_tick from battle_pass_private.production_ticks t
    order by t.checked_at desc, t.run_id desc limit 1;

  select * into v_run from battle_pass_private.monthly_runs m
    where m.mode = 'production' order by m.period desc limit 1;

  v_hold := case when v_run.checkpoint->>'hold' ~ '^[a-z0-9_]{1,50}$'
    then v_run.checkpoint->>'hold' end;

  select jsonb_build_object(
      'active', j.active,
      'schedule', j.schedule,
      'lastRunStatus', (select case when d.status ~ '^[a-z_ ]{1,40}$' then d.status end
        from cron.job_run_details d where d.jobid = j.jobid
        order by d.runid desc limit 1))
    into v_sched
  from cron.job j where j.jobname = 'battle-pass-production-30m';

  return jsonb_build_object(
    'schemaVersion', '1.0',
    'observedAt', current_timestamp,
    'automationEnabled', (select s.enabled from battle_pass_private.monthly_settings s
                          where s.singleton),
    'scheduler', coalesce(v_sched, 'null'::jsonb),
    'currentPeriod', case when v_run.period is null then 'null'::jsonb else jsonb_build_object(
      'period', case when v_run.period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then v_run.period end,
      'state', case when v_run.state ~ '^[a-z_]{1,40}$' then v_run.state end,
      'updatedAt', v_run.updated_at,
      'held', v_hold is not null,
      'holdReason', v_hold) end,
    'lastTick', case when v_tick.run_id is null then 'null'::jsonb else jsonb_build_object(
      'runId', v_tick.run_id,
      'status', case when v_tick.status ~ '^[a-z_]{1,40}$' then v_tick.status end,
      'code', case when coalesce(v_tick.detail->>'code', v_tick.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
        then coalesce(v_tick.detail->>'code', v_tick.code) end,
      'stage', case when v_tick.detail->>'stage' ~ '^[a-z_]{1,40}$'
        then v_tick.detail->>'stage' end,
      'checkedAt', v_tick.checked_at) end);
end $$;

-- ---------------------------------------------------------------- 2. recent runs
-- Body copied from battle_pass_failed_runs (battle_pass_operator_ui_support.sql:15-33),
-- which is already sanitized and regex-filtered. Changes: require_worker() instead of
-- require_operator(); clamp 1-25 instead of 1-50; all tick statuses, not only failures, so
-- the agent can tell a quiet system from a broken one; plus kind and held.
create or replace function public.battle_pass_mcp_recent_runs(p_limit integer default 10)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n integer; result jsonb;
begin
  perform battle_pass_private.require_worker();
  n := least(greatest(coalesce(p_limit,10),1),25);
  select coalesce(jsonb_agg(jsonb_build_object(
      'runId', t.run_id,
      'checkedAt', t.checked_at,
      'status', case when t.status ~ '^[a-z_]{1,40}$' then t.status end,
      'code', case when coalesce(t.detail->>'code', t.code) ~ '^[A-Za-z0-9_.:-]{1,100}$'
        then coalesce(t.detail->>'code', t.code) end,
      'stage', case when t.detail->>'stage' ~ '^[a-z_]{1,40}$' then t.detail->>'stage' end,
      'period', t.period,
      -- Classification kept identical to battle_pass_monitor() lines 36-40 so the operator
      -- UI and the agent never disagree about what a tick was.
      'kind', case
        when t.status = 'readiness_checked' or t.detail->>'action' = 'readiness' then 'readiness'
        when t.status = 'google_write_checked' or t.detail->>'action' = 'google-write-check'
          then 'probe'
        when t.detail->>'action' = 'run' or t.status in ('waiting_confirmation','needs_data',
          'source_blocked','no_pending_month','complete','review_required','disabled',
          'in_progress','busy','failed') then 'production'
        else 'unknown' end,
      'held', t.held
    ) order by t.checked_at desc, t.run_id desc), '[]'::jsonb)
  into result
  from (
    select x.run_id, x.status, x.code, x.detail, x.checked_at, p.period,
           (r.checkpoint ? 'hold') as held
    from (
      select run_id, status, code, detail, checked_at
      from battle_pass_private.production_ticks
      order by checked_at desc, run_id desc
      limit n
    ) x
    cross join lateral (select case
      when coalesce(x.detail->>'period', x.detail#>>'{plan,next,period}')
        ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
      then coalesce(x.detail->>'period', x.detail#>>'{plan,next,period}') end as period) p
    left join battle_pass_private.monthly_runs r
      on r.mode = 'production' and r.period = p.period
  ) t;
  return jsonb_build_object('observedAt', current_timestamp, 'runs', result);
end $$;

-- ---------------------------------------------------------------- 3. error code lookup
-- Returns {known:false} for a miss rather than raising, so an agent guessing a code gets a
-- usable answer instead of a tool error. A MALFORMED code does raise: that would mean the
-- Edge Function failed to validate, which is a bug worth surfacing, not a miss.
create or replace function public.battle_pass_mcp_error_code(p_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare v_cat battle_pass_private.error_catalog%rowtype;
begin
  perform battle_pass_private.require_worker();
  -- Accepts the broader tick-code shape; catalog codes themselves are lowercase.
  if coalesce(p_code,'') !~ '^[A-Za-z0-9_.:-]{1,100}$' then
    raise exception 'Invalid error code';
  end if;

  select * into v_cat from battle_pass_private.error_catalog c where c.code = p_code;
  if not found then
    return jsonb_build_object('schemaVersion','1.0','known',false,'code',p_code);
  end if;
  return jsonb_build_object(
    'schemaVersion','1.0',
    'known', true,
    'code', v_cat.code,
    'severity', v_cat.severity,
    'runbookRef', v_cat.runbook_ref,
    'recoveryHint', v_cat.recovery_hint,
    'aiEligible', v_cat.ai_eligible,
    'updatedAt', v_cat.updated_at);
end $$;

-- ---------------------------------------------------------------- 4. code recurrence
-- battle_pass_private.diagnosis_repeat_count(text) hard-codes interval '7 days' and takes no
-- window, so this copies its logic with p_days parameterised. The status='failed' filter and
-- the coalesce(detail->>'code', code) expression must stay identical to it, or this count
-- will disagree with the 2B.2 route engine's "repeated" signal.
create or replace function public.battle_pass_mcp_code_count(
  p_code text, p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d integer; c integer;
begin
  perform battle_pass_private.require_worker();
  if coalesce(p_code,'') !~ '^[A-Za-z0-9_.:-]{1,100}$' then
    raise exception 'Invalid error code';
  end if;
  d := least(greatest(coalesce(p_days,7),1),90);
  select count(*)::integer into c from battle_pass_private.production_ticks x
    where coalesce(x.detail->>'code', x.code) = p_code
      and x.status = 'failed'
      and x.checked_at > clock_timestamp() - make_interval(days => d);
  return jsonb_build_object(
    'schemaVersion','1.0', 'code', p_code, 'windowDays', d, 'count', coalesce(c,0));
end $$;

-- ---------------------------------------------------------------- 5. readiness
-- readiness_requests.result was already allowlist-built by battle_pass_readiness_status
-- (battle_pass_readiness.sql:76-84). Re-filtering here is defence in depth, and it drops the
-- fields an agent has no use for rather than passing the stored blob through.
create or replace function public.battle_pass_mcp_readiness() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r battle_pass_private.readiness_requests%rowtype; v jsonb;
begin
  perform battle_pass_private.require_worker();
  select * into r from battle_pass_private.readiness_requests q
    where q.result is not null order by q.requested_at desc, q.request_id desc limit 1;
  if not found then
    return jsonb_build_object('schemaVersion','1.0','available',false);
  end if;
  v := r.result;
  return jsonb_build_object(
    'schemaVersion','1.0',
    'available', true,
    'requestedAt', r.requested_at,
    'state', case when v->>'state' ~ '^[a-z_]{1,40}$' then v->>'state' end,
    'checkedAt', v->>'checkedAt',
    'period', case when v->>'period' ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then v->>'period' end,
    'code', case when v->>'code' ~ '^[a-z0-9_]{1,100}$' then v->>'code' end,
    'sourceReady', v->'sourceReady',
    'googleReady', v->'googleReady',
    'databaseReady', v->'databaseReady',
    'confirmed', v#>'{confirmed}',
    'workingSheetLinked', v#>'{workingSheetLinked}',
    'issues', case when jsonb_typeof(v->'issues') = 'array' then v->'issues'
      else '[]'::jsonb end);
end $$;

-- ---------------------------------------------------------------- grants
-- service_role only. No end user, and nothing here is reachable via PostgREST by anon or an
-- authenticated operator. The read-only property of the MCP tool surface is additionally
-- enforced in the Edge Function by a frozen tool->RPC map (step 3) plus an allowlist test
-- (step 4); see docs/PHASE_2B3_MVP_SPEC.md §2.1 for why both layers exist.
revoke all on function
  public.battle_pass_mcp_status(),
  public.battle_pass_mcp_recent_runs(integer),
  public.battle_pass_mcp_error_code(text),
  public.battle_pass_mcp_code_count(text, integer),
  public.battle_pass_mcp_readiness()
  from public, anon, authenticated;
grant execute on function
  public.battle_pass_mcp_status(),
  public.battle_pass_mcp_recent_runs(integer),
  public.battle_pass_mcp_error_code(text),
  public.battle_pass_mcp_code_count(text, integer),
  public.battle_pass_mcp_readiness()
  to service_role;

notify pgrst,'reload schema';
commit;
