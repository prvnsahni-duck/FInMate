import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  EncryptedExpenseKey,
  Expense,
  ExpenseSplit,
} from '@finmate/data-models';
import {
  ExpenseExportQueryService,
  MAX_EXPORT_ROWS,
} from './expenses-export-query.service';

/**
 * Chainable QueryBuilder mock. Every builder method returns `this`; `getMany`
 * resolves the seeded rows. `andWhere` calls are recorded for filter assertions.
 */
function makeQb(rows: unknown[]) {
  const andWhereCalls: Array<[string, unknown]> = [];
  const qb: Record<string, jest.Mock> = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn((clause: string, params?: unknown) => {
      andWhereCalls.push([clause, params]);
      return qb;
    }),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  };
  (qb as unknown as { andWhereCalls: typeof andWhereCalls }).andWhereCalls =
    andWhereCalls;
  return qb;
}

const personalExpense = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'p-1',
  title: 'enc:Groceries',
  description: 'enc:weekly',
  amountTotal: 200,
  currency: 'USD',
  category: 'Food & Drinks',
  expenseDate: '2026-07-01',
  createdAt: new Date('2026-07-01T10:00:00Z'),
  status: 'posted',
  encryptionScope: 'personal',
  group: null,
  groupKeyVersion: null,
  paidByUser: { id: 'user-1', displayName: 'Alice', email: 'alice@e.com' },
  ...over,
});

const groupSplit = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'sp-1',
  amountOwed: 300,
  isSettled: false,
  splitType: 'equal',
  expense: {
    id: 'g-1',
    title: 'enc:Dinner',
    description: null,
    amountTotal: 900,
    currency: 'USD',
    category: 'Food & Drinks',
    expenseDate: '2026-07-02',
    createdAt: new Date('2026-07-02T10:00:00Z'),
    status: 'posted',
    encryptionScope: 'group',
    group: { id: 'grp-1', name: 'House' },
    groupKeyVersion: { id: 'gkv-1' },
    paidByUser: null,
    paidByGroupMember: {
      id: 'gm-2',
      user: { id: 'user-2', displayName: 'Bob', email: 'bob@e.com' },
      contact: null,
    },
  },
  ...over,
});

