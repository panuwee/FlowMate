-- FlowMate Workflow Management MVP: team workspace verification
-- ---------------------------------------------------------------------------
-- Run after supabase/workflow_team_workspaces.sql.
--
-- This file does not persist application-data changes. The two impersonation
-- checks use transactions and ROLLBACK. Run from the Supabase SQL Editor as a
-- database owner so SET LOCAL ROLE authenticated is permitted.

-- ---------------------------------------------------------------------------
-- 1. Structure and backfill report
-- ---------------------------------------------------------------------------

select
  team.code,
  team.display_name,
  team.is_active
from public.teams team
order by team.code;

select
  u.email,
  u.display_name,
  u.role,
  u.can_access_all_teams,
  membership.team_code,
  membership.is_primary
from public.users u
left join public.user_team_memberships membership
  on membership.user_id = u.id
order by u.email, membership.is_primary desc, membership.team_code;

select
  coalesce(nullif(trim(wi.requester_team), ''), '<NULL>') as requester_team,
  wi.owning_team_code,
  count(*) as work_item_count
from public.work_items wi
group by
  coalesce(nullif(trim(wi.requester_team), ''), '<NULL>'),
  wi.owning_team_code
order by requester_team, wi.owning_team_code nulls first;

-- Privileged-only migration quarantine. Every row returned here needs an
-- explicit product-owner decision before it is assigned to a workspace.
select
  wi.id,
  wi.display_id,
  wi.title,
  wi.requester_team,
  wi.requester_user_id,
  requester.email as requester_email,
  wi.created_at
from public.work_items wi
left join public.users requester
  on requester.id = wi.requester_user_id
where wi.owning_team_code is null
order by wi.created_at, wi.display_id;

-- Explicit backfill template. Copy only reviewed UUIDs and choose one valid
-- canonical team code. Do not bulk-map FCO or NULL values without review.
--
-- begin;
--
-- update public.work_items
-- set owning_team_code = 'ops' -- gdve | ops | mkt | esport
-- where id in (
--   '00000000-0000-0000-0000-000000000000'::uuid
-- );
--
-- commit;
--
-- Re-run this verification file after every explicit quarantine backfill.

-- ---------------------------------------------------------------------------
-- 2. Automated migration assertions
-- ---------------------------------------------------------------------------

do $verify_migration$
declare
  v_missing_required_teams integer;
  v_known_unmapped_rows integer;
  v_known_mismatched_rows integer;
  v_unprivileged_quarantine_access integer;
  v_missing_privileged_flags integer;
  v_standard_user_id uuid;
  v_standard_team text;
  v_other_team text;
  v_privileged_user_id uuid;
  v_rls_missing integer;
  v_trigger_missing integer;
  v_function_security_issues integer;
  v_policy_issues integer;
  v_direct_dml_issues integer;
