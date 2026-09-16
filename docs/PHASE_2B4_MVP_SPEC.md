# FlowMate Phase 2B.4 MVP Spec — Controlled Recovery (human-approved retry)

Status: draft dev spec, **revision 2** — not approved, no code written
Scope: AI-suggested actions surfaced for explicit human approval or rejection inside FlowMate; `retry` is the only executable action
Out of scope: any AI write tool · new MCP tool of any kind · Run Now / Pause / Resume by AI · clearing a hold · releasing a review · SeaTalk approval (Phase 3) · auto-approval of anything
Source docs: `PHASE_2B_MVP_SPEC.md` (§2 constraints, §6 sanitization, §7 output format), `PHASE_2B3_MVP_SPEC.md` (§11.3), `bp-policy.md`, `bp-runbook.md`
Verified against code: `battle_pass_operator_retry.sql`, `battle_pass_operator_actions.sql`, `battle_pass_diagnosis.sql`, `supabase/functions/ai-diagnosis/parse.ts`, `supabase/functions/ai-diagnosis/index.ts`

> **Revision 2 changelog** — seven issues raised on revision 1, all resolved here:
> duplicated eligibility logic (§3), the retry-only vs `action_not_supported` contradiction
> (§4), Dismiss made an explicit permanent rejection (§7), fingerprint validation added on top
> of timestamp freshness (§5.3), loop breaker promoted from suggestion to a required guard and
> build step (§5.5), sanitization clarified to exclude *person* identifiers and not operational
> run ids (§6.3), and explicit `security definer` / search-path / grant rules plus a versioned
> audit snapshot (§8).

---

## 0. The headline: this phase grants the AI nothing

The roadmap called 2B.4 "Controlled Recovery (write tools)". With the execution model settled
as **AI proposes, human approves**, no write tool is needed — the proposing half already exists
and has been in production since 2B.2.

`parse.ts` already extracts `recommendedAction.code` from every diagnosis, and
`battle_pass_diagnosis_save` already stores it in `diagnosis_requests.result`. A stored
diagnosis saying `retry_run` **is** the proposal.

So 2B.4 is: read what the AI already wrote, show it with its evidence and a live safety check,
and let a human press the button that already exists.

| | Before 2B.4 | After 2B.4 |
|---|---|---|
| AI can call a write RPC | no | **still no** |
| New MCP tool | — | **none.** `READ_RPCS` in `tools.ts` stays at 6 |
| New Alpha capability | — | **none.** No agent, instruction, or Knowledge change |
| Anything granted to `service_role` | — | **nothing.** See §8.2 — this is the load-bearing grant rule |
| `§2` constraint "AI must never touch production state" | holds | **holds, unamended** |

### 0.1 The actual risk is automation bias, not AI privilege

A human approving a machine-suggested action with less scrutiny than they would apply to their
own decision, because it arrives pre-reasoned, confident, and one click away.

Every design choice below counters that specific failure:

- evidence renders before the recommendation, enforced by a test
- the approve control is `disabled`, never enabled-with-a-warning, whenever a guard fails
- a diagnosis whose underlying state has moved cannot be approved at all (§5.3)
- `risk: high` is never approvable in this surface
- the approver passes back the action code they believe they are approving
- rejecting is an explicit, permanent, recorded decision — not a "hide this card" gesture (§7)
- no bulk approve, no default-yes, no shortcut key

---

## 1. Why `retry` is the only executable action

`battle_pass_retry(p_period)` is the right first action because of what it does **not** do —
quoting its own design note:

> "This function mutates NOTHING in monthly_runs. It does not clear `checkpoint->'hold'`,
> does not reset state, does not touch the lease."

It verifies the period is retryable, logs the attempt, and calls `dispatch('run')` so the run
happens now rather than at the next 30-minute tick.

The dangerous action — clearing a hold — is deliberately absent from 2B.1 and stays absent
here. `bp-runbook.md` forbids it because output could then come from a stale loot snapshot, and
2B.2 §9 recorded the agent recommending exactly that in the `source_changed_after_finalize`
case before its Knowledge description was fixed. **A proposal on a held run must therefore
never render as approvable** (§5.6).

---

## 2. Data model

### 2.1 `recovery_decisions` — a decision log, not a proposal queue

Pending proposals are **derived** at read time from diagnoses that already exist. A row is
written only when a human decides something.

Why, rather than a queue table the AI path fills in:

- nothing new is ever written by the AI path, so §0's claim stays literally true
- proposals cannot go stale in storage — a derived proposal stops appearing the moment its run
  is no longer eligible, so there is no aged queue inviting a rubber stamp
- the table answers the question an audit actually asks: *what did a human decide, when, and
  what were they looking at*

