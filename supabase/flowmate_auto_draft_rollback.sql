-- FlowMate Auto Draft rollback for databases where the Auto Draft SQL was applied.
-- Deprecated as of 2026-07-01. Do not run this against production unless the
-- user explicitly confirms Auto Draft SQL was applied and should be removed.
-- Current approved flow is manual: Working Sheet -> Create Brief -> FlowMate
-- Creative Request -> submit.
-- Run this first, then re-run:
--   1. supabase/rpc_assignment.sql
--   2. supabase/marketing_plan.sql
--   3. supabase/security_hardening.sql
--
-- This removes Auto Draft schema/RPC additions. It does not delete work_items
-- that may have been created during testing; archive those by ID if needed.

drop function if exists public.marketing_plan_create_or_update_working_row(
  uuid, text, text, text, text, text, text, text, text, text, date, time, text[], text
);

drop function if exists public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, text[], text,
  text, text, text, public.priority_level, text, date, date, integer, date, time,
  jsonb, jsonb, jsonb, jsonb
);

drop policy if exists "active users can read creative size templates" on public.creative_size_templates;
drop table if exists public.creative_size_templates;

alter table if exists public.creative_request_details
  drop constraint if exists creative_details_common_brief_object,
  drop constraint if exists creative_details_static_brief_object,
  drop constraint if exists creative_details_video_brief_object,
  drop constraint if exists creative_details_selected_sizes_array,
  drop column if exists common_brief,
  drop column if exists static_brief,
  drop column if exists video_brief,
  drop column if exists selected_sizes;

-- Required because PostgreSQL cannot remove a view column through
-- CREATE OR REPLACE VIEW. marketing_plan.sql recreates it without
-- flowmate_display_id.
drop view if exists public.marketing_plan_timeline_v;

select pg_notify('pgrst', 'reload schema');
