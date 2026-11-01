// A10 — people and their access (D-A09-1, Part 3 §13.3, Part 6 §6.5): `people/{person_id}` is the
// source; `access/{uid}` is written by the API from it only. The first login links an account by its
// verified email (never by name); role and account changes go to access at once; the last active GM
// Admin can be neither demoted nor switched off (nobody could open the Admin pages again).
import { describe, expect, it } from 'vitest';
import { LifecycleRejected, accessFor, defaultOwnerIssue, isGmRole, linkDecision, planPersonActive, planPersonRole, type PersonFacts } from './index';

const rejected = (work: () => unknown) => {
  try {
    work();
  } catch (error) {
    if (error instanceof LifecycleRejected) return error.code;
    throw error;
  }
  return 'accepted';
};

const admin: PersonFacts = { personId: 'admin@tdfb.co', role: 'gm_admin', active: true };
const admin2: PersonFacts = { personId: 'admin2@tdfb.co', role: 'gm_admin', active: true };
const staff: PersonFacts = { personId: 'staff@tdfb.co', role: 'gm_staff', active: true };
const employee: PersonFacts = { personId: 'employee@tdfb.co', role: 'requester', active: true };

describe('planPersonRole', () => {
  it.each(['viewer', 'gm_staff', 'gm_admin', 'requester'] as const)('an employee can be given %s', (role) => {
    expect(planPersonRole(employee, role, [admin.personId])).toEqual({ role });
  });

  it('the last active GM Admin cannot be demoted → LAST_GM_ADMIN', () => {
    expect(rejected(() => planPersonRole(admin, 'gm_staff', [admin.personId]))).toBe('LAST_GM_ADMIN');
  });

  it('with another active GM Admin, one can be demoted', () => {
    expect(planPersonRole(admin, 'viewer', [admin.personId, admin2.personId])).toEqual({ role: 'viewer' });
  });

  it('no such person → PERSON_NOT_FOUND; an unknown role → ROLE_INVALID', () => {
    expect(rejected(() => planPersonRole(undefined, 'viewer', [admin.personId]))).toBe('PERSON_NOT_FOUND');
    expect(rejected(() => planPersonRole(staff, 'owner' as never, [admin.personId]))).toBe('ROLE_INVALID');
  });
});

describe('planPersonActive', () => {
  it('switch an account off and on', () => {
    expect(planPersonActive(staff, false, [admin.personId])).toEqual({ active: false, releaseOpenRequests: false });
    expect(planPersonActive({ ...staff, active: false }, true, [admin.personId])).toEqual({ active: true, releaseOpenRequests: false });
  });

  it('the last active GM Admin cannot be switched off → LAST_GM_ADMIN', () => {
    expect(rejected(() => planPersonActive(admin, false, [admin.personId]))).toBe('LAST_GM_ADMIN');
    expect(planPersonActive(admin, false, [admin.personId, admin2.personId])).toEqual({ active: false, releaseOpenRequests: false });
  });
});

describe('accessFor: what access/{uid} says, only from people', () => {
  it('person ID, role and enabled = active', () => {
    expect(accessFor(staff)).toEqual({ person_id: 'staff@tdfb.co', role: 'gm_staff', enabled: true });
    expect(accessFor({ ...staff, active: false })).toEqual({ person_id: 'staff@tdfb.co', role: 'gm_staff', enabled: false });
  });
});

describe('linkDecision: the first login (D-A09-1)', () => {
  it('a listed, active person → link', () => {
    expect(linkDecision(employee)).toBe('link');
  });

  it('a listed person switched off → disabled (no access is made)', () => {
    expect(linkDecision({ ...employee, active: false })).toBe('disabled');
  });

  it('not on the list → not_listed (recorded for the GM Admin)', () => {
    expect(linkDecision(undefined)).toBe('not_listed');
  });
});

describe('D-A10-1: who is a GM comes from the role in people (no second list in settings/routing)', () => {
  it('gm_staff and gm_admin are GM; viewer and requester are not', () => {
    expect(['gm_staff', 'gm_admin', 'viewer', 'requester'].map((role) => isGmRole(role))).toEqual([true, true, false, false]);
    expect(isGmRole(undefined)).toBe(false);
  });

  it('a default owner who is not an active GM is not set up (D-S07-5) — and says why', () => {
    expect(defaultOwnerIssue({ personId: 'gm@tdfb.co', role: 'gm_staff', active: true })).toBeUndefined();
    expect(defaultOwnerIssue({ personId: 'admin@tdfb.co', role: 'gm_admin', active: true })).toBeUndefined();
    expect(defaultOwnerIssue({ personId: 'gm@tdfb.co', role: 'gm_staff', active: false })).toBe('DEFAULT_OWNER_INACTIVE');
    expect(defaultOwnerIssue({ personId: 'was.gm@tdfb.co', role: 'requester', active: true })).toBe('DEFAULT_OWNER_NOT_GM');
    expect(defaultOwnerIssue({ personId: 'was.gm@tdfb.co', role: 'viewer', active: true })).toBe('DEFAULT_OWNER_NOT_GM');
    expect(defaultOwnerIssue(undefined)).toBe('DEFAULT_OWNER_NOT_LISTED');
  });
});

describe('D-A10-2: switching off a GM who still has open work needs that count confirmed', () => {
  it('a GM with open requests: refused until the count is confirmed; the count must be the latest', () => {
    expect(rejected(() => planPersonActive(staff, false, [admin.personId], { openAssigned: 2 }))).toBe('OPEN_REQUESTS_ASSIGNED');
    expect(rejected(() => planPersonActive(staff, false, [admin.personId], { openAssigned: 2, confirmedOpenAssigned: 1 }))).toBe('OPEN_REQUESTS_ASSIGNED');
    expect(planPersonActive(staff, false, [admin.personId], { openAssigned: 2, confirmedOpenAssigned: 2 })).toEqual({ active: false, releaseOpenRequests: true });
  });

  it('no open work, or not a GM: switched off as before', () => {
    expect(planPersonActive(staff, false, [admin.personId], { openAssigned: 0 })).toEqual({ active: false, releaseOpenRequests: false });
    const employee: PersonFacts = { personId: 'employee@tdfb.co', role: 'requester', active: true };
    expect(planPersonActive(employee, false, [admin.personId], { openAssigned: 0 })).toEqual({ active: false, releaseOpenRequests: false });
    expect(planPersonActive(staff, true, [admin.personId], { openAssigned: 3 })).toEqual({ active: true, releaseOpenRequests: false });
  });
});
