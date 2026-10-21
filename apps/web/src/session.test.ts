// A09 — what the signed-in person sees (UI-01, Part 6 §6.5, D-S09-6, D-S10-5): only a verified Google
// sign-in with an exact @tdfb.co address goes on (the same rule as the API and Rules); then
// access/{uid} decides — missing → not set up yet, `enabled: false` → “บัญชีถูกปิด”, else the role.
import { describe, expect, it } from 'vitest';
import { accessStateOf, isCompanySignIn, safeReturnPath } from './session';

const google = (email: string, verified = true) => ({ email, email_verified: verified, firebase: { sign_in_provider: 'google.com' } });

describe('isCompanySignIn (same rule as Rules corporateSignIn / API isCorporateGoogleToken)', () => {
  it.each(['a09.requester@tdfb.co', 'A09.Requester@TDFB.CO'])('%s → yes', (email) => {
    expect(isCompanySignIn(google(email))).toBe(true);
  });

  it.each([
    ['another domain', google('someone@gmail.com')],
    ['a lookalike domain', google('a09@tdfb.co.th')],
    ['a subdomain', google('a09@mail.tdfb.co')],
    ['an unverified address', google('a09@tdfb.co', false)],
    ['not Google', { email: 'a09@tdfb.co', email_verified: true, firebase: { sign_in_provider: 'password' } }],
  ])('%s → no', (_label, claims) => {
    expect(isCompanySignIn(claims)).toBe(false);
  });
});

describe('accessStateOf(access/{uid})', () => {
  it.each([
    ['requester', 'requester'],
    ['viewer', 'viewer'],
    ['gm_staff', 'gm_staff'],
    ['gm_admin', 'gm_admin'],
  ] as const)('enabled %s → active with that role', (role, expected) => {
    expect(accessStateOf({ person_id: 'a09.x@tdfb.co', role, enabled: true })).toEqual({ kind: 'active', role: expected, personId: 'a09.x@tdfb.co' });
  });

  it('no document → not set up for this system yet', () => {
    expect(accessStateOf(undefined)).toEqual({ kind: 'no_access' });
  });

  it.each([{ person_id: 'a@tdfb.co', role: 'gm_admin', enabled: false }, { person_id: 'a@tdfb.co', role: 'gm_admin' }, { enabled: false }])(
    'D-S09-6: enabled is not true → disabled, whatever the role (%o)',
    (doc) => {
      expect(accessStateOf(doc)).toEqual({ kind: 'disabled' });
    },
  );

  it.each([{ person_id: 'a@tdfb.co', role: 'owner', enabled: true }, { role: 'requester', enabled: true }, { person_id: '', role: 'requester', enabled: true }])(
    'a document the API would refuse (unknown role, no person) → no access, never a guessed role (%o)',
    (doc) => {
      expect(accessStateOf(doc)).toEqual({ kind: 'no_access' });
    },
  );
});

describe('safeReturnPath (UI-01 / Part 2 /login: back to the link inside the app)', () => {
  it.each([
    ['/board', '/board'],
    ['/requests/req-1?tab=history', '/requests/req-1?tab=history'],
    ['/requests/new?type=maintenance&origin=requester', '/requests/new?type=maintenance&origin=requester'],
  ])('%s → %s', (next, expected) => {
    expect(safeReturnPath(next)).toBe(expected);
  });

  it.each([null, '', 'board', '//evil.example.com/x', '/\\evil.example.com', 'https://evil.example.com/', 'javascript:alert(1)', '/login', '/login?next=/board'])(
    'anything else → home (%j)',
    (next) => {
      expect(safeReturnPath(next)).toBe('/');
    },
  );
});
