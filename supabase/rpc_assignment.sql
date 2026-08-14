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
  add column if not exists asset_type_2 public.asset_type,
  add column if not exists asset_subtype_2 text,
  add column if not exists asset_count_2 integer;

alter table public.creative_request_details
  drop constraint if exists creative_details_asset_count_check;

alter table public.creative_request_details
  add constraint creative_details_asset_count_check check (asset_count >= 1 and asset_count <= 999);

alter table public.creative_request_details
  drop constraint if exists creative_details_asset_2_pair_check;

alter table public.creative_request_details
  add constraint creative_details_asset_2_pair_check check (
    (asset_type_2 is null and asset_subtype_2 is null and asset_count_2 is null)
    or (
      asset_type_2 is not null
      and length(trim(coalesce(asset_subtype_2, ''))) > 0
      and asset_count_2 >= 1
      and asset_count_2 <= 999
    )
  );

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

create or replace function public.flowmate_leave_fraction_for_bucket(
  p_team_member_id uuid,
  p_target_date date,
  p_bucket_half text
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  with leave_buckets as (
    select
      case
        when lr.start_date = lr.end_date then
          case
            when lr.start_half = 'am' and lr.end_half = 'pm' then 1::numeric
            when lr.start_half = p_bucket_half then 1::numeric
            else 0::numeric
          end
        when p_target_date = lr.start_date then
          case
            when lr.start_half = 'am' then 1::numeric
            when lr.start_half = 'pm' and p_bucket_half = 'pm' then 1::numeric
            else 0::numeric
          end
        when p_target_date = lr.end_date then
          case
            when lr.end_half = 'pm' then 1::numeric
            when lr.end_half = 'am' and p_bucket_half = 'am' then 1::numeric
            else 0::numeric
          end
        else 1::numeric
      end as leave_fraction
    from public.leave_requests lr
    where lr.team_member_id = p_team_member_id
      and lr.cancelled_at is null
      and lr.start_date <= p_target_date
      and lr.end_date >= p_target_date
      and p_bucket_half in ('am', 'pm')
  )
  select least(1::numeric, coalesce(sum(leave_fraction), 0::numeric))
  from leave_buckets;
$$;

revoke all on function public.flowmate_leave_fraction_for_bucket(uuid, date, text) from public, anon, authenticated;
grant execute on function public.flowmate_leave_fraction_for_bucket(uuid, date, text) to authenticated;

create table if not exists public.flowmate_capacity_allocations (
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,
  bucket_date date not null,
  bucket_half text not null,
  capacity_point numeric not null,
  created_at timestamptz not null default now(),
  primary key (work_item_id, bucket_date, bucket_half),
  constraint flowmate_capacity_allocations_bucket_half_check check (bucket_half in ('am', 'pm')),
  constraint flowmate_capacity_allocations_capacity_point_check check (capacity_point > 0)
);

alter table public.flowmate_capacity_allocations
  drop constraint if exists flowmate_capacity_allocations_capacity_point_check;

-- Existing installations may use a different constraint name for the old
-- per-half-day <= 4 cap. Remove every capacity_point upper-bound check before
-- restoring the positive-only invariant from the approved hybrid contract.
do $canonical_capacity_constraint$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.flowmate_capacity_allocations'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%capacity_point%'
      and pg_get_constraintdef(c.oid) ~ '<=?[[:space:]]*4([.][0-9]+)?'
  loop
    execute format(
      'alter table public.flowmate_capacity_allocations drop constraint %I',
      v_constraint.conname
    );
  end loop;
end;
$canonical_capacity_constraint$;

alter table public.flowmate_capacity_allocations
  drop constraint if exists flowmate_capacity_allocations_capacity_point_check;
alter table public.flowmate_capacity_allocations
  add constraint flowmate_capacity_allocations_capacity_point_check check (capacity_point > 0);

create index if not exists idx_flowmate_capacity_allocations_member_bucket
on public.flowmate_capacity_allocations(team_member_id, bucket_date, bucket_half);

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

-- Team member skills are operational settings owned by the Team settings UI.
-- Do not seed, expand, normalize, or add fallback skills from this assignment
-- installer. Re-running rpc_assignment.sql must preserve every manual skill,
-- capacity, WIP, availability, and backup-skill selection.
-- Candidate eligibility must always read the live team_members.skills,
-- team_members.backup_skills, and team_members.wip_limit values. Never add
-- per-member skill or WIP defaults inside assignment installation or routing.

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

create or replace function public.flowmate_normalize_creative_skill(
  p_asset_type public.asset_type,
  p_asset_subtype text
) returns text
language sql
immutable
as $$
  with input as (
    select lower(trim(coalesce(p_asset_subtype, ''))) as skill
  )
  select case
    when skill in (
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
    ) then skill
    when skill in ('hero album','hero-album') then 'hero-album'
    when skill = 'web reskin' then 'web-reskin'
    when skill = 'new web' then 'new-web'
    when skill = 'cdn design' then 'cdn-design'
    when skill = 'graphic pack' then 'graphic-pack'
    when skill = 'kv design' then 'kv-design'
    when skill = 'jersey design' then 'jersey-design'
    when skill = 'jersey in-game' then 'jersey-in-game'
    when skill = 'merchandise design' then 'merchandise-design'
    when skill = 'video standard' then 'video-standard'
    when skill = 'video under 1 min' then 'video-under-1-min'
    when skill ilike '%graphic pack%' then 'graphic-pack'
    when skill ilike '%motion%' or p_asset_type = 'motion' then 'motion'
    when skill ilike '%short-form%'
      or skill ilike '%tiktok%'
      or skill ilike '%reels%'
      or skill ilike '%under 1 min%' then 'video-under-1-min'
    when skill ilike '%standard video%'
      or skill ilike '%youtube vlog%'
      or skill ilike '%highlight reel%'
      or skill ilike '%high-retention%' then 'video-standard'
    when p_asset_type in ('general-video','esport-video') then 'video-standard'
    when p_asset_type = 'motion' then 'motion'
    else 'banner'
  end
  from input;
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

create or replace function public.flowmate_count_capacity_buckets(
  p_start date,
  p_start_half text,
  p_end date
) returns integer
language sql
immutable
as $$
  select coalesce(count(*)::int, 0)
  from generate_series(p_start, greatest(p_start, p_end), interval '1 day') as g(d)
  cross join (values ('am'::text, 1), ('pm'::text, 2)) as halves(bucket_half, half_order)
  where extract(isodow from g.d) between 1 and 5
    and (
      g.d::date > p_start
      or halves.half_order >= case when p_start_half = 'pm' then 2 else 1 end
    );
$$;

create or replace function public.flowmate_earliest_capacity_date(
  p_start date,
  p_start_half text,
  p_effort integer,
  p_bucket_capacity numeric default 4
) returns date
language plpgsql
immutable
as $$
declare
  v_date date := p_start;
  v_remaining_buckets integer;
begin
  if v_date is null then
    return null;
  end if;
  if p_start_half not in ('am', 'pm') then
    raise exception 'Capacity start half must be am or pm';
  end if;
  if coalesce(p_bucket_capacity, 0) <= 0 then
    raise exception 'Capacity per bucket must be greater than zero';
  end if;

  while extract(isodow from v_date) not between 1 and 5 loop
    v_date := v_date + 1;
  end loop;

  v_remaining_buckets := greatest(
    1,
    ceil(greatest(1, coalesce(p_effort, 1))::numeric / p_bucket_capacity)::integer
  );
  v_remaining_buckets := v_remaining_buckets - case when p_start_half = 'pm' then 1 else 2 end;

  while v_remaining_buckets > 0 loop
    v_date := v_date + 1;
    while extract(isodow from v_date) not between 1 and 5 loop
      v_date := v_date + 1;
    end loop;
    v_remaining_buckets := v_remaining_buckets - 2;
  end loop;

  return v_date;
end;
$$;

-- ---------------------------------------------------------------------------
-- Working-day helpers for production capacity windows.
-- ---------------------------------------------------------------------------
create or replace function public.flowmate_next_working_day(
  p_date date
) returns date
language plpgsql
immutable
as $$
declare
  v_date date := p_date;
begin
  while extract(isodow from v_date) not between 1 and 5 loop
    v_date := v_date + 1;
  end loop;

  return v_date;
end;
$$;

create or replace function public.flowmate_subtract_working_days(
  p_date date,
  p_working_days integer
) returns date
language plpgsql
immutable
as $$
declare
  v_cursor date := p_date;
  v_remaining integer := greatest(0, coalesce(p_working_days, 0));
begin
  -- Monday-Friday are working days; Thai public holidays on weekdays count.
  if v_cursor is null then
    return null;
  end if;

  while v_remaining > 0 loop
    v_cursor := v_cursor - 1;
    if extract(isodow from v_cursor) between 1 and 5 then
      v_remaining := v_remaining - 1;
    end if;
  end loop;

  return public.flowmate_next_working_day(v_cursor);
end;
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

  if length(trim(coalesce(v_wi.title,           ''))) = 0 then v_missing := array_append(v_missing, 'title'); end if;
  if length(trim(coalesce(v_wi.requester_team,  ''))) = 0 then v_missing := array_append(v_missing, 'requester team'); end if;
  if length(trim(coalesce(v_wi.campaign_name,   ''))) = 0 then v_missing := array_append(v_missing, 'campaign name'); end if;
  if length(trim(coalesce(v_det.asset_subtype,  ''))) = 0 then v_missing := array_append(v_missing, 'asset subtype'); end if;
  if v_det.platforms is null or array_length(v_det.platforms, 1) is null then
    v_missing := array_append(v_missing, 'platform');
  end if;
  if length(trim(coalesce(v_det.size_format,    ''))) = 0 then v_missing := array_append(v_missing, 'size/format'); end if;
  if length(trim(coalesce(v_det.brief_link,     ''))) = 0 then v_missing := array_append(v_missing, 'brief link'); end if;
  if v_det.asset_count is null or v_det.asset_count < 1 then v_missing := array_append(v_missing, 'asset count'); end if;
  if v_wi.due_date    is null then v_missing := array_append(v_missing, 'due date');    end if;
  if v_wi.launch_date is null then v_missing := array_append(v_missing, 'launch date'); end if;
  if v_wi.publish_time is null then v_missing := array_append(v_missing, 'publish time'); end if;
  if v_wi.priority = 'urgent'
     and length(trim(coalesce(v_wi.urgent_reason, ''))) = 0 then
    v_missing := array_append(v_missing, 'urgent reason');
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
  v_now_bkk        timestamp := timezone('Asia/Bangkok', now());
  v_today          date := timezone('Asia/Bangkok', now())::date;
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
  v_has_available_wip boolean;
  v_has_eligible   boolean;
  v_allow_backup_pool boolean := false;
  v_required_skill text;
  v_required_skill_2 text;
  v_requester_context text := 'ops_marketing';
  v_creative_owner_codes text[] := array['pond','jo','tong','eye','vee','ploy'];
  v_assignment_start date;
  v_assignment_start_half text := 'am';
  v_assignment_end date;
  v_production_deadline date;
  v_midday_cutoff time := time '12:00';
  v_production_cutoff time := time '15:00';
  v_review_buffer_working_days integer := 2;
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
  if nullif(trim(coalesce(v_det.asset_subtype_2, '')), '') is not null then
    v_effort := v_effort + public.flowmate_effort_for_subtype(v_det.asset_type_2, v_det.asset_subtype_2, v_det.asset_count_2);
  end if;
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
  v_required_skill_2 := case
    when nullif(trim(coalesce(v_det.asset_subtype_2, '')), '') is null then null
    else public.flowmate_normalize_creative_skill(v_det.asset_type_2, v_det.asset_subtype_2)
  end;
  v_allow_backup_pool := v_wi.priority = 'urgent'
    and v_required_skill in ('video-standard','video-under-1-min')
    and (v_required_skill_2 is null or v_required_skill_2 in ('video-standard','video-under-1-min'));
  if extract(isodow from v_today) not between 1 and 5 then
    v_assignment_start := public.flowmate_next_working_day(v_today);
    v_assignment_start_half := 'am';
  elsif v_now_bkk::time >= v_production_cutoff then
    v_assignment_start := public.flowmate_next_working_day(v_today + 1);
    v_assignment_start_half := 'am';
  elsif v_now_bkk::time >= v_midday_cutoff then
    v_assignment_start := public.flowmate_next_working_day(v_today);
    v_assignment_start_half := 'pm';
  else
    v_assignment_start := public.flowmate_next_working_day(v_today);
    v_assignment_start_half := 'am';
  end if;
  v_production_deadline := coalesce(
    v_wi.due_date,
    public.flowmate_subtract_working_days(v_wi.launch_date, v_review_buffer_working_days),
    v_assignment_start
  );
  v_assignment_end := greatest(v_assignment_start, coalesce(v_wi.due_date, v_production_deadline, v_assignment_start));
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
        when v_requester_context <> 'esport' then 1
        else 9
      end as context_tie_rank,
      case
        when v_required_skill = any (tm.skills)
          and (v_required_skill_2 is null or v_required_skill_2 = any (tm.skills)) then 'primary'
        when v_allow_backup_pool
          and (
            v_required_skill = any (tm.skills)
            or v_required_skill = any (coalesce(tm.backup_skills, '{}'::text[]))
          )
          and (
            v_required_skill_2 is null
            or v_required_skill_2 = any (tm.skills)
            or v_required_skill_2 = any (coalesce(tm.backup_skills, '{}'::text[]))
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
      coalesce(bucket_totals.window_cap, 0) as window_cap,
      coalesce(bucket_totals.window_assigned_effort, 0) as window_assigned_effort,
      coalesce(bucket_totals.remaining, 0) as remaining
    from base_raw br
    cross join lateral (
      with bucket_days as (
        select
          g.d::date as bucket_date,
          halves.bucket_half,
          halves.half_order,
          case
            when extract(isodow from g.d) not between 1 and 5 then 0::numeric
            when g.d::date = v_assignment_start
                 and v_assignment_start_half = 'pm'
                 and halves.bucket_half = 'am' then 0::numeric
            else greatest(0::numeric, br.effective_cap / 2)
          end as raw_bucket_cap
        from generate_series(v_assignment_start, v_assignment_end, interval '1 day') as g(d)
        cross join (values ('am'::text, 1), ('pm'::text, 2)) as halves(bucket_half, half_order)
      ),
      bucket_capacity as (
        select
          bucket_days.bucket_date,
          bucket_days.bucket_half,
          greatest(
            0::numeric,
            bucket_days.raw_bucket_cap * (
              1 - public.flowmate_leave_fraction_for_bucket(br.id, bucket_days.bucket_date, bucket_days.bucket_half)
            )
          ) as bucket_cap,
          coalesce((
            select sum(a.capacity_point)
            from public.flowmate_capacity_allocations a
            join public.work_items wi on wi.id = a.work_item_id
            where a.team_member_id = br.id
              and wi.work_type = 'creative_request'
              and wi.status in ('assigned','in_progress','review','blocked')
              and wi.id <> p_work_item_id
              and a.bucket_date = bucket_days.bucket_date
              and a.bucket_half = bucket_days.bucket_half
          ), 0) as bucket_assigned
        from bucket_days
      )
      select
        coalesce(sum(bucket_cap), 0) as window_cap,
        coalesce(sum(bucket_assigned), 0) as window_assigned_effort,
        coalesce(sum(greatest(0::numeric, bucket_cap - bucket_assigned)), 0) as remaining,
        coalesce(sum(greatest(0::numeric, bucket_cap - bucket_assigned)), 0) as bucket_remaining
      from bucket_capacity
    ) bucket_totals
  ),
  eligible as (
    select
      b.*
    from base b
    where b.skill_match is not null
      and (
        b.availability = 'available'
        or (b.availability = 'partial' and coalesce(b.capacity_override_per_day, 0) > 0)
      )
      and b.wip_now < b.wip_limit
      and b.window_cap > 0
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
           window_assigned_effort asc,
           wip_now asc,
           overdue_count asc,
           member_code asc
  limit 1;

  -- diagnostic flags for queue reason
  select exists (select 1 from public.team_members tm
                  where tm.active = true
                    and lower(tm.member_code) = any (v_creative_owner_codes)
                    and (
                      (v_required_skill = any (tm.skills) and (v_required_skill_2 is null or v_required_skill_2 = any (tm.skills)))
                      or (
                        v_allow_backup_pool
                        and (
                          v_required_skill = any (tm.skills)
                          or v_required_skill = any (coalesce(tm.backup_skills, '{}'::text[]))
                        )
                        and (
                          v_required_skill_2 is null
                          or v_required_skill_2 = any (tm.skills)
                          or v_required_skill_2 = any (coalesce(tm.backup_skills, '{}'::text[]))
                        )
                      )
                    ))
    into v_has_any_skill;

  -- Keep WIP/availability separate from capacity. Previously the diagnostic
  -- query also required remaining > 0, so a fully booked capacity window was
  -- incorrectly reported as "WIP limit or unavailable" even when WIP passed.
  select exists (
    select 1
    from public.team_members tm
    where tm.active = true
      and lower(tm.member_code) = any (v_creative_owner_codes)
      and (
        (
          v_required_skill = any (tm.skills)
          and (v_required_skill_2 is null or v_required_skill_2 = any (tm.skills))
        )
        or (
          v_allow_backup_pool
          and (
            v_required_skill = any (tm.skills)
            or v_required_skill = any (coalesce(tm.backup_skills, '{}'::text[]))
          )
          and (
            v_required_skill_2 is null
            or v_required_skill_2 = any (tm.skills)
            or v_required_skill_2 = any (coalesce(tm.backup_skills, '{}'::text[]))
          )
        )
      )
      and (
        tm.availability = 'available'
        or (tm.availability = 'partial' and coalesce(tm.capacity_override_per_day, 0) > 0)
      )
      and coalesce((
        select count(*)
        from public.work_items wi
        where wi.final_owner_member_id = tm.id
          and wi.status = 'in_progress'
          and wi.wip_counted = true
          and wi.id <> p_work_item_id
      ), 0) < tm.wip_limit
      and case
            when tm.availability = 'partial' then coalesce(tm.capacity_override_per_day, 0)
            else tm.capacity_per_day
          end > 0
  ) into v_has_available_wip;

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
           (v_required_skill = any (tm.skills) and (v_required_skill_2 is null or v_required_skill_2 = any (tm.skills)))
                      or (
                        v_allow_backup_pool
                       and (
                          v_required_skill = any (tm.skills)
                          or v_required_skill = any (coalesce(tm.backup_skills, '{}'::text[]))
                        )
                        and (
                          v_required_skill_2 is null
                          or v_required_skill_2 = any (tm.skills)
                          or v_required_skill_2 = any (coalesce(tm.backup_skills, '{}'::text[]))
                        )
                      )
         )
    ),
    base as (
      select
        br.*,
        coalesce(bucket_totals.remaining, 0) as remaining
      from base_raw br
      cross join lateral (
        with bucket_days as (
          select
            g.d::date as bucket_date,
            halves.bucket_half,
            halves.half_order,
            case
              when extract(isodow from g.d) not between 1 and 5 then 0::numeric
              when g.d::date = v_assignment_start
                   and v_assignment_start_half = 'pm'
                   and halves.bucket_half = 'am' then 0::numeric
              else greatest(0::numeric, br.effective_cap / 2)
            end as raw_bucket_cap
          from generate_series(v_assignment_start, v_assignment_end, interval '1 day') as g(d)
          cross join (values ('am'::text, 1), ('pm'::text, 2)) as halves(bucket_half, half_order)
        ),
        bucket_capacity as (
          select
            bucket_days.bucket_date,
            bucket_days.bucket_half,
            greatest(
              0::numeric,
              bucket_days.raw_bucket_cap * (
                1 - public.flowmate_leave_fraction_for_bucket(br.id, bucket_days.bucket_date, bucket_days.bucket_half)
              )
            ) as bucket_cap,
            coalesce((
              select sum(a.capacity_point)
              from public.flowmate_capacity_allocations a
              join public.work_items wi on wi.id = a.work_item_id
              where a.team_member_id = br.id
                and wi.work_type = 'creative_request'
                and wi.status in ('assigned','in_progress','review','blocked')
                and wi.id <> p_work_item_id
                and a.bucket_date = bucket_days.bucket_date
                and a.bucket_half = bucket_days.bucket_half
            ), 0) as bucket_assigned
          from bucket_days
        )
        select coalesce(sum(greatest(0::numeric, bucket_cap - bucket_assigned)), 0) as remaining
        from bucket_capacity
      ) bucket_totals
    )
    select 1 from base b
     where (b.availability = 'available'
            or (b.availability = 'partial' and coalesce(b.capacity_override_per_day, 0) > 0))
       and b.wip_now < b.wip_limit
       and b.remaining > 0
  ) into v_has_eligible;

  -- 5a. Assigned -----------------------------------------------------------
  if v_winner_id is not null then
    v_reason := case
      when v_winner_skill = 'backup' then
        'Auto (urgent fallback): ' || v_required_skill
        || ' assigned to backup ' || v_winner_name
        || ' by remaining capacity through 1st Draft ' || to_char(v_assignment_end, 'Mon DD') || '.'
      else
        'Auto: ' || v_required_skill
        || ' assigned to ' || v_winner_name
        || ' by skill, WIP, and remaining capacity through 1st Draft ' || to_char(v_assignment_end, 'Mon DD') || '.'
    end;

    update public.work_items
       set status                = 'assigned',
           effort_point          = v_effort,
           final_owner_member_id = v_winner_id,
           assignment_reason     = v_reason,
           needs_split           = false,
           updated_at            = now()
     where id = p_work_item_id;

    delete from public.flowmate_capacity_allocations
     where work_item_id = p_work_item_id;

    insert into public.flowmate_capacity_allocations(
      work_item_id, team_member_id, bucket_date, bucket_half, capacity_point
    )
    with bucket_days as (
      select
        g.d::date as bucket_date,
        halves.bucket_half,
        halves.half_order,
        case
          when extract(isodow from g.d) not between 1 and 5 then 0::numeric
          when g.d::date = v_assignment_start
               and v_assignment_start_half = 'pm'
               and halves.bucket_half = 'am' then 0::numeric
          else greatest(
            0::numeric,
            (
              case
                when tm.active = false then 0::numeric
                when tm.availability = 'leave' then 0::numeric
                when tm.availability = 'partial' then coalesce(tm.capacity_override_per_day, 0)
                else tm.capacity_per_day
              end
            ) / 2
          )
        end as raw_bucket_cap
      from generate_series(v_assignment_start, v_assignment_end, interval '1 day') as g(d)
      cross join (values ('am'::text, 1), ('pm'::text, 2)) as halves(bucket_half, half_order)
      join public.team_members tm on tm.id = v_winner_id
    ),
    bucket_capacity as (
      select
        bucket_days.bucket_date,
        bucket_days.bucket_half,
        bucket_days.half_order,
        greatest(
          0::numeric,
          bucket_days.raw_bucket_cap * (
            1 - public.flowmate_leave_fraction_for_bucket(v_winner_id, bucket_days.bucket_date, bucket_days.bucket_half)
          )
        ) as bucket_cap,
        coalesce((
          select sum(a.capacity_point)
          from public.flowmate_capacity_allocations a
          join public.work_items wi on wi.id = a.work_item_id
          where a.team_member_id = v_winner_id
            and wi.work_type = 'creative_request'
            and wi.status in ('assigned','in_progress','review','blocked')
            and wi.id <> p_work_item_id
            and a.bucket_date = bucket_days.bucket_date
            and a.bucket_half = bucket_days.bucket_half
        ), 0) as bucket_assigned
      from bucket_days
    ),
    available_buckets as (
      select
        bucket_date,
        bucket_half,
        half_order,
        greatest(0::numeric, bucket_cap - bucket_assigned) as bucket_remaining
      from bucket_capacity
      where greatest(0::numeric, bucket_cap - bucket_assigned) > 0
    ),
    ordered_buckets as (
      select
        bucket_date,
        bucket_half,
        bucket_remaining,
        sum(bucket_remaining) over (order by bucket_date, half_order rows unbounded preceding) as cumulative_remaining
      from available_buckets
    )
    select
      p_work_item_id,
      v_winner_id,
      bucket_date,
      bucket_half,
      least(bucket_remaining, v_effort::numeric - (cumulative_remaining - bucket_remaining)) as capacity_point
    from ordered_buckets
    where v_effort::numeric > (cumulative_remaining - bucket_remaining)
      and least(bucket_remaining, v_effort::numeric - (cumulative_remaining - bucket_remaining)) > 0
    order by bucket_date, case bucket_half when 'am' then 1 else 2 end;

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
  elsif not v_has_available_wip then
    v_reason := 'Queued: all matching members are at WIP limit or unavailable.';
  elsif not v_has_eligible then
    v_reason := 'Queued: matching members have 0 pt remaining before the 1st Draft date ' ||
      to_char(v_assignment_end, 'Mon DD') || '.';
  else
    v_reason := 'Queued: matching members have some capacity, but less than the required ' ||
      v_effort::text || ' pt before the 1st Draft date ' || to_char(v_assignment_end, 'Mon DD') || '.';
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
drop function if exists public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, text[], text,
  text, text, text, public.priority_level, text, date, date, integer, date
);
drop function if exists public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, text[], text,
  text, text, text, public.priority_level, text, date, date, integer, date, time
);
drop function if exists public.create_creative_request(
  uuid, text, text, text, public.asset_type, text, text[], text,
  text, text, text, public.priority_level, text, date, date, integer, date, time, public.asset_type, text, integer
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
  p_asset_count integer default 1,
  p_publish_date date default null,
  p_publish_time time default null,
  p_asset_type_2 public.asset_type default null,
  p_asset_subtype_2 text default null,
  p_asset_count_2 integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor         public.users%rowtype;
  v_now_bkk       timestamp := timezone('Asia/Bangkok', now());
  v_today         date := timezone('Asia/Bangkok', now())::date;
  v_next_number   integer;
  v_display_id    text;
  v_work_item_id  uuid;
  v_assignment    jsonb;
  v_due_date      date;
  v_final_approved_due_date date;
  v_launch_date   date;
  v_earliest_feasible_due_date date;
  v_first_draft_at_risk boolean := false;
  v_requested_priority public.priority_level;
  v_urgent_reason text;
  v_time_pressure_effort integer;
  v_time_pressure_working_days integer;
  v_time_pressure_capacity integer;
  v_time_pressure_asset_count integer;
  v_time_pressure_asset_count_2 integer;
  v_asset_subtype_2 text;
  v_production_start date;
  v_production_start_half text := 'am';
  v_midday_cutoff time := time '12:00';
  v_production_cutoff time := time '15:00';
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
  v_time_pressure_asset_count := greatest(1, coalesce(p_asset_count, 1));
  v_asset_subtype_2 := nullif(trim(coalesce(p_asset_subtype_2, '')), '');
  if v_asset_subtype_2 is not null then
    if p_asset_type_2 is null then
      raise exception 'Type / Skill 2 requires an asset type';
    end if;
    if p_asset_count_2 is null or p_asset_count_2 < 1 then
      raise exception 'Asset Count 2 must be at least 1 when Type / Skill 2 is selected';
    end if;
    if p_asset_count_2 > 999 then
      raise exception 'Asset Count 2 must be at most 999';
    end if;
    v_time_pressure_asset_count_2 := p_asset_count_2;
  elsif p_asset_type_2 is not null or p_asset_count_2 is not null then
    raise exception 'Type / Skill 2 is required when Asset Count 2 is provided';
  end if;

  v_launch_date := coalesce(p_launch_date, p_due_date, v_today + 7);
  if extract(isodow from v_today) not between 1 and 5 then
    v_production_start := public.flowmate_next_working_day(v_today);
    v_production_start_half := 'am';
  elsif v_now_bkk::time >= v_production_cutoff then
    v_production_start := public.flowmate_next_working_day(v_today + 1);
    v_production_start_half := 'am';
  elsif v_now_bkk::time >= v_midday_cutoff then
    v_production_start := public.flowmate_next_working_day(v_today);
    v_production_start_half := 'pm';
  else
    v_production_start := public.flowmate_next_working_day(v_today);
    v_production_start_half := 'am';
  end if;

  v_requested_priority := coalesce(p_priority, 'normal');
  v_urgent_reason := nullif(trim(coalesce(p_urgent_reason, '')), '');
  v_time_pressure_effort := public.flowmate_effort_for_subtype(p_asset_type, p_asset_subtype, v_time_pressure_asset_count);
  if v_asset_subtype_2 is not null then
    v_time_pressure_effort := v_time_pressure_effort + public.flowmate_effort_for_subtype(p_asset_type_2, v_asset_subtype_2, v_time_pressure_asset_count_2);
  end if;

  -- Creative Request milestones are fixed from Launch Date. Capacity pressure
  -- raises urgent/risk signals but never rebases either generated milestone.
  v_due_date := public.flowmate_subtract_working_days(v_launch_date, 7);
  v_final_approved_due_date := public.flowmate_subtract_working_days(v_launch_date, 5);
  v_earliest_feasible_due_date := public.flowmate_earliest_capacity_date(
    v_production_start,
    v_production_start_half,
    v_time_pressure_effort,
    4
  );
  v_first_draft_at_risk := v_earliest_feasible_due_date > v_due_date;

  if v_due_date < v_production_start then
    v_time_pressure_working_days := 0;
    v_time_pressure_capacity := 0;
  else
    v_time_pressure_working_days := public.flowmate_count_working_days(v_production_start, v_due_date);
    v_time_pressure_capacity := public.flowmate_count_capacity_buckets(v_production_start, v_production_start_half, v_due_date) * 4;
  end if;

  if v_requested_priority <> 'urgent'
     and (v_time_pressure_effort > v_time_pressure_capacity or v_first_draft_at_risk) then
    v_requested_priority := 'urgent';
    v_urgent_reason := coalesce(
      v_urgent_reason,
      case
        when v_time_pressure_effort > v_time_pressure_capacity then
          'Auto urgent: requested effort ' || v_time_pressure_effort::text || ' pt exceeds ' ||
          v_time_pressure_working_days::text || ' working day(s) / ' ||
          v_time_pressure_capacity::text || ' pt before 1st Draft.'
        else
          'Auto urgent: earliest feasible date ' || to_char(v_earliest_feasible_due_date, 'Mon DD, YYYY') ||
          ' misses Asset First Draft Due ' || to_char(v_due_date, 'Mon DD, YYYY') || '.'
      end
    );
  end if;

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
    due_date, final_approved_due_date, launch_date, publish_date, publish_time,
    -- effort_point intentionally null; engine writes it.
    effort_point, final_owner_member_id, needs_split, review_round, wip_counted
  ) values (
    v_display_id, 'creative_request', trim(p_title), nullif(trim(coalesce(p_campaign_name,'')), ''),
    nullif(trim(coalesce(p_brief_note,'')), ''),
    v_actor_id, nullif(trim(coalesce(p_requester_team,'')), ''),
    'new', v_requested_priority, v_urgent_reason,
    v_due_date, v_final_approved_due_date, v_launch_date, p_publish_date, p_publish_time,
    null, null, false, 0, false
  ) returning id into v_work_item_id;

  insert into public.creative_request_details (
    work_item_id, asset_type, asset_subtype, asset_count, asset_type_2, asset_subtype_2, asset_count_2, platforms, size_format,
    brief_link, reference_link, brief_completeness_status
  ) values (
    v_work_item_id, p_asset_type, trim(coalesce(p_asset_subtype, '')), v_time_pressure_asset_count, p_asset_type_2, v_asset_subtype_2, v_time_pressure_asset_count_2,
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
  text, text, text, public.priority_level, text, date, date, integer, date, time, public.asset_type, text, integer
) to anon, authenticated;

