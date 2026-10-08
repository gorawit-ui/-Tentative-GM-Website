// S12 — read endpoints over the Admin SDK, which bypasses Rules: every one authenticates the caller
// (fresh access/{uid}) and applies the same domain predicates as the Rules (ACL matrix fixture).
// A request the caller may not read answers 404, like a missing one.
import { MAX_LIST_LIMIT, pageLimit, requesterNoticeFields, requesterNoticeStateOf, type RequestDetailDocument, type RequestRecord } from '@gm/contracts';
import { canReadRequestDetail, requesterNoticeAfter, type AccessViewer, type RequestAclFacts } from '@gm/domain';
import { fromStored, toStored } from '../firestore/admin-store';
import { authenticate, guarded } from './authenticate';
import type { ApiDeps } from './deps';
import { ApiError, notFound } from './errors';

export interface MyRequestCard {
  readonly request_id: string;
  readonly request_number: string;
  readonly summary_title: string;
  readonly status: string;
  readonly relation: 'requester' | 'related' | 'watcher';
  /** True when only the public summary may be shown (watchers, U1). */
  readonly summary_only: boolean;
  /** A06: “มีอัปเดตใหม่” — a step this person may see that they have not opened yet (D-A03-5). */
  readonly has_update: boolean;
  /** A06: the latest step this person may see (sent back to mark it seen). */
  readonly activity_seq: number;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function requireRequestId(requestId: string): void {
  if (!ID.test(requestId)) throw new ApiError(400, 'REQUEST_ID_INVALID');
}

export function aclFacts(request: Readonly<Record<string, unknown>>): RequestAclFacts {
  const list = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  return {
    ...(typeof request.requester_id === 'string' ? { requesterId: request.requester_id } : {}),
    relatedPersonIds: list(request.related_person_ids),
    // Missing flag = treated as confidential (fail closed), like the Rules.
    isConfidential: request.is_confidential !== false,
    confidentialGrantIds: list(request.confidential_grant_ids),
  };
}

/** The stored request if the viewer may read its detail; 404 otherwise. */
export async function readableRequest(deps: ApiDeps, viewer: AccessViewer, requestId: string): Promise<Readonly<Record<string, unknown>>> {
  requireRequestId(requestId);
  const snapshot = await deps.db.doc(`requests/${requestId}`).get();
  const request = snapshot.exists ? fromStored(snapshot.data() ?? {}) : undefined;
  if (request === undefined || !canReadRequestDetail(viewer, aclFacts(request))) throw notFound();
  return request;
}

export function getRequestDetail(deps: ApiDeps, idToken: string | undefined, requestId: string): Promise<RequestDetailDocument & { readonly request_id: string }> {
  return guarded(deps, 'request_detail.read', requestId, async () => {
    const { viewer } = await authenticate(deps, idToken);
    const request = await readableRequest(deps, viewer, requestId);
    return { ...(request as unknown as RequestDetailDocument), request_id: requestId };
  });
}

async function listChildren(deps: ApiDeps, idToken: string | undefined, requestId: string, child: 'history' | 'comments' | 'waiting_intervals', limit?: number) {
  return guarded(deps, `${child}.read`, requestId, async () => {
    const { viewer } = await authenticate(deps, idToken);
    await readableRequest(deps, viewer, requestId);
    const snapshot = await deps.db.collection(`requests/${requestId}/${child}`).limit(pageLimit(limit)).get();
    return snapshot.docs.map((document) => ({ id: document.id, ...fromStored(document.data()) }));
  });
}

export function listHistory(deps: ApiDeps, idToken: string | undefined, requestId: string, limit?: number) {
  return listChildren(deps, idToken, requestId, 'history', limit);
}

export function listComments(deps: ApiDeps, idToken: string | undefined, requestId: string, limit?: number) {
  return listChildren(deps, idToken, requestId, 'comments', limit);
}

/** A04: each waiting interval with its recipients and start / response / exit (Part 6 §6.4: detail access). */
export function listWaitingIntervals(deps: ApiDeps, idToken: string | undefined, requestId: string, limit?: number) {
  return listChildren(deps, idToken, requestId, 'waiting_intervals', limit);
}

const seqOf = (value: unknown) => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : 0);

const card = (
  requestId: string,
  data: Readonly<Record<string, unknown>>,
  relation: MyRequestCard['relation'],
  userState: Readonly<Record<string, unknown>>,
): MyRequestCard => ({
  request_id: requestId,
  request_number: String(data.request_number ?? ''),
  summary_title: String(data.summary_title ?? ''),
  status: String(data.status ?? ''),
  relation,
  summary_only: relation === 'watcher',
  has_update: seqOf(userState.activity_seq) > seqOf(userState.last_seen_activity_seq),
  activity_seq: seqOf(userState.activity_seq),
});

/**
 * “คำขอของฉัน” (both tabs): user_state references are re-checked against the request now — a reference
 * whose relation no longer holds, or that the person may no longer read, is left out (Part 6 §6.4).
 */
