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
| A23 | A09,A06,S07 | BL: home focus/presence/company contact FAQ | pinned→latest `in_progress`→empty; secret fallback; leave/end; live focus; Admin edit static FAQ; confirm banner |
| A24 | A19,A23,A02 | BL: notification degraded-mode + privacy transitions E2E | Slack only/Gmail only/neither approved; secret flip removes public summary/search/focus/cache epoch; no duplicate grants |
| A25 | A15,A20,A22,A24 | BL+GM: mobile/accessibility/regression gate | 4 viewports; F1–F6/P1–P2/reduced motion/contrast; year-end unit cases; console error 0; whole flow request/watch/secret |
| A26 | A25,A05,A10,A11 | Tim+BL: dev staging/pilot release rehearsal | deploy dev guard; Firestore graph/loops/cost; rollback; daily export/restore dev; cloud smoke compiled app |
| A27 | A26,W0 A blockers closed | GM Admin+Tim: pilot approval/onboarding/baseline | documented A gate;5 locations QR domain; before baseline+calendar; notification approvals optional; admin prod deploy smoke |

## ด่าน B — W8–W11; W12 buffer ถึง 31 ธันวาคม 2569

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
| B10 | A17,A21 | BL: document request/intake simple forms | US-04; contract/person secret default company doc non-secret; safe title; attachments restricted |
| B11 | A19,A24 | BL: request number/title prefix search + paginated all | summary public only; GM private index authorized; normalized prefix bounded; expired 7 day view pagination not live; no external search |
| B12 | A09 | BL: announcements/Admin editing | role permission; public safe content; link/deactivated expiry; no external CMS |
| B13 | A09,A17 | BL: PWA shell/install/offline behavior | static cache only; logout clears user state; private payload not cached; offline writes not `queued` unsafely; repair retry clear |
| B14 | S04,S05,A01 | BL: renewal item/cycle domain tests-first | lead 90/60/45/30+certificate confirmed; starts_on calendar;1 task/cycle; confidential contract; linked cycle identity |
| B15 | B14,A02 | BL: renewal start task generation + job keys | multiple ticks/concurrent/catch-up one `gm_task`; midnight holiday create but notify deferred; stale jobs no-op |
| B16 | B15 | BL: 30/7/overdue reminder rules/catch-up | actual overdue calendar state; notify 09 next business day; coalesce missed severity; no obsolete 30 after expiry |
| B17 | B14,A03 | BL: complete Renewal/stop Renewal transactions | new expiry required / valid later date; link optional; no-renew reason; generic close/cancel cannot bypass; one cycle advance |
| B18 | B14,B17,A09 | BL: GM renewal list/groups/form | GM-only; groups date boundary;200 items paginated; company/site calendar; place/owner/Drive/original storage fields |
| B19 | B18,B17 | BL: renewal close/archived history UI | disabled until new expiry; no-renew reason required; atomic result; old cycle cannot reopen ordinarily |
| B20 | B14 | BL: CSV parser/date normalization tests-first | BOM/Thai headers; BE 2570→2027; invalid/ambiguous/Excel serial report notguess; raw / normalized both |
| B21 | B20,B18 | BL+Gorawit: CSV preview/explicit confirmation UI | row errors shown; converted date confirm before write; select valid-only explicit; server URL not fetched |
| B22 | B21,A01 | BL: CSV import chunks/idempotency/resume | filehash+row key retry; partial fail resume only missing; validated items no duplicate; bounded 100 chunks assumption |
| B23 | B16,B17,B04 | BL: renewal Scorecard aggregate/CSV | `renewal_pending` distinct active current cycles start<=today unresolved; overdue subset; item count still correct if job fails; Viewer excludes secret |
| B24 | B23,B06,B18 | BL+GM: renewal tile/source definition + end-to-end | real number replaces unconnected only renewal tile; definition shown; import→start→wait→respond→renew/newcycle/no-renew |
| B25 | B02,B05,B06,B08,B09,B10,B11,B12,B13,B24 | BL: B release regression/load/cost | scopes/calendar/cohort/200 renewals;3 GMlive;bounded query;disable providers; loops/usage budget; complete B checklist |
| B26 | B25 | Tim+GM Admin: B release/metrics handoff | admin prod deploy rollback/smoke; actual assumptions confirmed; SLA/Scorecard metrics start; before Q4 deadline |

## Milestone ท้าย — หลัง B, ไม่เป็น release gate

| ID | Depends | งาน/เจ้าของ | Acceptance test |
|---|---|---|---|
| T01 | B26 | BL+GM: label mapping/secret review fixtures | type `gm_task`, source `trello`; external involved mustweb; labels-only no Custom Fields |
| T02 | T01 | BL: webhook/catch-up idempotent readonly projection | signature/secret validation; duplicate event one update; web actions disabled; secret never public |
| T03 | T02 | BL+GM: Trello badge/openlink/UI smoke | readonly works; failure does not block repair; defer Phase 2 if time insufficient |

## DoD ทุก session

1. Acceptance ของแถวนั้นผ่านด้วย test ที่มีความหมาย; time/domain/Rules เขียน failing test ก่อน implementation ส่วน UI ใช้ E2E/visual ของพฤติกรรมจริง
2. ไม่ย้าย scope/เปลี่ยน key/ตัวเลขเกณฑ์โดยเงียบ; privacy/budget/layer invariants คงอยู่ ไม่มี credential/PII ใน repo/log/fixture
3. diff เล็ก review ได้, typecheck/build/unit ที่เกี่ยวข้องผ่าน; ถ้าเปลี่ยน Rules/ACL ทดสอบ Emulator matrix ถ้าเปลี่ยน UI ให้ตรวจขนาดจอที่เกี่ยวข้อง ไม่อ้าง prototype แทนระบบจริง
4. ระบุ test commands+ผล, limitations, migration/rollback ถ้ามี และ next task; dev deploy ทุกครั้งต้องแนบ usage-before / after, listener/unsubscribe/retry/loop check (P7-COST-01..03)
5. ถ้า prerequisite ไม่ผ่าน ให้จบด้วย blocker ที่ชัดเจนและทำเฉพาะงาน independent; provider approval ค้างใช้ disabled adapter ไม่ย้อนเอาบัญชีบุคคลมาใช้

Task เชิงเอกสาร `P7-DOC-*` ส่งมอบแล้วในชุดนี้ แต่ application tasks S/A/B/T ทั้งหมดเป็นแผน **ยังไม่ได้ implement หรือรัน application tests**
