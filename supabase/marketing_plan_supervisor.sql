-- FlowMate + Marketing Plan Supervisor backend
-- Run after supabase/marketing_plan.sql and supabase/marketing_plan_status_update.sql.
--
-- This file adds admin-only reporting support for Marketing Plan assignment
-- timing. It does not create FlowMate work items and does not change the
-- FlowMate assignment engine.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Assignment/audit columns
-- ---------------------------------------------------------------------------
-- public.users(id) is compatible with auth.uid() in this project, so actor
-- columns can keep normal foreign keys to public.users(id).
alter table public.marketing_content_items
  add column if not exists first_assigned_at timestamptz,
  add column if not exists first_assigned_by_user_id uuid references public.users(id) on update cascade on delete set null,
  add column if not exists brief_link_added_at timestamptz,
  add column if not exists brief_link_added_by_user_id uuid references public.users(id) on update cascade on delete set null,
  add column if not exists last_status_changed_at timestamptz,
  add column if not exists last_status_changed_by_user_id uuid references public.users(id) on update cascade on delete set null;

alter table public.marketing_channel_placements
  add column if not exists first_assigned_at timestamptz,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by_user_id uuid references public.users(id) on update cascade on delete set null;

create index if not exists idx_marketing_content_items_first_assigned
on public.marketing_content_items(first_assigned_at)
where first_assigned_at is not null;

create index if not exists idx_marketing_channel_placements_first_assigned
on public.marketing_channel_placements(first_assigned_at)
where first_assigned_at is not null;

