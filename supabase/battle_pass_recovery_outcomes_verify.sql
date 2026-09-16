-- Verification for battle_pass_recovery_outcomes.sql.
--
-- Creates no fixtures, inserts no production row, induces no failure, and does not wait for a
-- real October incident. Every behavioural assertion is on the two PURE rule functions, which
-- is the entire reason they were split out of the observer - the same technique
-- battle_pass_recovery_retry_verify.sql uses to prove retry_reason's mapping.
--
-- Run: psql -f battle_pass_recovery_outcomes_verify.sql
-- Expect: the NOTICE block at the end. Any failure raises and aborts.

-- ================================================================ A. classification rules
do $$
declare
  v jsonb;
  v_n integer;
begin
  -- A1. a rejection is terminal immediately and is never "pending observation"
  v := battle_pass_private.recovery_outcome_of(
    'rejected', false, false, null, false, false, false, false, null, null, 0);
  if v->>'outcome' <> 'not_executed' then raise exception 'A1 outcome: %', v; end if;
  if (v->>'terminal')::boolean is not true then raise exception 'A1 terminal'; end if;
  -- and a rejection stays not_executed even if the period later completes on its own, because
  -- the classifier is asked about the DECISION, not about the period
  v := battle_pass_private.recovery_outcome_of(
    'rejected', true, true, 'complete', false, false, false, true, 'x', 'x', 10);
  if v->>'outcome' <> 'not_executed' then
    raise exception 'A1 a rejection must not be credited with a later completion: %', v;
  end if;

  -- A2. broken evidence chain: inconclusive, never failure
  v := battle_pass_private.recovery_outcome_of(
    'approved', false, false, null, false, false, false, false, null, null, 100);
  if v->>'outcome' <> 'inconclusive' or v->>'reason' <> 'run_row_missing' then
    raise exception 'A2 missing run: %', v; end if;
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, false, 'failed', false, false, false, true, 'a', 'a', 100);
  if v->>'outcome' <> 'inconclusive' or v->>'reason' <> 'run_row_replaced' then
    raise exception 'A2 replaced run must not be read as a failure: %', v; end if;

  -- A3. success is state=complete and nothing else
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'complete', false, false, false, true, null, null, 30);
  if v->>'outcome' <> 'succeeded' or (v->>'terminal')::boolean is not true then
    raise exception 'A3: %', v; end if;
  -- a queued/running retry is NOT success - the roadmap's "requestId means queued only"
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'running', false, false, true, true, null, null, 30);
  if v->>'outcome' = 'succeeded' then raise exception 'A3 running counted as success: %', v; end if;

  -- A4. holds. Both shapes are terminal, and they are distinguishable.
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'failed', true, false, false, false, null, null, 60);
  if v->>'outcome' <> 'still_held' or v->>'reason' <> 'hold_present' then
    raise exception 'A4 hold: %', v; end if;
  -- the {"hold":null} shape: retry was allowed, claim() will refuse. Named, not left pending.
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'failed', true, true, false, false, null, null, 60);
  if v->>'reason' <> 'hold_key_null_value' then
    raise exception 'A4 the null-value hold must be named: %', v; end if;

  -- A5. failure needs a NEW tick. Same-code vs different-code is the guard 12 input.
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'failed', false, false, false, true, 'validation_failed',
    'validation_failed', 300);
  if v->>'outcome' <> 'failed_same_code' then raise exception 'A5 same: %', v; end if;
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'failed', false, false, false, true, 'sheet_locked',
    'validation_failed', 300);
  if v->>'outcome' <> 'failed_different_code' then raise exception 'A5 different: %', v; end if;
  -- both codes unknown: treated as the same failure, not as a new one. Stated so the choice
  -- is visible - it makes guard 12 more conservative, which is the safe direction.
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'failed', false, false, false, true, null, null, 300);
  if v->>'outcome' <> 'failed_same_code' then raise exception 'A5 both null: %', v; end if;

  -- A6. THE MOST IMPORTANT ASSERTION IN THIS FILE.
  -- A run still sitting in 'failed' with NO new tick is the state we diagnosed, not evidence
  -- that the retry failed. Before the window it is pending; after it, inconclusive. If this
  -- ever returns failed_*, every guard-12 statistic built on this log is inflated.
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'failed', false, false, false, false, 'validation_failed',
    'validation_failed', 300);
  if v->>'outcome' <> 'pending' or v->>'reason' <> 'awaiting_tick' then
    raise exception 'A6 stale failed state read as a retry failure: %', v; end if;
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'failed', false, false, false, false, 'validation_failed',
    'validation_failed', 86400);
  if v->>'outcome' <> 'inconclusive' or v->>'reason' <> 'no_tick_in_window' then
    raise exception 'A6 timeout must be inconclusive, not failure: %', v; end if;

  -- A7. lease active is pending and NOT terminal - the one non-terminal verdict that must
  -- stay non-terminal, or the observer stops watching a run that is still working
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'running', false, false, true, true, null, null, 120);
  if v->>'outcome' <> 'pending' or (v->>'terminal')::boolean is not false then
    raise exception 'A7: %', v; end if;

  -- A8. window boundary, and the reason varies with whether a tick was ever seen
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'running', false, false, false, true, 'x', 'x', 86399);
  if v->>'outcome' <> 'pending' then raise exception 'A8 just inside: %', v; end if;
  v := battle_pass_private.recovery_outcome_of(
    'approved', true, true, 'running', false, false, false, true, 'x', 'x', 86400);
  if v->>'outcome' <> 'inconclusive'
     or v->>'reason' <> 'no_terminal_state_in_window' then
    raise exception 'A8 at the boundary: %', v; end if;

  -- A9. precedence, asserted rather than assumed: complete > hold > lease > fresh failure
  if battle_pass_private.recovery_outcome_of(
       'approved', true, true, 'complete', true, false, true, true, 'a', 'a', 10)
     ->>'outcome' <> 'succeeded' then raise exception 'A9 complete must outrank hold'; end if;
  if battle_pass_private.recovery_outcome_of(
       'approved', true, true, 'failed', true, false, true, true, 'a', 'a', 10)
     ->>'outcome' <> 'still_held' then raise exception 'A9 hold must outrank lease'; end if;
  -- a hold is terminal even years later: the window must not turn it into inconclusive
  if battle_pass_private.recovery_outcome_of(
       'approved', true, true, 'failed', true, false, false, false, null, null, 8640000)
     ->>'outcome' <> 'still_held' then raise exception 'A9 hold must outrank the window'; end if;

  -- A10. exhaustive sweep of all 768 input combinations. Asserts INVARIANTS, not specific
  -- verdicts, so it keeps its meaning if a branch is added later. These four are the
  -- properties every metric built on this log depends on.
  select count(*) into v_n
  from (values (true),(false)) a(rf), (values (true),(false)) b(rm),
       (values ('running'),('failed'),('complete')) c(st),
       (values (true),(false)) d(hd), (values (true),(false)) e(hn),
       (values (true),(false)) f(la), (values (true),(false)) g(tk),
       (values ('base'),('other')) h(tc), (values (0),(86400)) i(el),
       lateral (select battle_pass_private.recovery_outcome_of(
         'approved', a.rf, b.rm, c.st, d.hd, e.hn, f.la, g.tk, h.tc, 'base', i.el) as r) x
  where -- 1: failure is never claimed without a fresh tick AND state='failed'
        (left(x.r->>'outcome', 7) = 'failed_' and not (g.tk and c.st = 'failed'))
        -- 2: success is never claimed for anything but state='complete'
     or (x.r->>'outcome' = 'succeeded' and c.st <> 'complete')
        -- 3: 'pending' is the only non-terminal verdict, so the observer's terminality skip
        --    can never strand a decision that is still progressing
     or ((x.r->>'terminal')::boolean is false and x.r->>'outcome' <> 'pending')
        -- 4: a verdict is always complete - no null outcome, terminality or reason
     or x.r->>'outcome' is null or x.r->>'terminal' is null or x.r->>'reason' is null;
  if v_n > 0 then
    raise exception 'A10 % of 768 combinations violate a classification invariant', v_n;
  end if;

  raise notice 'A. classification rules: PASS (10 groups, 768-combination invariant sweep)';
