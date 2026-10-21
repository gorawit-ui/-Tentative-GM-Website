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

export function planPersonActive(person: PersonFacts | undefined, active: boolean, activeGmAdminIds: readonly string[]): { readonly active: boolean } {
  if (person === undefined) return reject('PERSON_NOT_FOUND', 'No such person');
  if (!active) requireAnotherAdmin(person, activeGmAdminIds);
  return { active };
}

/** The first login (D-A09-1): link a listed active person; a listed person switched off gets no access. */
export function linkDecision(person: PersonFacts | undefined): 'link' | 'disabled' | 'not_listed' {
  if (person === undefined) return 'not_listed';
  return person.active ? 'link' : 'disabled';
}
