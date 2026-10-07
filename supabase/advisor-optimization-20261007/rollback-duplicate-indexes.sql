-- Restores only the two removed redundant indexes. Run after reviewing scope.
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';
CREATE INDEX idx_assignment_runs_item_ran ON public.assignment_runs (work_item_id, ran_at DESC);
CREATE UNIQUE INDEX creative_seatalk_thread_group_thread_key ON private.creative_seatalk_threads (group_id, thread_id);
COMMIT;
