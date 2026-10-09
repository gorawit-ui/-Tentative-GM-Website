// A04 — waiting on others / follow-up / the waited party's response + history, through the HTTP API
// on the emulators (S06 domain, F04/F05, C3, A2.1–A2.3, Part 6 §6.4/§6.6/§6.10/§6.14, D-S06-*,
// D-S09-1/7, D-ACL-2), plus FU-26 (cancel while waiting closes the interval), FU-12 (add / remove
// related persons) and FU-09 (flag confidential later / GM Admin removes the flag). Every command is
// one transaction with `expected_revision` (the response is checked against the waiting interval);
// notices are outbox entries sent later by the worker, which rechecks the interval and access.
// Emulator only (demo-* project); people, places and IDs are synthetic.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DeliveryOutcome } from '@gm/domain';
import { snapshotCalendar, waitingElapsed } from '@gm/time';
import { CommandRejected, type MaintenanceCatalog } from '../../apps/api/src/commands/index';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { localAdapter, type NotificationAdapter, type OutboundMessage } from '../../apps/worker/src/adapters';
import type { WorkerDeps } from '../../apps/worker/src/deps';
import { adminWorkerStore } from '../../apps/worker/src/firestore-store';
import { consoleWorkerLogger } from '../../apps/worker/src/log';
import { runTick } from '../../apps/worker/src/tick';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type ApiHarness, type LogCapture } from './support/api-harness';
import { TEST_MAX_ATTEMPTS, clearFirestore, emulatorClient, readCollection, readDoc, type EmulatorClient } from './support/firestore-client-store';

const at = (iso: string) => Date.parse(iso);
const MON = at('2026-12-28T09:00:00+07:00'); // Monday, open
const HOUR = 3_600_000;
const HOLIDAYS = ['2026-12-31', '2027-01-01'];
const CALENDAR = snapshotCalendar({ timeZone: 'Asia/Bangkok', openWeekdays: [1, 2, 3, 4, 5], holidays: HOLIDAYS });

// Synthetic people (D-S08-4 person IDs). Names, notes and e-mails must never reach a log.
const GM1 = 'a04.gm.one@tdfb.co';
const GM2 = 'a04.gm.two@tdfb.co';
const ADMIN = 'a04.gm.admin@tdfb.co';
const EMPLOYEE = 'a04.employee@tdfb.co';
const PARTY = 'a04.party@tdfb.co';
const LONER = 'a04.loner@tdfb.co';
const CONTACT1 = 'a04.contact.one@tdfb.co';
const CONTACT2 = 'a04.contact.two@tdfb.co';
const WATCHER = 'a04.watcher@tdfb.co';
const OTHER = 'a04.other@tdfb.co';
const R1 = 'a04.related.one@tdfb.co';
const R2 = 'a04.related.two@tdfb.co';
const NAMES: Readonly<Record<string, string>> = {
  [GM1]: 'คุณจีเอ็ม หนึ่ง เอฟ',
  [GM2]: 'คุณจีเอ็ม สอง จี',
  [ADMIN]: 'คุณแอดมิน จีเอ็ม',
  [EMPLOYEE]: 'คุณผู้แจ้ง เอช',
  [PARTY]: 'คุณผู้ถูกรอ ไอ',
  [LONER]: 'คุณไม่มีทีม เจ',
  [CONTACT1]: 'คุณผู้ติดต่อ หนึ่ง',
  [CONTACT2]: 'คุณผู้ติดต่อ สอง',
  [WATCHER]: 'คุณผู้ติดตาม เค',
  [OTHER]: 'คุณคนอื่น แอล',
  [R1]: 'คุณเกี่ยวข้อง หนึ่ง',
  [R2]: 'คุณเกี่ยวข้อง สอง',
};
/** D-S09-1 / D-ACL-7: one team per person from the staff list (FU-10 imports it). */
const TEAMS: Readonly<Record<string, string>> = { [PARTY]: 'ทีมบัญชี', [CONTACT1]: 'ทีมจัดซื้อ', [CONTACT2]: 'ทีมจัดซื้อ' };
const RESPONSE_NOTE = 'ส่งใบเสนอราคาให้แล้วทางอีเมล';
const VENDOR = 'ร้านแอร์เย็นฉ่ำ';
const AGENCY = 'สำนักงานเขตบางนา';
const ROLES: Readonly<Record<string, string>> = {
  [GM1]: 'gm_staff',
  [GM2]: 'gm_staff',
  [ADMIN]: 'gm_admin',
  [EMPLOYEE]: 'requester',
  [PARTY]: 'requester',
  [LONER]: 'requester',
  [CONTACT1]: 'requester',
  [CONTACT2]: 'requester',
  [WATCHER]: 'requester',
  [OTHER]: 'requester',
  [R1]: 'requester',
  [R2]: 'requester',
};

const CATALOG: MaintenanceCatalog = {
  async resolve(_tx, selection) {
    if (selection.location_id !== 'loc-fac16' || selection.symptom_key !== 'aircon_broken') throw new CommandRejected('CATALOG_UNKNOWN', 'unknown');
    return { location: { id: 'loc-fac16', label: 'FAC16' }, symptom: { key: 'aircon_broken', label: 'แอร์ไม่เย็น' } };
  },
};

let harness: ApiHarness;
let worker: EmulatorClient;
let logs: LogCapture;
let server: Server;
let baseUrl = '';
let now = MON;
let ids = 0;
const tokens = new Map<string, string>();
const sends: OutboundMessage[] = [];

function setNow(instant: number): void {
  now = instant;
  harness.setNow(instant);
}

const local = localAdapter(consoleWorkerLogger);
const adapter: NotificationAdapter = {
  send: (message): Promise<DeliveryOutcome> => {
    sends.push(message);
    return local.send(message);
  },
};

