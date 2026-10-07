# Build command contract — ต้อง implement ใน S00

ชุดนี้เป็นสัญญาการทำงาน ไม่ได้มี app หรือ scripts ที่รันได้แนบมา ห้ามอ้างว่าคำสั่งผ่านจากเอกสารแผนนี้

| คำสั่ง | สิ่งที่ S00 ต้องสร้าง | ผลที่ต้องตรวจ |
|---|---|---|
| `npm ci` | workspace root + lockfile | install reproducible ไม่มี paid dependency |
| `npm run dev` | Vite + emulator mode; local notification adapter | ไม่ต่อ prod ไม่แจ้งพนักงานจริง |
| `npm run build` | typecheck + production web/API/worker builds | exit nonzero เมื่อ TypeScript fail |
| `npm run test:unit` | Vitest `packages/time`, `packages/domain`, backend units | deterministic fake clock ไม่พึ่ง Firebase/network |
| `npm run test:rules` | Firebase Emulator (Auth, Firestore, Storage) + authenticated client test matrix; API/command tests ผ่าน firebase-admin (S12) | direct reads/writes ที่ผิดสิทธิ์ต้อง deny; API ตรวจสิทธิ์เองทุก endpoint; ไม่มี request ออกนอก emulator (network guard) |
| `npm run test:e2e` | Playwright + emulators seeded Thai fixtures | desktop/mobile sizes + main flows |
| `npm run verify` | build → unit → rules → e 2 e | fail-fast ใด fail ห้าม release |
| `npm run deploy:dev` | wrapper ตามวิธีพี่ทิมยืนยัน + `--project` explicit ทุก CLI | dev allowlist และ credential scope fail-closed |

Proposed layout: `apps/web`, `apps/api`, `apps/worker`, `packages/time`, `packages/domain`, `packages/contracts`, `infra`, `tests/rules`, `tests/e2e`; API/worker ใช้ image เดียว route/server mode ต่างกัน ตาม Part 6 §6.2–6.3

Dev wrapper ต้องตรวจ `GM_DEV_PROJECT_ID` เทียบ configuration ที่ผู้ดูแลรับรอง ไม่เชื่อเพียง suffix `-dev`; ห้าม fallback default project, ห้ามอ่าน prod secrets, ห้าม bootstrap billing/project/API/IAM เอง CI/test credentials ไม่ให้ `actAs` prod ยืนยัน guard ด้วย negative test prod/empty/unknown target **ก่อน network call**

`deploy:dev` ทำตาม adapter ที่เลือกใน P7-INFRA-01 ไม่เดา deploy CLI บริษัท; ช่วง W0 ยังไม่ทราบให้ไม่มี deploy adapter และแจ้งข้อที่ขาดอย่างชัดเจน build/test local ไม่ต้องมี cloud credential

Production release: ผู้ดูแลรับ commit/image digest ที่ตรวจแล้ว ตรวจ config แยก prod, deploy backend compatible ก่อน web, smoke/privacy/usage, เก็บ release ก่อนหน้าและ rollback runbook ไม่มี `deploy:prod` shortcut สำหรับ Claude Code

## เครื่องที่ต้องเตรียมก่อน S00

ให้ Claude Code ตรวจเวอร์ชันบนเครื่องจริงใน S00 แล้วบอกวิธีติดตั้งสิ่งที่ขาด ทุกตัวฟรี ไม่ติดตั้งของเสียเงิน

- Git และ Node.js รุ่น LTS (S00 pin รุ่นใน `.nvmrc` หรือ `engines`)
- Java (JDK) รุ่นที่ `firebase-tools` ที่ pin ไว้กำหนด เพราะ Firestore/Storage emulator ต้องใช้ Java
- `firebase-tools` เป็น devDependency ของ repo ไม่ติดตั้งแบบ global
- Playwright browsers ผ่าน `npx playwright install`
- `gcloud` CLI และ Docker เฉพาะหลัง `P7-INFRA-01` ยืนยันวิธี deploy แล้ว งาน S00–S12 ไม่ต้องใช้
