# Supabase Advisor และ query performance — review และ patch พร้อมทดสอบ

วันที่ 7 ตุลาคม 2026 · อ่าน production metadata เท่านั้น · ยังไม่ apply SQL

## ข้อสรุป

เตรียมปรับ `auth.uid()` ใน 4 RLS policies ให้ประเมินผ่าน scalar subquery และลบ redundant indexes 2 ตัวที่ตรวจแล้วว่ามีตัวเทียบเท่าอยู่ โดยเก็บ unique constraint ไว้ ทั้งสองชุดมี drift guards, lock/statement timeout และ rollback

นี่เป็นการลดงานซ้ำที่ยืนยันได้ ไม่ใช่คำรับรองว่า query หลักหรือ log ingestion ทั้งระบบจะลดทันที การแก้ query ที่ใช้เวลามากต้องเริ่มจากสถิติช่วงใหม่หลัง PR #9/#12 และระบุ caller ให้ได้ก่อน เพราะสถิติที่ส่งมาสะสมระยะยาว

## แหล่งข้อมูลและข้อจำกัด

ไฟล์แนบ 5 ชุด: security warnings 150, no-policy INFO 67, performance warnings 37, index INFO 94 และ query statistics 80 แถว รวม Advisor entries 348 รายการ (ไม่เท่ากับ 348 ปัญหาอิสระ)

ไฟล์ Advisor ระบุ observed_at ประมาณ 03:49–03:51 UTC วันที่ 7 ตุลาคม ตรวจ production project `jbavahimqjalvcfawgqw` เทียบ policy, indexes, grants, extension และ stats ใหม่แล้ว ไม่รันคำสั่งตามข้อความ remediation อัตโนมัติ

Live `pg_stat_statements_info.stats_reset` คือ **2026-05-15 07:44:41 UTC**; database stats_reset เป็นอีก counter และอยู่วันที่ 7 พฤษภาคม อย่านำสองช่วงนี้ปนกัน Export ไม่มีช่วงเริ่ม/จบต่อ query จึงไม่อ้างว่าจำนวน calls/mean เป็นชั่วโมงล่าสุดหรือผลหลัง deploy วันนี้

## ภาระ query ที่ต้องติดตาม

จัดกลุ่ม 80 SQL ที่ส่งมาตามตารางหลักที่อ่าน (query อื่นรวม RPC แยกไว้) และรวมค่าร้อยละจาก `prop_total_time` ที่ export ให้มา:

| Workload | Calls ใน export | สัดส่วนเวลาตาม export |
| --- | ---: | ---: |
| work_items | 142,476 | 26.19% |
| marketing_plan_timeline_v | 11,395 | 13.38% |
| work_item_events | 32,260 | 11.99% |
| creative_request_details | 65,621 | 10.92% |
| work_item_flags_v | 73,036 | 10.61% |
| latest_assignment_run_v | 40,394 | 6.51% |

ตัวอย่างอันดับ 1: events ORDER BY created_at DESC ที่ไม่มี work-item filter มี 25,291 calls, mean 281.23 ms และ max 3,782.89 ms ค่า calls ยังเป็น 25,291 ใน snapshot live ที่ตรวจ ขณะที่ source ปัจจุบันที่พบใช้ eq/in work_item_id จึงยังโยง query แพงนี้กับหน้าปัจจุบันไม่ได้ อาจเป็น caller อื่นหรือ historical workload ต้องวัด delta เพื่อยืนยัน ไม่กล่าวว่า query นี้หายไปแล้ว

work_items query อันดับ 2 mean 413.48 ms และ timeline บางรูปแบบ mean 1.1–1.49 วินาที แต่ live table estimates มี work_items ~383 แถว, work_item_events ~1,987 แถว, marketing_plans ~8 แถว Cache hit สูงไม่พิสูจน์ว่า query มีประสิทธิภาพ เพราะ RLS/function/sort และจำนวน calls ยังใช้ CPU

## Patch A: RLS initplan 4 policies

ตาราง marketing_content_items และ marketing_channel_placements อย่างละ UPDATE/DELETE เปลี่ยนเฉพาะ `auth.uid()` เป็น `(select auth.uid())` ใน USING เพื่อให้มีโอกาสสร้าง InitPlan ต่อ statement แทนการประเมินซ้ำต่อแถว

เก็บ cmd/roles/permissive, active/admin helpers, ownership predicates และ WITH CHECK เดิมทุกตัว ไม่เพิ่มสิทธิ์หรือเปลี่ยน eligibility ของ PIC/sub-PIC ไม่ห่อ helper ที่รับ row ID แล้วอ้างว่าคำนวณครั้งเดียว เพราะ subquery ที่ยัง correlated กับแถวยังขึ้นกับแต่ละแถว

