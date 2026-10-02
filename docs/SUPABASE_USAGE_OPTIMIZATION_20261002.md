# FlowMate: ลด refresh ซ้ำและ CreativeBot รอบที่ไม่มีงาน

สถานะ: ผู้ใช้อนุมัติ production SQL และ commit/push frontend แล้ว ติดตั้ง SQL เมื่อ 2 ตุลาคม 2026 เวลา 14:18 น. กรุงเทพฯ; frontend release stamp 20261002-03 ผ่านการตรวจชุดเผยแพร่

## ขอบเขตที่อนุมัติ

- ลดการ refresh ซ้ำในหน้าแอป
- ป้องกัน CreativeBot เรียก Edge Function เมื่อไม่มีงานพร้อมส่ง
- รักษางานทุกนาที การ claim, การ retry, การตรวจ assignment เก่า และการป้องกันส่งซ้ำชุดเดิม

## หลักฐานก่อนแก้

ตรวจ Supabase project `jbavahimqjalvcfawgqw` (`workgrid-test`) แบบอ่านอย่างเดียว
ช่วง Logs: 1–2 ตุลาคม 2026 เวลา 13:40:07 น. กรุงเทพฯ

- API Gateway: 22,284 log ใน 24 ชั่วโมง
- CreativeBot: 360 HTTP responses ในช่วง 6 ชั่วโมงที่ตรวจ; 359 รอบไม่มีงานให้ claim
- Cron `creativebot-dispatch-every-minute` เปิดอยู่และทำงานทุกนาที
- Claimant เดิมเลือก `status in ('pending', 'retry') and available_at <= now()`
- มี index `creative_seatalk_outbox_due_idx` สำหรับเงื่อนไขดังกล่าวอยู่แล้ว

## สิ่งที่เปลี่ยน

### หน้าแอป

- `supabase-list-data.js`: เริ่มจับเวลา polling ใหม่หลัง refresh ตาม event เสร็จ จึงไม่เกิด timer โหลดซ้ำติดกัน
- เมื่อ request ยังไม่เสร็จ การกลับมาโฟกัสแท็บใช้ผลของ request ที่กำลังทำอยู่ ส่วน event ข้อมูลเปลี่ยนยังขอ refresh ต่อท้ายได้หนึ่งรอบ
- consumer ที่ใช้ live-refresh helper ไม่โหลดตาม event เมื่อแท็บซ่อนอยู่; กลับมาเปิดแล้วโหลดใหม่
- รวมชื่อทุกตารางที่เปลี่ยนระหว่าง realtime debounce เพื่อไม่ให้ event งานถูก event แจ้งเตือนทับ
- event แจ้งเตือนอย่างเดียวไม่ล้าง task-list cache
- `app.jsx`: notification refresh รับเฉพาะ event ที่เกี่ยวข้อง และ navigation counts รองรับ event หลายตาราง
- polling สำรองยังเป็น 60 วินาที; error backoff และ manual refresh ยังทำงาน
- regenerate `app.js` ผ่าน `npm.cmd run build:github`; build ไม่เปลี่ยน sibling JS ตัวอื่น

### CreativeBot

ไฟล์ติดตั้ง: `supabase/creative_seatalk_scheduler_ready_gate.sql`
ไฟล์ย้อนกลับ: `supabase/creative_seatalk_scheduler_ready_gate_rollback.sql`

SQL เพิ่ม `WHERE EXISTS` ให้คำสั่ง HTTP เดิมใน Cron job เฉพาะตัวที่ระบุ
จึงไม่เรียก `net.http_post` ถ้าไม่มี `pending` หรือ `retry` ที่ถึงเวลา
ใช้คำสั่งและ Vault reference เดิม โดยไม่อ่านหรือคัดลอกค่าความลับออกมา

