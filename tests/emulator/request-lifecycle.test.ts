// A03 — request lifecycle persistence and optimistic revision, through the HTTP API on the emulators
// (Part 6 §6.6/§6.9, S05 commands, D-S05-*, D-S07-6, D-S09-4, D-S08-2, U1, US-08/09). Every command on
// an existing request: one transaction that checks `expected_revision`, applies the S05 domain rule and
// writes the request + public/GM summaries + history + user_state + internal board counter + focus
// release + outbox together. Auto-close runs from the worker tick (job keyed request + completion
// cycle) and competes with the requester through the same transaction rules.
// Emulator only (demo-* project); people, places and IDs are synthetic.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { autoCloseDue, snapshotCalendar } from '@gm/time';
import { CommandRejected, type MaintenanceCatalog } from '../../apps/api/src/commands/index';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { localAdapter } from '../../apps/worker/src/adapters';
import type { WorkerDeps } from '../../apps/worker/src/deps';
import { adminWorkerStore } from '../../apps/worker/src/firestore-store';
import { autoCloseJob } from '../../apps/worker/src/jobs/auto-close';
import { consoleWorkerLogger } from '../../apps/worker/src/log';
import { runTick } from '../../apps/worker/src/tick';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type ApiHarness, type LogCapture } from './support/api-harness';
import { TEST_MAX_ATTEMPTS, clearFirestore, emulatorClient, readCollection, readDoc, type EmulatorClient } from './support/firestore-client-store';

const NOW = Date.parse('2026-12-28T09:00:00+07:00'); // Monday
const HOUR = 3_600_000;

// Synthetic people (D-S08-4 person IDs). Names must never reach a log.
const GM1 = 'a03.gm.one@tdfb.co';
const GM2 = 'a03.gm.two@tdfb.co';
const EMPLOYEE = 'a03.employee@tdfb.co';
const WATCHER = 'a03.watcher@tdfb.co';
const OTHER = 'a03.other@tdfb.co';
const NAMES: Readonly<Record<string, string>> = {
  [GM1]: 'คุณจีเอ็ม หนึ่ง เอ',
  [GM2]: 'คุณจีเอ็ม สอง บี',
  [EMPLOYEE]: 'คุณผู้แจ้ง ซี',
  [WATCHER]: 'คุณผู้ติดตาม ดี',
  [OTHER]: 'คุณคนอื่น อี',
};
const HOLIDAYS = ['2026-12-31', '2027-01-01'];
const CALENDAR = snapshotCalendar({ timeZone: 'Asia/Bangkok', openWeekdays: [1, 2, 3, 4, 5], holidays: HOLIDAYS });
const RESULT_TEXT = 'เปลี่ยนสายแลนที่โต๊ะคุณผู้แจ้งแล้ว';

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

function setNow(instant: number): void {
  now = instant;
  harness.setNow(instant);
}

function workerDeps(): WorkerDeps {
  return {
    store: adminWorkerStore(worker.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
    adapter: localAdapter(consoleWorkerLogger),
    now: () => now,
    newLeaseId: () => randomUUID(),
    log: consoleWorkerLogger,
    jobHandlers: { auto_close: autoCloseJob({ peopleDirectory: transactionPeopleDirectory(), routingDirectory: transactionRoutingDirectory() }) },
  };
}

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly text: string;
}

async function post(who: string, body: unknown): Promise<Reply> {
  const response = await fetch(`${baseUrl}/api/commands`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tokens.get(who) ?? ''}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>), text };
}

const command = (type: string, payload: Record<string, unknown>, commandId: string = randomUUID()) => ({ command_id: commandId, type, payload });

async function act(who: string, type: string, payload: Record<string, unknown>, commandId?: string): Promise<Reply> {
  return post(who, command(type, payload, commandId));
}

/** An employee's repair request (default owner GM1). */
async function newRepair(): Promise<{ id: string; number: string }> {
  const reply = await act(EMPLOYEE, 'create_maintenance', { location_id: 'loc-fac16', symptom_key: 'internet_down', description: 'โต๊ะ 4 เน็ตหลุด' });
  expect(reply.status).toBe(200);
  const result = reply.body.result as { request_id: string; request_number: string };
  return { id: result.request_id, number: result.request_number };
}

