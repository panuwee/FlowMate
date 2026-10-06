# FlowMate — ผลตรวจ production logs/settings

ตรวจวันที่ 6 ตุลาคม 2026 ประมาณ 14:20–14:30 น. Asia/Bangkok

## ข้อสรุปสำหรับตัดสินใจ

ควรเริ่มลดการเรียก Data API ซ้ำและจำนวน requests ต่อการ refresh ก่อนปรับ Postgres logging ตัวอย่าง logs ชุดล่าสุดมี API gateway (`edge_logs`) คิดเป็น **97.28% ของขนาดข้อความและ attributes ที่ serialize เป็น text** ขณะที่ Postgres ประมาณ 1.04% ตัวเลขนี้เป็น proxy เพื่อจัดลำดับงาน ไม่ใช่ billing ingestion bytes และไม่ใช่สัดส่วนทั้งเดือน

ตรวจ project `jbavahimqjalvcfawgqw` ชื่อใน Dashboard `workgrid-test`, branch `main`, สถานะ ACTIVE_HEALTHY ตรงกับ project ref ที่แอป FlowMate ใช้ ชื่อมีคำว่า test แต่การตรวจครั้งนี้ถือเป็น production ตามระบบที่ผู้ใช้ระบุ

ใช้ Supabase CLI 2.111.0 ที่มี login เดิมอ่าน pg_settings/cron metadata และใช้ Dashboard Logs Explorer อ่าน aggregate ของ logs ไม่อ่าน request bodies, headers, tokens หรือข้อมูลผู้ใช้รายคนออกมา ไม่มีการแก้ settings, schedule, source code, deploy, commit หรือ push

## หลักฐานจาก logs สด

ใช้ Logs Explorer ช่วง **Last hour** ต่อ query ไม่ใช่ช่วงเวลาตายตัวเดียวกันทุก query ดังนั้นห้ามนำ counts ต่างตารางมาหารกันเป็นอัตราเดียวกัน ชุดสุดท้ายมี edge events เวลา 06:27:29.941–07:26:57.348 UTC หรือ 13:27:29.941–14:26:57.348 น. กรุงเทพฯ

| Source | Entries | Message bytes | Attributes text bytes | รวมเพื่อเปรียบเทียบ |
|---|---:|---:|---:|---:|
| edge_logs (API gateway) | 2,760 | 1,576,962 | 12,741,749 | 14,318,711 |
| postgres_logs | 237 | 28,424 | 124,372 | 152,796 |
| postgrest_logs | 138 | 17,035 | 27,462 | 44,497 |
| auth_logs | 40 | 12,943 | 20,336 | 33,279 |
| auth_audit_logs | 19 | 10,990 | 16,760 | 27,750 |
| function_edge_logs | 28 | 2,585 | 64,325 | 66,910 |
| workflow_run_logs | 22 | 1,797 | 4,862 | 6,659 |
| pgbouncer_logs | 13 | 1,655 | 2,119 | 3,774 |
| supavisor_logs | 30 | 1,414 | 24,396 | 25,810 |
| function_logs | 56 | 756 | 32,084 | 32,840 |
| realtime_logs | 7 | 510 | 4,666 | 5,176 |
| storage_logs | 1 | 133 | 1,044 | 1,177 |
| **รวม** | | | | **14,719,379** |

`length(event_message) + length(toString(log_attributes))` รวม metadata ที่ query ได้ แต่ไม่ใช่สูตร meter ของ Supabase: serialization, fields อื่น และวิธีคิด ingestion อาจต่างกัน ไม่ใช้ค่านี้คูณ 24/30 วันเพื่อยืนยันค่าใช้จ่าย

### Routes ที่ถูกเรียกสูงใน query ก่อนหน้า

สถานะ 200 ทั้งหมดในรายการนี้; counts รวมวิธีเรียกที่ route เดียวกัน รวมถึง OPTIONS ได้ ไม่ใช่จำนวน business reads ล้วน