begin
  select count(*)
  into v_missing_required_teams
  from (
    values ('gdve'), ('ops'), ('mkt'), ('esport')
  ) required(code)
  left join public.teams team
    on team.code = required.code
   and team.is_active = true
  where team.code is null;

  if v_missing_required_teams <> 0 then
    raise exception
      'Verification failed: % required team rows are missing or inactive',
      v_missing_required_teams;
  end if;

  select count(*)
  into v_known_unmapped_rows
  from public.work_items wi
  where public.flowmate_normalize_team_code(wi.requester_team) is not null
    and wi.owning_team_code is null;

  if v_known_unmapped_rows <> 0 then
    raise exception
      'Verification failed: % known requester_team rows were not backfilled',
      v_known_unmapped_rows;
  end if;

  select count(*)
  into v_known_mismatched_rows
  from public.work_items wi
  where public.flowmate_normalize_team_code(wi.requester_team) is not null
    and wi.owning_team_code is distinct from
      public.flowmate_normalize_team_code(wi.requester_team);

  if v_known_mismatched_rows <> 0 then
    raise exception
      'Verification failed: % known requester_team rows map to a different owning team',
      v_known_mismatched_rows;
  end if;

  select count(*)
  into v_unprivileged_quarantine_access
  from public.users u
  where u.is_active = true
    and coalesce(u.can_access_all_teams, false) = false
    and coalesce(u.role, 'member') <> 'admin'
    and public.flowmate_user_can_access_team(u.id, null);

  if v_unprivileged_quarantine_access <> 0 then
    raise exception
      'Verification failed: % standard users can access migration quarantine',
      v_unprivileged_quarantine_access;
  end if;

  select count(*)
  into v_missing_privileged_flags
  from public.users u
  where (
      u.role = 'admin'
      or lower(u.email) in (
        'sasin.cha@garena.com',
        'weerayut@garena.com',
        'panuwee.w@garena.com'
      )
    )
    and u.can_access_all_teams is distinct from true;

  if v_missing_privileged_flags <> 0 then
    raise exception
      'Verification failed: % existing admins or named privileged users lack all-team access',
      v_missing_privileged_flags;
  end if;

  select u.id, membership.team_code
  into v_standard_user_id, v_standard_team
  from public.users u
  join public.user_team_memberships membership
    on membership.user_id = u.id
  where u.is_active = true
    and coalesce(u.role, 'member') <> 'admin'
    and coalesce(u.can_access_all_teams, false) = false
  order by membership.is_primary desc, u.email, membership.team_code
  limit 1;

  if v_standard_user_id is null then
    raise exception
      'Verification fixture missing: no active standard user with a team membership';
  end if;

  select team.code
  into v_other_team
  from public.teams team
  where team.is_active = true
    and team.code <> v_standard_team
  order by team.code
  limit 1;

  if not public.flowmate_user_can_access_team(
    v_standard_user_id,
    v_standard_team
  ) then
    raise exception
      'Verification failed: standard user cannot access own team %',
      v_standard_team;
  end if;

  if public.flowmate_user_can_access_team(
    v_standard_user_id,
    v_other_team
  ) then
    raise exception
      'Verification failed: standard user can access other team %',
      v_other_team;
  end if;

  select u.id
  into v_privileged_user_id
  from public.users u
  where u.is_active = true
    and (
      u.role = 'admin'
      or u.can_access_all_teams = true
    )
  order by
    case lower(u.email)
      when 'panuwee.w@garena.com' then 0
      when 'sasin.cha@garena.com' then 1
      when 'weerayut@garena.com' then 2
      else 3
    end,
    u.email
  limit 1;

  if v_privileged_user_id is null then
    raise exception
      'Verification fixture missing: no active admin/all-team user';
  end if;

  if exists (
    select 1
    from public.teams team
    where team.is_active = true
      and not public.flowmate_user_can_access_team(
        v_privileged_user_id,
        team.code
      )
  ) then
    raise exception
      'Verification failed: privileged user cannot access every active team';
  end if;

  if not public.flowmate_user_can_access_team(
    v_privileged_user_id,
    null
  ) then
    raise exception
      'Verification failed: privileged user cannot access migration quarantine';
  end if;

  select count(*)
  into v_rls_missing
  from (
    values
      ('teams'),
      ('user_team_memberships'),
      ('work_items'),
      ('creative_request_details'),
      ('assignment_runs'),
      ('work_item_events'),
      ('comments'),
      ('checklist_items'),
      ('work_item_links'),
      ('work_item_watchers'),
      ('work_item_ai_tags'),
      ('flowmate_capacity_allocations')
  ) required(table_name)
  left join pg_catalog.pg_class table_class
    on table_class.oid =
      pg_catalog.to_regclass('public.' || required.table_name)
  where table_class.oid is null
     or table_class.relrowsecurity is distinct from true;

  if v_rls_missing <> 0 then
    raise exception
      'Verification failed: % required tables are missing RLS',
      v_rls_missing;
  end if;

  select count(*)
  into v_trigger_missing
  from (
    values
      ('work_items', 'flowmate_work_items_team_guard'),
      ('creative_request_details', 'flowmate_creative_details_team_guard'),
      ('assignment_runs', 'flowmate_assignment_runs_team_guard'),
      ('work_item_events', 'flowmate_work_item_events_team_guard'),
      ('comments', 'flowmate_comments_team_guard'),
      ('checklist_items', 'flowmate_checklist_team_guard'),
      ('work_item_links', 'flowmate_links_team_guard'),
      ('work_item_watchers', 'flowmate_watchers_team_guard'),
      ('work_item_ai_tags', 'flowmate_ai_tags_team_guard'),
      ('flowmate_capacity_allocations', 'flowmate_capacity_allocations_team_guard')
  ) required(table_name, trigger_name)
  left join pg_catalog.pg_trigger trigger_row
    on trigger_row.tgrelid =
      pg_catalog.to_regclass('public.' || required.table_name)
   and trigger_row.tgname = required.trigger_name
   and trigger_row.tgisinternal = false
  where trigger_row.oid is null;

  if v_trigger_missing <> 0 then
    raise exception
      'Verification failed: % required team guard triggers are missing',
      v_trigger_missing;
  end if;

  select count(*)
  into v_function_security_issues
  from (
    values
      ('flowmate_normalize_team_code', false),
      ('flowmate_user_has_all_team_access', true),
      ('flowmate_user_can_access_team', true),
      ('flowmate_user_is_team_member', true),
      ('flowmate_current_user_has_all_team_access', true),
      ('flowmate_current_user_can_access_team', true),
      ('flowmate_user_is_work_item_participant', true),
      ('flowmate_user_can_access_work_item', true),
      ('flowmate_user_can_read_work_item', true),
      ('flowmate_current_user_can_access_work_item', true),
      ('flowmate_current_user_can_read_work_item', true),
      ('flowmate_current_user_can_mutate_work_item', true),
      ('flowmate_is_trusted_database_context', false),
      ('flowmate_guard_work_item_team', true),
      ('flowmate_guard_child_work_item_team', true)
  ) required(function_name, should_be_security_definer)
  left join (
    select function_source.*
    from pg_catalog.pg_proc function_source
    join pg_catalog.pg_namespace namespace_source
      on namespace_source.oid = function_source.pronamespace
    where namespace_source.nspname = 'public'
  ) function_row
    on function_row.proname = required.function_name
  where function_row.oid is null
     or function_row.prosecdef is distinct from
       required.should_be_security_definer
     or not exists (
       select 1
       from unnest(
         coalesce(function_row.proconfig, array[]::text[])
       ) config(value)
       where config.value like 'search_path=%'
     );

  if v_function_security_issues <> 0 then
    raise exception
      'Verification failed: % helper/trigger functions have an unsafe SECURITY DEFINER or search_path configuration',
      v_function_security_issues;
  end if;

  select count(*)
  into v_policy_issues
  from (
    values
      ('teams', 'active users can read teams'),
      ('user_team_memberships', 'users can read own team memberships'),
      ('work_items', 'team members can read work items'),
      ('work_items', 'team members can insert own work items'),
      ('work_items', 'team participants can update work items'),
      ('work_items', 'team participants can delete work items'),
      ('creative_request_details', 'team members can read creative details'),
      ('creative_request_details', 'team participants can mutate creative details'),
      ('assignment_runs', 'team members can read assignment runs'),
      ('work_item_events', 'team members can read events'),
      ('comments', 'team members can read comments'),
      ('comments', 'team members can insert own comments'),
      ('comments', 'team authors can update comments'),
      ('checklist_items', 'team members can read checklist'),
      ('checklist_items', 'team participants can mutate checklist'),
      ('work_item_links', 'team members can read links'),
      ('work_item_watchers', 'team members can read watchers'),
      ('work_item_ai_tags', 'team members can read ai tags'),
      ('flowmate_capacity_allocations', 'team members can read capacity allocations')
  ) required(table_name, policy_name)
  left join pg_catalog.pg_policies policy
    on policy.schemaname = 'public'
   and policy.tablename = required.table_name
   and policy.policyname = required.policy_name
  where policy.policyname is null;

  if v_policy_issues <> 0 then
    raise exception
      'Verification failed: % required team policies are missing',
      v_policy_issues;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policies policy
    where policy.schemaname = 'public'
      and policy.policyname in (
        'active users can read work items',
        'participants can update work items',
        'active users can insert work items',
        'active users can read creative details',
        'participants can mutate creative details',
        'active users can read assignment runs',
        'active users can read events',
        'participants can read comments',
        'active users can read comments',
        'active users can insert own comments',
        'authors can update comments',
        'active users can read checklist',
        'participants can mutate checklist',
        'work item participants can read links',
        'work item participants can read watchers',
        'work item participants can read ai tags'
      )
      and policy.tablename in (
        'work_items',
        'creative_request_details',
        'assignment_runs',
        'work_item_events',
        'comments',
        'checklist_items',
        'work_item_links',
        'work_item_watchers',
        'work_item_ai_tags'
      )
  ) then
    raise exception
      'Verification failed: one or more shared-board policies still exist';
  end if;

  select count(*)
  into v_direct_dml_issues
  from (
    values
      ('teams'),
      ('user_team_memberships'),
      ('work_items'),
      ('creative_request_details'),
      ('assignment_runs'),
      ('work_item_events'),
      ('comments'),
      ('checklist_items'),
      ('work_item_links'),
      ('work_item_watchers'),
      ('work_item_ai_tags'),
      ('flowmate_capacity_allocations')
  ) target(table_name)
  where has_table_privilege(
      'authenticated',
      'public.' || target.table_name,
      'INSERT'
    )
     or has_table_privilege(
      'authenticated',
      'public.' || target.table_name,
      'UPDATE'
    )
     or has_table_privilege(
      'authenticated',
      'public.' || target.table_name,
      'DELETE'
    );

  if v_direct_dml_issues <> 0 then
    raise exception
      'Verification failed: authenticated retains direct DML on % protected tables',
      v_direct_dml_issues;
  end if;

  raise notice
    'Migration assertions passed. Standard fixture team: %, privileged fixture: %',
    v_standard_team,
    v_privileged_user_id;