select pg_notify('pgrst', 'reload schema');

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

-- ===========================================================================
-- FINAL CANONICAL OVERRIDE - Trello + Asana hybrid assignment contract
-- Source: supabase/trello_asana_hybrid_backend.sql (approved 2026-08-03).
-- Keep this block at the END of the canonical installer: PostgreSQL resolves
-- CREATE OR REPLACE by signature, so these are the final/effective no-queue
-- assignment, allocation, reassignment, reschedule, and compatibility bodies.
-- Existing databases MUST run trello_asana_hybrid_prepare.sql separately and
-- wait for its enum commit before this block can use unassigned/capacity_changed.
-- ===========================================================================
-- FlowMate Trello + Asana hybrid: existing-database backend delta.
-- Prerequisite: trello_asana_hybrid_prepare.sql committed successfully.
-- This file intentionally replaces only assignment/allocation RPC behavior.

begin;

-- Internal allocation helper. It first consumes nominal free capacity in
-- chronological AM/PM order, then spreads unavoidable overload over the same
-- production buckets. The final bucket receives the rounding remainder, so
-- the persisted total is always exactly the work item's effort.
create or replace function public.flowmate_hybrid_rebuild_allocation(
  p_work_item_id uuid,
  p_team_member_id uuid
) returns numeric
language plpgsql
security definer
set search_path = public
as $allocation$
declare
  v_effort numeric;
  v_today date := timezone('Asia/Bangkok', now())::date;
  v_now_bkk timestamp := timezone('Asia/Bangkok', now());
  v_start date;
  v_start_half text := 'am';
  v_end date;
  v_total numeric;
