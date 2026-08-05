-- FlowMate Board delivered history and 60-day archive lifecycle.
-- Run after schema.sql, collaboration_admin.sql, ai_tags.sql, and
-- workflow_team_workspaces.sql.
-- Scheduler activation is intentionally separate; this file never calls pg_cron.

alter table public.work_items
  add column if not exists archive_exempt_until timestamptz,
  add column if not exists owning_team_code text;

create table if not exists public.flowmate_archive_job_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique,
  run_mode text not null check (run_mode in ('dry_run', 'apply')),
  as_of timestamptz not null,
  cutoff_at timestamptz not null,
  candidate_count integer not null default 0 check (candidate_count >= 0),
  archived_count integer not null default 0 check (archived_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  failure_count integer not null default 0 check (failure_count >= 0),
  candidate_ids uuid[] not null default '{}',
  failures jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz not null default now()
);

alter table public.flowmate_archive_job_runs enable row level security;
revoke all privileges on public.flowmate_archive_job_runs from public, anon, authenticated;

create index if not exists idx_flowmate_archive_job_runs_started
on public.flowmate_archive_job_runs(started_at desc);

create index if not exists idx_work_items_board_active
on public.work_items(owning_team_code, status, priority, due_date, created_at, display_id)
where archived_at is null
  and status in ('unassigned', 'assigned', 'in_progress', 'review', 'blocked');

create index if not exists idx_work_items_delivered_recent
on public.work_items(owning_team_code, delivered_at desc, id desc)
where status = 'delivered' and archived_at is null;

create index if not exists idx_work_items_delivered_archived
on public.work_items(owning_team_code, archived_at desc, id desc)
where archived_at is not null;

create or replace view public.flowmate_delivered_history_v
with (security_invoker = true) as
select
  wi.id,
  wi.display_id,
  wi.title,
  wi.campaign_name,
  coalesce(wi.final_owner_member_id, wi.assignee_user_id) as owner_member_id,
  coalesce(
    tm.display_name,
    assignee.display_name,
    nullif(trim(wi.assignee_other_name), ''),
    'Unassigned'
  ) as owner_name,
  wi.work_type,
  wi.effort_point,
  wi.due_date,
  wi.launch_date,
  wi.delivered_at,
  wi.archived_at,
  wi.archive_reason,
  case
    when wi.delivered_at is null then 'unknown'
    when (wi.delivered_at at time zone 'Asia/Bangkok')::date <= wi.due_date then 'on_time'
    else 'late'
  end as delivery_result,
  (wi.delivered_at is null) as legacy_missing_delivered_at
from public.work_items wi
left join public.team_members tm on tm.id = wi.final_owner_member_id
left join public.users assignee on assignee.id = wi.assignee_user_id
where wi.status = 'delivered';

create or replace function public.flowmate_kpi_ai_tags(
  p_work_item_id uuid
)
returns text[]
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_tags text[];
begin
  if to_regclass('public.work_item_ai_tags') is null then
    return '{}'::text[];
  end if;

  execute $query$
    select coalesce(array_agg(t.tag order by t.created_at, t.id), '{}'::text[])
    from public.work_item_ai_tags t
    where t.work_item_id = $1
  $query$ into v_tags using p_work_item_id;

  return coalesce(v_tags, '{}'::text[]);
end;
$$;

create or replace view public.flowmate_kpi_work_items_v
with (security_invoker = true) as
select
  wi.id,
  wi.display_id,
  wi.title,
  wi.work_type,
  wi.status,
  wi.priority,
  wi.effort_point,
  wi.due_date,
  wi.launch_date,
  wi.created_at,
  event_times.assigned_at,
  wi.delivered_at,
  wi.archived_at,
  wi.final_owner_member_id,
  wi.final_owner_member_id as owner_member_id,
  owner.display_name as owner_name,
  owner.display_name as final_owner_name,
  wi.assignee_other_name,
  requester.display_name as requester_name,
  wi.requester_team,
  wi.review_round,
  wi.campaign_name,
  wi.project_name,
  array_to_string(crd.platforms, ', ') as platform,
  crd.size_format,
  public.flowmate_kpi_ai_tags(wi.id) as ai_tags,
  case
    when wi.delivered_at is null then 'unknown'
    when (wi.delivered_at at time zone 'Asia/Bangkok')::date <= wi.due_date then 'on_time'
    else 'late'
  end as delivery_result
