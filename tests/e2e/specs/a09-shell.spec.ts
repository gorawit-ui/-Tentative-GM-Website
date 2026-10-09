// A09 — the route shell after login (Part 2 §2–3, Part 3 §0.1–0.2, Part 4 Patch P2, Part 5 Patch F6,
// D-S04-6). Mobile: bottom navigation หน้าแรก / คำขอของฉัน / [แจ้งซ่อม] / บอร์ด / ติดต่อ GM; desktop:
// sidebar + top bar. GM and Admin menus and routes are hidden from people without the role, and the
// URL is refused too — the screens only follow what the API and Rules already enforce.
import { expect, test, type Page } from '@playwright/test';
import { isMobileWidth, keepLocal, signInToShell, storedAuthUsers, watchErrors, type AccountKey } from '../support/app';

const PRIMARY_MOBILE = ['หน้าแรก', 'คำขอของฉัน', 'แจ้งซ่อม', 'บอร์ด', 'ติดต่อ GM'];
const PRIMARY_DESKTOP = ['หน้าแรก', 'คำขอของฉัน', 'แจ้งซ่อม', 'บอร์ดทีม', 'ติดต่อ GM'];
const ADMIN_LINKS = ['สถานที่และบริเวณ', 'QR ของบริเวณ', 'รายชื่อพนักงานและสิทธิ์', 'ปฏิทินบริษัท', 'เนื้อหาติดต่อทีม GM / FAQ'];
const GM_BUTTON = 'สร้างงาน GM / เปิดแทน';
const REPAIR_URL = /\/requests\/new\?type=maintenance&origin=requester$/;

let problems: string[] = [];

test.beforeEach(async ({ context, page }) => {
  await keepLocal(context);
  problems = watchErrors(page);
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

const bottomNav = (page: Page) => page.getByRole('navigation', { name: 'เมนูหลักบนมือถือ' });
const sidebar = (page: Page) => page.getByRole('navigation', { name: 'เมนูหลัก', exact: true });

/** The GM and Admin entries the person can see (mobile: in “เมนูเพิ่มเติม”; desktop: top bar + sidebar). */
async function roleEntries(page: Page): Promise<{ gm: boolean; admin: string[] }> {
  if (isMobileWidth(page)) {
    await page.getByRole('button', { name: 'เมนูเพิ่มเติม' }).click();
    const menu = page.getByRole('dialog', { name: 'เมนูเพิ่มเติม' });
    await expect(menu).toBeVisible();
    const gm = (await menu.getByRole('link', { name: GM_BUTTON }).count()) > 0;
    const admin = await menu.getByRole('navigation', { name: 'Admin' }).getByRole('link').allTextContents();
    await menu.getByRole('button', { name: 'ปิด' }).click();
    await expect(menu).toBeHidden();
    return { gm, admin: admin.map((text) => text.trim()) };
  }
  const gm = (await page.getByRole('banner').getByRole('link', { name: GM_BUTTON }).count()) > 0;
  const admin = await page.getByRole('navigation', { name: 'Admin' }).getByRole('link').allTextContents();
  return { gm, admin: admin.map((text) => text.trim()) };
}

test('mobile: bottom nav in the Part 3 order, “แจ้งซ่อม” in the middle with icon and text, one tap to the repair form', async ({ page }) => {
  test.skip(!isMobileWidth(page), 'mobile layout only');
  await signInToShell(page, 'requester');
  const nav = bottomNav(page);
  await expect(nav).toBeVisible();
  await expect(sidebar(page)).toBeHidden();
  const links = nav.getByRole('link');
  expect((await links.allTextContents()).map((text) => text.trim())).toEqual(PRIMARY_MOBILE);
  await expect(links.nth(0)).toHaveAttribute('aria-current', 'page');
  const repair = links.nth(2);
  await expect(repair.locator('svg')).toHaveCount(1);
  const [first, middle] = [await links.nth(0).boundingBox(), await repair.boundingBox()];
  expect(middle?.x).toBeGreaterThan(first?.x ?? 0);
  // Prominent: the brand fill, not the plain item colour.
  expect(await repair.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(87, 121, 55)');
  await repair.click();
  await expect(page).toHaveURL(REPAIR_URL);
  await expect(page.getByRole('heading', { level: 1, name: 'แจ้งซ่อม' })).toBeVisible();
  // F6: no bottom nav during the repair form; it comes back on leaving the form.
  await expect(bottomNav(page)).toBeHidden();
  await page.getByRole('link', { name: 'ออกจากฟอร์ม' }).click();
  await expect(bottomNav(page)).toBeVisible();
});

test('desktop: sidebar as in the prototype and a top bar that always has “แจ้งซ่อม”; no bottom nav', async ({ page }) => {
  test.skip(isMobileWidth(page), 'desktop layout only');
  await signInToShell(page, 'requester');
  await expect(bottomNav(page)).toBeHidden();
  const side = sidebar(page);
  await expect(side).toBeVisible();
  expect((await side.getByRole('link').allTextContents()).map((text) => text.trim())).toEqual(PRIMARY_DESKTOP);
  // P2: 232px from 1366px wide.
  expect((await page.getByTestId('sidebar').boundingBox())?.width).toBe(232);
  const topRepair = page.getByRole('banner').getByRole('link', { name: 'แจ้งซ่อม' });
  await expect(topRepair).toBeVisible();
  await side.getByRole('link', { name: 'บอร์ดทีม' }).click();
  await expect(page).toHaveURL(/\/board$/);
  await expect(side.getByRole('link', { name: 'บอร์ดทีม' })).toHaveAttribute('aria-current', 'page');
  await topRepair.click();
  await expect(page).toHaveURL(REPAIR_URL);
});

const ROLE_MENUS: readonly [AccountKey, { gm: boolean; admin: string[] }][] = [
  ['requester', { gm: false, admin: [] }],
  ['viewer', { gm: false, admin: [] }],
  ['gm', { gm: true, admin: [] }],
  ['admin', { gm: true, admin: ADMIN_LINKS }],
];

for (const [key, expected] of ROLE_MENUS) {
  test(`${key}: the GM button and the Admin menu only for the roles that have them`, async ({ page }) => {
    await signInToShell(page, key);
    expect(await roleEntries(page)).toEqual(expected);
    // D-S04-6: every role, Viewer included, opens their own repair request.
    const repair = isMobileWidth(page) ? bottomNav(page).getByRole('link', { name: 'แจ้งซ่อม' }) : page.getByRole('banner').getByRole('link', { name: 'แจ้งซ่อม' });
    await expect(repair).toBeVisible();
  });
}

const FORBIDDEN: readonly [AccountKey, string][] = [
  ['requester', '/admin/users'],
  ['requester', '/requests/new?type=gm_task&origin=gm_initiated'],
  ['requester', '/requests/new?type=maintenance&origin=gm_on_behalf'],
  ['viewer', '/admin/calendars'],
  ['viewer', '/requests/new?type=gm_task&origin=gm_initiated'],
  ['gm', '/admin/qr'],
  ['gm', '/admin/content'],
];

for (const [key, path] of FORBIDDEN) {
  test(`${key} opening ${path} directly is refused (the menu was not just hidden)`, async ({ page }) => {
    await signInToShell(page, key);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'ไม่มีสิทธิ์เข้าหน้านี้' })).toBeVisible();
    for (const heading of ['รายชื่อพนักงานและสิทธิ์', 'ปฏิทินบริษัท', 'QR ของบริเวณ', 'เนื้อหาติดต่อทีม GM / FAQ', 'สร้างงาน GM / เปิดแทน', 'เปิดแทนผู้ขอ']) {
      await expect(page.getByRole('heading', { name: heading })).toHaveCount(0);
    }
    await expect(page.getByRole('link', { name: 'กลับหน้าแรก' })).toBeVisible();
  });
}

