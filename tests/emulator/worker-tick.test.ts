// A02 — worker queue, the single tick lease and bounded retry on the Firestore emulator (Part 6 §6.2,
// §6.9, §6.10), plus D-A01-3 (the channel really used and the result go back on the outbox entry)
// and D-A01-4 / FU-20 (pending entries left by a failed hand-off are swept by the tick).
// Two Admin SDK apps stand for two worker instances. The notification adapter is the local one
// (nothing is sent to Slack or e-mail); people, requests and IDs are synthetic. Emulator only.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DeliveryOutcome } from '@gm/domain';
import { MINUTE_MS } from '@gm/time';
import { CommandRejected, type MaintenanceCatalog } from '../../apps/api/src/commands/index';
import { lifecycleOutbox, newRequestOutbox } from '../../apps/api/src/commands/outbox';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { disabledAdapter, localAdapter, type NotificationAdapter, type OutboundMessage } from '../../apps/worker/src/adapters';
import type { WorkerDeps } from '../../apps/worker/src/deps';
import { adminWorkerStore } from '../../apps/worker/src/firestore-store';
import { createWorkerHandler, workerOperations } from '../../apps/worker/src/http';
import { consoleWorkerLogger } from '../../apps/worker/src/log';
import { dispatchOutbox } from '../../apps/worker/src/outbox-dispatch';
import { JobFailed, runJob, type JobHandler } from '../../apps/worker/src/scheduled-work';
import { TICK_LEASE_PATH, runTick, type TickReport } from '../../apps/worker/src/tick';
import { blockedHosts } from '../rules/network-guard';
import { apiHarness, captureLogs, clearAuth, type LogCapture } from './support/api-harness';
import { TEST_MAX_ATTEMPTS, clearFirestore, emulatorClient, readDoc, writeDoc, type EmulatorClient } from './support/firestore-client-store';

const NOW = Date.parse('2026-12-28T09:00:00+07:00');
const minutes = (n: number) => NOW + n * MINUTE_MS;

// Synthetic people (D-S08-4 person IDs). Names, e-mails and Slack IDs must never reach a log.
const GM_SLACK = 'a02.gm.slack@tdfb.co';
const GM_MAIL = 'a02.gm.mail@tdfb.co';
const REQUESTER = 'a02.requester@tdfb.co';
const LEFT = 'a02.left@tdfb.co';
const NOBODY = 'a02.nobody@tdfb.co';
const SLACK_IDS: Readonly<Record<string, string>> = { [GM_SLACK]: 'U0A02GMSLK', [LEFT]: 'U0A02LEFT0' };
const NAMES: Readonly<Record<string, string>> = {
  [GM_SLACK]: 'คุณจีเอ็ม สแลค',
  [GM_MAIL]: 'คุณจีเอ็ม อีเมล',
  [REQUESTER]: 'คุณผู้ขอ ทดสอบ',
  [LEFT]: 'คุณลาออก แล้ว',
};

let workerA: EmulatorClient;
let workerB: EmulatorClient;
let logs: LogCapture;
let now = NOW;

const local = localAdapter(consoleWorkerLogger);
const sends: OutboundMessage[] = [];
let behaviour: (message: OutboundMessage) => Promise<DeliveryOutcome> = (message) => local.send(message);
const adapter: NotificationAdapter = {
  send: (message) => {
    sends.push(message);
    return behaviour(message);
  },
};

// A probe job handler (`cleanup` stands in for A05/B kinds): counts its effect in its own checked transaction.
let jobBehaviour: 'normal' | 'throw' | 'fail_permanent' | 'hang_once' = 'normal';
const jobCalls: string[] = [];
let jobHung: () => void = () => undefined;
const cleanup: JobHandler = async (context) => {
  jobCalls.push(context.job.id);
  if (jobBehaviour === 'throw') throw new Error('handler blew up with free text that must not be logged');
  if (jobBehaviour === 'fail_permanent') throw new JobFailed('PROBE_REFUSED', true);
  if (jobBehaviour === 'hang_once' && jobCalls.length === 1) {
    jobHung();
    return new Promise(() => undefined);
  }
  const run = await context.runChecked(async (transaction) => {
    const effect = await transaction.get(`job_effects/${context.job.id}`);
    transaction.set(`job_effects/${context.job.id}`, { count: (typeof effect?.count === 'number' ? effect.count : 0) + 1 });
  });
  return run.kind === 'superseded' ? { kind: 'superseded' } : { kind: 'done' };
};

