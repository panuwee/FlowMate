# FlowMate MVP 1.1 Work Split + Chat Prompts

Date: 2026-05-19
Project: `C:\Users\panuwee.w\Documents\New project 2`
Deploy target: https://panuwee.github.io/FlowMate/

## Current Baseline

MVP 1.0 is closed for pilot readiness.

- Google Workspace login: passed
- Creative Request creation: passed
- Assignment Engine: passed
- Permission / RLS: passed
- B-003 actor spoof risk: passed
- B-006 RLS null bypass: passed
- Automated tests: `33/33 passed`
- Manual deploy workflow: upload files through GitHub web UI, do not use `git push`

Reference baseline file:

- `docs/MVP_1_0_SECURITY_BASELINE_2026-05-19.md`

## Recommended Chat Split

Use this chat as the Main Coordinator. Open separate chats only for workstreams with clear file ownership.

| Chat | Purpose | Can Edit | Must Not Edit |
| --- | --- | --- | --- |
| Main Coordinator | Scope, integration, SQL order, final upload list | Any file after reviewing worker output | N/A |
| Chat A - Scope/PRD | MVP 1.1 scope and product decisions | `docs/MVP_1_1_SCOPE.md` | `github/`, `src/`, `supabase/` |
| Chat B - QA/UAT | MVP 1.1 UAT and manual test checklist | `docs/MVP_1_1_UAT_CHECKLIST.md`, optionally `src/lib/flowmate.uat.test.ts` | `github/`, `supabase/` unless explicitly assigned |
| Chat C1 - Frontend Open Detail | Open created item detail after create | `github/screens-a.jsx`, `github/app.jsx`, `github/index.html`, focused tests if needed | `supabase/` |
| Chat C2 - Frontend Draft Saving | Draft saving for Create form | `github/screens-a.jsx`, `github/app.jsx`, `github/index.html`, focused tests if needed | `supabase/` |
| Chat D1 - Backend Admin Whitelist | Admin whitelist SQL/RPC/RLS | `supabase/*.sql`, SQL regression tests | `github/` |
| Chat C3 - Frontend Admin Whitelist | Admin whitelist UI | assigned `github/*.jsx`, `github/*.js`, `github/index.html` | `supabase/` except RPC contract already created by Chat D1 |

## Recommended MVP 1.1 First Scope

Start with these 3 features because they improve real workflow without changing too many systems at once.

1. Open created item detail immediately after creating Quick Task or Creative Request.
2. Draft saving for Create form.
3. Admin whitelist UI for adding/deactivating allowed users.

Defer these unless the Main Coordinator explicitly adds them:

- Full notification center
- Calendar range selector
- File upload storage
- Removing `p_actor_user_id` from RPC signatures
- Major visual redesign

## Shared Rules For Every Chat

Paste this block at the top of every worker chat.

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.0 security passed on 2026-05-19.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Automated tests are 33/33 passing.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, or secrets in files.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
```

## Chat A Prompt - MVP 1.1 Scope/PRD

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.0 security passed on 2026-05-19.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Automated tests are 33/33 passing.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, or secrets in files.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.

Role: Product + senior software engineer.

Task:
Create a concise MVP 1.1 scope document.

Files allowed to edit:
- `docs/MVP_1_1_SCOPE.md`

Files not allowed to edit:
- `github/`
- `src/`
- `supabase/`

Context:
- MVP 1.0 is closed and security-passed.
- Recommended first MVP 1.1 features:
  1. Open created item detail immediately after creating Quick Task or Creative Request.
  2. Draft saving for Create form.
  3. Admin whitelist UI for adding/deactivating allowed users.

Output requirements:
- Define MVP 1.1 goals.
- Define in-scope features.
- Define out-of-scope features.
- Define acceptance criteria.
- Define risk/edge cases.
- Keep language simple.
- Final answer must list changed files.
```

## Chat B Prompt - MVP 1.1 QA/UAT

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.0 security passed on 2026-05-19.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Automated tests are 33/33 passing.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, or secrets in files.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.

Role: QA engineer + senior software engineer.

Task:
Create MVP 1.1 UAT checklist and identify regression tests needed before implementation.

Files allowed to edit:
- `docs/MVP_1_1_UAT_CHECKLIST.md`
- `src/lib/flowmate.uat.test.ts` only if adding low-risk test coverage for existing pure functions

Files not allowed to edit:
- `github/`
- `supabase/`

Context:
- MVP 1.0 tests are 33/33 passing.
- MVP 1.1 likely starts with:
  1. Open created item detail.
  2. Draft saving.
  3. Admin whitelist UI.