begin
  select wi.effort_point::numeric,
         greatest(timezone('Asia/Bangkok', now())::date, wi.due_date)
    into v_effort, v_end
  from public.work_items wi
  where wi.id = p_work_item_id
    and wi.work_type = 'creative_request'
  for update;

  if v_effort is null or v_effort <= 0 then
    raise exception 'Creative request effort must be positive before allocation';
  end if;

  if not exists (
    select 1
    from public.team_members tm
    join public.users u on u.id = tm.user_id and u.is_active = true
    where tm.id = p_team_member_id
      and tm.active = true
      and public.flowmate_is_gdve_member_code(tm.member_code)
  ) then
    raise exception 'Allocation owner must be an active linked GD/VE member';
  end if;

  if extract(isodow from v_today) not between 1 and 5 then
    v_start := public.flowmate_next_working_day(v_today);
  elsif v_now_bkk::time >= time '15:00' then
    v_start := public.flowmate_next_working_day(v_today + 1);
  elsif v_now_bkk::time >= time '12:00' then
    v_start := public.flowmate_next_working_day(v_today);
    v_start_half := 'pm';
  else
    v_start := public.flowmate_next_working_day(v_today);
  end if;

  v_end := greatest(v_start, coalesce(v_end, v_start));

  delete from public.flowmate_capacity_allocations
  where work_item_id = p_work_item_id;

  insert into public.flowmate_capacity_allocations (
    work_item_id,
    team_member_id,
    bucket_date,
    bucket_half,
    capacity_point
  )
  with buckets as (
    select
      g.d::date as bucket_date,
      halves.bucket_half,
      halves.half_order,
      greatest(
        0::numeric,
        (
          case
            when tm.availability = 'leave' then 0::numeric
            when tm.availability = 'partial' then coalesce(tm.capacity_override_per_day, 0)
            else tm.capacity_per_day
          end / 2
        ) * (1 - public.flowmate_leave_fraction_for_bucket(
          tm.id,
          g.d::date,
          halves.bucket_half
        ))
      ) as nominal_capacity
    from public.team_members tm
    cross join generate_series(v_start, v_end, interval '1 day') as g(d)
    cross join (values ('am'::text, 1), ('pm'::text, 2)) as halves(bucket_half, half_order)
    where tm.id = p_team_member_id
      and extract(isodow from g.d) between 1 and 5
      and (g.d::date > v_start or v_start_half = 'am' or halves.bucket_half = 'pm')
  ), free_buckets as (
    select
      b.*,
      greatest(
        0::numeric,
        b.nominal_capacity - coalesce((
          select sum(a.capacity_point)
          from public.flowmate_capacity_allocations a
          join public.work_items other_wi on other_wi.id = a.work_item_id
          where a.team_member_id = p_team_member_id
            and a.work_item_id <> p_work_item_id
            and a.bucket_date = b.bucket_date
            and a.bucket_half = b.bucket_half
            and other_wi.work_type = 'creative_request'
            and other_wi.status in ('assigned', 'in_progress', 'review', 'blocked')
        ), 0)
      ) as free_capacity
    from buckets b
  ), normal_fill as (
    select
      f.*,
      least(
        f.free_capacity,
        greatest(
          0::numeric,
          v_effort - coalesce(sum(f.free_capacity) over (
            order by f.bucket_date, f.half_order
            rows between unbounded preceding and 1 preceding
          ), 0)
        )
      ) as normal_point
    from free_buckets f
  ), numbered as (
    select
      n.*,
      row_number() over (order by n.bucket_date, n.half_order) as bucket_number,
      count(*) over () as bucket_count,
      sum(n.normal_point) over () as normal_total
    from normal_fill n
  ), distributed as (
    select
      n.*,
      trunc(greatest(v_effort - n.normal_total, 0) / n.bucket_count, 6) as overload_share
    from numbered n
  )
  select
    p_work_item_id,
    p_team_member_id,
    d.bucket_date,
    d.bucket_half,
    d.normal_point + case
      when d.bucket_number < d.bucket_count then d.overload_share
      else greatest(v_effort - d.normal_total, 0)
           - d.overload_share * (d.bucket_count - 1)
    end
  from distributed d
  where d.normal_point + case
    when d.bucket_number < d.bucket_count then d.overload_share
    else greatest(v_effort - d.normal_total, 0)
         - d.overload_share * (d.bucket_count - 1)
  end > 0
  order by d.bucket_date, d.half_order;

  select coalesce(sum(a.capacity_point), 0)
    into v_total
  from public.flowmate_capacity_allocations a
  where a.work_item_id = p_work_item_id;

  if v_total <> v_effort then
    raise exception 'Allocation total % must equal effort %', v_total, v_effort;
  end if;

  return v_total;
