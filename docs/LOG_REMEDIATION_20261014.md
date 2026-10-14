# Log remediation — local patch and production plan, 14 October 2026

## สถานะ

ผู้ใช้ขอแก้ตามผล review จึงทำ local frontend fixes และ read-only production checks บน branch `codex/list-log-optimization-20261014` จาก GitHub release `904baee581fa82ff5e146f87de81fb2b668e1c3a` ใช้ worktree เดิม `C:/SeaTH/Projects/flowmate/.worktrees/supabase-log-optimization-20261006` ไม่แตะ dirty source ใน canonical checkout

ผู้ใช้อนุมัติ commit/push/เปิด PR สำหรับ frontend และอนุมัติ cron config พร้อม restart แยกแล้ว วันที่ 14 ต.ค. 2026 apply `cron.log_statement=false` ผ่าน supported CLI พร้อม restart สำเร็จ ตรวจ effective setting=off, run history=on และ pending_restart=false แล้ว Frontend publication อยู่ในขั้น commit/PR; ยังไม่มี merge/deploy ของ frontend และไม่มี schema/job-schedule mutation หรือ test message ส่งออก production

Postmaster start เปลี่ยนจาก 2026-05-15 07:46:23.878861 UTC เป็น **14 ต.ค. 2026 18:28:32.461839 เวลาไทย** หลัง restart query กลับมาสำเร็จเวลา 18:28:46.510977 ไทย

## สิ่งที่แก้และหลักฐาน

### Full List coordinator

Reproduction ใช้ loader จริงใน VM และ mocked queries: เริ่มอ่าน List แล้วส่ง invalidation+caller เพิ่ม 14 ครั้ง ก่อนแก้สร้าง work-item queries 15 ชุดพร้อมกัน หลังแก้เริ่ม 1 ชุดและ follow-up 1 ชุด โดยทุก caller ได้ผลหลัง follow-up สำเร็จ การเปลี่ยนข้อมูลระหว่าง follow-up จะ queue รอบถัดไปและไม่เปิด parallel same-profile load

ก่อนแก้ full List cache ยังแชร์ pending request เมื่อ user เดิมเปลี่ยน member; regression คาด 2 reads แต่ได้ 1 หลังแก้ cache key รวม user/workspace/product/member/role/profile พร้อมตรวจ client และ user-object identity ผลที่ scope เปลี่ยนถูก reject ด้วย FLOWMATE_LIST_SUPERSEDED ทั้งก่อน related reads และก่อน sync globals; List/Attention/nav/search ไม่แสดง error จาก superseded request

คง TTL 30 วินาทีเดิม และ force bypasses settled rows ขณะที่ overlapping same-scope callers แชร์ flight ไม่เพิ่ม blanket cache TTL หรือยืด polling ทั้งแอป Promise.allSettled รอ related reads ทั้งหมดจบก่อน release flight เมื่อมี query error

Updated historical tests ที่เคยอนุญาต old/new List queries รันพร้อมกัน เปลี่ยน acceptance เป็น sequential fresh follow-up; คง checks ว่า final cached rows สดและผลแต่ละ caller แยกสำเนา ไม่ตัด test ด้าน isolation/freshness

### Stable List filters

Sort/deduplicate work-item IDs, users, members และ related-user IDs ใน List queries คง displayed row order และ response contract Tests ให้ work-item rows เรียงต่างกันแล้วตรวจว่าทุก related filter เหมือนกัน ขณะที่ display order ยังตาม API

### Local diagnostics และ Notifications

ต่อยอด buffer เดิมให้ `window.flowmateRequestDebug` เป็น alias ของ `flowmateBoardDebug` เพิ่ม consumer=board/list/notifications, List profile, realtime status และ reason จาก mount/poll/focus/reconnect/data-change ตลอดจน start/end/duration/shared/recent/follow-up/error ค่าเริ่มต้นปิด บัฟเฟอร์ 200 entries อยู่ใน memory ไม่เพิ่ม telemetry ไม่เก็บ raw identities, full URL, error message หรือ payload

