-- Read-only checks after installation. Eye dates should remain unset until explicitly saved.
select position('flowmate_member_can_assign(tm.id' in pg_get_functiondef(
 'public.flowmate_run_assignment(uuid,public.assignment_trigger)'::regprocedure))>0 as assignment_guard_installed;
select r.rolname,rs.setdatabase,setting from pg_db_role_setting rs join pg_roles r on r.oid=rs.setrole,
 lateral unnest(rs.setconfig) setting where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%';
select tm.member_code,u.is_active,public.flowmate_member_access_allowed(u.id) as effective_access,
 public.flowmate_member_can_assign(tm.id,date '2026-09-30') as can_receive_sep30,
 public.flowmate_member_can_assign(tm.id,date '2026-10-01') as can_receive_oct01,
 l.stop_assign_at,l.last_working_day,l.deactivate_at,l.disabled
from public.team_members tm join public.users u on u.id=tm.user_id
left join flowmate_members_private.lifecycle l on l.email=lower(u.email)
where lower(tm.member_code)='eye';
