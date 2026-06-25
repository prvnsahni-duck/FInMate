import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Group,
  GroupMember,
  Expense,
  ExpenseSplit,
  Settlement,
  AuditLog,
} from '@finmate/data-models';
import { SettlementsService, MemberBalance } from './settlements.service';
import {
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  PreconditionFailedException,
} from '@nestjs/common';

describe('SettlementsService', () => {
  let service: SettlementsService;
  let groupRepository: jest.Mocked<Repository<Group>>;
  let groupMemberRepository: jest.Mocked<Repository<GroupMember>>;
  let expenseRepository: jest.Mocked<Repository<Expense>>;
  let expenseSplitRepository: jest.Mocked<Repository<ExpenseSplit>>;
  let settlementRepository: jest.Mocked<Repository<Settlement>>;

  beforeEach(async () => {
    const mockGroupRepository = {
      findOne: jest.fn(),
    };

    const mockGroupMemberRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest
          .fn()
          .mockImplementation(() => mockGroupMemberRepository.findOne()),
      })),
    };

    const mockExpenseRepository = {
      find: jest.fn(),
    };

    const mockExpenseSplitRepository = {
      find: jest.fn(),
    };

    const mockSettlementRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const mockAuditLogRepository = {
      save: jest.fn(),
      create: jest.fn(),
    };

    const mockEntityManager = {
      findOne: jest.fn(async (entityClass, options: any) => {
        if (entityClass === GroupMember) {
          const res = await mockGroupMemberRepository.findOne(options);
          if (res && !res.user) {
            res.user = {
              id: options?.where?.user?.id || 'caller-id',
              email: 'test@example.com',
            } as any;
          }
          return res;
        }
        if (entityClass === Settlement) {
          return mockSettlementRepository.findOne(options);
        }
        return null;
      }),
      create: jest.fn((entityClass, data) => {
        if (entityClass === Settlement) {
          return mockSettlementRepository.create(data);
        }
        return data;
      }),
      save: jest.fn((entityClass, data) => {
        if (entityClass === Settlement) {
          return mockSettlementRepository.save(data);
        }
        return data;
      }),
    };

    const mockDataSource = {
      transaction: jest.fn((cb) => cb(mockEntityManager)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: getRepositoryToken(Group), useValue: mockGroupRepository },
        {
          provide: getRepositoryToken(GroupMember),
          useValue: mockGroupMemberRepository,
        },
        {
          provide: getRepositoryToken(Expense),
          useValue: mockExpenseRepository,
        },
        {
          provide: getRepositoryToken(ExpenseSplit),
          useValue: mockExpenseSplitRepository,
        },
        {
          provide: getRepositoryToken(Settlement),
          useValue: mockSettlementRepository,
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: mockAuditLogRepository,
        },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<SettlementsService>(SettlementsService);
    groupRepository = module.get(getRepositoryToken(Group));
    groupMemberRepository = module.get(getRepositoryToken(GroupMember));
    expenseRepository = module.get(getRepositoryToken(Expense));
    expenseSplitRepository = module.get(getRepositoryToken(ExpenseSplit));
    settlementRepository = module.get(getRepositoryToken(Settlement));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('simplifyDebts (Core Math Algorithm)', () => {
    it('Example A: Simple Debt (No Tie-Breaks)', () => {
      // User A (aaaa) is owed $90. User B (bbbb) owes $30. User C (cccc) owes $60.
      const balances: MemberBalance[] = [
        { userId: 'aaaa', balance: 90.0 },
        { userId: 'bbbb', balance: -30.0 },
        { userId: 'cccc', balance: -60.0 },
      ];

      const result = service.simplifyDebts(balances, 'USD');

      expect(result).toHaveLength(2);
      // cccc owes most, so cccc pays aaaa $60 first
      expect(result[0]).toEqual({
        fromUserId: 'cccc',
        toUserId: 'aaaa',
        amount: 60.0,
        currency: 'USD',
      });
      // bbbb pays aaaa $30 next
      expect(result[1]).toEqual({
        fromUserId: 'bbbb',
        toUserId: 'aaaa',
        amount: 30.0,
        currency: 'USD',
      });
    });

    it('Example B: Rounding Remainder (Equal Split of $10.00)', () => {
      // User A (aaaa) is owed $6.66. User B (bbbb) owes $3.33. User C (cccc) owes $3.33.
      const balances: MemberBalance[] = [
        { userId: 'aaaa', balance: 6.66 },
        { userId: 'bbbb', balance: -3.33 },
        { userId: 'cccc', balance: -3.33 },
      ];

      const result = service.simplifyDebts(balances, 'USD');

      expect(result).toHaveLength(2);
      // bbbb and cccc owe same. Lexicographically, bbbb comes before cccc.
      // So bbbb pays aaaa $3.33 first.
      expect(result[0]).toEqual({
        fromUserId: 'bbbb',
        toUserId: 'aaaa',
        amount: 3.33,
        currency: 'USD',
      });
      // cccc pays aaaa $3.33 next.
      expect(result[1]).toEqual({
        fromUserId: 'cccc',
        toUserId: 'aaaa',
        amount: 3.33,
        currency: 'USD',
      });
    });

    it('Example C: Sorting & Tie-Breaking (Multiple equal balances)', () => {
      // User A (1111) owes $100. User B (2222) owes $100. User C (3333) is owed $200.
      const balances: MemberBalance[] = [
        { userId: '1111', balance: -100.0 },
        { userId: '2222', balance: -100.0 },
        { userId: '3333', balance: 200.0 },
      ];

      const result = service.simplifyDebts(balances, 'USD');

      expect(result).toHaveLength(2);
      // User A (1111) is lexicographically before User B (2222).
      // So 1111 pays 3333 $100 first.
      expect(result[0]).toEqual({
        fromUserId: '1111',
        toUserId: '3333',
        amount: 100.0,
        currency: 'USD',
      });
      // 2222 pays 3333 $100 next.
      expect(result[1]).toEqual({
        fromUserId: '2222',
        toUserId: '3333',
        amount: 100.0,
        currency: 'USD',
      });
    });

    it('should minimize circular debts and return empty for net zero inputs', () => {
      const balances: MemberBalance[] = [
        { userId: 'aaaa', balance: 0.0 },
        { userId: 'bbbb', balance: 0.004 }, // under 0.01 tolerance -> ignored
      ];

      const result = service.simplifyDebts(balances, 'USD');
      expect(result).toHaveLength(0);
    });

    it('should resolve a complex circular debt scenario', () => {
      // A owes B $10, B owes C $10, C owes A $10 (net balances all 0)
      const balances: MemberBalance[] = [
        { userId: 'aaaa', balance: 0.0 },
        { userId: 'bbbb', balance: 0.0 },
        { userId: 'cccc', balance: 0.0 },
      ];

      const result = service.simplifyDebts(balances, 'USD');
      expect(result).toHaveLength(0);
    });
  });

  describe('calculateGroupBalances', () => {
    it('should throw ForbiddenException if caller is not an active member', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.calculateGroupBalances('user-id', 'group-id'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should compile balances and simplify debts across multiple currencies', async () => {
      // Setup members
      const userA = { id: 'aaaa', email: 'a@ex.com', displayName: 'User A' };
      const userB = { id: 'bbbb', email: 'b@ex.com', displayName: 'User B' };

      const mockMembers = [
        { user: userA, joinStatus: 'active' },
        { user: userB, joinStatus: 'active' },
      ] as any[];

      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-member',
      } as any);
      groupRepository.findOne.mockResolvedValueOnce({ id: 'group-id' } as any);
      groupMemberRepository.find.mockResolvedValueOnce(mockMembers);

      // Expenses
      const mockExpenses = [
        {
          id: 'exp-1',
          amountTotal: 100.0,
          currency: 'USD',
          paidByUser: userA,
        },
      ] as any[];
      expenseRepository.find.mockResolvedValueOnce(mockExpenses);

      // Splits: User B owes $100 for exp-1
      const mockSplits = [
        {
          expense: { id: 'exp-1', currency: 'USD' },
          participantUser: userB,
          amountOwed: 100.0,
        },
      ] as any[];
      expenseSplitRepository.find.mockResolvedValueOnce(mockSplits);

      // Settlements: B paid A $30 in USD (confirmed)
      const mockSettlements = [
        {
          amount: 30.0,
          currency: 'USD',
          fromUser: userB,
          toUser: userA,
        },
      ] as any[];
      settlementRepository.find.mockResolvedValueOnce(mockSettlements);

      const result = await service.calculateGroupBalances('aaaa', 'group-id');

      expect(result).toBeDefined();
      // USD net balance calculations:
      // A paid 100, owes 0, received 30. Net = 100 - 0 - 30 = 70.
      // B paid 0, owes 100, paid 30. Net = 0 - 100 + 30 = -70.
      expect(result.balances).toContainEqual(
        expect.objectContaining({
          userId: 'aaaa',
          netBalance: 70.0,
          currency: 'USD',
        }),
      );
      expect(result.balances).toContainEqual(
        expect.objectContaining({
          userId: 'bbbb',
          netBalance: -70.0,
          currency: 'USD',
        }),
      );

      // Suggested settlements should simplify: B pays A $70
      expect(result.suggestedSettlements).toHaveLength(1);
      expect(result.suggestedSettlements[0]).toEqual({
        fromUserId: 'bbbb',
        toUserId: 'aaaa',
        amount: 70.0,
        currency: 'USD',
      });
    });
  });

  describe('proposeSettlement', () => {
    it('should throw ForbiddenException if caller is not an active member', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.proposeSettlement('caller-id', 'group-id', {
          toUserId: 'target-id',
          amount: 10,
          currency: 'USD',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if recipient is not in group', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-member',
      } as any);
      groupRepository.findOne.mockResolvedValueOnce({ id: 'group-id' } as any);
      groupMemberRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.proposeSettlement('caller-id', 'group-id', {
          toUserId: 'target-id',
          amount: 10,
          currency: 'USD',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should successfully propose settlement', async () => {
      const mockCaller = {
        id: 'caller-member',
        user: { id: 'caller-id' },
      } as any;
      const mockRecipient = {
        id: 'recipient-member',
        user: { id: 'recipient-id' },
      } as any;

      groupMemberRepository.findOne.mockResolvedValueOnce(mockCaller);
      groupRepository.findOne.mockResolvedValueOnce({ id: 'group-id' } as any);
      groupMemberRepository.findOne.mockResolvedValueOnce(mockRecipient);

      settlementRepository.create.mockImplementation((data) => data as any);
      settlementRepository.save.mockResolvedValueOnce({
        id: 'settlement-id',
        ...mockCaller.user,
      } as any);

      const result = await service.proposeSettlement('caller-id', 'group-id', {
        toUserId: 'recipient-id',
        amount: 100,
        currency: 'USD',
        note: 'lunch',
      });

      expect(settlementRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100,
          currency: 'USD',
          note: 'lunch',
        }),
      );
      expect(result).toBeDefined();
    });
  });

  describe('listSettlements', () => {
    it('should throw ForbiddenException if caller is not active', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.listSettlements('caller-id', 'group-id', 1, 20),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return paginated list of settlements', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-member',
      } as any);

      const mockQueryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValueOnce(2),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 's-1' }, { id: 's-2' }]),
      };
      settlementRepository.createQueryBuilder.mockReturnValueOnce(
        mockQueryBuilder as any,
      );

      const result = await service.listSettlements(
        'caller-id',
        'group-id',
        1,
        10,
      );

      expect(result).toBeDefined();
      expect(result.data).toHaveLength(2);
      expect(result.meta.totalItems).toBe(2);
    });
  });

  describe('updateSettlement', () => {
    it('should throw ForbiddenException if caller is not active', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateSettlement('caller-id', 'group-id', 'settlement-id', {
          status: 'confirmed',
          version: 1,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if settlement is not found', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-member',
      } as any);
      settlementRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateSettlement('caller-id', 'group-id', 'settlement-id', {
          status: 'confirmed',
          version: 1,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw PreconditionFailedException on version conflict', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-member',
      } as any);
      settlementRepository.findOne.mockResolvedValueOnce({
        id: 'settlement-id',
        version: 2,
      } as any);

      await expect(
        service.updateSettlement('caller-id', 'group-id', 'settlement-id', {
          status: 'confirmed',
          version: 1,
        }),
      ).rejects.toThrow(PreconditionFailedException);
    });

    it('should throw ForbiddenException if non-creditor tries to confirm', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-member',
      } as any);

      const mockSettlement = {
        id: 'settlement-id',
        version: 1,
        fromUser: { id: 'debtor-id' },
        toUser: { id: 'creditor-id' },
      } as any;
      settlementRepository.findOne.mockResolvedValueOnce(mockSettlement);

      await expect(
        service.updateSettlement('debtor-id', 'group-id', 'settlement-id', {
          status: 'confirmed',
          version: 1,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow creditor to confirm receipt', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-member',
      } as any);

      const mockSettlement = {
        id: 'settlement-id',
        version: 1,
        fromUser: { id: 'debtor-id' },
        toUser: { id: 'creditor-id' },
        status: 'proposed',
      } as any;
      settlementRepository.findOne.mockResolvedValueOnce(mockSettlement);
      settlementRepository.save.mockResolvedValueOnce(mockSettlement);

      const result = await service.updateSettlement(
        'creditor-id',
        'group-id',
        'settlement-id',
        {
          status: 'confirmed',
          settledOn: '2026-06-10',
          version: 1,
        },
      );

      expect(mockSettlement.status).toBe('confirmed');
      expect(mockSettlement.settledOn).toBe('2026-06-10');
      expect(result).toBeDefined();
    });

    it('should throw ForbiddenException if non-party tries to cancel', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-member',
      } as any);

      const mockSettlement = {
        id: 'settlement-id',
        version: 1,
        fromUser: { id: 'debtor-id' },
        toUser: { id: 'creditor-id' },
      } as any;
      settlementRepository.findOne.mockResolvedValueOnce(mockSettlement);

      await expect(
        service.updateSettlement('other-id', 'group-id', 'settlement-id', {
          status: 'cancelled',
          version: 1,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow debtor to cancel', async () => {
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'caller-member',
      } as any);

      const mockSettlement = {
        id: 'settlement-id',
        version: 1,
        fromUser: { id: 'debtor-id' },
        toUser: { id: 'creditor-id' },
        status: 'proposed',
      } as any;
      settlementRepository.findOne.mockResolvedValueOnce(mockSettlement);
      settlementRepository.save.mockResolvedValueOnce(mockSettlement);

      const result = await service.updateSettlement(
        'debtor-id',
        'group-id',
        'settlement-id',
        {
          status: 'cancelled',
          version: 1,
        },
      );

      expect(mockSettlement.status).toBe('cancelled');
      expect(result).toBeDefined();
    });
  });
});
