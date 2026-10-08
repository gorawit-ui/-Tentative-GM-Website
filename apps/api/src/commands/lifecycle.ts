// A03 — lifecycle commands persisted (S05 domain rules; Part 6 §6.6/§6.9). One transaction per
// command, every read before the first write:
//   read   request + GM detail → access (unreadable = 404) → who may act → `expected_revision`
//          (stale = 409 with the latest status, never written over) → domain rule (@gm/domain)
//          → routing facts (company calendar, GM pins) → names → counter → user_state refs
//   write  `requests/{id}` (revision + 1, unread clock) + public/GM summaries, history event,
//          internal board counter (D-S09-4), user_state unread clock, focus release (D-S07-6),
//          the auto-close job of a completion that waits for the requester, outbox notices
// Auto-close is the same pipeline run by the worker's `auto_close` job (actor `system`): it rechecks
// the latest state (§6.9), so it and the requester's answer close a request once.
import {
  buildRequestProjections,
  joinRequestRecord,
  type CalendarSnapshotDocument,
  type GmRequestDetailDocument,
  type LifecycleCommandEnvelope,
  type RequestDocument,
  type RequestRecord,
} from '@gm/contracts';
import {
  acceptRequest,
  autoCloseRequest,
  cancelRequest,
  canReadRequestDetail,
  completeRequest,
  confirmCompletion,
  isGm,
  releaseFocusIfNotInProgress,
  reopenRequest,
  reportNotResolved,
  type Actor,
  type AutoCloseSkipReason,
  type LifecycleEvent,
  type LifecycleState,
} from '@gm/domain';
import type { Instant } from '@gm/time';
import { fromCalendarSnapshotDocument, toCalendarSnapshotDocument } from '../calendar-snapshot';
import {
  BOARD_COUNTER_PATH,
  CommandRejected,
  GM_REQUEST_DETAILS_COLLECTION,
  GM_SUMMARIES_COLLECTION,
  OUTBOX_COLLECTION,
  PUBLIC_SUMMARIES_COLLECTION,
  REQUESTS_COLLECTION,
  type CommandResult,
  type PeopleDirectory,
  type RoutingDirectory,
  type RoutingFacts,
} from './execute-command';
import { lifecycleOutbox, type LifecycleNoticeKind } from './outbox';
import type { CommandTransaction, StoredData } from './transaction-port';

/** The part of a transaction this module uses (the worker's transaction has the same two). */
export type RecordTransaction = Pick<CommandTransaction, 'get' | 'set'>;

export interface LifecycleDirectories {
  readonly peopleDirectory: PeopleDirectory;
  readonly routingDirectory: RoutingDirectory;
}

export const SCHEDULED_WORK_COLLECTION = 'scheduled_work';

/** `scheduled_work` ID of the auto-close job of one completion cycle (Part 6 §6.9: request + cycle). */
export function autoCloseJobId(requestId: string, completionCycleId: number): string {
  return `auto_close-${requestId}-c${completionCycleId}`;
}

const GM_COMMANDS = new Set(['accept_request', 'complete_request', 'cancel_request', 'reopen_request']);
const WAITING_FIELDS = ['waiting_on', 'current_waiting_interval_id', 'waiting_since', 'waiting_party_responded', 'responded_at'] as const;

interface Loaded {
  readonly requestId: string;
  readonly record: RequestRecord;
  /** The stored `requests/{id}`, for the display pairs (D-S10-1) of a conflict answer. */
  readonly stored: StoredData;
}

async function loadRequest(transaction: RecordTransaction, requestId: string): Promise<Loaded | undefined> {
  const stored = await transaction.get(`${REQUESTS_COLLECTION}/${requestId}`);
  if (stored === undefined) return undefined;
  const gmDetail = await transaction.get(`${GM_REQUEST_DETAILS_COLLECTION}/${requestId}`);
  return {
    requestId,
    stored,
    record: joinRequestRecord(stored as unknown as RequestDocument, gmDetail as unknown as GmRequestDetailDocument | undefined),
  };
}

function toLifecycleState(record: RequestRecord): LifecycleState {
  const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : ({ [key]: value } as { readonly [P in K]: V }));
  return {
    source: record.source,
    status: record.status,
    ...optional('requesterId', record.requester_id),
    ...optional('assigneeId', record.assignee_id),
    lastUpdatedAt: record.last_updated_at,
    completionCycleId: record.completion_cycle_id,
    ...optional('completedAt', record.completed_at),
    ...optional(
      'confirmationCalendarSnapshot',
      record.confirmation_calendar_snapshot === undefined ? undefined : fromCalendarSnapshotDocument(record.confirmation_calendar_snapshot),
    ),
    ...optional('autoCloseDueAt', record.auto_close_due_at),
    ...optional('closedAt', record.closed_at),
    ...optional('closureKind', record.closure_kind),
    ...optional('cancelledAt', record.cancelled_at),
  };
}

