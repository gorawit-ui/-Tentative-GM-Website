// Persisted `requests/{id}` fields (Part 6 §6.4.1), snake_case like D-S01-1. S08 writes the fields
// known at creation; later tasks fill the rest (routing A01, lifecycle A03, waiting A04, SLA B01).
// Instants are UTC epoch milliseconds here; the Firestore adapter maps them to Timestamps (A01).
import type {
  ClosureKind,
  GmCategory,
  RequestOrigin,
  RequestStatus,
  RequestType,
  SensitivityReason,
} from '@gm/domain';

export interface RequestDocument {
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
  readonly watcher_ids: readonly string[];
  /** Reporting only; never grants access (C4). */
  readonly team_labels?: readonly string[];
  readonly status: RequestStatus;
  readonly revision: number;
  /** GM progress clock (stale). */
  readonly last_updated_at: number;
  readonly completion_cycle_id: number;
  readonly completed_at?: number;
  readonly closed_at?: number;
  readonly closure_kind?: ClosureKind;
  readonly cancelled_at?: number;
  readonly auto_close_due_at?: number;
}
