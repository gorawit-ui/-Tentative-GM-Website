// A09 — shared steps for the web app specs: sign in with Google through the Auth emulator's own
// sign-in window (the fixture accounts are listed there), keep the browser on this machine, and the
// layout measures every page is checked with.
import { fileURLToPath } from 'node:url';
import { expect, type BrowserContext, type Locator, type Page } from '@playwright/test';
import { fixtureAuthUsers, type FixtureAuthUser } from './emulator';

export type AccountKey = 'requester' | 'viewer' | 'gm' | 'admin' | 'disabled' | 'offboard' | 'logout' | 'new' | 'outsider' | 'lookalike';

export function account(key: AccountKey): FixtureAuthUser {
  const found = fixtureAuthUsers().find((user) => user.uid === `uid-a09-${key}`);
  if (found === undefined) throw new Error(`no fixture account ${key}`);
  return found;
}

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

const GAPI_SHIM = fileURLToPath(new URL('./gapi-shim.js', import.meta.url));

/**
 * Only this machine: the built app, the local API and the emulators. Anything else (e.g. the emulator
 * sign-in window's web fonts) is refused and remembered, so a test can say the app itself reached no
 * other host. Google's gapi loader, which Firebase Auth's popup flow loads even with the emulator, is
 * answered by the local stand-in (support/gapi-shim.js) — apis.google.com is out of reach here.
 */
export async function keepLocal(context: BrowserContext): Promise<{ readonly blocked: string[]; readonly gapi: string[] }> {
  const blocked: string[] = [];
  const gapi: string[] = [];
  await context.route(
    (url) => !LOCAL_HOSTS.has(url.hostname) && url.protocol !== 'data:' && url.protocol !== 'blob:',
    async (route) => {
      blocked.push(`${new URL(route.request().url()).host} (${route.request().frame().url().includes('/emulator/auth/') ? 'emulator window' : 'app'})`);
      await route.abort('blockedbyclient');
    },
  );
  // Registered last, so it is asked first.
  await context.route(
    (url) => url.origin === 'https://apis.google.com' && url.pathname === '/js/api.js',
    async (route) => {
      gapi.push(new URL(route.request().frame().url()).origin);
      await route.fulfill({ path: GAPI_SHIM, contentType: 'text/javascript; charset=utf-8' });
    },
  );
  return { blocked, gapi };
}

/** Console errors and uncaught exceptions of the app page. */
export function watchErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

export const GOOGLE_BUTTON = 'เข้าสู่ระบบด้วย Google';

/** Opens the Google sign-in window from the login page and picks the account there. */
export async function chooseGoogleAccount(page: Page, who: FixtureAuthUser): Promise<void> {
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: GOOGLE_BUTTON }).click();
  const popup = await popupPromise;
  await popup.waitForLoadState('domcontentloaded');
  await popup.locator('li.js-reuse-account', { hasText: who.email }).click();
  await popup.waitForEvent('close');
}

/** Signs in from /login (or the page the app sent us to) and waits until the app has decided. */
export async function signIn(page: Page, key: AccountKey, path = '/login'): Promise<FixtureAuthUser> {
  const who = account(key);
  await page.goto(path);
  await chooseGoogleAccount(page, who);
  return who;
}

/** Signed in as an active account: the shell is there. */
export async function signInToShell(page: Page, key: AccountKey, path?: string): Promise<FixtureAuthUser> {
  const who = await signIn(page, key, path);
  await expect(page.getByTestId('app-shell')).toBeVisible();
  return who;
}

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** Visible buttons, links and form controls shorter than 44px (Part 3 §0.1 touch target). */
export async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const small: string[] = [];
    for (const element of document.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])')) {
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      // The skip link is placed off-screen until it has keyboard focus.
      if (box.bottom <= 0) continue;
      if (box.height < 44 - 0.5) small.push(`${element.tagName.toLowerCase()} "${(element.textContent ?? '').trim().slice(0, 40)}" ${box.height.toFixed(1)}px`);
    }
    return small;
  });
}

export function isMobileWidth(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) < 1024;
}

export async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const found = await locator.boundingBox();
  if (found === null) throw new Error('element has no box');
  return found;
}

/** Records in the Firebase Auth IndexedDB store (the signed-in user, if any). */
export async function storedAuthUsers(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('firebaseLocalStorageDb');
        open.onupgradeneeded = () => open.transaction?.abort();
        open.onerror = () => resolve(0);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('firebaseLocalStorage')) {
            db.close();
            resolve(0);
            return;
          }
          const request = db.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage').getAll();
          request.onsuccess = () => {
            const users = (request.result as { fbase_key?: string }[]).filter((row) => row.fbase_key?.startsWith('firebase:authUser:'));
            db.close();
            resolve(users.length);
          };
          request.onerror = () => {
            db.close();
            resolve(0);
          };
        };
      }),
  );
}
