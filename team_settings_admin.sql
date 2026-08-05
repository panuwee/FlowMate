-- FlowMate MVP 1.2 Chat H: admin-safe Team settings member updates.
-- Run after view_security_hardening.sql so auth helpers and view grants are in place.

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

alter table public.leave_requests
  drop constraint if exists leave_requests_start_half_check,
  drop constraint if exists leave_requests_end_half_check,
  drop constraint if exists leave_requests_same_day_half_order;

alter table public.leave_requests
  add constraint leave_requests_start_half_check check (start_half in ('am', 'pm')),
  add constraint leave_requests_end_half_check check (end_half in ('am', 'pm')),
  add constraint leave_requests_same_day_half_order check (
    start_date <> end_date or start_half <= end_half
  );

create index if not exists idx_leave_requests_member_dates
on public.leave_requests(team_member_id, start_date, end_date)
where cancelled_at is null;

drop trigger if exists leave_requests_set_updated_at on public.leave_requests;
create trigger leave_requests_set_updated_at
before update on public.leave_requests
for each row execute function public.set_updated_at();

alter table public.leave_requests enable row level security;

drop policy if exists "active users can read leave requests" on public.leave_requests;
create policy "active users can read leave requests"
on public.leave_requests for select
using (public.is_active_app_user());

revoke insert, update, delete on public.leave_requests from anon, authenticated;
revoke insert, update, delete on public.team_members from anon, authenticated;

alter table if exists public.notifications
  drop constraint if exists notifications_type_check;

alter table if exists public.notifications
  add constraint notifications_type_check check (
    type in (
      'assigned',
      'status_changed',
      'review_requested',
      'approved',
      'changes_requested',
      'blocked',
      'resumed',
      'cancelled',
      'due_soon',
      'overdue',
      'comment_created',
      'mentioned_in_comment',
      'link_added',
      'watcher_added',
      'leave_overlap'
    )
  );

drop function if exists public.create_leave_request(date, date, text);
drop function if exists public.create_leave_request(date, date, text, text, text);

create or replace function public.create_leave_request(
  p_start_date date,
  p_end_date date,
  p_start_half text default 'am',
  p_end_half text default 'pm',
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_member public.team_members%rowtype;
  v_leave public.leave_requests%rowtype;
  v_target_work public.work_items%rowtype;
  v_leave_recipient_id uuid;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if p_start_date is null or p_end_date is null then
    raise exception 'Leave start and end dates are required'
      using errcode = '22023';
  end if;

  if p_end_date < p_start_date then
    raise exception 'Leave end date must be on or after start date'
      using errcode = '22023';
  end if;

  p_start_half := lower(trim(coalesce(p_start_half, 'am')));
  p_end_half := lower(trim(coalesce(p_end_half, 'pm')));

  if p_start_half not in ('am', 'pm') then
    raise exception 'Leave start half must be AM or PM'
      using errcode = '22023';
  end if;

  if p_end_half not in ('am', 'pm') then
    raise exception 'Leave end half must be AM or PM'
      using errcode = '22023';
  end if;

  if p_start_date = p_end_date and p_start_half > p_end_half then
    raise exception 'For same-day leave, start half must be AM before PM'
      using errcode = '22023';
  end if;

  select *
    into v_member
    from public.team_members tm
   where tm.user_id = v_actor_id
     and tm.active = true
   limit 1;

  if v_member.id is null then
    raise exception 'Signed-in user is not linked to an active team member'
      using errcode = '42501';
  end if;

  insert into public.leave_requests (
    team_member_id,
    created_by_user_id,
    start_date,
    end_date,
    start_half,
    end_half,
    reason
  )
  values (
    v_member.id,
    v_actor_id,
    p_start_date,
    p_end_date,
    p_start_half,
    p_end_half,
    nullif(trim(coalesce(p_reason, '')), '')
  )
  returning * into v_leave;

  if lower(v_member.member_code) = any (array['pond','jo','tong','eye','vee','ploy']) then
    for v_target_work in
      select *
        from public.work_items wi
       where wi.final_owner_member_id = v_member.id
         and wi.status not in ('delivered', 'cancelled')
         and wi.due_date between p_start_date and p_end_date
    loop
      for v_leave_recipient_id in
        select distinct recipient_id
        from (
          select v_target_work.requester_user_id as recipient_id
          union all
          select wiw.watcher_user_id
          from public.work_item_watchers wiw
          where wiw.work_item_id = v_target_work.id
            and wiw.removed_at is null
        ) recipients
        where recipient_id is not null
          and recipient_id <> v_actor_id
      loop
        perform public.flowmate_create_notification(
          v_leave_recipient_id,
          'leave_overlap',
          'Leave may affect ' || v_target_work.display_id,
          v_member.display_name || ' is on leave ' || upper(p_start_half) || ' ' || p_start_date::text || ' to ' || upper(p_end_half) || ' ' || p_end_date::text,
          v_target_work.id,
          v_actor_id,
          null,
          jsonb_build_object(
            'leave_request_id', v_leave.id,
            'team_member_id', v_member.id,
            'team_member_name', v_member.display_name,
            'start_date', p_start_date,
            'end_date', p_end_date,
            'start_half', p_start_half,
            'end_half', p_end_half,
            'display_id', v_target_work.display_id,
            'due_date', v_target_work.due_date
          ),
          'leave:' || v_leave.id::text || ':work:' || v_target_work.id::text || ':recipient:' || v_leave_recipient_id::text
        );
      end loop;
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_leave.id,
    'team_member_id', v_leave.team_member_id,
    'start_date', v_leave.start_date,
    'end_date', v_leave.end_date,
    'start_half', v_leave.start_half,
    'end_half', v_leave.end_half,
    'reason', v_leave.reason
  );
