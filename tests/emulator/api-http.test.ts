// A01 — the API over HTTP on the emulators: auth on every request (ID token + fresh access/{uid}),
// create commands persisted in ONE transaction (request, three projections, counter, command
// record, history, user_state, outbox), outbox only records who to tell (no Slack/email, never the
// actor, D-S08-2), retries with the same command_id give the same result without a second outbox
// entry, CORS only for the app's origins, and HTTP logs without personal data. Emulators only.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommandRejected, type CommandStore, type MaintenanceCatalog } from '../../apps/api/src/commands/index';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler, type HttpDeps, type TaskQueue } from '../../apps/api/src/http/app';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type ApiHarness, type LogCapture } from './support/api-harness';
import { clearFirestore, readCollection, readDoc } from './support/firestore-client-store';

const NOW = Date.parse('2026-12-28T09:00:00+07:00');
const APP_ORIGIN = 'https://gm-dev.tdfb.co';

// Synthetic people (D-S08-4 person IDs); names are what must never reach a log.
const GM1 = 'a01.gm.one@tdfb.co';
const GM2 = 'a01.gm.two@tdfb.co';
const GM_ADMIN = 'a01.gm.admin@tdfb.co';
const EMPLOYEE = 'a01.employee@tdfb.co';
const COLLEAGUE = 'a01.colleague@tdfb.co';
const DISABLED = 'a01.disabled@tdfb.co';
const OUTSIDER = 'a01.outsider@gmail.com';
const NAMES: Readonly<Record<string, string>> = {
  [GM1]: 'คุณจีเอ็ม หนึ่ง',
  [GM2]: 'คุณจีเอ็ม สอง',
  [GM_ADMIN]: 'คุณจีเอ็ม แอดมิน',
  [EMPLOYEE]: 'คุณพนักงาน เอ',
  [COLLEAGUE]: 'คุณเพื่อน ร่วมงาน',
};
const TYPED_DETAIL = 'เน็ตล่มทั้งอาคาร โต๊ะของคุณพนักงาน เอ';

/** Synthetic catalog standing in for locations/areas/symptoms (A11/A12). */
const CATALOG: MaintenanceCatalog = {
  async resolve(_tx, selection) {
    if (selection.location_id !== 'loc-fac16' || selection.symptom_key !== 'internet_down') throw new CommandRejected('CATALOG_UNKNOWN', 'unknown');
    return { location: { id: 'loc-fac16', label: 'FAC16' }, symptom: { key: 'internet_down', label: 'อินเทอร์เน็ตใช้ไม่ได้' } };
  },
};

let harness: ApiHarness;
let logs: LogCapture;
const tokens = new Map<string, string>();
const uids = new Map<string, string>();
const queued: string[][] = [];
const okQueue: TaskQueue = { enqueue: async (ids) => void queued.push([...ids]) };
let ids = 0;

interface Running {
  readonly url: string;
  close(): Promise<void>;
}
const servers: Running[] = [];

