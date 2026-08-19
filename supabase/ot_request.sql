-- Workgrid OT Request MVP
-- Run in Supabase SQL Editor with "Run without RLS" after the FlowMate base
-- schema. This installer is idempotent, keeps OT authorization isolated from
-- other Workgrid modules, and exposes writes only through authenticated RPCs.

begin;

do $block$
begin
  if pg_catalog.to_regclass('public.users') is null then
    raise exception 'OT Request requires public.users; run the FlowMate base schema first';
  end if;
end
$block$;

create table if not exists public.ot_system_roles (
  user_id uuid primary key references public.users(id) on delete cascade,
  role_code text not null check (role_code in ('owner', 'hr_admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ot_approvers (
  user_id uuid primary key references public.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- OT requester access is deliberately separate from Workgrid application roles.
-- A row may be created before the employee has a public.users identity so an
-- Owner can provision a Garena email ahead of first sign-in.
create table if not exists public.ot_requester_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.users(id) on delete set null,
  email text not null unique,
  first_name text,
  last_name text,
  display_name text not null,
  function_code text not null check (function_code in ('gdve', 'ops', 'mkt', 'esport')),
  status text not null check (status in ('active', 'pending_sync', 'deactivated')),
  note text,
  created_by_user_id uuid references public.users(id) on delete restrict,
  updated_by_user_id uuid references public.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deactivated_at timestamptz,
  constraint ot_requester_access_email_canonical check (
    email = pg_catalog.lower(pg_catalog.btrim(email))
    and email like '%@garena.com'
    and pg_catalog.length(email) > pg_catalog.length('@garena.com')
  ),
  constraint ot_requester_access_display_name_required check (
    pg_catalog.length(pg_catalog.btrim(display_name)) > 0
  ),
  constraint ot_requester_access_deactivation_state check (
    (status = 'deactivated' and deactivated_at is not null)
    or (status <> 'deactivated' and deactivated_at is null)
  )
);

create table if not exists public.ot_requester_access_audit (
  id uuid primary key default gen_random_uuid(),
  requester_access_id uuid not null references public.ot_requester_access(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  action text not null,
  old_values jsonb not null default '{}'::jsonb,
  new_values jsonb not null default '{}'::jsonb,
  reason text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  constraint ot_requester_access_audit_action_required check (
    pg_catalog.length(pg_catalog.btrim(action)) > 0
  ),
  constraint ot_requester_access_audit_old_values_object check (
    pg_catalog.jsonb_typeof(old_values) = 'object'
  ),
  constraint ot_requester_access_audit_new_values_object check (
    pg_catalog.jsonb_typeof(new_values) = 'object'
  ),
  unique (actor_user_id, action, idempotency_key)
);

create table if not exists public.ot_event_plans (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  function_code text not null check (function_code in ('gdve', 'ops', 'mkt', 'esport')),
  work_location_type text not null check (work_location_type in ('office', 'remote', 'venue')),
  venue text,
  reason_code text not null,
  reason_detail text,
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  planned_break_minutes integer not null default 0 check (planned_break_minutes >= 0),
  approver_user_id uuid not null references public.users(id),
  created_by_user_id uuid not null references public.users(id),
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  constraint ot_event_plans_title_required check (pg_catalog.length(pg_catalog.btrim(title)) > 0),
  constraint ot_event_plans_time_order check (planned_end_at > planned_start_at),
  constraint ot_event_plans_venue_required check (work_location_type <> 'venue' or pg_catalog.length(pg_catalog.btrim(coalesce(venue, ''))) > 0),
  unique (created_by_user_id, idempotency_key)
);

create table if not exists public.ot_requests (
  id uuid primary key default gen_random_uuid(),
  event_plan_id uuid references public.ot_event_plans(id) on delete restrict,
  employee_user_id uuid not null references public.users(id) on delete restrict,
  approver_user_id uuid not null references public.users(id) on delete restrict,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  source text not null check (source in ('employee_request', 'event_plan')),
  request_type text not null default 'planned' check (request_type in ('planned', 'consented', 'actual')),
  function_code text not null check (function_code in ('gdve', 'ops', 'mkt', 'esport')),
  title text not null,
  day_type text not null check (day_type in ('working_day', 'rest_day', 'public_holiday')),
  work_location_type text not null check (work_location_type in ('office', 'remote', 'venue')),
  venue text,
  reason_code text not null,
  reason_detail text,
  planned_start_at timestamptz not null,
  planned_end_at timestamptz not null,
  planned_break_minutes integer not null default 0 check (planned_break_minutes >= 0),
  planned_minutes integer not null check (planned_minutes > 0),
  planned_week_segments jsonb not null default '[]'::jsonb,
  actual_start_at timestamptz,
  actual_end_at timestamptz,
  actual_break_minutes integer check (actual_break_minutes is null or actual_break_minutes >= 0),
  actual_minutes integer check (actual_minutes is null or actual_minutes > 0),
  actual_week_segments jsonb,
  actual_variance_reason text,
  status text not null check (status in (
    'draft', 'pending_approval', 'awaiting_consent', 'approved', 'rejected',
    'revision_required', 'actual_confirmation_required',
    'pending_actual_verification', 'compliance_review_required',
    'hr_ready', 'exported', 'cancelled'
  )),
  employee_consent text check (employee_consent is null or employee_consent in ('accepted', 'declined')),
  consent_statement_version text,
  employee_consented_at timestamptz,
  employee_submitted_at timestamptz,
  plan_decision text check (plan_decision is null or plan_decision in ('approved', 'rejected', 'revision_required')),
  plan_decision_note text,
  plan_reviewed_by_user_id uuid references public.users(id) on delete restrict,
  plan_reviewed_at timestamptz,
  actual_decision text check (actual_decision is null or actual_decision in ('approved', 'rejected', 'revision_required')),
  actual_decision_note text,
  actual_submitted_at timestamptz,
  actual_verified_by_user_id uuid references public.users(id) on delete restrict,
  actual_verified_at timestamptz,
  compliance_required boolean not null default false,
  compliance_outcome text check (compliance_outcome is null or compliance_outcome in ('approved', 'cleared', 'action_required', 'rejected')),
  compliance_note text,
  compliance_reviewed_by_user_id uuid references public.users(id) on delete restrict,
  compliance_reviewed_at timestamptz,
  hr_ready_at timestamptz,
  exported_at timestamptz,
  export_batch_id uuid,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ot_requests_title_required check (pg_catalog.length(pg_catalog.btrim(title)) > 0),
  constraint ot_requests_planned_time_order check (planned_end_at > planned_start_at),
  constraint ot_requests_actual_time_complete check (
    (actual_start_at is null and actual_end_at is null and actual_break_minutes is null and actual_minutes is null and actual_week_segments is null)
    or
    (actual_start_at is not null and actual_end_at is not null and actual_break_minutes is not null and actual_minutes is not null and actual_week_segments is not null and actual_end_at > actual_start_at)
  ),
  constraint ot_requests_venue_required check (work_location_type <> 'venue' or pg_catalog.length(pg_catalog.btrim(coalesce(venue, ''))) > 0),
  constraint ot_requests_week_segments_array check (pg_catalog.jsonb_typeof(planned_week_segments) = 'array' and (actual_week_segments is null or pg_catalog.jsonb_typeof(actual_week_segments) = 'array')),
  unique (created_by_user_id, idempotency_key, employee_user_id)
);

alter table public.ot_requests
  add column if not exists consent_statement_version text,
  add column if not exists actual_variance_reason text;

create table if not exists public.ot_request_audit (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.ot_requests(id) on delete restrict,
  event_plan_id uuid references public.ot_event_plans(id) on delete restrict,
  actor_user_id uuid not null references public.users(id) on delete restrict,
  actor_email_snapshot text,
  action text not null,
  old_status text,
  new_status text,
  changed_fields jsonb not null default '{}'::jsonb,
  note text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  constraint ot_request_audit_action_required check (pg_catalog.length(pg_catalog.btrim(action)) > 0)
);

create table if not exists public.ot_seatalk_notifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ot_requests(id) on delete restrict,
  notification_kind text not null check (notification_kind in ('plan_approval', 'actual_verification')),
  status text not null default 'pending' check (status in ('pending', 'dispatching', 'sent', 'failed', 'applied', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  seatalk_message_id text,
  dispatch_key uuid,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, notification_kind)
);

alter table public.ot_seatalk_notifications
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_error text;

alter table public.ot_seatalk_notifications
  drop constraint if exists ot_seatalk_notifications_notification_kind_check;
alter table public.ot_seatalk_notifications
  add constraint ot_seatalk_notifications_notification_kind_check
  check (notification_kind in ('plan_approval', 'actual_verification'));

alter table public.ot_seatalk_notifications drop constraint if exists ot_seatalk_notifications_status_check;
alter table public.ot_seatalk_notifications
  add constraint ot_seatalk_notifications_status_check
  check (status in ('pending', 'dispatching', 'sent', 'failed', 'applied', 'cancelled'));

alter table public.ot_seatalk_notifications drop constraint if exists ot_seatalk_notifications_lease_state_check;
alter table public.ot_seatalk_notifications
  add constraint ot_seatalk_notifications_lease_state_check
  check (
    (status = 'dispatching' and dispatch_key is not null and lease_expires_at is not null)
    or (status <> 'dispatching' and lease_expires_at is null)
  );

create unique index if not exists ot_seatalk_notifications_dispatch_key_uidx
on public.ot_seatalk_notifications(dispatch_key)
where dispatch_key is not null;

create table if not exists public.ot_seatalk_pending_rejections (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.ot_seatalk_notifications(id) on delete restrict,
  sender_email text not null,
  begin_event_idempotency_key uuid not null,
  apply_event_idempotency_key uuid,
  status text not null default 'pending' check (status in ('pending', 'applied', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  result jsonb,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ot_seatalk_pending_rejections_sender_required
    check (pg_catalog.length(pg_catalog.btrim(sender_email)) > 0),
  constraint ot_seatalk_pending_rejections_expiry_order
    check (expires_at > created_at)
);

create unique index if not exists ot_seatalk_pending_rejections_sender_pending_uidx
on public.ot_seatalk_pending_rejections(sender_email)
where status = 'pending';

create unique index if not exists ot_seatalk_pending_rejections_apply_event_uidx
on public.ot_seatalk_pending_rejections(apply_event_idempotency_key)
where apply_event_idempotency_key is not null;

-- Existing installations already have the append-only trigger. Remove it only
-- inside this migration transaction so the one-time nullable-column backfill
-- can run; it is recreated before any OT RPC definitions below.
drop trigger if exists ot_request_audit_append_only on public.ot_request_audit;

alter table public.ot_request_audit
  add column if not exists actor_email_snapshot text;

update public.ot_request_audit a
set actor_email_snapshot = nullif(pg_catalog.lower(pg_catalog.btrim(u.email)), '')
from public.users u
where u.id = a.actor_user_id
  and a.actor_email_snapshot is null;

do $block$
begin
  if exists (
    select 1
    from public.ot_request_audit a
    where a.actor_email_snapshot is null
  ) then
    raise exception 'OT audit actor email backfill requires a resolvable non-empty historical user email';
  end if;
end
$block$;

alter table public.ot_request_audit
  alter column actor_email_snapshot set not null;

create or replace function public.ot_set_audit_actor_email_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_email text;
begin
  select nullif(pg_catalog.lower(pg_catalog.btrim(u.email)), '')
  into v_actor_email
  from public.users u
  where u.id = new.actor_user_id;

  if v_actor_email is null then
    raise exception 'OT audit actor requires a resolvable non-empty historical user email';
  end if;

  new.actor_email_snapshot := v_actor_email;
  return new;
end
$function$;

drop trigger if exists ot_request_audit_actor_email_snapshot on public.ot_request_audit;
create trigger ot_request_audit_actor_email_snapshot
before insert on public.ot_request_audit
for each row execute function public.ot_set_audit_actor_email_snapshot();

create or replace function public.ot_guard_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'OT request audit is append-only';
end
$function$;

create trigger ot_request_audit_append_only
before update or delete on public.ot_request_audit
for each row execute function public.ot_guard_audit_append_only();

create or replace function public.ot_guard_requester_access_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'OT requester access audit is append-only';
end
$function$;

drop trigger if exists ot_requester_access_audit_append_only on public.ot_requester_access_audit;
create trigger ot_requester_access_audit_append_only
before update or delete on public.ot_requester_access_audit
for each row execute function public.ot_guard_requester_access_audit_append_only();

create table if not exists public.ot_export_batches (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  created_by_user_id uuid not null references public.users(id) on delete restrict,
  request_ids uuid[] not null,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  constraint ot_export_batches_name_required check (pg_catalog.length(pg_catalog.btrim(batch_name)) > 0),
  constraint ot_export_batches_requests_required check (pg_catalog.cardinality(request_ids) > 0),
  unique (created_by_user_id, idempotency_key)
);

do $block$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.ot_requests'::pg_catalog.regclass
      and conname = 'ot_requests_export_batch_id_fkey'
  ) then
    alter table public.ot_requests
      add constraint ot_requests_export_batch_id_fkey
      foreign key (export_batch_id) references public.ot_export_batches(id) on delete restrict;
  end if;
end
$block$;

create index if not exists ot_requests_employee_idx
on public.ot_requests(employee_user_id, created_at desc);
create index if not exists ot_requests_approver_idx
on public.ot_requests(approver_user_id, created_at desc);
create index if not exists ot_requests_event_plan_idx
on public.ot_requests(event_plan_id) where event_plan_id is not null;
create index if not exists ot_requests_status_idx
on public.ot_requests(status, created_at desc);
create index if not exists ot_requests_planned_segments_gin
on public.ot_requests using gin(planned_week_segments);
create index if not exists ot_requests_actual_segments_gin
on public.ot_requests using gin(actual_week_segments) where actual_week_segments is not null;
create index if not exists ot_audit_request_idx
on public.ot_request_audit(request_id, created_at, id);
create index if not exists ot_audit_event_plan_idx
on public.ot_request_audit(event_plan_id, created_at, id) where event_plan_id is not null;
create index if not exists ot_requester_access_audit_access_idx
on public.ot_requester_access_audit(requester_access_id, created_at desc, id);
create unique index if not exists ot_audit_idempotency_uidx
on public.ot_request_audit(
  actor_user_id,
  action,
  idempotency_key,
  (coalesce(request_id, event_plan_id, '00000000-0000-0000-0000-000000000000'::uuid))
);
create index if not exists ot_event_plans_approver_idx
on public.ot_event_plans(approver_user_id, planned_start_at desc);

insert into public.ot_system_roles (user_id, role_code, active)
select u.id, 'owner', true
from public.users u
where pg_catalog.lower(pg_catalog.btrim(u.email)) = 'panuwee.w@garena.com'
on conflict (user_id) do update
set role_code = excluded.role_code,
    active = excluded.active;

insert into public.ot_approvers (user_id, active)
select u.id, true
from public.users u
where pg_catalog.lower(pg_catalog.btrim(u.email)) in (
  'panuwee.w@garena.com',
  'nithidol.k@garena.com',
  'weerayut@garena.com',
  'napol.a@garena.com'
)
on conflict (user_id) do nothing;

create or replace function public.ot_require_current_user()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null or not exists (
    select 1
    from public.users u
    where u.id = v_actor_id
      and u.is_active = true
      and pg_catalog.lower(pg_catalog.btrim(u.email)) like '%@garena.com'
  ) then
    raise exception 'Active Garena Workgrid sign-in required';
  end if;
  return v_actor_id;
end
$function$;

create or replace function public.ot_assert_reason(
  p_reason_code text,
  p_reason_detail text
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  v_reason_code text := nullif(pg_catalog.btrim(p_reason_code), '');
  v_reason_detail text := nullif(pg_catalog.btrim(p_reason_detail), '');
begin
  if v_reason_code is null or v_reason_code not in (
    'offline_event', 'campaign_launch', 'live_incident', 'capacity',
    'external_schedule', 'rework', 'scope_change', 'travel_offsite', 'other'
  ) then
    raise exception 'OT reason code is invalid';
  end if;
  if v_reason_code in ('other', 'live_incident', 'rework', 'scope_change')
     and v_reason_detail is null then
    raise exception 'OT reason detail is required for the selected reason code';
  end if;
end
$function$;

create or replace function public.ot_assert_consent_version(
  p_consent_statement_version text
)
returns void
language plpgsql
immutable
security definer
set search_path = ''
as $function$
begin
  if nullif(pg_catalog.btrim(p_consent_statement_version), '') is distinct from '2026-08-07' then
    raise exception 'Consent statement version must be 2026-08-07';
  end if;
end
$function$;

drop function if exists public.ot_record_consent(uuid, boolean, uuid);

create or replace function public.ot_record_consent(
  p_request_id uuid,
  p_accept boolean,
  p_consent_statement_version text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_request public.ot_requests;
  v_old_status text;
  v_counted_segments jsonb;
  v_consent_statement_version text := nullif(pg_catalog.btrim(p_consent_statement_version), '');
begin
  perform public.ot_require_current_requester_access();
  perform public.ot_lock_idempotency('record_consent', p_idempotency_key);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ot-request:' || p_request_id::text, 2)
  );
  if p_accept is null then
    raise exception 'Consent choice is required';
  end if;
  if v_consent_statement_version is null then
    raise exception 'Consent statement version is required';
  end if;
  perform public.ot_assert_consent_version(v_consent_statement_version);
  select * into v_request from public.ot_requests r where r.id = p_request_id;
  if not found or v_request.employee_user_id <> v_actor_id then
    raise exception 'Only the assigned employee can record consent for this occurrence';
  end if;
  if exists (
    select 1 from public.ot_request_audit a
    where a.request_id = p_request_id and a.actor_user_id = v_actor_id
      and a.action = 'record_consent' and a.idempotency_key = p_idempotency_key
  ) then
    return pg_catalog.to_jsonb(v_request);
  end if;
  if v_request.source <> 'event_plan'
     or v_request.employee_consent is not null
     or v_request.status not in ('awaiting_consent', 'pending_actual_verification', 'compliance_review_required') then
    raise exception 'Consent is available only once for an unconsented event occurrence';
  end if;
  v_counted_segments := case
    when v_request.actual_submitted_at is not null and v_request.actual_week_segments is not null
      then v_request.actual_week_segments
    else v_request.planned_week_segments
  end;
  perform public.ot_lock_employee_weeks(v_request.employee_user_id, v_counted_segments);
  select * into v_request from public.ot_requests r where r.id = p_request_id for update;
  if v_request.employee_consent is not null
     or v_request.status not in ('awaiting_consent', 'pending_actual_verification', 'compliance_review_required') then
    raise exception 'Consent state changed; reload this occurrence';
  end if;
  v_old_status := v_request.status;
  if p_accept then
    perform public.ot_assert_planned_limit(v_request.employee_user_id, v_counted_segments, v_request.id);
    if p_accept and v_request.planned_start_at <= pg_catalog.clock_timestamp() then
      raise exception 'Planned OT start must remain in the future for consent acceptance';
    end if;
    update public.ot_requests
    set employee_consent = 'accepted',
        consent_statement_version = v_consent_statement_version,
        employee_consented_at = now(),
        status = case
          when actual_submitted_at is not null and compliance_required then 'compliance_review_required'
          when actual_submitted_at is not null then 'pending_actual_verification'
          else 'approved'
        end,
        updated_at = now()
    where id = p_request_id returning * into v_request;
  else
    update public.ot_requests
    set employee_consent = 'declined',
        consent_statement_version = v_consent_statement_version,
        employee_consented_at = now(),
        status = case
          when actual_submitted_at is not null and compliance_required then 'compliance_review_required'
          else 'rejected'
        end,
        updated_at = now()
    where id = p_request_id returning * into v_request;
  end if;
  insert into public.ot_request_audit (
    request_id, event_plan_id, actor_user_id, action, old_status, new_status,
    changed_fields, idempotency_key
  ) values (
    v_request.id, v_request.event_plan_id, v_actor_id, 'record_consent',
    v_old_status, v_request.status,
    pg_catalog.jsonb_build_object(
      'accepted', p_accept,
      'consentStatementVersion', v_consent_statement_version,
      'employeeConsentedAt', v_request.employee_consented_at
    ),
    p_idempotency_key
  );
  return pg_catalog.to_jsonb(v_request);
end
$function$;

create or replace function public.ot_review_plan(
  p_request_id uuid,
  p_decision text,
  p_note text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_notification_id uuid;
  v_result jsonb;
begin
  select n.id into v_notification_id
  from public.ot_seatalk_notifications n
  where n.request_id = p_request_id
    and n.notification_kind = 'plan_approval'
    and n.status in ('pending', 'dispatching', 'sent', 'failed')
  for update;

  v_result := public.ot_apply_plan_review(
    p_request_id,
    p_decision,
    p_note,
    p_idempotency_key,
    v_actor_id
  );
  update public.ot_seatalk_notifications
  set status = 'cancelled',
      lease_expires_at = null,
      updated_at = now()
  where id = v_notification_id
    and status in ('pending', 'dispatching', 'sent', 'failed');
  update public.ot_seatalk_pending_rejections
  set status = 'cancelled',
      updated_at = now()
  where notification_id = v_notification_id
    and status = 'pending';
  return v_result;
end
$function$;

create or replace function public.ot_submit_actual(
  p_request_id uuid,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_request public.ot_requests;
  v_old_status text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_break_minutes integer;
  v_minutes integer;
  v_segments jsonb;
  v_lock_segments jsonb;
  v_segment jsonb;
  v_week date;
  v_total integer;
  v_over_limit boolean := false;
  v_variance_minutes integer;
  v_variance_reason text;
begin
  perform public.ot_require_current_requester_access();
  perform public.ot_lock_idempotency('submit_actual', p_idempotency_key);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ot-request:' || p_request_id::text, 2)
  );
  select * into v_request from public.ot_requests r where r.id = p_request_id;
  if not found or v_request.employee_user_id <> v_actor_id then
    raise exception 'Only the assigned employee can submit truthful actual OT';
  end if;
  if exists (
    select 1 from public.ot_request_audit a
    where a.request_id = p_request_id and a.actor_user_id = v_actor_id
      and a.action = 'submit_actual' and a.idempotency_key = p_idempotency_key
  ) then
    return pg_catalog.to_jsonb(v_request);
  end if;
  if v_request.status in ('cancelled', 'exported', 'hr_ready') then
    raise exception 'Actual OT cannot be changed after cancellation, HR readiness, or export';
  end if;
  v_start_at := coalesce(p_payload->>'actualStartAt', p_payload->>'actual_start_at')::timestamptz;
  v_end_at := coalesce(p_payload->>'actualEndAt', p_payload->>'actual_end_at')::timestamptz;
  v_break_minutes := coalesce(coalesce(p_payload->>'actualBreakMinutes', p_payload->>'actual_break_minutes')::integer, 0);
  v_minutes := public.ot_calculate_occurrence_minutes(v_start_at, v_end_at, v_break_minutes);
  v_variance_reason := nullif(pg_catalog.btrim(coalesce(
    p_payload->>'actualVarianceReason',
    p_payload->>'actual_variance_reason',
    p_payload->>'varianceReason'
  )), '');
  v_segments := public.ot_build_week_segments(
    v_start_at, v_end_at, v_break_minutes,
    coalesce(p_payload->'actualWeekSegments', p_payload->'actual_week_segments')
  );
  with affected_weeks as (
    select (coalesce(item->>'weekStart', item->>'week_start'))::date as week_start
    from pg_catalog.jsonb_array_elements(v_request.planned_week_segments) item
    union
    select (coalesce(item->>'weekStart', item->>'week_start'))::date as week_start
    from pg_catalog.jsonb_array_elements(coalesce(v_request.actual_week_segments, '[]'::jsonb)) item
    union
    select (coalesce(item->>'weekStart', item->>'week_start'))::date as week_start
    from pg_catalog.jsonb_array_elements(v_segments) item
  )
  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('weekStart', week_start, 'minutes', 1)
    order by week_start
  )
  into v_lock_segments
  from affected_weeks;
  perform public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments);
  select * into v_request from public.ot_requests r where r.id = p_request_id for update;
  if not (
    (
      (v_request.source = 'employee_request' and v_request.plan_decision = 'approved')
      or
      (v_request.source = 'event_plan' and v_request.employee_consent = 'accepted')
    )
    and v_request.planned_end_at <= now()
    and v_end_at <= now()
    and (
      (
        v_request.status in ('approved', 'actual_confirmation_required')
        and v_request.actual_submitted_at is null
        and v_request.actual_decision is null
      )
      or
      (
        v_request.status = 'revision_required'
        and v_request.actual_decision = 'revision_required'
      )
    )
  ) then
    raise exception 'Actual OT can be submitted only after authorization and completed work, or after an audited revision request';
  end if;
  perform public.ot_assert_reason(v_request.reason_code, v_request.reason_detail);
  perform public.ot_assert_consent_version(v_request.consent_statement_version);
  perform public.ot_assert_no_employee_overlap(v_request.employee_user_id, v_start_at, v_end_at, p_request_id);
  v_variance_minutes := pg_catalog.abs(v_minutes - v_request.planned_minutes);
  if v_variance_minutes > 30 and v_variance_reason is null then
    raise exception 'Actual variance reason is required when actual net minutes differ from planned net minutes by more than 30';
  end if;
  for v_segment in select item from pg_catalog.jsonb_array_elements(v_segments) item
  loop
    v_week := (v_segment->>'weekStart')::date;
    v_total := public.ot_counted_week_minutes_unchecked(v_request.employee_user_id, v_week, v_request.id)
      + (v_segment->>'minutes')::integer;
    if v_total > 2160 then
      v_over_limit := true;
    end if;
  end loop;
  v_old_status := v_request.status;
  update public.ot_requests
  set request_type = 'actual',
      actual_start_at = v_start_at,
      actual_end_at = v_end_at,
      actual_break_minutes = v_break_minutes,
      actual_minutes = v_minutes,
      actual_week_segments = v_segments,
      actual_variance_reason = v_variance_reason,
      actual_submitted_at = now(),
      actual_decision = null,
      actual_decision_note = null,
      actual_verified_by_user_id = null,
      actual_verified_at = null,
      compliance_required = v_over_limit,
      compliance_outcome = null,
      compliance_note = null,
      compliance_reviewed_by_user_id = null,
      compliance_reviewed_at = null,
      hr_ready_at = null,
      status = case
        when v_over_limit then 'compliance_review_required'
        else 'pending_actual_verification'
      end,
      updated_at = now()
  where id = p_request_id returning * into v_request;
  insert into public.ot_request_audit (
    request_id, event_plan_id, actor_user_id, action, old_status, new_status,
    changed_fields, note, idempotency_key
  ) values (
    v_request.id, v_request.event_plan_id, v_actor_id, 'submit_actual',
    v_old_status, v_request.status,
    pg_catalog.jsonb_build_object(
      'actualStartAt', v_start_at, 'actualEndAt', v_end_at,
      'actualBreakMinutes', v_break_minutes, 'actualMinutes', v_minutes,
      'actualVarianceMinutes', v_variance_minutes,
      'actualVarianceReason', v_variance_reason,
      'weekSegments', v_segments, 'complianceRequired', v_over_limit
    ),
    case when v_over_limit then 'Truthful actual recorded above 36 hours; compliance review is required before HR readiness' else null end,
    p_idempotency_key
  );
  perform public.ot_enqueue_seatalk_notification(v_request.id, 'actual_verification');
  return pg_catalog.to_jsonb(v_request);
end
$function$;

create or replace function public.ot_verify_actual(
  p_request_id uuid,
  p_decision text,
  p_note text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_request public.ot_requests;
  v_old_status text;
  v_new_status text;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
begin
  perform public.ot_lock_idempotency('verify_actual', p_idempotency_key);
  select * into v_request from public.ot_requests r where r.id = p_request_id;
  if not found or v_request.approver_user_id <> v_actor_id or not public.ot_current_user_is_eligible_approver() then
    raise exception 'Only the assigned active OT approver can verify actual OT';
  end if;
  if exists (
    select 1 from public.ot_request_audit a
    where a.request_id = p_request_id and a.actor_user_id = v_actor_id
      and a.action = 'verify_actual' and a.idempotency_key = p_idempotency_key
  ) then
    return pg_catalog.to_jsonb(v_request);
  end if;
  if v_request.status not in ('pending_actual_verification', 'compliance_review_required')
     or v_request.actual_decision is not null then
    raise exception 'Actual OT is not awaiting approver verification';
  end if;
  if v_request.source = 'event_plan'
     and v_request.employee_consent is distinct from 'accepted' then
    raise exception 'Employee consent must be accepted before actual OT verification';
  end if;
  if v_request.actual_submitted_at is null or v_request.actual_week_segments is null then
    raise exception 'Actual OT must be submitted before verification';
  end if;
  if p_decision not in ('approved', 'rejected', 'revision_required') then
    raise exception 'Actual decision must be approved, rejected, or revision_required';
  end if;
  perform 1
  from public.ot_approvers a
  where a.user_id = v_actor_id
  for key share of a;
  perform public.ot_lock_employee_weeks(v_request.employee_user_id, v_request.actual_week_segments);
  select * into v_request from public.ot_requests r where r.id = p_request_id for update;
  if v_request.approver_user_id <> v_actor_id
     or not public.ot_current_user_is_eligible_approver() then
    raise exception 'Actual OT assignment or approver access changed; reload this request';
  end if;
  if v_request.status not in ('pending_actual_verification', 'compliance_review_required')
     or v_request.actual_decision is not null then
    raise exception 'Actual OT state changed and is no longer awaiting verification';
  end if;
  if v_request.source = 'event_plan'
     and v_request.employee_consent is distinct from 'accepted' then
    raise exception 'Employee consent state changed before actual OT verification';
  end if;
  if v_request.actual_submitted_at is null or v_request.actual_week_segments is null then
    raise exception 'Actual OT state changed; reload this request';
  end if;
  if p_decision in ('rejected', 'revision_required') and v_note is null then
    raise exception 'Actual decision note is required for rejection or revision';
  end if;
  if p_decision = 'approved' and v_request.compliance_required and v_note is null then
    raise exception 'Actual decision note is required for a compliance-required approval';
  end if;
  if p_decision = 'approved' then
    v_new_status := 'hr_ready';
  else
    v_new_status := p_decision;
  end if;
  v_old_status := v_request.status;
  update public.ot_requests
  set actual_decision = p_decision,
      actual_decision_note = v_note,
      actual_verified_by_user_id = v_actor_id,
      actual_verified_at = now(),
      hr_ready_at = case when v_new_status = 'hr_ready' then now() else null end,
      status = v_new_status,
      updated_at = now()
  where id = p_request_id returning * into v_request;
  insert into public.ot_request_audit (
    request_id, event_plan_id, actor_user_id, action, old_status, new_status,
    changed_fields, note, idempotency_key
  ) values (
    v_request.id, v_request.event_plan_id, v_actor_id, 'verify_actual',
    v_old_status, v_request.status,
    pg_catalog.jsonb_build_object('decision', p_decision, 'complianceRequired', v_request.compliance_required),
    v_note, p_idempotency_key
  );
  return pg_catalog.to_jsonb(v_request);
end
$function$;

create or replace function public.ot_request_actual_amendment(
  p_request_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_request public.ot_requests;
  v_old_status text;
  v_previous_actual_decision text;
  v_previous_compliance_outcome text;
  v_previous_hr_ready_at timestamptz;
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_replay_result jsonb;
begin
  if not public.ot_current_user_is_owner()
     and not (
       public.ot_current_user_is_hr_admin()
       and public.ot_user_is_approved_approver_identity(v_actor_id)
     ) then
    raise exception 'Only the OT Owner or an approved active HR Admin can request an actual amendment';
  end if;
  if v_reason is null then
    raise exception 'Actual amendment reason is required';
  end if;
  perform public.ot_lock_idempotency('request_actual_amendment', p_idempotency_key);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ot-request:' || p_request_id::text, 2)
  );
  select * into v_request from public.ot_requests r where r.id = p_request_id;
  if not found then
    raise exception 'OT request not found';
  end if;
  select a.changed_fields->'result' into v_replay_result
  from public.ot_request_audit a
  where a.request_id = p_request_id
    and a.actor_user_id = v_actor_id
    and a.action = 'request_actual_amendment'
    and a.idempotency_key = p_idempotency_key;
  if found then
    return v_replay_result;
  end if;

  perform public.ot_lock_employee_weeks(v_request.employee_user_id, v_request.actual_week_segments);
  select * into v_request from public.ot_requests r where r.id = p_request_id for update;
  if v_request.status = 'exported'
     or v_request.exported_at is not null
     or v_request.export_batch_id is not null then
    raise exception 'Exported OT cannot be reopened for amendment';
  end if;
  if v_request.status = 'revision_required'
     or v_request.actual_decision = 'revision_required' then
    raise exception 'This OT request is already awaiting an actual revision';
  end if;
  if v_request.actual_submitted_at is null
     or v_request.actual_week_segments is null
     or v_request.actual_decision is distinct from 'approved'
     or v_request.actual_verified_by_user_id is null
     or v_request.actual_verified_at is null then
    raise exception 'Only an already submitted and manager-approved actual can be amended';
  end if;

  v_old_status := v_request.status;
  v_previous_actual_decision := v_request.actual_decision;
  v_previous_compliance_outcome := v_request.compliance_outcome;
  v_previous_hr_ready_at := v_request.hr_ready_at;
  update public.ot_requests
  set actual_decision = 'revision_required',
      actual_decision_note = v_reason,
      actual_verified_by_user_id = null,
      actual_verified_at = null,
      compliance_outcome = null,
      compliance_note = null,
      compliance_reviewed_by_user_id = null,
      compliance_reviewed_at = null,
      hr_ready_at = null,
      status = 'revision_required',
      updated_at = now()
  where id = p_request_id returning * into v_request;
  insert into public.ot_request_audit (
    request_id, event_plan_id, actor_user_id, action, old_status, new_status,
    changed_fields, note, idempotency_key
  ) values (
    v_request.id, v_request.event_plan_id, v_actor_id, 'request_actual_amendment',
    v_old_status, v_request.status,
    pg_catalog.jsonb_build_object(
      'previousActualDecision', v_previous_actual_decision,
      'previousComplianceOutcome', v_previous_compliance_outcome,
      'previousHrReadyAt', v_previous_hr_ready_at,
      'requesterUserId', v_actor_id,
      'reason', v_reason,
      'result', pg_catalog.to_jsonb(v_request)
    ),
    v_reason, p_idempotency_key
  );
  return pg_catalog.to_jsonb(v_request);
end
$function$;


create or replace function public.ot_user_is_approved_approver_identity(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and pg_catalog.lower(pg_catalog.btrim(u.email)) in (
        'panuwee.w@garena.com',
        'nithidol.k@garena.com',
        'weerayut@garena.com',
        'napol.a@garena.com'
      )
  );
$function$;

create or replace function public.ot_function_approver_id(p_function_code text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  -- Production SeaTalk routing: each Function is assigned to its approved Team Lead.
  v_email text := case p_function_code
    when 'ops' then 'nithidol.k@garena.com'
    when 'mkt' then 'weerayut@garena.com'
    when 'gdve' then 'weerayut@garena.com'
    when 'esport' then 'napol.a@garena.com'
    else null
  end;
  v_approver_id uuid;
begin
  if v_email is null then
    raise exception 'Unsupported OT function code';
  end if;

  select u.id into v_approver_id
  from public.users u
  join public.ot_approvers a on a.user_id = u.id and a.active = true
  where pg_catalog.lower(pg_catalog.btrim(u.email)) = v_email
    and u.is_active = true
    and public.ot_user_is_approved_approver_identity(u.id)
  order by u.id
  limit 1;

  if v_approver_id is null then
    raise exception 'The routed OT approver is not active and approved';
  end if;
  return v_approver_id;
end
$function$;

create or replace function public.ot_enqueue_seatalk_notification(
  p_request_id uuid,
  p_notification_kind text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_notification_id uuid;
begin
  if p_notification_kind is null
     or p_notification_kind not in ('plan_approval', 'actual_verification') then
    raise exception 'Unsupported OT SeaTalk notification kind';
  end if;

  insert into public.ot_seatalk_notifications (
    request_id, notification_kind, status, attempt_count, dispatch_key,
    lease_expires_at, last_error, updated_at
  ) values (
    p_request_id, p_notification_kind, 'pending', 0, null, null, null, now()
  )
  on conflict (request_id, notification_kind) do update
  set status = 'pending',
      attempt_count = 0,
      seatalk_message_id = null,
      dispatch_key = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = now()
  returning id into v_notification_id;

  return v_notification_id;
end
$function$;

create or replace function public.ot_is_service_role_context()
returns boolean
language sql
stable
set search_path = ''
as $function$
  select
    (select auth.uid()) is null
    and coalesce(
      nullif(pg_catalog.current_setting('request.jwt.claim.role', true), ''),
      ''
    ) = 'service_role';
$function$;

create or replace function public.ot_seatalk_claim_dispatch(
  p_request_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_notification public.ot_seatalk_notifications;
  v_request public.ot_requests;
  v_recipient_email text;
  v_recipient_display_name text;
  v_employee_email text;
  v_employee_display_name text;
  v_dispatch_key uuid;
  v_lease_expires_at timestamptz;
begin
  if p_request_id is null or p_actor_id is null then
    raise exception 'SeaTalk OT dispatch claim requires request and actor identifiers';
  end if;

  select n.* into v_notification
  from public.ot_seatalk_notifications n
  join public.ot_requests r on r.id = n.request_id
  where n.request_id = p_request_id
    and (
      (n.notification_kind = 'plan_approval'
        and r.source = 'employee_request'
        and r.status = 'pending_approval')
      or
      (n.notification_kind = 'actual_verification'
        and r.actual_submitted_at is not null
        and r.status in ('pending_actual_verification', 'compliance_review_required'))
    )
  for update of n;
  if not found then
    raise exception 'SeaTalk OT notification not found';
  end if;

  select * into v_request
  from public.ot_requests r
  where r.id = v_notification.request_id
  for key share of r;
  if not found then
    raise exception 'SeaTalk OT request not found';
  end if;
  if not exists (
    select 1
    from public.users u
    where u.id = p_actor_id
      and u.is_active = true
      and pg_catalog.lower(pg_catalog.btrim(u.email)) like '%@garena.com'
  ) then
    raise exception 'Active Garena Workgrid actor required for SeaTalk dispatch';
  end if;
  if v_request.created_by_user_id <> p_actor_id
     and v_request.approver_user_id <> p_actor_id then
    raise exception 'Only the request creator or assigned approver can dispatch this OT card';
  end if;
  if not (
    (v_notification.notification_kind = 'plan_approval'
      and v_request.source = 'employee_request'
      and v_request.status = 'pending_approval')
    or
    (v_notification.notification_kind = 'actual_verification'
      and v_request.actual_submitted_at is not null
      and v_request.status in ('pending_actual_verification', 'compliance_review_required'))
  ) then
    return pg_catalog.jsonb_build_object(
      'claimed', false,
      'status', v_notification.status
    );
  end if;
  if not (
    v_notification.status in ('pending', 'failed')
    or (
      v_notification.status = 'dispatching'
      and v_notification.lease_expires_at <= pg_catalog.clock_timestamp()
    )
  ) then
    return pg_catalog.jsonb_build_object(
      'claimed', false,
      'status', v_notification.status,
      'leaseExpiresAt', v_notification.lease_expires_at
    );
  end if;

  select
    pg_catalog.lower(pg_catalog.btrim(recipient.email)),
    recipient.display_name,
    pg_catalog.lower(pg_catalog.btrim(employee.email)),
    employee.display_name
  into
    v_recipient_email,
    v_recipient_display_name,
    v_employee_email,
    v_employee_display_name
  from public.users recipient
  join public.ot_approvers approver
    on approver.user_id = recipient.id
   and approver.active = true
  join public.users employee
    on employee.id = v_request.employee_user_id
  where recipient.id = v_request.approver_user_id
    and recipient.is_active = true
    and employee.is_active = true
    and public.ot_user_is_approved_approver_identity(recipient.id);
  if not found then
    raise exception 'The assigned SeaTalk OT recipient is not active and approved';
  end if;

  v_dispatch_key := gen_random_uuid();
  v_lease_expires_at := pg_catalog.clock_timestamp() + interval '5 minutes';
  update public.ot_seatalk_notifications
  set status = 'dispatching',
      attempt_count = attempt_count + 1,
      dispatch_key = v_dispatch_key,
      lease_expires_at = v_lease_expires_at,
      last_error = null,
      updated_at = now()
  where id = v_notification.id;

  return pg_catalog.jsonb_build_object(
    'claimed', true,
    'notificationId', v_notification.id,
    'dispatchKey', v_dispatch_key,
    'leaseExpiresAt', v_lease_expires_at,
    'notificationKind', v_notification.notification_kind,
    'recipientEmail', v_recipient_email,
    'recipientDisplayName', v_recipient_display_name,
    'requestId', v_request.id,
    'employeeEmail', v_employee_email,
    'employeeDisplayName', v_employee_display_name,
    'functionCode', v_request.function_code,
    'title', v_request.title,
    'dayType', v_request.day_type,
    'workLocationType', v_request.work_location_type,
    'venue', v_request.venue,
    'reasonCode', v_request.reason_code,
    'reasonDetail', v_request.reason_detail,
    'plannedStartAt', v_request.planned_start_at,
    'plannedEndAt', v_request.planned_end_at,
    'plannedBreakMinutes', v_request.planned_break_minutes,
    'plannedMinutes', v_request.planned_minutes,
    'actualStartAt', v_request.actual_start_at,
    'actualEndAt', v_request.actual_end_at
  );
end
$function$;

create or replace function public.ot_seatalk_finish_dispatch(
  p_dispatch_key uuid,
  p_succeeded boolean,
  p_seatalk_message_id text,
  p_error text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
  v_message_id text := nullif(pg_catalog.btrim(coalesce(p_seatalk_message_id, '')), '');
  v_error text := pg_catalog.left(nullif(pg_catalog.btrim(coalesce(p_error, '')), ''), 1000);
  v_expected_error text;
  v_stored_message_id text;
  v_stored_error text;
begin
  if p_dispatch_key is null or p_succeeded is null then
    raise exception 'SeaTalk OT dispatch result requires a dispatch key and outcome';
  end if;
  if p_succeeded and v_message_id is null then
    raise exception 'Successful SeaTalk dispatch requires a message identifier';
  end if;
  v_expected_error := coalesce(v_error, 'SeaTalk delivery failed');

  update public.ot_seatalk_notifications
  set status = case when p_succeeded then 'sent' else 'failed' end,
      seatalk_message_id = case when p_succeeded then v_message_id else null end,
      lease_expires_at = null,
      last_error = case when p_succeeded then null else v_expected_error end,
      updated_at = now()
  where dispatch_key = p_dispatch_key
    and status = 'dispatching'
  returning status into v_status;
  if found then
    return pg_catalog.jsonb_build_object(
      'finalized', true,
      'replayed', false,
      'status', v_status
    );
  end if;

  select n.status, n.seatalk_message_id, n.last_error
  into v_status, v_stored_message_id, v_stored_error
  from public.ot_seatalk_notifications n
  where n.status in ('sent', 'failed')
    and n.dispatch_key = p_dispatch_key;
  if found then
    if v_status <> (case when p_succeeded then 'sent' else 'failed' end) then
      raise exception 'SeaTalk OT dispatch result conflicts with the stored outcome';
    end if;
    if p_succeeded and v_stored_message_id is distinct from v_message_id then
      raise exception 'SeaTalk OT dispatch result conflicts with the stored message identifier';
    end if;
    if not p_succeeded and v_stored_error is distinct from v_expected_error then
      raise exception 'SeaTalk OT dispatch result conflicts with the stored failure detail';
    end if;
    return pg_catalog.jsonb_build_object(
      'finalized', true,
      'replayed', true,
      'status', v_status
    );
  end if;

  select n.status into v_status
  from public.ot_seatalk_notifications n
  where n.dispatch_key = p_dispatch_key;
  return pg_catalog.jsonb_build_object(
    'finalized', false,
    'replayed', false,
    'status', coalesce(v_status, 'stale')
  );
end
$function$;

create or replace function public.ot_seatalk_begin_rejection(
  p_notification_id uuid,
  p_sender_email text,
  p_event_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sender_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_sender_email, ''))), '');
  v_notification public.ot_seatalk_notifications;
  v_action public.ot_seatalk_pending_rejections;
  v_approver_email text;
  v_expires_at timestamptz;
begin
  if p_notification_id is null or v_sender_email is null or p_event_idempotency_key is null then
    raise exception 'SeaTalk OT rejection begin requires notification, sender, and event identifiers';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ot-seatalk-rejection:' || v_sender_email, 3)
  );

  select n.* into v_notification
  from public.ot_seatalk_notifications n
  where n.id = p_notification_id
    and n.notification_kind = 'plan_approval'
  for update of n;
  if not found then
    raise exception 'SeaTalk OT notification not found';
  end if;

  select pg_catalog.lower(pg_catalog.btrim(u.email))
  into v_approver_email
  from public.ot_requests r
  join public.users u on u.id = r.approver_user_id
  join public.ot_approvers a on a.user_id = u.id and a.active = true
  where r.id = v_notification.request_id
    and u.is_active = true
    and public.ot_user_is_approved_approver_identity(u.id);
  if v_approver_email is null or v_sender_email is distinct from v_approver_email then
    raise exception 'SeaTalk sender is not the assigned OT approver';
  end if;

  select a.* into v_action
  from public.ot_seatalk_pending_rejections a
  where a.notification_id = v_notification.id
  for update of a;
  if found then
    if v_action.sender_email is distinct from v_sender_email then
      if v_action.status = 'applied' then
        raise exception 'SeaTalk OT notification already has an applied rejection';
      end if;
      update public.ot_seatalk_pending_rejections
      set status = 'cancelled',
          updated_at = now()
      where id = v_action.id;
    else
      if v_action.status = 'applied' then
        return pg_catalog.jsonb_build_object(
          'pendingActionId', v_action.id,
          'notificationId', v_action.notification_id,
          'status', v_action.status,
          'result', v_action.result
        );
      end if;
      if v_action.status = 'pending'
         and v_action.expires_at > pg_catalog.clock_timestamp() then
        return pg_catalog.jsonb_build_object(
          'pendingActionId', v_action.id,
          'notificationId', v_action.notification_id,
          'status', v_action.status,
          'expiresAt', v_action.expires_at
        );
      end if;
      if v_action.begin_event_idempotency_key = p_event_idempotency_key then
        raise exception 'SeaTalk OT rejection begin event is no longer active';
      end if;
    end if;
  end if;
  if v_notification.status not in ('dispatching', 'sent', 'failed') then
    raise exception 'SeaTalk OT notification is not available for rejection';
  end if;

  update public.ot_seatalk_pending_rejections
  set status = 'expired',
      updated_at = now()
  where sender_email = v_sender_email
    and status = 'pending'
    and expires_at <= pg_catalog.clock_timestamp();
  if exists (
    select 1
    from public.ot_seatalk_pending_rejections a
    where a.sender_email = v_sender_email
      and a.status = 'pending'
      and a.notification_id <> v_notification.id
      and a.expires_at > pg_catalog.clock_timestamp()
  ) then
    raise exception 'Complete the existing SeaTalk OT rejection before starting another';
  end if;

  v_expires_at := pg_catalog.clock_timestamp() + interval '10 minutes';
  insert into public.ot_seatalk_pending_rejections (
    notification_id, sender_email, begin_event_idempotency_key,
    apply_event_idempotency_key, status, expires_at, result,
    consumed_at, created_at, updated_at
  ) values (
    v_notification.id, v_sender_email, p_event_idempotency_key,
    null, 'pending', v_expires_at, null,
    null, now(), now()
  )
  on conflict (notification_id) do update
  set sender_email = excluded.sender_email,
      begin_event_idempotency_key = excluded.begin_event_idempotency_key,
      apply_event_idempotency_key = null,
      status = 'pending',
      expires_at = excluded.expires_at,
      result = null,
      consumed_at = null,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
  returning * into v_action;

  return pg_catalog.jsonb_build_object(
    'pendingActionId', v_action.id,
    'notificationId', v_action.notification_id,
    'status', v_action.status,
    'expiresAt', v_action.expires_at
  );
end
$function$;

create or replace function public.ot_seatalk_apply_rejection_reason(
  p_sender_email text,
  p_reason text,
  p_event_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sender_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_sender_email, ''))), '');
  v_reason text := nullif(pg_catalog.btrim(coalesce(p_reason, '')), '');
  v_action_id uuid;
  v_notification_id uuid;
  v_action public.ot_seatalk_pending_rejections;
  v_notification public.ot_seatalk_notifications;
  v_approver_user_id uuid;
  v_approver_email text;
  v_result jsonb;
begin
  if v_sender_email is null or v_reason is null or p_event_idempotency_key is null then
    raise exception 'SeaTalk OT rejection reason requires the same sender, a reason, and an event identifier';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ot-seatalk-rejection:' || v_sender_email, 3)
  );

  select a.result into v_result
  from public.ot_seatalk_pending_rejections a
  where a.sender_email = v_sender_email
    and a.status = 'applied'
    and a.apply_event_idempotency_key = p_event_idempotency_key;
  if found then
    return v_result;
  end if;

  select a.id, a.notification_id
  into v_action_id, v_notification_id
  from public.ot_seatalk_pending_rejections a
  where a.sender_email = v_sender_email
    and a.status = 'pending'
    and a.expires_at > pg_catalog.clock_timestamp()
  order by a.updated_at desc
  limit 1;
  if not found then
    raise exception 'No active SeaTalk OT rejection is waiting for this sender';
  end if;

  select n.* into v_notification
  from public.ot_seatalk_notifications n
  where n.id = v_notification_id
  for update of n;
  select a.* into v_action
  from public.ot_seatalk_pending_rejections a
  where a.id = v_action_id
  for update of a;
  if not found or v_action.sender_email is distinct from v_sender_email then
    raise exception 'SeaTalk rejection sender does not match the pending action';
  end if;
  if v_action.status <> 'pending'
     or v_action.expires_at <= pg_catalog.clock_timestamp() then
    raise exception 'SeaTalk OT rejection reason window has expired';
  end if;
  if v_notification.notification_kind <> 'plan_approval'
     or v_notification.status not in ('dispatching', 'sent', 'failed') then
    raise exception 'SeaTalk OT notification is not available for rejection';
  end if;

  select r.approver_user_id, pg_catalog.lower(pg_catalog.btrim(u.email))
  into v_approver_user_id, v_approver_email
  from public.ot_requests r
  join public.users u on u.id = r.approver_user_id
  join public.ot_approvers a on a.user_id = u.id and a.active = true
  where r.id = v_notification.request_id
    and u.is_active = true
    and public.ot_user_is_approved_approver_identity(u.id);
  if v_approver_user_id is null or v_sender_email is distinct from v_approver_email then
    raise exception 'SeaTalk sender is not the assigned OT approver';
  end if;

  v_result := public.ot_apply_plan_review(
    v_notification.request_id,
    'rejected',
    v_reason,
    p_event_idempotency_key,
    v_approver_user_id
  );
  update public.ot_seatalk_notifications
  set status = 'applied',
      lease_expires_at = null,
      updated_at = now()
  where id = v_notification.id
    and status in ('dispatching', 'sent', 'failed');
  update public.ot_seatalk_pending_rejections
  set status = 'applied',
      apply_event_idempotency_key = p_event_idempotency_key,
      result = v_result,
      consumed_at = now(),
      updated_at = now()
  where id = v_action.id;
  return v_result;
end
$function$;

create or replace function public.ot_apply_plan_review(
  p_request_id uuid,
  p_decision text,
  p_note text,
  p_idempotency_key uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.ot_requests;
  v_old_status text;
  v_new_status text;
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
begin
  perform public.ot_lock_idempotency('review_plan', p_idempotency_key);
  select * into v_request from public.ot_requests r where r.id = p_request_id;
  if not found
     or v_request.approver_user_id <> p_actor_id
     or not exists (
       select 1
       from public.users u
       join public.ot_approvers a on a.user_id = u.id
       where u.id = p_actor_id
         and u.is_active = true
         and a.active = true
         and public.ot_user_is_approved_approver_identity(u.id)
     ) then
    raise exception 'Only the assigned active OT approver can review this plan';
  end if;
  if exists (
    select 1 from public.ot_request_audit a
    where a.request_id = p_request_id and a.actor_user_id = p_actor_id
      and a.action = 'review_plan' and a.idempotency_key = p_idempotency_key
  ) then
    return pg_catalog.to_jsonb(v_request);
  end if;
  if v_request.source <> 'employee_request' or v_request.status <> 'pending_approval' then
    raise exception 'This OT plan is not awaiting approver review';
  end if;
  if p_decision not in ('approved', 'rejected', 'revision_required') then
    raise exception 'Plan decision must be approved, rejected, or revision_required';
  end if;
  if p_decision in ('rejected', 'revision_required') and v_note is null then
    raise exception 'Plan decision note is required for rejection or revision';
  end if;
  perform 1
  from public.ot_approvers a
  where a.user_id = p_actor_id
  for key share of a;
  perform public.ot_lock_employee_weeks(v_request.employee_user_id, v_request.planned_week_segments);
  select * into v_request from public.ot_requests r where r.id = p_request_id for update;
  if v_request.approver_user_id <> p_actor_id
     or not exists (
       select 1
       from public.users u
       join public.ot_approvers a on a.user_id = u.id
       where u.id = p_actor_id
         and u.is_active = true
         and a.active = true
         and public.ot_user_is_approved_approver_identity(u.id)
     ) then
    raise exception 'Plan assignment or approver access changed; reload this request';
  end if;
  if v_request.status <> 'pending_approval' then
    raise exception 'Plan state changed; reload this request';
  end if;
  if p_decision = 'approved' then
    perform public.ot_assert_planned_limit(v_request.employee_user_id, v_request.planned_week_segments, v_request.id);
    v_new_status := 'approved';
  else
    v_new_status := p_decision;
  end if;
  v_old_status := v_request.status;
  if p_decision = 'approved' and v_request.planned_start_at <= pg_catalog.clock_timestamp() then
    raise exception 'Planned OT start must remain in the future for approval';
  end if;
  update public.ot_requests
  set plan_decision = p_decision,
      plan_decision_note = v_note,
      plan_reviewed_by_user_id = p_actor_id,
      plan_reviewed_at = now(),
      status = v_new_status,
      updated_at = now()
  where id = p_request_id returning * into v_request;
  insert into public.ot_request_audit (
    request_id, actor_user_id, action, old_status, new_status, changed_fields, note, idempotency_key
  ) values (
    v_request.id, p_actor_id, 'review_plan', v_old_status, v_request.status,
    pg_catalog.jsonb_build_object(
      'decision', p_decision,
      'result', pg_catalog.to_jsonb(v_request)
    ), v_note, p_idempotency_key
  );
  return pg_catalog.to_jsonb(v_request);
end
$function$;

create or replace function public.ot_current_user_is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users u
    join public.ot_system_roles r on r.user_id = u.id
    where u.id = (select auth.uid())
      and u.is_active = true
      and pg_catalog.lower(pg_catalog.btrim(u.email)) = 'panuwee.w@garena.com'
      and r.role_code = 'owner'
      and r.active = true
  );
$function$;

create or replace function public.ot_current_user_is_hr_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users u
    join public.ot_system_roles r on r.user_id = u.id
    where u.id = (select auth.uid())
      and u.is_active = true
      and public.ot_user_is_approved_approver_identity(u.id)
      and r.role_code = 'hr_admin'
      and r.active = true
  );
