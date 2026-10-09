// A07 — the Slack outbound adapter and how the worker sends through it (Part 6 §6.10, UI-15, Part 2
// Addendum A1.2, C1, C3). Slack here is a fake on 127.0.0.1 — the real Slack, Google Cloud and
// Firebase projects are never contacted; the worker runs on the Firestore emulator. Phase A is
// one-way: a DM with the number, a short Thai text and a link, no action buttons.
// D-A07-1: names, notes and “what to do” read at send time (general requests only); D-A07-4: a
// disabled Slack user gets company e-mail in the same attempt; D-A07-8: dev sends only to the
// approved sandbox list, everyone else is `suppressed`.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { channelAppHealth } from '@gm/domain';
import { MINUTE_MS, formatThaiDateTime } from '@gm/time';
import { CommandRejected, type MaintenanceCatalog } from '../../apps/api/src/commands/index';
import { lifecycleOutbox, newRequestOutbox, relatedAddedOutbox, respondedOutbox, waitingPartyOutbox, type OutboxEntry } from '../../apps/api/src/commands/outbox';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { channelRouter, notificationAdapter, sandboxAdapter, type NotificationAdapter, type OutboundMessage } from '../../apps/worker/src/adapters';
import type { WorkerDeps } from '../../apps/worker/src/deps';
import { adminWorkerStore } from '../../apps/worker/src/firestore-store';
import type { WorkerStore } from '../../apps/worker/src/store';
import { consoleWorkerLogger } from '../../apps/worker/src/log';
import { resolveSandboxRecipients } from '../../apps/worker/src/notification-mode';
import { dispatchOutbox } from '../../apps/worker/src/outbox-dispatch';
import { slackAdapter } from '../../apps/worker/src/slack';
import { runTick } from '../../apps/worker/src/tick';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type LogCapture } from './support/api-harness';
import { startFakeSlack, type FakeSlack } from './support/fake-slack';
import { TEST_MAX_ATTEMPTS, clearFirestore, emulatorClient, readDoc, writeDoc, type EmulatorClient } from './support/firestore-client-store';

const NOW = Date.parse('2027-01-11T09:00:00+07:00');
const BASE = 'https://gm-dev.example.test';
const TOKEN = 'xoxb-a07-test-only-not-a-real-token';
const TIMEOUT_MS = 400;

// Synthetic people and Slack IDs. Names, e-mails, Slack IDs, numbers and texts must never reach a log.
const GM = 'a07.gm@tdfb.co';
const GM2 = 'a07.gm.two@tdfb.co';
const REQUESTER = 'a07.requester@tdfb.co';
const MAIL_ONLY = 'a07.mail.only@tdfb.co';
const SLACK_IDS: Readonly<Record<string, string>> = { [GM]: 'U0A07GM001', [GM2]: 'U0A07GM002', [REQUESTER]: 'U0A07REQ01' };
const NAMES: Readonly<Record<string, string>> = { [GM]: 'คุณจีเอ็ม คิว', [GM2]: 'คุณจีเอ็ม ที', [REQUESTER]: 'คุณผู้ขอ อาร์', [MAIL_ONLY]: 'คุณอีเมล เอส' };
const TEAMS: Readonly<Record<string, string>> = { [REQUESTER]: 'ทีมบัญชี' };
const WAIT_NOTE = 'ขอใบเสนอราคา 2 ร้าน ภายในวันศุกร์';
const REPLY_NOTE = 'ส่งใบเสนอราคาให้แล้วทางอีเมล';
const ANSWER = 'ทำเสร็จแล้ว กด “ฝั่งฉันเรียบร้อยแล้ว” ในลิงก์';
const NOT_RESOLVED = 'ถ้ายังไม่เรียบร้อย กด “ยังไม่เรียบร้อย” ในลิงก์';
const TITLE = 'ไฟดับ — ทางเดิน · WH300';
const TYPED = 'ผู้แจ้งพิมพ์ว่า ไฟดับตั้งแต่เมื่อคืน กุญแจอยู่ที่ป้อม';
const SIGNED = 'https://storage.googleapis.com/gm-dev-bucket/requests/x/photo.jpg?X-Goog-Signature=abc';
/** D-A08-6: the Slack app's state (server only), read by the Admin health (FU-25). */
const SLACK_APP = 'integration_state/slack_app';

let worker: EmulatorClient;
let slack: FakeSlack;
let logs: LogCapture;
let now = NOW;
let count = 0;
const emails: OutboundMessage[] = [];

const email: NotificationAdapter = {
  send: async (message) => {
    emails.push(message);
    return { kind: 'accepted', providerId: `mail-${message.outboxId}` };
  },
};

const adapterOf = () => slackAdapter({ apiBaseUrl: slack.apiBaseUrl, token: TOKEN, webBaseUrl: BASE, timeoutMs: TIMEOUT_MS }, consoleWorkerLogger);

