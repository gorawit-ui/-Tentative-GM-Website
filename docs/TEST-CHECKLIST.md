# Test checklist / release evidence

เป็นเกณฑ์ของระบบที่จะ build ไม่ได้อ้างว่าผ่านแล้ว ใช้ test suites เชื่อม task IDs ใน SESSION-TASKS และเก็บ commit/config/artifact ที่ทดสอบ ชุด prototype ที่ผู้ใช้ตรวจแล้วเป็น reference UI เท่านั้น

## 1. Shared pure time + domain — ต้องผ่านก่อน Rules และ UI

| Case | Expected / Task |
|---|---|
| ศุกร์ 2 ต.ค.2569 16:00 + 1 BD | จันทร์ 5 ต.ค.16:00, S01 |
| เวลาเดิม + continuous 24 h | เสาร์ 3 ต.ค.16:00, S01 |
| เสาร์ 3 ต.ค.12:00 + 1 BD | อังคาร 6 ต.ค.00:00, S01 |
| `completed` 28 ธ.ค.2569 09:30; test holidays 31 ธ.ค./1 ม.ค. + weekend | auto-close 4 ม.ค.2570 09:30, S03; holiday นี้เป็น fixture ไม่แทน company calendar จริง |
| elapsed = 3 BD และ 3 BD + 1 ms | stale false/true ตามลำดับ; auto-close eligible ที่ >=3 BD, S03 |
| เริ่มจันทร์ 9 รอ 12 ตอบอังคาร 12 GM กลับ 15 budget 24 h | pause จบอังคาร 12; effective due พุธ 9; ช่วง 12–15 นับเวลา GM, S02/B01 |
| รอหลายรอบ / คน A→B / callback ช่วงเก่า | ไม่ double count; response เก่าถูกปฏิเสธ; history ไม่หาย, S02/S06 |
| follow / comment / watcher contribution / pin / response | follow reset stale; อีกสี่รายการไม่ใช่ GM progress; response หยุด `waiting`/SLA pause เท่านั้น, S03/S06 |
| เปลี่ยน calendar/policy หลัง snapshot | งานเดิมไม่เปลี่ยน original due/budget; planned due มีเหตุผลไม่ล้าง breach, S03/B01–03 |
| <1 BD / 4.1 BD / updated yesterday | “ไม่ถึง 1 วันทำการ” / “4 วันทำการ”; ข้อความอัปเดตล่าสุดมี “ที่แล้ว”; “วันนี้” ใช้เมื่อวันนี้จริง, S03/P7-UX-01 |
| manual GM category/`waiting` fields | เริ่มว่างและ server required; notifications/grant แสดงหลังเลือกเท่านั้น, S04/A20/A21 |

ทดสอบขอบเขตเวลาเริ่ม/จบวัน, วันหยุดติดกัน, workweek ไซต์เสาร์-อาทิตย์, ไม่มีสถานที่ fallback บริษัท, zero/negative invalid input, fake clock ไม่พึ่ง timezone เครื่อง Pure functions รับเวลา/calendar/interval ผ่าน arguments ไม่อ่าน Firestore/Date.now ภายใน calculation

## 2. Security — Rules + API + Storage แยกกัน

- [ ] corporate active vs inactive/no-company auth; 4 role, `requester`, related person, watcher, unrelated employee, team-label-only, GM; Rules S10–12 และ API ที่ใช้ Admin SDK ต้องมี test ของตัวเอง
- [ ] public summary allowlist ไม่มี description/comment/photo/Drive link/private history/ชื่อผู้แจ้งเพิ่ม; secret ไม่มี doc ใน `request_summaries` และ search
- [ ] related ดู/คอมเมนต์ได้ ไม่เปลี่ยนสถานะ; watcher ดูสรุป/แจ้งเตือนได้ไม่มี confirm/detail; Viewer จาก role เพียงอย่างเดียวเห็นเฉพาะ public aggregate; explicit related ให้สิทธิ์รายละเอียดเฉพาะงานตาม Part 6 §6.5 ไม่เพิ่มสิทธิ์ทะเบียน/Dashboard secret
- [ ] ลอง direct child document, known ID, old signed URL/object path, revoked access, inactive role; no UI-only authorization
- [ ] secret notification กลาง+เลขงาน+link; related grant แยก; flip secret ลบ summary และ invalidate cache/focus ไม่เก็บ title เก่า
- [ ] PWA/browser logs/error traces ไม่มี private payload/secret/credential/signed URL; signed URL อายุสั้นถือเป็น bearer จนหมดอายุ ไม่อ้างถอนสิทธิ์ลิงก์ที่แจกแล้วทันที

## 3. Lifecycle / concurrency / degraded notifications — ด่าน A

- [ ] QR→duplicate→watch: no new Request; repeat watch idempotent; optional note/image 1 ครั้ง GM เท่านั้น; no secret/other match
- [ ] create simultaneous / retry / command old revision / accept race / complete vs confirm/auto-close / old cycle reopen: หนึ่งผลตาม revision
- [ ] GM accepts→`waiting`→current party responds→GM resumes→complete→`requester` confirms; response no status/last_updated change; ฝ่ายภายนอก recipient ไม่มี button
- [ ] GM self-create cross-team <1 นาที; `created_by_id`/`origin` ถูก; on-behalf selected `requester` มีสิทธิ์/confirm; text-only ไม่มี confirm และ GM เสร็จปิดทันที
- [ ] leave default owner→new `queued` unassigned+GMall; end-date inclusive; leave without end reset; pin closed auto-unpin; secret focus fallback
- [ ] Slack ready/Gmail disabled, Gmail ready/Slack disabled, both disabled, unmatched Slack, failed delivery, delivery_unknown; งานทุกกรณีบันทึกได้ in-app banner/dot/badge ถูก ไม่ duplicate DM/email
- [ ] follow reminder 1 ครั้ง/BD/งาน; provider cap/retry bounded; current response แจ้ง owner ไม่เปิดเผย secret
- [ ] image compression/Thai picker/per-image progress/partial fail/retry/orphan cleanup; formsend แม้รูปขาดแจ้งชัด

