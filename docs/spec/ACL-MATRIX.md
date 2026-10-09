# ACL matrix — ใครอ่าน/เขียนอะไรใน Firestore ได้ (client)

> ไฟล์นี้สร้างอัตโนมัติจาก `tests/rules/fixtures/acl-matrix.ts` ด้วย `npm run docs:acl-matrix` — ห้ามแก้ด้วยมือ; `tests/rules/fixtures/acl-matrix-doc.test.ts` ตรวจว่าเอกสารตรงกับ fixture เสมอ และ Rules tests (S10–S11) ใช้ fixture ชุดเดียวกัน

ที่มา: Part 6 §6.4/§6.5/§6.10, C3, C4, C6, U1, A2, D-S06-4, D-S08-4, D-S09-1 ถึง D-S09-8, D-ACL-1 ถึง D-ACL-7, D-S10-1 ถึง D-S10-5, D-S11-1 ถึง D-S11-3, S12

## หลักการ

- เอกสารนี้แสดง **เฉพาะสิ่งที่อนุญาต** ทุกอย่างที่ไม่อยู่ในเอกสาร = **ปฏิเสธ** (default deny) รวมถึง path ที่ไม่มีกติกา
- **การเขียนจาก client** (create / update / delete) ปฏิเสธทุก collection ทุก role — ทุกการเปลี่ยนแปลงผ่าน API ซึ่งตรวจสิทธิ์ด้วยกติกา domain ชุดเดียวกัน (Admin SDK ข้าม Rules)
- **อ่าน**: `get` = เปิด document หนึ่งรายการ, `list` = query ทั้ง collection โดยไม่กรอง (Rules ไม่กรองผลให้) และ**ต้องมี limit ไม่เกิน 200** ไม่มี limit หรือเกินถูกปฏิเสธทุก collection (D-S10-4) หน้า “ดูทั้งหมด” แบ่งหน้าละ 50
- บัญชีต้อง login ด้วย Google อีเมล @tdfb.co ที่ verified (ตรวจหลังแปลงเป็นตัวพิมพ์เล็ก TDFB.CO จึงเป็นโดเมนเดียวกัน ส่วนโดเมนหน้าตาคล้ายถูกปฏิเสธ, D-S10-5) และ `access/{uid}.enabled` = true; role อ่านจาก `access/{uid}` ไม่ใช่ custom claim
- ขนาด matrix: 16 role × 45 collection/path × 5 operation = 3600 ช่อง อนุญาต 279 ช่อง ที่เหลือปฏิเสธ

## สิทธิ์พื้นฐาน: ทุกบัญชีที่ใช้งานได้

บัญชีที่ใช้งานได้ (active) = `requester`, `related_person`, `related_unconfirmed`, `watcher`, `waiting_party`, `employee`, `viewer`, `viewer_related`, `viewer_unconfirmed`, `team_label_member`, `gm_staff`, `gm_admin` ทุกคนได้สิทธิ์ชุดนี้เหมือนกัน

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `request_summaries/{id} (งานไม่ลับ)` | get, list | — | สรุปสาธารณะของงานไม่ลับ: ทุกบัญชีที่ใช้งานได้ (§6.5) |
| `request_summaries/{id} ของงานลับ (ไม่มี document)` | get, list | — | งานลับไม่มี document ที่นี่ เปิดแล้วไม่พบอะไร (กติกาเดียวกับ collection นี้) |
| `access/{uid ของตัวเอง}` | get | — | access ของตัวเองเท่านั้น (บัญชีที่ปิดใช้งานก็อ่านได้ เพื่อให้หน้าเว็บบอกว่าถูกปิด, D-S09-6) |
| `gm_profile_summaries/{person_id}` | get, list | — | สถานะที่อยู่/งานที่กำลังทำของ GM (งานลับแสดง “งานภายใน”): ทุกบัญชีที่ใช้งานได้ |
| `user_state/{person_id ของตัวเอง}/requests/{id}` | get, list | — | สถานะอ่านแล้วของตัวเองเท่านั้น |
| `board_counters/public` | get | — | ตัวเลข “งานภายใน X รายการ” (งานลับที่ยังเปิด, D-S09-4): get document public เท่านั้น ไม่ list (D-ACL-3) |
| `locations/{id}` | get, list | — | ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4) |
| `areas/{id}` | get, list | — | ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4) |
| `qr_codes/{id}` | get, list | — | ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4) |
| `content_pages/{id}` | get, list | — | ติดต่อ GM/FAQ และประกาศ: ทุกบัญชีที่ใช้งานได้ (§6.4); spec ไม่มีสถานะฉบับร่าง/ยังไม่เผยแพร่ จึงไม่มีอะไรต้องซ่อน (D-ACL-4) |
| `announcements/{id}` | get, list | — | ติดต่อ GM/FAQ และประกาศ: ทุกบัญชีที่ใช้งานได้ (§6.4); spec ไม่มีสถานะฉบับร่าง/ยังไม่เผยแพร่ จึงไม่มีอะไรต้องซ่อน (D-ACL-4) |

