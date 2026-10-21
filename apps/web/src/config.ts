// A09 — the web app's Firebase and API settings, from Vite build variables. Until P7-INFRA-01 names the
// real project (FU-37), a build can only run against the local emulators of a `demo-*` project: every
// endpoint must be on this machine, so no real Google Cloud / Firebase project is ever reached.

export interface WebConfig {
  readonly projectId: string;
  /** Any value works with the Auth emulator; not a secret. */
  readonly apiKey: string;
  readonly authEmulatorUrl: string;
  readonly firestoreEmulator: { readonly host: string; readonly port: number };
  readonly apiBaseUrl: string;
}

export type WebEnv = Readonly<Record<string, string | undefined>>;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const DEMO_PROJECT = /^demo-[a-z0-9-]+$/;

function value(env: WebEnv, name: string, fallback: string): string {
  const given = env[name]?.trim();
  return given === undefined || given === '' ? fallback : given;
}

/** An http(s) URL on this machine, without a trailing slash. */
function localUrl(raw: string, name: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} must be a URL on this machine`);
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !LOOPBACK.has(url.hostname) || url.pathname.replace(/\/+$/, '') !== '' || url.search !== '') {
    throw new Error(`${name} must be http://127.0.0.1:<port> or http://localhost:<port> (emulators only until P7-INFRA-01)`);
  }
  return url.origin;
}

function localHost(raw: string, name: string): { host: string; port: number } {
  const match = /^(127\.0\.0\.1|localhost|\[::1\]):(\d{2,5})$/.exec(raw);
  const port = Number(match?.[2]);
  if (match === null || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be 127.0.0.1:<port> or localhost:<port> (emulators only until P7-INFRA-01)`);
  }
  return { host: match[1] ?? '127.0.0.1', port };
}

export function resolveWebConfig(env: WebEnv): WebConfig {
  const projectId = env.VITE_GM_FIREBASE_PROJECT_ID ?? 'demo-gm-local';
  if (!DEMO_PROJECT.test(projectId)) {
    throw new Error('VITE_GM_FIREBASE_PROJECT_ID must be a demo-* emulator project; a real project waits for P7-INFRA-01');
  }
  return {
    projectId,
    apiKey: 'demo-api-key',
    authEmulatorUrl: localUrl(value(env, 'VITE_GM_AUTH_EMULATOR_URL', 'http://127.0.0.1:9099'), 'VITE_GM_AUTH_EMULATOR_URL'),
    firestoreEmulator: localHost(value(env, 'VITE_GM_FIRESTORE_EMULATOR_HOST', '127.0.0.1:8080'), 'VITE_GM_FIRESTORE_EMULATOR_HOST'),
    apiBaseUrl: localUrl(value(env, 'VITE_GM_API_BASE_URL', 'http://127.0.0.1:8787'), 'VITE_GM_API_BASE_URL'),
  };
}
