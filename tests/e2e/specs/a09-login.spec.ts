// A09 — Google login through the Auth emulator (UI-01, Part 2 Addendum A1.3, Part 6 §6.5, D-S09-6,
// D-S10-5). Only a verified @tdfb.co Google account goes on; access/{uid} then decides. Emulators only:
// the browser may reach nothing but this machine.
import { expect, test } from '@playwright/test';
import { GOOGLE_BUTTON, account, box, chooseGoogleAccount, isMobileWidth, keepLocal, signIn, signInToShell, storedAuthUsers, watchErrors } from '../support/app';
import { emulatorTarget, writeDocument } from '../support/emulator';

const CONTACT_BOX = 'ไม่มีบัญชีบริษัท? แจ้งทีม GM';

let problems: string[] = [];
let blocked: string[] = [];

test.beforeEach(async ({ context, page }) => {
  ({ blocked } = await keepLocal(context));
  problems = watchErrors(page);
});

test.afterEach(() => {
  expect(problems).toEqual([]);
  // The app itself reaches only this machine (the emulator's sign-in window may try web fonts).
  expect(blocked.filter((entry) => entry.endsWith('(app)'))).toEqual([]);
});

test('login page in UI-01 order: service, short text, Google button, “ใช้บัญชี @tdfb.co”, then the no-account box with the Admin’s contacts', async ({ page }) => {
  await page.goto('/login');
  const heading = page.getByRole('heading', { level: 1, name: 'GM One Stop Service' });
  const description = page.getByText('แจ้งซ่อม ติดตามงาน และติดต่อทีม GM ในที่เดียว');
  const button = page.getByRole('button', { name: GOOGLE_BUTTON });
  const hint = page.getByText('ใช้บัญชี @tdfb.co', { exact: true });
  const contact = page.getByRole('region', { name: CONTACT_BOX });
  const tops = [];
  for (const item of [heading, description, button, hint, contact]) {
    await expect(item).toBeVisible();
    tops.push((await box(item)).y);
  }
  expect(tops).toEqual([...tops].sort((a, b) => a - b));

  await expect(contact.getByText('ทีม GM จะช่วยเปิดเรื่องให้')).toBeVisible();
  await expect(contact.getByText('โทรหาทีม GM')).toBeVisible();
  await expect(contact.getByText('คุณสมมติ ใจดี (ทีม GM)')).toBeVisible();
  await expect(contact.getByRole('link', { name: /02-000-0000/ })).toHaveAttribute('href', 'tel:020000000');
  await expect(contact.getByText('อาคารทดสอบ ก ชั้น 1 (ตัวอย่าง)')).toBeVisible();
  // A1.3: no anonymous form, no board, no names beyond what the Admin chose to show.
  await expect(page.getByText('ข้อมูลหลังเข้าสู่ระบบเท่านั้น')).toHaveCount(0);
  await expect(page.getByText('a09.private@tdfb.co')).toHaveCount(0);
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toHaveCount(0);
});

test('desktop: the login box sits in the middle, about 440px wide', async ({ page }) => {
  test.skip(isMobileWidth(page), 'desktop layout only');
  await page.goto('/login');
  const card = await box(page.getByTestId('login-card'));
  const width = await page.evaluate(() => document.documentElement.clientWidth);
  expect(card.width).toBeGreaterThanOrEqual(400);
  expect(card.width).toBeLessThanOrEqual(480);
  expect(Math.abs(card.x + card.width / 2 - width / 2)).toBeLessThanOrEqual(2);
});

test('a requester signs in with Google (Auth emulator) and lands on the home page with their name', async ({ page }) => {
  const who = await signInToShell(page, 'requester');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'วันนี้ให้ GM ช่วยเรื่องอะไร?' })).toBeVisible();
  await expect(page.getByTestId('page').getByText(who.name)).toBeVisible();
});

test('a link opened before signing in comes back after (/login keeps where you were going)', async ({ page }) => {
  await page.goto('/board');
  await expect(page).toHaveURL(/\/login\?next=%2Fboard$/);
  await chooseGoogleAccount(page, account('requester'));
  await expect(page).toHaveURL(/\/board$/);
  await expect(page.getByRole('heading', { level: 1, name: 'บอร์ดทีม GM' })).toBeVisible();
});

