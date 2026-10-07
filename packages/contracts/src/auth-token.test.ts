// S12 — the API's sign-in check, the same rule as Firestore Rules corporateSignIn() (D-S10-5):
// verified Google sign-in, e-mail @tdfb.co compared after lower-casing; lookalike domains refused.
import { describe, expect, it } from 'vitest';
import { isCorporateGoogleToken } from './index';

const google = (email: unknown, overrides: Record<string, unknown> = {}) => ({
  email,
  email_verified: true,
  firebase: { sign_in_provider: 'google.com' },
  ...overrides,
});

describe('isCorporateGoogleToken (D-S10-5)', () => {
  it.each(['someone@tdfb.co', 'someone@TDFB.CO', 'Some.One@TdFb.Co'])('accepts %s', (email) => {
    expect(isCorporateGoogleToken(google(email))).toBe(true);
  });

  it.each([
    'x@tdfb.co.th',
    'x@tdfb.com',
    'x@mail.tdfb.co',
    'x@tdfbxco',
    'x@tdfb.co.evil.com',
    'x@eviltdfb.co',
    'tdfb.co@gmail.com',
    'x@tdfb.co ',
    'x@x@tdfb.co',
    '@tdfb.co',
    '',
  ])('refuses %j', (email) => {
    expect(isCorporateGoogleToken(google(email))).toBe(false);
  });

  it('refuses unverified, non-Google and missing e-mails', () => {
    expect(isCorporateGoogleToken(google('x@tdfb.co', { email_verified: false }))).toBe(false);
    expect(isCorporateGoogleToken(google('x@tdfb.co', { firebase: { sign_in_provider: 'password' } }))).toBe(false);
    expect(isCorporateGoogleToken(google(undefined))).toBe(false);
    expect(isCorporateGoogleToken({})).toBe(false);
  });
});
