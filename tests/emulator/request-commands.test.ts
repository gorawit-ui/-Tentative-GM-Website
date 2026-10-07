// S08 — request number counter and command IDs on the Firestore emulator (A4, Part 6 §6.6).
// Emulator only (demo-* project); people, places and IDs are synthetic.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Actor, DeploymentEnvironment } from '@gm/domain';
import { ContractRejected, parseCommand, type CommandEnvelope } from '@gm/contracts';
import {
  COMMAND_RETENTION_MS,
  CommandRejected,
  REQUEST_COUNTER_PATH,
  executeCommand,
  type CommandContext,
  type MaintenanceCatalog,
} from '../../apps/api/src/commands/index';
import {
  clearFirestore,
  emulatorClient,
  readCollection,
  readDoc,
  removeDoc,
  writeDoc,
  type EmulatorClient,
} from './support/firestore-client-store';

const NOW = Date.parse('2026-12-28T09:00:00+07:00');
const SAME_ID = '5d0a2c1e-7b3f-4e8a-9c6d-2f1e0b9a8c7d';

// D-S08-4: person IDs are lowercase @tdfb.co emails (synthetic people).
const GM: Actor = { personId: 'gm.staff01@tdfb.co', role: 'gm_staff' };
const EMPLOYEE: Actor = { personId: 'employee01@tdfb.co', role: 'requester' };
const fac16Employee = (n: number): Actor => ({ personId: `fac16.staff${String(n).padStart(2, '0')}@tdfb.co`, role: 'requester' });

/** Synthetic catalog standing in for `locations`/`areas`/symptoms (A11/A12). */
const CATALOG: MaintenanceCatalog = {
  async resolve(_tx, selection) {
    const locations: Record<string, string> = { 'loc-fac16': 'FAC16', 'loc-wh300': 'WH300' };
    const symptoms: Record<string, string> = { internet_down: 'อินเทอร์เน็ตใช้ไม่ได้', aircon: 'แอร์' };
    const location = locations[selection.location_id];
    const symptom = symptoms[selection.symptom_key];
    if (location === undefined || symptom === undefined) throw new CommandRejected('CATALOG_UNKNOWN', 'unknown place or symptom');
    return {
      location: { id: selection.location_id, label: location },
      ...(selection.area_id === undefined ? {} : { area: { id: selection.area_id, label: 'ห้องประชุม' } }),
      symptom: { key: selection.symptom_key, label: symptom },
    };
  },
};

let ids = 0;
function context(actor: Actor, environment: DeploymentEnvironment = 'prod'): CommandContext {
  return {
    actor,
    now: NOW,
    environment,
    newRequestId: () => `req-s08-${String(++ids).padStart(4, '0')}`,
    maintenanceCatalog: CATALOG,
  };
}

function internetDown(commandId: string = randomUUID()): CommandEnvelope {
  return parseCommand({
    command_id: commandId,
    type: 'create_maintenance',
    payload: { location_id: 'loc-fac16', symptom_key: 'internet_down', description: 'เน็ตล่มทั้งอาคาร' },
  });
}

function gmTask(commandId: string = randomUUID(), summaryTitle = 'ต่อสัญญาเช่ารถส่งของ'): CommandEnvelope {
  return parseCommand({
    command_id: commandId,
    type: 'create_gm_task',
    payload: { summary_title: summaryTitle, category: 'documents_admin', sensitivity_subject: 'general' },
  });
}

function watch(requestId: string, commandId: string = randomUUID()): CommandEnvelope {
  return parseCommand({ command_id: commandId, type: 'watch_request', payload: { request_id: requestId } });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error && 'code' in error) return String(error.code);
    throw error;
  }
  throw new Error('expected a rejection');
}

let client: EmulatorClient;

async function counter(): Promise<unknown> {
  return (await readDoc(client.db, REQUEST_COUNTER_PATH))?.last_issued;
}

async function requestNumbers(): Promise<string[]> {
  return [...(await readCollection(client.db, 'requests')).values()].map((request) => String(request.request_number)).sort();
}

beforeAll(() => {
  client = emulatorClient();
});

