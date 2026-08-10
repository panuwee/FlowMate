-- Workgrid OT Request MVP read-only verification.
-- Run after supabase/ot_request.sql. Every statement below is metadata or data
-- inspection only; this file intentionally performs no DDL or DML.

select
  'OT tables (Expected = 6)' as check_name,
  pg_catalog.count(*) as actual_count,
  pg_catalog.array_agg(c.relname order by c.relname) as found_tables
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'ot_system_roles', 'ot_approvers', 'ot_event_plans',
    'ot_requests', 'ot_request_audit', 'ot_export_batches'
  );

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'ot_system_roles', 'ot_approvers', 'ot_event_plans',
    'ot_requests', 'ot_request_audit', 'ot_export_batches'
  )
order by c.relname;

select
  'OT request consent and variance fields (Expected = 2)' as check_name,
  pg_catalog.count(*) as actual_count,
  pg_catalog.array_agg(c.column_name order by c.column_name) as found_columns
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'ot_requests'
  and c.column_name in ('consent_statement_version', 'actual_variance_reason');

select
  'Legacy 3-argument consent RPC (Expected = 0)' as check_name,
  pg_catalog.count(*) as actual_count
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_record_consent'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, boolean, uuid';

select
  'Versioned 4-argument consent RPC (Expected = 1)' as check_name,
  pg_catalog.count(*) as actual_count
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_record_consent'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, boolean, text, uuid';

select
  'Actual amendment RPC contract (Expected = valid)' as check_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  pg_catalog.coalesce(pg_catalog.array_position(p.proconfig, 'search_path=""'), 0) > 0 as fixed_search_path,
  (
    pg_catalog.position('public.ot_current_user_is_owner()' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and pg_catalog.position('public.ot_current_user_is_hr_admin()' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and pg_catalog.position('public.ot_user_is_approved_approver_identity(v_actor_id)' in pg_catalog.pg_get_functiondef(p.oid)) > 0
  ) as approved_elevated_identity_guard,
  pg_catalog.position('''request_actual_amendment''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_audit_action
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_request_actual_amendment'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text, uuid';

select
  'Actual amendment RPC execute grants (Expected authenticated only)' as check_name,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.ot_request_actual_amendment(uuid, text, uuid)',
    'EXECUTE'
  ) as authenticated_execute,
  not exists (
    select 1
    from information_schema.routine_privileges rp
    where rp.specific_schema = 'public'
      and rp.routine_name = 'ot_request_actual_amendment'
      and rp.privilege_type = 'EXECUTE'
      and rp.grantee in ('anon', 'PUBLIC')
  ) as public_and_anon_revoked;

select
  'Canonical OT counted-week helper (Expected = 1)' as check_name,
  'public.ot_counted_week_minutes_unchecked(uuid, date, uuid)' as expected_signature,
  pg_catalog.count(*) as actual_count
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_counted_week_minutes_unchecked'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, date, uuid'
  and pg_catalog.pg_get_function_result(p.oid) = 'integer';

select
  'Personal OT dashboard countedMinutes key (Expected = true)' as check_name,
  pg_catalog.position('''countedMinutes''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_counted_minutes
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_get_my_dashboard'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'date';

select
  'Authenticated projected-total execute access (Expected = false)' as check_name,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.ot_projected_week_minutes(uuid, date, uuid)',
    'EXECUTE'
  ) as has_execute;

select
  'Authenticated unchecked counted-total execute access (Expected = false)' as check_name,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.ot_counted_week_minutes_unchecked(uuid, date, uuid)',
    'EXECUTE'
  ) as has_execute;

select
  'OT RPC signatures' as check_name,
  p.proname as function_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as function_settings
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'ot_current_user_is_owner', 'ot_current_user_is_hr_admin',
    'ot_current_user_is_eligible_approver', 'ot_current_user_can_read_request',
    'ot_calculate_occurrence_minutes', 'ot_projected_week_minutes',
    'ot_counted_week_minutes_unchecked',
    'ot_get_access_context', 'ot_get_my_dashboard', 'ot_list_my_requests',
    'ot_get_manager_dashboard', 'ot_list_eligible_approvers',
    'ot_list_people_for_event', 'ot_create_request', 'ot_preview_event_plan',
    'ot_create_event_plan', 'ot_record_consent', 'ot_review_plan',
    'ot_submit_actual', 'ot_request_actual_amendment', 'ot_verify_actual', 'ot_list_compliance_queue',
    'ot_review_compliance', 'ot_list_request_audit', 'ot_list_hr_ready',
    'ot_mark_exported', 'ot_set_approver', 'ot_set_system_role'
  )
order by p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid);

select
  'Authenticated OT RPC execute grants' as check_name,
  routine_name,
  privilege_type,
  grantee
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name like 'ot\_%' escape '\'
  and grantee in ('authenticated', 'anon', 'PUBLIC')
order by routine_name, grantee;