function workerDeps(): WorkerDeps {
  return {
    store: adminWorkerStore(worker.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
    adapter,
    now: () => now,
    newLeaseId: () => randomUUID(),
    log: consoleWorkerLogger,
    jobHandlers: {},
  };
}

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

async function call(method: 'GET' | 'POST', who: string, path: string, body?: unknown): Promise<Reply> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${tokens.get(who) ?? ''}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

async function act(who: string, type: string, payload: Record<string, unknown>, commandId: string = randomUUID()): Promise<Reply> {
  return call('POST', who, '/api/commands', { command_id: commandId, type, payload });
}

const request = (id: string) => readDoc(harness.db, `requests/${id}`);
const revisionOf = async (id: string) => (await request(id))?.revision as number;
const interval = (id: string, n: number) => readDoc(harness.db, `requests/${id}/waiting_intervals/w${String(n).padStart(6, '0')}`);
const history = async (id: string) => [...(await readCollection(harness.db, `requests/${id}/history`)).values()];
const historyOf = async (id: string, kind: string) => (await history(id)).filter((event) => event.kind === kind);
const outboxOf = async (id: string) => [...(await readCollection(harness.db, 'outbox')).values()].filter((entry) => entry.request_id === id);
const noticesOf = async (id: string, kind: string) => (await outboxOf(id)).filter((entry) => entry.event_kind === kind);
const recipients = (entries: readonly Record<string, unknown>[]) => entries.map((entry) => entry.recipient_id).sort();
const publicSummary = (id: string) => readDoc(harness.db, `request_summaries/${id}`);
const gmSummary = (id: string) => readDoc(harness.db, `gm_request_summaries/${id}`);
const boardCount = async () => ((await readDoc(harness.db, 'board_counters/public'))?.internal_board_count as number | undefined) ?? 0;
const epoch = async () => ((await readDoc(harness.db, 'system_counters/public_visibility'))?.public_visibility_epoch as number | undefined) ?? 0;

/** An employee's repair request, accepted by GM1 (in progress). */
async function inProgressRepair(): Promise<{ id: string; number: string }> {
  const created = await act(EMPLOYEE, 'create_maintenance', { location_id: 'loc-fac16', symptom_key: 'aircon_broken', description: 'แอร์ห้องประชุมไม่เย็น' });
  expect(created.status).toBe(200);
  const { request_id: id, request_number: number } = created.body.result as { request_id: string; request_number: string };
  expect(await act(GM1, 'accept_request', { request_id: id, expected_revision: 1 })).toMatchObject({ status: 200 });
  return { id, number };
}

/** A GM's document request on behalf of EMPLOYEE (general), with related persons, accepted by GM2. */
async function inProgressDocument(related: readonly string[] = []): Promise<{ id: string }> {
  const created = await act(GM2, 'create_on_behalf', {
    requester: { person_id: EMPLOYEE },
    details: { type: 'document_request', summary_title: 'ขอสำเนาสัญญาเช่าคลัง', sensitivity_subject: 'general' },
    ...(related.length === 0 ? {} : { related_person_ids: related }),
  });
  expect(created.status).toBe(200);
  const id = (created.body.result as { request_id: string }).request_id;
  expect(await act(GM2, 'accept_request', { request_id: id, expected_revision: 1 })).toMatchObject({ status: 200 });
  return { id };
}

async function enterWaiting(id: string, waitingOn: Record<string, unknown>, extra: Record<string, unknown> = {}, by = GM1): Promise<Reply> {
  return act(by, 'enter_waiting', { request_id: id, expected_revision: await revisionOf(id), waiting_on: waitingOn, ...extra });
}

async function waitingOnParty(id: string): Promise<void> {
  expect(await enterWaiting(id, { kind: 'person', person_id: PARTY })).toMatchObject({ status: 200 });
}

beforeAll(async () => {
  logs = captureLogs();
  harness = apiHarness(MON);
  worker = emulatorClient();
  await clearFirestore();
  await clearAuth();
  const batch = harness.db.batch();
  for (const [personId, name] of Object.entries(NAMES)) {
    batch.set(harness.db.doc(`people/${personId}`), { name, email: personId, active: true, ...(TEAMS[personId] === undefined ? {} : { team_label: TEAMS[personId] }) });
  }
  batch.set(harness.db.doc('settings/routing'), { default_owner_by_type: { maintenance: GM1, document_request: GM2 }, gm_person_ids: [GM1, GM2, ADMIN] });
  for (const gm of [GM1, GM2, ADMIN]) batch.set(harness.db.doc(`gm_profiles/${gm}`), { presence_status: { kind: 'unspecified' } });
  batch.set(harness.db.doc('calendars/company'), { timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays: HOLIDAYS });
  await batch.commit();
  for (const [personId, role] of Object.entries(ROLES)) {
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
      newRequestId: () => `req-a04-${String(++ids).padStart(4, '0')}`,
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

describe('every S06 command is saved through the API', () => {
  it('enter waiting (person): request, interval document, related person, history, user_state — one transaction', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    setNow(MON + HOUR);
    const reply = await enterWaiting(id, { kind: 'person', person_id: PARTY });
    expect(reply).toMatchObject({ status: 200, body: { replayed: false, result: { request_id: id, revision: 3, status: 'waiting', waiting_interval_id: 1 } } });
    expect(await request(id)).toMatchObject({
      status: 'waiting',
      revision: 3,
      waiting_on: { kind: 'person', person_id: PARTY },
      current_waiting_interval_id: 1,
      waiting_interval_seq: 1,
      waiting_since: MON + HOUR,
      waiting_party_responded: false,
      last_updated_at: MON + HOUR,
      related_person_ids: [PARTY],
    });
    expect(await interval(id, 1)).toEqual({
      interval_id: 1,
      waiting_on: { kind: 'person', person_id: PARTY },
      recipient_ids: [PARTY],
      started_at: MON + HOUR,
      started_by_id: GM1,
    });
    expect(await historyOf(id, 'waiting_started')).toEqual([
      expect.objectContaining({ at: MON + HOUR, actor_id: GM1, revision: 3, interval_id: 1, waiting_on: { kind: 'person', person_id: PARTY }, recipient_ids: [PARTY], added_related_person_ids: [PARTY] }),
    ]);
    expect(await readDoc(harness.db, `user_state/${PARTY}/requests/${id}`)).toMatchObject({ type: 'related', activity_seq: 3, last_seen_activity_seq: 0 });
    expect(await gmSummary(id)).toMatchObject({ status: 'waiting', waiting_on_kind: 'person', waiting_on_label: NAMES[PARTY], waiting_since: MON + HOUR, waiting_party_responded: false });
  });

  it('F3: no default party — missing, empty or incomplete waiting_on is refused and nothing is written', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    const before = { request: await request(id), history: (await history(id)).length, outbox: (await outboxOf(id)).length };
    expect(await act(GM1, 'enter_waiting', { request_id: id, expected_revision: 2 })).toMatchObject({ status: 422, body: { error: 'WAITING_ON_REQUIRED' } });
    expect(await enterWaiting(id, {})).toMatchObject({ status: 422, body: { error: 'WAITING_ON_REQUIRED' } });
    expect(await enterWaiting(id, { kind: 'person' })).toMatchObject({ status: 422, body: { error: 'WAITING_PERSON_REQUIRED' } });
    expect(await enterWaiting(id, { kind: 'team' })).toMatchObject({ status: 422, body: { error: 'WAITING_TEAM_LABEL_REQUIRED' } });
    expect(await enterWaiting(id, { kind: 'government' })).toMatchObject({ status: 422, body: { error: 'WAITING_NAME_REQUIRED' } });
    expect(await enterWaiting(id, { kind: 'person', person_id: 'Not An Email' })).toMatchObject({ status: 400, body: { error: 'FIELD_INVALID' } });
    expect(await enterWaiting(id, { kind: 'person', person_id: PARTY, colour: 'red' })).toMatchObject({ status: 400, body: { error: 'UNKNOWN_FIELD' } });
    expect(await request(id)).toEqual(before.request);
    expect(await history(id)).toHaveLength(before.history);
    expect(await outboxOf(id)).toHaveLength(before.outbox);
    expect(await interval(id, 1)).toBeUndefined();
  });

  it('change the waited party A → B: A’s interval ends (response kept), B’s opens; history keeps both', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    setNow(MON + HOUR);
    expect(await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 200 });
    setNow(MON + 2 * HOUR);
    const reply = await act(GM1, 'change_waiting_party', {
      request_id: id,
      expected_revision: await revisionOf(id),
      waiting_on: { kind: 'team', team_label: 'ทีมจัดซื้อ', contact_ids: [CONTACT1, CONTACT2] },
    });
    expect(reply).toMatchObject({ status: 200, body: { result: { status: 'waiting', waiting_interval_id: 2 } } });
    expect(await interval(id, 1)).toMatchObject({ started_at: MON, responded_at: MON + HOUR, responded_by_id: PARTY, exited_at: MON + 2 * HOUR, exit_reason: 'changed' });
    expect(await interval(id, 2)).toEqual({
      interval_id: 2,
      waiting_on: { kind: 'team', team_label: 'ทีมจัดซื้อ', contact_ids: [CONTACT1, CONTACT2] },
      recipient_ids: [CONTACT1, CONTACT2],
      started_at: MON + 2 * HOUR,
      started_by_id: GM1,
    });
    const started = await historyOf(id, 'waiting_started');
    expect(started).toHaveLength(2);
    expect(started[1]).toMatchObject({ interval_id: 2, ended_interval: { interval_id: 1, started_at: MON, responded_at: MON + HOUR, exited_at: MON + 2 * HOUR, recipient_ids: [PARTY] } });
    const current = await request(id);
    expect(current).toMatchObject({ current_waiting_interval_id: 2, waiting_interval_seq: 2, waiting_since: MON + 2 * HOUR, waiting_party_responded: false });
    expect(current).not.toHaveProperty('responded_at');
    // D-S06-5: the earlier recipient stays related.
    expect(current?.related_person_ids).toEqual([PARTY, CONTACT1, CONTACT2]);
  });

  it('“ติดตามแล้ว”: history + last_updated_at; waiting_since unchanged; no message without a reminder', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    const dmsBefore = (await noticesOf(id, 'waiting_requested')).length;
    setNow(MON + 3 * HOUR);
    const reply = await act(GM1, 'follow_up', { request_id: id, expected_revision: await revisionOf(id) });
    expect(reply).toMatchObject({ status: 200, body: { result: { status: 'waiting' } } });
    expect(reply.body.result).not.toHaveProperty('reminder');
    expect(await request(id)).toMatchObject({ last_updated_at: MON + 3 * HOUR, waiting_since: MON, status: 'waiting' });
    expect(await historyOf(id, 'followed_up')).toEqual([expect.objectContaining({ at: MON + 3 * HOUR, actor_id: GM1, interval_id: 1 })]);
    expect((await historyOf(id, 'followed_up'))[0]).not.toHaveProperty('reminder');
    expect(await noticesOf(id, 'waiting_reminder')).toEqual([]);
    expect(await noticesOf(id, 'waiting_requested')).toHaveLength(dmsBefore);
  });

  it('reminder: once per business day per request — the second the same day is recorded but not sent', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    setNow(MON + HOUR);
    const first = await act(GM1, 'follow_up', { request_id: id, expected_revision: await revisionOf(id), remind: true });
    expect(first).toMatchObject({ status: 200, body: { result: { reminder: { status: 'send_now', business_date: '2026-12-28' } } } });
    expect(await noticesOf(id, 'waiting_reminder')).toEqual([
      expect.objectContaining({ recipient_id: PARTY, audience: 'waiting_party', waiting_interval_id: 1, next_attempt_at: MON + HOUR, state: 'pending' }),
    ]);
    setNow(MON + 5 * HOUR);
    const second = await act(GM2, 'follow_up', { request_id: id, expected_revision: await revisionOf(id), remind: true });
    expect(second).toMatchObject({ status: 200, body: { result: { reminder: { status: 'quota_used', business_date: '2026-12-28' } } } });
    expect(await noticesOf(id, 'waiting_reminder')).toHaveLength(1);
    expect((await historyOf(id, 'followed_up')).map((event) => (event.reminder as { status: string }).status)).toEqual(['send_now', 'quota_used']);
    expect((await historyOf(id, 'followed_up'))[0]).toMatchObject({ reminded_at: MON + HOUR });
    expect(await request(id)).toMatchObject({ last_updated_at: MON + 5 * HOUR, last_reminder_business_date: '2026-12-28' });
    // The next business day has its own quota.
    setNow(MON + 24 * HOUR);
    expect(await act(GM1, 'follow_up', { request_id: id, expected_revision: await revisionOf(id), remind: true })).toMatchObject({
      status: 200,
      body: { result: { reminder: { status: 'send_now', business_date: '2026-12-29' } } },
    });
    expect(await noticesOf(id, 'waiting_reminder')).toHaveLength(2);
  });

  it('reminder on a holiday: goes out at 09:00 of the next business day and uses that day’s quota', async () => {
    setNow(at('2026-12-30T10:00:00+07:00'));
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    setNow(at('2026-12-31T11:00:00+07:00')); // holiday
    const sendAt = at('2027-01-04T09:00:00+07:00'); // Mon after the New Year holidays and the weekend
    expect(await act(GM1, 'follow_up', { request_id: id, expected_revision: await revisionOf(id), remind: true })).toMatchObject({
      status: 200,
      body: { result: { reminder: { status: 'next_business_day', business_date: '2027-01-04', send_at: sendAt } } },
    });
    expect(await noticesOf(id, 'waiting_reminder')).toEqual([expect.objectContaining({ recipient_id: PARTY, next_attempt_at: sendAt, state: 'pending' })]);
    expect((await historyOf(id, 'followed_up'))[0]).toMatchObject({ reminder: { status: 'next_business_day', send_at: sendAt } });
    expect((await historyOf(id, 'followed_up'))[0]).not.toHaveProperty('reminded_at');
    // Pressed again on the business day it was deferred to: that day’s quota is already used.
    setNow(sendAt + HOUR);
    expect(await act(GM1, 'follow_up', { request_id: id, expected_revision: await revisionOf(id), remind: true })).toMatchObject({
      status: 200,
      body: { result: { reminder: { status: 'quota_used', business_date: '2027-01-04' } } },
    });
    expect(await noticesOf(id, 'waiting_reminder')).toHaveLength(1);
  });

  it('“ฝั่งฉันเรียบร้อยแล้ว”: recorded on the interval and in history with the note; no status or last_updated_at change', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    const before = await request(id);
    setNow(MON + 2 * HOUR);
    const reply = await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1, note: RESPONSE_NOTE });
    expect(reply).toMatchObject({ status: 200, body: { result: { status: 'waiting', revision: (before?.revision as number) + 1 } } });
    const after = await request(id);
    expect(after).toMatchObject({ status: 'waiting', waiting_party_responded: true, responded_at: MON + 2 * HOUR, last_updated_at: before?.last_updated_at, waiting_since: MON });
    expect(await interval(id, 1)).toMatchObject({ responded_at: MON + 2 * HOUR, responded_by_id: PARTY });
    expect(await historyOf(id, 'waiting_party_responded')).toEqual([expect.objectContaining({ at: MON + 2 * HOUR, actor_id: PARTY, interval_id: 1, note: RESPONSE_NOTE })]);
    expect(await gmSummary(id)).toMatchObject({ status: 'waiting', waiting_party_responded: true, last_updated_at: before?.last_updated_at });
  });

  it('“กลับมาทำต่อ”: in progress again, the interval ends, history keeps it', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    setNow(MON + 4 * HOUR);
    expect(await act(GM1, 'resume_work', { request_id: id, expected_revision: await revisionOf(id) })).toMatchObject({ status: 200, body: { result: { status: 'in_progress' } } });
    const current = await request(id);
    expect(current).toMatchObject({ status: 'in_progress', last_updated_at: MON + 4 * HOUR, waiting_interval_seq: 1 });
    for (const field of ['waiting_on', 'current_waiting_interval_id', 'waiting_since', 'waiting_party_responded', 'responded_at']) expect(current).not.toHaveProperty(field);
    expect(await interval(id, 1)).toMatchObject({ exited_at: MON + 4 * HOUR, exit_reason: 'resumed' });
    expect(await historyOf(id, 'waiting_ended')).toEqual([
      expect.objectContaining({ actor_id: GM1, ended_interval: expect.objectContaining({ interval_id: 1, started_at: MON, exited_at: MON + 4 * HOUR, recipient_ids: [PARTY] }) }),
    ]);
    // A second waiting interval gets the next number.
    expect(await enterWaiting(id, { kind: 'contractor', name: VENDOR })).toMatchObject({ status: 200, body: { result: { waiting_interval_id: 2 } } });
  });
});

