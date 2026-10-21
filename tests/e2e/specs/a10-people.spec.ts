// A10 — รายชื่อพนักงานและสิทธิ์ (Part 3 §13.3, D-A09-1, FU-10, FU-11, FU-38): the people list with
// role / account / Slack / signed-in state; the CSV import with columns chosen from the file's header,
// a preview with the bad rows before anything is saved; roles and accounts changed with a confirmation;
// the last GM Admin protected; the first login linked by the verified e-mail; logins not on the list
// shown to the GM Admin with “เพิ่มเข้ารายชื่อ”. Every project changes only its own person; the steps
// that change shared data (saving an import, adding a login to the list) run in one project only.
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { account, horizontalOverflow, isMobileWidth, keepLocal, signIn, signInToShell, smallTargets, watchErrors } from '../support/app';

const SHARED_PROJECT = 'desktop-1440x900';
/** A column the Admin does not choose; it must never leave the browser. */
const UNMAPPED = 'เบอร์มือถือ-ไม่ส่ง-0899999999';

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

async function openUsers(page: Page): Promise<void> {
  await signInToShell(page, 'admin', '/admin/users');
  await expect(page.getByRole('heading', { level: 1, name: 'รายชื่อพนักงานและสิทธิ์' })).toBeVisible();
  await expect(page.locator('.gm-admin-loading')).toHaveCount(0);
}

/** One person of the list: a card on mobile, a table row on desktop. */
const personRow = (page: Page, text: string) => page.getByTestId('people-list').locator('li, tbody tr').filter({ hasText: text });
const ownPerson = (testInfo: TestInfo) => ({ email: `a10.p-${testInfo.project.name}@tdfb.co`, name: `คุณทดสอบสิทธิ์ ${testInfo.project.name}` });

const CSV = [
  'Primary Email,First Name [Required],Department,Slack ID,Mobile',
  `a10.csv.one@tdfb.co,คุณนำเข้า หนึ่ง,ฝ่ายขาย,U0CSV0001,${UNMAPPED}`,
  `A10.CSV.Two@TDFB.CO,คุณนำเข้า สอง,,,${UNMAPPED}`,
  'outsider@gmail.com,คนนอกบริษัท,,,',
  'a10.csv.dup@tdfb.co,ซ้ำ หนึ่ง,,,',
  'A10.CSV.DUP@tdfb.co,ซ้ำ สอง,,,',
  'a10.csv.noname@tdfb.co,,,,',
].join('\r\n');

async function uploadAndMap(page: Page): Promise<void> {
  await page.getByLabel('ไฟล์ CSV รายชื่อพนักงาน').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(`﻿${CSV}\r\n`, 'utf8') });
  // The columns come from the file's own header (the real Workspace export has not been seen yet).
  await page.getByLabel('คอลัมน์อีเมล').selectOption({ label: 'Primary Email' });
  await page.getByLabel('คอลัมน์ชื่อที่แสดง').selectOption({ label: 'First Name [Required]' });
  await page.getByLabel('คอลัมน์ทีม (ไม่บังคับ)').selectOption({ label: 'Department' });
  await page.getByLabel('คอลัมน์ Slack ID (ไม่บังคับ)').selectOption({ label: 'Slack ID' });
  await page.getByRole('button', { name: 'ตรวจรายการก่อนบันทึก' }).click();
}

