import type { CalendarSnapshot, Instant } from './calendar';

export interface StaleState {
  /** Raw business milliseconds since `lastUpdatedAt`; never rounded. */
  readonly elapsed: number;
  /** The instant at which exactly 3 business days have accumulated; stale strictly after it. */
  readonly thresholdAt: Instant;
  readonly stale: boolean;
}

export function staleState(_lastUpdatedAt: Instant, _now: Instant, _calendar: CalendarSnapshot): StaleState {
  throw new Error('staleState: not implemented yet (S03)');
}

export function autoCloseDue(_completedAt: Instant, _calendar: CalendarSnapshot): Instant {
  throw new Error('autoCloseDue: not implemented yet (S03)');
}

export function isAutoCloseDue(_completedAt: Instant, _now: Instant, _calendar: CalendarSnapshot): boolean {
  throw new Error('isAutoCloseDue: not implemented yet (S03)');
}