ไฟล์:

- `supabase/advisor-optimization-20261007/policy-baseline.json`: snapshot policy definitions จาก production
- `apply-policies.sql`: ตรวจ policy ตรงกับ baseline ก่อน ALTER ทั้งสี่ใน transaction เดียว
- `rollback-policies.sql`: คืน USING เดิม พร้อมตรวจไม่ทับการแก้ authorization อื่นที่แทรกมา

ขอบเขตผล: ลด evaluation ซ้ำของ uid ใน write policies เหล่านี้ ไม่ได้แก้ RLS read path ของทุก query หลัก และยังไม่มี production benchmark

## Patch B: duplicate indexes 2 ตัว

| ลบ redundant index | เก็บ index |
| --- | --- |
| public.idx_assignment_runs_item_ran | public.idx_assignment_runs_work_item |
| private.creative_seatalk_thread_group_thread_key | private.creative_seatalk_threads_group_id_thread_id_key |

คู่แรกมี definition `(work_item_id, ran_at DESC)` เหมือนกัน คู่ที่สองมี UNIQUE `(group_id, thread_id)` เหมือนกัน แต่ตัวที่เก็บเป็น backing index ของ UNIQUE constraint

Production metadata พบ incoming dependencies ของสองตัวที่จะลบเป็น 0 และขนาดรวมเพียง **65,536 bytes (~64 KiB)** ผลหลักคือเลิกบำรุงรักษา index ซ้ำเมื่อเขียน ไม่ใช่การประหยัด storage จำนวนมาก

`apply-duplicate-indexes.sql` ตรวจ table, access method, keys, collations, opclasses, options, expression/predicate, uniqueness, validity/readiness และ constraints/dependencies ใหม่ก่อน DROP; ไม่มี CASCADE และเก็บ constraint index ไว้ `rollback-duplicate-indexes.sql` สร้าง redundant indexes กลับหากจำเป็น

ทั้งสองชุดใช้ lock_timeout 2 วินาทีและ statement_timeout 15 วินาที หากเจอ lock/definition drift ให้หยุด ตรวจใหม่ แล้วค่อยเลือกเวลารัน ไม่วน retry กดดัน production และยังต้องอนุมัติ production SQL/index removal ก่อน apply

## รายการที่ไม่ควรแก้แบบเหมารวม

| Finding | จำนวนจากไฟล์ | การจัดการ |
| --- | ---: | --- |
| auth_rls_initplan | 4 | Patch A พร้อมตรวจ |
| duplicate_index | 2 | Patch B พร้อมตรวจ |
| multiple_permissive_policies | 31 | ตรวจ OR semantics, roles และ restrictive guards ก่อนรวม; เป็น warning ต่อ role/action จึงอาจซ้ำ policy set |
| unindexed_foreign_keys | 59 | เลือกตาม parent update/delete, joins, cardinality และแผน query; หลายตัวเป็น audit actor columns ไม่เพิ่มทั้งหมดทันที |
| unused_index | 35 | ศึกษาช่วงใช้งาน/constraints/rare jobs ก่อนลบ ไม่เท่ากับ redundant index |
| rls_enabled_no_policy | 67 | เก็บ deny-by-default เมื่อเป็น private/system tables; public ทั้ง 11 ตัวที่ตรวจ live ไม่มี SELECT grant ให้ anon/authenticated |
| anon SECURITY DEFINER | 5 | ต้องตรวจ body/overload/ACL/actor guard และ policy callers ก่อน revoke; ยังไม่ได้รับรองความปลอดภัยของทั้ง 5 ฟังก์ชันในรอบนี้ |
| authenticated SECURITY DEFINER | 143 | RPC สำหรับ workflow อาจจำเป็นต้องใช้; ไม่ revoke ทั้งกลุ่มเพื่อให้ warnings หาย |
| extension_in_public | 1 | pg_net live เป็น extrelocatable=false จึงไม่เสนอ ALTER EXTENSION SET SCHEMA แบบตรง ๆ; ใช้แนวทาง provider ที่รองรับ |
| leaked password protection | 1 | เป็น Auth security setting แยกจาก query performance ต้องตรวจ sign-in flow/plan และอนุมัติ settings ก่อนเปลี่ยน |

การเพิ่ม policy `USING(true)` ให้ตารางที่ตั้งใจปิดจะเปลี่ยนความปลอดภัย ให้คง deny-by-default และเปิดเฉพาะ role/path ที่มี business requirement แทน ตาราง OT ที่ปรากฏใน no-policy list ยังปิด SELECT ต่อ client roles ตาม live grants