describe('FU-26: cancelling a waiting request closes the open interval in the same transaction', () => {
  it('interval exit time + ended interval in the cancel history event', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    setNow(MON + 2 * HOUR);
    expect(await act(GM1, 'cancel_request', { request_id: id, expected_revision: await revisionOf(id), reason: 'ผู้แจ้งย้ายห้องประชุมแล้ว' })).toMatchObject({ status: 200 });
    expect(await interval(id, 1)).toMatchObject({ exited_at: MON + 2 * HOUR, exit_reason: 'cancelled' });
    expect(await historyOf(id, 'cancelled')).toEqual([
      expect.objectContaining({ ended_waiting_interval: expect.objectContaining({ interval_id: 1, started_at: MON, exited_at: MON + 2 * HOUR, recipient_ids: [PARTY], waiting_on: { kind: 'person', person_id: PARTY } }) }),
    ]);
    const current = await request(id);
    expect(current).toMatchObject({ status: 'cancelled' });
    expect(current).not.toHaveProperty('current_waiting_interval_id');
  });
});

describe('A2.3: the party’s waiting time ends at responded_at; only GM actions move last_updated_at', () => {
  it('enter 10:00, answer 12:00, resume 14:00 → the party is charged 2 hours', async () => {
    const day = (time: string) => at(`2026-12-29T${time}:00+07:00`);
    setNow(day('09:00'));
    const { id } = await inProgressRepair();
    setNow(day('10:00'));
    await waitingOnParty(id);
    setNow(day('12:00'));
    expect(await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 200 });
    setNow(day('14:00'));
    expect(await act(GM1, 'resume_work', { request_id: id, expected_revision: await revisionOf(id) })).toMatchObject({ status: 200 });
    const stored = await interval(id, 1);
    expect(stored).toMatchObject({ started_at: day('10:00'), responded_at: day('12:00'), exited_at: day('14:00') });
    const elapsed = waitingElapsed(
      { startedAt: stored?.started_at as number, respondedAt: stored?.responded_at as number, exitedAt: stored?.exited_at as number },
      day('18:00'),
      'continuous_24h',
      CALENDAR,
    );
    expect(elapsed).toBe(2 * HOUR);
  });

  it('“ติดตามแล้ว” updates last_updated_at; the waited party’s answer does not', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    setNow(MON + HOUR);
    await act(GM1, 'follow_up', { request_id: id, expected_revision: await revisionOf(id) });
    expect(await request(id)).toMatchObject({ last_updated_at: MON + HOUR });
    setNow(MON + 3 * HOUR);
    await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 });
    expect(await request(id)).toMatchObject({ last_updated_at: MON + HOUR, responded_at: MON + 3 * HOUR });
    expect(await gmSummary(id)).toMatchObject({ last_updated_at: MON + HOUR });
  });
});