```sql
create table if not exists battle_pass_private.recovery_decisions (
  decision_id     bigserial primary key,
  diagnosis_id    bigint not null,
  run_id          uuid not null,
  target_period   text not null,
  proposed_action text not null check (proposed_action in ('retry')),
  decision        text not null check (decision in ('approved','rejected')),
  decided_at      timestamptz not null default clock_timestamp(),
  decided_by      uuid not null references public.users(id),
  note            text,
  action_id       bigint,                      -- operator_actions row; null when rejected
  shown           jsonb not null default '{}'::jsonb   -- versioned, see §8.3
);
create unique index if not exists battle_pass_recovery_one_decision_idx
  on battle_pass_private.recovery_decisions (diagnosis_id);
create index if not exists battle_pass_recovery_period_idx
  on battle_pass_private.recovery_decisions (target_period, decided_at desc);
create index if not exists battle_pass_recovery_decided_at_idx
  on battle_pass_private.recovery_decisions (decided_at desc, decision_id desc);
alter table battle_pass_private.recovery_decisions enable row level security;
revoke all on battle_pass_private.recovery_decisions from public, anon, authenticated;
revoke all on sequence battle_pass_private.recovery_decisions_decision_id_seq
  from public, anon, authenticated;
```

`decided_by uuid not null` is load-bearing: a decision with no human attached cannot be
recorded, which is what makes "a human approved this" a fact rather than a claim.

The unique index makes approval single-use — one AI diagnosis buys one decision, ever.

The `(target_period, decided_at desc)` index exists for the loop breaker in §5.5.

### 2.2 One change to a 2B.2 object: `context_fingerprint`

Fingerprint validation (§5.3) needs to know what state the AI reasoned about.
`diagnosis_requests` does not currently record it — only `result`, `raw_response` and meta. So
one nullable column is added, and the Edge Function starts populating it:

```sql
alter table battle_pass_private.diagnosis_requests
  add column if not exists context_fingerprint text;
```

`battle_pass_diagnosis_save` gains one line: accept `p_meta->>'contextFingerprint'` when it
matches `^[0-9a-f]{32}$`, else null. `ai-diagnosis/index.ts` computes it from the context it
received and passes it in `p_meta`.

**Legacy rows fail closed.** A diagnosis with a null `context_fingerprint` is *not approvable*
(`blockedBy: ['no_fingerprint']`). Only diagnoses created after 2B.4 ships can be approved.
This costs nothing today — there are no failed production runs, so there is no backlog of AI
diagnoses to lose — and it means the fingerprint guard can never be silently skipped.

---

## 3. Single source of truth for retry eligibility

Revision 1 had a `retryable_now()` helper that *mirrored* `battle_pass_retry`'s guards. That is
two copies of one rule set, free to drift, with the preview saying "approvable" while execution
raises. Removed.

### 3.1 Three functions, one rule set

**Revised during step 1 implementation.** The sketch above had a single
`retry_eligibility(p_period, p_for_share)`. That does not survive contact with Postgres
volatility rules: `SELECT ... FOR SHARE` takes a row lock, which does not belong in a `STABLE`
function, and §6.1's proposals RPC needs to be `STABLE` so Postgres itself refuses any write
inside it. Splitting the *rules* out of the *reads* resolves it:

```sql
-- battle_pass_private.retry_reason(
--   p_period text, p_enabled boolean, p_found boolean,
--   p_state text, p_lease_active boolean, p_hold text) returns text
--   IMMUTABLE. The rules. No reads, no clock, no raise.
--   null when eligible, else one of:
--   'bad_period' | 'automation_paused' | 'no_run' | 'already_complete'
--   | 'run_in_flight' | 'held' | 'not_failed'

-- battle_pass_private.retry_eligibility(p_period text) returns jsonb
--   STABLE. Reads current state, asks retry_reason, reports.
--   { ok, reason, runId, period, state, held, holdReason, leaseActive, automationEnabled }
```

| Caller | Concurrency | How it uses the rules |
|---|---|---|
| `battle_pass_retry` (execution) | keeps its own `pg_advisory_xact_lock('battle-pass:production')` and `SELECT … FOR SHARE` | calls `retry_reason` with the values it loaded, raises per reason |
| `battle_pass_recovery_proposals` (preview) | none — `STABLE`, no lock, no row lock | calls `retry_eligibility`, renders the reason |

`p_lease_active` is a boolean rather than the raw `lease_until`, because comparing against
`clock_timestamp()` inside `retry_reason` would make it non-`IMMUTABLE`. The caller does the
comparison; the rules stay pure.

**This is also what makes step 1 testable with no data at all.** `retry_reason` is a pure
function, so every reason code and every ordering precedence is provable by calling it with
literal arguments — no synthetic `monthly_runs` rows, nothing written to a production table.
That matters here, because fabricating `mode='production'` rows to test eligibility would be
touching the very state this phase is built to protect.

### 3.2 Deliberate null behaviour, preserved in two places

`plpgsql`'s `IF null THEN` does not fire, and 2B.1's guards are written as bare comparisons, so
two of them let a null fall straight through. `retry_reason` reproduces both exactly, each with
a comment saying so. Wrapping either in `coalesce()` would be a silent behaviour change to a
live control.

| Guard as written in `battle_pass_retry` | With a null input | Reason reported |
|---|---|---|
| `if p_period !~ '…' or p_period < '2026-10' then` | both comparisons null → `IF` skipped | falls through to the run lookup → `no_run`, **not** `bad_period` |
| `if r.state <> 'failed' then` | `null <> 'failed'` is null → `IF` skipped | falls through → **eligible**, not `not_failed` |

