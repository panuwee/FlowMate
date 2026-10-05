# Workgrid Control Center — Product & System Spec

วันที่: 5 ตุลาคม 2026 · เวลาอ้างอิง: Asia/Bangkok

สถานะ: v0.6 — ข้อกำหนดสำหรับ implementation; ผู้ใช้อนุมัติขั้นถัดไปแบบ local หลัง review เอกสารแล้ว ผล implementation และข้อจำกัดอยู่ใน [Local handoff](WORKGRID_CONTROL_CENTER_LOCAL_HANDOFF_20261005.md) ยังไม่อนุมัติ production SQL, commit, push, deployment หรือส่งข้อความจริง

## 1. ข้อตกลงที่ผู้ใช้เลือกแล้ว

- รุ่นแรก: Notification ของ Creative Request, Task Assign และ Activity Automation
- Admin: ตรวจ แก้ อนุมัติ และใช้การตั้งค่าจริงภายในขอบเขตสิทธิ์
- หัวหน้าทีม: ดูและเสนอการเปลี่ยนแปลงเฉพาะทีมตนเอง ไม่เปิดใช้จริงเอง
- Deliverables: spec และ implementation plan เป็น Markdown พร้อมสรุปในแชต
- การเปิด/พัก Automation, Module lifecycle และ AI Assistant อยู่ระยะถัดไป
- เพิ่มข้อกำหนด: Bot Settings เชื่อม SeaTalk Open Platform ด้วย App ID, เพิ่ม/Activate/Deactivate/ยกเลิกการเชื่อม Bot และทะเบียนสมาชิกที่มี Role, Fulltime/Freelance, SeaTalk identity และ Bot/group bindings
- ผู้ใช้ระบุปลายทาง `FCOTH Operation` ของทีม Operations, SeaTalk Group ID `ODg5NDI1MDQwODI3`, Bot ชื่อ `FlowMate Bot`; เป็นข้อมูลตั้งต้นที่ต้องตรวจ tenant ก่อนเปิดใช้ ไม่ใช่ผล verification ใหม่
- ผู้ใช้ยืนยัน Bot ที่มีอยู่: Creative Bot App ID `OTg1MjIwNzY0OTY3` สำหรับแจ้ง CR ไปยัง GD/VE และ FlowMate App ID `NTgyNzAzMjc5MjE4` สำหรับแจ้งทีม Operations เมื่อสร้าง CR และ Notification ของ Task Assign
- Creative Bot เพิ่มเหตุการณ์ Review → Requester เมื่อ CR เปลี่ยนเข้า Review; Assign → Assignee เมื่อมีการมอบหมาย CR จริง รวมกรณีสร้าง CR พร้อม Assign
- หลังพัฒนา event adapters ครั้งแรกและเชื่อม Bot แล้ว Admin เปิด profile/เหตุการณ์ผ่าน UI ได้ โดย runtime อ่านค่าที่ Apply ใหม่ ไม่ต้อง deploy หรือแก้โค้ดรายสมาชิก
- ข้อมูล pilot ล่าสุด: Fulltime = Pond (ผู้ใช้แจ้งว่าทดสอบแล้ว), Freelance = Folk / Group ID `Njk2MTczMDEwNTg2`, Admin = Panu; Folk แทน Boss สำหรับการทดสอบ ไม่เปลี่ยน route จริงของ Boss/Tong
- เจ้าของ credentials ของ Creative Bot และ FlowMate คือ Panu; secret references/permissions ยังต้องตรวจผ่าน approved storage
- Activity แจ้งสำเร็จเฉพาะเมื่อสร้างงานครบชุดตามแผนของ run และผ่าน readiness gates เดิม; ผลบางส่วนไม่ใช้ข้อความสำเร็จ
- ข้อมูลในกลุ่ม Freelance จำกัดเฉพาะแจ้งว่ามี Task เข้ามาหรือมี Task ให้รีวิว; กลุ่ม Marketing/eSports จะกรอกภายหลังผ่าน UI และไม่เป็นเงื่อนไขบังคับสำหรับ pilot นี้

## 2. เป้าหมายและเกณฑ์ความสำเร็จ

ทำให้การเพิ่มผู้รับ เปลี่ยนกลุ่ม และตั้งกฎแจ้งเตือนเป็นงานผ่าน UI โดยไม่ต้องแก้โค้ดสำหรับเหตุการณ์ที่ระบบรองรับแล้ว

ผู้ดูแลต้องสามารถ:

1. เชื่อมสมาชิก Fulltime กับบัญชี SeaTalk ที่ Bot ติดต่อได้
2. เชื่อม Freelance กับกลุ่มที่มี Bot และผู้รับ โดยมีขั้นตอนสำหรับงานที่ต้องทำใน SeaTalk
3. จัดการกลุ่ม Operations, Marketing และ eSports โดยแยกตามทีมและ Bot
4. เปิด/พักกฎ เลือกเหตุการณ์และปลายทาง ดูตัวอย่าง ทดสอบ และติดตามผล
5. แยกผลสร้างงานออกจากผลส่งข้อความ และแก้การส่งโดยไม่สร้างงานซ้ำ
6. ตรวจว่าใครเปลี่ยนอะไร เมื่อใด ด้วยเหตุผลใด

เกณฑ์หลัก: หลังเชื่อมและเปิดใช้ผู้รับใหม่แล้ว งาน Assigned ใหม่ที่เข้าเงื่อนไขต้องสร้างรายการส่งหนึ่งรายการต่อผู้รับจริงตามนโยบาย โดยไม่กระทบผู้รับเดิม

คำว่าไม่ต้องแก้โค้ดครอบคลุมการตั้งค่าภายใน event catalog และความสามารถที่พัฒนาแล้ว การเพิ่มระบบใหม่หรือเหตุการณ์ใหม่ยังต้องพัฒนาจุดเชื่อมครั้งแรก

## 3. หลักฐานและข้อจำกัดที่ทราบ

ตรวจจากไฟล์ local วันที่ 5 ตุลาคม 2026 ไม่ใช่หลักฐานสถานะ production:

| ฐานเดิม | สิ่งที่พบ | ผลต่อการออกแบบ |
| --- | --- | --- |
| `supabase/creative_seatalk_routing.sql` | route รายสมาชิกใน private schema; มี employee/group/none และค่า email สำหรับ out-of-band fallback | ใช้ adapter เชื่อมข้อมูลเดิม; email ไม่ถือว่าเป็นช่องทางพร้อมใช้โดยอัตโนมัติ |
| `.worktrees/version2.1.1/supabase/functions/seatalk-creative-dispatch/index.ts` | ส่ง Assigned card แบบ employee/group และ mention แยกข้อความ | เก็บ behavior เดิมและตรวจผลของ mention/card แยกกัน |
| `.worktrees/version2.1.1/supabase/creative_seatalk_recipient_routing.sql` | claim ตรวจ `status = assigned` และ recipient ต้องเป็น assignee ปัจจุบัน | ต้องเพิ่ม event-aware claim สำหรับ Review/requester; การใส่ setting อย่างเดียวใช้ dispatcher เดิมไม่ได้ |
| `.worktrees/task-assign-workspace-release/supabase/task_assign_workspaces.sql` | มี notification ในแอปและกติกาสิทธิ์ cross-team | ต้องตรวจ SeaTalk adapter เพิ่ม; notification ในแอปไม่พิสูจน์ว่ามี SeaTalk delivery |
| `supabase/activity_automation_production_seatalk.sql` | มี outbox, dispatch key และตรวจปลายทาง; ใช้ค่าบางส่วนจาก Battle Pass settings | ต้องตรวจ coupling และการเปลี่ยนปลายทางโดยไม่ทำให้ Battle Pass เปลี่ยนโดยไม่ตั้งใจ |
| `supabase/activity_automation_production_notification_gates.sql` | ตรวจ Loot confirmed, ความสดของต้นทาง และหลักฐาน output ก่อนแจ้ง | UI ต้องรักษา readiness gate เดิม |
| `activity-automation-monitor.js` | มีหน้าติดตาม run/output/notification และ capability | reuse API/มุมมองที่ตรวจแล้ว; ไม่สร้าง Monitor ซ้ำทั้งหมด |

