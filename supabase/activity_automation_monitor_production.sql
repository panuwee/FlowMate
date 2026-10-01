-- Read-only production projection. Requires production contract/finalizer/Google
-- deltas and monitor helpers. Install with the updated activity_automation_monitor.sql.
-- No runner, notification dispatch, retry, acceptance or cron enablement.
begin;
create index if not exists activity_production_monitor_latest_idx
 on activity_automation_private.production_runs(activity,updated_at desc,id desc);
create index if not exists activity_production_monitor_event_idx
 on activity_automation_private.production_runs(updated_at desc,id desc);
create index if not exists activity_production_monitor_period_idx
 on activity_automation_private.production_runs(period,updated_at desc,id desc);
create index if not exists activity_production_monitor_notification_idx
 on activity_automation_private.production_notification_outbox(run_id,updated_at desc,id desc);

create or replace function activity_automation_private.monitor_production_config()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare config jsonb; jobs integer; enabled boolean; schedule text;
begin
 select jsonb_build_object('runnerEnabled',s.enabled,'notifierEnabled',s.notifier_enabled,
 'schedulerState','unknown','schedule',null,'schedulerJob','activity-production-30m','healthState','unknown')
 into strict config from activity_automation_private.production_settings s where singleton;
 begin
  select count(*),bool_and(j.active),min(j.schedule) into jobs,enabled,schedule
  from cron.job j where j.jobname='activity-production-30m';
  config:=config||jsonb_build_object('schedulerState',case when jobs=0 then 'not_configured'
   when jobs>1 then 'ambiguous' when enabled then 'active' else 'paused' end,
   'schedule',case when jobs=1 then schedule end);
 exception when undefined_table or invalid_schema_name or insufficient_privilege then null;
 end;
 -- A last generated brief is not evidence of the scheduler's last poll.
 return config;
end $$;

create or replace function activity_automation_private.monitor_production_rows(p_month text,p_kind text,p_id text default null)
returns table(event_at timestamptz,id text,entity_type text,activity text,status text,project_code text,record jsonb)
language plpgsql stable security definer set search_path='' as $$
declare lo timestamptz; hi timestamptz;
begin
 if p_month is not null then
  lo:=(p_month||'-01')::timestamp at time zone 'Asia/Bangkok';
  hi:=((p_month||'-01')::date+interval '1 month')::timestamp at time zone 'Asia/Bangkok';
 end if;
 if p_kind in ('runs','outputs','incidents') then
 return query select r.updated_at,r.id::text,'production_run'::text,r.activity,r.stage,r.project_code,
 jsonb_build_object('source','shared','entityType','production_run','id',r.id,'activity',r.activity,'mode','production',
 'eventAt',r.updated_at,'createdAt',r.created_at,'status',r.stage,'stage',r.stage,'period',r.period,
 'code',activity_automation_private.monitor_code(r.hold_reason),'projectCode',r.project_code,
 'sourceCheckedAt',r.source_validated_at,'sourceReady',case when r.source_validated_at is not null then true end,
 'confirmed',case when r.source_validated_at is not null then true end,'sourceEvidenceScope','last_validated_snapshot',
 'googleVerifiedAt',r.google_verified_at,'completedAt',r.completed_at,
 'leaseState',case when r.stage in ('held','complete') then 'not_applicable'
  when r.lease_expires_at>current_timestamp then 'active' else 'expired' end,
 'needsAttention',r.stage='held' or (r.stage<>'complete' and coalesce(r.lease_expires_at<=current_timestamp,true)),
 'recoveryState',case when r.stage='held' then 'held' when r.stage='complete' then 'complete'
  when r.lease_expires_at>current_timestamp then 'in_progress'
  when r.stage<>'generation_pending' then 'lease_expired'
  when r.google_checkpoint?'populatedRevision' then 'verified_pending_finalize'
  when r.google_checkpoint->'populateIntent'='true'::jsonb then 'populate_result_unknown'
  when r.google_checkpoint?'copyId' then 'copied_pending_population'
  when r.google_checkpoint->'copyIntent'='true'::jsonb then 'copy_result_unknown'
  else 'generation_not_started' end,
 'output',case when b.run_id is not null then
  activity_automation_private.monitor_output('shared',b.run_id::text,r.activity,'production',r.project_code,
   r.source_model#>>'{source,startDate}',r.source_model#>>'{source,endDate}',b.slide_id,
   r.source_model#>>'{source,workingSheetUrl}',b.work_item_id,b.content_item_id,r.stage)
  ||jsonb_build_object('generationState',r.stage,'contentItemId',b.content_item_id,
   'marketingWorkingSheetLinked',exists(select 1 from public.marketing_content_items m where m.id=b.content_item_id and m.flowmate_work_item_id=b.work_item_id),
   'complete',r.stage='complete' and exists(select 1 from public.marketing_content_items m
    join public.work_items w on w.id=m.flowmate_work_item_id
    join public.creative_request_details d on d.work_item_id=w.id
    where m.id=b.content_item_id and w.id=b.work_item_id
    and d.brief_link='https://docs.google.com/presentation/d/'||b.slide_id||'/edit'))
 end)
 from activity_automation_private.production_runs r
 left join activity_automation_private.production_output_bindings b on b.run_id=r.id
 where (p_id is null or r.id=p_id::uuid)
 and (p_kind<>'outputs' or b.run_id is not null)
 and (p_kind<>'incidents' or r.stage='held' or (r.stage<>'complete' and coalesce(r.lease_expires_at<=current_timestamp,true)))
 and (p_month is null or case when p_kind in ('outputs','incidents') then r.period=p_month else r.updated_at>=lo and r.updated_at<hi end);
 elsif p_kind in ('notifications','attention_notifications') then
 return query select n.created_at,n.id::text,'notification'::text,r.activity,n.status,r.project_code,
 jsonb_build_object('source','shared','entityType','notification','id',n.id,'activity',r.activity,'mode','production',
 'eventAt',n.created_at,'updatedAt',n.updated_at,'status',n.status,'rawStatus',n.status,
 'eventKind',n.event_kind,'projectCode',r.project_code,'period',r.period,'runId',r.id,
 'recipientLabel',case when n.recipient_kind='group' then 'กลุ่ม' else 'Operator' end,
 'attemptCount',n.attempt_count,'nextAttemptAt',n.next_attempt_at,
 'code',activity_automation_private.monitor_code(n.error_code),
 'providerAccepted',n.status='delivered' and nullif(btrim(n.provider_id),'') is not null)
 from activity_automation_private.production_notification_outbox n
 join activity_automation_private.production_runs r on r.id=n.run_id
 where (p_id is null or n.id=p_id::uuid)
 and (p_month is null or case when p_kind='attention_notifications' then r.period=p_month else n.created_at>=lo and n.created_at<hi end);
 end if;
end $$;
revoke all on function activity_automation_private.monitor_production_config() from public,anon,authenticated;
revoke all on function activity_automation_private.monitor_production_rows(text,text,text) from public,anon,authenticated;
commit;
