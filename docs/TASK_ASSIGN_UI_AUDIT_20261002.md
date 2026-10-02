# Task Assign — review, audit และ polish

วันที่ 2 ตุลาคม 2026 · สถานะ: local เท่านั้น

## ขอบเขตและแนวทางออกแบบ

ตรวจหน้า `#task-assign-create` และ `#task-assign-detail/QT-1001` บนเว็บไซต์จริงแบบอ่านอย่างเดียว จากนั้นปรับ source ใน worktree Task Assign ตามที่ผู้ใช้อนุญาต ใช้ Engineering Design Opening Prompt เพื่อกำหนดโจทย์ และ Impeccable audit/polish เพื่อจัดลำดับปัญหา

- บทบาท: ออกแบบเครื่องมือทำงานสำหรับผู้สร้างงาน ผู้รับผิดชอบ และผู้จัดคิวของทีม
- เป้าหมาย: กรอกงานได้ต่อเนื่อง อ่านผู้รับผิดชอบ สถานะ และกำหนดส่งได้เร็ว แล้วเลือกการดำเนินงานที่เหมาะสม
- ผู้ใช้: ทีม Marketing, Operations และ eSports ซึ่งต้องแยกงานในทีมจากคำขอข้ามทีมให้ชัด
- ระบบภาพ: รักษา Garena, Inter, สีและธีมเดิม ใช้เส้นแบ่งและหัวข้อแทนการเพิ่มการ์ดตกแต่ง
- Layout: Create แบ่งเป็น Task brief, Responsibility, Schedule & priority, References & related task; Detail แยก brief และ actions บน desktop และเรียงลงบนมือถือ
- ข้อจำกัด: คงข้อมูล สิทธิ์ RPC และขั้นตอนเดิม; ไม่แตะ SQL งานค้างอื่น หรือ Task จริง

## ผล audit หลังปรับ

Implementation integrity: ผ่านในขอบเขต diff ที่ตรวจ เงื่อนไขสิทธิ์และคำสั่งเดิมยังอยู่ ไม่มี dependency หรือ animation ใหม่ การประเมินนี้ไม่ใช่การรับรอง WCAG หรือการวัดประสิทธิภาพ production

| มิติ | คะแนน / 4 | หลักฐานและข้อจำกัด |
| --- | --- | --- |
| Accessibility | 3 | fieldset/legend, section headings, dl, error association, focus ไปช่องแรกที่ผิด, controls 44px; ไม่ได้ทดสอบด้วย screen reader จริง |
| Performance | 3 | ไม่เพิ่ม library/request/animation; console error ของ preview ว่าง แต่ไม่ได้ทำ benchmark |
| Responsive | 3 | ตรวจ desktop 1440px, tablet 820px, mobile 390px; เนื้อหาและ body ไม่ล้นแนวนอนในค่าที่วัด |
| Theming | 3 | ตรวจ Light และ Dark รายละเอียด ปรับ foreground และสีปุ่ม; ไม่ได้ตรวจทุกสถานะบนทุก browser |
| Implementation integrity | 3 | ทดสอบ form/client 10 ข้อ และ detail permissions/actions 2 ข้อ ผ่าน; ตรวจโค้ดแยกสองรอบ |
| **รวม** | **15 / 20** | **Good — คะแนนเชิงประเมินสำหรับขอบเขตนี้** |

## ปัญหาที่พบและแก้

| ระดับ | ปัญหา / ผลต่อผู้ใช้ | การแก้ |
| --- | --- | --- |
| P2 | Create มีการ์ดเลือกประเภทเดียว กินพื้นที่ก่อนถึงฟอร์ม | เอาการ์ดเลือกที่ซ้ำออกใน Task Assign และแบ่งกลุ่มฟอร์ม |
| P2 | กำหนดส่งและข้อมูลประกอบใน detail ปนอยู่ในข้อความ | แยก facts เป็นชื่อข้อมูลและค่า แยก actions เป็นอีกส่วน |
| P2 | Cancel task อยู่ในกลุ่มปุ่มดำเนินงาน | แยกท้าย actions ด้วยเส้นแบ่ง โดยคงคำสั่งเดิม |
| P1 | กรอกไม่ครบแล้วผู้ใช้ยังอยู่ท้ายฟอร์ม; error ไม่เชื่อมช่องกรอก | เพิ่ม aria-invalid/describedby และ focus ช่องแรกที่ผิด |
| P2 | CSS ระหว่างพัฒนาเคยยุบ sidebar ก่อนซ่อนชื่อเมนู | ใช้ breakpoint 760px ให้ตรง shell; ตรวจ 820px แล้ว |
| P1 | Dark theme ใช้ foreground ที่อ่านยากกับปุ่มและ selection | ปุ่มหลัก/selection ใช้ขาว; Cancel ใช้แดงสว่างใน Dark |