describe('notices: the waited party by kind, the GM on a response, never the actor', () => {
  it('person: a DM to that person bound to the interval; the requester and watchers hear the status change', async () => {
    setNow(MON);
    const { id, number } = await inProgressRepair();
    expect(await act(WATCHER, 'watch_request', { request_id: id })).toMatchObject({ status: 200 });
    await waitingOnParty(id);
    expect(await noticesOf(id, 'waiting_requested')).toEqual([
      expect.objectContaining({ recipient_id: PARTY, audience: 'waiting_party', waiting_interval_id: 1, request_number: number, state: 'pending' }),
    ]);
    expect((await noticesOf(id, 'request_waiting')).map((entry) => [entry.recipient_id, entry.audience]).sort()).toEqual(
      [
        [EMPLOYEE, 'requester'],
        [WATCHER, 'watcher'],
      ].sort(),
    );
    // GM1 heard of the new request (routing) and nothing since: they accepted and entered waiting.
    expect((await outboxOf(id)).filter((entry) => entry.recipient_id === GM1).map((entry) => entry.event_kind)).toEqual(['request_created']);
  });

  it('the requester or a watcher who is the waited party gets one message — the one asking them — not a status notice too (Q-A04-1)', async () => {
    setNow(MON);
    const asked = await inProgressRepair();
    expect(await enterWaiting(asked.id, { kind: 'person', person_id: EMPLOYEE })).toMatchObject({ status: 200 });
    const toRequester = (await outboxOf(asked.id)).filter((entry) => entry.recipient_id === EMPLOYEE && entry.revision === 3);
    // The requester's badge (A1.2) still follows it: audience requester.
    expect(toRequester.map((entry) => [entry.event_kind, entry.audience])).toEqual([['waiting_requested', 'requester']]);
    expect(await act(EMPLOYEE, 'respond_waiting_party', { request_id: asked.id, waiting_interval_id: 1 })).toMatchObject({ status: 200 });
    const watched = await inProgressRepair();
    expect(await act(WATCHER, 'watch_request', { request_id: watched.id })).toMatchObject({ status: 200 });
    expect(await enterWaiting(watched.id, { kind: 'person', person_id: WATCHER })).toMatchObject({ status: 200 });
    expect((await outboxOf(watched.id)).filter((entry) => entry.recipient_id === WATCHER).map((entry) => [entry.event_kind, entry.audience])).toEqual([['waiting_requested', 'waiting_party']]);
    expect(recipients(await noticesOf(watched.id, 'request_waiting'))).toEqual([EMPLOYEE]);
  });

  it('team: each chosen contact; a team without contacts and external parties: no DM (notify unavailable)', async () => {
    setNow(MON);
    const team = await inProgressRepair();
    expect(await enterWaiting(team.id, { kind: 'team', team_label: 'ทีมจัดซื้อ', contact_ids: [CONTACT1, CONTACT2] })).toMatchObject({ status: 200 });
    expect(recipients(await noticesOf(team.id, 'waiting_requested'))).toEqual([CONTACT1, CONTACT2].sort());
    const bare = await inProgressRepair();
    expect(await enterWaiting(bare.id, { kind: 'team', team_label: 'ทีมอาคาร' })).toMatchObject({ status: 200 });
    expect(await noticesOf(bare.id, 'waiting_requested')).toEqual([]);
    expect((await request(bare.id))?.related_person_ids).toEqual([]);
    for (const party of [
      { kind: 'contractor', name: VENDOR },
      { kind: 'government', name: AGENCY },
      { kind: 'other', name: 'รอของจากต่างประเทศ' },
    ]) {
      const external = await inProgressRepair();
      expect(await enterWaiting(external.id, party, { notify: true })).toMatchObject({ status: 422, body: { error: 'NOTIFY_NOT_AVAILABLE' } });
      expect(await enterWaiting(external.id, party)).toMatchObject({ status: 200 });
      expect(await noticesOf(external.id, 'waiting_requested')).toEqual([]);
      expect((await request(external.id))?.related_person_ids).toEqual([]);
    }
  });

  it('person with the notice turned off: no DM, not added as related, cannot answer', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    expect(await enterWaiting(id, { kind: 'person', person_id: PARTY }, { notify: false })).toMatchObject({ status: 200 });
    expect(await noticesOf(id, 'waiting_requested')).toEqual([]);
    expect((await request(id))?.related_person_ids).toEqual([]);
    expect(await interval(id, 1)).toMatchObject({ recipient_ids: [] });
    // Not related, so the request is not readable for them: same answer as a missing request.
    expect(await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 404 });
  });

  it('D-S06-4: a waited GM is told but not added as related (no grant needed on a confidential request) and may answer', async () => {
    setNow(MON);
    const { id } = await inProgressDocument();
    expect(await act(GM2, 'mark_confidential', { request_id: id, expected_revision: await revisionOf(id), sensitivity_reason: 'contract', keep_related_person_ids: [] })).toMatchObject({ status: 200 });
    expect(await enterWaiting(id, { kind: 'person', person_id: GM1 }, {}, GM2)).toMatchObject({ status: 200 });
    expect(await noticesOf(id, 'waiting_requested')).toEqual([expect.objectContaining({ recipient_id: GM1, audience: 'waiting_party', confidential: true })]);
    const current = await request(id);
    expect(current?.related_person_ids).toEqual([]);
    expect(current?.confidential_grant_ids ?? []).toEqual([]);
    expect(await act(GM1, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 200 });
  });

  it('a GM waiting on themself is not sent a DM (D-S08-2)', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    expect(await enterWaiting(id, { kind: 'person', person_id: GM1 })).toMatchObject({ status: 200 });
    expect(await noticesOf(id, 'waiting_requested')).toEqual([]);
  });

  it('“ฝั่งฉันเรียบร้อยแล้ว” tells the assigned GM; the person who answered is not told', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    expect(await enterWaiting(id, { kind: 'team', team_label: 'ทีมจัดซื้อ', contact_ids: [CONTACT1, CONTACT2] })).toMatchObject({ status: 200 });
    expect(await act(CONTACT1, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 200 });
    expect((await noticesOf(id, 'waiting_party_responded')).map((entry) => [entry.recipient_id, entry.audience])).toEqual([[GM1, 'gm']]);
    // The assignee themself waited on and answered: nobody else to tell.
    const own = await inProgressRepair();
    expect(await enterWaiting(own.id, { kind: 'person', person_id: GM1 })).toMatchObject({ status: 200 });
    expect(await act(GM1, 'respond_waiting_party', { request_id: own.id, waiting_interval_id: 1 })).toMatchObject({ status: 200 });
    expect(await noticesOf(own.id, 'waiting_party_responded')).toEqual([]);
  });

  it('D-A04-2: resume sends nobody a message — the requester and watchers only get the update dot', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    expect(await act(WATCHER, 'watch_request', { request_id: id })).toMatchObject({ status: 200 });
    await waitingOnParty(id);
    const seenSeq = (await request(id))?.activity_seq as number;
    for (const person of [EMPLOYEE, WATCHER]) {
      expect(await call('POST', person, `/api/requests/${id}/seen`, { activity_seq: seenSeq })).toMatchObject({ status: 200, body: { has_update: false } });
    }
    const before = (await outboxOf(id)).length;
    expect(await act(GM1, 'resume_work', { request_id: id, expected_revision: await revisionOf(id) })).toMatchObject({ status: 200 });
    expect(await outboxOf(id)).toHaveLength(before);
    expect(await noticesOf(id, 'request_resumed')).toEqual([]);
    for (const person of [EMPLOYEE, WATCHER]) {
      const mine = await call('GET', person, '/api/me/requests');
      expect((mine.body.items as { request_id: string; has_update: boolean }[]).find((item) => item.request_id === id), person).toMatchObject({ has_update: true, activity_seq: seenSeq + 1 });
    }
  });
});

