// S05 — lifecycle commands (F04, F06, US-08, US-09, C2, C5, Part 6 §6.6/§6.9).
// Fixture people are synthetic; instants are UTC epoch ms (Asia/Bangkok = UTC+7).
import { describe, expect, it } from 'vitest';
import { autoCloseDue, snapshotCalendar, type CalendarSnapshot, type Instant } from '@gm/time';
import {
  LifecycleRejected,
  acceptRequest,
  autoCloseRequest,
  cancelRequest,
  completeRequest,
  confirmCompletion,
  createRequestDraft,
  reopenRequest,
  reportNotResolved,
  type Actor,
  type LifecycleState,
} from './index';

const REQUESTER: Actor = { personId: 'person-requester-01', role: 'requester' };
const WATCHER: Actor = { personId: 'person-watcher-01', role: 'requester' };
const RELATED: Actor = { personId: 'person-related-01', role: 'requester' };
const VIEWER: Actor = { personId: 'person-viewer-01', role: 'viewer' };
const GM: Actor = { personId: 'person-gm-01', role: 'gm_staff' };
const GM_2: Actor = { personId: 'person-gm-02', role: 'gm_staff' };
const GM_ADMIN: Actor = { personId: 'person-gm-admin-01', role: 'gm_admin' };

/** Company calendar for A: Mon–Fri, New Year holidays 31 Dec 2026 and 1 Jan 2027. */
const COMPANY: CalendarSnapshot = snapshotCalendar({
  timeZone: 'Asia/Bangkok',
  openWeekdays: [1, 2, 3, 4, 5],
  holidays: ['2026-12-31', '2027-01-01'],
});

/** Bangkok wall time → instant. */
function bkk(date: string, time: string): Instant {
  return Date.parse(`${date}T${time}:00+07:00`);
}

const CREATED = bkk('2026-12-28', '09:00');
const MINUTE = 60_000;

function requestState(overrides: Partial<LifecycleState> = {}): LifecycleState {
  return {
    source: 'web',
    status: 'queued',
    requesterId: REQUESTER.personId,
    lastUpdatedAt: CREATED,
    completionCycleId: 0,
    ...overrides,
  };
}

/** A request with a requester in progress, assigned to GM. */
function inProgress(overrides: Partial<LifecycleState> = {}): LifecycleState {
  return requestState({ status: 'in_progress', assigneeId: GM.personId, ...overrides });
}

/** GM gm_task / text-name on-behalf: no requester_id. */
function withoutRequester(overrides: Partial<LifecycleState> = {}): LifecycleState {
  const { requesterId: _omit, ...rest } = inProgress(overrides);
  return rest;
}

const DONE_AT = bkk('2026-12-30', '16:00');
const AUTO_CLOSE_AT = bkk('2027-01-06', '16:00');

function completedAwaiting(): LifecycleState {
  return completeRequest(inProgress(), {
    actor: GM,
    now: DONE_AT,
    resolutionSummary: 'เปลี่ยนท่อน้ำทิ้งแอร์แล้ว',
    confirmationCalendar: COMPANY,
  }).state;
}

/** The error code thrown by `action`, failing the test if it does not throw LifecycleRejected. */
function rejectionCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof LifecycleRejected) return error.code;
    throw error;
  }
  throw new Error('expected LifecycleRejected');
}

