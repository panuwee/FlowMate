# FlowMate MVP 1.3 Work Split + Chat Prompts

Date: 2026-06-26
Project: `C:\Users\panuwee.w\Documents\New project 2`
Deploy target: https://panuwee.github.io/FlowMate/
Baseline: MVP 1.2 operations and collaboration work

## MVP 1.3 Theme

Manager-Oriented Campaign and Channel Planning.

MVP 1.3 focuses on:

- Planning navigation section inside FlowMate.
- View by Channel.
- View by Campaign.
- Planning Content Calendar context.
- Readiness and risk labels.
- Planning field coverage across Create, Detail, Search, Filter, Calendar, KPI, and Export.

MVP 1.3 excludes:

- Separate Campaign Plan platform after login.
- Media budget planning.
- Campaign budget tracking.
- Content pillar strategy.
- Per-channel copywriting workflow.
- Per-channel approval workflow.
- Publishing API integration.
- Social platform auto-posting.
- Drag-to-reschedule planning calendar.
- Full dependency planning between assets.
- Replacing existing execution views.

## Main Coordinator Rules

Use the current chat as Main Coordinator.

Main Coordinator owns:

- Scope decisions.
- File conflict review.
- SQL run order.
- Final automated test run.
- Final upload list for GitHub web UI.
- Release candidate / release passed docs.

Worker chats should each own one bounded workstream.

## Recommended Chat Split

| Chat | Purpose | Can Edit | Must Not Edit |
|---|---|---|---|
| Chat A - Scope / UAT Final Review | Confirm MVP 1.3 scope and UAT are internally consistent before implementation | `docs/MVP_1_3_PLANNING_SCOPE.md`, `docs/MVP_1_3_PLANNING_UAT_CHECKLIST.md`, `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md` | `github/`, `supabase/`, `src/` |
| Chat B - Backend / Data Model | Channel normalization, optional publish date, planning query contract, backfill, SQL docs | `supabase/*.sql`, `supabase/README.md`, `src/lib/flowmate.uat.test.ts` | `github/` |
| Chat C - Create / Detail / Search Field Coverage | Creative Request fields, detail display, search/filter/export field coverage | `github/screens-a.jsx`, `github/screens-b.jsx`, `github/search-utils.js`, `github/supabase-list-data.js`, `github/data.jsx`, `github/index.html`, `src/lib/flowmate.uat.test.ts` | `supabase/` |
| Chat D - Planning Channel View Frontend | Planning nav, Channel View, channel grouping, filters, cards, empty states | `github/app.jsx`, `github/screens-c.jsx`, `github/app.css`, `github/search-utils.js`, `github/index.html`, `src/lib/flowmate.uat.test.ts` | `supabase/` |
| Chat E - Campaign View / Content Calendar | Campaign View, planning calendar context, campaign/channel filters | `github/app.jsx`, `github/screens-c.jsx`, `github/search-utils.js`, `github/app.css`, `github/index.html`, `src/lib/flowmate.uat.test.ts` | `supabase/` unless consuming Chat B contract |
| Chat F - QA / Integration | Final UAT, security regression, release docs, integration review | `docs/MVP_1_3_RELEASE_CANDIDATE_*.md`, `docs/MVP_1_3_RELEASE_PASSED_*.md`, `src/lib/flowmate.uat.test.ts` | Feature implementation files unless fixing test/docs only |

## Recommended Order

1. Chat A finalizes PRD/UAT/prompts.
2. Chat B implements backend/data model contract if SQL or loader contract is needed.
3. Chat C implements Create/Detail/Search field coverage using Chat B contract.
4. Chat D implements Planning > Channel View.
5. Chat E implements Campaign View and Planning Content Calendar context.
6. Main Coordinator integrates, resolves conflicts, and runs tests.
7. Chat F performs final QA/release checklist.

Parallel guidance:

- Chat B should finish before Chat C, D, or E if it adds SQL or a new data contract.
- Chat C and Chat D can run in parallel after Chat B only if Main Coordinator accepts conflict risk in `src/lib/flowmate.uat.test.ts` and `github/search-utils.js`.
- Chat E should run after Chat D because both likely edit `github/screens-c.jsx` and `github/app.css`.
- Chat F must run last.

## When To Open New Chats

Open a separate worker chat for each implementation workstream once MVP 1.3 implementation starts.

Do not keep all implementation in the Main Coordinator chat if multiple workers are active. The Main Coordinator should receive handoffs, inspect changes, and manage integration.

