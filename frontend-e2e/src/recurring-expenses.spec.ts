import { test, expect } from '../fixtures/groups.fixture';

const user = {
  email: `recurring-${Date.now()}@example.com`,
  password: 'Password123!',
  displayName: 'Scheduler User',
};

test.describe('Recurring Expenses Scheduler', () => {
  test('creates a recurring template, triggers the scheduler, and renders the generated expense', async ({
    page,
    auth,
    groups,
    recurring,
  }) => {
    await auth.register(page, user);
    await auth.login(page, user);

    const group = await groups.create(page, {
      name: 'Shared Apartment',
      description: 'Recurring rent ledger',
    });
    await group.open();

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    await recurring.create(page, {
      title: 'Monthly Rent',
      description: 'Apartment Rent Payment',
      amount: '1200.00',
      startDate: yesterday.toISOString().split('T')[0],
    });

    const token = await page.evaluate(() =>
      localStorage.getItem('finmate_token'),
    );
    expect(token).toBeTruthy();

    const response = await page.request.post(
      '/api/v1/recurring-expenses/trigger',
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    expect(response.status(), await response.text()).toBe(200);

    await page.getByTestId('group-tab-ledger').click();
    const card = page
      .getByTestId('expense-card')
      .filter({ hasText: 'Monthly Rent' })
      .first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card.getByTestId('expense-amount')).toContainText(
      /1,?200[.,]00/,
    );
  });
});
