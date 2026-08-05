# FlowMate Creative AI Tag Gantt Lite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock Creative Request `1st Draft` to an automatic 5-working-day offset, make AI Tag one-click, and polish Team Gantt Chart into a Trello Power-Up Lite read-only view.

**Architecture:** Keep all backend contracts stable. Use the existing frontend date helper, existing AI Tag RPCs, and existing Gantt route; improve UI behavior and tests without adding new SQL.

**Tech Stack:** React via browser JSX files in `github/`, Supabase JS RPC helpers, CSS in `github/app.css`, Vitest UAT checks in `src/lib/flowmate.uat.test.ts`.

---

### Task 1: UAT Coverage

**Files:**
- Modify: `src/lib/flowmate.uat.test.ts`

- [ ] **Step 1: Update Creative Request expectations**

Check that `CreativeRequestForm` computes `dueDate` only from `launchDate`, disables the `1st Draft` input, and does not preserve manual due date edits.

- [ ] **Step 2: Update AI Tag expectations**

Check that `addAiTag()` uses default tag `AI`, does not call `window.prompt`, de-dupes an existing AI tag, and keeps `removeAiTag(tag)`.

- [ ] **Step 3: Update Gantt expectations**

Check that `TeamGanttScreen` includes Power-Up Lite UI markers: today line, toolbar/filter chips, launch marker, priority/overdue classes, and click-to-open detail.

### Task 2: Creative Request 1st Draft Auto-Lock

**Files:**
- Modify: `github/screens-a.jsx`

- [ ] **Step 1: Simplify launch date update**

When `launchDate` changes, always set `dueDate` to `subtractFlowMateWorkingDays(launchDate, 5)`.

- [ ] **Step 2: Disable 1st Draft input**

Render the Creative Request `1st Draft` input as disabled/read-only and add helper text that it is generated from Launch Date.

- [ ] **Step 3: Preserve Quick Task behavior**

Do not change `QuickTaskForm`.

### Task 3: AI Tag One-Click Add/Remove

**Files:**
- Modify: `github/screens-a.jsx`
- Modify: `github/app.css`

- [ ] **Step 1: Replace prompt with default tag**

Set `const tag = "AI"` in `addAiTag()` and remove prompt handling.

- [ ] **Step 2: Prevent duplicates in UI**

If any current tag lower-trims to `ai`, return early without calling the RPC.

- [ ] **Step 3: Make remove visible**

Keep the existing remove RPC call but make the remove button label/icon clearer and style it as a small delete control on each tag chip.

### Task 4: Gantt Power-Up Lite UI

**Files:**
- Modify: `github/screens-c.jsx`
- Modify: `github/app.css`

- [ ] **Step 1: Add today position and richer task model**

Compute today offset for the selected month, priority classes, and display labels.

- [ ] **Step 2: Add toolbar/filter chips**

Show month selector plus read-only chips for grouped timeline, launch markers, and click-to-open behavior.

- [ ] **Step 3: Polish chart rows**

Add sticky owner column feel, today line, compact task bars, launch marker, weekend shading, and priority/overdue visual classes.

### Task 5: Verification

**Files:**
- Verify all changed files

- [ ] **Step 1: Run tests**

Run: `npm.cmd test`

- [ ] **Step 2: Run build**

Run: `npm.cmd run build`

- [ ] **Step 3: Final handoff**

List whether SQL is needed and list exact files to upload manually to GitHub.
