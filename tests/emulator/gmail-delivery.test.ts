// A08 — the Gmail outbound adapter and how the worker sends e-mail (Part 6 §6.10, Part 7 D4, UI-15,
// Part 2 Addendum A1.2, C3, D-A07-1/8). Gmail here is a fake on 127.0.0.1 — the real Gmail, Slack,
// Google Cloud and Firebase projects are never contacted; the worker runs on the Firestore emulator.
// One `users.messages.send` per attempt, in the name of the configured central mailbox (approval:
// P7-ADMIN-02), plain text from the same notice as Slack, never retried by the adapter itself.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MINUTE_MS, formatThaiDateTime } from '@gm/time';
import { lifecycleOutbox, newRequestOutbox, type OutboxEntry } from '../../apps/api/src/commands/outbox';
import { channelRouter, notificationAdapter, sandboxAdapter, type NotificationAdapter, type OutboundMessage } from '../../apps/worker/src/adapters';
import type { WorkerDeps } from '../../apps/worker/src/deps';
import { EMAIL_FOOTER } from '../../apps/worker/src/email';
import { firestoreEmailQuota, type EmailQuota } from '../../apps/worker/src/email-quota';
import { adminWorkerStore } from '../../apps/worker/src/firestore-store';
import { gmailAdapter } from '../../apps/worker/src/gmail';
import { consoleWorkerLogger } from '../../apps/worker/src/log';
import { resolveSandboxRecipients } from '../../apps/worker/src/notification-mode';
import { dispatchOutbox } from '../../apps/worker/src/outbox-dispatch';
import { runTick } from '../../apps/worker/src/tick';
import { blockedHosts } from '../rules/network-guard';
import { captureLogs, type LogCapture } from './support/api-harness';
import { startFakeGmail, type FakeGmail } from './support/fake-gmail';
import { TEST_MAX_ATTEMPTS, clearFirestore, emulatorClient, readDoc, writeDoc, type EmulatorClient } from './support/firestore-client-store';

const NOW = Date.parse('2027-01-11T09:00:00+07:00');
const BASE = 'https://gm-dev.example.test';
const TOKEN = 'ya29.a08-test-only-not-a-real-token';
const TIMEOUT_MS = 400;
const SENDER = { address: 'gm-notify@tdfb.co', name: 'ทีม GM' };

// Synthetic people. Names, e-mails, numbers, subjects and texts must never reach a log.
const GM = 'a08.gm@tdfb.co';
const REQUESTER = 'a08.requester@tdfb.co';
const MAPPED = 'a08.mapped@tdfb.co';
const NAMES: Readonly<Record<string, string>> = { [GM]: 'คุณจีเอ็ม ยู', [REQUESTER]: 'คุณผู้ขอ วี', [MAPPED]: 'คุณสแล็ก ดับบลิว' };
const TITLE = 'ไฟดับ — ทางเดิน · WH300';
const TYPED = 'ผู้แจ้งพิมพ์ว่า ไฟดับตั้งแต่เมื่อคืน กุญแจอยู่ที่ป้อม';
const SIGNED = 'https://storage.googleapis.com/gm-dev-bucket/requests/x/photo.jpg?X-Goog-Signature=abc';

let worker: EmulatorClient;
let gmail: FakeGmail;
let logs: LogCapture;
let now = NOW;
let count = 0;
let tokenFails = false;

const accessToken = async () => {
  if (tokenFails) throw new Error('token endpoint unavailable');
  return TOKEN;
};

const store = () => adminWorkerStore(worker.db, { maxAttempts: TEST_MAX_ATTEMPTS });
const gmailOf = (quota?: EmailQuota, apiBaseUrl = gmail.apiBaseUrl) =>
  gmailAdapter({ apiBaseUrl, accessToken, sender: SENDER, webBaseUrl: BASE, timeoutMs: TIMEOUT_MS, ...(quota === undefined ? {} : { quota }) }, consoleWorkerLogger);
/** Slack cannot reach anyone here, so the dispatcher falls back to e-mail in the same attempt. */
const unreachableSlack: NotificationAdapter = { send: async () => ({ kind: 'unmapped' }) };

