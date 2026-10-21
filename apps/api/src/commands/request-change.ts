// A03/A04 — the one write pipeline of every command on an existing request (lifecycle, waiting,
// related persons, confidential flag) and of the worker's auto-close. The caller has read the request
// (and, for waiting, its current interval) and decided the change with @gm/domain; this module reads
// what the write phase needs — every read before the first write — then writes, in the same transaction:
//   `requests/{id}` + GM summary + public summary (removed while confidential, §6.4.1) + GM detail
//   (when its fields changed), the history event, the internal board counter (D-S09-4), the public
//   visibility epoch when the flag changes (§6.4.1), user_state unread clocks (D-A03-5) and references
//   of newly related people, focus release (D-S07-6), caller documents (auto-close job, waiting
//   interval), the outbox, (D-A06-6) the latest status notice per recipient and (A05) the request's
//   stale check (`scheduled_work/stale-{id}`).
import {
  buildRequestProjections,
  canonicalJson,
  joinRequestRecord,
  splitRequestRecord,
  type GmRequestDetailDocument,
  type RequestDocument,
  type RequestRecord,
} from '@gm/contracts';
import { releaseFocusIfNotInProgress } from '@gm/domain';
import type { CalendarSnapshot, Instant } from '@gm/time';
import {
  BOARD_COUNTER_PATH,
  CommandRejected,
  GM_REQUEST_DETAILS_COLLECTION,
  GM_SUMMARIES_COLLECTION,
  OUTBOX_COLLECTION,
  PUBLIC_SUMMARIES_COLLECTION,
  outboxDocument,
  REQUESTS_COLLECTION,
  type CommandResult,
  type PeopleDirectory,
  type RoutingDirectory,
  type RoutingFacts,
} from './execute-command';
import { OUTBOX_HEADS_COLLECTION, outboxHeadAfter, type OutboxEntry } from './outbox';
import { staleJobDocument, staleJobPath } from './stale-job';
import type { CommandTransaction, StoredData } from './transaction-port';

/** The part of a transaction the pipeline uses (the worker's transaction has the same three). */
export type RecordTransaction = Pick<CommandTransaction, 'get' | 'set' | 'delete' | 'list'>;

export interface LifecycleDirectories {
  readonly peopleDirectory: PeopleDirectory;
  readonly routingDirectory: RoutingDirectory;
}

/** §6.4.1: bumped in the transaction that hides or shows a request on the public side (B aggregates compare it). */
export const PUBLIC_VISIBILITY_PATH = 'system_counters/public_visibility';

export interface Loaded {
  readonly requestId: string;
  readonly record: RequestRecord;
  /** The stored `requests/{id}`, for the display pairs (D-S10-1) of a conflict answer. */
  readonly stored: StoredData;
}

export async function loadRequest(transaction: Pick<CommandTransaction, 'get'>, requestId: string): Promise<Loaded | undefined> {
  const stored = await transaction.get(`${REQUESTS_COLLECTION}/${requestId}`);
  if (stored === undefined) return undefined;
  const gmDetail = await transaction.get(`${GM_REQUEST_DETAILS_COLLECTION}/${requestId}`);
  return {
    requestId,
    stored,
    record: joinRequestRecord(stored as unknown as RequestDocument, gmDetail as unknown as GmRequestDetailDocument | undefined),
  };
}

/** The latest safe state for a 409 answer (Part 6 §6.6). */
export function currentState(record: RequestRecord): Readonly<Record<string, unknown>> {
  return { revision: record.revision, status: record.status, ...(record.closed_at === undefined ? {} : { closed: true }) };
}

export function revisionConflict(record: RequestRecord): never {
  throw new CommandRejected('REVISION_CONFLICT', 'The request changed since it was loaded', currentState(record));
}

