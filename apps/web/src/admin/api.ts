// A11 — the Admin pages talk to the API only (Part 6 §6.4 “GM Admin แก้ผ่าน API”): every call carries
// the signed-in person's ID token, the API checks the role again, and a change is a command with its
// own idempotency key (a retry of the same click never runs twice). Errors come back as codes.
import type { AdminCalendarView, AdminHealthView, AdminPlacesView } from '@gm/contracts';
import { auth, webConfig } from '../firebase';

export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const user = auth.currentUser;
  if (user === null) throw new AdminApiError(401, 'UNAUTHENTICATED');
  let response: Response;
  try {
    response = await fetch(`${webConfig.apiBaseUrl}${path}`, {
      method,
      credentials: 'omit',
      headers: { authorization: `Bearer ${await user.getIdToken()}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new AdminApiError(0, 'NETWORK');
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new AdminApiError(response.status, typeof payload.error === 'string' ? payload.error : 'INTERNAL');
  return payload as T;
}

export const getPlaces = () => call<AdminPlacesView>('GET', '/api/admin/places');
export const getCalendar = () => call<AdminCalendarView>('GET', '/api/admin/calendar');
export const getHealth = () => call<AdminHealthView>('GET', '/api/admin/health');

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
  LABEL_INVALID: 'ชื่อต้องมี 1–60 ตัวอักษร',
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
  GM_ADMIN_ONLY: 'บัญชีนี้ไม่มีสิทธิ์ GM Admin',
  NETWORK: 'เชื่อมต่อไม่ได้ ตรวจการเชื่อมต่อแล้วลองใหม่',
};

export function adminErrorText(error: unknown): string {
  const code = error instanceof AdminApiError ? error.code : 'INTERNAL';
  return MESSAGES[code] ?? `บันทึกไม่สำเร็จ (${code}) ลองใหม่อีกครั้ง`;
}
