# Creative Gantt: use Team Members Access

## Behavior

- GD/VE with Active Access appear in Timeline, Workload, and assignee filters.
- Inactive Access accounts are excluded even when their creative assignment profile remains active or old tasks still reference them.
- Active Access accounts remain visible when their assignment profile is paused. Assignment eligibility itself is unchanged.
- Existing unassigned tasks remain visible. Existing assignments are not modified.

## Cause and implementation

The previous Gantt loader filtered `team_members.active`, which controls the creative assignment profile, rather than account Access.

`supabase/creative_gantt_access_roster.sql` adds the read-only `flowmate_gantt_members()` RPC. It uses the existing `flowmate_member_access_allowed()` predicate, including whitelist, user activation, domain and lifecycle rules. It preserves caller RLS through SECURITY INVOKER and updates the existing Viewer read allowlist with a guarded, idempotent patch.

`loadFlowMateGanttMembers()` is used only by Creative Gantt. The assignment loader remains unchanged. RPC failures are reported instead of falling back to the old roster. The returned display roster marks Access-eligible members active locally without changing the global assignment profile.

## Local checks

`npm.cmd test -- --config scripts/creative-gantt.vitest.config.mjs`

Tests use fixture data and an in-memory PGlite database, with no production connection. Coverage includes Eye's inactive-Access/active-profile case, paused profiles with Active Access, stale task assignees, unassigned tasks, lifecycle dates, missing whitelist, anonymous/inactive callers, existing RLS visibility, Viewer allowlists, idempotent SQL installation, and server rendering of Timeline and Workload.

Results: 6 Gantt tests passed on the isolated GitHub `version2.1.1` base `be966317457e82fab6c03ca375ad32fef7552081`. The existing Task Assign exclusion check remains passing. In the canonical checkout, 43 Team Members tests also passed. Rendering checks use React server rendering and fixtures; real browser sessions remain pending.

`npm.cmd run build:github` regenerates the tracked sibling JavaScript; this change updates `screens-c.js`.

## Publication boundary

The user authorized commit/push only. This patch is prepared for branch `codex/creative-gantt-access-status-20261105`, based on GitHub `version2.1.1`. Database application, merge and deployment require separate authorization. Eye's actual production data and live database definitions have not been inspected.

Before authorized publication, inspect the live Access predicate, team_members RLS and Viewer pre-request guard against these assumptions. Apply the reviewed roster SQL before publishing the frontend, then verify with real admin/member/Viewer sessions that Eye is absent in both views and the filter. Do not reapply the full Access installer to deploy this fix.

The canonical checkout remains on `version2.1` with unrelated changes preserved. The release patch is isolated in `output/creative-gantt-access-release/review` and an alternate Git index, without switching existing branches. No worktree was created or removed; existing worktrees are retained.
