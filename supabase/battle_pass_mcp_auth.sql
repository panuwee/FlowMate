-- Phase 2B.3 step 1: MCP reader credential + call ledger + rate-limit guard.
--
-- Additive only. Does not dispatch, does not touch monthly_settings.enabled, does not touch
-- cron, does not alter any 2B.1/2B.2 object. Nothing created here is reachable by anon or
-- authenticated, and nothing is reachable at all until the bp-mcp Edge Function is deployed.
--
-- The credential created here is DELIBERATELY SEPARATE from scheduler_secret_id. That secret
-- is the HTTP entry credential for the production worker (production-runner.ts) and for
-- ai-diagnosis; presenting it to the worker URL starts a real production run. The MCP reader
-- token must never carry that power, and must be rotatable without disturbing the cron worker.
-- See docs/PHASE_2B3_MVP_SPEC.md §5.1.
begin;

-- ---------------------------------------------------------------- credential
alter table battle_pass_private.monthly_settings
  add column if not exists mcp_secret_id uuid;

-- Generated in the vault; the value never appears in this file, in any log, or in any
-- function's return. Re-runnable: a second apply does not rotate the secret.
do $$ declare s uuid; begin
  if not exists (select 1 from battle_pass_private.monthly_settings
                 where singleton and mcp_secret_id is not null) then
    select vault.create_secret(
      gen_random_uuid()::text || gen_random_uuid()::text,
      'battle-pass-mcp-reader',
      'Read-only MCP tool access for Alpha Intelligence. Grants no write path.') into s;
    update battle_pass_private.monthly_settings set mcp_secret_id = s where singleton;
  end if;
end $$;

