# FlowMate Phase 2B MVP Spec — Operational Controls + Alpha Diagnosis

Status: draft dev spec
Scope: 2B.1 (Operational Controls) + 2B.2 (Alpha Diagnosis Agent)
Out of scope: 2B.3 MCP Server, 2B.4 Controlled Recovery (write tools), Phase 3 SeaTalk
Source docs: `PHASE_2B_PUBLISHED_2026-09-15.md`, `flowmate-alpha-intelligence-summary.md`

---

## 0. Existing foundation (reuse, do not rebuild)

Verified against current code in `supabase/battle_pass_production.sql`, `battle_pass_production_operations.sql`, `battle_pass_readiness.sql`, `battle_pass_monitor.sql`.

| Existing piece | Role in 2B |
|---|---|
| `battle_pass_private.dispatch(p_action)` | Sends `net.http_post` to the existing Edge Function with action `run` / `readiness` / `google-write-check`. No worker changes needed. |
| `battle_pass_private.production_ticks(run_id pk, status, code, detail jsonb, checked_at)` | Single source of truth for diagnosis input. |
| `readiness_requests(request_id, requested_at, requested_by, result)` | Template pattern for every new action: request ledger + advisory lock + 60s dedup + correlate `net._http_response` → tick. |
| `monthly_settings.enabled` | Automation on/off flag (`dispatch('run')` returns null when false). |
| `battle_pass_monitor()` | Read-only history + scheduler + outputs. |
| cron job `battle-pass-production-30m` (`*/30 * * * *`) | Must not be touched. |

**Pattern to copy for every new action** (verified safe via request 37244):

```
RPC request → require_user() → advisory_xact_lock(action-name)
  → check recent request (reuse if < 60s / in-flight if < 180s)
  → dispatch() → insert ledger row → return {requestId, reused}

RPC status → read net._http_response by request_id
  → correlate matching run_id + checked_at >= requested_at
  → sanitize via regex allowlist → cache into ledger.result
```

---

## 1. Scope

### In scope

**2B.1 — Operational Controls**

| Control | Mechanism | Touches production state? |
|---|---|---|
| Run Now | `dispatch('run')` + dedup | No (existing worker decides) |
| Validate | Existing `battle_pass_request_readiness()` | No |
| Pause / Resume | Toggle `monthly_settings.enabled` | Yes — human only |
| Retry | Pre-flight guard + `dispatch('run')` — **mutates nothing** (see §4.1 note) | No — see below |
| Audit Trail | View over ledger of all actions | No |

**2B.2 — Alpha Diagnosis Agent (read-only)**
Rule engine gate → Edge Function `ai-diagnosis` → Alpha Super Agent API → structured JSON → stored in Supabase → shown in Operations panel.

### Out of scope
MCP Server (2B.3) · any write tool (2B.4) · SeaTalk (Phase 3) · streaming responses · multi-turn `conversation_id`.

---

## 2. Locked constraints → enforcement point

| Constraint | Where enforced |
|---|---|
| AI must never touch production state | Edge Function `ai-diagnosis` uses a DB role granted execute only on `battle_pass_diagnosis_context()` (STABLE, read-only). No grants to any write RPC. |
| Do not touch pg_cron / existing worker | Pause uses `monthly_settings.enabled`, not `cron.alter_job()`. Run Now reuses `dispatch()`. `production-runner.ts` is not modified. |
| Control cost | `battle_pass_diagnosis_route()` is a DB gate function; the Edge Function refuses the call if the gate doesn't pass, plus a daily rate cap and dedup. |
| Alpha Intelligence only, no direct LLM binding | FlowMate never sees a model name — it sends only a pinned `superagent_id` + `agent_version`. |

---

## 3. Data model (3 new tables)

### 3.1 `battle_pass_private.operator_actions` (2B.1)

