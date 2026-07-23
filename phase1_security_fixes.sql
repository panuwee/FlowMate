-- ===========================================================================
-- FlowMate — Phase 1 security fixes (one-time patch for an ALREADY-DEPLOYED DB)
-- ---------------------------------------------------------------------------
-- Run this ONCE in the Supabase SQL Editor against your live project.
-- It is idempotent and safe to re-run.
--
-- Covers:
--   CR-1  Revoke direct table DML so writes can only go through the guarded
--         SECURITY DEFINER RPCs (closes the PostgREST bypass of the status
--         machine / assignment engine / WIP & effort integrity).
--   CR-6  Enforce the @garena.com + whitelist gate on auth.users email
--         CHANGES, not just on INSERT.
--
-- The canonical source files (schema.sql, whitelist_access.sql) have also
-- been updated so fresh deploys are correct without this patch.
--
-- NOTE: CR-4 (assignment-engine advisory lock) lives inside
--   flowmate_run_assignment in rpc_assignment.sql. To apply it on a live DB,
--   re-run supabase/rpc_assignment.sql (it is `create or replace`, safe).
-- ===========================================================================

-- --- CR-1: remove direct write access to the core tables --------------------
-- Reads stay (grant select ...); all writes flow through RPCs that run as the
-- function owner and therefore do not need these table grants.
revoke insert, update, delete on public.work_items               from anon, authenticated;
revoke insert, update, delete on public.creative_request_details from anon, authenticated;
revoke insert, update          on public.comments                from anon, authenticated;
revoke insert, update, delete on public.checklist_items          from anon, authenticated;
revoke insert                  on public.capacity_overrides      from anon, authenticated;

-- Defensive: if later migrations introduced detail/collab tables with direct
-- DML grants, revoke those too. Wrapped so a missing table is not an error.
do $$
begin
  begin revoke insert, update, delete on public.work_item_links    from anon, authenticated; exception when undefined_table then null; end;
  begin revoke insert, update, delete on public.work_item_watchers from anon, authenticated; exception when undefined_table then null; end;
  begin revoke insert, update, delete on public.work_item_ai_tags  from anon, authenticated; exception when undefined_table then null; end;
end $$;

-- --- CR-6: enforce domain + whitelist on email change (not just INSERT) -----
-- Mirrors whitelist_access.sql; kept here so an existing DB can be patched
-- without re-running the full whitelist script.
create or replace function public.enforce_garena_domain()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;

  if new.email is null or new.email !~* '@garena\.com$' then
    raise exception 'Only @garena.com accounts are allowed';
  end if;

  if not exists (
    select 1 from public.user_whitelist
    where lower(email) = lower(new.email)
  ) then
    raise exception 'Email % is not on the FlowMate access whitelist. Please contact panuwee.w@garena.com to request access.', new.email;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_garena_domain_trg on auth.users;
create trigger enforce_garena_domain_trg
  before insert on auth.users
  for each row execute function public.enforce_garena_domain();

drop trigger if exists enforce_garena_domain_update_trg on auth.users;
create trigger enforce_garena_domain_update_trg
  before update of email on auth.users
  for each row execute function public.enforce_garena_domain();

-- --- Verify (optional) ------------------------------------------------------
-- Confirm anon/authenticated have NO write privileges on the core tables:
--   select grantee, table_name, privilege_type
--     from information_schema.role_table_grants
--    where table_schema='public'
--      and grantee in ('anon','authenticated')
--      and privilege_type in ('INSERT','UPDATE','DELETE')
--      and table_name in ('work_items','comments','checklist_items',
--                         'creative_request_details','capacity_overrides');
-- Expected: only the notifications UPDATE grant (if not yet revoked elsewhere).
