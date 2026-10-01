-- Reviewed local installer: requires workflow_team_workspaces.sql and task_assign_module.sql.
-- Production application requires separate authorization. No legacy data backfill.
begin;
alter table public.work_items
  add column if not exists task_request_state text not null default 'accepted',
  add column if not exists task_requested_deadline date,
  add column if not exists task_committed_deadline date,
  add column if not exists task_reference_links text[] not null default '{}',
  add column if not exists task_confidential boolean not null default false,
  add column if not exists task_collaborator_ids uuid[] not null default '{}',
  add column if not exists task_parent_id uuid references public.work_items(id),
  add column if not exists task_request_key uuid;
alter table public.work_items alter column due_date drop not null;
-- Quick Tasks can submit textual deliverables; retain the installed review-link
-- rule exactly for Creative Requests (some deployments already relaxed it).
do $$ declare definition text; begin
  select pg_get_expr(conbin,conrelid) into definition from pg_constraint where conname='work_items_review_delivery_link' and conrelid='public.work_items'::regclass;
  if definition is not null and position('quick_task' in definition)=0 then
    alter table public.work_items drop constraint work_items_review_delivery_link;
    execute 'alter table public.work_items add constraint work_items_review_delivery_link check (work_type = ''quick_task'' or ('||definition||')) not valid';
  end if;
end $$;
-- Workspace events have one notification path; avoid duplicate legacy alerts.
do $$ declare fn text; definition text; begin
  foreach fn in array array['flowmate_notify_collaboration_event','flowmate_notify_work_item_event'] loop
    if to_regprocedure('public.'||fn||'()') is not null then
      select pg_get_functiondef(to_regprocedure('public.'||fn||'()')) into definition;
      if position('task_assign_workspace' in definition)=0 then
        execute regexp_replace(definition,'\mbegin\M',$inject$begin
          if new.metadata->>'source'='task_assign_workspace' then return new; end if;
        $inject$,'i');
      end if;
    end if;
  end loop;
end $$;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='task_assign_dates_required' and conrelid='public.work_items'::regclass) then
    alter table public.work_items add constraint task_assign_dates_required check(work_type='quick_task' or due_date is not null) not valid;
    alter table public.work_items add constraint task_assign_request_state_valid check(task_request_state in ('pending','accepted','need_information','rejected'));
  end if;
end $$;
create unique index if not exists task_assign_request_key_unique on public.work_items(requester_user_id,task_request_key) where task_request_key is not null;
create index if not exists task_assign_requester_team_idx on public.work_items(requester_team,task_request_state) where work_type='quick_task';
create table if not exists public.task_assign_dispatchers (
  team_code text not null references public.teams(code), user_id uuid not null references public.users(id), primary key(team_code,user_id)
);
alter table public.task_assign_dispatchers enable row level security;
revoke all on public.task_assign_dispatchers from public,anon,authenticated;

