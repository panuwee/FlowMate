-- Targeted production installer for the FlowMate Board Urgent WIP override.
-- Run after rpc_quick_task.sql and the Marketing Plan collaboration installers.

create or replace function public.transition_creative_work_status(
  p_actor_user_id uuid,
  p_display_id text,
  p_next_status public.work_status,
  p_delivery_link text default null,
  p_blocked_reason text default null,
  p_cancel_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_work public.work_items%rowtype;
  v_owner_user_id uuid;
  v_marketing_sub_pic boolean := false;
  v_from_status public.work_status;
  v_wip_now int;
  v_wip_limit int;
  v_wip_override boolean := false;
begin
  v_actor_id := public.flowmate_actor_user_id();
  perform public.flowmate_assert_actor_matches(p_actor_user_id, v_actor_id);
  select * into v_actor from public.users where id = v_actor_id;

  if v_actor.id is null or v_actor.is_active = false then
    raise exception 'Actor user is inactive or not found';
  end if;

  select *
  into v_work
  from public.work_items
  where display_id = p_display_id
  for update;

  if v_work.id is null then
    raise exception 'Work item not found';
  end if;

  if v_work.work_type <> 'creative_request' then
    raise exception 'This transition is only for creative requests';
  end if;

  select exists (
    select 1
    from public.marketing_content_items mci
    where (mci.flowmate_work_item_id = v_work.id
      or substring(mci.brief_link from '#detail/([^/?#]+)') = v_work.display_id)
      and mci.sub_pic_user_id = v_actor_id
  ) into v_marketing_sub_pic;

  select user_id
  into v_owner_user_id
  from public.team_members
  where id = v_work.final_owner_member_id;

  -- Owner WIP snapshot used by the review-round + blocked-resume branches.
  select coalesce(count(*) filter (where wi.status = 'in_progress' and wi.wip_counted = true), 0),
         coalesce(tm.wip_limit, 0)
    into v_wip_now, v_wip_limit
    from public.team_members tm
    left join public.work_items wi on wi.final_owner_member_id = tm.id and wi.id <> v_work.id
   where tm.id = v_work.final_owner_member_id
   group by tm.wip_limit;

  v_from_status := v_work.status;

  if p_next_status = 'in_progress' and v_from_status = 'assigned' then
    if not v_marketing_sub_pic and (v_owner_user_id is null or v_owner_user_id <> v_actor_id) then
      raise exception 'Only owner can start this work';
    end if;
    if v_work.final_owner_member_id is not null and v_wip_now >= v_wip_limit then
      if v_work.priority = 'urgent'
         and length(trim(coalesce(v_work.urgent_reason, ''))) > 0 then
        v_wip_override := true;
      else
        raise exception 'WIP limit reached for owner; finish or block another item first';
      end if;
    end if;

    update public.work_items
    set status = 'in_progress',
        wip_counted = true,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  elsif p_next_status = 'review' and v_from_status = 'in_progress' then
    if not v_marketing_sub_pic and (v_owner_user_id is null or v_owner_user_id <> v_actor_id) then
      raise exception 'Only owner can submit this work for review';
    end if;

    if length(trim(coalesce(p_delivery_link, v_work.delivery_link, ''))) = 0 then
      raise exception 'Delivery link is required before review';
    end if;

    update public.work_items
    set status = 'review',
        delivery_link = trim(coalesce(p_delivery_link, v_work.delivery_link)),
        wip_counted = false,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

    insert into public.work_item_links (
      work_item_id,
      url,
      description,
      created_by_user_id
    )
    select
      v_work.id,
      trim(coalesce(p_delivery_link, v_work.delivery_link)),
      'Review Link',
      v_actor_id
    where not exists (
      select 1
      from public.work_item_links wil
      where wil.work_item_id = v_work.id
        and wil.deleted_at is null
        and wil.url = trim(coalesce(p_delivery_link, v_work.delivery_link))
        and coalesce(wil.description, '') = 'Review Link'
    );

  elsif p_next_status = 'delivered' and v_from_status = 'review' then
    if not v_marketing_sub_pic and v_work.requester_user_id <> v_actor_id then
      raise exception 'Only requester can approve delivery';
    end if;

    update public.work_items
    set status = 'delivered',
        delivered_at = now(),
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  elsif p_next_status = 'in_progress' and v_from_status = 'review' then
    -- Requester requests changes; review_round increments only here (rules §15).
    if not v_marketing_sub_pic and v_work.requester_user_id <> v_actor_id then
      raise exception 'Only requester can request changes';
    end if;
    -- WIP gate (rules §15): do not increment if owner is at WIP limit.
    if v_work.final_owner_member_id is not null and v_wip_now >= v_wip_limit then
      if v_work.priority = 'urgent'
         and length(trim(coalesce(v_work.urgent_reason, ''))) > 0 then
        v_wip_override := true;
      else
        raise exception 'Owner WIP limit reached; cannot reopen for changes yet';
      end if;
    end if;

    update public.work_items
    set status = 'in_progress',
        review_round = review_round + 1,
        wip_counted = true,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  elsif p_next_status = 'blocked' and v_from_status in ('assigned', 'in_progress', 'review') then
    if not v_marketing_sub_pic and (v_owner_user_id is null or v_owner_user_id <> v_actor_id) then
      raise exception 'Only owner can block this work';
    end if;

    if length(trim(coalesce(p_blocked_reason, ''))) = 0 then
      raise exception 'Blocked reason is required';
    end if;

    update public.work_items
    set status = 'blocked',
        blocked_reason = trim(p_blocked_reason),
        blocked_from = v_from_status,
        wip_counted = false,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  -- Unblock paths --------------------------------------------------------
  elsif p_next_status = 'in_progress' and v_from_status = 'blocked' then
    if not v_marketing_sub_pic and (v_owner_user_id is null or v_owner_user_id <> v_actor_id) then
      raise exception 'Only owner can resume this work';
    end if;
    if v_work.final_owner_member_id is not null and v_wip_now >= v_wip_limit then
      if v_work.priority = 'urgent'
         and length(trim(coalesce(v_work.urgent_reason, ''))) > 0 then
        v_wip_override := true;
      else
        raise exception 'WIP limit reached for owner; cannot resume to In Progress';
      end if;
    end if;

    update public.work_items
    set status = 'in_progress',
        wip_counted = true,
        blocked_reason = null,
        blocked_from = null,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  elsif p_next_status = 'assigned' and v_from_status = 'blocked' then
    if not v_marketing_sub_pic and (v_owner_user_id is null or v_owner_user_id <> v_actor_id) then
      raise exception 'Only owner can resume this work';
    end if;

    update public.work_items
    set status = 'assigned',
        wip_counted = false,
        blocked_reason = null,
        blocked_from = null,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  -- Cancellation (UAT-033) -----------------------------------------------
  elsif p_next_status = 'cancelled' and v_from_status not in ('delivered', 'cancelled') then
    if not v_marketing_sub_pic and v_work.requester_user_id <> v_actor_id
       and (v_owner_user_id is null or v_owner_user_id <> v_actor_id) then
      raise exception 'Only requester or current owner can cancel this work';
    end if;
    if length(trim(coalesce(p_cancel_reason, ''))) = 0 then
      raise exception 'Cancel reason is required';
    end if;

    update public.work_items
    set status = 'cancelled',
        cancel_reason = trim(p_cancel_reason),
        wip_counted = false,
        updated_at = now()
    where id = v_work.id
    returning * into v_work;

  else
    raise exception 'Unsupported status transition: % to %', v_from_status, p_next_status;
  end if;

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
    case
      when p_next_status = 'blocked' then 'blocked'::public.event_type
      when p_next_status = 'cancelled' then 'cancelled'::public.event_type
      when v_from_status = 'review' and p_next_status = 'in_progress' then 'reviewed'::public.event_type
      else 'status_changed'::public.event_type
    end,
    v_from_status,
    p_next_status,
    jsonb_build_object(
      'source', 'rpc',
      'delivery_link_set', p_delivery_link is not null,
      'blocked_reason_set', p_blocked_reason is not null,
      'cancel_reason_set', p_cancel_reason is not null,
      'wip_override', v_wip_override,
      'wip_snapshot', v_wip_now,
      'wip_limit', v_wip_limit,
      'urgent_reason', case when v_wip_override then v_work.urgent_reason else null end
    )
  );

  if v_work.work_type = 'creative_request'
     and p_next_status = 'cancelled'
     and to_regclass('public.marketing_channel_placements') is not null
     and to_regclass('public.marketing_content_items') is not null then
    with linked_content as (
      update public.marketing_content_items mci
      set brief_link = null,
          flowmate_work_item_id = null,
          status = 'not_started',
          updated_at = now()
      where mci.flowmate_work_item_id = v_work.id
         or substring(mci.brief_link from '#detail/([^/?#]+)') = v_work.display_id
      returning mci.id
    )
    update public.marketing_channel_placements mcp
    set placement_status = 'planned',
        updated_at = now()
    from linked_content
    where mcp.content_item_id = linked_content.id;

  elsif v_work.work_type = 'creative_request'
     and p_next_status in ('review', 'delivered')
     and to_regclass('public.marketing_channel_placements') is not null
     and to_regclass('public.marketing_content_items') is not null then
    update public.marketing_channel_placements mcp
    set placement_status = case
          when p_next_status = 'review' then 'review'
          when p_next_status = 'delivered' then 'ready_to_post'
          else mcp.placement_status
        end,
        updated_at = now()
    from public.marketing_content_items mci
    where mci.id = mcp.content_item_id
      and mci.flowmate_work_item_id = v_work.id
      and mcp.placement_status <> case
            when p_next_status = 'review' then 'review'
            when p_next_status = 'delivered' then 'ready_to_post'
            else mcp.placement_status
          end;
  end if;

  return jsonb_build_object(
    'id', v_work.id,
    'display_id', v_work.display_id,
    'status', v_work.status,
    'review_round', v_work.review_round
  );
end;
$$;

-- Drop the old 5-arg signature (pre-cancel-reason) if it lingers from a prior deploy.
drop function if exists public.transition_creative_work_status(
  uuid, text, public.work_status, text, text
);

revoke all on function public.transition_creative_work_status(
  uuid, text, public.work_status, text, text, text
) from public, anon, authenticated;
grant execute on function public.transition_creative_work_status(
  uuid, text, public.work_status, text, text, text
) to anon, authenticated;