$function$;

create or replace function public.ot_current_user_is_eligible_approver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.users u
    join public.ot_approvers a on a.user_id = u.id
    where u.id = (select auth.uid())
      and u.is_active = true
      and public.ot_user_is_approved_approver_identity(u.id)
      and a.active = true
  );
$function$;

create or replace function public.ot_current_user_can_read_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.ot_requests r
    join public.users u on u.id = (select auth.uid()) and u.is_active = true
    where r.id = p_request_id
      and (
        r.employee_user_id = (select auth.uid())
        or (
          r.approver_user_id = (select auth.uid())
          and (select public.ot_current_user_is_eligible_approver())
        )
        or (select public.ot_current_user_is_owner())
        or (select public.ot_current_user_is_hr_admin())
      )
  );
$function$;

create or replace function public.ot_calculate_occurrence_minutes(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_break_minutes integer
)
returns integer
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  v_minutes integer;
begin
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'OT end time must follow start time';
  end if;
  if p_break_minutes is null or p_break_minutes < 0 then
    raise exception 'OT break minutes must be a non-negative whole number';
  end if;
  v_minutes := pg_catalog.floor(pg_catalog.date_part('epoch', p_end_at - p_start_at) / 60)::integer - p_break_minutes;
  if v_minutes <= 0 then
    raise exception 'OT duration must be greater than zero';
  end if;
  return v_minutes;
