-- Read-only preflight. Run before an approved installation and immediately before cutover.
-- No secrets, cron commands, provider calls, claim RPCs or state changes.
select current_database(), current_timestamp as checked_at,
 to_regnamespace('wcc_private') is not null as wcc_installed,
 to_regprocedure('public.is_admin_app_user()') is not null as admin_helper,
 to_regprocedure('public.flowmate_member_access_allowed(uuid)') is not null as member_helper,
 to_regprocedure('public.flowmate_user_can_read_work_item(uuid,uuid)') is not null as work_helper;
select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in ('is_admin_app_user','flowmate_member_access_allowed','flowmate_user_can_read_work_item'))
or (n.nspname='activity_automation_private' and p.proname in
 ('production_notification_ready','production_source_issue_ready','production_scheduler_issue_ready'));
select status,count(*) from private.creative_seatalk_outbox group by status;
select status,event_kind,recipient_kind,count(*) from activity_automation_private.production_notification_outbox
group by status,event_kind,recipient_kind;
select jobname,schedule,active from cron.job where jobname ilike '%creative%' or jobname ilike '%activity%' or jobname ilike '%wcc%';
select enabled,notifier_enabled,scheduler_enabled,
 trigger_secret_id is not null as trigger_secret_reference_present,
 notifier_secret_id is not null as notifier_secret_reference_present
from activity_automation_private.production_settings where singleton;
select m.member_code,m.id as member_id,m.user_id,m.active,u.is_active,u.role,
 (select jsonb_agg(x.team_code order by x.team_code) from public.user_team_memberships x where x.user_id=u.id) as teams,
 r.channel,r.group_id,r.seatalk_user_id
from public.team_members m left join public.users u on u.id=m.user_id
left join private.seatalk_recipient_routes r on r.member_code=m.member_code
where m.member_code in ('pond','folk','panu','tong') order by m.member_code;
