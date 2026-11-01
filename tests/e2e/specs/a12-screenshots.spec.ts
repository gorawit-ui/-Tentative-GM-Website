// A12 — screenshots of every page this session builds or changes, at the four sizes, for
// docs/screenshots/A12.webp: the QR landing (before login, a working code, a code that cannot be used),
// repair steps 1–4, “not set up”, and the D-A10 changes (encoding check, switching off a GM with open
// requests, adding a person by hand, editing a name, the default-owner health card). Runs only when
// A12_SCREENSHOTS_DIR is set; nothing is saved (dialogs are shown, not confirmed). Motion is off.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { keepLocal, signIn } from '../support/app';

const OUT = process.env.A12_SCREENSHOTS_DIR;

interface Shot {
  readonly row: string;
  readonly label: string;
  readonly as: 'requester' | 'admin' | 'none';
  readonly path: string;
  readonly then?: (page: Page, project: string) => Promise<void>;
}

const choice = (page: Page, name: string) => page.getByTestId('repair-choices').getByRole('button', { name, exact: true });
const next = (page: Page) => page.getByTestId('repair-action-bar').getByRole('button', { name: 'ถัดไป' });
const formReady = async (page: Page) => {
  await expect(page.getByRole('heading', { level: 1, name: 'แจ้งซ่อม' })).toBeVisible();
  await expect(page.getByTestId('repair-loading')).toHaveCount(0);
};

/** Windows-874 bytes of a short Thai CSV (as Excel in Thai Windows saves it). */
function windows874(text: string): Buffer {
  return Buffer.from([...text].map((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0x80 ? code : code - 0x0e00 + 0xa0;
  }));
}
const CSV = ['Primary Email,ชื่อ,ทีม', 'a12.shot.one@tdfb.co,คุณนำเข้า หนึ่ง,ฝ่ายขาย', 'a12.shot.two@tdfb.co,คุณนำเข้า สอง,ฝ่ายผลิต', 'a12.shot.three@tdfb.co,คุณนำเข้า สาม,'].join('\r\n');

