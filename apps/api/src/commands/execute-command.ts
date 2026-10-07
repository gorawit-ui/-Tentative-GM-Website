// Command executor (S08: A4, Part 6 §6.6). One transaction per command:
//   1. `commands/{command_id}`: a stored command with the same fingerprint returns its first result;
//      a different fingerprint (payload, type or actor) is refused (COMMAND_ID_CONFLICT).
//   2. domain rules (@gm/domain) — a refused command stores nothing and uses no number.
//   3. a new request takes the next number from `system_counters/request_sequence` in the same
//      transaction, so concurrent creates never share or skip a number; watching takes none.
// Routing, outbox, projections and history join this transaction in A01/A03/A13.
import {
  joinRequestRecord,
  splitRequestRecord,
  toRequestDetailDocument,
  type CommandEnvelope,
  type CreateOnBehalfPayload,
  type GmRequestDetailDocument,
  type MaintenanceSelection,
  type RequestDocument,
  type RequestRecord,
} from '@gm/contracts';
import {
  createRequestDraft,
  formatRequestNumber,
  nextRequestSequence,
  watchRequest,
  type Actor,
  type CreateRequestCommand,
  type DeploymentEnvironment,
  type Labelled,
  type MaintenanceDetails,
  type RequestDraft,
  type WatchOutcome,
  type WatchState,
} from '@gm/domain';
import type { Instant } from '@gm/time';
import { commandFingerprint } from './fingerprint';
import type { CommandStore, CommandTransaction } from './transaction-port';

export const REQUEST_COUNTER_PATH = 'system_counters/request_sequence';
export const COMMANDS_COLLECTION = 'commands';
export const REQUESTS_COLLECTION = 'requests';
/** D-S09-5: watcher list and confidential note, GM only. */
export const GM_REQUEST_DETAILS_COLLECTION = 'gm_request_details';

/** D-S08-6: `commands/{id}` is kept 30 days through a Firestore TTL policy on `expire_at`. */
export const COMMAND_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const COMMAND_EXPIRY_FIELD = 'expire_at';

/** Refused by the executor itself; domain refusals keep their own error types and codes. */
export class CommandRejected extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CommandRejected';
    this.code = code;
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
  resolve(transaction: CommandTransaction, selection: MaintenanceSelection): Promise<MaintenanceLabels>;
}

/** D-S10-1: display names from `people/{person_id}` (read inside the transaction, before any write). */
export interface PeopleDirectory {
  displayNames(transaction: CommandTransaction, personIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
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
}

/** What the client gets back, the same on every retry of the same command ID. */
export interface CommandResult {
  readonly request_id: string;
  readonly request_number: string;
  /** watch_request only. */
  readonly watch?: WatchOutcome;
}

export interface CommandOutcome {
  /** True when this was a retry answered from `commands/{command_id}`. */
  readonly replayed: boolean;
  readonly result: CommandResult;
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
  const requestId = context.newRequestId();
  return store.runTransaction(async (transaction) => {
    const stored = await transaction.get(commandPath);
    if (stored !== undefined) {
      if (stored.fingerprint !== fingerprint) {
        throw new CommandRejected('COMMAND_ID_CONFLICT', 'This command ID was already used for a different command');
      }
      return { replayed: true, result: stored.result as CommandResult };
    }
    const result =
      command.type === 'watch_request'
        ? await watch(transaction, command.payload.request_id, context)
        : await create(transaction, command, context, requestId);
    transaction.set(commandPath, {
      type: command.type,
      actor_id: context.actor.personId,
      fingerprint,
      result,
      created_at: context.now,
      [COMMAND_EXPIRY_FIELD]: context.now + COMMAND_RETENTION_MS,
    });
    return { replayed: false, result };
  });
}

async function create(
  transaction: CommandTransaction,
  command: Exclude<CommandEnvelope, { readonly type: 'watch_request' }>,
  context: CommandContext,
  requestId: string,
): Promise<CommandResult> {
  const draft = createRequestDraft(await toDomainCommand(transaction, command, context));
  const counter = await transaction.get(REQUEST_COUNTER_PATH);
  if (counter !== undefined && counter.last_issued === undefined) {
    throw new RangeError('request counter document has no last_issued');
  }
  // D-S10-1: names are written with the request (read before any write in the transaction).
  const people = [draft.requesterId, ...(draft.relatedPersonIds ?? [])].filter((id): id is string => id !== undefined);
  const names = people.length === 0 ? new Map<string, string>() : await context.peopleDirectory.displayNames(transaction, people);
  const sequence = nextRequestSequence(counter?.last_issued as number | undefined);
  const requestNumber = formatRequestNumber(sequence, context.environment);
  transaction.set(REQUEST_COUNTER_PATH, { last_issued: sequence });
  const record = newRequestRecord(draft, requestNumber, context.now);
  const request = toRequestDetailDocument(record, { personLabel: (personId) => names.get(personId) });
  const { gmDetail } = splitRequestRecord(record);
  transaction.set(`${REQUESTS_COLLECTION}/${requestId}`, request);
  transaction.set(`${GM_REQUEST_DETAILS_COLLECTION}/${requestId}`, gmDetail);
  return { request_id: requestId, request_number: requestNumber };
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
  command: Exclude<CommandEnvelope, { readonly type: 'watch_request' }>,
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
function newRequestRecord(draft: RequestDraft, requestNumber: string, now: Instant): RequestRecord {
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
    is_confidential: draft.isConfidential,
    ...optional('sensitivity_reason', draft.sensitivityReason),
    ...optional('sensitivity_note', draft.sensitivityNote),
    related_person_ids: draft.relatedPersonIds ?? [],
    ...optional('confidential_grant_ids', draft.confidentialGrantIds),
    watcher_ids: [],
    status: 'queued',
    revision: 1,
    last_updated_at: now,
    completion_cycle_id: 0,
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
  if (outcome === 'added') transaction.set(gmDetailPath, { ...storedGmDetail, watcher_ids: state.watcherIds });
  return { request_id: requestId, request_number: request.request_number, watch: outcome };
}