async function newConfidentialTask(by: string): Promise<{ id: string }> {
  const reply = await act(by, 'create_gm_task', { summary_title: 'ต่อสัญญาเช่ารถส่งของ', category: 'documents_admin', sensitivity_subject: 'contract' });
  expect(reply.status).toBe(200);
  return { id: (reply.body.result as { request_id: string }).request_id };
}

const request = (id: string) => readDoc(harness.db, `requests/${id}`);
const revisionOf = async (id: string) => (await request(id))?.revision as number;
const history = async (id: string) => [...(await readCollection(harness.db, `requests/${id}/history`)).values()];
const outboxOf = async (id: string) => [...(await readCollection(harness.db, 'outbox')).values()].filter((entry) => entry.request_id === id);
const boardCount = async () => ((await readDoc(harness.db, 'board_counters/public'))?.internal_board_count as number | undefined) ?? 0;

/** queued → in_progress by GM1; returns the new revision. */
async function accepted(id: string, by = GM1): Promise<number> {
  const reply = await act(by, 'accept_request', { request_id: id, expected_revision: await revisionOf(id) });
  expect(reply.status).toBe(200);
  return (reply.body.result as { revision: number }).revision;
}

async function completed(id: string, by = GM1): Promise<void> {
  const reply = await act(by, 'complete_request', { request_id: id, expected_revision: await revisionOf(id), resolution_summary: RESULT_TEXT });
  expect(reply.status).toBe(200);
}

