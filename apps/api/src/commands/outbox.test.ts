// A01 — outbox entries for a new request (Part 6 §6.10: key event + recipient + channel; states
// pending → … ; the worker sends later, A02/A07/A08). Nothing is sent here; the actor is never a
// recipient (D-S08-2). D-A01-3: one entry per recipient with `channel: auto` (the worker records the
// channel it really used). D-A01-4: a requester with an account is told when a GM opens on their behalf.
import { describe, expect, it } from 'vitest';
import { lifecycleOutbox, newRequestOutbox, outboxId } from './outbox';

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

// A03 — status-change notices (PRD §6.9 “requester ได้แจ้งเมื่อสถานะเปลี่ยน”, US-08 completed → แจ้ง
// requester, U1 watchers on status change, D-S08-2 never the actor). One entry per recipient per event.
describe('lifecycleOutbox', () => {
  const base = {
    requestId: 'req-7',
    requestNumber: 'GM-0007',
    revision: 4,
    actorId: 'gm.staff01@tdfb.co',
    requesterId: 'employee01@tdfb.co',
    watcherIds: ['watcher01@tdfb.co', 'watcher02@tdfb.co'],
    isConfidential: false,
    now: NOW,
  } as const;

  it('the requester and every watcher, keyed by the new revision', () => {
    const entries = lifecycleOutbox({ ...base, eventKind: 'request_accepted' });
    expect(entries.map((entry) => [entry.data.recipient_id, entry.data.audience])).toEqual([
      ['employee01@tdfb.co', 'requester'],
      ['watcher01@tdfb.co', 'watcher'],
      ['watcher02@tdfb.co', 'watcher'],
    ]);
    expect(entries[0]).toEqual({
      id: outboxId('req-7:r4', 'employee01@tdfb.co', 'auto'),
      data: {
        event_id: 'req-7:r4',
        event_kind: 'request_accepted',
        request_id: 'req-7',
        request_number: 'GM-0007',
        recipient_id: 'employee01@tdfb.co',
        audience: 'requester',
        channel: 'auto',
        confidential: false,
        state: 'pending',
        attempts: 0,
        next_attempt_at: NOW,
        created_at: NOW,
      },
    });
  });

  it('completed: carries the real auto-close time for the “please confirm” message (UI-15)', () => {
    const due = NOW + 3 * 86_400_000;
    const [requester] = lifecycleOutbox({ ...base, eventKind: 'request_completed', autoCloseDueAt: due });
    expect(requester?.data).toMatchObject({ event_kind: 'request_completed', audience: 'requester', auto_close_due_at: due });
  });

  it('the actor is never told: a requester answering “not resolved” tells only the watchers', () => {
    const entries = lifecycleOutbox({ ...base, actorId: 'employee01@tdfb.co', eventKind: 'request_not_resolved' });
    expect(entries.map((entry) => entry.data.recipient_id)).toEqual(['watcher01@tdfb.co', 'watcher02@tdfb.co']);
  });

  it('a watcher who is also the requester gets the requester entry only; a watcher who acted gets none', () => {
    const entries = lifecycleOutbox({ ...base, actorId: 'watcher02@tdfb.co', watcherIds: ['employee01@tdfb.co', 'watcher02@tdfb.co'], eventKind: 'request_cancelled' });
    expect(entries.map((entry) => [entry.data.recipient_id, entry.data.audience])).toEqual([['employee01@tdfb.co', 'requester']]);
  });

  it('a confidential request tells no watchers (watching alone gives no access, U1/§6.4.2)', () => {
    const entries = lifecycleOutbox({ ...base, isConfidential: true, eventKind: 'request_reopened' });
    expect(entries.map((entry) => entry.data.audience)).toEqual(['requester']);
    expect(entries[0]?.data.confidential).toBe(true);
  });

  it('no requester account (GM task, typed name) and no watchers → nobody', () => {
    const { requesterId: _none, ...withoutRequester } = base;
    expect(lifecycleOutbox({ ...withoutRequester, watcherIds: [], eventKind: 'request_completed' })).toEqual([]);
  });
});
