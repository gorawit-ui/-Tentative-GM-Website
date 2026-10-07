// S12 — sign-in check shared by the API (Admin SDK) and mirrored in Firestore Rules corporateSignIn().
export interface SignInClaims {
  readonly email?: unknown;
  readonly email_verified?: unknown;
  readonly firebase?: { readonly sign_in_provider?: unknown };
}

export function isCorporateGoogleToken(_claims: SignInClaims): boolean {
  throw new Error('NOT_IMPLEMENTED');
}