function deps(worker: EmulatorClient, extra: Partial<WorkerDeps> = {}): WorkerDeps {
  return {
    store: adminWorkerStore(worker.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
    adapter,
    now: () => now,
    newLeaseId: () => randomUUID(),
    log: consoleWorkerLogger,
    jobHandlers: { cleanup },
    ...extra,
  };
}

async function seedPeople(): Promise<void> {
  const batch = workerA.db.batch();
  for (const personId of [GM_SLACK, GM_MAIL, REQUESTER, LEFT]) {
    batch.set(workerA.db.doc(`people/${personId}`), {
      name: NAMES[personId],
      email: personId,
      active: personId !== LEFT,
      ...(SLACK_IDS[personId] === undefined ? {} : { slack_user_id: SLACK_IDS[personId] }),
    });
  }
  await batch.commit();
}

let requestCount = 0;
/** A request plus the outbox entry the create command would write for `recipient` (A01 shape). */
async function seedEntry(recipient: string, options: { audience?: 'gm' | 'requester'; confidential?: boolean; request?: Record<string, unknown> } = {}): Promise<string> {
  const requestId = `req-a02-${String(++requestCount).padStart(4, '0')}`;
  const requestNumber = `DEV-${String(requestCount).padStart(4, '0')}`;
  await writeDoc(workerA.db, `requests/${requestId}`, { request_number: requestNumber, status: 'queued', revision: 1, created_at: NOW, ...options.request });
  const [entry] = newRequestOutbox({
    requestId,
    requestNumber,
    actorId: 'a02.someone.else@tdfb.co',
    gmRecipientIds: options.audience === 'requester' ? [] : [recipient],
    ...(options.audience === 'requester' ? { requesterId: recipient } : {}),
    isConfidential: options.confidential ?? false,
    now: NOW,
  });
  if (entry === undefined) throw new Error('no outbox entry');
  await writeDoc(workerA.db, `outbox/${entry.id}`, entry.data);
  return entry.id;
}

const entry = (id: string) => readDoc(workerA.db, `outbox/${id}`);
const sentIds = () => sends.map((message) => message.outboxId);

beforeAll(async () => {
  logs = captureLogs();
  workerA = emulatorClient();
  workerB = emulatorClient();
});

afterAll(async () => {
  logs?.stop();
  await workerA?.close();
  await workerB?.close();
});

beforeEach(async () => {
  await clearFirestore();
  await seedPeople();
  now = NOW;
  sends.length = 0;
  behaviour = (message) => local.send(message);
  jobBehaviour = 'normal';
  jobCalls.length = 0;
});

describe('D-A01-3: the worker records the channel it really used and the result on the entry', () => {
  it('Slack-mapped recipient → Slack; the entry keeps channel auto as its key and gains the result', async () => {
    const id = await seedEntry(GM_SLACK);
    await expect(dispatchOutbox(deps(workerA), id)).resolves.toBe('sent');
    const stored = await entry(id);
    expect(stored).toMatchObject({
      state: 'provider_accepted',
      channel: 'auto',
      delivery_channel: 'slack',
      provider_id: `local-${id}`,
      attempts: 1,
      last_attempt_at: NOW,
    });
    expect(stored).not.toHaveProperty('lease_until');
    expect(stored).not.toHaveProperty('last_error_code');
    expect(sends).toEqual([expect.objectContaining({ outboxId: id, channel: 'slack', address: SLACK_IDS[GM_SLACK], audience: 'gm' })]);
  });

  it('no Slack mapping, active account → company e-mail', async () => {
    const id = await seedEntry(GM_MAIL);
    await dispatchOutbox(deps(workerA), id);
    expect(await entry(id)).toMatchObject({ state: 'provider_accepted', delivery_channel: 'email' });
    expect(sends).toEqual([expect.objectContaining({ channel: 'email', address: GM_MAIL })]);
  });

  it('D-A01-4: the requester notice carries the request number to the adapter', async () => {
    const id = await seedEntry(REQUESTER, { audience: 'requester' });
    await dispatchOutbox(deps(workerA), id);
    expect(sends).toEqual([expect.objectContaining({ audience: 'requester', requestNumber: `DEV-${String(requestCount).padStart(4, '0')}`, channel: 'email' })]);
  });

  it.each([
    ['an inactive account', LEFT],
    ['a person not in the directory', NOBODY],
  ])('%s has no channel → failed NO_CHANNEL (the “ผู้ขอยังไม่ได้รับแจ้ง” data), nothing sent', async (_label, recipient) => {
    const id = await seedEntry(recipient, { audience: 'requester' });
    await expect(dispatchOutbox(deps(workerA), id)).resolves.toBe('failed');
    expect(await entry(id)).toMatchObject({ state: 'failed', last_error_code: 'NO_CHANNEL', attempts: 0, last_attempt_at: NOW });
    expect(sends).toEqual([]);
  });

  it('a request cancelled before the send → suppressed, nothing sent (Part 6 §6.9: no cancel/supersede sends)', async () => {
    const cancelled = await seedEntry(GM_SLACK, { request: { status: 'cancelled', cancelled_at: NOW } });
    await expect(dispatchOutbox(deps(workerA), cancelled)).resolves.toBe('suppressed');
    expect(await entry(cancelled)).toMatchObject({ state: 'suppressed', last_error_code: 'REQUEST_CANCELLED' });
    const gone = await seedEntry(GM_SLACK);
    await workerA.db.doc(`requests/req-a02-${String(requestCount).padStart(4, '0')}`).delete();
    await expect(dispatchOutbox(deps(workerA), gone)).resolves.toBe('suppressed');
    expect(await entry(gone)).toMatchObject({ state: 'suppressed', last_error_code: 'REQUEST_NOT_FOUND' });
    expect(sends).toEqual([]);
  });
});

describe('A03: watcher notices (U1)', () => {
  async function seedWatcherNotice(request: Record<string, unknown>): Promise<string> {
    const requestId = `req-a02-w-${++requestCount}`;
    await writeDoc(workerA.db, `requests/${requestId}`, { request_number: 'DEV-0900', status: 'in_progress', revision: 2, ...request });
    const [notice] = lifecycleOutbox({
      requestId,
      requestNumber: 'DEV-0900',
      revision: 2,
      activitySeq: 2,
      eventKind: 'request_accepted',
      actorId: GM_MAIL,
      watcherIds: [GM_SLACK],
      isConfidential: false,
      now: NOW,
    });
    if (notice === undefined) throw new Error('no notice');
    await writeDoc(workerA.db, `outbox/${notice.id}`, notice.data);
    return notice.id;
  }

  it('a watcher notice on a general request is sent with audience watcher', async () => {
    const id = await seedWatcherNotice({ is_confidential: false });
    await expect(dispatchOutbox(deps(workerA), id)).resolves.toBe('sent');
    expect(sends).toEqual([expect.objectContaining({ outboxId: id, audience: 'watcher', eventKind: 'request_accepted' })]);
  });

  it('the request became confidential before the send → suppressed, nothing sent (watching gives no access)', async () => {
    const id = await seedWatcherNotice({ is_confidential: true });
    await expect(dispatchOutbox(deps(workerA), id)).resolves.toBe('suppressed');
    expect(await entry(id)).toMatchObject({ state: 'suppressed', last_error_code: 'NO_ACCESS' });
    expect(sends).toEqual([]);
  });
});

describe('D-A03-7: a status notice overtaken by a newer one to the same person is not sent', () => {
  async function seedStatusNotices(): Promise<{ requestId: string; accepted: Record<string, string>; completed: Record<string, string> }> {
    const requestId = `req-a06-s-${++requestCount}`;
    await writeDoc(workerA.db, `requests/${requestId}`, { request_number: 'DEV-0950', status: 'completed', revision: 3, is_confidential: false });
    const notices = (revision: number, eventKind: 'request_accepted' | 'request_completed', watcherIds: string[]) =>
      lifecycleOutbox({ requestId, requestNumber: 'DEV-0950', revision, activitySeq: revision, eventKind, actorId: GM_MAIL, requesterId: REQUESTER, watcherIds, isConfidential: false, now: NOW + revision });
    const accepted = notices(2, 'request_accepted', [GM_SLACK]);
    // The watcher stopped watching before completion: their accepted notice has nothing newer.
    const completed = notices(3, 'request_completed', []);
    for (const notice of [...accepted, ...completed]) await writeDoc(workerA.db, `outbox/${notice.id}`, notice.data);
    const byRecipient = (entries: typeof accepted) => Object.fromEntries(entries.map((notice) => [notice.data.recipient_id, notice.id]));
    return { requestId, accepted: byRecipient(accepted), completed: byRecipient(completed) };
  }

  it('accepted then completed, both waiting for the tick: the requester gets only “completed”', async () => {
    const { accepted, completed } = await seedStatusNotices();
    now = minutes(1);
    await runTick(deps(workerA));
    expect(await entry(accepted[REQUESTER] ?? '')).toMatchObject({ state: 'suppressed', last_error_code: 'SUPERSEDED' });
    expect(await entry(completed[REQUESTER] ?? '')).toMatchObject({ state: 'provider_accepted' });
    expect(sends.filter((message) => message.audience === 'requester').map((message) => message.eventKind)).toEqual(['request_completed']);
  });

  it('only the same person on the same request: the watcher’s own latest notice still goes out', async () => {
    const { accepted } = await seedStatusNotices();
    now = minutes(1);
    await runTick(deps(workerA));
    expect(await entry(accepted[GM_SLACK] ?? '')).toMatchObject({ state: 'provider_accepted' });
  });

  it('a Cloud Task for the old notice arriving late is suppressed too, not sent', async () => {
    const { accepted } = await seedStatusNotices();
    await expect(dispatchOutbox(deps(workerA), accepted[REQUESTER] ?? '')).resolves.toBe('suppressed');
    expect(sends).toEqual([]);
  });

  it('the creation notice is not a status notice here: it is sent even if a status notice follows (Q-A06-1)', async () => {
    const id = await seedEntry(REQUESTER, { audience: 'requester' });
    const requestId = `req-a02-${String(requestCount).padStart(4, '0')}`;
    const [later] = lifecycleOutbox({ requestId, requestNumber: 'DEV-0001', revision: 2, activitySeq: 2, eventKind: 'request_accepted', actorId: GM_MAIL, requesterId: REQUESTER, watcherIds: [], isConfidential: false, now: NOW + 1 });
    if (later === undefined) throw new Error('no notice');
    await writeDoc(workerA.db, `outbox/${later.id}`, later.data);
    await expect(dispatchOutbox(deps(workerA), id)).resolves.toBe('sent');
  });
});

describe('single tick lease: one tick at a time; a dead worker never blocks the next tick', () => {
  it('two ticks at the same moment → one works, the other is a no-op; every entry is sent once', async () => {
    const ids = [await seedEntry(GM_SLACK), await seedEntry(GM_MAIL), await seedEntry(REQUESTER, { audience: 'requester' })];
    // Hold the sends until the other tick has answered, so both ticks really overlap.
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => (release = resolve));
    behaviour = async (message) => {
      await Promise.race([gate, new Promise((resolve) => setTimeout(resolve, 3_000))]);
      return local.send(message);
    };
    const settle = (report: TickReport) => {
      if (!report.ran) release();
      return report;
    };
    const reports = await Promise.all([runTick(deps(workerA)).then(settle), runTick(deps(workerB)).then(settle)]);
    expect(reports.map((report) => report.ran).sort()).toEqual([false, true]);
    expect(reports.find((report) => !report.ran)).toEqual({ ran: false });
    expect(sentIds().sort()).toEqual([...ids].sort());
    for (const id of ids) expect(await entry(id)).toMatchObject({ state: 'provider_accepted', attempts: 1 });
  });

  it('the worker dies mid-tick: before the lease ends the next tick is a no-op; after it, the next tick carries on', async () => {
    const ids = [await seedEntry(GM_SLACK), await seedEntry(GM_MAIL), await seedEntry(REQUESTER, { audience: 'requester' })];
    let entered: () => void = () => undefined;
    const inFirstSend = new Promise<void>((resolve) => (entered = resolve));
    behaviour = (message) => {
      if (sends.length === 1) {
        entered();
        return new Promise(() => undefined); // worker A never comes back
      }
      return local.send(message);
    };
    void runTick(deps(workerA));
    await inFirstSend;
    const hung = sends[0]?.outboxId ?? '';

    now = minutes(5);
    await expect(runTick(deps(workerB))).resolves.toEqual({ ran: false });
    expect(sends).toHaveLength(1);

    now = minutes(11); // the 10-minute tick lease and the 5-minute send lease are both over
    await expect(runTick(deps(workerB))).resolves.toMatchObject({ ran: true });
    expect(sentIds().filter((id) => id === hung)).toHaveLength(1); // never sent twice
    expect(sentIds().sort()).toEqual([...ids].sort());
    // The provider may or may not have it: the GM checks, nobody guesses (§6.10).
    expect(await entry(hung)).toMatchObject({ state: 'delivery_unknown', last_error_code: 'LEASE_EXPIRED', attempts: 1 });
    for (const id of ids.filter((other) => other !== hung)) expect(await entry(id)).toMatchObject({ state: 'provider_accepted', attempts: 1 });
    expect(await readDoc(workerA.db, TICK_LEASE_PATH)).toMatchObject({ last_completed_at: minutes(11) });
  });

  it('a finished tick releases its lease and records when it last ran (Admin: last successful tick)', async () => {
    await seedEntry(GM_SLACK);
    await expect(runTick(deps(workerA))).resolves.toMatchObject({ ran: true, outbox: { sent: 1 } });
    const lease = await readDoc(workerA.db, TICK_LEASE_PATH);
    expect(lease).toMatchObject({ last_started_at: NOW, last_completed_at: NOW });
    expect(lease).not.toHaveProperty('lease_until');
    expect(lease).not.toHaveProperty('lease_id');
    now = minutes(1);
    await expect(runTick(deps(workerB))).resolves.toMatchObject({ ran: true, outbox: { sent: 0 } });
  });
});

