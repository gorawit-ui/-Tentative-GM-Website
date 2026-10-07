// S10 / D-ACL-5 — Storage: no client reads, lists, writes or deletes objects directly, whatever the
// role. Files are served by the API with short-lived signed URLs (S12). Emulator only.
import { assertFails, type RulesTestContext, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SUBJECT_KEYS } from './fixtures/acl-matrix';
import { STORAGE_SAMPLE_PATHS } from './fixtures/screen-sources';
import { parentOf, startRulesEnvironment, subjectClient, type ClientStorage } from './support/rules-env';

let env: RulesTestEnvironment;
const clients = new Map<string, RulesTestContext>();

const OPERATIONS: Record<string, (storage: ClientStorage, path: string) => Promise<unknown>> = {
  'read metadata': (storage, path) => storage.ref(path).getMetadata(),
  'download URL': (storage, path) => storage.ref(path).getDownloadURL(),
  list: (storage, path) => storage.ref(parentOf(path)).listAll(),
  'overwrite object': async (storage, path) => storage.ref(path).putString('s10', 'raw', { contentType: 'image/jpeg' }),
  'upload new object': async (storage, path) => storage.ref(`${parentOf(path)}/s10-new.jpg`).putString('s10', 'raw', { contentType: 'image/jpeg' }),
  delete: (storage, path) => storage.ref(path).delete(),
};

beforeAll(async () => {
  env = await startRulesEnvironment();
  await env.withSecurityRulesDisabled(async (admin) => {
    for (const path of STORAGE_SAMPLE_PATHS) await admin.storage().ref(path).putString('s10', 'raw', { contentType: 'image/jpeg' });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('control: the objects exist (denials below come from Rules, not missing files)', () => {
  it('reads every seeded object with Rules disabled', async () => {
    await env.withSecurityRulesDisabled(async (admin) => {
      for (const path of STORAGE_SAMPLE_PATHS) expect((await admin.storage().ref(path).getMetadata()).fullPath).toBe(path);
    });
  });
});

describe.each(SUBJECT_KEYS)('%s', (subjectKey) => {
  describe.each(STORAGE_SAMPLE_PATHS)('%s', (path) => {
    it.each(Object.entries(OPERATIONS))('%s → denied', async (_operation, run) => {
      await assertFails(run(subjectClient(env, clients, subjectKey).storage(), path));
    });
  });
});
