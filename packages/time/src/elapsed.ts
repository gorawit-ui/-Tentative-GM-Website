import type { Instant } from './calendar';

export const MINUTE_MS = 60_000;

/**
 * A02: an instant `durationMs` of real elapsed time after `start` — for leases and retry back-off,
 * which follow the wall clock, not business days (Part 6 §6.9 “clock/expiry ใช้เวลาจริง”).
 */
export function addElapsed(start: Instant, durationMs: number): Instant {
  if (!Number.isSafeInteger(start)) throw new RangeError('start must be an integer epoch-millisecond instant');
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new RangeError('duration must be a positive whole number of milliseconds');
  return start + durationMs;
}
