// A14 — sending the repair (UI-03 step 4, U1 “กันส่งพร้อมกัน”, FU-49, UI-03 states): “อื่นๆ” must be
// described; a resend with the same command_id is the same request (one request, one number); the
// send rechecks open matches at the same place/area/symptom in the create transaction, serialized per
// place + symptom, and refuses with DUPLICATE_FOUND unless the person already answered “ไม่ใช่” to every
// one of them (then it is created without asking again); the reply tells the number, status and who
// has it. Emulators only.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { firestoreMaintenanceCatalog } from '../../apps/api/src/firestore/catalog';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { apiHarness, captureLogs, clearAuth, type ApiHarness, type LogCapture } from './support/api-harness';
import { TEST_MAX_ATTEMPTS, clearFirestore, readCollection, readDoc } from './support/firestore-client-store';

const NOW = Date.parse('2027-01-11T09:00:00+07:00');
const APP_ORIGIN = 'https://gm-dev.tdfb.co';
const GM = 'a14.gm@tdfb.co';
const FIRST = 'a14.first@tdfb.co';
const SECOND = 'a14.second@tdfb.co';
const THIRD = 'a14.third@tdfb.co';
const DISABLED = 'a14.disabled@tdfb.co';
const ROLES: Readonly<Record<string, string>> = { [GM]: 'gm_staff', [FIRST]: 'requester', [SECOND]: 'requester', [THIRD]: 'viewer', [DISABLED]: 'requester' };

let harness: ApiHarness;
let logs: LogCapture;
let server: Server;
let baseUrl = '';
let ids = 0;
const tokens = new Map<string, string>();

