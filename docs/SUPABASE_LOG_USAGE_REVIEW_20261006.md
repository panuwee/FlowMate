# Supabase Log Ingestion / Log Query — FlowMate

วันที่ตรวจ: 6 ตุลาคม 2026 (Asia/Bangkok)

> อัปเดต: ตรวจ production สดแล้วในรอบถัดมา ดู [ผลตรวจ production](SUPABASE_LOG_PRODUCTION_FINDINGS_20261006.md) ข้อมูลด้านล่างเก็บเป็น review ก่อนเข้าถึง production; ข้อจำกัดว่าไม่ได้อ่าน production ใช้กับรอบแรกเท่านั้น ผลใหม่พบ API gateway เป็นแหล่งหลักในตัวอย่างหนึ่งชั่วโมง และยืนยันว่า Postgres ไม่ได้เปิด verbose query logging

## ข้อสรุป

ควรเริ่มจากวัดแหล่งกำเนิด log และปรับวิธีค้น log ก่อนเพิ่มบริการหรือเปลี่ยนแพ็กเกจ ภาพแสดง Ingestion 1.061/1 GB (106%) และ Query 43.973/100 GB (44%) แต่มีป้าย UPCOMING เอกสารทางการระบุว่ายังเป็น soft launch ไม่มีการคิดเงินหรือบังคับข้อจำกัดของตัวชี้วัดนี้ระหว่าง grace period

องค์กรที่มีอยู่ ณ 25 กันยายน 2026 ได้ช่วงผ่อนผันถึงต้นปี 2027 องค์กรใหม่ได้ช่วงผ่อนผันในปัจจุบันเช่นกัน แต่ Supabase อาจประกาศวันสิ้นสุดก่อนหน้านั้น ตรวจประกาศอีกครั้งก่อนวันบังคับใช้

นี่คือ review จากภาพ โค้ด local และเอกสารทางการ ไม่ใช่การตรวจ production สด: session นี้ไม่มี Supabase connector และไม่ได้อ่าน live logs, project settings, cron state หรือ billing breakdown ไม่สามารถยืนยันต้นเหตุหรือเปอร์เซ็นต์ประหยัดจริงได้ ภาพไม่แสดงรอบบิล วันที่ถ่าย หรือ project filter จึงห้ามสมมติว่าเป็นยอดวันที่ 1–6 ตุลาคม หรือเป็น FlowMate เพียงโครงการเดียว

## อ่านตัวเลขอย่างถูกต้อง

| รายการ | ความหมายและผลต่อการตัดสินใจ |
|---|---|
| Ingestion 1.061 GB | ปริมาณ bytes ของ log ที่รับเข้าจากบริการ เช่น Postgres, gateway, Auth และ Edge Functions ในรอบบิล เกิน 1 GB ประมาณ 61 MB แบบ decimal แต่ยังใช้ทำนายยอดสิ้นเดือนไม่ได้ |
| Query 43.973 GB | ข้อมูล logs ที่ถูกสแกนเมื่ออ่านผ่าน Studio, API, CLI และเครื่องมืออื่น ไม่ใช่ SQL query ของตารางธุรกิจ และไม่ใช่ขนาดฐานข้อมูล |
| Database 0.169/0.5 GB | การลบข้อมูลตารางหรือ audit history ไม่ได้ย้อนลดยอด log ingestion ที่เกิดไปแล้ว |
| Edge invocations 22,584 | มีการเรียกฟังก์ชัน แต่ภาพไม่แสดงแยกฟังก์ชัน จึงระบุไม่ได้ว่า scheduler ใดเป็นต้นเหตุ |
| MAU 8 / Realtime peak 12 | ไม่ใช่จำนวนผู้ใช้พร้อมกันตลอดเดือน และใช้คำนวณจำนวน polling จริงไม่ได้ |

Free มี ingest 1 GB และ query allowance เริ่ม 100 GB; paid plans มี ingest 20 GB และ query allowance เริ่ม 2,000 GB เอกสารระบุอัตรา allowance 100 เท่าของ ingest และขยายตาม paid ingest overage ส่วน query ไม่มีราคาแยกต่อ GB ไม่ควรตีความว่า Free สามารถซื้อ ingest เกินโควต้าแบบ paid ได้

ราคา ingest ส่วนเกินของ paid plans ที่ประกาศคือ $0.50/GB หลังส่วนที่รวมในแผน ไม่รวมค่าสมาชิกและรายการอื่น Free ไม่เรียกเก็บ overage แต่จะอยู่ภายใต้นโยบายโควต้าหลังบังคับใช้