## Shared Rules For Every Chat

Paste this block at the top of every worker chat.

```md
Project: FlowMate
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Current baseline:
- MVP 1.2 operations/collaboration baseline is the current source of truth.
- MVP 1.0 security baseline must remain intact.
- B-003 actor spoof regression must remain blocked.
- B-006 signed-out/RLS null bypass regression must remain blocked.

MVP 1.3 scope:
- Planning navigation section inside FlowMate.
- View by Channel.
- View by Campaign.
- Planning Content Calendar context.
- Readiness and risk labels.
- Planning field coverage across Create, Detail, Search, Filter, Calendar, KPI, and Export.

Out of scope:
- Separate Campaign Plan platform after login.
- Media budget planning.
- Campaign budget tracking.
- Content pillar strategy.
- Per-channel copywriting workflow.
- Per-channel approval workflow.
- Publishing API integration.
- Social platform auto-posting.
- Drag-to-reschedule planning calendar.
- Full dependency planning between assets.
- Replacing existing execution views.

Source of truth docs:
- `docs/MVP_1_3_PLANNING_SCOPE.md`
- `docs/MVP_1_3_PLANNING_UAT_CHECKLIST.md`
- `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md`

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
- Planning views must not expose archived tasks in normal active mode.
- Unauthorized users must not mutate planning fields.

Planning field rule:
- Any new field must be checked against Create, Detail, List/Search/Filter, Planning Views, Calendar, Workload/KPI, Export, Notification, Backfill, and UAT.
- Do not add a field only to one screen if other product surfaces need it.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
- Include manual checks needed.
- Include the next recommended step.
```

## Handoff Format For Every Worker Chat

Each worker chat must end with this format:

```md
Handoff Summary

Status:
- Passed / Partial / Blocked

What changed:
- ...

Tests:
- Command:
- Result:

Manual checks still needed:
- ...

SQL:
- No SQL changes
or
- SQL files changed:
- SQL run order:

Exact files to upload:
- ...

Risks / notes:
- ...

Next recommended step:
- ...
```

## Chat A Prompt - Scope / UAT Final Review

```md
Use the Shared Rules For Every Chat block from `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Product + QA + senior software engineer.

Task:
Review and tighten MVP 1.3 planning scope/UAT before implementation starts.

Files allowed to edit:
- `docs/MVP_1_3_PLANNING_SCOPE.md`
- `docs/MVP_1_3_PLANNING_UAT_CHECKLIST.md`
- `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md`

Files not allowed to edit:
- `github/`
- `supabase/`
- `src/`

Required checks:
- Confirm MVP 1.3 remains one FlowMate system, not a separate platform.
- Confirm Planning section includes Channel View first.
- Confirm Campaign View, Content Calendar, Readiness/Risk are scoped clearly.
- Confirm out-of-scope items are explicitly excluded.
- Confirm Field Impact Matrix covers Campaign, Channel, Publish Date, Launch Date, 1st Draft, Type/Skill, Asset Count, Readiness.
- Confirm UAT covers field impact across Create, Detail, Search, Filter, Planning, Calendar, KPI/Export, Security/RLS, archived rows, and existing execution views.
- Confirm work split prompts A-F are aligned and do not assign overlapping ownership without warning.

Deliverable:
- Updated docs if needed.
- Clear "ready for Chat B" or blocker note.

