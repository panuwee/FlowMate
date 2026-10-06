Method: dual-agent (A: /root/design_review · B: /root/technical_evidence)

# FlowMate: Activity Automation และ Control Center — UI/UX audit

วันที่: 6 ตุลาคม 2026 (Asia/Bangkok)

## Engineering Design Opening Prompt

You are a principal product designer and lead UX architect. Design a high-fidelity integration blueprint for two existing FlowMate operational surfaces: Activity Automation and Control Center. This is an authenticated internal web application for people coordinating creative work, reviewing automation results, and managing notification settings. Success means users can enter either destination from the existing FlowMate sidebar, understand where they are, see what needs attention, and return to their work without learning a different application shell.

The incumbent FlowMate interface is the visual authority. Reuse its Garena logo, header composition, module navigation, account presentation, theme controls, sidebar structure, and active-navigation treatment. Activity Automation and Control Center are sidebar destinations inside FlowMate. Preserve that information architecture. Use the existing source-defined typography, neutral surfaces, borders, spacing tokens, and component geometry. Reserve semantic green for successful states and semantic red for failures; use the existing brand treatment for navigation. Inspect the existing token definitions before choosing colors. Where current secondary text lacks sufficient contrast, specify an accessible foreground rather than reproducing the defect. Avoid introducing another logo, a separate green identity, or an independent full-height secondary sidebar.

Within the main content area, use a consistent page header, a concise purpose statement, visible data freshness, a refresh action, and local navigation. Activity Automation needs its existing overview, activities, run history, notifications, and permission-dependent Battle Pass tools. Prioritize actionable work and unresolved incidents, then show automated-check health and supporting history. Retain production and test selection, activity and month filters, project identity, evidence links, and detail workflows. Control Center needs overview, bots, recipients, SeaTalk groups, rules, delivery history, and proposals/audit. Group related configuration choices without removing functions. Keep notification enablement explicit about its effect and retain review/confirmation safeguards.

Design loading, empty, access-denied, stale-data, partial-error, and offline states as separate states. Never equate an unknown value with zero or provider acceptance with human receipt. Preserve all existing authorization and business rules. Maintain URL-addressable local views, filters, and back navigation. On narrow screens, collapse global navigation and keep local navigation usable without page-wide horizontal overflow. Require clear focus indicators, semantic headings and controls, announced loading/results, and 48px primary touch targets. Produce desktop and mobile blueprints plus a component mapping to the incumbent interface; document observed facts separately from proposed changes and untested behavior.

## Scope and evidence

รายงานนี้ตรวจ UX และวางแผนการปรับหน้าตา ยังไม่แก้ UI, ฐานข้อมูล หรือเผยแพร่ระบบ

เป้าหมาย:

- `home/Activity-Automation.html`
- `home/control-center.html`
- ตัวอ้างอิง: ภาพ FlowMate My work ที่ผู้ใช้แนบ, `app.jsx`, `app.css`, `garena/colors_and_type.css`

ผู้ตรวจ A ประเมินการออกแบบโดยไม่เห็นผล detector ของ B; root รับผล B หลัง A เสร็จ

### หลักฐาน browser และ accessibility ที่วัดได้

เปิด live URLs ใน fresh browser tabs แบบอ่านอย่างเดียว: Activity แสดง “เข้าสู่ระบบแล้ว”, Control แสดง “Admin · ใช้ค่าจริงได้”; Home มีเฉพาะ Task Assign, FlowMate, Marketing Plan, Product Book และ OT Request เป็นการ์ด จึงยืนยันว่าทั้งสองไม่ได้เป็น Home modules ไม่มีการกดเปลี่ยนค่า/ส่งข้อความ/เปลี่ยนสิทธิ์

