// A12 — the QR landing and steps 1–3 of the repair form (UI-01, UI-03, F01, U2, F6, A1.3, FU-19, FU-21,
// FU-43): a scan before login goes through the login page (which keeps “ไม่มีบัญชีบริษัท? แจ้งทีม GM”)
// and comes back to the same spot; a working QR fills the place and area and starts at the symptom step;
// a code that cannot be used says why and lets the person pick the place; the places are the Admin's
// active ones, areas with “ไม่ระบุ”, the brief's symptoms with “อื่นๆ”, and the automatic title (U2) is
// previewed. Step 4 (details, photos, sending) is A14 and the duplicate check (U1) is A13.
import { expect, test, type Page } from '@playwright/test';
import { account, chooseGoogleAccount, horizontalOverflow, isMobileWidth, keepLocal, signInToShell, smallTargets, watchErrors } from '../support/app';

const QR_OK = 'A11FixtureQrPackOne001';
const QR_DISABLED = 'A12FixtureQrDisabled01';
const QR_AREA_CLOSED = 'A12FixtureQrCafeOld001';
const QR_UNKNOWN = 'A12QrNeverIssued000001';
const REPAIR = '/requests/new?type=maintenance&origin=requester';
const LOCATIONS = ['WH300', 'FAC16', 'FAC17', 'Office 195', 'Cafe 222'];
const WH300_AREAS = ['ห้องแพ็คชั้น 1', 'ห้อง QA ชั้น 1', 'ออฟฟิศชั้น 2', 'คลังสินค้าชั้น 3', 'คลังสินค้าชั้น 4', 'ห้องเก็บของชั้น 5'];
const SYMPTOMS = ['แอร์', 'หลอดไฟ', 'ไฟดับ', 'อินเทอร์เน็ต', 'ห้องน้ำ', 'ซิงค์', 'ลิฟท์', 'กล้องวงจรปิด', 'เครื่องฟอกอากาศ', 'เครื่องปริ้นท์', 'โต๊ะ/โต๊ะแพ็ค', 'Shelf', 'ตู้ไฟ', 'อื่นๆ'];

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

async function expectLayout(page: Page): Promise<void> {
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await smallTargets(page)).toEqual([]);
}

const choices = (page: Page) => page.getByTestId('repair-choices').getByRole('button');
const choice = (page: Page, name: string) => page.getByTestId('repair-choices').getByRole('button', { name, exact: true });
const next = (page: Page) => page.getByTestId('repair-action-bar').getByRole('button', { name: 'ถัดไป' });
const back = (page: Page) => page.getByTestId('repair-action-bar').getByRole('button', { name: 'ย้อนกลับ' });

async function openForm(page: Page, path = REPAIR): Promise<void> {
  await signInToShell(page, 'requester', path);
  await expect(page.getByRole('heading', { level: 1, name: 'แจ้งซ่อม' })).toBeVisible();
  await expect(page.getByTestId('repair-loading')).toHaveCount(0);
}