beforeAll(async () => {
  logs = captureLogs();
  harness = apiHarness(NOW);
  worker = emulatorClient();
  await clearFirestore();
  await clearAuth();
  const batch = harness.db.batch();
  for (const [personId, name] of Object.entries(NAMES)) batch.set(harness.db.doc(`people/${personId}`), { name, email: personId, active: true });
  batch.set(harness.db.doc('settings/routing'), { default_owner_by_type: { maintenance: GM1, document_request: GM2 }, gm_person_ids: [GM1, GM2] });
  for (const gm of [GM1, GM2]) batch.set(harness.db.doc(`gm_profiles/${gm}`), { presence_status: { kind: 'unspecified' } });
  batch.set(harness.db.doc('calendars/company'), { timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays: HOLIDAYS });
  await batch.commit();
  const roles: Record<string, string> = { [GM1]: 'gm_staff', [GM2]: 'gm_staff', [EMPLOYEE]: 'requester', [WATCHER]: 'requester', [OTHER]: 'requester' };
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
      newRequestId: () => `req-a03-${String(++ids).padStart(4, '0')}`,
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

describe('every S05 lifecycle command is saved through the API in one transaction', () => {
  it('accept: request, both summaries, history, user_state, requester notice — the acting GM is not told', async () => {
    setNow(NOW);
    const { id, number } = await newRepair();
    setNow(NOW + HOUR);
    const reply = await act(GM1, 'accept_request', { request_id: id, expected_revision: 1 });
    expect(reply).toMatchObject({ status: 200, body: { replayed: false, result: { request_id: id, request_number: number, revision: 2, status: 'in_progress' } } });
    // A06 (D-A03-5): creating the request is unread step 1, the accept step 2.
    expect(await request(id)).toMatchObject({ status: 'in_progress', revision: 2, assignee_id: GM1, last_updated_at: NOW + HOUR, activity_seq: 2, last_activity_at: NOW + HOUR });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ status: 'in_progress' });
    expect(await readDoc(harness.db, `gm_request_summaries/${id}`)).toMatchObject({ status: 'in_progress', last_updated_at: NOW + HOUR, stale: false });
    expect((await history(id)).filter((event) => event.kind === 'accepted')).toEqual([
      expect.objectContaining({ kind: 'accepted', at: NOW + HOUR, actor_id: GM1, revision: 2 }),
    ]);
    expect(await readDoc(harness.db, `user_state/${EMPLOYEE}/requests/${id}`)).toMatchObject({ type: 'requester', activity_seq: 2, last_activity_at: NOW + HOUR });
    const notices = (await outboxOf(id)).filter((entry) => entry.event_kind === 'request_accepted');
    expect(notices).toEqual([expect.objectContaining({ recipient_id: EMPLOYEE, audience: 'requester', request_number: number, state: 'pending' })]);
  });

  it('complete (with a requester): awaiting confirmation, due from the calendar snapshot, auto-close job, requester told with the due time', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    await accepted(id);
    const completedAt = NOW + 2 * HOUR;
    setNow(completedAt);
    const reply = await act(GM1, 'complete_request', { request_id: id, expected_revision: 2, resolution_summary: RESULT_TEXT });
    expect(reply).toMatchObject({ status: 200, body: { result: { revision: 3, status: 'completed' } } });
    const due = autoCloseDue(completedAt, CALENDAR);
    const stored = await request(id);
    expect(stored).toMatchObject({ status: 'completed', completion_cycle_id: 1, completed_at: completedAt, auto_close_due_at: due, last_updated_at: completedAt });
    expect(stored).not.toHaveProperty('closed_at');
    expect(stored?.confirmation_calendar_snapshot).toMatchObject({ holidays: HOLIDAYS });
    expect(await readDoc(harness.db, `gm_request_summaries/${id}`)).toMatchObject({ status: 'completed', awaiting_confirmation: true, auto_close_due_at: due });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ status: 'completed' });
    expect((await history(id)).find((event) => event.kind === 'completed')).toMatchObject({ completion_cycle_id: 1, resolution_summary: RESULT_TEXT, actor_id: GM1 });
    expect(await readDoc(harness.db, `scheduled_work/auto_close-${id}-c1`)).toMatchObject({
      kind: 'auto_close',
      state: 'scheduled',
      next_run_at: due,
      request_id: id,
      completion_cycle_id: 1,
    });
    expect((await outboxOf(id)).filter((entry) => entry.event_kind === 'request_completed')).toEqual([
      expect.objectContaining({ recipient_id: EMPLOYEE, audience: 'requester', auto_close_due_at: due }),
    ]);
  });

  it('confirm: closed by the requester (status stays completed, last_updated_at untouched); the requester is not told about their own act', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    await accepted(id);
    await completed(id);
    const before = await request(id);
    setNow(NOW + 5 * HOUR);
    const reply = await act(EMPLOYEE, 'confirm_completion', { request_id: id, expected_revision: 3, completion_cycle_id: 1 });
    expect(reply).toMatchObject({ status: 200, body: { result: { revision: 4, status: 'completed' } } });
    expect(await request(id)).toMatchObject({ closed_at: NOW + 5 * HOUR, closure_kind: 'requester_confirmed', last_updated_at: before?.last_updated_at, auto_close_due_at: before?.auto_close_due_at });
    expect(await readDoc(harness.db, `gm_request_summaries/${id}`)).toMatchObject({ awaiting_confirmation: false, closed_at: NOW + 5 * HOUR });
    expect((await history(id)).filter((event) => event.kind === 'closed')).toEqual([
      expect.objectContaining({ closure_kind: 'requester_confirmed', actor_id: EMPLOYEE, completion_cycle_id: 1 }),
    ]);
    expect((await outboxOf(id)).filter((entry) => entry.recipient_id === EMPLOYEE && entry.event_kind !== 'request_accepted' && entry.event_kind !== 'request_completed')).toEqual([]);
    // D-A03-2: confirming leaves the GM nothing to do, so the GM is not told either.
    expect((await outboxOf(id)).filter((entry) => entry.audience === 'gm' && entry.event_kind !== 'request_created')).toEqual([]);
  });

  it('not resolved: back to in_progress, the cycle’s due cleared, cycle kept, last_updated_at moves (D-S05-3)', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    await accepted(id);
    await completed(id);
    setNow(NOW + 6 * HOUR);
    const reply = await act(EMPLOYEE, 'report_not_resolved', { request_id: id, expected_revision: 3, completion_cycle_id: 1, reason: 'ยังหลุดอยู่ช่วงบ่าย' });
    expect(reply).toMatchObject({ status: 200, body: { result: { revision: 4, status: 'in_progress' } } });
    const stored = await request(id);
    expect(stored).toMatchObject({ status: 'in_progress', completion_cycle_id: 1, assignee_id: GM1, last_updated_at: NOW + 6 * HOUR });
    for (const field of ['completed_at', 'auto_close_due_at', 'confirmation_calendar_snapshot', 'closed_at']) expect(stored).not.toHaveProperty(field);
    expect((await history(id)).find((event) => event.kind === 'not_resolved')).toMatchObject({ reason: 'ยังหลุดอยู่ช่วงบ่าย', actor_id: EMPLOYEE, completion_cycle_id: 1 });
    // D-A03-2: the request is back on the assignee's plate, so they are told; the requester (actor) is not.
    expect((await outboxOf(id)).filter((entry) => entry.event_kind === 'request_not_resolved')).toEqual([
      expect.objectContaining({ recipient_id: GM1, audience: 'gm', state: 'pending' }),
    ]);
  });

  it('D-A03-4: a GM taking over a request assigned to another GM tells that GM', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    expect(await act(GM2, 'accept_request', { request_id: id, expected_revision: 1 })).toMatchObject({ status: 422, body: { error: 'TAKEOVER_CONFIRMATION_REQUIRED' } });
    expect(await act(GM2, 'accept_request', { request_id: id, expected_revision: 1, take_over: true })).toMatchObject({ status: 200 });
    expect((await history(id)).find((event) => event.kind === 'accepted')).toMatchObject({ actor_id: GM2, previous_assignee_id: GM1 });
    expect((await outboxOf(id)).filter((entry) => entry.audience === 'gm' && entry.event_kind !== 'request_created')).toEqual([
      expect.objectContaining({ recipient_id: GM1, event_kind: 'request_taken_over' }),
    ]);
  });

  it('cancel and reopen: reasons in history, requester told each time, cancelled_at cleared on reopen, assignee kept (D-S05-4)', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    setNow(NOW + HOUR);
    expect(await act(GM2, 'cancel_request', { request_id: id, expected_revision: 1, reason: 'แจ้งซ้ำกับงานเดิม' })).toMatchObject({
      status: 200,
      body: { result: { revision: 2, status: 'cancelled' } },
    });
    expect(await request(id)).toMatchObject({ status: 'cancelled', cancelled_at: NOW + HOUR, assignee_id: GM1 });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ status: 'cancelled' });
    setNow(NOW + 2 * HOUR);
    expect(await act(GM2, 'reopen_request', { request_id: id, expected_revision: 2, reason: 'ไม่ซ้ำ เป็นคนละโต๊ะ' })).toMatchObject({
      status: 200,
      body: { result: { revision: 3, status: 'queued' } },
    });
    const stored = await request(id);
    expect(stored).toMatchObject({ status: 'queued', assignee_id: GM1 });
    expect(stored).not.toHaveProperty('cancelled_at');
    expect((await history(id)).map((event) => [event.kind, event.reason]).filter(([kind]) => kind !== 'request_created')).toEqual(
      expect.arrayContaining([
        ['cancelled', 'แจ้งซ้ำกับงานเดิม'],
        ['reopened', 'ไม่ซ้ำ เป็นคนละโต๊ะ'],
      ]),
    );
    const kinds = (await outboxOf(id)).filter((entry) => entry.recipient_id === EMPLOYEE).map((entry) => entry.event_kind).sort();
    expect(kinds).toEqual(['request_cancelled', 'request_reopened']);
  });

  it('D-S09-4: a confidential GM task with no requester closes at once and leaves the internal counter; reopen counts it again', async () => {
    setNow(NOW);
    const start = await boardCount();
    const { id } = await newConfidentialTask(GM2);
    expect(await boardCount()).toBe(start + 1);
    await accepted(id, GM2);
    expect(await boardCount()).toBe(start + 1);
    setNow(NOW + HOUR);
    await completed(id, GM2);
    expect(await request(id)).toMatchObject({ status: 'completed', closed_at: NOW + HOUR, closure_kind: 'gm_closed' });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toBeUndefined();
    expect(await readDoc(harness.db, `scheduled_work/auto_close-${id}-c1`)).toBeUndefined();
    expect(await boardCount()).toBe(start);
    expect(await act(GM2, 'reopen_request', { request_id: id, expected_revision: await revisionOf(id), reason: 'ลืมแนบเอกสาร' })).toMatchObject({ status: 200 });
    expect(await boardCount()).toBe(start + 1);
    expect(await outboxOf(id)).toEqual([]);
  });

  it('D-S07-6: the pin is released when the request leaves in_progress (complete), other profile fields kept', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    await accepted(id);
    await harness.db.doc(`gm_profiles/${GM1}`).set({ presence_status: { kind: 'unspecified' }, focus_request_id: id });
    await completed(id);
    const profile = await readDoc(harness.db, `gm_profiles/${GM1}`);
    expect(profile).not.toHaveProperty('focus_request_id');
    expect(profile).toMatchObject({ presence_status: { kind: 'unspecified' } });
  });

  it('D-S07-6: also when cancelled from in_progress; a pin on another request is left alone', async () => {
    setNow(NOW);
    const first = await newRepair();
    const second = await newRepair();
    await accepted(first.id);
    await accepted(second.id);
    await harness.db.doc(`gm_profiles/${GM1}`).set({ presence_status: { kind: 'unspecified' }, focus_request_id: second.id });
    await act(GM1, 'cancel_request', { request_id: first.id, expected_revision: await revisionOf(first.id), reason: 'ไม่ต้องทำแล้ว' });
    expect(await readDoc(harness.db, `gm_profiles/${GM1}`)).toMatchObject({ focus_request_id: second.id });
    await act(GM1, 'cancel_request', { request_id: second.id, expected_revision: await revisionOf(second.id), reason: 'ไม่ต้องทำแล้ว' });
    expect(await readDoc(harness.db, `gm_profiles/${GM1}`)).not.toHaveProperty('focus_request_id');
  });
});

