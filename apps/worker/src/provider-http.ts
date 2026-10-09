// A07 / A08 — what a notification provider's HTTP answer or failure means for the outbox (Part 6
// §6.10), shared by the Slack and Gmail adapters: a Retry-After to respect, and a network failure
// before vs after the request was sent. Not sent (connection refused, DNS) → retryable; the request
// may have reached the provider (timeout, connection lost) → unknown, never sent again by itself.
import type { DeliveryOutcome } from '@gm/domain';
import { MINUTE_MS } from '@gm/time';

/** A Retry-After longer than this is treated as this, so an entry is never parked indefinitely (D-A07-5). */
export const MAX_RETRY_AFTER_MS = 24 * 60 * MINUTE_MS;

/** The connection never carried the request. */
const NOT_SENT_CAUSES: ReadonlySet<string> = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT']);

/** `Retry-After: <seconds>` → the wait in milliseconds (capped); anything else → nothing. */
export function retryAfterMs(header: string | null): { readonly retryAfterMs?: number } {
  if (header === null || !/^\d{1,9}$/.test(header.trim())) return {};
  const ms = Number(header.trim()) * 1000;
  return ms <= 0 ? {} : { retryAfterMs: Math.min(ms, MAX_RETRY_AFTER_MS) };
}

export const isTimeout = (error: unknown): boolean => error instanceof Error && error.name === 'TimeoutError';

/** A `fetch` that threw: `<PROVIDER>_TIMEOUT` / `_UNREACHABLE` / `_CONNECTION_LOST`. */
export function networkFailure(error: unknown, provider: 'SLACK' | 'GMAIL'): DeliveryOutcome {
  if (isTimeout(error)) return { kind: 'unknown', code: `${provider}_TIMEOUT` };
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : undefined;
  if (typeof cause?.code === 'string' && NOT_SENT_CAUSES.has(cause.code)) return { kind: 'retryable', code: `${provider}_UNREACHABLE` };
  return { kind: 'unknown', code: `${provider}_CONNECTION_LOST` };
}