end;
$allocation$;

revoke all on function public.flowmate_hybrid_rebuild_allocation(uuid, uuid)
  from public, anon, authenticated;

-- Deterministic best-fit assignment. Skill, WIP, capacity, and leave are soft
-- ranking/warning signals; only active linked members in the GD/VE pool are a
-- hard filter.
create or replace function public.flowmate_run_assignment(
  p_work_item_id uuid,
  p_trigger public.assignment_trigger
) returns jsonb
language plpgsql
security definer
set search_path = public
as $assignment$
declare
  v_work public.work_items%rowtype;
  v_detail public.creative_request_details%rowtype;
  v_from_status public.work_status;
  v_brief_missing text;
  v_effort integer;
  v_required_skill text;
  v_required_skill_2 text;
  v_context text := 'ops_marketing';
  v_today date := timezone('Asia/Bangkok', now())::date;
  v_now_bkk timestamp := timezone('Asia/Bangkok', now());
  v_start date;
  v_start_half text := 'am';
  v_end date;
  v_owner_id uuid;
  v_owner_user_id uuid;
  v_owner_code text;
  v_owner_name text;
  v_availability text;
  v_skill_rank integer;
  v_window_capacity numeric;
  v_allocated_points numeric;
  v_projected_ratio numeric;
  v_wip_now integer;
  v_wip_limit integer;
  v_overdue_count integer;
  v_leave_fraction numeric;
  v_leave_bucket_count integer;
  v_full_leave_bucket_count integer;
  v_window_bucket_count integer;
  v_warnings jsonb := '[]'::jsonb;
  v_reason text;
  v_snapshot jsonb;
  v_needs_split boolean;
