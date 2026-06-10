import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group, GroupMember, Expense, ExpenseSplit, Settlement } from '@finmate/data-models';
import { SettlementsService, MemberBalance } from './settlements.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('SettlementsService', () => {
  let service: SettlementsService;
  let groupRepository: jest.Mocked<Repository<Group>>;
  let groupMemberRepository: jest.Mocked<Repository<GroupMember>>;
  let expenseRepository: jest.Mocked<Repository<Expense>>;
  let expenseSplitRepository: jest.Mocked<Repository<ExpenseSplit>>;
  let settlementRepository: jest.Mocked<Repository<Settlement>>;

  beforeEach(async () => {
    const mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementsService,
        { provide: getRepositoryToken(Group), useValue: mockRepository },
        { provide: getRepositoryToken(GroupMember), useValue: mockRepository },
        { provide: getRepositoryToken(Expense), useValue: mockRepository },
        { provide: getRepositoryToken(ExpenseSplit), useValue: mockRepository },
        { provide: getRepositoryToken(Settlement), useValue: mockRepository },
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

      await expect(service.calculateGroupBalances('user-id', 'group-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should compile balances and simplify debts across multiple currencies', async () => {
      // Setup members
      const userA = { id: 'aaaa', email: 'a@ex.com', displayName: 'User A' };
      const userB = { id: 'bbbb', email: 'b@ex.com', displayName: 'User B' };
      
      const mockMembers = [
        { user: userA, joinStatus: 'active' },
        { user: userB, joinStatus: 'active' },
      ] as any[];
      
      groupMemberRepository.findOne.mockResolvedValueOnce({ id: 'caller-member' } as any);
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
        expect.objectContaining({ userId: 'aaaa', netBalance: 70.0, currency: 'USD' }),
      );
      expect(result.balances).toContainEqual(
        expect.objectContaining({ userId: 'bbbb', netBalance: -70.0, currency: 'USD' }),
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
});
