import { test as base } from './expense.fixture';
import groups from '../helpers/groups.helper';
import recurring from '../helpers/recurring.helper';

type GroupsFixture = {
  groups: typeof groups;
  recurring: typeof recurring;
};

export const test = base.extend<GroupsFixture>({
  // eslint-disable-next-line no-empty-pattern
  groups: async ({}, use) => use(groups),
  // eslint-disable-next-line no-empty-pattern
  recurring: async ({}, use) => use(recurring),
});

export { expect } from '@playwright/test';