Source อยู่หลาย checkout และมีงานค้าง ขณะสำรวจ canonical checkout อยู่ `version2.1` แม้ target คือ GitHub `version2.1.1`; ต้องยืนยัน baseline ก่อน implementation ไม่สลับหรือทับงานเดิม

เอกสาร SeaTalk snapshot ที่ใช้:

- `docs/seatalk-open-platform/source/send_message_to_a_bot_user.md`: DM ต้องมี Bot online, permission และ service scope
- `docs/seatalk-open-platform/source/send_message_to_group_chat.md`: Bot ต้องอยู่ในกลุ่ม; มี permission/scope และ rate limits
- `docs/seatalk-open-platform/source/get_joined_group_chat_list.md`: ดึงกลุ่มที่ Bot เข้าร่วมแล้ว พร้อม pagination ไม่ใช่ทุกกลุ่มในองค์กร
- `docs/seatalk-open-platform/source/get_group_info.md`: ข้อมูลสมาชิกอาจถูกซ่อนและต้องอ่าน pagination ให้ครบ
- `docs/seatalk-open-platform/source/get_app_access_token.md`: backend ใช้ App ID + App Secret เพื่อรับ token และ cache/refresh แยกตาม app; token สำเร็จไม่พิสูจน์ permission หรือสถานะ Online ของ Bot
- `docs/seatalk-open-platform/source/create_group_chat.md`, `add_group_members.md`, `remove_group_members.md`: จำกัด service scope และสิทธิ์กลุ่ม; response อาจสำเร็จบางสมาชิก

ต้องตรวจ tenant จริงก่อนอ้างว่าความสามารถใดใช้งานได้ และไม่รับประกันว่าเชิญ Freelance นอก service scope ผ่าน API ได้

## 4. ขอบเขตรุ่นแรก

### รวม

- ทะเบียน Bot ที่มีอยู่บน SeaTalk Open Platform: เพิ่มด้วย App ID, เชื่อม credential reference, ตรวจการเชื่อมต่อ, Activate/Deactivate และยกเลิกการเชื่อม พร้อมความสามารถ/สถานะตรวจล่าสุด
- ทะเบียน Team Member ที่ reuse สมาชิก/Role เดิม และแยก Fulltime/Freelance, member lifecycle, SeaTalk identity และ Bot/group bindings
- ผู้รับรายบุคคล: DM / กลุ่ม Freelance / พักการส่ง
- กลุ่มปลายทางตามทีมและ Bot: เชื่อม ตรวจ ทดสอบ พัก เปลี่ยน และยกเลิกการเชื่อม
- กฎแบบมีโครงสร้าง เลือกจากเหตุการณ์ที่รองรับ; ไม่เขียน code/expression อิสระ
- proposal ของหัวหน้าทีม, Admin review/apply และ audit
- preview ที่ไม่ส่งจริง แยกจาก test message ที่ส่งจริง
- delivery history, รายการติดขัด และ retry ตามความปลอดภัยของผลส่ง
- import/เชื่อมค่าปัจจุบันแบบรักษาพฤติกรรมเดิม และเปิดใช้ทีละส่วน

### ระยะถัดไป

- สร้างกลุ่ม/เพิ่ม/ลบสมาชิก SeaTalk ผ่าน API เมื่อยืนยัน capability
- เปิด/พักการสร้างงานหรือ scheduler ของ Automation
- เปิด/พัก/อ่านย้อนหลัง/เลิกใช้ Module เช่น OT Request
- AI Assistant, playbook knowledge และการเตรียม change proposal ผ่านภาษาไทย
- Email delivery, ช่องทางใหม่, digest, quiet hours และ escalation ขั้นสูง

พักกฎแจ้งเตือนในรุ่นแรกไม่เท่ากับพัก Automation ที่สร้างงาน

## 5. หน้าจอและพฤติกรรม

ตำแหน่งเสนอ: เมนูผู้ดูแลระดับ Workgrid ใช้ session เดิม ไม่สร้างระบบ login ใหม่ ต้องยืนยัน navigation integration จาก source จริง

| หน้า | ข้อมูลและ action |
| --- | --- |
| ภาพรวม | จำนวนผู้รับไม่พร้อม กลุ่มรอตรวจ ข้อความติดขัด proposals รออนุมัติ และเวลาตรวจล่าสุด |
| Bot Settings | ชื่อ, SeaTalk App ID, เจ้าของ, ทีมที่อนุญาต, Workgrid activation, ผลตรวจ connection/capability; Add/Check/Activate/Deactivate/Remove connection; ไม่แสดง secrets |
| Team Members / ผู้รับ | สมาชิก ทีม Role ประเภท Fulltime/Freelance สถานะสมาชิก SeaTalk ID และ Bot/group bindings; เข้าได้จาก Team Members |
| กลุ่ม | ชื่อ ทีม SeaTalk Group ID เจ้าของ Bot/App ID ประเภท internal/external เหตุการณ์ และ activation/verification; ตรวจกลุ่มที่ Bot เข้าร่วมหรือระบุ group ID |
| กฎแจ้งเตือน | event, source product, team, audience, destination, template, draft/active/paused/retired |
| ประวัติส่ง | event/run/task → route → delivery attempts → ผล provider; filter ทีม Bot เหตุการณ์ และช่วงเวลา |
| ข้อเสนอและประวัติแก้ไข | before/after, ผลกระทบ, ผู้เสนอ/ผู้ใช้จริง, เหตุผล, version และการคืนค่าตั้งค่า |

UI ใช้ภาษาไทยที่เข้าใจง่าย ตารางค้นหา/กรอง และ detail drawer; แสดงสถานะพร้อมข้อความ ไม่ใช้สีอย่างเดียว รองรับ keyboard และจอเล็ก

### Bot Settings: fields, connection และ lifecycle

ทะเบียนตั้งต้นที่ผู้ใช้ยืนยัน:

| Bot | SeaTalk App ID | หน้าที่ที่ยืนยัน | ปลายทาง | ผลตรวจระบบ |
| --- | --- | --- | --- | --- |
| Creative Bot | `OTg1MjIwNzY0OTY3` | Assign → Assignee; Review → Requester ของ CR | DM สำหรับผู้รับที่ติดต่อได้ หรือกลุ่ม Freelance ตาม binding | รอตรวจ credential/capability/identity mapping และ Review adapter ใหม่ |
| FlowMate | `NTgyNzAzMjc5MjE4` | แจ้ง Operations เมื่อสร้าง CR และส่ง Notification ของ Task Assign | CR creation → FCOTH Operation: `ODg5NDI1MDQwODI3`; Task Assign → ผู้รับตาม QT rule/member binding | รอตรวจ credential/capability/group access และ QT delivery adapter |