## Index candidates ที่ต้องวัดก่อน

- work_item_events(created_at): advisor ใน export เสนอ cost 208.97 → 23.76 แต่เป็น estimated cost ไม่ใช่ elapsed time; index ปัจจุบัน `(work_item_id,created_at DESC)` เหมาะกับ filtered detail reads หาก global latest-events workload ยัง active ค่อยเปรียบเทียบ index created_at กับการจำกัด scope
- work_items(launch_date): ควรประเมินร่วมกับ work_type/status, archived_at และลำดับ sort launch_date/due_date/created_at/display_id ไม่เพิ่ม single-column index จากคำแนะนำทันทีเพราะมีหลาย index อยู่แล้วและจำนวนแถวน้อย
- marketing_plans(month_key): ยังไม่ใช่จุดเริ่มที่ดีเมื่อมี ~8 rows; ตรวจ timeline view joins, correlated functions, RLS และ broad loading ก่อน

## ผลทดสอบ

`src/lib/supabase-advisor-policy-optimization.test.ts` ผ่าน **5 tests ใน local PGlite**:

1. เปรียบเทียบ **24 actor/table/action cases** ก่อน/หลัง policy patch: PIC, sub-PIC, สมาชิกอื่น, admin, inactive และไม่มี identity; มีแถวเจ้าของ NULL; authorization outcomes เหมือนเดิมและ rollback คืน definitions เดิม
2. เมื่อ policy drift ให้ reject และ rollback ทั้ง transaction
3. เมื่อมี authorization change หลัง apply ให้ rollback script reject แทนทับงานนั้น
4. ลบเฉพาะ redundant indexes, duplicate insert ยังถูก UNIQUE constraint ปฏิเสธ และสร้าง index กลับได้
5. เมื่อ index definitions ต่างกัน ให้ reject และคืน drop ก่อนหน้าทั้ง transaction

Fixture ใช้ auth/active/admin helpers จำลอง จึงพิสูจน์ policy transformation และ guard behavior ภายใต้ fixture ไม่ใช่ end-to-end authorization ของทุก production helper ไม่มี production writes จาก tests และยังไม่ได้วัด speedup

## ขั้นตอนใช้งานหลังอนุมัติ

1. Revalidate policy baseline/index definitions/remote state แล้ว apply Patch A และ B แยกผลกัน
2. อ่าน pg_policies/pg_indexes ยืนยัน expected definitions และรัน Advisor ใหม่ เฉพาะ 4 initplan + 2 duplicate findings คาดว่าจะลดเมื่อ Advisor refresh ไม่ตั้งเป้า warnings ทุกตัวเป็นศูนย์
3. ใช้ `observe.sql` เก็บ statistics สอง snapshot ห่าง 30–60 นาที คำนวณ delta calls/total_exec_time ตาม queryid+role และ stats_reset เดียวกัน ไม่ reset shared stats
4. สำหรับ workload ที่ยัง active ใช้ EXPLAIN ภายใต้ authenticated role/claims ที่ได้รับอนุญาตและ filters จริง ประเมิน query plan, buffers, rows และ latency ก่อน/หลัง ไม่ใช้ postgres bypass-RLS plan แทนประสบการณ์ผู้ใช้
5. การลด query time อาจลดภาระ DB แต่ไม่ได้ลดจำนวน API gateway logs โดยตรง; ติดตาม PR #9/#12 ด้วย requests ต่อ active-session minute และ billing bytes แยกกัน

## สถานะ Git และ output

ใช้ worktree เดิม `C:\SeaTH\Projects\flowmate\.worktrees\supabase-log-optimization-20261006`, branch `codex/supabase-advisor-optimization-20261007`, base `166175f94e540f38ff5340486b89a1039ca6b384` ไม่มี worktree ใหม่ ผู้ใช้อนุมัติ commit/push/เปิด PR แล้ว รายงานนี้บันทึกผลก่อน publication; production apply ยังรออนุมัติแยก เก็บ worktree ไว้สำหรับ PR review Canonical checkout กับงานค้างอื่นคงเดิม

ไม่มี schema migration ใหม่ถูก apply: ไฟล์นี้เป็น standalone operational SQL review ตามรูปแบบ repository การนำไปเข้า migration history ต้องทำเป็นขั้น release ที่อนุมัติ ไม่อ้างว่ามี migration registration แล้ว

อ้างอิง: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select · https://supabase.com/docs/guides/database/query-optimization