| Route | Entries ใน rolling hour ของ query นั้น |
|---|---:|
| /rest/v1/work_items | 603 |
| /rest/v1/users | 196 |
| /rest/v1/work_item_flags_v | 194 |
| /rest/v1/notifications | 176 |
| /rest/v1/team_members | 163 |
| /rest/v1/creative_request_details | 122 |
| /rest/v1/checklist_items | 117 |
| /rest/v1/latest_assignment_run_v | 103 |
| /rest/v1/marketing_content_items | 93 |
| /rest/v1/flowmate_creative_kpi_progression_v | 93 |

อีก query แยก method/status พบ GET 200 = 1,690, OPTIONS 200 = 614, POST 200 = 239, POST 204 = 17 รวมถึง GET 500 = 3 และ POST 400 = 1 จึงไม่ใช่หลักฐานของ error storm ในตัวอย่างนี้ แต่ error ที่มีควรตรวจแยกเมื่อมีอาการหรือเกิดซ้ำ ตัวเลขรวมอาจมี traffic จากการใช้งานเครื่องมือ/การตรวจครั้งนี้ด้วย ยังไม่ได้แยก caller หรือ active session

OPTIONS เป็น CORS preflight ไม่ใช่ business operation เพิ่มอีกหนึ่งงาน ให้ลด request fan-out และตรวจ caching ของ preflight ตามการรองรับจริง ไม่ปิด CORS/Auth/RLS และไม่เพิ่ม proxy เพียงเพื่อหลบ preflight โดยไม่ประเมินต้นทุน

### Postgres logs และ cron

query จัดหมวดด้วย keyword พบ cron 148 entries / message 23,357 bytes, checkpoint 23 entries / 3,139 bytes, other 63 entries / 1,291 bytes หมวดนี้เป็นการจัดแบบข้อความ ไม่ใช่ severity classification หรือการยืนยันชนิดทุก entry

จาก cron.job_run_details ช่วง 06:26–07:25 UTC:

| Job | Schedule | Active | Runs / status |
|---|---|---|---|
| creativebot-dispatch-every-minute | ทุกนาที | true | 60 / succeeded |
| battle-pass-recovery-observe-10m | ทุก 10 นาที | true | 6 / succeeded |
| battle-pass-seatalk-15m | ทุก 15 นาที | true | 4 / succeeded |
| activity-production-30m | ทุก 30 นาที | true | 2 / succeeded |
| battle-pass-production-30m | ทุก 30 นาที | true | 2 / succeeded |

CreativeBot command มี marker `flowmate-creative-ready-v1` จริง ยืนยันว่ามี gate ใน cron ที่ติดตั้ง แต่ไม่ได้ทดสอบส่งข้อความหรือยืนยัน gate body ทั้งหมดในรอบนี้ `succeeded` หมายถึง cron SQL สำเร็จ ไม่ได้ยืนยัน HTTP downstream หรือ SeaTalk delivery และ 148 log entries เท่ากับสองเท่าของ 74 cron runs เป็นความสอดคล้องของจำนวน ไม่ใช่การผูกทุก log กับทุก run

## Effective settings ที่อ่านได้

| Setting | ค่า | คำแนะนำ |
|---|---|---|
| log_statement | ddl | คงไว้ก่อน ไม่ใช่ all/mod ที่ log ทุก read |
| log_min_duration_statement | -1 | ปิดอยู่ การเปลี่ยนเป็น 500–1,000 ms จะเพิ่ม slow-query logs ไม่ใช่ลด ingestion |
| log_min_messages | warning | คงไว้ ไม่ได้เปิด debug |
| log_min_error_statement | error | คงหลักฐาน error |
| log_connections / log_disconnections | off / off | ไม่มีงานลดจากจุดนี้แล้ว |
| log_duration | off | ไม่ได้บันทึก duration ทุก statement |
| log_temp_files | -1 | ปิดอยู่ |
| log_autovacuum_min_duration | 600000 ms | บันทึกงานยาวเกิน 10 นาที ไม่ใช่ทุกงาน |
| log_lock_waits | on | คงไว้เพื่อวินิจฉัย lock; ยังไม่มีหลักฐานว่าเป็นตัวสร้างปริมาณหลัก |
| pgaudit.log | none | ไม่ได้เปิด statement audit ผ่านค่านี้ |
| cron.log_statement | on | ผู้สมัครลด cron statement noise ลำดับรอง |
| cron.log_run | on | คงไว้เพื่อเก็บ job_run_details ตรวจสำเร็จ/ล้มเหลว |
| cron.log_min_messages | warning | คงไว้ |