from public.work_items wi
left join public.team_members owner on owner.id = wi.final_owner_member_id
left join public.users requester on requester.id = wi.requester_user_id
left join public.creative_request_details crd on crd.work_item_id = wi.id
left join lateral (
  select min(e.created_at) filter (where e.to_status = 'assigned') as assigned_at
  from public.work_item_events e
  where e.work_item_id = wi.id
) event_times on true
where wi.archived_at is null or wi.status = 'delivered';

create or replace function public.flowmate_board_summary()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with active as (
    select wi.*
    from public.work_items wi
    where wi.archived_at is null
      and wi.status in ('unassigned', 'assigned', 'in_progress', 'review', 'blocked')
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

revoke all privileges on public.flowmate_delivered_history_v from public, anon, authenticated;
revoke all privileges on public.flowmate_kpi_work_items_v from public, anon, authenticated;
grant select on public.flowmate_delivered_history_v to authenticated;
grant select on public.flowmate_kpi_work_items_v to authenticated;
revoke all on function public.flowmate_kpi_ai_tags(uuid) from public, anon, authenticated;
grant execute on function public.flowmate_kpi_ai_tags(uuid) to authenticated;
revoke all on function public.flowmate_board_summary() from public, anon, authenticated;
grant execute on function public.flowmate_board_summary() to authenticated;

create or replace function public.flowmate_list_delivered_history(
  p_scope text default 'recent',
  p_search text default null,
  p_delivered_month date default null,
  p_campaign text default null,
  p_owner_member_id uuid default null,
  p_page_size integer default 50,
  p_cursor_delivered_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_scope text := lower(trim(coalesce(p_scope, 'recent')));
  v_page_size integer := greatest(1, least(coalesce(p_page_size, 50), 100));
  v_total bigint;
  v_rows jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
  v_filter_options jsonb;
begin
  if v_scope not in ('recent', 'archived') then
    raise exception 'Invalid delivered history scope';
  end if;

  select count(*)
  into v_total
  from public.flowmate_delivered_history_v h
  where (
      (v_scope = 'recent' and h.archived_at is null and (
        h.delivered_at is null
        or h.delivered_at > now() - interval '60 days'
        or exists (
          select 1
          from public.work_items wi_exempt
          where wi_exempt.id = h.id
            and wi_exempt.archive_exempt_until > now()
        )
      ))
      or (v_scope = 'archived' and h.archived_at is not null)
    )
    and (
      nullif(trim(coalesce(p_search, '')), '') is null
      or h.display_id ilike '%' || trim(p_search) || '%'
      or h.title ilike '%' || trim(p_search) || '%'
      or coalesce(h.campaign_name, '') ilike '%' || trim(p_search) || '%'
    )
    and (
      p_delivered_month is null
      or date_trunc('month', h.delivered_at at time zone 'Asia/Bangkok')::date = date_trunc('month', p_delivered_month)::date
    )
    and (nullif(trim(coalesce(p_campaign, '')), '') is null or h.campaign_name = trim(p_campaign))
    and (p_owner_member_id is null or h.owner_member_id = p_owner_member_id);

  with filtered as (
    select h.*
    from public.flowmate_delivered_history_v h
    where (
        (v_scope = 'recent' and h.archived_at is null and (
          h.delivered_at is null
          or h.delivered_at > now() - interval '60 days'
          or exists (
            select 1
            from public.work_items wi_exempt
            where wi_exempt.id = h.id
              and wi_exempt.archive_exempt_until > now()
          )
        ))
        or (v_scope = 'archived' and h.archived_at is not null)
      )
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or h.display_id ilike '%' || trim(p_search) || '%'
        or h.title ilike '%' || trim(p_search) || '%'
        or coalesce(h.campaign_name, '') ilike '%' || trim(p_search) || '%'
      )
      and (
        p_delivered_month is null
        or date_trunc('month', h.delivered_at at time zone 'Asia/Bangkok')::date = date_trunc('month', p_delivered_month)::date
      )
      and (nullif(trim(coalesce(p_campaign, '')), '') is null or h.campaign_name = trim(p_campaign))
      and (p_owner_member_id is null or h.owner_member_id = p_owner_member_id)
      and (
        p_cursor_id is null
        or (
          p_cursor_delivered_at is not null
          and (h.delivered_at is null or (h.delivered_at, h.id) < (p_cursor_delivered_at, p_cursor_id))
        )
        or (
          p_cursor_delivered_at is null
          and h.delivered_at is null
          and h.id < p_cursor_id
        )
      )
    order by h.delivered_at desc nulls last, h.id desc
    limit v_page_size + 1
  ),
  visible as (
    select * from filtered
    order by delivered_at desc nulls last, id desc
    limit v_page_size
  )
  select
    coalesce(jsonb_agg(to_jsonb(v) order by v.delivered_at desc nulls last, v.id desc), '[]'::jsonb),
    (select count(*) > v_page_size from filtered)
  into v_rows, v_has_more
  from visible v;

  if jsonb_array_length(v_rows) > 0 and v_has_more then
    v_next_cursor := jsonb_build_object(
      'delivered_at', v_rows -> -1 -> 'delivered_at',
      'id', v_rows -> -1 ->> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  select jsonb_build_object(
    'campaigns', coalesce((
      select jsonb_agg(c.campaign_name order by c.campaign_name)
      from (
        select distinct h.campaign_name
        from public.flowmate_delivered_history_v h
        where h.campaign_name is not null and trim(h.campaign_name) <> ''
      ) c
    ), '[]'::jsonb),
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.owner_member_id, 'name', o.owner_name) order by o.owner_name)
      from (
        select distinct h.owner_member_id, h.owner_name
        from public.flowmate_delivered_history_v h
        where h.owner_member_id is not null
      ) o
    ), '[]'::jsonb)
  ) into v_filter_options;

  return jsonb_build_object(
    'scope', v_scope,
    'rows', v_rows,
    'total', v_total,
    'next_cursor', v_next_cursor,
    'has_more', v_has_more,
    'filter_options', v_filter_options,
    'as_of', now()
  );
