import { healthResponse } from '@gm/contracts';

export interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

// S00 skeleton: health check only. Commands arrive from A01 with auth + ACL checks.
export function route(method: string, path: string): JsonResponse {
  if (path === '/healthz') {
    if (method !== 'GET' && method !== 'HEAD') {
      return { status: 405, body: { error: 'method_not_allowed' }, headers: { allow: 'GET, HEAD' } };
    }
    return { status: 200, body: healthResponse('gm-api') };
  }
  return { status: 404, body: { error: 'not_found' } };
}
