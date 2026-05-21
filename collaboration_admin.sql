-- FlowMate MVP 1.2 Detail Collaboration, Watchers, and Admin Operations
-- Run this AFTER notification_center.sql.
-- This script is idempotent where practical.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Work item soft archive support
-- ---------------------------------------------------------------------------
alter table public.work_items
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by_user_id uuid references public.users(id) on delete set null,
  add column if not exists archive_reason text;

create index if not exists idx_work_items_archived_at
on public.work_items(archived_at);

-- ---------------------------------------------------------------------------
-- Detail collaboration models
-- ---------------------------------------------------------------------------
create table if not exists public.work_item_links (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  url text not null,
  description text,
  created_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_user_id uuid references public.users(id) on delete set null,
  constraint work_item_links_url_check check (url ~* '^https?://[^[:space:]]{4,}$')
);

create table if not exists public.work_item_watchers (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  watcher_user_id uuid not null references public.users(id),
  added_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  removed_at timestamptz,
  removed_by_user_id uuid references public.users(id) on delete set null,
  constraint work_item_watchers_not_empty check (watcher_user_id is not null)
);

create index if not exists idx_work_item_links_work_item
on public.work_item_links(work_item_id, created_at desc)
where deleted_at is null;

create index if not exists idx_work_item_watchers_work_item
on public.work_item_watchers(work_item_id, created_at desc)
where removed_at is null;

create index if not exists idx_work_item_watchers_user
on public.work_item_watchers(watcher_user_id, created_at desc)
where removed_at is null;

create unique index if not exists idx_work_item_watchers_active_unique
on public.work_item_watchers(work_item_id, watcher_user_id)
where removed_at is null;

alter table public.work_item_links enable row level security;
alter table public.work_item_watchers enable row level security;

-- ---------------------------------------------------------------------------
-- Auth helpers. New overload keeps existing is_admin_app_user() behavior intact.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin_app_user(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
      and u.role = 'admin'
  );
$$;

revoke all on function public.is_admin_app_user(uuid) from public, anon, authenticated;

create or replace function public.flowmate_can_read_work_item(
  p_work_item_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
  )
  and exists (
    select 1
    from public.work_items wi
    left join public.team_members tm on tm.id = wi.final_owner_member_id
    where wi.id = p_work_item_id
      and wi.archived_at is null
      and (
        wi.requester_user_id = p_user_id
        or wi.assignee_user_id = p_user_id
        or tm.user_id = p_user_id
        or public.is_admin_app_user(p_user_id)
        or exists (
          select 1
          from public.work_item_watchers wiw
          where wiw.work_item_id = wi.id
            and wiw.watcher_user_id = p_user_id
            and wiw.removed_at is null
        )
      )
  );
$$;

revoke all on function public.flowmate_can_read_work_item(uuid, uuid) from public, anon, authenticated;

create or replace function public.flowmate_can_collaborate_on_work_item(
  p_work_item_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
  )
  and exists (
    select 1
    from public.work_items wi
    left join public.team_members tm on tm.id = wi.final_owner_member_id
    where wi.id = p_work_item_id
      and wi.archived_at is null
      and (
        wi.requester_user_id = p_user_id
        or wi.assignee_user_id = p_user_id
        or tm.user_id = p_user_id
        or public.is_admin_app_user(p_user_id)
      )
  );
$$;

revoke all on function public.flowmate_can_collaborate_on_work_item(uuid, uuid) from public, anon, authenticated;

create or replace function public.flowmate_can_status_transition_work_item(
  p_work_item_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
  )
  and exists (
    select 1
    from public.work_items wi
    left join public.team_members tm on tm.id = wi.final_owner_member_id
    where wi.id = p_work_item_id
      and wi.archived_at is null
      and (
        wi.requester_user_id = p_user_id
        or wi.assignee_user_id = p_user_id
        or tm.user_id = p_user_id
        or public.is_admin_app_user(p_user_id)
      )
  );
$$;

revoke all on function public.flowmate_can_status_transition_work_item(uuid, uuid) from public, anon, authenticated;

drop policy if exists "work item participants can read links" on public.work_item_links;
create policy "work item participants can read links"
on public.work_item_links for select
using (
  deleted_at is null
  and public.flowmate_can_read_work_item(work_item_id, public.current_app_user_id())
);

