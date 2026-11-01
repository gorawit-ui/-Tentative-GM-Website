// A13 — U1 “มีคนแจ้งเรื่องนี้แล้ว” on the emulators: GET /api/repair/duplicates finds the open, public
// repair requests that match the place + area + symptom chosen at step 3 (never the GM-editable title;
// “อื่นๆ” and confidential ones never; completed-awaiting-confirmation not, D-S08-7), with only the
// public summary fields and how the reader relates to each (their own report / already watching). A14
// calls the same API again when sending. Watching: one entry in `watcher_ids`, no new request or number,
// `watcher_count` + 1, one optional note kept in `gm_history` (GM only); pressing again changes nothing.
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
const GM = 'a13.gm@tdfb.co';
const FIRST = 'a13.first@tdfb.co';
const SECOND = 'a13.second@tdfb.co';
const THIRD = 'a13.third@tdfb.co';
const DISABLED = 'a13.disabled@tdfb.co';
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

async function report(who: string, payload: Record<string, unknown>): Promise<string> {
  const reply = await act(who, 'create_maintenance', payload);
  expect(reply.status).toBe(200);
  return (reply.body.result as { request_id: string }).request_id;
}

async function revisionOf(id: string): Promise<number> {
  return (await readDoc(harness.db, `requests/${id}`))?.revision as number;
}

const duplicates = (who: string | undefined, query: string) => call(who, 'GET', `/api/repair/duplicates?${query}`);
const matchIds = (reply: { body: Record<string, unknown> }) => ((reply.body.matches ?? []) as { request_id: string }[]).map((match) => match.request_id);

const PACK = { location_id: 'loc-wh300', area_id: 'area-wh300-pack-1', symptom_key: 'aircon' };
const PACK_QUERY = 'location_id=loc-wh300&area_id=area-wh300-pack-1&symptom_key=aircon';

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
      newRequestId: () => `req-a13-${String(++ids).padStart(4, '0')}`,
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

