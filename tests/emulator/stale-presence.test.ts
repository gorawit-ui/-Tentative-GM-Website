// A05 — stale and the presence reset run from the one tick (Part 6 §6.9, S03, S07, C7, U4,
// D-S05-3) on the emulators. Stale is scheduled ahead: every write of an open request stores the
// first instant past 3 business days as a `scheduled_work` job, so the tick only reads due jobs —
// never every open request. It uses the company calendar as it is now (FU-27 decision, A05): a
// special holiday announced after a request was created is counted, so a calendar change makes
// the tick recompute open requests once. Presence resets at Bangkok midnight; leave with an end
// date stays until the end of that day; a late tick keeps what a GM set for the new day.
// Emulator only (demo-* project); people, places and IDs are synthetic.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommandRejected, type MaintenanceCatalog } from '../../apps/api/src/commands/index';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { localAdapter } from '../../apps/worker/src/adapters';
import type { WorkerDeps } from '../../apps/worker/src/deps';
import { adminWorkerStore } from '../../apps/worker/src/firestore-store';
import { workerJobHandlers } from '../../apps/worker/src/jobs/index';
import { consoleWorkerLogger } from '../../apps/worker/src/log';
import { runJob } from '../../apps/worker/src/scheduled-work';
import type { WorkerStore } from '../../apps/worker/src/store';
import { runTick } from '../../apps/worker/src/tick';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type ApiHarness, type LogCapture } from './support/api-harness';
import { TEST_MAX_ATTEMPTS, clearFirestore, emulatorClient, readDoc, type EmulatorClient } from './support/firestore-client-store';

const at = (iso: string) => Date.parse(iso);
const bkk = (local: string) => at(`${local}+07:00`);
const HOLIDAYS = ['2026-12-31', '2027-01-01'];

// Synthetic people (D-S08-4 person IDs). Names must never reach a log.
const GM1 = 'a05.gm.one@tdfb.co';
const GM2 = 'a05.gm.two@tdfb.co';
const EMPLOYEE = 'a05.employee@tdfb.co';
const PARTY = 'a05.party@tdfb.co';
const NAMES: Readonly<Record<string, string>> = {
  [GM1]: 'คุณจีเอ็ม หนึ่ง เอ็ม',
  [GM2]: 'คุณจีเอ็ม สอง เอ็น',
  [EMPLOYEE]: 'คุณผู้แจ้ง โอ',
  [PARTY]: 'คุณผู้ถูกรอ พี',
};
const ROLES: Readonly<Record<string, string>> = { [GM1]: 'gm_staff', [GM2]: 'gm_staff', [EMPLOYEE]: 'requester', [PARTY]: 'requester' };

const CATALOG: MaintenanceCatalog = {
  async resolve(_tx, selection) {
    if (selection.location_id !== 'loc-wh300' || selection.symptom_key !== 'light_off') throw new CommandRejected('CATALOG_UNKNOWN', 'unknown');
    return { location: { id: 'loc-wh300', label: 'WH300' }, symptom: { key: 'light_off', label: 'ไฟดับ' } };
  },
};

let harness: ApiHarness;
let workerA: EmulatorClient;
let workerB: EmulatorClient;
let logs: LogCapture;
let server: Server;
let baseUrl = '';
let now = bkk('2027-01-11T09:00:00');
let ids = 0;
const tokens = new Map<string, string>();
const directories = { peopleDirectory: transactionPeopleDirectory(), routingDirectory: transactionRoutingDirectory() };

function setNow(instant: number): void {
  now = instant;
  harness.setNow(instant);
}

