// A04 — waiting on others (S06), related persons (FU-12) and the confidential flag (FU-09) persisted.
// One transaction per command, every read before the first write, like the lifecycle commands:
//   read   request + GM detail → access (unreadable = 404) → GM only (all but the answer) →
//          `expected_revision` (stale = 409 with the latest state) → the open interval (its
//          recipients, A2.1) → routing facts (company calendar, GM members) → domain rule
//   write  through request-change.ts, plus the interval documents
//          (`requests/{id}/waiting_intervals/w{n}`: open on enter / change, response on the answer,
//          exit on change / resume / cancel) and the notices of the waited party (bound to the
//          interval, rechecked by the worker before sending, F05 §9.3).
// The waited party's answer (“ฝั่งฉันเรียบร้อยแล้ว”) names its interval instead of a revision: the
// domain checks the interval, the recipient, access and the latest status; the first answer wins and
// a later one, or one that lost to the GM's resume, is answered 409 with the latest state (A2.3).
import type { RequestRecord, WaitingCommandEnvelope } from '@gm/contracts';
import {
  LifecycleRejected,
  addRelatedPersons,
  allGmNoticeRecipients,
  canReadRequestDetail,
  changeWaitingParty,
  enterWaiting,
  followUp,
  isGm,
  markConfidential,
  removeConfidentialFlag,
  removeRelatedPerson,
  respondWaitingParty,
  resumeWork,
  type Actor,
  type FlaggableState,
  type ReminderOutcome,
  type WaitingRequestState,
} from '@gm/domain';
import type { Instant } from '@gm/time';
import { CommandRejected, type CommandResult, type RoutingFacts } from './execute-command';
import { lifecycleOutbox, relatedAddedOutbox, respondedOutbox, waitingPartyOutbox, type OutboxEntry } from './outbox';
import {
  advanced,
  currentState,
  gmHistoryPath,
  loadRequest,
  persistChange,
  revisionConflict,
  type LifecycleDirectories,
  type Loaded,
  type Persisted,
  type RecordTransaction,
  type RequestChange,
} from './request-change';
import type { StoredData } from './transaction-port';
import { endedIntervalDocument, exitedInterval, intervalPath, toWaitingState, waitingOnDocument, waitingOnInput, withWaitingState } from './waiting-state';

/** The answer lost to a newer state: 409 with what the screen needs to show instead. */
const ANSWER_CONFLICTS = new Set(['NOT_WAITING', 'STALE_WAITING_INTERVAL', 'ALREADY_RESPONDED']);

interface Step {
  readonly change: RequestChange;
  readonly result?: Partial<CommandResult>;
}

interface Context {
  readonly loaded: Loaded;
  readonly actor: Actor;
  readonly now: Instant;
  readonly routing: RoutingFacts;
  readonly state: WaitingRequestState;
  readonly interval: StoredData | undefined;
}

const event = (kind: string, context: Context, next: RequestRecord) => ({ kind, at: context.now, actor_id: context.actor.personId, revision: next.revision });

/** The requester and watchers hear who the request now waits on; never the actor (D-A04-2: not on resume). */
function statusNotices(context: Context, next: RequestRecord, eventKind: 'request_waiting', skip: ReadonlySet<string>): readonly OutboxEntry[] {
  return lifecycleOutbox({
    requestId: context.loaded.requestId,
    requestNumber: next.request_number,
    revision: next.revision,
    activitySeq: next.activity_seq ?? next.revision,
    eventKind,
    actorId: context.actor.personId,
    ...(next.requester_id === undefined ? {} : { requesterId: next.requester_id }),
    watcherIds: next.watcher_ids,
    isConfidential: next.is_confidential,
    now: context.now,
  }).filter((entry) => !skip.has(entry.data.recipient_id));
}

