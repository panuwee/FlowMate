-- Phase 2B.1 step 2: operator pause/resume.
-- Toggles battle_pass_private.monthly_settings.enabled ONLY. Never calls cron.alter_job,
-- never dispatches, never touches a run in flight (a leased run finishes on its own;
-- the flag takes effect from the next tick / next write checkpoint).
begin;

create or replace function public.battle_pass_set_automation(p_enabled boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cur boolean; aid bigint;
begin
  perform battle_pass_private.require_operator();
  if p_enabled is null then raise exception 'Enabled flag required'; end if;
  perform pg_advisory_xact_lock(hashtext('battle-pass-operator-toggle'));

  select enabled into cur from battle_pass_private.monthly_settings where singleton for update;
  if not found then raise exception 'Automation settings missing'; end if;

  -- Idempotent: setting the flag to the value it already holds logs nothing.
  if cur is not distinct from p_enabled then
    return jsonb_build_object('enabled', cur, 'changed', false);
  end if;

  update battle_pass_private.monthly_settings set enabled = p_enabled where singleton;

  insert into battle_pass_private.operator_actions(action, requested_by, before_state, result)
  values (
    case when p_enabled then 'resume' else 'pause' end,
    auth.uid(),
    jsonb_build_object('enabled', cur),
    jsonb_build_object('enabled', p_enabled)
  ) returning action_id into aid;

  return jsonb_build_object('enabled', p_enabled, 'changed', true, 'actionId', aid::text);
end $$;

revoke all on function public.battle_pass_set_automation(boolean) from public, anon;
grant execute on function public.battle_pass_set_automation(boolean) to authenticated;
notify pgrst,'reload schema';
commit;