describe('the worker rechecks the interval and access before it sends (F05 §9.3)', () => {
  it('a DM to a party no longer waited on is suppressed; the new party’s DM goes out', async () => {
    setNow(MON);
    sends.length = 0;
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    const old = (await noticesOf(id, 'waiting_requested'))[0];
    await act(GM1, 'change_waiting_party', { request_id: id, expected_revision: await revisionOf(id), waiting_on: { kind: 'person', person_id: LONER } });
    setNow(MON + 60_000);
    await runTick(workerDeps());
    const dms = await noticesOf(id, 'waiting_requested');
    expect(dms.find((entry) => entry.recipient_id === PARTY)).toMatchObject({ state: 'suppressed', last_error_code: 'WAITING_ENDED' });
    expect(dms.find((entry) => entry.recipient_id === LONER)).toMatchObject({ state: 'provider_accepted' });
    expect(old?.recipient_id).toBe(PARTY);
    expect(sends.filter((message) => message.requestId === id && message.eventKind === 'waiting_requested').map((message) => message.address)).toEqual([LONER]);
  });

  it('a DM to a person removed from the request is suppressed (no access)', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    expect(await act(GM1, 'remove_related_person', { request_id: id, expected_revision: await revisionOf(id), person_id: PARTY })).toMatchObject({ status: 200 });
    setNow(MON + 60_000);
    await runTick(workerDeps());
    expect((await noticesOf(id, 'waiting_requested'))[0]).toMatchObject({ state: 'suppressed', last_error_code: 'NO_ACCESS' });
  });

  it('a holiday reminder waits for 09:00 of the next business day, then goes out', async () => {
    setNow(at('2026-12-30T10:00:00+07:00'));
    sends.length = 0;
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    setNow(at('2026-12-31T11:00:00+07:00'));
    await act(GM1, 'follow_up', { request_id: id, expected_revision: await revisionOf(id), remind: true });
    await runTick(workerDeps());
    setNow(at('2027-01-04T08:45:00+07:00'));
    await runTick(workerDeps());
    expect(sends.filter((message) => message.requestId === id && message.eventKind === 'waiting_reminder')).toEqual([]);
    setNow(at('2027-01-04T09:00:00+07:00'));
    await runTick(workerDeps());
    expect(sends.filter((message) => message.requestId === id && message.eventKind === 'waiting_reminder').map((message) => message.address)).toEqual([PARTY]);
  });
});

describe('public summary: who the request waits on (D-S09-1) and “ฝ่ายที่รอตอบกลับแล้ว” (D-S09-7)', () => {
  it('a person shows their team, never their name; unknown team → “พนักงาน”; team label; contractor generic; government name', async () => {
    setNow(MON);
    const cases: [Record<string, unknown>, string][] = [
      [{ kind: 'person', person_id: PARTY }, 'ทีมบัญชี'],
      [{ kind: 'person', person_id: LONER }, 'พนักงาน'],
      [{ kind: 'team', team_label: 'ทีมจัดซื้อ' }, 'ทีมจัดซื้อ'],
      [{ kind: 'contractor', name: VENDOR }, 'ผู้รับเหมา'],
      [{ kind: 'government', name: AGENCY }, AGENCY],
      [{ kind: 'other', name: 'รอของจากต่างประเทศ' }, 'อื่นๆ'],
    ];
    for (const [party, label] of cases) {
      const { id } = await inProgressRepair();
      expect(await enterWaiting(id, party)).toMatchObject({ status: 200 });
      const summary = await publicSummary(id);
      expect(summary).toMatchObject({ status: 'waiting', waiting_on_summary: label, waiting_party_responded: false });
      const text = JSON.stringify(summary);
      for (const secret of [NAMES[PARTY], NAMES[LONER], PARTY, LONER, VENDOR]) expect(text).not.toContain(secret);
    }
  });

  it('after the answer: a neutral flag only — not who answered, not when, not the note', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    setNow(MON + HOUR);
    await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1, note: RESPONSE_NOTE });
    const summary = await publicSummary(id);
    expect(summary).toMatchObject({ waiting_on_summary: 'ทีมบัญชี', waiting_party_responded: true });
    expect(summary).not.toHaveProperty('responded_at');
    for (const secret of [RESPONSE_NOTE, PARTY, NAMES[PARTY]]) expect(JSON.stringify(summary)).not.toContain(secret);
  });
});

describe('races: the waited party answers while the GM resumes', () => {
  it('at the same moment: exactly one wins and the request, interval and history agree with it', async () => {
    for (let round = 0; round < 4; round += 1) {
      setNow(MON);
      const { id } = await inProgressRepair();
      await waitingOnParty(id);
      setNow(MON + HOUR);
      const revision = await revisionOf(id);
      const [answer, resume] = await Promise.all([
        act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 }),
        act(GM1, 'resume_work', { request_id: id, expected_revision: revision }),
      ]);
      expect([answer.status, resume.status].sort()).toEqual([200, 409]);
      const current = await request(id);
      const stored = await interval(id, 1);
      if (answer.status === 200) {
        expect(resume.body).toMatchObject({ error: 'REVISION_CONFLICT', current: { revision: revision + 1, status: 'waiting' } });
        expect(current).toMatchObject({ status: 'waiting', waiting_party_responded: true });
        expect(stored).toMatchObject({ responded_at: MON + HOUR });
        expect(stored).not.toHaveProperty('exited_at');
        expect(await historyOf(id, 'waiting_ended')).toEqual([]);
        expect(await noticesOf(id, 'waiting_party_responded')).toHaveLength(1);
      } else {
        expect(answer.body).toMatchObject({ error: 'NOT_WAITING', current: { status: 'in_progress' } });
        expect(current).toMatchObject({ status: 'in_progress' });
        expect(stored).toMatchObject({ exited_at: MON + HOUR });
        expect(stored).not.toHaveProperty('responded_at');
        expect(await historyOf(id, 'waiting_party_responded')).toEqual([]);
        expect(await noticesOf(id, 'waiting_party_responded')).toEqual([]);
      }
      expect(current?.revision).toBe(revision + 1);
    }
  });

  it('answer first, then the GM resumes on the latest revision: the interval keeps both times', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    setNow(MON + HOUR);
    await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 });
    setNow(MON + 2 * HOUR);
    expect(await act(GM1, 'resume_work', { request_id: id, expected_revision: await revisionOf(id) })).toMatchObject({ status: 200 });
    expect(await interval(id, 1)).toMatchObject({ responded_at: MON + HOUR, exited_at: MON + 2 * HOUR });
  });

  it('two team contacts answer at once: the first counts for the team, the second learns it was already answered', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await enterWaiting(id, { kind: 'team', team_label: 'ทีมจัดซื้อ', contact_ids: [CONTACT1, CONTACT2] });
    const replies = await Promise.all([
      act(CONTACT1, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 }),
      act(CONTACT2, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 }),
    ]);
    expect(replies.map((reply) => reply.status).sort()).toEqual([200, 409]);
    expect(replies.find((reply) => reply.status === 409)?.body).toMatchObject({ error: 'ALREADY_RESPONDED', current: { waiting_party_responded: true } });
    expect(await historyOf(id, 'waiting_party_responded')).toHaveLength(1);
    expect(await noticesOf(id, 'waiting_party_responded')).toHaveLength(1);
  });
});

