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

/** The file of the import tests; `who` keeps each project's rows its own (only the save step keeps them). */
const csvFor = (who: string) =>
  [
    'Primary Email,First Name [Required],Department,Slack ID,Mobile',
    `a10.${who}.one@tdfb.co,คุณนำเข้า หนึ่ง,ฝ่ายขาย,U0CSV0001,${UNMAPPED}`,
    `A10.${who.toUpperCase()}.Two@TDFB.CO,คุณนำเข้า สอง,,,${UNMAPPED}`,
    'outsider@gmail.com,คนนอกบริษัท,,,',
    'a10.csv.dup@tdfb.co,ซ้ำ หนึ่ง,,,',
    'A10.CSV.DUP@tdfb.co,ซ้ำ สอง,,,',
    'a10.csv.noname@tdfb.co,,,,',
  ].join('\r\n');

/** Windows-874 / TIS-620 bytes (Excel “CSV” saved in Thai Windows): ASCII as is, Thai U+0E01–U+0E5B at 0xA1–0xFB. */
function windows874(text: string): Buffer {
  return Buffer.from([...text].map((char) => {
    const code = char.codePointAt(0) ?? 0;
    return code < 0x80 ? code : code - 0x0e00 + 0xa0;
  }));
}

/** D-A10-3: the page names the encoding it guessed and shows the first rows; the Admin confirms they read as Thai. */
async function confirmReadable(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'อ่านออกถูกต้อง ไปเลือกคอลัมน์' }).click();
}

async function uploadAndMap(page: Page, who: string): Promise<void> {
  await page.getByLabel('ไฟล์ CSV รายชื่อพนักงาน').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.from(`﻿${csvFor(who)}\r\n`, 'utf8') });
  await confirmReadable(page);
  // The columns come from the file's own header (the real Workspace export has not been seen yet).
  await page.getByLabel('คอลัมน์อีเมล').selectOption({ label: 'Primary Email' });
  await page.getByLabel('คอลัมน์ชื่อที่แสดง').selectOption({ label: 'First Name [Required]' });
  await page.getByLabel('คอลัมน์ทีม (ไม่บังคับ)').selectOption({ label: 'Department' });
  await page.getByLabel('คอลัมน์ Slack ID (ไม่บังคับ)').selectOption({ label: 'Slack ID' });
  await page.getByRole('button', { name: 'ตรวจรายการก่อนบันทึก' }).click();
}

test.describe('รายชื่อพนักงาน (§13.3)', () => {
  test('the list: role, account, Slack mapped or not, signed in or not; search; mobile cards / desktop table', async ({ page }, testInfo) => {
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
    // Never signed in: this project's own person (a10.first signs in during another test).
    await expect(personRow(page, ownPerson(testInfo).email)).toContainText('ยังไม่เคยเข้าสู่ระบบ');
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
    // The browser logs the refused request itself; that 409 is the answer this step expects.
    problems = problems.filter((line) => !line.includes('status of 409'));
  });
});

