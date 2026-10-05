# Workgrid Control Center — Implementation Plan

วันที่: 5 ตุลาคม 2026 · สถานะ: v0.6 — แผนสำหรับ review ก่อนอนุมัติ implementation

อ้างอิง: [Product & System Spec](WORKGRID_CONTROL_CENTER_SPEC_20261005.md)

แผนเดิมเป็นเอกสาร review; หลังผู้ใช้ระบุ pilot และสั่ง “ok please proceed next step” ได้ดำเนินการ implementation/verification แบบ local แล้ว ดู [Local handoff](WORKGRID_CONTROL_CENTER_LOCAL_HANDOFF_20261005.md) และ [Orchestration log](WORKGRID_CONTROL_CENTER_ORCHESTRATION_20261005.md) ยังไม่อนุมัติ production SQL, ส่งข้อความจริง, commit, push หรือ deployment

## 1. ขอบเขตที่ยืนยันแล้ว

- รุ่นแรก: CR + QT + Activity Automation notifications
- Admin apply; team lead view/propose ภายในทีมตนเอง
- ใช้ Bot และ integration เดิม; ไม่สร้าง Bot ใหม่เป็นค่าเริ่มต้น
- เพิ่ม Bot Settings สำหรับ App ID/credential reference และ Add/Activate/Deactivate/Remove connection ภายใน Workgrid
- Team Member profile มี Fulltime/Freelance และ SeaTalk identity/Bot/group bindings โดย reuse canonical member/role
- Bot ผู้ใช้ยืนยัน: Creative Bot / `OTg1MjIwNzY0OTY3` สำหรับ CR→GD/VE; FlowMate / `NTgyNzAzMjc5MjE4` สำหรับแจ้ง Operations เมื่อสร้าง CR และ Notification ของ Task Assign
- กลุ่มตั้งต้นที่ผู้ใช้ระบุ: FCOTH Operation / Operations / `ODg5NDI1MDQwODI3` / FlowMate; App ID ยืนยันแล้ว แต่ tenant verification ยังรอตรวจ
- QT ใช้ FlowMate ยืนยันแล้ว; ผู้รับอิง QT rule/member binding ไม่ใช้กลุ่ม Operations เป็นปลายทางทุก QT โดยปริยาย; แยก CR creation/output event ที่แจ้ง Operations จาก assignment event ที่แจ้ง GD/VE
- Creative Bot: Assign → actual Assignee; เพิ่ม Review → actual Requester จาก status transition ที่ commit สำเร็จ; ทำ producer/claim/template รองรับครั้งแรก แล้วใช้ event profiles ผ่าน UI ได้โดยไม่แก้โค้ดรายคน
- Boss/Review ใช้กลุ่ม Freelance ของ Boss; `aaaaaabbbbbb` เป็นตัวอย่างไม่ใช่ destination พร้อมใช้; ไม่ส่งทุก Review ไป Boss
- ผู้ใช้ยืนยันว่า Review Notification ยังไม่เคยทำ: เป็น new implementation ในรุ่นแรก ตั้งสถานะ planned/not implemented จน producer/claim/requester/template/UI/tests พร้อม และไม่ให้ Activate ก่อนพร้อม
- ไม่เปิด Automation/Modules/AI write controls ในรุ่นแรก
- Pilot ล่าสุด: Pond Fulltime (ผู้ใช้แจ้งว่าทดสอบแล้ว), Folk Freelance / Group ID `Njk2MTczMDEwNTg2`, Admin Panu; Boss ยังเป็นตัวอย่างกติกา ไม่ใช่ผู้ทดสอบปัจจุบัน
- Panu เป็นเจ้าของ credentials ทั้งสอง Bots; กลุ่ม Marketing/eSports รอกรอกผ่าน UI
- Activity success เฉพาะสร้างครบชุดตาม expected outputs ของ run; partial ไม่ส่ง success
- กลุ่ม Freelance แจ้งเฉพาะ Task เข้ามาหรือ Task ให้รีวิว ใช้ข้อความขั้นต่ำ ไม่แนบเนื้อหางาน/ไฟล์/logs

## 2. แนวทาง implementation

สร้าง configuration service และ UI กลาง แล้วต่อ adapter เข้าระบบส่งเดิมทีละตัว ไม่ย้าย workers/outboxes ทั้งหมดในรอบเดียว

Shared components ที่ต้อง reuse: authentication, effective permissions, team/member identities, Activity Monitor contracts และ approved message templates หลังตรวจสัญญาจริง

