import { Locator, Page, expect } from '@playwright/test';
import { waitForPageApi } from '../utils/api';
import { testIds } from '../utils/locators';

export type ExpensePatch = { title?: string; amount?: string };

export default class ExpenseCard {
  readonly card: Locator;

  constructor(
    private readonly page: Page,
    readonly id: string | null,
    readonly title: string,
  ) {
    this.card = this.resolveCard();
  }

  async expectVisible() {
    await expect(this.card.getByTestId(testIds.expense.title)).toContainText(
      this.title,
      { timeout: 15000 },
    );
  }

  async expectDeleted() {
    await expect(this.card).toHaveCount(0, { timeout: 15000 });
  }

  async expectAmount(amount: string | RegExp) {
    await expect(this.card.getByTestId(testIds.expense.amount)).toContainText(
      amount,
      { timeout: 15000 },
    );
  }

  async edit(patch: ExpensePatch) {
    const nextTitle = patch.title ?? this.title;
    const response = await waitForPageApi(this.page, {
      method: /PATCH|PUT/,
      url: /\/expenses\//,
      status: [200, 204],
      failureMessage: `Expense edit failed for ${this.title}`,
      action: async () => {
        await this.card.getByTestId(`expense-edit-button-${this.id}`).click();
        if (patch.title)
          await this.page
            .getByTestId(testIds.expense.titleInput)
            .fill(patch.title);
        if (patch.amount)
          await this.page
            .getByTestId(testIds.expense.amountInput)
            .fill(patch.amount);
        await this.page.getByTestId(testIds.expense.saveButton).click();
      },
    });
    const edited = new ExpenseCard(this.page, this.id, nextTitle);
    await edited.expectVisible();
    return { expense: edited, response };
  }

  async delete() {
    await waitForPageApi(this.page, {
      method: 'DELETE',
      url: /\/expenses\//,
      status: [200, 204],
      failureMessage: `Expense deletion failed for ${this.title}`,
      action: async () => {
        await this.card.getByTestId(`expense-delete-button-${this.id}`).click();
        await this.page.getByRole('button', { name: /^delete$/i }).click();
      },
    });
    await this.expectDeleted();
  }

  async reload() {
    await this.page.reload();
    await this.expectVisible();
  }

  private resolveCard() {
    if (this.id) {
      return this.page
        .getByTestId(testIds.expense.card)
        .filter({
          has: this.page.getByTestId(`expense-edit-button-${this.id}`),
        })
        .first();
    }
    return this.page
      .getByTestId(testIds.expense.card)
      .filter({ hasText: this.title })
      .first();
  }
}
