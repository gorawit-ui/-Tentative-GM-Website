// A11 — Admin: locations and areas, QR codes, the company calendar and the system health (Part 3
// §13.1–13.4 + states table, Part 6 §6.2, FU-25, FU-30, D-S01-6, D-S08-3, D-A09-7). GM Admin only; the
// API checks every read and change (tests/emulator/admin-api.test.ts). Each viewport project changes only
// its own areas and holidays, so the four run side by side on the same emulator.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { horizontalOverflow, isMobileWidth, keepLocal, signInToShell, smallTargets, watchErrors } from '../support/app';

const FIXTURE_QR = 'A11FixtureQrPackOne001';
const PROJECT_DAY: Readonly<Record<string, number>> = { 'mobile-360x640': 2, 'mobile-390x844': 3, 'laptop-1366x768': 4, 'desktop-1440x900': 5 };

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

/** A name only this viewport project uses (the four projects share one emulator). */
const own = (testInfo: TestInfo, what: string) => `${what} ${testInfo.project.name}`;

/** One area of the list: a card on mobile, a table row on desktop (§13.1). */
const areaRow = (page: Page, name: string) => page.getByTestId('area-list').locator('li, tbody tr').filter({ hasText: name });

async function expectLayout(page: Page): Promise<void> {
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await smallTargets(page)).toEqual([]);
}

