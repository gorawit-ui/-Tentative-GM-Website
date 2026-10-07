// S09 — three projections from one `requests/{id}` document (Part 6 §6.4/§6.4.1/§6.11, C6, C11, U1,
// U3, U4) and the company-wide confidential count. People are synthetic; person IDs are emails (D-S08-4).
import { describe, expect, it } from 'vitest';
import { boardSection } from '@gm/domain';
import { snapshotCalendar, type Instant } from '@gm/time';
import {
  PRIVATE_REQUEST_FIELDS,
  PUBLIC_WAITING_LABELS,
  REQUEST_DOCUMENT_FIELDS,
  REQUEST_SUMMARY_FIELDS,
  buildRequestProjections,
  toBoardCountersDocument,
  type ProjectionContext,
  type RequestDocument,
} from './index';

const bkk = (date: string, time: string): Instant => Date.parse(`${date}T${time}:00+07:00`);
const HOUR = 3_600_000;
const MINUTE = 60_000;

const COMPANY = snapshotCalendar({
  timeZone: 'Asia/Bangkok',
  openWeekdays: [1, 2, 3, 4, 5],
  holidays: ['2026-12-31', '2027-01-01'],
});

const NAMES: Record<string, string> = {
  'gm.staff01@tdfb.co': 'คุณ GM หนึ่ง',
  'finance01@tdfb.co': 'คุณการเงิน',
};

function context(now: Instant): ProjectionContext {
  return { now, workCalendar: COMPANY, personLabel: (personId) => NAMES[personId] };
}

const CREATED = bkk('2026-12-28', '09:00');
const UPDATED = bkk('2026-12-28', '09:30');

/** An on-behalf repair with every private field filled with something recognisable. */
const REQUEST: RequestDocument = {
  request_number: 'GM-0427',
  type: 'maintenance',
  source: 'web',
  origin: 'gm_on_behalf',
  created_by_id: 'gm.staff01@tdfb.co',
  created_at: CREATED,
  requester_name_text: 'คุณสมมติ ฝ่ายขาย',
  summary_title: 'แอร์ — ห้องแพ็คชั้น 1 · WH300',
  description: 'แอร์มีน้ำหยดตรงโต๊ะแพ็คของคุณสมมติ',
  category: 'assets_facilities',
  location_id: 'loc-wh300',
  area_id: 'area-wh300-pack-1',
  symptom_key: 'aircon',
  attachment_ids: ['att-photo-1', 'att-photo-2'],
  assignee_id: 'gm.staff01@tdfb.co',
  is_confidential: false,
  related_person_ids: ['related01@tdfb.co'],
  watcher_ids: ['watcher01@tdfb.co', 'watcher02@tdfb.co'],
  team_labels: ['ทีมคลัง'],
  status: 'in_progress',
  revision: 4,
  last_updated_at: UPDATED,
  completion_cycle_id: 0,
};

const PRIVATE_TEXTS = [
  'แอร์มีน้ำหยด',
  'คุณสมมติ ฝ่ายขาย',
  'att-photo',
  '@',
  'ทีมคลัง',
  'related01',
  'watcher0',
] as const;

describe('three projections from one request document', () => {
  it('public summary, GM summary and restricted detail come from the same document', () => {
    const { public: summary, gm, detail } = buildRequestProjections('req-0427', REQUEST, context(UPDATED + HOUR));
    expect(summary).toMatchObject({ request_id: 'req-0427', request_number: 'GM-0427', status: 'in_progress' });
    expect(gm).toMatchObject({ request_id: 'req-0427', request_number: 'GM-0427', status: 'in_progress' });
    expect(detail).toEqual(REQUEST);
  });

  it('the restricted detail keeps everything people with access need, and drops unknown fields', () => {
    const stored = { ...REQUEST, sensitivity_note: 'หมายเหตุลับ', some_future_field: 'x', comments: ['ไม่ใช่ field ของงาน'] };
    const { detail } = buildRequestProjections('req-0427', stored, context(UPDATED));
    expect(detail).toMatchObject({
      description: REQUEST.description,
      attachment_ids: REQUEST.attachment_ids,
      requester_name_text: REQUEST.requester_name_text,
      sensitivity_note: 'หมายเหตุลับ',
    });
    expect(Object.keys(detail).filter((key) => !(REQUEST_DOCUMENT_FIELDS as readonly string[]).includes(key))).toEqual([]);
  });

  it('does not mutate the request', () => {
    const frozen = Object.freeze({ ...REQUEST, watcher_ids: Object.freeze([...REQUEST.watcher_ids]) });
    expect(() => buildRequestProjections('req-0427', frozen, context(UPDATED))).not.toThrow();
  });
});

