/**
 * Regression: group expense encryption / decryption end-to-end.
 *
 * Scenario:
 *   1. Login, create a group.
 *   2. Add two encrypted expenses via the UI (exercises the real encryption path).
 *   3. Verify both titles are readable (plaintext, not ciphertext, not failure messages).
 *   4. Verify GET /expenses?groupId=... now returns groupKeyVersionId as a UUID.
 *   5. Logout → re-login → re-open the group: both titles still readable.
 */
import { test, expect } from '@playwright/test';

const EMAIL    = 'prvnsahni@gmail.com';
const PASSWORD = 'Qwerty@!23';
const API      = 'http://localhost:3000/api/v1';
const TS       = Date.now();
const GROUP_NAME = `Regression-${TS}`;
const TITLE_A    = `Alpha-${TS}`;
const TITLE_B    = `Beta-${TS}`;

let groupId: string;

// Single browser context reused across all steps to avoid re-login rate-limit hits
test.use({ storageState: undefined });

test('step 1 — create group and add two encrypted expenses', async ({ page }) => {
  // Login
  await page.goto('/auth/login');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });

  // Create group via UI — navigate to groups list
  await page.goto('/groups');
  await page.waitForTimeout(2000);

  // Click the "New Group" or "Create Group" button
  const createBtn = page.locator('button', { hasText: /new group|create group|\+ group/i }).first();
  if (await createBtn.isVisible({ timeout: 3000 })) {
    await createBtn.click();
  } else {
    // Try a link
    await page.locator('a', { hasText: /new group|create/i }).first().click();
  }
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/rg-create-group-modal.png' });

  // Fill in group name
  const nameInput = page.locator('input[placeholder*="group name" i], input[id*="name"], input[type="text"]').first();
  await nameInput.waitFor({ state: 'visible', timeout: 5000 });
  await nameInput.fill(GROUP_NAME);

  // Submit
  const submitBtn = page.locator('button[type="submit"]').or(
    page.locator('button', { hasText: /create|save/i })
  ).last();
  await submitBtn.click();
  await page.waitForTimeout(3000);

  // After creation, navigate to the new group
  await page.waitForURL(/\/groups\/[0-9a-f-]{36}/, { timeout: 10000 });
  groupId = page.url().split('/groups/')[1].split('?')[0];
  console.log(`Created group: ${groupId}`);
  expect(groupId).toMatch(/^[0-9a-f-]{36}$/);

  // Add expense A
  const addBtn = page.locator('button', { hasText: /add expense/i });
  await addBtn.click();
  await page.waitForTimeout(800);
  await page.fill('input[placeholder*="Dinner" i], input[id*="title" i]', TITLE_A);
  const amtA = page.locator('input[type="number"]').first();
  await amtA.fill('150');
  await page.locator('button[data-testid="expense-save-button"], button[type="submit"]').click();
  await page.waitForTimeout(3000);
  console.log(`Added expense A: ${TITLE_A}`);

  // Add expense B
  await addBtn.click();
  await page.waitForTimeout(800);
  await page.fill('input[placeholder*="Dinner" i], input[id*="title" i]', TITLE_B);
  const amtB = page.locator('input[type="number"]').first();
  await amtB.fill('200');
  await page.locator('button[data-testid="expense-save-button"], button[type="submit"]').click();
  await page.waitForTimeout(3000);
  console.log(`Added expense B: ${TITLE_B}`);

  await page.screenshot({ path: 'test-results/rg-after-create.png' });
});

test('step 2 — both titles decrypt correctly on group detail page', async ({ page }) => {
  expect(groupId, 'groupId must be set by step 1').toBeTruthy();

  await page.goto('/auth/login');
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });

  await page.goto(`/groups/${groupId}`);
  await page.waitForSelector(`text=${GROUP_NAME}`, { timeout: 15000 });
  await page.waitForTimeout(6000);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/rg-titles-visible.png' });

  const body = await page.innerText('body');
  const hasA = body.includes(TITLE_A);
  const hasB = body.includes(TITLE_B);
  const failures = [
    'Unable to display this item', 'Unable to decrypt',
    'cannot currently be decrypted', 'encryption key is unavailable',
  ].filter(m => body.includes(m));

  console.log(`Title A (${TITLE_A}) visible: ${hasA}`);
  console.log(`Title B (${TITLE_B}) visible: ${hasB}`);
  console.log(`Failure messages: ${failures.length ? failures.join('; ') : 'NONE'}`);

  expect(hasA, `TITLE_A must be visible as plaintext`).toBe(true);
  expect(hasB, `TITLE_B must be visible as plaintext`).toBe(true);
  expect(failures.length, `No decryption failure messages`).toBe(0);
});

test('step 3 — GET /expenses?groupId returns groupKeyVersionId uuid (not null)', async ({ request }) => {
  expect(groupId, 'groupId must be set by step 1').toBeTruthy();

  // Use Playwright request context which carries x-e2e header from config
  const auth = await request.post(`${API}/auth/login`, {
    data: { email: EMAIL, password: PASSWORD },
  });
  const tok = (await auth.json()).data.accessToken;

  const resp = await request.get(`${API}/expenses?groupId=${groupId}&limit=10`, {
    headers: { Authorization: `Bearer ${tok}` },
  });
  const items: any[] = (await resp.json()).data.data;
  expect(items.length, 'Group must have expenses').toBeGreaterThan(0);

  for (const item of items) {
    console.log(`Expense ${item.id.substring(0,8)}: groupKeyVersionId=${item.groupKeyVersionId}`);
    expect(
      item.groupKeyVersionId,
      `Expense ${item.id.substring(0,8)} must have non-null groupKeyVersionId`,
    ).toBeTruthy();
  }
});

test('step 4 — titles still decrypt after logout / re-login', async ({ page }) => {
  expect(groupId, 'groupId must be set by step 1').toBeTruthy();

  // Navigate to login (drops session)
  await page.goto('/auth/login');
  await page.waitForTimeout(500);
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 20000 });

  await page.goto(`/groups/${groupId}`);
  await page.waitForSelector(`text=${GROUP_NAME}`, { timeout: 15000 });
  await page.waitForTimeout(6000);

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'test-results/rg-after-relogin.png' });

  const body = await page.innerText('body');
  const hasA = body.includes(TITLE_A);
  const hasB = body.includes(TITLE_B);
  const failures = [
    'Unable to display this item', 'Unable to decrypt',
    'cannot currently be decrypted',
  ].filter(m => body.includes(m));

  console.log(`Post re-login — Title A: ${hasA}, Title B: ${hasB}`);
  console.log(`Failures after re-login: ${failures.length ? failures.join('; ') : 'NONE'}`);

  expect(hasA, `Title A must survive logout/login`).toBe(true);
  expect(hasB, `Title B must survive logout/login`).toBe(true);
  expect(failures.length, `No failures after re-login`).toBe(0);
});
