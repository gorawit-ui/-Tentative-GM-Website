// A09 — layout, touch targets, motion, fonts, tokens and dates on every page this task builds, at the
// four TEST-CHECKLIST §4 sizes (Part 3 §0.1, Part 4 + Patch P1/P2, Part 5 Patch F6, FU-36).
import { expect, test, type Page } from '@playwright/test';
import { formatThaiDateTime } from '../../../packages/time/src/index';
import { isMobileWidth, keepLocal, horizontalOverflow, signIn, signInToShell, smallTargets, watchErrors, type AccountKey } from '../support/app';

let problems: string[] = [];

test.beforeEach(async ({ context, page }) => {
  await keepLocal(context);
  problems = watchErrors(page);
});

test.afterEach(() => {
  expect(problems).toEqual([]);
});

interface PageCase {
  readonly name: string;
  readonly as?: AccountKey;
  readonly path: string;
  readonly heading: string;
}

/** Every page of A09; signed-in pages are visited after one sign-in per account. */
const PAGES: readonly PageCase[] = [
  { name: 'login', path: '/login', heading: 'GM One Stop Service' },
  { name: 'home', as: 'requester', path: '/', heading: 'วันนี้ให้ GM ช่วยเรื่องอะไร?' },
  { name: 'my requests', as: 'requester', path: '/my-requests', heading: 'คำขอของฉัน' },
  { name: 'repair form', as: 'requester', path: '/requests/new?type=maintenance&origin=requester', heading: 'แจ้งซ่อม' },
  { name: 'request detail', as: 'requester', path: '/requests/req-a09-0001', heading: 'รายละเอียดงาน' },
  { name: 'board', as: 'requester', path: '/board', heading: 'บอร์ดทีม GM' },
  { name: 'team', as: 'requester', path: '/team', heading: 'ติดต่อทีม GM' },
  { name: 'no permission', as: 'requester', path: '/admin/users', heading: 'ไม่มีสิทธิ์เข้าหน้านี้' },
  { name: 'not found', as: 'requester', path: '/no-such-page', heading: 'ไม่พบหน้านี้' },
  { name: 'GM home', as: 'admin', path: '/', heading: 'วันนี้ทีม GM กำลังทำอะไร' },
  { name: 'GM create', as: 'admin', path: '/requests/new?type=gm_task&origin=gm_initiated', heading: 'สร้างงาน GM / เปิดแทน' },
  { name: 'on behalf', as: 'admin', path: '/requests/new?type=maintenance&origin=gm_on_behalf', heading: 'เปิดแทนผู้ขอ' },
  { name: 'admin locations', as: 'admin', path: '/admin/locations', heading: 'สถานที่และบริเวณ' },
  { name: 'admin qr', as: 'admin', path: '/admin/qr', heading: 'QR ของบริเวณ' },
  { name: 'admin users', as: 'admin', path: '/admin/users', heading: 'รายชื่อพนักงานและสิทธิ์' },
  { name: 'admin calendars', as: 'admin', path: '/admin/calendars', heading: 'ปฏิทินบริษัท' },
  { name: 'admin content', as: 'admin', path: '/admin/content', heading: 'เนื้อหาติดต่อทีม GM / FAQ' },
  { name: 'disabled', as: 'disabled', path: '/', heading: 'บัญชีถูกปิด' },
  { name: 'not set up', as: 'new', path: '/', heading: 'บัญชีนี้ยังไม่ได้เปิดใช้งาน' },
];

async function visit(page: Page, item: PageCase): Promise<void> {
  await page.goto(item.path);
  await expect(page.getByRole('heading', { level: 1, name: item.heading })).toBeVisible();
  // Measure the page as people use it: the contact box (login and account pages) has its list.
  await expect(page.getByText('กำลังโหลดช่องทางติดต่อ…')).toHaveCount(0);
  if ((await page.getByRole('region', { name: 'ไม่มีบัญชีบริษัท? แจ้งทีม GM' }).count()) > 0) {
    await expect(page.getByRole('link', { name: /02-000-0000/ })).toBeVisible();
  }
}

async function bottomNavBox(page: Page) {
  const nav = page.getByRole('navigation', { name: 'เมนูหลักบนมือถือ' });
  return (await nav.isVisible()) ? nav.boundingBox() : null;
}