```sql
create table if not exists battle_pass_private.operator_actions (
  action_id     bigserial primary key,
  action        text not null check (action in ('run_now','retry','pause','resume')),
  requested_at  timestamptz not null default clock_timestamp(),
  requested_by  uuid not null references public.users(id),
  target_period text,                    -- null for pause/resume
  target_run_id uuid,                    -- null for run_now
  request_id    bigint,                  -- net request id; null for pause/resume
  before_state  jsonb not null default '{}'::jsonb,
  result        jsonb
);
```
RLS enabled · `revoke all from public, anon, authenticated` · index `(requested_at desc)`.

One table for all actions, since Audit Trail already needs to query them together.

### 3.2 `battle_pass_private.error_catalog` (2B.2 gate)

```sql
create table if not exists battle_pass_private.error_catalog (
  code          text primary key check (code ~ '^[a-z0-9_.:-]{1,100}$'),
  severity      text not null check (severity in ('info','warn','error','critical')),
  runbook_ref   text,                       -- e.g. 'ERROR_BP_008'
  recovery_hint text,                       -- deterministic message shown instead of AI
  ai_eligible   boolean not null default false,
  updated_at    timestamptz not null default clock_timestamp()
);
```

`ai_eligible = false` means "known error, runbook exists, skip AI" — the main cost-control lever.

### 3.3 `battle_pass_private.diagnosis_requests` (2B.2)

```sql
create table if not exists battle_pass_private.diagnosis_requests (
  diagnosis_id     bigserial primary key,
  run_id           uuid not null,
  tick_code        text,
  tick_status      text not null,
  requested_at     timestamptz not null default clock_timestamp(),
  requested_by     uuid references public.users(id),   -- null = auto-routed
  route            text not null check (route in ('ai','runbook','none')),
  agent_version    text,                    -- pinned, e.g. 'diagnosis-v1.0'
  alpha_request_id text,                    -- trace id from Alpha
  latency_ms       integer,
  raw_response     jsonb,                   -- kept for debugging when schema fails
  result           jsonb,                   -- validated output only
  schema_valid     boolean,
  error_code       text
);
create unique index diagnosis_dedup_idx
  on battle_pass_private.diagnosis_requests (run_id, coalesce(tick_code,''))
  where route = 'ai' and schema_valid;
```

---

## 4. RPC contract

### 4.1 Operational Controls

| RPC | Return | Guard |
|---|---|---|
| `battle_pass_run_now()` | `{actionId, requestId, requestedAt, reused}` | `require_operator()` + advisory lock `bp-run-now` + 60s dedup + `enabled=true` required |
| `battle_pass_retry(p_period text)` | `{actionId, requestId, requestedAt, period, reused}` | operator + period regex + `>= '2026-10'` + automation enabled + shared `battle-pass:production` advisory lock + refuse if `state='complete'`, if a live lease exists, if **any** `checkpoint->'hold'` is present, or if `state <> 'failed'` |
| `battle_pass_set_automation(p_enabled bool)` | `{enabled, changed, actionId}` | operator + idempotent (same state → `changed:false`, no log row) |
| `battle_pass_action_status(p_action_id bigint default null)` | Same shape as readiness_status | operator |
| `battle_pass_audit_trail(p_limit int default 50)` | `{actions:[...]}` | operator |

`require_operator()` copies the `require_readiness_user()` logic exactly (owner UUID `5abad25d…` or anyone with a `google_connection`) to keep one consistent permission model.

**Retry design note (changed during implementation, 2026-09-15)**: Retry no longer clears
`checkpoint->'hold'` or resets `state`. It mutates nothing in `monthly_runs` — it only
verifies the period is genuinely retryable, logs the attempt with a sanitized
`before_state`, and calls `dispatch('run')` so the run happens now rather than at the next
30-minute tick. This works because `battle_pass_production_claim` already re-claims a
`failed` run whose source fingerprint still matches and which carries no hold. Clearing a
hold from an operator button would risk producing output from a stale loot snapshot, which
`bp-runbook.md` explicitly forbids — so **any** hold blocks retry with a clear message
directing the operator to reconcile the source first. This also means the whole of 2B.1
writes to exactly one column of production state (`monthly_settings.enabled`, via
pause/resume) and nothing else.

### 4.2 Diagnosis