function partyNotices(
  context: Context,
  next: RequestRecord,
  input: { readonly eventKind: 'waiting_requested' | 'waiting_reminder'; readonly eventKey: string; readonly intervalId: number; readonly recipientIds: readonly string[]; readonly sendAt?: Instant },
): readonly OutboxEntry[] {
  return waitingPartyOutbox({
    requestId: context.loaded.requestId,
    requestNumber: next.request_number,
    ...input,
    actorId: context.actor.personId,
    ...(next.requester_id === undefined ? {} : { requesterId: next.requester_id }),
    isConfidential: next.is_confidential,
    revision: next.revision,
    activitySeq: next.activity_seq ?? next.revision,
    now: context.now,
  });
}

function openWaiting(context: Context, command: Extract<WaitingCommandEnvelope, { type: 'enter_waiting' | 'change_waiting_party' }>, gmPersonIds: readonly string[]): Step {
  const { loaded, actor, now, state } = context;
  const { payload } = command;
  const input = {
    actor,
    now,
    waitingOn: waitingOnInput(payload.waiting_on),
    notify: payload.notify,
    gmPersonIds,
    confirmConfidentialGrant: payload.confirm_confidential_grant,
  };
  const outcome = command.type === 'enter_waiting' ? enterWaiting(state, input) : changeWaitingParty(state, input);
  if (outcome.event.kind !== 'waiting_started') throw new Error('enter / change waiting returns waiting_started');
  const opened = outcome.event;
  const next = { ...withWaitingState(loaded.record, outcome.state), ...advanced(loaded.record, now) };
  const granted = (outcome.state.confidentialGrantIds ?? []).filter((personId) => !(loaded.record.confidential_grant_ids ?? []).includes(personId));
  const dms =
    outcome.notice === undefined
      ? []
      : partyNotices(context, next, { eventKind: 'waiting_requested', eventKey: `w${opened.intervalId}`, intervalId: opened.intervalId, recipientIds: outcome.notice.recipientIds });
  // A person waited on gets the one message that asks them for something, not a status notice too.
  const told = new Set(dms.map((entry) => entry.data.recipient_id));
  const extraWrites = [
    ...(opened.endedInterval === undefined ? [] : [{ path: intervalPath(loaded.requestId, opened.endedInterval.intervalId), data: exitedInterval(context.interval, opened.endedInterval, 'changed') }]),
    {
      path: intervalPath(loaded.requestId, opened.intervalId),
      data: { interval_id: opened.intervalId, waiting_on: waitingOnDocument(opened.waitingOn), recipient_ids: opened.recipientIds, started_at: now, started_by_id: actor.personId },
    },
  ];
  return {
    change: {
      next,
      history: {
        ...event('waiting_started', context, next),
        interval_id: opened.intervalId,
        waiting_on: waitingOnDocument(opened.waitingOn),
        recipient_ids: opened.recipientIds,
        added_related_person_ids: opened.addedRelatedPersonIds,
        ...(granted.length === 0 ? {} : { granted_person_ids: granted }),
        ...(opened.endedInterval === undefined ? {} : { ended_interval: endedIntervalDocument(opened.endedInterval) }),
      },
      notices: [...dms, ...(command.type === 'enter_waiting' ? statusNotices(context, next, 'request_waiting', told) : [])],
      extraWrites,
      addedRelatedIds: [...new Set([...opened.addedRelatedPersonIds, ...granted])],
    },
    result: { waiting_interval_id: opened.intervalId },
  };
}

function reminderDocument(reminder: ReminderOutcome): Record<string, unknown> {
  return {
    status: reminder.status,
    business_date: reminder.businessDate,
    ...(reminder.status === 'next_business_day' ? { send_at: reminder.sendAt } : {}),
    ...(reminder.status === 'quota_used' ? {} : { recipient_ids: reminder.recipientIds }),
  };
}