describe('optimistic revision: a stale revision is refused with a clear code, never written over', () => {
  it('a command on an old revision → 409 REVISION_CONFLICT with the latest status; nothing changes', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    await accepted(id);
    const before = await request(id);
    const historyBefore = (await history(id)).length;
    const outboxBefore = (await outboxOf(id)).length;
    const reply = await act(GM2, 'cancel_request', { request_id: id, expected_revision: 1, reason: 'เห็นข้อมูลเก่า' });
    expect(reply).toMatchObject({ status: 409, body: { error: 'REVISION_CONFLICT', current: { revision: 2, status: 'in_progress' } } });
    expect(await request(id)).toEqual(before);
    expect(await history(id)).toHaveLength(historyBefore);
    expect(await outboxOf(id)).toHaveLength(outboxBefore);
  });

  it('A03: a command prepared before the request was cancelled is refused (cancelled stale command deny)', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    const revision = await accepted(id);
    await act(GM2, 'cancel_request', { request_id: id, expected_revision: revision, reason: 'ผู้แจ้งขอยกเลิก' });
    const reply = await act(GM1, 'complete_request', { request_id: id, expected_revision: revision, resolution_summary: RESULT_TEXT });
    expect(reply).toMatchObject({ status: 409, body: { error: 'REVISION_CONFLICT', current: { status: 'cancelled' } } });
    expect(await request(id)).toMatchObject({ status: 'cancelled' });
  });

  it('no expected_revision → 400 (the contract requires it)', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    expect(await act(GM1, 'accept_request', { request_id: id })).toMatchObject({ status: 400, body: { path: 'payload.expected_revision' } });
  });
});