ออกแบบ read model รวมประวัติ แต่เก็บ source identifiers และสถานะดิบเดิม เพื่อไม่ทำให้การวิเคราะห์ delivery หายไป

## 3. ขั้นงานและหลักฐานจบแต่ละขั้น

### P0 — ตรวจ baseline และ contracts

งาน:

- ตรวจ branch, dirty files, worktrees, chat/process usage ที่เกี่ยวข้อง และ remote state แบบสด
- ยืนยัน GitHub `https://github.com/panuwee/FlowMate.git` / target `version2.1.1`; ไม่สมมติว่า remote ชื่อ origin เป็น GitHub
- อ่าน `docs/GIT_WORKTREE_MANAGEMENT_20261002.md` ก่อนตัดสินใจ reuse/isolation; snapshot ในเอกสารไม่แทน live check
- root และหลาย worktree มีงานค้าง: เปรียบเทียบ source ที่ต้องใช้และเลือก baseline โดยไม่ switch/reset/overwrite
- มี task worktrees เกิน limit ที่กำหนดจากการสำรวจเดิม ต้อง recheck ก่อนสร้างเพิ่ม; การ cleanup ต้องมี scope แยก
- inventory Bot app identity/capability, routes, groups, event producers, outboxes, claim/finish contracts และ permissions
- ตรวจ canonical Team Member/Role/lifecycle, field Fulltime/Freelance ที่มีอยู่ และ identity mapping SeaTalk ID เทียบ employee code; ห้ามสร้างสิทธิ์อีกชุด
- ตรวจ App IDs ทั้งสองกับ credential references/capabilities และ FlowMate กับกลุ่ม FCOTH Operation ที่ระบุ; แยก user-provided identity/readiness ออกจาก evidence จริง
- แยก CR Assigned, QT Assigned และ Activity events; ตรวจ in-app notification กับ SeaTalk delivery แยกกัน
- ตรวจ source ของ review transition/event ID/review rounds และ canonical requester; claim เดิมตรวจ assigned+assignee จึงต้องเปลี่ยนแบบ event-aware ไม่ใส่ Review ลงคิว assignment แล้วปล่อยถูก cancel
- ตรวจ production settings/shared coupling แบบ read-only เมื่อมี authorization/access แล้ว ไม่ส่ง provider message และไม่ claim คิว

ผลส่งมอบ: baseline manifest, compatibility map, event matrix และ permission/capability gaps

ผ่านเมื่อ: รู้ authoritative source ของแต่ละ adapter, ขอบเขต migration และเส้นทางที่อาจส่งซ้ำ พร้อมรายการสิ่งที่ยังไม่ยืนยัน

### P1 — Finalize UX และ acceptance

งาน:

- ยืนยัน Bot mapping, pilot recipients/groups, Activity success semantics และ QT audiences
- ใช้ Design Opening Prompt ใน spec ออกแบบ flow จริงกับ style ของแอปที่ render อยู่
- prototype ด้วยข้อมูลจำลอง: Fulltime/Freelance, group connection, rule editing, proposal/review, delivery detail
- เพิ่ม Bot Settings fields/lifecycle และ Team Member detail ที่แสดงหลาย Bot bindings พร้อม Group ID; preview deactivate/remove impact และสถานะ unknown
- ตรวจเส้นทาง Admin/team lead และ empty/loading/error/conflict/uncertain states
- กำหนดข้อความและ scope ของ approved templates รวมข้อมูลที่อนุญาตในกลุ่ม external
- ออกแบบ Situation/event profiles แบบเลือกหลายเหตุการณ์ และแสดง dynamic audience (Assignee/Requester) ชัดเจน พร้อม preview ผู้รับตัวอย่างตาม CR จริงที่มีสิทธิ์

ผลส่งมอบ: reviewable prototype/หน้าจอ พร้อม acceptance matrix ที่ผูกกับ spec

ผ่านเมื่อ: เพิ่มคน เปลี่ยนกลุ่ม และหาสาเหตุส่งไม่ได้ทำได้ผ่าน flow โดยผู้ใช้ไม่ต้องรู้ group ID/employee code ทุกขั้น

### P2 — Configuration backend และ permissions

งาน:

- กำหนด entity/keys สำหรับหลาย Bot และทีม พร้อม compatibility mapping ของ routes เดิม
- Bot registry ใช้ App ID ที่ป้องกันซ้ำต่อ environment/tenant และ lifecycle draft/active/inactive/archived; remove เก็บ reference/history
- reuse member roles/status เดิม; เพิ่ม employment type/identity mapping เท่าที่ขาด และ binding หลาย Bot โดยไม่ให้ notification role แก้ member permissions เอง
- SeaTalk backend connection layer ใช้ approved credential reference, token cache/refresh ต่อ app/environment และ verification evidence; ไม่คืน secret/token ให้ browser
- Check connection ไม่ส่งข้อความและไม่อ้างว่า token ผ่านเท่ากับทุก permission/Online ผ่าน; platform operation ที่ไม่มี API ยืนยันให้ใช้ Console-assisted flow
- เพิ่ม versioned configuration, verification evidence, proposal และ audit
- เพิ่ม member+bot+event subscriptions แยกจาก recipient routes และ global rule templates; runtime ใช้ config revision ใหม่โดยไม่ deploy พร้อม cache invalidation/cutoff
- backend ตรวจ Admin apply กับ team-lead propose ทุก operation; ตรวจ team scope จาก trusted context
- preview เป็น pure operation; test เป็น action แยกสำหรับ Admin มี test label, rate cap และ audit
- ใช้ controlled backend API สำหรับ private configuration ไม่เปิด credential/private-table writes ให้ browser
- ตรวจ Supabase/Postgres docs ล่าสุดก่อนเขียน schema/API; migration แบบ additive และ local transactional rehearsal ก่อน production
- permission regression checks: unauthenticated, non-admin, wrong team, direct request และ stale role

ผลส่งมอบ: migrations/API contracts, isolated tests และ rollback procedure

ผ่านเมื่อ: request ที่ข้ามสิทธิ์ถูกปฏิเสธจริง; concurrent changes ได้ conflict; ไม่มี secret ใน client/log/document

### P3 — Notification adapters และ delivery controls

งาน:

- CR: ต่อ route resolver ใหม่ผ่าน adapter และคง Assigned card/mention behavior; เพิ่ม Review event/template/claim gate ที่ resolve actual requester ของ review instance
- domain event/outbox เขียนสัมพันธ์กับ transaction งาน ใช้ event ID/review instance ป้องกัน duplicate; assignment claim rule เดิมห้ามใช้กับ Review โดยไม่เปลี่ยน semantics
- Review ที่จบ เปลี่ยน requester หรือเปลี่ยนรอบก่อนส่งต้อง cancel stale instance; รอบใหม่แจ้งได้ใหม่แต่แก้ข้อมูลทั่วไปขณะ Review ไม่แจ้งซ้ำ
- QT: ใช้ FlowMate App ID `NTgyNzAzMjc5MjE4` ต่อ event หลัง assignment commit; cross-team รอ dispatcher ไม่ส่ง Assigned ก่อนเวลา; resolve ผู้รับด้วย FlowMate binding
- Activity: map success/held/failure/source/scheduler events ตาม state และ readiness gates จริง; success ต้องตรวจ output ครบตาม expected set/version ของ run ผลบางส่วนไม่ส่ง success และ retry จนครบส่งได้ครั้งเดียว
- รวม delivery projection โดยไม่เปลี่ยนความหมาย outcome ของคิวเดิม
- กำหนด deduplication, recipient access recheck, route revision, retry boundaries และ partial mention/card tracking
- ฝั่งเก่า/ใหม่ต้องมี send owner ชัดเจนต่อ event ไม่ให้ส่งพร้อมกัน
- เมื่อ deactivate/reassign/change destination ยกเลิกหรือพัก pending ตาม revision; ไม่ replay backlog อัตโนมัติ
- Bot deactivate/remove ต้องมี gate ใน enqueue/claim/mark-started paths ที่เกี่ยวข้องทุก adapter และแสดง in-flight; ไม่ปล่อย legacy dispatcher ข้าม Bot activation
- safe retry ส่ง notification อย่างเดียว; uncertain ต้องผ่าน review ก่อน resend

ผลส่งมอบ: adapters และ contract tests ที่ไม่เรียก production/provider จริง

ผ่านเมื่อ: event ซ้ำไม่เพิ่ม delivery ซ้ำ, offboard/reassign ไม่ส่งให้คนเดิม, retry ไม่สร้างงาน และ readiness gate ไม่ถูกลดทอน

### P4 — Production UI integration

งาน:

- integrate เมนู Control Center กับ Workgrid auth/navigation เดิม
- หน้า Bot, recipients, groups, rules, deliveries และ proposals/audit
- Bot Settings รองรับ Add App ID/credential reference, Check, Activate, Deactivate และ Remove connection พร้อมคำอธิบายว่าไม่ลบ app บน SeaTalk
- Team Members แสดง Role, Fulltime/Freelance, member status, SeaTalk ID, connected Bots/Group IDs; role edits ผ่าน API สมาชิกเดิมตามสิทธิ์
- เพิ่ม Situations (Assign/Review), activated/verification และ preview recipient relation; Apply แล้ว event ใหม่ทำงานโดยไม่ deploy ไม่ต้อง approve ต่อข้อความ
- Review ที่ยังไม่พัฒนาต้องแสดง “ยังไม่รองรับ — รอพัฒนา” และ disable activation; เปิดให้ตั้งและ Activate หลัง capability พร้อมและผ่าน acceptance ไม่ใช้สถานะ Review ของงานเป็นหลักฐานว่า notification พร้อม
- Group directory แสดงชื่อ ทีม Group ID Bot/App ID เหตุการณ์ activation และ verification; เพิ่ม FCOTH Operation เป็นข้อมูลรอตรวจ ไม่ auto-activate
- entry point จาก Team Members และ link ไป Activity Monitor/detail ที่เหมาะสม
- แสดง capability และ verification timestamp; unknown ไม่ขึ้นเป็น healthy
- แสดง before/after, impact count, in-flight และ test target ก่อน action จริง
- source static browser ใช้ root JSX และ regenerate sibling JS ด้วย `npm.cmd run build:github`
- หากเพิ่ม JSX file ให้เพิ่มรายการใน `build-github.cjs` และ script inclusion ที่ตรวจแล้ว ไม่แก้ generated JS โดยตรง
- ตรวจ rendered desktop/mobile และ keyboard flow

ผลส่งมอบ: local UI พร้อม build outputs และ browser evidence

ผ่านเมื่อ: UAT flow ตาม spec ทำได้ครบ พร้อม error states; ไม่แสดง action ที่ผู้ใช้ไม่มีสิทธิ์ แต่ backend ยังตรวจซ้ำ

### P5 — Migration rehearsal และ UAT แบบไม่ส่งจริง

งาน:

- import existing routes/settings พร้อม provenance; ไม่ตีตราว่า verified ใหม่จากข้อมูลเก่า
- ตรวจ default employee route ไม่เปลี่ยน, group routes ตรง Bot, และ disabled routes ไม่กลับไป default
- rehearsal migration/rollback ด้วย isolated data และตรวจสิทธิ์หลัง migration
- ทดสอบกรณีสำคัญใน acceptance matrix รวม shared settings ของ Activity/Battle Pass
- dry-run event → rule → target → payload โดยไม่เรียก send และไม่ claim production queue
- ตรวจ diff/manifest ของ source/generated assets ไม่พางานค้างอื่นเข้า release

ผลส่งมอบ: dry-run report, expected deliveries, permission evidence, migration/rollback report

ผ่านเมื่อ: mapping ครบตาม scope และไม่มี unexpected target/duplicate; แยก known unrelated failures จาก regression ของงานนี้

### P6 — Authorized pilot และ rollout

ก่อนลงมือ: ขออนุมัติแยก production SQL, function/UI deployment, commit/push และข้อความทดสอบจริงตาม action ที่ต้องใช้ ไม่ถือว่าอนุมัติแผนเท่ากับอนุมัติ actions เหล่านี้

งานหลังอนุมัติ:

- pilot ใช้ Pond (Fulltime), Folk (Freelance / `Njk2MTczMDEwNTg2`) และ FCOTH Operation โดย Panu เป็น Admin; ใช้ข้อความขั้นต่ำติดป้าย TEST
- เก็บผล Pond เดิมเป็น evidence ที่ผู้ใช้ยืนยัน ไม่อ้างว่าทดสอบ Control Center หรือ Review ใหม่ผ่านแล้ว; ทดสอบ integration ใหม่เฉพาะส่วนที่เปลี่ยนหลังได้รับอนุมัติ
- สำหรับ Folk ตรวจ member mapping/SeaTalk identity และ Creative Bot ในกลุ่มก่อนส่ง; ทดสอบ Assign เมื่อ Folk เป็น Assignee และ Review เมื่อ Folk เป็น Requester ไม่เปลี่ยน route ของ Boss/Tong
- จำกัด event/rule/target และเปิด canary ทีละ adapter
- ระบุ event cutover/activation time; backlog เก่าไม่ส่งเอง
- ตรวจ provider acceptance กับผู้รับยืนยันการเห็นข้อความแยกกัน
- ทดสอบ pause/reroute/permission ด้วยข้อมูล pilot และแผนคืนค่า ไม่ใช้ข้อมูลงานจริงที่ไม่จำเป็น
- rollout ตาม Bot/event ที่ผ่าน pilot; ติดตาม failed/uncertain/duplicate/backlog พร้อมช่วงหยุดที่ตกลง
- ตรวจ deployed source/assets และ live UI แยกจาก push/build success

