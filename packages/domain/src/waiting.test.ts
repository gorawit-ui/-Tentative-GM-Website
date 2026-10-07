// S06 — waiting on others, follow-up and waiting-party response (F04, F05, C3, C4, A2, F3,
// Part 6 §6.6/§6.14, D-S05-1/3). Fixture people are synthetic; instants are UTC epoch ms.
import { describe, expect, it } from 'vitest';
import { effectiveWaitingEnd, snapshotCalendar, waitingElapsed, type CalendarSnapshot, type Instant } from '@gm/time';
import {
  LifecycleRejected,
  acceptRequest,
  cancelRequest,
  changeWaitingParty,
  completeRequest,
  confirmCompletion,
  currentWaitingInterval,
  enterWaiting,
  followUp,
  planWaiting,
  respondWaitingParty,
  resumeWork,
  type Actor,
  type WaitingOnInput,
  type WaitingRequestState,
} from './index';

const GM: Actor = { personId: 'person-gm-01', role: 'gm_staff' };
const GM_ADMIN: Actor = { personId: 'person-gm-admin-01', role: 'gm_admin' };
const REQUESTER: Actor = { personId: 'person-requester-01', role: 'requester' };
const RELATED: Actor = { personId: 'person-related-01', role: 'requester' };
const WATCHER: Actor = { personId: 'person-watcher-01', role: 'requester' };
const VIEWER: Actor = { personId: 'person-viewer-01', role: 'viewer' };
const FINANCE: Actor = { personId: 'person-finance-01', role: 'requester' };
const LEGAL: Actor = { personId: 'person-legal-01', role: 'requester' };
const IT_1: Actor = { personId: 'person-it-01', role: 'requester' };
const IT_2: Actor = { personId: 'person-it-02', role: 'requester' };
const IT_3: Actor = { personId: 'person-it-03', role: 'requester' };

/** Company calendar: Mon–Fri, holidays 31 Dec 2026 and 1 Jan 2027. */
const COMPANY: CalendarSnapshot = snapshotCalendar({
  timeZone: 'Asia/Bangkok',
  openWeekdays: [1, 2, 3, 4, 5],
  holidays: ['2026-12-31', '2027-01-01'],
});

function bkk(date: string, time: string): Instant {
  return Date.parse(`${date}T${time}:00+07:00`);
}

const HOUR = 3_600_000;
const CREATED = bkk('2026-12-28', '09:00');
// A2.3 example: enter 10:00 → party responds 12:00 → GM resumes 14:00.
const ENTER = bkk('2026-12-28', '10:00');
const RESPOND = bkk('2026-12-28', '12:00');
const RESUME = bkk('2026-12-28', '14:00');

const PERSON: WaitingOnInput = { kind: 'person', personId: FINANCE.personId };
const TEAM: WaitingOnInput = { kind: 'team', teamLabel: 'ทีม IT', contactIds: [IT_1.personId, IT_2.personId] };
const CONTRACTOR: WaitingOnInput = { kind: 'contractor', name: 'ช่างแอร์ภายนอก' };

function inProgress(overrides: Partial<WaitingRequestState> = {}): WaitingRequestState {
  return {
    source: 'web',
    status: 'in_progress',
    requesterId: REQUESTER.personId,
    assigneeId: GM.personId,
    lastUpdatedAt: CREATED,
    completionCycleId: 0,
    isConfidential: false,
    relatedPersonIds: [RELATED.personId],
    waitingIntervalSeq: 0,
    ...overrides,
  };
}