describe('races', () => {
  it('two GMs press “รับเรื่อง” together: one owner; the other is told it was already taken', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    const replies = await Promise.all([GM1, GM2].map((gm) => act(gm, 'accept_request', { request_id: id, expected_revision: 1, take_over: true })));
    const winner = replies.findIndex((reply) => reply.status === 200);
    expect(winner).toBeGreaterThanOrEqual(0);
    const loser = replies[1 - winner];
    const owner = [GM1, GM2][winner] ?? '';
    expect(loser).toMatchObject({ status: 409, body: { error: 'ALREADY_ACCEPTED', current: { status: 'in_progress', revision: 2, assignee_display: { person_id: owner, display_name: NAMES[owner] } } } });
    expect(await request(id)).toMatchObject({ assignee_id: owner, revision: 2 });
    expect((await history(id)).filter((event) => event.kind === 'accepted')).toHaveLength(1);
  });

  it('the requester confirms while the tick auto-closes: closed once, one closing event', async () => {
    setNow(NOW);
    const cases = [await newRepair(), await newRepair(), await newRepair()];
    for (const { id } of cases) {
      await accepted(id);
      await completed(id);
    }
    const due = (await request(cases[0]?.id ?? ''))?.auto_close_due_at as number;
    setNow(due + 60_000);
    const [tick, ...confirms] = await Promise.all([
      runTick(workerDeps()),
      ...cases.map(({ id }) => act(EMPLOYEE, 'confirm_completion', { request_id: id, expected_revision: 3, completion_cycle_id: 1 })),
    ]);
    expect(tick).toMatchObject({ ran: true });
    for (const [index, { id }] of cases.entries()) {
      const stored = await request(id);
      const closes = (await history(id)).filter((event) => event.kind === 'closed');
      expect(closes).toHaveLength(1);
      expect(stored).toMatchObject({ status: 'completed', closed_at: due + 60_000 });
      const reply = confirms[index];
      if (reply?.status === 200) {
        expect(stored?.closure_kind).toBe('requester_confirmed');
      } else {
        expect(reply).toMatchObject({ status: 409 });
        expect(stored?.closure_kind).toBe('auto_closed');
      }
      expect(await readDoc(harness.db, `scheduled_work/auto_close-${id}-c1`)).toMatchObject({ state: expect.stringMatching(/^(done|superseded)$/) });
    }
  });

  it('“not resolved” while the tick auto-closes: one consistent outcome, never both', async () => {
    setNow(NOW);
    const cases = [await newRepair(), await newRepair(), await newRepair()];
    for (const { id } of cases) {
      await accepted(id);
      await completed(id);
    }
    const due = (await request(cases[0]?.id ?? ''))?.auto_close_due_at as number;
    setNow(due);
    const [tick, ...answers] = await Promise.all([
      runTick(workerDeps()),
      ...cases.map(({ id }) => act(EMPLOYEE, 'report_not_resolved', { request_id: id, expected_revision: 3, completion_cycle_id: 1, reason: 'ยังไม่หาย' })),
    ]);
    expect(tick).toMatchObject({ ran: true });
    for (const [index, { id }] of cases.entries()) {
      const stored = await request(id);
      const kinds = (await history(id)).map((event) => event.kind);
      if (answers[index]?.status === 200) {
        expect(stored).toMatchObject({ status: 'in_progress' });
        expect(stored).not.toHaveProperty('closed_at');
        expect(kinds).not.toContain('closed');
        expect(kinds.filter((kind) => kind === 'not_resolved')).toHaveLength(1);
      } else {
        expect(answers[index]).toMatchObject({ status: 409 });
        expect(stored).toMatchObject({ status: 'completed', closure_kind: 'auto_closed' });
        expect(kinds).not.toContain('not_resolved');
        expect(kinds.filter((kind) => kind === 'closed')).toHaveLength(1);
      }
    }
  });

  it('both orders, forced: the answer first → the job is superseded; the tick first → the answer gets 409 with the latest state', async () => {
    setNow(NOW);
    const [confirmFirst, tickFirst, notResolvedFirst] = [await newRepair(), await newRepair(), await newRepair()];
    for (const { id } of [confirmFirst, tickFirst, notResolvedFirst]) {
      await accepted(id);
      await completed(id);
    }
    const due = (await request(confirmFirst.id))?.auto_close_due_at as number;
    setNow(due);
    expect(await act(EMPLOYEE, 'confirm_completion', { request_id: confirmFirst.id, expected_revision: 3, completion_cycle_id: 1 })).toMatchObject({ status: 200 });
    expect(await act(EMPLOYEE, 'report_not_resolved', { request_id: notResolvedFirst.id, expected_revision: 3, completion_cycle_id: 1, reason: 'ยังไม่หาย' })).toMatchObject({ status: 200 });
    await expect(runTick(workerDeps())).resolves.toMatchObject({ ran: true });
    expect(await request(confirmFirst.id)).toMatchObject({ closure_kind: 'requester_confirmed', revision: 4 });
    expect(await readDoc(harness.db, `scheduled_work/auto_close-${confirmFirst.id}-c1`)).toMatchObject({ state: 'superseded' });
    expect(await request(notResolvedFirst.id)).toMatchObject({ status: 'in_progress', revision: 4 });
    expect(await readDoc(harness.db, `scheduled_work/auto_close-${notResolvedFirst.id}-c1`)).toMatchObject({ state: 'superseded' });
    expect(await request(tickFirst.id)).toMatchObject({ closure_kind: 'auto_closed', revision: 4 });
    expect(await readDoc(harness.db, `scheduled_work/auto_close-${tickFirst.id}-c1`)).toMatchObject({ state: 'done' });
    expect(await act(EMPLOYEE, 'confirm_completion', { request_id: tickFirst.id, expected_revision: 3, completion_cycle_id: 1 })).toMatchObject({
      status: 409,
      body: { error: 'REVISION_CONFLICT', current: { revision: 4, status: 'completed', closed: true } },
    });
    for (const { id } of [confirmFirst, tickFirst]) expect((await history(id)).filter((event) => event.kind === 'closed')).toHaveLength(1);
  });

  it('auto-close on its own: not before the due time; at the due time once (system, last_updated_at untouched); a second tick changes nothing', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    await accepted(id);
    await completed(id);
    const stored = await request(id);
    const due = stored?.auto_close_due_at as number;
    setNow(due - 60_000);
    await expect(runTick(workerDeps())).resolves.toMatchObject({ ran: true });
    expect(await request(id)).not.toHaveProperty('closed_at');
    setNow(due);
    await expect(runTick(workerDeps())).resolves.toMatchObject({ ran: true });
    expect(await request(id)).toMatchObject({ closed_at: due, closure_kind: 'auto_closed', last_updated_at: stored?.last_updated_at, revision: 4 });
    expect((await history(id)).filter((event) => event.kind === 'closed')).toEqual([expect.objectContaining({ actor_id: 'system', closure_kind: 'auto_closed' })]);
    setNow(due + 20 * 60_000);
    await runTick(workerDeps());
    expect(await request(id)).toMatchObject({ revision: 4 });
    expect((await history(id)).filter((event) => event.kind === 'closed')).toHaveLength(1);
  });
});

