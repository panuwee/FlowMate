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
  constraint ot_event_plans_venue_required check (work_location_type <> 'venue' or pg_catalog.length(pg_catalog.btrim(pg_catalog.coalesce(venue, ''))) > 0),
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
  constraint ot_requests_venue_required check (work_location_type <> 'venue' or pg_catalog.length(pg_catalog.btrim(pg_catalog.coalesce(venue, ''))) > 0),
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
  action text not null,
  old_status text,
  new_status text,
  changed_fields jsonb not null default '{}'::jsonb,
  note text,
  idempotency_key uuid not null,
  created_at timestamptz not null default now(),
  constraint ot_request_audit_action_required check (pg_catalog.length(pg_catalog.btrim(action)) > 0)
);

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
create unique index if not exists ot_audit_idempotency_uidx
on public.ot_request_audit(
  actor_user_id,
  action,
  idempotency_key,
  (pg_catalog.coalesce(request_id, event_plan_id, '00000000-0000-0000-0000-000000000000'::uuid))
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
  'nithidol.k@garena.com',
  'weerayut@garena.com',
  'napol.a@garena.com'
)
on conflict (user_id) do update
set active = excluded.active;

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
  v_consent_statement_version text := pg_catalog.nullif(pg_catalog.btrim(p_consent_statement_version), '');
begin
  perform public.ot_lock_idempotency('record_consent', p_idempotency_key);
  if p_accept is null then
    raise exception 'Consent choice is required';
  end if;
  if v_consent_statement_version is null then
    raise exception 'Consent statement version is required';
  end if;
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
  perform public.ot_lock_employee_weeks(v_request.employee_user_id, v_request.planned_week_segments);
  select * into v_request from public.ot_requests r where r.id = p_request_id for update;
  if v_request.employee_consent is not null
     or v_request.status not in ('awaiting_consent', 'pending_actual_verification', 'compliance_review_required') then
    raise exception 'Consent state changed; reload this occurrence';
  end if;
  v_old_status := v_request.status;
  if p_accept then
    perform public.ot_assert_planned_limit(v_request.employee_user_id, v_request.planned_week_segments, v_request.id);
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
  v_request public.ot_requests;
  v_old_status text;
  v_new_status text;