| RPC | Caller | Return |
|---|---|---|
| `battle_pass_diagnosis_route(p_run_id uuid)` | UI + Edge Function | `{route, reason, code, runbookRef, recoveryHint, gateCounters}` |
| `battle_pass_diagnosis_context(p_run_id uuid)` | **Edge Function only** (granted to a dedicated service role) | Sanitized payload — see §6 |
| `battle_pass_diagnosis_save(p_run_id uuid, p_payload jsonb, p_meta jsonb)` | Edge Function only | `{diagnosisId, schemaValid}` |
| `battle_pass_diagnosis_get(p_run_id uuid)` | UI (authenticated) | `{route, result, agentVersion, requestedAt}` |
| `battle_pass_request_diagnosis(p_run_id uuid)` | UI — manual button | `{diagnosisId, requestId, reused}` |

---

## 5. Routing logic (cost control — most important part)

`battle_pass_diagnosis_route(run_id)` decides in order, **stop at first match**:

```
1. tick.status in (complete, waiting_confirmation, needs_data,
                    no_pending_month, disabled, busy, in_progress,
                    readiness_checked, google_write_checked)
   -> route = 'none'                                    [no AI]

2. tick.status in (source_blocked, review_required)
   -> route = 'runbook'   (deterministic — recovery path already known)

3. tick.code exists in error_catalog AND ai_eligible = false
   -> route = 'runbook'   (return recovery_hint)

4. an existing schema_valid diagnosis for (run_id, code) exists
   -> route = 'none'      (return the cached one)

5. AI calls today >= ai_daily_cap (default 20)
   -> route = 'none', reason = 'rate_limited'

6. tick.status = 'failed' AND (
     code is null                                   -- ambiguous
     OR code not in error_catalog                   -- unknown
     OR count(ticks in last 7 days with same code) >= 2   -- repeated
   )
   -> route = 'ai'                                   [call AI]

7. else -> route = 'none'
```

**Manual override**: `battle_pass_request_diagnosis()` can force `route='ai'`, but it still counts against the daily cap and still dedups — an operator can investigate a case the rule engine didn't flag without uncontrolled cost.

**Auto-trigger**: not needed for MVP — call from the UI when an operator opens a failed run (lazy), so the worker itself is never touched, matching constraint #2.

---

## 6. Sanitization contract (what the AI is allowed to see)

### `battle_pass_diagnosis_context()` sends

```json
{
  "schemaVersion": "1.0",
  "run": { "runId": "<uuid>", "period": "2026-10", "status": "failed",
           "code": "google_rate_limited", "stage": "create_cr",
           "checkedAt": "...", "state": "failed",
           "checkpointKeys": ["brief","hold"],
           "held": true, "holdReason": "source_changed" },
  "issues": ["source_not_confirmed"],
  "lastSuccess": { "period": "2026-09", "stage": "complete",
                   "checkpointKeys": ["brief","cr","slide"] },
  "recentSameCode": { "count": 3, "windowDays": 7 },
  "catalog": { "known": false, "runbookRef": null }
}
```

### Never sent (enforced in SQL as an allowlist build, not a blacklist strip)

email · `users.display_name` · any user UUID · Google file/folder/slide ID · `source_snapshot` (contains loot/pricing) · `source_fingerprint` · vault secret · token · `checkpoint` **values** (only keys are sent).

- `checkpointKeys` via `jsonb_object_keys`, filtered by `^[a-z_]{1,40}$`
- `holdReason` filtered by `^[a-z0-9_]{1,50}$`
- every outgoing string field must pass the same regex-allowlist pattern used in `readiness_status` (lines 74–84)

---

## 7. Alpha output format (verified against the real Super Agent, id `27054`)

**Correction vs. the original draft**: Alpha Intelligence Super Agents do not accept
structured JSON input or return a JSON-schema-validated output over the API. The
`/run` endpoint takes one free-text `query` string and returns one free-text `answer`
string. There is no per-agent "structured output" toggle in the Super Agent builder
(that appears to be a Workflow-app-only feature). So validation happens by **parsing a
fixed text format**, not by JSON Schema.

