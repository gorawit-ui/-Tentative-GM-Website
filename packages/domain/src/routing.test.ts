// S07 — initial assignment of new requests (PRD §2: maintenance → default owner, Admin-configurable;
// A3: default owner on leave → queued, unassigned, notify all GM). People are synthetic.
// D-S07-2: gm_task → the creating GM; on-behalf follows the type like a self-opened request.
// D-S07-3: “all GM” skips GMs on leave unless every GM is on leave. D-S07-4: leave does not block
// accepting. D-S07-5: an inactive default owner counts as not configured.
import { describe, expect, it } from 'vitest';
import type { Instant } from '@gm/time';
import {
  acceptRequest,
  allGmNoticeRecipients,
  routeNewRequest,
  type Actor,
  type GmMember,
  type GmProfile,
  type LifecycleState,
  type RoutingSettings,
} from './index';

function bkk(date: string, time: string): Instant {
  return Date.parse(`${date}T${time}:00+07:00`);
}

/** Stands in for the maintenance default owner (Sirirat in PRD §2). */
const MAINTENANCE_OWNER: Actor = { personId: 'person-gm-maintenance-owner', role: 'gm_staff' };
const DOCUMENT_OWNER: Actor = { personId: 'person-gm-document-owner', role: 'gm_staff' };
const GM: Actor = { personId: 'person-gm-01', role: 'gm_staff' };
const GM_ADMIN: Actor = { personId: 'person-gm-admin-01', role: 'gm_admin' };
const EMPLOYEE: Actor = { personId: 'person-employee-01', role: 'requester' };

const SETTINGS: RoutingSettings = {
  defaultOwnerByType: {
    maintenance: MAINTENANCE_OWNER.personId,
    document_request: DOCUMENT_OWNER.personId,
  },
};

const MON_10 = bkk('2026-12-28', '10:00');

function profile(actor: Actor, overrides: Partial<GmProfile> = {}): GmProfile {
  return { personId: actor.personId, presenceStatus: { kind: 'unspecified' }, ...overrides };
}

/** A leave profile as setPresence stores it (built directly so routing tests do not depend on it). */
function onLeave(actor: Actor, setAt: Instant, leaveEndsOn?: string): GmProfile {
  return profile(actor, {
    presenceStatus: { kind: 'on_leave' },
    presenceUpdatedAt: setAt,
    ...(leaveEndsOn === undefined ? {} : { leaveEndsOn }),
  });
}

function member(actor: Actor, overrides: Partial<GmMember> = {}): GmMember {
  return { personId: actor.personId, active: true, profile: profile(actor), ...overrides };
}

