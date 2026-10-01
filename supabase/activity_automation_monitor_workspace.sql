-- Local release delta. Requires current monitor, discovery, notification gates
-- and production_existing_output. No scheduling, CR writes or SeaTalk dispatch.
begin;
create table if not exists activity_automation_private.monitor_issue_reviews (
 issue_key text primary key,
 source text not null check(source in ('shared','battle_pass')),
 mode text not null check(mode in ('test','production')),
 entity_type text not null,
 entity_id text not null,
 fingerprint text not null,
 state text not null check(state in ('acknowledged','resolved','archived')),
 owner_id uuid not null references public.users(id),
 comment text not null check(length(btrim(comment)) between 3 and 500),
 updated_at timestamptz not null default clock_timestamp(),
 evidence jsonb not null default '{}'
);
create table if not exists activity_automation_private.monitor_issue_audit (
 id bigint generated always as identity primary key,
 issue_key text not null references activity_automation_private.monitor_issue_reviews(issue_key),
 action text not null check(action in ('acknowledged','resolved','archived')),
 actor_id uuid not null references public.users(id),
 comment text not null check(length(btrim(comment)) between 3 and 500),
 at timestamptz not null default clock_timestamp(),
 evidence jsonb not null default '{}'
);
create index if not exists monitor_issue_audit_key_idx on activity_automation_private.monitor_issue_audit(issue_key,at desc,id desc);
alter table activity_automation_private.monitor_issue_reviews enable row level security;
alter table activity_automation_private.monitor_issue_audit enable row level security;
revoke all on activity_automation_private.monitor_issue_reviews,activity_automation_private.monitor_issue_audit from public,anon,authenticated,service_role;
revoke all on sequence activity_automation_private.monitor_issue_audit_id_seq from public,anon,authenticated,service_role;

create or replace function activity_automation_private.monitor_issue_identity(r jsonb)
returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('source',r->>'source','mode',r->>'mode','entityType',r->>'entityType','id',r->>'id',
 'activity',r->>'activity','projectCode',r->>'projectCode','period',r->>'period','status',r->>'status',
 'code',r->>'code','stage',r->>'stage','recoveryState',r->>'recoveryState','evidenceFingerprint',r->>'evidenceFingerprint')
$$;
create or replace function activity_automation_private.monitor_issue_key(r jsonb)
returns text language sql immutable set search_path='' as $$
 select md5(activity_automation_private.monitor_issue_identity(r)::text)
$$;

