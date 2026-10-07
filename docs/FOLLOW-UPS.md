# Follow-ups — งานที่เลื่อนไว้ข้าม session

รายการที่ตั้งใจเลื่อนไปทำใน task ภายหลัง แต่ละแถวต้องมีเงื่อนไขว่าต้องเสร็จก่อนอะไร ปิดรายการเมื่อทำแล้วโดยใส่ commit/PR และย้ายไป “ปิดแล้ว”

## เปิดอยู่

| ID | งาน | ต้องเสร็จก่อน | ที่มา |
|---|---|---|---|
| FU-02 | คำสั่งคอมเมนต์ใน domain: คอมเมนต์ของ GM (`gm_staff`/`gm_admin`) บนงาน `queued`/`in_progress` (และทุกสถานะที่เปิด) นับเป็น action ของ GM → อัปเดต `last_updated_at` (reset stale) ตาม D-S05-3/D-S06-1; คอมเมนต์ของผู้ขอ/related/watcher ไม่อัปเดต | task ที่ทำคอมเมนต์ (API/UI รายละเอียดงาน ด่าน A) | [S07](sessions/S07.md), D-S06-1 |
| FU-03 | คำสั่งให้ GM ถอดผู้เกี่ยวข้อง (`related_person_ids`) ออกเอง พร้อม history; ระบบไม่ถอนผู้รับของช่วงรอเก่าอัตโนมัติ; คนที่ถูกถอดอ่าน/ตอบไม่ได้ตั้งแต่ request ถัดไป (revoke fail next read ตาม S11) | ก่อน **S11** (Rules private/children ทดสอบ revoke) หรือ task จัดการผู้เกี่ยวข้องใน A | [S07](sessions/S07.md), D-S06-5 |
| FU-04 | คำสั่งมอบหมายงานให้ GM คนอื่น (`assign`) ใน domain: ตั้ง `assignee_id` + history; ตรวจ effective leave ณ server now (Part 6 §6.6) และคืนธงให้หน้าจอ**เตือนเมื่อมอบหมายให้คนที่ลาอยู่** (ไม่ห้าม, A3 “ต้องแสดงสถานะลาให้เห็น”); GM ที่ลารับเรื่องเองได้ไม่ต้องเตือน (D-S07-4) | ก่อนทำหน้าบอร์ดในด่าน A (**A18**/A20) | [S08](sessions/S08.md), D-S07-4 |
| FU-05 | Firestore **Admin SDK** adapter ของ `CommandStore` (`apps/api/src/commands/transaction-port.ts`): แปลง instant ↔ Timestamp (รวม `commands.expire_at` ต้องเป็น Timestamp จริง TTL policy ของ D-S08-6 จึงลบได้), ตั้ง `maxAttempts`/การ retry เมื่อ transaction ชนกัน (web SDK ค่าเริ่มต้น 5 ไม่พอสำหรับ 15 งานพร้อมกันใน spike) แล้วรัน `tests/emulator` ชุด S08 กับ adapter นี้ให้ผ่าน | ก่อน merge **A01** (create command persistence) | [S08](sessions/S08.md), D-S08-6 |
| FU-01 | ย้ายตัวสร้าง calendar snapshot (`toCalendarSnapshotDocument` / `fromCalendarSnapshotDocument` ใน `apps/api/src/calendar-snapshot.ts`) และ command pipeline/ตัวนับเลขงาน (`apps/api/src/commands`, S08) ไปเป็น module ฝั่ง server ที่ใช้ร่วมกันได้ทั้ง API และ worker โดย hash/source ยังคำนวณนอก `packages/time` ตาม D-S03-4 และใช้ counter `system_counters/request_sequence` ชุดเดียว | เริ่ม **B15** (worker สร้างงานต่ออายุและต้องใช้ snapshot + เลขงาน) | [S03](sessions/S03.md) “รวมกับ S02”, D-S01-1, D-S03-4, [S08](sessions/S08.md) |

## ปิดแล้ว

ยังไม่มี