function followedUp(context: Context, remind: boolean | undefined): Step {
  const { loaded, actor, now, state, routing } = context;
  const outcome = followUp(state, { actor, now, remind, calendar: routing.workCalendar });
  if (outcome.event.kind !== 'followed_up') throw new Error('followUp returns followed_up');
  const { intervalId, remindedAt } = outcome.event;
  const next = { ...withWaitingState(loaded.record, outcome.state), ...advanced(loaded.record, now) };
  const reminder = outcome.reminder;
  const notices =
    reminder === undefined || reminder.status === 'quota_used'
      ? []
      : partyNotices(context, next, {
          eventKind: 'waiting_reminder',
          // Part 6 §6.6: one reminder per request per business-date bucket.
          eventKey: `remind-${reminder.businessDate}`,
          intervalId,
          recipientIds: reminder.recipientIds,
          ...(reminder.status === 'next_business_day' ? { sendAt: reminder.sendAt } : {}),
        });
  return {
    change: {
      next,
      history: {
        ...event('followed_up', context, next),
        interval_id: intervalId,
        ...(reminder === undefined ? {} : { reminder: reminderDocument(reminder) }),
        ...(remindedAt === undefined ? {} : { reminded_at: remindedAt }),
      },
      notices,
    },
    result: {
      waiting_interval_id: intervalId,
      ...(reminder === undefined
        ? {}
        : { reminder: { status: reminder.status, business_date: reminder.businessDate, ...(reminder.status === 'next_business_day' ? { send_at: reminder.sendAt } : {}) } }),
    },
  };
}

function answered(context: Context, command: Extract<WaitingCommandEnvelope, { type: 'respond_waiting_party' }>): Step {
  const { loaded, actor, now, state, routing } = context;
  const { record } = loaded;
  let outcome;
  try {
    outcome = respondWaitingParty(state, { actor, now, intervalId: command.payload.waiting_interval_id, note: command.payload.note });
  } catch (error) {
    if (error instanceof LifecycleRejected && ANSWER_CONFLICTS.has(error.code)) {
      throw new CommandRejected(error.code, error.message, {
        ...currentState(record),
        ...(record.current_waiting_interval_id === undefined ? {} : { waiting_interval_id: record.current_waiting_interval_id }),
        ...(record.waiting_party_responded === undefined ? {} : { waiting_party_responded: record.waiting_party_responded }),
      });
    }
    throw error;
  }
  if (outcome.event.kind !== 'waiting_party_responded') throw new Error('respondWaitingParty returns waiting_party_responded');
  const { intervalId, note } = outcome.event;
  // A2.1: no status or last_updated_at change; the unread clock moves (people with access see it in history).
  const next = { ...withWaitingState(record, outcome.state), ...advanced(record, now) };
  // A2.1: the assigned GM, or the GM team when nobody is assigned (A01 rule for unassigned work).
  const gms = next.assignee_id === undefined ? allGmNoticeRecipients(routing.members, now, actor.personId) : [next.assignee_id];
  return {
    change: {
      next,
      history: { ...event('waiting_party_responded', context, next), interval_id: intervalId, ...(note === undefined ? {} : { note }) },
      notices: respondedOutbox({
        requestId: loaded.requestId,
        requestNumber: next.request_number,
        revision: next.revision,
        activitySeq: next.activity_seq ?? next.revision,
        intervalId,
        gmRecipientIds: gms,
        actorId: actor.personId,
        isConfidential: next.is_confidential,
        now,
      }),
      extraWrites: [{ path: intervalPath(loaded.requestId, intervalId), data: { ...context.interval, responded_at: now, responded_by_id: actor.personId } }],
    },
    result: { waiting_interval_id: intervalId },
  };
}

function resumed(context: Context): Step {
  const { loaded, actor, now, state } = context;
  const outcome = resumeWork(state, { actor, now });
  if (outcome.event.kind !== 'waiting_ended') throw new Error('resumeWork returns waiting_ended');
  const ended = outcome.event.endedInterval;
  const next = { ...withWaitingState(loaded.record, outcome.state), ...advanced(loaded.record, now) };
  return {
    change: {
      next,
      history: { ...event('waiting_ended', context, next), ended_interval: endedIntervalDocument(ended) },
      // D-A04-2: no message; the status change moves the update dot of the requester and watchers.
      notices: [],
      extraWrites: [{ path: intervalPath(loaded.requestId, ended.intervalId), data: exitedInterval(context.interval, ended, 'resumed') }],
    },
    result: { waiting_interval_id: ended.intervalId },
  };
}

