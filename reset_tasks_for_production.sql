-- FlowMate production reset: clear task/calendar work data before go-live.
--
-- Scope:
-- - Deletes all work/tasks and dependent task records.
-- - Deletes notifications tied to work items/events.
-- - Deletes leave requests.
-- - Keeps users, whitelist, team members, team settings, templates, and admin config.
--
-- Run manually in Supabase SQL Editor after taking any desired backup.

begin;

-- Remove task notifications first so the notification center starts clean.
delete from public.notifications
where work_item_id is not null
   or event_id in (select id from public.work_item_events);

-- Reset calendar leave data.
delete from public.leave_requests;

-- Work item child rows are defined with ON DELETE CASCADE:
-- creative_request_details, assignment_runs, work_item_events, comments,
-- checklist_items, work_item_links, work_item_watchers, and remaining
-- work_item-linked notifications.
delete from public.work_items;

commit;

-- Post-run verification. All counts should be 0.
select 'work_items' as table_name, count(*) as remaining_rows from public.work_items
union all select 'creative_request_details', count(*) from public.creative_request_details
union all select 'assignment_runs', count(*) from public.assignment_runs
union all select 'work_item_events', count(*) from public.work_item_events
union all select 'comments', count(*) from public.comments
union all select 'checklist_items', count(*) from public.checklist_items
union all select 'work_item_links', count(*) from public.work_item_links
union all select 'work_item_watchers', count(*) from public.work_item_watchers
union all select 'task_notifications', count(*) from public.notifications where work_item_id is not null
union all select 'leave_requests', count(*) from public.leave_requests;
