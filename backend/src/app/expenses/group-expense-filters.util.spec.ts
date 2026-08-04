import {
  applyExpenseDimensionFilters,
  GroupExpenseDimensionFilters,
} from './group-expense-filters.util';

/** Records the conditions added to a subquery so the member branch is assertable. */
class FakeSubQuery {
  conditions: string[] = [];
  select() {
    return this;
  }
  from() {
    return this;
  }
  where(c: string) {
    this.conditions.push(c);
    return this;
  }
  andWhere(c: string) {
    this.conditions.push(c);
    return this;
  }
  getQuery() {
    return `SUBQ(${this.conditions.join(' AND ')})`;
  }
}

/** Minimal SelectQueryBuilder stand-in that records where clauses + params. */
class FakeQB {
  clauses: string[] = [];
  params: Record<string, unknown> = {};
  lastSub?: FakeSubQuery;

  andWhere(arg: unknown, params?: Record<string, unknown>) {
    if (typeof arg === 'function') {
      this.lastSub = new FakeSubQuery();
      const sub = { subQuery: () => this.lastSub };
      this.clauses.push((arg as (s: unknown) => string)(sub));
    } else {
      this.clauses.push(String(arg));
      if (params) Object.assign(this.params, params);
    }
    return this;
  }

  setParameter(key: string, value: unknown) {
    this.params[key] = value;
    return this;
  }
}

function apply(filter: GroupExpenseDimensionFilters): FakeQB {
  const qb = new FakeQB();
  applyExpenseDimensionFilters(qb as never, filter);
  return qb;
}

describe('applyExpenseDimensionFilters', () => {
  it('adds no clauses for an empty filter', () => {
    const qb = apply({});
    expect(qb.clauses).toEqual([]);
    expect(qb.params).toEqual({});
  });

  it('filters by transaction type', () => {
    const qb = apply({ transactionType: 'refund' });
    expect(qb.clauses).toContain('expense.transactionType = :gefTxType');
    expect(qb.params['gefTxType']).toBe('refund');
  });

  it('filters by categories (IN)', () => {
    const qb = apply({ categories: ['Food & Drinks', 'Travel'] });
    expect(qb.clauses).toContain('expense.category IN (:...gefCats)');
    expect(qb.params['gefCats']).toEqual(['Food & Drinks', 'Travel']);
  });

  it('filters by amount range (inclusive bounds)', () => {
    const qb = apply({ minAmount: 100, maxAmount: 500 });
    expect(qb.clauses).toContain('expense.amountTotal >= :gefMinAmount');
    expect(qb.clauses).toContain('expense.amountTotal <= :gefMaxAmount');
    expect(qb.params['gefMinAmount']).toBe(100);
    expect(qb.params['gefMaxAmount']).toBe(500);
  });

  it('payers with backing users match both payer columns (IN)', () => {
    const qb = apply({
      paidBy: [
        { groupMemberId: 'gm-1', userId: 'u-1' },
        { groupMemberId: 'gm-2', userId: 'u-2' },
      ],
    });
    expect(qb.clauses).toContain(
      '(expense.paidByGroupMember IN (:...gefPaidGm) OR expense.paidByUser IN (:...gefPaidUser))',
    );
    expect(qb.params['gefPaidGm']).toEqual(['gm-1', 'gm-2']);
    expect(qb.params['gefPaidUser']).toEqual(['u-1', 'u-2']);
  });

  it('pending payers (no user) match only the group-member column', () => {
    const qb = apply({ paidBy: [{ groupMemberId: 'gm-2', userId: null }] });
    expect(qb.clauses).toContain(
      '(expense.paidByGroupMember IN (:...gefPaidGm))',
    );
    expect(qb.params['gefPaidGm']).toEqual(['gm-2']);
    expect(qb.params['gefPaidUser']).toBeUndefined();
  });

  it('members with backing users match both split columns via EXISTS (IN)', () => {
    const qb = apply({ member: [{ groupMemberId: 'gm-3', userId: 'u-3' }] });
    expect(qb.clauses.some((c) => c.startsWith('EXISTS'))).toBe(true);
    expect(qb.lastSub?.conditions).toContain(
      '(gefSplit.participantGroupMember IN (:...gefMemGm) OR gefSplit.participantUser IN (:...gefMemUser))',
    );
    expect(qb.params['gefMemGm']).toEqual(['gm-3']);
    expect(qb.params['gefMemUser']).toEqual(['u-3']);
  });

  it('pending members (no user) match only the group-member split column', () => {
    const qb = apply({ member: [{ groupMemberId: 'gm-4', userId: null }] });
    expect(qb.lastSub?.conditions).toContain(
      'gefSplit.participantGroupMember IN (:...gefMemGm)',
    );
    expect(qb.params['gefMemGm']).toEqual(['gm-4']);
    expect(qb.params['gefMemUser']).toBeUndefined();
  });

  it('correlates the subquery to the outer expense alias and excludes soft-deleted splits', () => {
    const qb = apply({ member: [{ groupMemberId: 'gm-5', userId: 'u-5' }] });
    expect(qb.lastSub?.conditions).toContain('gefSplit.expense = expense.id');
    expect(qb.lastSub?.conditions).toContain('gefSplit.deletedAt IS NULL');
  });
});