begin
  perform pg_advisory_xact_lock(hashtext('flowmate_assignment_engine'));

  select * into v_work
  from public.work_items
  where id = p_work_item_id
  for update;

  if v_work.id is null then
    raise exception 'Work item not found';
  end if;
  if v_work.work_type <> 'creative_request' then
    raise exception 'Assignment engine is for creative requests only';
  end if;

  select * into v_detail
  from public.creative_request_details
  where work_item_id = p_work_item_id;

  if v_detail.work_item_id is null then
    raise exception 'Creative request details missing for %', v_work.display_id;
  end if;

  v_from_status := v_work.status;
  v_brief_missing := public.flowmate_brief_missing_reason(p_work_item_id);

  if v_brief_missing is not null then
    delete from public.flowmate_capacity_allocations
    where work_item_id = p_work_item_id;

    update public.work_items
    set status = 'need_brief',
        assignment_reason = v_brief_missing,
        effort_point = null,
        final_owner_member_id = null,
        needs_split = false,
        wip_counted = false,
        updated_at = now()
    where id = p_work_item_id;

    update public.creative_request_details
    set brief_completeness_status = 'need_brief',
        brief_missing_reason = v_brief_missing,
        updated_at = now()
    where work_item_id = p_work_item_id;

    insert into public.assignment_runs (
      work_item_id, triggered_by, result, reason, effort_point,
      raw_range_min, raw_range_max, was_capped, capacity_snapshot
    ) values (
      p_work_item_id, p_trigger, 'need_brief', v_brief_missing, 1,
      1, 1, false, jsonb_build_object('warnings', '[]'::jsonb)
    );

    insert into public.work_item_events (
      work_item_id, event_type, from_status, to_status, metadata
    ) values (
      p_work_item_id, 'brief_checked', v_from_status, 'need_brief',
      jsonb_build_object(
        'result', 'need_brief',
        'trigger', p_trigger::text,
        'warnings', '[]'::jsonb
      )
    );

    return jsonb_build_object(
      'result', 'need_brief',
      'reason', v_brief_missing,
      'warnings', '[]'::jsonb
    );
  end if;

  v_effort := public.flowmate_effort_for_subtype(
    v_detail.asset_type,
    v_detail.asset_subtype,
    v_detail.asset_count
  );
  if nullif(trim(coalesce(v_detail.asset_subtype_2, '')), '') is not null then
    v_effort := v_effort + public.flowmate_effort_for_subtype(
      v_detail.asset_type_2,
      v_detail.asset_subtype_2,
      v_detail.asset_count_2
    );
  end if;

  v_required_skill := public.flowmate_normalize_creative_skill(
    v_detail.asset_type,
    v_detail.asset_subtype
  );
  v_required_skill_2 := case
    when nullif(trim(coalesce(v_detail.asset_subtype_2, '')), '') is null then null
    else public.flowmate_normalize_creative_skill(
      v_detail.asset_type_2,
      v_detail.asset_subtype_2
    )
  end;
  v_needs_split := coalesce(v_work.needs_split, false) or v_detail.asset_type = 'hybrid';

  select case
    when lower(coalesce(v_work.requester_team, '')) in ('esport', 'esports')
      or exists (
        select 1
        from public.team_members requester_tm
        where requester_tm.user_id = v_work.requester_user_id
          and (
            lower(requester_tm.member_code) = any (array['ben','net','peak','pluem'])
            or lower(coalesce(requester_tm.discipline, '')) in ('esport','esports')
            or lower(coalesce(requester_tm.discipline_short, '')) in ('esport','esports')
          )
      ) then 'esport'
    else 'ops_marketing'
  end into v_context;

  if extract(isodow from v_today) not between 1 and 5 then
    v_start := public.flowmate_next_working_day(v_today);
  elsif v_now_bkk::time >= time '15:00' then
    v_start := public.flowmate_next_working_day(v_today + 1);
  elsif v_now_bkk::time >= time '12:00' then
    v_start := public.flowmate_next_working_day(v_today);
    v_start_half := 'pm';
  else
    v_start := public.flowmate_next_working_day(v_today);
  end if;
  v_end := greatest(v_start, coalesce(v_work.due_date, v_start));

  with candidates as (
    select
      tm.id,
      tm.user_id,
      tm.member_code,
      tm.display_name,
      tm.availability::text as availability,
      tm.wip_limit,
      case
        when v_context = 'esport' and lower(tm.member_code) in ('ploy','vee') then 0
        when v_context = 'esport' then 1
        when lower(tm.member_code) in ('pond','jo','tong','eye') then 0
        else 1
      end as context_rank,
      case
        when v_required_skill_2 is null
          and v_required_skill = any(coalesce(tm.skills, '{}'::text[])) then 0
        when v_required_skill_2 is not null
          and v_required_skill = any(coalesce(tm.skills, '{}'::text[]))
          and v_required_skill_2 = any(coalesce(tm.skills, '{}'::text[])) then 0
        when v_required_skill_2 is not null
          and (
            v_required_skill = any(coalesce(tm.skills, '{}'::text[]))
            or v_required_skill_2 = any(coalesce(tm.skills, '{}'::text[]))
          ) then 1
        when v_required_skill = any(
          coalesce(tm.skills, '{}'::text[]) || coalesce(tm.backup_skills, '{}'::text[])
        ) and (
          v_required_skill_2 is null
          or v_required_skill_2 = any(
            coalesce(tm.skills, '{}'::text[]) || coalesce(tm.backup_skills, '{}'::text[])
          )
        ) then 2
        else 3
      end as skill_rank,
      case
        when tm.availability = 'leave'
          or (
            metrics.window_bucket_count > 0
            and metrics.full_leave_bucket_count = metrics.window_bucket_count
          ) then 2
        when tm.availability = 'partial'
          or metrics.leave_bucket_count > 0 then 1
        else 0
      end as availability_rank,
      metrics.window_capacity,
      metrics.allocated_points,
      case
        when metrics.window_capacity > 0
          then (metrics.allocated_points + v_effort) / metrics.window_capacity
        else 999999::numeric
      end as projected_ratio,
      metrics.wip_now,
      metrics.overdue_count,
      metrics.leave_fraction,
      metrics.leave_bucket_count,
      metrics.full_leave_bucket_count,
      metrics.window_bucket_count
    from public.team_members tm
    join public.users linked_user
      on linked_user.id = tm.user_id
     and linked_user.is_active = true
    cross join lateral (
      select
        coalesce(sum(
          greatest(
            0::numeric,
            (case
              when tm.availability = 'leave' then 0::numeric
              when tm.availability = 'partial' then coalesce(tm.capacity_override_per_day, 0)
              else tm.capacity_per_day
            end / 2) * (1 - public.flowmate_leave_fraction_for_bucket(
              tm.id, b.bucket_date, b.bucket_half
            ))
          )
        ), 0) as window_capacity,
        coalesce((
          select sum(a.capacity_point)
          from public.flowmate_capacity_allocations a
          join public.work_items allocated_wi on allocated_wi.id = a.work_item_id
          where a.team_member_id = tm.id
            and a.work_item_id <> p_work_item_id
            and a.bucket_date between v_start and v_end
            and allocated_wi.work_type = 'creative_request'
            and allocated_wi.status in ('assigned', 'in_progress', 'review', 'blocked')
        ), 0) as allocated_points,
        coalesce((
          select count(*)
          from public.work_items wip_wi
          where wip_wi.final_owner_member_id = tm.id
            and wip_wi.id <> p_work_item_id
            and wip_wi.status = 'in_progress'
            and wip_wi.wip_counted = true
        ), 0)::integer as wip_now,
        coalesce((
          select count(*)
          from public.work_items overdue_wi
          where overdue_wi.final_owner_member_id = tm.id
            and overdue_wi.id <> p_work_item_id
            and overdue_wi.status in ('assigned', 'in_progress', 'review', 'blocked')
            and overdue_wi.due_date < v_today
        ), 0)::integer as overdue_count,
        coalesce(max(public.flowmate_leave_fraction_for_bucket(
          tm.id, b.bucket_date, b.bucket_half
        )), 0) as leave_fraction,
        count(*) filter (
          where public.flowmate_leave_fraction_for_bucket(
            tm.id, b.bucket_date, b.bucket_half
          ) > 0
            and exists (
              select 1
              from public.leave_requests active_leave
              where active_leave.team_member_id = tm.id
                and active_leave.cancelled_at is null
                and active_leave.start_date <= b.bucket_date
                and active_leave.end_date >= b.bucket_date
            )
        )::integer as leave_bucket_count,
        count(*) filter (
          where public.flowmate_leave_fraction_for_bucket(
            tm.id, b.bucket_date, b.bucket_half
          ) >= 1
            and exists (
              select 1
              from public.leave_requests active_leave
              where active_leave.team_member_id = tm.id
                and active_leave.cancelled_at is null
                and active_leave.start_date <= b.bucket_date
                and active_leave.end_date >= b.bucket_date
            )
        )::integer as full_leave_bucket_count,
        count(*)::integer as window_bucket_count
      from (
        select g.d::date as bucket_date, halves.bucket_half
        from generate_series(v_start, v_end, interval '1 day') as g(d)
        cross join (values ('am'::text), ('pm'::text)) as halves(bucket_half)
        where extract(isodow from g.d) between 1 and 5
          and (g.d::date > v_start or v_start_half = 'am' or halves.bucket_half = 'pm')
      ) b
    ) metrics
    where tm.active = true
      and public.flowmate_is_gdve_member_code(tm.member_code)
  )
  select
    c.id,
    c.user_id,
    c.member_code,
    c.display_name,
    c.availability,
    c.skill_rank,
    c.window_capacity,
    c.allocated_points,
    c.projected_ratio,
    c.wip_now,
    c.wip_limit,
    c.overdue_count,
    c.leave_fraction,
    c.leave_bucket_count,
    c.full_leave_bucket_count,
    c.window_bucket_count
  into
    v_owner_id,
    v_owner_user_id,
    v_owner_code,
    v_owner_name,
    v_availability,
    v_skill_rank,
    v_window_capacity,
    v_allocated_points,
    v_projected_ratio,
    v_wip_now,
    v_wip_limit,
    v_overdue_count,
    v_leave_fraction,
    v_leave_bucket_count,
    v_full_leave_bucket_count,
    v_window_bucket_count
  from candidates c
  order by
    c.context_rank,
    c.skill_rank,
    c.availability_rank,
    c.projected_ratio,
    c.allocated_points,
    c.wip_now,
    c.overdue_count,
    lower(c.member_code)
  limit 1;

  if v_owner_id is null then
    v_reason := 'Unassigned: no active linked GD/VE candidate exists.';

    delete from public.flowmate_capacity_allocations
    where work_item_id = p_work_item_id;

    update public.work_items
    set status = 'unassigned',
        effort_point = v_effort,
        final_owner_member_id = null,
        assignment_reason = v_reason,
        needs_split = v_needs_split,
        wip_counted = false,
        updated_at = now()
    where id = p_work_item_id;

    v_snapshot := jsonb_build_object(
      'warnings', '[]'::jsonb,
      'hard_candidate_count', 0,
      'window_start', v_start,
      'window_end', v_end
    );

    insert into public.assignment_runs (
      work_item_id, triggered_by, result, reason, effort_point,
      raw_range_min, raw_range_max, was_capped, capacity_snapshot
    ) values (
      p_work_item_id, p_trigger, 'unassigned', v_reason, v_effort,
      v_effort, v_effort, false, v_snapshot
    );

    insert into public.work_item_events (
      work_item_id, event_type, from_status, to_status, metadata
    ) values (
      p_work_item_id, 'assignment_ran', v_from_status, 'unassigned',
      jsonb_build_object(
        'result', 'unassigned',
        'trigger', p_trigger::text,
        'effort', v_effort,
        'warnings', '[]'::jsonb
      )
    );

    return jsonb_build_object(
      'result', 'unassigned',
      'effort', v_effort,
      'reason', v_reason,
      'warnings', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(w.warning order by w.position), '[]'::jsonb)
  into v_warnings
  from (values
    (1, case when v_allocated_points + v_effort > v_window_capacity then
      jsonb_build_object(
        'code', 'over_capacity',
        'severity', 'critical',
        'message', 'Projected assigned points exceed nominal capacity through 1st Draft.'
      ) end),
    (2, case when v_wip_now >= v_wip_limit then
      jsonb_build_object(
        'code', 'wip_exceeded',
        'severity', 'warning',
        'message', 'Current WIP is at or above the member limit.'
      ) end),
    (3, case when v_skill_rank in (1, 3) then
      jsonb_build_object(
        'code', 'skill_mismatch',
        'severity', 'warning',
        'message', 'The selected member does not have every requested primary skill.'
      ) end),
    (4, case when v_skill_rank = 2 then
      jsonb_build_object(
        'code', 'backup_skill',
        'severity', 'info',
        'message', 'At least one requested skill is covered by backup skill configuration.'
      ) end),
    (5, case when v_availability = 'partial'
                  or (v_leave_bucket_count > 0 and v_full_leave_bucket_count = 0) then
      jsonb_build_object(
        'code', 'member_partial',
        'severity', 'warning',
        'message', 'The selected member has partial availability in the production window.'
      ) end),
    (6, case when v_availability = 'leave' or v_full_leave_bucket_count > 0 then
      jsonb_build_object(
        'code', 'member_on_leave',
        'severity', 'critical',
        'message', 'The selected member is on leave in the production window.'
      ) end),
    (7, case when v_work.due_date < v_start or v_effort > v_window_capacity then
      jsonb_build_object(
        'code', 'deadline_capacity_gap',
        'severity', 'critical',
        'message', 'Nominal production capacity cannot cover the effort by 1st Draft.'
      ) end),
    (8, case when v_work.work_type = 'creative_request'
                  and v_work.launch_date is not null
                  and v_work.due_date > public.flowmate_subtract_working_days(v_work.launch_date, 7) then
      jsonb_build_object(
        'code', 'review_buffer_risk',
        'severity', 'warning',
        'message', 'Asset First Draft Due violates the fixed T-7 deadline before Launch.'
      ) end),
    (9, case when v_needs_split then
      jsonb_build_object(
        'code', 'needs_split',
        'severity', 'warning',
        'message', 'This request still needs to be split for execution tracking.'
      ) end)
  ) as w(position, warning)
  where w.warning is not null;

  v_reason := 'Auto best-fit: ' || v_owner_name || ' (' || v_owner_code || ')'
    || '; warnings=' || v_warnings::text;
  v_snapshot := jsonb_build_object(
    'warnings', v_warnings,
    'owner_member_id', v_owner_id,
    'owner_code', v_owner_code,
    'required_skills', to_jsonb(array_remove(array[v_required_skill, v_required_skill_2], null)),
    'skill_rank', v_skill_rank,
    'availability', v_availability,
    'active_leave_bucket_count', v_leave_bucket_count,
    'full_leave_bucket_count', v_full_leave_bucket_count,
    'window_bucket_count', v_window_bucket_count,
    'window_start', v_start,
    'window_end', v_end,
    'window_capacity', v_window_capacity,
    'allocated_points_before', v_allocated_points,
    'projected_load_ratio', v_projected_ratio,
    'active_wip', v_wip_now,
    'wip_limit', v_wip_limit,
    'overdue_count', v_overdue_count
  );

  update public.work_items
  set status = 'assigned',
      effort_point = v_effort,
      final_owner_member_id = v_owner_id,
      assignment_reason = v_reason,
      needs_split = v_needs_split,
      wip_counted = false,
      updated_at = now()
  where id = p_work_item_id;

  perform public.flowmate_hybrid_rebuild_allocation(p_work_item_id, v_owner_id);

  insert into public.assignment_runs (
    work_item_id, triggered_by, suggested_owner_member_id,
    final_owner_member_id, result, reason, effort_point,
    raw_range_min, raw_range_max, was_capped, capacity_snapshot
  ) values (
    p_work_item_id, p_trigger, v_owner_id,
    v_owner_id, 'assigned', v_reason, v_effort,
    v_effort, v_effort, false, v_snapshot
  );

  insert into public.work_item_events (
    work_item_id, event_type, from_status, to_status, metadata
  ) values (
    p_work_item_id, 'assignment_ran', v_from_status, 'assigned',
    jsonb_build_object(
      'result', 'assigned',
      'owner_member_id', v_owner_id,
      'owner_user_id', v_owner_user_id,
      'owner_code', v_owner_code,
      'effort', v_effort,
      'trigger', p_trigger::text,
      'warnings', v_warnings
    )
  );

  return jsonb_build_object(
    'result', 'assigned',
    'owner_member_id', v_owner_id,
    'owner_user_id', v_owner_user_id,
    'owner_code', v_owner_code,
    'effort', v_effort,
    'reason', v_reason,
    'warnings', v_warnings
  );