/** The next revision and unread step of a change people with access can see (D-A03-5). */
export function advanced(record: RequestRecord, now: Instant): Pick<RequestRecord, 'revision' | 'activity_seq' | 'last_activity_at'> {
  return { revision: record.revision + 1, activity_seq: (record.activity_seq ?? 0) + 1, last_activity_at: now };
}

/** `history/r{revision}`: one event per revision. */
export function historyPath(requestId: string, revision: number): string {
  return `${REQUESTS_COLLECTION}/${requestId}/history/r${String(revision).padStart(6, '0')}`;
}

/** `gm_history/r{revision}`: what only GM read (Part 6 §6.4: through the API), e.g. D-A04-8. */
export function gmHistoryPath(requestId: string, revision: number): string {
  return `${REQUESTS_COLLECTION}/${requestId}/gm_history/r${String(revision).padStart(6, '0')}`;
}

/** “งานภายใน X รายการ” counts confidential requests not closed or cancelled (D-S09-4). */
function countsAsInternalOpen(record: RequestRecord): boolean {
  return record.is_confidential && record.status !== 'cancelled' && record.closed_at === undefined;
}

/**
 * People whose unread clock moves with this event (D-A03-5): the requester, related people with
 * access, and — on a status change of a general request only — the watchers (U1). The actor is left
 * out: their own action marks the request seen for them instead.
 */
function activityViewers(record: RequestRecord, actorId: string, statusChanged: boolean): readonly string[] {
  const related = record.is_confidential ? record.related_person_ids.filter((id) => (record.confidential_grant_ids ?? []).includes(id)) : record.related_person_ids;
  const watchers = record.is_confidential || !statusChanged ? [] : record.watcher_ids;
  return [...new Set([...(record.requester_id === undefined ? [] : [record.requester_id]), ...related, ...watchers])].filter((id) => id !== actorId);
}

export interface RequestChange {
  /** The request after the command, revision and unread step already advanced (`advanced`). */
  readonly next: RequestRecord;
  /** The history event, stored at `history/r{revision}`. */
  readonly history: Readonly<Record<string, unknown>>;
  readonly notices: readonly OutboxEntry[];
  /** Other documents of the same change (auto-close job, waiting intervals). */
  readonly extraWrites?: readonly { readonly path: string; readonly data: object }[];
  /** People who just became related: their “คำขอของฉัน” reference is created (or a watcher's upgraded). */
  readonly addedRelatedIds?: readonly string[];
}

export interface Persisted {
  readonly result: CommandResult;
  readonly outboxIds: readonly string[];
}

