// S07 — current work of a GM (C7, F06, F07): pin one in-progress request, auto-unpin on close/cancel,
// fallback order pinned → latest in_progress → “ยังไม่มีงานที่กำลังทำ”, secret → “งานภายใน”.
import { describe, expect, it } from 'vitest';
import type { Instant } from '@gm/time';
import {
  INTERNAL_WORK_LABEL,
  LifecycleRejected,
  NO_CURRENT_WORK_LABEL,
  currentWork,
  releaseFocusIfEnded,
  setFocus,
  type Actor,
  type CurrentWorkCandidate,
  type GmProfile,
} from './index';

const GM: Actor = { personId: 'person-gm-01', role: 'gm_staff' };
const GM_2: Actor = { personId: 'person-gm-02', role: 'gm_staff' };
const GM_ADMIN: Actor = { personId: 'person-gm-admin-01', role: 'gm_admin' };
const EMPLOYEE: Actor = { personId: 'person-employee-01', role: 'requester' };

function bkk(date: string, time: string): Instant {
  return Date.parse(`${date}T${time}:00+07:00`);
}

const NOW = bkk('2026-12-28', '10:00');
const gm: GmProfile = { personId: GM.personId, presenceStatus: 'at_wh300', presenceUpdatedAt: bkk('2026-12-28', '08:00') };

function request(id: string, overrides: Partial<CurrentWorkCandidate> = {}): CurrentWorkCandidate {
  return {
    id,
    status: 'in_progress',
    summaryTitle: `งาน ${id}`,
    isConfidential: false,
    assigneeId: GM.personId,
    lastUpdatedAt: bkk('2026-12-28', '09:00'),
    ...overrides,
  };
}

const everyone = () => true;
const nobodySecret = (candidate: CurrentWorkCandidate) => !candidate.isConfidential;

function rejectionCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof LifecycleRejected) return error.code;
    throw error;
  }
  throw new Error('expected LifecycleRejected');
}

describe('setFocus — “กำลังทำตอนนี้” (C7, US-21)', () => {
  it('pins one in-progress request; presence untouched', () => {
    const { profile, event } = setFocus(gm, { actor: GM, now: NOW, request: request('req-1') });
    expect(profile).toEqual({ ...gm, focusRequestId: 'req-1' });
    expect(event).toEqual({ kind: 'focus_set', at: NOW, actorId: GM.personId, personId: GM.personId, requestId: 'req-1' });
  });

  it('a new pin replaces the previous one', () => {
    const first = setFocus(gm, { actor: GM, now: NOW, request: request('req-1') }).profile;
    const { profile, event } = setFocus(first, { actor: GM, now: NOW + 60_000, request: request('req-2') });
    expect(profile.focusRequestId).toBe('req-2');
    expect(event).toMatchObject({ requestId: 'req-2', previousRequestId: 'req-1' });
  });

  it.each(['queued', 'waiting', 'completed', 'cancelled'] as const)('only in-progress requests can be pinned (%s)', (status) => {
    expect(rejectionCode(() => setFocus(gm, { actor: GM, now: NOW, request: request('req-1', { status }) }))).toBe(
      'FOCUS_NOT_IN_PROGRESS',
    );
  });

  it('pinning never touches the request, so last_updated_at does not move (D-S05-3)', () => {
    const pinned = Object.freeze(request('req-1'));
    const result = setFocus(gm, { actor: GM, now: NOW, request: pinned });
    expect(pinned.lastUpdatedAt).toBe(bkk('2026-12-28', '09:00'));
    expect(result).not.toHaveProperty('request');
    expect(Object.keys(result).sort()).toEqual(['event', 'profile']);
  });

  it('two GMs may pin the same request (F07)', () => {
    const other: GmProfile = { personId: GM_2.personId, presenceStatus: 'unspecified' };
    expect(setFocus(other, { actor: GM_2, now: NOW, request: request('req-1') }).profile.focusRequestId).toBe('req-1');
  });

  it('GM Admin may set it for a GM; other people may not', () => {
    expect(setFocus(gm, { actor: GM_ADMIN, now: NOW, request: request('req-1') }).profile.focusRequestId).toBe('req-1');
    expect(rejectionCode(() => setFocus(gm, { actor: GM_2, now: NOW, request: request('req-1') }))).toBe(
      'PROFILE_OWNER_ONLY',
    );
    expect(rejectionCode(() => setFocus(gm, { actor: EMPLOYEE, now: NOW, request: request('req-1') }))).toBe(
      'PROFILE_OWNER_ONLY',
    );
  });
});

