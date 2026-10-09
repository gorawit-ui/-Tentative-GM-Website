// A09 — screenshots of every page this task builds, at the four sizes, for docs/screenshots/A09.webp.
// Runs only when A09_SCREENSHOTS_DIR is set (npm run test:e2e -- --grep @screenshots); the sheet is put
// together from the PNGs afterwards (docs/sessions/A09.md says how). Motion is off so nothing is caught
// half-way through an animation.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { isMobileWidth, keepLocal, signIn, type AccountKey } from '../support/app';

const OUT = process.env.A09_SCREENSHOTS_DIR;

interface Shot {
  readonly row: string;
  readonly as?: AccountKey;
  readonly path: string;
  readonly heading: string;
  readonly then?: (page: Page) => Promise<void>;
}

const SHOTS: readonly Shot[] = [
  { row: '01-login', path: '/login', heading: 'GM One Stop Service' },
  { row: '02-home', as: 'requester', path: '/', heading: 'วันนี้ให้ GM ช่วยเรื่องอะไร?' },
  { row: '03-my-requests', as: 'requester', path: '/my-requests', heading: 'คำขอของฉัน' },
  { row: '04-repair-form', as: 'requester', path: '/requests/new?type=maintenance&origin=requester', heading: 'แจ้งซ่อม' },
  { row: '05-request-detail', as: 'requester', path: '/requests/req-a09-0001', heading: 'รายละเอียดงาน' },
  { row: '06-board', as: 'requester', path: '/board', heading: 'บอร์ดทีม GM' },
  { row: '07-team', as: 'requester', path: '/team', heading: 'ติดต่อทีม GM' },
  { row: '08-no-permission', as: 'requester', path: '/admin/users', heading: 'ไม่มีสิทธิ์เข้าหน้านี้' },
  { row: '09-not-found', as: 'requester', path: '/no-such-page', heading: 'ไม่พบหน้านี้' },
  { row: '10-gm-home', as: 'admin', path: '/', heading: 'วันนี้ทีม GM กำลังทำอะไร' },
  { row: '11-gm-create', as: 'admin', path: '/requests/new?type=gm_task&origin=gm_initiated', heading: 'สร้างงาน GM / เปิดแทน' },
  { row: '12-on-behalf', as: 'admin', path: '/requests/new?type=maintenance&origin=gm_on_behalf', heading: 'เปิดแทนผู้ขอ' },
  { row: '13-admin-users', as: 'admin', path: '/admin/users', heading: 'รายชื่อพนักงานและสิทธิ์' },
  {
    row: '14-more-menu',
    as: 'admin',
    path: '/board',
    heading: 'บอร์ดทีม GM',
    then: async (page) => {
      if (!isMobileWidth(page)) return;
      await page.getByRole('button', { name: 'เมนูเพิ่มเติม' }).click();
      await expect(page.getByRole('dialog', { name: 'เมนูเพิ่มเติม' })).toBeVisible();
    },
  },
  { row: '15-disabled', as: 'disabled', path: '/', heading: 'บัญชีถูกปิด' },
  { row: '16-not-set-up', as: 'new', path: '/', heading: 'บัญชีนี้ยังไม่ได้เปิดใช้งาน' },
  {
    row: '17-outsider',
    as: 'outsider',
    path: '/login',
    heading: 'GM One Stop Service',
    then: async (page) => {
      await expect(page.getByRole('alert')).toContainText('ไม่ใช่บัญชีบริษัท');
    },
  },
];

test.describe('@screenshots', () => {
  test.skip(OUT === undefined, 'set A09_SCREENSHOTS_DIR to take the screenshots');

  for (const who of [undefined, 'requester', 'admin', 'disabled', 'new', 'outsider'] as const) {
    test(`pages of ${who ?? 'signed out'}`, async ({ context, page }, testInfo) => {
      const dir = join(OUT ?? '.', testInfo.project.name);
      mkdirSync(dir, { recursive: true });
      await keepLocal(context);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      if (who !== undefined) await signIn(page, who);
      for (const shot of SHOTS.filter((item) => item.as === who)) {
        if (who !== 'outsider') await page.goto(shot.path);
        await expect(page.getByRole('heading', { level: 1, name: shot.heading })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        // The contact box has loaded where there is one.
        await expect(page.getByText('กำลังโหลดช่องทางติดต่อ…')).toHaveCount(0);
        await shot.then?.(page);
        await page.screenshot({ path: join(dir, `${shot.row}.png`), animations: 'disabled' });
      }
    });
  }
});
