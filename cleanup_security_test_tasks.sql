-- FlowMate MVP 1.0 cleanup: cancel security test tasks
-- Run this in Supabase SQL Editor after the security validation is complete.
--
-- This intentionally cancels instead of deleting so audit/history remains intact.

with target_tasks as (
  select id, display_id, status
  from public.work_items
  where work_type = 'quick_task'
    and status not in ('delivered', 'cancelled')
    and (
      display_id in ('QT-0215', 'QT-0216')
      or title ilike 'Spoof test - should fail%'
    )
),
updated as (
  update public.work_items wi
     set status = 'cancelled',
         cancel_reason = 'Security validation cleanup after B-003 actor-spoof testing.',
         wip_counted = false,
         updated_at = now()
    from target_tasks tt
   where wi.id = tt.id
   returning wi.id, wi.display_id, tt.status as from_status
)
insert into public.work_item_events (
  work_item_id,
  actor_user_id,
  event_type,
  from_status,
  to_status,
  metadata
)
select
  id,
  null,
  'cancelled',
  from_status,
  'cancelled',
  jsonb_build_object(
    'source', 'cleanup_security_test_tasks.sql',
    'reason', 'Cleanup after B-003 actor-spoof validation'
  )
from updated;

select display_id, status, cancel_reason
from public.work_items
where display_id in ('QT-0215', 'QT-0216')
   or title ilike 'Spoof test - should fail%'
order by display_id;
