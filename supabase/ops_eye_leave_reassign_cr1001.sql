-- One-off production operation:
-- 1) Record Eye as on full-day leave from 2026-07-07 through 2026-07-20.
-- 2) If CR-1001 is currently assigned to Eye and still safe to reassign,
--    return it to the queue and rerun the assignment engine.
--    If CR-1001 is already cancelled or delivered, leave is recorded and
--    reassignment is skipped.
--
-- Safe to rerun: the leave insert is skipped when a covering active leave
-- already exists. CR-1001 is only touched when its current owner is Eye.

begin;

do $$
declare
  v_eye_id uuid;
  v_actor_id uuid;
  v_work public.work_items%rowtype;
  v_old_status public.work_status;
  v_assignment jsonb;
begin
  select tm.id
    into v_eye_id
    from public.team_members tm
   where lower(tm.member_code) = 'eye'
      or lower(tm.display_name) = 'eye'
   order by case when lower(tm.member_code) = 'eye' then 0 else 1 end
   limit 1;

  if v_eye_id is null then
    raise exception 'Eye team member was not found';
  end if;

  select u.id
    into v_actor_id
    from public.users u
   where lower(u.email) = 'panuwee.w@garena.com'
     and u.is_active = true
   limit 1;

  if v_actor_id is null then
    select u.id
      into v_actor_id
      from public.users u
     where u.role = 'admin'
       and u.is_active = true
     order by u.email
     limit 1;
  end if;

  if v_actor_id is null then
    raise exception 'No active admin user found for leave created_by_user_id';
  end if;

  if not exists (
    select 1
      from public.leave_requests lr
     where lr.team_member_id = v_eye_id
       and lr.cancelled_at is null
       and lr.start_date <= date '2026-07-07'
       and lr.end_date >= date '2026-07-20'
  ) then
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
      v_eye_id,
      v_actor_id,
      date '2026-07-07',
      date '2026-07-20',
      'am',
      'pm',
      'Production leave: Eye away from 2026-07-07 through 2026-07-20'
    );
  end if;

  select *
    into v_work
    from public.work_items
   where display_id = 'CR-1001'
   for update;

  if v_work.id is null then
    raise exception 'CR-1001 was not found';
  end if;

  if v_work.work_type <> 'creative_request' then
    raise exception 'CR-1001 is not a creative request';
  end if;

  if v_work.status in ('cancelled', 'delivered') then
    raise notice 'CR-1001 is %, so reassignment is skipped. Leave was recorded.', v_work.status;
    return;
  end if;

  if v_work.final_owner_member_id is distinct from v_eye_id then
    raise notice 'CR-1001 is not currently assigned to Eye. Leave was recorded; reassignment skipped.';
    return;
  end if;

  if v_work.status not in ('assigned', 'queued', 'need_brief') then
    raise exception 'CR-1001 status is %, not safe for automatic reassignment. Move it manually if needed.', v_work.status;
  end if;

  v_old_status := v_work.status;

  update public.work_items
     set status = 'queued',
         final_owner_member_id = null,
         assignment_reason = 'Queued for reassignment because Eye is on leave from Jul 7 to Jul 20, 2026.',
         updated_at = now()
   where id = v_work.id;

  insert into public.work_item_events (
    work_item_id,
    actor_user_id,
    event_type,
    from_status,
    to_status,
    metadata
  )
  values (
    v_work.id,
    v_actor_id,
    'updated',
    v_old_status,
    'queued',
    jsonb_build_object(
      'source', 'ops_sql',
      'action', 'eye_leave_reassign',
      'leave_start', '2026-07-07',
      'leave_end', '2026-07-20',
      'previous_owner_member_id', v_eye_id
    )
  );

  v_assignment := public.flowmate_run_assignment(v_work.id, 'rerun');

  raise notice 'CR-1001 assignment result: %', v_assignment;
end $$;

commit;

select
  lr.start_date,
  lr.end_date,
  lr.start_half,
  lr.end_half,
  lr.reason,
  lr.cancelled_at
from public.leave_requests lr
join public.team_members tm on tm.id = lr.team_member_id
where lower(tm.member_code) = 'eye'
  and lr.start_date <= date '2026-07-20'
  and lr.end_date >= date '2026-07-07'
order by lr.created_at desc;

select
  wi.display_id,
  wi.status,
  coalesce(owner.display_name, 'Unassigned') as owner,
  wi.assignment_reason,
  wi.updated_at
from public.work_items wi
left join public.team_members owner on owner.id = wi.final_owner_member_id
where wi.display_id = 'CR-1001';
