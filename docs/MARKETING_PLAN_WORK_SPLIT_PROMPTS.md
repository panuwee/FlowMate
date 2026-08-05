# Marketing Plan Work Split + Chat Prompts

Date: 2026-06-26
Project: `C:\Users\panuwee.w\Documents\New project 2`
Deploy target: https://panuwee.github.io/FlowMate/
Source reference: `[FCO] Internal Marketing Plan - June 2026.pdf`

## Product Decision

Marketing Plan is a separate product area from FlowMate.

Target journey:

```text
Login
  -> Choose product
      -> FlowMate
      -> Marketing Plan
```

MVP 1.3 FlowMate Planning should be held and not released as the final marketing planning solution.

## Main Coordinator Rules

Use the current chat as Main Coordinator.

Main Coordinator owns:

- Scope decisions
- File conflict review
- SQL run order
- Final automated test run
- Final upload list for GitHub web UI
- Final release checklist

Worker chats should each own one bounded workstream.

## Shared Rules For Every Chat

Paste this block at the top of every worker chat.

```md
Project: FlowMate + Marketing Plan
Workspace: C:\Users\panuwee.w\Documents\New project 2
Deploy target: https://panuwee.github.io/FlowMate/

Product decision:
- FlowMate and Marketing Plan are separate product areas after login.
- FlowMate is production/request execution.
- Marketing Plan is monthly campaign/channel publishing planning.
- Do not merge Marketing Plan back into FlowMate execution views.
- Do not release the previous FlowMate MVP 1.3 Planning RC as the final planning solution.

Source docs:
- `docs/MARKETING_PLAN_PRODUCT_SCOPE.md`
- `docs/MARKETING_PLAN_DATA_MODEL.md`
- `docs/MARKETING_PLAN_UAT_CHECKLIST.md`
- `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md`

Source PDF:
- `C:\Users\panuwee.w\Downloads\[FCO] Internal Marketing Plan - June 2026.pdf`

User workflow:
- Do not use git push.
- User uploads files manually through GitHub web UI.
- Final answer must include the exact file list to upload.
- If SQL changes are made, final answer must include exact SQL run order.

Safety:
- Do not store passwords, API keys, service-role keys, tokens, sessions, or secrets in files.
- Do not revert unrelated changes.
- Keep edits small and scoped.
- Do not change files outside the assigned scope.
- If blocked, stop and explain the blocker instead of guessing.

Security:
- Use `auth.uid()` for backend identity.
- Do not trust client-supplied actor IDs.
- Do not add `or public.current_app_user_id() is null` to RLS policies.
- Signed-out users must not read Marketing Plan data.
- Inactive users must not read Marketing Plan data.

Marketing Plan data rule:
- Do not model channel schedule as one publish date on a Creative Request.
- One content item can have many channel placements.
- Each channel placement must own its own channel, publish date, publish time, and placement status.
- FlowMate work item link is optional.

Communication:
- Use simple language.
- Explain what changed and why.
- Include tests run and results.
- Include manual checks needed.
- Include the next recommended step.
```

## Recommended Chat Split