end;
$verify_migration$;

-- ---------------------------------------------------------------------------
-- 3. RLS policy and privilege inventory
-- ---------------------------------------------------------------------------

select
  policy.schemaname,
  policy.tablename,
  policy.policyname,
  policy.cmd,
  policy.roles,
  policy.qual,
  policy.with_check
from pg_catalog.pg_policies policy
where policy.schemaname = 'public'
  and policy.tablename in (
    'teams',
    'user_team_memberships',
    'work_items',
    'creative_request_details',
    'assignment_runs',
    'work_item_events',
    'comments',
    'checklist_items',
    'work_item_links',
    'work_item_watchers',
    'work_item_ai_tags',
    'flowmate_capacity_allocations'
  )
order by policy.tablename, policy.policyname;

select
  table_name,
  has_table_privilege('authenticated', 'public.' || table_name, 'SELECT')
    as authenticated_can_select,
  has_table_privilege('authenticated', 'public.' || table_name, 'INSERT')
    as authenticated_can_insert_directly,
  has_table_privilege('authenticated', 'public.' || table_name, 'UPDATE')
    as authenticated_can_update_directly,
  has_table_privilege('authenticated', 'public.' || table_name, 'DELETE')
    as authenticated_can_delete_directly
from (
  values
    ('teams'),
    ('user_team_memberships'),
    ('work_items'),
    ('creative_request_details'),
    ('assignment_runs'),
    ('work_item_events'),
    ('comments'),
    ('checklist_items'),
    ('work_item_links'),
    ('work_item_watchers'),
    ('work_item_ai_tags'),
    ('flowmate_capacity_allocations')
) target(table_name)
order by table_name;

