// A11 — the Admin API on the emulators (Part 3 §13.1–13.4, Part 6 §6.4 “GM Admin แก้ผ่าน API”, FU-25,
// FU-30, D-S01-6, D-S08-3): only a GM Admin reads or changes places, QR codes, the company calendar,
// the reminder time and the system health; changes are commands with an idempotency key; areas and QR
// codes are closed, never deleted; a QR code is random and moves to another area without reprinting.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { isQrId } from '@gm/domain';
import { CommandRejected } from '../../apps/api/src/commands/index';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type ApiHarness, type LogCapture } from './support/api-harness';
import { TEST_MAX_ATTEMPTS, clearFirestore, readCollection, readDoc } from './support/firestore-client-store';

const NOW = Date.parse('2027-01-11T09:00:00+07:00');
const MIN = 60_000;
const APP_ORIGIN = 'https://gm-dev.tdfb.co';
const ADMIN = 'a11.gm.admin@tdfb.co';
const GM = 'a11.gm.staff@tdfb.co';
const EMPLOYEE = 'a11.employee@tdfb.co';
const VIEWER = 'a11.viewer@tdfb.co';
const ROLES: Readonly<Record<string, string>> = { [ADMIN]: 'gm_admin', [GM]: 'gm_staff', [EMPLOYEE]: 'requester', [VIEWER]: 'viewer' };

let harness: ApiHarness;
let logs: LogCapture;
let server: Server;
let baseUrl = '';
const tokens = new Map<string, string>();

