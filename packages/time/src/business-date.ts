import { prepareCalendar, type CalendarSnapshot, type Instant } from './calendar';
import { dayNumberAt } from './zoned-date';

const DAY_MS = 86_400_000;
/** A calendar with no open day within a year is treated as invalid rather than looping. */
const MAX_LOOKAHEAD_DAYS = 366;

/** Business-date bucket for "1 per business day per request" quotas (C3, Part 6 §6.9/§6.14). */
export interface BusinessDateBucket {
  /** `YYYY-MM-DD` (Asia/Bangkok): the local date when it is open, else the next open date. */
  readonly businessDate: string;
  /** Whether `instant` itself falls on an open day of the calendar. */
  readonly isOpenDay: boolean;
}

function isoDate(dayNumber: number): string {
  return new Date(dayNumber * DAY_MS).toISOString().slice(0, 10);
}

/** The business date `instant` counts toward: its own local date if open, else the next open one. */
export function businessDateBucket(instant: Instant, calendar: CalendarSnapshot): BusinessDateBucket {
  if (!Number.isSafeInteger(instant)) throw new RangeError('instant must be an integer epoch-millisecond instant');
  const prepared = prepareCalendar(calendar);
  const today = dayNumberAt(prepared.formatter, instant);
  for (let day = today; day <= today + MAX_LOOKAHEAD_DAYS; day += 1) {
    if (prepared.isOpen(day)) return { businessDate: isoDate(day), isOpenDay: day === today };
  }
  throw new RangeError('calendar has no open business day within a year');
}
