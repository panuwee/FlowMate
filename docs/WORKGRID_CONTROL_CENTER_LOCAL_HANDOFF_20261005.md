# Workgrid Control Center v0.6 — Local handoff

วันที่ 5 ตุลาคม 2026 · SQL ติดตั้งแล้วและ worker version 1 deploy แล้วแบบปิดส่งหลังอนุมัติ · UI ยังไม่เผยแพร่และยังไม่เปิดส่งจริง ดู [ผลติดตั้ง SQL](WORKGRID_CONTROL_CENTER_SQL_INSTALL_RESULT_20261005.md) และ [ผล deploy worker](WORKGRID_CONTROL_CENTER_WORKER_DEPLOY_RESULT_20261005.md)

## สิ่งที่ใช้งานได้ใน local

- หน้า `home/control-center.html` ใช้ session เดิมในโหมดจริง; backend ตรวจ Admin/สิทธิ์ทีมซ้ำ
- Bots, ผู้รับหลาย Bot bindings, กลุ่ม, กฎ, preview, TEST confirmation, ประวัติส่ง/Retry, proposals/audit และสิทธิ์หัวหน้าทีม
- แก้ค่าผ่าน Review ก่อน Apply พร้อมเหตุผลและตรวจ configuration version
- CR Assign → actual Assignee; CR Review ใหม่ → actual Requester ตาม review instance; Task Assign → FlowMate
- Freelance ส่งข้อความแจ้ง Task ใหม่/ให้รีวิวพร้อม genuine mention ในข้อความเดียว ไม่แนบรายละเอียดงานหรือการ์ดภายใน
- Activity success ตรวจครบ native bundle ของ run และรักษา readiness gates เดิม; ผลบางส่วนไม่แจ้งสำเร็จ
- เปลี่ยนผู้รับ/ทีม/รอบ Review/ค่าช่องทางแล้ว pending เก่าถูกยกเลิก; retry ไม่สร้างงาน
- Bot deactivate/archive เป็นสถานะเชื่อมใน Workgrid ไม่ใช่ลบหรือปิด app บน SeaTalk

## เปิด demo โดยไม่แตะ production

```powershell
npm.cmd run build:github
node scripts/workgrid-control-center-preview.cjs
```

เปิด `http://127.0.0.1:4178/home/control-center.html?demo=1`

จำลองหัวหน้าทีม: เพิ่ม `&role=lead` ใน URL โหมดจำลอง

Preview server รับเฉพาะ localhost และให้บริการเฉพาะ HTML/JS/CSS ของ demo ไม่ให้เรียก Supabase client, project files หรือ secrets ข้อมูล demo อยู่ใน memory รีโหลดหน้าแล้วรีเซ็ต ไม่มีการเรียก provider กด TEST เป็นการจำลองเท่านั้น

ชื่อ Pond/Folk ใช้สื่อ flow ส่วน email, IDs ภายใน, SeaTalk ID `123` ในภาพหลักฐาน และทีมของ Folk เป็นข้อมูลสมมติ ไม่ใช่ tenant identity ที่ตรวจแล้ว Group ID Folk และ App IDs ใช้ค่าที่ผู้ใช้ให้มา แต่ยังไม่ verified กับ provider

## ขอบเขตไฟล์

| ส่วน | Source |
| --- | --- |
| UI | `workgrid-control-center.jsx`, `.css`, `home/control-center.html` |
| Generated browser asset | `workgrid-control-center.js` ผ่าน `build-github.cjs` |
| Navigation | additive links ใน `app.jsx`, `screens-b.jsx` และ generated siblings |
| Backend | `supabase/workgrid_control_center.sql` |
| Optional legacy/native adapters | `supabase/workgrid_control_center_adapters.sql` |
| Edge worker | `supabase/functions/workgrid-control-center/index.ts`; function config ใน `supabase/config.toml` |
| Isolated tests | `src/lib/control-center/` |
| Preview server | `scripts/workgrid-control-center-preview.cjs` |

root checkout ยังอยู่ `version2.1`; target release คือ GitHub `version2.1.1` มี unrelated dirty work เดิม ห้ามนำ diff ทั้ง root ไป release โดยไม่แยก scope และตรวจ baseline ไม่มี commit/push/branch switch ในรอบนี้

## เตรียม backend ก่อนเปิดใช้จริง — ต้องอนุมัติแยก

