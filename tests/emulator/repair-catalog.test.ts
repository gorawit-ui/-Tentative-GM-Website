// A12 — what the repair form reads, on the emulators (UI-03 steps 1–3, F01, FU-19, FU-21, FU-43,
// Part 6 §6.4 “ก่อน login คืนเพียง safe QR context ผ่าน API”): the active places (with the ones the Admin
// added), the areas of each and the brief's symptoms; whether the system is set up enough to take a
// request; what a scanned QR points at (or why it cannot be used) — for a signed-in company account
// only, nothing before login; and the create command checks the place, area and symptom against the
// same data (the catalog of the API is no longer “not ready”).
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAINTENANCE_SYMPTOMS } from '@gm/domain';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { firestoreMaintenanceCatalog } from '../../apps/api/src/firestore/catalog';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type ApiHarness, type LogCapture } from './support/api-harness';
import { TEST_MAX_ATTEMPTS, clearFirestore, readDoc } from './support/firestore-client-store';

const NOW = Date.parse('2027-01-11T09:00:00+07:00');
const APP_ORIGIN = 'https://gm-dev.tdfb.co';
const GM = 'a12.gm@tdfb.co';
const EMPLOYEE = 'a12.employee@tdfb.co';
const VIEWER = 'a12.viewer@tdfb.co';
const DISABLED = 'a12.disabled@tdfb.co';
const ROLES: Readonly<Record<string, string>> = { [GM]: 'gm_staff', [EMPLOYEE]: 'requester', [VIEWER]: 'viewer', [DISABLED]: 'requester' };
const QR_OK = 'A12QrPackOneActive0001';
const QR_OFF = 'A12QrSwitchedOff000001';
const QR_AREA_OFF = 'A12QrAreaClosed0000001';
const QR_PLACE_OFF = 'A12QrPlaceClosed000001';
const QR_UNKNOWN = 'A12QrNeverIssued000001';

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

const report = (payload: Record<string, unknown>) => call(EMPLOYEE, 'POST', '/api/commands', { command_id: randomUUID(), type: 'create_maintenance', payload });

/** The places of A11 (one of them added later by the Admin, one closed), their areas and QR codes. */
async function seedPlaces(): Promise<void> {
  const batch = harness.db.batch();
  batch.set(harness.db.doc('locations/loc-wh300'), { label: 'WH300', active: true, order: 1 });
  batch.set(harness.db.doc('locations/loc-fac16'), { label: 'FAC16', active: true, order: 2 });
  batch.set(harness.db.doc('locations/loc-closed'), { label: 'คลังเก่า (ปิดแล้ว)', active: false, order: 3 });
  batch.set(harness.db.doc('locations/loc-a12new'), { label: 'คลังสินค้า บางนา', active: true, order: 6 });
  batch.set(harness.db.doc('areas/area-wh300-pack-1'), { location_id: 'loc-wh300', label: 'ห้องแพ็คชั้น 1', active: true, order: 1, qr_id: QR_OK });
  batch.set(harness.db.doc('areas/area-wh300-qa-1'), { location_id: 'loc-wh300', label: 'ห้อง QA ชั้น 1', active: true, order: 2 });
  batch.set(harness.db.doc('areas/area-wh300-old'), { location_id: 'loc-wh300', label: 'ห้องเก่า', active: false, order: 3, qr_id: QR_AREA_OFF });
  batch.set(harness.db.doc('areas/area-closed-1'), { location_id: 'loc-closed', label: 'ชั้น 1', active: true, order: 1, qr_id: QR_PLACE_OFF });
  batch.set(harness.db.doc(`qr_codes/${QR_OK}`), { location_id: 'loc-wh300', area_id: 'area-wh300-pack-1', active: true });
  batch.set(harness.db.doc(`qr_codes/${QR_OFF}`), { location_id: 'loc-wh300', area_id: 'area-wh300-qa-1', active: false });
  batch.set(harness.db.doc(`qr_codes/${QR_AREA_OFF}`), { location_id: 'loc-wh300', area_id: 'area-wh300-old', active: true });
  batch.set(harness.db.doc(`qr_codes/${QR_PLACE_OFF}`), { location_id: 'loc-closed', area_id: 'area-closed-1', active: true });
  batch.set(harness.db.doc('settings/routing'), { default_owner_by_type: { maintenance: GM } });
  batch.set(harness.db.doc('calendars/company'), { timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays: [] });
  for (const [personId, role] of Object.entries(ROLES)) batch.set(harness.db.doc(`people/${personId}`), { email: personId, name: `คุณ ${role}`, role, active: personId !== DISABLED });
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
      newRequestId: () => `req-a12-${String(++ids).padStart(4, '0')}`,
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
  await seedPlaces();
});

