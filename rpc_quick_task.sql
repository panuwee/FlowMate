-- FlowMate MVP 1.0 RPC: create quick task
-- Run this in Supabase SQL Editor after schema.sql and seed.sql.

-- ---------------------------------------------------------------------------
-- Security helper: trust Supabase Auth, never client-supplied actor ids.
-- Existing RPC signatures keep p_actor_user_id for backward compatibility,
-- but function bodies resolve the actor from auth.uid() only.
-- ---------------------------------------------------------------------------
create or replace function public.flowmate_actor_user_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = v_user_id
      and u.is_active = true
  ) then
    raise exception 'Authenticated user is inactive or not found';
  end if;

  return v_user_id;
end;
$$;

grant execute on function public.flowmate_actor_user_id() to anon, authenticated;

create or replace function public.flowmate_assert_actor_matches(
  p_requested_actor_user_id uuid,
  p_authenticated_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_requested_actor_user_id is not null
     and p_requested_actor_user_id <> p_authenticated_user_id then
    raise exception 'Actor mismatch: request actor does not match authenticated user';
  end if;
end;
$$;

grant execute on function public.flowmate_assert_actor_matches(uuid, uuid) to anon, authenticated;

drop function if exists public.create_quick_task(
  uuid,
  text,
  date,
  text,
  text,
  uuid,
  public.priority_level
);
drop function if exists public.create_quick_task(
  uuid,
  text,
  date,
  text,
  text,
  uuid,
  text,
  public.priority_level
);
drop function if exists public.create_quick_task(
  uuid,
  text,
  date,
  date,
  text,
  text,
  text,
  uuid,
  text,
  public.priority_level
);

create or replace function public.create_quick_task(
  p_actor_user_id uuid,
  p_title text,
  p_due_date date,
  p_launch_date date,
  p_note text default null,
  p_project_name text default null,
  p_requester_team text default null,
  p_assignee_user_id uuid default null,
  p_assignee_other_name text default null,
  p_priority public.priority_level default 'normal'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_assignee public.users%rowtype;
  v_assignee_user_id uuid;
  v_assignee_other_name text;
  v_next_number integer;
  v_display_id text;
  v_work_item_id uuid;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select *
  into v_actor
  from public.users
  where id = v_actor_id;

  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Quick task title is required';
  end if;

  if p_due_date is null then
    raise exception 'Quick task 1st Review / Draft date is required';
  end if;

  if p_launch_date is null then
    raise exception 'Quick task launch date is required';
  end if;

  if length(trim(coalesce(p_requester_team, ''))) = 0 then
    raise exception 'Quick task requester team/function is required';
  end if;

  v_assignee_user_id := p_assignee_user_id;
  v_assignee_other_name := nullif(trim(coalesce(p_assignee_other_name, '')), '');

  if v_assignee_user_id is null and v_assignee_other_name is null then
    v_assignee_user_id := v_actor_id;
  end if;

  if v_assignee_user_id is not null then
    v_assignee_other_name := null;

    select *
    into v_assignee
    from public.users
    where id = v_assignee_user_id;

    if v_assignee.id is null or v_assignee.is_active = false then
      raise exception 'Assignee user is inactive or not found';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('flowmate_quick_task_display_id'));

  select coalesce(max((substring(display_id from 4))::integer), 2000) + 1
  into v_next_number
  from public.work_items
  where display_id ~ '^QT-[0-9]{4,}$';

  v_display_id := 'QT-' || lpad(v_next_number::text, 4, '0');

  insert into public.work_items (
    display_id,
    work_type,
    title,
    description,
    project_name,
    requester_user_id,
    requester_team,
    assignee_user_id,
    assignee_other_name,
    status,
    priority,
    due_date,
    launch_date
  )
  values (
    v_display_id,
    'quick_task',
    trim(p_title),
    nullif(trim(coalesce(p_note, '')), ''),
    nullif(trim(coalesce(p_project_name, '')), ''),
    v_actor_id,
    nullif(trim(coalesce(p_requester_team, '')), ''),
    v_assignee_user_id,
    v_assignee_other_name,
    'assigned',
    coalesce(p_priority, 'normal'),
    p_due_date,
    p_launch_date
  )
  returning id into v_work_item_id;

  insert into public.work_item_events (
    work_item_id,
    actor_user_id,
    event_type,
    to_status,
    metadata
  )
  values (
    v_work_item_id,
    v_actor_id,
    'created',
    'assigned',
    jsonb_build_object(
      'source', 'static_mvp',
      'work_type', 'quick_task',
      'assignee_user_id', v_assignee_user_id,
      'assignee_other_name', v_assignee_other_name
    )
  );

  return jsonb_build_object(
    'id', v_work_item_id,
    'display_id', v_display_id,
    'status', 'assigned'
  );
end;
$$;

grant execute on function public.create_quick_task(
  uuid,
  text,
  date,
  date,
  text,
  text,
  text,
  uuid,
  text,
  public.priority_level
) to anon, authenticated;

create or replace function public.complete_quick_task(
  p_actor_user_id uuid,
  p_display_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_work public.work_items%rowtype;
  v_prev_status public.work_status;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select *
  into v_actor
  from public.users
  where id = v_actor_id;

  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  select *
  into v_work
  from public.work_items
  where display_id = p_display_id
  for update;

  if v_work.id is null then
    raise exception 'Work item not found';
  end if;

  if v_work.work_type <> 'quick_task' then
    raise exception 'Only quick tasks can be completed with this action';
  end if;

  if v_work.status in ('delivered', 'cancelled') then
    return jsonb_build_object(
      'id', v_work.id,
      'display_id', v_work.display_id,
      'status', v_work.status
    );
  end if;

  if v_work.requester_user_id <> v_actor_id and v_work.assignee_user_id <> v_actor_id then
    raise exception 'Only requester or assignee can complete this quick task';
  end if;

  v_prev_status := v_work.status;

  update public.work_items
  set
    status = 'delivered',
    delivered_at = now(),
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
    'status_changed',
    v_prev_status,
    'delivered',
    jsonb_build_object(
      'source', 'static_mvp',
      'action', 'complete_quick_task'
    )
  );

  return jsonb_build_object(
    'id', v_work.id,
    'display_id', v_work.display_id,
    'status', v_work.status
  );
end;
$$;

grant execute on function public.complete_quick_task(
  uuid,
  text
) to anon, authenticated;

create or replace function public.add_quick_task_checklist_item(
  p_actor_user_id uuid,
  p_display_id text,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_work public.work_items%rowtype;
  v_item_id uuid;
  v_sort_order integer;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;

  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Checklist title is required';
  end if;

  select * into v_work
  from public.work_items
  where display_id = p_display_id
  for update;

  if v_work.id is null then
    raise exception 'Work item not found';
  end if;

  if v_work.work_type <> 'quick_task' then
    raise exception 'Checklist MVP action is currently enabled for quick tasks only';
  end if;

  if v_work.requester_user_id <> v_actor_id and v_work.assignee_user_id <> v_actor_id then
    raise exception 'Only requester or assignee can edit this quick task checklist';
  end if;

  select coalesce(max(sort_order), 0) + 1
  into v_sort_order
  from public.checklist_items
  where work_item_id = v_work.id;

  insert into public.checklist_items (
    work_item_id,
    title,
    sort_order,
    created_by_user_id
  )
  values (
    v_work.id,
    trim(p_title),
    v_sort_order,
    v_actor_id
  )
  returning id into v_item_id;

  insert into public.work_item_events (
    work_item_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    v_work.id,
    v_actor_id,
    'checklist_changed',
    jsonb_build_object('source', 'static_mvp', 'action', 'add_checklist_item', 'checklist_item_id', v_item_id)
  );

  return jsonb_build_object(
    'id', v_item_id,
    'display_id', v_work.display_id,
    'title', trim(p_title),
    'is_done', false
  );
end;
$$;

grant execute on function public.add_quick_task_checklist_item(
  uuid,
  text,
  text
) to anon, authenticated;

create or replace function public.toggle_quick_task_checklist_item(
  p_actor_user_id uuid,
  p_checklist_item_id uuid,
  p_is_done boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_item public.checklist_items%rowtype;
  v_work public.work_items%rowtype;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;

  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  select * into v_item
  from public.checklist_items
  where id = p_checklist_item_id
  for update;

  if v_item.id is null then
    raise exception 'Checklist item not found';
  end if;

  select * into v_work
  from public.work_items
  where id = v_item.work_item_id
  for update;

  if v_work.work_type <> 'quick_task' then
    raise exception 'Checklist MVP action is currently enabled for quick tasks only';
  end if;

  if v_work.requester_user_id <> v_actor_id and v_work.assignee_user_id <> v_actor_id then
    raise exception 'Only requester or assignee can edit this quick task checklist';
  end if;

  update public.checklist_items
  set
    is_done = coalesce(p_is_done, false),
    completed_at = case when coalesce(p_is_done, false) then now() else null end
  where id = p_checklist_item_id
  returning * into v_item;

  insert into public.work_item_events (
    work_item_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    v_work.id,
    v_actor_id,
    'checklist_changed',
    jsonb_build_object(
      'source', 'static_mvp',
      'action', 'toggle_checklist_item',
      'checklist_item_id', v_item.id,
      'is_done', v_item.is_done
    )
  );

  return jsonb_build_object(
    'id', v_item.id,
    'display_id', v_work.display_id,
    'title', v_item.title,
    'is_done', v_item.is_done
  );
end;
$$;

grant execute on function public.toggle_quick_task_checklist_item(
  uuid,
  uuid,
  boolean
) to anon, authenticated;

drop function if exists public.add_work_item_comment(
  uuid,
  text,
  text
);

create or replace function public.add_work_item_comment(
  p_actor_user_id uuid,
  p_display_id text,
  p_body text,
  p_mentioned_user_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_work public.work_items%rowtype;
  v_comment_id uuid;
  v_mentioned_user_ids uuid[];
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;

  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Comment body is required';
  end if;

  select * into v_work
  from public.work_items
  where display_id = p_display_id;

  if v_work.id is null then
    raise exception 'Work item not found';
  end if;

  if v_work.requester_user_id <> v_actor_id
    and (v_work.assignee_user_id is null or v_work.assignee_user_id <> v_actor_id) then
    raise exception 'Only requester or assignee can comment on this item in MVP';
  end if;

  select coalesce(array_agg(distinct u.id), '{}'::uuid[])
  into v_mentioned_user_ids
  from unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[])) as mentioned(user_id)
  join public.users u
    on u.id = mentioned.user_id
   and u.is_active = true;

  insert into public.comments (
    work_item_id,
    author_user_id,
    body
  )
  values (
    v_work.id,
    v_actor_id,
    trim(p_body)
  )
  returning id into v_comment_id;

  insert into public.work_item_events (
    work_item_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    v_work.id,
    v_actor_id,
    'commented',
    jsonb_build_object(
      'source', 'static_mvp',
      'action', 'add_comment',
      'comment_id', v_comment_id,
      'body', trim(p_body),
      'mentioned_user_ids', coalesce(v_mentioned_user_ids, '{}'::uuid[])
    )
  );

  return jsonb_build_object(
    'id', v_comment_id,
    'display_id', v_work.display_id,
    'body', trim(p_body),
    'mentioned_user_ids', coalesce(v_mentioned_user_ids, '{}'::uuid[])
  );
end;
$$;

grant execute on function public.add_work_item_comment(
  uuid,
  text,
  text,
  uuid[]
) to anon, authenticated;

create or replace function public.update_own_work_item_comment(
  p_actor_user_id uuid,
  p_comment_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_comment public.comments%rowtype;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;

  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  if length(trim(coalesce(p_body, ''))) = 0 then
    raise exception 'Comment body is required';
  end if;

  select * into v_comment
  from public.comments
  where id = p_comment_id
  for update;

  if v_comment.id is null or v_comment.deleted_at is not null then
    raise exception 'Comment not found';
  end if;

  if v_comment.author_user_id <> v_actor_id then
    raise exception 'Only the author can edit this comment';
  end if;

  update public.comments
  set
    body = trim(p_body),
    updated_at = now()
  where id = p_comment_id
  returning * into v_comment;

  insert into public.work_item_events (
    work_item_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    v_comment.work_item_id,
    v_actor_id,
    'commented',
    jsonb_build_object('source', 'static_mvp', 'action', 'update_comment', 'comment_id', v_comment.id)
  );

  return jsonb_build_object(
    'id', v_comment.id,
    'body', v_comment.body
  );
end;
$$;

grant execute on function public.update_own_work_item_comment(
  uuid,
  uuid,
  text
) to anon, authenticated;

create or replace function public.delete_own_work_item_comment(
  p_actor_user_id uuid,
  p_comment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_comment public.comments%rowtype;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;

  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  select * into v_comment
  from public.comments
  where id = p_comment_id
  for update;

  if v_comment.id is null or v_comment.deleted_at is not null then
    raise exception 'Comment not found';
  end if;

  if v_comment.author_user_id <> v_actor_id then
    raise exception 'Only the author can delete this comment';
  end if;

  update public.comments
  set
    deleted_at = now(),
    updated_at = now()
  where id = p_comment_id
  returning * into v_comment;

  insert into public.work_item_events (
    work_item_id,
    actor_user_id,
    event_type,
    metadata
  )
  values (
    v_comment.work_item_id,
    v_actor_id,
    'commented',
    jsonb_build_object('source', 'static_mvp', 'action', 'delete_comment', 'comment_id', v_comment.id)
  );

  return jsonb_build_object(
    'id', v_comment.id,
    'deleted', true
  );
end;
$$;

grant execute on function public.delete_own_work_item_comment(
  uuid,
  uuid
) to anon, authenticated;

create or replace function public.transition_creative_work_status(
  p_actor_user_id uuid,
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
  v_actor public.users%rowtype;
  v_work public.work_items%rowtype;
  v_owner_user_id uuid;
  v_from_status public.work_status;
  v_wip_now int;
  v_wip_limit int;
  v_queue_drain jsonb := null;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;

  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  select *
  into v_work
  from public.work_items
  where display_id = p_display_id
  for update;

  if v_work.id is null then
    raise exception 'Work item not found';
  end if;

  if v_work.work_type <> 'creative_request' then
    raise exception 'This transition is only for creative requests';
  end if;

  select user_id
  into v_owner_user_id
  from public.team_members
  where id = v_work.final_owner_member_id;

  -- Owner WIP snapshot used by the review-round + blocked-resume branches.
  select coalesce(count(*) filter (where wi.status = 'in_progress' and wi.wip_counted = true), 0),
         coalesce(tm.wip_limit, 0)
    into v_wip_now, v_wip_limit
    from public.team_members tm
    left join public.work_items wi on wi.final_owner_member_id = tm.id and wi.id <> v_work.id
   where tm.id = v_work.final_owner_member_id
   group by tm.wip_limit;

  v_from_status := v_work.status;

  if p_next_status = 'in_progress' and v_from_status = 'assigned' then
    if v_owner_user_id is null or v_owner_user_id <> v_actor_id then
      raise exception 'Only owner can start this work';
    end if;
    if v_work.final_owner_member_id is not null and v_wip_now >= v_wip_limit then
      raise exception 'WIP limit reached for owner; finish or block another item first';
    end if;

    update public.work_items
    set status = 'in_progress',
        wip_counted = true,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  elsif p_next_status = 'review' and v_from_status = 'in_progress' then
    if v_owner_user_id is null or v_owner_user_id <> v_actor_id then
      raise exception 'Only owner can submit this work for review';
    end if;

    if length(trim(coalesce(p_delivery_link, v_work.delivery_link, ''))) = 0 then
      raise exception 'Delivery link is required before review';
    end if;

    update public.work_items
    set status = 'review',
        delivery_link = trim(coalesce(p_delivery_link, v_work.delivery_link)),
        wip_counted = false,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  elsif p_next_status = 'delivered' and v_from_status = 'review' then
    if v_work.requester_user_id <> v_actor_id then
      raise exception 'Only requester can approve delivery';
    end if;

    update public.work_items
    set status = 'delivered',
        delivered_at = now(),
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  elsif p_next_status = 'in_progress' and v_from_status = 'review' then
    -- Requester requests changes; review_round increments only here (rules §15).
    if v_work.requester_user_id <> v_actor_id then
      raise exception 'Only requester can request changes';
    end if;
    -- WIP gate (rules §15): do not increment if owner is at WIP limit.
    if v_work.final_owner_member_id is not null and v_wip_now >= v_wip_limit then
      raise exception 'Owner WIP limit reached; cannot reopen for changes yet';
    end if;

    update public.work_items
    set status = 'in_progress',
        review_round = review_round + 1,
        wip_counted = true,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  elsif p_next_status = 'blocked' and v_from_status in ('assigned', 'in_progress', 'review') then
    if v_owner_user_id is null or v_owner_user_id <> v_actor_id then
      raise exception 'Only owner can block this work';
    end if;

    if length(trim(coalesce(p_blocked_reason, ''))) = 0 then
      raise exception 'Blocked reason is required';
    end if;

    update public.work_items
    set status = 'blocked',
        blocked_reason = trim(p_blocked_reason),
        blocked_from = v_from_status,
        wip_counted = false,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  -- Unblock paths --------------------------------------------------------
  elsif p_next_status = 'in_progress' and v_from_status = 'blocked' then
    if v_owner_user_id is null or v_owner_user_id <> v_actor_id then
      raise exception 'Only owner can resume this work';
    end if;
    if v_work.final_owner_member_id is not null and v_wip_now >= v_wip_limit then
      raise exception 'WIP limit reached for owner; cannot resume to In Progress';
    end if;

    update public.work_items
    set status = 'in_progress',
        wip_counted = true,
        blocked_reason = null,
        blocked_from = null,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  elsif p_next_status = 'assigned' and v_from_status = 'blocked' then
    if v_owner_user_id is null or v_owner_user_id <> v_actor_id then
      raise exception 'Only owner can resume this work';
    end if;

    update public.work_items
    set status = 'assigned',
        wip_counted = false,
        blocked_reason = null,
        blocked_from = null,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  -- Cancellation (UAT-033) -----------------------------------------------
  elsif p_next_status = 'cancelled' and v_from_status not in ('delivered', 'cancelled') then
    if v_work.requester_user_id <> v_actor_id
       and (v_owner_user_id is null or v_owner_user_id <> v_actor_id) then
      raise exception 'Only requester or current owner can cancel this work';
    end if;
    if length(trim(coalesce(p_cancel_reason, ''))) = 0 then
      raise exception 'Cancel reason is required';
    end if;

    update public.work_items
    set status = 'cancelled',
        cancel_reason = trim(p_cancel_reason),
        wip_counted = false,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  else
    raise exception 'Unsupported status transition: % to %', v_from_status, p_next_status;
  end if;

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
      'delivery_link_set', p_delivery_link is not null,
      'blocked_reason_set', p_blocked_reason is not null,
      'cancel_reason_set', p_cancel_reason is not null
    )
  );

  if p_next_status in ('delivered', 'cancelled') then
    v_queue_drain := public.flowmate_rerun_queued_creative_requests(10);
  end if;

  return jsonb_build_object(
    'id', v_work.id,
    'display_id', v_work.display_id,
    'status', v_work.status,
    'review_round', v_work.review_round,
    'queue_drain', v_queue_drain
  );
end;
$$;

-- Drop the old 5-arg signature (pre-cancel-reason) if it lingers from a prior deploy.
drop function if exists public.transition_creative_work_status(
  uuid, text, public.work_status, text, text
);

grant execute on function public.transition_creative_work_status(
  uuid,
  text,
  public.work_status,
  text,
  text,
  text
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- cancel_quick_task: simple cancellation for quick tasks (UAT-033).
-- Owner or requester only; reason required.
-- ---------------------------------------------------------------------------
create or replace function public.cancel_quick_task(
  p_actor_user_id uuid,
  p_display_id text,
  p_cancel_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_work public.work_items%rowtype;
  v_from_status public.work_status;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;
  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  if length(trim(coalesce(p_cancel_reason, ''))) = 0 then
    raise exception 'Cancel reason is required';
  end if;

  select * into v_work
    from public.work_items
   where display_id = p_display_id
   for update;

  if v_work.id is null then raise exception 'Work item not found'; end if;
  if v_work.work_type <> 'quick_task' then
    raise exception 'cancel_quick_task only applies to quick tasks';
  end if;
  if v_work.status in ('delivered', 'cancelled') then
    raise exception 'Quick task is already finalized';
  end if;
  if v_work.requester_user_id <> v_actor_id
     and (v_work.assignee_user_id is null or v_work.assignee_user_id <> v_actor_id) then
    raise exception 'Only requester or assignee can cancel this quick task';
  end if;

  v_from_status := v_work.status;

  update public.work_items
     set status = 'cancelled',
         cancel_reason = trim(p_cancel_reason),
         wip_counted = false,
         updated_at = now()
   where id = v_work.id
   returning * into v_work;

  insert into public.work_item_events(
    work_item_id, actor_user_id, event_type, from_status, to_status, metadata
  ) values (
    v_work.id, v_actor_id, 'cancelled', v_from_status, 'cancelled',
    jsonb_build_object('source', 'rpc', 'cancel_reason_set', true)
  );

  return jsonb_build_object('id', v_work.id, 'display_id', v_work.display_id, 'status', 'cancelled');
end;
$$;

grant execute on function public.cancel_quick_task(uuid, text, text) to anon, authenticated;
