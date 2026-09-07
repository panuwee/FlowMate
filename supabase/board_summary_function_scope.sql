-- Function-scoped Board summary for FlowMate lane counts.
-- Safe to apply before the matching frontend release; the legacy summary RPC remains available.

begin;

create or replace function public.flowmate_board_summary_by_function(
  p_owning_team_code text
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with requested_scope as (
    select nullif(lower(btrim(p_owning_team_code)), '') as owning_team_code
  ), active as (
    select wi.*
    from public.work_items wi
    cross join requested_scope scope
    where wi.archived_at is null
      and wi.work_type = 'creative_request'
      and wi.status in ('unassigned', 'assigned', 'in_progress', 'review', 'blocked')
      and (scope.owning_team_code is null or wi.owning_team_code = scope.owning_team_code)
  ), owner_wip as (
    select
      tm.id as owner_member_id,
      tm.display_name as owner_name,
      tm.wip_limit,
      count(a.id) filter (
        where a.status = 'in_progress' and a.wip_counted = true
      ) as current_wip
    from public.team_members tm
    left join active a on a.final_owner_member_id = tm.id
    where tm.active = true
    group by tm.id, tm.display_name, tm.wip_limit
  )
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'unassigned', count(*) filter (where status = 'unassigned'),
      'assigned', count(*) filter (where status = 'assigned'),
      'in_progress', count(*) filter (where status = 'in_progress'),
      'review', count(*) filter (where status = 'review'),
      'blocked', count(*) filter (where status = 'blocked')
    ),
    'wip', jsonb_build_object(
      'in_progress_by_owner', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'owner_member_id', ow.owner_member_id,
            'owner_name', ow.owner_name,
            'current_wip', ow.current_wip,
            'wip_limit', ow.wip_limit
          ) order by ow.owner_name, ow.owner_member_id
        )
        from owner_wip ow
        where ow.current_wip > 0
      ), '[]'::jsonb),
      'review_team_count', count(*) filter (where status = 'review'),
      'review_team_limit', 8
    ),
    'as_of', now()
  )
  from active;
$$;

revoke all on function public.flowmate_board_summary_by_function(text) from public, anon, authenticated;
grant execute on function public.flowmate_board_summary_by_function(text) to authenticated;

commit;