| Chat | Purpose | Can Edit | Must Not Edit |
|---|---|---|---|
| Chat A - Scope / PDF Review | Validate product scope against PDF and Google Sheet workflow | `docs/MARKETING_PLAN_PRODUCT_SCOPE.md`, `docs/MARKETING_PLAN_DATA_MODEL.md`, `docs/MARKETING_PLAN_UAT_CHECKLIST.md`, `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md` | `github/`, `supabase/`, `src/` |
| Chat B - Backend Data Model | Add Marketing Plan tables, RLS, timeline view, summary view, sample seed | `supabase/*.sql`, `supabase/README.md`, `src/lib/flowmate.uat.test.ts` | `github/` |
| Chat C - Product Switch / Shell | Add login product choice and separate Marketing Plan shell/routes | `github/app.jsx`, `github/app.css`, `github/index.html`, `src/lib/flowmate.uat.test.ts` | `supabase/` |
| Chat D - Campaign Gantt | Build Campaign Gantt: campaign rows, content subrows, placement markers | `github/screens-c.jsx`, `github/app.css`, `github/index.html`, `src/lib/flowmate.uat.test.ts` | `supabase/` unless consuming loader contract |
| Chat E - Content Table / Detail | Build sheet-like content table and content detail | `github/screens-c.jsx`, `github/app.css`, `github/search-utils.js`, `src/lib/flowmate.uat.test.ts` | `supabase/` |
| Chat F - Channel Calendar / Filters | Build channel calendar, filters, search, export if scoped | `github/screens-c.jsx`, `github/app.css`, `github/search-utils.js`, `github/data.jsx`, `src/lib/flowmate.uat.test.ts` | `supabase/` |
| Chat G - QA / Release | Final UAT, security regression, release docs | `docs/MARKETING_PLAN_RELEASE_CANDIDATE_*.md`, `src/lib/flowmate.uat.test.ts` | Feature files unless fixing test/docs only |

## Recommended Order

1. Chat A validates docs against PDF workflow.
2. Chat B implements backend data model.
3. Chat C implements product switch and Marketing Plan shell.
4. Chat D implements Campaign Gantt.
5. Chat E implements Content Table and detail.
6. Chat F implements Channel Calendar, filters, search, and export.
7. Main Coordinator integrates and runs tests.
8. Chat G performs final QA/release checklist.

Parallel guidance:

- Chat B must finish before C-F if frontend needs real data.
- Chat C and Chat B can run in parallel only if Chat C uses static shell without data loaders.
- Chat D/E/F should not run in parallel unless their file ownership is split further, because all likely edit `github/screens-c.jsx` and `github/app.css`.
- Chat G must run last.

Known ownership conflict warning:

- Chat D, Chat E, and Chat F all touch `github/screens-c.jsx` and `github/app.css`.
- If they are run in parallel, the Main Coordinator must split file ownership first or merge manually after each chat.
- Default safe order is D, then E, then F.
- Do not let a worker chat overwrite another worker chat's frontend changes.

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

## Chat A Prompt - Scope / PDF Review

```md
Use the Shared Rules For Every Chat block from `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Product manager + QA + senior software engineer.

Task:
Review Marketing Plan scope against the PDF monthly planning workflow.

Files allowed to edit:
- `docs/MARKETING_PLAN_PRODUCT_SCOPE.md`
- `docs/MARKETING_PLAN_DATA_MODEL.md`
- `docs/MARKETING_PLAN_UAT_CHECKLIST.md`
- `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md`

Files not allowed to edit:
- `github/`
- `supabase/`
- `src/`

Required checks:
- Confirm FlowMate and Marketing Plan are separated after login.
- Confirm Marketing Plan is based on campaign/content/channel placement data, not FlowMate work item data.
- Confirm one content item can publish to multiple channels on different dates/times.
- Confirm PDF fields are represented in the data model.
- Confirm UAT covers Campaign Gantt, Channel Calendar, Content Table, product switch, security, and FlowMate optional link.
- Confirm MVP excludes auto-posting, publishing API, budget, and copy approval workflow.

Deliverable:
- Updated docs if needed.
- Clear ready-for-Chat-B note or blocker note.

