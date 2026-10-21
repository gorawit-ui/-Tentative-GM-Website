// A11 — the Admin pages talk to the API only (Part 6 §6.4 “GM Admin แก้ผ่าน API”): every call carries
// the signed-in person's ID token, the API checks the role again, and a change is a command with its
// own idempotency key (a retry of the same click never runs twice). Errors come back as codes.
import type { AdminCalendarView, AdminHealthView, AdminPlacesView, PeopleImportRow } from '@gm/contracts';
import type { Role } from '@gm/domain';
import { ApiCallError, apiCall } from '../api-client';

export { ApiCallError as AdminApiError } from '../api-client';

const call = apiCall;

export const getPlaces = () => call<AdminPlacesView>('GET', '/api/admin/places');
export const getCalendar = () => call<AdminCalendarView>('GET', '/api/admin/calendar');
export const getHealth = () => call<AdminHealthView>('GET', '/api/admin/health');

// ---------- A10: people ----------

export interface PersonView {
  readonly person_id: string;
  readonly name: string;
  readonly team_label?: string;
  readonly role: Role;
  readonly active: boolean;
  readonly linked: boolean;
  readonly slack_mapped: boolean;
  readonly in_latest_import: boolean;
  /** D-A10-2: open requests this person is the assignee of. */
  readonly open_assigned: number;
}

export interface PeoplePage {
  readonly people: readonly PersonView[];
  readonly total: number;
  readonly next_offset?: number;
  readonly latest_import?: { readonly at: number; readonly counts: Readonly<Record<string, number>> };
}

export interface UnlistedLogin {
  readonly email: string;
  readonly first_seen_at: number;
  readonly last_seen_at: number;
  readonly count: number;
}

export const getPeople = (query: string, offset = 0) => call<PeoplePage>('GET', `/api/admin/people?q=${encodeURIComponent(query)}&offset=${offset}`);
export const getUnlisted = () => call<{ readonly items: readonly UnlistedLogin[] }>('GET', '/api/admin/unlisted-logins');

export interface PreviewRow {
  readonly line: number;
  readonly email: string;
  readonly status: 'new' | 'update' | 'same' | 'error';
  readonly codes?: readonly string[];
  readonly changes?: readonly ('name' | 'team' | 'slack')[];
}

export interface PeoplePreview {
  readonly rows: readonly PreviewRow[];
  readonly counts: { readonly new: number; readonly update: number; readonly same: number; readonly error: number };
  readonly not_in_file: number;
}

/** Only the chosen columns, already as rows: the file itself never leaves the browser. */
export const previewPeople = (rows: readonly PeopleImportRow[], slackColumn: boolean) => call<PeoplePreview>('POST', '/api/admin/people/preview', { rows, slack_column: slackColumn });
export const importPeople = (importId: string, rows: readonly PeopleImportRow[], slackColumn: boolean) =>
  call<{ readonly replayed: boolean; readonly result: { readonly created: number; readonly updated: number; readonly unchanged: number; readonly skipped: number; readonly not_in_file: number } }>(
    'POST',
    '/api/admin/people/import',
    { import_id: importId, rows, slack_column: slackColumn },
  );

export interface AdminCommandReply {
  readonly replayed: boolean;
  readonly result: Readonly<Record<string, unknown>>;
}

/** One Admin change; `commandId` is the idempotency key of this one click. */
export function adminCommand(type: string, payload: Record<string, unknown>, commandId: string = crypto.randomUUID()): Promise<AdminCommandReply> {
  return call<AdminCommandReply>('POST', '/api/admin/commands', { command_id: commandId, type, payload });
}

/** Thai words for the codes an Admin page can meet (Part 3 §13 states: say why, keep the form). */
const MESSAGES: Readonly<Record<string, string>> = {
  AREA_LABEL_TAKEN: 'มีบริเวณชื่อนี้ในสถานที่นี้แล้ว',
  LABEL_INVALID: 'ชื่อต้องมี 1–60 ตัวอักษร (ชื่อคนไม่เกิน 100)',
  LOCATION_INACTIVE: 'สถานที่นี้ถูกปิดใช้งาน เปิดใช้งานก่อนเพิ่มบริเวณ',
  LOCATION_NOT_FOUND: 'ไม่พบสถานที่นี้ ลองโหลดหน้าใหม่',
  AREA_NOT_FOUND: 'ไม่พบบริเวณนี้ ลองโหลดหน้าใหม่',
  AREA_INACTIVE: 'บริเวณนี้ถูกปิดใช้งาน เลือกบริเวณอื่น',
  AREA_HAS_QR: 'บริเวณนี้มี QR แล้ว',
  QR_NOT_FOUND: 'ไม่พบ QR นี้ ลองโหลดหน้าใหม่',
  QR_SAME_AREA: 'QR นี้ชี้ไปที่บริเวณนี้อยู่แล้ว',
  HOLIDAY_EXISTS: 'มีวันหยุดวันนี้แล้ว',
  HOLIDAY_NOT_FOUND: 'ไม่พบวันหยุดนี้ ลองโหลดหน้าใหม่',
  HOLIDAY_YEAR_OUT_OF_RANGE: 'ปีต้องอยู่ระหว่าง พ.ศ. 2543–2643',
  WEEKDAYS_INVALID: 'เลือกวันทำงานอย่างน้อย 1 วัน',
  WEEKDAYS_LOCKED: 'ด่านนี้ใช้จันทร์–ศุกร์ทั้งบริษัท ตั้งเสาร์–อาทิตย์รายสถานที่ได้ในรุ่นถัดไป',
  LOCATION_LABEL_TAKEN: 'มีสถานที่ชื่อนี้แล้ว',
  LAST_GM_ADMIN: 'ต้องมี GM Admin ที่ใช้งานอยู่อย่างน้อย 1 คน จึงเปลี่ยนสิทธิ์หรือปิดบัญชีคนนี้ไม่ได้',
  PERSON_EXISTS: 'คนนี้อยู่ในรายชื่อแล้ว',
  OPEN_REQUESTS_ASSIGNED: 'จำนวนงานที่คนนี้รับผิดชอบเปลี่ยนไปแล้ว ตรวจจำนวนใหม่แล้วยืนยันอีกครั้ง',
  PERSON_NOT_FOUND: 'ไม่พบคนนี้ในรายชื่อ ลองโหลดหน้าใหม่',
  FIELD_INVALID: 'ข้อมูลไม่ถูกต้อง ตรวจแล้วลองใหม่',
  GM_ADMIN_ONLY: 'บัญชีนี้ไม่มีสิทธิ์ GM Admin',
  NETWORK: 'เชื่อมต่อไม่ได้ ตรวจการเชื่อมต่อแล้วลองใหม่',
};

export function adminErrorText(error: unknown): string {
  const code = error instanceof ApiCallError ? error.code : 'INTERNAL';
  return MESSAGES[code] ?? `บันทึกไม่สำเร็จ (${code}) ลองใหม่อีกครั้ง`;
}
