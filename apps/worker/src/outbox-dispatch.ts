// A02 / D-A01-3 — send one outbox entry, exactly once as far as this system can tell (Part 6 §6.10).
//   1. claim (one transaction): re-read the entry; only a due `pending` entry is claimed. The same
//      transaction rechecks what the send depends on — the request still exists and, for a creation
//      notice, is not cancelled (else `suppressed`); the recipient's channel from the directory as it
//      is now (A1.2; none → `failed` NO_CHANNEL) — and marks the entry `processing` under a lease with
//      the channel it is about to use.
//   2. send through the adapter (local/disabled until A07/A08), outside any transaction.
//   3. settle (one transaction): only if the lease is still ours, write the result: provider ID, or
//      back-off / `failed` / `delivery_unknown`.
// Another pickup of the same entry (Cloud Task + tick, duplicate task) finds it leased or settled and
// does nothing. A `processing` entry whose lease ran out means a worker died mid-send: the provider
// may have it, so it becomes `delivery_unknown` for the GM to check — never sent a second time.
// A03: watcher notices (status changes, U1) are suppressed once the request is confidential.
// A06: a status notice overtaken by a newer one to the same person on the same request is suppressed
// (D-A03-7); results of notices to the requester update the GM-only “ผู้ขอยังไม่ได้รับแจ้ง” badge
// (gm_request_details + gm_request_summaries) in the same transaction.
import { STATUS_NOTICE_KINDS } from '@gm/api/commands';
import { requesterNoticeFields, requesterNoticeStateOf, type RequestRecord } from '@gm/contracts';
import {
  DELIVERY_LEASE_MS,
  chooseDeliveryChannel,
  claimDelivery,
  isDeliveryState,
  requesterNoticeAfter,
  settleDelivery,
  type RequesterNoticeObservation,
  type DeliveryOutcome,
  type DeliverySettlement,
  type DeliveryState,
} from '@gm/domain';
import { addElapsed, type Instant } from '@gm/time';
import type { OutboundMessage } from './adapters';
import type { WorkerDeps } from './deps';
import type { StoredData, WorkerTransaction } from './store';

export const OUTBOX_COLLECTION = 'outbox';

export type DispatchResult = 'sent' | 'retry' | 'failed' | 'unknown' | 'suppressed' | 'skipped' | 'lease_lost';

/** Event kinds whose notice is pointless once the request is cancelled (Part 6 §6.9: no cancel/supersede sends). */
const MOOT_WHEN_CANCELLED: ReadonlySet<string> = new Set(['request_created']);

interface Entry {
  readonly revision: number;
  readonly activitySeq: number;
  readonly state: DeliveryState;
  readonly requestId: string;
  readonly recipientId: string;
  readonly eventKind: string;
  readonly audience: 'gm' | 'requester' | 'watcher';
  readonly requestNumber: string;
  readonly confidential: boolean;
  readonly attempts: number;
  readonly nextAttemptAt: Instant;
  readonly leaseUntil?: Instant;
}

function stateOf(stored: StoredData): DeliveryState | undefined {
  return isDeliveryState(stored.state) ? stored.state : undefined;
}

const text = (value: unknown): string | undefined => (typeof value === 'string' && value !== '' ? value : undefined);