async function openAdmin(page: Page, path: string, heading: string): Promise<void> {
  await signInToShell(page, 'admin', path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

test.describe('สถานที่และบริเวณ (§13.1)', () => {
  test('the five locations with their area counts and status; mobile cards, desktop table', async ({ page }) => {
    await openAdmin(page, '/admin/locations', 'สถานที่และบริเวณ');
    const list = page.getByTestId('location-list');
    for (const label of ['WH300', 'FAC16', 'FAC17', 'Office 195', 'Cafe 222']) await expect(list.getByRole('link', { name: label, exact: true })).toBeVisible();
    await expect(list.getByText('6 บริเวณ').first()).toBeVisible();
    await expect(list.getByText('ใช้งาน').first()).toBeVisible();
    if (isMobileWidth(page)) await expect(page.getByRole('table')).toHaveCount(0);
    else await expect(page.getByRole('table', { name: 'สถานที่' })).toBeVisible();
    await expectLayout(page);
  });

  test('empty: no locations yet → says so and offers the five of the brief', async ({ page }) => {
    await page.route('**/api/admin/places', (route) => route.fulfill({ json: { locations: [], areas: [], qr_codes: [] } }));
    await openAdmin(page, '/admin/locations', 'สถานที่และบริเวณ');
    await expect(page.getByText('ยังไม่มีสถานที่')).toBeVisible();
    await expect(page.getByRole('button', { name: 'เพิ่ม 5 สถานที่ตาม brief' })).toBeVisible();
    await expectLayout(page);
  });

  test('D-A11-4: add a location and rename it — the address (its ID) stays the same', async ({ page }, testInfo) => {
    const name = own(testInfo, 'สถานที่ทดสอบ');
    await openAdmin(page, '/admin/locations', 'สถานที่และบริเวณ');
    await page.getByLabel('ชื่อสถานที่ใหม่').fill(name);
    await page.getByRole('button', { name: 'เพิ่มสถานที่' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'เพิ่มสถานที่แล้ว' })).toBeVisible();
    const link = page.getByTestId('location-list').getByRole('link', { name, exact: true });
    await expect(link).toBeVisible();
    await expectLayout(page);
    await link.click();
    await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
    const address = page.url();
    expect(address).toMatch(/\/admin\/locations\/loc-[0-9a-f]{12}$/);
    const renamed = `${name} (ใหม่)`;
    await page.getByRole('button', { name: 'แก้ชื่อสถานที่' }).click();
    await page.getByLabel('ชื่อสถานที่', { exact: true }).fill(renamed);
    await page.getByRole('button', { name: 'บันทึกชื่อสถานที่' }).click();
    await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();
    expect(page.url()).toBe(address);
    await expectLayout(page);
  });

  test('WH300: its six areas from the brief', async ({ page }) => {
    await openAdmin(page, '/admin/locations/loc-wh300', 'WH300');
    for (const label of ['ห้องแพ็คชั้น 1', 'ห้อง QA ชั้น 1', 'ออฟฟิศชั้น 2', 'คลังสินค้าชั้น 3', 'คลังสินค้าชั้น 4', 'ห้องเก็บของชั้น 5']) {
      await expect(page.getByTestId('area-list').getByText(label, { exact: true })).toBeVisible();
    }
    if (isMobileWidth(page)) await expect(page.getByRole('table')).toHaveCount(0);
    else await expect(page.getByRole('table', { name: 'บริเวณของ WH300' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'สถานที่ทั้งหมด' })).toBeVisible();
    await expectLayout(page);
  });

  test('add, rename, close and open an area; a taken name keeps what was typed', async ({ page }, testInfo) => {
    const name = own(testInfo, 'ห้องทดสอบ');
    await openAdmin(page, '/admin/locations/loc-fac17', 'FAC17');
    const input = page.getByLabel('ชื่อบริเวณใหม่');
    await input.fill(name);
    await page.getByRole('button', { name: 'เพิ่มบริเวณ' }).click();
    const row = areaRow(page, name);
    await expect(row).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'เพิ่มบริเวณแล้ว' })).toBeVisible();
    await expect(input).toHaveValue('');

    // §13 states: a taken name → an error, and the form keeps the value.
    await input.fill(name);
    await page.getByRole('button', { name: 'เพิ่มบริเวณ' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'มีบริเวณชื่อนี้ในสถานที่นี้แล้ว' })).toBeVisible();
    await expect(input).toHaveValue(name);
    // The browser logs the refused request itself; that 409 is the answer this step expects.
    problems = problems.filter((line) => !line.includes('status of 409'));
    await input.fill('');

    await row.getByRole('button', { name: 'แก้ชื่อ' }).click();
    const renamed = `${name} (ใหม่)`;
    await row.getByLabel('ชื่อบริเวณ').fill(renamed);
    await row.getByRole('button', { name: 'บันทึกชื่อ' }).click();
    const renamedRow = areaRow(page, renamed);
    await expect(renamedRow).toBeVisible();

    // D-S08-3: closed, not deleted — it stays on the list with its status.
    await renamedRow.getByRole('button', { name: 'ปิดใช้งาน', exact: true }).click();
    await expect(renamedRow.getByText('ปิดใช้งานแล้ว')).toBeVisible();
    await expect(renamedRow.getByRole('button', { name: 'เปิดใช้งาน', exact: true })).toBeVisible();
    await renamedRow.getByRole('button', { name: 'เปิดใช้งาน', exact: true }).click();
    await expect(renamedRow.getByRole('button', { name: 'ปิดใช้งาน', exact: true })).toBeVisible();
    await expectLayout(page);
  });
});

