# ยืนยันบรีฟครบ → Auto Assign สำหรับ Operation

18 กันยายน 2026 — apply SQL ในระบบจริงสำเร็จ; รอผู้ใช้ทำ UAT โดยกดยืนยันเอง

## กติกาที่เปิดใช้

- ผู้ใช้ Active ที่เป็นสมาชิกทีม Operation และ Panu/Admin ตรวจและยืนยันบรีฟงาน Operations ได้ทั้งหมด
- งาน Automation: Battle Pass, Membership, Golden Spin, Conqueror Crate, Topup Promotion จะเรียก Auto Assign เดิมหลังยืนยันบรีฟครบ
- ผู้สมัคร Eye, Tong, Joe (`jo`), Pond ใช้ Skill ทั้ง 1/2, availability, WIP และการจัดอันดับเดิมของ engine ที่ deploy จริง (`state_count_v1`)
- ยังไม่ยืนยัน = ไม่ Auto Assign; มีผู้รับงานแล้ว = ไม่เปลี่ยนคนซ้ำ; ไม่มีคนเข้าเงื่อนไข = Unassigned พร้อมเหตุผล
- Battle Pass ใช้ยืนยันบรีฟครบแทนขั้นปล่อยงานของ Aof และบันทึกผู้ยืนยันจริง; งาน source hold ยังยืนยันปล่อยไม่ได้
- TEST รับผู้รับงานจริงเพื่อทดสอบบน Board/Detail แล้ว Cancel หรือ Archive ได้ แต่ไม่เข้า KPI/Creative Gantt และไม่เพิ่ม capacity allocation, assignment load หรือ rotation ของงานจริง
- งาน TEST 4D ยังไม่เปิดให้ Start/In Progress; รอบนี้ทดสอบยืนยัน → Assign → Cancel/Archive

## ผลตรวจ

- Local ชุดที่เกี่ยวข้อง 102 tests ผ่าน และ release-bundle/Gantt RPC tests เพิ่มอีก 2 ข้อผ่าน
- ชุดเผยแพร่แยกจาก GitHub HEAD c25b776: 26 assignment/reviewer SQL tests + 13 monitor tests ผ่าน
- build:github สำเร็จ เปลี่ยน generated screens-a.js เฉพาะข้อความที่เกี่ยวข้อง
- Security advisor หลัง apply ที่ระดับ error: ไม่พบปัญหา
- อ่านฐานข้อมูลหลัง apply: TEST CR-1243, CR-1264, CR-1265, CR-1266, CR-1267 มี submitted อย่างละ 1, accepted 0, owner ว่าง, status Unassigned; KPI, Creative KPI, Gantt และ allocation อย่างละ 0
- ตรวจ read RPC ด้วยบทบาท authenticated ของ Aof/Operation และ Panu/Admin: can_accept=true (ไม่มีการกดยืนยันจริง)
- สมาชิก ops ที่ Active ขณะตรวจ: Folk, Aof, Po, Big, Mark, Gear; Panu ได้สิทธิ์ Admin สิทธิ์ใช้ membership/role จากฐานข้อมูล ไม่อ้างชื่อแสดงผล
- รอบนี้ไม่มีการ Assign แทนผู้ใช้หรือส่ง SeaTalk ซ้ำ; scheduler/test-generation/notifier flags ยังปิด การยืนยันด้วยคนใช้งานได้แยกจาก flags เหล่านี้

## ขั้นตอนทดสอบของผู้ใช้

1. Refresh FlowMate แล้วเปิด TEST CR; ตรวจ Brief Link ด้วยบัญชี Operation หรือ Panu/Admin
2. ระบุเหตุผล แล้วกด “ยืนยันบรีฟครบ”
3. ตรวจผู้รับงาน, Type/Skill 1–2, assignment reason และ Activity Log บน Detail/Board
4. ถ้าไม่มีคนเข้าเงื่อนไข ตรวจเหตุผล Unassigned; ระบบไม่บังคับเลือกคนหรือข้าม Skill
5. ตรวจ KPI/Creative Gantt ว่าไม่แสดง TEST
6. Panu กด Cancel หรือ Archive จาก Board ตามสิทธิ์เดิม

งานย้อนหลังยังใช้วันเดิม ไม่เลื่อนวันเพื่อหลบคำเตือน; Auto Assign ใช้สภาพทีม ณ เวลายืนยัน จึงอาจเลือกคนต่างจากเดือนประวัติศาสตร์ การ Assign หลังคลิกจริงและ Cancel/Archive ใน production รอผู้ใช้ UAT

## ไฟล์และการติดตั้ง

- `supabase/activity_automation_acceptance_release.sql`: รวม 5 delta ใน transaction เดียว; apply สำเร็จแล้ว
- `activity_automation_brief_assignment.sql`: acceptance trigger, gate, durable TEST registry, report exclusions, cancellation/archive guard
- `activity_automation_ops_brief_reviewers.sql`: สิทธิ์ Operation/Admin และ read policies; ไม่เปิด direct INSERT evidence ให้ authenticated
- `activity_automation_battle_pass_brief_evidence.sql`: ลงทะเบียน Brief Link เดิมและที่สร้างใหม่เป็น submitted โดยไม่ accepted
- `activity_automation_battle_pass_acceptance.sql`: ปิด endpoint ปล่อยงานแบบเก่าและใช้ accepted evidence
- `activity_automation_acceptance_verify.sql`, `activity_automation_reviewer_verify.sql`: ตรวจแบบไม่ยืนยัน/Assign
- `src/lib/activity-automation/brief-assignment.test.ts` และ fixtures: ใช้ snapshot engine จริง 18 Sep 2026 ทดสอบใน PGlite แยกจาก production

Installer ตรวจ anchor ของ deployed function และยกเลิก transaction หากไม่ตรง แก้เฉพาะ gate/การไม่นับ TEST ไม่เปลี่ยนสูตรเลือกคน ต้อง apply delta นี้อีกครั้งหาก installer เก่าเขียนทับ assignment/brief RPC หรือ isolation functions

Evidence local: `output/phase4d/acceptance-live-verify.json`, `reviewer-live-verify.json`, `reviewer-aof-verify.json` ไม่รวม credentials

## ตรวจเส้นทางหน้าเว็บจริงเพิ่มเติม

Creative Gantt ใช้ flowmate_list_team_schedule RPC เป็นหลัก และ view เป็น fallback จึงเพิ่ม activity_automation_gantt_isolation.sql ให้กรองทั้งสองเส้นทาง ทดสอบ assigned TEST ด้วย RPC จริงใน PGlite แล้ว TEST ไม่แสดง แต่งานจริงยังแสดงตามเดิม ตรวจ GitHub Pages HTTP 200 และ cache version 20260918-brief-assign แล้ว
