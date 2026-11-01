// A13 — U1 “มีคนแจ้งเรื่องนี้แล้ว” (UI-03 between steps 3 and 4): after the symptom the form asks the API
// for open public repairs at the same place/area/symptom; a match shows the interstitial (number, title,
// status, assignee) with “ใช่ เรื่องเดียวกัน — ติดตามเรื่องนี้” and “ไม่ใช่ แจ้งเรื่องใหม่” (step 4, nothing
// lost); no match → no interstitial; “อื่นๆ” is never checked; the requester of a match and someone already
// watching see that instead of the button; watching asks for one optional note (photos: A15) and says no
// new request was made; a failed check says so and never claims there is no duplicate. The fixture
// request DEV-9101 (WH300 · ห้อง QA ชั้น 1 · กล้องวงจรปิด, reported by the Viewer, watched by “logout”)
// runs against the real API; watching and failures are mocked (the API side is tests/emulator).
import { expect, test, type Page, type Route } from '@playwright/test';
import { horizontalOverflow, keepLocal, signInToShell, smallTargets, watchErrors, type AccountKey } from '../support/app';

const REPAIR = '/requests/new?type=maintenance&origin=requester';
const FIXTURE_ID = 'req-a13-dup-0001';
const FIXTURE_TITLE = 'กล้องวงจรปิด — ห้อง QA ชั้น 1 · WH300';

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

const choice = (page: Page, name: string) => page.getByTestId('repair-choices').getByRole('button', { name, exact: true });
const bar = (page: Page) => page.getByTestId('repair-action-bar');
const interstitial = (page: Page) => page.getByTestId('repair-duplicates');
const WATCH = 'ใช่ เรื่องเดียวกัน — ติดตามเรื่องนี้';
const NOT_SAME = 'ไม่ใช่ แจ้งเรื่องใหม่';

async function toSymptom(page: Page, who: AccountKey, place: string, area: string, symptom: string): Promise<void> {
  await signInToShell(page, who, REPAIR);
  await expect(page.getByTestId('repair-loading')).toHaveCount(0);
  await choice(page, place).click();
  await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
  await choice(page, area).click();
  await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
  await choice(page, symptom).click();
}

const MOCK_MATCH = {
  request_id: 'req-a13-mock-0001',
  request_number: 'DEV-9201',
  summary_title: 'แอร์ — ห้องแพ็คชั้น 1 · WH300',
  status: 'in_progress',
  is_assigned: true,
  assignee_label: 'คุณช่าง ตัวอย่าง',
  location_label: 'WH300',
  area_label: 'ห้องแพ็คชั้น 1',
  watcher_count: 2,
  created_at: 1793500000000,
  viewer: 'none',
};

test.describe('หน้าคั่น “มีคนแจ้งเรื่องนี้แล้ว” (U1, real API)', () => {
  test('a match: number, title, status, assignee and extra reporters; “ไม่ใช่ แจ้งเรื่องใหม่” goes to step 4 with everything kept', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/repair/duplicates')) asked.push(new URL(request.url()).search);
    });
    await toSymptom(page, 'requester', 'WH300', 'ห้อง QA ชั้น 1', 'กล้องวงจรปิด');
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    await expect(page.getByRole('heading', { name: 'มีคนแจ้งเรื่องนี้แล้ว' })).toBeVisible();
    expect(asked).toEqual(['?location_id=loc-wh300&area_id=area-wh300-qa-1&symptom_key=cctv']);
    const card = interstitial(page).getByTestId('duplicate-card');
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('DEV-9101');
    await expect(card).toContainText(FIXTURE_TITLE);
    await expect(card).toContainText('รอคิว');
    await expect(card).toContainText('ยังไม่มอบหมาย');
    await expect(card).toContainText('มีผู้แจ้งเพิ่ม 1 คน');
    await expect(card.getByRole('button', { name: WATCH })).toBeVisible();
    // Only the public summary: who reported it is not shown.
    await expect(interstitial(page)).not.toContainText('a09.viewer');
    await expectLayout(page);
    for (const button of await page.getByRole('button', { name: new RegExp(`${WATCH}|${NOT_SAME}`) }).all()) {
      expect((await button.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    await bar(page).getByRole('button', { name: NOT_SAME }).click();
    await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
    await expect(interstitial(page)).toHaveCount(0);
    await expect(page.getByTestId('repair-context')).toContainText('WH300 · ห้อง QA ชั้น 1');
    await expect(page.getByTestId('repair-title-preview')).toContainText(FIXTURE_TITLE);
    await bar(page).getByRole('button', { name: 'ย้อนกลับ' }).click();
    await expect(choice(page, 'กล้องวงจรปิด')).toHaveAttribute('aria-pressed', 'true');
  });

  test('the requester of the match: “คุณแจ้งเรื่องนี้ไว้แล้ว” with a link to their request, no watch button', async ({ page }) => {
    await toSymptom(page, 'viewer', 'WH300', 'ห้อง QA ชั้น 1', 'กล้องวงจรปิด');
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    const card = interstitial(page).getByTestId('duplicate-card');
    await expect(card).toContainText('คุณแจ้งเรื่องนี้ไว้แล้ว');
    await expect(card.getByRole('link', { name: 'ดูงานของคุณ' })).toHaveAttribute('href', `/requests/${FIXTURE_ID}`);
    await expect(card.getByRole('button', { name: WATCH })).toHaveCount(0);
    await expectLayout(page);
  });

  test('someone already watching: “คุณติดตามเรื่องนี้อยู่แล้ว” with a link, no second watch', async ({ page }) => {
    await toSymptom(page, 'logout', 'WH300', 'ห้อง QA ชั้น 1', 'กล้องวงจรปิด');
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    const card = interstitial(page).getByTestId('duplicate-card');
    await expect(card).toContainText('คุณติดตามเรื่องนี้อยู่แล้ว');
    await expect(card.getByRole('link', { name: 'ดูข้อมูลสรุป' })).toHaveAttribute('href', `/requests/${FIXTURE_ID}`);
    await expect(card.getByRole('button', { name: WATCH })).toHaveCount(0);
  });

  test('no match → no interstitial; “อื่นๆ” is not checked at all', async ({ page }) => {
    const asked: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/repair/duplicates')) asked.push(new URL(request.url()).search);
    });
    await toSymptom(page, 'requester', 'WH300', 'ห้องแพ็คชั้น 1', 'หลอดไฟ');
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
    await expect(interstitial(page)).toHaveCount(0);
    expect(asked).toHaveLength(1);
    await bar(page).getByRole('button', { name: 'ย้อนกลับ' }).click();
    await choice(page, 'อื่นๆ').click();
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
    expect(asked).toHaveLength(1);
  });
});

