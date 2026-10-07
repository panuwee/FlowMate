# Battle Pass idle gate — applied and natural Cron verified

ผู้ใช้อนุมัติ apply เฉพาะ `supabase/battle_pass_seatalk_idle_gate.sql` และตรวจ natural Cron runs แล้ว ตารางเวลาทั้ง 6 งานคงเดิม ไม่ครอบคลุม commit/push/cleanup หรือการส่งข้อความทดสอบ

## สถานะล่าสุด 7 ตุลาคม 2026 หลังรอบ 15:30 น. ไทย

- Supabase เชื่อมต่อได้แล้ว ตรวจ preflight สด: dispatcher/detector/claimant hashes ตรงกับ review, seatalk_enabled=true และมี activation cutoff
- Apply patch สำเร็จ และตรวจเวลา `2026-10-07T08:19:16.881091Z` พบ dispatcher body hash `4c96e22f54c34decac9bf82a7a8ce7af` พร้อม idle gate
- Owner `postgres`, ACL `{postgres=X/postgres}`, SECURITY DEFINER และ empty search_path คงเดิม Detector และ claimant hashes ไม่เปลี่ยน
- ทั้ง 6 jobs มี schedule, active และ command hashes ตรงกับก่อน apply
- ตรวจ exact gate string พบเพียง 1 ชุด และเมื่อนำ gate ออก body hash ตรงกับ original (`original_body_preserved=true`)
- เวลา `08:20:19.85498Z`: sending_enabled=true, dispatch_needed=false; คิวก่อน apply มี sent 13, cancelled 2 ไม่มี due หรือ actionable expired
- รอบธรรมชาติ `08:30Z` / 15:30 น. ไทยสำเร็จแล้ว ไม่มีการเรียก dispatch/claim/detect ด้วยมือ
- ไฟล์ apply SHA-256 `780d286eb17a0b13beccc81c5c6eeaf93fd50b49702afc53dd4be538a7224ba6`
- ไฟล์ rollback SHA-256 `32c5bc8686c315b0e8edc232e2d5c17ba212cd2cebc1ebd58311741b561bcc19`

## Natural Cron และ worker log

- Job 7, runid `77137`: succeeded, start `2026-10-07T08:30:00.079184Z`, end `08:30:00.196608Z` (ประมาณ 117 ms)
- return_message ยังเป็น `1 row` เพราะ SELECT คืนแถวแม้ค่าเป็น NULL; ค่านี้อย่างเดียวไม่พิสูจน์ HTTP invocation
- `seatalk_last_detected_at=2026-10-07T08:30:00.096292Z`, seatalk_enabled=true: detector ยังทำงานตามรอบ
- หลังรอบ: sent 13, cancelled 2, due 0, actionable expired 0; max updated_at ของคิวเป็นข้อมูลเก่า ไม่มี notification state ใหม่จากการตรวจนี้
- Query `function_edge_logs` แบบ aggregate แยกช่วงก่อน/หลังอย่างละหนึ่งครั้ง กรอง function IDs ของ Battle Pass notifier, Battle Pass production, Activity runner และ Activity notifier
- ก่อน apply (`08:00:00Z–08:18:00Z`): ผลที่ query คืนมี Battle Pass notifier HTTP 200 จำนวน 1 invocation รวมทั้งอีกสาม endpoints HTTP 200 อย่างละ 1
- หลัง apply (`08:19:30Z–08:30:35Z`): ไม่พบ Battle Pass notifier invocation; พบอีกสาม endpoints HTTP 200 อย่างละ 1 รวมถึงรอบ 08:30
- ผลนี้ประกอบกับ gate definition และสถานะคิวสนับสนุนว่า idle gate ข้าม worker ใน natural tick แรกได้ ไม่ใช่ผลประเมิน billing หรือการยืนยันทุกเหตุการณ์ตลอดวัน และ logs อาจมี ingestion delay
- Local tests 38 ข้อจากขั้นก่อน apply ยังคงเป็นหลักฐานของ due/retry/lease/rollback cases; รอบ production นี้พิสูจน์ idle path เท่านั้น ไม่ได้ส่งข้อความหรือจำลอง retry บน production

## Completion / workspace

Apply และการตรวจ natural tick ตามขอบเขตที่อนุมัติเสร็จแล้ว ตารางเวลาทั้ง 6 งานคงเดิม ไม่มี Edge Function deployment, commit/push หรือ cleanup; canonical ยัง branch version2.1 และ worktrees เดิม retained ทั้งหมด

ยังไม่ได้ตั้ง automation เพิ่มหรือยืนยัน savings ระยะ 24–48 ชั่วโมง เพดานเชิงคำนวณ 96 HTTP/Edge calls ต่อ idle day ของ Battle Pass notifier ต้องแยกจากผลประหยัดเงินจริง

## ประวัติความขัดข้องก่อนเชื่อมต่อใหม่

- อ่าน patch ที่ผ่าน 38 isolated tests และ rollback ได้ครบ
- ตรวจ local branch `version2.1`, worktrees และ remotes; GitHub default branch ยังเป็น `version2.1.1` (`e0f2c77dae39e671452b9712b862369db85f9fe7` ณ เวลาตรวจ)
- Supabase read-only preflight ทั้งสามคำขอไม่สำเร็จ: `OAuth token refresh failed: Failed to parse server response`
- Browser fallback เริ่มไม่ได้: `windows sandbox failed: helper_unknown_error: setup refresh had errors`
- ยังไม่ได้ส่งคำสั่ง SQL apply หรือเปลี่ยน production ใด ๆ ในขั้นนี้ ไม่มี production verification ใหม่
- Worktrees ทั้งหมดเก็บไว้ตามเดิม ไม่มี branch switch, commit, push หรือ cleanup

## ขั้นตอนที่ดำเนินการต่อแล้ว

เชื่อมต่อ Supabase ใหม่สำเร็จ อ่าน preflight สด ตรวจ dispatcher/detector/claimant hashes ตาม `docs/CRON_EFFICIENCY_REVIEW_20261007.md` และใช้การอนุมัติเดิม apply เฉพาะ patch นี้แล้ว

ตรวจ metadata, ACL, schedules และ natural Cron เสร็จแล้วตามหลักฐานข้างต้น ไม่เรียก dispatcher/claim/detect เพื่อสร้างผลทดสอบบน production
