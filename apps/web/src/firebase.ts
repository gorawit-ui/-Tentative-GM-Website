// A09 — Firebase for the web app, local emulators only (config.ts refuses anything but a demo-*
// project on this machine). Auth keeps the signed-in user in IndexedDB like any Firebase web app;
// Firestore keeps nothing on the device (memory cache only — CLAUDE.md “no private PWA cache”), and
// logout clears the rest (device.ts).
import { initializeApp } from 'firebase/app';
import { browserLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, memoryLocalCache } from 'firebase/firestore';
import { resolveWebConfig, type WebEnv } from './config';

export const webConfig = resolveWebConfig(import.meta.env as WebEnv);

const app = initializeApp({
  apiKey: webConfig.apiKey,
  projectId: webConfig.projectId,
  // Needed by the SDK; with the emulator nothing is loaded from this domain.
  authDomain: `${webConfig.projectId}.firebaseapp.com`,
});

export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});
// No emulator banner over the page (it would cover the bottom navigation); the build is emulator-only.
connectAuthEmulator(auth, webConfig.authEmulatorUrl, { disableWarnings: true });

export const db = initializeFirestore(app, { localCache: memoryLocalCache() });
connectFirestoreEmulator(db, webConfig.firestoreEmulator.host, webConfig.firestoreEmulator.port);