end
$function$;

create or replace function public.ot_week_start(p_at timestamptz)
returns date
language sql
immutable
set search_path = ''
as $function$
  select ((p_at at time zone 'Asia/Bangkok')::date
    - (pg_catalog.date_part('isodow', p_at at time zone 'Asia/Bangkok')::integer - 1));
$function$;

create or replace function public.ot_build_week_segments(
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_break_minutes integer,
  p_supplied_segments jsonb default null
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_total integer := public.ot_calculate_occurrence_minutes(p_start_at, p_end_at, p_break_minutes);
  v_first_week date := public.ot_week_start(p_start_at);
  v_last_week date := public.ot_week_start(p_end_at - interval '1 microsecond');
  v_boundary timestamptz;
  v_first_gross integer;
  v_last_gross integer;
  v_first_minutes integer;
  v_last_minutes integer;
begin
  if v_first_week = v_last_week then
    return pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', v_first_week, 'minutes', v_total));
  end if;
  if v_last_week <> v_first_week + 7 then
    raise exception 'OT occurrence may cross only one Bangkok workweek boundary';
  end if;
  if p_supplied_segments is null
     or pg_catalog.jsonb_typeof(p_supplied_segments) <> 'array'
     or pg_catalog.jsonb_array_length(p_supplied_segments) <> 2 then
    raise exception 'Break allocation is required across a Bangkok workweek boundary';
  end if;

  select (item->>'minutes')::integer
  into v_first_minutes
  from pg_catalog.jsonb_array_elements(p_supplied_segments) item
  where coalesce(item->>'weekStart', item->>'week_start') = v_first_week::text;
  select (item->>'minutes')::integer
  into v_last_minutes
  from pg_catalog.jsonb_array_elements(p_supplied_segments) item
  where coalesce(item->>'weekStart', item->>'week_start') = v_last_week::text;

  v_boundary := ((v_last_week::timestamp) at time zone 'Asia/Bangkok');
  v_first_gross := pg_catalog.floor(pg_catalog.date_part('epoch', v_boundary - p_start_at) / 60)::integer;
  v_last_gross := pg_catalog.floor(pg_catalog.date_part('epoch', p_end_at - v_boundary) / 60)::integer;
  if v_first_minutes is null or v_last_minutes is null
     or v_first_minutes <= 0 or v_last_minutes <= 0
     or v_first_minutes > v_first_gross or v_last_minutes > v_last_gross
     or v_first_minutes + v_last_minutes <> v_total then
    raise exception 'Cross-week segments must allocate all worked minutes within each Bangkok week';
  end if;
  return pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('weekStart', v_first_week, 'minutes', v_first_minutes),
    pg_catalog.jsonb_build_object('weekStart', v_last_week, 'minutes', v_last_minutes)
  );
