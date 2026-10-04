import { prepareCalendar, type CalendarSnapshot, type DurationUnit, type Instant } from './calendar';
import { businessDuration } from './business-time';

/** Closed half-open interval [start, end), in UTC epoch milliseconds. */
export interface TimeInterval { readonly start: Instant; readonly end: Instant }
/** Calculation input only; persisted timestamp mapping belongs to contracts/callers. */
export interface WaitingInterval {
  readonly startedAt: Instant;
  readonly respondedAt?: Instant;
  readonly exitedAt?: Instant;
}
/** Caller supplies the immutable SLA calendar and milestone stop, if reached. */
export interface SlaClock {
  readonly startedAt: Instant;
  readonly stoppedAt?: Instant;
  readonly unit: DurationUnit;
  readonly calendarSnapshot: CalendarSnapshot;
  readonly waitingIntervals: readonly WaitingInterval[];
}

function assertInstant(name: string, instant: Instant): void {
  if (!Number.isSafeInteger(instant)) throw new RangeError(`${name} must be an integer epoch-millisecond instant`);
}

function validateWaiting(interval: WaitingInterval): void {
  assertInstant('startedAt', interval.startedAt);
  for (const [name, value] of [['respondedAt', interval.respondedAt], ['exitedAt', interval.exitedAt]] as const) {
    if (value !== undefined) {
      assertInstant(name, value);
      if (value < interval.startedAt) throw new RangeError(`${name} must not be before startedAt`);
    }
  }
}

function assertUnit(unit: DurationUnit): void {
  if (unit !== 'business_days' && unit !== 'continuous_24h') {
    throw new RangeError('unit must be business_days or continuous_24h');
  }
}

/** Sort a copy, merge overlaps/touching ranges, and drop empty ranges; never mutate history. */
export function mergeIntervals(intervals: readonly TimeInterval[]): TimeInterval[] {
  const sorted = intervals.map(({ start, end }) => {
    assertInstant('start', start);
    assertInstant('end', end);
    if (end < start) throw new RangeError('end must not be before start');
    return { start, end };
  }).filter(({ start, end }) => end > start).sort((a, b) => a.start - b.start);

  const merged: TimeInterval[] = [];
  for (const interval of sorted) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && interval.start <= previous.end) {
      merged[merged.length - 1] = { start: previous.start, end: Math.max(previous.end, interval.end) };
    } else {
      merged.push(interval);
    }
  }
  return merged;
}

/** A2.3: first party response or GM exit stops waiting, bounded by explicit evaluation time. */
export function effectiveWaitingEnd(interval: WaitingInterval, now: Instant): Instant {
  validateWaiting(interval);
  assertInstant('now', now);
  if (now < interval.startedAt) throw new RangeError('now must not be before startedAt');
  return Math.min(now, interval.respondedAt ?? now, interval.exitedAt ?? now);
}

/** Raw milliseconds in the requested unit; business measurement always delegates to S01. */
function measure(start: Instant, end: Instant, unit: DurationUnit, calendar: CalendarSnapshot): number {
  return unit === 'business_days' ? businessDuration(start, end, calendar) : end - start;
}

/** Party wait for charts: raw real-time or business time, ending at the same effective instant. */
export function waitingElapsed(interval: WaitingInterval, now: Instant, unit: DurationUnit, calendar: CalendarSnapshot): number {
  assertUnit(unit);
  prepareCalendar(calendar);
  return measure(interval.startedAt, effectiveWaitingEnd(interval, now), unit, calendar);
}

/**
 * SLA GM clock, Part 6 §6.7: elapsed in its original unit minus the union of effective waits.
 * No budget/due/rounding/status changes: callers handle milestone selection and later tasks.
 * `stoppedAt` freezes evaluation at the supplied milestone; future/old waits are clipped out.
 */
export function slaElapsed(request: SlaClock, now: Instant): number {
  assertInstant('startedAt', request.startedAt);
  assertInstant('now', now);
  if (now < request.startedAt) throw new RangeError('now must not be before startedAt');
  if (request.stoppedAt !== undefined) {
    assertInstant('stoppedAt', request.stoppedAt);
    if (request.stoppedAt < request.startedAt) throw new RangeError('stoppedAt must not be before startedAt');
  }
  assertUnit(request.unit);
  prepareCalendar(request.calendarSnapshot);
  const end = Math.min(now, request.stoppedAt ?? now);
  const pauses: TimeInterval[] = [];
  for (const interval of request.waitingIntervals) {
    validateWaiting(interval);
    if (interval.startedAt >= end) continue;
    const pauseStart = Math.max(request.startedAt, interval.startedAt);
    const pauseEnd = effectiveWaitingEnd(interval, end);
    if (pauseEnd > pauseStart) pauses.push({ start: pauseStart, end: pauseEnd });
  }
  const paused = mergeIntervals(pauses).reduce(
    (sum, interval) => sum + measure(interval.start, interval.end, request.unit, request.calendarSnapshot), 0,
  );
  return measure(request.startedAt, end, request.unit, request.calendarSnapshot) - paused;
}