The second row was found by step 1's own verify script: the test case asserted `not_failed` for
a null state and failed, because the function was right and the expectation was wrong.

**Is a null state reachable?** Every insert and update in `battle_pass_production.sql` sets
`state` to a literal (`'running'`, `'failed'`, `'complete'`), and the column predates that file,
so its nullability is not visible from the 2B code. The verify script therefore *reports* it
(`monthly_runs_state_nullable`) and counts any production row that actually has one
(`no_production_run_has_null_state`, which must be 0) rather than assuming either way:

- `state` is `NOT NULL` → the quirk is unreachable and harmless
- `state` is nullable → a null-state production run is **silently retryable in 2B.1 today**.
  That is a latent gap in shipped code. Log it and fix it in its own change; do not patch it
  inside 2B.4, for the same reason the two `held` notions are not reconciled here (§11).

### 3.3 `battle_pass_retry` is refactored to use it

This is a change to **shipped, live 2B.1 code**, so it is treated as one:

- the refactor is behaviour-preserving by construction: `battle_pass_retry` keeps its own
  `require_operator()`, period regex, lock, dedup and ledger insert, and replaces only its
  inline guard block with `retry_eligibility(p_period, true)` plus a `case` that raises the
  same message and errcode per reason
- errcodes are preserved exactly: `held` → `42501`, `run_in_flight` → `55006`,
  `automation_paused` → `42501`, the rest default
- build step 2 (§9) exists solely to prove this, with a test asserting each of the six raise
  paths still raises with the same errcode and the same message shape
- if any behaviour cannot be preserved, the refactor is abandoned and §3.1 is reduced to a
  read-only preview helper with a comment pointing at `battle_pass_retry` as the authority —
  duplicated, but honestly labelled. Do not ship a silent behaviour change to a live control.

---

## 4. What counts as a proposal — the action map

Revision 1 contradicted itself: §4.1 filtered to `recommendedAction.code = 'retry_run'` while
§7 claimed `resume_from_create_cr` would appear as `action_not_supported`. Both cannot be true.
Resolved by an explicit three-way mapping.

| `recommendedAction.code` | Treated as | `proposedAction` | Rendered |
|---|---|---|---|
| `retry_run` | proposal, supported | `retry` | approvable if all guards pass |
| `resume_from_create_cr` | proposal, **not supported** | null | listed, `blockedBy: ['action_not_supported']`, reject-only |
| `manual_review` | advice, not a proposal | — | **not listed.** No FlowMate action exists to approve |
| `no_action` | advice, not a proposal | — | not listed |
| `wait_for_confirmation` | advice, not a proposal | — | not listed |
| `revalidate_source` | advice, not a proposal | — | not listed |

The distinction: a **proposal** is a recommendation that names an operator control FlowMate
has or will have. `resume_from_create_cr` names one that 2B.1 deliberately never built, so it
is surfaced-but-blocked rather than hidden — an operator should be able to see that the agent
suggested it. The four advisory codes name no control at all; they belong in the AI Diagnosis
panel (2B.2), which already renders them, and duplicating them here as permanently-blocked
cards would be noise.

`proposed_action`'s check constraint stays `in ('retry')` — an unsupported proposal can only
ever be rejected, and a rejection records `proposed_action` as the mapped value, so
`resume_from_create_cr` rejections are recorded as... nothing valid. **Therefore**: the
constraint becomes `in ('retry','resume_from_create_cr')` and `§2.1` is amended accordingly,
with only `'retry'` ever reaching the execution branch in §6.2.

---

## 5. Guards

All evaluated in SQL, both when listing (to decide whether approve is enabled) and again inside
the decide RPC, so a stale page cannot approve what the list would now refuse.

### 5.1 Proposal validity

| # | Guard | Blocked reason |
|---|---|---|
| 1 | `route='ai'` and `schema_valid` | not listed at all |
| 2 | `result->>'schemaVersion' = '1.0'` | `schema_version_unknown` |
| 3 | action maps to a proposal per §4 | not listed (advisory) |
| 4 | action is supported | `action_not_supported` |

Guard 2 addresses revision 1's assumption 3: if `parse.ts` ever changes the payload shape, the
guards reading `recommendedAction.code` / `risk` / `confidence` would otherwise break silently.
An unknown `schemaVersion` blocks rather than guesses.

### 5.2 Quality gates

| # | Guard | Threshold | Blocked reason |
|---|---|---|---|
| 5 | confidence | `>= 60` | `low_confidence` |
| 6 | risk | `<> 'high'` | `risk_high` |

60 is the floor 2B.2 §7 already uses to hide `recommendedAction` in the UI. `risk: high` means,
per `bp-policy.md`, that a wrong next action could create duplicate or incorrect production
output — those go to human investigation, not a one-click approve.

### 5.3 Freshness — three independent checks

Timestamp alone is not enough, so all three must pass:

