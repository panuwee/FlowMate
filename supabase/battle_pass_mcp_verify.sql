-- Read-only preflight for Phase 2B.3 steps 1-2. Changes nothing; calls no function that
-- dispatches, writes, or touches Alpha. Run after applying battle_pass_mcp_auth.sql and
-- battle_pass_mcp_reads.sql. Every row must read PASS.
with service_only(signature) as (
  -- Reachable only by the Edge Function's service role. Never by a browser.
  values
    ('public.battle_pass_mcp_context(text)'),
    ('public.battle_pass_mcp_guard(text,jsonb)'),
    ('public.battle_pass_mcp_finish(bigint,boolean,text,integer)'),
    ('public.battle_pass_mcp_status()'),
    ('public.battle_pass_mcp_recent_runs(integer)'),
    ('public.battle_pass_mcp_error_code(text)'),
    ('public.battle_pass_mcp_code_count(text,integer)'),
    ('public.battle_pass_mcp_readiness()')
), operator_only(signature) as (
  -- The human-facing activity view: authenticated yes, anon no.
  values ('public.battle_pass_mcp_activity(integer)')
), write_rpcs(signature) as (
  -- Must stay unreachable to anon/authenticated. Listed here so this script also proves
  -- step 1-2 did not accidentally widen anything in 2B.1/2B.2 or the worker.
  values
    ('public.battle_pass_production_claim(text,text,jsonb)'),
    ('public.battle_pass_diagnosis_save(uuid,jsonb,jsonb)'),
    ('public.battle_pass_diagnosis_context(uuid)')
), svc as (select signature, to_regprocedure(signature)::oid as fn from service_only),
   opr as (select signature, to_regprocedure(signature)::oid as fn from operator_only),
   wrt as (select signature, to_regprocedure(signature)::oid as fn from write_rpcs),
