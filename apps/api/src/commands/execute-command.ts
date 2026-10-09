// Command executor (S08: A4, Part 6 §6.6). One transaction per command:
//   1. `commands/{command_id}`: a stored command with the same fingerprint returns its first result;
//      a different fingerprint (payload, type or actor) is refused (COMMAND_ID_CONFLICT).
//   2. domain rules (@gm/domain) — a refused command stores nothing and uses no number.
//   3. a new request takes the next number from `system_counters/request_sequence` in the same
//      transaction, so concurrent creates never share or skip a number; watching takes none.
// A01: the same transaction also routes the new request (default owner / leave / all GM), writes
// its three projections (requests + request_summaries + gm_request_summaries, D-S09-5 gm detail),
// the internal board counter for confidential work, a `request_created` history event, user_state
// references and the outbox entries of who to tell (never the actor, D-S08-2). Nothing is sent in
// the transaction (Part 6 §6.6); the HTTP layer hands the new outbox IDs to the queue after commit.
// A03: lifecycle commands on an existing request run in the same wrapper (lifecycle.ts); A04: waiting,
// related persons and the confidential flag too (waiting.ts), all through request-change.ts.
import {
  buildRequestProjections,
  isLifecycleCommand,
  isWaitingCommand,
  joinRequestRecord,
  requesterNoticeFields,
  watcherCount,
  type CommandEnvelope,
  type CreateOnBehalfPayload,
  type GmRequestDetailDocument,
  type MaintenanceSelection,
  type RequestDocument,
  type RequestRecord,
} from '@gm/contracts';
import {
  allGmNoticeRecipients,
  createRequestDraft,
  formatRequestNumber,
  noAccountNotice,
  routeNewRequest,
  nextRequestSequence,
  watchRequest,
  type Actor,
  type CreateRequestCommand,
  type DeploymentEnvironment,
  type GmMember,
  type Labelled,
  type MaintenanceDetails,
  type RequestDraft,
  type RoutingResult,
  type RoutingSettings,
  type RequestStatus,
  type WatchOutcome,
  type WatchState,
} from '@gm/domain';
import type { CalendarSnapshot, Instant } from '@gm/time';
import { runLifecycleCommand } from './lifecycle';
import { runWaitingCommand } from './waiting';
import { newRequestOutbox, relatedAddedOutbox } from './outbox';
import { staleJobDocument, staleJobPath } from './stale-job';
import { commandFingerprint } from './fingerprint';
import type { CommandStore, CommandTransaction } from './transaction-port';

export const REQUEST_COUNTER_PATH = 'system_counters/request_sequence';
export const COMMANDS_COLLECTION = 'commands';
export const REQUESTS_COLLECTION = 'requests';
/** D-S09-5: watcher list and confidential note, GM only. */
export const GM_REQUEST_DETAILS_COLLECTION = 'gm_request_details';
export const PUBLIC_SUMMARIES_COLLECTION = 'request_summaries';
export const GM_SUMMARIES_COLLECTION = 'gm_request_summaries';
export const BOARD_COUNTER_PATH = 'board_counters/public';
export const OUTBOX_COLLECTION = 'outbox';

/** D-S08-6: `commands/{id}` is kept 30 days through a Firestore TTL policy on `expire_at`. */
export const COMMAND_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const COMMAND_EXPIRY_FIELD = 'expire_at';

