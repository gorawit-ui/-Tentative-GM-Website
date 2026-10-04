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
