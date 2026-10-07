// Live board sections (S09: U3, Part 6 §6.11). Pure: the 168-hour window comes from @gm/time.
import { boardRecentCutoff, type Instant } from '@gm/time';
import type { RequestStatus } from './command-guards';

export type BoardSection = 'open' | 'awaiting_confirmation' | 'recently_closed' | 'recently_cancelled' | 'archived';

export interface BoardFacts {
  readonly status: RequestStatus;
  readonly closedAt?: Instant | undefined;
  readonly cancelledAt?: Instant | undefined;
}

/**
 * U3: open statuses always; `completed` without `closed_at` always (awaiting confirmation);
 * closed/cancelled while `closed_at`/`cancelled_at` is within the last 168 hours; otherwise archived
 * (paginated history, no live listener). A reopened request follows its current status.
 */
export function boardSection(request: BoardFacts, now: Instant): BoardSection {
  const cutoff = boardRecentCutoff(now);
  switch (request.status) {
    case 'queued':
    case 'in_progress':
    case 'waiting':
      return 'open';
    case 'completed':
      if (request.closedAt === undefined) return 'awaiting_confirmation';
      return request.closedAt > cutoff ? 'recently_closed' : 'archived';
    case 'cancelled':
      if (request.cancelledAt === undefined) throw new Error('a cancelled request must have cancelled_at');
      return request.cancelledAt > cutoff ? 'recently_cancelled' : 'archived';
  }
}

export function isOnLiveBoard(request: BoardFacts, now: Instant): boolean {
  return boardSection(request, now) !== 'archived';
}