function deps(adapter: NotificationAdapter = channelRouter({ slack: adapterOf(), email })): WorkerDeps {
  return {
    store: adminWorkerStore(worker.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
    adapter,
    now: () => now,
    newLeaseId: () => randomUUID(),
    log: consoleWorkerLogger,
    jobHandlers: {},
  };
}

const message = (change: Partial<OutboundMessage> = {}): OutboundMessage => ({
  outboxId: 'out-a07-0001',
  channel: 'slack',
  address: SLACK_IDS[GM] ?? '',
  eventKind: 'request_created',
  audience: 'gm',
  requestId: 'req-a07-0001',
  requestNumber: 'DEV-0701',
  confidential: false,
  summaryTitle: TITLE,
  ...change,
});

/** A request as stored, with typed text, a photo and a GM-only note that must never reach a message. */
async function seedRequest(fields: Record<string, unknown> = {}): Promise<{ id: string; number: string }> {
  count += 1;
  const id = `req-a07-${String(count).padStart(4, '0')}`;
  const number = `DEV-07${String(count).padStart(2, '0')}`;
  await writeDoc(worker.db, `requests/${id}`, {
    request_number: number,
    status: 'in_progress',
    revision: 2,
    is_confidential: false,
    summary_title: TITLE,
    description: TYPED,
    attachment_ids: ['att-a07-1'],
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
const texts = () => slack.calls.map((call) => String(call.body.text));

beforeAll(async () => {
  logs = captureLogs();
  worker = emulatorClient();
  slack = await startFakeSlack();
});

afterAll(async () => {
  logs?.stop();
  await slack?.close();
  await worker?.close();
});

beforeEach(async () => {
  await clearFirestore();
  now = NOW;
  slack.reset();
  emails.length = 0;
  const batch = worker.db.batch();
  for (const personId of [GM, GM2, REQUESTER, MAIL_ONLY]) {
    batch.set(worker.db.doc(`people/${personId}`), {
      name: NAMES[personId],
      email: personId,
      active: true,
      ...(SLACK_IDS[personId] === undefined ? {} : { slack_user_id: SLACK_IDS[personId] }),
      ...(TEAMS[personId] === undefined ? {} : { team_label: TEAMS[personId] }),
    });
  }
  batch.set(worker.db.doc('settings/routing'), { gm_person_ids: [GM, GM2] });
  await batch.commit();
});

describe('the Slack adapter against a fake Slack', () => {
  it('one chat.postMessage per notice, to the person, with the bot token; no buttons; accepted with the message ts', async () => {
    await expect(adapterOf().send(message())).resolves.toEqual({ kind: 'accepted', providerId: 'slack:D0FAKE0001:1736.000001' });
    expect(slack.calls).toHaveLength(1);
    const [call] = slack.calls;
    expect(call).toMatchObject({ path: '/api/chat.postMessage', authorization: `Bearer ${TOKEN}` });
    expect(call?.contentType).toMatch(/^application\/json/);
    expect(call?.body).toEqual({
      channel: SLACK_IDS[GM],
      text: `*DEV-0701* มีงานใหม่รอรับเรื่อง\n${TITLE}\n<${BASE}/requests/req-a07-0001|เปิดงาน>`,
      unfurl_links: false,
      unfurl_media: false,
    });
  });

  it('no Slack ID → “not mapped” (so the auto channel uses company e-mail, A1.2); nothing is sent', async () => {
    await expect(adapterOf().send(message({ address: '' }))).resolves.toEqual({ kind: 'unmapped' });
    expect(slack.calls).toEqual([]);
  });

  it('an event with no template is refused before Slack is called (nothing was sent, so not “unknown”)', async () => {
    await expect(adapterOf().send(message({ eventKind: 'something_new' }))).resolves.toEqual({ kind: 'permanent', code: 'NO_TEMPLATE' });
    expect(slack.calls).toEqual([]);
  });

  it.each(['user_not_found', 'channel_not_found'])('Slack does not know the stored ID (%s) → “not mapped”', async (error) => {
    slack.answer({ kind: 'error', error });
    await expect(adapterOf().send(message())).resolves.toEqual({ kind: 'unmapped' });
  });

  it('429 with Retry-After → retryable, carrying the wait Slack asked for', async () => {
    slack.answer({ kind: 'rate_limited', retryAfterSeconds: 900 });
    await expect(adapterOf().send(message())).resolves.toEqual({ kind: 'retryable', code: 'SLACK_RATE_LIMITED', retryAfterMs: 900_000 });
  });

  it('no answer after the request reached Slack → unknown (it may be posted); the adapter never sends it again by itself', async () => {
    slack.answer({ kind: 'hang' });
    await expect(adapterOf().send(message())).resolves.toEqual({ kind: 'unknown', code: 'SLACK_TIMEOUT' });
    expect(slack.calls).toHaveLength(1);
  });

  it('Slack unreachable before anything was sent → retryable', async () => {
    const closed = await startFakeSlack();
    const apiBaseUrl = closed.apiBaseUrl;
    await closed.close();
    const outcome = await slackAdapter({ apiBaseUrl, token: TOKEN, webBaseUrl: BASE, timeoutMs: TIMEOUT_MS }, consoleWorkerLogger).send(message());
    expect(outcome).toEqual({ kind: 'retryable', code: 'SLACK_UNREACHABLE' });
  });

  it('D-A07-4: the person’s Slack account is disabled → Slack cannot reach them (nothing posted), like “not mapped”', async () => {
    slack.answer({ kind: 'error', error: 'user_disabled' });
    await expect(adapterOf().send(message())).resolves.toEqual({ kind: 'unmapped', code: 'SLACK_USER_DISABLED' });
  });

  it.each([
    ['account_inactive', 'SLACK_ACCOUNT_INACTIVE'],
    ['invalid_auth', 'SLACK_INVALID_AUTH'],
    ['not_authed', 'SLACK_NOT_AUTHED'],
    ['token_revoked', 'SLACK_TOKEN_REVOKED'],
    ['token_expired', 'SLACK_TOKEN_EXPIRED'],
    ['missing_scope', 'SLACK_MISSING_SCOPE'],
    ['no_permission', 'SLACK_NO_PERMISSION'],
    ['not_allowed_token_type', 'SLACK_NOT_ALLOWED_TOKEN_TYPE'],
    ['team_access_not_granted', 'SLACK_TEAM_ACCESS_NOT_GRANTED'],
    ['org_login_required', 'SLACK_ORG_LOGIN_REQUIRED'],
    ['ekm_access_denied', 'SLACK_EKM_ACCESS_DENIED'],
  ])('D-A08-6: an error about the app itself (%s) → unavailable with its code (nothing posted; no Slack message can go)', async (error, code) => {
    slack.answer({ kind: 'error', error });
    await expect(adapterOf().send(message())).resolves.toEqual({ kind: 'unavailable', code });
  });

  it.each([
    ['msg_too_long', 'SLACK_MSG_TOO_LONG'],
    ['invalid_arguments', 'SLACK_INVALID_ARGUMENTS'],
  ])('an error about this one message (%s) → permanent with its code', async (error, code) => {
    slack.answer({ kind: 'error', error });
    await expect(adapterOf().send(message())).resolves.toEqual({ kind: 'permanent', code });
  });

  it('Slack’s own internal error or a 500 → unknown (it may have been posted); 503 → retryable', async () => {
    slack.answer({ kind: 'error', error: 'internal_error' }, { kind: 'http', status: 500 }, { kind: 'http', status: 503 });
    await expect(adapterOf().send(message())).resolves.toEqual({ kind: 'unknown', code: 'SLACK_INTERNAL_ERROR' });
    await expect(adapterOf().send(message())).resolves.toEqual({ kind: 'unknown', code: 'SLACK_HTTP_500' });
    await expect(adapterOf().send(message())).resolves.toEqual({ kind: 'retryable', code: 'SLACK_HTTP_503' });
  });
});

describe('the worker sends through Slack (A02 retry, Part 6 §6.10)', () => {
  it('a Slack-mapped GM gets the DM; the entry keeps channel auto and records slack + the message ts', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('sent');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'provider_accepted', channel: 'auto', delivery_channel: 'slack', provider_id: 'slack:D0FAKE0001:1736.000001', attempts: 1 });
    expect(texts()).toEqual([`*${number}* มีงานใหม่รอรับเรื่อง\n${TITLE}\n<${BASE}/requests/${id}|เปิดงาน>`]);
  });

  it('no Slack ID in the directory → company e-mail, Slack is not called', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [MAIL_ONLY], isConfidential: false, now }));
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('sent');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'provider_accepted', delivery_channel: 'email' });
    expect(slack.calls).toEqual([]);
    expect(emails.map((sent) => sent.address)).toEqual([MAIL_ONLY]);
  });

  it('Slack does not know the stored ID → the same attempt goes by company e-mail (nothing was posted); the entry says email', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
    slack.answer({ kind: 'error', error: 'user_not_found' });
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('sent');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'provider_accepted', delivery_channel: 'email', slack_fallback_code: 'SLACK_NOT_MAPPED', provider_id: `mail-${outboxId}`, attempts: 1 });
    expect(emails.map((sent) => [sent.channel, sent.address])).toEqual([['email', GM]]);
  });

  it('429 Retry-After 15 minutes → waits that long (more than the 5-minute back-off), then the tick sends it', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
    slack.answer({ kind: 'rate_limited', retryAfterSeconds: 900 });
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('retry');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'pending', attempts: 1, next_attempt_at: NOW + 15 * MINUTE_MS, last_error_code: 'SLACK_RATE_LIMITED' });
    now = NOW + 10 * MINUTE_MS;
    await runTick(deps());
    expect(slack.calls).toHaveLength(1);
    now = NOW + 15 * MINUTE_MS;
    await runTick(deps());
    expect(slack.calls).toHaveLength(2);
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'provider_accepted', attempts: 2 });
  });

  it('no answer after sending → delivery_unknown for the GM to check; later ticks never send it again', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
    slack.answer({ kind: 'hang' });
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('unknown');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'delivery_unknown', last_error_code: 'SLACK_TIMEOUT', delivery_channel: 'slack' });
    for (const minutes of [15, 30, 300]) {
      now = NOW + minutes * MINUTE_MS;
      await runTick(deps());
    }
    expect(slack.calls).toHaveLength(1);
  });

  it('D-A07-4: the person’s Slack account is disabled → company e-mail in the same attempt; the entry says why Slack was skipped', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: GM, gmRecipientIds: [], requesterId: REQUESTER, isConfidential: false, now }));
    slack.answer({ kind: 'error', error: 'user_disabled' });
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('sent');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'provider_accepted', delivery_channel: 'email', slack_fallback_code: 'SLACK_USER_DISABLED', attempts: 1 });
    expect(emails.map((sent) => [sent.channel, sent.address])).toEqual([['email', REQUESTER]]);
    expect(await readDoc(worker.db, `gm_request_details/${id}`)).not.toHaveProperty('requester_not_notified');
  });

  it('a permanent error about the message itself → failed with the cause; the GM badge shows it for a requester; no e-mail guess', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: GM, gmRecipientIds: [], requesterId: REQUESTER, isConfidential: false, now }));
    slack.answer({ kind: 'error', error: 'msg_too_long' });
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('failed');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'failed', last_error_code: 'SLACK_MSG_TOO_LONG', delivery_channel: 'slack' });
    expect(await readDoc(worker.db, `gm_request_details/${id}`)).toMatchObject({ requester_not_notified: { code: 'SLACK_MSG_TOO_LONG' } });
    expect(emails).toEqual([]);
    expect(await readDoc(worker.db, SLACK_APP)).toBeUndefined();
  });
});

