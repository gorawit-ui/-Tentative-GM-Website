// D-A08-6 — a provider error about the app itself (Slack: its token, account or scopes) stops every
// message on that channel at once. The worker falls back to company e-mail in the same attempt and
// keeps one server-only state per channel (`integration_state/slack_app`) that turns the Admin health
// red (FU-25) until a send on that channel goes through again. Written only when it changes (§6.9).
import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '@gm/time';
import { channelAppHealth, channelAppStateAfter, settleDelivery, type DeliveryOutcome } from './index';

const NOW = Date.parse('2027-01-11T09:00:00+07:00');
const LATER = NOW + 30 * MINUTE_MS;
const appError = (code: string): DeliveryOutcome => ({ kind: 'unavailable', code });
const accepted: DeliveryOutcome = { kind: 'accepted', providerId: 'slack:D1:1.1' };
const DOWN = { status: 'app_error', code: 'SLACK_INVALID_AUTH', since: NOW };

describe('settleDelivery: an app-level error with nothing to fall back to', () => {
  it('fails with the provider’s code (visible to the GM like any failure)', () => {
    expect(settleDelivery(1, appError('SLACK_TOKEN_REVOKED'), NOW)).toEqual({ state: 'failed', errorCode: 'SLACK_TOKEN_REVOKED' });
  });
});

describe('channelAppStateAfter: the channel’s app state after one send (undefined = no write)', () => {
  it.each([
    ['nothing stored', undefined],
    ['stored ok after an earlier outage', { status: 'ok', recovered_at: NOW - MINUTE_MS, last_error_code: 'SLACK_ACCOUNT_INACTIVE' }],
  ])('%s + an app-level error → app_error with its code, since now', (_label, previous) => {
    expect(channelAppStateAfter(previous, appError('SLACK_INVALID_AUTH'), NOW)).toEqual({ status: 'app_error', code: 'SLACK_INVALID_AUTH', since: NOW });
  });

  it('already down with the same code → no write (the outage started earlier)', () => {
    expect(channelAppStateAfter(DOWN, appError('SLACK_INVALID_AUTH'), LATER)).toBeUndefined();
  });

  it('already down, another app-level code → the new code, the outage still dated from its start', () => {
    expect(channelAppStateAfter(DOWN, appError('SLACK_TOKEN_REVOKED'), LATER)).toEqual({ status: 'app_error', code: 'SLACK_TOKEN_REVOKED', since: NOW });
  });

  it('down, then a send on the channel goes through → ok, when it recovered and what it was', () => {
    expect(channelAppStateAfter(DOWN, accepted, LATER)).toEqual({ status: 'ok', recovered_at: LATER, last_error_code: 'SLACK_INVALID_AUTH' });
  });

  it.each([
    ['nothing stored', undefined],
    ['ok', { status: 'ok', recovered_at: NOW, last_error_code: 'SLACK_INVALID_AUTH' }],
  ])('%s + accepted → no write', (_label, previous) => {
    expect(channelAppStateAfter(previous, accepted, LATER)).toBeUndefined();
  });

  it.each<DeliveryOutcome>([
    { kind: 'unmapped' },
    { kind: 'unmapped', code: 'SLACK_USER_DISABLED' },
    { kind: 'retryable', code: 'SLACK_RATE_LIMITED' },
    { kind: 'unknown', code: 'SLACK_TIMEOUT' },
    { kind: 'permanent', code: 'SLACK_MSG_TOO_LONG' },
    { kind: 'suppressed', code: 'NOT_IN_SANDBOX' },
  ])('a result about one recipient or one message ($kind) says nothing about the app → no write', (outcome) => {
    expect(channelAppStateAfter(DOWN, outcome, LATER)).toBeUndefined();
    expect(channelAppStateAfter(undefined, outcome, LATER)).toBeUndefined();
  });
});

describe('channelAppHealth: what the Admin health shows (FU-25)', () => {
  it('app_error → red with the code and since when (not colour alone: the screen words it)', () => {
    expect(channelAppHealth(DOWN)).toEqual({ level: 'red', code: 'SLACK_INVALID_AUTH', since: NOW });
  });

  it.each([
    ['nothing stored', undefined],
    ['ok after an outage', { status: 'ok', recovered_at: LATER, last_error_code: 'SLACK_INVALID_AUTH' }],
  ])('%s → ok', (_label, stored) => {
    expect(channelAppHealth(stored)).toEqual({ level: 'ok' });
  });

  it('an app_error written without a code or time is still red', () => {
    expect(channelAppHealth({ status: 'app_error' })).toEqual({ level: 'red', code: 'APP_ERROR' });
  });
});
