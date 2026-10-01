# Task Assign — ตรวจความพร้อมก่อนเปิดใช้ (2026-10-01)

## ผลตรวจ

อ่านฐานข้อมูล FlowMate project `jbavahimqjalvcfawgqw` ผ่าน Supabase Management API ด้วย SELECT เท่านั้น ไม่ได้ apply installer, สร้างงาน, เปลี่ยนสิทธิ์, ส่ง SeaTalk, commit, push หรือ deploy

หลักฐาน schema บันทึกเมื่อ 17:04 น. เวลาไทย: PostgreSQL 17.6 มีทีม mkt/ops/esport/gdve ที่ active ทั้งหมด และมี functions/policies/tables ที่ installer ต้องใช้ครบ รวม checklist_items ที่ตรวจแยก

- Quick Task เดิมรวม 23 งาน ไม่มี requester_team ที่ normalize ไม่ได้
- การอ่าน aggregate ครั้งถัดไปพบ active Quick Task 0 งาน (ไม่นับ archived/delivered/cancelled) จึงไม่มี active assignee ที่ต้องแก้ก่อน upgrade ในขณะตรวจ
- คอลัมน์ task_* และ dispatcher table ใหม่ยังไม่ติดตั้ง; due_date จริงยัง NOT NULL
- work item views ที่ตรวจมี security_invoker=true
- Creative SeaTalk assignment trigger และ Creative KPI trigger ข้าม Quick Task; ไม่แก้ logic ของ Creative
- ระบบ Activity/Battle Pass มี guard และ notification suppression ของตัวเอง คงไว้ทั้งหมด ไม่ใช้ production canary ในขั้นนี้

## จุดที่พบและแก้ใน local

1. `can_access_all_teams` เดิมรวมทั้ง admin และผู้ดูงานทั่วไป: คงสิทธิ์อ่านงานปกติ แต่ไม่ให้สิทธิ์นี้เปิดงานลับหรือรับงานแทน dispatcher โดยอัตโนมัติ งานลับให้เฉพาะคนที่เกี่ยวข้องและ admin
2. ระบบจริงมี scheduled offboarding ใน `flowmate_member_access_allowed`: API ใหม่, directory, read/execute/dispatch/notification เคารพ suspension ที่ติดตั้งอยู่ ป้องกันบัญชี is_active=true แต่ถูกระงับตามเวลา
3. `flowmate_members_private.guard_assignment` เดิมใช้ due_date: ปรับเฉพาะ Quick Task ให้ตรวจ launch_date (Deadline) แทน Review และตรวจ commitment ใหม่แม้ assignee ยังเป็นคนเดิม งาน Creative ใช้เงื่อนไขเดิม
4. เพิ่ม restrictive SELECT guard ให้ capacity allocations ด้วย ไม่พึ่ง permissive policy/รายชื่อ readable IDs เดิมเพียงอย่างเดียว
5. รักษา ACL ของ helper เดิม `task_assign_function_for_user` ไม่ revoke ตาม prefix ของ helper ใหม่

## การทดสอบหลังแก้

- `preflight-regression-tests.json`: 445 passed / 0 failed ในชุดทดสอบที่เกี่ยวข้อง 9 ไฟล์
- `preflight-live-replay-tests.json`: 12 passed / 0 failed บน PGlite ในหน่วยความจำ โดย replay definitions ที่อ่านจากฐานข้อมูลจริงสำหรับ shared permission helpers, team guard, notification functions และ member assignment guard
- ครอบคลุมงานไม่มี Review ที่ commit ก่อนวันสิ้นสุดการทำงานได้ และปฏิเสธ commitment ที่เลยวันนั้น รวม suspension, งานลับ, non-admin all-team viewer, capacity child visibility และ installer rerun
- Replay ใช้ fixture schema และบัญชีจำลอง ไม่ได้ clone ข้อมูลจริงหรือทดสอบ trigger/automation ทุกตัวแบบ end-to-end
- Frontend build/browser evidence จาก handoff เดิมยังใช้ได้: ขั้นนี้แก้ SQL/tests/docs เท่านั้น

ไฟล์หลักฐานอยู่ใน `output/task-assign-workspaces/`: live-schema.json, live-trigger-functions.json, live-assignment-functions.json, live-data-readiness.json, preflight-regression-tests.json และ preflight-live-replay-tests.json

## GitHub ล่าสุดและ release manifest