describe('notices for status changes', () => {
  it('a watcher is told when the status changes (U1); the requester too; never the GM who acted', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    expect(await act(WATCHER, 'watch_request', { request_id: id })).toMatchObject({ status: 200 });
    await accepted(id);
    const accepted_ = (await outboxOf(id)).filter((entry) => entry.event_kind === 'request_accepted');
    expect(accepted_.map((entry) => [entry.recipient_id, entry.audience]).sort()).toEqual(
      [
        [EMPLOYEE, 'requester'],
        [WATCHER, 'watcher'],
      ].sort(),
    );
    await completed(id);
    const done = (await outboxOf(id)).filter((entry) => entry.event_kind === 'request_completed');
    expect(done.map((entry) => entry.recipient_id).sort()).toEqual([EMPLOYEE, WATCHER].sort());
    // The requester answers: the watcher is told the status changed, the requester (actor) is not.
    await act(EMPLOYEE, 'report_not_resolved', { request_id: id, expected_revision: await revisionOf(id), completion_cycle_id: 1, reason: 'ยังไม่หาย' });
    // The watcher hears the status changed; the assignee is told too (D-A03-2); the requester acted.
    expect((await outboxOf(id)).filter((entry) => entry.event_kind === 'request_not_resolved').map((entry) => entry.recipient_id).sort()).toEqual([GM1, WATCHER].sort());
    // GM1 accepted and completed: none of those notices went to GM1.
    for (const entry of (await outboxOf(id)).filter((notice) => notice.event_kind === 'request_accepted' || notice.event_kind === 'request_completed')) {
      expect(entry.recipient_id).not.toBe(GM1);
    }
  });
});