| รายการที่วัดจาก DOM / computed style | ผล |
|---|---|
| Activity ปุ่มรีเฟรช / selects / month input | สูง 43.09 / 41 / 45.09px |
| Control navigation / รีเฟรช / primary buttons | สูงประมาณ 42px |
| Control return link | 78.45 × 20px |
| Control focus ring `#c09c32` บนขาว | 2.61:1; ต่ำกว่าเกณฑ์ component contrast 3:1 |
| Activity input border `#d5d9df` บนขาว | 1.42:1; ควรเพิ่ม contrast เมื่อขอบจำเป็นในการระบุช่องกรอก |
| Control input border `#bdcdc1` บนขาว | 1.66:1; ข้อจำกัดเดียวกัน |
| Activity muted text `#626974` บนขาว | 5.54:1 ผ่าน text benchmark |
| Control muted text `#63746b` บนขาว | 4.95:1 ผ่าน text benchmark |
| Control primary button ขาวบน `#236649` | 6.84:1 ผ่าน text benchmark |
| Activity focus blue `#3775a9` บนขาว | 4.91:1 ผ่าน component benchmark |

ค่าข้างต้นเป็นตัวอย่างที่วัด ไม่ใช่การรับรอง accessibility ทั้งหน้า ปุ่มต่ำกว่า 48px ไม่ใช่หลักฐานว่าไม่ผ่าน WCAG 2.1 AA โดยตัวมันเอง

Detector ทำงานแล้ว แต่ parser HTML/CSS dependencies ไม่ครบจึงใช้ regex fallback; ผล `[]` ไม่ถือว่าหน้าผ่านหรือไม่มีปัญหา การวัด contrast ทำแยกด้วย WCAG relative luminance

ทั้งสองมี labels/native controls/live status/native dialog และ responsive CSS อยู่แล้ว Activity มีการคืน focus ไปยัง opener ใน source; ตารางมือถือและพื้นที่เลื่อนตารางต้องทดสอบกับ keyboard และ screen reader ก่อนสรุป semantics

Browser screenshot API ใน sub-agent แจ้ง “IAB visibility is not supported in a subagent thread”; ใช้ภาพแนบ, live accessibility tree และ read-only DOM/computed styles แทน ไม่ได้ทดสอบ mobile viewport, keyboard traversal, screen reader หรือ failure recovery และไม่มี overlay injection

## 1. Executive Verdict

**คะแนนการออกแบบ 6/10 — คอขวดใหญ่ที่สุดคือบริบท FlowMate หายเมื่อเปิดสองหน้าจาก Sidebar** แถบบน เมนูหลัก โลโก้ และภาษาภาพเปลี่ยนทันที ทำให้ผู้ใช้รู้สึกว่าเข้าอีกระบบ ทั้งที่ทำงานต่อเนื่องกัน

เนื้อหาเฉพาะงานมีประโยชน์และควรเก็บ: Activity แยกการรอยืนยันต้นทางจากระบบขัดข้อง; Control Center มีการจำลองที่ไม่ส่งข้อความ มีขั้นตรวจค่าก่อนใช้จริง และอธิบายว่าการพักแจ้งเตือนไม่หยุดสร้างงาน

แนวทางหลัก: ใช้โครง FlowMate ร่วมกัน คงทั้งสองเป็น Sidebar destinations แล้วแสดง navigation เฉพาะหน้าในพื้นที่เนื้อหา

คะแนนเป็นการวิจารณ์จากภาพ, source และการอ่านหน้าใน browser ไม่ใช่ผลรับรอง WCAG หรือผลทดสอบ workflow ครบทุกกรณี

## 2. Friction Analysis Matrix

