// @gm/contracts — schemas shared by web, API and worker (Part 6 §6.3).
// Health response from S00; persisted calendar snapshot and SLA unit contracts added in S02;
// command contracts, persisted request and public summary added in S08.

export const SERVICE_NAMES = ['gm-api', 'gm-worker'] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: ServiceName;
}

export function healthResponse(service: ServiceName): HealthResponse {
  return { status: 'ok', service };
}
export {
  canonicalCalendarSnapshotJson,
  type CalendarSnapshotContent,
  type CalendarSnapshotDocument,
  type SlaDurationUnit,
} from './calendar';
export { canonicalJson } from './canonical-json';
export { ContractRejected, type ContractCode } from './strict';
export {
  COMMAND_TYPES,
  parseCommand,
  type CommandEnvelope,
  type CommandType,
  type CreateGmTaskPayload,
  type CreateMaintenancePayload,
  type CreateOnBehalfPayload,
  type DocumentDetailsPayload,
  type MaintenanceDetailsPayload,
  type MaintenanceSelection,
  type OnBehalfRequesterPayload,
  type WatchRequestPayload,
} from './commands';
export {
  GM_ONLY_REQUEST_FIELDS,
  REQUEST_DOCUMENT_FIELDS,
  joinRequestRecord,
  splitRequestRecord,
  type GmOnlyRequestField,
  type GmRequestDetailDocument,
  type RequestDocument,
  type RequestRecord,
  type WaitingOnDocument,
} from './request-document';
export {
  PRIVATE_REQUEST_FIELDS,
  PUBLIC_WAITING_LABELS,
  REQUEST_SUMMARY_FIELDS,
  isAwaitingConfirmation,
  publicWaitingLabel,
  toRequestSummaryDocument,
  watcherCount,
  type RequestSummaryDocument,
} from './request-summary';
export { PERSON_EMAIL_DOMAIN, isPersonId, personIdFromCsvEmail } from './person-id';
export {
  buildRequestProjections,
  toBoardCountersDocument,
  toGmRequestSummaryDocument,
  toRequestDetailDocument,
  type BoardCountersDocument,
  type GmRequestSummaryDocument,
  type ProjectionContext,
  type RequestDetailDocument,
  type RequestProjections,
} from './projections';
