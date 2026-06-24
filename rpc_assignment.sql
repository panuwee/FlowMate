-- FlowMate MVP 1.0 RPC: assignment engine
-- Run this in Supabase SQL Editor after schema.sql, seed.sql, and rpc_quick_task.sql.
--
-- Implements the rules in docs/webdev-handoff/03_Assignment_Rules.md.
-- - Brief completeness check (UAT-007)
-- - Effort calc from request type and asset count (UAT-009, rules §5)
-- - Hybrid auto-queue (UAT-012, rules §10)
-- - Skill + WIP + capacity filtering (rules §11)
-- - Tie-breaker (rules §12)
-- - eSport video urgent-fallback to backup_skills (UAT-011, rules §9)
-- - Queue reasons (rules §13)

-- ---------------------------------------------------------------------------
-- Effort table (rules §5). Subtype is matched case-insensitively against the
-- canonical subtypes used by the form.
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Constraint migration: incomplete briefs must be persisted so the assignment
-- engine can mark them as Need Brief. Non-empty brief links still must be URLs.
-- ---------------------------------------------------------------------------
alter table public.creative_request_details
  drop constraint if exists creative_details_brief_url;

alter table public.creative_request_details
  add constraint creative_details_brief_url check (
    length(trim(coalesce(brief_link, ''))) = 0
    or brief_link ~* '^https?://[^[:space:]]{4,}$'
  );

alter table public.creative_request_details
  add column if not exists asset_count integer not null default 1;

alter table public.creative_request_details
  drop constraint if exists creative_details_asset_count_check;

alter table public.creative_request_details
  add constraint creative_details_asset_count_check check (asset_count >= 1 and asset_count <= 999);

alter table public.work_items
  drop constraint if exists work_items_effort_point_check;

alter table public.work_items
  add constraint work_items_effort_point_check check (
    effort_point is null or (effort_point >= 1 and effort_point <= 999)
  );

alter table public.assignment_runs
  drop constraint if exists assignment_runs_effort_point_check;

alter table public.assignment_runs
  add constraint assignment_runs_effort_point_check check (effort_point >= 1 and effort_point <= 999);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  created_by_user_id uuid not null references public.users(id) on update cascade on delete restrict,
  start_date date not null,
  end_date date not null,
  start_half text not null default 'am',
  end_half text not null default 'pm',
  reason text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_date_order check (end_date >= start_date),
  constraint leave_requests_start_half_check check (start_half in ('am', 'pm')),
  constraint leave_requests_end_half_check check (end_half in ('am', 'pm')),
  constraint leave_requests_same_day_half_order check (
    start_date <> end_date or start_half <= end_half
  )
);

alter table public.leave_requests
  add column if not exists start_half text not null default 'am',
  add column if not exists end_half text not null default 'pm';

create index if not exists idx_leave_requests_member_dates
on public.leave_requests(team_member_id, start_date, end_date)
where cancelled_at is null;

create or replace function public.flowmate_leave_fraction_for_date(
  p_team_member_id uuid,
  p_target_date date
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with leave_days as (
    select
      case
        when (case when lr.start_date = p_target_date then lr.start_half else 'am' end)
           = (case when lr.end_date = p_target_date then lr.end_half else 'pm' end)
          then 0.5::numeric
        else 1::numeric
      end as leave_fraction
    from public.leave_requests lr
    where lr.team_member_id = p_team_member_id
      and lr.cancelled_at is null
      and lr.start_date <= p_target_date
      and lr.end_date >= p_target_date
  )
  select least(1::numeric, coalesce(sum(leave_fraction), 0::numeric))
  from leave_days;
$$;

revoke all on function public.flowmate_leave_fraction_for_date(uuid, date) from public, anon, authenticated;
grant execute on function public.flowmate_leave_fraction_for_date(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Security helper: trust Supabase Auth, never client-supplied actor ids.
-- Existing RPC signatures keep p_actor_user_id for backward compatibility,
-- but function bodies resolve the actor from auth.uid() only.
-- ---------------------------------------------------------------------------
create or replace function public.flowmate_actor_user_id()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = v_user_id
      and u.is_active = true
  ) then
    raise exception 'Authenticated user is inactive or not found';
  end if;

  return v_user_id;
end;
$$;

grant execute on function public.flowmate_actor_user_id() to anon, authenticated;

create or replace function public.flowmate_assert_actor_matches(
  p_requested_actor_user_id uuid,
  p_authenticated_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_requested_actor_user_id is not null
     and p_requested_actor_user_id <> p_authenticated_user_id then
    raise exception 'Actor mismatch: request actor does not match authenticated user';
  end if;
end;
$$;

grant execute on function public.flowmate_assert_actor_matches(uuid, uuid) to anon, authenticated;

create or replace function public.flowmate_is_gdve_member_code(p_member_code text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_member_code, '')) = any (array['pond','jo','tong','eye','vee','ploy']);
$$;

drop view if exists public.member_workload_v;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'team_members'
      and column_name = 'skills'
      and udt_name = '_asset_type'
  ) then
    alter table public.team_members
      alter column skills type text[] using skills::text[];
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'team_members'
      and column_name = 'backup_skills'
      and udt_name = '_asset_type'
  ) then
    alter table public.team_members
      alter column backup_skills drop default;
    alter table public.team_members
      alter column backup_skills type text[] using backup_skills::text[];
    alter table public.team_members
      alter column backup_skills set default '{}'::text[];
  end if;
