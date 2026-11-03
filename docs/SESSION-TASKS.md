# Task backlog — หนึ่งแถวต่อหนึ่ง Claude Code session

เสนอ session 2–4 ชม.รวม test และสรุปผล ไม่ใช่การรับประกันเวลาของบริษัท ถ้าเกิน 4 ชม.ให้แยกก่อนเริ่ม ห้ามตัด acceptance เพื่อให้จบเร็ว `BL` = Build lead/Claude Code; `GM` = GM reviewer; `Tim` = ผู้ดูแล deploy; ทุกแถวต้องผ่าน DoD ท้ายไฟล์ มี test/evidence และ dependencies ก่อน merge

W0 ตาม [WEEK-0](WEEK-0.md) มาก่อน `S00`; ระหว่างรอสิทธิ์ cloud ให้ทำ unit/emulator ภายใน dev ได้หลัง W0 บันทึกสถานะ การทำ UI ต้องผ่าน foundation gate `S10` ถึง `S12` ทั้งหมด

## Foundation — W1–W2, test-first ไม่มีหน้าจอ

| ID | Depends | งาน/เจ้าของ | Acceptance test เฉพาะงาน |
|---|---|---|---|
| S00 | W0 recorded | BL: workspace/scripts/emulators/dev guard + version pin | คำสั่ง BUILD-COMMANDS ทำงานบน skeleton; prod/empty target fail ก่อน network; lockfile reproducible |
| S01 | S00 | BL: เขียน failing test แล้ว pure business-time/add-time | Fri/Sat/continuous และปีใหม่ตรง Part 6 §6.7; 24 ชม.บนวันที่เปิด ไม่ใช่ 8 ชม.; TZ Bangkok deterministic |
| S02 | S01 | BL: pure `waiting` interval merge/elapsed/SLA pause | หลายช่วงไม่ double count; response Tue 12 หยุด pause แม้ GM กลับ 15; raw age เดินต่อ |
| S03 | S02 | BL: pure stale/auto-close/display + calendar snapshot | >3 BD stale / >=3 BD close; <1 “ไม่ถึง 1 วันทำการ”; “ที่แล้ว”; เปลี่ยน live calendar ไม่เปลี่ยน snapshot |
| S04 | S00 | BL: domain creation/type/`origin`/title/default sensitivity | `gm_task` ไม่มี `requester`; on-behalf text ไม่มี confirm; maintenance title safe; category manual required |
| S05 | S04,S03 | BL: lifecycle commands tests ก่อน implementation | `completed`/`requester`-confirm/auto-close/no-confirm/cancel/reopen ถูก; ไม่ล้าง history/breach/cycle เก่า |
| S06 | S04,S02 | BL: `waiting`/follow/response permissions domain | current recipients เท่านั้น; old interval deny; response ไม่เปลี่ยน status/`last_updated_at`; follow reset stale เท่านั้น |
| S07 | S04,S03 | BL: routing/leave/focus/presence domain | Sirirat ลา→`queued` unassigned; GM ทุกคน; leave end/date reset; pin ไม่ reset stale; secret fallback “งานภายใน” |
| S08 | S05,S06,S07 | BL: contracts/command IDs/counter transaction tests | retry event เดิมหนึ่งผล/หนึ่งเลข; concurrent สร้างเลขไม่ซ้ำ; zero private fields ใน public projection |
| S09 | S08 | BL: projection builder/ACL matrix fixtures | active employee/Viewer/`requester`/related/watcher/GM/inactive; secret ไม่มี public summary; `team_labels` ไม่ grant |
| S10 | S09 | BL: **Rules + Emulator public/access** tests-first | inactive/noncorporate deny; summaries only allowlist; client mutate summary/access deny; bounded query ตรง Rules |
| S11 | S10 | BL: **Rules + Emulator private/children** tests-first | `requester`/related only private; watcher/team-label alone deny; revoke fail next read; direct history/comments unauthorized deny |
| S12 | S11 | BL: **API/Storage authorization emulator** + rules gate | Admin SDK endpoints ตรวจ ACL เอง; upload/finalize/signed URL foreign path deny; dev secrets/logs/private payload ไม่รั่ว; S10–12 green ก่อน UI |

