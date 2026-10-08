// A01 — outbox entries written in the create transaction (Part 6 §6.6/§6.10: key event + recipient +
// channel; states pending → processing → provider_accepted / failed / delivery_unknown / suppressed).
// Nothing is sent here: the worker (A02) picks entries up and the Slack/Gmail adapters (A07/A08)
// choose the channel (`auto`: Slack DM when mapped, else company e-mail). The actor is never a
// recipient (D-S08-2). The document ID is a hash, so no e-mail appears in IDs or paths.
import { createHash } from 'node:crypto';
import type { Instant } from '@gm/time';

export type OutboxChannel = 'auto';
export type OutboxAudience = 'gm' | 'requester';

export interface OutboxEntry {
  readonly id: string;
  readonly data: {
    readonly event_id: string;
    readonly event_kind: 'request_created';
    readonly request_id: string;
    /** D-A01-4: the number the recipient sees (also for confidential requests). */
    readonly request_number: string;
    readonly recipient_id: string;
    /** `gm`: the routing notice; `requester`: a GM opened the request on their behalf (D-A01-4). */
    readonly audience: OutboxAudience;
    readonly channel: OutboxChannel;
    /** Confidential requests get the number + neutral text + link only (Part 6 §6.10). */
    readonly confidential: boolean;
    readonly state: 'pending';
    readonly attempts: number;
    readonly next_attempt_at: Instant;
    readonly created_at: Instant;
  };
}

export function outboxId(eventId: string, recipientId: string, channel: OutboxChannel): string {
  return createHash('sha256').update(`${eventId}\u0000${recipientId}\u0000${channel}`, 'utf8').digest('hex').slice(0, 40);
}

export function newRequestOutbox(input: {
  readonly requestId: string;
  readonly requestNumber: string;
  readonly actorId: string;
  readonly gmRecipientIds: readonly string[];
  readonly requesterId?: string;
  readonly isConfidential: boolean;
  readonly now: Instant;
}): readonly OutboxEntry[] {
  const eventId = `${input.requestId}:created`;
  const recipients = [...new Set(input.gmRecipientIds)].filter((personId) => personId !== input.actorId);
  // A02 red step: the D-A01-4 fields arrive with the implementation.
  return recipients.map((recipientId) => ({
    id: outboxId(eventId, recipientId, 'auto'),
    data: {
      event_id: eventId,
      event_kind: 'request_created',
      request_id: input.requestId,
      recipient_id: recipientId,
      channel: 'auto',
      confidential: input.isConfidential,
      state: 'pending',
      attempts: 0,
      next_attempt_at: input.now,
      created_at: input.now,
    },
  })) as unknown as readonly OutboxEntry[];
}