/** The request after the domain result: lifecycle fields from `state`, everything else kept. */
function applyState(record: RequestRecord, state: LifecycleState, snapshot: CalendarSnapshotDocument | undefined, now: Instant): RequestRecord {
  const dropped = new Set<string>([
    'assignee_id',
    'completed_at',
    'auto_close_due_at',
    'closed_at',
    'closure_kind',
    'cancelled_at',
    'confirmation_calendar_snapshot',
    // Waiting persistence is A04; a request that is no longer waiting keeps no current-wait fields.
    ...(state.status === 'waiting' ? [] : WAITING_FIELDS),
  ]);
  const kept = Object.fromEntries(Object.entries(record).filter(([key]) => !dropped.has(key))) as unknown as RequestRecord;
  const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : ({ [key]: value } as { readonly [P in K]: V }));
  return {
    ...kept,
    status: state.status,
    ...optional('assignee_id', state.assigneeId),
    last_updated_at: state.lastUpdatedAt,
    completion_cycle_id: state.completionCycleId,
    ...optional('completed_at', state.completedAt),
    ...optional('auto_close_due_at', state.autoCloseDueAt),
    ...optional('closed_at', state.closedAt),
    ...optional('closure_kind', state.closureKind),
    ...optional('cancelled_at', state.cancelledAt),
    ...optional('confirmation_calendar_snapshot', state.confirmationCalendarSnapshot === undefined ? undefined : snapshot),
    revision: record.revision + 1,
    activity_seq: (record.activity_seq ?? 0) + 1,
    last_activity_at: now,
  };
}

/** “งานภายใน X รายการ” counts confidential requests not closed or cancelled (D-S09-4). */
function countsAsInternalOpen(record: RequestRecord): boolean {
  return record.is_confidential && record.status !== 'cancelled' && record.closed_at === undefined;
}

const NOTICE_KIND: Readonly<Record<LifecycleEvent['kind'], LifecycleNoticeKind | undefined>> = {
  accepted: 'request_accepted',
  completed: 'request_completed',
  not_resolved: 'request_not_resolved',
  cancelled: 'request_cancelled',
  reopened: 'request_reopened',
  // Closing does not change the status; the requester or the tick did it (no notice, Q-A03-3).
  closed: undefined,
};

function historyDocument(event: LifecycleEvent, revision: number, autoCloseDueAt: Instant | undefined): Record<string, unknown> {
  return {
    kind: event.kind,
    at: event.at,
    actor_id: event.actorId,
    revision,
    ...(event.completionCycleId === undefined ? {} : { completion_cycle_id: event.completionCycleId }),
    ...(event.closureKind === undefined ? {} : { closure_kind: event.closureKind }),
    ...(event.reason === undefined ? {} : { reason: event.reason }),
    ...(event.resolutionSummary === undefined ? {} : { resolution_summary: event.resolutionSummary }),
    ...(event.previousAssigneeId === undefined ? {} : { previous_assignee_id: event.previousAssigneeId }),
    ...(event.kind === 'completed' && autoCloseDueAt !== undefined ? { auto_close_due_at: autoCloseDueAt } : {}),
  };
}

/** People whose unread clock moves with this event: the requester, related people with access, and (public status) watchers. */
function activityViewers(record: RequestRecord, actorId: string): readonly string[] {
  const related = record.is_confidential ? record.related_person_ids.filter((id) => (record.confidential_grant_ids ?? []).includes(id)) : record.related_person_ids;
  const watchers = record.is_confidential ? [] : record.watcher_ids;
  return [...new Set([...(record.requester_id === undefined ? [] : [record.requester_id]), ...related, ...watchers])].filter((id) => id !== actorId);
}

interface Persisted {
  readonly result: CommandResult;
  readonly outboxIds: readonly string[];
}

/**
 * Reads what the write phase needs, then writes everything for one lifecycle event. The caller has
 * read only the request so far; every read here still precedes the first write.
 */
