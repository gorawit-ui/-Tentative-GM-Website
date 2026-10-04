import { addBusinessDuration, businessDuration } from './business-time';
import { BUSINESS_DAY_MS, type CalendarSnapshot, type Instant } from './calendar';

/** Stale once MORE than this has accumulated since last_updated_at (Part 6 §6.7: "เกิน 3 วันทำการ"). */
export const STALE_AFTER_MS = 3 * BUSINESS_DAY_MS;
/** Auto-close once AT LEAST this has accumulated since completed_at (C5, Part 6 §6.7: "ครบ 3 วันทำการ"). */
export const AUTO_CLOSE_AFTER_MS = 3 * BUSINESS_DAY_MS;

export interface StaleState {
  /** Raw business milliseconds since `lastUpdatedAt`; never rounded. */
  readonly elapsed: number;
  /** The instant at which exactly 3 business days have accumulated; stale strictly after it. */
  readonly thresholdAt: Instant;
  readonly stale: boolean;
}

/**
 * Stale clock from `last_updated_at`. Only the time arithmetic lives here: which statuses can be
 * stale (`queued`/`in_progress`/`waiting`) and what resets `last_updated_at` belong to @gm/domain.
 * `waiting` does not pause this clock.
 */
export function staleState(lastUpdatedAt: Instant, now: Instant, calendar: CalendarSnapshot): StaleState {
  const elapsed = businessDuration(lastUpdatedAt, now, calendar);
  return {
    elapsed,
    thresholdAt: addBusinessDuration(lastUpdatedAt, STALE_AFTER_MS, calendar),
    stale: elapsed > STALE_AFTER_MS,
  };
}

/** `auto_close_due_at` = completed_at + 3 business days on the given (snapshot) calendar. */
export function autoCloseDue(completedAt: Instant, calendar: CalendarSnapshot): Instant {
  return addBusinessDuration(completedAt, AUTO_CLOSE_AFTER_MS, calendar);
}

/** Whether 3 business days have fully accumulated since `completedAt` at `now` (inclusive). */
export function isAutoCloseDue(completedAt: Instant, now: Instant, calendar: CalendarSnapshot): boolean {
  return businessDuration(completedAt, now, calendar) >= AUTO_CLOSE_AFTER_MS;
}