-- Verifies the bearer token an MCP client presents. Read-only by construction: it returns a
-- scope label and the automation flag, and nothing that identifies a person or a Google asset.
create or replace function public.battle_pass_mcp_context(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  perform battle_pass_private.require_worker();
  if not exists (
    select 1 from battle_pass_private.monthly_settings s
    join vault.decrypted_secrets v on v.id = s.mcp_secret_id
    where s.singleton and v.decrypted_secret = p_token and length(p_token) > 40
  ) then raise exception 'Invalid MCP credential' using errcode='42501'; end if;
  return jsonb_build_object(
    'scope', 'read',
    'enabled', (select s.enabled from battle_pass_private.monthly_settings s where s.singleton));
end $$;
revoke all on function public.battle_pass_mcp_context(text) from public, anon, authenticated;
grant execute on function public.battle_pass_mcp_context(text) to service_role;

-- ---------------------------------------------------------------- call ledger
-- No requested_by column: there is no Supabase user in this path, and an Alpha-supplied
-- identity would be an unverified claim. What is knowable is "the token holder called tool X".
create table if not exists battle_pass_private.mcp_calls (
  call_id     bigserial primary key,
  called_at   timestamptz not null default clock_timestamp(),
  tool        text not null check (tool ~ '^[a-z_]{1,40}$'),
  args        jsonb not null default '{}'::jsonb,
  ok          boolean,                                    -- null = in flight
  error_code  text check (error_code ~ '^[a-z0-9_]{1,50}$'),
  latency_ms  integer
);
create index if not exists battle_pass_mcp_calls_called_at_idx
  on battle_pass_private.mcp_calls (called_at desc, call_id desc);
alter table battle_pass_private.mcp_calls enable row level security;
revoke all on battle_pass_private.mcp_calls from public, anon, authenticated;
revoke all on sequence battle_pass_private.mcp_calls_call_id_seq
  from public, anon, authenticated;

-- ---------------------------------------------------------------- caps
create table if not exists battle_pass_private.mcp_settings (
  singleton  boolean primary key default true check (singleton),
  daily_cap  integer not null default 300 check (daily_cap between 1 and 100000),
  burst_cap  integer not null default 30  check (burst_cap between 1 and 10000),
  retain_days integer not null default 90 check (retain_days between 7 and 3650)
);
insert into battle_pass_private.mcp_settings (singleton) values (true) on conflict do nothing;
alter table battle_pass_private.mcp_settings enable row level security;
revoke all on battle_pass_private.mcp_settings from public, anon, authenticated;

-- ---------------------------------------------------------------- guard (call this FIRST)
-- Enforces both caps BEFORE the tool's read runs, which is the only ordering that actually
-- limits load. Returns a call_id to pass to battle_pass_mcp_finish(). A refusal is still
-- recorded, so a looping client is visible in the ledger rather than silently dropped.
create or replace function public.battle_pass_mcp_guard(p_tool text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_cfg battle_pass_private.mcp_settings%rowtype;
  v_args jsonb; v_day integer; v_min integer; v_reason text; v_id bigint;
begin
  perform battle_pass_private.require_worker();
  if p_tool !~ '^[a-z_]{1,40}$' then raise exception 'Invalid tool name'; end if;

  select * into v_cfg from battle_pass_private.mcp_settings where singleton;

  -- Args are logged for audit, not replayed. Keep them small and object-shaped.
  v_args := case
    when jsonb_typeof(coalesce(p_args,'null'::jsonb)) <> 'object' then '{}'::jsonb
    when octet_length(p_args::text) > 2000 then jsonb_build_object('truncated', true)
    else p_args end;

  -- Opportunistic retention pruning: cheaper than a cron job, and constraint #2 forbids
  -- adding one. Runs on roughly 1 call in 50.
  if random() < 0.02 then
    delete from battle_pass_private.mcp_calls
      where called_at < clock_timestamp() - make_interval(days => v_cfg.retain_days);
  end if;

  select count(*) into v_day from battle_pass_private.mcp_calls
    where called_at >= date_trunc('day', clock_timestamp());
  select count(*) into v_min from battle_pass_private.mcp_calls
    where called_at >= clock_timestamp() - interval '1 minute';

  v_reason := case
    when v_day >= v_cfg.daily_cap then 'rate_limited_daily'
    when v_min >= v_cfg.burst_cap then 'rate_limited_burst' end;

  insert into battle_pass_private.mcp_calls (tool, args, ok, error_code)
  values (p_tool, v_args, case when v_reason is null then null else false end, v_reason)
  returning call_id into v_id;

  return jsonb_build_object(
    'callId', v_id::text,
    'allowed', v_reason is null,
    'reason', v_reason,
    'callsToday', v_day,
    'dailyCap', v_cfg.daily_cap);
end $$;
revoke all on function public.battle_pass_mcp_guard(text, jsonb) from public, anon, authenticated;
grant execute on function public.battle_pass_mcp_guard(text, jsonb) to service_role;

-- ---------------------------------------------------------------- finish
create or replace function public.battle_pass_mcp_finish(
  p_call_id bigint, p_ok boolean, p_error text default null, p_latency integer default null)
returns void language plpgsql security definer set search_path='' as $$ begin
  perform battle_pass_private.require_worker();
  update battle_pass_private.mcp_calls set
    ok = coalesce(p_ok, false),
    -- Only ever a code from our own safe list; never provider or Postgres text.
    error_code = coalesce(error_code,
      case when p_error ~ '^[a-z0-9_]{1,50}$' then p_error end),
    latency_ms = case when p_latency between 0 and 999999999 then p_latency end
  where call_id = p_call_id and ok is null;
end $$;
revoke all on function public.battle_pass_mcp_finish(bigint, boolean, text, integer)
  from public, anon, authenticated;
grant execute on function public.battle_pass_mcp_finish(bigint, boolean, text, integer)
  to service_role;

-- ---------------------------------------------------------------- operator view
-- Lets a human see MCP traffic from the FlowMate UI without exposing the ledger table.
-- Deliberately granted to authenticated (operators), not to the MCP path itself.
create or replace function public.battle_pass_mcp_activity(p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare n integer; result jsonb; v_cfg battle_pass_private.mcp_settings%rowtype;
begin
  perform battle_pass_private.require_operator();
  select * into v_cfg from battle_pass_private.mcp_settings where singleton;
  n := least(greatest(coalesce(p_limit,50),1),200);
  select coalesce(jsonb_agg(jsonb_build_object(
      'callId', c.call_id::text, 'calledAt', c.called_at, 'tool', c.tool,
      'args', c.args, 'ok', c.ok, 'errorCode', c.error_code, 'latencyMs', c.latency_ms
    ) order by c.called_at desc, c.call_id desc), '[]'::jsonb)
  into result
  from (
    select call_id, called_at, tool, args, ok, error_code, latency_ms
    from battle_pass_private.mcp_calls
    order by called_at desc, call_id desc limit n
  ) c;
  return jsonb_build_object(
    'observedAt', current_timestamp,
    'callsToday', (select count(*) from battle_pass_private.mcp_calls
                   where called_at >= date_trunc('day', clock_timestamp())),
    'dailyCap', v_cfg.daily_cap,
    'burstCap', v_cfg.burst_cap,
    'calls', result);
end $$;
revoke all on function public.battle_pass_mcp_activity(integer) from public, anon;
grant execute on function public.battle_pass_mcp_activity(integer) to authenticated;

notify pgrst,'reload schema';
commit;
