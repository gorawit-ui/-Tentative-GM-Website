# Part 4 — Design Tokens, Tailwind Config & Motion

GM One Stop Service · 3 October 2026 · Asia/Bangkok

ใช้ Part 1 — Changelog C1–C11, Part 2 — Addendum และ Part 3 — Addendum ล่าสุดเป็นฐาน ขอบเขตด่าน A/B ไม่เปลี่ยน ชุดนี้ประกอบด้วย CSS variables, Tailwind config, motion tokens และรายงาน contrast ที่คำนวณซ้ำได้ ไม่ใช่เว็บแอปหรือ prototype ของ Part 5

## 1. สิ่งที่ปรับจาก brief

คงอารมณ์สงบ อบอุ่น เป็นมิตรของ Matchazuki: พื้นครีม การ์ดขาว สีมัทฉะ ใช้สีสถานะเดิมกับจุด แถบ และกราฟ เพิ่ม semantic token สำหรับข้อความกับพื้นป้ายโดยเฉพาะ ไม่ใช้สีฐานเป็นตัวอักษรขนาดปกติ

ค่าเฉดเข้มที่ผู้ใช้ให้เป็นจุดตั้งต้นผ่านบนครีม แต่คู่สีที่ใช้งานจริงต้องตรวจบนพื้นป้ายแต่ละสีด้วย จึงปรับเฉดข้อความให้เข้มขึ้นอีกเล็กน้อยเพื่อให้ป้าย Light ทุกสถานะได้อย่างน้อย 5.5202:1

สีหลักเดิม `#5B7F3A` เก็บเป็น `brand-base`; ปุ่มใช้ `brand-solid = #577937` และข้อความ/ลิงก์แบรนด์บนพื้นอ่อนใช้ `brand-fg = #49662C` สีเขียวของ **สถานะงาน** สงวนให้ `completed` เท่านั้น สีแบรนด์บนปุ่มและ navigation ยังคงใช้ได้โดยไม่สื่อว่าเป็นสถานะงาน

Dark เตรียมค่าไว้ใน `[data-theme="dark"]` เท่านั้น ไม่เปิดอัตโนมัติตามระบบและไม่เพิ่มตัวเลือก Dark mode ใน Phase 1

## 2. หลักตรวจ contrast และผลสีเดิม

ตรวจจาก sRGB HEX ที่ opacity 100% ใช้สูตร relative luminance ของ W3C: แปลง channel เป็น 0–1; ถ้าค่าไม่เกิน 0.04045 ให้หาร 12.92 มิฉะนั้นใช้ `((c + 0.055) / 1.055)^2.4`; luminance = `0.2126R + 0.7152G + 0.0722B`; ratio = `(Lสว่าง + 0.05) / (Lมืด + 0.05)`

ข้อความปกติต้อง ≥ 4.5:1; ข้อความใหญ่ตามนิยาม WCAG ต้อง ≥ 3:1 แต่ชุดนี้ตั้งเป้าข้อความทั้งหมดไว้ที่ ≥ 4.5:1 ส่วนกราฟ/ขอบ control ที่จำเป็นต่อความเข้าใจต้อง ≥ 3:1 กับสีข้างเคียง ตัดสินผ่านจากค่าที่ไม่ปัด เฉพาะตารางสรุปปัดแสดง 2 ตำแหน่ง

| สีเดิม | HEX | บนขาว #FFFFFF | บนครีม #FAF8F3 |
| --- | --- | --- | --- |
| หลัก | #5B7F3A | 4.62:1 | 4.36:1 |
| รอคิว | #8A8F98 | 3.25:1 | 3.06:1 |
| กำลังทำ | #E3A03A | 2.24:1 | 2.11:1 |
| รอผู้อื่น | #8B7FD1 | 3.47:1 | 3.27:1 |
| เสร็จ | #5E9B4F | 3.35:1 | 3.15:1 |
| ยกเลิก | #C97B70 | 3.21:1 | 3.02:1 |