describe('the same command_id again changes nothing and tells nobody again', () => {
  it('a retried accept and a retried complete return the first result', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    const acceptId = randomUUID();
    const first = await act(GM1, 'accept_request', { request_id: id, expected_revision: 1 }, acceptId);
    const completeId = randomUUID();
    await act(GM1, 'complete_request', { request_id: id, expected_revision: 2, resolution_summary: RESULT_TEXT }, completeId);
    const snapshot = { request: await request(id), history: (await history(id)).length, outbox: (await outboxOf(id)).length };
    const again = await act(GM1, 'accept_request', { request_id: id, expected_revision: 1 }, acceptId);
    expect(again).toMatchObject({ status: 200, body: { replayed: true, result: (first.body as { result: unknown }).result } });
    const completeAgain = await act(GM1, 'complete_request', { request_id: id, expected_revision: 2, resolution_summary: RESULT_TEXT }, completeId);
    expect(completeAgain).toMatchObject({ status: 200, body: { replayed: true, result: { revision: 3, status: 'completed' } } });
    expect(await request(id)).toEqual(snapshot.request);
    expect(await history(id)).toHaveLength(snapshot.history);
    expect(await outboxOf(id)).toHaveLength(snapshot.outbox);
  });

  it('the same command_id with a different body is a conflict', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    const commandId = randomUUID();
    await act(GM1, 'cancel_request', { request_id: id, expected_revision: 1, reason: 'ก' }, commandId);
    expect(await act(GM1, 'cancel_request', { request_id: id, expected_revision: 1, reason: 'ข' }, commandId)).toMatchObject({ status: 409, body: { error: 'COMMAND_ID_CONFLICT' } });
  });
});

