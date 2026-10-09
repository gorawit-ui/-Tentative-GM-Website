// `npm run test:e2e` runs this config inside `firebase emulators:exec` (scripts/emulators.mjs).
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
/** The e2e profile's project in scripts/emulators.mjs. */
const E2E_PROJECT = 'demo-gm-e2e';

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
  // Tests run against the production builds, not the dev servers: the web app built for the e2e
  // emulators (A09: demo-* project only, everything on 127.0.0.1) and the API on the same emulators
  // (the login page's pre-login contact box reads it). The emulator variables come from
  // `firebase emulators:exec` and are passed on to both.
  webServer: [
    {
      command: 'npm run build -w @gm/web && npm run preview -w @gm/web',
      cwd: repoRoot,
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        VITE_GM_FIREBASE_PROJECT_ID: E2E_PROJECT,
        VITE_GM_AUTH_EMULATOR_URL: 'http://127.0.0.1:9099',
        VITE_GM_FIRESTORE_EMULATOR_HOST: '127.0.0.1:8080',
        VITE_GM_API_BASE_URL: 'http://127.0.0.1:8787',
      },
    },
    {
      command: 'npm run build -w @gm/api && npm run start -w @gm/api',
      cwd: repoRoot,
      url: 'http://127.0.0.1:8787/healthz',
      reuseExistingServer: false,
      timeout: 120_000,
      env: { HOST: '127.0.0.1', PORT: '8787', GM_ENVIRONMENT: 'local', GM_ATTACHMENT_BUCKET: `${E2E_PROJECT}.appspot.com` },
    },
  ],
});
