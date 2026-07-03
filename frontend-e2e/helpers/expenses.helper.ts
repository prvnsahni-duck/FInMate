/* eslint-disable playwright/no-standalone-expect */
import { Page, expect } from '@playwright/test';
import DashboardPage from '../pages/DashboardPage';
import ExpenseCard from '../pages/ExpenseCard';
import ExpenseDialog from '../pages/ExpenseDialog';
import { waitForPageApi } from '../utils/api';
import { testIds } from '../utils/locators';

export const expenses = {
  async create(page: Page, { title, amount }: { title: string; amount: string }) {
    const dashboard = new DashboardPage(page);
    await dashboard.openExpenseDialog();
    const dialog = new ExpenseDialog(page);
    await dialog.fill({ title, amount });

    const { body } = await waitForPageApi<any>(page, {
      method: 'POST',
      url: /\/expenses/,
      status: [200, 201],
      failureMessage: `Expense creation failed for ${title}`,
      action: () => dialog.save(),
    });

    const id = typeof body === 'object' && body ? body.id ?? body.data?.id ?? body.expense?.id ?? null : null;
    const expense = new ExpenseCard(page, id, title);
    await expense.expectVisible();
    return expense;
  },

  async expectVisible(page: Page, title: string) {
    await expect(page.getByTestId(testIds.expense.card).filter({ hasText: title })).toBeVisible({ timeout: 15000 });
  },
};

export default expenses;

