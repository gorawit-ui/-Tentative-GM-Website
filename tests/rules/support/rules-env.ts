// S10 — one Rules test environment per test file on the local emulators (demo-* project only; see
// setup.ts). Seeds the ACL matrix fixture with Rules disabled and hands out one client per identity.
import { readFileSync } from 'node:fs';
import {
  initializeTestEnvironment,
  type RulesTestContext,
  type RulesTestEnvironment,
  type TokenOptions,
} from '@firebase/rules-unit-testing';
import { SUBJECTS, seedDocuments, type SubjectKey } from '../fixtures/acl-matrix';

export type ClientFirestore = ReturnType<RulesTestContext['firestore']>;
export type ClientStorage = ReturnType<RulesTestContext['storage']>;

export const FIRESTORE_RULES_PATH = new URL('../../../infra/firestore.rules', import.meta.url);
export const STORAGE_RULES_PATH = new URL('../../../infra/storage.rules', import.meta.url);

export async function startRulesEnvironment(): Promise<RulesTestEnvironment> {
  const env = await initializeTestEnvironment({
    projectId: process.env.GCLOUD_PROJECT,
    firestore: { rules: readFileSync(FIRESTORE_RULES_PATH, 'utf8') },
    storage: { rules: readFileSync(STORAGE_RULES_PATH, 'utf8') },
  });
  await env.clearFirestore();
  await seed(env, seedDocuments());
  return env;
}

export async function seed(env: RulesTestEnvironment, documents: ReadonlyMap<string, object>): Promise<void> {
  await env.withSecurityRulesDisabled(async (admin) => {
    const db = admin.firestore();
    await Promise.all([...documents].map(([path, data]) => db.doc(path).set(data)));
  });
}

/** A signed-in (or signed-out) client; cached so thousands of matrix cells reuse a few apps. */
export function clientFor(env: RulesTestEnvironment, cache: Map<string, RulesTestContext>, key: string, uid: string | null, token?: TokenOptions): RulesTestContext {
  let context = cache.get(key);
  if (context === undefined) {
    context = uid === null ? env.unauthenticatedContext() : env.authenticatedContext(uid, token);
    cache.set(key, context);
  }
  return context;
}

export function subjectClient(env: RulesTestEnvironment, cache: Map<string, RulesTestContext>, key: SubjectKey): RulesTestContext {
  const { auth } = SUBJECTS[key];
  return clientFor(env, cache, `subject:${key}`, auth?.uid ?? null, auth?.token);
}

export const parentOf = (path: string): string => path.slice(0, path.lastIndexOf('/'));
