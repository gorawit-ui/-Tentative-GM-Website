// A01 — outbox entries for a new request (Part 6 §6.10: key event + recipient + channel; states
// pending → … ; the worker sends later, A02/A07/A08). Nothing is sent here; the actor is never a
// recipient (D-S08-2). D-A01-3: one entry per recipient with `channel: auto` (the worker records the
// channel it really used). D-A01-4: a requester with an account is told when a GM opens on their behalf.
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
      requestNumber: 'GM-0001',
      actorId: 'gm.staff01@tdfb.co',
      gmRecipientIds: ['gm.staff02@tdfb.co', 'gm.staff01@tdfb.co', 'gm.staff02@tdfb.co', 'gm.admin01@tdfb.co'],
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
        request_number: 'GM-0001',
        recipient_id: 'gm.staff02@tdfb.co',
        audience: 'gm',
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
    expect(
      newRequestOutbox({ requestId: 'req-1', requestNumber: 'GM-0001', actorId: 'a@tdfb.co', gmRecipientIds: ['a@tdfb.co'], isConfidential: false, now: NOW }),
    ).toEqual([]);
  });
});

describe('D-A01-4: the requester', () => {
  const base = { requestId: 'req-9', requestNumber: 'GM-0009', isConfidential: false, now: NOW } as const;

  it('a GM opens on behalf of a requester with an account → the requester is told, with the request number', () => {
    const entries = newRequestOutbox({ ...base, actorId: 'gm.staff01@tdfb.co', gmRecipientIds: ['gm.staff02@tdfb.co'], requesterId: 'employee01@tdfb.co' });
    expect(entries.map((entry) => [entry.data.recipient_id, entry.data.audience])).toEqual([
      ['gm.staff02@tdfb.co', 'gm'],
      ['employee01@tdfb.co', 'requester'],
    ]);
    expect(entries[1]).toEqual({
      id: outboxId('req-9:created', 'employee01@tdfb.co', 'auto'),
      data: expect.objectContaining({ event_kind: 'request_created', request_number: 'GM-0009', recipient_id: 'employee01@tdfb.co', audience: 'requester', state: 'pending' }),
    });
  });

  it('the requester who created the request themself is not told (D-S08-2: they are the actor)', () => {
    const entries = newRequestOutbox({ ...base, actorId: 'employee01@tdfb.co', gmRecipientIds: ['gm.staff02@tdfb.co'], requesterId: 'employee01@tdfb.co' });
    expect(entries.map((entry) => entry.data.recipient_id)).toEqual(['gm.staff02@tdfb.co']);
  });

  it('a GM opening on behalf of a requester that routes back to themselves still tells the requester', () => {
    const entries = newRequestOutbox({ ...base, actorId: 'gm.staff02@tdfb.co', gmRecipientIds: ['gm.staff02@tdfb.co'], requesterId: 'employee01@tdfb.co' });
    expect(entries.map((entry) => [entry.data.recipient_id, entry.data.audience])).toEqual([['employee01@tdfb.co', 'requester']]);
  });

  it('a text-name requester (no account) or a GM task has nobody on the requester side', () => {
    expect(newRequestOutbox({ ...base, actorId: 'gm.staff01@tdfb.co', gmRecipientIds: [] })).toEqual([]);
  });

  it('a requester who is also a GM recipient gets one entry (one per recipient per event), the GM one', () => {
    const entries = newRequestOutbox({ ...base, actorId: 'gm.staff01@tdfb.co', gmRecipientIds: ['gm.staff02@tdfb.co'], requesterId: 'gm.staff02@tdfb.co' });
    expect(entries.map((entry) => [entry.data.recipient_id, entry.data.audience])).toEqual([['gm.staff02@tdfb.co', 'gm']]);
  });
});