describe('releaseFocusIfEnded — auto-unpin (C7, F06)', () => {
  const pinned: GmProfile = { ...gm, focusRequestId: 'req-1' };

  it.each([
    ['closed (closed_at set)', { status: 'completed' as const, closedAt: NOW }],
    ['cancelled', { status: 'cancelled' as const }],
  ])('unpins when the pinned request is %s', (_label, change) => {
    const { profile, event } = releaseFocusIfEnded(pinned, request('req-1', change), NOW);
    expect(profile).toEqual(gm);
    expect(profile).not.toHaveProperty('focusRequestId');
    expect(event).toEqual({ kind: 'focus_released', at: NOW, personId: GM.personId, requestId: 'req-1' });
  });

  it('a completed request still awaiting confirmation (no closed_at) stays pinned', () => {
    expect(releaseFocusIfEnded(pinned, request('req-1', { status: 'completed' }), NOW)).toEqual({ profile: pinned });
  });

  it('another request ending does not unpin', () => {
    expect(releaseFocusIfEnded(pinned, request('req-2', { status: 'cancelled' }), NOW)).toEqual({ profile: pinned });
  });

  it('presence is untouched', () => {
    expect(releaseFocusIfEnded(pinned, request('req-1', { status: 'cancelled' }), NOW).profile.presenceStatus).toBe(
      'at_wh300',
    );
  });
});

describe('currentWork — display order per GM (C7, F07)', () => {
  it('the pinned request comes first', () => {
    const requests = [
      request('req-1', { lastUpdatedAt: bkk('2026-12-28', '08:00') }),
      request('req-2', { lastUpdatedAt: bkk('2026-12-28', '09:30') }),
    ];
    expect(currentWork({ ...gm, focusRequestId: 'req-1' }, { requests, viewerCanSeeDetail: everyone })).toEqual({
      kind: 'pinned',
      requestId: 'req-1',
      summaryTitle: 'งาน req-1',
      status: 'in_progress',
    });
  });

  it('without a pin: this GM\'s in-progress request with the latest last_updated_at', () => {
    const requests = [
      request('req-1', { lastUpdatedAt: bkk('2026-12-28', '08:00') }),
      request('req-2', { lastUpdatedAt: bkk('2026-12-28', '09:30') }),
      request('req-3', { lastUpdatedAt: bkk('2026-12-28', '09:45'), assigneeId: GM_2.personId }),
      request('req-4', { lastUpdatedAt: bkk('2026-12-28', '09:50'), status: 'waiting' }),
    ];
    expect(currentWork(gm, { requests, viewerCanSeeDetail: everyone })).toEqual({
      kind: 'latest_in_progress',
      requestId: 'req-2',
      summaryTitle: 'งาน req-2',
      status: 'in_progress',
    });
  });

  it('nothing pinned or in progress → “ยังไม่มีงานที่กำลังทำ”', () => {
    expect(currentWork(gm, { requests: [request('req-4', { status: 'waiting' })], viewerCanSeeDetail: everyone })).toEqual({
      kind: 'none',
      label: NO_CURRENT_WORK_LABEL,
    });
    expect(NO_CURRENT_WORK_LABEL).toBe('ยังไม่มีงานที่กำลังทำ');
  });

  it('a pinned request that was closed or cancelled (before the unpin ran) falls back', () => {
    const requests = [request('req-1', { status: 'cancelled' }), request('req-2')];
    expect(currentWork({ ...gm, focusRequestId: 'req-1' }, { requests, viewerCanSeeDetail: everyone })).toMatchObject({
      kind: 'latest_in_progress',
      requestId: 'req-2',
    });
    const closed = [request('req-1', { status: 'completed', closedAt: NOW })];
    expect(currentWork({ ...gm, focusRequestId: 'req-1' }, { requests: closed, viewerCanSeeDetail: everyone }).kind).toBe(
      'none',
    );
  });

  it('a pinned request awaiting confirmation is still shown with its real status (F06)', () => {
    expect(
      currentWork({ ...gm, focusRequestId: 'req-1' }, { requests: [request('req-1', { status: 'completed' })], viewerCanSeeDetail: everyone }),
    ).toMatchObject({ kind: 'pinned', requestId: 'req-1', status: 'completed' });
  });

  it('a secret request the viewer cannot open shows only “งานภายใน”, without id or title', () => {
    const requests = [request('req-secret', { isConfidential: true, summaryTitle: 'เรื่องบุคคล' })];
    const pinnedView = currentWork({ ...gm, focusRequestId: 'req-secret' }, { requests, viewerCanSeeDetail: nobodySecret });
    expect(pinnedView).toEqual({ kind: 'internal', label: INTERNAL_WORK_LABEL });
    expect(INTERNAL_WORK_LABEL).toBe('งานภายใน');
    expect(JSON.stringify(pinnedView)).not.toContain('req-secret');
    expect(currentWork(gm, { requests, viewerCanSeeDetail: nobodySecret })).toEqual({
      kind: 'internal',
      label: INTERNAL_WORK_LABEL,
    });
  });

  it('a viewer with access sees the secret request normally', () => {
    const requests = [request('req-secret', { isConfidential: true, summaryTitle: 'เรื่องบุคคล' })];
    expect(currentWork(gm, { requests, viewerCanSeeDetail: everyone })).toMatchObject({
      kind: 'latest_in_progress',
      requestId: 'req-secret',
    });
  });
});
