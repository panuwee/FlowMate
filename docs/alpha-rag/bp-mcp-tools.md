# Battle Pass MCP Tools — connection description and usage rules

Phase 2B.3, step 8. Two things live in this file:

1. **§1 — the text to paste into Alpha's connection Description field.** Copy it verbatim.
2. **§2 onward — the full reference**, for people and for the agent's Knowledge base.

Why §1 matters: Alpha's own MCP guide says a filled-in connection description is what lets a
Super Agent use a connection "correctly and consistently", and 2B.2 §9 recorded what happens
when a description is left blank — the agent answered generically and, in the
`source_changed_after_finalize` case, recommended re-running finalize, the one action
`bp-policy.md` forbids. Do not leave the field empty, and do not paraphrase from memory.

---

## 1. Paste this into the connection Description

```text
Read-only access to the FC Online Battle Pass automation in FlowMate (Thailand server).
Use these tools whenever a question concerns Battle Pass runs, failures, error codes,
scheduling, or readiness — do not answer such questions from memory or from general
knowledge, because this system's states and codes are specific to it.

Call order that works: bp_get_status for the overall picture; bp_list_recent_runs to see
recent ticks and to obtain a runId; bp_get_run_context for a specific run; then
bp_lookup_error_code for the reviewed recovery instruction for that run's code, and
bp_count_code_occurrences to see whether the fault is recurring. bp_get_readiness explains
why nothing has run yet.

Never guess a runId — take it from bp_list_recent_runs. When bp_lookup_error_code returns a
recoveryHint, that hint is the reviewed instruction and outranks your own inference. When it
returns known:false, say the code is not catalogued and do not invent a recovery procedure.

These tools only read. They cannot run, retry, pause, resume, or change anything, and there is
no tool that can. Your output is advice for a human operator who presses the button in
FlowMate. Never claim to have performed an action.

File ids, slide ids, loot and pricing data, and any personal data are deliberately withheld
and cannot be requested. Prefer one broader call over many narrow ones: the connection is
rate limited per day and per minute.
```

---

## 2. The six tools

| Tool | Returns | Call it when |
|---|---|---|
| `bp_get_status` | automation on/off, scheduler active + last tick outcome, newest period with state and hold, most recent worker tick | any general "is it working / what is happening now" question |
| `bp_list_recent_runs` | recent ticks (newest first) with runId, time, status, code, stage, period, held, kind | you need a runId, or a picture of the last few hours |
| `bp_get_run_context` | one run's status, code, stage, checkpoint key names, hold reason, planner issues, previous successful period, 7-day recurrence, catalog hit | a question about one specific run |
| `bp_lookup_error_code` | severity, runbook ref, reviewed recovery hint, whether AI diagnosis is even eligible | before recommending anything about a coded failure |
| `bp_count_code_occurrences` | how many failed ticks carried a code in a window of days | to judge one-off vs recurring before assigning severity |
| `bp_get_readiness` | latest readiness: source / Google / database ready flags and blocking issues | "why has nothing run yet" |

### Sequencing

```
general question        -> bp_get_status
  ... needs history     -> bp_list_recent_runs
  ... a specific run    -> bp_list_recent_runs (get runId) -> bp_get_run_context
        ... has a code  -> bp_lookup_error_code -> bp_count_code_occurrences
  ... nothing has run   -> bp_get_readiness
```

`bp_get_run_context` already includes a 7-day recurrence count and whether the code is
catalogued, so calling `bp_count_code_occurrences` after it is only worth it for a **different
window** than 7 days. Do not re-fetch what you already have.

---

## 3. Hard rules

These extend `bp-policy.md`; nothing here relaxes it.

**Read-only, with no exceptions.** Every tool reads. None can run, retry, pause, resume,
clear a hold, release a review, create or delete a brief, deck or Creative Request, or change
any setting. There is no hidden tool that can, and asking for one will not produce one. Never
say or imply you have done any of those things — the human presses the button in FlowMate.

