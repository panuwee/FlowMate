-- Read-only verification for ot_requester_access_backfill.sql.
-- Run after the backfill in the same Supabase environment.

with eligible as (
  select
    u.id as user_id,
    pg_catalog.lower(pg_catalog.btrim(u.email)) as email,
    pg_catalog.btrim(u.display_name) as display_name,
    membership.team_code
  from public.users u
  join public.user_team_memberships membership
    on membership.user_id = u.id
   and membership.is_primary
   and membership.team_code in ('gdve', 'ops', 'mkt', 'esport')
  where u.is_active = true
    and pg_catalog.lower(pg_catalog.btrim(u.email)) ~ '^[^@[:space:]]+@garena[.]com$'
)
select
  'OT requester backfill coverage' as check_name,
  count(*) as eligible_users,
  count(*) filter (where access.id is null) as missing_access_rows,
  count(*) filter (where access.status = 'active') as active_access_rows,
  count(*) filter (where access.status = 'deactivated') as preserved_deactivated_rows
from eligible
left join public.ot_requester_access access
  on access.email = eligible.email;

-- Active users missing an OT requester access row: expected 0 rows after the backfill.
with eligible as (
  select
    pg_catalog.lower(pg_catalog.btrim(u.email)) as email,
    pg_catalog.btrim(u.display_name) as display_name,
    membership.team_code
  from public.users u
  join public.user_team_memberships membership
    on membership.user_id = u.id
   and membership.is_primary
   and membership.team_code in ('gdve', 'ops', 'mkt', 'esport')
  where u.is_active = true
    and pg_catalog.lower(pg_catalog.btrim(u.email)) ~ '^[^@[:space:]]+@garena[.]com$'
)
select
  'Active users missing an OT requester access row' as check_name,
  eligible.email,
  eligible.display_name,
  eligible.team_code
from eligible
left join public.ot_requester_access access
  on access.email = eligible.email
where access.id is null
order by eligible.email;

-- These people are intentionally not backfilled because no supported primary Function is known.
-- Owner can add or configure them later through OT Request > Access.
select
  'Active users without a supported primary Function (Owner action required)' as check_name,
  pg_catalog.lower(pg_catalog.btrim(u.email)) as email,
  pg_catalog.btrim(u.display_name) as display_name
from public.users u
where u.is_active = true
  and pg_catalog.lower(pg_catalog.btrim(u.email)) ~ '^[^@[:space:]]+@garena[.]com$'
  and not exists (
    select 1
    from public.user_team_memberships membership
    where membership.user_id = u.id
      and membership.is_primary
      and membership.team_code in ('gdve', 'ops', 'mkt', 'esport')
  )
order by email;