test.describe('นำเข้า CSV (P7-ADMIN-01, FU-10)', () => {
  test('columns chosen from the header, a preview with every bad row before saving; unmapped columns never sent', async ({ page }, testInfo) => {
    // Rows nobody saves: the save step of the shared project cannot turn them into “เหมือนเดิม”.
    const who = `prev-${testInfo.project.name}`;
    const sent: string[] = [];
    page.on('request', (request) => {
      const body = request.postData();
      if (body !== null) sent.push(body);
    });
    await openUsers(page);
    await page.getByRole('link', { name: 'นำเข้ารายชื่อจาก CSV' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'นำเข้ารายชื่อจาก CSV' })).toBeVisible();
    await expectLayout(page);
    await uploadAndMap(page, who);
    const result = page.getByTestId('import-preview');
    await expect(result).toContainText('ใหม่ 2');
    await expect(result).toContainText('ผิด 4');
    const errors = page.getByTestId('import-errors');
    await expect(errors).toContainText('แถว 4');
    await expect(errors).toContainText('ไม่ใช่อีเมล @tdfb.co');
    await expect(errors).toContainText('อีเมลซ้ำในไฟล์');
    await expect(errors).toContainText('ไม่มีชื่อ');
    await expect(result).toContainText(`a10.${who}.two@tdfb.co`);
    await expect(page.getByRole('button', { name: 'บันทึก 2 รายการ' })).toBeVisible();
    await expectLayout(page);
    expect(sent.join('\n')).not.toContain(UNMAPPED);
    expect(sent.join('\n')).not.toContain('Mobile');
  });

  test('save: the new people are listed as ordinary users; who is missing from the file is marked, not switched off', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== SHARED_PROJECT, 'changes the shared people list: one project');
    await openUsers(page);
    await page.getByRole('link', { name: 'นำเข้ารายชื่อจาก CSV' }).click();
    await uploadAndMap(page, 'csv');
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

test.describe('D-A10-3: ชนิดไฟล์ CSV ที่ Excel ภาษาไทยบันทึก', () => {
  test('a Windows-874 file: the encoding is guessed, the first 3 rows read as Thai, confirmed before choosing columns', async ({ page }, testInfo) => {
    const who = `enc-${testInfo.project.name}`;
    await openUsers(page);
    await page.getByRole('link', { name: 'นำเข้ารายชื่อจาก CSV' }).click();
    await page.getByLabel('ไฟล์ CSV รายชื่อพนักงาน').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: windows874(`${csvFor(who)}\r\n`) });
    const check = page.getByTestId('import-encoding');
    await expect(check).toContainText('Windows-874');
    await expect(check).toContainText('คุณนำเข้า หนึ่ง');
    await expect(check).toContainText('คุณนำเข้า สอง');
    await expect(check).toContainText('คนนอกบริษัท');
    // Only the first 3 data rows are shown.
    await expect(check).not.toContainText('ซ้ำ หนึ่ง');
    // Columns are chosen only after the Admin says the text reads right.
    await expect(page.getByLabel('คอลัมน์อีเมล')).toHaveCount(0);
    await expectLayout(page);
    await confirmReadable(page);
    await page.getByLabel('คอลัมน์อีเมล').selectOption({ label: 'Primary Email' });
    await page.getByLabel('คอลัมน์ชื่อที่แสดง').selectOption({ label: 'First Name [Required]' });
    await page.getByRole('button', { name: 'ตรวจรายการก่อนบันทึก' }).click();
    await expect(page.getByTestId('import-preview')).toContainText('ใหม่ 2');
  });

  test('a wrong guess can be overridden: the preview follows the encoding chosen', async ({ page }, testInfo) => {
    await openUsers(page);
    await page.getByRole('link', { name: 'นำเข้ารายชื่อจาก CSV' }).click();
    await page.getByLabel('ไฟล์ CSV รายชื่อพนักงาน').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: windows874(`${csvFor(`enc2-${testInfo.project.name}`)}\r\n`) });
    const check = page.getByTestId('import-encoding');
    await page.getByLabel('ชนิดไฟล์ (การเข้ารหัส)').selectOption('utf-8');
    await expect(check).not.toContainText('คุณนำเข้า หนึ่ง');
    await page.getByLabel('ชนิดไฟล์ (การเข้ารหัส)').selectOption('windows-874');
    await expect(check).toContainText('คุณนำเข้า หนึ่ง');
    await expectLayout(page);
  });

  test('a UTF-16 file (Excel “Unicode Text”) reads as Thai too', async ({ page }, testInfo) => {
    await openUsers(page);
    await page.getByRole('link', { name: 'นำเข้ารายชื่อจาก CSV' }).click();
    const text = `${csvFor(`u16-${testInfo.project.name}`)}\r\n`;
    await page.getByLabel('ไฟล์ CSV รายชื่อพนักงาน').setInputFiles({ name: 'people.csv', mimeType: 'text/csv', buffer: Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]) });
    await expect(page.getByTestId('import-encoding')).toContainText('UTF-16');
    await expect(page.getByTestId('import-encoding')).toContainText('คุณนำเข้า หนึ่ง');
  });
});

