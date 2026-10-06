begin read only;
select jsonb_build_object(
 'definition',pg_get_functiondef(p.oid),
 'acl',p.proacl::text,
 'security_definer',p.prosecdef,
 'config',p.proconfig,
 'runtime',(select runtime_enabled from wcc_private.settings where singleton=true),
 'entities_digest',(select md5(coalesce(jsonb_agg(to_jsonb(e) order by kind,key)::text,'')) from wcc_private.entities e),
 'ownership_digest',(select md5(coalesce(jsonb_agg(to_jsonb(o) order by event_kind,scope)::text,'')) from wcc_private.ownership o),
 'deliveries_count',(select count(*) from wcc_private.deliveries),
 'audit_count',(select count(*) from wcc_private.audit),
 'scheduler_digest',(select md5(coalesce(jsonb_agg(jsonb_build_object('id',jobid,'name',jobname,'schedule',schedule,'active',active) order by jobid)::text,'')) from cron.job),
 'anon_execute',has_function_privilege('anon',p.oid,'EXECUTE'),
 'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')
) as evidence
from pg_proc p where p.oid='public.wcc_set_runtime(boolean,text)'::regprocedure;
commit;
