-- FlowMate hotfix: approved GD/VE Team settings for 27 Jul 2026.
--
-- Scope:
--   - Ploy: replace primary skills with Banner, Logo, Resize, Graphic Pack only.
--   - Joe: preserve current skills and add Hero Album (Hero Post).
--   - Tong: preserve current skills and add Hero Album (Hero Post).
--   - Every active GD/VE member: WIP limit = 4.
--
-- This script does not update or reassign historical work items. Assignment
-- reads team_members.skills and team_members.wip_limit live on every run.
-- Safe to run more than once.

begin;

do $team_settings$
declare
  v_updated_count integer;
  v_gdve_count integer;
begin
  update public.team_members
     set skills = array[
           'banner',
           'logo',
           'resize',
           'graphic-pack'
         ]::text[],
         backup_skills = '{}'::text[],
         updated_at = now()
   where lower(member_code) = 'ploy';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Expected exactly one Ploy team member, updated %', v_updated_count;
  end if;

  update public.team_members
     set skills = case
           when 'hero-album' = any(skills) then skills
           else array_prepend('hero-album', skills)
         end,
         updated_at = now()
   where lower(member_code) = 'jo';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Expected exactly one Joe team member, updated %', v_updated_count;
  end if;

  update public.team_members
     set skills = case
           when 'hero-album' = any(skills) then skills
           else array_prepend('hero-album', skills)
         end,
         updated_at = now()
   where lower(member_code) = 'tong';

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> 1 then
    raise exception 'Expected exactly one Tong team member, updated %', v_updated_count;
  end if;

  update public.team_members
     set wip_limit = 4,
         updated_at = now()
   where active = true
     and lower(replace(discipline, '/', '')) = 'gdve';

  get diagnostics v_gdve_count = row_count;
  if v_gdve_count = 0 then
    raise exception 'No active GD/VE team members were found';
  end if;
end;
$team_settings$;

commit;

-- Verification:
select
  member_code,
  display_name,
  discipline,
  wip_limit,
  skills,
  backup_skills,
  active
from public.team_members
where lower(replace(discipline, '/', '')) = 'gdve'
order by display_name;