test.describe('QR ของบริเวณ (§13.2)', () => {
  test('choose a place and area → a preview with a readable name, the test link, print/download; it creates no request', async ({ page, baseURL }) => {
    await openAdmin(page, '/admin/qr', 'QR ของบริเวณ');
    await expect(page.getByText('ยังไม่เลือกบริเวณ')).toBeVisible();
    await page.getByLabel('สถานที่').selectOption({ label: 'WH300' });
    await page.getByLabel('บริเวณ', { exact: true }).selectOption({ label: 'ห้องแพ็คชั้น 1' });
    const preview = page.getByTestId('qr-preview');
    await expect(preview.getByRole('heading', { name: 'WH300 · ห้องแพ็คชั้น 1' })).toBeVisible();
    await expect(preview.getByRole('img', { name: 'QR ของ WH300 · ห้องแพ็คชั้น 1' })).toBeVisible();
    const link = `${baseURL}/q/${FIXTURE_QR}`;
    await expect(preview.getByText(link, { exact: true })).toBeVisible();
    await expect(preview.getByRole('link', { name: 'เปิดลิงก์ทดสอบ' })).toHaveAttribute('href', link);
    await expect(preview.getByRole('link', { name: 'พิมพ์ / ดาวน์โหลด' })).toHaveAttribute('href', `/admin/qr/${FIXTURE_QR}/print`);
    await expect(preview.getByText('หน้านี้ไม่สร้างงานแจ้งซ่อม')).toBeVisible();
    await expectLayout(page);
  });

  test('print page: a sample with the watermark “ตัวอย่าง ห้ามพิมพ์ติดจริง” until the production base URL is set', async ({ page, baseURL }) => {
    await openAdmin(page, `/admin/qr/${FIXTURE_QR}/print`, 'พิมพ์ QR');
    const sheet = page.getByTestId('qr-print-sheet');
    await expect(sheet.getByText('ตัวอย่าง ห้ามพิมพ์ติดจริง')).toBeVisible();
    await expect(page.getByText('ยังไม่ได้ตั้งโดเมนจริง')).toBeVisible();
    await expect(sheet.getByRole('img', { name: 'QR ของ WH300 · ห้องแพ็คชั้น 1' })).toBeVisible();
    await expect(sheet.getByText(`${baseURL}/q/${FIXTURE_QR}`, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'พิมพ์' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'ดาวน์โหลด SVG' })).toBeVisible();
    await expectLayout(page);
  });

  test('a new code for an area, moved to another area with the same link, then turned off', async ({ page }, testInfo) => {
    const first = own(testInfo, 'QR ต้นทาง');
    const second = own(testInfo, 'QR ปลายทาง');
    await openAdmin(page, '/admin/locations/loc-fac16', 'FAC16');
    for (const name of [first, second]) {
      await page.getByLabel('ชื่อบริเวณใหม่').fill(name);
      await page.getByRole('button', { name: 'เพิ่มบริเวณ' }).click();
      await expect(page.getByTestId('area-list').getByText(name, { exact: true })).toBeVisible();
    }
    await page.goto('/admin/qr');
    await page.getByLabel('สถานที่').selectOption({ label: 'FAC16' });
    await page.getByLabel('บริเวณ', { exact: true }).selectOption({ label: first });
    await expect(page.getByText('บริเวณนี้ยังไม่มี QR')).toBeVisible();
    await page.getByRole('button', { name: 'สร้าง QR ของบริเวณนี้' }).click();
    const preview = page.getByTestId('qr-preview');
    const linkText = preview.getByTestId('qr-link');
    await expect(linkText).toHaveText(/\/q\/[A-Za-z0-9_-]{22}$/);
    const link = await linkText.textContent();

    await preview.getByLabel('ย้าย QR นี้ไปบริเวณ').selectOption({ label: second });
    await preview.getByRole('button', { name: 'ย้าย QR' }).click();
    await expect(preview.getByRole('heading', { name: `FAC16 · ${second}` })).toBeVisible();
    await expect(linkText).toHaveText(link ?? '');

    await page.getByLabel('บริเวณ', { exact: true }).selectOption({ label: first });
    await expect(page.getByText('บริเวณนี้ยังไม่มี QR')).toBeVisible();
    await page.getByLabel('บริเวณ', { exact: true }).selectOption({ label: second });
    await preview.getByRole('button', { name: 'ปิดใช้งาน QR', exact: true }).click();
    await expect(preview.getByText('QR นี้ปิดใช้งานแล้ว')).toBeVisible();
    await expect(preview.getByRole('button', { name: 'เปิดใช้งาน QR', exact: true })).toBeVisible();
    await expectLayout(page);
  });
});

