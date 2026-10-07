# Follow-ups — งานที่เลื่อนไว้ข้าม session

รายการที่ตั้งใจเลื่อนไปทำใน task ภายหลัง แต่ละแถวต้องมีเงื่อนไขว่าต้องเสร็จก่อนอะไร ปิดรายการเมื่อทำแล้วโดยใส่ commit/PR และย้ายไป “ปิดแล้ว”

## เปิดอยู่

| ID | งาน | ต้องเสร็จก่อน | ที่มา |
|---|---|---|---|
| FU-02 | คำสั่งคอมเมนต์ใน domain: คอมเมนต์ของ GM (`gm_staff`/`gm_admin`) บนงาน `queued`/`in_progress` (และทุกสถานะที่เปิด) นับเป็น action ของ GM → อัปเดต `last_updated_at` (reset stale) ตาม D-S05-3/D-S06-1; คอมเมนต์ของผู้ขอ/related/watcher ไม่อัปเดต | task ที่ทำคอมเมนต์ (API/UI รายละเอียดงาน ด่าน A) | [S07](sessions/S07.md), D-S06-1 |
| FU-04 | คำสั่งมอบหมายงานให้ GM คนอื่น (`assign`) ใน domain: ตั้ง `assignee_id` + history; ตรวจ effective leave ณ server now (Part 6 §6.6) และคืนธงให้หน้าจอ**เตือนเมื่อมอบหมายให้คนที่ลาอยู่** (ไม่ห้าม, A3 “ต้องแสดงสถานะลาให้เห็น”); GM ที่ลารับเรื่องเองได้ไม่ต้องเตือน (D-S07-4) | ก่อนทำหน้าบอร์ดในด่าน A (**A18**/A20) | [S08](sessions/S08.md), D-S07-4 |
| FU-05 | Firestore **Admin SDK** adapter ของ `CommandStore` (`apps/api/src/commands/transaction-port.ts`): แปลง instant ↔ Timestamp (รวม `commands.expire_at` ต้องเป็น Timestamp จริง TTL policy ของ D-S08-6 จึงลบได้), ตั้ง `maxAttempts`/การ retry เมื่อ transaction ชนกัน (web SDK ค่าเริ่มต้น 5 ไม่พอสำหรับ 15 งานพร้อมกันใน spike) แล้วรัน `tests/emulator` ชุด S08 กับ adapter นี้ให้ผ่าน | ก่อน merge **A01** (create command persistence) | [S08](sessions/S08.md), D-S08-6 |
| FU-06 | ฟอร์ม “รอผู้อื่น” (การ์ดและฟอร์มสร้างงาน GM): เมื่อเลือกหน่วยงานรัฐ ต้องบอกใต้ช่องชื่อว่า “ชื่อหน่วยงานนี้จะแสดงบนบอร์ดที่ทุกคนเห็น” (ผู้รับเหมา/อื่นๆ แสดงบนบอร์ดเป็นคำกลาง พนักงานแสดงชื่อทีม) | task หน้าจอรอผู้อื่น (A20/A21) | D-S09-1 |
| FU-08 | คำสั่ง `watch` ต้องเขียน `user_state/{person_id}/requests/{id}` ของ watcher (relation `type` = watcher) เพื่อให้แท็บเกี่ยวข้องกับฉันแสดง “ติดตามอยู่ — ดูข้อมูลสรุป” ได้ (ตอนนี้ S08 เขียนแค่ `watcher_ids`) และเมื่องานถูกติดธงลับต้องซ่อนจาก watcher ที่ไม่มี ACL (§6.4.2) | task user_state/unread (**A06**) | D-ACL-6 |
| FU-09 | ต่อ `markConfidential` (domain, D-ACL-2) เข้า command API: ลบ `request_summaries/{id}`, ปรับ `board_counters/public`/focus ที่ปลอดภัย และเพิ่ม `public_visibility_epoch` ใน transaction เดียว (§6.4.1); หน้าจอติดธงลับต้องแสดงรายชื่อ related เดิมให้ GM เลือกคงสิทธิ์โดยไม่ติ๊กล่วงหน้า | task ติดธงลับ/รายละเอียด GM ในด่าน A | D-ACL-2 |
| FU-10 | ตัวนำเข้า CSV รายชื่อพนักงาน: อ่านคอลัมน์ทีมเป็นค่าเดียว (trim; ว่าง = ไม่รู้ทีม) แล้วให้ `personTeamLabel` คืนค่านั้น; ไม่มีทีม → “พนักงาน” | task นำเข้ารายชื่อพนักงาน (Admin) | D-ACL-7, D-S09-1 |
| FU-11 | งานนำเข้ารายชื่อพนักงาน (CSV): หลัง import ชื่อใหม่ ให้อัปเดตคู่ชื่อ (`requester_display` / `assignee_display` / `related_people_display`) ใน `requests/{id}` ของงานที่ยังเปิดอยู่ แบบ batch มีขอบเขตและ idempotent; งานที่ปิดแล้วคงชื่อเดิม | task นำเข้ารายชื่อพนักงาน (Admin) | D-S10-1, [S11](sessions/S11.md) |
| FU-12 | ต่อ `addRelatedPersons` / `removeRelatedPerson` (domain, FU-03/FU-07) เข้า command API: `expected_revision`, history, เขียนคู่ชื่อใหม่ (D-S10-1), เพิ่ม/ลบ `user_state` ของคนนั้น, ส่งแจ้งเตือนเฉพาะคนที่มีสิทธิ์; หน้าจอแสดงรายชื่อที่จะได้สิทธิ์งานลับให้ยืนยันโดยไม่ติ๊กล่วงหน้า | task จัดการผู้เกี่ยวข้องในด่าน A (A20/A21) | FU-03, FU-07, [S11](sessions/S11.md) |
| FU-13 | หน้าบอร์ด (สาธารณะและ GM): query แยกตามส่วน งานเปิด / เสร็จรอยืนยัน / ปิดใน 7 วัน / การ์ดจาก Trello; งานเปิดใช้ `limit(MAX_LIST_LIMIT)` (200) + ปุ่ม “โหลดเพิ่ม” (cursor) เมื่อได้ครบ 200 และบอกว่ายังมีอีก ห้ามตัดเงียบ; หน้า “ดูทั้งหมด” ใช้ `pageLimit()` (50) | task หน้าบอร์ดด่าน A (A18/A20) | D-S11-3, D-S10-4 |
| FU-01 | ย้ายตัวสร้าง calendar snapshot (`toCalendarSnapshotDocument` / `fromCalendarSnapshotDocument` ใน `apps/api/src/calendar-snapshot.ts`) และ command pipeline/ตัวนับเลขงาน (`apps/api/src/commands`, S08) ไปเป็น module ฝั่ง server ที่ใช้ร่วมกันได้ทั้ง API และ worker โดย hash/source ยังคำนวณนอก `packages/time` ตาม D-S03-4 และใช้ counter `system_counters/request_sequence` ชุดเดียว | เริ่ม **B15** (worker สร้างงานต่ออายุและต้องใช้ snapshot + เลขงาน) | [S03](sessions/S03.md) “รวมกับ S02”, D-S01-1, D-S03-4, [S08](sessions/S08.md) |

## ปิดแล้ว

| ID | งาน | ปิดโดย |
|---|---|---|
| FU-03 | GM ถอดผู้เกี่ยวข้อง พร้อมถอด grant | S11: `removeRelatedPerson` (`packages/domain/src/related-people.ts`) — ถอดจาก `related_person_ids` และ `confidential_grant_ids`, event `related_person_removed`, ไม่แตะผู้รับของช่วงรอ (การตอบถูกปฏิเสธด้วย `ACCESS_REVOKED`); Rules test ยืนยันว่าอ่านไม่ได้ทันที; API command → FU-12 |
| FU-07 | ทุกคำสั่งที่เพิ่ม related ในงานลับต้องยืนยันและบันทึก grant | S11: `addRelatedPersons` / `planRelatedAddition`, `createRequestDraft` (gm_task / เปิดแทน) และ command `create_gm_task` / `create_on_behalf` (`related_person_ids`, `confirm_confidential_grant`) — ไม่ยืนยัน → `CONFIDENTIAL_GRANT_REQUIRED`; ยืนยัน → บันทึก `confidential_grant_ids`; flow รอผู้อื่นและ `markConfidential` ทำไว้แล้ว |