settings ที่อ่านทั้งหมดไม่มี pending_restart และ role/database logging overrides ที่พบมีเพียง `log_statement=none` ของ supabase_admin, supabase_auth_admin, supabase_storage_admin ค่า runtime ของ session ที่อ่านได้ไม่รับประกันว่าไม่มี code ใดตั้งค่าเฉพาะ session อื่น จึงประกอบกับ logs จริงในการสรุป

## แผนลด ingestion ที่แนะนำ

### P1 — ลด refresh และ request fan-out

หลักฐาน local: `supabase-list-data.js:129` มี timer refresh 60 วินาที แม้ Realtime connected, `:398` มี cache TTL 30 วินาที และ `:450` โหลด flags/users/members/details/checklist/ข้อมูลประกอบผ่านหลาย requests ภายใน Promise.all ตรงกับ routes ที่มีปริมาณสูง แต่ยังต้องวัด caller จริงเพื่อระบุว่าแต่ละ screen สร้างสัดส่วนเท่าใด

- ทดลอง safety polling 3–5 นาทีเมื่อ Realtime connected; fallback 60 วินาทีเมื่อ degraded และ refresh เมื่อกลับแท็บ/กดเอง
- รวม concurrent requests ที่เหมือนกันด้วย shared in-flight cache และ invalidate เฉพาะข้อมูลที่เปลี่ยน ลดการ refresh ทั้งชุดเพราะ event ที่ไม่เกี่ยวข้อง
- แยก cache ของข้อมูลแสดงผล users/team_members ที่เปลี่ยนไม่บ่อยออกจาก work-item state เริ่ม TTL สั้นตามความต้องการจริง เช่น 2–5 นาที และ invalidate เมื่อแก้สมาชิก/สลับ workspace/เปลี่ยน auth ห้ามใช้ cache นี้เป็นตัวตัดสินสิทธิ์ ต้องตรวจ server-side เสมอ
- ใช้ summary/operational profile ที่มีอยู่ตามหน้า ไม่โหลด comments/checklist/history/detail หากหน้าไม่ได้แสดง
- notification count/list และ KPI โหลดตาม freshness ที่ธุรกิจต้องใช้ ไม่ให้ทุกหน้าที่ mount สร้าง timer ซ้ำโดยไม่จำเป็น
- หากยังมีหลาย requests ต่อ refresh มากหลังแก้ข้างต้น ค่อยพิจารณา aggregate RPC ที่รักษา RLS/authorization เดิม แทนการยัดทุกอย่างใน RPC ตั้งแต่แรก

เป้าหมาย pilot ที่เสนอ: ลด successful read/preflight requests ต่อ active session ลง 30–50% โดยไม่มีข้อมูลตกหล่น ตัวเลขเป็น acceptance target ที่ต้องพิสูจน์ ไม่ใช่ผลประหยัดที่วัดแล้ว การเพิ่ม interval 60→300 วินาทีลดเฉพาะ timer-driven refresh ได้ 80% ในสภาวะคงที่ ไม่เท่ากับลด ingestion ทั้งหมด 80%

### P2 — cron noise และ idle dispatch

- ตรวจว่า hosted Supabase อนุญาตปรับ `cron.log_statement` ผ่านช่องทางใดและต้อง restart หรือไม่ ก่อนเสนอ apply `off`; คง `cron.log_run=on` และตรวจ cron failures ได้ต่อ ห้ามแก้ config ที่ไม่รองรับโดยเดา
- ขนาด Postgres logs ทั้งชุดคิดเป็นราว 1.04% ของ proxy sample จึงไม่ควรคาดหวังผลลดรวมสูงจาก cron logging เพียงอย่างเดียว
- CreativeBot มี gate marker แล้ว จึงไม่สร้างงานทำซ้ำโดยไม่มีเหตุ
- ตรวจ due-outbox gate สำหรับ Activity/Battle Pass notifier ต่อจาก deployed definition จริง หากพบ dispatch คิวว่างจึงแก้ โดยรักษา retries, cutoff, notification delivery และ latency เดิม รอบนี้ยืนยัน cron active แต่ไม่ได้ยืนยันทุก function body หรือ due queue
- งาน discovery/recovery มีหน้าที่ของตัวเอง ไม่หยุดเพียงเพราะ outbox ว่าง