async function call(who: string | undefined, method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = { origin: APP_ORIGIN };
  if (who !== undefined) headers.authorization = `Bearer ${tokens.get(who) ?? ''}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

const admin = (type: string, payload: Record<string, unknown> = {}, commandId = randomUUID(), who = ADMIN) =>
  call(who, 'POST', '/api/admin/commands', { command_id: commandId, type, payload });

interface PlacesBody {
  locations: { id: string; label: string; active: boolean; area_count: number; active_area_count: number }[];
  areas: { id: string; location_id: string; label: string; active: boolean; qr_id?: string }[];
  qr_codes: { id: string; location_id: string; area_id: string; active: boolean }[];
}
const places = async () => (await call(ADMIN, 'GET', '/api/admin/places')).body as unknown as PlacesBody;
const areaOf = async (id: string) => (await places()).areas.find((area) => area.id === id);

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
      newRequestId: () => 'req-a11-unused',
      maintenanceCatalog: { resolve: async () => Promise.reject(new CommandRejected('CATALOG_NOT_READY', 'unused')) },
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
    await harness.db.doc(`access/${signedIn.uid}`).set({ person_id: personId, role, enabled: true });
  }
});

describe('GM Admin only — checked by the API, not hidden by the page', () => {
  it.each([EMPLOYEE, VIEWER, GM])('%s: every Admin read and command → 403 GM_ADMIN_ONLY, nothing written', async (who) => {
    for (const path of ['/api/admin/places', '/api/admin/calendar', '/api/admin/health']) {
      expect(await call(who, 'GET', path)).toEqual({ status: 403, body: { error: 'GM_ADMIN_ONLY' } });
    }
    expect(await admin('seed_places', {}, randomUUID(), who)).toEqual({ status: 403, body: { error: 'GM_ADMIN_ONLY' } });
    expect(await admin('put_holiday', { date: '2027-01-15', name: 'x' }, randomUUID(), who)).toEqual({ status: 403, body: { error: 'GM_ADMIN_ONLY' } });
    expect((await readCollection(harness.db, 'locations')).size).toBe(0);
    expect(await readDoc(harness.db, 'calendars/company')).toBeUndefined();
  });

  it('no sign-in → 401', async () => {
    expect((await call(undefined, 'GET', '/api/admin/places')).status).toBe(401);
    expect((await call(undefined, 'POST', '/api/admin/commands', { command_id: randomUUID(), type: 'seed_places', payload: {} })).status).toBe(401);
  });

  it('a bad body is refused by the contract (400) before anything runs', async () => {
    expect(await call(ADMIN, 'POST', '/api/admin/commands', { command_id: randomUUID(), type: 'drop_everything', payload: {} })).toMatchObject({
      status: 400,
      body: { error: 'COMMAND_TYPE_UNKNOWN' },
    });
  });
});

describe('places: the seed of the brief, areas closed instead of deleted (§13.1, D-S08-3)', () => {
  it('seed: the five locations and WH300’s six areas; nothing else', async () => {
    expect(await admin('seed_places')).toMatchObject({ status: 200, body: { replayed: false } });
    const body = await places();
    expect(body.locations.map((location) => [location.id, location.label, location.active, location.area_count])).toEqual([
      ['loc-wh300', 'WH300', true, 6],
      ['loc-fac16', 'FAC16', true, 0],
      ['loc-fac17', 'FAC17', true, 0],
      ['loc-office195', 'Office 195', true, 0],
      ['loc-cafe222', 'Cafe 222', true, 0],
    ]);
    expect(body.areas.map((area) => area.label)).toEqual(['ห้องแพ็คชั้น 1', 'ห้อง QA ชั้น 1', 'ออฟฟิศชั้น 2', 'คลังสินค้าชั้น 3', 'คลังสินค้าชั้น 4', 'ห้องเก็บของชั้น 5']);
    expect(body.qr_codes).toEqual([]);
    expect(await readDoc(harness.db, 'areas/area-wh300-pack-1')).toMatchObject({ location_id: 'loc-wh300', label: 'ห้องแพ็คชั้น 1', active: true });
  });

  it('seed again (a new key) only fills what is missing: the Admin’s own edits stay', async () => {
    await admin('seed_places');
    await admin('rename_area', { area_id: 'area-wh300-qa-1', label: 'ห้อง QA ชั้น 1 (ฝั่งตะวันออก)' });
    await admin('set_location_active', { location_id: 'loc-cafe222', active: false });
    expect(await admin('seed_places')).toMatchObject({ status: 200, body: { replayed: false, result: { created: 0 } } });
    expect((await areaOf('area-wh300-qa-1'))?.label).toBe('ห้อง QA ชั้น 1 (ฝั่งตะวันออก)');
    expect((await places()).locations.find((location) => location.id === 'loc-cafe222')?.active).toBe(false);
  });

  it('the same key again is the same command: replayed, nothing twice', async () => {
    const key = randomUUID();
    await admin('seed_places');
    const first = await admin('add_area', { location_id: 'loc-fac16', label: 'ห้องประชุมใหญ่' }, key);
    const again = await admin('add_area', { location_id: 'loc-fac16', label: 'ห้องประชุมใหญ่' }, key);
    expect(first).toMatchObject({ status: 200, body: { replayed: false } });
    expect(again).toEqual({ status: 200, body: { replayed: true, result: (first.body as { result: unknown }).result } });
    expect((await places()).areas.filter((area) => area.location_id === 'loc-fac16')).toHaveLength(1);
    // The key with another payload is a conflict, not a second command.
    expect(await admin('add_area', { location_id: 'loc-fac16', label: 'ห้องอื่น' }, key)).toMatchObject({ status: 409, body: { error: 'COMMAND_ID_CONFLICT' } });
  });

  it('add an area to a location of the mock four; a taken name in the same location → 409 and the form keeps its values', async () => {
    await admin('seed_places');
    const added = await admin('add_area', { location_id: 'loc-fac17', label: '  ห้องเครื่องจักร  ชั้น 1 ' });
    expect(added.status).toBe(200);
    const areaId = (added.body.result as { area_id: string }).area_id;
    expect(await readDoc(harness.db, `areas/${areaId}`)).toMatchObject({ location_id: 'loc-fac17', label: 'ห้องเครื่องจักร ชั้น 1', active: true, created_at: NOW });
    expect(await admin('add_area', { location_id: 'loc-fac17', label: 'ห้องเครื่องจักร ชั้น 1' })).toEqual({ status: 409, body: { error: 'AREA_LABEL_TAKEN' } });
    expect(await admin('add_area', { location_id: 'loc-nowhere', label: 'x' })).toEqual({ status: 404, body: { error: 'LOCATION_NOT_FOUND' } });
    expect(await admin('add_area', { location_id: 'loc-fac17', label: '   ' })).toEqual({ status: 422, body: { error: 'LABEL_INVALID' } });
  });

  it('close an area: the document stays (old requests still read its name); open it again', async () => {
    await admin('seed_places');
    expect(await admin('set_area_active', { area_id: 'area-wh300-store-4', active: false })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, 'areas/area-wh300-store-4')).toMatchObject({ label: 'คลังสินค้าชั้น 4', active: false });
    const wh300 = (await places()).locations[0];
    expect(wh300).toMatchObject({ area_count: 6, active_area_count: 5 });
    expect(await admin('set_area_active', { area_id: 'area-wh300-store-4', active: true })).toMatchObject({ status: 200 });
    expect((await areaOf('area-wh300-store-4'))?.active).toBe(true);
    expect(await admin('set_area_active', { area_id: 'area-none', active: false })).toEqual({ status: 404, body: { error: 'AREA_NOT_FOUND' } });
  });

  it('a closed location takes no new area (D-S08-3), and opens again', async () => {
    await admin('seed_places');
    await admin('set_location_active', { location_id: 'loc-fac16', active: false });
    expect(await readDoc(harness.db, 'locations/loc-fac16')).toMatchObject({ label: 'FAC16', active: false });
    expect(await admin('add_area', { location_id: 'loc-fac16', label: 'ห้อง' })).toEqual({ status: 422, body: { error: 'LOCATION_INACTIVE' } });
    await admin('set_location_active', { location_id: 'loc-fac16', active: true });
    expect((await admin('add_area', { location_id: 'loc-fac16', label: 'ห้อง' })).status).toBe(200);
  });
});

describe('QR: one random code per area, moved without reprinting (§13.2, Part 6 §6.2)', () => {
  it('a code per area: 22 random URL-safe characters, unrelated to the area, never two for one area', async () => {
    await admin('seed_places');
    const codes: string[] = [];
    for (const area of ['area-wh300-pack-1', 'area-wh300-qa-1', 'area-wh300-office-2', 'area-wh300-store-3', 'area-wh300-store-4', 'area-wh300-storage-5']) {
      const created = await admin('create_qr', { area_id: area });
      expect(created.status).toBe(200);
      const qrId = (created.body.result as { qr_id: string }).qr_id;
      expect(isQrId(qrId)).toBe(true);
      expect(qrId.toLowerCase()).not.toContain('wh300');
      expect(await readDoc(harness.db, `qr_codes/${qrId}`)).toMatchObject({ location_id: 'loc-wh300', area_id: area, active: true, created_at: NOW });
      expect((await areaOf(area))?.qr_id).toBe(qrId);
      codes.push(qrId);
    }
    expect(new Set(codes).size).toBe(6);
    expect(await admin('create_qr', { area_id: 'area-wh300-pack-1' })).toEqual({ status: 409, body: { error: 'AREA_HAS_QR' } });
    expect((await places()).qr_codes).toHaveLength(6);
  });

  it('a closed area gets no new code', async () => {
    await admin('seed_places');
    await admin('set_area_active', { area_id: 'area-wh300-qa-1', active: false });
    expect(await admin('create_qr', { area_id: 'area-wh300-qa-1' })).toEqual({ status: 422, body: { error: 'AREA_INACTIVE' } });
  });

  it('move: the same code points at the new area; the old area is free for a new code', async () => {
    await admin('seed_places');
    const added = await admin('add_area', { location_id: 'loc-fac16', label: 'ห้องแพ็คใหม่' });
    const newArea = (added.body.result as { area_id: string }).area_id;
    const qrId = ((await admin('create_qr', { area_id: 'area-wh300-pack-1' })).body.result as { qr_id: string }).qr_id;
    expect(await admin('move_qr', { qr_id: qrId, area_id: newArea })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, `qr_codes/${qrId}`)).toMatchObject({ location_id: 'loc-fac16', area_id: newArea, active: true, updated_at: NOW });
    expect((await areaOf(newArea))?.qr_id).toBe(qrId);
    expect((await areaOf('area-wh300-pack-1'))?.qr_id).toBeUndefined();
    expect((await admin('create_qr', { area_id: 'area-wh300-pack-1' })).status).toBe(200);
  });

  it('move refused: onto an area that has a code, a closed area, the same area', async () => {
    await admin('seed_places');
    const first = ((await admin('create_qr', { area_id: 'area-wh300-pack-1' })).body.result as { qr_id: string }).qr_id;
    await admin('create_qr', { area_id: 'area-wh300-qa-1' });
    await admin('set_area_active', { area_id: 'area-wh300-office-2', active: false });
    expect(await admin('move_qr', { qr_id: first, area_id: 'area-wh300-qa-1' })).toEqual({ status: 409, body: { error: 'AREA_HAS_QR' } });
    expect(await admin('move_qr', { qr_id: first, area_id: 'area-wh300-office-2' })).toEqual({ status: 422, body: { error: 'AREA_INACTIVE' } });
    expect(await admin('move_qr', { qr_id: first, area_id: 'area-wh300-pack-1' })).toEqual({ status: 422, body: { error: 'QR_SAME_AREA' } });
    expect(await admin('move_qr', { qr_id: 'Zz1234567890abcdefghij', area_id: 'area-wh300-store-3' })).toEqual({ status: 404, body: { error: 'QR_NOT_FOUND' } });
    expect(await readDoc(harness.db, `qr_codes/${first}`)).toMatchObject({ area_id: 'area-wh300-pack-1' });
  });

  it('turn a code off and on: the document stays', async () => {
    await admin('seed_places');
    const qrId = ((await admin('create_qr', { area_id: 'area-wh300-pack-1' })).body.result as { qr_id: string }).qr_id;
    await admin('set_qr_active', { qr_id: qrId, active: false });
    expect(await readDoc(harness.db, `qr_codes/${qrId}`)).toMatchObject({ active: false, area_id: 'area-wh300-pack-1' });
    await admin('set_qr_active', { qr_id: qrId, active: true });
    expect((await places()).qr_codes[0]).toMatchObject({ id: qrId, active: true });
  });
});

interface CalendarBody {
  configured: boolean;
  revision?: number;
  timezone: string;
  open_weekdays: number[];
  holidays: { date: string; name?: string }[];
  working_morning_time: string;
  working_morning_time_is_default: boolean;
}
const calendar = async () => (await call(ADMIN, 'GET', '/api/admin/calendar')).body as unknown as CalendarBody;

describe('company calendar: open weekdays and holidays, stored as ค.ศ. (§13.4, D-S01-6)', () => {
  it('not set up yet: says so (new requests are refused until it is), reminder time is the default 09:00', async () => {
    expect(await calendar()).toEqual({ configured: false, timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays: [], working_morning_time: '09:00', working_morning_time_is_default: true });
  });

  it('the first holiday sets up the calendar Monday–Friday; holidays are sorted, with their names', async () => {
    expect(await admin('put_holiday', { date: '2027-01-01', name: 'วันขึ้นปีใหม่' })).toMatchObject({ status: 200 });
    expect(await admin('put_holiday', { date: '2026-12-31', name: 'วันสิ้นปี' })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, 'calendars/company')).toMatchObject({
      timezone: 'Asia/Bangkok',
      open_weekdays: [1, 2, 3, 4, 5],
      holidays: ['2026-12-31', '2027-01-01'],
      holiday_names: { '2026-12-31': 'วันสิ้นปี', '2027-01-01': 'วันขึ้นปีใหม่' },
      updated_at: NOW,
    });
    expect(await calendar()).toMatchObject({
      configured: true,
      holidays: [
        { date: '2026-12-31', name: 'วันสิ้นปี' },
        { date: '2027-01-01', name: 'วันขึ้นปีใหม่' },
      ],
    });
  });

  it('D-S01-6: a year typed as พ.ศ. (2570-01-01) is refused with a reason, never guessed; nothing is written', async () => {
    expect(await admin('put_holiday', { date: '2570-01-01', name: 'ปีใหม่' })).toEqual({ status: 422, body: { error: 'HOLIDAY_YEAR_OUT_OF_RANGE' } });
    expect(await readDoc(harness.db, 'calendars/company')).toBeUndefined();
  });

  it('the same date twice → 409 HOLIDAY_EXISTS; edit moves or renames it; remove takes it out', async () => {
    await admin('put_holiday', { date: '2027-04-13', name: 'สงกรานต์' });
    expect(await admin('put_holiday', { date: '2027-04-13', name: 'สงกรานต์ซ้ำ' })).toEqual({ status: 409, body: { error: 'HOLIDAY_EXISTS' } });
    expect(await admin('put_holiday', { date: '2027-04-14', name: 'สงกรานต์ (เลื่อน)', replaces: '2027-04-13' })).toMatchObject({ status: 200 });
    expect((await calendar()).holidays).toEqual([{ date: '2027-04-14', name: 'สงกรานต์ (เลื่อน)' }]);
    expect(await admin('put_holiday', { date: '2027-04-14', name: 'สงกรานต์', replaces: '2027-04-14' })).toMatchObject({ status: 200 });
    expect((await calendar()).holidays).toEqual([{ date: '2027-04-14', name: 'สงกรานต์' }]);
    expect(await admin('put_holiday', { date: '2027-05-01', name: 'x', replaces: '2027-01-09' })).toEqual({ status: 404, body: { error: 'HOLIDAY_NOT_FOUND' } });
    expect(await admin('remove_holiday', { date: '2027-04-14' })).toMatchObject({ status: 200 });
    expect((await calendar()).holidays).toEqual([]);
    expect(await admin('remove_holiday', { date: '2027-04-14' })).toEqual({ status: 404, body: { error: 'HOLIDAY_NOT_FOUND' } });
  });

  it('open weekdays: any distinct set of at least one day; the stored calendar stays usable', async () => {
    expect(await admin('set_open_weekdays', { open_weekdays: [6, 1, 2, 3, 4, 5] })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, 'calendars/company')).toMatchObject({ open_weekdays: [1, 2, 3, 4, 5, 6], holidays: [] });
    expect((await calendar()).open_weekdays).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('FU-30: the reminder time for a closed day is a setting (settings/notifications)', async () => {
    expect(await admin('set_reminder_time', { working_morning_time: '08:30' })).toMatchObject({ status: 200 });
    expect(await readDoc(harness.db, 'settings/notifications')).toMatchObject({ working_morning_time: '08:30', updated_at: NOW });
    expect(await calendar()).toMatchObject({ working_morning_time: '08:30', working_morning_time_is_default: false });
  });
});

describe('system health (FU-25)', () => {
  async function seedHealth(lastCompleted: number) {
    const batch = harness.db.batch();
    batch.set(harness.db.doc('scheduled_work/tick'), { last_started_at: lastCompleted - 2_000, last_completed_at: lastCompleted });
    batch.set(harness.db.doc('integration_state/slack_app'), { status: 'app_error', code: 'SLACK_INVALID_AUTH', since: NOW - 90 * MIN });
    const outbox = (id: string, data: Record<string, unknown>) =>
      batch.set(harness.db.doc(`outbox/${id}`), { request_id: 'req-x', recipient_id: 'a11.someone.private@tdfb.co', event_kind: 'request_created', next_attempt_at: NOW, ...data });
    outbox('o1', { state: 'failed', last_error_code: 'SLACK_CHANNEL_NOT_FOUND' });
    outbox('o2', { state: 'failed', last_error_code: 'NO_CHANNEL' });
    outbox('o3', { state: 'delivery_unknown', last_error_code: 'LEASE_EXPIRED' });
    outbox('o4', { state: 'pending', last_error_code: 'EMAIL_CAP_REACHED' });
    outbox('o5', { state: 'provider_accepted', delivery_channel: 'email', slack_fallback_code: 'SLACK_NOT_MAPPED' });
    outbox('o6', { state: 'provider_accepted', delivery_channel: 'email', slack_fallback_code: 'SLACK_NOT_MAPPED' });
    outbox('o7', { state: 'provider_accepted', delivery_channel: 'email', slack_fallback_code: 'SLACK_INVALID_AUTH' });
    outbox('o8', { state: 'provider_accepted' });
    batch.set(harness.db.doc('scheduled_work/presence_reset-2027-01-10'), { kind: 'presence_reset', state: 'failed', last_error_code: 'INTERNAL', attempts: 5, last_attempt_at: NOW - 600 * MIN, next_run_at: NOW - 600 * MIN });
    batch.set(harness.db.doc('scheduled_work/presence_reset-2027-01-11'), { kind: 'presence_reset', state: 'done', next_run_at: NOW - 60 * MIN });
    await batch.commit();
  }

  it('a late tick, the Slack app down and a failed job are red, with words; counts, never who', async () => {
    await seedHealth(NOW - 45 * MIN);
    const reply = await call(ADMIN, 'GET', '/api/admin/health');
    expect(reply.status).toBe(200);
    expect(reply.body).toEqual({
      level: 'red',
      checked_at: NOW,
      tick: { level: 'red', reason: 'TICK_LATE', last_started_at: NOW - 45 * MIN - 2_000, last_completed_at: NOW - 45 * MIN },
      slack_app: { level: 'red', code: 'SLACK_INVALID_AUTH', since: NOW - 90 * MIN },
      outbox: { failed: 2, delivery_unknown: 1, email_cap_pending: 1 },
      slack_fallback: { SLACK_NOT_MAPPED: 2, SLACK_INVALID_AUTH: 1 },
      failed_jobs: [{ id: 'presence_reset-2027-01-10', kind: 'presence_reset', code: 'INTERNAL', at: NOW - 600 * MIN }],
      failed_job_count: 1,
    });
    expect(JSON.stringify(reply.body)).not.toContain('private@tdfb.co');
  });

  it('a tick within 30 minutes and nothing failing → ok', async () => {
    await harness.db.doc('scheduled_work/tick').set({ last_started_at: NOW - 10 * MIN, last_completed_at: NOW - 10 * MIN + 1_000 });
    expect((await call(ADMIN, 'GET', '/api/admin/health')).body).toMatchObject({
      level: 'ok',
      tick: { level: 'ok' },
      slack_app: { level: 'ok' },
      outbox: { failed: 0, delivery_unknown: 0, email_cap_pending: 0 },
      slack_fallback: {},
      failed_jobs: [],
      failed_job_count: 0,
    });
  });

  it('no tick ever → red (TICK_NEVER_COMPLETED)', async () => {
    expect((await call(ADMIN, 'GET', '/api/admin/health')).body).toMatchObject({ level: 'red', tick: { level: 'red', reason: 'TICK_NEVER_COMPLETED' } });
  });
});

describe('logs and network', () => {
  it('the log has route, status and code only — no labels typed by the Admin', async () => {
    const before = logs.lines.length;
    await admin('seed_places');
    await admin('add_area', { location_id: 'loc-fac16', label: 'ห้องลับเฉพาะผู้ดูแล' });
    expect(logs.lines.slice(before).join('\n')).not.toContain('ห้องลับเฉพาะผู้ดูแล');
  });

  it('nothing left this machine', () => {
    expect(blockedHosts).toEqual([]);
  });
});