end $$;

with mapped_skills as (
  select
    tm.id,
    mapped.skill
  from public.team_members tm
  cross join lateral unnest(tm.skills) as source(skill)
  cross join lateral unnest(
    case lower(source.skill)
      when 'static-graphic' then array['banner','hero-album','logo','web-reskin','new-web','cdn-design','resize','graphic-pack','kv-design','jersey-design','jersey-in-game','merchandise-design']::text[]
      when 'general-video' then array['video-standard','video-under-1-min']::text[]
      when 'esport-video' then array['video-standard','video-under-1-min']::text[]
      else array[lower(source.skill)]::text[]
    end
  ) as mapped(skill)
)
update public.team_members tm
   set skills = coalesce((
     select array_agg(distinct ms.skill order by ms.skill)
     from mapped_skills ms
     where ms.id = tm.id
   ), array['banner']::text[])
 where exists (select 1 from mapped_skills ms where ms.id = tm.id);

update public.team_members tm
   set skills = (
     select array_agg(distinct skill order by skill)
     from unnest(coalesce(tm.skills, '{}'::text[]) || array['hero-album']::text[]) as skill
   )
 where lower(tm.member_code) = any (array['pond','jo','tong','eye','ploy'])
   and 'banner' = any (coalesce(tm.skills, '{}'::text[]))
   and not ('hero-album' = any (coalesce(tm.skills, '{}'::text[])));

with mapped_backup_skills as (
  select
    tm.id,
    mapped.skill
  from public.team_members tm
  cross join lateral unnest(coalesce(tm.backup_skills, '{}'::text[])) as source(skill)
  cross join lateral unnest(
    case lower(source.skill)
      when 'esport-video' then array['video-standard','video-under-1-min']::text[]
      when 'general-video' then array['video-standard','video-under-1-min']::text[]
      else array[lower(source.skill)]::text[]
    end
  ) as mapped(skill)
)
update public.team_members tm
   set backup_skills = coalesce((
     select array_agg(distinct mbs.skill order by mbs.skill)
     from mapped_backup_skills mbs
     where mbs.id = tm.id
   ), '{}'::text[])
 where exists (select 1 from mapped_backup_skills mbs where mbs.id = tm.id);

update public.team_members tm
   set backup_skills = (
     select array_agg(distinct skill order by skill)
     from unnest(coalesce(tm.backup_skills, '{}'::text[]) || array['video-standard','video-under-1-min']::text[]) as skill
   )
 where lower(tm.member_code) = 'pond'
   and not ('video-standard' = any (coalesce(tm.backup_skills, '{}'::text[])));

create or replace view public.member_workload_v
with (security_invoker = true) as
select
  tm.id as team_member_id,
  tm.member_code,
  tm.display_name,
  tm.discipline_short,
  tm.skills,
  tm.backup_skills,
  tm.availability,
  tm.capacity_per_day,
  tm.capacity_override_per_day,
  case
    when tm.active = false then 0::numeric
    when tm.availability = 'leave' then 0::numeric
    when tm.availability = 'partial' then tm.capacity_override_per_day
    else tm.capacity_per_day
  end as effective_capacity_per_day,
  coalesce(sum(wi.effort_point) filter (
    where wi.work_type = 'creative_request'
      and wi.status in ('assigned', 'in_progress', 'review', 'blocked')
  ), 0) as assigned_effort,
  count(wi.id) filter (
    where wi.work_type = 'creative_request'
      and wi.status = 'in_progress'
      and wi.wip_counted = true
  ) as current_wip,
  count(wi.id) filter (
    where wi.status in ('assigned', 'in_progress', 'review', 'blocked')
      and wi.due_date < current_date
  ) as overdue_count,
  count(wi.id) filter (
    where wi.status in ('assigned', 'in_progress', 'review')
      and wi.due_date >= current_date
      and wi.due_date <= current_date + interval '2 days'
  ) as due_soon_count,
  count(wi.id) filter (where wi.status = 'blocked') as blocked_count,
  count(wi.id) filter (where wi.status = 'review') as review_count,
  count(wi.id) filter (where wi.work_type = 'quick_task' and wi.status not in ('delivered', 'cancelled')) as quick_task_count
from public.team_members tm
left join public.work_items wi on wi.final_owner_member_id = tm.id
group by tm.id;

revoke all privileges on public.member_workload_v from public, anon, authenticated;
grant select on public.member_workload_v to authenticated;

drop function if exists public.flowmate_effort_for_subtype(public.asset_type, text);