describe('GET /api/repair/duplicates — U1 matching after step 3', () => {
  it('an open repair at the same place + area + symptom: the public summary only, and how the reader relates to it', async () => {
    const id = await report(FIRST, { ...PACK, description: 'แอร์ไม่เย็น มีน้ำหยด' });
    const reply = await duplicates(SECOND, PACK_QUERY);
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({
      matches: [
        {
          request_id: id,
          request_number: expect.stringMatching(/^DEV-\d{4}$/),
          summary_title: 'แอร์ — ห้องแพ็คชั้น 1 · WH300',
          status: 'queued',
          is_assigned: true,
          assignee_label: `คุณ ${GM.split('@')[0]}`,
          location_label: 'WH300',
          area_label: 'ห้องแพ็คชั้น 1',
          watcher_count: 0,
          created_at: NOW,
          viewer: 'none',
        },
      ],
    });
    // Nothing private: no description, no requester or other person IDs.
    const text = JSON.stringify(reply.body);
    for (const secret of ['แอร์ไม่เย็น มีน้ำหยด', FIRST, GM, 'requester_id', 'watcher_ids']) expect(text).not.toContain(secret);
  });

  it('in_progress and waiting match too; completed waiting for confirmation (D-S08-7), closed or cancelled do not', async () => {
    const working = await report(FIRST, PACK);
    expect(await act(GM, 'accept_request', { request_id: working, expected_revision: await revisionOf(working) })).toMatchObject({ status: 200 });
    const waiting = await report(FIRST, PACK);
    expect(await act(GM, 'accept_request', { request_id: waiting, expected_revision: await revisionOf(waiting) })).toMatchObject({ status: 200 });
    expect(await act(GM, 'enter_waiting', { request_id: waiting, expected_revision: await revisionOf(waiting), waiting_on: { kind: 'contractor', name: 'ช่างแอร์' } })).toMatchObject({ status: 200 });
    const done = await report(FIRST, PACK);
    expect(await act(GM, 'accept_request', { request_id: done, expected_revision: await revisionOf(done) })).toMatchObject({ status: 200 });
    expect(await act(GM, 'complete_request', { request_id: done, expected_revision: await revisionOf(done), resolution_summary: 'เติมน้ำยาแล้ว' })).toMatchObject({ status: 200 });
    const cancelled = await report(FIRST, PACK);
    expect(await act(GM, 'cancel_request', { request_id: cancelled, expected_revision: await revisionOf(cancelled), reason: 'แจ้งซ้ำ' })).toMatchObject({ status: 200 });
    const reply = await duplicates(SECOND, PACK_QUERY);
    expect(matchIds(reply).sort()).toEqual([waiting, working].sort());
    const statuses = (reply.body.matches as { request_id: string; status: string }[]).map((match) => [match.request_id, match.status]);
    expect(statuses).toEqual(expect.arrayContaining([[working, 'in_progress'], [waiting, 'waiting']]));
  });

  it('a confidential request is never offered (repairs cannot be flagged, D-S04-5; checked on the record anyway)', async () => {
    const secret = await report(FIRST, PACK);
    expect(await act(GM, 'mark_confidential', { request_id: secret, expected_revision: await revisionOf(secret), sensitivity_reason: 'personnel', keep_related_person_ids: [] })).toMatchObject({
      status: 422,
      body: { error: 'MAINTENANCE_NOT_CONFIDENTIAL' },
    });
    // A record that says confidential (whatever made it so) is left out, and nothing about it is said.
    await harness.db.doc(`requests/${secret}`).update({ is_confidential: true });
    expect(await duplicates(SECOND, PACK_QUERY)).toEqual({ status: 200, body: { matches: [] } });
  });

  it('“อื่นๆ” is never matched', async () => {
    await report(FIRST, { ...PACK, symptom_key: 'other', description: 'ประตูฝืด' });
    expect(await duplicates(SECOND, 'location_id=loc-wh300&area_id=area-wh300-pack-1&symptom_key=other')).toEqual({ status: 200, body: { matches: [] } });
  });

  it('areas given and different → not offered; “ไม่ระบุ” on either side → same place + symptom offered; another symptom or place never', async () => {
    const qa = await report(FIRST, { ...PACK, area_id: 'area-wh300-qa-1' });
    const noArea = await report(FIRST, { location_id: 'loc-wh300', symptom_key: 'aircon' });
    await report(FIRST, { ...PACK, symptom_key: 'light_bulb' });
    await report(FIRST, { location_id: 'loc-fac16', symptom_key: 'aircon' });
    expect(matchIds(await duplicates(SECOND, PACK_QUERY))).toEqual([noArea]);
    expect(matchIds(await duplicates(SECOND, 'location_id=loc-wh300&symptom_key=aircon')).sort()).toEqual([noArea, qa].sort());
  });

  it('the requester of a match sees it as their own; someone already watching sees that', async () => {
    const id = await report(FIRST, PACK);
    expect(await act(SECOND, 'watch_request', { request_id: id })).toMatchObject({ status: 200 });
    const viewerOf = async (who: string) => ((await duplicates(who, PACK_QUERY)).body.matches as { viewer: string }[])[0]?.viewer;
    expect(await viewerOf(FIRST)).toBe('requester');
    expect(await viewerOf(SECOND)).toBe('watcher');
    expect(await viewerOf(THIRD)).toBe('none');
  });

  it('a request a GM opened on behalf of someone counts as that person’s own report', async () => {
    const reply = await act(GM, 'create_on_behalf', { requester: { person_id: FIRST }, details: { type: 'maintenance', ...PACK } });
    expect(reply.status).toBe(200);
    expect(((await duplicates(FIRST, PACK_QUERY)).body.matches as { viewer: string }[])[0]?.viewer).toBe('requester');
    expect(((await duplicates(GM, PACK_QUERY)).body.matches as { viewer: string }[])[0]?.viewer).toBe('none');
  });

  it('sign-in needed; an account switched off is refused; place and a known symptom are required', async () => {
    expect(await duplicates(undefined, PACK_QUERY)).toMatchObject({ status: 401 });
    expect(await duplicates(DISABLED, PACK_QUERY)).toEqual({ status: 403, body: { error: 'ACCOUNT_DISABLED' } });
    expect(await duplicates(SECOND, 'symptom_key=aircon')).toEqual({ status: 400, body: { error: 'QUERY_INVALID' } });
    expect(await duplicates(SECOND, 'location_id=loc-wh300')).toEqual({ status: 400, body: { error: 'QUERY_INVALID' } });
    expect(await duplicates(SECOND, 'location_id=loc-wh300&symptom_key=flying_car')).toEqual({ status: 400, body: { error: 'QUERY_INVALID' } });
  });
});

