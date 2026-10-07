// D-ACL-5/6 — where each screen loads its data under the ACL matrix, and the Storage policy. Rendered
// into docs/spec/ACL-MATRIX.md; `screen-sources.test.ts` checks that every Firestore source a screen
// uses is allowed for everyone who opens that screen, so the table cannot promise a read the Rules deny.
// Anything a screen cannot load under these rules is listed as an open question (docs/sessions/S10.md),
// not fixed by widening the Rules.
import { ACTIVE_SUBJECTS, GM_SUBJECTS, type AclOperation, type SubjectKey } from './acl-matrix';

export interface FirestoreSource {
  /** `RESOURCES[].key` in the ACL matrix. */
  readonly resource: string;
  readonly operations: readonly AclOperation[];
  readonly use: string;
  /** Only part of the screen's audience uses this source (e.g. a confidential request needs a grant). */
  readonly audience?: readonly SubjectKey[];
}

export interface ScreenDataSources {
  readonly screen: string;
  readonly audience: readonly SubjectKey[];
  readonly audienceLabel: string;
  readonly firestore: readonly FirestoreSource[];
  /** Data that only the API returns (it checks the ACL itself, Part 6 §6.5). */
  readonly api: readonly string[];
  /** Open questions in docs/sessions/S10.md: data the screen needs that it cannot load under this matrix. */
  readonly questions: readonly string[];
}

const RELATED: readonly SubjectKey[] = ['related_person', 'related_unconfirmed', 'viewer_related', 'viewer_unconfirmed'];
const RELATED_GRANTED: readonly SubjectKey[] = ['related_person', 'viewer_related'];
const NON_GM_ACTIVE: readonly SubjectKey[] = ACTIVE_SUBJECTS.filter((key) => !GM_SUBJECTS.includes(key));

