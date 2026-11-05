-- Apply only after review/authorization. Requires Team Members Access management.
begin;

-- SECURITY INVOKER retains the caller's existing team_members RLS visibility.
-- Assignment pause/stop dates do not determine whether an account has Access.
create or replace function public.flowmate_gantt_members()
returns setof public.team_members
language sql stable security invoker set search_path = '' as $$
  select tm.* from public.team_members tm
  where (select public.is_active_app_user())
    and public.flowmate_is_gdve_member_code(tm.member_code)
    and public.flowmate_member_access_allowed(tm.user_id)
  order by tm.display_name, tm.id
$$;
revoke all on function public.flowmate_gantt_members() from public, anon;
grant execute on function public.flowmate_gantt_members() to authenticated;

-- Extend the existing Viewer read allowlist without replacing its other guards.
do $patch$
declare definition text;
begin
  select pg_get_functiondef('public.flowmate_check_member_access()'::regprocedure) into definition;
  if strpos(definition, '''flowmate_gantt_members''') = 0 then
    if strpos(definition, '''flowmate_board_summary''') = 0 then
      raise exception 'Unsupported Viewer read guard; review before applying Gantt roster';
    end if;
    definition := replace(definition, '''flowmate_board_summary''', '''flowmate_gantt_members'',''flowmate_board_summary''');
    execute definition;
  end if;
end $patch$;
notify pgrst, 'reload schema';
commit;
