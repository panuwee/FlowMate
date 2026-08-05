-- FlowMate Trello + Asana hybrid: existing-database preparation.
-- Run this file by itself and wait for it to commit before running the backend
-- delta. PostgreSQL enum values must be committed before later statements can
-- safely use them.

begin;

alter type public.work_status
  add value if not exists 'unassigned' after 'need_brief';

alter type public.assignment_result
  add value if not exists 'unassigned' after 'assigned';

alter type public.event_type
  add value if not exists 'capacity_changed' after 'checklist_changed';

commit;

begin;

-- Older installations used either a combined (> 0 and <= 4) check or the
-- canonical constraint name for that combined check. Remove every upper-bound
-- check that targets capacity_point, then restore one positive-only invariant.
do $prepare_capacity_constraint$
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
$prepare_capacity_constraint$;

alter table public.flowmate_capacity_allocations
  drop constraint if exists flowmate_capacity_allocations_capacity_point_check;

alter table public.flowmate_capacity_allocations
  add constraint flowmate_capacity_allocations_capacity_point_check
  check (capacity_point > 0);

commit;