create or replace function public.flowmate_effort_for_subtype(
  p_asset_type public.asset_type,
  p_asset_subtype text,
  p_asset_count integer default 1
) returns integer
language sql
immutable
as $$
  with input as (
    select
      lower(trim(coalesce(p_asset_subtype, ''))) as subtype,
      greatest(1, coalesce(p_asset_count, 1))::numeric as asset_count
  ),
  unit_effort as (
    select case
      when p_asset_type = 'hybrid' then 8::numeric
      when subtype in ('banner', 'logo') then 2::numeric
      when subtype in ('hero album','hero-album') then 16::numeric
      when subtype in ('web reskin','web-reskin') then 24::numeric
      when subtype in ('new web','new-web') then 24::numeric
      when subtype in ('cdn design','cdn-design') then 1::numeric
      when subtype = 'resize' then 0.25::numeric
      when subtype in ('graphic pack','graphic-pack') then 0.5::numeric
      when subtype in ('kv design','kv-design') then 3::numeric
      when subtype in ('jersey design','jersey-design') then 2::numeric
      when subtype in ('jersey in-game','jersey-in-game') then 1::numeric
      when subtype in ('merchandise design','merchandise-design') then 1::numeric
      when subtype in ('video standard','video-standard') then 4::numeric
      when subtype in ('video under 1 min','video-under-1-min') then 2::numeric
      when subtype = 'motion' then 2::numeric
      when subtype ilike '%simple banner%' or subtype ilike '%ad visual%' then 2::numeric
      when subtype ilike '%standard banner%'
        or subtype ilike '%complex social%'
        or subtype ilike '%standard social%' then 4::numeric
      when subtype ilike '%esport graphic pack%' and subtype ilike '%minor%' then 3::numeric
      when subtype ilike '%esport graphic pack%'
        and (subtype ilike '%full%' or subtype ilike '%complete%') then 8::numeric
      when subtype ilike '%short-form%'
        or subtype ilike '%tiktok%'
        or subtype ilike '%reels%' then 4::numeric
      when subtype ilike '%standard video%' or subtype ilike '%youtube vlog%' then 6::numeric
      when subtype ilike '%high-retention%' then 7::numeric
      when subtype ilike '%promotional%'
        or subtype ilike '%highlight reel%' then 8::numeric
      when p_asset_type = 'static-graphic' then 4::numeric
      when p_asset_type = 'general-video'  then 6::numeric
      when p_asset_type = 'esport-video'   then 7::numeric
      when p_asset_type = 'motion'         then 6::numeric
      else 4::numeric
    end as unit_point,
    asset_count
    from input
  )
  select greatest(1, ceil(unit_point * asset_count)::integer)
  from unit_effort;
$$;