Output requirements:
- Create UAT cases with IDs like `UAT-101`.
- Include preconditions, steps, expected result, and failure signals.
- Include security regression checks for B-003 and B-006.
- Include upload/deploy smoke checklist.
- Final answer must list changed files and tests run.
```

## Chat C1 Prompt - Frontend Open Created Detail

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.0 security passed on 2026-05-19.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Automated tests are 33/33 passing.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, or secrets in files.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.

Role: Frontend implementation engineer.

Task:
Implement MVP 1.1 feature: open the newly created item detail immediately after creating a Quick Task or Creative Request.

Files allowed to edit:
- `github/screens-a.jsx`
- `github/app.jsx`
- `github/search-utils.js`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.ts` and `src/lib/flowmate.uat.test.ts` only if pure helper logic is needed

Files not allowed to edit:
- `supabase/`
- `docs/`

Required workflow:
1. Read the relevant existing files before editing.
2. Identify the smallest change.
3. Add or update focused tests if the logic can be tested outside the browser.
4. Do not redesign the UI.
5. Preserve MVP 1.0 security behavior.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Any manual browser check needed.
```

## Chat C2 Prompt - Frontend Draft Saving

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.0 security passed on 2026-05-19.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Automated tests are 33/33 passing.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, or secrets in files.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.

Role: Frontend implementation engineer.

Task:
Implement MVP 1.1 feature: draft saving for the Create form.

Files allowed to edit:
- `github/screens-a.jsx`
- `github/app.jsx`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.ts` and `src/lib/flowmate.uat.test.ts` only if pure helper logic is needed

Files not allowed to edit:
- `supabase/`
- `docs/`

Required behavior:
- Save Quick Task and Creative Request drafts locally in the browser.
- Restore draft values after refresh.
- Clear the matching draft after successful submit.
- Do not store secrets or auth tokens.
- Keep the UI simple; do not redesign the Create page.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Any manual browser check needed.
```

## Chat D1 Prompt - Backend Admin Whitelist

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.0 security passed on 2026-05-19.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Automated tests are 33/33 passing.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, or secrets in files.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.

Role: Supabase backend engineer.

Task:
Implement MVP 1.1 backend support for Admin whitelist UI.

Files allowed to edit:
- `supabase/*.sql`
- `src/lib/flowmate.uat.test.ts` only for SQL text regression tests
- `supabase/README.md` only if SQL run order changes

Files not allowed to edit:
- `github/`

Required security constraints:
- Use `auth.uid()` for actor identity.
- Do not trust client-supplied actor IDs.
- Do not add `or public.current_app_user_id() is null` to RLS policies.
- Do not expose whitelist writes to non-admin users.
- Keep scripts idempotent where practical.

Final answer must include:
- What changed.
- SQL run order.
- Tests run and result.
- Exact files to upload.
```

## Chat C3 Prompt - Frontend Admin Whitelist UI

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.0 security passed on 2026-05-19.
- B-003 actor spoof risk is closed.
- B-006 RLS null bypass is closed.
- Automated tests are 33/33 passing.

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, or secrets in files.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.

Role: Frontend implementation engineer.

Task:
Implement MVP 1.1 frontend UI for Admin whitelist management, using the backend RPC contract created by Chat D1.

Files allowed to edit:
- `github/app.jsx`
- `github/screens-a.jsx`
- `github/screens-b.jsx`
- `github/supabase-quick-task.js` or a new focused `github/*.js` helper if needed
- `github/index.html` only if cache version must change
- `src/lib/flowmate.ts` and `src/lib/flowmate.uat.test.ts` only if pure helper logic is needed

Files not allowed to edit:
- `supabase/`
- `docs/`

Required behavior:
- Only admin users should see whitelist management entry points.
- Non-admin users must not see admin controls.
- UI must support listing whitelist users and adding/deactivating users if backend RPCs exist.
- Show clear errors from Supabase RPCs.
- Do not expose service-role keys or secrets.
- Keep visual style consistent with the current app; do not redesign unrelated screens.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Any manual browser check needed.
```

## Main Coordinator Checklist

Before opening worker chats:

- [ ] Decide exact MVP 1.1 feature order.
- [ ] Assign only one feature per implementation chat.
- [ ] Copy the ready-made prompt for the selected worker chat.
- [ ] Tell each worker which files they may edit.

After worker chats return:

- [ ] Review changed files.
- [ ] Check for file conflicts.
- [ ] Run `npm.cmd test`.
- [ ] If SQL changed, run SQL in Supabase in the stated order.
- [ ] Smoke test GitHub Pages.
- [ ] Produce final upload list for GitHub web UI.

## Suggested First Execution Order

1. Chat A creates `docs/MVP_1_1_SCOPE.md`.
2. Chat B creates `docs/MVP_1_1_UAT_CHECKLIST.md`.
3. Main Coordinator reviews scope + UAT.
4. Chat C1 implements "Open created item detail".
5. Main Coordinator verifies and uploads.
6. Chat C2 implements "Draft saving".
7. Chat D1 implements backend for "Admin whitelist UI".
8. Chat C3 implements frontend for "Admin whitelist UI".
