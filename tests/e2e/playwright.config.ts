// `npm run test:e2e` runs this config inside `firebase emulators:exec` (scripts/emulators.mjs).
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

// Viewports from TEST-CHECKLIST §4. Chromium only (Part 6 §6.3: Playwright/local Chromium).
const VIEWPORTS = [
  { name: 'mobile-360x640', width: 360, height: 640, mobile: true },
  { name: 'mobile-390x844', width: 390, height: 844, mobile: true },
  { name: 'laptop-1366x768', width: 1366, height: 768, mobile: false },
  { name: 'desktop-1440x900', width: 1440, height: 900, mobile: false },
];

export default defineConfig({
  testDir: './specs',
  outputDir: '../../test-results/e2e',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../../playwright-report' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    trace: 'retain-on-failure',
  },
  projects: VIEWPORTS.map(({ name, width, height, mobile }) => ({
    name,
    use: { browserName: 'chromium', viewport: { width, height }, isMobile: mobile, hasTouch: mobile },
  })),
  // Tests run against the production build, not the dev server.
  webServer: {
    command: 'npm run build -w @gm/web && npm run preview -w @gm/web',
    cwd: repoRoot,
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