The agent (`FlowMate Diagnosis Agent`, id `27054`) already has this exact output format
baked into its instruction, unchanged from the existing draft:

```
Diagnosis:
...

Evidence:
...

Impact:
...

Recommended action:
...

Risk: Low | Medium | High
Confidence: __%
```

### Parsing contract

The Edge Function extracts 5 fields from `data.outputs.answer` with one regex per
section header (`^Diagnosis:\s*([\s\S]*?)\n\nEvidence:`, etc.), then validates:

| Field | Rule |
|---|---|
| `diagnosis` | 20–400 chars after trim |
| `evidence` | non-empty after trim |
| `impact` | non-empty after trim |
| `recommendedAction` | must contain one of the allowlisted phrases below (matched case-insensitively as a substring, since the model writes prose, not a code) |
| `risk` | matches `Risk:\s*(Low|Medium|High)` anywhere in the tail of the answer (observed in testing: the model sometimes puts `Risk:` and `Confidence:` on the same line instead of separate lines — parser must not require a line break between them) |
| `confidence` | matches `Confidence:\s*(\d{1,3})%`, value 0–100, same tolerance as above |

**Recommended-action allowlist** (advisory only — no executor exists in MVP; the parser
maps recognized prose onto one internal code, defaulting to `manual_review` if no phrase
matches): `retry_run` · `resume_from_create_cr` · `revalidate_source` ·
`wait_for_confirmation` · `manual_review` · `no_action`

**Validation failure** — if all 5 sections aren't present and well-formed, or `risk`/
`confidence` don't parse → `schema_valid=false`, store the raw text in `raw_response`,
UI shows "AI diagnosis unavailable" + runbook fallback.

No string in the parsed result may contain `<`, `>`, or a backtick before being stored
(strip or reject — prevents HTML injection in the UI).

**Confidence gate**: parsed `confidence < 60` → UI shows a "low confidence" badge and
hides `recommendedAction` (still shows `diagnosis`).

Internally, `battle_pass_diagnosis_save()` still stores the same normalized shape as the
original schema draft (`rootCauseCode` is set to the mapped `recommendedAction` code
rather than a separate model-produced field, since the agent's prose format has no
distinct root-cause code slot):

```json
{
  "schemaVersion": "1.0",
  "diagnosis": "...",
  "evidence": "...",
  "impact": "...",
  "recommendedAction": { "code": "resume_from_create_cr", "raw": "..." },
  "risk": "low",
  "confidence": 94
}
```

---

## 8. Edge Function `ai-diagnosis`

Calls the real, verified Alpha Super Agent API for agent `27054` in project
`Intelligence` at `ai.insea.io`.

```
POST /functions/v1/ai-diagnosis
Header: x-battle-pass-token: <vault secret — same pattern as production>
Body:   { "runId": "<uuid>", "manual": false }
```

Flow:

```
1. Verify token (compare against vault, length > 40 — copy of battle_pass_production_context)
2. rpc battle_pass_diagnosis_route(runId)
   -> route != 'ai'  ->  200 { skipped: true, route, reason }   [no Alpha call, no cost]
3. rpc battle_pass_diagnosis_context(runId)  -- sanitized JSON per §6
4. Serialize that JSON into a single text query, e.g.:
   "Diagnose this Battle Pass run using only the data below.\n\n<sanitized JSON>"
5. POST https://ai.insea.io/api/superagents/{ALPHA_SUPERAGENT_ID}/run{ALPHA_ENV_SUFFIX}?stream=false
   Header: Authorization: Bearer {ALPHA_API_KEY}
   Body (application/json): { "query": "<serialized text>" }
   - non-streaming (stream=false)
   - no conversation_id (each diagnosis is a fresh, single-turn call — §10 of the source
     summary explicitly does not require conversation_id for a single diagnosis run)
   - timeout 60s, retry once only on 429/5xx, 3s backoff
   - ALPHA_ENV_SUFFIX = "/dev" while unpublished, "" once the agent is Published — the
     Super Agent must be Published before this points at a stable endpoint; publishing is
     a state change and needs the user's sign-off first (see §14)
6. Parse data.outputs.answer per §7; set schema_valid accordingly
7. rpc battle_pass_diagnosis_save(runId, payload, { alphaRequestId: data.request_id,
   latencyMs: data.data.elapsed_time_ms, schemaValid, agentVersion: ALPHA_AGENT_VERSION })
8. Return { diagnosisId, schemaValid }
```

