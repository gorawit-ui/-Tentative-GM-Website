// FAC17 — a second site with real areas, not only WH300: FAC17 is active and can be chosen in the repair
// form, its areas (made the way the Admin page makes them: `area-<12 hex>`, a random 22-character QR ID
// per area, A11) are offered with “ไม่ระบุ”, and a scan of a FAC17 area's QR goes all the way to a sent
// request against the real API. The area names in the fixture are made up (“(ทดสอบ)”); the real ones
// are entered on the Admin page after deploy (FU-51), never in the seed.
import { expect, test, type Page } from '@playwright/test';
import { horizontalOverflow, keepLocal, signInToShell, smallTargets, watchErrors } from '../support/app';

const REPAIR = '/requests/new?type=maintenance&origin=requester';
const FAC17_AREAS = ['ไลน์ผลิต 1 (ทดสอบ)', 'ห้องเก็บวัตถุดิบ (ทดสอบ)'];
const QR_FAC17_LINE = 'VTHDtbb9OiySSnsVFNqQxg';
const QR_FAC17_STORE = 'lbUur6McEJ3FeJXvTi6kzg';
/** One symptom per project: real requests of parallel runs never match each other (U1). */
const SYMPTOM_BY_PROJECT: Readonly<Record<string, string>> = {
  'mobile-360x640': 'แอร์',
  'mobile-390x844': 'หลอดไฟ',
  'laptop-1366x768': 'ตู้ไฟ',
  'desktop-1440x900': 'Shelf',
};

let problems: string[] = [];
let blocked: string[] = [];

test.beforeEach(async ({ context, page }) => {
  ({ blocked } = await keepLocal(context));
  problems = watchErrors(page);
});

test.afterEach(() => {
  expect(problems).toEqual([]);
  expect(blocked.filter((entry) => entry.endsWith('(app)'))).toEqual([]);
});

const choices = (page: Page) => page.getByTestId('repair-choices').getByRole('button');
const choice = (page: Page, name: string) => page.getByTestId('repair-choices').getByRole('button', { name, exact: true });
const bar = (page: Page) => page.getByTestId('repair-action-bar');

async function expectLayout(page: Page): Promise<void> {
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await smallTargets(page)).toEqual([]);
}

test.describe('FAC17: โรงงานที่สองที่มีบริเวณจริง', () => {
  test('FAC17 is active and can be chosen; its areas are offered with “ไม่ระบุ”', async ({ page }) => {
    await signInToShell(page, 'requester', REPAIR);
    await expect(page.getByTestId('repair-loading')).toHaveCount(0);
    await expect(choice(page, 'FAC17')).toBeEnabled();
    await choice(page, 'FAC17').click();
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    await expect(page.getByText('ขั้น 2 จาก 4')).toBeVisible();
    // a11-admin adds its own areas to FAC17 in parallel runs: those may follow, in the Admin's order.
    const offered = (await choices(page).allTextContents()).map((text) => text.trim());
    expect(offered.slice(0, FAC17_AREAS.length)).toEqual(FAC17_AREAS);
    expect(offered.at(-1)).toBe('ไม่ระบุ');
    await expectLayout(page);
  });

  test('a FAC17 area QR fills the place and area; the request is sent with them', async ({ page }, testInfo) => {
    const symptom = SYMPTOM_BY_PROJECT[testInfo.project.name] ?? 'แอร์';
    await signInToShell(page, 'requester', `/q/${QR_FAC17_LINE}`);
    await expect(page.getByTestId('repair-loading')).toHaveCount(0);
    const context = page.getByTestId('repair-context');
    await expect(context).toContainText('เลือกจาก QR ให้แล้ว');
    await expect(context).toContainText(`FAC17 · ${FAC17_AREAS[0]}`);
    await expect(page.getByText('ขั้น 3 จาก 4')).toBeVisible();
    await choice(page, symptom).click();
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
    await expect(page.getByTestId('repair-title-preview')).toContainText(`${symptom} — ${FAC17_AREAS[0]} · FAC17`);
    await expectLayout(page);

    let sent: Record<string, unknown> | undefined;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/commands') && request.method() === 'POST') sent = request.postDataJSON() as Record<string, unknown>;
    });
    await bar(page).getByRole('button', { name: 'ส่งเรื่อง' }).click();
    const done = page.getByTestId('repair-sent');
    await expect(done.getByRole('heading', { name: 'ส่งเรื่องเรียบร้อยแล้ว' })).toBeVisible();
    await expect(done).toContainText(/DEV-\d{4}/);
    expect(JSON.stringify(sent)).toContain('loc-fac17');
    expect(JSON.stringify(sent)).toContain('area-b8f2954eb8e8');
    await expectLayout(page);
  });

  test('the other FAC17 area has its own QR (one per area, A11)', async ({ page }) => {
    await signInToShell(page, 'requester', `/q/${QR_FAC17_STORE}`);
    await expect(page.getByTestId('repair-loading')).toHaveCount(0);
    await expect(page.getByTestId('repair-context')).toContainText(`FAC17 · ${FAC17_AREAS[1]}`);
    await expect(page.getByText('ขั้น 3 จาก 4')).toBeVisible();
  });
});
