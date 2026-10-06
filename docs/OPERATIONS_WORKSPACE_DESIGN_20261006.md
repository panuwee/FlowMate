---
name: FlowMate Operations Workspace
description: Activity Automation และ Control Center ภายในโครง FlowMate เดิม
colors:
  brand: "#E41E26"
  primary-action: "#c41620"
  primary-action-hover: "#a8121b"
  page: "#fafafa"
  surface: "#fff"
  ink: "#262626"
  muted: "#626262"
  divider: "#dedede"
  control-border: "#808080"
  soft: "#f2f2f2"
  focus: "#2e546d"
  dark-page: "#17191d"
  dark-surface: "#202329"
  dark-ink: "#e6e8ec"
  dark-muted: "#b8bec8"
  dark-divider: "#454b56"
  dark-control-border: "#9299a6"
  dark-soft: "#2b3038"
  dark-focus: "#a8caea"
  success-bg: "#e7f5ed"
  success-ink: "#226543"
  warning-bg: "#fff3d7"
  warning-ink: "#79540c"
  failure-bg: "#fbe9e7"
  failure-ink: "#963b31"
typography:
  title:
    fontFamily: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "normal"
  section:
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.4
  body:
    fontFamily: '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif'
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  metadata:
    fontSize: "13px"
rounded:
  control: "4px"
  panel: "6px"
spacing:
  nav-gap: "4px"
  compact-gap: "12px"
  content-gap: "16px"
  panel-padding: "20px"
  desktop-inline: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary-action}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px 14px"
  button-primary-hover:
    backgroundColor: "{colors.primary-action-hover}"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel-padding}"
---

# Design System: FlowMate Operations Workspace

## Overview

เอกสารนี้บันทึกการออกแบบที่มีใน source ณ 6 ตุลาคม 2026 เฉพาะ Activity Automation และ Control Center เป็นส่วนขยายของอัตลักษณ์ FlowMate ที่ผู้ใช้ยืนยันแล้ว ไม่ใช่การตั้งอัตลักษณ์ใหม่หรือข้อกำหนดแทนระบบออกแบบทั้งผลิตภัณฑ์

**The FlowMate Shell Rule.** FlowMate parent เป็นเจ้าของ Garena logo, header, product switch, team selector, search, theme, account และ Sidebar เดิม ทั้งสองหน้าปรากฏเป็น Sidebar destinations โดยใช้ active treatment เดิม เนื้อหาเฉพาะงานอยู่ในพื้นที่หลัก

แหล่งอ้างอิง: `operations-workspace.css`, `operations-workspace.jsx`, OperationsWorkspace ใน `app.jsx`, styles เฉพาะ Operations ใน `app.css`, `home/Activity-Automation.html`, `workgrid-control-center.jsx` และ font/brand tokens ที่ import จาก `garena/colors_and_type.css` ข้อตกลง UX ต้นทางอยู่ใน `docs/FLOWMATE_AUTOMATION_CONTROL_CENTER_UX_AUDIT_20261006.md` รายงาน audit เป็นหลักฐานก่อนแก้ ไม่ใช่สถานะ UI หลังแก้

ข้อเท็จจริงในเอกสารนี้มาจาก source local การอ่าน source ไม่พิสูจน์ทุก workflow, keyboard หรือ screen reader และไม่ใช่การรับรอง WCAG หรือหลักฐานว่าขึ้น production แล้ว เอกสารนี้ไม่ได้ทดสอบการส่ง SeaTalk จริง

## Colors

สีหลักเป็น Garena red เดิม; ปุ่ม primary ในพื้นที่ Operations ใช้แดงเข้มตาม frontmatter ส่วน navigation ภายในใช้พื้น neutral และน้ำหนักตัวอักษรแสดงตำแหน่ง ไม่ใช้สีเขียวสร้าง brand ใหม่

พื้นหน้า พื้น panel ข้อความหลัก ข้อความรอง เส้นแบ่ง และขอบ control มีบทบาทแยกกัน ใช้ `--op-*` เป็นแหล่งค่าของ child content และ aliases สำหรับ styles เดิม เช่น `--am-*` / `--bg` ค่าชุด dark เปลี่ยนผ่าน `html[data-theme="dark"]`

**The Status Meaning Rule.** ใช้ success, warning และ failure เป็นความหมายของสถานะพร้อมข้อความ ไม่อนุมานว่าระบบปกติแปลว่างานทั้งหมดเสร็จ หรือ API รับข้อความแปลว่าคนเห็นข้อความแล้ว สี badge ที่ระบุใน frontmatter คือค่าจริงจาก override; ไม่อ้างว่าครบทุก semantic state ของหน้าทั้งหมด