| Element / Component | Current Issue | UX Principle Violated | Impact |
|---|---|---|---|
| แถบบนและ Sidebar | เมนูและบริบทเดิมหายเมื่อเข้าสองหน้า | Nielsen: Consistency, Recognition | High |
| โลโก้และชื่อผลิตภัณฑ์ | Activity ใช้ F badge; Control ใช้ชื่อ Workgrid | Match with real world, ความมั่นใจในการนำทาง | High |
| เมนูย่อย | เมนูเฉพาะหน้าแทนที่เมนู FlowMate | User control, Cognitive load | High |
| ชุดสีและองค์ประกอบ | ดำ/เทาใน Activity, เขียวใน Control; ปุ่มและมุมโค้งต่างกัน | Consistency and standards | High |
| Activity overview | health และคำอธิบายหลายชั้นมาก่อนงานที่ต้องทำ | Visual hierarchy, Scanability | Med |
| Control onboarding | กล่องเริ่มใช้งานใหญ่แม้ผู้ใช้ตั้งค่าแล้ว | Efficiency, Progressive disclosure | Med |
| ตัวอักษรและพื้นที่กด | metadata เล็ก; ปุ่มบางจุดไม่ถึงเป้าหมาย 48px | Accessibility, Fitts's Law | Med |
| Empty state | ประโยค “ในข้อมูลที่อ่านได้” ไม่ชัดว่าข้อมูลว่างหรืออ่านไม่ครบ | Visibility of status, Error recovery | Med |
| Control มี 7 sections | ต้องเลือกจากหลายหัวข้อโดยไม่มีการจัดกลุ่มหน้าที่ | Hick's Law; ยังไม่ใช่เหตุผลให้ลบเมนู | Med |

## Design Health: Nielsen 10 heuristics

0 = มีปัญหารุนแรง, 4 = ดีมาก; * = ประเมินจาก source/ภาพ ยังไม่ทดสอบ interaction จริง

| Heuristic | Score | Key issue |
|---|---:|---|
| Visibility of system status | 3 | มีเวลาตรวจและสถานะ แต่ตำแหน่ง/รูปแบบต่างกัน |
| Match with real world | 2 | ชื่อ FlowMate/Workgrid/Operation สลับกัน |
| User control and freedom | 2* | มีลิงก์กลับ แต่เมนูหลักหาย; back/refresh ต้องทดสอบ |
| Consistency and standards | 1 | โครงหน้าและองค์ประกอบสามรูปแบบ |
| Error prevention | 3* | มี preview/review/confirmation ใน source |
| Recognition rather than recall | 2 | ต้องเรียนรู้ navigation ใหม่ |
| Flexibility and efficiency | 2* | มี filters/search แต่ความต่อเนื่องและ keyboard ยังไม่ยืนยัน |
| Aesthetic and minimalist design | 3 | section ชัด แต่ health/onboarding ใช้พื้นที่ก่อนงานสำคัญ |
| Error recognition and recovery | 2* | มี status/alert; recovery ยังไม่ทดสอบ |
| Help and documentation | 2 | มีคำแนะนำ แต่ศัพท์ระบบและตัวเล็กยังเป็นอุปสรรค |
| **Total** | **22/40** | **คะแนนเชิง provisional** |

## 3. Tactical Redesign Action Plan

### Priority 1 — โครงหน้าร่วมและการนำทาง (P1)

1. **Visual hierarchy:** ใช้โลโก้ แถบบน Product navigation และ Sidebar ของ FlowMate ร่วมกัน คงเมนูทั้งสองใน Sidebar และแสดง active state ของหน้าปัจจุบัน เสนอหมวด Operations ให้ตรวจใน mockup ก่อนย้ายตำแหน่งเมนูจริง
2. **Component design:** ใช้ typography, spacing, button, input, borders และ theme tokens เดิมของ FlowMate; จำกัด CSS เฉพาะเนื้อหาแต่ละหน้าเพื่อป้องกัน selector ชนกัน สีเขียวใช้สื่อความสำเร็จ ไม่เป็นอัตลักษณ์ใหม่ของ Control Center
3. **Interaction flow:** ให้เมนู Activity เป็น navigation ภายในหน้า 4 หัวข้อหลักและเครื่องมือตามสิทธิ์ ส่วน Control คง 7 sections พร้อม grouping/overflow ที่ใช้งานได้ ไม่สร้าง Sidebar ซ้อนอีกชุด
4. **Micro-copy:** ใช้ FlowMate เป็นชื่อผลิตภัณฑ์ทุกจุด; ชื่อ browser tab เป็น “Control Center · FlowMate”; label และเวลาอัปเดตวางตำแหน่งเดียวกันทั้งสองหน้า