describe('accept (F04 queued → in_progress)', () => {
  it('GM accepts a queued request: in_progress, assigned to the GM, last_updated_at = now', () => {
    const now = bkk('2026-12-28', '10:15');
    const { state, event } = acceptRequest(requestState(), { actor: GM, now });
    expect(state.status).toBe('in_progress');
    expect(state.assigneeId).toBe(GM.personId);
    expect(state.lastUpdatedAt).toBe(now);
    expect(event).toEqual({ kind: 'accepted', at: now, actorId: GM.personId });
  });

  it('GM Admin can accept', () => {
    expect(acceptRequest(requestState(), { actor: GM_ADMIN, now: CREATED + MINUTE }).state.status).toBe('in_progress');
  });

  it.each([
    ['requester', REQUESTER],
    ['viewer', VIEWER],
  ])('%s cannot accept (GM_ONLY)', (_label, actor) => {
    expect(rejectionCode(() => acceptRequest(requestState(), { actor, now: CREATED + MINUTE }))).toBe('GM_ONLY');
  });

  it.each(['in_progress', 'waiting', 'completed', 'cancelled'] as const)('cannot accept from %s', (status) => {
    expect(rejectionCode(() => acceptRequest(requestState({ status }), { actor: GM, now: CREATED + MINUTE }))).toBe(
      'INVALID_TRANSITION',
    );
  });
});

describe('complete with a requester (F06, US-08)', () => {
  it('GM completes: completed, awaiting confirmation, not closed', () => {
    const { state, event } = completeRequest(inProgress(), {
      actor: GM,
      now: DONE_AT,
      resolutionSummary: '  เปลี่ยนท่อน้ำทิ้งแอร์แล้ว  ',
      confirmationCalendar: COMPANY,
    });
    expect(state.status).toBe('completed');
    expect(state.completedAt).toBe(DONE_AT);
    expect(state.closedAt).toBeUndefined();
    expect(state.closureKind).toBeUndefined();
    expect(state.completionCycleId).toBe(1);
    expect(event).toEqual({
      kind: 'completed',
      at: DONE_AT,
      actorId: GM.personId,
      completionCycleId: 1,
      resolutionSummary: 'เปลี่ยนท่อน้ำทิ้งแอร์แล้ว',
    });
  });

  it('auto-close due uses S03 autoCloseDue: done Wed 30 Dec 2026 16:00 → due Wed 6 Jan 2027 16:00', () => {
    const state = completedAwaiting();
    expect(state.autoCloseDueAt).toBe(AUTO_CLOSE_AT);
    expect(state.autoCloseDueAt).toBe(autoCloseDue(DONE_AT, COMPANY));
  });

  it('copies the confirmation calendar snapshot used for the due date', () => {
    expect(completedAwaiting().confirmationCalendarSnapshot).toEqual(COMPANY);
  });

  it('GM complete updates last_updated_at', () => {
    expect(completedAwaiting().lastUpdatedAt).toBe(DONE_AT);
  });

  it.each(['', '   '])('result summary is required (%j)', (resolutionSummary) => {
    expect(
      rejectionCode(() =>
        completeRequest(inProgress(), { actor: GM, now: DONE_AT, resolutionSummary, confirmationCalendar: COMPANY }),
      ),
    ).toBe('RESULT_SUMMARY_REQUIRED');
  });

  it('a request with a requester needs the confirmation calendar', () => {
    expect(
      rejectionCode(() => completeRequest(inProgress(), { actor: GM, now: DONE_AT, resolutionSummary: 'เสร็จ' })),
    ).toBe('CONFIRMATION_CALENDAR_REQUIRED');
  });

  it.each([
    ['requester', REQUESTER],
    ['viewer', VIEWER],
  ])('%s cannot complete (GM_ONLY)', (_label, actor) => {
    expect(
      rejectionCode(() =>
        completeRequest(inProgress(), { actor, now: DONE_AT, resolutionSummary: 'เสร็จ', confirmationCalendar: COMPANY }),
      ),
    ).toBe('GM_ONLY');
  });

  it.each(['queued', 'completed', 'cancelled'] as const)('cannot complete from %s', (status) => {
    expect(
      rejectionCode(() =>
        completeRequest(inProgress({ status }), {
          actor: GM,
          now: DONE_AT,
          resolutionSummary: 'เสร็จ',
          confirmationCalendar: COMPANY,
        }),
      ),
    ).toBe('INVALID_TRANSITION');
  });
});

