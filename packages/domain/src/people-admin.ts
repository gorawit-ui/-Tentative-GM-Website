// A10 — people and their access (D-A09-1, Part 3 §13.3, Part 6 §6.5). `people/{person_id}` is the
// source: the role and whether the account is on. `access/{uid}` (what Rules and the API read) is
// written by the API from it only — at the first login, matched by the verified e-mail (never a name),
// and again in the same command whenever the GM Admin changes a role or switches an account off. The
// last active GM Admin can be neither demoted nor switched off: nobody could open the Admin pages again.
import { reject } from './command-guards';
import { ROLES, type Role } from './request-creation';

export interface PersonFacts {
  readonly personId: string;
  readonly role: Role;
  readonly active: boolean;
}

/** What `access/{uid}` says, always derived from the person. */
export function accessFor(person: PersonFacts): { readonly person_id: string; readonly role: Role; readonly enabled: boolean } {
  return { person_id: person.personId, role: person.role, enabled: person.active };
}

function requireAnotherAdmin(person: PersonFacts, activeGmAdminIds: readonly string[]): void {
  const isActiveAdmin = person.role === 'gm_admin' && person.active;
  if (isActiveAdmin && activeGmAdminIds.filter((id) => id !== person.personId).length === 0) {
    reject('LAST_GM_ADMIN', 'At least one active GM Admin must remain');
  }
}

export function planPersonRole(person: PersonFacts | undefined, role: Role, activeGmAdminIds: readonly string[]): { readonly role: Role } {
  if (person === undefined) return reject('PERSON_NOT_FOUND', 'No such person');
  if (!(ROLES as readonly string[]).includes(role)) return reject('ROLE_INVALID', 'Unknown role');
  if (role !== 'gm_admin') requireAnotherAdmin(person, activeGmAdminIds);
  return { role };
}

/**
 * D-A10-2: switching off a GM who is still the assignee of open requests needs the Admin to confirm
 * that count (the latest one, read in the same transaction); those requests are then released.
 */
export function planPersonActive(
  person: PersonFacts | undefined,
  active: boolean,
  activeGmAdminIds: readonly string[],
  work: { readonly openAssigned: number; readonly confirmedOpenAssigned?: number | undefined } = { openAssigned: 0 },
): { readonly active: boolean; readonly releaseOpenRequests: boolean } {
  if (person === undefined) return reject('PERSON_NOT_FOUND', 'No such person');
  if (!active) requireAnotherAdmin(person, activeGmAdminIds);
  const release = !active && isGmRole(person.role) && work.openAssigned > 0;
  if (release && work.confirmedOpenAssigned !== work.openAssigned) {
    reject('OPEN_REQUESTS_ASSIGNED', 'This GM still has open requests; confirm how many are released');
  }
  return { active, releaseOpenRequests: release };
}

/** D-A10-1: who is a GM is the role in `people` (no second list in `settings/routing`). */
export function isGmRole(role: unknown): boolean {
  return role === 'gm_staff' || role === 'gm_admin';
}

export type DefaultOwnerIssue = 'DEFAULT_OWNER_NOT_LISTED' | 'DEFAULT_OWNER_NOT_GM' | 'DEFAULT_OWNER_INACTIVE';

/** D-A10-1 / D-S07-5: a default owner who is not an active GM counts as not set up — and why, for the health page. */
export function defaultOwnerIssue(person: PersonFacts | undefined): DefaultOwnerIssue | undefined {
  if (person === undefined) return 'DEFAULT_OWNER_NOT_LISTED';
  if (!isGmRole(person.role)) return 'DEFAULT_OWNER_NOT_GM';
  if (!person.active) return 'DEFAULT_OWNER_INACTIVE';
  return undefined;
}

/** The first login (D-A09-1): link a listed active person; a listed person switched off gets no access. */
export function linkDecision(person: PersonFacts | undefined): 'link' | 'disabled' | 'not_listed' {
  if (person === undefined) return 'not_listed';
  return person.active ? 'link' : 'disabled';
}
