// Public projection `request_summaries/{id}` (S08/S09: Part 6 §6.4.1, C6, C11, U1, U3, U4). An
// allowlist: only the fields below are ever written, so a new private field on the request cannot
// leak by default. No person IDs at all (they are emails, D-S08-4): the assignee travels as a display
// label, the waited party as a generic kind label. No stale flag (U4): `last_updated_at` feeds the
// neutral “อัปเดตล่าสุด …” text. Place names come from `locations`/`areas`, read by every active user.
import type { GmCategory, RequestStatus, RequestType } from '@gm/domain';
import type { RequestDocument, WaitingOnDocument } from './request-document';

export interface RequestSummaryDocument {
  readonly request_id: string;
  readonly request_number: string;
  readonly summary_title: string;
  readonly type: RequestType;
  readonly category: GmCategory;
  readonly source: 'web' | 'trello';
  readonly location_id?: string;
  readonly area_id?: string;
  readonly symptom_key?: string;
  readonly status: RequestStatus;
  readonly created_at: number;
  readonly last_updated_at: number;
  readonly completed_at?: number;
  readonly closed_at?: number;
  readonly cancelled_at?: number;
  /** U3: `completed` without `closed_at` — shown on the board whatever its age. */
  readonly awaiting_confirmation: boolean;
  /** False = “ยังไม่มอบหมาย”. */
  readonly is_assigned: boolean;
  /** Display name of the assigned GM (never an ID or email). */
  readonly assignee_label?: string;
  /** Generic label of the waited party while `waiting` (raw names stay private, Part 6 §6.4.1). */
  readonly waiting_on_summary?: string;
  /** “มีผู้แจ้งเพิ่ม X คน”: unique watchers other than the requester, without names or IDs (U1). */
  readonly watcher_count: number;
}

/** Generic public labels of the waited party; GM-confirmed safe labels do not exist yet (S09 question). */
export const PUBLIC_WAITING_LABELS = {
  person: 'พนักงาน',
  team: 'ทีมภายใน',
  contractor: 'ผู้รับเหมา',
  government: 'หน่วยงานรัฐ',
  other: 'ฝ่ายอื่น',
} as const satisfies Record<WaitingOnDocument['kind'], string>;

export const REQUEST_SUMMARY_FIELDS = [
  'request_id',
  'request_number',
  'summary_title',
  'type',
  'category',
  'source',
  'location_id',
  'area_id',
  'symptom_key',
  'status',
  'created_at',
  'last_updated_at',
  'completed_at',
  'closed_at',
  'cancelled_at',
  'awaiting_confirmation',
  'is_assigned',
  'assignee_label',
  'waiting_on_summary',
  'watcher_count',
] as const satisfies readonly (keyof RequestSummaryDocument)[];

/** Part 6 §6.4.1 “ห้าม public” (plus raw IDs that would identify people or teams). */
export const PRIVATE_REQUEST_FIELDS = [
  'description',
  'requester_id',
  'requester_name_text',
  'created_by_id',
  'related_person_ids',
  'watcher_ids',
  'team_labels',
  'attachment_ids',
  'comments',
  'history',
  'gm_history',
  'sensitivity_reason',
  'sensitivity_note',
  'document_drive_url',
  'original_storage_location',
  'waiting_on',
  'slack_user_ids',
  'emails',
  'assignee_id',
  'is_confidential',
  'current_waiting_interval_id',
  'waiting_party_responded',
  'responded_at',
  'auto_close_due_at',
  'revision',
] as const;

/** Fields copied as they are; everything else on the request is left behind. */
export const PUBLIC_COPIED_FIELDS = [
  'request_number',
  'summary_title',
  'type',
  'category',
  'source',
  'location_id',
  'area_id',
  'symptom_key',
  'status',
  'created_at',
  'last_updated_at',
  'completed_at',
  'closed_at',
  'cancelled_at',
] as const satisfies readonly (keyof RequestDocument & keyof RequestSummaryDocument)[];

/** The public summary of a request, or `null` for a confidential one (no summary document at all). */
export function toRequestSummaryDocument(
  _requestId: string,
  _request: RequestDocument,
  _context: { readonly personLabel: (personId: string) => string | undefined },
): RequestSummaryDocument | null {
  throw new Error('toRequestSummaryDocument: not implemented yet (S09 labels)');
}