test.describe('ปฏิทินบริษัท (§13.4)', () => {
  test('open weekdays, holidays shown in พ.ศ., the 24-hour business day, the pre-pilot check and the reminder time', async ({ page }) => {
    await openAdmin(page, '/admin/calendars', 'ปฏิทินบริษัท');
    await expect(page.getByText('1 วันทำการ = สะสม 24 ชั่วโมงบนวันที่เปิดทำการ')).toBeVisible();
    // D-A11-1: locked Monday–Friday in phase A — shown, not changeable; weekends per site come in B02.
    for (const day of ['จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์']) {
      await expect(page.getByRole('checkbox', { name: day })).toBeChecked();
      await expect(page.getByRole('checkbox', { name: day })).toBeDisabled();
    }
    for (const day of ['เสาร์', 'อาทิตย์']) {
      await expect(page.getByRole('checkbox', { name: day })).not.toBeChecked();
      await expect(page.getByRole('checkbox', { name: day })).toBeDisabled();
    }
    await expect(page.getByText('ตั้งวันเปิดทำการเสาร์–อาทิตย์รายสถานที่ได้ในรุ่นถัดไป (B02)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'บันทึกวันทำงาน' })).toHaveCount(0);
    const check = page.getByTestId('pilot-check');
    await expect(check.getByRole('heading', { name: 'ตรวจก่อน pilot: ธ.ค. 2569 – ม.ค. 2570' })).toBeVisible();
    await expect(check.getByText('พฤหัสบดี 31 ธ.ค. 2569')).toBeVisible();
    await expect(check.getByText('วันสิ้นปี (ตัวอย่าง)')).toBeVisible();
    await expect(check.getByText('ศุกร์ 1 ม.ค. 2570')).toBeVisible();
    await expect(page.getByLabel('เวลาส่งการเตือน (Asia/Bangkok)')).toHaveValue('09:00');
    await expectLayout(page);
  });

  test('D-A09-7: text-h2 on a real input is 24px (the utility wins over the layered input style)', async ({ page }) => {
    await openAdmin(page, '/admin/calendars', 'ปฏิทินบริษัท');
    const year = page.getByLabel('ปีที่แสดง (พ.ศ.)');
    await expect(year).toHaveClass(/\btext-h2\b/);
    expect(await year.evaluate((element) => getComputedStyle(element).fontSize)).toBe('24px');
    // The same input style without the utility is body size, so the 24px comes from text-h2.
    const name = page.getByLabel('ชื่อวันหยุด');
    expect(await name.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px');
  });

  test('add a holiday typed in พ.ศ. (stored ค.ศ.): preview, “มีผลภายใน 15 นาที”, then remove it', async ({ page }, testInfo) => {
    const day = PROJECT_DAY[testInfo.project.name] ?? 8;
    const name = own(testInfo, 'วันหยุดทดสอบ');
    await openAdmin(page, '/admin/calendars', 'ปฏิทินบริษัท');
    const form = page.getByTestId('holiday-form');
    await form.getByLabel('วันที่', { exact: true }).fill(String(day));
    await form.getByLabel('เดือน').selectOption({ label: 'มีนาคม' });
    await form.getByLabel('ปี (พ.ศ.)').fill('2570');
    await form.getByLabel('ชื่อวันหยุด').fill(name);
    await expect(form.getByTestId('holiday-preview')).toContainText(`${day} มี.ค. 2570`);
    await form.getByRole('button', { name: 'เพิ่มวันหยุด' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'บันทึกแล้ว มีผลภายใน 15 นาที' })).toBeVisible();
    const list = page.getByTestId('holiday-list');
    const row = list.getByRole('listitem').filter({ hasText: name });
    await expect(row).toContainText(`${day} มี.ค. 2570`);
    await expect(page.getByLabel('ปีที่แสดง (พ.ศ.)')).toHaveValue('2570');
    await expectLayout(page);
    // D-A11-5: deleting asks first, naming the day; “ยกเลิก” keeps it.
    await row.getByRole('button', { name: 'ลบ', exact: true }).click();
    const confirm = page.getByRole('alertdialog', { name: 'ลบวันหยุดนี้?' });
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(`${day} มี.ค. 2570`);
    await expect(confirm).toContainText(name);
    await expectLayout(page);
    await confirm.getByRole('button', { name: 'ยกเลิก' }).click();
    await expect(confirm).toHaveCount(0);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'ลบ', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'ลบวันหยุดนี้?' }).getByRole('button', { name: 'ลบวันหยุด' }).click();
    await expect(list.getByRole('listitem').filter({ hasText: name })).toHaveCount(0);
    await expect(page.getByRole('status').filter({ hasText: 'ลบวันหยุดแล้ว มีผลภายใน 15 นาที' })).toBeVisible();
  });

  test('D-S01-6: a ค.ศ.-looking year is refused with a reason, nothing saved, the form keeps its values', async ({ page }, testInfo) => {
    const name = own(testInfo, 'ปีผิด');
    await openAdmin(page, '/admin/calendars', 'ปฏิทินบริษัท');
    const form = page.getByTestId('holiday-form');
    await form.getByLabel('วันที่', { exact: true }).fill('10');
    await form.getByLabel('เดือน').selectOption({ label: 'มีนาคม' });
    await form.getByLabel('ปี (พ.ศ.)').fill('2027');
    await form.getByLabel('ชื่อวันหยุด').fill(name);
    await expect(form.getByText('ปี 2027 ดูเหมือนเป็น ค.ศ. กรอกเป็น พ.ศ. เช่น 2570')).toBeVisible();
    await expect(form.getByLabel('ปี (พ.ศ.)')).toHaveAttribute('aria-invalid', 'true');
    await form.getByRole('button', { name: 'เพิ่มวันหยุด' }).click();
    await expect(form.getByRole('alert')).toContainText('ปี 2027 ดูเหมือนเป็น ค.ศ.');
    await expect(form.getByLabel('ชื่อวันหยุด')).toHaveValue(name);
    await expect(page.getByTestId('holiday-list').getByText(name)).toHaveCount(0);
  });
});

