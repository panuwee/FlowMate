-- Workgrid OT Request MVP read-only verification.
-- Run after supabase/ot_request.sql. Every statement below is metadata or data
-- inspection only; this file intentionally performs no DDL or DML.

select
  'OT tables (Expected = 10)' as check_name,
  pg_catalog.count(*) as actual_count,
  pg_catalog.array_agg(c.relname order by c.relname) as found_tables
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relname in (
    'ot_system_roles', 'ot_approvers', 'ot_requester_access', 'ot_requester_access_audit', 'ot_event_plans',
    'ot_requests', 'ot_request_audit', 'ot_export_batches',
    'ot_seatalk_notifications', 'ot_seatalk_pending_rejections'
  );

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as force_rls
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'ot_system_roles', 'ot_approvers', 'ot_requester_access', 'ot_requester_access_audit', 'ot_event_plans',
    'ot_requests', 'ot_request_audit', 'ot_export_batches',
    'ot_seatalk_notifications', 'ot_seatalk_pending_rejections'
  )
order by c.relname;

select
  'OT requester access storage contract (Expected = RLS enabled, browser access denied)' as check_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  not pg_catalog.has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE') as anon_access_denied,
  not pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE') as authenticated_access_denied
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('ot_requester_access', 'ot_requester_access_audit')
order by c.relname;

select
  'SeaTalk OT outbox table contract (Expected = RLS enabled, browser writes denied)' as check_name,
  c.relrowsecurity as rls_enabled,
  not pg_catalog.has_table_privilege('anon', 'public.ot_seatalk_notifications', 'INSERT, UPDATE, DELETE')
    as anon_writes_denied,
  not pg_catalog.has_table_privilege('authenticated', 'public.ot_seatalk_notifications', 'INSERT, UPDATE, DELETE')
    as authenticated_writes_denied
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'ot_seatalk_notifications';