describe('requester confirms (F06)', () => {
  it('requester confirms → closed by requester; due kept; last_updated_at unchanged', () => {
    const awaiting = completedAwaiting();
    const now = bkk('2027-01-04', '11:00');
    const { state, event } = confirmCompletion(awaiting, { actor: REQUESTER, now, completionCycleId: 1 });
    expect(state.status).toBe('completed');
    expect(state.closedAt).toBe(now);
    expect(state.closureKind).toBe('requester_confirmed');
    expect(state.autoCloseDueAt).toBe(AUTO_CLOSE_AT);
    expect(state.lastUpdatedAt).toBe(DONE_AT);
    expect(event).toEqual({
      kind: 'closed',
      at: now,
      actorId: REQUESTER.personId,
      completionCycleId: 1,
      closureKind: 'requester_confirmed',
    });
  });

  it.each([
    ['watcher (U1)', WATCHER],
    ['related person', RELATED],
    ['GM', GM],
    ['GM Admin', GM_ADMIN],
  ])('%s cannot confirm on behalf of the requester', (_label, actor) => {
    expect(
      rejectionCode(() => confirmCompletion(completedAwaiting(), { actor, now: DONE_AT + MINUTE, completionCycleId: 1 })),
    ).toBe('REQUESTER_ONLY');
  });

  it('confirming twice does not close again', () => {
    const closed = confirmCompletion(completedAwaiting(), {
      actor: REQUESTER,
      now: DONE_AT + MINUTE,
      completionCycleId: 1,
    }).state;
    expect(
      rejectionCode(() => confirmCompletion(closed, { actor: REQUESTER, now: DONE_AT + 2 * MINUTE, completionCycleId: 1 })),
    ).toBe('ALREADY_CLOSED');
  });

  it('confirming an old completion cycle is rejected', () => {
    const awaiting = completedAwaiting();
    expect(
      rejectionCode(() => confirmCompletion(awaiting, { actor: REQUESTER, now: DONE_AT + MINUTE, completionCycleId: 0 })),
    ).toBe('STALE_COMPLETION_CYCLE');
  });

  it('confirming a request that is no longer completed is rejected', () => {
    const reopened = reportNotResolved(completedAwaiting(), {
      actor: REQUESTER,
      now: DONE_AT + MINUTE,
      completionCycleId: 1,
      reason: 'ยังมีน้ำหยด',
    }).state;
    expect(
      rejectionCode(() => confirmCompletion(reopened, { actor: REQUESTER, now: DONE_AT + 2 * MINUTE, completionCycleId: 1 })),
    ).toBe('NOT_AWAITING_CONFIRMATION');
  });
});

