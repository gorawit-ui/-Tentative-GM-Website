# Spec index — อ่านต้นทางตามหัวข้อ

## ลำดับเมื่อขัดกัน

เอกสารที่ใหม่กว่าในลำดับการยืนยันของผู้ใช้ชนะเอกสารเก่า ไม่ใช้ filesystem modified time เป็นลำดับนโยบาย **C1–C11 ชนะ CH-01–CH-09 เสมอ** แม้พบ CH ในไฟล์ที่ timestamp ใหม่กว่า

ลำดับที่ใช้: Part 7 directives → infrastructure/budget + R1–R5 → F1–F6 + UX carryovers → P1–P2 → U1–U5 → Part 3 UI spec → A1–A4 → C1–C11 → Part 1/2 เนื้อหาเดิม เฉพาะเรื่องที่แก้; Part 6 เป็นการสังเคราะห์เทคนิคใต้ข้อกำหนดเหล่านี้ ไม่ลบข้อกำหนดผู้ใช้ การ clean Part 6 เปลี่ยนรูปแบบเท่านั้น ไม่เพิ่มความใหม่ของนโยบาย

หากต้นทางไม่ตอบ ให้บันทึกข้อขัดกันพร้อมไฟล์/หัวข้อ และถามเฉพาะเรื่องที่จำเป็น ห้ามเปลี่ยนสิทธิ์/scope/ตัวเลขด้วยการคาดเดา

คำตอบล่าสุดจากผู้ใช้สำหรับ S01 (`D-S01-1` ถึง `D-S01-6`), S03 (`D-S03-1` ถึง `D-S03-4`) และ S04–S07 (`D-S04-*` ถึง `D-S07-*`) อยู่ [DECISIONS](DECISIONS.md) และมีผลเหนือข้อเดิมที่ขัดกันใน Part 6/S01/S03; ผล implement อยู่ [S02](../sessions/S02.md) และ [S03](../sessions/S03.md)

## Map หัวข้อ → ไฟล์ / section

| เรื่อง | ต้นทางหลัก | หัวข้อ / งานที่ใช้ |
|---|---|---|
| ปัญหา/ผู้ใช้/KR 2.2/7 หมวด/เป้า metric | [Part 1 PRD](Part-1-PRD.md) | §1–3, §5, §7; ใช้ C9 แทนเวลาวัดเดิม |
| A/B scope/US 19–21/privacy/calendar/SLA defaults | [C1–C11](Part-1-Changelog.md) | ทุกข้อ; authoritative เหนือ CH |
| Navigation/routes/IA/forms/status flows | [Part 2](Part-2-IA-and-Flows.md) | §1–4; F01–F07 §5–11; B/Admin §12–15 |
| In-app/email/no-account, `waiting` response, leave, short ID | [A1–A4](Part-2-Addendum.md) | A1–A4 + mobile guidance; F03 เปิดแทนดู Part 2 §7 |
| หน้าจอทั้งหมด UI-01–UI-15: layout, components, states, จำนวนแตะ | [Part 3 UI spec](Part-3-UI-Spec.md) | ทุกหน้าจอ; U1–U5, P1–P2, F1–F6 และ P7-UX ชนะเมื่อขัดกัน |
| Duplicate watcher/title/7-day board/stale visibility/photo | [U1–U5](Part-3-Addendum.md) | U1–U5 |
| สี/type/spacing/contrast/motion | [Part 4](Part-4-Design-Tokens.md) | token/contrast tables; [reference tokens](../../reference/gm-design-tokens/README.md) |
| Cascade layers/laptop columns | [P1–P2](Part-4-Patch.md) | P1–P2 ชนะ entry/layout เดิม |
| Approved prototype/mock flows | [Part 5 Guide](Part-5-Guide.md) / [QA](Part-5-QA.md) | [prototype](../../reference/Part-5-Prototype.html); mock ไม่ใช่ implementation |
| Mobile filters/cards/wait input/copy/photo/nav | [F1–F6](Part-5-Patch.md) | F1–F6; ภายหลังผู้ใช้ยืนยัน Chromium ผ่าน |
| Infrastructure/budget/renewal scope | [Infrastructure + R](Infrastructure-Budget-and-Renewals.md) | Infrastructure, Budget, R1–R5; หมายเหตุผู้ส่งล่าสุดดู D4 |
| Renewal UI spec สั้น | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | ก่อน §6.1: UI/flow ต่ออายุ; ไม่ต้องสร้าง prototype ใหม่ |
| Assumptions/stack/services/code boundaries | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.1–6.3 |
| Data model/projections/ACL/Rules | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.4–6.5 |
| Commands/counters/races/idempotency | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.6; implement [S08](../sessions/S08.md) |
| Pure time snapshots/test examples | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.7; S01–S07 |
| Renewal cycles/import/Scorecard/tick | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.8–6.9; B14–B24 |
| Slack/Gmail/photo/QR/search/PWA/Trello | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.10; Gmail sender overridden by D4 |
| Query/listener/index/server aggregates/metrics | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.11; A19/B03–06/B11/B23 |
| Cost/free quota/US-vs-SG buckets | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.12 + sources S01–S24; actual SKU/quota Tim confirms W0 |
| IAM/deploy/backup/operations | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.13; [WEEK-0](../WEEK-0.md) overrides mail gate |
| Technical release gates/carryover IDs | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.14–6.15 |
| Latest directives / UX carryovers | [Part 7 directives](Part-7-Directives.md) | D1–D5; central mailbox + provider not A gate |
| Build plan/milestones/capacity/success metrics | [Part 7](../Part-7-Build-Plan.md) | §7.1–7.8 |
| Before build / owners / A blockers / questions | [WEEK-0](../WEEK-0.md) | P7-INFRA/ADMIN/ASSUME + dev IAM |
| One-session tasks / DoD / dependencies | [SESSION-TASKS](../SESSION-TASKS.md) | S00–S12 → A01–27 → B01–26 → optional T01–03 |
| Build/test/dev deploy command contract | [BUILD-COMMANDS](../BUILD-COMMANDS.md) | S00 scripts; not yet implemented |
| Gate evidence / viewport / cost bug checklist | [TEST-CHECKLIST](../TEST-CHECKLIST.md) | suites 1–7 |
| All decisions + source | [DECISIONS](DECISIONS.md) | C/A/U/P/F/R/P7 one line each |
| ใครอ่าน/เขียนอะไรใน Firestore ได้ (สร้างจาก fixture), Storage, หน้าจอ → แหล่งข้อมูล | [ACL-MATRIX](ACL-MATRIX.md) | ตรวจด้วย `tests/rules/fixtures/acl-matrix-doc.test.ts` และ `screen-sources.test.ts`; `infra/firestore.rules` ทดสอบทุกช่องใน `tests/rules/firestore-acl-matrix.test.ts` (S10); API ทดสอบทุกช่องใน `tests/emulator/api-access.test.ts` (S12) |