**Real response shape** (non-streaming, confirmed from the Integrate tab):

```json
{
  "request_id": "req_123456",
  "data": {
    "consumed_tokens": 17,
    "status": "succeeded",
    "inputs": { "query": "..." },
    "outputs": { "answer": "Diagnosis:\n...", "conversation_id": "..." },
    "elapsed_time_ms": 1830,
    "started_at": 1234567890,
    "finished_at": 1234567892,
    "usage": { "...": "..." }
  },
  "error": null
}
```
Treat `data.status !== 'succeeded'` or a non-null `error` the same as a schema failure.

**Secrets** (Supabase secrets / vault — never in the repo, never entered into any file by
Claude): `ALPHA_API_KEY` · `ALPHA_SUPERAGENT_ID` (`27054`) · `ALPHA_AGENT_VERSION`
(informational label only, stored for audit — the real API has no version-pin parameter,
so "pinning" in practice means not re-pointing `ALPHA_SUPERAGENT_ID` without a deliberate
change) · `ALPHA_BASE_URL` (`https://ai.insea.io`).

---

## 9. RAG knowledge base (loaded into Alpha)

Drafted and saved to `docs/alpha-rag/` (built from the real SQL/TypeScript, not
speculation — see stage list in `production-runner.ts` and the 32-entry `SAFE_CODES` set):

1. `bp-architecture.md` — the 11 real worker stages, start → post_finalize_recheck
2. `bp-error-dictionary.md` — all 32 codes from `SAFE_CODES` + `request_timeout` /
   `validation_failed`, each with stage and recovery guidance