ผลส่งมอบ: pilot evidence, deployment manifest, live checks, rollback contacts และ remaining Operations actions

ผ่านเมื่อ: เส้นทางที่อนุมัติส่งถูกปลายทางและใช้ UI เปลี่ยนค่าได้จริง ไม่มี regressions ที่ค้างใน scope

## 4. ลำดับ dependencies

```text
P0 baseline/contracts
    → P1 UX/acceptance
    → P2 backend/permissions
    → P3 adapters
    → P4 UI integration
    → P5 rehearsal/dry-run
    → P6 authorized pilot/rollout
```

UI mock ใน P1 ใช้ข้อมูลจำลองได้ก่อน backend; UI จริงที่ใช้ค่าและส่ง test ต้องรอ contracts และ permission checks ใน P2/P3

## 5. Test plan ที่ต้องใช้

| ระดับ | ตรวจอะไร | ข้อจำกัด |
| --- | --- | --- |
| Unit | matching, audience, revision, dedup, state mapping | ไม่พิสูจน์ production permissions |
| Isolated SQL/API | Admin/lead/wrong-team, proposal/apply, atomicity, migration | ต้องยืนยันว่า isolated ก่อนรัน |
| Adapter contract | existing outbox/claim/finish, partial delivery, timeout | provider mocked; ไม่อ้าง tenant-ready |
| Bot/member lifecycle | app ซ้ำ, token scope ต่อ Bot, deactivate ระหว่างส่ง, archived references, หลาย bindings, employment type ไม่แทนสิทธิ์ | Workgrid deactivate ไม่ใช่ SeaTalk app offline |
| Review event/profile | requester ถูกคน, Boss ไม่ใช่ requester ไม่ส่ง, re-review เป็นรอบใหม่, edit ใน Review ไม่ซ้ำ, placeholder group blocked, config refresh | ต้องพัฒนา event adapter ครั้งแรก; mock proof ไม่เท่ากับส่งจริง |
| Browser UAT | onboarding, proposal, review, error states, mobile/keyboard | local UI ไม่เท่ากับ deployed UI |
| Dry-run | event/rule/target/payload ตามข้อมูลที่อนุมัติ | ไม่มี send; ไม่พิสูจน์ SeaTalk acceptance |
| Authorized real pilot | tenant permission, group/DM, actual message appearance | acceptance ไม่เท่ากับ read receipt |

รัน affected checks ก่อน แล้วขยายเมื่อ shared behavior/failure จำเป็น ไม่รัน smoke ที่มี side effects จนกว่าจะรู้ scope และ authorization

## 6. Migration และ rollback

- additive schema/configuration ก่อน; import ไม่ delete ข้อมูลเดิม
- shadow comparison ต้องเป็น non-sending และใช้ข้อมูลที่ได้รับอนุญาต ไม่ claim หรือ finish คิวจริง
- ใช้ adapter activation ที่แยกต่อ event/Bot และมี rollback mapping ที่ตรวจ readiness ใหม่
- rollback ไปเส้นทางเดิมได้เฉพาะส่วนที่มีเส้นทางเดิมผ่านการตรวจ; QT ที่พัฒนาใหม่ต้องมี stop switch แทนการอ้างว่ามี legacy fallback
- config rollback ไม่ถอนข้อความหรือคืนสมาชิก SeaTalk อัตโนมัติ; side effects ต้องมีแผนแก้เฉพาะ
- งานที่เริ่มส่งแล้วต้องติดตามแยก ไม่อ้างว่าพักแล้วหยุดทุกข้อความทันที
- ไม่ drop legacy routes/workers จน rollout ผ่านและได้รับอนุมัติ scope cleanup ต่างหาก

## 7. ประมาณความพยายามเบื้องต้น

