// A09 — `GET /api/public/contact` on the emulators: the contact box of the login page (A1.3, UI-01)
// needs no sign-in and gives only the Admin's pre-login subset of `content_pages/contact` (Part 6 §6.4).
// Kept for a minute (one read), however many people open the login page. Emulators only.
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminCommandStore } from '../../apps/api/src/firestore/admin-store';
import { transactionPeopleDirectory, transactionRoutingDirectory } from '../../apps/api/src/firestore/directories';
import { createApiHandler } from '../../apps/api/src/http/app';
import { CommandRejected } from '../../apps/api/src/commands/index';
import { apiHarness, captureLogs, type ApiHarness, type LogCapture } from './support/api-harness';
import { clearFirestore } from './support/firestore-client-store';

const NOW = Date.parse('2027-01-11T09:00:00+07:00');
const APP_ORIGIN = 'https://gm-dev.tdfb.co';
const PRIVATE = 'ข้อมูลหลังเข้าสู่ระบบเท่านั้น — ห้ามแสดงก่อนเข้าสู่ระบบ';

let harness: ApiHarness;
let logs: LogCapture;
let server: Server;
let url = '';
let tests = 0;

const contactDoc = (label: string) => ({
  title: 'ติดต่อ GM',
  body: PRIVATE,
  prelogin_contacts: [
    { label, contact_name: 'คุณตัวอย่าง (ทีม GM)', phone: '02-000-0000', email: 'gm.private@tdfb.co' },
    { label: 'แจ้งที่ห้องทีม GM', detail: 'อาคาร WH300 ชั้น 1 (ตัวอย่าง)' },
  ],
});

const get = (headers: Record<string, string> = { origin: APP_ORIGIN }) => fetch(`${url}/api/public/contact`, { headers });
const firstLabel = async () => ((await (await get()).json()) as { contacts: { label: string }[] }).contacts[0]?.label;

beforeAll(async () => {
  logs = captureLogs();
  harness = apiHarness(NOW);
  server = createServer(
    createApiHandler({
      api: harness.deps,
      commandStore: adminCommandStore(harness.db),
      environment: 'dev',
      allowedOrigins: [APP_ORIGIN],
      newRequestId: () => 'req-a09-unused',
      maintenanceCatalog: { resolve: async () => Promise.reject(new CommandRejected('CATALOG_NOT_READY', 'unused')) },
      peopleDirectory: transactionPeopleDirectory(),
      routingDirectory: transactionRoutingDirectory(),
      taskQueue: { enqueue: async () => undefined },
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  logs?.stop();
  await new Promise<void>((resolve) => server?.close(() => resolve()));
  await harness?.close();
});

beforeEach(async () => {
  await clearFirestore();
  // Each test starts after the previous one's cache ran out.
  tests += 1;
  harness.setNow(NOW + tests * 3_600_000);
});

describe('GET /api/public/contact', () => {
  it('no sign-in needed; only the pre-login entries and their display fields', async () => {
    await harness.db.doc('content_pages/contact').set(contactDoc('โทรหาทีม GM'));
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(APP_ORIGIN);
    const body = await response.json();
    expect(body).toEqual({
      contacts: [
        { label: 'โทรหาทีม GM', name: 'คุณตัวอย่าง (ทีม GM)', phone: '02-000-0000' },
        { label: 'แจ้งที่ห้องทีม GM', detail: 'อาคาร WH300 ชั้น 1 (ตัวอย่าง)' },
      ],
    });
    expect(JSON.stringify(body)).not.toContain(PRIVATE);
    expect(JSON.stringify(body)).not.toContain('gm.private@tdfb.co');
  });

  it('nothing set by the Admin yet → an empty list (the page says so), not an error', async () => {
    const response = await get();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ contacts: [] });
  });

  it('a token, even a bad one, is not looked at (nothing here depends on who asks)', async () => {
    await harness.db.doc('content_pages/contact').set(contactDoc('โทรหาทีม GM'));
    const response = await get({ origin: APP_ORIGIN, authorization: 'Bearer not-a-token' });
    expect(response.status).toBe(200);
  });

  it('kept for a minute however many times the page opens (one read); a change shows after the minute', async () => {
    await harness.db.doc('content_pages/contact').set(contactDoc('โทรหาทีม GM'));
    const start = NOW + tests * 3_600_000;
    for (let index = 0; index < 5; index += 1) await (await get()).json();
    await harness.db.doc('content_pages/contact').set(contactDoc('โทรหา GM (เบอร์ใหม่)'));
    harness.setNow(start + 59_000);
    expect(await firstLabel()).toBe('โทรหาทีม GM');
    harness.setNow(start + 60_000);
    expect(await firstLabel()).toBe('โทรหา GM (เบอร์ใหม่)');
  });

  it('only the app’s origins, like every other route', async () => {
    const response = await get({ origin: 'https://evil.example.com' });
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'ORIGIN_NOT_ALLOWED' });
  });

  it('POST is not allowed', async () => {
    const response = await fetch(`${url}/api/public/contact`, { method: 'POST', headers: { origin: APP_ORIGIN, 'content-type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(405);
  });

  it('the log has the route and status, never the contact details', async () => {
    await harness.db.doc('content_pages/contact').set(contactDoc('โทรหาทีม GM'));
    const before = logs.lines.length;
    await (await get()).json();
    const lines = logs.lines.slice(before).join('\n');
    expect(lines).toContain('public.contact');
    for (const secret of ['02-000-0000', 'คุณตัวอย่าง', 'WH300']) expect(lines).not.toContain(secret);
  });
});
