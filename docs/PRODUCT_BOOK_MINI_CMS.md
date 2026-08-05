# Product Book Mini CMS

## เป้าหมาย

ทำให้ทีม Ops ดูแล Product Book ได้จากหน้า FlowMate โดยไม่ต้องแก้ไฟล์ JavaScript รายเดือนและไม่ต้องอัปเดต HTML ทุกครั้งที่มี Patch ใหม่

## สิทธิ์

| ผู้ใช้ | อ่านฉบับ Published | ดู Draft/Archived | Save Draft | Publish | Archive/Restore |
|---|---:|---:|---:|---:|---:|
| ทีม Ops ที่ Active | ✅ | ✅ | ✅ | ✅ | ✅ |
| ทีมอื่นที่ Active | ✅ | ❌ | ❌ | ❌ | ❌ |
| ผู้ใช้ที่ Inactive/ไม่ได้ Sign in | ❌ | ❌ | ❌ | ❌ | ❌ |

สิทธิ์ตรวจจาก `auth.uid()` และสมาชิกทีม `ops` ใน Supabase ไม่ตรวจจากชื่อบุคคลและไม่พึ่งการซ่อนปุ่มในหน้าเว็บเพียงอย่างเดียว

## Workflow

1. เข้า Product Book แล้วกด **Manage Product Book**
2. เลือก **New patch** หรือ **Duplicate latest**
3. กรอกข้อมูลและเนื้อหา Markdown
4. กด **Save draft** ได้ตลอด โดยฉบับ Published เดิมยังแสดงต่อไป
5. ตรวจหน้า Preview
6. กด **Publish** เพื่อสลับ Draft ล่าสุดเป็นฉบับ Published ทันที ไม่มีขั้น Approve
7. ถ้าไม่ต้องการให้ Patch แสดง ให้ใช้ Archive; ข้อมูลและ Revision เดิมยังอยู่ใน Supabase

## โครงสร้างข้อมูล

### `product_book_patches`

เก็บตัวตนของ Patch เช่น `MS26.08`, เดือน, ปี, Product และสถานะ Archive

### `product_book_patch_revisions`

เก็บเนื้อหาแต่ละ Revision โดยหนึ่ง Patch มีได้สูงสุด:

- Draft ปัจจุบัน 1 Revision
- Published ปัจจุบัน 1 Revision
- Published เก่าที่ถูกแทนแล้วเป็น `superseded` ได้หลาย Revision

โครงสร้างนี้ทำให้ Save Draft ไม่ทำให้ Product Book ที่เผยแพร่อยู่หายจากหน้าเว็บ

## รูปแบบ Markdown

ตัวอย่าง:

```markdown
# MS26.08 Top Updates

## Currency Redenomination

- ปรับหน่วยเงิน BP โดยมูลค่ารวมไม่เปลี่ยน
- เพิ่มข้อความอธิบายผลกระทบต่อผู้เล่น

## Gameplay และ QoL

- รายละเอียดหัวข้อแรก
- รายละเอียดหัวข้อที่สอง
```

ระบบสร้างสารบัญ/Anchor จากหัวข้อ `#`, `##`, `###`, `####` อัตโนมัติ ไม่ต้องกรอก Table of Contents แยก

## Validation ก่อน Publish

- Patch ID ต้องยาว 3–32 ตัว ใช้ตัวอักษรอังกฤษ ตัวเลข จุด ขีดกลาง หรือขีดล่าง
- Year อยู่ระหว่าง 2020–2100 และ Month อยู่ระหว่าง 1–12
- ต้องมี Title
- ต้องมี Markdown อย่างน้อยหนึ่งช่อง
- ป้องกัน Patch ID ซ้ำแบบไม่สนตัวพิมพ์เล็ก/ใหญ่และช่องว่าง
- บล็อกข้อความที่มี Unicode replacement character, C1 control characters หรือรูปแบบ mojibake ที่เคยพบ เช่น `เน€...`

## Static fallback

หาก Supabase โหลดไม่ได้ หน้า Product Book จะใช้ข้อมูล Published จากไฟล์ Static เดิม เพื่อไม่ให้หน้าขาว แต่จะแสดงข้อความเตือนว่าอยู่ในโหมด Fallback

ไฟล์ Static เดิมมีภาษาไทยเสียรูปอยู่ จึงไม่ควรนำเข้า Supabase อัตโนมัติ ควรสร้าง/แก้ Draft ผ่าน CMS แล้ว Publish เป็น Source of Truth ใหม่

## SQL

รันไฟล์ `supabase/product_book_cms.sql` หลัง SQL หลักด้าน Access และ Team Workspace โดยเลือก **Run without RLS** เพราะไฟล์นี้เปิดและกำหนด RLS เอง

