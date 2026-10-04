# สัปดาห์ 0 — ก่อนเริ่ม build

เจ้าของที่ใช้ในแผนเป็นบทบาทให้บริษัทแต่งตั้ง ไม่ถือว่าได้มอบหมายหรือส่งคำขอจริง: **พี่ทิม** = infrastructure/deploy, **Workspace Admin**, **Slack Admin**, **GM Admin**, **Gorawit** = ข้อมูลต่ออายุ, **Build lead** = ทีม/Claude Code ผ่านเครื่องทีม เจ้าของร่วมอาจเป็นคนเดียวกัน แต่ให้มีคนตอบรับแต่ละรายการ

| ID | เจ้าของและคำตอบที่ต้องได้ใน W0 | Block ด่าน A? | หลักฐานยอมรับ |
|---|---|---|---|
| `P7-INFRA-01` | พี่ทิม + Build lead: deploy pipeline ที่ใช้อยู่, org/billing, dev/prod IDs, domain/DNS, region/location, bucket choice, IAM/SA และ shared free quota/SKU | **ใช่** สำหรับ cloud deploy/pilot; local test-first เริ่มได้หลัง W0 บันทึกช่องว่าง ไม่ต้องรอ account ใหม่ | manifest ค่าจริง dev/prod แยก; อนุมัติ location ก่อนสร้าง Firestore; dev deploy guard; custom domain HTTPS+QR; review IAM ขั้นต่ำตาม §6.13 |
| `P7-ADMIN-01` | Workspace Admin + GM Admin: รายชื่อ `@tdfb.co` CSV ที่ถูกต้อง, active/inactive และ role; Directory API sync เป็นทางเลือก | **ใช่** ต้องมี people picker/ACL ที่เชื่อถือได้; **Directory API ไม่ block** ถ้ามี CSV | CSV dry-run ไม่มี duplicate ID; GM 3 คน/ผู้ดูแลถูกต้อง; ผู้ใช้ลาออกเข้าไม่ได้; ไม่มี credential Workspace Admin ในแอป |
| `P7-ADMIN-02` | พี่ทิม + Workspace Admin: มี **mailbox กลางเดิม** ใดใช้ได้? ชื่อผู้ส่ง/underlying mailbox/alias/send-as, OAuth internal `gmail.send`, policy/cap และผู้ดูแล credential ต่อเนื่อง | **ไม่**; กำหนด adapter disabled จนอนุมัติ ไม่มี mailbox ที่ยืนยันห้ามใช้บัญชีพนักงานหรือซื้อ license | บันทึก approved/awaiting/unavailable; approved ต้อง test ส่ง sandbox แบบ secret-safe; awaiting ต้อง in-app + badge ทำงาน |
| `P7-ADMIN-03` | Slack Admin: plan/free app slots, app owner, scopes/Signing Secret, employee Slack IDs; test channel/recipients | **ไม่**; ไม่มีอนุมัติใช้ Gmail ที่อนุมัติแล้ว หรือในแอป | ตรวจ free-plan app ceiling ก่อนสร้าง; ถ้าปิด Slack ไม่ทำ provider call และงานยังบันทึกได้; mapping ไม่เดาผู้รับ |
| `P7-ADMIN-04` | GM Admin + พี่ทิม: วันหยุดบริษัท ธ.ค.2569–ม.ค.2570, FAQ/contact, default owner/types, GM roles, ผู้รับ budget alerts, ผู้ทดสอบครบ 5 สถานที่ | **ใช่เฉพาะ** company calendar จริง, people/roles, FAQ/contact, privacy + operational readiness; per-site calendars/SLA รอ B | ลง holiday จริงก่อน pilot; ไม่มีการอนุมานวันหยุดจาก test fixture; QR/login มี contact; smoke auto-close ปีใหม่; budget alerts recipients ที่ผู้ดูแลตั้งค่า |

## คำตอบที่ยังไม่ทราบ — ห้ามเดาเงียบๆ

