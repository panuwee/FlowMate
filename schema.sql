-- FlowMate MVP 1.0 Supabase schema
-- Run this first in Supabase SQL Editor.
-- This script is idempotent for tables/functions/policies where practical.

create extension if not exists pgcrypto;

do $$
begin
  create type public.work_type as enum ('quick_task', 'creative_request');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.work_status as enum (
    'new',
    'need_brief',
    'queued',
    'assigned',
    'in_progress',
    'review',
    'delivered',
    'blocked',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.priority_level as enum ('low', 'normal', 'high', 'urgent');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.asset_type as enum (
    'static-graphic',
    'general-video',
    'motion',
    'esport-video',
    'hybrid'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.availability_status as enum ('available', 'partial', 'leave');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.assignment_trigger as enum ('submit', 'recheck', 'rerun', 'capacity_change');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.assignment_result as enum ('assigned', 'queued', 'need_brief');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.event_type as enum (
    'created',
    'updated',
    'brief_checked',
    'assignment_ran',
    'status_changed',
    'blocked',
    'reviewed',
    'capacity_changed',
    'cancelled',
    'commented',
    'checklist_changed'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text not null,
  requester_team text,
  google_subject text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_shape check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  member_code text not null unique,
  user_id uuid references public.users(id) on delete set null,
  display_name text not null,
  initials text not null,
  color text not null default '#2E546D',
  discipline text not null,
  discipline_short text not null,
  skills public.asset_type[] not null,
  backup_skills public.asset_type[] not null default '{}',
  capacity_per_day numeric(5,2) not null default 8 check (capacity_per_day >= 0 and capacity_per_day <= 24),
  capacity_override_per_day numeric(5,2) check (capacity_override_per_day is null or (capacity_override_per_day >= 0 and capacity_override_per_day <= 24)),
  wip_limit integer not null default 3 check (wip_limit >= 0 and wip_limit <= 20),
  availability public.availability_status not null default 'available',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_members_skills_not_empty check (array_length(skills, 1) is not null),
  constraint team_members_leave_capacity check (
    availability <> 'leave' or capacity_override_per_day is null or capacity_override_per_day = 0
  )
);

create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  display_id text not null unique,
  work_type public.work_type not null,
  title text not null,
  description text,
  project_name text,
  campaign_name text,
  requester_user_id uuid not null references public.users(id),
  requester_team text,
  assignee_user_id uuid references public.users(id),
  final_owner_member_id uuid references public.team_members(id),
  status public.work_status not null default 'new',
  priority public.priority_level not null default 'normal',
  urgent_reason text,
  due_date date not null,
  launch_date date,
  effort_point integer check (effort_point is null or (effort_point >= 1 and effort_point <= 8)),
  needs_split boolean not null default false,
  assignment_reason text,
  blocked_reason text,
  blocked_from public.work_status,
  cancel_reason text,
  delivery_link text,
  review_round integer not null default 0 check (review_round >= 0),
  wip_counted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  constraint work_items_display_id_shape check (display_id ~ '^(CR|QT)-[0-9]{4,}$'),
  constraint work_items_urgent_reason check (
    priority <> 'urgent' or length(trim(coalesce(urgent_reason, ''))) > 0
  ),
  constraint work_items_blocked_reason check (
    status <> 'blocked' or length(trim(coalesce(blocked_reason, ''))) > 0
  ),
  constraint work_items_cancel_reason check (
    status <> 'cancelled' or length(trim(coalesce(cancel_reason, ''))) > 0
  ),
  constraint work_items_review_delivery_link check (
    status <> 'review' or length(trim(coalesce(delivery_link, ''))) > 0
  ),
  constraint work_items_delivered_delivery_link check (
    work_type <> 'creative_request' or status <> 'delivered' or length(trim(coalesce(delivery_link, ''))) > 0
  ),
  constraint work_items_owner_for_creative_active_status check (
    work_type <> 'creative_request'
    or status not in ('assigned', 'in_progress', 'review', 'blocked', 'delivered')
    or final_owner_member_id is not null
  ),
  constraint work_items_effort_for_creative_after_brief check (
    work_type <> 'creative_request'
    or status in ('new', 'need_brief')
    or effort_point is not null
  ),
  constraint work_items_wip_counted_status check (
    wip_counted = false or status = 'in_progress'
  ),
  constraint work_items_quick_task_no_effort check (
    work_type <> 'quick_task' or effort_point is null
  )
);

create table if not exists public.creative_request_details (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null unique references public.work_items(id) on delete cascade,
  asset_type public.asset_type not null,
  asset_subtype text not null,
  platforms text[] not null,
  size_format text not null,
  brief_link text not null,
  reference_link text,
  brief_completeness_status public.work_status not null default 'new',
  brief_missing_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_details_platforms_not_empty check (array_length(platforms, 1) is not null),
  constraint creative_details_brief_url check (
    length(trim(coalesce(brief_link, ''))) = 0
    or brief_link ~* '^https?://[^[:space:]]{4,}$'
  ),
  constraint creative_details_reference_url check (reference_link is null or reference_link ~* '^https?://[^[:space:]]{4,}$'),
  constraint creative_details_brief_status check (brief_completeness_status in ('new', 'need_brief'))
);

create table if not exists public.assignment_runs (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  triggered_by public.assignment_trigger not null,
  suggested_owner_member_id uuid references public.team_members(id),
  final_owner_member_id uuid references public.team_members(id),
  result public.assignment_result not null,
  reason text not null,
  effort_point integer not null check (effort_point >= 1 and effort_point <= 8),
  raw_range_min integer check (raw_range_min is null or raw_range_min >= 1),
  raw_range_max integer check (raw_range_max is null or raw_range_max >= raw_range_min),
  was_capped boolean not null default false,
  capacity_snapshot jsonb not null default '{}'::jsonb,
  ran_at timestamptz not null default now(),
  constraint assignment_runs_owner_when_assigned check (
    result <> 'assigned' or final_owner_member_id is not null
  )
);

create table if not exists public.work_item_events (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  actor_user_id uuid references public.users(id),
  event_type public.event_type not null,
  from_status public.work_status,
  to_status public.work_status,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  author_user_id uuid not null references public.users(id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  deleted_at timestamptz,
  constraint comments_body_not_empty check (length(trim(body)) > 0)
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  title text not null,
  is_done boolean not null default false,
  sort_order integer not null default 0,
  created_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint checklist_title_not_empty check (length(trim(title)) > 0)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  work_item_id uuid references public.work_items(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.capacity_overrides (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  capacity_per_day numeric(5,2) not null check (capacity_per_day >= 0 and capacity_per_day <= 24),
  reason text,
  created_by_user_id uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  constraint capacity_override_date_order check (end_date >= start_date)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

drop trigger if exists team_members_set_updated_at on public.team_members;
create trigger team_members_set_updated_at
before update on public.team_members
for each row execute function public.set_updated_at();

drop trigger if exists work_items_set_updated_at on public.work_items;
create trigger work_items_set_updated_at
before update on public.work_items
for each row execute function public.set_updated_at();

drop trigger if exists creative_request_details_set_updated_at on public.creative_request_details;
create trigger creative_request_details_set_updated_at
before update on public.creative_request_details
for each row execute function public.set_updated_at();

create index if not exists idx_users_email on public.users(email);
create index if not exists idx_users_active on public.users(is_active);
create index if not exists idx_team_members_active on public.team_members(active);
create index if not exists idx_team_members_user_id on public.team_members(user_id);
create index if not exists idx_team_members_skills on public.team_members using gin(skills);
create index if not exists idx_work_items_status on public.work_items(status);
create index if not exists idx_work_items_type on public.work_items(work_type);
create index if not exists idx_work_items_due_date on public.work_items(due_date);
create index if not exists idx_work_items_requester on public.work_items(requester_user_id);
create index if not exists idx_work_items_owner on public.work_items(final_owner_member_id);
create index if not exists idx_work_items_assignee_user on public.work_items(assignee_user_id);
create index if not exists idx_work_items_search on public.work_items using gin(to_tsvector('simple', coalesce(display_id,'') || ' ' || coalesce(title,'') || ' ' || coalesce(campaign_name,'') || ' ' || coalesce(requester_team,'')));
create index if not exists idx_creative_details_asset_type on public.creative_request_details(asset_type);
create index if not exists idx_assignment_runs_work_item on public.assignment_runs(work_item_id, ran_at desc);
create index if not exists idx_events_work_item on public.work_item_events(work_item_id, created_at desc);
create index if not exists idx_comments_work_item on public.comments(work_item_id, created_at);
create index if not exists idx_checklist_work_item on public.checklist_items(work_item_id, sort_order);

create or replace view public.member_workload_v as
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
group by tm.id;

create or replace view public.work_item_flags_v as
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
from public.work_items wi;

create or replace function public.current_app_user_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

create or replace function public.is_active_app_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = public.current_app_user_id()
      and u.is_active = true
  );
$$;

create or replace function public.is_work_item_participant(target_work_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.work_items wi
    left join public.team_members tm on tm.id = wi.final_owner_member_id
    where wi.id = target_work_item_id
      and (
        wi.requester_user_id = public.current_app_user_id()
        or wi.assignee_user_id = public.current_app_user_id()
        or tm.user_id = public.current_app_user_id()
      )
  );
$$;

create or replace function public.can_update_work_item(target_work_item_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_app_user()
    and public.is_work_item_participant(target_work_item_id);
$$;

alter table public.users enable row level security;
alter table public.team_members enable row level security;
alter table public.work_items enable row level security;
alter table public.creative_request_details enable row level security;
alter table public.assignment_runs enable row level security;
alter table public.work_item_events enable row level security;
alter table public.comments enable row level security;
alter table public.checklist_items enable row level security;
alter table public.notifications enable row level security;
alter table public.capacity_overrides enable row level security;

-- Auth policy model:
-- - Reads require a real Supabase Auth session mapped to an active public.users row.
-- - Signed-out anon requests must not see application data.
-- - Writes normally go through security-definer RPCs that resolve auth.uid().

drop policy if exists "active users can read users" on public.users;
create policy "active users can read users"
on public.users for select
using (public.is_active_app_user());

drop policy if exists "active users can read team members" on public.team_members;
create policy "active users can read team members"
on public.team_members for select
using (public.is_active_app_user());

drop policy if exists "active users can read work items" on public.work_items;
create policy "active users can read work items"
on public.work_items for select
using (public.is_active_app_user());

drop policy if exists "participants can update work items" on public.work_items;
create policy "participants can update work items"
on public.work_items for update
using (public.can_update_work_item(id))
with check (public.can_update_work_item(id));

drop policy if exists "active users can insert work items" on public.work_items;
create policy "active users can insert work items"
on public.work_items for insert
with check (
  public.is_active_app_user()
  and requester_user_id = public.current_app_user_id()
);

drop policy if exists "active users can read creative details" on public.creative_request_details;
create policy "active users can read creative details"
on public.creative_request_details for select
using (public.is_active_app_user());

drop policy if exists "participants can mutate creative details" on public.creative_request_details;
create policy "participants can mutate creative details"
on public.creative_request_details for all
using (public.can_update_work_item(work_item_id))
with check (public.can_update_work_item(work_item_id));

drop policy if exists "active users can read assignment runs" on public.assignment_runs;
create policy "active users can read assignment runs"
on public.assignment_runs for select
using (public.is_active_app_user());

drop policy if exists "active users can read events" on public.work_item_events;
create policy "active users can read events"
on public.work_item_events for select
using (public.is_active_app_user());

drop policy if exists "participants can read comments" on public.comments;
create policy "participants can read comments"
on public.comments for select
using (public.is_active_app_user());

drop policy if exists "active users can insert own comments" on public.comments;
create policy "active users can insert own comments"
on public.comments for insert
with check (
  public.is_active_app_user()
  and author_user_id = public.current_app_user_id()
);

drop policy if exists "authors can update comments" on public.comments;
create policy "authors can update comments"
on public.comments for update
using (author_user_id = public.current_app_user_id())
with check (author_user_id = public.current_app_user_id());

drop policy if exists "active users can read checklist" on public.checklist_items;
create policy "active users can read checklist"
on public.checklist_items for select
using (public.is_active_app_user());

drop policy if exists "participants can mutate checklist" on public.checklist_items;
create policy "participants can mutate checklist"
on public.checklist_items for all
using (public.can_update_work_item(work_item_id))
with check (public.can_update_work_item(work_item_id));

drop policy if exists "users can read own notifications" on public.notifications;
create policy "users can read own notifications"
on public.notifications for select
using (user_id = public.current_app_user_id());

drop policy if exists "users can update own notifications" on public.notifications;
create policy "users can update own notifications"
on public.notifications for update
using (user_id = public.current_app_user_id())
with check (user_id = public.current_app_user_id());

drop policy if exists "active users can read capacity overrides" on public.capacity_overrides;
create policy "active users can read capacity overrides"
on public.capacity_overrides for select
using (public.is_active_app_user());

drop policy if exists "linked members can insert capacity overrides" on public.capacity_overrides;
create policy "linked members can insert capacity overrides"
on public.capacity_overrides for insert
with check (
  public.is_active_app_user()
  and exists (
    select 1 from public.team_members tm
    where tm.id = team_member_id
      and tm.user_id = public.current_app_user_id()
  )
);

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on public.work_items to anon, authenticated;
grant insert, update, delete on public.creative_request_details to anon, authenticated;
grant insert, update on public.comments to anon, authenticated;
grant insert, update, delete on public.checklist_items to anon, authenticated;
grant update on public.notifications to anon, authenticated;
grant insert on public.capacity_overrides to anon, authenticated;
