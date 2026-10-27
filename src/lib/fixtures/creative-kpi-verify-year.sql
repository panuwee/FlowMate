-- Synthetic IDs only; same verification query structure as the prepared production read.
-- PREPARED ONLY. One full-year read, eight-second limit, after explicit new approval.
begin read only;
set local statement_timeout = '8s';
set local lock_timeout = '1s';
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
with started as materialized(select clock_timestamp() at),
report as materialized(select started.at,public.flowmate_creative_kpi_report_fast(2026) snapshot from started),
rows as (select value from report,jsonb_array_elements(snapshot->'rows'))
select jsonb_build_object(
'elapsed_ms',round(extract(epoch from(clock_timestamp()-report.at))*1000),
'row_count',snapshot->'rowCount','returned_rows',jsonb_array_length(snapshot->'rows'),
'calendar_active',snapshot->'calendarActiveN','as_of',snapshot->'asOf',
'october_delivered',(select count(*) from rows where (value->>'delivery_at')::timestamptz>='2026-10-01T00:00:00+07:00'::timestamptz and (value->>'delivery_at')::timestamptz<'2026-11-01T00:00:00+07:00'::timestamptz and (value->>'delivery_at')::timestamptz<=(snapshot->>'asOf')::timestamptz),
'october_ai_delivered',(select count(*) from rows where (value->>'delivery_at')::timestamptz>='2026-10-01T00:00:00+07:00'::timestamptz and (value->>'delivery_at')::timestamptz<'2026-11-01T00:00:00+07:00'::timestamptz and (value->>'delivery_at')::timestamptz<=(snapshot->>'asOf')::timestamptz and jsonb_array_length(value->'delivered_ai_tags')>0)
) as full_year_probe from report;
rollback;