focus และ links ใช้สี focus ของ theme แต่ focus ไม่พึ่งสีอย่างเดียว: outline หนา (3px) และเว้นระยะ (3px) ขอบ input ใช้ control-border ที่ต่างจากเส้น divider

## Typography

ใช้ font stack ของ FlowMate/Garena ตาม frontmatter เนื้อหา Operations ใช้ขนาด body ที่กระชับ อ่านง่าย ชื่อหน้ามีน้ำหนักชัดและ section heading รองลงมา ค่า metadata ใช้กับคำอธิบายและหัวตาราง ส่วน account status ใน Activity ใช้ขนาด (12px)

ตัวเลขใน tables และ summary strips ใช้ `tabular-nums` เพื่อให้เทียบจำนวนได้ง่าย Control Center แสดงจำนวนสรุปด้วยขนาด (26px), น้ำหนัก (700) การเน้นใช้ scale และน้ำหนัก ไม่เพิ่ม font family ใหม่

## Layout

parent app ใช้สองคอลัมน์: Sidebar (220px) กับเนื้อหาที่ยืดได้; แถว header สูงอย่างน้อย (56px) และยืดตาม controls ที่ wrap พื้นที่หลักของ Operations ไม่มี padding ซ้ำ และบรรจุ iframe กว้างเต็มพื้นที่ มี minimum height (480px)

**The Content Boundary Rule.** iframe same-origin แยก DOM และ CSS ของเนื้อหาเดิมออกจาก global shell เป็นการแยก layout/style ไม่ใช่ security sandbox ห้ามนำ `app.css` ทั้งไฟล์ไปครอบ child เพราะ selectors เดิมอาจชนกัน parent ตรวจ route access ก่อน mount และ child คง authorization checks ของตัวเอง

Activity มี page heading, คำอธิบาย, refresh, local navigation, filters, status/freshness และ content ตามลำดับ Control Center มี heading/สิทธิ์/refresh, local navigation, freshness/runtime status และ content ข้อมูลที่ต้องตรวจมาก่อนคู่มือ: summary นับ connection ที่รอตรวจ, delivery ที่ต้องตรวจ และ proposal ที่รออนุมัติ; คู่มือเปิดเมื่อมี connection รอตรวจและเปิดอ่านได้ภายหลัง

desktop child ใช้ระยะขอบแนวนอนตาม frontmatter ด้านบน (28px) และด้านล่าง (40px) navigation wrap ด้วย gap ของ source มีเส้นแบ่งด้านล่าง summary Activity เป็น 4 คอลัมน์; Control เป็น 3 คอลัมน์

ที่ parent breakpoint (760px) Sidebar ย่อเหลือ (72px) และ header wrap; ไม่ได้สร้าง global drawer ใหม่ child breakpoint (767px) ใช้ padding (20px 16px 28px), heading Activity เรียงแนวตั้ง, navigation wrap, filters ยืดได้, Activity summary เป็น 2 คอลัมน์ และ Control summary เป็นคอลัมน์เดียว ตารางคงพื้นที่เลื่อนของตัวเอง การมี responsive rules ไม่แทนการตรวจ rendered overflow จริง

## Elevation & Depth

ใช้พื้นผิวและเส้นแบ่งเพื่อแยกข้อมูล panels/cards ของ Operations ตั้ง `box-shadow: none` ไม่เพิ่มความลึกตกแต่ง หน้าหลัก พื้น panel และพื้น summary/table header แยกด้วยสี neutral

dialog แสดงรายละเอียดหรือ review เหนือเนื้อหาด้วย native dialog เดิม Override ให้พื้นและข้อความตาม theme โดยไม่บันทึก shadow ใหม่ที่ไม่มีใน source ของ Operations

## Shapes

controls, local navigation และ badges ใช้มุมโค้ง control ตาม frontmatter panels กับ summary strip ใช้มุมโค้ง panel เส้นขอบทั่วไปหนา (1px) ใช้รูปทรงเรียบและมุมโค้งเล็กสอดคล้อง FlowMate

buttons/inputs/selects/textareas ในขอบเขต override มี minimum height (48px), padding (10px 14px) checkbox เป็นข้อยกเว้นที่ source ระบุไว้ (20×20px) และไม่ถูกบังคับ minimum height เดียวกับปุ่ม ค่า 48px เป็นเป้าหมาย controls ที่กำหนดในงานนี้ ไม่ใช่หลักฐานรับรองทุก touch target ในผลิตภัณฑ์

## Components