| # | Guard | Blocked reason |
|---|---|---|
| 7 | `context_fingerprint` is not null | `no_fingerprint` |
| 8 | recomputed fingerprint of the run's **current** state equals `context_fingerprint` | `state_changed` |
| 9 | diagnosis `requested_at` within 60 minutes | `stale` |
| 10 | no `production_ticks` row for this run with `checked_at > requested_at` | `superseded` |

**Why all of them**, given they overlap:

- guard 10 catches the common case — the worker ran again and produced a new tick
- guard 8 catches changes that produce **no tick at all**: a hold added or removed directly, a
  checkpoint key appearing, `state` edited during an incident. This is the gap a
  timestamp-and-tick check leaves open, and it is exactly the class of change that makes a
  retry unsafe
- guard 9 is the backstop for drift the fingerprint cannot see (anything outside the context)
  and for a diagnosis simply being too old to act on

**Fingerprint definition** — computed identically in both places, from the same fields
`battle_pass_diagnosis_context()` sends, in a fixed canonical order:

```
md5(
  coalesce(tick.status,'')      || '|' || coalesce(code,'')        || '|' ||
  coalesce(stage,'')            || '|' || coalesce(run.state,'')   || '|' ||
  coalesce(holdReason,'')       || '|' || (held)::text             || '|' ||
  checkpointKeys_sorted_csv     || '|' || issues_sorted_csv        || '|' ||
  coalesce(period,'')
)
```

`md5` is a change detector here, not a security primitive, so core Postgres `md5()` is enough
and `pgcrypto` is not required. The canonical string builder lives in **one** private function
used by both the Edge Function's save path and the guard, for the same
single-source-of-truth reason as §3.

### 5.4 Single use

| # | Guard | Blocked reason |
|---|---|---|
| 11 | no `recovery_decisions` row for this `diagnosis_id` | `already_decided` |

Enforced twice: as a guard for a clear message, and by the unique index in §2.1 as the
race-proof backstop.

### 5.5 Loop breaker — required before rollout

Revision 1 listed this as a suggestion. It is a guard.

| # | Guard | Blocked reason |
|---|---|---|
| 12 | fewer than 2 prior **approved** retries for the same `(target_period, tick_code)` within 7 days | `repeated_failure` |

So the third approved retry of the same failure in a week is refused. Rationale: a retry that
has already failed twice on the same code is not a transient fault, and approving a third is
the shape automation bias takes when each individual approval looks locally reasonable.

`tick_code` comes from `diagnosis_requests.tick_code`, which `battle_pass_diagnosis_save`
already records, so the join needs nothing new.

The message must say what to do instead: *"this period has already had 2 approved retries for
`<code>` in the last 7 days — investigate the cause rather than retrying again."* An operator
who genuinely needs a third retry still has the unchanged manual Retry control in Operator
Controls; what is blocked is approving the **AI's** suggestion to do it again.

### 5.6 Live eligibility

| # | Guard | Blocked reason |
|---|---|---|
| 13 | `retry_eligibility(period, false).ok` | the helper's reason, verbatim |

Reasons surface as `automation_paused`, `no_run`, `already_complete`, `run_in_flight`, `held`,
`not_failed`, `bad_period`. `held` is the case that matters: the agent can and will recommend
`retry_run` on a held run, and this guard is what stops that from ever being one click from
execution.

---

## 6. RPC contract

### 6.1 `battle_pass_recovery_proposals(p_limit integer default 10)`

Operator read. Returns pending proposals newest first, **including non-approvable ones with
their blocking reasons**, so an operator can see what the agent suggested and why FlowMate will
not let them take it.

```jsonc
{ "observedAt": "...", "proposals": [
  { "diagnosisId": "41", "runId": "<uuid>", "period": "2026-10",
    "proposedAction": "retry",
    "requestedAt": "...", "agentVersion": "diagnosis-v1.0",
    "risk": "low", "confidence": 94,
    // Field order here mirrors the required render order in §7.
    "evidence": "...", "impact": "...", "diagnosis": "...",
    "recommendedActionRaw": "...",
    "approvable": false,
    "blockedBy": ["held"],          // [] when approvable; may contain several reasons
    "fingerprint": "9f2c…",         // current value, echoed back by the decide call
    "runState": { "state": "failed", "held": true, "holdReason": "source_changed",
                  "lastTickAt": "...", "lastTickStatus": "failed",
                  "lastTickCode": "source_changed_after_finalize" },
    "priorApprovedRetries": 0 } ] }
```

`blockedBy` is an array, not a single reason: an operator should see every problem at once
rather than fixing one and discovering the next.

### 6.2 `battle_pass_recovery_decide(p_diagnosis_id bigint, p_decision text, p_expected_action text, p_expected_fingerprint text, p_note text default null)`

Operator write. Two intent checksums, neither decorative:

- `p_expected_action` — the caller states which action it believes it is approving; refused if
  the stored diagnosis no longer maps to exactly that
- `p_expected_fingerprint` — the state the operator's page was showing; refused on mismatch.
  This catches drift between page load and click, while guard 8 catches drift between the
  diagnosis and the page load. Both are needed

