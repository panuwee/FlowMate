# FlowMate Board: Active Board, Delivered History และ 60-Day Archive

Date: 2026-08-04  
Status: Confirmed design — ready for implementation planning  
Owner: FlowMate Team Workspace  
Design mode: Multi-agent Plan Mode

## 1. เป้าหมาย

ปรับหน้า Board ให้รองรับจำนวน Task ที่เพิ่มขึ้นในระยะยาว โดยยังมองเห็นงาน Active ทั้งหมดได้ง่าย ไม่ต้องเลื่อนหน้าเว็บลงยาวเพื่อไปหา Delivered และไม่ทำลายประวัติงานที่ใช้สำหรับค้นหา ตรวจสอบ และคำนวณรายงานย้อนหลัง

ผลลัพธ์ที่ต้องการ:

- ผู้ใช้เห็นงานที่ต้องลงมือทำในหน้าจอเดียวมากขึ้น
- Delivered แยกออกจากพื้นที่ทำงานประจำวัน แต่ยังค้นหาและเปิดดูย้อนหลังได้
- งาน Delivered ที่เก่ากว่า 60 วันถูกย้ายเข้า Archive อัตโนมัติ โดยไม่ลบข้อมูล
- List, Search, Calendar, Workload, KPI, Notifications และ Detail แสดงข้อมูลสอดคล้องกัน

## 2. ปัญหาปัจจุบัน

Board ปัจจุบันมี 6 คอลัมน์และวางด้วย Grid 5 คอลัมน์ ทำให้ `Delivered` ตกไปอยู่แถวที่สอง เมื่อ `Assigned`, `In Progress` หรือ `Review` มี Task จำนวนมาก ผู้ใช้ต้องเลื่อนหน้าเว็บลงไกลมากเพื่อดูสถานะถัดไป

นอกจากนี้ Board โหลดข้อมูลที่ยังไม่ Archive ทั้งหมดจากตัวโหลดเดียวกับ List แล้วแบ่งรายการใน Browser จึงยังไม่เหมาะกับปริมาณข้อมูลที่โตต่อเนื่อง

## 3. ขอบเขตที่ยืนยันแล้ว

### 3.1 Workflow Status บน Board

Board ใช้ 6 สถานะ:

1. `Unassigned`
2. `Assigned`
3. `In Progress`
4. `Review`
5. `Blocked`
6. `Delivered`

ข้อสำคัญ: ฐานข้อมูลกลางยังมีสถานะอื่น เช่น `Need Brief`, `Queued` และ `Cancelled` สำหรับหน้าจอหรือกระบวนการอื่น การปรับนี้ไม่ได้ลบหรือเปลี่ยนสถานะเหล่านั้น

### 3.2 Information Architecture

ภายในหน้า Board มี 2 แท็บระดับบน:

- `Active Board` — ค่าเริ่มต้น
- `Delivered`

`Archive` ไม่ใช่สถานะที่ 7 แต่เป็น Lifecycle ของข้อมูล โดยใช้ `archived_at` และข้อมูล Audit ที่เกี่ยวข้อง

## 4. Active Board

### 4.1 Layout บน Desktop

แสดง 5 คอลัมน์ในแถวเดียวตามลำดับ:

`Unassigned | Assigned | In Progress | Review | Blocked`

กติกาการแสดงผล:

- ห้ามขึ้นคอลัมน์แถวที่สอง
- ความสูง Board พอดีกับพื้นที่หน้าจอที่เหลือใต้ Header และ Tab
- Header ของแต่ละคอลัมน์ต้อง Sticky
- Task ภายในแต่ละคอลัมน์เลื่อนขึ้นลงได้อย่างอิสระ
- การเลื่อนคอลัมน์หนึ่งต้องไม่เลื่อนคอลัมน์อื่น
- แสดงจำนวน Task ทั้งหมดที่ Header เช่น `Assigned 19`
- ท้ายคอลัมน์มี `View all in List` และส่ง Status filter ไปหน้า List ให้พร้อมใช้งาน
- หน้าเว็บหลักไม่ควรยาวตามจำนวน Card ในคอลัมน์
- Task ที่มีสิทธิ์จบงานต้องมี Action `Mark Delivered` หรือ `Mark done` บน Card/Detail เสมอ เพราะไม่มีคอลัมน์ Delivered ให้ลากไปวางแล้ว
- ระหว่างลาก สามารถแสดง Delivered drop target ชั่วคราวเป็นทางลัดได้ แต่ต้องไม่ใช่วิธีเดียวในการจบงาน

