// A02 — the single tick (Part 6 §6.2/§6.9: one Scheduler job `*/15 * * * *` Asia/Bangkok; every
// scheduled task runs from that tick; jobs keep attempts / lease_until / last_error_code /
// next_run_at / completed_at; retry is bounded and the last failure is visible).
import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '@gm/time';
import {
  BOUNDED_RETRY,
  JOB_STATES,
  SCHEDULED_WORK_KINDS,
  TICK_INTERVAL_MS,
  TICK_LEASE_MS,
  TICK_SCHEDULE,
  TICK_STEPS,
  claimJob,
  claimTick,
  nextRetryAt,
  settleJob,
} from './index';

const NOW = Date.parse('2026-12-28T09:00:00+07:00');

describe('one Scheduler job, one tick', () => {
  it('every 15 minutes, Asia/Bangkok', () => {
    expect(TICK_SCHEDULE).toEqual({ cron: '*/15 * * * *', timeZone: 'Asia/Bangkok' });
    expect(TICK_INTERVAL_MS).toBe(15 * MINUTE_MS);
  });

  it('every task of the §6.9 table enters through the same tick (no second Scheduler job)', () => {
    const tickWork = [...TICK_STEPS.filter((step) => step !== 'scheduled_work'), ...SCHEDULED_WORK_KINDS].sort();
    expect(tickWork).toEqual(
      ['stale', 'auto_close', 'presence_reset', 'digest', 'renewal', 'outbox_recovery', 'aggregate_reconcile', 'backup', 'cleanup'].sort(),
    );
  });

  it('the tick lease is shorter than the interval, so a worker that died never blocks the next tick', () => {
    expect(TICK_LEASE_MS).toBeLessThan(TICK_INTERVAL_MS);
    expect(TICK_LEASE_MS).toBe(10 * MINUTE_MS);
  });
});

describe('claimTick: two ticks at once → one runs', () => {
  it('no lease yet, or a released / expired lease → acquire', () => {
    expect(claimTick(undefined, NOW)).toBe('acquire');
    expect(claimTick({ lease_until: NOW }, NOW)).toBe('acquire');
    expect(claimTick({ lease_until: NOW - 1 }, NOW)).toBe('acquire');
  });

  it('a live lease → busy (the duplicate tick is a no-op)', () => {
    expect(claimTick({ lease_until: NOW + 1 }, NOW)).toBe('busy');
  });
});

describe('bounded retry', () => {
  it('five attempts in all; gaps of 5, 15, 60 and 240 minutes', () => {
    expect(BOUNDED_RETRY).toEqual({ maxAttempts: 5, delaysMs: [5, 15, 60, 240].map((minutes) => minutes * MINUTE_MS) });
    expect([1, 2, 3, 4, 5].map((attempts) => nextRetryAt(attempts, NOW))).toEqual([
      NOW + 5 * MINUTE_MS,
      NOW + 15 * MINUTE_MS,
      NOW + 60 * MINUTE_MS,
      NOW + 240 * MINUTE_MS,
      undefined,
    ]);
  });

  it.each([0, -1, 1.5])('rejects an attempt count of %s', (attempts) => {
    expect(() => nextRetryAt(attempts, NOW)).toThrow(RangeError);
  });
});

describe('scheduled_work jobs', () => {
  it('states', () => {
    expect(JOB_STATES).toEqual(['scheduled', 'done', 'failed', 'superseded']);
  });

  it('a due scheduled job → claim; not yet due → skip', () => {
    expect(claimJob({ state: 'scheduled', next_run_at: NOW }, NOW)).toEqual({ kind: 'claim' });
    expect(claimJob({ state: 'scheduled', next_run_at: NOW + 1 }, NOW)).toEqual({ kind: 'skip', reason: 'not_due' });
  });

  it('leased by a running tick → skip; lease expired (worker died) → claim again, the handler rechecks in its transaction', () => {
    expect(claimJob({ state: 'scheduled', next_run_at: NOW + 1, lease_until: NOW + 1 }, NOW)).toEqual({ kind: 'skip', reason: 'leased' });
    expect(claimJob({ state: 'scheduled', next_run_at: NOW, lease_until: NOW }, NOW)).toEqual({ kind: 'claim' });
  });

  it.each(['done', 'failed', 'superseded'] as const)('%s is final → skip', (state) => {
    expect(claimJob({ state, next_run_at: NOW - 1 }, NOW)).toEqual({ kind: 'skip', reason: 'settled' });
  });

  it('settle: done / rescheduled / superseded (the request moved on) / retried / failed after the cap', () => {
    expect(settleJob(1, { kind: 'done' }, NOW)).toEqual({ state: 'done' });
    expect(settleJob(1, { kind: 'reschedule', at: NOW + 86_400_000 }, NOW)).toEqual({ state: 'scheduled', nextRunAt: NOW + 86_400_000 });
    expect(settleJob(1, { kind: 'superseded' }, NOW)).toEqual({ state: 'superseded' });
    expect(settleJob(2, { kind: 'retryable', code: 'JOB_ERROR' }, NOW)).toEqual({ state: 'scheduled', nextRunAt: NOW + 15 * MINUTE_MS, errorCode: 'JOB_ERROR' });
    expect(settleJob(5, { kind: 'retryable', code: 'JOB_ERROR' }, NOW)).toEqual({ state: 'failed', errorCode: 'JOB_ERROR' });
    expect(settleJob(1, { kind: 'permanent', code: 'JOB_KIND_NOT_READY' }, NOW)).toEqual({ state: 'failed', errorCode: 'JOB_KIND_NOT_READY' });
  });

  it('a reschedule must move forward in time', () => {
    expect(() => settleJob(1, { kind: 'reschedule', at: NOW }, NOW)).toThrow(RangeError);
  });
});
