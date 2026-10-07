# ACL matrix — ใครอ่าน/เขียนอะไรใน Firestore ได้ (client)

> ไฟล์นี้สร้างอัตโนมัติจาก `tests/rules/fixtures/acl-matrix.ts` ด้วย `npm run docs:acl-matrix` — ห้ามแก้ด้วยมือ; `tests/rules/fixtures/acl-matrix-doc.test.ts` ตรวจว่าเอกสารตรงกับ fixture เสมอ และ Rules tests (S10–S11) ใช้ fixture ชุดเดียวกัน

ที่มา: Part 6 §6.4/§6.5, C3, C4, C6, U1, A2, D-S06-4, D-S08-4, D-S09-1 ถึง D-S09-8

## หลักการ

- เอกสารนี้แสดง **เฉพาะสิ่งที่อนุญาต** ทุกอย่างที่ไม่อยู่ในเอกสาร = **ปฏิเสธ** (default deny) รวมถึง path ที่ไม่มีกติกา
- **การเขียนจาก client** (create / update / delete) ปฏิเสธทุก collection ทุก role — ทุกการเปลี่ยนแปลงผ่าน API ซึ่งตรวจสิทธิ์ด้วยกติกา domain ชุดเดียวกัน (Admin SDK ข้าม Rules)
- **อ่าน**: `get` = เปิด document หนึ่งรายการ, `list` = query ทั้ง collection โดยไม่กรอง (Rules ไม่กรองผลให้)
- บัญชีต้อง login ด้วย Google อีเมล @tdfb.co ที่ verified และ `access/{uid}.enabled` = true; role อ่านจาก `access/{uid}` ไม่ใช่ custom claim
- ขนาด matrix: 15 role × 40 collection/path × 5 operation = 3000 ช่อง อนุญาต 287 ช่อง ที่เหลือปฏิเสธ

## สิทธิ์พื้นฐาน: ทุกบัญชีที่ใช้งานได้

บัญชีที่ใช้งานได้ (active) = `requester`, `related_person`, `watcher`, `waiting_party`, `employee`, `viewer`, `viewer_related`, `viewer_unconfirmed`, `team_label_member`, `gm_staff`, `gm_admin` ทุกคนได้สิทธิ์ชุดนี้เหมือนกัน

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `request_summaries/{id} (งานไม่ลับ)` | get, list | — | สรุปสาธารณะของงานไม่ลับ: ทุกบัญชีที่ใช้งานได้ (§6.5) |
| `request_summaries/{id} ของงานลับ (ไม่มี document)` | get, list | — | งานลับไม่มี document ที่นี่ เปิดแล้วไม่พบอะไร (กติกาเดียวกับ collection นี้) |
| `people_picker/{person_id}` | get, list | — | ชื่อและทีมสำหรับช่องเลือกคน: ทุกบัญชีที่ใช้งานได้ |
| `access/{uid ของตัวเอง}` | get | — | access ของตัวเองเท่านั้น (บัญชีที่ปิดใช้งานก็อ่านได้ เพื่อให้หน้าเว็บบอกว่าถูกปิด, D-S09-6) |
| `gm_profile_summaries/{person_id}` | get, list | — | สถานะที่อยู่/งานที่กำลังทำของ GM (งานลับแสดง “งานภายใน”): ทุกบัญชีที่ใช้งานได้ |
| `user_state/{person_id ของตัวเอง}/requests/{id}` | get, list | — | สถานะอ่านแล้วของตัวเองเท่านั้น |
| `board_counters/public` | get, list | — | ตัวเลข “งานภายใน X รายการ” (งานลับที่ยังเปิด, D-S09-4): ทุกบัญชีที่ใช้งานได้ |
| `locations/{id}` | get, list | — | ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4) |
| `areas/{id}` | get, list | — | ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4) |
| `qr_codes/{id}` | get, list | — | ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4) |
| `content_pages/{id}` | get, list | — | ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4) |
| `announcements/{id}` | get, list | — | ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4) |

## ตาม role

### ผู้ขอของงานตัวอย่าง (`requester`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน (ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get | — | รายละเอียดงานลับ: GM, ผู้ขอ, related; Viewer ต้องได้รับการยืนยันสิทธิ์งานลับแล้ว (D-S09-2) |

### related person ของงานตัวอย่าง (`related_person`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน (ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get | — | รายละเอียดงานลับ: GM, ผู้ขอ, related; Viewer ต้องได้รับการยืนยันสิทธิ์งานลับแล้ว (D-S09-2) |

### ผู้แจ้งเพิ่ม (watcher) อ่านได้เฉพาะสรุป (`watcher`)

ได้เฉพาะสิทธิ์พื้นฐาน ไม่มีอะไรเพิ่ม

