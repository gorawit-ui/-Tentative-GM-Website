// A02 / D-A01-3 — outbox delivery state (Part 6 §6.10: key event + recipient + channel; states
// pending / processing / provider_accepted / failed / delivery_unknown / suppressed; bounded retry for
// results known to have failed; no external exactly-once claim once a connection drops) and the
// channel rule of Part 2 Addendum A1.2 (Slack when mapped, else company e-mail, else no channel).
import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '@gm/time';
import {
  DELIVERY_LEASE_MS,
  DELIVERY_STATES,
  SETTLED_DELIVERY_STATES,
  chooseDeliveryChannel,
  claimDelivery,
  settleDelivery,
} from './index';

const NOW = Date.parse('2026-12-28T09:00:00+07:00');

describe('delivery states', () => {
  it('are exactly the Part 6 §6.10 states; four of them are final', () => {
    expect(DELIVERY_STATES).toEqual(['pending', 'processing', 'provider_accepted', 'failed', 'delivery_unknown', 'suppressed']);
    expect(SETTLED_DELIVERY_STATES).toEqual(['provider_accepted', 'failed', 'delivery_unknown', 'suppressed']);
  });

  it('a send is leased for a few minutes, well inside one 15-minute tick', () => {
    expect(DELIVERY_LEASE_MS).toBe(5 * MINUTE_MS);
  });
});

describe('chooseDeliveryChannel (A1.2)', () => {
  it('Slack when the person is mapped to a Slack user', () => {
    expect(chooseDeliveryChannel({ active: true, slackUserId: 'U01ABCDE' })).toBe('slack');
  });

  it('company e-mail when there is no Slack mapping but the account is active', () => {
    expect(chooseDeliveryChannel({ active: true })).toBe('email');
    expect(chooseDeliveryChannel({ active: true, slackUserId: '  ' })).toBe('email');
  });

  it('no channel for an inactive account or an unknown person (never guessed from a name)', () => {
    expect(chooseDeliveryChannel({ active: false, slackUserId: 'U01ABCDE' })).toBeUndefined();
    expect(chooseDeliveryChannel(undefined)).toBeUndefined();
  });
});

describe('claimDelivery: only a due pending entry is sent; the same entry picked twice is sent once', () => {
  it('pending and due → claim', () => {
    expect(claimDelivery({ state: 'pending', next_attempt_at: NOW }, NOW)).toEqual({ kind: 'claim' });
    expect(claimDelivery({ state: 'pending', next_attempt_at: NOW - 1 }, NOW)).toEqual({ kind: 'claim' });
  });

  it('pending but waiting for its back-off → skip', () => {
    expect(claimDelivery({ state: 'pending', next_attempt_at: NOW + 1 }, NOW)).toEqual({ kind: 'skip', reason: 'not_due' });
  });

  it('processing under a live lease (another worker is sending it) → skip', () => {
    expect(claimDelivery({ state: 'processing', next_attempt_at: NOW + 1, lease_until: NOW + 1 }, NOW)).toEqual({ kind: 'skip', reason: 'leased' });
  });

  it('processing with an expired lease: the worker died mid-send, the provider may have it → delivery_unknown, never a blind resend', () => {
    expect(claimDelivery({ state: 'processing', next_attempt_at: NOW, lease_until: NOW }, NOW)).toEqual({ kind: 'lease_expired' });
  });

  it.each(['provider_accepted', 'failed', 'delivery_unknown', 'suppressed'] as const)('%s is final → skip', (state) => {
    expect(claimDelivery({ state, next_attempt_at: NOW - 1 }, NOW)).toEqual({ kind: 'skip', reason: 'settled' });
  });
});

describe('settleDelivery: bounded back-off, then a failure the GM can see', () => {
  it('accepted by the provider → provider_accepted with its ID', () => {
    expect(settleDelivery(1, { kind: 'accepted', providerId: 'local-1' }, NOW)).toEqual({ state: 'provider_accepted', providerId: 'local-1' });
  });

  it('a known failure is retried later with growing gaps: 5, 15, 60, 240 minutes', () => {
    const gaps = [1, 2, 3, 4].map((attempts) => settleDelivery(attempts, { kind: 'retryable', code: 'PROVIDER_UNAVAILABLE' }, NOW));
    expect(gaps).toEqual([5, 15, 60, 240].map((minutes) => ({ state: 'pending', nextAttemptAt: NOW + minutes * MINUTE_MS, errorCode: 'PROVIDER_UNAVAILABLE' })));
  });

  it('the fifth failed attempt is the last → failed, keeping the reason', () => {
    expect(settleDelivery(5, { kind: 'retryable', code: 'PROVIDER_UNAVAILABLE' }, NOW)).toEqual({ state: 'failed', errorCode: 'PROVIDER_UNAVAILABLE' });
  });

  it('a permanent refusal is not retried', () => {
    expect(settleDelivery(1, { kind: 'permanent', code: 'CHANNEL_DISABLED' }, NOW)).toEqual({ state: 'failed', errorCode: 'CHANNEL_DISABLED' });
  });

  it('an unknown result (connection dropped after sending) → delivery_unknown for the GM to check', () => {
    expect(settleDelivery(1, { kind: 'unknown', code: 'CONNECTION_LOST' }, NOW)).toEqual({ state: 'delivery_unknown', errorCode: 'CONNECTION_LOST' });
  });
});
