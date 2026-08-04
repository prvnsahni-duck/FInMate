import { ExpenseSplit } from '@finmate/data-models';
import { SelectQueryBuilder } from 'typeorm';

/**
 * A group member resolved to both identifiers it can appear under:
 *  - `groupMemberId` — used for pending (Contact-backed) members and as the
 *    payer of group expenses (`paidByGroupMember`).
 *  - `userId` — used for registered members in expense splits
 *    (`participantUser`) and legacy payer rows (`paidByUser`).
 *
 * A member dropdown yields only a `groupMemberId`; the owning service resolves
 * the paired `userId` (null for pending members) before calling the helper.
 */
export interface MemberRef {
  groupMemberId: string;
  userId: string | null;
}

/**
 * The "new" filter dimensions shared by the ledger list, analytics and export
 * query builders. Date/category/currency stay in each builder (they predate
 * this and already work); this centralizes only the dimensions that are added
 * across the board so a future filter is a one-line addition here.
 *
 * `transactionType: 'both'` must be normalized to `undefined` by the caller.
 */
export interface GroupExpenseDimensionFilters {
  transactionType?: 'expense' | 'refund';
  paidBy?: MemberRef;
  member?: MemberRef;
}

/**
 * Apply the shared expense-dimension filters to a query builder whose root
 * alias is an `Expense`. References entity relation *properties* (never raw
 * physical column names) so TypeORM maps them to the correct FK columns
 * regardless of the project's naming strategy, and so the same helper works
 * for the ledger, analytics and export builders alike.
 *
 * The `member` filter uses a correlated `EXISTS` subquery over `expense_splits`
 * rather than a JOIN, so it never multiplies rows — `getCount()`, pagination
 * and the scope-wide totals all stay correct.
 */
export function applyExpenseDimensionFilters<T>(
  qb: SelectQueryBuilder<T>,
  filter: GroupExpenseDimensionFilters,
  alias = 'expense',
): void {
  if (filter.transactionType) {
    qb.andWhere(`${alias}.transactionType = :gefTxType`, {
      gefTxType: filter.transactionType,
    });
  }

  if (filter.paidBy) {
    const { groupMemberId, userId } = filter.paidBy;
    if (userId) {
      qb.andWhere(
        `(${alias}.paidByGroupMember = :gefPaidGm OR ${alias}.paidByUser = :gefPaidUser)`,
        { gefPaidGm: groupMemberId, gefPaidUser: userId },
      );
    } else {
      qb.andWhere(`${alias}.paidByGroupMember = :gefPaidGm`, {
        gefPaidGm: groupMemberId,
      });
    }
  }

  if (filter.member) {
    const { groupMemberId, userId } = filter.member;
    qb.andWhere((sub) => {
      const inner = sub
        .subQuery()
        .select('1')
        .from(ExpenseSplit, 'gefSplit')
        .where(`gefSplit.expense = ${alias}.id`)
        .andWhere('gefSplit.deletedAt IS NULL')
        .andWhere(
          userId
            ? '(gefSplit.participantGroupMember = :gefMemGm OR gefSplit.participantUser = :gefMemUser)'
            : 'gefSplit.participantGroupMember = :gefMemGm',
        )
        .getQuery();
      return `EXISTS ${inner}`;
    });
    qb.setParameter('gefMemGm', groupMemberId);
    if (userId) qb.setParameter('gefMemUser', userId);
  }
}
