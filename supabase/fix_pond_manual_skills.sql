-- FlowMate hotfix: restore Pond's manually selected Team settings.
-- Run AFTER the updated rpc_assignment.sql.
--
-- This script is intentionally scoped to Pond only. It does not reassign
-- existing work items. Future assignments use these skills immediately.

begin;

do $$
declare
  v_updated_count integer;
begin
  update public.team_members
     set skills = array[
           'hero-album',
           'logo',
           'new-web',
           'graphic-pack',
           'kv-design',
           'jersey-design',
           'merchandise-design',
           'video-standard',
           'video-under-1-min',
           'motion'
         ]::text[],
         backup_skills = '{}'::text[],
         capacity_per_day = 8,
         wip_limit = 4,
         updated_at = now()
   where lower(member_code) = 'pond';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Expected exactly one Pond team member, updated %', v_updated_count;
  end if;
end
$$;

commit;

select
  member_code,
  display_name,
  capacity_per_day,
  wip_limit,
  skills,
  backup_skills,
  updated_at
from public.team_members
where lower(member_code) = 'pond';