-- Respect the installed lifecycle gate when present (including scheduled suspension).
create or replace function public.task_assign_member_access_allowed(p_user uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare allowed boolean; begin
  if not exists(select 1 from public.users where id=p_user and is_active) then return false; end if;
  if to_regprocedure('public.flowmate_member_access_allowed(uuid)') is not null then
    execute 'select public.flowmate_member_access_allowed($1)' into allowed using p_user;
    return coalesce(allowed,false);
  end if;
  return true;
end $$;
create or replace function public.task_assign_actor_user_id()
returns uuid language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=public.flowmate_actor_user_id(); begin
  if not public.task_assign_member_access_allowed(actor) then raise exception 'Account access is suspended'; end if;
  return actor;
end $$;
create or replace function public.task_assign_user_is_team_member(p_user uuid,p_team text)
returns boolean language sql stable security definer set search_path='' as $$
  select public.task_assign_member_access_allowed(p_user) and public.flowmate_user_is_team_member(p_user,p_team);
$$;
create or replace function public.task_assign_assignee_can_commit(p_user uuid,p_team text,p_end date)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare allowed boolean; begin
  if p_end is null or not public.task_assign_user_is_team_member(p_user,p_team) then return false; end if;
  if to_regprocedure('public.flowmate_member_can_assign(uuid,date)') is not null then
    execute 'select not exists(select 1 from public.team_members tm where tm.user_id=$1 and not public.flowmate_member_can_assign(tm.id,$2))'
      into allowed using p_user,p_end;
    return coalesce(allowed,false);
  end if;
  return true;
end $$;
-- The existing member guard checks an end date against staff lifecycle dates.
-- For Quick Tasks that date is the delivery commitment, not the optional review.
do $$ declare definition text; signature regprocedure; begin
  signature:=to_regprocedure('flowmate_members_private.guard_assignment()');
  if signature is not null then
    select pg_get_functiondef(signature) into definition;
    if position('task_assign_deadline' in definition)=0 then
      execute replace(definition,'new.due_date','(case when new.work_type=''quick_task'' then coalesce(new.launch_date,new.due_date) else new.due_date end /* task_assign_deadline */)');
    end if;
  end if;
end $$;
create or replace function public.task_assign_can_dispatch(p_user uuid,p_team text)
returns boolean language sql stable security definer set search_path='' as $$
  select public.task_assign_member_access_allowed(p_user) and (exists(select 1 from public.users where id=p_user and role='admin') or (public.task_assign_user_is_team_member(p_user,p_team)
    and exists(select 1 from public.task_assign_dispatchers where user_id=p_user and team_code=p_team)));
$$;
create or replace function public.task_assign_can_read(p_user uuid,p_item uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.work_items w join public.users u on u.id=p_user and u.is_active
    where w.id=p_item and w.work_type='quick_task' and public.task_assign_member_access_allowed(p_user) and (
      u.role='admin' or (w.requester_user_id=p_user and public.flowmate_user_can_access_team(p_user,public.flowmate_normalize_team_code(w.requester_team)))
      or (w.assignee_user_id=p_user and public.task_assign_user_is_team_member(p_user,w.owning_team_code))
      or (p_user=any(w.task_collaborator_ids) and (public.task_assign_user_is_team_member(p_user,public.flowmate_normalize_team_code(w.requester_team))
        or public.task_assign_user_is_team_member(p_user,w.owning_team_code)))
      or (not w.task_confidential and (public.flowmate_user_has_all_team_access(p_user) or public.task_assign_user_is_team_member(p_user,public.flowmate_normalize_team_code(w.requester_team))
        or public.task_assign_user_is_team_member(p_user,w.owning_team_code)))));
$$;
create or replace function public.task_assign_can_execute(p_user uuid,p_item uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.work_items w where w.id=p_item and w.work_type='quick_task' and public.task_assign_can_read(p_user,p_item)
    and w.task_request_state='accepted' and (public.task_assign_can_dispatch(p_user,w.owning_team_code)
      or (w.assignee_user_id=p_user and public.task_assign_user_is_team_member(p_user,w.owning_team_code))));
$$;
create or replace function public.task_assign_current_notification_visible(p_item uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.work_items w where w.id=p_item and (w.work_type<>'quick_task' or public.task_assign_can_read(auth.uid(),w.id)));
$$;
drop policy if exists task_assign_notification_guard on public.notifications;
create policy task_assign_notification_guard on public.notifications as restrictive for select to authenticated
  using(work_item_id is null or public.task_assign_current_notification_visible(work_item_id));

-- Prevent legacy notification delivery from sending content to former watchers
-- or members. Preserve the installed notification implementation and its ACL.
do $$ declare definition text; signature regprocedure; begin
  signature:=to_regprocedure('public.flowmate_create_notification(uuid,text,text,text,uuid,uuid,uuid,jsonb,text)');
  if signature is not null then
    select pg_get_functiondef(signature) into definition;
    if position('task_assign_can_read' in definition)=0 then
      definition:=regexp_replace(definition,'\mbegin\M',$inject$begin
        if exists(select 1 from public.work_items where id=p_work_item_id and work_type='quick_task')
          and not public.task_assign_can_read(p_user_id,p_work_item_id) then return null; end if;
      $inject$,'i');
      execute definition;
    end if;
  end if;
end $$;
create or replace function public.task_assign_notify(p_item uuid,p_action text)
returns void language plpgsql security definer set search_path='' as $$
declare w public.work_items%rowtype; recipient uuid; begin
  if to_regprocedure('public.flowmate_create_notification(uuid,text,text,text,uuid,uuid,uuid,jsonb,text)') is null then return; end if;
  select * into w from public.work_items where id=p_item and work_type='quick_task';
  for recipient in select distinct candidate from (
    select w.requester_user_id candidate union all select w.assignee_user_id
    union all select unnest(w.task_collaborator_ids)
    union all select user_id from public.task_assign_dispatchers where team_code=w.owning_team_code
  ) recipients where candidate is not null and candidate is distinct from auth.uid() and public.task_assign_can_read(candidate,p_item) loop
    perform public.flowmate_create_notification(recipient,'status_changed','Task Assign: '||w.display_id,
      p_action||' · '||w.title,w.id,auth.uid(),null,jsonb_build_object('action',p_action,'display_id',w.display_id),
      'task_assign:'||w.id::text||':'||w.updated_at::text||':'||p_action||':'||recipient::text);
  end loop;
end $$;

-- Preserve the installed Creative Request helpers (including subsequent fixes).
-- CREATE OR REPLACE keeps original OIDs so existing RLS and RPC callers use the wrappers.
do $$ declare f text; sig text; definition text; begin
  foreach f in array array['flowmate_user_can_access_work_item','flowmate_user_can_read_work_item','flowmate_current_user_can_mutate_work_item','can_update_work_item'] loop
    sig:=case when f like 'flowmate_user_%' then 'uuid,uuid' else 'uuid' end;
    if to_regprocedure('public.task_assign_legacy_'||f||'('||sig||')') is null then
      select pg_get_functiondef(to_regprocedure('public.'||f||'('||sig||')')) into definition;
      if definition is null then raise exception 'Missing prerequisite: %',f; end if;
      execute replace(definition,'public.'||f||'(','public.task_assign_legacy_'||f||'(');
      execute 'revoke all on function public.task_assign_legacy_'||f||'('||sig||') from public,anon,authenticated';
    end if;
  end loop;
end $$;
create or replace function public.flowmate_user_can_read_work_item(p_user_id uuid,p_work_item_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from public.work_items where id=p_work_item_id and work_type='quick_task')
    then public.task_assign_can_read(p_user_id,p_work_item_id) else public.task_assign_legacy_flowmate_user_can_read_work_item(p_user_id,p_work_item_id) end;
$$;
create or replace function public.flowmate_user_can_access_work_item(p_user_id uuid,p_work_item_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from public.work_items where id=p_work_item_id and work_type='quick_task')
    then public.task_assign_can_read(p_user_id,p_work_item_id) else public.task_assign_legacy_flowmate_user_can_access_work_item(p_user_id,p_work_item_id) end;
$$;
create or replace function public.flowmate_current_user_can_mutate_work_item(p_work_item_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from public.work_items where id=p_work_item_id and work_type='quick_task')
    then public.task_assign_can_execute(auth.uid(),p_work_item_id) else public.task_assign_legacy_flowmate_current_user_can_mutate_work_item(p_work_item_id) end;
$$;
create or replace function public.can_update_work_item(target_work_item_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from public.work_items where id=target_work_item_id and work_type='quick_task')
    then public.task_assign_can_execute(auth.uid(),target_work_item_id) else public.task_assign_legacy_can_update_work_item(target_work_item_id) end;
$$;

create or replace function public.task_assign_validate_write(p_old jsonb,p_new jsonb,p_op text)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); item uuid; team text; old_status text; new_status text; begin
  if public.flowmate_is_trusted_database_context() then return; end if;
  perform public.task_assign_actor_user_id();
  if p_op='DELETE' then raise exception 'Archive tasks instead of deleting them'; end if;
  team:=p_new->>'owning_team_code';
  if team not in ('mkt','ops','esport') or not exists(select 1 from public.teams where code=team and is_active) then raise exception 'Receiving team is invalid'; end if;
  if p_op='INSERT' then
    if (p_new->>'requester_user_id')::uuid<>actor or not public.flowmate_user_can_access_team(actor,p_new->>'requester_team') then raise exception 'Source workspace is unauthorized'; end if;
    return;
  end if;
  item:=(p_old->>'id')::uuid;
  if p_old->>'work_type'<>'quick_task' or not public.task_assign_can_read(actor,item) then raise exception 'Task is unavailable'; end if;
  if (p_new->'requester_user_id',p_new->'requester_team',p_new->'work_type',p_new->'id') is distinct from
    (p_old->'requester_user_id',p_old->'requester_team',p_old->'work_type',p_old->'id') then raise exception 'Task identity cannot change'; end if;
  if (p_new->'title',p_new->'description',p_new->'task_confidential',p_new->'task_collaborator_ids',p_new->'task_reference_links',p_new->'task_parent_id',p_new->'priority',p_new->'urgent_reason',p_new->'task_requested_deadline')
    is distinct from (p_old->'title',p_old->'description',p_old->'task_confidential',p_old->'task_collaborator_ids',p_old->'task_reference_links',p_old->'task_parent_id',p_old->'priority',p_old->'urgent_reason',p_old->'task_requested_deadline')
    and actor<>(p_old->>'requester_user_id')::uuid and not public.is_admin_app_user() then raise exception 'Requester must edit the brief'; end if;
  if (p_new->'assignee_user_id',p_new->'task_committed_deadline',p_new->'task_request_state',p_new->'owning_team_code') is distinct from
    (p_old->'assignee_user_id',p_old->'task_committed_deadline',p_old->'task_request_state',p_old->'owning_team_code')
    and not public.task_assign_can_dispatch(actor,p_old->>'owning_team_code')
    and not (actor=(p_old->>'requester_user_id')::uuid and (p_old->>'task_request_state'<>'accepted' or p_old->>'status' in ('delivered','cancelled'))) then
    raise exception 'Receiving dispatcher must assign or accept work'; end if;
  old_status:=p_old->>'status'; new_status:=p_new->>'status';
  if new_status is distinct from old_status then
    if new_status='delivered' then
      if old_status<>'review' or (actor<>(p_old->>'requester_user_id')::uuid and not public.is_admin_app_user()) then raise exception 'Requester must review before confirming delivery'; end if;
    elsif new_status='cancelled' then
      if actor<>(p_old->>'requester_user_id')::uuid and not public.task_assign_can_dispatch(actor,p_old->>'owning_team_code') then raise exception 'Requester or dispatcher required'; end if;
    elsif not public.task_assign_can_execute(actor,item)
      and not (p_old->>'task_request_state'<>'accepted' and public.task_assign_can_dispatch(actor,p_old->>'owning_team_code'))
      and not (actor=(p_old->>'requester_user_id')::uuid and (new_status='queued' or old_status='review'))
      and not public.is_admin_app_user() then raise exception 'Responsible assignee or dispatcher required'; end if;
  end if;