async function start(overrides: Partial<HttpDeps> = {}): Promise<Running> {
  const deps: HttpDeps = {
    api: harness.deps,
    commandStore: adminCommandStore(harness.db, { maxAttempts: 20 }),
    environment: 'dev',
    allowedOrigins: [APP_ORIGIN],
    newRequestId: () => `req-a01-${String(++ids).padStart(4, '0')}`,
    maintenanceCatalog: CATALOG,
    peopleDirectory: transactionPeopleDirectory(),
    routingDirectory: transactionRoutingDirectory(),
    taskQueue: okQueue,
    ...overrides,
  };
  const server: Server = createServer(createApiHandler(deps));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const running = { url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
  servers.push(running);
  return running;
}

let api: Running;

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; rawBody?: string; origin?: string; headers?: Record<string, string>; server?: Running } = {},
): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const headers: Record<string, string> = { ...options.headers };
  if (options.token !== undefined) headers.authorization = `Bearer ${options.token}`;
  if (options.origin !== undefined) headers.origin = options.origin;
  if (options.body !== undefined || options.rawBody !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${(options.server ?? api).url}${path}`, {
    method,
    headers,
    ...(options.rawBody !== undefined ? { body: options.rawBody } : options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>), headers: response.headers };
}

const maintenance = (commandId = randomUUID()) => ({
  command_id: commandId,
  type: 'create_maintenance',
  payload: { location_id: 'loc-fac16', symptom_key: 'internet_down', description: TYPED_DETAIL },
});
const gmTask = (extra: Record<string, unknown> = {}, commandId = randomUUID()) => ({
  command_id: commandId,
  type: 'create_gm_task',
  payload: { summary_title: 'ต่อสัญญาเช่ารถส่งของ', category: 'documents_admin', sensitivity_subject: 'general', ...extra },
});
const onBehalf = (requester: string, type: 'maintenance' | 'document_request' = 'document_request') => ({
  command_id: randomUUID(),
  type: 'create_on_behalf',
  payload: {
    requester: { person_id: requester },
    details:
      type === 'maintenance'
        ? { type: 'maintenance', location_id: 'loc-fac16', symptom_key: 'internet_down' }
        : { type: 'document_request', summary_title: 'ขอหนังสือรับรองการทำงาน', sensitivity_subject: 'general' },
  },
});

async function outboxEntries(): Promise<Record<string, unknown>[]> {
  return [...(await readCollection(harness.db, 'outbox')).values()] as Record<string, unknown>[];
}
async function outboxFor(requestId: string): Promise<Record<string, unknown>[]> {
  return (await outboxEntries()).filter((entry) => entry.request_id === requestId);
}

async function seedDirectory(): Promise<void> {
  const batch = harness.db.batch();
  for (const [personId, name] of Object.entries(NAMES)) batch.set(harness.db.doc(`people/${personId}`), { name, email: personId, active: true });
  batch.set(harness.db.doc('settings/routing'), {
    default_owner_by_type: { maintenance: GM1, document_request: GM2, document_intake: GM2 },
    gm_person_ids: [GM1, GM2, GM_ADMIN],
  });
  for (const gm of [GM1, GM2, GM_ADMIN]) batch.set(harness.db.doc(`gm_profiles/${gm}`), { presence_status: { kind: 'unspecified' } });
  batch.set(harness.db.doc('calendars/company'), { timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays: ['2026-12-31', '2027-01-01'] });
  await batch.commit();
}

async function signInAll(): Promise<void> {
  const roles: Record<string, string> = { [GM1]: 'gm_staff', [GM2]: 'gm_staff', [GM_ADMIN]: 'gm_admin', [EMPLOYEE]: 'requester', [COLLEAGUE]: 'requester', [DISABLED]: 'requester', [OUTSIDER]: 'requester' };
  for (const [personId, role] of Object.entries(roles)) {
    const signedIn = await harness.signIn(personId);
    tokens.set(personId, signedIn.idToken);
    uids.set(personId, signedIn.uid);
    await harness.db.doc(`access/${signedIn.uid}`).set({ person_id: personId, role, enabled: personId !== DISABLED });
  }
}

beforeAll(async () => {
  logs = captureLogs();
  harness = apiHarness(NOW);
  await clearFirestore();
  await clearAuth();
  await seedDirectory();
  await signInAll();
  api = await start();
});

afterAll(async () => {
  logs?.stop();
  for (const server of servers) await server.close();
  await harness?.close();
});

describe('every request is authenticated: ID token + access/{uid} read fresh', () => {
  it('no token → 401; a broken token → 401; outside account → 403; disabled → 403', async () => {
    expect(await call('POST', '/api/commands', { body: gmTask() })).toMatchObject({ status: 401, body: { error: 'UNAUTHENTICATED' } });
    expect(await call('POST', '/api/commands', { token: 'garbage', body: gmTask() })).toMatchObject({ status: 401, body: { error: 'TOKEN_INVALID' } });
    expect(await call('POST', '/api/commands', { token: tokens.get(OUTSIDER), body: gmTask() })).toMatchObject({ status: 403, body: { error: 'NOT_CORPORATE' } });
    expect(await call('POST', '/api/commands', { token: tokens.get(DISABLED), body: gmTask() })).toMatchObject({ status: 403, body: { error: 'ACCOUNT_DISABLED' } });
  });

  it('an account disabled mid-session is refused on the very next request', async () => {
    const person = 'a01.midway@tdfb.co';
    const signedIn = await harness.signIn(person);
    tokens.set(person, signedIn.idToken);
    await harness.db.doc(`access/${signedIn.uid}`).set({ person_id: person, role: 'gm_staff', enabled: true });
    expect((await call('GET', '/api/me/awaiting-confirmation', { token: signedIn.idToken })).status).toBe(200);
    await harness.db.doc(`access/${signedIn.uid}`).update({ enabled: false });
    expect(await call('GET', '/api/me/awaiting-confirmation', { token: signedIn.idToken })).toMatchObject({ status: 403, body: { error: 'ACCOUNT_DISABLED' } });
    expect(await call('POST', '/api/commands', { token: signedIn.idToken, body: gmTask() })).toMatchObject({ status: 403, body: { error: 'ACCOUNT_DISABLED' } });
  });

  it('D-S10-5: an upper-case sign-in e-mail is the same corporate domain', async () => {
    const signedIn = await harness.signIn('A01.Upper@TDFB.CO');
    tokens.set('upper', signedIn.idToken);
    await harness.db.doc(`access/${signedIn.uid}`).set({ person_id: 'a01.upper@tdfb.co', role: 'requester', enabled: true });
    expect((await call('GET', '/api/me/awaiting-confirmation', { token: signedIn.idToken })).status).toBe(200);
  });

  it('the role comes from access/{uid}: a requester cannot create a GM task', async () => {
    expect(await call('POST', '/api/commands', { token: tokens.get(EMPLOYEE), body: gmTask() })).toMatchObject({ status: 403, body: { error: 'GM_ONLY' } });
  });
});

describe('create: one transaction writes the request, its projections, counter, command, history, user_state and outbox', () => {
  it('an employee reports a repair: every layer is written together; the default owner is told, not the reporter', async () => {
    queued.length = 0;
    const response = await call('POST', '/api/commands', { token: tokens.get(EMPLOYEE), body: maintenance(), origin: APP_ORIGIN });
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    const result = response.body.result as { request_id: string; request_number: string };
    expect(response.body.replayed).toBe(false);
    expect(result.request_number).toMatch(/^DEV-\d{4}$/);
    const id = result.request_id;
    expect(await readDoc(harness.db, `requests/${id}`)).toMatchObject({
      status: 'queued',
      requester_id: EMPLOYEE,
      assignee_id: GM1,
      description: TYPED_DETAIL,
      created_at: NOW,
      last_updated_at: NOW,
      requester_display: { person_id: EMPLOYEE, display_name: NAMES[EMPLOYEE] },
      assignee_display: { person_id: GM1, display_name: NAMES[GM1] },
    });
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toMatchObject({ request_id: id, status: 'queued', assignee_label: NAMES[GM1] });
    expect(JSON.stringify(await readDoc(harness.db, `request_summaries/${id}`))).not.toContain(TYPED_DETAIL);
    expect(await readDoc(harness.db, `gm_request_summaries/${id}`)).toMatchObject({ request_id: id, assignee_id: GM1, stale: false });
    expect(await readDoc(harness.db, `gm_request_details/${id}`)).toEqual({ watcher_ids: [] });
    expect(await readDoc(harness.db, `user_state/${EMPLOYEE}/requests/${id}`)).toMatchObject({ type: 'requester' });
    const history = [...(await readCollection(harness.db, `requests/${id}/history`)).values()];
    expect(history).toEqual([expect.objectContaining({ kind: 'request_created', actor_id: EMPLOYEE, at: NOW, assignee_id: GM1 })]);
    const outbox = await outboxFor(id);
    expect(outbox).toEqual([
      expect.objectContaining({ event_kind: 'request_created', recipient_id: GM1, channel: 'auto', state: 'pending', attempts: 0 }),
    ]);
    expect(queued).toEqual([[expect.stringMatching(/^[0-9a-f]{40}$/)]]);
  });

  it('the same command_id again returns the same result, with no second request, number or outbox entry', async () => {
    const body = maintenance();
    const first = await call('POST', '/api/commands', { token: tokens.get(EMPLOYEE), body });
    const counter = await readDoc(harness.db, 'system_counters/request_sequence');
    const outboxCount = (await outboxEntries()).length;
    queued.length = 0;
    const second = await call('POST', '/api/commands', { token: tokens.get(EMPLOYEE), body });
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ replayed: true, result: first.body.result });
    expect(await readDoc(harness.db, 'system_counters/request_sequence')).toEqual(counter);
    expect((await outboxEntries()).length).toBe(outboxCount);
    expect(queued).toEqual([]);
  });

  it('the same command_id with a different body is a conflict', async () => {
    const commandId = randomUUID();
    expect((await call('POST', '/api/commands', { token: tokens.get(GM1), body: gmTask({}, commandId) })).status).toBe(200);
    expect(await call('POST', '/api/commands', { token: tokens.get(GM1), body: gmTask({ summary_title: 'อื่น' }, commandId) })).toMatchObject({
      status: 409,
      body: { error: 'COMMAND_ID_CONFLICT' },
    });
  });

  it('a confidential task: no public summary, the internal counter grows, the GM summary keeps it', async () => {
    const before = Number((await readDoc(harness.db, 'board_counters/public'))?.internal_board_count ?? 0);
    const response = await call('POST', '/api/commands', { token: tokens.get(GM2), body: gmTask({ sensitivity_subject: 'contract' }) });
    const id = (response.body.result as { request_id: string }).request_id;
    expect(await readDoc(harness.db, `request_summaries/${id}`)).toBeUndefined();
    expect(await readDoc(harness.db, `gm_request_summaries/${id}`)).toMatchObject({ is_confidential: true });
    expect(await readDoc(harness.db, 'board_counters/public')).toMatchObject({ internal_board_count: before + 1, as_of: NOW });
  });
});

describe('outbox: who to tell, never the person who acted (D-S08-2); nothing is sent', () => {
  it('a GM creating their own task tells nobody', async () => {
    const response = await call('POST', '/api/commands', { token: tokens.get(GM1), body: gmTask() });
    expect(await outboxFor((response.body.result as { request_id: string }).request_id)).toEqual([]);
  });

  it('a GM opening a request on behalf that routes to themselves tells nobody (the requester is not a GM recipient)', async () => {
    const response = await call('POST', '/api/commands', { token: tokens.get(GM2), body: onBehalf(EMPLOYEE) });
    const id = (response.body.result as { request_id: string }).request_id;
    expect(await readDoc(harness.db, `requests/${id}`)).toMatchObject({ assignee_id: GM2, requester_id: EMPLOYEE, created_by_id: GM2 });
    expect(await outboxFor(id)).toEqual([]);
  });

  it('default owner on leave → unassigned, every available GM told except the actor', async () => {
    await harness.db.doc(`gm_profiles/${GM1}`).set({ presence_status: { kind: 'on_leave' }, leave_ends_on: '2027-01-05', presence_updated_at: NOW - 3_600_000 });
    try {
      const byEmployee = await call('POST', '/api/commands', { token: tokens.get(EMPLOYEE), body: maintenance() });
      const first = (byEmployee.body.result as { request_id: string }).request_id;
      expect(await readDoc(harness.db, `requests/${first}`)).not.toHaveProperty('assignee_id');
      expect((await outboxFor(first)).map((entry) => entry.recipient_id).sort()).toEqual([GM2, GM_ADMIN].sort());
      const byGm2 = await call('POST', '/api/commands', { token: tokens.get(GM2), body: onBehalf(COLLEAGUE, 'maintenance') });
      const second = (byGm2.body.result as { request_id: string }).request_id;
      expect((await outboxFor(second)).map((entry) => entry.recipient_id)).toEqual([GM_ADMIN]);
    } finally {
      await harness.db.doc(`gm_profiles/${GM1}`).set({ presence_status: { kind: 'unspecified' } });
    }
  });

  it('nothing is delivered: every entry stays pending with no provider result', async () => {
    for (const entry of await outboxEntries()) {
      expect(entry.state).toBe('pending');
      expect(entry).not.toHaveProperty('provider_id');
    }
  });
});

describe('atomic: a failure anywhere leaves nothing half-written; a queue failure does not undo the request', () => {
  it('outbox write fails inside the transaction → 500 and no request, number, projection or command record', async () => {
    const failing: CommandStore = {
      runTransaction: (work) =>
        adminCommandStore(harness.db).runTransaction((transaction) =>
          work({
            ...transaction,
            set: (path, data) => {
              if (path.startsWith('outbox/')) throw new Error('simulated outbox failure');
              transaction.set(path, data);
            },
          }),
        ),
    };
    const broken = await start({ commandStore: failing });
    const requestsBefore = (await readCollection(harness.db, 'requests')).size;
    const summariesBefore = (await readCollection(harness.db, 'gm_request_summaries')).size;
    const outboxBefore = (await outboxEntries()).length;
    const counterBefore = await readDoc(harness.db, 'system_counters/request_sequence');
    const commandId = randomUUID();
    const response = await call('POST', '/api/commands', { token: tokens.get(EMPLOYEE), body: maintenance(commandId), server: broken });
    expect(response).toMatchObject({ status: 500, body: { error: 'INTERNAL' } });
    expect((await readCollection(harness.db, 'requests')).size).toBe(requestsBefore);
    expect(await readDoc(harness.db, 'system_counters/request_sequence')).toEqual(counterBefore);
    expect(await readDoc(harness.db, `commands/${commandId}`)).toBeUndefined();
    expect((await readCollection(harness.db, 'gm_request_summaries')).size).toBe(summariesBefore);
    expect((await outboxEntries()).length).toBe(outboxBefore);
  });

  it('the task queue fails after commit → 200, the request and its pending outbox stay for recovery', async () => {
    const flaky = await start({ taskQueue: { enqueue: async () => Promise.reject(new Error('queue down')) } });
    const response = await call('POST', '/api/commands', { token: tokens.get(EMPLOYEE), body: maintenance(), server: flaky });
    expect(response.status).toBe(200);
    const id = (response.body.result as { request_id: string }).request_id;
    expect(await readDoc(harness.db, `requests/${id}`)).toMatchObject({ status: 'queued' });
    expect(await outboxFor(id)).toEqual([expect.objectContaining({ state: 'pending' })]);
  });
});

describe('CORS: only the app origin', () => {
  it('a preflight from the app origin is answered; credentials are not allowed (bearer token, no cookies)', async () => {
    const response = await call('OPTIONS', '/api/commands', {
      origin: APP_ORIGIN,
      headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' },
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    expect(response.headers.get('access-control-allow-methods')).toBe('GET, POST');
    expect(response.headers.get('access-control-allow-headers')).toBe('authorization, content-type');
    expect(response.headers.get('access-control-allow-credentials')).toBeNull();
    expect(response.headers.get('vary')).toContain('Origin');
  });

  it.each(['https://evil.example.com', 'https://gm-dev.tdfb.co.evil.com', 'http://gm-dev.tdfb.co', 'https://gm.tdfb.co', 'null'])(
    'origin %s: preflight 403 and a POST is refused before anything is written',
    async (origin) => {
      const preflight = await call('OPTIONS', '/api/commands', { origin, headers: { 'access-control-request-method': 'POST' } });
      expect(preflight.status).toBe(403);
      expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
      const before = (await readCollection(harness.db, 'requests')).size;
      const post = await call('POST', '/api/commands', { token: tokens.get(GM1), body: gmTask(), origin });
      expect(post).toMatchObject({ status: 403, body: { error: 'ORIGIN_NOT_ALLOWED' } });
      expect(post.headers.get('access-control-allow-origin')).toBeNull();
      expect((await readCollection(harness.db, 'requests')).size).toBe(before);
    },
  );

  it('a request without Origin (same-origin through the Hosting rewrite, or server-side) is fine', async () => {
    expect((await call('GET', '/api/me/awaiting-confirmation', { token: tokens.get(EMPLOYEE) })).status).toBe(200);
  });
});

describe('S12 endpoints over HTTP (FU-16)', () => {
  it('request detail, history, my requests and the awaiting count go through the same checks', async () => {
    const created = await call('POST', '/api/commands', { token: tokens.get(EMPLOYEE), body: maintenance() });
    const id = (created.body.result as { request_id: string }).request_id;
    expect(await call('GET', `/api/requests/${id}`, { token: tokens.get(EMPLOYEE) })).toMatchObject({ status: 200, body: { request_id: id } });
    expect(await call('GET', `/api/requests/${id}`, { token: tokens.get(COLLEAGUE) })).toMatchObject({ status: 404, body: { error: 'NOT_FOUND' } });
    expect(await call('GET', `/api/requests/${id}/history`, { token: tokens.get(GM1) })).toMatchObject({ status: 200 });
    expect(await call('GET', `/api/requests/${id}/comments`, { token: tokens.get(COLLEAGUE) })).toMatchObject({ status: 404 });
    const mine = await call('GET', '/api/me/requests', { token: tokens.get(EMPLOYEE) });
    expect((mine.body.items as { request_id: string }[]).map((card) => card.request_id)).toContain(id);
    expect(await call('GET', '/api/me/awaiting-confirmation', { token: tokens.get(EMPLOYEE) })).toMatchObject({ status: 200, body: { count: 0 } });
  });

  it('upload and view links: the requester may attach; a crafted path is refused', async () => {
    const created = await call('POST', '/api/commands', { token: tokens.get(EMPLOYEE), body: maintenance() });
    const id = (created.body.result as { request_id: string }).request_id;
    const upload = await call('POST', '/api/attachments/upload-url', {
      token: tokens.get(EMPLOYEE),
      body: { request_id: id, purpose: 'attachment', content_type: 'image/jpeg', size_bytes: 1000 },
    });
    expect(upload).toMatchObject({ status: 200, body: { method: 'PUT' } });
    expect(
      await call('POST', '/api/attachments/view-url', { token: tokens.get(EMPLOYEE), body: { request_id: id, object_path: `requests/${id}/attachments/../x` } }),
    ).toMatchObject({ status: 400, body: { error: 'PATH_INVALID' } });
    expect(await call('POST', '/api/attachments/finalize', { token: tokens.get(GM1), body: { upload_id: upload.body.upload_id } })).toMatchObject({ status: 404 });
  });
});

describe('HTTP hygiene', () => {
  it('health check, unknown route, wrong method', async () => {
    expect(await call('GET', '/healthz')).toMatchObject({ status: 200, body: { status: 'ok', service: 'gm-api' } });
    expect(await call('GET', '/api/nope', { token: tokens.get(GM1) })).toMatchObject({ status: 404, body: { error: 'NOT_FOUND' } });
    expect((await call('GET', '/api/commands', { token: tokens.get(GM1) })).status).toBe(405);
  });

  it('bad JSON, a body too large and a contract error are refused with a code only', async () => {
    expect(await call('POST', '/api/commands', { token: tokens.get(GM1), rawBody: '{not json' })).toMatchObject({ status: 400, body: { error: 'BODY_INVALID' } });
    expect(await call('POST', '/api/commands', { token: tokens.get(GM1), rawBody: JSON.stringify({ pad: 'x'.repeat(70_000) }) })).toMatchObject({
      status: 413,
      body: { error: 'BODY_TOO_LARGE' },
    });
    expect(
      await call('POST', '/api/commands', { token: tokens.get(GM1), body: { ...gmTask(), payload: { ...gmTask().payload, category: 'เอกสารและธุรการ' } } }),
    ).toMatchObject({ status: 400, body: { error: 'FIELD_INVALID', path: 'payload.category' } });
  });

  it('responses are never cached', async () => {
    expect((await call('GET', '/api/me/awaiting-confirmation', { token: tokens.get(EMPLOYEE) })).headers.get('cache-control')).toBe('no-store');
  });
});

describe('logs and network (runs last)', () => {
  it('nothing left the machine', () => {
    expect(blockedHosts).toEqual([]);
  });

  it('HTTP logs hold no e-mail, name, typed detail, token or signed URL', () => {
    const text = logs.lines.join('\n');
    expect(text).toContain('"event":"http.request"');
    const secrets = [...Object.keys(NAMES), ...Object.values(NAMES), DISABLED, OUTSIDER, TYPED_DETAIL, 'X-Goog-Signature', 'Bearer ', ...tokens.values()];
    for (const secret of secrets) expect(text.includes(secret), `log contains ${secret.slice(0, 20)}…`).toBe(false);
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
  });
});