end $$;

-- ================================================================ B. attribution rules
do $$
declare v_n integer;
begin
  -- B1. no tick after the decision means nothing can be credited
  if battle_pass_private.recovery_attribution_of(false, 5, 0) <> 'none'
    then raise exception 'B1'; end if;
  -- ...and that holds regardless of what else is true
  if battle_pass_private.recovery_attribution_of(false, null, 3) <> 'none'
    then raise exception 'B1 competing'; end if;

  -- B2. a competing retry/run_now makes the credit ambiguous even for an immediate tick.
  -- This is the anti-inflation rule: two operators pressing retry cannot both be credited.
  if battle_pass_private.recovery_attribution_of(true, 1, 1) <> 'ambiguous'
    then raise exception 'B2'; end if;

  -- B3. the 10-minute boundary, both sides
  if battle_pass_private.recovery_attribution_of(true, 600, 0) <> 'exact'
    then raise exception 'B3 at 600 must be exact'; end if;
  if battle_pass_private.recovery_attribution_of(true, 601, 0) <> 'ambiguous'
    then raise exception 'B3 past 600 must be ambiguous - the 30-minute scheduler is '
      'indistinguishable out there'; end if;

  -- B4. unknown lag defaults to ambiguous, never exact
  if battle_pass_private.recovery_attribution_of(true, null, 0) <> 'ambiguous'
    then raise exception 'B4'; end if;

  -- B5. invariant: 'exact' requires a fresh tick, zero competing actions, and a known lag
  -- inside the window. Swept rather than argued.
  select count(*) into v_n
  from (select battle_pass_private.recovery_attribution_of(tk, lag, comp) as a, tk, lag, comp
        from (values (true),(false)) x(tk),
             (values (0),(600),(601),(null)) y(lag),
             (values (0),(1),(5)) z(comp)) s
  where s.a = 'exact'
    and not (s.tk and coalesce(s.comp,0) = 0 and s.lag is not null and s.lag <= 600);
  if v_n > 0 then raise exception 'B5 % combinations credit a retry they should not', v_n; end if;

  raise notice 'B. attribution rules: PASS (5 groups, 24-combination invariant sweep)';
