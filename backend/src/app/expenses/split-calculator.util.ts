import { BadRequestException } from '@nestjs/common';
import {
  CalculatedSplit,
  calculateDeterministicSplits as calculateCanonicalSplits,
  SplitCalculationError,
  validateSplitParticipants as validateCanonicalSplitParticipants,
} from '@finmate/utils';
import { ExpenseSplitInputDto } from '@finmate/data-models';

export type { CalculatedSplit } from '@finmate/utils';

export const validateSplitParticipants = (
  splits: ExpenseSplitInputDto[],
): void => {
  try {
    validateCanonicalSplitParticipants(splits);
  } catch (error) {
    if (error instanceof SplitCalculationError) {
      throw new BadRequestException(error.issue);
    }
    throw error;
  }
};

export const calculateDeterministicSplits = (
  amountTotal: number,
  splits: ExpenseSplitInputDto[],
  payerKey?: string,
): CalculatedSplit[] => {
  try {
    return calculateCanonicalSplits(amountTotal, splits, payerKey);
  } catch (error) {
    if (error instanceof SplitCalculationError) {
      throw new BadRequestException(error.issue);
    }
    throw error;
  }
};
