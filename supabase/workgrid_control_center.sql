-- WCC v0.6 local implementation. Rehearse offline first. Production apply requires approval.
-- Additive schema; no provider calls, scheduler activation or legacy data deletion.
begin;
do $$ begin
 if to_regprocedure('public.is_admin_app_user()') is null or
    to_regprocedure('public.flowmate_member_access_allowed(uuid)') is null or
    to_regprocedure('public.flowmate_user_can_read_work_item(uuid,uuid)') is null then
  raise exception 'WCC prerequisite missing: review effective member/admin/work permissions';
 end if;
end $$;
create schema if not exists wcc_private;
revoke all on schema wcc_private from public,anon,authenticated;
create table if not exists wcc_private.settings(singleton boolean primary key default true check(singleton),
 runtime_enabled boolean not null default false);
insert into wcc_private.settings values(true,false) on conflict do nothing;
create table if not exists wcc_private.entities(
 kind text not null check(kind in ('bot','destination','profile','rule')), key text not null,
 team_code text references public.teams(code), data jsonb not null, version integer not null default 1,
 updated_at timestamptz not null default now(), primary key(kind,key), check(version>0),
 check(key ~ '^[A-Za-z0-9_.:-]{1,160}$'), check(jsonb_typeof(data)='object'));
create unique index if not exists wcc_bot_app on wcc_private.entities((data->>'app_id')) where kind='bot';
drop index if exists wcc_private.wcc_profile_member_bot;
create unique index wcc_profile_member_bot on wcc_private.entities((data->>'member_id'),(data->>'bot_key'),team_code) where kind='profile';
create unique index if not exists wcc_destination_bot_group on wcc_private.entities((data->>'bot_key'),(data->>'group_id')) where kind='destination';
create table if not exists wcc_private.reviewers(user_id uuid references public.users(id),team_code text references public.teams(code),
 primary key(user_id,team_code));
create table if not exists wcc_private.ownership(event_kind text,scope text,created_at timestamptz not null default now(),primary key(event_kind,scope));
create table if not exists wcc_private.checks(kind text,key text,fingerprint text not null,verified boolean not null,
 evidence jsonb not null default '{}',checked_at timestamptz not null default now(),primary key(kind,key),
 foreign key(kind,key) references wcc_private.entities(kind,key));
create table if not exists wcc_private.proposals(id uuid primary key default gen_random_uuid(),kind text not null,key text not null,
 team_code text,base_version integer not null,data jsonb not null,reason text not null,actor_id uuid not null,
 status text not null default 'pending' check(status in ('pending','applied','rejected')),created_at timestamptz not null default now(),
 decided_by uuid,decided_at timestamptz);
create table if not exists wcc_private.audit(id bigint generated always as identity primary key,actor_id uuid,action text not null,
 kind text,key text,team_code text,before_value jsonb,after_value jsonb,reason text,created_at timestamptz not null default now());
create table if not exists wcc_private.events(id uuid primary key default gen_random_uuid(),work_item_id uuid references public.work_items(id),
 event_kind text not null,instance_id uuid not null default gen_random_uuid(),recipient_id uuid,team_code text,
 payload jsonb not null default '{}',created_at timestamptz not null default now(),current_instance boolean not null default true);
alter table wcc_private.events add column if not exists source_key text;
create unique index if not exists wcc_event_source on wcc_private.events(source_key) where source_key is not null;
create index if not exists wcc_current_event on wcc_private.events(work_item_id,event_kind) where current_instance;
create table if not exists wcc_private.deliveries(id uuid primary key default gen_random_uuid(),event_id uuid references wcc_private.events(id),
 bot_key text not null,recipient_id uuid,profile_key text,destination_key text,team_code text,rule_key text,
 rule_version integer,profile_version integer,destination_version integer,bot_version integer,
 status text not null default 'pending' check(status in ('pending','sending','provider_accepted','retryable','failed','uncertain','cancelled','suppressed')),
 reason text,attempt integer not null default 0,available_at timestamptz not null default now(),lease_id uuid,lease_until timestamptz,
 send_started_at timestamptz,provider_id text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(event_id,bot_key,recipient_id));
create index if not exists wcc_delivery_due on wcc_private.deliveries(available_at,created_at) where status in ('pending','retryable');
create index if not exists wcc_delivery_team on wcc_private.deliveries(team_code,created_at desc);
alter table wcc_private.deliveries add column if not exists steps jsonb not null default '{}';
-- No browser can reach the private tables, including audit and provider evidence.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='wcc_private' loop
  execute format('alter table wcc_private.%I enable row level security',t.tablename);
  execute format('revoke all on table wcc_private.%I from public,anon,authenticated',t.tablename);
 end loop;
end $$;

create or replace function wcc_private.server_required() returns void language plpgsql set search_path='' as $$ begin
 if auth.role() is distinct from 'service_role' or auth.uid() is not null then
  raise exception 'Server caller required' using errcode='42501'; end if;
