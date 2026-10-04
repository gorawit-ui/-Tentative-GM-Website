import type { CalendarSnapshot, DurationUnit, Instant } from './calendar';

/** Business milliseconds between `start` and `end` (only time on open dates counts). */
export function businessDuration(_start: Instant, _end: Instant, _calendar: CalendarSnapshot): number {
  throw new Error('businessDuration: not implemented yet (S01)');
}

/** The instant at which `duration` business milliseconds have accumulated after `start`. */
export function addBusinessDuration(_start: Instant, _duration: number, _calendar: CalendarSnapshot): Instant {
  throw new Error('addBusinessDuration: not implemented yet (S01)');
}

/** Adds `amount` days in the given unit (C8: business_days or continuous_24h). */
export function addDuration(
  _start: Instant,
  _amount: number,
  _unit: DurationUnit,
  _calendar: CalendarSnapshot,
): Instant {
  throw new Error('addDuration: not implemented yet (S01)');
}