describe('ExpenseExportQueryService', () => {
  let service: ExpenseExportQueryService;
  let expenseRepo: { createQueryBuilder: jest.Mock };
  let splitRepo: { createQueryBuilder: jest.Mock };
  let keyRepo: { find: jest.Mock };

  beforeEach(async () => {
    expenseRepo = { createQueryBuilder: jest.fn() };
    splitRepo = { createQueryBuilder: jest.fn() };
    keyRepo = { find: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpenseExportQueryService,
        { provide: getRepositoryToken(Expense), useValue: expenseRepo },
        { provide: getRepositoryToken(ExpenseSplit), useValue: splitRepo },
        {
          provide: getRepositoryToken(EncryptedExpenseKey),
          useValue: keyRepo,
        },
      ],
    }).compile();

    service = module.get(ExpenseExportQueryService);
  });

  it('returns personal rows with PERSONAL type and myShare = amountTotal', async () => {
    expenseRepo.createQueryBuilder.mockReturnValue(makeQb([personalExpense()]));
    splitRepo.createQueryBuilder.mockReturnValue(makeQb([]));

    const rows = await service.getExportRows('user-1', {});

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'p-1',
      expenseType: 'PERSONAL',
      myShare: 200,
      amountTotal: 200,
      groupId: null,
      paidByDisplayName: 'Alice',
      isSettled: false,
      title: 'enc:Groceries',
    });
  });

  it('returns group shares with GROUP_SHARE type, myShare = amountOwed and splitType', async () => {
    expenseRepo.createQueryBuilder.mockReturnValue(makeQb([]));
    splitRepo.createQueryBuilder.mockReturnValue(makeQb([groupSplit()]));

    const rows = await service.getExportRows('user-1', { type: 'group' });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'g-1',
      expenseType: 'GROUP_SHARE',
      myShare: 300,
      groupName: 'House',
      splitType: 'equal',
      paidByDisplayName: 'Bob',
      groupKeyVersionId: 'gkv-1',
    });
  });

  it('type=personal only runs the personal query', async () => {
    const pQb = makeQb([personalExpense()]);
    expenseRepo.createQueryBuilder.mockReturnValue(pQb);
    splitRepo.createQueryBuilder.mockReturnValue(makeQb([]));

    const rows = await service.getExportRows('user-1', { type: 'personal' });

    expect(expenseRepo.createQueryBuilder).toHaveBeenCalledTimes(1);
    expect(splitRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });

  it('type=all merges personal and group rows, newest first', async () => {
    expenseRepo.createQueryBuilder.mockReturnValue(makeQb([personalExpense()]));
    splitRepo.createQueryBuilder.mockReturnValue(makeQb([groupSplit()]));

    const rows = await service.getExportRows('user-1', { type: 'all' });

    expect(rows).toHaveLength(2);
    // g-1 is 2026-07-02, p-1 is 2026-07-01 → group first.
    expect(rows[0].id).toBe('g-1');
    expect(rows[1].id).toBe('p-1');
  });

  it('a specific status filter excludes personal expenses (settlement is group-only)', async () => {
    expenseRepo.createQueryBuilder.mockReturnValue(makeQb([personalExpense()]));
    const sQb = makeQb([groupSplit({ isSettled: true })]);
    splitRepo.createQueryBuilder.mockReturnValue(sQb);

    const rows = await service.getExportRows('user-1', { status: 'settled' });

    expect(expenseRepo.createQueryBuilder).not.toHaveBeenCalled();
    expect(rows.every((r) => r.expenseType === 'GROUP_SHARE')).toBe(true);
    // status pushed to SQL on the split query
    expect(
      (sQb as any).andWhereCalls.some(
        ([clause]: [string]) => clause.includes('split.isSettled'),
      ),
    ).toBe(true);
  });

  it('pushes the date range onto both queries', async () => {
    const pQb = makeQb([]);
    const sQb = makeQb([]);
    expenseRepo.createQueryBuilder.mockReturnValue(pQb);
    splitRepo.createQueryBuilder.mockReturnValue(sQb);

    await service.getExportRows('user-1', {
      from: '2026-07-01',
      to: '2026-07-31',
    });

    for (const qb of [pQb, sQb]) {
      const clauses = (qb as any).andWhereCalls.map(([c]: [string]) => c);
      expect(clauses).toContain('expense.expenseDate >= :from');
      expect(clauses).toContain('expense.expenseDate <= :to');
    }
  });

  it('scopes both queries to the calling user', async () => {
    const pQb = makeQb([]);
    const sQb = makeQb([]);
    expenseRepo.createQueryBuilder.mockReturnValue(pQb);
    splitRepo.createQueryBuilder.mockReturnValue(sQb);

    await service.getExportRows('user-1', {});

    expect(pQb.andWhere).toHaveBeenCalledWith('ownerUser.id = :userId', {
      userId: 'user-1',
    });
    expect(sQb.andWhere).toHaveBeenCalledWith(
      '(split.participantUser = :userId OR groupMember.user_id = :userId)',
      { userId: 'user-1' },
    );
  });

  it('returns an empty array when nothing matches', async () => {
    expenseRepo.createQueryBuilder.mockReturnValue(makeQb([]));
    splitRepo.createQueryBuilder.mockReturnValue(makeQb([]));

    const rows = await service.getExportRows('user-1', {});

    expect(rows).toEqual([]);
  });

  it('dedupes an expense that appears as both personal and a split', async () => {
    expenseRepo.createQueryBuilder.mockReturnValue(makeQb([personalExpense()]));
    splitRepo.createQueryBuilder.mockReturnValue(
      makeQb([groupSplit({ expense: { ...groupSplit().expense, id: 'p-1' } })]),
    );

    const rows = await service.getExportRows('user-1', {});

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('p-1');
    expect(rows[0].expenseType).toBe('PERSONAL');
  });

  it('throws EXP_EXPORT_TOO_LARGE above the row cap', async () => {
    const many = Array.from({ length: MAX_EXPORT_ROWS + 1 }, (_, i) =>
      personalExpense({ id: `p-${i}` }),
    );
    expenseRepo.createQueryBuilder.mockReturnValue(makeQb(many));
    splitRepo.createQueryBuilder.mockReturnValue(makeQb([]));

    await expect(service.getExportRows('user-1', {})).rejects.toMatchObject({
      response: { errorCode: 'EXP_EXPORT_TOO_LARGE' },
    });
  });

  it('rejects a malformed date', async () => {
    await expect(
      service.getExportRows('user-1', { from: '07-2026' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when from is after to', async () => {
    await expect(
      service.getExportRows('user-1', { from: '2026-08-01', to: '2026-07-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('attaches wrapped content keys for direct_shared rows', async () => {
    expenseRepo.createQueryBuilder.mockReturnValue(
      makeQb([
        personalExpense({ id: 'ds-1', encryptionScope: 'direct_shared' }),
      ]),
    );
    splitRepo.createQueryBuilder.mockReturnValue(makeQb([]));
    keyRepo.find.mockResolvedValue([
      { expense: { id: 'ds-1' }, user: { id: 'user-9' }, wrappedKey: 'wk' },
    ]);

    const rows = await service.getExportRows('user-1', { type: 'personal' });

    expect(rows[0].wrappedContentKeys).toEqual([
      { userId: 'user-9', wrappedKey: 'wk' },
    ]);
  });
});
