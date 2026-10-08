// A03 — lifecycle commands persisted (S05 domain rules; Part 6 §6.6/§6.9). One transaction per
// command, every read before the first write:
//   read   request + GM detail → access (unreadable = 404) → who may act → `expected_revision`
//          (stale = 409 with the latest status, never written over) → the open waiting interval
//          (A04) → domain rule (@gm/domain) → routing facts (company calendar, GM pins) → then the
//          shared pipeline (request-change.ts) reads and writes the rest
//   write  `requests/{id}` (revision + 1, unread clock) + summaries, history event, board counter,
//          user_state, focus release, the auto-close job of a completion that waits for the
//          requester, outbox notices and the latest status notice per recipient (D-A06-6); FU-26:
//          cancelling a waiting request also closes its interval document
// Auto-close is the same pipeline run by the worker's `auto_close` job (actor `system`): it rechecks
// the latest state (§6.9), so it and the requester's answer close a request once.
import { type CalendarSnapshotDocument, type LifecycleCommandEnvelope, type RequestRecord } from '@gm/contracts';
import {
  acceptRequest,
  autoCloseRequest,
  cancelRequest,
  canReadRequestDetail,
  completeRequest,
  confirmCompletion,
  isGm,
  reopenRequest,
  reportNotResolved,
  type Actor,
  type AutoCloseSkipReason,
  type LifecycleEvent,
  type LifecycleState,
} from '@gm/domain';
import type { Instant } from '@gm/time';
import { fromCalendarSnapshotDocument, toCalendarSnapshotDocument } from '../calendar-snapshot';
import { CommandRejected, type PeopleDirectory, type RoutingFacts } from './execute-command';
import { lifecycleOutbox, type LifecycleNoticeKind } from './outbox';
import {
  advanced,
  currentState,
  loadRequest,
  persistChange,
  type LifecycleDirectories,
  type Loaded,
  type Persisted,
  type RecordTransaction,
} from './request-change';
import { endedIntervalDocument, exitedInterval, intervalPath, toWaitingState } from './waiting-state';
import type { StoredData } from './transaction-port';

export { type LifecycleDirectories, type RecordTransaction } from './request-change';

export const SCHEDULED_WORK_COLLECTION = 'scheduled_work';

/** `scheduled_work` ID of the auto-close job of one completion cycle (Part 6 §6.9: request + cycle). */
export function autoCloseJobId(requestId: string, completionCycleId: number): string {
  return `auto_close-${requestId}-c${completionCycleId}`;
}

const GM_COMMANDS = new Set(['accept_request', 'complete_request', 'cancel_request', 'reopen_request']);
const WAITING_FIELDS = ['waiting_on', 'current_waiting_interval_id', 'waiting_since', 'waiting_party_responded', 'responded_at'] as const;

/** The request as the domain sees it: lifecycle fields, plus (A04) the open waiting interval. */
function toLifecycleState(record: RequestRecord, interval: StoredData | undefined): LifecycleState {
  const confirmation = record.confirmation_calendar_snapshot;
  return {
    ...toWaitingState(record, interval),
    ...(confirmation === undefined ? {} : { confirmationCalendarSnapshot: fromCalendarSnapshotDocument(confirmation) }),
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
    // A request that is no longer waiting keeps no current-wait fields (its intervals keep the history).
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
    ...advanced(record, now),
  };
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
    // FU-26: cancelling while waiting ends the open interval; history keeps it.
    ...(event.endedWaitingInterval === undefined ? {} : { ended_waiting_interval: endedIntervalDocument(event.endedWaitingInterval) }),
  };
}

/** D-A03-2: the assignee hears “not resolved”; D-A03-4: the previous assignee hears of a take-over. */
function gmNotices(event: LifecycleEvent, next: RequestRecord): readonly { readonly personId: string; readonly eventKind: 'request_not_resolved' | 'request_taken_over' }[] {
  if (event.kind === 'not_resolved' && next.assignee_id !== undefined) return [{ personId: next.assignee_id, eventKind: 'request_not_resolved' }];
  if (event.kind === 'accepted' && event.previousAssigneeId !== undefined) return [{ personId: event.previousAssigneeId, eventKind: 'request_taken_over' }];
  return [];
}

/** One lifecycle event through the shared pipeline: the request, its notices, its own documents. */
function persist(
  transaction: RecordTransaction,
  loaded: Loaded,
  outcome: { readonly state: LifecycleState; readonly event: LifecycleEvent },
  context: { readonly actorId: string; readonly now: Instant; readonly routing: RoutingFacts; readonly peopleDirectory: PeopleDirectory; readonly interval?: StoredData | undefined },
): Promise<Persisted> {
  const { requestId, record } = loaded;
  const { state, event } = outcome;
  const { now } = context;
  const snapshot =
    event.kind === 'completed' && state.confirmationCalendarSnapshot !== undefined
      ? toCalendarSnapshotDocument(state.confirmationCalendarSnapshot, { sourceCalendarId: 'company', snapshotAt: now })
      : record.confirmation_calendar_snapshot;
  const next = applyState(record, state, snapshot, now);
  const noticeKind = NOTICE_KIND[event.kind];
  const notices =
    noticeKind === undefined
      ? []
      : lifecycleOutbox({
          requestId,
          requestNumber: next.request_number,
          revision: next.revision,
          activitySeq: next.activity_seq ?? next.revision,
          eventKind: noticeKind,
          actorId: context.actorId,
          ...(next.requester_id === undefined ? {} : { requesterId: next.requester_id }),
          watcherIds: next.watcher_ids,
          gmRecipients: gmNotices(event, next),
          isConfidential: next.is_confidential,
          ...(noticeKind === 'request_completed' && next.auto_close_due_at !== undefined ? { autoCloseDueAt: next.auto_close_due_at } : {}),
          now,
        });
  const extraWrites: { path: string; data: object }[] = [];
  if (event.kind === 'completed' && next.closed_at === undefined && next.auto_close_due_at !== undefined) {
    // Part 6 §6.9 auto-close: one job per request + completion cycle, run by the worker's tick.
    extraWrites.push({
      path: `${SCHEDULED_WORK_COLLECTION}/${autoCloseJobId(requestId, next.completion_cycle_id)}`,
      data: {
        kind: 'auto_close',
        state: 'scheduled',
        next_run_at: next.auto_close_due_at,
        attempts: 0,
        request_id: requestId,
        completion_cycle_id: next.completion_cycle_id,
        created_at: now,
      },
    });
  }
  if (event.endedWaitingInterval !== undefined) {
    extraWrites.push({ path: intervalPath(requestId, event.endedWaitingInterval.intervalId), data: exitedInterval(context.interval, event.endedWaitingInterval, 'cancelled') });
  }
  return persistChange(transaction, loaded, { next, history: historyDocument(event, next.revision, next.auto_close_due_at), notices, extraWrites }, context);
}

function conflict(loaded: Loaded, command: LifecycleCommandEnvelope, actor: Actor): never {
  const { record, stored } = loaded;
  const current = currentState(record);
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

  // A04: the open interval (its recipients), so a cancel can close it (FU-26).
  const interval = record.current_waiting_interval_id === undefined ? undefined : await transaction.get(intervalPath(loaded.requestId, record.current_waiting_interval_id));
  const state = toLifecycleState(record, interval);
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
  return persist(transaction, loaded, outcome, { actorId: actor.personId, now, routing, peopleDirectory: context.peopleDirectory, interval });
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
  const result = autoCloseRequest(toLifecycleState(loaded.record, undefined), { now: input.now, completionCycleId: input.completionCycleId });
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