const ALLOWED: readonly [AccountKey, string, string][] = [
  ['admin', '/admin/users', 'รายชื่อพนักงานและสิทธิ์'],
  ['admin', '/admin/locations', 'สถานที่และบริเวณ'],
  ['gm', '/requests/new?type=gm_task&origin=gm_initiated', 'สร้างงาน GM / เปิดแทน'],
  ['gm', '/requests/new?type=maintenance&origin=gm_on_behalf', 'เปิดแทนผู้ขอ'],
  ['viewer', '/requests/new?type=maintenance&origin=requester', 'แจ้งซ่อม'],
];

for (const [key, path, heading] of ALLOWED) {
  test(`${key} opens ${path}`, async ({ page }) => {
    await signInToShell(page, key);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  });
}

test('an unknown address shows “ไม่พบหน้านี้” inside the shell', async ({ page }) => {
  await signInToShell(page, 'requester');
  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: 'ไม่พบหน้านี้' })).toBeVisible();
  await expect(page.getByTestId('app-shell')).toBeVisible();
});

test('logout clears everything kept on the device (shared devices at the site): auth, storage, caches; back does not show the app', async ({ page }) => {
  const who = await signInToShell(page, 'logout');
  // What a later phase could keep on the device (drafts, cached responses) — logout must not leave any.
  await page.evaluate(async () => {
    localStorage.setItem('gm.test.local', 'x');
    sessionStorage.setItem('gm.test.session', 'x');
    const cache = await caches.open('gm-test-cache');
    await cache.put('/gm-test-entry', new Response('x'));
  });
  expect(await storedAuthUsers(page)).toBe(1);
  if (isMobileWidth(page)) {
    await page.getByRole('button', { name: 'เมนูเพิ่มเติม' }).click();
    await page.getByRole('dialog', { name: 'เมนูเพิ่มเติม' }).getByRole('button', { name: 'ออกจากระบบ' }).click();
  } else {
    await page.getByTestId('sidebar').getByRole('button', { name: 'ออกจากระบบ' }).click();
  }
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' })).toBeVisible();
  expect(await storedAuthUsers(page)).toBe(0);
  expect(await page.evaluate(async () => ({ local: localStorage.length, session: sessionStorage.length, caches: await caches.keys() }))).toEqual({
    local: 0,
    session: 0,
    caches: [],
  });
  await page.goBack();
  await expect(page.getByTestId('app-shell')).toHaveCount(0);
  await expect(page.getByText(who.name)).toHaveCount(0);
  await page.goto('/my-requests');
  await expect(page).toHaveURL(/\/login\?next=%2Fmy-requests$/);
});
