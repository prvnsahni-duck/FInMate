import { Locator, Page } from '@playwright/test';
import { testIds } from '../utils/locators';

export default class LoginPage {
  readonly page: Page;
  readonly form: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly signIn: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = page.getByTestId(testIds.auth.loginForm);
    this.email = page.getByTestId(testIds.auth.loginEmail);
    this.password = page.getByTestId(testIds.auth.loginPassword);
    this.signIn = page.getByTestId(testIds.auth.loginSubmit);
  }
}