describe('the same outbox entry picked up again is sent once', () => {
  it('six pickups at once from two workers (task + tick + duplicates) → one send', async () => {
    const id = await seedEntry(GM_SLACK);
    const results = await Promise.all(Array.from({ length: 6 }, (_, n) => dispatchOutbox(deps(n % 2 === 0 ? workerA : workerB), id)));
    expect(results.filter((result) => result === 'sent')).toHaveLength(1);
    expect(results.filter((result) => result === 'skipped')).toHaveLength(5);
    expect(sends).toHaveLength(1);
    expect(await entry(id)).toMatchObject({ state: 'provider_accepted', attempts: 1 });
  });

  it('a late duplicate task after the send is a no-op', async () => {
    const id = await seedEntry(GM_SLACK);
    await dispatchOutbox(deps(workerA), id);
    await expect(dispatchOutbox(deps(workerB), id)).resolves.toBe('skipped');
    expect(sends).toHaveLength(1);
  });

  it('a task that arrives while the entry waits for its back-off does nothing', async () => {
    const id = await seedEntry(GM_SLACK);
    await workerA.db.doc(`outbox/${id}`).update({ next_attempt_at: new Date(minutes(5)) });
    await expect(dispatchOutbox(deps(workerA), id)).resolves.toBe('skipped');
    expect(sends).toEqual([]);
    expect(await entry(id)).toMatchObject({ state: 'pending', attempts: 0 });
  });
});

