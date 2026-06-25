import { BadRequestException } from '@nestjs/common';
import { ExpenseSplitInputDto } from '@finmate/data-models';

export interface CalculatedSplit {
  participantUserId?: string;
  participantGroupMemberId?: string;
  splitType: 'equal' | 'fixed' | 'percent' | 'share';
  shareValue: number;
  amountOwed: number;
}

const toCents = (amount: number): number =>
  Math.round((amount + Number.EPSILON) * 100);
const fromCents = (cents: number): number => cents / 100;

const splitParticipantKey = (split: ExpenseSplitInputDto): string => {
  const key = split.participantUserId || split.participantGroupMemberId;
  return key || '';
};

export const validateSplitParticipants = (
  splits: ExpenseSplitInputDto[],
): void => {
  for (const split of splits) {
    const hasUser = !!split.participantUserId;
    const hasGroupMember = !!split.participantGroupMemberId;
    if ((hasUser && hasGroupMember) || (!hasUser && !hasGroupMember)) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Each split must include exactly one participant identifier',
      });
    }
  }
};

export const calculateDeterministicSplits = (
  amountTotal: number,
  splits: ExpenseSplitInputDto[],
  payerKey?: string,
): CalculatedSplit[] => {
  if (!splits || !splits.length) {
    throw new BadRequestException({
      errorCode: 'VAL_INVALID_INPUT',
      message: 'At least one split is required',
    });
  }

  validateSplitParticipants(splits);

  const splitType = splits[0]?.splitType || 'equal';
  const mixedTypes = splits.some((s) => s.splitType !== splitType);
  if (mixedTypes) {
    throw new BadRequestException({
      errorCode: 'VAL_INVALID_INPUT',
      message: 'All split lines must use the same splitType',
    });
  }

  const totalCents = toCents(amountTotal);
  if (totalCents <= 0) {
    throw new BadRequestException({
      errorCode: 'VAL_INVALID_INPUT',
      message: 'Total amount must be greater than zero',
    });
  }

  const withMeta = splits.map((s, index) => ({
    ...s,
    index,
    participantKey: splitParticipantKey(s),
  }));

  if (splitType === 'fixed') {
    const calculated = withMeta.map((s) => ({
      ...s,
      amountCents: toCents(s.shareValue),
    }));

    const fixedSum = calculated.reduce(
      (acc, curr) => acc + curr.amountCents,
      0,
    );
    if (fixedSum !== totalCents) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Fixed split amounts must equal amountTotal',
      });
    }

    return calculated.map((s) => ({
      participantUserId: s.participantUserId,
      participantGroupMemberId: s.participantGroupMemberId,
      splitType,
      shareValue: s.shareValue,
      amountOwed: fromCents(s.amountCents),
    }));
  }

  let totalWeight = 0;
  const weighted = withMeta.map((s) => {
    const weight = splitType === 'equal' ? 1 : Number(s.shareValue);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new BadRequestException({
        errorCode: 'VAL_INVALID_INPUT',
        message: 'Share values must be positive numbers',
      });
    }
    totalWeight += weight;
    return { ...s, weight };
  });

  if (splitType === 'percent' && Math.round(totalWeight * 100) !== 10000) {
    throw new BadRequestException({
      errorCode: 'VAL_INVALID_INPUT',
      message: 'Percent split values must sum to 100',
    });
  }

  const base = weighted.map((s) => ({
    ...s,
    amountCents: Math.floor((totalCents * s.weight) / totalWeight),
  }));

  const baseSum = base.reduce((acc, curr) => acc + curr.amountCents, 0);
  const remainder = totalCents - baseSum;

  const allocationOrder = [...base].sort((a, b) => {
    const aPayerPriority = a.participantKey === payerKey ? 0 : 1;
    const bPayerPriority = b.participantKey === payerKey ? 0 : 1;
    if (aPayerPriority !== bPayerPriority) {
      return aPayerPriority - bPayerPriority;
    }
    return a.participantKey.localeCompare(b.participantKey);
  });

  if (remainder > 0) {
    for (let i = 0; i < remainder; i++) {
      allocationOrder[i % allocationOrder.length].amountCents += 1;
    }
  }

  if (remainder < 0) {
    for (let i = 0; i < Math.abs(remainder); i++) {
      allocationOrder[i % allocationOrder.length].amountCents -= 1;
    }
  }

  return base.map((s) => ({
    participantUserId: s.participantUserId,
    participantGroupMemberId: s.participantGroupMemberId,
    splitType,
    shareValue: splitType === 'equal' ? 1 : s.shareValue,
    amountOwed: fromCents(s.amountCents),
  }));
};
