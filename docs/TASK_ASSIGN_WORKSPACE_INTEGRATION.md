# Task Assign — รวมกับ GitHub ล่าสุดแล้ว (local)

วันที่ตรวจ: 2026-10-01

> ขั้น commit/push ได้รับอนุมัติจากผู้ใช้แล้ว จัดส่งไป GitHub `version2.1.1` โดยใช้ cache stamp `20261001-4aa655` ตรงกันทุก active entry page; SQL ยังเป็นไฟล์เตรียมติดตั้ง ไม่ได้ apply และไม่ได้สั่ง deploy สถานะ “local-uncommitted” ในเนื้อหาก่อนหน้านี้เป็นหลักฐาน ณ ขั้นตรวจ local

> อัปเดตหลังผู้ใช้อนุมัติแก้ 8 test failures: แก้ครบแล้ว ชุดรวม `repaired-regression-tests.json` ผ่าน **531/531**, 0 failed และ Node launch-month tests ผ่าน **9/9** ข้อมูล 494/8 ด้านล่างเป็นผลก่อนซ่อม test

## แก้ชุดทดสอบเดิมแล้ว

- ตรวจ cache token ส่วนกลางจาก release asset manifest รองรับวันที่ + hash/sequence/named change อ่าน token เต็มและตรวจตรงกันทุก entry page ไม่ผูกกับเวอร์ชันเก่า; ตรวจ token หาย/ผิดรูปแบบและ reference ซ้ำด้วย
- ป้ายเวอร์ชันถูกทดสอบด้วยฟังก์ชันจริงเทียบกับ app.js token ของแต่ละหน้า; Product Book/Home ยังตรวจเส้นทางและ navigation แยก
- Duplicate refresh รับ `useLaunchMonth: true` โดยยังยืนยัน error message เมื่อ refresh ล้มเหลว
- Timeline query ทดสอบทั้ง plan month และ Launch Date, window ข้ามปี, cache แต่ละ mode และการส่ง error กลับพร้อมล้าง in-flight request
- Campaign search ทดสอบ name/tagline, ตัวพิมพ์ใหญ่/เล็ก, Function, archived และไม่มีผลลัพธ์
- Working Sheet ทดสอบ Function/Channel กับ Launch Date ต่างจากเดือนแผน, ข้ามปี, นอก 3 เดือน, ไม่มีวัน และไม่แก้ข้อมูลต้นทาง
- ชุดเจาะจงซ่อม tests ผ่าน **387/387**; ชุดรวมล่าสุดผ่าน **531/531** และ `git diff --check` ผ่าน
- รอบซ่อมนี้แก้เฉพาะ tests/test helper/เอกสาร ไม่เปลี่ยน product source, HTML/cache tokens, SQL หรือ generated assets จึงไม่ต้อง rebuild หรือทดสอบหน้าจอซ้ำ

ไฟล์หลักที่ซ่อม: `src/lib/flowmate-board-integration.uat.test.ts`, `src/lib/flowmate.uat.test.ts`, `src/lib/workflow-mvp.uat.test.ts` พร้อม helper `src/lib/test-support/entry-cache-contract.ts` และ negative tests `src/lib/entry-cache-contract.test.ts`

## สถานะปัจจุบัน

รวมเฉพาะ Task Assign ใน `C:\SeaTH\Projects\flowmate\.worktrees\task-assign-workspace-release` บนฐาน GitHub `version2.1.1` commit `cdab673c7fa5784639ac6c5be0f5789c2ee28f74` (33 commits หลัง checkout เดิม) ตรวจ remote ซ้ำเมื่อจบงานแล้วยังเป็น commit เดิม ไม่มี commit, stage, push, production SQL, deploy หรือส่งข้อความจริง

checkout เดิม `C:\SeaTH\Projects\flowmate\.worktrees\version2.1.1` ยังอยู่ครบ ตรวจเนื้อหา source 13 ไฟล์กับ snapshot ก่อนรวมแล้วตรงกันเมื่อ normalize newline

รายงานนี้ใช้แทนสถานะ “รอรวมโค้ด” และยอดทดสอบเดิมใน HANDOFF/PREFLIGHT ส่วนข้อมูล production preflight เดิมเป็นหลักฐานอ่านอย่างเดียว ณ เวลาที่ตรวจ

## พฤติกรรมที่ได้

- My work รวม Assigned to me / Created by me ตามสิทธิ์ผู้ใช้
- Workspace แยก Marketing, Operations, eSports พร้อม Team work / Incoming requests / Sent to other teams
- งานข้ามทีมใช้ Task ID เดียว ทีมปลายทางรับเรื่อง เลือกคนรับผิดชอบและยืนยัน Deadline
- Title, Note/ผลส่งมอบ, Responsible team, Deadline เป็นข้อมูลหลัก; Project/Campaign และ Review เลือกไม่กรอกได้
- ค้นหาคนในทีมก่อนเลือก Assignee; งานข้ามทีมเข้าคิวปลายทาง; Urgent ต้องมีเหตุผล
- ลิงก์อ้างอิง, งานลับ/ผู้ร่วมงาน, Parent task, comment และประวัติ พร้อมสิทธิ์ในฐานข้อมูล

