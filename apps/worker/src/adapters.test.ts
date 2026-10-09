// A02 — notification adapters. Only `local` (log-only) and `disabled` exist until A07/A08 and the
// P7-ADMIN-02/03 approvals: nothing is sent to Slack or e-mail, nobody real is notified.
import { describe, expect, it, vi } from 'vitest';
import { channelRouter, disabledAdapter, localAdapter, notificationAdapter, sandboxAdapter, type NotificationAdapter, type OutboundMessage } from './adapters';
import type { WorkerLogger } from './log';

const message: OutboundMessage = {
  outboxId: 'f'.repeat(40),
  channel: 'slack',
  address: 'U01ABCDE',
  eventKind: 'request_created',
  audience: 'requester',
  requestId: 'req-1',
  requestNumber: 'DEV-0001',
  confidential: false,
};

function recordingLog(): WorkerLogger & { lines: unknown[][] } {
  const lines: unknown[][] = [];
  return { lines, info: (...args) => void lines.push(args), warn: (...args) => void lines.push(args) };
}

describe('localAdapter', () => {
  it('accepts with a local provider ID, makes no network call and logs no address or person', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const log = recordingLog();
    await expect(localAdapter(log).send(message)).resolves.toEqual({ kind: 'accepted', providerId: `local-${message.outboxId}` });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(log.lines).toEqual([['notification.local', { outbox_id: message.outboxId, channel: 'slack', kind: 'request_created' }]]);
    expect(JSON.stringify(log.lines)).not.toContain('U01ABCDE');
  });
});

describe('disabledAdapter', () => {
  it('refuses permanently: the entry ends `failed` and the GM sees it was not sent', async () => {
    await expect(disabledAdapter().send(message)).resolves.toEqual({ kind: 'permanent', code: 'CHANNEL_DISABLED' });
  });
});

describe('notificationAdapter', () => {
  it('maps the two modes and nothing else', async () => {
    const log = recordingLog();
    await expect(notificationAdapter('local', log).send(message)).resolves.toMatchObject({ kind: 'accepted' });
    await expect(notificationAdapter('disabled', log).send(message)).resolves.toMatchObject({ kind: 'permanent' });
  });
});

describe('A07: local mode renders the message (a missing template shows up in dev) and still sends nothing', () => {
  it('an event with no template is refused as permanent NO_TEMPLATE, not accepted', async () => {
    const log = recordingLog();
    await expect(localAdapter(log).send({ ...message, eventKind: 'something_new' })).resolves.toEqual({ kind: 'permanent', code: 'NO_TEMPLATE' });
    await expect(notificationAdapter('local', log, { webBaseUrl: 'https://gm-dev.example.test' }).send(message)).resolves.toMatchObject({ kind: 'accepted' });
  });
});

describe('channelRouter', () => {
  it('sends each message through the adapter of its channel', async () => {
    const seen: string[] = [];
    const named = (name: string): NotificationAdapter => ({
      send: async (sent) => {
        seen.push(`${name}:${sent.channel}`);
        return { kind: 'accepted', providerId: name };
      },
    });
    const router = channelRouter({ slack: named('slack'), email: named('email') });
    await expect(router.send(message)).resolves.toEqual({ kind: 'accepted', providerId: 'slack' });
    await expect(router.send({ ...message, channel: 'email', address: 'someone@tdfb.co' })).resolves.toEqual({ kind: 'accepted', providerId: 'email' });
    expect(seen).toEqual(['slack:slack', 'email:email']);
  });
});

describe('sandboxAdapter (D-A07-8)', () => {
  const sandbox = { slackUserIds: new Set(['U01ABCDE']), emails: new Set(['gm.one@tdfb.co']) };
  function counting(): NotificationAdapter & { sent: OutboundMessage[] } {
    const sent: OutboundMessage[] = [];
    return { sent, send: async (message) => (sent.push(message), { kind: 'accepted', providerId: 'p' }) };
  }

  it('passes listed recipients through; suppresses the rest without calling the provider', async () => {
    const inner = counting();
    const guarded = sandboxAdapter(inner, sandbox);
    await expect(guarded.send(message)).resolves.toEqual({ kind: 'accepted', providerId: 'p' });
    await expect(guarded.send({ ...message, address: 'U09OTHER1' })).resolves.toEqual({ kind: 'suppressed', code: 'NOT_IN_SANDBOX' });
    await expect(guarded.send({ ...message, channel: 'email', address: 'GM.One@tdfb.co' })).resolves.toEqual({ kind: 'accepted', providerId: 'p' });
    await expect(guarded.send({ ...message, channel: 'email', address: 'employee01@tdfb.co' })).resolves.toEqual({ kind: 'suppressed', code: 'NOT_IN_SANDBOX' });
    // A Slack ID on the e-mail list (or the reverse) is not a match.
    await expect(guarded.send({ ...message, channel: 'email', address: 'U01ABCDE' })).resolves.toEqual({ kind: 'suppressed', code: 'NOT_IN_SANDBOX' });
    expect(inner.sent.map((sent) => sent.address)).toEqual(['U01ABCDE', 'GM.One@tdfb.co']);
  });

  it('no Slack ID to check (blank) is passed on, so the Slack adapter answers “not mapped” and e-mail is checked next', async () => {
    const inner = counting();
    await sandboxAdapter(inner, sandbox).send({ ...message, address: '' });
    expect(inner.sent).toHaveLength(1);
  });
});
