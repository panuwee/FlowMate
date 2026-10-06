# Control Center runtime button SQL repair

6 October 2026 · Tenant `jbavahimqjalvcfawgqw`.

User explicitly approved installing `supabase/workgrid_control_center_runtime_where_fix.sql`, preserving sending state, with no messages, scheduler changes or commit/push.

The deployed `public.wcc_set_runtime(boolean,text)` updated settings without a WHERE clause. The repair adds `where singleton=true` to that statement only. Before applying, the live function body was compared with the reviewed original; after applying, it was compared with the repaired body.

- Offline PGlite: 31 database tests passed, including patch state/ACL preservation, Admin-only access, enable/pause behavior and existing no-replay checks. PGlite does not include pg_safeupdate; the bounded statement was inspected separately.
- Live installed function body matches the repair.
- Runtime remains false. Entities (including rules/profiles/Bots/groups), ownership, delivery count, audit count and scheduler metadata digests match before/after.
- Function ACL remains `{postgres=X/postgres,authenticated=X/postgres}`; anon execute denied. SECURITY DEFINER and empty search_path unchanged.
- No live runtime invocation, activation, TEST, historical replay, worker deployment, commit/push or merge performed. Button activation has not been exercised after repair because it would change the approved sending state.

MCP OAuth refresh failed; the existing Supabase CLI linked to the verified tenant was used instead. Evidence: `output/wcc-runtime-where-fix-20261006/before.json` and `after.json`.

Installer source also includes the fix to prevent reinstalling the previous statement. Local regression test and patch remain unpublished. Existing worktrees retained; no checkout switch or cleanup.

This repair addresses the button's SQL error. Automatic notification dispatch/scheduler readiness and controlled Review-event UAT remain separate tasks.
