# Notification request optimization — ready for review

วันที่ 7 ตุลาคม 2026 · local implementation และ tests ผ่าน · เตรียมเปิด PR ตามที่ผู้ใช้อนุมัติ

## ปัญหาและผลของการเปลี่ยน

ไฟล์ log ที่ผู้ใช้ส่งมี notifications GET 52 ครั้ง และ work-item title/status GET 51 ครั้ง โค้ดเดิมอ่านสองรอบ: notifications แล้วตามด้วย work_items เพื่อเติมชื่อและสถานะล่าสุด

โค้ดใหม่ใช้ PostgREST embedded relation ผ่าน FK เดิม จึงอ่าน notifications พร้อม work-item fields ใน **1 request** เมื่อมีงานเชื่อมอยู่ เทียบกับเดิม 2 requests และแชร์คำขอที่กำลังทำงานถ้า user/client/workspace/product ตรงกัน ไม่เก็บ settled response และไม่ยืด polling ของ Notifications

กรณีไม่มีงานเชื่อมอยู่เดิมใช้ 1 request อยู่แล้ว จึงไม่ลดในกรณีนั้น การลด 50% หมายถึง requests ต่อรอบที่เดิมต้องอ่านสองครั้ง ไม่ใช่ log ingestion ทั้งระบบหรือค่าใช้จ่ายลด 50% จาก sample เพดานการตัด work-item GET รอบที่สองคือ 51 requests หรือ 5.1% ของ 1,000 records ก่อนผลต่อ OPTIONS/dedup ซึ่งยังต้องวัด

## สิทธิ์และความสดของข้อมูล

- ตรวจ production แบบ read-only พบ FK `notifications_work_item_id_fkey` อ้าง `public.work_items(id)` และ RLS เปิดทั้ง notifications/work_items
- ใช้ left embedding ตาม default เก็บ notification ไว้เมื่อ work item เป็น null หรือมองไม่เห็นตาม RLS; ไม่มี `!inner`, privileged RPC หรือการแก้ policy
- เมื่อมี data-change event, auth lifecycle event หรือ mark read/mark all/dismiss สำเร็จ จะ invalidate request ที่ค้างอยู่ ป้องกันผลเก่าทับผลหลังเปลี่ยน
- Live-refresh consumer ยัง queue follow-up เมื่อ event มาระหว่างโหลด ทดสอบร่วมกับ loader จริงใน VM แล้ว
- UI รับเฉพาะ refresh ล่าสุดและ identity เดิม ล้างรายการเมื่อ signed-in identity เปลี่ยน
- Error จาก timer refresh ส่งต่อไปให้ helper ทำ backoff; manual refresh แสดง error ตามเดิม
- คง 60-second Notifications cadence, Realtime events และ focus/reconnect/hidden-tab behavior เดิม

## ขอบเขตไฟล์

- `supabase-quick-task.js`: joined read, in-flight sharing, invalidation และ scope guard
- `app.jsx` และ generated `app.js`: stale-result guard, identity cleanup, error propagation และใช้ event reasons ชุดเดียวกับ loader
- `src/lib/flowmate-notification-requests.test.ts`: 17 isolated tests
- `src/lib/flowmate-live-refresh.test.ts`: ปรับ harness ตาม auth dependency และเพิ่ม event-during-request integration test
- เอกสารนี้

ไม่เปลี่ยน cache ของ users/team_members, cron settings, worker schedules, Edge Functions หรือ production SQL ส่วน cache สมาชิกและ cron noise เป็นขั้นถัดไปหลังวัด pilot นี้ ไม่ใช่งานที่ apply แล้ว

## Validation

**70 tests ผ่าน** ใน 4 files: notification requests 17, live refresh 17, request scope 1 และ Board frontend 35 ทั้งหมดเป็น mocks/VM ไม่มี network หรือ production writes จาก tests

ครอบคลุม joined mapping, null/hidden related rows, mutable-result isolation, no settled cache, auth/client/workspace/product separation, sign-out, mixed/irrelevant events, replacement request cleanup, mutation invalidation, retry, UI ordering และ poller error propagation รวมกับ cadence/backoff/focus/reconnect tests เดิม

`npm.cmd run build:github` ผ่าน อัปเดต generated `app.js` เท่านั้น; `node --check app.js`, `node --check supabase-quick-task.js` และ `git diff --check` ผ่าน

ข้อจำกัด: mocked null relation ไม่ได้พิสูจน์ RLS ด้วยบัญชีจริง และ metadata check ไม่ใช่ PostgREST authenticated query verification ยังต้องตรวจ notifications panel/read state/work-item rename/status และ query latency ด้วย session จริงหลังเผยแพร่หรือใน staging ก่อนอ้าง production success ไม่มีการแก้รูปลักษณ์ UI จึงยังไม่ได้ทำ visual regression ในรอบนี้

## Release และ rollback

- ใช้ worktree เดิม `C:\SeaTH\Projects\flowmate\.worktrees\supabase-log-optimization-20261006` ไม่มี worktree ใหม่
- Branch: `codex/notification-request-optimization-20261007`
- Base ที่ fetch จาก GitHub: `44aa87b6b784295cc3dae407ebfab5b4338c4b72` (`version2.1.1`)
- Canonical checkout ที่มีงานอื่นค้างถูกเก็บไว้ตามเดิม
- ผู้ใช้อนุมัติ commit/push/เปิด PR ของชุดนี้แล้ว วันที่ 7 ตุลาคม 2026; เอกสารนี้บันทึกผลก่อนสร้าง commit ส่วน merge/deploy ยังไม่อยู่ในขอบเขตการอนุมัติรอบนี้
- ก่อน publish ต้อง stamp entry HTML และตรวจ scope หลัง pre-commit hook ตาม release workflow
- หลัง publish เทียบ hashes ของ assets/entry pages และตรวจ browser จากบัญชีจริง แล้ววัด GET/OPTIONS ต่อ active-session minute กับ ingestion bytes 24–48 ชั่วโมงและหลายวัน
- ถ้า joined query มีปัญหาหรือ latency ถดถอย ให้ revert frontend change ชุดนี้ผ่าน release workflow โดยไม่ต้อง rollback schema
- Worktree retained สำหรับ review และ release; ไม่มี branch deletion/cleanup

## เอกสารอ้างอิง

- https://supabase.com/docs/guides/database/joins-and-nesting
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/changelog.md (ตรวจวันที่ 7 ตุลาคม 2026; ไม่พบ breaking change ของรูปแบบ query นี้ในรายการที่ตรวจ)
