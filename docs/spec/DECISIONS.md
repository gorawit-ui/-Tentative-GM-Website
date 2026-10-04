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
