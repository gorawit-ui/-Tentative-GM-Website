# GM One Stop Service — Claude Code handoff

อ่าน [Part 7 build plan](docs/Part-7-Build-Plan.md) และ [CLAUDE.md](CLAUDE.md) จากนั้นให้บริษัทตอบ [W0](docs/WEEK-0.md) แล้วทำ S00 ตาม [session backlog](docs/SESSION-TASKS.md)

เป็น spec/build-plan package ไม่ใช่ app พร้อมรัน; command contract ต้องสร้างใน S00 โค้ดสร้างใน repo บริษัทตามวิธีพี่ทิม ไม่มี credentials/employee list จริงในชุดนี้ ไม่มีการ deploy หรือส่งข้อความ

[INDEX](docs/spec/INDEX.md) ระบุแหล่งต้นทางและข้อที่มีผลใหม่ [DECISIONS](docs/spec/DECISIONS.md) รวมทุก decision ID [Part 6 clean](docs/spec/Part-6-Technical-Spec-Clean.md) เปลี่ยนเฉพาะช่องว่าง/backticks Prototype reference เดิมไม่แก้รอบนี้

เริ่ม Claude Code ด้วย: “อ่าน CLAUDE.md และ docs/spec/INDEX.md ตรวจสถานะ W0 แล้วเลือก task แรกที่ dependencies ผ่าน เริ่ม packages/time และ packages/domain test-first ตาม §6.7 แล้ว Rules/Emulator ก่อน UI ห้าม deploy prod หรือเพิ่มบริการ/license เมื่อจบ session รายงาน diff/tests/evidence/blocker/next task”
