-- FlowMate Marketing Working Sheet feedback installer
-- Run after the FlowMate baseline SQL and marketing_plan.sql.

-- ---------------------------------------------------------------------------
-- Account-scoped My Tasks preference
-- ---------------------------------------------------------------------------
create table if not exists public.user_ui_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  marketing_working_my_tasks boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_ui_preferences_set_updated_at on public.user_ui_preferences;
create trigger user_ui_preferences_set_updated_at
before update on public.user_ui_preferences
for each row execute function public.set_updated_at();

alter table public.user_ui_preferences enable row level security;

drop policy if exists "active authenticated accounts can select their My Tasks preference" on public.user_ui_preferences;
create policy "active authenticated accounts can select their My Tasks preference"
on public.user_ui_preferences for select
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
  )
);

drop policy if exists "active authenticated accounts can insert their My Tasks preference" on public.user_ui_preferences;
create policy "active authenticated accounts can insert their My Tasks preference"
on public.user_ui_preferences for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
  )
);

drop policy if exists "active authenticated accounts can update their My Tasks preference" on public.user_ui_preferences;
create policy "active authenticated accounts can update their My Tasks preference"
on public.user_ui_preferences for update
to authenticated
using (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
  )
)
with check (
  user_id = (select auth.uid())
  and exists (
    select 1
    from public.users u
    where u.id = (select auth.uid())
      and u.is_active = true
  )
);

revoke all on table public.user_ui_preferences from public, anon, authenticated;
grant select, insert, update on table public.user_ui_preferences to authenticated;

-- End account-scoped My Tasks preference

