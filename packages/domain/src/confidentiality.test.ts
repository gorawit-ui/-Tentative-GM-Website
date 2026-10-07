// D-S05-6 — unflagging a confidential request: GM Admin only, reason required, kept in history (C6).
import { describe, expect, it } from 'vitest';
import {
  LifecycleRejected,
  markConfidential,
  removeConfidentialFlag,
  type Actor,
  type ConfidentialityState,
  type FlaggableState,
} from './index';

const GM: Actor = { personId: 'person-gm-01', role: 'gm_staff' };
const GM_ADMIN: Actor = { personId: 'person-gm-admin-01', role: 'gm_admin' };
const REQUESTER: Actor = { personId: 'person-requester-01', role: 'requester' };
const VIEWER: Actor = { personId: 'person-viewer-01', role: 'viewer' };

const CREATED = Date.parse('2026-12-28T09:00:00+07:00');
const NOW = Date.parse('2026-12-29T10:00:00+07:00');

function flagged(overrides: Partial<ConfidentialityState> = {}): ConfidentialityState {
  return {
    source: 'web',
    isConfidential: true,
    sensitivityReason: 'other',
    sensitivityNote: 'เกี่ยวกับข้อพิพาทกับคู่ค้า',
    lastUpdatedAt: CREATED,
    ...overrides,
  };
}

function rejectionCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof LifecycleRejected) return error.code;
    throw error;
  }
  throw new Error('expected LifecycleRejected');
}

describe('removeConfidentialFlag (D-S05-6, C6)', () => {
  it('GM Admin unflags with a reason: not confidential, reason/note removed, history keeps the old reason', () => {
    const { state, event } = removeConfidentialFlag(flagged(), {
      actor: GM_ADMIN,
      now: NOW,
      reason: '  ข้อพิพาทจบแล้ว ไม่มีข้อมูลอ่อนไหว  ',
    });
    expect(state.isConfidential).toBe(false);
    expect(state).not.toHaveProperty('sensitivityReason');
    expect(state).not.toHaveProperty('sensitivityNote');
    expect(event).toEqual({
      kind: 'confidential_flag_removed',
      at: NOW,
      actorId: GM_ADMIN.personId,
      reason: 'ข้อพิพาทจบแล้ว ไม่มีข้อมูลอ่อนไหว',
      previousSensitivityReason: 'other',
    });
  });

  it.each(['contract', 'personnel'] as const)('also unflags a %s default', (sensitivityReason) => {
    const { state, event } = removeConfidentialFlag(flagged({ sensitivityReason }), {
      actor: GM_ADMIN,
      now: NOW,
      reason: 'ตรวจแล้วไม่ใช่เรื่องลับ',
    });
    expect(state.isConfidential).toBe(false);
    expect(event.previousSensitivityReason).toBe(sensitivityReason);
  });

  it('is a GM action, so last_updated_at moves (D-S05-3)', () => {
    expect(removeConfidentialFlag(flagged(), { actor: GM_ADMIN, now: NOW, reason: 'ไม่ลับแล้ว' }).state.lastUpdatedAt).toBe(
      NOW,
    );
  });

  it.each([
    ['GM Staff', GM],
    ['requester', REQUESTER],
    ['viewer', VIEWER],
  ])('%s cannot unflag (GM_ADMIN_ONLY)', (_label, actor) => {
    expect(rejectionCode(() => removeConfidentialFlag(flagged(), { actor, now: NOW, reason: 'ไม่ลับแล้ว' }))).toBe(
      'GM_ADMIN_ONLY',
    );
  });

  it.each(['', '   '])('reason is required (%j)', (reason) => {
    expect(rejectionCode(() => removeConfidentialFlag(flagged(), { actor: GM_ADMIN, now: NOW, reason }))).toBe(
      'REASON_REQUIRED',
    );
  });

  it('a request that is not confidential cannot be unflagged', () => {
    const open: ConfidentialityState = { source: 'web', isConfidential: false, lastUpdatedAt: CREATED };
    expect(rejectionCode(() => removeConfidentialFlag(open, { actor: GM_ADMIN, now: NOW, reason: 'ไม่ลับ' }))).toBe(
      'NOT_CONFIDENTIAL',
    );
  });

  it('Trello cards are read-only', () => {
    expect(
      rejectionCode(() =>
        removeConfidentialFlag(flagged({ source: 'trello' }), { actor: GM_ADMIN, now: NOW, reason: 'ไม่ลับ' }),
      ),
    ).toBe('READ_ONLY_SOURCE');
  });

  it('keeps every other field of the request', () => {
    const request = { ...flagged(), relatedPersonIds: ['person-related-01'], summaryTitle: 'เรื่องภายใน' };
    const { state } = removeConfidentialFlag(request, { actor: GM_ADMIN, now: NOW, reason: 'ไม่ลับแล้ว' });
    expect(state.relatedPersonIds).toEqual(['person-related-01']);
    expect(state.summaryTitle).toBe('เรื่องภายใน');
  });
});

