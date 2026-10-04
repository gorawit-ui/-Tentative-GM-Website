# Follow-ups — งานที่เลื่อนไว้ข้าม session

รายการที่ตั้งใจเลื่อนไปทำใน task ภายหลัง แต่ละแถวต้องมีเงื่อนไขว่าต้องเสร็จก่อนอะไร ปิดรายการเมื่อทำแล้วโดยใส่ commit/PR และย้ายไป “ปิดแล้ว”

## เปิดอยู่

| ID | งาน | ต้องเสร็จก่อน | ที่มา |
|---|---|---|---|
| FU-01 | ย้ายตัวสร้าง calendar snapshot (`toCalendarSnapshotDocument` / `fromCalendarSnapshotDocument` ใน `apps/api/src/calendar-snapshot.ts`) ไปเป็น module ฝั่ง server ที่ใช้ร่วมกันได้ทั้ง API และ worker โดย hash/source ยังคำนวณนอก `packages/time` ตาม D-S03-4 | เริ่ม **B15** (worker สร้างงานต่ออายุและต้องใช้ snapshot) | [S03](sessions/S03.md) “รวมกับ S02”, D-S01-1, D-S03-4 |

## ปิดแล้ว

ยังไม่มี
