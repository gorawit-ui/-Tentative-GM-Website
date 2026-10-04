// S07 — GM presence and leave (C7, A3, F07). Instants are UTC epoch ms; days are Asia/Bangkok.
import { describe, expect, it } from 'vitest';
import type { Instant } from '@gm/time';
import {
  LifecycleRejected,
  PRESENCE_LABELS,
  PRESENCE_STATUSES,
  effectivePresence,
  isOnLeave,
  resetPresence,
  setPresence,
  type Actor,
  type GmProfile,
} from './index';

const GM: Actor = { personId: 'person-gm-01', role: 'gm_staff' };
const GM_2: Actor = { personId: 'person-gm-02', role: 'gm_staff' };
const GM_ADMIN: Actor = { personId: 'person-gm-admin-01', role: 'gm_admin' };
const EMPLOYEE: Actor = { personId: 'person-employee-01', role: 'requester' };

function bkk(date: string, time: string): Instant {
  return Date.parse(`${date}T${time}:00+07:00`);
}

const MON_10 = bkk('2026-12-28', '10:00');
const SECOND = 1000;

const blank: GmProfile = { personId: GM.personId, presenceStatus: 'unspecified', focusRequestId: 'req-0427' };

function rejectionCode(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    if (error instanceof LifecycleRejected) return error.code;
    throw error;
  }
  throw new Error('expected LifecycleRejected');
}

describe('presence values (C7)', () => {
  it('has exactly the 8 values with Thai labels', () => {
    expect(PRESENCE_STATUSES).toEqual([
      'at_wh300',
      'at_fac16',
      'at_fac17',
      'at_office_195',
      'at_cafe_222',
      'off_site',
      'on_leave',
      'unspecified',
    ]);
    expect(Object.values(PRESENCE_LABELS)).toEqual([
      'อยู่ WH300',
      'อยู่ FAC16',
      'อยู่ FAC17',
      'อยู่ Office 195',
      'อยู่ Cafe 222',
      'ออกนอกสถานที่',
      'ลา',
      'ไม่ระบุ',
    ]);
  });
});

describe('setPresence (C7, A3, Part 6 §6.6)', () => {
  it('the GM sets their own presence; time is kept; focus is untouched', () => {
    const { profile, event } = setPresence(blank, { actor: GM, now: MON_10, status: 'at_fac16' });
    expect(profile).toEqual({ ...blank, presenceStatus: 'at_fac16', presenceUpdatedAt: MON_10 });
    expect(event).toEqual({
      kind: 'presence_changed',
      at: MON_10,
      actorId: GM.personId,
      personId: GM.personId,
      status: 'at_fac16',
    });
  });

  it.each(PRESENCE_STATUSES)('accepts %s', (status) => {
    expect(setPresence(blank, { actor: GM, now: MON_10, status }).profile.presenceStatus).toBe(status);
  });

  it.each(['อยู่ FAC16', 'at_fac18', 'busy', ''])('rejects anything outside the list (%j)', (status) => {
    expect(rejectionCode(() => setPresence(blank, { actor: GM, now: MON_10, status }))).toBe('PRESENCE_INVALID');
  });

  it('GM Admin may set another GM\'s presence', () => {
    expect(setPresence(blank, { actor: GM_ADMIN, now: MON_10, status: 'off_site' }).event.actorId).toBe(
      GM_ADMIN.personId,
    );
  });

  it.each([
    ['another GM Staff', GM_2],
    ['an employee', EMPLOYEE],
  ])('%s cannot set it', (_label, actor) => {
    expect(rejectionCode(() => setPresence(blank, { actor, now: MON_10, status: 'off_site' }))).toBe('PROFILE_OWNER_ONLY');
  });

  it('leave may carry an end date (today or later)', () => {
    expect(setPresence(blank, { actor: GM, now: MON_10, status: 'on_leave', leaveEndsOn: '2026-12-30' }).profile).toMatchObject({
      presenceStatus: 'on_leave',
      leaveEndsOn: '2026-12-30',
    });
    expect(
      setPresence(blank, { actor: GM, now: MON_10, status: 'on_leave', leaveEndsOn: '2026-12-28' }).profile.leaveEndsOn,
    ).toBe('2026-12-28');
  });

  it('an end date before today is rejected (A3)', () => {
    expect(
      rejectionCode(() => setPresence(blank, { actor: GM, now: MON_10, status: 'on_leave', leaveEndsOn: '2026-12-27' })),
    ).toBe('LEAVE_END_IN_PAST');
  });

  it.each(['2026-02-30', '30/12/2026', '2569-12-30'])('an invalid end date is rejected (%j)', (leaveEndsOn) => {
    expect(rejectionCode(() => setPresence(blank, { actor: GM, now: MON_10, status: 'on_leave', leaveEndsOn }))).toBe(
      'LEAVE_END_INVALID',
    );
  });

  it('an end date only goes with leave', () => {
    expect(
      rejectionCode(() => setPresence(blank, { actor: GM, now: MON_10, status: 'off_site', leaveEndsOn: '2026-12-30' })),
    ).toBe('LEAVE_END_NOT_APPLICABLE');
  });

  it('changing to another presence clears the earlier leave end date (A3)', () => {
    const onLeave = setPresence(blank, { actor: GM, now: MON_10, status: 'on_leave', leaveEndsOn: '2026-12-30' }).profile;
    const back = setPresence(onLeave, { actor: GM, now: bkk('2026-12-29', '08:00'), status: 'at_wh300' }).profile;
    expect(back).not.toHaveProperty('leaveEndsOn');
    expect(back.presenceStatus).toBe('at_wh300');
  });
});