describe('public summary (C11 allowlist, U1, U4)', () => {
  const summary = () => buildRequestProjections('req-0427', REQUEST, context(UPDATED + HOUR)).public;

  it('has only allowlisted keys and no private field', () => {
    const keys = Object.keys(summary() ?? {});
    expect(keys.filter((key) => !(REQUEST_SUMMARY_FIELDS as readonly string[]).includes(key))).toEqual([]);
    expect(keys.filter((key) => (PRIVATE_REQUEST_FIELDS as readonly string[]).includes(key))).toEqual([]);
  });

  it('carries no typed detail, photos, on-behalf name text, team labels or person IDs (emails)', () => {
    const text = JSON.stringify(summary());
    for (const secret of PRIVATE_TEXTS) expect(text).not.toContain(secret);
  });

  it('has no stale flag — only last_updated_at for the neutral “อัปเดตล่าสุด …” text (U4)', () => {
    const value = summary();
    expect(value).not.toHaveProperty('stale');
    expect(value).not.toHaveProperty('stale_threshold_at');
    expect(value?.last_updated_at).toBe(UPDATED);
  });

  it('shows the assigned GM by display name only', () => {
    expect(summary()).toMatchObject({ is_assigned: true, assignee_label: 'คุณ GM หนึ่ง' });
    const { assignee_id: _none, ...unassigned } = REQUEST;
    const open = buildRequestProjections('req-0427', unassigned, context(UPDATED)).public;
    expect(open).toMatchObject({ is_assigned: false });
    expect(open).not.toHaveProperty('assignee_label');
  });

  it('“มีผู้แจ้งเพิ่ม X คน” counts unique watchers other than the requester, without names', () => {
    const watched: RequestDocument = {
      ...REQUEST,
      requester_id: 'requester01@tdfb.co',
      watcher_ids: ['watcher01@tdfb.co', 'watcher02@tdfb.co', 'watcher01@tdfb.co', 'requester01@tdfb.co'],
    };
    const value = buildRequestProjections('req-0427', watched, context(UPDATED)).public;
    expect(value?.watcher_count).toBe(2);
    expect(JSON.stringify(value)).not.toContain('watcher0');
  });

  it('while waiting it shows only a generic label of the waited party', () => {
    const waiting: RequestDocument = {
      ...REQUEST,
      status: 'waiting',
      waiting_on: { kind: 'government', name: 'สำนักงานเขตบางนา' },
      waiting_since: UPDATED,
      current_waiting_interval_id: 1,
      waiting_party_responded: false,
    };
    const value = buildRequestProjections('req-0427', waiting, context(UPDATED)).public;
    expect(value?.waiting_on_summary).toBe(PUBLIC_WAITING_LABELS.government);
    expect(PUBLIC_WAITING_LABELS.government).toBe('หน่วยงานรัฐ');
    expect(JSON.stringify(value)).not.toContain('บางนา');
    const person = { ...waiting, waiting_on: { kind: 'person' as const, person_id: 'finance01@tdfb.co' } };
    const personValue = buildRequestProjections('req-0427', person, context(UPDATED)).public;
    expect(personValue?.waiting_on_summary).toBe('พนักงาน');
    expect(JSON.stringify(personValue)).not.toContain('การเงิน');
  });

  it('no waiting label once the request is not waiting', () => {
    expect(summary()).not.toHaveProperty('waiting_on_summary');
  });
});