describe('bounded retry with back-off, then a failure the GM can see', () => {
  it('a provider that keeps failing: attempts at 0, 5, 20, 80 and 320 minutes, then failed', async () => {
    const id = await seedEntry(GM_SLACK);
    behaviour = async () => ({ kind: 'retryable', code: 'PROVIDER_UNAVAILABLE' });
    const seen: unknown[] = [];
    for (const offset of [0, 1, 5, 6, 20, 80, 320, 1000, 5000]) {
      now = minutes(offset);
      await runTick(deps(workerA));
      const stored = await entry(id);
      seen.push([offset, stored?.state, stored?.attempts, stored?.next_attempt_at]);
    }
    expect(seen).toEqual([
      [0, 'pending', 1, minutes(5)],
      [1, 'pending', 1, minutes(5)],
      [5, 'pending', 2, minutes(20)],
      [6, 'pending', 2, minutes(20)],
      [20, 'pending', 3, minutes(80)],
      [80, 'pending', 4, minutes(320)],
      [320, 'failed', 5, minutes(320)],
      [1000, 'failed', 5, minutes(320)],
      [5000, 'failed', 5, minutes(320)],
    ]);
    expect(sends).toHaveLength(5);
    expect(await entry(id)).toMatchObject({ state: 'failed', last_error_code: 'PROVIDER_UNAVAILABLE', delivery_channel: 'slack' });
  });

  it('the disabled adapter fails at once and is not retried', async () => {
    const id = await seedEntry(GM_MAIL);
    const disabled = disabledAdapter();
    behaviour = (message) => disabled.send(message);
    await runTick(deps(workerA));
    now = minutes(500);
    await runTick(deps(workerA));
    expect(sends).toHaveLength(1);
    expect(await entry(id)).toMatchObject({ state: 'failed', last_error_code: 'CHANNEL_DISABLED', attempts: 1 });
  });

  it('an unknown result, or an adapter that throws, → delivery_unknown; never sent again', async () => {
    const unknown = await seedEntry(GM_SLACK);
    behaviour = async () => ({ kind: 'unknown', code: 'CONNECTION_LOST' });
    await dispatchOutbox(deps(workerA), unknown);
    const thrown = await seedEntry(GM_MAIL);
    behaviour = async () => Promise.reject(new Error('socket hang up after the provider replied'));
    await dispatchOutbox(deps(workerA), thrown);
    now = minutes(500);
    await runTick(deps(workerA));
    expect(sends).toHaveLength(2);
    expect(await entry(unknown)).toMatchObject({ state: 'delivery_unknown', last_error_code: 'CONNECTION_LOST' });
    expect(await entry(thrown)).toMatchObject({ state: 'delivery_unknown', last_error_code: 'ADAPTER_ERROR' });
  });
});

