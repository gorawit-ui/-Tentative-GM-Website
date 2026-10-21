// A11 — screenshots of every Admin page this task builds, at the four sizes, for docs/screenshots/A11.webp.
// Runs only when A11_SCREENSHOTS_DIR is set; the sheet is put together from the PNGs afterwards with
// support/screenshot-sheet.sh (docs/sessions/A11.md says how). Motion is off.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { keepLocal, signIn } from '../support/app';

const OUT = process.env.A11_SCREENSHOTS_DIR;

interface Shot {
  readonly row: string;
  readonly label: string;
  readonly path: string;
  readonly heading: string;
  readonly then?: (page: Page) => Promise<void>;
}

const SHOTS: readonly Shot[] = [
  { row: '01-locations', label: 'locations', path: '/admin/locations', heading: 'สถานที่และบริเวณ' },
  { row: '02-areas', label: 'WH300 areas', path: '/admin/locations/loc-wh300', heading: 'WH300' },
  {
    row: '03-qr',
    label: 'QR preview',
    path: '/admin/qr?location=loc-wh300&area=area-wh300-pack-1',
    heading: 'QR ของบริเวณ',
    then: async (page) => {
      await page.getByTestId('qr-preview').scrollIntoViewIfNeeded();
    },
  },
  { row: '04-qr-print', label: 'QR print (sample)', path: '/admin/qr/A11FixtureQrPackOne001/print', heading: 'พิมพ์ QR' },
  { row: '05-calendar', label: 'calendar', path: '/admin/calendars', heading: 'ปฏิทินบริษัท' },
  {
    row: '06-holidays',
    label: 'calendar: holidays',
    path: '/admin/calendars',
    heading: 'ปฏิทินบริษัท',
    then: async (page) => {
      await page.getByRole('heading', { name: 'วันหยุด', exact: true }).scrollIntoViewIfNeeded();
      await page.evaluate(() => document.getElementById('holidays-heading')?.scrollIntoView({ block: 'start' }));
    },
  },
  {
    row: '07-holiday-error',
    label: 'holiday: CE year',
    path: '/admin/calendars',
    heading: 'ปฏิทินบริษัท',
    then: async (page) => {
      const form = page.getByTestId('holiday-form');
      await form.getByLabel('วันที่', { exact: true }).fill('1');
      await form.getByLabel('ปี (พ.ศ.)').fill('2027');
      await form.getByLabel('ชื่อวันหยุด').fill('ตัวอย่าง');
      await form.getByRole('button', { name: 'เพิ่มวันหยุด' }).click();
      await expect(form.getByRole('alert')).toBeVisible();
      await page.evaluate(() => document.getElementById('add-holiday-heading')?.scrollIntoView({ block: 'start' }));
    },
  },
  { row: '08-health', label: 'system health', path: '/admin/health', heading: 'สุขภาพระบบ' },
];

test.describe('@screenshots', () => {
  test.skip(OUT === undefined, 'set A11_SCREENSHOTS_DIR to take the screenshots');

  test('Admin pages (GM Admin)', async ({ context, page }, testInfo) => {
    const dir = join(OUT ?? '.', testInfo.project.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(OUT ?? '.', 'labels.txt'), SHOTS.map((shot) => `${shot.row}=${shot.label}`).join('\n'));
    await keepLocal(context);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page, 'admin');
    for (const shot of SHOTS) {
      await page.goto(shot.path);
      await expect(page.getByRole('heading', { level: 1, name: shot.heading })).toBeVisible();
      await expect(page.locator('.gm-admin-loading')).toHaveCount(0);
      await page.evaluate(() => document.fonts.ready);
      await shot.then?.(page);
      await page.screenshot({ path: join(dir, `${shot.row}.png`), animations: 'disabled' });
    }
  });
});