end $$;

-- ================================================================ C. structure and privilege
do $$
declare v_n integer; v_active boolean; v_names text;
begin
  -- C1. the log exists with RLS on and is revoked from every client role
  if not exists (select 1 from pg_tables
    where schemaname = 'battle_pass_private' and tablename = 'recovery_outcomes' and rowsecurity)
  then raise exception 'C1 recovery_outcomes missing or RLS off'; end if;

  for v_n in select 1 from (values ('anon'),('authenticated'),('service_role')) r(role_name)
    where has_table_privilege(r.role_name,
      'battle_pass_private.recovery_outcomes', 'select, insert, update, delete')
  loop
    raise exception 'C1 a client role can reach the log table directly';
  end loop;

  -- C2. the append-only claim. The observer has no UPDATE or DELETE path, so assert that no
  -- function in this surface contains one against the log - the cheap structural version of
  -- "append-only", which nothing in Postgres enforces for us here.
  select count(*) into v_n
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','battle_pass_private')
    -- pg_proc also contains aggregates (for example array_agg).  Their OIDs are
    -- not valid input for pg_get_functiondef(), so inspect ordinary functions only.
    and p.prokind = 'f'
    and (strpos(pg_get_functiondef(p.oid), 'update battle_pass_private.recovery_outcomes') > 0
      or strpos(pg_get_functiondef(p.oid), 'delete from battle_pass_private.recovery_outcomes') > 0);
  if v_n > 0 then
    raise exception 'C2 % function(s) mutate the outcome log - it must be append-only', v_n;
  end if;

  -- C3. nothing here may touch recovery state. The whole safety claim of this slice.
  -- Matched on CALL SYNTAX, not on bare words: 'dispatch' or 'battle_pass_retry' appearing in
  -- a body comment is not a call, and a check that fails on prose gets switched off by the
  -- next person who hits it.
  select count(*), string_agg(p.proname, ', ' order by p.proname) into v_n, v_names
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','battle_pass_private')
    and p.prokind = 'f'
    and p.proname in ('recovery_observe_one','recovery_observe_open',
                      'battle_pass_recovery_observe','battle_pass_recovery_outcomes')
    and (strpos(pg_get_functiondef(p.oid), 'public.battle_pass_retry(') > 0
      or strpos(pg_get_functiondef(p.oid), 'battle_pass_private.dispatch(') > 0
      or strpos(pg_get_functiondef(p.oid), 'update battle_pass_private.monthly_runs') > 0
      or strpos(pg_get_functiondef(p.oid), 'update battle_pass_private.recovery_decisions') > 0
      or strpos(pg_get_functiondef(p.oid), 'insert into battle_pass_private.recovery_decisions') > 0
      or strpos(pg_get_functiondef(p.oid), 'insert into battle_pass_private.production_ticks') > 0);
  if v_n > 0 then
    raise exception 'C3 the outcome log can affect recovery state, via: % - that is the one '
      'thing it must never do', v_names;
  end if;

  -- C4. grants: the two public RPCs to authenticated only; everything private to nobody
  if not has_function_privilege('authenticated',
       'public.battle_pass_recovery_observe(integer)', 'execute')
    then raise exception 'C4 operator cannot call observe()'; end if;
  if not has_function_privilege('authenticated',
       'public.battle_pass_recovery_outcomes(integer)', 'execute')
    then raise exception 'C4 operator cannot read outcomes()'; end if;
  -- service_role is the MCP/worker identity. It must not reach either: this log is an
  -- operator surface, and 2B.5 adds no MCP tool.
  if has_function_privilege('service_role',
       'public.battle_pass_recovery_observe(integer)', 'execute')
     or has_function_privilege('service_role',
       'public.battle_pass_recovery_outcomes(integer)', 'execute')
    then raise exception 'C4 service_role can reach the outcome RPCs - no MCP tool was '
      'intended in this slice'; end if;
  if has_function_privilege('anon', 'public.battle_pass_recovery_outcomes(integer)', 'execute')
    then raise exception 'C4 anon'; end if;
  for v_n in select 1 from (values
      ('battle_pass_private.recovery_observe_one(bigint,text)'),
      ('battle_pass_private.recovery_observe_open(text,integer)'),
      ('battle_pass_private.recovery_attribution_of(boolean,integer,integer)')) f(sig)
    where has_function_privilege('authenticated', f.sig, 'execute')
       or has_function_privilege('service_role', f.sig, 'execute')
       or has_function_privilege('anon', f.sig, 'execute')
  loop
    raise exception 'C4 a private function is directly reachable';
  end loop;

  -- C5. volatility: the read RPC must be STABLE (so Postgres itself refuses a write inside
  -- it), the observer must not be
  if (select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'battle_pass_recovery_outcomes') <> 's'
    then raise exception 'C5 the read RPC must be STABLE'; end if;
  if (select p.provolatile from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'battle_pass_private' and p.proname = 'recovery_outcome_of') <> 'i'
    then raise exception 'C5 the classification rule must be IMMUTABLE'; end if;

  -- C6. the poller ships PAUSED, like battle-pass-production-30m does
  select j.active into v_active from cron.job j
    where j.jobname = 'battle-pass-recovery-observe-10m';
  if v_active is null then raise exception 'C6 the poller job was not registered'; end if;
  if v_active then
    raise warning 'C6 the poller is ACTIVE. That is a valid configuration, but it was '
      'installed paused - confirm someone enabled it deliberately.';
  else
    raise notice 'C6 poller registered and paused, as installed';
  end if;

  -- C7. foreign key to the decision log, so an observation can never float free of a decision
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'battle_pass_private' and t.relname = 'recovery_outcomes'
      and c.contype = 'f')
  then raise exception 'C7 no FK from recovery_outcomes to recovery_decisions'; end if;

  raise notice 'C. structure and privilege: PASS';