describe('FU-20: pending entries left by a failed queue hand-off are swept by the tick', () => {
  it('a GM opens a request on behalf; the queue fails; the tick delivers to the default owner and the requester', async () => {
    const harness = apiHarness(NOW);
    await clearAuth();
    try {
      const batch = harness.db.batch();
      batch.set(harness.db.doc('settings/routing'), { default_owner_by_type: { document_request: GM_SLACK }, gm_person_ids: [GM_SLACK, GM_MAIL] });
      for (const gm of [GM_SLACK, GM_MAIL]) batch.set(harness.db.doc(`gm_profiles/${gm}`), { presence_status: { kind: 'unspecified' } });
      batch.set(harness.db.doc('calendars/company'), { timezone: 'Asia/Bangkok', open_weekdays: [1, 2, 3, 4, 5], holidays: [] });
      await batch.commit();
      const gm = await harness.signIn(GM_MAIL);
      await harness.db.doc(`access/${gm.uid}`).set({ person_id: GM_MAIL, role: 'gm_staff', enabled: true });
      const catalog: MaintenanceCatalog = { resolve: async () => Promise.reject(new CommandRejected('CATALOG_NOT_READY', 'n/a')) };
      const server: Server = createServer(
        createApiHandler({
          api: harness.deps,
          commandStore: adminCommandStore(harness.db, { maxAttempts: TEST_MAX_ATTEMPTS }),
          environment: 'dev',
          allowedOrigins: ['https://gm-dev.tdfb.co'],
          newRequestId: () => `req-a02-api-${randomUUID()}`,
          maintenanceCatalog: catalog,
          peopleDirectory: transactionPeopleDirectory(),
          routingDirectory: transactionRoutingDirectory(),
          taskQueue: { enqueue: async () => Promise.reject(new Error('queue unavailable')) },
        }),
      );
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      try {
        const { port } = server.address() as AddressInfo;
        const response = await fetch(`http://127.0.0.1:${port}/api/commands`, {
          method: 'POST',
          headers: { authorization: `Bearer ${gm.idToken}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            command_id: randomUUID(),
            type: 'create_on_behalf',
            payload: { requester: { person_id: REQUESTER }, details: { type: 'document_request', summary_title: 'ขอหนังสือรับรอง', sensitivity_subject: 'general' } },
          }),
        });
        expect(response.status).toBe(200);
        const { result } = (await response.json()) as { result: { request_id: string; request_number: string } };
        const pending = await workerA.db.collection('outbox').where('request_id', '==', result.request_id).get();
        expect(pending.docs.map((document) => document.get('state'))).toEqual(['pending', 'pending']);

        await expect(runTick(deps(workerA))).resolves.toMatchObject({ ran: true, outbox: { sent: 2 } });
        expect(sends.map((message) => [message.audience, message.channel, message.requestNumber]).sort()).toEqual(
          [
            ['gm', 'slack', result.request_number],
            ['requester', 'email', result.request_number],
          ].sort(),
        );
        for (const document of pending.docs) expect(await entry(document.id)).toMatchObject({ state: 'provider_accepted' });
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    } finally {
      await harness.close();
    }
  });

  it('the sweep is bounded: pages of the configured size, a cap per tick, the rest next tick', async () => {
    const batch = workerA.db.batch();
    for (let n = 0; n < 25; n += 1) {
      const [created] = newRequestOutbox({ requestId: `req-a02-bulk-${n}`, requestNumber: `DEV-9${n}`, actorId: 'x@tdfb.co', gmRecipientIds: [GM_MAIL], isConfidential: false, now: NOW });
      if (created === undefined) throw new Error('no entry');
      batch.set(workerA.db.doc(`requests/req-a02-bulk-${n}`), { request_number: `DEV-9${n}`, status: 'queued', revision: 1 });
      batch.set(workerA.db.doc(`outbox/${created.id}`), { ...created.data, next_attempt_at: new Date(NOW), created_at: new Date(NOW) });
    }
    await batch.commit();
    const limits = { pageSize: 10, maxPages: 2 };
    await expect(runTick(deps(workerA, { limits }))).resolves.toMatchObject({ ran: true, outbox: { sent: 20 }, more: true });
    now = minutes(15);
    await expect(runTick(deps(workerA, { limits }))).resolves.toMatchObject({ ran: true, outbox: { sent: 5 }, more: false });
    expect(new Set(sentIds()).size).toBe(25);
  });
});

describe('scheduled_work: the scaffold every later tick job uses (A05/B)', () => {
  async function seedJob(id: string, data: Record<string, unknown> = {}): Promise<void> {
    await writeDoc(workerA.db, 'requests/req-a02-job', { request_number: 'DEV-7001', status: 'queued', revision: 3 });
    await writeDoc(workerA.db, `scheduled_work/${id}`, {
      kind: 'cleanup',
      state: 'scheduled',
      next_run_at: NOW,
      attempts: 0,
      request_id: 'req-a02-job',
      expected_revision: 3,
      created_at: NOW,
      ...data,
    });
  }
  const effects = async (id: string) => (await readDoc(workerA.db, `job_effects/${id}`))?.count ?? 0;

  it('a due job runs once from the tick: done, completed_at, lease cleared', async () => {
    await seedJob('job-1');
    await expect(runTick(deps(workerA))).resolves.toMatchObject({ ran: true, jobs: { done: 1 } });
    expect(await effects('job-1')).toBe(1);
    const job = await readDoc(workerA.db, 'scheduled_work/job-1');
    expect(job).toMatchObject({ state: 'done', attempts: 1, completed_at: NOW });
    expect(job).not.toHaveProperty('lease_until');
  });

  it('the same job picked up by two workers at once runs once', async () => {
    await seedJob('job-2');
    const results = await Promise.all(Array.from({ length: 4 }, (_, n) => runJob(deps(n % 2 === 0 ? workerA : workerB), 'job-2')));
    expect(results.filter((result) => result === 'done')).toHaveLength(1);
    expect(await effects('job-2')).toBe(1);
  });

  it('latest revision checked: the request moved on since the job was scheduled → superseded, no effect', async () => {
    await seedJob('job-3');
    await writeDoc(workerA.db, 'requests/req-a02-job', { request_number: 'DEV-7001', status: 'in_progress', revision: 4 });
    await expect(runJob(deps(workerA), 'job-3')).resolves.toBe('superseded');
    expect(await effects('job-3')).toBe(0);
    expect(await readDoc(workerA.db, 'scheduled_work/job-3')).toMatchObject({ state: 'superseded', completed_at: NOW });
  });

  it('a handler error is retried with back-off, then failed with its code (no free text kept)', async () => {
    await seedJob('job-4');
    jobBehaviour = 'throw';
    const seen: unknown[] = [];
    for (const offset of [0, 5, 20, 80, 320, 2000]) {
      now = minutes(offset);
      await runTick(deps(workerA));
      const job = await readDoc(workerA.db, 'scheduled_work/job-4');
      seen.push([offset, job?.state, job?.attempts]);
    }
    expect(seen).toEqual([
      [0, 'scheduled', 1],
      [5, 'scheduled', 2],
      [20, 'scheduled', 3],
      [80, 'scheduled', 4],
      [320, 'failed', 5],
      [2000, 'failed', 5],
    ]);
    const job = await readDoc(workerA.db, 'scheduled_work/job-4');
    expect(job).toMatchObject({ last_error_code: 'JOB_ERROR' });
    expect(JSON.stringify(job)).not.toContain('blew up');
  });

  it('a permanent refusal fails at once; a kind with no handler yet, or an unknown kind, fails visibly', async () => {
    await seedJob('job-5');
    jobBehaviour = 'fail_permanent';
    await expect(runJob(deps(workerA), 'job-5')).resolves.toBe('failed');
    expect(await readDoc(workerA.db, 'scheduled_work/job-5')).toMatchObject({ state: 'failed', last_error_code: 'PROBE_REFUSED', attempts: 1 });
    await seedJob('job-6', { kind: 'backup' });
    await expect(runJob(deps(workerA), 'job-6')).resolves.toBe('failed');
    expect(await readDoc(workerA.db, 'scheduled_work/job-6')).toMatchObject({ state: 'failed', last_error_code: 'JOB_KIND_NOT_READY' });
    await seedJob('job-7', { kind: 'mystery' });
    await expect(runJob(deps(workerA), 'job-7')).resolves.toBe('failed');
    expect(await readDoc(workerA.db, 'scheduled_work/job-7')).toMatchObject({ state: 'failed', last_error_code: 'JOB_KIND_UNKNOWN' });
  });

  it('the worker dies inside a job: after the leases end the next tick runs it again, and the effect still happens once', async () => {
    await seedJob('job-8');
    jobBehaviour = 'hang_once';
    const hung = new Promise<void>((resolve) => (jobHung = resolve));
    void runTick(deps(workerA));
    await hung;
    now = minutes(11);
    await expect(runTick(deps(workerB))).resolves.toMatchObject({ ran: true, jobs: { done: 1 } });
    expect(await effects('job-8')).toBe(1);
    expect(await readDoc(workerA.db, 'scheduled_work/job-8')).toMatchObject({ state: 'done', attempts: 2 });
  });

  it('a job that is not due yet is left alone', async () => {
    await seedJob('job-9', { next_run_at: minutes(30) });
    await runTick(deps(workerA));
    expect(jobCalls).toEqual([]);
    expect(await readDoc(workerA.db, 'scheduled_work/job-9')).toMatchObject({ state: 'scheduled', attempts: 0 });
  });
});

describe('worker HTTP: the tick (Scheduler), outbox tasks (Cloud Tasks) and health', () => {
  it('routes, methods and bodies; responses carry counts only', async () => {
    const id = await seedEntry(REQUESTER, { audience: 'requester' });
    const server: Server = createServer(createWorkerHandler({ notificationMode: 'local', operations: workerOperations(deps(workerA)), log: consoleWorkerLogger }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    const call = async (method: string, path: string, body?: string) => {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, { method, ...(body === undefined ? {} : { body, headers: { 'content-type': 'application/json' } }) });
      const text = await response.text();
      return { status: response.status, text, body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>) };
    };
    try {
      expect(await call('GET', '/healthz')).toMatchObject({ status: 200, body: { status: 'ok', service: 'gm-worker', notificationMode: 'local' } });
      const task = await call('POST', '/internal/tasks/outbox', JSON.stringify({ outbox_ids: [id] }));
      expect(task).toMatchObject({ status: 200, body: { results: { sent: 1 } } });
      expect(await call('POST', '/internal/tasks/outbox', JSON.stringify({ outbox_ids: [id] }))).toMatchObject({ status: 200, body: { results: { skipped: 1 } } });
      const tick = await call('POST', '/internal/tick');
      expect(tick).toMatchObject({ status: 200, body: { ran: true } });
      expect((await call('GET', '/internal/tick')).status).toBe(405);
      expect((await call('POST', '/internal/tasks/outbox', '{not json')).status).toBe(400);
      expect(await call('POST', '/internal/tasks/outbox', JSON.stringify({ outbox_ids: [REQUESTER] }))).toMatchObject({ status: 400, body: { error: 'TASK_INVALID' } });
      expect((await call('POST', '/internal/tasks/outbox', JSON.stringify({ outbox_ids: [id], pad: 'x'.repeat(70_000) }))).status).toBe(413);
      expect((await call('GET', '/internal/unknown')).status).toBe(404);
      for (const response of [task, tick]) expect(response.text).not.toMatch(/@|DEV-/);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('local adapter only; nothing left the machine; logs hold no personal data (runs last)', () => {
  it('no network call outside the emulators', () => {
    expect(blockedHosts).toEqual([]);
  });

  it('worker logs have events but no e-mail, name, Slack ID, request number or handler text', () => {
    const text = logs.lines.join('\n');
    expect(text).toContain('"event":"notification.local"');
    expect(text).toContain('"event":"outbox.settled"');
    for (const secret of [...Object.keys(NAMES), NOBODY, ...Object.values(NAMES), ...Object.values(SLACK_IDS), 'DEV-0', 'blew up', 'socket hang up']) {
      expect(text).not.toContain(secret);
    }
  });
});