describe('D-A08-6: the Slack app itself does not work (token, account, scopes) → e-mail, and the Admin health turns red', () => {
  it.each(['invalid_auth', 'account_inactive', 'token_revoked'])('%s → company e-mail in the same attempt; the entry says why; the app state is app_error', async (error) => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: GM, gmRecipientIds: [], requesterId: REQUESTER, isConfidential: false, now }));
    slack.answer({ kind: 'error', error });
    const code = `SLACK_${error.toUpperCase()}`;
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('sent');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'provider_accepted', delivery_channel: 'email', slack_fallback_code: code, provider_id: `mail-${outboxId}`, attempts: 1 });
    expect(emails.map((sent) => [sent.channel, sent.address])).toEqual([['email', REQUESTER]]);
    expect(await readDoc(worker.db, `gm_request_details/${id}`)).not.toHaveProperty('requester_not_notified');
    expect(await readDoc(worker.db, SLACK_APP)).toEqual({ status: 'app_error', code, since: NOW });
    expect(channelAppHealth(await readDoc(worker.db, SLACK_APP))).toEqual({ level: 'red', code, since: NOW });
  });

  it('every later message still reaches people by e-mail; the outage keeps its start time (no write while it is the same)', async () => {
    const { id, number } = await seedRequest();
    const ids = await queue([
      ...newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }),
      ...newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM2], isConfidential: false, now }),
    ]);
    slack.answer({ kind: 'error', error: 'invalid_auth' }, { kind: 'error', error: 'invalid_auth' });
    await expect(dispatchOutbox(deps(), ids[0] ?? '')).resolves.toBe('sent');
    now = NOW + 20 * MINUTE_MS;
    await expect(dispatchOutbox(deps(), ids[1] ?? '')).resolves.toBe('sent');
    expect(emails.map((sent) => sent.address)).toEqual([GM, GM2]);
    expect(await readDoc(worker.db, SLACK_APP)).toEqual({ status: 'app_error', code: 'SLACK_INVALID_AUTH', since: NOW });
  });

  it('after the admin fixes the app, the next Slack send that goes through turns the health back to ok', async () => {
    const { id, number } = await seedRequest();
    const ids = await queue([
      ...newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }),
      ...newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM2], isConfidential: false, now }),
    ]);
    slack.answer({ kind: 'error', error: 'token_revoked' });
    await dispatchOutbox(deps(), ids[0] ?? '');
    now = NOW + 60 * MINUTE_MS;
    await expect(dispatchOutbox(deps(), ids[1] ?? '')).resolves.toBe('sent');
    expect(await entry(ids[1] ?? '')).toMatchObject({ state: 'provider_accepted', delivery_channel: 'slack' });
    expect(await entry(ids[1] ?? '')).not.toHaveProperty('slack_fallback_code');
    expect(await readDoc(worker.db, SLACK_APP)).toEqual({ status: 'ok', recovered_at: now, last_error_code: 'SLACK_TOKEN_REVOKED' });
    expect(channelAppHealth(await readDoc(worker.db, SLACK_APP))).toEqual({ level: 'ok' });
  });

  it('the e-mail fails too → the e-mail’s result, the Slack reason kept; the health is red all the same', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: GM, gmRecipientIds: [], requesterId: REQUESTER, isConfidential: false, now }));
    const refusingEmail: NotificationAdapter = { send: async () => ({ kind: 'permanent', code: 'GMAIL_INVALID_RECIPIENT' }) };
    slack.answer({ kind: 'error', error: 'invalid_auth' });
    await expect(dispatchOutbox(deps(channelRouter({ slack: adapterOf(), email: refusingEmail })), outboxId ?? '')).resolves.toBe('failed');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'failed', delivery_channel: 'email', last_error_code: 'GMAIL_INVALID_RECIPIENT', slack_fallback_code: 'SLACK_INVALID_AUTH' });
    expect(await readDoc(worker.db, `gm_request_details/${id}`)).toMatchObject({ requester_not_notified: { code: 'GMAIL_INVALID_RECIPIENT' } });
    expect(channelAppHealth(await readDoc(worker.db, SLACK_APP))).toMatchObject({ level: 'red', code: 'SLACK_INVALID_AUTH' });
  });

  it('a recipient Slack does not know is not an app problem: no app state is written', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
    slack.answer({ kind: 'error', error: 'user_not_found' });
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(await readDoc(worker.db, SLACK_APP)).toBeUndefined();
  });

  it('the log names the code, never the token, the Slack ID or the address', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
    const before = logs.lines.length;
    slack.answer({ kind: 'error', error: 'invalid_auth' });
    await dispatchOutbox(deps(), outboxId ?? '');
    const lines = logs.lines.slice(before).join('\n');
    expect(lines).toContain('notification.slack_app_error');
    expect(lines).toContain('SLACK_INVALID_AUTH');
    for (const secret of [TOKEN, SLACK_IDS[GM] ?? '-', GM, number]) expect(lines).not.toContain(secret);
  });
});

