// Live board sections (S09: U3, Part 6 §6.11). Pure: the 168-hour window comes from @gm/time.
import type { Instant } from '@gm/time';
import type { RequestStatus } from './command-guards';

export type BoardSection = 'open' | 'awaiting_confirmation' | 'recently_closed' | 'recently_cancelled' | 'archived';

export interface BoardFacts {
  readonly status: RequestStatus;
  readonly closedAt?: Instant | undefined;
  readonly cancelledAt?: Instant | undefined;
}

export function boardSection(_request: BoardFacts, _now: Instant): BoardSection {
  throw new Error('boardSection: not implemented yet (S09)');
}

export function isOnLiveBoard(_request: BoardFacts, _now: Instant): boolean {
  throw new Error('isOnLiveBoard: not implemented yet (S09)');
}
