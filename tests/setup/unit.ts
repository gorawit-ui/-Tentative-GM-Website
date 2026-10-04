// Setup for every `npm run test:unit` project (see vitest.config.ts).
import { afterEach, beforeEach, vi } from 'vitest';
import { installNetworkBlock } from '../support/network-block.mjs';
import { UNIT_TEST_FIXED_NOW } from './determinism';

// Unit tests never reach Firebase, emulators or any other host. Emulator-backed tests live in
// tests/rules and tests/e2e and run through scripts/emulators.mjs instead.
installNetworkBlock({
  onAttempt: (description) => {
    throw new Error(`Unit tests must not use the network or emulators: ${description}`);
  },
});

// Frozen Date; timers stay real so async code still runs. Tests may call vi.setSystemTime().
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(UNIT_TEST_FIXED_NOW) });
});
afterEach(() => {
  vi.useRealTimers();
});
