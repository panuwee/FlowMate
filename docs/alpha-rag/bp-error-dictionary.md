# Battle Pass Automation — Error Code Dictionary

Source of truth: `SAFE_CODES` in `production-runner.ts`, plus states from `inspect.ts` and
`production-google.ts`. Every code below is a `production_ticks.code` or `detail.code`
value. Do not invent a code that is not in this list — if a run's code is not here, say
"unknown code, needs manual review" rather than guessing its meaning.

Format: `code` — meaning — likely stage — suggested recovery.

## Connection / identity

- `connection_unavailable` — the automation's stored Google connection could not be used
  (missing or revoked). Stage: `google_auth`. Recovery: reconnect Google in
  `battle-pass-connect.html`; do not retry blindly.
- `google_refresh_failed` — OAuth token refresh failed. Stage: `google_auth`. Recovery:
  reconnect Google; a single retry may succeed if this was a transient provider error.
- `google_identity_mismatch` — the connected Google account does not match the expected
  automation identity. Stage: `google_auth`. Recovery: human must re-verify which account is
  connected; do not retry.
- `identity_readiness_failed` — the two fixed system identities (automation owner, Aof
  reviewer) failed a readiness check in `battle_pass_production_readiness`. Stage: `claim`
  precondition. Recovery: check `public.users` rows for those two fixed IDs; human review.

## Source (Google Sheet) validation

- `source_schema_changed` — the planning sheet's structure no longer matches what the
  parser expects. Stage: `source`. Recovery: human must inspect the sheet; do not retry
  until confirmed.
- `source_not_ready` — the source is not yet in a usable state (e.g. still being edited or
  confirmation pending). Stage: `source`. Recovery: wait; this is often expected, not a bug.
- `source_changed` — the source content changed between two reads within the same run
  (fingerprint mismatch). Stage: `source` / `source_recheck`. Recovery: safe to retry once
  the source is stable; never assume the last-seen version is still correct.
- `source_ambiguous` — more than one candidate row/period matched. Stage: `source`.
  Recovery: human must disambiguate in the sheet.
- `working_sheet_invalid` — the linked working sheet reference is broken or inaccessible.
  Stage: `source`. Recovery: human must fix the sheet link.
- `loot_schema_changed` — the loot table structure changed (expected shape, e.g. 107 rows,
  no longer matches). Stage: `source`. Recovery: human must inspect; do not retry.
- `loot_dates_mismatch` — loot dates don't align with the selected period. Stage: `source`.
  Recovery: human must reconcile dates in the source.
- `loot_title_mismatch` — loot title doesn't match the expected period naming. Stage:
  `source`. Recovery: human must reconcile naming in the source.
- `source_changed_after_finalize` — the source changed after `finalize` already ran. The
  worker automatically calls `battle_pass_production_hold` and the run ends in
  `review_required`, not `failed`. Recovery: human review required before any retry —
  retrying without review risks producing output from stale loot data.

## Google Slides / write operations

- `google_write_access_unavailable` — the automation account cannot write to the target
  Drive/Slides location. Stage: `google_deck`. Recovery: human must check Drive/Slides
  permissions for the automation identity.
- `google_copy_ambiguous` — more than one candidate template/copy was found. Stage:
  `google_deck`. Recovery: human must clean up duplicate files.
- `google_copy_conflict` — an existing copy doesn't match the expected fingerprint/parent
  folder. Stage: `google_deck`. Recovery: human review; do not let automation overwrite.
- `google_copy_uncertain_review_required` — the deck copy step succeeded but could not be
  verified with confidence. Stage: `google_deck`. Recovery: human must visually confirm
  the copy before resuming.
- `google_population_uncertain_review_required` — slide content population could not be
  verified with confidence. Stage: `google_deck`. Recovery: human must visually confirm
  slide content before resuming.
- `google_manual_edit_review_required` — the deck's revision ID changed outside the
  automation's own writes (someone edited it manually). Stage: `google_deck`. Recovery:
  human must decide whether to keep manual edits or restart from checkpoint.
- `google_content_verification_failed` — post-write verification of slide content failed.
  Stage: `google_deck`. Recovery: human review; a naive retry could double-write content.
- `google_table_verification_failed` — post-write verification of a table/structured
  element failed. Stage: `google_deck`. Recovery: human review.
- `google_revision_unavailable` — could not read the deck's current revision ID. Stage:
  `google_deck`. Recovery: likely transient; one retry may be safe, otherwise human review.
- `google_write_or_revision_rejected` — the write was rejected by Slides API
  (`requiredRevisionId` mismatch) or another concurrent writer won. Stage: `google_deck`.
  Recovery: safe to retry — this is the API's own conflict protection working correctly.
- `google_request_failed` — a generic Google API call failure (network/5xx/etc). Stage:
  any Google-calling stage. Recovery: likely transient; one retry with backoff is
  reasonable.

## Reviewer access

- `google_reviewer_identity_invalid` — the configured reviewer (Aof) identity is invalid.
  Stage: `reviewer_access`. Recovery: human must fix the reviewer's user record.
- `google_reviewer_permissions_unavailable` — could not grant/check reviewer permissions on
  the deck. Stage: `reviewer_access`. Recovery: human review of Drive sharing settings.
- `google_reviewer_permissions_incomplete` — reviewer permissions were only partially
  granted. Stage: `reviewer_access`. Recovery: human review.
- `google_reviewer_access_unverified` — could not verify the reviewer actually has access.
  Stage: `reviewer_access`. Recovery: human review.
- `google_copy_changed_review_required` — the deck copy changed unexpectedly during the
  reviewer-access step. Stage: `reviewer_access`. Recovery: human review before resuming.

## Target plan / campaign

- `target_plan_missing_or_ambiguous` — the TH monthly marketing plan for the period is
  missing or there is more than one. Stage: `claim` precondition
  (`battle_pass_production_readiness`). Recovery: human must fix the marketing plan in
  FlowMate for that period.
- `target_plan_not_active` — the matched plan exists but its status isn't `active`. Stage:
  same as above. Recovery: human must activate the plan.
- `revenue_missing_or_ambiguous` — the "Revenue" campaign under the plan is missing or
  duplicated. Stage: same as above. Recovery: human must fix campaigns in FlowMate.

## Automation state

- `automation_paused` — `monthly_settings.enabled` was `false` when a write step needed it
  to be `true` (race between an operator pausing mid-run and the worker's own check).
  Stage: `google_deck` checkpoint save. Recovery: this is expected behavior, not a bug —
  resume normally once automation is re-enabled.
- `rpc_failed` — a call to a Supabase RPC returned an unexpected empty/invalid result.
  Stage: `inventory` or others. Recovery: likely transient; check Supabase logs; one retry
  reasonable.

## Generic (not in `SAFE_CODES`, added by the runner's catch-all)

- `request_timeout` — the run exceeded its internal timeout (`TimeoutError`/`AbortError`).
  Recovery: safe to retry once; if it repeats, treat as `unknown / repeated` and escalate.
- `validation_failed` — an error was thrown whose message is not in `SAFE_CODES` (so it was
  redacted to this generic code to avoid leaking internals). Recovery: cannot be diagnosed
  from the code alone — needs the underlying error inspected in Supabase function logs by a
  human; do not speculate on the cause.

## Non-`failed` states that are not errors

`disabled`, `busy`, `no_pending_month`, `waiting_confirmation`, `source_needs_data`,
`loot_needs_data`, `readiness_checked`, `google_write_checked`, `complete` are normal
outcomes, not failures. See `bp-state-machine.md`. Never route these to AI diagnosis.