end $$;
create or replace function wcc_private.can_team(p_team text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(public.is_admin_app_user(),false) or (public.flowmate_member_access_allowed(auth.uid()) is true and exists(
  select 1 from wcc_private.reviewers r join public.user_team_memberships m on m.user_id=r.user_id and m.team_code=r.team_code
  where r.user_id=auth.uid() and r.team_code=p_team))
$$;
create or replace function wcc_private.fingerprint(p_kind text,p_data jsonb) returns text language sql immutable set search_path='' as $$
 select md5((p_data - 'state' - 'enabled' - 'events' - 'label')::text)
$$;
create or replace function wcc_private.checked(p_kind text,p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from wcc_private.entities e join wcc_private.checks c using(kind,key)
 where e.kind=p_kind and e.key=p_key and c.verified and c.fingerprint=wcc_private.fingerprint(e.kind,e.data)
 and c.checked_at>now()-interval '24 hours')
 and (p_kind='bot' or exists(select 1 from wcc_private.entities e join wcc_private.entities b on b.kind='bot' and b.key=e.data->>'bot_key'
 join wcc_private.checks c on c.kind=e.kind and c.key=e.key where e.kind=p_kind and e.key=p_key
 and c.evidence->>'bot_fingerprint'=wcc_private.fingerprint('bot',b.data)
 and (e.kind<>'profile' or e.data->>'channel'<>'group' or exists(select 1 from wcc_private.entities d where d.kind='destination' and d.key=e.data->>'destination_key'
 and c.evidence->>'destination_fingerprint'=wcc_private.fingerprint('destination',d.data)))))
$$;
create or replace function wcc_private.validate(p_kind text,p_key text,p_data jsonb,p_team text) returns void
language plpgsql security definer set search_path='' as $$
declare b wcc_private.entities; dest wcc_private.entities; m public.team_members; evt text; field text;
 allowed text[]; required text[]; begin
 if jsonb_typeof(p_data) is distinct from 'object' or p_key !~ '^[A-Za-z0-9_.:-]{1,160}$' then raise exception 'Invalid configuration'; end if;
 allowed:=case p_kind when 'bot' then array['label','app_id','credential_ref','state','allowed_events','allowed_teams']
 when 'destination' then array['label','bot_key','group_id','state','owner','purpose']
 when 'profile' then array['member_id','bot_key','channel','destination_key','seatalk_id','employment_type','enabled','events']
 when 'rule' then array['label','event','bot_key','enabled','destination_key'] else '{}'::text[] end;
 for field in select jsonb_object_keys(p_data) loop if not field=any(allowed) then raise exception 'Unsupported field %',field; end if; end loop;
 required:=case p_kind when 'bot' then array['label','app_id','credential_ref','state','allowed_events','allowed_teams']
 when 'destination' then array['label','bot_key','group_id','state'] when 'profile' then array['member_id','bot_key','channel','employment_type','enabled','events']
 when 'rule' then array['event','bot_key','enabled'] else '{}'::text[] end;
 for field in select unnest(required) loop if not (p_data ? field) or p_data->field='null'::jsonb then raise exception 'Required field %',field; end if; end loop;
 if p_kind='bot' then
  if p_team is not null or nullif(trim(p_data->>'label'),'') is null or p_data->>'app_id' !~ '^[A-Za-z0-9_-]{4,100}$'
   or p_data->>'credential_ref' !~ '^WCC_BOT_SECRET_[A-Z0-9_]{1,64}$'
   or p_data->>'state' not in ('draft','active','inactive','archived')
   or jsonb_typeof(p_data->'allowed_events') is distinct from 'array'
   or jsonb_typeof(p_data->'allowed_teams') is distinct from 'array' then raise exception 'Invalid Bot configuration'; end if;
  for evt in select jsonb_array_elements_text(p_data->'allowed_events') loop
   if evt not in ('creative.assigned','creative.review_requested','quick_task.assigned','activity.output_ready','activity.held','activity.failed','activity.source_issue','activity.scheduler_issue') then raise exception 'Unsupported event'; end if;
  end loop;
  for evt in select jsonb_array_elements_text(p_data->'allowed_teams') loop
   if not exists(select 1 from public.teams where code=evt and is_active) then raise exception 'Unknown team'; end if;
  end loop;
  if p_data->>'state'='active' and not exists(select 1 from wcc_private.checks c where c.kind='bot' and c.key=p_key and c.verified
   and c.fingerprint=wcc_private.fingerprint(p_kind,p_data) and c.checked_at>now()-interval '24 hours') then raise exception 'Check Bot connection first'; end if;
  return;
 end if;
 if p_team is null or not exists(select 1 from public.teams where code=p_team and is_active) then raise exception 'Team required'; end if;
 select * into b from wcc_private.entities where kind='bot' and key=p_data->>'bot_key';
 if b.key is null or b.data->>'state'='archived' or not (b.data->'allowed_teams' ? p_team) then raise exception 'Bot is unavailable for this team'; end if;
 if p_kind='destination' then
  if nullif(trim(p_data->>'label'),'') is null or p_data->>'group_id' !~ '^[A-Za-z0-9_-]{8,100}$'
   or p_data->>'group_id' in ('aaaaaabbbbbb','placeholder') or p_data->>'state' not in ('draft','active','inactive','archived') then raise exception 'Enter a real group ID and state'; end if;
  if p_data->>'state'='active' and not exists(select 1 from wcc_private.checks c where c.kind=p_kind and c.key=p_key and c.verified
   and c.fingerprint=wcc_private.fingerprint(p_kind,p_data) and c.checked_at>now()-interval '24 hours') then raise exception 'Verify group access first'; end if;
 elsif p_kind='profile' then
  select * into m from public.team_members where id=(p_data->>'member_id')::uuid;
  if m.id is null or m.user_id is null or not exists(select 1 from public.user_team_memberships where user_id=m.user_id and team_code=p_team)
   or p_data->>'channel' not in ('direct','group','disabled') or p_data->>'employment_type' not in ('Fulltime','Freelance','unknown')
   or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' or jsonb_typeof(p_data->'events') is distinct from 'array'
   then raise exception 'Invalid member profile'; end if;
  for evt in select jsonb_array_elements_text(p_data->'events') loop
   if evt not in ('creative.assigned','creative.review_requested','quick_task.assigned') or not (b.data->'allowed_events' ? evt) then raise exception 'Event unavailable for Bot'; end if;
  end loop;
  if p_data->>'channel'='group' then
   select * into dest from wcc_private.entities where kind='destination' and key=p_data->>'destination_key';
   if dest.key is null or dest.team_code is distinct from p_team or dest.data->>'bot_key' is distinct from b.key then raise exception 'Destination does not match member/Bot/team'; end if;
   if coalesce(p_data->>'seatalk_id','') !~ '^[0-9]{1,30}$' then raise exception 'Group recipient SeaTalk ID required'; end if;
  end if;
  if p_data->>'employment_type'='Freelance' and p_data->>'channel'='direct' then raise exception 'Freelance requires a verified group route'; end if;
  if (p_data->>'enabled')::boolean and (not m.active or not public.flowmate_member_access_allowed(m.user_id)
   or p_data->>'channel'='disabled' or not exists(select 1 from wcc_private.checks c where c.kind=p_kind and c.key=p_key and c.verified
   and c.fingerprint=wcc_private.fingerprint(p_kind,p_data) and c.checked_at>now()-interval '24 hours')) then raise exception 'Verify active member route first'; end if;
 elsif p_kind='rule' then
  evt:=p_data->>'event';
  if evt is null or not (b.data->'allowed_events' ? evt) or jsonb_typeof(p_data->'enabled') is distinct from 'boolean' then raise exception 'Invalid rule event'; end if;
  if evt like 'activity.%' then
   select * into dest from wcc_private.entities where kind='destination' and key=p_data->>'destination_key';
   if dest.key is null or dest.team_code is distinct from p_team or dest.data->>'bot_key' is distinct from b.key then raise exception 'Activity destination mismatch'; end if;
  elsif evt not in ('creative.assigned','creative.review_requested','quick_task.assigned') then raise exception 'Unsupported event'; end if;
 else raise exception 'Unsupported entity'; end if;
end $$;

create or replace function public.wcc_apply(p_kind text,p_key text,p_data jsonb,p_team text,p_expected integer,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old wcc_private.entities; saved wcc_private.entities; begin
 if public.is_admin_app_user() is not true then raise exception 'Admin required' using errcode='42501'; end if;
 if nullif(trim(p_reason),'') is null or length(p_reason)>300 then raise exception 'Reason required (max 300)'; end if;
 perform pg_advisory_xact_lock(hashtext('wcc:'||p_kind||':'||p_key));
 select * into old from wcc_private.entities where kind=p_kind and key=p_key for update;
 if coalesce(old.version,0) is distinct from p_expected then raise exception 'Configuration changed; reload and review' using errcode='40001'; end if;
 if old.key is not null and old.team_code is distinct from p_team then raise exception 'Cannot reassign entity team'; end if;
 perform wcc_private.validate(p_kind,p_key,p_data,p_team);
 insert into wcc_private.entities(kind,key,team_code,data,version) values(p_kind,p_key,p_team,p_data,1)
 on conflict(kind,key) do update set data=excluded.data,version=wcc_private.entities.version+1,updated_at=now() returning * into saved;
 insert into wcc_private.audit(actor_id,action,kind,key,team_code,before_value,after_value,reason)
 values(auth.uid(),'apply',p_kind,p_key,p_team,to_jsonb(old),to_jsonb(saved),p_reason);
 if (select runtime_enabled from wcc_private.settings where singleton) and p_kind='profile' and p_data->>'enabled'='true' and p_data->'events' ? 'creative.assigned' then
  insert into wcc_private.ownership(event_kind,scope) select 'creative.assigned',user_id::text from public.team_members where id=(p_data->>'member_id')::uuid on conflict do nothing;
 elsif (select runtime_enabled from wcc_private.settings where singleton) and p_kind='rule' and p_data->>'enabled'='true' and p_data->>'event' like 'activity.%' then
  insert into wcc_private.ownership values(p_data->>'event',p_team,now()) on conflict do nothing;
 end if;
 -- Config changes do not silently reroute a previously queued message.
 update wcc_private.deliveries set status='cancelled',reason='configuration_changed',updated_at=now()
 where status in ('pending','retryable') and (bot_key=p_key and p_kind='bot' or profile_key=p_key and p_kind='profile'
 or destination_key=p_key and p_kind='destination' or rule_key=p_key and p_kind='rule');
 return to_jsonb(saved);
end $$;
create or replace function public.wcc_propose(p_kind text,p_key text,p_data jsonb,p_team text,p_expected integer,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid; old wcc_private.entities; begin
 if p_kind='bot' or p_team is null or wcc_private.can_team(p_team) is not true then raise exception 'Team reviewer required' using errcode='42501'; end if;
 select * into old from wcc_private.entities where kind=p_kind and key=p_key;
 if old.key is not null and old.team_code is distinct from p_team then raise exception 'Wrong team' using errcode='42501'; end if;
 if coalesce(old.version,0) is distinct from p_expected then raise exception 'Configuration changed' using errcode='40001'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Reason required'; end if;
 perform wcc_private.validate(p_kind,p_key,p_data,p_team);
 insert into wcc_private.proposals(kind,key,team_code,data,base_version,reason,actor_id)
 values(p_kind,p_key,p_team,p_data,p_expected,left(p_reason,300),auth.uid()) returning id into result; return result;
end $$;
create or replace function public.wcc_decide(p_id uuid,p_accept boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$ declare p wcc_private.proposals; result jsonb; begin
 if public.is_admin_app_user() is not true then raise exception 'Admin required' using errcode='42501'; end if;
 select * into p from wcc_private.proposals where id=p_id for update;
 if p.id is null or p.status<>'pending' then raise exception 'Proposal not pending'; end if;
 if p_accept is null or nullif(trim(p_reason),'') is null then raise exception 'Decision and reason required'; end if;
 if p_accept then result:=public.wcc_apply(p.kind,p.key,p.data,p.team_code,p.base_version,p_reason); end if;
 update wcc_private.proposals set status=case when p_accept then 'applied' else 'rejected' end,decided_by=auth.uid(),decided_at=now() where id=p.id;
 insert into wcc_private.audit(actor_id,action,kind,key,team_code,reason) values(auth.uid(),case when p_accept then 'approve' else 'reject' end,p.kind,p.key,p.team_code,left(p_reason,300));
 return coalesce(result,jsonb_build_object('status','rejected'));
end $$;
create or replace function public.wcc_set_reviewer(p_user uuid,p_team text,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$ begin
 if public.is_admin_app_user() is not true then raise exception 'Admin required' using errcode='42501'; end if;
 if p_enabled is null or not public.flowmate_member_access_allowed(p_user) or not exists(select 1 from public.user_team_memberships where user_id=p_user and team_code=p_team) then raise exception 'Active team membership required'; end if;
 if p_enabled then insert into wcc_private.reviewers values(p_user,p_team) on conflict do nothing;
 else delete from wcc_private.reviewers where user_id=p_user and team_code=p_team; end if;
 insert into wcc_private.audit(actor_id,action,team_code,after_value) values(auth.uid(),'reviewer',p_team,jsonb_build_object('user_id',p_user,'enabled',p_enabled));
end $$;
create or replace function public.wcc_set_runtime(p_enabled boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$ begin
 if public.is_admin_app_user() is not true then raise exception 'Admin required' using errcode='42501'; end if;
 if p_enabled is null or nullif(trim(p_reason),'') is null then raise exception 'State and reason required'; end if;
 update wcc_private.settings set runtime_enabled=p_enabled;
 if p_enabled then
  insert into wcc_private.ownership(event_kind,scope)
   select distinct 'creative.assigned',m.user_id::text from wcc_private.entities p join public.team_members m on m.id=(p.data->>'member_id')::uuid
   where p.kind='profile' and p.data->>'enabled'='true' and p.data->'events' ? 'creative.assigned' on conflict do nothing;
  insert into wcc_private.ownership(event_kind,scope) select data->>'event',team_code from wcc_private.entities
   where kind='rule' and data->>'enabled'='true' and data->>'event' like 'activity.%' on conflict do nothing;
 end if;
 if not p_enabled then update wcc_private.deliveries set status='cancelled',reason='runtime_paused' where status in ('pending','retryable'); end if;
 insert into wcc_private.audit(actor_id,action,after_value,reason) values(auth.uid(),'runtime',jsonb_build_object('enabled',p_enabled),left(p_reason,300));
end $$;

create or replace function public.wcc_access() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.teams where is_active and wcc_private.can_team(code))
$$;
create or replace function public.wcc_impact(p_kind text,p_key text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare e wcc_private.entities; result jsonb; begin
 if p_kind='runtime' then
  if public.is_admin_app_user() is not true then raise exception 'Admin required' using errcode='42501'; end if;
 else
  select * into strict e from wcc_private.entities where kind=p_kind and key=p_key;
  if (p_kind='bot' and public.is_admin_app_user() is not true) or (p_kind<>'bot' and wcc_private.can_team(e.team_code) is not true) then raise exception 'Scope denied' using errcode='42501'; end if;
 end if;
 select jsonb_build_object('pending',count(*) filter(where status in ('pending','retryable')),
 'in_flight',count(*) filter(where status='sending'),'history',count(*),'scope','WCC queue only; legacy in-flight requires release preflight') into result
 from wcc_private.deliveries where p_kind='runtime' or (p_kind='bot' and bot_key=p_key)
 or (p_kind='destination' and destination_key=p_key) or (p_kind='profile' and profile_key=p_key) or (p_kind='rule' and rule_key=p_key);
 return result;
end $$;
create or replace function public.wcc_workspace() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare adm boolean:=coalesce(public.is_admin_app_user(),false); teams jsonb; begin
 select coalesce(jsonb_agg(code order by code),'[]') into teams from public.teams where is_active and wcc_private.can_team(code);
 if jsonb_array_length(teams)=0 then raise exception 'Control Center access denied' using errcode='42501'; end if;
 return jsonb_build_object('version',1,'actor_id',auth.uid(),'admin',adm,'teams',teams,'runtime',(select runtime_enabled from wcc_private.settings where singleton),
 'entities',(select coalesce(jsonb_agg(to_jsonb(e)||jsonb_build_object('verification',coalesce((select jsonb_build_object('verified',c.verified,'current',wcc_private.checked(e.kind,e.key),'checked_at',c.checked_at,'evidence',c.evidence) from wcc_private.checks c where c.kind=e.kind and c.key=e.key),'null'::jsonb)) order by e.kind,e.key),'[]') from wcc_private.entities e where e.team_code is null or teams ? e.team_code),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'member_code',m.member_code,'name',m.display_name,'active',m.active,
 'email',u.email,'role',u.role,'teams',(select coalesce(jsonb_agg(t.team_code),'[]') from public.user_team_memberships t where t.user_id=m.user_id and teams ? t.team_code))),'[]')
 from public.team_members m join public.users u on u.id=m.user_id where exists(select 1 from public.user_team_memberships t where t.user_id=m.user_id and teams ? t.team_code)),
 'reviewers',(select coalesce(jsonb_agg(to_jsonb(r)),'[]') from wcc_private.reviewers r where teams ? r.team_code),
 'tests',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from (select t.* from wcc_private.test_requests t join wcc_private.entities e on e.kind=t.kind and e.key=t.key where adm or teams ? e.team_code order by t.created_at desc limit 100) t),
 'tests',(select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc),'[]') from (select t.* from wcc_private.test_requests t join wcc_private.entities e on e.kind=t.kind and e.key=t.key where adm or teams ? e.team_code order by t.created_at desc limit 100) t),
 'proposals',(select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at desc),'[]') from (select * from wcc_private.proposals where teams ? team_code order by created_at desc limit 100) p),
 'deliveries',(select coalesce(jsonb_agg(to_jsonb(d)||jsonb_build_object('event_kind',e.event_kind,'payload',e.payload) order by d.created_at desc),'[]') from
 (select * from wcc_private.deliveries where teams ? team_code order by created_at desc limit 100) d join wcc_private.events e on e.id=d.event_id),
 'work_items',(select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'display_id',w.display_id,'title',w.title,'status',w.status,'type',w.work_type)),'[]') from
 (select * from public.work_items where archived_at is null and (adm or teams ? owning_team_code and public.flowmate_user_can_read_work_item(auth.uid(),id) is true) order by id limit 100) w),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id desc),'[]') from (select * from wcc_private.audit where adm or teams ? team_code order by id desc limit 100) a));
