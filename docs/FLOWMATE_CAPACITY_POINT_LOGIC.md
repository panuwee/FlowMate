# FlowMate Capacity Point Logic

## Objective

ปรับนิยามการคำนวณ Cap pt ของ GD/VE ให้สะท้อนเวลาทำงานจริงมากขึ้น โดยไม่ลาก effort ไปจนถึง Launch Date ทั้งหมด และไม่ปล่อยให้ระบบคิดว่างานทันทั้งที่ assign ช่วงเย็นแล้วเหลือเวลาไม่พอสำหรับ 1st Draft

## Core Principle

Cap pt ควรถูกใช้เฉพาะช่วงที่ GD/VE ต้องผลิตงานจริง

- Production phase ใช้ Cap pt
- Review / Approval phase ไม่ใช้ Cap pt เต็ม
- Launch Date ใช้ตรวจ risk และ buffer ไม่ใช่วันที่ลาก Cap pt ไปจนถึงวัน Live

## Recommended Status Logic

| Status | Cap pt behavior | Meaning |
|---|---:|---|
| Assigned | Count | งานอยู่ในมือ GD/VE แล้ว |
| In Progress | Count | กำลังผลิตงาน |
| Blocked | Count | ยังกัน capacity ไว้ เพราะงานยังไม่ออกจากมือ |
| Review | Release | GD/VE ส่งงานแล้ว รอ requester/supervisor ตรวจ |
| Delivered | Release | งานจบแล้ว |
| Cancelled | Release | งานถูกยกเลิก |

ถ้า Review ถูกตีกลับเป็น In Progress ให้กลับมานับ Cap pt อีกครั้ง โดยอาจใช้ rework pt แยกในอนาคต

## Capacity Window Logic

### 1. Production Days

Production days คำนวณจาก effort point และ capacity ต่อวันของ GD/VE

```text
production_days = ceil(effort_point / member_capacity_per_day)
```

ตัวอย่าง:

```text
Hero Post 1 set, 8 banners = 16pt
GD/VE capacity = 8pt/day
production_days = ceil(16 / 8) = 2 working days
```

### 2. Assigned Date Cutoff

ต้องมี cutoff time เพื่อป้องกันเคส assign ช่วงเย็นแล้วระบบคิดว่ายังมีวันทำงานเต็ม

Recommendation:

```text
production_cutoff_time = 15:00
```

Rule:

- Assign ก่อนหรือเท่ากับ cutoff: นับวัน assign เป็น working day ได้
- Assign หลัง cutoff: เริ่มนับ production ตั้งแต่ working day ถัดไป

ตัวอย่าง:

| Assigned time | First capacity day |
|---|---|
| 9 Jul 2026 10:00 | 9 Jul 2026 |
| 9 Jul 2026 14:30 | 9 Jul 2026 |
| 9 Jul 2026 17:00 | 10 Jul 2026 |

## 1st Draft Date Logic

1st Draft Date ควรถูกมองเป็น production deadline ไม่ใช่แค่ display field

```text
calculated_1st_draft_date = first_capacity_day + production_days - 1 working day
```

ตัวอย่าง A: Assign เช้า

```text
Task: Hero Post 16pt
Member cap: 8pt/day
Assigned: 9 Jul 2026 10:00
First capacity day: 9 Jul 2026
Production days: 2
Calculated 1st Draft: 10 Jul 2026
```

ผลลัพธ์:

- 9 Jul ใช้ 8pt
- 10 Jul ใช้ 8pt
- ถ้าส่ง Review วันที่ 10 Jul หลังส่งแล้ว cap ว่าง

ตัวอย่าง B: Assign เย็น

```text
Task: Hero Post 16pt
Member cap: 8pt/day
Assigned: 9 Jul 2026 17:00
First capacity day: 10 Jul 2026
Production days: 2
Calculated 1st Draft: 13 Jul 2026
```

หมายเหตุ: 11-12 Jul เป็นเสาร์-อาทิตย์ จึงข้ามไป 13 Jul

ผลลัพธ์:

- 10 Jul ใช้ 8pt
- 13 Jul ใช้ 8pt
- ถ้า requester ตั้ง 1st Draft เป็น 10 Jul ระบบควรเตือนว่าไม่พอ capacity

## Review Buffer Logic

หลัง 1st Draft ควรมี buffer สำหรับ review / revise / approve ก่อน Launch Date

Recommendation:

```text
review_buffer_working_days = 2
```

```text
minimum_launch_date = calculated_1st_draft_date + review_buffer_working_days
```

