-- Read-only post-install checks. Run against the approved target environment.
select name, to_regclass('public.' || name) is not null as installed
from (values ('marketing_campaign_planner_leads'), ('marketing_campaign_planner_details'),
  ('marketing_campaign_planner_v'), ('marketing_campaign_planner_items_v')) objects(name);

select c.relname, c.relrowsecurity, c.reloptions
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('marketing_campaign_planner_leads',
  'marketing_campaign_planner_details', 'marketing_campaign_planner_v', 'marketing_campaign_planner_items_v');

select table_name, grantee, privilege_type
from information_schema.table_privileges
where table_schema = 'public' and table_name in ('marketing_campaign_planner_leads',
  'marketing_campaign_planner_details', 'marketing_campaign_planner_v', 'marketing_campaign_planner_items_v')
  and grantee in ('anon', 'authenticated') order by table_name, grantee, privilege_type;

select schemaname, tablename, policyname, cmd, roles
from pg_catalog.pg_policies where schemaname = 'public'
and tablename in ('marketing_campaign_planner_leads', 'marketing_campaign_planner_details');

select count(*) as campaigns, count(*) filter (where start_date is null) as unscheduled,
  count(*) filter (where end_date < start_date or completed_items > total_items) as invalid_summaries
from public.marketing_campaign_planner_v;

select count(*) as monthly_instances_without_tag
from public.marketing_campaigns where campaign_tag_id is null;

select count(*) as legacy_names_to_review
from public.marketing_campaign_tags
where name !~ '^.*[^[:space:]].* \[(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[1-9][0-9]{3}\]$';

-- In an authenticated session: verify false for Member, true for active Admin
-- only; legacy Marketing Lead grants no longer authorize editing. SQL Editor's owner session is not a user UAT.
select public.marketing_campaign_planner_can_manage() as can_manage_in_current_session;

select
  to_regclass('public.marketing_campaign_planner_leads') is not null as leads_table_installed,
  to_regclass('public.marketing_campaign_planner_details') is not null as details_table_installed,
  to_regclass('public.marketing_campaign_planner_v') is not null as planner_view_installed,
  to_regclass('public.marketing_campaign_planner_items_v') is not null as items_view_installed,
  (select bool_and(c.relrowsecurity) from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('marketing_campaign_planner_leads', 'marketing_campaign_planner_details')) as table_rls_enabled,
  (select bool_and(c.reloptions @> array['security_invoker=true']) from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname in ('marketing_campaign_planner_v', 'marketing_campaign_planner_items_v')) as views_use_invoker_security,
  not exists (select 1 from information_schema.table_privileges
    where table_schema = 'public' and table_name like 'marketing_campaign_planner%'
      and grantee = 'anon') as anon_has_no_planner_grants,
  not exists (select 1 from public.marketing_campaign_planner_v
    where end_date < start_date or completed_items > total_items) as campaign_summaries_valid,
  (select count(*) from public.marketing_campaigns where campaign_tag_id is null) as monthly_instances_without_tag,
  public.marketing_campaign_planner_can_manage() as sql_editor_can_manage;
