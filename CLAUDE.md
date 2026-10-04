# GM One Stop Service

เป้าหมาย: งาน GM ข้ามทีมเข้าระบบ ติดตามได้เองและไม่รั่วข้อมูล เปิด Pilot A ก่อน แล้วจบด่าน B ภายใน Q4 2026; Trello ไม่เป็น release gate

Stack: TypeScript, React/Vite, Tailwind v4.3.3 reference; Firebase Hosting/Auth Google, Firestore Standard `(default)`, private GCS; Cloud Run API/worker, Cloud Tasks, Scheduler เดียว; Workspace Gmail, Slack และ Trello เดิมของบริษัท

## เริ่มแต่ละ session

อ่าน [spec map](docs/spec/INDEX.md), [decisions](docs/spec/DECISIONS.md), [tasks](docs/SESSION-TASKS.md) แล้วเลือก task ที่ dependencies ผ่าน เอกสารใหม่ชนะเก่า; C1–C11 ชนะ CH-01–CH-09 เสมอ การ clean Part 6 เปลี่ยน formatting เท่านั้น เมื่อข้อที่มีผลต่อสิทธิ์ยังไม่ชัดให้หยุดเฉพาะงานที่พึ่งข้อดังกล่าวและบันทึกข้อขัดกัน

## คำสั่ง

Command contract นี้ต้องสร้างใน `S00` ก่อนใช้; รายละเอียด [BUILD-COMMANDS](docs/BUILD-COMMANDS.md)

```sh
npm ci
npm run dev
npm run build
npm run test:unit
npm run test:rules
npm run test:e2e
npm run verify
npm run deploy:dev
```

Dev deploy ผ่านเครื่องทีมด้วย identity dev ที่อนุมัติ ต้องตรวจ project allowlist; prod deploy เฉพาะผู้ดูแล ห้าม deploy prod หรือสร้าง resource บริษัทอัตโนมัติจาก task นี้

## กฎห้ามละเมิด

- Public summary เป็น allowlist ไม่มีงานลับ/private payload; watchers ไม่ได้รายละเอียด; API/Rules ตรวจสิทธิ์จริง ห้ามส่งครบแล้วซ่อน UI
- ใช้ของฟรี/บริการบริษัทเดิมเท่านั้น; Firestore Standard ฐานแรก, min instances 0, Scheduler เดียว; ห้ามเพิ่ม SaaS/license/บริการส่ง email หรือ search ภายนอก ผู้ส่ง email ต้อง mailbox กลางเดิม
- CSS ทุกกฎอยู่ใน cascade layer; token import `layer(components)`; utility overrides และ reduced motion ต้องผ่าน
- การคำนวณเวลาทั้งหมดใช้ pure functions `packages/time` ชุดเดียว; status/ACL/lifecycle อยู่ `packages/domain`; test-first ก่อน Rules/Emulator แล้วจึง UI
- Commands/jobs idempotent ตรวจสถานะล่าสุด; bounded listeners, pagination และ no private PWA cache; ทุก dev deploy ตรวจ usage/loops
- ห้าม commit secret/credential/ข้อมูลพนักงานจริง; dev notification ใช้ sandbox recipients

DoD และหลักฐาน: [test checklist](docs/TEST-CHECKLIST.md); ทุก session บันทึก task, tests, unresolved risks และ next dependency ใน PR/บันทึกทีม ไม่อ้าง tests ที่ยังไม่ได้รัน
