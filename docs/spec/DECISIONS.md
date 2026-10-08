# Decision register

หนึ่งแถวต่อหนึ่งรหัส; ข้อความสรุปใช้ค้นเรื่อง ไม่แทนต้นทาง ลำดับตาม INDEX; P7-ADMIN-02/03 ใช้ข้อใหม่ไม่เป็น blocker A; รหัส task S/A/B/T ไม่ใช่ decision IDs

| ID | การตัดสินใจ | ไฟล์ต้นทาง / หัวข้อ |
|---|---|---|
| `C1` | แบ่ง A/B; Trello milestone ท้ายไม่เป็น gate; phase stories ตามรายการ | [Part-1-Changelog.md](Part-1-Changelog.md) / C1 |
| `C2` | `gm_task`, `created_by_id`, `origin`; GM เริ่มเอง/เปิดแทนจริง; ไม่มี `requester` ใน `gm_task` | [Part-1-Changelog.md](Part-1-Changelog.md) / C2 |
| `C3` | แจ้ง current `waiting` recipients; secret grant แยก; follow reminder จำกัด/ส่งล้มเหลวไม่ย้อนงาน | [Part-1-Changelog.md](Part-1-Changelog.md) / C3 |
| `C4` | `related_person_ids` ให้รายละเอียด; `team_labels` รายงานเท่านั้น ไม่ให้สิทธิ์ | [Part-1-Changelog.md](Part-1-Changelog.md) / C4 |
| `C5` | auto-close 3 วันทำการ; A company calendar+B site calendar; production ปีใหม่ต้องใส่ holiday | [Part-1-Changelog.md](Part-1-Changelog.md) / C5 |
| `C6` | secret default เฉพาะสัญญา/บุคคล; `summary_title` เปิดเผยได้; ปลดธง Admin พร้อมเหตุผล | [Part-1-Changelog.md](Part-1-Changelog.md) / C6 |
| `C7` | focus หนึ่งงาน; latest `in_progress` fallback; presence reset; secret focus “งานภายใน” | [Part-1-Changelog.md](Part-1-Changelog.md) / C7 |
| `C8` | SLA/calendar snapshot ไม่มี version registry; B 2 policy; shared pure time+unit tests ตั้งแต่ A | [Part-1-Changelog.md](Part-1-Changelog.md) / C8 |
| `C9` | วัด A+30 วัน/B แยก; release gates แยก A/B; baseline ก่อน A | [Part-1-Changelog.md](Part-1-Changelog.md) / C9 |
| `C10` | ก่อน A เตรียม people/slack IDs/company holidays/FAQ; team contacts optional | [Part-1-Changelog.md](Part-1-Changelog.md) / C10 |
| `C11` | public/private collections แยก; prefix/number search; server aggregates; scheduler idempotent | [Part-1-Changelog.md](Part-1-Changelog.md) / C11 |
| `A1` | in-app pending/unread, email fallback, no-company QR/contact, no-channel badge | [Part-2-Addendum.md](Part-2-Addendum.md) / A1 |
| `A2` | current `waiting` party respond; no status/stale change; `waiting`/SLA pause ends at response | [Part-2-Addendum.md](Part-2-Addendum.md) / A2 |
| `A3` | leave end date; default owner on leave→unassigned new tasks + all GM | [Part-2-Addendum.md](Part-2-Addendum.md) / A3 |
| `A4` | short sequential request number ทุกงาน เช่น `GM-0427` | [Part-2-Addendum.md](Part-2-Addendum.md) / A4 |
| `U1` | duplicate public maintenance match→watcher summary-only/idempotent/no new Request | [Part-3-Addendum.md](Part-3-Addendum.md) / U1 |
| `U2` | maintenance auto `summary_title`; free text private; `requester` ไม่แก้ title | [Part-3-Addendum.md](Part-3-Addendum.md) / U2 |
| `U3` | closed/`cancelled` 7 วัน; `completed` pending confirm always; all paginated not live | [Part-3-Addendum.md](Part-3-Addendum.md) / U3 |
| `U4` | GM เท่านั้น stale badge; employee/Viewer/`requester` neutral latest-update copy | [Part-3-Addendum.md](Part-3-Addendum.md) / U4 |
| `U5` | client compress image/progress each/partial upload ไม่ block request | [Part-3-Addendum.md](Part-3-Addendum.md) / U5 |
| `P1` | tokens import `layer(components)`; CSS ทุกกฎใน layer; utilities override ได้ | [Part-4-Patch.md](Part-4-Patch.md) / P1 |
| `P2` | 1366 แสดง 3 open columns; <1536 ย่อ closed/`cancelled`; confirm badge; >=1536 five | [Part-4-Patch.md](Part-4-Patch.md) / P2 |
| `F1` | mobile filter chips+sheet; first full card 360; create GM small header button | [Part-5-Patch.md](Part-5-Patch.md) / F1 |
| `F2` | compact cards/remove duplicate location/one meta line;390 เห็น 3 ใบ; actions 44 px | [Part-5-Patch.md](Part-5-Patch.md) / F2 |
| `F3` | `waiting`/person empty required; notify/grant หลังเลือก; secret grant separate | [Part-5-Patch.md](Part-5-Patch.md) / F3 |
| `F4` | Thai stale wording/integer floor display; raw thresholds; bottleneck business days | [Part-5-Patch.md](Part-5-Patch.md) / F4 |
| `F5` | Thai image picker; hidden native file input; Thai selected list | [Part-5-Patch.md](Part-5-Patch.md) / F5 |
| `F6` | form hide bottom nav/compact action bar; back follows actual `origin` | [Part-5-Patch.md](Part-5-Patch.md) / F6 |
| `R1` | `renewal_items` GM-only fields/default owner Gorawit/lead 90,60,45,30/secret contract | [Infrastructure-Budget-and-Renewals.md](Infrastructure-Budget-and-Renewals.md) / R1 |
| `R2` | one `gm_task` per cycle/single tick;30/7/overdue;holiday notification next business morning | [Infrastructure-Budget-and-Renewals.md](Infrastructure-Budget-and-Renewals.md) / R2 |
| `R3` | close requires new expiry; otherwise no-renew reason+archive/next cycle atomic | [Infrastructure-Budget-and-Renewals.md](Infrastructure-Budget-and-Renewals.md) / R3 |
| `R4` | GM renewal groups/form; real renewal Scorecard; full register Phase 2 | [Infrastructure-Budget-and-Renewals.md](Infrastructure-Budget-and-Renewals.md) / R4 |
| `R5` | CSV preview/row errors/BE→CE explicit confirm before write | [Infrastructure-Budget-and-Renewals.md](Infrastructure-Budget-and-Renewals.md) / R5 |
| `P7-UX-01` | <1 BD ไม่แสดง 0; last update มี “ที่แล้ว”; raw stale ไม่ปัด | [Part-7-Directives.md](Part-7-Directives.md) / D5 |
| `P7-UX-02` | manual GM category starts empty required; ไม่เลือกจัดซื้อไว้ล่วงหน้า | [Part-7-Directives.md](Part-7-Directives.md) / D5 |
| `P7-INFRA-01` | Tim ยืนยัน pipeline/project/domain/location/IAM/shared quota ก่อน cloud deploy | [Part-6-Technical-Spec-Clean.md](Part-6-Technical-Spec-Clean.md) / §6.15; WEEK-0 |
| `P7-ADMIN-01` | Admin people CSV หรือ Directory readonly approved; CSV แทน API ได้ | [Part-6-Technical-Spec-Clean.md](Part-6-Technical-Spec-Clean.md) / §6.15; WEEK-0 |
| `P7-ADMIN-02` | central existing mailbox/internal OAuth/gmail.send; approval ไม่ block A | [Part-7-Directives.md](Part-7-Directives.md) / D2,D4; Part 6 §6.15 |
| `P7-ADMIN-03` | Slack plan/slots/scopes/IDs/signing; approval ไม่ block A | [Part-7-Directives.md](Part-7-Directives.md) / D2; Part 6 §6.15 |
| `P7-ADMIN-04` | GM/Admin company holidays/FAQ/contact/roles/budget recipients ก่อน pilot | [Part-6-Technical-Spec-Clean.md](Part-6-Technical-Spec-Clean.md) / §6.15; WEEK-0 |
| `P7-RENEW-01` | B renewal lifecycle/reminders/single tick/real Scorecard ไม่พึ่ง A gate | [Part-6-Technical-Spec-Clean.md](Part-6-Technical-Spec-Clean.md) / §6.8,6.15 |
| `P7-RENEW-02` | CSV preview/BE/errors/idempotency + confirm certificate lead | [Part-6-Technical-Spec-Clean.md](Part-6-Technical-Spec-Clean.md) / §6.8,6.15 |
| `P7-COST-01` | bounded listeners/unsubscribe/pagination/reconnect/idle usage ทุก dev deploy | [Part-6-Technical-Spec-Clean.md](Part-6-Technical-Spec-Clean.md) / §6.11,6.15 |
| `P7-COST-02` | regression กัน write-back trigger/worker วนลูปทุก integration change | [Part-6-Technical-Spec-Clean.md](Part-6-Technical-Spec-Clean.md) / §6.15 |
| `P7-COST-03` | Firestore usage dev หลังทุก deploy+Billing/export/retry/retention | [Part-6-Technical-Spec-Clean.md](Part-6-Technical-Spec-Clean.md) / §6.12,6.15 |
| `P7-OPS-01` | alerts 100/300/1000 project/min 0/limits/outbox/backup / restore ก่อน pilot | [Part-6-Technical-Spec-Clean.md](Part-6-Technical-Spec-Clean.md) / §6.12–6.15 |
| `P7-TRELLO-01` | labels-only/read-only/privacy review; ท้ายสุดเลื่อน Phase 2 ได้ | [Part-6-Technical-Spec-Clean.md](Part-6-Technical-Spec-Clean.md) / §6.10,6.15 |
| `P7-DOC-01` | CLAUDE concise objective/stack/commands/invariants/spec links | [Part-7-Directives.md](Part-7-Directives.md) / D1 |
| `P7-DOC-02` | INDEX map topic→file+section; disclose missing full Part 3 | [Part-7-Directives.md](Part-7-Directives.md) / D1 |
| `P7-DOC-03` | newer decision wins; C1–C11 always over CH-01–09; clean format not new policy | [Part-7-Directives.md](Part-7-Directives.md) / D1 |
| `P7-DOC-04` | DECISIONS all C/A/U/P/F/R/P7 one-line/source each | [Part-7-Directives.md](Part-7-Directives.md) / D1 |
| `P7-PLAN-01` | W0 before code owners+A blockers ชัดเจน; assumptions/questions not silent | [Part-7-Directives.md](Part-7-Directives.md) / D2 |
| `P7-PLAN-02` | tasks single 2–4 h session with dependencies/acceptance/DoD | [Part-7-Directives.md](Part-7-Directives.md) / D2 |
| `P7-PLAN-03` | time/domain test-first§6.7→Rules/Emulator→UI | [Part-7-Directives.md](Part-7-Directives.md) / D2 |
| `P7-PILOT-01` | Slack/Gmail approval not A gate; in-app+not-notified badge mandatory | [Part-7-Directives.md](Part-7-Directives.md) / D2 |
| `P7-ASSUME-01` | confirm 100 users/20 tasks per BD/200 renewals/certificate lead 30 days before pilot | [Part-7-Directives.md](Part-7-Directives.md) / D3 |
| `P7-MAIL-01` | central existing mailbox; ask Tim if unknown; no individual sender/new license | [Part-7-Directives.md](Part-7-Directives.md) / D4 |

