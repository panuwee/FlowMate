-- Phase 2B.4 step 2 - grant-only patch. Does NOT touch the function body.
--
-- FINDING: battle_pass_retry(text) has never explicitly revoked EXECUTE from service_role.
-- This predates 2B.4 entirely - the original 2B.1 step 4 grant lines were:
--     revoke all on function public.battle_pass_retry(text) from public,anon;
--     grant execute on function public.battle_pass_retry(text) to authenticated;
-- and step 2's refactor left those two lines untouched.
--
-- Supabase grants EXECUTE on every new function in schema public to service_role by default
-- (ALTER DEFAULT PRIVILEGES set at project provisioning). Because service_role was never
-- explicitly revoked, it silently retained the ability to call this control - meaning
-- bp-mcp / ai-diagnosis, both of which authenticate as service_role, could technically invoke
-- Retry even though 2B.3/2B.4 were built read-only by design. Caught by
-- battle_pass_recovery_retry_verify.sql's "retry_grants_unchanged" check.
--
-- FIX: revoke the default grant explicitly. No change to guard logic, evaluation order,
-- exception messages, dedup window, or dispatch. authenticated keeps EXECUTE; anon and
-- service_role have none.
begin;

revoke all on function public.battle_pass_retry(text) from service_role;

notify pgrst, 'reload schema';
commit;
