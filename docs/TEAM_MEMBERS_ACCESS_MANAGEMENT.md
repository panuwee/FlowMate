# Team Members: โดเมน, Team Profile และ Viewer

สถานะ: SQL ติดตั้งจริงวันที่ 2026-10-02 และ production smoke แบบ rollback ผ่านแล้ว; ชุดไฟล์นี้เตรียมเผยแพร่จาก GitHub baseline โดยแยกงานอื่นที่ค้างในเครื่อง

## พฤติกรรมที่เพิ่ม

- Admin จัดการโดเมนได้ใน Team Members → Allowed Domains เริ่มด้วย `garena.com` และ `sea.com`
- ต้องอนุญาตทั้งโดเมนและอีเมลรายคน โดเมนที่เปิดไม่ได้ทำให้ทุกคนในบริษัทเข้าได้
- ปิดโดเมนแล้วบัญชีเดิมในโดเมนนั้นถูกปฏิเสธคำขอ API ด้วย Admin ปิดโดเมนตัวเองไม่ได้
- ช่อง Team Profile อยู่หลัง Name เลือกโปรไฟล์เดิมหรือสร้างชื่อใหม่ได้ ชื่อซ้ำถูกปฏิเสธ
- โปรไฟล์ใหม่เริ่มพักรับงาน ไม่มี Skills และ Capacity; Admin ต้องตั้งค่าใน Creative Capacity ก่อนแจกงาน
- Viewer ดูได้เฉพาะทีมที่ Admin เลือก อย่างน้อยหนึ่งทีม และไม่สามารถสร้าง/แก้ไข/รับงานได้
- เก็บทีมของ Viewer ได้ตั้งแต่ก่อนล็อกอินครั้งแรก; ตอนสร้างบัญชีจะเชื่อมสิทธิ์ทีมให้อัตโนมัติ
- รายชื่อทีมที่ดูได้คือ GD/VE, Operations, Marketing, eSports ไม่ได้เพิ่ม workspace Webdev ใหม่
- นำ Google login hint ที่บังคับ `garena.com` ออก แต่ฐานข้อมูลยังตรวจโดเมนและ whitelist

## วิธีเพิ่ม Webdev หลังเผยแพร่

1. เข้า Team Members และตรวจว่า `sea.com` เปิดอยู่
2. Add member → Name → Team Profile เลือก None ได้ถ้าต้องการดูอย่างเดียว
3. ใส่อีเมลจริง → Role = Viewer → เลือกทีมที่ดูได้ → Save changes
4. ผู้ใช้ล็อกอินด้วย Google บัญชีที่ตรงกับอีเมลนั้น

## ไฟล์และลำดับนำขึ้นระบบ

แอป: `app.jsx`, `screens-a.jsx`, `screens-b.jsx`, `app.css`, `supabase-client.js`, `supabase-quick-task.js`,
ไฟล์ build `app.js`, `screens-a.js`, `screens-b.js` และ cache stamp ของ `index.html`, `home/index.html`, `product-book/index.html`

ฐานข้อมูล: `supabase/team_members_access_management.sql`

ก่อนใช้ installer ต้องตรวจโครงสร้างและนิยามฟังก์ชันจริง โดยอ้างอิง installer เดิม
`whitelist_access.sql`, `team_settings_admin.sql`, `team_members_lifecycle.sql` และ `workflow_team_workspaces.sql`.
ไม่รัน installer เดิมซ้ำบนระบบจริงเพียงเพื่อให้ไฟล์นี้ผ่าน เพราะอาจเปลี่ยนข้อมูลเดิม

หลังใช้ installer ให้ยืนยัน pre-request hook เป็น `public.flowmate_check_member_access`;
ถ้ายังไม่ได้ตั้ง ให้ตรวจและใช้ `supabase/team_members_access_hook.sql` ซึ่งปฏิเสธการทับ hook อื่น
hook นี้จำเป็นเพื่อปฏิเสธคำสั่ง RPC ที่ยังไม่ได้ตรวจว่าเป็นคำสั่งอ่าน ก่อนเกิดผลข้างเคียง