## ด่าน A — W3–W5, candidate W6 / buffer W7

| ID | Depends | งาน/เจ้าของ | Acceptance test เฉพาะงาน |
|---|---|---|---|
| A01 | S12 | BL: API auth + create command persistence/outbox atomic | unauth/disabled deny; command retry หนึ่งงาน; notification fail ไม่ rollback งาน |
| A02 | A01 | BL: worker queue/single tick lease/retry scaffold | duplicate tick/worker no-op; latest revision checked; dev manual tick; หนึ่ง production Scheduler config |
| A03 | A01 | BL: request lifecycle persistence/optimistic revision | two GM race ไม่ overwrite; confirm/auto-close compete หนึ่ง close; `cancelled` stale command deny |
| A04 | A03,A02 | BL: `waiting`/follow/response endpoints + history | recipients/give-access preview; secret grant separate; once/workday reminder; response race ผู้ติดต่อคนถัดไปไม่ย้ายเวลา |
| A05 | A02,A03 | BL: stale/auto-close/presence tick | auto-close 3 BD snapshot; `waiting` ยัง stale; closed ไม่เตือน; leave end ไม่ reset ก่อน; duplicate tick ไม่ซ้ำ |
| A06 | A01,S12 | BL: in-app unread/pending confirms/delivery badge | last view marker ถูก; `requester` ไม่มีช่องทาง GM เห็น badge; no confirmation for watcher/text `requester` |
| A07 | A01,A02 | BL: Slack outbound adapter + disabled mode | sandbox DM ครั้งเดียว/event; secret มีเลข+ข้อความกลาง+link; disabled/failed งานคงอยู่และแสดงส่งไม่สำเร็จ |
| A08 | A01,A02 | BL: Gmail outbound adapter + central-mailbox config | disabled ยังใช้ในแอป; approved sandbox ผู้ส่งกล่องกลาง; cap/retry/redaction; no new license/employee sender |
| A09 | S12,A01 | BL: Google login/4 roles/route shell | corporate active เท่านั้น; no account contact; nav repair 1 tap; mobile form route เตรียมซ่อน nav |
| A10 | A09 | BL: Admin people CSV/role settings UI | preview duplicate/invalid; active roles; changes server-authorized; Directory API optional |
| A11 | A09 | BL: Admin locations/areas/QR/company calendar | ครบ 5 สถานที่; QR `/q/:qr_id` custom domain; disable QR safe; holiday validate ไม่ silent date guess |
| A12 | A09,A11 | BL: public QR landing + repair step 1–3 | prelogin ไม่ private; no-account contact; correct QR place/area; <=4 steps เมื่อไม่ duplicate |
| A13 | A12,A01 | BL: duplicate watch backend + interstitial UI | match public open location/area/symptom; “อื่นๆ”/secret excluded; repeat watch ไม่เพิ่ม; watcher no detail/confirm |
| A14 | A12,A13 | BL: repair step 4 + submission/retry/title | auto title immutable `requester`; free text อยู่ private; final duplicate recheck override ยังสร้างได้หนึ่งงาน |
| A15 | A14,S12 | BL: photo client compression/picker/progress | 1600 px target; Thai picker; per-image fail ไม่บล็อกงาน; pending/orphan/finalize ACL server |
| A16 | A09,A03,A06 | BL: my requests/related-summary/unread UI | `requester` details vs watcher summary; unseen dots viewed clears; home pending count ถูกต้อง; link back `origin` |
| A17 | A16,A15 | BL: details/comments/history presentation | foreign request deny; private attachments no public URL; submission comment ไม่ reset GM stale; ย้อนกลับจริง |
| A18 | A09,A03,S09 | BL: mobile GM board/status groups/filter sheet | 360 first card full;390 three cards; chips/unassigned/filter removable; actions>=44 px; no horizontal page |
| A19 | A18 | BL: desktop Kanban/bounded listener pagination |1366 three open cols visible; <1536 closed collapsed/badge; >=1536 five; 7 day closed/cancel; pending confirm always; unsubscribe |
| A20 | A18,A03,A04 | BL: card quick accept/follow/complete + `waiting` sheet | common actions<=2 taps; `waiting`/person start empty; validation block; notify/grant only after selected; secret confirm separate |
| A21 | A09,A01,A04 | BL: GM create cross-team + on-behalf form | <1 min create;7 categories empty required; related persons; initial `waiting` validation; text `requester` close ทันที |
| A22 | A17,A04 | BL: `waiting`-party response UI | current recipients button+optional note; badge owner notify; no status/stale change; external no button |
| A23 | A09,A06,S07 | BL: home focus/presence/company contact FAQ + **กล่องสรุป GM จากข้อมูลที่มี (SC-9)** | pinned→latest `in_progress`→empty; secret fallback; leave/end; live focus; Admin edit static FAQ; confirm banner; **GM เห็นกล่องสรุป แจ้งซ่อมค้าง / รอผู้อื่น / ยังไม่มอบหมาย / ไม่ขยับ ตัวเลขตรงกับบอร์ด (ไม่รวมงานลับที่ผู้ดูไม่มีสิทธิ์), พนักงานทั่วไปไม่เห็นกล่อง, ไม่มีกล่องของข้อมูลที่ยังไม่มี (ต่ออายุ/PM อยู่ B33)** |
| A24 | A19,A23,A02 | BL: notification degraded-mode + privacy transitions E2E | Slack only/Gmail only/neither approved; secret flip removes public summary/search/focus/cache epoch; no duplicate grants |
| A25 | A15,A20,A22,A24 | BL+GM: mobile/accessibility/regression gate | 4 viewports; F1–F6/P1–P2/reduced motion/contrast; year-end unit cases; console error 0; whole flow request/watch/secret |
| A26 | A25,A05,A10,A11 | Tim+BL: dev staging/pilot release rehearsal | deploy dev guard; Firestore graph/loops/cost; rollback; daily export/restore dev; cloud smoke compiled app |
| A27 | A26,W0 A blockers closed | GM Admin+Tim: pilot approval/onboarding/baseline | documented A gate;5 locations QR domain; before baseline+calendar; notification approvals optional; admin prod deploy smoke |