function parseEntry(stored: StoredData): Entry | undefined {
  const state = stateOf(stored);
  const requestId = text(stored.request_id);
  const recipientId = text(stored.recipient_id);
  const eventKind = text(stored.event_kind);
  const requestNumber = text(stored.request_number);
  const audience = stored.audience === 'requester' || stored.audience === 'gm' || stored.audience === 'watcher' ? stored.audience : undefined;
  const attempts = Number.isSafeInteger(stored.attempts) ? (stored.attempts as number) : undefined;
  const nextAttemptAt = Number.isSafeInteger(stored.next_attempt_at) ? (stored.next_attempt_at as number) : undefined;
  if (
    state === undefined ||
    requestId === undefined ||
    recipientId === undefined ||
    eventKind === undefined ||
    requestNumber === undefined ||
    audience === undefined ||
    attempts === undefined ||
    nextAttemptAt === undefined
  ) {
    return undefined;
  }
  // Entries written before A06 carry neither: the creation notice is revision / step 1.
  const revision = Number.isSafeInteger(stored.revision) ? (stored.revision as number) : 1;
  return {
    revision,
    activitySeq: Number.isSafeInteger(stored.activity_seq) ? (stored.activity_seq as number) : revision,
    state,
    requestId,
    recipientId,
    eventKind,
    audience,
    requestNumber,
    confidential: stored.confidential === true,
    attempts,
    nextAttemptAt,
    ...(Number.isSafeInteger(stored.lease_until) ? { leaseUntil: stored.lease_until as number } : {}),
  };
}

/** The stored entry without the fields of a running or previous attempt. */
function withoutAttempt(stored: StoredData): Record<string, unknown> {
  const { lease_id: _leaseId, lease_until: _leaseUntil, last_error_code: _code, provider_id: _provider, ...rest } = stored;
  return rest;
}

/** Final or back-off state written on the entry (D-A01-3: the channel used stays on it). */
function settledEntry(stored: StoredData, settlement: DeliverySettlement, attemptedAt: Instant): Record<string, unknown> {
  return {
    ...withoutAttempt(stored),
    state: settlement.state,
    // Pending again: when to retry. Final: the time of the attempt that settled it.
    next_attempt_at: settlement.nextAttemptAt ?? attemptedAt,
    ...(settlement.providerId === undefined ? {} : { provider_id: settlement.providerId }),
    ...(settlement.errorCode === undefined ? {} : { last_error_code: settlement.errorCode }),
  };
}

function resultOf(settlement: DeliverySettlement): DispatchResult {
  switch (settlement.state) {
    case 'provider_accepted':
      return 'sent';
    case 'pending':
      return 'retry';
    case 'delivery_unknown':
      return 'unknown';
    case 'suppressed':
      return 'suppressed';
    default:
      return 'failed';
  }
}

/** The badge documents of one request, read inside the transaction before any write. */
interface BadgeDocuments {
  readonly requestId: string;
  readonly detail: StoredData | undefined;
  readonly summary: StoredData | undefined;
}

async function readBadge(transaction: WorkerTransaction, requestId: string): Promise<BadgeDocuments> {
  return {
    requestId,
    detail: await transaction.get(`gm_request_details/${requestId}`),
    summary: await transaction.get(`gm_request_summaries/${requestId}`),
  };
}

/** What a settled requester notice says about the badge; nothing for retries and suppressed notices. */
function observationOf(entry: Pick<Entry, 'activitySeq'>, settlement: DeliverySettlement, at: Instant): RequesterNoticeObservation | undefined {
  if (settlement.state === 'provider_accepted') return { kind: 'delivered', activitySeq: entry.activitySeq };
  if (settlement.state === 'failed' || settlement.state === 'delivery_unknown') {
    return { kind: 'not_delivered', state: settlement.state, code: settlement.errorCode ?? 'UNKNOWN', activitySeq: entry.activitySeq, at };
  }
  return undefined;
}

/** Writes the badge only when it changes (Part 6 §6.9: no write when the value is the same). */
function writeBadge(transaction: WorkerTransaction, badge: BadgeDocuments, observation: RequesterNoticeObservation | undefined): void {
  if (observation === undefined || badge.detail === undefined) return;
  const before = requesterNoticeStateOf(badge.detail as Pick<RequestRecord, 'requester_not_notified' | 'requester_notified_seq'>);
  const fields = requesterNoticeFields(requesterNoticeAfter(before, observation));
  const previous = requesterNoticeFields(before);
  if (JSON.stringify(fields) === JSON.stringify(previous)) return;
  const { requester_not_notified: _issue, requester_notified_seq: _seq, ...detail } = badge.detail;
  transaction.set(`gm_request_details/${badge.requestId}`, { ...detail, ...fields });
  if (badge.summary !== undefined) {
    const { requester_not_notified: _shown, ...summary } = badge.summary;
    transaction.set(`gm_request_summaries/${badge.requestId}`, {
      ...summary,
      ...(fields.requester_not_notified === undefined ? {} : { requester_not_notified: fields.requester_not_notified }),
    });
  }
}