describe('GET /api/repair/options — steps 1–3 of the form', () => {
  it('active places in the Admin’s order (one added later included, a closed one not), their active areas, the brief’s symptoms', async () => {
    const reply = await call(EMPLOYEE, 'GET', '/api/repair/options');
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({
      locations: [
        { id: 'loc-wh300', label: 'WH300' },
        { id: 'loc-fac16', label: 'FAC16' },
        { id: 'loc-a12new', label: 'คลังสินค้า บางนา' },
      ],
      areas: [
        { id: 'area-wh300-pack-1', location_id: 'loc-wh300', label: 'ห้องแพ็คชั้น 1' },
        { id: 'area-wh300-qa-1', location_id: 'loc-wh300', label: 'ห้อง QA ชั้น 1' },
      ],
      symptoms: MAINTENANCE_SYMPTOMS.map(({ key, label }) => ({ key, label })),
    });
    // Nothing but labels: no QR codes, no orders or other fields.
    expect(JSON.stringify(reply.body)).not.toContain(QR_OK);
  });

  it('every role may report a repair (D-S04-6): a Viewer reads the options too', async () => {
    expect((await call(VIEWER, 'GET', '/api/repair/options')).status).toBe(200);
    expect((await call(GM, 'GET', '/api/repair/options')).status).toBe(200);
  });

  it('no sign-in → 401; an account switched off → 403', async () => {
    expect(await call(undefined, 'GET', '/api/repair/options')).toMatchObject({ status: 401 });
    expect(await call(DISABLED, 'GET', '/api/repair/options')).toEqual({ status: 403, body: { error: 'ACCOUNT_DISABLED' } });
  });

  it.each([
    ['no place is set up yet', async () => {
      for (const id of ['loc-wh300', 'loc-fac16', 'loc-closed', 'loc-a12new']) await harness.db.doc(`locations/${id}`).delete();
    }, 'PLACES_NOT_SET_UP'],
    ['every place is closed', async () => {
      for (const id of ['loc-wh300', 'loc-fac16', 'loc-a12new']) await harness.db.doc(`locations/${id}`).update({ active: false });
    }, 'PLACES_NOT_SET_UP'],
    ['no routing settings (D-A01-2)', async () => {
      await harness.db.doc('settings/routing').delete();
    }, 'ROUTING_NOT_CONFIGURED'],
    ['no company calendar (D-A01-2)', async () => {
      await harness.db.doc('calendars/company').delete();
    }, 'CALENDAR_NOT_CONFIGURED'],
  ] as const)('FU-21: %s → 503 with the reason, so the page says so in Thai with the GM contact', async (_case, change, code) => {
    await change();
    expect(await call(EMPLOYEE, 'GET', '/api/repair/options')).toEqual({ status: 503, body: { error: code } });
  });
});