ชื่อ FlowMate Bot ในข้อมูลกลุ่มหมายถึง FlowMate App ID ข้างต้น ใช้ App ID เป็น identity จริง การมี CR ไม่เท่ากับพร้อมส่ง Assigned ให้ GD/VE เสมอ ต้องใช้ event/gate ของแต่ละหน้าที่แยกกัน เช่น CR output พร้อมแจ้ง Operations และการ Assigned พร้อมแจ้งผู้รับ ไม่ส่ง Assigned เพียงเพราะสร้าง CR แล้ว Task Assign ใช้ FlowMate ตามผู้ใช้ยืนยัน แต่ไม่ถือว่าต้องส่ง QT ทั้งหมดเข้ากลุ่ม Operations: เลือกผู้รับจาก QT rule/member binding แยกจากกลุ่ม CR creation ส่วน held/failed ของ Activity เป็นข้อเสนอ event catalog ที่ยังต้อง finalize

| Field | ความหมาย |
| --- | --- |
| Bot name / internal bot key | ชื่ออ่านง่ายและ ID ภายในที่คงที่ ใช้ผูกประวัติแม้เปลี่ยนชื่อ |
| SeaTalk App ID | app identity จริงบน SeaTalk Open Platform; ป้องกันเพิ่มซ้ำใน environment/tenant เดียวกัน |
| Credential reference | อ้างถึง secret storage ที่ backend ใช้ได้; ไม่ใช่ App Secret ในตารางทั่วไป |
| Owner / allowed teams / environment | ผู้ดูแลและขอบเขตที่อนุญาต; แยก test/production ให้เห็นชัด |
| Workgrid activation | draft / active / inactive / archived |
| Connection / capability | unverified / verified / failed / unknown พร้อมเวลาตรวจและความสามารถ DM/group/group-info ฯลฯ |
| SeaTalk platform status | Online/permission/scope ตามหลักฐานที่ตรวจได้; หากไม่มี API/evidence ให้แสดง unknown และลิงก์ตรวจใน Open Platform |

App ID อย่างเดียวไม่พอ authenticate ต้องมี App Secret ที่ backend เข้าถึงผ่าน approved storage การผูกหรือหมุน secret ใช้ secure admin flow และห้ามคืนค่า secret/token ให้ browser หรือ audit logs

UI → Workgrid backend → SeaTalk Open Platform API โดย backend จัดการ token cache/refresh แยกตาม app/environment และ rate limits ไม่ให้ browser เรียก API ด้วย credential โดยตรง ผลตรวจต้องระบุว่า authentication, permission, group access หรือ real delivery ตรวจขั้นใดแล้ว

| Action | พฤติกรรมที่ต้องได้ |
| --- | --- |
| Add Bot | ลงทะเบียน App ID ของ Bot ที่สร้างไว้แล้วบน SeaTalk; ผูก secret reference; เริ่ม draft ไม่ส่งจริง |
| Check connection | ตรวจ authentication และ capabilities ที่ตรวจได้โดยไม่ส่งข้อความ; อ้างเวลาตรวจล่าสุดและ gaps |
| Activate | Admin review/apply หลัง prerequisites ของช่องทางที่จะใช้ผ่าน; กฎและผู้รับที่ยังไม่ active ไม่เปิดตามเอง |
| Deactivate | หยุดรับ delivery ใหม่และป้องกันการเริ่มส่งที่ยังไม่ started; แสดง impact ต่อ rules/members/groups และ in-flight; ไม่เปลี่ยนสถานะ Online ของ SeaTalk app |
| Remove connection | archive registration หลัง deactivate และ review dependencies; เก็บ audit/delivery history; rules/bindings คง reference แบบ inactive ไม่ย้ายไป Bot อื่นเอง |
| Reactivate | ตรวจ credential/capabilities ใหม่และกำหนด cutover; ไม่ replay backlog หรือเปิดกฎที่พักเอง |

Remove ไม่ใช่การลบ app จาก SeaTalk Open Platform, นำ Bot ออกจากกลุ่ม หรือ revoke App Secret; การกระทำเหล่านี้เป็น platform operations คนละ scope รุ่นแรกมีคำแนะนำ/ลิงก์ไป Console แทนการอ้างว่าควบคุมได้ด้วย API ที่ยังไม่ยืนยัน

### Team Member fields และ Bot bindings

| Field | การจัดเก็บและพฤติกรรม |
| --- | --- |
| Member ID / name / team memberships | reuse canonical Team Members; ไม่สร้างรายชื่อคนอีกชุด |
| Role | reuse effective roles/team scopes เดิม; ไม่ทำ role copy ที่ใช้ตัดสินสิทธิ์แยกกัน |
| Employment type | Fulltime / Freelance / unknown สำหรับข้อมูลเดิมที่ยังไม่ยืนยัน; ไม่เดาจาก email |
| Member status | active / inactive ตาม lifecycle เดิม แยกจาก employment type และ notification state |
| SeaTalk ID | identity สำหรับผู้รับ/mention ตาม API ที่รองรับ; เก็บ provenance, bot/app scope และเวลายืนยัน |
| Employee code | identity ที่ DM endpoint ต้องใช้ เมื่อ resolve/ตรวจได้; ไม่ใช้ SeaTalk ID แทนโดยอัตโนมัติ |
| Connected Bot | หนึ่งสมาชิกมีหลาย Bot bindings ได้ แต่ต่อ event/context ต้อง resolve ปลายทางชัดเจน |
| SeaTalk Group ID | ผูกผ่าน destination ของแต่ละ Bot binding โดยเฉพาะ Freelance; ไม่เก็บหนึ่ง group field เป็นค่ารวมทุก Bot |
| Delivery channel / state | direct/group/disabled, verification state, revision และประวัติ |
| Situations / เหตุการณ์ที่เปิดรับ | multi-select Assign/Review ตาม Bot/event ที่รองรับ; event subscription แยกจากข้อมูลบุคลากรและ route |

ตารางสมาชิกแสดง Bot และ Group ID แบบสรุป; detail drawer แสดง bindings ทุกตัว การปิดสมาชิกต้อง suppress ทุก binding ที่เกี่ยวข้องตามสิทธิ์ ส่วนแก้ Role/member lifecycle ต้อง reuse permission/API ของ Team Members เดิม ไม่ให้สิทธิ์ Notification Admin เพิ่มสิทธิ์สมาชิกโดยปริยาย

### Event profiles: รูปแบบตารางที่ผู้ใช้เสนอ

UI แสดง Name / Email / Team / Role / Fulltime-Freelance / SeaTalk ID / Group ID / Bot / Situations / Activated / Verification โดย Situation เป็นเงื่อนไขเปิดรับของสมาชิก ไม่ใช่คำสั่งส่งทุกงานให้สมาชิกนั้น

ข้อมูลตัวอย่างจากผู้ใช้สำหรับ design/review ไม่ใช่การ import production:

| สมาชิก | ประเภท | Bot | เหตุการณ์ | ผู้รับต้องสัมพันธ์กับงานอย่างไร | ช่องทาง | สถานะข้อมูลปลายทาง |
| --- | --- | --- | --- | --- | --- | --- |
| Boss | Freelance | Creative Bot | Review | Boss ต้องเป็น Requester ของ CR ที่เข้า Review | กลุ่มของ Boss | `aaaaaabbbbbb` เป็นตัวอย่าง ต้องแทน Group ID จริงก่อนเปิดใช้ |
| Pond | Fulltime | Creative Bot | Assign | Pond ต้องเป็น Assignee ของ CR | DM | ผู้ใช้แจ้งว่าทดสอบแล้ว; ยังไม่ใช่ผลทดสอบ Control Center/Review ใหม่ |
| Joe | Fulltime | Creative Bot | Assign | Joe ต้องเป็น Assignee ของ CR | DM | รอตรวจ employee code/scope ของ Creative Bot |
| Tong | Freelance | Creative Bot | Assign | Tong ต้องเป็น Assignee ของ CR | กลุ่ม `MDI1MjA4MDEwMzE3` ที่ผู้ใช้ระบุ | รอตรวจกลุ่มกับ Creative Bot ใน tenant |
| Folk — pilot ล่าสุด | Freelance | Creative Bot | Assign / Review ตามกรณีทดสอบ | Assign เมื่อ Folk เป็น Assignee; Review เมื่อ Folk เป็น Requester | กลุ่ม `Njk2MTczMDEwNTg2` | ผู้ใช้ระบุ Group ID; รอตรวจ canonical member, SeaTalk identity, Bot และสมาชิกกลุ่ม ไม่เดา email/SeaTalk ID |

