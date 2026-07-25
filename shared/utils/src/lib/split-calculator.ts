export type SplitType = 'equal' | 'fixed' | 'percent' | 'share';

export interface ExpenseSplitInputLike {
  participantUserId?: string;
  participantGroupMemberId?: string;
  splitType: SplitType;
  shareValue: number;
}

export interface CalculatedSplit {
  participantUserId?: string;
  participantGroupMemberId?: string;
  splitType: SplitType;
  shareValue: number;
  amountOwed: number;
}

export interface SplitCalculationIssue {
  errorCode: 'VAL_INVALID_INPUT';
  message: string;
}

export class SplitCalculationError extends Error {
  readonly issue: SplitCalculationIssue;

  constructor(message: string) {
    super(message);
    this.name = 'SplitCalculationError';
    this.issue = { errorCode: 'VAL_INVALID_INPUT', message };
  }
}

const toCents = (amount: number): number =>
  Math.round((amount + Number.EPSILON) * 100);
const fromCents = (cents: number): number => cents / 100;

const splitParticipantKey = (split: ExpenseSplitInputLike): string => {
  const key = split.participantUserId || split.participantGroupMemberId;
  return key || '';
};

const fail = (message: string): never => {
  throw new SplitCalculationError(message);
};

export const validateSplitParticipants = (
  splits: ExpenseSplitInputLike[],
): void => {
  for (const split of splits) {
    const hasUser = !!split.participantUserId;
    const hasGroupMember = !!split.participantGroupMemberId;
    if ((hasUser && hasGroupMember) || (!hasUser && !hasGroupMember)) {
      fail('Each split must include exactly one participant identifier');
    }
  }
};

export const calculateDeterministicSplits = (
  amountTotal: number,
  splits: ExpenseSplitInputLike[],
  payerKey?: string,
): CalculatedSplit[] => {
  if (!splits || !splits.length) {
    fail('At least one split is required');
  }

  validateSplitParticipants(splits);

  const splitType = splits[0]?.splitType || 'equal';
  const mixedTypes = splits.some((s) => s.splitType !== splitType);
  if (mixedTypes) {
    fail('All split lines must use the same splitType');
  }

  const totalCents = toCents(amountTotal);
  if (totalCents <= 0) {
    fail('Total amount must be greater than zero');
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
      fail('Fixed split amounts must equal amountTotal');
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
      fail('Share values must be positive numbers');
    }
    totalWeight += weight;
    return { ...s, weight };
  });

  if (splitType === 'percent' && Math.round(totalWeight * 100) !== 10000) {
    fail('Percent split values must sum to 100');
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

export interface SplitInput {
  id: string;
  type: SplitType;
  value?: number;
}

export interface SplitResult {
  id: string;
  amount: number;
}

export class SplitCalculator {
  static calculate(
    totalAmount: number,
    splits: SplitInput[],
    payerId?: string,
  ): SplitResult[] {
    const canonicalSplits = splits.map((split) => ({
      participantUserId: split.id,
      splitType: split.type,
      shareValue: split.type === 'equal' ? 1 : (split.value ?? 0),
    }));

    return calculateDeterministicSplits(
      totalAmount,
      canonicalSplits,
      payerId,
    ).map((split) => ({
      id: split.participantUserId || split.participantGroupMemberId || '',
      amount: split.amountOwed,
    }));
  }
}
