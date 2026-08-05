-- FlowMate Workflow Management MVP: team-separated workspaces
-- ---------------------------------------------------------------------------
-- Run after the existing FlowMate schema, RPC, collaboration, AI tag, and
-- security files. This migration is idempotent and intentionally does not
-- modify historical requester_team text.
--
-- Historical quarantine rule:
-- - Known requester_team values are normalized into work_items.owning_team_code.
-- - Unknown, blank, NULL, and FCO values remain owning_team_code = NULL.
-- - Quarantined rows are visible and mutable only to active admins or users
--   with users.can_access_all_teams = true.
-- - New rows may not enter quarantine. The work-item trigger rejects an insert
--   unless a valid owning team can be resolved.
--
-- Policies replaced by this migration:
-- - work_items:
--     "active users can read work items"
--     "participants can update work items"
--     "active users can insert work items"
-- - creative_request_details:
--     "active users can read creative details"
--     "participants can mutate creative details"
-- - assignment_runs:
--     "active users can read assignment runs"
-- - work_item_events:
--     "active users can read events"
-- - comments:
--     "participants can read comments"
--     "active users can read comments"
--     "active users can insert own comments"
--     "authors can update comments"
-- - checklist_items:
--     "active users can read checklist"
--     "participants can mutate checklist"
-- - work_item_links:
--     "work item participants can read links"
-- - work_item_watchers:
--     "work item participants can read watchers"
-- - work_item_ai_tags:
--     "work item participants can read ai tags"
--
-- New policy names are listed near the RLS section below.

begin;

-- ---------------------------------------------------------------------------
-- Team model
-- ---------------------------------------------------------------------------

create table if not exists public.teams (
  code text primary key,
  display_name text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_code_not_empty check (length(trim(code)) > 0),
  constraint teams_display_name_not_empty check (length(trim(display_name)) > 0)
);

insert into public.teams (code, display_name, is_active)
values
  ('gdve', 'Team GD/VE', true),
  ('ops', 'Team Ops', true),
  ('mkt', 'Team MKT', true),
  ('esport', 'Team eSport', true)
on conflict (code) do update
set display_name = excluded.display_name,
    is_active = excluded.is_active,
    updated_at = now();

alter table public.users
  add column if not exists can_access_all_teams boolean not null default false;

create table if not exists public.user_team_memberships (
  user_id uuid not null references public.users(id) on update cascade on delete cascade,
  team_code text not null references public.teams(code) on update cascade on delete restrict,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references public.users(id) on update cascade on delete set null,
  primary key (user_id, team_code)
);

create index if not exists idx_user_team_memberships_team_user
on public.user_team_memberships(team_code, user_id);

create unique index if not exists idx_user_team_memberships_one_primary
on public.user_team_memberships(user_id)
where is_primary;

alter table public.work_items
  add column if not exists owning_team_code text;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.work_items'::regclass
      and c.conname = 'work_items_owning_team_code_fkey'
  ) then
    alter table public.work_items
      add constraint work_items_owning_team_code_fkey
      foreign key (owning_team_code)
      references public.teams(code)
      on update cascade
      on delete restrict;
  end if;
end;
$$;

create index if not exists idx_work_items_owning_team
on public.work_items(owning_team_code);

create index if not exists idx_work_items_owning_team_active_status
on public.work_items(owning_team_code, status, due_date, id)
where archived_at is null;

comment on column public.work_items.owning_team_code is
  'Canonical workspace owner. NULL is a privileged-only migration quarantine for historical rows whose requester_team cannot be mapped safely.';

-- ---------------------------------------------------------------------------
-- Canonical normalization
-- ---------------------------------------------------------------------------