-- Expected: SELECT = true. Direct INSERT/UPDATE/DELETE = false.
-- Application writes continue through guarded SECURITY DEFINER RPCs.

-- ---------------------------------------------------------------------------
-- 4. Function security/search_path and recursion review
-- ---------------------------------------------------------------------------

select
  function_row.proname,
  pg_catalog.pg_get_function_identity_arguments(function_row.oid)
    as arguments,
  function_row.prosecdef as security_definer,
  function_row.proconfig,
  has_function_privilege(
    'authenticated',
    function_row.oid,
    'EXECUTE'
  ) as authenticated_can_execute
from pg_catalog.pg_proc function_row
join pg_catalog.pg_namespace namespace_row
  on namespace_row.oid = function_row.pronamespace
where namespace_row.nspname = 'public'
  and function_row.proname in (
    'flowmate_normalize_team_code',
    'flowmate_user_has_all_team_access',
    'flowmate_user_can_access_team',
    'flowmate_user_is_team_member',
    'flowmate_current_user_has_all_team_access',
    'flowmate_current_user_can_access_team',
    'flowmate_user_is_work_item_participant',
    'flowmate_user_can_access_work_item',
    'flowmate_user_can_read_work_item',
    'flowmate_current_user_can_access_work_item',
    'flowmate_current_user_can_read_work_item',
    'flowmate_current_user_can_mutate_work_item',
    'flowmate_is_trusted_database_context',
    'flowmate_guard_work_item_team',
    'flowmate_guard_child_work_item_team'
  )
order by function_row.proname, arguments;

-- Expected:
-- - Every function reports a fixed empty search_path in proconfig.
-- - Internal user-id helpers and trigger functions are SECURITY DEFINER and
--   are not executable by authenticated.
-- - Only current-user wrapper helpers are executable by authenticated.
-- - work_items policies call team helpers that read users/memberships only.
-- - child policies call a SECURITY DEFINER helper that reads work_items, so
--   child-table RLS never queries its own table and cannot recurse.

