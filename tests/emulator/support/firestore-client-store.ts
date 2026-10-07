// FU-05 — the emulator tests run the API command store through the real Firestore Admin SDK
// (firebase-admin, Rules bypassed as in production) instead of the web SDK with the emulator's
// `owner` token. One Admin app per simulated API instance. Emulator only (demo-* project).
import { generateKeyPairSync } from 'node:crypto';
import { cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { adminCommandStore, fromStored, toStored } from '../../../apps/api/src/firestore/admin-store';
import type { CommandStore, StoredData } from '../../../apps/api/src/commands/index';

const project = process.env.GCLOUD_PROJECT ?? '';

/** Contention budget for the tests (FU-05: the web SDK default of 5 was not enough in S08). */
export const TEST_MAX_ATTEMPTS = 50;

let appCount = 0;

/**
 * The emulators ignore credentials; a certificate credential with a throwaway key only stops the SDK
 * from looking for Application Default Credentials (which probes the GCE metadata server). The key
 * is generated here, never leaves this process and is valid for no real project.
 */
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
export const EMULATOR_ONLY_CREDENTIAL = cert({ projectId: project, clientEmail: `emulator-only@${project}.iam.gserviceaccount.com`, privateKey });

export interface EmulatorClient {
  readonly db: Firestore;
  readonly store: CommandStore;
  /** Transaction callback runs, including retries after contention. */
  attempts(): number;
  close(): Promise<void>;
}

function requireEmulator(): void {
  if (!project.startsWith('demo-') || !process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('emulator tests need a demo-* project and FIRESTORE_EMULATOR_HOST (npm run test:rules)');
  }
}

/** One Admin SDK app per simulated API instance. */
export function emulatorClient(): EmulatorClient {
  requireEmulator();
  const app: App = initializeApp({ projectId: project, credential: EMULATOR_ONLY_CREDENTIAL }, `s08-admin-${appCount++}`);
  const db = getFirestore(app);
  const inner = adminCommandStore(db, { maxAttempts: TEST_MAX_ATTEMPTS });
  let attempts = 0;
  const store: CommandStore = {
    runTransaction: (work) =>
      inner.runTransaction((transaction) => {
        attempts += 1;
        return work(transaction);
      }),
  };
  return { db, store, attempts: () => attempts, close: () => deleteApp(app) };
}

/** A stored document as the API sees it (Timestamps back to epoch milliseconds). */
export async function readDoc(db: Firestore, path: string): Promise<StoredData | undefined> {
  const snapshot = await db.doc(path).get();
  return snapshot.exists ? fromStored(snapshot.data() as DocumentData) : undefined;
}

export async function readCollection(db: Firestore, path: string): Promise<Map<string, StoredData>> {
  const snapshot = await db.collection(path).get();
  return new Map(snapshot.docs.map((document) => [document.id, fromStored(document.data())]));
}

export async function writeDoc(db: Firestore, path: string, data: object): Promise<void> {
  await db.doc(path).set(toStored(data));
}

export async function removeDoc(db: Firestore, path: string): Promise<void> {
  await db.doc(path).delete();
}

/** Empties the emulator database between tests through the Admin SDK (no special token). */
export async function clearFirestore(): Promise<void> {
  requireEmulator();
  const app = initializeApp({ projectId: project, credential: EMULATOR_ONLY_CREDENTIAL }, `s08-clear-${appCount++}`);
  try {
    const db = getFirestore(app);
    for (const collection of await db.listCollections()) await db.recursiveDelete(collection);
  } finally {
    await deleteApp(app);
  }
}

/** The raw stored value (to check that instants are real Timestamps, FU-05). */
export async function readRaw(db: Firestore, path: string): Promise<DocumentData | undefined> {
  const snapshot = await db.doc(path).get();
  return snapshot.exists ? snapshot.data() : undefined;
}