Final answer must include:
- What changed.
- Tests run or why not needed.
- Exact files to upload.
- Whether Chat B can start.
- Next recommended step.
```

## Chat B Prompt - Backend Data Model

```md
Use the Shared Rules For Every Chat block from `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Supabase backend engineer + data model reviewer.

Task:
Implement Marketing Plan backend tables and query views.

Files allowed to edit:
- `supabase/*.sql`
- `supabase/README.md`
- `src/lib/flowmate.uat.test.ts`

Files not allowed to edit:
- `github/`
- `docs/`

Required backend deliverables:
- `marketing_plans`
- `marketing_campaigns`
- `marketing_content_items`
- `marketing_channel_placements`
- Optional `marketing_plan_comments` only if simple and safe
- RLS for signed-in active users
- Admin/editor write policy if existing role model supports it safely
- Channel normalization helper
- `marketing_plan_timeline_v`
- `marketing_campaign_summary_v`
- Sample seed data or seed helper matching the June PDF shape

Required behavior:
- One content item supports many channel placements.
- Each placement owns channel, publish date, publish time, and placement status.
- FlowMate work item link is optional.
- Signed-out users cannot read Marketing Plan data.
- No null-user bypass.
- Do not alter FlowMate assignment engine unless required for optional link display.

Automated test candidates:
- SQL creates all core tables.
- SQL has placement table with `publish_date` and `publish_time`.
- SQL has RLS enabled.
- SQL does not add null-user bypass.
- SQL timeline view includes campaign, content item, channel, date/time.

Final answer must include:
- What changed.
- Exact SQL run order.
- Tests run and result.
- Exact files to upload.
- Manual Supabase checks needed.
- Next recommended step.
```

## Chat C Prompt - Product Switch / Shell

```md
Use the Shared Rules For Every Chat block from `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Frontend app shell engineer.

Task:
Add post-login product switch and Marketing Plan shell.

Files allowed to edit:
- `github/app.jsx`
- `github/app.css`
- `github/index.html`
- `src/lib/flowmate.uat.test.ts`

Files not allowed to edit:
- `supabase/`
- `docs/`
- FlowMate execution screen files unless route wiring requires a tiny change

Important existing landing animation rule:
- Do not reintroduce custom cursor.
- Do not change orb behavior back to mouse-following.
- Do not replace SVG SMIL `animateTransform` sigil rotation with CSS animation.

Required behavior:
- After login, user can choose FlowMate or Marketing Plan.
- FlowMate opens the existing app.
- Marketing Plan opens a separate shell/navigation.
- Product name is clear in top/nav.
- User can switch products without signing out.
- No Marketing Plan screens appear inside FlowMate execution navigation by default.

Final answer must include:
- What changed.
- Tests/build result.
- Exact files to upload.
- Manual checks still needed.
- Next recommended step.
```

## Chat D Prompt - Campaign Gantt

```md
Use the Shared Rules For Every Chat block from `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Frontend planning visualization engineer.

Task:
Build Marketing Plan Campaign Gantt.

Ownership warning:
- This chat shares `github/screens-c.jsx` and `github/app.css` with Chat E and Chat F.
- Run after Chat C and coordinate before parallel work.

Files allowed to edit:
- `github/screens-c.jsx`
- `github/app.css`
- `github/index.html`
- `src/lib/flowmate.uat.test.ts`

Files not allowed to edit:
- `supabase/` unless Main Coordinator explicitly approves loader contract changes
- `docs/`

Required behavior:
- Main row = Campaign.
- Sub row = Content Item.
- Column = Date.
- Marker = Channel Placement.
- Multi-channel content shows multiple markers.
- Marker shows channel, publish time, status, format, PIC.
- Filters for month, campaign, team, channel, status, format.
- Clicking content opens content detail or detail placeholder.
- Does not use FlowMate assignee as primary row.

Final answer must include:
- What changed.
- Tests/build result.
- Exact files to upload.
- Manual checks still needed.
- Next recommended step.
```

## Chat E Prompt - Content Table / Detail

```md
Use the Shared Rules For Every Chat block from `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Frontend planning workflow engineer.

Task:
Build sheet-like Content Table and Content Detail.

Ownership warning:
- This chat shares `github/screens-c.jsx` and `github/app.css` with Chat D and Chat F.
- Run after Chat D unless Main Coordinator assigns separate sections in advance.

Files allowed to edit:
- `github/screens-c.jsx`
- `github/app.css`
- `github/search-utils.js`
- `github/index.html`
- `src/lib/flowmate.uat.test.ts`

Files not allowed to edit:
- `supabase/`
- `docs/`

Required behavior:
- Content Table includes Campaign, Team, Details, Format, Tier, PIC, Brief Link, Status, Channels, Publish summary.
- Content Detail shows all content item fields and channel placements.
- FlowMate link is optional.
- Unlinked content rows are valid.
- Linked FlowMate request opens existing FlowMate detail.

Final answer must include:
- What changed.
- Tests/build result.
- Exact files to upload.
- Manual checks still needed.
- Next recommended step.
```

## Chat F Prompt - Channel Calendar / Filters

```md
Use the Shared Rules For Every Chat block from `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: Frontend calendar/filter/export engineer.

Task:
Build Channel Calendar and final planning filters/search/export if scoped.

Ownership warning:
- This chat shares `github/screens-c.jsx` and `github/app.css` with Chat D and Chat E.
- Run after Chat E unless Main Coordinator assigns separate sections in advance.

Files allowed to edit:
- `github/screens-c.jsx`
- `github/app.css`
- `github/search-utils.js`
- `github/data.jsx`
- `github/index.html`
- `src/lib/flowmate.uat.test.ts`

Files not allowed to edit:
- `supabase/`
- `docs/`

Required behavior:
- Channel Calendar uses placement publish date/time.
- Filter by channel, campaign, team, status, format, PIC.
- Search by campaign, content title, details, PIC, channel, format, status.
- Export includes campaign/content/placement data if practical.
- Calendar item opens content detail.

Final answer must include:
- What changed.
- Tests/build result.
- Exact files to upload.
- Manual checks still needed.
- Next recommended step.
```

## Chat G Prompt - QA / Release

```md
Use the Shared Rules For Every Chat block from `docs/MARKETING_PLAN_WORK_SPLIT_PROMPTS.md`, then use this task.

Role: QA engineer + release coordinator.

Task:
Run Marketing Plan MVP QA/release review after implementation chats are complete.

Files allowed to edit:
- `docs/MARKETING_PLAN_RELEASE_CANDIDATE_2026-06-26.md`
- `src/lib/flowmate.uat.test.ts` only for focused missing regression coverage

Files not allowed to edit:
- Feature implementation files unless Main Coordinator explicitly asks.

Required checks:
- Run automated tests.
- Run GitHub build.
- Verify SQL run order.
- Verify product switch.
- Verify Campaign Gantt row hierarchy.
- Verify multi-channel placement behavior.
- Verify Channel Calendar.
- Verify Content Table.
- Verify optional FlowMate link.
- Verify signed-out cannot read data.
- Verify no secrets.
- Verify FlowMate still opens and works.

Final answer must include:
- Pass/fail status.
- Test results.
- SQL run order.
- Exact files to upload.
- Manual checks still needed.
- Release blockers if any.
- Next recommended step.
```

## Main Coordinator Checklist

Before implementation:

- [ ] Confirm Marketing Plan scope is accepted.
- [ ] Confirm Marketing Plan data model is accepted.
- [ ] Confirm Marketing Plan UAT checklist is accepted.
- [ ] Confirm MVP 1.3 FlowMate Planning is held, not released.
- [ ] Confirm whether to revert MVP 1.3 code now or leave it dormant until Marketing Plan shell is ready.

After each worker chat:

- [ ] Read changed files.
- [ ] Check file ownership.
- [ ] Run `npm.cmd test`.
- [ ] Run `npm.cmd run build:github` for frontend changes.
- [ ] If SQL changed, verify SQL run order.
- [ ] Update cumulative upload list.
- [ ] Identify next worker chat.

Before release:

- [ ] SQL applied.
- [ ] GitHub files uploaded.
- [ ] Deployed smoke test passed.
- [ ] Signed-out access blocked.
- [ ] FlowMate existing views still work.
- [ ] Marketing Plan Gantt and Channel Calendar match the monthly sheet workflow.

## Current Next Step

Start with Chat A for scope/PDF review, then Chat B for backend data model.