| Component | สิ่งที่ใช้จริง / ขอบเขต |
|---|---|
| Global navigation | ใช้ header/Sidebar/account/theme controls ของ parent FlowMate; Operations links สูงอย่างน้อย 48px, มี `aria-current` และรองรับ modifier click |
| Page heading | ชื่อหน้าและคำอธิบายคู่กับ refresh; Activity account text เป็นสถานะตรวจบัญชี ไม่ใช่ account menu ซ้ำ |
| Local navigation | Activity: ภาพรวม, กิจกรรม, ประวัติรัน, การแจ้งเตือน และ Battle Pass tools ตามสิทธิ์; Control: ภาพรวม, Bots, ผู้รับ, กลุ่ม SeaTalk, กฎ, ประวัติส่ง, ข้อเสนอ/Audit |
| Buttons/forms | neutral เป็น default, primary ใช้แดงเข้ม; hover ใช้ soft หรือ primary hover; disabled opacity (.55) และ cursor `not-allowed` |
| Summary strip | Activity 4 ช่อง / Control 3 ช่อง ใช้เส้นแบ่งในพื้นเดียวกัน มี responsive grid ตาม Layout |
| Tables | หัวตารางพื้น soft, เส้นแบ่งตาม theme; wrapper เป็นพื้นที่เลื่อนและ Control ใช้ region label/tabindex กับ column headings/data labels |
| Status/empty | Activity มี polite live status และ `aria-busy`; Control มี polite runtime/result status, errors ใน dialog ใช้ alert และ empty rows มีข้อความ ไม่แสดง loading เป็นจำนวนศูนย์โดยไม่มีข้อมูล |
| Guide/disclosure | Control setup guide เป็น `details`/`summary`; summary สูงอย่างน้อย 48px คู่มือไม่แทน runtime/attention status |
| Detail/review dialog | คง native dialog และหัวข้อสัมพันธ์ด้วย `aria-labelledby`; review แสดงก่อน/หลัง ผลกระทบ และเหตุผลก่อนยืนยันตาม handler เดิม |

**The Address Compatibility Rule.** URL standalone เดิม redirect เข้า `home/index.html` พร้อม route ใน hash และ encode query/hash เดิมไว้; `embedded` เป็น adapter parameter ภายใน child iframe เท่านั้น query `view` และ filters เดิมส่งต่อเข้า child โดย parent adapter child sync address ผ่าน history methods, popstate และ hashchange; parent restore iframe ตาม address เมื่อย้อน/เปลี่ยน hash โดยไม่ reload เมื่อ URL ตรงกัน การกลับเข้า FlowMate ออกไป parent ผ่าน `_top` ป้องกันซ้อน app ภายใน iframe

Control navigation ใช้ `?view=` และ pushState; popstate restore tab และล้างการค้นหา local ตาม source จึงไม่กล่าวว่าทุกค่าค้นหา Control ถูกบันทึกลง URL โหมด `demo=1` ที่เปิด standalone ถูกยกเว้น redirect เฉพาะ loopback hosts; ข้อยกเว้นนี้ไม่ใช่สิทธิ์ production

theme ของ child อ่าน `data-theme` จาก parent ตอนเริ่มและติดตาม attribute ด้วย MutationObserver รวมถึง parent onLoad sync; standalone local demo อ่าน appearance ที่เก็บไว้ ถ้าเข้าถึง parent ไม่ได้ใช้ light fallback CSS ลด motion เมื่อผู้ใช้ตั้ง `prefers-reduced-motion`

## Do's and Don'ts

- ใช้ incumbent FlowMate shell และ tokens ที่ source กำหนด ให้ local navigation อยู่ใน content area
- คง production/TEST filters, project identity, evidence links, permission-dependent tools และ review/confirmation workflows
- แยกสถานะรอตรวจสิทธิ์, ไม่มีสิทธิ์, ไม่มีรายการ และอ่านข้อมูลไม่สำเร็จตามข้อมูลจริง; freshness ต้องมีบริบท อย่าอ้างว่า local stylesheet สร้าง offline/partial-error recovery ครบแล้ว
- เก็บสิทธิ์และ business rules เดิม: parent visibility ไม่แทน backend authorization, Admin/หัวหน้าทีมยังมีขอบเขตต่างกัน, provider acceptance ไม่แทนการยืนยันจากผู้รับ และพัก notification ไม่หยุดสร้างงาน
- ตรวจ local rendered desktop/mobile, light/dark, deep links/back, focus, zoom และ failure states ตาม audit ก่อนอ้างผลทดสอบที่กว้างขึ้น
- หลีกเลี่ยง logo/account/theme/sidebar ชุดที่สองใน child, brand เขียวอิสระ, global CSS ที่ทำให้ handler IDs หรือ authorization เปลี่ยน และการใช้ zero แทนข้อมูลไม่ทราบ
- รายงาน local proof, browser proof, database apply และ remote publication แยกกัน การมีเอกสารนี้ไม่ยืนยัน commit/push/deploy หรือ production delivery