function relatedAdded(context: Context, command: Extract<WaitingCommandEnvelope, { type: 'add_related_persons' }>): Step | undefined {
  const { loaded, actor, now, state } = context;
  const outcome = addRelatedPersons(state, { actor, now, personIds: command.payload.person_ids, confirmConfidentialGrant: command.payload.confirm_confidential_grant });
  // Nobody new: nothing changes and nothing is recorded (FU-07).
  if (outcome.event === undefined) return undefined;
  const added = outcome.event;
  const next = { ...withWaitingState(loaded.record, outcome.state), ...advanced(loaded.record, now) };
  return {
    change: {
      next,
      history: { ...event('related_persons_added', context, next), person_ids: added.personIds, granted_person_ids: added.grantedPersonIds },
      // D-A04-3: the people just added hear it once (confidential: neutral text, the worker rechecks access).
      notices: relatedAddedOutbox({
        requestId: loaded.requestId,
        requestNumber: next.request_number,
        revision: next.revision,
        activitySeq: next.activity_seq ?? next.revision,
        personIds: added.personIds,
        actorId: actor.personId,
        isConfidential: next.is_confidential,
        now,
      }),
      addedRelatedIds: [...new Set([...added.personIds, ...added.grantedPersonIds])],
    },
  };
}

function relatedRemoved(context: Context, command: Extract<WaitingCommandEnvelope, { type: 'remove_related_person' }>): Step {
  const { loaded, actor, now, state } = context;
  const outcome = removeRelatedPerson(state, { actor, now, personId: command.payload.person_id });
  const next = { ...withWaitingState(loaded.record, outcome.state), ...advanced(loaded.record, now) };
  return {
    change: {
      next,
      history: { ...event('related_person_removed', context, next), person_id: outcome.event.personId, grant_withdrawn: outcome.event.grantWithdrawn },
      notices: [],
    },
  };
}

const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : ({ [key]: value } as { readonly [P in K]: V }));

function flaggable(record: RequestRecord): FlaggableState {
  return {
    source: record.source,
    type: record.type,
    isConfidential: record.is_confidential,
    ...optional('sensitivityReason', record.sensitivity_reason),
    ...optional('sensitivityNote', record.sensitivity_note),
    relatedPersonIds: record.related_person_ids,
    ...optional('confidentialGrantIds', record.confidential_grant_ids),
    lastUpdatedAt: record.last_updated_at,
  };
}

/** The request without the flag's fields (reason, GM-only note, grants of the confidential period). */
function withoutFlag(record: RequestRecord): RequestRecord {
  const { sensitivity_reason: _reason, sensitivity_note: _note, confidential_grant_ids: _grants, ...rest } = record;
  return rest as RequestRecord;
}

function flagged(context: Context, command: Extract<WaitingCommandEnvelope, { type: 'mark_confidential' }>): Step {
  const { loaded, actor, now } = context;
  const { payload } = command;
  const outcome = markConfidential(flaggable(loaded.record), {
    actor,
    now,
    sensitivityReason: payload.sensitivity_reason,
    note: payload.note,
    keepRelatedPersonIds: payload.keep_related_person_ids,
  });
  const set = outcome.event;
  const next: RequestRecord = {
    ...withoutFlag(loaded.record),
    is_confidential: true,
    sensitivity_reason: set.sensitivityReason,
    ...optional('sensitivity_note', outcome.state.sensitivityNote),
    confidential_grant_ids: set.keptPersonIds,
    last_updated_at: outcome.state.lastUpdatedAt,
    ...advanced(loaded.record, now),
  };
  return {
    change: {
      next,
      // The note stays GM-only (gm_request_details); history is read by everyone with detail access.
      history: { ...event('confidential_flag_set', context, next), sensitivity_reason: set.sensitivityReason, kept_person_ids: set.keptPersonIds, withdrawn_person_ids: set.withdrawnPersonIds },
      notices: [],
    },
  };
}