## ตาม role

### ผู้ขอของงานตัวอย่าง (`requester`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน พร้อมคู่ person_id + display_name ของผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related (D-S10-1, D-S11-1; ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; ถอด related แล้วอ่านไม่ได้ทันที (FU-03); list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get | — | รายละเอียดงานลับ: GM, ผู้ขอ และคนใน confidential_grant_ids เท่านั้น ทุก role (D-ACL-2) |

### related person ของงานตัวอย่าง และยืนยันสิทธิ์งานลับแล้ว (D-ACL-2) (`related_person`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน พร้อมคู่ person_id + display_name ของผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related (D-S10-1, D-S11-1; ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; ถอด related แล้วอ่านไม่ได้ทันที (FU-03); list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get | — | รายละเอียดงานลับ: GM, ผู้ขอ และคนใน confidential_grant_ids เท่านั้น ทุก role (D-ACL-2) |

### related person ที่ไม่ได้รับการยืนยันให้คงสิทธิ์ตอนติดธงลับ (D-ACL-2) (`related_unconfirmed`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน พร้อมคู่ person_id + display_name ของผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related (D-S10-1, D-S11-1; ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; ถอด related แล้วอ่านไม่ได้ทันที (FU-03); list ทั้ง collection ได้เฉพาะ GM |

### ผู้แจ้งเพิ่ม (watcher) อ่านได้เฉพาะสรุป (`watcher`)

ได้เฉพาะสิทธิ์พื้นฐาน ไม่มีอะไรเพิ่ม

### ผู้รับแจ้งของช่วงรอ (ถูกเพิ่มเป็น related ตาม C3) (`waiting_party`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน พร้อมคู่ person_id + display_name ของผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related (D-S10-1, D-S11-1; ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; ถอด related แล้วอ่านไม่ได้ทันที (FU-03); list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get | — | รายละเอียดงานลับ: GM, ผู้ขอ และคนใน confidential_grant_ids เท่านั้น ทุก role (D-ACL-2) |

### พนักงานทั่วไปที่ไม่เกี่ยวกับงาน (`employee`)

ได้เฉพาะสิทธิ์พื้นฐาน ไม่มีอะไรเพิ่ม

### Viewer ที่ไม่เกี่ยวกับงาน (`viewer`)

ได้เฉพาะสิทธิ์พื้นฐาน ไม่มีอะไรเพิ่ม

### Viewer ที่ถูกเพิ่มเป็น related ชัดเจน และยืนยันสิทธิ์งานลับแล้ว (Part 2 F05, C3, D-ACL-2) (`viewer_related`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน พร้อมคู่ person_id + display_name ของผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related (D-S10-1, D-S11-1; ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; ถอด related แล้วอ่านไม่ได้ทันที (FU-03); list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get | — | รายละเอียดงานลับ: GM, ผู้ขอ และคนใน confidential_grant_ids เท่านั้น ทุก role (D-ACL-2) |

### Viewer ที่เป็น related แต่ยังไม่ได้ยืนยันสิทธิ์งานลับ (D-ACL-2) (`viewer_unconfirmed`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get | — | รายละเอียดงาน พร้อมคู่ person_id + display_name ของผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related (D-S10-1, D-S11-1; ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; ถอด related แล้วอ่านไม่ได้ทันที (FU-03); list ทั้ง collection ได้เฉพาะ GM |

