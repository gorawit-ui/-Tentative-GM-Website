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
