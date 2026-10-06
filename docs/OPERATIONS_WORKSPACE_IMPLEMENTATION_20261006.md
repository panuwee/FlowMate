# FlowMate Operations Workspace — local implementation

วันที่ 6 ตุลาคม 2026 · สถานะ: พร้อมตรวจงานออกแบบในเครื่อง ยังไม่ commit / push / deploy

## ผลลัพธ์

Activity Automation และ Control Center เป็นปลายทางใน Sidebar ของ FlowMate ใช้ Header, account, workspace selector และ Light/Dark ของ App เดียวกัน ไม่เพิ่มเป็น Home modules

- เมนูย่อยของแต่ละหน้าอยู่ในพื้นที่เนื้อหา ใช้ typography, spacing, panel และ controls ที่สอดคล้องกัน
- Activity แสดงงานที่ต้องดำเนินการก่อนรายละเอียดสุขภาพระบบ
- Control Center แยกคำอธิบายการพักแจ้งเตือนออกจากการสร้างงาน และเก็บขั้นตอน review / TEST / runtime เดิม
- URL เดิมเข้า App shell โดยรักษา query/deep link; เมนูย่อย, reload และ Back คืนมุมมองได้
- เนื้อหาเดิมอยู่ใน same-origin iframe เพื่อแยก CSS/handlers โดย parent ใช้ App shell จริง พร้อมส่ง theme และประสาน address/history
- คง permission checks และ business handlers เดิม ไม่มีการแก้ backend หรือ production SQL

## ไฟล์ในขอบเขตงาน

| ส่วน | ไฟล์ |
|---|---|
| Parent shell / routes / Sidebar | `app.jsx`, `app.js`, `app.css` |
| Child adapter / shared styles | `operations-workspace.jsx`, `operations-workspace.js`, `operations-workspace.css` |
| Activity content | `home/Activity-Automation.html`, `activity-automation-monitor.js` |
| Control content | `home/control-center.html`, `workgrid-control-center.jsx`, `workgrid-control-center.js` |
| Build / cache references | `build-github.cjs`, `home/index.html`, `index.html` |
| Local checks | `scripts/operations-ui.vitest.config.mjs`, `scripts/operations-workspace-preview.cjs`, `src/lib/activity-automation/operations-workspace.test.ts`, `src/lib/activity-automation/monitor-navigation.test.ts` |

Checkout มีงานอื่นค้างอยู่จำนวนมาก รวมถึงไฟล์ในตารางบางไฟล์ที่มีการแก้ก่อนงานนี้ ตารางนี้คือขอบเขตที่แตะ ไม่ใช่การอ้างว่าทั้ง diff จาก HEAD เป็นผลงานของงานนี้

## หลักฐานตรวจสอบ

- `npm.cmd run build:github` ผ่าน และ regenerate sibling JS สำหรับ browser source
- ชุดทดสอบเฉพาะงาน 73/73 ผ่าน: monitor UI 46, integrations 12, navigation 5, Control UI 6, adapter 4
- หลังแก้ timestamp/history ของ Control Center ทดสอบส่วนที่เกี่ยวข้องอีก 10/10 ผ่าน (เป็น subset ไม่ใช่รวม 83 ข้อไม่ซ้ำ)
- `node --check` ผ่านสำหรับ generated app / adapter / Control JS, monitor และ preview script
- Offline browser ใช้ App จริงพร้อม mock auth/RPC ที่ localhost ไม่มี production client หรือ provider
- ตรวจ viewport 1440×960 และ 390×844: ไม่มี page horizontal overflow, Sidebar สลับหน้าได้, local navigation sync URL, Back และ reload คืนมุมมองได้, theme ของ child ตรง parent
- ผู้รีวิวอิสระตรวจ source และภาพทั้ง 5 ภาพ สถานะสุดท้าย local-ready; ปิดปัญหาพื้นขาวเมื่อหน้า Control dark มีเนื้อหาสั้นด้วย html background และ body min-height

## ภาพ local preview

ภาพใช้ข้อมูลจำลอง ไม่ใช่ข้อมูลหรือหลักฐานการทำงานบน production

![Activity desktop](C:/Users/panuwee.w/.codex/visualizations/2026/10/05/01a10c05-1dd2-79a3-adbe-2ac1d1fd2d86/activity-desktop.png)

![Control desktop](C:/Users/panuwee.w/.codex/visualizations/2026/10/05/01a10c05-1dd2-79a3-adbe-2ac1d1fd2d86/control-desktop.png)

![Activity mobile](C:/Users/panuwee.w/.codex/visualizations/2026/10/05/01a10c05-1dd2-79a3-adbe-2ac1d1fd2d86/activity-mobile.png)

![Control mobile](C:/Users/panuwee.w/.codex/visualizations/2026/10/05/01a10c05-1dd2-79a3-adbe-2ac1d1fd2d86/control-mobile.png)

![Control dark canvas verified](C:/Users/panuwee.w/.codex/visualizations/2026/10/05/01a10c05-1dd2-79a3-adbe-2ac1d1fd2d86/control-dark.png)

## ข้อจำกัดและขั้นเผยแพร่

ยังไม่รับรอง WCAG 2.1 AA ทั้งระบบ, screen reader หรือ keyboard workflow ครบทุกเส้นทาง Detector ใช้ degraded regex fallback เพราะไม่มี parser modules; ผล `[]` ไม่ใช่ accessibility certification ไม่มีการทดสอบส่งข้อความจริงหรือเปลี่ยน runtime จริง

Canonical checkout ยังเป็น `version2.1` ไม่ใช่ release target `version2.1.1` คง branch และ worktrees เดิมไว้เพื่อรักษางานค้าง ไม่สร้างหรือลบ worktree งานนี้

ก่อนเผยแพร่ต้องตรวจ Git/remote ใหม่ แยก diff ของงานนี้จากงานอื่นและจัดแพ็กเกจบน release baseline ที่เหมาะสม การ commit, push และ deploy ต้องได้รับอนุมัติสำหรับขอบเขตนี้ตาม AGENTS.md

## เอกสารที่เกี่ยวข้อง

- [Audit และ redesign plan](FLOWMATE_AUTOMATION_CONTROL_CENTER_UX_AUDIT_20261006.md)
- [Scoped design reference](OPERATIONS_WORKSPACE_DESIGN_20261006.md)