-- Caller supplies a reference, never trusted project/evidence data.
create or replace function activity_automation_private.monitor_issue_record(p_source text,p_mode text,p_entity text,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caps jsonb; r jsonb; kind text;
begin
 caps:=activity_automation_private.monitor_access();
 if p_source is null or p_source not in ('shared','battle_pass') or p_mode is null or p_mode not in ('test','production')
 or p_entity is null or p_entity not in ('production_run','run','tick','incident','notification')
 or p_id is null or p_id!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 then raise exception 'Invalid issue reference' using errcode='22023';end if;
 if not coalesce((caps->>case when p_source='shared' then 'sharedRead' else 'battlePassRead' end)::boolean,false)
 then raise exception 'Monitor access denied' using errcode='42501';end if;
 kind:=case when p_entity='notification' then 'notifications' when p_entity='incident' then 'incidents' else 'runs' end;
 select x.record into r from activity_automation_private.monitor_rows(p_source,p_mode,null,kind,p_id) x where x.entity_type=p_entity;
 if r is null then raise exception 'Issue not found' using errcode='P0002';end if;
 if p_source='shared' and p_entity='production_run' then
  r:=r||jsonb_build_object('evidenceFingerprint',(select md5(x.source_hash) from activity_automation_private.production_runs x where x.id=p_id::uuid));
 end if;
 return r;
end $$;

create or replace function activity_automation_private.monitor_issue_actionable(r jsonb)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(r->>'mode'='production' and (r->>'status' in ('held','failed','blocked','review_required','uncertain','source_blocked','validation_failed','needs_review')
 or (r->>'status'='generation_pending' and r->>'needsAttention'='true')),false)
$$;

create or replace function activity_automation_private.monitor_issue_complete_output(r jsonb)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o jsonb; v_period text:=r->>'period';
begin
 if r->>'entityType'='notification' or v_period is null or v_period!~'^20[0-9]{2}-(0[1-9]|1[0-2])$' then return null;end if;
 if r->>'source'='shared' and r->>'entityType'='production_run' and r->>'projectCode' is not null then
  o:=activity_automation_private.production_existing_output(r->>'activity',r->>'projectCode',v_period);
 elsif r->>'source'='battle_pass' and r->>'entityType'='tick' then
  select x.record->'output' into o from activity_automation_private.monitor_rows('battle_pass','production',v_period,'outputs') x
  where x.record#>>'{output,complete}'='true' and x.record#>>'{output,generationState}'='complete'
  and exists(select 1 from public.marketing_content_items m join public.creative_request_details d on d.work_item_id=m.flowmate_work_item_id
    where m.id=(select b.task_id from battle_pass_private.monthly_runs b where b.mode='production' and b.period=v_period)
    and m.flowmate_work_item_id=(x.record#>>'{output,workItemId}')::uuid and d.brief_link=x.record#>>'{output,briefUrl}');
 end if;
 return o;
end $$;

create or replace function public.activity_automation_monitor_issue_get(p_source text,p_mode text,p_entity_type text,p_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; k text; review jsonb; audit jsonb;
begin
 r:=activity_automation_private.monitor_issue_record(p_source,p_mode,p_entity_type,p_id);
 k:=activity_automation_private.monitor_issue_key(r);
 select jsonb_build_object('state',v.state,'ownerId',v.owner_id,'ownerLabel',coalesce(nullif(to_jsonb(u)->>'display_name',''),'ผู้รับทราบ'),'comment',v.comment,'updatedAt',v.updated_at,'evidence',v.evidence)
 into review from activity_automation_private.monitor_issue_reviews v join public.users u on u.id=v.owner_id where v.issue_key=k;
 select coalesce(jsonb_agg(v order by at desc,id desc),'[]') into audit from (
 select a.id,a.at,jsonb_build_object('action',a.action,'actorId',a.actor_id,'comment',a.comment,'at',a.at,'evidence',a.evidence) v
 from activity_automation_private.monitor_issue_audit a where a.issue_key=k order by a.at desc,a.id desc limit 20) q;
 return jsonb_build_object('version',1,'observedAt',current_timestamp,'data',jsonb_build_object('issueKey',k,'issue',r,
 'review',review,'audit',audit,'currentOutput',activity_automation_private.monitor_issue_complete_output(r),'canManage',activity_automation_private.monitor_issue_actionable(r)));
end $$;

create or replace function public.activity_automation_monitor_issue_action(p_source text,p_mode text,p_entity_type text,p_id text,p_issue_key text,p_action text,p_comment text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; k text; old activity_automation_private.monitor_issue_reviews; evidence jsonb:='{}'; o jsonb; v_period text;
begin
 if p_action is null or p_action not in ('acknowledged','resolved','archived') or p_comment is null
 or length(btrim(p_comment)) not between 3 and 500 or p_mode is distinct from 'production'
 then raise exception 'Invalid review action' using errcode='22023';end if;
 -- Serialize reviews for the same issue; protects double clicks and cross-user transitions.
 perform pg_advisory_xact_lock(hashtextextended(concat_ws(':',p_source,p_mode,p_entity_type,p_id),0));
 r:=activity_automation_private.monitor_issue_record(p_source,p_mode,p_entity_type,p_id);
 k:=activity_automation_private.monitor_issue_key(r);
 if p_issue_key is distinct from k then raise exception 'Issue evidence changed; recheck required' using errcode='40001';end if;
 if not activity_automation_private.monitor_issue_actionable(r)
 then raise exception 'Issue is no longer active' using errcode='40001';end if;
 select * into old from activity_automation_private.monitor_issue_reviews where issue_key=k for update;
 if found and old.state in ('resolved','archived') then
  if old.state=p_action then return public.activity_automation_monitor_issue_get(p_source,p_mode,p_entity_type,p_id);end if;
  raise exception 'Review is already closed' using errcode='40001';
 end if;
 if old.state='acknowledged' and p_action='acknowledged' and old.owner_id=auth.uid() and old.comment=btrim(p_comment)
 then return public.activity_automation_monitor_issue_get(p_source,p_mode,p_entity_type,p_id);end if;
 if p_action='resolved' then
  if p_entity_type='notification' then
   -- Unknown provider delivery cannot be cleared by a complete CR.
   raise exception 'Notification delivery needs provider evidence' using errcode='23514';
  end if;
  v_period:=r->>'period';
  o:=activity_automation_private.monitor_issue_complete_output(r);
  if o is null then raise exception 'Matching complete output evidence required' using errcode='23514';end if;
  evidence:=jsonb_build_object('projectCode',r->>'projectCode','period',v_period,'displayId',o->>'displayId','workItemId',o->>'workItemId','briefUrl',o->>'briefUrl','verifiedAt',clock_timestamp());
 end if;
 insert into activity_automation_private.monitor_issue_reviews(issue_key,source,mode,entity_type,entity_id,fingerprint,state,owner_id,comment,evidence)
 values(k,p_source,p_mode,p_entity_type,p_id,k,p_action,auth.uid(),btrim(p_comment),evidence)
 on conflict(issue_key) do update set state=excluded.state,owner_id=excluded.owner_id,comment=excluded.comment,evidence=excluded.evidence,updated_at=clock_timestamp();
 insert into activity_automation_private.monitor_issue_audit(issue_key,action,actor_id,comment,evidence) values(k,p_action,auth.uid(),btrim(p_comment),evidence);
 return public.activity_automation_monitor_issue_get(p_source,p_mode,p_entity_type,p_id);
end $$;

-- Wrap the incumbent contract rather than replacing shared creation/notification rules.
create or replace function public.activity_automation_monitor_workspace_summary(p_mode text,p_month text,p_activity text default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; d jsonb; a jsonb; projects jsonb; p jsonb; obs jsonb; check_data jsonb; activities jsonb:='[]'; attention jsonb:='[]'; history jsonb:='[]'; r jsonb; review jsonb; caps jsonb; scanners jsonb:='[]'; t record; latest_tick uuid; live_count integer;
begin
 result:=public.activity_automation_monitor_summary(p_mode,p_month,p_activity);d:=result->'data';caps:=activity_automation_private.monitor_access();
 if p_mode='production' then
  if (caps->>'sharedRead')::boolean then
   select * into t from activity_automation_private.production_ticks order by started_at desc,id desc limit 1;
   if found then
    latest_tick:=t.id;
    select count(distinct activity) into live_count from activity_automation_private.production_observations where tick_id=t.id;
    scanners:=scanners||jsonb_build_array(jsonb_build_object('source','shared','label','Membership / Golden Spin / Conqueror / Topup','startedAt',t.started_at,'finishedAt',t.finished_at,
    'status',case when t.status='running' and t.lease_until<=current_timestamp then 'interrupted' else t.status end,'snapshotAt',t.snapshot_at,'observedFamilies',live_count,
    'fresh',t.finished_at is not null and t.finished_at>=current_timestamp-interval '65 minutes' and t.status in ('ok','waiting')));
   end if;
  end if;
  if (caps->>'battlePassRead')::boolean then
   select * into t from battle_pass_private.production_ticks where status not in ('readiness_checked','google_write_checked') and coalesce(detail->>'action','') not in ('readiness','google-write-check') order by checked_at desc,run_id desc limit 1;
   if found then scanners:=scanners||jsonb_build_array(jsonb_build_object('source','battle_pass','label','Battle Pass','startedAt',t.checked_at,'finishedAt',t.checked_at,'status',t.status,
    'fresh',t.checked_at>=current_timestamp-interval '65 minutes' and t.status not in ('failed','error','running')));end if;
  end if;
 end if;
 for a in select value from jsonb_array_elements(d->'activities') loop
  if p_mode='production' and a->>'sourceSystem'='shared' and a->>'availability'='ok' then
   projects:='[]';
   for p in select value from jsonb_array_elements(coalesce(a->'projects','[]')) loop
    select to_jsonb(o) into obs from activity_automation_private.production_observations o where o.activity=a->>'key' and o.project_code=p->>'projectCode'
    and coalesce(o.period,case when o.project_code~'^[0-9]{6}_' then '20'||substring(o.project_code,1,2)||'-'||substring(o.project_code,3,2) end)=p_month order by o.observed_at desc,o.source_row desc limit 1;
    check_data:=p->'lastSourceCheck'||jsonb_build_object('workingSheetLinked',activity_automation_private.monitor_boolean(obs->'working_sheet_linked'),'confirmed',activity_automation_private.monitor_boolean(obs->'loot_confirmed'),
     'sourceReady',obs->>'state'='ready','code',obs->>'code','tickId',obs->>'tick_id');
    projects:=projects||jsonb_build_array(p||jsonb_build_object('lastSourceCheck',check_data,'existingOutput',obs->'done_output'));
   end loop;
   a:=a||jsonb_build_object('projects',projects);
   if jsonb_array_length(projects)>0 then a:=a||jsonb_build_object('lastSourceCheck',projects->(jsonb_array_length(projects)-1)->'lastSourceCheck');end if;
  end if;
  activities:=activities||jsonb_build_array(a);
 end loop;
 for r in select value from jsonb_array_elements(d->'attention') loop
  if r->>'source'='shared' and r->>'entityType'='production_run' then
   r:=r||jsonb_build_object('evidenceFingerprint',(select md5(x.source_hash) from activity_automation_private.production_runs x where x.id=(r->>'id')::uuid));
  end if;
  review:=null;
  select jsonb_build_object('state',v.state,'ownerId',v.owner_id,'comment',v.comment,'updatedAt',v.updated_at) into review
  from activity_automation_private.monitor_issue_reviews v where v.issue_key=activity_automation_private.monitor_issue_key(r);
  r:=r||jsonb_build_object('review',review,'issueKey',activity_automation_private.monitor_issue_key(r));
  if review->>'state' in ('resolved','archived') then history:=history||jsonb_build_array(r);else attention:=attention||jsonb_build_array(r);end if;
 end loop;
 d:=d||jsonb_build_object('activities',activities,'attention',attention,'reviewHistory',history,'scanners',scanners,'issueReviewAvailable',true);
 d:=jsonb_set(d,'{cards,attention}',to_jsonb(greatest(0,coalesce((d#>>'{cards,attention}')::integer,0)-jsonb_array_length(history))));
 return jsonb_set(result,'{data}',d);
end $$;

create or replace function public.activity_automation_monitor_history(p_mode text,p_month text,p_activity text default null,p_status text default null,p_search text default null,p_cursor text default null,p_limit integer default 25,p_history text default 'significant')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare caps jsonb; fp text; c jsonb; rows jsonb; next_cursor text; n integer; skip integer:=0; total integer; sources jsonb:='[]'; lo timestamptz; hi timestamptz;
begin
 caps:=activity_automation_private.monitor_access();perform activity_automation_private.monitor_validate(p_mode,p_month,p_activity,p_search);
 if p_history is null or p_history not in ('significant','scans','creation','all') or (p_status is not null and p_status!~'^[a-z_]{1,50}$') then raise exception 'Invalid history filter' using errcode='22023';end if;
 n:=least(greatest(coalesce(p_limit,25),1),100);fp:=md5(jsonb_build_array(p_mode,p_month,p_activity,p_status,p_search,p_history)::text);
 if p_cursor is not null then begin
  if length(p_cursor)>2000 then raise exception 'Invalid cursor';end if;
  c:=convert_from(decode(p_cursor,'base64'),'UTF8')::jsonb;
  if c->>'filter' is distinct from fp or coalesce(c->>'offset','')!~'^[0-9]{1,7}$' or c->>'cutoff' is null then raise exception 'Invalid cursor';end if;
  skip:=(c->>'offset')::integer;perform (c->>'cutoff')::timestamptz;
 exception when others then raise exception 'Invalid history cursor' using errcode='22023';end;end if;
 if c is null then c:=jsonb_build_object('cutoff',current_timestamp);end if;
 lo:=(p_month||'-01')::timestamp at time zone 'Asia/Bangkok';hi:=((p_month||'-01')::date+interval '1 month')::timestamp at time zone 'Asia/Bangkok';
 if (caps->>'sharedRead')::boolean then sources:=sources||jsonb_build_array(jsonb_build_object('source','shared','status','ok'));end if;
 if (caps->>'battlePassRead')::boolean then sources:=sources||jsonb_build_array(jsonb_build_object('source','battle_pass','status','ok'));end if;
 with records as (
  select x.record r from activity_automation_private.monitor_rows('shared',p_mode,p_month,'runs') x where (caps->>'sharedRead')::boolean
  union all select x.record from activity_automation_private.monitor_rows('battle_pass',p_mode,p_month,'runs') x where (caps->>'battlePassRead')::boolean
  union all select jsonb_build_object('source','shared','entityType','scan','id',t.id,'activity','shared','mode','production','status',t.status,'code',t.code,'eventAt',t.started_at,'finishedAt',t.finished_at,'stage','source')
  from activity_automation_private.production_ticks t where p_mode='production' and (caps->>'sharedRead')::boolean and t.started_at>=lo and t.started_at<hi
 ), classified as (
  select r,case when r->>'entityType'='scan' or (r->>'source'='battle_pass' and r->>'entityType'='tick' and
   (r->>'stage'='source' or r->>'kind' in ('readiness','probe') or r->>'status' in ('waiting_confirmation','readiness_checked','no_pending_month','source_blocked','validation_failed'))) then 'scans' else 'creation' end category from records
 ), filtered as (
 select r from classified where (r->>'eventAt')::timestamptz<=(c->>'cutoff')::timestamptz
 and (p_activity is null or r->>'activity'=p_activity or (r->>'activity'='shared' and p_activity<>'battle_pass'))
 and (p_status is null or r->>'status'=p_status)
 and (p_search is null or p_search='' or position(lower(p_search) in lower(coalesce(r->>'projectCode','')||' '||coalesce(r->>'id','')||' '||coalesce(r#>>'{output,displayId}','')))>0)
 and (p_history='all' or p_history=category or (p_history='significant' and r->>'status' not in ('waiting','waiting_confirmation','readiness_checked','no_pending_month','ok')))
 ), page as (select r from filtered order by (r->>'eventAt')::timestamptz desc,r->>'source' desc,r->>'entityType' desc,r->>'id' desc offset skip limit n+1)
 select coalesce(jsonb_agg(r order by (r->>'eventAt')::timestamptz desc,r->>'source' desc,r->>'entityType' desc,r->>'id' desc),'[]'),count(*) into rows,total from page;
 if total>n then rows:=rows- n;next_cursor:=encode(convert_to(jsonb_build_object('filter',fp,'offset',skip+n,'cutoff',c->>'cutoff')::text,'UTF8'),'base64');end if;
 return jsonb_build_object('version',1,'observedAt',current_timestamp,'sources',sources,'data',jsonb_build_object('rows',rows,'hasMore',total>n,'nextCursor',next_cursor,'history',p_history));
end $$;

do $$ declare f record;begin
 for f in select p.oid::regprocedure sig,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='activity_automation_private' and p.proname in ('monitor_issue_identity','monitor_issue_key','monitor_issue_record','monitor_issue_actionable','monitor_issue_complete_output'))
 or (n.nspname='public' and p.proname in ('activity_automation_monitor_issue_get','activity_automation_monitor_issue_action','activity_automation_monitor_workspace_summary','activity_automation_monitor_history')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.sig);
 if f.nspname='public' then execute format('grant execute on function %s to authenticated',f.sig);end if;
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
