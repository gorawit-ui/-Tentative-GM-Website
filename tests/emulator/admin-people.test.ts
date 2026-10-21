// A10 — people and roles on the emulators (Part 3 §13.3, Part 6 §6.4–6.5, D-S08-4, D-A09-1, FU-10,
// FU-11, FU-38): the GM Admin imports the people CSV (rows already mapped and checked in the browser —
// the file itself never reaches the API), previews before saving, sets roles and switches accounts off;
// `access/{uid}` is written by the API from `people` only, at the first login (verified email, never a
// name) and at once on every role / account change, so the very next API call and Rules read see it.
// Emulators only.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CommandRejected, refreshRequestNames, type MaintenanceCatalog } from '../../apps/api/src/commands/index';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { transactionCompanyCalendar, transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { localAdapter } from '../../apps/worker/src/adapters';
import type { WorkerDeps } from '../../apps/worker/src/deps';
import { adminWorkerStore } from '../../apps/worker/src/firestore-store';
import { workerJobHandlers } from '../../apps/worker/src/jobs/index';
import { consoleWorkerLogger } from '../../apps/worker/src/log';
import { runJob } from '../../apps/worker/src/scheduled-work';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type ApiHarness, type LogCapture } from './support/api-harness';
import { TEST_MAX_ATTEMPTS, clearFirestore, emulatorClient, readCollection, readDoc, type EmulatorClient } from './support/firestore-client-store';

const NOW = Date.parse('2027-01-11T09:00:00+07:00');
const APP_ORIGIN = 'https://gm-dev.tdfb.co';
const ADMIN = 'a10.admin@tdfb.co';
const ADMIN2 = 'a10.admin.two@tdfb.co';
const GM = 'a10.gm@tdfb.co';
const EMPLOYEE = 'a10.employee@tdfb.co';
const NEWCOMER = 'a10.newcomer@tdfb.co';
const STRANGER = 'a10.stranger@tdfb.co';
const SECRET_COLUMN = 'ข้อมูลคอลัมน์อื่น-ห้ามเก็บ-0812345678';

let harness: ApiHarness;
let worker: EmulatorClient;
let logs: LogCapture;
let server: Server;
let baseUrl = '';
let rules: RulesTestEnvironment;
let ids = 0;
const tokens = new Map<string, string>();
const uids = new Map<string, string>();
const directories = { peopleDirectory: transactionPeopleDirectory(), routingDirectory: transactionRoutingDirectory() };

const CATALOG: MaintenanceCatalog = { resolve: async () => Promise.reject(new CommandRejected('CATALOG_NOT_READY', 'unused')) };

