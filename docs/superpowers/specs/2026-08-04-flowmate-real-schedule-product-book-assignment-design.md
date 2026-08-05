# FlowMate Real Schedule Permission, Product Book Navigation, and Assignment Diagnosis Design

**Date:** 2026-08-04  
**Status:** Approved  
**Mode:** Build  
**Explicit exclusion:** The requested `N/A Time` option is cancelled. Do not change Time options, defaults, validation, storage, calendar behavior, capacity, workload, KPI, or assignment completeness for N/A.

## 1. Objective

Deliver three scoped outcomes:

1. Allow the active user `fco.punyakon@garena.com` (Real) to change Working Sheet publish time and placement status for rows from every team.
2. Remove the browser-default rectangle border from Product Book patch navigation buttons while preserving selected-state styling.
3. Diagnose why creative requests made by Pointer or Mag can be assigned to Ploy, using audit evidence before changing assignment rules or historical ownership.

## 2. Non-goals

- Do not promote Real to the `admin` role.
- Do not grant Real Whitelist, Team Settings, Product Book management, Supervisor, archive/restore, row deletion, full Working Sheet edit, PIC/Sub PIC, Brief Link, Create Brief, or Repair Link authority.
- Do not broaden table UPDATE RLS so a schedule operator can modify arbitrary columns.
- Do not change FlowMate status when changing Marketing placement status.
- Do not modify assignment ranking, reassign historical work, or repair live member data until the diagnostic result identifies the root cause.
- Do not run SQL, deploy, commit, push, or create a tag in this implementation workspace.

## 3. Real schedule-operator capability

### 3.1 Identity and capability

Add `public.users.can_manage_marketing_schedule boolean not null default false`. The targeted installer sets both:

- `can_access_all_teams = true`
- `can_manage_marketing_schedule = true`

for the active profile whose normalized email is `fco.punyakon@garena.com`. Real remains `role = 'member'`.

The browser bootstrap exposes the new boolean on `window.FLOWMATE_CURRENT_USER`. Missing-column fallback remains compatible while the SQL installer is pending.

### 3.2 Backend authority

Add security-definer RPCs with a fixed search path:

- `marketing_plan_update_working_row_time(uuid, time)`
- `marketing_plan_update_working_row_status(uuid, text)`

Each RPC derives the actor from `auth.uid()` and permits only an active Admin, row PIC, row Sub PIC, or active user with `can_manage_marketing_schedule = true`.

The time RPC updates only:

- `marketing_content_items.source_start_time`
- all matching `marketing_channel_placements.publish_time`
- linked `work_items.publish_time`, when a link exists

The status RPC validates the existing placement-status allowlist and updates only `marketing_channel_placements.placement_status` for the content item.

Existing table UPDATE/DELETE RLS remains unchanged. Direct client updates remain unavailable to Real for rows where Real is not PIC/Sub PIC.

### 3.3 Frontend behavior

Split the current broad permission into:

- full row management: Admin or PIC/Sub PIC
- schedule management: full row manager or `can_manage_marketing_schedule`

Status selects use schedule permission and call the status RPC. Real receives a schedule-only action for changing Time; the existing full Edit/Delete/Create Brief/Repair Link actions remain denied.

For linked FlowMate rows whose effective status is derived from FlowMate Review/Delivered, the UI explains that changing Marketing placement status does not transition FlowMate work status.

## 4. Product Book navigation

Add a Product Book-specific class to patch navigation buttons. Reset only the native button border, appearance, width, text alignment, background, and font inheritance required for those buttons.

Preserve:

- active background
- bold active label
- red left indicator
- hover and keyboard focus behavior
- global `.nav-item` behavior on other screens

## 5. Ploy assignment diagnosis

The checked-in engine indicates that a current Marketing-context automatic run prefers Pond/Joe/Tong/Eye ahead of Ploy. Therefore the implementation adds a rollback-free, read-only diagnostic SQL script that reports:

1. Pointer/Mag requests currently owned by Ploy and the latest `assignment_runs` decision source.
2. Assignment events and manual actor identity.
3. Candidate health for Pond/Joe/Tong/Eye/Vee/Ploy.
4. Requester-team and Esport-context linkage drift.
5. The deployed assignment-function signature/body fingerprint.

Root-cause outcomes are classified as manual assignment, old deployed engine, requester-context drift, or candidate-link/active-state drift. The script does not update data.

## 6. QA and deployment contract

- Tests must fail before implementation and pass after it.
- SQL tests cover active Real, inactive Real, ordinary member denial, Admin/PIC/Sub PIC continuity, column scope, status validation, and linked time sync.
- Frontend tests cover bootstrap capability, schedule-only controls, RPC use, and denial of full actions.
- Product Book tests ensure the scoped class/reset exists and the global nav style is unchanged.
- Run targeted tests, full test suite, `build:github` twice, production build, diff check, and rendered Product Book/Working Sheet visual QA.
- Because both `app.js` and `app.css` change, update all three entry pages together: `app.js?v=20260804-06` and `app.css?v=20260804-02`.
- SQL is handed off for manual staging execution; no live SQL or deployment is authorized by this design approval.