function unflagged(context: Context, command: Extract<WaitingCommandEnvelope, { type: 'remove_confidential_flag' }>): Step {
  const { loaded, actor, now } = context;
  const outcome = removeConfidentialFlag(flaggable(loaded.record), { actor, now, reason: command.payload.reason });
  const removed = outcome.event;
  const next: RequestRecord = { ...withoutFlag(loaded.record), is_confidential: false, last_updated_at: outcome.state.lastUpdatedAt, ...advanced(loaded.record, now) };
  return {
    change: {
      next,
      // D-A04-8: people with detail access see only that it became a general request …
      history: event('confidential_flag_removed', context, next),
      notices: [],
      // … the GM Admin's reason (and the earlier sensitivity) stay GM-only, read through the API.
      extraWrites: [
        {
          path: gmHistoryPath(loaded.requestId, next.revision),
          data: { ...event('confidential_flag_removed', context, next), reason: removed.reason, ...optional('previous_sensitivity_reason', removed.previousSensitivityReason) },
        },
      ],
    },
  };
}

/** One A04 command from the API (inside the command transaction of `executeCommand`). */
export async function runWaitingCommand(
  transaction: RecordTransaction,
  command: WaitingCommandEnvelope,
  context: { readonly actor: Actor; readonly now: Instant } & LifecycleDirectories,
): Promise<Persisted> {
  const { actor, now } = context;
  const { payload } = command;
  const loaded = await loadRequest(transaction, payload.request_id);
  if (loaded === undefined) throw new CommandRejected('REQUEST_NOT_FOUND', 'No such request');
  const { record } = loaded;
  const viewer = { personId: actor.personId, role: actor.role, enabled: true, corporate: true };
  const facts = { requesterId: record.requester_id, relatedPersonIds: record.related_person_ids, isConfidential: record.is_confidential, confidentialGrantIds: record.confidential_grant_ids };
  // Someone who may not read the request learns nothing about it, not even that it exists.
  if (!canReadRequestDetail(viewer, facts)) throw new CommandRejected('REQUEST_NOT_FOUND', 'No such request');
  if (command.type !== 'respond_waiting_party') {
    if (!isGm(actor)) throw new CommandRejected('GM_ONLY', 'Only GM can do this');
    if (record.revision !== command.payload.expected_revision) revisionConflict(record);
  }
  const interval = record.current_waiting_interval_id === undefined ? undefined : await transaction.get(intervalPath(loaded.requestId, record.current_waiting_interval_id));
  const routing = await context.routingDirectory.load(transaction);
  const step: Context = { loaded, actor, now, routing, state: toWaitingState(record, interval), interval };
  // D-S06-4: GM Staff / Admin already read every request; they are told but never added or granted.
  const gmPersonIds = routing.members.map((member) => member.personId);
  const decided = (() => {
    switch (command.type) {
      case 'enter_waiting':
      case 'change_waiting_party':
        return openWaiting(step, command, gmPersonIds);
      case 'follow_up':
        return followedUp(step, command.payload.remind);
      case 'respond_waiting_party':
        return answered(step, command);
      case 'resume_work':
        return resumed(step);
      case 'add_related_persons':
        return relatedAdded(step, command);
      case 'remove_related_person':
        return relatedRemoved(step, command);
      case 'mark_confidential':
        return flagged(step, command);
      case 'remove_confidential_flag':
        return unflagged(step, command);
    }
  })();
  if (decided === undefined) {
    return { result: { request_id: loaded.requestId, request_number: record.request_number, revision: record.revision, status: record.status }, outboxIds: [] };
  }
  const persisted = await persistChange(transaction, loaded, decided.change, { actorId: actor.personId, now, routing, peopleDirectory: context.peopleDirectory });
  return { ...persisted, result: { ...persisted.result, ...decided.result } };
}