-- ---------------------------------------------------------------------------
-- 5. Actual RLS test: one standard GD/VE user
-- ---------------------------------------------------------------------------

begin;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  (
    select u.id::text
    from public.users u
    join public.user_team_memberships membership
      on membership.user_id = u.id
    where u.is_active = true
      and coalesce(u.role, 'member') <> 'admin'
      and coalesce(u.can_access_all_teams, false) = false
      and membership.team_code = 'gdve'
    order by membership.is_primary desc, u.email, membership.team_code
    limit 1
  ),
  true
);

select pg_catalog.set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub',
    pg_catalog.current_setting('request.jwt.claim.sub', true),
    'role',
    'authenticated'
  )::text,
  true
);

set local role authenticated;

select
  auth.uid() as standard_gdve_user_id,
  array_agg(distinct wi.owning_team_code order by wi.owning_team_code)
    filter (where wi.owning_team_code is not null)
    as visible_team_codes,
  count(*) filter (
    where wi.work_type = 'creative_request'
      and not exists (
        select 1
        from public.user_team_memberships membership
        where membership.user_id = auth.uid()
          and membership.team_code = wi.owning_team_code
      )
  ) as visible_cross_team_creative_requests,
  count(*) filter (
    where wi.work_type <> 'creative_request'
      and not exists (
        select 1
        from public.user_team_memberships membership
        where membership.user_id = auth.uid()
          and membership.team_code = wi.owning_team_code
      )
  ) as forbidden_cross_team_non_creative_items,
  count(*) filter (where wi.owning_team_code is null)
    as visible_quarantine_rows
from public.work_items wi;

select count(*) as forbidden_visible_rows
from public.work_items wi
where wi.owning_team_code is null
   or (
     wi.work_type <> 'creative_request'
     and not exists (
       select 1
       from public.user_team_memberships membership
       where membership.user_id = auth.uid()
         and membership.team_code = wi.owning_team_code
     )
   );

-- Expected:
-- - visible_cross_team_creative_requests includes every mapped Creative
--   Request owned by another team (when cross-team fixtures exist).
-- - forbidden_cross_team_non_creative_items = 0.
-- - visible_quarantine_rows = 0.
-- - forbidden_visible_rows = 0.

rollback;

-- ---------------------------------------------------------------------------
-- 6. Actual RLS test: one privileged user
-- ---------------------------------------------------------------------------

begin;

select pg_catalog.set_config(
  'request.jwt.claim.sub',
  (
    select u.id::text
    from public.users u
    where u.is_active = true
      and (
        u.role = 'admin'
        or u.can_access_all_teams = true
      )
    order by
      case lower(u.email)
        when 'panuwee.w@garena.com' then 0
        when 'sasin.cha@garena.com' then 1
        when 'weerayut@garena.com' then 2
        else 3
      end,
      u.email
    limit 1
  ),
  true
);

select pg_catalog.set_config(
  'request.jwt.claim.role',
  'authenticated',
  true
);

select pg_catalog.set_config(
  'request.jwt.claims',
  pg_catalog.jsonb_build_object(
    'sub',
    pg_catalog.current_setting('request.jwt.claim.sub', true),
    'role',
    'authenticated'
  )::text,
  true
);

set local role authenticated;

select
  auth.uid() as privileged_user_id,
  array_agg(distinct wi.owning_team_code order by wi.owning_team_code)
    filter (where wi.owning_team_code is not null)
    as visible_team_codes,
  count(*) filter (where wi.owning_team_code is null)
    as visible_quarantine_rows
from public.work_items wi;

-- Expected:
-- - visible_team_codes may include gdve, ops, mkt, and esport when data exists.
-- - visible_quarantine_rows matches the privileged quarantine report.

rollback;

-- ---------------------------------------------------------------------------
-- 7. Optional negative-write check (run separately; an error is expected)
-- ---------------------------------------------------------------------------
-- Direct authenticated DML is revoked, and application writes must use guarded
-- RPCs. To test the work-item trigger through a legacy create RPC, sign in as a
-- standard user and submit p_requester_team for a team outside their
-- memberships. Expected error:
--
--   You cannot assign or modify work in team workspace <team>
--
-- Submit an unmapped value such as FCO for a new row. Expected error:
--
--   A valid owning team is required
--
-- Historical FCO/NULL records are not changed by those checks; they remain in
-- the privileged-only migration quarantine until explicitly backfilled.
