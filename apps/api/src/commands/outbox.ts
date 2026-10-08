// A01 — outbox entries written in the create transaction (Part 6 §6.6/§6.10: key event + recipient +
// channel; states pending → processing → provider_accepted / failed / delivery_unknown / suppressed).
// Nothing is sent here. D-A01-3: one entry per recipient with `channel: auto`; the worker (A02)
// chooses the channel when it sends (Slack DM when mapped, else company e-mail, A1.2) and writes the
// channel it used and the result back on the entry. The actor is never a recipient (D-S08-2). The
// document ID is a hash, so no e-mail appears in IDs or paths.
import { createHash } from 'node:crypto';
import type { Instant } from '@gm/time';

export type OutboxChannel = 'auto';
export type OutboxAudience = 'gm' | 'requester' | 'watcher';

export interface OutboxEntry {
  readonly id: string;
  readonly data: {
    readonly event_id: string;
    readonly event_kind: 'request_created' | LifecycleNoticeKind | GmLifecycleNoticeKind;
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
    readonly auto_close_due_at?: Instant;
    /** A06: the request revision of the event (D-A03-7 compares status notices by it). */
    readonly revision: number;
    /** A06: the request's unread step of the event (the requester badge compares by it). */
    readonly activity_seq: number;
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
      // A new request is revision 1 and unread step 1.
      revision: 1,
      activity_seq: 1,
    },
  }));
}

/** A03: status-change notices; `closed` (requester confirmed / auto-close) does not change the status. */
export type LifecycleNoticeKind = 'request_accepted' | 'request_completed' | 'request_not_resolved' | 'request_cancelled' | 'request_reopened';
/** D-A03-2 / D-A03-4: what a GM hears about a status change made by someone else. */
export type GmLifecycleNoticeKind = 'request_not_resolved' | 'request_taken_over';

/** D-A03-7: status notices — an older one to the same person on the same request is superseded by a newer one. */
export const STATUS_NOTICE_KINDS: ReadonlySet<string> = new Set<string>([
  'request_accepted',
  'request_completed',
  'request_not_resolved',
  'request_cancelled',
  'request_reopened',
  'request_taken_over',
]);

/**
 * A03 — who hears about a status change: the requester with an account (PRD §6.9 “requester ได้แจ้ง
 * เมื่อสถานะเปลี่ยน”, US-08) and the watchers of a general request (U1: summary only, never of a
 * confidential one), plus (A06) the GM a change lands on: the assignee when the requester says “not
 * resolved” (D-A03-2) and the previous assignee on a take-over (D-A03-4). One entry per person per
 * event, never the actor (D-S08-2). The event is the revision the command produced, so a retried
 * command (same revision) cannot add a second notice.
 */
export function lifecycleOutbox(input: {
  readonly requestId: string;
  readonly requestNumber: string;
  readonly revision: number;
  readonly eventKind: LifecycleNoticeKind;
  readonly actorId: string;
  readonly requesterId?: string;
  readonly watcherIds: readonly string[];
  readonly isConfidential: boolean;
  /** `request_completed` awaiting confirmation: the real auto-close time for the message (UI-15). */
  readonly autoCloseDueAt?: Instant;
  /** A06: the request's unread step of this event. */
  readonly activitySeq: number;
  /** D-A03-2: the assignee on “not resolved”; D-A03-4: the previous assignee on a take-over. */
  readonly gmRecipients?: readonly { readonly personId: string; readonly eventKind: GmLifecycleNoticeKind }[];
  readonly now: Instant;
}): readonly OutboxEntry[] {
  const eventId = `${input.requestId}:r${input.revision}`;
  const recipients = new Map<string, { readonly audience: OutboxAudience; readonly eventKind: LifecycleNoticeKind | GmLifecycleNoticeKind }>();
  if (input.requesterId !== undefined) recipients.set(input.requesterId, { audience: 'requester', eventKind: input.eventKind });
  if (!input.isConfidential) {
    for (const watcherId of input.watcherIds) if (!recipients.has(watcherId)) recipients.set(watcherId, { audience: 'watcher', eventKind: input.eventKind });
  }
  for (const gm of input.gmRecipients ?? []) if (!recipients.has(gm.personId)) recipients.set(gm.personId, { audience: 'gm', eventKind: gm.eventKind });
  recipients.delete(input.actorId);
  return [...recipients].map(([recipientId, { audience, eventKind }]) => ({
    id: outboxId(eventId, recipientId, 'auto'),
    data: {
      event_id: eventId,
      event_kind: eventKind,
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
      ...(input.autoCloseDueAt === undefined ? {} : { auto_close_due_at: input.autoCloseDueAt }),
      revision: input.revision,
      activity_seq: input.activitySeq,
    },
  }));
}
