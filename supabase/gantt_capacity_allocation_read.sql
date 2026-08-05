-- FlowMate Team Gantt: read-only Capacity Allocation visibility.
-- Run after workflow_team_workspaces.sql (or workflow_gdve_creative_visibility.sql).
-- The frontend can read only allocations for work items the signed-in user may
-- already read. Assignment writes remain RPC/security-definer only.

begin;

alter table public.flowmate_capacity_allocations enable row level security;

drop policy if exists "team members can read capacity allocations"
on public.flowmate_capacity_allocations;
create policy "team members can read capacity allocations"
on public.flowmate_capacity_allocations
for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

revoke all privileges on public.flowmate_capacity_allocations from public, anon;
revoke insert, update, delete on public.flowmate_capacity_allocations from authenticated;
grant select on public.flowmate_capacity_allocations to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');

-- Verification: RLS is enabled, the read policy exists, and authenticated has
-- SELECT but no direct write privileges.
select
  c.relrowsecurity as rls_enabled,
  has_table_privilege('authenticated', 'public.flowmate_capacity_allocations', 'select') as authenticated_can_select,
  has_table_privilege('authenticated', 'public.flowmate_capacity_allocations', 'insert') as authenticated_can_insert,
  has_table_privilege('authenticated', 'public.flowmate_capacity_allocations', 'update') as authenticated_can_update,
  has_table_privilege('authenticated', 'public.flowmate_capacity_allocations', 'delete') as authenticated_can_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'flowmate_capacity_allocations';

select
  policyname,
  roles,
  cmd,
  qual
from pg_policies
where schemaname = 'public'
  and tablename = 'flowmate_capacity_allocations'
order by policyname;

