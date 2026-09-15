# Creative KPI Monthly Progression — ผลพัฒนาในเครื่อง

วันที่ 15 กันยายน 2026 · สถานะ: local implementation; ยังไม่ได้ apply SQL กับฐานจริง, commit, push หรือ deploy

## ผลที่ได้

- เลือกปี บทบาท คน เดือน และประเภทงาน พร้อมการ์ด 6 ค่า: Delivered, AI Delivered, First Draft ตรงเวลา, วันก่อน Launch, ระยะเวลาผลิต, Created → Started
- กราฟ ม.ค.–ธ.ค. สลับตัวชี้วัด คลิกเดือนแล้วการ์ด/รายละเอียด/Export เปลี่ยนตาม
- ส่วนบริบทเวลาพับได้: ≥2 วันทำงาน / <2 วัน / เลย Due / ไม่ทราบ; เลือกกรองกลุ่มแล้วมีป้ายบนหน้าหลักและข้อมูล filter ใน Export
- แยกฐานเดือน: Delivered ครั้งแรก, First Review ครั้งแรก, Assigned → In progress ครั้งแรก; ไม่รวม task ซ้ำเพราะส่งแก้
- ผู้รับเครดิตแยกตามเหตุการณ์; ข้อมูลเก่าอ่านประวัติ assignment และ manual assignee change พร้อมป้าย reconstructed/unknown
- งานย้ายคนระหว่างผลิตไม่ใช้เวลาทั้ง Task เป็นระยะเวลาผลิตรายบุคคล; ยอดส่งยังคงนับตามเจ้าของตอนเหตุการณ์
- Excel: Annual summary และ Monthly detail เป็น progression ทั้งปี; Selected summary, Task evidence และ AI tasks ตามเดือนเลือก; Timing context แสดงภาพรวมทุกกลุ่มเวลาภายใต้เดือน/คน/บทบาท/ประเภทงานเดียวกัน เพื่อเทียบกลุ่มได้

## การเก็บหลักฐานใหม่

SQL `supabase/creative_kpi_progression.sql` เพิ่ม milestone snapshots ณ Created, Assigned, Started, Review และ Delivered ครั้งแรก โดยไม่มีการสร้าง snapshot ย้อนหลัง ใช้ trigger บน work_items และเก็บ AI ณ Delivered, owner/code/name และ due/launch ของแต่ละเหตุการณ์

เพิ่มประวัติบรีฟหลายเวอร์ชัน ผ่าน `flowmate_creative_brief`: Requester ส่งเวอร์ชันพร้อมเหตุผล/ลิงก์; GD/VE เจ้าของงานรับบรีฟ; Lead รับแทนได้พร้อมเหตุผล ระบบตรวจ submission ล่าสุด ป้องกันรับเวอร์ชันเก่า/รับซ้ำ ใช้เวลาฝั่งระบบและ auth.uid() พร้อม Activity log

การเปลี่ยน Due/Launch ถูกบันทึกเป็นประวัติ แต่ไม่ถือว่า event นั้นคือการอนุมัติเลื่อน deadline KPI ใช้ baseline ตอน Assigned ครั้งแรกและแสดงค่าปัจจุบันประกอบ ข้อมูลเก่าใช้ current dates พร้อมป้ายข้อจำกัด

ข้อมูลบรีฟเป็นหลักฐาน action/ลิงก์/คำอธิบายเวอร์ชัน ไม่ใช่สำเนาเนื้อหาเอกสารภายนอก การกดรับช้าไม่ถูกสรุปเป็น Requester ส่งช้าอัตโนมัติ

## ไฟล์หลัก

- `creative-kpi-report.js`: คำนวณร่วม UI/Excel, cohort, event owner และ timing filter
- `screens-creative-kpi.jsx` และ `.js`: หน้ารายเดือนและ component หลักฐานบรีฟ
- `screens-a.jsx` และ `.js`: เชื่อม component ใน Creative Detail และข้อความ Activity log
- `creative-kpi-report.css`: รูปแบบรายงานและ responsive
- `supabase-creative-kpi-report.js`: อ่าน progression view รวม Started year และ First Delivered year
- `supabase/creative_kpi_progression.sql` และ `_verify.sql`: SQL เตรียมตรวจและ verifier แบบ read-only

## การตรวจสอบ

- Build จาก root JSX เป็น sibling JS ผ่าน
- ทดสอบ model, export, loader, rendered UI, assignee activity และ SQL ใน PGlite ที่แยกจากฐานจริง
- ตรวจ 20 Delivered / 8 AI / 40%, ข้ามเดือน/ปี, reopen, snapshot AI, baseline deadline, manual assignee, สิทธิ์ requester/owner/Lead/ผู้ไม่เกี่ยวข้อง/anon และป้องกัน direct write
- ตรวจหน้าในเบราว์เซอร์ด้วยข้อมูลจำลอง บน desktop และ viewport 390×844; document clientWidth และ scrollWidth เท่ากัน 375px ในการตรวจ mobile จึงไม่ล้นทั้งหน้า
- ตัวอย่างใช้ข้อมูลจำลองเท่านั้น ไม่ใช่ผลการประเมินบุคคลจริง

เรียกชุดทดสอบ:

```powershell
node --test src/lib/creative-kpi-progression-sql.test.cjs src/lib/creative-kpi-progression-ui.test.cjs src/lib/creative-kpi-progression.test.cjs src/lib/creative-kpi-report.test.cjs src/lib/creative-kpi-export.test.cjs src/lib/creative-kpi-loader.test.cjs src/lib/assignee-activity-log.test.cjs
npm.cmd run build:github
```

Preview จำลอง: `node scripts/kpi-progression/preview.cjs 4198` แล้วเปิด http://127.0.0.1:4198 — ไม่เชื่อม Supabase; Export ใน preview เป็นตัวตรวจข้อมูลในหน่วยความจำ ไม่ดาวน์โหลดไฟล์จริง

## ก่อนนำใช้จริง

1. ตรวจ schema/ข้อมูลจริงว่าฐานมี prerequisite helpers และตารางตรงกับ SQL; PGlite เป็น fixture ไม่ใช่สำเนาฐานจริง
2. ตรวจรายการที่ไม่มี First Delivered event, ไม่มี owner history หรือวันที่ผิดลำดับกับ Lead; รายงานไม่เดาวันส่งจากสถานะปัจจุบัน
3. Apply SQL เมื่อได้รับอนุมัติ scope นี้ แล้วรัน verifier ภายใต้ Lead/ผู้ใช้ทั่วไป/anon และ UAT workflow บนสภาพแวดล้อมที่อนุมัติ
4. เผยแพร่ frontend หลัง progression view พร้อมเท่านั้น Loader จะไม่ fallback ไปสูตรเดิมถ้าข้อมูลใหม่ยังไม่ได้ติดตั้ง
5. Commit/push/deploy ต้องได้รับอนุมัติ scope นี้ และตรวจ remote ใหม่ก่อน release; แยกสถานะ build, DB apply และ Pages deployment

ฐานพัฒนา: worktree `codex/creative-kpi-monthly-progression` จาก a75b160 ซึ่งตรง GitHub version2.1.1 ตอนเริ่มงาน Root version2.1 และงานค้างอื่นไม่ได้ถูกสลับ/เขียนทับ

อ้างอิงการตรวจสิทธิ์: [Supabase RLS — grants, policies, views](https://supabase.com/docs/guides/database/postgres/row-level-security)
