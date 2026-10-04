import type { CalendarSnapshot, DurationUnit, Instant } from './calendar';

/** Closed half-open interval [start, end), in UTC epoch milliseconds. */
export interface TimeInterval { readonly start: Instant; readonly end: Instant }
/** Calculation input only; persisted timestamp mapping belongs to contracts/callers. */
export interface WaitingInterval {
  readonly startedAt: Instant;
  readonly respondedAt?: Instant;
  readonly exitedAt?: Instant;
}
/** The caller supplies the immutable SLA calendar and the milestone stop, if reached. */
export interface SlaClock {
  readonly startedAt: Instant;
  readonly stoppedAt?: Instant;
  readonly unit: DurationUnit;
  readonly calendarSnapshot: CalendarSnapshot;
  readonly waitingIntervals: readonly WaitingInterval[];
}

export function mergeIntervals(_intervals: readonly TimeInterval[]): TimeInterval[] { throw new Error('S02 not implemented'); }
export function effectiveWaitingEnd(_interval: WaitingInterval, _now: Instant): Instant { throw new Error('S02 not implemented'); }
export function waitingElapsed(_interval: WaitingInterval, _now: Instant, _unit: DurationUnit, _calendar: CalendarSnapshot): number { throw new Error('S02 not implemented'); }
export function slaElapsed(_request: SlaClock, _now: Instant): number { throw new Error('S02 not implemented'); }
