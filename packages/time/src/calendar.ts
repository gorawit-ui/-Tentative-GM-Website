/** A point in time as UTC epoch milliseconds (timestamps are stored in UTC, Part 6 §6.7). */
export type Instant = number;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Immutable copy of a work calendar taken when a clock starts (Part 6 §6.7: timezone,
 * weekday mask, holidays). Provenance (hash/source reference) belongs to the caller.
 */
export interface CalendarSnapshot {
  /** IANA time zone that defines where each calendar date starts and ends, e.g. Asia/Bangkok. */
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