-- ---------------------------------------------------------------------------
-- Nullable whole-hour Publish Time mirrors
-- ---------------------------------------------------------------------------
create or replace function public.marketing_plan_sync_flowmate_schedule(
  p_content_item_id uuid,
  p_launch_date date,
  p_publish_time time
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_content public.marketing_content_items%rowtype;
  v_flowmate_display_id text;
  v_resolved_work_item_id uuid;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not (
    p_publish_time is null
    or (
      extract(minute from p_publish_time) = 0
      and extract(second from p_publish_time) = 0
    )
  ) then
    raise exception 'Publish Time must be N/A or a whole hour.'
      using errcode = '22023';
  end if;

  select *
    into v_content
    from public.marketing_content_items mci
   where mci.id = p_content_item_id
   for update;

  if v_content.id is null then
    raise exception 'Marketing Plan content item not found';
  end if;

  v_flowmate_display_id := substring(v_content.brief_link from '#detail/([^/?#]+)');

  select wi.id
    into v_resolved_work_item_id
    from public.work_items wi
   where wi.id = v_content.flowmate_work_item_id
      or (
        v_content.flowmate_work_item_id is null
        and v_flowmate_display_id is not null
        and wi.display_id = v_flowmate_display_id
      )
   order by case when wi.id = v_content.flowmate_work_item_id then 0 else 1 end
   limit 1;

  if v_resolved_work_item_id is null then
    return jsonb_build_object('synced', false, 'reason', 'no linked FlowMate work item');
  end if;

  if not (
    public.is_admin_app_user(v_actor_id)
    or v_content.pic_user_id = v_actor_id
    or v_content.sub_pic_user_id = v_actor_id
  ) then
    raise exception 'Only PIC, Sub PIC, or Admin can sync this linked FlowMate schedule'
      using errcode = '42501';
  end if;

  update public.marketing_content_items
     set flowmate_work_item_id = v_resolved_work_item_id,
         updated_at = now()
   where id = v_content.id
     and flowmate_work_item_id is distinct from v_resolved_work_item_id;

  update public.work_items
     set launch_date = coalesce(p_launch_date, launch_date),
         publish_date = coalesce(p_launch_date, publish_date),
         publish_time = p_publish_time,
         updated_at = now()
   where id = v_resolved_work_item_id;

  return jsonb_build_object(
    'synced', true,
    'content_item_id', v_content.id,
    'work_item_id', v_resolved_work_item_id,
    'launch_date', p_launch_date,
    'publish_time', p_publish_time
  );
end;
$$;

revoke all on function public.marketing_plan_sync_flowmate_schedule(uuid, date, time) from public, anon, authenticated;
grant execute on function public.marketing_plan_sync_flowmate_schedule(uuid, date, time) to authenticated;

create or replace function public.marketing_plan_update_working_row_time(
  p_content_item_id uuid,
  p_publish_time time
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_content public.marketing_content_items%rowtype;
  v_placement_count integer := 0;
  v_work_item_count integer := 0;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_actor
  from public.users u
  where u.id = v_actor_id
    and u.is_active = true;

  if v_actor.id is null then
    raise exception 'An active FlowMate user is required' using errcode = '42501';
  end if;

  if not (
    p_publish_time is null
    or (
      extract(minute from p_publish_time) = 0
      and extract(second from p_publish_time) = 0
    )
  ) then
    raise exception 'Publish Time must be N/A or a whole hour.'
      using errcode = '22023';
  end if;

  select * into v_content
  from public.marketing_content_items mci
  where mci.id = p_content_item_id
  for update;

  if v_content.id is null then
    raise exception 'Marketing Plan content item not found';
  end if;

  if not (
    v_actor.role = 'admin'
    or v_content.pic_user_id = v_actor_id
    or v_content.sub_pic_user_id = v_actor_id
    or v_actor.can_manage_marketing_schedule = true
  ) then
    raise exception 'Only an Admin, PIC, Sub PIC, or schedule operator can update Working Sheet time'
      using errcode = '42501';
  end if;

  update public.marketing_content_items
  set source_start_time = p_publish_time
  where id = v_content.id;

  update public.marketing_channel_placements
  set publish_time = p_publish_time
  where content_item_id = v_content.id;
  get diagnostics v_placement_count = row_count;

  update public.work_items
  set publish_time = p_publish_time
  where id = v_content.flowmate_work_item_id;
  get diagnostics v_work_item_count = row_count;

  return jsonb_build_object(
    'content_item_id', v_content.id,
    'publish_time', p_publish_time,
    'placement_count', v_placement_count,
    'linked_work_item_updated', v_work_item_count = 1
  );
end;
$$;

revoke all on function public.marketing_plan_update_working_row_time(uuid, time) from public, anon, authenticated;
grant execute on function public.marketing_plan_update_working_row_time(uuid, time) to authenticated;

-- End nullable whole-hour Publish Time mirrors

-- ---------------------------------------------------------------------------
-- Transactional Working Sheet duplication
-- ---------------------------------------------------------------------------
create or replace function public.marketing_plan_duplicate_working_row(
  p_source_content_item_id uuid,
  p_launch_date date,
  p_publish_time time default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid;
  v_actor public.users%rowtype;
  v_source public.marketing_content_items%rowtype;
  v_source_sub_pic public.users%rowtype;
  v_source_placement public.marketing_channel_placements%rowtype;
  v_new_content_item_id uuid;
  v_source_placement_count integer := 0;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select * into v_actor
  from public.users u
  where u.id = v_actor_id
    and u.is_active = true;

  if v_actor.id is null then
    raise exception 'An active FlowMate user is required' using errcode = '42501';
  end if;

  if p_launch_date is null then
    raise exception 'Launch Date is required' using errcode = '22023';
  end if;

  if not (
    p_publish_time is null
    or (
      extract(hour from p_publish_time) between 0 and 23
      and extract(minute from p_publish_time) = 0
      and extract(second from p_publish_time) = 0
    )
  ) then
    raise exception 'Publish Time must be N/A or a whole hour.'
      using errcode = '22023';
  end if;

  select * into v_source
  from public.marketing_content_items mci
  where mci.id = p_source_content_item_id
  for update;

  if v_source.id is null then
    raise exception 'Marketing Plan content item not found';
  end if;

  if not (
    coalesce(public.is_admin_app_user(v_actor_id), false)
    or coalesce(v_source.pic_user_id = v_actor_id, false)
    or coalesce(v_source.sub_pic_user_id = v_actor_id, false)
  ) then
    raise exception 'Only an Admin, PIC, or Sub PIC can duplicate this Working Sheet row'
      using errcode = '42501';
  end if;

  if v_source.requires_brief is distinct from true then
    raise exception 'Only rows that require a Brief can be duplicated'
      using errcode = '22023';
  end if;

  select * into v_source_sub_pic
  from public.users u
  where u.id = v_source.sub_pic_user_id
      and u.is_active = true
      and u.id <> v_actor_id;

  v_new_content_item_id := gen_random_uuid();

  insert into public.marketing_content_items (
    id, campaign_id, title, details, team, format, content_tier, pic_user_id, pic_name,
    sub_pic_user_id, sub_pic_name, note, brief_link, requires_brief, source_start_date,
    source_start_time, source_sheet_row, flowmate_work_item_id, status, sort_order
  ) values (
    v_new_content_item_id,
    v_source.campaign_id, v_source.title, v_source.details, v_source.team,
    v_source.format, v_source.content_tier,
    v_actor_id, v_actor.display_name,
    v_source_sub_pic.id, v_source_sub_pic.display_name,
    v_source.note, null, v_source.requires_brief, null, null, null, null,
    'not_started', v_source.sort_order
  );

  for v_source_placement in
    select source.*
    from public.marketing_channel_placements source
    where source.content_item_id = v_source.id
    order by source.id
    for update
  loop
    insert into public.marketing_channel_placements (
      id, content_item_id, channel, publish_date, publish_time, placement_status, posted_url, note
    ) values (
      gen_random_uuid(), v_new_content_item_id, v_source_placement.channel, p_launch_date,
      p_publish_time, 'planned', null, v_source_placement.note
    );
    v_source_placement_count := v_source_placement_count + 1;
  end loop;

  if v_source_placement_count < 1 then
    raise exception 'A Working Sheet row needs at least one placement before it can be duplicated'
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'content_item_id', v_new_content_item_id,
    'launch_date', p_launch_date,
    'publish_time', p_publish_time
  );
end;
$$;

revoke all on function public.marketing_plan_duplicate_working_row(uuid, date, time) from public, anon, authenticated;
grant execute on function public.marketing_plan_duplicate_working_row(uuid, date, time) to authenticated;

-- Manual rollback-safe verification checklist (do not run against production):
-- Unauthorized actor: function raises before either insert, leaving zero new rows.
-- Placement insert failure: the uncaught error rolls back the preceding content insert.
-- Successful clone: content and placement IDs are distinct and Brief/FlowMate/source links are null.
-- Channel check: the new row has exactly the source channels and preserves each placement note.
-- Same-date duplication is accepted; no date-based dedupe state is created.
