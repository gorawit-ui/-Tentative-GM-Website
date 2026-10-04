# Part 4 — Patch

## P1. Cascade layer

แก้ entry เป็น:

```css
@import "tailwindcss";
@import "./tokens.css" layer(components);
@config "./tailwind.config.cjs";
```

อัปเดต README, Part 4 ข้อ 4.5 ในฉบับสนทนา (ข้อ 7–8 ในไฟล์เอกสาร) และ palette preview ให้ตรงกัน ห้ามเพิ่มกฎ CSS แบบไม่มี layer ในแอปจริง Prototype ฝัง token CSS ใน `@layer components` และใช้ลำดับ `theme, base, components, utilities`

รับผลตรวจของผู้ใช้: Tailwind v4.3.3 + @config compile ผ่าน, contrast ตรงทุกคู่, reduced motion ทำงานใน Chromium การทดสอบ utility overrides ใน Part 5 ใช้ค่าที่คาดหวังเดิมทั้ง 4 กรณี

จาก visual QA แก้ selector ของปุ่มแจ้งซ่อมกลางใน reference CSS ให้ `aria-current="page"` ยังคงใช้ `on-brand` บน `brand-solid` ป้องกันสีเมนู active มาทับตัวอักษรบนปุ่ม

## P2. Kanban บน laptop

- ที่ 1366×768 ต้องเห็นรอคิว/กำลังทำ/รอผู้อื่นครบโดยไม่เลื่อนแนวนอน
- ช่วง 1024–1535px เสร็จและยกเลิกย่อเป็นแถบชื่อ/จำนวน มี badge รอยืนยันบนเสร็จ กดขยายเป็น panel รายการโดยไม่เบียดสามคอลัมน์งานเปิด
- Sidebar ย่อ 72px ช่วง 1024–1365px และปกติ 232px ตั้งแต่ 1366px
- ตั้งแต่ 1536px แสดง 5 คอลัมน์แบบ grid ยืดหยุ่น 272px เป็นขนาดเป้าหมาย ไม่ใช่ความกว้างขั้นต่ำที่ทำให้หน้าล้น
- มือถือยังเป็นรายการแบ่งสถานะ ที่ความสูงไม่เกิน 700px ใช้ bottom nav 64px + safe area และชดเชยพื้นที่ action bar
