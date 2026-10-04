import type { Instant } from './calendar';

/** The Asia/Bangkok calendar date (`YYYY-MM-DD`) of an instant (C7/A3 use Bangkok days). */
export function bangkokDateOf(_instant: Instant): string {
  throw new Error('bangkokDateOf: not implemented yet (S07)');
}

/**
 * When a presence set at `setAt` stops applying (C7, A3): the start of the next Bangkok day, or,
 * for leave with an end date, the start of the day after `leaveEndsOn` (inclusive end date).
 */
export function presenceExpiresAt(_setAt: Instant, _leaveEndsOn?: string): Instant {
  throw new Error('presenceExpiresAt: not implemented yet (S07)');
}
