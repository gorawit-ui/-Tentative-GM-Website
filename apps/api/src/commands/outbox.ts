// A01 — outbox entries written in the create transaction (Part 6 §6.6/§6.10: key event + recipient +
// channel; states pending → processing → provider_accepted / failed / delivery_unknown / suppressed).
// Nothing is sent here. D-A01-3: one entry per recipient with `channel: auto`; the worker (A02)
// chooses the channel when it sends (Slack DM when mapped, else company e-mail, A1.2) and writes the
// channel it used and the result back on the entry. The actor is never a recipient (D-S08-2). The
// document ID is a hash, so no e-mail appears in IDs or paths.
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
  /** Who routing tells: the assignee, or every available GM (A01). */
  readonly gmRecipientIds: readonly string[];
  /** D-A01-4: the requester's person ID when they have an account (none for a text name or a GM task). */
  readonly requesterId?: string;
  readonly isConfidential: boolean;
  readonly now: Instant;
}): readonly OutboxEntry[] {
  const eventId = `${input.requestId}:created`;
  // One entry per recipient per event (D-A01-3); the actor is never told (D-S08-2).
  const audiences = new Map<string, OutboxAudience>();
  for (const personId of input.gmRecipientIds) audiences.set(personId, 'gm');
  // D-A01-4: a requester with an account who did not create the request themself (a GM opened it on
  // their behalf) is told, with the request number. A requester who is also a GM recipient gets one
  // entry, the GM one.
  if (input.requesterId !== undefined && !audiences.has(input.requesterId)) audiences.set(input.requesterId, 'requester');
  audiences.delete(input.actorId);
  return [...audiences].map(([recipientId, audience]) => ({
    id: outboxId(eventId, recipientId, 'auto'),
    data: {
      event_id: eventId,
      event_kind: 'request_created',
      request_id: input.requestId,
      request_number: input.requestNumber,
      recipient_id: recipientId,
      audience,
      channel: 'auto',
      confidential: input.isConfidential,
      state: 'pending',
      attempts: 0,
      next_attempt_at: input.now,
      created_at: input.now,
    },
  }));
}