## S01 — คำตอบที่ผู้ใช้ยืนยัน 4 ต.ค. 2569 (D-S01-1 ถึง D-S01-6)

ใหม่กว่าคำถามใน S01 และใช้แทนส่วนที่ขัดกัน รายละเอียด/ผลทดสอบ: [S02](../sessions/S02.md)

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S01-1` | Persisted snapshot อยู่ `packages/contracts`: `timezone`, `open_weekdays`, `holidays`, `hash`, `source`; ISO weekdays 1–7 คงเดิม; `packages/time` ใช้ `timeZone`/`openWeekdays` ภายในได้; ยังไม่เขียน Firestore | ตรง snake_case ของ Part 6 และเก็บ provenance ตาม §6.7; แยก persisted shape จาก calculation input ตามคำยืนยันผู้ใช้ / [S02](../sessions/S02.md) |
| `D-S01-2` | ใช้ `business_days` ตาม C8 ทั้งระบบ; `business_day` ใน Part 6 เป็นการพิมพ์ต่างกัน ไม่รับเป็น alias; อีกหน่วยคือ `continuous_24h` | ป้องกันหลาย spelling ใน policy/snapshot/caller; ใช้ canonical key เดียวตามคำยืนยันผู้ใช้ / [S02](../sessions/S02.md) |
| `D-S01-3` | Configured duration = 0 เป็น invalid input; ยังคงโยน `RangeError` | คงกติกา TEST-CHECKLIST และไม่สร้าง SLA ที่ budget เป็นศูนย์; measured elapsed ที่ยังไม่มีเวลาอาจคืน 0 ได้ / [S02](../sessions/S02.md) |
| `D-S01-4` | Phase 1 configured durations เป็นจำนวนเต็มวันบวกเท่านั้น ผ่าน `addDuration`; สองหน่วย `business_days`/`continuous_24h`; ไม่มี fractional-day/hour policy unit | ลดความซับซ้อนตามคำยืนยันผู้ใช้; raw elapsed/interval calculations และ `addBusinessDuration` ยังคำนวณเป็น milliseconds เพื่อไม่ปัด clock / [S02](../sessions/S02.md) |
| `D-S01-5` | ทุก company/site calendar snapshot รับเฉพาะ `Asia/Bangkok`; timezone อื่นโยน `RangeError` ใน validation แม้เป็น IANA zone ที่ถูกต้อง | บริษัทใช้งานในไทยซึ่งไม่มี DST; หลีกเลี่ยงความหมายวันเปิด 23/25 ชั่วโมงใน Phase 1 ตามคำยืนยันผู้ใช้ / [S02](../sessions/S02.md) |
| `D-S01-6` | `packages/time` ปฏิเสธ holiday year นอก ค.ศ. 2000–2100 inclusive ด้วย `RangeError` ระบุว่าน่าจะกรอกเป็น พ.ศ.; แปลง พ.ศ.→ค.ศ. พร้อม preview/confirm ใน Admin/import tasks เท่านั้น | กันวันหยุดปี 2569 ที่รูปแบบ valid แต่ไม่ตรงวันใช้งาน ทำให้วันหยุดกลายเป็นวันทำงานเงียบๆ; สองชั้นตามคำยืนยันผู้ใช้และ R5 / [S02](../sessions/S02.md) |

## S03 — คำตอบที่ผู้ใช้ยืนยัน 4 ต.ค. 2569 (D-S03-1 ถึง D-S03-4)

ใหม่กว่าคำถามใน S03 และใช้แทนส่วนที่ขัดกัน ผล implement: [S03](../sessions/S03.md)

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S03-1` | เวลาที่น้อยกว่า 1 วันทำการแสดง “ไม่ถึง 1 วันทำการ” ทุกหน้าจอ ไม่ใช้คำว่า “วันนี้” | ปิดความกำกวม “วันนี้” ใน P7-UX-01/Part 6 §6.7 ตามคำยืนยันผู้ใช้ / [S03](../sessions/S03.md) |
| `D-S03-2` | แสดงเป็นจำนวนวันทำการเต็ม ปัดลง ตาม F4; ไม่ใช้ทศนิยมหนึ่งตำแหน่งของ U4 | F4 ใหม่กว่าและอยู่ลำดับสูงกว่า U1–U5 ใน INDEX ตามคำยืนยันผู้ใช้ / [S03](../sessions/S03.md) |
| `D-S03-3` | ป้าย GM “ไม่ขยับ 3 วันทำการ · ถึงเวลาติดตาม” ตอนเพิ่ง stale (raw > 3 วันทำการ แต่ปัดลงได้ 3) ยอมรับได้ | การตัดสินใช้ raw ส่วนการแสดงปัดลงตาม D-S03-2 ตามคำยืนยันผู้ใช้ / [S03](../sessions/S03.md) |
| `D-S03-4` | `hash` = SHA-256 (hex) ของ canonical JSON `{"timezone","open_weekdays","holidays"}` (weekdays เรียงน้อยไปมาก, holidays เรียงวันที่และตัดซ้ำ, ไม่มีช่องว่าง); `source` = id ปฏิทินต้นทาง + เวลาที่ snapshot ในรูป `<calendar id>@<ISO-8601 UTC>`; คำนวณฝั่ง server ตอนบันทึกข้อมูล ไม่ใช่ใน `packages/time` | เก็บ provenance ตาม Part 6 §6.7 และ D-S01-1 โดย `packages/time` ยัง pure ตามคำยืนยันผู้ใช้; รูปแบบสตริง `@` เป็นรายละเอียด implement / [S03](../sessions/S03.md) |

