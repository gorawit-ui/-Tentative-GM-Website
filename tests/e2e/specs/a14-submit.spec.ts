// A14 — step 4 and sending the repair (UI-03, U1 “กันส่งพร้อมกัน”, U2, FU-21, FU-47, FU-49): the
// automatic title read-only, the description (“อื่นๆ” must be described), no photo part yet (A15); one
// command_id per filled form, reused on every retry, the send button locked while sending; the
// duplicate check again when sending (a match shows the interstitial again, nothing typed is lost, “แจ้ง
// เรื่องใหม่” sends without asking again); success says the number, that the GM team was told, and links
// to the request; “not set up” (503) and other errors in Thai with what to do; the draft kept in this
// tab's session only (choices and text), cleared on success and on logout. Real API where it creates a
// request (a symptom per screen size so the four runs do not match each other); errors and races mocked.
import { expect, test, type Page, type Route } from '@playwright/test';
import { horizontalOverflow, isMobileWidth, keepLocal, signInToShell, smallTargets, watchErrors } from '../support/app';

const REPAIR = '/requests/new?type=maintenance&origin=requester';
const DRAFT_KEY = 'gm.repair.draft';
/** One symptom per project: real requests of parallel runs never match each other. */
const SYMPTOM_BY_PROJECT: Readonly<Record<string, string>> = {
  'mobile-360x640': 'ไฟดับ',
  'mobile-390x844': 'ลิฟท์',
  'laptop-1366x768': 'ห้องน้ำ',
  'desktop-1440x900': 'ซิงค์',
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

const choice = (page: Page, name: string) => page.getByTestId('repair-choices').getByRole('button', { name, exact: true });
const bar = (page: Page) => page.getByTestId('repair-action-bar');
const sendButton = (page: Page) => bar(page).getByRole('button', { name: /ส่งเรื่อง|ส่งอีกครั้ง|กำลังส่ง/ });
const details = (page: Page) => page.getByTestId('repair-details');

async function toStep4(page: Page, symptom: string, opts: { signIn?: boolean } = {}): Promise<void> {
  if (opts.signIn !== false) await signInToShell(page, 'requester', REPAIR);
  await expect(page.getByTestId('repair-loading')).toHaveCount(0);
  await choice(page, 'Office 195').click();
  await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
  await choice(page, 'ไม่ระบุ').click();
  await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
  await choice(page, symptom).click();
  await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
  await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
}

async function draft(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    const raw = sessionStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
  }, DRAFT_KEY);
}

async function expectLayout(page: Page): Promise<void> {
  expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
  expect(await smallTargets(page)).toEqual([]);
}

test.describe('ขั้น 4 และการส่ง (real API)', () => {
  test('step 4: the automatic title read-only, an optional description, no photo part; sent → number, GM told, link to my request; the draft is gone', async ({ page }, testInfo) => {
    const symptom = SYMPTOM_BY_PROJECT[testInfo.project.name] ?? 'ไฟดับ';
    await toStep4(page, symptom);
    await expect(page.getByRole('heading', { name: 'รายละเอียด', exact: true })).toBeVisible();
    // U2: shown, not editable.
    const title = page.getByTestId('repair-title-preview');
    await expect(title).toContainText(`${symptom} · Office 195`);
    await expect(title.locator('input, textarea')).toHaveCount(0);
    await expect(details(page).getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)')).toBeVisible();
    // Photos come with A15: nothing that looks usable now.
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await expect(details(page)).not.toContainText('รูป');
    await expectLayout(page);
    // At 360×640 (and every size) the send button is on screen.
    const box = await sendButton(page).boundingBox();
    expect(box !== null && box.y + box.height <= (page.viewportSize()?.height ?? 0)).toBe(true);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    await details(page).getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)').fill('ตรงทางเดินหน้าห้องประชุม');
    await sendButton(page).click();
    const sent = page.getByTestId('repair-sent');
    await expect(sent.getByRole('heading', { name: 'ส่งเรื่องเรียบร้อยแล้ว' })).toBeVisible();
    await expect(sent).toContainText(/DEV-\d{4}/);
    await expect(sent).toContainText('ทีม GM ได้รับแจ้งแล้ว');
    await expect(sent.getByRole('link', { name: 'ดูงานของฉัน' })).toHaveAttribute('href', /^\/requests\/[A-Za-z0-9_-]+$/);
    expect(await draft(page)).toBeNull();
    await expectLayout(page);
  });

  test('“อื่นๆ” must be described: sending empty says so and sends nothing; described → sent', async ({ page }) => {
    let sends = 0;
    page.on('request', (request) => {
      if (request.url().endsWith('/api/commands') && request.method() === 'POST') sends += 1;
    });
    await toStep4(page, 'อื่นๆ');
    const box = details(page).getByLabel('อธิบายอาการ (ต้องกรอก)');
    await expect(box).toBeVisible();
    await sendButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'อธิบายอาการก่อนส่ง' })).toBeVisible();
    await expect(box).toBeFocused();
    expect(sends).toBe(0);
    await box.fill('ประตูห้องประชุมปิดไม่สนิท');
    await sendButton(page).click();
    await expect(page.getByTestId('repair-sent')).toContainText('อื่นๆ · Office 195');
    expect(sends).toBe(1);
  });
});

