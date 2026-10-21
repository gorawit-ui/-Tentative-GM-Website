// A10 — screenshots of every page this task builds, at the four sizes, for docs/screenshots/A10.webp.
// Runs only when A10_SCREENSHOTS_DIR is set; the sheet is put together from the PNGs afterwards with
// support/screenshot-sheet.sh (docs/sessions/A10.md says how). Motion is off. Nothing is saved: the
// dialogs are shown, not confirmed, and the import stops at the preview.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { keepLocal, signIn } from '../support/app';

const OUT = process.env.A10_SCREENSHOTS_DIR;

const CSV = [
  'Primary Email,First Name [Required],Department,Slack ID,Mobile',
  'a10.shot.one@tdfb.co,คุณนำเข้า หนึ่ง,ฝ่ายขาย,U0CSV0001,-',
  'a09.viewer@tdfb.co,คุณผู้ดู ภาพรวม,ฝ่ายบัญชี,,-',
  'outsider@gmail.com,คนนอกบริษัท,,,',
  'a10.shot.dup@tdfb.co,ซ้ำ หนึ่ง,,,',
  'A10.SHOT.DUP@tdfb.co,ซ้ำ สอง,,,',
  'a10.shot.noname@tdfb.co,,,,',
].join('\r\n');

interface Shot {
  readonly row: string;
  readonly label: string;
  readonly path: string;
  readonly heading: string;
  readonly then?: (page: Page, project: string) => Promise<void>;
}

const ownRow = (page: Page, project: string) =>
  page.getByTestId('people-list').locator('li, tbody tr').filter({ hasText: `a10.p-${project}@tdfb.co` });

async function mapColumns(page: Page): Promise<void> {
  await page.getByLabel('ไฟล์ CSV รายชื่อพนักงาน').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(`${CSV}\r\n`, 'utf8') });
  await page.getByLabel('คอลัมน์อีเมล').selectOption({ label: 'Primary Email' });
  await page.getByLabel('คอลัมน์ชื่อที่แสดง').selectOption({ label: 'First Name [Required]' });
  await page.getByLabel('คอลัมน์ทีม (ไม่บังคับ)').selectOption({ label: 'Department' });
  await page.getByLabel('คอลัมน์ Slack ID (ไม่บังคับ)').selectOption({ label: 'Slack ID' });
}

const SHOTS: readonly Shot[] = [
  {
    row: '01-users',
    label: 'users (unlisted logins on top)',
    path: '/admin/users',
    heading: 'รายชื่อพนักงานและสิทธิ์',
    then: async (page) => {
      await expect(page.getByTestId('unlisted-logins')).toBeVisible();
    },
  },
  {
    row: '02-users-list',
    label: 'users: list',
    path: '/admin/users',
    heading: 'รายชื่อพนักงานและสิทธิ์',
    then: async (page) => {
      await page.evaluate(() => document.getElementById('people-heading')?.scrollIntoView({ block: 'start' }));
    },
  },
  {
    row: '03-role',
    label: 'change role: confirm',
    path: '/admin/users',
    heading: 'รายชื่อพนักงานและสิทธิ์',
    then: async (page, project) => {
      await page.getByLabel('ค้นชื่อหรืออีเมล').fill(`a10.p-${project}@tdfb.co`);
      const row = ownRow(page, project);
      await row.getByRole('button', { name: 'เปลี่ยนสิทธิ์' }).click();
      await row.getByLabel('สิทธิ์ใหม่').selectOption({ label: 'ทีม GM' });
      await row.getByRole('button', { name: 'บันทึกสิทธิ์' }).click();
      await expect(page.getByRole('alertdialog', { name: 'เปลี่ยนสิทธิ์?' })).toBeVisible();
    },
  },
  {
    row: '04-last-admin',
    label: 'last GM Admin kept',
    path: '/admin/users',
    heading: 'รายชื่อพนักงานและสิทธิ์',
    then: async (page) => {
      await page.getByLabel('ค้นชื่อหรืออีเมล').fill('a09.admin@tdfb.co');
      const row = page.getByTestId('people-list').locator('li, tbody tr').filter({ hasText: 'a09.admin@tdfb.co' });
      await row.getByRole('button', { name: 'ปิดบัญชี', exact: true }).click();
      await page.getByRole('alertdialog', { name: 'ปิดบัญชีนี้?' }).getByRole('button', { name: 'ปิดบัญชี' }).click();
      await expect(page.getByRole('alert').filter({ hasText: 'GM Admin' })).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 0));
    },
  },
  {
    row: '05-add-unlisted',
    label: 'add an unlisted login',
    path: '/admin/users',
    heading: 'รายชื่อพนักงานและสิทธิ์',
    then: async (page) => {
      await page.getByTestId('unlisted-logins').getByRole('button', { name: 'เพิ่มเข้ารายชื่อ' }).first().click();
      await page.getByTestId('unlisted-logins').getByLabel('ชื่อที่แสดง').fill('คุณใหม่ ทดสอบ');
      await page.evaluate(() => document.getElementById('unlisted-heading')?.scrollIntoView({ block: 'start' }));
    },
  },
  {
    row: '06-import-columns',
    label: 'import: columns from the header',
    path: '/admin/users/import',
    heading: 'นำเข้ารายชื่อจาก CSV',
    then: async (page) => {
      await mapColumns(page);
      await page.evaluate(() => document.getElementById('columns-heading')?.scrollIntoView({ block: 'start' }));
    },
  },
  {
    row: '07-import-preview',
    label: 'import: preview + bad rows',
    path: '/admin/users/import',
    heading: 'นำเข้ารายชื่อจาก CSV',
    then: async (page) => {
      await mapColumns(page);
      await page.getByRole('button', { name: 'ตรวจรายการก่อนบันทึก' }).click();
      await expect(page.getByTestId('import-preview')).toBeVisible();
      await page.evaluate(() => document.getElementById('preview-heading')?.scrollIntoView({ block: 'start' }));
    },
  },
];

test.describe('@screenshots', () => {
  test.skip(OUT === undefined, 'set A10_SCREENSHOTS_DIR to take the screenshots');

  test('people pages (GM Admin)', async ({ browser, context, page }, testInfo) => {
    const project = testInfo.project.name;
    const dir = join(OUT ?? '.', project);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(OUT ?? '.', 'labels.txt'), SHOTS.map((shot) => `${shot.row}=${shot.label}`).join('\n'));
    // Someone signs in who is not on the list, so the page has an unlisted login to show.
    const outside = await browser.newContext();
    await keepLocal(outside);
    const newcomer = await outside.newPage();
    await signIn(newcomer, 'new');
    await expect(newcomer.getByRole('heading', { level: 1, name: 'บัญชีนี้ยังไม่ได้เปิดใช้งาน' })).toBeVisible();
    await outside.close();

    await keepLocal(context);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page, 'admin');
    for (const shot of SHOTS) {
      await page.goto(shot.path);
      await expect(page.getByRole('heading', { level: 1, name: shot.heading })).toBeVisible();
      await expect(page.locator('.gm-admin-loading')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await shot.then?.(page, project);
      await page.screenshot({ path: join(dir, `${shot.row}.png`), animations: 'disabled' });
    }
  });
});
