import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesSplitUtils } from './expenses.split.utils';

describe('ExpensesSplitUtils', () => {
  it('should calculate equal split correctly', () => {
    const total = 100;
    const participants = 4;
    const splits = ExpensesSplitUtils.calculateEqualSplit(total, participants);
    expect(splits).toEqual([25, 25, 25, 25]);
  });

  // Add tests for fixed, percent, share splits and CHECK constraint validation.
});
