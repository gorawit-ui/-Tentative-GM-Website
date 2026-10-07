// Confidential flag on an existing request (C6, D-S04-4, D-S05-6, D-ACL-2): flagging later is a GM
// command that must confirm which existing related persons keep access; unflagging is GM Admin only
// with a reason. Pure: the caller persists the state, the event and any ACL/projection rebuild.
import type { Instant } from '@gm/time';
import { LifecycleRejected } from './command-guards';
import { SENSITIVITY_REASONS, isGm, type Actor, type RequestType, type SensitivityReason } from './request-creation';

export interface ConfidentialityState {
  readonly source: 'web' | 'trello';
  readonly isConfidential: boolean;
  readonly sensitivityReason?: SensitivityReason;
  /** Restricted detail explaining a GM-marked flag (`other`). */
  readonly sensitivityNote?: string;
  readonly lastUpdatedAt: Instant;
}

export interface ConfidentialFlagRemovedEvent {
  readonly kind: 'confidential_flag_removed';
  readonly at: Instant;
  readonly actorId: string;
  readonly reason: string;
  readonly previousSensitivityReason?: SensitivityReason;
}

/** GM Admin removes the confidential flag with a reason (C6). A GM action, so `last_updated_at` moves (D-S05-3). */
export function removeConfidentialFlag<S extends ConfidentialityState>(
  state: S,
  command: { readonly actor: Actor; readonly now: Instant; readonly reason: string },
): { readonly state: S; readonly event: ConfidentialFlagRemovedEvent } {
  if (state.source === 'trello') throw new LifecycleRejected('READ_ONLY_SOURCE', 'Trello cards are read-only on the web');
  if (command.actor.role !== 'gm_admin') {
    throw new LifecycleRejected('GM_ADMIN_ONLY', 'Only GM Admin can remove the confidential flag (C6)');
  }
  const reason = command.reason.trim();
  if (reason === '') throw new LifecycleRejected('REASON_REQUIRED', 'A reason is required');
  if (!state.isConfidential) throw new LifecycleRejected('NOT_CONFIDENTIAL', 'The request is not confidential');
  const { sensitivityReason: previousSensitivityReason, sensitivityNote: _note, ...flagged } = state;
  // D-ACL-2: grants belong to one confidential period; a later re-flag confirms people again.
  const { confidentialGrantIds: _grants, ...rest } = flagged as typeof flagged & { confidentialGrantIds?: unknown };
  return {
    state: { ...rest, isConfidential: false, lastUpdatedAt: command.now } as unknown as S,
    event: {
      kind: 'confidential_flag_removed',
      at: command.now,
      actorId: command.actor.personId,
      reason,
      ...(previousSensitivityReason === undefined ? {} : { previousSensitivityReason }),
    },
  };
}

/** What flagging later needs to know about the request. */
export interface FlaggableState extends ConfidentialityState {
  readonly type: RequestType;
  readonly relatedPersonIds: readonly string[];
  readonly confidentialGrantIds?: readonly string[];
}

export interface ConfidentialFlagSetEvent {
  readonly kind: 'confidential_flag_set';
  readonly at: Instant;
  readonly actorId: string;
  readonly sensitivityReason: SensitivityReason;
  /** Related persons the GM confirmed to keep detail access (they form `confidential_grant_ids`). */
  readonly keptPersonIds: readonly string[];
  /** Related persons who stay listed but lose detail access. */
  readonly withdrawnPersonIds: readonly string[];
}

/**
 * GM flags a general request confidential later (D-ACL-2, C6): the reason as at creation (`other` needs a
 * short note, D-S05-6) and an explicit list of the existing related persons who keep detail access. The
 * others stay related but lose detail until confirmed again. A GM action, so `last_updated_at` moves.
 */
export function markConfidential<S extends FlaggableState>(
  state: S,
  command: {
    readonly actor: Actor;
    readonly now: Instant;
    readonly sensitivityReason: string;
    readonly note?: string | undefined;
    /** Explicit confirmation of who keeps access; `[]` keeps nobody. */
    readonly keepRelatedPersonIds?: readonly string[] | undefined;
  },
): { readonly state: S; readonly event: ConfidentialFlagSetEvent } {
  const reject = (code: string, message: string): never => {
    throw new LifecycleRejected(code, message);
  };
  if (state.source === 'trello') reject('READ_ONLY_SOURCE', 'Trello cards are read-only on the web');
  if (!isGm(command.actor)) reject('GM_ONLY', 'Only GM can flag a request confidential');
  if (state.isConfidential) reject('ALREADY_CONFIDENTIAL', 'The request is already confidential');
  if (state.type === 'maintenance') reject('MAINTENANCE_NOT_CONFIDENTIAL', 'Repair requests are never confidential (D-S04-5)');
  if (!(SENSITIVITY_REASONS as readonly string[]).includes(command.sensitivityReason)) {
    reject('SENSITIVITY_REASON_INVALID', 'sensitivity_reason must be contract, personnel or other');
  }
  const sensitivityReason = command.sensitivityReason as SensitivityReason;
  const note = command.note?.trim();
  if (sensitivityReason === 'other' && (note === undefined || note === '')) {
    reject('CONFIDENTIAL_NOTE_REQUIRED', 'A short note is required for a GM-marked confidential item');
  }
  if (sensitivityReason !== 'other' && command.note !== undefined) {
    reject('CONFIDENTIAL_NOTE_NOT_APPLICABLE', 'A note is only kept for sensitivity_reason other');
  }
  const keep = command.keepRelatedPersonIds;
  if (keep === undefined) return reject('KEEP_LIST_REQUIRED', 'Confirm which related persons keep access (an empty list keeps nobody)');
  if (keep.some((personId) => !state.relatedPersonIds.includes(personId))) {
    reject('KEEP_NOT_RELATED', 'Only existing related persons can keep access');
  }
  const kept = [...new Set(keep)];
  const { sensitivityNote: _previousNote, ...rest } = state;
  return {
    state: {
      ...rest,
      isConfidential: true,
      sensitivityReason,
      ...(sensitivityReason === 'other' ? { sensitivityNote: note } : {}),
      confidentialGrantIds: kept,
      lastUpdatedAt: command.now,
    } as unknown as S,
    event: {
      kind: 'confidential_flag_set',
      at: command.now,
      actorId: command.actor.personId,
      sensitivityReason,
      keptPersonIds: kept,
      withdrawnPersonIds: state.relatedPersonIds.filter((personId) => !kept.includes(personId)),
    },
  };
}