for (const key of ['outsider', 'lookalike'] as const) {
  test(`an account outside @tdfb.co (${key}) gets a clear Thai message and is signed out`, async ({ page }) => {
    const who = await signIn(page, key);
    const alert = page.getByRole('alert');
    await expect(alert).toContainText(`${who.email} ไม่ใช่บัญชีบริษัท`);
    await expect(alert).toContainText('ใช้บัญชี @tdfb.co เท่านั้น');
    await expect(alert).toContainText('ออกจากระบบให้แล้ว');
    await expect(page.getByTestId('app-shell')).toHaveCount(0);
    await expect.poll(() => storedAuthUsers(page)).toBe(0);
    await page.reload();
    await expect(page.getByRole('button', { name: GOOGLE_BUTTON })).toBeVisible();
    await expect(page.getByTestId('app-shell')).toHaveCount(0);
  });
}

test('closing the Google window says the sign-in was cancelled — not a failure, not “no permission”', async ({ page }) => {
  await page.goto('/login');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: GOOGLE_BUTTON }).click();
  const popup = await popupPromise;
  await popup.close();
  const alert = page.getByRole('alert');
  // Firebase notices a closed window by polling it, so allow it a few seconds.
  await expect(alert).toContainText('ยกเลิกการเข้าสู่ระบบแล้ว', { timeout: 20_000 });
  await expect(alert).not.toContainText('ไม่สำเร็จ');
  await expect(alert).not.toContainText('ไม่ใช่บัญชีบริษัท');
  await expect(page.getByRole('button', { name: GOOGLE_BUTTON })).toBeEnabled();
});

test('D-S09-6: a disabled account sees “บัญชีถูกปิด” with the reason and “เปลี่ยนบัญชี” — no menu, no board', async ({ page }) => {
  const who = await signIn(page, 'disabled');
  await expect(page.getByRole('heading', { level: 1, name: 'บัญชีถูกปิด' })).toBeVisible();
  await expect(page.getByText(who.email)).toBeVisible();
  await expect(page.getByRole('region', { name: CONTACT_BOX })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.goto('/board');
  await expect(page.getByRole('heading', { level: 1, name: 'บัญชีถูกปิด' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'บอร์ดทีม GM' })).toHaveCount(0);
  await page.getByRole('button', { name: 'เปลี่ยนบัญชี' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: GOOGLE_BUTTON })).toBeVisible();
  await expect.poll(() => storedAuthUsers(page)).toBe(0);
});

test('a company account not set up yet sees that it is not opened, with the contact box and “เปลี่ยนบัญชี”', async ({ page }) => {
  const who = await signIn(page, 'new');
  await expect(page.getByRole('heading', { level: 1, name: 'บัญชีนี้ยังไม่ได้เปิดใช้งาน' })).toBeVisible();
  await expect(page.getByText(who.email)).toBeVisible();
  await expect(page.getByRole('region', { name: CONTACT_BOX })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เปลี่ยนบัญชี' })).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
});

test('signed in already → /login goes straight in (UI-01: skip login with a session)', async ({ page }) => {
  await signInToShell(page, 'gm');
  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('app-shell')).toBeVisible();
});

test('access switched off while signed in → “บัญชีถูกปิด” at once (Part 6 §6.5: offboarding without waiting)', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440x900', 'changes a shared fixture document; one viewport is enough');
  await signInToShell(page, 'offboard');
  const target = emulatorTarget();
  try {
    await writeDocument(target, 'access', 'uid-a09-offboard', { person_id: 'a09.offboard@tdfb.co', role: 'requester', enabled: false });
    await expect(page.getByRole('heading', { level: 1, name: 'บัญชีถูกปิด' })).toBeVisible();
    await expect(page.getByTestId('app-shell')).toHaveCount(0);
  } finally {
    await writeDocument(target, 'access', 'uid-a09-offboard', { person_id: 'a09.offboard@tdfb.co', role: 'requester', enabled: true });
  }
});