test.describe('QR ก่อนและหลังเข้าสู่ระบบ (UI-01, A1.3)', () => {
  test('scanned before login: the login page (with “ไม่มีบัญชีบริษัท? แจ้งทีม GM”) and then back to the same spot', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/repair/')) asked.push(request.url());
    });
    await page.goto(`/q/${QR_OK}`);
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(`/q/${QR_OK}`)}$`));
    await expect(page.getByRole('heading', { name: 'ไม่มีบัญชีบริษัท? แจ้งทีม GM' })).toBeVisible();
    await expect(page.getByText('เข้าสู่ระบบเพื่อแจ้งซ่อมจากจุดที่สแกน')).toBeVisible();
    // Nothing about the place is shown or asked for before login (Part 6 §6.4).
    await expect(page.getByText('ห้องแพ็คชั้น 1')).toHaveCount(0);
    expect(asked).toEqual([]);
    await expectLayout(page);
    await chooseGoogleAccount(page, account('requester'));
    await expect(page).toHaveURL(new RegExp(`/q/${QR_OK}$`));
    await expect(page.getByRole('heading', { level: 1, name: 'แจ้งซ่อม' })).toBeVisible();
    await expect(page.getByTestId('repair-context')).toContainText('WH300 · ห้องแพ็คชั้น 1');
    await expect(page.getByText('ขั้น 3 จาก 4')).toBeVisible();
  });

  test('a working QR picks the place and area and starts at the symptom step; “ไม่ใช่ที่นี่” changes them', async ({ page }) => {
    await openForm(page, `/q/${QR_OK}`);
    const context = page.getByTestId('repair-context');
    await expect(context).toContainText('เลือกจาก QR ให้แล้ว');
    await expect(context).toContainText('WH300 · ห้องแพ็คชั้น 1');
    await expect(page.getByText('ขั้น 3 จาก 4')).toBeVisible();
    await expect(choice(page, 'แอร์')).toBeVisible();
    await expectLayout(page);
    await context.getByRole('button', { name: 'ไม่ใช่ที่นี่? เปลี่ยนสถานที่/บริเวณ' }).click();
    await expect(page.getByText('ขั้น 1 จาก 4')).toBeVisible();
    await expect(choice(page, 'WH300')).toHaveAttribute('aria-pressed', 'true');
    await choice(page, 'FAC16').click();
    await next(page).click();
    // A new place: the area is chosen again (F01).
    await expect(page.getByText('ขั้น 2 จาก 4')).toBeVisible();
    await expect(page.getByTestId('repair-choices').getByRole('button', { pressed: true })).toHaveCount(0);
  });

  test.describe('a code that cannot be used says what happened, and the place is picked by hand', () => {
    for (const [qrId, message] of [
      [QR_UNKNOWN, 'ไม่พบ QR นี้'],
      [QR_DISABLED, 'QR นี้ถูกปิดใช้งานแล้ว'],
      ['not-a-real-code', 'ไม่พบ QR นี้'],
    ] as const) {
      test(`${qrId} → “${message}”`, async ({ page }) => {
        await openForm(page, `/q/${qrId}`);
        await expect(page.getByRole('alert').filter({ hasText: message })).toContainText('เลือกสถานที่เองได้');
        await expect(page.getByText('ขั้น 1 จาก 4')).toBeVisible();
        await expect(page.getByTestId('repair-choices').getByRole('button', { pressed: true })).toHaveCount(0);
        await choice(page, 'FAC17').click();
        await next(page).click();
        await expect(page.getByText('ขั้น 2 จาก 4')).toBeVisible();
        await expectLayout(page);
      });
    }

    test('the area of the code was closed: says so; the place is kept, the area chosen again (the closed one is not offered)', async ({ page }) => {
      await openForm(page, `/q/${QR_AREA_CLOSED}`);
      await expect(page.getByRole('alert').filter({ hasText: 'บริเวณของ QR นี้ปิดใช้งานแล้ว' })).toBeVisible();
      await expect(page.getByText('ขั้น 2 จาก 4')).toBeVisible();
      await expect(page.getByTestId('repair-context')).toContainText('Cafe 222');
      await expect(choice(page, 'เคาน์เตอร์บาร์')).toBeVisible();
      await expect(choice(page, 'ห้องเก็บของเดิม (ปิดแล้ว)')).toHaveCount(0);
      await expectLayout(page);
    });
  });
});

test.describe('ขั้น 1–3 (UI-03, U2)', () => {
  test('places → areas with “ไม่ระบุ” → the brief’s symptoms with “อื่นๆ”; the automatic title follows every choice', async ({ page }) => {
    await openForm(page);
    await expect(page.getByText('ขั้น 1 จาก 4')).toBeVisible();
    for (const label of LOCATIONS) await expect(choice(page, label)).toBeVisible();
    // Nothing chosen yet: the step says what to do instead of moving on.
    await next(page).click();
    await expect(page.getByRole('alert')).toContainText('เลือกสถานที่ก่อน');
    await expectLayout(page);
    await choice(page, 'WH300').click();
    await expect(choice(page, 'WH300')).toHaveAttribute('aria-pressed', 'true');
    await next(page).click();

    await expect(page.getByText('ขั้น 2 จาก 4')).toBeVisible();
    for (const label of [...WH300_AREAS, 'ไม่ระบุ']) await expect(choice(page, label)).toBeVisible();
    await expect(page.getByTestId('repair-context')).toContainText('WH300');
    await choice(page, 'ไม่ระบุ').click();
    await expectLayout(page);
    await next(page).click();

    await expect(page.getByText('ขั้น 3 จาก 4')).toBeVisible();
    expect((await choices(page).allTextContents()).map((text) => text.trim())).toEqual(SYMPTOMS);
    await next(page).click();
    await expect(page.getByRole('alert')).toContainText('เลือกอาการก่อน');
    await choice(page, 'แอร์').click();
    await expect(page.getByTestId('repair-title-preview')).toContainText('แอร์ · WH300');
    await expectLayout(page);

    await back(page).click();
    await choice(page, 'ห้องแพ็คชั้น 1').click();
    await next(page).click();
    await expect(page.getByTestId('repair-title-preview')).toContainText('แอร์ — ห้องแพ็คชั้น 1 · WH300');
    await choice(page, 'อื่นๆ').click();
    await expect(page.getByTestId('repair-title-preview')).toContainText('อื่นๆ — ห้องแพ็คชั้น 1 · WH300');

    // Step 4 (details, photos, sending) comes with A14; the title stays as previewed.
    await next(page).click();
    await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
    await expect(page.getByTestId('repair-title-preview')).toContainText('อื่นๆ — ห้องแพ็คชั้น 1 · WH300');
    await expect(page.getByText('รายละเอียด รูป และการส่งเรื่องเปิดใช้ในรุ่นถัดไป')).toBeVisible();
    await expectLayout(page);
  });

  test('a place without areas still goes on with “ไม่ระบุ” only', async ({ page }) => {
    await openForm(page);
    await choice(page, 'Office 195').click();
    await next(page).click();
    expect((await choices(page).allTextContents()).map((text) => text.trim())).toEqual(['ไม่ระบุ']);
    await expect(page.getByText('บอกจุดที่เกิดปัญหาในรายละเอียด')).toBeVisible();
  });

  test('every role reports a repair (D-S04-6): a Viewer has the same form', async ({ page }) => {
    await signInToShell(page, 'viewer', REPAIR);
    await expect(page.getByRole('heading', { level: 1, name: 'แจ้งซ่อม' })).toBeVisible();
    await expect(choice(page, 'WH300')).toBeVisible();
  });
});

test.describe('ยังตั้งค่าไม่ครบ (FU-21)', () => {
  test('the API says the system is not set up → a Thai message with the GM contacts; no form to fill in for nothing', async ({ page }) => {
    await page.route('**/api/repair/options', (route) => route.fulfill({ status: 503, json: { error: 'ROUTING_NOT_CONFIGURED' } }));
    await signInToShell(page, 'requester', REPAIR);
    const notice = page.getByTestId('repair-not-ready');
    await expect(notice).toContainText('ระบบแจ้งซ่อมยังตั้งค่าไม่ครบ');
    await expect(notice).toContainText('โทรหาทีม GM');
    await expect(page.getByTestId('repair-choices')).toHaveCount(0);
    await expectLayout(page);
    // The browser logs the refused request itself; that 503 is what this case is about.
    problems = problems.filter((line) => !line.includes('status of 503'));
  });
});

test.describe('F6: ระหว่างกรอก', () => {
  test('no bottom navigation, an action bar of at most 64 px, and at least 4 symptom buttons without scrolling', async ({ page }) => {
    await openForm(page, `/q/${QR_OK}`);
    await expect(page.getByRole('navigation', { name: 'เมนูหลักบนมือถือ' })).toBeHidden();
    const bar = await page.getByTestId('repair-action-bar').boundingBox();
    expect(bar).not.toBeNull();
    expect(bar?.height ?? 99).toBeLessThanOrEqual(64);
    const viewport = page.viewportSize();
    const visible = await choices(page).evaluateAll(
      (buttons, limit) => buttons.filter((button) => {
        const box = button.getBoundingClientRect();
        return box.top >= 0 && box.bottom <= limit;
      }).length,
      // Above the action bar and inside the first screen (no scrolling).
      Math.min(bar?.y ?? Number.POSITIVE_INFINITY, viewport?.height ?? 0),
    );
    expect(visible).toBeGreaterThanOrEqual(4);
    if (isMobileWidth(page)) {
      // The end of the form scrolls clear of the bar (F6): scrolled to the bottom, the last choice is above it.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      const last = await choice(page, 'อื่นๆ').boundingBox();
      expect((last?.y ?? 0) + (last?.height ?? 0)).toBeLessThanOrEqual((await page.getByTestId('repair-action-bar').boundingBox())?.y ?? 0);
    }
    await expectLayout(page);
  });
});
