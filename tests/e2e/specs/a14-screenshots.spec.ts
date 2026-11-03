// A14 — screenshots of every page this session builds or changes, at the four sizes, for
// docs/screenshots/A14.webp: step 4 (optional details; “อื่นๆ” to describe), sending, a lost reply, the
// interstitial again on send (FU-49), sent, “not set up” on send (503), and D-A13-5 (both choices on the
// bottom bar). Runs only when A14_SCREENSHOTS_DIR is set; nothing is created (the sends are mocked).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page, type Route } from '@playwright/test';
import { keepLocal, signIn } from '../support/app';

const OUT = process.env.A14_SCREENSHOTS_DIR;
const REPAIR = '/requests/new?type=maintenance&origin=requester';
const OK = { replayed: false, result: { request_id: 'req-a14-shot-0001', request_number: 'DEV-9401', status: 'queued', is_assigned: true, assignee_label: 'คุณจีเอ็ม ทดสอบ' } };
const MATCH = {
  request_id: 'req-a14-shot-0002',
  request_number: 'DEV-9402',
  summary_title: 'อินเทอร์เน็ต · Office 195',
  status: 'queued',
  is_assigned: false,
  location_label: 'Office 195',
  watcher_count: 1,
  created_at: 1793500000000,
  viewer: 'none',
};

type Mock = 'none' | 'slow' | 'lost' | 'duplicate' | 'ok' | 'not_ready';
interface Shot {
  readonly row: string;
  readonly label: string;
  readonly mock: Mock;
  readonly then: (page: Page) => Promise<void>;
}

const bar = (page: Page) => page.getByTestId('repair-action-bar');
const choice = (page: Page, name: string) => page.getByTestId('repair-choices').getByRole('button', { name, exact: true });
const send = (page: Page) => bar(page).getByRole('button', { name: /ส่งเรื่อง|ส่งอีกครั้ง|กำลังส่ง/ });

async function toStep4(page: Page, place: string, area: string, symptom: string): Promise<void> {
  await expect(page.getByTestId('repair-loading')).toHaveCount(0);
  await choice(page, place).click();
  await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
  await choice(page, area).click();
  await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
  await choice(page, symptom).click();
  await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
}

const SHOTS: readonly Shot[] = [
  {
    row: '01-step-4',
    label: 'step 4 title read-only',
    mock: 'none',
    then: async (page) => {
      await toStep4(page, 'Office 195', 'ไม่ระบุ', 'อินเทอร์เน็ต');
      await page.getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)').fill('ใช้ไม่ได้ทั้งชั้น 2 ตั้งแต่เช้า');
    },
  },
  {
    row: '02-other',
    label: 'other: must describe',
    mock: 'none',
    then: async (page) => {
      await toStep4(page, 'Office 195', 'ไม่ระบุ', 'อื่นๆ');
      await send(page).click();
      await expect(page.getByText('อธิบายอาการก่อนส่ง')).toBeVisible();
    },
  },
  {
    row: '03-sending',
    label: 'sending (locked)',
    mock: 'slow',
    then: async (page) => {
      await toStep4(page, 'Office 195', 'ไม่ระบุ', 'อินเทอร์เน็ต');
      await send(page).click();
      await expect(send(page)).toBeDisabled();
    },
  },
  {
    row: '04-lost',
    label: 'lost reply, resend',
    mock: 'lost',
    then: async (page) => {
      await toStep4(page, 'Office 195', 'ไม่ระบุ', 'อินเทอร์เน็ต');
      await send(page).click();
      await expect(send(page)).toHaveText(/ส่งอีกครั้ง/);
    },
  },
  {
    row: '05-recheck',
    label: 'FU-49 match on send',
    mock: 'duplicate',
    then: async (page) => {
      await toStep4(page, 'Office 195', 'ไม่ระบุ', 'อินเทอร์เน็ต');
      await send(page).click();
      await expect(page.getByRole('heading', { name: 'มีคนแจ้งเรื่องนี้แล้ว' })).toBeVisible();
    },
  },
  {
    row: '06-sent',
    label: 'sent',
    mock: 'ok',
    then: async (page) => {
      await toStep4(page, 'Office 195', 'ไม่ระบุ', 'อินเทอร์เน็ต');
      await send(page).click();
      await expect(page.getByTestId('repair-sent')).toBeVisible();
    },
  },
  {
    row: '07-not-ready',
    label: '503 on send (FU-21)',
    mock: 'not_ready',
    then: async (page) => {
      await toStep4(page, 'Office 195', 'ไม่ระบุ', 'อินเทอร์เน็ต');
      await send(page).click();
      await expect(page.getByTestId('repair-send-not-ready')).toBeVisible();
    },
  },
  {
    row: '08-bar',
    label: 'D-A13-5 bar choices',
    mock: 'none',
    then: async (page) => {
      await expect(page.getByTestId('repair-loading')).toHaveCount(0);
      await choice(page, 'WH300').click();
      await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
      await choice(page, 'ห้อง QA ชั้น 1').click();
      await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
      await choice(page, 'กล้องวงจรปิด').click();
      await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
      await expect(bar(page).getByRole('button', { name: 'ใช่ ติดตามเรื่องนี้' })).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: 0 }));
    },
  },
];

async function pageFor(browser: Browser, shot: Shot): Promise<Page> {
  const context = await browser.newContext();
  await keepLocal(context);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });

  if (shot.mock === 'duplicate') {
    let matches: unknown[] = [];
    await page.route('**/api/repair/duplicates?*', (route) => route.fulfill({ json: { matches } }));
    await page.route('**/api/commands', (route) => {
      matches = [MATCH];
      return route.fulfill({ status: 409, json: { error: 'DUPLICATE_FOUND', current: { request_ids: [MATCH.request_id] } } });
    });
  } else if (shot.mock !== 'none') {
    await page.route('**/api/commands', async (route: Route) => {

      if (shot.mock === 'slow') return new Promise<void>(() => undefined);
      if (shot.mock === 'lost') return route.abort('internetdisconnected');
      if (shot.mock === 'not_ready') return route.fulfill({ status: 503, json: { error: 'ROUTING_NOT_CONFIGURED' } });
      return route.fulfill({ json: OK });
    });
  }
  await signIn(page, 'requester', REPAIR);
  return page;
}

test.describe('@screenshots', () => {
  test.skip(OUT === undefined, 'set A14_SCREENSHOTS_DIR to take the screenshots');

  test('A14 pages and the D-A13-5 bar', async ({ browser }, testInfo) => {
    test.setTimeout(240_000);
    const dir = join(OUT ?? '.', testInfo.project.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(OUT ?? '.', 'labels.txt'), SHOTS.map((shot) => `${shot.row}=${shot.label}`).join('\n'));
    for (const shot of SHOTS) {
      const page = await pageFor(browser, shot);
      await expect(page.getByTestId('app-shell')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await shot.then(page);
      await page.screenshot({ path: join(dir, `${shot.row}.png`), animations: 'disabled' });
      await page.context().close();
    }
  });
});