test.describe('ติดตามเรื่องนี้ (U1, mocked API)', () => {
  test('watching: one optional note (photos come later), sent once; “ติดตามงานนี้แล้ว” without a new request', async ({ page }) => {
    const sent: unknown[] = [];
    await page.route('**/api/repair/duplicates?*', (route) => route.fulfill({ json: { matches: [MOCK_MATCH] } }));
    await page.route('**/api/commands', async (route: Route) => {
      const body = route.request().postDataJSON() as { payload: { request_id: string } };
      sent.push(body);
      await route.fulfill({ json: { replayed: false, result: { request_id: body.payload.request_id, request_number: 'DEV-9201', watch: 'added' } } });
    });
    await toSymptom(page, 'requester', 'WH300', 'ห้องแพ็คชั้น 1', 'แอร์');
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    const card = interstitial(page).getByTestId('duplicate-card');
    await expect(card).toContainText('กำลังทำ');
    await expect(card).toContainText('คุณช่าง ตัวอย่าง');
    await expect(card).toContainText('มีผู้แจ้งเพิ่ม 2 คน');
    await card.getByRole('button', { name: WATCH }).click();

    const dialog = page.getByRole('dialog', { name: 'ติดตามเรื่องนี้' });
    await expect(dialog).toContainText('DEV-9201');
    await expect(dialog).toContainText('โดยไม่ได้สิทธิ์รายละเอียดของผู้แจ้งคนแรก');
    await expect(dialog.getByText('แนบรูปเพิ่มได้ในรุ่นถัดไป')).toBeVisible();
    const note = dialog.getByLabel('หมายเหตุเพิ่มเติม (ส่งได้ครั้งเดียว ไม่บังคับ)');
    await expect(note).toHaveAttribute('maxlength', '1000');
    await note.fill('แอร์มีน้ำหยดใส่โต๊ะแพ็คด้วย');
    await expectLayout(page);
    await dialog.getByRole('button', { name: 'ยืนยันติดตาม' }).click();

    const done = page.getByTestId('repair-watched');
    await expect(done.getByRole('heading', { name: 'ติดตามงานนี้แล้ว' })).toBeVisible();
    await expect(done).toContainText('DEV-9201');
    await expect(done).toContainText('ไม่ได้สร้างงานใหม่');
    await expect(done).toContainText('โดยไม่ต้องยืนยันปิดงาน');
    await expect(done.getByRole('link', { name: 'ดูข้อมูลสรุป' })).toHaveAttribute('href', '/requests/req-a13-mock-0001');
    expect(sent).toEqual([{ command_id: expect.any(String), type: 'watch_request', payload: { request_id: 'req-a13-mock-0001', note: 'แอร์มีน้ำหยดใส่โต๊ะแพ็คด้วย' } }]);
    await expectLayout(page);
  });

  test('a title the GM edited without the place: the card still says where (U1 “ข้อมูลสถานที่/บริเวณที่เปิดเผยได้”)', async ({ page }) => {
    await page.route('**/api/repair/duplicates?*', (route) =>
      route.fulfill({ json: { matches: [MOCK_MATCH, { ...MOCK_MATCH, request_id: 'req-a13-mock-0002', request_number: 'DEV-9202', summary_title: 'แอร์ไม่เย็น มีน้ำหยด' }] } }),
    );
    await toSymptom(page, 'requester', 'WH300', 'ห้องแพ็คชั้น 1', 'แอร์');
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    const cards = interstitial(page).getByTestId('duplicate-card');
    await expect(cards.nth(1).getByTestId('duplicate-place')).toHaveText('WH300 · ห้องแพ็คชั้น 1');
    // The automatic title already says where: not repeated.
    await expect(cards.nth(0).getByTestId('duplicate-place')).toHaveCount(0);
  });

  test('without a note the payload has none; “ย้อนกลับ” in the dialog sends nothing', async ({ page }) => {
    const sent: { payload: Record<string, unknown> }[] = [];
    await page.route('**/api/repair/duplicates?*', (route) => route.fulfill({ json: { matches: [MOCK_MATCH] } }));
    await page.route('**/api/commands', async (route: Route) => {
      sent.push(route.request().postDataJSON() as { payload: Record<string, unknown> });
      await route.fulfill({ json: { replayed: false, result: { request_id: MOCK_MATCH.request_id, request_number: 'DEV-9201', watch: 'added' } } });
    });
    await toSymptom(page, 'requester', 'WH300', 'ห้องแพ็คชั้น 1', 'แอร์');
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    await interstitial(page).getByRole('button', { name: WATCH }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ย้อนกลับ' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(sent).toEqual([]);
    await interstitial(page).getByRole('button', { name: WATCH }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ยืนยันติดตาม' }).click();
    await expect(page.getByTestId('repair-watched')).toBeVisible();
    expect(sent.map((body) => body.payload)).toEqual([{ request_id: MOCK_MATCH.request_id }]);
  });

  test('a request closed meanwhile cannot be watched: said in words, the list is checked again', async ({ page }) => {
    let checks = 0;
    await page.route('**/api/repair/duplicates?*', (route) => {
      checks += 1;
      return route.fulfill({ json: { matches: checks === 1 ? [MOCK_MATCH] : [] } });
    });
    await page.route('**/api/commands', (route) => route.fulfill({ status: 422, json: { error: 'WATCH_NOT_OPEN' } }));
    await toSymptom(page, 'requester', 'WH300', 'ห้องแพ็คชั้น 1', 'แอร์');
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    await interstitial(page).getByRole('button', { name: WATCH }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'ยืนยันติดตาม' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'งานนี้ปิดหรือเสร็จไปแล้ว ติดตามไม่ได้' })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Checked again: nothing open now, so the form goes on to step 4.
    await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
    expect(checks).toBe(2);
    problems = problems.filter((line) => !line.includes('status of 422'));
  });

  test('a failed check says so (never “no duplicate”): “ลองอีกครั้ง” checks again; or go on with a new report', async ({ page }) => {
    let fail = true;
    await page.route('**/api/repair/duplicates?*', (route) => (fail ? route.fulfill({ status: 500, json: { error: 'INTERNAL' } }) : route.fulfill({ json: { matches: [MOCK_MATCH] } })));
    await toSymptom(page, 'requester', 'WH300', 'ห้องแพ็คชั้น 1', 'แอร์');
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    const failed = page.getByTestId('repair-duplicates-failed');
    await expect(failed).toContainText('ตรวจงานซ้ำไม่ได้');
    await expect(page.getByText('ไม่มีงานซ้ำ')).toHaveCount(0);
    await expect(page.getByText('ขั้น 4 จาก 4')).toHaveCount(0);
    await expectLayout(page);
    fail = false;
    await failed.getByRole('button', { name: 'ลองอีกครั้ง' }).click();
    await expect(page.getByRole('heading', { name: 'มีคนแจ้งเรื่องนี้แล้ว' })).toBeVisible();

    await bar(page).getByRole('button', { name: 'ย้อนกลับ' }).click();
    fail = true;
    await bar(page).getByRole('button', { name: 'ถัดไป' }).click();
    await failed.getByRole('button', { name: 'แจ้งเรื่องใหม่ต่อ' }).click();
    await expect(page.getByText('ขั้น 4 จาก 4')).toBeVisible();
    problems = problems.filter((line) => !line.includes('status of 500'));
  });
});
