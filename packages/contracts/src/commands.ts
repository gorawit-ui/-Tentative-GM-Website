// Command contracts at the API boundary (S08: Part 6 §6.3/§6.6, D-S04-1). The wire format is
// snake_case like the stored fields. `parseCommand` refuses unknown fields at every level and
// returns a fresh object; the domain then applies the business rules. The actor is never in the
// body: it comes from the verified login (A01). Fields arrive with the task that implements them
// (a chosen assignee with routing, initial `waiting_on` with A21, watch note/photos with A13).
// A03: lifecycle commands on an existing request carry `expected_revision` (Part 6 §6.6: a stale
// revision is refused with the latest state, never silently written over).
// A04: waiting / follow-up / the waited party's answer / resume, and (FU-12, FU-09) related persons
// and the confidential flag. The answer names its waiting interval instead of a revision (A2.3: the
// button checks the interval, access and latest status, so a GM's follow-up does not void it).
import {
  GM_CATEGORY_KEYS,
  SENSITIVITY_REASONS,
  SENSITIVITY_SUBJECTS,
  type GmCategory,
  type SensitivityReason,
  type SensitivitySubject,
} from '@gm/domain';
import {
  ContractRejected,
  enumField,
  idField,
  isPlainObject,
  optional,
  optionalBoolean,
  optionalId,
  optionalString,
  positiveIntegerField,
  requiredField,
  strictObject,
  stringField,
  type JsonObject,
} from './strict';
import { optionalPersonIdList, personIdField } from './person-id';

/** Mirrors Part 6 §6.6 createMaintenance / createOnBehalf / createGmTask / watchRequest and (A03)
 * accept / complete / confirm / notResolved / cancel / reopen. */
export const COMMAND_TYPES = [
  'create_maintenance',
  'create_on_behalf',
  'create_gm_task',
  'watch_request',
  'accept_request',
  'complete_request',
  'confirm_completion',
  'report_not_resolved',
  'cancel_request',
  'reopen_request',
  'enter_waiting',
  'change_waiting_party',
  'follow_up',
  'respond_waiting_party',
  'resume_work',
  'add_related_persons',
  'remove_related_person',
  'mark_confidential',
  'remove_confidential_flag',
] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

/** A03: the lifecycle commands (S05), each on an existing request at a known revision. */
export const LIFECYCLE_COMMAND_TYPES = [
  'accept_request',
  'complete_request',
  'confirm_completion',
  'report_not_resolved',
  'cancel_request',
  'reopen_request',
] as const satisfies readonly CommandType[];
export type LifecycleCommandType = (typeof LIFECYCLE_COMMAND_TYPES)[number];

/** A04: waiting (S06) and, on the same pipeline, related persons (FU-12) and the confidential flag (FU-09). */
export const WAITING_COMMAND_TYPES = [
  'enter_waiting',
  'change_waiting_party',
  'follow_up',
  'respond_waiting_party',
  'resume_work',
  'add_related_persons',
  'remove_related_person',
  'mark_confidential',
  'remove_confidential_flag',
] as const satisfies readonly CommandType[];
export type WaitingCommandType = (typeof WAITING_COMMAND_TYPES)[number];

/** The client's idempotency key: a lowercase UUID (e.g. `crypto.randomUUID()`), one per action. */
const COMMAND_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Place, area and symptom chosen from the catalog; the server builds the title (U2). */
export interface MaintenanceSelection {
  readonly location_id: string;
  readonly area_id?: string;
  readonly symptom_key: string;
  /** Free text: restricted detail only. */
  readonly description?: string;
}

export type CreateMaintenancePayload = MaintenanceSelection;

export type MaintenanceDetailsPayload = { readonly type: 'maintenance' } & MaintenanceSelection;

export interface DocumentDetailsPayload {
  readonly type: 'document_request' | 'document_intake';
  readonly summary_title: string;
  readonly sensitivity_subject: SensitivitySubject;
  readonly description?: string;
}

export type OnBehalfRequesterPayload = { readonly person_id: string } | { readonly name_text: string };

/** FU-07: related persons chosen in a GM form, and the separate grant confirmation for a confidential request (C3). */
export interface RelatedChoicePayload {
  readonly related_person_ids?: readonly string[];
  readonly confirm_confidential_grant?: boolean;
}