describe('requester reports not resolved (F06, US-08)', () => {
  const NOT_RESOLVED_AT = bkk('2027-01-04', '10:00');

  it('goes back to in_progress with the reason; old due void; cycle id kept', () => {
    const { state, event } = reportNotResolved(completedAwaiting(), {
      actor: REQUESTER,
      now: NOT_RESOLVED_AT,
      completionCycleId: 1,
      reason: '  ยังมีน้ำหยด  ',
    });
    expect(state.status).toBe('in_progress');
    expect(state.autoCloseDueAt).toBeUndefined();
    expect(state.completedAt).toBeUndefined();
    expect(state.closedAt).toBeUndefined();
    expect(state.confirmationCalendarSnapshot).toBeUndefined();
    expect(state.completionCycleId).toBe(1);
    expect(state.assigneeId).toBe(GM.personId);
    expect(event).toEqual({
      kind: 'not_resolved',
      at: NOT_RESOLVED_AT,
      actorId: REQUESTER.personId,
      completionCycleId: 1,
      reason: 'ยังมีน้ำหยด',
    });
  });

  it.each(['', '  '])('reason is required (%j)', (reason) => {
    expect(
      rejectionCode(() =>
        reportNotResolved(completedAwaiting(), { actor: REQUESTER, now: NOT_RESOLVED_AT, completionCycleId: 1, reason }),
      ),
    ).toBe('REASON_REQUIRED');
  });

  it.each([
    ['watcher (U1)', WATCHER],
    ['related person', RELATED],
    ['GM', GM],
  ])('%s cannot report not resolved for the requester', (_label, actor) => {
    expect(
      rejectionCode(() =>
        reportNotResolved(completedAwaiting(), { actor, now: NOT_RESOLVED_AT, completionCycleId: 1, reason: 'ยังไม่ดี' }),
      ),
    ).toBe('REQUESTER_ONLY');
  });

  it('cannot report not resolved after the request was closed', () => {
    const closed = confirmCompletion(completedAwaiting(), {
      actor: REQUESTER,
      now: DONE_AT + MINUTE,
      completionCycleId: 1,
    }).state;
    expect(
      rejectionCode(() =>
        reportNotResolved(closed, { actor: REQUESTER, now: NOT_RESOLVED_AT, completionCycleId: 1, reason: 'ยังไม่ดี' }),
      ),
    ).toBe('ALREADY_CLOSED');
  });

  it('the next completion starts a new cycle with a new due date', () => {
    const reopened = reportNotResolved(completedAwaiting(), {
      actor: REQUESTER,
      now: NOT_RESOLVED_AT,
      completionCycleId: 1,
      reason: 'ยังมีน้ำหยด',
    }).state;
    const redoneAt = bkk('2027-01-05', '14:00');
    const { state, event } = completeRequest(reopened, {
      actor: GM,
      now: redoneAt,
      resolutionSummary: 'เปลี่ยนรางน้ำแอร์',
      confirmationCalendar: COMPANY,
    });
    expect(state.completionCycleId).toBe(2);
    expect(event.completionCycleId).toBe(2);
    expect(state.autoCloseDueAt).toBe(bkk('2027-01-08', '14:00'));
  });
});

describe('auto-close (F06, Part 6 §6.9)', () => {
  it('closes exactly at the due time as auto_closed (not requester-confirmed); last_updated_at unchanged', () => {
    const result = autoCloseRequest(completedAwaiting(), { now: AUTO_CLOSE_AT, completionCycleId: 1 });
    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.state.closedAt).toBe(AUTO_CLOSE_AT);
    expect(result.state.closureKind).toBe('auto_closed');
    expect(result.state.status).toBe('completed');
    expect(result.state.autoCloseDueAt).toBe(AUTO_CLOSE_AT);
    expect(result.state.lastUpdatedAt).toBe(DONE_AT);
    expect(result.event).toEqual({
      kind: 'closed',
      at: AUTO_CLOSE_AT,
      actorId: 'system',
      completionCycleId: 1,
      closureKind: 'auto_closed',
    });
  });

  it('a late tick records the real close time and keeps the original due', () => {
    const late = AUTO_CLOSE_AT + 7 * MINUTE;
    const result = autoCloseRequest(completedAwaiting(), { now: late, completionCycleId: 1 });
    expect(result.applied && result.state.closedAt).toBe(late);
    expect(result.state.autoCloseDueAt).toBe(AUTO_CLOSE_AT);
  });

  it('one minute before the due time is skipped (not_due)', () => {
    const awaiting = completedAwaiting();
    const result = autoCloseRequest(awaiting, { now: AUTO_CLOSE_AT - MINUTE, completionCycleId: 1 });
    expect(result).toEqual({ applied: false, state: awaiting, skipReason: 'not_due' });
  });

  it('does not close twice', () => {
    const closed = confirmCompletion(completedAwaiting(), {
      actor: REQUESTER,
      now: DONE_AT + MINUTE,
      completionCycleId: 1,
    }).state;
    const result = autoCloseRequest(closed, { now: AUTO_CLOSE_AT, completionCycleId: 1 });
    expect(result).toEqual({ applied: false, state: closed, skipReason: 'already_closed' });
  });

  it('an old due does not close a request reopened by not resolved (US-08 race)', () => {
    const reopened = reportNotResolved(completedAwaiting(), {
      actor: REQUESTER,
      now: bkk('2027-01-04', '10:00'),
      completionCycleId: 1,
      reason: 'ยังมีน้ำหยด',
    }).state;
    expect(autoCloseRequest(reopened, { now: AUTO_CLOSE_AT, completionCycleId: 1 })).toEqual({
      applied: false,
      state: reopened,
      skipReason: 'not_completed',
    });
  });

  it('an old cycle job does not close the new completion cycle', () => {
    const reopened = reportNotResolved(completedAwaiting(), {
      actor: REQUESTER,
      now: bkk('2027-01-04', '10:00'),
      completionCycleId: 1,
      reason: 'ยังมีน้ำหยด',
    }).state;
    const recompleted = completeRequest(reopened, {
      actor: GM,
      now: bkk('2027-01-05', '14:00'),
      resolutionSummary: 'เปลี่ยนรางน้ำแอร์',
      confirmationCalendar: COMPANY,
    }).state;
    expect(autoCloseRequest(recompleted, { now: AUTO_CLOSE_AT, completionCycleId: 1 })).toEqual({
      applied: false,
      state: recompleted,
      skipReason: 'stale_completion_cycle',
    });
  });

  it('read-only Trello cards are never auto-closed', () => {
    const trello = { ...completedAwaiting(), source: 'trello' as const };
    expect(autoCloseRequest(trello, { now: AUTO_CLOSE_AT, completionCycleId: 1 })).toEqual({
      applied: false,
      state: trello,
      skipReason: 'read_only_source',
    });
  });
});

