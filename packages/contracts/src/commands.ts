// Command contracts at the API boundary (S08: Part 6 §6.3/§6.6, D-S04-1). The wire format is
// snake_case like the stored fields. `parseCommand` refuses unknown fields at every level and
// returns a fresh object; the domain then applies the business rules. The actor is never in the
// body: it comes from the verified login (A01). Fields arrive with the task that implements them
// (a chosen assignee with routing, initial `waiting_on` with A21, watch note/photos with A13).
import type { GmCategory, SensitivitySubject } from '@gm/domain';

/** Mirrors Part 6 §6.6 createMaintenance / createOnBehalf / createGmTask / watchRequest. */
export const COMMAND_TYPES = ['create_maintenance', 'create_on_behalf', 'create_gm_task', 'watch_request'] as const;
export type CommandType = (typeof COMMAND_TYPES)[number];

/** Commands that save a new request and therefore take a request number (A4). */
export const REQUEST_CREATING_COMMANDS = ['create_maintenance', 'create_on_behalf', 'create_gm_task'] as const satisfies readonly CommandType[];

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

export interface CreateOnBehalfPayload {
  readonly requester: OnBehalfRequesterPayload;
  readonly details: MaintenanceDetailsPayload | DocumentDetailsPayload;
  readonly mark_confidential?: boolean;
  readonly confidential_note?: string;
}

export interface CreateGmTaskPayload {
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

/** Reads an untrusted command body; throws `ContractRejected` with the first problem found. */
export function parseCommand(_body: unknown): CommandEnvelope {
  void COMMAND_ID_PATTERN;
  throw new Error('not implemented yet (S08)');
}
