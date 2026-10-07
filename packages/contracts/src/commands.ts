// Command contracts at the API boundary (S08: Part 6 §6.3/§6.6, D-S04-1). The wire format is
// snake_case like the stored fields. `parseCommand` refuses unknown fields at every level and
// returns a fresh object; the domain then applies the business rules. The actor is never in the
// body: it comes from the verified login (A01). Fields arrive with the task that implements them
// (a chosen assignee with routing, initial `waiting_on` with A21, watch note/photos with A13).
import {
  GM_CATEGORY_KEYS,
  SENSITIVITY_SUBJECTS,
  type GmCategory,
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
  requiredField,
  strictObject,
  stringField,
  type JsonObject,
} from './strict';
import { optionalPersonIdList, personIdField } from './person-id';

/** Mirrors Part 6 §6.6 createMaintenance / createOnBehalf / createGmTask / watchRequest. */
export const COMMAND_TYPES = ['create_maintenance', 'create_on_behalf', 'create_gm_task', 'watch_request'] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

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

interface Envelope<T extends CommandType, P> {
  readonly command_id: string;
  readonly type: T;
  readonly payload: P;
}

export type CommandEnvelope =
  | Envelope<'create_maintenance', CreateMaintenancePayload>
  | Envelope<'create_on_behalf', CreateOnBehalfPayload>
  | Envelope<'create_gm_task', CreateGmTaskPayload>
  | Envelope<'watch_request', WatchRequestPayload>;

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
  }
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
