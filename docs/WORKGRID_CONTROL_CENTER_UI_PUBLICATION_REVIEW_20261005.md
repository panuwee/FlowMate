# Workgrid Control Center v0.6 — D2 UI publication review

วันที่ 5 ตุลาคม 2026 · สถานะ: เตรียมเผยแพร่ UI; ยังไม่ commit/push หรือเผยแพร่หน้าเว็บ

## ชุดเผยแพร่ที่ตรวจได้

- Repository: `https://github.com/panuwee/FlowMate.git` remote `github`; target `version2.1.1`
- Baseline ที่ตรวจจาก GitHub: `4663e6f66b8dd72f7cf4e3b6cfe641b67d172459`
- Overlay: `output/control-center-release-20261005/manifest.json` ระบุไฟล์และ SHA-256 ทุกไฟล์
- Rehearsal: `output/control-center-ui-rehearsal-20261005/` เป็นสำเนา release พร้อม overlay ไม่ใช่ Git worktree
- รายการเปลี่ยน: หน้า Control Center/JS/CSS, navigation และลิงก์ Team Members, build entry, SQL/worker ที่ติดตั้งแล้ว, tests/fixtures, เอกสาร WCC และ scripts เตรียม release
- `supabase/config.toml` ประกอบจาก baseline เพิ่มเฉพาะ WCC function; ไม่ใช้ config ของ dirty root
- `index.html`, `home/index.html`, `product-book/index.html` เปลี่ยน cache stamp ด้วย implementation ที่มีใน release; ไม่มีการเปลี่ยนเนื้อหาหน้าเดิม
- ไม่รวม `output/`, secrets, `.env`, node_modules หรือการเปลี่ยนอื่นใน root

## หลักฐานตรวจสอบ

- Build ของ materialized release ผ่าน และรักษา `screens-task-assign.jsx` ใน source list
- Tests เฉพาะ WCC 79 ข้อผ่าน: database 30, adapters 18, provider 25, UI 6; isolated offline fixtures ไม่เชื่อม production
- Worker/deploy TypeScript check ผ่านในขั้น D1
- Browser localhost port 4179 ตรวจ Overview, ผู้รับ, Bots, ฟอร์มแก้ Bot และกลุ่ม SeaTalk; console ที่อ่านไม่พบ error/warn
- ฟอร์มมี App ID, secret reference, draft/active/inactive/archived, ทีม และเหตุการณ์ Assign/Review
- Screenshot: `C:/Users/panuwee.w/.codex/visualizations/2026/10/05/01a10a7b-807e-7de1-a6c2-54d8a89c2dbc/workgrid-control-center-release-bot-settings.png`
- Demo ใช้สมาชิกสมมติและทีมตัวอย่าง ไม่ใช่ผลตั้งค่า Folk จริง; pilot จริงเป็น Folk/Operations/Review ผ่าน GroupID `Njk2MTczMDEwNTg2`
- ยังไม่มี production browser login หรือการทดสอบโดยบัญชีหัวหน้าทีมจริง

## วิธีเผยแพร่หลังอนุมัติ

เนื่องจาก root มีงานอื่นค้างและมี checkout เกิน quota จะใช้ temporary Git index ที่เริ่มจาก baseline และใส่เฉพาะไฟล์ตาม manifest ไม่เปลี่ยน root index, branch หรือไฟล์งานอื่น และไม่เพิ่ม worktree

1. ตรวจ GitHub HEAD ซ้ำ; ถ้าเปลี่ยนให้ประกอบและตรวจชุด release ใหม่ก่อนเผยแพร่
2. ตรวจ hashes/allowlist, diff, secrets และ equivalent release checks ก่อนสร้าง commit จาก tree ที่แยกไว้ (`git write-tree` / `git commit-tree`); วิธีนี้ไม่เรียก pre-commit hook จึงต้องตรวจ cache stamp และไฟล์ทั้งชุดโดยตรง
3. เก็บ commit บน branch `codex/workgrid-control-center-ui-20261005` และ push แบบ fast-forward ไป `github/version2.1.1` ตาม approval; ไม่ force-push และไม่ push ไป `origin`
4. ตรวจ GitHub publication/Pages ตามวิธี deploy ปัจจุบัน และเปิด URL จริงเพื่อตรวจ asset/nav; การ push เพียงอย่างเดียวไม่ถือว่า live UI ผ่าน

Approval ต้องครอบคลุม commit, push และ UI publication โดยชัดเจนตาม AGENTS.md; ชุดนี้ไม่ขอรวม activation หรือ TEST

## ขอบเขต production

SQL ติดตั้งแล้วแบบปิดส่ง; worker version 1 deploy แล้วตาม approval เดิม ดู SQL_INSTALL_RESULT และ WORKER_DEPLOY_RESULT แยกจากผล UI

UI publication ไม่เปิด runtime, Bot, rules, scheduler, recipient profile, route ownership หรือส่ง SeaTalk TEST ไม่ replay งานเก่า และไม่เปลี่ยน Tong legacy route

หลัง UI live จึงตรวจ Admin session และวาง pilot Pond/Folk แยกขั้น การแจ้ง Review ต้องส่งหา actual Requester ที่ตรง profile เท่านั้น Freelance ใช้ GroupID ไม่มี DM fallback และ Activity สำเร็จเมื่อ output ครบชุด

## Worktree disposition

คง checkout เดิมทั้งหมด ไม่มีการสร้าง/ลบ worktree หรือย้าย canonical checkout; overlay/rehearsal เป็นหลักฐาน local และคงไว้เพื่อเผยแพร่หลังอนุมัติ