test.describe('ส่งซ้ำ / เน็ตหลุด / ตรวจซ้ำตอนส่ง / error (mocked)', () => {
  const OK = { replayed: false, result: { request_id: 'req-a14-mock-0001', request_number: 'DEV-9301', status: 'queued', is_assigned: false } };

  test('one command_id per form: a lost reply then “ส่งอีกครั้ง” reuses it; a double tap while sending sends once', async ({ page }) => {
    const bodies: { command_id: string; type: string; payload: Record<string, unknown> }[] = [];
    let call = 0;
    await page.route('**/api/commands', async (route: Route) => {
      bodies.push(route.request().postDataJSON() as (typeof bodies)[number]);
      call += 1;
      if (call === 1) return route.abort('internetdisconnected');
      await new Promise((resolve) => setTimeout(resolve, 800));
      return route.fulfill({ json: OK });
    });
    await toStep4(page, 'อินเทอร์เน็ต');
    await sendButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'ยังไม่แน่ใจว่าส่งถึงหรือไม่' })).toBeVisible();
    await expect(sendButton(page)).toHaveText(/ส่งอีกครั้ง/);
    await sendButton(page).click();
    await expect(sendButton(page)).toBeDisabled();
    await sendButton(page).click({ force: true });
    await expect(page.getByTestId('repair-sent')).toContainText('DEV-9301');
    expect(bodies).toHaveLength(2);
    expect(bodies[0]!.command_id).toBe(bodies[1]!.command_id);
    expect(bodies[0]!.payload).toEqual(bodies[1]!.payload);
    problems = problems.filter((line) => !line.includes('ERR_INTERNET_DISCONNECTED') && !line.includes('Failed to fetch'));
  });

  test('FU-49: a match appeared while filling → the interstitial again, nothing typed lost; “แจ้งเรื่องใหม่” sends without asking again', async ({ page }) => {
    const bodies: { command_id: string; payload: Record<string, unknown> }[] = [];
    let duplicatesNow: unknown[] = [];
    const match = {
      request_id: 'req-a14-mock-0002',
      request_number: 'DEV-9302',
      summary_title: 'อินเทอร์เน็ต · Office 195',
      status: 'queued',
      is_assigned: false,
      location_label: 'Office 195',
      watcher_count: 0,
      created_at: 1793500000000,
      viewer: 'none',
    };
    await page.route('**/api/repair/duplicates?*', (route) => route.fulfill({ json: { matches: duplicatesNow } }));
    await page.route('**/api/commands', async (route: Route) => {
      const body = route.request().postDataJSON() as (typeof bodies)[number];
      bodies.push(body);
      // Like the API: refused while the match is not among the answered ones.
      const known = (body.payload.known_duplicate_ids ?? []) as string[];
      if (!known.includes(match.request_id)) {
        duplicatesNow = [match];
        return route.fulfill({ status: 409, json: { error: 'DUPLICATE_FOUND', current: { request_ids: [match.request_id] } } });
      }
      return route.fulfill({ json: OK });
    });
    await toStep4(page, 'อินเทอร์เน็ต');
    await details(page).getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)').fill('ใช้ไม่ได้ทั้งชั้น 2');
    await sendButton(page).click();
    await expect(page.getByRole('heading', { name: 'มีคนแจ้งเรื่องนี้แล้ว' })).toBeVisible();
    await expect(page.getByTestId('duplicate-card')).toContainText('DEV-9302');
    // Back to the details: what was typed is still there.
    await page.getByTestId('repair-duplicates').getByRole('button', { name: 'ย้อนกลับไปแก้รายละเอียด' }).click();
    await expect(details(page).getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)')).toHaveValue('ใช้ไม่ได้ทั้งชั้น 2');
    await sendButton(page).click();
    await expect(page.getByRole('heading', { name: 'มีคนแจ้งเรื่องนี้แล้ว' })).toBeVisible();
    await bar(page).getByRole('button', { name: 'แจ้งเรื่องใหม่', exact: true }).click();
    await expect(page.getByTestId('repair-sent')).toContainText('DEV-9301');
    expect(bodies).toHaveLength(3);
    expect(bodies[0]!.payload).not.toHaveProperty('known_duplicate_ids');
    expect(bodies[2]!.payload).toMatchObject({ description: 'ใช้ไม่ได้ทั้งชั้น 2', known_duplicate_ids: ['req-a14-mock-0002'] });
    expect(new Set(bodies.map((body) => body.command_id)).size).toBe(1);
    problems = problems.filter((line) => !line.includes('status of 409'));
  });

  test('not set up (503) → Thai message with the GM contacts; what was typed is kept', async ({ page }) => {
    await page.route('**/api/commands', (route) => route.fulfill({ status: 503, json: { error: 'ROUTING_NOT_CONFIGURED' } }));
    await toStep4(page, 'อินเทอร์เน็ต');
    await details(page).getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)').fill('เน็ตหลุด');
    await sendButton(page).click();
    const notReady = page.getByTestId('repair-send-not-ready');
    await expect(notReady).toContainText('ระบบแจ้งซ่อมยังตั้งค่าไม่ครบ');
    await expect(notReady).toContainText('ผู้ดูแลยังไม่ได้ตั้งผู้รับเรื่อง');
    await expect(notReady.getByRole('heading', { name: 'ติดต่อทีม GM' })).toBeVisible();
    await expect(details(page).getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)')).toHaveValue('เน็ตหลุด');
    await expectLayout(page);
    problems = problems.filter((line) => !line.includes('status of 503'));
  });

  test('other errors say what to do: a closed place → choose again; a server error → try again', async ({ page }) => {
    let reply: { status: number; json: unknown } = { status: 500, json: { error: 'INTERNAL' } };
    await page.route('**/api/commands', (route) => route.fulfill(reply));
    await toStep4(page, 'อินเทอร์เน็ต');
    await sendButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'ส่งไม่สำเร็จ' })).toContainText('ลองส่งอีกครั้ง');
    await expect(sendButton(page)).toHaveText(/ส่งอีกครั้ง/);
    reply = { status: 422, json: { error: 'LOCATION_UNAVAILABLE' } };
    await sendButton(page).click();
    await expect(page.getByRole('alert').filter({ hasText: 'สถานที่ บริเวณ หรืออาการนี้ใช้ไม่ได้แล้ว' })).toBeVisible();
    await page.getByRole('button', { name: 'เลือกสถานที่ใหม่' }).click();
    await expect(page.getByText('ขั้น 1 จาก 4')).toBeVisible();
    problems = problems.filter((line) => !line.includes('status of 422') && !line.includes('status of 500'));
  });
});

