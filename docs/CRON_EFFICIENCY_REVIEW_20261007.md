# Cron efficiency review — Battle Pass idle gate applied

ตรวจวันที่ 7 ตุลาคม 2026 · Project `jbavahimqjalvcfawgqw`

สถานะล่าสุด: ผู้ใช้อนุมัติและ apply Battle Pass idle gate แล้วเมื่อ 7 ตุลาคม 2026 เวลา 15:19 น. ไทย ดู `docs/CRON_IDLE_GATE_APPLY_STATUS_20261007.md` สำหรับผลตรวจ production และ natural Cron เอกสารส่วนที่เหลือเป็น review ก่อน apply และขอบเขตที่อนุมัติ

## ผลตัดสินใจ

ยังไม่พบหลักฐานว่าควรลบ Cron ใด ทั้ง 6 งานมีหน้าที่ต่างกัน การลดจำนวนรอบอย่างเดียวอาจทำให้แจ้งเตือนหรือ recovery ช้าลง จึงคง schedule ทั้งหมดและเตรียม patch ลด HTTP เมื่อ Battle Pass ไม่มีงานที่ต้องจัดการ

| Job | รอบ/24h ใน snapshot แรก | ผล review |
| --- | ---: | --- |
| creativebot-dispatch-every-minute | 1,440 | มี due-queue guard แล้ว คงทุกนาที |
| battle-pass-production-30m | 48 | ทั้ง 48 ticks เป็น waiting_confirmation; คงความสดเดิม การลดความถี่ต้องตกลงเวลารอที่ยอมรับได้ |
| battle-pass-recovery-observe-10m | 144 | ไม่มี open recovery ณ เวลาตรวจ; เป็น SQL bounded scan จึงคงความเร็ว recovery |
| battle-pass-seatalk-15m | 96 | detect ทำงานก่อน dispatch; dispatch เดิมเรียก HTTP แม้คิวว่าง ปรับด้วย idle gate |
| activity-production-30m | 48 | ทั้ง 48 ticks เป็น source_waiting; ไม่เพิ่ม queue gate ในรอบนี้ เพราะ producer/notifier เป็น asynchronous และอาจทำให้ข้อความใหม่รออีกหนึ่งรอบ |
| workgrid-control-center-dispatch-every-minute | 1,428 | มี pending/retryable และ expired-lease guards แล้ว คงทุกนาที |

3,204 cron executions ใน 24 ชั่วโมงแรก ไม่มี cron failed/unfinished ไม่ใช่จำนวน HTTP requests หรือหลักฐานผู้รับได้รับข้อความ สองงานทุกนาทีประมาณ 89.5% ของจำนวนรอบ แต่มีเงื่อนไขป้องกัน idle HTTP อยู่แล้ว จำนวน 1,428 ของ WCC เป็นข้อมูลช่วงที่ตรวจ ยังไม่ได้วินิจฉัยว่าเหตุใดน้อยกว่า 1,440

ตรวจสดอีกครั้ง: ทุก job active, Battle Pass enabled/seatalk_enabled, Activity enabled/scheduler_enabled/notifier_enabled และ WCC runtime_enabled เป็น true คิว Battle Pass มี sent 13, cancelled 2 ไม่มีงานรอ; WCC มี provider_accepted 3, suppressed 5 ใน snapshot ที่อ่าน

Creative failed เดิม 96 แถวมี attempt_count=3 ทั้งหมด และไม่มีรายการใหม่ใน 24 ชั่วโมงที่ตรวจ ยังไม่ได้สรุปสาเหตุหรือ replay; เป็นประเด็น delivery effectiveness ที่ควรตรวจแยก การ retry ของจริงอาจส่งข้อความเก่าจึงต้องอนุมัติขอบเขตก่อน

## Patch ที่เตรียม

- `supabase/battle_pass_seatalk_idle_gate.sql`
- `supabase/battle_pass_seatalk_idle_gate_rollback.sql`
- `supabase/battle_pass_seatalk_idle_gate_preflight.sql` (read-only)
- `src/lib/battle-pass-seatalk-idle-gate.test.ts`
- `scripts/cron-idle-gate.vitest.config.mjs`

แก้เฉพาะ body ของ `battle_pass_private.seatalk_dispatch()` ด้วย CREATE OR REPLACE จาก definition เดิม รักษา owner, ACL, SECURITY DEFINER และ empty search_path ไม่สร้าง public RPC ไม่เปลี่ยน Vault reference, HTTP URL/body/timeout, job command, cadence หรือ claimant

Gate คืน null เมื่อ disabled/ไม่มี activation cutoff หรือไม่มี due pending/failed ที่ attempt_count<5 และไม่มี expired dispatch ที่ยัง retry ได้หรือเริ่มส่งแล้ว ส่วนที่เริ่มส่งแล้วต้องปลุก worker เพื่อบันทึก delivery_unknown และป้องกัน blind resend

Gate เป็นเพียงการตัดสินใจว่าจะปลุก worker หรือไม่ ไม่ claim/cancel/send เอง การตรวจ source readiness, recipient, retry และ locks ยังอยู่ที่ detector/claimant เดิม ใช้ statement_timestamp สำหรับเวลาที่คงที่ภายใน statement และเหมาะกับดัชนีเดิม จึงอาจเลื่อนไปหนึ่ง tick ในกรณี deadline เพิ่งผ่านระหว่าง statement งานที่เข้าหลังตรวจจะถูกรับใน tick ถัดไปตาม polling ปกติ

