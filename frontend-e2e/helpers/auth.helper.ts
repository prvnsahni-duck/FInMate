/* eslint-disable playwright/no-standalone-expect */
import { Page, expect } from '@playwright/test';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';
import DashboardPage from '../pages/DashboardPage';
import { waitForPageApi } from '../utils/api';
import { waitForUrlContains } from '../utils/waits';

export const auth = {
  async register(
    page: Page,
    {
      displayName,
      email,
      password,
    }: { displayName: string; email: string; password: string },
  ) {
    await page.goto('/auth/register');
    const register = new RegisterPage(page);
    await expect(register.form).toBeVisible();
    await register.displayName.fill(displayName);
    await register.email.fill(email);
    await register.password.fill(password);

    const { response, body } = await waitForPageApi(page, {
      method: 'POST',
      // Accept either /api/auth/register or /api/v1/auth/register (dev proxies may strip/add v1)
      url: /\/api(?:\/v1)?\/auth\/register$/,
      status: [200, 201],
      failureMessage: 'Registration failed',
      action: () => register.submit.click(),
    });

    if (!body) {
      throw new Error(
        `Registration returned ${response.status()} without a readable body.`,
      );
    }
  },

  async login(
    page: Page,
    { email, password }: { email: string; password: string },
  ) {
    await page.goto('/auth/login');
    const login = new LoginPage(page);
    await expect(login.form).toBeVisible();
    await login.email.fill(email);
    await login.password.fill(password);

    const { body } = await waitForPageApi<any>(page, {
      method: 'POST',
      url: /\/api(?:\/v1)?\/auth\/login$/,
      status: [200, 201],
      failureMessage: 'Login failed',
      action: () => login.signIn.click(),
    });

    const token =
      typeof body === 'object' && body
        ? body.accessToken || body.token || body.data?.accessToken
        : null;
    const storage = await page.evaluate(() => ({
      local: { ...localStorage },
      session: { ...sessionStorage },
    }));
    const storageHasToken = JSON.stringify(storage)
      .toLowerCase()
      .includes('token');
    if (!token && !storageHasToken) {
      throw new Error(
        `Login succeeded but no token was found in response or browser storage. Response: ${JSON.stringify(body)}`,
      );
    }

    await waitForUrlContains(page, '/dashboard');
    await new DashboardPage(page).expectLoaded();
  },

  async logout(page: Page) {
    await page.getByRole('button', { name: /profile/i }).click();
    await page.getByRole('button', { name: /log out/i }).click();
    await waitForUrlContains(page, '/auth/login');
  },
};

export default auth;
