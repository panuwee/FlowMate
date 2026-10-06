# พัก OT Request — 6 ตุลาคม 2026

## ขอบเขตที่ผู้ใช้ยืนยัน

- ซ่อน OT จาก Product Switch และหน้า Select product; ปิดหน้า OT ทั้งหมดชั่วคราว รวมลิงก์ตรงและการจำหน้าจาก sessionStorage
- ปิด API ผู้ใช้และระบบแจ้งเตือนฝั่งเซิร์ฟเวอร์ เก็บข้อมูลเดิมไว้
- อนุมัติผสานตัวกัน OT กับ source ล่าสุด และประสานแชตอื่นเมื่อพบ deploy ซ้อน
- ยังไม่มีการอนุมัติ commit/push/เผยแพร่ UI ของงานนี้

## ผลในเครื่อง

- `app.jsx`: `OT_REQUEST_UI_ENABLED = false` ใช้ร่วมกันสำหรับเมนู การ์ด เส้นทาง และการเลือกผลิตภัณฑ์; ไม่แสดงข้อความแนะนำ OT ในหน้า Home
- OT hash รวม `/manager`, `/export` และเส้นทางย่อยกลับหน้าเลือกผลิตภัณฑ์; saved OT selection ไม่เปิด shell
- `app.js` สร้างจาก `npm.cmd run build:github`; build เปลี่ยนเฉพาะ app.js ในรอบแรก รอบสุดท้ายไม่มี output เปลี่ยน
- ทดสอบเฉพาะ OT client และเมนู 25 ข้อผ่าน (99 ข้อนอกขอบเขตถูกข้าม) พร้อม VM checks สำหรับลิงก์ตรง/sessionStorage และ React rendering ของหน้าเลือกผลิตภัณฑ์
- ตรวจ local browser preview ขององค์ประกอบจริง พบเฉพาะโมดูลอื่น ไม่มี OT; เป็น preview ของ root checkout ไม่ใช่ E2E ของเว็บ production

## ผลบน Supabase จริง

- Project `jbavahimqjalvcfawgqw` (`workgrid-test`)
- ถอน EXECUTE ของผู้ใช้จาก OT RPC 33 ตัว และ SELECT `public.ot_requests` โดยคงสิทธิ์ service_role สำหรับ maintenance/recovery
- เพิ่มเงื่อนไข OT-only ที่ `flowmate_check_member_access()` ซึ่งเป็น PostgREST pre-request hook อยู่แล้ว; บล็อก `/rpc/ot_*` และ `/ot_*` รวม service-role REST โดยไม่แก้ business rules ของโมดูลอื่น
- ตรวจ role privileges: authenticated/anon เรียก OT functions ได้ 0 และอ่าน OT tables ได้ 0
- ทดสอบ hook: OT 4 paths ถูกปฏิเสธตามข้อความพัก; Task Assign และ FlowMate paths ผ่านในการตรวจระดับ hook (ไม่ใช่ authenticated E2E)
- ข้อมูลยังมี OT requests 7 รายการ และ notification records 7 รายการ; actionable queue = 0
- Cron ของโมดูลอื่น 6 jobs ยัง active; ไม่มี OT-specific cron ที่ต้องปิด
- `seatalk-ot-callback` v57 เพิ่ม guard ก่อน parsing/runtime/RPC/provider และตอบ HTTP 503 `OT_MODULE_SUSPENDED`; OPTIONS ยังตอบ 204
- POST HTTP จริง `{ "action": "dispatch" }` ยืนยัน 503 และรหัสพักแล้ว ไม่สร้าง request/notification หรือส่งข้อความ SeaTalk
- ตรวจซ้ำหลังประสานงานและบันทึกเอกสาร: source ยังเป็น v57 มี guard และ live POST ยังตอบ 503
- การทดสอบ source suspended handler ตรวจ POST/GET/DELETE = 503, OPTIONS = 204 และไม่เรียก env/RPC/provider
- Security Advisor อ่านแล้ว; ไม่อ้างว่าปิด WARN ทั้งโครงการหรือเป็นการ audit ครบทุกโมดูล

## การ deploy ซ้อนและการป้องกัน

- v53 และ v55 มี guard แต่ถูกแทนด้วย v54/v56 ที่ไม่มี guard; ตรวจด้วย source retrieval และ live HTTP
- ส่งข้อความประสานแชตตามการอนุมัติผู้ใช้ ได้แก่ Review Supabase log optimization, แก้ Creative report โหลดไม่ครบ และ ออกแบบ AI Control Tower
- Control Tower ยืนยันว่าไม่ได้ deploy OT และจะรักษาสถานะพัก; ยังไม่ทราบผู้ deploy ซ้อนแน่ชัด
- เก็บ backup source v52/v54/v56 ใน `docs/ot-request-suspension/`; deploy ล่าสุดผสานจาก v56 ไม่ย้อน source ทับการเปลี่ยนแปลง
- ทุกครั้งที่ deploy endpoint นี้ต่อ ต้องคง guard พักไว้จนผู้ใช้อนุมัติเปิดกลับ

## เปิดกลับในอนาคต

1. ขออนุมัติเปิด OT ใหม่ก่อน; ค่าพักนี้ไม่ใช่ระบบ lifecycle ครบ 4 สถานะ
2. ตรวจ live source/ACL/hook และไม่มี writer ซ้อนก่อน apply
3. `supabase/ot_request_resume_20261006.sql` เอาเฉพาะ guard ออกจาก hook ล่าสุด และคืนเฉพาะ 33 authenticated grants/SELECT ที่เปลี่ยน ไม่คืน service-role grants แบบกว้าง
4. ผสานเอาตัวกันพักออกจาก Edge source ล่าสุดโดยเก็บการแก้ไขอื่นไว้; ไม่ deploy backup เก่าทับทันที
5. ตรวจคิวและรายการเดิมก่อนเปิดส่ง ไม่ replay notification ที่ยกเลิกเอง
6. เปิด UI flag แล้ว build/ทดสอบ/เผยแพร่ภายใต้การอนุมัติแยกต่างหาก

## Git และข้อจำกัด

- Root `C:\SeaTH\Projects\flowmate` ยังอยู่ branch `version2.1` และมีงานอื่นค้าง; ไม่สลับ branch ไม่ overwrite งานอื่น
- Root UI เก่ากว่าเว็บ release ที่มี Task Assign; ต้องผสานเฉพาะ OT patch เข้าฐาน GitHub `version2.1.1` ล่าสุดก่อนเผยแพร่ ห้ามยก app.jsx ทั้งไฟล์จาก root ไปทับ release
- ไม่สร้าง/ลบ worktree ในงานนี้; worktrees เดิมเก็บไว้ตามสถานะของแต่ละงาน
- การถอนสิทธิ์กว้างรวม service_role ถูก auto-review ปฏิเสธและไม่ได้ apply; ใช้วิธีเฉพาะ user RPC/SELECT และ pre-request guard แทน