installer เพิ่ม trigger ป้องกัน Viewer เขียนในตารางแอปที่มีอยู่ รวมถึง RPC แบบ SECURITY DEFINER;
เพิ่ม restrictive read policy สำหรับ work_items และตารางแนบที่เปิด RLS;
เสริมการป้องกัน creative brief และ SeaTalk OT dispatch ที่ใช้ service-role พร้อม actor ID.
เมื่อเพิ่มตารางหรือ RPC ใหม่ในอนาคต ต้องทบทวนการป้องกัน Viewer และรายการ read RPC อีกครั้ง

checkout มีงานอื่นค้างอยู่ก่อนเริ่มงานนี้ จึงต้องแยกเฉพาะการเปลี่ยนแปลงของงานนี้
ก่อนนำไป branch `version2.1.1` และเผยแพร่ ห้ามเผยแพร่ไฟล์ทั้งหมดจาก checkout นี้ตรงๆ;
ให้ใช้ชุดเปลี่ยนแปลงเฉพาะงานและตรวจ diff ก่อนเผยแพร่แทน

## การตรวจในเครื่อง

`npm.cmd test -- --config src/lib/team-members/vitest.access.config.ts`

ใช้ PGlite แยกในหน่วยความจำ ไม่มีการต่อฐานข้อมูลจริง:
ผลล่าสุด: 30 tests ผ่านทั้งหมด (access-management 14, navigation/Viewer detail 4, lifecycle 12)
โดเมนตรงตัว/ปลอม, บัญชีเดิมเมื่อปิดโดเมน, whitelist, ชื่อโปรไฟล์ซ้ำ,
rollback, ตั้งค่า Capacity ผ่าน RPC เดิม, Viewer เขียนผ่าน RPC/SQL/GET ไม่ได้,
Viewer dispatch OT ไม่ได้, ทีมก่อนล็อกอินและแก้ไขทีม, RLS ไม่เผยทีมที่ไม่ได้เลือก,
navigation และ lifecycle เดิม

ตรวจหน้าจริงผ่าน `scripts/preview-team-members-access.cjs` ซึ่งใช้ fixture เท่านั้น
และไม่โหลด Supabase client ของระบบจริง ภาพอยู่ที่
`output/team-members-access-preview/member-profile.png`

Build: `npm.cmd run build:github`

ชุด static UAT เก่ามีข้อไม่ผ่านในส่วนที่งานนี้ไม่ได้แก้ เช่น 1st Draft,
planning view extraction, Saved views และ marker ADMIN WHITELIST.
เก็บรายละเอียดใน `output/team-members-access-preview/shared-tests.json`
ผลชุดร่วม: 289 ผ่าน, 14 ไม่ผ่าน; ข้อไม่ผ่านอยู่ในบริเวณเดิมที่การเปลี่ยนแปลงนี้ไม่ได้แก้
อย่าอ้างว่าชุดทดสอบทั้งโครงการผ่าน

## ข้อที่ยังต้องตรวจเมื่อได้รับอนุญาตนำขึ้นระบบ

- ตรวจนิยาม SQL จริงก่อน apply เพราะฟังก์ชันบางตัวถูกเสริมจาก installer อื่น
- ตรวจว่า Google OAuth consent configuration รับบัญชี `sea.com` ได้;
  การแก้แอปไม่ยืนยันข้อจำกัด organization ของ Google OAuth
- ทดสอบล็อกอินจริงด้วยอีเมลที่ Admin อนุญาต และยืนยันว่า Viewer ดูเฉพาะทีมที่เลือก
- ทดสอบ Member/Admin เดิมยังใช้งานได้ และตรวจ badge/cache stamp หลังเผยแพร่
- SQL rollback ต้องออกแบบจากสถานะจริงก่อนเผยแพร่ ห้ามย้อน role constraint เป็นสองค่า
  ขณะยังมี Viewer หรือย้อนโดเมนเหลือ Garena ขณะยังมีสมาชิก Sea

ไม่มีการส่งข้อความ SeaTalk จริงหรือสมัครสมาชิกจริงระหว่างทดสอบ