สีฐานรอคิว/รอผู้อื่น/เสร็จ/ยกเลิกผ่าน 3:1 กับครีมตามคู่ที่วัด แต่สี “กำลังทำ” ไม่ผ่านแม้ใช้เป็น non-text การย้ายไปใช้ในกราฟจึงไม่ได้ทำให้ผ่านโดยอัตโนมัติ:

- จุดสถานะมีข้อความชื่อสถานะคู่กันและขอบสี `status.*.fg` หนา 2px ไม่ให้สีจุดเป็นข้อมูลเพียงอย่างเดียว
- แท่ง/ส่วนของกราฟ Light ใช้สีฐานทึบพร้อมเส้นขอบ `chart-outline = #2D2A26` หนา 2px และ label/ค่า/ตารางข้อมูลที่อ่านได้ ไม่ใช้สีเหลืองเดี่ยวๆ เป็นเส้นสำคัญบนพื้นขาว
- เส้นกราฟขนาดเล็กที่ใส่ขอบแยกไม่ได้ ใช้ `status.*.fg` แทนสีฐาน และมีชื่อ series/ค่า; ไม่ต้องฝืนใช้สีฐานจนอ่านไม่ออก
- กราฟหลายส่วนต้องแยกขอบแต่ละส่วนได้ชัด มี legend เป็นข้อความและตารางข้อมูลเทียบเท่า ตรวจกราฟที่ render จริงอีกครั้ง
- ไม่ลด opacity ของข้อความ ป้าย หรือเส้นจำเป็นโดยพลการ คู่สีที่วัดไว้ไม่ครอบคลุมการผสม alpha/gradient ที่เปลี่ยนไป

