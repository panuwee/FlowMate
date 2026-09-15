# Battle Pass Automation — Architecture (for AI Diagnosis)

This document describes how the Battle Pass monthly production worker is built. Use it to
understand what each stage does before diagnosing a failure. Do not infer behavior beyond
what is written here.

## Components

- **Scheduler**: Supabase `pg_cron` job `battle-pass-production-30m`, runs `*/30 * * * *`,
  calls `battle_pass_private.dispatch()`.
- **Dispatch**: `battle_pass_private.dispatch(p_action)` sends an authenticated
  `net.http_post` to the Edge Function `battle-pass-google-oauth/production` with
  `action` = `run`, `readiness`, or `google-write-check`.
- **Worker**: `supabase/functions/battle-pass-google-oauth/production-runner.ts`
  (`handleProductionRequest`). One HTTP call = one `run_id` = one row in
  `battle_pass_private.production_ticks`.
- **State store**: `battle_pass_private.monthly_runs` (one row per period, `mode='production'`).
  Holds `state`, `checkpoint` (jsonb), `lease_token`, `lease_until`, `source_fingerprint`,
  `source_snapshot`, `slide_id`, `brief_id`, `task_id`.
- **Tick log**: `battle_pass_private.production_ticks` (one row per `run_id`, primary key).
  Columns: `status`, `code`, `detail` (jsonb), `checked_at`.
- **Manual controls**: `monthly_settings.enabled` (automation on/off), readiness/monitor RPCs.

## Stages, in order (from `production-runner.ts`)

1. `start` — tick written with state `running`.
2. `google_auth` — create a Google session for the automation identity.
3. (if `action='google-write-check'`) `google_write_probe` — capability check only, ends here
   with state `google_write_checked`.
4. `inventory` — read existing briefs/runs via `battle_pass_monthly_inventory`.
5. `source` — read the planning source (Google Sheet) via `readProductionSource`.
   - If `action='readiness'`, this branch also checks Google write access and database
     readiness, then ends with state `readiness_checked`.
   - If no period is selected yet, ends with `source_blocked`, or the next period's own
     state (`waiting_confirmation`, `source_needs_data`, `loot_needs_data`), or
     `no_pending_month`.
6. `claim` — `battle_pass_production_claim` acquires an advisory lock + a 10-minute lease on
   the target period's `monthly_runs` row. If not claimed, ends with `busy` or the run's
   current `state`.
7. `google_deck` — `ensureProductionDeck` copies the template deck, populates it, and saves
   progress into `checkpoint` (`copyId`, `populatedRevision`, etc.) after each sub-step via
   `battle_pass_production_checkpoint`.
8. `reviewer_access` — grants the human reviewer (Aof) access to the deck.
9. `source_recheck` — re-validates the source hasn't changed since claim.
10. `finalize` — `battle_pass_production_finalize` creates the Creative Request work item,
    the marketing content item, and marks `monthly_runs.state='complete'`.
11. `post_finalize_recheck` — one more source check. If the source changed during finalize,
    calls `battle_pass_production_hold` (sets `checkpoint->'hold'`) and ends with
    `review_required` instead of `complete`.

On any thrown error, the worker calls `battle_pass_production_fail` (sets
`state='failed'`, records `checkpoint->'lastError'`) and writes a tick with state `failed`
and a `code` (see `bp-error-dictionary.md`).

## Human review gate

Every completed run stays in **held** review until a human (Aof, the sole authorized
reviewer) calls `battle_pass_release_review`. The AI diagnosis agent has no path to this
function and must never claim to have released, held, or reviewed anything.

## What the AI Diagnosis Agent is given (and not given)

The agent only receives a sanitized summary built by
`battle_pass_private.battle_pass_diagnosis_context()`: the run's `status`/`code`/`stage`,
whether recent identical failures occurred, and whether the code is already catalogued.
It never receives user emails, display names, Google file/folder/slide IDs, the raw
`source_snapshot` (contains loot and pricing data), tokens, or secrets. If information
looks like it is missing that you would expect to need, say so — do not guess it.