begin
  perform public.ot_lock_idempotency('review_plan', p_idempotency_key);
  select * into v_request from public.ot_requests r where r.id = p_request_id;
  if not found or v_request.approver_user_id <> v_actor_id or not public.ot_current_user_is_eligible_approver() then
    raise exception 'Only the assigned active OT approver can review this plan';
  end if;
  if exists (
    select 1 from public.ot_request_audit a
    where a.request_id = p_request_id and a.actor_user_id = v_actor_id
      and a.action = 'review_plan' and a.idempotency_key = p_idempotency_key
  ) then
    return pg_catalog.to_jsonb(v_request);
  end if;
  if v_request.source <> 'employee_request' or v_request.status not in ('pending_approval', 'revision_required') then
    raise exception 'This OT plan is not awaiting approver review';
  end if;
  if p_decision not in ('approved', 'rejected', 'revision_required') then
    raise exception 'Plan decision must be approved, rejected, or revision_required';
  end if;
  perform public.ot_lock_employee_weeks(v_request.employee_user_id, v_request.planned_week_segments);
  select * into v_request from public.ot_requests r where r.id = p_request_id for update;
  if v_request.status not in ('pending_approval', 'revision_required') then
    raise exception 'Plan state changed; reload this request';
  end if;
  if p_decision = 'approved' then
    perform public.ot_assert_planned_limit(v_request.employee_user_id, v_request.planned_week_segments, v_request.id);
    v_new_status := 'approved';
  else
    v_new_status := p_decision;
  end if;
  v_old_status := v_request.status;
  update public.ot_requests
  set plan_decision = p_decision,
      plan_decision_note = pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_note, '')), ''),
      plan_reviewed_by_user_id = v_actor_id,
      plan_reviewed_at = now(),
      status = v_new_status,
      updated_at = now()
  where id = p_request_id returning * into v_request;
  insert into public.ot_request_audit (
    request_id, actor_user_id, action, old_status, new_status, changed_fields, note, idempotency_key
  ) values (
    v_request.id, v_actor_id, 'review_plan', v_old_status, v_request.status,
    pg_catalog.jsonb_build_object('decision', p_decision), p_note, p_idempotency_key
  );
  return pg_catalog.to_jsonb(v_request);
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
  v_start_at := pg_catalog.coalesce(p_payload->>'actualStartAt', p_payload->>'actual_start_at')::timestamptz;
  v_end_at := pg_catalog.coalesce(p_payload->>'actualEndAt', p_payload->>'actual_end_at')::timestamptz;
  v_break_minutes := pg_catalog.coalesce(pg_catalog.coalesce(p_payload->>'actualBreakMinutes', p_payload->>'actual_break_minutes')::integer, 0);
  v_minutes := public.ot_calculate_occurrence_minutes(v_start_at, v_end_at, v_break_minutes);
  v_variance_reason := pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(
    p_payload->>'actualVarianceReason',
    p_payload->>'actual_variance_reason',
    p_payload->>'varianceReason'
  )), '');
  v_segments := public.ot_build_week_segments(
    v_start_at, v_end_at, v_break_minutes,
    pg_catalog.coalesce(p_payload->'actualWeekSegments', p_payload->'actual_week_segments')
  );
  with affected_weeks as (
    select (pg_catalog.coalesce(item->>'weekStart', item->>'week_start'))::date as week_start
    from pg_catalog.jsonb_array_elements(pg_catalog.coalesce(v_request.actual_week_segments, '[]'::jsonb)) item
    union
    select (pg_catalog.coalesce(item->>'weekStart', item->>'week_start'))::date as week_start
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
  if v_request.status in ('cancelled', 'exported', 'hr_ready') then
    raise exception 'Actual OT cannot be changed after cancellation, HR readiness, or export';
  end if;
  v_variance_minutes := pg_catalog.abs(v_minutes - v_request.planned_minutes);
  if v_variance_minutes > 30 and v_variance_reason is null then
    raise exception 'Actual variance reason is required when actual net minutes differ from planned net minutes by more than 30';
  end if;
  for v_segment in select item from pg_catalog.jsonb_array_elements(v_segments) item
  loop
    v_week := (v_segment->>'weekStart')::date;
    v_total := public.ot_actual_week_minutes(v_request.employee_user_id, v_week, v_request.id)
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
  if v_request.status not in ('pending_actual_verification', 'compliance_review_required') then
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
  perform public.ot_lock_employee_weeks(v_request.employee_user_id, v_request.actual_week_segments);
  select * into v_request from public.ot_requests r where r.id = p_request_id for update;
  if v_request.status not in ('pending_actual_verification', 'compliance_review_required') then
    raise exception 'Actual OT state changed and is no longer awaiting verification';
  end if;
  if v_request.source = 'event_plan'
     and v_request.employee_consent is distinct from 'accepted' then
    raise exception 'Employee consent state changed before actual OT verification';
  end if;
  if v_request.actual_submitted_at is null or v_request.actual_week_segments is null then
    raise exception 'Actual OT state changed; reload this request';
  end if;
  if p_decision = 'approved' then
    v_new_status := case
      when not v_request.compliance_required then 'hr_ready'
      when v_request.compliance_outcome in ('approved', 'cleared') then 'hr_ready'
      when v_request.compliance_outcome = 'rejected' then 'rejected'
      else 'compliance_review_required'
    end;
  else
    v_new_status := p_decision;
  end if;
  v_old_status := v_request.status;
  update public.ot_requests
  set actual_decision = p_decision,
      actual_decision_note = pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_note, '')), ''),
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
    p_note, p_idempotency_key
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
      and u.is_active = true
      and pg_catalog.lower(pg_catalog.btrim(u.email)) in (
        'nithidol.k@garena.com',
        'weerayut@garena.com',
        'napol.a@garena.com'
      )
  );
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
      and pg_catalog.lower(pg_catalog.btrim(u.email)) like '%@garena.com'
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
      and pg_catalog.lower(pg_catalog.btrim(u.email)) in (
        'nithidol.k@garena.com',
        'weerayut@garena.com',
        'napol.a@garena.com'
      )
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
  where pg_catalog.coalesce(item->>'weekStart', item->>'week_start') = v_first_week::text;
  select (item->>'minutes')::integer
  into v_last_minutes
  from pg_catalog.jsonb_array_elements(p_supplied_segments) item
  where pg_catalog.coalesce(item->>'weekStart', item->>'week_start') = v_last_week::text;

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
          or pg_catalog.coalesce(r.actual_week_segments, '[]'::jsonb) @> pg_catalog.jsonb_build_array(
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
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'employeeUserId', p_employee_user_id,
      'weekStart', week_start
    ) order by week_start
  ), '[]'::jsonb)
  into v_keys
  from (
    select distinct (pg_catalog.coalesce(item->>'weekStart', item->>'week_start'))::date as week_start
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
  select pg_catalog.coalesce(pg_catalog.sum((segment->>'minutes')::integer), 0)::integer
  from public.ot_requests r
  cross join lateral pg_catalog.jsonb_array_elements(r.planned_week_segments) segment
  where r.employee_user_id = p_employee_user_id
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
    and r.status in (
      'pending_approval', 'awaiting_consent', 'approved',
      'actual_confirmation_required', 'pending_actual_verification',
      'compliance_review_required', 'hr_ready', 'exported'
    )
    and pg_catalog.coalesce(segment->>'weekStart', segment->>'week_start') = p_week_start::text;
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
  select pg_catalog.coalesce(pg_catalog.sum((segment->>'minutes')::integer), 0)::integer
  from public.ot_requests r
  cross join lateral pg_catalog.jsonb_array_elements(pg_catalog.coalesce(r.actual_week_segments, '[]'::jsonb)) segment
  where r.employee_user_id = p_employee_user_id
    and (p_exclude_request_id is null or r.id <> p_exclude_request_id)
    and r.status <> 'cancelled'
    and pg_catalog.coalesce(segment->>'weekStart', segment->>'week_start') = p_week_start::text;
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
    v_week := pg_catalog.coalesce(v_segment->>'weekStart', v_segment->>'week_start')::date;
    v_added := (v_segment->>'minutes')::integer;
    v_current := public.ot_projected_week_minutes_unchecked(p_employee_user_id, v_week, p_exclude_request_id);
    v_remaining := pg_catalog.greatest(0, 2160 - v_current);
    if v_current + v_added > 2160 then
      raise exception 'OT weekly limit exceeded: current=% minutes, added=% minutes, remaining=% minutes, affected_week=%',
        v_current, v_added, v_remaining, v_week;
    end if;
  end loop;
end
$function$;

create or replace function public.ot_guard_audit_append_only()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'OT request audit is append-only';
end
$function$;

drop trigger if exists ot_request_audit_append_only on public.ot_request_audit;
create trigger ot_request_audit_append_only
before update or delete on public.ot_request_audit
for each row execute function public.ot_guard_audit_append_only();

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

create or replace function public.ot_get_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
begin
  return pg_catalog.jsonb_build_object(
    'userId', v_actor_id,
    'isOwner', public.ot_current_user_is_owner(),
    'isHrAdmin', public.ot_current_user_is_hr_admin(),
    'isEligibleApprover', public.ot_current_user_is_eligible_approver(),
    'weeklyLimitMinutes', 2160,
    'timezone', 'Asia/Bangkok',
    'weekStartsOn', 'monday'
  );
end
$function$;

create or replace function public.ot_list_my_requests(p_week_start date default null)
returns setof public.ot_requests
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
begin
  return query
  select r.*
  from public.ot_requests r
  where r.employee_user_id = v_actor_id
    and (
      p_week_start is null
      or r.planned_week_segments @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
      or pg_catalog.coalesce(r.actual_week_segments, '[]'::jsonb) @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
    )
  order by r.planned_start_at desc, r.id desc;
end
$function$;

create or replace function public.ot_get_my_dashboard(p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := public.ot_require_current_user();
  v_rows jsonb;
  v_planned integer;
  v_actual integer;
begin
  if p_week_start is null or pg_catalog.date_part('isodow', p_week_start)::integer <> 1 then
    raise exception 'Week start must be a Monday date in the Bangkok workweek';
  end if;
  select
    pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.planned_start_at, r.id), '[]'::jsonb),
    public.ot_projected_week_minutes(v_actor_id, p_week_start, null),
    public.ot_actual_week_minutes(v_actor_id, p_week_start, null)
  into v_rows, v_planned, v_actual
  from public.ot_requests r
  where r.employee_user_id = v_actor_id
    and (
      r.planned_week_segments @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
      or pg_catalog.coalesce(r.actual_week_segments, '[]'::jsonb) @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
    );
  return pg_catalog.jsonb_build_object(
    'weekStart', p_week_start,
    'plannedMinutes', v_planned,
    'actualMinutes', v_actual,
    'remainingPlannedMinutes', pg_catalog.greatest(0, 2160 - v_planned),
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
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.planned_start_at, r.id), '[]'::jsonb)
  into v_rows
  from public.ot_requests r
  where (v_full_access or r.approver_user_id = v_actor_id)
    and (p_function_code is null or r.function_code = p_function_code)
    and (
      r.planned_week_segments @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
      or pg_catalog.coalesce(r.actual_week_segments, '[]'::jsonb) @> pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('weekStart', p_week_start))
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
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(
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
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(
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
  v_approver_user_id uuid;
  v_start_at timestamptz;
  v_end_at timestamptz;
  v_break_minutes integer;
  v_minutes integer;
  v_segments jsonb;
  v_consent_statement_version text;
  v_request public.ot_requests;
begin
  perform public.ot_lock_idempotency('create_request', p_idempotency_key);
  select * into v_request
  from public.ot_requests r
  where r.created_by_user_id = v_actor_id
    and r.employee_user_id = v_actor_id
    and r.idempotency_key = p_idempotency_key;
  if found then
    return pg_catalog.to_jsonb(v_request);
  end if;

  v_consent_statement_version := pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(
    p_payload->>'consentStatementVersion',
    p_payload->>'consent_statement_version'
  )), '');
  if v_consent_statement_version is null then
    raise exception 'Consent statement version is required';
  end if;

  v_approver_user_id := pg_catalog.coalesce(p_payload->>'approverUserId', p_payload->>'approver_user_id')::uuid;
  if not public.ot_user_is_approved_approver_identity(v_approver_user_id)
     or not exists (
    select 1 from public.ot_approvers a join public.users u on u.id = a.user_id
    where a.user_id = v_approver_user_id and a.active = true and u.is_active = true
  ) then
    raise exception 'An active approved OT approver is required';
  end if;
  v_start_at := pg_catalog.coalesce(p_payload->>'plannedStartAt', p_payload->>'planned_start_at')::timestamptz;
  v_end_at := pg_catalog.coalesce(p_payload->>'plannedEndAt', p_payload->>'planned_end_at')::timestamptz;
  v_break_minutes := pg_catalog.coalesce(pg_catalog.coalesce(p_payload->>'plannedBreakMinutes', p_payload->>'planned_break_minutes')::integer, 0);
  v_minutes := public.ot_calculate_occurrence_minutes(v_start_at, v_end_at, v_break_minutes);
  v_segments := public.ot_build_week_segments(
    v_start_at,
    v_end_at,
    v_break_minutes,
    pg_catalog.coalesce(p_payload->'plannedWeekSegments', p_payload->'planned_week_segments')
  );
  perform public.ot_assert_planned_limit(v_actor_id, v_segments, null);

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
    pg_catalog.coalesce(p_payload->>'functionCode', p_payload->>'function_code'),
    pg_catalog.btrim(p_payload->>'title'),
    pg_catalog.coalesce(p_payload->>'dayType', p_payload->>'day_type'),
    pg_catalog.coalesce(p_payload->>'workLocationType', p_payload->>'work_location_type'),
    pg_catalog.nullif(pg_catalog.btrim(p_payload->>'venue'), ''),
    pg_catalog.coalesce(p_payload->>'reasonCode', p_payload->>'reason_code'),
    pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_payload->>'reasonDetail', p_payload->>'reason_detail')), ''),
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
  return pg_catalog.to_jsonb(v_request);
