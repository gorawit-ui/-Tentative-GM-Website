// Request fields (Part 6 §6.4.1), snake_case like D-S01-1. S08 writes the fields known at creation;
// later tasks fill the rest (routing A01, lifecycle A03, waiting A04, SLA B01). Instants are UTC epoch
// milliseconds here; the Firestore adapter maps them to Timestamps (A01).
// D-S09-5: a request is stored as two documents. `RequestRecord` is the whole request in memory;
// `requests/{id}` (`RequestDocument`) leaves out the watcher list and the confidential note, which live
// in `gm_request_details/{id}` (`GmRequestDetailDocument`, GM only).
import type { CalendarSnapshotDocument } from './calendar';
import type {
  RequesterNoticeReason,
  RequesterNoticeState,
  ClosureKind,
  GmCategory,
  RequestOrigin,
  RequestStatus,
  RequestType,
  SensitivityReason,
} from '@gm/domain';

export interface RequestRecord {
  readonly request_number: string;
  readonly type: RequestType;
  readonly source: 'web' | 'trello';
  readonly origin: RequestOrigin;
  readonly created_by_id: string;
  readonly created_at: number;
  /** Only a real requester account; never on a gm_task (C2). */
  readonly requester_id?: string;
  readonly requester_name_text?: string;
  readonly summary_title: string;
  readonly description?: string;
  readonly category: GmCategory;
  readonly location_id?: string;
  readonly area_id?: string;
  readonly symptom_key?: string;
  readonly attachment_ids?: readonly string[];
  /** Absent = “ยังไม่มอบหมาย”. */
  readonly assignee_id?: string;
  readonly is_confidential: boolean;
  readonly sensitivity_reason?: SensitivityReason;
  readonly sensitivity_note?: string;
  readonly related_person_ids: readonly string[];
  /** D-S09-2: people whose access to a confidential request was confirmed separately (C3, F3). */
  readonly confidential_grant_ids?: readonly string[];
  readonly watcher_ids: readonly string[];
  /** Reporting only; never grants access (C4). */
  readonly team_labels?: readonly string[];
  readonly status: RequestStatus;
  readonly revision: number;
  /** GM progress clock (stale). */
  readonly last_updated_at: number;
  /** A03: unread clock (Part 6 §6.4.1) — one step per event people with access can see; absent = 0. */
  readonly activity_seq?: number;
  readonly last_activity_at?: number;
  readonly completion_cycle_id: number;
  readonly completed_at?: number;
  readonly closed_at?: number;
  readonly closure_kind?: ClosureKind;
  readonly cancelled_at?: number;
  readonly auto_close_due_at?: number;
  /** Company calendar copied when the confirmation wait starts (Part 6 §6.4.1/§6.7). */
  readonly confirmation_calendar_snapshot?: CalendarSnapshotDocument;
  /** Current waiting party (C3, Part 6 §6.14); absent unless `status` is `waiting`. */
  readonly waiting_on?: WaitingOnDocument;
  readonly current_waiting_interval_id?: number;
  readonly waiting_since?: number;
  readonly waiting_party_responded?: boolean;
  readonly responded_at?: number;
  /** A06: “ผู้ขอยังไม่ได้รับแจ้ง” (GM only, A1.2); absent = nothing to show. */
  readonly requester_not_notified?: RequesterNotNotifiedDocument;
  /** A06: highest unread step known to have reached the requester (delivered or opened in the web). */
  readonly requester_notified_seq?: number;
}

/** A06: the GM-only badge as stored (snake_case of `RequesterNoticeIssue`). */
export interface RequesterNotNotifiedDocument {
  readonly reason: RequesterNoticeReason;
  readonly code?: string;
  readonly activity_seq: number;
  readonly at: number;
}

/** Fields kept out of `requests/{id}` (readable by the requester and related persons), D-S09-5 / A06. */
export const GM_ONLY_REQUEST_FIELDS = ['watcher_ids', 'sensitivity_note', 'requester_not_notified', 'requester_notified_seq'] as const satisfies readonly (keyof RequestRecord)[];
export type GmOnlyRequestField = (typeof GM_ONLY_REQUEST_FIELDS)[number];

/** `requests/{id}`: the detail layer for GM, the requester and related persons. */
export type RequestDocument = Omit<RequestRecord, GmOnlyRequestField>;

/** `gm_request_details/{id}`: GM-only part of the request (D-S09-5). */
export interface GmRequestDetailDocument {
  readonly watcher_ids: readonly string[];
  readonly sensitivity_note?: string;
  readonly requester_not_notified?: RequesterNotNotifiedDocument;
  readonly requester_notified_seq?: number;
}