describe('A2.2: the next contact of a team does not move the response time', () => {
  it('a later answer by another contact is refused and responded_at stays the first one', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await enterWaiting(id, { kind: 'team', team_label: 'ทีมจัดซื้อ', contact_ids: [CONTACT1, CONTACT2] });
    setNow(MON + HOUR);
    expect(await act(CONTACT1, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 200 });
    setNow(MON + 3 * HOUR);
    expect(await act(CONTACT2, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 409, body: { error: 'ALREADY_RESPONDED' } });
    expect(await request(id)).toMatchObject({ responded_at: MON + HOUR });
    expect(await interval(id, 1)).toMatchObject({ responded_at: MON + HOUR, responded_by_id: CONTACT1 });
  });
});

describe('preview before confirming (F05 §9.2, Part 6 §6.6): who is told, who gets access, whether a grant is needed', () => {
  it('waiting: recipients with names, new related persons, no grant on a general request; GM only; nothing written', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    const before = await request(id);
    const preview = await call('POST', GM1, `/api/requests/${id}/waiting-preview`, { waiting_on: { kind: 'team', team_label: 'ทีมจัดซื้อ', contact_ids: [CONTACT1, GM2] } });
    expect(preview).toEqual({
      status: 200,
      body: {
        waiting_on: { kind: 'team', team_label: 'ทีมจัดซื้อ', contact_ids: [CONTACT1, GM2] },
        recipients: [
          { person_id: CONTACT1, display_name: NAMES[CONTACT1] },
          { person_id: GM2, display_name: NAMES[GM2] },
        ],
        // D-S06-4: the GM contact is told but not added.
        new_related_person_ids: [CONTACT1],
        new_grant_person_ids: [],
        needs_confidential_grant: false,
      },
    });
    expect(await call('POST', GM1, `/api/requests/${id}/waiting-preview`, { waiting_on: { kind: 'person', person_id: PARTY }, notify: false })).toMatchObject({
      status: 200,
      body: { recipients: [], new_related_person_ids: [], needs_confidential_grant: false },
    });
    expect(await call('POST', GM1, `/api/requests/${id}/waiting-preview`, {})).toMatchObject({ status: 422, body: { error: 'WAITING_ON_REQUIRED' } });
    expect(await call('POST', GM1, `/api/requests/${id}/waiting-preview`, { waiting_on: { kind: 'contractor', name: VENDOR }, notify: true })).toMatchObject({ status: 422, body: { error: 'NOTIFY_NOT_AVAILABLE' } });
    expect(await call('POST', GM1, `/api/requests/${id}/waiting-preview`, { waiting_on: { kind: 'person', person_id: PARTY }, extra: 1 })).toMatchObject({ status: 400 });
    expect(await call('POST', EMPLOYEE, `/api/requests/${id}/waiting-preview`, { waiting_on: { kind: 'person', person_id: PARTY } })).toMatchObject({ status: 403, body: { error: 'GM_ONLY' } });
    expect(await call('POST', OTHER, `/api/requests/${id}/waiting-preview`, { waiting_on: { kind: 'person', person_id: PARTY } })).toMatchObject({ status: 404 });
    expect(await request(id)).toEqual(before);
  });

  it('confidential: an existing related person without a grant and a new person both need the separate confirmation', async () => {
    setNow(MON);
    const { id } = await inProgressDocument([R1]);
    await act(GM2, 'mark_confidential', { request_id: id, expected_revision: await revisionOf(id), sensitivity_reason: 'contract', keep_related_person_ids: [] });
    expect(await call('POST', GM2, `/api/requests/${id}/waiting-preview`, { waiting_on: { kind: 'team', team_label: 'ทีมจัดซื้อ', contact_ids: [R1, CONTACT1] } })).toMatchObject({
      status: 200,
      body: { new_related_person_ids: [CONTACT1], new_grant_person_ids: [R1, CONTACT1], needs_confidential_grant: true },
    });
    expect(await call('POST', GM2, `/api/requests/${id}/related-preview`, { person_ids: [R1, R2] })).toEqual({
      status: 200,
      body: {
        people: [
          { person_id: R1, display_name: NAMES[R1] },
          { person_id: R2, display_name: NAMES[R2] },
        ],
        new_related_person_ids: [R2],
        new_grant_person_ids: [R1, R2],
        needs_confidential_grant: true,
      },
    });
    expect(await call('POST', EMPLOYEE, `/api/requests/${id}/related-preview`, { person_ids: [R2] })).toMatchObject({ status: 403, body: { error: 'GM_ONLY' } });
    expect(await call('POST', GM2, `/api/requests/${id}/related-preview`, { person_ids: ['not-a-person'] })).toMatchObject({ status: 400 });
  });
});

describe('who may answer or act', () => {
  it('only a current recipient answers; an earlier interval is refused; GM commands are GM only; outsiders get 404', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    await waitingOnParty(id);
    expect(await act(EMPLOYEE, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 403, body: { error: 'NOT_CURRENT_RECIPIENT' } });
    expect(await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 7 })).toMatchObject({ status: 409, body: { error: 'STALE_WAITING_INTERVAL' } });
    expect(await act(PARTY, 'follow_up', { request_id: id, expected_revision: await revisionOf(id) })).toMatchObject({ status: 403, body: { error: 'GM_ONLY' } });
    expect(await act(EMPLOYEE, 'resume_work', { request_id: id, expected_revision: await revisionOf(id) })).toMatchObject({ status: 403, body: { error: 'GM_ONLY' } });
    expect(await act(OTHER, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 404, body: { error: 'REQUEST_NOT_FOUND' } });
    expect(await act(GM1, 'follow_up', { request_id: id, expected_revision: 1 })).toMatchObject({ status: 409, body: { error: 'REVISION_CONFLICT' } });
    // The old party cannot answer the new interval.
    await act(GM1, 'change_waiting_party', { request_id: id, expected_revision: await revisionOf(id), waiting_on: { kind: 'person', person_id: LONER } });
    expect(await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 2 })).toMatchObject({ status: 403, body: { error: 'NOT_CURRENT_RECIPIENT' } });
    expect(await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 409, body: { error: 'STALE_WAITING_INTERVAL' } });
    // External parties have no answer button.
    const external = await inProgressRepair();
    await enterWaiting(external.id, { kind: 'contractor', name: VENDOR });
    expect(await act(GM1, 'respond_waiting_party', { request_id: external.id, waiting_interval_id: 1 })).toMatchObject({ status: 422, body: { error: 'NO_RESPONSE_FOR_PARTY' } });
  });
});