end;
$$;

revoke all on function public.create_leave_request(date, date, text, text, text) from public, anon, authenticated;
grant execute on function public.create_leave_request(date, date, text, text, text) to authenticated;

update public.team_members
   set availability = 'available',
       capacity_override_per_day = null,
       updated_at = now()
 where lower(member_code) = 'tong';

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

drop function if exists public.flowmate_admin_update_team_member(
  uuid, public.availability_status, numeric, numeric, integer
);
drop function if exists public.flowmate_admin_update_team_member(
  uuid, numeric, integer
);
drop function if exists public.flowmate_admin_update_team_member(
  uuid, numeric, integer, public.asset_type[], public.asset_type[]
);
drop function if exists public.flowmate_admin_update_team_member(
  uuid, numeric, integer, text[], text[]
);

create or replace function public.flowmate_admin_update_team_member(
  p_team_member_id uuid,
  p_capacity_per_day numeric,
  p_wip_limit integer default 3,
  p_skills text[] default null,
  p_backup_skills text[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_member public.team_members%rowtype;
  v_next_skills text[];
  v_next_backup_skills text[];
  v_allowed_skills text[] := array[
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
  ];
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not public.is_admin_app_user() then
    raise exception 'Only FlowMate admins can update team settings'
      using errcode = '42501';
  end if;

  if p_team_member_id is null then
    raise exception 'Team member ID is required'
      using errcode = '22023';
  end if;

  if p_capacity_per_day is null or p_capacity_per_day < 0 or p_capacity_per_day > 24 then
    raise exception 'capacity_per_day must be from 0 to 24'
      using errcode = '22023';
  end if;

  if p_wip_limit is null or p_wip_limit < 0 or p_wip_limit > 20 then
    raise exception 'wip_limit must be from 0 to 20'
      using errcode = '22023';
  end if;

  select * into v_member
  from public.team_members
  where id = p_team_member_id
    and lower(member_code) = any (array['pond','jo','tong','eye','vee','ploy'])
  for update;

  if v_member.id is null then
    raise exception 'Team member not found or not editable from Team settings'
      using errcode = 'P0002';
  end if;

  v_next_skills := coalesce(p_skills, v_member.skills);
  v_next_backup_skills := coalesce(p_backup_skills, v_member.backup_skills);

  if array_length(v_next_skills, 1) is null then
    raise exception 'skills must include at least one normal skill'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_next_skills) as selected(skill)
    where selected.skill <> all (v_allowed_skills)
  ) then
    raise exception 'Unsupported team member skill'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(v_next_backup_skills) as selected(skill)
    where selected.skill <> all (v_allowed_skills)
  ) then
    raise exception 'Unsupported team member backup skill'
      using errcode = '22023';
  end if;

  update public.team_members
     set capacity_per_day = p_capacity_per_day,
         wip_limit = p_wip_limit,
         skills = v_next_skills,
         backup_skills = v_next_backup_skills,
         updated_at = now()
   where id = v_member.id
   returning * into v_member;

  return jsonb_build_object(
    'id', v_member.id,
    'display_name', v_member.display_name,
    'availability', v_member.availability,
    'capacity_per_day', v_member.capacity_per_day,
    'wip_limit', v_member.wip_limit,
    'skills', v_member.skills,
    'backup_skills', v_member.backup_skills,
    'updated_by_user_id', v_actor_id
  );
end;
$$;

revoke all on function public.flowmate_admin_update_team_member(
  uuid, numeric, integer, text[], text[]
) from public, anon, authenticated;
grant execute on function public.flowmate_admin_update_team_member(
  uuid, numeric, integer, text[], text[]
) to authenticated;