### 4.2 Tablet และ Mobile

- ใช้ Horizontal scroll พร้อม Scroll snap ทีละคอลัมน์
- ความกว้างคอลัมน์ต้องอ่าน Card ได้โดยไม่บีบข้อมูล
- แตะ Card เพื่อเปิด Detail
- ห้ามพึ่ง Drag-and-drop เป็นวิธีเดียวในการเปลี่ยนสถานะ เพราะ Mobile และ Keyboard ใช้งานยาก
- ผู้ใช้ต้องเปลี่ยนสถานะผ่าน Action ใน Detail หรือเมนูของ Card ได้ตามสิทธิ์เดิม
- ปุ่มและ Touch target สำคัญมีขนาดอย่างน้อย 44 x 44 px

### 4.3 Card Content

Card แสดงข้อมูลเท่าที่ช่วยตัดสินใจ:

- Task ID
- Priority โดย `Urgent` ต้องเด่นชัด
- Title
- Owner
- Effort และ Checklist progress
- Due date / Overdue
- Blocked reason เมื่อสถานะเป็น `Blocked`

Blocked reason เป็นข้อมูลบังคับตาม Backend เดิม และต้องไม่ถูกซ่อนใน Card

### 4.4 Sorting

ทุกคอลัมน์เรียงตามกติกาเดียวกัน:

1. `Urgent` ก่อน
2. Due date ใกล้ที่สุดก่อน
3. หากเท่ากัน ให้ Task ที่สร้างก่อนอยู่ก่อน
4. หากยังเท่ากัน ให้เรียง Task ID เพื่อให้ลำดับคงที่เมื่อ Refresh

รายการที่ไม่มี Due date อยู่หลังรายการที่มี Due date และยังใช้ Created date ตัดสินลำดับ

### 4.5 WIP Signal

แสดงสัญญาณ WIP เฉพาะ:

- `In Progress`: แนะนำ 2–3 งานต่อคน
- `Review`: แนะนำ 5–8 งานต่อทีม

หลักการ:

- ใช้ Warning ก่อน ไม่บังคับ Block งาน Urgent จาก UI
- `Assigned` เป็น Queue จึงไม่มี WIP limit
- WIP ส่วนบุคคลเดิมของระบบยังนับเฉพาะ `In Progress`
- Threshold ของ `Review` เป็น Team queue warning ไม่ใช่การเปลี่ยนสูตร Capacity/KPI
- Count สำหรับ Warning ต้องใช้ Task ทั้ง Workspace ไม่ใช่เฉพาะรายการที่เหลือหลัง Filter
- Backend ปัจจุบันยัง Block การ Start/Resume เมื่อผู้รับผิดชอบเต็ม WIP ดังนั้น `warning-only` เป็น Design target ที่ต้องแก้และทดสอบฝั่ง Backend ไม่ใช่แก้ UI อย่างเดียว
- Implementation plan ต้องระบุ Urgent override, Audit event และ Regression ของ Assignment rules ก่อนเปลี่ยน Enforcement เดิม

## 5. Delivered Tab

### 5.1 รูปแบบ

ใช้ List/Table แทน Kanban เพราะ Delivered เป็นประวัติงาน ไม่ใช่คิวที่ต้องลากข้ามสถานะ

คอลัมน์แนะนำ:

- Task ID
- Title
- Campaign
- Owner
- Delivered date/time
- Due result: On time / Late
- Work type
- Action: Open detail

