// Projections of one `requests/{id}` document (S09: Part 6 §6.4/§6.4.1/§6.11, C6, C11, U1, U3, U4):
//   public  `request_summaries/{id}`     — allowlist, never for a confidential request
//   GM      `gm_request_summaries/{id}`  — board for GM, confidential included, with the stale flag
//   detail  `requests/{id}`              — the restricted layer itself, known fields only
// plus the company-wide `internal_board_count` for confidential requests. Pure: the caller passes
// `now`, the work calendar and display names; nothing here reads Firestore.
import type { CalendarSnapshot, Instant } from '@gm/time';
import type { RequestDocument, WaitingOnDocument } from './request-document';
import type { RequestSummaryDocument } from './request-summary';

export interface ProjectionContext {
  readonly now: Instant;
  /** The company work calendar (A) used for the stale clock. */
  readonly workCalendar: CalendarSnapshot;
  /** Display name for a person ID (from `people_picker`); never an email. */
  readonly personLabel: (personId: string) => string | undefined;
}

export interface GmRequestSummaryDocument {
  readonly request_id: string;
  readonly request_number: string;
  readonly summary_title: string;
  readonly type: RequestDocument['type'];
  readonly category: RequestDocument['category'];
  readonly source: RequestDocument['source'];
  readonly origin: RequestDocument['origin'];
  readonly location_id?: string;
  readonly area_id?: string;
  readonly symptom_key?: string;
  readonly status: RequestDocument['status'];
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
}

/** `board_counters/public`: company-wide count only, no IDs, titles or per-filter numbers. */
export interface BoardCountersDocument {
  readonly internal_board_count: number;
  readonly as_of: number;
}

function notImplemented(name: string): never {
  throw new Error(`${name}: not implemented yet (S09)`);
}

export function toGmRequestSummaryDocument(
  _requestId: string,
  _request: RequestDocument,
  _context: ProjectionContext,
): GmRequestSummaryDocument {
  return notImplemented('toGmRequestSummaryDocument');
}

export function toRequestDetailDocument(_request: RequestDocument): RequestDetailDocument {
  return notImplemented('toRequestDetailDocument');
}

export function buildRequestProjections(
  _requestId: string,
  _request: RequestDocument,
  _context: ProjectionContext,
): RequestProjections {
  return notImplemented('buildRequestProjections');
}

export function toBoardCountersDocument(_requests: Iterable<RequestDocument>, _now: Instant): BoardCountersDocument {
  return notImplemented('toBoardCountersDocument');
}
