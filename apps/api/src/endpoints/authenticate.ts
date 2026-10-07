// S12 — who is calling. Every endpoint call verifies the ID token (firebase-admin) and re-reads
// access/{uid}: role and `enabled` come from there on every request, so an account disabled
// mid-session is refused on its very next call (Part 6 §6.5). Custom claims are never used.
import { isCorporateGoogleToken } from '@gm/contracts';
import { ROLES, type AccessViewer, type Role } from '@gm/domain';
import { ApiError } from './errors';
import type { ApiDeps, VerifiedToken } from './deps';

export interface Caller {
  readonly uid: string;
  readonly viewer: AccessViewer;
}

export async function authenticate(deps: ApiDeps, idToken: string | undefined): Promise<Caller> {
  if (idToken === undefined || idToken === '') throw new ApiError(401, 'UNAUTHENTICATED');
  let token: VerifiedToken;
  try {
    token = await deps.auth.verifyIdToken(idToken);
  } catch {
    throw new ApiError(401, 'TOKEN_INVALID');
  }
  if (!isCorporateGoogleToken(token)) throw new ApiError(403, 'NOT_CORPORATE');
  const access = (await deps.db.doc(`access/${token.uid}`).get()).data();
  if (access === undefined) throw new ApiError(403, 'NO_ACCESS');
  if (access.enabled !== true) throw new ApiError(403, 'ACCOUNT_DISABLED');
  if (typeof access.person_id !== 'string' || !(ROLES as readonly unknown[]).includes(access.role)) throw new ApiError(403, 'NO_ACCESS');
  return { uid: token.uid, viewer: { personId: access.person_id, role: access.role as Role, enabled: true, corporate: true } };
}

/** Runs one endpoint: refusals are logged as codes only, then re-thrown to the caller. */
export async function guarded<T>(deps: ApiDeps, event: string, requestId: string | undefined, work: () => Promise<T>): Promise<T> {
  try {
    const result = await work();
    deps.log.info(event, { status: 200, ...(requestId === undefined ? {} : { request_id: requestId }) });
    return result;
  } catch (error) {
    if (error instanceof ApiError) {
      deps.log.warn(`${event}.refused`, { status: error.status, code: error.code, ...(requestId === undefined ? {} : { request_id: requestId }) });
    } else {
      deps.log.warn(`${event}.failed`, { status: 500, code: 'INTERNAL', ...(requestId === undefined ? {} : { request_id: requestId }) });
    }
    throw error;
  }
}
