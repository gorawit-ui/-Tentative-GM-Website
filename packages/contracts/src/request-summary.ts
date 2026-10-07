// Public projection `request_summaries/{id}` (S08/S09: Part 6 §6.4.1, C6, C11, U1, U3, U4). An
// allowlist: only the fields below are ever written, so a new private field on the request cannot
// leak by default. No person IDs at all (they are emails, D-S08-4): the assignee travels as a display
// label, the waited party as a generic kind label. No stale flag (U4): `last_updated_at` feeds the
// neutral “อัปเดตล่าสุด …” text. Place names come from `locations`/`areas`, read by every active user.
import type { GmCategory, RequestStatus, RequestType } from '@gm/domain';
import type { RequestRecord, WaitingOnDocument } from './request-document';
import type { ProjectionContext } from './projections';

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
  /** Public label of the waited party while `waiting` (D-S09-1). */
  readonly waiting_on_summary?: string;
  /** D-S09-7: “ฝ่ายที่รอตอบกลับแล้ว” while `waiting`; never who answered or when. */
  readonly waiting_party_responded?: boolean;
  /** “มีผู้แจ้งเพิ่ม X คน”: unique watchers other than the requester, without names or IDs (U1). */
  readonly watcher_count: number;
}

/**
 * D-S09-1 public labels of the waited party: a person shows as their team (“พนักงาน” if unknown), a
 * team as its label, a contractor only as “ผู้รับเหมา”, a government office as the name the GM typed,
 * other as “อื่นๆ”. These are the fallbacks when the name is not available.
 */
export const PUBLIC_WAITING_LABELS = {
  person: 'พนักงาน',
  team: 'ทีมภายใน',
  contractor: 'ผู้รับเหมา',
  government: 'หน่วยงานรัฐ',
  other: 'อื่นๆ',
} as const satisfies Record<WaitingOnDocument['kind'], string>;

export function publicWaitingLabel(
  waitingOn: WaitingOnDocument,
  context: Pick<ProjectionContext, 'personTeamLabel'>,
): string {
  const named = (value: string | undefined) => (value === undefined || value.trim() === '' ? undefined : value.trim());
  switch (waitingOn.kind) {
    case 'person':
      return named(waitingOn.person_id === undefined ? undefined : context.personTeamLabel(waitingOn.person_id)) ?? PUBLIC_WAITING_LABELS.person;
    case 'team':
      return named(waitingOn.team_label) ?? PUBLIC_WAITING_LABELS.team;
    case 'government':
      return named(waitingOn.name) ?? PUBLIC_WAITING_LABELS.government;
    case 'contractor':
    case 'other':
      return PUBLIC_WAITING_LABELS[waitingOn.kind];
  }
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
  'awaiting_confirmation',
  'is_assigned',
  'assignee_label',
  'waiting_on_summary',
  'waiting_party_responded',
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
  'responded_at',
  'confidential_grant_ids',
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
] as const satisfies readonly (keyof RequestRecord & keyof RequestSummaryDocument)[];

/** Unique watchers other than the requester (the requester never counts as an extra reporter, §6.4.2). */
export function watcherCount(request: RequestRecord): number {
  return new Set(request.watcher_ids.filter((personId) => personId !== request.requester_id)).size;
}

/** U3: `completed` that the requester has not confirmed yet (no `closed_at`). */
export function isAwaitingConfirmation(request: RequestRecord): boolean {
  return request.status === 'completed' && request.closed_at === undefined;
}

/** The public summary of a request, or `null` for a confidential one (no summary document at all). */
export function toRequestSummaryDocument(
  requestId: string,
  request: RequestRecord,
  context: Pick<ProjectionContext, 'personLabel' | 'personTeamLabel'>,
): RequestSummaryDocument | null {
  if (request.is_confidential) return null;
  const copied = Object.fromEntries(
    PUBLIC_COPIED_FIELDS.filter((field) => request[field] !== undefined).map((field) => [field, request[field]]),
  );
  const assigneeLabel = request.assignee_id === undefined ? undefined : context.personLabel(request.assignee_id);
  const waitingOn = request.status === 'waiting' ? request.waiting_on : undefined;
  return {
    request_id: requestId,
    ...copied,
    awaiting_confirmation: isAwaitingConfirmation(request),
    is_assigned: request.assignee_id !== undefined,
    ...(assigneeLabel === undefined ? {} : { assignee_label: assigneeLabel }),
    ...(waitingOn === undefined
      ? {}
      : {
          waiting_on_summary: publicWaitingLabel(waitingOn, context),
          waiting_party_responded: request.waiting_party_responded === true,
        }),
    watcher_count: watcherCount(request),
  } as RequestSummaryDocument;
}