create or replace function public.flowmate_normalize_team_code(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case pg_catalog.lower(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(coalesce(p_value, '')),
      '\s+',
      ' ',
      'g'
    )
  )
    when 'gd/ve' then 'gdve'
    when 'gdve' then 'gdve'
    when 'gd ve' then 'gdve'
    when 'team gd/ve' then 'gdve'
    when 'team gdve' then 'gdve'
    when 'gd/ve internal' then 'gdve'
    when 'operations' then 'ops'
    when 'operation' then 'ops'
    when 'ops' then 'ops'
    when 'team ops' then 'ops'
    when 'pm' then 'ops'
    when 'marketing' then 'mkt'
    when 'mkt' then 'mkt'
    when 'team mkt' then 'mkt'
    when 'esport' then 'esport'
    when 'esports' then 'esport'
    when 'e-sport' then 'esport'
    when 'team esport' then 'esport'
    when 'esport ops' then 'esport'
    else null
  end;
$$;

revoke all on function public.flowmate_normalize_team_code(text)
from public, anon, authenticated;

-- Existing admins plus the named privileged users receive all-team access.
-- Existing true values are never reset by this idempotent backfill.
update public.users
set can_access_all_teams = true,
    updated_at = now()
where coalesce(can_access_all_teams, false) = false
  and (
    role = 'admin'
    or pg_catalog.lower(email) in (
      'sasin.cha@garena.com',
      'weerayut@garena.com',
      'panuwee.w@garena.com',
      'fco.punyakon@garena.com'
    )
  );

-- Backfill one known primary membership from users.requester_team.
-- Unknown values are not guessed and do not create a membership.
insert into public.user_team_memberships (
  user_id,
  team_code,
  is_primary,
  created_by_user_id
)
select
  u.id,
  public.flowmate_normalize_team_code(u.requester_team),
  not exists (
    select 1
    from public.user_team_memberships existing_primary
    where existing_primary.user_id = u.id
      and existing_primary.is_primary
  ),
  null
from public.users u
where public.flowmate_normalize_team_code(u.requester_team) is not null
on conflict (user_id, team_code) do nothing;

-- If the matching membership pre-existed without a primary designation, make
-- it primary only when the user currently has no primary membership.
update public.user_team_memberships membership
set is_primary = true
from public.users u
where membership.user_id = u.id
  and membership.team_code = public.flowmate_normalize_team_code(u.requester_team)
  and membership.is_primary = false
  and not exists (
    select 1
    from public.user_team_memberships existing_primary
    where existing_primary.user_id = membership.user_id
      and existing_primary.is_primary
  );

-- Production members are represented by team_members. Repair missing GD/VE
-- workspace memberships from that authoritative active-member link without
-- replacing another existing primary team.
insert into public.user_team_memberships (
  user_id,
  team_code,
  is_primary,
  created_by_user_id
)
select
  tm.user_id,
  'gdve',
  not exists (
    select 1
    from public.user_team_memberships existing_primary
    where existing_primary.user_id = tm.user_id
      and existing_primary.is_primary
  ),
  null
from public.team_members tm
join public.users u
  on u.id = tm.user_id
 and u.is_active = true
where tm.active = true
  and tm.user_id is not null
  and public.flowmate_normalize_team_code(tm.discipline) = 'gdve'
on conflict (user_id, team_code) do nothing;

update public.user_team_memberships membership
set is_primary = true
where membership.team_code = 'gdve'
  and membership.is_primary = false
  and exists (
    select 1
    from public.team_members tm
    join public.users u
      on u.id = tm.user_id
     and u.is_active = true
    where tm.user_id = membership.user_id
      and tm.active = true
      and public.flowmate_normalize_team_code(tm.discipline) = 'gdve'
  )
  and not exists (
    select 1
    from public.user_team_memberships existing_primary
    where existing_primary.user_id = membership.user_id
      and existing_primary.is_primary
  );

-- Backfill only deterministic historical mappings. Unknown rows remain NULL.
update public.work_items
set owning_team_code = public.flowmate_normalize_team_code(requester_team)
where owning_team_code is null
  and public.flowmate_normalize_team_code(requester_team) is not null;

-- ---------------------------------------------------------------------------
-- Indexed, non-recursive authorization helpers
-- ---------------------------------------------------------------------------

create or replace function public.flowmate_user_has_all_team_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
      and (
        u.role = 'admin'
        or u.can_access_all_teams = true
      )
  );