มี partial indexes สำหรับ due และ expired lease อยู่แล้ว ไม่เพิ่ม index โดยไม่มีหลักฐานความจำเป็น ยังไม่ได้ benchmark query plan ภายใต้คิวขนาดใหญ่

Apply และ rollback ตรวจ fingerprint ของ original body `b508cf2f8a07c304a0dd031da13463a8`; ปฏิเสธ drift แทนการทับงานอื่น ทั้งคู่ idempotent และเป็น transaction เดียว พร้อม lock/statement timeout

ข้อจำกัดเดิมที่คงไว้: claimant ไม่ reconcile ระหว่าง seatalk disabled; expired dispatch ที่ยังไม่เริ่มส่งแต่ครบ 5 attempts ไม่ถูก claim เดิมอยู่แล้ว Gate ไม่ปลุกซ้ำสำหรับกรณีที่ worker แก้ไม่ได้ Read-only preflight แสดงจำนวนแยกเพื่อให้ติดตามได้

## Verification

ทดสอบ isolated PGlite: SQL และ HTTP mock ในหน่วยความจำเท่านั้น ไม่มี network/production credentials

คำสั่ง: `node_modules\.bin\vitest.cmd run --config scripts\cron-idle-gate.vitest.config.mjs`

38 tests: gate ใหม่ 25 + CreativeBot gate regression 13 ครอบคลุม empty/new/due/future/retry exhausted/expired-before-send/expired-after-send/active lease/terminal/disabled/null cutoff/credential failure/HTTP contract/queue immutability/ACL/round-trip rollback/idempotency/drift rejection

ไม่ใช่ end-to-end claimant/provider test หรือ human receipt ไม่มี production mutation, SQL apply, Edge deployment, commit, push, branch switch หรือส่งข้อความทดสอบ ไม่มี UI change จึงไม่ build static app

## Apply หลังได้รับอนุมัติ

1. อ่าน preflight และตรวจ job command, schedule, active, flags, ACL/owner/search_path อีกครั้ง
2. ตรวจ dispatcher original hash ข้างต้น และ dependency hashes ที่ตรวจสด: detector `1dc03593969ddf532a5fd42cf5404baa`, public claimant(integer) `85ff09af34ac0c8fae167f143598d634` ถ้าเปลี่ยนให้ review ใหม่ก่อน apply
3. Apply เฉพาะ patch หลัง explicit approval แล้วอ่าน metadata ยืนยัน gate/ACL/cadence
4. ตรวจ natural cron runs และ worker logs แยกกัน ไม่เรียก dispatcher/claim/detect ด้วยมือเพื่อทดสอบบน production
5. หากต้อง undo ใช้ rollback เฉพาะเมื่ออนุมัติ rollback และ fingerprint ตรง; ถ้ามี drift ให้ตรวจใหม่

คาดการณ์เพดาน: idle ทั้งวันลดได้ 96 HTTP/Edge invocations ต่อวัน (2,880 ต่อ 30 วัน) เฉพาะ Battle Pass notifier ยังคง 96 detector/cron ticks; ไม่ได้ยืนยัน savings ด้าน billing/log bytes วัดอย่างน้อย 24–48 ชั่วโมงที่ workload ใกล้เคียงกันหลัง apply

## Workspace

เพิ่มไฟล์ใหม่เฉพาะชุดนี้ใน canonical `C:\SeaTH\Projects\flowmate` ซึ่งยังอยู่ branch `version2.1` และมีงานอื่นค้าง Target สำหรับ publication ภายหลังคือ GitHub `version2.1.1`

พบ worktree เพิ่มเติม 5 แห่ง เกินเพดาน 3 จึงไม่สร้างเพิ่มหรือ cleanup งานอื่น ไฟล์ patch/test ชุดนี้ใช้ชื่อเฉพาะเพื่อแยกจากงานเดิม; worktrees ทั้งหมด retained ตามเดิม ก่อน commit/publication ต้องจัดฐาน branch ที่ถูกต้องและขออนุมัติ ไม่ stage ทั้ง checkout

## References

- https://supabase.com/docs/guides/database/extensions/pg_net — HTTP requests เริ่มหลัง commit จึงไม่มีลำดับจบงาน producer/notifier ที่รับประกันจากลำดับ enqueue
- https://supabase.com/changelog.md — ตรวจรายการ breaking changes ที่เกี่ยวข้อง; patch นี้ไม่แก้ extension version หรือ cron.job โดยตรง
- local `supabase/battle_pass_seatalk.sql`, `supabase/battle_pass_notification_gates.sql`, `supabase/activity_automation_production_scheduler.sql` และ claimant definitions จาก production

Activity improvement ระยะถัดไปควรให้ production runner ส่งสัญญาณหลัง enqueue สำเร็จ พร้อม periodic retry/reconciliation สำรอง จึงจะลด idle invokes โดยไม่เพิ่มเวลารอ แต่เป็นการเปลี่ยน orchestration ที่ต้องกำหนดและทดสอบแยก