สมาชิกเดียวกันเปิด Assign และ Review ได้โดยไม่ต้องสร้างคน/identity ซ้ำ; route ปกติ reuse ต่อ member+bot ส่วน event-specific route override ให้เพิ่มเฉพาะเมื่อมีความต้องการที่ชัดเจน ไม่บังคับในรุ่นแรก

ตัวอย่าง Boss: ผูกสมาชิก → เลือก Creative Bot → group route → ใส่ Group ID จริง → เปิด Review → ตรวจ Bot/group/test → Admin Apply จากนั้น review event ใหม่ที่ Boss เป็น Requester จะเข้าคิวอัตโนมัติ ไม่ต้องให้ Admin approve ทุกข้อความ และไม่ต้องแก้โค้ดรายคน ขาด credential, scope หรือสมาชิกกลุ่มที่ API จัดการไม่ได้ ให้ UI ระบุงานที่ต้องทำใน SeaTalk Console/แอปอย่างตรงไปตรงมา

### Group directory: ข้อมูลตั้งต้นจากผู้ใช้

| ชื่อปลายทาง | ทีม | SeaTalk Group ID | Bot | ใช้รับเหตุการณ์ | สถานะที่ผู้ใช้ระบุ | ผลตรวจระบบ |
| --- | --- | --- | --- | --- | --- | --- |
| FCOTH Operation | Operations | `ODg5NDI1MDQwODI3` | FlowMate: `NTgyNzAzMjc5MjE4` | สร้างงานสำเร็จ / ติดขัด | พร้อมใช้ | App ID ผู้ใช้ยืนยันแล้ว; รอตรวจ tenant/group access; ยังไม่เปิดใช้จากการแก้ spec |

Bot App ID ของ FlowMate ผู้ใช้ยืนยันแล้ว ชื่อกลุ่ม/ชื่อ Bot เป็น label ไม่ใช่ identity key ใช้ app + group ID ผูก destination และตรวจว่ากลุ่มมี Bot ตัวนั้นจริงเมื่อมีสิทธิ์ API

UI จริงแสดง Workgrid activation กับ verification แยกกัน ไม่ใช้คำว่า Ready จากการกรอก Group ID อย่างเดียว สามารถมีหนึ่งกลุ่มเชื่อมหลาย Bot ได้เป็นคนละ binding แต่ต้อง preview ไม่ให้ส่งซ้ำและตรวจแต่ละ Bot แยกกัน

### Flow: เพิ่ม Fulltime

เลือกสมาชิก → เลือก Bot/ส่งตรง → backend ตรวจ identity และ scope เท่าที่ API ยืนยันได้ → preview → Admin ส่งข้อความทดสอบที่ติดป้าย TEST → review/apply

Fulltime เป็นข้อมูลบุคลากร ไม่ใช่หลักฐานส่ง DM ได้ ต้องผูก identity แบบชัดเจน ไม่เดาจากชื่อ

### Flow: เพิ่ม Freelance

เลือกสมาชิก → เลือกส่งกลุ่ม → แสดงขั้นตอนสร้างกลุ่ม/เพิ่มผู้รับและ Bot ใน SeaTalk → เชื่อมกลุ่ม → ตรวจข้อมูลที่เข้าถึงได้ → preview/test → review/apply

ถ้าข้อมูลสมาชิกถูกซ่อน ให้สถานะ `needs_confirmation`; ต้องมี Admin ยืนยันกลุ่มพร้อมหลักฐานทดสอบ/ผู้รับยืนยัน ห้ามขึ้นว่ายืนยันสมาชิกแล้วเมื่อ API ตรวจไม่ได้ กลุ่มสำหรับ Freelance ต้องแยกจากกลุ่มทีมและทบทวนสมาชิกเพื่อไม่ส่งรายละเอียดงานให้คนอื่นโดยไม่ตั้งใจ

### Flow: เปลี่ยนกลุ่มทีม

เชื่อมกลุ่มใหม่ → ตรวจ/test → preview กฎที่ได้รับผล → Admin apply แบบ atomic → พักเส้นทางเก่า

รายการที่ยังไม่เริ่มส่งและอ้าง revision เก่าต้องถูกพัก/ยกเลิกพร้อมเหตุผล ไม่ย้ายข้อความเก่าไปกลุ่มใหม่อัตโนมัติ; หากต้องส่งย้อนหลังให้ review แยก ผู้ส่งที่เริ่มส่งแล้วอาจหยุดไม่ได้ ต้องแสดงรายการนั้น

### Flow: proposal

หัวหน้าทีมเสนอ → ระบบตรวจ scope/payload → Admin ตรวจ before/after และ readiness → approve/apply หรือ reject พร้อมเหตุผล

การอนุมัติและใช้ค่าต้องอ้าง version เดียวกัน ถ้าค่าจริงเปลี่ยนระหว่างรอ ให้ conflict และตรวจใหม่ ไม่เขียนทับเงียบ ๆ Admin แก้เองผ่าน review/apply ได้โดยไม่ต้องสร้าง proposal ให้ตนเอง

## 6. Event catalog และกติกาส่ง

ชื่อด้านล่างเป็นชื่อเสนอสำหรับสัญญากลาง ต้อง map กับ event จริงหลัง discovery ไม่ใช่ชื่อ API ที่มีอยู่แล้ว

| เหตุการณ์ | ผู้รับหลัก | เงื่อนไข |
| --- | --- | --- |
| `creative.assigned` | assignee ปัจจุบัน | เกิด assignment จริงและเปิดรับ Assign; งานและการมอบหมายยังใช้ได้; ผู้รับมีสิทธิ์อ่านงาน |
| `creative.review_requested` | requester ของ CR | CR เปลี่ยนจากสถานะอื่นเข้า `review`, requester เปิดรับ Review และมีสิทธิ์ตรวจงาน; ไม่ใช่การเลือกสมาชิกทุกคนที่เปิด Review |
| `quick_task.assigned` | assignee ปัจจุบัน | same-team หรือ cross-team ที่รับและ assign แล้ว; งานรอ dispatcher ยังไม่ส่งเป็น Assigned |
| `activity.output_ready` | กลุ่ม Operations ที่อนุมัติ | Loot confirmed และ readiness/output evidence ตามกติกาปัจจุบัน |
| `activity.held` | กลุ่ม Operations | ต้องมีเหตุผลรอ/blocked ที่ยังมีผลและยังไม่แก้แล้ว |
| `activity.failed` | กลุ่ม Operations | confirmed failure จาก state จริง; ปรับ mapping ให้ไม่แจ้งซ้ำกับ held |
| `activity.source_issue` / `activity.scheduler_issue` | ผู้ดูแล Operations | เปิดใช้แยกจากงานสำเร็จ และใช้ gate เดิม |