## การรักษางานล่าสุด

ใช้ three-way integration ตาม allowlist ไม่แทนที่ checkout ล่าสุดทั้งชุด รักษา Team Members CSS, Creative KPI build source และ script/cache tokens ของ HTML ล่าสุด เพิ่ม Task Assign script และเพิ่มเข้า release-stamp manifest

ปรับเฉพาะ assertions ของ Task Assign ใน flowmate.uat.test.ts ไม่รวมงาน Publish Time/Brief SQL ที่ค้างใน checkout เดิม แก้การเปิดรายละเอียดหลังสร้างให้ใช้ Task Assign route โดยไม่ต้องมี Creative detail loader และทำการ์ด Quick task เต็มความกว้างใน Task Assign

## หลักฐาน local

- Affected suite: **138 ผ่าน / 0 failed** (`output/task-assign-workspaces/final-affected-tests.json`)
- Broad regression: **494 ผ่าน / 8 failed** (`final-regression-tests.json`)
- ฐาน GitHub ก่อนรวม: **416 ผ่าน / 8 failed** (`baseline-tests.json`); ชื่อ test ที่ล้มเหลวทั้ง 8 ตรงกัน ไม่มี failure ใหม่
- 8 รายการเดิมเกี่ยวกับ cache/version token และ Marketing Plan assertions ที่ไม่ตรง source ล่าสุด ไม่ได้เปลี่ยนงานอื่นเพื่อกลบผลทดสอบ
- Live-definition replay ใน PGlite local: **12/12 ผ่าน** (`integrated-live-replay-tests.json`) ไม่ใช่การ apply หรือทดสอบสิทธิ์ด้วยบัญชี production
- `npm.cmd run build:github`, syntax check ของ client JS/release-stamp และ `git diff --check` ผ่าน; ไม่พบ conflict markers
- Browser ใช้ actual compiled App shell + mock auth/RPC บน localhost: My work, สลับทีม, outgoing Task ID เดิม, accept/assign, ค้นหา assignee, ส่งคำขอและเปิดรายละเอียด ตรวจฟอร์ม 390px และ desktop 1365px
- ภาพ: `output/task-assign-workspaces/integrated-desktop.png`, `integrated-mobile.png`; เป็นข้อมูลจำลอง Badge local/LIVE polling ของ shell ไม่ใช่หลักฐาน deployment
- Console มี error เก่าจากการตรวจ loader ก่อนแก้; เส้นทางสร้างงานหลังแก้เปิดรายละเอียดได้แล้ว
- ฟอร์มมือถือเรียงคอลัมน์เดียว; topbar ของ shell เดิมยังมี overflow ใน viewport แคบ ไม่ได้เปลี่ยน shared navigation ในงานนี้

## SQL และ release manifest

Installer SHA256: `B5928C80009961C01042DD4471B16925D5328485AB07BAB708502FCF71673D9B`

Read-only preflight SHA256: `B6D550FADEE5F8510D1011ED9E3B1841BF4ABEB06F6B0A0A7CBBDDC2976F10A1`

ไฟล์ที่จะส่งมอบและ SHA256 ระบุใน `docs/TASK_ASSIGN_WORKSPACE_RELEASE_MANIFEST.json` ไม่รวม output fixtures, snapshot schema, log, ZIP หรือ browser harness

## ขั้นก่อนเปิดใช้จริง

1. ข้อผิดพลาดเดิม 8 รายการแก้แล้วตามการอนุมัติเพิ่มเติม ชุดรวม local ผ่านทั้งหมดในขอบเขตที่ทดสอบ; ยังต้องตรวจ environment จริงก่อน release
2. ขออนุมัติ commit/push และ production SQL/publication ตามขอบเขตแยกกัน
3. ขั้น commit/push ใช้ release-stamp `20261001-4aa655` แล้วและ rebuild ไม่เปลี่ยน generated output; ตรวจ entry pages และ manifest ก่อนส่ง ส่วนการเผยแพร่/ตรวจหน้า live ยังต้องทำแยก
4. ก่อน apply ตรวจ preflight ล่าสุด, prerequisite SQL, backup และกำหนด dispatchers; ทำ cross-team/confidential canary ด้วยบัญชีจริงหลังได้รับอนุมัติ
5. ลิงก์ไฟล์ใช้ approved storage สิทธิ์ปลายทางต้องตั้งแยก งานลับยัง forward ทีมไม่ได้ และไม่ได้ทดสอบส่ง SeaTalk/อีเมลจริง