export const SCREEN_SOURCES: readonly ScreenDataSources[] = [
  {
    screen: 'บอร์ดสาธารณะ (UI-08 มุมมองสรุป)',
    audience: ACTIVE_SUBJECTS,
    audienceLabel: 'ทุกบัญชีที่ใช้งานได้',
    firestore: [
      { resource: 'request_summaries', operations: ['list'], use: 'query งานเปิด / รอยืนยัน / ปิด 7 วัน แบบแบ่งหน้า (§6.11) — งานลับไม่มี document' },
      { resource: 'board_counters', operations: ['get'], use: '“งานภายใน X รายการ” จาก document public เท่านั้น' },
      { resource: 'locations', operations: ['list'], use: 'ชื่อสถานที่บนการ์ดและ filter' },
      { resource: 'areas', operations: ['list'], use: 'ชื่อบริเวณบนการ์ด' },
    ],
    api: [],
    questions: [],
  },
  {
    screen: 'บอร์ด GM (UI-08 มุมมองจัดการ)',
    audience: GM_SUBJECTS,
    audienceLabel: 'GM Staff / GM Admin',
    firestore: [
      { resource: 'gm_request_summaries', operations: ['list'], use: 'การ์ดทุกงานรวมงานลับ/stale แบบแบ่งหน้า' },
      { resource: 'people_picker', operations: ['list'], use: 'filter คน, sheet มอบหมาย/รอผู้อื่น/เพิ่มคนในงานลับ (D-ACL-1)' },
      { resource: 'gm_profile_summaries', operations: ['list'], use: 'presence/ลา ของ GM ใน sheet มอบหมาย' },
      { resource: 'locations', operations: ['list'], use: 'ชื่อสถานที่' },
      { resource: 'areas', operations: ['list'], use: 'ชื่อบริเวณ' },
    ],
    api: ['ทุก action (รับ/มอบหมาย/รอ/เสร็จ/ยกเลิก/เปิดกลับ/ติดธงลับ) เป็น command ผ่าน API'],
    questions: [],
  },
  {
    screen: 'หน้าแรก — ทีม GM ตอนนี้ และบอร์ดย่อ (UI-02)',
    audience: ACTIVE_SUBJECTS,
    audienceLabel: 'ทุกบัญชีที่ใช้งานได้',
    firestore: [
      { resource: 'gm_profile_summaries', operations: ['list'], use: 'presence และงานที่กำลังทำแบบปลอดภัย (งานลับเป็น “งานภายใน”)' },
      { resource: 'request_summaries', operations: ['list'], use: 'บอร์ดย่อ: จำนวน 5 สถานะและการ์ดล่าสุด' },
      { resource: 'board_counters', operations: ['get'], use: '“งานภายใน X รายการ”' },
    ],
    api: [
      'ชื่อ/เลขงานลับที่ GM กำลังทำ เฉพาะผู้ดูที่มีสิทธิ์ (endpoint ส่วนบุคคล ตรวจ ACL, §6.4.1)',
      'เจ้าของ profile เปลี่ยน presence/ลา ผ่าน command',
    ],
    questions: [],
  },
  {
    screen: 'หน้าแรก — แถบ “มี X งานรอคุณยืนยัน” (UI-02)',
    audience: NON_GM_ACTIVE,
    audienceLabel: 'ผู้ขอ (ทุกบัญชีที่ใช้งานได้)',
    firestore: [],
    api: ['จำนวนงานที่ requester_id = ฉัน, status = completed และยังไม่มี closed_at (Part 2 Addendum) จาก endpoint ส่วนบุคคลเดียวกับคำขอของฉัน (D-S10-2)'],
    questions: [],
  },
  {
    screen: 'คำขอของฉัน — แท็บที่ฉันขอ (UI-06)',
    audience: ACTIVE_SUBJECTS,
    audienceLabel: 'ทุกบัญชีที่ใช้งานได้',
    firestore: [{ resource: 'user_state.own', operations: ['list'], use: 'รายการงานของฉัน (relation type) และ last_seen_activity_seq สำหรับจุด “มีอัปเดตใหม่”' }],
    api: ['สรุปการ์ดของแต่ละงาน (สถานะ ผู้รับผิดชอบ รอใคร กำหนดยืนยัน) — API ตรวจ ACL ปัจจุบันก่อนคืน (§6.4 แถว user_state)'],
    questions: [],
  },
  {
    screen: 'คำขอของฉัน — แท็บเกี่ยวข้องกับฉัน รวมงานที่ติดตาม (UI-06)',
    audience: ACTIVE_SUBJECTS,
    audienceLabel: 'ทุกบัญชีที่ใช้งานได้',
    firestore: [
      { resource: 'user_state.own', operations: ['list'], use: 'งานที่ฉันเป็น related หรือ watcher (relation type)' },
      { resource: 'request_summaries', operations: ['get'], use: 'งานที่ติดตาม: “ติดตามอยู่ — ดูข้อมูลสรุป” (Part 3 Addendum)' },
    ],
    api: ['สรุปการ์ดของงานที่ฉันเป็น related — API ตรวจ ACL ปัจจุบัน (งานลับเฉพาะเมื่อได้รับการยืนยัน, D-ACL-2)'],
    questions: [],
  },
  {
    screen: 'รายละเอียด — ผู้ขอ (UI-07)',
    audience: ['requester'],
    audienceLabel: 'ผู้ขอของงาน',
    firestore: [
      { resource: 'requests.general', operations: ['get'], use: 'รายละเอียดงาน พร้อมชื่อผู้สร้าง ผู้ขอ ผู้รับผิดชอบ และ related เป็นคู่ person_id + display_name (D-S10-1, D-S11-1)' },
      { resource: 'requests.confidential', operations: ['get'], use: 'รายละเอียดงานลับของตัวเอง' },
      { resource: 'locations', operations: ['get'], use: 'ชื่อสถานที่' },
      { resource: 'areas', operations: ['get'], use: 'ชื่อบริเวณ' },
    ],
    api: ['คอมเมนต์, history, ช่วงรอ, ลิงก์รูป (signed URL) — API ตรวจ parent ACL', 'ยืนยัน / ยังไม่เรียบร้อย / คอมเมนต์ / แนบรูป เป็น command'],
    questions: [],
  },
  {
    screen: 'รายละเอียด — related (UI-07)',
    audience: RELATED,
    audienceLabel: 'related person ทุก role',
    firestore: [
      { resource: 'requests.general', operations: ['get'], use: 'รายละเอียดงานไม่ลับ พร้อมชื่อคนในงาน (D-S10-1; เห็นอีเมล related คนอื่นในงานเดียวกันได้, D-ACL-1)' },
      { resource: 'requests.confidential', operations: ['get'], use: 'งานลับ: เฉพาะคนใน confidential_grant_ids (D-ACL-2)', audience: RELATED_GRANTED },
      { resource: 'locations', operations: ['get'], use: 'ชื่อสถานที่' },
      { resource: 'areas', operations: ['get'], use: 'ชื่อบริเวณ' },
    ],
    api: ['คอมเมนต์, history, ช่วงรอ, ลิงก์รูป — API ตรวจ parent ACL', 'คอมเมนต์ เป็น command'],
    questions: [],
  },
  {
    screen: 'รายละเอียด — ฝ่ายที่ถูกรอ (UI-07)',
    audience: ['waiting_party'],
    audienceLabel: 'ผู้รับแจ้งของช่วงรอปัจจุบัน (เป็น related และได้รับการยืนยันในงานลับ)',
    firestore: [
      { resource: 'requests.general', operations: ['get'], use: 'รายละเอียดงานและ waiting_on' },
      { resource: 'requests.confidential', operations: ['get'], use: 'งานลับที่ได้รับการยืนยัน' },
    ],
    api: ['ฉันเป็น recipient ของช่วงปัจจุบันหรือไม่ (recipients อยู่ใน waiting_intervals ที่ client อ่านตรงไม่ได้)', '“ฝั่งฉันเรียบร้อยแล้ว” เป็น command'],
    questions: [],
  },
  {
    screen: 'รายละเอียด — watcher (UI-07 มุมมอง summary-only)',
    audience: ['watcher'],
    audienceLabel: 'ผู้แจ้งเพิ่ม (watcher)',
    firestore: [
      { resource: 'request_summaries', operations: ['get'], use: 'มุมมองสรุปเท่านั้น (งานกลายเป็นลับ → ไม่มี document)' },
      { resource: 'locations', operations: ['get'], use: 'ชื่อสถานที่' },
      { resource: 'areas', operations: ['get'], use: 'ชื่อบริเวณ' },
    ],
    api: ['หมายเหตุ/รูปที่ตัวเองแจ้งเพิ่ม (contribution ใน gm_history) — API คืนเฉพาะของตัวเอง'],
    questions: [],
  },
  {
    screen: 'ต่ออายุ (Infrastructure R4)',
    audience: GM_SUBJECTS,
    audienceLabel: 'GM Staff / GM Admin',
    firestore: [
      { resource: 'renewal_items', operations: ['list'], use: 'รายการ active เรียงตาม expires_on (§6.11)' },
      { resource: 'renewal_items.cycles', operations: ['list'], use: 'รอบต่ออายุของรายการ' },
      { resource: 'gm_request_summaries', operations: ['get'], use: 'สถานะงานต่ออายุที่เปิดแล้ว' },
    ],
    api: ['เพิ่ม/แก้/ปิดรอบ/archive/import เป็น command'],
    questions: [],
  },
  {
    screen: 'Dashboard / Scorecard / CSV (UI-11, ด่าน B)',
    audience: [...GM_SUBJECTS, 'viewer', 'viewer_related', 'viewer_unconfirmed'],
    audienceLabel: 'GM (full scope) และ Viewer (public scope)',
    firestore: [],
    api: ['aggregate ตาม scope + visibility_epoch — client ไม่อ่าน dashboard_public / dashboard_gm / scorecards ตรง (§6.4)'],
    questions: [],
  },
];