Marketing/eSports เลือกปลายทางและ event ที่ได้รับอนุญาตจาก catalog; ไม่เปิดทุก event ให้ทุกกลุ่มโดยอัตโนมัติ และไม่เพิ่ม event ที่ยังไม่มี producer ใน UI

- เริ่มด้วย template ที่อนุมัติแล้วและตัวแปรที่อนุญาต; ไม่เปิด arbitrary HTML, callback หรือ URL
- Notification เป็นการแจ้ง ไม่เปิด SeaTalk status commands หรือการ approve งานที่ถูกปิดไว้เดิม
- กฎซ้อนกันต้อง preview ว่าจะส่งกี่ปลายทาง; ป้องกัน duplicate ที่เป็น recipient เดียวกันในเหตุการณ์เดียวกัน
- ตรวจสิทธิ์ก่อน enqueue และก่อนส่งจริง โดยเฉพาะคนออกทีม/reassign/งานถูก archive
- การ pause/offboard ไม่ fallback ไปช่องทาง employee อัตโนมัติ

### Review Notification — ความสามารถใหม่ที่ต้องพัฒนา

ผู้ใช้ยืนยันว่า **Review Notification ยังไม่เคยทำ** การมีสถานะ Review ใน FlowMate ไม่ได้หมายความว่ามีเส้นทางส่ง SeaTalk สำหรับเหตุการณ์นี้แล้ว จึงกำหนดเป็นงานพัฒนาใหม่ในรุ่นแรก ไม่ใช่เพียงเปิด setting ของความสามารถเดิม

สถานะล่าสุด: adapter/worker/UI ของ Review พัฒนาและผ่านการทดสอบ local แล้ว ยังไม่ติดตั้ง tenant หรือส่ง Review จริง ต้องผ่าน production preflight และ authorized pilot ก่อนเปิดใช้งานจริง

| รายการ | ข้อกำหนด |
| --- | --- |
| สถานะความสามารถ | planned / not implemented; หลังพัฒนาเป็น available-inactive และ active เฉพาะเมื่อ Admin เปิดใช้ |
| Event | `creative.review_requested` (ชื่อสัญญาเสนอ) เกิดเมื่อ CR เปลี่ยนเข้าสู่ Review และ transaction สำเร็จ |
| ผู้รับ | Requester ของ CR นั้น พร้อมตรวจสิทธิ์ สมาชิก active และ profile เปิดรับ Review |
| Bot | Creative Bot App ID `OTg1MjIwNzY0OTY3` |
| ช่องทาง | Fulltime ส่ง DM เมื่อ identity/scope พร้อม; Freelance ส่งกลุ่มที่ตั้งไว้สำหรับสมาชิกกับ Creative Bot |
| ข้อความ | แจ้งว่างานพร้อมตรวจ พร้อม CR ID/ชื่อและลิงก์งาน; template Review แยกจากข้อความ Assigned |
| UI ก่อนพัฒนาเสร็จ | แสดง Review ว่า “ยังไม่รองรับ — รอพัฒนา”; ห้ามใช้สวิตช์ Activate ที่ทำให้เข้าใจว่าจะส่งได้แล้ว |
| การเริ่มใช้ | พัฒนา producer, event-aware outbox/claim, requester resolver, template, UI profile และ tests ก่อนเปิด pilot |
| หลักฐานรับงาน | local permission/transition tests, dry-run และ authorized real pilot ของ DM/group แยกกัน; ผ่าน mock อย่างเดียวไม่ถือว่า SeaTalk พร้อมใช้ |

เกณฑ์เฉพาะ Review: เมื่อ Boss เป็น Requester และเปิด Review ผ่าน UI แล้ว CR เข้าสู่ Review รอบใหม่ ต้องส่งเข้ากลุ่มจริงของ Boss หนึ่งครั้ง; หาก Boss ไม่ใช่ Requester ต้องไม่ส่งให้ Boss การแก้ข้อมูลขณะคงอยู่ Review ต้องไม่ส่งซ้ำ และการเปลี่ยน profile/route หลังพัฒนาเสร็จต้องไม่ต้องแก้ source/deploy รายคน

### กติกา transition และผู้รับ

- CR สร้างแบบ unassigned ยังไม่มี Assignee จึงไม่ส่ง Assign ไป GD/VE ทุกคน รอการมอบหมายจริง; สร้างพร้อม Assigned ให้ส่งหนึ่ง event ไม่ส่งซ้ำจาก created และ assigned
- Review ตรวจ transition ที่ commit สำเร็จ (`old.status != review` → `new.status = review`) ไม่ตรวจเพียงว่างานยังอยู่ Review ทุกครั้งที่แก้ไข
- งานที่กลับแก้แล้วส่ง Review รอบใหม่แจ้งได้หนึ่งครั้งต่อ review transition/round; unrelated updates และ event delivery retry ไม่สร้างรอบใหม่
- ใช้ durable event/transition ID จาก domain transaction ไม่ใช้เวลา `updated_at` ของการแก้ไขทั่วไปเป็นตัวแทน review round โดยไม่ตรวจ
- snapshot ผู้รับ/รอบ ณ event แล้วตรวจสถานะ ความสัมพันธ์และสิทธิ์ซ้ำก่อนส่ง: เปลี่ยน requester หรือ Review จบแล้วให้ cancel รายการ stale พร้อมเหตุผล; ไม่ส่งรายการเก่าให้ requester ใหม่เอง
- Review รอบเก่าที่ปิดแล้วและกลับเข้ารอบใหม่ต้องไม่ผ่านเพียงเพราะ current status เป็น review ให้ตรวจ review instance ปัจจุบันด้วย
- missing requester, inactive profile, missing route หรือ unavailable Bot แสดง suppressed/blocked reason; ไม่เลือกชื่อ/email สำรองเอง
- Outbound Review notification ไม่เปิด inbound SeaTalk status commands, approve หรือ request changes ที่ถูกปิดไว้เดิม

### Configuration ที่มีผลโดยไม่ deploy รายคน

Rule templates สองตัวเป็นค่าเริ่มต้น: Assign → dynamic Assignee และ Review → dynamic Requester; สมาชิกเลือก event subscriptions และ route ของตนเอง ไม่สร้าง rule ถาวรรายชื่อใน source

การย้ายค่าจากระบบเดิมต้องรักษา Assigned notifications ของผู้รับเดิมโดย import effective defaults เป็น Assign profiles ที่ตรวจได้ ไม่เปลี่ยนเป็น opt-in แล้วทำให้คนเดิมเงียบโดยไม่ตั้งใจ ส่วน Review ใหม่เริ่ม disabled จน Admin ตรวจและเปิด ไม่เพิ่ม notification ให้ทุกคนโดยปริยาย

Admin Apply เขียน configuration revision แบบ atomic; worker อ่าน revision ที่ commit แล้วและ refresh/invalidate cache ที่เกี่ยวข้อง ก่อนเริ่มส่งตรวจ active/rule/profile/route gates อีกครั้ง กฎใหม่ใช้กับ events หลัง activation cutoff ไม่ replay งานเก่าเอง

การทำงานเป็น async ผ่าน durable outbox: ข้อความเริ่มส่งเมื่อ worker ประมวลผล ไม่รับประกันส่งในวินาทีเดียวกับกด Apply; ต้องวัด worker interval/queue latency และกำหนด SLA หลัง P0 ค่าเสียหายแบบ rate limit/network failure ต้องเห็นใน delivery history

### Activity success — ครบชุดเท่านั้น

