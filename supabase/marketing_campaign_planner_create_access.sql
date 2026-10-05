-- Apply after marketing_campaign_planner.sql. Creation only; management stays Admin.
begin;

create or replace function public.marketing_campaign_planner_can_create()
returns boolean language sql stable security invoker set search_path = '' as $$
  select auth.uid() is not null and public.is_active_app_user() is true;
$$;
revoke all on function public.marketing_campaign_planner_can_create() from public, anon, authenticated;
grant execute on function public.marketing_campaign_planner_can_create() to authenticated;

-- Team Members' statement guard also blocks Viewer inside SECURITY DEFINER RPCs.
-- Replace it only on these two tables, with an INSERT-only exception.
-- Direct table writes remain constrained by the existing grants and RLS.
create or replace function flowmate_members_private.guard_campaign_planner_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and tg_table_schema = 'public'
     and tg_table_name in ('marketing_campaign_tags', 'marketing_campaign_planner_details')
     and public.marketing_campaign_planner_can_create() is true then
    return null;
  end if;
  if exists (select 1 from public.users where id = auth.uid() and role = 'viewer') then
    raise exception 'Viewer access is read-only' using errcode = '42501';
  end if;
  return null;
end;
$$;
revoke all on function flowmate_members_private.guard_campaign_planner_write() from public, anon, authenticated;
drop trigger if exists flowmate_viewer_write_guard on public.marketing_campaign_tags;
create trigger flowmate_viewer_write_guard before insert or update or delete or truncate
on public.marketing_campaign_tags for each statement
execute function flowmate_members_private.guard_campaign_planner_write();
drop trigger if exists flowmate_viewer_write_guard on public.marketing_campaign_planner_details;
create trigger flowmate_viewer_write_guard before insert or update or delete or truncate
on public.marketing_campaign_planner_details for each statement
execute function flowmate_members_private.guard_campaign_planner_write();

create or replace function public.marketing_campaign_planner_guard_tag()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if public.marketing_campaign_planner_can_create() is not true then
      raise exception 'Active sign-in is required' using errcode = '42501';
    end if;
  elsif public.marketing_campaign_planner_can_manage() is not true then
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

-- Dedicated create-only entrypoint: no existing ID, no upsert of metadata,
-- no table grants or broader UPDATE policies for ordinary users.
create or replace function public.marketing_campaign_planner_create(
  p_name text, p_function_code text, p_tagline text, p_start_date date, p_end_date date
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_tag public.marketing_campaign_tags%rowtype;
begin
  if public.marketing_campaign_planner_can_create() is not true then
    raise exception 'Active sign-in is required' using errcode = '42501';
  end if;
  -- Existing helper validates active function, duplicate names, and records actor.
  -- Its INSERT trigger above validates the required month/year name suffix.
  v_tag := public.marketing_upsert_campaign_tag(null, p_name, p_function_code);
  insert into public.marketing_campaign_planner_details(campaign_tag_id, tagline, start_date, end_date)
  values (v_tag.id, btrim(coalesce(p_tagline, '')), p_start_date, p_end_date);
  -- Existing constraints validate paired dates, order and tagline length.
  -- Any failure rolls back both inserts in this RPC transaction.
  return v_tag.id;
end;
$$;
revoke all on function public.marketing_campaign_planner_create(text,text,text,date,date) from public, anon, authenticated;
grant execute on function public.marketing_campaign_planner_create(text,text,text,date,date) to authenticated;

commit;
