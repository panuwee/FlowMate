-- Required API guard for legacy RPCs with inline is_active checks. Review/apply separately.
begin;
do $$ declare existing text; begin
 select split_part(setting,'=',2) into existing from pg_db_role_setting rs
 join pg_roles r on r.oid=rs.setrole cross join lateral unnest(rs.setconfig) setting
 where r.rolname='authenticator' and setting like 'pgrst.db_pre_request=%'
 and split_part(setting,'=',2) not in ('','public.flowmate_check_member_access') limit 1;
 if existing is not null then
 raise exception 'Existing API pre-request hook %. Compose it before deployment.',existing; end if;
end $$;
alter role authenticator set pgrst.db_pre_request='public.flowmate_check_member_access';
notify pgrst, 'reload config';
commit;