หลัง Loot confirmed ให้ตรวจรายการ output ที่คาดหวังของ run/version นั้นเทียบกับ output ที่สร้างและบันทึกสำเร็จจริง ต้องครบทุกชิ้นและผ่าน readiness/evidence gates เดิมก่อนสร้าง success notification หนึ่งรายการต่อ run ห้ามใช้เพียงจำนวน CR มากกว่าศูนย์ สถานะ worker จบ หรือจำนวนที่ตรงแต่ output คนละชุดเป็นหลักฐานว่าครบ

สร้างได้บางส่วนให้แสดง partial/held/failed ตามสถานะจริงใน Monitor และใช้กฎแจ้งติดขัดแยกจาก success; retry ที่เติมครบชุดแล้วแจ้งสำเร็จได้ครั้งเดียว ไม่มีการส่ง success ซ้ำสำหรับ run เดิม หากไม่มี expected-output manifest หรือชุดว่างที่ไม่ได้กำหนดว่าเป็นผลสำเร็จ ให้พักการแจ้งสำเร็จและแสดงเหตุผล

## 7. Data model และขอบเขตระบบ

ชื่อ entities เสนอ ยังไม่กำหนด SQL migration:

| Entity | ข้อมูลหลัก |
| --- | --- |
| Bot registry | stable bot key, provider app identity, allowed teams/events, capability, credential reference |
| Member profile (canonical) | member/team/role references, employment type และ member lifecycle ตามระบบสมาชิกเดิม |
| SeaTalk member identity | canonical member + app/tenant scope + SeaTalk ID / employee code ที่ตรวจแล้ว, provenance และ verification |
| Recipient route | member identity + bot key + team/context, DM/group/disabled, destination reference, revision |
| Event subscription / member notification profile | member + bot + event/context, enabled, cutoff และ revision; ไม่ใช่ role หรือผู้รับถาวรของทุกงาน |
| Destination | bot/app + provider group ID, team, purpose, owner, status, last verification/evidence |
| Notification rule | event, team/product scope, audience, route/destination, template version, revision, status |
| Domain notification event | immutable event/transition ID, work item, event kind, assignment/review instance และ participant snapshot; เขียนสัมพันธ์กับ transaction งาน |
| Change proposal | proposer, scope, before/after, base revision, decision/apply actor and times |
| Configuration audit | immutable revision history, reason, action and references; ไม่มี secrets |
| Delivery projection | read model รวม outbox เดิม พร้อม source ID/attempt ID ไม่บังคับย้ายคิวทั้งหมด |

route เดิมที่ key เป็น member อย่างเดียวต้องออกแบบ compatibility adapter สำหรับหลาย Bot ไม่ใช้ group ID หรือ employee code ของ Bot หนึ่งแทนอีก Bot โดยไม่ตรวจ identity

แนวทางเชื่อม:

```text
Control Center UI
    → Backend ตรวจสิทธิ์ + Configuration service
    → Adapter ของ Creative / Quick Task / Activity
    → คิวส่งเดิม + Worker
    → SeaTalk

UI ← Delivery projection + Audit + Verification evidence
```

API operations ที่ต้องมี: list capabilities/configurations, propose, validate, preview, test, apply, pause, history และ request safe retry ชื่อ endpoint จริงกำหนดหลังตรวจสัญญาปัจจุบัน

ใช้ backend operations ที่จำกัด scope สำหรับ configuration ใน private schemas; browser ไม่ได้สิทธิ์เขียนตาราง private โดยตรงและไม่มี service-role key

## 8. สิทธิ์ ความปลอดภัย และการส่งซ้ำ

- Admin ใช้จริงตาม scope ที่ตรวจฝั่ง backend ไม่เชื่อ role/team จาก UI
- หัวหน้าทีมดู/เสนอเฉพาะทีมตนเอง ไม่มีสิทธิ์ส่ง test จริงหรือ retry จริงในรุ่นแรก
- สมาชิกทั่วไปไม่เห็น Control Center หรือข้อมูล delivery ของคนอื่น
- การส่งเข้ากลุ่มต้องมี audience policy ที่ Admin อนุมัติ เพราะสิทธิ์ใน FlowMate ไม่จำกัดสมาชิกที่อ่านกลุ่ม SeaTalk
- Policy ที่ Panu ยืนยันสำหรับกลุ่ม Freelance: แจ้งเฉพาะ “มี Task เข้ามา” หรือ “มี Task ให้รีวิว” เริ่มด้วยข้อความขั้นต่ำนี้ ไม่แนบ brief, เนื้อหางาน, ไฟล์, ข้อมูลภายใน หรือ logs; การเพิ่มรายละเอียด/ตัวระบุ/ลิงก์ใน template ต้อง review ขอบเขตเพิ่มเติมก่อนเปิดใช้ การเปิดลิงก์ใด ๆ ในอนาคตยังต้องตรวจสิทธิ์ที่ Workgrid
- secrets อยู่ใน approved secret storage; UI แสดงเฉพาะ configured/missing และเวลาตรวจ
- provider group ID และ user mapping เป็นข้อมูลจำกัดสิทธิ์ แม้ไม่ใช่ secret
- test แสดงปลายทางและข้อความก่อน Admin กด; แยก TEST จาก production และจำกัดจำนวน/ความถี่
- บันทึกผลแยก queued / sending / provider_accepted / retryable / failed / uncertain / cancelled พร้อมเหตุผล; เก็บ raw status เดิมสำหรับตรวจ
- `provider_accepted` ไม่เท่ากับคนอ่านแล้ว และ unknown persistence หลังส่งไม่ควรถูกตีความเป็นส่งไม่ผ่าน
- event + source ID + assignment/review/run instance + bot + recipient ใช้ป้องกัน enqueue ซ้ำ; ไม่อ้าง exactly-once delivery เมื่อ provider ไม่มีหลักประกัน
- ถ้ามี mention + card ให้ติดตามแต่ละขั้น เพื่อไม่ยิง card หรือ mention ซ้ำโดยไม่จำเป็น
- uncertain delivery ต้องตรวจและ review ก่อน resend; safe retry ส่งข้อความอย่างเดียว ไม่เรียกสร้างงาน
- ประวัติส่งและ audit มี retention policy ที่ต้องตกลงก่อน production; ลด payload/ข้อมูลส่วนบุคคลที่ไม่จำเป็น

## 9. Acceptance criteria และ edge cases

