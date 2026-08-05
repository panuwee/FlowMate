# FlowMate Trello + Asana Hybrid Contract

Status: Approved for implementation on 3 Aug 2026

## Objective

Creative Requests must receive an owner immediately without being held by WIP,
capacity, skill, or leave constraints. Those signals remain visible warnings and
ranking inputs. GD/VE owns day-to-day execution while the requester and admin
retain assignment and deadline authority.

## Scope

- Replace capacity-blocking assignment with deterministic best-fit assignment.
- Replace Central Queue with Attention Needed.
- Add a truthful `unassigned` exception state.
- Preserve Need Brief as a pre-production state excluded from capacity and KPI.
- Allow requester/admin reassignment and active GD/VE self-assignment of
  unassigned Creative Requests.
- Preserve assignment history and historical `queued` enum values.
- Show assignment warnings without blocking work creation or assignment.

## Non-goals

- No new application role.
- No deletion of historical work items, assignment runs, or events.
- No GD/VE authority to change Campaign, Brief requirements, 1st Draft, Launch,
  requester, owning team, or another member's assignment.
- No automatic movement of 1st Draft or Launch after assignment.

## Status Contract

| Status | Meaning | Owner required | Capacity counted |
|---|---|---:|---:|
| `new` | Transaction-internal creation state only | No | No |
| `need_brief` | Required brief data is incomplete | No | No |
| `unassigned` | Brief is complete but no active GD/VE exists | No | No |
| `assigned` | Owner selected; work not started | Yes | Yes |
| `in_progress` | Owner started production | Yes | Yes |
| `review` | Submitted for requester review; owner still reserves delivery capacity | Yes | Yes |
| `blocked` | Production is blocked | Yes | Yes |
| `delivered` | Approved/delivered | Yes | No |
| `cancelled` | Cancelled | Optional | No |
| `queued` | Historical compatibility only; migration source | Optional | No after migration |

New assignment runs may return only `assigned`, `need_brief`, or `unassigned`.
The PostgreSQL enum keeps `queued` so historical rows and audit payloads remain
readable, but no production RPC may create a new queued row.

## Auto-assignment Ranking

Hard candidate filter:

1. Active `team_members` row.
2. Member code belongs to the configured GD/VE owner pool.
3. User/team linkage is valid enough for existing RLS and assignee actions.

Deterministic ranking, lowest value first unless noted:

1. Context preference: eSport prefers Ploy/Vee; Ops/Marketing prefers Pond/Joe/Tong/Eye.
2. Skill rank: both primary skills, one primary skill, backup match, no match.
3. Availability rank: available, partial, leave.
4. Projected load ratio through 1st Draft.
5. Allocated points through 1st Draft.
6. Active WIP count.
7. Overdue item count.
8. Stable member code tie-break.

Capacity, WIP, skill mismatch, partial availability, leave, and impossible
production windows must never remove an active candidate. They change ranking
and produce warning codes. If at least one hard candidate exists, assignment
must finish as `assigned`.

## Warning Contract

The assignment result and event metadata expose `warnings` as an array of
objects with `code`, `severity`, and `message`.

Supported MVP codes:

- `over_capacity`
- `wip_exceeded`
- `skill_mismatch`
- `backup_skill`
- `member_partial`
- `member_on_leave`
- `deadline_capacity_gap`
- `review_buffer_risk`
- `needs_split`

Warnings are advisory. UI must display them on Create result, Detail, Attention
Needed, Workload, and Gantt where relevant. Status remains `assigned`.

## Simplified Capacity

- Users do not create, edit, or balance AM/PM allocation rows.
- The assignment engine continues to maintain allocation rows internally so
  ranking, warnings, and Gantt totals stay explainable and existing data is
  preserved.
- The per-work-item half-day allocation may exceed nominal 4 pt so overload is
  represented truthfully instead of silently omitted.
- Automatic allocation spreads effort across working AM/PM buckets from the
  production start through 1st Draft, then distributes unavoidable overflow
  across the same buckets.
- Team Schedule combines the internal AM/PM buckets into weekly workload totals;
  it never asks the user to manage half-day buckets.
- Aggregate allocated points may exceed member capacity; UI marks the week
  overloaded and recommends reprioritising or reassigning.
- Delivered, Cancelled, Need Brief, Unassigned, and historical Queued do not
  reserve production capacity. Review remains capacity-counted until delivery.
- Changing owner replaces the item's allocation rows atomically.

## Permission Matrix

| Action | Admin | Requester/PIC | Assigned GD/VE | Other active GD/VE |
|---|---:|---:|---:|---:|
| Change owner to any active GD/VE | Yes | Yes | No | No |
| Self-assign an Unassigned item | Yes | Yes | N/A | Yes, self only |
| Start Work / Submit Review / Block / Resume | Yes | Existing requester rules | Yes | No |
| Change 1st Draft or Launch | Yes | Yes | No | No |
| Change owning team | Existing admin-only rules | No | No | No |

