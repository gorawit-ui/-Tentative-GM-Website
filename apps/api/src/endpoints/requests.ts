// S12 — read endpoints over the Admin SDK, which bypasses Rules: every one authenticates the caller
// (fresh access/{uid}) and applies the same domain predicates as the Rules (ACL matrix fixture).
// A request the caller may not read answers 404, like a missing one.
import { MAX_LIST_LIMIT, pageLimit, type RequestDetailDocument } from '@gm/contracts';
import { canReadRequestDetail, type AccessViewer, type RequestAclFacts } from '@gm/domain';
import { fromStored } from '../firestore/admin-store';
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

async function listChildren(deps: ApiDeps, idToken: string | undefined, requestId: string, child: 'history' | 'comments', limit?: number) {
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

const card = (requestId: string, data: Readonly<Record<string, unknown>>, relation: MyRequestCard['relation']): MyRequestCard => ({
  request_id: requestId,
  request_number: String(data.request_number ?? ''),
  summary_title: String(data.summary_title ?? ''),
  status: String(data.status ?? ''),
  relation,
  summary_only: relation === 'watcher',
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
        if (holds && canReadRequestDetail(viewer, facts)) cards.push(card(ref.id, request, relation));
      } else if (relation === 'watcher') {
        const [summary, gmDetail] = await Promise.all([deps.db.doc(`request_summaries/${ref.id}`).get(), deps.db.doc(`gm_request_details/${ref.id}`).get()]);
        const watchers = gmDetail.data()?.watcher_ids;
        if (summary.exists && Array.isArray(watchers) && watchers.includes(viewer.personId)) cards.push(card(ref.id, fromStored(summary.data() ?? {}), 'watcher'));
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