end $$;

-- ================================================================ D. coverage snapshot
-- Not an assertion. Reports what the log currently knows, which before the first production
-- period (2026-10) is correctly nothing. Its value is as the baseline the roadmap's §13 asks
-- to start collecting from decision one rather than at 2B.9.
do $$
declare v_dec integer; v_obs integer; v_term integer; v_exact integer;
begin
  select count(*) into v_dec from battle_pass_private.recovery_decisions;
  select count(*) into v_obs from battle_pass_private.recovery_outcomes;
  select count(distinct decision_id) into v_term
    from battle_pass_private.recovery_outcomes where terminal;
  select count(*) into v_exact
    from battle_pass_private.recovery_outcomes where terminal and attribution = 'exact';

  raise notice '--------------------------------------------------------------';
  raise notice 'D. coverage: % decision(s), % observation(s), % with a terminal verdict',
    v_dec, v_obs, v_term;
  raise notice '   exactly-attributed terminal observations: %', v_exact;
  if v_dec = 0 then
    raise notice '   0 decisions is the expected state before the 2026-10 production period.';
    raise notice '   Nothing to revisit guard 9/10/12 against yet - that is the point of';
    raise notice '   installing the collector now rather than after the fact.';
  elsif v_term < v_dec then
    raise notice '   % decision(s) have no terminal verdict yet - run',
      v_dec - v_term;
    raise notice '   select battle_pass_private.recovery_observe_open(''manual'', 50);';
  end if;
  raise notice '--------------------------------------------------------------';
  raise notice 'battle_pass_recovery_outcomes_verify: PASS';
end $$;
