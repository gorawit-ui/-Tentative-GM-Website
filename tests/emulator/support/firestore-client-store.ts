// Test-only adapter: runs the API command store port (apps/api/src/commands) on the Firestore
// emulator through the web SDK with the emulator's `owner` token (bypasses Rules, like the Admin
// SDK the API will use). A01 adds the Admin SDK adapter and re-runs these tests against it.
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  runTransaction,
  setDoc,
  deleteDoc,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import type { CommandStore, StoredData } from '../../../apps/api/src/commands/index';

const project = process.env.GCLOUD_PROJECT ?? '';
const [host = '', port = ''] = (process.env.FIRESTORE_EMULATOR_HOST ?? '').split(':');

/** Generous on purpose: the web SDK retries contended transactions optimistically (S08 log). */
export const TEST_MAX_ATTEMPTS = 50;

let appCount = 0;

export interface EmulatorClient {
  readonly db: Firestore;
  readonly store: CommandStore;
  /** Transaction callback runs, including retries after contention. */
  attempts(): number;
  close(): Promise<void>;
}

/** One client per simulated API instance. */
export function emulatorClient(): EmulatorClient {
  if (!project.startsWith('demo-') || host === '' || port === '') {
    throw new Error('emulator tests need a demo-* project and FIRESTORE_EMULATOR_HOST (npm run test:rules)');
  }
  const app: FirebaseApp = initializeApp({ projectId: project }, `s08-client-${appCount++}`);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, host, Number(port), { mockUserToken: 'owner' });
  let attempts = 0;
  const store: CommandStore = {
    runTransaction: (work) =>
      runTransaction(
        db,
        (transaction) => {
          attempts += 1;
          return work({
            get: async (path) => {
              const snapshot = await transaction.get(doc(db, path));
              return snapshot.exists() ? (snapshot.data() as StoredData) : undefined;
            },
            set: (path, data) => {
              transaction.set(doc(db, path), data as DocumentData);
            },
            update: (path, data) => {
              transaction.update(doc(db, path), data as DocumentData);
            },
          });
        },
        { maxAttempts: TEST_MAX_ATTEMPTS },
      ),
  };
  return { db, store, attempts: () => attempts, close: () => deleteApp(app) };
}

export async function readDoc(db: Firestore, path: string): Promise<DocumentData | undefined> {
  const snapshot = await getDoc(doc(db, path));
  return snapshot.exists() ? snapshot.data() : undefined;
}

export async function readCollection(db: Firestore, path: string): Promise<Map<string, DocumentData>> {
  const snapshot = await getDocs(collection(db, path));
  return new Map(snapshot.docs.map((document) => [document.id, document.data()]));
}

export async function writeDoc(db: Firestore, path: string, data: DocumentData): Promise<void> {
  await setDoc(doc(db, path), data);
}

export async function removeDoc(db: Firestore, path: string): Promise<void> {
  await deleteDoc(doc(db, path));
}

/** Empties the emulator database between tests (emulator REST endpoint, owner token). */
export async function clearFirestore(): Promise<void> {
  const response = await fetch(
    `http://${host}:${port}/emulator/v1/projects/${project}/databases/(default)/documents`,
    { method: 'DELETE', headers: { Authorization: 'Bearer owner' } },
  );
  if (!response.ok) throw new Error(`clearing the Firestore emulator failed: ${response.status}`);
}
