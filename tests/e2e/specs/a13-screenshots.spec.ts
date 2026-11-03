// A13 — screenshots of every page this session builds or changes, at the four sizes, for
// docs/screenshots/A13.webp: the interstitial “มีคนแจ้งเรื่องนี้แล้ว” (a match, the person's own report,
// already watching), the watch dialog with its note, “ติดตามงานนี้แล้ว”, a failed check, and the D-A12-2
// role dialog of a GM with open work. Runs only when A13_SCREENSHOTS_DIR is set; nothing is saved (the
// watch is mocked, dialogs are shown, not confirmed). Motion is off.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { keepLocal, signIn, type AccountKey } from '../support/app';

const OUT = process.env.A13_SCREENSHOTS_DIR;
const REPAIR = '/requests/new?type=maintenance&origin=requester';

const MOCK_MATCH = {
  request_id: 'req-a13-mock-0001',
  request_number: 'DEV-9201',
  summary_title: 'แอร์ — ห้องแพ็คชั้น 1 · WH300',
  status: 'in_progress',
  is_assigned: true,
  assignee_label: 'คุณช่าง ตัวอย่าง',
  location_label: 'WH300',
  area_label: 'ห้องแพ็คชั้น 1',
  watcher_count: 2,
  created_at: 1793500000000,
  viewer: 'none',
};

interface Shot {
  readonly row: string;
  readonly label: string;
  readonly as: AccountKey;
  readonly path: string;
  readonly mock?: 'match' | 'fail';
  readonly then: (page: Page) => Promise<void>;
}

const choice = (page: Page, name: string) => page.getByTestId('repair-choices').getByRole('button', { name, exact: true });
const next = (page: Page) => page.getByTestId('repair-action-bar').getByRole('button', { name: 'ถัดไป' });

async function toCheck(page: Page, area: string, symptom: string): Promise<void> {
  await expect(page.getByTestId('repair-loading')).toHaveCount(0);
  await choice(page, 'WH300').click();
  await next(page).click();
  await choice(page, area).click();
  await next(page).click();
  await choice(page, symptom).click();
  await next(page).click();
}

const SHOTS: readonly Shot[] = [
  {
    row: '01-match',
    label: 'U1 มีคนแจ้งเรื่องนี้แล้ว',
    as: 'requester',
    path: REPAIR,
    then: async (page) => {
      await toCheck(page, 'ห้อง QA ชั้น 1', 'กล้องวงจรปิด');
      await expect(page.getByTestId('duplicate-card')).toBeVisible();
    },
  },
  {
    row: '02-own',
    label: 'own report',
    as: 'viewer',
    path: REPAIR,
    then: async (page) => {
      await toCheck(page, 'ห้อง QA ชั้น 1', 'กล้องวงจรปิด');
      await expect(page.getByText('คุณแจ้งเรื่องนี้ไว้แล้ว')).toBeVisible();
    },
  },
  {
    row: '03-watching',
    label: 'already watching',
    as: 'logout',
    path: REPAIR,
    then: async (page) => {
      await toCheck(page, 'ห้อง QA ชั้น 1', 'กล้องวงจรปิด');
      await expect(page.getByText('คุณติดตามเรื่องนี้อยู่แล้ว')).toBeVisible();
    },
  },
  {
    row: '04-dialog',
    label: 'watch dialog + note',
    as: 'requester',
    path: REPAIR,
    mock: 'match',
    then: async (page) => {
      await toCheck(page, 'ห้องแพ็คชั้น 1', 'แอร์');
      await page.getByRole('button', { name: 'ใช่ เรื่องเดียวกัน — ติดตามเรื่องนี้' }).click();
      await page.getByLabel('หมายเหตุเพิ่มเติม (ส่งได้ครั้งเดียว ไม่บังคับ)').fill('แอร์มีน้ำหยดใส่โต๊ะแพ็คด้วย');
    },
  },
  {
    row: '05-watched',
    label: 'ติดตามงานนี้แล้ว',
    as: 'requester',
    path: REPAIR,
    mock: 'match',
    then: async (page) => {
      await toCheck(page, 'ห้องแพ็คชั้น 1', 'แอร์');
      await page.getByRole('button', { name: 'ใช่ เรื่องเดียวกัน — ติดตามเรื่องนี้' }).click();
      await page.getByRole('dialog').getByRole('button', { name: 'ยืนยันติดตาม' }).click();
      await expect(page.getByTestId('repair-watched')).toBeVisible();
    },
  },
  {
    row: '06-failed',
    label: 'check failed',
    as: 'requester',
    path: REPAIR,
    mock: 'fail',
    then: async (page) => {
      await toCheck(page, 'ห้องแพ็คชั้น 1', 'แอร์');
      await expect(page.getByTestId('repair-duplicates-failed')).toBeVisible();
    },
  },
  {
    row: '07-demote-gm',
    label: 'D-A12-2 demote GM with work',
    as: 'admin',
    path: '/admin/users',
    then: async (page) => {
      await page.getByLabel('ค้นชื่อหรืออีเมล').fill('a10.gm.busy@tdfb.co');
      const row = page.getByTestId('people-list').locator('li, tbody tr').filter({ hasText: 'a10.gm.busy@tdfb.co' });
      await row.getByRole('button', { name: 'เปลี่ยนสิทธิ์' }).click();
      await row.getByLabel('สิทธิ์ใหม่').selectOption({ label: 'พนักงาน' });
      await row.getByRole('button', { name: 'บันทึกสิทธิ์' }).click();
      await expect(page.getByRole('alertdialog')).toContainText('2 งาน');
    },
  },
];

async function pageFor(browser: Browser, shot: Shot): Promise<Page> {
  const context = await browser.newContext();
  await keepLocal(context);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (shot.mock === 'match') {
    await page.route('**/api/repair/duplicates?*', (route) => route.fulfill({ json: { matches: [MOCK_MATCH] } }));
    await page.route('**/api/commands', (route) => route.fulfill({ json: { replayed: false, result: { request_id: MOCK_MATCH.request_id, request_number: 'DEV-9201', watch: 'added' } } }));
  }
  if (shot.mock === 'fail') await page.route('**/api/repair/duplicates?*', (route) => route.fulfill({ status: 500, json: { error: 'INTERNAL' } }));
  await signIn(page, shot.as, shot.path);
  return page;
}

test.describe('@screenshots', () => {
  test.skip(OUT === undefined, 'set A13_SCREENSHOTS_DIR to take the screenshots');

  test('A13 pages and the D-A12 change', async ({ browser }, testInfo) => {
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
