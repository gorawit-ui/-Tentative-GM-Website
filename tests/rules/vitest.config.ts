// `npm run test:rules` runs this config inside `firebase emulators:exec` (scripts/emulators.mjs).
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  test: {
    name: 'rules',
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./tests/rules/setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