end
$function$;

create or replace function public.ot_lock_employee_week_keys(
  p_keys jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key jsonb;
  v_employee_user_id uuid;
  v_week date;
begin
  if p_keys is null or pg_catalog.jsonb_typeof(p_keys) <> 'array' then
    raise exception 'Employee-week lock keys must be a JSON array';
  end if;
  for v_key in
    select item
    from pg_catalog.jsonb_array_elements(p_keys) item
    order by item->>'employeeUserId', item->>'weekStart'
  loop
    v_employee_user_id := (v_key->>'employeeUserId')::uuid;
    v_week := (v_key->>'weekStart')::date;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_employee_user_id::text || ':' || v_week::text, 0)
    );
  end loop;

  perform 1
  from public.ot_requests r
  where r.status not in ('cancelled', 'rejected')
    and exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_keys) key
      where (key->>'employeeUserId')::uuid = r.employee_user_id
        and (
          r.planned_week_segments @> pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('weekStart', (key->>'weekStart')::date)
          )
          or coalesce(r.actual_week_segments, '[]'::jsonb) @> pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object('weekStart', (key->>'weekStart')::date)
          )
        )
    )
  order by r.id
  for update;
end
$function$;

create or replace function public.ot_lock_employee_weeks(
  p_employee_user_id uuid,
  p_segments jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_keys jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'employeeUserId', p_employee_user_id,
      'weekStart', week_start
    ) order by week_start
  ), '[]'::jsonb)
  into v_keys
  from (
    select distinct (coalesce(item->>'weekStart', item->>'week_start'))::date as week_start
    from pg_catalog.jsonb_array_elements(p_segments) item
  ) weeks;
  perform public.ot_lock_employee_week_keys(v_keys);
end
$function$;

create or replace function public.ot_projected_week_minutes_unchecked(
  p_employee_user_id uuid,
  p_week_start date,
  p_exclude_request_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(pg_catalog.sum((segment->>'minutes')::integer), 0)::integer
  from public.ot_requests r
  cross join lateral pg_catalog.jsonb_array_elements(r.planned_week_segments) segment
  where r.employee_user_id = p_employee_user_id
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
    and r.status in (
      'pending_approval', 'awaiting_consent', 'approved',
      'actual_confirmation_required', 'pending_actual_verification',
      'compliance_review_required', 'hr_ready', 'exported'
    )
    and coalesce(segment->>'weekStart', segment->>'week_start') = p_week_start::text;
$function$;

create or replace function public.ot_counted_week_minutes_unchecked(
  p_employee_user_id uuid,
  p_week_start date,
  p_exclude_request_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(pg_catalog.sum((segment->>'minutes')::integer), 0)::integer
  from public.ot_requests r
  cross join lateral pg_catalog.jsonb_array_elements(
    case
      when r.actual_submitted_at is not null and r.actual_week_segments is not null
        then r.actual_week_segments
      else r.planned_week_segments
    end
  ) segment
  where r.employee_user_id = p_employee_user_id
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
    and (
      r.status in (
        'pending_approval', 'awaiting_consent', 'approved',
        'actual_confirmation_required', 'pending_actual_verification',
        'compliance_review_required', 'hr_ready', 'exported'
      )
      or (r.status = 'revision_required' and r.actual_submitted_at is not null)
    )
    and coalesce(segment->>'weekStart', segment->>'week_start') = p_week_start::text;
$function$;

create or replace function public.ot_assert_no_employee_overlap(
  p_employee_user_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_exclude_request_id uuid default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.ot_requests r
    where r.employee_user_id = p_employee_user_id
      and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
      and (
        r.status in (
          'pending_approval', 'awaiting_consent', 'approved',
          'actual_confirmation_required', 'pending_actual_verification',
          'compliance_review_required', 'hr_ready', 'exported'
        )
        or (r.status = 'revision_required' and r.actual_submitted_at is not null)
      )
      and (
        case
          when r.actual_submitted_at is not null then r.actual_start_at
          else r.planned_start_at
        end
      ) < p_end_at
      and (
        case
          when r.actual_submitted_at is not null then r.actual_end_at
          else r.planned_end_at
        end
      ) > p_start_at
  ) then
    raise exception 'OT occurrence overlaps another counted request';
  end if;
end
$function$;

create or replace function public.ot_projected_week_minutes(
  p_employee_user_id uuid,
  p_week_start date,
  p_exclude_request_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
begin
  if p_employee_user_id <> v_actor_id
     and not public.ot_current_user_is_owner()
     and not public.ot_current_user_is_hr_admin()
     and not exists (
       select 1 from public.ot_requests r
       where r.employee_user_id = p_employee_user_id
         and r.approver_user_id = v_actor_id
     ) then
    raise exception 'OT weekly total access denied';
  end if;
  return public.ot_projected_week_minutes_unchecked(
    p_employee_user_id, p_week_start, p_exclude_request_id
  );
end
$function$;

create or replace function public.ot_actual_week_minutes(
  p_employee_user_id uuid,
  p_week_start date,
  p_exclude_request_id uuid default null
)
returns integer
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(pg_catalog.sum((segment->>'minutes')::integer), 0)::integer
  from public.ot_requests r
  cross join lateral pg_catalog.jsonb_array_elements(coalesce(r.actual_week_segments, '[]'::jsonb)) segment
  where r.employee_user_id = p_employee_user_id
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
    and r.status <> 'cancelled'
    and coalesce(segment->>'weekStart', segment->>'week_start') = p_week_start::text;
$function$;

create or replace function public.ot_assert_planned_limit(
  p_employee_user_id uuid,
  p_segments jsonb,
  p_exclude_request_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_segment jsonb;
  v_week date;
  v_added integer;
  v_current integer;
  v_remaining integer;
begin
  perform public.ot_lock_employee_weeks(p_employee_user_id, p_segments);
  for v_segment in select item from pg_catalog.jsonb_array_elements(p_segments) item
  loop
    v_week := coalesce(v_segment->>'weekStart', v_segment->>'week_start')::date;
    v_added := (v_segment->>'minutes')::integer;
    v_current := public.ot_counted_week_minutes_unchecked(p_employee_user_id, v_week, p_exclude_request_id);
    v_remaining := greatest(0, 2160 - v_current);
    if v_current + v_added > 2160 then
      raise exception 'OT weekly limit exceeded: current=% minutes, added=% minutes, remaining=% minutes, affected_week=%',
        v_current, v_added, v_remaining, v_week;
    end if;
  end loop;
end
$function$;

create or replace function public.ot_lock_idempotency(
  p_action text,
  p_idempotency_key uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_idempotency_key is null then
    raise exception 'Idempotency key is required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended((select auth.uid())::text || ':' || p_action || ':' || p_idempotency_key::text, 1)
  );
end
$function$;

create or replace function public.ot_resolve_current_requester_access()
returns public.ot_requester_access
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_email text;
  v_access public.ot_requester_access;
  v_previous jsonb;
begin
  select pg_catalog.lower(pg_catalog.btrim(u.email))
  into v_email
  from public.users u
  where u.id = v_actor_id;

  select r.*
  into v_access
  from public.ot_requester_access r
  where r.email = v_email
  for update;

  if not found then
    return null;
  end if;

  if v_access.user_id is not null and v_access.user_id <> v_actor_id then
    raise exception 'OT requester access identity does not match the current sign-in';
  end if;

  if v_access.user_id is null or v_access.status = 'pending_sync' then
    v_previous := pg_catalog.to_jsonb(v_access);
    update public.ot_requester_access r
    set user_id = v_actor_id,
        status = case when r.status = 'pending_sync' then 'active' else r.status end,
        updated_at = pg_catalog.clock_timestamp()
    where r.id = v_access.id
    returning r.* into v_access;

    insert into public.ot_requester_access_audit (
      requester_access_id, actor_user_id, action, old_values, new_values, idempotency_key
    ) values (
      v_access.id,
      v_actor_id,
      'sync_requester_access_identity',
      v_previous,
      pg_catalog.to_jsonb(v_access),
      gen_random_uuid()
    );
  end if;

  return v_access;
end
$function$;

create or replace function public.ot_require_current_requester_access()
returns public.ot_requester_access
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_access public.ot_requester_access := public.ot_resolve_current_requester_access();
begin
  if v_access.id is null
     or v_access.user_id is distinct from v_actor_id
     or v_access.status <> 'active' then
    raise exception 'OT requester access is not active';
  end if;
  return v_access;
end
$function$;

create or replace function public.ot_get_access_context()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_requester_access public.ot_requester_access := public.ot_resolve_current_requester_access();
begin
  return pg_catalog.jsonb_build_object(
    'userId', v_actor_id,
    'isOwner', public.ot_current_user_is_owner(),
    'isHrAdmin', public.ot_current_user_is_hr_admin(),
    'isEligibleApprover', public.ot_current_user_is_eligible_approver(),
    'canRequestOt', coalesce(v_requester_access.user_id = v_actor_id and v_requester_access.status = 'active', false),
    'requesterFunctionCode', v_requester_access.function_code,
    'requesterAccessStatus', v_requester_access.status,
    'weeklyLimitMinutes', 2160,
    'timezone', 'Asia/Bangkok',
    'weekStartsOn', 'monday'
  );
end
$function$;

create or replace function public.ot_list_my_requests(p_week_start date default null)
returns setof public.ot_requests
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
begin
  perform public.ot_require_current_requester_access();
  return query
  select r.*
  from public.ot_requests r
  where r.employee_user_id = v_actor_id
    and (
      p_week_start is null
      or r.planned_week_segments @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
      or coalesce(r.actual_week_segments, '[]'::jsonb) @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
    )
  order by r.planned_start_at desc, r.id desc;
end
$function$;

create or replace function public.ot_get_my_dashboard(p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_rows jsonb;
  v_planned integer;
  v_actual integer;
  v_counted integer;
begin
  perform public.ot_require_current_requester_access();
  if p_week_start is null or pg_catalog.date_part('isodow', p_week_start)::integer <> 1 then
    raise exception 'Week start must be a Monday date in the Bangkok workweek';
  end if;
  select
    coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.planned_start_at, r.id), '[]'::jsonb),
    public.ot_projected_week_minutes(v_actor_id, p_week_start, null),
    public.ot_actual_week_minutes(v_actor_id, p_week_start, null),
    public.ot_counted_week_minutes_unchecked(v_actor_id, p_week_start, null)
  into v_rows, v_planned, v_actual, v_counted
  from public.ot_requests r
  where r.employee_user_id = v_actor_id
    and (
      r.planned_week_segments @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
      or coalesce(r.actual_week_segments, '[]'::jsonb) @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
    );
  return pg_catalog.jsonb_build_object(
    'weekStart', p_week_start,
    'plannedMinutes', v_planned,
    'actualMinutes', v_actual,
    'countedMinutes', v_counted,
    'remainingPlannedMinutes', greatest(0, 2160 - v_counted),
    'requests', v_rows
  );
end
$function$;

create or replace function public.ot_get_manager_dashboard(
  p_week_start date,
  p_function_code text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_full_access boolean := public.ot_current_user_is_owner() or public.ot_current_user_is_hr_admin();
  v_rows jsonb;
begin
  if not v_full_access and not public.ot_current_user_is_eligible_approver() then
    raise exception 'OT manager access required';
  end if;
  if p_week_start is null or pg_catalog.date_part('isodow', p_week_start)::integer <> 1 then
    raise exception 'Week start must be a Monday date in the Bangkok workweek';
  end if;
  if p_function_code is not null and p_function_code not in ('gdve', 'ops', 'mkt', 'esport') then
    raise exception 'Unsupported OT function code';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.planned_start_at, r.id), '[]'::jsonb)
  into v_rows
  from public.ot_requests r
  where (v_full_access or r.approver_user_id = v_actor_id)
    and (p_function_code is null or r.function_code = p_function_code)
    and (
      r.planned_week_segments @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
      or coalesce(r.actual_week_segments, '[]'::jsonb) @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
    );
  return pg_catalog.jsonb_build_object(
    'weekStart', p_week_start,
    'functionCode', p_function_code,
    'requests', v_rows
  );
end
$function$;

create or replace function public.ot_list_eligible_approvers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_result jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('userId', u.id, 'email', u.email, 'displayName', u.display_name)
    order by u.display_name, u.email
  ), '[]'::jsonb)
  into v_result
  from public.ot_approvers a
  join public.users u on u.id = a.user_id
  where a.active = true
    and u.is_active = true
    and pg_catalog.lower(pg_catalog.btrim(u.email)) in (
      'nithidol.k@garena.com',
      'weerayut@garena.com',
      'napol.a@garena.com'
    );
  return v_result;