describe('no confirmation step: gm_task and text-name on-behalf (C2, F06, US-09)', () => {
  it('gm_task: complete closes immediately as gm_closed, no due date', () => {
    const draft = createRequestDraft({
      kind: 'gm_task',
      actor: GM,
      summaryTitle: 'ตรวจถังดับเพลิงประจำไตรมาส',
      category: 'assets_facilities',
      sensitivitySubject: 'general',
    });
    expect(draft.requesterId).toBeUndefined();
    const { state, event } = completeRequest(withoutRequester(), {
      actor: GM,
      now: DONE_AT,
      resolutionSummary: 'ตรวจครบ 12 ถัง',
    });
    expect(state.status).toBe('completed');
    expect(state.completedAt).toBe(DONE_AT);
    expect(state.closedAt).toBe(DONE_AT);
    expect(state.closureKind).toBe('gm_closed');
    expect(state.autoCloseDueAt).toBeUndefined();
    expect(state.confirmationCalendarSnapshot).toBeUndefined();
    expect(state.lastUpdatedAt).toBe(DONE_AT);
    expect(event).toEqual({
      kind: 'completed',
      at: DONE_AT,
      actorId: GM.personId,
      completionCycleId: 1,
      closureKind: 'gm_closed',
      resolutionSummary: 'ตรวจครบ 12 ถัง',
    });
  });

  it('on-behalf with a text name only: no requester_id, so complete closes immediately', () => {
    const draft = createRequestDraft({
      kind: 'on_behalf',
      actor: GM,
      requester: { nameText: 'คุณสมมติ ฝ่ายขาย' },
      details: { type: 'document_request', summaryTitle: 'ขอหนังสือรับรองบริษัท', sensitivitySubject: 'general' },
    });
    expect(draft.requiresRequesterConfirmation).toBe(false);
    const { state } = completeRequest(withoutRequester(), { actor: GM, now: DONE_AT, resolutionSummary: 'ส่งเอกสารแล้ว' });
    expect(state.closedAt).toBe(DONE_AT);
    expect(state.closureKind).toBe('gm_closed');
  });

  it('nobody can confirm a request that was closed at completion', () => {
    const { state } = completeRequest(withoutRequester(), { actor: GM, now: DONE_AT, resolutionSummary: 'เสร็จ' });
    expect(
      rejectionCode(() => confirmCompletion(state, { actor: REQUESTER, now: DONE_AT + MINUTE, completionCycleId: 1 })),
    ).toBe('REQUESTER_ONLY');
  });
});