export interface CreateOnBehalfPayload extends RelatedChoicePayload {
  readonly requester: OnBehalfRequesterPayload;
  readonly details: MaintenanceDetailsPayload | DocumentDetailsPayload;
  readonly mark_confidential?: boolean;
  readonly confidential_note?: string;
}

export interface CreateGmTaskPayload extends RelatedChoicePayload {
  readonly summary_title: string;
  /** One of the 7 category keys; never the Thai label (D-S04-1). */
  readonly category: GmCategory;
  readonly sensitivity_subject: SensitivitySubject;
  readonly description?: string;
  readonly mark_confidential?: boolean;
  readonly confidential_note?: string;
}

export interface WatchRequestPayload {
  readonly request_id: string;
}

/** A03: every lifecycle command names the request and the revision the user acted on. */
export interface RevisionedPayload {
  readonly request_id: string;
  readonly expected_revision: number;
}

export interface AcceptRequestPayload extends RevisionedPayload {
  /** D-S05-5: explicit take-over of a request assigned to another GM. */
  readonly take_over?: boolean;
}

export interface CompleteRequestPayload extends RevisionedPayload {
  readonly resolution_summary: string;
}

export interface ConfirmCompletionPayload extends RevisionedPayload {
  readonly completion_cycle_id: number;
}

export interface ReportNotResolvedPayload extends RevisionedPayload {
  readonly completion_cycle_id: number;
  readonly reason: string;
}

export interface ReasonPayload extends RevisionedPayload {
  readonly reason: string;
}

/** C3 `waiting_on` as submitted; no default (F3) — the domain refuses a missing or incomplete party. */
export interface WaitingOnPayload {
  readonly kind?: string;
  readonly person_id?: string;
  readonly team_label?: string;
  readonly contact_ids?: readonly string[];
  readonly name?: string;
}

/** enter_waiting / change_waiting_party (F05 §9.1–9.3). */
export interface WaitingPartyPayload extends RevisionedPayload {
  readonly waiting_on?: WaitingOnPayload;
  /** Person: on unless turned off; team: on when contacts are chosen; external: unavailable. */
  readonly notify?: boolean;
  /** C3: the separate consent for new readers of a confidential request. */
  readonly confirm_confidential_grant?: boolean;
  /** D-A07-1: the GM's optional note to the waited party (kept on the interval, shown in their message for a general request). */
  readonly note?: string;
}

export interface FollowUpPayload extends RevisionedPayload {
  /** “ส่งเตือนอีกครั้ง”: once per business day per request (C3, Part 6 §6.14). */
  readonly remind?: boolean;
}

/** “ฝั่งฉันเรียบร้อยแล้ว” (A2.1): the interval the button was shown for, and an optional note. */
export interface RespondWaitingPartyPayload {
  readonly request_id: string;
  readonly waiting_interval_id: number;
  readonly note?: string;
}

export interface AddRelatedPersonsPayload extends RevisionedPayload {
  readonly person_ids: readonly string[];
  readonly confirm_confidential_grant?: boolean;
}

export interface RemoveRelatedPersonPayload extends RevisionedPayload {
  readonly person_id: string;
}

/** D-ACL-2: the GM confirms which related persons keep access (`[]` keeps nobody; missing is refused). */
export interface MarkConfidentialPayload extends RevisionedPayload {
  readonly sensitivity_reason: SensitivityReason;
  readonly note?: string;
  readonly keep_related_person_ids?: readonly string[];
}

interface Envelope<T extends CommandType, P> {
  readonly command_id: string;
  readonly type: T;
  readonly payload: P;
}