function deps(worker: EmulatorClient, store?: WorkerStore): WorkerDeps {
  return {
    store: store ?? adminWorkerStore(worker.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
    adapter: localAdapter(consoleWorkerLogger),
    now: () => now,
    newLeaseId: () => randomUUID(),
    log: consoleWorkerLogger,
    jobHandlers: workerJobHandlers(directories),
  };
}

const tick = (worker: EmulatorClient = workerA) => runTick(deps(worker));

async function act(who: string, type: string, payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/api/commands`, {
    method: 'POST',
    headers: { authorization: `Bearer ${tokens.get(who) ?? ''}`, 'content-type': 'application/json' },
    body: JSON.stringify({ command_id: randomUUID(), type, payload }),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

async function get(who: string, path: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}${path}`, { headers: { authorization: `Bearer ${tokens.get(who) ?? ''}` } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const request = (id: string) => readDoc(harness.db, `requests/${id}`);
const revisionOf = async (id: string) => (await request(id))?.revision as number;
const gmSummary = (id: string) => readDoc(harness.db, `gm_request_summaries/${id}`);
const publicSummary = (id: string) => readDoc(harness.db, `request_summaries/${id}`);
const staleJob = (id: string) => readDoc(harness.db, `scheduled_work/stale-${id}`);
const profile = (gm: string) => readDoc(harness.db, `gm_profiles/${gm}`);
const updateTime = async (path: string) => (await harness.db.doc(path).get()).updateTime?.toMillis();

async function newRepair(): Promise<string> {
  const reply = await act(EMPLOYEE, 'create_maintenance', { location_id: 'loc-wh300', symptom_key: 'light_off', description: 'ไฟทางเดินดับ' });
  expect(reply.status).toBe(200);
  return (reply.body.result as { request_id: string }).request_id;
}

/** The Admin edits the company calendar (A11 screen later; here the stored document directly). */
async function setHolidays(holidays: readonly string[]): Promise<void> {
  await harness.db.doc('calendars/company').set({ timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays });
}

async function seed(): Promise<void> {
  await clearFirestore();
  const batch = harness.db.batch();
  for (const [personId, name] of Object.entries(NAMES)) batch.set(harness.db.doc(`people/${personId}`), { name, email: personId, active: true });
  batch.set(harness.db.doc('settings/routing'), { default_owner_by_type: { maintenance: GM1 }, gm_person_ids: [GM1, GM2] });
  for (const gm of [GM1, GM2]) batch.set(harness.db.doc(`gm_profiles/${gm}`), { presence_status: { kind: 'unspecified' } });
  await batch.commit();
  await setHolidays(HOLIDAYS);
  for (const [personId, role] of Object.entries(ROLES)) {
    const signedIn = await harness.signIn(personId);
    tokens.set(personId, signedIn.idToken);
    await harness.db.doc(`access/${signedIn.uid}`).set({ person_id: personId, role, enabled: true });
  }
}

beforeAll(async () => {
  logs = captureLogs();
  harness = apiHarness(now);
  workerA = emulatorClient();
  workerB = emulatorClient();
  await clearAuth();
  server = createServer(
    createApiHandler({
      api: harness.deps,
      commandStore: adminCommandStore(harness.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
      environment: 'dev',
      allowedOrigins: ['https://gm-dev.tdfb.co'],
      newRequestId: () => `req-a05-${String(++ids).padStart(4, '0')}`,
      maintenanceCatalog: CATALOG,
      peopleDirectory: directories.peopleDirectory,
      routingDirectory: directories.routingDirectory,
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
  await workerA?.close();
  await workerB?.close();
});

beforeEach(async () => {
  setNow(bkk('2027-01-11T09:00:00'));
  await seed();
});

describe('stale is scheduled ahead and flipped by the tick when due (Part 6 §6.9, S03)', () => {
  it('a new request stores its stale job at the first instant past 3 business days; exactly 3 days is not stale yet', async () => {
    const id = await newRepair();
    const threshold = bkk('2027-01-14T09:00:00'); // Mon 09:00 + 3 business days
    expect(await staleJob(id)).toMatchObject({ kind: 'stale', state: 'scheduled', request_id: id, expected_revision: 1, next_run_at: threshold + 1 });
    expect(await gmSummary(id)).toMatchObject({ stale: false, stale_threshold_at: threshold });
    setNow(threshold);
    await tick();
    expect(await gmSummary(id)).toMatchObject({ stale: false });
    setNow(threshold + 15 * 60_000);
    await expect(tick()).resolves.toMatchObject({ ran: true });
    expect(await gmSummary(id)).toMatchObject({ stale: true, stale_threshold_at: threshold });
    // §6.9: the scheduler never moves the GM progress clock, the revision or the unread step.
    expect(await request(id)).toMatchObject({ revision: 1, last_updated_at: bkk('2027-01-11T09:00:00'), activity_seq: 1 });
    expect(await staleJob(id)).toMatchObject({ state: 'done' });
  });

  it('D-S05-3: GM progress restarts the clock; the waited party’s answer does not; waiting requests still go stale', async () => {
    const id = await newRepair();
    setNow(bkk('2027-01-12T10:00:00'));
    expect(await act(GM1, 'accept_request', { request_id: id, expected_revision: 1 })).toMatchObject({ status: 200 });
    expect(await staleJob(id)).toMatchObject({ state: 'scheduled', expected_revision: 2, next_run_at: bkk('2027-01-15T10:00:00') + 1 });
    setNow(bkk('2027-01-12T11:00:00'));
    expect(await act(GM1, 'enter_waiting', { request_id: id, expected_revision: 2, waiting_on: { kind: 'person', person_id: PARTY } })).toMatchObject({ status: 200 });
    setNow(bkk('2027-01-13T15:00:00'));
    expect(await act(PARTY, 'respond_waiting_party', { request_id: id, waiting_interval_id: 1 })).toMatchObject({ status: 200 });
    // The answer moved the revision, not the clock: due stays 3 BD after the GM's last action.
    expect(await staleJob(id)).toMatchObject({ state: 'scheduled', expected_revision: 4, next_run_at: bkk('2027-01-15T11:00:00') + 1 });
    setNow(bkk('2027-01-15T10:30:00'));
    await tick();
    expect(await gmSummary(id)).toMatchObject({ status: 'waiting', stale: false });
    setNow(bkk('2027-01-15T11:15:00'));
    await tick();
    expect(await gmSummary(id)).toMatchObject({ status: 'waiting', stale: true });
    // A follow-up is GM progress: no longer stale, the next check is 3 BD later.
    setNow(bkk('2027-01-15T13:00:00'));
    expect(await act(GM1, 'follow_up', { request_id: id, expected_revision: await revisionOf(id) })).toMatchObject({ status: 200 });
    expect(await gmSummary(id)).toMatchObject({ stale: false, stale_threshold_at: bkk('2027-01-20T13:00:00') });
    expect(await staleJob(id)).toMatchObject({ state: 'scheduled', next_run_at: bkk('2027-01-20T13:00:00') + 1 });
  });

  it('cancelled, completed and closed requests are never stale; their job is superseded', async () => {
    const cancelled = await newRepair();
    expect(await act(GM1, 'cancel_request', { request_id: cancelled, expected_revision: 1, reason: 'ซ้ำ' })).toMatchObject({ status: 200 });
    expect(await staleJob(cancelled)).toMatchObject({ state: 'superseded' });
    const completed = await newRepair();
    await act(GM1, 'accept_request', { request_id: completed, expected_revision: 1 });
    await act(GM1, 'complete_request', { request_id: completed, expected_revision: 2, resolution_summary: 'เปลี่ยนหลอดแล้ว' });
    expect(await staleJob(completed)).toMatchObject({ state: 'superseded' });
    setNow(bkk('2027-01-20T09:00:00'));
    await tick();
    for (const id of [cancelled, completed]) expect(await gmSummary(id)).toMatchObject({ stale: false });
  });

  it('U4: the stale flag lives only in GM data; the public summary keeps the neutral last update', async () => {
    const id = await newRepair();
    setNow(bkk('2027-01-14T09:15:00'));
    await tick();
    expect(await gmSummary(id)).toMatchObject({ stale: true });
    const summary = await publicSummary(id);
    expect(summary).toMatchObject({ last_updated_at: bkk('2027-01-11T09:00:00') });
    expect(summary).not.toHaveProperty('stale');
    expect(summary).not.toHaveProperty('stale_threshold_at');
    const detail = await get(EMPLOYEE, `/api/requests/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body).not.toHaveProperty('stale');
    expect(detail.body).not.toHaveProperty('stale_threshold_at');
  });
});

describe('the company calendar as it is now (FU-27 decision): a holiday added later is counted', () => {
  it('a special holiday announced after the request was created: it does not become stale because of that day', async () => {
    const id = await newRepair(); // Mon 11 Jan 09:00, due Thu 14 Jan 09:00 + 1 ms
    setNow(bkk('2027-01-11T12:00:00'));
    await setHolidays([...HOLIDAYS, '2027-01-13']); // Wed 13 Jan announced as a special holiday
    await tick();
    expect(await gmSummary(id)).toMatchObject({ stale: false, stale_threshold_at: bkk('2027-01-15T09:00:00') });
    expect(await staleJob(id)).toMatchObject({ state: 'scheduled', next_run_at: bkk('2027-01-15T09:00:00') + 1 });
    setNow(bkk('2027-01-14T09:15:00'));
    await tick();
    expect(await gmSummary(id)).toMatchObject({ stale: false });
    setNow(bkk('2027-01-15T09:15:00'));
    await tick();
    expect(await gmSummary(id)).toMatchObject({ stale: true });
  });

  it('a holiday added for days already past takes the flag off a request no longer over 3 business days', async () => {
    const id = await newRepair();
    setNow(bkk('2027-01-14T09:15:00'));
    await tick();
    expect(await gmSummary(id)).toMatchObject({ stale: true });
    setNow(bkk('2027-01-14T09:20:00'));
    await setHolidays([...HOLIDAYS, '2027-01-12']);
    setNow(bkk('2027-01-14T09:30:00'));
    await tick();
    expect(await gmSummary(id)).toMatchObject({ stale: false, stale_threshold_at: bkk('2027-01-15T09:00:00') });
    setNow(bkk('2027-01-15T09:15:00'));
    await tick();
    expect(await gmSummary(id)).toMatchObject({ stale: true });
  });

  it('a calendar change that does not move a request writes nothing for it (§6.9: no write when the value is the same)', async () => {
    const id = await newRepair();
    setNow(bkk('2027-01-11T10:00:00'));
    await tick();
    const before = { summary: await updateTime(`gm_request_summaries/${id}`), job: await updateTime(`scheduled_work/stale-${id}`) };
    await setHolidays([...HOLIDAYS, '2027-06-01']);
    setNow(bkk('2027-01-11T10:15:00'));
    await tick();
    expect(await updateTime(`gm_request_summaries/${id}`)).toBe(before.summary);
    expect(await updateTime(`scheduled_work/stale-${id}`)).toBe(before.job);
  });
});

describe('budget: the tick reads due work, never every open request (Part 6 §6.9)', () => {
  it('with open requests and nothing due, a tick reads no request or summary and queries only due collections', async () => {
    for (let n = 0; n < 5; n += 1) await newRepair();
    setNow(bkk('2027-01-11T09:30:00'));
    await tick(); // sends the creation notices, starts the daily jobs
    const reads: string[] = [];
    const queries: string[] = [];
    const base = adminWorkerStore(workerA.db, { maxAttempts: TEST_MAX_ATTEMPTS });
    const store: WorkerStore = {
      ...base,
      runTransaction: (work) =>
        base.runTransaction((transaction) =>
          work({
            get: (path) => {
              reads.push(path);
              return transaction.get(path);
            },
            set: (path, data) => transaction.set(path, data),
            delete: (path) => transaction.delete(path),
          }),
        ),
      due: (collection, state, instant, limit, after) => {
        queries.push(`${collection}:${state}`);
        return base.due(collection, state, instant, limit, after);
      },
      openRequests: (after, limit) => {
        queries.push('open_requests');
        return base.openRequests(after, limit);
      },
    };
    setNow(bkk('2027-01-11T09:45:00'));
    await expect(runTick(deps(workerA, store))).resolves.toMatchObject({ ran: true });
    expect(reads.filter((path) => path.startsWith('requests/') || path.startsWith('gm_request_summaries/'))).toEqual([]);
    expect(new Set(queries)).toEqual(new Set(['outbox:processing', 'outbox:pending', 'scheduled_work:scheduled']));
    expect(reads.length).toBeLessThanOrEqual(4);
  });
});

describe('presence resets at Bangkok midnight (C7, S07, Part 6 §6.9)', () => {
  it('yesterday’s presence becomes “ไม่ระบุ” at the first tick after midnight; the pinned request is kept', async () => {
    await harness.db.doc(`gm_profiles/${GM1}`).set({
      presence_status: { kind: 'at_location', location_id: 'loc-wh300' },
      presence_updated_at: new Date(bkk('2027-01-11T10:00:00')),
      focus_request_id: 'req-a05-pinned',
    });
    setNow(bkk('2027-01-11T23:50:00'));
    await tick();
    expect(await profile(GM1)).toMatchObject({ presence_status: { kind: 'at_location', location_id: 'loc-wh300' } });
    setNow(bkk('2027-01-12T00:05:00'));
    await tick();
    const reset = await profile(GM1);
    expect(reset).toEqual({ presence_status: { kind: 'unspecified' }, focus_request_id: 'req-a05-pinned' });
  });

  it('leave with an end date stays until the end of that day; leave without one resets at midnight', async () => {
    await harness.db.doc(`gm_profiles/${GM1}`).set({ presence_status: { kind: 'on_leave' }, presence_updated_at: new Date(bkk('2027-01-11T08:00:00')), leave_ends_on: '2027-01-13' });
    await harness.db.doc(`gm_profiles/${GM2}`).set({ presence_status: { kind: 'on_leave' }, presence_updated_at: new Date(bkk('2027-01-11T08:00:00')) });
    setNow(bkk('2027-01-11T09:00:00'));
    await tick();
    for (const [day, gm1Kind, gm2Kind] of [
      ['2027-01-12', 'on_leave', 'unspecified'],
      ['2027-01-13', 'on_leave', 'unspecified'],
      ['2027-01-14', 'unspecified', 'unspecified'],
    ] as const) {
      setNow(bkk(`${day}T00:05:00`));
      await tick();
      expect((await profile(GM1))?.presence_status, `${day} GM1`).toEqual({ kind: gm1Kind });
      expect((await profile(GM2))?.presence_status, `${day} GM2`).toEqual({ kind: gm2Kind });
    }
    expect(await profile(GM1)).not.toHaveProperty('leave_ends_on');
  });

  it('a late tick does not clear what a GM set for the new day', async () => {
    await harness.db.doc(`gm_profiles/${GM1}`).set({ presence_status: { kind: 'off_site' }, presence_updated_at: new Date(bkk('2027-01-11T10:00:00')) });
    setNow(bkk('2027-01-11T10:30:00'));
    await tick();
    // No tick overnight; the GM sets the new day's presence before the first tick of the day.
    await harness.db.doc(`gm_profiles/${GM1}`).set({ presence_status: { kind: 'at_location', location_id: 'loc-wh300' }, presence_updated_at: new Date(bkk('2027-01-12T07:30:00')) });
    setNow(bkk('2027-01-12T08:00:00'));
    await tick();
    expect(await profile(GM1)).toMatchObject({ presence_status: { kind: 'at_location', location_id: 'loc-wh300' }, presence_updated_at: bkk('2027-01-12T07:30:00') });
  });
});

describe('overlapping ticks and workers do the work once (A02 lease)', () => {
  it('two ticks at the same moment: one works, the other is a no-op; the stale flag and the reset happen once', async () => {
    const id = await newRepair();
    await harness.db.doc(`gm_profiles/${GM1}`).set({ presence_status: { kind: 'off_site' }, presence_updated_at: new Date(bkk('2027-01-11T10:00:00')) });
    setNow(bkk('2027-01-11T10:30:00'));
    await tick();
    setNow(bkk('2027-01-14T09:15:00'));
    // Hold the working tick inside its jobs until the other tick has answered, so both really overlap.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const handlers = workerJobHandlers(directories);
    const held: WorkerDeps['jobHandlers'] = Object.fromEntries(
      Object.entries(handlers).map(([kind, handler]) => [
        kind,
        async (context: Parameters<NonNullable<typeof handler>>[0]) => {
          await Promise.race([gate, new Promise((resolve) => setTimeout(resolve, 3_000))]);
          return handler(context);
        },
      ]),
    );
    const overlapping = (worker: EmulatorClient) =>
      runTick({ ...deps(worker), jobHandlers: held }).then((report) => {
        if (!report.ran) release();
        return report;
      });
    const reports = await Promise.all([overlapping(workerA), overlapping(workerB)]);
    expect(reports.map((report) => report.ran).sort()).toEqual([false, true]);
    expect(await gmSummary(id)).toMatchObject({ stale: true });
    expect(await profile(GM1)).toMatchObject({ presence_status: { kind: 'unspecified' } });
  });

  it('the same stale job picked up by two workers at once runs once', async () => {
    const id = await newRepair();
    setNow(bkk('2027-01-14T09:15:00'));
    const results = await Promise.all([runJob(deps(workerA), `stale-${id}`), runJob(deps(workerB), `stale-${id}`)]);
    expect(results.sort()).toEqual(['done', 'skipped']);
    expect(await gmSummary(id)).toMatchObject({ stale: true });
  });
});

describe('logs and network (runs last)', () => {
  it('nothing left the machine', () => {
    expect(blockedHosts).toEqual([]);
  });

  it('logs hold no e-mail or name', () => {
    const text = logs.lines.join('\n');
    for (const secret of [...Object.keys(NAMES), ...Object.values(NAMES), 'Bearer ']) expect(text).not.toContain(secret);
  });
});
