import type { CalendarSnapshot, Instant } from './calendar';

/** Business-date bucket for "1 per business day per request" quotas (C3, Part 6 §6.9/§6.14). */
export interface BusinessDateBucket {
  /** `YYYY-MM-DD` (Asia/Bangkok): the local date when it is open, else the next open date. */
  readonly businessDate: string;
  /** Whether `instant` itself falls on an open day of the calendar. */
  readonly isOpenDay: boolean;
}

export function businessDateBucket(_instant: Instant, _calendar: CalendarSnapshot): BusinessDateBucket {
  throw new Error('businessDateBucket: not implemented yet (S06)');
}
