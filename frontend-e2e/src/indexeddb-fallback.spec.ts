import { test, expect } from '../fixtures/expense.fixture';

const user = {
  email: `indexeddb-fallback-${Date.now()}@example.com`,
  password: 'Password123!',
  displayName: 'Fallback User',
};

test.describe('IndexedDB Fallback Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'indexedDB', {
        value: {
          open: () => {
            const req = {} as any;
            setTimeout(() => {
              if (req.onerror) {
                req.error = new Error('IndexedDB blocked by E2E Mock');
                req.onerror(new Event('error'));
              }
            }, 10);
            return req;
          },
        },
        configurable: true,
        writable: true,
      });
    });
  });

  test('logs in with a storage warning, creates encrypted data, and requires re-login after refresh', async ({ page, auth, expenses }) => {
    const warnings: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'warning') warnings.push(msg.text());
    });

    await auth.register(page, user);
    await auth.login(page, user);

    await expect(page.getByText('Secure key persistence is unavailable')).toBeVisible({ timeout: 10000 });
    expect(warnings.some(warning => warning.includes('IndexedDB persistence unavailable'))).toBe(true);

    const expense = await expenses.create(page, { title: 'Fallback Expense', amount: '12.99' });
    await expense.expectVisible();

    await page.reload();
    await page.waitForURL(/\/auth\/login/, { timeout: 30000 });
  });
});
