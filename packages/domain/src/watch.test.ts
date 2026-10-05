// S08 — watching an existing repair (U1, Part 6 §6.4.2/§6.6 `watchRequest`): only open, non-secret
// maintenance; unique watcher; the real requester is not an extra reporter; no new request, no new
// request number; not GM progress (last_updated_at unchanged); watcher is not a related person.
import { describe, expect, it } from 'vitest';
import type { Instant } from '@gm/time';
import { LifecycleRejected, watchRequest, type Actor, type WatchState } from './index';

const REQUESTER: Actor = { personId: 'person-employee-01', role: 'requester' };
const NEIGHBOUR: Actor = { personId: 'person-employee-02', role: 'requester' };
const VIEWER: Actor = { personId: 'person-viewer-01', role: 'viewer' };

const T0: Instant = Date.parse('2026-12-28T09:00:00+07:00');

interface Request extends WatchState {
  readonly lastUpdatedAt: Instant;
  readonly relatedPersonIds: readonly string[];
  readonly requestNumber: string;
}

const open: Request = Object.freeze({
  type: 'maintenance',
  source: 'web',
  status: 'queued',
  isConfidential: false,
  requesterId: REQUESTER.personId,
  watcherIds: Object.freeze([]) as readonly string[],
  lastUpdatedAt: T0,
  relatedPersonIds: Object.freeze([]) as readonly string[],
  requestNumber: 'GM-0001',
});

function rejectionCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof LifecycleRejected) return error.code;
    throw error;
  }
  throw new Error('expected LifecycleRejected');
}

describe('watchRequest (U1)', () => {
  it('adds the employee once; nothing else on the request changes', () => {
    const { state, outcome } = watchRequest(open, { actor: NEIGHBOUR });
    expect(outcome).toBe('added');
    expect(state).toEqual({ ...open, watcherIds: [NEIGHBOUR.personId] });
    expect(state.lastUpdatedAt).toBe(T0);
    expect(state.relatedPersonIds).toEqual([]);
    expect(state.requestNumber).toBe('GM-0001');
  });

  it('watching again is idempotent', () => {
    const once = watchRequest(open, { actor: NEIGHBOUR }).state;
    const twice = watchRequest(once, { actor: NEIGHBOUR });
    expect(twice).toEqual({ state: once, outcome: 'already_watching' });
  });

  it('the real requester is not counted as an extra reporter of their own request', () => {
    expect(watchRequest(open, { actor: REQUESTER })).toEqual({ state: open, outcome: 'is_requester' });
  });

  it.each(['queued', 'in_progress', 'waiting'] as const)('open status %s can be watched', (status) => {
    expect(watchRequest({ ...open, status }, { actor: VIEWER }).outcome).toBe('added');
  });

  it.each([
    ['completed, awaiting confirmation', { status: 'completed' as const }],
    ['closed', { status: 'completed' as const, closedAt: T0 }],
    ['cancelled', { status: 'cancelled' as const }],
  ])('a %s request cannot be watched', (_label, change) => {
    expect(rejectionCode(() => watchRequest({ ...open, ...change }, { actor: NEIGHBOUR }))).toBe('WATCH_NOT_OPEN');
  });

  it.each(['gm_task', 'document_request', 'document_intake'] as const)('only maintenance can be watched (%s)', (type) => {
    expect(rejectionCode(() => watchRequest({ ...open, type }, { actor: NEIGHBOUR }))).toBe('WATCH_NOT_AVAILABLE');
  });

  it('a request that became confidential cannot be watched (same code: nothing is revealed)', () => {
    expect(rejectionCode(() => watchRequest({ ...open, isConfidential: true }, { actor: NEIGHBOUR }))).toBe(
      'WATCH_NOT_AVAILABLE',
    );
  });

  it('a Trello card is read-only', () => {
    expect(rejectionCode(() => watchRequest({ ...open, source: 'trello' }, { actor: NEIGHBOUR }))).toBe('READ_ONLY_SOURCE');
  });
});
