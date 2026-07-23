-- ===========================================================================
-- FlowMate — Phase 2 stability fixes (one-time patch for an ALREADY-DEPLOYED DB)
-- ---------------------------------------------------------------------------
-- Run ONCE in the Supabase SQL Editor. Idempotent; safe to re-run.
--
-- Covers the schema-level Phase 2 items:
--   H-8  work_items.final_owner_member_id FK -> ON DELETE SET NULL, so deleting
--        a team member doesn't block or strand their work items.
--   H-3  rename the misleadingly-named "participants can read comments" policy
--        to reflect the deliberate shared-board read model.
--
-- The rest of Phase 2 ships in code:
--   H-8 (deny owner-only transitions when owner is NULL) is inside
--       transition_creative_work_status -> re-run supabase/rpc_quick_task.sql
--       (create or replace; safe).
--   H-10/H-11/H-12/H-13/H-14 are all frontend (github/).
-- ===========================================================================

-- --- H-8: owner FK becomes ON DELETE SET NULL ------------------------------
do $$
begin
  if to_regclass('public.work_items') is not null then
    alter table public.work_items
      drop constraint if exists work_items_final_owner_member_id_fkey;
    alter table public.work_items
      add constraint work_items_final_owner_member_id_fkey
      foreign key (final_owner_member_id)
      references public.team_members(id)
      on delete set null;
  end if;
end $$;

-- --- H-3: rename comments read policy to match reality (all active users) ---
drop policy if exists "participants can read comments" on public.comments;
drop policy if exists "active users can read comments" on public.comments;
create policy "active users can read comments"
on public.comments for select
using (public.is_active_app_user());

-- --- Verify (optional) ------------------------------------------------------
--   select conname, confdeltype from pg_constraint
--    where conrelid = 'public.work_items'::regclass
--      and conname = 'work_items_final_owner_member_id_fkey';
--   -- confdeltype should be 'n' (SET NULL)
