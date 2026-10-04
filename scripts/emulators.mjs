#!/usr/bin/env node
// @ts-check
/**
 * Runs the Firebase Emulator Suite for local work only (BUILD-COMMANDS: dev, test:rules, test:e2e).
 *
 *   node scripts/emulators.mjs <dev|rules|e2e> [extra args for the inner command]
 *
 * Every profile uses a `demo-*` project ID, which the Firebase CLI treats as offline-only:
 * no real Firebase/Google Cloud project is read, created or deployed. Credential and
 * project-selector variables are removed from the environment before anything starts.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AMBIENT_PROJECT_ENV_VARS, CREDENTIAL_ENV_VARS } from './lib/env-safety.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @type {Record<string, { project: string, only: string, ui: boolean, command: string }>} */
const PROFILES = {
  // Vite + API + worker against local emulators; worker notifications stay local-only.
  dev: {
    project: 'demo-gm-local',
    only: 'auth,firestore,storage',
    ui: true,
    command: 'npm run dev:apps',
  },
  // Security Rules test matrix (Firestore + Storage).
  rules: {
    project: 'demo-gm-rules',
    only: 'firestore,storage',
    ui: false,
    command: 'vitest run --config tests/rules/vitest.config.ts',
  },
  // Playwright against the built web app with seeded Thai fixtures.
  e2e: {
    project: 'demo-gm-e2e',
    only: 'auth,firestore,storage',
    ui: false,
    command: 'playwright test --config tests/e2e/playwright.config.ts',
  },
};

const [profileName, ...passThrough] = process.argv.slice(2);
const profile = profileName === undefined ? undefined : PROFILES[profileName];
if (profile === undefined) {
  console.error(`usage: node scripts/emulators.mjs <${Object.keys(PROFILES).join('|')}> [args...]`);
  process.exit(2);
}
if (!profile.project.startsWith('demo-')) {
  console.error(`emulators: refusing non-demo project "${profile.project}"; local runs must never touch a real project.`);
  process.exit(2);
}

/**
 * The inner command runs through a shell, so reject characters it would interpret.
 * @param {string} arg
 */
function quoteArg(arg) {
  if (/["\\$`]/.test(arg)) {
    console.error(`emulators: unsupported characters in argument: ${arg}`);
    process.exit(2);
  }
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `"${arg}"`;
}
const innerCommand = [profile.command, ...passThrough.map(quoteArg)].join(' ');

/** @type {NodeJS.ProcessEnv} */
const env = { ...process.env, NO_UPDATE_NOTIFIER: '1' };
for (const name of [...AMBIENT_PROJECT_ENV_VARS, ...CREDENTIAL_ENV_VARS, 'GM_DEV_PROJECT_ID']) {
  delete env[name];
}

const firebaseBin = createRequire(import.meta.url).resolve('firebase-tools/lib/bin/firebase.js');
const args = [
  firebaseBin,
  'emulators:exec',
  '--project',
  profile.project,
  '--only',
  profile.only,
  ...(profile.ui ? ['--ui'] : []),
  innerCommand,
];

console.info(`emulators: profile=${profileName} project=${profile.project} only=${profile.only} (local emulators only)`);
const child = spawn(process.execPath, args, { cwd: repoRoot, env, stdio: 'inherit' });

// Ctrl-C reaches the whole foreground process group, including the Firebase CLI, which then
// shuts the (detached) Java emulators down cleanly. Forwarding SIGINT again would count as a
// second Ctrl-C and force-quit them, so this wrapper only waits. SIGTERM is targeted at one
// process, so it is forwarded.
process.on('SIGINT', () => {});
process.on('SIGTERM', () => child.kill('SIGTERM'));

child.on('error', (error) => {
  console.error(`emulators: could not start the Firebase CLI: ${error.message}`);
  process.exit(1);
});
child.on('exit', (code) => {
  process.exit(code ?? 1);
});