describe('routeNewRequest — default owner by type', () => {
  it('a new repair goes to the configured maintenance owner, queued, owner notified', () => {
    expect(
      routeNewRequest({
        type: 'maintenance',
        now: MON_10,
        settings: SETTINGS,
        createdById: EMPLOYEE.personId,
        defaultOwner: member(MAINTENANCE_OWNER, {
          profile: profile(MAINTENANCE_OWNER, {
            presenceStatus: { kind: 'at_location', locationId: 'loc-fac16' },
            presenceUpdatedAt: bkk('2026-12-28', '08:00'),
          }),
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
      routeNewRequest({
        type: 'document_request',
        now: MON_10,
        settings: SETTINGS,
        createdById: EMPLOYEE.personId,
        defaultOwner: member(DOCUMENT_OWNER),
      }).assigneeId,
    ).toBe(DOCUMENT_OWNER.personId);
    const changed: RoutingSettings = { defaultOwnerByType: { maintenance: GM.personId } };
    expect(
      routeNewRequest({ type: 'maintenance', now: MON_10, settings: changed, createdById: EMPLOYEE.personId, defaultOwner: member(GM) })
        .assigneeId,
    ).toBe(GM.personId);
  });

  it('an owner without a profile document counts as not on leave', () => {
    expect(
      routeNewRequest({
        type: 'maintenance',
        now: MON_10,
        settings: SETTINGS,
        createdById: EMPLOYEE.personId,
        defaultOwner: { personId: MAINTENANCE_OWNER.personId, active: true },
      }).assigneeId,
    ).toBe(MAINTENANCE_OWNER.personId);
  });

  it.each(['document_intake', 'document_request'] as const)(
    'no default owner configured for %s → queued, unassigned, all GM notified (Part 3 §13.3)',
    (type) => {
      expect(
        routeNewRequest({ type, now: MON_10, settings: { defaultOwnerByType: {} }, createdById: EMPLOYEE.personId }),
      ).toEqual({
        status: 'queued',
        reason: 'no_default_owner',
        notice: { kind: 'all_gm' },
      });
    },
  );

  it('facts about someone else than the configured owner are a caller error', () => {
    expect(() =>
      routeNewRequest({ type: 'maintenance', now: MON_10, settings: SETTINGS, createdById: EMPLOYEE.personId, defaultOwner: member(GM) }),
    ).toThrow(/default owner/);
  });

  it('a configured owner without facts (active/leave) is a caller error, not a silent assignment', () => {
    expect(() =>
      routeNewRequest({ type: 'maintenance', now: MON_10, settings: SETTINGS, createdById: EMPLOYEE.personId }),
    ).toThrow(/default owner/);
  });
});

describe('routeNewRequest — gm_task uses the creating GM (D-S07-2)', () => {
  it('a gm_task without a chosen assignee goes to the GM who created it', () => {
    expect(
      routeNewRequest({ type: 'gm_task', now: MON_10, settings: SETTINGS, createdById: GM.personId, defaultOwner: member(GM) }),
    ).toEqual({
      status: 'queued',
      assigneeId: GM.personId,
      reason: 'gm_task_creator',
      notice: { kind: 'assignee', personId: GM.personId },
    });
  });

  it('GM Admin creating a gm_task becomes its owner too', () => {
    expect(
      routeNewRequest({
        type: 'gm_task',
        now: MON_10,
        settings: SETTINGS,
        createdById: GM_ADMIN.personId,
        defaultOwner: member(GM_ADMIN),
      }).assigneeId,
    ).toBe(GM_ADMIN.personId);
  });

  it('settings are not used for gm_task, even when no type owner is configured at all', () => {
    expect(
      routeNewRequest({
        type: 'gm_task',
        now: MON_10,
        settings: { defaultOwnerByType: {} },
        createdById: GM.personId,
        defaultOwner: member(GM),
      }),
    ).toMatchObject({ assigneeId: GM.personId, reason: 'gm_task_creator' });
  });

  it('facts must be about the creator', () => {
    expect(() =>
      routeNewRequest({
        type: 'gm_task',
        now: MON_10,
        settings: SETTINGS,
        createdById: GM.personId,
        defaultOwner: member(MAINTENANCE_OWNER),
      }),
    ).toThrow(/creator/);
    expect(() => routeNewRequest({ type: 'gm_task', now: MON_10, settings: SETTINGS, createdById: GM.personId })).toThrow(
      /creator/,
    );
  });

  it('a chosen assignee still wins over the creator', () => {
    expect(
      routeNewRequest({
        type: 'gm_task',
        now: MON_10,
        settings: SETTINGS,
        createdById: GM.personId,
        defaultOwner: member(GM),
        chosenAssigneeId: MAINTENANCE_OWNER.personId,
        chosenAssigneeProfile: profile(MAINTENANCE_OWNER),
      }),
    ).toMatchObject({ assigneeId: MAINTENANCE_OWNER.personId, reason: 'chosen_by_gm' });
  });

  it('a creator on leave: the A3 default-owner rule applies → unassigned, all GM (open question in S08)', () => {
    expect(
      routeNewRequest({
        type: 'gm_task',
        now: MON_10,
        settings: SETTINGS,
        createdById: GM.personId,
        defaultOwner: member(GM, { profile: onLeave(GM, bkk('2026-12-28', '08:00')) }),
      }),
    ).toEqual({ status: 'queued', reason: 'default_owner_on_leave', notice: { kind: 'all_gm' } });
  });

  it.each([
    ['maintenance', MAINTENANCE_OWNER],
    ['document_request', DOCUMENT_OWNER],
  ] as const)('a GM opening %s on behalf follows the type rule, not the creating GM', (type, owner) => {
    expect(
      routeNewRequest({ type, now: MON_10, settings: SETTINGS, createdById: GM.personId, defaultOwner: member(owner) }),
    ).toMatchObject({ assigneeId: owner.personId, reason: 'default_owner' });
  });

  it('a GM opening an unconfigured document type on behalf leaves it unassigned like a self-opened one', () => {
    expect(routeNewRequest({ type: 'document_intake', now: MON_10, settings: SETTINGS, createdById: GM.personId })).toEqual({
      status: 'queued',
      reason: 'no_default_owner',
      notice: { kind: 'all_gm' },
    });
  });
});

describe('routeNewRequest — default owner on leave (A3)', () => {
  const UNASSIGNED = { status: 'queued', reason: 'default_owner_on_leave', notice: { kind: 'all_gm' } };

  it('owner on leave today → queued “ยังไม่มอบหมาย”, all GM notified instead', () => {
    const result = routeNewRequest({
      type: 'maintenance',
      now: MON_10,
      settings: SETTINGS,
      createdById: EMPLOYEE.personId,
      defaultOwner: member(MAINTENANCE_OWNER, { profile: onLeave(MAINTENANCE_OWNER, bkk('2026-12-28', '08:00')) }),
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
        createdById: EMPLOYEE.personId,
        defaultOwner: member(MAINTENANCE_OWNER, { profile: onLeave(MAINTENANCE_OWNER, bkk('2026-12-27', '09:00')) }),
      }).assigneeId,
    ).toBe(MAINTENANCE_OWNER.personId);
  });

  it('leave with an end date still applies on the end date and not the day after', () => {
    const leave = member(MAINTENANCE_OWNER, { profile: onLeave(MAINTENANCE_OWNER, bkk('2026-12-28', '08:00'), '2026-12-30') });
    expect(
      routeNewRequest({
        type: 'maintenance',
        now: bkk('2026-12-30', '23:59'),
        settings: SETTINGS,
        createdById: EMPLOYEE.personId,
        defaultOwner: leave,
      }),
    ).toEqual(UNASSIGNED);
    expect(
      routeNewRequest({
        type: 'maintenance',
        now: bkk('2026-12-31', '00:00'),
        settings: SETTINGS,
        createdById: EMPLOYEE.personId,
        defaultOwner: leave,
      }).assigneeId,
    ).toBe(MAINTENANCE_OWNER.personId);
  });
});

describe('routeNewRequest — inactive default owner counts as not configured (D-S07-5)', () => {
  it('an inactive default owner → queued, unassigned, all GM notified', () => {
    const result = routeNewRequest({
      type: 'maintenance',
      now: MON_10,
      settings: SETTINGS,
      createdById: EMPLOYEE.personId,
      defaultOwner: member(MAINTENANCE_OWNER, { active: false }),
    });
    expect(result).toEqual({ status: 'queued', reason: 'default_owner_inactive', notice: { kind: 'all_gm' } });
    expect(result).not.toHaveProperty('assigneeId');
  });

  it('inactive wins over leave, and over a fresh presence value', () => {
    expect(
      routeNewRequest({
        type: 'document_request',
        now: MON_10,
        settings: SETTINGS,
        createdById: EMPLOYEE.personId,
        defaultOwner: member(DOCUMENT_OWNER, { active: false, profile: onLeave(DOCUMENT_OWNER, bkk('2026-12-28', '08:00')) }),
      }).reason,
    ).toBe('default_owner_inactive');
  });
});

describe('routeNewRequest — GM chooses the assignee (A3: human assignment)', () => {
  it('assigns the chosen GM', () => {
    expect(
      routeNewRequest({
        type: 'gm_task',
        now: MON_10,
        settings: SETTINGS,
        createdById: GM_ADMIN.personId,
        defaultOwner: member(GM_ADMIN),
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
      createdById: GM.personId,
      defaultOwner: member(MAINTENANCE_OWNER),
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
        createdById: GM_ADMIN.personId,
        defaultOwner: member(MAINTENANCE_OWNER),
        chosenAssigneeId: GM.personId,
      }).assigneeId,
    ).toBe(GM.personId);
  });
});

describe('allGmNoticeRecipients — who “แจ้ง GM ทุกคน” reaches (D-S07-3)', () => {
  const GM_2: Actor = { personId: 'person-gm-02', role: 'gm_staff' };
  const leaveToday = (actor: Actor) => member(actor, { profile: onLeave(actor, bkk('2026-12-28', '08:00')) });

  it('skips GMs on leave', () => {
    expect(allGmNoticeRecipients([member(GM), leaveToday(MAINTENANCE_OWNER), member(GM_ADMIN)], MON_10)).toEqual([
      GM.personId,
      GM_ADMIN.personId,
    ]);
  });

  it('when every GM is on leave, notifies all of them so the request does not go silent', () => {
    expect(allGmNoticeRecipients([leaveToday(GM), leaveToday(MAINTENANCE_OWNER), leaveToday(GM_2)], MON_10)).toEqual([
      GM.personId,
      MAINTENANCE_OWNER.personId,
      GM_2.personId,
    ]);
  });

  it('uses effective leave: yesterday\'s leave without an end date no longer counts', () => {
    const expired = member(GM, { profile: onLeave(GM, bkk('2026-12-27', '09:00')) });
    expect(allGmNoticeRecipients([expired, leaveToday(GM_2)], MON_10)).toEqual([GM.personId]);
  });

  it('leave with an end date counts until the end of that date', () => {
    const untilWed = member(GM, { profile: onLeave(GM, bkk('2026-12-28', '08:00'), '2026-12-30') });
    expect(allGmNoticeRecipients([untilWed, member(GM_2)], bkk('2026-12-30', '12:00'))).toEqual([GM_2.personId]);
    expect(allGmNoticeRecipients([untilWed, member(GM_2)], bkk('2026-12-31', '08:00'))).toEqual([GM.personId, GM_2.personId]);
  });

  it('never notifies inactive GMs, also not in the all-on-leave fallback', () => {
    expect(allGmNoticeRecipients([member(GM, { active: false }), member(GM_2)], MON_10)).toEqual([GM_2.personId]);
    expect(allGmNoticeRecipients([member(GM, { active: false }), leaveToday(GM_2)], MON_10)).toEqual([GM_2.personId]);
  });

  it('a GM without a profile document is not on leave; duplicates are listed once', () => {
    expect(allGmNoticeRecipients([{ personId: GM.personId, active: true }, member(GM)], MON_10)).toEqual([GM.personId]);
  });

  it('no active GM at all → nobody (the caller must surface it)', () => {
    expect(allGmNoticeRecipients([member(GM, { active: false })], MON_10)).toEqual([]);
    expect(allGmNoticeRecipients([], MON_10)).toEqual([]);
  });
});

describe('a GM on leave may still accept work (D-S07-4)', () => {
  it('accept does not look at leave', () => {
    const queued: LifecycleState = { source: 'web', status: 'queued', lastUpdatedAt: MON_10, completionCycleId: 0 };
    const leaveProfile = onLeave(GM, bkk('2026-12-28', '08:00'));
    expect(leaveProfile.presenceStatus).toEqual({ kind: 'on_leave' });
    expect(acceptRequest(queued, { actor: GM, now: MON_10 + 60_000 }).state).toMatchObject({
      status: 'in_progress',
      assigneeId: GM.personId,
    });
  });
});