-- ---------------------------------------------------------------------------
-- Working-day count (Mon-Fri) between two dates, inclusive of both ends.
-- Returns at least 1 so a same-day or already-overdue request still gets
-- a chance at assignment instead of dividing by zero.
-- ---------------------------------------------------------------------------
create or replace function public.flowmate_count_working_days(
  p_start date,
  p_end date
) returns integer
language sql
immutable
as $$
  select greatest(
    1,
    (
      select count(*)::int
      from generate_series(p_start, greatest(p_start, p_end), interval '1 day') as g(d)
      where extract(isodow from g.d) between 1 and 5
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Brief completeness check (rules §4). Returns a text reason when incomplete,
-- or NULL when complete.
-- ---------------------------------------------------------------------------
create or replace function public.flowmate_brief_missing_reason(
  p_work_item_id uuid
) returns text
language plpgsql
stable
as $$
declare
  v_wi  public.work_items%rowtype;
  v_det public.creative_request_details%rowtype;
  v_missing text[] := array[]::text[];
begin
  select * into v_wi from public.work_items where id = p_work_item_id;
  if v_wi.id is null then return 'Work item not found'; end if;

  select * into v_det from public.creative_request_details where work_item_id = p_work_item_id;
  if v_det.work_item_id is null then return 'Creative request details missing'; end if;

  if length(trim(coalesce(v_wi.title,           ''))) = 0 then v_missing := v_missing || 'title'; end if;
  if length(trim(coalesce(v_wi.requester_team,  ''))) = 0 then v_missing := v_missing || 'requester team'; end if;
  if length(trim(coalesce(v_wi.campaign_name,   ''))) = 0 then v_missing := v_missing || 'campaign name'; end if;
  if length(trim(coalesce(v_det.asset_subtype,  ''))) = 0 then v_missing := v_missing || 'asset subtype'; end if;
  if v_det.platforms is null or array_length(v_det.platforms, 1) is null then
    v_missing := v_missing || 'platform';
  end if;
  if length(trim(coalesce(v_det.size_format,    ''))) = 0 then v_missing := v_missing || 'size/format'; end if;
  if length(trim(coalesce(v_det.brief_link,     ''))) = 0 then v_missing := v_missing || 'brief link'; end if;
  if v_wi.due_date    is null then v_missing := v_missing || 'due date';    end if;
  if v_wi.launch_date is null then v_missing := v_missing || 'launch date'; end if;
  if v_wi.priority = 'urgent'
     and length(trim(coalesce(v_wi.urgent_reason, ''))) = 0 then
    v_missing := v_missing || 'urgent reason';
  end if;

  if array_length(v_missing, 1) is null then
    return null;
  end if;

  return 'Need Brief: ' || array_to_string(v_missing, ', ') || ' required.';
end;
$$;

-- ---------------------------------------------------------------------------
-- Core assignment engine.
-- Reads the work item + creative details, sets status / effort / owner /
-- assignment_reason, writes an assignment_runs row and a work_item_events
-- row.  Returns a jsonb summary.  This function is the SINGLE place that
-- writes effort_point and final_owner_member_id for creative requests.
-- ---------------------------------------------------------------------------
create or replace function public.flowmate_run_assignment(
  p_work_item_id uuid,
  p_trigger public.assignment_trigger
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wi             public.work_items%rowtype;
  v_det            public.creative_request_details%rowtype;
  v_today          date := current_date;
  v_brief_missing  text;
  v_raw_effort     int;
  v_effort         int;
  v_was_capped     boolean;
  v_from_status    public.work_status;
  v_winner_id      uuid;
  v_winner_code    text;
  v_winner_name    text;
  v_winner_skill   text;
  v_reason         text;
  v_has_any_skill  boolean;
  v_has_eligible   boolean;
  v_allow_backup_pool boolean := false;
  v_required_skill text;
  v_requester_context text := 'ops_marketing';
  v_creative_owner_codes text[] := array['pond','jo','tong','eye','vee','ploy'];
  v_assignment_start date;
  v_assignment_end date;
  v_working_days integer;
  v_snapshot       jsonb;
begin
  -- CR-4: Serialize the whole assignment decision. Without this, two
  -- concurrent submits each lock only their own work_item row, then read the
  -- same candidate's capacity/WIP without seeing the other's uncommitted
  -- assignment -- so both can pick the same owner and breach wip_limit /
  -- remaining capacity. The owner pool is tiny, so a single transaction-scoped
  -- advisory lock (auto-released at commit/rollback) is the simplest correct fix.
  perform pg_advisory_xact_lock(hashtext('flowmate_assignment_engine'));

  select * into v_wi  from public.work_items where id = p_work_item_id for update;
  if v_wi.id is null then raise exception 'Work item not found'; end if;
  if v_wi.work_type <> 'creative_request' then
    raise exception 'Assignment engine is for creative requests only';
  end if;

  select * into v_det from public.creative_request_details where work_item_id = p_work_item_id;
  if v_det.work_item_id is null then
    raise exception 'Creative request details missing for %', v_wi.display_id;
  end if;

  v_from_status := v_wi.status;

  -- 1. Brief completeness ---------------------------------------------------
  v_brief_missing := public.flowmate_brief_missing_reason(p_work_item_id);
  if v_brief_missing is not null then
    update public.work_items
       set status                = 'need_brief',
           assignment_reason     = v_brief_missing,
           effort_point          = null,
           final_owner_member_id = null,
           needs_split           = false,
           updated_at            = now()
     where id = p_work_item_id;

    update public.creative_request_details
       set brief_completeness_status = 'need_brief',
           brief_missing_reason      = v_brief_missing,
           updated_at                = now()
     where work_item_id = p_work_item_id;

    insert into public.assignment_runs(
      work_item_id, triggered_by, result, reason,
      effort_point, raw_range_min, raw_range_max, was_capped, capacity_snapshot
    ) values (
      p_work_item_id, p_trigger, 'need_brief', v_brief_missing,
      1, 1, 1, false, '{}'::jsonb
    );

    insert into public.work_item_events(
      work_item_id, event_type, from_status, to_status, metadata
    ) values (
      p_work_item_id, 'brief_checked', v_from_status, 'need_brief',
      jsonb_build_object('result', 'need_brief', 'trigger', p_trigger::text)
    );

    return jsonb_build_object('result', 'need_brief', 'reason', v_brief_missing);
  end if;

  -- 2. Hybrid -> queue with needs_split ------------------------------------
  if v_det.asset_type = 'hybrid' then
    update public.work_items
       set status                = 'queued',
           needs_split           = true,
           effort_point          = 8,
           final_owner_member_id = null,
           assignment_reason     = 'Queued: hybrid request must be split into separate static/video requests.',
           updated_at            = now()
     where id = p_work_item_id;

    insert into public.assignment_runs(
      work_item_id, triggered_by, result, reason,
      effort_point, raw_range_min, raw_range_max, was_capped, capacity_snapshot
    ) values (
      p_work_item_id, p_trigger, 'queued',
      'Queued: hybrid request must be split into separate static/video requests.',
      8, 8, 8, false, '{}'::jsonb
    );

    insert into public.work_item_events(
      work_item_id, event_type, from_status, to_status, metadata
    ) values (
      p_work_item_id, 'assignment_ran', v_from_status, 'queued',
      jsonb_build_object('result', 'queued', 'reason', 'hybrid', 'trigger', p_trigger::text)
    );

    return jsonb_build_object('result', 'queued', 'reason', 'hybrid', 'effort', 8);
  end if;

  -- 3. Effort calc ---------------------------------------------------------
  v_effort      := public.flowmate_effort_for_subtype(v_det.asset_type, v_det.asset_subtype, v_det.asset_count);
  v_raw_effort  := v_effort;
  v_was_capped  := false;
  v_required_skill := lower(trim(coalesce(v_det.asset_subtype, '')));
  v_required_skill := case
    when v_required_skill in (
      'banner',
      'hero-album',
      'logo',
      'web-reskin',
      'new-web',
      'cdn-design',
      'resize',
      'graphic-pack',
      'kv-design',
      'jersey-design',
      'jersey-in-game',
      'merchandise-design',
      'video-standard',
      'video-under-1-min',
      'motion'
    ) then v_required_skill
    when v_required_skill in ('hero album','hero-album') then 'hero-album'
    when v_required_skill = 'web reskin' then 'web-reskin'
    when v_required_skill = 'new web' then 'new-web'
    when v_required_skill = 'cdn design' then 'cdn-design'
    when v_required_skill = 'graphic pack' then 'graphic-pack'
    when v_required_skill = 'kv design' then 'kv-design'
    when v_required_skill = 'jersey design' then 'jersey-design'
    when v_required_skill = 'jersey in-game' then 'jersey-in-game'
    when v_required_skill = 'merchandise design' then 'merchandise-design'
    when v_required_skill = 'video standard' then 'video-standard'
    when v_required_skill = 'video under 1 min' then 'video-under-1-min'
    when v_required_skill ilike '%graphic pack%' then 'graphic-pack'
    when v_required_skill ilike '%motion%' or v_det.asset_type = 'motion' then 'motion'
    when v_required_skill ilike '%short-form%'
      or v_required_skill ilike '%tiktok%'
      or v_required_skill ilike '%reels%'
      or v_required_skill ilike '%under 1 min%' then 'video-under-1-min'
    when v_required_skill ilike '%standard video%'
      or v_required_skill ilike '%youtube vlog%'
      or v_required_skill ilike '%highlight reel%'
      or v_required_skill ilike '%high-retention%' then 'video-standard'
    when v_det.asset_type in ('general-video','esport-video') then 'video-standard'
    when v_det.asset_type = 'motion' then 'motion'
    else 'banner'
  end;
  select case
           when lower(coalesce(v_wi.requester_team, '')) in ('esport','esports')
             or exists (
               select 1
               from public.team_members requester_tm
               where requester_tm.user_id = v_wi.requester_user_id
                 and (
                   lower(requester_tm.member_code) = any (array['ben','net','peak','pluem'])
                   or lower(coalesce(requester_tm.discipline, '')) in ('esport','esports')
                   or lower(coalesce(requester_tm.discipline_short, '')) in ('esport','esports')
                 )
             )
           then 'esport'
           else 'ops_marketing'
         end
    into v_requester_context;
  v_allow_backup_pool := v_wi.priority = 'urgent' and v_required_skill in ('video-standard','video-under-1-min');
  v_assignment_start := v_today;
  v_assignment_end := greatest(v_today, coalesce(v_wi.due_date, v_today));
  v_working_days := public.flowmate_count_working_days(v_assignment_start, v_assignment_end);

  -- 4. Candidate filtering + tie-break -------------------------------------
  with base_raw as (
    select
      tm.id,
      tm.member_code,
      tm.display_name,
      tm.active,
      tm.availability,
      tm.capacity_per_day,
      tm.capacity_override_per_day,
      tm.wip_limit,
      tm.skills,
      tm.backup_skills,
      (
        case
          when tm.active = false                                            then 0::numeric
          when tm.availability = 'leave'                                    then 0::numeric
          when tm.availability = 'partial'                                  then coalesce(tm.capacity_override_per_day, 0)
          else tm.capacity_per_day
        end
      ) as effective_cap,
      coalesce((
        select sum(wi.effort_point)
        from public.work_items wi
        where wi.final_owner_member_id = tm.id
          and wi.work_type = 'creative_request'
          and wi.status in ('assigned','in_progress','review','blocked')
          and wi.id <> p_work_item_id
          and coalesce(wi.due_date, v_today) between v_assignment_start and v_assignment_end
      ), 0) as window_assigned_effort,
      coalesce((
        select count(*)
        from public.work_items wi
        where wi.final_owner_member_id = tm.id
          and wi.status = 'in_progress'
          and wi.wip_counted = true
          and wi.id <> p_work_item_id
      ), 0) as wip_now,
      coalesce((
        select count(*)
        from public.work_items wi
        where wi.final_owner_member_id = tm.id
          and wi.status in ('assigned','in_progress','review','blocked')
          and wi.due_date < v_today
      ), 0) as overdue_count,
      case
        when v_requester_context = 'esport' and lower(tm.member_code) in ('ploy','vee') then 0
        when v_requester_context = 'esport' then 1
        when v_requester_context <> 'esport' and lower(tm.member_code) in ('pond','jo','tong','eye') then 0
        else 1
      end as context_rank,
      case
        when v_requester_context = 'esport' and lower(tm.member_code) = 'ploy' then 0
        when v_requester_context = 'esport' and lower(tm.member_code) = 'vee' then 1
        when v_requester_context <> 'esport' and lower(tm.member_code) = 'pond' and v_required_skill in ('motion','video-standard','video-under-1-min') then 0
        when v_requester_context <> 'esport' and lower(tm.member_code) = 'jo' then 1
        when v_requester_context <> 'esport' and lower(tm.member_code) = 'tong' then 2
        when v_requester_context <> 'esport' and lower(tm.member_code) = 'eye' then 3
        when v_requester_context <> 'esport' and lower(tm.member_code) = 'pond' then 4
        else 9
      end as context_tie_rank,
      case
        when v_required_skill = any (tm.skills)        then 'primary'
        when v_allow_backup_pool
          and (
            v_required_skill = any (coalesce(tm.backup_skills, '{}'::text[]))
            or lower(tm.member_code) = 'pond'
          ) then 'backup'
        else null
      end as skill_match
    from public.team_members tm
    where tm.active = true
      and lower(tm.member_code) = any (v_creative_owner_codes)
  ),
  base as (
    select
      br.*,
      coalesce((
        select sum(br.effective_cap * public.flowmate_leave_fraction_for_date(br.id, g.d::date))
        from generate_series(v_assignment_start, v_assignment_end, interval '1 day') as g(d)
        where extract(isodow from g.d) between 1 and 5
      ), 0) as leave_capacity_loss
    from base_raw br
  ),
  eligible as (
    select
      b.*,
      greatest(0, b.effective_cap * v_working_days - b.leave_capacity_loss) as window_cap,
      (greatest(0, b.effective_cap * v_working_days - b.leave_capacity_loss) - b.window_assigned_effort) as remaining
    from base b
    where b.skill_match is not null
      and (
        b.availability = 'available'
        or (b.availability = 'partial' and coalesce(b.capacity_override_per_day, 0) > 0)
      )
      and b.wip_now < b.wip_limit
      and greatest(0, b.effective_cap * v_working_days - b.leave_capacity_loss) > 0
  ),
  picked as (
    select e.*,
           case
             when e.skill_match = 'primary' then 0
             when e.skill_match = 'backup'
                  and v_allow_backup_pool
                  then 1
             else null
           end as pool_rank
    from eligible e
    where e.remaining >= v_effort
  )
  select id, member_code, display_name, skill_match
    into v_winner_id, v_winner_code, v_winner_name, v_winner_skill
  from picked
  where pool_rank is not null
  order by pool_rank asc,
           context_rank asc,
           context_tie_rank asc,
           remaining desc,
           wip_now asc,
           window_assigned_effort asc,
           overdue_count asc,
           member_code asc
  limit 1;

  -- diagnostic flags for queue reason
  select exists (select 1 from public.team_members tm
                  where tm.active = true
                    and lower(tm.member_code) = any (v_creative_owner_codes)
                    and (
                      v_required_skill = any (tm.skills)
                      or (
                        v_allow_backup_pool
                        and (
                          v_required_skill = any (coalesce(tm.backup_skills, '{}'::text[]))
                          or lower(tm.member_code) = 'pond'
                        )
                      )
                    ))
    into v_has_any_skill;

  select exists (
    with base_raw as (
      select tm.id, tm.member_code, tm.skills, tm.backup_skills, tm.availability, tm.capacity_override_per_day,
             tm.wip_limit,
             (
               case
                 when tm.active = false                                            then 0::numeric
                 when tm.availability = 'leave'                                    then 0::numeric
                 when tm.availability = 'partial'                                  then coalesce(tm.capacity_override_per_day, 0)
                 else tm.capacity_per_day
               end
             ) as effective_cap,
             coalesce((select count(*) from public.work_items wi
                         where wi.final_owner_member_id = tm.id
                           and wi.status = 'in_progress' and wi.wip_counted = true), 0) as wip_now
        from public.team_members tm
       where tm.active = true
         and lower(tm.member_code) = any (v_creative_owner_codes)
         and (
           v_required_skill = any (tm.skills)
           or (
             v_allow_backup_pool
             and (
               v_required_skill = any (coalesce(tm.backup_skills, '{}'::text[]))
               or lower(tm.member_code) = 'pond'
             )
           )
         )
    ),
    base as (
      select
        br.*,
        coalesce((
          select sum(br.effective_cap * public.flowmate_leave_fraction_for_date(br.id, g.d::date))
          from generate_series(v_assignment_start, v_assignment_end, interval '1 day') as g(d)
          where extract(isodow from g.d) between 1 and 5
        ), 0) as leave_capacity_loss
      from base_raw br
    )
    select 1 from base b
     where (b.availability = 'available'
            or (b.availability = 'partial' and coalesce(b.capacity_override_per_day, 0) > 0))
       and b.wip_now < b.wip_limit
       and greatest(0, b.effective_cap * v_working_days - b.leave_capacity_loss) > 0
  ) into v_has_eligible;

  -- 5a. Assigned -----------------------------------------------------------
  if v_winner_id is not null then
    v_reason := case
      when v_winner_skill = 'backup' then
        'Auto (urgent fallback): ' || v_required_skill
        || ' assigned to backup ' || v_winner_name
        || ' by remaining capacity through ' || to_char(v_wi.due_date, 'Mon DD') || '.'
      else
        'Auto: ' || v_required_skill
        || ' assigned to ' || v_winner_name
        || ' by skill, WIP, and remaining capacity through ' || to_char(v_wi.due_date, 'Mon DD') || '.'
    end;

    update public.work_items
       set status                = 'assigned',
           effort_point          = v_effort,
           final_owner_member_id = v_winner_id,
           assignment_reason     = v_reason,
           needs_split           = false,
           updated_at            = now()
     where id = p_work_item_id;

    insert into public.assignment_runs(
      work_item_id, triggered_by, suggested_owner_member_id, final_owner_member_id,
      result, reason, effort_point, raw_range_min, raw_range_max,
      was_capped, capacity_snapshot
    ) values (
      p_work_item_id, p_trigger, v_winner_id, v_winner_id,
      'assigned', v_reason, v_effort, v_raw_effort, v_raw_effort,
      v_was_capped, '{}'::jsonb
    );

    insert into public.work_item_events(
      work_item_id, event_type, from_status, to_status, metadata
    ) values (
      p_work_item_id, 'assignment_ran', v_from_status, 'assigned',
      jsonb_build_object(
        'result',      'assigned',
        'owner',       v_winner_code,
        'effort',      v_effort,
        'raw_effort',  v_raw_effort,
        'was_capped',  v_was_capped,
        'trigger',     p_trigger::text
      )
    );

    return jsonb_build_object(
      'result',           'assigned',
      'owner_member_id',  v_winner_id,
      'owner_code',       v_winner_code,
      'effort',           v_effort,
      'reason',           v_reason
    );
  end if;

  -- 5b. Queued -------------------------------------------------------------
  if not v_has_any_skill then
    v_reason := 'Queued: no team member has the skill required for ' || v_required_skill || '.';
  elsif not v_has_eligible then
    v_reason := 'Queued: all matching members are at WIP limit or unavailable.';
  else
    v_reason := 'Queued: matching members are over capacity before the 1st Draft date.';
  end if;

  -- capacity snapshot (lightweight) for explainability
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'member_code',     tm.member_code,
      'skills',          tm.skills,
      'availability',    tm.availability,
      'window_start',    v_assignment_start,
      'window_end',      v_assignment_end,
      'working_days',    v_working_days,
      'due_leave_fraction', public.flowmate_leave_fraction_for_date(tm.id, coalesce(v_wi.due_date, v_today)),
      'daily_cap',       case
                            when tm.active = false                  then 0
                            when tm.availability = 'leave'          then 0
                            when tm.availability = 'partial'        then coalesce(tm.capacity_override_per_day, 0)
                            else tm.capacity_per_day
                          end
    )),
    '[]'::jsonb
  ) into v_snapshot
  from public.team_members tm
  where tm.active = true
    and lower(tm.member_code) = any (v_creative_owner_codes);

  update public.work_items
     set status                = 'queued',
         effort_point          = v_effort,
         final_owner_member_id = null,
         assignment_reason     = v_reason,
         needs_split           = false,
         updated_at            = now()
   where id = p_work_item_id;

  insert into public.assignment_runs(
    work_item_id, triggered_by, result, reason,
    effort_point, raw_range_min, raw_range_max,
    was_capped, capacity_snapshot
  ) values (
    p_work_item_id, p_trigger, 'queued', v_reason,
    v_effort, v_raw_effort, v_raw_effort,
    v_was_capped, coalesce(v_snapshot, '[]'::jsonb)
  );

  insert into public.work_item_events(
    work_item_id, event_type, from_status, to_status, metadata
  ) values (
    p_work_item_id, 'assignment_ran', v_from_status, 'queued',
    jsonb_build_object(
      'result',     'queued',
      'reason',     v_reason,
      'effort',     v_effort,
      'trigger',    p_trigger::text
    )
  );

  return jsonb_build_object('result', 'queued', 'effort', v_effort, 'reason', v_reason);
