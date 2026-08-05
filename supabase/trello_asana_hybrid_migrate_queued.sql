-- FlowMate Trello + Asana hybrid: one-time, idempotent queued migration.
-- Prerequisites: prepare, then backend. This transaction preserves every old
-- assignment run/event and snapshots each active queued row before mutation.

begin;

create table if not exists public.flowmate_queued_migration_archive (
  work_item_id uuid primary key,
  display_id text not null,
  original_status text not null,
  original_assignment_reason text,
  original_owner_member_id uuid,
  original_needs_split boolean not null,
  original_effort_point integer,
  original_snapshot jsonb not null,
  archived_at timestamptz not null default now(),
  migrated_at timestamptz,
  migrated_result text,
  migrated_owner_member_id uuid,
  migration_result jsonb
);

revoke all privileges on public.flowmate_queued_migration_archive
  from public, anon, authenticated;

-- Archive first. ON CONFLICT makes a rerun safe without overwriting the first
-- truthful snapshot or its original queue reason.
insert into public.flowmate_queued_migration_archive (
  work_item_id,
  display_id,
  original_status,
  original_assignment_reason,
  original_owner_member_id,
  original_needs_split,
  original_effort_point,
  original_snapshot
)
select
  wi.id,
  wi.display_id,
  wi.status::text,
  wi.assignment_reason,
  wi.final_owner_member_id,
  coalesce(wi.needs_split, false),
  wi.effort_point,
  to_jsonb(wi)
from public.work_items wi
where wi.work_type = 'creative_request'
  and wi.status = 'queued'
  and wi.archived_at is null
on conflict (work_item_id) do nothing;

do $migrate_queued$
declare
  v_row record;
  v_result jsonb;
  v_effort integer;
  v_owner_valid boolean;
  v_reason text;
begin
  for v_row in
    select
      archive.work_item_id,
      archive.display_id,
      archive.original_assignment_reason,
      archive.original_owner_member_id,
      archive.original_needs_split
    from public.flowmate_queued_migration_archive archive
    join public.work_items wi on wi.id = archive.work_item_id
    where archive.migrated_at is null
      and wi.work_type = 'creative_request'
      and wi.status = 'queued'
      and wi.archived_at is null
    order by wi.created_at, wi.id
    for update of wi
  loop
    select exists (
      select 1
      from public.team_members tm
      join public.users linked_user
        on linked_user.id = tm.user_id
       and linked_user.is_active = true
      where tm.id = v_row.original_owner_member_id
        and tm.active = true
        and public.flowmate_is_gdve_member_code(tm.member_code)
    ) into v_owner_valid;

    if v_owner_valid then
      select coalesce(
        wi.effort_point,
        public.flowmate_effort_for_subtype(
          details.asset_type,
          details.asset_subtype,
          details.asset_count
        ) + case
          when nullif(trim(coalesce(details.asset_subtype_2, '')), '') is null then 0
          else public.flowmate_effort_for_subtype(
            details.asset_type_2,
            details.asset_subtype_2,
            details.asset_count_2
          )
        end
      )
      into v_effort
      from public.work_items wi
      join public.creative_request_details details on details.work_item_id = wi.id
      where wi.id = v_row.work_item_id;

      v_reason := 'Migrated from historical Queued with valid active owner; original_reason='
        || coalesce(v_row.original_assignment_reason, '<none>');

      update public.work_items
      set status = 'assigned',
          final_owner_member_id = v_row.original_owner_member_id,
          effort_point = v_effort,
          assignment_reason = v_reason,
          needs_split = v_row.original_needs_split,
          wip_counted = false,
          updated_at = now()
      where id = v_row.work_item_id;

      perform public.flowmate_hybrid_rebuild_allocation(
        v_row.work_item_id,
        v_row.original_owner_member_id
      );

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
        v_row.work_item_id,
        'capacity_change',
        v_row.original_owner_member_id,
        v_row.original_owner_member_id,
        'assigned',
        v_reason,
        v_effort,
        v_effort,
        v_effort,
        false,
        jsonb_build_object(
          'source', 'trello_asana_hybrid_queued_migration',
          'original_assignment_reason', v_row.original_assignment_reason,
          'warnings', '[]'::jsonb
        )
      );

      v_result := jsonb_build_object(
        'result', 'assigned',
        'owner_member_id', v_row.original_owner_member_id,
        'effort', v_effort,
        'preserved_owner', true,
        'warnings', '[]'::jsonb
      );
    else
      -- The new engine produces assigned whenever a hard candidate exists,
      -- otherwise unassigned (or need_brief if the archived row is incomplete).
      v_result := public.flowmate_run_assignment(
        v_row.work_item_id,
        'capacity_change'
      );
    end if;

    insert into public.work_item_events (
      work_item_id,
      event_type,
      from_status,
      to_status,
      metadata
    )
    select
      wi.id,
      'updated',
      'queued',
      wi.status,
      jsonb_build_object(
        'action', 'queued_migrated',
        'source', 'trello_asana_hybrid_queued_migration',
        'original_assignment_reason', v_row.original_assignment_reason,
        'original_owner_member_id', v_row.original_owner_member_id,
        'original_needs_split', v_row.original_needs_split,
        'migration_result', v_result
      )
    from public.work_items wi
    where wi.id = v_row.work_item_id;

    update public.flowmate_queued_migration_archive archive
    set migrated_at = now(),
        migrated_result = wi.status::text,
        migrated_owner_member_id = wi.final_owner_member_id,
        migration_result = v_result
    from public.work_items wi
    where archive.work_item_id = v_row.work_item_id
      and wi.id = archive.work_item_id;
  end loop;
end;
$migrate_queued$;

-- Transactional release gate: history remains, but no active Creative Request
-- may still use the compatibility-only queued status.
do $assert_zero_active_queued$
declare
  v_active_queued integer;
begin
  select count(*) into v_active_queued
  from public.work_items wi
  where wi.work_type = 'creative_request'
    and wi.status = 'queued'
    and wi.archived_at is null;

  if v_active_queued <> 0 then
    raise exception 'Queued migration incomplete: % active Creative Request(s) remain',
      v_active_queued;
  end if;
end;
$assert_zero_active_queued$;

commit;
