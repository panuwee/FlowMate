CREATE OR REPLACE FUNCTION public.flowmate_hybrid_rebuild_allocation(p_work_item_id uuid, p_team_member_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
