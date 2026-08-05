-- FlowMate MVP 1.2 Creative request platform/size templates
-- Run this AFTER rpc_assignment.sql so flowmate_actor_user_id() exists.

create extension if not exists pgcrypto;

create table if not exists public.creative_request_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform text not null,
  size_format text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_by_user_id uuid references public.users(id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_request_templates_name_not_empty check (length(trim(name)) > 0),
  constraint creative_request_templates_platform_not_empty check (length(trim(platform)) > 0),
  constraint creative_request_templates_size_not_empty check (length(trim(size_format)) > 0)
);

create index if not exists idx_creative_request_templates_active_name
on public.creative_request_templates(is_active, lower(name));

create unique index if not exists idx_creative_request_templates_active_name_unique
on public.creative_request_templates(lower(name))
where is_active = true;

alter table public.creative_request_templates enable row level security;

drop policy if exists "active app users can read creative request templates" on public.creative_request_templates;
create policy "active app users can read creative request templates"
on public.creative_request_templates for select
using (public.is_active_app_user());

revoke all privileges on public.creative_request_templates from anon, authenticated;
revoke insert, update, delete on public.creative_request_templates from anon, authenticated;

insert into public.creative_request_templates(name, platform, size_format, description, is_system)
select seed.name, seed.platform, seed.size_format, seed.description, true
from (
  values
    ('Instagram square', 'Instagram', '1080x1080', 'Feed square post'),
    ('Instagram story', 'Instagram', '1080x1920', 'Story/Reels vertical'),
    ('Facebook feed', 'Facebook', '1200x628', 'Link share / feed creative')
) as seed(name, platform, size_format, description)
where not exists (
  select 1
  from public.creative_request_templates existing
  where lower(existing.name) = lower(seed.name)
    and existing.is_active = true
);

create or replace function public.flowmate_list_creative_request_templates()
returns table(
  id uuid,
  name text,
  platform text,
  size_format text,
  description text,
  is_system boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.flowmate_actor_user_id();

  return query
  select
    crt.id,
    crt.name,
    crt.platform,
    crt.size_format,
    coalesce(crt.description, '') as description,
    crt.is_system,
    crt.created_at
  from public.creative_request_templates crt
  where crt.is_active = true
  order by crt.is_system desc, lower(crt.name) asc;
end;
$$;

create or replace function public.flowmate_create_creative_request_template(
  p_name text,
  p_platform text,
  p_size_format text,
  p_description text default null
) returns table(
  id uuid,
  name text,
  platform text,
  size_format text,
  description text,
  is_system boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_template public.creative_request_templates%rowtype;
begin
  v_actor_id := public.flowmate_actor_user_id();

  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Template name is required';
  end if;
  if length(trim(coalesce(p_platform, ''))) = 0 then
    raise exception 'Platform is required';
  end if;
  if length(trim(coalesce(p_size_format, ''))) = 0 then
    raise exception 'Size / format is required';
  end if;

  update public.creative_request_templates as crt
     set platform = trim(p_platform),
         size_format = trim(p_size_format),
         description = nullif(trim(coalesce(p_description, '')), ''),
         updated_at = now()
   where lower(crt.name) = lower(trim(p_name))
     and crt.is_active = true
  returning crt.* into v_template;

  if v_template.id is null then
    insert into public.creative_request_templates(
    name,
    platform,
    size_format,
    description,
    is_system,
    created_by_user_id
  ) values (
    trim(p_name),
    trim(p_platform),
    trim(p_size_format),
    nullif(trim(coalesce(p_description, '')), ''),
    false,
    v_actor_id
    )
    returning * into v_template;
  end if;

  return query
  select
    v_template.id,
    v_template.name,
    v_template.platform,
    v_template.size_format,
    coalesce(v_template.description, '') as description,
    v_template.is_system,
    v_template.created_at;
end;
$$;

revoke all on function public.flowmate_list_creative_request_templates() from public, anon, authenticated;
revoke all on function public.flowmate_create_creative_request_template(text, text, text, text) from public, anon, authenticated;
grant execute on function public.flowmate_list_creative_request_templates() to authenticated;
grant execute on function public.flowmate_create_creative_request_template(text, text, text, text) to authenticated;