/** Reads what the write phase needs, then writes one change. Nothing here throws a domain refusal. */
export async function persistChange(
  transaction: RecordTransaction,
  loaded: Loaded,
  change: RequestChange,
  context: { readonly actorId: string; readonly now: Instant; readonly routing: RoutingFacts; readonly peopleDirectory: PeopleDirectory },
): Promise<Persisted> {
  const { requestId, record } = loaded;
  const { next, notices } = change;
  const { now, routing } = context;

  // Reads.
  const waitedPerson = next.status === 'waiting' && next.waiting_on?.kind === 'person' ? next.waiting_on.person_id : undefined;
  const people = [next.created_by_id, next.requester_id, next.assignee_id, waitedPerson, ...next.related_person_ids].filter((id): id is string => id !== undefined);
  const names = await context.peopleDirectory.displayNames(transaction, [...new Set(people)]);
  // D-S09-1: the public summary shows a waited person's team, never their name.
  const teams = waitedPerson === undefined || next.is_confidential || context.peopleDirectory.teamLabels === undefined ? new Map<string, string>() : await context.peopleDirectory.teamLabels(transaction, [waitedPerson]);
  const counterDelta = Number(countsAsInternalOpen(next)) - Number(countsAsInternalOpen(record));
  const counter = counterDelta === 0 ? undefined : await transaction.get(BOARD_COUNTER_PATH);
  const visibilityChanged = next.is_confidential !== record.is_confidential;
  const visibility = visibilityChanged ? await transaction.get(PUBLIC_VISIBILITY_PATH) : undefined;
  const viewers = activityViewers(next, context.actorId, next.status !== record.status);
  const viewerStates = new Map<string, StoredData | undefined>();
  for (const personId of viewers) viewerStates.set(personId, await transaction.get(`user_state/${personId}/requests/${requestId}`));
  // The actor acted on the latest revision, so they have seen everything up to this step (D-A03-5).
  const actorState = context.actorId === 'system' ? undefined : await transaction.get(`user_state/${context.actorId}/requests/${requestId}`);
  const unpinned: { readonly personId: string; readonly stored: StoredData }[] = [];
  for (const member of routing.members) {
    const profile = member.profile;
    if (profile === undefined || profile.focusRequestId !== requestId) continue;
    const released = releaseFocusIfNotInProgress(profile, { id: requestId, source: next.source, status: next.status, ...(next.closed_at === undefined ? {} : { closedAt: next.closed_at }) }, now);
    if (released.event === undefined) continue;
    const stored = await transaction.get(`gm_profiles/${member.personId}`);
    if (stored !== undefined) unpinned.push({ personId: member.personId, stored });
  }
  // D-A06-6: the latest status notice per recipient, kept in one record the worker reads once.
  const headPath = `${OUTBOX_HEADS_COLLECTION}/${requestId}`;
  const head = notices.length === 0 ? undefined : outboxHeadAfter(requestId, await transaction.get(headPath), notices);

  // Writes.
  const projections = buildRequestProjections(requestId, next, {
    now,
    workCalendar: routing.workCalendar,
    personLabel: (personId) => names.get(personId),
    personTeamLabel: (personId) => teams.get(personId),
  });
  transaction.set(`${REQUESTS_COLLECTION}/${requestId}`, projections.detail);
  transaction.set(`${GM_SUMMARIES_COLLECTION}/${requestId}`, projections.gm);
  // §6.4.1: a confidential request has no public summary.
  if (projections.public !== null) transaction.set(`${PUBLIC_SUMMARIES_COLLECTION}/${requestId}`, projections.public);
  else if (!record.is_confidential) transaction.delete(`${PUBLIC_SUMMARIES_COLLECTION}/${requestId}`);
  if (JSON.stringify(projections.gmDetail) !== JSON.stringify(splitRequestRecord(record).gmDetail)) {
    transaction.set(`${GM_REQUEST_DETAILS_COLLECTION}/${requestId}`, projections.gmDetail);
  }
  transaction.set(historyPath(requestId, next.revision), change.history);
  if (counterDelta !== 0) {
    const previous = typeof counter?.internal_board_count === 'number' ? counter.internal_board_count : 0;
    transaction.set(BOARD_COUNTER_PATH, { internal_board_count: Math.max(0, previous + counterDelta), as_of: now });
  }
  if (visibilityChanged) {
    const previous = typeof visibility?.public_visibility_epoch === 'number' ? visibility.public_visibility_epoch : 0;
    transaction.set(PUBLIC_VISIBILITY_PATH, { public_visibility_epoch: previous + 1, as_of: now });
  }
  const added = new Set(change.addedRelatedIds ?? []);
  for (const [personId, userState] of viewerStates) {
    const path = `user_state/${personId}/requests/${requestId}`;
    if (userState !== undefined) {
      // A watcher who becomes related now reads the detail (“เกี่ยวข้องกับฉัน”).
      const type = added.has(personId) && userState.type === 'watcher' ? { type: 'related' } : {};
      transaction.set(path, { ...userState, ...type, activity_seq: next.activity_seq, last_activity_at: now });
    } else if (added.has(personId)) {
      transaction.set(path, { type: 'related', activity_seq: next.activity_seq, last_seen_activity_seq: 0, created_at: now, last_activity_at: now });
    }
  }
  if (actorState !== undefined) {
    transaction.set(`user_state/${context.actorId}/requests/${requestId}`, {
      ...actorState,
      activity_seq: next.activity_seq,
      last_seen_activity_seq: next.activity_seq,
      last_activity_at: now,
    });
  }
  for (const { personId, stored } of unpinned) {
    const { focus_request_id: _released, ...rest } = stored;
    transaction.set(`gm_profiles/${personId}`, rest);
  }
  // A05: the stale check moves with every write (GM progress, revision, or no longer open).
  transaction.set(staleJobPath(requestId), staleJobDocument(requestId, next, routing.workCalendar, now));
  for (const write of change.extraWrites ?? []) transaction.set(write.path, write.data);
  for (const notice of notices) transaction.set(`${OUTBOX_COLLECTION}/${notice.id}`, outboxDocument(notice.data));
  if (head !== undefined) transaction.set(headPath, head);
  return {
    result: { request_id: requestId, request_number: next.request_number, revision: next.revision, status: next.status },
    outboxIds: notices.map((notice) => notice.id),
  };
}

