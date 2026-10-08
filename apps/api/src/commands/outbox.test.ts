// A01 — outbox entries for a new request (Part 6 §6.10: key event + recipient + channel; states
// pending → … ; the worker sends later, A07/A08). Nothing is sent here; the actor is never a
// recipient (D-S08-2).
import { describe, expect, it } from 'vitest';
import { newRequestOutbox, outboxId } from './outbox';

const NOW = Date.parse('2026-12-28T09:00:00+07:00');

describe('outboxId', () => {
  it('is stable for event + recipient + channel and carries no e-mail', () => {
    const id = outboxId('req-1:created', 'gm.staff01@tdfb.co', 'auto');
    expect(id).toBe(outboxId('req-1:created', 'gm.staff01@tdfb.co', 'auto'));
    expect(id).toMatch(/^[0-9a-f]{40}$/);
    expect(outboxId('req-1:created', 'gm.staff02@tdfb.co', 'auto')).not.toBe(id);
    expect(outboxId('req-2:created', 'gm.staff01@tdfb.co', 'auto')).not.toBe(id);
  });
});

describe('newRequestOutbox', () => {
  it('one pending entry per recipient, never the actor, no duplicates', () => {
    const entries = newRequestOutbox({
      requestId: 'req-1',
      actorId: 'gm.staff01@tdfb.co',
      recipientIds: ['gm.staff02@tdfb.co', 'gm.staff01@tdfb.co', 'gm.staff02@tdfb.co', 'gm.admin01@tdfb.co'],
      isConfidential: true,
      now: NOW,
    });
    expect(entries.map((entry) => entry.data.recipient_id)).toEqual(['gm.staff02@tdfb.co', 'gm.admin01@tdfb.co']);
    expect(entries[0]).toEqual({
      id: outboxId('req-1:created', 'gm.staff02@tdfb.co', 'auto'),
      data: {
        event_id: 'req-1:created',
        event_kind: 'request_created',
        request_id: 'req-1',
        recipient_id: 'gm.staff02@tdfb.co',
        channel: 'auto',
        confidential: true,
        state: 'pending',
        attempts: 0,
        next_attempt_at: NOW,
        created_at: NOW,
      },
    });
  });

  it('nobody to tell → no entries', () => {
    expect(newRequestOutbox({ requestId: 'req-1', actorId: 'a@tdfb.co', recipientIds: ['a@tdfb.co'], isConfidential: false, now: NOW })).toEqual([]);
  });
});
