import { healthResponse } from '@gm/contracts';
import type { NotificationMode } from './notification-mode';

export interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

// S00 skeleton: health check only. The worker is IAM-only on Cloud Run; there is no public
// /internal/tick (Part 6 §6.2). Task and tick handlers arrive from A02.
export function createRoute(notificationMode: NotificationMode) {
  return function route(method: string, path: string): JsonResponse {
    if (path === '/healthz') {
      if (method !== 'GET' && method !== 'HEAD') {
        return { status: 405, body: { error: 'method_not_allowed' }, headers: { allow: 'GET, HEAD' } };
      }
      return { status: 200, body: { ...healthResponse('gm-worker'), notificationMode } };
    }
    return { status: 404, body: { error: 'not_found' } };
  };
}
