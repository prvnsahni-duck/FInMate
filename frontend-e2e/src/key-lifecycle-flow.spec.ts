import { test, expect } from '../fixtures/expense.fixture';

const user = {
  email: `key-lifecycle-${Date.now()}@example.com`,
  password: 'Password123!',
  displayName: 'Lifecycle User',
};

test.describe('Key Lifecycle Flow', () => {
  test('clears keys on logout and re-authenticates correctly', async ({
    page,
    auth,
    expenses,
  }) => {
    await auth.register(page, user);
    await auth.login(page, user);

    const expense = await expenses.create(page, {
      title: 'Lifecycle Expense',
      amount: '45.00',
    });
    await expense.expectVisible();

    await auth.logout(page);
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('finmate_token')))
      .toBeNull();

    await page.goto('/dashboard');
    await page.waitForURL(/\/auth\/login/, { timeout: 30000 });

    await auth.login(page, user);
    await page.reload();
    await expense.expectVisible();

    await auth.logout(page);
    await page.goto('/dashboard');
    await page.waitForURL(/\/auth\/login/, { timeout: 30000 });
  });
});