describe('FU-12: add / remove related persons through the API', () => {
  it('general request: added people read it at once (names written, user_state, history); removed people no longer can', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    expect(await call('GET', OTHER, `/api/requests/${id}`)).toMatchObject({ status: 404 });
    const reply = await act(GM1, 'add_related_persons', { request_id: id, expected_revision: await revisionOf(id), person_ids: [OTHER, R1] });
    expect(reply).toMatchObject({ status: 200, body: { result: { revision: 3 } } });
    const current = await request(id);
    expect(current).toMatchObject({ related_person_ids: [OTHER, R1], last_updated_at: MON });
    expect(current?.related_people_display).toEqual([
      { person_id: OTHER, display_name: NAMES[OTHER] },
      { person_id: R1, display_name: NAMES[R1] },
    ]);
    expect(await historyOf(id, 'related_persons_added')).toEqual([expect.objectContaining({ actor_id: GM1, person_ids: [OTHER, R1], granted_person_ids: [] })]);
    expect(await readDoc(harness.db, `user_state/${OTHER}/requests/${id}`)).toMatchObject({ type: 'related', activity_seq: 3 });
    expect(await call('GET', OTHER, `/api/requests/${id}`)).toMatchObject({ status: 200 });
    expect(await act(GM1, 'remove_related_person', { request_id: id, expected_revision: await revisionOf(id), person_id: OTHER })).toMatchObject({ status: 200 });
    expect((await request(id))?.related_person_ids).toEqual([R1]);
    expect(await historyOf(id, 'related_person_removed')).toEqual([expect.objectContaining({ person_id: OTHER, grant_withdrawn: false })]);
    expect(await call('GET', OTHER, `/api/requests/${id}`)).toMatchObject({ status: 404 });
    const mine = await call('GET', OTHER, '/api/me/requests');
    expect((mine.body.items as { request_id: string }[]).map((item) => item.request_id)).not.toContain(id);
  });

  it('confidential request: adding needs the separate grant confirmation (D-ACL-2), recorded; removing withdraws it', async () => {
    setNow(MON);
    const { id } = await inProgressDocument();
    await act(GM2, 'mark_confidential', { request_id: id, expected_revision: await revisionOf(id), sensitivity_reason: 'contract', keep_related_person_ids: [] });
    const before = await request(id);
    expect(await act(GM2, 'add_related_persons', { request_id: id, expected_revision: await revisionOf(id), person_ids: [R1] })).toMatchObject({
      status: 422,
      body: { error: 'CONFIDENTIAL_GRANT_REQUIRED' },
    });
    expect(await request(id)).toEqual(before);
    expect(await act(GM2, 'add_related_persons', { request_id: id, expected_revision: await revisionOf(id), person_ids: [R1], confirm_confidential_grant: true })).toMatchObject({ status: 200 });
    expect(await request(id)).toMatchObject({ related_person_ids: [R1], confidential_grant_ids: [R1] });
    expect(await historyOf(id, 'related_persons_added')).toEqual([expect.objectContaining({ person_ids: [R1], granted_person_ids: [R1] })]);
    expect(await call('GET', R1, `/api/requests/${id}`)).toMatchObject({ status: 200 });
    await act(GM2, 'remove_related_person', { request_id: id, expected_revision: await revisionOf(id), person_id: R1 });
    expect(await request(id)).toMatchObject({ related_person_ids: [], confidential_grant_ids: [] });
    expect(await historyOf(id, 'related_person_removed')).toEqual([expect.objectContaining({ person_id: R1, grant_withdrawn: true })]);
    expect(await call('GET', R1, `/api/requests/${id}`)).toMatchObject({ status: 404 });
  });

  it('D-A04-3: people added as related get one DM when added; nothing when removed; the waited party gets only the waiting DM', async () => {
    setNow(MON);
    const { id, number } = await inProgressRepair();
    await act(GM1, 'add_related_persons', { request_id: id, expected_revision: await revisionOf(id), person_ids: [OTHER, R1] });
    const added = await noticesOf(id, 'related_added');
    expect(added.map((entry) => [entry.recipient_id, entry.audience]).sort()).toEqual(
      [
        [OTHER, 'related'],
        [R1, 'related'],
      ].sort(),
    );
    for (const entry of added) expect(entry).toMatchObject({ request_number: number, confidential: false, state: 'pending' });
    // Nobody new: nothing changes, nobody is told again.
    expect(await act(GM1, 'add_related_persons', { request_id: id, expected_revision: await revisionOf(id), person_ids: [OTHER] })).toMatchObject({ status: 200 });
    expect(await noticesOf(id, 'related_added')).toHaveLength(2);
    // Removing is not announced.
    await act(GM1, 'remove_related_person', { request_id: id, expected_revision: await revisionOf(id), person_id: R1 });
    expect((await outboxOf(id)).filter((entry) => entry.recipient_id === R1).map((entry) => entry.event_kind)).toEqual(['related_added']);
    // Becoming related by being waited on: one message, the one asking them.
    await waitingOnParty(id);
    expect((await outboxOf(id)).filter((entry) => entry.recipient_id === PARTY).map((entry) => entry.event_kind)).toEqual(['waiting_requested']);
  });

  it('D-A04-3: confidential request — the person added with the grant is told (neutral text); removed before the send → not told', async () => {
    setNow(MON);
    const { id } = await inProgressDocument();
    await act(GM2, 'mark_confidential', { request_id: id, expected_revision: await revisionOf(id), sensitivity_reason: 'contract', keep_related_person_ids: [] });
    await act(GM2, 'add_related_persons', { request_id: id, expected_revision: await revisionOf(id), person_ids: [R1], confirm_confidential_grant: true });
    expect(await noticesOf(id, 'related_added')).toEqual([expect.objectContaining({ recipient_id: R1, audience: 'related', confidential: true })]);
    await act(GM2, 'remove_related_person', { request_id: id, expected_revision: await revisionOf(id), person_id: R1 });
    setNow(MON + 60_000);
    await runTick(workerDeps());
    expect((await noticesOf(id, 'related_added'))[0]).toMatchObject({ state: 'suppressed', last_error_code: 'NO_ACCESS' });
  });

  it('GM only; stale revision refused; a person not related cannot be removed', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    expect(await act(EMPLOYEE, 'add_related_persons', { request_id: id, expected_revision: await revisionOf(id), person_ids: [OTHER] })).toMatchObject({ status: 403, body: { error: 'GM_ONLY' } });
    expect(await act(GM1, 'add_related_persons', { request_id: id, expected_revision: 1, person_ids: [OTHER] })).toMatchObject({ status: 409, body: { error: 'REVISION_CONFLICT' } });
    expect(await act(GM1, 'remove_related_person', { request_id: id, expected_revision: await revisionOf(id), person_id: OTHER })).toMatchObject({ status: 422, body: { error: 'NOT_RELATED' } });
  });
});

describe('FU-09: flag confidential later (kept related persons) and GM Admin removes the flag', () => {
  it('flag: summary gone, internal count + visibility epoch in the same transaction, only kept people still read it', async () => {
    setNow(MON);
    const { id } = await inProgressDocument([R1, R2]);
    expect(await publicSummary(id)).toBeDefined();
    const [count, visibility] = [await boardCount(), await epoch()];
    expect(await act(GM2, 'mark_confidential', { request_id: id, expected_revision: await revisionOf(id), sensitivity_reason: 'contract' })).toMatchObject({
      status: 422,
      body: { error: 'KEEP_LIST_REQUIRED' },
    });
    setNow(MON + HOUR);
    const reply = await act(GM2, 'mark_confidential', { request_id: id, expected_revision: await revisionOf(id), sensitivity_reason: 'contract', keep_related_person_ids: [R1] });
    expect(reply).toMatchObject({ status: 200 });
    expect(await request(id)).toMatchObject({ is_confidential: true, sensitivity_reason: 'contract', related_person_ids: [R1, R2], confidential_grant_ids: [R1], last_updated_at: MON + HOUR });
    expect(await publicSummary(id)).toBeUndefined();
    expect(await gmSummary(id)).toMatchObject({ is_confidential: true });
    expect(await boardCount()).toBe(count + 1);
    expect(await epoch()).toBe(visibility + 1);
    expect(await historyOf(id, 'confidential_flag_set')).toEqual([expect.objectContaining({ actor_id: GM2, sensitivity_reason: 'contract', kept_person_ids: [R1], withdrawn_person_ids: [R2] })]);
    expect(await call('GET', R1, `/api/requests/${id}`)).toMatchObject({ status: 200 });
    expect(await call('GET', R2, `/api/requests/${id}`)).toMatchObject({ status: 404 });
    expect(await call('GET', R2, `/api/requests/${id}/history`)).toMatchObject({ status: 404 });
  });

  it('a GM-marked “other” flag keeps its note GM-only; a repair can never be flagged', async () => {
    setNow(MON);
    const { id } = await inProgressDocument();
    expect(await act(GM2, 'mark_confidential', { request_id: id, expected_revision: await revisionOf(id), sensitivity_reason: 'other', note: 'เกี่ยวกับคดีความ', keep_related_person_ids: [] })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, `gm_request_details/${id}`)).toMatchObject({ sensitivity_note: 'เกี่ยวกับคดีความ' });
    expect(JSON.stringify(await request(id))).not.toContain('เกี่ยวกับคดีความ');
    const repair = await inProgressRepair();
    expect(await act(GM1, 'mark_confidential', { request_id: repair.id, expected_revision: await revisionOf(repair.id), sensitivity_reason: 'contract', keep_related_person_ids: [] })).toMatchObject({
      status: 422,
      body: { error: 'MAINTENANCE_NOT_CONFIDENTIAL' },
    });
  });

  it('remove the flag: GM Admin with a reason; the summary is back, grants cleared, counter and epoch move', async () => {
    setNow(MON);
    const { id } = await inProgressDocument([R1, R2]);
    await act(GM2, 'mark_confidential', { request_id: id, expected_revision: await revisionOf(id), sensitivity_reason: 'personnel', keep_related_person_ids: [R1] });
    const [count, visibility] = [await boardCount(), await epoch()];
    expect(await act(GM2, 'remove_confidential_flag', { request_id: id, expected_revision: await revisionOf(id), reason: 'ไม่ใช่เรื่องลับ' })).toMatchObject({ status: 403, body: { error: 'GM_ADMIN_ONLY' } });
    expect(await act(ADMIN, 'remove_confidential_flag', { request_id: id, expected_revision: await revisionOf(id), reason: '  ' })).toMatchObject({ status: 422, body: { error: 'REASON_REQUIRED' } });
    setNow(MON + 2 * HOUR);
    expect(await act(ADMIN, 'remove_confidential_flag', { request_id: id, expected_revision: await revisionOf(id), reason: 'ตรวจแล้วไม่ใช่เรื่องลับ' })).toMatchObject({ status: 200 });
    const current = await request(id);
    expect(current).toMatchObject({ is_confidential: false, related_person_ids: [R1, R2], last_updated_at: MON + 2 * HOUR });
    expect(current).not.toHaveProperty('confidential_grant_ids');
    expect(current).not.toHaveProperty('sensitivity_reason');
    expect(await publicSummary(id)).toMatchObject({ status: 'in_progress' });
    expect(await boardCount()).toBe(count - 1);
    expect(await epoch()).toBe(visibility + 1);
    // D-A04-8: everyone with detail access sees only that it became a general request.
    const removed = await historyOf(id, 'confidential_flag_removed');
    expect(removed).toEqual([expect.objectContaining({ actor_id: ADMIN, at: MON + 2 * HOUR })]);
    expect(removed[0]).not.toHaveProperty('reason');
    expect(removed[0]).not.toHaveProperty('previous_sensitivity_reason');
    expect(await call('GET', R2, `/api/requests/${id}`)).toMatchObject({ status: 200 });
    const seenByRelated = await call('GET', R2, `/api/requests/${id}/history`);
    expect(seenByRelated.status).toBe(200);
    expect(JSON.stringify(seenByRelated.body)).not.toContain('ตรวจแล้วไม่ใช่เรื่องลับ');
    // The reason is GM-only (gm_history through the API).
    const gmHistory = await call('GET', GM1, `/api/requests/${id}/gm-history`);
    expect(gmHistory.status).toBe(200);
    expect(gmHistory.body.items).toEqual([expect.objectContaining({ kind: 'confidential_flag_removed', actor_id: ADMIN, reason: 'ตรวจแล้วไม่ใช่เรื่องลับ', previous_sensitivity_reason: 'personnel' })]);
    expect(await call('GET', EMPLOYEE, `/api/requests/${id}/gm-history`)).toMatchObject({ status: 403 });
    expect(await call('GET', R2, `/api/requests/${id}/gm-history`)).toMatchObject({ status: 403 });
    expect(await call('GET', OTHER, `/api/requests/${id}/gm-history`)).toMatchObject({ status: 404 });
  });
});