select
  'SeaTalk OT review RPC contract (Expected service_role only)' as check_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  coalesce(pg_catalog.array_position(p.proconfig, 'search_path=""'), 0) > 0 as fixed_search_path,
  position('v_notification.status not in (''pending'', ''dispatching'', ''sent'', ''failed'')' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as actionable_notification_guard,
  position('p_sender_email' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as assigned_sender_guard,
  position('public.ot_apply_plan_review(' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as shared_review_transition,
  pg_catalog.has_function_privilege('service_role', 'public.ot_seatalk_apply_review(uuid, text, text, text, uuid)', 'EXECUTE')
    as service_role_execute,
  not pg_catalog.has_function_privilege('anon', 'public.ot_seatalk_apply_review(uuid, text, text, text, uuid)', 'EXECUTE')
    as anon_execute_denied,
  not pg_catalog.has_function_privilege('authenticated', 'public.ot_seatalk_apply_review(uuid, text, text, text, uuid)', 'EXECUTE')
    as authenticated_execute_denied
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_seatalk_apply_review'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text, text, text, uuid';

with dispatch_functions(function_name, argument_types) as (
  values
    ('ot_seatalk_claim_dispatch', 'uuid, uuid'),
    ('ot_seatalk_finish_dispatch', 'uuid, boolean, text, text')
), function_contracts as (
  select
    p.oid,
    p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
    pg_catalog.pg_get_functiondef(p.oid) as definition,
    p.prosecdef,
    p.proconfig
  from dispatch_functions expected
  join pg_catalog.pg_proc p on p.proname = expected.function_name
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and pg_catalog.oidvectortypes(p.proargtypes) = expected.argument_types
)
select
  'SeaTalk OT dispatch RPC contract (Expected leased grant-gated service role and compare-and-set finish)' as check_name,
  f.proname as function_name,
  f.arguments,
  f.prosecdef as security_definer,
  coalesce(pg_catalog.array_position(f.proconfig, 'search_path=""'), 0) > 0 as fixed_search_path,
  case when f.proname = 'ot_seatalk_claim_dispatch' then
    position('v_request.created_by_user_id <> p_actor_id' in f.definition) > 0
    and position('v_request.approver_user_id <> p_actor_id' in f.definition) > 0
    and position('for update of n' in f.definition) > 0
    and position('lease_expires_at <= pg_catalog.clock_timestamp()' in f.definition) > 0
    and position('attempt_count = attempt_count + 1' in f.definition) > 0
  else
    position('where dispatch_key = p_dispatch_key' in f.definition) > 0
    and position('and status = ''dispatching''' in f.definition) > 0
  end as atomic_state_contract,
  pg_catalog.has_function_privilege('service_role', f.oid, 'EXECUTE') as service_role_execute,
  not pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE') as anon_execute_denied,
  not pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') as authenticated_execute_denied
from function_contracts f
order by f.proname;

select
  'SeaTalk OT dispatch storage contract (Expected unique key, lease state, no browser writes)' as check_name,
  c.relrowsecurity as rls_enabled,
  exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = c.oid
      and i.indisunique
      and pg_catalog.pg_get_indexdef(i.indexrelid) like '%(dispatch_key)%'
  ) as unique_dispatch_key,
  exists (
    select 1
    from pg_catalog.pg_constraint con
    where con.conrelid = c.oid
      and con.conname = 'ot_seatalk_notifications_lease_state_check'
  ) as lease_state_constraint,
  not pg_catalog.has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE') as anon_writes_denied,
  not pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE') as authenticated_writes_denied
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'ot_seatalk_notifications';

select
  'SeaTalk OT actual verification notification contract (Expected queued only after actual submission)' as check_name,
  exists (
    select 1
    from pg_catalog.pg_constraint con
    where con.conrelid = 'public.ot_seatalk_notifications'::regclass
      and con.conname = 'ot_seatalk_notifications_notification_kind_check'
      and pg_catalog.pg_get_constraintdef(con.oid) like '%actual_verification%'
  ) as actual_notification_kind_allowed,
  position('public.ot_enqueue_seatalk_notification(v_request.id, ''actual_verification'')' in pg_catalog.pg_get_functiondef(
    'public.ot_submit_actual(uuid, jsonb, uuid)'::regprocedure
  )) > 0 as submission_enqueues_notification,
  position('v_notification.notification_kind = ''actual_verification''' in pg_catalog.pg_get_functiondef(
    'public.ot_seatalk_claim_dispatch(uuid, uuid)'::regprocedure
  )) > 0 as dispatch_claims_actual_notification;

with rejection_functions(function_name, argument_types) as (
  values
    ('ot_seatalk_begin_rejection', 'uuid, text, uuid'),
    ('ot_seatalk_apply_rejection_reason', 'text, text, uuid')
), function_contracts as (
  select
    p.oid,
    p.proname,
    pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
    pg_catalog.pg_get_functiondef(p.oid) as definition,
    p.prosecdef,
    p.proconfig
  from rejection_functions expected
  join pg_catalog.pg_proc p on p.proname = expected.function_name
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and pg_catalog.oidvectortypes(p.proargtypes) = expected.argument_types
)
select
  'SeaTalk OT pending rejection contract (Expected expiring sender binding and service_role only)' as check_name,
  f.proname as function_name,
  f.arguments,
  f.prosecdef as security_definer,
  coalesce(pg_catalog.array_position(f.proconfig, 'search_path=""'), 0) > 0 as fixed_search_path,
  position('SeaTalk sender is not the assigned OT approver' in f.definition) > 0 as assigned_sender_guard,
  case when f.proname = 'ot_seatalk_begin_rejection' then
    position('interval ''10 minutes''' in f.definition) > 0
    and position('pg_catalog.pg_advisory_xact_lock' in f.definition) > 0
    and position('v_action.begin_event_idempotency_key = p_event_idempotency_key' in f.definition) > 0
  else
    position('a.sender_email = v_sender_email' in f.definition) > 0
    and position('a.apply_event_idempotency_key = p_event_idempotency_key' in f.definition) > 0
    and position('public.ot_apply_plan_review(' in f.definition) > 0
  end as rejection_state_contract,
  pg_catalog.has_function_privilege('service_role', f.oid, 'EXECUTE') as service_role_execute,
  not pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE') as anon_execute_denied,
  not pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') as authenticated_execute_denied
from function_contracts f
order by f.proname;

select
  'SeaTalk OT pending rejection table contract (Expected RLS, sender uniqueness, browser writes denied)' as check_name,
  c.relrowsecurity as rls_enabled,
  exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = c.oid
      and i.indisunique
      and pg_catalog.pg_get_indexdef(i.indexrelid) like '%(sender_email)%WHERE (status = ''pending''::text)%'
  ) as one_pending_per_sender,
  not pg_catalog.has_table_privilege('anon', c.oid, 'INSERT, UPDATE, DELETE') as anon_writes_denied,
  not pg_catalog.has_table_privilege('authenticated', c.oid, 'INSERT, UPDATE, DELETE') as authenticated_writes_denied
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'ot_seatalk_pending_rejections';

select
  'Direct OT review notification compatibility (Expected cancels every actionable dispatch state)' as check_name,
  position('n.status in (''pending'', ''dispatching'', ''sent'', ''failed'')' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as locks_actionable_notification,
  position('set status = ''cancelled''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as cancels_notification,
  position('update public.ot_seatalk_pending_rejections' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as cancels_pending_rejection
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_review_plan'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text, text, uuid';

select
  'SeaTalk direct review decision gate (Expected approval only)' as check_name,
  position('if p_decision is distinct from ''approved'' then' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as rejects_non_approval,
  position('v_notification.request_id,' || chr(10) || '    ''approved'',' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as hard_coded_approval_transition
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_seatalk_apply_review'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text, text, text, uuid';

select
  'SeaTalk terminal dispatch replay identity (Expected matching status, message ID, and failure detail)' as check_name,
  position('n.seatalk_message_id' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as reads_message_id,
  position('n.last_error' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as reads_failure_detail,
  position('v_stored_message_id is distinct from v_message_id' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as message_id_conflict_guard,
  position('v_stored_error is distinct from v_expected_error' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as failure_detail_conflict_guard
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_seatalk_finish_dispatch'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, boolean, text, text';

select
  'SeaTalk rejection replay precedence (Expected applied event before active pending)' as check_name,
  position('select a.result into v_result' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as exact_replay_lookup,
  position('select a.result into v_result' in pg_catalog.pg_get_functiondef(p.oid))
    < position('and a.status = ''pending''' in pg_catalog.pg_get_functiondef(p.oid))
    as replay_before_pending,
  position('order by case when a.status = ''pending''' in pg_catalog.pg_get_functiondef(p.oid)) = 0
    as no_pending_first_union
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_seatalk_apply_rejection_reason'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'text, text, uuid';

select
  'OT approver reassignment SeaTalk reset (Expected notification-first lock and requeue)' as check_name,
  position('from public.ot_seatalk_notifications n' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as notification_lock_present,
  position('for update of n' in pg_catalog.pg_get_functiondef(p.oid))
    < position('for update of a' in pg_catalog.pg_get_functiondef(p.oid))
    as notification_before_approver,
  position('update public.ot_seatalk_pending_rejections' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as pending_rejection_cancelled,
  position('when v_request.status = ''pending_approval'' then ''pending''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as pending_plan_requeued,
  position('dispatch_key = null' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('lease_expires_at = null' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    as leased_dispatch_invalidated
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_reassign_pending_approver'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, uuid, text, uuid';

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
  'OT audit actor email snapshot column (Expected = NOT NULL)' as check_name,
  c.data_type,
  c.is_nullable
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'ot_request_audit'
  and c.column_name = 'actor_email_snapshot';

select
  'OT audit actor email snapshot trigger (Expected = enabled)' as check_name,
  t.tgenabled,
  pg_catalog.pg_get_triggerdef(t.oid) as trigger_definition
from pg_catalog.pg_trigger t
where t.tgrelid = 'public.ot_request_audit'::pg_catalog.regclass
  and t.tgname = 'ot_request_audit_actor_email_snapshot'
  and not t.tgisinternal;

select
  'Invalid OT audit actor email snapshots (Expected = 0)' as check_name,
  pg_catalog.count(*) as actual_count
from public.ot_request_audit a
where a.actor_email_snapshot is null
   or pg_catalog.length(a.actor_email_snapshot) = 0
   or a.actor_email_snapshot <> pg_catalog.lower(pg_catalog.btrim(a.actor_email_snapshot));

select
  'OT reason and consent validation helper contracts (Expected = 2)' as check_name,
  pg_catalog.count(*) as actual_count,
  pg_catalog.array_agg(p.proname order by p.proname) as found_helpers
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    (
      p.proname = 'ot_assert_reason'
      and pg_catalog.oidvectortypes(p.proargtypes) = 'text, text'
      and position('''offline_event''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
      and position('''scope_change''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    )
    or (
      p.proname = 'ot_assert_consent_version'
      and pg_catalog.oidvectortypes(p.proargtypes) = 'text'
      and position('''2026-08-07''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    )
  );

select
  'OT pending approver reassignment RPC contract (Expected = valid)' as check_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  coalesce(pg_catalog.array_position(p.proconfig, 'search_path=""'), 0) > 0 as fixed_search_path,
  position('public.ot_current_user_is_owner()' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as owner_guard,
  position('public.ot_user_is_approved_approver_identity(p_to_user_id)' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as destination_allowlist,
  position('order by a.user_id' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as approver_lock_order,
  position('order by r.id' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as request_lock_order,
  position('''reassign_pending_approver_admin''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as administration_audit,
  position('changed_fields->''result''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as stable_replay
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_reassign_pending_approver'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, uuid, text, uuid';

select
  'OT pending approver reassignment execute grants (Expected authenticated only)' as check_name,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.ot_reassign_pending_approver(uuid, uuid, text, uuid)',
    'EXECUTE'
  ) as authenticated_execute,
  not exists (
    select 1
    from information_schema.routine_privileges rp
    where rp.specific_schema = 'public'
      and rp.routine_name = 'ot_reassign_pending_approver'
      and rp.privilege_type = 'EXECUTE'
      and rp.grantee in ('anon', 'PUBLIC')
  ) as public_and_anon_revoked;

select
  'OT unsafe approver deactivation guard (Expected = true)' as check_name,
  (
    position('if not p_active and exists (' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('pending approver work' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('''pending_actual_verification''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('''compliance_review_required''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
  ) as pending_work_guard
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_set_approver'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, boolean, text, uuid';

with approver_contracts as (
  select
    p.proname,
    pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'ot_user_is_approved_approver_identity',
      'ot_current_user_is_eligible_approver',
      'ot_reassign_pending_approver',
      'ot_set_approver'
    )
), definitions as (
  select
    pg_catalog.max(definition) filter (where proname = 'ot_user_is_approved_approver_identity') as fixed_identity,
    pg_catalog.max(definition) filter (where proname = 'ot_current_user_is_eligible_approver') as eligible_approver,
    pg_catalog.max(definition) filter (where proname = 'ot_reassign_pending_approver') as reassign,
    pg_catalog.max(definition) filter (where proname = 'ot_set_approver') as set_approver
  from approver_contracts
)
select
  'OT inactive fixed approver remediation contract (Expected = valid)' as check_name,
  position('u.is_active' in d.fixed_identity) = 0 as fixed_identity_survives_user_deactivation,
  (
    position('public.ot_user_is_approved_approver_identity(u.id)' in d.eligible_approver) > 0
    and position('u.is_active = true' in d.eligible_approver) > 0
    and position('a.active = true' in d.eligible_approver) > 0
  ) as current_eligibility_requires_active_user_and_approver,
  position('public.ot_user_is_approved_approver_identity(p_from_user_id)' in d.reassign) > 0 as fixed_source_allowlist,
  (
    position('public.ot_user_is_approved_approver_identity(p_to_user_id)' in d.reassign) > 0
    and position('a.active = true' in d.reassign) > 0
    and position('u.is_active = true' in d.reassign) > 0
  ) as destination_remains_active_and_allowlisted,
  (
    position('if p_active and not exists (' in d.set_approver) > 0
    and position('u.is_active = true' in d.set_approver) > 0
  ) as inactive_identity_cannot_be_activated
from definitions d;

with decision_functions as (
  select
    p.proname,
    pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      (p.proname = 'ot_apply_plan_review' and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text, text, uuid, uuid')
      or (p.proname = 'ot_verify_actual' and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text, text, uuid')
    )
)
select
  'OT decision authority serialization contract (Expected = valid)' as check_name,
  d.proname,
  position('for key share of a' in d.definition) > 0 as actor_approver_lock,
  position('for key share of a' in d.definition)
    < position('public.ot_lock_employee_weeks' in d.definition) as approver_before_week_lock,
  position('public.ot_lock_employee_weeks' in d.definition)
    < position('select * into v_request from public.ot_requests r where r.id = p_request_id for update;' in d.definition) as week_before_request_lock,
  position(
    case
      when d.proname = 'ot_apply_plan_review' then 'v_request.approver_user_id <> p_actor_id'
      else 'v_request.approver_user_id <> v_actor_id'
    end
    in substring(
      d.definition
      from position('select * into v_request from public.ot_requests r where r.id = p_request_id for update;' in d.definition)
    )
  ) > 0 as refreshed_assignment_guard,
  position(
    case
      when d.proname = 'ot_apply_plan_review' then 'not exists ('
      else 'not public.ot_current_user_is_eligible_approver()'
    end
    in substring(
      d.definition
      from position('select * into v_request from public.ot_requests r where r.id = p_request_id for update;' in d.definition)
    )
  ) > 0 as refreshed_eligibility_guard
from decision_functions d
order by d.proname;

with actual_verifier as (
  select pg_catalog.pg_get_functiondef(p.oid) as definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'ot_verify_actual'
    and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text, text, uuid'
)
select
  'OT approved Actual immutability contract (Expected = valid)' as check_name,
  (
    position('v_request.actual_decision is not null' in a.definition)
      > position('return pg_catalog.to_jsonb(v_request);' in a.definition)
    and position('v_request.actual_decision is not null' in a.definition)
      < position('for key share of a' in a.definition)
  ) as guard_after_replay_before_locks,
  position(
    'v_request.actual_decision is not null'
    in substring(
      a.definition
      from position('select * into v_request from public.ot_requests r where r.id = p_request_id for update;' in a.definition)
    )
  ) > 0 as guard_after_request_lock
from actual_verifier a;

with planned_start_functions as (
  select
    p.proname,
    pg_catalog.pg_get_functiondef(p.oid) as definition,
    case p.proname
      when 'ot_create_request' then 'insert into public.ot_requests'
      when 'ot_resubmit_plan' then 'update public.ot_requests'
      when 'ot_create_event_plan' then 'insert into public.ot_event_plans'
      else null
    end as write_anchor
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'ot_create_request',
      'ot_resubmit_plan',
      'ot_preview_event_plan',
      'ot_create_event_plan'
    )
)
select
  'OT future planned-start enforcement contract (Expected = valid)' as check_name,
  f.proname,
  position('v_start_at timestamptz' in f.definition) > 0 as timestamptz_input,
  position('v_start_at <= pg_catalog.clock_timestamp()' in f.definition) > 0 as caller_future_guard,
  case
    when f.write_anchor is null then true
    else
      position('v_start_at <= pg_catalog.clock_timestamp()' in f.definition)
        < position('public.ot_assert_no_employee_overlap' in f.definition)
      and position(
        'v_start_at <= pg_catalog.clock_timestamp()'
        in substring(
          f.definition
          from position('public.ot_assert_no_employee_overlap' in f.definition)
        )
      ) > 0
      and position(
        'v_start_at <= pg_catalog.clock_timestamp()'
        in substring(
          f.definition
          from position('public.ot_assert_no_employee_overlap' in f.definition)
        )
      ) < position(
        f.write_anchor
        in substring(
          f.definition
          from position('public.ot_assert_no_employee_overlap' in f.definition)
        )
      )
  end as post_lock_recheck_before_write
from planned_start_functions f
order by f.proname;

select
  'Actual amendment RPC contract (Expected = valid)' as check_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  coalesce(pg_catalog.array_position(p.proconfig, 'search_path=""'), 0) > 0 as fixed_search_path,
  (
    position('public.ot_current_user_is_owner()' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('public.ot_current_user_is_hr_admin()' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('public.ot_user_is_approved_approver_identity(v_actor_id)' in pg_catalog.pg_get_functiondef(p.oid)) > 0
  ) as approved_elevated_identity_guard,
  position('''request_actual_amendment''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_audit_action
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
  'Plan resubmission RPC contract (Expected = valid)' as check_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  p.prosecdef as security_definer,
  coalesce(pg_catalog.array_position(p.proconfig, 'search_path=""'), 0) > 0 as fixed_search_path,
  (
    position('v_request.employee_user_id <> v_actor_id' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('v_request.source <> ''employee_request''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('v_request.status <> ''revision_required''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('v_request.actual_submitted_at is not null' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('v_request.plan_decision is distinct from ''revision_required''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
  ) as employee_state_guard,
  position('ot-request:' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as request_lock,
  (
    position('v_request.planned_week_segments || v_segments' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('order by week_start' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('public.ot_lock_employee_weeks' in pg_catalog.pg_get_functiondef(p.oid)) > 0
  ) as week_union_lock,
  position('public.ot_assert_planned_limit' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as canonical_limit_check,
  position('public.ot_assert_no_employee_overlap' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as overlap_check,
  position('''resubmit_plan''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_audit_action
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_resubmit_plan'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, jsonb, text, uuid';

select
  'Plan resubmission RPC execute grants (Expected authenticated only)' as check_name,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.ot_resubmit_plan(uuid, jsonb, text, uuid)',
    'EXECUTE'
  ) as authenticated_execute,
  not exists (
    select 1
    from information_schema.routine_privileges rp
    where rp.specific_schema = 'public'
      and rp.routine_name = 'ot_resubmit_plan'
      and rp.privilege_type = 'EXECUTE'
      and rp.grantee in ('anon', 'PUBLIC')
  ) as public_and_anon_revoked,
  not pg_catalog.has_function_privilege(
    'authenticated',
    'public.ot_assert_no_employee_overlap(uuid, timestamptz, timestamptz, uuid)',
    'EXECUTE'
  ) as overlap_helper_private;

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
  position('''countedMinutes''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_counted_minutes
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

with expected_transition_functions(function_name, argument_types, replay_marker, future_guard_marker) as (
  values
    (
      'ot_apply_plan_review',
      'uuid, text, text, uuid, uuid',
      'a.action = ''review_plan'' and a.idempotency_key = p_idempotency_key',
      'if p_decision = ''approved'' and v_request.planned_start_at <= pg_catalog.clock_timestamp() then'
    ),
    (
      'ot_record_consent',
      'uuid, boolean, text, uuid',
      'a.action = ''record_consent'' and a.idempotency_key = p_idempotency_key',
      'if p_accept and v_request.planned_start_at <= pg_catalog.clock_timestamp() then'
    )
),
target_functions as (
  select
    e.function_name,
    e.replay_marker,
    e.future_guard_marker,
    p.oid as function_oid,
    coalesce(pg_catalog.pg_get_functiondef(p.oid), '') as definition
  from expected_transition_functions e
  left join pg_catalog.pg_namespace n
    on n.nspname = 'public'
  left join pg_catalog.pg_proc p
    on p.pronamespace = n.oid
   and p.proname = e.function_name
   and pg_catalog.oidvectortypes(p.proargtypes) = e.argument_types
),
marker_positions as (
  select
    t.function_name,
    t.function_oid,
    position(t.replay_marker in t.definition) as replay_position,
    position(
      'select * into v_request from public.ot_requests r where r.id = p_request_id for update;'
      in t.definition
    ) as request_lock_position,
    position(t.future_guard_marker in t.definition) as future_guard_position,
    position('update public.ot_requests' in t.definition) as update_position
  from target_functions t
)
select
  'OT pre-work post-lock transition guard contract (Expected = valid)' as check_name,
  m.function_name,
  pg_catalog.count(*) over () = 2 as exact_target_check_rows,
  m.function_oid is not null as function_present,
  m.replay_position > 0 as replay_marker_present,
  m.request_lock_position > 0 as request_lock_marker_present,
  m.future_guard_position > 0 as future_guard_marker_present,
  m.update_position > 0 as update_marker_present,
  (
    m.replay_position > 0
    and m.future_guard_position > 0
    and m.replay_position < m.future_guard_position
  ) as replay_precedes_future_guard,
  (
    m.request_lock_position > 0
    and m.future_guard_position > 0
    and m.request_lock_position < m.future_guard_position
  ) as request_lock_precedes_future_guard,
  (
    m.future_guard_position > 0
    and m.update_position > 0
    and m.future_guard_position < m.update_position
  ) as future_guard_precedes_update
from marker_positions m
order by m.function_name;

select
  'OT access admin identity directory contract (Expected = valid)' as check_name,
  (
    position('if not public.ot_current_user_is_owner() then' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('''Big'', ''nithidol.k@garena.com''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('''Mac'', ''weerayut@garena.com''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('''Pluem'', ''napol.a@garena.com''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('''isWorkgridActive''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('''isApproverActive''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('''isHrAdminActive''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('left join public.users' in pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid))) > 0
    and position('left join public.ot_approvers' in pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid))) > 0
    and position('left join public.ot_system_roles' in pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid))) > 0
  ) as fixed_owner_directory_matches_contract
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_list_access_admin_identities'
  and pg_catalog.oidvectortypes(p.proargtypes) = '';

select
  'OT access admin identity directory execute grants (Expected authenticated only)' as check_name,
  pg_catalog.has_function_privilege(
    'authenticated',
    'public.ot_list_access_admin_identities()',
    'EXECUTE'
  ) as authenticated_execute,
  not exists (
    select 1
    from information_schema.routine_privileges rp
    where rp.specific_schema = 'public'
      and rp.routine_name = 'ot_list_access_admin_identities'
      and rp.privilege_type = 'EXECUTE'
    and rp.grantee in ('anon', 'PUBLIC')
  ) as public_and_anon_revoked;

with requester_functions(function_name, argument_types, owner_only) as (
  values
    ('ot_list_requester_access', '', true),
    ('ot_upsert_requester_access', 'jsonb, uuid', true),
    ('ot_set_requester_access', 'uuid, boolean, uuid', true),
    ('ot_resolve_current_requester_access', '', false)
), function_contracts as (
  select
    expected.function_name,
    expected.owner_only,
    p.oid,
    pg_catalog.pg_get_functiondef(p.oid) as definition
  from requester_functions expected
  join pg_catalog.pg_proc p on p.proname = expected.function_name
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and pg_catalog.oidvectortypes(p.proargtypes) = expected.argument_types
)
select
  'OT requester access RPC contract (Expected = Owner-only maintenance, pending identity sync, authenticated execute)' as check_name,
  f.function_name,
  case when f.owner_only then
    position('if not public.ot_current_user_is_owner() then' in f.definition) > 0
  else
    position('for update' in f.definition) > 0
      and position('sync_requester_access_identity' in f.definition) > 0
  end as authority_and_sync_contract,
  case when f.function_name = 'ot_upsert_requester_access' then
    position('@garena.com' in f.definition) > 0
      and position('ot_requester_access_audit' in f.definition) > 0
      and position('for update' in f.definition) > 0
  when f.function_name = 'ot_set_requester_access' then
    position('ot_requester_access_audit' in f.definition) > 0
      and position('unresolved OT request' in f.definition) > 0
  else true end as lifecycle_contract,
  pg_catalog.has_function_privilege('authenticated', f.oid, 'EXECUTE') as authenticated_execute,
  not pg_catalog.has_function_privilege('anon', f.oid, 'EXECUTE') as anon_execute_denied,
  not exists (
    select 1
    from information_schema.routine_privileges rp
    where rp.specific_schema = 'public'
      and rp.routine_name = f.function_name
      and rp.privilege_type = 'EXECUTE'
      and rp.grantee = 'PUBLIC'
  ) as public_execute_denied
from function_contracts f
order by f.function_name;

with personal_functions(function_name, argument_types) as (
  values
    ('ot_get_my_dashboard', 'date'),
    ('ot_list_my_requests', 'date'),
    ('ot_create_request', 'jsonb, uuid'),
    ('ot_resubmit_plan', 'uuid, jsonb, text, uuid'),
    ('ot_record_consent', 'uuid, boolean, text, uuid'),
    ('ot_submit_actual', 'uuid, jsonb, uuid')
), function_contracts as (
  select
    expected.function_name,
    p.oid,
    pg_catalog.pg_get_functiondef(p.oid) as definition
  from personal_functions expected
  join pg_catalog.pg_proc p on p.proname = expected.function_name
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and pg_catalog.oidvectortypes(p.proargtypes) = expected.argument_types
)
select
  'OT requester enforcement contract (Expected = active access required and server-locked Function)' as check_name,
  f.function_name,
  position('public.ot_require_current_requester_access()' in f.definition) > 0 as active_requester_required,
  case when f.function_name in ('ot_create_request', 'ot_resubmit_plan') then
    position('v_requester_access.function_code' in f.definition) > 0
      and position('v_function_code := nullif(pg_catalog.btrim(coalesce(' in f.definition) = 0
  else true end as server_function_lock
from function_contracts f
order by f.function_name;

select
  'OT requester access context contract (Expected = capability, locked Function, status)' as check_name,
  p.provolatile <> 's' as can_sync_pending_identity,
  position('public.ot_resolve_current_requester_access()' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as resolves_identity,
  position('''canRequestOt''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as exposes_capability,
  position('''requesterFunctionCode''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as exposes_function,
  position('''requesterAccessStatus''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as exposes_status
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_get_access_context'
  and pg_catalog.oidvectortypes(p.proargtypes) = '';

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
    'ot_function_approver_id', 'ot_enqueue_seatalk_notification',
    'ot_is_service_role_context', 'ot_seatalk_claim_dispatch', 'ot_seatalk_finish_dispatch',
    'ot_seatalk_begin_rejection', 'ot_seatalk_apply_rejection_reason',
    'ot_apply_plan_review', 'ot_seatalk_apply_review',
    'ot_calculate_occurrence_minutes', 'ot_projected_week_minutes',
    'ot_counted_week_minutes_unchecked',
    'ot_get_access_context', 'ot_get_my_dashboard', 'ot_list_my_requests',
    'ot_get_manager_dashboard', 'ot_list_eligible_approvers',
    'ot_list_people_for_event', 'ot_list_access_admin_identities',
    'ot_list_requester_access', 'ot_upsert_requester_access', 'ot_set_requester_access',
    'ot_resolve_current_requester_access', 'ot_require_current_requester_access',
    'ot_create_request', 'ot_resubmit_plan', 'ot_preview_event_plan',
    'ot_create_event_plan', 'ot_record_consent', 'ot_review_plan',
    'ot_submit_actual', 'ot_request_actual_amendment', 'ot_verify_actual', 'ot_list_compliance_queue',
    'ot_review_compliance', 'ot_list_request_audit', 'ot_list_hr_ready',
    'ot_mark_exported', 'ot_reassign_pending_approver', 'ot_set_approver', 'ot_set_system_role'
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
  'Team Lead export RPC contract (Expected = SETOF jsonb with normalized emails and assigned scope)' as check_name,
  pg_catalog.pg_get_function_result(p.oid) as result_type,
  position('''employee_email''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_employee_email,
  position('''approver_email''' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_approver_email,
  position('public.ot_current_user_is_eligible_approver()' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_team_lead_guard,
  position('r.approver_user_id = v_actor_id' in pg_catalog.pg_get_functiondef(p.oid)) > 0 as has_assigned_scope
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
    'ot_system_roles', 'ot_approvers', 'ot_requester_access', 'ot_requester_access_audit', 'ot_event_plans',
    'ot_requests', 'ot_request_audit', 'ot_export_batches',
    'ot_seatalk_notifications', 'ot_seatalk_pending_rejections'
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
  'OT HR Admin fixed helper contract (Expected = true)' as check_name,
  (
    position('u.id = (select auth.uid())' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('u.is_active = true' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('public.ot_user_is_approved_approver_identity(u.id)' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('r.role_code = ''hr_admin''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('r.active = true' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('like ''%@garena.com''' in pg_catalog.pg_get_functiondef(p.oid)) = 0
  ) as helper_matches_contract
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_current_user_is_hr_admin'
  and pg_catalog.oidvectortypes(p.proargtypes) = '';

select
  'Legacy active HR Admin role does not satisfy fixed helper (Expected = true)' as check_name,
  position(
    'public.ot_user_is_approved_approver_identity(u.id)'
    in pg_catalog.pg_get_functiondef(p.oid)
  ) > 0 as legacy_role_cannot_grant_hr_access
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_current_user_is_hr_admin'
  and pg_catalog.oidvectortypes(p.proargtypes) = '';

select
  'OT HR Admin deactivation remediation contract (Expected = true)' as check_name,
  (
    pg_catalog.pg_get_functiondef(p.oid) ~
      'if[[:space:]]+p_role_code = ''hr_admin''[[:space:]]+and p_active = true[[:space:]]+and not public[.]ot_user_is_approved_approver_identity[(]p_user_id[)][[:space:]]+then[[:space:]]+raise exception ''HR Admin must be one of the three approved MVP identities'';[[:space:]]+end if;'
    and not pg_catalog.pg_get_functiondef(p.oid) ~
      'if[[:space:]]+p_role_code = ''hr_admin''[[:space:]]+and p_active = false[[:space:]]+and not public[.]ot_user_is_approved_approver_identity[(]p_user_id[)][[:space:]]+then[[:space:]]+raise exception'
    and position('A non-empty reason is required' in pg_catalog.pg_get_functiondef(p.oid)) > 0
    and position('''set_system_role''' in pg_catalog.pg_get_functiondef(p.oid)) > 0
  ) as deactivation_remediation_matches_contract
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'ot_set_system_role'
  and pg_catalog.oidvectortypes(p.proargtypes) = 'uuid, text, boolean, text, uuid';

select
  'Legacy HR Admin deactivation reachability (Expected = true)' as check_name,
  (
    pg_catalog.pg_get_functiondef(p.oid) ~
      'if[[:space:]]+p_active[[:space:]]+then[[:space:]]+select[[:space:]]+pg_catalog[.]lower[(]pg_catalog[.]btrim[(]u[.]email[)][)][[:space:]]+into v_target_email[[:space:]]+from public[.]users u[[:space:]]+where u[.]id = p_user_id and u[.]is_active = true;'
    and pg_catalog.pg_get_functiondef(p.oid) ~
      'if[[:space:]]+not p_active[[:space:]]+then[[:space:]]+select[[:space:]]+pg_catalog[.]to_jsonb[(]r[)][[:space:]]+into v_previous[[:space:]]+from public[.]ot_system_roles r where r[.]user_id = p_user_id for update;[[:space:]]+if not found[[:space:]]+or p_role_code <> ''hr_admin''[[:space:]]+or v_previous->>''role_code'' <> ''hr_admin''[[:space:]]+then[[:space:]]+raise exception ''Only an existing HR Admin role can be deactivated'';'
  ) as legacy_deactivation_matches_contract
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
    or pg_catalog.lower(coalesce(p.qual, '')) like '%ot\_%' escape '\'
    or pg_catalog.lower(coalesce(p.with_check, '')) like '%ot\_%' escape '\'
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
    or pg_catalog.lower(coalesce(p.qual, '')) like '%ot\_%' escape '\'
    or pg_catalog.lower(coalesce(p.with_check, '')) like '%ot\_%' escape '\'
  );

with active_users as (
  select
    u.id,
    pg_catalog.lower(pg_catalog.btrim(coalesce(u.email, ''))) as email,
    nullif(pg_catalog.btrim(u.display_name), '') as display_name,
    pg_catalog.lower(pg_catalog.btrim(coalesce(u.requester_team, ''))) as requester_team
  from public.users u
  where u.is_active = true
), normalized as (
  select
    a.*,
    case
      when a.requester_team in ('gdve', 'ops', 'mkt', 'esport') then a.requester_team
      else null
    end as mapped_function_code,
    (
      a.email like '%@garena.com'
      and pg_catalog.length(a.email) > pg_catalog.length('@garena.com')
    ) as has_garena_email
  from active_users a
)
select
  'OT requester access preflight (Expected = 0 active users without a valid Garena email and recognized Function)' as check_name,
  pg_catalog.count(*) filter (
    where mapped_function_code is null or not has_garena_email
  ) as actual_count,
  coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'user_id', id,
        'email', email,
        'display_name', display_name,
        'requester_team', requester_team,
        'suggested_function_code', mapped_function_code,
        'has_garena_email', has_garena_email
      )
      order by email, id
    ) filter (where mapped_function_code is null or not has_garena_email),
    '[]'::jsonb
  ) as violations
from normalized;