| กรณี | ผลที่ต้องได้ |
| --- | --- |
| เพิ่ม App ID ซ้ำ | ปฏิเสธ duplicate registration ใน environment/tenant เดียวกัน และชี้ Bot เดิม |
| Token ผ่านแต่ส่ง group ไม่มีสิทธิ์ | แสดง authentication ผ่าน / group capability ไม่พร้อมแยกกัน; ไม่ขึ้น Ready รวม |
| Deactivate Bot | ทุก adapter หยุด enqueue/เริ่มส่งใหม่ตาม gate; in-flight แสดงตามจริง |
| Remove Bot ที่มีกฎ/สมาชิกเชื่อม | preview dependencies, deactivate แล้ว archive; audit/history ไม่หายและไม่มี fallback ไป Bot อื่น |
| สมาชิกมีสอง Bot bindings | identity/token/group resolve ตาม app ของเหตุการณ์; ไม่มี cross-Bot credential reuse |
| SeaTalk ID มีแต่ employee code ไม่มี | ไม่ส่ง DM ด้วย ID ที่ผิดประเภท; แจ้งต้อง resolve หรือเลือก group route |
| แก้ Fulltime/Freelance | ไม่เปลี่ยน Role หรือย้าย route เอง; review ผลกระทบแยก |
| เพิ่ม Fulltime | เชื่อม identity ที่ถูกต้อง; งานใหม่ส่งไปคนใหม่; คนเดิมยังทำงานตามเดิม |
| เพิ่ม Freelance | ใช้ Bot/กลุ่มที่ถูกต้อง; ขาด Bot/ข้อมูลตรวจไม่ได้มีสถานะตรงจริง |
| Boss เปิด Review และเป็น requester | Review transition ใหม่ส่งเข้ากลุ่ม Boss หนึ่งครั้งตาม profile โดยไม่แก้ source |
| Boss เปิด Review แต่งาน requester เป็นคนอื่น | Boss ไม่ได้รับ; resolve actual requester แล้วตรวจ profile ของคนนั้น |
| Group ID Boss เป็นตัวอย่าง/ยังไม่ตรวจ | ไม่ขึ้น Ready; ต้องใส่ ID จริงและตรวจ prerequisites |
| Folk pilot | ใช้ `Njk2MTczMDEwNTg2` เฉพาะ binding ของ Folk/Bot ที่ตรวจแล้ว; Assign/Review เลือกตามความสัมพันธ์จริง ไม่ส่งของสมาชิกอื่น |
| Freelance template | มีเฉพาะการแจ้ง Task ใหม่/ให้รีวิวตาม policy ไม่มีรายละเอียดงานหรือ logs หลุดออกกลุ่ม |
| Activity สร้างบางส่วน | ไม่ส่งข้อความสำเร็จ; Monitor แสดงสถานะจริงและเหตุผล |
| Activity เติม output ครบหลัง retry | ตรวจ expected set/version และ gates ก่อนส่ง success หนึ่งครั้งต่อ run |
| CR unassigned หรือ created+assigned | unassigned ไม่ส่ง Assign; created+assigned ไม่สร้างสอง deliveries จากเหตุการณ์เดียว |
| แก้ข้อความขณะยังอยู่ Review | ไม่ส่ง Review ใหม่ |
| กลับแก้แล้วส่ง Review ใหม่ | แจ้งหนึ่งครั้งสำหรับ instance ใหม่; instance เก่าถูกยกเลิกหากยังไม่ส่ง |
| เปิด profile/เปลี่ยน route หลัง deploy | ใช้ config revision ใหม่กับ event ใหม่โดยไม่ deploy; backlog ไม่ replay |
| คนออกทีม/ปิด route | pending delivery ถูกพัก/ยกเลิก; ไม่มี silent DM fallback |
| Reassign ก่อนส่ง | คนเดิมไม่รับรายละเอียดใหม่; คนใหม่ได้ event ตาม assignment version |
| QT cross-team รอ dispatcher | ยังไม่ส่ง Assigned จนยอมรับและ assign จริง |
| หัวหน้าทีมส่ง request ใช้ค่าจริงโดยตรง | backend ปฏิเสธ แม้แก้ UI/request เอง |
| ข้ามทีม/เปิดลิงก์ตรง | อ่าน/เสนอ/ส่ง/test ไม่ได้หากไม่มีสิทธิ์ |
| Loot ยังไม่ confirmed หรือ evidence เก่า | ไม่ส่งว่างานสำเร็จ |
| งานสำเร็จแต่ส่งล้มเหลว | แสดงสองสถานะ และ retry ไม่สร้างงานเพิ่ม |
| Provider timeout หลังเริ่มส่ง | uncertain; ไม่ resend อัตโนมัติจนรู้ผล |
| กฎซ้อน/event ซ้ำ | จำนวน deliveries ตรงนโยบาย ไม่ส่งซ้ำเพราะ adapter เก่ากับใหม่ทำงานพร้อมกัน |
| เปลี่ยนปลายทางระหว่างส่ง | ตรวจ revision อีกครั้ง; แสดง in-flight ที่หยุดไม่ได้ |
| สอง Admin แก้พร้อมกัน | แจ้ง version conflict และให้ review ใหม่ |
| Bot ถูกนำออกจากกลุ่ม/credential ใช้ไม่ได้ | หยุดส่งตาม error policy พร้อมแจ้งผู้ดูแลผ่านช่องทางที่แยกและพร้อมใช้ |
| Disable แล้ว enable ใหม่ | ไม่ replay backlog เก่าอัตโนมัติ |
| Rollback config | กลับ revision ที่เลือกหลัง revalidate; ไม่อ้างว่าถอนข้อความที่ส่งไปแล้ว |

## 10. ข้อมูลที่ยังต้องการก่อนเริ่ม implementation / pilot

ไม่ต้องส่ง password, token, app secret หรือ service-role key

| ข้อมูล | ผู้ใช้ตอบ / ระบบตรวจ | จำเป็นเมื่อใด |
| --- | --- | --- |
| Credential references ของ Bot ทั้งสอง | เจ้าของ = Panu ยืนยันแล้ว; ระบบตรวจ reference/capability ใน approved storage โดยไม่รับ secrets ในแชต | ก่อน final adapter design |
| กลุ่มปลายทาง | Operations ใช้ FCOTH Operation เดิม; Folk ใช้ `Njk2MTczMDEwNTg2`; Marketing/eSports รอกรอกผ่าน UI ไม่บล็อก pilot | ตรวจสองกลุ่ม pilot ก่อนส่งจริง; ตรวจกลุ่มใหม่ตอน onboarding |
| สมาชิกและผู้ทดสอบ | Pond Fulltime ทดสอบแล้วตามคำยืนยันผู้ใช้; Folk Freelance อยู่ ops, ปลายทาง GroupID `Njk2MTczMDEwNTg2`, Creative / Review; Admin Panu; canonical member map ตรวจแล้ว แต่ยังต้องตรวจ Bot/สมาชิกกลุ่ม | ก่อน UAT จริงของ Control Center |


| Activity success | ยืนยันครบชุดเท่านั้น; ระบบตรวจ expected-output manifest และ gates ของแต่ละ run | ก่อน finalize Activity adapter/tests |
| ต้องการแจ้ง requester/dispatcher ของ QT นอกเหนือจาก assignee หรือไม่ | ค่าเสนอ: assignee เท่านั้น; ผู้ใช้ยืนยัน | ก่อน finalize QT catalog |
| Retention | ยังต้องกำหนดระยะเก็บ audit/delivery; Freelance content policy ยืนยันแล้ว: แจ้ง Task ใหม่หรือให้รีวิวเท่านั้น | ก่อน production |
| Production permissions และ deploy baseline | ระบบตรวจ read-only ภายใต้ scope ที่อนุมัติ | ก่อน migration/release |

ข้อเสนอข้อความเริ่มต้น: Assigned ใช้ข้อมูลขั้นต่ำพร้อมลิงก์งาน; Activity success ใช้ project identity, ผลลัพธ์และลิงก์; held/failed ระบุสาเหตุและ next action โดยไม่ส่ง secrets/log ดิบ

### Member roster จากผู้ใช้ — 5 October 2026

Folk ส่งผ่าน Creative Bot เข้ากลุ่ม SeaTalk GroupID `Njk2MTczMDEwNTg2` สำหรับ Review เท่านั้นใน pilot นี้ SeaTalk ID `1353300313` ใช้ตรวจตัวสมาชิก/mention ภายในกลุ่ม ไม่ใช้เป็นปลายทาง DM และไม่ส่ง fallback ไป DM หากกลุ่มไม่พร้อม


ข้อมูลอ้างอิงสำหรับกรอก UI ภายหลัง ไม่ใช่ข้อมูลที่ import/activate แล้ว และไม่ใช่หลักฐาน provider verification Status ในตารางนี้เป็น Fulltime/Freelance แยกจากสถานะเปิดใช้งานบัญชี สิทธิ์ Admin และสมาชิกทีมในระบบจริง ห้ามเปลี่ยนสิทธิ์หรือทีมเพียงเพราะกรอก notification profile

