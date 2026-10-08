// A06 — “ผู้ขอยังไม่ได้รับแจ้ง” (Part 2 Addendum A1.2/A1.3, Part 3 UI-15, FU-23), GM only. Built from
// what happened to the notices meant for the requester, each tagged with the request's unread step
// (`activity_seq`) it was about:
//   - a requester recorded by typed name has no account → shown from creation, never cleared here
//     (only a real contact record will, later);
//   - a notice that ended `failed` (incl. NO_CHANNEL) or `delivery_unknown` → shown, unless a later
//     step already reached the requester;
//   - a later notice that reached the requester, or the requester opening that update in the web
//     (A1.2: evidence of awareness), clears it. The GM completing the request does not.
import type { Instant } from '@gm/time';

export type RequesterNoticeReason = 'NO_ACCOUNT' | 'NO_CHANNEL' | 'DELIVERY_FAILED' | 'DELIVERY_UNKNOWN';

export interface RequesterNoticeIssue {
  readonly reason: RequesterNoticeReason;
  /** The outbox `last_error_code` behind it (absent for NO_ACCOUNT). */
  readonly code?: string;
  /** The latest unread step the requester has not been told about. */
  readonly activitySeq: number;
  readonly at: Instant;
}

export interface RequesterNoticeState {
  /** Highest unread step known to have reached the requester (delivered or opened in the web). */
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

export const NO_REQUESTER_NOTICE_ISSUE: RequesterNoticeState = { notifiedSeq: 0 };

export function noAccountNotice(activitySeq: number, at: Instant): RequesterNoticeState {
  return { notifiedSeq: 0, issue: { reason: 'NO_ACCOUNT', activitySeq, at } };
}

function reasonOf(state: 'failed' | 'delivery_unknown', code: string): RequesterNoticeReason {
  if (state === 'delivery_unknown') return 'DELIVERY_UNKNOWN';
  return code === 'NO_CHANNEL' ? 'NO_CHANNEL' : 'DELIVERY_FAILED';
}

export function requesterNoticeAfter(state: RequesterNoticeState, observation: RequesterNoticeObservation): RequesterNoticeState {
  if (observation.kind === 'not_delivered') {
    if (state.issue?.reason === 'NO_ACCOUNT') return state;
    // The requester already knows of this step or a later one.
    if (observation.activitySeq <= state.notifiedSeq) return state;
    // Out of order: an older failure never replaces the badge of a later step.
    if (state.issue !== undefined && state.issue.activitySeq > observation.activitySeq) return state;
    return {
      notifiedSeq: state.notifiedSeq,
      issue: { reason: reasonOf(observation.state, observation.code), code: observation.code, activitySeq: observation.activitySeq, at: observation.at },
    };
  }
  const notifiedSeq = Math.max(state.notifiedSeq, observation.activitySeq);
  const { issue } = state;
  if (issue === undefined) return { notifiedSeq };
  if (issue.reason !== 'NO_ACCOUNT' && issue.activitySeq <= notifiedSeq) return { notifiedSeq };
  return { notifiedSeq, issue };
}
