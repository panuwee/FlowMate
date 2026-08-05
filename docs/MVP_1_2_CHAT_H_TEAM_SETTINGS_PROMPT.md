# FlowMate MVP 1.2 Chat H Prompt - Team Settings Admin Controls

Date: 2026-05-21
Project: FlowMate
Workspace: `C:\Users\panuwee.w\Documents\New project 2`
Deploy target: `https://panuwee.github.io/FlowMate/`

## Status

Chat H is added after Main Coordinator review found that Team settings still contains MVP 1.1 placeholder controls.

Current Team settings behavior:

- Members display as one long row/list sorted by name.
- Filter chips are disabled placeholders.
- `Add member`, `Add skill`, and `Edit` buttons are disabled placeholders.

New user requirement:

- Change Team settings from one name-sorted list into grouped team columns:
  - Column 1: Operation
  - Column 2: Marketing
  - Column 3: GD/VE
  - Column 4: Esport

## Shared Rules For Chat H

Paste this block at the top of the worker chat.

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.1 release passed on 2026-05-19.
- MVP 1.0 security baseline remains passed.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- MVP 1.2 chats already run: A, A2, B, C, D, D2, E, E2, G.
- Latest Main Coordinator automated test result: 121/121 passed.

MVP 1.2 scope:
- Realtime Live Updates.
- Team Calendar.
- Notification Center.
- Detail Collaboration after create.
- Watchers.
- Admin Operations.
- Panu View as Pond for test perspective.
- Chat H addition: Team settings grouped by team columns and admin-safe team member controls.

Out of scope:
- SEA Enterprise Webhook integration.
- Saved Filters Lite.
- Full CSV export system.
- Email notifications.
- Browser push notifications.
- Calendar drag-to-reschedule.
- Major visual redesign.
- Hard delete that permanently removes audit/history.
- True account impersonation where Panu's actions are written as Pond.
- Watcher edit/status-change rights.
- Frontend direct writes to protected admin tables.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, service-role keys, tokens, sessions, or secrets in files.
- Do not add secrets to frontend JS or browser localStorage/sessionStorage.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Security:
- Use `auth.uid()` for backend identity.
- Do not trust client-supplied actor IDs.
- Do not add `or public.current_app_user_id() is null` to RLS policies.
- Signed-out users must not read protected work rows.
- Admin-only Team settings mutations must use backend RPCs.
- Frontend must not directly insert/update/delete `public.team_members`.
- Admin actions must audit the real admin actor where audit exists.
- Normal members can view Team settings if current product behavior allows it, but cannot mutate team member settings.
- Panu View as Pond must not alter backend actor identity.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
- Include manual checks needed.
```

## Chat H Worker Prompt

```md
Use the Shared Rules For Chat H block from `docs/MVP_1_2_CHAT_H_TEAM_SETTINGS_PROMPT.md`, then use this task.

Role: Frontend + Supabase implementation engineer with security awareness.

Task:
Replace Team settings placeholder behavior with a usable MVP 1.2 Team settings view.

Primary requirement:
- Team settings must group members into 4 team columns instead of one A/B/C name-sorted list:
  - Operation
  - Marketing
  - GD/VE
  - Esport

