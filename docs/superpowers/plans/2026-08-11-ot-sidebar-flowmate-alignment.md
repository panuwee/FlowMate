# OT Sidebar FlowMate Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align only the OT Request sidebar navigation with the FlowMate sidebar visual language.

**Architecture:** Add scoped CSS overrides below the OT shell stylesheet. The JSX navigation and generic `.nav-item` rules remain unchanged, so role gating, routing, accessibility properties, and other products are unaffected.

**Tech Stack:** React JSX, static CSS, Vitest, Next.js build.

## Global Constraints

- Modify only the OT-scoped sidebar CSS and its focused UAT contract.
- Preserve `.ot-sidebar` keyboard focus and responsive rules.
- Do not alter shared `.nav-item` or `.nav-section` selectors.

---

### Task 1: Scope OT sidebar visual overrides

**Files:**
- Modify: `app.css:3697-3828`
- Modify: `src/lib/ot-request.uat.test.ts`

**Interfaces:**
- Consumes: existing `.ot-sidebar`, `.nav-item`, `.nav-section`, and `.is-active` classes.
- Produces: FlowMate-aligned OT-only navigation styling.

- [ ] **Step 1: Write the failing test**

```ts
expect(css).toContain(".ot-sidebar .nav-item { border: 0;");
expect(css).toContain(".ot-sidebar .nav-item.is-active { border-left: 3px solid var(--garena-red);");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/lib/ot-request.uat.test.ts`

Expected: FAIL because no OT-scoped sidebar override exists.

- [ ] **Step 3: Write minimal implementation**

```css
.ot-sidebar .nav-item { border: 0; }
.ot-sidebar .nav-item.is-active { border-left: 3px solid var(--garena-red); }
```

- [ ] **Step 4: Run verification**

Run: `npm.cmd test -- src/lib/ot-request.uat.test.ts && npm.cmd run build`

Expected: both commands PASS.

- [ ] **Step 5: Commit**

```powershell
git add -- app.css src/lib/ot-request.uat.test.ts
git commit -m "style: align OT sidebar with FlowMate"
```
