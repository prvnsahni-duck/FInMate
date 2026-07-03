import { Page } from '@playwright/test';

export async function waitForUrlContains(page: Page, value: string) {
  await page.waitForURL(url => url.toString().includes(value), {
    timeout: Number(process.env.E2E_NAV_TIMEOUT_MS ?? 30000),
  });
}

export async function waitForDomReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
}
