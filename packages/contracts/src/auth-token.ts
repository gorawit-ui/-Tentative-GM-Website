// S12 — the API's sign-in check; the same rule as Firestore Rules corporateSignIn() (D-S10-5):
// verified Google sign-in and an exact @tdfb.co address compared after lower-casing, so TDFB.CO is the
// same domain while lookalikes (tdfb.co.th, mail.tdfb.co, …) are refused. `hd` is never the check.
export interface SignInClaims {
  readonly email?: unknown;
  readonly email_verified?: unknown;
  readonly firebase?: { readonly sign_in_provider?: unknown };
}

const CORPORATE_EMAIL = /^[a-z0-9._%+-]+@tdfb\.co$/;

export function isCorporateGoogleToken(claims: SignInClaims): boolean {
  return (
    claims.email_verified === true &&
    claims.firebase?.sign_in_provider === 'google.com' &&
    typeof claims.email === 'string' &&
    CORPORATE_EMAIL.test(claims.email.toLowerCase())
  );
}
