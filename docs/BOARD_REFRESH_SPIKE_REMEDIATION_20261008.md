# Board refresh spike — local remediation, 8 October 2026

> อัปเดตขอบเขต: ผู้ใช้อนุมัติให้ตรวจทั้ง 7 ข้อและรวมส่วนที่มีหลักฐานรองรับเป็น commit/push เดียวต่อยอด PR #17 รายละเอียดล่าสุดและกฎใช้งานอยู่ที่ [LOG_OPTIMIZATION_RULES_20261008.md](LOG_OPTIMIZATION_RULES_20261008.md) เพิ่ม opt-in local diagnostics, manual asset-version check และ stable related-query ID ordering; ส่วนวัดจริง/merge/deploy/SQL apply แยกจาก local completion เนื้อหาด้านล่างเป็น baseline ของ patch ก่อนเพิ่มส่วนนี้

## สถานะ

เตรียม local patch บน branch `codex/board-refresh-coordination-20261008` จาก release `96f8519a3c7bcd60ddf798e7c1c12b11d7b3fef6` ผู้ใช้อนุมัติ commit/push/PR แล้ว; ยังไม่ deploy และไม่มี production SQL/CORS/cron changes

ใช้ worktree เดิม C:\SeaTH\Projects\flowmate\.worktrees\supabase-log-optimization-20261006 ซึ่งสะอาดก่อนเริ่ม ไม่สร้าง worktree เพิ่ม ไม่เปลี่ยน canonical checkout หรือทำ cleanup

## ปัญหาและหลักฐาน

Log export วันที่ 8 ต.ค. นาที 11:40 มีรูปแบบ Board ซ้ำ 14 ชุด: lane reads 70, summary RPC 14 และ related reads/preflights ซ้ำ บัญชีหลักส่ง Notifications แบบเก่าด้วย แต่ไฟล์ไม่มี origin, tab ID, client release หรือ refresh reason จึงยังระบุ exact trigger ไม่ได้ ผู้ใช้แจ้งว่าไม่ได้ refresh หรือไม่แน่ใจ และยืนยันว่าใช้ https://panuwee.github.io/FlowMate/

Regression ใช้ loader จริงใน VM กับ mock API:
- ก่อนแก้: เรียก loadFlowMateActiveBoard พร้อมกัน 14 ครั้ง → lane queries 70 (test expected 5 จึง fail)
- หลังแก้: กรณีเดียวกัน → lane queries 5 และ summary 1
- UI coordinator จริงที่เรียก callbacks ต่อกัน 14 ครั้งกับ passive mode → lane queries 5 และ summary 1
- ผลนี้เป็นหลักฐาน local สำหรับ duplicate-read pattern ไม่ใช่ replay browser session จริงหรืออัตราประหยัด production 92.9%

## การเปลี่ยนแปลง

### 1. Board request coordination

- แชร์ full Board request ที่ยัง pending ภายใต้ user, member, role, workspace, product, normalized lane limits, client และ user object เดียวกัน
- ผลแยกสำเนาแต่ละ caller เพื่อไม่ให้แก้ไขข้อมูลร่วมกัน
- Data invalidation ระหว่างโหลดทำเครื่องหมาย dirty และทำ follow-up หนึ่งชุดที่รออยู่แทนการเปิด full load ใหม่พร้อมกัน หากมี change ระหว่าง follow-up ก็ต้อง refresh ต่อเพื่อให้ข้อมูลสด
- Reject ผลจาก request ที่ scope/auth/client เปลี่ยน ไม่ใช้ผลเก่าข้าม scope
- รอ lane/summary queries จบรวมถึง error paths ก่อนปลด in-flight entry
- Cache ผลที่สำเร็จ 2 วินาที เฉพาะ caller ที่ opt-in allowRecent; mount และ automatic refresh ใช้ได้
- ปุ่ม manual Refresh/default caller ยังอ่านใหม่หลัง completed request; mutation/data-change, auth change, sign-out และ workspace invalidation ล้าง recent cache
- หลายแท็บเป็นคนละ JavaScript context จึงยังไม่แชร์ request ข้ามแท็บ
- ไม่เปลี่ยน pagination, sorting, work-item fields, RLS หรือ schema

ไฟล์:
- supabase-list-data.js — loader coordination/recent result/invalidation
- screens-b.jsx — mount/auto opt-in, manual คง force-read หลัง request จบ
- screens-b.js — regenerate จาก source
- src/lib/flowmate-board-request-coordination.test.ts — 12 regression tests

### 2. Client Notifications เก่า

