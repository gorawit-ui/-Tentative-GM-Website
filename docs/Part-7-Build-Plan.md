# Part 7 — Build plan สำหรับ Claude Code

## 7.1 ข้อที่ปรับจาก Part 6 และฐานแผน

ใช้ Part 6 clean เป็น spec เทคนิคเดิม; คืนช่องว่าง/backticks เท่านั้น ไม่เปลี่ยนเนื้อหาหรือตัวเลข ข้อกำหนดล่าสุดใน Part 7 มีผลเหนือข้อความเดิมเรื่องการเปิดใช้และผู้ส่ง:

- `P7-ADMIN-02`/`03` ยังต้องขอใน W0 แต่ **การอนุมัติ Gmail/Slack ไม่ block Pilot A**; in-app pending confirmation/unread dots/delivery badge และ disabled adapters ต้องผ่านก่อน pilot
- ผู้ส่ง email ต้อง **mailbox กลางเดิมที่บริษัทมีอยู่** ไม่ใช้บัญชีพนักงานรายบุคคล ไม่ซื้อ license ถ้าไม่ทราบให้พี่ทิมตอบก่อนเปิด adapter
- `P7-UX-01`/`02` ทำในระบบจริง: <1 BD ไม่แสดง 0 และคง“ที่แล้ว”; manual category ว่าง required; prototype ไม่แก้เพิ่ม
- Renewal R1–R5 อยู่ B: ตัวเลข renewal Scorecard จริง; ทะเบียนเอกสาร/ทรัพย์สินเต็มอยู่ Phase 2 เอกสารอย่างง่าย US-04 ยัง B

เอกสารใหม่ชนะเก่า C1–C11 ชนะ CH-01–CH-09 เสมอ Part 6 clean ไม่ได้มี policy timestamp ใหม่ ข้อที่ไม่ชัดไม่เดาและไม่ย้าย scope เงียบๆ

## 7.2 ชุดส่งมอบและการใช้

| ไฟล์ | ใช้ทำอะไร |
|---|---|
| [CLAUDE.md](../CLAUDE.md) | คำสั่งเริ่มงาน/stack/กฎห้ามละเมิดแบบสั้น |
| [spec INDEX](spec/INDEX.md) | map หัวข้อ+แหล่งจริงและลำดับความสำคัญ |
| [DECISIONS](spec/DECISIONS.md) | C/A/U/P/F/R/P7 ทุกข้อ หนึ่งบรรทัดพร้อมต้นทาง |
| [WEEK-0](WEEK-0.md) | เจ้าของ/คำถาม/สิทธิ์/assumptions/blocker A |
| [SESSION-TASKS](SESSION-TASKS.md) | งานเรียง dependency จบต่อ session และ acceptance |
| [BUILD-COMMANDS](BUILD-COMMANDS.md) | command contract ที่ S00 ต้องสร้าง ยังไม่ใช่ app ที่พร้อมรัน |
| [TEST-CHECKLIST](TEST-CHECKLIST.md) | foundation/security/flows/mobile/B/cost release gates |
| [reference prototype](../reference/Part-5-Prototype.html) | mock UI ที่ผู้ใช้ยืนยันแล้ว ไม่มีการแก้ prototype รอบนี้ |

โค้ดและ tests ของแอปยังต้องสร้างใน repository บริษัท ชุดนี้ไม่ใช่ application implementation ไม่สร้าง project/deploy/ส่งข้อความแทนผู้ดูแล

## 7.3 Milestone และความจุทีม

นับ W1 จากวันเริ่ม build จริงหลัง W0; Pilot A เป้า W6–7 **ไม่รอ B**; B ต้องภายใน 31 ธ.ค.2569 Trello หลัง B ถ้าทันเท่านั้น

ตัวอย่างสำหรับวางแผน (ยังไม่ใช่กำหนดการที่บริษัทตอบรับ): W0 วันที่ 5–11 ต.ค.2569 / D0 วันที่ 12 ต.ค.2569 หากเริ่มช้ากว่านี้ให้คำนวณวันใหม่ทันที ไม่ถือว่ามี 13 สัปดาห์เต็มหลัง W0