การตรวจแยกยืนยันว่า 3 จุดที่ระบุเรื่อง sidebar, Cancel contrast และ selection ได้แก้แล้ว Contrast ที่คำนวณ: Cancel ใน Dark 10.33:1; ขาวบนแดงแบรนด์ 4.65:1

จุดเดิมที่ดีและรักษาไว้: การเลือก assignee ด้วยคีย์บอร์ด, การส่งข้ามทีมเข้าคิว, การกรองลิงก์ HTTP(S), การแยก requested/committed deadline และสิทธิ์ requester/dispatcher/executor

## หลักฐานการตรวจ

- `npm.cmd run build:github` ใน worktree: ผ่าน เปลี่ยนเฉพาะ generated `screens-a.js` และ `screens-task-assign.js`
- `npx.cmd vitest run src/lib/task-assign-workspaces-ui.test.ts src/lib/task-assign-detail-ui.test.ts`: 12/12 ผ่าน ใช้ mock ใน happy-dom ไม่มี production client
- `git diff --check` สำหรับไฟล์ที่แก้: ผ่าน
- Browser preview โหลด source จริงใน shell ด้วย mock RPC; ไม่มี Supabase credentials หรือ production client
- Create: ตรวจ validation, focus `task-title`, aria-invalid/error association และเลือกทีมข้ามทีมแล้วซ่อน assignee พร้อมเปลี่ยนเป็น Send request
- Detail: ตรวจ desktop/mobile, requested/committed facts, comments empty state และ Dark
- ขนาดที่วัด: Detail 1440px body/main ไม่ล้น; Detail 390px body/main ไม่ล้น; Create 820px body/main ไม่ล้น และ sidebar 219px
- Detector รันหนึ่งครั้ง พบ 9 warnings เรื่อง accent border ใน CSS เดิมนอก diff; ไม่พบในส่วน CSS ใหม่ ไม่แก้งานนอกขอบเขต
- มี warning จาก test framework เดิมเกี่ยวกับ `ReactDOMTestUtils.act` ที่ deprecated แต่ tests ผ่าน

## ข้อจำกัดที่เหลือ

Topbar รวมของแอปยังเลื่อนแนวนอนได้เมื่อเมนูทั้งหมดกว้างกว่าพื้นที่ ใช้การเลื่อนภายใน topbar เพื่อไม่ให้เนื้อหาหน้าล้น งานนี้ไม่ได้เปลี่ยนเมนูผลิตภัณฑ์รวม

ยังไม่ได้ทำ screen reader UAT, production mutation, performance benchmark, commit, push หรือ deploy เว็บไซต์ที่ผู้ใช้ส่งมายังเป็นรุ่นเดิม

## ภาพตัวอย่าง local

ภาพทั้งหมดเป็นข้อมูลจำลอง ไม่ใช่ Task QT-1001 จริง

- [Create desktop](../output/task-assign-polish/create-desktop.jpg)
- [Create mobile](../output/task-assign-polish/create-mobile.jpg)
- [Detail desktop](../output/task-assign-polish/detail-desktop.jpg)
- [Detail mobile](../output/task-assign-polish/detail-mobile.jpg)
- [Detail dark](../output/task-assign-polish/detail-dark.jpg)

ขั้นตอนถัดไป: ตรวจภาพ local นี้ก่อนตัดสินใจเรื่อง release ซึ่งต้องได้รับอนุญาตแยกต่างหาก