describe('GET /api/repair/qr/:qr_id — what a scanned code points at (FU-43)', () => {
  it('a working code: its place and area, as IDs the form already has from the options', async () => {
    expect(await call(EMPLOYEE, 'GET', `/api/repair/qr/${QR_OK}`)).toEqual({ status: 200, body: { state: 'ok', location_id: 'loc-wh300', area_id: 'area-wh300-pack-1' } });
  });

  it.each([
    [QR_UNKNOWN, 'not_found'],
    ['qr-not-a-real-code', 'not_found'],
    [QR_OFF, 'qr_inactive'],
    [QR_AREA_OFF, 'area_inactive'],
    [QR_PLACE_OFF, 'location_inactive'],
  ])('%s → %s (the page says what happened and the person picks the place)', async (qrId, state) => {
    const reply = await call(EMPLOYEE, 'GET', `/api/repair/qr/${qrId}`);
    expect(reply).toMatchObject({ status: 200, body: { state } });
    // A code that cannot be used fills in nothing (F01).
    expect(reply.body).not.toHaveProperty('area_id');
  });

  it('an area closed: the place is still offered when it is open (the person chooses the area again)', async () => {
    expect((await call(EMPLOYEE, 'GET', `/api/repair/qr/${QR_AREA_OFF}`)).body).toEqual({ state: 'area_inactive', location_id: 'loc-wh300' });
  });

  it('before login nothing is told about a code — not even whether it exists (Part 6 §6.4)', async () => {
    for (const qrId of [QR_OK, QR_UNKNOWN, QR_OFF]) expect(await call(undefined, 'GET', `/api/repair/qr/${qrId}`)).toMatchObject({ status: 401 });
  });

  it('reading a code changes nothing and creates no request (UI-12 §13.2)', async () => {
    await call(EMPLOYEE, 'GET', `/api/repair/qr/${QR_OK}`);
    expect(await readDoc(harness.db, 'system_counters/request_sequence')).toBeUndefined();
  });
});

describe('FU-19: the create command reads the same places and symptoms (no more CATALOG_NOT_READY)', () => {
  it('place + area + symptom → the U2 title from their labels', async () => {
    const reply = await report({ location_id: 'loc-wh300', area_id: 'area-wh300-pack-1', symptom_key: 'aircon' });
    expect(reply.status).toBe(200);
    const id = (reply.body.result as { request_id: string }).request_id;
    expect(await readDoc(harness.db, `requests/${id}`)).toMatchObject({
      summary_title: 'แอร์ — ห้องแพ็คชั้น 1 · WH300',
      location_id: 'loc-wh300',
      area_id: 'area-wh300-pack-1',
      symptom_key: 'aircon',
      assignee_id: GM,
    });
  });

  it('“ไม่ระบุ” area → “[อาการ] · [สถานที่]”; a place the Admin added works at once', async () => {
    const reply = await report({ location_id: 'loc-a12new', symptom_key: 'internet' });
    const id = (reply.body.result as { request_id: string }).request_id;
    expect(await readDoc(harness.db, `requests/${id}`)).toMatchObject({ summary_title: 'อินเทอร์เน็ต · คลังสินค้า บางนา' });
  });

  it('“อื่นๆ” is a symptom like the others in the title (its description stays private, U2)', async () => {
    const reply = await report({ location_id: 'loc-fac16', symptom_key: 'other', description: 'ประตูหนีไฟปิดไม่สนิท' });
    const id = (reply.body.result as { request_id: string }).request_id;
    expect(await readDoc(harness.db, `requests/${id}`)).toMatchObject({ summary_title: 'อื่นๆ · FAC16' });
  });

  it.each([
    [{ location_id: 'loc-nowhere', symptom_key: 'aircon' }, 'LOCATION_UNAVAILABLE'],
    [{ location_id: 'loc-closed', symptom_key: 'aircon' }, 'LOCATION_UNAVAILABLE'],
    [{ location_id: 'loc-wh300', area_id: 'area-wh300-old', symptom_key: 'aircon' }, 'AREA_UNAVAILABLE'],
    [{ location_id: 'loc-fac16', area_id: 'area-wh300-pack-1', symptom_key: 'aircon' }, 'AREA_UNAVAILABLE'],
    [{ location_id: 'loc-wh300', area_id: 'area-nowhere', symptom_key: 'aircon' }, 'AREA_UNAVAILABLE'],
    [{ location_id: 'loc-wh300', symptom_key: 'ice_machine' }, 'SYMPTOM_UNKNOWN'],
  ])('%o → 422 %s, nothing written', async (payload, code) => {
    expect(await report(payload)).toEqual({ status: 422, body: { error: code } });
    expect(await readDoc(harness.db, 'system_counters/request_sequence')).toBeUndefined();
  });
});

describe('logs and network (runs last)', () => {
  it('the log has route, status and code only — no QR code, place or typed text', () => {
    const logged = logs.lines.join('\n');
    for (const secret of [QR_OK, 'ประตูหนีไฟ', 'คลังสินค้า บางนา']) expect(logged).not.toContain(secret);
  });

  it('nothing left the machine', () => {
    expect(blockedHosts).toEqual([]);
  });
});