| ช่วง | วันที่ตัวอย่าง | Milestone/หลักฐาน |
|---|---|---|
| W0 | 5–11 ต.ค.2569 | Tim/Admin ยืนยัน infra/people/calendar; mail/Slack สถานะอาจ awaiting; assumptions list/owners/baseline plan |
| W1–W2 | 12–25 ต.ค. | S00–S12: time/domain test-first→Rules/Emulator/API / Storage gate ก่อน UI |
| W3–W5 | 26 ต.ค.–15 พ.ย. | A01–A24 ระบบรับงาน/bounded board/`waiting`/notifications/mobile/admin/QR ครบ; provider adapters อิสระ |
| W6 | 16–22 พ.ย. | A25–27 regression/privacy/cost/restore/pilot candidate |
| W7 | 23–29 พ.ย. | pilot buffer/แก้ issue; เริ่มเก็บ metric 30 วันจากวันเปิดจริง |
| W8–W9 | 30 พ.ย.–13 ธ.ค. | SLA/calendars/aggregates/Scorecard + renewal backend/import foundation |
| W10–W11 | 14–27 ธ.ค. | B ครบ UI/import/Slack actions / digest/document/search/announcement/PWA + release; เสนอ target 25 ธ.ค.เพื่อมี buffer วันหยุด |
| W12 ส่วนที่อยู่ Q4 | 28–31 ธ.ค. | buffer แก้ release issues; hard deadline 31 ธ.ค.; ห้ามนับม.ค.2570 เป็น Q4 |
| Milestone ท้าย | หลัง B เมื่อมี capacity | T01–03; เลื่อน Phase 2 ได้ ไม่ gate repair/pilot/B |

**Capacity assumption:** Build lead 1 คนใช้ Claude Code ~32 ชั่วโมง/สัปดาห์, GM review ~2 ชั่วโมง/สัปดาห์, Tim จอง infra/release slots; ไม่ทราบทีมจริง ต้องยืนยันใน W0 Backlog มี 40 sessions foundation+A และ 26 sessions B, session 2–4 ชั่วโมง: engineering 132–264 ชั่วโมง ไม่รวม W0/production approval/รอผู้ดูแล/incident/ข้อมูลจริง/Trello 3 sessions ค่ากลาง 198 ชั่วโมงใช้เพื่อ forecast เท่านั้น

11 build weeks ก่อน release ให้ 352 ชั่วโมงตาม assumption จึงมีเวลา review/integration/buffer แต่ไม่รับประกัน Q4 จนรู้ capacity จริง Checkpoint หลัง W2 ใช้เวลาจริง median/session และ dependencies forecast ใหม่ ถ้าโอกาสหลุด Q4 ให้ GM Admin/Tim ตัดสิน capacity หรือวันเปิดอย่างชัดเจน; ห้ามย้าย feature B ออกเอง รายการเดียวที่เลื่อนได้ตาม brief คือ Trello

## 7.4 ลำดับ implement และ DoD

เริ่ม [S00–S12](SESSION-TASKS.md): failing tests ของ `packages/time` และ `packages/domain` ใช้ Part 6§6.7 แล้ว pure implementation; ตามด้วย Rules/Emulator และ API authorization ก่อนหน้าจอ Domain tests ไม่พึ่ง Firestore/time / wall clock ทุก calculation มี single time source ไม่มีสูตรเวลาอีกชุดใน UI/scheduler/aggregate

หลัง foundation gate สร้าง commands/API/worker idempotent ก่อน route/form; notification เป็น adapters แยกและ feature config disabled ไม่บล็อก transaction สร้าง in-app channel ก่อน provider UI รองรับ anonymous QR contact แต่ไม่มี anonymous request direct write

หนึ่ง session เลือกหนึ่งแถวพร้อม dependencies; เขียน test/implement/check ตาม DoD ไม่ทำ whole Dashboard/whole renewals ใน session เดียว ดู acceptance ทุก task และ release matrix ใน [TEST-CHECKLIST](TEST-CHECKLIST.md)

## 7.5 เกณฑ์เปิด Pilot A

GM Admin รับรอง business flow; Tim รับรอง infra/operations; Build lead ส่งหลักฐาน:

- auth 4 role/company active, private ACL/secret/watchers/Viewer, public/private collection split และ APIdeny ครบ
- QR repair 4 steps/duplicate watch/photo/comments/my requests; GM create cross-team<1 นาที/on-behalf; board 5 statuses/filter unassigned/history/wait/follow/respond
- stale company calendar/follow; complete / confirm/3 BDauto-close/cancel/reopen; year-end holidays ใส่จริง; focus/presence/leave/in-app notifications พร้อม
- Admin places/areas/QR/users/company calendar; FAQ / contact; recorded `coordinateTechnician` แต่ไม่ประเมิน SLA ใน A
- mobile/desktop 4 sizes ไม่ horizontal page/no overlay; common actions<=2 taps;P1 P2 F1 F6+UX carryovers; QR ชี้ custom domain จริง
- W0 A blockers และ 4 assumptions ได้รับคำตอบ; budgets/usage/no loops/backup / restore/rollback ผ่าน; pilot users ครบ 5 sites และ baseline ก่อนเปิด

