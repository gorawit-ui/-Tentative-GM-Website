// A09 — who the signed-in person is to this app (UI-01, Part 6 §6.5, D-S09-6). The sign-in check is the
// shared rule of the API and Rules (D-S10-5); access/{uid} then decides — read by the person
// themself, which Rules allow even when the account is disabled.
import { isCorporateGoogleToken, type SignInClaims } from '@gm/contracts';
import { ROLES, type Role } from '@gm/domain';

/** Verified Google sign-in with an exact @tdfb.co address (`hd` is never the check). */
export function isCompanySignIn(claims: SignInClaims): boolean {
  return isCorporateGoogleToken(claims);
}

export type AccessState = { readonly kind: 'active'; readonly role: Role; readonly personId: string } | { readonly kind: 'disabled' } | { readonly kind: 'no_access' };

/** access/{uid} as stored: missing → not set up; `enabled` not true → disabled; else a valid role or nothing. */
export function accessStateOf(stored: Readonly<Record<string, unknown>> | undefined): AccessState {
  if (stored === undefined) return { kind: 'no_access' };
  if (stored.enabled !== true) return { kind: 'disabled' };
  const role = stored.role;
  const personId = stored.person_id;
  if (typeof personId !== 'string' || personId === '' || !(ROLES as readonly unknown[]).includes(role)) return { kind: 'no_access' };
  return { kind: 'active', role: role as Role, personId };
}

/** Back to a page inside the app after signing in (`?next=`); anything else, or the login page, → home. */
export function safeReturnPath(next: string | null | undefined): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next === '/login' || next.startsWith('/login?') || next.startsWith('/login/')) return '/';
  return next;
}