## หลักฐานจากโค้ด local

1. `supabase-list-data.js:6–7, 129–200`: debounce 700 ms, polling 60 วินาที, หยุด network refresh เมื่อแท็บถูกซ่อน, รวม request ที่ซ้ำ และ backoff เมื่อผิดพลาด มีแล้ว ไม่ควรเสนอเป็นงานใหม่ทั้งหมด
2. helper ยัง poll ทุก 60 วินาทีโดยไม่ได้ตรวจว่า Realtime connected อยู่หรือไม่ แต่ละผู้เรียก helper มี timer ของตัวเอง ดังนั้นหนึ่งรอบอาจก่อให้เกิดหลาย API requests
3. `app.jsx:785–803`: notification refresh ใช้ helper นี้ตลอดช่วง signed-in; Timeline/Channel Plan/Calendar/Working Sheet ก็มีการใช้ helper ในหน้าที่เกี่ยวข้อง ไม่ได้หมายความว่าทุกหน้าทำงานพร้อมกัน
4. `supabase/creative_seatalk_scheduler_ready_gate.sql:11`: มี ready gate ตรวจ pending/retry ที่ถึงเวลาก่อน HTTP dispatch อยู่แล้ว ต้องตรวจ cron ที่ติดตั้งจริงก่อนตัดสินใจทำซ้ำ ประวัติงานเดิมเคยระบุว่า deploy แล้ว แต่ review นี้ไม่ยืนยันสถานะปัจจุบันหรือผลประหยัด
5. `supabase/activity_automation_production_scheduler.sql:24–31, 47`: โค้ด installer ตั้งรอบ 30 นาที และ dispatcher เรียก notifier เมื่อเปิดการส่ง/มี token โดยไม่มี due-outbox gate ตรงจุดเรียกนี้ สถานะ enabled/active จริงยังไม่ทราบ
6. การค้น `console.log/info/debug` ใน Edge Function TypeScript พบ log initialization ใน `supabase/functions/bp-mcp/index.ts:133`; ไม่พบหลักฐานเพียงพอว่า verbose application logging เป็นตัวหลัก Browser `console.*` ไม่ถูกส่งเข้า Supabase logs โดยอัตโนมัติ เว้นแต่มี forwarding เพิ่มเติม

## แผนปรับปรุงตามลำดับ

### 1. หาแหล่งที่ใช้จริงก่อนเปลี่ยนระบบ

- ใน Usage เลือก FlowMate โดยเฉพาะ ตรวจวันเริ่ม/สิ้นสุดรอบบิล และดู daily ingestion/query ก่อนและหลังการปรับเดิมวันที่ 2 ตุลาคม
- ใช้ breakdown ที่ Dashboard มีให้ก่อนอ่าน raw logs หากต้องค้น เริ่มช่วง 15–60 นาทีและเฉพาะ service ที่สงสัย ขยายเมื่อจำเป็น ไม่สแกนทุก service ย้อนหลังทั้งเดือนเพื่อทำ baseline
- จดประเภท log ที่มากที่สุด, ข้อความซ้ำ, error/status, function/route และช่วงเวลา แยกจำนวน entries ออกจาก bytes เพราะ entry ขนาดใหญ่อาจครองปริมาณแม้จำนวนน้อย
- ตรวจ Postgres logging settings ปัจจุบัน: log_statement, log_min_duration_statement, log_min_messages, log_connections/disconnections และ pgAudit ที่อาจเปิดอยู่ ตรวจ cron active/schedule กับจำนวนงานจริง โดยไม่แสดง secret หรือ cron command ที่มี credential
- ตรวจ automation/AI/CLI ที่อ่าน logs ซ้ำ รวมถึงหน้าจอ Logs ที่ refresh อัตโนมัติ เมื่อไม่มีผลแยก service ให้เรียกข้อสรุปว่า hypothesis ไม่ใช่ root cause

### 2. ลด Log Query — เริ่มได้จากวิธีใช้งาน