function waitingOn(input: WaitingOnInput, overrides: Partial<WaitingRequestState> = {}): WaitingRequestState {
  return enterWaiting(inProgress(overrides), { actor: GM, now: ENTER, waitingOn: input }).state;
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

const enter = (input: WaitingOnInput | undefined, extra: { notify?: boolean } = {}) => () =>
  enterWaiting(inProgress(), { actor: GM, now: ENTER, waitingOn: input, ...extra });

describe('waiting_on is required and explicit (F3, C3)', () => {
  it.each([
    ['missing', undefined],
    ['no kind', {}],
    ['blank kind', { kind: '' }],
  ])('%s → WAITING_ON_REQUIRED (no default party)', (_label, input) => {
    expect(rejectionCode(enter(input))).toBe('WAITING_ON_REQUIRED');
  });

  it('unknown kind is rejected', () => {
    expect(rejectionCode(enter({ kind: 'vendor', name: 'x' }))).toBe('WAITING_KIND_INVALID');
  });

  it.each([undefined, '', '  '])('person needs person_id (%j)', (personId) => {
    expect(rejectionCode(enter({ kind: 'person', personId }))).toBe('WAITING_PERSON_REQUIRED');
  });

  it.each([undefined, '', '  '])('team needs team_label (%j)', (teamLabel) => {
    expect(rejectionCode(enter({ kind: 'team', teamLabel }))).toBe('WAITING_TEAM_LABEL_REQUIRED');
  });

  it('team contacts are optional, at most 3 and distinct', () => {
    expect(enterWaiting(inProgress(), { actor: GM, now: ENTER, waitingOn: { kind: 'team', teamLabel: 'ทีมบัญชี' } }).state.waitingOn).toEqual({
      kind: 'team',
      teamLabel: 'ทีมบัญชี',
      contactIds: [],
    });
    const four = [IT_1, IT_2, IT_3, FINANCE].map((actor) => actor.personId);
    expect(rejectionCode(enter({ kind: 'team', teamLabel: 'ทีม IT', contactIds: four }))).toBe('WAITING_CONTACTS_TOO_MANY');
    expect(
      rejectionCode(enter({ kind: 'team', teamLabel: 'ทีม IT', contactIds: [IT_1.personId, IT_1.personId] })),
    ).toBe('WAITING_CONTACTS_DUPLICATE');
    expect(rejectionCode(enter({ kind: 'team', teamLabel: 'ทีม IT', contactIds: [' '] }))).toBe('WAITING_CONTACT_INVALID');
  });

  it.each(['contractor', 'government', 'other'])('%s needs a name', (kind) => {
    expect(rejectionCode(enter({ kind }))).toBe('WAITING_NAME_REQUIRED');
    expect(rejectionCode(enter({ kind, name: '  ' }))).toBe('WAITING_NAME_REQUIRED');
  });

  it.each([
    ['contractor with a person_id', { kind: 'contractor', name: 'ช่าง', personId: FINANCE.personId }],
    ['person with a name', { kind: 'person', personId: FINANCE.personId, name: 'คุณสมมติ' }],
    ['team with a person_id', { kind: 'team', teamLabel: 'ทีม IT', personId: FINANCE.personId }],
    ['person with contacts', { kind: 'person', personId: FINANCE.personId, contactIds: [IT_1.personId] }],
  ])('fields of another kind are rejected: %s', (_label, input) => {
    expect(rejectionCode(enter(input))).toBe('WAITING_ON_INVALID');
  });

  it('stores exactly the fields of the kind, trimmed', () => {
    const state = enterWaiting(inProgress(), {
      actor: GM,
      now: ENTER,
      waitingOn: { kind: 'government', name: '  สำนักงานเขต  ' },
    }).state;
    expect(state.waitingOn).toEqual({ kind: 'government', name: 'สำนักงานเขต' });
  });
});

describe('who is notified (F05 §9.1, C3) — computed only, nothing is sent', () => {
  it('person: notified by default', () => {
    expect(planWaiting(inProgress(), { waitingOn: PERSON }).recipientIds).toEqual([FINANCE.personId]);
  });

  it('person: GM can turn it off', () => {
    expect(planWaiting(inProgress(), { waitingOn: PERSON, notify: false }).recipientIds).toEqual([]);
  });

  it('team: only the chosen contacts are notified', () => {
    expect(planWaiting(inProgress(), { waitingOn: TEAM }).recipientIds).toEqual([IT_1.personId, IT_2.personId]);
    expect(planWaiting(inProgress(), { waitingOn: TEAM, notify: false }).recipientIds).toEqual([]);
  });

  it('team without contacts: nobody to notify; asking to notify is rejected', () => {
    const noContacts = { kind: 'team', teamLabel: 'ทีมบัญชี' };
    expect(planWaiting(inProgress(), { waitingOn: noContacts }).recipientIds).toEqual([]);
    expect(rejectionCode(() => planWaiting(inProgress(), { waitingOn: noContacts, notify: true }))).toBe(
      'NOTIFY_NOT_AVAILABLE',
    );
  });

  it.each(['contractor', 'government', 'other'])('%s: never notified', (kind) => {
    const input = { kind, name: 'ฝ่ายภายนอก' };
    expect(planWaiting(inProgress(), { waitingOn: input }).recipientIds).toEqual([]);
    expect(rejectionCode(() => planWaiting(inProgress(), { waitingOn: input, notify: true }))).toBe(
      'NOTIFY_NOT_AVAILABLE',
    );
  });

  it('the plan lists recipients who become related persons, skipping people who already have access', () => {
    const plan = planWaiting(inProgress(), {
      waitingOn: { kind: 'team', teamLabel: 'ทีม IT', contactIds: [IT_1.personId, RELATED.personId, REQUESTER.personId] },
    });
    expect(plan.recipientIds).toEqual([IT_1.personId, RELATED.personId, REQUESTER.personId]);
    expect(plan.newRelatedPersonIds).toEqual([IT_1.personId]);
    expect(plan.needsConfidentialGrant).toBe(false);
  });
});

describe('notified people become related persons; confidential needs separate consent (C3, C4, F3)', () => {
  it('general request: recipients are added to related_person_ids automatically', () => {
    const state = waitingOn(TEAM);
    expect(state.relatedPersonIds).toEqual([RELATED.personId, IT_1.personId, IT_2.personId]);
  });

  it('nobody is added when notification is off or the party is external', () => {
    expect(enterWaiting(inProgress(), { actor: GM, now: ENTER, waitingOn: PERSON, notify: false }).state.relatedPersonIds).toEqual([
      RELATED.personId,
    ]);
    expect(waitingOn(CONTRACTOR).relatedPersonIds).toEqual([RELATED.personId]);
  });

  it('confidential request adding a new person without consent is rejected', () => {
    const secret = inProgress({ isConfidential: true });
    expect(planWaiting(secret, { waitingOn: PERSON }).needsConfidentialGrant).toBe(true);
    expect(rejectionCode(() => enterWaiting(secret, { actor: GM, now: ENTER, waitingOn: PERSON }))).toBe(
      'CONFIDENTIAL_GRANT_REQUIRED',
    );
    expect(
      rejectionCode(() =>
        enterWaiting(secret, { actor: GM, now: ENTER, waitingOn: PERSON, confirmConfidentialGrant: false }),
      ),
    ).toBe('CONFIDENTIAL_GRANT_REQUIRED');
  });

  it('confidential request with consent adds the person', () => {
    const { state, event } = enterWaiting(inProgress({ isConfidential: true }), {
      actor: GM,
      now: ENTER,
      waitingOn: PERSON,
      confirmConfidentialGrant: true,
    });
    expect(state.relatedPersonIds).toContain(FINANCE.personId);
    expect(event).toMatchObject({ kind: 'waiting_started', addedRelatedPersonIds: [FINANCE.personId] });
  });

  it('confidential request can still wait with notification off (no new access, no consent needed)', () => {
    const { state } = enterWaiting(inProgress({ isConfidential: true }), {
      actor: GM,
      now: ENTER,
      waitingOn: PERSON,
      notify: false,
    });
    expect(state.status).toBe('waiting');
    expect(state.relatedPersonIds).toEqual([RELATED.personId]);
  });

  it('confidential request notifying someone already related needs no consent', () => {
    const secret = inProgress({ isConfidential: true });
    const relatedPerson = { kind: 'person', personId: RELATED.personId };
    expect(planWaiting(secret, { waitingOn: relatedPerson }).needsConfidentialGrant).toBe(false);
    expect(enterWaiting(secret, { actor: GM, now: ENTER, waitingOn: relatedPerson }).state.status).toBe('waiting');
  });
});

describe('enterWaiting (F04 in_progress → waiting)', () => {
  it('opens interval 1, records waiting fields, updates last_updated_at and returns the first notice', () => {
    const { state, event, notice } = enterWaiting(inProgress(), { actor: GM, now: ENTER, waitingOn: PERSON });
    expect(state).toMatchObject({
      status: 'waiting',
      waitingOn: { kind: 'person', personId: FINANCE.personId },
      waitingIntervalSeq: 1,
      currentWaitingIntervalId: 1,
      waitingSince: ENTER,
      waitingRecipientIds: [FINANCE.personId],
      waitingPartyResponded: false,
      lastUpdatedAt: ENTER,
    });
    expect(state).not.toHaveProperty('respondedAt');
    expect(event).toEqual({
      kind: 'waiting_started',
      at: ENTER,
      actorId: GM.personId,
      intervalId: 1,
      waitingOn: { kind: 'person', personId: FINANCE.personId },
      recipientIds: [FINANCE.personId],
      addedRelatedPersonIds: [FINANCE.personId],
    });
    expect(notice).toEqual({ intervalId: 1, recipientIds: [FINANCE.personId] });
  });

  it('no notice when nobody is notified', () => {
    expect(enterWaiting(inProgress(), { actor: GM, now: ENTER, waitingOn: CONTRACTOR }).notice).toBeUndefined();
  });

  it.each([
    ['requester', REQUESTER],
    ['viewer', VIEWER],
  ])('%s cannot put a request on waiting (GM_ONLY)', (_label, actor) => {
    expect(rejectionCode(() => enterWaiting(inProgress(), { actor, now: ENTER, waitingOn: PERSON }))).toBe('GM_ONLY');
  });

  it.each(['queued', 'waiting', 'completed', 'cancelled'] as const)('cannot enter waiting from %s', (status) => {
    expect(rejectionCode(() => enterWaiting(inProgress({ status }), { actor: GM, now: ENTER, waitingOn: PERSON }))).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('Trello cards are read-only', () => {
    expect(
      rejectionCode(() => enterWaiting(inProgress({ source: 'trello' }), { actor: GM, now: ENTER, waitingOn: PERSON })),
    ).toBe('READ_ONLY_SOURCE');
  });
});

describe('changeWaitingParty (A → B keeps the old interval)', () => {
  const CHANGE = bkk('2026-12-28', '11:00');

  it('ends A at the change, opens B as interval 2 and resets the response', () => {
    const responded = respondWaitingParty(waitingOn(PERSON), {
      actor: FINANCE,
      now: bkk('2026-12-28', '10:30'),
      intervalId: 1,
    }).state;
    const { state, event, notice } = changeWaitingParty(responded, { actor: GM, now: CHANGE, waitingOn: TEAM });
    expect(state).toMatchObject({
      status: 'waiting',
      waitingOn: { kind: 'team', teamLabel: 'ทีม IT', contactIds: [IT_1.personId, IT_2.personId] },
      currentWaitingIntervalId: 2,
      waitingIntervalSeq: 2,
      waitingSince: CHANGE,
      waitingRecipientIds: [IT_1.personId, IT_2.personId],
      waitingPartyResponded: false,
      lastUpdatedAt: CHANGE,
    });
    expect(state).not.toHaveProperty('respondedAt');
    expect(state.relatedPersonIds).toEqual([RELATED.personId, FINANCE.personId, IT_1.personId, IT_2.personId]);
    expect(event).toMatchObject({
      kind: 'waiting_started',
      intervalId: 2,
      endedInterval: {
        intervalId: 1,
        waitingOn: { kind: 'person', personId: FINANCE.personId },
        recipientIds: [FINANCE.personId],
        startedAt: ENTER,
        respondedAt: bkk('2026-12-28', '10:30'),
        exitedAt: CHANGE,
      },
    });
    expect(notice).toEqual({ intervalId: 2, recipientIds: [IT_1.personId, IT_2.personId] });
  });

  it('only from waiting', () => {
    expect(rejectionCode(() => changeWaitingParty(inProgress(), { actor: GM, now: CHANGE, waitingOn: TEAM }))).toBe(
      'INVALID_TRANSITION',
    );
  });

  it('GM only', () => {
    expect(rejectionCode(() => changeWaitingParty(waitingOn(PERSON), { actor: FINANCE, now: CHANGE, waitingOn: TEAM }))).toBe(
      'GM_ONLY',
    );
  });
});

describe('followUp — ติดตามแล้ว (F05 §9.4, C3)', () => {
  const FOLLOW = bkk('2026-12-29', '10:00');

  it('records history and updates last_updated_at; waiting_since is unchanged; nothing is sent', () => {
    const before = waitingOn(PERSON);
    const { state, event, reminder } = followUp(before, { actor: GM, now: FOLLOW, calendar: COMPANY });
    expect(state.lastUpdatedAt).toBe(FOLLOW);
    expect(state.waitingSince).toBe(ENTER);
    expect(state.status).toBe('waiting');
    expect(reminder).toBeUndefined();
    expect(event).toEqual({ kind: 'followed_up', at: FOLLOW, actorId: GM.personId, intervalId: 1 });
  });

  it('remind on a business day sends now and records reminded_at', () => {
    const { state, event, reminder } = followUp(waitingOn(PERSON), {
      actor: GM,
      now: FOLLOW,
      remind: true,
      calendar: COMPANY,
    });
    expect(reminder).toEqual({ status: 'send_now', businessDate: '2026-12-29', recipientIds: [FINANCE.personId] });
    expect(state.lastReminderBusinessDate).toBe('2026-12-29');
    expect(event).toMatchObject({ kind: 'followed_up', remindedAt: FOLLOW, reminder });
  });

  it('a second reminder on the same business day is not sent, but the follow-up still counts', () => {
    const first = followUp(waitingOn(PERSON), { actor: GM, now: FOLLOW, remind: true, calendar: COMPANY }).state;
    const later = bkk('2026-12-29', '16:00');
    const { state, event, reminder } = followUp(first, { actor: GM, now: later, remind: true, calendar: COMPANY });
    expect(reminder).toEqual({ status: 'quota_used', businessDate: '2026-12-29' });
    expect(state.lastUpdatedAt).toBe(later);
    expect(event).not.toHaveProperty('remindedAt');
  });

  it('the next business day has a new quota', () => {
    const first = followUp(waitingOn(PERSON), { actor: GM, now: FOLLOW, remind: true, calendar: COMPANY }).state;
    const next = bkk('2026-12-30', '09:00');
    expect(followUp(first, { actor: GM, now: next, remind: true, calendar: COMPANY }).reminder?.status).toBe('send_now');
  });

  it('on a holiday the reminder waits for the next business day and uses that day\'s quota', () => {
    const holiday = bkk('2026-12-31', '10:00');
    const { state, reminder, event } = followUp(waitingOn(PERSON), {
      actor: GM,
      now: holiday,
      remind: true,
      calendar: COMPANY,
    });
    // D-S06-2: deferred to 09:00 Asia/Bangkok on the next business day.
    expect(reminder).toEqual({
      status: 'next_business_day',
      businessDate: '2027-01-04',
      sendAt: bkk('2027-01-04', '09:00'),
      recipientIds: [FINANCE.personId],
    });
    expect(state.lastUpdatedAt).toBe(holiday);
    expect(event).not.toHaveProperty('remindedAt');
    const monday = bkk('2027-01-04', '09:30');
    expect(followUp(state, { actor: GM, now: monday, remind: true, calendar: COMPANY }).reminder).toEqual({
      status: 'quota_used',
      businessDate: '2027-01-04',
    });
  });

  it('D-S06-2: the deferred send time comes from settings', () => {
    const { reminder } = followUp(waitingOn(PERSON), {
      actor: GM,
      now: bkk('2027-01-02', '15:00'),
      remind: true,
      calendar: COMPANY,
      workingMorningTime: '08:30',
    });
    expect(reminder).toMatchObject({ status: 'next_business_day', sendAt: bkk('2027-01-04', '08:30') });
  });

  it('the quota is per request, even after changing the waited party the same day', () => {
    const reminded = followUp(waitingOn(PERSON), { actor: GM, now: FOLLOW, remind: true, calendar: COMPANY }).state;
    const changed = changeWaitingParty(reminded, { actor: GM, now: bkk('2026-12-29', '11:00'), waitingOn: TEAM }).state;
    expect(
      followUp(changed, { actor: GM, now: bkk('2026-12-29', '15:00'), remind: true, calendar: COMPANY }).reminder?.status,
    ).toBe('quota_used');
  });

  it('a reminder needs someone to remind (person/team with notified contacts)', () => {
    expect(
      rejectionCode(() => followUp(waitingOn(CONTRACTOR), { actor: GM, now: FOLLOW, remind: true, calendar: COMPANY })),
    ).toBe('REMINDER_NO_RECIPIENTS');
    const silent = enterWaiting(inProgress(), { actor: GM, now: ENTER, waitingOn: PERSON, notify: false }).state;
    expect(rejectionCode(() => followUp(silent, { actor: GM, now: FOLLOW, remind: true, calendar: COMPANY }))).toBe(
      'REMINDER_NO_RECIPIENTS',
    );
  });

  it.each([
    ['requester', REQUESTER],
    ['watcher', WATCHER],
    ['waiting party', FINANCE],
  ])('%s cannot follow up (GM_ONLY; not GM progress)', (_label, actor) => {
    expect(rejectionCode(() => followUp(waitingOn(PERSON), { actor, now: FOLLOW, calendar: COMPANY }))).toBe('GM_ONLY');
  });

  it('only while waiting', () => {
    expect(rejectionCode(() => followUp(inProgress(), { actor: GM, now: FOLLOW, calendar: COMPANY }))).toBe(
      'INVALID_TRANSITION',
    );
  });
});

describe('respondWaitingParty — “ฝั่งฉันเรียบร้อยแล้ว” (A2)', () => {
  it('the current recipient responds: responded + responded_at; no status/waiting/last_updated_at change', () => {
    const before = waitingOn(PERSON);
    const { state, event } = respondWaitingParty(before, {
      actor: FINANCE,
      now: RESPOND,
      intervalId: 1,
      note: '  ส่งเอกสารให้แล้ว  ',
    });
    expect(state).toEqual({ ...before, waitingPartyResponded: true, respondedAt: RESPOND });
    expect(state.lastUpdatedAt).toBe(ENTER);
    expect(event).toEqual({
      kind: 'waiting_party_responded',
      at: RESPOND,
      actorId: FINANCE.personId,
      intervalId: 1,
      note: 'ส่งเอกสารให้แล้ว',
    });
  });

  it('the party\'s wait ends at responded_at (S02 effectiveWaitingEnd / waitingElapsed)', () => {
    const responded = respondWaitingParty(waitingOn(PERSON), { actor: FINANCE, now: RESPOND, intervalId: 1 }).state;
    const interval = currentWaitingInterval(responded);
    expect(interval).toEqual({ startedAt: ENTER, respondedAt: RESPOND });
    if (interval === undefined) return;
    expect(effectiveWaitingEnd(interval, RESUME)).toBe(RESPOND);
    expect(waitingElapsed(interval, RESUME, 'continuous_24h', COMPANY)).toBe(2 * HOUR);
  });

  it('team: the first contact answers for the whole team; later answers are refused', () => {
    const responded = respondWaitingParty(waitingOn(TEAM), { actor: IT_2, now: RESPOND, intervalId: 1 }).state;
    expect(responded.respondedAt).toBe(RESPOND);
    expect(
      rejectionCode(() => respondWaitingParty(responded, { actor: IT_1, now: RESPOND + HOUR, intervalId: 1 })),
    ).toBe('ALREADY_RESPONDED');
    expect(
      rejectionCode(() => respondWaitingParty(responded, { actor: IT_2, now: RESPOND + HOUR, intervalId: 1 })),
    ).toBe('ALREADY_RESPONDED');
  });

  it.each([
    ['watcher', WATCHER],
    ['viewer', VIEWER],
    ['related person (not a recipient)', RELATED],
    ['requester', REQUESTER],
    ['GM', GM],
    ['GM Admin', GM_ADMIN],
    ['team member who was not chosen as contact', IT_3],
  ])('%s cannot respond for the waited party', (_label, actor) => {
    expect(rejectionCode(() => respondWaitingParty(waitingOn(TEAM), { actor, now: RESPOND, intervalId: 1 }))).toBe(
      'NOT_CURRENT_RECIPIENT',
    );
  });

  it('a recipient of an earlier interval cannot respond for the new one', () => {
    const changed = changeWaitingParty(waitingOn(PERSON), {
      actor: GM,
      now: bkk('2026-12-28', '11:00'),
      waitingOn: { kind: 'person', personId: LEGAL.personId },
    }).state;
    expect(rejectionCode(() => respondWaitingParty(changed, { actor: FINANCE, now: RESPOND, intervalId: 1 }))).toBe(
      'STALE_WAITING_INTERVAL',
    );
    expect(rejectionCode(() => respondWaitingParty(changed, { actor: FINANCE, now: RESPOND, intervalId: 2 }))).toBe(
      'NOT_CURRENT_RECIPIENT',
    );
    expect(respondWaitingParty(changed, { actor: LEGAL, now: RESPOND, intervalId: 2 }).state.respondedAt).toBe(RESPOND);
  });

  it.each([
    ['contractor', CONTRACTOR],
    ['government', { kind: 'government', name: 'สำนักงานเขต' }],
    ['other', { kind: 'other', name: 'เจ้าของอาคาร' }],
  ])('%s has no response button', (_label, input) => {
    expect(rejectionCode(() => respondWaitingParty(waitingOn(input), { actor: FINANCE, now: RESPOND, intervalId: 1 }))).toBe(
      'NO_RESPONSE_FOR_PARTY',
    );
  });

  it('a person waited on without notification is not a recipient', () => {
    const silent = enterWaiting(inProgress(), { actor: GM, now: ENTER, waitingOn: PERSON, notify: false }).state;
    expect(rejectionCode(() => respondWaitingParty(silent, { actor: FINANCE, now: RESPOND, intervalId: 1 }))).toBe(
      'NOT_CURRENT_RECIPIENT',
    );
  });

  it('a recipient whose detail access was removed cannot respond', () => {
    const revoked = { ...waitingOn(PERSON), relatedPersonIds: [RELATED.personId] };
    expect(rejectionCode(() => respondWaitingParty(revoked, { actor: FINANCE, now: RESPOND, intervalId: 1 }))).toBe(
      'ACCESS_REVOKED',
    );
  });

  it('cannot respond when the request is no longer waiting', () => {
    const resumed = resumeWork(waitingOn(PERSON), { actor: GM, now: RESUME }).state;
    expect(rejectionCode(() => respondWaitingParty(resumed, { actor: FINANCE, now: RESUME + HOUR, intervalId: 1 }))).toBe(
      'NOT_WAITING',
    );
  });

  it('Trello cards are read-only', () => {
    const trello = { ...waitingOn(PERSON), source: 'trello' as const };
    expect(rejectionCode(() => respondWaitingParty(trello, { actor: FINANCE, now: RESPOND, intervalId: 1 }))).toBe(
      'READ_ONLY_SOURCE',
    );
  });
});

describe('resumeWork — “กลับมาทำต่อ” (F04 waiting → in_progress)', () => {
  it('back to in_progress, interval closed with exit time, current waiting fields cleared, last_updated_at = now', () => {
    const responded = respondWaitingParty(waitingOn(PERSON), { actor: FINANCE, now: RESPOND, intervalId: 1 }).state;
    const { state, event } = resumeWork(responded, { actor: GM, now: RESUME });
    expect(state.status).toBe('in_progress');
    expect(state.lastUpdatedAt).toBe(RESUME);
    for (const field of [
      'waitingOn',
      'currentWaitingIntervalId',
      'waitingSince',
      'waitingRecipientIds',
      'waitingPartyResponded',
      'respondedAt',
    ]) {
      expect(state).not.toHaveProperty(field);
    }
    expect(state.waitingIntervalSeq).toBe(1);
    expect(state.relatedPersonIds).toContain(FINANCE.personId);
    const endedInterval = {
      intervalId: 1,
      waitingOn: { kind: 'person', personId: FINANCE.personId },
      recipientIds: [FINANCE.personId],
      startedAt: ENTER,
      respondedAt: RESPOND,
      exitedAt: RESUME,
    };
    expect(event).toEqual({ kind: 'waiting_ended', at: RESUME, actorId: GM.personId, endedInterval });
    // A2.3: the party is charged 2 h (10:00–12:00); 12:00–14:00 is GM time.
    expect(waitingElapsed(endedInterval, RESUME, 'continuous_24h', COMPANY)).toBe(2 * HOUR);
  });

  it('contractor/government: no response; GM resumes and the wait ends at the exit', () => {
    const { event } = resumeWork(waitingOn(CONTRACTOR), { actor: GM, now: RESUME });
    expect(event).toMatchObject({ kind: 'waiting_ended', endedInterval: { startedAt: ENTER, exitedAt: RESUME } });
    if (event.kind !== 'waiting_ended') return;
    expect(event.endedInterval).not.toHaveProperty('respondedAt');
    expect(waitingElapsed(event.endedInterval, RESUME, 'continuous_24h', COMPANY)).toBe(4 * HOUR);
  });

  it.each([
    ['requester', REQUESTER],
    ['waiting party', FINANCE],
    ['viewer', VIEWER],
  ])('%s cannot resume (GM_ONLY)', (_label, actor) => {
    expect(rejectionCode(() => resumeWork(waitingOn(PERSON), { actor, now: RESUME }))).toBe('GM_ONLY');
  });

  it('only from waiting', () => {
    expect(rejectionCode(() => resumeWork(inProgress(), { actor: GM, now: RESUME }))).toBe('INVALID_TRANSITION');
  });
});

describe('waiting with the S05 lifecycle (D-S05-1)', () => {
  it('a waiting request cannot be completed directly; resume first', () => {
    expect(
      rejectionCode(() =>
        completeRequest(waitingOn(PERSON), {
          actor: GM,
          now: RESUME,
          resolutionSummary: 'เสร็จ',
          confirmationCalendar: COMPANY,
        }),
      ),
    ).toBe('INVALID_TRANSITION');
  });

  it('cancelling a waiting request closes the open interval in history', () => {
    const cancelAt = bkk('2026-12-28', '15:00');
    const { state, event } = cancelRequest(waitingOn(PERSON), { actor: GM, now: cancelAt, reason: 'ผู้ขอยกเลิกเอง' });
    expect(state.status).toBe('cancelled');
    expect(state).not.toHaveProperty('waitingOn');
    expect(state).not.toHaveProperty('currentWaitingIntervalId');
    expect(event.endedWaitingInterval).toEqual({
      intervalId: 1,
      waitingOn: { kind: 'person', personId: FINANCE.personId },
      recipientIds: [FINANCE.personId],
      startedAt: ENTER,
      exitedAt: cancelAt,
    });
  });

  it('TEST-CHECKLIST flow: accept → waiting → party responds → GM resumes → complete → requester confirms', () => {
    const queued = inProgress({ status: 'queued' });
    const { assigneeId: _unassigned, ...unassigned } = queued;
    let state: WaitingRequestState = acceptRequest(unassigned, { actor: GM, now: CREATED }).state;
    state = enterWaiting(state, { actor: GM, now: ENTER, waitingOn: PERSON }).state;
    state = respondWaitingParty(state, { actor: FINANCE, now: RESPOND, intervalId: 1 }).state;
    expect(state.status).toBe('waiting');
    expect(state.lastUpdatedAt).toBe(ENTER);
    state = resumeWork(state, { actor: GM, now: RESUME }).state;
    const doneAt = bkk('2026-12-28', '16:00');
    state = completeRequest(state, { actor: GM, now: doneAt, resolutionSummary: 'ได้เอกสารแล้ว', confirmationCalendar: COMPANY }).state;
    state = confirmCompletion(state, { actor: REQUESTER, now: doneAt + HOUR, completionCycleId: 1 }).state;
    expect(state.closureKind).toBe('requester_confirmed');
  });
});

describe('D-S06-4: a GM as the waited party already has access', () => {
  const GM_2: Actor = { personId: 'person-gm-02', role: 'gm_staff' };
  const GM_PEOPLE = [GM.personId, GM_2.personId, GM_ADMIN.personId];
  const WAIT_GM_2: WaitingOnInput = { kind: 'person', personId: GM_2.personId };

  it('is notified as usual but not added as a related person', () => {
    const { state, notice, event } = enterWaiting(inProgress(), {
      actor: GM,
      now: ENTER,
      waitingOn: WAIT_GM_2,
      gmPersonIds: GM_PEOPLE,
    });
    expect(notice).toEqual({ intervalId: 1, recipientIds: [GM_2.personId] });
    expect(state.relatedPersonIds).toEqual([RELATED.personId]);
    expect(event).toMatchObject({ addedRelatedPersonIds: [] });
  });

  it('needs no confidential consent', () => {
    const secret = inProgress({ isConfidential: true });
    expect(planWaiting(secret, { waitingOn: WAIT_GM_2, gmPersonIds: GM_PEOPLE }).needsConfidentialGrant).toBe(false);
    expect(
      enterWaiting(secret, { actor: GM, now: ENTER, waitingOn: WAIT_GM_2, gmPersonIds: GM_PEOPLE }).state.status,
    ).toBe('waiting');
  });

  it('team contacts: only the non-GM contacts become related / need consent', () => {
    const team = { kind: 'team', teamLabel: 'ทีมจัดซื้อ', contactIds: [GM_ADMIN.personId, IT_1.personId] };
    const plan = planWaiting(inProgress({ isConfidential: true }), { waitingOn: team, gmPersonIds: GM_PEOPLE });
    expect(plan.recipientIds).toEqual([GM_ADMIN.personId, IT_1.personId]);
    expect(plan.newRelatedPersonIds).toEqual([IT_1.personId]);
    expect(plan.needsConfidentialGrant).toBe(true);
  });

  it('the GM recipient can respond for the party', () => {
    const state = enterWaiting(inProgress({ isConfidential: true }), {
      actor: GM,
      now: ENTER,
      waitingOn: WAIT_GM_2,
      gmPersonIds: GM_PEOPLE,
    }).state;
    const responded = respondWaitingParty(state, { actor: GM_2, now: RESPOND, intervalId: 1 }).state;
    expect(responded.respondedAt).toBe(RESPOND);
  });
});

describe('D-S08-2: the GM who acts is not notified', () => {
  const GM_PEOPLE = [GM.personId, GM_ADMIN.personId];
  const TEAM_WITH_ACTOR = { kind: 'team', teamLabel: 'ทีม GM + IT', contactIds: [GM.personId, IT_1.personId] };

  it('the first notice leaves out the GM who put the request on waiting', () => {
    const { notice, state } = enterWaiting(inProgress(), {
      actor: GM,
      now: ENTER,
      waitingOn: TEAM_WITH_ACTOR,
      gmPersonIds: GM_PEOPLE,
    });
    expect(notice).toEqual({ intervalId: 1, recipientIds: [IT_1.personId] });
    // Still a recipient of the interval (may answer for the team); only the notice skips them.
    expect(state.waitingRecipientIds).toEqual([GM.personId, IT_1.personId]);
  });

  it('no notice at all when the actor is the only recipient', () => {
    expect(
      enterWaiting(inProgress(), {
        actor: GM,
        now: ENTER,
        waitingOn: { kind: 'person', personId: GM.personId },
        gmPersonIds: GM_PEOPLE,
      }).notice,
    ).toBeUndefined();
  });

  it('a reminder leaves out the GM who sends it', () => {
    const state = enterWaiting(inProgress(), {
      actor: GM_ADMIN,
      now: ENTER,
      waitingOn: TEAM_WITH_ACTOR,
      gmPersonIds: GM_PEOPLE,
    }).state;
    const { reminder } = followUp(state, { actor: GM, now: bkk('2026-12-29', '10:00'), remind: true, calendar: COMPANY });
    expect(reminder).toEqual({ status: 'send_now', businessDate: '2026-12-29', recipientIds: [IT_1.personId] });
  });
});

describe('D-S09-2: confirmed confidential grants are recorded', () => {
  it('people added to a confidential request with the grant confirmed are kept in confidentialGrantIds', () => {
    const { state } = enterWaiting(inProgress({ isConfidential: true, confidentialGrantIds: [RELATED.personId] }), {
      actor: GM,
      now: ENTER,
      waitingOn: TEAM,
      confirmConfidentialGrant: true,
    });
    expect(state.confidentialGrantIds).toEqual([RELATED.personId, IT_1.personId, IT_2.personId]);
  });

  it('a general request records no grants', () => {
    expect(waitingOn(TEAM)).not.toHaveProperty('confidentialGrantIds');
  });
});