List/Attention/nav/search/Notifications entry points ส่ง reason เข้า loader Notifications ยังคง left-joined request และ single-flight ที่ deploy ก่อนหน้า ไม่เพิ่ม legacy lookup fallback ไม่เปลี่ยน Notifications cadence ที่ยังไม่มี realtime coverage ครบ

วิธีใช้หลัง release: save drafts ก่อน reload main URL เอง แล้ว:

```js
window.flowmateRequestDebug.enable();
await window.flowmateRequestDebug.checkRelease();
// ทำ scenario ตาม route/focus/mutation แล้วตรวจ consumer/reason/profile/realtime
window.flowmateRequestDebug.snapshot();
window.flowmateRequestDebug.disable();
```

**Legacy caller ยังระบุไม่ได้:** export ไม่มี origin/tab/release/initiator และเว็บหลักปัจจุบันมี joined loader แล้ว การแก้ loader ใหม่ไม่เปลี่ยน JavaScript ที่โหลดอยู่ในแท็บเก่าอัตโนมัติ ยังต้องระบุ browser initiator/loaded script จริงแล้วค่อยแก้ deployment ที่เกี่ยวข้อง ไม่อ้างว่า plain queries หายจาก production แล้ว

### Status request

Direct Creative transition helper reject known same-status request ก่อน RPC (`FLOWMATE_STATUS_UNCHANGED`) หาก caller ส่ง currentStatus ที่เท่ากับ nextStatus คง server validation สำหรับ transition จริงและกรณีที่ client ไม่รู้ current status UI generic helper มี normalized same-status guard และ pending guards อยู่แล้ว จึงไม่เปลี่ยน permission หรือทำ server invalid transitions ให้ success

## Cron: concrete change ready for approval

Read-only CLI Management API checks บน project `jbavahimqjalvcfawgqw`:

| Setting | Current | Context | pending_restart |
|---|---|---|---|
| cron.log_statement | on | postmaster | false |
| cron.log_run | on | postmaster | false |
| cron.log_min_messages | warning | sighup | false |

pg_cron version **1.6.4** Current Management API `UpdatePostgresConfigBody` รองรับ `cron.log_statement` เป็น boolean และ `restart_database` เป็น boolean; ไม่รองรับ cron.log_run/min_messages ใน exposed update schema จึงไม่เสนอเปลี่ยนสองค่านั้น Current overrides GET ไม่คืนรายการ overrides

ข้อเสนอเฉพาะที่พร้อม review: ตั้ง **cron.log_statement=false** โดยคง cron.log_run=on และทุก job schedule/active/dispatcher/recovery logic เดิม ค่าต้อง restart จึงมีผล อาจ disconnect sessions ชั่วคราวและทำให้ job tick ระหว่าง maintenance ล่าช้า ต้องอนุมัติ production config และ maintenance/restart แยกจาก frontend publication

Upstream pg_cron v1.6.4 source ยืนยัน successful completion logging ถูก guard ด้วย CronLogStatement ด้วย จึงขยายจาก review แรกที่ยังยืนยันได้แค่ starting logs เป็น candidate สำหรับ **start+successful completion 308 records** ใน sample อย่างไรก็ตาม provider build/runtime อาจต่าง ต้องวัดหลัง apply ไม่อ้างว่าตัดได้แน่นอน 308/30.8% ของ production logs Numeric-only 69 records ยังไม่ระบุ producer และไม่รวมใน savings

### Proposed apply — ห้ามรันก่อนอนุมัติ

CLI command ต่อไปนี้เป็นแผนที่ review ก่อน approval (no-restart variant) สำหรับครั้งนี้ผู้ใช้อนุมัติ restart ทันที จึง execute update โดย **ไม่ใช้ --no-restart** และเพิ่ม `--yes` ตาม approval:

