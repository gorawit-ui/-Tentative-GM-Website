// A02 stub — implemented after the failing tests are committed.
import type { Instant } from '@gm/time';

export const DELIVERY_STATES = [] as unknown as readonly ['pending', 'processing', 'provider_accepted', 'failed', 'delivery_unknown', 'suppressed'];
export type DeliveryState = 'pending' | 'processing' | 'provider_accepted' | 'failed' | 'delivery_unknown' | 'suppressed';
export const SETTLED_DELIVERY_STATES: readonly DeliveryState[] = [];
export const DELIVERY_LEASE_MS = 0;
export type DeliveryChannel = 'slack' | 'email';

export interface DeliveryRecipient {
  readonly active: boolean;
  readonly slackUserId?: string;
}

export function chooseDeliveryChannel(_recipient: DeliveryRecipient | undefined): DeliveryChannel | undefined {
  throw new Error('not implemented');
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

export function claimDelivery(_entry: DeliveryLeaseState, _now: Instant): DeliveryClaim {
  throw new Error('not implemented');
}

export type DeliveryOutcome =
  | { readonly kind: 'accepted'; readonly providerId: string }
  | { readonly kind: 'retryable'; readonly code: string }
  | { readonly kind: 'permanent'; readonly code: string }
  | { readonly kind: 'unknown'; readonly code: string };

export interface DeliverySettlement {
  readonly state: DeliveryState;
  readonly nextAttemptAt?: Instant;
  readonly providerId?: string;
  readonly errorCode?: string;
}

export function settleDelivery(_attempts: number, _outcome: DeliveryOutcome, _now: Instant): DeliverySettlement {
  throw new Error('not implemented');
}
