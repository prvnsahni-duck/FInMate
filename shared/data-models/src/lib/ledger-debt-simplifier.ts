export interface LedgerBalance {
  key: string;
  balance: number;
}

export interface SimplifiedLedgerTransaction {
  fromKey: string;
  toKey: string;
  amount: number;
  currency: string;
}

/**
 * Greedy debt-simplification over an opaque balance-graph key. Shared by the
 * backend (SettlementsService suggested settlements, ExpensesService carry-forward
 * rollover) and the frontend (household suggested settlements) so every surface
 * stays identical in rounding, ordering, and tie-breaking. Pure and
 * dependency-free — safe in Node and the browser.
 */
export function simplifyLedgerDebts(
  balances: LedgerBalance[],
  currency: string,
): SimplifiedLedgerTransaction[] {
  // 1. Filter out users with zero balances (within a 0.01 tolerance)
  let activeBalances = balances
    .map((b) => ({ key: b.key, balance: Number(b.balance) }))
    .filter((b) => Math.abs(b.balance) >= 0.01);

  const transactions: SimplifiedLedgerTransaction[] = [];

  while (true) {
    // 2. Separate and sort debtors and creditors
    const debtors = activeBalances
      .filter((b) => b.balance < 0)
      .sort((a, b) => {
        if (Math.abs(a.balance - b.balance) < 0.0001) {
          return a.key.localeCompare(b.key); // Tie-break lexicographically
        }
        return a.balance - b.balance; // Most negative first (descending balance magnitude)
      });

    const creditors = activeBalances
      .filter((b) => b.balance > 0)
      .sort((a, b) => {
        if (Math.abs(a.balance - b.balance) < 0.0001) {
          return a.key.localeCompare(b.key); // Tie-break lexicographically
        }
        return b.balance - a.balance; // Largest positive first
      });

    // If either list is empty, we are done
    if (debtors.length === 0 || creditors.length === 0) {
      break;
    }

    const debtor = debtors[0];
    const creditor = creditors[0];

    // Calculate transfer amount
    const debitAmount = Math.abs(debtor.balance);
    const creditAmount = creditor.balance;
    const transferAmount = Math.min(debitAmount, creditAmount);

    // Round to 2 decimal places (standard financial rounding)
    const roundedTransfer = Math.round(transferAmount * 100) / 100;

    if (roundedTransfer > 0) {
      transactions.push({
        fromKey: debtor.key,
        toKey: creditor.key,
        amount: roundedTransfer,
        currency,
      });
    }

    // Update balances
    debtor.balance += transferAmount;
    creditor.balance -= transferAmount;

    // Refresh active balances list by filtering out settled users
    activeBalances = activeBalances
      .map((b) => {
        if (b.key === debtor.key) return { ...b, balance: debtor.balance };
        if (b.key === creditor.key) return { ...b, balance: creditor.balance };
        return b;
      })
      .filter((b) => Math.abs(b.balance) >= 0.01);
  }

  return transactions;
}