### P3 — รักษา error/audit และวัดผล

- ยังไม่แนะนำลด log_statement จาก ddl เป็น none, ปิด lock warnings หรือเอา error logs ออก เพื่อไล่ตามโควต้า เพราะหลักฐานชี้ว่า API gateway เป็นตัวหลัก
- การลด browser console.log ไม่ลด gateway logs; function_logs มีขนาดเล็กใน sample การ sample function success/debug จึงเป็นงานรอง
- วัด billing Usage รายวันของ project 24–48 ชั่วโมงหลังเปลี่ยน และติดตามหลายวันเทียบ active sessions/requests โดยแยกวัน deploy/debug; ยอดสะสมไม่ย้อนลด
- ตรวจ freshness, reconnect, hidden/visible tabs, workspace switch, permission changes, pending/retry notifications และ duplicate/missed deliveries ก่อน publish
- ตรวจหนึ่งช่วง peak และหนึ่งช่วง idle เพิ่มเมื่อทำ pilot เพื่อไม่เหมาว่าหนึ่งชั่วโมงแทนทั้งเดือน รอบนี้หยุดที่ aggregate หนึ่งชั่วโมงหลายมุมมอง เพื่อลดการสแกน logs ที่ไม่จำเป็น

## Queries สำหรับทำซ้ำแบบมีขอบเขต

ใช้ใน Logs Explorer โดยตั้งช่วงเวลาให้แคบก่อนรัน (ตัว query นี้พึ่ง UI time range):

```sql
select source,
       count() as entries,
       sum(length(event_message)) as message_bytes,
       sum(length(toString(log_attributes))) as attribute_text_bytes,
       min(timestamp) as first_event,
       max(timestamp) as last_event
from logs
group by source
order by message_bytes desc
limit 15
```

```sql
select extract(event_message, 'https?://[^ /]+([^ ?|]+)') as route,
       extract(event_message, '[|] ([0-9]{3}) [|]') as status,
       count() as entries,
       sum(length(event_message)) as message_bytes
from logs
where source = 'edge_logs'
group by route, status
order by entries desc
limit 25
```

Query dialect คือ ClickHouse บน Logs Explorer ไม่ใช่ PostgreSQL SQL Editor; route regex ตัด query string ออกเพื่อลดการดึงข้อมูลส่วนบุคคล/parameters ออกมา แต่ path อาจมี identifier ในระบบอื่นได้

## ขอบเขตและสถานะส่งมอบ

ตรวจ production logs/settings สำเร็จแบบ read-only และอัปเดตรายงาน ไม่แก้ runtime settings/cron/application ไม่รีเซ็ตสถิติ ไม่ส่งข้อความหรือเรียก business mutation ใด ๆ CLI แสดงขั้นตอน Initialising login role ตามกลไกเชื่อมต่อของเครื่องมือ และการเปิด Dashboard/รันคำอ่านอาจสร้าง access/audit logs ของตัวเอง ไม่มีการอ้างว่า inspection สร้าง zero logs

ยังไม่อ่าน billing daily breakdown สด จึงไม่ยืนยันว่าตัวอย่างตรงกับสัดส่วนของยอด 1.061 GB ในภาพหรือยอดรอบบิลทั้งหมด ไม่มี test/build เพราะแก้เฉพาะเอกสาร ตรวจไฟล์และตัวเลขก่อนส่งมอบ คง checkout เดิม ไม่มีการสร้าง/ลบ worktree

เอกสารรอบแรกและแหล่งอ้างอิงราคา: [Supabase log usage review](SUPABASE_LOG_USAGE_REVIEW_20261006.md)