## S04 — คำตอบที่ผู้ใช้ยืนยัน 4 ต.ค. 2569 (D-S04-1 ถึง D-S04-6)

ใหม่กว่าคำถามใน S04 และใช้แทนส่วนที่ขัดกัน ผล implement: [S05](../sessions/S05.md) ส่วนที่ 1

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S04-1` | หมวดเก็บเป็น key คงที่ snake_case ชื่อไทยเป็น label แยก: `damage` = บริหารสินค้า Damage, `documents_admin` = เอกสารและธุรการ, `assets_facilities` = ทรัพย์สินและอาคารสถานที่, `purchasing_bills` = จัดซื้อทั่วไปและบิล, `government_compliance` = ภาครัฐ กฎหมาย Compliance, `improvement_projects` = Project ปรับปรุงระบบ, `employee_activities` = กิจกรรมพนักงาน; command/draft รับเฉพาะ key | เปลี่ยนชื่อที่แสดงได้โดยข้อมูลที่เก็บไม่พัง ตามคำยืนยันผู้ใช้ / PRD §5.1 |
| `D-S04-2` | หมวดอัตโนมัติ: `maintenance` → `assets_facilities`; `document_request`/`document_intake` → `documents_admin`; งานต่ออายุ (B): สัญญา / ประกันภัย / อื่นๆ → `documents_admin`, ใบอนุญาตหรือเอกสารภาครัฐ / ใบรับรองมาตรฐาน → `government_compliance`; `gm_task` ยังต้องเลือกเองไม่มีค่าเริ่มต้น (P7-UX-02) | ให้ทุกงานมีหมวดสำหรับรายงานโดยไม่ต้องกรอกเพิ่ม; mapping ต่ออายุใช้ใน B14/B15 ตามคำยืนยันผู้ใช้ |
| `D-S04-3` | คำตอบเรื่องลับ `contract` / `personnel` / `general` บังคับตอบสำหรับ `document_*` และ `gm_task`; `sensitivity_reason` เก็บ `contract` / `personnel` | ยืนยันรูปแบบที่ทำใน S04 ตามคำยืนยันผู้ใช้ |
| `D-S04-4` | ตอนสร้างงาน GM เปิดธงลับเพิ่มเองได้; ปิดธงลับที่เป็นค่าเริ่มต้นของสัญญา/บุคคลไม่ได้ (ปลดธงทำได้เฉพาะ GM Admin พร้อมเหตุผลตาม C6 ภายหลัง); ผู้แจ้งทั่วไปตั้งธงลับไม่ได้ | กันการลดระดับความลับตอนสร้างโดยไม่มีเหตุผล ตามคำยืนยันผู้ใช้ / C6 |
| `D-S04-5` | งานแจ้งซ่อมไม่ลับเสมอ (แม้ GM ขอเปิดธง) | ชื่อบนบอร์ดสร้างอัตโนมัติจึงไม่มีข้อมูลอ่อนไหว รายละเอียดที่พิมพ์จำกัดสิทธิ์อยู่แล้ว และการกันแจ้งซ้ำ U1 ต้องใช้งานที่ไม่ลับ ตามคำยืนยันผู้ใช้ |
| `D-S04-6` | Viewer เปิดคำขอของตัวเองได้ | Viewer เป็นพนักงานคนหนึ่งเหมือนกัน ตามคำยืนยันผู้ใช้ |

## S05 — คำตอบที่ผู้ใช้ยืนยัน 4 ต.ค. 2569 (D-S05-1 ถึง D-S05-6)

ใหม่กว่าคำถามใน S05 และใช้แทนส่วนที่ขัดกัน ผล implement: [S06](../sessions/S06.md) ส่วนที่ 1

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S05-1` | กดเสร็จได้เฉพาะจาก `in_progress`; งาน `waiting` ต้องกด “กลับมาทำต่อ” ก่อน | ให้ช่วงรอถูกปิดอย่างถูกต้องเสมอ (exit ของ interval) ก่อนเข้ารอบเสร็จ ตามคำยืนยันผู้ใช้ / F04 |
| `D-S05-2` | ยกเลิกงาน `completed` ที่รอยืนยันไม่ได้ ต้องเปิดกลับก่อน | คงเส้นทาง F04 และไม่ให้รอบเสร็จที่ค้างยืนยันถูกยกเลิกโดยไม่มีบันทึกเปิดกลับ ตามคำยืนยันผู้ใช้ |
| `D-S05-3` | กฎ `last_updated_at` ชุดเดียวทั้งระบบ: การเปลี่ยน `status` ทุกครั้งอัปเดต ไม่ว่าใครทำ (รวมผู้ขอแจ้ง “ยังไม่เรียบร้อย”); action ของ GM อัปเดตเสมอ; เหตุการณ์ที่ไม่เปลี่ยน `status` จากคนนอกทีม GM ไม่อัปเดต (watcher ติดตาม, ฝ่ายที่ถูกรอตอบกลับ, ปักหมุด) | กฎเดียวที่ทุก command ใช้ได้ตรงกัน stale ไม่ขึ้นทันทีหลังงานกลับมาเป็นกำลังทำ ตามคำยืนยันผู้ใช้; การยืนยันปิดและ auto-close ไม่เปลี่ยน `status` (ยัง `completed`) และ scheduler ห้ามแตะ (§6.9) จึงไม่อัปเดต |
| `D-S05-4` | เปิดกลับงานที่ยกเลิก (`cancelled → queued`) คงผู้รับผิดชอบเดิม | คงความต่อเนื่องของงาน ตามคำยืนยันผู้ใช้; กฎลา/`queued` unassigned เป็นของ S07 |
| `D-S05-5` | GM รับงานที่มอบให้ GM คนอื่นอยู่แล้วต้องส่งการยืนยันรับต่ออย่างชัดเจน (`takeOver: true`) ไม่ส่ง → ปฏิเสธ; history บันทึกว่ารับต่อจากใคร (`previousAssigneeId`) | กันการแย่งงานโดยไม่ตั้งใจและให้ตรวจย้อนหลังได้ ตามคำยืนยันผู้ใช้ |
| `D-S05-6` | เพิ่ม `sensitivity_reason` = `other` สำหรับธงลับที่ GM เปิดเองในเรื่องอื่น ต้องมีหมายเหตุสั้น (`sensitivity_note` เก็บในรายละเอียดจำกัดสิทธิ์); คำสั่งปลดธงลับใน domain: เฉพาะ GM Admin, ต้องมีเหตุผล, บันทึก history | ให้ทุกธงลับมีเหตุผลที่ตรวจได้ และทำ C6 “ปลดธง Admin พร้อมเหตุผล” ให้ครบ ตามคำยืนยันผู้ใช้ |

## S06 — คำตอบที่ผู้ใช้ยืนยัน 4 ต.ค. 2569 (D-S06-1 ถึง D-S06-6)

