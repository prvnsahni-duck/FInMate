/* eslint-disable playwright/no-standalone-expect */
import { Page, expect } from '@playwright/test';
import { testIds } from '../utils/locators';

export const assertions = {
  async expectExpenseVisible(
    page: Page,
    title: string,
    amount?: string | RegExp,
  ) {
    const card = page
      .getByTestId(testIds.expense.card)
      .filter({ hasText: title })
      .first();
    await expect(card).toBeVisible({ timeout: 15000 });
    if (amount)
      await expect(card.getByTestId(testIds.expense.amount)).toContainText(
        amount,
      );
  },

  async expectExpenseDeleted(page: Page, title: string) {
    await expect(
      page.getByTestId(testIds.expense.card).filter({ hasText: title }),
    ).toHaveCount(0, { timeout: 15000 });
  },

  async expectDashboardLoaded(page: Page) {
    await expect(
      page.getByRole('heading', { name: /welcome back/i }),
    ).toBeVisible({ timeout: 15000 });
  },
};

export default assertions;
