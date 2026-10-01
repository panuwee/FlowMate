-- Read-only production compatibility evidence; does not install or mutate data.
select jsonb_build_object(
  'checked_at', now(),
  'database_version', current_setting('server_version'),
  'columns', (select jsonb_agg(to_jsonb(c)) from information_schema.columns c where table_schema='public'
    and table_name in ('work_items','users','teams','user_team_memberships','comments','work_item_events','notifications','work_item_links','work_item_watchers','work_item_ai_tags','flowmate_capacity_allocations','task_assign_dispatchers')),
  'constraints', (select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) from pg_constraint c
    where c.conrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relname in ('work_items','users','teams','user_team_memberships','comments','notifications'))),
  'policies', (select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in ('work_items','users','teams','user_team_memberships','comments','work_item_events','notifications','work_item_links','work_item_watchers','work_item_ai_tags','flowmate_capacity_allocations','task_assign_dispatchers')),
  'functions', (select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'definition',pg_get_functiondef(p.oid),'acl',p.proacl,'security_definer',p.prosecdef)) from pg_proc p where p.pronamespace='public'::regnamespace
    and (p.proname in ('flowmate_actor_user_id','flowmate_user_has_all_team_access','flowmate_user_is_team_member','flowmate_user_can_access_team','flowmate_normalize_team_code','flowmate_is_trusted_database_context','is_admin_app_user','flowmate_user_can_access_work_item','flowmate_user_can_read_work_item','flowmate_current_user_can_mutate_work_item','can_update_work_item','flowmate_guard_work_item_team','flowmate_create_notification','flowmate_notify_collaboration_event','flowmate_notify_work_item_event') or p.proname like 'task_assign_%')),
  'triggers', (select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid),'function',t.tgfoid::regprocedure::text)) from pg_trigger t
    where not t.tgisinternal and t.tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relname in ('work_items','users','user_team_memberships','comments','work_item_events','notifications'))),
  'relations', (select jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'options',c.reloptions,'acl',c.relacl)) from pg_class c
    where c.relnamespace='public'::regnamespace and (c.relname in ('work_items','users','teams','user_team_memberships','comments','work_item_events','notifications','work_item_links','work_item_watchers','work_item_ai_tags','flowmate_capacity_allocations','task_assign_dispatchers') or c.relname like '%work_item%' and c.relkind in ('v','m'))),
  'quick_task_legacy_groups', (select jsonb_agg(to_jsonb(g)) from (select owning_team_code,requester_team,status,count(*) task_count,count(*) filter(where assignee_user_id is null) unassigned,count(*) filter(where due_date is null) no_review from public.work_items where work_type='quick_task' group by owning_team_code,requester_team,status) g),
  'teams', (select jsonb_agg(jsonb_build_object('code',code,'active',is_active)) from public.teams)
) as task_assign_preflight;
