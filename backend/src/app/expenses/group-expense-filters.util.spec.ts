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

  it('payer with a backing user matches both payer columns', () => {
    const qb = apply({ paidBy: { groupMemberId: 'gm-1', userId: 'u-1' } });
    expect(qb.clauses).toContain(
      '(expense.paidByGroupMember = :gefPaidGm OR expense.paidByUser = :gefPaidUser)',
    );
    expect(qb.params['gefPaidGm']).toBe('gm-1');
    expect(qb.params['gefPaidUser']).toBe('u-1');
  });

  it('pending payer (no user) matches only the group-member column', () => {
    const qb = apply({ paidBy: { groupMemberId: 'gm-2', userId: null } });
    expect(qb.clauses).toContain('expense.paidByGroupMember = :gefPaidGm');
    expect(qb.params['gefPaidGm']).toBe('gm-2');
    expect(qb.params['gefPaidUser']).toBeUndefined();
  });

  it('member with a backing user matches both split columns via EXISTS', () => {
    const qb = apply({ member: { groupMemberId: 'gm-3', userId: 'u-3' } });
    expect(qb.clauses.some((c) => c.startsWith('EXISTS'))).toBe(true);
    expect(qb.lastSub?.conditions).toContain(
      '(gefSplit.participantGroupMember = :gefMemGm OR gefSplit.participantUser = :gefMemUser)',
    );
    expect(qb.params['gefMemGm']).toBe('gm-3');
    expect(qb.params['gefMemUser']).toBe('u-3');
  });

  it('pending member (no user) matches only the group-member split column', () => {
    const qb = apply({ member: { groupMemberId: 'gm-4', userId: null } });
    expect(qb.lastSub?.conditions).toContain(
      'gefSplit.participantGroupMember = :gefMemGm',
    );
    expect(qb.lastSub?.conditions).not.toContain(
      '(gefSplit.participantGroupMember = :gefMemGm OR gefSplit.participantUser = :gefMemUser)',
    );
    expect(qb.params['gefMemGm']).toBe('gm-4');
    expect(qb.params['gefMemUser']).toBeUndefined();
  });

  it('correlates the subquery to the outer expense alias and excludes soft-deleted splits', () => {
    const qb = apply({ member: { groupMemberId: 'gm-5', userId: 'u-5' } });
    expect(qb.lastSub?.conditions).toContain('gefSplit.expense = expense.id');
    expect(qb.lastSub?.conditions).toContain('gefSplit.deletedAt IS NULL');
  });
});