test.describe('D-A10-2 / D-A10-5 / D-A10-6: รายชื่อ', () => {
  test('switching off a GM who still holds open requests: the dialog says how many and what happens', async ({ page }) => {
    await openUsers(page);
    await page.getByLabel('ค้นชื่อหรืออีเมล').fill('a10.gm.busy@tdfb.co');
    const row = personRow(page, 'a10.gm.busy@tdfb.co');
    await row.getByRole('button', { name: 'ปิดบัญชี', exact: true }).click();
    const dialog = page.getByRole('alertdialog', { name: 'ปิดบัญชีนี้?' });
    await expect(dialog).toContainText('คุณจีเอ็ม งานค้าง');
    await expect(dialog).toContainText('มีงานที่รับผิดชอบค้างอยู่ 2 งาน');
    await expect(dialog).toContainText('กลับเป็น “ยังไม่มอบหมาย”');
    await expect(dialog.getByRole('button', { name: 'ปิดบัญชีและปล่อยงาน 2 งาน' })).toBeVisible();
    await expectLayout(page);
    // Nothing is confirmed here: the shared GM stays on for the other projects.
    await dialog.getByRole('button', { name: 'ยกเลิก' }).click();
    await expect(row.getByRole('button', { name: 'ปิดบัญชี', exact: true })).toBeVisible();
  });

  test('add a new employee by hand: the e-mail is checked like an import; then an ordinary user on the list', async ({ page }, testInfo) => {
    const email = `a10.hand-${testInfo.project.name}@tdfb.co`;
    await openUsers(page);
    await page.getByRole('button', { name: 'เพิ่มคนด้วยมือ' }).click();
    const form = page.getByTestId('add-person-form');
    await form.getByLabel('อีเมล').fill(`hand-${testInfo.project.name}@gmail.com`);
    await form.getByLabel('ชื่อที่แสดง').fill('คุณเพิ่มด้วยมือ');
    await form.getByRole('button', { name: 'บันทึกคนใหม่' }).click();
    await expect(form.getByRole('alert')).toContainText('ใช้อีเมล @tdfb.co');
    await expect(form.getByLabel('ชื่อที่แสดง')).toHaveValue('คุณเพิ่มด้วยมือ');
    await expectLayout(page);
    await form.getByLabel('อีเมล').fill(email.toUpperCase());
    await form.getByLabel('ทีม (ไม่บังคับ)').fill('ฝ่ายขาย');
    await form.getByRole('button', { name: 'บันทึกคนใหม่' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'เพิ่ม' })).toContainText(email);
    await page.getByLabel('ค้นชื่อหรืออีเมล').fill(email);
    await expect(personRow(page, email)).toContainText('คุณเพิ่มด้วยมือ');
    await expect(personRow(page, email)).toContainText('ฝ่ายขาย');
    await expect(personRow(page, email)).toContainText('พนักงาน');
  });

  test('edit a name and team by hand, told that the next CSV import writes over it', async ({ page }, testInfo) => {
    const email = `a10.e-${testInfo.project.name}@tdfb.co`;
    await openUsers(page);
    await page.getByLabel('ค้นชื่อหรืออีเมล').fill(email);
    const row = personRow(page, email);
    await row.getByRole('button', { name: 'แก้ชื่อ/ทีม' }).click();
    await expect(row).toContainText('การนำเข้า CSV ครั้งถัดไปจะเขียนทับค่าที่แก้ด้วยมือ');
    await row.getByLabel('ชื่อที่แสดง').fill(`คุณแก้แล้ว ${testInfo.project.name}`);
    await row.getByLabel('ทีม (ไม่บังคับ)').fill('ฝ่ายบัญชี');
    await expectLayout(page);
    await row.getByRole('button', { name: 'บันทึกชื่อและทีม' }).click();
    await expect(row).toContainText(`คุณแก้แล้ว ${testInfo.project.name}`);
    await expect(row).toContainText('ฝ่ายบัญชี');
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