afterAll(async () => {
  await client.close();
});

beforeEach(async () => {
  await clearFirestore();
});

describe('request number (A4)', () => {
  it('starts at GM-0001 and continues one by one', async () => {
    const first = await executeCommand(client.store, internetDown(), context(EMPLOYEE));
    const second = await executeCommand(client.store, gmTask(), context(GM));
    expect(first).toEqual({ replayed: false, result: { request_id: expect.any(String), request_number: 'GM-0001' } });
    expect(second.result).toMatchObject({ request_number: 'GM-0002' });
    expect(await counter()).toBe(2);
    const stored = await readDoc(client.db, `requests/${String(first.result.request_id)}`);
    expect(stored).toMatchObject({
      request_number: 'GM-0001',
      type: 'maintenance',
      origin: 'requester',
      requester_id: EMPLOYEE.personId,
      summary_title: 'อินเทอร์เน็ตใช้ไม่ได้ · FAC16',
      status: 'queued',
      created_at: NOW,
      last_updated_at: NOW,
    });
  });

  it('a cancelled request keeps its number; the next request gets a new one', async () => {
    const first = await executeCommand(client.store, internetDown(), context(EMPLOYEE));
    const path = `requests/${String(first.result.request_id)}`;
    // Stand-in for the cancel command (A03): the stored request is cancelled.
    await writeDoc(client.db, path, { ...(await readDoc(client.db, path)), status: 'cancelled', cancelled_at: NOW });
    expect((await executeCommand(client.store, internetDown(), context(EMPLOYEE))).result).toMatchObject({
      request_number: 'GM-0002',
    });
  });

  it('a deleted request (dev clean-up) does not give its number back either', async () => {
    const first = await executeCommand(client.store, internetDown(), context(EMPLOYEE));
    await executeCommand(client.store, internetDown(), context(EMPLOYEE));
    await removeDoc(client.db, `requests/${String(first.result.request_id)}`);
    expect((await executeCommand(client.store, internetDown(), context(EMPLOYEE))).result).toMatchObject({
      request_number: 'GM-0003',
    });
  });

  it('after GM-9999 comes GM-10000, then GM-10001 — no wrap to GM-0001', async () => {
    await writeDoc(client.db, REQUEST_COUNTER_PATH, { last_issued: 9998 });
    const numbers = [];
    for (let n = 0; n < 3; n += 1) {
      numbers.push((await executeCommand(client.store, internetDown(), context(EMPLOYEE))).result.request_number);
    }
    expect(numbers).toEqual(['GM-9999', 'GM-10000', 'GM-10001']);
    expect(await counter()).toBe(10001);
  });

  it('a corrupt counter fails closed: no request, no number', async () => {
    await writeDoc(client.db, REQUEST_COUNTER_PATH, { last_issued: -1 });
    await expect(executeCommand(client.store, internetDown(), context(EMPLOYEE))).rejects.toThrow(RangeError);
    expect(await requestNumbers()).toEqual([]);
  });

  it('a rejected create does not use a number', async () => {
    const employeeTask = gmTask();
    expect(await codeOf(executeCommand(client.store, employeeTask, context(EMPLOYEE)))).toBe('GM_ONLY');
    const unknownPlace = parseCommand({
      command_id: randomUUID(),
      type: 'create_maintenance',
      payload: { location_id: 'loc-nowhere', symptom_key: 'internet_down' },
    });
    expect(await codeOf(executeCommand(client.store, unknownPlace, context(EMPLOYEE)))).toBe('CATALOG_UNKNOWN');
    expect(await counter()).toBeUndefined();
    expect(await readCollection(client.db, 'commands')).toEqual(new Map());
    expect((await executeCommand(client.store, internetDown(), context(EMPLOYEE))).result).toMatchObject({
      request_number: 'GM-0001',
    });
  });
});

