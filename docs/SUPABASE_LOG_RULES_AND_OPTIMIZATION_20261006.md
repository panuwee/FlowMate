# FlowMate — กติกาและการลด Supabase Log Ingestion

วันที่: 6 ตุลาคม 2026 · สถานะ: **ชุดสำหรับ PR ที่ทดสอบแล้ว; production รอ review/merge**

อัปเดตรอบเตรียม release: ทดสอบบนสำเนา GitHub `version2.1.1` ที่ `b2a68f137a41d6c3d70acaf3369dc46dc0cc0086` ผ่าน **52 tests** (local canonical ผ่าน 50 tests หลังเพิ่ม scope regression) ตัวรวม request แยก product และ `allTaskTeams` เพื่อรักษา Task Assign filters ใหม่ที่ฐาน local เดิมยังไม่มี ดู [ชุด review ก่อน release](SUPABASE_LOG_OPTIMIZATION_RELEASE_REVIEW_20261006.md)

เอกสารนี้เป็นคู่มือสำหรับผู้ดูแลและการพัฒนารอบถัดไป ไม่ได้แก้ AGENTS.md หรือสร้าง automation

## 1. เหตุผลที่เลือกปรับจุดนี้

[ผลตรวจ production](SUPABASE_LOG_PRODUCTION_FINDINGS_20261006.md) พบ API gateway เป็นประมาณ 97.3% ของขนาดข้อความและ attributes ที่อ่านได้ในตัวอย่างหนึ่งชั่วโมง ขณะที่ Postgres ประมาณ 1.04% จึงเลือกแก้ requests ที่ต้นทางก่อนลดความละเอียดของ log

เปอร์เซ็นต์นี้เป็น proxy จากตัวอย่าง ไม่ใช่ billing bytes และไม่ใช่สัดส่วนทั้งเดือน ไม่มีการรับประกันว่าจะลดโควต้าเท่ากับเปอร์เซ็นต์นี้

## 2. สิ่งที่ปรับแล้วในเครื่อง

| จุด | ก่อน | หลัง |
|---|---|---|
| My Work, List, Attention ขณะ Realtime connected/syncing | safety polling ทุก 60 วินาที | ทุก 180 วินาที |
| Realtime ไม่พร้อม/หลุด | ทุก 60 วินาที | คง 60 วินาที พร้อม failure backoff |
| Realtime กลับมา | รอ event/รอบ poll | เรียก reconcile ทันทีเมื่อแท็บแสดงอยู่; ถ้ามี request ค้างให้ตามอีกหนึ่งครั้ง |
| แท็บซ่อน | ไม่เรียก network refresh | คงเดิม; กลับแท็บแล้ว refresh |
| Notification-only event ในสามหน้าข้างต้น | เข้า task refresh helper | ข้าม task refresh; notifications ยัง refresh ตามเดิม |
| Mixed notification + task event | refresh | ยังคง refresh ข้อมูล task |
| คำขอ work_items ที่ซ้อนกันใน scope เดียว | cache แยกแต่ละ row profile | แชร์เฉพาะ request ที่กำลังทำงาน แม้ summary/operational/legacy จะเรียกพร้อมกัน |
| User/workspace/My Work scope | แยกตาม list cache | คงการแยก และแยก member filter สำหรับ request ที่แชร์ด้วย |

มีการป้องกันคำขอเก่าที่เสร็จหลัง invalidation ไม่ให้ล้างหรือแทนที่คำขอใหม่ เมื่อ request เสร็จแล้วจะออกจาก in-flight map ทันที ไม่ได้เพิ่มระยะเก็บข้อมูลข้ามคำขอ

Notifications, Calendar, Marketing Plan และหน้าที่ไม่ได้ opt in คง polling เดิม ไม่ได้ปรับเป็น 3 นาทีทั้งแอป ไม่เพิ่ม TTL ของ users/team_members หรือ cache สิทธิ์

การเปลี่ยนตาม Realtime และการแก้ข้อมูลยัง refresh ทันทีตาม event เดิม แต่ข้อมูลที่ไม่มี event ครอบคลุม เช่น threshold ตามเวลา หรือข้อมูลประกอบบางตาราง อาจรอ safety poll สูงสุดประมาณ 3 นาทีในสภาวะปกติ (ไม่นับเวลาคำขอ/backoff) หากงานใดต้องสดภายใน 60 วินาที ให้คง cadence เดิมหรือเพิ่ม event coverage ก่อน opt in

## 3. กติกาสำหรับการพัฒนา