## ด่าน B — W8–W11; W12 buffer ถึง 31 ธันวาคม 2569

ปรับตาม [Scope Addendum พ.ย. 2569](spec/Scope-Addendum-2026-11.md) (SC-1–SC-9): B14–B24 เขียนใหม่ให้ครอบงานตามรอบ 3 แบบ (รวม task ต่ออายุเดิม), เพิ่ม B27–B35 (B35 ผังสถานที่ท้ายสุด), B10/B12/B13 และ T01–T03 ทำเครื่องหมาย “รอยืนยัน” ย้าย Phase 2 (ยังไม่ลบ) — จำนวน session: เดิม 26 → 35 (หรือ 32 ถ้าย้ายสามงาน)

| ID | Depends | งาน/เจ้าของ | Acceptance test เฉพาะงาน |
|---|---|---|---|
| B01 | A27,S02,S03 | BL: SLA attach/evaluate/snapshot persistence | coordinate 1 BD power/internet; general repair setting; others no SLA; original / planned separate; pause ends response |
| B02 | B01,A11 | BL+GM: site calendar/SLA Admin UI | workweek Sat/Sun possible; edit new only; openold snapshot stable; planned change reason required |
| B03 | B01 | BL: SLA cohort/metrics calculation tests | numerator/eligible denominator/cancel / reopen/breach ตาม PRD 6.7+Part 6; fixture hand count |
| B04 | B03,A24 | BL: worker aggregate generation/cache/privacy scopes | Viewer public only vs GM; epoch invalidate; clients no rawjoin; duplicate aggregate tick ไม่ loop |
| B05 | B04 | BL: Dashboard UI charts/filters/home `waiting` bottleneck | 5 statuses denominator; workload/stale/waitwho; BD integer/<1; Viewer all panels but no secret facts |
| B06 | B04,B05 | BL: maintenance Scorecard/CSV/targets snapshots | 0 manual count; CSV scope allowlist; target old retained; document/assets “ยังไม่เชื่อมข้อมูล” link ไม่ 0 |
| B07 | A07,A04 | BL: Slack interactive endpoint/inbox | HMAC/time/workspace/mapped actor; durable ACK<3 sec coldcase; retry command ID no duplicate; permission deny |
| B08 | B07 | BL: Slack actions UI/contracts | role/status / revision check before action; card actions accepted follow complete ตาม flow; unauthorized ephemeral deny |
| B09 | A02,A07,A08 | BL: digest job in existing tick | one/day/business calendar/user; outage catch-up ไม่ repeat; private scope; disabled provider fallback |
| B10 | A17,A21 | **(รอยืนยัน: เสนอย้าย Phase 2 — SC-9 / Q-SC-5; ยังไม่ลบ)** BL: document request/intake simple forms | US-04; contract/person secret default company doc non-secret; safe title; attachments restricted |
| B11 | A19,A24 | BL: request number/title prefix search + paginated all | summary public only; GM private index authorized; normalized prefix bounded; expired 7 day view pagination not live; no external search |
| B12 | A09 | **(รอยืนยัน: เสนอย้าย Phase 2 — SC-9 / Q-SC-5; ยังไม่ลบ)** BL: announcements/Admin editing | role permission; public safe content; link/deactivated expiry; no external CMS |
| B13 | A09,A17 | **(รอยืนยัน: เสนอย้าย Phase 2 — SC-9 / Q-SC-5; ยังไม่ลบ)** BL: PWA shell/install/offline behavior | static cache only; logout clears user state; private payload not cached; offline writes not `queued` unsafely; repair retry clear |
| B14 | S04,S05,A01 | BL: **งานตามรอบ 3 แบบ** domain tests-first (SC-1, เดิม renewal item/cycle) | ต่ออายุ start = หมดอายุ − (ยื่นได้ก่อน + เวลาเตรียม) วันปฏิทิน + วัน “ยื่นได้ตั้งแต่”; ภาระประจำ: วันเดียว/ช่วงวันรายปีหรือรายเดือน → รอบถัดไป (ปลายปี/ปีอธิกสุรทิน); PM ความถี่ → รอบถัดไป (จุดนับตาม Q-SC-3 เป็นค่าตั้ง); บริษัท/หมวด/PIC/SOP/สถานะใช้งาน; inactive ไม่สร้างรอบ; สัญญาลับตาม C6; identity item+cycle คงที่ |
| B15 | B14,A02 | BL: สร้าง `gm_task` ต่อรอบทุกแบบ + job keys (SC-1, R2) | หลาย tick/พร้อมกัน/catch-up → 1 งานต่อรอบ; มอบ PIC สถานะ “ยังไม่รับเรื่อง”; ไม่เพิ่ม Scheduler; ข้ามคืน/วันหยุดสร้างงานแต่เลื่อนการแจ้ง; job เก่า no-op; PIC ลาตาม Q-SC-9 |
| B16 | B15 | BL: **กติกาการเตือน SC-2** (แทน 30/7 ของ R2) + catch-up | ก่อนรับเรื่องเตือนทุกวันทำการ; ไม่รับใน N วันทำการแจ้ง GM Admin (N ค่าตั้ง เริ่ม 2 ตาม Q-SC-1); รับแล้วใช้ stale (Q-SC-2); 7 วันสุดท้ายทุกวัน; เลยกำหนด PIC + GM Admin ทุกวัน ไม่ซ้ำในวันเดียว; ผลการส่งเดิม (Slack→email, ป้าย); วันหยุดตาม Q-SC-12; ไม่มีข้อความ “เหลือ 30 วัน” |
| B17 | B14,A03 | BL: ปิดรอบทุกแบบ (SC-2, R3) | ต่ออายุต้องวันหมดอายุใหม่ (หลังเดิมและหลังวันนี้), ไม่ต่ออายุต้องเหตุผล; PM ต้องวันที่ทำ → รอบถัดไป; ภาระประจำตาม Q-SC-13; ปุ่มเสร็จ/ยกเลิกทั่วไปข้าม guard ไม่ได้; เลื่อนรอบครั้งเดียว |
| B18 | B14,B17,B27,B28,A09 | BL: หน้ารายการงานตามรอบ + ฟอร์ม (3 แบบ) | ต่ออายุ/ภาระประจำ GM เท่านั้น; กลุ่มเลยกำหนด/ใกล้ถึง/ปกติ ขอบวันถูก; 200 รายการแบ่งหน้า; บริษัท/หมวด/PIC/SOP/หมายเหตุ/สถานะใช้งาน; PM สถานที่/บริเวณ/ช่างประจำ; แสดง “ยื่นได้ตั้งแต่วันที่”; desktop ตาราง มือถือรายการ |
| B19 | B18,B17 | BL: UI ปิดรอบ + ประวัติ (3 แบบ) | ปุ่มปิดใช้ไม่ได้จนกรอกวันหมดอายุใหม่ (ต่ออายุ) / วันที่ทำ (PM); ไม่ต่ออายุต้องเหตุผล; ผล atomic; รอบเก่าเปิดกลับแบบปกติไม่ได้; ประวัติรอบ |
| B20 | B14 | BL: CSV parser ต่ออายุ + ช่าง tests-first (SC-3) | หัวคอลัมน์ไทยตามชีท “[New] รายการต่ออายุเอกสาร” และ “เบอร์ช่าง”; BOM/ชนิดไฟล์แบบ A10; พ.ศ. 2570→2027; วันผิด/กำกวม/Excel serial รายงานไม่เดา; เก็บค่าดิบ + ค่าที่แปลง; fixture ปลอมหัวคอลัมน์เหมือนจริง |
| B21 | B20,B18,A10 | BL+Gorawit: preview นำเข้าต่ออายุ + ช่าง | Owner (ชื่อ) จับคู่กับรายชื่อพนักงานใน preview — ไม่จับคู่อัตโนมัติจากชื่อคล้าย; แถวผิดแสดง; วันที่แปลงต้องยืนยันก่อนเขียน; เลือกเฉพาะแถวที่ถูกโดยตั้งใจ; ไม่ fetch URL จาก server |
| B22 | B21,B32,A01 | BL: import chunks/idempotency/resume (ทุกแท็บ) | filehash+row key ลองซ้ำไม่เพิ่ม; ล้มกลางทางทำต่อเฉพาะที่ขาด; ไม่ซ้ำรายการเดิม; chunk ≤ 100 (assumption); ข้อมูลจริงผ่านหน้า Admin หลัง deploy เท่านั้น |
| B23 | B16,B17,B04 | BL: renewal Scorecard aggregate/CSV (start ตาม SC-1) | `renewal_pending` นับ current cycle ที่ active, start ≤ วันนี้ (สูตร SC-1) และยังไม่จบ; overdue เป็น subset; นับถูกแม้ job ไม่สร้างงาน; Viewer ไม่รวมรายการลับ/GM-only |
| B24 | B23,B06,B18 | BL+GM: renewal tile + end-to-end งานตามรอบ | ไทล์จริงแทน “ยังไม่เชื่อม” เฉพาะต่ออายุ พร้อมนิยาม; e2e: นำเข้า→ถึงรอบ→เตือนก่อนรับ→รับเรื่อง→รอผู้อื่น→ปิด (ต่ออายุวันใหม่ / PM วันที่ทำ) → รอบใหม่; ไม่ต่ออายุ |
| B27 | S10,B14 | BL: **Rules/ACL งานตามรอบ, บริษัท, ช่าง, วันลา, ผังสถานที่** tests-first (SC-4) | ACL matrix fixture + Rules + emulator ทุก role: ต่ออายุ/ภาระประจำ GM เท่านั้น; PM อ่านได้ทุกคนที่ active (projection อ่านอย่างเดียว ไม่มีช่าง/ข้อมูลภายใน), เขียนเฉพาะ GM; ช่าง/วันลา/ผังสถานที่ GM เท่านั้น; client เขียนตรงไม่ได้; ขอบเขตงานบนบอร์ดตาม Q-SC-14 |
| B28 | B27,A11 | BL: รายการบริษัท (Admin ตั้งค่า) + หน้าแผน PM อ่านอย่างเดียวสำหรับทุกคน (SC-1, SC-4) | เพิ่ม/เปลี่ยนชื่อ/ปิดบริษัท (ปิดแล้วรายการเดิมยังชื่อเดิม); พนักงานทั่วไปเห็นแผน PM (ชื่อ สถานที่ บริเวณ รอบถัดไป) ไม่เห็นปุ่มแก้ ไม่เห็นช่าง; 4 ขนาดจอไม่มี horizontal scroll |
| B29 | A23,S07,B27 | BL: **วันลาเป็นช่วงวันที่** (SC-6) | GM เพิ่ม/แก้/ลบช่วงลาให้ตัวเองและเพื่อน GM; ไม่มีช่องเหตุผล; วันในช่วงลา `presence_status` เป็น “ลา” อัตโนมัติ (รวมวันสุดท้าย, Asia/Bangkok) และกติกาส่งงาน A3 เห็นว่าลา; หลังช่วงกลับ “ไม่ระบุ”; ไม่ทับค่าที่ GM ตั้งเองนอกช่วง; คนที่ไม่ใช่ GM อ่านไม่ได้ (Q-SC-15) |
| B30 | B27,A20 | BL: **รายชื่อช่าง** + เลือกช่างตอน “รอผู้รับเหมา” + ช่างประจำ PM (SC-7) | ฟอร์ม/รายการช่าง (ชื่อร้าน หมวด ที่อยู่ โทร LINE FB ผู้ติดต่อ Link หมายเหตุ); “รอผู้รับเหมา” เลือกจากรายชื่อหรือพิมพ์เอง; สรุปสาธารณะยัง “ผู้รับเหมา” (D-S09-1) ไม่มีชื่อร้าน/เบอร์; ช่างที่ปิดไม่โผล่ในตัวเลือกใหม่ |
| B31 | B14,B20 | BL: CSV parser ภาระประจำ + PM tests-first (SC-3) | แท็บ “รายการส่ง report/ชำระ”: period ข้อความเก็บดิบ ไม่เดาวัน; แท็บ “แผนบำรุงรักษา” ตารางรายสัปดาห์ทั้งปี → เสนอความถี่ (ทุกสัปดาห์/เดือน/3 เดือน/6 เดือน/ปี/ไม่สม่ำเสมอ) และวันถัดไปจากสัปดาห์ที่มีเครื่องหมาย; ไม่สม่ำเสมอไม่เดา |
| B32 | B31,B21 | BL+GM Admin: preview นำเข้าภาระประจำ + PM | Admin กำหนดวัน/ช่วงวันของแต่ละ period เอง; PM ยืนยันความถี่และวันถัดไปทีละรายการ (แก้ได้ก่อนยืนยัน); ไม่บันทึกก่อนยืนยัน; จับคู่สถานที่/บริเวณ/ช่าง |
| B33 | A23,A19,B16,B27 | BL: **หน้าแรก GM desktop: กล่องสรุป + feed + `planned_date`** (SC-5) | `gm_task` มี `planned_date` ไม่บังคับ (contract + ฟอร์มสร้าง/แก้); กล่อง 5 กล่อง ตัวเลขตรงกับแหล่ง (แจ้งซ่อมค้าง, รอผู้อื่น, ต่ออายุใกล้ถึง/เลยกำหนด, PM สัปดาห์นี้/เลยกำหนด, ไม่ขยับ/เกินเวลา); เลยกำหนดเป็นสีแดง (SC-2); feed ความเคลื่อนไหวล่าสุด bounded + แบ่งหน้า ไม่เปิดข้อมูลลับเกินสิทธิ์; 1366/1440 ครบในจอแรก มือถือตาม Q-SC-16 |
| B34 | B33,B29,B18 | BL: **ปฏิทินรายเดือน** หน้าแรก GM (SC-5) | แสดง PM, กำหนดต่ออายุและภาระประจำ, งานที่มี `planned_date`, วันลา; สีแยกต่อคน + มีข้อความ/ไอคอนไม่พึ่งสีอย่างเดียว; เฉพาะทีม GM (Q-SC-4); query จำกัดช่วงเดือน; เปลี่ยนเดือนไม่โหลดทั้งปี |
| B35 | B27,B34 | BL: **ผังสถานที่** (SC-8 — ท้ายสุดของด่าน B) | GM อัปโหลด/แทนรูปหรือ PDF ต่อสถานที่ผ่าน Storage path เดิม (signed URL อายุสั้น); GM ดูได้อย่างเดียว; คนอื่นไม่ได้ลิงก์; ขนาด/ชนิดไฟล์ตรวจ server |
| B25 | B02,B05,B06,B08,B09,B10,B11,B12,B13,B24,B28,B29,B30,B32,B33,B34,B35 | BL: B release regression/load/cost | scopes/calendar/cohort/งานตามรอบ 3 แบบ 200 รายการ + ช่าง;3 GM live; bounded query; disable providers; loops/usage budget; complete B checklist; B10/B12/B13 ออกจาก deps ถ้า Q-SC-5 ยืนยันย้าย |
| B26 | B25 | Tim+GM Admin: B release/metrics handoff | admin prod deploy rollback/smoke; actual assumptions confirmed; SLA/Scorecard metrics start; before Q4 deadline |

