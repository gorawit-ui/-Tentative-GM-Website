# GM One Stop Service — Part 4 token package

ชุดไฟล์ design tokens สำหรับใช้ประกอบ Part 4 ไม่ใช่แอปที่ build เสร็จแล้ว และไม่ใช่ prototype ของ Part 5

## Files

| File | Purpose |
|---|---|
| tokens.json | แหล่งค่าหลัก Light/Dark, typography, layout และ motion |
| tokens.css | CSS variables และ reference components ที่สร้างจาก JSON |
| tailwind.config.cjs | Map semantic tokens เข้าชื่อ utility; status keys คง `in_progress` |
| entry.tailwind-v4.css | ตัวอย่าง entry สำหรับ v4 ที่โหลด config ผ่าน `@config` |
| motion-tokens.ts | Motion timings และตัวเลือก normal/reduced motion |
| contrast-report.md / .json | คู่สีทั้งหมด พร้อมค่าเต็มใน JSON และผลผ่าน/ไม่ผ่าน |
| token-preview.html | ตัวอย่าง palette เปิดเป็นไฟล์เดียวได้ ไม่มี backend/การส่งข้อมูล |
| build_tokens.py | Generate CSS, motion, reports และ palette ด้วย Python standard library |

## Regenerate

```bash
python gm-design-tokens/build_tokens.py
```

แก้ค่าที่ `tokens.json` แล้ว regenerate ไม่แก้ค่าที่สร้างแล้วใน `tokens.css` / `motion-tokens.ts` โดยตรง ส่วน reference component CSS อยู่ใน generator เพื่อให้สร้างซ้ำได้

หากมีคู่สีที่บังคับไม่ผ่าน generator จะเขียนรายงานและหยุดด้วย error ก่อนสร้าง CSS ชุดใหม่ Report มี 196 คู่ที่ใช้งานตามข้อกำหนด และอีก 24 คู่สำหรับแสดงผลของสีเดิมเท่านั้น คู่เดิมที่ไม่ผ่านไม่ถูกนับกลบกับคู่ที่บังคับ

## Use

- นำไฟล์ทั้งหมดในโฟลเดอร์นี้ไปอยู่ด้วยกันและ import entry CSS จากแอป หากเปลี่ยนที่ตั้ง config ต้องปรับ relative path ให้ตรง
- Tailwind v4: ใช้ `entry.tailwind-v4.css`; import `tokens.css` ด้วย `layer(components)` เพื่อให้ utility override ได้ และโหลด JavaScript config ด้วย `@config` ตามตัวอย่าง ผู้ใช้ตรวจ compile กับ Tailwind v4.3.3 แล้ว
- Tailwind v3: ใช้ `tailwind.config.cjs` และ entry directives ของ v3 พร้อม import `tokens.css`; ไม่ใช้ entry v4
- ห้ามประกอบชื่อ status utility ด้วย string จากข้อมูล; ใช้ static mapping หรือ `.gm-badge` + `data-status`
- ค่า CSS ของสีเป็นช่องสี RGB เช่น `96 87 147`; ใช้ `rgb(var(--gm-status-waiting-fg))`
- ฟอนต์ IBM Plex Sans Thai Looped ไม่ได้แนบไฟล์ font มาด้วย ตัวอย่างใช้ fallback ในเครื่อง; จัดเตรียม font assets ในขั้น build
- Dark อยู่ใน `[data-theme="dark"]` สำหรับเตรียมไว้ ไม่เปิดตาม system theme และไม่เพิ่ม UI เปลี่ยนธีมใน Phase 1
- `aria-disabled="true"` ต้องป้องกัน handler เอง; CSS อย่างเดียวไม่หยุดการทำงาน ใช้ native `disabled` เมื่อเหมาะสม
- ห้ามเพิ่ม CSS แบบไม่มี cascade layer ในแอปจริง ใช้ลำดับ `theme, base, components, utilities`; reference components อยู่ `components` และ utility อยู่ `utilities` รวมถึง CSS ที่ฝังใน prototype

```css
@import "tailwindcss";
@import "./tokens.css" layer(components);
@config "./tailwind.config.cjs";
```

## Laptop Kanban — Part 4 Patch P2

- 1024–1535px: 3 คอลัมน์งานเปิดใช้พื้นที่หลัก; completed/cancelled ย่อเป็นแถบชื่อและจำนวน กดขยายเป็น panel ดูรายการได้ โดยไม่ผลักคอลัมน์เปิดออกนอกจอ
- completed ที่รอยืนยันมี badge จำนวนแยกบนแถบย่อ
- 1024–1365px: sidebar ย่อเป็นไอคอน 72px; ตั้งแต่ 1366px sidebar ปกติ 232px
- ตั้งแต่ 1536px: แสดง 5 คอลัมน์ ใช้ grid แบบยืดหยุ่น `repeat(5, minmax(0, 1fr))`; 272px เป็นความกว้างเป้าหมายเมื่อมีพื้นที่ ไม่ใช่ min-width ตายตัว
- มือถือต่ำกว่า 1024px ยังคงเป็นรายการแบ่งสถานะ ไม่มี Kanban แนวนอน; ที่ความสูงไม่เกิน 700px ใช้ bottom nav 64px + safe area และชดเชย action bar ในพื้นที่เลื่อน

## Motion integration

ส่งค่า reduced-motion ปัจจุบันเข้า `getMotionSettings(reducedMotion)` และอัปเดตเมื่อ preference เปลี่ยน ถ้ายังไม่รู้ค่าให้เริ่มแบบ reduced ไว้ก่อน ใช้ค่าที่คืนให้ทั้ง Motion และ Recharts; CSS media query อย่างเดียวหยุด JavaScript animation ไม่ได้

Motion transition ใช้วินาที; CSS, chart และ countup ใช้มิลลิวินาที จึงต้องไม่ใช้ค่าข้ามหน่วยโดยตรง

## Validation scope

คู่สีในรายงานตรวจด้วยสูตร W3C และใช้ค่าจริงก่อนปัด Syntax และ object mapping ของ config/motion ตรวจแยกจากการ build แอป ส่วน build กับ Tailwind/Motion เวอร์ชันที่เลือกและ visual QA ใน browser เป็นงานที่ต้องตรวจเมื่อ integration ไม่อ้างว่าเอกสารนี้รับรอง WCAG ของทั้งแอป

Sources: [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [Tailwind @config](https://tailwindcss.com/docs/functions-and-directives), [Tailwind upgrade guide](https://tailwindcss.com/docs/upgrade-guide).