select
  'HR-ready export RPC contract (Expected = SETOF jsonb with normalized emails)' as check_name,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  pg_catalog.position('''employee_email''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_employee_email,
  pg_catalog.position('''approver_email''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_approver_email
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_list_hr_ready'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'date';

select
  'OT table grants' as check_name,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in (
    'ot_system_roles', 'ot_approvers', 'ot_event_plans',
    'ot_requests', 'ot_request_audit', 'ot_export_batches'
  )
  and grantee in ('authenticated', 'anon', 'PUBLIC')
order by table_name, grantee, privilege_type;

select
  'OT request RLS policies' as check_name,
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename in (
    'ot_system_roles', 'ot_approvers', 'ot_event_plans',
    'ot_requests', 'ot_request_audit', 'ot_export_batches'
  )
order by tablename, policyname;

select
  'Expected OT Owner seed count = 1' as check_name,
  pg_catalog.count(*) as actual_count,
  pg_catalog.array_agg(u.email order by u.email) as matched_emails
from public.ot_system_roles r
join public.users u on u.id = r.user_id
where r.role_code = 'owner'
  and r.active = true
  and pg_catalog.lower(pg_catalog.btrim(u.email)) = 'panuwee.w@garena.com';

select
  'Expected active approver seed count = 3' as check_name,
  pg_catalog.count(*) as actual_count,
  pg_catalog.array_agg(u.email order by u.email) as matched_emails
from public.ot_approvers a
join public.users u on u.id = a.user_id
where a.active = true
  and pg_catalog.lower(pg_catalog.btrim(u.email)) in (
    'nithidol.k@garena.com', 'weerayut@garena.com', 'napol.a@garena.com'
  );

select
  'OT HR Admin assignment allowlist guard (Expected = true)' as check_name,
  pg_catalog.pg_get_functiondef(p.oid) ~
    'if[[:space:]]+p_role_code = ''hr_admin''[[:space:]]+and p_active = true[[:space:]]+and not public[.]ot_user_is_approved_approver_identity[(]p_user_id[)][[:space:]]+then[[:space:]]+raise exception ''HR Admin must be one of the three approved MVP identities'';[[:space:]]+end if;'
    as guard_matches_contract
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_set_system_role'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text, boolean, text, uuid';

select
  'Unauthorized active HR Admin assignments (Expected = 0)' as check_name,
  pg_catalog.count(*) as actual_count,
  pg_catalog.array_agg(
    pg_catalog.lower(pg_catalog.btrim(u.email))
    order by pg_catalog.lower(pg_catalog.btrim(u.email))
  ) as violating_emails
from public.ot_system_roles r
join public.users u on u.id = r.user_id
where r.role_code = 'hr_admin'
  and r.active = true
  and (
    u.is_active is distinct from true
    or pg_catalog.lower(pg_catalog.btrim(u.email)) not in (
      'nithidol.k@garena.com', 'weerayut@garena.com', 'napol.a@garena.com'
    )
  );

select
  'Missing approved OT identities (Expected = 0 after user provisioning)' as check_name,
  expected.email as missing_email
from (values
  ('panuwee.w@garena.com'),
  ('nithidol.k@garena.com'),
  ('weerayut@garena.com'),
  ('napol.a@garena.com')
) as expected(email)
where not exists (
  select 1 from public.users u
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = expected.email
)
order by expected.email;

select
  'Append-only audit direct mutation grants (Expected = 0)' as check_name,
  pg_catalog.count(*) as actual_count
from information_schema.role_table_grants g
where g.table_schema = 'public'
  and g.table_name = 'ot_request_audit'
  and g.grantee in ('authenticated', 'anon', 'PUBLIC')
  and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');

select
  'OT policies on non-OT Workgrid tables (Expected = 0)' as check_name,
  pg_catalog.count(*) as actual_count,
  pg_catalog.array_agg(p.tablename || ':' || p.policyname order by p.tablename, p.policyname) as violations
from pg_catalog.pg_policies p
where p.schemaname = 'public'
  and p.tablename not like 'ot\_%' escape '\'
  and (
    pg_catalog.lower(p.policyname) like '%ot %'
    or pg_catalog.lower(pg_catalog.coalesce(p.qual, '')) like '%ot\_%' escape '\'
    or pg_catalog.lower(pg_catalog.coalesce(p.with_check, '')) like '%ot\_%' escape '\'
  );

select
  'OT policy references on FlowMate, Marketing Plan, and Product Book tables (Expected = 0)' as check_name,
  pg_catalog.count(*) as actual_count,
  pg_catalog.array_agg(p.tablename || ':' || p.policyname order by p.tablename, p.policyname) as violations
from pg_catalog.pg_policies p
where p.schemaname = 'public'
  and p.tablename in (
    'work_items', 'creative_request_details', 'assignment_runs', 'work_item_events',
    'comments', 'checklist_items', 'marketing_plans', 'marketing_campaigns',
    'marketing_content_items', 'marketing_channel_placements',
    'product_book_patches', 'product_book_patch_revisions'
  )
  and (
    pg_catalog.lower(p.policyname) like '%ot %'
    or pg_catalog.lower(pg_catalog.coalesce(p.qual, '')) like '%ot\_%' escape '\'
    or pg_catalog.lower(pg_catalog.coalesce(p.with_check, '')) like '%ot\_%' escape '\'
  );