end $$;
-- The existing trigger's non-Quick-Task branch remains byte-for-byte intact.
do $$ declare definition text; begin
  select pg_get_functiondef('public.flowmate_guard_work_item_team()'::regprocedure) into definition;
  if position('task_assign_validate_write' in definition)=0 then
    definition:=regexp_replace(definition,'\mbegin\M',$inject$begin
      if (tg_op<>'INSERT' and old.work_type='quick_task') or (tg_op<>'DELETE' and new.work_type='quick_task') then
        perform public.task_assign_validate_write(case when tg_op='INSERT' then null else to_jsonb(old) end,
          case when tg_op='DELETE' then null else to_jsonb(new) end,tg_op);
        if tg_op='DELETE' then return old; end if;
        return new;
      end if;
    $inject$,'i');
    execute definition;
  end if;
end $$;

create or replace function public.task_assign_members(p_team text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.task_assign_actor_user_id(); begin
  -- Minimal routing directory, no email or task content. An eligible requester
  -- needs to select a confidential dispatcher before a request exists.
  if p_team is null or p_team not in ('mkt','ops','esport') or not exists(select 1 from public.teams where code=p_team and is_active)
    or not exists(select 1 from public.teams where code in ('mkt','ops','esport') and public.flowmate_user_can_access_team(actor,code)) then raise exception 'Team directory is unavailable'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('userId',u.id,'name',tm.display_name,'teamKey',m.team_code,
    'dispatcher',exists(select 1 from public.task_assign_dispatchers d where d.user_id=u.id and d.team_code=p_team)) order by tm.display_name)
    from public.users u join public.user_team_memberships m on m.user_id=u.id
    join public.team_members tm on tm.user_id=u.id and tm.active
    where public.task_assign_member_access_allowed(u.id) and m.team_code=p_team),'[]'::jsonb);