describe('U3 — enough data for the 7-day frame of completed/cancelled cards', () => {
  const NOW = bkk('2027-01-04', '10:00');
  const sectionOf = (request: RequestDocument) => {
    const value = buildRequestProjections('req-0427', request, context(NOW)).public;
    if (value === null) throw new Error('expected a public summary');
    return boardSection(
      {
        status: value.status,
        ...(value.closed_at === undefined ? {} : { closedAt: value.closed_at }),
        ...(value.cancelled_at === undefined ? {} : { cancelledAt: value.cancelled_at }),
      },
      NOW,
    );
  };

  it('completed awaiting confirmation is flagged and stays on the board', () => {
    const awaiting = { ...REQUEST, status: 'completed' as const, completed_at: bkk('2026-12-20', '10:00') };
    expect(buildRequestProjections('req-0427', awaiting, context(NOW)).public?.awaiting_confirmation).toBe(true);
    expect(sectionOf(awaiting)).toBe('awaiting_confirmation');
  });

  it('closed: closed_at decides the 168-hour window', () => {
    const closed = (closedAt: Instant) => ({
      ...REQUEST,
      status: 'completed' as const,
      completed_at: closedAt - HOUR,
      closed_at: closedAt,
      closure_kind: 'requester_confirmed' as const,
    });
    expect(buildRequestProjections('req-0427', closed(NOW - HOUR), context(NOW)).public?.awaiting_confirmation).toBe(false);
    expect(sectionOf(closed(NOW - HOUR))).toBe('recently_closed');
    expect(sectionOf(closed(bkk('2026-12-28', '10:00')))).toBe('archived');
  });

  it('cancelled: cancelled_at decides the window', () => {
    expect(sectionOf({ ...REQUEST, status: 'cancelled', cancelled_at: NOW - HOUR })).toBe('recently_cancelled');
    expect(sectionOf({ ...REQUEST, status: 'cancelled', cancelled_at: bkk('2026-12-27', '10:00') })).toBe('archived');
  });
});

describe('GM summary', () => {
  it('includes confidential requests with their title and the confidential flag', () => {
    const secret = { ...REQUEST, is_confidential: true, sensitivity_reason: 'personnel' as const };
    const { public: summary, gm } = buildRequestProjections('req-0427', secret, context(UPDATED));
    expect(summary).toBeNull();
    expect(gm).toMatchObject({ is_confidential: true, summary_title: REQUEST.summary_title });
  });

  it('keeps private detail out: no description, photos, requester text, related or watcher IDs, note', () => {
    const gm = buildRequestProjections('req-0427', { ...REQUEST, sensitivity_note: 'หมายเหตุลับ' }, context(UPDATED)).gm;
    const text = JSON.stringify(gm);
    for (const secret of ['แอร์มีน้ำหยด', 'คุณสมมติ ฝ่ายขาย', 'att-photo', 'related01', 'watcher0', 'หมายเหตุลับ', 'ทีมคลัง']) {
      expect(text).not.toContain(secret);
    }
    expect(gm).toMatchObject({ assignee_id: 'gm.staff01@tdfb.co', assignee_label: 'คุณ GM หนึ่ง', watcher_count: 2 });
  });

  it('stale: raw > 3 business days since last_updated_at (Mon 28 Dec 09:30 → threshold Mon 4 Jan 09:30)', () => {
    const threshold = bkk('2027-01-04', '09:30');
    const at = (now: Instant) => buildRequestProjections('req-0427', REQUEST, context(now)).gm;
    expect(at(threshold)).toMatchObject({ stale: false, stale_threshold_at: threshold });
    expect(at(threshold + MINUTE)).toMatchObject({ stale: true, stale_threshold_at: threshold });
    expect(at(threshold - MINUTE).stale).toBe(false);
  });

  it.each([
    ['completed awaiting confirmation', { status: 'completed' as const, completed_at: UPDATED }],
    ['cancelled', { status: 'cancelled' as const, cancelled_at: UPDATED }],
  ])('%s is never stale and has no threshold', (_label, change) => {
    const gm = buildRequestProjections('req-0427', { ...REQUEST, ...change }, context(bkk('2027-02-01', '10:00'))).gm;
    expect(gm.stale).toBe(false);
    expect(gm).not.toHaveProperty('stale_threshold_at');
  });

  it('waiting shows the real party: person name, team label or external name', () => {
    const waiting = (waitingOn: RequestDocument['waiting_on']): RequestDocument => ({
      ...REQUEST,
      status: 'waiting',
      ...(waitingOn === undefined ? {} : { waiting_on: waitingOn }),
      waiting_since: UPDATED,
      current_waiting_interval_id: 1,
      waiting_party_responded: true,
      responded_at: UPDATED + HOUR,
    });
    const label = (waitingOn: RequestDocument['waiting_on']) =>
      buildRequestProjections('req-0427', waiting(waitingOn), context(UPDATED + 2 * HOUR)).gm;
    expect(label({ kind: 'person', person_id: 'finance01@tdfb.co' })).toMatchObject({
      waiting_on_kind: 'person',
      waiting_on_label: 'คุณการเงิน',
      waiting_since: UPDATED,
      waiting_party_responded: true,
    });
    expect(label({ kind: 'team', team_label: 'ทีม IT', contact_ids: ['it01@tdfb.co'] }).waiting_on_label).toBe('ทีม IT');
    expect(label({ kind: 'contractor', name: 'ช่างแอร์ภายนอก' }).waiting_on_label).toBe('ช่างแอร์ภายนอก');
  });
});

