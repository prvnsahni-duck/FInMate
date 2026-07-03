import { test, expect } from '../fixtures/diagnostics.fixture';

test('loads the FinMate shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/FinMate/i);
});
