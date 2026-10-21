// The web app talks to the API with the signed-in person's ID token (Part 6 §6.4); the API checks the
// account and the role again on every call. Errors come back as codes only.
import { auth, webConfig } from './firebase';

export class ApiCallError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.name = 'ApiCallError';
    this.status = status;
    this.code = code;
  }
}

export async function apiCall<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const user = auth.currentUser;
  if (user === null) throw new ApiCallError(401, 'UNAUTHENTICATED');
  let response: Response;
  try {
    response = await fetch(`${webConfig.apiBaseUrl}${path}`, {
      method,
      credentials: 'omit',
      headers: { authorization: `Bearer ${await user.getIdToken()}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new ApiCallError(0, 'NETWORK');
  }
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) throw new ApiCallError(response.status, typeof payload.error === 'string' ? payload.error : 'INTERNAL');
  return payload as T;
}