Files allowed to edit:
- `github/screens-c.jsx`
- `github/app.css`
- `github/supabase-list-data.js`
- `github/supabase-quick-task.js`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.uat.test.ts`
- `supabase/team_settings_admin.sql` if admin mutation RPCs are needed
- `supabase/README.md` if SQL run order changes

Files not allowed to edit:
- Other `supabase/*.sql` files unless the existing SQL contract requires a tiny compatibility update.
- `github/app.jsx` unless routing or auth context is absolutely required.
- `github/screens-a.jsx` and `github/screens-b.jsx`.
- Existing MVP 1.2 docs except this prompt file unless Main Coordinator asks.

Implementation priority:

P0 - Team grouped display:
- Replace the long single-column member list with a 4-column team board.
- Each column title must be exactly:
  - Operation
  - Marketing
  - GD/VE
  - Esport
- Group by `member.discipline` or `member.discipline_short`.
- Handle known values conservatively:
  - Operation: `Operations`, `Operation`, `OP`, `Ops`
  - Marketing: `Marketing`, `MKT`
  - GD/VE: `GD/VE`, `GD`, `VE`, `Design`, `Video`
  - Esport: `Esport`, `eSport`, `ES`
- Unknown or missing discipline must not crash the page. Put unknown members in an `Operation` fallback only if there is no better existing local pattern, and add a small muted warning count.
- Within each column, sort members by display name.
- Keep each member card compact enough that all four columns can scan on desktop.
- On narrow mobile width, columns can stack vertically.

P0 - Filter chips:
- Replace disabled placeholder chips with real filters:
  - All members
  - Active
  - Partial
  - On leave
- Filtering must apply inside each team column.
- Member count should reflect the filtered visible count.
- Remove stale `(MVP 1.1)` labels from enabled controls.

P0 - Read-only permission behavior:
- Non-admin users must be able to view the grouped Team settings if existing app access already allows it.
- Non-admin users must not see enabled admin mutation controls.
- Non-admin users must not be able to mutate team members by calling frontend helpers.

P1 - Admin edit member:
- If a safe backend RPC already exists, use it.
- If no safe backend RPC exists, create `supabase/team_settings_admin.sql`.
- Do not write directly to `public.team_members` from frontend.
- Admin can edit:
  - `availability`: `available`, `partial`, `leave`
  - `capacity_per_day`
  - `capacity_override_per_day`
  - `wip_limit`
- Validate values:
  - capacity values must be numeric from 0 to 24.
  - WIP limit must be integer from 0 to 20.
  - when availability is `leave`, effective capacity should be 0 or override should be cleared according to current schema rules.
- After save, refresh Team settings and Workload data.
- Assignment engine should continue to read updated capacity/WIP values.

P1 - Admin skill editing:
- Admin can add/remove normal skills from `team_members.skills` if implementation is safe and small.
- Use existing asset type values only.
- Do not allow empty skills array because schema requires at least one skill.
- Backup skills can remain read-only unless existing patterns make it easy.

P2 - Add member:
- Add member is optional for Chat H.
- If implemented, it must be admin-only and must not bypass whitelist/SSO rules.
- Prefer linking an existing whitelisted/app user to a team member instead of creating unaudited fake users.
- If this becomes too large, leave Add member disabled but relabel clearly as `Add member (post-MVP 1.2)` instead of `MVP 1.1`.

Backend SQL requirements if `supabase/team_settings_admin.sql` is created:
- Add admin-only RPCs, for example:
  - `public.flowmate_admin_update_team_member(...)`
  - `public.flowmate_admin_update_team_member_skills(...)`
- RPCs must resolve actor from `auth.uid()`.
- RPCs must require `public.is_admin_app_user()`.
- RPCs must reject signed-out users.
- RPCs must not accept trusted actor ID from the browser.
- Revoke direct write grants on `public.team_members` from `anon` and `authenticated` if needed.
- Keep read policies compatible with current active app users.
- Do not add null-bypass RLS patterns.

Frontend UI requirements:
- Use existing FlowMate visual style.
- Do not add a landing page or large redesign.
- Do not put cards inside cards.
- Use existing `Icon` component where possible.
- Keep text short and readable.
- Team columns should be scannable:
  - member name
  - discipline
  - availability
  - skill tags
  - capacity pt/day
  - WIP limit
  - edit control for admin only
- Loading and error states must not white-screen.

Realtime / refresh behavior:
- Team settings should refresh through existing `attachFlowMateLiveRefresh` where available.
- If admin edits a member, refresh local state immediately after RPC success.
- Do not add a separate complex realtime system for Team settings.

Automated tests to add or update:
- Team settings grouping helper groups Operation / Marketing / GD/VE / Esport correctly.
- Filter helper returns All / Active / Partial / On leave correctly.
- Unknown discipline does not crash.
- Non-admin UI model does not expose admin edit actions.
- Admin update RPC wrapper does not accept `p_actor_user_id`.
- If skill editing is implemented, empty skills are rejected before RPC call.

Manual checks required:
- Open Team settings and confirm columns appear as:
  - Operation
  - Marketing
  - GD/VE
  - Esport
- Confirm members are not shown as one A/B/C list anymore.
- Confirm filter chips work.
- Confirm non-admin cannot edit member settings.
- Confirm admin can edit availability/capacity/WIP if P1 edit is implemented.
- Confirm Team settings still loads after refresh.
- Confirm Workload still loads after editing a member.
- Confirm signed-out/incognito user cannot read protected member/work data.

Final answer must include:
- What changed.
- Whether SQL was added.
- Tests run and result.
- Exact files to upload.
- Exact SQL run order if SQL was added.
- Manual checks still needed.
```

## Recommended Coordinator Notes

Use Chat H before final Release Candidate if Team settings is considered required for MVP 1.2 pilot.

Recommended order:

1. Run Chat H.
2. Main Coordinator reviews Chat H changes.
3. Run `npm.cmd test`.
4. If SQL was added, run SQL in Supabase after existing MVP 1.2 SQL:
   - `supabase/rpc_quick_task.sql`
   - `supabase/notification_center.sql`
   - `supabase/collaboration_admin.sql`
   - `supabase/view_security_hardening.sql`
   - `supabase/team_settings_admin.sql`
5. Upload changed GitHub files.
6. Recheck Team settings manually.
7. Continue to final QA / Release Candidate.

## Stop Criteria

Stop and return to Main Coordinator if any of these happen:

- SQL needs direct table writes from the frontend.
- Admin mutation cannot be made to use `auth.uid()`.
- Team settings edit requires changing assignment engine behavior outside capacity/WIP inputs.
- Add member requires weakening whitelist or SSO constraints.
- Grouped layout causes major app-wide CSS regression.
- Tests fail in unrelated MVP 1.2 areas.

