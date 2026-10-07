// S12 — the API endpoints wired to the real firebase-admin SDK against the local emulators
// (Firestore, Auth, Storage). Signed URLs are signed locally with a throwaway key generated here;
// the network guard (tests/rules/network-guard.ts) refuses any host other than the emulators.
// Sign-in goes through the Auth emulator's Google flow, so tokens carry sign_in_provider google.com.
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import { cert, deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { consoleLogger, storageUrlSigner, type ApiDeps, type StorageBucket, type StorageFile } from '../../../apps/api/src/endpoints/index';
import type { SignableBucket } from '../../../apps/api/src/endpoints/url-signer';

const project = process.env.GCLOUD_PROJECT ?? '';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '';

let appCount = 0;

export interface SignedIn {
  readonly uid: string;
  readonly idToken: string;
}

/** Everything the console and the process wrote while the harness was open. */
export interface LogCapture {
  readonly lines: string[];
  stop(): void;
}

export function captureLogs(): LogCapture {
  const lines: string[] = [];
  const restore: (() => void)[] = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    const original = console[method];
    console[method] = (...args: unknown[]) => {
      lines.push(args.map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg) ?? String(arg))).join(' '));
    };
    restore.push(() => {
      console[method] = original;
    });
  }
  for (const stream of [process.stdout, process.stderr]) {
    const original = stream.write.bind(stream);
    stream.write = ((chunk: unknown, ...rest: unknown[]) => {
      lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8'));
      return (original as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof stream.write;
    restore.push(() => {
      stream.write = original as typeof stream.write;
    });
  }
  return { lines, stop: () => restore.forEach((undo) => undo()) };
}

export interface ApiHarness {
  readonly deps: ApiDeps;
  readonly db: Firestore;
  readonly bucket: { file(path: string): StorageFile & { save(data: Uint8Array, options: { contentType: string }): Promise<void> } };
  /** Mutable clock for the endpoints. */
  setNow(instant: number): void;
  signIn(email: string, emailVerified?: boolean): Promise<SignedIn>;
  close(): Promise<void>;
}

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function apiHarness(start: number): ApiHarness {
  if (!project.startsWith('demo-') || authHost === '' || !process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    throw new Error('API tests need the Auth, Firestore and Storage emulators of a demo-* project (npm run test:rules)');
  }
  // A throwaway signing key: it never leaves this process and signs URLs for the Storage emulator only.
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const app: App = initializeApp(
    {
      projectId: project,
      credential: cert({ projectId: project, clientEmail: `url-signer@${project}.iam.gserviceaccount.com`, privateKey }),
      storageBucket: `${project}.appspot.com`,
    },
    `s12-api-${appCount++}`,
  );
  const db = getFirestore(app);
  const bucket = getStorage(app).bucket();
  let now = start;
  const deps: ApiDeps = {
    db,
    auth: getAuth(app),
    bucket: bucket as unknown as StorageBucket,
    signer: storageUrlSigner(bucket as unknown as SignableBucket),
    now: () => now,
    newId: () => `up-${randomUUID()}`,
    log: consoleLogger,
  };
  return {
    deps,
    db,
    bucket: bucket as unknown as ApiHarness['bucket'],
    setNow: (instant) => {
      now = instant;
    },
    async signIn(email, emailVerified = true) {
      const googleIdToken = `${base64url({ alg: 'none', typ: 'JWT' })}.${base64url({
        sub: `google-${email}`,
        email,
        email_verified: emailVerified,
        iss: 'https://accounts.google.com',
        aud: 'gm-one-stop-test',
      })}.`;
      const response = await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=emulator`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requestUri: 'http://localhost',
          postBody: `id_token=${googleIdToken}&providerId=google.com`,
          returnSecureToken: true,
        }),
      });
      if (!response.ok) throw new Error(`Auth emulator sign-in failed: ${response.status}`);
      const body = (await response.json()) as { idToken: string; localId: string };
      return { uid: body.localId, idToken: body.idToken };
    },
    close: () => deleteApp(app),
  };
}

/** Empties the Auth emulator between test files. */
export async function clearAuth(): Promise<void> {
  const response = await fetch(`http://${authHost}/emulator/v1/projects/${project}/accounts`, { method: 'DELETE' });
  if (!response.ok) throw new Error(`clearing the Auth emulator failed: ${response.status}`);
}