ใหม่กว่าคำถามใน S06 และใช้แทนส่วนที่ขัดกัน ผล implement: [S07](../sessions/S07.md) ส่วนที่ 1

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S06-1` | “ติดตามแล้ว” ใช้ได้เฉพาะ `waiting`; งาน `queued`/`in_progress` GM อัปเดตด้วยคอมเมนต์ ซึ่งเป็น action ของ GM และอัปเดต `last_updated_at` ตาม D-S05-3 (domain ยังไม่มีคำสั่งคอมเมนต์ → [FU-02](../FOLLOW-UPS.md)) | “ติดตามแล้ว” ผูกกับการรอฝ่ายอื่นและโควตาเตือนซ้ำ; ความคืบหน้าอื่นบันทึกเป็นคอมเมนต์ ตามคำยืนยันผู้ใช้ |
| `D-S06-2` | การแจ้งที่เลื่อนจากวันปิดส่งเวลา 09:00 Asia/Bangkok ของวันทำการถัดไป ผ่าน `nextWorkingMorning` (Part 6 §6.7) เวลาตั้งค่าได้ใน settings | ตรงกับ digest 09:00 ใน Part 3 §13.6 และฟังก์ชันที่ Part 6 กำหนด ตามคำยืนยันผู้ใช้ |
| `D-S06-3` | งานลับที่ GM ไม่ยืนยันให้สิทธิ์ → ปฏิเสธ (`CONFIDENTIAL_GRANT_REQUIRED`); ไม่มีการปิดแจ้งรายคน ถ้าไม่ต้องการแจ้งผู้ติดต่อคนใดก็ไม่เลือกเป็นผู้ติดต่อ | ผู้ติดต่อ = ผู้รับแจ้ง จึงไม่มีสถานะครึ่งๆ ที่ต้องตรวจสิทธิ์แยก ตามคำยืนยันผู้ใช้ |
| `D-S06-4` | ฝ่ายที่รอ (person หรือผู้ติดต่อทีม) ที่เป็น GM Staff/GM Admin ถือว่ามีสิทธิ์อยู่แล้ว: ได้รับแจ้งตามปกติ ไม่เพิ่มเป็น related person ไม่ต้องยืนยันงานลับ และตอบ “ฝั่งฉันเรียบร้อยแล้ว” ได้ | GM มีสิทธิ์จาก role อยู่แล้ว การเพิ่ม related ซ้ำทำให้รายชื่อผู้เกี่ยวข้องรก ตามคำยืนยันผู้ใช้ |
| `D-S06-5` | ผู้รับของช่วงรอเก่ายังเป็น related person ต่อไป ไม่ถอนสิทธิ์อัตโนมัติ (คำสั่งให้ GM ถอดผู้เกี่ยวข้องเอง → [FU-03](../FOLLOW-UPS.md)) | คนที่เคยช่วยยังต้องอ่านประวัติได้ และการถอดสิทธิ์ควรเป็นการตัดสินใจของ GM ตามคำยืนยันผู้ใช้; ตอบช่วงใหม่ไม่ได้อยู่แล้ว (A2.1) |
| `D-S06-6` | ยืนยันการตีความใน S06: (ก) ผู้ขอยืนยันปิดและ auto-close ไม่เปลี่ยน `status` จึงไม่อัปเดต `last_updated_at`; (ข) ปลดธงลับเป็น action ของ GM จึงอัปเดต; (ค) หมายเหตุธงลับที่ส่งมาโดยไม่ได้เปิดธงถูกปฏิเสธ (`CONFIDENTIAL_NOTE_NOT_APPLICABLE`) | สอดคล้อง D-S05-3/D-S05-6 ตามคำยืนยันผู้ใช้ |

## S07 — คำตอบที่ผู้ใช้ยืนยัน 5 ต.ค. 2569 (D-S07-1 ถึง D-S07-7)

ใหม่กว่าคำถามใน S07 และใช้แทนส่วนที่ขัดกัน ผล implement: [S08](../sessions/S08.md) ส่วนที่ 1

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S07-1` | `presence_status` เก็บเป็น `{ kind: at_location, location_id }` / `off_site` / `on_leave` / `unspecified`; `location_id` อ้างจากรายการ `locations` ของ Admin ไม่สร้าง key ตายตัวรายสถานที่; ข้อความ “อยู่ FAC16” สร้างจากชื่อสถานที่ปัจจุบัน | สถานที่ที่ Admin เพิ่มภายหลังเลือกได้ทันทีโดยไม่แก้โค้ด และเปลี่ยนชื่อสถานที่แล้วข้อความตามทันที ตามคำยืนยันผู้ใช้; ค่า C7 ห้าสถานที่เดิมเป็นข้อมูลใน `locations` ไม่ใช่ enum |
| `D-S07-2` | `gm_task` ใช้ GM ผู้สร้างเป็นผู้รับผิดชอบเริ่มต้น; งานที่ GM เปิดแทนผู้ขอใช้กติกาตามประเภทงานเหมือนผู้ขอเปิดเอง; งานเอกสารใช้ค่าจาก settings ถ้าไม่ได้ตั้งเป็น “ยังไม่มอบหมาย” ตามเดิม | งานที่ GM สร้างเองเป็นงานของคนนั้นโดยธรรมชาติ ส่วนงานบริการต้องเข้าคนดูแลประเภทนั้นไม่ว่าใครเป็นคนกรอก ตามคำยืนยันผู้ใช้ / C2, A3 |
| `D-S07-3` | “แจ้ง GM ทุกคน” ไม่รวม GM ที่ลาอยู่ (effective leave ณ ตอนนั้น); ถ้า GM ที่ active ลาหมดทุกคน ให้แจ้งทุกคนรวมคนที่ลา; GM ที่ไม่ active ไม่ได้รับแจ้งเลย | ไม่รบกวนคนที่ลาแต่ไม่ให้งานเงียบหาย ตามคำยืนยันผู้ใช้ / A3 |
| `D-S07-4` | GM ที่ลาอยู่รับเรื่องเองได้ (อาจทำงานจากที่อื่น) domain ไม่ห้าม; คำสั่งมอบหมายงานให้ GM คนอื่นและคำเตือนเมื่อมอบหมายให้คนที่ลา → [FU-04](../FOLLOW-UPS.md) | การลาไม่ใช่สิทธิ์ การบล็อกทำให้งานด่วนช้า ส่วนการมอบให้คนอื่นที่ลาต้องเห็นชัด ตามคำยืนยันผู้ใช้ / A3 “ต้องแสดงสถานะลาให้เห็น” |
| `D-S07-5` | ผู้รับผิดชอบเริ่มต้นที่ถูกปิดใช้งาน ถือว่ายังไม่ได้ตั้งค่า: งาน `queued` “ยังไม่มอบหมาย” และแจ้ง GM ตาม D-S07-3 | ไม่ส่งงานไปหาบัญชีที่ใช้งานไม่ได้ ตามคำยืนยันผู้ใช้; หน้า Admin ยังต้องแสดง error ตาม Part 3 |
| `D-S07-6` | ปักหมุดได้เฉพาะงาน `in_progress` จึงปลดหมุดอัตโนมัติเมื่องานออกจาก `in_progress` ไม่ว่าจะไป `waiting` / `queued` / `completed` (รวมรอยืนยัน) / `cancelled`; กลับมาทำต่อแล้วไม่ปักคืนให้เอง | “กำลังทำตอนนี้” ต้องตรงกับความจริง ตามคำยืนยันผู้ใช้; ใหม่กว่าและแทน C7/F06 ที่ให้ปลดเฉพาะปิด/ยกเลิก |
| `D-S07-7` | การ์ดที่มาจาก Trello (`source = trello`) ปักหมุดไม่ได้ใน Phase 1 | การ์ด Trello เป็นข้อมูลอ่านอย่างเดียวบนเว็บ ตามคำยืนยันผู้ใช้ / P7-TRELLO-01, F04 |

## S08 — คำตอบที่ผู้ใช้ยืนยัน 7 ต.ค. 2569 (D-S08-1 ถึง D-S08-8)