end;
$$;

revoke all on function public.flowmate_list_delivered_history(
  text, text, date, text, uuid, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.flowmate_list_delivered_history(
  text, text, date, text, uuid, integer, timestamptz, uuid
) to authenticated;

create or replace function public.flowmate_search_archived_work_items(
  p_search text,
  p_page_size integer default 50,
  p_cursor_archived_at timestamptz default null,
  p_cursor_id uuid default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_page_size integer := greatest(1, least(coalesce(p_page_size, 50), 100));
  v_total bigint;
  v_rows jsonb;
  v_has_more boolean;
  v_next_cursor jsonb;
begin
  select count(*)
  into v_total
  from public.flowmate_delivered_history_v h
  where h.archived_at is not null
    and (
      nullif(trim(coalesce(p_search, '')), '') is null
      or h.display_id ilike '%' || trim(p_search) || '%'
      or h.title ilike '%' || trim(p_search) || '%'
      or coalesce(h.campaign_name, '') ilike '%' || trim(p_search) || '%'
    );

  with filtered as (
    select h.*
    from public.flowmate_delivered_history_v h
    where h.archived_at is not null
      and (
        nullif(trim(coalesce(p_search, '')), '') is null
        or h.display_id ilike '%' || trim(p_search) || '%'
        or h.title ilike '%' || trim(p_search) || '%'
        or coalesce(h.campaign_name, '') ilike '%' || trim(p_search) || '%'
      )
      and (
        p_cursor_archived_at is null
        or (h.archived_at, h.id) < (p_cursor_archived_at, p_cursor_id)
      )
    order by h.archived_at desc, h.id desc
    limit v_page_size + 1
  ),
  visible as (
    select * from filtered
    order by archived_at desc, id desc
    limit v_page_size
  )
  select
    coalesce(jsonb_agg(to_jsonb(v) order by v.archived_at desc, v.id desc), '[]'::jsonb),
    (select count(*) > v_page_size from filtered)
  into v_rows, v_has_more
  from visible v;

  if jsonb_array_length(v_rows) > 0 and v_has_more then
    v_next_cursor := jsonb_build_object(
      'archived_at', v_rows -> -1 -> 'archived_at',
      'id', v_rows -> -1 ->> 'id'
    );
  else
    v_next_cursor := null;
  end if;

  return jsonb_build_object(
    'rows', v_rows,
    'total', v_total,
    'next_cursor', v_next_cursor,
    'has_more', v_has_more,
    'as_of', now()
  );
end;
$$;

revoke all on function public.flowmate_search_archived_work_items(
  text, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.flowmate_search_archived_work_items(
  text, integer, timestamptz, uuid
) to authenticated;

create or replace function public.flowmate_preview_delivered_at_backfill()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with delivered_events as (
    select e.work_item_id, max(e.created_at) as delivered_event_at
    from public.work_item_events e
    where e.to_status = 'delivered'
      and e.from_status is distinct from 'delivered'
    group by e.work_item_id
  ), missing as (
    select wi.id, wi.display_id, de.delivered_event_at
    from public.work_items wi
    left join delivered_events de on de.work_item_id = wi.id
    where wi.status = 'delivered'
      and wi.delivered_at is null
  )
  select jsonb_build_object(
    'candidate_count', count(*) filter (where delivered_event_at is not null),
    'exception_count', count(*) filter (where delivered_event_at is null),
    'candidate_ids', coalesce(jsonb_agg(display_id order by display_id) filter (where delivered_event_at is not null), '[]'::jsonb),
    'exception_ids', coalesce(jsonb_agg(display_id order by display_id) filter (where delivered_event_at is null), '[]'::jsonb)
  )
  from missing;
$$;

create or replace function public.flowmate_backfill_delivered_at(
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_preview jsonb;
  v_row record;
  v_updated_count integer := 0;
begin
  select public.flowmate_preview_delivered_at_backfill() into v_preview;

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'updated_count', 0, 'preview', v_preview);
  end if;

  for v_row in
    with delivered_events as (
      select e.work_item_id, max(e.created_at) as delivered_event_at
      from public.work_item_events e
      where e.to_status = 'delivered'
        and e.from_status is distinct from 'delivered'
      group by e.work_item_id
    )
    select wi.id, wi.status, de.delivered_event_at
    from public.work_items wi
    join delivered_events de on de.work_item_id = wi.id
    where wi.status = 'delivered'
      and wi.delivered_at is null
    for update of wi
  loop
    update public.work_items
    set delivered_at = v_row.delivered_event_at,
        updated_at = now()
    where id = v_row.id
      and delivered_at is null;

    if found then
      v_updated_count := v_updated_count + 1;
      insert into public.work_item_events (
        work_item_id, actor_user_id, event_type, from_status, to_status, metadata
      ) values (
        v_row.id, null, 'updated', v_row.status, v_row.status,
        jsonb_build_object('source', 'operator_backfill', 'evidence', 'latest_delivered_transition_event')
      );
    end if;
  end loop;

  return jsonb_build_object(
    'dry_run', false,
    'updated_count', v_updated_count,
    'preview', v_preview
  );
end;
$$;

revoke all on function public.flowmate_preview_delivered_at_backfill() from public, anon, authenticated;
revoke all on function public.flowmate_backfill_delivered_at(boolean) from public, anon, authenticated;
grant execute on function public.flowmate_preview_delivered_at_backfill() to service_role;
grant execute on function public.flowmate_backfill_delivered_at(boolean) to service_role;

create or replace function public.flowmate_archive_expired_deliveries(
  p_dry_run boolean default true,
  p_as_of timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid := gen_random_uuid();
  v_candidate record;
  v_candidate_ids uuid[] := '{}';
  v_failures jsonb := '[]'::jsonb;
  v_archived_count integer := 0;
  v_skipped_count integer := 0;
  v_started_at timestamptz := clock_timestamp();
begin
  if p_as_of is null then
    raise exception 'Archive as_of is required';
  end if;

  if p_dry_run then
    select coalesce(array_agg(c.id order by c.delivered_at, c.id), '{}')
    into v_candidate_ids
    from (
      select wi.id, wi.delivered_at
      from public.work_items wi
      where wi.status = 'delivered'
        and wi.archived_at is null
        and wi.delivered_at is not null
        and wi.delivered_at <= p_as_of - interval '60 days'
        and (wi.archive_exempt_until is null or wi.archive_exempt_until <= p_as_of)
      order by wi.delivered_at, wi.id
      limit 500
    ) c;
  else
    for v_candidate in
      select wi.id, wi.display_id, wi.status
      from public.work_items wi
      where wi.status = 'delivered'
        and wi.archived_at is null
        and wi.delivered_at is not null
        and wi.delivered_at <= p_as_of - interval '60 days'
        and (wi.archive_exempt_until is null or wi.archive_exempt_until <= p_as_of)
      order by wi.delivered_at, wi.id
      for update skip locked
      limit 500
    loop
      v_candidate_ids := array_append(v_candidate_ids, v_candidate.id);
      begin
        update public.work_items
        set archived_at = p_as_of,
            archived_by_user_id = null,
            archive_reason = 'auto_delivered_retention_60d',
            archive_exempt_until = null,
            wip_counted = false,
            updated_at = now()
        where id = v_candidate.id
          and status = 'delivered'
          and archived_at is null;

        if not found then
          v_skipped_count := v_skipped_count + 1;
          continue;
        end if;

        insert into public.work_item_events (
          work_item_id, actor_user_id, event_type, from_status, to_status, metadata
        ) values (
          v_candidate.id,
          null,
          'updated',
          v_candidate.status,
          v_candidate.status,
          jsonb_build_object(
            'source', 'scheduler',
            'archive_reason', 'auto_delivered_retention_60d',
            'retention_days', 60,
            'as_of', p_as_of,
            'batch_id', v_batch_id
          )
        );
        v_archived_count := v_archived_count + 1;
      exception when others then
        v_skipped_count := v_skipped_count + 1;
        v_failures := v_failures || jsonb_build_array(jsonb_build_object(
          'id', v_candidate.id,
          'display_id', v_candidate.display_id,
          'sqlstate', sqlstate,
          'message', sqlerrm
        ));
      end;
    end loop;
  end if;

  insert into public.flowmate_archive_job_runs (
    batch_id,
    run_mode,
    as_of,
    cutoff_at,
    candidate_count,
    archived_count,
    skipped_count,
    failure_count,
    candidate_ids,
    failures,
    metadata,
    started_at,
    finished_at
  ) values (
    v_batch_id,
    case when p_dry_run then 'dry_run' else 'apply' end,
    p_as_of,
    p_as_of - interval '60 days',
    cardinality(v_candidate_ids),
    v_archived_count,
    v_skipped_count,
    jsonb_array_length(v_failures),
    v_candidate_ids,
    v_failures,
    jsonb_build_object('batch_limit', 500, 'retention_days', 60),
    v_started_at,
    clock_timestamp()
  );

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'as_of', p_as_of,
    'batch_id', v_batch_id,
    'candidate_count', cardinality(v_candidate_ids),
    'archived_count', v_archived_count,
    'skipped_count', v_skipped_count,
    'candidate_ids', to_jsonb(v_candidate_ids),
    'failures', v_failures
  );
end;
$$;

revoke all on function public.flowmate_archive_expired_deliveries(boolean, timestamptz)
from public, anon, authenticated;
grant execute on function public.flowmate_archive_expired_deliveries(boolean, timestamptz)
to service_role;

create or replace function public.flowmate_admin_restore_work_item(
  p_display_id text,
  p_restore_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_work public.work_items%rowtype;
  v_previous_archived_at timestamptz;
  v_previous_archived_by_user_id uuid;
  v_previous_archive_reason text;
  v_previous_wip_counted boolean;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_admin_app_user(v_actor_id) then
    raise exception 'Only FlowMate admins can restore work items'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_restore_reason, ''))) = 0 then
    raise exception 'Restore reason is required';
  end if;

  select *
  into v_work
  from public.work_items
  where display_id = p_display_id
  for update;

  if v_work.id is null then
    raise exception 'Work item not found';
  end if;

  if v_work.archived_at is null then
    raise exception 'Work item is not archived';
  end if;

  v_previous_archived_at := v_work.archived_at;
  v_previous_archived_by_user_id := v_work.archived_by_user_id;
  v_previous_archive_reason := v_work.archive_reason;
  v_previous_wip_counted := v_work.wip_counted;

  update public.work_items
  set archived_at = null,
      archived_by_user_id = null,
      archive_reason = null,
      archive_exempt_until = case
        when v_work.status = 'delivered' then now() + interval '7 days'
        else null
      end,
      wip_counted = (v_work.status = 'in_progress'),
      updated_at = now()
  where id = v_work.id
  returning * into v_work;

  insert into public.work_item_events (
    work_item_id, actor_user_id, event_type, from_status, to_status, metadata
  ) values (
    v_work.id,
    v_actor_id,
    'updated',
    v_work.status,
    v_work.status,
    jsonb_build_object(
      'source', 'rpc',
      'admin_restore', true,
      'restore_reason', trim(p_restore_reason),
      'previous_archived_at', v_previous_archived_at,
      'previous_archived_by_user_id', v_previous_archived_by_user_id,
      'previous_archive_reason', v_previous_archive_reason,
      'previous_wip_counted', v_previous_wip_counted,
      'archive_exempt_until', v_work.archive_exempt_until,
      'actor_user_id', v_actor_id
    )
  );

  return jsonb_build_object(
    'id', v_work.id,
    'display_id', v_work.display_id,
    'status', v_work.status,
    'delivered_at', v_work.delivered_at,
    'archive_exempt_until', v_work.archive_exempt_until,
    'restored', true
  );
end;
$$;

revoke all on function public.flowmate_admin_restore_work_item(text, text) from public, anon, authenticated;
grant execute on function public.flowmate_admin_restore_work_item(text, text) to authenticated;

-- Archived child history remains readable through the existing workspace
-- authority. Mutation RPC helpers continue to reject archived work items.
drop policy if exists "team members can read archived board links" on public.work_item_links;
create policy "team members can read archived board links"
on public.work_item_links for select to authenticated
using (
  deleted_at is null
  and (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read archived board watchers" on public.work_item_watchers;
create policy "team members can read archived board watchers"
on public.work_item_watchers for select to authenticated
using (
  removed_at is null
  and (select public.flowmate_current_user_can_read_work_item(work_item_id))
);

drop policy if exists "team members can read archived board ai tags" on public.work_item_ai_tags;
create policy "team members can read archived board ai tags"
on public.work_item_ai_tags for select to authenticated
using (
  (select public.flowmate_current_user_can_read_work_item(work_item_id))
);