describe('what a message may say', () => {
  it('confidential (C3, D-A07-1): the number, the neutral line of the kind and the link — no title, nothing else', async () => {
    const { id, number } = await seedRequest({ is_confidential: true, summary_title: 'ต่อสัญญาเช่าโกดัง บริษัทเอกซ์' });
    const [outboxId] = await queue(lifecycleOutbox({ requestId: id, requestNumber: number, revision: 3, activitySeq: 3, eventKind: 'request_accepted', actorId: GM, requesterId: REQUESTER, watcherIds: [], isConfidential: true, now }));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()).toEqual([`*${number}* GM รับเรื่องแล้ว\n<${BASE}/requests/${id}|เปิดงาน>`]);
  });

  it('a request flagged confidential after the notice was queued is still sent with the neutral text', async () => {
    const { id, number } = await seedRequest({ is_confidential: true });
    const [outboxId] = await queue(lifecycleOutbox({ requestId: id, requestNumber: number, revision: 3, activitySeq: 3, eventKind: 'request_accepted', actorId: GM, requesterId: REQUESTER, watcherIds: [], isConfidential: false, now }));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()).toEqual([`*${number}* GM รับเรื่องแล้ว\n<${BASE}/requests/${id}|เปิดงาน>`]);
  });

  it('never the typed description, photos, signed URLs or GM-only notes', async () => {
    const { id, number } = await seedRequest({ description: `${TYPED} ${SIGNED}`, attachment_ids: ['requests/x/photo.jpg'] });
    await queue([
      ...newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }),
      ...lifecycleOutbox({ requestId: id, requestNumber: number, revision: 3, activitySeq: 3, eventKind: 'request_accepted', actorId: GM, requesterId: REQUESTER, watcherIds: [], isConfidential: false, now }),
    ]);
    await runTick(deps());
    expect(slack.calls).toHaveLength(2);
    const all = JSON.stringify(slack.calls.map((call) => call.body));
    for (const secret of [TYPED, 'X-Goog-Signature', 'storage.googleapis.com', 'photo.jpg', 'att-a07', 'บันทึกเฉพาะ GM']) expect(all).not.toContain(secret);
  });

  it('completed: the requester gets the real auto-close time, written as on screen', async () => {
    const due = Date.parse('2027-01-14T09:00:00+07:00');
    const { id, number } = await seedRequest({ status: 'completed', auto_close_due_at: due });
    const [outboxId] = await queue(lifecycleOutbox({ requestId: id, requestNumber: number, revision: 3, activitySeq: 3, eventKind: 'request_completed', actorId: GM, requesterId: REQUESTER, watcherIds: [], isConfidential: false, autoCloseDueAt: due, now }));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()).toEqual([
      [`*${number}* งานเสร็จแล้ว กรุณาตรวจและยืนยัน`, TITLE, `ระบบจะปิดอัตโนมัติ ${formatThaiDateTime(due)} หากไม่มีการตอบกลับ`, NOT_RESOLVED, `<${BASE}/requests/${id}|เปิดงาน>`].join('\n'),
    ]);
    expect(texts()[0]).toContain('14 ม.ค. 2570 09:00 น.');
  });

  it('“waiting” (D-A07-1): “กำลังรอ… ดำเนินการ” with the public label of who it waits on (D-S09-1), never a person’s name', async () => {
    const { id, number } = await seedRequest({ status: 'waiting', current_waiting_interval_id: 1, waiting_on: { kind: 'team', team_label: 'ทีมบัญชี' } });
    await writeDoc(worker.db, `request_summaries/${id}`, { request_number: number, status: 'waiting', waiting_on_summary: 'ทีมบัญชี' });
    const [outboxId] = await queue(lifecycleOutbox({ requestId: id, requestNumber: number, revision: 3, activitySeq: 3, eventKind: 'request_waiting', actorId: GM, requesterId: REQUESTER, watcherIds: [], isConfidential: false, now }));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()[0]?.split('\n')[0]).toBe(`*${number}* กำลังรอทีมบัญชีดำเนินการ`);
  });

  it('“waiting” on “other”: no made-up party — “กำลังรอผู้อื่นดำเนินการ”', async () => {
    const { id, number } = await seedRequest({ status: 'waiting', current_waiting_interval_id: 1, waiting_on: { kind: 'other', name: 'คุณป้าข้างบ้าน' } });
    await writeDoc(worker.db, `request_summaries/${id}`, { request_number: number, status: 'waiting', waiting_on_summary: 'อื่นๆ' });
    const [outboxId] = await queue(lifecycleOutbox({ requestId: id, requestNumber: number, revision: 3, activitySeq: 3, eventKind: 'request_waiting', actorId: GM, requesterId: REQUESTER, watcherIds: [], isConfidential: false, now }));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()[0]?.split('\n')[0]).toBe(`*${number}* กำลังรอผู้อื่นดำเนินการ`);
  });
});