describe('removeConfidentialFlag clears the grant list (D-ACL-2)', () => {
  it('a later re-flag must confirm people again', () => {
    const request = { ...flagged(), confidentialGrantIds: ['related01@tdfb.co'] };
    expect(removeConfidentialFlag(request, { actor: GM_ADMIN, now: NOW, reason: 'ไม่ลับแล้ว' }).state).not.toHaveProperty(
      'confidentialGrantIds',
    );
  });
});

describe('markConfidential — flagging a general request later (D-ACL-2, C6)', () => {
  const RELATED_A = 'related.a@tdfb.co';
  const RELATED_B = 'related.b@tdfb.co';
  const general = (overrides: Partial<FlaggableState> = {}): FlaggableState => ({
    source: 'web',
    type: 'gm_task',
    isConfidential: false,
    relatedPersonIds: [RELATED_A, RELATED_B],
    lastUpdatedAt: CREATED,
    ...overrides,
  });
  const flag = (state: FlaggableState, command: Partial<Parameters<typeof markConfidential>[1]> = {}) =>
    markConfidential(state, {
      actor: GM,
      now: NOW,
      sensitivityReason: 'other',
      note: 'มีข้อมูลคู่ค้า',
      keepRelatedPersonIds: [RELATED_A],
      ...command,
    });

  it('the GM confirms who keeps access: kept people form the grant list; the others stay related without detail', () => {
    const { state, event } = flag(general());
    expect(state).toMatchObject({
      isConfidential: true,
      sensitivityReason: 'other',
      sensitivityNote: 'มีข้อมูลคู่ค้า',
      confidentialGrantIds: [RELATED_A],
      relatedPersonIds: [RELATED_A, RELATED_B],
      lastUpdatedAt: NOW,
    });
    expect(event).toEqual({
      kind: 'confidential_flag_set',
      at: NOW,
      actorId: GM.personId,
      sensitivityReason: 'other',
      keptPersonIds: [RELATED_A],
      withdrawnPersonIds: [RELATED_B],
    });
  });

  it('the keep list must be sent explicitly (an empty list keeps nobody)', () => {
    expect(rejectionCode(() => flag(general(), { keepRelatedPersonIds: undefined }))).toBe('KEEP_LIST_REQUIRED');
    expect(flag(general(), { keepRelatedPersonIds: [] }).state.confidentialGrantIds).toEqual([]);
  });

  it('only related persons can be kept', () => {
    expect(rejectionCode(() => flag(general(), { keepRelatedPersonIds: ['stranger@tdfb.co'] }))).toBe('KEEP_NOT_RELATED');
  });

  it('contract / personnel reasons need no note; other needs one (D-S05-6)', () => {
    const contract = flag(general(), { sensitivityReason: 'contract', note: undefined }).state;
    expect(contract).toMatchObject({ sensitivityReason: 'contract' });
    expect(contract).not.toHaveProperty('sensitivityNote');
    expect(rejectionCode(() => flag(general(), { note: '  ' }))).toBe('CONFIDENTIAL_NOTE_REQUIRED');
    expect(rejectionCode(() => flag(general(), { sensitivityReason: 'personnel', note: 'x' }))).toBe(
      'CONFIDENTIAL_NOTE_NOT_APPLICABLE',
    );
    expect(rejectionCode(() => flag(general(), { sensitivityReason: 'general' }))).toBe('SENSITIVITY_REASON_INVALID');
  });

  it.each([
    ['requester', REQUESTER],
    ['viewer', VIEWER],
  ])('%s cannot flag (GM_ONLY)', (_label, actor) => {
    expect(rejectionCode(() => flag(general(), { actor }))).toBe('GM_ONLY');
  });

  it('GM Admin can flag too', () => {
    expect(flag(general(), { actor: GM_ADMIN }).event.actorId).toBe(GM_ADMIN.personId);
  });

  it('a repair request is never confidential (D-S04-5)', () => {
    expect(rejectionCode(() => flag(general({ type: 'maintenance' })))).toBe('MAINTENANCE_NOT_CONFIDENTIAL');
  });

  it('an already confidential request is refused; Trello cards are read-only', () => {
    expect(rejectionCode(() => flag(general({ isConfidential: true, sensitivityReason: 'contract' })))).toBe('ALREADY_CONFIDENTIAL');
    expect(rejectionCode(() => flag(general({ source: 'trello' })))).toBe('READ_ONLY_SOURCE');
  });
});
