export type SplitType = 'equal' | 'fixed' | 'percent' | 'share';

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
  /**
   * Calculates exactly how much each participant owes.
   * Uses integer arithmetic (cents) to avoid floating-point issues.
   *
   * @param totalAmount The total expense amount
   * @param splits The participant splits definitions
   * @returns An array of SplitResult with exactly 2 decimal places in `amount`
   */
  static calculate(totalAmount: number, splits: SplitInput[]): SplitResult[] {
    if (splits.length === 0) {
      return [];
    }

    const totalCents = Math.round(totalAmount * 100);

    const state = splits.map((s) => ({
      ...s,
      centsOwed: 0,
    }));

    let allocatedCents = 0;

    // 1. Process Fixed Splits
    for (const s of state.filter((x) => x.type === 'fixed')) {
      const cents = Math.round((s.value || 0) * 100);
      s.centsOwed = cents;
      allocatedCents += cents;
    }

    if (allocatedCents > totalCents) {
      throw new Error('Fixed amounts exceed total amount');
    }

    // 2. Process Percent Splits
    // Percentages are typically based on the total expense amount.
    for (const s of state.filter((x) => x.type === 'percent')) {
      // Use floor to ensure we don't overallocate and get a negative remainder
      const cents = Math.floor(totalCents * ((s.value || 0) / 100));
      s.centsOwed = cents;
      allocatedCents += cents;
    }

    if (allocatedCents > totalCents) {
      throw new Error('Allocated amounts exceed total amount');
    }

    // 3. Process Share and Equal Splits
    let totalShares = 0;
    const shareSplits = state.filter((x) => x.type === 'share' || x.type === 'equal');
    for (const s of shareSplits) {
      if (s.type === 'equal') {
        totalShares += 1;
      } else if (s.type === 'share') {
        totalShares += s.value || 0;
      }
    }

    const remainingCentsForShares = totalCents - allocatedCents;

    if (totalShares > 0) {
      for (const s of shareSplits) {
        const theirShares = s.type === 'equal' ? 1 : s.value || 0;
        const cents = Math.floor(remainingCentsForShares * (theirShares / totalShares));
        s.centsOwed = cents;
        allocatedCents += cents;
      }
    }

    // 4. Remainder Allocation
    let unallocatedCents = totalCents - allocatedCents;

    // We only allocate remainder to non-fixed splits.
    const eligibleSplits = state.filter((s) => s.type !== 'fixed');

    if (unallocatedCents > 0) {
      if (eligibleSplits.length === 0) {
        throw new Error('Total amount does not match the sum of fixed amounts');
      }

      // Distribute 1 cent at a time round-robin
      let i = 0;
      while (unallocatedCents > 0) {
        eligibleSplits[i % eligibleSplits.length].centsOwed += 1;
        unallocatedCents -= 1;
        i += 1;
      }
    } else if (unallocatedCents < 0) {
      // In case floating point precision issue caused slight over-allocation,
      // though floor() usually prevents this unless user gave over 100%
      throw new Error('Overallocation error: check percentages or fixed amounts');
    }

    // 5. Format results
    return state.map((s) => ({
      id: s.id,
      amount: s.centsOwed / 100,
    }));
  }
}