describe('D-A07-1: who acted, the notes and what to do — read when the message is sent', () => {
  /** A general request waiting on the requester (who can read it), interval 1 started by GM with a note. */
  async function waitingOnRequester(fields: Record<string, unknown> = {}, interval: Record<string, unknown> = {}): Promise<{ id: string; number: string }> {
    const seeded = await seedRequest({ status: 'waiting', current_waiting_interval_id: 1, waiting_party_responded: false, assignee_id: GM, ...fields });
    await writeDoc(worker.db, `requests/${seeded.id}/waiting_intervals/w000001`, {
      interval_id: 1,
      waiting_on: { kind: 'person', person_id: REQUESTER },
      recipient_ids: [REQUESTER],
      started_at: NOW,
      started_by_id: GM,
      note: WAIT_NOTE,
      ...interval,
    });
    return seeded;
  }
  const link = (id: string) => `<${BASE}/requests/${id}|เปิดงาน>`;
  const asked = (input: { id: string; number: string }, eventKind: 'waiting_requested' | 'waiting_reminder', isConfidential = false) =>
    waitingPartyOutbox({ requestId: input.id, requestNumber: input.number, eventKind, eventKey: eventKind === 'waiting_requested' ? 'w1' : 'remind-2027-01-11', intervalId: 1, recipientIds: [REQUESTER], actorId: GM, isConfidential, revision: 3, activitySeq: 3, now });

  it('the waited party: which GM waits on them, the GM’s note, and the button to press', async () => {
    const seeded = await waitingOnRequester();
    const [outboxId] = await queue(asked(seeded, 'waiting_requested'));
    await expect(dispatchOutbox(deps(), outboxId ?? '')).resolves.toBe('sent');
    expect(texts()).toEqual([[`*${seeded.number}* ${NAMES[GM]} (ทีม GM) รอการดำเนินการจากคุณ`, TITLE, `หมายเหตุ: ${WAIT_NOTE}`, ANSWER, link(seeded.id)].join('\n')]);
  });

  it('the reminder says it is one, with the same name, note and button', async () => {
    const seeded = await waitingOnRequester();
    const [outboxId] = await queue(asked(seeded, 'waiting_reminder'));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()).toEqual([[`*${seeded.number}* เตือนอีกครั้ง: ${NAMES[GM]} (ทีม GM) รอการดำเนินการจากคุณ`, TITLE, `หมายเหตุ: ${WAIT_NOTE}`, ANSWER, link(seeded.id)].join('\n')]);
  });

  it('a note longer than 200 characters is cut in the message (the interval keeps it whole)', async () => {
    const seeded = await waitingOnRequester({}, { note: 'ก'.repeat(300) });
    const [outboxId] = await queue(asked(seeded, 'waiting_requested'));
    await dispatchOutbox(deps(), outboxId ?? '');
    const noteLine = texts()[0]?.split('\n').find((line) => line.startsWith('หมายเหตุ: ')) ?? '';
    expect([...noteLine.replace('หมายเหตุ: ', '')]).toHaveLength(200);
  });

  it('“answered” to the GM: who answered (name and team) and their note', async () => {
    const seeded = await waitingOnRequester({ waiting_party_responded: true }, { responded_at: NOW, responded_by_id: REQUESTER, response_note: REPLY_NOTE });
    const [outboxId] = await queue(respondedOutbox({ requestId: seeded.id, requestNumber: seeded.number, revision: 4, activitySeq: 4, intervalId: 1, gmRecipientIds: [GM], actorId: REQUESTER, isConfidential: false, now }));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()).toEqual([[`*${seeded.number}* ${NAMES[REQUESTER]} (ทีมบัญชี) ตอบกลับแล้ว`, TITLE, `หมายเหตุ: ${REPLY_NOTE}`, link(seeded.id)].join('\n')]);
  });

  it('take-over: the previous GM learns who took it', async () => {
    const seeded = await seedRequest({ assignee_id: GM2 });
    const entries = lifecycleOutbox({
      requestId: seeded.id,
      requestNumber: seeded.number,
      revision: 3,
      activitySeq: 3,
      eventKind: 'request_accepted',
      actorId: GM2,
      watcherIds: [],
      isConfidential: false,
      gmRecipients: [{ personId: GM, eventKind: 'request_taken_over' }],
      now,
    });
    const [outboxId] = await queue(entries);
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()).toEqual([[`*${seeded.number}* ${NAMES[GM2]} รับงานนี้ต่อจากคุณแล้ว`, TITLE, link(seeded.id)].join('\n')]);
  });

  it('“added as related”: which GM added you', async () => {
    const seeded = await seedRequest({ related_person_ids: [MAIL_ONLY] });
    const [outboxId] = await queue(relatedAddedOutbox({ requestId: seeded.id, requestNumber: seeded.number, revision: 3, activitySeq: 3, personIds: [MAIL_ONLY], actorId: GM, isConfidential: false, now }));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(emails.map((sent) => [sent.eventKind, sent.actorName])).toEqual([['related_added', NAMES[GM]]]);
  });

  /** The store the dispatcher uses, recording every document its transactions read. */
  function recordingStore(reads: string[]): WorkerStore {
    const inner = adminWorkerStore(worker.db, { maxAttempts: TEST_MAX_ATTEMPTS });
    return {
      due: (...args) => inner.due(...args),
      openRequests: (...args) => inner.openRequests(...args),
      runTransaction: (work) =>
        inner.runTransaction((transaction) =>
          work({
            get: async (path) => {
              reads.push(path);
              return transaction.get(path);
            },
            set: (path, data) => transaction.set(path, data),
            delete: (path) => transaction.delete(path),
          }),
        ),
    };
  }
  const capture = (sent: OutboundMessage[]): NotificationAdapter => ({ send: async (outbound) => (sent.push(outbound), { kind: 'accepted', providerId: 'captured' }) });
  const PRIVATE_FIELDS = ['summaryTitle', 'actorName', 'waitingNote', 'responderLabel', 'responseNote', 'waitingLabel'];
  const intervalDoc = (id: string) => `requests/${id}/waiting_intervals/w000001`;

  it('confidential: the dispatcher never reads the actor’s name, the interval’s notes or the public summary — nothing private even reaches the adapter', async () => {
    const asking = await waitingOnRequester({ is_confidential: true, confidential_grant_ids: [] });
    const answered = await waitingOnRequester({ is_confidential: true, waiting_party_responded: true }, { responded_at: NOW, responded_by_id: REQUESTER, response_note: REPLY_NOTE });
    const waiting = await seedRequest({ status: 'waiting', is_confidential: true, current_waiting_interval_id: 1, waiting_on: { kind: 'team', team_label: 'ทีมบัญชี' } });
    const ids = await queue([
      ...asked(asking, 'waiting_requested', true),
      ...respondedOutbox({ requestId: answered.id, requestNumber: answered.number, revision: 4, activitySeq: 4, intervalId: 1, gmRecipientIds: [GM], actorId: REQUESTER, isConfidential: true, now }),
      ...lifecycleOutbox({ requestId: waiting.id, requestNumber: waiting.number, revision: 3, activitySeq: 3, eventKind: 'request_waiting', actorId: GM, requesterId: REQUESTER, watcherIds: [], isConfidential: true, now }),
    ]);
    const reads: string[] = [];
    const sent: OutboundMessage[] = [];
    for (const outboxId of ids) await expect(dispatchOutbox({ ...deps(capture(sent)), store: recordingStore(reads) }, outboxId)).resolves.toBe('sent');
    expect(sent).toHaveLength(3);
    for (const outbound of sent) for (const field of PRIVATE_FIELDS) expect(outbound, field).not.toHaveProperty(field);
    // Each recipient's own directory entry is read (to choose Slack or e-mail) — never the actor's:
    // REQUESTER receives notices 1 and 3, GM receives notice 2 (GM asked in 1, REQUESTER answered in 2).
    const count = (path: string) => reads.filter((read) => read === path).length;
    expect([count(`people/${REQUESTER}`), count(`people/${GM}`)]).toEqual([2, 1]);
    for (const path of [intervalDoc(asking.id), intervalDoc(answered.id), `request_summaries/${waiting.id}`]) expect(reads).not.toContain(path);
  });

  it('the same notices of a general request do read them (so the check above can see a read)', async () => {
    const asking = await waitingOnRequester();
    const reads: string[] = [];
    const sent: OutboundMessage[] = [];
    const [outboxId] = await queue(asked(asking, 'waiting_requested'));
    await dispatchOutbox({ ...deps(capture(sent)), store: recordingStore(reads) }, outboxId ?? '');
    expect(reads).toEqual(expect.arrayContaining([`people/${GM}`, intervalDoc(asking.id)]));
    expect(sent[0]).toMatchObject({ actorName: NAMES[GM], waitingNote: WAIT_NOTE, summaryTitle: TITLE });
  });

  it('confidential: no name, note or title — still which button to press', async () => {
    const seeded = await waitingOnRequester({ is_confidential: true, confidential_grant_ids: [] });
    const [outboxId] = await queue(asked(seeded, 'waiting_requested', true));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()).toEqual([[`*${seeded.number}* รอการดำเนินการจากฝั่งคุณ`, ANSWER, link(seeded.id)].join('\n')]);
  });

  it('confidential “answered”: neither who nor what', async () => {
    const seeded = await waitingOnRequester({ is_confidential: true, waiting_party_responded: true }, { responded_at: NOW, responded_by_id: REQUESTER, response_note: REPLY_NOTE });
    const [outboxId] = await queue(respondedOutbox({ requestId: seeded.id, requestNumber: seeded.number, revision: 4, activitySeq: 4, intervalId: 1, gmRecipientIds: [GM], actorId: REQUESTER, isConfidential: true, now }));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()).toEqual([[`*${seeded.number}* ฝ่ายที่รอตอบกลับแล้ว`, link(seeded.id)].join('\n')]);
  });

  it('confidential completion: what to do and when it closes by itself, no title', async () => {
    const due = Date.parse('2027-01-14T09:00:00+07:00');
    const seeded = await seedRequest({ status: 'completed', is_confidential: true, auto_close_due_at: due });
    const [outboxId] = await queue(lifecycleOutbox({ requestId: seeded.id, requestNumber: seeded.number, revision: 3, activitySeq: 3, eventKind: 'request_completed', actorId: GM, requesterId: REQUESTER, watcherIds: [], isConfidential: true, autoCloseDueAt: due, now }));
    await dispatchOutbox(deps(), outboxId ?? '');
    expect(texts()).toEqual([
      [`*${seeded.number}* งานเสร็จแล้ว กรุณาตรวจและยืนยัน`, `ระบบจะปิดอัตโนมัติ ${formatThaiDateTime(due)} หากไม่มีการตอบกลับ`, NOT_RESOLVED, link(seeded.id)].join('\n'),
    ]);
  });
});