Final answer must include:
- What changed.
- Tests run or why not needed.
- Exact files to upload.
- Whether Chat B can start.
- Next recommended step.
```

## Chat B Prompt - Backend / Data Model

```md
Use the Shared Rules For Every Chat block from `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Supabase backend engineer + data model reviewer.

Task:
Implement MVP 1.3 backend/data model support for planning fields and planning query needs.

Files allowed to edit:
- `supabase/*.sql`
- `supabase/README.md`
- `src/lib/flowmate.uat.test.ts` for SQL/data-contract regression tests

Files not allowed to edit:
- `github/`
- `docs/` except `supabase/README.md`

Required decisions to validate before editing:
- Reuse existing `work_items.campaign_name` for Campaign.
- Reuse existing `creative_request_details.platforms` for Channel unless normalization requires a helper/view.
- Add `publish_date` only if needed to separate content publish date from launch date.
- Keep `work_items.due_date` as 1st Draft/internal production due date.
- Keep `work_items.launch_date` as launch/campaign milestone or fallback planning date.

Required backend behavior:
- Provide a reliable source for normalized channels.
- Preserve existing assignment engine behavior by Type/Skill and Asset Count.
- Ensure planning fields do not affect owner assignment unless explicitly scoped later.
- Ensure archived rows remain hidden from normal active planning loaders.
- If adding `publish_date`, include migration/backfill from `launch_date` for existing rows.
- If adding helper functions/views, keep them RLS-safe and signed-in only.
- Update SQL run order in `supabase/README.md`.

Required security checks:
- Use `auth.uid()` where identity is needed.
- Do not trust client-supplied actor IDs.
- Do not add null-user RLS bypass.
- Do not grant broad direct writes for planning fields unless existing security model already allows it safely.

Automated test candidates:
- SQL contains channel normalization contract.
- SQL/backfill preserves `due_date` as 1st Draft.
- SQL does not add null-user bypass.
- SQL does not change assignment skill matching for campaign/channel fields.

Final answer must include:
- What changed.
- Exact SQL run order.
- Tests run and result.
- Exact files to upload.
- Manual Supabase checks needed.
- Next recommended step.
```

## Chat C Prompt - Create / Detail / Search Field Coverage

```md
Use the Shared Rules For Every Chat block from `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Frontend product engineer.

Task:
Implement MVP 1.3 planning field coverage across Create, Detail, Search, Filter, and Export surfaces.

Files allowed to edit:
- `github/screens-a.jsx`
- `github/screens-b.jsx`
- `github/search-utils.js`
- `github/supabase-list-data.js`
- `github/data.jsx`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.uat.test.ts` for focused regression tests

Files not allowed to edit:
- `supabase/`
- `docs/`

Dependencies:
- Use Chat B backend/data model contract if SQL or loader contract changed.

Required behavior:
- Creative Request create flow captures Campaign and Channel correctly.
- Publish Date is captured only if approved by Chat B/data model.
- 1st Draft remains internal due date and keeps existing calculation behavior.
- Type/Skill and Asset Count continue to feed assignment/effort.
- Detail view shows campaign, channel, publish date if present, launch date if present, 1st Draft, Type/Skill, and Asset Count.
- Global search finds campaign and channel.
- List/search/filter surfaces include campaign and channel where useful.
- Export includes campaign/channel/publish date where scoped.
- No planning field is added only to Create without Detail/Search/Planning coverage.

Manual checks required:
- Create Creative Request with campaign/channel and open detail.
- Search by campaign.
- Search by channel.
- Confirm 1st Draft calculation still works.
- Confirm assignment still works.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Manual checks still needed.
- Next recommended step.
```

## Chat D Prompt - Planning Channel View Frontend

```md
Use the Shared Rules For Every Chat block from `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Frontend planning-view engineer.

Task:
Implement Planning navigation and View by Channel.

Files allowed to edit:
- `github/app.jsx`
- `github/screens-c.jsx`
- `github/app.css`
- `github/search-utils.js`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.uat.test.ts` for focused regression tests

Files not allowed to edit:
- `supabase/`
- `docs/`

Dependencies:
- Use Chat B data contract.
- Use Chat C field/search helpers if already implemented.

Required behavior:
- Add Planning section to navigation.
- Add Channel View route/page.
- Group active Creative Requests by normalized channel.
- Multi-channel Creative Requests appear under each relevant channel.
- Cards show display ID, title, campaign, channel, publish/launch date, 1st Draft, status, priority, owner, Type/Skill, readiness/risk label.
- Filters work for month, campaign, channel, status, requester team, priority, and Type/Skill.
- Empty channels show clear empty state.
- Clicking card opens correct detail.
- Archived rows do not appear in normal active Channel View.
- No separate post-login platform selector.

Readiness/risk MVP rule:
- Start with derived labels from existing production status and date risk.
- Do not create a separate planning status unless explicitly approved.

Manual checks required:
- Channel View loads live rows.
- Channel grouping is correct.
- Multi-channel item appears under each channel.
- Filters work.
- Card opens correct detail.
- Existing Board/List/Calendar/Gantt/Workload still load.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Manual checks still needed.
- Next recommended step.
```

## Chat E Prompt - Campaign View / Content Calendar

```md
Use the Shared Rules For Every Chat block from `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Frontend planning-view engineer.

Task:
Implement Campaign View and Planning Content Calendar context after Channel View is available.

Files allowed to edit:
- `github/app.jsx`
- `github/screens-c.jsx`
- `github/search-utils.js`
- `github/app.css`
- `github/index.html` only if cache version must change
- `src/lib/flowmate.uat.test.ts` for focused regression tests

Files not allowed to edit:
- `supabase/` unless Main Coordinator explicitly assigns a tiny contract follow-up
- `docs/`

Dependencies:
- Chat B backend/data model contract.
- Chat C field coverage.
- Chat D Planning navigation and Channel View patterns.

Required Campaign View behavior:
- Group active Creative Requests by campaign.
- Show campaign summary:
  - total assets
  - channels covered
  - ready/delivered count
  - at-risk count
  - blocked count
  - urgent count
- Asset rows/cards show channel, date, status, owner, priority, and Type/Skill.
- Clicking asset opens correct detail.
- Campaign filters work by month and status where scoped.

Required Planning Content Calendar behavior:
- Use publish date when available.
- Fall back to launch date when publish date is absent.
- Do not change execution Team Calendar's 1st Draft/due-date behavior.
- Calendar item shows campaign and channel.
- Campaign and channel filters work.
- Clicking item opens correct detail.

Manual checks required:
- Campaign View groups correctly.
- Campaign summary numbers reconcile with visible rows.
- Planning Calendar uses publish/launch date.
- Team Calendar still uses 1st Draft/due date.
- Calendar item opens correct detail.

Final answer must include:
- What changed.
- Tests run and result.
- Exact files to upload.
- Manual checks still needed.
- Next recommended step.
```

## Chat F Prompt - QA / Integration

```md
Use the Shared Rules For Every Chat block from `docs/MVP_1_3_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: QA engineer + release coordinator.

Task:
Run MVP 1.3 QA/release review after implementation chats are complete.

Files allowed to edit:
- `docs/MVP_1_3_RELEASE_CANDIDATE_2026-06-26.md`
- `docs/MVP_1_3_RELEASE_PASSED_2026-06-26.md` only after user confirms deployed smoke test passed
- `src/lib/flowmate.uat.test.ts` only for focused test coverage

Files not allowed to edit:
- Feature implementation files unless Main Coordinator explicitly asks.

Required checks:
- Run automated tests.
- Check final SQL run order.
- Verify Channel View UAT.
- Verify Campaign View UAT if included.
- Verify Planning Content Calendar UAT if included.
- Verify Create/Detail/Search field coverage.
- Verify KPI/export planning field coverage where scoped.
- Verify existing Board/List/My Work/Team Calendar/Gantt/Workload still work.
- Rerun B-003 and B-006.
- Check signed-out cannot read planning data.
- Check archived rows do not appear in active planning views.
- Check no secrets in frontend files or browser storage.
- Confirm no separate Campaign Plan platform was added.

Required release docs:
- Release candidate doc before deployment.
- Release passed doc only after user confirms deployed smoke test passed.

Final answer must include:
- Pass/fail status.
- Test results.
- SQL run order.
- Exact files to upload.
- Manual checks still needed.
- Release blockers if any.
- Next recommended step.
```

## Main Coordinator Integration Checklist

Before opening worker chats:

- [ ] Confirm `docs/MVP_1_3_PLANNING_SCOPE.md` is accepted.
- [ ] Confirm `docs/MVP_1_3_PLANNING_UAT_CHECKLIST.md` is accepted.
- [ ] Confirm this work split file is accepted.
- [ ] Tell each worker their assigned files.
- [ ] Do not run multiple workers on the same file unless conflict risk is understood.

After each worker chat returns:

- [ ] Read the changed files.
- [ ] Check for file ownership violations.
- [ ] Run `npm.cmd test`.
- [ ] If SQL changed, verify SQL run order.
- [ ] Update cumulative upload list.
- [ ] Tell the user exactly what to upload or run.
- [ ] Identify the next worker chat to start.

Before MVP 1.3 release:

- [ ] All worker outputs integrated.
- [ ] Automated tests pass.
- [ ] SQL run order confirmed and applied if SQL changed.
- [ ] GitHub files uploaded through web UI.
- [ ] Deployed smoke test passes.
- [ ] B-003 regression passes.
- [ ] B-006 regression passes.
- [ ] Signed-out planning data read is blocked.
- [ ] Archived rows are hidden from active planning views.
- [ ] Release candidate doc created.
- [ ] Release passed doc created only after user confirms deployed smoke test.

## Current Next Step

Start with Chat A if you want one more documentation review.

If scope/UAT/work split are already accepted, start Chat B first because backend/data model decisions affect all implementation chats.
