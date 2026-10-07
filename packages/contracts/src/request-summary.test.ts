// S08 — public projection contract (Part 6 §6.4.1, C11, TEST-CHECKLIST §2): `request_summaries` is an
// allowlist; zero private fields; a confidential request has no public summary at all.
// S09: the assignee travels as a display label (person IDs are emails, D-S08-4).
import { describe, expect, it } from 'vitest';
import { PRIVATE_REQUEST_FIELDS, REQUEST_SUMMARY_FIELDS, toRequestSummaryDocument, type RequestDocument } from './index';

const T0 = Date.parse('2026-12-28T09:00:00+07:00');

const LABELS = { personLabel: (personId: string) => (personId === 'gm.staff01@tdfb.co' ? 'คุณ GM หนึ่ง' : undefined) };

/** A request with every private field filled with a recognisable value. */
const FULL: RequestDocument & Record<string, unknown> = {
  request_number: 'GM-0001',
  type: 'maintenance',
  source: 'web',
  origin: 'requester',
  created_by_id: 'secret.creator@tdfb.co',
  created_at: T0,
  requester_id: 'secret.requester@tdfb.co',
  requester_name_text: 'ชื่อผู้ขอลับ',
  summary_title: 'อินเทอร์เน็ต — ห้องประชุม · FAC16',
  description: 'รายละเอียดลับ: รหัส Wi-Fi 1234',
  category: 'assets_facilities',
  location_id: 'loc-fac16',
  area_id: 'area-fac16-meeting',
  symptom_key: 'internet_down',
  attachment_ids: ['att-secret-1'],
  assignee_id: 'gm.staff01@tdfb.co',
  is_confidential: false,
  related_person_ids: ['secret.related@tdfb.co'],
  watcher_ids: ['secret.watcher1@tdfb.co', 'secret.watcher2@tdfb.co'],
  team_labels: ['ทีมลับ'],
  status: 'in_progress',
  revision: 3,
  last_updated_at: T0 + 3_600_000,
  completion_cycle_id: 0,
  // Not part of RequestDocument but must never travel even if present on a stored document.
  comments: [{ text: 'คอมเมนต์ลับ' }],
  history: [{ kind: 'accepted' }],
  document_drive_url: 'https://drive.google.com/secret',
  original_storage_location: 'ตู้เอกสารลับ',
  slack_user_ids: ['U-SECRET'],
  waiting_on: { kind: 'other', name: 'ผู้รับเหมาลับ' },
};

describe('request summary allowlist', () => {
  it('no private field is on the allowlist', () => {
    expect(REQUEST_SUMMARY_FIELDS.filter((field) => (PRIVATE_REQUEST_FIELDS as readonly string[]).includes(field))).toEqual([]);
  });

  it('the private list covers Part 6 §6.4.1 “ห้าม public”', () => {
    for (const field of [
      'description',
      'requester_id',
      'requester_name_text',
      'created_by_id',
      'related_person_ids',
      'watcher_ids',
      'attachment_ids',
      'comments',
      'history',
      'sensitivity_reason',
      'sensitivity_note',
      'document_drive_url',
      'original_storage_location',
      'waiting_on',
      'team_labels',
    ]) {
      expect(PRIVATE_REQUEST_FIELDS).toContain(field);
    }
  });

  it('a summary of a full request has only allowlisted keys and zero private fields', () => {
    const summary = toRequestSummaryDocument('req-7f3a9c', FULL, LABELS);
    expect(summary).not.toBeNull();
    const keys = Object.keys(summary ?? {});
    expect(keys.filter((key) => !(REQUEST_SUMMARY_FIELDS as readonly string[]).includes(key))).toEqual([]);
    expect(keys.filter((key) => (PRIVATE_REQUEST_FIELDS as readonly string[]).includes(key))).toEqual([]);
    const text = JSON.stringify(summary);
    for (const secret of ['secret.', '@', 'ลับ', 'U-SECRET', 'drive.google.com', 'att-secret']) {
      expect(text).not.toContain(secret);
    }
  });

  it('copies the safe facts and counts watchers without naming them', () => {
    expect(toRequestSummaryDocument('req-7f3a9c', FULL, LABELS)).toEqual({
      request_id: 'req-7f3a9c',
      request_number: 'GM-0001',
      summary_title: 'อินเทอร์เน็ต — ห้องประชุม · FAC16',
      type: 'maintenance',
      category: 'assets_facilities',
      source: 'web',
      location_id: 'loc-fac16',
      area_id: 'area-fac16-meeting',
      symptom_key: 'internet_down',
      status: 'in_progress',
      created_at: T0,
      last_updated_at: T0 + 3_600_000,
      awaiting_confirmation: false,
      is_assigned: true,
      assignee_label: 'คุณ GM หนึ่ง',
      watcher_count: 2,
    });
  });

  it('a confidential request has no public summary (C6, C11)', () => {
    expect(toRequestSummaryDocument('req-secret', { ...FULL, is_confidential: true, sensitivity_reason: 'personnel' }, LABELS)).toBeNull();
  });
});
