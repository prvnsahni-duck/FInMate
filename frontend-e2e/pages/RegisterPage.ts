import { Locator, Page } from '@playwright/test';
import { testIds } from '../utils/locators';

export default class RegisterPage {
  readonly page: Page;
  readonly form: Locator;
  readonly displayName: Locator;
  readonly email: Locator;
  readonly password: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.form = page.getByTestId(testIds.auth.registerForm);
    this.displayName = page.getByTestId(testIds.auth.registerDisplayName);
    this.email = page.getByTestId(testIds.auth.registerEmail);
    this.password = page.getByTestId(testIds.auth.registerPassword);
    this.submit = page.getByTestId(testIds.auth.registerSubmit);
  }
}
