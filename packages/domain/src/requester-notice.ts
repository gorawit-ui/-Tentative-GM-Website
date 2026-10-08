// A06 stub — implemented after the failing tests are committed.
import type { Instant } from '@gm/time';

export type RequesterNoticeReason = 'NO_ACCOUNT' | 'NO_CHANNEL' | 'DELIVERY_FAILED' | 'DELIVERY_UNKNOWN';

export interface RequesterNoticeIssue {
  readonly reason: RequesterNoticeReason;
  readonly code?: string;
  readonly activitySeq: number;
  readonly at: Instant;
}

export interface RequesterNoticeState {
  readonly notifiedSeq: number;
  readonly issue?: RequesterNoticeIssue;
}

export type RequesterNoticeObservation =
  | { readonly kind: 'delivered' | 'seen'; readonly activitySeq: number }
  | {
      readonly kind: 'not_delivered';
      readonly state: 'failed' | 'delivery_unknown';
      readonly code: string;
      readonly activitySeq: number;
      readonly at: Instant;
    };

export const NO_REQUESTER_NOTICE_ISSUE: RequesterNoticeState = {} as RequesterNoticeState;

export function requesterNoticeAfter(_state: RequesterNoticeState, _observation: RequesterNoticeObservation): RequesterNoticeState {
  throw new Error('not implemented');
}

export function noAccountNotice(_activitySeq: number, _at: Instant): RequesterNoticeState {
  throw new Error('not implemented');
}