/** Refused by the executor itself; domain refusals keep their own error types and codes. */
export class CommandRejected extends Error {
  readonly code: string;
  /** A03: the latest safe state for a conflict answer (revision, status, who accepted). */
  readonly details?: Readonly<Record<string, unknown>>;
  constructor(code: string, message: string, details?: Readonly<Record<string, unknown>>) {
    super(message);
    this.name = 'CommandRejected';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/** Labels for the chosen place, area and symptom, read from the catalog (A11/A12). */
export interface MaintenanceLabels {
  readonly location: Labelled;
  readonly area?: Labelled | undefined;
  readonly symptom: { readonly key: string; readonly label: string };
}

export interface MaintenanceCatalog {
  /** Reads inside the transaction (before any write); unknown or disabled entries are refused. */
  resolve(transaction: ReadTransaction, selection: MaintenanceSelection): Promise<MaintenanceLabels>;
}

/** Directories only read, so the worker's transaction (A03 auto-close) can use them too. */
export type ReadTransaction = Pick<CommandTransaction, 'get'>;

/** D-S10-1: display names from `people/{person_id}` (read inside the transaction, before any write). */
export interface PeopleDirectory {
  displayNames(transaction: ReadTransaction, personIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
  /** D-S09-1 / D-ACL-7: each person's one team label from the staff list (FU-10); absent = team unknown (“พนักงาน”). */
  teamLabels?(transaction: ReadTransaction, personIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

/** Routing facts read in the create transaction (settings/routing, GM members, company calendar). */
export interface RoutingFacts {
  readonly settings: RoutingSettings;
  /** Every GM (active or not) with their latest presence, for the default owner and “แจ้ง GM ทุกคน”. */
  readonly members: readonly GmMember[];
  /** Company work calendar for the GM summary's stale threshold (P7-ADMIN-04 before pilot). */
  readonly workCalendar: CalendarSnapshot;
}

export interface RoutingDirectory {
  load(transaction: ReadTransaction): Promise<RoutingFacts>;
}

export interface CommandContext {
  /** From the verified login (A01), never from the body. */
  readonly actor: Actor;
  /** Server time. */
  readonly now: Instant;
  /** D-S08-8: decides the request number prefix (GM- / DEV-). */
  readonly environment: DeploymentEnvironment;
  readonly newRequestId: () => string;
  readonly maintenanceCatalog: MaintenanceCatalog;
  readonly peopleDirectory: PeopleDirectory;
  readonly routingDirectory: RoutingDirectory;
}

/** What the client gets back, the same on every retry of the same command ID. */
export interface CommandResult {
  readonly request_id: string;
  readonly request_number: string;
  /** watch_request only. */
  readonly watch?: WatchOutcome;
  /** A03 lifecycle commands: the revision and status the command produced. */
  readonly revision?: number;
  readonly status?: RequestStatus;
  /** A04: the interval a waiting command opened or acted on. */
  readonly waiting_interval_id?: number;
  /** A04 follow-up with “ส่งเตือนอีกครั้ง”: sent now, deferred to 09:00 of the next business day, or already used today. */
  readonly reminder?: { readonly status: 'send_now' | 'next_business_day' | 'quota_used'; readonly business_date: string; readonly send_at?: number };
}

export interface CommandOutcome {
  /** True when this was a retry answered from `commands/{command_id}`. */
  readonly replayed: boolean;
  readonly result: CommandResult;
  /** Outbox entries this run created (none on a replay), for the post-commit queue hand-off. */
  readonly outboxIds: readonly string[];
}

interface Executed {
  readonly result: CommandResult;
  readonly outboxIds: readonly string[];
}

/** Runs one command; `command` must come from `parseCommand` (its IDs become document paths). */
export async function executeCommand(
  store: CommandStore,
  command: CommandEnvelope,
  context: CommandContext,
): Promise<CommandOutcome> {
  const fingerprint = commandFingerprint(context.actor.personId, command);
  const commandPath = `${COMMANDS_COLLECTION}/${command.command_id}`;
  // Chosen once, so every attempt of the transaction writes the same request.
  const requestId = isCreateCommand(command) ? context.newRequestId() : '';
  return store.runTransaction(async (transaction) => {
    const stored = await transaction.get(commandPath);
    if (stored !== undefined) {
      if (stored.fingerprint !== fingerprint) {
        throw new CommandRejected('COMMAND_ID_CONFLICT', 'This command ID was already used for a different command');
      }
      return { replayed: true, result: stored.result as CommandResult, outboxIds: [] };
    }
    const { result, outboxIds }: Executed = isCreateCommand(command)
      ? await create(transaction, command, context, requestId)
      : isLifecycleCommand(command)
        ? await runLifecycleCommand(transaction, command, context)
        : isWaitingCommand(command)
          ? await runWaitingCommand(transaction, command, context)
          : { result: await watch(transaction, command.payload.request_id, context), outboxIds: [] };
    transaction.set(commandPath, {
      type: command.type,
      actor_id: context.actor.personId,
      fingerprint,
      result,
      created_at: context.now,
      [COMMAND_EXPIRY_FIELD]: context.now + COMMAND_RETENTION_MS,
    });
    return { replayed: false, result, outboxIds };
  });
}

type CreateCommand = Extract<CommandEnvelope, { readonly type: 'create_maintenance' | 'create_on_behalf' | 'create_gm_task' }>;

function isCreateCommand(command: CommandEnvelope): command is CreateCommand {
  return command.type === 'create_maintenance' || command.type === 'create_on_behalf' || command.type === 'create_gm_task';
}

async function create(
  transaction: CommandTransaction,
  command: CreateCommand,
  context: CommandContext,
  requestId: string,
): Promise<Executed> {
  const { now, actor } = context;
  const draft = createRequestDraft(await toDomainCommand(transaction, command, context));
  // Every read happens before the first write (Firestore transactions).
  const counter = await transaction.get(REQUEST_COUNTER_PATH);
  if (counter !== undefined && counter.last_issued === undefined) {
    throw new RangeError('request counter document has no last_issued');
  }
  const facts = await context.routingDirectory.load(transaction);
  const route = routeRequest(draft, facts, now);
  const recipients =
    route.notice.kind === 'assignee'
      ? [route.notice.personId]
      : route.notice.kind === 'all_gm'
        ? allGmNoticeRecipients(facts.members, now, actor.personId)
        : [];
  // D-S10-1 / D-S11-1: names are written with the request.
  const people = [draft.createdById, draft.requesterId, route.assigneeId, ...(draft.relatedPersonIds ?? [])].filter(
    (id): id is string => id !== undefined,
  );
  const names = await context.peopleDirectory.displayNames(transaction, [...new Set(people)]);
  const boardCounter = draft.isConfidential ? await transaction.get(BOARD_COUNTER_PATH) : undefined;

  const sequence = nextRequestSequence(counter?.last_issued as number | undefined);
  const requestNumber = formatRequestNumber(sequence, context.environment);
  transaction.set(REQUEST_COUNTER_PATH, { last_issued: sequence });
  const record = newRequestRecord(draft, requestNumber, now, route.assigneeId);
  const projections = buildRequestProjections(requestId, record, {
    now,
    workCalendar: facts.workCalendar,
    personLabel: (personId) => names.get(personId),
    personTeamLabel: () => undefined,
  });
  transaction.set(`${REQUESTS_COLLECTION}/${requestId}`, projections.detail);
  transaction.set(`${GM_REQUEST_DETAILS_COLLECTION}/${requestId}`, projections.gmDetail);
  transaction.set(`${GM_SUMMARIES_COLLECTION}/${requestId}`, projections.gm);
  if (projections.public !== null) {
    transaction.set(`${PUBLIC_SUMMARIES_COLLECTION}/${requestId}`, projections.public);
  } else {
    // D-S09-4: “งานภายใน X รายการ” counts open confidential work; a new request is open.
    const previous = typeof boardCounter?.internal_board_count === 'number' ? boardCounter.internal_board_count : 0;
    transaction.set(BOARD_COUNTER_PATH, { internal_board_count: previous + 1, as_of: now });
  }
  transaction.set(`${REQUESTS_COLLECTION}/${requestId}/history/created`, {
    kind: 'request_created',
    at: now,
    actor_id: actor.personId,
    origin: record.origin,
    routing_reason: route.reason,
    ...(route.assigneeId === undefined ? {} : { assignee_id: route.assigneeId }),
    ...(route.assigneeOnLeave === undefined ? {} : { assignee_on_leave: route.assigneeOnLeave }),
  });
  // A06 (D-A03-5): creating the request is unread step 1 — seen by whoever created it, new to the others.
  const seenBy = (personId: string) => (personId === actor.personId ? 1 : 0);
  if (record.requester_id !== undefined) {
    transaction.set(`user_state/${record.requester_id}/requests/${requestId}`, {
      type: 'requester',
      activity_seq: 1,
      last_seen_activity_seq: seenBy(record.requester_id),
      created_at: now,
    });
  }
  for (const personId of record.related_person_ids) {
    transaction.set(`user_state/${personId}/requests/${requestId}`, { type: 'related', activity_seq: 1, last_seen_activity_seq: seenBy(personId), created_at: now });
  }
  const outbox = newRequestOutbox({
    requestId,
    requestNumber,
    actorId: actor.personId,
    gmRecipientIds: recipients,
    ...(record.requester_id === undefined ? {} : { requesterId: record.requester_id }),
    isConfidential: record.is_confidential,
    // A07 / UI-15: the all-GM notice says the request is not assigned yet.
    ...(route.notice.kind === 'all_gm' ? { noticeVariant: 'unassigned' as const } : {}),
    now,
  });
  // D-A05-1: related persons chosen at creation hear it once (D-A04-3), never the creator; someone
  // already told about the new request (a GM recipient, the requester) gets that one notice only.
  const told = new Set(outbox.map((entry) => entry.data.recipient_id));
  const related = relatedAddedOutbox({
    requestId,
    requestNumber,
    revision: record.revision,
    activitySeq: record.activity_seq ?? 1,
    personIds: record.related_person_ids.filter((personId) => !told.has(personId)),
    actorId: actor.personId,
    isConfidential: record.is_confidential,
    now,
  });
  for (const entry of [...outbox, ...related]) transaction.set(`${OUTBOX_COLLECTION}/${entry.id}`, entry.data);
  // A05: the first stale check, 3 business days + 1 ms after creation (Part 6 §6.9).
  transaction.set(staleJobPath(requestId), staleJobDocument(requestId, record, facts.workCalendar, now));
  return { result: { request_id: requestId, request_number: requestNumber }, outboxIds: [...outbox, ...related].map((entry) => entry.id) };
}

/** Default owner facts for routeNewRequest: a gm_task creator is an active GM by definition. */
function routeRequest(draft: RequestDraft, facts: RoutingFacts, now: Instant): RoutingResult {
  const ownerId = draft.type === 'gm_task' ? draft.createdById : facts.settings.defaultOwnerByType[draft.type];
  const member = ownerId === undefined ? undefined : facts.members.find((candidate) => candidate.personId === ownerId);
  const defaultOwner =
    ownerId === undefined
      ? undefined
      : (member ?? { personId: ownerId, active: draft.type === 'gm_task' });
  return routeNewRequest({ type: draft.type, now, settings: facts.settings, createdById: draft.createdById, defaultOwner });
}

async function maintenanceDetails(
  transaction: CommandTransaction,
  selection: MaintenanceSelection,
  context: CommandContext,
): Promise<MaintenanceDetails> {
  const labels = await context.maintenanceCatalog.resolve(transaction, selection);
  return {
    type: 'maintenance',
    location: labels.location,
    area: labels.area,
    symptom: labels.symptom,
    description: selection.description,
  };
}

async function toDomainCommand(
  transaction: CommandTransaction,
  command: CreateCommand,
  context: CommandContext,
): Promise<CreateRequestCommand> {
  const { actor } = context;
  switch (command.type) {
    case 'create_maintenance':
      return { kind: 'self', actor, details: await maintenanceDetails(transaction, command.payload, context) };
    case 'create_on_behalf': {
      const { payload } = command;
      return {
        kind: 'on_behalf',
        actor,
        requester: 'person_id' in payload.requester ? { personId: payload.requester.person_id } : { nameText: payload.requester.name_text },
        details: await onBehalfDetails(transaction, payload.details, context),
        markConfidential: payload.mark_confidential,
        confidentialNote: payload.confidential_note,
        relatedPersonIds: payload.related_person_ids,
        confirmConfidentialGrant: payload.confirm_confidential_grant,
      };
    }
    case 'create_gm_task': {
      const { payload } = command;
      return {
        kind: 'gm_task',
        actor,
        summaryTitle: payload.summary_title,
        category: payload.category,
        sensitivitySubject: payload.sensitivity_subject,
        description: payload.description,
        markConfidential: payload.mark_confidential,
        confidentialNote: payload.confidential_note,
        relatedPersonIds: payload.related_person_ids,
        confirmConfidentialGrant: payload.confirm_confidential_grant,
      };
    }
  }
}

async function onBehalfDetails(
  transaction: CommandTransaction,
  details: CreateOnBehalfPayload['details'],
  context: CommandContext,
) {
  if (details.type === 'maintenance') return maintenanceDetails(transaction, details, context);
  return {
    type: details.type,
    summaryTitle: details.summary_title,
    sensitivitySubject: details.sensitivity_subject,
    description: details.description,
  };
}

/** Fields of a new request (Part 6 §6.4.1); absent values are left out. Split before writing (D-S09-5). */
function newRequestRecord(draft: RequestDraft, requestNumber: string, now: Instant, assigneeId: string | undefined): RequestRecord {
  if (draft.category === undefined) throw new Error('every new request has a category (D-S04-2, P7-UX-02)');
  const optional = <K extends string, V>(key: K, value: V | undefined) =>
    (value === undefined ? {} : { [key]: value }) as { readonly [P in K]?: V };
  return {
    request_number: requestNumber,
    type: draft.type,
    source: draft.source,
    origin: draft.origin,
    created_by_id: draft.createdById,
    created_at: now,
    ...optional('requester_id', draft.requesterId),
    ...optional('requester_name_text', draft.requesterNameText),
    summary_title: draft.summaryTitle,
    ...optional('description', draft.description),
    category: draft.category,
    ...optional('location_id', draft.locationId),
    ...optional('area_id', draft.areaId),
    ...optional('symptom_key', draft.symptomKey),
    ...optional('assignee_id', assigneeId),
    is_confidential: draft.isConfidential,
    ...optional('sensitivity_reason', draft.sensitivityReason),
    ...optional('sensitivity_note', draft.sensitivityNote),
    related_person_ids: draft.relatedPersonIds ?? [],
    ...optional('confidential_grant_ids', draft.confidentialGrantIds),
    watcher_ids: [],
    status: 'queued',
    revision: 1,
    last_updated_at: now,
    activity_seq: 1,
    last_activity_at: now,
    completion_cycle_id: 0,
    // A06 / A1.3: a requester recorded by typed name has no account, so nobody can tell them.
    ...(draft.requesterNameText === undefined ? {} : requesterNoticeFields(noAccountNotice(1, now))),
  };
}

async function watch(transaction: CommandTransaction, requestId: string, context: CommandContext): Promise<CommandResult> {
  const path = `${REQUESTS_COLLECTION}/${requestId}`;
  const gmDetailPath = `${GM_REQUEST_DETAILS_COLLECTION}/${requestId}`;
  const stored = await transaction.get(path);
  const storedGmDetail = await transaction.get(gmDetailPath);
  if (stored === undefined) throw new CommandRejected('REQUEST_NOT_FOUND', 'No such request');
  const request = joinRequestRecord(
    stored as unknown as RequestDocument,
    storedGmDetail as unknown as GmRequestDetailDocument | undefined,
  );
  const current: WatchState = {
    type: request.type,
    source: request.source,
    status: request.status,
    ...(request.closed_at === undefined ? {} : { closedAt: request.closed_at }),
    isConfidential: request.is_confidential,
    ...(request.requester_id === undefined ? {} : { requesterId: request.requester_id }),
    watcherIds: request.watcher_ids,
  };
  const { state, outcome } = watchRequest(current, { actor: context.actor });
  if (outcome !== 'added') return { request_id: requestId, request_number: request.request_number, watch: outcome };
  // FU-08: every read before the first write.
  const userStatePath = `user_state/${context.actor.personId}/requests/${requestId}`;
  const userState = await transaction.get(userStatePath);
  const publicSummary = await transaction.get(`${PUBLIC_SUMMARIES_COLLECTION}/${requestId}`);
  const gmSummary = await transaction.get(`${GM_SUMMARIES_COLLECTION}/${requestId}`);
  transaction.set(gmDetailPath, { ...storedGmDetail, watcher_ids: state.watcherIds });
  // “มีผู้แจ้งเพิ่ม X คน”: distinct watchers, the requester never counted (U1).
  const count = watcherCount({ ...request, watcher_ids: state.watcherIds });
  if (publicSummary !== undefined) transaction.set(`${PUBLIC_SUMMARIES_COLLECTION}/${requestId}`, { ...publicSummary, watcher_count: count });
  if (gmSummary !== undefined) transaction.set(`${GM_SUMMARIES_COLLECTION}/${requestId}`, { ...gmSummary, watcher_count: count });
  // FU-08: “คำขอของฉัน” → เกี่ยวข้องกับฉัน shows it as a summary; nothing unread yet. A person who
  // already has another relation (e.g. related) keeps it.
  if (userState === undefined) {
    const seq = request.activity_seq ?? 0;
    transaction.set(userStatePath, { type: 'watcher', activity_seq: seq, last_seen_activity_seq: seq, created_at: context.now });
  }
  return { request_id: requestId, request_number: request.request_number, watch: outcome };
}