describe('effectivePresence — reset at the end of the Bangkok day (C7, A3)', () => {
  const atFac16 = () => setPresence(blank, { actor: GM, now: MON_10, status: 'at_fac16' }).profile;

  it('shows the value and the time it was set during the same day', () => {
    expect(effectivePresence(atFac16(), bkk('2026-12-28', '23:59'))).toEqual({
      status: 'at_fac16',
      setAt: MON_10,
      expiresAt: bkk('2026-12-29', '00:00'),
    });
  });

  it('is “ไม่ระบุ” from midnight, even before the reset job runs', () => {
    expect(effectivePresence(atFac16(), bkk('2026-12-29', '00:00'))).toEqual({ status: 'unspecified' });
  });

  it('leave without an end date expires at the end of the day', () => {
    const onLeave = setPresence(blank, { actor: GM, now: MON_10, status: 'on_leave' }).profile;
    expect(effectivePresence(onLeave, bkk('2026-12-28', '23:59')).status).toBe('on_leave');
    expect(effectivePresence(onLeave, bkk('2026-12-29', '00:00')).status).toBe('unspecified');
  });

  it('leave with an end date is not reset until that date ends (inclusive)', () => {
    const onLeave = setPresence(blank, { actor: GM, now: MON_10, status: 'on_leave', leaveEndsOn: '2026-12-30' }).profile;
    expect(effectivePresence(onLeave, bkk('2026-12-29', '12:00'))).toEqual({
      status: 'on_leave',
      setAt: MON_10,
      leaveEndsOn: '2026-12-30',
      expiresAt: bkk('2026-12-31', '00:00'),
    });
    expect(effectivePresence(onLeave, bkk('2026-12-31', '00:00') - SECOND).status).toBe('on_leave');
    expect(effectivePresence(onLeave, bkk('2026-12-31', '00:00')).status).toBe('unspecified');
  });

  it('“ไม่ระบุ” or never set is just “ไม่ระบุ”', () => {
    expect(effectivePresence(blank, MON_10)).toEqual({ status: 'unspecified' });
  });

  it('isOnLeave follows the effective value; no profile is not on leave', () => {
    const onLeave = setPresence(blank, { actor: GM, now: MON_10, status: 'on_leave' }).profile;
    expect(isOnLeave(onLeave, MON_10)).toBe(true);
    expect(isOnLeave(onLeave, bkk('2026-12-29', '00:00'))).toBe(false);
    expect(isOnLeave(undefined, MON_10)).toBe(false);
    expect(isOnLeave(blank, MON_10)).toBe(false);
  });
});

describe('resetPresence — scheduler (Part 6 §6.9, F07)', () => {
  it('resets an expired value to “ไม่ระบุ” and keeps the pinned request', () => {
    const atFac16 = setPresence(blank, { actor: GM, now: MON_10, status: 'at_fac16' }).profile;
    const result = resetPresence(atFac16, bkk('2026-12-29', '00:15'));
    expect(result).toEqual({
      applied: true,
      profile: { personId: GM.personId, presenceStatus: 'unspecified', focusRequestId: 'req-0427' },
    });
  });

  it('a late job does not clear a value set for the new day', () => {
    const today = setPresence(blank, { actor: GM, now: bkk('2026-12-29', '07:30'), status: 'at_wh300' }).profile;
    expect(resetPresence(today, bkk('2026-12-29', '07:45'))).toEqual({
      applied: false,
      profile: today,
      skipReason: 'not_expired',
    });
  });

  it('leave with an end date survives nightly resets until the end date', () => {
    const onLeave = setPresence(blank, { actor: GM, now: MON_10, status: 'on_leave', leaveEndsOn: '2026-12-30' }).profile;
    expect(resetPresence(onLeave, bkk('2026-12-29', '00:15')).applied).toBe(false);
    expect(resetPresence(onLeave, bkk('2026-12-30', '00:15')).applied).toBe(false);
    const reset = resetPresence(onLeave, bkk('2026-12-31', '00:15'));
    expect(reset.applied).toBe(true);
    expect(reset.profile).not.toHaveProperty('leaveEndsOn');
  });

  it('nothing to do when already “ไม่ระบุ”', () => {
    expect(resetPresence(blank, bkk('2026-12-29', '00:15'))).toEqual({
      applied: false,
      profile: blank,
      skipReason: 'already_unspecified',
    });
  });
});
