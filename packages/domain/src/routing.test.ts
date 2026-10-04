// S07 — initial assignment of new requests (PRD §2: maintenance → default owner, Admin-configurable;
// A3: default owner on leave → queued, unassigned, notify all GM). People are synthetic.
import { describe, expect, it } from 'vitest';
import type { Instant } from '@gm/time';
import { routeNewRequest, setPresence, type Actor, type GmProfile, type RoutingSettings } from './index';

function bkk(date: string, time: string): Instant {
  return Date.parse(`${date}T${time}:00+07:00`);
}

/** Stands in for the maintenance default owner (Sirirat in PRD §2). */
const MAINTENANCE_OWNER: Actor = { personId: 'person-gm-maintenance-owner', role: 'gm_staff' };
const DOCUMENT_OWNER: Actor = { personId: 'person-gm-document-owner', role: 'gm_staff' };
const GM: Actor = { personId: 'person-gm-01', role: 'gm_staff' };

const SETTINGS: RoutingSettings = {
  defaultOwnerByType: {
    maintenance: MAINTENANCE_OWNER.personId,
    document_request: DOCUMENT_OWNER.personId,
  },
};

const MON_10 = bkk('2026-12-28', '10:00');

function profile(actor: Actor, overrides: Partial<GmProfile> = {}): GmProfile {
  return { personId: actor.personId, presenceStatus: 'unspecified', ...overrides };
}

function onLeave(actor: Actor, setAt: Instant, leaveEndsOn?: string): GmProfile {
  return setPresence(profile(actor), {
    actor,
    now: setAt,
    status: 'on_leave',
    ...(leaveEndsOn === undefined ? {} : { leaveEndsOn }),
  }).profile;
}

describe('routeNewRequest — default owner by type', () => {
  it('a new repair goes to the configured maintenance owner, queued, owner notified', () => {
    expect(
      routeNewRequest({
        type: 'maintenance',
        now: MON_10,
        settings: SETTINGS,
        defaultOwnerProfile: profile(MAINTENANCE_OWNER, {
          presenceStatus: 'at_fac16',
          presenceUpdatedAt: bkk('2026-12-28', '08:00'),
        }),
      }),
    ).toEqual({
      status: 'queued',
      assigneeId: MAINTENANCE_OWNER.personId,
      reason: 'default_owner',
      notice: { kind: 'assignee', personId: MAINTENANCE_OWNER.personId },
    });
  });

  it('the owner comes from settings per type', () => {
    expect(
      routeNewRequest({ type: 'document_request', now: MON_10, settings: SETTINGS, defaultOwnerProfile: profile(DOCUMENT_OWNER) })
        .assigneeId,
    ).toBe(DOCUMENT_OWNER.personId);
    const changed: RoutingSettings = { defaultOwnerByType: { maintenance: GM.personId } };
    expect(routeNewRequest({ type: 'maintenance', now: MON_10, settings: changed, defaultOwnerProfile: profile(GM) }).assigneeId).toBe(
      GM.personId,
    );
  });

  it('a missing profile counts as not on leave', () => {
    expect(routeNewRequest({ type: 'maintenance', now: MON_10, settings: SETTINGS }).assigneeId).toBe(
      MAINTENANCE_OWNER.personId,
    );
  });

  it('no default owner configured → queued, unassigned, all GM notified (Part 3 §13.3)', () => {
    expect(routeNewRequest({ type: 'document_intake', now: MON_10, settings: SETTINGS })).toEqual({
      status: 'queued',
      reason: 'no_default_owner',
      notice: { kind: 'all_gm' },
    });
  });

  it('a profile of someone else than the configured owner is a caller error', () => {
    expect(() =>
      routeNewRequest({ type: 'maintenance', now: MON_10, settings: SETTINGS, defaultOwnerProfile: profile(GM) }),
    ).toThrow(/default owner profile/);
  });
});

describe('routeNewRequest — default owner on leave (A3)', () => {
  const UNASSIGNED = { status: 'queued', reason: 'default_owner_on_leave', notice: { kind: 'all_gm' } };

  it('owner on leave today → queued “ยังไม่มอบหมาย”, all GM notified instead', () => {
    const result = routeNewRequest({
      type: 'maintenance',
      now: MON_10,
      settings: SETTINGS,
      defaultOwnerProfile: onLeave(MAINTENANCE_OWNER, bkk('2026-12-28', '08:00')),
    });
    expect(result).toEqual(UNASSIGNED);
    expect(result).not.toHaveProperty('assigneeId');
  });

  it('uses effective leave at creation, not the reset job: leave without end date set yesterday has expired', () => {
    expect(
      routeNewRequest({
        type: 'maintenance',
        now: MON_10,
        settings: SETTINGS,
        defaultOwnerProfile: onLeave(MAINTENANCE_OWNER, bkk('2026-12-27', '09:00')),
      }).assigneeId,
    ).toBe(MAINTENANCE_OWNER.personId);
  });

  it('leave with an end date still applies on the end date and not the day after', () => {
    const leave = onLeave(MAINTENANCE_OWNER, bkk('2026-12-28', '08:00'), '2026-12-30');
    expect(
      routeNewRequest({ type: 'maintenance', now: bkk('2026-12-30', '23:59'), settings: SETTINGS, defaultOwnerProfile: leave }),
    ).toEqual(UNASSIGNED);
    expect(
      routeNewRequest({ type: 'maintenance', now: bkk('2026-12-31', '00:00'), settings: SETTINGS, defaultOwnerProfile: leave })
        .assigneeId,
    ).toBe(MAINTENANCE_OWNER.personId);
  });
});

describe('routeNewRequest — GM chooses the assignee (A3: human assignment)', () => {
  it('assigns the chosen GM', () => {
    expect(
      routeNewRequest({
        type: 'gm_task',
        now: MON_10,
        settings: SETTINGS,
        chosenAssigneeId: GM.personId,
        chosenAssigneeProfile: profile(GM),
      }),
    ).toEqual({
      status: 'queued',
      assigneeId: GM.personId,
      reason: 'chosen_by_gm',
      notice: { kind: 'assignee', personId: GM.personId },
      assigneeOnLeave: false,
    });
  });

  it('a deliberately chosen GM on leave stays assigned, with the leave made visible', () => {
    const result = routeNewRequest({
      type: 'maintenance',
      now: MON_10,
      settings: SETTINGS,
      chosenAssigneeId: MAINTENANCE_OWNER.personId,
      chosenAssigneeProfile: onLeave(MAINTENANCE_OWNER, bkk('2026-12-28', '08:00')),
    });
    expect(result).toMatchObject({ assigneeId: MAINTENANCE_OWNER.personId, reason: 'chosen_by_gm', assigneeOnLeave: true });
  });

  it('a chosen assignee wins over the default owner', () => {
    expect(
      routeNewRequest({
        type: 'maintenance',
        now: MON_10,
        settings: SETTINGS,
        defaultOwnerProfile: profile(MAINTENANCE_OWNER),
        chosenAssigneeId: GM.personId,
      }).assigneeId,
    ).toBe(GM.personId);
  });
});