ใหม่กว่าคำถามใน S08 และใช้แทนส่วนที่ขัดกัน ผล implement: [S09](../sessions/S09.md) ส่วนที่ 1

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S08-1` | GM ที่ลาอยู่แต่สร้าง `gm_task` เอง เป็นผู้รับผิดชอบงานนั้น; กติกา A3 (ผู้รับผิดชอบเริ่มต้นลา → ยังไม่มอบหมาย) ใช้กับการส่งงานตามประเภทเท่านั้น | การสร้างงานแปลว่ากำลังทำงานอยู่ สอดคล้อง D-S07-4 ตามคำยืนยันผู้ใช้; แทนพฤติกรรม S08 ที่ใช้ A3 กับผู้สร้าง |
| `D-S08-2` | ไม่แจ้งเตือนผู้ที่เป็นคนทำ action นั้นเอง (ผู้รับผิดชอบที่เป็นผู้สร้าง/ผู้เลือกตัวเอง, “แจ้ง GM ทุกคน”, แจ้งฝ่ายที่รอ, เตือนซ้ำ); ผู้ทำ action ยังนับเป็น GM ที่ว่างในกติกา D-S07-3 และยังเป็นผู้รับของช่วงรอ (ตอบได้) | คนทำรู้อยู่แล้ว การแจ้งตัวเองเป็นเสียงรบกวน ตามคำยืนยันผู้ใช้ |
| `D-S08-3` | สถานที่ที่ถูกปิดใช้งานเลือกเป็นสถานะที่อยู่ใหม่ไม่ได้ (`PRESENCE_LOCATION_INACTIVE`); ถ้าตั้งไว้ก่อนปิด แสดงชื่อเดิมจนถึงการรีเซ็ตสิ้นวัน | ไม่ให้เลือกสถานที่ที่เลิกใช้ แต่ไม่ลบข้อมูลที่ตั้งไว้กลางวัน ตามคำยืนยันผู้ใช้ / C7 |
| `D-S08-4` | Part 6 §6.5 กำหนดแค่ว่า `person_id` คงที่และแยกจาก Firebase UID ไม่ได้กำหนดรูปแบบ → `person_id` = อีเมล `@tdfb.co` ตัวพิมพ์เล็กจาก CSV รายชื่อ (ตัดช่องว่างหัวท้าย) และผูก UID ตอน login ครั้งแรกด้วย verified email; คำสั่งรับ `person_id` เฉพาะรูปแบบนี้; `command_id` เป็น UUID ตามเดิม | ใช้ค่าที่มีอยู่จริงใน export Workspace ไม่ต้องสร้างรหัสใหม่ และจับคู่ตอน login ได้ตรง ตามคำยืนยันผู้ใช้ / P7-ADMIN-01 |
| `D-S08-5` | คำสั่งที่ถูกปฏิเสธไม่เก็บบันทึก; ส่ง `command_id` เดิมซ้ำให้ตรวจใหม่ตามสถานะล่าสุด | ยืนยันตามที่ทำใน S08 ตามคำยืนยันผู้ใช้ |
| `D-S08-6` | `commands/{id}` เก็บ 30 วันด้วย Firestore TTL policy บน field `expire_at` (= เวลาบันทึก + 30 วัน) ไม่เก็บถาวร | TTL มีผลแค่การลบซึ่งอยู่ในโควตาฟรี และ retry จริงเกิดภายในไม่กี่นาที ตามคำยืนยันผู้ใช้ / P7-COST-03 |
| `D-S08-7` | งาน `completed` ที่รอผู้ขอยืนยัน ติดตามไม่ได้ (`WATCH_NOT_OPEN`); ถ้าปัญหายังอยู่ ผู้แจ้งรายใหม่สร้างงานใหม่ | ยืนยันตามที่ทำใน S08 ตามคำยืนยันผู้ใช้ / U1 |
| `D-S08-8` | prefix เลขงานตาม environment: prod `GM-`, dev และ local `DEV-`; environment อื่นถูกปฏิเสธ (ไม่เดาเป็น `GM-`) | เลขงานทดสอบไม่ปนกับเลขจริงในภาพหน้าจอ/ข้อความ ตามคำยืนยันผู้ใช้ / Part 6 “dev ติดป้ายชัด” |

## S09 — คำตอบที่ผู้ใช้ยืนยัน 7 ต.ค. 2569 (D-S09-1 ถึง D-S09-8)

ใหม่กว่าคำถามใน S09 และใช้แทนส่วนที่ขัดกัน ผล implement: [S09](../sessions/S09.md) “งานต่อ: D-S09 และ ACL-MATRIX”; ตารางสิทธิ์ที่คนอ่านตรวจได้: [ACL-MATRIX](ACL-MATRIX.md)

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S09-1` | ฝ่ายที่รอบนสรุปสาธารณะ: พนักงานรายบุคคลแสดงชื่อทีมของคนนั้น (ไม่รู้ทีม → “พนักงาน”) ไม่แสดงชื่อคน; ทีมแสดงชื่อทีม; ผู้รับเหมาแสดงแค่ “ผู้รับเหมา”; หน่วยงานรัฐแสดงชื่อที่ GM กรอก; อื่นๆ แสดง “อื่นๆ”; ไม่มีช่องยืนยันแยก แต่ฟอร์มต้องบอกว่าชื่อหน่วยงานรัฐจะแสดงบนบอร์ด ([FU-06](../FOLLOW-UPS.md)) | ให้คนทั่วไปรู้ว่างานติดอยู่ที่ฝ่ายไหนโดยไม่เปิดเผยชื่อบุคคลหรือคู่ค้า ตามคำยืนยันผู้ใช้ / Part 6 §6.4.1 |
| `D-S09-2` | Viewer อ่านงานลับได้เฉพาะเมื่อถูกเพิ่มเป็น related person แบบยืนยันสิทธิ์งานลับแล้ว (C3) — เก็บใน `confidential_grant_ids`; role Viewer อย่างเดียวไม่ให้สิทธิ์งานลับ — **ขยายเป็นทุก role โดย [D-ACL-2](#acl-review--คำตอบที่ผู้ใช้ยืนยัน-7-ตค-2569-d-acl-1-ถึง-d-acl-7)** | รวม PRD (Viewer ไม่เปิดงานลับ) กับ Part 2 F05/Part 6 (related ให้สิทธิ์) ด้วยการยืนยันสิทธิ์ที่ตรวจย้อนได้ ตามคำยืนยันผู้ใช้ |
| `D-S09-3` | หน้าเว็บอ่าน `calendars` / `sla_policies` / `settings` ตรงไม่ได้ ให้ API ส่งค่าที่จำเป็น | ยืนยันตามที่ทำใน S09 ตามคำยืนยันผู้ใช้ |
| `D-S09-4` | ตัวนับ `board_counters/public` นับ “งานภายใน X รายการ” เฉพาะงานลับที่ยังเปิด (รอคิว / กำลังทำ / รอผู้อื่น / เสร็จรอยืนยัน) ไม่นับงานลับที่ปิดหรือยกเลิกแล้ว ตัวนับจึงเปลี่ยนเฉพาะตอนเขียนข้อมูล | ไม่ต้องคำนวณใหม่ตามเวลาหรือเพิ่มงาน scheduler ตามคำยืนยันผู้ใช้ / P7-COST-01 |
| `D-S09-5` | รายชื่อ watcher และหมายเหตุธงลับอยู่ใน `gm_request_details/{id}` ที่ GM อ่านได้เท่านั้น; `requests/{id}` คง `related_person_ids` ไว้ (ผู้ร่วมงานควรรู้ว่าใครเกี่ยวข้อง) | Rules ซ่อนราย field ใน document เดียวไม่ได้ จึงแยก document ตามคำยืนยันผู้ใช้ / Part 6 §6.5 |
| `D-S09-6` | บัญชีที่ปิดใช้งานอ่าน `access` ของตัวเองได้อย่างเดียว เพื่อให้หน้าเว็บบอกว่าบัญชีถูกปิด | ยืนยันตามที่ทำใน S09 ตามคำยืนยันผู้ใช้ |
| `D-S09-7` | สรุปสาธารณะแสดง “ฝ่ายที่รอตอบกลับแล้ว” เป็นป้ายกลาง (`waiting_party_responded`) ไม่ระบุว่าใครตอบหรือตอบเมื่อไร | ให้ผู้ขอ/คนทั่วไปเห็นความคืบหน้า ตามคำยืนยันผู้ใช้ / A2.1 |
| `D-S09-8` | งานที่ปิดหรือยกเลิกครบ 168 ชั่วโมงพอดีถือว่าพ้นกรอบบอร์ด | ยืนยันตามที่ทำใน S09 ตามคำยืนยันผู้ใช้ / U3 |

## ACL review — คำตอบที่ผู้ใช้ยืนยัน 7 ต.ค. 2569 (D-ACL-1 ถึง D-ACL-7)

ใหม่กว่า D-S09-2 และ ACL-MATRIX รุ่น S09 ใช้แทนส่วนที่ขัดกัน ผล implement: [S10](../sessions/S10.md) “ส่วนที่ 1: D-ACL”; ตารางสิทธิ์: [ACL-MATRIX](ACL-MATRIX.md)

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-ACL-1` | `people_picker` อ่านได้เฉพาะ GM Staff / GM Admin; `person_id` คงเป็นอีเมล (D-S08-4) ไม่เปลี่ยนเป็น ID สุ่ม; ผู้ร่วมงานเห็นอีเมลของ related คนอื่นในงานเดียวกันได้ (อยู่ใน `requests/{id}`) — ตรวจ spec แล้วช่องเลือกคนมีเฉพาะหน้าจอของ GM (UI-04 สร้างงาน GM/เปิดแทน, UI-07 sheet รอผู้อื่น/มอบหมาย/เพิ่มคนในงานลับ) ไม่พบหน้าจอของคนที่ไม่ใช่ GM ที่ต้องใช้ จึงไม่ต้องหยุด แต่ชื่อคนบนหน้ารายละเอียดของคนที่ไม่ใช่ GM ยังไม่มีแหล่ง → Q-S10-1 | ช่องเลือกคนมีแค่ในงานของ GM ไม่ต้องแจกรายชื่อ/อีเมลทั้งบริษัทให้ทุกคน ตามคำยืนยันผู้ใช้ / Part 6 §6.4 แถว `people_picker` |
| `D-ACL-2` | รายละเอียดงานลับอ่านได้เฉพาะ GM, ผู้ขอ และคนใน `confidential_grant_ids` — ใช้กับทุก role ไม่ใช่แค่ Viewer (แทน D-S09-2); เพิ่ม related ในงานลับพร้อมการยืนยัน (C3) → บันทึกใน `confidential_grant_ids` (related เดิมที่ยังไม่มี grant ก็ต้องยืนยัน); ติดธงลับภายหลัง (`markConfidential`) GM ต้องยืนยันรายชื่อ related เดิมว่าคงสิทธิ์ใคร (`[]` = ไม่คงใคร, ไม่ส่งรายชื่อ = ปฏิเสธ) คนที่ไม่ได้รับการยืนยันยังอยู่ใน `related_person_ids` แต่อ่านรายละเอียดไม่ได้; ปลดธงลับล้าง `confidential_grant_ids` | สิทธิ์งานลับต้องได้รับการยืนยันรายคน ตรวจย้อนได้ และเหมือนกันทุก role ตามคำยืนยันผู้ใช้ / C3, C6 |
| `D-ACL-3` | `board_counters` อ่านได้แค่ `get` ของ document `public`; ไม่อนุญาต `list` ทั้ง collection และ document อื่นใน collection นี้ไม่เปิดให้ client | กันการไล่อ่าน counter อื่นที่อาจเพิ่มในอนาคต ตามคำยืนยันผู้ใช้ |
| `D-ACL-4` | `announcements` / `content_pages`: spec ไม่มีสถานะฉบับร่างหรือยังไม่เผยแพร่ (Part 3 §13.5 มีเพียง preview, Part 6 §6.4 ไม่มี field สถานะ) จึงคงตามเดิม — ทุกบัญชีที่ใช้งานได้อ่านได้; ถ้าเพิ่มสถานะร่างภายหลังต้องให้คนที่ไม่ใช่ GM Admin อ่านได้เฉพาะที่เผยแพร่แล้ว | ตามคำสั่งผู้ใช้: ไม่มีสถานะนี้ให้บันทึกว่าไม่มีและคงตามเดิม |
| `D-ACL-5` | Storage: client อ่าน/เขียน/list/ลบตรงไม่ได้ทุก role (`infra/storage.rules` ปฏิเสธทั้งหมด) รูป/ไฟล์ผ่าน API เท่านั้น: ดูไฟล์ = API ตรวจ ACL ปัจจุบันทุกครั้งแล้วออก signed URL แบบ GET เฉพาะ object อายุสั้น 5 นาที (ตัวอย่างใน §6.10) ไม่ log URL, private/no-store; อัปโหลด = browser ส่งตรงไป Storage ด้วยลิงก์เฉพาะ object อายุสั้นที่ API ออกให้ (pending ผูก actor+request/contribution, finalize ตรวจขนาด/decode, orphan ลบ 24 ชม.) — ชนิดลิงก์อัปโหลดยังไม่ระบุใน spec → Q-S10-3 | private bucket, ไม่มี download-token URL อายุยาว ตาม Part 6 §6.10 และคำสั่งผู้ใช้ |
| `D-ACL-6` | ACL-MATRIX มีตาราง “หน้าจอ → แหล่งข้อมูล” ที่ test ตรวจว่าทุกแหล่ง Firestore อนุญาตจริงสำหรับทุกคนที่เปิดหน้านั้น; หน้าที่โหลดข้อมูลไม่ได้ภายใต้สิทธิ์นี้บันทึกเป็นคำถาม (Q-S10-1 ชื่อคนบนหน้ารายละเอียด, Q-S10-2 จำนวนงานรอยืนยัน) ไม่แก้สิทธิ์เอง | ให้ UI รู้ล่วงหน้าว่าโหลดข้อมูลจาก path ไหน และกันการเปิดสิทธิ์เพิ่มเพื่อให้หน้าจอทำงาน ตามคำสั่งผู้ใช้ |
| `D-ACL-7` | ป้ายทีมบนสรุปสาธารณะ (ฝ่ายที่รอเป็นพนักงานรายบุคคล, D-S09-1) ใช้ทีมเดียวจากคอลัมน์ทีมใน CSV รายชื่อพนักงาน; ไม่มีหรือว่าง → “พนักงาน” ตามที่ทำไว้ (`personTeamLabel` คืนค่าเดียว) | ตามคำยืนยันผู้ใช้; ตัวนำเข้า CSV ต้องเก็บทีมเป็นค่าเดียว ([FU-10](../FOLLOW-UPS.md)) |

## S10 — คำตอบที่ผู้ใช้ยืนยัน 7 ต.ค. 2569 (D-S10-1 ถึง D-S10-5)

ใหม่กว่าคำถามใน S10 และใช้แทนส่วนที่ขัดกัน ผล implement: [S11](../sessions/S11.md) “ส่วนที่ 1”; ตารางสิทธิ์: [ACL-MATRIX](ACL-MATRIX.md)

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S10-1` | ชื่อที่แสดงในหน้ารายละเอียดของคนที่ไม่ใช่ GM: API เขียนชื่อลงใน `requests/{id}` ตอนบันทึก — ผู้ขอ (`requester_display`), ผู้รับผิดชอบ (`assignee_display`) และ related แต่ละคน (`related_people_display`) เป็นคู่ `person_id` + `display_name`; ไม่แสดงอีเมลแทนชื่อ (ไม่มีชื่อ/ชื่อเป็นอีเมล → “พนักงาน”) และไม่ต้องเรียก API เพิ่มเพื่อดึงชื่อ; การอัปเดตชื่อในงานที่ยังเปิดหลัง import รายชื่อใหม่ → [FU-11](../FOLLOW-UPS.md) | ปิด Q-S10-1 ตามคำยืนยันผู้ใช้; `people_picker` ยังเป็นของ GM (D-ACL-1) |
| `D-S10-2` | แถบ “มี X งานรอคุณยืนยัน” ใช้ endpoint ส่วนบุคคลเดียวกับหน้าคำขอของฉัน | ปิด Q-S10-2 ตามที่เสนอ; Firestore ตรงโหลดไม่ได้ภายใต้สิทธิ์นี้ |
| `D-S10-3` | อัปโหลดรูปใช้ signed URL แบบ PUT อายุ 15 นาที; ดูรูปใช้ signed URL แบบ GET อายุ 5 นาทีตาม Part 6; หน้าเว็บขอ URL ใหม่เองเมื่อหมดอายุ | ปิด Q-S10-3: รูปย่อแล้วไฟล์เล็ก และเผื่อเน็ตช้าที่คลังและโรงงาน |
| `D-S10-4` | Rules บังคับ limit ของ list query ไม่เกิน 200 (ไม่มี limit = ปฏิเสธ) ทุก collection; หน้า “ดูทั้งหมด” แบ่งหน้าละ 50 (`MAX_LIST_LIMIT`, `ARCHIVE_PAGE_SIZE`, `pageLimit` ใน `@gm/contracts`); ประมาณการบอร์ดที่อาจเกิน 200 อยู่ใน [S11](../sessions/S11.md) | ปิด Q-S10-4: กันการอ่านไม่จำกัดจาก bug ตามข้อกำหนด budget (Part 6 §6.11) |
| `D-S10-5` | Rules ตรวจโดเมนอีเมลหลัง `lower()` ให้ตรงกับ D-S08-4 ที่แปลงอีเมลจาก CSV — TDFB.CO เป็นโดเมนเดียวกัน; โดเมนหน้าตาคล้ายอื่น (tdfb.co.th, mail.tdfb.co ฯลฯ) ยังถูกปฏิเสธ | แทน risk “อีเมลตัวพิมพ์ใหญ่” ของ S10 ตามคำยืนยันผู้ใช้ |

## S11 — คำตอบที่ผู้ใช้ยืนยัน 7 ต.ค. 2569 (D-S11-1 ถึง D-S11-3)

ใหม่กว่าคำถามใน S11 และใช้แทนส่วนที่ขัดกัน ผล implement: [S12](../sessions/S12.md) “ส่วนที่ 1”

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S11-1` | เก็บชื่อผู้สร้าง (`created_by_id`) เป็นคู่ `person_id` + `display_name` ใน `requests/{id}` (`created_by_display`) สำหรับข้อความ “เปิดเรื่องโดย [GM]”; กติกาเดียวกับ D-S10-1 (ไม่มีชื่อ → “พนักงาน”) | ปิด Q-S11-1 ตามคำยืนยันผู้ใช้; UI-07 แสดงผู้สร้าง |
| `D-S11-2` | การเพิ่ม/ถอดผู้เกี่ยวข้อง และการติดหรือปลดธงลับ นับเป็น action ของ GM และอัปเดต `last_updated_at` ตามเดิม (D-S05-3) ไม่มีข้อยกเว้น | ปิด Q-S11-2: ป้าย stale เป็นตัวเตือนของทีม GM เอง กติกาเดียวเข้าใจง่ายกว่า |
| `D-S11-3` | Query บอร์ดแยกตามส่วนเสมอ: งานเปิด / เสร็จรอยืนยัน / ปิดใน 7 วัน / การ์ดจาก Trello; query งานเปิดใช้ `limit(200)` และมีปุ่ม “โหลดเพิ่ม” เมื่อได้ครบ 200 ห้ามตัดรายการทิ้งเงียบๆ — สำหรับ task หน้าบอร์ดในด่าน A ([FU-13](../FOLLOW-UPS.md)) | ใช้ข้อเสนอใน S11 (ประมาณการรวมทุกส่วน ~260 เกินเพดาน 200 ของ D-S10-4); Part 6 §6.11 “ไม่ silently cap” |

## S12 — คำตอบที่ผู้ใช้ยืนยัน 7 ต.ค. 2569 (D-S12-1 ถึง D-S12-4)

ใหม่กว่าคำถามใน S12 และใช้แทนส่วนที่ขัดกัน ผล implement: [A01](../sessions/A01.md) “ส่วนที่ 1”

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-S12-1` | รับรูป `image/jpeg` / `image/png` / `image/webp` ไม่เกิน 2 MiB ตามค่าชั่วคราวของ S12 ไม่รับ HEIC ที่ server; ถ้าเบราว์เซอร์เปิดไฟล์ไม่ได้ หน้าจอแจ้งเป็นภาษาไทยให้ถ่ายใหม่หรือเลือกรูปอื่น ([FU-18](../FOLLOW-UPS.md) สำหรับ A15) | หน้าเว็บย่อรูปและเข้ารหัสใหม่ก่อนอัปโหลดเสมอ (U5) รูป HEIC จาก iPhone จึงเป็น jpeg/webp ก่อนส่ง |
| `D-S12-2` | related person แนบรูปไม่ได้ใน Phase 1 ใช้คอมเมนต์แทน (ตามที่ทำไว้: 403 `ATTACH_NOT_ALLOWED`) | UI-07: related อ่าน/คอมเมนต์ ผู้ขอคอมเมนต์/แนบรูป |
| `D-S12-3` | watcher ส่ง contribution ได้ 1 ครั้งตาม U1 แต่แนบได้หลายรูป ใช้เพดานเดียวกับผู้แจ้ง: Part 6 ไม่กำหนด จึงใช้ **3 รูปต่อครั้ง** ทั้งผู้แจ้งและ watcher (`MAX_PHOTOS_PER_SUBMISSION`); watcher ดูรูปของตัวเองหลังส่งไม่ได้ (ตามที่ทำไว้) | ตามคำยืนยันผู้ใช้; Part 6 ประมาณ 2 รูป/งาน ไม่มีเพดาน |
| `D-S12-4` | แนบรูปได้เฉพาะงานที่ยังไม่ปิดและไม่ถูกยกเลิก รวมงานที่เสร็จแบบรอยืนยัน (ปิด/ยกเลิก → 409 `REQUEST_CLOSED` ทั้งตอนขอลิงก์และตอน finalize) | ให้ผู้ขอแนบหลักฐานตอนกด “ยังไม่เรียบร้อย” ได้ |


## A01 — คำตอบที่ผู้ใช้ยืนยัน 8 ต.ค. 2569 (D-A01-1 ถึง D-A01-4)

ใหม่กว่าคำถามใน A01 (Q-A01-1 ถึง Q-A01-4) และใช้แทนส่วนที่ขัดกัน ผล implement: [A02](../sessions/A02.md) “ส่วนที่ 1”

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-A01-1` | CORS: API ของ dev รับเฉพาะ origin ของเว็บ dev และ prod รับเฉพาะของ prod **ไม่รับ localhost** (รวม `*.localhost`, `127.x.x.x`, `[::1]` ทั้ง http และ https แม้ใส่ผ่าน `GM_ALLOWED_ORIGINS`); เว็บที่รันบนเครื่องคุยกับ API ที่รันบนเครื่อง (environment `local` + ชุด emulator) ซึ่งยังรับ Vite dev/preview ตามเดิม; รายการ origin ยังตั้งค่าได้ | domain จริงรอ P7-INFRA-01 จึงต้องตั้งค่าได้; ไม่เปิดทางให้เครื่องนักพัฒนาเรียก API dev/prod ด้วย token จริงจากเบราว์เซอร์ |
| `D-A01-2` | ยืนยัน: ไม่มี `settings/routing` หรือ `calendars/company` → ปฏิเสธการสร้างงาน 503 (`ROUTING_NOT_CONFIGURED` / `CALENDAR_NOT_CONFIGURED`) ไม่สร้างงานแบบไม่มีคนรับแจ้ง; หน้าจอต้องแจ้งเป็นภาษาไทยพร้อมช่องทางติดต่อทีม GM แทน ([FU-21](../FOLLOW-UPS.md) สำหรับ task หน้าแจ้งซ่อม) และ checklist ก่อน deploy ต้องตรวจว่ามี settings และปฏิทินครบ ([FU-22](../FOLLOW-UPS.md) สำหรับ A26/A27) | fail closed ดีกว่างานที่ไม่มีใครเห็น; ค่าจริงมาจาก P7-ADMIN-04 |
| `D-A01-3` | outbox **1 รายการต่อผู้รับ** ใช้ `channel: auto` ตามที่ทำไว้; worker/adapter เลือกช่องทางตอนส่งจริงตาม A1.2 (Slack ถ้าจับคู่ได้ ไม่งั้น email บริษัท ไม่มีช่องทาง → ไม่ส่ง) แล้วบันทึกช่องทางที่ใช้จริง (`delivery_channel`) และผลการส่ง (`state`, `provider_id`, `attempts`, `last_attempt_at`, `last_error_code`) กลับลงรายการนั้น เพื่อใช้แสดงป้าย “ผู้ขอยังไม่ได้รับแจ้ง” | Part 6 §6.10 key = event + recipient + channel; ไม่ส่งสองทางซ้ำเป็นค่าเริ่มต้น (A1.2) |
| `D-A01-4` | ผู้ขอที่สร้างงานเองไม่ได้รับแจ้งตอนสร้าง (D-S08-2) แต่ถ้า **GM เปิดแทนผู้ขอที่มีบัญชี** ให้แจ้งผู้ขอพร้อมเลขงาน (`audience: requester`, `request_number`) เพราะผู้ขอไม่ใช่คนทำ action; งานเปิดแทนแบบชื่อข้อความไม่มีคนให้แจ้ง | ผู้ขอควรรู้ว่ามีงานในชื่อตัวเองและเลขที่ใช้ติดตาม |

## A02 — คำตอบที่ผู้ใช้ยืนยัน 8 ต.ค. 2569 (D-A02-1 ถึง D-A02-7)

ใหม่กว่าคำถามใน A02 (Q-A02-1 ถึง Q-A02-6) และใช้แทนส่วนที่ขัดกัน ไม่เปลี่ยนพฤติกรรมของโค้ด A02 (ตรวจแล้วว่าโค้ดตรงกับข้อ 2–4) ผลบันทึก: [A03](../sessions/A03.md) “ส่วนที่ 1”

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-A02-1` | retry ของ outbox และ `scheduled_work` ใช้ 5 ครั้ง เว้น 5 / 15 / 60 / 240 นาที (`BOUNDED_RETRY`) | ยืนยันค่าที่เสนอใน A02; Part 6 §6.9/§6.10 กำหนดเพียง bounded retry |
| `D-A02-2` | worker ตายระหว่างส่ง (lease หมดขณะ `processing`) → `delivery_unknown` ไม่ส่งซ้ำอัตโนมัติ ตามที่ทำไว้; ปุ่ม “ส่งอีกครั้ง” ของ GM สร้าง**รายการแจ้งใหม่แบบตั้งใจ** (event ใหม่ ไม่แก้รายการเดิม) อยู่ task เดียวกับหน้าจอผลการส่ง ([FU-23](../FOLLOW-UPS.md)) | §6.10 ไม่อ้าง exactly-once กับผู้ให้บริการภายนอก; รายการเดิมคงเป็นหลักฐานของผลที่ไม่แน่นอน |
| `D-A02-3` | ไม่มีช่องทางหรือ adapter ปิด → `failed` (`NO_CHANNEL` / `CHANNEL_DISABLED`) ไม่ใช่ `suppressed`; เปิด adapter ภายหลัง**ไม่ส่งย้อนหลัง** ตามที่ทำไว้ | ข้อความเก่าที่ส่งตามหลังมาหลายวันสร้างความสับสน และแถบในแอปแสดงสถานะล่าสุดอยู่แล้ว |
| `D-A02-4` | คนเดียวกันที่เป็นทั้งผู้ขอและผู้รับฝั่ง GM ได้รายการเดียวแบบ `gm` ตามที่ทำไว้ | 1 รายการต่อผู้รับต่อเหตุการณ์ (D-A01-3) |
| `D-A02-5` | หน้าจอผลการส่งของ GM อยู่ A06/A17 ตาม [FU-23](../FOLLOW-UPS.md); หน้า Admin แสดงเวลาของ tick ล่าสุดอยู่ task หน้า Admin ตาม A00-plan ([FU-25](../FOLLOW-UPS.md)) — tick ล่าสุดเกิน **30 นาที** แสดงเป็นสีแดง และเพิ่มการตรวจนี้ใน checklist ก่อน pilot ([FU-22](../FOLLOW-UPS.md)) | tick ที่หยุดเงียบทำให้ปิดงานอัตโนมัติ รีเซ็ตสถานะที่อยู่ และการเตือนซ้ำหยุดทั้งหมด |
| `D-A02-6` | ค่า Cloud Run / Scheduler ที่เสนอเป็นค่าเริ่มต้น: worker request timeout 600 วินาที, Scheduler `attempt_deadline` 600 วินาที, Scheduler ไม่ retry (`retry_count: 0`) — อยู่ในรายการให้ผู้ดูแลยืนยันตอน P7-INFRA-01 ([FU-24](../FOLLOW-UPS.md)) | tick ถัดไปเก็บงานต่ออยู่แล้ว การ retry ของ Scheduler จึงซ้ำซ้อน |
| `D-A02-7` | การต่อ Cloud Tasks (ส่วนที่เหลือของ [FU-20](../FOLLOW-UPS.md)) ต้องเสร็จ**ก่อน pilot** และอยู่ใน checklist ก่อน pilot ([FU-22](../FOLLOW-UPS.md)) | ถ้ามีแต่ tick การแจ้งเตือนช้าได้ถึง 15 นาที |

## A03 — คำตอบที่ผู้ใช้ยืนยัน 8 ต.ค. 2569 (D-A03-1 ถึง D-A03-7)

ใหม่กว่าคำถามใน A03 (Q-A03-1 ถึง Q-A03-7) และใช้แทนส่วนที่ขัดกัน ผล implement: [A06](../sessions/A06.md) “ส่วนที่ 1”

| ID | การตัดสินใจ | เหตุผล / ต้นทาง |
|---|---|---|
| `D-A03-1` | ไม่แจ้ง related persons เมื่อสถานะเปลี่ยน ตามที่ทำไว้ | เขาได้รับแจ้งตอนที่เกี่ยวข้องอยู่แล้ว เช่น ตอนถูกรอ และเปิดดูงานเองได้ (จุด “มีอัปเดตใหม่”) |
| `D-A03-2` | ผู้ขอกด “ยังไม่เรียบร้อย” → **แจ้ง GM ผู้รับผิดชอบ** (`audience: gm`); ผู้ขอยืนยันปิด → ไม่แจ้ง GM | งานกลับมาเป็นงานที่ต้องทำต่อ; การยืนยันปิดไม่มีอะไรต้องทำต่อ |
| `D-A03-3` | การยืนยันปิดและการปิดอัตโนมัติไม่แจ้งใคร ตามที่ทำไว้ | ข้อความตอนงานเสร็จบอกวันปิดอัตโนมัติไว้แล้ว |
| `D-A03-4` | GM รับงานต่อจาก GM คนอื่น (`take_over`) → **แจ้ง GM คนเดิม** | ไม่ให้ทำงานซ้ำกัน |
| `D-A03-5` | ใช้โครง `activity_seq` (ตัวงาน) + ลำดับล่าสุดที่เห็นใน `user_state` ตามที่เสนอ; action ของตัวเองไม่ทำให้ตัวเองขึ้นจุด “มีอัปเดตใหม่” และเปิดดูงานแล้วจุดหายไป | Part 6 §6.4.1 / Part 2 A1.1 |
| `D-A03-6` | `confirmation_calendar_snapshot` อยู่ใน `requests/{id}` ได้ ตามที่ทำไว้ | วันทำการและวันหยุดบริษัทไม่ใช่ข้อมูลลับ |
| `D-A03-7` | ประกาศสถานะที่ยังไม่ส่งแล้วงานเปลี่ยนต่อไปแล้ว → **ระงับรายการเก่า** (`suppressed`, เหตุผล `SUPERSEDED`) เฉพาะประกาศสถานะถึงผู้รับคนเดียวกันในงานเดียวกัน ส่งเฉพาะรายการล่าสุด; ไม่ใช้กับการแจ้งฝ่ายที่ถูกรอและการเตือนซ้ำ | ถ้า GM รับเรื่องแล้วกดเสร็จในไม่กี่นาที ผู้ขอควรได้ข้อความเดียวว่าเสร็จแล้ว โดยเฉพาะช่วงที่ยังไม่มี Cloud Tasks และการส่งต้องรอ tick |