function deps(adapter: NotificationAdapter = channelRouter({ slack: unreachableSlack, email: gmailOf() })): WorkerDeps {
  return { store: store(), adapter, now: () => now, newLeaseId: () => randomUUID(), log: consoleWorkerLogger, jobHandlers: {} };
}

const message = (change: Partial<OutboundMessage> = {}): OutboundMessage => ({
  outboxId: 'out-a08-0001',
  channel: 'email',
  address: REQUESTER,
  eventKind: 'request_created',
  audience: 'gm',
  requestId: 'req-a08-0001',
  requestNumber: 'DEV-0801',
  confidential: false,
  summaryTitle: TITLE,
  ...change,
});

async function seedRequest(fields: Record<string, unknown> = {}): Promise<{ id: string; number: string }> {
  count += 1;
  const id = `req-a08-${String(count).padStart(4, '0')}`;
  const number = `DEV-08${String(count).padStart(2, '0')}`;
  await writeDoc(worker.db, `requests/${id}`, {
    request_number: number,
    status: 'in_progress',
    revision: 2,
    is_confidential: false,
    summary_title: TITLE,
    description: `${TYPED} ${SIGNED}`,
    attachment_ids: ['requests/x/photo.jpg'],
    requester_id: REQUESTER,
    related_person_ids: [],
    ...fields,
  });
  await writeDoc(worker.db, `gm_request_details/${id}`, { watcher_ids: [], sensitivity_note: 'บันทึกเฉพาะ GM ห้ามออกไป' });
  return { id, number };
}

async function queue(entries: readonly OutboxEntry[]): Promise<string[]> {
  for (const entry of entries) await writeDoc(worker.db, `outbox/${entry.id}`, entry.data);
  return entries.map((entry) => entry.id);
}

