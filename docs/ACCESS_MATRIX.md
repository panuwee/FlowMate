# FlowMate and Marketing Plan Access Matrix

Date checked: 2026-07-02

This matrix summarizes the current role behavior from frontend route guards, UI action guards, and Supabase SQL/RPC policies.

## Role Summary

| Area | Member | Admin |
| --- | --- | --- |
| Sign in | Must be whitelisted and active. | Must be whitelisted and active. |
| FlowMate navigation | Personal and Team sections only. | Personal, Team, Supervisor, and Admin sections. |
| FlowMate detail page | Can act on work where they are requester, assignee, or owner. | Can act on any Supabase work item through admin override paths. |
| FlowMate status actions | Normal owner/requester/assignee rules apply. | Can override status through `flowmate_admin_transition_work_status`. |
| FlowMate archive | Cannot admin archive. | Can soft archive any work item through `flowmate_admin_archive_work_item`. |
| Links, watchers, AI tags | Can add/remove when requester, assignee, owner, or permitted watcher rule applies. | Can add/remove across work items. |
| Team settings | No admin mutation controls. | Can edit GD/VE skills, capacity, WIP, and availability through admin RPC. |
| Whitelist | Cannot manage whitelist. | Can add/update/delete whitelist users through admin RPC. |
| Marketing Plan core views | Can open Campaign Timeline, Channel Plan, Calendar, and Working Sheet. | Can open all core views plus Supervisor. |
| Marketing Plan Working Sheet actions | Member can manage only Working Sheet rows where they are PIC or Sub PIC. | Admin can manage every Working Sheet row. |
| Marketing Plan Supervisor | Hidden from navigation and direct route shows admin required. | Can view monthly, PIC, campaign, and channel reports. |
| Notifications | Own notifications only. | Own notifications only, plus admin report access where provided. |

## Schedule operator capability

An active user with `can_manage_marketing_schedule = true` is a Schedule operator. The capability applies across the teams that the user can access and grants Working Sheet **Time and Marketing placement Status only**.

This capability does not grant full Edit, Delete, Create Brief, Repair Link, or PIC/Sub PIC controls. It also does not grant changes to channel, launch date, content, tier, asset type, brief link, or the linked FlowMate work-item status. Linked FlowMate Review or Delivered status can continue to override the effective Status displayed in Working Sheet.

Schedule updates use the narrow `marketing_plan_update_working_row_time` and `marketing_plan_update_working_row_status` RPCs. A client connected before either capability column is deployed defaults that missing capability to `false`.

## Current Guard Layers

1. UI route guard:
   - Member FlowMate routes are limited to Personal and Team routes plus detail.
   - Admin FlowMate routes include Supervisor and Admin routes.
   - Marketing Plan Supervisor is added to navigation only for admin users.

2. UI action guard:
   - Working Sheet actions call `canManageMarketingPlanWorkingRow(row)`.
   - Admin returns true for every row.
   - Member returns true only when they are the row PIC or Sub PIC.
   - Time and Marketing placement Status additionally call `canManageMarketingPlanSchedule(row)`, which accepts a full-row manager or a Schedule operator.

3. Backend RPC guard:
   - Admin-only RPCs use `public.is_admin_app_user()` or `public.is_admin_app_user(auth.uid())`.
   - Admin override/archive and whitelist/team-setting updates do not trust a browser-supplied actor ID.

4. Backend RLS:
   - Core Marketing Plan tables currently allow active users to read and write.
   - Supervisor event/report data is admin-only.

## Important Risk

Marketing Plan content and placement updates/deletes are restricted by database policy to PIC, Sub PIC, or admin. Inserts remain available to active users so a new Working Sheet row can be created.

## UAT Coverage

| UAT | Expected result |
| --- | --- |
| Member opens FlowMate | Member sees My work, Create, Board, List, Calendar, Team Schedule, and Central queue. |
| Member opens admin FlowMate route directly | Route is blocked or redirected away from admin-only UI. |
| Admin opens FlowMate | Admin sees Supervisor and Admin navigation. |
| Member edits Working Sheet row where they are PIC or Sub PIC | Edit, status, and Create Brief actions are available. |
| Member edits Working Sheet row where they are neither PIC nor Sub PIC | Actions are disabled or hidden with the PIC/Sub PIC/Admin message. |
| Admin edits any Working Sheet row | Actions are available for every row. |
| Schedule operator changes Time or Marketing placement Status on any accessible-team row | Time or Status update succeeds through the narrow RPC. |
| Schedule operator tries full Edit, Delete, Create Brief, Repair Link, or PIC/Sub PIC controls | Full-row actions remain disabled unless the user is also Admin, PIC, or Sub PIC. |
| Member opens Marketing Plan Supervisor directly | Admin access required is shown. |
| Admin opens Marketing Plan Supervisor | Report loads from admin report views. |
| Member tries whitelist/team settings mutation | Mutation is rejected by admin-only RPC/RLS. |
| Admin performs override/archive | Mutation succeeds and audit actor is the real admin user. |

## Recommended Follow-up

FlowMate creative status transitions also resolve the linked Marketing Plan Sub PIC from `marketing_content_items` so the backend permission matches the Working Sheet guard.
