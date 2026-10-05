// Watching an existing repair instead of reporting it again (S08: U1, Part 6 §6.4.2/§6.6
// `watchRequest`). Pure. Notes/photos, notifications and the public watcher count are A13.
import type { Instant } from '@gm/time';
import { reject, requireWritable, type RequestStatus } from './command-guards';
import type { Actor, RequestType } from './request-creation';

/** The request facts the watch rule needs (latest state, read in the same transaction). */
export interface WatchState {
  readonly type: RequestType;
  readonly source: 'web' | 'trello';
  readonly status: RequestStatus;
  readonly closedAt?: Instant;
  readonly isConfidential: boolean;
  readonly requesterId?: string;
  /** `watcher_ids`: unique accounts, separate from `related_person_ids` (no detail access). */
  readonly watcherIds: readonly string[];
}

export type WatchOutcome = 'added' | 'already_watching' | 'is_requester';

const WATCHABLE_STATUSES: readonly RequestStatus[] = ['queued', 'in_progress', 'waiting'];

/**
 * Adds the employee to `watcher_ids` once. Only open, non-confidential maintenance requests (U1);
 * the real requester is not an extra reporter. Nothing else changes: no new request or number, no
 * related person, and `last_updated_at` stays (watching is not GM progress).
 */
export function watchRequest<S extends WatchState>(
  _state: S,
  _command: { readonly actor: Actor },
): { readonly state: S; readonly outcome: WatchOutcome } {
  void reject;
  void requireWritable;
  void WATCHABLE_STATUSES;
  throw new Error('not implemented yet (S08)');
}
