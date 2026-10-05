// S07 — GM presence and leave (C7, A3, F07). Instants are UTC epoch ms; days are Asia/Bangkok.
// D-S07-1: presence is { kind: at_location, location_id } / off_site / on_leave / unspecified;
// location_id points into the Admin locations list, so a location added later works at once.
import { describe, expect, it } from 'vitest';
import type { Instant } from '@gm/time';
import {
  LifecycleRejected,
  PRESENCE_KINDS,
  PRESENCE_KIND_LABELS,
  effectivePresence,
  isOnLeave,
  presenceLabel,
  resetPresence,
  setPresence,
  type Actor,
  type GmProfile,
  type Labelled,
  type PresenceStatus,
} from './index';

const GM: Actor = { personId: 'person-gm-01', role: 'gm_staff' };
const GM_2: Actor = { personId: 'person-gm-02', role: 'gm_staff' };
const GM_ADMIN: Actor = { personId: 'person-gm-admin-01', role: 'gm_admin' };
const EMPLOYEE: Actor = { personId: 'person-employee-01', role: 'requester' };

/** The Admin locations list (synthetic IDs; names as in PRD §2). */
const LOCATIONS: readonly Labelled[] = [
  { id: 'loc-wh300', label: 'WH300' },
  { id: 'loc-fac16', label: 'FAC16' },
  { id: 'loc-fac17', label: 'FAC17' },
  { id: 'loc-office195', label: 'Office 195' },
  { id: 'loc-cafe222', label: 'Cafe 222' },
];

const AT_FAC16: PresenceStatus = { kind: 'at_location', locationId: 'loc-fac16' };
const OFF_SITE: PresenceStatus = { kind: 'off_site' };
const ON_LEAVE: PresenceStatus = { kind: 'on_leave' };
const UNSPECIFIED: PresenceStatus = { kind: 'unspecified' };

function bkk(date: string, time: string): Instant {
  return Date.parse(`${date}T${time}:00+07:00`);
}

const MON_10 = bkk('2026-12-28', '10:00');
const SECOND = 1000;

const blank: GmProfile = { personId: GM.personId, presenceStatus: UNSPECIFIED, focusRequestId: 'req-0427' };

