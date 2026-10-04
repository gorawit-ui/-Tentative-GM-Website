// S00 skeleton matrix (BUILD-COMMANDS test:rules): until S10–S12 write the real Rules
// test-first, every direct client read and write is denied for every identity.
// Collection names follow Part 6 §6.4; identities and data are synthetic.
import { readFileSync } from 'node:fs';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

type Firestore = ReturnType<RulesTestContext['firestore']>;
type Storage = ReturnType<RulesTestContext['storage']>;

const IDENTITIES: Record<string, (env: RulesTestEnvironment) => RulesTestContext> = {
  unauthenticated: (env) => env.unauthenticatedContext(),
  'corporate verified @tdfb.co': (env) =>
    env.authenticatedContext('s00-fixture-active', {
      email: 's00.fixture.active@tdfb.co',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    }),
  'non-corporate verified': (env) =>
    env.authenticatedContext('s00-fixture-outsider', {
      email: 's00.fixture.outsider@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
    }),
};

const DOCUMENTS = [
  'request_summaries/S00-FIXTURE',
  'requests/S00-FIXTURE',
  'requests/S00-FIXTURE/history/event-01',
  'gm_request_summaries/S00-FIXTURE',
  'access/s00-fixture-active',
  'people/person-s00-fixture',
  'outbox/s00-fixture-message',
];
const SEED = { fixture: 'S00', note: 'ข้อมูลทดสอบเท่านั้น' };

const parentOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
const DOCUMENT_OPERATIONS: Record<string, (db: Firestore, path: string) => Promise<unknown>> = {
  get: (db, path) => db.doc(path).get(),
  list: (db, path) => db.collection(parentOf(path)).get(),
  create: (db, path) => db.doc(`${parentOf(path)}/s00-new-document`).set(SEED),
  update: (db, path) => db.doc(path).update({ fixture: 'S00-changed' }),
  delete: (db, path) => db.doc(path).delete(),
};

const OBJECTS = ['requests/S00-FIXTURE/attachments/photo-01.jpg', 'pending/s00-fixture-active/upload-01.jpg'];
const OBJECT_OPERATIONS: Record<string, (storage: Storage, path: string) => Promise<unknown>> = {
  read: (storage, path) => storage.ref(path).getMetadata(),
  list: (storage, path) => storage.ref(parentOf(path)).listAll(),
  write: async (storage, path) => storage.ref(path).putString('s00', 'raw', { contentType: 'image/jpeg' }),
  delete: (storage, path) => storage.ref(path).delete(),
};

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT,
    firestore: { rules: readFileSync(new URL('../../infra/firestore.rules', import.meta.url), 'utf8') },
    storage: { rules: readFileSync(new URL('../../infra/storage.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (admin) => {
    await Promise.all(DOCUMENTS.map((path) => admin.firestore().doc(path).set(SEED)));
    for (const path of OBJECTS) {
      await admin.storage().ref(path).putString('s00', 'raw', { contentType: 'image/jpeg' });
    }
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('control: fixtures exist (denials below come from Rules, not missing data)', () => {
  it('reads every seeded document and object with Rules disabled', async () => {
    await env.withSecurityRulesDisabled(async (admin) => {
      for (const path of DOCUMENTS) {
        expect((await admin.firestore().doc(path).get()).data()).toEqual(SEED);
      }
      for (const path of OBJECTS) {
        expect((await admin.storage().ref(path).getMetadata()).fullPath).toBe(path);
      }
    });
  });
});

describe.each(Object.entries(IDENTITIES))('%s', (_identity, contextFor) => {
  describe.each(DOCUMENTS)('Firestore %s', (path) => {
    it.each(Object.entries(DOCUMENT_OPERATIONS))('%s → denied', async (_operation, run) => {
      await assertFails(run(contextFor(env).firestore(), path));
    });
  });

  describe.each(OBJECTS)('Storage %s', (path) => {
    it.each(Object.entries(OBJECT_OPERATIONS))('%s → denied', async (_operation, run) => {
      await assertFails(run(contextFor(env).storage(), path));
    });
  });
});