describe('D-A07-8: dev sends only to the approved sandbox list; everyone else is suppressed', () => {
  const sandboxed = (list: string) => deps(sandboxAdapter(channelRouter({ slack: adapterOf(), email }), resolveSandboxRecipients('dev', list) ?? { slackUserIds: new Set(), emails: new Set() }));

  it('a listed Slack ID gets the DM; an unlisted one is suppressed (NOT_IN_SANDBOX) and Slack is never called for it', async () => {
    const { id, number } = await seedRequest();
    const [toGm, toRequester] = await queue([
      ...newRequestOutbox({ requestId: id, requestNumber: number, actorId: MAIL_ONLY, gmRecipientIds: [GM], requesterId: REQUESTER, isConfidential: false, now }),
    ]);
    await expect(dispatchOutbox(sandboxed('U0A07GM001'), toGm ?? '')).resolves.toBe('sent');
    await expect(dispatchOutbox(sandboxed('U0A07GM001'), toRequester ?? '')).resolves.toBe('suppressed');
    expect(await entry(toRequester ?? '')).toMatchObject({ state: 'suppressed', last_error_code: 'NOT_IN_SANDBOX' });
    expect(slack.calls.map((call) => call.body.channel)).toEqual([SLACK_IDS[GM]]);
  });

  it('e-mail too: an unlisted address is suppressed, a listed one is sent', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [MAIL_ONLY], isConfidential: false, now }));
    await expect(dispatchOutbox(sandboxed('U0A07GM001'), outboxId ?? '')).resolves.toBe('suppressed');
    expect(emails).toEqual([]);
    const second = await seedRequest();
    const [listed] = await queue(newRequestOutbox({ requestId: second.id, requestNumber: second.number, actorId: REQUESTER, gmRecipientIds: [MAIL_ONLY], isConfidential: false, now }));
    await expect(dispatchOutbox(sandboxed(`U0A07GM001, ${MAIL_ONLY.toUpperCase()}`), listed ?? '')).resolves.toBe('sent');
    expect(emails.map((sent) => sent.address)).toEqual([MAIL_ONLY]);
  });

  it('a listed Slack ID that Slack does not know falls back to e-mail only if that address is listed too', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
    slack.answer({ kind: 'error', error: 'user_not_found' });
    await expect(dispatchOutbox(sandboxed('U0A07GM001'), outboxId ?? '')).resolves.toBe('suppressed');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'suppressed', last_error_code: 'NOT_IN_SANDBOX', delivery_channel: 'email' });
    expect(emails).toEqual([]);
  });

  it('an empty dev list sends nothing at all', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
    await expect(dispatchOutbox(sandboxed(''), outboxId ?? '')).resolves.toBe('suppressed');
    expect(slack.calls).toEqual([]);
  });
});

