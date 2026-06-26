-- FlowMate + Marketing Plan backend
-- Run this after the FlowMate baseline SQL and auth/role hardening.
--
-- Marketing Plan is separate from FlowMate execution. Scheduling lives on
-- marketing_channel_placements, not on FlowMate work_items.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Channel normalization
-- ---------------------------------------------------------------------------
create or replace function public.marketing_normalize_channel(
  p_channel text
) returns text
language sql
immutable
as $$
  select case
    when length(trim(coalesce(p_channel, ''))) = 0 then 'other'
    when lower(trim(p_channel)) in ('facebook', 'fb', 'meta') then 'facebook'
    when lower(replace(trim(p_channel), ' ', '')) in ('tiktok', 'tik-tok', 'tk') then 'tiktok'
    when lower(trim(p_channel)) in ('instagram', 'ig', 'insta', 'reels') then 'instagram'
    when lower(replace(replace(trim(p_channel), '-', ''), ' ', '')) in ('ingame', 'in', 'game', 'inapp') then 'in_game'
    when lower(trim(p_channel)) in ('youtube', 'yt', 'shorts', 'youtube shorts') then 'youtube'
    else 'other'
  end;
$$;

revoke all on function public.marketing_normalize_channel(text) from public, anon, authenticated;
grant execute on function public.marketing_normalize_channel(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_plans (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  title text not null,
  market text not null default 'TH',
  audience_scope text,
  plan_date date,
  status text not null default 'draft',
  created_by_user_id uuid references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_plans_month_key_shape check (month_key ~ '^[0-9]{4}-[0-9]{2}$'),
  constraint marketing_plans_title_not_empty check (length(trim(title)) > 0),
  constraint marketing_plans_market_not_empty check (length(trim(market)) > 0),
  constraint marketing_plans_status_check check (status in ('draft', 'active', 'locked', 'archived'))
);

create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.marketing_plans(id) on delete cascade,
  name text not null,
  team text,
  objective text,
  start_date date,
  end_date date,
  color text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_campaigns_name_not_empty check (length(trim(name)) > 0),
  constraint marketing_campaigns_date_order check (end_date is null or start_date is null or end_date >= start_date)
);

create table if not exists public.marketing_content_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  title text not null,
  details text,
  team text,
  format text,
  content_tier text,
  pic_user_id uuid references public.users(id) on update cascade on delete set null,
  pic_name text,
  note text,
  brief_link text,
  source_start_date date,
  source_start_time time,
  source_sheet_row text,
  flowmate_work_item_id uuid references public.work_items(id) on delete set null,
  status text not null default 'not_started',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_content_items_title_not_empty check (length(trim(title)) > 0),
  constraint marketing_content_items_tier_check check (
    content_tier is null or content_tier in ('S', 'A', 'B', 'C')
  ),
  constraint marketing_content_items_status_check check (
    status in ('not_started', 'assigned', 'briefed', 'ready_to_post', 'posted', 'completed', 'cancelled')
  ),
  constraint marketing_content_items_brief_link_check check (
    brief_link is null
    or length(trim(brief_link)) = 0
    or brief_link ~* '^https?://[^[:space:]]{4,}$'
  )
);

create table if not exists public.marketing_channel_placements (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.marketing_content_items(id) on delete cascade,
  channel text not null,
  publish_date date not null,
  publish_time time,
  placement_status text not null default 'planned',
  posted_url text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_channel_placements_channel_check check (
    channel in ('facebook', 'tiktok', 'instagram', 'in_game', 'youtube', 'other')
  ),
  constraint marketing_channel_placements_status_check check (
    placement_status in ('planned', 'ready', 'posted', 'delayed', 'cancelled')
  ),
  constraint marketing_channel_placements_posted_url_check check (
    posted_url is null
    or length(trim(posted_url)) = 0
    or posted_url ~* '^https?://[^[:space:]]{4,}$'
  )
);

comment on column public.marketing_content_items.source_start_date is
  'Import/helper field from the source sheet. The schedule source of truth is marketing_channel_placements.publish_date.';
comment on column public.marketing_content_items.source_start_time is
  'Import/helper field from the source sheet. The schedule source of truth is marketing_channel_placements.publish_time.';

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function public.marketing_set_created_by_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.created_by_user_id = public.current_app_user_id();
  return new;
end;
$$;

