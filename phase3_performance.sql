-- ===========================================================================
-- FlowMate — Phase 3 performance (run in the Supabase SQL Editor)
-- ---------------------------------------------------------------------------
-- Idempotent; safe to re-run. RUN THIS BEFORE uploading the Phase 3 frontend
-- (the list loader prefers the view below, but falls back to the raw table if
-- it is missing, so order is not strictly required).
--
--   O-5  latest_assignment_run_v — one row per work item (latest run) so the
--        list loader no longer transfers the entire assignment_runs history
--        just to label each card's last run.
--   O-8  composite/partial indexes for the hottest filters (owner+status,
--        type+status, active due-date ordering).
-- ===========================================================================

-- --- O-5: deduped latest-assignment-run view -------------------------------
create or replace view public.latest_assignment_run_v
with (security_invoker = true) as
select distinct on (work_item_id)
  work_item_id,
  ran_at,
  result,
  reason
from public.assignment_runs
order by work_item_id, ran_at desc;

-- Respect the project's view-access model (anon cannot read; authenticated can,
-- subject to the caller's RLS on assignment_runs via security_invoker).
revoke all privileges on public.latest_assignment_run_v from public, anon, authenticated;
grant select on public.latest_assignment_run_v to authenticated;

-- --- O-8: indexes for the hottest query shapes -----------------------------
-- member_workload_v: owned, non-archived items grouped by status.
create index if not exists idx_work_items_owner_status
  on public.work_items (final_owner_member_id, status)
  where archived_at is null;

-- Queue drain / status filters: work_type + status (e.g. queued creatives).
create index if not exists idx_work_items_type_status
  on public.work_items (work_type, status);

-- List loader: active rows ordered by due date.
create index if not exists idx_work_items_active_due
  on public.work_items (due_date)
  where archived_at is null;

-- assignment_runs: latest-per-item lookup feeding the view above.
create index if not exists idx_assignment_runs_item_ran
  on public.assignment_runs (work_item_id, ran_at desc);

-- --- Verify (optional) ------------------------------------------------------
--   select * from public.latest_assignment_run_v limit 5;
--   select indexname from pg_indexes
--    where schemaname = 'public' and tablename = 'work_items'
--      and indexname like 'idx_work_items_%';