end
$function$;

create or replace function public.ot_list_people_for_event()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_result jsonb;
begin
  if not public.ot_current_user_is_eligible_approver()
     and not public.ot_current_user_is_owner()
     and not public.ot_current_user_is_hr_admin() then
    raise exception 'OT event planning access required';
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'userId', u.id,
      'email', u.email,
      'displayName', u.display_name,
      'requesterTeam', u.requester_team
    ) order by u.display_name, u.email
  ), '[]'::jsonb)
  into v_result
  from public.users u
  where u.is_active = true
    and pg_catalog.lower(pg_catalog.btrim(u.email)) like '%@garena.com';
  return v_result;
end
$function$;

create or replace function public.ot_list_access_admin_identities()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_result jsonb;
begin
  if not public.ot_current_user_is_owner() then
    raise exception 'Only the OT Owner can list access administration identities';
  end if;
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'displayLabel', identity.display_label,
      'email', identity.email,
      'userId', u.id,
      'isWorkgridActive', coalesce(u.is_active, false),
      'isApproverActive', coalesce(a.active, false),
      'isHrAdminActive', coalesce(r.active, false)
    ) order by identity.sort_order
  ), '[]'::jsonb)
  into v_result
  from (values
    (1, 'Big', 'nithidol.k@garena.com'),
    (2, 'Mac', 'weerayut@garena.com'),
    (3, 'Pluem', 'napol.a@garena.com')
  ) as identity(sort_order, display_label, email)
  left join public.users u on u.id = (
    select matched_user.id
    from public.users matched_user
    where pg_catalog.lower(pg_catalog.btrim(matched_user.email)) = identity.email
    order by matched_user.id
    limit 1
  )
  left join public.ot_approvers a on a.user_id = u.id
  left join public.ot_system_roles r on r.user_id = u.id and r.role_code = 'hr_admin';
  return v_result;
end
$function$;

create or replace function public.ot_list_requester_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_result jsonb;
begin
  if not public.ot_current_user_is_owner() then
    raise exception 'Only the OT Owner can list requester access';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', r.id,
        'userId', r.user_id,
        'email', r.email,
        'firstName', r.first_name,
        'lastName', r.last_name,
        'displayName', r.display_name,
        'functionCode', r.function_code,
        'status', r.status,
        'note', r.note,
        'createdAt', r.created_at,
        'updatedAt', r.updated_at,
        'deactivatedAt', r.deactivated_at
      ) order by r.display_name, r.email
    ),
    '[]'::jsonb
  ) into v_result
  from public.ot_requester_access r;

  return v_result;
end
$function$;

create or replace function public.ot_upsert_requester_access(
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_access_id uuid;
  v_email text;
  v_first_name text;
  v_last_name text;
  v_display_name text;
  v_function_code text;
  v_note text;
  v_matched_user_id uuid;
  v_previous public.ot_requester_access;
  v_access public.ot_requester_access;
  v_existing boolean := false;
  v_status text;
  v_action text;
  v_result jsonb;
begin
  if not public.ot_current_user_is_owner() then
    raise exception 'Only the OT Owner can manage requester access';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Requester access payload must be an object';
  end if;

  perform public.ot_lock_idempotency('upsert_requester_access', p_idempotency_key);
  select a.new_values->'result'
  into v_result
  from public.ot_requester_access_audit a
  where a.actor_user_id = v_actor_id
    and a.idempotency_key = p_idempotency_key
  order by a.created_at desc, a.id desc
  limit 1;
  if found then
    return v_result;
  end if;

  v_email := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payload->>'email', '')));
  v_first_name := nullif(pg_catalog.btrim(coalesce(p_payload->>'firstName', '')), '');
  v_last_name := nullif(pg_catalog.btrim(coalesce(p_payload->>'lastName', '')), '');
  v_function_code := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payload->>'functionCode', '')));
  v_note := nullif(pg_catalog.btrim(coalesce(p_payload->>'note', '')), '');

  if v_email !~ '^[^@[:space:]]+@garena[.]com$' then
    raise exception 'Requester email must use the exact @garena.com domain';
  end if;
  if v_first_name is null or v_last_name is null then
    raise exception 'Requester first name and last name are required';
  end if;
  if v_function_code not in ('gdve', 'ops', 'mkt', 'esport') then
    raise exception 'Requester Function is invalid';
  end if;
  v_display_name := v_first_name || ' ' || v_last_name;

  if nullif(pg_catalog.btrim(coalesce(p_payload->>'id', '')), '') is not null then
    v_access_id := (p_payload->>'id')::uuid;
    select r.* into v_previous
    from public.ot_requester_access r
    where r.id = v_access_id
    for update;
    if not found then
      raise exception 'OT requester access record was not found';
    end if;
    v_existing := true;

    if exists (
      select 1
      from public.ot_requester_access duplicate_access
      where duplicate_access.email = v_email
        and duplicate_access.id <> v_access_id
      for update
    ) then
      raise exception 'Requester email is already registered for OT access';
    end if;
  else
    select r.* into v_previous
    from public.ot_requester_access r
    where r.email = v_email
    for update;
    v_existing := found;
    if v_existing then
      v_access_id := v_previous.id;
    end if;
  end if;

  select u.id into v_matched_user_id
  from public.users u
  where u.is_active = true
    and pg_catalog.lower(pg_catalog.btrim(u.email)) = v_email
  order by u.id
  limit 1;

  if v_existing and v_previous.user_id is not null
     and v_matched_user_id is not null
     and v_previous.user_id <> v_matched_user_id then
    raise exception 'Requester email resolves to a different Workgrid identity';
  end if;

  v_status := case
    when v_existing and v_previous.status = 'deactivated' then 'deactivated'
    when v_matched_user_id is not null then 'active'
    else 'pending_sync'
  end;

  if v_existing then
    update public.ot_requester_access r
    set email = v_email,
        user_id = v_matched_user_id,
        first_name = v_first_name,
        last_name = v_last_name,
        display_name = v_display_name,
        function_code = v_function_code,
        status = v_status,
        note = v_note,
        updated_by_user_id = v_actor_id,
        updated_at = pg_catalog.clock_timestamp(),
        deactivated_at = case
          when v_status = 'deactivated' then coalesce(r.deactivated_at, pg_catalog.clock_timestamp())
          else null
        end
    where r.id = v_access_id
    returning r.* into v_access;
    v_action := case
      when v_previous.user_id is null and v_access.user_id is not null then 'sync_requester_access_identity'
      else 'update_requester_access'
    end;
  else
    insert into public.ot_requester_access (
      user_id, email, first_name, last_name, display_name, function_code, status, note,
      created_by_user_id, updated_by_user_id
    ) values (
      v_matched_user_id, v_email, v_first_name, v_last_name, v_display_name, v_function_code, v_status, v_note,
      v_actor_id, v_actor_id
    )
    returning * into v_access;
    v_action := 'create_requester_access';
  end if;

  v_result := pg_catalog.jsonb_build_object('requesterAccess', pg_catalog.to_jsonb(v_access));
  insert into public.ot_requester_access_audit (
    requester_access_id, actor_user_id, action, old_values, new_values, reason, idempotency_key
  ) values (
    v_access.id,
    v_actor_id,
    v_action,
    case when v_existing then pg_catalog.to_jsonb(v_previous) else '{}'::jsonb end,
    pg_catalog.jsonb_build_object('requesterAccess', pg_catalog.to_jsonb(v_access), 'result', v_result),
    v_note,
    p_idempotency_key
  );
  return v_result;
end
$function$;

