-- Read-only. Save two results 30-60 minutes apart; do not reset statistics.
-- Compare by queryid and role. Use delta(total_exec_time)/delta(calls), not
-- the cumulative mean, and discard comparisons across stats_reset changes.
SELECT now() AS observed_at, i.stats_reset, s.queryid::text, r.rolname,
       s.calls, s.total_exec_time, s.mean_exec_time, s.rows,
       s.shared_blks_hit, s.shared_blks_read,
       md5(s.query) AS query_fingerprint,
       CASE
         WHEN s.query LIKE '%"public"."work_item_events"%' THEN 'work_item_events'
         WHEN s.query LIKE '%"public"."marketing_plan_timeline_v"%' THEN 'marketing_plan_timeline'
         WHEN s.query LIKE '%"public"."work_items"%' THEN 'work_items'
         ELSE 'other'
       END AS workload
FROM extensions.pg_stat_statements s
CROSS JOIN extensions.pg_stat_statements_info i
JOIN pg_roles r ON r.oid=s.userid
WHERE r.rolname='authenticated'
ORDER BY s.total_exec_time DESC
LIMIT 100;

-- Verification after approved policy/index apply; no business rows are read.
SELECT tablename,policyname,cmd,roles,permissive,qual,with_check
FROM pg_policies WHERE schemaname='public'
AND tablename IN ('marketing_content_items','marketing_channel_placements')
AND policyname LIKE 'pic or sub pic%'
ORDER BY tablename,policyname;

SELECT schemaname,tablename,indexname,indexdef FROM pg_indexes
WHERE indexname IN ('idx_assignment_runs_item_ran','idx_assignment_runs_work_item',
 'creative_seatalk_thread_group_thread_key','creative_seatalk_threads_group_id_thread_id_key');