## 4. UI/layout — แอปจริงต้องตรวจใหม่

| จอ | เกณฑ์ |
|---|---|
| 360×640 | no horizontal page scroll; GM first card full without vertical scroll; bottom nav 64 px ตามพื้นที่/safearea; form hide bottom nav/action bar compact; content ไม่ถูกบัง |
| 390×844 | compact standard cards อย่างน้อย 3 ใบเต็ม; action min 44 px; longtext/`waiting` badge ยังใช้งานได้ |
| 1366×768 | `queued`/`in_progress`/`waiting` พร้อมกันไม่ horizontal scroll; `completed`/`cancelled` collapsed; confirm badge; filters ไม่บดบังบอร์ด |
| 1440×900 | layout ไม่ล้น; collapsed closed columns กดขยายได้; >=1536 เพิ่ม 5 คอลัมน์ |

- [ ] utility overrides ตาม P1: link brand fg, button caption+semibold, input h 2, primary button px 8; CSS ทุกกฎอยู่ layer; import token `layer(components)`
- [ ] status text/badge contrast ตาม Part 4 measured pairs; สีจุดไม่ใช้แทนข้อความเพียงอย่างเดียว; keyboard/focus/aria/errors
- [ ] reduced motion ปิด animation/transition; no console errors; mobile quick actions<=2 taps; “ย้อนกลับ”ตาม navigation `origin`
- [ ] full 5 locations Thai/พ.ศ.; F1–F6 intact; P7-UX-01/02 แก้ใน app จริงโดยไม่แก้ prototype

## 5. ด่าน B

- [ ] coordinate vs resolve SLA; snapshot/due/pause/cohort fixtures; Viewer/GM scopes; original targets preserved; chart wait business days ไม่ hours decimal
- [ ] aggregate server-generated; secret counts ไม่รั่ว; CSV field allowlist/formula neutralization; unconnected document/assets มีลิงก์/ไม่ 0
- [ ] Slack HMAC/ACK/cold start/duplicates/auth; digest single job/holiday/retry; disabled email ใช้ central approved sender เท่านั้น
- [ ] document simple forms/safe title; prefix/number search ไม่ external; announcements/admin permission; PWA static cache only
- [ ] 200 renewal fixtures: groups/lead/boundaries/create exactly 1 cycle/job duplicate/outage/30/7/overdue/coalescing/holiday 09:00
- [ ] complete Renewal new expiry required ทุก entrypoint incl Slack/API; generic complete/cancel ห้าม bypass; no-renew reason/archive; atomically advance; stale jobs no-op
- [ ] CSV Thai/BOM/BE conversion preview confirm/invalid dates/error rows/resume/samefile; no arbitrary Drive fetch/change Drive ACL
- [ ] `renewal_pending` จาก active item/current cycle ที่เริ่มแล้ว unresolved; overdue subset; correct แม้ task creation ค้าง; Viewer excludes confidential; other 2 tiles unconnected

## 6. ทุก dev deploy — `P7-COST-01..03`

- [ ] before / after Firestore usage reads/writes/deletes/listener counts; ทิ้งบอร์ด idle ไม่มี writes วน; 3 GM live boundaries
- [ ] route change/unmount/filter/reconnect unsubscribe; ไม่ subscribe ซ้ำจาก rerender; closed 7 day cutoff/pending confirm always; all history pagination ไม่ live
- [ ] worker/trigger ไม่เขียนกลับ document ที่ฟังแล้วเรียกตัวเองวน; duplicate outbox/job/inbox ไม่มี unbounded retry; backoff/lease/max dispatch
- [ ] Cloud Run min 0/max instance config; Tasks/Scheduler/Billing/Logging/export reads ที่ usage graph อาจไม่เห็น; artifact/secrets/storage retention
- [ ] dev notification sandbox only; budgets 100/300/1000 project alerts ไม่ใช่ cap; threshold ถึงให้ Tim ตรวจ ไม่ปิดสิทธิ์ข้อมูลอัตโนมัติแบบไม่ออกแบบ
- [ ] backup daily 7 copies/restore dev rehearsal; export one operation; image/Auth/config/secrets recovery ตาม runbook; RPO/RTO ผู้ดูแลยืนยัน

## 7. หลักฐาน Gate

Gate A: suites 1–4 + ops 6, W0 blockers/assumptions closed, actual company holiday loaded, baseline collected, QR custom domain/5 sites, notification degraded tests ผ่าน; อนุมัติ Slack/Gmail ไม่เป็น gate

Gate B: Gate A regression + suite 5 + ops 6, Dashboard/Scorecard CSV/search/document/announcement/PWA/action / digest/SLA/site calendar/renewals ครบ; Trello ไม่นับ gate

เก็บผล `npm run verify`, CI commit, Emulator logs ที่ redact, viewport screenshots, API/Rules deny evidence, app/config digest, dev usage compare, rollout/rollback และรายชื่อผู้รับรอง Gate ไม่ปล่อยผ่านโดยอาศัยคำว่า prototype ผ่านแล้ว

หมายเหตุ Storage: Emulator/local adapter tests ตรวจ ACL ของ API/Rules แต่ไม่พิสูจน์ GCS IAM หรือ signed URL จริง ต้องเพิ่ม dev cloud smoke ใน A26 ด้วย actual service account/object path/expiry และ unauthorized upload/read denial โดยไม่ใช้ข้อมูลจริง