describe('15 people at FAC16 report the internet outage at the same moment', () => {
  it('every request gets a different number, with no gap: GM-0001 … GM-0015', { timeout: 120_000 }, async () => {
    const instances = Array.from({ length: 15 }, () => emulatorClient());
    try {
      const outcomes = await Promise.all(
        instances.map((instance, n) => executeCommand(instance.store, internetDown(), context(fac16Employee(n + 1)))),
      );
      const issued = outcomes.map((outcome) => outcome.result.request_number).sort();
      const expected = Array.from({ length: 15 }, (_, n) => `GM-${String(n + 1).padStart(4, '0')}`);
      expect(issued).toEqual(expected);
      expect(new Set(outcomes.map((outcome) => outcome.result.request_id)).size).toBe(15);
      expect(outcomes.every((outcome) => !outcome.replayed)).toBe(true);
      expect(await requestNumbers()).toEqual(expected);
      expect(await counter()).toBe(15);
      expect((await readCollection(client.db, 'commands')).size).toBe(15);
      // Contention really happened (retries), and still no number was skipped.
      expect(instances.reduce((sum, instance) => sum + instance.attempts(), 0)).toBeGreaterThan(15);
    } finally {
      await Promise.all(instances.map((instance) => instance.close()));
    }
  });
});

describe('command ID (Part 6 §6.6 idempotency)', () => {
  it('sending the same command again (network retry) has one effect and returns the first result', async () => {
    const command = internetDown();
    const first = await executeCommand(client.store, command, context(EMPLOYEE));
    const again = await executeCommand(client.store, structuredClone(command), context(EMPLOYEE));
    expect(first.replayed).toBe(false);
    expect(again).toEqual({ replayed: true, result: first.result });
    expect(await requestNumbers()).toEqual(['GM-0001']);
    expect(await counter()).toBe(1);
  });

  it('a double tap (two copies at once, different API instances) creates one request and one number', { timeout: 60_000 }, async () => {
    const instances = [emulatorClient(), emulatorClient()];
    try {
      const command = internetDown();
      const [a, b] = await Promise.all(instances.map((instance) => executeCommand(instance.store, command, context(EMPLOYEE))));
      expect(a?.result).toEqual(b?.result);
      expect([a?.replayed, b?.replayed].sort()).toEqual([false, true]);
      expect(await requestNumbers()).toEqual(['GM-0001']);
      expect(await counter()).toBe(1);
    } finally {
      await Promise.all(instances.map((instance) => instance.close()));
    }
  });

  it('the stored command keeps the result even when the request changes later', async () => {
    const command = gmTask();
    const first = await executeCommand(client.store, command, context(GM));
    const path = `requests/${String(first.result.request_id)}`;
    await writeDoc(client.db, path, { ...(await readDoc(client.db, path)), status: 'cancelled' });
    expect(await executeCommand(client.store, command, context(GM))).toEqual({ replayed: true, result: first.result });
  });

  it.each([
    ['a different payload', () => gmTask(SAME_ID, 'ชื่ออื่น'), GM],
    ['a different command type', () => watch('req-any', SAME_ID), GM],
    ['a different actor', () => gmTask(SAME_ID), { personId: 'gm.staff02@tdfb.co', role: 'gm_staff' } as Actor],
  ])('the same command ID with %s is refused, and nothing changes', async (_label, makeCommand, actor) => {
    const first = await executeCommand(client.store, gmTask(SAME_ID), context(GM));
    const before = await readDoc(client.db, `commands/${SAME_ID}`);
    expect(await codeOf(executeCommand(client.store, makeCommand(), context(actor)))).toBe('COMMAND_ID_CONFLICT');
    expect(await readDoc(client.db, `commands/${SAME_ID}`)).toEqual(before);
    expect(await requestNumbers()).toEqual(['GM-0001']);
    expect(await counter()).toBe(1);
    expect(first.result.request_number).toBe('GM-0001');
  });

  it('a rejected command leaves no record, so the same ID can be sent again once it is valid', async () => {
    const commandId = randomUUID();
    expect(await codeOf(executeCommand(client.store, gmTask(commandId), context(EMPLOYEE)))).toBe('GM_ONLY');
    expect(await readDoc(client.db, `commands/${commandId}`)).toBeUndefined();
    expect((await executeCommand(client.store, gmTask(commandId), context(GM))).result).toMatchObject({
      request_number: 'GM-0001',
    });
  });
});