1. **ลด API requests ก่อนลดหลักฐานตรวจสอบ** — ตรวจ route, method, status และจำนวน requests ต่อ active session ก่อนแก้ ไม่สรุปจากจำนวนผู้ใช้รายเดือนเพียงอย่างเดียว
2. **ขยาย polling แบบเลือกหน้า** — ใช้ Realtime ที่มี subscription จริง คง fallback และการ refresh หลัง reconnect/กลับแท็บ ทบทวนข้อมูลที่เปลี่ยนตามเวลาและตารางที่ไม่ได้ subscribe ด้วย
3. **แชร์ request ได้เฉพาะ scope ที่ตรงกัน** — ต้องแยกผู้ใช้, workspace, query filters และ My Work/member scope ล้างเมื่อ invalidation/sign-out/workspace change; คำตอบเก่าต้องไม่ทับข้อมูลใหม่
4. **อย่าใช้ client cache เป็นตัวตัดสินสิทธิ์** — RLS และ server-side authorization ต้องคงเดิมเสมอ หากจะ cache ข้อมูลแสดงผลเพิ่ม ต้องกำหนด TTL และ invalidation ที่ชัดเจน
5. **ไม่โหลดรายละเอียดที่หน้าไม่ใช้** — เลือก summary/operational/my-work profile ให้เหมาะ ลด comments/history/details ที่ไม่จำเป็น แยกการ refresh nav counts, notifications และ KPI ไม่ให้ลากทั้งหน้าโหลดใหม่
6. **CORS preflight เป็น traffic จริง** — ลด fan-out/requests ซ้ำและตรวจ cache ตามที่ระบบรองรับ ใช้ CORS/Auth/RLS ตามเดิม ไม่ปิดการป้องกันเพื่อประหยัด OPTIONS
7. **worker ตรวจงานที่พร้อมก่อน dispatch เมื่อเหมาะสม** — รักษา pending/retry, available_at, stale claim, cutoff และ idempotency งาน discovery/recovery ไม่ควรถูกหยุดจาก outbox ว่างอย่างเดียว
8. **log มีโครงสร้างและขนาดจำกัด** — ใช้ event, request_id, duration, result, error_code; ไม่ใส่ token, password, headers หรือ payload ส่วนบุคคลทั้งก้อน ลด/sample เฉพาะ repetitive success/debug เมื่อวัดแล้วว่ามีผล
9. **รักษา error และ audit ที่ต้องใช้** — ปัจจุบัน log_statement=ddl, connection logs ปิด, debug ไม่เปิด; ไม่มีเหตุให้ปิดเพิ่มเพื่อแก้ API gateway volume การตั้ง slow-query threshold จาก -1 เป็นค่าบวกจะเพิ่ม log ไม่ใช่ลด
10. **แยกโค้ดพร้อมใช้กับ production ใช้งานจริง** — local tests/build ไม่ใช่ผลลด usage; commit/push/deploy/production SQL ขออนุมัติแยกตามข้อตกลงโครงการ และ stage เฉพาะ diff ของงานนี้

## 4. กติกาสำหรับค้น logs

- เริ่มช่วงเวลา 15–60 นาที กรอง source/service/route/status/request ID ใน query ก่อนรัน
- LIMIT จำกัดผลลัพธ์ ไม่รับประกันว่าจะลดข้อมูลที่สแกน ใช้ time filter เสมอ
- หลีกเลี่ยง query ย้อนหลังทั้งวัน/เดือนซ้ำทุกนาที เก็บผลวิเคราะห์ครั้งเดิมมาอ้างอิงเมื่อคำถามยังเดิม
- ใช้ Usage/metrics/business status สำหรับ monitor ปกติ ใช้ raw logs เมื่อต้องสืบเหตุ หากต้องอ่านตามรอบ ให้กำหนด checkpoint และ overlap สั้นพร้อม dedup
- แยก Log Query (bytes ของ logs ที่สแกน) ออกจาก query ตารางธุรกิจ และแยกยอดสะสม billing ออกจาก log retention/database size
- ไม่คัดลอก raw logs ที่มีข้อมูลลับลงเอกสาร ใช้ aggregate หรือข้อมูลที่ตัดสิ่งระบุตัวตนแล้ว

## 5. ผลทดสอบ local

คำสั่งที่ผ่าน:

```powershell
node_modules/.bin/vitest.cmd run src/lib/flowmate-live-refresh.test.ts src/lib/flowmate-board-frontend.uat.test.ts --exclude "{output,.worktrees}/**" --no-cache
node --check supabase-list-data.js
npm.cmd run build:github
```

- **49 tests ผ่าน**: Live refresh 16 + Board/frontend cache 33
- ครอบคลุม cadence, disconnect/reconnect, hidden tab, backoff, mixed events, unmount cleanup, scope isolation, cache invalidation และ old/new request race
- แบบจำลอง idle connected 1 ชั่วโมง: helper เดิมเรียก 60 ครั้ง เทียบกับ opt-in ใหม่ 20 ครั้ง = ลด timer-driven refresh **66.7%** ไม่ใช่คำยืนยันลด API ทั้งระบบหรือ billing 66.7%
- ทดสอบแชร์ summary + operational ที่เรียกซ้อนกัน: work_items query จากสองคำขอเหลือหนึ่ง โดย invalidation จะออกคำขอใหม่
- build สำเร็จ อัปเดตเฉพาะ generated `screens-a.js` และ `screens-b.js`; `supabase-list-data.js` เป็น source JavaScript โดยตรง
- ไม่มีการเรียก production จาก tests; ใช้ VM, mocked Supabase queries และ fake timers
- ไม่ได้ทำ browser E2E ของแอปในรอบ implementation นี้ เพราะไม่ได้เปลี่ยนรูปลักษณ์ และยังไม่ publish; ต้องตรวจ freshness ด้วยบัญชีจริงหลังอนุมัติ release