create or replace function public.ot_set_requester_access(
  p_requester_access_id uuid,
  p_active boolean,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_access public.ot_requester_access;
  v_previous jsonb;
  v_matched_user_id uuid;
  v_actionable_count integer;
  v_actionable_request_ids jsonb;
  v_next_status text;
  v_action text;
  v_result jsonb;
begin
  if not public.ot_current_user_is_owner() then
    raise exception 'Only the OT Owner can manage requester access';
  end if;
  if p_requester_access_id is null or p_active is null then
    raise exception 'Requester access record and active state are required';
  end if;

  perform public.ot_lock_idempotency('set_requester_access', p_idempotency_key);
  select a.new_values->'result'
  into v_result
  from public.ot_requester_access_audit a
  where a.actor_user_id = v_actor_id
    and a.idempotency_key = p_idempotency_key
    and a.action in ('activate_requester_access', 'deactivate_requester_access')
  order by a.created_at desc, a.id desc
  limit 1;
  if found then
    return v_result;
  end if;

  select r.* into v_access
  from public.ot_requester_access r
  where r.id = p_requester_access_id
  for update;
  if not found then
    raise exception 'OT requester access record was not found';
  end if;
  v_previous := pg_catalog.to_jsonb(v_access);

  if not p_active and v_access.user_id is not null then
    select
      pg_catalog.count(*)::integer,
      coalesce(pg_catalog.jsonb_agg(r.id order by r.planned_start_at, r.id), '[]'::jsonb)
    into v_actionable_count, v_actionable_request_ids
    from public.ot_requests r
    where r.employee_user_id = v_access.user_id
      and (
        r.status in (
          'pending_approval', 'awaiting_consent', 'revision_required',
          'actual_confirmation_required', 'pending_actual_verification',
          'compliance_review_required'
        )
        or (r.status = 'approved' and r.planned_end_at > pg_catalog.clock_timestamp())
      );
    if v_actionable_count > 0 then
      raise exception 'Requester has % unresolved OT request(s); resolve them before deactivation: %',
        v_actionable_count, v_actionable_request_ids;
    end if;
  end if;

  if p_active then
    select u.id into v_matched_user_id
    from public.users u
    where u.is_active = true
      and pg_catalog.lower(pg_catalog.btrim(u.email)) = v_access.email
    order by u.id
    limit 1;
    v_next_status := case when v_matched_user_id is null then 'pending_sync' else 'active' end;
  else
    v_next_status := 'deactivated';
  end if;

  update public.ot_requester_access r
  set user_id = case when p_active then v_matched_user_id else r.user_id end,
      status = v_next_status,
      updated_by_user_id = v_actor_id,
      updated_at = pg_catalog.clock_timestamp(),
      deactivated_at = case when p_active then null else pg_catalog.clock_timestamp() end
  where r.id = v_access.id
  returning r.* into v_access;

  v_action := case when p_active then 'activate_requester_access' else 'deactivate_requester_access' end;
  v_result := pg_catalog.jsonb_build_object('requesterAccess', pg_catalog.to_jsonb(v_access));
  insert into public.ot_requester_access_audit (
    requester_access_id, actor_user_id, action, old_values, new_values, idempotency_key
  ) values (
    v_access.id,
    v_actor_id,
    v_action,
    v_previous,
    pg_catalog.jsonb_build_object('requesterAccess', pg_catalog.to_jsonb(v_access), 'result', v_result),
    p_idempotency_key
  );
  return v_result;
end
$function$;

create or replace function public.ot_create_request(
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_requester_access public.ot_requester_access;
  v_approver_user_id uuid;
  v_function_code text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_break_minutes integer;
  v_minutes integer;
  v_segments jsonb;
  v_consent_statement_version text;
  v_reason_code text;
  v_reason_detail text;
  v_request public.ot_requests;
begin
  v_requester_access := public.ot_require_current_requester_access();
  perform public.ot_lock_idempotency('create_request', p_idempotency_key);
  select * into v_request
  from public.ot_requests r
  where r.created_by_user_id = v_actor_id
    and r.employee_user_id = v_actor_id
    and r.idempotency_key = p_idempotency_key;
  if found then
    return pg_catalog.to_jsonb(v_request);
  end if;

  v_consent_statement_version := nullif(pg_catalog.btrim(coalesce(
    p_payload->>'consentStatementVersion',
    p_payload->>'consent_statement_version'
  )), '');
  if v_consent_statement_version is null then
    raise exception 'Consent statement version is required';
  end if;
  perform public.ot_assert_consent_version(v_consent_statement_version);

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'OT request payload must be an object';
  end if;
  v_function_code := v_requester_access.function_code;
  v_approver_user_id := public.ot_function_approver_id(v_function_code);
  v_reason_code := nullif(pg_catalog.btrim(coalesce(
    p_payload->>'reasonCode', p_payload->>'reason_code'
  )), '');
  v_reason_detail := nullif(pg_catalog.btrim(coalesce(
    p_payload->>'reasonDetail', p_payload->>'reason_detail'
  )), '');
  perform public.ot_assert_reason(v_reason_code, v_reason_detail);
  v_start_at := coalesce(p_payload->>'plannedStartAt', p_payload->>'planned_start_at')::timestamptz;
  v_end_at := coalesce(p_payload->>'plannedEndAt', p_payload->>'planned_end_at')::timestamptz;
  if v_start_at <= pg_catalog.clock_timestamp() then
    raise exception 'Planned OT start must be in the future';
  end if;
  v_break_minutes := coalesce(coalesce(p_payload->>'plannedBreakMinutes', p_payload->>'planned_break_minutes')::integer, 0);
  v_minutes := public.ot_calculate_occurrence_minutes(v_start_at, v_end_at, v_break_minutes);
  v_segments := public.ot_build_week_segments(
    v_start_at,
    v_end_at,
    v_break_minutes,
    coalesce(p_payload->'plannedWeekSegments', p_payload->'planned_week_segments')
  );
  perform public.ot_assert_planned_limit(v_actor_id, v_segments, null);
  perform public.ot_assert_no_employee_overlap(v_actor_id, v_start_at, v_end_at, null);
  if v_start_at <= pg_catalog.clock_timestamp() then
    raise exception 'Planned OT start became non-future while the request was being created';
  end if;

  insert into public.ot_requests (
    employee_user_id, approver_user_id, created_by_user_id, source, request_type,
    function_code, title, day_type, work_location_type, venue, reason_code, reason_detail,
    planned_start_at, planned_end_at, planned_break_minutes, planned_minutes,
    planned_week_segments, status, employee_consent, consent_statement_version,
    employee_consented_at, employee_submitted_at, idempotency_key
  ) values (
    v_actor_id,
    v_approver_user_id,
    v_actor_id,
    'employee_request',
    'planned',
    v_function_code,
    pg_catalog.btrim(p_payload->>'title'),
    coalesce(p_payload->>'dayType', p_payload->>'day_type'),
    coalesce(p_payload->>'workLocationType', p_payload->>'work_location_type'),
    nullif(pg_catalog.btrim(p_payload->>'venue'), ''),
    v_reason_code,
    v_reason_detail,
    v_start_at, v_end_at, v_break_minutes, v_minutes, v_segments,
    'pending_approval', 'accepted', v_consent_statement_version,
    now(), now(), p_idempotency_key
  ) returning * into v_request;

  insert into public.ot_request_audit (
    request_id, actor_user_id, action, old_status, new_status, changed_fields, idempotency_key
  ) values (
    v_request.id, v_actor_id, 'create_request', null, v_request.status,
    pg_catalog.jsonb_build_object(
      'requestId', v_request.id,
      'plannedMinutes', v_minutes,
      'weekSegments', v_segments,
      'employeeConsent', 'accepted',
      'consentStatementVersion', v_consent_statement_version,
      'employeeConsentedAt', v_request.employee_consented_at
    ),
    p_idempotency_key
  );
  perform public.ot_enqueue_seatalk_notification(v_request.id, 'plan_approval');
  return pg_catalog.to_jsonb(v_request);
end
$function$;

create or replace function public.ot_resubmit_plan(
  p_request_id uuid,
  p_payload jsonb,
  p_consent_statement_version text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_requester_access public.ot_requester_access;
  v_request public.ot_requests;
  v_approver_user_id uuid;
  v_function_code text;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_break_minutes integer;
  v_minutes integer;
  v_segments jsonb;
  v_lock_segments jsonb;
  v_consent_statement_version text := nullif(pg_catalog.btrim(p_consent_statement_version), '');
  v_reason_code text;
  v_reason_detail text;
  v_old_status text;
  v_old_plan jsonb;
  v_old_approver_user_id uuid;
  v_replay_result jsonb;
begin
  v_requester_access := public.ot_require_current_requester_access();
  perform public.ot_lock_idempotency('resubmit_plan', p_idempotency_key);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ot-request:' || p_request_id::text, 2)
  );

  select * into v_request
  from public.ot_requests r
  where r.id = p_request_id;
  if not found then
    raise exception 'OT request not found';
  end if;
  if v_request.employee_user_id <> v_actor_id
     or v_request.source <> 'employee_request' then
    raise exception 'Only the employee who owns an individual OT request can resubmit its plan';
  end if;

  select a.changed_fields->'result' into v_replay_result
  from public.ot_request_audit a
  where a.request_id = p_request_id
    and a.actor_user_id = v_actor_id
    and a.action = 'resubmit_plan'
    and a.idempotency_key = p_idempotency_key;
  if found then
    return v_replay_result;
  end if;

  if v_request.status <> 'revision_required'
     or v_request.actual_submitted_at is not null
     or v_request.plan_decision is distinct from 'revision_required' then
    raise exception 'Only a pre-work plan revision can be resubmitted';
  end if;
  if v_consent_statement_version is null then
    raise exception 'Consent statement version is required';
  end if;
  perform public.ot_assert_consent_version(v_consent_statement_version);

  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'OT request payload must be an object';
  end if;
  v_function_code := v_requester_access.function_code;
  v_approver_user_id := public.ot_function_approver_id(v_function_code);
  v_reason_code := nullif(pg_catalog.btrim(coalesce(
    p_payload->>'reasonCode', p_payload->>'reason_code'
  )), '');
  v_reason_detail := nullif(pg_catalog.btrim(coalesce(
    p_payload->>'reasonDetail', p_payload->>'reason_detail'
  )), '');
  perform public.ot_assert_reason(v_reason_code, v_reason_detail);
  v_start_at := coalesce(p_payload->>'plannedStartAt', p_payload->>'planned_start_at')::timestamptz;
  v_end_at := coalesce(p_payload->>'plannedEndAt', p_payload->>'planned_end_at')::timestamptz;
  if v_start_at <= pg_catalog.clock_timestamp() then
    raise exception 'Planned OT start must be in the future';
  end if;
  v_break_minutes := coalesce(
    coalesce(p_payload->>'plannedBreakMinutes', p_payload->>'planned_break_minutes')::integer,
    0
  );
  v_minutes := public.ot_calculate_occurrence_minutes(v_start_at, v_end_at, v_break_minutes);
  v_segments := public.ot_build_week_segments(
    v_start_at,
    v_end_at,
    v_break_minutes,
    coalesce(p_payload->'plannedWeekSegments', p_payload->'planned_week_segments')
  );

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('weekStart', week_start, 'minutes', 0)
      order by week_start
    ),
    '[]'::jsonb
  )
  into v_lock_segments
  from (
    select distinct coalesce(item->>'weekStart', item->>'week_start')::date as week_start
    from pg_catalog.jsonb_array_elements(v_request.planned_week_segments || v_segments) item
  ) affected_weeks;

  perform public.ot_lock_employee_weeks(v_request.employee_user_id, v_lock_segments);
  select * into v_request from public.ot_requests r where r.id = p_request_id for update;
  if v_request.employee_user_id <> v_actor_id
     or v_request.source <> 'employee_request'
     or v_request.status <> 'revision_required'
     or v_request.actual_submitted_at is not null
     or v_request.plan_decision is distinct from 'revision_required' then
    raise exception 'Plan revision state changed; reload this request';
  end if;
  perform public.ot_assert_planned_limit(v_actor_id, v_segments, p_request_id);
  perform public.ot_assert_no_employee_overlap(v_actor_id, v_start_at, v_end_at, p_request_id);

  v_old_status := v_request.status;
  v_old_approver_user_id := v_request.approver_user_id;
  v_old_plan := pg_catalog.jsonb_build_object(
    'functionCode', v_request.function_code,
    'title', v_request.title,
    'dayType', v_request.day_type,
    'workLocationType', v_request.work_location_type,
    'venue', v_request.venue,
    'reasonCode', v_request.reason_code,
    'reasonDetail', v_request.reason_detail,
    'plannedStartAt', v_request.planned_start_at,
    'plannedEndAt', v_request.planned_end_at,
    'plannedBreakMinutes', v_request.planned_break_minutes,
    'plannedMinutes', v_request.planned_minutes,
    'plannedWeekSegments', v_request.planned_week_segments
  );

  if v_start_at <= pg_catalog.clock_timestamp() then
    raise exception 'Planned OT start became non-future while the plan was being resubmitted';
  end if;
  update public.ot_requests
  set function_code = v_function_code,
      title = pg_catalog.btrim(p_payload->>'title'),
      day_type = coalesce(p_payload->>'dayType', p_payload->>'day_type'),
      work_location_type = coalesce(p_payload->>'workLocationType', p_payload->>'work_location_type'),
      venue = nullif(pg_catalog.btrim(p_payload->>'venue'), ''),
      reason_code = v_reason_code,
      reason_detail = v_reason_detail,
      planned_start_at = v_start_at,
      planned_end_at = v_end_at,
      planned_break_minutes = v_break_minutes,
      planned_minutes = v_minutes,
      planned_week_segments = v_segments,
      approver_user_id = v_approver_user_id,
      status = 'pending_approval',
      plan_decision = null,
      plan_decision_note = null,
      plan_reviewed_by_user_id = null,
      plan_reviewed_at = null,
      employee_consent = 'accepted',
      consent_statement_version = v_consent_statement_version,
      employee_consented_at = now(),
      employee_submitted_at = now(),
      updated_at = now()
  where id = p_request_id
  returning * into v_request;

  insert into public.ot_request_audit (
    request_id, actor_user_id, action, old_status, new_status,
    changed_fields, note, idempotency_key
  ) values (
    v_request.id,
    v_actor_id,
    'resubmit_plan',
    v_old_status,
    v_request.status,
    pg_catalog.jsonb_build_object(
      'oldPlan', v_old_plan,
      'newPlan', pg_catalog.jsonb_build_object(
        'functionCode', v_request.function_code,
        'title', v_request.title,
        'dayType', v_request.day_type,
        'workLocationType', v_request.work_location_type,
        'venue', v_request.venue,
        'reasonCode', v_request.reason_code,
        'reasonDetail', v_request.reason_detail,
        'plannedStartAt', v_request.planned_start_at,
        'plannedEndAt', v_request.planned_end_at,
        'plannedBreakMinutes', v_request.planned_break_minutes,
        'plannedMinutes', v_request.planned_minutes,
        'plannedWeekSegments', v_request.planned_week_segments
      ),
      'oldApproverUserId', v_old_approver_user_id,
      'newApproverUserId', v_request.approver_user_id,
      'consentStatementVersion', v_consent_statement_version,
      'result', pg_catalog.to_jsonb(v_request)
    ),
    'Employee corrected and resubmitted the OT plan',
    p_idempotency_key
  );
  perform public.ot_enqueue_seatalk_notification(v_request.id, 'plan_approval');
  return pg_catalog.to_jsonb(v_request);
end
$function$;

create or replace function public.ot_seatalk_apply_review(
  p_notification_id uuid,
  p_decision text,
  p_note text,
  p_sender_email text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_notification public.ot_seatalk_notifications;
  v_approver_user_id uuid;
  v_approver_email text;
  v_result jsonb;
begin
  if p_decision is distinct from 'approved' then
    raise exception 'SeaTalk direct review supports approval only; use the rejection reason workflow';
  end if;

  select * into v_notification
  from public.ot_seatalk_notifications n
  where n.id = p_notification_id
  for update;
  if not found or v_notification.notification_kind <> 'plan_approval' then
    raise exception 'SeaTalk OT notification not found';
  end if;

  select r.approver_user_id, pg_catalog.lower(pg_catalog.btrim(u.email))
  into v_approver_user_id, v_approver_email
  from public.ot_requests r
  join public.users u on u.id = r.approver_user_id
  where r.id = v_notification.request_id;
  if v_approver_user_id is null
     or nullif(pg_catalog.lower(pg_catalog.btrim(p_sender_email)), '') is distinct from v_approver_email then
    raise exception 'SeaTalk sender is not the assigned OT approver';
  end if;

  if v_notification.status = 'applied' then
    select a.changed_fields->'result' into v_result
    from public.ot_request_audit a
    where a.request_id = v_notification.request_id
      and a.actor_user_id = v_approver_user_id
      and a.action = 'review_plan'
      and a.idempotency_key = p_idempotency_key;
    if found then
      return v_result;
    end if;
    raise exception 'SeaTalk OT notification replay does not match the applied review';
  end if;
  if v_notification.status not in ('pending', 'dispatching', 'sent', 'failed') then
    raise exception 'SeaTalk OT notification is not available for review';
  end if;

  v_result := public.ot_apply_plan_review(
    v_notification.request_id,
    'approved',
    p_note,
    p_idempotency_key,
    v_approver_user_id
  );

  update public.ot_seatalk_notifications
  set status = 'applied',
      lease_expires_at = null,
      updated_at = now()
  where id = v_notification.id
    and status in ('pending', 'dispatching', 'sent', 'failed');
  update public.ot_seatalk_pending_rejections
  set status = 'cancelled',
      updated_at = now()
  where notification_id = v_notification.id
    and status = 'pending';
  return v_result;
end
$function$;

create or replace function public.ot_preview_event_plan(
  p_payload jsonb,
  p_employee_user_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_break_minutes integer;
  v_segments jsonb;
  v_employee_user_id uuid;
  v_segment jsonb;
  v_week date;
  v_added integer;
  v_current integer;
  v_rows jsonb := '[]'::jsonb;
  v_checks jsonb;
begin
  if not public.ot_current_user_is_eligible_approver() then
    raise exception 'Active OT approver access required';
  end if;
  if p_employee_user_ids is null or pg_catalog.cardinality(p_employee_user_ids) = 0 then
    raise exception 'At least one employee is required';
  end if;
  if pg_catalog.cardinality(p_employee_user_ids) <> (
    select pg_catalog.count(distinct employee_id) from pg_catalog.unnest(p_employee_user_ids) employee_id
  ) then
    raise exception 'Employee assignments must be unique per event occurrence';
  end if;
  v_start_at := coalesce(p_payload->>'plannedStartAt', p_payload->>'planned_start_at')::timestamptz;
  v_end_at := coalesce(p_payload->>'plannedEndAt', p_payload->>'planned_end_at')::timestamptz;
  if v_start_at <= pg_catalog.clock_timestamp() then
    raise exception 'Planned OT start must be in the future';
  end if;
  v_break_minutes := coalesce(coalesce(p_payload->>'plannedBreakMinutes', p_payload->>'planned_break_minutes')::integer, 0);
  v_segments := public.ot_build_week_segments(
    v_start_at, v_end_at, v_break_minutes,
    coalesce(p_payload->'plannedWeekSegments', p_payload->'planned_week_segments')
  );
  foreach v_employee_user_id in array p_employee_user_ids
  loop
    if not exists (
      select 1 from public.users u
      where u.id = v_employee_user_id and u.is_active = true
        and pg_catalog.lower(pg_catalog.btrim(u.email)) like '%@garena.com'
    ) then
      raise exception 'Event employee % is not an active Garena Workgrid user', v_employee_user_id;
    end if;
    v_checks := '[]'::jsonb;
    for v_segment in select item from pg_catalog.jsonb_array_elements(v_segments) item
    loop
      v_week := (v_segment->>'weekStart')::date;
      v_added := (v_segment->>'minutes')::integer;
      v_current := public.ot_counted_week_minutes_unchecked(v_employee_user_id, v_week, null);
      v_checks := v_checks || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'weekStart', v_week,
        'currentMinutes', v_current,
        'addedMinutes', v_added,
        'remainingMinutes', greatest(0, 2160 - v_current),
        'projectedMinutes', v_current + v_added,
        'overLimit', v_current + v_added > 2160
      ));
    end loop;
    v_rows := v_rows || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'employeeUserId', v_employee_user_id,
      'weekChecks', v_checks,
      'canCreate', not pg_catalog.jsonb_path_exists(v_checks, '$[*] ? (@.overLimit == true)')
    ));
  end loop;
  return pg_catalog.jsonb_build_object('weekSegments', v_segments, 'employees', v_rows);
end
$function$;