3. `bp-runbook.md` — code → recommended action mapping, grouped by stage
4. `bp-state-machine.md` — every real `production_ticks.status` value and `checkpoint` key
5. `bp-policy.md` — hard rules (already mirrored in the agent's own instruction) + risk
   classification guide + confidence scoring guide

**Done and verified 2026-09-15**: Knowledge base "Battle Pass Automation" created in
project `Intelligence`, all 5 files uploaded, attached to agent `27054`, agent Published.

**Critical setup step, easy to miss**: each attached Knowledge card has its own
**Description** field (in "Edit tool" on the Knowledge card). It is not just documentation
— it appears to be what the model uses to decide *when* to consult that knowledge at all.
With it left empty, two test diagnoses came back generic and, in the high-risk
`source_changed_after_finalize` case, recommended re-running finalize — exactly the
action `bp-policy.md` forbids. After filling in a description telling the agent to always
search this knowledge for the run's code/stage and follow its risk/action mapping, the
same two tests came back correct: `google_write_or_revision_rejected` → Risk Low,
`retry_run`; `source_changed_after_finalize` → Risk High, `manual_review` only, citing
the runbook's stale-snapshot warning almost verbatim. **Do not attach Knowledge without
filling in this description — verify with a test query before trusting any agent's RAG.**

---

## 10. UI — additions to `home/battle-pass-status.html`

Two new sections:

**Operator Controls** — 4 buttons mirroring the verified readiness buttons (disabled while pending, poll status, show a `reused` badge).
- Retry requires a confirm dialog and shows `before_state`.
- Pause/Resume always reflect current state from the monitor.

**AI Diagnosis panel** — shown per failed run:

```
route = 'none'    -> panel hidden
route = 'runbook' -> shows recovery_hint + runbookRef (no AI badge)
route = 'ai'      -> "Diagnose" button -> poll -> render
```

Rendered diagnosis: `diagnosis` · `impact` · `recommendedAction` (read-only text, **no execute button**) · `risk` badge · `confidence` % · `agentVersion` footer.

This is where the "AI must not touch production" constraint is visible in the UI itself: the recommendation is text, and taking action is a 2B.1 button a human presses.

---

## 11. Build order (atomic, independently testable)

| # | Deliverable | Acceptance |
|---|---|---|
| 1 | `battle_pass_operator_actions.sql` — table + `require_operator()` + audit RPC | audit trail returns `[]`; anon is refused |
| 2 | `battle_pass_operator_toggle.sql` — pause/resume | toggle twice → 2 log rows; toggle to same value → `changed:false`, no log row |
| 3 | `battle_pass_operator_run.sql` — run_now | click twice within 60s -> `reused:true`, single ledger row (matches request 37244 case) |
| 4 | `battle_pass_operator_retry.sql` — retry | retry on `complete` run -> raises; retry on `hold` run -> clears + dispatches |
| 5 | `battle_pass_error_catalog.sql` — table + seed every real worker code | at least 15 codes, each with a `recovery_hint` |
| 6 | `battle_pass_diagnosis.sql` — 3 tables + `route()` + `context()` + `save()` + `get()` | unit test all 7 route branches; `context()` never leaks email/UUID/fileId |
| 7 | `supabase/functions/ai-diagnosis/index.ts` + `.test.ts` | all 6 schema-validation rules covered; route != ai never calls Alpha |
| 8 | Alpha Super Agent + 5 RAG files + pinned version | sanitized context from 5 historical cases -> 5/5 valid schema |
| 9 | `home/assets/battle-pass-operator.js` + `-diagnosis.js` + CSS + HTML | button pending/disabled states correct; no execute button on the diagnosis panel |
| 10 | Test suite extends existing 27/27 | existing suite still passes 27/27, plus 30+ new tests |

---

## 12. Assumptions

1. `dispatch('run')` called from an RPC is safe because the worker already holds `pg_advisory_xact_lock('battle-pass:production')` plus a lease and `on conflict do nothing` — it self-deduplicates against the cron tick.
2. `production_ticks.run_id` is the primary key -> 1 run = 1 tick, so counting repeated codes across ticks is valid.
3. ~~The Alpha Super Agent API accepts/returns JSON per the `/api/superagents/{id}/run` pattern — must be verified against the real API before starting step 7.~~ **Verified 2026-09-15** against the live agent (`ai.insea.io`, project `Intelligence`, agent id `27054`). Real contract: free-text `query` in, free-text `answer` out (§7/§8), not JSON. The agent already exists with the right instruction/safety rules/output format — it does not need to be built from scratch, only extended with Knowledge (RAG) and, once ready, Published.
4. `require_operator()` uses the same permission set as readiness for MVP; roles are not split yet.
5. October is not yet confirmed (`sourceReady=false`) -> testing uses sanitized historical incidents, not a live production run.
6. The API key generated for agent `27054` is held by the user (not stored by Claude in any file) and must be placed in Supabase Vault as `ALPHA_API_KEY` before step 7 can be implemented.
7. Publishing the Super Agent (needed to move off the `/run/dev` test endpoint) is a state change the user must explicitly approve — Claude will not click Publish unilaterally.

## 13. Edge cases requiring manual review (not silently ignored)

- **Retry after `source_changed`** — the fingerprint has already changed; a retry could produce output from a new loot set. Should block and force re-validation first.
- **Pause while a run is in flight** — `enabled=false` does not kill a run that already holds a lease. UI must state clearly that it takes effect next cycle.
- **Alpha responds slower than 60s** — store as `error_code='alpha_timeout'`, keep the ledger row (removing it would break dedup).
- **Alpha returns valid schema but wrong content** — MVP cannot detect this; requires manual evaluation of 5 cases before enabling.
- **`error_catalog` not kept current** — new codes route to `'ai'` every time, growing cost. Needs a weekly review to add entries.
- **Daily cap hit during a real incident** — cap of 20 may not be enough. Manual override should be able to bypass the cap but must log clearly when it does.

---

## Suggestions (not yet acted on)

- Steps 1-5 (2B.1) don't need Alpha at all and can ship as an independent release before 2B.2.
- The weekly `error_catalog` review (reading tick codes not yet in the catalog, drafting a `recovery_hint` for review) is a good candidate for a reusable Claude Skill.
