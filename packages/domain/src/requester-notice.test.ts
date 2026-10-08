// A06 — “ผู้ขอยังไม่ได้รับแจ้ง” (Part 2 Addendum A1.2, Part 3 UI-15, FU-23): GM-only, built from the
// results of notices to the requester. It appears when the requester has no account (typed name), no
// usable channel, or a required notice ended `failed` / `delivery_unknown`; it is not cleared just
// because the GM completes, only by a later notice that reached the requester or by the requester
// opening the update in the web (A1.2: evidence of awareness).
import { describe, expect, it } from 'vitest';
import { NO_REQUESTER_NOTICE_ISSUE, noAccountNotice, requesterNoticeAfter, type RequesterNoticeState } from './index';

const AT = Date.parse('2026-12-28T09:00:00+07:00');
const fresh: RequesterNoticeState = NO_REQUESTER_NOTICE_ISSUE;

describe('requesterNoticeAfter', () => {
  it('starts with nothing to show', () => {
    expect(fresh).toEqual({ notifiedSeq: 0 });
  });

  it.each([
    ['failed', 'NO_CHANNEL', 'NO_CHANNEL'],
    ['failed', 'CHANNEL_DISABLED', 'DELIVERY_FAILED'],
    ['failed', 'PROVIDER_UNAVAILABLE', 'DELIVERY_FAILED'],
    ['delivery_unknown', 'LEASE_EXPIRED', 'DELIVERY_UNKNOWN'],
  ] as const)('a notice that ended %s (%s) → badge %s with the code and the step it was about', (state, code, reason) => {
    expect(requesterNoticeAfter(fresh, { kind: 'not_delivered', state, code, activitySeq: 3, at: AT })).toEqual({
      notifiedSeq: 0,
      issue: { reason, code, activitySeq: 3, at: AT },
    });
  });

  it('a later notice that reached the requester clears it; an earlier one does not', () => {
    const shown = requesterNoticeAfter(fresh, { kind: 'not_delivered', state: 'failed', code: 'NO_CHANNEL', activitySeq: 3, at: AT });
    expect(requesterNoticeAfter(shown, { kind: 'delivered', activitySeq: 2 })).toEqual({ notifiedSeq: 2, issue: shown.issue });
    expect(requesterNoticeAfter(shown, { kind: 'delivered', activitySeq: 4 })).toEqual({ notifiedSeq: 4 });
  });

  it('the requester opening that update in the web clears it (A1.2)', () => {
    const shown = requesterNoticeAfter(fresh, { kind: 'not_delivered', state: 'delivery_unknown', code: 'CONNECTION_LOST', activitySeq: 5, at: AT });
    expect(requesterNoticeAfter(shown, { kind: 'seen', activitySeq: 4 })).toEqual({ notifiedSeq: 4, issue: shown.issue });
    expect(requesterNoticeAfter(shown, { kind: 'seen', activitySeq: 5 })).toEqual({ notifiedSeq: 5 });
  });

  it('a failure about something the requester already knows of (a newer step reached them) shows nothing', () => {
    const informed = requesterNoticeAfter(fresh, { kind: 'delivered', activitySeq: 6 });
    expect(requesterNoticeAfter(informed, { kind: 'not_delivered', state: 'failed', code: 'PROVIDER_UNAVAILABLE', activitySeq: 5, at: AT })).toEqual(informed);
  });

  it('failures out of order keep the latest step', () => {
    const later = requesterNoticeAfter(fresh, { kind: 'not_delivered', state: 'failed', code: 'PROVIDER_UNAVAILABLE', activitySeq: 7, at: AT });
    expect(requesterNoticeAfter(later, { kind: 'not_delivered', state: 'failed', code: 'NO_CHANNEL', activitySeq: 6, at: AT + 1 })).toEqual(later);
  });
});

describe('noAccountNotice (a requester recorded by typed name, A1.3)', () => {
  it('shows from creation and is never cleared by deliveries or views', () => {
    const noAccount = noAccountNotice(1, AT);
    expect(noAccount).toEqual({ notifiedSeq: 0, issue: { reason: 'NO_ACCOUNT', activitySeq: 1, at: AT } });
    expect(requesterNoticeAfter(noAccount, { kind: 'delivered', activitySeq: 9 }).issue).toEqual(noAccount.issue);
    expect(requesterNoticeAfter(noAccount, { kind: 'seen', activitySeq: 9 }).issue).toEqual(noAccount.issue);
  });
});