```
1. require_operator(); auth.uid() must be non-null
2. p_decision in ('approve','reject')
3. advisory lock on hashtext('battle-pass-recovery:' || p_diagnosis_id)
4. load diagnosis + run; re-evaluate guards 1-12
5. p_expected_action must equal the mapped action; p_expected_fingerprint must equal
   the recomputed fingerprint -> raise on mismatch, write nothing
6. reject:
     insert recovery_decisions(decision='rejected', action_id=null, shown=<snapshot>)
     return { decisionId, decision:'rejected' }
7. approve:
     proposed_action must be 'retry'          -- resume_from_create_cr can only be rejected
     re-evaluate guard 13 -> raise with its reason if not ok
     insert recovery_decisions(decision='approved', shown=<snapshot>)      -- record first
     a := public.battle_pass_retry(period)                                 -- then act
     update that row's action_id from a->>'actionId'
     return { decisionId, decision:'approved', actionId, requestId, reused }
```

**Order matters in step 7: record the decision before acting.** If `battle_pass_retry` then
raises, the whole statement rolls back and nothing is recorded — correct. If it succeeds, the
decision and the action are in one transaction and cannot disagree. Acting first would allow a
retry with no decision row behind it.

Note that `battle_pass_retry` re-runs `require_operator()` and the full eligibility check
itself, under the production lock. Guard 13 in the decide RPC is therefore an early, friendly
refusal — not the security boundary. The boundary is inside `battle_pass_retry`, unchanged.

### 6.3 `battle_pass_recovery_history(p_limit integer default 50)`

Operator read over `recovery_decisions`, joined to `users.display_name` for `decidedBy` — the
same treatment `battle_pass_audit_trail` already gives (a name, never a UUID or email). Exists
so "who approved the AI's suggestion, and what did it say" is answerable without database
access.

### 6.4 Sanitization — person identifiers, not operational ones

Revision 1 said "no user id" while also returning `runId`, which read as a contradiction. The
rule is about **who**, not **what**:

| Always returned — the UI cannot work without it | Never returned |
|---|---|
| `run_id` (uuid) — the operational run identifier | `users.id` and any other person uuid |
| `diagnosis_id`, `decision_id`, `action_id` | email addresses |
| `target_period`, tick `status` / `code` / `stage` | `display_name`, except `decidedBy` in §6.3 |
| checkpoint **key names**, `holdReason` | Google file / folder / slide ids, `work_items.display_id` |
| `risk`, `confidence`, `agentVersion`, fingerprint | `source_snapshot`, `source_fingerprint` (loot and pricing) |
| diagnosis / evidence / impact text | checkpoint **values**; any token or secret |

`run_id` is an internal identifier for a production run. It identifies no person, is already
returned by `battle_pass_monitor`, `battle_pass_failed_runs` and every 2B.3 MCP tool, and the
operator UI needs it to act. It is not sensitive and is not withheld. The `§6` list in
`PHASE_2B_MVP_SPEC.md` should be read the same way — "any user UUID" means a *user's* uuid.

---

## 7. UI — one new section in `home/battle-pass-status.html`

Placed **below** Operator Controls and the AI Diagnosis panel, because it depends on both.

```
no pending proposals      -> section hidden entirely
pending, blocked          -> card + reasons; controls: Reject suggestion only
pending, approvable       -> card; controls: Approve retry | Reject suggestion (both confirm)
```

Card order, top to bottom — a safety requirement, enforced by a test, not a preference:

1. **What the worker reported** — period, state, last tick code, hold badge when held
2. **Evidence** and **Impact**
3. **Diagnosis** text
4. the AI's **recommendation**, with `risk` badge, `confidence` %, `agentVersion`
5. when blocked: every `blockedBy` reason as a sentence, e.g.
   *"Held for review (source_changed) — reconcile the source before any retry."*
6. *"This is a suggestion from the diagnosis agent. You are the decision maker. Approving
   presses the same Retry button as the Operator Controls above."*
7. controls

### 7.1 Reject is a decision, not a dismissal

Revision 1 called this "Dismiss", which implied hiding a card. It is not: the unique index in
§2.1 makes every decision single-use, so declining a suggestion **is** a permanent recorded
rejection and must be labelled as one.

- the control reads **Reject suggestion**
- its confirm dialog states: *"This permanently rejects the agent's suggestion for
  `<period>`. It cannot be approved later. You can still retry manually from Operator Controls
  at any time."*
- an optional one-line note is captured into `recovery_decisions.note`
- after deciding, the card is replaced by a result line and is inert
- rejecting is available on blocked proposals too — that is the whole point of listing them

The last clause of the dialog matters: rejecting the **suggestion** never removes the
operator's own ability to retry. Conflating the two would push operators toward approving
things they are unsure about just to keep the option open.

### 7.2 Anti-rubber-stamp requirements (all testable)

- the recommendation cannot be the first thing rendered
- `Approve retry` is `disabled` whenever `approvable` is false — never enabled-with-a-warning
- both confirm dialogs default focus to **Cancel**
- no bulk approve, no "approve all", no shortcut key, no control in the DOM that decides more
  than one proposal
