// Current work (“กำลังทำตอนนี้”) of a GM (S07: C7, F07, Part 6 §6.6; D-S07-6/7).
// Pinning changes only the GM profile, never the request, so it is not progress (D-S05-3).
// A pin lives only while the request is in_progress (D-S07-6); Trello cards are read-only (D-S07-7).
import type { Instant } from '@gm/time';
import type { RequestStatus } from './command-guards';
import { reject, requireWritable } from './command-guards';
import { requireProfileOwner, type GmProfile } from './presence';
import type { Actor } from './request-creation';

export const NO_CURRENT_WORK_LABEL = 'ยังไม่มีงานที่กำลังทำ';
export const INTERNAL_WORK_LABEL = 'งานภายใน';

/** The request facts focus rules need (latest state, read by the caller). */
export interface FocusRequest {
  readonly id: string;
  readonly source: 'web' | 'trello';
  readonly status: RequestStatus;
  readonly closedAt?: Instant;
}

export interface CurrentWorkCandidate extends FocusRequest {
  readonly summaryTitle: string;
  readonly isConfidential: boolean;
  readonly assigneeId?: string;
  readonly lastUpdatedAt: Instant;
}

export type CurrentWork =
  | {
      readonly kind: 'pinned' | 'latest_in_progress';
      readonly requestId: string;
      readonly summaryTitle: string;
      readonly status: RequestStatus;
    }
  | { readonly kind: 'internal'; readonly label: typeof INTERNAL_WORK_LABEL }
  | { readonly kind: 'none'; readonly label: typeof NO_CURRENT_WORK_LABEL };

export type FocusEvent =
  | {
      readonly kind: 'focus_set';
      readonly at: Instant;
      readonly actorId: string;
      readonly personId: string;
      readonly requestId: string;
      readonly previousRequestId?: string;
    }
  | { readonly kind: 'focus_released'; readonly at: Instant; readonly personId: string; readonly requestId: string };

/** D-S07-6: only an in-progress request can be, or stay, pinned. */
function isInProgress(request: FocusRequest): boolean {
  // S07 behaviour until D-S07-6 is implemented: only closed or cancelled ends a pin.
  return request.status !== 'cancelled' && request.closedAt === undefined;
}

/** “กำลังทำตอนนี้”: pin one in-progress web request, replacing the previous pin. */
export function setFocus<P extends GmProfile>(
  profile: P,
  command: { readonly actor: Actor; readonly now: Instant; readonly request: FocusRequest },
): { readonly profile: P; readonly event: FocusEvent } {
  requireProfileOwner(command.actor, profile);
  const { request } = command;
  void requireWritable;
  if (request.status !== 'in_progress') reject('FOCUS_NOT_IN_PROGRESS', 'Only an in-progress request can be pinned');
  const previous = profile.focusRequestId;
  return {
    profile: { ...profile, focusRequestId: request.id },
    event: {
      kind: 'focus_set',
      at: command.now,
      actorId: command.actor.personId,
      personId: profile.personId,
      requestId: request.id,
      ...(previous === undefined || previous === request.id ? {} : { previousRequestId: previous }),
    },
  };
}

/**
 * D-S07-6: unpin as soon as the pinned request leaves in_progress — waiting for someone else, back
 * in the queue, completed (also while awaiting confirmation) or cancelled. Resuming work does not
 * pin it again; the GM pins it again if they want.
 */
export function releaseFocusIfNotInProgress<P extends GmProfile>(
  profile: P,
  request: FocusRequest,
  now: Instant,
): { readonly profile: P; readonly event?: FocusEvent } {
  if (profile.focusRequestId !== request.id || isInProgress(request)) return { profile };
  const { focusRequestId: _released, ...rest } = profile;
  return {
    profile: rest as P,
    event: { kind: 'focus_released', at: now, personId: profile.personId, requestId: request.id },
  };
}

/**
 * C7 order: pinned (still in progress, D-S07-6) → this GM's in-progress request with the latest
 * `last_updated_at` → none.
 * A secret request the viewer cannot open is shown only as “งานภายใน”, without id or title.
 */
export function currentWork(
  profile: GmProfile,
  context: {
    readonly requests: readonly CurrentWorkCandidate[];
    readonly viewerCanSeeDetail: (request: CurrentWorkCandidate) => boolean;
  },
): CurrentWork {
  const pinned = context.requests.find((request) => request.id === profile.focusRequestId && isInProgress(request));
  const latest = context.requests
    .filter((request) => request.status === 'in_progress' && isInProgress(request) && request.assigneeId === profile.personId)
    .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt || a.id.localeCompare(b.id))[0];
  const shown = pinned ?? latest;
  if (shown === undefined) return { kind: 'none', label: NO_CURRENT_WORK_LABEL };
  if (shown.isConfidential && !context.viewerCanSeeDetail(shown)) return { kind: 'internal', label: INTERNAL_WORK_LABEL };
  return {
    kind: shown === pinned ? 'pinned' : 'latest_in_progress',
    requestId: shown.id,
    summaryTitle: shown.summaryTitle,
    status: shown.status,
  };
}