describe('confidential requests: no public summary, only “งานภายใน X รายการ”', () => {
  const NOW = bkk('2027-01-04', '10:00');
  const secret = (id: string, change: Partial<RequestDocument>): RequestDocument => ({
    ...REQUEST,
    request_number: `GM-${id}`,
    summary_title: `เรื่องลับ ${id}`,
    is_confidential: true,
    sensitivity_reason: 'personnel',
    ...change,
  });
  const REQUESTS = [
    secret('9001', { status: 'queued' }),
    secret('9002', { status: 'waiting' }),
    secret('9003', { status: 'completed', completed_at: NOW - 30 * 24 * HOUR }),
    secret('9004', { status: 'completed', completed_at: NOW - 2 * HOUR, closed_at: NOW - HOUR }),
    secret('9005', { status: 'cancelled', cancelled_at: NOW - HOUR }),
    secret('9006', { status: 'completed', completed_at: NOW - 20 * 24 * HOUR, closed_at: NOW - 10 * 24 * HOUR }),
    secret('9007', { status: 'cancelled', cancelled_at: NOW - 8 * 24 * HOUR }),
    { ...REQUEST, request_number: 'GM-0001', status: 'queued' as const },
  ];

  it('a confidential request never has a public summary', () => {
    for (const request of REQUESTS.slice(0, 7)) {
      expect(buildRequestProjections('req-x', request, context(NOW)).public).toBeNull();
    }
  });

  it('counts confidential requests on the live board (U3 frame) company-wide', () => {
    expect(toBoardCountersDocument(REQUESTS, NOW)).toEqual({ internal_board_count: 5, as_of: NOW });
  });

  it('the counter has no titles, numbers or IDs', () => {
    const text = JSON.stringify(toBoardCountersDocument(REQUESTS, NOW));
    expect(text).not.toContain('เรื่องลับ');
    expect(text).not.toContain('GM-');
    expect(text).not.toContain('@');
    expect(Object.keys(toBoardCountersDocument(REQUESTS, NOW)).sort()).toEqual(['as_of', 'internal_board_count']);
  });

  it('no confidential requests → 0', () => {
    expect(toBoardCountersDocument([REQUEST], NOW)).toEqual({ internal_board_count: 0, as_of: NOW });
  });
});