ตัวอย่าง:

```text
Calculated 1st Draft: 10 Jul 2026
Review buffer: 2 working days
Minimum safe Launch Date: 14 Jul 2026
```

ถ้า Launch Date เร็วกว่า minimum safe date ให้ mark เป็น risk

## Launch Date Logic

Launch Date ใช้ตรวจความเสี่ยง ไม่ใช้เป็น Cap pt window หลัก

ใช้ Launch Date เพื่อเช็ค:

- มีเวลาพอหลัง 1st Draft หรือไม่
- มี review buffer พอหรือไม่
- ควร auto urgent หรือ queue หรือไม่
- ควร assign backup / split task หรือไม่

ไม่ควรใช้ Launch Date เพื่อ:

- ลาก Cap pt ของ GD/VE ไปจนถึงวัน Live
- ทำให้คนดูไม่ว่าง ทั้งที่ส่งงาน Review แล้ว

## Risk Rules

### Insufficient Production Capacity

เกิดเมื่อ:

```text
available_working_days_to_1st_draft < production_days
```

Action:

- แจ้งเตือนตอน Create Brief / Assignment
- Mark priority เป็น Urgent ได้
- แนะนำ split task หรือเลือก GD/VE คนอื่น
- ถ้าไม่มีใครพอ capacity ให้เข้า Queue

### Insufficient Review Buffer

เกิดเมื่อ:

```text
launch_date < calculated_1st_draft_date + review_buffer_working_days
```

Action:

- แสดง At Risk
- แจ้ง requester/supervisor
- ไม่ควรบังคับกิน Cap pt เพิ่มจนถึง Launch Date

## Recommended Formula Summary

```text
effort_point = skill/subtype/asset_count based point
production_days = ceil(effort_point / member_capacity_per_day)

if assigned_time > production_cutoff_time:
  first_capacity_day = next_working_day(assigned_date)
else:
  first_capacity_day = assigned_date

calculated_1st_draft_date = add_working_days(first_capacity_day, production_days - 1)
minimum_safe_launch_date = add_working_days(calculated_1st_draft_date, review_buffer_working_days)
```

## Example: Hero Post 1 Set, 8 Banners

### Input

```text
Asset: Hero Post 1 set, 8 banners
Effort: 16pt
Member cap: 8pt/day
Assigned Date: 9 Jul 2026
Launch Date: 16 Jul 2026
```

### Case 1: Assigned 9 Jul 10:00

```text
Production days: 2
Cap window: 9 Jul - 10 Jul
Calculated 1st Draft: 10 Jul
Review buffer: 13 Jul - 14 Jul
Launch: 16 Jul
Result: Safe
```

### Case 2: Assigned 9 Jul 17:00

```text
Production days: 2
Cap window: 10 Jul + 13 Jul
Calculated 1st Draft: 13 Jul
Review buffer: 14 Jul - 15 Jul
Launch: 16 Jul
Result: Tight but acceptable
```

### Case 3: Assigned 9 Jul 17:00 but requester wants 1st Draft 10 Jul

```text
Available production capacity: 1 working day = 8pt
Required effort: 16pt
Result: Insufficient capacity
```

Recommended system behavior:

- Show warning
- Do not silently accept as normal
- Suggest later 1st Draft, split, backup owner, or urgent route

## Implementation Impact

### SQL / Assignment Engine

Update assignment logic to use:

- assigned timestamp
- production cutoff time
- effort point
- member capacity per day
- calculated 1st Draft Date
- review buffer risk check

Assignment should prioritize members by remaining production capacity in the calculated production window, not by capacity until Launch Date.

### Workload Screen

Workload should show:

- Production cap used
- Review count separate from cap
- Risk indicator when 1st Draft or Launch buffer is too tight

### Marketing Plan

When Create Brief sends data to FlowMate:

- Launch Date remains the publish/live date
- 1st Draft Date should become production deadline
- If 1st Draft is missing, FlowMate can calculate it from effort and Launch Date buffer

### KPI

KPI should keep:

- Delivered effort for productivity
- Review count for pending approval
- Rework count if Review returns to In Progress

Do not treat Review as full active production cap.

## MVP Decision

For MVP implementation:

```text
production_cutoff_time = 15:00
review_buffer_working_days = 2
cap_statuses = Assigned, In Progress, Blocked
release_statuses = Review, Delivered, Cancelled
```

This keeps the model simple and matches actual team behavior better than counting cap until Launch Date.
