# A00 — ลำดับงานด่าน A ที่แนะนำ

วันที่ 7 ต.ค. 2569 · ที่มา: [SESSION-TASKS](../SESSION-TASKS.md) ด่าน A, [WEEK-0](../WEEK-0.md), [FOLLOW-UPS](../FOLLOW-UPS.md) · สถานะ gate: S10–S12 ผ่านแล้ว (UI เริ่มได้)

หลัก: ทำ task ที่ทำได้บน emulator ด้วยข้อมูลสังเคราะห์ก่อน (ไม่ต้องรอ W0) แล้วจึงทำงานที่ต้องใช้ค่าจริงของบริษัท; งานที่ติด W0 ยังเขียนโค้ด/test ได้ แต่ “ปิด” ได้เมื่อได้คำตอบ W0 ตามหลักฐานในตาราง WEEK-0

## W0 ที่ด่าน A ต้องใช้

| W0 | Block ด่าน A? | กระทบ task |
|---|---|---|
| `P7-INFRA-01` deploy pipeline, project IDs, domain/DNS, region, bucket, IAM | ใช่ สำหรับ cloud deploy/pilot | A26, A27; A11 (domain ของ QR ต้องยืนยันก่อนพิมพ์), FU-16 (สิทธิ์เซ็น URL) |
| `P7-ADMIN-01` รายชื่อ `@tdfb.co` CSV + role | ใช่ (people/ACL ที่เชื่อถือได้) | A10 (ข้อมูลจริง), A27; A01/A21 ใช้ชื่อจาก `people` |
| `P7-ADMIN-02` mailbox กลาง / Gmail | ไม่ (adapter disabled) | A08 ส่ง sandbox จริงได้หลังอนุมัติ; A24 degraded mode |
| `P7-ADMIN-03` Slack app / IDs | ไม่ (disabled/ในแอป) | A07 ส่ง sandbox จริงได้หลังอนุมัติ; A24 |
| `P7-ADMIN-04` วันหยุด, FAQ/contact, default owner/types, GM roles | ใช่เฉพาะ calendar จริง, people/roles, FAQ/contact | A01/A05 (calendar + default owner จริงก่อน pilot), A11 (ลงวันหยุดจริง), A23 (FAQ/contact), A27 |

## ลำดับที่แนะนำ