type Claim =
  | { readonly kind: 'done'; readonly result: DispatchResult }
  | { readonly kind: 'send'; readonly message: OutboundMessage; readonly entry: Entry; readonly attempts: number; readonly attemptedAt: Instant };

async function claim(transaction: WorkerTransaction, path: string, outboxId: string, now: Instant, leaseId: string, superseded: boolean): Promise<Claim> {
  const stored = await transaction.get(path);
  if (stored === undefined) return { kind: 'done', result: 'skipped' };
  const entry = parseEntry(stored);
  if (entry === undefined) {
    // Not something this worker wrote; leave it for a person rather than guess.
    return { kind: 'done', result: 'skipped' };
  }
  const decision = claimDelivery({ state: entry.state, next_attempt_at: entry.nextAttemptAt, ...(entry.leaseUntil === undefined ? {} : { lease_until: entry.leaseUntil }) }, now);
  if (decision.kind === 'skip') return { kind: 'done', result: 'skipped' };
  const badge = entry.audience === 'requester' ? await readBadge(transaction, entry.requestId) : undefined;
  const lastAttempt = Number.isSafeInteger(stored.last_attempt_at) ? (stored.last_attempt_at as number) : now;
  if (decision.kind === 'lease_expired') {
    const settlement: DeliverySettlement = { state: 'delivery_unknown', errorCode: 'LEASE_EXPIRED' };
    transaction.set(path, settledEntry(stored, settlement, lastAttempt));
    if (badge !== undefined) writeBadge(transaction, badge, observationOf(entry, settlement, now));
    return { kind: 'done', result: 'unknown' };
  }
  const request = await transaction.get(`requests/${entry.requestId}`);
  const person = await transaction.get(`people/${entry.recipientId}`);
  const stop = (settlement: DeliverySettlement): Claim => {
    transaction.set(path, { ...settledEntry(stored, settlement, now), last_attempt_at: now });
    if (badge !== undefined) writeBadge(transaction, badge, observationOf(entry, settlement, now));
    return { kind: 'done', result: resultOf(settlement) };
  };
  // D-A03-7: a newer status notice to this person exists — only the latest goes out.
  if (superseded) return stop({ state: 'suppressed', errorCode: 'SUPERSEDED' });
  if (request === undefined) return stop({ state: 'suppressed', errorCode: 'REQUEST_NOT_FOUND' });
  if (request.status === 'cancelled' && MOOT_WHEN_CANCELLED.has(entry.eventKind)) return stop({ state: 'suppressed', errorCode: 'REQUEST_CANCELLED' });
  // A03 / U1: watching alone gives no access to a confidential request, so its watchers hear nothing.
  if (entry.audience === 'watcher' && request.is_confidential !== false) return stop({ state: 'suppressed', errorCode: 'NO_ACCESS' });
  const slackUserId = text(person?.slack_user_id);
  const channel = chooseDeliveryChannel(person === undefined ? undefined : { active: person.active === true, ...(slackUserId === undefined ? {} : { slackUserId }) });
  // A1.2: no channel → the GM contacts the person; the entry says why (“ผู้ขอยังไม่ได้รับแจ้ง”).
  if (channel === undefined) return stop({ state: 'failed', errorCode: 'NO_CHANNEL' });
  const attempts = entry.attempts + 1;
  const leaseUntil = addElapsed(now, DELIVERY_LEASE_MS);
  transaction.set(path, {
    ...withoutAttempt(stored),
    state: 'processing',
    attempts,
    lease_id: leaseId,
    lease_until: leaseUntil,
    // While processing, “due” means “lease over”: the tick's sweep finds a send whose worker died.
    next_attempt_at: leaseUntil,
    delivery_channel: channel,
    last_attempt_at: now,
  });
  return {
    kind: 'send',
    entry,
    attempts,
    attemptedAt: now,
    message: {
      outboxId,
      channel,
      // Person IDs are the lowercase company e-mail (D-S08-4).
      address: channel === 'slack' ? (slackUserId ?? '') : entry.recipientId,
      eventKind: entry.eventKind,
      audience: entry.audience,
      requestId: entry.requestId,
      requestNumber: entry.requestNumber,
      confidential: entry.confidential,
    },
  };
}