## Milestone ท้าย — หลัง B, ไม่เป็น release gate

| ID | Depends | งาน/เจ้าของ | Acceptance test |
|---|---|---|---|
| T01 | B26 | **(รอยืนยัน: เสนอย้าย Phase 2 — SC-9 / Q-SC-5; ยังไม่ลบ)** BL+GM: label mapping/secret review fixtures | type `gm_task`, source `trello`; external involved mustweb; labels-only no Custom Fields |
| T02 | T01 | **(รอยืนยัน: เสนอย้าย Phase 2 — SC-9 / Q-SC-5; ยังไม่ลบ)** BL: webhook/catch-up idempotent readonly projection | signature/secret validation; duplicate event one update; web actions disabled; secret never public |
| T03 | T02 | **(รอยืนยัน: เสนอย้าย Phase 2 — SC-9 / Q-SC-5; ยังไม่ลบ)** BL+GM: Trello badge/openlink/UI smoke | readonly works; failure does not block repair; defer Phase 2 if time insufficient |

## DoD ทุก session

1. Acceptance ของแถวนั้นผ่านด้วย test ที่มีความหมาย; time/domain/Rules เขียน failing test ก่อน implementation ส่วน UI ใช้ E2E/visual ของพฤติกรรมจริง
2. ไม่ย้าย scope/เปลี่ยน key/ตัวเลขเกณฑ์โดยเงียบ; privacy/budget/layer invariants คงอยู่ ไม่มี credential/PII ใน repo/log/fixture
3. diff เล็ก review ได้, typecheck/build/unit ที่เกี่ยวข้องผ่าน; ถ้าเปลี่ยน Rules/ACL ทดสอบ Emulator matrix ถ้าเปลี่ยน UI ให้ตรวจขนาดจอที่เกี่ยวข้อง ไม่อ้าง prototype แทนระบบจริง
4. ระบุ test commands+ผล, limitations, migration/rollback ถ้ามี และ next task; dev deploy ทุกครั้งต้องแนบ usage-before / after, listener/unsubscribe/retry/loop check (P7-COST-01..03)
5. ถ้า prerequisite ไม่ผ่าน ให้จบด้วย blocker ที่ชัดเจนและทำเฉพาะงาน independent; provider approval ค้างใช้ disabled adapter ไม่ย้อนเอาบัญชีบุคคลมาใช้

Task เชิงเอกสาร `P7-DOC-*` ส่งมอบแล้วในชุดนี้ แต่ application tasks S/A/B/T ทั้งหมดเป็นแผน **ยังไม่ได้ implement หรือรัน application tests**