ข้อจำกัดของชุดตรวจเพิ่มเติม: `workflow-mvp.uat.test.ts` ผ่าน 13/17 และไม่ผ่าน 4 ข้อ เป็น assertions เกี่ยวกับ Marketing Plan และ cache token `20260810-01` ที่อ้าง `app.jsx`/entry HTML ซึ่งงานนี้ไม่ได้แก้ จึงแยกเป็นปัญหานอก scope ไม่แก้ tests ให้ผ่านโดยลบ assertions ไม่ได้อ้างว่า test suite ทั้ง repository ผ่าน

รอบแรกของ Vitest มี error เขียน cache ที่ `node_modules/.vite` จึงรันด้วย `--no-cache` และได้ exit code 0 ในชุด affected tests

## 6. วิธีวัดผลหลังอนุมัติขึ้น production

1. เก็บ baseline วัน/เวลารอบบิล, active sessions, requests ต่อ session และ daily Log Ingestion ของ FlowMate โดยเฉพาะ แยกวัน deploy/debug จากวันปกติ
2. หลัง publish ตรวจ My Work/List/Attention, notifications, สลับ workspace/user, กลับแท็บ และ Realtime disconnect/reconnect พร้อมเช็กข้อมูลเปลี่ยนจากผู้ใช้อีกคน
3. เทียบช่วง peak กับ peak และ idle กับ idle หลัง 24–48 ชั่วโมง และยืนยันแนวโน้มหลายวัน ยอด cumulative เดิมไม่ลด ต้องดูอัตราที่เพิ่มใหม่
4. เป้าหมาย pilot ที่เสนอ: ลด read/preflight requests ต่อ active session 30–50% โดยไม่มี missed/duplicate notifications หรือสิทธิ์รั่ว เป้าหมายนี้ต้องพิสูจน์ ไม่ใช่ผลวัดปัจจุบัน
5. ถ้าข้อมูลค้างเกิน freshness ที่ยอมรับได้ ให้ถอน `realtimeIntervalMs` เฉพาะหน้าที่ได้รับผลก่อน แล้วตรวจ event coverage โดยคงงานลดคำขอซ้ำที่ไม่ทำให้ข้อมูลค้าง

เป้าหมายงบเริ่มต้นจาก review: projected ingest ≤0.8 GB และ projected query ≤70 GB ต่อรอบบิล Free เพื่อเผื่อ incident หาก traffic ที่จำเป็นทำไม่ได้ ให้พิจารณาแพ็กเกจตามข้อมูลจริง ไม่ลด audit เพื่อไล่โควต้า

## 7. งานรองที่ยังไม่ apply

- `cron.log_statement=off`: ต้องยืนยันช่องทาง hosted config และผลต่อการวินิจฉัยก่อน; คง cron.log_run เพื่อดู job history ผลที่คาดได้เล็กกว่า API optimization ในตัวอย่างนี้
- Activity/Battle Pass due-outbox gate: ต้องอ่าน deployed function/queue contract เพิ่มก่อนแก้ ห้ามใช้ success ของ cron แทน delivery confirmation
- cache users/team_members แบบ TTL และ aggregate RPC: พิจารณาหลัง pilot หาก requests ยังสูง ไม่จำเป็นต้องเพิ่มความซับซ้อนพร้อมกัน
- Log Drains: ยังไม่แนะนำเพื่อประหยัดในขนาดนี้ เพราะมี add-on cost และไม่ได้ทำให้ ingestion เดิมหายไป

## 8. ไฟล์และการส่งต่อ

ไฟล์เปลี่ยนใน implementation: `supabase-list-data.js`, `screens-a.jsx`, `screens-b.jsx`, generated `screens-a.js`/`screens-b.js`, `src/lib/flowmate-live-refresh.test.ts`, `src/lib/flowmate-log-request-scope.test.ts` และเอกสารนี้

canonical checkout ยังคง `C:\SeaTH\Projects\flowmate` branch `version2.1` ซึ่งต่างจาก release target `version2.1.1` และมีงานค้างเดิม จึง port เฉพาะ diff งานนี้บน release ล่าสุดใน `.worktrees/supabase-log-optimization-20261006` ตามข้อยกเว้นชั่วคราวที่ผู้ใช้อนุมัติ สำหรับ commit/push/เปิด PR เท่านั้น เก็บ checkouts เดิมทั้งหมดไว้ การ merge/deploy และ cleanup รออนุมัติแยก

อ้างอิง: [review เบื้องต้นและเอกสาร Supabase](SUPABASE_LOG_USAGE_REVIEW_20261006.md) · [หลักฐาน production](SUPABASE_LOG_PRODUCTION_FINDINGS_20261006.md)
