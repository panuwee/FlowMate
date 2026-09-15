# Battle Pass Automation — Recovery Runbook

General rule for every recovery recommendation: **resume, don't restart.** The worker is
checkpointed (`monthly_runs.checkpoint`) — recreating a brief, deck copy, or Creative
Request that already exists creates duplicates. Always recommend resuming from the
failed stage, never recreating an earlier stage's output.

## By stage

### `google_auth` failures
(`connection_unavailable`, `google_refresh_failed`, `google_identity_mismatch`)
Recommended action: `revalidate_source` is not relevant here — recommend
`manual_review` to reconnect Google (`battle-pass-connect.html`). Do not recommend
`retry_run` for `google_identity_mismatch` (it will not self-resolve).

### `source` failures
(`source_schema_changed`, `source_not_ready`, `source_changed`, `source_ambiguous`,
`working_sheet_invalid`, `loot_schema_changed`, `loot_dates_mismatch`,
`loot_title_mismatch`)
Recommended action: `revalidate_source` — a human needs to fix the sheet, then the next
scheduled tick (or a manual Run Now) will pick it up. `source_changed` alone is often
transient and safe to retry once the source is confirmed stable.

### `source_changed_after_finalize`
This is the highest-risk case: the Creative Request/content item may already exist but
the deck content might not match the latest source. The run is already parked in
`review_required` by the worker itself — do not recommend `retry_run`.
Recommended action: `manual_review`. Explicitly flag: "resuming could create output from
a stale loot snapshot — confirm the source before doing anything."

### `google_deck` failures
(`google_write_access_unavailable`, `google_copy_ambiguous`, `google_copy_conflict`,
`google_copy_uncertain_review_required`, `google_population_uncertain_review_required`,
`google_manual_edit_review_required`, `google_content_verification_failed`,
`google_table_verification_failed`)
These need a human to look at the actual Drive/Slides file before any retry, because the
worker cannot tell whether partial writes happened safely.
Recommended action: `manual_review`.

Exceptions that are safe to retry automatically:
- `google_revision_unavailable` — likely transient read failure. `retry_run` is
  reasonable if it hasn't repeated.
- `google_write_or_revision_rejected` — this is the API's own optimistic-concurrency
  check working as intended (someone/something else wrote first). `retry_run` is safe;
  the worker will re-read the current revision and retry its write.
- `google_request_failed` — generic transient Google API error. `retry_run` is
  reasonable once; if repeated, escalate to `manual_review`.

### `reviewer_access` failures
(`google_reviewer_identity_invalid`, `google_reviewer_permissions_unavailable`,
`google_reviewer_permissions_incomplete`, `google_reviewer_access_unverified`,
`google_copy_changed_review_required`)
Recommended action: `manual_review` — reviewer setup or deck integrity needs a human to
confirm before the run can be trusted to finish `finalize`.

### `claim` preconditions
(`identity_readiness_failed`, `target_plan_missing_or_ambiguous`,
`target_plan_not_active`, `revenue_missing_or_ambiguous`)
These are FlowMate data problems, not automation bugs.
Recommended action: `manual_review` — fix the plan/campaign/user records in FlowMate,
then `retry_run` (or just wait for the next scheduled tick).

### `automation_paused`
Not a bug — an operator paused automation mid-run. Recommended action: `wait_for_confirmation`
(i.e. wait for automation to be re-enabled; no diagnosis action needed).

### `rpc_failed`, `request_timeout`
Likely transient infrastructure issues. Recommended action: `retry_run` once. If the
same run/code repeats (this is exactly the "repeated failure" trigger for AI diagnosis),
escalate to `manual_review` instead of continuing to retry.

### `validation_failed`
The real error message was redacted because it wasn't in the safe-code allowlist. You
cannot determine the root cause from the code alone.
Recommended action: `manual_review`, and say explicitly that Supabase Edge Function logs
for this `run_id` need to be inspected by a human — do not guess what the underlying
error was.

## Hard rules (repeat of policy, safe to restate in your own diagnosis)

- Never say you retried, resumed, paused, or changed anything — you only diagnose.
- Never recommend recreating a brief, deck, or Creative Request that may already exist.
- Never recommend clearing `checkpoint->'hold'` yourself — that is a human-gated action in
  FlowMate's own Retry control.
- If the code is not in `bp-error-dictionary.md`, say so and stop — do not invent a
  meaning for it.
