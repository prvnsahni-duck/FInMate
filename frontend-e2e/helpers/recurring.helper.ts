/* eslint-disable playwright/no-standalone-expect */
import { Page, expect } from '@playwright/test';
import { waitForPageApi } from '../utils/api';

export const recurring = {
  async create(page: Page, { title, description, amount, startDate }: { title: string; description: string; amount: string; startDate: string }) {
    await page.getByTestId('group-tab-recurring').click();
    await page.getByTestId('recurring-create-button').click();
    await expect(page.getByTestId('recurring-form')).toBeVisible();
    await page.getByTestId('recurring-title-input').fill(title);
    await page.getByTestId('recurring-description-input').fill(description);
    await page.getByTestId('recurring-amount-input').fill(amount);
    await page.getByTestId('recurring-start-date-input').fill(startDate);
    await page.getByTestId('recurring-participant-button').first().click();

    const { body } = await waitForPageApi<any>(page, {
      method: 'POST',
      url: /\/recurring-expenses/,
      status: [200, 201],
      failureMessage: `Recurring expense creation failed for ${title}`,
      action: () => page.getByTestId('recurring-submit-button').click(),
    });

    const card = page.getByTestId('recurring-expense-card').filter({ hasText: title }).first();
    await expect(card).toBeVisible({ timeout: 15000 });
    await expect(card).toContainText(/active/i);
    return { title, body };
  },
};

export default recurring;