```powershell
# ตั้ง override เฉพาะ key; merge กับ overrides เดิม ไม่ replace และไม่ restart อัตโนมัติ
npx.cmd --no-install supabase postgres-config update --experimental --project-ref jbavahimqjalvcfawgqw --config "cron.log_statement=false" --no-restart
```

หลัง approved maintenance restart ด้วย supported platform action แล้วตรวจ pg_settings ว่า statement=off, log_run=on และ pending_restart=false เก็บช่วง logs ที่ขนาด/เวลาเทียบกันได้ พร้อมตรวจ cron.job_run_details/status/errors และ active jobs ไม่เรียก dispatcher/claim/provider message เพื่อพิสูจน์ idle งาน

การ restart ต้องได้รับ explicit approval ไม่ควรอ่านคำสั่ง --no-restart ว่าระบบถูกเปลี่ยน effective setting แล้ว และไม่เปลี่ยน config โดยไม่มีวัน/เวลาที่อนุมัติให้ restart

### Rollback — approval เช่นเดียวกับ apply

```powershell
npx.cmd --no-install supabase postgres-config update --experimental --project-ref jbavahimqjalvcfawgqw --config "cron.log_statement=true" --no-restart
```

Restart ใน maintenance window ที่อนุมัติแล้ว ตรวจ effective on, run history on, pending_restart=false และ schedules เดิม หากก่อน apply มี overrides ใหม่ ให้ revalidate baseline ก่อน ไม่ใช้ replace-existing-overrides/delete-all

### Applied command / effective verification

```powershell
npx.cmd --no-install supabase postgres-config update --experimental --project-ref jbavahimqjalvcfawgqw --config "cron.log_statement=false" --yes --output json
```

Response ยืนยัน cron.log_statement=false และ separate SQL verification ยืนยัน effective off, cron.log_run on, cron.log_min_messages warning, pending_restart false ทุกค่า พร้อม postmaster start ใหม่ ไม่ได้ execute rollback หรือเปลี่ยน run-history/min-level/schedules

Read-only preflight artifact: [log_ingestion_settings_preflight.sql](../supabase/log_ingestion_settings_preflight.sql) ไม่มี Vault access และไม่มี schema/cron mutation

## Validation และสิ่งที่รอ

- 133 tests ผ่านจาก 11 files: full List 8 new regressions, status no-op 1, Notifications diagnostics + existing Board/live refresh/profile/scope/cache tests
- Regression เดิมก่อนแก้: invalidation 14 ครั้งเปิด 15 reads; member scope expected 2 ได้ 1 ทั้งสอง fail และผ่านหลังแก้
- npm run build:github ผ่าน; regenerate เฉพาะ app.js และ screens-b.js
- git diff --check และ scoped secretlint ผ่าน
- ไม่ได้ทำ signed-in browser UAT หรือวัด production savings หลัง patch เพราะยังไม่ publish
- Full List/Notifications realtime degradation และ actual legacy origin ต้องวัดจาก session จริง; diagnostics ที่เพิ่มเป็นเครื่องมือหาสาเหตุ ไม่อ้างว่าแก้ connection stability แล้ว
- ไม่เพิ่ม batch RPC/pagination โดยยังไม่มี row count/latency ไม่เปลี่ยน CORS response headers, auth headers หรือ business SLA
- Cache stamps ยังไม่ bump; pre-commit hook จะจัดการเมื่อ publication ได้รับอนุมัติ
- Worktree retained รองรับ review/publication ไม่ cleanup ไม่สร้าง worktree เพิ่ม

## References

- Analysis: `C:/SeaTH/Projects/flowmate/docs/SUPABASE_LOG_REVIEW_20261014.md`
- Supabase Management API schema ตรวจ 14 ต.ค. 2026: https://api.supabase.com/api/v1-json
- pg_cron exact version source: https://github.com/citusdata/pg_cron/blob/v1.6.4/src/pg_cron.c
- Supabase Cron: https://supabase.com/docs/guides/cron