function set(
  profile: GmProfile,
  presence: { readonly kind: string; readonly locationId?: string },
  overrides: { readonly actor?: Actor; readonly now?: Instant; readonly leaveEndsOn?: string; readonly locations?: readonly Labelled[] } = {},
) {
  return setPresence(profile, {
    actor: overrides.actor ?? GM,
    now: overrides.now ?? MON_10,
    presence,
    locations: overrides.locations ?? LOCATIONS,
    ...(overrides.leaveEndsOn === undefined ? {} : { leaveEndsOn: overrides.leaveEndsOn }),
  });
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

describe('presence values (C7, D-S07-1)', () => {
  it('has four kinds and no fixed key per location', () => {
    expect(PRESENCE_KINDS).toEqual(['at_location', 'off_site', 'on_leave', 'unspecified']);
    for (const legacy of ['at_wh300', 'at_fac16', 'at_fac17', 'at_office_195', 'at_cafe_222']) {
      expect(PRESENCE_KINDS).not.toContain(legacy);
    }
    expect(PRESENCE_KIND_LABELS).toEqual({ off_site: 'ออกนอกสถานที่', on_leave: 'ลา', unspecified: 'ไม่ระบุ' });
  });

  it('“อยู่ <ชื่อสถานที่>” is built from the location name', () => {
    expect(presenceLabel(AT_FAC16, LOCATIONS)).toBe('อยู่ FAC16');
    expect(presenceLabel({ kind: 'at_location', locationId: 'loc-office195' }, LOCATIONS)).toBe('อยู่ Office 195');
    expect(presenceLabel(OFF_SITE, LOCATIONS)).toBe('ออกนอกสถานที่');
    expect(presenceLabel(ON_LEAVE, LOCATIONS)).toBe('ลา');
    expect(presenceLabel(UNSPECIFIED, LOCATIONS)).toBe('ไม่ระบุ');
  });

  it('a renamed location shows its current name; the stored presence is unchanged', () => {
    const renamed = LOCATIONS.map((location) => (location.id === 'loc-fac16' ? { ...location, label: 'FAC16 อาคารใหม่' } : location));
    expect(presenceLabel(AT_FAC16, renamed)).toBe('อยู่ FAC16 อาคารใหม่');
  });

  it('a location missing from the list passed in is a caller error', () => {
    expect(() => presenceLabel({ kind: 'at_location', locationId: 'loc-missing' }, LOCATIONS)).toThrow(/location/);
  });
});

describe('setPresence (C7, A3, Part 6 §6.6, D-S07-1)', () => {
  it('the GM sets their own location; time is kept; focus is untouched', () => {
    const { profile, event } = set(blank, { kind: 'at_location', locationId: 'loc-fac16' });
    expect(profile).toEqual({ ...blank, presenceStatus: AT_FAC16, presenceUpdatedAt: MON_10 });
    expect(event).toEqual({
      kind: 'presence_changed',
      at: MON_10,
      actorId: GM.personId,
      personId: GM.personId,
      status: AT_FAC16,
    });
  });

  it('a location the Admin adds later can be chosen at once, with no code change', () => {
    const added = [...LOCATIONS, { id: 'loc-bangna', label: 'คลังสินค้าบางนา' }];
    const { profile } = set(blank, { kind: 'at_location', locationId: 'loc-bangna' }, { locations: added });
    expect(profile.presenceStatus).toEqual({ kind: 'at_location', locationId: 'loc-bangna' });
    expect(presenceLabel(profile.presenceStatus, added)).toBe('อยู่ คลังสินค้าบางนา');
  });

  it.each(LOCATIONS.map((location) => location.id))('accepts every listed location (%s)', (locationId) => {
    expect(set(blank, { kind: 'at_location', locationId }).profile.presenceStatus).toEqual({ kind: 'at_location', locationId });
  });

  it.each([OFF_SITE, ON_LEAVE, UNSPECIFIED])('accepts %j', (presence) => {
    expect(set(blank, presence).profile.presenceStatus).toEqual(presence);
  });

  it('a location that is not in the list is rejected', () => {
    expect(rejectionCode(() => set(blank, { kind: 'at_location', locationId: 'loc-unknown' }))).toBe(
      'PRESENCE_LOCATION_UNKNOWN',
    );
  });

  it('at_location needs a location', () => {
    expect(rejectionCode(() => set(blank, { kind: 'at_location' }))).toBe('PRESENCE_LOCATION_REQUIRED');
    expect(rejectionCode(() => set(blank, { kind: 'at_location', locationId: '' }))).toBe('PRESENCE_LOCATION_REQUIRED');
  });

  it('only at_location carries a location', () => {
    expect(rejectionCode(() => set(blank, { kind: 'off_site', locationId: 'loc-fac16' }))).toBe(
      'PRESENCE_LOCATION_NOT_APPLICABLE',
    );
  });

  it.each(['at_fac16', 'at_wh300', 'อยู่ FAC16', 'busy', ''])('rejects old fixed keys and anything outside the kinds (%j)', (kind) => {
    expect(rejectionCode(() => set(blank, { kind }))).toBe('PRESENCE_INVALID');
  });

  it('GM Admin may set another GM\'s presence', () => {
    expect(set(blank, OFF_SITE, { actor: GM_ADMIN }).event.actorId).toBe(GM_ADMIN.personId);
  });

  it.each([
    ['another GM Staff', GM_2],
    ['an employee', EMPLOYEE],
  ])('%s cannot set it', (_label, actor) => {
    expect(rejectionCode(() => set(blank, OFF_SITE, { actor }))).toBe('PROFILE_OWNER_ONLY');
  });

  it('leave may carry an end date (today or later)', () => {
    expect(set(blank, ON_LEAVE, { leaveEndsOn: '2026-12-30' }).profile).toMatchObject({
      presenceStatus: ON_LEAVE,
      leaveEndsOn: '2026-12-30',
    });
    expect(set(blank, ON_LEAVE, { leaveEndsOn: '2026-12-28' }).profile.leaveEndsOn).toBe('2026-12-28');
  });

  it('an end date before today is rejected (A3)', () => {
    expect(rejectionCode(() => set(blank, ON_LEAVE, { leaveEndsOn: '2026-12-27' }))).toBe('LEAVE_END_IN_PAST');
  });

  it.each(['2026-02-30', '30/12/2026', '2569-12-30'])('an invalid end date is rejected (%j)', (leaveEndsOn) => {
    expect(rejectionCode(() => set(blank, ON_LEAVE, { leaveEndsOn }))).toBe('LEAVE_END_INVALID');
  });

  it('an end date only goes with leave', () => {
    expect(rejectionCode(() => set(blank, OFF_SITE, { leaveEndsOn: '2026-12-30' }))).toBe('LEAVE_END_NOT_APPLICABLE');
  });

  it('changing to another presence clears the earlier leave end date (A3)', () => {
    const onLeave = set(blank, ON_LEAVE, { leaveEndsOn: '2026-12-30' }).profile;
    const back = set(onLeave, { kind: 'at_location', locationId: 'loc-wh300' }, { now: bkk('2026-12-29', '08:00') }).profile;
    expect(back).not.toHaveProperty('leaveEndsOn');
    expect(back.presenceStatus).toEqual({ kind: 'at_location', locationId: 'loc-wh300' });
  });
});

describe('effectivePresence — reset at the end of the Bangkok day (C7, A3)', () => {
  const atFac16 = () => set(blank, AT_FAC16).profile;

  it('shows the value and the time it was set during the same day', () => {
    expect(effectivePresence(atFac16(), bkk('2026-12-28', '23:59'))).toEqual({
      status: AT_FAC16,
      setAt: MON_10,
      expiresAt: bkk('2026-12-29', '00:00'),
    });
  });

  it('is “ไม่ระบุ” from midnight, even before the reset job runs', () => {
    expect(effectivePresence(atFac16(), bkk('2026-12-29', '00:00'))).toEqual({ status: UNSPECIFIED });
  });

  it('leave without an end date expires at the end of the day', () => {
    const onLeave = set(blank, ON_LEAVE).profile;
    expect(effectivePresence(onLeave, bkk('2026-12-28', '23:59')).status).toEqual(ON_LEAVE);
    expect(effectivePresence(onLeave, bkk('2026-12-29', '00:00')).status).toEqual(UNSPECIFIED);
  });

  it('leave with an end date is not reset until that date ends (inclusive)', () => {
    const onLeave = set(blank, ON_LEAVE, { leaveEndsOn: '2026-12-30' }).profile;
    expect(effectivePresence(onLeave, bkk('2026-12-29', '12:00'))).toEqual({
      status: ON_LEAVE,
      setAt: MON_10,
      leaveEndsOn: '2026-12-30',
      expiresAt: bkk('2026-12-31', '00:00'),
    });
    expect(effectivePresence(onLeave, bkk('2026-12-31', '00:00') - SECOND).status).toEqual(ON_LEAVE);
    expect(effectivePresence(onLeave, bkk('2026-12-31', '00:00')).status).toEqual(UNSPECIFIED);
  });

  it('“ไม่ระบุ” or never set is just “ไม่ระบุ”', () => {
    expect(effectivePresence(blank, MON_10)).toEqual({ status: UNSPECIFIED });
  });

  it('isOnLeave follows the effective value; no profile is not on leave', () => {
    const onLeave = set(blank, ON_LEAVE).profile;
    expect(isOnLeave(onLeave, MON_10)).toBe(true);
    expect(isOnLeave(onLeave, bkk('2026-12-29', '00:00'))).toBe(false);
    expect(isOnLeave(undefined, MON_10)).toBe(false);
    expect(isOnLeave(blank, MON_10)).toBe(false);
    expect(isOnLeave(atFac16(), MON_10)).toBe(false);
  });
});

describe('resetPresence — scheduler (Part 6 §6.9, F07)', () => {
  it('resets an expired value to “ไม่ระบุ” and keeps the pinned request', () => {
    const atFac16 = set(blank, AT_FAC16).profile;
    const result = resetPresence(atFac16, bkk('2026-12-29', '00:15'));
    expect(result).toEqual({
      applied: true,
      profile: { personId: GM.personId, presenceStatus: UNSPECIFIED, focusRequestId: 'req-0427' },
    });
  });

  it('a late job does not clear a value set for the new day', () => {
    const today = set(blank, { kind: 'at_location', locationId: 'loc-wh300' }, { now: bkk('2026-12-29', '07:30') }).profile;
    expect(resetPresence(today, bkk('2026-12-29', '07:45'))).toEqual({
      applied: false,
      profile: today,
      skipReason: 'not_expired',
    });
  });

  it('leave with an end date survives nightly resets until the end date', () => {
    const onLeave = set(blank, ON_LEAVE, { leaveEndsOn: '2026-12-30' }).profile;
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
