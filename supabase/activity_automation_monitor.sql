-- M1 authenticated, read-only monitor. Does not enable automation or change its records.
-- Requires existing BP/shared installers and current brief acceptance helper.
begin;

-- Supports the bounded latest-record picker and event-month history predicates.
create index if not exists activity_monitor_runs_latest_idx on activity_automation_private.runs(mode,activity,updated_at desc,id desc);
create index if not exists activity_monitor_runs_event_idx on activity_automation_private.runs(mode,updated_at desc,id desc);

create or replace function activity_automation_private.monitor_access() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u public.users%rowtype; shared boolean; bp boolean;
begin
 select * into u from public.users where id=auth.uid() and is_active;
 if not found then raise exception 'Monitor access denied' using errcode='42501'; end if;
 shared:=u.role='admin' or exists(select 1 from public.user_team_memberships where user_id=u.id and team_code='ops');
 bp:=u.id='5abad25d-3e8c-4a0d-baa6-0a0615ba00fc'::uuid or exists(select 1 from battle_pass_private.google_connection where singleton and user_id=u.id);
 return jsonb_build_object('sharedRead',coalesce(shared,false),'battlePassRead',bp,'battlePassControls',bp,'sharedDiagnosis',false);
end $$;

create or replace function activity_automation_private.monitor_validate(p_mode text,p_month text,p_activity text,p_search text default null) returns void
language plpgsql immutable set search_path='' as $$ begin
 if p_mode is null or p_mode not in ('test','production') or p_month is null or p_month!~'^20[0-9]{2}-(0[1-9]|1[0-2])$'
 or (p_activity is not null and p_activity not in ('battle_pass','membership','conqueror_crate','golden_spin','topup_promotion'))
 or length(coalesce(p_search,''))>120 then raise exception 'Invalid monitor filter' using errcode='22023';end if;
end $$;

create or replace function activity_automation_private.monitor_code(p_code text) returns text
language sql immutable set search_path='' as $$ select case when p_code~'^[A-Za-z0-9_.:-]{1,100}$' then p_code end $$;
create or replace function activity_automation_private.monitor_date(p_date text) returns text
language plpgsql immutable set search_path='' as $$ begin
 if p_date~'^20[0-9]{2}-[0-9]{2}-[0-9]{2}$' and to_char(p_date::date,'YYYY-MM-DD')=p_date then return p_date;end if;return null;
 exception when others then return null;end $$;