create or replace function public.marketing_normalize_channel_row()
returns trigger
language plpgsql
as $$
begin
  new.channel = public.marketing_normalize_channel(new.channel);
  return new;
end;
$$;

drop trigger if exists marketing_plans_set_created_by_user_id on public.marketing_plans;
create trigger marketing_plans_set_created_by_user_id
before insert on public.marketing_plans
for each row execute function public.marketing_set_created_by_user_id();

drop trigger if exists marketing_plans_set_updated_at on public.marketing_plans;
create trigger marketing_plans_set_updated_at
before update on public.marketing_plans
for each row execute function public.set_updated_at();

drop trigger if exists marketing_campaigns_set_updated_at on public.marketing_campaigns;
create trigger marketing_campaigns_set_updated_at
before update on public.marketing_campaigns
for each row execute function public.set_updated_at();

drop trigger if exists marketing_content_items_set_updated_at on public.marketing_content_items;
create trigger marketing_content_items_set_updated_at
before update on public.marketing_content_items
for each row execute function public.set_updated_at();

drop trigger if exists marketing_channel_placements_normalize_channel on public.marketing_channel_placements;
create trigger marketing_channel_placements_normalize_channel
before insert or update of channel on public.marketing_channel_placements
for each row execute function public.marketing_normalize_channel_row();

drop trigger if exists marketing_channel_placements_set_updated_at on public.marketing_channel_placements;
create trigger marketing_channel_placements_set_updated_at
before update on public.marketing_channel_placements
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists idx_marketing_plans_month_market
on public.marketing_plans(month_key, market, status);

create index if not exists idx_marketing_campaigns_plan_sort
on public.marketing_campaigns(plan_id, sort_order, name);

create index if not exists idx_marketing_content_items_campaign_sort
on public.marketing_content_items(campaign_id, sort_order, title);

create index if not exists idx_marketing_content_items_flowmate_work_item
on public.marketing_content_items(flowmate_work_item_id)
where flowmate_work_item_id is not null;

create index if not exists idx_marketing_channel_placements_content_item
on public.marketing_channel_placements(content_item_id);

create index if not exists idx_marketing_channel_placements_calendar
on public.marketing_channel_placements(channel, publish_date, publish_time);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.marketing_plans enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_content_items enable row level security;
alter table public.marketing_channel_placements enable row level security;

drop policy if exists "active users can read marketing plans" on public.marketing_plans;
create policy "active users can read marketing plans"
on public.marketing_plans for select
using (public.is_active_app_user());

drop policy if exists "admins can write marketing plans" on public.marketing_plans;
create policy "admins can write marketing plans"
on public.marketing_plans for all
using (public.is_admin_app_user())
with check (public.is_admin_app_user());

drop policy if exists "active users can read marketing campaigns" on public.marketing_campaigns;
create policy "active users can read marketing campaigns"
on public.marketing_campaigns for select
using (public.is_active_app_user());

drop policy if exists "admins can write marketing campaigns" on public.marketing_campaigns;
create policy "admins can write marketing campaigns"
on public.marketing_campaigns for all
using (public.is_admin_app_user())
with check (public.is_admin_app_user());

drop policy if exists "active users can read marketing content items" on public.marketing_content_items;
create policy "active users can read marketing content items"
on public.marketing_content_items for select
using (public.is_active_app_user());

drop policy if exists "admins can write marketing content items" on public.marketing_content_items;
create policy "admins can write marketing content items"
on public.marketing_content_items for all
using (public.is_admin_app_user())
with check (public.is_admin_app_user());

drop policy if exists "active users can read marketing channel placements" on public.marketing_channel_placements;
create policy "active users can read marketing channel placements"
on public.marketing_channel_placements for select
using (public.is_active_app_user());

drop policy if exists "admins can write marketing channel placements" on public.marketing_channel_placements;
create policy "admins can write marketing channel placements"
on public.marketing_channel_placements for all
using (public.is_admin_app_user())
with check (public.is_admin_app_user());

revoke all privileges on public.marketing_plans from public, anon, authenticated;
revoke all privileges on public.marketing_campaigns from public, anon, authenticated;
revoke all privileges on public.marketing_content_items from public, anon, authenticated;
revoke all privileges on public.marketing_channel_placements from public, anon, authenticated;