describe('who may act', () => {
  it('an employee cannot accept; a GM cannot confirm for the requester; a non-reader gets 404, not a hint', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    expect(await act(EMPLOYEE, 'accept_request', { request_id: id, expected_revision: 1 })).toMatchObject({ status: 403, body: { error: 'GM_ONLY' } });
    await accepted(id);
    await completed(id);
    expect(await act(GM1, 'confirm_completion', { request_id: id, expected_revision: 3, completion_cycle_id: 1 })).toMatchObject({ status: 403, body: { error: 'REQUESTER_ONLY' } });
    // OTHER cannot read the request: the same answer as for a request that does not exist.
    expect(await act(OTHER, 'confirm_completion', { request_id: id, expected_revision: 3, completion_cycle_id: 1 })).toMatchObject({ status: 404, body: { error: 'REQUEST_NOT_FOUND' } });
    expect(await act(OTHER, 'confirm_completion', { request_id: 'req-a03-none', expected_revision: 3, completion_cycle_id: 1 })).toMatchObject({ status: 404, body: { error: 'REQUEST_NOT_FOUND' } });
    // A watcher has summary access only (U1): no confirm.
    expect(await act(WATCHER, 'confirm_completion', { request_id: id, expected_revision: 3, completion_cycle_id: 1 })).toMatchObject({ status: 404 });
    expect(await request(id)).not.toHaveProperty('closed_at');
  });

  it('a domain refusal keeps its own code (empty reason, wrong cycle)', async () => {
    setNow(NOW);
    const { id } = await newRepair();
    expect(await act(GM1, 'cancel_request', { request_id: id, expected_revision: 1, reason: '   ' })).toMatchObject({ status: 422, body: { error: 'REASON_REQUIRED' } });
    await accepted(id);
    await completed(id);
    expect(await act(EMPLOYEE, 'confirm_completion', { request_id: id, expected_revision: 3, completion_cycle_id: 2 })).toMatchObject({ status: 422, body: { error: 'STALE_COMPLETION_CYCLE' } });
  });
});

describe('logs and network (runs last)', () => {
  it('nothing left the machine', () => {
    expect(blockedHosts).toEqual([]);
  });

  it('logs hold no e-mail, name, reason or result text', () => {
    const text = logs.lines.join('\n');
    for (const secret of [...Object.keys(NAMES), ...Object.values(NAMES), RESULT_TEXT, 'ยังหลุดอยู่ช่วงบ่าย', 'แจ้งซ้ำกับงานเดิม', 'Bearer ']) {
      expect(text).not.toContain(secret);
    }
  });
});
