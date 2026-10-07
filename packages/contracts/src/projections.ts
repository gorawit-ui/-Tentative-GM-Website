// Projections of one `requests/{id}` document (S09: Part 6 §6.4/§6.4.1/§6.11, C6, C11, U1, U3, U4):
//   public  `request_summaries/{id}`     — allowlist, never for a confidential request
//   GM      `gm_request_summaries/{id}`  — board for GM, confidential included, with the stale flag
//   detail  `requests/{id}`              — the restricted layer itself, known fields only
// plus the company-wide `internal_board_count` for confidential requests. Pure: the caller passes
// `now`, the work calendar and display names; nothing here reads Firestore.
import { staleState, type CalendarSnapshot, type Instant } from '@gm/time';
import {
  splitRequestRecord,
  type GmRequestDetailDocument,
  type RequestDocument,
  type RequestRecord,
  type WaitingOnDocument,
} from './request-document';
import {
  isAwaitingConfirmation,
  toRequestSummaryDocument,
  watcherCount,
  type RequestSummaryDocument,
} from './request-summary';

export interface ProjectionContext {
  readonly now: Instant;
  /** The company work calendar (A) used for the stale clock. */
  readonly workCalendar: CalendarSnapshot;
  /** Display name for a person ID (from `people_picker`); never an email. */
  readonly personLabel: (personId: string) => string | undefined;
  /** D-S09-1: the team label of a person (from `people_picker`), shown instead of their name. */
  readonly personTeamLabel: (personId: string) => string | undefined;
}

export interface GmRequestSummaryDocument {
  readonly request_id: string;
  readonly request_number: string;
  readonly summary_title: string;
  readonly type: RequestRecord['type'];
  readonly category: RequestRecord['category'];
  readonly source: RequestRecord['source'];
  readonly origin: RequestRecord['origin'];
  readonly location_id?: string;
  readonly area_id?: string;
  readonly symptom_key?: string;
  readonly status: RequestRecord['status'];
  readonly awaiting_confirmation: boolean;
  readonly is_confidential: boolean;
  readonly assignee_id?: string;
  readonly assignee_label?: string;
  readonly waiting_on_kind?: WaitingOnDocument['kind'];
  readonly waiting_on_label?: string;
  readonly waiting_since?: number;
  readonly waiting_party_responded?: boolean;
  readonly created_at: number;
  readonly last_updated_at: number;
  readonly completed_at?: number;
  readonly closed_at?: number;
  readonly cancelled_at?: number;
  readonly auto_close_due_at?: number;
  readonly watcher_count: number;
  /** U4: only GM see stale; raw > 3 business days since `last_updated_at`, open statuses only. */
  readonly stale: boolean;
  /** When an open request becomes stale (for the scheduler); absent once it is not open. */
  readonly stale_threshold_at?: number;
}

/** `requests/{id}` as read by people with detail access; only known fields are kept. */
export type RequestDetailDocument = RequestDocument;

export interface RequestProjections {
  readonly public: RequestSummaryDocument | null;
  readonly gm: GmRequestSummaryDocument;
  readonly detail: RequestDetailDocument;
  /** `gm_request_details/{id}`: watcher list and confidential note, GM only (D-S09-5). */
  readonly gmDetail: GmRequestDetailDocument;
}

/** `board_counters/public`: company-wide count only, no IDs, titles or per-filter numbers. */
export interface BoardCountersDocument {
  readonly internal_board_count: number;
  readonly as_of: number;
}

const OPEN_STATUSES: readonly RequestRecord['status'][] = ['queued', 'in_progress', 'waiting'];

/** Copied as they are into the GM summary; private detail (text, photos, people, notes) is left behind. */
const GM_COPIED_FIELDS = [
  'request_number',
  'summary_title',
  'type',
  'category',
  'source',
  'origin',
  'location_id',
  'area_id',
  'symptom_key',
  'status',
  'is_confidential',
  'assignee_id',
  'waiting_since',
  'waiting_party_responded',
  'created_at',
  'last_updated_at',
  'completed_at',
  'closed_at',
  'cancelled_at',
  'auto_close_due_at',
] as const satisfies readonly (keyof RequestRecord & keyof GmRequestSummaryDocument)[];

function pick<K extends keyof RequestRecord>(request: RequestRecord, fields: readonly K[]): Partial<Pick<RequestRecord, K>> {
  return Object.fromEntries(fields.filter((field) => request[field] !== undefined).map((field) => [field, request[field]])) as Partial<
    Pick<RequestRecord, K>
  >;
}

/** The real waited party for GM: a person's display name, the team label, or the external name. */
function waitingOnLabel(waitingOn: WaitingOnDocument, context: ProjectionContext): string | undefined {
  if (waitingOn.kind === 'person') return waitingOn.person_id === undefined ? undefined : context.personLabel(waitingOn.person_id);
  if (waitingOn.kind === 'team') return waitingOn.team_label;
  return waitingOn.name;
}

export function toGmRequestSummaryDocument(
  requestId: string,
  request: RequestRecord,
  context: ProjectionContext,
): GmRequestSummaryDocument {
  const assigneeLabel = request.assignee_id === undefined ? undefined : context.personLabel(request.assignee_id);
  const waitingOn = request.status === 'waiting' ? request.waiting_on : undefined;
  const waitingLabel = waitingOn === undefined ? undefined : waitingOnLabel(waitingOn, context);
  const open = OPEN_STATUSES.includes(request.status);
  const stale = open ? staleState(request.last_updated_at, context.now, context.workCalendar) : undefined;
  return {
    request_id: requestId,
    ...pick(request, GM_COPIED_FIELDS),
    awaiting_confirmation: isAwaitingConfirmation(request),
    ...(assigneeLabel === undefined ? {} : { assignee_label: assigneeLabel }),
    ...(waitingOn === undefined ? {} : { waiting_on_kind: waitingOn.kind }),
    ...(waitingLabel === undefined ? {} : { waiting_on_label: waitingLabel }),
    watcher_count: watcherCount(request),
    stale: stale?.stale ?? false,
    ...(stale === undefined ? {} : { stale_threshold_at: stale.thresholdAt }),
  } as GmRequestSummaryDocument;
}

/** The restricted layer: the request's own known fields (unknown stored keys are dropped). */
export function toRequestDetailDocument(request: RequestRecord): RequestDetailDocument {
  return splitRequestRecord(request).request;
}

/** All three projections of one request, written together in the command transaction (A01/A03). */
export function buildRequestProjections(requestId: string, request: RequestRecord, context: ProjectionContext): RequestProjections {
  const { request: detail, gmDetail } = splitRequestRecord(request);
  return {
    public: toRequestSummaryDocument(requestId, request, context),
    gm: toGmRequestSummaryDocument(requestId, request, context),
    detail,
    gmDetail,
  };
}

/**
 * “งานภายใน X รายการ” (D-S09-4): confidential requests still open — queued, in progress, waiting or
 * completed awaiting confirmation — company-wide, no detail. Closed or cancelled ones are not counted,
 * so the number only changes when a request is written, never just because time passes.
 */
export function toBoardCountersDocument(requests: Iterable<RequestRecord>, now: Instant): BoardCountersDocument {
  let count = 0;
  for (const request of requests) {
    if (!request.is_confidential) continue;
    const open = OPEN_STATUSES.includes(request.status) || isAwaitingConfirmation(request);
    if (open) count += 1;
  }
  return { internal_board_count: count, as_of: now };
}