create or replace function public.ot_create_event_plan(
  p_payload jsonb,
  p_employee_user_ids uuid[],
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_approver_user_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_break_minutes integer;
  v_minutes integer;
  v_segments jsonb;
  v_reason_code text;
  v_reason_detail text;
  v_employee_user_id uuid;
  v_plan public.ot_event_plans;
  v_request public.ot_requests;
  v_request_ids uuid[] := '{}'::uuid[];
begin
  if not public.ot_current_user_is_eligible_approver() then
    raise exception 'Active OT approver access required';
  end if;
  perform public.ot_lock_idempotency('create_event_plan', p_idempotency_key);
  select * into v_plan
  from public.ot_event_plans e
  where e.created_by_user_id = v_actor_id and e.idempotency_key = p_idempotency_key;
  if found then
    select coalesce(pg_catalog.array_agg(r.id order by r.id), '{}'::uuid[])
    into v_request_ids from public.ot_requests r where r.event_plan_id = v_plan.id;
    return pg_catalog.jsonb_build_object('eventPlan', pg_catalog.to_jsonb(v_plan), 'requestIds', v_request_ids);
  end if;
  if p_employee_user_ids is null or pg_catalog.cardinality(p_employee_user_ids) = 0 then
    raise exception 'At least one employee is required';
  end if;
  if pg_catalog.cardinality(p_employee_user_ids) <> (
    select pg_catalog.count(distinct employee_id) from pg_catalog.unnest(p_employee_user_ids) employee_id
  ) then
    raise exception 'Employee assignments must be unique per event occurrence';
  end if;
  v_approver_user_id := coalesce(
    coalesce(p_payload->>'approverUserId', p_payload->>'approver_user_id')::uuid,
    v_actor_id
  );
  perform 1
  from public.ot_approvers a
  where a.user_id = v_approver_user_id
  for key share of a;
  if not public.ot_user_is_approved_approver_identity(v_approver_user_id)
     or not exists (
    select 1 from public.ot_approvers a join public.users u on u.id = a.user_id
    where a.user_id = v_approver_user_id and a.active = true and u.is_active = true
  ) then
    raise exception 'An active approved OT approver is required';
  end if;
  if v_approver_user_id <> v_actor_id then
    raise exception 'The assigned approver must personally authorize and create the event plan';
  end if;
  v_reason_code := nullif(pg_catalog.btrim(coalesce(
    p_payload->>'reasonCode', p_payload->>'reason_code'
  )), '');
  v_reason_detail := nullif(pg_catalog.btrim(coalesce(
    p_payload->>'reasonDetail', p_payload->>'reason_detail'
  )), '');
  perform public.ot_assert_reason(v_reason_code, v_reason_detail);
  v_start_at := coalesce(p_payload->>'plannedStartAt', p_payload->>'planned_start_at')::timestamptz;
  v_end_at := coalesce(p_payload->>'plannedEndAt', p_payload->>'planned_end_at')::timestamptz;
  if v_start_at <= pg_catalog.clock_timestamp() then
    raise exception 'Planned OT start must be in the future';
  end if;
  v_break_minutes := coalesce(coalesce(p_payload->>'plannedBreakMinutes', p_payload->>'planned_break_minutes')::integer, 0);
  v_minutes := public.ot_calculate_occurrence_minutes(v_start_at, v_end_at, v_break_minutes);
  v_segments := public.ot_build_week_segments(
    v_start_at, v_end_at, v_break_minutes,
    coalesce(p_payload->'plannedWeekSegments', p_payload->'planned_week_segments')
  );

  foreach v_employee_user_id in array (
    select pg_catalog.array_agg(employee_id order by employee_id)
    from pg_catalog.unnest(p_employee_user_ids) employee_id
  )
  loop
    if not exists (
      select 1 from public.users u
      where u.id = v_employee_user_id and u.is_active = true
        and pg_catalog.lower(pg_catalog.btrim(u.email)) like '%@garena.com'
    ) then
      raise exception 'Event employee % is not an active Garena Workgrid user', v_employee_user_id;
    end if;
    perform public.ot_assert_planned_limit(v_employee_user_id, v_segments, null);
    perform public.ot_assert_no_employee_overlap(v_employee_user_id, v_start_at, v_end_at, null);
  end loop;
  if v_start_at <= pg_catalog.clock_timestamp() then
    raise exception 'Planned OT start became non-future while the event plan was being created';
  end if;

  insert into public.ot_event_plans (
    title, function_code, work_location_type, venue, reason_code, reason_detail,
    planned_start_at, planned_end_at, planned_break_minutes,
    approver_user_id, created_by_user_id, idempotency_key
  ) values (
    pg_catalog.btrim(p_payload->>'title'),
    coalesce(p_payload->>'functionCode', p_payload->>'function_code'),
    coalesce(p_payload->>'workLocationType', p_payload->>'work_location_type'),
    nullif(pg_catalog.btrim(p_payload->>'venue'), ''),
    v_reason_code,
    v_reason_detail,
    v_start_at, v_end_at, v_break_minutes, v_approver_user_id, v_actor_id, p_idempotency_key
  ) returning * into v_plan;

  foreach v_employee_user_id in array p_employee_user_ids
  loop
    insert into public.ot_requests (
      event_plan_id, employee_user_id, approver_user_id, created_by_user_id,
      source, request_type, function_code, title, day_type, work_location_type,
      venue, reason_code, reason_detail, planned_start_at, planned_end_at,
      planned_break_minutes, planned_minutes, planned_week_segments, status,
      plan_decision, plan_decision_note, plan_reviewed_by_user_id, plan_reviewed_at,
      idempotency_key
    ) values (
      v_plan.id, v_employee_user_id, v_approver_user_id, v_actor_id,
      'event_plan', 'consented', v_plan.function_code, v_plan.title,
      coalesce(p_payload->>'dayType', p_payload->>'day_type'),
      v_plan.work_location_type, v_plan.venue, v_plan.reason_code, v_plan.reason_detail,
      v_start_at, v_end_at, v_break_minutes, v_minutes, v_segments,
      'awaiting_consent', 'approved', 'Authorized with event plan',
      v_approver_user_id, now(), p_idempotency_key
    ) returning * into v_request;
    v_request_ids := pg_catalog.array_append(v_request_ids, v_request.id);
    insert into public.ot_request_audit (
      request_id, event_plan_id, actor_user_id, action, old_status, new_status,
      changed_fields, note, idempotency_key
    ) values (
      v_request.id, v_plan.id, v_actor_id, 'create_event_assignment', null,
      v_request.status,
      pg_catalog.jsonb_build_object('employeeUserId', v_employee_user_id, 'plannedMinutes', v_minutes, 'weekSegments', v_segments),
      'Assigned approver authorized the planned occurrence; employee consent is still required',
      p_idempotency_key
    );
  end loop;
  return pg_catalog.jsonb_build_object('eventPlan', pg_catalog.to_jsonb(v_plan), 'requestIds', v_request_ids);
end
$function$;

create or replace function public.ot_list_compliance_queue(p_week_start date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_result jsonb;
begin
  if not public.ot_current_user_is_owner() and not public.ot_current_user_is_eligible_approver() then
    raise exception 'OT Owner or active Team Lead access required';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.actual_start_at, r.id), '[]'::jsonb)
  into v_result
  from public.ot_requests r
  where r.compliance_required = true
    and r.status = 'compliance_review_required'
    and (r.compliance_reviewed_at is null or r.compliance_outcome = 'action_required')
    and (
      p_week_start is null
      or coalesce(r.actual_week_segments, '[]'::jsonb)
        @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
    );
  return v_result;
end
$function$;

create or replace function public.ot_review_compliance(
  p_request_id uuid,
  p_outcome text,
  p_note text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_request public.ot_requests;
  v_old_status text;
  v_new_status text;
begin
  if not public.ot_current_user_is_owner() and not public.ot_current_user_is_hr_admin() then
    raise exception 'OT Owner or HR/Admin access required';
  end if;
  perform public.ot_lock_idempotency('review_compliance', p_idempotency_key);
  select * into v_request from public.ot_requests r where r.id = p_request_id;
  if not found then
    raise exception 'OT request not found';
  end if;
  if exists (
    select 1 from public.ot_request_audit a
    where a.request_id = p_request_id and a.actor_user_id = v_actor_id
      and a.action = 'review_compliance' and a.idempotency_key = p_idempotency_key
  ) then
    return pg_catalog.to_jsonb(v_request);
  end if;
  if not v_request.compliance_required or v_request.status <> 'compliance_review_required' then
    raise exception 'This request is not awaiting compliance review';
  end if;
  if p_outcome not in ('approved', 'cleared', 'action_required', 'rejected') then
    raise exception 'Compliance outcome must be approved, cleared, action_required, or rejected';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_note, ''))) = 0 then
    raise exception 'A compliance review note is required';
  end if;
  perform public.ot_lock_employee_weeks(v_request.employee_user_id, v_request.actual_week_segments);
  select * into v_request from public.ot_requests r where r.id = p_request_id for update;
  if not v_request.compliance_required or v_request.status <> 'compliance_review_required' then
    raise exception 'Compliance state changed; reload this request';
  end if;
  v_new_status := case
    when p_outcome in ('approved', 'cleared') and v_request.actual_decision = 'approved' then 'hr_ready'
    when p_outcome = 'rejected' then 'rejected'
    else 'compliance_review_required'
  end;
  v_old_status := v_request.status;
  update public.ot_requests
  set compliance_outcome = p_outcome,
      compliance_note = pg_catalog.btrim(p_note),
      compliance_reviewed_by_user_id = v_actor_id,
      compliance_reviewed_at = now(),
      hr_ready_at = case when v_new_status = 'hr_ready' then now() else null end,
      status = v_new_status,
      updated_at = now()
  where id = p_request_id returning * into v_request;
  insert into public.ot_request_audit (
    request_id, event_plan_id, actor_user_id, action, old_status, new_status,
    changed_fields, note, idempotency_key
  ) values (
    v_request.id, v_request.event_plan_id, v_actor_id, 'review_compliance',
    v_old_status, v_request.status,
    pg_catalog.jsonb_build_object('outcome', p_outcome, 'actualFactsChanged', false),
    p_note, p_idempotency_key
  );
  return pg_catalog.to_jsonb(v_request);
end
$function$;

create or replace function public.ot_list_request_audit(p_request_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_result jsonb;
begin
  if not public.ot_current_user_can_read_request(p_request_id) then
    raise exception 'OT request access denied';
  end if;
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.created_at, a.id), '[]'::jsonb)
  into v_result
  from public.ot_request_audit a
  where a.request_id = p_request_id;
  return v_result;
end
$function$;

drop function if exists public.ot_list_hr_ready(date);

create or replace function public.ot_list_hr_ready(p_week_start date default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
begin
  if not public.ot_current_user_is_owner() and not public.ot_current_user_is_eligible_approver() then
    raise exception 'OT Owner or active Team Lead access required';
  end if;
  return query
  select pg_catalog.to_jsonb(r) || pg_catalog.jsonb_build_object(
    'employee_email', pg_catalog.lower(pg_catalog.btrim(employee.email)),
    'approver_email', pg_catalog.lower(pg_catalog.btrim(approver.email))
  )
  from public.ot_requests r
  join public.users employee on employee.id = r.employee_user_id
  join public.users approver on approver.id = r.approver_user_id
  where r.status = 'hr_ready'
    and r.hr_ready_at is not null
    and (public.ot_current_user_is_owner() or r.approver_user_id = v_actor_id)
    and (
      p_week_start is null
      or coalesce(r.actual_week_segments, '[]'::jsonb)
        @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
    )
  order by r.actual_start_at, r.id;
end
$function$;

create or replace function public.ot_mark_exported(
  p_request_ids uuid[],
  p_batch_name text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_batch public.ot_export_batches;
  v_request public.ot_requests;
  v_request_id uuid;
  v_lock_keys jsonb;
begin
  if not public.ot_current_user_is_owner() and not public.ot_current_user_is_eligible_approver() then
    raise exception 'OT Owner or active Team Lead access required';
  end if;
  if p_request_ids is null or pg_catalog.cardinality(p_request_ids) = 0
     or pg_catalog.cardinality(p_request_ids) <> (
       select pg_catalog.count(distinct request_id) from pg_catalog.unnest(p_request_ids) request_id
     ) then
    raise exception 'A non-empty unique OT request list is required';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_batch_name, ''))) = 0 then
    raise exception 'Export batch name is required';
  end if;
  perform public.ot_lock_idempotency('mark_exported', p_idempotency_key);
  select * into v_batch from public.ot_export_batches b
  where b.created_by_user_id = v_actor_id and b.idempotency_key = p_idempotency_key;
  if found then
    return pg_catalog.to_jsonb(v_batch);
  end if;

  with affected_keys as (
    select distinct
      r.employee_user_id,
      (coalesce(segment->>'weekStart', segment->>'week_start'))::date as week_start
    from public.ot_requests r
    cross join lateral pg_catalog.jsonb_array_elements(
      coalesce(r.actual_week_segments, '[]'::jsonb)
    ) segment
    where r.id = any(p_request_ids)
  )
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'employeeUserId', employee_user_id,
      'weekStart', week_start
    ) order by employee_user_id, week_start
  ), '[]'::jsonb)
  into v_lock_keys
  from affected_keys;
  perform public.ot_lock_employee_week_keys(v_lock_keys);

  foreach v_request_id in array (
    select pg_catalog.array_agg(request_id order by request_id)
    from pg_catalog.unnest(p_request_ids) request_id
  )
  loop
    select * into v_request from public.ot_requests r where r.id = v_request_id;
    if not found or v_request.status <> 'hr_ready' or v_request.hr_ready_at is null
       or (not public.ot_current_user_is_owner() and v_request.approver_user_id <> v_actor_id) then
      raise exception 'Request % is not eligible for Team Lead export', v_request_id;
    end if;
    select * into v_request from public.ot_requests r where r.id = v_request_id for update;
    if v_request.status <> 'hr_ready' or v_request.hr_ready_at is null
       or (not public.ot_current_user_is_owner() and v_request.approver_user_id <> v_actor_id) then
      raise exception 'Request % changed and is no longer eligible for Team Lead export', v_request_id;
    end if;
  end loop;

  insert into public.ot_export_batches (
    batch_name, created_by_user_id, request_ids, idempotency_key
  ) values (
    pg_catalog.btrim(p_batch_name), v_actor_id, p_request_ids, p_idempotency_key
  ) returning * into v_batch;

  foreach v_request_id in array p_request_ids
  loop
    update public.ot_requests
    set status = 'exported', exported_at = now(), export_batch_id = v_batch.id, updated_at = now()
    where id = v_request_id returning * into v_request;
    insert into public.ot_request_audit (
      request_id, event_plan_id, actor_user_id, action, old_status, new_status,
      changed_fields, note, idempotency_key
    ) values (
      v_request.id, v_request.event_plan_id, v_actor_id, 'mark_exported',
      'hr_ready', 'exported',
      pg_catalog.jsonb_build_object('batchId', v_batch.id, 'batchName', v_batch.batch_name),
      null, p_idempotency_key
    );
  end loop;
  return pg_catalog.to_jsonb(v_batch);
end
$function$;

