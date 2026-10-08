// A02 — the single tick and its jobs (Part 6 §6.2, §6.9). Production has one Scheduler job that
// calls the worker's tick every 15 minutes (Asia/Bangkok); every scheduled task in the §6.9 table runs
// from that tick: the outbox recovery step and the `scheduled_work` jobs. A transaction lease on the
// tick makes a duplicate tick a no-op; a lease shorter than the interval means a worker that died
// mid-tick never blocks the next one. Jobs keep attempts / lease_until / last_error_code /
// next_run_at / completed_at and are retried a bounded number of times; the last failure stays
// visible. An expired job lease does not prove the work did not happen, so every handler rechecks
// in its own transaction (the worker's `runChecked` compares the request revision).
import { MINUTE_MS, addElapsed, type Instant } from '@gm/time';

export const TICK_SCHEDULE = { cron: '*/15 * * * *', timeZone: 'Asia/Bangkok' } as const;
export const TICK_INTERVAL_MS = 15 * MINUTE_MS;
/** Shorter than the interval: the tick after a crashed one always finds the lease over. */
export const TICK_LEASE_MS = 10 * MINUTE_MS;

/** A tick stops picking up new work after this; the item in hand keeps its own lease. */
export const TICK_WORK_BUDGET_MS = 5 * MINUTE_MS;

/** Steps of one tick, in order. */
export const TICK_STEPS = ['outbox_recovery', 'scheduled_work'] as const;
export type TickStep = (typeof TICK_STEPS)[number];

/** `scheduled_work` job kinds from the §6.9 table; handlers arrive with their tasks (A05, B09, B15, A26…). */
export const SCHEDULED_WORK_KINDS = ['stale', 'auto_close', 'presence_reset', 'digest', 'renewal', 'aggregate_reconcile', 'backup', 'cleanup'] as const;
export type ScheduledWorkKind = (typeof SCHEDULED_WORK_KINDS)[number];

export function isScheduledWorkKind(value: unknown): value is ScheduledWorkKind {
  return typeof value === 'string' && (SCHEDULED_WORK_KINDS as readonly string[]).includes(value);
}

/**
 * Bounded retry for outbox sends and jobs (Part 6 §6.9/§6.10 give no numbers; proposed in A02 —
 * Q-A02-1): five attempts in all, waiting 5, 15, 60 and 240 minutes between them (~5 h 20 min).
 * The 15-minute tick picks a retry up at the first tick after its time.
 */
export const BOUNDED_RETRY = { maxAttempts: 5, delaysMs: [5, 15, 60, 240].map((minutes) => minutes * MINUTE_MS) } as const;

/** When to try again after `attempts` attempts so far; undefined once the cap is reached. */
export function nextRetryAt(attempts: number, now: Instant): Instant | undefined {
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new RangeError('attempts must be a positive whole number');
  if (attempts >= BOUNDED_RETRY.maxAttempts) return undefined;
  const delay = BOUNDED_RETRY.delaysMs[attempts - 1] ?? BOUNDED_RETRY.delaysMs[BOUNDED_RETRY.delaysMs.length - 1] ?? MINUTE_MS;
  return addElapsed(now, delay);
}

/** The tick's own lease: a live lease means another tick is running. */
export function claimTick(lease: { readonly lease_until?: Instant } | undefined, now: Instant): 'acquire' | 'busy' {
  return lease?.lease_until !== undefined && lease.lease_until > now ? 'busy' : 'acquire';
}

export const JOB_STATES = ['scheduled', 'done', 'failed', 'superseded'] as const;
export type JobState = (typeof JOB_STATES)[number];
/** A job holds its lease this long; past it, the next tick may run the job again. */
export const JOB_LEASE_MS = 5 * MINUTE_MS;

export interface JobLeaseState {
  readonly state: JobState;
  readonly next_run_at: Instant;
  readonly lease_until?: Instant;
}

export type JobClaim = { readonly kind: 'claim' } | { readonly kind: 'skip'; readonly reason: 'not_due' | 'leased' | 'settled' };

export function claimJob(job: JobLeaseState, now: Instant): JobClaim {
  if (job.state !== 'scheduled') return { kind: 'skip', reason: 'settled' };
  if (job.lease_until !== undefined && job.lease_until > now) return { kind: 'skip', reason: 'leased' };
  if (job.next_run_at > now) return { kind: 'skip', reason: 'not_due' };
  // Never leased, or its lease ran out (the worker died): run it; the handler rechecks.
  return { kind: 'claim' };
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

/** The job's state after its `attempts`-th attempt ended with `outcome`. */
export function settleJob(attempts: number, outcome: JobOutcome, now: Instant): JobSettlement {
  switch (outcome.kind) {
    case 'done':
      return { state: 'done' };
    case 'superseded':
      return { state: 'superseded' };
    case 'reschedule':
      if (!Number.isSafeInteger(outcome.at) || outcome.at <= now) throw new RangeError('a rescheduled job must run later than now');
      return { state: 'scheduled', nextRunAt: outcome.at };
    case 'retryable': {
      const retryAt = nextRetryAt(attempts, now);
      return retryAt === undefined ? { state: 'failed', errorCode: outcome.code } : { state: 'scheduled', nextRunAt: retryAt, errorCode: outcome.code };
    }
    case 'permanent':
      return { state: 'failed', errorCode: outcome.code };
  }
}