test.describe('สุขภาพระบบ (FU-25)', () => {
  test('red with words: no finished tick, the Slack app down (e-mail instead), a failed job, an undelivered notice', async ({ page }) => {
    await openAdmin(page, '/admin/health', 'สุขภาพระบบ');
    await expect(page.getByTestId('health-summary')).toContainText('ต้องแก้ไข');
    const tick = page.getByTestId('health-tick');
    await expect(tick).toContainText('ยังไม่มีรอบที่ทำงานเสร็จ');
    await expect(tick).toHaveAttribute('data-level', 'red');
    const slack = page.getByTestId('health-slack');
    await expect(slack).toContainText('แอป Slack ใช้ไม่ได้ (SLACK_INVALID_AUTH)');
    await expect(slack).toContainText('20 ต.ค. 2569 08:00 น.');
    await expect(slack).toContainText('ส่งทางอีเมลแทน');
    await expect(page.getByTestId('health-jobs')).toContainText('presence_reset-2026-10-19');
    // Counts are of the last 7 days (D-A11-6); the fixture's dates are fixed, so only the wording here.
    await expect(page.getByTestId('health-outbox')).toContainText(/ส่งไม่สำเร็จ \d+/);
    await expect(page.getByText('a11.fixture.private@tdfb.co')).toHaveCount(0);
    await expectLayout(page);
  });

  test('a tick older than 30 minutes is red; a recent one is normal', async ({ page }) => {
    const now = Date.now();
    const body = (completed: number) => ({
      level: 'red',
      checked_at: now,
      tick: { level: now - completed > 30 * 60_000 ? 'red' : 'ok', ...(now - completed > 30 * 60_000 ? { reason: 'TICK_LATE' } : {}), last_started_at: completed - 1_000, last_completed_at: completed },
      slack_app: { level: 'ok' },
      outbox: { failed: 0, delivery_unknown: 0, email_cap_pending: 0 },
      slack_fallback: {},
      failed_jobs: [],
      failed_job_count: 0,
    });
    let reply = body(now - 45 * 60_000);
    await page.route('**/api/admin/health', (route) => route.fulfill({ json: reply }));
    await openAdmin(page, '/admin/health', 'สุขภาพระบบ');
    await expect(page.getByTestId('health-tick')).toHaveAttribute('data-level', 'red');
    await expect(page.getByTestId('health-tick')).toContainText('ไม่ได้ทำงานเกิน 30 นาที');
    reply = { ...body(now - 5 * 60_000), level: 'ok' };
    await page.getByRole('button', { name: 'ตรวจอีกครั้ง' }).click();
    await expect(page.getByTestId('health-tick')).toHaveAttribute('data-level', 'ok');
    await expect(page.getByTestId('health-summary')).toContainText('ปกติ');
  });
});