test.describe('รายชื่อพนักงาน (§13.3)', () => {
  test('the list: role, account, Slack mapped or not, signed in or not; search; mobile cards / desktop table', async ({ page }) => {
    await openUsers(page);
    const requester = personRow(page, 'a09.requester@tdfb.co');
    await expect(requester).toContainText('คุณผู้ขอ ทดสอบ');
    await expect(requester).toContainText('ฝ่ายผลิต');
    await expect(requester).toContainText('พนักงาน');
    await expect(requester).toContainText('Slack จับคู่แล้ว');
    await expect(requester).toContainText('เข้าสู่ระบบแล้ว');
    await expect(personRow(page, 'a09.viewer@tdfb.co')).toContainText('ผู้ดูภาพรวม');
    await expect(personRow(page, 'a09.viewer@tdfb.co')).toContainText('ยังไม่จับคู่ Slack (ส่งทางอีเมล)');
    await expect(personRow(page, 'a09.admin@tdfb.co')).toContainText('GM Admin');
    await expect(personRow(page, 'a09.disabled@tdfb.co')).toContainText('ปิดบัญชีแล้ว');
    await expect(personRow(page, 'a10.first@tdfb.co')).toContainText('ยังไม่เคยเข้าสู่ระบบ');
    if (isMobileWidth(page)) await expect(page.getByRole('table')).toHaveCount(0);
    else await expect(page.getByRole('table', { name: 'รายชื่อพนักงาน' })).toBeVisible();
    await expectLayout(page);
    await page.getByLabel('ค้นชื่อหรืออีเมล').fill('ผู้ดู');
    await expect(personRow(page, 'a09.viewer@tdfb.co')).toBeVisible();
    await expect(personRow(page, 'a09.requester@tdfb.co')).toHaveCount(0);
  });

  test('change a role (confirming the person and the new role), then switch the account off and on', async ({ page }, testInfo) => {
    const person = ownPerson(testInfo);
    await openUsers(page);
    await page.getByLabel('ค้นชื่อหรืออีเมล').fill(person.email);
    const row = personRow(page, person.email);
    await row.getByRole('button', { name: 'เปลี่ยนสิทธิ์' }).click();
    await row.getByLabel('สิทธิ์ใหม่').selectOption({ label: 'ผู้ดูภาพรวม' });
    await row.getByRole('button', { name: 'บันทึกสิทธิ์' }).click();
    const confirm = page.getByRole('alertdialog', { name: 'เปลี่ยนสิทธิ์?' });
    await expect(confirm).toContainText(person.name);
    await expect(confirm).toContainText(person.email);
    await expect(confirm).toContainText('ผู้ดูภาพรวม');
    await expectLayout(page);
    await confirm.getByRole('button', { name: 'เปลี่ยนสิทธิ์' }).click();
    await expect(row).toContainText('ผู้ดูภาพรวม');

    await row.getByRole('button', { name: 'ปิดบัญชี', exact: true }).click();
    const off = page.getByRole('alertdialog', { name: 'ปิดบัญชีนี้?' });
    await expect(off).toContainText(person.name);
    await off.getByRole('button', { name: 'ปิดบัญชี' }).click();
    await expect(row).toContainText('ปิดบัญชีแล้ว');
    await row.getByRole('button', { name: 'เปิดบัญชี', exact: true }).click();
    await page.getByRole('alertdialog', { name: 'เปิดบัญชีนี้?' }).getByRole('button', { name: 'เปิดบัญชี' }).click();
    await expect(row.getByRole('button', { name: 'ปิดบัญชี', exact: true })).toBeVisible();
    await expectLayout(page);
  });

  test('the last GM Admin cannot be demoted — the page says why and nothing changes', async ({ page }) => {
    await openUsers(page);
    const row = personRow(page, 'a09.admin@tdfb.co');
    await row.getByRole('button', { name: 'เปลี่ยนสิทธิ์' }).click();
    await row.getByLabel('สิทธิ์ใหม่').selectOption({ label: 'ทีม GM' });
    await row.getByRole('button', { name: 'บันทึกสิทธิ์' }).click();
    await page.getByRole('alertdialog', { name: 'เปลี่ยนสิทธิ์?' }).getByRole('button', { name: 'เปลี่ยนสิทธิ์' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'ต้องมี GM Admin ที่ใช้งานอยู่อย่างน้อย 1 คน' })).toBeVisible();
    await expect(row).toContainText('GM Admin');
  });
});

