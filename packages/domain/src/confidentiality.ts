// Confidential flag on an existing request (C6, D-S04-4, D-S05-6, D-ACL-2): flagging later is a GM
// command that must confirm which existing related persons keep access; unflagging is GM Admin only
// with a reason. Pure: the caller persists the state, the event and any ACL/projection rebuild.
import type { Instant } from '@gm/time';
import { LifecycleRejected } from './command-guards';
import type { Actor, RequestType, SensitivityReason } from './request-creation';

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
  const { sensitivityReason: previousSensitivityReason, sensitivityNote: _note, ...rest } = state;
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

export function markConfidential<S extends FlaggableState>(
  _state: S,
  _command: {
    readonly actor: Actor;
    readonly now: Instant;
    readonly sensitivityReason: string;
    readonly note?: string | undefined;
    /** Explicit confirmation of who keeps access; `[]` keeps nobody. */
    readonly keepRelatedPersonIds?: readonly string[] | undefined;
  },
): { readonly state: S; readonly event: ConfidentialFlagSetEvent } {
  throw new LifecycleRejected('NOT_IMPLEMENTED', 'markConfidential: not implemented yet (D-ACL-2)');
}