test.describe('จำค่าที่กรอกค้าง (FU-47, D-A12-5)', () => {
  test('kept in this tab: a reload brings the choices and the text back; only choices and text are stored; another tab starts empty', async ({ page, context }) => {
    await toStep4(page, 'อินเทอร์เน็ต');
    await details(page).getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)').fill('เน็ตช้ามาก');
    const stored = await draft(page);
    expect(stored).not.toBeNull();
    expect(Object.keys(stored ?? {}).sort()).toEqual(['areaId', 'commandId', 'description', 'dismissed', 'locationId', 'personId', 'step', 'symptomKey', 'v'].sort());
    expect(stored).toMatchObject({ locationId: 'loc-office195', areaId: '', symptomKey: 'internet', description: 'เน็ตช้ามาก', step: 4 });
    // Nothing kept anywhere lasting.
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.reload();
    await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
    await expect(details(page).getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)')).toHaveValue('เน็ตช้ามาก');
    await expect(page.getByTestId('repair-title-preview')).toContainText('อินเทอร์เน็ต · Office 195');
    const other = await context.newPage();
    await other.goto(REPAIR);
    await expect(other.getByText('ขั้น 1 จาก 4')).toBeVisible();
    await other.close();
  });

  test('logout clears it (a shared phone at the site); signing in again starts empty', async ({ page }) => {
    await toStep4(page, 'อินเทอร์เน็ต');
    await details(page).getByLabel('รายละเอียดเพิ่มเติม (ไม่บังคับ)').fill('ข้อความคนก่อน');
    expect(await draft(page)).not.toBeNull();
    if (isMobileWidth(page)) {
      await page.getByRole('button', { name: 'เมนูเพิ่มเติม' }).click();
      await page.getByRole('dialog', { name: 'เมนูเพิ่มเติม' }).getByRole('button', { name: 'ออกจากระบบ' }).click();
    } else {
      await page.getByTestId('sidebar').getByRole('button', { name: 'ออกจากระบบ' }).click();
    }
    await expect(page).toHaveURL(/\/login$/);
    expect(await draft(page)).toBeNull();
    await signInToShell(page, 'requester', REPAIR);
    await expect(page.getByText('ขั้น 1 จาก 4')).toBeVisible();
    await expect(page.getByText('ข้อความคนก่อน')).toHaveCount(0);
  });
});
