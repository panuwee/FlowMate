# Supabase log optimization — ชุด review ก่อน release

วันที่ 6 ตุลาคม 2026 · ชุดที่อนุมัติให้ commit/push และเปิด PR · production รอ review/merge

## ผลที่พร้อมเผยแพร่

- My Work/List/Attention ใช้ safety poll 180 วินาทีเมื่อ Realtime พร้อม; fallback 60 วินาทีเมื่อไม่พร้อม พร้อม backoff เดิม
- task consumers ข้าม notification-only refresh; notifications และหน้าที่ไม่ opt in คง cadence เดิม
- รวมคำขอ work_items ที่ซ้อนกันเฉพาะ scope เดียว แยก user/workspace/member/My Work/product/allTaskTeams และไม่เก็บ settled response ใน map ใหม่นี้
- reconnect/กลับแท็บ refresh ทันที; ทดสอบ old/new request race และ cleanup แล้ว
- ไม่ต้องติดตั้ง SQL หรือ Edge Function เพื่อใช้ชุดนี้

## ฐานที่ตรวจจริง

GitHub remote `github`: https://github.com/panuwee/FlowMate.git

Target: `version2.1.1` ที่ `b2a68f137a41d6c3d70acaf3369dc46dc0cc0086` ตรวจจาก remote และ fetch วันที่ 6 ตุลาคม 2026 ต้องตรวจใหม่ก่อน push/merge เพราะมีงานอื่นทำพร้อมกัน

สำเนา preview: `C:\SeaTH\Projects\flowmate\output\log-optimization-release-20261006\preview` เป็นไฟล์จาก git archive ไม่มี Git checkout/worktree ใหม่ ไม่ใช้เพื่อ commit โดยตรง

รอบแรกนำ local patch ไปใช้ตรง ๆ ไม่ได้ เนื่องจาก GitHub มี Task Assign filters ใหม่ จึง port เฉพาะ helper/คำขอ/การเรียก helper โดยรักษา work_type, owning_team และ allTaskTeams ของฐานใหม่ ไม่คัดลอก supabase-list-data.js ทั้งไฟล์จาก canonical เก่าไปทับ release

## หลักฐานการทดสอบ

- สำเนาฐาน release + task patch: **52 tests ผ่าน** — Live refresh 16, request scope 1, Board/frontend 35
- canonical local หลังเพิ่ม product/allTaskTeams isolation: **50 tests ผ่าน** — Board/frontend ใน canonical มี 33 tests
- ทั้งสองรอบ exit code 0; mocked network/VM/fake timers ไม่เขียน production
- build ของ preview สำเร็จ เก็บเฉพาะ generated screens-a.js/screens-b.js ใน patch และคืน generated files ที่ไม่เกี่ยวข้องใน preview ให้ตรง baseline
- ยังไม่ทำ browser verification ของ release ใหม่ เพราะยังไม่ publish
- ผล billing savings ต้องวัดหลังใช้งานจริง ไม่ใช้ test polling reduction แทน billing result

## รายการไฟล์ใน patch

1. supabase-list-data.js
2. screens-a.jsx
3. screens-b.jsx
4. screens-a.js (generated)
5. screens-b.js (generated)
6. src/lib/flowmate-live-refresh.test.ts
7. src/lib/flowmate-log-request-scope.test.ts
8. docs/SUPABASE_LOG_USAGE_REVIEW_20261006.md
9. docs/SUPABASE_LOG_PRODUCTION_FINDINGS_20261006.md
10. docs/SUPABASE_LOG_RULES_AND_OPTIMIZATION_20261006.md
11. docs/SUPABASE_LOG_OPTIMIZATION_RELEASE_REVIEW_20261006.md

เมื่อ commit เพื่อเผยแพร่ ให้เพิ่ม cache stamp เฉพาะ index.html, home/index.html, product-book/index.html ตาม release hook และตรวจ staged diff หลัง hook เสมอ ขอบเขต release จึงมี 14 files ไม่มี production SQL/settings changes

Patch บนฐานใหม่: `output/log-optimization-release-20261006/release-ready.patch`; hash/จำนวนไฟล์ดู `release-manifest.json` ใน directory เดียวกัน Local task-only.patch เป็น diff จาก canonical baseline เก่า ใช้เป็นหลักฐานแยกงานเท่านั้น ไม่ใช้ apply บน remote โดยตรง

## ขอบเขตที่ผู้ใช้อนุมัติ

ผู้ใช้เลือก “เปิด PR ก่อน” จากคำถามอนุมัติที่ระบุ commit, push branch และเปิด PR เข้า version2.1.1 พร้อมการใช้ worktree เพิ่มชั่วคราว เก็บ worktree เดิมทั้งหมดไว้

ใช้ branch `codex/supabase-log-optimization-20261006` และ worktree `.worktrees/supabase-log-optimization-20261006` สำหรับ PR เข้า `version2.1.1` การ merge/deploy และ cleanup ไม่อยู่ในอนุมัติรอบนี้

ก่อนเริ่มมี registered worktrees 4 แห่งนอก canonical ซึ่งเกินเพดาน 3; canonical และ .worktrees/version2.1.1 มี unfinished changes ส่วน .worktrees/campaign-planner-release ถูกใช้อยู่โดยอีก chat จึงรักษา checkouts เดิมไว้ ผู้ใช้อนุมัติข้อยกเว้นสำหรับ worktree เพิ่มชั่วคราวของงานนี้ รวมเป็น 5 แห่งนอก canonical และยังไม่อนุมัติ cleanup

สร้าง worktree บนฐานที่ระบุแล้ว และทดสอบใน worktree จริงผ่าน 52 tests การ commit/push/เปิด PR ทำตามอนุมัติของ chat นี้ โดยใช้ cache stamp และตรวจ staged diff หลัง hooks การเปิด PR ไม่ยืนยัน production savings หรือ deployment

## หลังเผยแพร่

- ยืนยัน GitHub target SHA/Pages deployment และ hash ของ assets ที่ live ให้ตรง commit
- ตรวจ browser: My Work/List/Attention, notifications, product/team switching, ข้อมูลใหม่จากอีก session, reconnect และ hidden/visible tab
- เปรียบเทียบ daily ingestion และ requests ต่อ active session หลัง 24–48 ชั่วโมง; ติดตามแนวโน้มหลายวันก่อนสรุปผล
- หาก freshness ไม่ผ่าน ถอน realtimeIntervalMs เฉพาะ consumer ที่กระทบก่อน; rollback source/generated/stamp ให้เป็นชุดเดียวกัน

อ้างอิง: [กติกาและผล implementation](SUPABASE_LOG_RULES_AND_OPTIMIZATION_20261006.md) · [หลักฐาน production](SUPABASE_LOG_PRODUCTION_FINDINGS_20261006.md)
