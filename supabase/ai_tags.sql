-- FlowMate AI Tags backend support
-- Run this AFTER rpc_quick_task.sql and collaboration_admin.sql.
-- This script is idempotent where practical.

create extension if not exists pgcrypto;

create table if not exists public.work_item_ai_tags (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  tag text not null,
  created_by_user_id uuid not null references public.users(id) on update cascade,
  created_at timestamptz not null default now(),
  constraint work_item_ai_tags_tag_not_empty check (length(trim(tag)) > 0),
  constraint work_item_ai_tags_tag_length check (char_length(trim(tag)) <= 64)
);

create index if not exists idx_work_item_ai_tags_work_item
on public.work_item_ai_tags(work_item_id, created_at);

create unique index if not exists idx_work_item_ai_tags_unique_normalized
on public.work_item_ai_tags(work_item_id, lower(trim(tag)));

alter table public.work_item_ai_tags enable row level security;

drop policy if exists "work item participants can read ai tags" on public.work_item_ai_tags;
create policy "work item participants can read ai tags"
on public.work_item_ai_tags for select
using (
  public.flowmate_can_read_work_item(work_item_id, public.current_app_user_id())
);

revoke all privileges on public.work_item_ai_tags from anon, authenticated;
revoke insert, update, delete on public.work_item_ai_tags from anon, authenticated;
grant select on public.work_item_ai_tags to authenticated;

create or replace function public.flowmate_ai_tags_resolve_work_item(
  p_display_id text default null,
  p_work_item_id uuid default null
)
returns public.work_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work public.work_items%rowtype;
begin
  if p_work_item_id is null and length(trim(coalesce(p_display_id, ''))) = 0 then
    raise exception 'Work item ID is required';
  end if;

  select *
  into v_work
  from public.work_items
  where (p_work_item_id is not null and id = p_work_item_id)
     or (p_work_item_id is null and display_id = trim(p_display_id));

  if v_work.id is null or v_work.archived_at is not null then
    raise exception 'Work item not found';
  end if;

  return v_work;
end;
$$;

revoke all on function public.flowmate_ai_tags_resolve_work_item(text, uuid) from public, anon, authenticated;

create or replace function public.list_work_item_ai_tags(
  p_display_id text default null,
  p_work_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_work public.work_items%rowtype;
  v_tags jsonb;
begin
  v_actor_id := public.flowmate_actor_user_id();
  v_work := public.flowmate_ai_tags_resolve_work_item(p_display_id, p_work_item_id);

  if not public.flowmate_can_read_work_item(v_work.id, v_actor_id) then
    raise exception 'You do not have access to this work item'
      using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'work_item_id', t.work_item_id,
        'display_id', v_work.display_id,
        'tag', t.tag,
        'created_by_user_id', t.created_by_user_id,
        'created_at', t.created_at
      )
      order by t.created_at, lower(t.tag)
    ),
    '[]'::jsonb
  )
  into v_tags
  from public.work_item_ai_tags t
  where t.work_item_id = v_work.id;

  return v_tags;
end;
$$;

revoke all on function public.list_work_item_ai_tags(text, uuid) from public, anon, authenticated;
grant execute on function public.list_work_item_ai_tags(text, uuid) to authenticated;

create or replace function public.add_work_item_ai_tag(
  p_tag text default null,
  p_display_id text default null,
  p_work_item_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_work public.work_items%rowtype;
  v_tag_text text;
  v_tag public.work_item_ai_tags%rowtype;
begin
  v_actor_id := public.flowmate_actor_user_id();
  v_work := public.flowmate_ai_tags_resolve_work_item(p_display_id, p_work_item_id);
  v_tag_text := trim(coalesce(p_tag, ''));

  if not public.flowmate_can_collaborate_on_work_item(v_work.id, v_actor_id) then
    raise exception 'Only requester, assignee, owner, or admin can add AI tags'
      using errcode = '42501';
  end if;

  if length(v_tag_text) = 0 then
    raise exception 'AI tag is required';
  end if;

  if char_length(v_tag_text) > 64 then
    raise exception 'AI tag must be 64 characters or less';
  end if;

  select *
  into v_tag
  from public.work_item_ai_tags t
  where t.work_item_id = v_work.id
    and lower(trim(t.tag)) = lower(v_tag_text);

  if v_tag.id is null then
    begin
      insert into public.work_item_ai_tags (
        work_item_id,
        tag,
        created_by_user_id
      )
      values (
        v_work.id,
        v_tag_text,
        v_actor_id
      )
      returning * into v_tag;
    exception
      when unique_violation then
        select *
        into v_tag
        from public.work_item_ai_tags t
        where t.work_item_id = v_work.id
          and lower(trim(t.tag)) = lower(v_tag_text);
    end;

    perform public.flowmate_create_collaboration_event(
      v_work.id,
      v_actor_id,
      'add_ai_tag',
      jsonb_build_object('ai_tag_id', v_tag.id, 'tag', v_tag.tag)
    );
  end if;

  return jsonb_build_object(
    'id', v_tag.id,
    'work_item_id', v_tag.work_item_id,
    'display_id', v_work.display_id,
    'tag', v_tag.tag,
    'created_by_user_id', v_tag.created_by_user_id,
    'created_at', v_tag.created_at
  );
end;
$$;

revoke all on function public.add_work_item_ai_tag(text, text, uuid) from public, anon, authenticated;
grant execute on function public.add_work_item_ai_tag(text, text, uuid) to authenticated;

create or replace function public.remove_work_item_ai_tag(
  p_ai_tag_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_tag public.work_item_ai_tags%rowtype;
  v_work public.work_items%rowtype;
begin
  v_actor_id := public.flowmate_actor_user_id();

  if p_ai_tag_id is null then
    raise exception 'AI tag ID is required';
  end if;

  select *
  into v_tag
  from public.work_item_ai_tags
  where id = p_ai_tag_id
  for update;

  if v_tag.id is null then
    raise exception 'AI tag not found';
  end if;

  select *
  into v_work
  from public.work_items
  where id = v_tag.work_item_id;

  if v_work.id is null or v_work.archived_at is not null then
    raise exception 'Work item not found';
  end if;

  if not public.flowmate_can_collaborate_on_work_item(v_work.id, v_actor_id) then
    raise exception 'Only requester, assignee, owner, or admin can remove AI tags'
      using errcode = '42501';
  end if;

  delete from public.work_item_ai_tags
  where id = v_tag.id;

  perform public.flowmate_create_collaboration_event(
    v_work.id,
    v_actor_id,
    'remove_ai_tag',
    jsonb_build_object('ai_tag_id', v_tag.id, 'tag', v_tag.tag)
  );

  return jsonb_build_object(
    'id', v_tag.id,
    'work_item_id', v_tag.work_item_id,
    'display_id', v_work.display_id,
    'tag', v_tag.tag,
    'removed', true
  );
end;
$$;

revoke all on function public.remove_work_item_ai_tag(uuid) from public, anon, authenticated;
grant execute on function public.remove_work_item_ai_tag(uuid) to authenticated;
