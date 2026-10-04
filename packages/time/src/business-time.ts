import { BUSINESS_DAY_MS, prepareCalendar, type CalendarSnapshot, type DurationUnit, type Instant } from './calendar';
import { dayNumberAt, startOfDay } from './zoned-date';

function assertInstant(name: string, value: Instant): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be an integer epoch-millisecond instant`);
}

function assertPositiveDuration(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive whole number of milliseconds`);
  }
}

/**
 * Business milliseconds between `start` and `end`: only time on open dates of the snapshot
 * counts, 24 hours per open date (PRD §6.1). Returns the raw value; display rounds elsewhere.
 */
export function businessDuration(start: Instant, end: Instant, calendar: CalendarSnapshot): number {
  assertInstant('start', start);
  assertInstant('end', end);
  if (end < start) throw new RangeError('end must not be before start');
  const { formatter, isOpen } = prepareCalendar(calendar);

  let total = 0;
  let cursor = start;
  let day = dayNumberAt(formatter, start);
  while (cursor < end) {
    const segmentEnd = Math.min(end, startOfDay(formatter, day + 1));
    if (isOpen(day)) total += segmentEnd - cursor;
    cursor = segmentEnd;
    day += 1;
  }
  return total;
}

/**
 * The earliest instant at which `duration` business milliseconds have accumulated after
 * `start`. Time on closed dates is skipped, so a start on a closed date begins counting at
 * 00:00 of the next open date, and a total that ends exactly at the end of an open date
 * returns the following 00:00.
 */
export function addBusinessDuration(start: Instant, duration: number, calendar: CalendarSnapshot): Instant {
  assertInstant('start', start);
  assertPositiveDuration('duration', duration);
  const { formatter, isOpen } = prepareCalendar(calendar);

  let remaining = duration;
  let cursor = start;
  let day = dayNumberAt(formatter, start);
  for (;;) {
    const dayEnd = startOfDay(formatter, day + 1);
    if (isOpen(day)) {
      const available = dayEnd - cursor;
      if (remaining <= available) return cursor + remaining;
      remaining -= available;
    }
    cursor = dayEnd;
    day += 1;
  }
}

/**
 * Adds `amount` days in a C8 unit: `business_days` counts 24 hours per open date of the
 * snapshot; `continuous_24h` counts every hour including weekends and holidays.
 */
export function addDuration(start: Instant, amount: number, unit: DurationUnit, calendar: CalendarSnapshot): Instant {
  if (unit !== 'business_days' && unit !== 'continuous_24h') {
    throw new RangeError(`unit must be business_days or continuous_24h`);
  }
  if (!Number.isFinite(amount) || amount <= 0) throw new RangeError('amount must be a positive number of days');
  const duration = amount * BUSINESS_DAY_MS;
  if (unit === 'business_days') return addBusinessDuration(start, duration, calendar);

  assertInstant('start', start);
  assertPositiveDuration('duration', duration);
  prepareCalendar(calendar);
  return start + duration;
}