## แหล่งที่ถอดจากบทสนทนา / ช่องว่าง

`Infrastructure-Budget-and-Renewals.md`, `Part-7-Directives.md` เป็นการถอดข้อกำหนดผู้ใช้ที่ปรากฏในบทสนทนา ไม่ใช่ต้นฉบับเก่าที่กู้จากไฟล์ รายละเอียดไม่เปลี่ยน scope

Part 3 UI spec ฉบับเต็ม และ Part 2 — Addendum ฉบับเต็ม กู้คืนจากไฟล์ต้นฉบับที่ผู้ใช้อัปโหลด (4 ต.ค. 2569) ไม่มีการแก้เนื้อหา ใช้ Part 3 เป็นต้นทางของหน้าจอทุกหน้า ร่วมกับ approved prototype; ข้อที่ U1–U5, P1–P2, F1–F6 และ P7-UX แก้ไว้แล้วให้ใช้ฉบับใหม่กว่า ไม่มี app implementation รวมในชุดนี้

## Session implementations

- [S00](../sessions/S00.md): workspace/scripts/emulators/dev guard
- [S01](../sessions/S01.md): business duration/add time; คำถามเดิมปิดแล้วใน D-S01-*
- [S02](../sessions/S02.md): waiting interval union/effective end/elapsed/SLA pause และ calendar validation ล่าสุด
- [S03](../sessions/S03.md): stale/auto-close/display/calendar snapshot; รวมกับ S02 แล้ว คำถามปิดใน D-S03-*
- [S04](../sessions/S04.md): domain การสร้างงาน type/origin/title/default sensitivity/category; คำถามปิดแล้วใน D-S04-1 ถึง D-S04-6
- [S05](../sessions/S05.md): ผล D-S04 และ lifecycle commands accept/complete/confirm/not resolved/auto-close/cancel/reopen; คำถามปิดแล้วใน D-S05-1 ถึง D-S05-6
- [S06](../sessions/S06.md): ผล D-S05 (กฎ `last_updated_at`, รับงานต่อ, ธงลับ `other`/ปลดธง) และ waiting/follow-up/response; คำถามปิดแล้วใน D-S06-1 ถึง D-S06-6
- [S07](../sessions/S07.md): ผล D-S06 (GM เป็นฝ่ายที่รอ, เตือน 09:00 วันทำการถัดไป) และ routing/leave/presence/focus; คำถามปิดแล้วใน D-S07-1 ถึง D-S07-7
- [S08](../sessions/S08.md): ผล D-S07 (presence อ้างรายการสถานที่, `gm_task` → ผู้สร้าง, แจ้ง GM ทุกคนยกเว้นคนลา, owner ไม่ active, ปลดหมุดเมื่อออกจาก `in_progress`, Trello ปักไม่ได้) และ contracts/command ID/ตัวนับเลขงาน (emulator); คำถามปิดแล้วใน D-S08-1 ถึง D-S08-8
- [S09](../sessions/S09.md): ผล D-S08 (`gm_task` ผู้สร้างลาก็ถือเอง, ไม่แจ้งตัวเอง, สถานที่ปิดใช้งาน, `person_id` = อีเมล, TTL `commands`, prefix `DEV-`) และ projection builder / ACL matrix fixture (`tests/rules/fixtures/acl-matrix.ts`); คำถามปิดแล้วใน D-S09-1 ถึง D-S09-8; งานต่อ: D-S09 + [ACL-MATRIX](ACL-MATRIX.md) และคำถามค้างใหม่ 3 ข้อ
- [S10](../sessions/S10.md): ผล D-ACL-1 ถึง D-ACL-7 (`people_picker` เฉพาะ GM, งานลับอ่านได้เฉพาะ GM/ผู้ขอ/`confidential_grant_ids` ทุก role + `markConfidential`, `board_counters` get `public` เท่านั้น, หัวข้อ Storage และตารางหน้าจอ → แหล่งข้อมูลใน ACL-MATRIX) และ Firestore Rules ข้อมูลสาธารณะ/access จาก ACL matrix (3900 Rules tests, อีเมลตรงตัว, get() เดียว, Storage ปฏิเสธทุก role); คำถามค้าง Q-S10-1 ถึง Q-S10-4
- [S11](../sessions/S11.md): ผล D-S10-1 ถึง D-S10-5 (คู่ชื่อ `person_id` + `display_name` ใน `requests/{id}`, แถบรอยืนยันใช้ endpoint ส่วนบุคคล, signed URL PUT 15 / GET 5 นาที, list query ต้องมี limit ≤ 200, อีเมลตรวจหลัง `lower()`), FU-03/FU-07 (`addRelatedPersons` / `removeRelatedPerson`, related ตอนสร้างงานต้องยืนยัน grant) และ Rules ข้อมูลจำกัดสิทธิ์/subcollection (revoke มีผลทันที, history/comments ปฏิเสธทุก role); คำถามค้าง Q-S11-1, Q-S11-2
- [S12](../sessions/S12.md): ผล D-S11-1 ถึง D-S11-3 (ชื่อผู้สร้างเป็นคู่ชื่อ, แก้สิทธิ์นับเป็น action ของ GM, query บอร์ดแยกส่วน → FU-13), FU-05 (`adminCommandStore` ด้วย firebase-admin; emulator test เดิมผ่านทั้งหมด) และ API/Storage authorization (endpoint อ่าน/ไฟล์ตรวจสิทธิ์เองทุก role × ทุก endpoint ตาม `api-matrix.ts`, signed URL GET 5 / PUT 15 นาที, log ไม่มีข้อมูลส่วนตัว, network guard); gate S10–S12 ผ่าน; คำถามค้าง Q-S12-1 ถึง Q-S12-4
- [A00-plan](../sessions/A00-plan.md): ลำดับด่าน A ที่แนะนำ พร้อม W0 (P7-INFRA-01, P7-ADMIN-01–04) และ follow-up ที่แต่ละ task ติด
- [A01](../sessions/A01.md): ผล D-S12-1 ถึง D-S12-4 (รูป jpeg/png/webp ≤ 2 MiB, related ใช้คอมเมนต์, 3 รูปต่อครั้ง, ไม่รับรูปงานที่ปิด/ยกเลิก) และ API over HTTP (token + access ทุกคำขอ, CORS allowlist) + คำสั่งสร้างงานบันทึก request/projections/ตัวนับ/history/user_state/outbox ใน transaction เดียว; คำถามค้าง Q-A01-1 ถึง Q-A01-4
- [A02](../sessions/A02.md): ผล D-A01-1 ถึง D-A01-4 (CORS dev/prod ไม่รับ localhost, ยืนยัน 503 เมื่อไม่มี settings/ปฏิทิน → FU-21/FU-22, outbox ต่อผู้รับ + บันทึกช่องทางที่ใช้จริงและผลส่ง, แจ้งผู้ขอเมื่อ GM เปิดแทน) และ worker: tick เดียว + lease, ส่ง outbox ครั้งเดียวตามสถานะ Part 6, retry มีเพดาน, เก็บกวาด `pending` (FU-20), scaffold `scheduled_work` ตรวจ revision ล่าสุด, dev manual tick; คำถามค้าง Q-A02-1 ถึง Q-A02-6
- [A03](../sessions/A03.md): ผล D-A02-1 ถึง D-A02-7 (retry 5/15/60/240, ส่งอีกครั้ง = รายการใหม่, `failed` ไม่ส่งย้อนหลัง, เวลา tick ล่าสุดเกิน 30 นาทีสีแดง → FU-25, ค่า Cloud Run/Scheduler, Cloud Tasks ก่อน pilot) และ lifecycle ผ่าน API: 6 คำสั่ง S05 ใน transaction เดียว (summary ทั้งสองชั้น/history/user_state/ตัวนับงานภายใน/ปลดหมุด/outbox ผู้ขอ + watcher), `expected_revision` → 409 `REVISION_CONFLICT`/`ALREADY_ACCEPTED`, auto-close job ของ tick แข่งกับผู้ขอแล้วปิดครั้งเดียว; คำถามค้าง Q-A03-1 ถึง Q-A03-7
- [A06](../sessions/A06.md): ผล D-A03-1 ถึง D-A03-7 (แจ้ง assignee เมื่อ “ยังไม่เรียบร้อย”, แจ้ง GM เดิมเมื่อรับต่อ, ระงับประกาศสถานะที่ล้าสมัย `SUPERSEDED`) และจุด “มีอัปเดตใหม่” (`activity_seq` + `POST /api/requests/:id/seen`), จำนวนรอยืนยัน, ป้าย “ผู้ขอยังไม่ได้รับแจ้ง” (GM only), ปิด FU-08 (watch → user_state + `watcher_count`); คำถามค้าง Q-A06-1 ถึง Q-A06-5
- [A04](../sessions/A04.md): ผล D-A06-1 ถึง D-A06-6 (ประกาศเปิดแทนไม่ถูกระงับ, ป้ายผู้ขอ, `NO_ACCOUNT` → A17, ระงับประกาศล้าสมัยด้วย `outbox_heads` อ่าน 1 ครั้ง) และรอผู้อื่น/ติดตาม/เตือนซ้ำ/ตอบกลับ/กลับมาทำต่อผ่าน API (`waiting_intervals`, การแจ้งตามประเภทฝ่าย, worker ตรวจช่วงรอ/สิทธิ์ก่อนส่ง, preview ผู้รับ/สิทธิ์), ปิด FU-26 (ยกเลิกจาก waiting ปิดช่วง), FU-12 (เพิ่ม/ถอดผู้เกี่ยวข้อง), FU-09 (ติดธงลับภายหลัง/ปลดธง + `public_visibility_epoch`); คำถามค้าง Q-A04-1 ถึง Q-A04-9
- [A05](../sessions/A05.md): ผล D-A04-1 ถึง D-A04-9 (ไม่แจ้งตอนกลับมาทำต่อ, DM ครั้งเดียวตอนถูกเพิ่มเป็นผู้เกี่ยวข้อง, แถว ACL ของ `public_visibility_epoch`, เหตุผลปลดธงลับเป็นของ GM เท่านั้น `gm-history`) และ stale ผ่าน tick (job ล่วงหน้า 3 BD + 1 ms, ปฏิทินบริษัทปัจจุบันตาม FU-27, คำนวณใหม่เมื่อปฏิทินเปลี่ยน, ไม่อ่านงานเปิดทุกงาน) + รีเซ็ตสถานะที่อยู่เที่ยงคืนกรุงเทพ; คำถามค้าง Q-A05-1 ถึง Q-A05-5
- [A07](../sessions/A07.md): ผล D-A05-1 ถึง D-A05-5 (DM ผู้เกี่ยวข้องที่ใส่ตอนสร้างงาน ยกเว้นผู้สร้าง, ไม่ DM ตอนได้สิทธิ์งานลับ, ปฏิทินมีผลรอบ tick ถัดไป ปิด FU-32, job รายวันสร้างใหม่ทุกวันแม้วันก่อน `failed`) และ Slack outbound adapter (ข้อความไทยสั้นทุกชนิดการแจ้ง + เลขงาน + ลิงก์ `GM_WEB_BASE_URL/requests/{id}`, งานลับ = เลข + “งานภายในมีอัปเดต” + ลิงก์, วันที่ `formatThaiDateTime`, Retry-After, timeout → `delivery_unknown`, Slack ไม่รู้จัก ID → email; โหมด runtime ยัง local/disabled จนถึง P7-ADMIN-03 FU-33); คำถามค้าง Q-A07-1 ถึง Q-A07-8
- [FOLLOW-UPS](../FOLLOW-UPS.md): งานที่เลื่อนข้าม session