**Slack/Gmail approval ไม่ใช่ gate** หาก provider ไม่ได้รับอนุมัติให้ disable พร้อมบันทึกสถานะ ผู้ใช้ยังเห็น pending/unread ในแอป GM เห็น badge เมื่อผู้ขอยังไม่มีช่องทางสำเร็จ ห้ามใช้บัญชีพนักงานหรือส่งฟรีเท็กซ์ทางอื่นแทน ไม่แสดง delivery สำเร็จหากไม่ได้ส่งจริง

## 7.6 เกณฑ์ปิด Phase 1 / ด่าน B

ผ่าน A regression + site calendars/SLA 2 policies + Dashboard เต็ม/server aggregates/Scorecard CSV + Slack actions/digest + simple documents/search/announcement/PWA + renewals R1–R5 ครบและ CSV validated data ข้อมูลผลวัด SLA ใช้ original due/budget ตาม snapshot และ pause end `responded_at` ไม่ reset breach ผ่าน reopen

Renewal close ทุกช่องทางต้อง new expiry หรือ no-renew reason ใช้ tick เดิม oneitem/onecycle/one `gm_task`; reminders 30/7/overdue holiday catch-up; renewal Scorecard จริงและ Viewer privacy อีกสองทะเบียนยัง “ยังไม่เชื่อมข้อมูล” พร้อม sheet links Trello ไม่เป็น release gate

## 7.7 Success metrics / หลังเปิด

| ช่วงวัด | Metric/เป้าตาม PRD+C9 | Owner/หลักฐาน |
|---|---|---|
| ก่อน A | baseline ถามสถานะต่อ 100 งาน | GM Admin จดนับวิธีเดิม/ช่วงเทียบเท่า |
| A+30 วัน | งานข้ามทีมเข้าระบบ 100%; รวม `gm_initiated` ที่มีผู้เกี่ยวข้องนอก GM | GM Admin กระทบยอด web กับช่องทางเดิม; field/team label ไม่ใช้แทน ACL |
| A+30 วัน | พนักงานเปิดเอง>=80%; on-behalf รวมฐานไม่ตัวตั้ง | domain `origin` facts/aggregate; ไม่รวม `gm_task` ไม่มี `requester` ในฐานพนักงาน |
| A+30 วัน | median repair<=90 วินาทีและ 4 steps; status self-service>=90%ใน>=10 คนครบ 5 สถานที่ | form timing/GM user test; duplicate screen ไม่เพิ่มขั้นเมื่อไม่มี match |
| A+30 วัน | stale<=10%; `waiting` ข้อมูลครบ 100%; ถามสถานะลด>=50% | Monday consistent cohort/รอมี `waiting_on`+`waiting_since`; baseline หลัง A |
| หลัง B | SLA>=90%ใน eligible cohort; Scorecard ซ่อม 0 ครั้งที่ต้องนับมือ | owner GM; cohort/CSV definitions จาก PRD 6.7/Part 6; renewal จริงแยกนิยาม |

ไม่ใช้ success metric หลัง 30 วันเป็นสิ่งที่ต้องพิสูจน์ก่อน pilot เปิด pilot ผ่าน quality gate ก่อนแล้ววัดตามช่วง ไม่มีการทดสอบ SLA ผ่านใน A ที่ยังไม่ได้เปิดเกณฑ์

## 7.8 ส่งต่องานและข้อจำกัด

Part 3 UI spec ฉบับเต็มกู้คืนแล้วที่ [Part 3 UI spec](spec/Part-3-UI-Spec.md) (ดู [HANDOFF-CHANGES](HANDOFF-CHANGES.md)) ใช้เป็นต้นทางของหน้าจอ โดย U/P/F และ P7-UX ที่ใหม่กว่าชนะเมื่อขัดกัน ถ้า task พบรายละเอียดที่แหล่งเหล่านี้ไม่ตอบให้บันทึกเป็นคำถามก่อนทำส่วนที่ขึ้นกับคำตอบ

ชุดนี้ส่งเอกสาร/task/test criteria ไม่ได้ตรวจ infra บริษัทหรือรัน application tests จริง ยังไม่สร้าง license/accounts/deploy prod/ส่ง message เจ้าของใน W0 เป็นผู้ที่ต้องตอบรับ ขั้นถัดไปคือทีมยืนยัน W0 และเริ่ม S00 ตาม dependency ไม่เริ่ม Part ถัดไปโดยอัตโนมัติ
