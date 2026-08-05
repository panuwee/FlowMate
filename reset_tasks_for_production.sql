-- FlowMate production reset: archive task/request data, then clear active task rows.
--
-- Scope:
-- - Archives active task/request rows into flowmate_archive before clearing them.
-- - Clears only task/request data:
--   work_items, creative_request_details, comments, links, watchers,
--   notifications tied to work items/events, AI tags, events, checklist,
--   and assignment runs.
-- - Keeps users, whitelist, team_members, skills, capacity, leave settings,
--   leave_requests, security/RLS, templates, and admin config.
--
-- Safety:
-- - The DO block will not run until v_confirm is changed to:
--   CONFIRM_RESET_FLOWMATE_TASKS
-- - Display ID reset is handled by the create RPCs:
--   CR starts at CR-1001 and QT starts at QT-2001 when public.work_items is empty.
--
-- Run manually in Supabase SQL Editor after final validation.

-- Preview counts before changing data.
select 'work_items' as table_name, count(*) as rows_before_reset from public.work_items
union all select 'creative_request_details', count(*) from public.creative_request_details
union all select 'assignment_runs', count(*) from public.assignment_runs
union all select 'work_item_events', count(*) from public.work_item_events
union all select 'comments', count(*) from public.comments
union all select 'checklist_items', count(*) from public.checklist_items
union all select 'work_item_links', count(*) from public.work_item_links
union all select 'work_item_watchers', count(*) from public.work_item_watchers
union all select 'work_item_ai_tags', count(*) from public.work_item_ai_tags
union all select 'task_notifications', count(*) from public.notifications
where work_item_id is not null
   or event_id in (select id from public.work_item_events)
union all select 'leave_requests_kept', count(*) from public.leave_requests;

begin;

do $$
declare
  v_confirm text := 'CHANGE_ME';
  v_batch_id uuid := gen_random_uuid();
  v_actor_id uuid := auth.uid();
  v_reason text := 'production_task_reset';
  v_counts jsonb;
