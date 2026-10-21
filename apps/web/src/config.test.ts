// A09 — the web app's Firebase/API settings. Until P7-INFRA-01 gives the real project, the app only
// runs against the local emulators of a `demo-*` project (no real Google Cloud / Firebase project can
// be reached from a build), and every endpoint is on this machine.
import { describe, expect, it } from 'vitest';
import { resolveWebConfig } from './config';

describe('resolveWebConfig', () => {
  it('nothing set → the local dev emulators of demo-gm-local and the local API', () => {
    expect(resolveWebConfig({})).toEqual({
      projectId: 'demo-gm-local',
      apiKey: 'demo-api-key',
      authEmulatorUrl: 'http://127.0.0.1:9099',
      firestoreEmulator: { host: '127.0.0.1', port: 8080 },
      apiBaseUrl: 'http://127.0.0.1:8787',
    });
  });

  it('the e2e build names its demo project and ports', () => {
    expect(
      resolveWebConfig({
        VITE_GM_FIREBASE_PROJECT_ID: 'demo-gm-e2e',
        VITE_GM_AUTH_EMULATOR_URL: 'http://localhost:9199',
        VITE_GM_FIRESTORE_EMULATOR_HOST: 'localhost:8181',
        VITE_GM_API_BASE_URL: 'http://localhost:8788/',
      }),
    ).toEqual({
      projectId: 'demo-gm-e2e',
      apiKey: 'demo-api-key',
      authEmulatorUrl: 'http://localhost:9199',
      firestoreEmulator: { host: 'localhost', port: 8181 },
      apiBaseUrl: 'http://localhost:8788',
    });
  });

  it.each(['gm-prod', 'tdfb-gm-dev', 'demo', 'DEMO-gm', ''])('refuses a project that is not demo-* (%j): no real project before P7-INFRA-01', (projectId) => {
    expect(() => resolveWebConfig({ VITE_GM_FIREBASE_PROJECT_ID: projectId })).toThrow(/demo-/);
  });

  it.each([
    ['VITE_GM_AUTH_EMULATOR_URL', 'https://identitytoolkit.googleapis.com'],
    ['VITE_GM_AUTH_EMULATOR_URL', 'http://10.0.0.5:9099'],
    ['VITE_GM_FIRESTORE_EMULATOR_HOST', 'firestore.googleapis.com:443'],
    ['VITE_GM_FIRESTORE_EMULATOR_HOST', '127.0.0.1'],
    ['VITE_GM_API_BASE_URL', 'https://gm-api.example.com'],
    ['VITE_GM_API_BASE_URL', 'http://127.0.0.1.example.com:8787'],
  ])('refuses %s = %j: emulators and API stay on this machine', (name, value) => {
    expect(() => resolveWebConfig({ [name]: value })).toThrow();
  });
});