| Name | Email | Role | Status | SeaTalk ID | Binding ที่แจ้งไว้ |
| --- | --- | --- | --- | --- | --- |
| Gear | sasin.cha@garena.com | PM | Fulltime | 1314586595 | ยังไม่กำหนด |
| Panu | panuwee.w@garena.com | Admin | Fulltime | 1377500911 | ยังไม่กำหนด |
| Big | nithidol.k@garena.com | Operations | Fulltime | 1445220434 | ยังไม่กำหนด |
| Mark | tanadech.s@garena.com | Operations | Fulltime | 1206017620 | ยังไม่กำหนด |
| Po | sakdarin@garena.com | Operations | Fulltime | 1369112417 | ยังไม่กำหนด |
| Aof | fco.thanayoot@garena.com | Operations | Freelance | 1432740223 | ยังไม่กำหนด |
| Folk | fco.koravit@garena.com | Operations | Freelance | 1353300313 | Creative / Review / group Njk2MTczMDEwNTg2 — pilot |
| Mac | weerayut@garena.com | Marketing | Fulltime | 1255866026 | ยังไม่กำหนด |
| No | chayodom.a@garena.com | Marketing | Fulltime | 1197173277 | ยังไม่กำหนด |
| May | kwanchanok.s@garena.com | Marketing | Fulltime | 1390103074 | ยังไม่กำหนด |
| Boss | fco.rittichai@garena.com | Marketing | Freelance | 1441103880 | Creative / Review / group aaaaaabbbbbb เป็นตัวอย่าง รอค่าจริง |
| Mag | fco.thanatbhum@garena.com | Marketing | Freelance | 1357378602 | ยังไม่กำหนด |
| Real | fco.punyakon@garena.com | Marketing | Freelance | 1273487552 | ยังไม่กำหนด |
| Pointer | fco.run@garena.com | Marketing | Freelance | 9533268306 | ยังไม่กำหนด |
| Pond | kasidet.y@garena.com | GD/VE | Fulltime | 1209781227 | Creative / Assign — pilot |
| Joe | nattaporn.j@garena.com | GD/VE | Fulltime | 1314586567 | Creative / Assign — รอเพิ่มผ่าน UI |
| Tong | fco.krittidech@garena.com | GD/VE | Freelance | 9269051929 | Creative / Assign / group MDI1MjA4MDEwMzE3 — รักษา route เดิม |
| Vee | fco.thanadon@garena.com | GD/VE | Freelance | 1407820524 | ยังไม่กำหนด |
| Pluem | napol.a@garena.com | Esport | Fulltime | 1163832699 | ยังไม่กำหนด |
| Net | fco.piyapat@garena.com | Esport | Freelance | 1449454583 | ยังไม่กำหนด |
| Ben | fco.kittipoj@garena.com | Esport | Freelance | 1424311164 | ยังไม่กำหนด |
| Peak | fco.pheerati@garena.com | Esport | Freelance | 1219076784 | ยังไม่กำหนด |
| Ploy | fco.thanyaporn@garena.com | Esport | Freelance | 1453800082 | ยังไม่กำหนด |

หลักการ onboarding: เลือกสมาชิกจริง → เลือก Bot → ระบุ Fulltime/DM หรือ Freelance/group และ SeaTalk identity → เลือก event → ตรวจ prerequisites → Preview/TEST → Admin Activate เมื่อผ่านเงื่อนไข สมาชิกที่ยังไม่มี GroupID หรือยังไม่เลือก event ต้องพักไว้ ไม่สร้าง subscription อัตโนมัติ

## 11. Roadmap ถัดไป

หลักฐาน global patterns และ spec review: [Configurable Notifications Research](research/2026-10-05-workgrid-configurable-notifications.md) แยกเอกสาร product capability, vendor-published customer case และข้อเสนอสำหรับ Workgrid โดยไม่อ้างว่าพิสูจน์ tenant SeaTalk ของเรา

- Automation controls: แยก scheduler, generation, notifier; ระบุ shared configuration ที่กระทบหลายกิจกรรมก่อน Apply
- Module lifecycle: active → stop-new → read-only → retired; จัดการ pending work, direct links, backend gates และประวัติ
- AI Assistant: เริ่ม read-only diagnosis; ใช้ playbooks ที่ตรวจและระบุ version; ต่อมาสร้าง proposal ผ่าน configuration service เดียวกับ UI
- AI ไม่ใช้บทสนทนาเก่าเป็นสิทธิ์ทำ side effects ไม่เปิด status commands และไม่สร้าง direct privileged bypass
- กฎ Assign/Review ใช้ deterministic runtime ไม่ต้องเรียก AI ทุกข้อความ; AI ในระยะถัดไปช่วยอธิบาย/เตรียม proposal ผ่าน service เดียวกัน

## 12. Design opening prompt สำหรับขั้นตอนออกแบบ UI

ใช้ Engineering Design Opening Prompt เป็นกรอบเมื่อเริ่ม prototype ข้อความนี้เป็น brief สำหรับรุ่นแรก ไม่ใช่ข้อเท็จจริงว่าหน้าจอถูกสร้างแล้ว:

> You are a senior product designer and systems designer. Design Workgrid Control Center, an administrative workspace inside the existing FlowMate/Workgrid application. The first release manages SeaTalk notifications for Creative Requests, Quick Tasks, and Activity Automation. Its goal is to let nontechnical administrators onboard recipients, connect team groups, configure supported notification rules, and investigate delivery problems without changing application code.
>
> Primary users are Thai-speaking administrators and team leads in Operations, Marketing, and eSports. Administrators can review and apply changes. Team leads can inspect their own team and propose changes, but cannot activate rules or send real tests. Preserve this distinction in every interaction. Prefer familiar Thai labels and task-oriented navigation over technical infrastructure terminology.
>
> Use the current application's typography, palette, navigation, and spacing as the starting point after inspecting its rendered UI. Build a calm, information-dense desktop layout with searchable tables, readable status badges with text, and a detail drawer. Use a consistent spacing scale, restrained semantic colors, and visible keyboard focus. On small screens, preserve the primary task and convert wide tables into readable records. Do not rely on color alone or add decorative charts without operational meaning.
>
> Include Overview, Bots, Recipients, Groups, Notification Rules, Delivery History, and Change Proposals/Audit. Prioritize adding a recipient and connecting a destination. Design Fulltime direct-message onboarding and Freelance group onboarding as different guided paths. Make manual SeaTalk steps explicit whenever the bot cannot invite external members. Separate preview from a real test message, and show the exact target before sending. Provide a before/after review with affected rules before Apply.
>
> In Bot Settings, show the SeaTalk App ID and distinguish Workgrid activation from platform connectivity and capability verification. Include Add, Check, Activate, Deactivate, and Remove connection flows without implying deletion of the SeaTalk app. Member details must show canonical roles, employment type, account status, SeaTalk identity, and multiple bot-specific group bindings. Group records must expose Group ID, bot identity, intended events, and separate activation and verification states. A supplied destination is not automatically verified or activated.
>
> Show work generation status separately from message delivery status. An accepted provider response must never appear as a human read receipt. Include loading, empty, permission-denied, stale verification, hidden group membership, version conflict, partial delivery, uncertain delivery, paused, and retired states. Secrets must never appear in screens or mock data. Keep automation/module write controls and AI chat outside this first-release prototype. Validate the result against the approved workflows and acceptance criteria rather than designing a generic chatbot dashboard.
