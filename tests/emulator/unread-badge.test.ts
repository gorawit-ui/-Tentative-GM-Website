// A06 — in-app unread dot, “waiting for your confirmation” count and the GM-only “ผู้ขอยังไม่ได้รับแจ้ง”
// badge, plus FU-08 (watching writes the watcher's user_state and the watcher count). Through the HTTP
// API and the worker tick on the emulators (Part 2 Addendum A1.1/A1.2, Part 3 U1/UI-15, Part 6
// §6.4.1, D-A03-5, D-S10-2). Emulator only (demo-* project); people and IDs are synthetic.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeliveryOutcome } from '@gm/domain';
import { CommandRejected, type MaintenanceCatalog } from '../../apps/api/src/commands/index';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { localAdapter, type OutboundMessage } from '../../apps/worker/src/adapters';
import type { WorkerDeps } from '../../apps/worker/src/deps';
import { adminWorkerStore } from '../../apps/worker/src/firestore-store';
import { consoleWorkerLogger } from '../../apps/worker/src/log';
import { runTick } from '../../apps/worker/src/tick';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type ApiHarness, type LogCapture } from './support/api-harness';
import { TEST_MAX_ATTEMPTS, clearFirestore, emulatorClient, readDoc, type EmulatorClient } from './support/firestore-client-store';

const NOW = Date.parse('2026-12-28T09:00:00+07:00');
const MINUTE = 60_000;

const GM1 = 'a06.gm.one@tdfb.co';
const GM2 = 'a06.gm.two@tdfb.co';
const EMPLOYEE = 'a06.employee@tdfb.co';
/** Signs in, but is not in the people directory: no usable channel (A1.2). */
const NO_CHANNEL = 'a06.nochannel@tdfb.co';
const WATCHER = 'a06.watcher@tdfb.co';
const WATCHER2 = 'a06.watcher.two@tdfb.co';
const OTHER = 'a06.other@tdfb.co';
const NAMES: Readonly<Record<string, string>> = {
  [GM1]: 'คุณจีเอ็ม หนึ่ง เอฟ',
  [GM2]: 'คุณจีเอ็ม สอง จี',
  [EMPLOYEE]: 'คุณผู้แจ้ง เอช',
  [WATCHER]: 'คุณผู้ติดตาม ไอ',
  [WATCHER2]: 'คุณผู้ติดตาม เจ',
  [OTHER]: 'คุณคนอื่น เค',
};

const CATALOG: MaintenanceCatalog = {
  async resolve(_tx, selection) {
    if (selection.location_id !== 'loc-fac16' || selection.symptom_key !== 'internet_down') throw new CommandRejected('CATALOG_UNKNOWN', 'unknown');
    return { location: { id: 'loc-fac16', label: 'FAC16' }, symptom: { key: 'internet_down', label: 'อินเทอร์เน็ตใช้ไม่ได้' } };
  },
};

let harness: ApiHarness;
let worker: EmulatorClient;
let logs: LogCapture;
let server: Server;
let baseUrl = '';
let now = NOW;
let ids = 0;
const tokens = new Map<string, string>();
const local = localAdapter(consoleWorkerLogger);
let behaviour: (message: OutboundMessage) => Promise<DeliveryOutcome> = (message) => local.send(message);

function setNow(instant: number): void {
  now = instant;
  harness.setNow(instant);
}

