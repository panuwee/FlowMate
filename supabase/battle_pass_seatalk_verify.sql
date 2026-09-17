-- Read-only verification after battle_pass_seatalk.sql is applied.
select
  to_regclass('battle_pass_private.seatalk_notifications') is not null as outbox_exists,
  (select relrowsecurity from pg_class where oid='battle_pass_private.seatalk_notifications'::regclass) as rls_enabled,
  not has_table_privilege('anon','battle_pass_private.seatalk_notifications','select') as anon_denied,
  not has_table_privilege('authenticated','battle_pass_private.seatalk_notifications','select') as authenticated_denied,
  not has_table_privilege('service_role','battle_pass_private.seatalk_notifications','select') as service_table_denied;

select
  has_function_privilege('service_role','public.battle_pass_seatalk_claim(integer)','execute') as claim_service_only,
  not has_function_privilege('authenticated','public.battle_pass_seatalk_claim(integer)','execute') as claim_browser_denied,
  has_function_privilege('service_role','public.battle_pass_seatalk_finish(uuid,text,text,text)','execute') as finish_service_only,
  not has_function_privilege('authenticated','public.battle_pass_seatalk_finish(uuid,text,text,text)','execute') as finish_browser_denied;

select jobname,schedule,active
from cron.job where jobname='battle-pass-seatalk-15m';

select seatalk_enabled,seatalk_app_id,seatalk_group_id,seatalk_operator_email,
  flowmate_base_url,seatalk_activation_cutoff,seatalk_last_detected_at
from battle_pass_private.monthly_settings where singleton;

select battle_pass_private.seatalk_retry_delay_seconds(x) as delay_seconds
from generate_series(1,5) x;

-- Must remain empty before explicit rollout activation.
select event_kind,status,count(*) as rows
from battle_pass_private.seatalk_notifications
group by event_kind,status order by event_kind,status;
