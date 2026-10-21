import { expect, test } from '@playwright/test';
import { keepLocal, watchErrors } from '../support/app';

// S00 skeleton, A09: the built app loads at every TEST-CHECKLIST §4 viewport; without a session every
// address leads to the Thai login page (UI-01) — nothing of the app is shown before signing in.
test('without a session the app opens the Thai login page, without horizontal page scroll or console errors', async ({ context, page }) => {
  await keepLocal(context);
  const problems = watchErrors(page);

  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByRole('heading', { level: 1, name: 'GM One Stop Service' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' })).toBeVisible();
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
  expect(problems).toEqual([]);
});