function workerDeps(): WorkerDeps {
  return {
    store: adminWorkerStore(worker.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
    adapter: { send: (message) => behaviour(message) },
    now: () => now,
    newLeaseId: () => randomUUID(),
    log: consoleWorkerLogger,
  };
}

/** One tick a minute later than the last, so the tick lease never gets in the way. */
async function tick(): Promise<void> {
  setNow(now + MINUTE);
  await expect(runTick(workerDeps())).resolves.toMatchObject({ ran: true });
}

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

async function http(who: string, method: string, path: string, body?: unknown): Promise<Reply> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${tokens.get(who) ?? ''}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

const act = (who: string, type: string, payload: Record<string, unknown>) => http(who, 'POST', '/api/commands', { command_id: randomUUID(), type, payload });
const revisionOf = async (id: string) => (await readDoc(harness.db, `requests/${id}`))?.revision as number;

async function repairBy(who: string): Promise<string> {
  const reply = await act(who, 'create_maintenance', { location_id: 'loc-fac16', symptom_key: 'internet_down' });
  expect(reply.status).toBe(200);
  return (reply.body.result as { request_id: string }).request_id;
}

async function step(who: string, type: string, id: string, extra: Record<string, unknown> = {}): Promise<void> {
  setNow(now + MINUTE);
  const reply = await act(who, type, { request_id: id, expected_revision: await revisionOf(id), ...extra });
  expect(reply.status).toBe(200);
}

const accept = (id: string) => step(GM1, 'accept_request', id);
const complete = (id: string) => step(GM1, 'complete_request', id, { resolution_summary: 'แก้แล้ว' });
const confirm = (id: string, who = EMPLOYEE, cycle = 1) => step(who, 'confirm_completion', id, { completion_cycle_id: cycle });
const notResolved = (id: string, who = EMPLOYEE) => step(who, 'report_not_resolved', id, { completion_cycle_id: 1, reason: 'ยังไม่หาย' });

interface Card {
  readonly request_id: string;
  readonly relation: string;
  readonly has_update: boolean;
  readonly activity_seq: number;
}

async function cardOf(who: string, id: string): Promise<Card | undefined> {
  const reply = await http(who, 'GET', '/api/me/requests');
  expect(reply.status).toBe(200);
  return (reply.body.items as Card[]).find((card) => card.request_id === id);
}

async function seen(who: string, id: string, activitySeq: number): Promise<Reply> {
  return http(who, 'POST', `/api/requests/${id}/seen`, { activity_seq: activitySeq });
}

/** What the person's own screen shows: the detail (requester/related) or their card (watcher). */
async function displayedSeq(who: string, id: string): Promise<number> {
  const detail = await http(who, 'GET', `/api/requests/${id}`);
  if (detail.status === 200) return detail.body.activity_seq as number;
  return (await cardOf(who, id))?.activity_seq ?? -1;
}

const gmSummary = (id: string) => readDoc(harness.db, `gm_request_summaries/${id}`);
const awaiting = async (who: string) => ((await http(who, 'GET', '/api/me/awaiting-confirmation')).body as { count: number }).count;

beforeAll(async () => {
  logs = captureLogs();
  harness = apiHarness(NOW);
  worker = emulatorClient();
  await clearFirestore();
  await clearAuth();
  const batch = harness.db.batch();
  for (const [personId, name] of Object.entries(NAMES)) batch.set(harness.db.doc(`people/${personId}`), { name, email: personId, active: true });
  batch.set(harness.db.doc('settings/routing'), { default_owner_by_type: { maintenance: GM1, document_request: GM1 }, gm_person_ids: [GM1, GM2] });
  for (const gm of [GM1, GM2]) batch.set(harness.db.doc(`gm_profiles/${gm}`), { presence_status: { kind: 'unspecified' } });
  batch.set(harness.db.doc('calendars/company'), { timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays: ['2026-12-31', '2027-01-01'] });
  await batch.commit();
  const roles: Record<string, string> = { [GM1]: 'gm_staff', [GM2]: 'gm_staff', [EMPLOYEE]: 'requester', [NO_CHANNEL]: 'requester', [WATCHER]: 'requester', [WATCHER2]: 'requester', [OTHER]: 'requester' };
  for (const [personId, role] of Object.entries(roles)) {
    const signedIn = await harness.signIn(personId);
    tokens.set(personId, signedIn.idToken);
    await harness.db.doc(`access/${signedIn.uid}`).set({ person_id: personId, role, enabled: true });
  }
  server = createServer(
    createApiHandler({
      api: harness.deps,
      commandStore: adminCommandStore(harness.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
      environment: 'dev',
      allowedOrigins: ['https://gm-dev.tdfb.co'],
      newRequestId: () => `req-a06-${String(++ids).padStart(4, '0')}`,
      maintenanceCatalog: CATALOG,
      peopleDirectory: transactionPeopleDirectory(),
      routingDirectory: transactionRoutingDirectory(),
      taskQueue: { enqueue: async () => undefined },
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  logs?.stop();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await harness?.close();
  await worker?.close();
});

describe('“มีอัปเดตใหม่”: an event the person may see, not their own action; gone once they open it', () => {
  it('my own new request has no dot; the GM accepting it puts one; opening the request clears it', async () => {
    const id = await repairBy(EMPLOYEE);
    expect(await cardOf(EMPLOYEE, id)).toMatchObject({ relation: 'requester', has_update: false, activity_seq: 1 });
    await accept(id);
    expect(await cardOf(EMPLOYEE, id)).toMatchObject({ has_update: true, activity_seq: 2 });
    const shown = await displayedSeq(EMPLOYEE, id);
    expect(shown).toBe(2);
    expect(await seen(EMPLOYEE, id, shown)).toMatchObject({ status: 200, body: { activity_seq: 2, last_seen_activity_seq: 2, has_update: false } });
    expect(await cardOf(EMPLOYEE, id)).toMatchObject({ has_update: false });
  });

  it('a request a GM opened on my behalf shows a dot (someone else acted)', async () => {
    const reply = await act(GM2, 'create_on_behalf', {
      requester: { person_id: EMPLOYEE },
      details: { type: 'document_request', summary_title: 'ขอหนังสือรับรอง', sensitivity_subject: 'general' },
    });
    const id = (reply.body.result as { request_id: string }).request_id;
    expect(await cardOf(EMPLOYEE, id)).toMatchObject({ has_update: true, activity_seq: 1 });
  });

  it('an event that arrives while I am reading keeps the dot: only what was shown counts as read (A1.1)', async () => {
    const id = await repairBy(EMPLOYEE);
    await accept(id);
    const shown = await displayedSeq(EMPLOYEE, id);
    await complete(id); // lands before my screen reports it was shown
    expect(await seen(EMPLOYEE, id, shown)).toMatchObject({ status: 200, body: { last_seen_activity_seq: shown, has_update: true } });
    expect(await seen(EMPLOYEE, id, await displayedSeq(EMPLOYEE, id))).toMatchObject({ body: { has_update: false } });
  });

  it('my own answer does not give me a dot; it gives the watcher one; closing gives the watcher none (U1: status changes only)', async () => {
    const id = await repairBy(EMPLOYEE);
    expect(await act(WATCHER, 'watch_request', { request_id: id })).toMatchObject({ status: 200 });
    expect(await cardOf(WATCHER, id)).toMatchObject({ relation: 'watcher', has_update: false });
    await accept(id);
    expect(await cardOf(WATCHER, id)).toMatchObject({ has_update: true });
    await seen(WATCHER, id, await displayedSeq(WATCHER, id));
    await complete(id);
    await seen(EMPLOYEE, id, await displayedSeq(EMPLOYEE, id));
    await seen(WATCHER, id, await displayedSeq(WATCHER, id));
    await notResolved(id);
    expect(await cardOf(EMPLOYEE, id)).toMatchObject({ has_update: false });
    expect(await cardOf(WATCHER, id)).toMatchObject({ has_update: true });
    await seen(WATCHER, id, await displayedSeq(WATCHER, id));
    await complete(id);
    await seen(WATCHER, id, await displayedSeq(WATCHER, id));
    await confirm(id, EMPLOYEE, 2); // the second completion is cycle 2
    expect(await cardOf(WATCHER, id)).toMatchObject({ has_update: false });
    expect(await cardOf(EMPLOYEE, id)).toMatchObject({ has_update: false });
  });

  it('acting on the latest step (confirming straight from the notice) leaves me no dot: I acted on what I saw', async () => {
    const id = await repairBy(EMPLOYEE);
    await accept(id);
    await complete(id);
    expect(await cardOf(EMPLOYEE, id)).toMatchObject({ has_update: true });
    await confirm(id);
    expect(await cardOf(EMPLOYEE, id)).toMatchObject({ has_update: false });
  });

  it('marking seen: only a person with a live relation; a number beyond what they could see is capped', async () => {
    const id = await repairBy(EMPLOYEE);
    expect(await seen(OTHER, id, 1)).toMatchObject({ status: 404 });
    expect(await seen(GM1, id, 1)).toMatchObject({ status: 404 });
    expect(await seen(EMPLOYEE, 'req-a06-none', 1)).toMatchObject({ status: 404 });
    expect(await seen(EMPLOYEE, id, 99)).toMatchObject({ status: 200, body: { activity_seq: 1, last_seen_activity_seq: 1 } });
    expect(await seen(EMPLOYEE, id, -1)).toMatchObject({ status: 400 });
    expect(await http(EMPLOYEE, 'POST', `/api/requests/${id}/seen`, { activity_seq: 1, extra: true })).toMatchObject({ status: 400 });
  });
});

describe('“มี X งานรอคุณยืนยัน” (D-S10-2): my own requests awaiting my confirmation, through the personal endpoint', () => {
  it('goes up when the GM completes and down at once when I confirm or say “not resolved”; never for a watcher', async () => {
    const before = await awaiting(EMPLOYEE);
    const first = await repairBy(EMPLOYEE);
    const second = await repairBy(EMPLOYEE);
    await act(WATCHER2, 'watch_request', { request_id: first });
    for (const id of [first, second]) {
      await accept(id);
      await complete(id);
    }
    expect(await awaiting(EMPLOYEE)).toBe(before + 2);
    expect(await awaiting(WATCHER2)).toBe(0);
    await confirm(first);
    expect(await awaiting(EMPLOYEE)).toBe(before + 1);
    await notResolved(second);
    expect(await awaiting(EMPLOYEE)).toBe(before);
  });
});

describe('“ผู้ขอยังไม่ได้รับแจ้ง” — GM only, from the delivery results to the requester', () => {
  it('no usable channel → the GM summary shows NO_CHANNEL after the tick; the requester opening the update clears it', async () => {
    const id = await repairBy(NO_CHANNEL);
    await accept(id);
    await tick();
    expect(await gmSummary(id)).toMatchObject({ requester_not_notified: { reason: 'NO_CHANNEL', activity_seq: 2 } });
    expect(await readDoc(harness.db, `gm_request_details/${id}`)).toMatchObject({ requester_not_notified: { reason: 'NO_CHANNEL' } });
    // Never where the requester, related people or the public board read.
    expect(await readDoc(harness.db, `requests/${id}`)).not.toHaveProperty('requester_not_notified');
    expect(await readDoc(harness.db, `request_summaries/${id}`)).not.toHaveProperty('requester_not_notified');
    expect((await http(NO_CHANNEL, 'GET', `/api/requests/${id}`)).body).not.toHaveProperty('requester_not_notified');
    // Completing does not clear it (A1.2); the new notice fails the same way.
    await complete(id);
    expect(await gmSummary(id)).toMatchObject({ requester_not_notified: { reason: 'NO_CHANNEL' } });
    await tick();
    expect(await gmSummary(id)).toMatchObject({ requester_not_notified: { reason: 'NO_CHANNEL', activity_seq: 3 } });
    await seen(NO_CHANNEL, id, await displayedSeq(NO_CHANNEL, id));
    expect(await gmSummary(id)).not.toHaveProperty('requester_not_notified');
    expect(await readDoc(harness.db, `gm_request_details/${id}`)).not.toHaveProperty('requester_not_notified');
  });

  it('an unknown delivery result shows DELIVERY_UNKNOWN until a later notice reaches the requester', async () => {
    const id = await repairBy(EMPLOYEE);
    behaviour = async () => ({ kind: 'unknown', code: 'CONNECTION_LOST' });
    try {
      await accept(id);
      await tick();
    } finally {
      behaviour = (message) => local.send(message);
    }
    expect(await gmSummary(id)).toMatchObject({ requester_not_notified: { reason: 'DELIVERY_UNKNOWN', code: 'CONNECTION_LOST' } });
    await complete(id);
    await tick();
    expect(await gmSummary(id)).not.toHaveProperty('requester_not_notified');
  });

  it('a requester recorded by typed name has no account: shown from creation and kept through later steps', async () => {
    const reply = await act(GM2, 'create_on_behalf', {
      requester: { name_text: 'คุณผู้ขอ ไม่มีบัญชี' },
      details: { type: 'document_request', summary_title: 'ขอสำเนาสัญญา', sensitivity_subject: 'general' },
    });
    const id = (reply.body.result as { request_id: string }).request_id;
    expect(await gmSummary(id)).toMatchObject({ requester_not_notified: { reason: 'NO_ACCOUNT' } });
    await accept(id);
    expect(await gmSummary(id)).toMatchObject({ requester_not_notified: { reason: 'NO_ACCOUNT' } });
  });

  it('a GM task has no requester, so no badge; a delivered notice leaves none', async () => {
    const task = await act(GM1, 'create_gm_task', { summary_title: 'ตรวจถังดับเพลิง', category: 'assets_facilities', sensitivity_subject: 'general' });
    expect(await gmSummary((task.body.result as { request_id: string }).request_id)).not.toHaveProperty('requester_not_notified');
    const id = await repairBy(EMPLOYEE);
    await accept(id);
    await tick();
    expect(await gmSummary(id)).not.toHaveProperty('requester_not_notified');
  });
});

describe('FU-08: watching writes the watcher’s user_state and the watcher count', () => {
  it('distinct watchers only; watching again adds nothing; the requester is not a watcher', async () => {
    const id = await repairBy(EMPLOYEE);
    expect(await act(WATCHER, 'watch_request', { request_id: id })).toMatchObject({ status: 200, body: { result: { watch: 'added' } } });
    expect(await readDoc(harness.db, `user_state/${WATCHER}/requests/${id}`)).toMatchObject({ type: 'watcher', activity_seq: 1, last_seen_activity_seq: 1 });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ watcher_count: 1 });
    expect(await gmSummary(id)).toMatchObject({ watcher_count: 1 });
    expect((await act(WATCHER, 'watch_request', { request_id: id })).body).toMatchObject({ result: { watch: expect.not.stringMatching(/^added$/) } });
    await act(EMPLOYEE, 'watch_request', { request_id: id });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ watcher_count: 1 });
    await act(WATCHER2, 'watch_request', { request_id: id });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ watcher_count: 2 });
    expect(await gmSummary(id)).toMatchObject({ watcher_count: 2 });
    expect(await readDoc(harness.db, `user_state/${EMPLOYEE}/requests/${id}`)).toMatchObject({ type: 'requester' });
    // A later lifecycle step rebuilds the summaries with the same count.
    await accept(id);
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ watcher_count: 2 });
  });
});

describe('logs and network (runs last)', () => {
  it('nothing left the machine', () => {
    expect(blockedHosts).toEqual([]);
  });

  it('logs hold no e-mail or name', () => {
    const text = logs.lines.join('\n');
    for (const secret of [...Object.keys(NAMES), NO_CHANNEL, ...Object.values(NAMES), 'คุณผู้ขอ ไม่มีบัญชี', 'Bearer ']) expect(text).not.toContain(secret);
  });
});
