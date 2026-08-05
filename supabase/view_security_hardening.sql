-- FlowMate view security hardening
-- Run this after any script that creates or replaces public views.
--
-- Supabase flags views as unrestricted when they are readable from anon or
-- when they can bypass underlying table RLS. These views must be callable only
-- by authenticated users and must evaluate underlying table access as the
-- caller, not as the view owner.

alter view if exists public.member_workload_v
  set (security_invoker = true);

alter view if exists public.work_item_flags_v
  set (security_invoker = true);

alter view if exists public.planning_work_items_v
  set (security_invoker = true);

revoke all privileges on public.member_workload_v from public, anon, authenticated;
revoke all privileges on public.work_item_flags_v from public, anon, authenticated;
revoke all privileges on public.planning_work_items_v from public, anon, authenticated;

grant select on public.member_workload_v to authenticated;
grant select on public.work_item_flags_v to authenticated;
grant select on public.planning_work_items_v to authenticated;