export type CommandEnvelope =
  | Envelope<'create_maintenance', CreateMaintenancePayload>
  | Envelope<'create_on_behalf', CreateOnBehalfPayload>
  | Envelope<'create_gm_task', CreateGmTaskPayload>
  | Envelope<'watch_request', WatchRequestPayload>
  | Envelope<'accept_request', AcceptRequestPayload>
  | Envelope<'complete_request', CompleteRequestPayload>
  | Envelope<'confirm_completion', ConfirmCompletionPayload>
  | Envelope<'report_not_resolved', ReportNotResolvedPayload>
  | Envelope<'cancel_request', ReasonPayload>
  | Envelope<'reopen_request', ReasonPayload>
  | Envelope<'enter_waiting', WaitingPartyPayload>
  | Envelope<'change_waiting_party', WaitingPartyPayload>
  | Envelope<'follow_up', FollowUpPayload>
  | Envelope<'respond_waiting_party', RespondWaitingPartyPayload>
  | Envelope<'resume_work', RevisionedPayload>
  | Envelope<'add_related_persons', AddRelatedPersonsPayload>
  | Envelope<'remove_related_person', RemoveRelatedPersonPayload>
  | Envelope<'mark_confidential', MarkConfidentialPayload>
  | Envelope<'remove_confidential_flag', ReasonPayload>;

export type LifecycleCommandEnvelope = Extract<CommandEnvelope, { readonly type: LifecycleCommandType }>;
export type WaitingCommandEnvelope = Extract<CommandEnvelope, { readonly type: WaitingCommandType }>;

export function isLifecycleCommand(command: CommandEnvelope): command is LifecycleCommandEnvelope {
  return (LIFECYCLE_COMMAND_TYPES as readonly string[]).includes(command.type);
}

export function isWaitingCommand(command: CommandEnvelope): command is WaitingCommandEnvelope {
  return (WAITING_COMMAND_TYPES as readonly string[]).includes(command.type);
}

function maintenanceSelection(object: JsonObject, path: string): MaintenanceSelection {
  return {
    location_id: idField(object, path, 'location_id'),
    ...optional('area_id', optionalId(object, path, 'area_id')),
    symptom_key: idField(object, path, 'symptom_key'),
    ...optional('description', optionalString(object, path, 'description')),
  };
}

const MAINTENANCE_FIELDS = ['location_id', 'area_id', 'symptom_key', 'description'] as const;

function serviceDetails(value: unknown, path: string): MaintenanceDetailsPayload | DocumentDetailsPayload {
  if (!isPlainObject(value)) throw new ContractRejected('FIELD_TYPE', path, `${path} must be an object`);
  const type = enumField(value, path, 'type', ['maintenance', 'document_request', 'document_intake'] as const);
  if (type === 'maintenance') {
    const details = strictObject(value, path, ['type', ...MAINTENANCE_FIELDS]);
    return { type, ...maintenanceSelection(details, path) };
  }
  const details = strictObject(value, path, ['type', 'summary_title', 'sensitivity_subject', 'description']);
  return {
    type,
    summary_title: stringField(details, path, 'summary_title'),
    sensitivity_subject: enumField(details, path, 'sensitivity_subject', SENSITIVITY_SUBJECTS),
    ...optional('description', optionalString(details, path, 'description')),
  };
}

function onBehalfRequester(value: unknown, path: string): OnBehalfRequesterPayload {
  const requester = strictObject(value, path, ['person_id', 'name_text']);
  const hasPerson = Object.hasOwn(requester, 'person_id');
  if (hasPerson === Object.hasOwn(requester, 'name_text')) {
    throw new ContractRejected('FIELD_INVALID', path, 'choose either a directory account or a typed name');
  }
  return hasPerson ? { person_id: personIdField(requester, path, 'person_id') } : { name_text: stringField(requester, path, 'name_text') };
}

function confidentialChoice(object: JsonObject, path: string) {
  return {
    ...optional('mark_confidential', optionalBoolean(object, path, 'mark_confidential')),
    ...optional('confidential_note', optionalString(object, path, 'confidential_note')),
  };
}

function relatedChoice(object: JsonObject, path: string) {
  return {
    ...optional('related_person_ids', optionalPersonIdList(object, path, 'related_person_ids')),
    ...optional('confirm_confidential_grant', optionalBoolean(object, path, 'confirm_confidential_grant')),
  };
}

const RELATED_FIELDS = ['related_person_ids', 'confirm_confidential_grant'] as const;