describe('“ยังไม่มอบหมาย”: every GM hears it when the default owner is on leave (A3, UI-15)', () => {
  it('created through the API; the all-GM notice says it is not assigned yet', async () => {
    const harness = apiHarness(NOW);
    await clearAuth();
    const ON_LEAVE = 'a07.gm.leave@tdfb.co';
    try {
      const batch = harness.db.batch();
      batch.set(harness.db.doc(`people/${ON_LEAVE}`), { name: 'คุณจีเอ็ม ลา', email: ON_LEAVE, active: true, slack_user_id: 'U0A07LEAVE' });
      batch.set(harness.db.doc('settings/routing'), { default_owner_by_type: { maintenance: ON_LEAVE }, gm_person_ids: [ON_LEAVE, GM] });
      batch.set(harness.db.doc(`gm_profiles/${ON_LEAVE}`), { presence_status: { kind: 'on_leave' }, presence_updated_at: NOW - MINUTE_MS });
      batch.set(harness.db.doc(`gm_profiles/${GM}`), { presence_status: { kind: 'unspecified' } });
      batch.set(harness.db.doc('calendars/company'), { timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays: [] });
      await batch.commit();
      const signedIn = await harness.signIn(REQUESTER);
      await harness.db.doc(`access/${signedIn.uid}`).set({ person_id: REQUESTER, role: 'requester', enabled: true });
      const catalog: MaintenanceCatalog = {
        async resolve(_tx, selection) {
          if (selection.location_id !== 'loc-wh300') throw new CommandRejected('CATALOG_UNKNOWN', 'unknown');
          return { location: { id: 'loc-wh300', label: 'WH300' }, symptom: { key: 'light_off', label: 'ไฟดับ' } };
        },
      };
      const server: Server = createServer(
        createApiHandler({
          api: harness.deps,
          commandStore: adminCommandStore(harness.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
          environment: 'dev',
          allowedOrigins: ['https://gm-dev.tdfb.co'],
          newRequestId: () => `req-a07-api-${randomUUID()}`,
          maintenanceCatalog: catalog,
          peopleDirectory: transactionPeopleDirectory(),
          routingDirectory: transactionRoutingDirectory(),
          taskQueue: { enqueue: async () => undefined },
        }),
      );
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/commands`, {
          method: 'POST',
          headers: { authorization: `Bearer ${signedIn.idToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({ command_id: randomUUID(), type: 'create_maintenance', payload: { location_id: 'loc-wh300', symptom_key: 'light_off' } }),
        });
        expect(response.status).toBe(200);
        const { result } = (await response.json()) as { result: { request_id: string; request_number: string } };
        await runTick(deps());
        expect(slack.calls.map((call) => call.body.channel)).toEqual([SLACK_IDS[GM]]);
        expect(texts()[0]?.split('\n')[0]).toBe(`*${result.request_number}* ยังไม่มอบหมาย รอทีม GM รับเรื่อง`);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    } finally {
      await harness.close();
    }
  });
});