describe('watching a request (U1) is not a new request', () => {
  it('uses no request number; the next real request continues without a gap', async () => {
    const reported = await executeCommand(client.store, internetDown(), context(fac16Employee(1)));
    const requestId = String(reported.result.request_id);
    const watched = await executeCommand(client.store, watch(requestId), context(fac16Employee(2)));
    expect(watched).toEqual({
      replayed: false,
      result: { request_id: requestId, request_number: 'GM-0001', watch: 'added' },
    });
    expect(await counter()).toBe(1);
    expect(await requestNumbers()).toEqual(['GM-0001']);
    expect((await executeCommand(client.store, internetDown(), context(fac16Employee(3)))).result).toMatchObject({
      request_number: 'GM-0002',
    });
  });

  it('watchers are unique; the reporter is not an extra watcher; last_updated_at does not move', async () => {
    const reported = await executeCommand(client.store, internetDown(), context(fac16Employee(1)));
    const requestId = String(reported.result.request_id);
    const outcomes = [];
    for (const actor of [fac16Employee(2), fac16Employee(3), fac16Employee(2), fac16Employee(1)]) {
      outcomes.push((await executeCommand(client.store, watch(requestId), context(actor))).result.watch);
    }
    expect(outcomes).toEqual(['added', 'added', 'already_watching', 'is_requester']);
    const stored = await readDoc(client.db, `requests/${requestId}`);
    expect(stored?.watcher_ids).toEqual([fac16Employee(2).personId, fac16Employee(3).personId]);
    expect(stored?.related_person_ids).toEqual([]);
    expect(stored?.last_updated_at).toBe(NOW);
    expect(await counter()).toBe(1);
  });

  it('retrying a watch with the same command ID returns the same result', async () => {
    const reported = await executeCommand(client.store, internetDown(), context(fac16Employee(1)));
    const command = watch(String(reported.result.request_id));
    const first = await executeCommand(client.store, command, context(fac16Employee(2)));
    expect(await executeCommand(client.store, command, context(fac16Employee(2)))).toEqual({ replayed: true, result: first.result });
  });

  it('an unknown request or a gm_task cannot be watched, and no number is used', async () => {
    expect(await codeOf(executeCommand(client.store, watch('req-missing'), context(EMPLOYEE)))).toBe('REQUEST_NOT_FOUND');
    const task = await executeCommand(client.store, gmTask(), context(GM));
    expect(await codeOf(executeCommand(client.store, watch(String(task.result.request_id)), context(EMPLOYEE)))).toBe(
      'WATCH_NOT_AVAILABLE',
    );
    expect(await counter()).toBe(1);
  });
});

describe('contracts at the API boundary (D-S04-1)', () => {
  it('a Thai category label never reaches the executor', () => {
    expect(() =>
      parseCommand({
        command_id: randomUUID(),
        type: 'create_gm_task',
        payload: { summary_title: 'x', category: 'เอกสารและธุรการ', sensitivity_subject: 'general' },
      }),
    ).toThrow(ContractRejected);
  });
});

describe('D-S08-6 / D-S08-8', () => {
  it('the command record carries expire_at = stored time + 30 days for the Firestore TTL policy', async () => {
    await executeCommand(client.store, gmTask(SAME_ID), context(GM));
    const record = await readDoc(client.db, `commands/${SAME_ID}`);
    expect(COMMAND_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
    expect(record).toMatchObject({ created_at: NOW, expire_at: NOW + COMMAND_RETENTION_MS });
  });

  it('dev and local number requests with DEV-, prod with GM-', async () => {
    const local = await executeCommand(client.store, gmTask(), context(GM, 'local'));
    const dev = await executeCommand(client.store, gmTask(), context(GM, 'dev'));
    expect(local.result.request_number).toBe('DEV-0001');
    expect(dev.result.request_number).toBe('DEV-0002');
    await clearFirestore();
    expect((await executeCommand(client.store, gmTask(), context(GM, 'prod'))).result.request_number).toBe('GM-0001');
  });
});
