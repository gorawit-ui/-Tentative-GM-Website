import { HOUR_MS, type Instant } from './calendar';

/** U3: “7 วันล่าสุด” is a rolling 168 hours (not business days) for closed/cancelled cards. */
export const BOARD_RECENT_WINDOW_MS = 7 * 24 * HOUR_MS;

/** Instant after which a close/cancel is still “recent” (`closed_at > cutoff` stays on the live board). */
export function boardRecentCutoff(_now: Instant): Instant {
  throw new Error('boardRecentCutoff: not implemented yet (S09)');
}
