# FlowMate log optimization rules — 8 October 2026

## ขอบเขตและสถานะ

ตรวจทั้ง 7 ข้อและแก้ส่วนที่มีหลักฐานรองรับ ผู้ใช้อนุมัติรวม commit/push ครั้งเดียว โดยยอมรับให้ระบุรายการวัดหลัง deploy แยกไว้ ชุดนี้ต่อยอด PR [#17](https://github.com/panuwee/FlowMate/pull/17) ไม่มี merge/deploy หรือ production SQL และไม่อ้างว่าลด logs จริงแล้ว

| ข้อ | ผลตรวจ/สิ่งที่ทำ | ต้องวัดหลัง deploy |
|---|---|---|
| 1. Board refresh | Single-flight ครอบคลุม user/member/role/workspace/product/lane limits/client/auth object; mutation queue ไม่ถูกทิ้ง ทุก full load ผ่าน loader เดียว | Mount, focus, reconnect, mutation, manual และหลายแท็บ; caller ที่เปลี่ยน scope ต้องไม่แสดงผลเก่า |
| 2. Client version | Main URL ทั้ง root/home/product-book ตอบ 200 และใช้ joined Notifications; เพิ่ม `checkRelease()` เทียบ 4 asset stamps ตามที่โหลดจริง | ระบุ legacy caller ด้วย Network initiator/loaded scripts ของแท็บจริง; save draft ก่อนผู้ใช้ reload เอง |
| 3. Freshness | Passive callers ใช้ผลสำเร็จได้ 2 วินาที; manual ไม่ใช้ settled cache; data/auth/workspace change invalidates | Mutation ระหว่างโหลดและหลัง follow-up ต้องได้ข้อมูลใหม่; pagination/scroll ต้องคงเดิม |
| 4. Fan-out | Related data โหลดครั้งเดียวหลังรวม lanes; sorted/deduplicated work-item/user/member IDs ทำให้ query URL ของชุดเดียวกันคงที่; ตรวจ batch RPC แล้ว ยังไม่เพิ่ม | เปรียบเทียบ count/latency หลัง coordination ก่อนตัดสิน RPC; ไม่ใช้ global limit ที่ทำให้ lane บางอันหาย |
| 5. CORS | Representative OPTIONS ตอบ 200, allow headers apikey/authorization/x-client-info และ max-age 3600; ปรับ ID ordering ฝั่ง client | เก็บ actual requested headers/URL/context และ preflight repeats ใน browser; current response ไม่พิสูจน์ incident cache miss |
| 6. Observability | เพิ่ม opt-in memory ring buffer 200 events; tab alias, asset versions, route category, scope alias, refresh reason, start/end/duration, shared/recent/follow-up/error | Trace หลังใช้งาน patch; ค่าเริ่มต้นปิด ไม่มี server telemetry |
| 7. Cron | ตรวจ jobs/dispatcher bodies/24h executions/aggregate ready queues; idle gates มีอยู่แล้ว; คง cadence และ recovery | ตกลง business SLA ก่อนเปลี่ยน cadence; DB job duration ไม่ใช่เวลาทำงานของ HTTP worker |

## กฎที่ต้องคงไว้

1. ลด requests ที่เกิดซ้ำก่อนลดระดับ logs; อย่าปิด error/security logs เพื่อให้ตัวเลขดูดี
2. แชร์ request เฉพาะ scope เดียวกัน ผลต้องเป็นคนละสำเนา; UI filters ที่กรองผลฝั่ง browserไม่เปลี่ยน shared data และไม่เพิ่มสิทธิ์
3. Manual refresh อ่านใหม่หลัง flight จบ; mutation/data-change invalidate recent data และ queue follow-up ได้ แม้ change เกิดระหว่าง follow-up
4. ไม่ใช้ cache ข้าม account/workspace/product; ไม่แชร์ข้อมูลข้ามแท็บด้วย localStorage
5. คง lane order, per-lane pagination และ summary contract; related ID sorting เปลี่ยน URL filter order ไม่เปลี่ยน row order
6. ไม่ตัด Authorization/apikey เพื่อเลี่ยง OPTIONS; ไม่เปลี่ยน CORS โดยเดา ไม่อ้าง max-age ว่าบราวเซอร์ต้อง cache ตามนั้นเสมอ
7. Version check เป็นคำสั่ง manual ที่อ่าน HTML จาก main deployment เท่านั้น ไม่มี auto polling หรือ forced reload; incomplete/unstamped assets ให้สถานะ unknown
8. Diagnostic buffer ปิดตามค่าเริ่มต้น เก็บในหน่วยความจำ ไม่บันทึก tokens, user/work-item IDs, full URLs, bodies หรือ error messages; auth/sign-out/workspace change ล้าง buffer; disable ล้าง buffer
9. ไม่เรียก dispatcher/claim/recovery เป็น test; ใช้ read-only aggregate checks และคง idle gate/expired lease handling
10. ถ้าต้องเพิ่ม batch RPC ให้ SECURITY INVOKER, explicit search_path, bounded per-lane limits, คง RLS; ทดสอบ permissions/order/nulls/pagination/failure/response contract ก่อนขออนุมัติ apply SQL แยก

## วิธีวัดหลัง release

หลังตรวจ deploy และ live hashes แล้ว ผู้ใช้ save draft และ reload URL หลักเอง เปิด Developer Console:

```js
window.flowmateBoardDebug.enable();
await window.flowmateBoardDebug.checkRelease();
```

ทำกิจกรรม mount → focus → reconnect → mutation → manual refresh แล้วอ่าน:

```js
window.flowmateBoardDebug.snapshot();
window.flowmateBoardDebug.disable();
```

`request` คือ caller, `start` คือ full load จริง, `shared` คือร่วม flight, `recent` คือ reuse ภายใน 2 วินาที และ `follow-up` คือ mutation ที่ต้องอ่านต่อ Buffer ยาวสูงสุด 200 events จึงควรเก็บ snapshot หลังแต่ละ scenario ก่อนข้อมูลเก่าถูกทับ ไม่มี API logging เพิ่ม

`checkRelease()` เปรียบเทียบ app.js, screens-b.js, supabase-list-data.js และ supabase-quick-task.js ของแท็บปัจจุบันกับ HTML ล่าสุด ไม่พิสูจน์ content hash ของ script และไม่ตรวจแท็บอื่น ผล update-available ให้ save งานทุก draft ก่อน reload เอง ผล current ไม่พิสูจน์ว่า caller ใน export เดิมเป็น version นี้

เก็บ request counts/durations/HTTP status และ Network initiator ของ Board/Notifications/preflight แยกแต่ละ tab/release โดยไม่เผย Authorization/cookies/response bodies หลีกเลี่ยงส่ง HAR ดิบ เก็บ logs ช่วงที่เลือก 30–60 นาทีและตรวจ export cap ก่อนคำนวณอัตราต่อชั่วโมง

เกณฑ์: 14 overlapping callers ใน scope เดียวต้องมี lane reads 5 + summary 1 (กรณีเริ่มต้น 50 rows/lane), mutation ต้องได้ follow-up, manual ต้องอ่านใหม่หลัง flight จบ และ scope change ต้องไม่แสดงผลเก่า การเพิ่ม lane limits อาจต้องมีหลาย page reads ตาม contract

## ผล production read-only วันที่ 8 ตุลาคม 2026

| Cron | Cadence | Runs ย้อนหลัง 24h | Failed | Mean DB job ms |
|---|---|---:|---:|---:|
| CreativeBot dispatcher | 1 นาที | 1440 | 0 | 9.69 |
| Battle Pass production | 30 นาที | 48 | 0 | 60.03 |
| Battle Pass recovery observer | 10 นาที | 144 | 0 | 20.67 |
| Battle Pass SeaTalk | 15 นาที | 96 | 0 | 214.43 |
| Activity production | 30 นาที | 48 | 0 | 62.13 |
| WCC dispatcher | 1 นาที | 1440 | 0 | 8.68 |

CreativeBot cron มี ready-outbox predicate; WCC คง expired-lease reconciliation พร้อม paused/ready gate; Battle Pass SeaTalk มี due/expired-lease idle gate; Battle Pass และ Activity มี enable guards ณ เวลาอ่าน CreativeBot/WCC/Battle Pass SeaTalk ready queues = 0 และ WCC/Battle Pass SeaTalk expired leases = 0 นี่เป็น snapshot ไม่ใช่หลักฐานว่าไม่มีงานตลอด 24h หรือว่า worker ถูกปิด

ไม่มี business SLA ใหม่ จึงคง 1/10/15/30 นาทีตาม configured cadence ไม่ปิด job logging แบบ project-wide ใน spike มี cron เพียง 6 รายการจาก 282 จึงไม่ใช่เป้าหมายแรก

## Batch RPC decision

ยังไม่เพิ่ม RPC ตามลำดับคำแนะนำเดิม: local regression ลด repeated lane reads จาก 70 เป็น 5 ด้วย coordinator แล้ว แต่ยังไม่มี authenticated browser latency/row distribution หลัง deploy ที่พิสูจน์ว่าหนึ่ง Board load ช้าเพราะ fan-out การรวมทุก lane เป็น query เดียวด้วย global limit ทำให้ pagination ผิด; RPC ใหม่ต้องมี SQL installation และ production approval แยก

ถ้าผลวัดหนึ่ง full load ยังมี round-trip/DB time สูง ให้เปรียบเทียบ bounded per-lane RPC + existing summary กับ baseline ที่ scope/row counts เท่ากัน รวม related payload เฉพาะที่พิสูจน์คุ้มค่า ห้ามเปลี่ยน auth เป็น SECURITY DEFINER เพื่อเพิ่มความเร็ว การตัดสินนี้เป็นการตรวจข้อ 4 ครบในขั้นปัจจุบัน ไม่ใช่การอ้างว่า batch RPC ถูก deploy

## ข้อจำกัด

Validation: tests ที่เกี่ยวข้องผ่าน 116 ข้อจาก 8 files (mock/VM ไม่มี production network); build:github ผ่านและ regenerate เฉพาะ screens-b.js; diff check ผ่าน ครอบคลุม coordination/mutation/freshness/scope isolation, bounded/private diagnostics, version mismatch/missing stamps/unsupported origin/no reload, refresh reasons และ stable/deduplicated related filters

- Historical trigger ของ 11:40 ยังระบุไม่ได้เพราะ export ไม่มี release/origin/tab/initiator; 1,000 rows อาจเป็น export cap
- Browser tool ไม่พร้อม (trusted Node process exited) จึงยังไม่มี signed-in browser UAT/incident headers
- ไม่มีผลลด billing/production logs ที่วัดแล้ว ต้องวัดหลัง merge/deploy ที่อนุมัติแยก
- Worktree เดิมถูกเก็บไว้รองรับ PR review และ release ไม่ cleanup