end;
$assignment$;

revoke all on function public.flowmate_run_assignment(uuid, public.assignment_trigger)
  from public, anon, authenticated;

-- Deprecated compatibility surface. Existing status-transition RPCs may still
-- invoke this as the function owner, but it never scans or mutates queued work.
create or replace function public.flowmate_rerun_queued_creative_requests(
  p_limit integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = public
as $queue_compat$
begin
  return jsonb_build_object(
    'deprecated', true,
    'no_op', true,
    'checked', 0,
    'assigned', 0,
    'requested_limit', p_limit
  );
end;
$queue_compat$;

revoke all on function public.flowmate_rerun_queued_creative_requests(integer)
  from public, anon, authenticated;

drop function if exists public.flowmate_change_creative_assignee(uuid, text, uuid, text);

create or replace function public.flowmate_change_creative_assignee(
  p_display_id text,
  p_target_member_id uuid default null,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $change_assignee$
declare
  v_actor_id uuid := auth.uid();
  v_work public.work_items%rowtype;
  v_detail public.creative_request_details%rowtype;
  v_target public.team_members%rowtype;
  v_old_member_id uuid;
  v_next_status public.work_status;
  v_assignment_result public.assignment_result;
  v_is_admin boolean := false;
  v_is_requester boolean := false;
  v_is_self_gdve boolean := false;
  v_allocation_total numeric := 0;
  v_today date := timezone('Asia/Bangkok', now())::date;
  v_now_bkk timestamp := timezone('Asia/Bangkok', now());
  v_start date;
  v_start_half text := 'am';
  v_end date;
  v_required_skill text;
  v_required_skill_2 text;
  v_skill_rank integer;
  v_window_capacity numeric := 0;
  v_allocated_points numeric := 0;
  v_wip_now integer := 0;
  v_wip_limit integer := 0;
  v_availability text;
  v_leave_bucket_count integer := 0;
  v_full_leave_bucket_count integer := 0;
  v_window_bucket_count integer := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_assignment_reason text;
  v_needs_split boolean;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Assignment reason is required';
  end if;
  if not exists (
    select 1 from public.users u where u.id = v_actor_id and u.is_active = true
  ) then
    raise exception 'Actor user is inactive or not found' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('flowmate_assignment_engine'));

  select * into v_work
  from public.work_items
  where display_id = p_display_id
    and archived_at is null
  for update;

  if v_work.id is null then
    raise exception 'Creative request not found';
  end if;
  if v_work.work_type <> 'creative_request' then
    raise exception 'Assignee changes are only allowed for creative requests';
  end if;
  if v_work.status not in ('unassigned', 'assigned', 'in_progress', 'review', 'blocked') then
    raise exception 'Creative request status % cannot be reassigned', v_work.status;
  end if;

  select exists (
    select 1 from public.users u
    where u.id = v_actor_id and u.is_active = true and u.role = 'admin'
  ) into v_is_admin;
  v_is_requester := v_work.requester_user_id = v_actor_id;
  v_old_member_id := v_work.final_owner_member_id;
  v_needs_split := coalesce(v_work.needs_split, false);

  if v_work.effort_point is null or v_work.effort_point <= 0 then
    raise exception 'Creative request effort must be positive before changing assignee';
  end if;

  if extract(isodow from v_today) not between 1 and 5 then
    v_start := public.flowmate_next_working_day(v_today);
  elsif v_now_bkk::time >= time '15:00' then
    v_start := public.flowmate_next_working_day(v_today + 1);
  elsif v_now_bkk::time >= time '12:00' then
    v_start := public.flowmate_next_working_day(v_today);
    v_start_half := 'pm';
  else
    v_start := public.flowmate_next_working_day(v_today);
  end if;
  v_end := greatest(v_start, coalesce(v_work.due_date, v_start));

  if p_target_member_id is null then
    if not (v_is_admin or v_is_requester) then
      raise exception 'Only requester or admin may clear an assignee'
        using errcode = '42501';
    end if;

    v_next_status := 'unassigned';
    v_assignment_result := 'unassigned';
    v_warnings := case when v_needs_split then
      jsonb_build_array(jsonb_build_object(
        'code', 'needs_split',
        'severity', 'warning',
        'message', 'This request still needs to be split for execution tracking.'
      ))
      else '[]'::jsonb
    end;
  else
    select tm.* into v_target
    from public.team_members tm
    join public.users linked_user
      on linked_user.id = tm.user_id
     and linked_user.is_active = true
    where tm.id = p_target_member_id
      and tm.active = true
      and public.flowmate_is_gdve_member_code(tm.member_code);

    if v_target.id is null then
      raise exception 'Target must be an active linked GD/VE member';
    end if;
    if v_work.final_owner_member_id = v_target.id then
      raise exception 'Creative request is already assigned to this member';
    end if;

    v_is_self_gdve := v_target.user_id = v_actor_id
      and v_work.status = 'unassigned';
    if not (v_is_admin or v_is_requester or v_is_self_gdve) then
      raise exception 'Only requester/admin may reassign; active GD/VE may self-assign only Unassigned work'
        using errcode = '42501';
    end if;

    select * into v_detail
    from public.creative_request_details details
    where details.work_item_id = v_work.id;

    v_required_skill := public.flowmate_normalize_creative_skill(
      v_detail.asset_type,
      v_detail.asset_subtype
    );
    v_required_skill_2 := case
      when nullif(trim(coalesce(v_detail.asset_subtype_2, '')), '') is null then null
      else public.flowmate_normalize_creative_skill(
        v_detail.asset_type_2,
        v_detail.asset_subtype_2
      )
    end;
    v_skill_rank := case
      when v_required_skill_2 is null
        and v_required_skill = any(coalesce(v_target.skills, '{}'::text[])) then 0
      when v_required_skill_2 is not null
        and v_required_skill = any(coalesce(v_target.skills, '{}'::text[]))
        and v_required_skill_2 = any(coalesce(v_target.skills, '{}'::text[])) then 0
      when v_required_skill_2 is not null
        and (
          v_required_skill = any(coalesce(v_target.skills, '{}'::text[]))
          or v_required_skill_2 = any(coalesce(v_target.skills, '{}'::text[]))
        ) then 1
      when v_required_skill = any(
        coalesce(v_target.skills, '{}'::text[]) || coalesce(v_target.backup_skills, '{}'::text[])
      ) and (
        v_required_skill_2 is null
        or v_required_skill_2 = any(
          coalesce(v_target.skills, '{}'::text[]) || coalesce(v_target.backup_skills, '{}'::text[])
        )
      ) then 2
      else 3
    end;

    with buckets as (
      select g.d::date as bucket_date, halves.bucket_half
      from generate_series(v_start, v_end, interval '1 day') as g(d)
      cross join (values ('am'::text), ('pm'::text)) as halves(bucket_half)
      where extract(isodow from g.d) between 1 and 5
        and (g.d::date > v_start or v_start_half = 'am' or halves.bucket_half = 'pm')
    ), bucket_metrics as (
      select
        b.bucket_date,
        b.bucket_half,
        public.flowmate_leave_fraction_for_bucket(
          v_target.id, b.bucket_date, b.bucket_half
        ) as leave_fraction,
        exists (
          select 1
          from public.leave_requests active_leave
          where active_leave.team_member_id = v_target.id
            and active_leave.cancelled_at is null
            and active_leave.start_date <= b.bucket_date
            and active_leave.end_date >= b.bucket_date
        ) as has_active_leave_request
      from buckets b
    )
    select
      coalesce(sum(greatest(
        0::numeric,
        (case
          when v_target.availability = 'leave' then 0::numeric
          when v_target.availability = 'partial' then coalesce(v_target.capacity_override_per_day, 0)
          else v_target.capacity_per_day
        end / 2) * (1 - bm.leave_fraction)
      )), 0),
      coalesce((
        select sum(a.capacity_point)
        from public.flowmate_capacity_allocations a
        join public.work_items allocated_wi on allocated_wi.id = a.work_item_id
        where a.team_member_id = v_target.id
          and a.work_item_id <> v_work.id
          and a.bucket_date between v_start and v_end
          and allocated_wi.work_type = 'creative_request'
          and allocated_wi.status in ('assigned', 'in_progress', 'review', 'blocked')
      ), 0),
      coalesce((
        select count(*)
        from public.work_items wip_wi
        where wip_wi.final_owner_member_id = v_target.id
          and wip_wi.id <> v_work.id
          and wip_wi.status = 'in_progress'
          and wip_wi.wip_counted = true
      ), 0)::integer,
      count(*) filter (where bm.has_active_leave_request and bm.leave_fraction > 0)::integer,
      count(*) filter (where bm.has_active_leave_request and bm.leave_fraction >= 1)::integer,
      count(*)::integer
    into
      v_window_capacity,
      v_allocated_points,
      v_wip_now,
      v_leave_bucket_count,
      v_full_leave_bucket_count,
      v_window_bucket_count
    from bucket_metrics bm;

    v_wip_limit := v_target.wip_limit;
    v_availability := v_target.availability::text;

    select coalesce(jsonb_agg(w.warning order by w.position), '[]'::jsonb)
    into v_warnings
    from (values
      (1, case when v_skill_rank in (1, 3) then jsonb_build_object(
        'code', 'skill_mismatch', 'severity', 'warning',
        'message', 'The selected member does not have every requested primary skill.'
      ) end),
      (2, case when v_skill_rank = 2 then jsonb_build_object(
        'code', 'backup_skill', 'severity', 'info',
        'message', 'At least one requested skill uses backup skill configuration.'
      ) end),
      (3, case when v_availability = 'partial'
                    or (v_leave_bucket_count > 0 and v_full_leave_bucket_count = 0)
        then jsonb_build_object(
          'code', 'member_partial', 'severity', 'warning',
          'message', 'The selected member has partial availability in the production window.'
        ) end),
      (4, case when v_availability = 'leave' or v_full_leave_bucket_count > 0
        then jsonb_build_object(
          'code', 'member_on_leave', 'severity', 'critical',
          'message', 'The selected member has active leave overlapping the production window.'
        ) end),
      (5, case when v_wip_now >= v_wip_limit then jsonb_build_object(
        'code', 'wip_exceeded', 'severity', 'warning',
        'message', 'Current WIP is at or above the selected member limit.'
      ) end),
      (6, case when v_allocated_points + v_work.effort_point > v_window_capacity
        then jsonb_build_object(
          'code', 'over_capacity', 'severity', 'critical',
          'message', 'Projected points exceed nominal capacity through 1st Draft.'
        ) end),
      (7, case when v_work.due_date < v_start
                    or v_work.effort_point > v_window_capacity
        then jsonb_build_object(
          'code', 'deadline_capacity_gap', 'severity', 'critical',
          'message', 'Nominal capacity cannot cover effort by 1st Draft.'
        ) end),
      (8, case when v_work.work_type = 'creative_request'
                    and v_work.launch_date is not null
                    and v_work.due_date > public.flowmate_subtract_working_days(v_work.launch_date, 7)
        then jsonb_build_object(
          'code', 'review_buffer_risk', 'severity', 'warning',
          'message', 'Asset First Draft Due violates the fixed T-7 deadline before Launch.'
        ) end),
      (9, case when v_needs_split then jsonb_build_object(
        'code', 'needs_split', 'severity', 'warning',
        'message', 'This request still needs to be split for execution tracking.'
      ) end)
    ) as w(position, warning)
    where w.warning is not null;

    v_next_status := case when v_work.status = 'unassigned' then 'assigned' else v_work.status end;
    v_assignment_result := 'assigned';
  end if;

  v_assignment_reason := 'Manual assignment: ' || trim(p_reason)
    || '; warnings=' || v_warnings::text;

  update public.work_items
  set final_owner_member_id = p_target_member_id,
      status = v_next_status,
      assignment_reason = v_assignment_reason,
      wip_counted = case when v_next_status = 'in_progress' then wip_counted else false end,
      updated_at = now()
  where id = v_work.id;

  if p_target_member_id is not null
     and v_next_status in ('assigned', 'in_progress', 'review', 'blocked') then
    v_allocation_total := public.flowmate_hybrid_rebuild_allocation(v_work.id, v_target.id);
  else
    delete from public.flowmate_capacity_allocations
    where work_item_id = v_work.id;
  end if;

  insert into public.assignment_runs (
    work_item_id,
    triggered_by,
    suggested_owner_member_id,
    final_owner_member_id,
    result,
    reason,
    effort_point,
    raw_range_min,
    raw_range_max,
    was_capped,
    capacity_snapshot
  ) values (
    v_work.id,
    'rerun',
    p_target_member_id,
    p_target_member_id,
    v_assignment_result,
    v_assignment_reason,
    v_work.effort_point,
    v_work.effort_point,
    v_work.effort_point,
    false,
    jsonb_build_object(
      'source', 'manual_assignment_rpc',
      'actor_user_id', v_actor_id,
      'old_member_id', v_old_member_id,
      'new_member_id', p_target_member_id,
      'warnings', v_warnings,
      'window_start', v_start,
      'window_end', v_end,
      'window_capacity', v_window_capacity,
      'allocated_points_before', v_allocated_points,
      'active_wip', v_wip_now,
      'wip_limit', v_wip_limit,
      'active_leave_bucket_count', v_leave_bucket_count,
      'full_leave_bucket_count', v_full_leave_bucket_count,
      'window_bucket_count', v_window_bucket_count
    )
  );

  insert into public.work_item_events (
    work_item_id, actor_user_id, event_type, from_status, to_status, metadata
  ) values (
    v_work.id, v_actor_id, 'updated', v_work.status, v_next_status,
    jsonb_build_object(
      'action', 'assignee_changed',
      'reason', trim(p_reason),
      'old_member_id', v_old_member_id,
      'new_member_id', p_target_member_id,
      'new_member_code', v_target.member_code,
      'allocation_total', v_allocation_total,
      'warnings', v_warnings,
      'assignment_run_result', v_assignment_result
    )
  );

  return jsonb_build_object(
    'display_id', v_work.display_id,
    'status', v_next_status,
    'owner_member_id', p_target_member_id,
    'owner_user_id', v_target.user_id,
    'owner_code', v_target.member_code,
    'allocation_total', v_allocation_total,
    'reason', trim(p_reason),
    'warnings', v_warnings
  );
end;
$change_assignee$;

revoke all on function public.flowmate_change_creative_assignee(text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.flowmate_change_creative_assignee(text, uuid, text)
  to authenticated;

drop function if exists public.flowmate_reschedule_capacity_allocation(uuid, text, jsonb, text);

create or replace function public.flowmate_reschedule_capacity_allocation(
  p_display_id text,
  p_allocations jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $reschedule$
declare
  v_actor_id uuid := auth.uid();
  v_work public.work_items%rowtype;
  v_owner_user_id uuid;
  v_is_admin boolean := false;
  v_today date := timezone('Asia/Bangkok', now())::date;
  v_now_bkk timestamp := timezone('Asia/Bangkok', now());
  v_snapshot_window_start text;
  v_window_start date;
  v_window_end date;
  v_total numeric;
  v_count integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.users u where u.id = v_actor_id and u.is_active = true
  ) then
    raise exception 'Actor user is inactive or not found' using errcode = '42501';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'Allocations must be a non-empty JSON array';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_allocations) item
    where jsonb_typeof(item) <> 'object'
      or not (item ? 'bucket_date' and item ? 'bucket_half' and item ? 'capacity_point')
      or jsonb_typeof(item -> 'bucket_date') <> 'string'
      or jsonb_typeof(item -> 'bucket_half') <> 'string'
      or jsonb_typeof(item -> 'capacity_point') <> 'number'
  ) then
    raise exception 'Each allocation requires bucket_date, bucket_half, and numeric capacity_point';
  end if;

  select * into v_work
  from public.work_items
  where display_id = p_display_id
    and archived_at is null
  for update;

  if v_work.id is null or v_work.work_type <> 'creative_request' then
    raise exception 'Creative request not found';
  end if;
  if v_work.status not in ('assigned', 'in_progress', 'review', 'blocked')
     or v_work.final_owner_member_id is null then
    raise exception 'Only capacity-counted assigned work can be rescheduled';
  end if;

  select tm.user_id into v_owner_user_id
  from public.team_members tm
  where tm.id = v_work.final_owner_member_id;
  select exists (
    select 1 from public.users u
    where u.id = v_actor_id and u.is_active = true and u.role = 'admin'
  ) into v_is_admin;

  if not (
    v_actor_id = v_owner_user_id
    or v_actor_id = v_work.requester_user_id
    or v_is_admin
  ) then
    raise exception 'Only owner, requester, or admin may reschedule capacity'
      using errcode = '42501';
  end if;

  select assignment.capacity_snapshot ->> 'window_start'
    into v_snapshot_window_start
  from public.assignment_runs assignment
  where assignment.work_item_id = v_work.id
  order by assignment.ran_at desc, assignment.id desc
  limit 1;

  if v_snapshot_window_start ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
    begin
      v_window_start := v_snapshot_window_start::date;
      if to_char(v_window_start, 'YYYY-MM-DD') <> v_snapshot_window_start then
        v_window_start := null;
      end if;
    exception when others then
      v_window_start := null;
    end;
  end if;

  if v_window_start is null then
    if extract(isodow from v_today) not between 1 and 5 then
      v_window_start := public.flowmate_next_working_day(v_today);
    elsif v_now_bkk::time >= time '15:00' then
      v_window_start := public.flowmate_next_working_day(v_today + 1);
    else
      v_window_start := public.flowmate_next_working_day(v_today);
    end if;
  end if;

  v_window_end := greatest(
    v_window_start,
    coalesce(v_work.due_date, v_window_start)
  );

  begin
    with parsed_allocations as (
      select
        x.bucket_date,
        lower(x.bucket_half) as bucket_half,
        x.capacity_point
      from jsonb_to_recordset(p_allocations) as x(
        bucket_date date,
        bucket_half text,
        capacity_point numeric
      )
    )
    select count(*), coalesce(sum(parsed.capacity_point), 0)
      into v_count, v_total
    from parsed_allocations parsed;
  exception when others then
    raise exception 'Allocation JSON contains an invalid date or number';
  end;

  if v_count <> jsonb_array_length(p_allocations) then
    raise exception 'Allocation JSON could not be parsed completely';
  end if;
  if exists (
    with parsed_allocations as (
      select lower(x.bucket_half) as bucket_half, x.capacity_point
      from jsonb_to_recordset(p_allocations) as x(
        bucket_date date,
        bucket_half text,
        capacity_point numeric
      )
    )
    select 1 from parsed_allocations parsed
    where parsed.bucket_half not in ('am', 'pm') or parsed.capacity_point <= 0
  ) then
    raise exception 'Allocation half must be am/pm and capacity_point must be greater than zero';
  end if;
  if exists (
    with parsed_allocations as (
      select x.bucket_date, lower(x.bucket_half) as bucket_half
      from jsonb_to_recordset(p_allocations) as x(
        bucket_date date,
        bucket_half text,
        capacity_point numeric
      )
    )
    select parsed.bucket_date, parsed.bucket_half
    from parsed_allocations parsed
    group by parsed.bucket_date, parsed.bucket_half
    having count(*) > 1
  ) then
    raise exception 'Allocation bucket_date/bucket_half pairs must be unique';
  end if;
  if exists (
    with parsed_allocations as (
      select x.bucket_date
      from jsonb_to_recordset(p_allocations) as x(
        bucket_date date,
        bucket_half text,
        capacity_point numeric
      )
    )
    select 1 from parsed_allocations parsed
    where extract(isodow from parsed.bucket_date) not between 1 and 5
  ) then
    raise exception 'Allocation dates must be working days (Monday-Friday)';
  end if;
  if exists (
    with parsed_allocations as (
      select x.bucket_date
      from jsonb_to_recordset(p_allocations) as x(
        bucket_date date,
        bucket_half text,
        capacity_point numeric
      )
    )
    select 1 from parsed_allocations parsed
    where parsed.bucket_date < v_window_start or parsed.bucket_date > v_window_end
  ) then
    raise exception 'Allocation dates must stay inside the production window';
  end if;
  if v_total <> v_work.effort_point::numeric then
    raise exception 'Allocation total % must equal effort %', v_total, v_work.effort_point;
  end if;

  delete from public.flowmate_capacity_allocations
  where work_item_id = v_work.id;

  insert into public.flowmate_capacity_allocations (
    work_item_id, team_member_id, bucket_date, bucket_half, capacity_point
  )
  with parsed_allocations as (
    select
      x.bucket_date,
      lower(x.bucket_half) as bucket_half,
      x.capacity_point
    from jsonb_to_recordset(p_allocations) as x(
      bucket_date date,
      bucket_half text,
      capacity_point numeric
    )
  )
  select
    v_work.id,
    v_work.final_owner_member_id,
    parsed.bucket_date,
    parsed.bucket_half,
    parsed.capacity_point
  from parsed_allocations parsed;

  insert into public.work_item_events (
    work_item_id, actor_user_id, event_type, from_status, to_status, metadata
  ) values (
    v_work.id, v_actor_id, 'capacity_changed', v_work.status, v_work.status,
    jsonb_build_object(
      'action', 'capacity_changed',
      'reason', 'Manual capacity reschedule',
      'allocation_total', v_total,
      'allocation_count', v_count,
      'window_start', v_window_start,
      'window_end', v_window_end
    )
  );

  return jsonb_build_object(
    'display_id', v_work.display_id,
    'allocation_total', v_total,
    'allocation_count', v_count,
    'effort', v_work.effort_point,
    'status', v_work.status
  );
end;
$reschedule$;

revoke all on function public.flowmate_reschedule_capacity_allocation(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.flowmate_reschedule_capacity_allocation(text, jsonb)
  to authenticated;

select pg_notify('pgrst', 'reload schema');

commit;
