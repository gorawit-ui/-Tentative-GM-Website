import { expect, test } from '@playwright/test';

// S00 skeleton: the built web shell loads at every TEST-CHECKLIST §4 viewport. Real flows
// (QR repair, board, waiting, ...) get their own specs once UI work starts after S12.
test('app shell renders Thai copy without horizontal page scroll or console errors', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));

  await page.goto('/');

  await expect(page.locator('html')).toHaveAttribute('lang', 'th');
  await expect(page.getByRole('heading', { level: 1, name: 'GM One Stop Service' })).toBeVisible();
  await expect(page.getByText('ยังไม่มีฟีเจอร์ใช้งาน')).toBeVisible();
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(0);
  expect(problems).toEqual([]);
});