- วิธีพี่ทิม deploy จริง: ยังไม่ทราบ ใช้ Docker/Cloud Run adapter เป็นข้อเสนอจนยืนยัน
- IDs `tdfb-gm-dev`/`tdfb-gm-prod`, domain `gm.tdfb.co`/`gm-dev.tdfb.co`, region `asia-southeast1`: เป็นค่าที่เสนอ ยังไม่สร้างและยังไม่ยืนยัน ต้องตรวจ availability/มาตรฐานบริษัท/ค่า SKU ก่อน provision
- Bucket ใกล้ไทยหรือ US Always Free: ให้พี่ทิมเลือกจาก §6.12 รวม latency/network/free quota ที่แชร์ ไม่อ้างว่า cloud ทั้งหมดฟรี
- Mailbox กลางเดิมและสิทธิ์ OAuth: ยังไม่ทราบ ถามพี่ทิม ไม่ใช้บัญชีพนักงานแทน
- SLA ซ่อมทั่วไป: Admin เลือก duration/unit ก่อนเปิด B ห้ามใส่ค่าที่คาดเอง
- RPO 24 ชม./RTO 1 วันทำการ และความถี่/retention backup ตาม §6.13: ผู้ดูแลยืนยันก่อน pilot

## `P7-ASSUME-01` — ลงชื่อยืนยันก่อน pilot

| สมมติฐาน | ผู้ยืนยัน | ถ้าค่าเปลี่ยน |
|---|---|---|
| ผู้ใช้ 100 คน | GM Admin + Workspace Admin | ปรับ load fixtures/listener budget และตารางค่าใช้จ่ายแผนใหม่ โดยไม่แก้ตัวเลขใน Part 6 clean |
| 20 งานใหม่ต่อวันทำการ | GM Admin | ปรับ workload รูป/reads/writes/outbox/retention |
| รายการต่ออายุ 200 รายการ | Gorawit + GM Admin | ปรับ import/query/job batch ภายใน B |
| lead time ใบรับรองมาตรฐาน 30 วันปฏิทิน | Gorawit | บันทึกค่าที่รับรองใน settings ก่อนใช้/นำเข้าข้อมูล B |

W0 ต้องบันทึก owner, วันที่ต้องได้คำตอบ, approved/awaiting, blocker และ evidence ในรายการทีม ไม่ต้องส่ง Slack/email อัตโนมัติจากเอกสารนี้

## Dev deploy IAM ที่ขอแบบจำกัด

เริ่มจาก `roles/run.developer` บน dev services, `roles/iam.serviceAccountUser` เฉพาะ dev runtime SA, `roles/artifactregistry.reader` หรือ writer เมื่อทีม push image, `roles/firebasehosting.admin`, `roles/serviceusage.apiKeysViewer` ที่ CLI ต้องใช้, `roles/firebaserules.admin`/custom rules releases และ `roles/datastore.indexAdmin` เฉพาะ dev; ถ้าใช้ Cloud Build ให้ขอ submitter/build SA ตาม §6.13 ไม่ให้ `Owner`/`Editor` ทั้ง project หรือ prod `actAs` ให้ทีม

Bootstrap project/billing/APIs/SA/queue/secrets/Scheduler/DNS ทำโดยผู้ดูแลบริษัท Runtime/Tasks/export/signed URL permissions แยกตาม §6.13 และตรวจจริงกับ pipeline ไม่ใช้สิทธิ์ deploy ของคนเป็น runtime

## กำหนดติดตาม approvals

Slack/Gmail อนุมัติค้างไม่ขวาง A แต่ Build lead ต้องติดตามเจ้าของตั้งแต่ W0 และจองการทดสอบจริงก่อนงาน B07–B09 ไม่ถือว่าด่าน B ครบหาก Slack actions/digest ที่ระบุใน scope ยังเปิดใช้งานจริงไม่ได้ รายการอนุมัติค้างเป็นความเสี่ยงของ B ให้ GM Admin/Tim จัดการ ไม่ตัด feature ออกเอง