grant select, insert, update, delete on public.marketing_plans to authenticated;
grant select, insert, update, delete on public.marketing_campaigns to authenticated;
grant select, insert, update, delete on public.marketing_content_items to authenticated;
grant select, insert, update, delete on public.marketing_channel_placements to authenticated;

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
create or replace view public.marketing_plan_timeline_v
with (security_invoker = true) as
select
  mp.id as plan_id,
  mp.month_key,
  mp.title as plan_title,
  mp.market,
  mp.audience_scope,
  mp.plan_date,
  mp.status as plan_status,
  mc.id as campaign_id,
  mc.name as campaign_name,
  mc.team as campaign_team,
  mc.start_date as campaign_start_date,
  mc.end_date as campaign_end_date,
  mc.sort_order as campaign_sort_order,
  mci.id as content_item_id,
  mci.title as content_title,
  mci.details,
  mci.team as content_team,
  mci.format,
  mci.content_tier,
  mci.pic_user_id,
  mci.pic_name,
  mci.note as content_note,
  mci.brief_link,
  mci.source_start_date,
  mci.source_start_time,
  mci.flowmate_work_item_id,
  mci.status as content_status,
  mci.sort_order as content_sort_order,
  mcp.id as placement_id,
  mcp.channel,
  mcp.publish_date,
  mcp.publish_time,
  mcp.placement_status,
  mcp.posted_url,
  mcp.note as placement_note
from public.marketing_plans mp
join public.marketing_campaigns mc on mc.plan_id = mp.id
join public.marketing_content_items mci on mci.campaign_id = mc.id
join public.marketing_channel_placements mcp on mcp.content_item_id = mci.id
where mp.status <> 'archived'
  and mcp.placement_status <> 'cancelled';

create or replace view public.marketing_campaign_summary_v
with (security_invoker = true) as
select
  mp.id as plan_id,
  mp.month_key,
  mp.market,
  mc.id as campaign_id,
  mc.name as campaign_name,
  mc.team as campaign_team,
  mc.start_date,
  mc.end_date,
  mc.sort_order,
  count(distinct mci.id) as total_content_items,
  count(mcp.id) as total_placements,
  coalesce(
    array_agg(distinct mcp.channel order by mcp.channel)
      filter (where mcp.channel is not null),
    '{}'::text[]
  ) as channels_covered,
  count(mcp.id) filter (where mcp.placement_status = 'posted') as posted_count,
  count(mcp.id) filter (where mcp.placement_status = 'ready') as ready_count,
  count(mcp.id) filter (where mcp.placement_status = 'delayed') as delayed_count,
  count(distinct mci.id) filter (where mci.status = 'not_started') as not_started_count,
  min(mcp.publish_date) filter (
    where mcp.placement_status <> 'cancelled'
      and mcp.publish_date >= current_date
  ) as next_publish_date
from public.marketing_plans mp
join public.marketing_campaigns mc on mc.plan_id = mp.id
left join public.marketing_content_items mci on mci.campaign_id = mc.id
left join public.marketing_channel_placements mcp
  on mcp.content_item_id = mci.id
 and mcp.placement_status <> 'cancelled'
where mp.status <> 'archived'
group by mp.id, mp.month_key, mp.market, mc.id, mc.name, mc.team, mc.start_date, mc.end_date, mc.sort_order;

revoke all privileges on public.marketing_plan_timeline_v from public, anon, authenticated;
revoke all privileges on public.marketing_campaign_summary_v from public, anon, authenticated;
grant select on public.marketing_plan_timeline_v to authenticated;
grant select on public.marketing_campaign_summary_v to authenticated;

-- ---------------------------------------------------------------------------
-- Sample seed helper
-- ---------------------------------------------------------------------------
create or replace function public.marketing_plan_june_2026_sample()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid := '20000000-0000-0000-0000-000000000601';
  v_revenue_campaign_id uuid := '20000000-0000-0000-0000-000000000611';
  v_patch_campaign_id uuid := '20000000-0000-0000-0000-000000000612';
  v_esports_campaign_id uuid := '20000000-0000-0000-0000-000000000613';
  v_hero_item_id uuid := '20000000-0000-0000-0000-000000000621';
  v_monthly_item_id uuid := '20000000-0000-0000-0000-000000000622';
  v_patch_item_id uuid := '20000000-0000-0000-0000-000000000623';
  v_esports_item_id uuid := '20000000-0000-0000-0000-000000000624';
