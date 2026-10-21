// A11 — the Admin system health (FU-25): the last tick (D-A02-5: red when the last finished tick is more
// than 30 minutes old, or none finished), the Slack app (D-A08-6), failed `scheduled_work` jobs (D-A05-5:
// they stay and count) and notices not delivered. Red = something stopped working; warning = notices to
// check; e-mail sent instead of Slack is counted by reason but changes no level on its own.
import type { Instant } from '@gm/time';
import { channelAppHealth, type ChannelHealth } from './channel-health';

export const TICK_STALE_AFTER_MS = 30 * 60_000;

/**
 * `slack_fallback_code` values the worker writes when it e-mails instead (A07 D-A07-4, A08 D-A08-6):
 * the stored Slack ID does not reach anyone, the user is disabled, or the app itself does not work.
 * Health counts each; anything else is counted as `OTHER`.
 */
export const SLACK_FALLBACK_CODES = [
  'SLACK_NOT_MAPPED',
  'SLACK_USER_NOT_FOUND',
  'SLACK_CHANNEL_NOT_FOUND',
  'SLACK_USER_DISABLED',
  'SLACK_ACCOUNT_INACTIVE',
  'SLACK_INVALID_AUTH',
  'SLACK_NOT_AUTHED',
  'SLACK_TOKEN_REVOKED',
  'SLACK_TOKEN_EXPIRED',
  'SLACK_MISSING_SCOPE',
  'SLACK_NO_PERMISSION',
  'SLACK_NOT_ALLOWED_TOKEN_TYPE',
  'SLACK_TEAM_ACCESS_NOT_GRANTED',
  'SLACK_ORG_LOGIN_REQUIRED',
  'SLACK_EKM_ACCESS_DENIED',
] as const;

export type HealthLevel = 'ok' | 'warning' | 'red';

export type TickHealth =
  | { readonly level: 'ok'; readonly lastStartedAt?: Instant; readonly lastCompletedAt: Instant }
  | { readonly level: 'red'; readonly reason: 'TICK_LATE' | 'TICK_NEVER_COMPLETED'; readonly lastStartedAt?: Instant; readonly lastCompletedAt?: Instant };

const instantOf = (value: unknown): Instant | undefined => (Number.isSafeInteger(value) ? (value as Instant) : undefined);

/** `scheduled_work/tick` as stored → its health at `now`. */
export function tickHealth(stored: unknown, now: Instant): TickHealth {
  const record = typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};
  const started = instantOf(record.last_started_at);
  const completed = instantOf(record.last_completed_at);
  const startedField = started === undefined ? {} : { lastStartedAt: started };
  if (completed === undefined) return { level: 'red', reason: 'TICK_NEVER_COMPLETED', ...startedField };
  if (now - completed > TICK_STALE_AFTER_MS) return { level: 'red', reason: 'TICK_LATE', ...startedField, lastCompletedAt: completed };
  return { level: 'ok', ...startedField, lastCompletedAt: completed };
}

export interface FailedJob {
  readonly id: string;
  readonly kind: string;
  readonly code?: string;
  readonly at?: Instant;
}

export interface HealthFacts {
  readonly now: Instant;
  /** `scheduled_work/tick`. */
  readonly tick: unknown;
  /** `integration_state/slack_app`. */
  readonly slackApp: unknown;
  readonly outbox: { readonly failed: number; readonly deliveryUnknown: number; readonly emailCapPending: number };
  /** Notices sent by e-mail instead of Slack, per `slack_fallback_code`. */
  readonly slackFallback: Readonly<Record<string, number>>;
  /** The failed jobs shown (a page), and how many there are in all. */
  readonly failedJobs: readonly FailedJob[];
  readonly failedJobCount: number;
}

export interface SystemHealth {
  readonly level: HealthLevel;
  readonly tick: TickHealth;
  readonly slackApp: ChannelHealth;
  readonly outbox: HealthFacts['outbox'];
  readonly slackFallback: Readonly<Record<string, number>>;
  readonly failedJobs: readonly FailedJob[];
  readonly failedJobCount: number;
}

export function systemHealth(facts: HealthFacts): SystemHealth {
  const tick = tickHealth(facts.tick, facts.now);
  const slackApp = channelAppHealth(facts.slackApp);
  const red = tick.level === 'red' || slackApp.level === 'red' || facts.failedJobCount > 0;
  const { failed, deliveryUnknown, emailCapPending } = facts.outbox;
  const warning = failed > 0 || deliveryUnknown > 0 || emailCapPending > 0;
  return {
    level: red ? 'red' : warning ? 'warning' : 'ok',
    tick,
    slackApp,
    outbox: facts.outbox,
    slackFallback: facts.slackFallback,
    failedJobs: facts.failedJobs,
    failedJobCount: facts.failedJobCount,
  };
}
