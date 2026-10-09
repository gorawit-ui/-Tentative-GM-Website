// A02 / D-A01-3 — outbox delivery (Part 6 §6.10). An entry is keyed by event + recipient + channel
// (`auto`, one entry per recipient); the worker picks the channel when it sends (Part 2 Addendum
// A1.2: Slack when the person is mapped, else company e-mail when the account is active, else no
// channel — never an address guessed from a name) and writes the channel it used and the result back
// on the entry. States: pending → processing → provider_accepted / failed / delivery_unknown /
// suppressed. Results known to have failed are retried a bounded number of times; a send whose result
// is unknown (connection lost, or the worker died while the provider may have accepted it) becomes
// `delivery_unknown` for the GM to check — never a blind second send.
import { MINUTE_MS, addElapsed, type Instant } from '@gm/time';
import { nextRetryAt } from './scheduled-work';

export const DELIVERY_STATES = ['pending', 'processing', 'provider_accepted', 'failed', 'delivery_unknown', 'suppressed'] as const;
export type DeliveryState = (typeof DELIVERY_STATES)[number];
export const SETTLED_DELIVERY_STATES: readonly DeliveryState[] = ['provider_accepted', 'failed', 'delivery_unknown', 'suppressed'];

export function isDeliveryState(value: unknown): value is DeliveryState {
  return typeof value === 'string' && (DELIVERY_STATES as readonly string[]).includes(value);
}

/** How long one send may take before another worker treats it as lost. */
export const DELIVERY_LEASE_MS = 5 * MINUTE_MS;

export type DeliveryChannel = 'slack' | 'email';

export interface DeliveryRecipient {
  readonly active: boolean;
  readonly slackUserId?: string;
}

/** A1.2, chosen at send time from the directory as it is then. */
export function chooseDeliveryChannel(recipient: DeliveryRecipient | undefined): DeliveryChannel | undefined {
  if (recipient === undefined || !recipient.active) return undefined;
  return recipient.slackUserId !== undefined && recipient.slackUserId.trim() !== '' ? 'slack' : 'email';
}

export interface DeliveryLeaseState {
  readonly state: DeliveryState;
  readonly next_attempt_at: Instant;
  readonly lease_until?: Instant;
}

export type DeliveryClaim =
  | { readonly kind: 'claim' }
  | { readonly kind: 'skip'; readonly reason: 'not_due' | 'leased' | 'settled' }
  | { readonly kind: 'lease_expired' };

/** Whether this pickup may send the entry. Only one pickup of a due pending entry wins. */
export function claimDelivery(entry: DeliveryLeaseState, now: Instant): DeliveryClaim {
  switch (entry.state) {
    case 'pending':
      return entry.next_attempt_at <= now ? { kind: 'claim' } : { kind: 'skip', reason: 'not_due' };
    case 'processing':
      return entry.lease_until !== undefined && entry.lease_until > now ? { kind: 'skip', reason: 'leased' } : { kind: 'lease_expired' };
    default:
      return { kind: 'skip', reason: 'settled' };
  }
}

/**
 * A07: `retryAfterMs` — the provider said when to come back (Slack 429 Retry-After); `unmapped` — the
 * provider does not know the stored address (Slack user not found), so nothing was sent and the worker
 * uses company e-mail instead (A1.2).
 */
export type DeliveryOutcome =
  | { readonly kind: 'accepted'; readonly providerId: string }
  | { readonly kind: 'retryable'; readonly code: string; readonly retryAfterMs?: number }
  | { readonly kind: 'permanent'; readonly code: string }
  | { readonly kind: 'unknown'; readonly code: string }
  | { readonly kind: 'unmapped'; readonly code?: string }
  | { readonly kind: 'suppressed'; readonly code: string };

export interface DeliverySettlement {
  readonly state: DeliveryState;
  readonly nextAttemptAt?: Instant;
  readonly providerId?: string;
  readonly errorCode?: string;
}

/** The entry's state after its `attempts`-th send ended with `outcome`. */
export function settleDelivery(attempts: number, outcome: DeliveryOutcome, now: Instant): DeliverySettlement {
  switch (outcome.kind) {
    case 'accepted':
      return { state: 'provider_accepted', providerId: outcome.providerId };
    case 'retryable': {
      const backOff = nextRetryAt(attempts, now);
      if (backOff === undefined) return { state: 'failed', errorCode: outcome.code };
      // A07: never earlier than the provider asked, never earlier than the A02 back-off.
      const asked = outcome.retryAfterMs === undefined || outcome.retryAfterMs <= 0 ? now : addElapsed(now, outcome.retryAfterMs);
      return { state: 'pending', nextAttemptAt: Math.max(backOff, asked), errorCode: outcome.code };
    }
    case 'permanent':
      return { state: 'failed', errorCode: outcome.code };
    case 'unknown':
      return { state: 'delivery_unknown', errorCode: outcome.code };
    case 'unmapped':
      // Reached only when there is nothing to fall back to: visible to the GM like “no channel”.
      return { state: 'failed', errorCode: 'SLACK_NOT_MAPPED' };
    case 'suppressed':
      throw new Error('D-A07 stub: suppressed not implemented');
  }
}
