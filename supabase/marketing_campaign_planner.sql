-- Campaign Planner. Apply after marketing_plan.sql and workflow_mvp_catalogs.sql.
-- Additive: stable campaign_tag_id is shared by all monthly campaign instances.
-- No historical names, publish dates, or production deadlines are backfilled.
begin;

create table if not exists public.marketing_campaign_planner_leads (
  user_id uuid primary key references public.users(id) on delete cascade
);
alter table public.marketing_campaign_planner_leads enable row level security;
revoke all on public.marketing_campaign_planner_leads from public, anon, authenticated;
grant select, insert, delete on public.marketing_campaign_planner_leads to authenticated;
drop policy if exists planner_leads_read on public.marketing_campaign_planner_leads;
create policy planner_leads_read on public.marketing_campaign_planner_leads for select to authenticated
using ((select public.is_active_app_user()) and (user_id = (select auth.uid()) or (select public.is_admin_app_user())));
drop policy if exists planner_leads_add on public.marketing_campaign_planner_leads;
create policy planner_leads_add on public.marketing_campaign_planner_leads for insert to authenticated
with check ((select public.is_active_app_user()) and (select public.is_admin_app_user())
  and exists (select 1 from public.users u where u.id = user_id and u.is_active));
drop policy if exists planner_leads_remove on public.marketing_campaign_planner_leads;
create policy planner_leads_remove on public.marketing_campaign_planner_leads for delete to authenticated
using ((select public.is_active_app_user()) and (select public.is_admin_app_user()));

create or replace function public.marketing_campaign_planner_can_manage()
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and public.is_active_app_user() and public.is_admin_app_user();
$$;
revoke all on function public.marketing_campaign_planner_can_manage() from public, anon, authenticated;
grant execute on function public.marketing_campaign_planner_can_manage() to authenticated;

create table if not exists public.marketing_campaign_planner_details (
  campaign_tag_id uuid primary key references public.marketing_campaign_tags(id) on delete restrict,
  tagline text not null default '' check (char_length(tagline) <= 300),
  start_date date,
  end_date date,
  updated_by_user_id uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint planner_date_pair check ((start_date is null) = (end_date is null)),
  constraint planner_date_order check (end_date >= start_date)
);
create index if not exists idx_planner_details_updated_by on public.marketing_campaign_planner_details(updated_by_user_id);
alter table public.marketing_campaign_planner_details enable row level security;
revoke all on public.marketing_campaign_planner_details from public, anon, authenticated;
grant select, insert, update on public.marketing_campaign_planner_details to authenticated;
drop policy if exists planner_details_read on public.marketing_campaign_planner_details;
create policy planner_details_read on public.marketing_campaign_planner_details for select to authenticated
using ((select public.is_active_app_user()));
drop policy if exists planner_details_add on public.marketing_campaign_planner_details;
create policy planner_details_add on public.marketing_campaign_planner_details for insert to authenticated
with check ((select public.marketing_campaign_planner_can_manage()) and exists (
  select 1 from public.marketing_campaign_tags t where t.id = campaign_tag_id and t.archived_at is null
));
drop policy if exists planner_details_edit on public.marketing_campaign_planner_details;
create policy planner_details_edit on public.marketing_campaign_planner_details for update to authenticated
using ((select public.marketing_campaign_planner_can_manage()) and exists (
  select 1 from public.marketing_campaign_tags t where t.id = campaign_tag_id and t.archived_at is null
))
with check ((select public.marketing_campaign_planner_can_manage()) and exists (
  select 1 from public.marketing_campaign_tags t where t.id = campaign_tag_id and t.archived_at is null
));

create or replace function public.marketing_campaign_planner_stamp()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.campaign_tag_id is distinct from old.campaign_tag_id then
    raise exception 'Campaign identity cannot be changed';
  end if;
  new.updated_by_user_id := auth.uid();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.marketing_campaign_planner_stamp() from public, anon, authenticated;
drop trigger if exists planner_details_stamp on public.marketing_campaign_planner_details;
create trigger planner_details_stamp before insert or update on public.marketing_campaign_planner_details
for each row execute function public.marketing_campaign_planner_stamp();

-- Guard old management RPCs as well as the new save path. Existing unchanged
-- legacy names remain usable; creating/renaming always requires the suffix.
create or replace function public.marketing_campaign_planner_guard_tag()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if not public.marketing_campaign_planner_can_manage() then
    raise exception 'Only Admin can manage campaigns' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' or new.name is distinct from old.name then
    new.name := btrim(new.name);
    if new.name !~ '^.*[^[:space:]].* \[(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[1-9][0-9]{3}\]$' then
      raise exception 'กรุณาระบุชื่อแคมเปญพร้อมเดือนและปี เช่น Summer Sale [Jul-2026]';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.marketing_campaign_planner_guard_tag() from public, anon, authenticated;
drop trigger if exists planner_campaign_tag_guard on public.marketing_campaign_tags;
create trigger planner_campaign_tag_guard before insert or update on public.marketing_campaign_tags
for each row execute function public.marketing_campaign_planner_guard_tag();