- blocked reasons render as sentences, never as raw codes

---

## 8. Security requirements

### 8.1 Two tiers, not one rule

**Revised during step 1 implementation.** The first draft said "every function is
`security definer`". That is wrong for the private helpers, and less safe.

| Tier | Declaration | Why |
|---|---|---|
| Public RPCs (§6.1–§6.3) | `security definer set search_path=''` | they read `battle_pass_private.*`, which `authenticated` cannot touch directly, so they must be the privilege boundary |
| Private helpers (`retry_reason`, `retry_eligibility`, `diagnosis_fingerprint`) | `set search_path=''`, **no** `security definer` | they are only ever called from inside a definer RPC, which already supplies the privilege. Making them definer too would add nothing and create a latent hazard: if one were ever granted to a role by mistake, it would run with the owner's privileges. Left non-definer, an accidental grant is harmless — the caller's own privileges apply and `authenticated` still cannot read `battle_pass_private` |

Nested calls inherit the definer context of the calling function, so a non-definer `STABLE`
helper called from a definer RPC reads exactly what the RPC can read. Least privilege, with no
loss of function.

Common to both tiers:

- `set search_path=''` on every function, with every object reference schema-qualified
- every helper and RPC `revoke all … from public, anon, authenticated` (Postgres grants
  `EXECUTE` to `PUBLIC` by default, so the revoke is what actually locks a function down)
- read-only functions (§6.1, §6.3, `retry_eligibility`) are declared `stable`, so Postgres
  itself refuses a write inside them
- the verify script asserts `prosecdef` and that `proconfig` contains `search_path=` **or**
  `search_path=""` — both spellings, per the 2B.3 verify bug where `search_path` turned out to
  be stored quoted as a list GUC

### 8.2 Grants — the load-bearing rule

```sql
revoke all on function <each> from public, anon, authenticated;
grant execute on function
  public.battle_pass_recovery_proposals(integer),
  public.battle_pass_recovery_decide(bigint,text,text,text,text),
  public.battle_pass_recovery_history(integer)
  to authenticated;                                    -- and NOTHING else
-- private helpers stay revoked from everyone:
revoke all on function battle_pass_private.retry_eligibility(text,boolean),
  battle_pass_private.diagnosis_fingerprint(...) from public, anon, authenticated;
```

**Nothing in this phase is granted to `service_role`.** That is the single most important line
in the spec. `service_role` is what `bp-mcp` and `ai-diagnosis` hold; granting
`battle_pass_recovery_decide` to it would create precisely the AI write path §0 says does not
exist. The verify script asserts the negative:
`not has_function_privilege('service_role', <decide>, 'EXECUTE')`.

The one exception is `battle_pass_diagnosis_save`, which keeps its existing `service_role`
grant because the Edge Function must still write diagnoses — that is 2B.2's surface, unchanged,
and it writes only the diagnosis ledger.

### 8.3 The `shown` audit snapshot is versioned

```jsonc
{ "snapshotVersion": "1.0",
  "risk": "low", "confidence": 94,
  "actionCode": "retry_run", "proposedAction": "retry",
  "contextFingerprint": "9f2c…", "fingerprintAtDecision": "9f2c…",
  "diagnosisSha": "…",                 // md5 of the diagnosis text, not the text itself
  "runState": { "state": "failed", "held": false, "holdReason": null,
                "lastTickAt": "…", "lastTickStatus": "failed", "lastTickCode": "…" },
  "guards": { "evaluated": ["schema_version","confidence","risk","fingerprint","age",
                            "superseded","single_use","loop_breaker","eligibility"],
              "blockedBy": [] },
  "priorApprovedRetries": 0 }
```

`snapshotVersion` is required and checked on write. Without it, a later change to this shape
would make old audit rows silently ambiguous — the same class of problem guard 2 prevents for
`result`. `diagnosisSha` keeps the row small while still proving which text was shown.

---

## 9. Build order (atomic, independently testable)

