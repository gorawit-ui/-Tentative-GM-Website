// @gm/time — pure business-time functions (Part 6 §6.7, TEST-CHECKLIST §1).
// Every calculation receives instants, durations and calendar snapshots as arguments;
// no Firestore/HTTP and no wall-clock reads inside a calculation.
export {
  BUSINESS_DAY_MS,
  HOUR_MS,
  snapshotCalendar,
  type CalendarSnapshot,
  type DurationUnit,
  type Instant,
  type IsoWeekday,
} from './calendar';
export { addBusinessDuration, addDuration, businessDuration } from './business-time';
export { autoCloseDue, isAutoCloseDue, staleState, type StaleState } from './lifecycle-clocks';
export { businessDateBucket, type BusinessDateBucket } from './business-date';
export { formatBusinessDuration, type DurationTextContext } from './display';
export {
  mergeIntervals, effectiveWaitingEnd, waitingElapsed, slaElapsed,
  type TimeInterval, type WaitingInterval, type SlaClock,
} from './waiting-time';
