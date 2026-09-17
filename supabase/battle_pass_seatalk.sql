-- Phase 3: notify-only SeaTalk delivery for Battle Pass automation.
-- Additive installer. Sending is disabled and the cron job is installed PAUSED.
begin;

alter table battle_pass_private.monthly_settings
  add column if not exists seatalk_enabled boolean not null default false,
  add column if not exists seatalk_app_id text not null default 'NTgyNzAzMjc5MjE4',
  add column if not exists seatalk_group_id text not null default 'ODg5NDI1MDQwODI3',
  add column if not exists seatalk_operator_email text not null default 'panuwee.w@garena.com',
  add column if not exists flowmate_base_url text not null default 'https://panuwee.github.io/FlowMate',
  add column if not exists seatalk_activation_cutoff timestamptz,
  add column if not exists seatalk_last_detected_at timestamptz;

-- Correct the earlier value that was the Bot SeaTalk ID, not the Open Platform App ID.
update battle_pass_private.monthly_settings
set seatalk_app_id='NTgyNzAzMjc5MjE4'
where singleton and seatalk_app_id='9176915525';

create table if not exists battle_pass_private.seatalk_notifications (
  notification_id uuid primary key default gen_random_uuid(),
  domain text not null default 'battle_pass' check (domain = 'battle_pass'),
  event_kind text not null check (event_kind in ('brief_ready','run_failed','run_held')),
  subject_key text not null check (length(subject_key) between 1 and 250),
  recipient_kind text not null check (recipient_kind in ('group','user')),
  recipient_key text not null check (length(recipient_key) between 1 and 250),
  period text check (period is null or period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 8000),
  template_version integer not null default 1 check (template_version between 1 and 1000),
  eligible_at timestamptz not null default clock_timestamp(),
  status text not null default 'pending'
    check (status in ('pending','dispatching','sent','failed','delivery_unknown','cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  next_attempt_at timestamptz,
  dispatch_key uuid,
  lease_expires_at timestamptz,
  send_started_at timestamptz,
  seatalk_message_id text,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[A-Za-z0-9_.:-]{1,100}$'),
  status_reason text check (status_reason is null or status_reason ~ '^[a-z0-9_.:-]{1,100}$'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (domain,event_kind,subject_key,recipient_kind,recipient_key),
  check ((status = 'dispatching') = (dispatch_key is not null and lease_expires_at is not null)),
  check (status <> 'sent' or seatalk_message_id is not null)
);

alter table battle_pass_private.seatalk_notifications enable row level security;
revoke all on battle_pass_private.seatalk_notifications from public, anon, authenticated, service_role;

create index if not exists battle_pass_seatalk_due_idx
  on battle_pass_private.seatalk_notifications (coalesce(next_attempt_at,eligible_at),eligible_at,notification_id)
  where status in ('pending','failed');
create index if not exists battle_pass_seatalk_expired_lease_idx
  on battle_pass_private.seatalk_notifications (lease_expires_at,notification_id)
  where status = 'dispatching';
create index if not exists battle_pass_seatalk_health_idx
  on battle_pass_private.seatalk_notifications (status,updated_at desc);

create or replace function battle_pass_private.seatalk_retry_delay_seconds(p_attempt integer)
returns integer language sql immutable set search_path='' as $$
  select least(21600, 60 * (2 ^ greatest(0, least(coalesce(p_attempt,1),9) - 1)))::integer
$$;
revoke all on function battle_pass_private.seatalk_retry_delay_seconds(integer)
  from public, anon, authenticated, service_role;

create or replace function battle_pass_private.seatalk_safe_code(p_value text,p_fallback text)
returns text language sql immutable set search_path='' as $$
  select case when p_value ~ '^[A-Za-z0-9_.:-]{1,100}$' then p_value else p_fallback end
$$;
revoke all on function battle_pass_private.seatalk_safe_code(text,text)
  from public, anon, authenticated, service_role;

-- Detect committed readiness and durable failure/hold evidence. Never sends and never raises
-- into the production worker: the function is called later by its own paused cron job.
create or replace function battle_pass_private.seatalk_detect()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_settings battle_pass_private.monthly_settings%rowtype;
  v_inserted integer := 0;
  v_cancelled integer := 0;
  v_row_count integer := 0;
begin
  select * into v_settings from battle_pass_private.monthly_settings where singleton for update;
  if not found then raise exception 'Battle Pass settings unavailable'; end if;

  update battle_pass_private.monthly_settings
    set seatalk_last_detected_at = clock_timestamp() where singleton;

  -- A ready brief is all-or-nothing: committed Working Sheet row, exact relational and URL
  -- linkage, and the Creative Request still Unassigned.
  insert into battle_pass_private.seatalk_notifications(
    event_kind,subject_key,recipient_kind,recipient_key,period,payload,eligible_at,status,status_reason)
  select 'brief_ready', r.period || ':' || r.brief_id::text, 'group', v_settings.seatalk_group_id,
    r.period,
    jsonb_build_object(
      'period',r.period,
      'displayId',w.display_id,
      'title',left(w.title,200),
      'status','unassigned',
      'url',rtrim(v_settings.flowmate_base_url,'/') || '/home/#detail/' || w.display_id,
      'occurredAt',r.updated_at),
    greatest(r.updated_at, v_settings.seatalk_activation_cutoff),
    case when v_settings.seatalk_activation_cutoff is not null
      and r.updated_at >= v_settings.seatalk_activation_cutoff then 'pending' else 'cancelled' end,
    case when v_settings.seatalk_activation_cutoff is not null
      and r.updated_at >= v_settings.seatalk_activation_cutoff then null else 'pre_activation' end
  from battle_pass_private.monthly_runs r
  join public.work_items w on w.id = r.brief_id
  join public.marketing_content_items m on m.id = r.task_id
  where r.mode = 'production' and r.state = 'complete'
    and w.work_type = 'creative_request' and w.status = 'unassigned'
    and m.flowmate_work_item_id = w.id
    and trim(coalesce(m.brief_link,'')) =
      rtrim(v_settings.flowmate_base_url,'/') || '/home/#detail/' || w.display_id
    and coalesce(v_settings.seatalk_group_id,'') <> ''
  on conflict (domain,event_kind,subject_key,recipient_kind,recipient_key) do nothing;
  get diagnostics v_inserted = row_count;

  -- A queued readiness message may become stale before dispatch if assignment advances.
  update battle_pass_private.seatalk_notifications n
    set status='cancelled', status_reason='readiness_stale', updated_at=clock_timestamp(),
        dispatch_key=null, lease_expires_at=null, next_attempt_at=null
  where n.event_kind='brief_ready' and n.status in ('pending','failed')
    and not exists (
      select 1 from battle_pass_private.monthly_runs r
      join public.work_items w on w.id=r.brief_id
      join public.marketing_content_items m on m.id=r.task_id
      where r.mode='production' and r.period=n.period and r.state='complete'
        and n.subject_key=r.period || ':' || r.brief_id::text
        and w.work_type='creative_request' and w.status='unassigned'
        and m.flowmate_work_item_id=w.id
        and trim(coalesce(m.brief_link,''))=
          rtrim(v_settings.flowmate_base_url,'/') || '/home/#detail/' || w.display_id);
  get diagnostics v_cancelled = row_count;

  -- Tick failures also cover failures recorded before a monthly_runs row can be resolved.
  with failed as (
    select t.run_id,
      coalesce(r.period,
        case when coalesce(t.detail->>'period',t.detail#>>'{plan,next,period}')
          ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'
          then coalesce(t.detail->>'period',t.detail#>>'{plan,next,period}') end) as period,
      battle_pass_private.seatalk_safe_code(t.detail->>'stage','unknown_stage') as stage,
      battle_pass_private.seatalk_safe_code(coalesce(t.detail->>'code',t.code),'unknown_error') as code,
      t.checked_at as occurred_at
    from battle_pass_private.production_ticks t
    left join battle_pass_private.monthly_runs r on r.mode='production' and r.run_id=t.run_id
    where t.status='failed'
    union all
    select r.run_id,r.period,'production',
      battle_pass_private.seatalk_safe_code(r.checkpoint->>'lastError','unknown_error'),r.updated_at
    from battle_pass_private.monthly_runs r
    where r.mode='production' and r.state='failed'
      and not exists (select 1 from battle_pass_private.production_ticks t
        where t.run_id=r.run_id and t.status='failed')
  )
  insert into battle_pass_private.seatalk_notifications(
    event_kind,subject_key,recipient_kind,recipient_key,period,payload,eligible_at,status,status_reason)
  select 'run_failed', f.run_id::text || ':' || md5(f.stage || '|' || f.code),
    'user',v_settings.seatalk_operator_email,f.period,
    jsonb_strip_nulls(jsonb_build_object(
      'period',f.period,'stage',f.stage,'code',f.code,'occurredAt',f.occurred_at,
      'url',rtrim(v_settings.flowmate_base_url,'/') || '/home/battle-pass-status.html')),
    greatest(f.occurred_at,v_settings.seatalk_activation_cutoff),
    case when v_settings.seatalk_activation_cutoff is not null
      and f.occurred_at >= v_settings.seatalk_activation_cutoff then 'pending' else 'cancelled' end,
    case when v_settings.seatalk_activation_cutoff is not null
      and f.occurred_at >= v_settings.seatalk_activation_cutoff then null else 'pre_activation' end
  from failed f where coalesce(v_settings.seatalk_operator_email,'') <> ''
  on conflict (domain,event_kind,subject_key,recipient_kind,recipient_key) do nothing;
  get diagnostics v_row_count = row_count;
  v_inserted := v_inserted + v_row_count;

  insert into battle_pass_private.seatalk_notifications(
    event_kind,subject_key,recipient_kind,recipient_key,period,payload,eligible_at,status,status_reason)
  select 'run_held',r.period || ':' || md5(coalesce(r.checkpoint->'hold','null'::jsonb)::text),
    'user',v_settings.seatalk_operator_email,r.period,
    jsonb_build_object(
      'period',r.period,'stage','source_review',
      'code',battle_pass_private.seatalk_safe_code(r.checkpoint->>'hold','review_required'),
      'occurredAt',r.updated_at,
      'url',rtrim(v_settings.flowmate_base_url,'/') || '/home/battle-pass-status.html'),
    greatest(r.updated_at,v_settings.seatalk_activation_cutoff),
    case when v_settings.seatalk_activation_cutoff is not null
      and r.updated_at >= v_settings.seatalk_activation_cutoff then 'pending' else 'cancelled' end,
    case when v_settings.seatalk_activation_cutoff is not null
      and r.updated_at >= v_settings.seatalk_activation_cutoff then null else 'pre_activation' end
  from battle_pass_private.monthly_runs r
  where r.mode='production' and r.checkpoint ? 'hold'
    and coalesce(v_settings.seatalk_operator_email,'') <> ''
  on conflict (domain,event_kind,subject_key,recipient_kind,recipient_key) do nothing;
  get diagnostics v_row_count = row_count;
  v_inserted := v_inserted + v_row_count;

  return jsonb_build_object('detectedAt',clock_timestamp(),'inserted',v_inserted,'cancelled',v_cancelled,
    'sendingEnabled',v_settings.seatalk_enabled);
end $$;
revoke all on function battle_pass_private.seatalk_detect()
  from public, anon, authenticated, service_role;

create or replace function public.battle_pass_seatalk_claim(p_limit integer default 10)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_result jsonb; v_limit integer := greatest(1,least(coalesce(p_limit,10),10));
begin
  perform battle_pass_private.require_worker();
  if not exists (select 1 from battle_pass_private.monthly_settings
    where singleton and seatalk_enabled and seatalk_activation_cutoff is not null) then
    return jsonb_build_object('claims','[]'::jsonb);
  end if;

  -- The process died after declaring provider IO had begun. Delivery may have happened, so
  -- make the ambiguity explicit and require reconciliation instead of blind retry.
  update battle_pass_private.seatalk_notifications set
    status='delivery_unknown',last_error_code='worker_lost_after_send_start',
    status_reason='operator_reconciliation_required',dispatch_key=null,lease_expires_at=null,
    updated_at=clock_timestamp()
  where status='dispatching' and lease_expires_at<=clock_timestamp() and send_started_at is not null;

  with candidates as (
    select n.notification_id from battle_pass_private.seatalk_notifications n
    where (
      (n.status in ('pending','failed') and coalesce(n.next_attempt_at,n.eligible_at)<=clock_timestamp()
        and n.attempt_count<5)
      or (n.status='dispatching' and n.lease_expires_at<=clock_timestamp()
        and n.send_started_at is null and n.attempt_count<5))
    order by case n.event_kind when 'run_failed' then 0 when 'run_held' then 1 else 2 end,
      coalesce(n.next_attempt_at,n.eligible_at),n.notification_id
    limit v_limit for update skip locked
  ), claimed as (
    update battle_pass_private.seatalk_notifications n set
      status='dispatching', dispatch_key=gen_random_uuid(),
      lease_expires_at=clock_timestamp()+interval '5 minutes',
      send_started_at=null, attempt_count=n.attempt_count+1,
      status_reason=null, updated_at=clock_timestamp()
    from candidates c where n.notification_id=c.notification_id
    returning n.*
  )
  select jsonb_build_object('claims',coalesce(jsonb_agg(jsonb_build_object(
    'notificationId',notification_id,'dispatchKey',dispatch_key,'eventKind',event_kind,
    'recipientKind',recipient_kind,'recipientKey',recipient_key,'period',period,
    'payload',payload,'attemptCount',attempt_count) order by eligible_at,notification_id),'[]'::jsonb))
  into v_result from claimed;
  return coalesce(v_result,jsonb_build_object('claims','[]'::jsonb));
end $$;

create or replace function public.battle_pass_seatalk_mark_send_started(p_dispatch_key uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  perform battle_pass_private.require_worker();
  update battle_pass_private.seatalk_notifications set
    send_started_at=clock_timestamp(),updated_at=clock_timestamp()
  where dispatch_key=p_dispatch_key and status='dispatching'
    and lease_expires_at>clock_timestamp() and send_started_at is null;
  return found;
end $$;

create or replace function public.battle_pass_seatalk_finish(
  p_dispatch_key uuid,p_outcome text,p_seatalk_message_id text default null,
  p_error_code text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_row battle_pass_private.seatalk_notifications%rowtype; v_now timestamptz:=clock_timestamp();
begin
  perform battle_pass_private.require_worker();
  if p_outcome not in ('sent','failed','delivery_unknown') then raise exception 'Invalid outcome'; end if;
  if p_outcome='sent' and coalesce(trim(p_seatalk_message_id),'')='' then
    raise exception 'Message id required';
  end if;
  if p_error_code is not null and p_error_code !~ '^[A-Za-z0-9_.:-]{1,100}$' then
    raise exception 'Safe error code required';
  end if;
  update battle_pass_private.seatalk_notifications n set
    status=p_outcome,
    seatalk_message_id=case when p_outcome='sent' then left(p_seatalk_message_id,500) else null end,
    last_error_code=case when p_outcome='sent' then null else coalesce(p_error_code,'unknown_error') end,
    status_reason=case when p_outcome='delivery_unknown' then 'operator_reconciliation_required'
      when p_outcome='failed' and n.attempt_count>=5 then 'retry_exhausted' else null end,
    next_attempt_at=case when p_outcome='failed' and n.attempt_count<5
      then v_now+make_interval(secs=>battle_pass_private.seatalk_retry_delay_seconds(n.attempt_count)) end,
    dispatch_key=null,lease_expires_at=null,updated_at=v_now
  where n.dispatch_key=p_dispatch_key and n.status='dispatching'
    and n.lease_expires_at>v_now returning * into v_row;
  if not found then return jsonb_build_object('finalized',false,'reason','stale_dispatch'); end if;
  return jsonb_build_object('finalized',true,'notificationId',v_row.notification_id,
    'status',v_row.status,'attemptCount',v_row.attempt_count,'nextAttemptAt',v_row.next_attempt_at);
end $$;

revoke all on function public.battle_pass_seatalk_claim(integer),
  public.battle_pass_seatalk_mark_send_started(uuid),
  public.battle_pass_seatalk_finish(uuid,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.battle_pass_seatalk_claim(integer),
  public.battle_pass_seatalk_mark_send_started(uuid),
  public.battle_pass_seatalk_finish(uuid,text,text,text)
  to service_role;

create or replace function battle_pass_private.seatalk_dispatch()
returns bigint language plpgsql security definer set search_path='' as $$
declare v_token text; v_request bigint;
begin
  select v.decrypted_secret into v_token
  from battle_pass_private.monthly_settings s
  join vault.decrypted_secrets v on v.id=s.scheduler_secret_id where s.singleton;
  if v_token is null or length(v_token)<40 then raise exception 'Scheduler credential unavailable'; end if;
  select net.http_post(
    url:='https://jbavahimqjalvcfawgqw.supabase.co/functions/v1/battle-pass-seatalk',
    headers:=jsonb_build_object('Content-Type','application/json','x-battle-pass-token',v_token),
    body:='{"limit":10}'::jsonb,timeout_milliseconds:=120000) into v_request;
  return v_request;
end $$;
revoke all on function battle_pass_private.seatalk_dispatch()
  from public, anon, authenticated, service_role;

do $$ declare v_job bigint; begin
  if not exists (select 1 from cron.job where jobname='battle-pass-seatalk-15m') then
    select cron.schedule('battle-pass-seatalk-15m','*/15 * * * *',
      $job$select battle_pass_private.seatalk_detect();
           select battle_pass_private.seatalk_dispatch();$job$) into v_job;
    perform cron.alter_job(v_job,active:=false);
  end if;
end $$;

notify pgrst,'reload schema';
commit;