end;
$$;

grant execute on function public.flowmate_run_assignment(uuid, public.assignment_trigger)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Queue drain after capacity is released.
-- Called by status transition RPCs after creative work leaves active capacity
-- (delivered/cancelled). This keeps Central Queue moving without letting the
-- browser pick owners or bypass assignment rules.
-- ---------------------------------------------------------------------------
create or replace function public.flowmate_rerun_queued_creative_requests(
  p_limit integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_result jsonb;
  v_checked integer := 0;
  v_assigned integer := 0;
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 25);
begin
  for v_row in
    select wi.id
    from public.work_items wi
    where wi.work_type = 'creative_request'
      and wi.status = 'queued'
      and wi.archived_at is null
      and coalesce(wi.needs_split, false) = false
    order by
      (wi.priority = 'urgent') desc,
      wi.due_date asc nulls last,
      wi.created_at asc
    limit v_limit
    for update skip locked
  loop
    v_checked := v_checked + 1;
    v_result := public.flowmate_run_assignment(v_row.id, 'capacity_change');
    if v_result ->> 'result' = 'assigned' then
      v_assigned := v_assigned + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'checked', v_checked,
    'assigned', v_assigned
  );
end;
$$;

revoke all on function public.flowmate_rerun_queued_creative_requests(integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_creative_request: insert payload, run engine, return result.
-- Backend is the SINGLE source of truth for effort_point and final owner —
-- any client-provided values for those columns are IGNORED (UAT-008/009).
-- ---------------------------------------------------------------------------
drop function if exists public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, text[], text,
  text, text, public.priority_level, text, date, date
);
drop function if exists public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, text[], text,
  text, text, text, public.priority_level, text, date, date
);
drop function if exists public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, integer, text[], text,
  text, text, public.priority_level, text, date, date
);
drop function if exists public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, text[], text,
  text, text, public.priority_level, text, date, date, integer
);
drop function if exists public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, text[], text,
  text, text, text, public.priority_level, text, date, date, integer
);