const entry = (id: string) => readDoc(worker.db, `outbox/${id}`);
const toGm = async (fields: Record<string, unknown> = {}) => {
  const seeded = await seedRequest(fields);
  const [outboxId] = await queue(newRequestOutbox({ requestId: seeded.id, requestNumber: seeded.number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
  return { ...seeded, outboxId: outboxId ?? '' };
};

beforeAll(async () => {
  logs = captureLogs();
  worker = emulatorClient();
  gmail = await startFakeGmail();
});

afterAll(async () => {
  logs?.stop();
  await gmail?.close();
  await worker?.close();
});

beforeEach(async () => {
  await clearFirestore();
  now = NOW;
  tokenFails = false;
  gmail.reset();
  const batch = worker.db.batch();
  for (const personId of [GM, REQUESTER, MAPPED]) {
    batch.set(worker.db.doc(`people/${personId}`), { name: NAMES[personId], email: personId, active: true, ...(personId === MAPPED ? { slack_user_id: 'U0A08MAP01' } : {}) });
  }
  await batch.commit();
});

describe('the Gmail adapter against a fake Gmail', () => {
  it('one users.messages.send in the name of the central mailbox, with the OAuth token; accepted with the message ID', async () => {
    await expect(gmailOf().send(message())).resolves.toEqual({ kind: 'accepted', providerId: 'gmail:18c0fake0001' });
    expect(gmail.calls).toHaveLength(1);
    const [sent] = gmail.calls;
    expect(sent).toMatchObject({ path: '/gmail/v1/users/me/messages/send', authorization: `Bearer ${TOKEN}` });
    expect(sent?.headers).toMatchObject({ from: 'ทีม GM <gm-notify@tdfb.co>', to: REQUESTER, subject: '[DEV-0801] มีงานใหม่รอรับเรื่อง', 'content-type': 'text/plain; charset=UTF-8' });
    expect(sent?.body).toBe(['DEV-0801 มีงานใหม่รอรับเรื่อง', TITLE, '', `เปิดงาน: ${BASE}/requests/req-a08-0001`, '', '-- ', EMAIL_FOOTER].join('\n'));
    // Thai survives the trip: every header line is ASCII, and decoding gives the same text back.
    for (const line of sent?.headerLines ?? []) expect(line).toMatch(/^[\x20-\x7e\t]*$/);
  });

  it.each(['not-an-email', 'someone@gmail.com', `${REQUESTER}\r\nBcc: outsider@example.com`])('a recipient that is not a company address (%j) → failed GMAIL_INVALID_RECIPIENT, Gmail not called', async (address) => {
    await expect(gmailOf().send(message({ address }))).resolves.toEqual({ kind: 'permanent', code: 'GMAIL_INVALID_RECIPIENT' });
    expect(gmail.calls).toEqual([]);
  });

  it('Gmail refuses the recipient (400 Invalid To header) → permanent GMAIL_INVALID_RECIPIENT', async () => {
    gmail.answer({ kind: 'invalid_recipient' });
    await expect(gmailOf().send(message())).resolves.toEqual({ kind: 'permanent', code: 'GMAIL_INVALID_RECIPIENT' });
  });

  it('429 with Retry-After → retryable, carrying the wait', async () => {
    gmail.answer({ kind: 'rate_limited', retryAfterSeconds: 120 });
    await expect(gmailOf().send(message())).resolves.toEqual({ kind: 'retryable', code: 'GMAIL_RATE_LIMITED', retryAfterMs: 120_000 });
  });

  it.each(['dailyLimitExceeded', 'userRateLimitExceeded', 'rateLimitExceeded', 'quotaExceeded'])('403 quota full (%s) → retryable GMAIL_QUOTA_EXCEEDED', async (reason) => {
    gmail.answer({ kind: 'quota', reason });
    await expect(gmailOf().send(message())).resolves.toEqual({ kind: 'retryable', code: 'GMAIL_QUOTA_EXCEEDED' });
  });

  it('no answer after the request reached Gmail → unknown (it may be sent); the adapter never sends it again by itself', async () => {
    gmail.answer({ kind: 'hang' });
    await expect(gmailOf().send(message())).resolves.toEqual({ kind: 'unknown', code: 'GMAIL_TIMEOUT' });
    expect(gmail.calls).toHaveLength(1);
  });

  it('Gmail unreachable before anything was sent → retryable', async () => {
    const closed = await startFakeGmail();
    const apiBaseUrl = closed.apiBaseUrl;
    await closed.close();
    await expect(gmailOf(undefined, apiBaseUrl).send(message())).resolves.toEqual({ kind: 'retryable', code: 'GMAIL_UNREACHABLE' });
  });

  it('no access token (the OAuth refresh failed) → retryable, nothing sent', async () => {
    tokenFails = true;
    await expect(gmailOf().send(message())).resolves.toEqual({ kind: 'retryable', code: 'GMAIL_AUTH_UNAVAILABLE' });
    expect(gmail.calls).toEqual([]);
  });

  it('401 / 403 other than quota (e.g. the mailbox may not send as this address) → permanent', async () => {
    gmail.answer({ kind: 'http', status: 401, reason: 'authError' }, { kind: 'http', status: 403, reason: 'insufficientPermissions' });
    await expect(gmailOf().send(message())).resolves.toEqual({ kind: 'permanent', code: 'GMAIL_UNAUTHORIZED' });
    await expect(gmailOf().send(message())).resolves.toEqual({ kind: 'permanent', code: 'GMAIL_FORBIDDEN' });
  });

  it('500 → unknown (it may have been sent); 503 → retryable', async () => {
    gmail.answer({ kind: 'http', status: 500 }, { kind: 'http', status: 503 });
    await expect(gmailOf().send(message())).resolves.toEqual({ kind: 'unknown', code: 'GMAIL_HTTP_500' });
    await expect(gmailOf().send(message())).resolves.toEqual({ kind: 'retryable', code: 'GMAIL_HTTP_503' });
  });

  it('an event with no template is refused before Gmail is called', async () => {
    await expect(gmailOf().send(message({ eventKind: 'something_new' }))).resolves.toEqual({ kind: 'permanent', code: 'NO_TEMPLATE' });
    expect(gmail.calls).toEqual([]);
  });
});

describe('the worker sends e-mail through Gmail (A02 retry, Part 6 §6.10)', () => {
  it('a person without a Slack ID gets the e-mail; the entry records email + the Gmail message ID', async () => {
    const { outboxId, number, id } = await toGm();
    await expect(dispatchOutbox(deps(), outboxId)).resolves.toBe('sent');
    expect(await entry(outboxId)).toMatchObject({ state: 'provider_accepted', channel: 'auto', delivery_channel: 'email', provider_id: 'gmail:18c0fake0001', attempts: 1 });
    expect(gmail.calls.map((sent) => [sent.headers.to, sent.headers.subject])).toEqual([[GM, `[${number}] มีงานใหม่รอรับเรื่อง`]]);
    expect(gmail.calls[0]?.body).toContain(`เปิดงาน: ${BASE}/requests/${id}`);
  });

  it('Slack cannot reach a mapped person → the same attempt goes by Gmail', async () => {
    const seeded = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: seeded.id, requestNumber: seeded.number, actorId: REQUESTER, gmRecipientIds: [MAPPED], isConfidential: false, now }));
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('sent');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'provider_accepted', delivery_channel: 'email', slack_fallback_code: 'SLACK_NOT_MAPPED', provider_id: 'gmail:18c0fake0001' });
    expect(gmail.calls.map((sent) => sent.headers.to)).toEqual([MAPPED]);
  });

  it('429 → waits (never earlier than Retry-After or the 5-minute back-off), then the tick sends it', async () => {
    const { outboxId } = await toGm();
    gmail.answer({ kind: 'rate_limited', retryAfterSeconds: 600 });
    await expect(dispatchOutbox(deps(), outboxId)).resolves.toBe('retry');
    expect(await entry(outboxId)).toMatchObject({ state: 'pending', attempts: 1, next_attempt_at: NOW + 10 * MINUTE_MS, last_error_code: 'GMAIL_RATE_LIMITED' });
    now = NOW + 5 * MINUTE_MS;
    await runTick(deps());
    expect(gmail.calls).toHaveLength(1);
    now = NOW + 10 * MINUTE_MS;
    await runTick(deps());
    expect(gmail.calls).toHaveLength(2);
    expect(await entry(outboxId)).toMatchObject({ state: 'provider_accepted', attempts: 2 });
  });

  it('quota full (403) → A02 back-off (5 minutes), then the tick sends it', async () => {
    const { outboxId } = await toGm();
    gmail.answer({ kind: 'quota' });
    await expect(dispatchOutbox(deps(), outboxId)).resolves.toBe('retry');
    expect(await entry(outboxId)).toMatchObject({ state: 'pending', attempts: 1, next_attempt_at: NOW + 5 * MINUTE_MS, last_error_code: 'GMAIL_QUOTA_EXCEEDED' });
    now = NOW + 5 * MINUTE_MS;
    await runTick(deps());
    expect(await entry(outboxId)).toMatchObject({ state: 'provider_accepted', attempts: 2 });
  });

  it('no answer after sending → delivery_unknown for the GM to check; later ticks never send it again', async () => {
    const { outboxId } = await toGm();
    gmail.answer({ kind: 'hang' });
    await expect(dispatchOutbox(deps(), outboxId)).resolves.toBe('unknown');
    expect(await entry(outboxId)).toMatchObject({ state: 'delivery_unknown', last_error_code: 'GMAIL_TIMEOUT', delivery_channel: 'email' });
    for (const minutes of [15, 30, 300]) {
      now = NOW + minutes * MINUTE_MS;
      await runTick(deps());
    }
    expect(gmail.calls).toHaveLength(1);
  });

  it('the recipient is refused → failed GMAIL_INVALID_RECIPIENT; the GM badge shows it for a requester', async () => {
    const seeded = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: seeded.id, requestNumber: seeded.number, actorId: GM, gmRecipientIds: [], requesterId: REQUESTER, isConfidential: false, now }));
    gmail.answer({ kind: 'invalid_recipient' });
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('failed');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'failed', last_error_code: 'GMAIL_INVALID_RECIPIENT', delivery_channel: 'email' });
    expect(await readDoc(worker.db, `gm_request_details/${seeded.id}`)).toMatchObject({ requester_not_notified: { code: 'GMAIL_INVALID_RECIPIENT' } });
  });
});

