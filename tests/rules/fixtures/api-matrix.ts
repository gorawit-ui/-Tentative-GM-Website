// S12 — API (Admin SDK) authorization matrix, next to the Rules matrix and over the same subjects
// and sample requests. The API bypasses Rules, so every endpoint that reads data checks the domain
// predicates itself; this table is what `tests/emulator/api-access.test.ts` runs cell by cell and
// what docs/spec/ACL-MATRIX.md shows under “API”. Anything not allowed here must be refused.
import {
  ACTIVE_SUBJECTS,
  CONFIDENTIAL_DETAIL_SUBJECTS,
  DETAIL_SUBJECTS,
  GENERAL_REQUEST_ID,
  GM_SUBJECTS,
  SECRET_REQUEST_ID,
  SUBJECT_KEYS,
  type SubjectKey,
} from './acl-matrix';

export type ApiEndpointKind =
  | 'request_detail'
  | 'history'
  | 'waiting_intervals'
  | 'comments'
  | 'my_requests'
  | 'awaiting_confirmation'
  | 'view_url'
  | 'upload_url.attachment'
  | 'upload_url.watch_contribution'
  | 'mark_seen'
  | 'waiting_preview'
  | 'related_preview'
  | 'gm_history';

export interface ApiEndpoint {
  readonly key: string;
  readonly kind: ApiEndpointKind;
  /** The sample request the call is about (absent for personal lists). */
  readonly requestId?: string;
  readonly description: string;
  readonly allow: readonly SubjectKey[];
}

const ATTACHERS: readonly SubjectKey[] = ['requester', ...GM_SUBJECTS];
/** A06: marking “seen” needs one's own user_state reference with a relation that still holds; GM keep none. */
const SEEN_GENERAL: readonly SubjectKey[] = [...DETAIL_SUBJECTS.filter((key) => !GM_SUBJECTS.includes(key)), 'watcher'];
const SEEN_CONFIDENTIAL: readonly SubjectKey[] = CONFIDENTIAL_DETAIL_SUBJECTS.filter((key) => !GM_SUBJECTS.includes(key));