async function call(who: string | undefined, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { origin: APP_ORIGIN };
  if (who !== undefined) headers.authorization = `Bearer ${tokens.get(who) ?? ''}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

const act = (who: string, type: string, payload: Record<string, unknown>) => call(who, 'POST', '/api/commands', { command_id: randomUUID(), type, payload });

async function revisionOf(id: string): Promise<number> {
  return (await readDoc(harness.db, `requests/${id}`))?.revision as number;
}


const PACK = { location_id: 'loc-wh300', area_id: 'area-wh300-pack-1', symptom_key: 'aircon' };

async function seed(): Promise<void> {
  const batch = harness.db.batch();
  batch.set(harness.db.doc('locations/loc-wh300'), { label: 'WH300', active: true, order: 1 });
  batch.set(harness.db.doc('locations/loc-fac16'), { label: 'FAC16', active: true, order: 2 });
  batch.set(harness.db.doc('areas/area-wh300-pack-1'), { location_id: 'loc-wh300', label: 'ห้องแพ็คชั้น 1', active: true, order: 1 });
  batch.set(harness.db.doc('areas/area-wh300-qa-1'), { location_id: 'loc-wh300', label: 'ห้อง QA ชั้น 1', active: true, order: 2 });
  batch.set(harness.db.doc('settings/routing'), { default_owner_by_type: { maintenance: GM } });
  batch.set(harness.db.doc('calendars/company'), { timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays: [] });
  for (const [personId, role] of Object.entries(ROLES)) batch.set(harness.db.doc(`people/${personId}`), { email: personId, name: `คุณ ${personId.split('@')[0]}`, role, active: personId !== DISABLED });
  await batch.commit();
}

beforeAll(async () => {
  logs = captureLogs();
  harness = apiHarness(NOW);
  await clearAuth();
  server = createServer(
    createApiHandler({
      api: harness.deps,
      commandStore: adminCommandStore(harness.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
      environment: 'dev',
      allowedOrigins: [APP_ORIGIN],
      newRequestId: () => `req-a14-${String(++ids).padStart(4, '0')}`,
      maintenanceCatalog: firestoreMaintenanceCatalog(),
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
});

beforeEach(async () => {
  harness.setNow(NOW);
  await clearFirestore();
  for (const [personId, role] of Object.entries(ROLES)) {
    const signedIn = await harness.signIn(personId);
    tokens.set(personId, signedIn.idToken);
    await harness.db.doc(`access/${signedIn.uid}`).set({ person_id: personId, role, enabled: personId !== DISABLED });
  }
  await seed();
});


const create = (who: string, payload: Record<string, unknown>, commandId: string = randomUUID()) => call(who, 'POST', '/api/commands', { command_id: commandId, type: 'create_maintenance', payload });
const count = async (collection: string) => (await readCollection(harness.db, collection)).size;

describe('step 4: what is sent', () => {
  it('“อื่นๆ” without a description is refused (422 DESCRIPTION_REQUIRED) and nothing is written', async () => {
    const reply = await create(FIRST, { location_id: 'loc-wh300', symptom_key: 'other', description: '   ' });
    expect(reply).toMatchObject({ status: 422, body: { error: 'DESCRIPTION_REQUIRED' } });
    expect(await count('requests')).toBe(0);
    expect(await readDoc(harness.db, 'system_counters/request_sequence')).toBeUndefined();
  });

  it('described “อื่นๆ”: created with the automatic title; the text stays in the restricted description', async () => {
    const reply = await create(FIRST, { location_id: 'loc-wh300', symptom_key: 'other', description: 'ประตูฝืด เปิดยาก' });
    expect(reply.status).toBe(200);
    const id = (reply.body.result as { request_id: string }).request_id;
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ summary_title: 'อื่นๆ · WH300' });
    expect(JSON.stringify(await readDoc(harness.db, `request_summaries/${id}`))).not.toContain('ประตูฝืด');
    expect(await readDoc(harness.db, `requests/${id}`)).toMatchObject({ description: 'ประตูฝืด เปิดยาก' });
  });

  it('the reply says the number, the status and whether a GM has it (UI-03 “รับเรื่อง GM-xxxx แล้ว”)', async () => {
    const reply = await create(FIRST, PACK);
    expect(reply).toMatchObject({
      status: 200,
      body: { replayed: false, result: { request_number: expect.stringMatching(/^DEV-\d{4}$/), status: 'queued', is_assigned: true, assignee_label: `คุณ ${GM.split('@')[0]}` } },
    });
  });
});

describe('sending again: one command_id per form', () => {
  it('pressing send twice or retrying after a lost reply with the same command_id gives one request and one number', async () => {
    const commandId = randomUUID();
    const [first, second] = await Promise.all([create(FIRST, PACK, commandId), create(FIRST, PACK, commandId)]);
    const third = await create(FIRST, PACK, commandId);
    for (const reply of [first, second, third]) expect(reply.status).toBe(200);
    const ids = new Set([first, second, third].map((reply) => (reply.body.result as { request_id: string }).request_id));
    expect(ids.size).toBe(1);
    expect(third.body.replayed).toBe(true);
    expect(await count('requests')).toBe(1);
    expect(await readDoc(harness.db, 'system_counters/request_sequence')).toMatchObject({ last_issued: 1 });
  });
});

describe('FU-49: the duplicate check again when sending (U1 “กันส่งพร้อมกัน”)', () => {
  it('a match that appeared while the form was filled → 409 DUPLICATE_FOUND with its ID; nothing written, no number used', async () => {
    const meanwhile = await reportId(SECOND, PACK);
    const before = await readDoc(harness.db, 'system_counters/request_sequence');
    const reply = await create(FIRST, { ...PACK, description: 'แอร์ไม่เย็น' });
    expect(reply).toEqual({ status: 409, body: { error: 'DUPLICATE_FOUND', current: { request_ids: [meanwhile] } } });
    expect(await count('requests')).toBe(1);
    expect(await readDoc(harness.db, 'system_counters/request_sequence')).toEqual(before);
  });

  it('answered “ไม่ใช่” to it: sent without asking again — even with the same command_id as the refused try', async () => {
    const meanwhile = await reportId(SECOND, PACK);
    const commandId = randomUUID();
    expect((await create(FIRST, PACK, commandId)).status).toBe(409);
    const reply = await create(FIRST, { ...PACK, known_duplicate_ids: [meanwhile] }, commandId);
    expect(reply).toMatchObject({ status: 200, body: { replayed: false } });
    expect(await count('requests')).toBe(2);
  });

  it('a new match the person has not answered is still asked about', async () => {
    const seen = await reportId(SECOND, PACK);
    const fresh = await reportId(SECOND, { location_id: 'loc-wh300', symptom_key: 'aircon', known_duplicate_ids: [seen] });
    expect(await create(FIRST, { ...PACK, known_duplicate_ids: [seen] })).toEqual({ status: 409, body: { error: 'DUPLICATE_FOUND', current: { request_ids: [fresh] } } });
  });

  it('“อื่นๆ”, another area, a closed or completed request: no recheck refusal', async () => {
    await reportId(SECOND, { location_id: 'loc-wh300', symptom_key: 'other', description: 'ประตู' });
    await reportId(SECOND, { ...PACK, area_id: 'area-wh300-qa-1' });
    const done = await reportId(SECOND, PACK);
    expect((await act(GM, 'accept_request', { request_id: done, expected_revision: await revisionOf(done) })).status).toBe(200);
    expect((await act(GM, 'complete_request', { request_id: done, expected_revision: await revisionOf(done), resolution_summary: 'เสร็จ' })).status).toBe(200);
    expect((await create(FIRST, { location_id: 'loc-wh300', symptom_key: 'other', description: 'ประตูเหมือนกัน' })).status).toBe(200);
    expect((await create(FIRST, PACK)).status).toBe(200);
  });

  it('two people sending the same repair at the same moment: one request, the other is shown it', async () => {
    const [one, two] = await Promise.all([create(FIRST, PACK), create(SECOND, PACK)]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    expect(await count('requests')).toBe(1);
    const refused = one.status === 409 ? one : two;
    const created = one.status === 200 ? one : two;
    expect(refused.body).toEqual({ error: 'DUPLICATE_FOUND', current: { request_ids: [(created.body.result as { request_id: string }).request_id] } });
  });

  it('15 people at WH300 report the same aircon at the same moment (U1 example): one request, 14 are shown it', async () => {
    const people = [FIRST, SECOND, THIRD];
    const replies = await Promise.all(Array.from({ length: 15 }, (_, index) => create(people[index % people.length]!, PACK)));
    const created = replies.filter((reply) => reply.status === 200);
    expect(created).toHaveLength(1);
    const id = (created[0]!.body.result as { request_id: string }).request_id;
    for (const reply of replies.filter((candidate) => candidate.status !== 200)) {
      expect(reply).toEqual({ status: 409, body: { error: 'DUPLICATE_FOUND', current: { request_ids: [id] } } });
    }
    expect(await count('requests')).toBe(1);
    expect(await readDoc(harness.db, 'system_counters/request_sequence')).toMatchObject({ last_issued: 1 });
  });

  it('known_duplicate_ids is checked: not a list of IDs → 400', async () => {
    expect(await create(FIRST, { ...PACK, known_duplicate_ids: 'req-x' })).toMatchObject({ status: 400 });
  });
});

async function reportId(who: string, payload: Record<string, unknown>): Promise<string> {
  const reply = await create(who, payload);
  expect(reply.status).toBe(200);
  return (reply.body.result as { request_id: string }).request_id;
}
