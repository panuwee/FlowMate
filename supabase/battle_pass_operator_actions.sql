-- Phase 2B.1 step 1: operator action ledger + shared operator guard + read-only audit trail.
-- Additive only. Does not dispatch, does not change monthly_settings, does not touch cron.
begin;

create table if not exists battle_pass_private.operator_actions (
  action_id     bigserial primary key,
  action        text not null check (action in ('run_now','retry','pause','resume')),
  requested_at  timestamptz not null default clock_timestamp(),
  requested_by  uuid not null references public.users(id),
  target_period text,
  target_run_id uuid,
  request_id    bigint,
  before_state  jsonb not null default '{}'::jsonb,
  result        jsonb
);
create index if not exists battle_pass_operator_actions_requested_at_idx
  on battle_pass_private.operator_actions (requested_at desc, action_id desc);
alter table battle_pass_private.operator_actions enable row level security;
revoke all on battle_pass_private.operator_actions from public, anon, authenticated;
revoke all on sequence battle_pass_private.operator_actions_action_id_seq from public, anon, authenticated;

-- Same authorised set as readiness: the fixed owner, or whoever holds the Google connection.
create or replace function battle_pass_private.require_operator() returns void
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or not exists (
    select 1 from public.users u where u.id=auth.uid() and u.is_active
    and (u.id='5abad25d-3e8c-4a0d-baa6-0a0615ba00fc'::uuid or exists (
      select 1 from battle_pass_private.google_connection c where c.singleton and c.user_id=u.id))
  ) then raise exception 'Operator access denied' using errcode='42501'; end if;
end $$;
revoke all on function battle_pass_private.require_operator() from public, anon, authenticated;

create or replace function public.battle_pass_audit_trail(p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare n integer; result jsonb;
begin
  perform battle_pass_private.require_operator();
  n := least(greatest(coalesce(p_limit,50),1),200);
  select coalesce(jsonb_agg(jsonb_build_object(
      'actionId', a.action_id::text,
      'action', a.action,
      'requestedAt', a.requested_at,
      'requestedBy', coalesce(u.display_name,'unknown'),
      'period', case when a.target_period ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' then a.target_period end,
      'runId', a.target_run_id,
      'requestId', a.request_id::text,
      'beforeState', a.before_state,
      'result', a.result
    ) order by a.requested_at desc, a.action_id desc), '[]'::jsonb)
  into result
  from (
    select action_id, action, requested_at, requested_by, target_period, target_run_id,
           request_id, before_state, result
    from battle_pass_private.operator_actions
    order by requested_at desc, action_id desc
    limit n
  ) a
  left join public.users u on u.id = a.requested_by;
  return jsonb_build_object('observedAt', current_timestamp, 'actions', result);
end $$;

revoke all on function public.battle_pass_audit_trail(integer) from public, anon;
grant execute on function public.battle_pass_audit_trail(integer) to authenticated;
notify pgrst,'reload schema';
commit;