for (const account of [undefined, 'requester', 'admin', 'disabled', 'new'] as const) {
  const cases = PAGES.filter((item) => item.as === account);
  test(`${account ?? 'signed out'}: no horizontal scroll, touch targets ≥ 44px, the bottom nav never covers content`, async ({ page }) => {
    if (account !== undefined) {
      await signIn(page, account);
      // Settled: the account's own page is up (its access/{uid} listener has answered) before we move on.
      await expect(page.getByRole('heading', { level: 1 })).not.toHaveText('GM One Stop Service');
    }
    for (const item of cases) {
      await visit(page, item);
      expect(await horizontalOverflow(page), `${item.name}: horizontal scroll`).toBeLessThanOrEqual(0);
      expect(await smallTargets(page), `${item.name}: targets under 44px`).toEqual([]);
      const nav = await bottomNavBox(page);
      if (!isMobileWidth(page)) {
        expect(nav, `${item.name}: no bottom nav on desktop`).toBeNull();
        continue;
      }
      if (nav === null) continue;
      // P2: 64px when the screen is at most 700px tall, else 80px (no safe area in the emulator).
      expect(nav.height, `${item.name}: bottom nav height`).toBe((page.viewportSize()?.height ?? 0) <= 700 ? 64 : 80);
      // Long content still ends above the nav once scrolled to the end.
      const covered = await page.evaluate(() => {
        const main = document.querySelector('main');
        if (main === null) return 'no main';
        const filler = document.createElement('div');
        filler.style.height = '1600px';
        const last = document.createElement('p');
        last.textContent = 'ท้ายเนื้อหา';
        main.append(filler, last);
        window.scrollTo(0, document.documentElement.scrollHeight);
        const navTop = document.querySelector('nav[aria-label="เมนูหลักบนมือถือ"]')?.getBoundingClientRect().top ?? 0;
        const bottom = last.getBoundingClientRect().bottom;
        filler.remove();
        last.remove();
        window.scrollTo(0, 0);
        return bottom <= navTop ? 'ok' : `last line ends at ${bottom}, nav starts at ${navTop}`;
      });
      expect(covered, `${item.name}: content under the bottom nav`).toBe('ok');
    }
  });
}

test('reduced motion: nothing animates or transitions (CSS); without it the page still has its entry motion', async ({ page }) => {
  await signInToShell(page, 'admin');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/board');
  // The check below must be able to see motion: the page container enters with an animation.
  expect(await page.getByTestId('page').evaluate((element) => getComputedStyle(element).animationName)).not.toBe('none');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const [path, heading] of [
    ['/board', 'บอร์ดทีม GM'],
    ['/team', 'ติดต่อทีม GM'],
    ['/admin/users', 'รายชื่อพนักงานและสิทธิ์'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length), `${path}: running animations`).toBe(0);
    const moving = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('body *')]
        .map((element) => ({ element, style: getComputedStyle(element) }))
        .filter(({ style }) => style.animationName !== 'none' || style.transitionDuration.split(',').some((value) => parseFloat(value) > 0))
        .map(({ element }) => element.tagName.toLowerCase() + (element.className ? `.${String(element.className).split(' ')[0]}` : '')),
    );
    expect(moving, `${path}: elements with motion`).toEqual([]);
  }
  if (isMobileWidth(page)) {
    await page.getByRole('button', { name: 'เมนูเพิ่มเติม' }).click();
    await expect(page.getByRole('dialog', { name: 'เมนูเพิ่มเติม' })).toBeVisible();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  }
});

test('Part 4: IBM Plex Sans Thai Looped (self-hosted) and the token colours, sizes and focus ring', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => document.fonts.ready);
  const font = await page.evaluate(() => ({
    family: getComputedStyle(document.body).fontFamily,
    size: getComputedStyle(document.body).fontSize,
    loaded: [...document.fonts].some((face) => face.family.replaceAll('"', '') === 'IBM Plex Sans Thai Looped' && face.status === 'loaded'),
    thai: document.fonts.check('16px "IBM Plex Sans Thai Looped"', 'เข้าสู่ระบบ'),
  }));
  expect(font.family.startsWith('"IBM Plex Sans Thai Looped"')).toBe(true);
  expect(font.size).toBe('16px');
  expect(font.loaded).toBe(true);
  expect(font.thai).toBe(true);
  const button = page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' });
  const look = await button.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      canvas: getComputedStyle(document.body).backgroundColor,
      text: getComputedStyle(document.body).color,
      fill: style.backgroundColor,
      on: style.color,
      radius: style.borderRadius,
      // Rounded: layout can land a hair under the CSS pixel (47.99999).
      height: Math.round(element.getBoundingClientRect().height),
    };
  });
  expect(look).toEqual({ canvas: 'rgb(250, 248, 243)', text: 'rgb(45, 42, 38)', fill: 'rgb(87, 121, 55)', on: 'rgb(255, 255, 255)', radius: '12px', height: 48 });
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor, offset: style.outlineOffset };
  });
  expect(focused).toEqual({ style: 'solid', width: '3px', color: 'rgb(49, 95, 132)', offset: '2px' });
});