/**
 * FU-11 (A10): after the people list renames someone (or changes their team), the display pairs and
 * labels of a request still open follow (D-S10-1); a closed or cancelled request keeps its names. Not an
 * event — no revision, history or unread step — and nothing is written when the value is the same
 * (§6.9). `involves` lets the caller skip requests of nobody renamed before reading names.
 */
export async function refreshRequestNames(
  transaction: RecordTransaction,
  requestId: string,
  context: { readonly now: Instant; readonly workCalendar: CalendarSnapshot; readonly peopleDirectory: PeopleDirectory; readonly involves: (personIds: readonly string[]) => boolean },
): Promise<boolean> {
  const loaded = await loadRequest(transaction, requestId);
  if (loaded === undefined) return false;
  const { record, stored } = loaded;
  if (record.status === 'cancelled' || record.closed_at !== undefined) return false;
  const waitedPerson = record.status === 'waiting' && record.waiting_on?.kind === 'person' ? record.waiting_on.person_id : undefined;
  const people = [record.created_by_id, record.requester_id, record.assignee_id, waitedPerson, ...record.related_person_ids].filter((id): id is string => id !== undefined);
  if (!context.involves(people)) return false;
  const names = await context.peopleDirectory.displayNames(transaction, [...new Set(people)]);
  const teams = waitedPerson === undefined || record.is_confidential || context.peopleDirectory.teamLabels === undefined ? new Map<string, string>() : await context.peopleDirectory.teamLabels(transaction, [waitedPerson]);
  const gmStored = await transaction.get(`${GM_SUMMARIES_COLLECTION}/${requestId}`);
  const publicStored = record.is_confidential ? undefined : await transaction.get(`${PUBLIC_SUMMARIES_COLLECTION}/${requestId}`);
  const projections = buildRequestProjections(requestId, record, {
    now: context.now,
    workCalendar: context.workCalendar,
    personLabel: (personId) => names.get(personId),
    personTeamLabel: (personId) => teams.get(personId),
  });
  const same = (a: unknown, b: unknown) => a !== undefined && canonicalJson(a) === canonicalJson(b);
  let wrote = false;
  if (!same(stored, projections.detail)) {
    transaction.set(`${REQUESTS_COLLECTION}/${requestId}`, projections.detail);
    wrote = true;
  }
  // Only the labels move here; the stale flag stays the stale job's (U4).
  const gm = gmStored === undefined ? projections.gm : { ...projections.gm, stale: gmStored.stale, stale_threshold_at: gmStored.stale_threshold_at };
  if (!same(gmStored, gm)) {
    transaction.set(`${GM_SUMMARIES_COLLECTION}/${requestId}`, gm);
    wrote = true;
  }
  if (projections.public !== null && !same(publicStored, projections.public)) {
    transaction.set(`${PUBLIC_SUMMARIES_COLLECTION}/${requestId}`, projections.public);
    wrote = true;
  }
  return wrote;
}