async function persist(
  transaction: RecordTransaction,
  loaded: Loaded,
  outcome: { readonly state: LifecycleState; readonly event: LifecycleEvent },
  context: { readonly actorId: string; readonly now: Instant; readonly routing: RoutingFacts; readonly peopleDirectory: PeopleDirectory },
): Promise<Persisted> {
  const { requestId, record } = loaded;
  const { state, event } = outcome;
  const { now, routing } = context;
  const snapshot =
    event.kind === 'completed' && state.confirmationCalendarSnapshot !== undefined
      ? toCalendarSnapshotDocument(state.confirmationCalendarSnapshot, { sourceCalendarId: 'company', snapshotAt: now })
      : record.confirmation_calendar_snapshot;
  const next = applyState(record, state, snapshot, now);

  // Reads.
  const people = [next.created_by_id, next.requester_id, next.assignee_id, ...next.related_person_ids].filter((id): id is string => id !== undefined);
  const names = await context.peopleDirectory.displayNames(transaction, [...new Set(people)]);
  const counterDelta = Number(countsAsInternalOpen(next)) - Number(countsAsInternalOpen(record));
  const counter = counterDelta === 0 ? undefined : await transaction.get(BOARD_COUNTER_PATH);
  const viewers = activityViewers(next, context.actorId);
  const viewerStates = new Map<string, StoredData>();
  for (const personId of viewers) {
    const userState = await transaction.get(`user_state/${personId}/requests/${requestId}`);
    if (userState !== undefined) viewerStates.set(personId, userState);
  }
  const unpinned: { readonly personId: string; readonly stored: StoredData }[] = [];
  for (const member of routing.members) {
    const profile = member.profile;
    if (profile === undefined || profile.focusRequestId !== requestId) continue;
    const released = releaseFocusIfNotInProgress(profile, { id: requestId, source: next.source, status: next.status, ...(next.closed_at === undefined ? {} : { closedAt: next.closed_at }) }, now);
    if (released.event === undefined) continue;
    const stored = await transaction.get(`gm_profiles/${member.personId}`);
    if (stored !== undefined) unpinned.push({ personId: member.personId, stored });
  }

  // Writes.
  const projections = buildRequestProjections(requestId, next, {
    now,
    workCalendar: routing.workCalendar,
    personLabel: (personId) => names.get(personId),
    personTeamLabel: () => undefined,
  });
  transaction.set(`${REQUESTS_COLLECTION}/${requestId}`, projections.detail);
  transaction.set(`${GM_SUMMARIES_COLLECTION}/${requestId}`, projections.gm);
  if (projections.public !== null) transaction.set(`${PUBLIC_SUMMARIES_COLLECTION}/${requestId}`, projections.public);
  transaction.set(`${REQUESTS_COLLECTION}/${requestId}/history/r${String(next.revision).padStart(6, '0')}`, historyDocument(event, next.revision, next.auto_close_due_at));
  if (counterDelta !== 0) {
    const previous = typeof counter?.internal_board_count === 'number' ? counter.internal_board_count : 0;
    transaction.set(BOARD_COUNTER_PATH, { internal_board_count: Math.max(0, previous + counterDelta), as_of: now });
  }
  for (const [personId, userState] of viewerStates) {
    transaction.set(`user_state/${personId}/requests/${requestId}`, { ...userState, activity_seq: next.activity_seq, last_activity_at: now });
  }
  for (const { personId, stored } of unpinned) {
    const { focus_request_id: _released, ...rest } = stored;
    transaction.set(`gm_profiles/${personId}`, rest);
  }
  if (event.kind === 'completed' && next.closed_at === undefined && next.auto_close_due_at !== undefined) {
    // Part 6 §6.9 auto-close: one job per request + completion cycle, run by the worker's tick.
    transaction.set(`${SCHEDULED_WORK_COLLECTION}/${autoCloseJobId(requestId, next.completion_cycle_id)}`, {
      kind: 'auto_close',
      state: 'scheduled',
      next_run_at: next.auto_close_due_at,
      attempts: 0,
      request_id: requestId,
      completion_cycle_id: next.completion_cycle_id,
      created_at: now,
    });
  }
  const noticeKind = NOTICE_KIND[event.kind];
  const notices =
    noticeKind === undefined
      ? []
      : lifecycleOutbox({
          requestId,
          requestNumber: next.request_number,
          revision: next.revision,
          eventKind: noticeKind,
          actorId: context.actorId,
          ...(next.requester_id === undefined ? {} : { requesterId: next.requester_id }),
          watcherIds: next.watcher_ids,
          isConfidential: next.is_confidential,
          ...(noticeKind === 'request_completed' && next.auto_close_due_at !== undefined ? { autoCloseDueAt: next.auto_close_due_at } : {}),
          now,
        });
  for (const notice of notices) transaction.set(`${OUTBOX_COLLECTION}/${notice.id}`, notice.data);
  return {
    result: { request_id: requestId, request_number: next.request_number, revision: next.revision, status: next.status },
    outboxIds: notices.map((notice) => notice.id),
  };
}