create or replace function activity_automation_private.monitor_sheet_url(p_url text) returns text
language sql immutable set search_path='' as $$ select case when p_url~'^https://docs[.]google[.]com/spreadsheets/d/[A-Za-z0-9_-]+(/[^[:space:]]*)?$' and length(p_url)<=2048 then p_url end $$;
create or replace function activity_automation_private.monitor_boolean(p_value jsonb) returns jsonb
language sql immutable set search_path='' as $$ select case when jsonb_typeof(p_value)='boolean' then p_value end $$;
create or replace function activity_automation_private.monitor_readiness(d jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('confirmed',activity_automation_private.monitor_boolean(d#>'{sourceStatus,confirmed}'),
 'workingSheetLinked',activity_automation_private.monitor_boolean(d#>'{sourceStatus,workingSheetLinked}'),
 'sourceReady',activity_automation_private.monitor_boolean(d->'sourceReady'),'googleReady',activity_automation_private.monitor_boolean(d#>'{google,capabilitiesVerified}'),
 'databaseReady',activity_automation_private.monitor_boolean(d#>'{database,ready}'),'databaseCode',activity_automation_private.monitor_code(d#>>'{database,code}'),
 'planState',activity_automation_private.monitor_code(d#>>'{plan,state}'),'nextState',activity_automation_private.monitor_code(d#>>'{plan,next,state}'),
 'issues',(select coalesce(jsonb_agg(v),'[]') from (select value v from jsonb_array_elements_text(
 case when jsonb_typeof(d#>'{plan,issues}')='array' then d#>'{plan,issues}' else '[]' end ||
 case when jsonb_typeof(d#>'{plan,next,issues}')='array' then d#>'{plan,next,issues}' else '[]' end) where value~'^[a-z0-9_]{1,100}$' limit 20) q))
$$;

-- Explicit allowlist projection. No model, checkpoint, recipient keys or raw errors leave this boundary.
create or replace function activity_automation_private.monitor_output(p_source text,p_id text,p_activity text,p_mode text,p_code text,p_start text,p_end text,p_slide text,p_sheet text,p_work uuid,p_content uuid,p_state text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w public.work_items%rowtype; submitted bigint; accepted boolean; complete boolean;
begin
 select * into w from public.work_items where id=p_work;
 select max(id) into submitted from public.creative_kpi_brief_evidence where work_item_id=p_work and action='submitted';
 accepted:=activity_automation_private.has_accepted_brief(p_work);
 complete:=p_state=case when p_source='shared' then 'ready_for_review' else 'complete' end and p_slide~'^[A-Za-z0-9_-]+$' and w.id is not null and exists(select 1 from public.marketing_content_items where id=p_content);
 return jsonb_build_object('source',p_source,'outputId',p_id,'activity',p_activity,'mode',p_mode,'projectCode',p_code,
 'campaignStart',activity_automation_private.monitor_date(p_start),'campaignEnd',activity_automation_private.monitor_date(p_end),
 'briefUrl',case when p_slide~'^[A-Za-z0-9_-]+$' then 'https://docs.google.com/presentation/d/'||p_slide||'/edit' end,
 'workingSheetUrl',activity_automation_private.monitor_sheet_url(p_sheet),'workItemId',w.id,'displayId',w.display_id,
 'crUrl',case when w.display_id~'^CR-[0-9]+$' then 'https://panuwee.github.io/FlowMate/home/#detail/'||w.display_id end,
 'generationState',p_state,'complete',complete,'briefState',case when submitted is null then 'not_submitted' when accepted then 'accepted' else 'pending' end,
 'submissionId',submitted,'assignmentState',w.status,'hasAssignee',w.final_owner_member_id is not null or w.assignee_user_id is not null);
end $$;

-- kind: runs / outputs / notifications / incidents. A null month is reserved for guarded detail lookups.
create or replace function activity_automation_private.monitor_rows(p_source text,p_mode text,p_month text,p_kind text,p_id text default null)
returns table(event_at timestamptz,id text,entity_type text,activity text,status text,project_code text,record jsonb)
language plpgsql stable security definer set search_path='' as $$
declare lo timestamptz; hi timestamptz;
begin
 if p_month is not null then lo:=(p_month||'-01')::timestamp at time zone 'Asia/Bangkok';hi:=((p_month||'-01')::date+interval '1 month')::timestamp at time zone 'Asia/Bangkok';end if;
 if p_source='shared' and p_kind in ('runs','outputs') then
 return query select r.updated_at,r.id::text,'run'::text,r.activity,r.state,r.project_code,
 jsonb_build_object('source','shared','entityType','run','id',r.id,'activity',r.activity,'mode',r.mode,'eventAt',r.updated_at,
 'createdAt',r.created_at,'status',r.state,'stage',activity_automation_private.monitor_code(r.stage),'code',activity_automation_private.monitor_code(r.code),'projectCode',r.project_code,
 'attemptCount',r.attempt_count,'sourceCheckedAt',null,'output',case when b.run_id is not null then
 activity_automation_private.monitor_output('shared',b.run_id::text,r.activity,r.mode,r.project_code,r.model#>>'{source,startDate}',r.model#>>'{source,endDate}',b.slide_id,r.model#>>'{source,workingSheetUrl}',b.work_item_id,b.content_item_id,r.state) end)
 from activity_automation_private.runs r left join activity_automation_private.output_bindings b on b.run_id=r.id
 where r.mode=p_mode and r.is_test=(p_mode='test') and (p_id is null or r.id=p_id::uuid)
 and (p_kind<>'outputs' or b.run_id is not null)
 and (p_month is null or case when p_kind='outputs' then left(activity_automation_private.monitor_date(r.model#>>'{source,startDate}'),7)=p_month else r.updated_at>=lo and r.updated_at<hi end);
 elsif p_source='battle_pass' and (p_kind in ('outputs','monthly') or (p_kind='runs' and p_mode='test')) then
 return query select r.updated_at,r.mode||':'||r.period,'monthly'::text,'battle_pass'::text,r.state,null::text,
 jsonb_build_object('source','battle_pass','entityType','monthly','id',r.mode||':'||r.period,'activity','battle_pass','mode',r.mode,'eventAt',r.updated_at,
 'status',r.state,'period',r.period,'stage',null,'projectCode',null,'code',null,'sourceCheckedAt',null,
 'output',case when r.brief_id is not null then activity_automation_private.monitor_output('battle_pass',r.mode||':'||r.period,'battle_pass',r.mode,null,
 r.source_snapshot->>'startDate',r.source_snapshot->>'endDate',r.slide_id,r.source_snapshot->>'workingSheetUrl',r.brief_id,r.task_id,case when r.checkpoint?'hold' then 'held' else r.state end) end)
 from battle_pass_private.monthly_runs r where r.mode=p_mode and (p_id is null or r.mode||':'||r.period=p_id)
 and (p_kind<>'outputs' or r.brief_id is not null)
 and (p_month is null or case when p_kind='outputs' then r.period=p_month else r.updated_at>=lo and r.updated_at<hi end);
 elsif p_source='battle_pass' and p_kind='runs' and p_mode='production' then
 return query select t.checked_at,t.run_id::text,'tick'::text,'battle_pass'::text,t.status,null::text,
 jsonb_build_object('source','battle_pass','entityType','tick','id',t.run_id,'activity','battle_pass','mode','production','eventAt',t.checked_at,
 'status',t.status,'stage',activity_automation_private.monitor_code(t.detail->>'stage'),'code',activity_automation_private.monitor_code(coalesce(t.detail->>'code',t.code)),
 'period',coalesce(t.detail->>'period',t.detail#>>'{plan,next,period}'),'projectCode',null,
 'kind',case when t.status='readiness_checked' or t.detail->>'action'='readiness' then 'readiness' when t.status='google_write_checked' or t.detail->>'action'='google-write-check' then 'probe' else 'production' end,
 'sourceCheckedAt',case when t.status='readiness_checked' or t.detail->>'action'='readiness' then t.checked_at end,'output',null)
 || case when t.status='readiness_checked' or t.detail->>'action'='readiness' then activity_automation_private.monitor_readiness(t.detail) else '{}'::jsonb end
 from battle_pass_private.production_ticks t where (p_id is null or t.run_id=p_id::uuid) and (p_month is null or t.checked_at>=lo and t.checked_at<hi);
 elsif p_source='shared' and p_kind in ('notifications','attention_notifications') then
 return query select n.created_at,n.id::text,'notification'::text,coalesce(r.activity,n.payload->>'activity'),n.status,coalesce(r.project_code,n.payload->>'projectCode'),
 jsonb_build_object('source','shared','entityType','notification','id',n.id,'activity',coalesce(r.activity,n.payload->>'activity'),'mode','test',
 'eventAt',n.created_at,'updatedAt',n.updated_at,'status',n.status,'rawStatus',n.status,'eventKind',n.event_kind,'projectCode',coalesce(r.project_code,n.payload->>'projectCode'),
 'runId',n.run_id,'recipientLabel',case when n.recipient_kind='group' then 'กลุ่ม' else 'Operator' end,'attemptCount',n.attempt_count,
 'nextAttemptAt',n.next_attempt_at,'code',activity_automation_private.monitor_code(n.error_code),'providerAccepted',n.status='delivered' and n.provider_id is not null)
 from activity_automation_private.notification_outbox n left join activity_automation_private.runs r on r.id=n.run_id
 where p_mode='test' and (r.id is null or r.mode='test') and (p_id is null or n.id::text=p_id) and (p_month is null or
 case when p_kind='attention_notifications' and activity_automation_private.monitor_date(r.model#>>'{source,startDate}') is not null then left(r.model#>>'{source,startDate}',7)=p_month else n.created_at>=lo and n.created_at<hi end);
 elsif p_source='battle_pass' and p_kind in ('notifications','attention_notifications') then
 return query select n.created_at,n.notification_id::text,'notification'::text,'battle_pass'::text,
 case n.status when 'sent' then 'delivered' when 'delivery_unknown' then 'uncertain' when 'failed' then case when n.next_attempt_at is not null then 'retryable' else 'failed' end else n.status end,null::text,
 jsonb_build_object('source','battle_pass','entityType','notification','id',n.notification_id,'activity','battle_pass','mode','production',
 'eventAt',n.created_at,'updatedAt',n.updated_at,'status',case n.status when 'sent' then 'delivered' when 'delivery_unknown' then 'uncertain' when 'failed' then case when n.next_attempt_at is not null then 'retryable' else 'failed' end else n.status end,
 'rawStatus',n.status,'eventKind',n.event_kind,'period',n.period,'projectCode',null,'recipientLabel',case when n.recipient_kind='group' then 'กลุ่ม' else 'Operator' end,
 'attemptCount',n.attempt_count,'nextAttemptAt',n.next_attempt_at,'code',activity_automation_private.monitor_code(n.last_error_code),'providerAccepted',n.status='sent' and n.seatalk_message_id is not null)
 from battle_pass_private.seatalk_notifications n where p_mode='production' and (p_id is null or n.notification_id::text=p_id) and (p_month is null or
 case when p_kind='attention_notifications' and n.period~'^20[0-9]{2}-(0[1-9]|1[0-2])$' then n.period=p_month else n.created_at>=lo and n.created_at<hi end);
 elsif p_source='shared' and p_kind='incidents' then
 return query select i.last_at,i.id::text,'incident'::text,i.activity,'resolution_unknown'::text,i.project_code,
 jsonb_build_object('source','shared','entityType','incident','id',i.id,'activity',i.activity,'mode','test','eventAt',i.last_at,'firstAt',i.first_at,
 'status','resolution_unknown','stage',activity_automation_private.monitor_code(i.stage),'code',activity_automation_private.monitor_code(i.code),'projectCode',i.project_code,'runId',i.run_id,'occurrences',i.occurrences,
 'campaignUnbound',activity_automation_private.monitor_date(r.model#>>'{source,startDate}') is null)
 from activity_automation_private.incidents i left join activity_automation_private.runs r on r.id=i.run_id
 where p_mode='test' and (p_id is null or i.id::text=p_id) and (p_month is null or
 case when activity_automation_private.monitor_date(r.model#>>'{source,startDate}') is not null then left(r.model#>>'{source,startDate}',7)=p_month else i.last_at>=lo and i.last_at<hi end);
 elsif p_source='battle_pass' and p_kind='incidents' then
 -- Latest non-probe event per evidenced period; older failed attempts with a later success stay in history.
 return query with latest as (
 select distinct on (coalesce(t.detail->>'period',t.detail#>>'{plan,next,period}','unknown')) t.*,
 coalesce(t.detail->>'period',t.detail#>>'{plan,next,period}') period_key
 from battle_pass_private.production_ticks t where p_mode='production'
 and t.status not in ('readiness_checked','google_write_checked') and coalesce(t.detail->>'action','') not in ('readiness','google-write-check')
 order by coalesce(t.detail->>'period',t.detail#>>'{plan,next,period}','unknown'),t.checked_at desc,t.run_id desc)
 select t.checked_at,t.run_id::text,'tick'::text,'battle_pass'::text,t.status,null::text,
 jsonb_build_object('source','battle_pass','entityType','tick','id',t.run_id,'activity','battle_pass','mode','production','eventAt',t.checked_at,
 'status',t.status,'period',t.period_key,'stage',activity_automation_private.monitor_code(t.detail->>'stage'),'code',activity_automation_private.monitor_code(coalesce(t.detail->>'code',t.code)),
 'campaignUnbound',t.period_key is null,'resolutionState','latest_evidence')
 from latest t where t.status in ('failed','source_blocked','review_required','needs_data') and
 (p_month is null or case when t.period_key~'^20[0-9]{2}-(0[1-9]|1[0-2])$' then t.period_key=p_month else t.checked_at>=lo and t.checked_at<hi end)
 union all
 select r.updated_at,r.mode||':'||r.period,'monthly'::text,'battle_pass'::text,'held'::text,null::text,
 jsonb_build_object('source','battle_pass','entityType','monthly','id',r.mode||':'||r.period,'activity','battle_pass','mode',r.mode,'eventAt',r.updated_at,'status','held','period',r.period,'resolutionState','hold_present')
 from battle_pass_private.monthly_runs r where r.mode=p_mode and r.checkpoint?'hold' and (p_month is null or r.period=p_month);
 end if;
end $$;

create or replace function public.activity_automation_monitor_access() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('version',1,'observedAt',current_timestamp,'sources','[]'::jsonb,'data',activity_automation_private.monitor_access())
$$;

create or replace function activity_automation_private.monitor_page(p_kind text,p_mode text,p_month text,p_activity text,p_status text,p_search text,p_cursor text,p_limit integer)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caps jsonb; sources jsonb:='[]'; allrows jsonb:='[]'; part jsonb; rows jsonb; src text; allowed boolean; cursor_data jsonb; fingerprint text; lastrow jsonb; next_cursor text; n integer; more boolean;
begin
 caps:=activity_automation_private.monitor_access();perform activity_automation_private.monitor_validate(p_mode,p_month,p_activity,p_search);
 if p_status is not null and p_status!~'^[a-z_]{1,50}$' then raise exception 'Invalid status' using errcode='22023';end if;
 n:=least(greatest(coalesce(p_limit,25),1),100);
 fingerprint:=md5(jsonb_build_array(p_kind,p_mode,p_month,p_activity,p_status,p_search)::text);
 if p_cursor is not null then
 begin
 if length(p_cursor)>2000 then raise exception 'bad cursor';end if;
 cursor_data:=convert_from(decode(p_cursor,'base64'),'UTF8')::jsonb;
 if jsonb_typeof(cursor_data) is distinct from 'object' or cursor_data->>'filter' is distinct from fingerprint or coalesce(cursor_data->>'source','') not in ('shared','battle_pass') or coalesce(cursor_data->>'id','')='' or coalesce(cursor_data->>'entityType','') not in ('tick','monthly','run','notification') or cursor_data->>'eventAt' is null then raise exception 'bad cursor';end if;
 perform (cursor_data->>'eventAt')::timestamptz;
 exception when others then raise exception 'Invalid monitor cursor' using errcode='22023';end;
 end if;
 foreach src in array array['battle_pass','shared'] loop
 allowed:=(caps->>case when src='shared' then 'sharedRead' else 'battlePassRead' end)::boolean;
 if not allowed then sources:=sources||jsonb_build_array(jsonb_build_object('source',src,'status','forbidden','checkedAt',null,'code',null));continue;end if;
 begin
 if p_activity is not null and ((src='shared' and p_activity='battle_pass') or (src='battle_pass' and p_activity<>'battle_pass')) then continue;end if;
 select coalesce(jsonb_agg(q.record order by q.event_at desc,q.entity_type desc,q.id desc),'[]') into part from (
 select x.* from activity_automation_private.monitor_rows(src,p_mode,p_month,p_kind) x
 where (p_activity is null or x.activity=p_activity) and (p_status is null or x.status=p_status)
 and (p_search is null or p_search='' or position(lower(p_search) in lower(coalesce(x.project_code,'')||' '||x.id||' '||coalesce(x.record#>>'{output,displayId}','')))>0)
 and (cursor_data is null or (x.event_at,src,x.entity_type,x.id)<((cursor_data->>'eventAt')::timestamptz,cursor_data->>'source',cursor_data->>'entityType',cursor_data->>'id'))
 order by x.event_at desc,x.entity_type desc,x.id desc limit n+1) q;
 allrows:=allrows||part;sources:=sources||jsonb_build_array(jsonb_build_object('source',src,'status','ok','checkedAt',current_timestamp,'code',null));
 exception when others then sources:=sources||jsonb_build_array(jsonb_build_object('source',src,'status','unavailable','checkedAt',null,'code','source_read_failed'));end;
 end loop;
 more:=jsonb_array_length(allrows)>n;
 select coalesce(jsonb_agg(v order by (v->>'eventAt')::timestamptz desc,v->>'source' desc,v->>'entityType' desc,v->>'id' desc),'[]') into rows
 from (select value v from jsonb_array_elements(allrows) order by (value->>'eventAt')::timestamptz desc,value->>'source' desc,value->>'entityType' desc,value->>'id' desc limit n) q;
 if more then lastrow:=rows->(jsonb_array_length(rows)-1);next_cursor:=encode(convert_to(jsonb_build_object('filter',fingerprint,'eventAt',lastrow->>'eventAt','source',lastrow->>'source','entityType',lastrow->>'entityType','id',lastrow->>'id')::text,'UTF8'),'base64');end if;
 return jsonb_build_object('version',1,'observedAt',current_timestamp,'sources',sources,'data',jsonb_build_object('rows',rows,'nextCursor',next_cursor,'hasMore',more));
end $$;

create or replace function public.activity_automation_monitor_runs(p_mode text,p_month text,p_activity text default null,p_status text default null,p_search text default null,p_cursor text default null,p_limit integer default 25)
returns jsonb language sql stable security definer set search_path='' as $$
 select activity_automation_private.monitor_page('runs',p_mode,p_month,p_activity,p_status,p_search,p_cursor,p_limit)
$$;
create or replace function public.activity_automation_monitor_notifications(p_mode text,p_month text,p_activity text default null,p_status text default null,p_cursor text default null,p_limit integer default 25)
returns jsonb language sql stable security definer set search_path='' as $$
 select activity_automation_private.monitor_page('notifications',p_mode,p_month,p_activity,p_status,null,p_cursor,p_limit)
$$;

-- Explicit entity type prevents collision between a BP tick UUID and monthly run identity.
create or replace function public.activity_automation_monitor_run(p_source text,p_run_id text,p_entity_type text default 'run') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caps jsonb; rec jsonb; kind text; mode text; outputs jsonb:='[]'; notification jsonb; notification_id text;
begin
 caps:=activity_automation_private.monitor_access();
 if p_source not in ('shared','battle_pass') or p_entity_type not in ('run','tick','monthly') or p_run_id is null or length(p_run_id)>100 then raise exception 'Invalid detail identity' using errcode='22023';end if;
 if not coalesce((caps->>case when p_source='shared' then 'sharedRead' else 'battlePassRead' end)::boolean,false) then raise exception 'Monitor access denied' using errcode='42501';end if;
 if (p_source='shared' and p_entity_type<>'run') or (p_source='battle_pass' and p_entity_type='run') then raise exception 'Run not found' using errcode='P0002';end if;
 if (p_entity_type in ('run','tick') and p_run_id!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
 or (p_entity_type='monthly' and p_run_id!~'^(test|production):20[0-9]{2}-(0[1-9]|1[0-2])$') then raise exception 'Run not found' using errcode='P0002';end if;
 kind:=case when p_entity_type='monthly' then 'monthly' else 'runs' end;
 mode:=case when p_source='shared' then 'test' when p_entity_type='monthly' then split_part(p_run_id,':',1) else 'production' end;
 select r.record into rec from activity_automation_private.monitor_rows(p_source,mode,null,kind,p_run_id) r where r.entity_type=p_entity_type;
 if rec is null then raise exception 'Run not found' using errcode='P0002';end if;
 if rec->'output' is not null and rec->'output'<>'null'::jsonb then outputs:=jsonb_build_array(rec->'output');end if;
 if p_source='shared' then
 select n.id::text into notification_id from activity_automation_private.notification_outbox n where n.run_id=p_run_id::uuid order by n.updated_at desc,n.id desc limit 1;
 if notification_id is not null then select n.record into notification from activity_automation_private.monitor_rows(p_source,mode,null,'notifications',notification_id) n;end if;
 end if;
 return jsonb_build_object('version',1,'observedAt',current_timestamp,'sources',jsonb_build_array(jsonb_build_object('source',p_source,'status','ok','checkedAt',current_timestamp,'code',null)),
 'data',jsonb_build_object('run',rec,'outputs',outputs,'latestNotification',notification,'timeline',jsonb_build_array(
 jsonb_build_object('step','source','status',case when rec->>'sourceReady'='true' then 'ready' when rec->>'sourceReady'='false' then 'not_ready' else 'unknown' end,'at',rec->>'sourceCheckedAt'),
 jsonb_build_object('step','generation','status',rec->>'status','at',rec->>'eventAt','timeMeaning','last_observed_update'),
 jsonb_build_object('step','brief_review','status',coalesce(rec#>>'{output,briefState}','unknown'),'at',null),
 jsonb_build_object('step','assignment','status',coalesce(rec#>>'{output,assignmentState}','unknown'),'at',null),
 jsonb_build_object('step','notification','status',coalesce(notification->>'status','unknown'),'at',notification->>'updatedAt','timeMeaning','last_observed_update'))));
end $$;

create or replace function public.activity_automation_monitor_summary(p_mode text,p_month text,p_activity text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare caps jsonb; src text; allowed boolean; sources jsonb:='[]'; activities jsonb:='[]'; attention jsonb:='[]'; outputs jsonb:='[]'; config jsonb; a text; label text; latest jsonb; latest_id text; checked jsonb; part jsonb; count_outputs bigint:=0; count_pending bigint:=0; count_attention bigint:=0; nout bigint; npend bigint; natt bigint; supported integer:=0; complete boolean:=true; j record; activity_rows jsonb; out_rows jsonb; att_rows jsonb;
begin
 caps:=activity_automation_private.monitor_access();perform activity_automation_private.monitor_validate(p_mode,p_month,p_activity);
 foreach src in array array['battle_pass','shared'] loop
 allowed:=(caps->>case when src='shared' then 'sharedRead' else 'battlePassRead' end)::boolean;
 if not allowed then sources:=sources||jsonb_build_array(jsonb_build_object('source',src,'status','forbidden','checkedAt',null,'code',null));continue;end if;
 supported:=supported+case when src='shared' then 4 else 1 end;
 if p_activity is not null and ((src='shared' and p_activity='battle_pass') or (src='battle_pass' and p_activity<>'battle_pass')) then continue;end if;
 begin
 activity_rows:='[]';out_rows:='[]';att_rows:='[]';
 if src='shared' then
 select jsonb_build_object('runnerEnabled',case when p_mode='test' then test_enabled else production_enabled end,'notifierEnabled',notifier_enabled,'schedulerState','not_configured','schedule',null) into config from activity_automation_private.settings where singleton;
 else
 select jsonb_build_object('runnerEnabled',case when p_mode='production' then enabled end,'notifierEnabled',case when p_mode='production' then seatalk_enabled end,'schedulerState',case when p_mode='test' then 'not_configured' else 'unknown' end,'schedule',null) into config from battle_pass_private.monthly_settings where singleton;
 if p_mode='production' then
 begin
 select active,schedule into j from cron.job where jobname='battle-pass-production-30m' limit 1;
 config:=coalesce(config,'{}')||jsonb_build_object('schedulerState',case when not found then 'not_configured' when j.active then 'active' else 'paused' end,'schedule',j.schedule);
 exception when undefined_table or invalid_schema_name then config:=coalesce(config,'{}')||jsonb_build_object('schedulerState','unknown','schedule',null);end;
 end if;end if;
 config:=coalesce(config,jsonb_build_object('runnerEnabled',null,'notifierEnabled',null,'schedulerState','unknown','schedule',null));
 foreach a in array case when src='shared' then array['membership','conqueror_crate','golden_spin','topup_promotion'] else array['battle_pass'] end loop
 if p_activity is not null and a<>p_activity then continue;end if;
 label:=case a when 'battle_pass' then 'Battle Pass' when 'membership' then 'Membership' when 'conqueror_crate' then 'Conqueror Crate' when 'golden_spin' then 'Golden Spin' else 'Topup Promotion' end;
 latest:=null;latest_id:=null;checked:=null;
 if src='shared' then
 select r.id::text into latest_id from activity_automation_private.runs r where r.activity=a and r.mode=p_mode order by r.updated_at desc,r.id desc limit 1;
 elsif p_mode='test' then
 select r.mode||':'||r.period into latest_id from battle_pass_private.monthly_runs r where r.mode='test' order by r.updated_at desc,r.period desc limit 1;
 else
 select t.run_id::text into latest_id from battle_pass_private.production_ticks t where t.status not in ('readiness_checked','google_write_checked') and coalesce(t.detail->>'action','') not in ('readiness','google-write-check') order by t.checked_at desc,t.run_id desc limit 1;
 end if;
 if latest_id is not null then select r.record into latest from activity_automation_private.monitor_rows(src,p_mode,null,'runs',latest_id) r;end if;
 if src='battle_pass' and p_mode='production' then
 select t.run_id::text into latest_id from battle_pass_private.production_ticks t where t.status='readiness_checked' or t.detail->>'action'='readiness' order by t.checked_at desc,t.run_id desc limit 1;
 if latest_id is not null then select r.record into checked from activity_automation_private.monitor_rows(src,p_mode,null,'runs',latest_id) r;end if;
 end if;
 select count(*) into npend from activity_automation_private.monitor_rows(src,p_mode,p_month,'outputs') r where r.activity=a and r.record#>>'{output,briefState}'='pending';
 select count(*) into natt from activity_automation_private.monitor_rows(src,p_mode,p_month,'attention_notifications') r where r.activity=a and r.status in ('failed','uncertain');
 activity_rows:=activity_rows||jsonb_build_array(config||jsonb_build_object('key',a,'label',label,'sourceSystem',src,'configurationScope',case when src='shared' then 'shared_4_activities' else 'battle_pass' end,
 'pendingBriefs',npend,'notificationAttention',natt,'availability','ok',
 'lastRun',latest,'lastSourceCheck',checked,'capabilities',jsonb_build_object('controls',src='battle_pass','diagnosis',src='battle_pass'),
 'healthState',case when src='battle_pass' and p_mode='production' and config->>'schedulerState'='active' and (config->>'runnerEnabled')::boolean then case when latest is null or (latest->>'eventAt')::timestamptz<current_timestamp-interval '65 minutes' then 'stale' else 'current' end else 'unknown' end));
 end loop;
 select count(*) filter(where (r.record#>>'{output,complete}')::boolean),count(*) filter(where r.record#>>'{output,briefState}'='pending') into nout,npend
 from activity_automation_private.monitor_rows(src,p_mode,p_month,'outputs') r where p_activity is null or r.activity=p_activity;
 select coalesce(jsonb_agg(q.record->'output' order by q.event_at desc,q.id desc),'[]') into out_rows from (
 select r.* from activity_automation_private.monitor_rows(src,p_mode,p_month,'outputs') r where p_activity is null or r.activity=p_activity order by r.event_at desc,r.id desc limit 25) q;
 -- Incidents without resolution evidence remain explicitly unknown; notification failures are separate entities.
 select count(*) into natt from (
 select r.id from activity_automation_private.monitor_rows(src,p_mode,p_month,'incidents') r where p_activity is null or r.activity=p_activity
 union all select r.id from activity_automation_private.monitor_rows(src,p_mode,p_month,'attention_notifications') r where r.status in ('failed','uncertain') and (p_activity is null or r.activity=p_activity)) q;
 select coalesce(jsonb_agg(q.record order by q.event_at desc,q.id desc),'[]') into att_rows from (
 select r.* from activity_automation_private.monitor_rows(src,p_mode,p_month,'incidents') r where p_activity is null or r.activity=p_activity
 union all select r.* from activity_automation_private.monitor_rows(src,p_mode,p_month,'attention_notifications') r where r.status in ('failed','uncertain') and (p_activity is null or r.activity=p_activity)
 order by event_at desc,id desc limit 25) q;
 for part in select value from jsonb_array_elements(activity_rows) where value->>'healthState'='stale' loop
 natt:=natt+1;att_rows:=att_rows||jsonb_build_array(jsonb_build_object('source',src,'entityType','health','id',part->>'key','activity',part->>'key','mode',p_mode,'eventAt',part#>>'{lastRun,eventAt}','status','stale','scope','current_health'));
 end loop;
 count_outputs:=count_outputs+nout;count_pending:=count_pending+npend;count_attention:=count_attention+natt;activities:=activities||activity_rows;outputs:=outputs||out_rows;attention:=attention||att_rows;
 sources:=sources||jsonb_build_array(jsonb_build_object('source',src,'status','ok','checkedAt',current_timestamp,'code',null));
 exception when others then
 complete:=false;sources:=sources||jsonb_build_array(jsonb_build_object('source',src,'status','unavailable','checkedAt',null,'code','source_read_failed'));
 foreach a in array case when src='shared' then array['membership','conqueror_crate','golden_spin','topup_promotion'] else array['battle_pass'] end loop
 if p_activity is not null and a<>p_activity then continue;end if;
 label:=case a when 'battle_pass' then 'Battle Pass' when 'membership' then 'Membership' when 'conqueror_crate' then 'Conqueror Crate' when 'golden_spin' then 'Golden Spin' else 'Topup Promotion' end;
 activities:=activities||jsonb_build_array(jsonb_build_object('key',a,'label',label,'sourceSystem',src,'availability','unavailable','configurationScope',case when src='shared' then 'shared_4_activities' else 'battle_pass' end,
 'runnerEnabled',null,'notifierEnabled',null,'schedulerState','unknown','schedule',null,'lastRun',null,'lastSourceCheck',null,'pendingBriefs',null,'notificationAttention',null,'healthState','unknown','capabilities',jsonb_build_object('controls',src='battle_pass','diagnosis',src='battle_pass')));
 end loop;end;
 end loop;
 return jsonb_build_object('version',1,'observedAt',current_timestamp,'sources',sources,'data',jsonb_build_object('cards',jsonb_build_object('supportedActivities',supported,'outputs',count_outputs,'pendingBriefs',count_pending,'attention',count_attention,'complete',complete),'activities',activities,'outputs',outputs,'attention',attention));
end $$;

-- Only these five narrow authenticated entry points are callable; no table privileges are added.
do $$ declare f record;begin
 for f in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='activity_automation_private' and p.proname like 'monitor_%') or (n.nspname='public' and p.proname like 'activity_automation_monitor_%') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.sig);
 if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