- ผู้ใช้ใช้ URL หลัก GitHub Pages
- Current root/home/product-book entry points load supabase-quick-task.js version 20261007-a8b16f ที่มี notification embedding
- Round ก่อนหน้า live quick-task source ตรงกับ task checkout และไม่มี legacy fallback ใน loader นี้
- backend/public/index.html ยัง HTTP 200 และอ้าง asset เก่า แต่ supabase-client ของเส้นทางนั้นส่ง /api/* ไป backend ไม่ใช่ direct Supabase จึงห้ามสรุปว่าเป็นต้นเหตุจากชื่อไฟล์หรือ query shape เพียงอย่างเดียว
- ไม่แก้หรือ redirect alternate deployment ที่ยังไม่ระบุว่า active
- ให้ save งาน/draft แล้ว reload URL หลักหนึ่งครั้งเพื่อเริ่ม session ใหม่ก่อนวัด ไม่ auto-reload และไม่ล้าง local storage/token
- หากยังพบ legacy queries ให้ตรวจ loaded scripts, browser Network initiator และแท็บอื่น/automation ของบัญชีเดียวกัน โดย redact tokens และไม่เก็บข้อมูลผู้ใช้ใน telemetry ทั่วไป

### 3. API fan-out / CORS

ทดสอบ OPTIONS แบบไม่มี auth credentials ที่ work_item_flags_v:
- status 200
- Access-Control-Allow-Origin: *
- Access-Control-Max-Age: 3600
- requested apikey, authorization, x-client-info ถูกอนุญาต

นี่คือ response ปัจจุบันสำหรับ representative request ไม่ใช่หลักฐานของ headers/context ในช่วง incident; ไม่ควรตั้ง CORS ใหม่เพื่อแก้ cache ที่ยังไม่ทราบสาเหตุ การลด Board repeats ช่วยลดทั้ง API work และ preflights ที่เกิดตามได้โดยไม่ลด authorization

ยังไม่เพิ่ม batch RPC, index หรือ SECURITY DEFINER ใหม่: ให้ปล่อย coordination patch และวัด request count ก่อน เพื่อแยกประโยชน์และไม่ขยายขอบเขตสิทธิ์

## Validation

คำสั่ง:
```powershell
C:\SeaTH\Projects\flowmate\node_modules\.bin\vitest.cmd run src/lib/flowmate-board-request-coordination.test.ts src/lib/flowmate-board-frontend.uat.test.ts src/lib/flowmate-live-refresh.test.ts src/lib/flowmate-flags-request-sharing.test.ts src/lib/flowmate-notification-requests.test.ts src/lib/flowmate-performance-remediation.uat.test.ts src/lib/flowmate-board-integration.uat.test.ts src/lib/flowmate-log-request-scope.test.ts --exclude "{output,.worktrees}/**" --no-cache
npm.cmd run build:github
git diff --check
```

- 110 tests ผ่านจาก 8 files; mocks/VM ไม่มี production network
- 12 tests ใหม่ครอบคลุม 14 callers, UI queued callbacks, lane-limit normalization, dirty follow-up, passive TTL, manual freshness, invalidation, scope/auth/client changes และ failure/retry
- Build ผ่าน; generated output เปลี่ยนเฉพาะ screens-b.js
- ยังไม่ทำ signed-in browser UAT และยังไม่วัดผล production
- ไม่ได้รันทุก test ทั้ง repository; fixture failure ที่บันทึกไว้ในงานก่อนหน้าไม่ใช่สิ่งที่อ้างว่าแก้แล้ว

## ขั้น release และวัดผล

1. ขออนุมัติ commit/push/เปิด PR สำหรับ patch นี้; pre-commit จะอัปเดต entry cache stamps เพิ่ม
2. หลัง review ขออนุมัติ merge/deploy แล้วตรวจ live asset hashes
3. Save draft และ reload client หลัก; เก็บ Network trace ของ mount → focus → reconnect → data-change → manual refresh
4. ตรวจว่า overlapping scope มี lane 5 + summary 1, data-change ไม่ถูกทิ้ง, manual refresh ได้ข้อมูลใหม่ และไม่มีข้อมูลข้ามผู้ใช้/workspace
5. เก็บ logs ช่วงใช้งานจริง 30–60 นาที แยก legacy/joined notifications, Board starts, API/OPTIONS, errors และ active sessions ไม่ใช้ cumulative calls หรือ exported 1,000-row limit เป็นจำนวนทั้งชั่วโมง

ไม่มีการตั้ง automation, ปิด cron, ลบ index หรือเปลี่ยน production ในขั้น local นี้
