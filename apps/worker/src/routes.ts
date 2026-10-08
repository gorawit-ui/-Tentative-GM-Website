// A02 stub — implemented after the failing tests are committed.
export const TICK_PATH = '';
export const OUTBOX_TASK_PATH = '';
export const MAX_TASK_IDS = 0;

export function parseOutboxTask(_body: unknown): string[] {
  throw new Error('not implemented');
}

// S00 health route, kept until the A02 handler replaces it.
import { healthResponse } from '@gm/contracts';
import type { NotificationMode } from './notification-mode';

export interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

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
