-- FlowMate MVP 1.2 Notification Center backend
-- Run this AFTER security_hardening.sql.
-- This script is idempotent where practical.

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  work_item_id uuid references public.work_items(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  event_id uuid references public.work_item_events(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  read_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists actor_user_id uuid references public.users(id) on delete set null,
  add column if not exists event_id uuid references public.work_item_events(id) on delete cascade,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists dedupe_key text,
  add column if not exists dismissed_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_type_check'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_type_check check (
        type in (
          'assigned',
          'status_changed',
          'review_requested',
          'approved',
          'changes_requested',
          'blocked',
          'resumed',
          'cancelled',
          'due_soon',
          'overdue',
          'comment_created',
          'mentioned_in_comment'
        )
      );
  end if;
end $$;

create index if not exists idx_notifications_user_created
on public.notifications(user_id, created_at desc);

create index if not exists idx_notifications_user_unread
on public.notifications(user_id, created_at desc)
where read_at is null;

create index if not exists idx_notifications_user_visible
on public.notifications(user_id, created_at desc)
where dismissed_at is null;

create index if not exists idx_notifications_work_item
on public.notifications(work_item_id, created_at desc);

create unique index if not exists idx_notifications_user_event_type
on public.notifications(user_id, event_id, type)
where event_id is not null;

create unique index if not exists idx_notifications_dedupe_key
on public.notifications(dedupe_key)
where dedupe_key is not null;

alter table public.notifications enable row level security;

drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications"
on public.notifications for select
using (user_id = public.current_app_user_id());

drop policy if exists "users can update own notifications" on public.notifications;
create policy "users can update own notifications"
on public.notifications for update
using (user_id = public.current_app_user_id())
with check (user_id = public.current_app_user_id());

revoke all privileges on public.notifications from anon, authenticated;
revoke insert, update, delete on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

create or replace function public.flowmate_notification_recipients(p_work_item_id uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct recipient_id
  from (
    select wi.requester_user_id as recipient_id
    from public.work_items wi
    where wi.id = p_work_item_id

    union all

    select wi.assignee_user_id as recipient_id
    from public.work_items wi
    where wi.id = p_work_item_id

    union all

    select tm.user_id as recipient_id
    from public.work_items wi
    join public.team_members tm on tm.id = wi.final_owner_member_id
    where wi.id = p_work_item_id
  ) recipients
  where recipient_id is not null;
$$;

revoke all on function public.flowmate_notification_recipients(uuid) from public, anon, authenticated;

create or replace function public.flowmate_work_item_owner_user_id(p_work_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tm.user_id
  from public.work_items wi
  join public.team_members tm on tm.id = wi.final_owner_member_id
  where wi.id = p_work_item_id;
$$;

revoke all on function public.flowmate_work_item_owner_user_id(uuid) from public, anon, authenticated;

create or replace function public.flowmate_create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_body text default null,
  p_work_item_id uuid default null,
  p_actor_user_id uuid default null,
  p_event_id uuid default null,
  p_metadata jsonb default '{}'::jsonb,
  p_dedupe_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if p_actor_user_id is not null and p_actor_user_id = p_user_id then
    return null;
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
  ) then
    return null;
  end if;

  if p_dedupe_key is not null then
    select n.id
    into v_notification_id
    from public.notifications n
    where n.dedupe_key = p_dedupe_key;

    if v_notification_id is not null then
      return v_notification_id;
    end if;
  end if;

  insert into public.notifications (
    user_id,
    work_item_id,
    actor_user_id,
    event_id,
    type,
    title,
    body,
    metadata,
    dedupe_key
  )
  values (
    p_user_id,
    p_work_item_id,
    p_actor_user_id,
    p_event_id,
    p_type,
    trim(p_title),
    nullif(trim(coalesce(p_body, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    p_dedupe_key
  )
  returning id into v_notification_id;

  return v_notification_id;
exception
  when unique_violation then
    if p_dedupe_key is not null then
      select n.id
      into v_notification_id
      from public.notifications n
      where n.dedupe_key = p_dedupe_key;

      return v_notification_id;
    end if;
    raise;
end;
$$;

revoke all on function public.flowmate_create_notification(
  uuid, text, text, text, uuid, uuid, uuid, jsonb, text
) from public, anon, authenticated;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_notification public.notifications%rowtype;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = p_notification_id
    and n.user_id = v_actor_id
  returning * into v_notification;

  if v_notification.id is null then
    raise exception 'Notification not found';
  end if;

  return jsonb_build_object(
    'id', v_notification.id,
    'read_at', v_notification.read_at
  );
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.mark_all_notifications_read()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_count integer;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  update public.notifications
  set read_at = coalesce(read_at, now())
  where user_id = v_actor_id
    and read_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object('updated_count', v_count);
end;
$$;

revoke all on function public.mark_all_notifications_read() from public, anon, authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

create or replace function public.dismiss_read_notifications()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_count integer;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  update public.notifications
  set dismissed_at = coalesce(dismissed_at, now())
  where user_id = v_actor_id
    and read_at is not null
    and dismissed_at is null;

  get diagnostics v_count = row_count;

  return jsonb_build_object('dismissed_count', v_count);
end;
$$;

revoke all on function public.dismiss_read_notifications() from public, anon, authenticated;
grant execute on function public.dismiss_read_notifications() to authenticated;

create or replace function public.flowmate_notify_work_item_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work public.work_items%rowtype;
  v_owner_user_id uuid;
  v_target_user_id uuid;
  v_notification_type text;
  v_title text;
  v_body text;
begin
  select *
  into v_work
  from public.work_items
  where id = new.work_item_id;

  if v_work.id is null then
    return new;
  end if;

  v_owner_user_id := public.flowmate_work_item_owner_user_id(new.work_item_id);

  if new.event_type = 'assignment_ran' and new.to_status = 'assigned' then
    v_notification_type := 'assigned';
    v_title := 'Assigned: ' || v_work.display_id;
    v_body := v_work.title;
    v_target_user_id := v_owner_user_id;

    perform public.flowmate_create_notification(
      v_target_user_id,
      v_notification_type,
      v_title,
      v_body,
      v_work.id,
      null,
      new.id,
      jsonb_build_object('event_type', new.event_type::text, 'to_status', new.to_status::text),
      'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
    );

    return new;
  end if;

  if new.event_type = 'created' and new.to_status = 'assigned' then
    v_notification_type := 'assigned';
    v_title := 'Assigned: ' || v_work.display_id;
    v_body := v_work.title;
    v_target_user_id := coalesce(v_work.assignee_user_id, v_owner_user_id);

    perform public.flowmate_create_notification(
      v_target_user_id,
      v_notification_type,
      v_title,
      v_body,
      v_work.id,
      null,
      new.id,
      jsonb_build_object('event_type', new.event_type::text, 'to_status', new.to_status::text),
      'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
    );

    return new;
  end if;

  if new.event_type = 'status_changed' and new.to_status = 'review' then
    v_notification_type := 'review_requested';
    v_title := 'Review requested: ' || v_work.display_id;
    v_body := v_work.title;
    v_target_user_id := v_work.requester_user_id;

    perform public.flowmate_create_notification(
      v_target_user_id,
      v_notification_type,
      v_title,
      v_body,
      v_work.id,
      new.actor_user_id,
      new.id,
      jsonb_build_object('from_status', new.from_status::text, 'to_status', new.to_status::text),
      'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
    );

    return new;
  end if;

  if new.event_type = 'status_changed' and new.to_status = 'delivered' and v_work.work_type = 'quick_task' then
    v_notification_type := 'status_changed';
    v_title := 'Done: ' || v_work.display_id;
    v_body := v_work.title;
    v_target_user_id := v_work.requester_user_id;

    perform public.flowmate_create_notification(
      v_target_user_id,
      v_notification_type,
      v_title,
      v_body,
      v_work.id,
      null,
      new.id,
      jsonb_build_object('from_status', new.from_status::text, 'to_status', new.to_status::text, 'action', 'complete_quick_task'),
      'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
    );

    return new;
  end if;

  if new.event_type = 'status_changed' and new.from_status = 'review' and new.to_status = 'delivered' then
    v_notification_type := 'approved';
    v_title := 'Approved: ' || v_work.display_id;
    v_body := v_work.title;
    v_target_user_id := v_owner_user_id;

    perform public.flowmate_create_notification(
      v_target_user_id,
      v_notification_type,
      v_title,
      v_body,
      v_work.id,
      new.actor_user_id,
      new.id,
      jsonb_build_object('from_status', new.from_status::text, 'to_status', new.to_status::text),
      'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
    );

    return new;
  end if;

  if new.event_type = 'reviewed' and new.from_status = 'review' and new.to_status = 'in_progress' then
    v_notification_type := 'changes_requested';
    v_title := 'Changes requested: ' || v_work.display_id;
    v_body := v_work.title;
    v_target_user_id := v_owner_user_id;

    perform public.flowmate_create_notification(
      v_target_user_id,
      v_notification_type,
      v_title,
      v_body,
      v_work.id,
      new.actor_user_id,
      new.id,
      jsonb_build_object('from_status', new.from_status::text, 'to_status', new.to_status::text),
      'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
    );

    return new;
  end if;

  if new.event_type = 'blocked' then
    v_notification_type := 'blocked';
    v_title := 'Blocked: ' || v_work.display_id;
    v_body := coalesce(v_work.blocked_reason, v_work.title);
    v_target_user_id := v_work.requester_user_id;

    perform public.flowmate_create_notification(
      v_target_user_id,
      v_notification_type,
      v_title,
      v_body,
      v_work.id,
      new.actor_user_id,
      new.id,
      jsonb_build_object('from_status', new.from_status::text, 'to_status', new.to_status::text),
      'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
    );

    return new;
  end if;

  if new.event_type = 'status_changed'
     and new.from_status = 'blocked'
     and new.to_status in ('assigned', 'in_progress') then
    v_notification_type := 'resumed';
    v_title := 'Resumed: ' || v_work.display_id;
    v_body := v_work.title;
    v_target_user_id := v_work.requester_user_id;

    perform public.flowmate_create_notification(
      v_target_user_id,
      v_notification_type,
      v_title,
      v_body,
      v_work.id,
      new.actor_user_id,
      new.id,
      jsonb_build_object('from_status', new.from_status::text, 'to_status', new.to_status::text),
      'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
    );

    return new;
  end if;

  if new.event_type = 'cancelled' then
    v_notification_type := 'cancelled';
    v_title := 'Cancelled: ' || v_work.display_id;
    v_body := coalesce(v_work.cancel_reason, v_work.title);

    for v_target_user_id in
      select r.user_id
      from public.flowmate_notification_recipients(v_work.id) r
    loop
      perform public.flowmate_create_notification(
        v_target_user_id,
        v_notification_type,
        v_title,
        v_body,
        v_work.id,
        new.actor_user_id,
        new.id,
        jsonb_build_object('from_status', new.from_status::text, 'to_status', new.to_status::text),
        'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
      );
    end loop;

    return new;
  end if;

  if new.event_type = 'commented' and coalesce(new.metadata ->> 'action', '') = 'add_comment' then
    v_notification_type := 'comment_created';
    v_title := 'New comment: ' || v_work.display_id;
    v_body := v_work.title;

    for v_target_user_id in
      select r.user_id
      from public.flowmate_notification_recipients(v_work.id) r
    loop
      perform public.flowmate_create_notification(
        v_target_user_id,
        v_notification_type,
        v_title,
        v_body,
        v_work.id,
        new.actor_user_id,
        new.id,
        jsonb_build_object('comment_id', new.metadata ->> 'comment_id'),
        'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
      );
    end loop;

    return new;
  end if;

  if new.event_type = 'status_changed' then
    v_notification_type := 'status_changed';
    v_title := 'Status changed: ' || v_work.display_id;
    v_body := coalesce(new.from_status::text, 'unknown') || ' -> ' || coalesce(new.to_status::text, 'unknown');

    for v_target_user_id in
      select r.user_id
      from public.flowmate_notification_recipients(v_work.id) r
    loop
      perform public.flowmate_create_notification(
        v_target_user_id,
        v_notification_type,
        v_title,
        v_body,
        v_work.id,
        null,
        new.id,
        jsonb_build_object('from_status', new.from_status::text, 'to_status', new.to_status::text),
        'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
      );
    end loop;
  end if;

  return new;
end;
$$;

revoke all on function public.flowmate_notify_work_item_event() from public, anon, authenticated;

drop trigger if exists flowmate_notifications_after_event on public.work_item_events;
create trigger flowmate_notifications_after_event
after insert on public.work_item_events
for each row execute function public.flowmate_notify_work_item_event();

create or replace function public.flowmate_generate_due_notifications(p_window_days integer default 2)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_days integer := least(greatest(coalesce(p_window_days, 2), 0), 30);
  v_work public.work_items%rowtype;
  v_target_user_id uuid;
  v_notification_type text;
  v_created_count integer := 0;
  v_notification_id uuid;
begin
  for v_work in
    select *
    from public.work_items wi
    where wi.status not in ('delivered', 'cancelled')
      and wi.due_date <= current_date + v_window_days
  loop
    v_notification_type := case
      when v_work.due_date < current_date then 'overdue'
      else 'due_soon'
    end;

    for v_target_user_id in
      select r.user_id
      from public.flowmate_notification_recipients(v_work.id) r
    loop
      v_notification_id := public.flowmate_create_notification(
        v_target_user_id,
        v_notification_type,
        case
          when v_notification_type = 'overdue' then 'Overdue: ' || v_work.display_id
          else 'Due soon: ' || v_work.display_id
        end,
        v_work.title,
        v_work.id,
        null,
        null,
        jsonb_build_object('due_date', v_work.due_date, 'generated_on', current_date),
        'due:' || v_notification_type || ':' || v_work.id::text || ':' || v_target_user_id::text || ':' || current_date::text
      );

      if v_notification_id is not null then
        v_created_count := v_created_count + 1;
      end if;
    end loop;
  end loop;

  return v_created_count;
end;
$$;

revoke all on function public.flowmate_generate_due_notifications(integer) from public, anon, authenticated;