ค่าเริ่มต้นเรียง `Delivered date ใหม่ที่สุดก่อน`

### 5.2 Search และ Filter

ต้องรองรับ:

- ค้นหาด้วย Task ID, Title หรือ Campaign
- Filter เดือนที่ Delivered
- Filter Campaign
- Filter Owner
- Scope `Last 60 days` เป็นค่าเริ่มต้น
- Scope `Archived` สำหรับค้นหาข้อมูลเก่ากว่า 60 วัน
- Reset filters ในคลิกเดียว

Delivered data ต้อง Lazy-load เมื่อผู้ใช้เปิดแท็บ ไม่โหลดพร้อม Active Board

`Export current result` เป็นส่วนเสริมหลัง MVP โดย Export เฉพาะผลลัพธ์ตาม Filter ปัจจุบัน

### 5.3 Pagination และ Empty States

- Query และ Pagination ต้องทำฝั่ง Server ไม่ดึง Delivered ทั้งหมดมาแบ่งหน้าใน Browser
- ค่าเริ่มต้น 50 รายการต่อหน้า
- แสดง Total count ที่ตรงกับ Filter
- แยกข้อความกรณีไม่มี Delivered, ไม่มีผลค้นหา และโหลดข้อมูลไม่สำเร็จ
- การ Refresh ต้องคง Tab, Filter และหน้าปัจจุบันเท่าที่ข้อมูลยังรองรับ

## 6. 60-Day Archive Lifecycle

### 6.1 กติกา Auto Archive

Task เข้า Archive เมื่อ:

```text
status = Delivered
AND delivered_at <= current_time - 60 days
AND archived_at IS NULL
AND archive_exempt_until ไม่อยู่ในอนาคต
```

กติกาเพิ่มเติม:

- ใช้ `delivered_at` เป็น Source of truth ไม่ใช้ Created date
- Archive เป็น Soft archive เท่านั้น ห้าม Hard delete
- Job ต้องทำงานแบบ Idempotent: รันซ้ำแล้วไม่สร้างผลซ้ำ
- แนะนำรันวันละครั้งในช่วงใช้งานน้อย โดยเวลา Scheduler ให้กำหนดใน Implementation plan
- บันทึก Event และเหตุผลมาตรฐาน เช่น `auto_delivered_retention_60d`
- System archive สามารถมี `archived_by_user_id = null` แต่ Event ต้องระบุว่าเกิดจาก Scheduler

### 6.2 Legacy Data

รายการ Delivered เดิมที่ `delivered_at` ว่าง ห้าม Archive จาก `updated_at` แบบเงียบ ๆ

ลำดับการ Backfill:

1. ใช้เวลาจาก Event ที่เปลี่ยนสถานะเป็น Delivered
2. หากไม่มี Event ให้สร้างรายการ Exception สำหรับ Admin ตรวจสอบ
3. Archive อัตโนมัติเฉพาะแถวที่มีวันที่อ้างอิงชัดเจน

### 6.3 Search และ Restore

- Archived item ยังค้นหาและเปิด Detail แบบ Read-only ได้
- Restore เป็นสิทธิ์ Admin เท่านั้น และต้องขอเหตุผล
- Restore จะล้าง `archived_at`, บันทึกผู้ดำเนินการและ Event
- เพื่อให้มีเวลาซ่อมข้อมูลก่อนถูก Archive ซ้ำ ให้มี Grace period 7 วันผ่าน `archive_exempt_until`; ค่านี้เป็นส่วนหนึ่งของ Restore contract ไม่ใช่ Workflow status
- หากครบ Grace period แล้วยังเป็น Delivered และเก่ากว่า 60 วัน ระบบ Archive ซ้ำได้
- หากต้องนำ Task กลับมาทำงาน ให้ใช้ Status transition ที่ Backend อนุญาต ไม่ใช้ Restore เพื่อหลบ Workflow

## 7. Data และ Backend Contract