describe('cancel (F04, US-09)', () => {
  const CANCEL_AT = bkk('2026-12-29', '13:00');

  it.each(['queued', 'in_progress', 'waiting'] as const)('GM cancels from %s with a reason', (status) => {
    const { state, event } = cancelRequest(inProgress({ status }), {
      actor: GM,
      now: CANCEL_AT,
      reason: '  ผู้ขอแจ้งว่าไม่ต้องการแล้ว  ',
    });
    expect(state.status).toBe('cancelled');
    expect(state.cancelledAt).toBe(CANCEL_AT);
    expect(state.lastUpdatedAt).toBe(CANCEL_AT);
    expect(event).toEqual({
      kind: 'cancelled',
      at: CANCEL_AT,
      actorId: GM.personId,
      reason: 'ผู้ขอแจ้งว่าไม่ต้องการแล้ว',
    });
  });

  it.each(['', '   '])('reason is required (%j)', (reason) => {
    expect(rejectionCode(() => cancelRequest(inProgress(), { actor: GM, now: CANCEL_AT, reason }))).toBe(
      'REASON_REQUIRED',
    );
  });

  it.each([
    ['requester', REQUESTER],
    ['viewer', VIEWER],
  ])('%s cannot cancel (GM_ONLY)', (_label, actor) => {
    expect(rejectionCode(() => cancelRequest(inProgress(), { actor, now: CANCEL_AT, reason: 'ไม่ต้องการ' }))).toBe(
      'GM_ONLY',
    );
  });

  it.each(['completed', 'cancelled'] as const)('cannot cancel from %s', (status) => {
    expect(
      rejectionCode(() => cancelRequest(inProgress({ status }), { actor: GM, now: CANCEL_AT, reason: 'ไม่ต้องการ' })),
    ).toBe('INVALID_TRANSITION');
  });

  it('keeps fields outside the lifecycle such as an SLA breach (US-09)', () => {
    const breached = { ...inProgress(), slaBreachedAt: bkk('2026-12-28', '17:00') };
    const { state } = cancelRequest(breached, { actor: GM, now: CANCEL_AT, reason: 'ซ้ำกับงานอื่น' });
    expect(state.slaBreachedAt).toBe(bkk('2026-12-28', '17:00'));
  });
});

