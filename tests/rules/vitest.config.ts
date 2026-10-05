// `npm run test:rules` runs this config inside `firebase emulators:exec` (scripts/emulators.mjs):
// the Security Rules matrix (tests/rules) and, from S08, transaction tests on the same Firestore
// emulator (tests/emulator; Part 6 §6.3 “Firebase Emulator Suite สำหรับ Rules/transactions”).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    name: 'rules',
    include: ['tests/rules/**/*.test.ts', 'tests/emulator/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/rules/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