### 7.1 สิ่งที่มีอยู่แล้วและต้องใช้ต่อ

- `work_items.delivered_at`
- `work_items.archived_at`
- `work_items.archived_by_user_id`
- `work_items.archive_reason`
- Index ของ `archived_at`
- Backend status transition และ Validation เดิม
- Admin archive RPC เดิมสำหรับการ Archive ด้วยคน
- Shared-team read policy และสิทธิ์ Team Workspace เดิม

### 7.2 สิ่งที่ต้องเพิ่มใน Implementation

- `archive_exempt_until` สำหรับ Restore grace period
- RPC สำหรับ Admin restore พร้อม Audit event
- Function สำหรับ Auto archive ที่รับเฉพาะ Delivered เกิน 60 วัน
- Scheduled job เรียก Function แบบ Server-side
- Query แยกสำหรับ Active Board, Delivered 60 วัน และ Archived history
- Server-side Filter, Sort, Pagination และ Count

Active Board query ต้องตัดทั้ง `Delivered` และ Archived ตั้งแต่ฝั่ง Server ไม่ดึงมาแล้วค่อยกรองใน Browser

ห้ามเปิด Direct table write จาก Frontend งานเขียนต้องผ่าน RPC/Status machine ตามแนวทางเดิม

## 8. ผลกระทบต่อหน้าจอและรายงานรอบข้าง

| Surface | กติกาหลังปรับ |
|---|---|
| Active Board | แสดงเฉพาะ 5 Active statuses และ `archived_at IS NULL` |
| Delivered tab | แสดง Delivered ที่ยังไม่ Archive ใน 60 วันล่าสุดเป็นค่าเริ่มต้น และสลับดู Archive ได้ |
| List | รองรับ Status filter เดิม; `View all in List` ต้องส่ง Filter ถูกต้อง; Archive ซ่อนโดย Default |
| Global Search | ค้นหา Active ตามเดิม และมีทางเลือกค้นหา Archive อย่างชัดเจน ไม่ปะปนโดยไม่บอกผู้ใช้ |
| Calendar / Team Schedule | ไม่แสดง Archived โดย Default |
| Workload | ไม่นับ Delivered หรือ Archived เป็น Active workload |
| KPI / Reporting | ยังนับ Delivered history ตามช่วงวันที่ แม้รายการถูก Archive แล้ว |
| Notifications | Archive job ไม่ส่ง Notification รายบุคคลจำนวนมาก; เก็บ Event/Audit แทน |
| Task Detail | เปิด Archived แบบ Read-only และแสดง Archived date/reason; Admin เห็น Restore |
| RLS / Authorization | ใช้ Shared-team read และ Admin action เดิม; ไม่ขยายสิทธิ์ในงานนี้ |

จุดห้ามพลาด: View สำหรับ Active workload สามารถซ่อน Archived ได้ แต่ Query ของ Historical KPI ห้ามกรอง Archived ออก มิฉะนั้นตัวเลขเก่าจะลดลงหลังครบ 60 วัน

## 9. Accessibility และ Resilience

- Tab ใช้ Semantic tab pattern และใช้งานด้วย Keyboard ได้
- คอลัมน์และ Card มี Focus state ที่มองเห็นชัด
- มีวิธีเปลี่ยนสถานะโดยไม่ใช้ Drag-and-drop
- จำนวน Task และ WIP warning ต้องไม่สื่อด้วยสีอย่างเดียว
- Screen reader อ่าน Status, Priority, Due state และ Blocked reason ได้
- ระหว่างโหลดให้แสดง Skeleton/Loading โดยไม่ทำ Layout กระโดด
- หากการย้าย Card ล้มเหลว ให้คืน Card ตำแหน่งเดิมและแสดงข้อความจาก Backend
- Realtime refresh ต้องไม่รีเซ็ต Scroll position ของทุกคอลัมน์โดยไม่จำเป็น
- ใช้ Pending state เฉพาะ Card ที่กำลังเปลี่ยนสถานะ ไม่ Freeze ทั้ง Board
- หากมีผู้ใช้อื่นเปลี่ยน Task เดียวกันก่อน ให้ Refresh เฉพาะ Card/Count ที่เกี่ยวข้องและแสดงเหตุผลจาก Backend

