# Battle Pass Automation — State Machine

## `production_ticks.status` (one row per `run_id`, this is what "run status" means)

| Status | Meaning | Is it a failure? |
|---|---|---|
| `running` | Tick written at the very start of a run, before any stage completes. | No |
| `disabled` | `monthly_settings.enabled=false`; the worker exited immediately. | No |
| `google_write_checked` | A `google-write-check` probe finished (capability check only). | No |
| `readiness_checked` | A `readiness` action finished; see `detail` for `sourceReady`, `googleReady`, `databaseReady`. | No |
| `source_blocked` | The overall plan is blocked (see `detail.plan.state`). | No — needs source attention, not a code bug |
| `no_pending_month` | No period is queued for production. | No |
| `waiting_confirmation` | Next period exists but "P confirmation" (loot confirmed) is false. | No |
| `source_needs_data` | Next period's source rows are incomplete. | No |
| `loot_needs_data` | Next period's loot rows are incomplete/malformed. | No |
| `busy` | Another run already holds the claim/lease for this period. | No |
| `review_required` | A completed-but-held run, OR the source changed after finalize. | No — needs human review, not a code fix |
| `complete` | The run created a Creative Request + content item successfully. | No |
| `failed` | An exception was thrown; `detail.code` explains why. | Yes |

## `monthly_runs.state` (one row per period, `mode='production'`)

`running` → `complete` (normal path), or `failed` (exception), or stays `running` until the
lease expires (`lease_until`) and a later run reclaims it.

## `checkpoint` (jsonb on `monthly_runs`, keys only — values are never shown to AI)

- `hold` — presence of this key means a human must review before any further production
  action. Set by `battle_pass_production_hold`. Do not recommend clearing it automatically.
- `lastError` — the most recent failure code (set by `battle_pass_production_fail`).
- `copyIntent`, `copyId` — Slides deck copy step progress.
- `baselineRevision`, `populateIntent`, `populatedRevision` — Slides population step
  progress and its last-verified revision ID.
- `verificationManifest`, `slideIds` — internal verification bookkeeping.

A run with `checkpoint ? 'hold'` will never proceed past `claim` — `battle_pass_production_claim`
returns `state='review_required'` for it.

## Reading a diagnosis request

When asked to diagnose a run, the tick's `status` tells you which table above applies.
Only `status='failed'` combined with `code` (from `bp-error-dictionary.md`) constitutes an
actual failure worth root-causing. Every other status is a normal, expected outcome —
say so plainly and do not manufacture a root cause for it.