describe('history: every command leaves its event, read through the API with the existing access only', () => {
  it('the full waiting flow, read by the requester and the waited party; not by a watcher or an outsider', async () => {
    setNow(MON);
    const { id } = await inProgressRepair();
    expect(await act(WATCHER, 'watch_request', { request_id: id })).toMatchObject({ status: 200 });
    await waitingOnParty(id);
    await act(GM1, 'follow_up', { request_id: id, expected_revision: await revisionOf(id), remind: true });
    await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 });
    await act(GM1, 'change_waiting_party', { request_id: id, expected_revision: await revisionOf(id), waiting_on: { kind: 'contractor', name: VENDOR } });
    await act(GM1, 'resume_work', { request_id: id, expected_revision: await revisionOf(id) });
    await act(GM1, 'add_related_persons', { request_id: id, expected_revision: await revisionOf(id), person_ids: [R1] });
    await act(GM1, 'remove_related_person', { request_id: id, expected_revision: await revisionOf(id), person_id: R1 });
    const read = await call('GET', EMPLOYEE, `/api/requests/${id}/history`);
    expect(read.status).toBe(200);
    expect((read.body.items as { kind: string }[]).map((event) => event.kind)).toEqual([
      'request_created',
      'accepted',
      'waiting_started',
      'followed_up',
      'waiting_party_responded',
      'waiting_started',
      'waiting_ended',
      'related_persons_added',
      'related_person_removed',
    ]);
    expect(await call('GET', PARTY, `/api/requests/${id}/history`)).toMatchObject({ status: 200 });
    expect(await call('GET', GM2, `/api/requests/${id}/history`)).toMatchObject({ status: 200 });
    expect(await call('GET', WATCHER, `/api/requests/${id}/history`)).toMatchObject({ status: 404 });
    expect(await call('GET', OTHER, `/api/requests/${id}/history`)).toMatchObject({ status: 404 });
    const intervals = await call('GET', EMPLOYEE, `/api/requests/${id}/waiting-intervals`);
    expect(intervals).toMatchObject({ status: 200 });
    expect((intervals.body.items as { interval_id: number }[]).map((item) => item.interval_id)).toEqual([1, 2]);
    expect(await call('GET', WATCHER, `/api/requests/${id}/waiting-intervals`)).toMatchObject({ status: 404 });
    expect(await call('GET', OTHER, `/api/requests/${id}/waiting-intervals`)).toMatchObject({ status: 404 });
  });
});

describe('the same command_id again: no second effect, nobody told twice', () => {
  it('every A04 command replayed returns its first result and changes nothing', async () => {
    setNow(MON);
    const { id } = await inProgressDocument([R1]);
    const snapshot = async () => ({
      request: await request(id),
      history: (await history(id)).length,
      outbox: (await outboxOf(id)).length,
      intervals: [...(await readCollection(harness.db, `requests/${id}/waiting_intervals`)).values()],
      board: await boardCount(),
      epoch: await epoch(),
    });
    const steps: [string, string, () => Promise<Record<string, unknown>>][] = [
      [GM2, 'enter_waiting', async () => ({ request_id: id, expected_revision: await revisionOf(id), waiting_on: { kind: 'person', person_id: PARTY } })],
      [GM2, 'follow_up', async () => ({ request_id: id, expected_revision: await revisionOf(id), remind: true })],
      [PARTY, 'respond_waiting_party', async () => ({ request_id: id, waiting_interval_id: 1, note: RESPONSE_NOTE })],
      [GM2, 'change_waiting_party', async () => ({ request_id: id, expected_revision: await revisionOf(id), waiting_on: { kind: 'team', team_label: 'ทีมจัดซื้อ', contact_ids: [CONTACT1] } })],
      [GM2, 'resume_work', async () => ({ request_id: id, expected_revision: await revisionOf(id) })],
      [GM2, 'add_related_persons', async () => ({ request_id: id, expected_revision: await revisionOf(id), person_ids: [R2] })],
      [GM2, 'remove_related_person', async () => ({ request_id: id, expected_revision: await revisionOf(id), person_id: R2 })],
      [GM2, 'mark_confidential', async () => ({ request_id: id, expected_revision: await revisionOf(id), sensitivity_reason: 'contract', keep_related_person_ids: [R1] })],
      [ADMIN, 'remove_confidential_flag', async () => ({ request_id: id, expected_revision: await revisionOf(id), reason: 'ตรวจแล้วไม่ใช่เรื่องลับ' })],
    ];
    for (const [who, type, payloadOf] of steps) {
      const commandId = randomUUID();
      const payload = await payloadOf();
      const first = await act(who, type, payload, commandId);
      expect(first, type).toMatchObject({ status: 200, body: { replayed: false } });
      const after = await snapshot();
      const again = await act(who, type, payload, commandId);
      expect(again, type).toMatchObject({ status: 200, body: { replayed: true, result: (first.body as { result: unknown }).result } });
      expect(await snapshot(), type).toEqual(after);
    }
  });
});

describe('logs and network (runs last)', () => {
  it('nothing left the machine', () => {
    expect(blockedHosts).toEqual([]);
  });

  it('logs hold no e-mail, name, note or party name', () => {
    const text = logs.lines.join('\n');
    for (const secret of [...Object.keys(NAMES), ...Object.values(NAMES), RESPONSE_NOTE, VENDOR, AGENCY, 'เกี่ยวกับคดีความ', 'Bearer ']) {
      expect(text).not.toContain(secret);
    }
  });
});