### ผู้รับแจ้งของช่วงรอ (ถูกเพิ่มเป็น related ตาม C3) (`waiting_party`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน (ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get | — | รายละเอียดงานลับ: GM, ผู้ขอ, related; Viewer ต้องได้รับการยืนยันสิทธิ์งานลับแล้ว (D-S09-2) |

### พนักงานทั่วไปที่ไม่เกี่ยวกับงาน (`employee`)

ได้เฉพาะสิทธิ์พื้นฐาน ไม่มีอะไรเพิ่ม

### Viewer ที่ไม่เกี่ยวกับงาน (`viewer`)

ได้เฉพาะสิทธิ์พื้นฐาน ไม่มีอะไรเพิ่ม

### Viewer ที่ถูกเพิ่มเป็น related ชัดเจน และยืนยันสิทธิ์งานลับแล้ว (Part 2 F05, C3, D-S09-2) (`viewer_related`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน (ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get | — | รายละเอียดงานลับ: GM, ผู้ขอ, related; Viewer ต้องได้รับการยืนยันสิทธิ์งานลับแล้ว (D-S09-2) |

### Viewer ที่เป็น related แต่ยังไม่ได้ยืนยันสิทธิ์งานลับ (D-S09-2) (`viewer_unconfirmed`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน (ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; list ทั้ง collection ได้เฉพาะ GM |

### คนในทีมที่ติด team_labels แต่ไม่ใช่ related (C4) (`team_label_member`)

ได้เฉพาะสิทธิ์พื้นฐาน ไม่มีอะไรเพิ่ม

### GM Staff (`gm_staff`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get, list | — | รายละเอียดงาน (ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get, list | — | รายละเอียดงานลับ: GM, ผู้ขอ, related; Viewer ต้องได้รับการยืนยันสิทธิ์งานลับแล้ว (D-S09-2) |
| `gm_request_summaries/{id}` | get, list | — | สรุปของ GM รวมงานลับ/stale: GM เท่านั้น |
| `gm_request_details/{id}` | get, list | — | รายชื่อ watcher และหมายเหตุธงลับ: GM เท่านั้น (D-S09-5) |
| `renewal_items/{id}` | get, list | — | ทะเบียนต่ออายุ: GM เท่านั้น |
| `renewal_items/{id}/cycles/{cycle_id}` | get, list | — | รอบต่ออายุ: GM เท่านั้น |

### GM Admin (`gm_admin`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get, list | — | รายละเอียดงาน (ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get, list | — | รายละเอียดงานลับ: GM, ผู้ขอ, related; Viewer ต้องได้รับการยืนยันสิทธิ์งานลับแล้ว (D-S09-2) |
| `gm_request_summaries/{id}` | get, list | — | สรุปของ GM รวมงานลับ/stale: GM เท่านั้น |
| `gm_request_details/{id}` | get, list | — | รายชื่อ watcher และหมายเหตุธงลับ: GM เท่านั้น (D-S09-5) |
| `renewal_items/{id}` | get, list | — | ทะเบียนต่ออายุ: GM เท่านั้น |
| `renewal_items/{id}/cycles/{cycle_id}` | get, list | — | รอบต่ออายุ: GM เท่านั้น |

### บัญชีที่ปิดใช้งาน (เคยเป็น related และ GM) (`inactive`)

ไม่ได้สิทธิ์พื้นฐาน ได้เฉพาะ:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `access/{uid ของตัวเอง}` | get | — | access ของตัวเองเท่านั้น (บัญชีที่ปิดใช้งานก็อ่านได้ เพื่อให้หน้าเว็บบอกว่าถูกปิด, D-S09-6) |

### บัญชีนอก @tdfb.co (แม้มี access document) (`outsider`)

ไม่มีสิทธิ์อ่านหรือเขียนอะไรเลย — ปฏิเสธทั้งหมด

### อีเมล @tdfb.co ที่ยังไม่ verified (`unverified`)

ไม่มีสิทธิ์อ่านหรือเขียนอะไรเลย — ปฏิเสธทั้งหมด

### ไม่ได้ login (`anonymous`)

ไม่มีสิทธิ์อ่านหรือเขียนอะไรเลย — ปฏิเสธทั้งหมด

## งานลับ — ใครเห็นอะไรได้บ้าง

งานลับไม่มี `request_summaries/{id}` เลย (C6, C11) คนทั่วไปเห็นเพียงตัวเลข “งานภายใน X รายการ” จาก `board_counters/public` ซึ่งนับเฉพาะงานลับที่ยังเปิด (D-S09-4) ไม่มีชื่อ เลขงาน หรือ ID