เป็นช่วงสำหรับวางแผนของผู้พัฒนา 1 คน ไม่ใช่วันส่งมอบที่ยืนยัน ไม่รวมรอสิทธิ์/ผู้ใช้/UAT และต้องประเมินใหม่หลัง P0

| ขั้น | วันทำงานประมาณ |
| --- | --- |
| P0 baseline/contracts | 1–3 |
| P1 UX/acceptance | 1–2 |
| P2 backend/permissions | 3–5 |
| P3 adapters | 3–6 |
| P4 UI integration | 3–5 |
| P5 rehearsal/UAT | 2–4 |
| P6 pilot/rollout | 1–3 |
| รวม | 14–28 |

ช่วง 14–28 วันเป็นกรอบเบื้องต้น ไม่ใช่คำมั่นสำหรับ scope v0.6 ต้องประเมินใหม่หลัง P0 โดยรวม Review producer/claim/template, review-instance semantics, runtime profiles, Bot lifecycle และ credential onboarding ไว้อย่างชัดเจน ตัวแปรหลักคือ QT SeaTalk producer ที่มีจริง, tenant capabilities, จำนวน legacy templates และ shared settings ของ Activity/Battle Pass

การใส่ Review ในหน้า Setting อย่างเดียวไม่ทำให้ dispatcher Assigned เดิมรองรับ Review; ต้องผ่าน P2/P3 และ acceptance ของ Review ก่อนเปิดปุ่ม Activate

## 8. ข้อมูลที่ขอจากผู้ใช้ต่อไป

ยืนยันแล้ว: เจ้าของ credentials/Admin คือ Panu; Pond Fulltime ทดสอบแล้วตามคำแจ้งผู้ใช้; Freelance pilot เปลี่ยนเป็น Folk / `Njk2MTczMDEwNTg2`; Activity success ครบชุดเท่านั้น; กลุ่ม Freelance แจ้ง Task ใหม่/ให้รีวิวเท่านั้น; Marketing/eSports รอกรอกใน UI ไม่ต้องส่ง IDs ตอนนี้

สิ่งที่ยังต้องตรวจ/เติมก่อน pilot:

1. เลือก Folk จาก canonical Team Members และตรวจ SeaTalk identity กับ Bot/สมาชิกกลุ่ม; หากข้อมูลสมาชิกเดิมไม่พอ จึงขอ email/member identity เพิ่ม ไม่เดาจากชื่อ
2. ตรวจ credential references และ permissions ของ Bots ใน approved storage; ไม่ส่ง secrets ในแชต
3. ตรวจ expected-output manifest และ readiness gates จาก source/schema จริงเพื่อให้คำว่า “ครบชุด” เป็นเงื่อนไขที่ระบบตรวจได้
4. ตกลง retention ก่อน production; QT assignee-only ยังเป็นค่าเสนอ หากต้องการ requester/dispatcher เพิ่มให้กำหนดเป็น rule แยก

Boss Group ID ไม่ใช่ข้อมูลที่ต้องรอสำหรับ pilot นี้; รองรับ Review หนึ่งครั้งต่อ transition ตามแผนเดิม การส่ง TEST จริงและ production actions ต้องได้รับอนุมัติแยก

## 9. Completion และ worktree handling

รอบแรกอนุมัติ spec/plan; ขั้นถัดมาผู้ใช้อนุมัติ local implementation ซึ่งได้ build และทดสอบแล้วตาม Orchestration log ไม่ใช้ผล local เป็นหลักฐาน production installation

ร่าง SQL/worker/tests ที่เคยเริ่มเกินขอบเขตเอกสารถูกทบทวน แก้ไข และทดสอบในการ implementation ที่ผู้ใช้อนุมัติครั้งถัดมาแล้ว ยังต้องผ่าน tenant migration/route import/pilot และ quality gates ของ release ก่อนติดตั้งหรือเปิดส่งจริง ดู [Orchestration record](WORKGRID_CONTROL_CENTER_ORCHESTRATION_20261005.md)

เมื่อ implementation จบ รายงาน local tests/build, browser, database apply และ remote/live publication แยกกัน พร้อมสถานะ worktree retained/removed/awaiting cleanup และเหตุผล ตามข้อตกลง repository

ไม่ถือว่า commit/push/worktree cleanup เป็นขั้นบังคับ; ทุกการลบหรือย้าย checkout ต้องมีหลักฐานและ authorization ตาม named scope
