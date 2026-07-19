/* eslint-disable playwright/no-standalone-expect */
import { Page, expect } from '@playwright/test';
import { waitForPageApi } from '../utils/api';

export const groups = {
  async create(
    page: Page,
    { name, description = '' }: { name: string; description?: string },
  ) {
    await page.goto('/groups');
    await page.getByTestId('groups-new-button').click();
    await page.getByTestId('group-name-input').fill(name);
    if (description)
      await page.getByTestId('group-description-input').fill(description);

    const { body } = await waitForPageApi<any>(page, {
      method: 'POST',
      url: /\/groups$/,
      status: [200, 201],
      failureMessage: `Group creation failed for ${name}`,
      action: () => page.getByTestId('group-create-submit-button').click(),
    });

    const id =
      typeof body === 'object' && body
        ? (body.id ?? body.data?.id ?? null)
        : null;
    const card = page
      .getByTestId('group-card')
      .filter({ hasText: name })
      .first();
    await expect(card).toBeVisible({ timeout: 15000 });

    return {
      id,
      name,
      async open() {
        await card.click();
        await page.waitForURL(/\/groups\//, { timeout: 30000 });
      },
    };
  },
};

export default groups;
