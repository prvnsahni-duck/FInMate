import { test as base } from './diagnostics.fixture';
import auth from '../helpers/auth.helper';

type AuthFixture = { auth: typeof auth };

export const test = base.extend<AuthFixture>({
  // eslint-disable-next-line no-empty-pattern
  auth: async ({}, use) => use(auth),
});

export { expect } from '@playwright/test';