const SHOTS: readonly Shot[] = [
  {
    row: '01-qr-login',
    label: 'QR scanned before login',
    as: 'none',
    path: '/q/A11FixtureQrPackOne001',
    then: async (page) => {
      await expect(page.getByText('เข้าสู่ระบบเพื่อแจ้งซ่อมจากจุดที่สแกน')).toBeVisible();
      await expect(page.getByRole('listitem').first()).toBeVisible();
    },
  },
  { row: '02-qr-ok', label: 'QR: place + area → symptoms', as: 'requester', path: '/q/A11FixtureQrPackOne001', then: formReady },
  {
    row: '03-qr-unknown',
    label: 'QR not found',
    as: 'requester',
    path: '/q/A12QrNeverIssued000001',
    then: async (page) => {
      await formReady(page);
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  {
    row: '04-qr-area-closed',
    label: 'QR area closed',
    as: 'requester',
    path: '/q/A12FixtureQrCafeOld001',
    then: async (page) => {
      await formReady(page);
      await expect(page.getByRole('alert')).toBeVisible();
    },
  },
  { row: '05-step-1', label: 'step 1 place', as: 'requester', path: '/requests/new?type=maintenance&origin=requester', then: formReady },
  {
    row: '06-step-2',
    label: 'step 2 area (+ไม่ระบุ)',
    as: 'requester',
    path: '/requests/new?type=maintenance&origin=requester',
    then: async (page) => {
      await formReady(page);
      await choice(page, 'WH300').click();
      await next(page).click();
    },
  },
  {
    row: '07-step-3',
    label: 'step 3 symptom + title',
    as: 'requester',
    path: '/q/A11FixtureQrPackOne001',
    then: async (page) => {
      await formReady(page);
      await choice(page, 'แอร์').click();
      await expect(page.getByTestId('repair-title-preview')).toBeVisible();
    },
  },
  {
    row: '08-step-4',
    label: 'step 4 (A14)',
    as: 'requester',
    path: '/q/A11FixtureQrPackOne001',
    then: async (page) => {
      await formReady(page);
      await choice(page, 'แอร์').click();
      await next(page).click();
      await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
    },
  },
  {
    row: '09-not-ready',
    label: 'not set up (FU-21)',
    as: 'requester',
    path: '/requests/new?type=maintenance&origin=requester',
    then: async (page) => {
      await expect(page.getByTestId('repair-not-ready')).toBeVisible();
      await expect(page.getByText('โทรหาทีม GM')).toBeVisible();
    },
  },
  {
    row: '10-csv-encoding',
    label: 'D-A10-3 encoding check',
    as: 'admin',
    path: '/admin/users/import',
    then: async (page) => {
      await page.getByLabel('ไฟล์ CSV รายชื่อพนักงาน').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: windows874(`${CSV}\r\n`) });
      await expect(page.getByTestId('import-encoding')).toContainText('คุณนำเข้า หนึ่ง');
      await page.evaluate(() => document.getElementById('encoding-heading')?.scrollIntoView({ block: 'start' }));
    },
  },
  {
    row: '11-gm-switch-off',
    label: 'D-A10-2 GM with open work',
    as: 'admin',
    path: '/admin/users',
    then: async (page) => {
      await page.getByLabel('ค้นชื่อหรืออีเมล').fill('a10.gm.busy@tdfb.co');
      const row = page.getByTestId('people-list').locator('li, tbody tr').filter({ hasText: 'a10.gm.busy@tdfb.co' });
      await row.getByRole('button', { name: 'ปิดบัญชี', exact: true }).click();
      await expect(page.getByRole('alertdialog')).toContainText('2 งาน');
    },
  },
  {
    row: '12-add-by-hand',
    label: 'D-A10-5 add by hand',
    as: 'admin',
    path: '/admin/users',
    then: async (page) => {
      await page.getByRole('button', { name: 'เพิ่มคนด้วยมือ' }).click();
      const form = page.getByTestId('add-person-form');
      await form.getByLabel('อีเมล').fill('new.hire@tdfb.co');
      await form.getByLabel('ชื่อที่แสดง').fill('คุณพนักงาน ใหม่');
      await page.evaluate(() => document.querySelector('[data-testid="add-person-form"]')?.scrollIntoView({ block: 'start' }));
    },
  },
  {
    row: '13-edit-name',
    label: 'D-A10-6 edit name/team',
    as: 'admin',
    path: '/admin/users',
    then: async (page, project) => {
      const email = `a10.e-${project}@tdfb.co`;
      await page.getByLabel('ค้นชื่อหรืออีเมล').fill(email);
      const row = page.getByTestId('people-list').locator('li, tbody tr').filter({ hasText: email });
      await row.getByRole('button', { name: 'แก้ชื่อ/ทีม' }).click();
      await expect(row.getByText('การนำเข้า CSV ครั้งถัดไปจะเขียนทับค่าที่แก้ด้วยมือ')).toBeVisible();
    },
  },
  {
    row: '14-health-owner',
    label: 'D-A10-1 default owner card',
    as: 'admin',
    path: '/admin/health',
    then: async (page) => {
      await expect(page.getByTestId('health-owners')).toBeVisible();
      await page.getByTestId('health-owners').scrollIntoViewIfNeeded();
    },
  },
];

async function pageFor(browser: Browser, who: Shot['as']): Promise<Page> {
  const context = await browser.newContext();
  await keepLocal(context);
  const page = await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if (who !== 'none') await signIn(page, who);
  return page;
}

test.describe('@screenshots', () => {
  test.skip(OUT === undefined, 'set A12_SCREENSHOTS_DIR to take the screenshots');

  test('A12 pages and the D-A10 changes', async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    const project = testInfo.project.name;
    const dir = join(OUT ?? '.', project);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(OUT ?? '.', 'labels.txt'), SHOTS.map((shot) => `${shot.row}=${shot.label}`).join('\n'));
    const pages: Partial<Record<Shot['as'], Page>> = {};
    for (const shot of SHOTS) {
      const fresh = shot.as === 'none' || shot.row === '09-not-ready';
      const page = fresh ? await pageFor(browser, shot.as) : (pages[shot.as] ??= await pageFor(browser, shot.as));
      if (shot.row === '09-not-ready') await page.route('**/api/repair/options', (route) => route.fulfill({ status: 503, json: { error: 'ROUTING_NOT_CONFIGURED' } }));
      await page.goto(shot.path);
      await page.evaluate(() => document.fonts.ready);
      await shot.then?.(page, project);
      await page.screenshot({ path: join(dir, `${shot.row}.png`), animations: 'disabled' });
      if (fresh) await page.context().close();
    }
  });
});