describe('modes: disabled sends nothing; local renders but sends nothing', () => {
  it('disabled: Slack is never called and the entry fails visibly (CHANNEL_DISABLED); the request is untouched', async () => {
    const { id, number } = await seedRequest();
    const before = await readDoc(worker.db, `requests/${id}`);
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
    await expect(dispatchOutbox(deps(notificationAdapter('disabled', consoleWorkerLogger, { webBaseUrl: BASE })), outboxId ?? '')).resolves.toBe('failed');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'failed', last_error_code: 'CHANNEL_DISABLED' });
    expect(slack.calls).toEqual([]);
    expect(await readDoc(worker.db, `requests/${id}`)).toEqual(before);
  });

  it('local: the message is rendered (so a template error shows up) but nothing leaves the machine', async () => {
    const { id, number } = await seedRequest();
    const [outboxId] = await queue(newRequestOutbox({ requestId: id, requestNumber: number, actorId: REQUESTER, gmRecipientIds: [GM], isConfidential: false, now }));
    await expect(dispatchOutbox(deps(notificationAdapter('local', consoleWorkerLogger, { webBaseUrl: BASE })), outboxId ?? '')).resolves.toBe('sent');
    expect(await entry(outboxId ?? '')).toMatchObject({ state: 'provider_accepted', delivery_channel: 'slack', provider_id: `local-${outboxId}` });
    expect(slack.calls).toEqual([]);
  });
});

describe('logs and network (runs last)', () => {
  it('nothing left the machine', () => {
    expect(blockedHosts).toEqual([]);
  });

  it('logs hold no Slack ID, e-mail, name, request number, message text or token', () => {
    const text = logs.lines.join('\n');
    for (const secret of [...Object.values(SLACK_IDS), ...Object.keys(NAMES), ...Object.values(NAMES), TITLE, TYPED, TOKEN, WAIT_NOTE, REPLY_NOTE, 'DEV-07', 'รอการดำเนินการ', 'มีงานใหม่']) {
      expect(text).not.toContain(secret);
    }
  });
});
