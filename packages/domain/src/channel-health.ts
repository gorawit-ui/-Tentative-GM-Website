// D-A08-6 — the state of a sending app (Slack) as the worker last saw it. An `unavailable` answer is
// about the app itself (its token, account or scopes), so every message on that channel fails until an
// admin fixes it: the worker sends e-mail instead and keeps this state, which turns the Admin health
// red (FU-25) until a send on the channel goes through again. Written only when it changes (§6.9).
import type { Instant } from '@gm/time';
import type { DeliveryOutcome } from './delivery';

export interface ChannelAppState {
  readonly status: 'ok' | 'app_error';
  /** app_error: the provider's code, e.g. `SLACK_INVALID_AUTH`. */
  readonly code?: string;
  /** app_error: when this outage started. */
  readonly since?: Instant;
  /** ok after an outage: when a send went through again. */
  readonly recovered_at?: Instant;
  /** ok after an outage: the code it had. */
  readonly last_error_code?: string;
}

export type ChannelHealth = { readonly level: 'ok' } | { readonly level: 'red'; readonly code: string; readonly since?: Instant };

interface StoredAppState {
  readonly down: boolean;
  readonly code?: string;
  readonly since?: Instant;
}

function read(stored: unknown): StoredAppState {
  if (typeof stored !== 'object' || stored === null) return { down: false };
  const record = stored as Record<string, unknown>;
  if (record.status !== 'app_error') return { down: false };
  return {
    down: true,
    ...(typeof record.code === 'string' && record.code !== '' ? { code: record.code } : {}),
    ...(Number.isSafeInteger(record.since) ? { since: record.since as number } : {}),
  };
}

/** The state to write after one send on the channel, or undefined when nothing changes. */
export function channelAppStateAfter(previous: unknown, outcome: DeliveryOutcome, now: Instant): ChannelAppState | undefined {
  const before = read(previous);
  if (outcome.kind === 'unavailable') {
    if (before.down && before.code === outcome.code) return undefined;
    return { status: 'app_error', code: outcome.code, since: before.down ? (before.since ?? now) : now };
  }
  if (outcome.kind === 'accepted' && before.down) {
    return { status: 'ok', recovered_at: now, ...(before.code === undefined ? {} : { last_error_code: before.code }) };
  }
  // One recipient or one message (not mapped, rate limit, unknown…): says nothing about the app.
  return undefined;
}

/** FU-25: red while the app is down, with the code and since when (the screen words it, not colour alone). */
export function channelAppHealth(stored: unknown): ChannelHealth {
  const state = read(stored);
  if (!state.down) return { level: 'ok' };
  return { level: 'red', code: state.code ?? 'APP_ERROR', ...(state.since === undefined ? {} : { since: state.since }) };
}
