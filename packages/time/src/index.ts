// @gm/time — pure business-time functions (Part 6 §6.7, TEST-CHECKLIST §1).
// Every calculation receives instants, durations and calendar snapshots as arguments;
// no Firestore/HTTP and no wall-clock reads inside a calculation.
export {
  BUSINESS_DAY_MS,
  HOUR_MS,
  type CalendarSnapshot,
  type DurationUnit,
  type Instant,
  type IsoWeekday,
} from './calendar';
export { addBusinessDuration, addDuration, businessDuration } from './business-time';