### Priority 2 — สิ่งที่ต้องทำ สถานะ และความเข้าถึง (P1/P2)

5. **Visual hierarchy:** Activity แสดงยอดงานรอยืนยัน/เหตุการณ์รอตรวจกับรายการ actionable ก่อนรายละเอียดรอบตรวจ ให้ health เป็นแถบสรุปที่ขยายได้ โดยเก็บเวลาข้อมูลให้มองเห็น
6. **Interaction flow:** Control แสดงสถานะเปิด/พักกับงานรอตรวจ ก่อน setup guide; แสดง guide เมื่อการตั้งค่ายังไม่ครบและให้เปิดอ่านได้ภายหลัง การจำลองระบุชัดว่าไม่มีการส่งข้อความ
7. **Micro-copy:** แยก “ไม่มีรายการตามตัวกรอง”, “ข้อมูลยังไม่โหลด”, “อ่านข้อมูลไม่สำเร็จ” และ “ข้อมูลบางส่วนอ่านไม่ได้” ตามสถานะจริง ห้ามแทน unknown ด้วยเลข 0; “ระบบตรวจปกติ” ต้องอยู่ร่วมกับ “รอยืนยันต้นทาง” ได้โดยไม่ขัดกัน
8. **Component design / Accessibility:** ใช้ข้อความสถานะร่วมกับสี, focus ที่เห็นชัด, semantic buttons/links/headings, labels และ live regions; เป้าหมายพื้นที่กดหลัก 48×48px; ตรวจ contrast และ 200% zoom โดยเฉพาะข้อความช่วยและปุ่มตาราง
9. **Responsive flow:** มือถือพับเมนูหลักและแสดงเมนูเฉพาะหน้าให้หาเจอ แสดงรายการแทนตารางเมื่อเหมาะสม ตรวจ focus/read order และไม่ให้ทั้งหน้าล้นแนวนอน

48px เป็นเป้าหมาย usability ของงานนี้ ไม่ใช่เกณฑ์ขั้นต่ำทั้งหมดของ WCAG 2.1 AA; ตัวอักษรทั่วไปควรมี contrast อย่างน้อย 4.5:1 และองค์ประกอบ UI ที่เข้าเกณฑ์ 3:1

### ลำดับ implementation และเกณฑ์ผ่าน

1. ทำ shell/navigation adapter ร่วมโดยเก็บ URL เดิม, query views, filters และ element IDs ที่ handlers ใช้
2. ปรับ styling กับ local navigation แล้วตรวจ desktop/mobile/light/dark
3. ปรับ hierarchy และ copy พร้อมแยก loading/empty/error/stale/access-denied
4. ตรวจ local isolated tests และ build ที่เกี่ยวข้อง; ทดสอบ back/refresh/deep link, keyboard และจอเล็กใน preview ที่ไม่ส่งข้อความจริง
5. แสดงผลให้ผู้ใช้ตรวจ แล้วขออนุญาต commit/push/deploy สำหรับขอบเขตนั้นโดยเฉพาะ

คง access checks, RPC/business logic, production/test separation, การตรวจและยืนยันก่อนใช้ค่าจริง, project identity และ evidence links เดิม การเปลี่ยน UI ไม่เป็นเหตุให้เปลี่ยนกฎสิทธิ์หรือเปิดระบบแจ้งเตือน

การนำ `app.css` ทั้งไฟล์มาครอบ standalone pages โดยตรงมีโอกาสชน `header`, `nav`, `main`, `.card`, `.panel` และ `.shell`; shared shell ควรมีขอบเขตชัดเจนและไม่คัดลอก global controls ที่ทำงานไม่ได้

## 4. Proposed UX Wireframe Blueprint