/** A06: the stored badge fields as the domain state (`requesterNoticeAfter`). */
export function requesterNoticeStateOf(record: Pick<RequestRecord, 'requester_not_notified' | 'requester_notified_seq'>): RequesterNoticeState {
  const stored = record.requester_not_notified;
  return {
    notifiedSeq: record.requester_notified_seq ?? 0,
    ...(stored === undefined
      ? {}
      : { issue: { reason: stored.reason, ...(stored.code === undefined ? {} : { code: stored.code }), activitySeq: stored.activity_seq, at: stored.at } }),
  };
}

/** A06: the domain state as stored fields; nothing stored for “nothing to show, nothing known”. */
export function requesterNoticeFields(state: RequesterNoticeState): Pick<RequestRecord, 'requester_not_notified' | 'requester_notified_seq'> {
  const { issue } = state;
  return {
    ...(state.notifiedSeq > 0 ? { requester_notified_seq: state.notifiedSeq } : {}),
    ...(issue === undefined
      ? {}
      : {
          requester_not_notified: {
            reason: issue.reason,
            ...(issue.code === undefined ? {} : { code: issue.code }),
            activity_seq: issue.activitySeq,
            at: issue.at,
          },
        }),
  };
}

/** Stored `waiting_on` (C3): `{ kind, person_id?, team_label?, name? }` plus the chosen team contacts. */
export interface WaitingOnDocument {
  readonly kind: 'person' | 'team' | 'contractor' | 'government' | 'other';
  readonly person_id?: string;
  readonly team_label?: string;
  readonly contact_ids?: readonly string[];
  readonly name?: string;
}

/** Every field of `requests/{id}` this codebase knows; anything else on a stored document is dropped. */
export const REQUEST_DOCUMENT_FIELDS = [
  'request_number',
  'type',
  'source',
  'origin',
  'created_by_id',
  'created_at',
  'requester_id',
  'requester_name_text',
  'summary_title',
  'description',
  'category',
  'location_id',
  'area_id',
  'symptom_key',
  'attachment_ids',
  'assignee_id',
  'is_confidential',
  'sensitivity_reason',
  'related_person_ids',
  'confidential_grant_ids',
  'team_labels',
  'status',
  'revision',
  'last_updated_at',
  'activity_seq',
  'last_activity_at',
  'completion_cycle_id',
  'completed_at',
  'closed_at',
  'closure_kind',
  'cancelled_at',
  'auto_close_due_at',
  'confirmation_calendar_snapshot',
  'waiting_on',
  'current_waiting_interval_id',
  'waiting_since',
  'waiting_party_responded',
  'responded_at',
] as const satisfies readonly (keyof RequestDocument)[];

/** Splits a request into its two stored documents (D-S09-5); unknown fields are dropped. */
export function splitRequestRecord(record: RequestRecord): {
  readonly request: RequestDocument;
  readonly gmDetail: GmRequestDetailDocument;
} {
  const request = Object.fromEntries(
    REQUEST_DOCUMENT_FIELDS.filter((field) => record[field] !== undefined).map((field) => [field, record[field]]),
  ) as unknown as RequestDocument;
  return {
    request,
    gmDetail: {
      watcher_ids: record.watcher_ids,
      ...(record.sensitivity_note === undefined ? {} : { sensitivity_note: record.sensitivity_note }),
      ...(record.requester_not_notified === undefined ? {} : { requester_not_notified: record.requester_not_notified }),
      ...(record.requester_notified_seq === undefined ? {} : { requester_notified_seq: record.requester_notified_seq }),
    },
  };
}

/** Joins the two stored documents back into the whole request (no GM detail yet = no watchers). */
export function joinRequestRecord(request: RequestDocument, gmDetail: GmRequestDetailDocument | undefined): RequestRecord {
  // Only the canonical fields: D-S10-1 name pairs and unknown keys are rebuilt on the next write.
  const known = Object.fromEntries(
    REQUEST_DOCUMENT_FIELDS.filter((field) => request[field] !== undefined).map((field) => [field, request[field]]),
  ) as unknown as RequestDocument;
  return {
    ...known,
    watcher_ids: gmDetail?.watcher_ids ?? [],
    ...(gmDetail?.sensitivity_note === undefined ? {} : { sensitivity_note: gmDetail.sensitivity_note }),
    ...(gmDetail?.requester_not_notified === undefined ? {} : { requester_not_notified: gmDetail.requester_not_notified }),
    ...(gmDetail?.requester_notified_seq === undefined ? {} : { requester_notified_seq: gmDetail.requester_notified_seq }),
  };
}
