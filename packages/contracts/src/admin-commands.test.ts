// A11 — Admin commands at the API boundary (Part 3 §13, Part 6 §6.4 “GM Admin แก้ผ่าน API”): the same
// strict envelope as request commands (a lowercase UUID per action, so a retry never runs twice); the
// server decides everything else. Dates travel as ค.ศ. `YYYY-MM-DD` (the page converts from พ.ศ.).
import { describe, expect, it } from 'vitest';
import { ADMIN_COMMAND_TYPES, ContractRejected, parseAdminCommand } from './index';

const ID = '0b9d6c43-8a1e-4c55-9e0f-3f7f5f1a2b3c';
const QR = 'Qr1234567890abcdefghij';

function rejection(body: unknown): { code: string; path: string } {
  try {
    parseAdminCommand(body);
  } catch (error) {
    if (error instanceof ContractRejected) return { code: error.code, path: error.path };
    throw error;
  }
  throw new Error('accepted');
}

describe('parseAdminCommand', () => {
  it('knows the Admin commands of A11', () => {
    expect(ADMIN_COMMAND_TYPES).toEqual([
      'seed_places',
      'add_location',
      'rename_location',
      'add_area',
      'rename_area',
      'set_area_active',
      'set_location_active',
      'create_qr',
      'move_qr',
      'set_qr_active',
      'set_open_weekdays',
      'put_holiday',
      'remove_holiday',
      'set_reminder_time',
      'set_person_role',
      'set_person_active',
      'add_person',
      'update_person',
    ]);
  });

  it.each([
    [{ type: 'seed_places', payload: {} }],
    [{ type: 'add_location', payload: { label: 'คลังสินค้า บางนา' } }],
    [{ type: 'rename_location', payload: { location_id: 'loc-fac16', label: 'FAC16 (โรงงานใหม่)' } }],
    [{ type: 'add_area', payload: { location_id: 'loc-fac16', label: 'ห้องประชุม' } }],
    [{ type: 'rename_area', payload: { area_id: 'area-wh300-qa-1', label: 'ห้อง QA' } }],
    [{ type: 'set_area_active', payload: { area_id: 'area-wh300-qa-1', active: false } }],
    [{ type: 'set_location_active', payload: { location_id: 'loc-cafe222', active: false } }],
    [{ type: 'create_qr', payload: { area_id: 'area-wh300-qa-1' } }],
    [{ type: 'move_qr', payload: { qr_id: QR, area_id: 'area-wh300-qa-1' } }],
    [{ type: 'set_qr_active', payload: { qr_id: QR, active: true } }],
    [{ type: 'set_open_weekdays', payload: { open_weekdays: [1, 2, 3, 4, 5] } }],
    [{ type: 'put_holiday', payload: { date: '2027-01-01', name: 'วันขึ้นปีใหม่' } }],
    [{ type: 'put_holiday', payload: { date: '2027-01-02', name: 'ชดเชย', replaces: '2027-01-01' } }],
    [{ type: 'remove_holiday', payload: { date: '2027-01-01' } }],
    [{ type: 'set_reminder_time', payload: { working_morning_time: '08:30' } }],
    [{ type: 'set_person_role', payload: { person_id: 'somchai@tdfb.co', role: 'gm_staff' } }],
    [{ type: 'set_person_active', payload: { person_id: 'somchai@tdfb.co', active: false } }],
    [{ type: 'add_person', payload: { email: 'new.person@tdfb.co', name: 'คุณใหม่', team: 'ฝ่ายขาย' } }],
    // D-A10-2: switching off a GM with open requests carries the count the Admin confirmed.
    [{ type: 'set_person_active', payload: { person_id: 'somchai@tdfb.co', active: false, release_open_requests: 3 } }],
    // D-A10-6: name and team by hand; no team = the team is cleared.
    [{ type: 'update_person', payload: { person_id: 'somchai@tdfb.co', name: 'คุณสมชาย ใจดี', team: 'ฝ่ายผลิต' } }],
    [{ type: 'update_person', payload: { person_id: 'somchai@tdfb.co', name: 'คุณสมชาย ใจดี' } }],
  ])('%o', (command) => {
    expect(parseAdminCommand({ command_id: ID, ...command })).toEqual({ command_id: ID, ...command });
  });

  it('a request command is not an Admin command, and the other way round', () => {
    expect(rejection({ command_id: ID, type: 'watch_request', payload: { request_id: 'req-1' } })).toEqual({ code: 'COMMAND_TYPE_UNKNOWN', path: 'type' });
  });

  it.each([
    [{ command_id: 'not-a-uuid', type: 'seed_places', payload: {} }, 'COMMAND_ID_INVALID', 'command_id'],
    [{ command_id: ID, type: 'seed_places', payload: {}, extra: 1 }, 'UNKNOWN_FIELD', 'extra'],
    [{ command_id: ID, type: 'seed_places', payload: { places: [] } }, 'UNKNOWN_FIELD', 'payload.places'],
    [{ command_id: ID, type: 'add_area', payload: { location_id: 'loc/../x', label: 'ห้อง' } }, 'FIELD_INVALID', 'payload.location_id'],
    [{ command_id: ID, type: 'add_area', payload: { location_id: 'loc-fac16' } }, 'FIELD_REQUIRED', 'payload.label'],
    [{ command_id: ID, type: 'set_area_active', payload: { area_id: 'area-1', active: 'no' } }, 'FIELD_TYPE', 'payload.active'],
    [{ command_id: ID, type: 'move_qr', payload: { qr_id: 'qr-guessable', area_id: 'area-1' } }, 'FIELD_INVALID', 'payload.qr_id'],
    [{ command_id: ID, type: 'set_open_weekdays', payload: { open_weekdays: [] } }, 'FIELD_INVALID', 'payload.open_weekdays'],
    [{ command_id: ID, type: 'set_open_weekdays', payload: { open_weekdays: [1, 1] } }, 'FIELD_INVALID', 'payload.open_weekdays'],
    [{ command_id: ID, type: 'set_open_weekdays', payload: { open_weekdays: [0, 8] } }, 'FIELD_INVALID', 'payload.open_weekdays'],
    [{ command_id: ID, type: 'set_open_weekdays', payload: { open_weekdays: '1-5' } }, 'FIELD_TYPE', 'payload.open_weekdays'],
    [{ command_id: ID, type: 'put_holiday', payload: { date: '1/1/2570', name: 'x' } }, 'FIELD_INVALID', 'payload.date'],
    [{ command_id: ID, type: 'put_holiday', payload: { date: '2027-02-30', name: 'x' } }, 'FIELD_INVALID', 'payload.date'],
    [{ command_id: ID, type: 'put_holiday', payload: { date: '2027-01-01', name: 'x', replaces: 'เมื่อวาน' } }, 'FIELD_INVALID', 'payload.replaces'],
    [{ command_id: ID, type: 'remove_holiday', payload: {} }, 'FIELD_REQUIRED', 'payload.date'],
    [{ command_id: ID, type: 'set_reminder_time', payload: { working_morning_time: '9 โมง' } }, 'FIELD_INVALID', 'payload.working_morning_time'],
    [{ command_id: ID, type: 'set_person_active', payload: { person_id: 'a@tdfb.co', active: false, release_open_requests: -1 } }, 'FIELD_INVALID', 'payload.release_open_requests'],
    [{ command_id: ID, type: 'set_person_active', payload: { person_id: 'a@tdfb.co', active: false, release_open_requests: 1.5 } }, 'FIELD_INVALID', 'payload.release_open_requests'],
    // D-A10-5: the hand-added e-mail is checked like an imported one.
    [{ command_id: ID, type: 'add_person', payload: { email: 'new.person@gmail.com', name: 'คนนอก' } }, 'FIELD_INVALID', 'payload.email'],
    [{ command_id: ID, type: 'update_person', payload: { person_id: 'A@TDFB.CO', name: 'x' } }, 'FIELD_INVALID', 'payload.person_id'],
    [{ command_id: ID, type: 'update_person', payload: { person_id: 'a@tdfb.co' } }, 'FIELD_REQUIRED', 'payload.name'],
  ])('%o → %s at %s', (body, code, path) => {
    expect(rejection(body)).toEqual({ code, path });
  });
});