```text
┌ Garena · FlowMate ┬ Home | Task Assign | FlowMate | Marketing Plan | … ┐
│                  │ Search | Theme | Create | Notifications | Account │
├ Sidebar เดิม ────┼───────────────────────────────────────────────────┤
│ My work          │ Activity Automation                 [รีเฟรชข้อมูล]│
│ Board / List / … │ ติดตามงานอัตโนมัติและรายการที่ต้องตรวจ             │
│ KPI …            │ [ภาพรวม | กิจกรรม | ประวัติรัน | การแจ้งเตือน | *] │
│                  │ [Production/TEST] [กิจกรรม] [เดือน]                │
│ Activity ●       │ ข้อมูลล่าสุด … Asia/Bangkok                        │
│ Control Center   │ [รอยืนยัน] [เหตุการณ์รอตรวจ] [ชุดงานครบ]            │
│                  │ รายการที่ต้องทำ + next action / evidence          │
│                  │ สถานะระบบและรอบตรวจ [ขยายรายละเอียด]               │
└──────────────────┴───────────────────────────────────────────────────┘
* เครื่องมือ Battle Pass ตามสิทธิ์เดิม

พื้นที่เนื้อหา Control Center ภายใน shell เดียวกัน:
Control Center                                     [รีเฟรชข้อมูล]
ตั้งค่าการแจ้งเตือน SeaTalk                         [สิทธิ์ใช้งาน]
[ภาพรวม | Bots | ผู้รับ | กลุ่ม SeaTalk | กฎ | ประวัติส่ง | ข้อเสนอ/Audit]
[สถานะเปิด/พัก + อธิบายผลกระทบ] · ข้อมูลล่าสุด …
[การเชื่อมต่อรอตรวจ] [ข้อความรอตรวจ] [ข้อเสนอรออนุมัติ]
รายการที่ต้องทำ → ไปยัง section ที่เกี่ยวข้อง
จำลองเส้นทาง · ไม่มีการส่งข้อความ
เริ่มใช้งาน [แสดงเมื่อจำเป็น / เปิดอ่านได้]
```

บนมือถือ: global menu drawer → page title → local navigation → filters → summary → actionable list; ย้ายรายละเอียดรองไปในส่วนขยายและรักษา focus เมื่อเปิด/ปิด

## Persona risks และ edge cases

- ผู้ใช้ชำนาญ: ต้องสลับงาน FlowMate/Activity/การแจ้งเตือนอย่างต่อเนื่อง; shell ร่วมลดการย้อนหน้าและเปลี่ยน mental model
- ผู้ใช้ใหม่: ต้องอธิบายว่า health ปกติไม่ได้แปลว่างานรอยืนยันหมด และใช้ชื่อ FlowMate ให้ตรงกัน
- ผู้ใช้ keyboard/low vision: ทดสอบ focus, reading order, dialog กลับ focus จุดเดิม, target size และ contrast จริง
- ตรวจ URL เดิมเปิดตรง, query/view/filter preservation, browser back, ไม่มีสิทธิ์/สิทธิ์เปลี่ยนกลาง session, ข้อมูลเก่า, RPC บางส่วนล้มเหลว, ชื่อ project ยาว, ไม่มีรายการ, Production/TEST, theme และ mobile

## สถานะงานและการปิดรอบ

งานนี้สร้างรายงานเท่านั้น ไม่มี UI code change, commit, push, deploy หรือ production write ไม่มี local server ที่เริ่มเพื่อ audit

ใช้ canonical checkout เดิมและคง worktree ทุกตัวไว้: repo มีงานที่เปลี่ยนค้างอยู่ และ checkout หลักอยู่ `version2.1` ขณะที่ target release เป็น `version2.1.1`; ไม่มีการสลับ branch หรือ cleanup ในรอบ audit

Questions skipped: 2 Priority Issues; ผู้ใช้ยืนยันทิศทางใช้ FlowMate shell ร่วมแล้ว ส่วนการจัดกลุ่ม Operations เป็นข้อเสนอให้ตรวจใน mockup
