# Task Assign Workspace — ผลงาน local 2026-10-01

> สถานะล่าสุด: รวมบนฐาน GitHub version2.1.1 แล้วใน checkout task-assign-workspace-release ดู `TASK_ASSIGN_WORKSPACE_INTEGRATION.md` สำหรับยอดทดสอบล่าสุดและ release manifest ข้อมูลด้านล่างเป็นผลก่อนรวม

แก้ใน checkout ที่ผู้ใช้อนุมัติ: `C:\SeaTH\Projects\flowmate\.worktrees\version2.1.1` บน branch `version2.1.1` งานค้างที่ไม่เกี่ยวข้องยังอยู่ครบ ไม่มี commit, push, production SQL หรือ deployment

## สิ่งที่ปรับ

- Sidebar เพิ่ม My work (Assigned to me / Created by me) และ Workspace
- Workspace แยก Marketing, Operations, eSports มี Team work, Incoming requests, Sent to other teams
- งานข้ามทีมใช้ Task ID เดียว ผู้รับเรื่องของทีมปลายทางรับงาน เลือกผู้รับผิดชอบ และยืนยัน Deadline
- ฟอร์ม: Title แก้ได้, Note/ผลส่งมอบจำเป็น, Project/Campaign และ 1st Review Date เลือกไม่กรอกได้, Responsible team, Assignee ภายในทีม, Deadline, Priority และเหตุผลเมื่อ Urgent
- เพิ่มลิงก์อ้างอิง/ไฟล์, งานลับ/ผู้ร่วมงาน, Parent task
- ผู้รับผิดชอบเริ่มงาน ส่งตรวจ และผู้ขอยืนยันส่งมอบ มีขอข้อมูลเพิ่ม ปฏิเสธ ส่งใหม่ เปลี่ยนผู้รับผิดชอบ ยกเลิก เปิดใหม่ คอมเมนต์ และประวัติ
- ตรวจสิทธิ์ฝั่งฐานข้อมูล รวมรายการ รายละเอียด ลิงก์ตรง ข้อมูลลูก และ notification; ป้องกันการแก้พร้อมกันด้วย updated_at และสร้างซ้ำด้วย request key
- งานของคนที่ออกจากทีมหรือถูกปิดบัญชีกลับเข้า queue; งานไม่มี Review แสดงใน Schedule/Calendar ด้วย Deadline
- มือถือฟอร์มเรียงคอลัมน์เดียว ตารางเลื่อนแนวนอนเฉพาะภายในตาราง

## หลักฐานตรวจสอบ

- `output/task-assign-workspaces/final-tests.json`: 443 tests ผ่าน, 0 failed ใน 9 suites
- Database integration ใช้ PGlite PostgreSQL ในหน่วยความจำเท่านั้น: 10 tests ครอบคลุมสิทธิ์ข้ามทีม/งานลับ, acceptance, review, retry, stale update, direct write denial, notification และสมาชิกออกจากทีม/ปิดบัญชี
- Client/form tests: 6 tests รวมการแสดง Deadline-only ใน Calendar และ backend ไม่พร้อมแล้วไม่ย้อนสร้างด้วย API เก่า
- `npm.cmd run build:github` ผ่าน และ `node --check` client ที่แก้ผ่าน
- Browser ตรวจ component จริงด้วย mock API บน localhost ทั้ง desktop และ 390px: Workspace, ฟอร์ม, การส่งข้ามทีม, และ Accept & assign เปลี่ยนเป็น Accepted/Assigned พร้อม committed deadline
- ภาพ `output/task-assign-workspaces/workspace-preview.png` เป็นข้อมูลจำลอง ไม่ใช่ production

## ไฟล์หลัก

`app.jsx/js`, `app.css`, `screens-a.jsx/js`, `screens-b.jsx/js`, `screens-c.jsx/js`, `screens-task-assign.jsx/js`, `supabase-quick-task.js`, `supabase-list-data.js`, `build-github.cjs`, และ 3 entry HTML

SQL ใหม่: `supabase/task_assign_workspaces.sql`; design brief: `docs/TASK_ASSIGN_WORKSPACE_DESIGN.md`; tests: `src/lib/task-assign-workspaces.test.ts`, `src/lib/task-assign-workspaces-ui.test.ts` พร้อมปรับ assertion ของพฤติกรรมเก่าที่เปลี่ยนโดยตั้งใจ

## ก่อนเปิดใช้จริง

1. ขออนุมัติ production SQL / publication แยกจากการแก้ local; ตรวจ branch, diff, remote และไฟล์ค้างอีกครั้ง
2. ตรวจ installed schema/functions/policies/notification และ backup บน environment เป้าหมายก่อน apply SQL; fixture tests ไม่ยืนยันว่า schema จริงตรงกันทั้งหมด
3. Installer ต้องมี `workflow_team_workspaces.sql` และ `task_assign_module.sql` อยู่แล้ว แล้วจึง apply `task_assign_workspaces.sql` ไม่ rerun baseline ทับ wrappers ใหม่
4. Admin ตั้ง receiving dispatchers ของแต่ละทีมผ่าน Workspace; ทีมทั่วไปที่ไม่มี dispatcher จะรับคำขอข้ามทีมไม่ได้จนกว่าจะตั้งค่า
5. ตรวจข้อมูลเก่า, สิทธิ์บัญชีจริง, cross-team canary และ Creative Request regressions ใน environment เป้าหมาย
6. ก่อนเผยแพร่ frontend ต้อง rebuild และปรับ release/cache stamp ตาม release manifest ทุก entry page จากนั้นตรวจหน้า live อีกครั้ง

## ขอบเขตที่ยังจำกัด

- ยังไม่ได้ apply SQL หรือทดสอบฐานข้อมูล/บัญชีจริง และยังไม่ได้เผยแพร่
- ไฟล์แนบใช้ลิงก์ไปยัง storage ที่มีอยู่ สิทธิ์ไฟล์ปลายทางต้องตั้งแยก
- งานลับยังส่งต่อไปทีมใหม่ไม่ได้ เพื่อไม่เปิดสิทธิ์ให้คนใหม่โดยไม่ได้เลือกผู้รับ
- My work รวมงานเฉพาะที่ผู้ใช้มีสิทธิ์; Workspace แสดงงานของทีมนั้นและคำขอที่เกี่ยวข้อง ไม่ใช่งานทั้งหมดของทุกทีม
- Notification ใหม่ตรวจในระบบจำลองเฉพาะ in-app ไม่ได้ส่ง SeaTalk/อีเมลจริง
- Dispatcher configuration จำกัด admin; task action/brief/comment มีประวัติ แต่ยังไม่มีหน้าประวัติแยกสำหรับการตั้ง dispatcher
- ถ้ายังไม่มี RPC ใหม่ frontend แจ้งว่า backend ยังไม่ติดตั้ง และไม่สร้างงานผ่าน API เก่าโดยเงียบ ๆ

ตรวจ schema จริงแบบอ่านอย่างเดียวแล้วเมื่อ 2026-10-01 และแก้ lifecycle/งานลับ/Deadline guard ใน local เพิ่ม ดู `docs/TASK_ASSIGN_WORKSPACE_PREFLIGHT.md` สำหรับหลักฐานล่าสุด: 445 regression tests และ live-definition replay 12 tests ผ่าน

ขั้นถัดไปคือรวมเฉพาะงานนี้กับ GitHub version2.1.1 ล่าสุด (checkout เดิมตามหลัง 33 commits) และทดสอบก่อนขออนุมัติเปิดใช้ production