async function call(who: string | undefined, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { origin: APP_ORIGIN };
  if (who !== undefined) headers.authorization = `Bearer ${tokens.get(who) ?? ''}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

const admin = (type: string, payload: Record<string, unknown>, who = ADMIN) => call(who, 'POST', '/api/admin/commands', { command_id: randomUUID(), type, payload });
const act = (who: string, type: string, payload: Record<string, unknown>) => call(who, 'POST', '/api/commands', { command_id: randomUUID(), type, payload });
const link = (who: string) => call(who, 'POST', '/api/me/link', {});

interface Row {
  line: number;
  email: string;
  name: string;
  team?: string;
  slack_user_id?: string;
}
const preview = (rows: Row[], slackColumn = true) => call(ADMIN, 'POST', '/api/admin/people/preview', { rows, slack_column: slackColumn });
const importPeople = (rows: Row[], options: { slackColumn?: boolean; importId?: string } = {}) =>
  call(ADMIN, 'POST', '/api/admin/people/import', { import_id: options.importId ?? randomUUID(), rows, slack_column: options.slackColumn ?? true });

interface PersonView {
  person_id: string;
  name: string;
  team_label?: string;
  role: string;
  active: boolean;
  linked: boolean;
  slack_mapped: boolean;
  in_latest_import: boolean;
}
const peopleList = async (query = '') => (await call(ADMIN, 'GET', `/api/admin/people${query === '' ? '' : `?q=${encodeURIComponent(query)}`}`)).body as unknown as { people: PersonView[]; total: number };
const personView = async (personId: string) => (await peopleList()).people.find((person) => person.person_id === personId);

async function signIn(email: string): Promise<string> {
  const signedIn = await harness.signIn(email);
  tokens.set(email, signedIn.idToken);
  uids.set(email, signedIn.uid);
  return signedIn.uid;
}

/** The people list before any import: two GM Admins (one active pair), a GM, an employee; access made directly. */
async function seed(): Promise<void> {
  await clearFirestore();
  const batch = harness.db.batch();
  const people: [string, string, string][] = [
    [ADMIN, 'คุณแอดมิน หนึ่ง', 'gm_admin'],
    [GM, 'คุณจีเอ็ม', 'gm_staff'],
    [EMPLOYEE, 'คุณพนักงาน เดิม', 'requester'],
  ];
  for (const [personId, name, role] of people) batch.set(harness.db.doc(`people/${personId}`), { email: personId, name, role, active: true, uid: uids.get(personId) });
  batch.set(harness.db.doc('settings/routing'), { default_owner_by_type: { document_request: GM } });
  batch.set(harness.db.doc('calendars/company'), { timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays: [] });
  for (const gm of [GM, ADMIN]) batch.set(harness.db.doc(`gm_profiles/${gm}`), { presence_status: { kind: 'unspecified' } });
  for (const [personId, , role] of people) batch.set(harness.db.doc(`access/${uids.get(personId)}`), { person_id: personId, role, enabled: true });
  await batch.commit();
}

const workerDeps = (): WorkerDeps => ({
  store: adminWorkerStore(worker.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
  adapter: localAdapter(consoleWorkerLogger),
  now: () => NOW + 60_000,
  newLeaseId: () => randomUUID(),
  log: consoleWorkerLogger,
  jobHandlers: workerJobHandlers(directories),
});

beforeAll(async () => {
  logs = captureLogs();
  harness = apiHarness(NOW);
  worker = emulatorClient();
  await clearAuth();
  for (const email of [ADMIN, ADMIN2, GM, EMPLOYEE, NEWCOMER, STRANGER]) await signIn(email);
  server = createServer(
    createApiHandler({
      api: harness.deps,
      commandStore: adminCommandStore(harness.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
      environment: 'dev',
      allowedOrigins: [APP_ORIGIN],
      newRequestId: () => `req-a10-${String(++ids).padStart(4, '0')}`,
      maintenanceCatalog: CATALOG,
      peopleDirectory: directories.peopleDirectory,
      routingDirectory: directories.routingDirectory,
      taskQueue: { enqueue: async () => undefined },
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  rules = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT,
    firestore: { rules: readFileSync(new URL('../../infra/firestore.rules', import.meta.url), 'utf8') },
  });
});

afterAll(async () => {
  logs?.stop();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await rules?.cleanup();
  await harness?.close();
  await worker?.close();
});

beforeEach(async () => {
  harness.setNow(NOW);
  await seed();
});

describe('GM Admin only — every people endpoint checks the role itself', () => {
  it.each([GM, EMPLOYEE])('%s → 403 GM_ADMIN_ONLY on reads, preview, import and commands; nothing written', async (who) => {
    for (const path of ['/api/admin/people', '/api/admin/unlisted-logins']) expect(await call(who, 'GET', path)).toEqual({ status: 403, body: { error: 'GM_ADMIN_ONLY' } });
    const rows = [{ line: 2, email: 'x@tdfb.co', name: 'เอ็กซ์' }];
    expect(await call(who, 'POST', '/api/admin/people/preview', { rows, slack_column: false })).toEqual({ status: 403, body: { error: 'GM_ADMIN_ONLY' } });
    expect(await call(who, 'POST', '/api/admin/people/import', { import_id: randomUUID(), rows, slack_column: false })).toEqual({ status: 403, body: { error: 'GM_ADMIN_ONLY' } });
    expect(await admin('set_person_role', { person_id: EMPLOYEE, role: 'gm_admin' }, who)).toEqual({ status: 403, body: { error: 'GM_ADMIN_ONLY' } });
    expect(await readDoc(harness.db, 'people/x@tdfb.co')).toBeUndefined();
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).toMatchObject({ role: 'requester' });
  });
});

describe('import: preview first, then save (P7-ADMIN-01, D-S08-4, FU-10)', () => {
  const rows: Row[] = [
    { line: 2, email: '  A10.Employee@TDFB.co ', name: 'คุณพนักงาน ชื่อใหม่', team: ' ฝ่ายบัญชี ', slack_user_id: 'U01EMPLOYEE' },
    { line: 3, email: NEWCOMER, name: 'คุณมาใหม่', team: 'คลังสินค้า, จัดส่ง', slack_user_id: '' },
    { line: 4, email: GM, name: 'คุณจีเอ็ม', team: '', slack_user_id: '' },
    { line: 5, email: 'outsider@gmail.com', name: 'คนนอก', team: '', slack_user_id: '' },
    { line: 6, email: 'twice@tdfb.co', name: 'ซ้ำหนึ่ง' },
    { line: 7, email: 'TWICE@tdfb.co', name: 'ซ้ำสอง' },
    { line: 8, email: 'blank.name@tdfb.co', name: '  ' },
  ];

  it('preview: new / update / same / errors with reasons, and who is not in the file — nothing written', async () => {
    const reply = await preview(rows);
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({
      rows: [
        { line: 2, email: EMPLOYEE, status: 'update', changes: ['name', 'team', 'slack'] },
        { line: 3, email: NEWCOMER, status: 'new' },
        { line: 4, email: GM, status: 'same' },
        { line: 5, email: 'outsider@gmail.com', status: 'error', codes: ['EMAIL_NOT_COMPANY'] },
        { line: 6, email: 'twice@tdfb.co', status: 'error', codes: ['EMAIL_DUPLICATE'] },
        { line: 7, email: 'twice@tdfb.co', status: 'error', codes: ['EMAIL_DUPLICATE'] },
        { line: 8, email: 'blank.name@tdfb.co', status: 'error', codes: ['NAME_MISSING'] },
      ],
      counts: { new: 1, update: 1, same: 1, error: 4 },
      not_in_file: 1,
    });
    expect(await readDoc(harness.db, `people/${NEWCOMER}`)).toBeUndefined();
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).toMatchObject({ name: 'คุณพนักงาน เดิม' });
  });

  it('save: new people are ordinary users (role requester, active); the existing keep role and account; bad rows skipped', async () => {
    const reply = await importPeople(rows);
    expect(reply).toMatchObject({ status: 200, body: { replayed: false, result: { created: 1, updated: 1, unchanged: 1, skipped: 4, not_in_file: 1 } } });
    expect(await readDoc(harness.db, `people/${NEWCOMER}`)).toMatchObject({ email: NEWCOMER, name: 'คุณมาใหม่', team_label: 'คลังสินค้า, จัดส่ง', role: 'requester', active: true, created_at: NOW });
    expect(await readDoc(harness.db, `people/${NEWCOMER}`)).not.toHaveProperty('slack_user_id');
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).toMatchObject({ name: 'คุณพนักงาน ชื่อใหม่', team_label: 'ฝ่ายบัญชี', slack_user_id: 'U01EMPLOYEE', role: 'requester', active: true });
    expect(await readDoc(harness.db, `people/${GM}`)).toMatchObject({ role: 'gm_staff' });
    expect(await readDoc(harness.db, 'people/outsider@gmail.com')).toBeUndefined();
    expect(await readDoc(harness.db, 'people/twice@tdfb.co')).toBeUndefined();
    // The GM pickers read the people_picker list (D-ACL-1): name and team only.
    expect(await readDoc(harness.db, `people_picker/${NEWCOMER}`)).toEqual({ name: 'คุณมาใหม่', team_label: 'คลังสินค้า, จัดส่ง' });
  });

  it('the next import: names and teams update; someone missing from the file is NOT switched off, only marked', async () => {
    await importPeople(rows);
    expect(await importPeople([{ line: 2, email: NEWCOMER, name: 'คุณมาใหม่ (แก้ชื่อ)', team: 'คลังสินค้า' }], { slackColumn: false })).toMatchObject({
      status: 200,
      body: { result: { created: 0, updated: 1, not_in_file: 3 } },
    });
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).toMatchObject({ active: true, slack_user_id: 'U01EMPLOYEE' });
    expect(await personView(EMPLOYEE)).toMatchObject({ active: true, in_latest_import: false });
    expect(await personView(NEWCOMER)).toMatchObject({ name: 'คุณมาใหม่ (แก้ชื่อ)', team_label: 'คลังสินค้า', in_latest_import: true });
  });

  it('a Slack column not chosen leaves stored Slack IDs alone; a chosen but blank cell clears it', async () => {
    await importPeople([{ line: 2, email: EMPLOYEE, name: 'คุณพนักงาน เดิม', slack_user_id: 'U01EMPLOYEE' }]);
    await importPeople([{ line: 2, email: EMPLOYEE, name: 'คุณพนักงาน เดิม' }], { slackColumn: false });
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).toMatchObject({ slack_user_id: 'U01EMPLOYEE' });
    await importPeople([{ line: 2, email: EMPLOYEE, name: 'คุณพนักงาน เดิม', slack_user_id: '' }]);
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).not.toHaveProperty('slack_user_id');
  });

  it('FU-10: a team column not chosen leaves stored teams alone (preview says “same”); a chosen one sets the single value', async () => {
    await importPeople([{ line: 2, email: EMPLOYEE, name: 'คุณพนักงาน เดิม', team: 'ฝ่ายบัญชี' }], { slackColumn: false });
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).toMatchObject({ team_label: 'ฝ่ายบัญชี' });
    const withoutTeam: Row[] = [{ line: 2, email: EMPLOYEE, name: 'คุณพนักงาน เดิม' }];
    expect((await preview(withoutTeam, false)).body).toMatchObject({ rows: [{ line: 2, email: EMPLOYEE, status: 'same' }] });
    expect(await importPeople(withoutTeam, { slackColumn: false })).toMatchObject({ status: 200, body: { result: { unchanged: 1, updated: 0 } } });
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).toMatchObject({ team_label: 'ฝ่ายบัญชี' });
    expect(await readDoc(harness.db, `people_picker/${EMPLOYEE}`)).toMatchObject({ team_label: 'ฝ่ายบัญชี' });
  });

  it('the same import key again is replayed (nothing twice); with other rows it is a conflict', async () => {
    const importId = randomUUID();
    const first = await importPeople(rows, { importId });
    expect(await importPeople(rows, { importId })).toEqual({ status: 200, body: { replayed: true, result: (first.body as { result: unknown }).result } });
    expect(await importPeople(rows.slice(0, 1), { importId })).toMatchObject({ status: 409, body: { error: 'COMMAND_ID_CONFLICT' } });
  });

  it('the file is not kept: no stored document holds the rows or any unmapped column; the log has no e-mail or name', async () => {
    const before = logs.lines.length;
    const reply = await importPeople(rows);
    expect(reply.status).toBe(200);
    // Only people documents (and their pickers) hold what was imported; the import record keeps counts.
    const records = [...(await readCollection(harness.db, 'commands')).values(), ...(await readCollection(harness.db, 'imports')).values(), ...(await readCollection(harness.db, 'settings')).values()];
    expect(records.length).toBeGreaterThan(0);
    const everything = JSON.stringify(records);
    for (const leaked of ['outsider@gmail.com', 'twice@tdfb.co', 'ซ้ำหนึ่ง', NEWCOMER, 'คุณมาใหม่', SECRET_COLUMN]) expect(everything).not.toContain(leaked);
    const logged = logs.lines.slice(before).join('\n');
    for (const personal of [NEWCOMER, EMPLOYEE, 'คุณมาใหม่', 'คุณพนักงาน ชื่อใหม่', 'outsider@gmail.com']) expect(logged).not.toContain(personal);
  });

  it('the API refuses a body that is not mapped rows (a raw file, an unknown field)', async () => {
    expect(await call(ADMIN, 'POST', '/api/admin/people/import', { import_id: randomUUID(), csv: `email,name\n${NEWCOMER},x`, slack_column: false })).toMatchObject({ status: 400 });
    expect(await call(ADMIN, 'POST', '/api/admin/people/import', { import_id: randomUUID(), rows: [{ line: 2, email: NEWCOMER, name: 'x', phone: SECRET_COLUMN }], slack_column: false })).toMatchObject({
      status: 400,
      body: { error: 'UNKNOWN_FIELD' },
    });
  });
});

describe('FU-11: a changed name reaches the requests still open; closed ones keep the old name', () => {
  async function onBehalf(): Promise<string> {
    const reply = await act(GM, 'create_on_behalf', {
      requester: { person_id: EMPLOYEE },
      details: { type: 'document_request', summary_title: 'ขอหนังสือรับรอง', sensitivity_subject: 'general' },
    });
    expect(reply.status).toBe(200);
    return (reply.body.result as { request_id: string }).request_id;
  }

  it('after the import, the worker job rewrites the name pairs of open requests only', async () => {
    const open = await onBehalf();
    const closed = await onBehalf();
    expect(await act(GM, 'cancel_request', { request_id: closed, expected_revision: 1, reason: 'ซ้ำ' })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, `requests/${open}`)).toMatchObject({ requester_display: { person_id: EMPLOYEE, display_name: 'คุณพนักงาน เดิม' } });
    await importPeople([{ line: 2, email: EMPLOYEE, name: 'คุณพนักงาน ชื่อใหม่' }], { slackColumn: false });
    const jobs = [...(await readCollection(harness.db, 'scheduled_work')).entries()].filter(([, job]) => job.kind === 'display_refresh');
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.[1]).toMatchObject({ state: 'scheduled', person_ids: [EMPLOYEE] });
    expect(await runJob(workerDeps(), jobs[0]?.[0] ?? '')).toBe('done');
    expect(await readDoc(harness.db, `requests/${open}`)).toMatchObject({ requester_display: { person_id: EMPLOYEE, display_name: 'คุณพนักงาน ชื่อใหม่' } });
    expect(await readDoc(harness.db, `requests/${closed}`)).toMatchObject({ requester_display: { person_id: EMPLOYEE, display_name: 'คุณพนักงาน เดิม' } });
    // A rename is not an event: no new revision, no history entry, nothing unread.
    expect(await readDoc(harness.db, `requests/${open}`)).toMatchObject({ revision: 1 });
    expect((await readCollection(harness.db, `requests/${open}/history`)).size).toBe(1);
  });

  it('a request waiting on someone is still open: its names follow too', async () => {
    const waiting = await onBehalf();
    expect(await act(GM, 'accept_request', { request_id: waiting, expected_revision: 1 })).toMatchObject({ status: 200 });
    expect(await act(GM, 'enter_waiting', { request_id: waiting, expected_revision: 2, waiting_on: { kind: 'person', person_id: ADMIN } })).toMatchObject({
      status: 200,
      body: { result: { status: 'waiting' } },
    });
    await importPeople([{ line: 2, email: EMPLOYEE, name: 'คุณพนักงาน ชื่อใหม่' }], { slackColumn: false });
    const job = [...(await readCollection(harness.db, 'scheduled_work')).entries()].find(([, data]) => data.kind === 'display_refresh');
    expect(await runJob(workerDeps(), job?.[0] ?? '')).toBe('done');
    expect(await readDoc(harness.db, `requests/${waiting}`)).toMatchObject({ status: 'waiting', requester_display: { person_id: EMPLOYEE, display_name: 'คุณพนักงาน ชื่อใหม่' } });
  });

  it('a request closed after the worker listed it keeps its old name (checked again inside the transaction)', async () => {
    const closed = await onBehalf();
    expect(await act(GM, 'cancel_request', { request_id: closed, expected_revision: 1, reason: 'ซ้ำ' })).toMatchObject({ status: 200 });
    await importPeople([{ line: 2, email: EMPLOYEE, name: 'คุณพนักงาน ชื่อใหม่' }], { slackColumn: false });
    const store = adminCommandStore(harness.db, { maxAttempts: TEST_MAX_ATTEMPTS });
    const wrote = await store.runTransaction(async (transaction) =>
      refreshRequestNames(transaction, closed, { now: NOW, workCalendar: await transactionCompanyCalendar(transaction), peopleDirectory: directories.peopleDirectory, involves: () => true }),
    );
    expect(wrote).toBe(false);
    expect(await readDoc(harness.db, `requests/${closed}`)).toMatchObject({ requester_display: { person_id: EMPLOYEE, display_name: 'คุณพนักงาน เดิม' } });
  });

  it('no name or team changed → no job', async () => {
    await importPeople([{ line: 2, email: EMPLOYEE, name: 'คุณพนักงาน เดิม' }], { slackColumn: false });
    expect([...(await readCollection(harness.db, 'scheduled_work')).values()].filter((job) => job.kind === 'display_refresh')).toEqual([]);
  });
});

describe('roles and accounts: set by the GM Admin; access changes at once (API and Rules)', () => {
  const client = (email: string) =>
    rules.authenticatedContext(uids.get(email) ?? '', { email, email_verified: true, firebase: { sign_in_provider: 'google.com' } } as never).firestore();

  it('the role list: Viewer / GM Staff / GM Admin / employee; access/{uid} follows in the same command', async () => {
    for (const role of ['viewer', 'gm_staff', 'gm_admin', 'requester']) {
      expect(await admin('set_person_role', { person_id: EMPLOYEE, role })).toMatchObject({ status: 200 });
      expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).toMatchObject({ role });
      expect(await readDoc(harness.db, `access/${uids.get(EMPLOYEE)}`)).toEqual({ person_id: EMPLOYEE, role, enabled: true });
    }
  });

  it('promote to GM Staff: the very next API call and Rules read see it; demote: both refuse again', async () => {
    await harness.db.doc(`people_picker/${GM}`).set({ name: 'คุณจีเอ็ม' });
    await assertFails(client(EMPLOYEE).doc(`people_picker/${GM}`).get());
    expect(await call(EMPLOYEE, 'GET', '/api/admin/people')).toEqual({ status: 403, body: { error: 'GM_ADMIN_ONLY' } });
    await admin('set_person_role', { person_id: EMPLOYEE, role: 'gm_staff' });
    await assertSucceeds(client(EMPLOYEE).doc(`people_picker/${GM}`).get());
    await admin('set_person_role', { person_id: EMPLOYEE, role: 'gm_admin' });
    expect((await call(EMPLOYEE, 'GET', '/api/admin/people')).status).toBe(200);
    await admin('set_person_role', { person_id: EMPLOYEE, role: 'requester' });
    expect(await call(EMPLOYEE, 'GET', '/api/admin/people')).toEqual({ status: 403, body: { error: 'GM_ADMIN_ONLY' } });
    await assertFails(client(EMPLOYEE).doc(`people_picker/${GM}`).get());
  });

  it('switch an account off: the next API call is ACCOUNT_DISABLED and Rules refuse; on again works', async () => {
    expect((await call(EMPLOYEE, 'GET', '/api/me/awaiting-confirmation')).status).toBe(200);
    await harness.db.doc('locations/loc-wh300').set({ label: 'WH300', active: true });
    await assertSucceeds(client(EMPLOYEE).doc('locations/loc-wh300').get());
    expect(await admin('set_person_active', { person_id: EMPLOYEE, active: false })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, `access/${uids.get(EMPLOYEE)}`)).toMatchObject({ enabled: false });
    expect(await readDoc(harness.db, `people_picker/${EMPLOYEE}`)).toBeUndefined();
    expect(await call(EMPLOYEE, 'GET', '/api/me/awaiting-confirmation')).toEqual({ status: 403, body: { error: 'ACCOUNT_DISABLED' } });
    await assertFails(client(EMPLOYEE).doc('locations/loc-wh300').get());
    await admin('set_person_active', { person_id: EMPLOYEE, active: true });
    expect((await call(EMPLOYEE, 'GET', '/api/me/awaiting-confirmation')).status).toBe(200);
  });

  it('the last active GM Admin can be neither demoted nor switched off — even by themselves', async () => {
    expect(await admin('set_person_role', { person_id: ADMIN, role: 'gm_staff' })).toEqual({ status: 409, body: { error: 'LAST_GM_ADMIN' } });
    expect(await admin('set_person_active', { person_id: ADMIN, active: false })).toEqual({ status: 409, body: { error: 'LAST_GM_ADMIN' } });
    expect(await readDoc(harness.db, `access/${uids.get(ADMIN)}`)).toMatchObject({ role: 'gm_admin', enabled: true });
    // With a second active GM Admin it is allowed.
    await admin('set_person_role', { person_id: GM, role: 'gm_admin' });
    expect(await admin('set_person_role', { person_id: ADMIN, role: 'gm_staff' })).toMatchObject({ status: 200 });
    expect(await admin('set_person_active', { person_id: GM, active: false }, GM)).toEqual({ status: 409, body: { error: 'LAST_GM_ADMIN' } });
  });

  it('a GM Admin whose account is switched off does not count as the other GM Admin', async () => {
    await harness.db.doc(`people/${ADMIN2}`).set({ email: ADMIN2, name: 'คุณแอดมิน สอง', role: 'gm_admin', active: false });
    expect(await admin('set_person_role', { person_id: ADMIN, role: 'gm_staff' })).toEqual({ status: 409, body: { error: 'LAST_GM_ADMIN' } });
    expect(await admin('set_person_active', { person_id: ADMIN, active: false })).toEqual({ status: 409, body: { error: 'LAST_GM_ADMIN' } });
    expect(await readDoc(harness.db, `people/${ADMIN}`)).toMatchObject({ role: 'gm_admin', active: true });
  });

  it('an unknown person or role is refused', async () => {
    expect(await admin('set_person_role', { person_id: 'nobody@tdfb.co', role: 'viewer' })).toEqual({ status: 404, body: { error: 'PERSON_NOT_FOUND' } });
    expect((await admin('set_person_role', { person_id: EMPLOYEE, role: 'owner' })).status).toBe(400);
  });
});

describe('first login (D-A09-1): linked by the verified e-mail on the list, never by name', () => {
  it('listed and active → access/{uid} from people; the person records the account; again → no change', async () => {
    await importPeople([{ line: 2, email: NEWCOMER, name: 'คุณมาใหม่' }], { slackColumn: false });
    await admin('set_person_role', { person_id: NEWCOMER, role: 'viewer' });
    expect(await link(NEWCOMER)).toEqual({ status: 200, body: { result: 'linked' } });
    expect(await readDoc(harness.db, `access/${uids.get(NEWCOMER)}`)).toEqual({ person_id: NEWCOMER, role: 'viewer', enabled: true });
    expect(await readDoc(harness.db, `people/${NEWCOMER}`)).toMatchObject({ uid: uids.get(NEWCOMER), linked_at: NOW });
    expect(await link(NEWCOMER)).toEqual({ status: 200, body: { result: 'already' } });
    expect((await call(NEWCOMER, 'GET', '/api/me/awaiting-confirmation')).status).toBe(200);
    expect(await personView(NEWCOMER)).toMatchObject({ linked: true });
  });

  it('listed but switched off → no access; the page says the account is off', async () => {
    await importPeople([{ line: 2, email: NEWCOMER, name: 'คุณมาใหม่' }], { slackColumn: false });
    await admin('set_person_active', { person_id: NEWCOMER, active: false });
    expect(await link(NEWCOMER)).toEqual({ status: 200, body: { result: 'disabled' } });
    expect(await readDoc(harness.db, `access/${uids.get(NEWCOMER)}`)).toBeUndefined();
  });

  it('a person with the same name but another e-mail is not linked (names never map to accounts)', async () => {
    await importPeople([{ line: 2, email: 'other.person@tdfb.co', name: 'คุณคนแปลกหน้า' }], { slackColumn: false });
    expect(await link(STRANGER)).toEqual({ status: 200, body: { result: 'not_listed' } });
    expect(await readDoc(harness.db, `access/${uids.get(STRANGER)}`)).toBeUndefined();
  });

  it('a new Google account for the same e-mail takes over: the old account’s access is switched off', async () => {
    await importPeople([{ line: 2, email: NEWCOMER, name: 'คุณมาใหม่' }], { slackColumn: false });
    await harness.db.doc(`people/${NEWCOMER}`).update({ uid: 'uid-old-account' });
    await harness.db.doc('access/uid-old-account').set({ person_id: NEWCOMER, role: 'requester', enabled: true });
    expect(await link(NEWCOMER)).toEqual({ status: 200, body: { result: 'linked' } });
    expect(await readDoc(harness.db, 'access/uid-old-account')).toMatchObject({ enabled: false });
  });

  it('an unverified e-mail or an outside account is refused before anything is read', async () => {
    const unverified = await harness.signIn('a10.unverified@tdfb.co', false);
    tokens.set('unverified', unverified.idToken);
    expect(await link('unverified')).toEqual({ status: 403, body: { error: 'NOT_CORPORATE' } });
    const outsider = await harness.signIn('a10.outsider@gmail.com');
    tokens.set('outsider', outsider.idToken);
    expect(await link('outsider')).toEqual({ status: 403, body: { error: 'NOT_CORPORATE' } });
    expect(await call(undefined, 'POST', '/api/me/link', {})).toMatchObject({ status: 401 });
    expect((await readCollection(harness.db, 'unlisted_logins')).size).toBe(0);
  });
});

describe('logins not on the list (D-A09-1): e-mail and time, GM Admin only, added at once', () => {
  it('recorded with first / last time and count; the GM Admin sees them; nobody else', async () => {
    expect(await link(STRANGER)).toEqual({ status: 200, body: { result: 'not_listed' } });
    harness.setNow(NOW + 3_600_000);
    await link(STRANGER);
    const reply = await call(ADMIN, 'GET', '/api/admin/unlisted-logins');
    expect(reply).toEqual({ status: 200, body: { items: [{ email: STRANGER, first_seen_at: NOW, last_seen_at: NOW + 3_600_000, count: 2 }] } });
    expect(JSON.stringify(reply.body)).not.toContain(uids.get(STRANGER) ?? 'no-uid');
    expect((await call(GM, 'GET', '/api/admin/unlisted-logins')).status).toBe(403);
    const anyone = rules.authenticatedContext(uids.get(GM) ?? '', { email: GM, email_verified: true, firebase: { sign_in_provider: 'google.com' } } as never).firestore();
    await assertFails(anyone.doc(`unlisted_logins/${STRANGER}`).get());
  });

  it('“เพิ่มเข้ารายชื่อ”: the person is added and, having signed in already, gets access right away', async () => {
    await link(STRANGER);
    expect(await admin('add_person', { email: STRANGER, name: 'คุณคนแปลกหน้า', team: 'ฝ่ายขาย' })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, `people/${STRANGER}`)).toMatchObject({ name: 'คุณคนแปลกหน้า', team_label: 'ฝ่ายขาย', role: 'requester', active: true, uid: uids.get(STRANGER) });
    expect(await readDoc(harness.db, `access/${uids.get(STRANGER)}`)).toEqual({ person_id: STRANGER, role: 'requester', enabled: true });
    expect(await readDoc(harness.db, `unlisted_logins/${STRANGER}`)).toBeUndefined();
    expect((await call(STRANGER, 'GET', '/api/me/awaiting-confirmation')).status).toBe(200);
    expect(await admin('add_person', { email: STRANGER, name: 'ซ้ำ' })).toEqual({ status: 409, body: { error: 'PERSON_EXISTS' } });
    expect((await admin('add_person', { email: 'someone@gmail.com', name: 'นอก' })).status).toBe(400);
  });
});

describe('D-A10-2: switching off a GM who still has open requests', () => {
  async function onBehalfFor(requester: string): Promise<string> {
    const reply = await act(GM, 'create_on_behalf', {
      requester: { person_id: requester },
      details: { type: 'document_request', summary_title: 'ขอหนังสือรับรอง', sensitivity_subject: 'general' },
    });
    expect(reply.status).toBe(200);
    return (reply.body.result as { request_id: string }).request_id;
  }

  it('the list shows how many open requests the GM holds; switching off needs that count; then they are unassigned, unpinned and every other GM is told', async () => {
    const queued = await onBehalfFor(EMPLOYEE);
    const working = await onBehalfFor(EMPLOYEE);
    const cancelled = await onBehalfFor(EMPLOYEE);
    expect(await act(GM, 'accept_request', { request_id: working, expected_revision: 1 })).toMatchObject({ status: 200 });
    expect(await act(GM, 'cancel_request', { request_id: cancelled, expected_revision: 1, reason: 'ซ้ำ' })).toMatchObject({ status: 200 });
    await harness.db.doc(`gm_profiles/${GM}`).set({ presence_status: { kind: 'unspecified' }, focus_request_id: working });
    expect(await personView(GM)).toMatchObject({ open_assigned: 2 });
    expect(await personView(EMPLOYEE)).toMatchObject({ open_assigned: 0 });

    expect(await admin('set_person_active', { person_id: GM, active: false })).toEqual({ status: 409, body: { error: 'OPEN_REQUESTS_ASSIGNED', open_assigned: 2 } });
    expect(await admin('set_person_active', { person_id: GM, active: false, release_open_requests: 1 })).toEqual({ status: 409, body: { error: 'OPEN_REQUESTS_ASSIGNED', open_assigned: 2 } });
    expect(await readDoc(harness.db, `access/${uids.get(GM)}`)).toMatchObject({ enabled: true });

    const outboxBefore = (await readCollection(harness.db, 'outbox')).size;
    expect(await admin('set_person_active', { person_id: GM, active: false, release_open_requests: 2 })).toMatchObject({ status: 200, body: { result: { person_id: GM, active: false, released: 2 } } });
    expect(await readDoc(harness.db, `access/${uids.get(GM)}`)).toMatchObject({ enabled: false });
    for (const id of [queued, working]) {
      const request = await readDoc(harness.db, `requests/${id}`);
      expect(request).toMatchObject({ status: 'queued' });
      expect(request).not.toHaveProperty('assignee_id');
      expect(await readDoc(harness.db, `gm_request_summaries/${id}`)).not.toHaveProperty('assignee_id');
      const history = [...(await readCollection(harness.db, `requests/${id}/history`)).values()];
      expect(history).toContainEqual(expect.objectContaining({ kind: 'unassigned', actor_id: 'system', previous_assignee_id: GM, reason: 'ASSIGNEE_INACTIVE' }));
    }
    // A GM progress clock is not reset by an Admin's change.
    expect(await readDoc(harness.db, `requests/${queued}`)).toMatchObject({ last_updated_at: NOW });
    expect(await readDoc(harness.db, `gm_profiles/${GM}`)).not.toHaveProperty('focus_request_id');
    expect(await readDoc(harness.db, `requests/${cancelled}`)).toMatchObject({ status: 'cancelled', assignee_id: GM });
    const notices = [...(await readCollection(harness.db, 'outbox')).values()].slice(outboxBefore).filter((entry) => entry.event_kind === 'request_unassigned');
    // “แจ้ง GM ที่เหลือ”: the active GMs by role (D-A10-1) — here the GM Admin — once per request.
    expect(notices.map((entry) => [entry.request_id, entry.recipient_id, entry.audience]).sort()).toEqual(
      [
        [queued, ADMIN, 'gm'],
        [working, ADMIN, 'gm'],
      ].sort(),
    );
    expect(await personView(GM)).toMatchObject({ active: false, open_assigned: 0 });
  });

  it('the release is safe to run twice: a request already unassigned or taken by someone else is left alone', async () => {
    const id = await onBehalfFor(EMPLOYEE);
    expect(await admin('set_person_active', { person_id: GM, active: false, release_open_requests: 1 })).toMatchObject({ status: 200 });
    const after = await readDoc(harness.db, `requests/${id}`);
    // Switching on and off again: nothing is left to release, and the request is not written again.
    expect(await admin('set_person_active', { person_id: GM, active: true })).toMatchObject({ status: 200 });
    expect(await admin('set_person_active', { person_id: GM, active: false })).toMatchObject({ status: 200, body: { result: { released: 0 } } });
    expect(await readDoc(harness.db, `requests/${id}`)).toEqual(after);
  });

  it('an employee with open requests is switched off as before: their requests do not change', async () => {
    const id = await onBehalfFor(EMPLOYEE);
    expect(await admin('set_person_active', { person_id: EMPLOYEE, active: false })).toMatchObject({ status: 200, body: { result: { released: 0 } } });
    expect(await readDoc(harness.db, `requests/${id}`)).toMatchObject({ status: 'queued', assignee_id: GM, requester_id: EMPLOYEE });
  });
});

describe('D-A10-5 / D-A10-6: add a person by hand; edit a name and team', () => {
  it('a new employee not in the CSV yet: the e-mail is checked like an import (lower case, @tdfb.co only); an ordinary user', async () => {
    expect(await admin('add_person', { email: '  New.Hire@TDFB.co ', name: 'คุณพนักงาน ใหม่', team: 'ฝ่ายขาย' })).toMatchObject({ status: 200, body: { result: { person_id: 'new.hire@tdfb.co' } } });
    expect(await readDoc(harness.db, 'people/new.hire@tdfb.co')).toMatchObject({ email: 'new.hire@tdfb.co', name: 'คุณพนักงาน ใหม่', team_label: 'ฝ่ายขาย', role: 'requester', active: true });
    expect(await admin('add_person', { email: 'new.hire@gmail.com', name: 'คนนอก' })).toMatchObject({ status: 400, body: { error: 'FIELD_INVALID' } });
    expect(await admin('add_person', { email: 'new.hire@tdfb.co', name: 'ซ้ำ' })).toEqual({ status: 409, body: { error: 'PERSON_EXISTS' } });
  });

  it('a name and team edited by hand: people and the picker change; open requests follow (FU-11); a blank team clears it', async () => {
    const reply = await act(GM, 'create_on_behalf', {
      requester: { person_id: EMPLOYEE },
      details: { type: 'document_request', summary_title: 'ขอหนังสือรับรอง', sensitivity_subject: 'general' },
    });
    const id = (reply.body.result as { request_id: string }).request_id;
    expect(await admin('update_person', { person_id: EMPLOYEE, name: '  คุณพนักงาน   แก้ด้วยมือ ', team: 'ฝ่ายบัญชี' })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).toMatchObject({ name: 'คุณพนักงาน แก้ด้วยมือ', team_label: 'ฝ่ายบัญชี', role: 'requester', active: true });
    expect(await readDoc(harness.db, `people_picker/${EMPLOYEE}`)).toEqual({ name: 'คุณพนักงาน แก้ด้วยมือ', team_label: 'ฝ่ายบัญชี' });
    const job = [...(await readCollection(harness.db, 'scheduled_work')).entries()].find(([, data]) => data.kind === 'display_refresh');
    expect(job?.[1]).toMatchObject({ state: 'scheduled', person_ids: [EMPLOYEE] });
    expect(await runJob(workerDeps(), job?.[0] ?? '')).toBe('done');
    expect(await readDoc(harness.db, `requests/${id}`)).toMatchObject({ requester_display: { person_id: EMPLOYEE, display_name: 'คุณพนักงาน แก้ด้วยมือ' } });
    expect(await admin('update_person', { person_id: EMPLOYEE, name: 'คุณพนักงาน แก้ด้วยมือ' })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).not.toHaveProperty('team_label');
  });

  it('a name that is blank or too long, or a person not on the list, is refused; nothing changes', async () => {
    expect(await admin('update_person', { person_id: EMPLOYEE, name: '   ' })).toEqual({ status: 422, body: { error: 'LABEL_INVALID' } });
    expect(await admin('update_person', { person_id: EMPLOYEE, name: 'ก'.repeat(101) })).toEqual({ status: 422, body: { error: 'LABEL_INVALID' } });
    expect(await admin('update_person', { person_id: 'nobody@tdfb.co', name: 'ใคร' })).toEqual({ status: 404, body: { error: 'PERSON_NOT_FOUND' } });
    expect(await readDoc(harness.db, `people/${EMPLOYEE}`)).toMatchObject({ name: 'คุณพนักงาน เดิม' });
  });
});

describe('the people list (Part 3 §13.3)', () => {
  it('search by name or e-mail; role, account, Slack mapped or not, signed in or not — never the Slack ID itself', async () => {
    await importPeople([{ line: 2, email: EMPLOYEE, name: 'คุณพนักงาน เดิม', slack_user_id: 'U01EMPLOYEE' }]);
    const all = await peopleList();
    expect(all.total).toBe(3);
    expect(all.people.find((person) => person.person_id === EMPLOYEE)).toEqual({
      person_id: EMPLOYEE,
      name: 'คุณพนักงาน เดิม',
      role: 'requester',
      active: true,
      linked: true,
      slack_mapped: true,
      in_latest_import: true,
    });
    expect(JSON.stringify(all)).not.toContain('U01EMPLOYEE');
    expect((await peopleList('จีเอ็ม')).people.map((person) => person.person_id)).toEqual([GM]);
    expect((await peopleList('A10.EMPLOYEE')).people.map((person) => person.person_id)).toEqual([EMPLOYEE]);
  });

  it('nothing left this machine', () => {
    expect(blockedHosts).toEqual([]);
  });
});