/** D-ACL-5: Storage objects (Part 6 §6.10). Firebase Storage Rules deny every client, every role. */
export const STORAGE_SAMPLE_PATHS: readonly string[] = [
  'requests/req-acl-general/attachments/att-acl-1.jpg',
  'requests/req-acl-secret/attachments/att-acl-2.jpg',
  'pending/uid-requester/upload-1.jpg',
  'contributions/req-acl-general/acl.watcher@tdfb.co/photo-1.jpg',
  'renewals/ri-1/document.pdf',
  'unknown/path.bin',
];

export const STORAGE_POLICY: readonly string[] = [
  'client อ่าน เขียน list หรือลบ object ใน Storage ผ่าน Firebase SDK ไม่ได้ทุก role (`infra/storage.rules` ปฏิเสธทั้งหมด) — ทดสอบใน Rules tests ทุก subject × ตัวอย่าง path',
  'bucket เป็น private และ uniform bucket-level access ไม่มี public ACL และไม่ใช้ Firebase download-token URL อายุยาว (§6.10)',
  'ดูรูป/ไฟล์: API ตรวจ ACL ปัจจุบันของงาน (หรือ contribution ของตัวเองสำหรับ watcher) ทุกครั้งที่ขอลิงก์ แล้วออก **signed URL แบบ GET เฉพาะ object นั้น อายุสั้น 5 นาที** (Part 6 §6.10, D-S10-3) เป็น bearer จนหมดอายุ จึงมี revoke window ไม่เกินอายุลิงก์; หน้าเว็บขอ URL ใหม่เองเมื่อหมดอายุ; ห้าม log URL; response เป็น private, no-store',
  'อัปโหลด: browser ส่งไฟล์ตรงไป Storage ไม่ผ่าน API ทั้งไฟล์ ด้วย **signed URL แบบ PUT เฉพาะ object อายุ 15 นาที** (D-S10-3: รูปย่อแล้วไฟล์เล็ก เผื่อเน็ตช้าที่คลังและโรงงาน) ที่ API ออกให้หลังตรวจสิทธิ์ ผูก actor + request/contribution จำกัดขนาด/ชนิด เป็นสถานะ pending',
  'pending ไม่เปิดให้ผู้อื่น; server finalize ตรวจขนาดจริงและ decode ภาพก่อนเปิดอ่าน; orphan ลบหลัง 24 ชม. ผ่าน cleanup เดิม; เดา path ไม่ได้สิทธิ์',
  'ไม่ persistent-cache รูปหรือรายละเอียดลับใน PWA',
  'ทดสอบ upload/finalize/signed URL กับ path ของคนอื่นใน S12 (API/Storage authorization emulator)',
];