end $$;

create or replace function wcc_private.enqueue(p_event uuid) returns void language plpgsql security definer set search_path='' as $$
declare evt wcc_private.events; r wcc_private.entities; b wcc_private.entities; p wcc_private.entities; dest wcc_private.entities;
 reason text; recipient uuid; begin
 if not (select runtime_enabled from wcc_private.settings where singleton) then return; end if;
 select * into strict evt from wcc_private.events where id=p_event;
 for r in select * from wcc_private.entities where kind='rule' and data->>'event'=evt.event_kind and team_code=evt.team_code and (data->>'enabled')::boolean loop
  select * into b from wcc_private.entities where kind='bot' and key=r.data->>'bot_key';
  reason:=null; recipient:=evt.recipient_id; p:=null; dest:=null;
  if b.data->>'state' is distinct from 'active' or not wcc_private.checked('bot',b.key) then reason:='bot_not_ready'; end if;
  if evt.event_kind like 'activity.%' then
   select * into dest from wcc_private.entities where kind='destination' and key=r.data->>'destination_key';
   if dest.data->>'state' is distinct from 'active' or not wcc_private.checked('destination',dest.key) then reason:=coalesce(reason,'destination_not_ready'); end if;
  else
   select x.* into p from wcc_private.entities x join public.team_members m on m.id=(x.data->>'member_id')::uuid
   where x.kind='profile' and x.data->>'bot_key'=b.key and x.team_code=evt.team_code and m.user_id=recipient;
   if p.key is null or not coalesce((p.data->>'enabled')::boolean,false) or not (p.data->'events' ? evt.event_kind) then reason:=coalesce(reason,'profile_event_disabled');
   elsif not wcc_private.checked('profile',p.key) then reason:=coalesce(reason,'profile_not_verified'); end if;
   if p.data->>'channel'='group' then
    select * into dest from wcc_private.entities where kind='destination' and key=p.data->>'destination_key';
    if dest.data->>'state' is distinct from 'active' or not wcc_private.checked('destination',dest.key) then reason:=coalesce(reason,'destination_not_ready'); end if;
   end if;
   if recipient is null or not public.flowmate_member_access_allowed(recipient) or public.flowmate_user_can_read_work_item(recipient,evt.work_item_id) is not true then reason:=coalesce(reason,'recipient_access_denied'); end if;
  end if;
  insert into wcc_private.deliveries(event_id,bot_key,recipient_id,profile_key,destination_key,team_code,rule_key,rule_version,profile_version,destination_version,bot_version,status,reason)
  values(evt.id,b.key,coalesce(recipient,'00000000-0000-0000-0000-000000000000'::uuid),p.key,dest.key,evt.team_code,r.key,r.version,p.version,dest.version,b.version,
   case when reason is null then 'pending' else 'suppressed' end,reason) on conflict(event_id,bot_key,recipient_id) do nothing;
 end loop;