function conflict(loaded: Loaded, command: LifecycleCommandEnvelope, actor: Actor): never {
  const { record, stored } = loaded;
  const current = { revision: record.revision, status: record.status, ...(record.closed_at === undefined ? {} : { closed: true }) };
  if (command.type === 'accept_request' && record.status !== 'queued' && record.assignee_id !== undefined && record.assignee_id !== actor.personId) {
    // “มีคนรับไปแล้ว”: who took it (a GM sees GM names).
    throw new CommandRejected('ALREADY_ACCEPTED', 'Another GM accepted this request first', {
      ...current,
      ...(stored.assignee_display === undefined ? {} : { assignee_display: stored.assignee_display }),
    });
  }
  throw new CommandRejected('REVISION_CONFLICT', 'The request changed since it was loaded', current);
}

/** One lifecycle command from the API (inside the command transaction of `executeCommand`). */
export async function runLifecycleCommand(
  transaction: RecordTransaction,
  command: LifecycleCommandEnvelope,
  context: { readonly actor: Actor; readonly now: Instant } & LifecycleDirectories,
): Promise<Persisted> {
  const { actor, now } = context;
  const { payload } = command;
  const loaded = await loadRequest(transaction, payload.request_id);
  const viewer = { personId: actor.personId, role: actor.role, enabled: true, corporate: true };
  if (loaded === undefined) throw new CommandRejected('REQUEST_NOT_FOUND', 'No such request');
  const { record } = loaded;
  const facts = {
    requesterId: record.requester_id,
    relatedPersonIds: record.related_person_ids,
    isConfidential: record.is_confidential,
    confidentialGrantIds: record.confidential_grant_ids,
  };
  // Someone who may not read the request learns nothing about it, not even that it exists.
  if (!canReadRequestDetail(viewer, facts)) throw new CommandRejected('REQUEST_NOT_FOUND', 'No such request');
  if (GM_COMMANDS.has(command.type) && !isGm(actor)) throw new CommandRejected('GM_ONLY', 'Only GM can do this');
  if (!GM_COMMANDS.has(command.type) && record.requester_id !== actor.personId) {
    throw new CommandRejected('REQUESTER_ONLY', 'Only the requester can confirm or report not resolved');
  }
  if (record.revision !== payload.expected_revision) conflict(loaded, command, actor);

  const state = toLifecycleState(record);
  const routing = await context.routingDirectory.load(transaction);
  const outcome = (() => {
    switch (command.type) {
      case 'accept_request':
        return acceptRequest(state, { actor, now, takeOver: command.payload.take_over });
      case 'complete_request':
        return completeRequest(state, { actor, now, resolutionSummary: command.payload.resolution_summary, confirmationCalendar: routing.workCalendar });
      case 'confirm_completion':
        return confirmCompletion(state, { actor, now, completionCycleId: command.payload.completion_cycle_id });
      case 'report_not_resolved':
        return reportNotResolved(state, { actor, now, completionCycleId: command.payload.completion_cycle_id, reason: command.payload.reason });
      case 'cancel_request':
        return cancelRequest(state, { actor, now, reason: command.payload.reason });
      case 'reopen_request':
        return reopenRequest(state, { actor, now, reason: command.payload.reason });
    }
  })();
  return persist(transaction, loaded, outcome, { actorId: actor.personId, now, routing, peopleDirectory: context.peopleDirectory });
}

export type AutoCloseOutcome =
  | { readonly kind: 'closed' }
  | { readonly kind: 'skipped'; readonly reason: AutoCloseSkipReason | 'not_found'; readonly dueAt?: Instant };

/**
 * The auto-close job (Part 6 §6.9): recheck `completed`, `closed_at` empty, the same completion
 * cycle and the due time on the latest request, then close it as `system`. Skips, never throws.
 */
export async function autoCloseInTransaction(
  transaction: RecordTransaction,
  input: { readonly requestId: string; readonly completionCycleId: number; readonly now: Instant },
  directories: LifecycleDirectories,
): Promise<AutoCloseOutcome> {
  const loaded = await loadRequest(transaction, input.requestId);
  if (loaded === undefined) return { kind: 'skipped', reason: 'not_found' };
  const result = autoCloseRequest(toLifecycleState(loaded.record), { now: input.now, completionCycleId: input.completionCycleId });
  if (!result.applied) {
    return {
      kind: 'skipped',
      reason: result.skipReason,
      ...(result.skipReason === 'not_due' && loaded.record.auto_close_due_at !== undefined ? { dueAt: loaded.record.auto_close_due_at } : {}),
    };
  }
  const routing = await directories.routingDirectory.load(transaction);
  await persist(transaction, loaded, result, { actorId: 'system', now: input.now, routing, peopleDirectory: directories.peopleDirectory });
  return { kind: 'closed' };
}
