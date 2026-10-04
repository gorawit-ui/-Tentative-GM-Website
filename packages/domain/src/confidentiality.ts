// Unflagging a confidential request (C6, D-S04-4, D-S05-6): GM Admin only, with a reason kept in
// history. Pure: the caller persists the state, the event and any ACL/projection rebuild.
import type { Instant } from '@gm/time';
import { LifecycleRejected } from './lifecycle';
import type { Actor, SensitivityReason } from './request-creation';

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