## 10. Acceptance Criteria

### Active Board

- `BOARD-01`: Desktop แสดง 5 Active columns ในแถวเดียว และไม่มี Delivered อยู่ด้านล่าง
- `BOARD-02`: แต่ละคอลัมน์เลื่อนแนวตั้งแยกกัน และ Header ยังมองเห็นเมื่อเลื่อน
- `BOARD-03`: Page height ไม่เพิ่มตามจำนวน Card
- `BOARD-04`: Count ของแต่ละคอลัมน์ตรงกับข้อมูลจาก Server
- `BOARD-05`: Sorting เป็น Urgent → Due nearest → Oldest อย่างคงที่
- `BOARD-06`: Blocked Card แสดง Blocked reason
- `BOARD-07`: `View all in List` เปิด List พร้อม Status filter ที่ถูกต้อง
- `BOARD-08`: Mobile เลื่อนแนวนอนทีละคอลัมน์และเปลี่ยนสถานะได้โดยไม่ต้องลาก
- `BOARD-09`: Backend ยังคงปฏิเสธ Transition ที่ผู้ใช้ไม่มีสิทธิ์หรือข้อมูลไม่ครบ
- `BOARD-10`: Quick Task และ Creative Request ที่มีสิทธิ์จบงานได้ผ่าน Action โดยไม่ต้องมี Delivered column
- `BOARD-11`: เมื่อส่งงานสำเร็จ Card หายจาก Active และปรากฏใน Delivered โดย Count ตรงกัน

### Delivered และ Archive

- `DEL-01`: Delivered tab เปิดเป็น Table และเรียงใหม่ที่สุดก่อน
- `DEL-02`: Search, Month, Campaign และ Owner filter ใช้ร่วมกันได้
- `DEL-03`: Default แสดง Delivered ในช่วง 60 วัน และใช้ Server-side pagination
- `DEL-04`: Task เกิน 60 วันที่มี `delivered_at` ถูก Archive โดย Job และไม่ถูกลบ
- `DEL-05`: Job รันซ้ำไม่สร้าง Archive event ซ้ำให้รายการเดิม
- `DEL-06`: Archived item ค้นหา เปิด Detail และตรวจ Audit trail ได้
- `DEL-07`: เฉพาะ Admin ที่ Restore ได้ และต้องใส่เหตุผล
- `DEL-08`: Restore มี Grace period 7 วันก่อนมีสิทธิ์ถูก Archive ซ้ำ
- `DEL-09`: Historical KPI ไม่เปลี่ยนเพราะ Soft archive
- `DEL-10`: Active Workload และ Active count ไม่นับ Delivered/Archived
- `DEL-11`: Boundary 59, 60 และ 61 วันให้ผลตรงตาม `delivered_at <= now() - 60 days`

### Regression

- `REG-01`: List, Search, Calendar, Workload, KPI, Notifications และ Detail ใช้กติกา Archive ตรงกัน
- `REG-02`: Quick Task และ Creative Request ยังใช้ Status transition เดิม
- `REG-03`: Near real-time update ยังทำงานและไม่ทำให้ Filter/Scroll สูญหาย
- `REG-04`: Shared-team read และ Admin permission ไม่ถูกขยายโดยไม่ตั้งใจ
- `REG-05`: การ Deliver Creative Request ยัง Sync Marketing Plan ตาม Contract เดิม
- `REG-06`: Keyboard, Screen reader, Mobile และ Zoom 200% ใช้เส้นทางหลักได้ครบ

## 11. Implementation Workstreams

