-- One-time baseline sync for OT Requester access.
-- Run this once in the Supabase SQL Editor for the Test environment,
-- after supabase/ot_request.sql has been applied.
--
-- Safe behavior:
--   * Adds only active FlowMate users whose primary team is an OT Function.
--   * Preserves every existing requester-access row, including rows deactivated by Owner.
--   * Does not infer a Function for users without a supported primary team.

begin;

do $block$
begin
  if pg_catalog.to_regclass('public.users') is null
     or pg_catalog.to_regclass('public.user_team_memberships') is null
     or pg_catalog.to_regclass('public.ot_requester_access') is null
     or pg_catalog.to_regclass('public.ot_requester_access_audit') is null then
    raise exception
      'OT requester baseline requires users, user_team_memberships, ot_requester_access, and ot_requester_access_audit';
  end if;
end
$block$;

with inserted as (
  insert into public.ot_requester_access (
    user_id,
    email,
    first_name,
    last_name,
    display_name,
    function_code,
    status,
    note,
    created_by_user_id,
    updated_by_user_id
  )
  select
    u.id,
    pg_catalog.lower(pg_catalog.btrim(u.email)),
    nullif(pg_catalog.split_part(pg_catalog.btrim(u.display_name), ' ', 1), ''),
    nullif(pg_catalog.btrim(pg_catalog.regexp_replace(u.display_name, '^\\S+\\s*', '')), ''),
    pg_catalog.btrim(u.display_name),
    membership.team_code,
    'active',
    'Baseline OT requester access from primary FlowMate team',
    u.id,
    u.id
  from public.users u
  join public.user_team_memberships membership
    on membership.user_id = u.id
   and membership.is_primary
   and membership.team_code in ('gdve', 'ops', 'mkt', 'esport')
  where u.is_active = true
    and pg_catalog.lower(pg_catalog.btrim(u.email)) ~ '^[^@[:space:]]+@garena[.]com$'
    and pg_catalog.length(pg_catalog.btrim(u.display_name)) > 0
  on conflict (email) do nothing
  returning *
)
insert into public.ot_requester_access_audit (
  requester_access_id,
  actor_user_id,
  action,
  old_values,
  new_values,
  reason,
  idempotency_key
)
select
  inserted.id,
  inserted.user_id,
  'baseline_sync_requester_access',
  '{}'::jsonb,
  pg_catalog.jsonb_build_object('requesterAccess', pg_catalog.to_jsonb(inserted)),
  'Initial OT requester baseline from primary FlowMate team',
  gen_random_uuid()
from inserted;

commit;