/** Upper bound of notices one person gets about one request that the superseding check reads. */
const NOTICES_PER_PERSON_LIMIT = 100;

/**
 * D-A03-7: is there a status notice to the same person on the same request from a later revision?
 * Read before the claim: once true it stays true, so it needs no transaction.
 */
async function isSuperseded(deps: WorkerDeps, path: string): Promise<boolean> {
  const stored = await deps.store.get(path);
  const entry = stored === undefined ? undefined : parseEntry(stored);
  if (entry === undefined || entry.state !== 'pending' || !STATUS_NOTICE_KINDS.has(entry.eventKind)) return false;
  const notices = await deps.store.outboxWhere({ request_id: entry.requestId, recipient_id: entry.recipientId }, NOTICES_PER_PERSON_LIMIT);
  return notices.some(({ data }) => typeof data.event_kind === 'string' && STATUS_NOTICE_KINDS.has(data.event_kind) && Number(data.revision) > entry.revision);
}

export async function dispatchOutbox(deps: WorkerDeps, outboxId: string): Promise<DispatchResult> {
  const path = `${OUTBOX_COLLECTION}/${outboxId}`;
  const leaseId = deps.newLeaseId();
  const superseded = await isSuperseded(deps, path);
  const claimed = await deps.store.runTransaction((transaction) => claim(transaction, path, outboxId, deps.now(), leaseId, superseded));
  if (claimed.kind === 'done') {
    if (claimed.result !== 'skipped') deps.log.info('outbox.settled', { outbox_id: outboxId, state: claimed.result });
    return claimed.result;
  }

  let outcome: DeliveryOutcome;
  try {
    outcome = await deps.adapter.send(claimed.message);
  } catch {
    // We cannot tell whether the provider got it (§6.10: no external exactly-once claim).
    outcome = { kind: 'unknown', code: 'ADAPTER_ERROR' };
  }
  const settlement = settleDelivery(claimed.attempts, outcome, deps.now());
  const result = await deps.store.runTransaction(async (transaction) => {
    const stored = await transaction.get(path);
    if (stored === undefined || stored.state !== 'processing' || stored.lease_id !== leaseId) return 'lease_lost' as const;
    const observation = claimed.entry.audience === 'requester' ? observationOf(claimed.entry, settlement, deps.now()) : undefined;
    const badge = observation === undefined ? undefined : await readBadge(transaction, claimed.entry.requestId);
    transaction.set(path, settledEntry(stored, settlement, claimed.attemptedAt));
    if (badge !== undefined) writeBadge(transaction, badge, observation);
    return resultOf(settlement);
  });
  const fields = {
    outbox_id: outboxId,
    kind: claimed.message.eventKind,
    channel: claimed.message.channel,
    state: result === 'lease_lost' ? 'lease_lost' : settlement.state,
    attempts: claimed.attempts,
    ...(settlement.errorCode === undefined ? {} : { code: settlement.errorCode }),
  };
  if (result === 'failed' || result === 'unknown' || result === 'lease_lost') deps.log.warn('outbox.settled', fields);
  else deps.log.info('outbox.settled', fields);
  return result;
}