describe('what an e-mail may say', () => {
  it('never the typed description, photos, signed URLs or GM-only notes; no HTML, images or tracking', async () => {
    const seeded = await seedRequest();
    await queue([
      ...newRequestOutbox({ requestId: seeded.id, requestNumber: seeded.number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }),
      ...lifecycleOutbox({ requestId: seeded.id, requestNumber: seeded.number, revision: 3, activitySeq: 3, eventKind: 'request_accepted', actorId: GM, requesterId: REQUESTER, watcherIds: [], isConfidential: false, now }),
    ]);
    await runTick(deps());
    expect(gmail.calls).toHaveLength(2);
    for (const sent of gmail.calls) {
      for (const secret of [TYPED, 'X-Goog-Signature', 'storage.googleapis.com', 'photo.jpg', 'บันทึกเฉพาะ GM']) expect(`${sent.raw}\n${sent.body}`).not.toContain(secret);
      expect(sent.raw).not.toMatch(/text\/html|multipart|<img|<html/i);
      expect(sent.body.match(/https?:\/\/\S+/g)).toEqual([`${BASE}/requests/${seeded.id}`]);
      expect(sent.body.endsWith(EMAIL_FOOTER)).toBe(true);
    }
  });

  it('confidential (C3, D-A07-1): no title in the subject or body — the neutral line of the kind and what to do', async () => {
    const due = Date.parse('2027-01-14T09:00:00+07:00');
    const seeded = await seedRequest({ status: 'completed', is_confidential: true, summary_title: 'ต่อสัญญาเช่าโกดัง บริษัทเอกซ์', auto_close_due_at: due });
    const [outboxId] = await queue(lifecycleOutbox({ requestId: seeded.id, requestNumber: seeded.number, revision: 3, activitySeq: 3, eventKind: 'request_completed', actorId: GM, requesterId: REQUESTER, watcherIds: [], isConfidential: true, autoCloseDueAt: due, now }));
    await dispatchOutbox(deps(), outboxId ?? '');
    const [sent] = gmail.calls;
    expect(sent?.headers.subject).toBe(`[${seeded.number}] งานเสร็จแล้ว กรุณาตรวจและยืนยัน`);
    expect(sent?.body).toBe(
      [
        `${seeded.number} งานเสร็จแล้ว กรุณาตรวจและยืนยัน`,
        `ระบบจะปิดอัตโนมัติ ${formatThaiDateTime(due)} หากไม่มีการตอบกลับ`,
        "ถ้ายังไม่เรียบร้อย กด 'ยังไม่เรียบร้อย' ในลิงก์",
        '',
        `เปิดงาน: ${BASE}/requests/${seeded.id}`,
        '',
        '-- ',
        EMAIL_FOOTER,
      ].join('\n'),
    );
    expect(sent?.raw).not.toContain(Buffer.from('ต่อสัญญา').toString('base64').slice(0, 12));
  });
});