begin
  insert into public.marketing_plans (
    id, month_key, title, market, audience_scope, plan_date, status
  ) values (
    v_plan_id, '2026-06', 'FCO Internal Marketing Plan - June 2026', 'TH', 'TH ONLY', '2026-06-01', 'active'
  )
  on conflict (id) do update set
    month_key = excluded.month_key,
    title = excluded.title,
    market = excluded.market,
    audience_scope = excluded.audience_scope,
    plan_date = excluded.plan_date,
    status = excluded.status,
    updated_at = now();

  insert into public.marketing_campaigns (
    id, plan_id, name, team, start_date, end_date, sort_order
  ) values
    (v_revenue_campaign_id, v_plan_id, 'Revenue', 'MKT', '2026-06-01', '2026-06-30', 10),
    (v_patch_campaign_id, v_plan_id, 'New Patch update : 26.05', 'MKT', '2026-06-03', '2026-06-12', 20),
    (v_esports_campaign_id, v_plan_id, 'FC Pro Masters', 'Esports', '2026-06-10', '2026-06-24', 30)
  on conflict (id) do update set
    name = excluded.name,
    team = excluded.team,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    sort_order = excluded.sort_order,
    updated_at = now();

  insert into public.marketing_content_items (
    id, campaign_id, title, details, team, format, content_tier, pic_name,
    note, brief_link, source_start_date, source_start_time, flowmate_work_item_id, status, sort_order
  ) values
    (
      v_hero_item_id, v_revenue_campaign_id, 'Hero Post Teaser Banner',
      '8th Anniversary teaser content for social channels.', 'MKT', 'Banner', 'S', 'May',
      'Source row carries an initial start date; actual schedule is per placement.',
      '', '2026-06-04', '18:00',
      (select id from public.work_items where display_id = 'CR-1001' limit 1),
      'briefed', 10
    ),
    (
      v_monthly_item_id, v_revenue_campaign_id, 'Monthly Products (Jun) + Product Tokens',
      'June revenue product communication.', 'MKT', 'Album', 'A', 'Aof',
      null, '', '2026-06-07', '12:00', null, 'ready_to_post', 20
    ),
    (
      v_patch_item_id, v_patch_campaign_id, 'Cantona Icon review',
      'Patch 26.05 content review package.', 'MKT', 'Shorts/Reels', 'A', 'Folk',
      null, '', '2026-06-11', '19:00', null, 'assigned', 10
    ),
    (
      v_esports_item_id, v_esports_campaign_id, 'FC Pro Masters Announce',
      'Tournament announcement and reminder posts.', 'Esports', 'Video', 'S', 'Ploy',
      null, '', '2026-06-14', '16:00', null, 'not_started', 10
    )
  on conflict (id) do update set
    title = excluded.title,
    details = excluded.details,
    team = excluded.team,
    format = excluded.format,
    content_tier = excluded.content_tier,
    pic_name = excluded.pic_name,
    note = excluded.note,
    brief_link = excluded.brief_link,
    source_start_date = excluded.source_start_date,
    source_start_time = excluded.source_start_time,
    flowmate_work_item_id = excluded.flowmate_work_item_id,
    status = excluded.status,
    sort_order = excluded.sort_order,
    updated_at = now();

  delete from public.marketing_channel_placements
  where content_item_id in (v_hero_item_id, v_monthly_item_id, v_patch_item_id, v_esports_item_id);

  insert into public.marketing_channel_placements (
    content_item_id, channel, publish_date, publish_time, placement_status, note
  ) values
    (v_hero_item_id, 'FB', '2026-06-04', '18:00', 'planned', 'Facebook teaser placement'),
    (v_hero_item_id, 'IG', '2026-06-05', '14:00', 'planned', 'Instagram follow-up placement'),
    (v_hero_item_id, 'TK', '2026-06-06', '20:00', 'planned', 'TikTok cutdown placement'),
    (v_monthly_item_id, 'facebook', '2026-06-07', '12:00', 'ready', null),
    (v_monthly_item_id, 'in_game', '2026-06-08', null, 'ready', null),
    (v_patch_item_id, 'youtube', '2026-06-11', '19:00', 'planned', null),
    (v_patch_item_id, 'instagram', '2026-06-12', '13:00', 'planned', null),
    (v_esports_item_id, 'facebook', '2026-06-14', '16:00', 'planned', null),
    (v_esports_item_id, 'youtube', '2026-06-15', '18:30', 'planned', null);
end;
$$;

revoke all on function public.marketing_plan_june_2026_sample() from public, anon, authenticated;