test.describe('นำเข้า CSV (P7-ADMIN-01, FU-10)', () => {
  test('columns chosen from the header, a preview with every bad row before saving; unmapped columns never sent', async ({ page }) => {
    const sent: string[] = [];
    page.on('request', (request) => {
      const body = request.postData();
      if (body !== null) sent.push(body);
    });
    await openUsers(page);
    await page.getByRole('link', { name: 'นำเข้ารายชื่อจาก CSV' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'นำเข้ารายชื่อจาก CSV' })).toBeVisible();
    await expectLayout(page);
    await uploadAndMap(page);
    const result = page.getByTestId('import-preview');
    await expect(result).toContainText('ใหม่ 2');
    await expect(result).toContainText('ผิด 4');
    const errors = page.getByTestId('import-errors');
    await expect(errors).toContainText('แถว 4');
    await expect(errors).toContainText('ไม่ใช่อีเมล @tdfb.co');
    await expect(errors).toContainText('อีเมลซ้ำในไฟล์');
    await expect(errors).toContainText('ไม่มีชื่อ');
    await expect(result).toContainText('a10.csv.two@tdfb.co');
    await expect(page.getByRole('button', { name: 'บันทึก 2 รายการ' })).toBeVisible();
    await expectLayout(page);
    expect(sent.join('\n')).not.toContain(UNMAPPED);
    expect(sent.join('\n')).not.toContain('Mobile');
  });

  test('save: the new people are listed as ordinary users; who is missing from the file is marked, not switched off', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== SHARED_PROJECT, 'changes the shared people list: one project');
    await openUsers(page);
    await page.getByRole('link', { name: 'นำเข้ารายชื่อจาก CSV' }).click();
    await uploadAndMap(page);
    await page.getByRole('button', { name: 'บันทึก 2 รายการ' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'นำเข้าแล้ว' })).toContainText('เพิ่ม 2 คน');
    await page.getByRole('link', { name: 'กลับไปรายชื่อ' }).click();
    await expect(personRow(page, 'a10.csv.one@tdfb.co')).toContainText('พนักงาน');
    await expect(personRow(page, 'a10.csv.one@tdfb.co')).toContainText('ฝ่ายขาย');
    const missing = personRow(page, 'a09.viewer@tdfb.co');
    await expect(missing).toContainText('ไม่อยู่ในไฟล์ล่าสุด');
    await expect(missing.getByRole('button', { name: 'ปิดบัญชี', exact: true })).toBeVisible();
  });
});

test.describe('login ครั้งแรกและคนที่ไม่อยู่ในรายชื่อ (D-A09-1)', () => {
  test('a person on the list signs in for the first time and goes straight in', async ({ page }) => {
    await signInToShell(page, 'first');
    await expect(page.getByRole('heading', { level: 1, name: 'วันนี้ให้ GM ช่วยเรื่องอะไร?' })).toBeVisible();
  });

  test('someone not on the list sees “not opened yet”; the GM Admin sees their e-mail with “เพิ่มเข้ารายชื่อ”', async ({ page, browser }) => {
    await signIn(page, 'new');
    await expect(page.getByRole('heading', { level: 1, name: 'บัญชีนี้ยังไม่ได้เปิดใช้งาน' })).toBeVisible();
    const adminContext = await browser.newContext();
    await keepLocal(adminContext);
    const adminPage = await adminContext.newPage();
    await openUsers(adminPage);
    const unlisted = adminPage.getByTestId('unlisted-logins');
    await expect(unlisted).toContainText(account('new').email);
    await expect(unlisted.getByRole('button', { name: 'เพิ่มเข้ารายชื่อ' }).first()).toBeVisible();
    await expectLayout(adminPage);
    await adminContext.close();
  });

  test('“เพิ่มเข้ารายชื่อ”: the person waiting on the “not opened” page gets in without signing in again', async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== SHARED_PROJECT, 'adds to the shared people list: one project');
    await signIn(page, 'joiner');
    await expect(page.getByRole('heading', { level: 1, name: 'บัญชีนี้ยังไม่ได้เปิดใช้งาน' })).toBeVisible();
    const adminContext = await browser.newContext();
    await keepLocal(adminContext);
    const adminPage = await adminContext.newPage();
    await openUsers(adminPage);
    const entry = adminPage.getByTestId('unlisted-logins').getByRole('listitem').filter({ hasText: account('joiner').email });
    await entry.getByRole('button', { name: 'เพิ่มเข้ารายชื่อ' }).click();
    await entry.getByLabel('ชื่อที่แสดง').fill('คุณขอเข้าใช้ ทดสอบ');
    await entry.getByRole('button', { name: 'เพิ่ม', exact: true }).click();
    await expect(personRow(adminPage, account('joiner').email)).toBeVisible();
    await adminContext.close();
    await expect(page.getByTestId('app-shell')).toBeVisible();
  });
});