| Workstream | Deliverable | Dependency | Definition of Done |
|---|---|---|---|
| A — Data lifecycle | Migration, restore RPC, auto-archive function, scheduler, audit events | ไม่มี | SQL tests ผ่าน, idempotency ผ่าน, legacy exception ตรวจได้ |
| B — Active Board UI | 5 lanes, viewport layout, internal scroll, sticky header, sort, WIP signal, List links | ใช้ Query contract เดิมได้ระหว่างพัฒนา | Desktop/mobile/keyboard checks ผ่าน |
| C — Delivered History | Tab, table, filters, server pagination, archive scope, read-only detail | ต้องรู้ Query/RPC จาก A | Filter/count/restore permission tests ผ่าน |
| D — Integration & QA | Adjacent surfaces, KPI history, realtime, regression, build outputs | A–C | Automated tests, build และ visual QA ผ่าน |

ลำดับส่งต่อ:

1. Lock API/query contract ระหว่าง A, B และ C
2. ทำ A และ B ขนานกัน
3. ทำ C เมื่อ Contract ของ A พร้อม
4. ให้ D ตรวจทั้งระบบและไฟล์ Build ที่ใช้ Deploy จริง

## 12. Rollout และ Safety

- Deploy SQL ก่อน Frontend ที่เรียก RPC/Query ใหม่
- Backfill `delivered_at` แบบ Preview และรายงาน Exception ก่อนเปิด Auto archive
- เปิด Delivered tab ก่อน แล้วตรวจจำนวนเทียบกับ List
- เปิด Scheduler หลังยืนยัน KPI/Reporting ว่ายังอ่าน Archived history
- รอบแรกให้ Job ทำ Dry run และรายงานจำนวน Candidate ก่อนทำจริง
- เก็บจำนวน Archived/Restored/Failed ต่อรอบเพื่อใช้ตรวจสอบ
- หากต้อง Rollback ให้ปิด Scheduler ก่อน; Soft archive สามารถ Restore ได้โดยไม่สูญข้อมูล

## 13. Out of Scope

- เพิ่ม Workflow status ที่ 7
- Hard delete งานเก่า
- เปลี่ยน Team Workspace authorization
- เปลี่ยนสูตร Capacity หรือ KPI โดยไม่มีการตัดสินใจแยก
- เพิ่ม Dependency, Critical path หรือ Gantt behavior
- ทำให้ Drag-and-drop ข้าม Backend validation

## 14. Current Repository Evidence

- Board ปัจจุบันประกาศ 6 คอลัมน์ใน `github/screens-b.jsx`
- CSS ปัจจุบันใช้ Grid 5 คอลัมน์และคอลัมน์สูงตาม Content ใน `github/app.css`
- Frontend loader กรอง `archived_at IS NULL` ใน `github/supabase-list-data.js`
- Schema มี Delivered/Archive fields และ Index อยู่แล้วใน `supabase/schema.sql`
- Admin archive RPC อยู่ใน `supabase/collaboration_admin.sql`
- Blocked reason แสดงใน Card และ Backend บังคับข้อมูลนี้อยู่แล้ว
- Active workload view ไม่รวม Archived อยู่แล้ว แต่ Historical KPI ต้องตรวจแยกก่อนเปิด Scheduler
- `github/screens-b.jsx` เป็น Source; Build สร้าง `github/screens-b.js` ที่หน้า Deploy ใช้งานจริง จึงต้อง Build และตรวจทั้งสองไฟล์ก่อนส่งขึ้น GitHub

## 15. Review Gate

Design นี้ถือว่ายืนยันด้าน Product และ UX แล้ว ขั้นถัดไปคือสร้าง Implementation plan ที่ระบุ:

- SQL/RPC signature ที่แน่นอน
- Query contract และ Pagination response
- ไฟล์ที่จะเปลี่ยนจริงทั้ง Source และ Build output
- Test cases ต่อ Workstream
- ลำดับ Manual GitHub upload และ Supabase rollout

ยังไม่ควรเริ่มแก้ Production code จนกว่า Implementation plan ผ่าน Review gate นี้
