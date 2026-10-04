import { isoWeekday, parseIsoDate, zonedFormatter } from './zoned-date';

/** A point in time as UTC epoch milliseconds (timestamps are stored in UTC, Part 6 §6.7). */
export type Instant = number;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Immutable copy of a work calendar taken when a clock starts (Part 6 §6.7: timezone,
 * weekday mask, holidays). Provenance (hash/source reference) belongs to the caller.
 */
export interface CalendarSnapshot {
  /** Phase 1 accepts Asia/Bangkok only (D-S01-5). */
  readonly timeZone: string;
  /** Weekdays that are open for business. */
  readonly openWeekdays: readonly IsoWeekday[];
  /** Closed dates, date-only `YYYY-MM-DD` in the Gregorian (ค.ศ.) calendar. */
  readonly holidays: readonly string[];
}

/** SLA/clock units from C8. */
export type DurationUnit = 'business_days' | 'continuous_24h';

export const HOUR_MS = 3_600_000;
/** One business day = 24 hours accumulated on open dates — not an 8-hour shift (PRD §6.1, C5). */
export const BUSINESS_DAY_MS = 24 * HOUR_MS;

/** A validated calendar ready for date-by-date evaluation. */
export interface PreparedCalendar {
  readonly formatter: Intl.DateTimeFormat;
  isOpen(dayNumber: number): boolean;
}

/** Validates a snapshot; anything unexpected throws RangeError instead of being guessed. */
export function prepareCalendar(calendar: CalendarSnapshot): PreparedCalendar {
  if (calendar.timeZone !== 'Asia/Bangkok') {
    throw new RangeError('calendar.timeZone must be Asia/Bangkok in Phase 1');
  }
  const formatter = zonedFormatter(calendar.timeZone);

  const weekdays = calendar.openWeekdays;
  if (
    !Array.isArray(weekdays) ||
    weekdays.length === 0 ||
    !weekdays.every((day) => Number.isInteger(day) && day >= 1 && day <= 7) ||
    new Set(weekdays).size !== weekdays.length
  ) {
    throw new RangeError('calendar.openWeekdays must list distinct ISO weekdays 1–7, at least one');
  }
  const open = new Set<number>(weekdays);

  if (!Array.isArray(calendar.holidays)) {
    throw new RangeError('calendar.holidays must be an array of Gregorian YYYY-MM-DD dates');
  }
  const holidays = new Set<number>();
  for (const holiday of calendar.holidays) {
    const dayNumber = typeof holiday === 'string' ? parseIsoDate(holiday) : undefined;
    if (dayNumber === undefined) {
      throw new RangeError(`calendar.holidays must be real YYYY-MM-DD dates, got ${JSON.stringify(holiday)}`);
    }
    const year = Number(holiday.slice(0, 4));
    if (year < 2000 || year > 2100) {
      throw new RangeError(`calendar.holidays year must be ค.ศ. 2000–2100; got ${holiday}, น่าจะกรอกเป็น พ.ศ. — convert and confirm in Admin/import`);
    }
    holidays.add(dayNumber);
  }

  return {
    formatter,
    isOpen: (dayNumber) => open.has(isoWeekday(dayNumber)) && !holidays.has(dayNumber),
  };
}