- ใช้ช่วงเวลา 15–60 นาทีเป็นจุดเริ่มสำหรับ incident และ filter service, route/function, status หรือ request ID ใน query ตั้งแต่แรก
- ไม่ดึงทั้งหมดแล้วกรองใน client; เลือก fields ที่จำเป็น และอย่าอาศัย LIMIT อย่างเดียวเพื่อรับประกันว่าข้อมูลที่สแกนจะลด
- ใช้ fixed time window และเก็บผลการตรวจครั้งนั้นมาอ้างอิง เพื่อลดการถาม query เดิมซ้ำ เอกสารระบุว่า query ซ้ำสแกนใหม่ ไม่มีประโยชน์จาก caching ของคำถามเดิม
- งาน monitor ปกติอ่านสถานะธุรกิจหรือ metrics ที่สรุปไว้ แล้วอ่าน raw logs เมื่อผิดปกติ หากจำเป็นต้อง query ตามรอบ ให้ใช้เวลาตั้งแต่ checkpoint ล่าสุด พร้อม overlap สั้นและ dedup แทน lookback กว้างซ้ำทุกครั้ง
- ไม่ตั้ง AI agent ให้อ่าน logs ทั้งวันทุกนาทีโดยไม่มีเหตุการณ์กระตุ้น ทบทวน automation เดิมก่อนสร้างตัวใหม่
- ตรวจสคริปต์เก่าที่ใช้ Management API `logs.all`: changelog ระบุถอด endpoint วันที่ 23 กันยายน 2026 และใช้ `logs` ซึ่งรองรับ ClickHouse SQL ต้องตรวจ schema/dialect ปัจจุบันก่อนนำตัวอย่าง SQL เก่ามาใช้

### 3. ลด Ingestion ที่ต้นทางโดยรักษาความสามารถตรวจสอบ

**Polling:** ทดลองขยาย safety polling เป็น 3–5 นาทีเฉพาะเมื่อ Realtime เชื่อมต่อและหน้ารับความหน่วงนี้ได้ ใช้ 60 วินาทีเมื่อ disconnected และยัง refresh เมื่อกลับแท็บหรือกดเอง ตรวจ reconnect, missed events, หลายแท็บ, notification freshness และ dedup ก่อน rollout การเปลี่ยน 60 เป็น 300 วินาทีลดเฉพาะ timer-driven refresh ได้ประมาณ 80% ในสภาวะคงที่ ไม่ใช่คำรับประกันว่าจะลด log รวม 80%

**Scheduler:** ตรวจ CreativeBot gate ที่ติดตั้งจริงก่อน ส่วน Activity notifier เหมาะเป็นผู้สมัครสำหรับ due-outbox gate โดยรักษา pending/retry/available_at, cutoff, stale claims และกลไก retry เดิม งาน discovery runner มีหน้าที่ค้นงานใหม่ จึงไม่ควรหยุดเพียงเพราะ notification outbox ว่าง การคงรอบ cron แล้ว gate HTTP ยังมี cron execution/history อยู่ ไม่ใช่ zero logging ทั้งระบบ

**Postgres:** ถ้าพบ log_statement=all หรือ log_min_duration_statement=0 โดยไม่ได้ใช้เพื่อ audit ให้เสนอปรับ statement logging และเริ่ม slow-query threshold เช่น 500–1,000 ms ตาม SLA จริง หลังตรวจข้อกำหนด audit เก็บ error, warning และเหตุการณ์ความปลอดภัยที่จำเป็นไว้ ใช้ Query Performance/pg_stat_statements เมื่อมีให้สำหรับข้อมูลรวม ทบทวน connection logging และการใช้ poolerตามหลักฐาน ไม่ปิดทั้งหมดพร้อมกัน การเปลี่ยน settings บางชนิดอาจต้อง restart

**Edge Functions:** log แบบมีโครงสร้างและขนาดจำกัด เช่น event, function, request_id, duration_ms, outcome, error_code; หลีกเลี่ยง request/response body ทั้งก้อนและข้อมูลลับ เก็บความผิดพลาดที่ต้องติดตามและ business/security audit ให้ครบ ลดหรือ sample เฉพาะ repetitive success/debug logs และสรุปจำนวนความผิดพลาดซ้ำโดยยังมี trace ให้ตรวจต่อ การลด console logs ไม่ได้ลบ gateway/runtime logs ที่ Supabase สร้างเอง

### 4. ตั้งงบและวัดผลอย่างยั่งยืน