export const API_ENDPOINTS: readonly ApiEndpoint[] = [
  { key: 'request_detail.general', kind: 'request_detail', requestId: GENERAL_REQUEST_ID, description: 'รายละเอียดงาน (งานไม่ลับ)', allow: DETAIL_SUBJECTS },
  { key: 'request_detail.confidential', kind: 'request_detail', requestId: SECRET_REQUEST_ID, description: 'รายละเอียดงานลับ: GM, ผู้ขอ, grant (D-ACL-2)', allow: CONFIDENTIAL_DETAIL_SUBJECTS },
  { key: 'history.general', kind: 'history', requestId: GENERAL_REQUEST_ID, description: 'history ตามสิทธิ์รายละเอียดของงาน', allow: DETAIL_SUBJECTS },
  { key: 'history.confidential', kind: 'history', requestId: SECRET_REQUEST_ID, description: 'history ของงานลับ', allow: CONFIDENTIAL_DETAIL_SUBJECTS },
  {
    key: 'waiting_intervals.general',
    kind: 'waiting_intervals',
    requestId: GENERAL_REQUEST_ID,
    description: 'ช่วงรอและผู้รับแจ้งของแต่ละช่วง (A04) ตามสิทธิ์รายละเอียดของงาน',
    allow: DETAIL_SUBJECTS,
  },
  { key: 'waiting_intervals.confidential', kind: 'waiting_intervals', requestId: SECRET_REQUEST_ID, description: 'ช่วงรอของงานลับ', allow: CONFIDENTIAL_DETAIL_SUBJECTS },
  { key: 'comments.general', kind: 'comments', requestId: GENERAL_REQUEST_ID, description: 'คอมเมนต์ตามสิทธิ์รายละเอียดของงาน', allow: DETAIL_SUBJECTS },
  { key: 'comments.confidential', kind: 'comments', requestId: SECRET_REQUEST_ID, description: 'คอมเมนต์ของงานลับ', allow: CONFIDENTIAL_DETAIL_SUBJECTS },
  { key: 'my_requests', kind: 'my_requests', description: 'คำขอของฉัน: เฉพาะงานที่ยังมีสิทธิ์ ณ ตอนขอ (watcher เห็นแค่สรุป)', allow: ACTIVE_SUBJECTS },
  { key: 'awaiting_confirmation', kind: 'awaiting_confirmation', description: 'จำนวนงานรอฉันยืนยัน (D-S10-2)', allow: ACTIVE_SUBJECTS },
  { key: 'view_url.general', kind: 'view_url', requestId: GENERAL_REQUEST_ID, description: 'ลิงก์ดูรูป GET 5 นาที: คนที่อ่านงานนั้นได้', allow: DETAIL_SUBJECTS },
  { key: 'view_url.confidential', kind: 'view_url', requestId: SECRET_REQUEST_ID, description: 'ลิงก์ดูรูปของงานลับ', allow: CONFIDENTIAL_DETAIL_SUBJECTS },
  { key: 'upload_url.attachment.general', kind: 'upload_url.attachment', requestId: GENERAL_REQUEST_ID, description: 'ลิงก์อัปโหลด PUT 15 นาที: GM และผู้ขอ (related ใช้คอมเมนต์แทน, D-S12-2); งานที่ปิด/ยกเลิกแล้วไม่รับ (D-S12-4)', allow: ATTACHERS },
  { key: 'upload_url.attachment.confidential', kind: 'upload_url.attachment', requestId: SECRET_REQUEST_ID, description: 'ลิงก์อัปโหลดของงานลับ: GM และผู้ขอ', allow: ATTACHERS },
  {
    key: 'upload_url.watch_contribution.general',
    kind: 'upload_url.watch_contribution',
    requestId: GENERAL_REQUEST_ID,
    description: 'รูปของผู้แจ้งเพิ่มตอนกดติดตาม 1 ครั้ง ไม่เกิน 3 รูป (U1, D-S12-3) — watcher เท่านั้น ดูรูปตัวเองหลังส่งไม่ได้',
    allow: ['watcher'],
  },
  {
    key: 'mark_seen.general',
    kind: 'mark_seen',
    requestId: GENERAL_REQUEST_ID,
    description: 'บันทึกว่าเปิดดูแล้ว (จุด “มีอัปเดตใหม่”, A06): เจ้าของ user_state ที่ความสัมพันธ์ยังจริง — ผู้ขอ, related ที่อ่านได้, watcher ของงานไม่ลับ; GM ไม่มี user_state',
    allow: SEEN_GENERAL,
  },
  {
    key: 'mark_seen.confidential',
    kind: 'mark_seen',
    requestId: SECRET_REQUEST_ID,
    description: 'บันทึกว่าเปิดดูแล้วของงานลับ: ผู้ขอและ grant (watcher ไม่มีสิทธิ์)',
    allow: SEEN_CONFIDENTIAL,
  },
  { key: 'waiting_preview.general', kind: 'waiting_preview', requestId: GENERAL_REQUEST_ID, description: 'ดูก่อนยืนยันรอผู้อื่น (A04): ผู้รับแจ้ง/คนที่จะเป็น related/ต้องยืนยัน grant หรือไม่ — GM เท่านั้น', allow: GM_SUBJECTS },
  { key: 'waiting_preview.confidential', kind: 'waiting_preview', requestId: SECRET_REQUEST_ID, description: 'ดูก่อนยืนยันรอผู้อื่นของงานลับ — GM เท่านั้น', allow: GM_SUBJECTS },
  { key: 'related_preview.general', kind: 'related_preview', requestId: GENERAL_REQUEST_ID, description: 'ดูก่อนยืนยันเพิ่มผู้เกี่ยวข้อง (FU-12) — GM เท่านั้น', allow: GM_SUBJECTS },
  { key: 'gm_history.general', kind: 'gm_history', requestId: GENERAL_REQUEST_ID, description: 'ประวัติเฉพาะ GM (D-A04-8 เหตุผลปลดธงลับ; watcher contribution) — GM เท่านั้น', allow: GM_SUBJECTS },
  { key: 'gm_history.confidential', kind: 'gm_history', requestId: SECRET_REQUEST_ID, description: 'ประวัติเฉพาะ GM ของงานลับ — GM เท่านั้น', allow: GM_SUBJECTS },
  { key: 'related_preview.confidential', kind: 'related_preview', requestId: SECRET_REQUEST_ID, description: 'ดูก่อนยืนยันเพิ่มผู้เกี่ยวข้องของงานลับ: ใครต้องได้ grant (D-ACL-2) — GM เท่านั้น', allow: GM_SUBJECTS },
];

export function apiDecide(subject: SubjectKey, endpointKey: string): 'allow' | 'deny' {
  const endpoint = API_ENDPOINTS.find((candidate) => candidate.key === endpointKey);
  return endpoint?.allow.includes(subject) === true ? 'allow' : 'deny';
}

export interface ApiCell {
  readonly subject: SubjectKey;
  readonly endpoint: ApiEndpoint;
  readonly expected: 'allow' | 'deny';
}

export function apiCells(): readonly ApiCell[] {
  return SUBJECT_KEYS.flatMap((subject) => API_ENDPOINTS.map((endpoint) => ({ subject, endpoint, expected: apiDecide(subject, endpoint.key) })));
}