create or replace function public.create_creative_request(
  p_actor_user_id uuid,
  p_title text,
  p_requester_team text,
  p_campaign_name text,
  p_asset_type public.asset_type,
  p_asset_subtype text,
  p_platforms text[],
  p_size_format text,
  p_brief_link text,
  p_brief_note text default null,
  p_reference_link text default null,
  p_priority public.priority_level default 'normal',
  p_urgent_reason text default null,
  p_due_date date default null,
  p_launch_date date default null,
  p_asset_count integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor         public.users%rowtype;
  v_next_number   integer;
  v_display_id    text;
  v_work_item_id  uuid;
  v_assignment    jsonb;
  v_due_date      date;
  v_launch_date   date;
  v_remaining_working_days integer;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;
  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  if length(trim(coalesce(p_title, ''))) = 0 then
    raise exception 'Creative request title is required';
  end if;

  if greatest(1, coalesce(p_asset_count, 1)) <> coalesce(p_asset_count, 1) then
    raise exception 'Asset Count must be at least 1';
  end if;

  v_launch_date := coalesce(p_launch_date, p_due_date);
  v_due_date := p_due_date;
  if v_due_date is null and p_launch_date is not null then
    v_due_date := p_launch_date;
    v_remaining_working_days := 5;
    while v_remaining_working_days > 0 loop
      v_due_date := v_due_date - 1;
      if extract(isodow from v_due_date) between 1 and 5 then
        v_remaining_working_days := v_remaining_working_days - 1;
      end if;
    end loop;
  end if;
  v_due_date := coalesce(v_due_date, current_date + 7);

  perform pg_advisory_xact_lock(hashtext('flowmate_creative_request_display_id'));

  select coalesce(max((substring(display_id from 4))::integer), 1000) + 1
    into v_next_number
    from public.work_items
   where display_id ~ '^CR-[0-9]{4,}$';

  v_display_id := 'CR-' || lpad(v_next_number::text, 4, '0');

  insert into public.work_items (
    display_id, work_type, title, campaign_name,
    description,
    requester_user_id, requester_team,
    status, priority, urgent_reason,
    due_date, launch_date,
    -- effort_point intentionally null; engine writes it.
    effort_point, final_owner_member_id, needs_split, review_round, wip_counted
  ) values (
    v_display_id, 'creative_request', trim(p_title), nullif(trim(coalesce(p_campaign_name,'')), ''),
    nullif(trim(coalesce(p_brief_note,'')), ''),
    v_actor_id, nullif(trim(coalesce(p_requester_team,'')), ''),
    'new', coalesce(p_priority, 'normal'), nullif(trim(coalesce(p_urgent_reason,'')), ''),
    v_due_date, v_launch_date,
    null, null, false, 0, false
  ) returning id into v_work_item_id;

  insert into public.creative_request_details (
    work_item_id, asset_type, asset_subtype, asset_count, platforms, size_format,
    brief_link, reference_link, brief_completeness_status
  ) values (
    v_work_item_id, p_asset_type, trim(coalesce(p_asset_subtype, '')), greatest(1, coalesce(p_asset_count, 1)),
    coalesce(p_platforms, '{}'::text[]), trim(coalesce(p_size_format, '')),
    trim(coalesce(p_brief_link, '')), nullif(trim(coalesce(p_reference_link, '')), ''),
    'new'
  );

  insert into public.work_item_events (
    work_item_id, actor_user_id, event_type, to_status, metadata
  ) values (
    v_work_item_id, v_actor_id, 'created', 'new',
    jsonb_build_object('source', 'rpc', 'work_type', 'creative_request')
  );

  v_assignment := public.flowmate_run_assignment(v_work_item_id, 'submit');

  return jsonb_build_object(
    'id',         v_work_item_id,
    'display_id', v_display_id,
    'assignment', v_assignment
  );
end;
$$;

grant execute on function public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, text[], text,
  text, text, text, public.priority_level, text, date, date, integer
) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- recheck_brief: ask the engine to revalidate a Need Brief request after
-- the requester has filled in missing fields.
-- ---------------------------------------------------------------------------
create or replace function public.recheck_brief(
  p_actor_user_id uuid,
  p_display_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_wi    public.work_items%rowtype;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;
  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  select * into v_wi from public.work_items where display_id = p_display_id;
  if v_wi.id is null then raise exception 'Work item not found'; end if;
  if v_wi.work_type <> 'creative_request' then
    raise exception 'Only creative requests can be brief-checked';
  end if;

  if v_wi.requester_user_id <> v_actor_id then
    raise exception 'Only the requester can recheck a brief';
  end if;

  return public.flowmate_run_assignment(v_wi.id, 'recheck');
end;
$$;

grant execute on function public.recheck_brief(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- rerun_assignment: ask the engine to re-evaluate a Queued request.
-- Does not allow manual owner picking (rules §17).
-- ---------------------------------------------------------------------------
create or replace function public.rerun_assignment(
  p_actor_user_id uuid,
  p_display_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_wi    public.work_items%rowtype;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;
  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  select * into v_wi from public.work_items where display_id = p_display_id;
  if v_wi.id is null then raise exception 'Work item not found'; end if;
  if v_wi.work_type <> 'creative_request' then
    raise exception 'Only creative requests can be reassigned';
  end if;

  if v_wi.status not in ('queued', 'need_brief') then
    raise exception 'Rerun is only allowed for queued or need_brief requests';
  end if;

  return public.flowmate_run_assignment(v_wi.id, 'rerun');
end;
$$;

grant execute on function public.rerun_assignment(uuid, text) to anon, authenticated;
