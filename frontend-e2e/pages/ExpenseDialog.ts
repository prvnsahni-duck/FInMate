import { Page, expect } from '@playwright/test';
import { testIds } from '../utils/locators';

export default class ExpenseDialog {
  constructor(private readonly page: Page) {}

  async fill(values: { title: string; amount: string }) {
    await expect(this.page.getByTestId(testIds.expense.dialog)).toBeVisible();
    await this.page.getByTestId(testIds.expense.titleInput).fill(values.title);
    await this.page
      .getByTestId(testIds.expense.amountInput)
      .fill(values.amount);
  }

  async save() {
    await this.page.getByTestId(testIds.expense.saveButton).click();
  }
}