create or replace function public.ot_reassign_pending_approver(
  p_from_user_id uuid,
  p_to_user_id uuid,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_reason text := nullif(pg_catalog.btrim(p_reason), '');
  v_request public.ot_requests;
  v_moved_request public.ot_requests;
  v_notification_id uuid;
  v_moved_request_ids uuid[] := '{}'::uuid[];
  v_replay_result jsonb;
  v_result jsonb;
begin
  if not public.ot_current_user_is_owner() then
    raise exception 'Only the OT Owner can reassign pending approver work';
  end if;
  if p_from_user_id is null or p_to_user_id is null then
    raise exception 'Source and destination approvers are required';
  end if;
  if p_from_user_id = p_to_user_id then
    raise exception 'Source and destination approvers must be different';
  end if;
  if v_reason is null then
    raise exception 'A non-empty reassignment reason is required';
  end if;
  if not public.ot_user_is_approved_approver_identity(p_from_user_id) then
    raise exception 'Source approver must be one of the three approved MVP identities';
  end if;
  if not public.ot_user_is_approved_approver_identity(p_to_user_id) then
    raise exception 'Destination approver must be one of the three approved MVP identities';
  end if;

  perform public.ot_lock_idempotency('reassign_pending_approver', p_idempotency_key);
  select a.changed_fields->'result'
  into v_replay_result
  from public.ot_request_audit a
  where a.actor_user_id = v_actor_id
    and a.action = 'reassign_pending_approver_admin'
    and a.idempotency_key = p_idempotency_key;
  if found then
    if v_replay_result->>'fromUserId' is distinct from p_from_user_id::text
       or v_replay_result->>'toUserId' is distinct from p_to_user_id::text
       or v_replay_result->>'reason' is distinct from v_reason then
      raise exception 'Idempotency key was already used for a different approver reassignment';
    end if;
    return v_replay_result;
  end if;

  -- Plan callbacks lock the notification before approver/request state. Lock
  -- every actionable notification in a deterministic order before taking the
  -- assignee rows so reassignment can invalidate a lease without deadlocking a
  -- concurrent callback on the same pending plan.
  perform 1
  from public.ot_seatalk_notifications n
  join public.ot_requests r on r.id = n.request_id
  where r.approver_user_id = p_from_user_id
    and r.status in (
      'pending_approval', 'awaiting_consent', 'approved', 'revision_required',
      'actual_confirmation_required', 'pending_actual_verification',
      'compliance_review_required'
    )
    and n.notification_kind = 'plan_approval'
    and n.status in ('pending', 'dispatching', 'sent', 'failed')
  order by n.id
  for update of n;

  perform 1
  from public.ot_approvers a
  where a.user_id in (p_from_user_id, p_to_user_id)
  order by a.user_id
  for update of a;

  if not exists (
    select 1 from public.ot_approvers a where a.user_id = p_from_user_id
  ) then
    raise exception 'Source approver is not configured';
  end if;
  if not exists (
    select 1
    from public.ot_approvers a
    join public.users u on u.id = a.user_id
    where a.user_id = p_to_user_id
      and a.active = true
      and u.is_active = true
  ) then
    raise exception 'Destination approver must be active';
  end if;

  for v_request in
    select r.*
    from public.ot_requests r
    where r.approver_user_id = p_from_user_id
      and r.status in (
        'pending_approval', 'awaiting_consent', 'approved', 'revision_required',
        'actual_confirmation_required', 'pending_actual_verification',
        'compliance_review_required'
      )
    order by r.id
    for update of r
  loop
    update public.ot_requests
    set approver_user_id = p_to_user_id,
        updated_at = now()
    where id = v_request.id
      and approver_user_id = p_from_user_id
    returning * into v_moved_request;

    if found then
      select n.id into v_notification_id
      from public.ot_seatalk_notifications n
      where n.request_id = v_moved_request.id
        and n.notification_kind = 'plan_approval';
      if found then
        update public.ot_seatalk_pending_rejections
        set status = 'cancelled',
            updated_at = now()
        where notification_id = v_notification_id
          and status = 'pending';
        update public.ot_seatalk_notifications
        set status = case
              when v_request.status = 'pending_approval' then 'pending'
              else 'cancelled'
            end,
            attempt_count = case
              when v_request.status = 'pending_approval' then 0
              else attempt_count
            end,
            seatalk_message_id = null,
            dispatch_key = null,
            lease_expires_at = null,
            last_error = null,
            updated_at = now()
        where id = v_notification_id
          and status in ('pending', 'dispatching', 'sent', 'failed');
      end if;
      v_moved_request_ids := pg_catalog.array_append(v_moved_request_ids, v_moved_request.id);
      insert into public.ot_request_audit (
        request_id, event_plan_id, actor_user_id, action, old_status, new_status,
        changed_fields, note, idempotency_key
      ) values (
        v_moved_request.id, v_moved_request.event_plan_id, v_actor_id,
        'reassign_pending_approver', v_request.status, v_moved_request.status,
        pg_catalog.jsonb_build_object(
          'oldApproverUserId', p_from_user_id,
          'newApproverUserId', p_to_user_id
        ),
        v_reason,
        p_idempotency_key
      );
    end if;
  end loop;

  v_result := pg_catalog.jsonb_build_object(
    'fromUserId', p_from_user_id,
    'toUserId', p_to_user_id,
    'reason', v_reason,
    'movedRequestIds', pg_catalog.to_jsonb(v_moved_request_ids),
    'movedCount', pg_catalog.cardinality(v_moved_request_ids)
  );
  insert into public.ot_request_audit (
    actor_user_id, action, changed_fields, note, idempotency_key
  ) values (
    v_actor_id,
    'reassign_pending_approver_admin',
    pg_catalog.jsonb_build_object('result', v_result),
    v_reason,
    p_idempotency_key
  );
  return v_result;
end
$function$;

create or replace function public.ot_set_approver(
  p_user_id uuid,
  p_active boolean,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_previous boolean;
  v_result jsonb;
begin
  if not public.ot_current_user_is_owner() then
    raise exception 'Only the OT Owner can manage approvers';
  end if;
  if p_active is null then
    raise exception 'Approver active state is required';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A non-empty reason is required';
  end if;
  if not public.ot_user_is_approved_approver_identity(p_user_id) then
    raise exception 'Approver must be one of the three approved MVP identities';
  end if;
  if p_active and not exists (
    select 1
    from public.users u
    where u.id = p_user_id
      and u.is_active = true
  ) then
    raise exception 'Approver must be an active Workgrid user when activated';
  end if;
  perform public.ot_lock_idempotency('set_approver', p_idempotency_key);
  select a.changed_fields into v_result
  from public.ot_request_audit a
  where a.actor_user_id = v_actor_id and a.action = 'set_approver'
    and a.idempotency_key = p_idempotency_key;
  if found then
    return v_result;
  end if;
  select a.active into v_previous from public.ot_approvers a where a.user_id = p_user_id for update;
  if not p_active and exists (
    select 1
    from public.ot_requests r
    where r.approver_user_id = p_user_id
      and r.status in (
        'pending_approval', 'awaiting_consent', 'approved', 'revision_required',
        'actual_confirmation_required', 'pending_actual_verification',
        'compliance_review_required'
      )
  ) then
    raise exception 'Approver has pending approver work; reassign it before deactivation';
  end if;
  insert into public.ot_approvers (user_id, active)
  values (p_user_id, p_active)
  on conflict (user_id) do update set active = excluded.active;
  v_result := pg_catalog.jsonb_build_object(
    'userId', p_user_id, 'active', p_active, 'previousActive', v_previous, 'reason', pg_catalog.btrim(p_reason)
  );
  insert into public.ot_request_audit (
    actor_user_id, action, changed_fields, note, idempotency_key
  ) values (
    v_actor_id, 'set_approver', v_result, pg_catalog.btrim(p_reason), p_idempotency_key
  );
  return v_result;
end
$function$;

create or replace function public.ot_set_system_role(
  p_user_id uuid,
  p_role_code text,
  p_active boolean,
  p_reason text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_previous jsonb;
  v_result jsonb;
  v_target_email text;
begin
  if not public.ot_current_user_is_owner() then
    raise exception 'Only the OT Owner can manage OT system roles';
  end if;
  if p_active is null then
    raise exception 'OT system role active state is required';
  end if;
  if p_role_code not in ('owner', 'hr_admin') then
    raise exception 'OT system role must be owner or hr_admin';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'A non-empty reason is required';
  end if;
  if p_active then
    select pg_catalog.lower(pg_catalog.btrim(u.email))
    into v_target_email
    from public.users u
    where u.id = p_user_id and u.is_active = true;
    if not found or v_target_email not like '%@garena.com' then
      raise exception 'OT role holder must be an active Garena Workgrid user';
    end if;
    if p_role_code = 'owner'
       and v_target_email <> 'panuwee.w@garena.com' then
      raise exception 'The only approved OT Owner identity is panuwee.w@garena.com';
    end if;
    if p_role_code = 'hr_admin'
       and p_active = true
       and not public.ot_user_is_approved_approver_identity(p_user_id) then
      raise exception 'HR Admin must be one of the three approved MVP identities';
    end if;
  end if;
  perform public.ot_lock_idempotency('set_system_role', p_idempotency_key);
  select a.changed_fields into v_result
  from public.ot_request_audit a
  where a.actor_user_id = v_actor_id and a.action = 'set_system_role'
    and a.idempotency_key = p_idempotency_key;
  if found then
    return v_result;
  end if;
  if not p_active then
    select pg_catalog.to_jsonb(r) into v_previous
    from public.ot_system_roles r where r.user_id = p_user_id for update;
    if not found
       or p_role_code <> 'hr_admin'
       or v_previous->>'role_code' <> 'hr_admin' then
      raise exception 'Only an existing HR Admin role can be deactivated';
    end if;
  else
    select pg_catalog.to_jsonb(r) into v_previous
    from public.ot_system_roles r where r.user_id = p_user_id for update;
  end if;
  insert into public.ot_system_roles (user_id, role_code, active)
  values (p_user_id, p_role_code, p_active)
  on conflict (user_id) do update
  set role_code = excluded.role_code, active = excluded.active;
  if not exists (
    select 1
    from public.ot_system_roles r
    join public.users owner_user on owner_user.id = r.user_id
    where r.role_code = 'owner'
      and r.active = true
      and owner_user.is_active = true
      and pg_catalog.lower(pg_catalog.btrim(owner_user.email)) = 'panuwee.w@garena.com'
  ) then
    raise exception 'At least one active approved OT Owner is required';
  end if;
  v_result := pg_catalog.jsonb_build_object(
    'userId', p_user_id, 'roleCode', p_role_code, 'active', p_active,
    'previous', v_previous, 'reason', pg_catalog.btrim(p_reason)
  );
  insert into public.ot_request_audit (
    actor_user_id, action, changed_fields, note, idempotency_key
  ) values (
    v_actor_id, 'set_system_role', v_result, pg_catalog.btrim(p_reason), p_idempotency_key
  );
  return v_result;
end
$function$;

alter table public.ot_system_roles enable row level security;
alter table public.ot_approvers enable row level security;
alter table public.ot_requester_access enable row level security;
alter table public.ot_requester_access_audit enable row level security;
alter table public.ot_event_plans enable row level security;
alter table public.ot_requests enable row level security;
alter table public.ot_request_audit enable row level security;
alter table public.ot_export_batches enable row level security;
alter table public.ot_seatalk_notifications enable row level security;
alter table public.ot_seatalk_pending_rejections enable row level security;

drop policy if exists "employees can read own OT requests" on public.ot_requests;
create policy "employees can read own OT requests"
on public.ot_requests for select to authenticated
using (employee_user_id = (select auth.uid()));

drop policy if exists "assigned approvers can read assigned OT requests" on public.ot_requests;
create policy "assigned approvers can read assigned OT requests"
on public.ot_requests for select to authenticated
using (
  approver_user_id = (select auth.uid())
  and (select public.ot_current_user_is_eligible_approver())
);

drop policy if exists "OT Owner and HR Admin can read all OT requests" on public.ot_requests;
create policy "OT Owner and HR Admin can read all OT requests"
on public.ot_requests for select to authenticated
using (
  (select public.ot_current_user_is_owner())
  or (select public.ot_current_user_is_hr_admin())
);

revoke all on table public.ot_system_roles, public.ot_approvers,
  public.ot_event_plans, public.ot_requests, public.ot_request_audit,
  public.ot_export_batches, public.ot_seatalk_notifications,
  public.ot_seatalk_pending_rejections from public, anon, authenticated;
revoke all on table public.ot_requester_access from public, anon, authenticated;
revoke all on table public.ot_requester_access_audit from public, anon, authenticated;
grant select on public.ot_requests to authenticated;
revoke insert, update, delete on public.ot_request_audit from authenticated;

revoke all on function public.ot_require_current_user() from public, anon, authenticated;
revoke all on function public.ot_assert_reason(text, text) from public, anon, authenticated;
revoke all on function public.ot_assert_consent_version(text) from public, anon, authenticated;
revoke all on function public.ot_set_audit_actor_email_snapshot() from public, anon, authenticated;
revoke all on function public.ot_user_is_approved_approver_identity(uuid) from public, anon, authenticated;
revoke all on function public.ot_function_approver_id(text) from public, anon, authenticated;
revoke all on function public.ot_enqueue_seatalk_notification(uuid, text) from public, anon, authenticated;
revoke all on function public.ot_is_service_role_context() from public, anon, authenticated;
revoke all on function public.ot_seatalk_claim_dispatch(uuid, uuid) from public, anon, authenticated;
revoke all on function public.ot_seatalk_finish_dispatch(uuid, boolean, text, text) from public, anon, authenticated;
revoke all on function public.ot_seatalk_begin_rejection(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_seatalk_apply_rejection_reason(text, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_apply_plan_review(uuid, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.ot_week_start(timestamptz) from public, anon, authenticated;
revoke all on function public.ot_build_week_segments(timestamptz, timestamptz, integer, jsonb) from public, anon, authenticated;
revoke all on function public.ot_lock_employee_week_keys(jsonb) from public, anon, authenticated;
revoke all on function public.ot_lock_employee_weeks(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ot_projected_week_minutes_unchecked(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.ot_counted_week_minutes_unchecked(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.ot_assert_no_employee_overlap(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.ot_actual_week_minutes(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.ot_assert_planned_limit(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ot_guard_audit_append_only() from public, anon, authenticated;
revoke all on function public.ot_guard_requester_access_audit_append_only() from public, anon, authenticated;
revoke all on function public.ot_lock_idempotency(text, uuid) from public, anon, authenticated;

revoke all on function public.ot_current_user_is_owner() from public, anon, authenticated;
revoke all on function public.ot_current_user_is_hr_admin() from public, anon, authenticated;
revoke all on function public.ot_current_user_is_eligible_approver() from public, anon, authenticated;
revoke all on function public.ot_current_user_can_read_request(uuid) from public, anon, authenticated;
revoke all on function public.ot_calculate_occurrence_minutes(timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.ot_projected_week_minutes(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.ot_get_access_context() from public, anon, authenticated;
revoke all on function public.ot_resolve_current_requester_access() from public, anon, authenticated;
revoke all on function public.ot_require_current_requester_access() from public, anon, authenticated;
revoke all on function public.ot_get_my_dashboard(date) from public, anon, authenticated;
revoke all on function public.ot_list_my_requests(date) from public, anon, authenticated;
revoke all on function public.ot_get_manager_dashboard(date, text) from public, anon, authenticated;
revoke all on function public.ot_list_eligible_approvers() from public, anon, authenticated;
revoke all on function public.ot_list_people_for_event() from public, anon, authenticated;
revoke all on function public.ot_list_access_admin_identities() from public, anon, authenticated;
revoke all on function public.ot_list_requester_access() from public, anon, authenticated;
revoke all on function public.ot_upsert_requester_access(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ot_set_requester_access(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.ot_create_request(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ot_resubmit_plan(uuid, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_preview_event_plan(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.ot_create_event_plan(jsonb, uuid[], uuid) from public, anon, authenticated;
revoke all on function public.ot_record_consent(uuid, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_review_plan(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_seatalk_apply_review(uuid, text, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_submit_actual(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ot_request_actual_amendment(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_verify_actual(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_list_compliance_queue(date) from public, anon, authenticated;
revoke all on function public.ot_review_compliance(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_list_request_audit(uuid) from public, anon, authenticated;
revoke all on function public.ot_list_hr_ready(date) from public, anon, authenticated;
revoke all on function public.ot_mark_exported(uuid[], text, uuid) from public, anon, authenticated;
revoke all on function public.ot_reassign_pending_approver(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_set_approver(uuid, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_set_system_role(uuid, text, boolean, text, uuid) from public, anon, authenticated;

grant execute on function public.ot_current_user_is_owner() to authenticated;
grant execute on function public.ot_current_user_is_hr_admin() to authenticated;
grant execute on function public.ot_current_user_is_eligible_approver() to authenticated;
grant execute on function public.ot_current_user_can_read_request(uuid) to authenticated;
grant execute on function public.ot_calculate_occurrence_minutes(timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.ot_get_access_context() to authenticated;
grant execute on function public.ot_resolve_current_requester_access() to authenticated;
grant execute on function public.ot_get_my_dashboard(date) to authenticated;
grant execute on function public.ot_list_my_requests(date) to authenticated;
grant execute on function public.ot_get_manager_dashboard(date, text) to authenticated;
grant execute on function public.ot_list_eligible_approvers() to authenticated;
grant execute on function public.ot_list_people_for_event() to authenticated;
grant execute on function public.ot_list_access_admin_identities() to authenticated;
grant execute on function public.ot_list_requester_access() to authenticated;
grant execute on function public.ot_upsert_requester_access(jsonb, uuid) to authenticated;
grant execute on function public.ot_set_requester_access(uuid, boolean, uuid) to authenticated;
grant execute on function public.ot_create_request(jsonb, uuid) to authenticated;
grant execute on function public.ot_resubmit_plan(uuid, jsonb, text, uuid) to authenticated;
grant execute on function public.ot_preview_event_plan(jsonb, uuid[]) to authenticated;
grant execute on function public.ot_create_event_plan(jsonb, uuid[], uuid) to authenticated;
grant execute on function public.ot_record_consent(uuid, boolean, text, uuid) to authenticated;
grant execute on function public.ot_review_plan(uuid, text, text, uuid) to authenticated;
grant execute on function public.ot_seatalk_apply_review(uuid, text, text, text, uuid) to service_role;
grant execute on function public.ot_seatalk_claim_dispatch(uuid, uuid) to service_role;
grant execute on function public.ot_seatalk_finish_dispatch(uuid, boolean, text, text) to service_role;
grant execute on function public.ot_seatalk_begin_rejection(uuid, text, uuid) to service_role;
grant execute on function public.ot_seatalk_apply_rejection_reason(text, text, uuid) to service_role;
grant execute on function public.ot_submit_actual(uuid, jsonb, uuid) to authenticated;
grant execute on function public.ot_request_actual_amendment(uuid, text, uuid) to authenticated;
grant execute on function public.ot_verify_actual(uuid, text, text, uuid) to authenticated;
grant execute on function public.ot_list_compliance_queue(date) to authenticated;
grant execute on function public.ot_review_compliance(uuid, text, text, uuid) to authenticated;
grant execute on function public.ot_list_request_audit(uuid) to authenticated;
grant execute on function public.ot_list_hr_ready(date) to authenticated;
grant execute on function public.ot_mark_exported(uuid[], text, uuid) to authenticated;
grant execute on function public.ot_reassign_pending_approver(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.ot_set_approver(uuid, boolean, text, uuid) to authenticated;
grant execute on function public.ot_set_system_role(uuid, text, boolean, text, uuid) to authenticated;

commit;