| # | Deliverable | Acceptance |
|---|---|---|
| 1 | `supabase/battle_pass_recovery_core.sql` — `retry_reason()` + `retry_eligibility()` + `diagnosis_fingerprint()` | **done and verified 2026-09-16.** Applied with `battle_pass_recovery_core_verify.sql` all PASS: 20 pure-function rule cases covering all 7 reason codes and every ordering precedence; volatility asserted (`i`/`s`/`s`); helpers non-definer with pinned `search_path`; unreachable by `anon`, `authenticated` **and `service_role`**; fingerprint stable across calls; `battle_pass_retry`'s grants and the 30-minute cron untouched |
| 2 | Refactor `battle_pass_operator_retry.sql` onto `retry_eligibility` | **done and verified 2026-09-16.** All 7 raise paths (added `bad_period`, not just six) proven behaviour-preserving by exact-literal message/errcode comparison against the pre-refactor source, plus structural inspection of the installed `prosrc` (guard order, old literals gone, no `monthly_runs` update, no hold clearing). Found and fixed along the way: (a) `retry_eligibility` was passing a regex-filtered state into the rules instead of the raw value; (b) `service_role` had never been explicitly revoked from `battle_pass_retry` — a pre-existing gap predating 2B.4, closed via `battle_pass_retry_grant_patch.sql`. `battle_pass_recovery_retry_verify.sql` all PASS |
| 3 | `supabase/battle_pass_diagnosis_fingerprint.sql` — add `context_fingerprint`, extend `battle_pass_diagnosis_save` | **done and verified 2026-09-16.** Simplified from the original design: `battle_pass_diagnosis_context()` now returns `contextFingerprint` itself (computed by the same `diagnosis_fingerprint()` helper step 1 built, since its formula already mirrors `context()`'s fields exactly), so `ai-diagnosis/index.ts` only threads the value through into `battle_pass_diagnosis_save`'s `p_meta` — it computes nothing. Stripped from the prompt text sent to Alpha. `battle_pass_diagnosis_fingerprint_verify.sql` all PASS (grants unchanged, `context()`'s reported fingerprint matches the shared helper exactly, legacy rows stay null); `index.test.ts` 27/27, full suite 53/53 |
| 4 | `supabase/battle_pass_recovery.sql` — `recovery_decisions` + proposals RPC | **SQL done and verified 2026-09-16.** `battle_pass_private.recovery_guards()` evaluates all 13 guards in one shared function (reused by step 5's decide RPC); `battle_pass_recovery_proposals()` ships read-only, operator-gated, proactively revoked from `service_role` (applying the step-2 lesson forward instead of waiting for a verify script to catch it). `battle_pass_recovery_verify.sql` all PASS (grants, RLS, indexes, constraints, proposals' own filtering agrees with an independently-run guard check). Two bugs found and fixed along the way: a bare scalar subquery for constraint checks raised "more than one row" (switched to `bool_or`), and `text[] \|\| 'literal'` inside `recovery_guards()` raised "malformed array literal" (Postgres resolved the untyped string constant against `array\|\|array` instead of `array\|\|element` - fixed with explicit `::text` casts). **e2e-verified 2026-09-16** by `battle_pass_recovery_e2e_test.sql` (23/23 PASS) - every `blockedBy` code reproduced on a synthetic row (period `2099-1{0,1,2}`, never colliding with a real period), the advisory-only action code confirmed absent from the list, and the already-decided diagnosis confirmed absent too. One bug found and fixed while writing the harness: the reject-flow test itself passed the wrong `p_expected_action` (`null` instead of `'retry'`), tripping the very checksum it wasn't supposed to be testing - fixed to read the value from `recovery_guards()` dynamically instead of assuming it. |
| 5 | `supabase/battle_pass_recovery_decide.sql` — decide RPC + history RPC | **done and e2e-verified 2026-09-16.** Approve refuses on ANY unmet guard (not only guard 13 - a deliberate strengthening of the literal spec wording, documented in the file's header: `recovery_guards()`'s single `approvable` flag already folds guard 13 in alongside every other guard, so there was never a reason to special-case it). Decision is recorded before `battle_pass_retry` is called, so a failed retry never leaves an orphan decision row. `service_role` proactively revoked. Structural checks all PASS in `battle_pass_recovery_verify.sql`. `battle_pass_recovery_e2e_test.sql` proved behaviourally: reject succeeds and inserts one row with a null `action_id`; approve on a blocked case raises and writes nothing; wrong `p_expected_action` and wrong `p_expected_fingerprint` each raise their own distinct message; a second decision on the same diagnosis raises; `history()` returns a display name, never the decider's uuid. **Deliberately not tested**: a real approve reaching `battle_pass_retry` and dispatching - reserved for step 9's own acceptance, never triggered by a routine test file (see that file's header) |
| 6 | `supabase/battle_pass_recovery_verify.sql` | grants, RLS, unique index, `decided_by not null`, `prosecdef`, pinned `search_path` (both spellings), **`service_role` cannot execute the decide RPC**, and no 2B.1/2B.2/2B.3 grant changed. **Done** - folded into the same file steps 4 and 5 already used, rather than a separate file, since both target the same object set |
| 7 | `battle-pass-recovery.js` + CSS + section in `home/battle-pass-status.html` | **built 2026-09-16.** Disabled states match `approvable`; recommendation never renders above evidence; reject and approve dialogs each state what pressing them does and that manual retry stays available. **Two open judgment calls, not yet ruled on**: (a) native `confirm()` cannot default focus to Cancel — kept for consistency with `battle-pass-operator.js`'s existing pattern, would need a custom modal project-wide to fix; (b) a blocked proposal renders Approve **disabled, not absent** — read §7.2's "testable" framing as intending the always-present-but-disabled control, even though the state table elsewhere says "Reject suggestion only" |
| 8 | `src/lib/battle-pass-recovery.test.ts` | **done 2026-09-16, 24/24 PASS.** Labels cross-checked against `recovery_guards()`'s literal reason codes (plus guard 13's folded-in eligibility reasons) so Thai text can't drift from the database; every blocked reason renders its sentence and never the raw code; render order asserted (evidence → impact → diagnosis → recommendation → blocked reasons → disclaimer → controls); Approve disabled exactly when `approvable` is false, Reject never disabled; no bulk/multi-decide control anywhere in the DOM; decide RPC receives the checksum values captured in the card's `dataset` at render time, not re-fetched; a cancelled `confirm()` sends no RPC; a decided proposal disappears after reload; full existing suite re-run clean (no regression outside two pre-existing, unrelated failing suites in other worktrees) |
| 9 | Acceptance against a real failure — §10.1 | one approved retry end to end, decision row and operator action row agreeing; one rejection recorded; loop breaker verified at the third attempt |

Steps 1 and 3–6 are pure SQL and safe to apply: nothing they create is reachable by `anon`, and
the decide RPC cannot act until an operator calls it. **Step 2 touches live 2B.1 code** and is
the only step in this phase that can regress something already in production — review it on its
own and run the full existing suite, not just the new tests.

---

## 10. Assumptions

1. There is currently **no failed production run** (confirmed 2026-09-15 during 2B.3 live
   testing: no `failed` status in the last 10 ticks) and October is unconfirmed. Steps 1–8 are
   testable only against synthetic rows.
2. `require_operator()` remains the single permission model, shared with 2B.1. Anyone who can
   press Retry manually can approve an AI-suggested retry. Roles are still not split.
3. `result` keeps the §7 shape. Guard 2 now enforces this rather than assuming it.
4. 60 minutes (guard 9), the newer-tick rule (guard 10) and 2-prior-retries-in-7-days
   (guard 12) are first guesses. Revisit after the first real decisions.
5. The agent produces `Risk: Low` far more often than `Medium` or `High`. If nearly everything
   arrives low-risk and high-confidence, guards 5–6 do little work and the §7 render order
   carries most of the anti-bias weight.
6. `md5` collision risk is irrelevant here: the fingerprint detects change, and an adversary
   able to choose production state values is already inside the trust boundary.

## 11. Edge cases requiring manual review (not silently ignored)

- **The AI recommends retry on a held run.** Expected, will happen, and is the most important
  case: `blockedBy: ['held']`, no approve control, reason in words. Do not soften to a warning.
- **Two notions of "held" already disagree in shipped code** (found during step 1).
  `battle_pass_retry` blocks on the *presence* of a `checkpoint->'hold'` key, whatever its
  value. `battle_pass_diagnosis_context` reports `held` only when the value matches
  `^[a-z0-9_]{1,50}$`. So for a hold value failing that regex, the agent is told `held: false`
  while the retry control refuses with `held`. Every hold the worker writes today is a
  lowercase word, so they agree in practice. Step 1 mirrors each faithfully in its own place —
  `retry_reason` unfiltered, `diagnosis_fingerprint` filtered — rather than silently
  reconciling them, because reconciling changes what the agent is told and belongs in its own
  change with its own test. Worth fixing deliberately later; not worth smuggling into 2B.4.
- **A hold appears with no new tick.** This is why guard 8 exists and guard 10 alone is not
  enough. Verify it with a synthetic row that changes `checkpoint` without inserting a tick.
- **Approval races the worker.** `battle_pass_retry` holds the production lock and refuses a
  live lease, so the race is handled — but the UI must re-fetch after a decision rather than
  assume success.
- **Approve fails after the decision row is inserted.** Impossible to observe: one transaction,
  so a failed retry rolls the decision back too. Worth a test asserting no orphan row.
- **The third retry is genuinely the right call.** Guard 12 blocks approving the AI's
  suggestion, not the operator's own judgement — manual Retry stays available. If this proves
  annoying in practice, raise the threshold deliberately rather than removing the guard.
- **An operator approves without reading.** Unfalsifiable from the database, which is why
  `shown` is recorded: it makes *what was in front of them* auditable after the fact.
- **`users.display_name` in `recovery_history`.** A name is exposed to other operators by
  design, same as `battle_pass_audit_trail`. This RPC is not reachable from the MCP path.

### 10.1 Acceptance without a real failure

Step 9 needs a failed run. Options, in preference order: wait for a genuine October failure;
or induce one in a **non-production** mode/period so `mode='production'` rows are never
touched — note `battle_pass_retry` hard-requires `mode='production'` and `period >= '2026-10'`,
so a synthetic non-production run cannot exercise the real path end to end. Until one of those
happens, steps 1–8 stand on synthetic-row tests and step 9 stays open. Do not mark 2B.4
complete on synthetic evidence alone.

---

## Suggestions (not acted on)

- Feeding decisions back to the agent (approved vs rejected, with reason) would make Alpha's
  Evaluate tab meaningful. Needs its own thinking about whether an agent should see its own
  success rate, and would be the first candidate for a 7th MCP read tool.
- If `resume_from_create_cr` ever gets an operator control, this surface supports it by moving
  one row in §4's map and adding one branch in §6.2.
- The canonical-string builder in §5.3 is the second place in this codebase where one rule must
  be computed identically in SQL and TypeScript (the first being `parse.ts`'s action codes vs
  `battle_pass_diagnosis_save`'s re-validation). A shared fixture file listing the canonical
  inputs and expected md5s would keep the two honest.
