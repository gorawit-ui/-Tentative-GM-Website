// Current work (“กำลังทำตอนนี้”) of a GM (S07: C7, F06 last bullets, F07, Part 6 §6.6).
// Pinning changes only the GM profile, never the request, so it is not progress (D-S05-3).
import type { Instant } from '@gm/time';
import type { RequestStatus } from './command-guards';
import type { GmProfile } from './presence';
import type { Actor } from './request-creation';

export const NO_CURRENT_WORK_LABEL = 'ยังไม่มีงานที่กำลังทำ';
export const INTERNAL_WORK_LABEL = 'งานภายใน';

/** The request facts focus rules need (latest state, read by the caller). */
export interface FocusRequest {
  readonly id: string;
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

function notImplemented(name: string): never {
  throw new Error(`${name}: not implemented yet (S07)`);
}

export function setFocus<P extends GmProfile>(
  _profile: P,
  _command: { readonly actor: Actor; readonly now: Instant; readonly request: FocusRequest },
): { readonly profile: P; readonly event: FocusEvent } {
  return notImplemented('setFocus');
}

export function releaseFocusIfEnded<P extends GmProfile>(
  _profile: P,
  _request: FocusRequest,
  _now: Instant,
): { readonly profile: P; readonly event?: FocusEvent } {
  return notImplemented('releaseFocusIfEnded');
}

export function currentWork(
  _profile: GmProfile,
  _context: {
    readonly requests: readonly CurrentWorkCandidate[];
    readonly viewerCanSeeDetail: (request: CurrentWorkCandidate) => boolean;
  },
): CurrentWork {
  return notImplemented('currentWork');
}
