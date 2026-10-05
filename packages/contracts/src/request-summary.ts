// Public projection `request_summaries/{id}` (S08: Part 6 §6.4.1, C6, C11). An allowlist: only the
// fields below are ever copied, so a new private field on the request cannot leak by default.
// Labels that need other data (assignee label, waiting summary, place names) come with the
// projection builder in S09.
import type { GmCategory, RequestStatus, RequestType } from '@gm/domain';
import type { RequestDocument } from './request-document';

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
  /** Unique watchers, without names or IDs (U1). */
  readonly watcher_count: number;
}

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
] as const;

/** The public summary of a request, or `null` for a confidential one (no summary document at all). */
export function toRequestSummaryDocument(_requestId: string, _request: RequestDocument): RequestSummaryDocument | null {
  throw new Error('not implemented yet (S08)');
}