describe('watch_request from the interstitial — U1 “ใช่ เรื่องเดียวกัน — ติดตามเรื่องนี้”', () => {
  it('adds the reader to watcher_ids once: no new request, no number used, watcher_count + 1, the one note kept for GM only', async () => {
    const id = await report(FIRST, PACK);
    const requestsBefore = (await readCollection(harness.db, 'requests')).size;
    const counterBefore = await readDoc(harness.db, 'system_counters/request_sequence');
    const reply = await act(SECOND, 'watch_request', { request_id: id, note: '  แอร์ห้องแพ็คมีน้ำหยดใส่โต๊ะด้วย  ' });
    expect(reply).toMatchObject({ status: 200, body: { result: { request_id: id, watch: 'added' } } });
    expect((await readCollection(harness.db, 'requests')).size).toBe(requestsBefore);
    expect(await readDoc(harness.db, 'system_counters/request_sequence')).toEqual(counterBefore);
    expect(await readDoc(harness.db, `gm_request_details/${id}`)).toMatchObject({ watcher_ids: [SECOND] });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ watcher_count: 1 });
    expect(await readDoc(harness.db, `gm_request_summaries/${id}`)).toMatchObject({ watcher_count: 1 });
    const contributions = [...(await readCollection(harness.db, `requests/${id}/gm_history`)).values()];
    expect(contributions).toEqual([{ kind: 'watcher_contribution', actor_id: SECOND, note: 'แอร์ห้องแพ็คมีน้ำหยดใส่โต๊ะด้วย', photo_count: 0, created_at: NOW }]);
    // Not in the history the requester and related people read.
    const history = [...(await readCollection(harness.db, `requests/${id}/history`)).values()];
    expect(JSON.stringify(history)).not.toContain('แอร์ห้องแพ็คมีน้ำหยด');
  });

  it('pressing again (with another note) adds nothing: the count stays 1 and the first note is kept', async () => {
    const id = await report(FIRST, PACK);
    expect(await act(SECOND, 'watch_request', { request_id: id, note: 'ครั้งแรก' })).toMatchObject({ status: 200 });
    expect(await act(SECOND, 'watch_request', { request_id: id, note: 'ครั้งที่สอง' })).toMatchObject({ status: 200, body: { result: { watch: 'already_watching' } } });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ watcher_count: 1 });
    expect(await readDoc(harness.db, `gm_request_details/${id}`)).toMatchObject({ watcher_ids: [SECOND] });
    const notes = [...(await readCollection(harness.db, `requests/${id}/gm_history`)).values()].map((entry) => entry.note);
    expect(notes).toEqual(['ครั้งแรก']);
  });

  it('a watch without a note writes no contribution; a blank note counts as none', async () => {
    const id = await report(FIRST, PACK);
    expect(await act(SECOND, 'watch_request', { request_id: id, note: '   ' })).toMatchObject({ status: 200, body: { result: { watch: 'added' } } });
    expect((await readCollection(harness.db, `requests/${id}/gm_history`)).size).toBe(0);
  });

  it('the requester pressing it is told it is theirs; nothing is written', async () => {
    const id = await report(FIRST, PACK);
    expect(await act(FIRST, 'watch_request', { request_id: id, note: 'ของฉันเอง' })).toMatchObject({ status: 200, body: { result: { watch: 'is_requester' } } });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ watcher_count: 0 });
    expect((await readCollection(harness.db, `requests/${id}/gm_history`)).size).toBe(0);
  });

  it('a note over 1,000 characters is refused and nothing is written', async () => {
    const id = await report(FIRST, PACK);
    expect(await act(SECOND, 'watch_request', { request_id: id, note: 'ก'.repeat(1001) })).toMatchObject({ status: 422, body: { error: 'NOTE_TOO_LONG' } });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ watcher_count: 0 });
  });

  it('completed waiting for confirmation cannot be watched (D-S08-7)', async () => {
    const id = await report(FIRST, PACK);
    expect(await act(GM, 'accept_request', { request_id: id, expected_revision: await revisionOf(id) })).toMatchObject({ status: 200 });
    expect(await act(GM, 'complete_request', { request_id: id, expected_revision: await revisionOf(id), resolution_summary: 'เสร็จ' })).toMatchObject({ status: 200 });
    expect(await act(SECOND, 'watch_request', { request_id: id })).toMatchObject({ status: 422, body: { error: 'WATCH_NOT_OPEN' } });
  });
});
