import type { Instant } from './calendar';
import { dayNumberAt, parseIsoDate, startOfDay, zonedFormatter } from './zoned-date';

const DAY_MS = 86_400_000;
/** Presence and leave days are Asia/Bangkok calendar days (C7, A3, D-S01-5). */
const BANGKOK = zonedFormatter('Asia/Bangkok');

function assertInstant(name: string, instant: Instant): void {
  if (!Number.isSafeInteger(instant)) throw new RangeError(`${name} must be an integer epoch-millisecond instant`);
}

/** The Asia/Bangkok calendar date (`YYYY-MM-DD`) of an instant (C7/A3 use Bangkok days). */
export function bangkokDateOf(instant: Instant): string {
  assertInstant('instant', instant);
  return new Date(dayNumberAt(BANGKOK, instant) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * When a presence set at `setAt` stops applying (C7, A3): the start of the next Bangkok day, or,
 * for leave with an end date, the start of the day after `leaveEndsOn` (inclusive end date).
 */
export function presenceExpiresAt(setAt: Instant, leaveEndsOn?: string): Instant {
  assertInstant('setAt', setAt);
  const setDay = dayNumberAt(BANGKOK, setAt);
  let lastDay = setDay;
  if (leaveEndsOn !== undefined) {
    const endDay = parseIsoDate(leaveEndsOn);
    const year = Number(leaveEndsOn.slice(0, 4));
    if (endDay === undefined || year < 2000 || year > 2100) {
      throw new RangeError(`leaveEndsOn must be a real Gregorian YYYY-MM-DD date (ค.ศ. 2000–2100), got ${JSON.stringify(leaveEndsOn)}`);
    }
    if (endDay < setDay) throw new RangeError('leaveEndsOn must not be before the day the leave was set');
    lastDay = endDay;
  }
  return startOfDay(BANGKOK, lastDay + 1);
}

/** A08 stub. */
export function startOfNextBangkokDay(_instant: Instant): Instant {
  throw new Error('A08 stub: startOfNextBangkokDay not implemented');
}
