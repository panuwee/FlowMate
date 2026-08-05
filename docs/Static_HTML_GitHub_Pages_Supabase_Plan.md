# FlowMate MVP 1.0 - Static HTML + GitHub Pages + Supabase Plan

Date: 2026-05-18

## 1. Goal

ทำ FlowMate MVP 1.0 ให้ใช้งานจริงได้เร็วที่สุด โดยลดความซับซ้อนจาก Next.js และใช้แนวทางที่ deploy ง่าย:

- Frontend: Static HTML / CSS / JavaScript
- Hosting: GitHub Pages
- Backend DB: Supabase PostgreSQL
- Auth ช่วงแรก: mock login หรือ simple user selector สำหรับ MVP dev
- Auth ภายหลัง: Supabase Auth / Google Workspace

แนวทางนี้เหมาะกับช่วง prototype-to-pilot เพราะทีมสามารถเปิดเว็บจาก URL ได้ทันที ไม่ต้องรัน dev server หรือจัดการ server เอง

## 2. Why This Is Simpler Than Next.js

Next.js เหมาะกับ production app ที่มี routing, server rendering, API routes, auth flow และ deployment pipeline ชัดเจน แต่สำหรับ FlowMate MVP 1.0 ตอนนี้ สิ่งที่ต้องพิสูจน์ก่อนคือ workflow ใช้ได้จริงหรือไม่

Static HTML + Supabase ง่ายกว่าเพราะ:

- เปิดไฟล์หรือ GitHub Pages ได้ทันที
- Claude Design / webdev ปรับ UI ต่อได้ง่าย
- ไม่มี dev server ระหว่างใช้งาน
- ไม่มีปัญหา build folder, npm dependency, Next static assets
- Supabase ดูแล database, table, view, RLS, RPC ได้
- เหมาะกับ MVP pilot ภายในทีม

## 3. Recommended Architecture

```text
User Browser
  |
  | opens GitHub Pages URL
  v
Static FlowMate Frontend
  - index.html
  - app.css
  - app.js / app.jsx
  - screens.js
  - supabase client
  |
  | HTTPS request with anon public key
  v
Supabase
  - PostgreSQL tables
  - Views
  - RLS policies
  - RPC functions for protected writes
  - Realtime later if needed
```

## 4. MVP 1.0 Scope For This Approach

### Keep

- My Work
- All Work / List View
- Central Queue
- Workload View
- Search
- Overdue / Due soon flags
- Quick task create/read/update
- Creative request create/read
- Assignment result display
- Status transition through backend validation
- Checklist
- Comments

### Keep As Backend Rules

Important logic should not live only in frontend:

- assignment rules
- capacity calculation
- permission checks
- status transition validation
- review round increment
- blocked/cancelled reason requirement
- requester cannot set owner
- requester cannot set effort

These should be handled by Supabase SQL functions / RPC so users cannot bypass rules by editing browser payloads.

### Defer

- Full Next.js migration
- Complex auth registration
- Gantt / Timeline
- Advanced analytics
- Saved filters
- Export
- Real-time sync beyond basic MVP need
- Complex notification system

## 5. File Structure

Recommended simple structure:

```text
flowmate/
  index.html
  app.css
  app.js
  supabase-client.js
  data-mappers.js
  screens/
    my-work.js
    list.js
    queue.js
    workload.js
  assets/
    logo_graphic.png
    logo_horizontal.png
  docs/
    PRD.md
    MVP_Scope.md
    UAT_Cases.md
    Assignment_Rules.md
  supabase/
    schema.sql
    seed.sql
    rpc.sql
```

For the current project, we can also keep the existing prototype files:

- `FlowMate.html`
- `app.css`
- `app.jsx`
- `data.jsx`
- `screens-a.jsx`
- `screens-b.jsx`
- `screens-c.jsx`

Then gradually replace mock data with Supabase reads.

## 6. Supabase Usage

### Frontend Reads

Frontend can read directly from:

- `work_items`
- `creative_request_details`
- `users`
- `team_members`
- `work_item_flags_v`
- `member_workload_v`

### Protected Writes

Frontend should call RPC functions for writes:

- `create_quick_task`
- `update_quick_task`
- `create_creative_request`
- `transition_work_status`
- `add_checklist_item`
- `toggle_checklist_item`
- `add_comment`
- `rerun_assignment`

Reason: direct table writes from browser are risky if business rules can be bypassed.

## 7. Auth Plan

### MVP Dev

Use mock login:

- default user: Pond
- optional dropdown to switch user for QA
- pass selected `actor_user_id` to RPC functions

### Pilot

Move to Supabase Auth with Google Workspace:

- user logs in with company Google account
- match Supabase auth user to `public.users`
- block inactive users
- allow RLS to enforce read/write rules

## 8. GitHub Pages Deployment

Recommended steps:

1. Create GitHub repository.
2. Put static frontend files in root or `/docs`.
3. Keep `.env.local` out of GitHub.
4. Put only Supabase URL and anon public key in frontend config.
5. Enable GitHub Pages.
6. Set source branch and folder.
7. Open generated GitHub Pages URL.
8. Test with Supabase seeded data.

Important:

- Supabase anon public key is acceptable in frontend.
- Supabase service role key must never be placed in frontend or GitHub.
- RLS/RPC must protect sensitive writes.

## 9. QA Checklist Before Pilot

P0 checks:

- page loads from GitHub Pages
- Supabase data loads
- search finds task by ID/title/campaign/requester/assignee
- overdue banner works
- workload numbers match `member_workload_v`
- quick task create works
- checklist save works
- creative request create works
- assignment rules cannot be bypassed
- requester cannot set owner
- requester cannot set effort
- status transition validates permission
- review round increments only on request changes
- blocked requires reason
- inactive user cannot mutate data

## 10. When To Move Back To Next.js

Move to Next.js later only when one of these becomes true:

- app needs secure server-side logic outside Supabase
- auth flow becomes complex
- many pages need maintainable routing
- frontend code becomes hard to manage as static scripts
- webdev team prefers React/Next production workflow
- deployment needs staging/production environments

Until then, static HTML + GitHub Pages + Supabase is enough for MVP 1.0 pilot.

## 11. Recommended Next Step

For FlowMate now:

1. Keep the Claude Design static prototype as the main frontend.
2. Add `supabase-client.js`.
3. Replace mock `WORK` and `MEMBERS` data gradually with Supabase reads.
4. Add Supabase RPC functions for protected writes.
5. Deploy to GitHub Pages.
6. Run UAT against the GitHub Pages URL.

This is the simplest path to MVP 1.0 usable pilot.
