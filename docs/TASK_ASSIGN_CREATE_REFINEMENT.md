# Task Assign Create — ปรับเพิ่มเติม 2026-10-01

งานต่อจาก commit `469df345ac77450f2a1cac12c42b200a80875e91` ผู้ใช้อนุมัติ commit/push รอบนี้แล้ว ตั้ง cache stamp `20261001-5a8495` ตรงกันทั้ง 3 entry pages; ยังไม่ได้ apply SQL หรือสั่ง deploy

- Assignee เปลี่ยนเป็นช่องพิมพ์พร้อมรายการชื่อที่ตรงกันแบบไม่แยกตัวพิมพ์ใหญ่/เล็ก ค้นหาตัวอักษรในชื่อได้ทุกตำแหน่ง เลือกด้วยเมาส์หรือ Arrow/Enter; เปลี่ยนข้อความหลังเลือกจะล้างผู้รับผิดชอบเดิมเพื่อป้องกันชื่อกับ ID ไม่ตรงกัน
- รายชื่อ RPC ใช้ `team_members.active=true`, display name จาก Team Members, user ที่เชื่อมอยู่และยังมีสิทธิ์บัญชีใช้งาน รวม membership ของทีมผู้ขอ ไม่แสดงสมาชิก inactive; งานข้ามทีมยังเข้าคิวทีมปลายทางตามเดิม
- ซ่อน Confidential task และ Selected collaborators ใน Create ส่งงานใหม่ด้วย confidential=false/collaborators=[] แม้ draft เก่าเคยเป็นงานลับ สิทธิ์ของงานลับเดิมไม่ถูกแก้
- Parent task: Standalone คือไม่มีงานแม่ ตัวเลือกอื่นคือ ID/Title ของ Quick Tasks เดิมที่ผู้ใช้เป็นผู้สร้างและมีสิทธิ์อ่าน เมื่อไม่มีงานจะมีข้อความอธิบาย และเมื่อโหลด RPC ล้มเหลวจะแสดง error แยกต่างหาก ไม่มีการเพิ่มตัวเลือกจำลอง

หลักฐาน: `output/task-assign-workspaces/create-final-tests.json` ผ่าน 535/535; build:github และ diff check ผ่าน Browser ใช้ App shell จริงร่วมกับ mock API ตรวจพิมพ์ A → Aof, เลือกชื่อ, ไม่มี Confidential, มีตัวเลือก parent และไม่มี console errors ภาพ `output/task-assign-workspaces/create-autocomplete.png` เป็นข้อมูลจำลอง

SQL ที่แก้: `supabase/task_assign_workspaces.sql` เฉพาะ RPC directory; ยังไม่ apply กับระบบจริง ข้อบังคับ Activated Team Members จึงยังไม่ยืนยันใน live รายงานและ manifest ของ commit 469df34 เป็นหลักฐานก่อนการปรับนี้

รายการไฟล์ของรอบนี้และ SHA256 ของ staged Git blobs อยู่ใน `docs/TASK_ASSIGN_CREATE_RELEASE_MANIFEST.json` ไม่รวม output fixtures/logs/ภาพหน้าจอ