- เป้าหมายเริ่มต้นที่เสนอ: projected ingest ไม่เกิน 0.8 GB และ projected query ไม่เกิน 70 GB ต่อรอบบิล เพื่อเผื่อ incident ไม่ใช่ SLA ที่ยืนยันว่า workload ปัจจุบันทำได้
- รอบ 30 วันเทียบเท่าประมาณ 26.7 MB ingest/วัน และ 2.33 GB query/วัน เป็นค่าเฉลี่ยสำหรับวางแผน ไม่ใช่ hard limit รายวัน
- พยากรณ์จากยอดสะสมและจำนวนวันที่ผ่านในรอบจริง พร้อมดู rolling average หลายวัน ระบุความไม่แน่นอนจากวัน deploy/debug และจำนวนผู้ใช้งาน
- วัด baseline หลายวัน เปลี่ยนทีละกลุ่ม ตรวจหลัง 24–48 ชั่วโมงและยืนยันแนวโน้มประมาณหนึ่งสัปดาห์; ยอดสะสมจะไม่ลดลง ต้องดูอัตราที่เพิ่มต่อวัน
- วัดคู่กัน: ingest MB/day, query GB/day, API requests ต่อ active session, idle dispatch count, error rate, เวลาแสดง notification, missed/duplicate delivery และ audit completeness ประหยัดผ่านเมื่อคุณภาพบริการไม่ถดถอย
- ใช้ Usage/metrics เป็นหลักเพื่อวัดผล ไม่สร้าง log query monitor ที่สแกนหนักเสียเอง ไม่ต้องเพิ่มระบบ monitoring ใหม่จนกว่าจะเห็นความจำเป็น

## แพ็กเกจและ Log Drains

ยังไม่แนะนำอัปเกรดหรือซื้อ Log Drain จากภาพนี้เพียงอย่างเดียว หากหลังลดงานว่างแล้ว traffic ที่จำเป็นยังเกิน Free อย่างต่อเนื่อง paid plan ที่มี ingest 20 GB อาจสมเหตุผลกว่าเพิ่มความซับซ้อนหรือสูญเสียหลักฐาน audit

Log Drains เหมาะกับการ stream ต่อเนื่องไป monitoring/archival โดยไม่ query ซ้ำ แต่เป็น add-on ของ Pro/Team/Enterprise ราคา $0.0822/ชั่วโมง (ประมาณ $60/เดือนต่อ drain) บวก $0.20 ต่อ 1 ล้าน events ตาม package และ egress/ค่าปลายทาง ไม่อยู่ใต้ Spend Cap และไม่ควรคาดว่าจะยกเลิก ingestion เดิม จึงไม่ใช่วิธีประหยัดเริ่มต้นของ FlowMate ในภาพ

หลังบังคับใช้ เอกสาร query อธิบายว่าการเกิน allowance อาจนำไปสู่ rate limit 10 queries/min และลด retention ในเดือนถัดไป; เกินซ้ำอาจถูกตัดการเข้าถึง logs ชั่วคราว นี่เป็นพฤติกรรมในอนาคตตามเอกสาร ไม่ใช่สถานะของบัญชีนี้ในปัจจุบัน

## ขอบเขตการดำเนินการครั้งนี้

- สร้างรายงานนี้เท่านั้น ไม่แก้ application/SQL, ไม่ query production, ไม่ apply, deploy, commit หรือ push
- ไม่รัน tests/build เพราะไม่มีการแก้โค้ด; ตรวจคำอธิบายกับ source และเอกสารทางการ
- canonical checkout ปัจจุบันอยู่ branch `version2.1` ซึ่งต่างจาก target `version2.1.1` และมีงานค้างหลายไฟล์ จึงรักษา checkout เดิมไว้ ไม่มีการสร้าง/ลบ worktree
- ขั้นถัดไปที่แนะนำคือ read-only production measurement แบบจำกัดขอบเขต แล้วเลือก change ที่มีผลมากที่สุด การแก้ settings/scheduler/deploy ต้องขออนุมัติแยกตามข้อตกลงโครงการ

## แหล่งข้อมูลทางการที่อ่านในรอบนี้

- [Logs usage-based pricing, 25 September 2026](https://supabase.com/changelog/logs-usage-based-pricing)
- [Manage Logs Ingest usage](https://supabase.com/docs/guides/platform/manage-your-usage/log-ingest)
- [Manage Logs Query usage](https://supabase.com/docs/guides/platform/manage-your-usage/log-query)
- [Log Drain pricing](https://supabase.com/docs/guides/platform/manage-your-usage/log-drains)
- [Changelog index](https://supabase.com/changelog.md) — รวมการเปลี่ยน endpoint logs และ default log_connections

ราคาและช่วงผ่อนผันอาจเปลี่ยน ต้องตรวจอีกครั้งก่อนตัดสินใจใช้งบหรือเปลี่ยนระบบ
