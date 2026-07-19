import { Page, expect } from '@playwright/test';
import { testIds } from '../utils/locators';

export default class DashboardPage {
  constructor(private readonly page: Page) {}

  async expectLoaded() {
    await expect(
      this.page.getByRole('heading', { name: /welcome back/i }),
    ).toBeVisible({ timeout: 15000 });
  }

  async openExpenseDialog() {
    await this.page
      .getByTestId('dashboard-log-expense-button')
      .or(this.page.getByTestId(testIds.groups.addExpense))
      .click();
    await expect(this.page.getByTestId(testIds.expense.dialog)).toBeVisible();
  }
}