**Never invent a runId.** A runId must come from `bp_list_recent_runs` or `bp_get_status`. A
guessed uuid is rejected and the error will tell you to do this; passing "the latest one" or a
period string is also rejected.

**The catalog outranks you.** When `bp_lookup_error_code` returns a `recoveryHint`, that text
was written and reviewed by the ops team. Follow it. If your own reasoning suggests something
different, say both and defer to the hint. When `known:false`, state plainly that the code is
not catalogued, keep confidence below 50 per `bp-policy.md`, and recommend `manual_review`
rather than a procedure you constructed.

**Do not confuse two different kinds of confidence.** Observed failure mode, corrected here:
asked to diagnose an unrecognized code, an agent once returned `known:false` correctly, refused
to invent a fix — and then reported `Confidence: 99%`. That 99% was confidence that the *lookup
itself* came back negative (a fact you can indeed be near-certain of). It was not confidence in
a *diagnosis*, because there is no diagnosis to be confident in: the root cause is unknown.
Reporting a high number there tells the reader the situation is well understood when it is the
opposite. The confidence field always answers "how sure am I of the root cause and the
recommended action", never "how sure am I that a tool call returned what it returned." Whenever
`bp_lookup_error_code` returns `known:false`, the confidence you report must be below 50 —
no exception, regardless of how certain the lookup result itself was.

**A quiet system is not a broken system.** `bp_list_recent_runs` deliberately includes healthy
ticks. Statuses such as `no_pending_month`, `waiting_confirmation`, `disabled` and `complete`
are normal. An unconfirmed source in `bp_get_readiness` means the automation is correctly
waiting, not failing. Do not describe a waiting system as an incident.

**Recommended actions stay on the allowed list** from `bp-policy.md`: `retry_run`,
`resume_from_create_cr`, `revalidate_source`, `wait_for_confirmation`, `manual_review`,
`no_action`. Having live tools does not widen that list.

---

## 4. What is withheld, and why not to ask

Absent by design, enforced in the database rather than by instruction:

- email addresses, display names, any user id — so no answer can identify a person
- Google file, folder and slide ids; work-item display ids
- `source_snapshot` and `source_fingerprint` — these carry loot tables and pricing
- checkpoint **values** (only the key *names* are returned)
- any token, secret or connection detail
- the operator audit trail — who pressed which button is not exposed here

If a question needs one of those, the honest answer is that the data is not available to you
and the operator can see it in FlowMate. Do not speculate about the content of a withheld
field, and do not treat its absence as evidence of a problem.

---

## 5. Rate limits

The connection is capped per day and per minute. On a breach a tool returns an error saying
so; that is a real stop, not a transient failure to retry.

Consequences for how to work:

- plan the calls you need, then make them — do not explore tool by tool
- prefer `bp_list_recent_runs` once with a larger `limit` over several small calls
- do not re-fetch data already in the conversation
- if you are rate limited, say so and summarise from what you already have rather than
  retrying

---

## 6. Worked examples

**"Did the Battle Pass run last night?"**
`bp_get_status`. If the last tick is `complete`, say so with the period and time. If it is
`no_pending_month`, explain that there was nothing scheduled — that is not a failure.

**"It failed, what do I do?"**
`bp_list_recent_runs` → take the failed runId → `bp_get_run_context` → read the code →
`bp_lookup_error_code`. Answer with the recovery hint, its runbook ref, and whether the code
is `aiEligible`. If `held` is true, say which hold and that the hold must be reconciled before
any retry — a retry with a hold present is refused by FlowMate and, per the runbook, could
produce output from a stale loot snapshot.

**"This keeps happening."**
`bp_count_code_occurrences` with `windowDays: 30`. Report the number. Three or more of the
same code in a week is a pattern worth escalating to `manual_review` even when each individual
occurrence looks transient.

**"Nothing has run for October."**
`bp_get_readiness`. If `sourceReady` is false with `source_not_confirmed` among the issues,
the answer is that the loot source has not been confirmed yet and the automation is waiting
correctly. No action is needed from engineering.