อ้างอิง: [W3C — Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [W3C — Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)

## 3. Status tokens — Light

| status key / ชื่อ | base: จุด/แถบ/กราฟ | fg: ตัวอักษร | bg: พื้นป้าย | fg บน bg | fg บนครีม |
| --- | --- | --- | --- | --- | --- |
| `queued` / รอคิว | #8A8F98 | #5E626A | #F3F4F6 | 5.56:1 | 5.77:1 |
| `in_progress` / กำลังทำ | #E3A03A | #805719 | #FFF4DE | 5.84:1 | 6.00:1 |
| `waiting` / รอผู้อื่น | #8B7FD1 | #605793 | #F1EDFC | 5.56:1 | 6.03:1 |
| `completed` / เสร็จ | #5E9B4F | #3F6B34 | #EDF4E8 | 5.56:1 | 5.88:1 |
| `cancelled` / ยกเลิก | #C97B70 | #895047 | #FAECE8 | 5.52:1 | 5.99:1 |

`base`, `fg`, `bg` เป็นคนละหน้าที่ ห้ามนำ `base` ไปแทน `fg` ใน component เพื่อให้ “ตรงแบรนด์” ค่า status ในข้อมูลยังเป็น `in_progress`; เฉพาะชื่อ CSS custom property ใช้ `in-progress` เพื่อให้อ่านง่าย

`completed` ใช้ป้ายเสร็จสีเขียวเหมือนกันทั้งที่รอยืนยันและปิดแล้ว แยกด้วยข้อความรอง “รอคุณยืนยัน” / “ปิดแล้ว” ไม่สร้างสถานะที่หก และไม่เปลี่ยนกติกา `closed_at`

## 4. สีส่วนกลางและ component states

| Token | Light | หน้าที่ |
|---|---|---|
| canvas | #FAF8F3 | พื้นหน้า |
| surface / surface-muted | #FFFFFF / #F2F1EA | การ์ดและพื้นรอง |
| text / text-muted | #2D2A26 / #6B6760 | ข้อความหลักและรอง |
| border | #DADBD2 | เส้นตกแต่งแบ่งส่วน ไม่ใช้เป็นขอบ input ที่จำเป็นต้องมองเห็น |
| control-border | #87877F | ขอบ input, ปุ่ม secondary |
| brand-base / brand-solid | #5B7F3A / #577937 | สีอ้างอิงแบรนด์ / พื้นปุ่มหลัก |
| brand-hover / brand-active | #49662C / #3E5725 | ปุ่มหลักเมื่อชี้และกด |
| brand-fg / brand-soft | #49662C / #EEF3E6 | ข้อความแบรนด์บนพื้นอ่อน |
| on-brand | #FFFFFF | ตัวอักษรปุ่มหลัก |
| info-fg / info-soft | #315F84 / #EAF2FA | ลิงก์และข้อมูลอัปเดต |
| warning-fg / warning-soft | #805719 / #FFF4DE | เรื่องต้องติดตาม |
| danger-fg / danger-soft | #895047 / #FAECE8 | ข้อผิดพลาด, ยกเลิก, เกิน SLA |
| danger-solid / hover / active | #895047 / #78433B / #66372F | ปุ่มยืนยันการยกเลิก |
| on-danger / on-info | #FFFFFF / #FFFFFF | ตัวอักษรบนปุ่ม semantic ทึบ |
| focus | #315F84 | วง focus 3px offset 2px |
| disabled-bg / disabled-fg | #ECEBE6 / #6B6760 | control ที่ทำไม่ได้ ไม่ลด opacity ทั้งชิ้น |
| progress-track / info-solid | #E5E7DE / #315F84 | รางและแถบ progress รูป |
| skeleton-base / highlight | #E5E7DE / #F2F3EF | loading placeholder |
| chart-outline / separator | #2D2A26 / #FFFFFF | ขอบกราฟ Light / ช่องว่างที่ไม่ใช่ตัวแบ่งสำคัญเพียงอย่างเดียว |

| คู่ token Light | ตัวอักษร/เส้น/แถบ | พื้น | contrast | เกณฑ์ |
| --- | --- | --- | --- | --- |
| `text` / `canvas` | #2D2A26 | #FAF8F3 | 13.45:1 | ≥ 4.5:1 |
| `text` / `surface` | #2D2A26 | #FFFFFF | 14.28:1 | ≥ 4.5:1 |
| `text-muted` / `canvas` | #6B6760 | #FAF8F3 | 5.30:1 | ≥ 4.5:1 |
| `text-muted` / `surface` | #6B6760 | #FFFFFF | 5.62:1 | ≥ 4.5:1 |
| `brand-fg` / `brand-soft` | #49662C | #EEF3E6 | 5.78:1 | ≥ 4.5:1 |
| `on-brand` / `brand-solid` | #FFFFFF | #577937 | 5.01:1 | ≥ 4.5:1 |
| `on-brand` / `brand-hover` | #FFFFFF | #49662C | 6.52:1 | ≥ 4.5:1 |
| `on-brand` / `brand-active` | #FFFFFF | #3E5725 | 8.09:1 | ≥ 4.5:1 |
| `info-fg` / `info-soft` | #315F84 | #EAF2FA | 5.99:1 | ≥ 4.5:1 |
| `warning-fg` / `warning-soft` | #805719 | #FFF4DE | 5.84:1 | ≥ 4.5:1 |
| `danger-fg` / `danger-soft` | #895047 | #FAECE8 | 5.52:1 | ≥ 4.5:1 |
| `disabled-fg` / `disabled-bg` | #6B6760 | #ECEBE6 | 4.71:1 | ≥ 4.5:1 |
| `control-border` / `canvas` | #87877F | #FAF8F3 | 3.41:1 | ≥ 3:1 |
| `focus` / `canvas` | #315F84 | #FAF8F3 | 6.38:1 | ≥ 3:1 |
| `info-solid` / `progress-track` | #315F84 | #E5E7DE | 5.42:1 | ≥ 3:1 |

ทุกคู่ข้อความในตารางนี้ผ่านเกณฑ์ข้อความปกติ ขอบ/วง focus/progress ใช้เกณฑ์ non-text แยกตามหน้าที่ Disabled component มีข้อยกเว้นในมาตรฐาน แต่โครงการตั้งเป้าให้ข้อความ disabled อ่านได้ ≥ 4.5:1 เช่นกัน

| สถานการณ์ในแอป | Treatment |
|---|---|
| มีงานรอยืนยัน / มีอัปเดตใหม่ | Info หรือข้อความกลาง ไม่ใช้เขียวสื่อว่าผู้ใช้ยืนยันแล้ว |
| ฝ่ายที่รอตอบกลับแล้ว | Info badge; `status` ยังเป็น `waiting` จน GM เปลี่ยนเอง |
| ผู้ขอยังไม่ได้รับแจ้ง | Warning badge + ข้อความ ไม่แสดงเฉพาะสัญลักษณ์ |
| มีผู้แจ้งเพิ่ม X คน | ข้อความกลางหรือ info; ไม่เปลี่ยน priority อัตโนมัติ |
| stale สำหรับ GM | นาฬิกา + label + เส้นขอบ warning 2px; เนื้อหาการ์ดยัง contrast ปกติ |
| เวลาอัปเดตสำหรับผู้ดูอื่น | `text-muted`: “อัปเดตล่าสุด X วันทำการที่แล้ว” |
| งานภายใน / จาก Trello / ยังไม่มอบหมาย | ข้อความกลางและ icon ที่มีชื่อกำกับ ไม่สร้างสถานะงานใหม่ |
| เกิน SLA ใน B | Danger badge แยกจากป้าย status; ใน A ไม่แสดงผลประเมิน SLA |
| Scorecard อีก 3 ตัวที่ยังไม่เชื่อม | ข้อความ “ยังไม่เชื่อมข้อมูล” และลิงก์ต้นทาง ไม่ใช้สีเขียวหรือเลข 0 |

## 5. Dark tokens — เตรียมไว้ ไม่เปิดใน Phase 1

| Token | Dark |
|---|---|
| canvas / surface / surface-muted | #181C17 / #22271F / #2D332A |
| text / text-muted | #F4F1E9 / #BEBFAF |
| border / control-border | #454B40 / #87917E |
| brand-solid / on-brand | #ACCA8B / #1A2813 |
| brand-hover / brand-active | #BDDA9C / #CBE4B0 |
| brand-fg / brand-soft | #C1DCA5 / #2B3B22 |
| info-fg / info-soft | #A8D3F5 / #223649 |
| warning-fg / warning-soft | #FFD38C / #3B2D19 |
| danger-fg / danger-soft | #F2BAB0 / #422D29 |
| focus | #A8D3F5 |

| status key | fg | bg | contrast |
| --- | --- | --- | --- |
| `queued` | #CDD1D9 | #30343C | 8.16:1 |
| `in_progress` | #FFD38C | #3B2D19 | 9.49:1 |
| `waiting` | #D4C6FF | #342D48 | 8.25:1 |
| `completed` | #B7D8A4 | #283B23 | 7.68:1 |
| `cancelled` | #F2BAB0 | #422D29 | 7.58:1 |

สีฐานของสถานะคงเดิม ส่วน fg/bg ปรับสำหรับพื้นมืด รายละเอียด hover/active, progress และ skeleton ครบใน `tokens.json` และรายงาน กราฟ Dark ใช้ฐานสีที่ผ่าน 3:1 กับพื้น Dark ตามรายงานและขอบ/ช่องแบ่งมืด สีขอบมืดไม่ใช่สิ่งที่ใช้แยกกราฟออกจากพื้นมืดเพียงอย่างเดียว

## 6. Typography, geometry และ responsive layout

ฟอนต์เนื้อหาใช้ **IBM Plex Sans Thai Looped**; fallback `Noto Sans Thai`, `system-ui`, `sans-serif` เตรียมไฟล์ font ตอน build และใช้ font-display swap ตัวแพ็กนี้ไม่แนบ binary ของฟอนต์ จึงอาจเห็น fallback เมื่อเปิด palette

| หน้าที่ | ขนาดอ้างอิง | Line height | Weight |
|---|---|---|---|
| เนื้อหา / input / ข้อผิดพลาด | 16px = 1rem | 1.6 | 400 |
| ปุ่ม / label / ป้ายสถานะ | 16px | 1.4 | 500 |
| ข้อความนำ | 18px | 1.6 | 400 |
| h3 | 20px | 1.35 | 600 |
| h2 | 24px | 1.35 | 600 |
| h1 desktop | 32px | 1.35 | 600 |
| ตัวเลข metric | 40px | 1.15 | 600 |
| caption / bottom navigation | 14px | 1.4 | 400–500 |

Mobile ใช้หัวหน้า 24px และ desktop 32px (`text-h2 lg:text-h1`) ข้อมูลหลักไม่ลดต่ำกว่า 16px ใช้ rem สำหรับข้อความ ไม่ตั้งความสูงกล่องที่ทำให้ภาษาไทยถูกตัด ใช้ tabular numerals กับเลขงาน/ตัวเลขเมื่อฟอนต์รองรับ ไอคอน outline ขนาด 20–24px เส้นประมาณ 1.75–2px และมีพื้นที่แตะตามเกณฑ์

| กลุ่ม token | ค่า |
|---|---|
| Spacing | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px |
| Radius | control 12px; card/sheet 16px; badge pill |
| Touch target | อย่างน้อย 44 × 44px; control ทั่วไป min-height 48px |
| Border / emphasis / focus | 1px / 2px / 3px; focus offset 2px |
| Mobile content padding | 16px |
| Bottom navigation | ขั้นต่ำ 80px + safe-area-inset-bottom |
| ปุ่มแจ้งซ่อมกลาง | พื้นที่ปุ่มเป้าหมาย 56px; ไม่ตัด focus ring |
| Sidebar / form max / content max | 232px / 720px / 1536px |
| Desktop board column | 272px เป็นขนาดเป้าหมาย; ใช้ grid ยืดหยุ่นตาม Patch P2 ไม่บังคับ min-width |
| Breakpoints | md 768, lg 1024, xl 1280, 2xl 1536px |
| Elevation | card เบา; raised สำหรับเมนู; dialog เหนือ backdrop |
| z-index | base 0, sticky 10, dropdown 20, nav 30, backdrop 40, dialog 50, toast 60, skip-link 70 |

ใต้ 1024px ใช้ bottom navigation ตาม Part 3: หน้าแรก / คำขอของฉัน / แจ้งซ่อม / บอร์ด / ติดต่อ GM ปุ่มแจ้งซ่อมเข้าฟอร์มได้ในแตะเดียวจากทุกหน้า เนื้อหามี padding ชดเชย nav และ safe area เพื่อไม่ให้บังปุ่มส่ง

บอร์ดมือถือเป็นรายการแบ่งสถานะและมี action บนการ์ด ไม่สร้าง Kanban 5 คอลัมน์ให้ลากบนมือถือ Desktop ใช้ Kanban ได้แต่ต้องมีปุ่ม/เมนูเปลี่ยนสถานะสำหรับ keyboard และผู้ที่ไม่ลากด้วย action รับเรื่อง/ติดตามแล้ว/เสร็จต้องทำได้ไม่เกิน 2 แตะจากการ์ดตามสิทธิ์และฟิลด์ที่จำเป็น

สถานะความคืบหน้าของการอัปโหลดอยู่รายรูป ข้อผิดพลาดมีข้อความและปุ่ม retry ไม่ใช้สีอย่างเดียว ภาพทีม GM ใช้รูปจริงที่ได้รับอนุญาตพร้อมชื่อ ไม่ใช้สี avatar เป็นวิธีระบุตัวตนเพียงอย่างเดียว

## 7. CSS variables และ reference components

ไฟล์เต็ม: `gm-design-tokens/tokens.css` สร้างจาก `tokens.json` ผ่าน `build_tokens.py`

```css
/* Excerpt: RGB channels, not complete CSS color strings */
:root {
  --gm-canvas: 250 248 243;
  --gm-brand-solid: 87 121 55;
  --gm-status-waiting-base: 139 127 209;
  --gm-status-waiting-fg: 96 87 147;
  --gm-status-waiting-bg: 241 237 252;
}
.gm-badge[data-status="waiting"] {
  color: rgb(var(--gm-status-waiting-fg));
  background: rgb(var(--gm-status-waiting-bg));
}
```

```html
<span class="gm-badge" data-status="waiting">
  <span class="gm-status-dot" aria-hidden="true"></span>
  รอผู้อื่น
</span>
```

ไฟล์รวมปุ่ม primary/secondary/danger และ normal/hover/active/disabled, input/invalid, link, focus, badge, stale สำหรับ GM, progress, skeleton และ bottom navigation ไว้เป็น reference component

CSS ไม่ใช่สิทธิ์การเข้าถึง อย่าใช้ `.gm-stale` หรือ class ใดเป็นกลไกซ่อนข้อมูลลับ ฝั่งข้อมูลต้องคัดสิทธิ์ก่อนเข้าถึง component ส่วน `aria-disabled` ต้องหยุด handler ด้วย ใช้ native disabled เมื่อเป็นปุ่มที่ทำไม่ได้จริง

## 8. Tailwind config

ไฟล์เต็ม: `gm-design-tokens/tailwind.config.cjs` อ่านค่า JSON และ map ไปหา CSS variable โดยใช้ alpha placeholder ตามรูปแบบ config:

```js
const color = (name) => `rgb(var(--gm-${name}) / <alpha-value>)`;
// Example mappings from the complete config:
// colors.canvas = color('canvas')
// colors.brand.DEFAULT = color('brand-solid')
// colors.status.waiting.fg = color('status-waiting-fg')
```

ตัวอย่างใช้ semantic utilities:

```html
<article class="bg-surface text-ink rounded-card border border-line p-4">
  <p class="text-ink-muted">อัปเดตล่าสุด 2 วันทำการที่แล้ว</p>
  <span class="bg-status-waiting-bg text-status-waiting-fg rounded-pill px-3 py-1">
    รอผู้อื่น
  </span>
</article>
```

ต้องใช้ชื่อ class แบบเต็มใน source หรือ static mapping ไม่ประกอบ `bg-status-${status}-bg` ขณะ runtime เพราะตัว build อาจไม่สร้าง utility นั้น ทางเลือกที่ตรงไปตรงมาคือ `.gm-badge` + `data-status`

Tailwind v4 ต้องโหลด JavaScript config ด้วย `@config` อย่างชัดเจน จึงมี entry แยก:

```css
@import "tailwindcss";
@import "./tokens.css" layer(components);
@config "./tailwind.config.cjs";
```

ถ้าโปรเจกต์ใช้ v3 ให้ใช้ config เดียวกันกับ entry directives ของ v3 และ import tokens.css ไม่ใช้ entry v4 ผู้ใช้ตรวจ compile กับ Tailwind v4.3.3 แล้ว เลือกเวอร์ชันและล็อก dependency ใน Part 6 ห้ามเพิ่ม CSS แบบไม่มี cascade layer ในแอปจริง กฎ tokens/component ต้องอยู่ components เพื่อให้ utilities override ได้

อ้างอิง: [Tailwind — Functions and directives](https://tailwindcss.com/docs/functions-and-directives), [Tailwind — Upgrade guide](https://tailwindcss.com/docs/upgrade-guide)

## 9. Motion tokens และเหตุผลของแต่ละจังหวะ

ทุกจังหวะมีหน้าที่บอกการเปลี่ยนข้อมูล ไม่มี animation วนไม่จบ การเปลี่ยนข้อมูล/การบันทึกและ focus ไม่ต้องรอ animation เสร็จ

| จังหวะ | Token / เวลา | พฤติกรรม |
|---|---|---|
| hover/press | fast 150ms | เปลี่ยนพื้น/ขอบ ไม่มีการเด้งปุ่มหลัก |
| ป้ายสถานะ | base 200ms | สีพื้นเปลี่ยนอย่างนุ่มนวล ตัวอักษรใหม่ยังอ่านได้ทันที ไม่ fade ตัวอักษรจน contrast ลด |
| เปลี่ยนหน้า | enter 280ms | fade + slide 8px; จัด focus ให้หัวหน้าใหม่ ไม่รอ motion |
| การ์ดใหม่จาก real-time | enter 280ms | เลื่อนเข้า 8px หนึ่งครั้ง ไม่เล่นใหม่ทุก render |
| highlight งานใหม่ | highlight 1500ms | ขอบ info ค่อยๆ หายหนึ่งครั้ง ไม่กระพริบวน |
| การ์ดเปลี่ยนกลุ่ม | layout 300ms | layout animation เมื่อ state เปลี่ยน ไม่ดึง focus/scroll หนีผู้ใช้ |
| Desktop drag/drop | spring 380 / 32 / 0.8 | stiffness / damping / mass; drag momentum false; มีทางเลือกแบบปุ่มเสมอ |
| เครื่องหมายเสร็จ | enter 280ms | วาดเส้น check หนึ่งครั้ง พร้อมข้อความ “เสร็จ” ที่เห็นอยู่แล้ว |
| กราฟและ filter | chart 800ms | อยู่ในช่วง brief 600–900ms ใช้หลังข้อมูลพร้อม ไม่ให้ตัวเลขโหลดช้าตามภาพ |
| Count-up | countup 800ms | ค่าปัจจุบันเข้าถึงได้ทันที; screen reader ไม่อ่านทุกเฟรม |
| Skeleton shimmer | 900ms × 2 รอบ | แล้วหยุดเป็น skeleton นิ่ง หากยังไม่เสร็จใช้ข้อความสถานะ/ลองใหม่ตาม UI spec |
| Toast | enter/base 280/200ms | แสดงเมื่อรายการเกี่ยวข้องอัปเดต ไม่เล่นซ้ำกับทุก render และไม่แย่ง focus |

Easing หลัก `cubic-bezier(.22,1,.36,1)`; การเปลี่ยน control ใช้ `cubic-bezier(.2,0,0,1)` ได้ ห้าม animation ทำให้ auto-close, การแจ้งเตือน, history หรือ stale ถูกนับว่าเป็นการอัปเดตข้อมูล

ไฟล์เต็ม `motion-tokens.ts` ส่งออก `motionTokens` และ `getMotionSettings(reducedMotion: boolean)` ใช้ milliseconds สำหรับ CSS/chart/countup และแปลงเป็น seconds สำหรับ transition ของ Motion เท่านั้น

```ts
const settings = getMotionSettings(reducedMotion);
// settings.page → initial / animate / exit / transition
// settings.layout.enabled → bind to layout animation
// settings.chart → isAnimationActive / animationDuration / animationEasing
// settings.countup / highlight / skeleton → explicit enable/duration/iteration flags
```

### Reduced motion

CSS ปิด animation/transition และ smooth scrolling เมื่อ `prefers-reduced-motion: reduce` ส่วน JavaScript ต้องรับค่าเดียวกันแบบสดและหยุด animation ที่กำลังทำงานด้วย:

- หน้า/การ์ดแสดงตำแหน่งสุดท้ายทันที ไม่มี slide/fade; initial เป็น false
- layout animation, count-up, chart animation, วาด check, highlight และ shimmer ปิดทั้งหมด
- drag ยังคงขยับตาม pointer ได้ แต่ไม่มี spring หลังปล่อย; ปุ่มเปลี่ยนสถานะใช้ได้เหมือนเดิม
- skeleton นิ่ง มีข้อความ loading/ข้อผิดพลาดตามจริง
- หาก preference ยังไม่ resolve ให้เริ่มแบบ reduced เพื่อไม่เริ่ม motion โดยผู้ใช้ไม่ได้เลือก

อย่าพึ่ง CSS media query อย่างเดียวสำหรับ Recharts หรือ Motion ที่ควบคุมด้วย JavaScript

## 10. ชุดไฟล์และวิธีอัปเดต

| File | บทบาท |
|---|---|
| tokens.json | ค่าอ้างอิงหลัก ใช้แก้สี/ขนาด/เวลา |
| build_tokens.py | คำนวณ contrast และสร้างไฟล์ที่ derive จากค่าอ้างอิง |
| tokens.css | Variables ทั้งสองธีมและ reference components |
| tailwind.config.cjs | Mapping สำหรับแอป |
| entry.tailwind-v4.css | วิธีโหลด config บน v4 |
| motion-tokens.ts | ค่าเวลาและ reduced-motion settings |
| contrast-report.md | ตารางทุกคู่สีที่ทดสอบ อ่านตรวจได้ |
| contrast-report.json | ค่า ratio เต็มและผลผ่าน/ไม่ผ่านที่ใช้ตรวจอัตโนมัติ |
| token-preview.html | ตัวอย่างสีและ components ไฟล์เดียว เปิดดูโดยไม่เชื่อม backend |
| README.md | วิธีใช้ ข้อจำกัด และแหล่งอ้างอิง |

แก้ `tokens.json` แล้วเรียก `python gm-design-tokens/build_tokens.py` เมื่อมีคู่สีที่บังคับไม่ผ่าน generator จะออก error ไม่สร้าง CSS ชุดใหม่ ห้ามแก้ตัวเลขรายงานด้วยมือเพื่อให้ผ่าน

## 11. ผลตรวจและขอบเขตการยืนยัน

- Contrast **196/196 คู่ที่กำหนดผ่าน**: Light 92 คู่, Dark 104 คู่ อีก 24 คู่เป็นข้อมูลอ้างอิงสีเดิม พร้อมแสดง FAIL ที่เกิดขึ้นตามจริง
- ป้าย Light ที่ต่ำสุดคือ cancelled ที่ **5.520150035354456:1**; Dark ที่ต่ำสุดคือ cancelled ที่ประมาณ 7.58:1 ตัวเลขสรุปทั้งหมดในเอกสารสร้างจากสูตรเดียวกับรายงาน
- ตรวจสูตรด้วยกรณีดำ/ขาว = 21:1 และสีเดียวกัน = 1:1
- ตรวจ syntax ของ Tailwind config และ motion TypeScript, mapping status ทั้ง 5 ค่าและ breakpoints พร้อมตัวแปร CSS ที่ config อ้างครบ 93 ตัว
- เรียกใช้ motion settings แบบ normal/reduced จริง ตรวจหน่วยเวลาและตัวเลือกหยุด motion แล้ว
- ผลยืนยันเพิ่มเติมจากผู้ใช้: compile กับ Tailwind v4.3.3 + @config ผ่าน ค่า contrast คำนวณซ้ำตรงทุกคู่ และ reduced motion ปิด transition ใน Chromium ได้จริง พบ cascade bug และแก้ตาม Patch P1; ยังไม่ถือเป็นการรับรอง WCAG ของเว็บแอปทั้งระบบ

เงื่อนไขรับงานเมื่อรวมแอป: ไม่ใช้สีสื่อความหมายลำพัง, keyboard/focus ไม่ถูกบังโดย nav/dialog, ภาษาไทยไม่ถูกตัดเมื่อซูม, ภาพ partial upload ระบุจริง, reduced-motion หยุดทั้ง CSS/JS, บอร์ดมือถือมีปุ่ม action และตรวจทุกคู่สีใหม่ที่เกิดจาก component จริงนอกเหนือรายงานนี้

---

จบ Part 4 — รอ “ต่อ” เพื่อเริ่ม Part 5: Clickable prototype ไฟล์ HTML เดียว


## Part 4 — Patch P1/P2

P1: ข้อ 4.5 ในฉบับสนทนา (ข้อ 7–8 ในเอกสารนี้) ใช้ `@import "./tokens.css" layer(components);` ตาม entry ที่แก้แล้ว ห้ามเพิ่มกฎ CSS นอก layer ในแอปจริง

P2: 1024–1535px ให้รอคิว/กำลังทำ/รอผู้อื่นเห็นครบ โดยเสร็จและยกเลิกย่อเป็นแถบชื่อ/จำนวน กดเปิด panel รายการได้ มี badge จำนวนรอยืนยันบนเสร็จ; sidebar ย่อ 72px ช่วง 1024–1365px และ 232px ตั้งแต่ 1366px; ตั้งแต่ 1536px แสดงห้าคอลัมน์แบบยืดหยุ่น ไม่บังคับ 272px จนเกิด page overflow มือถือสูงไม่เกิน 700px ใช้ nav 64px + safe area และชดเชยพื้นที่ action bar