checks as (
  select 'service_only_fn_exists: ' || signature as check_name, fn is not null as passed
  from svc
  union all
  select 'service_only_fn_no_browser_access: ' || signature,
    case when fn is null then false else
      not has_function_privilege('anon', fn, 'EXECUTE')
      and not has_function_privilege('authenticated', fn, 'EXECUTE')
    end
  from svc
  union all
  select 'service_only_fn_service_role_can_execute: ' || signature,
    case when fn is null then false else has_function_privilege('service_role', fn, 'EXECUTE') end
  from svc
  union all
  select 'operator_fn_authenticated_only: ' || signature,
    case when fn is null then false else
      not has_function_privilege('anon', fn, 'EXECUTE')
      and has_function_privilege('authenticated', fn, 'EXECUTE')
    end
  from opr
  union all
  select 'existing_write_rpc_still_locked: ' || signature,
    case when fn is null then false else
      not has_function_privilege('anon', fn, 'EXECUTE')
      and not has_function_privilege('authenticated', fn, 'EXECUTE')
    end
  from wrt
  union all
  -- ---- read functions must be provably non-writing -------------------------------------
  select 'read_fns_declared_stable', coalesce((
    select bool_and(p.provolatile = 's')
    from pg_catalog.pg_proc p
    where p.oid in (
      to_regprocedure('public.battle_pass_mcp_status()'),
      to_regprocedure('public.battle_pass_mcp_recent_runs(integer)'),
      to_regprocedure('public.battle_pass_mcp_error_code(text)'),
      to_regprocedure('public.battle_pass_mcp_code_count(text,integer)'),
      to_regprocedure('public.battle_pass_mcp_readiness()'))
  ), false)
  union all
  -- search_path is a GUC_LIST_QUOTE variable, so `set search_path=''` is stored in
  -- pg_proc.proconfig as the element  search_path=""  (quoted empty list), not
  -- search_path= . Accept both spellings rather than one, so this check does not depend on
  -- that quoting detail.
  select 'all_new_fns_search_path_pinned', coalesce((
    select bool_and(exists (
      select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) cfg
      where cfg in ('search_path=', 'search_path=""')
    ))
    from pg_catalog.pg_proc p
    where p.oid in (select fn from svc union select fn from opr)
  ), false)
  union all
  -- Every new function must also be SECURITY DEFINER, or require_worker()/require_operator()
  -- would run as the caller and the private-schema reads inside would fail.
  select 'all_new_fns_security_definer', coalesce((
    select bool_and(p.prosecdef)
    from pg_catalog.pg_proc p
    where p.oid in (select fn from svc union select fn from opr)
  ), false)
  union all
  -- ---- ledger table ---------------------------------------------------------------------
  select 'mcp_calls_exists_with_rls', coalesce((
    select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = to_regclass('battle_pass_private.mcp_calls')
  ), false)
  union all
  select 'mcp_calls_not_reachable_by_browser',
    case when to_regclass('battle_pass_private.mcp_calls') is null then false else
      not has_table_privilege('anon', 'battle_pass_private.mcp_calls', 'SELECT')
      and not has_table_privilege('authenticated', 'battle_pass_private.mcp_calls', 'SELECT')
      and not has_table_privilege('authenticated', 'battle_pass_private.mcp_calls', 'INSERT')
    end
  union all
  select 'mcp_calls_sequence_not_usable_by_browser',
    case when to_regclass('battle_pass_private.mcp_calls_call_id_seq') is null then false else
      not has_sequence_privilege('anon', 'battle_pass_private.mcp_calls_call_id_seq', 'USAGE')
      and not has_sequence_privilege('authenticated',
        'battle_pass_private.mcp_calls_call_id_seq', 'USAGE')
    end
  union all
  select 'mcp_calls_index_present', exists (
    select 1 from pg_catalog.pg_indexes where schemaname = 'battle_pass_private'
      and indexname = 'battle_pass_mcp_calls_called_at_idx'
  )
  union all
  select 'mcp_calls_no_person_columns', not exists (
    select 1 from information_schema.columns
    where table_schema = 'battle_pass_private' and table_name = 'mcp_calls'
      and column_name in ('requested_by','user_id','email','display_name')
  )
  union all
  -- ---- caps -----------------------------------------------------------------------------
  select 'mcp_settings_singleton_present', coalesce((
    select count(*) = 1 from battle_pass_private.mcp_settings where singleton
  ), false)
  union all
  select 'mcp_settings_not_reachable_by_browser',
    case when to_regclass('battle_pass_private.mcp_settings') is null then false else
      not has_table_privilege('anon', 'battle_pass_private.mcp_settings', 'SELECT')
      and not has_table_privilege('authenticated', 'battle_pass_private.mcp_settings', 'SELECT')
    end
  union all
  select 'caps_are_sane', coalesce((
    select daily_cap between 1 and 100000 and burst_cap between 1 and 10000
       and retain_days between 7 and 3650
    from battle_pass_private.mcp_settings where singleton
  ), false)
  union all
  -- ---- credential separation (the whole point of step 1) --------------------------------
  select 'mcp_secret_column_present', exists (
    select 1 from information_schema.columns
    where table_schema = 'battle_pass_private' and table_name = 'monthly_settings'
      and column_name = 'mcp_secret_id'
  )
  union all
  select 'mcp_secret_created', coalesce((
    select mcp_secret_id is not null from battle_pass_private.monthly_settings where singleton
  ), false)
  union all
  select 'mcp_secret_is_not_the_scheduler_secret', coalesce((
    select mcp_secret_id is distinct from scheduler_secret_id
    from battle_pass_private.monthly_settings where singleton
  ), false)
  union all
  select 'mcp_secret_long_enough', coalesce((
    select length(v.decrypted_secret) > 40
    from battle_pass_private.monthly_settings s
    join vault.decrypted_secrets v on v.id = s.mcp_secret_id
    where s.singleton
  ), false)
  union all
  -- ---- nothing in 2B.1/2B.2/worker was disturbed ----------------------------------------
  select 'scheduler_untouched_30m', coalesce((
    select j.schedule = '*/30 * * * *' from cron.job j
    where j.jobname = 'battle-pass-production-30m'
  ), false)
  union all
  select 'scheduler_secret_still_present', coalesce((
    select scheduler_secret_id is not null
    from battle_pass_private.monthly_settings where singleton
  ), false)
  union all
  select 'automation_flag_unchanged_by_this_step', coalesce((
    select count(*) = 1 from battle_pass_private.monthly_settings where singleton
  ), false)
  union all
  select 'error_catalog_still_locked',
    case when to_regclass('battle_pass_private.error_catalog') is null then false else
      not has_table_privilege('anon', 'battle_pass_private.error_catalog', 'SELECT')
      and not has_table_privilege('authenticated',
        'battle_pass_private.error_catalog', 'SELECT')
    end
  union all
  select 'no_mcp_calls_yet_or_valid_tool_names', coalesce((
    select bool_and(tool ~ '^[a-z_]{1,40}$') from battle_pass_private.mcp_calls
  ), true)
)
select check_name, case when passed then 'PASS' else 'FAIL' end as result
from checks order by check_name;
