// `npm run test:unit` — Vitest unit projects only. Rules tests (tests/rules) and E2E
// (tests/e2e) need the emulators and run through scripts/emulators.mjs.
import { defineConfig } from 'vitest/config';
import { UNIT_TEST_TIME_ZONE } from './tests/setup/determinism.ts';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/unit.ts'],
    env: { TZ: UNIT_TEST_TIME_ZONE },
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    projects: [
      { extends: true, test: { name: 'time', include: ['packages/time/src/**/*.test.ts'] } },
      { extends: true, test: { name: 'domain', include: ['packages/domain/src/**/*.test.ts'] } },
      { extends: true, test: { name: 'contracts', include: ['packages/contracts/src/**/*.test.ts'] } },
      { extends: true, test: { name: 'api', include: ['apps/api/src/**/*.test.ts'] } },
      { extends: true, test: { name: 'worker', include: ['apps/worker/src/**/*.test.ts'] } },
      { extends: true, test: { name: 'web', include: ['apps/web/src/**/*.test.{ts,tsx}'] } },
      {
        extends: true,
        test: {
          name: 'tooling',
          include: ['scripts/**/*.test.mjs', 'tests/setup/**/*.test.ts', 'tests/rules/fixtures/**/*.test.ts'],
        },
      },
    ],
  },
});