export function listMyRequests(deps: ApiDeps, idToken: string | undefined): Promise<readonly MyRequestCard[]> {
  return guarded(deps, 'my_requests.read', undefined, async () => {
    const { viewer } = await authenticate(deps, idToken);
    const refs = await deps.db.collection(`user_state/${viewer.personId}/requests`).limit(MAX_LIST_LIMIT).get();
    const cards: MyRequestCard[] = [];
    for (const ref of refs.docs) {
      const relation = ref.data().type;
      if (!ID.test(ref.id)) continue;
      if (relation === 'requester' || relation === 'related') {
        const snapshot = await deps.db.doc(`requests/${ref.id}`).get();
        if (!snapshot.exists) continue;
        const request = fromStored(snapshot.data() ?? {});
        const facts = aclFacts(request);
        const holds = relation === 'requester' ? facts.requesterId === viewer.personId : facts.relatedPersonIds.includes(viewer.personId);
        if (holds && canReadRequestDetail(viewer, facts)) cards.push(card(ref.id, request, relation, ref.data()));
      } else if (relation === 'watcher') {
        const [summary, gmDetail] = await Promise.all([deps.db.doc(`request_summaries/${ref.id}`).get(), deps.db.doc(`gm_request_details/${ref.id}`).get()]);
        const watchers = gmDetail.data()?.watcher_ids;
        if (summary.exists && Array.isArray(watchers) && watchers.includes(viewer.personId)) cards.push(card(ref.id, fromStored(summary.data() ?? {}), 'watcher', ref.data()));
      }
    }
    deps.log.info('my_requests.listed', { count: cards.length });
    return cards;
  });
}

/** D-S10-2: “มี X งานรอคุณยืนยัน” — completed, not closed, and I am the requester. */
export function countAwaitingConfirmation(deps: ApiDeps, idToken: string | undefined): Promise<{ readonly count: number }> {
  return guarded(deps, 'awaiting_confirmation.read', undefined, async () => {
    const { viewer } = await authenticate(deps, idToken);
    const snapshot = await deps.db
      .collection('requests')
      .where('requester_id', '==', viewer.personId)
      .where('status', '==', 'completed')
      .limit(MAX_LIST_LIMIT)
      .get();
    return { count: snapshot.docs.filter((document) => document.data().closed_at === undefined).length };
  });
}

/**
 * A06 — “เปิดดูแล้ว” (Part 2 Addendum A1.1, D-A03-5): the screen reports the step it showed after it
 * rendered successfully; only that much counts as read, so an event that arrived meanwhile keeps the
 * dot. Allowed only on one's own user_state reference whose relation still holds (requester / related
 * with access / watcher of a general request); anything else answers 404. When the requester opens
 * an update, that is evidence they know of it, so the GM badge “ผู้ขอยังไม่ได้รับแจ้ง” for that step
 * clears (A1.2).
 */
export function markSeen(
  deps: ApiDeps,
  idToken: string | undefined,
  requestId: string,
  input: { readonly activitySeq: number },
): Promise<{ readonly activity_seq: number; readonly last_seen_activity_seq: number; readonly has_update: boolean }> {
  return guarded(deps, 'request_seen.mark', requestId, async () => {
    const { viewer } = await authenticate(deps, idToken);
    requireRequestId(requestId);
    if (!Number.isSafeInteger(input.activitySeq) || input.activitySeq < 0) throw new ApiError(400, 'ACTIVITY_SEQ_INVALID');
    const db = deps.db;
    return db.runTransaction(async (transaction) => {
      const userStateRef = db.doc(`user_state/${viewer.personId}/requests/${requestId}`);
      const [userStateSnap, requestSnap, gmDetailSnap, gmSummarySnap] = await Promise.all([
        transaction.get(userStateRef),
        transaction.get(db.doc(`requests/${requestId}`)),
        transaction.get(db.doc(`gm_request_details/${requestId}`)),
        transaction.get(db.doc(`gm_request_summaries/${requestId}`)),
      ]);
      if (!userStateSnap.exists || !requestSnap.exists) throw notFound();
      const userState = fromStored(userStateSnap.data() ?? {});
      const request = fromStored(requestSnap.data() ?? {});
      const facts = aclFacts(request);
      const watchers = gmDetailSnap.data()?.watcher_ids;
      const holds =
        userState.type === 'requester'
          ? facts.requesterId === viewer.personId && canReadRequestDetail(viewer, facts)
          : userState.type === 'related'
            ? facts.relatedPersonIds.includes(viewer.personId) && canReadRequestDetail(viewer, facts)
            : userState.type === 'watcher' && !facts.isConfidential && Array.isArray(watchers) && watchers.includes(viewer.personId);
      if (!holds) throw notFound();
      const visible = seqOf(userState.activity_seq);
      const previous = seqOf(userState.last_seen_activity_seq);
      // Only what was shown counts, and never more than this person could see.
      const lastSeen = Math.max(previous, Math.min(input.activitySeq, visible));
      if (lastSeen !== previous) {
        transaction.set(userStateRef, toStored({ ...userState, last_seen_activity_seq: lastSeen, last_viewed_at: deps.now() }));
      }
      if (userState.type === 'requester' && gmDetailSnap.exists && lastSeen > 0) {
        const gmDetail = fromStored(gmDetailSnap.data() ?? {});
        const before = requesterNoticeStateOf(gmDetail as Pick<RequestRecord, 'requester_not_notified' | 'requester_notified_seq'>);
        const after = requesterNoticeFields(requesterNoticeAfter(before, { kind: 'seen', activitySeq: lastSeen }));
        if (JSON.stringify(after) !== JSON.stringify(requesterNoticeFields(before))) {
          const { requester_not_notified: _issue, requester_notified_seq: _seq, ...rest } = gmDetail;
          transaction.set(db.doc(`gm_request_details/${requestId}`), toStored({ ...rest, ...after }));
          if (gmSummarySnap.exists) {
            const { requester_not_notified: _shown, ...summary } = fromStored(gmSummarySnap.data() ?? {});
            transaction.set(
              db.doc(`gm_request_summaries/${requestId}`),
              toStored({ ...summary, ...(after.requester_not_notified === undefined ? {} : { requester_not_notified: after.requester_not_notified }) }),
            );
          }
        }
      }
      return { activity_seq: visible, last_seen_activity_seq: lastSeen, has_update: visible > lastSeen };
    });
  });
}