describe('the app’s own cap (Part 6 §6.10: 30/minute, 500/day) keeps mail in the outbox — never dropped', () => {
  const capped = (limits: { perMinute: number; perDay: number }) => deps(channelRouter({ slack: unreachableSlack, email: gmailOf(firestoreEmailQuota(store(), () => now, limits)) }));

  it('over the per-minute cap → pending until the next minute, the attempt given back; the tick then sends it', async () => {
    const sent = [await toGm(), await toGm(), await toGm()];
    for (const { outboxId } of sent.slice(0, 2)) await expect(dispatchOutbox(capped({ perMinute: 2, perDay: 10 }), outboxId)).resolves.toBe('sent');
    await expect(dispatchOutbox(capped({ perMinute: 2, perDay: 10 }), sent[2]?.outboxId ?? '')).resolves.toBe('retry');
    expect(await entry(sent[2]?.outboxId ?? '')).toMatchObject({ state: 'pending', attempts: 0, next_attempt_at: NOW + MINUTE_MS, last_error_code: 'EMAIL_CAP_REACHED' });
    expect(gmail.calls).toHaveLength(2);
    now = NOW + MINUTE_MS;
    await runTick(capped({ perMinute: 2, perDay: 10 }));
    expect(await entry(sent[2]?.outboxId ?? '')).toMatchObject({ state: 'provider_accepted', attempts: 1 });
  });

  it('over the per-day cap → pending until 00:00 Bangkok, however many times it is picked up', async () => {
    const limits = { perMinute: 10, perDay: 2 };
    const sent = [await toGm(), await toGm(), await toGm()];
    for (const { outboxId } of sent.slice(0, 2)) await dispatchOutbox(capped(limits), outboxId);
    now = NOW + 3 * 60 * MINUTE_MS;
    await expect(dispatchOutbox(capped(limits), sent[2]?.outboxId ?? '')).resolves.toBe('retry');
    const midnight = Date.parse('2027-01-12T00:00:00+07:00');
    expect(await entry(sent[2]?.outboxId ?? '')).toMatchObject({ state: 'pending', attempts: 0, next_attempt_at: midnight, last_error_code: 'EMAIL_CAP_REACHED' });
    now = midnight;
    await runTick(capped(limits));
    expect(await entry(sent[2]?.outboxId ?? '')).toMatchObject({ state: 'provider_accepted' });
    expect(gmail.calls).toHaveLength(3);
  });

  it('the counter is one server-only document', async () => {
    const { outboxId } = await toGm();
    await dispatchOutbox(capped({ perMinute: 30, perDay: 500 }), outboxId);
    expect(await readDoc(worker.db, 'system_counters/email_send')).toMatchObject({ day: '2027-01-11', day_count: 1, minute_count: 1 });
  });
});

