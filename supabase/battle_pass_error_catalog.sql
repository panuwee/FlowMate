-- Phase 2B.2 step 5: deterministic error catalog. This is the primary AI cost control:
-- a code present here with ai_eligible=false is answered from recovery_hint, never by an
-- LLM call. Codes are the exact SAFE_CODES set from production-runner.ts plus the two
-- generic codes the runner's catch-all can emit. Re-runnable (upsert).
begin;

create table if not exists battle_pass_private.error_catalog (
  code          text primary key check (code ~ '^[a-z0-9_.:-]{1,100}$'),
  severity      text not null check (severity in ('info','warn','error','critical')),
  runbook_ref   text,
  recovery_hint text not null,
  ai_eligible   boolean not null default false,
  updated_at    timestamptz not null default clock_timestamp()
);
alter table battle_pass_private.error_catalog enable row level security;
revoke all on battle_pass_private.error_catalog from public, anon, authenticated;

insert into battle_pass_private.error_catalog (code, severity, runbook_ref, recovery_hint, ai_eligible) values
-- Connection / identity
('connection_unavailable','error','bp-runbook#google_auth','Stored Google connection is missing or revoked. Reconnect Google on the Battle Pass connect page. Do not retry before reconnecting.',false),
('google_refresh_failed','error','bp-runbook#google_auth','OAuth token refresh failed. Reconnect Google; a single retry may succeed if the provider error was transient.',false),
('google_identity_mismatch','critical','bp-runbook#google_auth','Connected Google account is not the expected automation identity. A human must re-verify which account is connected. Retrying will not resolve this.',false),
('identity_readiness_failed','error','bp-runbook#claim','The fixed automation-owner and Aof-reviewer identities failed their readiness check. Check those two user records in FlowMate, then retry.',false),
-- Source (Google Sheet) validation
('source_schema_changed','error','bp-runbook#source','The planning sheet structure no longer matches the parser. A human must inspect the sheet. Do not retry until confirmed.',false),
('source_not_ready','info','bp-runbook#source','The source is not yet usable (still being edited, or confirmation pending). This is usually expected, not a bug. Wait.',false),
('source_changed','warn','bp-runbook#source','Source content changed between two reads in the same run. Safe to retry once the source is stable. Never assume the last-seen version is still current.',false),
('source_ambiguous','error','bp-runbook#source','More than one candidate row or period matched. A human must disambiguate in the sheet.',false),
('working_sheet_invalid','error','bp-runbook#source','The linked working sheet is broken or inaccessible. A human must fix the sheet link.',false),
('loot_schema_changed','error','bp-runbook#source','The loot table structure changed from its expected shape. A human must inspect. Do not retry.',false),
('loot_dates_mismatch','error','bp-runbook#source','Loot dates do not align with the selected period. A human must reconcile dates in the source.',false),
('loot_title_mismatch','error','bp-runbook#source','Loot title does not match the expected period naming. A human must reconcile naming in the source.',false),
('source_changed_after_finalize','critical','bp-runbook#post_finalize','HIGHEST RISK: the source changed after finalize already ran. The worker has parked the run in review_required. Do NOT retry — resuming could create output from a stale loot snapshot. A human must reconcile the source first.',false),
-- Google Slides / write operations
('google_write_access_unavailable','error','bp-runbook#google_deck','The automation account cannot write to the target Drive/Slides location. A human must check permissions for the automation identity.',false),
('google_copy_ambiguous','error','bp-runbook#google_deck','More than one candidate template or copy was found. A human must clean up duplicate files.',false),
('google_copy_conflict','critical','bp-runbook#google_deck','An existing copy does not match the expected fingerprint or parent folder. Human review required; do not let automation overwrite it.',false),
('google_copy_uncertain_review_required','critical','bp-runbook#google_deck','The deck copy step succeeded but could not be verified. A human must visually confirm the copy before resuming.',false),
('google_population_uncertain_review_required','critical','bp-runbook#google_deck','Slide content population could not be verified. A human must visually confirm slide content before resuming.',false),
('google_manual_edit_review_required','critical','bp-runbook#google_deck','The deck revision changed outside the automation''s own writes (manual edit). A human must decide whether to keep the manual edits or restart from checkpoint.',false),
('google_content_verification_failed','critical','bp-runbook#google_deck','Post-write verification of slide content failed. Human review required — a naive retry could double-write content.',false),
('google_table_verification_failed','critical','bp-runbook#google_deck','Post-write verification of a table element failed. Human review required.',false),
('google_revision_unavailable','warn','bp-runbook#google_deck','Could not read the deck''s current revision ID. Likely transient; one retry is reasonable, otherwise human review.',false),
('google_write_or_revision_rejected','warn','bp-runbook#google_deck','Slides API rejected the write (requiredRevisionId mismatch) or another concurrent writer won. This is the API''s own concurrency protection working correctly. Safe to retry — the worker re-reads the current revision.',false),
('google_request_failed','warn','bp-runbook#google_deck','Generic Google API failure (network/5xx). Likely transient; one retry with backoff is reasonable.',false),
('google_copy_changed_review_required','critical','bp-runbook#reviewer_access','The deck copy changed unexpectedly during the reviewer-access step. Human review required before resuming.',false),
-- Reviewer access
('google_reviewer_identity_invalid','error','bp-runbook#reviewer_access','The configured reviewer (Aof) identity is invalid. A human must fix the reviewer user record.',false),
('google_reviewer_permissions_unavailable','error','bp-runbook#reviewer_access','Could not grant or check reviewer permissions on the deck. Human review of Drive sharing settings required.',false),
('google_reviewer_permissions_incomplete','error','bp-runbook#reviewer_access','Reviewer permissions were only partially granted. Human review required.',false),
('google_reviewer_access_unverified','error','bp-runbook#reviewer_access','Could not verify the reviewer actually has access. Human review required.',false),
-- Target plan / campaign (FlowMate data problems, not automation bugs)
('target_plan_missing_or_ambiguous','error','bp-runbook#claim','The TH monthly marketing plan for this period is missing or duplicated. Fix the marketing plan in FlowMate, then retry.',false),
('target_plan_not_active','error','bp-runbook#claim','The matched plan exists but its status is not active. Activate the plan in FlowMate, then retry.',false),
('revenue_missing_or_ambiguous','error','bp-runbook#claim','The Revenue campaign under the plan is missing or duplicated. Fix campaigns in FlowMate, then retry.',false),
-- Automation state
('automation_paused','info','bp-runbook#automation_paused','An operator paused automation mid-run. Expected behavior, not a bug. Resume normally once automation is re-enabled.',false),
('rpc_failed','warn','bp-runbook#rpc_failed','A Supabase RPC returned an unexpected empty or invalid result. Likely transient; check Supabase logs. One retry is reasonable.',false),
-- Generic catch-all codes from the runner
('request_timeout','warn','bp-runbook#rpc_failed','The run exceeded its internal timeout. Safe to retry once. If it repeats, escalate to human review instead of retrying again.',false),
('validation_failed','error','bp-runbook#validation_failed','The underlying error message was not in the safe-code allowlist and was redacted to this generic code. The root cause cannot be determined from the code alone — Supabase Edge Function logs for this run_id must be inspected by a human. AI may help narrow the likely stage, but must not speculate on the cause.',true)
on conflict (code) do update set
  severity=excluded.severity,
  runbook_ref=excluded.runbook_ref,
  recovery_hint=excluded.recovery_hint,
  ai_eligible=excluded.ai_eligible,
  updated_at=clock_timestamp();

commit;