$$;

create or replace function public.flowmate_user_can_access_team(
  p_user_id uuid,
  p_team_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
      and (
        u.role = 'admin'
        or u.can_access_all_teams = true
        or (
          p_team_code is not null
          and exists (
            select 1
            from public.user_team_memberships membership
            join public.teams team
              on team.code = membership.team_code
             and team.is_active = true
            where membership.user_id = u.id
              and membership.team_code = p_team_code
          )
        )
      )
  );
$$;

create or replace function public.flowmate_user_is_team_member(
  p_user_id uuid,
  p_team_code text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.users u
    join public.user_team_memberships membership
      on membership.user_id = u.id
    join public.teams team
      on team.code = membership.team_code
     and team.is_active = true
    where u.id = p_user_id
      and u.is_active = true
      and membership.team_code = p_team_code
  );
$$;

create or replace function public.flowmate_current_user_has_all_team_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.flowmate_user_has_all_team_access((select auth.uid()));
$$;

create or replace function public.flowmate_current_user_can_access_team(p_team_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.flowmate_user_can_access_team((select auth.uid()), p_team_code);
$$;

create or replace function public.flowmate_user_is_work_item_participant(
  p_user_id uuid,
  p_work_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_items wi
    left join public.team_members owner_member
      on owner_member.id = wi.final_owner_member_id
    where wi.id = p_work_item_id
      and (
        wi.requester_user_id = p_user_id
        or wi.assignee_user_id = p_user_id
        or owner_member.user_id = p_user_id
      )
  );
$$;

create or replace function public.flowmate_user_is_gdve_work_item_assignee(
  p_user_id uuid,
  p_work_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_items wi
    left join public.team_members owner_member
      on owner_member.id = wi.final_owner_member_id
    where wi.id = p_work_item_id
      and wi.owning_team_code is not null
      and exists (
        select 1
        from public.users actor_user
        where actor_user.id = p_user_id
          and actor_user.is_active = true
      )
      and (
        (
          wi.assignee_user_id = p_user_id
          and exists (
            select 1
            from public.team_members actor_member
            where actor_member.user_id = p_user_id
              and actor_member.active = true
              and public.flowmate_normalize_team_code(
                actor_member.discipline
              ) = 'gdve'
          )
        )
        or (
          owner_member.user_id = p_user_id
          and owner_member.active = true
          and public.flowmate_normalize_team_code(
            owner_member.discipline
          ) = 'gdve'
        )
      )
  );
$$;

create or replace function public.flowmate_user_can_access_work_item(
  p_user_id uuid,
  p_work_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_items wi
    where wi.id = p_work_item_id
      and public.flowmate_user_can_access_team(p_user_id, wi.owning_team_code)
  );
$$;

create or replace function public.flowmate_user_can_read_work_item(
  p_user_id uuid,
  p_work_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.work_items wi
    where wi.id = p_work_item_id
      and (
        public.flowmate_user_can_access_team(
          p_user_id,
          wi.owning_team_code
        )
        or (
          wi.work_type = 'creative_request'
          and wi.owning_team_code is not null
          and public.flowmate_user_is_team_member(p_user_id, 'gdve')
        )
      )
  );
$$;

create or replace function public.flowmate_current_user_can_access_work_item(
  p_work_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.flowmate_user_can_access_work_item(
    (select auth.uid()),
    p_work_item_id
  );
$$;

create or replace function public.flowmate_current_user_can_read_work_item(
  p_work_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.flowmate_user_can_read_work_item(
    (select auth.uid()),
    p_work_item_id
  );
$$;

create or replace function public.flowmate_current_user_can_mutate_work_item(
  p_work_item_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.flowmate_user_can_access_work_item(
      (select auth.uid()),
      p_work_item_id
    )
    and (
      public.flowmate_user_has_all_team_access((select auth.uid()))
      or public.flowmate_user_is_work_item_participant(
        (select auth.uid()),
        p_work_item_id
      )
    );
$$;

create or replace function public.flowmate_is_trusted_database_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    (select auth.uid()) is null
    and (
      session_user in ('postgres', 'supabase_admin')
      or coalesce(
        nullif(
          pg_catalog.current_setting('request.jwt.claim.role', true),
          ''
        ),
        ''
      ) = 'service_role'
    );
$$;

revoke all on function public.flowmate_user_has_all_team_access(uuid)
from public, anon, authenticated;
revoke all on function public.flowmate_user_can_access_team(uuid, text)
from public, anon, authenticated;
revoke all on function public.flowmate_user_is_team_member(uuid, text)
from public, anon, authenticated;
revoke all on function public.flowmate_user_is_work_item_participant(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.flowmate_user_is_gdve_work_item_assignee(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.flowmate_user_can_access_work_item(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.flowmate_user_can_read_work_item(uuid, uuid)
from public, anon, authenticated;
revoke all on function public.flowmate_is_trusted_database_context()
from public, anon, authenticated;

revoke all on function public.flowmate_current_user_has_all_team_access()
from public, anon, authenticated;
revoke all on function public.flowmate_current_user_can_access_team(text)
from public, anon, authenticated;
revoke all on function public.flowmate_current_user_can_access_work_item(uuid)
from public, anon, authenticated;
revoke all on function public.flowmate_current_user_can_read_work_item(uuid)
from public, anon, authenticated;
revoke all on function public.flowmate_current_user_can_mutate_work_item(uuid)
from public, anon, authenticated;

grant execute on function public.flowmate_current_user_has_all_team_access()
to authenticated;
grant execute on function public.flowmate_current_user_can_access_team(text)
to authenticated;
grant execute on function public.flowmate_current_user_can_access_work_item(uuid)
to authenticated;
grant execute on function public.flowmate_current_user_can_read_work_item(uuid)
to authenticated;
grant execute on function public.flowmate_current_user_can_mutate_work_item(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- Write guards
-- ---------------------------------------------------------------------------

create or replace function public.flowmate_guard_work_item_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_normalized_team text;
  v_gdve_assignee_same_workspace boolean := false;
begin
  if tg_op = 'DELETE' then
    if public.flowmate_is_trusted_database_context() then
      return old;
    end if;

    if v_actor_id is null then
      raise exception 'Authentication required';
    end if;

    if not public.flowmate_user_can_access_team(
      v_actor_id,
      old.owning_team_code
    ) then
      raise exception 'You do not have access to this team workspace';
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.owning_team_code is null then
      new.owning_team_code :=
        public.flowmate_normalize_team_code(new.requester_team);
    end if;

    if new.owning_team_code is null then
      raise exception using
        message = 'A valid owning team is required',
        detail = 'Legacy requester_team must resolve to GD/VE, Ops, MKT, or eSport.',
        hint = 'Send a supported team value. Historical unmapped rows are quarantined only during migration.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.requester_team is distinct from old.requester_team
       and new.owning_team_code is not distinct from old.owning_team_code then
      v_normalized_team :=
        public.flowmate_normalize_team_code(new.requester_team);

      if v_normalized_team is null then
        raise exception using
          message = 'The updated requester team cannot be mapped safely',
          detail = 'A valid owning team is required for team changes.',
          hint = 'Use GD/VE, Ops, MKT, or eSport.';
      end if;

      new.owning_team_code := v_normalized_team;
    end if;

    if old.owning_team_code is not null
       and new.owning_team_code is null then
      raise exception 'A mapped work item cannot be moved into migration quarantine';
    end if;
  end if;

  if new.owning_team_code is not null
     and not exists (
       select 1
       from public.teams team
       where team.code = new.owning_team_code
         and team.is_active = true
     ) then
    raise exception 'Owning team % is missing or inactive', new.owning_team_code;
  end if;

  if public.flowmate_is_trusted_database_context() then
    return new;
  end if;

  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if tg_op = 'UPDATE' then
    v_gdve_assignee_same_workspace :=
      new.owning_team_code is not distinct from old.owning_team_code
      and public.flowmate_user_is_gdve_work_item_assignee(
        v_actor_id,
        old.id
      );
  end if;

  if tg_op = 'UPDATE'
     and not public.flowmate_user_can_access_team(
       v_actor_id,
       old.owning_team_code
     )
     and not v_gdve_assignee_same_workspace then
    raise exception 'You do not have access to the current team workspace';
  end if;

  if not public.flowmate_user_can_access_team(
    v_actor_id,
    new.owning_team_code
  )
  and not v_gdve_assignee_same_workspace then
    raise exception 'You cannot assign or modify work in team workspace %',
      coalesce(new.owning_team_code, '<migration quarantine>');
  end if;

  return new;
end;
$$;

create or replace function public.flowmate_guard_child_work_item_team()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if public.flowmate_is_trusted_database_context() then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if v_actor_id is null then
    raise exception 'Authentication required';
  end if;

  if tg_op in ('UPDATE', 'DELETE')
     and not public.flowmate_user_can_access_work_item(
       v_actor_id,
       old.work_item_id
     )
     and not public.flowmate_user_is_gdve_work_item_assignee(
       v_actor_id,
       old.work_item_id
     ) then
    raise exception 'You do not have access to the current team workspace';
  end if;

  if tg_op in ('INSERT', 'UPDATE')
     and not public.flowmate_user_can_access_work_item(
       v_actor_id,
       new.work_item_id
     )
     and not public.flowmate_user_is_gdve_work_item_assignee(
       v_actor_id,
       new.work_item_id
     ) then
    raise exception 'You cannot write data for another team workspace';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.flowmate_guard_work_item_team()
from public, anon, authenticated;
revoke all on function public.flowmate_guard_child_work_item_team()
from public, anon, authenticated;

drop trigger if exists flowmate_work_items_team_guard on public.work_items;
create trigger flowmate_work_items_team_guard
before insert or update or delete on public.work_items
for each row execute function public.flowmate_guard_work_item_team();

drop trigger if exists flowmate_creative_details_team_guard
on public.creative_request_details;
create trigger flowmate_creative_details_team_guard
before insert or update or delete on public.creative_request_details
for each row execute function public.flowmate_guard_child_work_item_team();

drop trigger if exists flowmate_assignment_runs_team_guard
on public.assignment_runs;
create trigger flowmate_assignment_runs_team_guard
before insert or update or delete on public.assignment_runs
for each row execute function public.flowmate_guard_child_work_item_team();

drop trigger if exists flowmate_work_item_events_team_guard
on public.work_item_events;
create trigger flowmate_work_item_events_team_guard
before insert or update or delete on public.work_item_events
for each row execute function public.flowmate_guard_child_work_item_team();

drop trigger if exists flowmate_comments_team_guard on public.comments;
create trigger flowmate_comments_team_guard
before insert or update or delete on public.comments
for each row execute function public.flowmate_guard_child_work_item_team();

drop trigger if exists flowmate_checklist_team_guard on public.checklist_items;
create trigger flowmate_checklist_team_guard
before insert or update or delete on public.checklist_items
for each row execute function public.flowmate_guard_child_work_item_team();

drop trigger if exists flowmate_links_team_guard on public.work_item_links;
create trigger flowmate_links_team_guard
before insert or update or delete on public.work_item_links
for each row execute function public.flowmate_guard_child_work_item_team();

drop trigger if exists flowmate_watchers_team_guard on public.work_item_watchers;
create trigger flowmate_watchers_team_guard
before insert or update or delete on public.work_item_watchers
for each row execute function public.flowmate_guard_child_work_item_team();

drop trigger if exists flowmate_ai_tags_team_guard on public.work_item_ai_tags;
create trigger flowmate_ai_tags_team_guard
before insert or update or delete on public.work_item_ai_tags
for each row execute function public.flowmate_guard_child_work_item_team();

drop trigger if exists flowmate_capacity_allocations_team_guard
on public.flowmate_capacity_allocations;
create trigger flowmate_capacity_allocations_team_guard
before insert or update or delete on public.flowmate_capacity_allocations
for each row execute function public.flowmate_guard_child_work_item_team();

-- ---------------------------------------------------------------------------
-- RLS: team metadata and memberships
-- ---------------------------------------------------------------------------

alter table public.teams enable row level security;
alter table public.user_team_memberships enable row level security;

drop policy if exists "active users can read teams" on public.teams;
create policy "active users can read teams"
on public.teams for select
to authenticated
using ((select public.is_active_app_user()));

drop policy if exists "users can read own team memberships"
on public.user_team_memberships;
create policy "users can read own team memberships"
on public.user_team_memberships for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.flowmate_current_user_has_all_team_access())
);

revoke all privileges on public.teams
from public, anon, authenticated;
revoke all privileges on public.user_team_memberships
from public, anon, authenticated;
grant select on public.teams to authenticated;
grant select on public.user_team_memberships to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: work items
-- ---------------------------------------------------------------------------

alter table public.work_items enable row level security;

drop policy if exists "active users can read work items"
on public.work_items;
drop policy if exists "participants can update work items"
on public.work_items;
drop policy if exists "active users can insert work items"
on public.work_items;

drop policy if exists "team members can read work items"
on public.work_items;
drop policy if exists "team members can insert own work items"
on public.work_items;
drop policy if exists "team participants can update work items"
on public.work_items;
drop policy if exists "team participants can delete work items"
on public.work_items;

create policy "team members can read work items"
on public.work_items for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(id))
);

create policy "team members can insert own work items"
on public.work_items for insert
to authenticated
with check (
  (select public.flowmate_current_user_can_access_team(owning_team_code))
  and (
    requester_user_id = (select auth.uid())
    or (select public.flowmate_current_user_has_all_team_access())
  )
);

create policy "team participants can update work items"
on public.work_items for update
to authenticated
using (
  (select public.flowmate_current_user_can_mutate_work_item(id))
)
with check (
  (select public.flowmate_current_user_can_access_team(owning_team_code))
  and (
    (select public.flowmate_current_user_has_all_team_access())
    or (select public.flowmate_current_user_can_mutate_work_item(id))
  )
);

create policy "team participants can delete work items"
on public.work_items for delete
to authenticated
using (
  (select public.flowmate_current_user_can_mutate_work_item(id))
);

-- ---------------------------------------------------------------------------
-- RLS: child records
-- ---------------------------------------------------------------------------

alter table public.creative_request_details enable row level security;
alter table public.assignment_runs enable row level security;
alter table public.work_item_events enable row level security;
alter table public.comments enable row level security;
alter table public.checklist_items enable row level security;
alter table public.work_item_links enable row level security;
alter table public.work_item_watchers enable row level security;
alter table public.work_item_ai_tags enable row level security;
alter table public.flowmate_capacity_allocations enable row level security;

drop policy if exists "active users can read creative details"
on public.creative_request_details;
drop policy if exists "participants can mutate creative details"
on public.creative_request_details;
drop policy if exists "team members can read creative details"
on public.creative_request_details;
drop policy if exists "team participants can mutate creative details"
on public.creative_request_details;

create policy "team members can read creative details"
on public.creative_request_details for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

create policy "team participants can mutate creative details"
on public.creative_request_details for all
to authenticated
using (
  (select public.flowmate_current_user_can_mutate_work_item(work_item_id))
)
with check (
  (select public.flowmate_current_user_can_mutate_work_item(work_item_id))
);

drop policy if exists "active users can read assignment runs"
on public.assignment_runs;
drop policy if exists "team members can read assignment runs"
on public.assignment_runs;
create policy "team members can read assignment runs"
on public.assignment_runs for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "active users can read events"
on public.work_item_events;
drop policy if exists "team members can read events"
on public.work_item_events;
create policy "team members can read events"
on public.work_item_events for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "participants can read comments"
on public.comments;
drop policy if exists "active users can read comments"
on public.comments;
drop policy if exists "active users can insert own comments"
on public.comments;
drop policy if exists "authors can update comments"
on public.comments;
drop policy if exists "team members can read comments"
on public.comments;
drop policy if exists "team members can insert own comments"
on public.comments;
drop policy if exists "team authors can update comments"
on public.comments;

create policy "team members can read comments"
on public.comments for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

create policy "team members can insert own comments"
on public.comments for insert
to authenticated
with check (
  author_user_id = (select auth.uid())
  and (select public.flowmate_current_user_can_access_work_item(work_item_id))
);

create policy "team authors can update comments"
on public.comments for update
to authenticated
using (
  author_user_id = (select auth.uid())
  and (select public.flowmate_current_user_can_access_work_item(work_item_id))
)
with check (
  author_user_id = (select auth.uid())
  and (select public.flowmate_current_user_can_access_work_item(work_item_id))
);

drop policy if exists "active users can read checklist"
on public.checklist_items;
drop policy if exists "participants can mutate checklist"
on public.checklist_items;
drop policy if exists "team members can read checklist"
on public.checklist_items;
drop policy if exists "team participants can mutate checklist"
on public.checklist_items;

create policy "team members can read checklist"
on public.checklist_items for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

create policy "team participants can mutate checklist"
on public.checklist_items for all
to authenticated
using (
  (select public.flowmate_current_user_can_mutate_work_item(work_item_id))
)
with check (
  (select public.flowmate_current_user_can_mutate_work_item(work_item_id))
);

drop policy if exists "work item participants can read links"
on public.work_item_links;
drop policy if exists "team members can read links"
on public.work_item_links;
create policy "team members can read links"
on public.work_item_links for select
to authenticated
using (
  deleted_at is null
  and (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "work item participants can read watchers"
on public.work_item_watchers;
drop policy if exists "team members can read watchers"
on public.work_item_watchers;
create policy "team members can read watchers"
on public.work_item_watchers for select
to authenticated
using (
  removed_at is null
  and (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "work item participants can read ai tags"
on public.work_item_ai_tags;
drop policy if exists "team members can read ai tags"
on public.work_item_ai_tags;
create policy "team members can read ai tags"
on public.work_item_ai_tags for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read capacity allocations"
on public.flowmate_capacity_allocations;
create policy "team members can read capacity allocations"
on public.flowmate_capacity_allocations for select
to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

-- Direct writes remain RPC-only. RLS and triggers provide defense in depth.
revoke all privileges on public.work_items from public, anon;
revoke all privileges on public.creative_request_details from public, anon;
revoke all privileges on public.assignment_runs from public, anon;
revoke all privileges on public.work_item_events from public, anon;
revoke all privileges on public.comments from public, anon;
revoke all privileges on public.checklist_items from public, anon;
revoke all privileges on public.work_item_links from public, anon;
revoke all privileges on public.work_item_watchers from public, anon;
revoke all privileges on public.work_item_ai_tags from public, anon;
revoke all privileges on public.flowmate_capacity_allocations from public, anon;

revoke insert, update, delete on public.work_items from authenticated;
revoke insert, update, delete on public.creative_request_details from authenticated;
revoke insert, update, delete on public.assignment_runs from authenticated;
revoke insert, update, delete on public.work_item_events from authenticated;
revoke insert, update, delete on public.comments from authenticated;
revoke insert, update, delete on public.checklist_items from authenticated;
revoke insert, update, delete on public.work_item_links from authenticated;
revoke insert, update, delete on public.work_item_watchers from authenticated;
revoke insert, update, delete on public.work_item_ai_tags from authenticated;
revoke insert, update, delete on public.flowmate_capacity_allocations from authenticated;

grant select on public.work_items to authenticated;
grant select on public.creative_request_details to authenticated;
grant select on public.assignment_runs to authenticated;
grant select on public.work_item_events to authenticated;
grant select on public.comments to authenticated;
grant select on public.checklist_items to authenticated;
grant select on public.work_item_links to authenticated;
grant select on public.work_item_watchers to authenticated;
grant select on public.work_item_ai_tags to authenticated;
grant select on public.flowmate_capacity_allocations to authenticated;

commit;

select pg_notify('pgrst', 'reload schema');