describe('D-A07-8 and modes: the dev sandbox list applies to e-mail; disabled sends nothing', () => {
  it('an address not on the dev list is suppressed and Gmail is never called; a listed one is sent', async () => {
    const sandbox = resolveSandboxRecipients('dev', REQUESTER);
    if (sandbox === undefined) throw new Error('dev always has a list');
    const guarded = deps(sandboxAdapter(channelRouter({ slack: unreachableSlack, email: gmailOf() }), sandbox));
    const { outboxId } = await toGm();
    await expect(dispatchOutbox(guarded, outboxId)).resolves.toBe('suppressed');
    expect(await entry(outboxId)).toMatchObject({ state: 'suppressed', last_error_code: 'NOT_IN_SANDBOX' });
    const seeded = await seedRequest();
    const [listed] = await queue(newRequestOutbox({ requestId: seeded.id, requestNumber: seeded.number, actorId: GM, gmRecipientIds: [], requesterId: REQUESTER, isConfidential: false, now }));
    await expect(dispatchOutbox(guarded, listed ?? '')).resolves.toBe('sent');
    expect(gmail.calls.map((sent) => sent.headers.to)).toEqual([REQUESTER]);
  });

  it('disabled: Gmail is never called; the entry fails visibly (CHANNEL_DISABLED); the request is untouched', async () => {
    const { outboxId, id } = await toGm();
    const before = await readDoc(worker.db, `requests/${id}`);
    await expect(dispatchOutbox(deps(notificationAdapter('disabled', consoleWorkerLogger, { webBaseUrl: BASE })), outboxId)).resolves.toBe('failed');
    expect(await entry(outboxId)).toMatchObject({ state: 'failed', last_error_code: 'CHANNEL_DISABLED' });
    expect(gmail.calls).toEqual([]);
    expect(await readDoc(worker.db, `requests/${id}`)).toEqual(before);
  });
});

describe('logs and network (runs last)', () => {
  it('nothing left the machine', () => {
    expect(blockedHosts).toEqual([]);
  });

  it('logs hold no e-mail, name, request number, subject, body or token', () => {
    const text = logs.lines.join('\n');
    for (const secret of [...Object.keys(NAMES), ...Object.values(NAMES), SENDER.address, TITLE, TYPED, TOKEN, 'DEV-08', 'มีงานใหม่', 'อีเมลนี้ส่งอัตโนมัติ']) {
      expect(text).not.toContain(secret);
    }
  });
});