### คนในทีมที่ติด team_labels แต่ไม่ใช่ related (C4) (`team_label_member`)

ได้เฉพาะสิทธิ์พื้นฐาน ไม่มีอะไรเพิ่ม

### GM Staff (`gm_staff`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get, list | — | รายละเอียดงาน พร้อมคู่ person_id + display_name ของผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related (D-S10-1, D-S11-1; ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; ถอด related แล้วอ่านไม่ได้ทันที (FU-03); list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get, list | — | รายละเอียดงานลับ: GM, ผู้ขอ และคนใน confidential_grant_ids เท่านั้น ทุก role (D-ACL-2) |
| `gm_request_summaries/{id}` | get, list | — | สรุปของ GM รวมงานลับ/stale: GM เท่านั้น |
| `gm_request_details/{id}` | get, list | — | รายชื่อ watcher และหมายเหตุธงลับ: GM เท่านั้น (D-S09-5) |
| `people_picker/{person_id}` | get, list | — | ชื่อ อีเมล และทีมสำหรับช่องเลือกคน: GM เท่านั้น เพราะช่องเลือกคนมีแค่ในงานของ GM (D-ACL-1) |
| `renewal_items/{id}` | get, list | — | ทะเบียนต่ออายุ: GM เท่านั้น |
| `renewal_items/{id}/cycles/{cycle_id}` | get, list | — | รอบต่ออายุ: GM เท่านั้น |

### GM Admin (`gm_admin`)

สิทธิ์พื้นฐาน และเพิ่ม:

| Collection / path | อ่าน | เขียน | เงื่อนไข |
|---|---|---|---|
| `requests/{id} (งานไม่ลับ)` | get, list | — | รายละเอียดงาน พร้อมคู่ person_id + display_name ของผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related (D-S10-1, D-S11-1; ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; ถอด related แล้วอ่านไม่ได้ทันที (FU-03); list ทั้ง collection ได้เฉพาะ GM |
| `requests/{id} (งานลับ)` | get, list | — | รายละเอียดงานลับ: GM, ผู้ขอ และคนใน confidential_grant_ids เท่านั้น ทุก role (D-ACL-2) |
| `gm_request_summaries/{id}` | get, list | — | สรุปของ GM รวมงานลับ/stale: GM เท่านั้น |
| `gm_request_details/{id}` | get, list | — | รายชื่อ watcher และหมายเหตุธงลับ: GM เท่านั้น (D-S09-5) |
| `people_picker/{person_id}` | get, list | — | ชื่อ อีเมล และทีมสำหรับช่องเลือกคน: GM เท่านั้น เพราะช่องเลือกคนมีแค่ในงานของ GM (D-ACL-1) |
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

รายละเอียดงานลับอ่านได้เฉพาะ GM, ผู้ขอ และคนใน `confidential_grant_ids` — ทุก role ไม่ใช่แค่ Viewer (D-ACL-2) คนที่ถูกเพิ่มเป็น related ในงานลับพร้อมการยืนยันแยก (C3) ถูกบันทึกใน `confidential_grant_ids`; เมื่องานทั่วไปถูกติดธงลับภายหลัง GM ต้องยืนยันรายชื่อ related เดิมว่าจะคงสิทธิ์ใคร คนที่ไม่ได้รับการยืนยันยังอยู่ในรายชื่อ related แต่อ่านรายละเอียดไม่ได้

| Role | รายละเอียด `requests/{id}` | สรุปของ GM | รายชื่อ watcher / หมายเหตุธงลับ | ตัวเลข “งานภายใน” |
|---|---|---|---|---|
| ผู้ขอของงานตัวอย่าง (`requester`) | ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| related person ของงานตัวอย่าง และยืนยันสิทธิ์งานลับแล้ว (D-ACL-2) (`related_person`) | ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| related person ที่ไม่ได้รับการยืนยันให้คงสิทธิ์ตอนติดธงลับ (D-ACL-2) (`related_unconfirmed`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| ผู้แจ้งเพิ่ม (watcher) อ่านได้เฉพาะสรุป (`watcher`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| ผู้รับแจ้งของช่วงรอ (ถูกเพิ่มเป็น related ตาม C3) (`waiting_party`) | ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| พนักงานทั่วไปที่ไม่เกี่ยวกับงาน (`employee`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| Viewer ที่ไม่เกี่ยวกับงาน (`viewer`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| Viewer ที่ถูกเพิ่มเป็น related ชัดเจน และยืนยันสิทธิ์งานลับแล้ว (Part 2 F05, C3, D-ACL-2) (`viewer_related`) | ได้ | ไม่ได้ | ไม่ได้ | ได้ |
| Viewer ที่เป็น related แต่ยังไม่ได้ยืนยันสิทธิ์งานลับ (D-ACL-2) (`viewer_unconfirmed`) | ไม่ได้ | ไม่ได้ | ไม่ได้ | ได้ |
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
- `access/{uid ของตัวเอง}` (get) — access ของตัวเองเท่านั้น (บัญชีที่ปิดใช้งานก็อ่านได้ เพื่อให้หน้าเว็บบอกว่าถูกปิด, D-S09-6)
- `gm_profile_summaries/{person_id}` (get, list) — สถานะที่อยู่/งานที่กำลังทำของ GM (งานลับแสดง “งานภายใน”): ทุกบัญชีที่ใช้งานได้
- `user_state/{person_id ของตัวเอง}/requests/{id}` (get, list) — สถานะอ่านแล้วของตัวเองเท่านั้น
- `board_counters/public` (get) — ตัวเลข “งานภายใน X รายการ” (งานลับที่ยังเปิด, D-S09-4): get document public เท่านั้น ไม่ list (D-ACL-3)
- `locations/{id}` (get, list) — ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4)
- `areas/{id}` (get, list) — ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4)
- `qr_codes/{id}` (get, list) — ข้อมูลอ้างอิง: ทุกบัญชีที่ใช้งานได้ (§6.4)
- `content_pages/{id}` (get, list) — ติดต่อ GM/FAQ และประกาศ: ทุกบัญชีที่ใช้งานได้ (§6.4); spec ไม่มีสถานะฉบับร่าง/ยังไม่เผยแพร่ จึงไม่มีอะไรต้องซ่อน (D-ACL-4)
- `announcements/{id}` (get, list) — ติดต่อ GM/FAQ และประกาศ: ทุกบัญชีที่ใช้งานได้ (§6.4); spec ไม่มีสถานะฉบับร่าง/ยังไม่เผยแพร่ จึงไม่มีอะไรต้องซ่อน (D-ACL-4)

อ่านไม่ได้ (ตัวอย่างที่เกี่ยวกับงานที่ติดตาม):

- `requests/{id} (งานไม่ลับ)` — รายละเอียดงาน พร้อมคู่ person_id + display_name ของผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related (D-S10-1, D-S11-1; ไม่มีรายชื่อ watcher/หมายเหตุธงลับ): GM, ผู้ขอ, related รวมฝ่ายที่รอ; ถอด related แล้วอ่านไม่ได้ทันที (FU-03); list ทั้ง collection ได้เฉพาะ GM
- `requests/{id}/history/{event_id}` — history ผ่าน API ตรวจ parent ACL เท่านั้น
- `requests/{id}/comments/{id}` — คอมเมนต์ผ่าน API เท่านั้น
- `gm_request_summaries/{id}` — สรุปของ GM รวมงานลับ/stale: GM เท่านั้น
- `gm_request_details/{id}` — รายชื่อ watcher และหมายเหตุธงลับ: GM เท่านั้น (D-S09-5)

จำนวน “มีผู้แจ้งเพิ่ม X คน” อยู่ใน `request_summaries/{id}` เป็นตัวเลข `watcher_count` เท่านั้น รายชื่อ watcher อยู่ใน `gm_request_details/{id}` ที่ GM อ่านได้คนเดียว (D-S09-5)

## Storage

รูปและไฟล์แนบเข้าถึงผ่าน API เท่านั้น (Part 6 §6.10, D-ACL-5):

- client อ่าน เขียน list หรือลบ object ใน Storage ผ่าน Firebase SDK ไม่ได้ทุก role (`infra/storage.rules` ปฏิเสธทั้งหมด) — ทดสอบใน Rules tests ทุก subject × ตัวอย่าง path
- bucket เป็น private และ uniform bucket-level access ไม่มี public ACL และไม่ใช้ Firebase download-token URL อายุยาว (§6.10)
- ดูรูป/ไฟล์: API ตรวจ ACL ปัจจุบันของงาน (หรือ contribution ของตัวเองสำหรับ watcher) ทุกครั้งที่ขอลิงก์ แล้วออก **signed URL แบบ GET เฉพาะ object นั้น อายุสั้น 5 นาที** (Part 6 §6.10, D-S10-3) เป็น bearer จนหมดอายุ จึงมี revoke window ไม่เกินอายุลิงก์; หน้าเว็บขอ URL ใหม่เองเมื่อหมดอายุ; ห้าม log URL; response เป็น private, no-store
- อัปโหลด: browser ส่งไฟล์ตรงไป Storage ไม่ผ่าน API ทั้งไฟล์ ด้วย **signed URL แบบ PUT เฉพาะ object อายุ 15 นาที** (D-S10-3: รูปย่อแล้วไฟล์เล็ก เผื่อเน็ตช้าที่คลังและโรงงาน) ที่ API ออกให้หลังตรวจสิทธิ์ ผูก actor + request/contribution จำกัดขนาด/ชนิด เป็นสถานะ pending
- pending ไม่เปิดให้ผู้อื่น; server finalize ตรวจขนาดจริงและ decode ภาพก่อนเปิดอ่าน; orphan ลบหลัง 24 ชม. ผ่าน cleanup เดิม; เดา path ไม่ได้สิทธิ์
- ไม่ persistent-cache รูปหรือรายละเอียดลับใน PWA
- ทดสอบ upload/finalize/signed URL กับ path ของคนอื่นใน S12 (API/Storage authorization emulator)

ตัวอย่าง path ที่ Rules tests ยืนยันว่าปฏิเสธทุก role: `requests/req-acl-general/attachments/att-acl-1.jpg`, `requests/req-acl-secret/attachments/att-acl-2.jpg`, `pending/uid-requester/upload-1.jpg`, `contributions/req-acl-general/acl.watcher@tdfb.co/photo-1.jpg`, `renewals/ri-1/document.pdf`, `unknown/path.bin`

## API (Admin SDK) — ใครเรียก endpoint อ่านข้อมูล/ไฟล์ได้

API ใช้ Admin SDK จึงข้าม Rules ทุก endpoint ตรวจสิทธิ์เอง: ตรวจ ID token (Google, @tdfb.co หลัง lower(), verified) และอ่าน `access/{uid}` ใหม่ทุกคำขอ แล้วใช้กติกา domain ชุดเดียวกับ Rules; งานที่อ่านไม่ได้ตอบ 404 เหมือนไม่มีงาน — `tests/emulator/api-access.test.ts` ทดสอบทุก role × ทุก endpoint ตามตารางนี้ (`tests/rules/fixtures/api-matrix.ts`)

| Endpoint | ใครเรียกได้ | เงื่อนไข |
|---|---|---|
| `request_detail.general` | `requester`, `related_person`, `related_unconfirmed`, `waiting_party`, `viewer_related`, `viewer_unconfirmed`, `gm_staff`, `gm_admin` | รายละเอียดงาน (งานไม่ลับ) |
| `request_detail.confidential` | `requester`, `related_person`, `waiting_party`, `viewer_related`, `gm_staff`, `gm_admin` | รายละเอียดงานลับ: GM, ผู้ขอ, grant (D-ACL-2) |
| `history.general` | `requester`, `related_person`, `related_unconfirmed`, `waiting_party`, `viewer_related`, `viewer_unconfirmed`, `gm_staff`, `gm_admin` | history ตามสิทธิ์รายละเอียดของงาน |
| `history.confidential` | `requester`, `related_person`, `waiting_party`, `viewer_related`, `gm_staff`, `gm_admin` | history ของงานลับ |
| `waiting_intervals.general` | `requester`, `related_person`, `related_unconfirmed`, `waiting_party`, `viewer_related`, `viewer_unconfirmed`, `gm_staff`, `gm_admin` | ช่วงรอและผู้รับแจ้งของแต่ละช่วง (A04) ตามสิทธิ์รายละเอียดของงาน |
| `waiting_intervals.confidential` | `requester`, `related_person`, `waiting_party`, `viewer_related`, `gm_staff`, `gm_admin` | ช่วงรอของงานลับ |
| `comments.general` | `requester`, `related_person`, `related_unconfirmed`, `waiting_party`, `viewer_related`, `viewer_unconfirmed`, `gm_staff`, `gm_admin` | คอมเมนต์ตามสิทธิ์รายละเอียดของงาน |
| `comments.confidential` | `requester`, `related_person`, `waiting_party`, `viewer_related`, `gm_staff`, `gm_admin` | คอมเมนต์ของงานลับ |
| `my_requests` | `requester`, `related_person`, `related_unconfirmed`, `watcher`, `waiting_party`, `employee`, `viewer`, `viewer_related`, `viewer_unconfirmed`, `team_label_member`, `gm_staff`, `gm_admin` | คำขอของฉัน: เฉพาะงานที่ยังมีสิทธิ์ ณ ตอนขอ (watcher เห็นแค่สรุป) |
| `awaiting_confirmation` | `requester`, `related_person`, `related_unconfirmed`, `watcher`, `waiting_party`, `employee`, `viewer`, `viewer_related`, `viewer_unconfirmed`, `team_label_member`, `gm_staff`, `gm_admin` | จำนวนงานรอฉันยืนยัน (D-S10-2) |
| `view_url.general` | `requester`, `related_person`, `related_unconfirmed`, `waiting_party`, `viewer_related`, `viewer_unconfirmed`, `gm_staff`, `gm_admin` | ลิงก์ดูรูป GET 5 นาที: คนที่อ่านงานนั้นได้ |
| `view_url.confidential` | `requester`, `related_person`, `waiting_party`, `viewer_related`, `gm_staff`, `gm_admin` | ลิงก์ดูรูปของงานลับ |
| `upload_url.attachment.general` | `requester`, `gm_staff`, `gm_admin` | ลิงก์อัปโหลด PUT 15 นาที: GM และผู้ขอ (related ใช้คอมเมนต์แทน, D-S12-2); งานที่ปิด/ยกเลิกแล้วไม่รับ (D-S12-4) |
| `upload_url.attachment.confidential` | `requester`, `gm_staff`, `gm_admin` | ลิงก์อัปโหลดของงานลับ: GM และผู้ขอ |
| `upload_url.watch_contribution.general` | `watcher` | รูปของผู้แจ้งเพิ่มตอนกดติดตาม 1 ครั้ง ไม่เกิน 3 รูป (U1, D-S12-3) — watcher เท่านั้น ดูรูปตัวเองหลังส่งไม่ได้ |
| `mark_seen.general` | `requester`, `related_person`, `related_unconfirmed`, `watcher`, `waiting_party`, `viewer_related`, `viewer_unconfirmed` | บันทึกว่าเปิดดูแล้ว (จุด “มีอัปเดตใหม่”, A06): เจ้าของ user_state ที่ความสัมพันธ์ยังจริง — ผู้ขอ, related ที่อ่านได้, watcher ของงานไม่ลับ; GM ไม่มี user_state |
| `mark_seen.confidential` | `requester`, `related_person`, `waiting_party`, `viewer_related` | บันทึกว่าเปิดดูแล้วของงานลับ: ผู้ขอและ grant (watcher ไม่มีสิทธิ์) |
| `waiting_preview.general` | `gm_staff`, `gm_admin` | ดูก่อนยืนยันรอผู้อื่น (A04): ผู้รับแจ้ง/คนที่จะเป็น related/ต้องยืนยัน grant หรือไม่ — GM เท่านั้น |
| `waiting_preview.confidential` | `gm_staff`, `gm_admin` | ดูก่อนยืนยันรอผู้อื่นของงานลับ — GM เท่านั้น |
| `related_preview.general` | `gm_staff`, `gm_admin` | ดูก่อนยืนยันเพิ่มผู้เกี่ยวข้อง (FU-12) — GM เท่านั้น |
| `gm_history.general` | `gm_staff`, `gm_admin` | ประวัติเฉพาะ GM (D-A04-8 เหตุผลปลดธงลับ; watcher contribution) — GM เท่านั้น |
| `gm_history.confidential` | `gm_staff`, `gm_admin` | ประวัติเฉพาะ GM ของงานลับ — GM เท่านั้น |
| `related_preview.confidential` | `gm_staff`, `gm_admin` | ดูก่อนยืนยันเพิ่มผู้เกี่ยวข้องของงานลับ: ใครต้องได้ grant (D-ACL-2) — GM เท่านั้น |

## หน้าจอ → แหล่งข้อมูล

แต่ละหน้าโหลดข้อมูลจากไหนภายใต้สิทธิ์ในเอกสารนี้ (D-ACL-6) — `screen-sources.test.ts` ตรวจว่าทุกแหล่ง Firestore ในตารางนี้อนุญาตจริงสำหรับทุกคนที่เปิดหน้านั้น ข้อมูลที่โหลดไม่ได้ภายใต้สิทธิ์นี้เขียนเป็นคำถาม (docs/sessions/S10.md) ไม่แก้สิทธิ์เอง

| หน้าจอ | ใครเปิด | Firestore (path · operation) | ผ่าน API | คำถามค้าง |
|---|---|---|---|---|
| บอร์ดสาธารณะ (UI-08 มุมมองสรุป) | ทุกบัญชีที่ใช้งานได้ | `request_summaries/{id} (งานไม่ลับ)` · list: query งานเปิด / รอยืนยัน / ปิด 7 วัน แบบแบ่งหน้า (§6.11) — งานลับไม่มี document<br>`board_counters/public` · get: “งานภายใน X รายการ” จาก document public เท่านั้น<br>`locations/{id}` · list: ชื่อสถานที่บนการ์ดและ filter<br>`areas/{id}` · list: ชื่อบริเวณบนการ์ด | — | — |
| บอร์ด GM (UI-08 มุมมองจัดการ) | GM Staff / GM Admin | `gm_request_summaries/{id}` · list: การ์ดทุกงานรวมงานลับ/stale แบบแบ่งหน้า<br>`people_picker/{person_id}` · list: filter คน, sheet มอบหมาย/รอผู้อื่น/เพิ่มคนในงานลับ (D-ACL-1)<br>`gm_profile_summaries/{person_id}` · list: presence/ลา ของ GM ใน sheet มอบหมาย<br>`locations/{id}` · list: ชื่อสถานที่<br>`areas/{id}` · list: ชื่อบริเวณ | ทุก action (รับ/มอบหมาย/รอ/เสร็จ/ยกเลิก/เปิดกลับ/ติดธงลับ) เป็น command ผ่าน API | — |
| หน้าแรก — ทีม GM ตอนนี้ และบอร์ดย่อ (UI-02) | ทุกบัญชีที่ใช้งานได้ | `gm_profile_summaries/{person_id}` · list: presence และงานที่กำลังทำแบบปลอดภัย (งานลับเป็น “งานภายใน”)<br>`request_summaries/{id} (งานไม่ลับ)` · list: บอร์ดย่อ: จำนวน 5 สถานะและการ์ดล่าสุด<br>`board_counters/public` · get: “งานภายใน X รายการ” | ชื่อ/เลขงานลับที่ GM กำลังทำ เฉพาะผู้ดูที่มีสิทธิ์ (endpoint ส่วนบุคคล ตรวจ ACL, §6.4.1)<br>เจ้าของ profile เปลี่ยน presence/ลา ผ่าน command | — |
| หน้าแรก — แถบ “มี X งานรอคุณยืนยัน” (UI-02) | ผู้ขอ (ทุกบัญชีที่ใช้งานได้) | — | จำนวนงานที่ requester_id = ฉัน, status = completed และยังไม่มี closed_at (Part 2 Addendum) จาก endpoint ส่วนบุคคลเดียวกับคำขอของฉัน (D-S10-2) | — |
| คำขอของฉัน — แท็บที่ฉันขอ (UI-06) | ทุกบัญชีที่ใช้งานได้ | `user_state/{person_id ของตัวเอง}/requests/{id}` · list: รายการงานของฉัน (relation type) และ last_seen_activity_seq สำหรับจุด “มีอัปเดตใหม่” | สรุปการ์ดของแต่ละงาน (สถานะ ผู้รับผิดชอบ รอใคร กำหนดยืนยัน) — API ตรวจ ACL ปัจจุบันก่อนคืน (§6.4 แถว user_state) | — |
| คำขอของฉัน — แท็บเกี่ยวข้องกับฉัน รวมงานที่ติดตาม (UI-06) | ทุกบัญชีที่ใช้งานได้ | `user_state/{person_id ของตัวเอง}/requests/{id}` · list: งานที่ฉันเป็น related หรือ watcher (relation type)<br>`request_summaries/{id} (งานไม่ลับ)` · get: งานที่ติดตาม: “ติดตามอยู่ — ดูข้อมูลสรุป” (Part 3 Addendum) | สรุปการ์ดของงานที่ฉันเป็น related — API ตรวจ ACL ปัจจุบัน (งานลับเฉพาะเมื่อได้รับการยืนยัน, D-ACL-2) | — |
| รายละเอียด — ผู้ขอ (UI-07) | ผู้ขอของงาน | `requests/{id} (งานไม่ลับ)` · get: รายละเอียดงาน พร้อมชื่อผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related เป็นคู่ person_id + display_name (D-S10-1, D-S11-1)<br>`requests/{id} (งานลับ)` · get: รายละเอียดงานลับของตัวเอง<br>`locations/{id}` · get: ชื่อสถานที่<br>`areas/{id}` · get: ชื่อบริเวณ | คอมเมนต์, history, ช่วงรอ, ลิงก์รูป (signed URL) — API ตรวจ parent ACL<br>ยืนยัน / ยังไม่เรียบร้อย / คอมเมนต์ / แนบรูป เป็น command | — |
| รายละเอียด — related (UI-07) | related person ทุก role | `requests/{id} (งานไม่ลับ)` · get: รายละเอียดงานไม่ลับ พร้อมชื่อคนในงาน (D-S10-1; เห็นอีเมล related คนอื่นในงานเดียวกันได้, D-ACL-1)<br>`requests/{id} (งานลับ)` · get: งานลับ: เฉพาะคนใน confidential_grant_ids (D-ACL-2) — เฉพาะ `related_person`, `viewer_related`<br>`locations/{id}` · get: ชื่อสถานที่<br>`areas/{id}` · get: ชื่อบริเวณ | คอมเมนต์, history, ช่วงรอ, ลิงก์รูป — API ตรวจ parent ACL<br>คอมเมนต์ เป็น command | — |
| รายละเอียด — ฝ่ายที่ถูกรอ (UI-07) | ผู้รับแจ้งของช่วงรอปัจจุบัน (เป็น related และได้รับการยืนยันในงานลับ) | `requests/{id} (งานไม่ลับ)` · get: รายละเอียดงานและ waiting_on<br>`requests/{id} (งานลับ)` · get: งานลับที่ได้รับการยืนยัน | ฉันเป็น recipient ของช่วงปัจจุบันหรือไม่ (recipients อยู่ใน waiting_intervals ที่ client อ่านตรงไม่ได้)<br>“ฝั่งฉันเรียบร้อยแล้ว” เป็น command | — |
| รายละเอียด — watcher (UI-07 มุมมอง summary-only) | ผู้แจ้งเพิ่ม (watcher) | `request_summaries/{id} (งานไม่ลับ)` · get: มุมมองสรุปเท่านั้น (งานกลายเป็นลับ → ไม่มี document)<br>`locations/{id}` · get: ชื่อสถานที่<br>`areas/{id}` · get: ชื่อบริเวณ | หมายเหตุ/รูปที่ตัวเองแจ้งเพิ่ม (contribution ใน gm_history) — API คืนเฉพาะของตัวเอง | — |
| ต่ออายุ (Infrastructure R4) | GM Staff / GM Admin | `renewal_items/{id}` · list: รายการ active เรียงตาม expires_on (§6.11)<br>`renewal_items/{id}/cycles/{cycle_id}` · list: รอบต่ออายุของรายการ<br>`gm_request_summaries/{id}` · get: สถานะงานต่ออายุที่เปิดแล้ว | เพิ่ม/แก้/ปิดรอบ/archive/import เป็น command | — |
| Dashboard / Scorecard / CSV (UI-11, ด่าน B) | GM (full scope) และ Viewer (public scope) | — | aggregate ตาม scope + visibility_epoch — client ไม่อ่าน dashboard_public / dashboard_gm / scorecards ตรง (§6.4) | — |