function waitingOn(value: unknown, path: string): WaitingOnPayload {
  const party = strictObject(value, path, ['kind', 'person_id', 'team_label', 'contact_ids', 'name']);
  return {
    ...optional('kind', optionalString(party, path, 'kind')),
    ...optional('person_id', Object.hasOwn(party, 'person_id') ? personIdField(party, path, 'person_id') : undefined),
    ...optional('team_label', optionalString(party, path, 'team_label')),
    ...optional('contact_ids', optionalPersonIdList(party, path, 'contact_ids')),
    ...optional('name', optionalString(party, path, 'name')),
  };
}

function waitingParty(payload: JsonObject, path: string): WaitingPartyPayload {
  return {
    ...revisioned(payload, path),
    ...optional('waiting_on', Object.hasOwn(payload, 'waiting_on') ? waitingOn(payload.waiting_on, `${path}.waiting_on`) : undefined),
    ...optional('notify', optionalBoolean(payload, path, 'notify')),
    ...optional('confirm_confidential_grant', optionalBoolean(payload, path, 'confirm_confidential_grant')),
    ...optional('note', optionalString(payload, path, 'note')),
  };
}

function payloadOf(type: CommandType, value: unknown): CommandEnvelope['payload'] {
  const path = 'payload';
  switch (type) {
    case 'create_maintenance':
      return maintenanceSelection(strictObject(value, path, MAINTENANCE_FIELDS), path);
    case 'create_on_behalf': {
      const payload = strictObject(value, path, ['requester', 'details', 'mark_confidential', 'confidential_note', ...RELATED_FIELDS]);
      return {
        requester: onBehalfRequester(requiredField(payload, path, 'requester'), `${path}.requester`),
        details: serviceDetails(requiredField(payload, path, 'details'), `${path}.details`),
        ...confidentialChoice(payload, path),
        ...relatedChoice(payload, path),
      };
    }
    case 'create_gm_task': {
      const payload = strictObject(value, path, [
        'summary_title',
        'category',
        'sensitivity_subject',
        'description',
        'mark_confidential',
        'confidential_note',
        ...RELATED_FIELDS,
      ]);
      return {
        summary_title: stringField(payload, path, 'summary_title'),
        category: enumField(payload, path, 'category', GM_CATEGORY_KEYS),
        sensitivity_subject: enumField(payload, path, 'sensitivity_subject', SENSITIVITY_SUBJECTS),
        ...optional('description', optionalString(payload, path, 'description')),
        ...confidentialChoice(payload, path),
        ...relatedChoice(payload, path),
      };
    }
    case 'watch_request': {
      const payload = strictObject(value, path, ['request_id']);
      return { request_id: idField(payload, path, 'request_id') };
    }
    case 'accept_request': {
      const payload = strictObject(value, path, ['request_id', 'expected_revision', 'take_over']);
      return { ...revisioned(payload, path), ...optional('take_over', optionalBoolean(payload, path, 'take_over')) };
    }
    case 'complete_request': {
      const payload = strictObject(value, path, ['request_id', 'expected_revision', 'resolution_summary']);
      return { ...revisioned(payload, path), resolution_summary: stringField(payload, path, 'resolution_summary') };
    }
    case 'confirm_completion': {
      const payload = strictObject(value, path, ['request_id', 'expected_revision', 'completion_cycle_id']);
      return { ...revisioned(payload, path), completion_cycle_id: positiveIntegerField(payload, path, 'completion_cycle_id') };
    }
    case 'report_not_resolved': {
      const payload = strictObject(value, path, ['request_id', 'expected_revision', 'completion_cycle_id', 'reason']);
      return {
        ...revisioned(payload, path),
        completion_cycle_id: positiveIntegerField(payload, path, 'completion_cycle_id'),
        reason: stringField(payload, path, 'reason'),
      };
    }
    case 'cancel_request':
    case 'reopen_request':
    case 'remove_confidential_flag': {
      const payload = strictObject(value, path, ['request_id', 'expected_revision', 'reason']);
      return { ...revisioned(payload, path), reason: stringField(payload, path, 'reason') };
    }
    case 'enter_waiting':
    case 'change_waiting_party':
      return waitingParty(strictObject(value, path, ['request_id', 'expected_revision', 'waiting_on', 'notify', 'confirm_confidential_grant', 'note']), path);
    case 'follow_up': {
      const payload = strictObject(value, path, ['request_id', 'expected_revision', 'remind']);
      return { ...revisioned(payload, path), ...optional('remind', optionalBoolean(payload, path, 'remind')) };
    }
    case 'respond_waiting_party': {
      const payload = strictObject(value, path, ['request_id', 'waiting_interval_id', 'note']);
      return {
        request_id: idField(payload, path, 'request_id'),
        waiting_interval_id: positiveIntegerField(payload, path, 'waiting_interval_id'),
        ...optional('note', optionalString(payload, path, 'note')),
      };
    }
    case 'resume_work':
      return revisioned(strictObject(value, path, ['request_id', 'expected_revision']), path);
    case 'add_related_persons': {
      const payload = strictObject(value, path, ['request_id', 'expected_revision', 'person_ids', 'confirm_confidential_grant']);
      requiredField(payload, path, 'person_ids');
      return {
        ...revisioned(payload, path),
        person_ids: optionalPersonIdList(payload, path, 'person_ids') ?? [],
        ...optional('confirm_confidential_grant', optionalBoolean(payload, path, 'confirm_confidential_grant')),
      };
    }
    case 'remove_related_person': {
      const payload = strictObject(value, path, ['request_id', 'expected_revision', 'person_id']);
      return { ...revisioned(payload, path), person_id: personIdField(payload, path, 'person_id') };
    }
    case 'mark_confidential': {
      const payload = strictObject(value, path, ['request_id', 'expected_revision', 'sensitivity_reason', 'note', 'keep_related_person_ids']);
      return {
        ...revisioned(payload, path),
        sensitivity_reason: enumField(payload, path, 'sensitivity_reason', SENSITIVITY_REASONS),
        ...optional('note', optionalString(payload, path, 'note')),
        ...optional('keep_related_person_ids', optionalPersonIdList(payload, path, 'keep_related_person_ids')),
      };
    }
  }
}