1. ตรวจ schema/helpers/ACL ของ tenant เทียบ prerequisite ใน installer และ native signatures; rehearsal กับ baseline ที่ครบก่อน production SQL
2. Apply installer แบบปิดส่งก่อน แล้วตรวจสิทธิ์ anon/member/lead/Admin/service แยกกัน ไม่ใช้ผล PGlite แทนหลักฐานจริง
3. ตรวจ adapters และ import routes เดิมแบบรักษาพฤติกรรม; installer ไม่ import ผู้รับเดิมอัตโนมัติ อย่าเปิด runtime ก่อนเปรียบเทียบ routing ของผู้รับเดิมครบ
4. Panu ตั้ง secrets ใน approved server secret storage: `WCC_BOT_SECRET_CREATIVE`, `WCC_BOT_SECRET_FLOWMATE`, `WCC_DISPATCH_SECRET` (อย่างน้อย 32 ตัวอักษร) และ HTTPS `WORKGRID_BASE_URL` ที่ตรงเส้นทาง Workgrid จริง; Supabase runtime ใช้ URL/service/anon env ของระบบ ห้ามใส่ค่า secret ลง source/Markdown/browser
5. Deploy function/UI หลังอนุมัติ Function ตรวจ JWT ด้วย getUser + backend Admin สำหรับ verify/TEST; dispatch ใช้ secret header แยก แค่เปลี่ยน `verify_jwt` ใน local config ไม่ใช่หลักฐาน deploy
6. ตั้ง server invoker สำหรับ `action=dispatch` ด้วย `x-wcc-dispatch-secret` ผ่าน approved scheduler/secret storage; รอบนี้ไม่สร้าง cron ไม่เรียกจริง ระบบแจ้งเตือนทำงานเป็น async ไม่ต้องเปิด browser ค้าง
7. เลือก Folk จากสมาชิกจริง → ตั้ง Freelance / Group → ปลายทาง GroupID `Njk2MTczMDEwNTg2` → ผูก Creative Bot / Review ให้ถูกทีม; SeaTalk ID ของ Folk ใช้ตรวจสมาชิก/mention ภายในกลุ่มเท่านั้น ไม่ส่ง DM และไม่ fallback ไป DM หากกลุ่มไม่พร้อม; เพิ่ม Marketing/eSports ภายหลังผ่าน UI
8. ตรวจ Bot → กลุ่ม → ผู้รับ; บันทึก settings ที่เปลี่ยนช่องทางแบบพักก่อน การตรวจ authentication/identity/อ่านกลุ่มแยกจาก TEST และผลผู้รับเห็นข้อความ
9. ถ้า API ซ่อนสมาชิก: ตรวจกลุ่มและ TEST กลุ่มให้ผ่านก่อน จากนั้น Admin ยืนยันกับผู้รับผ่าน UI โดยอ้างผล TEST เดิมที่ตรง fingerprint ปัจจุบัน บันทึกเป็น human confirmation ไม่อ้างว่า API ตรวจสมาชิกได้
10. ประสาน/รอ legacy in-flight ให้จบก่อนเปิด runtime/cutover, pilot เฉพาะที่อนุมัติ แล้วตรวจผล provider กับผู้รับเห็นข้อความแยกกัน

TEST จำกัด 3 requests ต่อ Admin ต่อหนึ่งนาที และใช้ request ID ป้องกันการส่งซ้ำ การตรวจ connection ไม่มี send ส่วน TEST/retry เป็น side effects ที่ Admin ต้องกดยืนยันใน UI การ Activate ไม่ replay งานย้อนหลังเอง

## พักและ rollback

- พัก runtime หรือ Bot/rule หยุด enqueue/เริ่มส่งที่ยังไม่เริ่ม; provider call ที่เริ่มไปแล้วอาจจบภายหลัง
- การรับช่วงคิวเดิมมี ownership records ถาวรเพื่อไม่ให้ pause/deactivate กลับไปส่งผ่าน worker เก่าโดยเงียบ การตั้ง runtime เป็น false ไม่ลบ ownership
- หากต้องคืน legacy ต้อง review routing/mapping/in-flight และอนุมัติ rollback ที่ระบุ records/triggers ชัดเจน ไม่ drop schema หรือเคลียร์ ownership แบบเหมารวม
- uncertain ต้องตรวจหลักฐานก่อน resend; การบันทึกขั้น mention/message ช่วยข้ามขั้นที่ provider รับแล้ว ไม่อ้าง exactly-once network delivery

## หลักฐานและสิ่งที่ยังรอ

72 isolated tests ผ่านหลัง focused native-contract rehearsal, worker TypeScript check ผ่าน; browser build และ offline rendered UI จากรอบก่อนตรวจแล้วรวม mobile และฟอร์ม Review/Apply ดูรายละเอียดที่ [Orchestration log](WORKGRID_CONTROL_CENTER_ORCHESTRATION_20261005.md) ไม่ใช่หลักฐาน full tenant stack หรือ live provider

ตรวจ production baseline และ focused native-contract rehearsal แล้ว ดู [Preflight/release package](WORKGRID_CONTROL_CENTER_PRODUCTION_PREFLIGHT_20261005.md) Folk ตัวจริงอยู่ Operations (`ops`) ปลายทาง Creative / Review คือ GroupID `Njk2MTczMDEwNTg2`; SeaTalk ID ใช้ตรวจสมาชิก/mention เท่านั้น ยังรอ SQL installation/live permissions, secure credentials, Bot/group verification, authorized pilot, retention policy และ deployment/live UAT ข้อมูล Fulltime Pond ทดสอบแล้วเป็นคำยืนยันผู้ใช้ ไม่ใช่ผลทดสอบ Control Center ใหม่ในรอบนี้

ภาพ local: `C:/Users/panuwee.w/.codex/visualizations/2026/10/05/01a10a7b-807e-7de1-a6c2-54d8a89c2dbc/workgrid-control-center-local.jpg`

เอกสาร SeaTalk ที่ใช้: `get_group_info.md`, `get_app_access_token.md`, `send_message_to_a_bot_user.md`, `send_message_to_group_chat.md`, `server_api_error_code.md` ใน `docs/seatalk-open-platform/source/`; contacts payload และ Assigned card เทียบกับ source dispatcher เดิม เป็น API snapshot/local evidence ไม่ใช่ tenant verification