| ลำดับ | Task | Depends | ทำบน emulator ได้เลย? | ติด W0 | ติด follow-up |
|---|---|---|---|---|---|
| 1 | **A01** API auth + create persistence/outbox | S12 | ได้ (ทำใน session นี้) | ค่า calendar/default owner จริงจาก P7-ADMIN-04 ก่อน pilot | FU-16 (ต่อ HTTP — ทำแล้วใน A01; สิทธิ์ IAM เซ็น URL รอ P7-INFRA-01) |
| 2 | A02 worker queue / tick lease / retry | A01 | ได้ (ทำแล้ว) | — | FU-01 (ย้าย pipeline เป็น module ร่วม ก่อน B15); FU-20 ส่วน tick ปิดแล้ว |
| 3 | A03 lifecycle persistence / revision | A01 | ได้ (ทำแล้ว รวม auto-close job) | — | FU-04 (assign), FU-02 (คอมเมนต์ GM = ความคืบหน้า) |
| 4 | A06 unread / pending confirms / delivery badge | A01, S12 | ได้ | — | FU-08 (watch เขียน `user_state`), FU-23 (ป้าย “ผู้ขอยังไม่ได้รับแจ้ง” จาก outbox) |
| 5 | A04 waiting / follow / response + history | A03, A02 | ได้ | — | FU-12 (เพิ่ม/ถอดผู้เกี่ยวข้อง API), FU-09 (ติดธงลับ API), FU-26 (ยกเลิกจาก waiting ปิด interval) |
| 6 | A05 stale / auto-close / presence tick | A02, A03 | ได้ (calendar สังเคราะห์) | P7-ADMIN-04 วันหยุดจริงก่อน pilot | FU-27 (`work_calendar_snapshot`); auto-close job ทำแล้วใน A03 เหลือ stale + presence |
| 7 | A07 Slack outbound (disabled/local mode) | A01, A02 | ได้เฉพาะ disabled/local | P7-ADMIN-03 สำหรับ sandbox จริง | FU-17 |
| 8 | A08 Gmail outbound (disabled/local mode) | A01, A02 | ได้เฉพาะ disabled/local | P7-ADMIN-02 สำหรับ sandbox จริง | FU-17 |
| 9 | A09 Google login / 4 roles / route shell | S12, A01 | ได้ (Auth emulator) | — | — |
| 10 | A11 locations / areas / QR / company calendar (Admin) | A09 | ได้ (ข้อมูลสังเคราะห์) | P7-ADMIN-04 วันหยุดจริง; P7-INFRA-01 domain ก่อนพิมพ์ QR | FU-25 (เวลา tick ล่าสุด, เกิน 30 นาทีสีแดง) |
| 11 | A10 Admin people CSV / roles | A09 | ได้ (CSV สังเคราะห์) | P7-ADMIN-01 CSV จริง | FU-10, FU-11 |
| 12 | A12 public QR landing + repair step 1–3 | A09, A11 | ได้ | — | FU-21 (503 ยังตั้งค่าไม่ครบ → ข้อความไทย + ติดต่อ GM) |
| 13 | A13 duplicate watch backend + interstitial | A12, A01 | ได้ | — | FU-08, FU-15 (contribution) |
| 14 | A14 repair step 4 + submission/retry/title | A12, A13 | ได้ | — | — |
| 15 | A15 photo compression / picker / progress | A14, S12 | ได้ | — | FU-14, FU-15, FU-18 |
| 16 | A16 my requests / related summary / unread UI | A09, A03, A06 | ได้ | — | FU-08 |
| 17 | A17 details / comments / history | A16, A15 | ได้ | — | FU-02, FU-15 |
| 18 | A18 mobile GM board | A09, A03, S09 | ได้ | — | FU-13, FU-04 |
| 19 | A19 desktop Kanban / bounded listeners | A18 | ได้ | — | FU-13 |
| 20 | A21 GM create cross-team + on-behalf | A09, A01, A04 | ได้ | P7-ADMIN-04 default owner/types จริงก่อน pilot | FU-06, FU-21 |
| 21 | A20 card actions + waiting sheet | A18, A03, A04 | ได้ | — | FU-04, FU-06, FU-12, FU-09 |
| 22 | A22 waiting-party response UI | A17, A04 | ได้ | — | — |
| 23 | A23 home focus / presence / contact FAQ | A09, A06, S07 | ได้ (FAQ สังเคราะห์) | P7-ADMIN-04 FAQ/contact จริง | FU-28 (`gm_profile_summaries`) |
| 24 | A24 notification degraded mode + privacy transitions E2E | A19, A23, A02 | ได้ (Slack/Gmail disabled) | P7-ADMIN-02/03 สำหรับกรณีอนุมัติแล้วจริง | FU-09 |
| 25 | A25 mobile/a11y/regression gate | A15, A20, A22, A24 | ได้ | — | — |
| 26 | A26 dev staging / pilot rehearsal | A25, A05, A10, A11 | **ไม่ได้** (cloud) | **P7-INFRA-01** | FU-16 (IAM), FU-17, FU-20 (Cloud Tasks client), FU-22 (checklist settings/ปฏิทิน), FU-24 (worker IAM/Scheduler/indexes) |
| 27 | A27 pilot approval / onboarding | A26 + W0 A blockers | **ไม่ได้** | **P7-INFRA-01, P7-ADMIN-01, P7-ADMIN-04** | ปิด follow-up ด่าน A ทั้งหมด; checklist ก่อน pilot FU-22 (tick ≤ 30 นาที, Cloud Tasks ต่อแล้ว) |

หมายเหตุ

- A07/A08 ทำส่วน disabled/local mode และ outbox state ได้ทันที (ไม่ส่งจริง ไม่แจ้งคนจริง) ส่วนการส่ง sandbox รอ P7-ADMIN-02/03 — ไม่ขวางด่าน A ตาม WEEK-0
- A11 ก่อน A10: QR/สถานที่/ปฏิทินเป็นข้อมูลที่ A12 ต้องใช้; รายชื่อพนักงานจริง (A10) ปิดได้เมื่อได้ CSV จาก P7-ADMIN-01
- A21 ย้ายมาก่อน A20 เพราะการสร้างงาน GM ใช้คำสั่งที่ A01 ทำไว้แล้ว และ A20 ต้องใช้ FU-04/FU-12
- งานที่ต้องใช้ค่าจริงของบริษัท (วันหยุด, default owner, GM roles, FAQ) ใช้ข้อมูลสังเคราะห์ที่ติดป้ายชัดใน dev/emulator และห้ามอนุมานวันหยุดจาก fixture (P7-ADMIN-04)