describe('reopen (F04, US-09)', () => {
  const REOPEN_AT = bkk('2027-01-07', '09:30');

  it('GM reopens a cancelled request → queued with a reason; cancelled_at cleared', () => {
    const cancelled = cancelRequest(inProgress(), {
      actor: GM,
      now: bkk('2026-12-29', '13:00'),
      reason: 'ซ้ำกับงานอื่น',
    }).state;
    const { state, event } = reopenRequest(cancelled, { actor: GM_2, now: REOPEN_AT, reason: 'ไม่ซ้ำ ตรวจแล้ว' });
    expect(state.status).toBe('queued');
    expect(state.cancelledAt).toBeUndefined();
    expect(state.lastUpdatedAt).toBe(REOPEN_AT);
    expect(event).toEqual({ kind: 'reopened', at: REOPEN_AT, actorId: GM_2.personId, reason: 'ไม่ซ้ำ ตรวจแล้ว' });
  });

  it('GM reopens a completed request (closed or awaiting) → in_progress; cycle id kept', () => {
    const closed = autoCloseRequest(completedAwaiting(), { now: AUTO_CLOSE_AT, completionCycleId: 1 }).state;
    const { state, event } = reopenRequest(closed, { actor: GM, now: REOPEN_AT, reason: 'ผู้ขอโทรแจ้งว่ายังรั่ว' });
    expect(state.status).toBe('in_progress');
    expect(state.closedAt).toBeUndefined();
    expect(state.closureKind).toBeUndefined();
    expect(state.completedAt).toBeUndefined();
    expect(state.autoCloseDueAt).toBeUndefined();
    expect(state.completionCycleId).toBe(1);
    expect(state.lastUpdatedAt).toBe(REOPEN_AT);
    expect(event).toEqual({
      kind: 'reopened',
      at: REOPEN_AT,
      actorId: GM.personId,
      completionCycleId: 1,
      reason: 'ผู้ขอโทรแจ้งว่ายังรั่ว',
    });
  });

  it('after a GM reopen the old cycle cannot be auto-closed or confirmed', () => {
    const reopened = reopenRequest(completedAwaiting(), { actor: GM, now: REOPEN_AT, reason: 'ตรวจพบว่ายังไม่เสร็จ' }).state;
    expect(autoCloseRequest(reopened, { now: AUTO_CLOSE_AT + MINUTE, completionCycleId: 1 }).applied).toBe(false);
    expect(
      rejectionCode(() => confirmCompletion(reopened, { actor: REQUESTER, now: REOPEN_AT + MINUTE, completionCycleId: 1 })),
    ).toBe('NOT_AWAITING_CONFIRMATION');
  });

  it.each(['', '  '])('reason is required (%j)', (reason) => {
    expect(rejectionCode(() => reopenRequest(completedAwaiting(), { actor: GM, now: REOPEN_AT, reason }))).toBe(
      'REASON_REQUIRED',
    );
  });

  it('requester cannot reopen (GM_ONLY)', () => {
    expect(
      rejectionCode(() => reopenRequest(completedAwaiting(), { actor: REQUESTER, now: REOPEN_AT, reason: 'ยังไม่ดี' })),
    ).toBe('GM_ONLY');
  });

  it.each(['queued', 'in_progress', 'waiting'] as const)('cannot reopen from %s', (status) => {
    expect(
      rejectionCode(() => reopenRequest(inProgress({ status }), { actor: GM, now: REOPEN_AT, reason: 'เปิดกลับ' })),
    ).toBe('INVALID_TRANSITION');
  });

  it('keeps an SLA breach across reopen (US-09)', () => {
    const breached = { ...completedAwaiting(), slaBreachedAt: bkk('2026-12-29', '17:00') };
    const { state } = reopenRequest(breached, { actor: GM, now: REOPEN_AT, reason: 'ยังไม่เสร็จ' });
    expect(state.slaBreachedAt).toBe(bkk('2026-12-29', '17:00'));
  });
});

describe('source = trello is read-only (F04)', () => {
  const trello = (status: LifecycleState['status']) => inProgress({ source: 'trello', status });

  it.each([
    ['accept', () => acceptRequest(trello('queued'), { actor: GM, now: DONE_AT })],
    [
      'complete',
      () =>
        completeRequest(trello('in_progress'), {
          actor: GM,
          now: DONE_AT,
          resolutionSummary: 'เสร็จ',
          confirmationCalendar: COMPANY,
        }),
    ],
    ['cancel', () => cancelRequest(trello('in_progress'), { actor: GM, now: DONE_AT, reason: 'ไม่ต้องการ' })],
    ['reopen', () => reopenRequest(trello('cancelled'), { actor: GM, now: DONE_AT, reason: 'เปิดกลับ' })],
  ])('%s is rejected', (_label, action) => {
    expect(rejectionCode(action)).toBe('READ_ONLY_SOURCE');
  });
});

describe('purity', () => {
  it('commands do not mutate the input state', () => {
    const before = inProgress();
    const frozen = Object.freeze({ ...before });
    completeRequest(frozen, { actor: GM, now: DONE_AT, resolutionSummary: 'เสร็จ', confirmationCalendar: COMPANY });
    expect(frozen).toEqual(before);
  });

  it('no lifecycle field is written as undefined (maps cleanly to Firestore)', () => {
    const { state } = completeRequest(withoutRequester(), { actor: GM, now: DONE_AT, resolutionSummary: 'เสร็จ' });
    const reopened = reopenRequest(state, { actor: GM, now: DONE_AT + MINUTE, reason: 'ยังไม่เสร็จ' }).state;
    expect(Object.entries(reopened).filter(([, value]) => value === undefined)).toEqual([]);
  });
});