ไม่เปลี่ยน schedule, active flag, username, claimant หรือ Edge Function
ไม่ claim/update คิวในตัวกรอง; การ claim/ตรวจ assignment เก่ายังเกิดที่ worker เดิม
หากมีงานเข้าใหม่หลังรอบตรวจ จะตรวจเจอในรอบนาทีถัดไป
หากคิวเปลี่ยนหลัง EXISTS แต่ก่อน worker claim, worker ยังตรวจและ claim ใหม่ตามเดิม

ติดตั้งและย้อนกลับซ้ำได้ และหยุดด้วย error หาก job ซ้ำ, schedule เปลี่ยน,
รูปแบบคำสั่งไม่ตรงกับตัวที่ตรวจ หรือ gate ถูกแก้ภายหลัง

## การตรวจสอบ

Tests ใช้ browser VM/fake timers และ Postgres ในหน่วยความจำ (PGlite)
`net.http_post` ใน fixture บันทึกลงตารางจำลองเท่านั้น ไม่มี HTTP หรือ SeaTalk จริง

ผลตรวจ: 4 test files / 71 tests ผ่าน, build ผ่าน และ syntax/diff checks ผ่าน

```powershell
npm.cmd test -- src/lib/flowmate-live-refresh.test.ts src/lib/creative-seatalk-scheduler-ready-gate.test.ts src/lib/flowmate-board-frontend.uat.test.ts src/lib/flowmate-performance-remediation.uat.test.ts --exclude "{output,.worktrees}/**"
npm.cmd run build:github
```

ตรวจเพิ่ม `flowmate-board-integration.uat.test.ts`: behavior 3 ข้อผ่าน;
test release token เก่า 1 ข้อล้มเหลว เพราะยังคาดหวัง `20260810-01`
แต่ entry pages ใช้ `20261002-01` อยู่ก่อนงานนี้แล้ว ไม่ได้แก้ HTML ในงานนี้

เก็บ baseline ก่อนแก้เฉพาะไฟล์ที่แตะไว้ที่ `output/usage-optimization-20261002/baseline/`
เพื่อตรวจ diff แยกจากงานอื่นที่มีอยู่ใน checkout

## ก่อนนำขึ้นใช้งานจริง

ต้องอนุมัติ production SQL และ release หน้าเว็บแยกจากการแก้ในเครื่องตาม AGENTS.md
สำหรับ frontend ให้เตรียม release เฉพาะ delta ของงานนี้ เพราะ checkout มีงานอื่นที่ยังไม่ publish
จากนั้น update cache stamps ของ active entry pages ใน release นั้น

หลัง apply/publish: ตรวจว่าคิวว่างไม่เกิด HTTP call, งานจริงและ retry ยังส่งตามเดิม,
แล้วเปรียบเทียบ request และ log ในช่วงใช้งานใกล้เคียงกันหลัง 1–2 วัน
หลังติดตั้ง: Cron รอบ 14:19 และ 14:20 สำเร็จและคืน 0 rows ขณะคิวว่าง ไม่มี dispatch HTTP response ใหม่ในช่วงนั้น ตารางเวลายังทุกนาทีและ active เหมือนเดิม ยังต้องรอข้อมูล usage/billing หลังใช้งานจริง

## หลักฐานชุดเผยแพร่

แยก delta จาก baseline ก่อนแก้ แล้วปรับบน GitHub baseline 5d84b8a617c6171742d8752289efd5f0805d11ed ไม่รวมงานค้างอื่นใน root checkout
อัปเดต app.js และ supabase-list-data.js stamps ใน index.html, home/index.html, product-book/index.html เป็น 20261002-03; badge อ่าน stamp จาก app.js
ชุดเผยแพร่ build ผ่าน และ refresh tests 9/9 กับ SQL tests 13/13 ผ่านซ้ำบน staged sources (SQL ใช้ fork process เพื่อเลี่ยง Node WASM thread crash)
ผล published artifacts และ commit เก็บใน output/usage-optimization-20261002/release/manifest.json และ publication-verification.json หลัง push