-- ---------------------------------------------------------------------------
-- Event log
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_plan_events (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid references public.marketing_plans(id) on delete set null,
  campaign_id uuid references public.marketing_campaigns(id) on delete set null,
  content_item_id uuid references public.marketing_content_items(id) on delete set null,
  placement_id uuid references public.marketing_channel_placements(id) on delete set null,
  actor_user_id uuid references public.users(id) on update cascade on delete set null,
  event_type text not null,
  from_value text,
  to_value text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.marketing_plan_events
  drop constraint if exists marketing_plan_events_event_type_check;

alter table public.marketing_plan_events
  add constraint marketing_plan_events_event_type_check check (
    event_type in ('created', 'brief_link_added', 'assigned', 'status_changed', 'deleted')
  );

create index if not exists idx_marketing_plan_events_plan_created
on public.marketing_plan_events(plan_id, created_at desc);

create index if not exists idx_marketing_plan_events_content_created
on public.marketing_plan_events(content_item_id, created_at desc)
where content_item_id is not null;

create index if not exists idx_marketing_plan_events_placement_created
on public.marketing_plan_events(placement_id, created_at desc)
where placement_id is not null;

alter table public.marketing_plan_events enable row level security;

drop policy if exists "admins can read marketing plan events" on public.marketing_plan_events;
create policy "admins can read marketing plan events"
on public.marketing_plan_events for select
using (public.is_admin_app_user());

revoke all privileges on public.marketing_plan_events from public, anon, authenticated;
grant select on public.marketing_plan_events to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger helpers
-- ---------------------------------------------------------------------------
create or replace function public.marketing_plan_is_non_empty_text(p_value text)
returns boolean
language sql
immutable
as $$
  select nullif(trim(coalesce(p_value, '')), '') is not null;
$$;

revoke all on function public.marketing_plan_is_non_empty_text(text) from public, anon, authenticated;
grant execute on function public.marketing_plan_is_non_empty_text(text) to authenticated;

create or replace function public.marketing_plan_capture_content_item_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_plan_id uuid;
  v_campaign_id uuid;
  v_brief_link_added boolean;
  v_status_changed boolean;
begin
  -- Actor identity must come from Supabase Auth/app helpers, never from the client.
  v_actor_id := auth.uid();
  v_actor_id := coalesce(auth.uid(), public.current_app_user_id());

  select mc.plan_id, mc.id
    into v_plan_id, v_campaign_id
  from public.marketing_campaigns mc
  where mc.id = new.campaign_id;

  v_brief_link_added :=
    not public.marketing_plan_is_non_empty_text(old.brief_link)
    and public.marketing_plan_is_non_empty_text(new.brief_link);

  v_status_changed := new.status is distinct from old.status;

  if v_brief_link_added then
    new.brief_link_added_at = coalesce(new.brief_link_added_at, now());
    new.brief_link_added_by_user_id = coalesce(new.brief_link_added_by_user_id, v_actor_id);
    new.first_assigned_at = coalesce(new.first_assigned_at, now());
    new.first_assigned_by_user_id = coalesce(new.first_assigned_by_user_id, v_actor_id);

    insert into public.marketing_plan_events (
      plan_id,
      campaign_id,
      content_item_id,
      actor_user_id,
      event_type,
      from_value,
      to_value,
      metadata
    ) values (
      v_plan_id,
      v_campaign_id,
      new.id,
      v_actor_id,
      'brief_link_added',
      old.brief_link,
      new.brief_link,
      jsonb_build_object('source', 'marketing_content_items.brief_link')
    );
  end if;

  if v_status_changed then
    new.last_status_changed_at = now();
    new.last_status_changed_by_user_id = v_actor_id;

    if new.status = 'assigned' then
      new.first_assigned_at = coalesce(new.first_assigned_at, now());
      new.first_assigned_by_user_id = coalesce(new.first_assigned_by_user_id, v_actor_id);
    end if;

    insert into public.marketing_plan_events (
      plan_id,
      campaign_id,
      content_item_id,
      actor_user_id,
      event_type,
      from_value,
      to_value,
      metadata
    ) values (
      v_plan_id,
      v_campaign_id,
      new.id,
      v_actor_id,
      case when new.status = 'assigned' and old.status <> 'assigned' then 'assigned' else 'status_changed' end,
      old.status,
      new.status,
      jsonb_build_object('source', 'marketing_content_items.status')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists marketing_content_items_capture_assignment on public.marketing_content_items;
create trigger marketing_content_items_capture_assignment
before update of brief_link, status on public.marketing_content_items
for each row execute function public.marketing_plan_capture_content_item_assignment();

create or replace function public.marketing_plan_capture_placement_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_plan_id uuid;
  v_campaign_id uuid;
  v_status_changed boolean;
  v_became_assigned boolean;
begin
  -- Actor identity must come from Supabase Auth/app helpers, never from the client.
  v_actor_id := auth.uid();
  v_actor_id := coalesce(auth.uid(), public.current_app_user_id());

  select mc.plan_id, mc.id
    into v_plan_id, v_campaign_id
  from public.marketing_content_items parent_item
  join public.marketing_campaigns mc on mc.id = parent_item.campaign_id
  where parent_item.id = new.content_item_id;

  v_status_changed := new.placement_status is distinct from old.placement_status;
  v_became_assigned := old.placement_status = 'planned' and new.placement_status = 'assigned';

  if not v_status_changed then
    return new;
  end if;

  new.status_changed_at = now();
  new.status_changed_by_user_id = v_actor_id;

  if v_became_assigned then
    new.first_assigned_at = coalesce(new.first_assigned_at, now());

    update public.marketing_content_items parent_item
    set
      first_assigned_at = coalesce(parent_item.first_assigned_at, now()),
      first_assigned_by_user_id = coalesce(parent_item.first_assigned_by_user_id, v_actor_id)
    where parent_item.first_assigned_at is null
      and parent_item.id = new.content_item_id;
  end if;

  update public.marketing_content_items parent_item
  set
    last_status_changed_at = now(),
    last_status_changed_by_user_id = v_actor_id
  where parent_item.id = new.content_item_id;

  insert into public.marketing_plan_events (
    plan_id,
    campaign_id,
    content_item_id,
    placement_id,
    actor_user_id,
    event_type,
    from_value,
    to_value,
    metadata
  ) values (
    v_plan_id,
    v_campaign_id,
    new.content_item_id,
    new.id,
    v_actor_id,
    case when v_became_assigned then 'assigned' else 'status_changed' end,
    old.placement_status,
    new.placement_status,
    jsonb_build_object('source', 'marketing_channel_placements.placement_status')
  );

  return new;
end;
$$;

drop trigger if exists marketing_channel_placements_capture_status on public.marketing_channel_placements;
create trigger marketing_channel_placements_capture_status
before update of placement_status on public.marketing_channel_placements
for each row execute function public.marketing_plan_capture_placement_status();

-- ---------------------------------------------------------------------------
-- Working-day helper
-- ---------------------------------------------------------------------------
create or replace function public.marketing_plan_count_working_days(p_start_date date, p_end_date date)
returns integer
language plpgsql
immutable
as $$
declare
  v_days integer;
begin
  -- Direction is launch date first, assignment/check date second.
  -- Assignment before launch returns positive weekdays before launch.
  -- Assignment on launch returns 0. Assignment after launch returns negative
  -- weekdays after launch.
  if p_start_date is null or p_end_date is null then
    return null;
  end if;

  if p_end_date < p_start_date then
    select count(*)::integer
      into v_days
    from generate_series(p_end_date, p_start_date - interval '1 day', interval '1 day') as d
    where extract(isodow from d)::int between 1 and 5;

    return v_days;
  end if;

  if p_end_date = p_start_date then
    return 0;
  end if;

  select count(*)::integer
    into v_days
  from generate_series(p_start_date + interval '1 day', p_end_date, interval '1 day') as d
  where extract(isodow from d)::int between 1 and 5;

  return -v_days;
end;
$$;

revoke all on function public.marketing_plan_count_working_days(date, date) from public, anon, authenticated;
grant execute on function public.marketing_plan_count_working_days(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Supervisor report views
-- ---------------------------------------------------------------------------
create or replace view public.marketing_plan_supervisor_monthly_v
with (security_invoker = true) as
with base as (
  select
    mp.id as plan_id,
    mp.month_key,
    mc.id as campaign_id,
    mc.name as campaign_name,
    mc.team as campaign_team,
    mci.id as content_item_id,
    mci.title as product_event,
    mci.team as content_team,
    mci.pic_user_id,
    coalesce(nullif(trim(mci.pic_name), ''), pic_user.display_name) as pic_name,
    mcp.id as placement_id,
    mcp.channel,
    coalesce(mci.source_start_date, mcp.publish_date, mc.start_date, mp.plan_date) as launch_date,
    mcp.publish_date,
    mcp.publish_time,
    coalesce(mcp.placement_status, mci.status) as stored_status,
    wi.status as flowmate_status,
    mci.brief_link,
    coalesce(mci.first_assigned_at, mcp.first_assigned_at, mci.brief_link_added_at) as first_assigned_at,
    coalesce(mci.first_assigned_by_user_id, mci.brief_link_added_by_user_id) as assigned_by_user_id,
    mci.created_at,
    mci.updated_at,
    not public.marketing_plan_is_non_empty_text(mci.brief_link) as missing_brief_link
  from public.marketing_plans mp
  join public.marketing_campaigns mc on mc.plan_id = mp.id
  join public.marketing_content_items mci on mci.campaign_id = mc.id
  left join public.marketing_channel_placements mcp on mcp.content_item_id = mci.id
  left join public.work_items wi on wi.id = mci.flowmate_work_item_id
  left join public.users pic_user on pic_user.id = mci.pic_user_id
  where mp.status <> 'archived'
    and coalesce(mcp.placement_status, '') <> 'cancelled'
    and public.is_admin_app_user()
),
enriched as (
  select
    base.*,
    case
      when base.flowmate_status = 'review' then 'review'
      when base.flowmate_status = 'delivered' then 'ready_to_post'
      when base.stored_status = 'planned' and base.missing_brief_link = false then 'assigned'
      else base.stored_status
    end as effective_status,
    case
      when base.first_assigned_at is null or base.launch_date is null then null
      else public.marketing_plan_count_working_days(base.launch_date, base.first_assigned_at::date)
    end as working_days_before_launch,
    case
      when base.first_assigned_at is null or base.launch_date is null then null
      else base.launch_date - base.first_assigned_at::date
    end as calendar_days_before_launch,
    case
      when base.launch_date is null then null
      else public.marketing_plan_count_working_days(base.launch_date, current_date)
    end as working_days_remaining
  from base
)
select
  plan_id,
  month_key,
  campaign_id,
  campaign_name,
  campaign_team,
  content_item_id,
  product_event,
  content_team,
  pic_user_id,
  pic_name,
  placement_id,
  channel,
  launch_date,
  publish_date,
  publish_time,
  stored_status,
  effective_status,
  brief_link,
  first_assigned_at,
  assigned_by_user_id,
  working_days_before_launch,
  calendar_days_before_launch,
  case
    -- Deterministic risk order: late/missing critical checks win before lead-time bands.
    when launch_date is null then 'Watch'
    when first_assigned_at is null and launch_date <= current_date then 'Critical'
    when first_assigned_at is not null and first_assigned_at::date >= launch_date then 'Critical'
    when first_assigned_at is null and launch_date > current_date and missing_brief_link and working_days_remaining <= 1 then 'Critical'
    when first_assigned_at is not null and working_days_before_launch between 1 and 2 then 'Risk'
    when first_assigned_at is not null and working_days_before_launch between 3 and 4 then 'Watch'
    when first_assigned_at is not null and working_days_before_launch >= 5 then 'Healthy'
    when first_assigned_at is null and working_days_remaining <= 2 then 'Risk'
    when first_assigned_at is null then 'Watch'
    else 'Risk'
  end as risk_bucket,
  missing_brief_link,
  created_at,
  updated_at
from enriched;

create or replace view public.marketing_plan_supervisor_pic_v
with (security_invoker = true) as
select
  month_key,
  pic_user_id,
  coalesce(pic_name, 'Unassigned') as pic_name,
  count(*) as total_rows,
  count(*) filter (where first_assigned_at is not null or effective_status <> 'planned') as assigned_rows,
  count(*) filter (where first_assigned_at is null and effective_status = 'planned') as unassigned_rows,
  avg(working_days_before_launch) filter (where working_days_before_launch is not null) as avg_working_days_before_launch,
  percentile_cont(0.5) within group (order by working_days_before_launch) filter (where working_days_before_launch is not null) as median_working_days_before_launch,
  count(*) filter (where risk_bucket = 'Healthy') as healthy_count,
  count(*) filter (where risk_bucket = 'Watch') as watch_count,
  count(*) filter (where risk_bucket = 'Risk') as risk_count,
  count(*) filter (where risk_bucket = 'Critical') as critical_count,
  count(*) filter (where missing_brief_link) as missing_brief_link_count
from public.marketing_plan_supervisor_monthly_v
where public.is_admin_app_user()
group by month_key, pic_user_id, coalesce(pic_name, 'Unassigned');

create or replace view public.marketing_plan_supervisor_campaign_v
with (security_invoker = true) as
select
  plan_id,
  month_key,
  campaign_id,
  campaign_name,
  campaign_team,
  count(*) as total_rows,
  count(distinct content_item_id) as total_content_items,
  count(placement_id) as total_placements,
  count(*) filter (where first_assigned_at is not null or effective_status <> 'planned') as assigned_rows,
  count(*) filter (where first_assigned_at is null and effective_status = 'planned') as unassigned_rows,
  avg(working_days_before_launch) filter (where working_days_before_launch is not null) as avg_working_days_before_launch,
  percentile_cont(0.5) within group (order by working_days_before_launch) filter (where working_days_before_launch is not null) as median_working_days_before_launch,
  count(*) filter (where risk_bucket = 'Healthy') as healthy_count,
  count(*) filter (where risk_bucket = 'Watch') as watch_count,
  count(*) filter (where risk_bucket = 'Risk') as risk_count,
  count(*) filter (where risk_bucket = 'Critical') as critical_count,
  count(*) filter (where missing_brief_link) as missing_brief_link_count
from public.marketing_plan_supervisor_monthly_v
where public.is_admin_app_user()
group by plan_id, month_key, campaign_id, campaign_name, campaign_team;

create or replace view public.marketing_plan_supervisor_channel_v
with (security_invoker = true) as
select
  month_key,
  coalesce(channel, 'no_placement') as channel,
  count(*) as total_rows,
  count(*) filter (where first_assigned_at is not null or effective_status <> 'planned') as assigned_rows,
  count(*) filter (where first_assigned_at is null and effective_status = 'planned') as unassigned_rows,
  avg(working_days_before_launch) filter (where working_days_before_launch is not null) as avg_working_days_before_launch,
  percentile_cont(0.5) within group (order by working_days_before_launch) filter (where working_days_before_launch is not null) as median_working_days_before_launch,
  count(*) filter (where risk_bucket = 'Healthy') as healthy_count,
  count(*) filter (where risk_bucket = 'Watch') as watch_count,
  count(*) filter (where risk_bucket = 'Risk') as risk_count,
  count(*) filter (where risk_bucket = 'Critical') as critical_count,
  count(*) filter (where missing_brief_link) as missing_brief_link_count
from public.marketing_plan_supervisor_monthly_v
where public.is_admin_app_user()
group by month_key, coalesce(channel, 'no_placement');

revoke all privileges on public.marketing_plan_supervisor_monthly_v from public, anon, authenticated;
revoke all privileges on public.marketing_plan_supervisor_pic_v from public, anon, authenticated;
revoke all privileges on public.marketing_plan_supervisor_campaign_v from public, anon, authenticated;
revoke all privileges on public.marketing_plan_supervisor_channel_v from public, anon, authenticated;

grant select on public.marketing_plan_supervisor_monthly_v to authenticated;
grant select on public.marketing_plan_supervisor_pic_v to authenticated;
grant select on public.marketing_plan_supervisor_campaign_v to authenticated;
grant select on public.marketing_plan_supervisor_channel_v to authenticated;
