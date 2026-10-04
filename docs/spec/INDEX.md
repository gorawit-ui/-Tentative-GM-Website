# Spec index — อ่านต้นทางตามหัวข้อ

## ลำดับเมื่อขัดกัน

เอกสารที่ใหม่กว่าในลำดับการยืนยันของผู้ใช้ชนะเอกสารเก่า ไม่ใช้ filesystem modified time เป็นลำดับนโยบาย **C1–C11 ชนะ CH-01–CH-09 เสมอ** แม้พบ CH ในไฟล์ที่ timestamp ใหม่กว่า

ลำดับที่ใช้: Part 7 directives → infrastructure/budget + R1–R5 → F1–F6 + UX carryovers → P1–P2 → U1–U5 → Part 3 UI spec → A1–A4 → C1–C11 → Part 1/2 เนื้อหาเดิม เฉพาะเรื่องที่แก้; Part 6 เป็นการสังเคราะห์เทคนิคใต้ข้อกำหนดเหล่านี้ ไม่ลบข้อกำหนดผู้ใช้ การ clean Part 6 เปลี่ยนรูปแบบเท่านั้น ไม่เพิ่มความใหม่ของนโยบาย

หากต้นทางไม่ตอบ ให้บันทึกข้อขัดกันพร้อมไฟล์/หัวข้อ และถามเฉพาะเรื่องที่จำเป็น ห้ามเปลี่ยนสิทธิ์/scope/ตัวเลขด้วยการคาดเดา

คำตอบล่าสุดจากผู้ใช้สำหรับ S01 (`D-S01-1` ถึง `D-S01-6`) อยู่ [DECISIONS](DECISIONS.md) และมีผลเหนือข้อเดิมที่ขัดกันใน Part 6/S01; ผล implement อยู่ [S02](../sessions/S02.md)

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
| Commands/counters/races/idempotency | [Part 6 clean](Part-6-Technical-Spec-Clean.md) | §6.6 |
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

## แหล่งที่ถอดจากบทสนทนา / ช่องว่าง

`Infrastructure-Budget-and-Renewals.md`, `Part-7-Directives.md` เป็นการถอดข้อกำหนดผู้ใช้ที่ปรากฏในบทสนทนา ไม่ใช่ต้นฉบับเก่าที่กู้จากไฟล์ รายละเอียดไม่เปลี่ยน scope

Part 3 UI spec ฉบับเต็ม และ Part 2 — Addendum ฉบับเต็ม กู้คืนจากไฟล์ต้นฉบับที่ผู้ใช้อัปโหลด (4 ต.ค. 2569) ไม่มีการแก้เนื้อหา ใช้ Part 3 เป็นต้นทางของหน้าจอทุกหน้า ร่วมกับ approved prototype; ข้อที่ U1–U5, P1–P2, F1–F6 และ P7-UX แก้ไว้แล้วให้ใช้ฉบับใหม่กว่า ไม่มี app implementation รวมในชุดนี้

## Session implementations

- [S00](../sessions/S00.md): workspace/scripts/emulators/dev guard
- [S01](../sessions/S01.md): business duration/add time; คำถามเดิมปิดแล้วใน D-S01-*
- [S02](../sessions/S02.md): waiting interval union/effective end/elapsed/SLA pause และ calendar validation ล่าสุด