| Role | รายละเอียด `requests/{id}` | สรุปของ GM | รายชื่อ watcher / หมายเหตุธงลับ | ตัวเลข “งานภายใน” |
|---|---|---|---|---|
| ผู้ขอของงานตัวอย่าง (`requester`) | ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| related person ของงานตัวอย่าง (`related_person`) | ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| ผู้แจ้งเพิ่ม (watcher) อ่านได้เฉพาะสรุป (`watcher`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| ผู้รับแจ้งของช่วงรอ (ถูกเพิ่มเป็น related ตาม C3) (`waiting_party`) | ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| พนักงานทั่วไปที่ไม่เกี่ยวกับงาน (`employee`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| Viewer ที่ไม่เกี่ยวกับงาน (`viewer`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| Viewer ที่ถูกเพิ่มเป็น related ชัดเจน และยืนยันสิทธิ์งานลับแล้ว (Part 2 F05, C3, D-S09-2) (`viewer_related`) | ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| Viewer ที่เป็น related แต่ยังไม่ได้ยืนยันสิทธิ์งานลับ (D-S09-2) (`viewer_unconfirmed`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| คนในทีมที่ติด team_labels แต่ไม่ใช่ related (C4) (`team_label_member`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| GM Staff (`gm_staff`) | ได้ | ได้ | ได้ | ได้ |
| GM Admin (`gm_admin`) | ได้ | ได้ | ได้ | ได้ |
| บัญชีที่ปิดใช้งาน (เคยเป็น related และ GM) (`inactive`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| บัญชีนอก @tdfb.co (แม้มี access document) (`outsider`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| อีเมล @tdfb.co ที่ยังไม่ verified (`unverified`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ |
| ไม่ได้ login (`anonymous`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ไม่ได้ |

## Watcher — เห็นอะไรได้บ้าง

watcher คือคนที่กด “แจ้งปัญหาเดียวกัน” กับงานแจ้งซ่อมที่ไม่ลับ (U1) ได้เพียงสรุปสาธารณะ ไม่ได้สิทธิ์รายละเอียด

อ่านได้:

- `request_summaries/{id} (งานไม่ลับ)` (get, list) — สรุปสาธารณะของงานไม่ลับ: ทุกบัญชีที่ใช้งานได้ (§6.5)
- `request_summaries/{id} ของงานลับ (ไม่มี document)` (get, list) — งานลับไม่มี document ที่นี่ เปิดแล้วไม่พบอะไร (กติกาเดียวกับ collection นี้)
- `people_picker/{person_id}` (get, list) — ชื่อและทีมสำหรับช่องเลือกคน: ทุกบัญชีที่ใช้งานได้
- `access/{uid ของตัวเอง}` (get) — access ของตัวเองเท่านั้น (บัญชีที่ปิดใช้งานก็อ่านได้ เพื่อให้หน้าเว็บบอกว่าถูกปิด, D-S09-6)
- `gm_profile_summaries/{person_id}` (get, list) — สถานะที่อยู่/งานที่กำลังทำของ GM (งานลับแสดง “งานภายใน”): ทุกบัญชีที่ใช้งานได้
- `user_state/{person_id ของตัวเอง}/requests/{id}` (get, list) — สถานะอ่านแล้วของตัวเองเท่านั้น
- `board_counters/public` (get, list) — ตัวเลข “งานภายใน X รายการ” (งานลับที่ยังเปิด, D-S09-4): ทุกบัญชีที่ใช้งานได้
- `locations/{id}` (get, list) — ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4)
- `areas/{id}` (get, list) — ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4)
- `qr_codes/{id}` (get, list) — ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4)
- `content_pages/{id}` (get, list) — ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4)
- `announcements/{id}` (get, list) — ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4)

อ่านไม่ได้ (ตัวอย่างที่เกี่ยวกับงานที่ติดตาม):

- `requests/{id} (งานไม่ลับ)` — รายละเอียดงาน (ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; list ทั้ง collection ได้เฉพาะ GM
- `requests/{id}/history/{event_id}` — history ผ่าน API ตรวจ parent ACL เท่านั้น
- `requests/{id}/comments/{id}` — คอมเมนต์ผ่าน API เท่านั้น
- `gm_request_summaries/{id}` — สรุปของ GM รวมงานลับ/stale: GM เท่านั้น
- `gm_request_details/{id}` — รายชื่อ watcher และหมายเหตุธงลับ: GM เท่านั้น (D-S09-5)

จำนวน “มีผู้แจ้งเพิ่ม X คน” อยู่ใน `request_summaries/{id}` เป็นตัวเลข `watcher_count` เท่านั้น รายชื่อ watcher อยู่ใน `gm_request_details/{id}` ที่ GM อ่านได้คนเดียว (D-S09-5)