-- Invoker rights retain existing RPC authorization plus metadata RLS.
-- One transaction prevents a tag being saved without its dates/tagline.
create or replace function public.marketing_campaign_planner_save(
  p_campaign_tag_id uuid, p_name text, p_function_code text,
  p_tagline text, p_start_date date, p_end_date date, p_expected_updated_at timestamptz
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_tag public.marketing_campaign_tags%rowtype;
begin
  if not public.marketing_campaign_planner_can_manage() then
    raise exception 'Only Admin can manage campaigns' using errcode = '42501';
  end if;
  if btrim(coalesce(p_name, '')) !~ '^.*[^[:space:]].* \[(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[1-9][0-9]{3}\]$' then
    raise exception 'กรุณาระบุชื่อแคมเปญพร้อมเดือนและปี เช่น Summer Sale [Jul-2026]';
  end if;
  -- Advisory lock avoids needing UPDATE privileges on the protected tag table.
  if p_campaign_tag_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_campaign_tag_id::text, 0));
    select * into v_tag from public.marketing_campaign_tags where id = p_campaign_tag_id;
    if v_tag.id is null then raise exception 'Campaign not found'; end if;
    if p_expected_updated_at is null or v_tag.updated_at is distinct from p_expected_updated_at then
      raise exception 'Campaign changed. Refresh and review before saving again.' using errcode = '40001';
    end if;
  end if;
  v_tag := public.marketing_upsert_campaign_tag(p_campaign_tag_id, p_name, p_function_code);
  insert into public.marketing_campaign_planner_details(campaign_tag_id, tagline, start_date, end_date)
  values (v_tag.id, btrim(coalesce(p_tagline, '')), p_start_date, p_end_date)
  on conflict (campaign_tag_id) do update
    set tagline = excluded.tagline, start_date = excluded.start_date, end_date = excluded.end_date;
  return v_tag.id;
end;
$$;
revoke all on function public.marketing_campaign_planner_save(uuid,text,text,text,date,date,timestamptz) from public, anon, authenticated;
grant execute on function public.marketing_campaign_planner_save(uuid,text,text,text,date,date,timestamptz) to authenticated;

-- One row per content item, including items without placements. Never infer
-- publishing completion from a linked creative request's Delivered status.
create or replace view public.marketing_campaign_planner_items_v with (security_invoker = true) as
select mc.campaign_tag_id, mci.id as content_item_id, mci.title as content_title,
  mci.pic_name, mci.status as content_status, mci.flowmate_work_item_id,
  mp.month_key, mc.id as campaign_id,
  count(p.id) filter (where p.placement_status <> 'cancelled') as placement_count,
  count(p.id) filter (where p.placement_status = 'posted') as posted_count,
  min(p.publish_date) filter (where p.placement_status <> 'cancelled') as first_publish_date,
  max(p.publish_date) filter (where p.placement_status <> 'cancelled') as last_publish_date,
  (mci.status = 'cancelled') as is_cancelled,
  (mci.status <> 'cancelled'
    and count(p.id) filter (where p.placement_status <> 'cancelled') > 0
    and count(p.id) filter (where p.placement_status <> 'cancelled') = count(p.id) filter (where p.placement_status = 'posted')) as is_complete,
  greatest(mc.created_at, mc.updated_at, mci.created_at, mci.updated_at) as last_used_at,
  coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'channel', p.channel, 'launch_date', p.publish_date,
    'publish_time', p.publish_time, 'status', p.placement_status
  ) order by p.publish_date, p.publish_time, p.channel)
    filter (where p.id is not null and p.placement_status <> 'cancelled'), '[]'::jsonb) as working_placements
from public.marketing_content_items mci
join public.marketing_campaigns mc on mc.id = mci.campaign_id
join public.marketing_plans mp on mp.id = mc.plan_id and mp.status <> 'archived'
left join public.marketing_channel_placements p on p.content_item_id = mci.id
group by mc.campaign_tag_id, mci.id, mci.title, mci.pic_name, mci.status,
  mci.flowmate_work_item_id, mp.month_key, mc.id;

create or replace view public.marketing_campaign_planner_v with (security_invoker = true) as
select t.id as campaign_tag_id, t.name, t.function_code, f.label as function_label,
  f.light_background, f.light_foreground, f.dark_background, f.dark_foreground,
  (t.archived_at is not null) as is_archived, t.updated_at, t.created_at,
  coalesce(d.tagline, '') as tagline, d.start_date, d.end_date,
  coalesce(s.total_items, 0) as total_items, coalesce(s.completed_items, 0) as completed_items,
  coalesce(s.cancelled_items, 0) as cancelled_items,
  coalesce(s.placement_count, 0) as placement_count, coalesce(s.posted_count, 0) as posted_count,
  s.first_publish_date, s.last_publish_date, s.last_used_at
from public.marketing_campaign_tags t
left join public.marketing_campaign_functions f on f.code = t.function_code
left join public.marketing_campaign_planner_details d on d.campaign_tag_id = t.id
left join (
  select campaign_tag_id,
    count(*) filter (where not is_cancelled) as total_items,
    count(*) filter (where is_complete) as completed_items,
    count(*) filter (where is_cancelled) as cancelled_items,
    sum(placement_count) filter (where not is_cancelled) as placement_count,
    sum(posted_count) filter (where not is_cancelled) as posted_count,
    min(first_publish_date) filter (where not is_cancelled) as first_publish_date,
    max(last_publish_date) filter (where not is_cancelled) as last_publish_date,
    max(last_used_at) as last_used_at
  from public.marketing_campaign_planner_items_v group by campaign_tag_id
) s on s.campaign_tag_id = t.id;
revoke all on public.marketing_campaign_planner_items_v, public.marketing_campaign_planner_v from public, anon, authenticated;
grant select on public.marketing_campaign_planner_items_v, public.marketing_campaign_planner_v to authenticated;

commit;
