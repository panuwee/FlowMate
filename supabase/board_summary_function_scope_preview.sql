-- READ-ONLY PREVIEW: compare active Board counts by Function before applying the scoped summary RPC.

select
  to_regprocedure('public.flowmate_board_summary_by_function(text)') is not null as scoped_summary_rpc_exists,
  coalesce(nullif(lower(btrim(wi.owning_team_code)), ''), '(no function)') as owning_team_code,
  wi.status,
  count(*)::integer as task_count
from public.work_items wi
where wi.archived_at is null
  and wi.work_type = 'creative_request'
  and wi.status in ('unassigned', 'assigned', 'in_progress', 'review', 'blocked')
group by 2, wi.status
order by 2, wi.status;