end
$function$;

create or replace function public.ot_preview_event_plan(
  p_payload jsonb,
  p_employee_user_ids uuid[]
)
returns jsonb
language plpgsql
stable
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
  v_start_at := pg_catalog.coalesce(p_payload->>'plannedStartAt', p_payload->>'planned_start_at')::timestamptz;
  v_end_at := pg_catalog.coalesce(p_payload->>'plannedEndAt', p_payload->>'planned_end_at')::timestamptz;
  v_break_minutes := pg_catalog.coalesce(pg_catalog.coalesce(p_payload->>'plannedBreakMinutes', p_payload->>'planned_break_minutes')::integer, 0);
  v_segments := public.ot_build_week_segments(
    v_start_at, v_end_at, v_break_minutes,
    pg_catalog.coalesce(p_payload->'plannedWeekSegments', p_payload->'planned_week_segments')
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
      v_current := public.ot_projected_week_minutes_unchecked(v_employee_user_id, v_week, null);
      v_checks := v_checks || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'weekStart', v_week,
        'currentMinutes', v_current,
        'addedMinutes', v_added,
        'remainingMinutes', pg_catalog.greatest(0, 2160 - v_current),
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
    select pg_catalog.coalesce(pg_catalog.array_agg(r.id order by r.id), '{}'::uuid[])
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
  v_approver_user_id := pg_catalog.coalesce(
    pg_catalog.coalesce(p_payload->>'approverUserId', p_payload->>'approver_user_id')::uuid,
    v_actor_id
  );
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
  v_start_at := pg_catalog.coalesce(p_payload->>'plannedStartAt', p_payload->>'planned_start_at')::timestamptz;
  v_end_at := pg_catalog.coalesce(p_payload->>'plannedEndAt', p_payload->>'planned_end_at')::timestamptz;
  v_break_minutes := pg_catalog.coalesce(pg_catalog.coalesce(p_payload->>'plannedBreakMinutes', p_payload->>'planned_break_minutes')::integer, 0);
  v_minutes := public.ot_calculate_occurrence_minutes(v_start_at, v_end_at, v_break_minutes);
  v_segments := public.ot_build_week_segments(
    v_start_at, v_end_at, v_break_minutes,
    pg_catalog.coalesce(p_payload->'plannedWeekSegments', p_payload->'planned_week_segments')
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
  end loop;

  insert into public.ot_event_plans (
    title, function_code, work_location_type, venue, reason_code, reason_detail,
    planned_start_at, planned_end_at, planned_break_minutes,
    approver_user_id, created_by_user_id, idempotency_key
  ) values (
    pg_catalog.btrim(p_payload->>'title'),
    pg_catalog.coalesce(p_payload->>'functionCode', p_payload->>'function_code'),
    pg_catalog.coalesce(p_payload->>'workLocationType', p_payload->>'work_location_type'),
    pg_catalog.nullif(pg_catalog.btrim(p_payload->>'venue'), ''),
    pg_catalog.coalesce(p_payload->>'reasonCode', p_payload->>'reason_code'),
    pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_payload->>'reasonDetail', p_payload->>'reason_detail')), ''),
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
      pg_catalog.coalesce(p_payload->>'dayType', p_payload->>'day_type'),
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
  if not public.ot_current_user_is_owner() and not public.ot_current_user_is_hr_admin() then
    raise exception 'OT Owner or HR/Admin access required';
  end if;
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.actual_start_at, r.id), '[]'::jsonb)
  into v_result
  from public.ot_requests r
  where r.compliance_required = true
    and r.status = 'compliance_review_required'
    and (r.compliance_reviewed_at is null or r.compliance_outcome = 'action_required')
    and (
      p_week_start is null
      or pg_catalog.coalesce(r.actual_week_segments, '[]'::jsonb)
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
  if pg_catalog.length(pg_catalog.btrim(pg_catalog.coalesce(p_note, ''))) = 0 then
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
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.created_at, a.id), '[]'::jsonb)
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
  if not public.ot_current_user_is_owner() and not public.ot_current_user_is_hr_admin() then
    raise exception 'OT Owner or HR/Admin access required';
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
    and (not r.compliance_required or r.compliance_reviewed_at is not null)
    and (
      p_week_start is null
      or pg_catalog.coalesce(r.actual_week_segments, '[]'::jsonb)
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
  if not public.ot_current_user_is_owner() and not public.ot_current_user_is_hr_admin() then
    raise exception 'OT Owner or HR/Admin access required';
  end if;
  if p_request_ids is null or pg_catalog.cardinality(p_request_ids) = 0
     or pg_catalog.cardinality(p_request_ids) <> (
       select pg_catalog.count(distinct request_id) from pg_catalog.unnest(p_request_ids) request_id
     ) then
    raise exception 'A non-empty unique OT request list is required';
  end if;
  if pg_catalog.length(pg_catalog.btrim(pg_catalog.coalesce(p_batch_name, ''))) = 0 then
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
      (pg_catalog.coalesce(segment->>'weekStart', segment->>'week_start'))::date as week_start
    from public.ot_requests r
    cross join lateral pg_catalog.jsonb_array_elements(
      pg_catalog.coalesce(r.actual_week_segments, '[]'::jsonb)
    ) segment
    where r.id = any(p_request_ids)
  )
  select pg_catalog.coalesce(pg_catalog.jsonb_agg(
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
       or (v_request.compliance_required and v_request.compliance_reviewed_at is null) then
      raise exception 'Request % is not eligible for HR export', v_request_id;
    end if;
    select * into v_request from public.ot_requests r where r.id = v_request_id for update;
    if v_request.status <> 'hr_ready' or v_request.hr_ready_at is null
       or (v_request.compliance_required and v_request.compliance_reviewed_at is null) then
      raise exception 'Request % changed and is no longer eligible for HR export', v_request_id;
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
  if pg_catalog.length(pg_catalog.btrim(pg_catalog.coalesce(p_reason, ''))) = 0 then
    raise exception 'A non-empty reason is required';
  end if;
  if not public.ot_user_is_approved_approver_identity(p_user_id) then
    raise exception 'Approver must be one of the three approved MVP identities';
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
  if pg_catalog.length(pg_catalog.btrim(pg_catalog.coalesce(p_reason, ''))) = 0 then
    raise exception 'A non-empty reason is required';
  end if;
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
     and not public.ot_user_is_approved_approver_identity(p_user_id) then
    raise exception 'HR Admin must be one of the three approved MVP identities';
  end if;
  perform public.ot_lock_idempotency('set_system_role', p_idempotency_key);
  select a.changed_fields into v_result
  from public.ot_request_audit a
  where a.actor_user_id = v_actor_id and a.action = 'set_system_role'
    and a.idempotency_key = p_idempotency_key;
  if found then
    return v_result;
  end if;
  select pg_catalog.to_jsonb(r) into v_previous
  from public.ot_system_roles r where r.user_id = p_user_id for update;
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
alter table public.ot_event_plans enable row level security;
alter table public.ot_requests enable row level security;
alter table public.ot_request_audit enable row level security;
alter table public.ot_export_batches enable row level security;

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
  public.ot_export_batches from public, anon, authenticated;
grant select on public.ot_requests to authenticated;
revoke insert, update, delete on public.ot_request_audit from authenticated;

revoke all on function public.ot_require_current_user() from public, anon, authenticated;
revoke all on function public.ot_user_is_approved_approver_identity(uuid) from public, anon, authenticated;
revoke all on function public.ot_week_start(timestamptz) from public, anon, authenticated;
revoke all on function public.ot_build_week_segments(timestamptz, timestamptz, integer, jsonb) from public, anon, authenticated;
revoke all on function public.ot_lock_employee_week_keys(jsonb) from public, anon, authenticated;
revoke all on function public.ot_lock_employee_weeks(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.ot_projected_week_minutes_unchecked(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.ot_actual_week_minutes(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.ot_assert_planned_limit(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ot_guard_audit_append_only() from public, anon, authenticated;
revoke all on function public.ot_lock_idempotency(text, uuid) from public, anon, authenticated;

revoke all on function public.ot_current_user_is_owner() from public, anon, authenticated;
revoke all on function public.ot_current_user_is_hr_admin() from public, anon, authenticated;
revoke all on function public.ot_current_user_is_eligible_approver() from public, anon, authenticated;
revoke all on function public.ot_current_user_can_read_request(uuid) from public, anon, authenticated;
revoke all on function public.ot_calculate_occurrence_minutes(timestamptz, timestamptz, integer) from public, anon, authenticated;
revoke all on function public.ot_projected_week_minutes(uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.ot_get_access_context() from public, anon, authenticated;
revoke all on function public.ot_get_my_dashboard(date) from public, anon, authenticated;
revoke all on function public.ot_list_my_requests(date) from public, anon, authenticated;
revoke all on function public.ot_get_manager_dashboard(date, text) from public, anon, authenticated;
revoke all on function public.ot_list_eligible_approvers() from public, anon, authenticated;
revoke all on function public.ot_list_people_for_event() from public, anon, authenticated;
revoke all on function public.ot_create_request(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ot_preview_event_plan(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.ot_create_event_plan(jsonb, uuid[], uuid) from public, anon, authenticated;
revoke all on function public.ot_record_consent(uuid, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_review_plan(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_submit_actual(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.ot_verify_actual(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_list_compliance_queue(date) from public, anon, authenticated;
revoke all on function public.ot_review_compliance(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_list_request_audit(uuid) from public, anon, authenticated;
revoke all on function public.ot_list_hr_ready(date) from public, anon, authenticated;
revoke all on function public.ot_mark_exported(uuid[], text, uuid) from public, anon, authenticated;
revoke all on function public.ot_set_approver(uuid, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.ot_set_system_role(uuid, text, boolean, text, uuid) from public, anon, authenticated;

grant execute on function public.ot_current_user_is_owner() to authenticated;
grant execute on function public.ot_current_user_is_hr_admin() to authenticated;
grant execute on function public.ot_current_user_is_eligible_approver() to authenticated;
grant execute on function public.ot_current_user_can_read_request(uuid) to authenticated;
grant execute on function public.ot_calculate_occurrence_minutes(timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.ot_projected_week_minutes(uuid, date, uuid) to authenticated;
grant execute on function public.ot_get_access_context() to authenticated;
grant execute on function public.ot_get_my_dashboard(date) to authenticated;
grant execute on function public.ot_list_my_requests(date) to authenticated;
grant execute on function public.ot_get_manager_dashboard(date, text) to authenticated;
grant execute on function public.ot_list_eligible_approvers() to authenticated;
grant execute on function public.ot_list_people_for_event() to authenticated;
grant execute on function public.ot_create_request(jsonb, uuid) to authenticated;
grant execute on function public.ot_preview_event_plan(jsonb, uuid[]) to authenticated;
grant execute on function public.ot_create_event_plan(jsonb, uuid[], uuid) to authenticated;
grant execute on function public.ot_record_consent(uuid, boolean, text, uuid) to authenticated;
grant execute on function public.ot_review_plan(uuid, text, text, uuid) to authenticated;
grant execute on function public.ot_submit_actual(uuid, jsonb, uuid) to authenticated;
grant execute on function public.ot_verify_actual(uuid, text, text, uuid) to authenticated;
grant execute on function public.ot_list_compliance_queue(date) to authenticated;
grant execute on function public.ot_review_compliance(uuid, text, text, uuid) to authenticated;
grant execute on function public.ot_list_request_audit(uuid) to authenticated;
grant execute on function public.ot_list_hr_ready(date) to authenticated;
grant execute on function public.ot_mark_exported(uuid[], text, uuid) to authenticated;
grant execute on function public.ot_set_approver(uuid, boolean, text, uuid) to authenticated;
grant execute on function public.ot_set_system_role(uuid, text, boolean, text, uuid) to authenticated;

commit;
