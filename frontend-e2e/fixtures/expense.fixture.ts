import { test as base } from './auth.fixture';
import expenses from '../helpers/expenses.helper';

type ExpenseFixture = { expenses: typeof expenses };

export const test = base.extend<ExpenseFixture>({
  // eslint-disable-next-line no-empty-pattern
  expenses: async ({}, use) => use(expenses),
});

export { expect } from '@playwright/test';