drop policy if exists "work item participants can read watchers" on public.work_item_watchers;
create policy "work item participants can read watchers"
on public.work_item_watchers for select
using (
  removed_at is null
  and public.flowmate_can_read_work_item(work_item_id, public.current_app_user_id())
);

revoke all privileges on public.work_item_links from anon, authenticated;
revoke all privileges on public.work_item_watchers from anon, authenticated;
revoke insert, update, delete on public.work_item_links from anon, authenticated;
revoke insert, update, delete on public.work_item_watchers from anon, authenticated;
grant select on public.work_item_links to authenticated;
grant select on public.work_item_watchers to authenticated;

-- ---------------------------------------------------------------------------
-- Notification recipients now include active watchers.
-- ---------------------------------------------------------------------------
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

    union all

    select wiw.watcher_user_id as recipient_id
    from public.work_item_watchers wiw
    where wiw.work_item_id = p_work_item_id
      and wiw.removed_at is null
  ) recipients
  where recipient_id is not null;
$$;

revoke all on function public.flowmate_notification_recipients(uuid) from public, anon, authenticated;

create or replace function public.flowmate_create_collaboration_event(
  p_work_item_id uuid,
  p_event_actor_user_id uuid,
  p_action text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  insert into public.work_item_events (
    work_item_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    p_work_item_id,
    p_event_actor_user_id,
    'updated',
    jsonb_build_object('source', 'rpc', 'action', p_action) || coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.flowmate_create_collaboration_event(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Collaboration RPCs. Actor identity always comes from auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.add_work_item_link(
  p_display_id text,
  p_url text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_work public.work_items%rowtype;
  v_link public.work_item_links%rowtype;
  v_event_id uuid;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into v_work
  from public.work_items
  where display_id = p_display_id;

  if v_work.id is null or v_work.archived_at is not null then
    raise exception 'Work item not found';
  end if;

  if not public.flowmate_can_collaborate_on_work_item(v_work.id, v_actor_id) then
    raise exception 'Only requester, assignee, or admin can add links'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_url, ''))) = 0 then
    raise exception 'Link URL is required';
  end if;

  insert into public.work_item_links (
    work_item_id,
    url,
    description,
    created_by_user_id
  )
  values (
    v_work.id,
    trim(p_url),
    nullif(trim(coalesce(p_description, '')), ''),
    v_actor_id
  )
  returning * into v_link;

  v_event_id := public.flowmate_create_collaboration_event(
    v_work.id,
    v_actor_id,
    'add_link',
    jsonb_build_object('link_id', v_link.id)
  );

  return jsonb_build_object(
    'id', v_link.id,
    'work_item_id', v_link.work_item_id,
    'url', v_link.url,
    'description', v_link.description,
    'created_by_user_id', v_link.created_by_user_id,
    'created_at', v_link.created_at,
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.add_work_item_link(text, text, text) from public, anon, authenticated;
grant execute on function public.add_work_item_link(text, text, text) to authenticated;

create or replace function public.remove_work_item_link(p_link_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_link public.work_item_links%rowtype;
  v_work public.work_items%rowtype;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into v_link
  from public.work_item_links
  where id = p_link_id
  for update;

  if v_link.id is null or v_link.deleted_at is not null then
    raise exception 'Link not found';
  end if;

  select *
  into v_work
  from public.work_items
  where id = v_link.work_item_id;

  if v_link.created_by_user_id <> v_actor_id
     and not public.flowmate_can_collaborate_on_work_item(v_link.work_item_id, v_actor_id) then
    raise exception 'Only requester, assignee, admin, or link author can remove links'
      using errcode = '42501';
  end if;

  update public.work_item_links
  set deleted_at = now(),
      deleted_by_user_id = v_actor_id
  where id = p_link_id
  returning * into v_link;

  perform public.flowmate_create_collaboration_event(
    v_link.work_item_id,
    v_actor_id,
    'remove_link',
    jsonb_build_object('link_id', v_link.id)
  );

  return jsonb_build_object('id', v_link.id, 'deleted_at', v_link.deleted_at);
end;
$$;

revoke all on function public.remove_work_item_link(uuid) from public, anon, authenticated;
grant execute on function public.remove_work_item_link(uuid) to authenticated;

create or replace function public.add_work_item_watcher(
  p_display_id text,
  p_watcher_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_work public.work_items%rowtype;
  v_watcher public.users%rowtype;
  v_watch public.work_item_watchers%rowtype;
  v_event_id uuid;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into v_work
  from public.work_items
  where display_id = p_display_id;

  if v_work.id is null or v_work.archived_at is not null then
    raise exception 'Work item not found';
  end if;

  if not public.flowmate_can_collaborate_on_work_item(v_work.id, v_actor_id) then
    raise exception 'Only requester, assignee, or admin can add watchers'
      using errcode = '42501';
  end if;

  select *
  into v_watcher
  from public.users
  where id = p_watcher_user_id
    and is_active = true;

  if v_watcher.id is null then
    raise exception 'Watcher user is inactive or not found';
  end if;

  select *
  into v_watch
  from public.work_item_watchers
  where work_item_id = v_work.id
    and watcher_user_id = p_watcher_user_id
    and removed_at is null;

  if v_watch.id is null then
    insert into public.work_item_watchers (
      work_item_id,
      watcher_user_id,
      added_by_user_id
    )
    values (
      v_work.id,
      p_watcher_user_id,
      v_actor_id
    )
    returning * into v_watch;

    v_event_id := public.flowmate_create_collaboration_event(
      v_work.id,
      v_actor_id,
      'add_watcher',
      jsonb_build_object('watcher_user_id', p_watcher_user_id, 'watcher_id', v_watch.id)
    );
  end if;

  return jsonb_build_object(
    'id', v_watch.id,
    'work_item_id', v_watch.work_item_id,
    'watcher_user_id', v_watch.watcher_user_id,
    'added_by_user_id', v_watch.added_by_user_id,
    'created_at', v_watch.created_at,
    'event_id', v_event_id
  );
end;
$$;

revoke all on function public.add_work_item_watcher(text, uuid) from public, anon, authenticated;
grant execute on function public.add_work_item_watcher(text, uuid) to authenticated;

create or replace function public.remove_work_item_watcher(p_watcher_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_watch public.work_item_watchers%rowtype;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  select *
  into v_watch
  from public.work_item_watchers
  where id = p_watcher_id
  for update;

  if v_watch.id is null or v_watch.removed_at is not null then
    raise exception 'Watcher not found';
  end if;

  if v_watch.watcher_user_id <> v_actor_id
     and not public.flowmate_can_collaborate_on_work_item(v_watch.work_item_id, v_actor_id) then
    raise exception 'Only requester, assignee, admin, or the watcher can remove this watcher'
      using errcode = '42501';
  end if;

  update public.work_item_watchers
  set removed_at = now(),
      removed_by_user_id = v_actor_id
  where id = p_watcher_id
  returning * into v_watch;

  perform public.flowmate_create_collaboration_event(
    v_watch.work_item_id,
    v_actor_id,
    'remove_watcher',
    jsonb_build_object('watcher_user_id', v_watch.watcher_user_id, 'watcher_id', v_watch.id)
  );

  return jsonb_build_object('id', v_watch.id, 'removed_at', v_watch.removed_at);
end;
$$;

revoke all on function public.remove_work_item_watcher(uuid) from public, anon, authenticated;
grant execute on function public.remove_work_item_watcher(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Collaboration notifications. Status and comment notifications from
-- notification_center.sql keep using flowmate_notification_recipients(), so
-- active watchers now receive them too.
-- ---------------------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_type_check;

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
      'link_added',
      'watcher_added'
    )
  );

create or replace function public.flowmate_notify_collaboration_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work public.work_items%rowtype;
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

  if new.event_type = 'commented' and coalesce(new.metadata ->> 'action', '') = 'add_comment' then
    v_notification_type := 'comment_created';
    v_title := 'New comment: ' || v_work.display_id;
    v_body := v_work.title;
  elsif new.event_type in ('status_changed', 'blocked', 'reviewed', 'cancelled') then
    v_notification_type := 'status_changed';
    v_title := 'Status changed: ' || v_work.display_id;
    v_body := coalesce(new.from_status::text, 'unknown') || ' -> ' || coalesce(new.to_status::text, 'unknown');
  elsif new.event_type = 'updated' and coalesce(new.metadata ->> 'action', '') = 'add_link' then
    v_notification_type := 'link_added';
    v_title := 'New link: ' || v_work.display_id;
    v_body := v_work.title;
  elsif new.event_type = 'updated' and coalesce(new.metadata ->> 'action', '') = 'add_watcher' then
    v_notification_type := 'watcher_added';
    v_title := 'Watcher added: ' || v_work.display_id;
    v_body := v_work.title;
  else
    return new;
  end if;

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
      jsonb_build_object(
        'event_type', new.event_type::text,
        'action', new.metadata ->> 'action',
        'link_id', new.metadata ->> 'link_id',
        'watcher_user_id', new.metadata ->> 'watcher_user_id',
        'comment_id', new.metadata ->> 'comment_id'
      ),
      'event:' || new.id::text || ':' || v_notification_type || ':' || coalesce(v_target_user_id::text, '')
    );
  end loop;

  return new;
end;
$$;

revoke all on function public.flowmate_notify_collaboration_event() from public, anon, authenticated;

drop trigger if exists flowmate_collaboration_notifications_after_event on public.work_item_events;
create trigger flowmate_collaboration_notifications_after_event
after insert on public.work_item_events
for each row execute function public.flowmate_notify_collaboration_event();

-- ---------------------------------------------------------------------------
-- Admin operations. Admin actor is always the real auth.uid().
-- ---------------------------------------------------------------------------
create or replace function public.flowmate_admin_transition_work_status(
  p_display_id text,
  p_next_status public.work_status,
  p_delivery_link text default null,
  p_blocked_reason text default null,
  p_cancel_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_work public.work_items%rowtype;
  v_from_status public.work_status;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_admin_app_user(v_actor_id) then
    raise exception 'Only FlowMate admins can override work status'
      using errcode = '42501';
  end if;

  select *
  into v_work
  from public.work_items
  where display_id = p_display_id
  for update;

  if v_work.id is null or v_work.archived_at is not null then
    raise exception 'Work item not found';
  end if;

  v_from_status := v_work.status;

  if p_next_status = v_from_status then
    return jsonb_build_object(
      'id', v_work.id,
      'display_id', v_work.display_id,
      'status', v_work.status,
      'unchanged', true
    );
  end if;

  if p_next_status = 'blocked' and length(trim(coalesce(p_blocked_reason, ''))) = 0 then
    raise exception 'Blocked reason is required';
  end if;

  if p_next_status = 'cancelled' and length(trim(coalesce(p_cancel_reason, ''))) = 0 then
    raise exception 'Cancel reason is required';
  end if;

  if v_work.work_type = 'creative_request'
     and p_next_status in ('review', 'delivered')
     and length(trim(coalesce(p_delivery_link, v_work.delivery_link, ''))) = 0 then
    raise exception 'Delivery link is required before review or delivery';
  end if;

  update public.work_items
  set status = p_next_status,
      delivery_link = case
        when length(trim(coalesce(p_delivery_link, ''))) > 0 then trim(p_delivery_link)
        else delivery_link
      end,
      blocked_reason = case
        when p_next_status = 'blocked' then trim(p_blocked_reason)
        when v_from_status = 'blocked' then null
        else blocked_reason
      end,
      blocked_from = case
        when p_next_status = 'blocked' then v_from_status
        when v_from_status = 'blocked' then null
        else blocked_from
      end,
      cancel_reason = case
        when p_next_status = 'cancelled' then trim(p_cancel_reason)
        else cancel_reason
      end,
      delivered_at = case
        when p_next_status = 'delivered' then coalesce(delivered_at, now())
        else delivered_at
      end,
      wip_counted = (p_next_status = 'in_progress'),
      updated_at = now()
  where id = v_work.id
  returning * into v_work;

  insert into public.work_item_events (
    work_item_id,
    actor_user_id,
    event_type,
    from_status,
    to_status,
    metadata
  )
  values (
    v_work.id,
    v_actor_id,
    case
      when p_next_status = 'blocked' then 'blocked'::public.event_type
      when p_next_status = 'cancelled' then 'cancelled'::public.event_type
      when v_from_status = 'review' and p_next_status = 'in_progress' then 'reviewed'::public.event_type
      else 'status_changed'::public.event_type
    end,
    v_from_status,
    p_next_status,
    jsonb_build_object(
      'source', 'rpc',
      'admin_override', true,
      'delivery_link_set', p_delivery_link is not null,
      'blocked_reason_set', p_blocked_reason is not null,
      'cancel_reason_set', p_cancel_reason is not null
    )
  );

  return jsonb_build_object(
    'id', v_work.id,
    'display_id', v_work.display_id,
    'status', v_work.status,
    'admin_override', true
  );
end;
$$;

revoke all on function public.flowmate_admin_transition_work_status(
  text, public.work_status, text, text, text
) from public, anon, authenticated;
grant execute on function public.flowmate_admin_transition_work_status(
  text, public.work_status, text, text, text
) to authenticated;

create or replace function public.flowmate_admin_archive_work_item(
  p_display_id text,
  p_archive_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_work public.work_items%rowtype;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_admin_app_user(v_actor_id) then
    raise exception 'Only FlowMate admins can archive work items'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_archive_reason, ''))) = 0 then
    raise exception 'Archive reason is required';
  end if;

  select *
  into v_work
  from public.work_items
  where display_id = p_display_id
  for update;

  if v_work.id is null then
    raise exception 'Work item not found';
  end if;

  update public.work_items
  set archived_at = coalesce(archived_at, now()),
      archived_by_user_id = v_actor_id,
      archive_reason = trim(p_archive_reason),
      wip_counted = false,
      updated_at = now()
  where id = v_work.id
  returning * into v_work;

  insert into public.work_item_events (
    work_item_id,
    actor_user_id,
    event_type,
    from_status,
    to_status,
    metadata
  )
  values (
    v_work.id,
    v_actor_id,
    'updated',
    v_work.status,
    v_work.status,
    jsonb_build_object('source', 'rpc', 'admin_archive', true, 'archive_reason_set', true)
  );

  return jsonb_build_object(
    'id', v_work.id,
    'display_id', v_work.display_id,
    'archived_at', v_work.archived_at,
    'archived_by_user_id', v_work.archived_by_user_id,
    'admin_archive', true
  );
end;
$$;

revoke all on function public.flowmate_admin_archive_work_item(text, text) from public, anon, authenticated;
grant execute on function public.flowmate_admin_archive_work_item(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Active backend views hide archived rows.
-- ---------------------------------------------------------------------------
create or replace view public.member_workload_v
with (security_invoker = true) as
select
  tm.id as team_member_id,
  tm.member_code,
  tm.display_name,
  tm.discipline_short,
  tm.skills,
  tm.backup_skills,
  tm.availability,
  tm.capacity_per_day,
  tm.capacity_override_per_day,
  case
    when tm.active = false then 0::numeric
    when tm.availability = 'leave' then 0::numeric
    when tm.availability = 'partial' then tm.capacity_override_per_day
    else tm.capacity_per_day
  end as effective_capacity_per_day,
  coalesce(sum(wi.effort_point) filter (
    where wi.work_type = 'creative_request'
      and wi.status in ('assigned', 'in_progress', 'review', 'blocked')
  ), 0) as assigned_effort,
  count(wi.id) filter (
    where wi.work_type = 'creative_request'
      and wi.status = 'in_progress'
      and wi.wip_counted = true
  ) as current_wip,
  count(wi.id) filter (
    where wi.status in ('assigned', 'in_progress', 'review', 'blocked')
      and wi.due_date < current_date
  ) as overdue_count,
  count(wi.id) filter (
    where wi.status in ('assigned', 'in_progress', 'review')
      and wi.due_date >= current_date
      and wi.due_date <= current_date + interval '2 days'
  ) as due_soon_count,
  count(wi.id) filter (where wi.status = 'blocked') as blocked_count,
  count(wi.id) filter (where wi.status = 'review') as review_count,
  count(wi.id) filter (where wi.work_type = 'quick_task' and wi.status not in ('delivered', 'cancelled')) as quick_task_count
from public.team_members tm
left join public.work_items wi on wi.final_owner_member_id = tm.id
  and wi.archived_at is null
group by tm.id;

create or replace view public.work_item_flags_v
with (security_invoker = true) as
select
  wi.id as work_item_id,
  wi.display_id,
  wi.status,
  wi.work_type,
  (wi.status not in ('delivered', 'cancelled') and wi.due_date < current_date) as is_overdue,
  (wi.status not in ('delivered', 'cancelled') and wi.due_date >= current_date and wi.due_date <= current_date + interval '2 days') as is_due_soon,
  (wi.status = 'need_brief') as is_brief_incomplete,
  (wi.review_round > 2) as is_high_rework,
  (wi.status = 'queued') as is_queued,
  (wi.status = 'blocked') as is_blocked
from public.work_items wi
where wi.archived_at is null;

revoke all privileges on public.member_workload_v from public, anon, authenticated;
revoke all privileges on public.work_item_flags_v from public, anon, authenticated;
grant select on public.member_workload_v to authenticated;
grant select on public.work_item_flags_v to authenticated;