`PIC` does not introduce a new role. In FlowMate it means the work item's
requester, plus existing Marketing Plan PIC/Sub PIC permissions where linked.
All assignment writes use security-definer RPCs with `auth.uid()` authority;
direct table DML remains revoked.

## Assignment RPCs

### `flowmate_run_assignment(work_item_id, trigger)`

- Computes effort.
- Returns Need Brief when brief validation fails.
- Selects the best hard candidate even when all soft constraints fail.
- Returns Unassigned only when no active GD/VE hard candidate exists.
- Writes warnings to assignment reason, assignment run snapshot, and event
  metadata.
- Never writes Queued.

### `flowmate_change_creative_assignee(display_id, member_id, reason)`

- Requester or admin may select any active GD/VE member.
- Active GD/VE may select only their own member id and only when current status
  is Unassigned.
- Reason is mandatory for warning override/reassignment and stored in events.
- Rebuilds capacity allocations and preserves status semantics.
- Resolves the actor exclusively from `auth.uid()`; the browser cannot submit or
  spoof an actor id.

### `flowmate_reschedule_capacity_allocation(display_id, allocations)`

- Retained for rollback and administrative compatibility, but the normal
  FlowMate UI does not expose or call it.
- Owner, requester, or admin authorization remains enforced if an approved
  maintenance client calls it.
- Validates working date, `am`/`pm`, positive points, no duplicate buckets, and
  an exact allocation total equal to the assigned effort.
- Resolves the actor exclusively from `auth.uid()` and writes a
  `capacity_changed` audit event.
- Does not change 1st Draft or Launch.

The existing rerun and queue-drain functions remain temporarily callable only
for migration compatibility but must not appear in the UI. Canonical SQL marks
them deprecated; a later cleanup release may remove them after production has
zero queued rows.

## Queued Migration

Run in one transaction with an archive/report table:

1. Snapshot every active Creative Request with status Queued.
2. Queued with a valid active owner becomes Assigned.
3. Queued without an owner is passed through the new assignment engine.
4. If a hard candidate exists it becomes Assigned.
5. If none exists it becomes Unassigned.
6. Hybrid/needs-split rows are no longer queued: if brief is valid they use the
   same best-fit owner and retain `needs_split = true` as an Attention warning.
7. Preserve original assignment reason in migration audit/event metadata.
8. Verification must return zero active Queued Creative Requests.

## Attention Needed

Attention Needed is a derived view, not a holding status. Categories:

- Unassigned
- Over capacity
- WIP exceeded
- Skill mismatch or backup skill
- Member on leave/partial
- Deadline capacity gap
- Review buffer risk
- Review delay
- Blocked
- Needs split

One task may appear in multiple categories without duplication in the total.
Default sort: urgent, overdue/at-risk date, 1st Draft, created time.

## Cross-surface Contract

- Create: assigned result with owner and warnings; no Queued result card.
- My Work: owner work sorted by risk and 1st Draft; warning badges visible.
- Board/List/Search/Detail: support Unassigned and warning labels; no rerun action.
- Attention Needed: replaces Queue route/navigation/count.
- Gantt: task timeline plus automatic daily workload totals and overload states;
  no AM/PM editor or A/P cells.
- Workload/KPI: replace queued metrics with unassigned and at-risk metrics.
- Notifications: notify selected owner immediately; notify requester/admin for
  Unassigned and critical warnings.
- RLS: standard users cannot gain cross-team data access from assignment.
- Marketing Plan/Sub PIC: existing participant permissions remain unchanged.

## Acceptance Criteria

1. A complete Creative Request with at least one active GD/VE always returns
   Assigned, even when every member is over capacity/WIP or lacks the skill.
2. No new Creative Request enters Queued.
3. Need Brief remains unassigned and excluded from production metrics.
4. No active GD/VE produces Unassigned and an Attention Needed record.
5. Requester/admin reassignment and GD/VE self-assignment pass RPC/RLS tests.
6. Other users cannot assign a colleague or mutate the owning team.
7. Existing Queued rows migrate without deleting history; active Queued count
   becomes zero.
8. Capacity allocation totals equal assigned effort, including overload.
9. Detail contains no AM/PM allocation editor and Gantt shows one daily total.
10. Queue navigation, rerun controls, and queued result copy are removed.
11. Board, List, Detail, Search, My Work, Gantt, Workload, KPI, Notifications,
    Marketing Plan links, light/dark theme, and mobile layouts regress cleanly.

## Handoff

Backend owns enum migration, assignment ranking, warnings, internal allocation,
reassignment/self-assignment RPCs, migration audit, and RLS. Frontend consumes
the result contract, presents Simplified Capacity, and replaces Queue with
Attention Needed. QA must run SQL
static checks, permission impersonation tests, migration verification, targeted
and full Vitest, GitHub bundle generation, Next build, and authenticated browser
smoke checks before release.
