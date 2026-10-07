# Query Performance review and local optimization — 2026-10-07

## สรุป

ตรวจ production project jbavahimqjalvcfawgqw ผ่าน Supabase metadata/pg_stat_statements ซึ่งเป็นข้อมูล query statistics ของโปรเจกต์เดียวกับหน้า Dashboard ที่ผู้ใช้ส่งมา ไม่ได้ตรวจ UI Dashboard หรือ session filters ที่ผู้ใช้เลือก

เตรียม local patch ลด request ซ้ำของ work_item_flags_v ระหว่าง List/Board loaders โดยแชร์เฉพาะคำขอที่กำลังรอผลและมีชุด work item IDs เท่ากัน ผู้ใช้อนุมัติ commit/push/เปิด PR แล้ว; ณ เวลาจัดทำรายงานยังไม่ deploy หรือ apply production SQL

## หลักฐานและลำดับความสำคัญ

Statistics reset: 2026-05-15 07:44:41 UTC ตัวเลขสะสมไม่ใช่ชั่วโมงล่าสุด เปรียบเทียบ normalized query text กับไฟล์ query export ที่ผู้ใช้ส่งมา โดยไม่ได้อ้างว่า export มีช่วงเริ่มที่ยืนยันได้ ผลต่างจึงใช้หา candidate เท่านั้น ไม่ใช้คำนวณ requests/hour หรือ savings หลัง deploy

| Query | Calls เพิ่มจาก export | เวลาเฉลี่ยของ calls ที่เพิ่ม (ms) |
| --- | ---: | ---: |
| work_item_flags_v (-5213430154480238426) | 45 | 311.33 |
| work_items (2526879210079169233) | 15 | 865.47 |
| creative_request_details (3341076987442805322) | 30 | 134.47 |
| work_items (1316920366798797925) | 12 | 215.04 |
| latest_assignment_run_v (-4334626539346532102) | 23 | 41.08 |
| work_items (-1790033206943405276) | 30 | 18.04 |
| work_items (-438555723339584428) | 11 | 22.40 |
| work_item_events (-880140173438904127) | 12 | 16.80 |

- Global work_item_events query ยัง 25,291 calls เท่ากับ export; index created_at ยังเป็น deferred candidate
- Queries timeline รุ่นเก่าที่ครองอันดับ cumulative สูงหลายรายการไม่มี calls เพิ่มจาก export
- Snapshot A: 2026-10-07 05:35:23.291593+00 (UTC)
- Snapshot B: 2026-10-07 05:37:41.788977+00 (UTC)
- ทั้งสอง snapshot ใช้ role authenticated/anon และ top 200 ตาม total execution time; ช่วงประมาณ 2 นาที 18 วินาทีนี้ไม่พบ calls เพิ่มในรายการที่เทียบกัน จึงไม่ใช่หลักฐานว่า workload หายไปตลอดวัน หรือผลประหยัดจาก patch
- Snapshot table estimates: work_items 383, creative_request_details 354, events 1,993 แถว
- Advisor หลัง PR #13 ยังไม่มี auth_rls_initplan/duplicate_index; เหลือ unindexed_foreign_keys 59, unused_index 35, multiple_permissive_policies 31 ซึ่งไม่ควรแก้เหมา

## Local patch

ไฟล์ supabase-list-data.js:
- เพิ่ม loadFlowMateFlagsForWorkItems และใช้ทั้ง List กับ Board related-data loaders
- ใช้ canonical ID set โดยไม่แก้ array ของ caller; ID order/duplicates ไม่สร้าง request ซ้ำ
- แยกผู้ใช้, member, workspace, product และ Supabase client
- คืนสำเนาข้อมูลแยกแต่ละ consumer
- ล้าง in-flight entry หลัง success/error/rejection และเมื่อ invalidate cache
- คำขอเก่าที่จบหลัง invalidate ไม่สามารถลบ entry ของคำขอใหม่
- Empty IDs ไม่ยิง request
- ไม่ cache completed flags หรือเปลี่ยน RLS, view, date semantics หรือ fields ที่อ่าน

ผลที่พิสูจน์ได้จาก local test: สองคำขอที่ซ้อนกันและมี scope/IDs เดียวกันเหลือหนึ่ง backend query; คำขอถัดไปหลังจบยังอ่านใหม่ อัตราลด request จริงขึ้นอยู่กับการซ้อนกันใน production ยังไม่ได้วัด การมี flags calls มากกว่า work_items ไม่ได้พิสูจน์ว่า calls เหล่านั้นซ้อนกัน

## Validation

- 41 tests ผ่าน: flags sharing 6, existing request scope 1, live refresh 17, notifications 17
- Broader checks: 66 ผ่านจาก 67 (performance remediation 18, Board frontend 35, Board integration 4, Task Assign UI 9 ผ่าน/1 ไม่ผ่าน)
- รวม 107 ผ่าน, 1 failure เดิม: Task Assign direct URL fixture ขาด OT_REQUEST_UI_ENABLED
- Reproduce fixture failure กับ app.jsx จาก release HEAD b49f346 ได้ error เดียวกัน โดยไม่ใช้ไฟล์ patch
- npm.cmd run build:github ผ่าน ไม่มี generated outputs เปลี่ยน; git diff --check ผ่าน
- ไม่มี signed-in browser UAT หรือ production benchmark ของ patch นี้; tests ใช้ local mocks ไม่มี network

## งานฐานข้อมูลที่ควรทำต่อ

1. work_items / work_item_flags_v: เก็บ EXPLAIN (ANALYZE, BUFFERS) สำหรับ SELECT แบบจำกัด scope ภายใต้ authenticated identity/claims ที่อนุญาต ก่อนเลือก index หรือ rewrite helper
2. flags view อ่าน work_items, ใช้ CURRENT_DATE และกรอง NOT activity_automation_is_test(work_item_id); จึงไม่แทนด้วย frontend date computation โดยไม่พิสูจน์ equivalence และ test visibility
3. ฟังก์ชัน RLS บางตัวรับ work_item_id ซึ่งขึ้นกับแต่ละแถว: การครอบ SELECT ไม่ทำให้กลายเป็นผลคงที่ทั้ง statement อัตโนมัติ ต้องตรวจ actual plan และรักษา authorization rules
4. คง index (work_item_id, created_at DESC) สำหรับ scoped event reads; เพิ่ม (created_at) เฉพาะเมื่อ global feed ยัง active และ measured plan สนับสนุน
5. ไม่ reset shared statistics; วัด delta queryid + role + stats_reset เดียวกัน 30–60 นาทีช่วงใช้งานจริง แล้วแยก latency, request volume และ billing log bytes

## Release / scope

- Branch: codex/query-flags-dedup-20261007, base b49f3460387d75533db1c324c532d368ccd24f9f
- Reused worktree: C:\SeaTH\Projects\flowmate\.worktrees\supabase-log-optimization-20261006
- ไม่สร้าง worktree เพิ่ม; canonical checkout ยัง branch version2.1 และมี unrelated dirty files จึงไม่สลับหรือทับ
- Worktree retained สำหรับ review; ไม่มี cleanup
- ผู้ใช้อนุมัติ commit/push/PR สำหรับ patch นี้แล้ว; merge/deploy และ production SQL เป็นขั้นแยก
- SQL PR #13 ที่ apply แล้วเป็นงานก่อนหน้า ไม่ได้ apply SQL เพิ่มในรอบนี้

อ้างอิง: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
