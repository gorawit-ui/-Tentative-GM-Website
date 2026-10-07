// A01 — outbox entries (stub).
import type { Instant } from '@gm/time';

export type OutboxChannel = 'auto';

export interface OutboxEntry {
  readonly id: string;
  readonly data: {
    readonly event_id: string;
    readonly event_kind: 'request_created';
    readonly request_id: string;
    readonly recipient_id: string;
    readonly channel: OutboxChannel;
    readonly confidential: boolean;
    readonly state: 'pending';
    readonly attempts: number;
    readonly next_attempt_at: Instant;
    readonly created_at: Instant;
  };
}

export function outboxId(_eventId: string, _recipientId: string, _channel: OutboxChannel): string {
  throw new Error('NOT_IMPLEMENTED');
}

export function newRequestOutbox(_input: {
  readonly requestId: string;
  readonly actorId: string;
  readonly recipientIds: readonly string[];
  readonly isConfidential: boolean;
  readonly now: Instant;
}): readonly OutboxEntry[] {
  throw new Error('NOT_IMPLEMENTED');
}
