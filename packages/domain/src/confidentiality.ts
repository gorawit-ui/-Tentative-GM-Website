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

export function removeConfidentialFlag<S extends ConfidentialityState>(
  _state: S,
  _command: { readonly actor: Actor; readonly now: Instant; readonly reason: string },
): { readonly state: S; readonly event: ConfidentialFlagRemovedEvent } {
  throw new LifecycleRejected('NOT_IMPLEMENTED', 'removeConfidentialFlag: not implemented yet (D-S05-6)');
}