end $$;
create or replace function wcc_private.observe_work() returns trigger language plpgsql security definer set search_path='' as $$
declare v_kind text; v_recipient uuid; v_team text; event_id uuid; old_assignee uuid; new_assignee uuid; begin
 if new.work_type not in ('creative_request','quick_task') then return new; end if;
 new_assignee:=coalesce(new.assignee_user_id,(select user_id from public.team_members where id=new.final_owner_member_id));
 if TG_OP='UPDATE' then old_assignee:=coalesce(old.assignee_user_id,(select user_id from public.team_members where id=old.final_owner_member_id)); end if;
 if new.status::text='assigned' and new_assignee is not null and (TG_OP='INSERT' or old.status::text<>'assigned' or new_assignee is distinct from old_assignee) then
  v_kind:=case when new.work_type='creative_request' then 'creative.assigned' else 'quick_task.assigned' end; v_recipient:=new_assignee;
 elsif new.work_type='creative_request' and new.status::text='review' and (TG_OP='INSERT' or old.status::text<>'review') then
  v_kind:='creative.review_requested';v_recipient:=new.requester_user_id;
 end if;
 -- Invalidate old instances even when a new notification is not produced.
 update wcc_private.events set current_instance=false where work_item_id=new.id and current_instance and (team_code is distinct from new.owning_team_code or
  event_kind like '%.assigned' and (new.status::text<>'assigned' or recipient_id is distinct from new_assignee)
  or event_kind='creative.review_requested' and (new.status::text<>'review' or recipient_id is distinct from new.requester_user_id));
 update wcc_private.deliveries d set status='cancelled',reason='stale_instance',updated_at=now() from wcc_private.events e
 where e.id=d.event_id and e.work_item_id=new.id and not e.current_instance and d.status in ('pending','retryable');
 if v_kind is null then return new; end if;
 update wcc_private.events set current_instance=false where work_item_id=new.id and event_kind=v_kind and current_instance;
 v_team:=new.owning_team_code;
 insert into wcc_private.events(work_item_id,event_kind,recipient_id,team_code,payload)
 values(new.id,v_kind,v_recipient,v_team,jsonb_build_object('display_id',new.display_id,'title',new.title,
 'requester_email',(select email from public.users where id=new.requester_user_id),'due_date',to_jsonb(new)->>'due_date')) returning id into event_id;
 perform wcc_private.enqueue(event_id); return new;
