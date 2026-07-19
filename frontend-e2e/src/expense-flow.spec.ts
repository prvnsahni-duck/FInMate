import { test, expect } from '../fixtures/expense.fixture';

const uniqueUser = (label: string) => ({
  email: `${label}-${Date.now()}@example.com`,
  password: 'Password123!',
  displayName: `${label} User`,
});

test.describe('Expense Flow', () => {
  test('registers, logs in, creates, edits and deletes an expense', async ({
    page,
    auth,
    expenses,
  }) => {
    const user = uniqueUser('expense-flow');

    await auth.register(page, user);
    await auth.login(page, user);

    const expense = await expenses.create(page, {
      title: 'Coffee Break',
      amount: '5.50',
    });
    await expense.expectAmount(/5[.,]50/);
    await expense.reload();

    const { expense: edited } = await expense.edit({
      title: 'Premium Coffee',
      amount: '8.75',
    });
    await edited.expectAmount(/8[.,]75/);

    await edited.delete();
    await expect(
      page.getByTestId('expense-card').filter({ hasText: 'Premium Coffee' }),
    ).toHaveCount(0);
  });
});