Checkout ที่ได้รับอนุมัติอยู่บน version2.1.1 commit `efb5653`; GitHub HEAD/default branch version2.1.1 ที่อ่านล่าสุดคือ `cdab673c7fa5784639ac6c5be0f5789c2ee28f74` และมี 33 commits ใหม่หลัง checkout นี้ มี source files ที่ซ้อนกับ Task Assign หลายไฟล์ รวม Team lifecycle, KPI และ Activity Automation

ต้องรวมโค้ด Task Assign กับฐานล่าสุดแล้วทดสอบอีกครั้งก่อน commit/publish ไม่สามารถใช้ checkout เก่าทั้งชุดเป็น release ได้

Allowlist ของงานนี้:

- `app.jsx`, `app.css`, `screens-a.jsx`, `screens-b.jsx`, `screens-c.jsx`, `screens-task-assign.jsx`
- `supabase-quick-task.js`, `supabase-list-data.js`, `build-github.cjs`
- `index.html`, `home/index.html`, `product-book/index.html`
- Generated siblings: `app.js`, `screens-a.js`, `screens-b.js`, `screens-c.js`, `screens-task-assign.js` สร้างใหม่บนฐานล่าสุด
- `supabase/task_assign_workspaces.sql`, `supabase/task_assign_workspaces_preflight.sql`
- Tests ใหม่ `task-assign-workspaces.test.ts`, `task-assign-workspaces-ui.test.ts` และเฉพาะ assertion ที่เกี่ยวกับ Task Assign ใน tests เดิม
- `docs/TASK_ASSIGN_WORKSPACE_DESIGN.md`, `docs/TASK_ASSIGN_WORKSPACE_HANDOFF.md`, เอกสารนี้

ไม่รวม SQL/SeaTalk/Activity/test changes ที่ค้างก่อนเริ่มงาน และไม่รวม output snapshots/logs ใน release source

SQL SHA256 หลังแก้สามารถตรวจด้วย `Get-FileHash supabase/task_assign_workspaces.sql -Algorithm SHA256`; ใช้ hash ของ installer ที่ผ่านการทดสอบล่าสุดใน release manifest ขั้นรวมโค้ด

## ลำดับเปิดใช้ที่เสนอ

1. หลังได้รับอนุมัติรวมโค้ด: เตรียมชุด release จาก GitHub default branch ล่าสุด รวมเฉพาะ allowlist รักษาไฟล์ค้างเดิม และทดสอบ regression/build/browser ใหม่
2. จัดรายการ diff + SQL hash + pre-apply evidence ให้ตรวจ แล้วขออนุมัติ production SQL และ commit/push/publication สำหรับชุดที่ระบุ
3. ก่อน apply อ่าน schema/functions/hash ใหม่อีกครั้งเพื่อป้องกัน drift และเก็บ backup/recovery point ที่ restore ได้
4. Apply installer ใน transaction หลัง prerequisites เดิม ไม่ rerun baseline ทับ wrappers ใหม่; ตรวจ installed functions/RLS และ schema cache
5. กำหนด receiving dispatchers ของ Marketing/Operations/eSports ผ่าน admin หลังได้รับอนุมัติผู้รับผิดชอบหรือให้ admin ตั้งเอง
6. Release frontend พร้อม cache/version stamps ใน entry pages ตาม release manifest ตรวจ live version badge และทำ smoke test บัญชีจริงในขอบเขต canary ที่อนุมัติ

## Recovery

Installer เป็น transaction; error ระหว่างติดตั้งต้อง rollback และตรวจสาเหตุก่อน retry ห้ามข้าม guard เพื่อทำให้ติดตั้งผ่าน

ก่อนมีงานใหม่ สามารถคืน installed helper/trigger definitions และ ACL จาก backup ที่ตรวจแล้ว หากเริ่มมีงานข้ามทีมหรือ Quick Task ที่ Review ว่างแล้ว ต้องเก็บข้อมูล/columns และให้ admin จัดการรายการ pending ก่อนคืนระบบเก่า การคืน due_date NOT NULL หรือ helper เก่าแบบทันทีอาจทำให้งานใหม่อ่าน/ดำเนินการไม่ได้ จึงไม่เตรียม destructive rollback อัตโนมัติ

สถานะจบขั้นนี้: live read-only review และ local fixes/tests เสร็จแล้ว รออนุมัติรวมกับ GitHub ล่าสุด ไม่ได้อนุมัติหรือดำเนินการ production writes
