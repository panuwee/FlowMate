-- Isolated PGlite fixture only; never apply this file to a real database.
create role anon; create role authenticated;
create schema auth;create schema activity_automation_private;create schema battle_pass_private;create schema cron;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table public.users(id uuid primary key,role text,is_active boolean);
create table public.user_team_memberships(user_id uuid,team_code text);
create table battle_pass_private.google_connection(singleton boolean,user_id uuid);
create table public.work_items(id uuid primary key,display_id text,status text,final_owner_member_id uuid,assignee_user_id uuid);
create table public.marketing_content_items(id uuid primary key);
create table public.creative_request_details(work_item_id uuid primary key,brief_link text);
create table public.creative_kpi_brief_evidence(id bigint primary key,work_item_id uuid,action text,submission_id bigint,brief_link text);
create function activity_automation_private.has_accepted_brief(p_work uuid) returns boolean language sql stable as $$
 select exists(select 1 from public.creative_kpi_brief_evidence a join public.creative_kpi_brief_evidence s on s.id=a.submission_id
 join public.creative_request_details d on d.work_item_id=s.work_item_id where a.work_item_id=p_work and a.action='accepted' and s.action='submitted'
 and s.id=(select max(id) from public.creative_kpi_brief_evidence where work_item_id=p_work and action='submitted') and s.brief_link=d.brief_link)
$$;
create table activity_automation_private.settings(singleton boolean primary key,test_enabled boolean,production_enabled boolean check(not production_enabled),notifier_enabled boolean);
create table activity_automation_private.runs(id uuid primary key,activity text,mode text check(mode='test'),is_test boolean check(is_test),project_code text,state text,stage text,code text,attempt_count integer,created_at timestamptz,updated_at timestamptz,model jsonb);
create table activity_automation_private.output_bindings(run_id uuid primary key,slide_id text,work_item_id uuid unique,content_item_id uuid unique);
create table activity_automation_private.incidents(id uuid primary key,run_id uuid,activity text,project_code text,stage text,code text,occurrences integer,first_at timestamptz,last_at timestamptz);
create table activity_automation_private.notification_outbox(id uuid primary key,run_id uuid,payload jsonb,status text,event_kind text,recipient_kind text,attempt_count integer,next_attempt_at timestamptz,error_code text,provider_id text,created_at timestamptz,updated_at timestamptz);
create table battle_pass_private.monthly_settings(singleton boolean primary key,enabled boolean,seatalk_enabled boolean);
create table battle_pass_private.monthly_runs(mode text,period text,state text,brief_id uuid,task_id uuid,slide_id text,updated_at timestamptz,source_snapshot jsonb,checkpoint jsonb default '{}',primary key(mode,period));
create table battle_pass_private.production_ticks(run_id uuid primary key,checked_at timestamptz,status text,code text,detail jsonb);
create table battle_pass_private.seatalk_notifications(notification_id uuid primary key,status text,event_kind text,period text,recipient_kind text,attempt_count integer,next_attempt_at timestamptz,last_error_code text,seatalk_message_id text,created_at timestamptz,updated_at timestamptz);
create table cron.job(jobname text,active boolean,schedule text);
insert into users values
 ('00000000-0000-4000-8000-000000000001','member',true),
 ('00000000-0000-4000-8000-000000000002','admin',true),
 ('00000000-0000-4000-8000-000000000003','member',true),
 ('00000000-0000-4000-8000-000000000004','member',false),
 ('5abad25d-3e8c-4a0d-baa6-0a0615ba00fc','member',true);
insert into user_team_memberships values('00000000-0000-4000-8000-000000000001','ops'),('00000000-0000-4000-8000-000000000004','ops');
insert into battle_pass_private.google_connection values(true,'00000000-0000-4000-8000-000000000002');
insert into activity_automation_private.settings values(true,true,false,false);
insert into battle_pass_private.monthly_settings values(true,false,false);
insert into cron.job values('battle-pass-production-30m',false,'*/30 * * * *');
insert into work_items values('10000000-0000-4000-8000-000000000001','CR-1265','assigned',null,'00000000-0000-4000-8000-000000000001');
insert into marketing_content_items values('20000000-0000-4000-8000-000000000001');
insert into creative_request_details values('10000000-0000-4000-8000-000000000001','https://docs.google.com/presentation/d/fixture/edit');
insert into creative_kpi_brief_evidence values(1,'10000000-0000-4000-8000-000000000001','submitted',null,'https://docs.google.com/presentation/d/fixture/edit'),(2,'10000000-0000-4000-8000-000000000001','accepted',1,null);
insert into activity_automation_private.runs values
 ('30000000-0000-4000-8000-000000000001','conqueror_crate','test',true,'CC-202609','ready_for_review','complete',null,4,'2026-09-01T00:00Z','2026-09-18T00:00Z',
 '{"source":{"startDate":"2026-09-09","endDate":"2026-09-30","workingSheetUrl":"https://docs.google.com/spreadsheets/d/fixture/edit"},"secret":"DO_NOT_EXPOSE","boxes":[{"price":500}]}'),
 ('30000000-0000-4000-8000-000000000002','membership','test',true,'MEM-202610','failed','source','source_invalid',1,'2026-09-18T00:00Z','2026-09-18T00:00Z','{"source":{"startDate":"2026-10-01"}}'),
 ('30000000-0000-4000-8000-000000000003','golden_spin','test',true,'BOUNDARY','discovered','source',null,0,'2026-08-31T17:00Z','2026-08-31T17:00Z','{}');
insert into activity_automation_private.output_bindings values('30000000-0000-4000-8000-000000000001','fixture','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001');
insert into activity_automation_private.incidents values('40000000-0000-4000-8000-000000000001',null,'membership','ORPHAN','source','unknown_code',2,'2026-09-01T00:00Z','2026-09-18T00:00Z');
insert into activity_automation_private.notification_outbox values('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','{"activity":"conqueror_crate","recipient":"DO_NOT_EXPOSE"}','uncertain','brief_ready','group',1,null,'timeout',null,'2026-09-18T00:00Z','2026-09-18T01:00Z');
insert into battle_pass_private.production_ticks values('60000000-0000-4000-8000-000000000001','2026-09-18T00:00Z','waiting_confirmation',null,'{"period":"2026-10","action":"run","secret":"DO_NOT_EXPOSE"}');
insert into battle_pass_private.seatalk_notifications values('70000000-0000-4000-8000-000000000001','sent','brief_ready','2026-09','group',1,null,null,'secret_provider','2026-09-18T00:00Z','2026-09-18T01:00Z');