end $$;
drop trigger if exists wcc_observe_work on public.work_items;
create trigger wcc_observe_work after insert or update of status,assignee_user_id,final_owner_member_id,requester_user_id,archived_at,owning_team_code on public.work_items
 for each row execute function wcc_private.observe_work();

create or replace function wcc_private.delivery_ready(p_id uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare d wcc_private.deliveries;e wcc_private.events; b wcc_private.entities; r wcc_private.entities; p wcc_private.entities;dest wcc_private.entities; w public.work_items; activity_ok boolean; begin
 select * into d from wcc_private.deliveries where id=p_id; select * into e from wcc_private.events where id=d.event_id;
 if not (select runtime_enabled from wcc_private.settings where singleton) or e.current_instance is not true then return false; end if;
 select * into b from wcc_private.entities where kind='bot' and key=d.bot_key;
 select * into r from wcc_private.entities where kind='rule' and key=d.rule_key;
 if b.version is distinct from d.bot_version or b.data->>'state' is distinct from 'active' or not wcc_private.checked('bot',b.key)
  or r.version is distinct from d.rule_version or (r.data->>'enabled')::boolean is not true then return false; end if;
 if d.profile_key is not null then
  select * into p from wcc_private.entities where kind='profile' and key=d.profile_key;
  if p.version is distinct from d.profile_version or (p.data->>'enabled')::boolean is not true or not (p.data->'events' ? e.event_kind)
   or not wcc_private.checked('profile',p.key) or not exists(select 1 from public.team_members where id=(p.data->>'member_id')::uuid and active)
   or public.flowmate_member_access_allowed(d.recipient_id) is not true then return false; end if;
 end if;
 if d.destination_key is not null then
  select * into dest from wcc_private.entities where kind='destination' and key=d.destination_key;
  if dest.version is distinct from d.destination_version or dest.data->>'state' is distinct from 'active' or not wcc_private.checked('destination',dest.key) then return false; end if;
 end if;
 if e.event_kind like 'activity.%' then
  if to_regprocedure('wcc_private.activity_ready(jsonb)') is null then return false; end if;
  execute 'select wcc_private.activity_ready($1)' into activity_ok using e.payload;return coalesce(activity_ok,false);
 end if;
 select * into w from public.work_items where id=e.work_item_id;
 if w.id is null or w.archived_at is not null or w.owning_team_code is distinct from e.team_code or public.flowmate_user_can_read_work_item(d.recipient_id,w.id) is not true then return false; end if;
 if e.event_kind='creative.review_requested' then return w.status::text='review' and w.requester_user_id=d.recipient_id; end if;
 return w.status::text='assigned' and coalesce(w.assignee_user_id,(select user_id from public.team_members where id=w.final_owner_member_id))=d.recipient_id;
end $$;

create or replace function public.wcc_server_context(p_kind text,p_key text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ent wcc_private.entities;b wcc_private.entities;dest wcc_private.entities; m public.team_members; begin
 perform wcc_private.server_required(); select * into strict ent from wcc_private.entities where kind=p_kind and key=p_key;
 if p_kind='bot' then b:=ent; else select * into strict b from wcc_private.entities where kind='bot' and key=ent.data->>'bot_key'; end if;
 if p_kind='profile' then
  select * into m from public.team_members where id=(ent.data->>'member_id')::uuid;
  if ent.data->>'channel'='group' then select * into dest from wcc_private.entities where kind='destination' and key=ent.data->>'destination_key'; end if;
 elsif p_kind='destination' then dest:=ent; end if;
 return jsonb_build_object('entity',to_jsonb(ent),'bot',to_jsonb(b),'destination',to_jsonb(dest),'member',
 jsonb_build_object('user_id',m.user_id,'active',m.active,'email',(select email from public.users where id=m.user_id)),
 'runtime',(select runtime_enabled from wcc_private.settings where singleton));
end $$;
create or replace function public.wcc_record_check(p_kind text,p_key text,p_version integer,p_verified boolean,p_evidence jsonb)
returns void language plpgsql security definer set search_path='' as $$ declare ent wcc_private.entities; begin
 perform wcc_private.server_required(); select * into strict ent from wcc_private.entities where kind=p_kind and key=p_key for update;
 if ent.version is distinct from p_version then raise exception 'Stale verification' using errcode='40001'; end if;
 if p_kind not in ('bot','destination','profile') or jsonb_typeof(p_evidence) is distinct from 'object' then raise exception 'Invalid evidence'; end if;
 if p_kind<>'bot' then p_evidence:=p_evidence||jsonb_build_object('bot_fingerprint',(select wcc_private.fingerprint('bot',data) from wcc_private.entities where kind='bot' and key=ent.data->>'bot_key')); end if;
 if p_kind='profile' and ent.data->>'channel'='group' then p_evidence:=p_evidence||jsonb_build_object('destination_fingerprint',(select wcc_private.fingerprint('destination',data) from wcc_private.entities where kind='destination' and key=ent.data->>'destination_key')); end if;
 insert into wcc_private.checks values(p_kind,p_key,wcc_private.fingerprint(p_kind,ent.data),p_verified,p_evidence,now())
 on conflict(kind,key) do update set fingerprint=excluded.fingerprint,verified=excluded.verified,evidence=excluded.evidence,checked_at=now();
end $$;
create or replace function public.wcc_claim() returns jsonb language plpgsql security definer set search_path='' as $$
declare d wcc_private.deliveries;e wcc_private.events;ctx jsonb; begin
 perform wcc_private.server_required();
 update wcc_private.deliveries set status=case when send_started_at is null then 'retryable' else 'uncertain' end,
 reason='lease_expired',lease_id=null,lease_until=null where status='sending' and lease_until<now();
 for d in select * from wcc_private.deliveries where status in ('pending','retryable') and available_at<=now() order by created_at for update skip locked limit 25 loop
  if not wcc_private.delivery_ready(d.id) then update wcc_private.deliveries set status='cancelled',reason='readiness_changed' where id=d.id; continue; end if;
  update wcc_private.deliveries set status='sending',attempt=attempt+1,lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes' where id=d.id returning * into d;
  select * into e from wcc_private.events where id=d.event_id;
  ctx:=public.wcc_server_context(case when d.profile_key is not null then 'profile' else 'destination' end,coalesce(d.profile_key,d.destination_key));
  return ctx||jsonb_build_object('delivery',to_jsonb(d),'event',to_jsonb(e),'profile_check',(select evidence from wcc_private.checks where kind='profile' and key=d.profile_key));
 end loop; return null;
end $$;
create or replace function public.wcc_mark_started(p_id uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare d wcc_private.deliveries; begin
 perform wcc_private.server_required(); select * into d from wcc_private.deliveries where id=p_id for update;
 if d.status is distinct from 'sending' or d.lease_id is distinct from p_lease or d.lease_until<=now() then return false; end if;
 if not wcc_private.delivery_ready(d.id) then update wcc_private.deliveries set status='cancelled',reason='readiness_changed' where id=d.id; return false; end if;
 update wcc_private.deliveries set send_started_at=now() where id=d.id; return true;
end $$;
create or replace function public.wcc_finish(p_id uuid,p_lease uuid,p_outcome text,p_provider text,p_code text) returns boolean
language plpgsql security definer set search_path='' as $$ declare d wcc_private.deliveries; begin
 perform wcc_private.server_required(); select * into d from wcc_private.deliveries where id=p_id for update;
 if d.status is distinct from 'sending' or d.lease_id is distinct from p_lease then return false; end if;
 if p_outcome not in ('provider_accepted','retryable','failed','uncertain') then raise exception 'Invalid outcome'; end if;
 update wcc_private.deliveries set status=case when p_outcome='retryable' and attempt>=3 then 'failed' else p_outcome end,
 provider_id=left(p_provider,160),reason=left(p_code,120),available_at=now()+interval '1 minute'*greatest(1,attempt),
 send_started_at=case when p_outcome='retryable' then null else send_started_at end,lease_id=null,lease_until=null,updated_at=now() where id=d.id;
 return true;
end $$;
create or replace function public.wcc_record_step(p_id uuid,p_lease uuid,p_step text,p_provider text) returns boolean
language plpgsql security definer set search_path='' as $$ begin
 perform wcc_private.server_required();
 if p_step not in ('mention','message') then raise exception 'Invalid delivery step'; end if;
 update wcc_private.deliveries set steps=steps||jsonb_build_object(p_step,jsonb_build_object('accepted',true,'provider_id',left(p_provider,160))),updated_at=now()
 where id=p_id and status='sending' and lease_id=p_lease and send_started_at is not null;
 return found;
end $$;
create or replace function public.wcc_retry(p_id uuid,p_confirm_uncertain boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$ declare d wcc_private.deliveries; begin
 if public.is_admin_app_user() is not true then raise exception 'Admin required' using errcode='42501'; end if;
 select * into d from wcc_private.deliveries where id=p_id for update;
 if d.status not in ('failed','uncertain') or nullif(trim(p_reason),'') is null then raise exception 'Review failed/uncertain delivery and give reason'; end if;
 if d.status='uncertain' and p_confirm_uncertain is not true then raise exception 'Explicit uncertain resend confirmation required'; end if;
 if not wcc_private.delivery_ready(d.id) then raise exception 'Original recipient/instance/configuration is no longer ready'; end if;
 update wcc_private.deliveries set status='pending',attempt=0,available_at=now(),send_started_at=null,reason='admin_retry' where id=d.id;
 insert into wcc_private.audit(actor_id,action,team_code,before_value,reason) values(auth.uid(),'retry',d.team_code,to_jsonb(d),left(p_reason,300));
end $$;

create or replace function public.wcc_preview(p_work uuid,p_event text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w public.work_items; uid uuid;r wcc_private.entities;p wcc_private.entities;m public.team_members;results jsonb:='[]'; begin
 select * into w from public.work_items where id=p_work;
 if w.id is null or wcc_private.can_team(w.owning_team_code) is not true then raise exception 'Work/team access denied' using errcode='42501'; end if;
 if public.is_admin_app_user() is not true and public.flowmate_user_can_read_work_item(auth.uid(),w.id) is not true then raise exception 'Work access denied' using errcode='42501'; end if;
 if p_event not in ('creative.assigned','creative.review_requested','quick_task.assigned') then raise exception 'Preview event unsupported'; end if;
 if (p_event like 'creative.%' and w.work_type<>'creative_request') or (p_event='quick_task.assigned' and w.work_type<>'quick_task') then raise exception 'Event does not match work type'; end if;
 uid:=case when p_event='creative.review_requested' then w.requester_user_id else coalesce(w.assignee_user_id,(select user_id from public.team_members where id=w.final_owner_member_id)) end;
 for r in select * from wcc_private.entities where kind='rule' and team_code=w.owning_team_code and data->>'event'=p_event loop
  select * into m from public.team_members where user_id=uid;
  select * into p from wcc_private.entities where kind='profile' and team_code=w.owning_team_code and data->>'member_id'=m.id::text and data->>'bot_key'=r.data->>'bot_key';
  results:=results||jsonb_build_array(jsonb_build_object('rule',r.key,'enabled',(r.data->>'enabled')::boolean,'bot',r.data->>'bot_key',
   'recipient',m.display_name,'relation',case when p_event='creative.review_requested' then 'Requester' else 'Assignee' end,
   'channel',p.data->>'channel','destination',p.data->>'destination_key','profile_enabled',coalesce((p.data->>'enabled')::boolean,false),
   'verified',wcc_private.checked('profile',p.key),'reason',case when uid is null then 'no_participant' when p.key is null then 'profile_missing'
    when not (p.data->'events' ? p_event) then 'event_not_subscribed' else 'configuration_preview_only' end));
 end loop;return jsonb_build_object('event',p_event,'work',w.display_id,'simulation',true,'results',results);
end $$;
create or replace function public.wcc_checks_due() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 perform wcc_private.server_required();
 return (select coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'key',x.key)),'[]') from
 (select e.kind,e.key from wcc_private.entities e left join wcc_private.checks c using(kind,key)
 where e.kind in ('bot','destination','profile') and (e.data->>'state'='active' or e.data->>'enabled'='true')
 and (c.checked_at is null or c.checked_at<now()-interval '6 hours') order by c.checked_at nulls first limit 25) x);
end $$;
create table if not exists wcc_private.test_requests(id uuid primary key,kind text,key text,actor_id uuid,
 status text not null default 'sending',outcome jsonb,created_at timestamptz not null default now());
alter table wcc_private.test_requests add column if not exists fingerprint text;
alter table wcc_private.test_requests enable row level security;
revoke all on wcc_private.test_requests from public,anon,authenticated;
create index if not exists wcc_test_actor_time on wcc_private.test_requests(actor_id,created_at);
create or replace function public.wcc_test_claim(p_id uuid,p_kind text,p_key text,p_actor uuid) returns boolean
language plpgsql security definer set search_path='' as $$ declare added uuid; begin
 perform wcc_private.server_required();
 if not exists(select 1 from public.users where id=p_actor and role='admin') or public.flowmate_member_access_allowed(p_actor) is not true then raise exception 'Active Admin required'; end if;
 if p_kind not in ('destination','profile') or wcc_private.checked(p_kind,p_key) is not true then raise exception 'Verify test target first'; end if;
 perform pg_advisory_xact_lock(hashtext('wcc-test:'||p_actor::text));
 if exists(select 1 from wcc_private.test_requests where id=p_id) then return false; end if;
 if (select count(*) from wcc_private.test_requests where actor_id=p_actor and created_at>now()-interval '1 minute')>=3 then raise exception 'TEST rate limit: wait one minute'; end if;
 insert into wcc_private.test_requests(id,kind,key,actor_id,status,created_at,fingerprint)
 select p_id,p_kind,p_key,p_actor,'sending',now(),wcc_private.fingerprint(e.kind,e.data) from wcc_private.entities e where e.kind=p_kind and e.key=p_key
 on conflict do nothing returning id into added;
 return added is not null;
end $$;
create or replace function public.wcc_confirm_group_member(p_profile text,p_test uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$ declare ent wcc_private.entities; dest wcc_private.entities; evidence jsonb; begin
 if public.is_admin_app_user() is not true then raise exception 'Admin required' using errcode='42501'; end if;
 if nullif(trim(p_reason),'') is null then raise exception 'Recipient confirmation reason required'; end if;
 select * into strict ent from wcc_private.entities where kind='profile' and key=p_profile for update;
 select * into strict dest from wcc_private.entities where kind='destination' and key=ent.data->>'destination_key';
 if ent.data->>'channel'<>'group' or coalesce(ent.data->>'seatalk_id','') !~ '^[0-9]{1,30}$'
 or not wcc_private.checked('destination',dest.key) or not wcc_private.checked('bot',ent.data->>'bot_key')
 or not exists(select 1 from public.team_members m where m.id=(ent.data->>'member_id')::uuid and m.active and public.flowmate_member_access_allowed(m.user_id))
 or not exists(select 1 from wcc_private.checks c where c.kind=ent.kind and c.key=ent.key and c.evidence->>'code'='member_list_hidden'
 and c.fingerprint=wcc_private.fingerprint(ent.kind,ent.data))
 or not exists(select 1 from wcc_private.test_requests t where t.id=p_test and t.kind='destination' and t.key=dest.key
 and t.status='finished' and t.outcome->>'status'='provider_accepted' and t.created_at>now()-interval '24 hours'
 and t.fingerprint=wcc_private.fingerprint(dest.kind,dest.data)) then raise exception 'Verified destination TEST and hidden-member evidence required'; end if;
 evidence:=jsonb_build_object('code','admin_confirmed_hidden_member','method','human_confirmation_not_api_membership','test_id',p_test,'confirmed_by',auth.uid(),
 'bot_fingerprint',(select wcc_private.fingerprint('bot',data) from wcc_private.entities where kind='bot' and key=ent.data->>'bot_key'),
 'destination_fingerprint',wcc_private.fingerprint(dest.kind,dest.data));
 insert into wcc_private.checks values(ent.kind,ent.key,wcc_private.fingerprint(ent.kind,ent.data),true,evidence,now())
 on conflict(kind,key) do update set fingerprint=excluded.fingerprint,verified=true,evidence=excluded.evidence,checked_at=now();
 insert into wcc_private.audit(actor_id,action,kind,key,team_code,after_value,reason) values(auth.uid(),'confirm_hidden_member',ent.kind,ent.key,ent.team_code,evidence,left(p_reason,300));
end $$;
create or replace function public.wcc_test_finish(p_id uuid,p_outcome jsonb) returns void language plpgsql security definer set search_path='' as $$
declare t wcc_private.test_requests;begin perform wcc_private.server_required();
 update wcc_private.test_requests set status='finished',outcome=p_outcome where id=p_id and status='sending' returning * into t;
 if t.id is not null then insert into wcc_private.audit(actor_id,action,kind,key,team_code,after_value,reason)
 values(t.actor_id,'provider_test',t.kind,t.key,(select team_code from wcc_private.entities where kind=t.kind and key=t.key),p_outcome,'Explicit TEST message'); end if;
end $$;

-- Seed only app identities and INACTIVE rules/destinations. No member PII or secrets.
insert into wcc_private.entities(kind,key,team_code,data) values
 ('bot','creative',null,'{"label":"Creative Bot","app_id":"OTg1MjIwNzY0OTY3","credential_ref":"WCC_BOT_SECRET_CREATIVE","state":"draft","allowed_events":["creative.assigned","creative.review_requested"],"allowed_teams":["gdve","ops","mkt","esport"]}'),
 ('bot','flowmate',null,'{"label":"FlowMate","app_id":"NTgyNzAzMjc5MjE4","credential_ref":"WCC_BOT_SECRET_FLOWMATE","state":"draft","allowed_events":["quick_task.assigned","activity.output_ready","activity.held","activity.failed","activity.source_issue","activity.scheduler_issue"],"allowed_teams":["gdve","ops","mkt","esport"]}'),
 ('destination','fcoth-operation','ops','{"label":"FCOTH Operation","bot_key":"flowmate","group_id":"ODg5NDI1MDQwODI3","state":"draft","owner":"","purpose":"Activity Automation"}')
on conflict do nothing;
insert into wcc_private.entities(kind,key,team_code,data)
select 'rule',t.code||':'||e.event,t.code,jsonb_build_object('label',e.label,'event',e.event,'bot_key',e.bot,'enabled',false)
from public.teams t cross join (values('creative.assigned','Assign → Assignee','creative'),('creative.review_requested','Review → Requester','creative'),('quick_task.assigned','Task Assign → Assignee','flowmate')) e(event,label,bot)
where t.is_active on conflict do nothing;
insert into wcc_private.entities(kind,key,team_code,data) values
 ('rule','ops:activity.output_ready','ops','{"label":"Activity พร้อมตรวจ","event":"activity.output_ready","bot_key":"flowmate","enabled":false,"destination_key":"fcoth-operation"}'),
 ('rule','ops:activity.held','ops','{"label":"Activity ติดขัด","event":"activity.held","bot_key":"flowmate","enabled":false,"destination_key":"fcoth-operation"}') on conflict do nothing;

-- Explicit API ACLs. Private helper functions cannot be invoked by browser roles.
do $$ declare f record; begin
 for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='wcc_private' or n.nspname='public' and p.proname like 'wcc\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 end loop;
end $$;
grant execute on function public.wcc_workspace(),public.wcc_apply(text,text,jsonb,text,integer,text),public.wcc_propose(text,text,jsonb,text,integer,text),
 public.wcc_decide(uuid,boolean,text),public.wcc_set_reviewer(uuid,text,boolean),public.wcc_set_runtime(boolean,text),public.wcc_retry(uuid,boolean,text),public.wcc_preview(uuid,text) to authenticated;
grant execute on function public.wcc_server_context(text,text),public.wcc_record_check(text,text,integer,boolean,jsonb),public.wcc_claim(),
 public.wcc_mark_started(uuid,uuid),public.wcc_finish(uuid,uuid,text,text,text),public.wcc_checks_due(),
 public.wcc_test_claim(uuid,text,text,uuid),public.wcc_test_finish(uuid,jsonb) to service_role;
grant execute on function public.wcc_record_step(uuid,uuid,text,text) to service_role;
grant execute on function public.wcc_confirm_group_member(text,uuid,text) to authenticated;
grant execute on function public.wcc_access() to authenticated;
grant execute on function public.wcc_impact(text,text) to authenticated;
commit;
