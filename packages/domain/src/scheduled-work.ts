// A02 stub — implemented after the failing tests are committed.
import type { Instant } from '@gm/time';

export const TICK_SCHEDULE = {} as { readonly cron: string; readonly timeZone: string };
export const TICK_INTERVAL_MS = 0;
export const TICK_LEASE_MS = 0;
export const TICK_STEPS = [] as unknown as readonly ['outbox_recovery', 'scheduled_work'];
export type TickStep = 'outbox_recovery' | 'scheduled_work';
export const SCHEDULED_WORK_KINDS = [] as unknown as readonly [
  'stale',
  'auto_close',
  'presence_reset',
  'digest',
  'renewal',
  'aggregate_reconcile',
  'backup',
  'cleanup',
];
export type ScheduledWorkKind = 'stale' | 'auto_close' | 'presence_reset' | 'digest' | 'renewal' | 'aggregate_reconcile' | 'backup' | 'cleanup';
export const BOUNDED_RETRY = {} as { readonly maxAttempts: number; readonly delaysMs: readonly number[] };
export const JOB_LEASE_MS = 0;

export function nextRetryAt(_attempts: number, _now: Instant): Instant | undefined {
  throw new Error('not implemented');
}

export function claimTick(_lease: { readonly lease_until?: Instant } | undefined, _now: Instant): 'acquire' | 'busy' {
  throw new Error('not implemented');
}

export const JOB_STATES = [] as unknown as readonly ['scheduled', 'done', 'failed', 'superseded'];
export type JobState = 'scheduled' | 'done' | 'failed' | 'superseded';

export interface JobLeaseState {
  readonly state: JobState;
  readonly next_run_at: Instant;
  readonly lease_until?: Instant;
}

export type JobClaim = { readonly kind: 'claim' } | { readonly kind: 'skip'; readonly reason: 'not_due' | 'leased' | 'settled' };

export function claimJob(_job: JobLeaseState, _now: Instant): JobClaim {
  throw new Error('not implemented');
}

export type JobOutcome =
  | { readonly kind: 'done' }
  | { readonly kind: 'reschedule'; readonly at: Instant }
  | { readonly kind: 'superseded' }
  | { readonly kind: 'retryable'; readonly code: string }
  | { readonly kind: 'permanent'; readonly code: string };

export interface JobSettlement {
  readonly state: JobState;
  readonly nextRunAt?: Instant;
  readonly errorCode?: string;
}

export function settleJob(_attempts: number, _outcome: JobOutcome, _now: Instant): JobSettlement {
  throw new Error('not implemented');
}