end $$;
create or replace function public.task_assign_comment(p_display_id text,p_body text,p_comment_id uuid default null,p_delete boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.task_assign_actor_user_id(); item uuid; begin
  select id into item from public.work_items where display_id=p_display_id and work_type='quick_task' and archived_at is null;
  if item is null or not public.task_assign_can_read(actor,item) then raise exception 'Task is unavailable'; end if;
  if p_comment_id is null and p_delete then raise exception 'Comment is required'; end if;
  if not p_delete and length(trim(coalesce(p_body,'')))=0 then raise exception 'Comment cannot be empty'; end if;
  if p_comment_id is null then insert into public.comments(work_item_id,author_user_id,body) values(item,actor,trim(p_body));
  else
    perform 1 from public.comments where id=p_comment_id and work_item_id=item and author_user_id=actor for update;
    if not found then raise exception 'Only the author can change this comment'; end if;
    if p_delete then delete from public.comments where id=p_comment_id;
    else update public.comments set body=trim(p_body),updated_at=now() where id=p_comment_id; end if;
  end if;
  insert into public.work_item_events(work_item_id,actor_user_id,event_type,metadata) values(item,actor,'commented',jsonb_build_object('source','task_assign_workspace','action',case when p_delete then 'delete_comment' when p_comment_id is null then 'add_comment' else 'edit_comment' end));
  perform public.task_assign_notify(item,'comment_updated');
end $$;

-- Restrictive SELECT policies prevent a permissive legacy policy from exposing
-- Quick Tasks or child content. Creative Request policy results are unchanged.
do $$ declare tab text; condition text; begin
  foreach tab in array array['work_items','comments','work_item_events','checklist_items','work_item_links','work_item_watchers','work_item_ai_tags','flowmate_capacity_allocations'] loop
    execute format('alter table public.%I enable row level security',tab);
    execute format('drop policy if exists task_assign_visibility_guard on public.%I',tab);
    condition:=case when tab='work_items' then '(work_type <> ''quick_task'' or public.flowmate_current_user_can_read_work_item(id))'
      else 'public.flowmate_current_user_can_read_work_item(work_item_id)' end;
    execute format('create policy task_assign_visibility_guard on public.%I as restrictive for select to authenticated using (%s)',tab,condition);
  end loop;
end $$;
create or replace function public.task_assign_set_dispatcher(p_team text,p_user uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform public.task_assign_actor_user_id();
  if not public.is_admin_app_user() then raise exception 'Administrator required'; end if;
  if not public.task_assign_user_is_team_member(p_user,p_team) then raise exception 'Dispatcher must be an active team member'; end if;
  if p_enabled then insert into public.task_assign_dispatchers values(p_team,p_user) on conflict do nothing;
  else delete from public.task_assign_dispatchers where team_code=p_team and user_id=p_user; end if;
end $$;

create or replace function public.task_assign_create(p_source_team text,p_responsible_team text,p_title text,p_note text,p_deadline date,
  p_request_key uuid,p_review_date date default null,p_project text default null,p_assignee uuid default null,
  p_priority public.priority_level default 'normal',p_urgent_reason text default null,p_references text[] default '{}',
  p_confidential boolean default false,p_collaborators uuid[] default '{}',p_parent uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.task_assign_actor_user_id(); target uuid; display text; cross_team boolean; state text; n integer; begin
  if p_source_team is null or p_source_team not in ('mkt','ops','esport') or not public.flowmate_user_can_access_team(actor,p_source_team) then raise exception 'Choose an authorized source workspace'; end if;
  if p_responsible_team is null or p_responsible_team not in ('mkt','ops','esport') or not exists(select 1 from public.teams where code=p_responsible_team and is_active) then raise exception 'Choose an active receiving team'; end if;
  if length(trim(coalesce(p_title,'')))=0 or length(trim(coalesce(p_note,'')))=0 then raise exception 'Title and description are required'; end if;
  if p_deadline is null or p_deadline<(now() at time zone 'Asia/Bangkok')::date then raise exception 'Deadline must be today or later'; end if;
  if p_review_date is not null and (p_review_date>p_deadline or p_review_date<(now() at time zone 'Asia/Bangkok')::date) then raise exception 'Review must be between today and deadline'; end if;
  if p_priority='urgent' and length(trim(coalesce(p_urgent_reason,'')))=0 then raise exception 'Urgent work needs a reason'; end if;
  if exists(select 1 from unnest(p_references) x where x !~* '^https?://[^[:space:]]+$') then raise exception 'References must be HTTP(S) links'; end if;
  if exists(select 1 from unnest(p_collaborators) x where not (public.task_assign_user_is_team_member(x,p_source_team) or public.task_assign_user_is_team_member(x,p_responsible_team))) then raise exception 'Collaborators must belong to an involved team'; end if;
  if p_parent is not null and not public.task_assign_can_read(actor,p_parent) then raise exception 'Parent task is unavailable'; end if;
  if p_request_key is null then raise exception 'Request identity is required'; end if;
  cross_team:=p_source_team<>p_responsible_team;
  if cross_team and p_assignee is not null then raise exception 'The receiving team must choose the assignee'; end if;
  if not cross_team and (p_assignee is null or not public.task_assign_assignee_can_commit(p_assignee,p_responsible_team,p_deadline)) then raise exception 'Choose a receiving-team assignee available through the deadline'; end if;
  -- A confidential cross-team request must name a dispatcher, otherwise the
  -- receiving queue cannot see it. Admins can still recover orphaned requests.
  if cross_team and p_confidential and not exists(select 1 from unnest(p_collaborators) x where public.task_assign_can_dispatch(x,p_responsible_team)) then raise exception 'Select a receiving-team dispatcher as a confidential collaborator'; end if;
  perform pg_advisory_xact_lock(hashtext('flowmate_quick_task_display_id'));
  select id,display_id into target,display from public.work_items where requester_user_id=actor and task_request_key=p_request_key;
  if target is not null then return jsonb_build_object('id',target,'display_id',display); end if;
  select coalesce(max(substring(display_id from 4)::integer),2000)+1 into n from public.work_items where display_id ~ '^QT-[0-9]{4,}$';
  display:='QT-'||lpad(n::text,4,'0'); state:=case when cross_team then 'pending' else 'accepted' end;
  insert into public.work_items(display_id,work_type,title,description,project_name,requester_user_id,requester_team,owning_team_code,assignee_user_id,status,
    priority,urgent_reason,due_date,launch_date,task_request_state,task_requested_deadline,task_committed_deadline,task_reference_links,task_confidential,task_collaborator_ids,task_parent_id,task_request_key)
  values(display,'quick_task',trim(p_title),trim(p_note),nullif(trim(p_project),''),actor,p_source_team,p_responsible_team,p_assignee,
    case when cross_team then 'queued'::public.work_status else 'assigned'::public.work_status end,p_priority,nullif(trim(p_urgent_reason),''),p_review_date,p_deadline,
    state,p_deadline,case when cross_team then null else p_deadline end,coalesce(p_references,'{}'),coalesce(p_confidential,false),coalesce(p_collaborators,'{}'),p_parent,p_request_key) returning id into target;
  insert into public.work_item_events(work_item_id,actor_user_id,event_type,metadata) values(target,actor,'created',jsonb_build_object('source','task_assign_workspace','request_state',state,'responsible_team',p_responsible_team));
  perform public.task_assign_notify(target,'request_sent');
  return jsonb_build_object('id',target,'display_id',display,'request_state',state);
end $$;

create or replace function public.task_assign_action(p_display_id text,p_action text,p_assignee uuid default null,p_committed_deadline date default null,
  p_reason text default null,p_target_team text default null,p_expected_updated_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.task_assign_actor_user_id(); w public.work_items%rowtype; dispatcher boolean; begin
  select * into w from public.work_items where display_id=p_display_id and work_type='quick_task' for update;
  if w.id is null or not public.task_assign_can_read(actor,w.id) then raise exception 'Task is unavailable'; end if;
  if w.archived_at is not null then raise exception 'Archived tasks cannot be changed'; end if;
  if p_expected_updated_at is null or w.updated_at<>p_expected_updated_at then raise exception 'Task changed. Refresh before trying again'; end if;
  dispatcher:=public.task_assign_can_dispatch(actor,w.owning_team_code);
  if p_action in ('accept','need_information','reject','reassign') then
    if not dispatcher then raise exception 'Receiving team dispatcher required'; end if;
    if p_action<>'reassign' and w.task_request_state not in ('pending','need_information') then raise exception 'Request is no longer awaiting acceptance'; end if;
    if p_action in ('accept','reassign') then
      if p_action='reassign' and w.task_request_state<>'accepted' then raise exception 'Accept the request first'; end if;
      if w.status in ('delivered','cancelled') then raise exception 'Closed tasks cannot be reassigned'; end if;
      if p_assignee is null or not public.task_assign_assignee_can_commit(p_assignee,w.owning_team_code,p_committed_deadline) then raise exception 'Choose an active receiving-team assignee available through the deadline'; end if;
      if p_committed_deadline is null or p_committed_deadline<(now() at time zone 'Asia/Bangkok')::date or (w.due_date is not null and w.due_date>p_committed_deadline) then raise exception 'Commitment must be after today and the review date'; end if;
      update public.work_items set task_request_state='accepted',assignee_user_id=p_assignee,assignee_other_name=null,task_committed_deadline=p_committed_deadline,
        launch_date=p_committed_deadline,status=case when p_action='accept' then 'assigned'::public.work_status else status end,updated_at=now() where id=w.id;
    else
      if length(trim(coalesce(p_reason,'')))=0 then raise exception 'Please give a reason'; end if;
      update public.work_items set task_request_state=case when p_action='reject' then 'rejected' else 'need_information' end,updated_at=now() where id=w.id;
    end if;
  elsif p_action='resubmit' then
    if actor<>w.requester_user_id or w.task_request_state not in ('need_information','rejected') then raise exception 'Requester must resubmit a returned request'; end if;
    update public.work_items set task_request_state='pending',status='queued',updated_at=now() where id=w.id;
  elsif p_action='forward' then
    if not dispatcher and not (actor=w.requester_user_id and w.task_request_state<>'accepted') then raise exception 'Dispatcher or pending-request owner required'; end if;
    if w.status in ('delivered','cancelled') then raise exception 'Closed tasks cannot be forwarded'; end if;
    if p_target_team is null or p_target_team not in ('mkt','ops','esport') or p_target_team=w.owning_team_code or not exists(select 1 from public.teams where code=p_target_team and is_active) then raise exception 'Choose another receiving team'; end if;
    if w.task_confidential then raise exception 'Ask an administrator to review confidential recipients before forwarding'; end if;
    if length(trim(coalesce(p_reason,'')))=0 then raise exception 'Forwarding needs a reason'; end if;
    update public.work_items set owning_team_code=p_target_team,assignee_user_id=null,task_request_state='pending',task_committed_deadline=null,
      launch_date=coalesce(task_requested_deadline,launch_date),status='queued',updated_at=now() where id=w.id;
  elsif p_action in ('start','submit','block','resume') then
    if not public.task_assign_can_execute(actor,w.id) then raise exception 'Responsible assignee or dispatcher required'; end if;
    if (p_action='start' and w.status<>'assigned') or (p_action='submit' and w.status<>'in_progress') or (p_action='block' and w.status not in ('assigned','in_progress')) or (p_action='resume' and w.status<>'blocked') then raise exception 'Refresh the work status first'; end if;
    if p_action='block' and length(trim(coalesce(p_reason,'')))=0 then raise exception 'Blocking needs a reason'; end if;
    update public.work_items set status=case p_action when 'start' then 'in_progress'::public.work_status when 'submit' then 'review'::public.work_status when 'block' then 'blocked'::public.work_status else 'in_progress'::public.work_status end,
      blocked_reason=case when p_action='block' then p_reason else null end,updated_at=now() where id=w.id;
  elsif p_action in ('approve','request_changes','cancel','reopen') then
    if actor<>w.requester_user_id and not public.is_admin_app_user() then raise exception 'Requester required'; end if;
    if p_action in ('approve','request_changes') and w.status<>'review' then raise exception 'Submit work for review first'; end if;
    if p_action='reopen' and w.status not in ('delivered','cancelled') then raise exception 'Only closed work can be reopened'; end if;
    if p_action<>'approve' and length(trim(coalesce(p_reason,'')))=0 then raise exception 'Please give a reason'; end if;
    update public.work_items set status=case p_action when 'approve' then 'delivered'::public.work_status when 'cancel' then 'cancelled'::public.work_status when 'request_changes' then 'in_progress'::public.work_status else 'queued'::public.work_status end,
      task_request_state=case when p_action='reopen' then 'pending' else task_request_state end,assignee_user_id=case when p_action='reopen' then null else assignee_user_id end,
      task_committed_deadline=case when p_action='reopen' then null else task_committed_deadline end,delivered_at=case when p_action='approve' then now() when p_action='reopen' then null else delivered_at end,
      cancel_reason=case when p_action='cancel' then p_reason else null end,updated_at=now() where id=w.id;
  else raise exception 'Unsupported action'; end if;
  insert into public.work_item_events(work_item_id,actor_user_id,event_type,from_status,to_status,metadata)
    select w.id,actor,'status_changed',w.status,status,jsonb_build_object('source','task_assign_workspace','action',p_action,'reason',p_reason,'previous_assignee',w.assignee_user_id,'assignee',assignee_user_id,
      'previous_team',w.owning_team_code,'responsible_team',owning_team_code,'requested_deadline',task_requested_deadline,'committed_deadline',task_committed_deadline) from public.work_items where id=w.id;
  perform public.task_assign_notify(w.id,p_action);
  return jsonb_build_object('id',w.id,'display_id',w.display_id);
end $$;

create or replace function public.task_assign_edit_brief(p_display_id text,p_title text,p_note text,p_project text,p_expected_updated_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.task_assign_actor_user_id(); w public.work_items%rowtype; begin
  select * into w from public.work_items where display_id=p_display_id and work_type='quick_task' for update;
  if w.id is null or not public.task_assign_can_read(actor,w.id) or actor<>w.requester_user_id then raise exception 'Requester required'; end if;
  if w.archived_at is not null or w.status in ('delivered','cancelled') then raise exception 'Closed work cannot be edited'; end if;
  if p_expected_updated_at is null or w.updated_at<>p_expected_updated_at then raise exception 'Task changed. Refresh first'; end if;
  if length(trim(coalesce(p_title,'')))=0 or length(trim(coalesce(p_note,'')))=0 then raise exception 'Title and description are required'; end if;
  update public.work_items set title=trim(p_title),description=trim(p_note),project_name=nullif(trim(p_project),''),updated_at=now() where id=w.id;
  insert into public.work_item_events(work_item_id,actor_user_id,event_type,metadata) values(w.id,actor,'status_changed',jsonb_build_object('source','task_assign_workspace','action','edit_brief','previous_title',w.title,'previous_note',w.description));
  perform public.task_assign_notify(w.id,'brief_updated');
end $$;
create or replace function public.task_assign_requeue_departed_member()
returns trigger language plpgsql security definer set search_path='' as $$
declare departed uuid; departed_team text; w public.work_items%rowtype; begin
  if tg_table_name='users' then
    if new.is_active or old.is_active=new.is_active then return new; end if;
    departed:=old.id;
  else
    if tg_op='UPDATE' and old.user_id=new.user_id and old.team_code=new.team_code then return new; end if;
    departed:=old.user_id; departed_team:=old.team_code;
  end if;
  for w in select * from public.work_items where work_type='quick_task' and assignee_user_id=departed
    and (departed_team is null or owning_team_code=departed_team) and status not in ('delivered','cancelled') for update loop
    update public.work_items set assignee_user_id=null,task_request_state='pending',task_committed_deadline=null,
      status='queued',launch_date=coalesce(task_requested_deadline,launch_date),updated_at=now() where id=w.id;
    insert into public.work_item_events(work_item_id,actor_user_id,event_type,from_status,to_status,metadata)
      values(w.id,auth.uid(),'status_changed',w.status,'queued',jsonb_build_object('source','task_assign_workspace','action','assignee_left_team','previous_assignee',departed));
    perform public.task_assign_notify(w.id,'assignee_left_team');
  end loop;
  if tg_op='DELETE' then return old; end if; return new;
end $$;
drop trigger if exists task_assign_member_departed on public.user_team_memberships;
create trigger task_assign_member_departed after delete or update on public.user_team_memberships
for each row execute function public.task_assign_requeue_departed_member();
drop trigger if exists task_assign_user_deactivated on public.users;
create trigger task_assign_user_deactivated after update of is_active on public.users
for each row execute function public.task_assign_requeue_departed_member();
create or replace function public.task_assign_list(p_team text default null,p_view text default 'team',p_display_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=public.task_assign_actor_user_id(); begin
  if p_view not in ('team','incoming','outgoing','mine','created','detail') then raise exception 'Invalid view'; end if;
  if p_view in ('team','incoming','outgoing') and (p_team is null or not public.flowmate_user_can_access_team(actor,p_team)) then raise exception 'Workspace is unavailable'; end if;
  return coalesce((select jsonb_agg(entry order by entry->>'launch_date',entry->>'display_id') from (
    select to_jsonb(w)||jsonb_build_object('assignee_name',u.display_name,'requester_name',r.display_name,
      'parent_display_id',case when public.task_assign_can_read(actor,w.task_parent_id) then parent.display_id else null end,
      'can_dispatch',public.task_assign_can_dispatch(actor,w.owning_team_code),'can_execute',public.task_assign_can_execute(actor,w.id),'is_requester',w.requester_user_id=actor) entry
    from public.work_items w left join public.users u on u.id=w.assignee_user_id left join public.users r on r.id=w.requester_user_id left join public.work_items parent on parent.id=w.task_parent_id
    where w.work_type='quick_task' and w.archived_at is null and public.task_assign_can_read(actor,w.id) and case p_view
      when 'detail' then w.display_id=p_display_id when 'mine' then w.assignee_user_id=actor and w.status not in ('delivered','cancelled')
      when 'created' then w.requester_user_id=actor when 'team' then w.owning_team_code=p_team
      when 'incoming' then w.owning_team_code=p_team and public.flowmate_normalize_team_code(w.requester_team)<>p_team
      when 'outgoing' then public.flowmate_normalize_team_code(w.requester_team)=p_team and w.owning_team_code<>p_team end
  ) rows),'[]'::jsonb);
end $$;
do $$ declare rec record; begin
  for rec in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'task_assign_%' and p.proname<>'task_assign_function_for_user' loop
    execute format('revoke all on function %s from public,anon,authenticated',rec.signature);
    if rec.proname in ('task_assign_create','task_assign_action','task_assign_edit_brief','task_assign_list','task_assign_members','task_assign_set_dispatcher','task_assign_comment','task_assign_current_notification_visible') then execute format('grant execute on function %s to authenticated',rec.signature); end if;
  end loop;
end $$;
revoke insert,update,delete on public.work_items from authenticated;
commit;
select pg_notify('pgrst','reload schema');