function revisioned(payload: JsonObject, path: string): RevisionedPayload {
  return { request_id: idField(payload, path, 'request_id'), expected_revision: positiveIntegerField(payload, path, 'expected_revision') };
}

/** Reads an untrusted command body; throws `ContractRejected` with the first problem found. */
export function parseCommand(body: unknown): CommandEnvelope {
  if (!isPlainObject(body)) throw new ContractRejected('BODY_INVALID', '', 'the body must be a JSON object');
  const envelope = strictObject(body, '', ['command_id', 'type', 'payload']);
  const commandId = envelope.command_id;
  if (typeof commandId !== 'string' || !COMMAND_ID_PATTERN.test(commandId)) {
    throw new ContractRejected('COMMAND_ID_INVALID', 'command_id', 'command_id must be a lowercase UUID');
  }
  const type = envelope.type;
  if (typeof type !== 'string' || !(COMMAND_TYPES as readonly string[]).includes(type)) {
    throw new ContractRejected('COMMAND_TYPE_UNKNOWN', 'type', 'unknown command type');
  }
  const payload = payloadOf(type as CommandType, requiredField(envelope, '', 'payload'));
  return { command_id: commandId, type, payload } as CommandEnvelope;
}

/** A04 — the waiting preview (F05 §9.2): the party and the notify choice, read like enter_waiting. */
export interface WaitingPreviewBody {
  readonly waiting_on?: WaitingOnPayload;
  readonly notify?: boolean;
}

export function parseWaitingPreview(body: unknown): WaitingPreviewBody {
  const object = strictObject(body, '', ['waiting_on', 'notify']);
  return {
    ...optional('waiting_on', Object.hasOwn(object, 'waiting_on') ? waitingOn(object.waiting_on, 'waiting_on') : undefined),
    ...optional('notify', optionalBoolean(object, '', 'notify')),
  };
}

/** A04 / FU-12 — the related-persons preview (C3): who would become related and who needs the grant. */
export function parseRelatedPreview(body: unknown): { readonly person_ids: readonly string[] } {
  const object = strictObject(body, '', ['person_ids']);
  requiredField(object, '', 'person_ids');
  return { person_ids: optionalPersonIdList(object, '', 'person_ids') ?? [] };
}
