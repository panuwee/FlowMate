-- ============================================================================
--  REVEALS A SECRET. Read this before running it.
--
--  This prints the Battle Pass MCP reader token in plain text. Run it in the Supabase SQL
--  editor when you need to paste the token into Alpha, and treat the result the way you
--  would treat a password:
--
--    * copy it straight from the result into Alpha's custom-header field
--    * do NOT paste it into a chat, a ticket, a document, or any file in this repo
--    * do NOT commit it anywhere
--    * close the SQL editor tab afterwards so it is not left on screen
--
--  Claude never needs this value and must never be shown it.
--
--  What the token can do: call the six read-only tools in bp-mcp. Nothing else. It cannot
--  start a production run, cannot write, and is a different secret from the scheduler token
--  (see docs/PHASE_2B3_MVP_SPEC.md §5.1).
--
--  If it leaks: rotate it with battle_pass_mcp_token_rotate.sql (bottom of this file),
--  then update the header in Alpha. Rotating does not affect the cron worker.
-- ============================================================================

select v.decrypted_secret as mcp_reader_token
from battle_pass_private.monthly_settings s
join vault.decrypted_secrets v on v.id = s.mcp_secret_id
where s.singleton;

-- ---------------------------------------------------------------------------
--  ROTATION (leave commented out unless you actually mean to rotate)
--
--  Uncomment and run ONLY when replacing a token you believe has leaked, or on a scheduled
--  rotation. The moment this runs, the old token stops working and Alpha's connection will
--  fail until you paste the new value into it, so do both in the same sitting.
--
--  The cron worker, ai-diagnosis, and every 2B.1 button are unaffected: they use
--  scheduler_secret_id, which this does not touch.
-- ---------------------------------------------------------------------------

-- do $$ declare v_id uuid; begin
--   select mcp_secret_id into v_id from battle_pass_private.monthly_settings where singleton;
--   if v_id is null then raise exception 'No MCP secret exists yet - apply battle_pass_mcp_auth.sql first'; end if;
--   perform vault.update_secret(v_id, gen_random_uuid()::text || gen_random_uuid()::text);
-- end $$;
-- -- then re-run the select above to read the new value
