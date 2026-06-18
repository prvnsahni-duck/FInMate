import { BadRequestException, ForbiddenException, NotFoundException, PreconditionFailedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import { Attachment, AuditLog, Expense, ExpenseSplit, Group, GroupMember, User } from '@finmate/data-models';
import { Repository } from 'typeorm';
import { ExpensesService } from './expenses.service';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let expenseRepository: jest.Mocked<Repository<Expense>>;
  let splitRepository: jest.Mocked<Repository<ExpenseSplit>>;
  let groupRepository: jest.Mocked<Repository<Group>>;
  let groupMemberRepository: jest.Mocked<Repository<GroupMember>>;
  let userRepository: jest.Mocked<Repository<User>>;
  let attachmentRepository: jest.Mocked<Repository<Attachment>>;

  beforeEach(async () => {
    const mockExpenseRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn((data) => data),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
      softRemove: jest.fn((data) => Promise.resolve(data)),
      restore: jest.fn(() => Promise.resolve()),
    };

    const mockSplitRepository = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((data) => data),
      delete: jest.fn(),
    };

    const mockGroupRepository = {
      findOne: jest.fn(),
    };

    const mockGroupMemberRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockUserRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
    };

    const mockAttachmentRepository = {
      find: jest.fn(),
      save: jest.fn(),
      create: jest.fn((data) => data),
      delete: jest.fn(),
    };

    const mockAuditLogRepository = {
      save: jest.fn(),
      create: jest.fn((data) => data),
    };

    const mockContributionRepository = {
      createQueryBuilder: jest.fn(() => ({
        innerJoinAndSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      })),
    };

    const mockEntityManager = {
      getRepository: jest.fn((entity) => {
        if (entity === Expense) return mockExpenseRepository;
        if (entity === ExpenseSplit) return mockSplitRepository;
        if (entity === Group) return mockGroupRepository;
        if (entity === GroupMember) return mockGroupMemberRepository;
        if (entity === User) return mockUserRepository;
        if (entity === Attachment) return mockAttachmentRepository;
        if (entity === AuditLog) return mockAuditLogRepository;
        if (entity && (entity.name === 'GroupMemberContribution' || (typeof entity === 'function' && entity.name === 'GroupMemberContribution'))) {
          return mockContributionRepository;
        }
      }),
    };

    const mockDataSource = {
      transaction: jest.fn(async (cb) => await cb(mockEntityManager)),
      getRepository: jest.fn((entity) => mockEntityManager.getRepository(entity)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: getRepositoryToken(Expense), useValue: mockExpenseRepository },
        { provide: getRepositoryToken(ExpenseSplit), useValue: mockSplitRepository },
        { provide: getRepositoryToken(Group), useValue: mockGroupRepository },
        { provide: getRepositoryToken(GroupMember), useValue: mockGroupMemberRepository },
        { provide: getRepositoryToken(User), useValue: mockUserRepository },
        { provide: getRepositoryToken(Attachment), useValue: mockAttachmentRepository },
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditLogRepository },
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    expenseRepository = module.get(getRepositoryToken(Expense));
    splitRepository = module.get(getRepositoryToken(ExpenseSplit));
    groupRepository = module.get(getRepositoryToken(Group));
    groupMemberRepository = module.get(getRepositoryToken(GroupMember));
    userRepository = module.get(getRepositoryToken(User));
    attachmentRepository = module.get(getRepositoryToken(Attachment));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should reject personal expense if paidByUserId is not caller', async () => {
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'caller-id' } as any)
      .mockResolvedValueOnce({ id: 'other-id' } as any);

    await expect(
      service.createExpense('caller-id', {
        title: 'Lunch',
        amountTotal: 100,
        currency: 'usd',
        category: 'Food',
        paidByUserId: 'other-id',
        expenseDate: '2026-06-10',
        splits: [{ participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 }],
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject group write for viewer role', async () => {
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'caller-id' } as any)
      .mockResolvedValueOnce({ id: 'caller-id' } as any);

    groupMemberRepository.findOne.mockResolvedValueOnce({
      id: 'membership-id',
      role: 'viewer',
      joinStatus: 'active',
    } as any);

    await expect(
      service.createExpense('caller-id', {
        title: 'Trip stay',
        amountTotal: 100,
        currency: 'INR',
        category: 'Accommodation',
        paidByUserId: 'caller-id',
        groupId: 'group-id',
        expenseDate: '2026-06-10',
        splits: [{ participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 }],
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject personal create with participantGroupMemberId', async () => {
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'caller-id' } as any)
      .mockResolvedValueOnce({ id: 'caller-id' } as any);

    await expect(
      service.createExpense('caller-id', {
        title: 'Lunch',
        amountTotal: 100,
        currency: 'USD',
        category: 'Food',
        paidByUserId: 'caller-id',
        expenseDate: '2026-06-10',
        splits: [{ participantGroupMemberId: 'member-1', splitType: 'equal', shareValue: 1 }],
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject create when group is archived', async () => {
    userRepository.findOne
      .mockResolvedValueOnce({ id: 'caller-id' } as any)
      .mockResolvedValueOnce({ id: 'caller-id' } as any);

    groupMemberRepository.findOne.mockResolvedValueOnce({
      id: 'membership-id',
      role: 'member',
      joinStatus: 'active',
    } as any);
    groupRepository.findOne.mockResolvedValueOnce({ id: 'group-id', isArchived: true } as any);

    await expect(
      service.createExpense('caller-id', {
        title: 'Trip stay',
        amountTotal: 100,
        currency: 'INR',
        category: 'Accommodation',
        paidByUserId: 'caller-id',
        groupId: 'group-id',
        expenseDate: '2026-06-10',
        splits: [{ participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 }],
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should throw precondition failed on version conflict', async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: 'exp-1',
      version: 2,
      group: null,
      ownerUser: { id: 'caller-id' },
      paidByUser: { id: 'caller-id' },
    } as any);

    await expect(
      service.updateExpense('caller-id', 'exp-1', {
        version: 1,
      } as any),
    ).rejects.toThrow(PreconditionFailedException);
  });

  it('should throw not found for unknown expense', async () => {
    expenseRepository.findOne.mockResolvedValue(null);

    await expect(service.getExpenseById('caller-id', 'missing')).rejects.toThrow(NotFoundException);
  });

  it('should require splits when amount changes on update', async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: 'exp-1',
      version: 1,
      title: 'Lunch',
      description: null,
      amountTotal: 50,
      currency: 'USD',
      category: 'Food',
      paidByUser: { id: 'caller-id' },
      ownerUser: { id: 'caller-id' },
      expenseDate: '2026-06-10',
      status: 'posted',
      group: null,
    } as any);

    await expect(
      service.updateExpense('caller-id', 'exp-1', {
        version: 1,
        amountTotal: 55,
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject personal update when paidByUserId is not caller', async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: 'exp-1',
      version: 1,
      title: 'Lunch',
      description: null,
      amountTotal: 50,
      currency: 'USD',
      category: 'Food',
      paidByUser: { id: 'caller-id' },
      ownerUser: { id: 'caller-id' },
      expenseDate: '2026-06-10',
      status: 'posted',
      group: null,
    } as any);
    userRepository.findOne.mockResolvedValue({ id: 'other-user' } as any);

    await expect(
      service.updateExpense('caller-id', 'exp-1', {
        version: 1,
        paidByUserId: 'other-user',
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject group update when new payer is not group member', async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: 'exp-1',
      version: 1,
      title: 'Trip',
      description: null,
      amountTotal: 50,
      currency: 'USD',
      category: 'Travel',
      paidByUser: { id: 'caller-id' },
      ownerUser: { id: 'caller-id' },
      expenseDate: '2026-06-10',
      status: 'posted',
      group: { id: 'group-id' },
    } as any);
    groupMemberRepository.findOne
      .mockResolvedValueOnce({
        id: 'membership-id',
        role: 'member',
        joinStatus: 'active',
      } as any)
      .mockResolvedValueOnce(null);
    groupRepository.findOne.mockResolvedValue({ id: 'group-id', isArchived: false } as any);
    userRepository.findOne.mockResolvedValue({ id: 'other-user' } as any);

    await expect(
      service.updateExpense('caller-id', 'exp-1', {
        version: 1,
        paidByUserId: 'other-user',
      } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('should void posted expense on delete', async () => {
    const expense = {
      id: 'exp-1',
      status: 'posted',
      group: null,
      ownerUser: { id: 'caller-id' },
      paidByUser: { id: 'caller-id' },
    } as any;

    expenseRepository.findOne.mockResolvedValue(expense);
    expenseRepository.softRemove.mockResolvedValue(expense);

    await service.deleteExpense('caller-id', 'exp-1');

    expect(expense.status).toBe('void');
    expect(expenseRepository.softRemove).toHaveBeenCalledWith(expense);
  });

  it('should hard delete draft expense on delete', async () => {
    expenseRepository.findOne.mockResolvedValue({
      id: 'exp-1',
      status: 'draft',
      group: null,
      ownerUser: { id: 'caller-id' },
      paidByUser: { id: 'caller-id' },
    } as any);

    await service.deleteExpense('caller-id', 'exp-1');

    expect(expenseRepository.delete).toHaveBeenCalledWith({ id: 'exp-1' });
  });

  it('should build paginated list for caller', async () => {
    groupMemberRepository.find.mockResolvedValue([] as any);

    const queryBuilder = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(1),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([
        {
          id: 'exp-1',
          title: 'Lunch',
          description: null,
          amountTotal: 50,
          currency: 'USD',
          category: 'Food',
          paidByUser: { id: 'caller-id' },
          ownerUser: { id: 'caller-id' },
          group: null,
          expenseDate: '2026-06-10',
          status: 'posted',
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]),
    };

    expenseRepository.createQueryBuilder.mockReturnValue(queryBuilder as any);
    splitRepository.find.mockResolvedValue([] as any);
    attachmentRepository.find.mockResolvedValue([] as any);

    const result = await service.listExpenses('caller-id', {
      page: 1,
      limit: 20,
      category: 'Food',
    });

    expect(result.meta.totalItems).toBe(1);
    expect(result.data).toHaveLength(1);
  });

  it('should reject list request with invalid date format', async () => {
    await expect(
      service.listExpenses('caller-id', {
        page: 1,
        limit: 20,
        startDate: '06-10-2026',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject list request for unauthorized group filter', async () => {
    groupMemberRepository.find.mockResolvedValue([] as any);

    await expect(
      service.listExpenses('caller-id', {
        page: 1,
        limit: 20,
        groupId: 'group-id',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── Phase 5: Additional Unit Tests ────────────────────────────────────────

  describe('Phase 5 Verification Rules', () => {
    it('should reject createExpense when currency does not match group base currency', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ id: 'caller-id' } as any)
        .mockResolvedValueOnce({ id: 'caller-id' } as any);
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'membership-id',
        role: 'member',
        joinStatus: 'active',
      } as any);
      groupRepository.findOne.mockResolvedValueOnce({
        id: 'group-id',
        currency: 'EUR',
        isArchived: false,
      } as any);

      await expect(
        service.createExpense('caller-id', {
          title: 'Lunch',
          amountTotal: 100,
          currency: 'USD', // Mismatch
          category: 'Food',
          paidByUserId: 'caller-id',
          groupId: 'group-id',
          expenseDate: '2026-06-10',
          splits: [{ participantUserId: 'caller-id', splitType: 'equal', shareValue: 1 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject createExpense splits containing a spectator', async () => {
      userRepository.findOne
        .mockResolvedValueOnce({ id: 'caller-id' } as any)
        .mockResolvedValueOnce({ id: 'caller-id' } as any);
      groupMemberRepository.findOne.mockResolvedValueOnce({
        id: 'membership-id',
        role: 'member',
        joinStatus: 'active',
      } as any);
      groupRepository.findOne.mockResolvedValueOnce({
        id: 'group-id',
        currency: 'USD',
        isArchived: false,
      } as any);

      // In persistSplits, buildGroupParticipantMaps is called inside transaction
      // Mock the find method on GroupMember repository inside transaction
      // Set one of the splits to belong to a spectator
      const mockSpectatorMember = {
        id: 'spectator-member-id',
        role: 'spectator',
        joinStatus: 'active',
        user: { id: 'spectator-id' },
      };

      const mockGroupMemberRepositoryFind = groupMemberRepository.find as jest.Mock;
      mockGroupMemberRepositoryFind.mockResolvedValueOnce([mockSpectatorMember]);

      await expect(
        service.createExpense('caller-id', {
          title: 'Lunch',
          amountTotal: 100,
          currency: 'USD',
          category: 'Food',
          paidByUserId: 'caller-id',
          groupId: 'group-id',
          expenseDate: '2026-06-10',
          splits: [{ participantUserId: 'spectator-id', splitType: 'equal', shareValue: 1 }],
        } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject updateExpense on a household group if ledger month is locked', async () => {
      expenseRepository.findOne.mockResolvedValue({
        id: 'exp-1',
        version: 1,
        title: 'Past Rent',
        amountTotal: 500,
        currency: 'USD',
        category: 'Housing',
        paidByUser: { id: 'caller-id' },
        ownerUser: { id: 'caller-id' },
        expenseDate: '2026-05-10',
        ledgerMonth: '2026-05', // Past month (June 2026 is current)
        status: 'posted',
        group: { id: 'group-id' },
      } as any);

      groupMemberRepository.findOne.mockResolvedValue({
        id: 'membership-id',
        role: 'member',
        joinStatus: 'active',
      } as any);

      groupRepository.findOne.mockResolvedValue({
        id: 'group-id',
        groupType: 'household',
        currency: 'USD',
        isArchived: false,
      } as any);

      await expect(
        service.updateExpense('caller-id', 'exp-1', {
          version: 1,
          title: 'Updated Rent',
        } as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should calculate carry forward balances correctly for a household group', async () => {
      groupMemberRepository.findOne.mockResolvedValue({
        id: 'membership-id',
        role: 'member',
        joinStatus: 'active',
      } as any);
      groupRepository.findOne.mockResolvedValue({
        id: 'group-id',
        groupType: 'household',
        currency: 'USD',
      } as any);

      groupMemberRepository.find.mockResolvedValue([
        { id: 'member-a', user: { id: 'user-a', displayName: 'User A' }, joinStatus: 'active' },
        { id: 'member-b', user: { id: 'user-b', displayName: 'User B' }, joinStatus: 'active' },
      ] as any);

      // Expenses in the group for 2026-06
      expenseRepository.find.mockResolvedValue([
        {
          id: 'exp-1',
          amountTotal: 150,
          currency: 'USD',
          paidByUser: { id: 'user-a', displayName: 'User A' },
          ownerUser: { id: 'user-a' },
        },
      ] as any);

      const balances = await service.getCarryForwardSummary('caller-id', 'group-id', '2026-06');
      
      // User A paid 150, owed 75 => net balance +75
      // User B paid 0, owed 75 => net balance -75
      const userABal = balances.find(b => b.userId === 'user-a');
      const userBBal = balances.find(b => b.userId === 'user-b');

      expect(userABal?.netBalance).toBe(75);
      expect(userBBal?.netBalance).toBe(-75);
    });

    it('should reject restoreExpense if restore window has expired', async () => {
      const pastDeletionDate = new Date();
      // Set to 2 months ago to be way outside grace period
      pastDeletionDate.setMonth(pastDeletionDate.getMonth() - 2);

      expenseRepository.findOne.mockResolvedValue({
        id: 'exp-1',
        title: 'Old Expense',
        deletedAt: pastDeletionDate,
        ownerUser: { id: 'caller-id' },
        paidByUser: { id: 'caller-id' },
        group: null,
      } as any);

      userRepository.findOne.mockResolvedValue({ id: 'caller-id' } as any);

      await expect(
        service.restoreExpense('caller-id', 'exp-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow restoreExpense if within restore window', async () => {
      const recentDeletionDate = new Date();
      // Set to current month, which is always inside restore window
      recentDeletionDate.setDate(1);

      const expense = {
        id: 'exp-1',
        title: 'Recent Expense',
        deletedAt: recentDeletionDate,
        ownerUser: { id: 'caller-id' },
        paidByUser: { id: 'caller-id' },
        group: null,
        status: 'void',
      } as any;

      expenseRepository.findOne.mockResolvedValue(expense);
      userRepository.findOne.mockResolvedValue({ id: 'caller-id' } as any);
      splitRepository.find.mockResolvedValue([]);
      attachmentRepository.find.mockResolvedValue([]);

      const result = await service.restoreExpense('caller-id', 'exp-1');

      expect(result.status).toBe('posted');
      expect(expenseRepository.restore).toHaveBeenCalledWith({ id: 'exp-1' });
    });
  });
});