begin
  if v_confirm <> 'CONFIRM_RESET_FLOWMATE_TASKS' then
    raise exception 'Reset not run. Review the preview counts, then set v_confirm to CONFIRM_RESET_FLOWMATE_TASKS.';
  end if;

  execute 'create schema if not exists flowmate_archive';

  execute $ddl$
    create table if not exists flowmate_archive.reset_batches (
      batch_id uuid primary key,
      started_at timestamptz not null default now(),
      completed_at timestamptz,
      archived_by_user_id uuid,
      reason text not null,
      counts jsonb not null default '{}'::jsonb,
      notes text
    )
  $ddl$;

  execute $ddl$
    create table if not exists flowmate_archive.task_table_rows (
      id bigserial primary key,
      batch_id uuid not null,
      source_schema text not null default 'public',
      table_name text not null,
      row_pk text,
      row_data jsonb not null,
      archived_at timestamptz not null default now()
    )
  $ddl$;

  execute 'create index if not exists idx_task_table_rows_batch_table on flowmate_archive.task_table_rows(batch_id, table_name)';
  execute 'create index if not exists idx_task_table_rows_table_pk on flowmate_archive.task_table_rows(table_name, row_pk)';

  -- Keep archive rows out of the browser/API surface unless an admin inspects
  -- them from SQL Editor or a future trusted backend tool.
  execute 'revoke all on schema flowmate_archive from public, anon, authenticated';
  execute 'revoke all on all tables in schema flowmate_archive from public, anon, authenticated';
  execute 'revoke all on all sequences in schema flowmate_archive from public, anon, authenticated';

  select jsonb_build_object(
    'work_items', (select count(*) from public.work_items),
    'creative_request_details', (select count(*) from public.creative_request_details),
    'assignment_runs', (select count(*) from public.assignment_runs),
    'work_item_events', (select count(*) from public.work_item_events),
    'comments', (select count(*) from public.comments),
    'checklist_items', (select count(*) from public.checklist_items),
    'work_item_links', (select count(*) from public.work_item_links),
    'work_item_watchers', (select count(*) from public.work_item_watchers),
    'work_item_ai_tags', (select count(*) from public.work_item_ai_tags),
    'task_notifications', (
      select count(*)
      from public.notifications
      where work_item_id is not null
         or event_id in (select id from public.work_item_events)
    ),
    'leave_requests_kept', (select count(*) from public.leave_requests)
  )
  into v_counts;

  insert into flowmate_archive.reset_batches (
    batch_id,
    archived_by_user_id,
    reason,
    counts,
    notes
  )
  values (
    v_batch_id,
    v_actor_id,
    v_reason,
    v_counts,
    'Archive-first production reset. System tables and leave requests are intentionally kept.'
  );

  -- Mark work rows as archived before copying them, so the archived JSON keeps
  -- clear audit metadata even though active task rows are cleared afterward.
  update public.work_items
  set archived_at = coalesce(archived_at, now()),
      archived_by_user_id = coalesce(archived_by_user_id, v_actor_id),
      archive_reason = coalesce(nullif(trim(archive_reason), ''), 'production reset batch ' || v_batch_id::text);

  insert into flowmate_archive.task_table_rows (batch_id, table_name, row_pk, row_data)
  select v_batch_id, 'work_items', t.id::text, to_jsonb(t)
  from public.work_items t;

  insert into flowmate_archive.task_table_rows (batch_id, table_name, row_pk, row_data)
  select v_batch_id, 'creative_request_details', t.id::text, to_jsonb(t)
  from public.creative_request_details t;

  insert into flowmate_archive.task_table_rows (batch_id, table_name, row_pk, row_data)
  select v_batch_id, 'assignment_runs', t.id::text, to_jsonb(t)
  from public.assignment_runs t;

  insert into flowmate_archive.task_table_rows (batch_id, table_name, row_pk, row_data)
  select v_batch_id, 'work_item_events', t.id::text, to_jsonb(t)
  from public.work_item_events t;

  insert into flowmate_archive.task_table_rows (batch_id, table_name, row_pk, row_data)
  select v_batch_id, 'comments', t.id::text, to_jsonb(t)
  from public.comments t;

  insert into flowmate_archive.task_table_rows (batch_id, table_name, row_pk, row_data)
  select v_batch_id, 'checklist_items', t.id::text, to_jsonb(t)
  from public.checklist_items t;

  insert into flowmate_archive.task_table_rows (batch_id, table_name, row_pk, row_data)
  select v_batch_id, 'work_item_links', t.id::text, to_jsonb(t)
  from public.work_item_links t;

  insert into flowmate_archive.task_table_rows (batch_id, table_name, row_pk, row_data)
  select v_batch_id, 'work_item_watchers', t.id::text, to_jsonb(t)
  from public.work_item_watchers t;

  insert into flowmate_archive.task_table_rows (batch_id, table_name, row_pk, row_data)
  select v_batch_id, 'work_item_ai_tags', t.id::text, to_jsonb(t)
  from public.work_item_ai_tags t;

  insert into flowmate_archive.task_table_rows (batch_id, table_name, row_pk, row_data)
  select v_batch_id, 'notifications', t.id::text, to_jsonb(t)
  from public.notifications t
  where t.work_item_id is not null
     or t.event_id in (select id from public.work_item_events);

  delete from public.notifications
  where work_item_id is not null
     or event_id in (select id from public.work_item_events);

  delete from public.work_item_ai_tags;
  delete from public.work_item_watchers;
  delete from public.work_item_links;
  delete from public.checklist_items;
  delete from public.comments;
  delete from public.assignment_runs;
  delete from public.creative_request_details;
  delete from public.work_item_events;
  delete from public.work_items;

  update flowmate_archive.reset_batches
  set completed_at = now()
  where batch_id = v_batch_id;

  raise notice 'FlowMate task reset archived batch % with counts %', v_batch_id, v_counts;
end $$;

commit;

-- Post-run verification. Task/request counts should be 0.
select 'work_items' as table_name, count(*) as remaining_rows from public.work_items
union all select 'creative_request_details', count(*) from public.creative_request_details
union all select 'assignment_runs', count(*) from public.assignment_runs
union all select 'work_item_events', count(*) from public.work_item_events
union all select 'comments', count(*) from public.comments
union all select 'checklist_items', count(*) from public.checklist_items
union all select 'work_item_links', count(*) from public.work_item_links
union all select 'work_item_watchers', count(*) from public.work_item_watchers
union all select 'work_item_ai_tags', count(*) from public.work_item_ai_tags
union all select 'task_notifications', count(*) from public.notifications
where work_item_id is not null
   or event_id in (select id from public.work_item_events)
union all select 'leave_requests_kept', count(*) from public.leave_requests;

-- Latest archive batches for audit lookup.
select batch_id, started_at, completed_at, archived_by_user_id, reason, counts
from flowmate_archive.reset_batches
order by started_at desc
limit 5;