test('P1: every style rule of the app is in a cascade layer (theme, base, components, utilities); tokens in components', async ({ page }) => {
  await page.goto('/login');
  const sheets = await page.evaluate(() => {
    const unlayered: string[] = [];
    const layersOf = new Map<string, string[]>();
    // Top-level layer names in the order the cascade first meets them.
    const order: string[] = [];
    const meet = (name: string) => {
      if (!order.includes(name)) order.push(name);
    };
    const walk = (rules: CSSRuleList, layer: string | undefined) => {
      for (const rule of rules) {
        if (rule instanceof CSSLayerStatementRule) {
          if (layer === undefined) rule.nameList.forEach(meet);
        } else if (rule instanceof CSSLayerBlockRule) {
          if (layer === undefined) meet(rule.name);
          walk(rule.cssRules, layer === undefined ? rule.name : `${layer}.${rule.name}`);
        } else if (rule instanceof CSSStyleRule || rule instanceof CSSKeyframesRule || rule instanceof CSSFontFaceRule) {
          const text = rule instanceof CSSStyleRule ? rule.selectorText : rule instanceof CSSKeyframesRule ? `@keyframes ${rule.name}` : '@font-face';
          if (layer === undefined) unlayered.push(text);
          else layersOf.set(text, [...(layersOf.get(text) ?? []), layer]);
          if (rule instanceof CSSStyleRule && rule.cssRules.length > 0) walk(rule.cssRules, layer);
        } else if ('cssRules' in rule) {
          walk((rule as CSSGroupingRule).cssRules, layer);
        }
      }
    };
    for (const sheet of document.styleSheets) walk(sheet.cssRules, undefined);
    return { unlayered, order, gmBtn: layersOf.get('.gm-btn') ?? [], fontFace: layersOf.get('@font-face') ?? [], root: layersOf.get(':root') ?? [] };
  });
  expect(sheets.unlayered).toEqual([]);
  expect(sheets.order.filter((name) => ['theme', 'base', 'components', 'utilities'].includes(name))).toEqual(['theme', 'base', 'components', 'utilities']);
  expect(sheets.gmBtn).toEqual(['components']);
  expect(sheets.fontFace.length).toBeGreaterThan(0);
  expect(new Set(sheets.fontFace)).toEqual(new Set(['base']));
});

test('P1 utility overrides on real elements: link brand fg, button caption + semibold, primary button px 8', async ({ page }) => {
  await page.goto('/login');
  const phone = page.getByRole('region', { name: 'ไม่มีบัญชีบริษัท? แจ้งทีม GM' }).getByRole('link', { name: /02-000-0000/ });
  // `a` in tokens is info-fg; the utility text-brand-fg wins.
  expect(await phone.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(73, 102, 44)');
  const login = page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' });
  // .gm-btn padding is space-2 space-4; px-8 (space-8 = 32px) wins.
  expect(await login.evaluate((element) => [getComputedStyle(element).paddingLeft, getComputedStyle(element).paddingRight])).toEqual(['32px', '32px']);
  await signInToShell(page, 'requester');
  const compact = page.getByTestId('compact-action').first();
  // .gm-btn is body size and medium; text-caption + font-semibold win.
  expect(await compact.evaluate((element) => [getComputedStyle(element).fontSize, getComputedStyle(element).fontWeight])).toEqual(['14px', '600']);
});

test('FU-36: the date and time on screen are formatThaiDateTime (พ.ศ., Asia/Bangkok) — the same function as the notifications', async ({ page }) => {
  // The real minute (sign-in tokens come from the emulator's clock), held still while the page renders.
  const now = Math.floor(Date.now() / 60_000) * 60_000;
  await page.clock.setFixedTime(now);
  await signInToShell(page, 'requester');
  await expect(page.getByTestId('today')).toHaveText(formatThaiDateTime(now));
  await expect(page.getByTestId('today')).toHaveText(/^\d{1,2} [ก-๙.]+ 25\d\d \d\d:\d\d น\.$/);
  await expect(page.getByTestId('today')).toHaveAttribute('datetime', new Date(now).toISOString());
});
